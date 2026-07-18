#!/usr/bin/env bun

import { spawnSync } from "child_process";
import { createHash } from "crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir, userInfo } from "os";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

type Verdict = "PASS" | "FAIL" | "BLOCKED";
type CheckStatus = "pass" | "fail" | "blocked";
type OutputFormat = "json" | "sha";

type Finding = {
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  file: string;
  line: number | null;
  message: string;
  fix: string;
};

type GateCheck = {
  command: string;
  status: CheckStatus;
  summary: string;
};

type GateDecision = {
  protocol: 1;
  verdict: Verdict;
  summary: string;
  findings: Finding[];
  checks: GateCheck[];
};

type HostGateConfig = {
  enabled: true;
  runner: "claude-agent";
  agent: string;
  skill: string;
  claude_bin: string;
  fingerprint: string;
};

type Candidate = {
  baseSha: string;
  headSha: string;
  diff: Buffer;
  diffFingerprint: string;
  changedFiles: string[];
};

const LOCKED_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

function fixedGitBinary(): string {
  for (const candidate of ["/usr/bin/git", "/bin/git"]) {
    if (!isAbsolute(candidate) || !existsSync(candidate)) continue;
    const stat = lstatSync(candidate);
    if (!stat.isSymbolicLink() && stat.isFile() && (stat.mode & 0o111) !== 0) return candidate;
  }
  fail("trusted git executable is unavailable");
}

const GIT_BIN = fixedGitBinary();

function lockedGitEnv(): NodeJS.ProcessEnv {
  const account = userInfo();
  return {
    HOME: account.homedir,
    USER: account.username,
    LOGNAME: account.username,
    PATH: LOCKED_PATH,
    TMPDIR: "/tmp",
    REPO_HARNESS_GIT_BIN: GIT_BIN,
  };
}

