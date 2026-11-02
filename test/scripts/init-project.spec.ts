import { execFileSync, spawnSync } from "node:child_process";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * T1.09 / ADR-0012: runs the real `scripts/init-project.ts` (plain `node`,
 * like `pnpm init:project`) against a copy of the repository in os.tmpdir().
 * Keep FIXTURE_PATHS and RENAME_TARGETS in sync with the script.
 */

// Vitest runs from the repository root (where vitest.config.mts lives).
const ROOT = process.cwd();
const SCRIPT = "scripts/init-project.ts";

const FIXTURE_PATHS = [
  "package.json",
  ".env.example",
  "docker-compose.yml",
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".agents/skills",
  "scripts",
  "docs/roadmap",
  "docs/modules",
];
const RENAME_TARGETS = [
  "package.json",
  ".env.example",
  "docker-compose.yml",
  "README.md",
  "AGENTS.md",
  ".agents/skills/detail-task/SKILL.md",
  ".agents/skills/execute-roadmap-task/SKILL.md",
  ".agents/skills/write-adr/SKILL.md",
];
const PRESERVED = [
  "docs/roadmap/tasks/_template.md",
  ...readdirSync(resolve(ROOT, "docs/modules"), { recursive: true })
    .map(String)
    .filter((path) => path.endsWith(".md"))
    .map((path) => join("docs/modules", path)),
];

const MAX_DURATION_MS = 3000;
const UPSTREAM_IDENTITY = /arqon/iu;
const COMPOSE_PROJECT_NAME = /^name: \$\{APP_SLUG:-acme-cloud\}$/mu;
const BOILERPLATE_TASK = /^T.+\.md$/u;
const HEX_32_BYTES = /^[0-9a-f]{64}$/u;
const ENV_LINE = /^(?<key>[A-Z][A-Z0-9_]*)=(?<value>.*)$/u;

const fixtures: string[] = [];

const createFixture = () => {
  const dir = mkdtempSync(join(tmpdir(), "init-project-"));
  fixtures.push(dir);
  for (const path of FIXTURE_PATHS) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(ROOT, path), target, {
      recursive: true,
      verbatimSymlinks: true,
    });
  }
  return dir;
};

const runInit = (cwd: string, args: string[]) => {
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
  });
  return { ...result, durationMs: performance.now() - startedAt };
};

const read = (dir: string, path: string) =>
  readFileSync(join(dir, path), "utf8");

const readEnv = (dir: string) =>
  new Map(
    read(dir, ".env")
      .split("\n")
      .flatMap((line) => {
        const groups = ENV_LINE.exec(line)?.groups;
        return groups?.key ? [[groups.key, groups.value ?? ""] as const] : [];
      })
  );

const pemFromEnv = (value: string | undefined) =>
  Buffer.from(value ?? "", "base64").toString("utf8");

