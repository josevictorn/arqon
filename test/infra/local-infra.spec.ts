import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the local infrastructure contract (T1.06):
 * - `.env.example` exposes every variable required by the ADRs and module specs;
 * - `docker-compose.yml` follows ADR-0011 (profiles + healthchecks),
 *   ADR-0012 (project-scoped names) and ADR-0021 (public, pinned images).
 *
 * Plain-text parsing on purpose: no YAML/dotenv dependency just for a guard.
 */

// Vitest runs from the repository root (where vitest.config.mts lives).
const ROOT = process.cwd();
const ENV_EXAMPLE = readFileSync(resolve(ROOT, ".env.example"), "utf8");
const COMPOSE = readFileSync(resolve(ROOT, "docker-compose.yml"), "utf8");

const ENV_LINE = /^(?<key>[A-Z][A-Z0-9_]*)=(?<value>.*)$/u;
const SERVICES_HEADER = /^services:\s*$/mu;
const NEXT_TOP_LEVEL_KEY = /^\S/mu;
const SERVICE_START = /^ {2}(?=[a-z0-9-]+:\s*$)/mu;
const SERVICE_NAME = /^(?<name>[a-z0-9-]+):/u;
const IMAGE = /^\s+image:\s*(?<image>\S+)$/mu;
const PROFILES_LINE = /^\s+profiles:\s*\[(?<profiles>.+)\]$/mu;
const HEALTHCHECK = /^\s+healthcheck:/mu;
const ONE_SHOT_RESTART = /^\s+restart:\s*["']?no["']?\s*$/mu;
const CONTAINER_NAME = /^\s+container_name:/mu;
// Any kebab-case fallback: `pnpm init:project` (T1.09) rewrites the default slug.
const PROJECT_NAME = /^name: \$\{APP_SLUG:-[a-z][a-z0-9-]*\}$/mu;
const EXACT_TAG = /:[\w.-]+$/u;
const LATEST_TAG = /:latest$/u;
const MINIO_IMAGE = /(?:^|\/)minio\//u;

const envEntries = ENV_EXAMPLE.split("\n").flatMap((line) => {
  const groups = ENV_LINE.exec(line.trim())?.groups;
  return groups ? [{ key: groups.key ?? "", value: groups.value ?? "" }] : [];
});

const envKeys = envEntries.map(({ key }) => key);

const envValue = (key: string) =>
  envEntries.find((entry) => entry.key === key)?.value;

const REQUIRED_ENV = {
  app: ["NODE_ENV", "PORT", "APP_NAME", "APP_SLUG", "CORS_ORIGINS"],
  billing: [
    "PAYMENT_DEFAULT_PROVIDER",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "ASAAS_API_KEY",
    "ASAAS_WEBHOOK_TOKEN",
    "ASAAS_BASE_URL",
  ],
  core: ["DATABASE_URL", "MONGODB_URI", "REDIS_URL"],
  iam: [
    "JWT_KEY_ID",
    "JWT_PRIVATE_KEY",
    "JWT_PUBLIC_KEY",
    "JWT_ACCESS_EXPIRES_IN",
    "JWT_REFRESH_EXPIRES_IN",
    "MFA_ENCRYPTION_KEY",
  ],
  mailStorage: [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_BUCKET",
    "SMTP_HOST",
    "SMTP_PORT",
    "MAIL_FROM",
  ],
  messaging: ["KAFKA_BROKERS", "SCHEMA_REGISTRY_URL"],
  observability: [
    "LOG_LEVEL",
    "LOG_READ_SAMPLE_RATE",
    "LOG_SLOW_THRESHOLD_MS",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "PERSONAL_SECURITY_LOG_RETENTION_DAYS",
  ],
} as const;

// Must never ship with a value: generated per project (ADR-0012 / ADR-0015)
// or provided by the developer (payment gateways).
const SECRETS = [
  "JWT_PRIVATE_KEY",
  "JWT_PUBLIC_KEY",
  "MFA_ENCRYPTION_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "ASAAS_API_KEY",
  "ASAAS_WEBHOOK_TOKEN",
] as const;

const PROFILES = ["core", "messaging", "mail-storage", "observability"];

/** Splits the top-level `services:` block into `{ name, body }` chunks. */
const parseServices = (compose: string) => {
  const servicesBlock = compose
    .split(SERVICES_HEADER)[1]
    ?.split(NEXT_TOP_LEVEL_KEY)[0];
  if (!servicesBlock) {
    return [];
  }
  return servicesBlock.split(SERVICE_START).flatMap((chunk) => {
    const serviceName = SERVICE_NAME.exec(chunk)?.groups?.name;
    return serviceName ? [{ body: chunk, serviceName }] : [];
  });
};

const services = parseServices(COMPOSE);
const serviceCases = services.map(
  ({ serviceName, body }) => [serviceName, body] as const
);

describe(".env.example", () => {
  it.each(Object.entries(REQUIRED_ENV))(
    "declares every %s variable",
    (_section, keys) => {
      expect(envKeys).toEqual(expect.arrayContaining([...keys]));
    }
  );

  it("has no duplicated keys", () => {
    const duplicates = envKeys.filter((key, i) => envKeys.indexOf(key) !== i);
    expect(duplicates).toEqual([]);
  });

  it.each(SECRETS)("ships %s empty (never a reusable secret)", (key) => {
    expect(envValue(key)).toBe("");
  });

  it("uses the ADR-0015 token lifetimes by default", () => {
    expect(envValue("JWT_ACCESS_EXPIRES_IN")).toBe("15m");
    expect(envValue("JWT_REFRESH_EXPIRES_IN")).toBe("7d");
  });
});

describe("docker-compose.yml", () => {
  it("is named after APP_SLUG (ADR-0012)", () => {
    expect(COMPOSE).toMatch(PROJECT_NAME);
  });

  it("never pins static container names (ADR-0012)", () => {
    expect(COMPOSE).not.toMatch(CONTAINER_NAME);
  });

  it("parses the expected services", () => {
    expect(services.map(({ serviceName }) => serviceName)).toEqual(
      expect.arrayContaining([
        "postgres",
        "mongodb",
        "redis",
        "redpanda",
        "mailpit",
        "rustfs",
        "otel-lgtm",
      ])
    );
  });

  it.each(serviceCases)(
    "%s uses a public, exactly pinned image (ADR-0021)",
    (_serviceName, body) => {
      const image = IMAGE.exec(body)?.groups?.image ?? "";
      expect(image).toMatch(EXACT_TAG);
      expect(image).not.toMatch(LATEST_TAG);
      expect(image).not.toMatch(MINIO_IMAGE);
    }
  );

  it.each(serviceCases)(
    "%s belongs to a profile and to `full` (ADR-0011)",
    (_serviceName, body) => {
      const profiles = PROFILES_LINE.exec(body)
        ?.groups?.profiles?.split(",")
        .map((profile) => profile.trim());
      expect(profiles).toContain("full");
      expect(profiles?.some((profile) => PROFILES.includes(profile))).toBe(
        true
      );
    }
  );

  it.each(serviceCases)(
    "%s declares a healthcheck (ADR-0011)",
    (_serviceName, body) => {
      expect(body).toMatch(HEALTHCHECK);
    }
  );

  // `docker compose up --wait` races with containers that exit quickly and may
  // fail with "container ... exited (0)". Bootstrap work (replica set, buckets)
  // lives in idempotent healthchecks instead.
  it.each(serviceCases)("%s is not a one-shot job", (_serviceName, body) => {
    expect(body).not.toMatch(ONE_SHOT_RESTART);
  });
});