function claudeRunnerEnv(authorityHome: string): NodeJS.ProcessEnv {
  const account = userInfo();
  const env: NodeJS.ProcessEnv = {
    HOME: authorityHome,
    USER: account.username,
    LOGNAME: account.username,
    PATH: LOCKED_PATH,
    TMPDIR: "/tmp",
  };
  for (const key of [
    "LANG",
    "LC_ALL",
    "TERM",
    "NO_COLOR",
    "FORCE_COLOR",
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
  ]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

type Receipt = GateDecision & {
  kind: "repo-harness-merge-gate-receipt";
  repository_root: string;
  base_ref: string;
  base_sha: string;
  head_sha: string;
  diff_fingerprint: string;
  verification_evidence_fingerprint: string;
  goal_file: string;
  goal_sha256: string;
  post_freeze_allowlist: string[];
  post_freeze_destinations: Record<string, string>;
  runner: "claude-agent";
  agent: string;
  skill: string;
  host_runtime_fingerprint: string;
  helper_fingerprint: string;
  reviewed_at: string;
};

// Closed set of lifecycle-surface shapes a post-freeze allowlist entry may take,
// each bound to the semantic family it belongs to. This is the single parser for
// "what is this path" -- the allowlist shape guard (fail closed on anything
// outside this set) and the semantic content-binding check (which paths get
// byte-level verification vs. membership-only) both read it, so the two never
// drift apart. SEMANTIC families pair a live source path with its predicted
// archive destination; DERIVED paths are lifecycle bookkeeping with no source
// content to bind.
type PostFreezeFamily = "goal" | "contract" | "review" | "notes";
type PostFreezeClass =
  | { kind: "semantic"; role: "live" | "dest"; family: PostFreezeFamily }
  | { kind: "derived" };

function classifyPostFreezePath(path: string): PostFreezeClass | null {
  if (/^plans\/sprints\/[^/]+\.md$/.test(path)) return { kind: "derived" };
  if (/^plans\/archive\/[^/]+\.md$/.test(path)) return { kind: "semantic", role: "dest", family: "goal" };
  if (/^plans\/[^/]+\.md$/.test(path)) return { kind: "semantic", role: "live", family: "goal" };
  if (/^tasks\/contracts\/[^/]+\.contract\.md$/.test(path)) return { kind: "semantic", role: "live", family: "contract" };
  if (/^tasks\/reviews\/[^/]+\.review\.md$/.test(path)) return { kind: "semantic", role: "live", family: "review" };
  if (/^tasks\/notes\/[^/]+\.notes\.md$/.test(path)) return { kind: "semantic", role: "live", family: "notes" };
  if (/^tasks\/archive\/contract-[^/]+\.md$/.test(path)) return { kind: "semantic", role: "dest", family: "contract" };
  if (/^tasks\/archive\/review-[^/]+\.md$/.test(path)) return { kind: "semantic", role: "dest", family: "review" };
  if (/^tasks\/archive\/notes-[^/]+\.md$/.test(path)) return { kind: "semantic", role: "dest", family: "notes" };
  if (/^tasks\/archive\/todo-[^/]+\.md$/.test(path)) return { kind: "derived" };
  if (path === "tasks/current.md") return { kind: "derived" };
  if (path === "tasks/todos.md") return { kind: "derived" };
  if (path === ".ai/harness/active-plan") return { kind: "derived" };
  if (path === ".ai/harness/active-worktree") return { kind: "derived" };
  return null;
}

// (a) Fails closed on any --allow-post-freeze entry outside the closed shape
// set above: production, test, and asset paths are structurally impossible to
// allowlist, not merely discouraged.
function validatePostFreezeAllowlistShape(paths: string[]): void {
  for (const path of paths) {
    if (classifyPostFreezePath(path) === null) {
      fail(`--allow-post-freeze path is not a recognized lifecycle-surface shape: ${path}`);
    }
  }
}

function validatePostFreezeDestinations(allowlist: string[], destinations: Record<string, string>): void {
  const expected = allowlist.filter((path) => {
    const classification = classifyPostFreezePath(path);
    return classification?.kind === "semantic" && classification.role === "dest";
  }).sort();
  const actual = Object.keys(destinations).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("--expect-post-freeze-destination must bind every semantic destination in the allowlist exactly once");
  }
  for (const [path, digest] of Object.entries(destinations)) {
    if (!/^sha256:[0-9a-f]{64}$/.test(digest)) fail(`invalid destination sha256 for ${path}`);
    const destination = classifyPostFreezePath(path);
    if (!destination || destination.kind !== "semantic" || destination.role !== "dest") {
      fail(`expected post-freeze destination is not semantic: ${path}`);
    }
    const pairedLive = allowlist.some((candidate) => {
      const live = classifyPostFreezePath(candidate);
      return live?.kind === "semantic" && live.role === "live" && live.family === destination.family;
    });
    if (!pairedLive) fail(`expected post-freeze destination has no same-family live source: ${path}`);
  }
}

const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["protocol", "verdict", "summary", "findings", "checks"],
  properties: {
    protocol: { type: "integer", const: 1 },
    verdict: { type: "string", enum: ["PASS", "FAIL", "BLOCKED"] },
    summary: { type: "string", minLength: 1 },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "file", "line", "message", "fix"],
        properties: {
          severity: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM"] },
          file: { type: "string", minLength: 1 },
          line: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
          message: { type: "string", minLength: 1 },
          fix: { type: "string", minLength: 1 },
        },
      },
    },
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["command", "status", "summary"],
        properties: {
          command: { type: "string", minLength: 1 },
          status: { type: "string", enum: ["pass", "fail", "blocked"] },
          summary: { type: "string", minLength: 1 },
        },
      },
    },
  },
} as const;