afterAll(() => {
  for (const dir of fixtures) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("pnpm init:project --name acme-cloud", () => {
  let dir: string;
  let originals: Map<string, string>;
  let result: ReturnType<typeof runInit>;

  beforeAll(() => {
    dir = createFixture();
    originals = new Map(PRESERVED.map((path) => [path, read(dir, path)]));
    // --force: the guards are covered below; this keeps the suite green in
    // projects derived from the boilerplate (already initialized).
    result = runInit(dir, ["--name", "acme-cloud", "--force"]);
  });

  it(`finishes without errors in under ${MAX_DURATION_MS}ms`, () => {
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.durationMs).toBeLessThan(MAX_DURATION_MS);
  });

  it("renames the project identity", () => {
    const packageJson = JSON.parse(read(dir, "package.json"));

    expect(packageJson).toMatchObject({ name: "acme-cloud", version: "0.1.0" });
    expect(read(dir, ".env.example")).toContain('APP_NAME="Acme Cloud"');
    expect(read(dir, ".env.example")).toContain("S3_BUCKET=acme-cloud-files");
    expect(read(dir, "docker-compose.yml")).toMatch(COMPOSE_PROJECT_NAME);
    expect(read(dir, "README.md").startsWith("# acme-cloud\n")).toBe(true);
  });

  it.each(RENAME_TARGETS)("leaves no upstream identity in %s", (path) => {
    expect(read(dir, path)).not.toMatch(UPSTREAM_IDENTITY);
  });

  it("keeps CLAUDE.md and GEMINI.md as symlinks to AGENTS.md", () => {
    for (const alias of ["CLAUDE.md", "GEMINI.md"]) {
      expect(lstatSync(join(dir, alias)).isSymbolicLink()).toBe(true);
    }
  });

  it("creates .env with APP_SLUG and a valid Ed25519 key pair (ADR-0015)", () => {
    const env = readEnv(dir);
    const privateKey = createPrivateKey(pemFromEnv(env.get("JWT_PRIVATE_KEY")));
    const publicKey = createPublicKey(pemFromEnv(env.get("JWT_PUBLIC_KEY")));
    const payload = Buffer.from("acme-cloud");
    const { crv, kty, x } = publicKey.export({ format: "jwk" });

    expect(env.get("APP_SLUG")).toBe("acme-cloud");
    expect(privateKey.asymmetricKeyType).toBe("ed25519");
    expect(publicKey.asymmetricKeyType).toBe("ed25519");
    expect(
      verify(null, payload, publicKey, sign(null, payload, privateKey))
    ).toBe(true);
    // kid = RFC 7638 JWK thumbprint of the public key.
    expect(env.get("JWT_KEY_ID")).toBe(
      createHash("sha256")
        .update(JSON.stringify({ crv, kty, x }))
        .digest("base64url")
    );
  });

  it("creates .env with a 32-byte hex MFA_ENCRYPTION_KEY", () => {
    expect(readEnv(dir).get("MFA_ENCRYPTION_KEY")).toMatch(HEX_32_BYTES);
  });

  it("generates unique secrets per project", () => {
    const other = createFixture();
    runInit(other, ["--name", "acme-cloud", "--force"]);

    for (const key of ["JWT_PRIVATE_KEY", "MFA_ENCRYPTION_KEY"]) {
      expect(readEnv(other).get(key)).not.toBe(readEnv(dir).get(key));
    }
  });

  it("replaces the roadmap and removes the boilerplate tasks", () => {
    const tasks = readdirSync(join(dir, "docs/roadmap/tasks"));
    const roadmap = read(dir, "docs/roadmap/ROADMAP.md");

    expect(tasks.filter((name) => BOILERPLATE_TASK.test(name))).toEqual([]);
    expect(tasks).toContain("_template.md");
    expect(roadmap.startsWith("# Roadmap — Acme Cloud\n")).toBe(true);
    expect(roadmap).not.toContain("{{");
  });

  it.each(PRESERVED)("keeps %s untouched", (path) => {
    expect(read(dir, path)).toBe(originals.get(path));
  });
});

describe("pnpm init:project safety", () => {
  it.each(["Acme", "acme_cloud", "acme-", "1acme", "a".repeat(51)])(
    "rejects the invalid slug %j without changing anything",
    (slug) => {
      const dir = createFixture();
      const before = read(dir, "package.json");
      const result = runInit(dir, ["--name", slug, "--force"]);

      expect(result.status).toBe(1);
      expect(read(dir, "package.json")).toBe(before);
      expect(existsSync(join(dir, ".env"))).toBe(false);
    }
  );

  it("refuses to run without --name outside a TTY", () => {
    const result = runInit(createFixture(), []);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--name");
  });

  it("refuses a repository whose remote is the upstream boilerplate unless --force", () => {
    const dir = createFixture();
    execFileSync("git", ["init", "--quiet"], { cwd: dir });
    execFileSync(
      "git",
      ["remote", "add", "origin", "git@github.com:josevictorn/arqon.git"],
      { cwd: dir }
    );

    const before = read(dir, "package.json");

    const refused = runInit(dir, ["--name", "acme-cloud"]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("--force");
    expect(read(dir, "package.json")).toBe(before);
    expect(existsSync(join(dir, ".env"))).toBe(false);

    expect(runInit(dir, ["--name", "acme-cloud", "--force"]).status).toBe(0);
  });

  it("refuses an already initialized project unless --force", () => {
    const dir = createFixture();
    runInit(dir, ["--name", "acme-cloud", "--force"]);
    const roadmap = read(dir, "docs/roadmap/ROADMAP.md");

    const refused = runInit(dir, ["--name", "beta-cloud"]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("already initialized");
    expect(read(dir, "docs/roadmap/ROADMAP.md")).toBe(roadmap);

    expect(runInit(dir, ["--name", "beta-cloud", "--force"]).status).toBe(0);
    expect(JSON.parse(read(dir, "package.json")).name).toBe("beta-cloud");
    expect(read(dir, ".env.example")).toContain("APP_SLUG=beta-cloud");
    expect(read(dir, ".env.example")).not.toContain("acme-cloud");
  });

  it("never overwrites an existing .env", () => {
    const dir = createFixture();
    writeFileSync(join(dir, ".env"), "KEEP=me\n");

    const result = runInit(dir, ["--name", "acme-cloud", "--force"]);

    expect(result.status).toBe(0);
    expect(read(dir, ".env")).toBe("KEEP=me\n");
  });
});
