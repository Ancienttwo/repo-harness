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
import { basename, dirname, isAbsolute, join, relative, resolve } from "path";
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
  runner: "claude-agent";
  agent: string;
  skill: string;
  host_runtime_fingerprint: string;
  helper_fingerprint: string;
  reviewed_at: string;
};

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
} {
  const command = argv.shift();
  if (command !== "run" && command !== "verify" && command !== "fingerprint") {
    fail("usage: merge-gate.ts <run|verify|fingerprint> --base <ref> [--goal <plan>] [--format json|sha]", 2);
  }
  let base = "";
  let goal: string | undefined;
  let format: OutputFormat = "json";
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--base") base = argv.shift() ?? "";
    else if (flag === "--goal") goal = argv.shift() ?? "";
    else if (flag === "--format") {
      const value = argv.shift();
      if (value !== "json" && value !== "sha") fail("--format must be json or sha", 2);
      format = value;
    } else fail(`unknown argument: ${flag}`, 2);
  }
  if (!base) fail("--base is required", 2);
  return { command, base, goal, format };
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
  let actual: string | undefined;
  if (existsSync(direct)) {
    actual = realpathSync(direct);
  } else {
    const archive = join(root, "plans", "archive");
    const stem = basename(requested, ".md");
    if (existsSync(archive)) {
      const entries = Array.from(new Bun.Glob(`${stem}{,-v*}.md`).scanSync({ cwd: archive, onlyFiles: true })).sort();
      const match = entries.at(-1);
      if (match) actual = realpathSync(join(archive, match));
    }
  }
  if (!actual) fail(`goal artifact not found: ${requested}`);
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
    "repository_root", "base_ref", "base_sha", "head_sha", "diff_fingerprint", "verification_evidence_fingerprint", "goal_file", "runner", "agent", "skill",
    "host_runtime_fingerprint", "helper_fingerprint", "reviewed_at",
  ] as const) {
    if (typeof parsed[field] !== "string" || parsed[field].trim() === "") fail(`receipt ${field} is required`);
  }
  return { ...parsed, ...decision } as Receipt;
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
  if (receipt.head_sha !== current.headSha) fail("receipt head_sha is stale");
  if (receipt.diff_fingerprint !== current.diffFingerprint) fail("receipt diff_fingerprint is stale");
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
const evidence = verificationEvidence(root);
const request = {
  protocol: 1,
  base_ref: args.base,
  base_sha: current.baseSha,
  head_sha: current.headSha,
  diff_fingerprint: current.diffFingerprint,
  goal_file: relative(root, goalPath).replaceAll("\\", "/"),
  goal: readFileSync(goalPath, "utf-8"),
  changed_files: current.changedFiles,
  diff: current.diff.toString("utf-8"),
  verification_evidence: evidence,
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
