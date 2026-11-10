import type { Env } from "./env.schema";

/** `Env` as exposed by `EnvService`: frozen, arrays included. */
export type ReadonlyEnv = {
  readonly [K in keyof Env]: Env[K] extends readonly (infer T)[]
    ? readonly T[]
    : Env[K];
};

export class EnvService {
  private readonly env: ReadonlyEnv;

  constructor(env: Env) {
    this.env = Object.freeze({
      ...env,
      CORS_ORIGINS: Object.freeze([...env.CORS_ORIGINS]),
    });
  }

  get<K extends keyof ReadonlyEnv>(key: K): ReadonlyEnv[K] {
    return this.env[key];
  }
}
