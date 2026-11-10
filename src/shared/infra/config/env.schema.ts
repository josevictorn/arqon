import { z } from "zod";

export const NODE_ENVS = ["development", "test", "production"] as const;
export const LOG_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

/** ADR-0013 §4.2: `info` in prod, `debug` in dev, `silent` in test. */
const DEFAULT_LOG_LEVEL: Readonly<Record<NodeEnv, LogLevel>> = {
  development: "debug",
  production: "info",
  test: "silent",
};

const DEFAULT_PORT = 3000;
const MAX_PORT = 65_535;
const DEFAULT_LOG_SLOW_THRESHOLD_MS = 500;

/** Kebab-case project slug (ADR-0012), e.g. `acme-cloud`. */
const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/u;
const HTTP_PROTOCOL = /^https?$/u;
const POSTGRES_PROTOCOL = /^postgres(?:ql)?$/u;
const REDIS_PROTOCOL = /^rediss?$/u;
/**
 * Prefix check instead of `z.url()`: the WHATWG URL parser rejects valid
 * multi-host replica set URIs such as `mongodb://h1:27017,h2:27017/db`.
 */
const MONGODB_URI_PATTERN = /^mongodb(?:\+srv)?:\/\/\S+$/u;

/** `"a, b,,c"` → `["a", "b", "c"]`, each item validated by `item`. */
const commaSeparated = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
    .pipe(z.array(item));

export const envSchema = z
  .object({
    APP_NAME: z.string().trim().min(1),
    APP_SLUG: z.string().regex(SLUG_PATTERN),
    CORS_ORIGINS: commaSeparated(z.url({ protocol: HTTP_PROTOCOL })),
    DATABASE_URL: z.url({ protocol: POSTGRES_PROTOCOL }),
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
    LOG_READ_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
    LOG_SLOW_THRESHOLD_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_LOG_SLOW_THRESHOLD_MS),
    MONGODB_URI: z.string().regex(MONGODB_URI_PATTERN),
    NODE_ENV: z.enum(NODE_ENVS).default("development"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.url({ protocol: HTTP_PROTOCOL }),
    OTEL_SERVICE_NAME: z.string().trim().min(1).optional(),
    PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_PORT),
    REDIS_URL: z.url({ protocol: REDIS_PROTOCOL }),
  })
  .transform(({ LOG_LEVEL, OTEL_SERVICE_NAME, ...env }) => ({
    ...env,
    LOG_LEVEL: LOG_LEVEL ?? DEFAULT_LOG_LEVEL[env.NODE_ENV],
    OTEL_SERVICE_NAME: OTEL_SERVICE_NAME ?? `${env.APP_SLUG}-api`,
  }));

export type Env = z.infer<typeof envSchema>;