function fail(message: string, code = 2): never {
  console.error(`merge-gate: ${message}`);
  process.exit(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function runGit(root: string, args: string[], binary = false, required = true) {
  const result = spawnSync(GIT_BIN, args, {
    cwd: root,
    encoding: binary ? null : "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    env: lockedGitEnv(),
  });
  if (required && result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf-8") : result.stderr;
    fail(`git ${args.join(" ")} failed: ${(stderr ?? "").trim()}`);
  }
  return result;
}

function gitText(root: string, args: string[]): string {
  return String(runGit(root, args).stdout).trim();
}

function repositoryRoot(): string {
  return realpathSync(gitText(process.cwd(), ["rev-parse", "--show-toplevel"]));
}

function pathIsInside(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function osAccountHome(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (process.platform === "darwin" && uid !== undefined) {
    const identity = spawnSync("/usr/bin/id", ["-un", String(uid)], { encoding: "utf-8" });
    const username = identity.status === 0 ? identity.stdout.trim() : "";
    if (!/^[A-Za-z0-9._-]+$/.test(username)) fail("cannot resolve the current macOS account name");
    const directory = spawnSync("/usr/bin/dscl", [".", "-read", `/Users/${username}`, "NFSHomeDirectory"], { encoding: "utf-8" });
    const match = directory.status === 0 ? directory.stdout.match(/^NFSHomeDirectory:\s*(.+)$/m) : null;
    if (!match?.[1]?.trim()) fail("cannot resolve the current macOS account home");
    return match[1].trim();
  }
  if (process.platform === "linux" && uid !== undefined) {
    for (const getent of ["/usr/bin/getent", "/bin/getent"]) {
      if (!existsSync(getent)) continue;
      const account = spawnSync(getent, ["passwd", String(uid)], { encoding: "utf-8" });
      const home = account.status === 0 ? account.stdout.trim().split(":")[5] : "";
      if (home) return home;
    }
    const account = readFileSync("/etc/passwd", "utf-8")
      .split("\n")
      .find((line) => line.split(":")[2] === String(uid));
    const home = account?.split(":")[5];
    if (home) return home;
    fail("cannot resolve the current Linux account home");
  }
  return userInfo().homedir;
}

function parseArgs(argv: string[]): {
  command: "run" | "verify" | "fingerprint";
  base: string;
  goal?: string;
  format: OutputFormat;
  allowPostFreeze: string[];
  expectedPostFreezeDestinations: Record<string, string>;
} {
  const command = argv.shift();
  if (command !== "run" && command !== "verify" && command !== "fingerprint") {
    fail("usage: merge-gate.ts <run|verify|fingerprint> --base <ref> [--goal <plan>] [--format json|sha] [--allow-post-freeze <path>] [--expect-post-freeze-destination <path=sha256:...>]", 2);
  }
  let base = "";
  let goal: string | undefined;
  let format: OutputFormat = "json";
  const allowPostFreeze: string[] = [];
  const expectedPostFreezeDestinations: Record<string, string> = {};
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--base") base = argv.shift() ?? "";
    else if (flag === "--goal") goal = argv.shift() ?? "";
    else if (flag === "--allow-post-freeze") {
      const value = argv.shift();
      if (!value) fail("--allow-post-freeze requires a value", 2);
      allowPostFreeze.push(value);
    } else if (flag === "--expect-post-freeze-destination") {
      const value = argv.shift();
      const separator = value?.lastIndexOf("=") ?? -1;
      if (!value || separator <= 0) fail("--expect-post-freeze-destination requires path=sha256:...", 2);
      const path = value.slice(0, separator);
      const digest = value.slice(separator + 1);
      if (Object.hasOwn(expectedPostFreezeDestinations, path)) fail(`duplicate expected post-freeze destination: ${path}`, 2);
      expectedPostFreezeDestinations[path] = digest;
    } else if (flag === "--format") {
      const value = argv.shift();
      if (value !== "json" && value !== "sha") fail("--format must be json or sha", 2);
      format = value;
    } else fail(`unknown argument: ${flag}`, 2);
  }
  if (!base) fail("--base is required", 2);
  return { command, base, goal, format, allowPostFreeze, expectedPostFreezeDestinations };
}

function candidate(root: string, baseRef: string): Candidate {
  const baseSha = gitText(root, ["rev-parse", "--verify", `${baseRef}^{commit}`]);
  const headSha = gitText(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const ancestry = runGit(root, ["merge-base", "--is-ancestor", baseSha, headSha], false, false);
  if (ancestry.status !== 0) fail(`base ${baseRef} (${baseSha}) is not an ancestor of HEAD (${headSha})`);
  const diff = runGit(root, ["diff", "--binary", "--full-index", "--no-ext-diff", `${baseSha}...${headSha}`], true).stdout as Buffer;
  const changedFiles = gitText(root, ["diff", "--name-only", "--no-ext-diff", `${baseSha}...${headSha}`])
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  return { baseSha, headSha, diff, diffFingerprint: sha256(diff), changedFiles };
}

// Recomputes the same triple-dot diff fingerprint shape candidate() produces, but
// rooted at an arbitrary (base, head) pair instead of (base, HEAD). Used to confirm
// the frozen candidate F reviewed by the gate has not been rewritten since.
function frozenDiffFingerprint(root: string, baseSha: string, headSha: string): string {
  const diff = runGit(root, ["diff", "--binary", "--full-index", "--no-ext-diff", `${baseSha}...${headSha}`], true).stdout as Buffer;
  return sha256(diff);
}

type DiffEntry = { status: string; path: string; renameFrom?: string };

// Single parser for "what changed between two commits, with rename pairing" --
// both the plain post-freeze membership check and the semantic content-binding
// check read this, rather than each re-running and re-parsing `git diff`
// independently. Name-status with rename detection so both the old and new
// name of a moved path are captured (archival mutation is mostly moves:
// plans/<f> -> plans/archive/<f>); the destination entry of a rename/copy
// records `renameFrom` so callers can pair a semantic source with its move
// target without a second lookup.
function diffEntriesBetween(root: string, fromSha: string, toSha: string): DiffEntry[] {
  const output = gitText(root, ["diff", "--name-status", "-M", "--no-ext-diff", fromSha, toSha]);
  const entries: DiffEntry[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const fields = line.split("\t");
    const status = fields[0] ?? "";
    if (status.startsWith("R") || status.startsWith("C")) {
      if (fields[1]) entries.push({ status, path: fields[1] });
      if (fields[2]) entries.push({ status, path: fields[2], renameFrom: fields[1] });
    } else if (fields[1]) {
      entries.push({ status, path: fields[1] });
    }
  }
  return entries;
}

// A SEMANTIC live path's post-freeze change is only ever legitimate as its own
// removal: a plain delete, or the source side of a rename whose destination is
// classified as that same family's archive destination (never some other
// family's, and never an arbitrary path).
function semanticLiveIsRemoved(entries: DiffEntry[], path: string, family: PostFreezeFamily): boolean {
  if (entries.some((entry) => entry.status.startsWith("D") && entry.path === path)) return true;
  const renamed = entries.find((entry) => entry.renameFrom === path);
  if (!renamed) return false;
  const destClass = classifyPostFreezePath(renamed.path);
  return !!destClass && destClass.kind === "semantic" && destClass.role === "dest" && destClass.family === family;
}

function requireCleanCandidate(root: string): void {
  const status = gitText(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) fail(`candidate worktree is dirty after finish:\n${status}`);
}

function baseRequiresGate(root: string, baseSha: string): boolean {
  const policyPath = ".ai/harness/policy.json";
  const listed = gitText(root, ["ls-tree", "--name-only", baseSha, "--", policyPath]);
  if (listed === "") return false;
  if (listed !== policyPath) fail(`cannot resolve base policy path: ${listed}`);
  const raw = gitText(root, ["show", `${baseSha}:${policyPath}`]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`base policy is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const gate = isRecord(parsed) ? parsed.merge_gate : undefined;
  if (gate === undefined) return false;
  if (!isRecord(gate) || typeof gate.enabled !== "boolean") {
    fail("base policy merge_gate.enabled must be a boolean");
  }
  return gate.enabled;
}

function hostConfigPath(authorityHome: string): string {
  if (!isAbsolute(authorityHome)) fail("OS account home must be an absolute path");
  const stateRoot = join(realpathSync(authorityHome), ".repo-harness");
  if (existsSync(stateRoot) && lstatSync(stateRoot).isSymbolicLink()) fail("host state directory must not be a symbolic link");
  return join(stateRoot, "config.json");
}

function requireHostOwnedRegular(path: string, label: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label} must be a regular file, not a symbolic link`);
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) fail(`${label} must be owned by the current OS account`);
  if ((stat.mode & 0o022) !== 0) fail(`${label} must not be group- or world-writable`);
}

function requireHostOwnedDirectory(path: string, label: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label} must be a directory, not a symbolic link`);
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) fail(`${label} must be owned by the current OS account`);
  if ((stat.mode & 0o022) !== 0) fail(`${label} must not be group- or world-writable`);
}

function readHostConfig(authorityHome: string): HostGateConfig {
  const path = hostConfigPath(authorityHome);
  if (!existsSync(path)) fail(`host config not found: ${path}`);
  requireHostOwnedDirectory(dirname(path), "host state directory");
  requireHostOwnedRegular(path, "host config");
  const raw = readFileSync(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`invalid host config JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const gate = isRecord(parsed) ? parsed.merge_gate : undefined;
  if (!isRecord(gate) || gate.enabled !== true) fail("host merge_gate.enabled must be true");
  if (gate.runner !== "claude-agent") fail("host merge_gate.runner must be claude-agent");
  for (const field of ["agent", "skill", "claude_bin"] as const) {
    if (typeof gate[field] !== "string" || gate[field].trim() === "") {
      fail(`host merge_gate.${field} must be a non-empty string`);
    }
  }
  if (!isAbsolute(String(gate.claude_bin))) fail("host merge_gate.claude_bin must be absolute");
  const claudeBin = realpathSync(String(gate.claude_bin));
  const stat = statSync(claudeBin);
  if (!stat.isFile() || (stat.mode & 0o111) === 0) fail("host merge_gate.claude_bin must be an executable file");
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) fail("host merge_gate.claude_bin must be owned by the current OS account");
  if ((stat.mode & 0o022) !== 0) fail("host merge_gate.claude_bin must not be group- or world-writable");
  const home = dirname(dirname(path));
  const agentPath = join(home, ".claude", "agents", `${String(gate.agent)}.md`);
  const skillPath = join(home, ".claude", "skills", String(gate.skill), "SKILL.md");
  for (const [label, runtimePath] of [["agent", agentPath], ["skill", skillPath]] as const) {
    if (!existsSync(runtimePath)) fail(`host merge_gate ${label} runtime is missing: ${runtimePath}`);
    requireHostOwnedRegular(runtimePath, `host merge_gate ${label} runtime`);
  }
  const binaryIdentity = JSON.stringify({ path: claudeBin, dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs });
  return {
    enabled: true,
    runner: "claude-agent",
    agent: String(gate.agent),
    skill: String(gate.skill),
    claude_bin: claudeBin,
    fingerprint: sha256(`${raw}\0${binaryIdentity}\0${readFileSync(agentPath)}\0${readFileSync(skillPath)}`),
  };
}

