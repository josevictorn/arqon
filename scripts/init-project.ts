/**
 * `pnpm init:project` — turns a clean copy of the boilerplate into a new
 * project (ADR-0012). Runs with plain `node` (native type stripping), so it
 * must stay dependency-free and use only erasable TypeScript syntax.
 *
 *   pnpm init:project                                  # interactive
 *   pnpm init:project --name acme-saas [--description "..."] [--force]
 *
 * Steps:
 *   1. Rename: replaces the current project identity (package name, APP_SLUG,
 *      APP_NAME) in RENAME_TARGETS and updates package.json.
 *   2. Bootstrap `.env` from `.env.example` with fresh secrets (ADR-0015):
 *      Ed25519 JWT key pair + `kid` and MFA_ENCRYPTION_KEY. An existing `.env`
 *      is never overwritten.
 *   3. Reset the roadmap: removes the boilerplate tasks and writes the clean
 *      roadmap from `scripts/templates/PROJECT_ROADMAP.md`.
 *
 * Maintenance (ADR-0012, rule 3): when a root config file starts carrying the
 * project slug, add it to RENAME_TARGETS and to test/scripts/init-project.spec.ts.
 */
import { execFileSync } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
} from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

/** Identity of the upstream repository; any other package name = derived project. */
const UPSTREAM_PACKAGE_NAME = "arqon-boilerplate";
// Upstream repository names: `arqon` (GitHub) and `arqon-boilerplate`.
const UPSTREAM_REMOTE = /[/:]arqon(?:-boilerplate)?(?:\.git)?\/?$/u;

const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
// Keeps `<slug>-files` (S3 bucket) and database names within 63 characters.
const MAX_SLUG_LENGTH = 50;
const INITIAL_VERSION = "0.1.0";

/** Files whose content carries the project identity (besides package.json). */
const RENAME_TARGETS = [
  ".env.example",
  "docker-compose.yml",
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
];
const SKILLS_DIR = ".agents/skills";

const ENV_EXAMPLE = ".env.example";
const ENV_FILE = ".env";
const ROADMAP_FILE = "docs/roadmap/ROADMAP.md";
const TASKS_DIR = "docs/roadmap/tasks";
const ROADMAP_TEMPLATE = "scripts/templates/PROJECT_ROADMAP.md";

const BOILERPLATE_TASK = /^T.+\.md$/u;
const ENV_LINE = /^(?<key>[A-Z][A-Z0-9_]*)=(?<value>.*)$/u;
const TEMPLATE_PLACEHOLDER = /\{\{(?<key>APP_NAME|APP_SLUG)\}\}/gu;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/gu;
const WORD_SEPARATOR = /-/u;
const WHITESPACE = /\s+/u;
const YES = /^y(?:es)?$/iu;

const HELP = `Usage: pnpm init:project [--name <slug>] [--description "<text>"] [--force]

Turns this copy of the boilerplate into a new project (ADR-0012):
renames it, creates .env with fresh secrets and resets the roadmap.

Options:
  --name <slug>         project slug in kebab-case (e.g. acme-saas)
  --description <text>  package.json / README description
  --force               skip the safety checks (upstream git remote,
                        project already initialized)
  -h, --help            show this help

Without --name it runs interactively (TTY only).
`;

class InitError extends Error {}

interface Identity {
  displayName: string;
  packageName: string;
  slug: string;
}

interface Options {
  description: string | undefined;
  force: boolean;
  slug: string;
}

type Ask = (question: string) => Promise<string>;

// ─── helpers ────────────────────────────────────────────────────────────────

const print = (line = "") => process.stdout.write(`${line}\n`);

const readText = (root: string, path: string) =>
  readFileSync(join(root, path), "utf8");

const validateSlug = (slug: string): string | undefined => {
  if (!SLUG_PATTERN.test(slug)) {
    return `"${slug}" is not kebab-case (lowercase letters, digits and single hyphens, starting with a letter).`;
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    return `"${slug}" is longer than ${MAX_SLUG_LENGTH} characters.`;
  }
};

