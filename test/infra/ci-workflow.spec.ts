import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the CI contract (T1.07): every PR runs the same checks as the local
 * Definition of Done (docs/workflow.md). Removing a step here must be a
 * deliberate change, not an accident in a YAML diff.
 *
 * Plain-text parsing on purpose: no YAML dependency just for a guard.
 */

// Vitest runs from the repository root (where vitest.config.mts lives).
const ROOT = process.cwd();
const WORKFLOW = readFileSync(
  resolve(ROOT, ".github/workflows/ci.yml"),
  "utf8"
);
const DEPENDABOT = readFileSync(
  resolve(ROOT, ".github/dependabot.yml"),
  "utf8"
);

const JOBS_HEADER = /^jobs:\s*$/mu;
const JOB_START = /^ {2}(?=[a-z0-9-]+:\s*$)/mu;
const JOB_NAME = /^(?<name>[a-z0-9-]+):/u;
const PULL_REQUEST_TRIGGER = /^ {2}pull_request:/mu;
const CANCEL_IN_PROGRESS = /^ {2}cancel-in-progress:\s*true\s*$/mu;
const CONCURRENCY_GROUP = /^ {2}group:.*github\.event\.pull_request\.number/mu;
const READ_ONLY_CONTENTS = /^permissions:\s*\n\s+contents:\s*read\s*$/mu;
const NODE_FROM_NVMRC = /node-version-file:\s*\.nvmrc\s*$/mu;
const PNPM_CACHE = /cache:\s*pnpm\s*$/mu;
const FROZEN_INSTALL = /run:\s*pnpm install --frozen-lockfile\s*$/mu;
const TIMEOUT = /timeout-minutes:\s*\d+\s*$/mu;
const NEEDS_VERIFY = /needs:\s*verify\s*$/mu;
const runs = (command: string) =>
  new RegExp(`run:\\s*pnpm ${command}\\s*$`, "mu");

/** Splits the top-level `jobs:` block into `{ name -> body }`. */
const parseJobs = (workflow: string) => {
  const jobsBlock = workflow.split(JOBS_HEADER)[1] ?? "";
  return new Map(
    jobsBlock.split(JOB_START).flatMap((chunk) => {
      const jobName = JOB_NAME.exec(chunk)?.groups?.name;
      return jobName ? [[jobName, chunk] as const] : [];
    })
  );
};

const jobs = parseJobs(WORKFLOW);
const verify = jobs.get("verify") ?? "";
const integration = jobs.get("integration") ?? "";

describe(".github/workflows/ci.yml", () => {
  it("runs on every pull request", () => {
    expect(WORKFLOW).toMatch(PULL_REQUEST_TRIGGER);
  });

  it("cancels outdated runs of the same PR", () => {
    expect(WORKFLOW).toMatch(CONCURRENCY_GROUP);
    expect(WORKFLOW).toMatch(CANCEL_IN_PROGRESS);
  });

  it("uses a read-only token", () => {
    expect(WORKFLOW).toMatch(READ_ONLY_CONTENTS);
  });

  it("declares the verify and integration jobs", () => {
    expect([...jobs.keys()]).toEqual(["verify", "integration"]);
  });

  it.each([
    ["verify", verify],
    ["integration", integration],
  ])("%s mirrors the local toolchain", (_job, body) => {
    expect(body).toMatch(NODE_FROM_NVMRC);
    expect(body).toMatch(PNPM_CACHE);
    expect(body).toMatch(FROZEN_INSTALL);
    expect(body).toMatch(TIMEOUT);
  });

  it("verify runs the full local gate (lint, typecheck, arch, unit)", () => {
    expect(verify).toMatch(runs("verify"));
  });

  it("integration runs after verify against the compose `core` profile", () => {
    expect(integration).toMatch(NEEDS_VERIFY);
    expect(integration).toMatch(runs("infra:up"));
    expect(integration).toMatch(runs("test:int"));
    expect(integration).toMatch(runs("test:e2e"));
  });
});

describe(".github/dependabot.yml", () => {
  it.each(["npm", "github-actions", "docker-compose"])(
    "groups %s updates",
    (ecosystem) => {
      expect(DEPENDABOT).toContain(`package-ecosystem: ${ecosystem}`);
      expect(DEPENDABOT).toMatch(
        new RegExp(`^ {6}${ecosystem}:\\s*\\n\\s+patterns:`, "mu")
      );
    }
  );
});
