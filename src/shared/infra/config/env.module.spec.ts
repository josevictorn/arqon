import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvModule } from "./env.module";
import { EnvService } from "./env.service";
import { InvalidEnvError } from "./load-env";

const VALID = {
  APP_NAME: "Acme Cloud",
  APP_SLUG: "acme-cloud",
  CORS_ORIGINS: "http://a.test,http://b.test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/acme",
  LOG_LEVEL: "silent",
  MONGODB_URI: "mongodb://localhost:27017/acme",
  NODE_ENV: "test",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
  PORT: "4100",
  REDIS_URL: "redis://localhost:6379",
} as const;

const stubEnv = (env: Record<string, string>) => {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
};

/** Proves `@Global()`: a module that does not import `EnvModule` gets `EnvService`. */
@Injectable()
class PortReader {
  constructor(private readonly env: EnvService) {}

  port(): number {
    return this.env.get("PORT");
  }
}

@Module({ exports: [PortReader], providers: [PortReader] })
class FeatureModule {}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("EnvService", () => {
  it("returns typed values", async () => {
    stubEnv(VALID);
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule],
    }).compile();
    const env = moduleRef.get(EnvService);

    expect(env.get("PORT")).toBe(4100);
    expect(env.get("CORS_ORIGINS")).toEqual(["http://a.test", "http://b.test"]);
    expect(env.get("OTEL_SERVICE_NAME")).toBe("acme-cloud-api");
  });

  it("is frozen, arrays included", async () => {
    stubEnv(VALID);
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule],
    }).compile();
    const origins = moduleRef.get(EnvService).get("CORS_ORIGINS");

    expect(Object.isFrozen(origins)).toBe(true);
    expect(() => (origins as string[]).push("http://evil.test")).toThrow(
      TypeError
    );
  });
});

describe("EnvModule", () => {
  it("is global", async () => {
    stubEnv(VALID);
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule, FeatureModule],
    }).compile();

    expect(moduleRef.get(PortReader).port()).toBe(4100);
  });

  it("fails to build with the invalid keys only", async () => {
    stubEnv({ ...VALID, PORT: "abc", REDIS_URL: "memcached://secret-host" });

    const compile = Test.createTestingModule({
      imports: [EnvModule],
    }).compile();

    await expect(compile).rejects.toBeInstanceOf(InvalidEnvError);
    await expect(compile).rejects.toThrow(
      "Invalid environment variables: PORT, REDIS_URL"
    );
  });
});
