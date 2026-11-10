import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Vitest runs from the repository root (where vitest.config.mts lives).
const ROOT = process.cwd();
const SWC = resolve(ROOT, "node_modules/.bin/swc");

const SECRET = "mysql://admin:t301-s3cr3t@db.internal/acme";

const VALID_ENV = {
  APP_NAME: "Acme Cloud",
  APP_SLUG: "acme-cloud",
  CORS_ORIGINS: "http://localhost:5173",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/acme",
  MONGODB_URI: "mongodb://localhost:27017/acme",
  NODE_ENV: "test",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
  REDIS_URL: "redis://localhost:6379",
};

let buildDir = "";

beforeAll(() => {
  buildDir = mkdtempSync(join(tmpdir(), "bootstrap-env-"));
  execFileSync(
    SWC,
    [
      "src",
      "--out-dir",
      buildDir,
      "--config-file",
      ".swcrc",
      "--strip-leading-paths",
      "--ignore",
      "**/*.spec.ts,**/*.int-spec.ts",
    ],
    { cwd: ROOT, stdio: "pipe" }
  );
});

afterAll(() => {
  rmSync(buildDir, { force: true, recursive: true });
});

describe("bootstrap with an invalid env", () => {
  it("exits with code 1 and a fatal line naming only the key", () => {
    const result = spawnSync(process.execPath, ["main.js"], {
      cwd: buildDir,
      encoding: "utf8",
      env: {
        ...VALID_ENV,
        DATABASE_URL: SECRET,
        NODE_PATH: resolve(ROOT, "node_modules"),
      },
      timeout: 10_000,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("app.bootstrap.env_invalid");
    expect(result.stderr).toContain("DATABASE_URL");
    expect(result.stderr).not.toContain(SECRET);
    expect(result.stderr).not.toContain("t301-s3cr3t");
    expect(JSON.parse(result.stderr)).toMatchObject({
      event: "app.bootstrap.env_invalid",
      issues: [{ key: "DATABASE_URL" }],
      level: "fatal",
    });
  });
});
