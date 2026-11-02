import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the agent instructions (T1.08): every command an AGENTS.md tells an
 * agent to run must exist, and nested AGENTS.md files stay short enough to be
 * read in full every time (ADR-0002).
 */

// Vitest runs from the repository root (where vitest.config.mts lives).
const ROOT = process.cwd();
const NESTED_DIRS = [
  "src/shared/core",
  "src/modules",
  "src/integrations",
  "test",
];
const AGENT_FILES = [
  "AGENTS.md",
  ...NESTED_DIRS.map((dir) => `${dir}/AGENTS.md`),
];
const MAX_NESTED_LINES = 30;

// pnpm built-ins and binaries invoked through `pnpm <bin>` (not scripts).
const PNPM_BUILTINS = new Set(["install", "exec"]);
const PNPM_BINARIES = new Set(["lefthook"]);

const INLINE_CODE = /`[^`\n]+`/gu;
const PNPM_COMMAND = /\bpnpm (?<command>[a-z][\w:-]*)/gu;

const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const packageJson = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** Every `pnpm <command>` that appears inside inline code in a markdown file. */
const pnpmCommandsIn = (markdown: string) =>
  [...markdown.matchAll(INLINE_CODE)].flatMap(([code]) =>
    [...code.matchAll(PNPM_COMMAND)].flatMap((match) =>
      match.groups?.command ? [match.groups.command] : []
    )
  );

const countLines = (text: string) => text.trimEnd().split("\n").length;

describe("AGENTS.md commands", () => {
  it.each(AGENT_FILES)("%s cites only existing pnpm commands", (file) => {
    const unknown = pnpmCommandsIn(read(file)).filter(
      (command) =>
        !(
          PNPM_BUILTINS.has(command) ||
          command in packageJson.scripts ||
          (PNPM_BINARIES.has(command) && command in packageJson.devDependencies)
        )
    );

    expect(unknown).toEqual([]);
  });

  it("documents the real command table in the root file", () => {
    const cited = new Set(pnpmCommandsIn(read("AGENTS.md")));

    for (const script of [
      "verify",
      "lint",
      "typecheck",
      "arch:check",
      "test:unit",
      "test:int",
      "test:e2e",
      "infra:up",
    ]) {
      expect(cited).toContain(script);
    }
  });
});

describe("nested AGENTS.md", () => {
  it.each(NESTED_DIRS)(
    `%s/AGENTS.md has at most ${MAX_NESTED_LINES} lines`,
    (dir) => {
      expect(countLines(read(`${dir}/AGENTS.md`))).toBeLessThanOrEqual(
        MAX_NESTED_LINES
      );
    }
  );

  it.each(["", ...NESTED_DIRS])(
    "%s exposes CLAUDE.md and GEMINI.md as symlinks to AGENTS.md",
    (dir) => {
      for (const alias of ["CLAUDE.md", "GEMINI.md"]) {
        const path = resolve(ROOT, dir, alias);

        expect(lstatSync(path).isSymbolicLink()).toBe(true);
        expect(readlinkSync(path)).toBe("AGENTS.md");
      }
    }
  );
});
