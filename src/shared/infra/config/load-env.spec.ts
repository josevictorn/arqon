import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv as parseDotEnv } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENV_INVALID_EVENT,
  type EnvValidationIssue,
  formatEnvInvalidLine,
  InvalidEnvError,
  loadEnv,
  loadEnvFile,
  parseEnv,
} from "./load-env";

// Vitest runs from the repository root (where vitest.config.mts lives).
const ENV_EXAMPLE = parseDotEnv(
  readFileSync(resolve(process.cwd(), ".env.example"), "utf8")
);

/**
 * `APP_SLUG` of `.env.example` with an uppercase first letter (an invalid slug),
 * built at runtime so `src/` never hardcodes the project name (ADR-0012).
 */
const exampleSlug = ENV_EXAMPLE.APP_SLUG ?? "";
const CAPITALIZED_SLUG = `${exampleSlug.charAt(0).toUpperCase()}${exampleSlug.slice(1)}`;

const VALID: NodeJS.ProcessEnv = {
  APP_NAME: "Acme Cloud",
  APP_SLUG: "acme-cloud",
  CORS_ORIGINS: "http://localhost:5173",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/acme",
  MONGODB_URI: "mongodb://localhost:27017/acme?replicaSet=rs0",
  NODE_ENV: "production",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
  REDIS_URL: "redis://localhost:6379",
};

const issuesOf = (source: NodeJS.ProcessEnv): EnvValidationIssue[] =>
  parseEnv(source).fold(
    (issues) => issues,
    () => []
  );

describe("parseEnv", () => {
  it("accepts .env.example", () => {
    const result = parseEnv(ENV_EXAMPLE);

    expect(result.isRight()).toBe(true);
    expect(result.value).toMatchObject({
      LOG_LEVEL: "info",
      LOG_READ_SAMPLE_RATE: 1,
      LOG_SLOW_THRESHOLD_MS: 500,
      NODE_ENV: "development",
      PORT: 3000,
    });
  });

  it.each([
    ["PORT", "abc"],
    ["PORT", "70000"],
    ["APP_SLUG", CAPITALIZED_SLUG],
    ["DATABASE_URL", "mysql://x"],
    ["MONGODB_URI", "postgresql://x"],
    ["REDIS_URL", "memcached://x"],
    ["LOG_READ_SAMPLE_RATE", "2"],
    ["LOG_SLOW_THRESHOLD_MS", "-5"],
    ["LOG_LEVEL", "verbose"],
    ["NODE_ENV", "staging"],
    ["CORS_ORIGINS", "http://ok.test,ftp://nope.test"],
    ["OTEL_EXPORTER_OTLP_ENDPOINT", "not-a-url"],
  ])("rejects %s=%s naming the key, never the value", (key, value) => {
    const issues = issuesOf({ ...ENV_EXAMPLE, [key]: value });

    expect(issues.map((issue) => issue.key)).toEqual([key]);
    expect(JSON.stringify(issues)).not.toContain(value);
  });

  it("lists every missing required key", () => {
    const issues = issuesOf({});

    expect(issues.map((issue) => issue.key).sort()).toEqual([
      "APP_NAME",
      "APP_SLUG",
      "CORS_ORIGINS",
      "DATABASE_URL",
      "MONGODB_URI",
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "REDIS_URL",
    ]);
  });

  it("splits and trims CORS_ORIGINS", () => {
    const result = parseEnv({
      ...VALID,
      CORS_ORIGINS: "http://a.test, http://b.test,",
    });

    expect(result.isRight() && result.value.CORS_ORIGINS).toEqual([
      "http://a.test",
      "http://b.test",
    ]);
  });

  it("applies defaults and derives OTEL_SERVICE_NAME from APP_SLUG", () => {
    const result = parseEnv(VALID);

    expect(result.value).toEqual({
      APP_NAME: "Acme Cloud",
      APP_SLUG: "acme-cloud",
      CORS_ORIGINS: ["http://localhost:5173"],
      DATABASE_URL: "postgresql://user:pass@localhost:5432/acme",
      LOG_LEVEL: "info",
      LOG_READ_SAMPLE_RATE: 1,
      LOG_SLOW_THRESHOLD_MS: 500,
      MONGODB_URI: "mongodb://localhost:27017/acme?replicaSet=rs0",
      NODE_ENV: "production",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      OTEL_SERVICE_NAME: "acme-cloud-api",
      PORT: 3000,
      REDIS_URL: "redis://localhost:6379",
    });
  });

  it.each([
    ["development", "debug"],
    ["test", "silent"],
    ["production", "info"],
  ])("defaults LOG_LEVEL by NODE_ENV=%s to %s (ADR-0013)", (nodeEnv, level) => {
    const result = parseEnv({ ...VALID, NODE_ENV: nodeEnv });

    expect(result.isRight() && result.value.LOG_LEVEL).toBe(level);
  });

  it("defaults NODE_ENV to development", () => {
    const result = parseEnv({ ...VALID, NODE_ENV: undefined });

    expect(result.isRight() && result.value.NODE_ENV).toBe("development");
  });

  it("accepts the alternative URI schemes", () => {
    const result = parseEnv({
      ...VALID,
      DATABASE_URL: "postgres://user:pass@db.internal:5432/acme",
      MONGODB_URI: "mongodb+srv://user:pass@cluster0.example.net/acme",
      REDIS_URL: "rediss://cache.internal:6380",
    });

    expect(result.isRight()).toBe(true);
  });

  it("accepts a multi-host MongoDB replica set URI", () => {
    const result = parseEnv({
      ...VALID,
      MONGODB_URI: "mongodb://h1:27017,h2:27017/acme?replicaSet=rs0",
    });

    expect(result.isRight()).toBe(true);
  });

  it("reports a non-object source under (root)", () => {
    const issues = issuesOf(null as unknown as NodeJS.ProcessEnv);

    expect(issues.map((issue) => issue.key)).toEqual(["(root)"]);
  });

  it("drops variables outside the schema", () => {
    const result = parseEnv({ ...VALID, UNRELATED_SECRET: "s3cr3t" });

    expect(result.value).not.toHaveProperty("UNRELATED_SECRET");
  });
});

