import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Proves every ADR-0010 rule in `.dependency-cruiser.cjs` actually fires.
 *
 * The fixtures under `./fixtures` mimic a `src/` tree with intentional violations
 * (and allowed imports that must stay clean). Running dependency-cruiser with
 * `cwd` inside the fixtures makes paths start with `src/`, so the production
 * config is used unchanged.
 */

// Vitest runs from the repository root (where vitest.config.mts lives).
const ROOT = process.cwd();
const FIXTURES = resolve(ROOT, "test/architecture/fixtures");
const CONFIG = resolve(ROOT, ".dependency-cruiser.cjs");
const DEPCRUISE = resolve(
  ROOT,
  "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs"
);

const RULES = [
  "domain-pure",
  "application-no-infra",
  "no-cross-module",
  "core-framework-free",
  "integrations-isolated",
  "no-circular",
] as const;

type RuleName = (typeof RULES)[number];

const ALPHA = "src/modules/alpha";
const DOMAIN_FW = `${ALPHA}/domain/entities/framework-coupled.entity.ts`;
const DOMAIN_DRIVERS = `${ALPHA}/domain/entities/driver-coupled.entity.ts`;
const DOMAIN_LAYERS = `${ALPHA}/domain/entities/layer-coupled.entity.ts`;
const APP_DRIVERS = `${ALPHA}/application/use-cases/driver-coupled.use-case.ts`;
const APP_LAYERS = `${ALPHA}/application/use-cases/layer-coupled.use-case.ts`;
const USE_CASE = `${ALPHA}/application/use-cases/create-alpha.use-case.ts`;
const INFRA_REPO = `${ALPHA}/infra/persistence/prisma-alpha.repository.ts`;
const CONTROLLER = `${ALPHA}/presentation/http/alpha.controller.ts`;
const ALPHA_MODULE = `${ALPHA}/alpha.module.ts`;
const CORE_FW = "src/shared/core/framework-coupled.ts";

const DRIVERS = [
  "@confluentinc/kafka-javascript",
  "@prisma/client",
  "ioredis",
  "mongodb",
];

const EXPECTED_VIOLATIONS: [RuleName, string, string][] = [
  ["domain-pure", DOMAIN_FW, "@nestjs/common"],
  ["domain-pure", DOMAIN_FW, "zod"],
  ...DRIVERS.map((to): [RuleName, string, string] => [
    "domain-pure",
    DOMAIN_DRIVERS,
    to,
  ]),
  ["domain-pure", DOMAIN_LAYERS, USE_CASE],
  ["domain-pure", DOMAIN_LAYERS, INFRA_REPO],
  ["domain-pure", DOMAIN_LAYERS, CONTROLLER],

  ...DRIVERS.map((to): [RuleName, string, string] => [
    "application-no-infra",
    APP_DRIVERS,
    to,
  ]),
  ["application-no-infra", APP_LAYERS, INFRA_REPO],
  ["application-no-infra", APP_LAYERS, CONTROLLER],
  [
    "application-no-infra",
    APP_LAYERS,
    "src/shared/infra/database/prisma.service.ts",
  ],

  ["no-cross-module", ALPHA_MODULE, "src/modules/beta/beta.module.ts"],
  ["no-cross-module", ALPHA_MODULE, "src/modules/beta/domain/beta.entity.ts"],

  ["core-framework-free", CORE_FW, "@nestjs/common"],
  ["core-framework-free", CORE_FW, "fastify"],

  [
    "integrations-isolated",
    ALPHA_MODULE,
    "src/integrations/payment/providers/stripe/stripe-payment.adapter.ts",
  ],

  ["no-circular", "src/shared/core/cycle-a.ts", "src/shared/core/cycle-b.ts"],
];

interface Violation {
  from: string;
  rule: { name: string };
  to: string;
}

interface CruiseResult {
  summary: {
    ruleSetUsed: { forbidden: { comment?: string; name: string }[] };
    violations: Violation[];
  };
}

const runDepcruise = (outputType: "json" | "err-long"): string => {
  const result = spawnSync(
    process.execPath,
    [DEPCRUISE, "src", "--config", CONFIG, "--output-type", outputType],
    { cwd: FIXTURES, encoding: "utf8" }
  );
  if (result.error) {
    throw result.error;
  }
  return result.stdout;
};

/** `../../node_modules/.pnpm/x/node_modules/@nestjs/common/index.js` -> `@nestjs/common` */
const PACKAGE_IN_NODE_MODULES = /.*node_modules\/(?<name>(?:@[^/]+\/)?[^/]+)/u;

const toPackageName = (path: string): string =>
  PACKAGE_IN_NODE_MODULES.exec(path)?.groups?.name ?? path;

const key = ([rule, from, to]: [string, string, string]): string =>
  `${rule}: ${from} -> ${to}`;

describe("architecture rules (ADR-0010)", () => {
  let cruise: CruiseResult;

  beforeAll(() => {
    cruise = JSON.parse(runDepcruise("json")) as CruiseResult;
  });

  it("defines exactly the rules from the ADR-0010 table", () => {
    const names = cruise.summary.ruleSetUsed.forbidden.map((r) => r.name);
    expect(names.sort()).toEqual([...RULES].sort());
  });

  it("reports exactly the expected violations (no misses, no false positives)", () => {
    const actual = cruise.summary.violations
      .map((v) => key([v.rule.name, v.from, toPackageName(v.to)]))
      .sort();
    expect(actual).toEqual(EXPECTED_VIOLATIONS.map(key).sort());
  });

  it.each(RULES)("rule %s is triggered by at least one fixture", (rule) => {
    const hits = cruise.summary.violations.filter((v) => v.rule.name === rule);
    expect(hits.length).toBeGreaterThan(0);
  });

  it.each(RULES)("rule %s has a comment citing itself and ADR-0010", (rule) => {
    const definition = cruise.summary.ruleSetUsed.forbidden.find(
      (r) => r.name === rule
    );
    expect(definition?.comment).toContain(`${rule}:`);
    expect(definition?.comment).toContain("ADR-0010");
    expect(definition?.comment).toContain("Fix:");
  });

  it("prints the rule name and ADR-0010 in the err-long report", () => {
    const report = runDepcruise("err-long");
    for (const rule of RULES) {
      expect(report).toContain(`error ${rule}:`);
    }
    expect(report).toContain(
      "See ADR-0010 (docs/decisions/0010-enforcement-de-arquitetura.md)"
    );
  });
});