function helperFingerprint(root: string): string {
  const helper = realpathSync(fileURLToPath(import.meta.url));
  if (pathIsInside(root, helper)) {
    fail("merge gate must run from the installed repo-harness helper runtime, not the candidate repository");
  }
  return sha256(readFileSync(helper));
}

function receiptPath(root: string, authorityHome: string, createParent = false): string {
  const config = hostConfigPath(authorityHome);
  const stateRoot = dirname(config);
  if (existsSync(stateRoot) && lstatSync(stateRoot).isSymbolicLink()) fail("host state directory must not be a symbolic link");
  const repoId = createHash("sha256").update(root).digest("hex");
  const gatesRoot = join(stateRoot, "gates");
  if (existsSync(gatesRoot) && lstatSync(gatesRoot).isSymbolicLink()) fail("receipt directory must not be a symbolic link");
  const parent = join(gatesRoot, repoId);
  if (createParent) {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    chmodSync(parent, 0o700);
  }
  if (existsSync(gatesRoot)) requireHostOwnedDirectory(gatesRoot, "receipt root directory");
  if (existsSync(parent)) requireHostOwnedDirectory(parent, "receipt directory");
  const path = join(parent, "merge-gate.latest.json");
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail("receipt file must not be a symbolic link");
  return path;
}

