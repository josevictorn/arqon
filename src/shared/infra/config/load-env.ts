import { existsSync } from "node:fs";
import { type Either, left, right } from "@/shared/core/logic/either";
import { type Env, envSchema } from "./env.schema";

/** One invalid key. Never carries the received value: it may be a secret. */
export interface EnvValidationIssue {
  readonly key: string;
  readonly message: string;
}

export const DEFAULT_ENV_FILE = ".env";

/** Canonical event of the `fatal` line written when the env is invalid (ADR-0013). */
export const ENV_INVALID_EVENT = "app.bootstrap.env_invalid";

/** Pure validation of an env source: no file access, no `process` mutation. */
export const parseEnv = (
  source: NodeJS.ProcessEnv
): Either<EnvValidationIssue[], Env> => {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return right(result.data);
  }
  return left(
    result.error.issues.map((issue) => ({
      key: issue.path.length > 0 ? String(issue.path[0]) : "(root)",
      message: issue.message,
    }))
  );
};

/**
 * Loads `path` into `process.env` when the file exists, without overwriting
 * variables already defined in the environment (environment > file).
 * Uses Node's native `process.loadEnvFile` (no `dotenv`).
 */
export const loadEnvFile = (path: string = DEFAULT_ENV_FILE): boolean => {
  if (!existsSync(path)) {
    return false;
  }
  process.loadEnvFile(path);
  return true;
};

/** Validates the current `process.env` (already merged with the `.env` file). */
export const parseProcessEnv = (): Either<EnvValidationIssue[], Env> =>
  parseEnv(process.env);

/** Boot entry point: `.env` file (if any) + validation of `process.env`. */
export const loadEnv = (
  path: string = DEFAULT_ENV_FILE
): Either<EnvValidationIssue[], Env> => {
  loadEnvFile(path);
  return parseProcessEnv();
};

/**
 * JSON `fatal` line for stderr. Written directly, without a logger: the Pino
 * logger (T3.08a) does not exist yet at this point of the boot.
 */
export const formatEnvInvalidLine = (
  issues: readonly EnvValidationIssue[]
): string =>
  `${JSON.stringify({ event: ENV_INVALID_EVENT, issues, level: "fatal" })}\n`;

/** Error thrown when Nest builds `EnvService` from an invalid env (keys only). */
export class InvalidEnvError extends Error {
  readonly issues: readonly EnvValidationIssue[];

  constructor(issues: readonly EnvValidationIssue[]) {
    const keys = [...new Set(issues.map(({ key }) => key))].join(", ");
    super(`Invalid environment variables: ${keys}`);
    this.name = "InvalidEnvError";
    this.issues = issues;
  }
}