const toDisplayName = (slug: string) =>
  slug
    .split(WORD_SEPARATOR)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const toConstantCase = (slug: string) =>
  slug.toUpperCase().replaceAll("-", "_");

const parseEnv = (text: string) => {
  const entries = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = ENV_LINE.exec(line);
    if (match?.groups?.key) {
      entries.set(match.groups.key, match.groups.value ?? "");
    }
  }
  return entries;
};

const unquote = (value: string) =>
  value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;

// ─── identity & guards ──────────────────────────────────────────────────────

const readPackageJson = (root: string) =>
  JSON.parse(readText(root, "package.json")) as Record<string, unknown>;

const readCurrentIdentity = (root: string): Identity => {
  const env = parseEnv(readText(root, ENV_EXAMPLE));
  const packageName = readPackageJson(root).name;
  const slug = env.get("APP_SLUG");
  const displayName = env.get("APP_NAME");

  if (typeof packageName !== "string" || !slug || !displayName) {
    throw new InitError(
      "Could not read the current identity: package.json `name` and APP_SLUG / APP_NAME in .env.example are required."
    );
  }
  return { displayName: unquote(displayName), packageName, slug };
};

/** Output of a git command, or "" when git is missing or `root` is no repo. */
const git = (root: string, args: string[]) => {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

/** Upstream remote URLs of the git repository rooted exactly at `root`. */
const upstreamRemotes = (root: string) => {
  const topLevel = git(root, ["rev-parse", "--show-toplevel"]);
  if (!topLevel || realpathSync(topLevel) !== realpathSync(root)) {
    return [];
  }
  const urls = git(root, ["remote", "-v"])
    .split("\n")
    .flatMap((line) => line.split(WHITESPACE)[1] ?? []);
  return [...new Set(urls)].filter((url) => UPSTREAM_REMOTE.test(url));
};

const safetyWarnings = (root: string, current: Identity) => {
  const warnings: string[] = [];
  const remotes = upstreamRemotes(root);

  if (remotes.length > 0) {
    warnings.push(
      `This is the upstream ${UPSTREAM_PACKAGE_NAME} repository (git remote ${remotes.join(", ")}). Initializing it would rewrite the boilerplate itself.`
    );
  }
  if (current.packageName !== UPSTREAM_PACKAGE_NAME) {
    warnings.push(
      `This project was already initialized as "${current.packageName}". Running again replaces docs/roadmap (including your tasks).`
    );
  }
  return warnings;
};

const enforceSafety = async (
  warnings: string[],
  force: boolean,
  ask: Ask | undefined
) => {
  if (warnings.length === 0 || force) {
    return;
  }
  if (!ask) {
    throw new InitError(
      `${warnings.join("\n  ")}\n  Re-run with --force if this is intended.`
    );
  }
  for (const warning of warnings) {
    print(`! ${warning}`);
  }
  const answer = await ask("Continue anyway? [y/N] ");
  if (!YES.test(answer.trim())) {
    throw new InitError("Aborted. Nothing was changed.");
  }
};

// ─── step 1: rename ─────────────────────────────────────────────────────────

/**
 * Single-pass replacement of the identity tokens (longest first, alphanumeric
 * boundaries), so a new name that contains the old one is never re-replaced.
 */
const createRenamer = (from: Identity, to: Identity) => {
  const pairs: [string, string][] = [
    [from.packageName, to.slug],
    [from.displayName, to.displayName],
    [from.slug, to.slug],
    [toConstantCase(from.slug), toConstantCase(to.slug)],
  ];
  const replacements = new Map<string, string>();
  for (const [token, value] of pairs) {
    if (token && token !== value && !replacements.has(token)) {
      replacements.set(token, value);
    }
  }
  if (replacements.size === 0) {
    return (text: string) => text;
  }

  const alternation = [...replacements.keys()]
    .sort((a, b) => b.length - a.length)
    .map((token) => token.replace(REGEX_SPECIAL, "\\$&"))
    .join("|");
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])(?:${alternation})(?![A-Za-z0-9])`,
    "gu"
  );
  return (text: string) =>
    text.replace(pattern, (token) => replacements.get(token) ?? token);
};

/** Replaces the first paragraph right below the README's H1 title. */
const replaceLeadParagraph = (markdown: string, description: string) => {
  const lines = markdown.split("\n");
  const title = lines.findIndex((line) => line.startsWith("# "));
  if (title === -1) {
    return markdown;
  }
  let start = title + 1;
  while (lines[start]?.trim() === "") {
    start += 1;
  }
  let end = start;
  while (end < lines.length && lines[end]?.trim() !== "") {
    end += 1;
  }
  lines.splice(start, end - start, description);
  return lines.join("\n");
};

/** Unique real files to rename; symlinks (CLAUDE.md → AGENTS.md) collapse. */
const renameTargets = (root: string) => {
  const skillsRoot = join(root, SKILLS_DIR);
  const skills = existsSync(skillsRoot)
    ? readdirSync(skillsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(SKILLS_DIR, entry.name, "SKILL.md"))
    : [];
  const files = new Map<string, string>();
  for (const path of [...RENAME_TARGETS, ...skills]) {
    const absolute = join(root, path);
    if (existsSync(absolute)) {
      const real = realpathSync(absolute);
      if (!files.has(real)) {
        files.set(real, relative(root, real));
      }
    }
  }
  return files;
};

const renameProject = (
  root: string,
  from: Identity,
  to: Identity,
  description: string | undefined
) => {
  const rename = createRenamer(from, to);
  const changed: string[] = [];

  const packageJson = readPackageJson(root);
  packageJson.name = to.slug;
  packageJson.version = INITIAL_VERSION;
  if (description) {
    packageJson.description = description;
  }
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );
  changed.push("package.json");

  for (const [absolute, path] of renameTargets(root)) {
    const original = readFileSync(absolute, "utf8");
    let next = rename(original);
    if (description && path === "README.md") {
      next = replaceLeadParagraph(next, description);
    }
    if (next !== original) {
      writeFileSync(absolute, next);
      changed.push(path);
    }
  }
  return changed;
};

// ─── step 2: .env + secrets (ADR-0015) ──────────────────────────────────────

const pemAsBase64 = (pem: string | Buffer) =>
  Buffer.from(pem).toString("base64");

/** RFC 7638 JWK thumbprint of an Ed25519 public key (base64url SHA-256). */
const jwkThumbprint = (publicKey: KeyObject) => {
  const { crv, kty, x } = publicKey.export({ format: "jwk" });
  return createHash("sha256")
    .update(JSON.stringify({ crv, kty, x }))
    .digest("base64url");
};

const generateSecrets = () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return new Map([
    ["JWT_KEY_ID", jwkThumbprint(publicKey)],
    [
      "JWT_PRIVATE_KEY",
      pemAsBase64(privateKey.export({ format: "pem", type: "pkcs8" })),
    ],
    [
      "JWT_PUBLIC_KEY",
      pemAsBase64(publicKey.export({ format: "pem", type: "spki" })),
    ],
    ["MFA_ENCRYPTION_KEY", randomBytes(32).toString("hex")],
  ]);
};

const fillSecrets = (envExample: string, secrets: Map<string, string>) => {
  const pending = new Map(secrets);
  const lines = envExample.split("\n").map((line) => {
    const key = ENV_LINE.exec(line)?.groups?.key;
    const secret = key ? pending.get(key) : undefined;
    if (!(key && secret)) {
      return line;
    }
    pending.delete(key);
    return `${key}=${secret}`;
  });
  const missing = [...pending].map(([key, value]) => `${key}=${value}`);
  if (missing.length > 0) {
    lines.push("# Generated by pnpm init:project", ...missing, "");
  }
  return lines.join("\n");
};

const bootstrapEnv = (root: string) => {
  if (existsSync(join(root, ENV_FILE))) {
    return;
  }
  const secrets = generateSecrets();
  writeFileSync(
    join(root, ENV_FILE),
    fillSecrets(readText(root, ENV_EXAMPLE), secrets),
    { mode: 0o600 }
  );
  return secrets.get("JWT_KEY_ID");
};

// ─── step 3: roadmap reset ──────────────────────────────────────────────────

const resetRoadmap = (root: string, project: Identity) => {
  const template = readText(root, ROADMAP_TEMPLATE);
  const values: Record<string, string> = {
    APP_NAME: project.displayName,
    APP_SLUG: project.slug,
  };

  const tasksDir = join(root, TASKS_DIR);
  const removed = existsSync(tasksDir)
    ? readdirSync(tasksDir).filter(
        (name) =>
          BOILERPLATE_TASK.test(name) &&
          lstatSync(join(tasksDir, name)).isFile()
      )
    : [];
  for (const name of removed) {
    rmSync(join(tasksDir, name));
  }

  writeFileSync(
    join(root, ROADMAP_FILE),
    template.replace(
      TEMPLATE_PLACEHOLDER,
      (placeholder, key: string) => values[key] ?? placeholder
    )
  );
  return removed.length;
};

// ─── CLI ────────────────────────────────────────────────────────────────────

const promptSlug = async (ask: Ask): Promise<string> => {
  const slug = (await ask("Project slug (kebab-case, e.g. acme-saas): "))
    .trim()
    .toLowerCase();
  const error = validateSlug(slug);
  if (!error) {
    return slug;
  }
  print(`✖ ${error}`);
  return promptSlug(ask);
};

/** `undefined` when only the help was requested. */
const resolveOptions = async (
  ask: Ask | undefined
): Promise<Options | undefined> => {
  const argv = process.argv.slice(2);
  const { values } = parseArgs({
    // `pnpm init:project -- --name x` forwards the separator.
    args: argv[0] === "--" ? argv.slice(1) : argv,
    options: {
      description: { type: "string" },
      force: { default: false, type: "boolean" },
      help: { default: false, short: "h", type: "boolean" },
      name: { type: "string" },
    },
    strict: true,
  });

  if (values.help) {
    print(HELP);
    return;
  }

  let { description, name: slug } = values;
  if (slug === undefined) {
    if (!ask) {
      throw new InitError(
        "Missing --name <slug> (interactive mode needs a TTY). See --help."
      );
    }
    slug = await promptSlug(ask);
    description ??=
      (await ask("Description (optional, Enter to keep): ")).trim() ||
      undefined;
  }

  const error = validateSlug(slug);
  if (error) {
    throw new InitError(error);
  }
  return { description, force: values.force, slug };
};

const run = async (ask: Ask | undefined) => {
  const root = process.cwd();
  const options = await resolveOptions(ask);
  if (!options) {
    return;
  }
  const current = readCurrentIdentity(root);
  const next: Identity = {
    displayName: toDisplayName(options.slug),
    packageName: options.slug,
    slug: options.slug,
  };

  await enforceSafety(safetyWarnings(root, current), options.force, ask);

  const changed = renameProject(root, current, next, options.description);
  const keyId = bootstrapEnv(root);
  const removedTasks = resetRoadmap(root, next);

  print(
    `✔ Renamed "${current.packageName}" → "${next.slug}" (${next.displayName}): ${changed.join(", ")}`
  );
  print(
    keyId
      ? `✔ Created ${ENV_FILE} with a fresh Ed25519 JWT key pair (kid ${keyId}) and MFA_ENCRYPTION_KEY`
      : `• ${ENV_FILE} already exists: kept as is (no secrets regenerated)`
  );
  print(
    `✔ Reset roadmap: removed ${removedTasks} boilerplate task file(s), wrote ${ROADMAP_FILE}`
  );
  print();
  print("Next steps: pnpm install · pnpm infra:up · pnpm verify");
};

const main = async () => {
  const readline = process.stdin.isTTY
    ? createInterface({ input: process.stdin, output: process.stdout })
    : undefined;
  const ask: Ask | undefined = readline
    ? (question) => readline.question(question)
    : undefined;
  try {
    await run(ask);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`✖ ${message}\n`);
    process.exitCode = 1;
  } finally {
    readline?.close();
  }
};

main();