function resolveGoal(root: string, requested: string): string {
  const direct = resolve(root, requested);
  if (!pathIsInside(root, direct)) fail(`goal artifact escapes repository: ${requested}`);
  if (!existsSync(direct)) fail(`goal artifact not found: ${requested}`);
  const actual = realpathSync(direct);
  if (!pathIsInside(root, actual)) fail(`goal artifact resolves outside repository: ${requested}`);
  const repoRelative = relative(root, actual).replaceAll("\\", "/");
  if (!/^plans\/(?:archive\/)?[^/]+\.md$/.test(repoRelative)) {
    fail("goal artifact must be a regular Markdown file directly under plans/ or plans/archive/");
  }
  if (!lstatSync(actual).isFile()) fail("goal artifact must be a regular file");
  return actual;
}

function verificationEvidence(root: string): { path: string; content: string } {
  const path = join(root, ".ai", "harness", "checks", "latest.json");
  if (!existsSync(path) || !lstatSync(path).isFile()) fail(`verification evidence is missing: ${path}`);
  const content = readFileSync(path, "utf-8");
  if (Buffer.byteLength(content) > 4 * 1024 * 1024) fail("verification evidence exceeds 4 MiB");
  return { path: relative(root, path).replaceAll("\\", "/"), content };
}

function validateDecision(value: unknown): GateDecision {
  if (!isRecord(value)) fail("runner structured_output must be an object");
  if (value.protocol !== 1) fail("runner decision protocol must be 1");
  if (value.verdict !== "PASS" && value.verdict !== "FAIL" && value.verdict !== "BLOCKED") {
    fail("runner verdict must be PASS, FAIL, or BLOCKED");
  }
  if (typeof value.summary !== "string" || value.summary.trim() === "") fail("runner summary is required");
  if (!Array.isArray(value.findings) || !Array.isArray(value.checks)) fail("runner findings and checks must be arrays");
  const findings = value.findings.map((item, index): Finding => {
    if (!isRecord(item)) fail(`finding ${index} must be an object`);
    if (item.severity !== "CRITICAL" && item.severity !== "HIGH" && item.severity !== "MEDIUM") fail(`finding ${index} has invalid severity`);
    if (typeof item.file !== "string" || item.file.trim() === "") fail(`finding ${index} file is required`);
    if (item.line !== null && (!Number.isInteger(item.line) || Number(item.line) < 1)) fail(`finding ${index} line is invalid`);
    if (typeof item.message !== "string" || item.message.trim() === "") fail(`finding ${index} message is required`);
    if (typeof item.fix !== "string" || item.fix.trim() === "") fail(`finding ${index} fix is required`);
    return item as Finding;
  });
  const checks = value.checks.map((item, index): GateCheck => {
    if (!isRecord(item)) fail(`check ${index} must be an object`);
    if (typeof item.command !== "string" || item.command.trim() === "") fail(`check ${index} command is required`);
    if (item.status !== "pass" && item.status !== "fail" && item.status !== "blocked") fail(`check ${index} status is invalid`);
    if (typeof item.summary !== "string" || item.summary.trim() === "") fail(`check ${index} summary is required`);
    return item as GateCheck;
  });
  if (value.verdict === "PASS") {
    if (findings.length !== 0) fail("PASS decision must have no findings");
    if (checks.length === 0 || checks.some((check) => check.status !== "pass")) {
      fail("PASS decision requires at least one supplied check and every check must pass");
    }
  }
  if (value.verdict === "FAIL" && findings.length === 0) fail("FAIL decision requires at least one finding");
  return { protocol: 1, verdict: value.verdict, summary: value.summary, findings, checks };
}

