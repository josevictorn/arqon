import { readdirSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR-0024 boundaries, checked here instead of in `.dependency-cruiser.cjs`
 * (the targeted "Option C" of ADR-0010):
 * - nothing in `src/shared/core/**` imports `zod`;
 * - nothing in `src/**\/domain/**` imports `src/shared/contracts/events/**`.
 *
 * Imports are read from the source text (static, side-effect, re-export,
 * dynamic `import()` and `require()`), so a commented-out import is also
 * flagged: a false positive is safer than a miss.
 */

type Rule = "zod-in-core" | "domain-imports-event-contracts";

interface SourceFile {
  /** Repository-relative POSIX path, e.g. `src/shared/core/logic/either.ts`. */
  readonly content: string;
  readonly path: string;
}

interface Violation {
  readonly from: string;
  readonly rule: Rule;
  readonly specifier: string;
}

const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'](?<specifier>[^"']+)["']/gu;
const DOMAIN_DIR = /(?:^|\/)domain\//u;
const CORE_DIR = "src/shared/core/";
const EVENT_CONTRACTS_DIR = "src/shared/contracts/events";
const ALIASES: Record<string, string> = {
  "@/integrations/": "src/integrations/",
  "@/modules/": "src/modules/",
  "@/shared/": "src/shared/",
};

const importsOf = (content: string): string[] =>
  [...content.matchAll(IMPORT_SPECIFIER)].map(
    (match) => match.groups?.specifier ?? ""
  );

/** Repository-relative path of a local import, or the bare package specifier. */
const resolveSpecifier = (from: string, specifier: string): string => {
  if (specifier.startsWith(".")) {
    return posix.normalize(posix.join(posix.dirname(from), specifier));
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (specifier.startsWith(alias)) {
      return target + specifier.slice(alias.length);
    }
  }
  return specifier;
};

const isZod = (target: string): boolean =>
  target === "zod" || target.startsWith("zod/");

const isEventContract = (target: string): boolean =>
  target === EVENT_CONTRACTS_DIR ||
  target.startsWith(`${EVENT_CONTRACTS_DIR}/`);

const findZodBoundaryViolations = (files: readonly SourceFile[]): Violation[] =>
  files.flatMap(({ content, path }) =>
    importsOf(content).flatMap((specifier): Violation[] => {
      const target = resolveSpecifier(path, specifier);
      const violations: Violation[] = [];
      if (path.startsWith(CORE_DIR) && isZod(target)) {
        violations.push({ from: path, rule: "zod-in-core", specifier });
      }
      if (DOMAIN_DIR.test(path) && isEventContract(target)) {
        violations.push({
          from: path,
          rule: "domain-imports-event-contracts",
          specifier,
        });
      }
      return violations;
    })
  );

// Vitest runs from the repository root (where vitest.config.mts lives).
const ROOT = process.cwd();

const readSourceTree = (): SourceFile[] =>
  readdirSync(resolve(ROOT, "src"), { encoding: "utf8", recursive: true })
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => {
      const path = posix.join("src", entry.split("\\").join("/"));
      return { content: readFileSync(resolve(ROOT, path), "utf8"), path };
    });

const file = (path: string, ...lines: string[]): SourceFile => ({
  content: lines.join("\n"),
  path,
});

describe("Zod boundaries (ADR-0024)", () => {
  it("the real src/ tree has no violation", () => {
    const sources = readSourceTree();

    expect(sources.some((s) => s.path.startsWith(CORE_DIR))).toBe(true);
    expect(findZodBoundaryViolations(sources)).toEqual([]);
  });

  it("detects zod in src/shared/core in every import form", () => {
    const violations = findZodBoundaryViolations([
      file("src/shared/core/events/a.ts", 'import { z } from "zod";'),
      file("src/shared/core/logic/b.ts", "export * from 'zod/v4';"),
      file("src/shared/core/c.ts", 'import "zod";'),
      file("src/shared/core/domain/d.ts", 'const z = require("zod");'),
      file("src/shared/core/errors/e.ts", 'const z = await import("zod");'),
      file("src/shared/core/events/f.ts", "import {", "  z,", '} from "zod";'),
    ]);

    expect(violations.map((v) => [v.rule, v.from])).toEqual([
      ["zod-in-core", "src/shared/core/events/a.ts"],
      ["zod-in-core", "src/shared/core/logic/b.ts"],
      ["zod-in-core", "src/shared/core/c.ts"],
      ["zod-in-core", "src/shared/core/domain/d.ts"],
      ["zod-in-core", "src/shared/core/errors/e.ts"],
      ["zod-in-core", "src/shared/core/events/f.ts"],
    ]);
  });

  it("detects domain/ importing src/shared/contracts/events by alias or relative path", () => {
    const violations = findZodBoundaryViolations([
      file(
        "src/modules/alpha/domain/entities/invoice.ts",
        'import { invoicePaidV1 } from "@/shared/contracts/events/billing/invoice-paid.v1.event";'
      ),
      file(
        "src/modules/alpha/domain/invoice.ts",
        'import { defineIntegrationEventContract } from "../../../shared/contracts/events/define-integration-event-contract";'
      ),
      file(
        "src/shared/core/domain/x.ts",
        'export * from "../../contracts/events";'
      ),
    ]);

    expect(violations).toEqual([
      {
        from: "src/modules/alpha/domain/entities/invoice.ts",
        rule: "domain-imports-event-contracts",
        specifier: "@/shared/contracts/events/billing/invoice-paid.v1.event",
      },
      {
        from: "src/modules/alpha/domain/invoice.ts",
        rule: "domain-imports-event-contracts",
        specifier:
          "../../../shared/contracts/events/define-integration-event-contract",
      },
      {
        from: "src/shared/core/domain/x.ts",
        rule: "domain-imports-event-contracts",
        specifier: "../../contracts/events",
      },
    ]);
  });

  it("allows Zod and event contracts outside the protected folders", () => {
    const violations = findZodBoundaryViolations([
      file(
        "src/modules/alpha/application/commands/pay-invoice.command.ts",
        'import { z } from "zod";',
        'import { invoicePaidV1 } from "@/shared/contracts/events/billing/invoice-paid.v1.event";'
      ),
      file(
        "src/shared/contracts/events/define-integration-event-contract.ts",
        'import { z } from "zod";'
      ),
      file(
        "src/modules/alpha/domain/entities/invoice.ts",
        'import type { IntegrationEventEnvelope } from "@/shared/core/events/integration-event";',
        'import { BillingFacade } from "@/shared/contracts/facades/billing.facade";'
      ),
      file("src/shared/core/events/g.ts", 'import { zodiac } from "zodiac";'),
    ]);

    expect(violations).toEqual([]);
  });
});