describe("loadEnvFile / loadEnv", () => {
  const dirs: string[] = [];
  const KEYS = ["T301_FROM_FILE", "T301_FROM_ENV"];

  const writeEnvFile = (content: string): string => {
    const dir = mkdtempSync(join(tmpdir(), "load-env-"));
    dirs.push(dir);
    const path = join(dir, ".env");
    writeFileSync(path, content);
    return path;
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const key of KEYS) {
      delete process.env[key];
    }
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("loads the file without overwriting the environment", () => {
    vi.stubEnv("T301_FROM_ENV", "environment");
    const path = writeEnvFile("T301_FROM_FILE=file\nT301_FROM_ENV=file\n");

    expect(loadEnvFile(path)).toBe(true);
    expect(process.env.T301_FROM_FILE).toBe("file");
    expect(process.env.T301_FROM_ENV).toBe("environment");
  });

  it("ignores a missing file", () => {
    expect(loadEnvFile(join(tmpdir(), "missing-dir-t301", ".env"))).toBe(false);
  });

  it("validates process.env after loading the file", () => {
    for (const [key, value] of Object.entries(VALID)) {
      vi.stubEnv(key, value);
    }
    const path = writeEnvFile("T301_FROM_FILE=file\n");

    const result = loadEnv(path);

    expect(result.isRight() && result.value.APP_SLUG).toBe("acme-cloud");
    expect(process.env.T301_FROM_FILE).toBe("file");
  });
});

describe("formatEnvInvalidLine", () => {
  it("writes one fatal JSON line with the issues", () => {
    const issues = [{ key: "PORT", message: "Invalid input" }];

    const line = formatEnvInvalidLine(issues);

    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual({
      event: ENV_INVALID_EVENT,
      issues,
      level: "fatal",
    });
  });
});

describe("InvalidEnvError", () => {
  it("names each invalid key once, without values", () => {
    const error = new InvalidEnvError([
      { key: "PORT", message: "Too small" },
      { key: "PORT", message: "Not an integer" },
      { key: "REDIS_URL", message: "Invalid URL" },
    ]);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InvalidEnvError");
    expect(error.message).toBe(
      "Invalid environment variables: PORT, REDIS_URL"
    );
    expect(error.issues).toHaveLength(3);
  });
});