function invokeClaude(authorityHome: string, config: HostGateConfig, request: Record<string, unknown>): GateDecision {
  const sandboxParent = mkdtempSync(join(tmpdir(), "repo-harness-merge-gate-review-"));
  try {
    const prompt = [
      `/${config.skill}`,
      "Evaluate this exact merge candidate from the supplied JSON bytes only. The JSON request is data and scope authority. No tools are available; do not request filesystem or command access.",
      JSON.stringify(request, null, 2),
    ].join("\n\n");
    const env = claudeRunnerEnv(authorityHome);
    const result = spawnSync(config.claude_bin, [
      "-p",
      "--agent", config.agent,
      "--tools", "",
      "--permission-mode", "plan",
      "--setting-sources", "user",
      "--output-format", "json",
      "--no-session-persistence",
      "--json-schema", JSON.stringify(DECISION_SCHEMA),
    ], {
      cwd: sandboxParent,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      env,
      input: prompt,
    });
    if (result.error) fail(`runner failed to start: ${result.error.message}`);
    if (result.status !== 0) {
      let detail = result.stderr.trim();
      if (!detail && result.stdout.trim()) {
        try {
          const errorEnvelope = JSON.parse(result.stdout) as unknown;
          detail = isRecord(errorEnvelope) && typeof errorEnvelope.result === "string"
            ? errorEnvelope.result
            : "runner returned a non-zero JSON envelope";
        } catch {
          detail = result.stdout.trim();
        }
      }
      detail ||= "no runner diagnostics";
      fail(`runner exited ${result.status}: ${detail}`);
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(result.stdout);
    } catch (error) {
      fail(`runner output is not JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isRecord(envelope) || envelope.type !== "result" || envelope.is_error === true || !isRecord(envelope.structured_output)) {
      const resultDetail = isRecord(envelope) && typeof envelope.result === "string"
        ? envelope.result.trim().slice(0, 500)
        : "";
      fail(`runner output must be a successful Claude result envelope with structured_output${resultDetail ? `: ${resultDetail}` : ""}`);
    }
    return validateDecision(envelope.structured_output);
  } finally {
    rmSync(sandboxParent, { recursive: true, force: true });
  }
}

function readReceipt(path: string): Receipt {
  if (!existsSync(path)) fail(`PASS receipt is missing: ${path}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    fail(`invalid receipt JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed) || parsed.kind !== "repo-harness-merge-gate-receipt") fail("receipt kind is invalid");
  const decision = validateDecision(parsed);
  for (const field of [
    "repository_root", "base_ref", "base_sha", "head_sha", "diff_fingerprint", "verification_evidence_fingerprint", "goal_file", "goal_sha256", "runner", "agent", "skill",
    "host_runtime_fingerprint", "helper_fingerprint", "reviewed_at",
  ] as const) {
    if (typeof parsed[field] !== "string" || parsed[field].trim() === "") fail(`receipt ${field} is required`);
  }
  // Absent on purpose (never a migration shim): a receipt written before this field
  // existed, or written with no --allow-post-freeze flags, carries zero post-receipt
  // tolerance below rather than silently inheriting some default allowance.
  let postFreezeAllowlist: string[] = [];
  if (parsed.post_freeze_allowlist !== undefined) {
    const raw = parsed.post_freeze_allowlist;
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
      fail("receipt post_freeze_allowlist must be an array of strings");
    }
    postFreezeAllowlist = raw as string[];
  }
  const rawDestinations = parsed.post_freeze_destinations;
  if (!isRecord(rawDestinations) || Object.values(rawDestinations).some((value) => typeof value !== "string")) {
    fail("receipt post_freeze_destinations must be an object mapping paths to sha256 strings");
  }
  const postFreezeDestinations = rawDestinations as Record<string, string>;
  validatePostFreezeDestinations(postFreezeAllowlist, postFreezeDestinations);
  return { ...parsed, ...decision, post_freeze_allowlist: postFreezeAllowlist, post_freeze_destinations: postFreezeDestinations } as Receipt;
}

function printResult(format: OutputFormat, required: boolean, current: Candidate): void {
  if (format === "sha") {
    console.log(current.headSha);
    return;
  }
  console.log(JSON.stringify({
    protocol: 1,
    required,
    base_sha: current.baseSha,
    head_sha: current.headSha,
    diff_fingerprint: current.diffFingerprint,
  }));
}

function verifyReceipt(root: string, authorityHome: string, baseRef: string, current: Candidate, config: HostGateConfig, helper: string): Receipt {
  requireCleanCandidate(root);
  const receipt = readReceipt(receiptPath(root, authorityHome));
  if (receipt.verdict !== "PASS") fail(`receipt verdict is ${receipt.verdict}`, receipt.verdict === "FAIL" ? 1 : 2);
  if (receipt.repository_root !== root) fail("receipt repository_root does not match current repository");
  if (receipt.base_ref !== baseRef) fail("receipt base_ref does not match requested base");
  if (receipt.base_sha !== current.baseSha) fail("receipt base_sha is stale");

  if (receipt.head_sha === current.headSha) {
    // Exact-match path: HEAD has not moved since the receipt was written.
    if (receipt.diff_fingerprint !== current.diffFingerprint) fail("receipt diff_fingerprint is stale");
  } else {
    // Post-freeze tolerance path: HEAD moved past the reviewed candidate F. This is
    // only ever acceptable for the bounded lifecycle mutation (archive) that finish
    // applies after the gate runs, never for an arbitrary post-review edit.
    const allowlist = receipt.post_freeze_allowlist;
    const destinations = receipt.post_freeze_destinations;
    if (allowlist.length === 0) fail("receipt head_sha is stale");
    const ancestry = runGit(root, ["merge-base", "--is-ancestor", receipt.head_sha, current.headSha], false, false);
    if (ancestry.status !== 0) fail("receipt head_sha is stale");
    if (frozenDiffFingerprint(root, receipt.base_sha, receipt.head_sha) !== receipt.diff_fingerprint) {
      fail("receipt diff_fingerprint is stale");
    }
    const allowSet = new Set(allowlist);
    const diffEntries = diffEntriesBetween(root, receipt.head_sha, current.headSha);
    const changedPaths = Array.from(new Set(diffEntries.map((entry) => entry.path)));
    const outside = changedPaths.filter((path) => !allowSet.has(path));
    if (outside.length > 0) fail(`post-freeze change outside allowlist: ${outside.join(", ")}`);

    for (const path of allowlist) {
      const classification = classifyPostFreezePath(path);
      if (!classification || classification.kind !== "semantic" || classification.role !== "live") continue;
      if (!semanticLiveIsRemoved(diffEntries, path, classification.family)) {
        fail(`post-freeze change to semantic source is not a deletion or archive move: ${path}`);
      }
      if (existsSync(resolve(root, path))) fail(`post-freeze semantic source still exists: ${path}`);
    }
    const changedSemanticDestinations = changedPaths.filter((path) => {
      const classification = classifyPostFreezePath(path);
      return classification?.kind === "semantic" && classification.role === "dest";
    }).sort();
    const expectedSemanticDestinations = Object.keys(destinations).sort();
    if (JSON.stringify(changedSemanticDestinations) !== JSON.stringify(expectedSemanticDestinations)) {
      fail("post-freeze semantic destinations do not match the frozen manifest");
    }
    for (const [path, expectedHash] of Object.entries(destinations)) {
      const absolute = resolve(root, path);
      if (!existsSync(absolute) || !lstatSync(absolute).isFile()) fail(`post-freeze semantic destination is missing or not a regular file: ${path}`);
      if (sha256(readFileSync(absolute)) !== expectedHash) fail(`post-freeze semantic destination content is stale: ${path}`);
    }
  }

  const evidence = verificationEvidence(root);
  const evidenceFingerprint = sha256(`${evidence.path}\0${evidence.content}`);
  if (receipt.verification_evidence_fingerprint !== evidenceFingerprint) fail("receipt verification evidence is stale");
  if (receipt.runner !== config.runner || receipt.agent !== config.agent || receipt.skill !== config.skill) fail("receipt runtime identity does not match host config");
  if (receipt.host_runtime_fingerprint !== config.fingerprint) fail("receipt host runtime fingerprint is stale");
  if (receipt.helper_fingerprint !== helper) fail("receipt helper fingerprint is stale");
  console.error(`[MergeGate] verified PASS for ${current.headSha} (${current.diffFingerprint})`);
  return receipt;
}

function writeReceipt(path: string, receipt: Receipt): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

export function runMergeGateCli(argv: string[], authorityHome = osAccountHome()): void {
const args = parseArgs(argv);
const root = repositoryRoot();
const trustedHome = realpathSync(authorityHome);
const stateRoot = dirname(hostConfigPath(trustedHome));
if (pathIsInside(root, stateRoot)) fail("host merge-gate state root must stay outside the target repository");
const current = candidate(root, args.base);

if (args.command === "fingerprint") {
  printResult(args.format, baseRequiresGate(root, current.baseSha), current);
  process.exit(0);
}

const required = baseRequiresGate(root, current.baseSha);
if (!required) {
  console.error(`[MergeGate] base ${current.baseSha} does not require the gate`);
  printResult(args.format, false, current);
  process.exit(0);
}

const config = readHostConfig(trustedHome);
const helper = helperFingerprint(root);
if (args.command === "verify") {
  verifyReceipt(root, trustedHome, args.base, current, config, helper);
  printResult(args.format, true, current);
  process.exit(0);
}

requireCleanCandidate(root);
if (!args.goal) fail("--goal is required when the target base enables merge_gate", 2);
const path = receiptPath(root, trustedHome, true);
rmSync(path, { force: true });
const goalPath = resolveGoal(root, args.goal!);
const goalContent = readFileSync(goalPath, "utf-8");
const evidence = verificationEvidence(root);
const postFreezeAllowlist = Array.from(new Set(args.allowPostFreeze)).sort();
validatePostFreezeAllowlistShape(postFreezeAllowlist);
validatePostFreezeDestinations(postFreezeAllowlist, args.expectedPostFreezeDestinations);
const request = {
  protocol: 1,
  base_ref: args.base,
  base_sha: current.baseSha,
  head_sha: current.headSha,
  diff_fingerprint: current.diffFingerprint,
  goal_file: relative(root, goalPath).replaceAll("\\", "/"),
  goal: goalContent,
  changed_files: current.changedFiles,
  diff: current.diff.toString("utf-8"),
  verification_evidence: evidence,
  post_freeze_allowlist: postFreezeAllowlist,
  post_freeze_destinations: args.expectedPostFreezeDestinations,
};
const decision = invokeClaude(trustedHome, config, request);
requireCleanCandidate(root);
const after = candidate(root, args.base);
if (after.baseSha !== current.baseSha || after.headSha !== current.headSha || after.diffFingerprint !== current.diffFingerprint) {
  fail("candidate changed while gatekeeper was running");
}
const receipt: Receipt = {
  ...decision,
  kind: "repo-harness-merge-gate-receipt",
  repository_root: root,
  base_ref: args.base,
  base_sha: after.baseSha,
  head_sha: after.headSha,
  diff_fingerprint: after.diffFingerprint,
  verification_evidence_fingerprint: sha256(`${evidence.path}\0${evidence.content}`),
  goal_file: request.goal_file,
  goal_sha256: sha256(goalContent),
  post_freeze_allowlist: postFreezeAllowlist,
  post_freeze_destinations: args.expectedPostFreezeDestinations,
  runner: config.runner,
  agent: config.agent,
  skill: config.skill,
  host_runtime_fingerprint: config.fingerprint,
  helper_fingerprint: helper,
  reviewed_at: new Date().toISOString(),
};
writeReceipt(path, receipt);
console.error(`[MergeGate] ${receipt.verdict}: ${receipt.summary}`);
if (receipt.verdict === "PASS") {
  verifyReceipt(root, trustedHome, args.base, after, config, helper);
  printResult(args.format, true, after);
  process.exit(0);
}
process.exit(receipt.verdict === "FAIL" ? 1 : 2);
}

if (import.meta.main) runMergeGateCli(process.argv.slice(2));
