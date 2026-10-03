#!/usr/bin/env bun
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'fs';
import { userInfo } from 'os';
import { dirname, isAbsolute, join } from 'path';
import { fileURLToPath } from 'url';
import { acceptanceReceiptPath, resolveProtectedGitRuntime } from './acceptance-receipt';
import { collectPullRequestMergeReadiness } from '../src/effects/publication/merge-readiness';

type OutputFormat = 'json' | 'sha' | 'required';
type Candidate = { baseSha: string; headSha: string; diff: Buffer; diffFingerprint: string; changedFiles: string[] };
type Seal = { protocol: 2; kind: 'repo-harness-merge-seal'; repository_root: string; base_ref: string; base_sha: string; head_sha: string; diff_fingerprint: string; helper_fingerprint: string; pr_number: number; sealed_at: string };
function lockedGitEnv(): NodeJS.ProcessEnv { return { ...resolveProtectedGitRuntime().env }; }

const CREDENTIAL_PATTERNS: readonly { readonly id: string; readonly pattern: RegExp }[] = [
  { id: "pem-private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "aws-access-key-id", pattern: /AKIA[0-9A-Z]{16}/ },
  { id: "github-personal-token", pattern: /ghp_[A-Za-z0-9]{36}/ },
  { id: "github-oauth-token", pattern: /gho_[A-Za-z0-9]{36}/ },
  { id: "github-fine-grained-token", pattern: /github_pat_[A-Za-z0-9_]{22,}/ },
  { id: "slack-token", pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { id: "npm-auth-token", pattern: /_authToken\s*=/ },
];

// Paths that are local operator state by construction: `_ops/` is the ignored
// local operations surface, and a tracked path carrying an absolute home
// segment is a leaked machine path rather than a repository path.
const PRIVATE_PATH_PATTERNS: readonly { readonly id: string; readonly pattern: RegExp }[] = [
  { id: "local-ops-path", pattern: /^_ops\// },
  { id: "absolute-home-path", pattern: /\/Users\/[^/]+\// },
];

// Added lines only: the gate judges what this candidate introduces, not what
// the base already carries. The diff is captured with --binary, so it can hold
// byte sequences that are not valid UTF-8; toString replaces them rather than
// throwing, which keeps a binary hunk from turning into a scanner malfunction.
// Findings name the pattern id and the file, never the matched bytes.
function collectLeakFindings(current: Candidate): string[] {
  const findings: string[] = [];
  let file = "(unknown file)";
  for (const line of current.diff.toString("utf-8").split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).trim();
      file = path.startsWith("b/") ? path.slice(2) : path;
      continue;
    }
    if (!line.startsWith("+")) continue;
    for (const entry of CREDENTIAL_PATTERNS) {
      if (entry.pattern.test(line)) {
        findings.push(`credential pattern ${entry.id} in an added line of ${file} (matched content redacted)`);
      }
    }
  }
  for (const path of current.changedFiles) {
    for (const entry of PRIVATE_PATH_PATTERNS) {
      if (entry.pattern.test(path)) findings.push(`private path pattern ${entry.id}: ${path}`);
    }
  }
  return findings;
}

// Fail closed in both directions: a hit stops the run before any seal exists,
// and a scanner malfunction stops it too rather than sealing an unscanned
// candidate.
function requireLeakFreeCandidate(current: Candidate): void {
  let findings: string[];
  try {
    findings = collectLeakFindings(current);
  } catch (error) {
    fail(`leak scan failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (findings.length > 0) {
    fail(`leak scan blocked the merge candidate:\n${findings.join("\n")}`);
  }
}

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
  const runtime = resolveProtectedGitRuntime();
  const result = spawnSync(runtime.gitBin, args, {
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

function parseArgs(argv: string[]): { command: 'run' | 'verify' | 'fingerprint'; base: string; format: OutputFormat } {
  const command = argv.shift();
  if (!['run', 'verify', 'fingerprint'].includes(command ?? '')) fail('usage: merge-gate <run|verify|fingerprint> --base <ref> [--format json|sha|required]');
  let base = ''; let format: OutputFormat = 'json';
  while (argv.length) {
    const flag = argv.shift();
    if (flag === '--base') base = argv.shift() ?? '';
    else if (flag === '--format') {
      const value = argv.shift();
      if (value !== 'json' && value !== 'sha' && value !== 'required') fail('invalid --format');
      format = value;
    } else fail(`unknown argument: ${flag}`);
  }
  if (!base) fail('--base is required');
  return { command: command as 'run' | 'verify' | 'fingerprint', base, format };
}

function candidate(root: string, baseRef: string): Candidate {
  const baseSha = gitText(root, ["rev-parse", "--verify", `${baseRef}^{commit}`]);
  const headSha = gitText(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  gitText(root, ["merge-base", baseSha, headSha]);
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

function helperFingerprint(root: string): string {
  const helper = realpathSync(fileURLToPath(import.meta.url));
  if (pathIsInside(root, helper)) {
    fail("merge gate must run from the installed repo-harness helper runtime, not the candidate repository");
  }
  return sha256(readFileSync(helper));
}

function sealPath(root: string, authorityHome: string, createParent = false): string {
  if (!isAbsolute(authorityHome)) fail("OS account home must be an absolute path");
  const acceptancePath = acceptanceReceiptPath(root, realpathSync(authorityHome), createParent);
  const parent = dirname(acceptancePath);
  const stateRoot = dirname(dirname(parent));
  if (pathIsInside(root, stateRoot)) fail("host merge-gate state root must stay outside the target repository");
  if (existsSync(stateRoot)) requireHostOwnedDirectory(stateRoot, "host state directory");
  if (existsSync(dirname(parent))) requireHostOwnedDirectory(dirname(parent), "seal root directory");
  if (existsSync(parent)) requireHostOwnedDirectory(parent, "seal directory");
  const path = join(parent, "merge-seal.latest.json");
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail("seal file must not be a symbolic link");
  return path;
}

function printResult(format: OutputFormat, required: boolean, current: Candidate): void {
  if (format === "sha") {
    console.log(current.headSha);
    return;
  }
  if (format === "required") {
    console.log(required ? "true" : "false");
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

function writeSeal(path: string, seal: Seal): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(seal, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

function requireChecks(root: string, current: Candidate): number {
  const result = spawnSync('gh', ['pr', 'view', '--json', 'number'], {
    cwd: root, env: lockedGitEnv(), encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) fail('GitHub PR readback unavailable; no merge authorized');
  let value: unknown;
  try { value = JSON.parse(result.stdout); } catch { fail('invalid GitHub PR readback'); }
  if (!isRecord(value) || !Number.isSafeInteger(value.number) || Number(value.number) < 1) fail('invalid GitHub PR identity');
  const number = Number(value.number);
  const readiness = collectPullRequestMergeReadiness({ repo_root: root, pr_number: number,
    expected_head_sha: current.headSha, expected_base_sha: current.baseSha });
  if (!readiness.ready) fail(`automatic merge checks refuse candidate: ${readiness.blockers.map(b => b.code).join(', ')}`);
  const after = candidate(root, current.baseSha);
  if (after.headSha !== current.headSha || after.diffFingerprint !== current.diffFingerprint) fail('candidate changed during check readback');
  return number;
}

function readSeal(path: string): Seal {
  if (!existsSync(path)) fail('merge seal is missing');
  requireHostOwnedRegular(path, 'merge seal');
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch { fail('invalid merge seal JSON'); }
  if (!isRecord(parsed) || parsed.protocol !== 2 || parsed.kind !== 'repo-harness-merge-seal') fail('invalid merge seal protocol');
  for (const field of ['repository_root','base_ref','base_sha','head_sha','diff_fingerprint','helper_fingerprint','sealed_at']) {
    if (typeof parsed[field] !== 'string' || !parsed[field]) fail(`invalid merge seal ${field}`);
  }
  if (!Number.isSafeInteger(parsed.pr_number) || Number(parsed.pr_number) < 1) fail('invalid merge seal PR');
  return parsed as Seal;
}

export async function runMergeGateCli(argv: string[], authorityHome = osAccountHome()): Promise<void> {
  const args = parseArgs(argv); const root = repositoryRoot(); const current = candidate(root, args.base);
  const required = true;
  if (args.command === 'fingerprint') { requireLeakFreeCandidate(current); printResult(args.format, required, current); return; }
  requireCleanCandidate(root);
  const helper = helperFingerprint(root);
  const trustedHome = realpathSync(authorityHome);
  const number = requireChecks(root, current);
  const path = sealPath(root, trustedHome, args.command === 'run');
  if (args.command === 'run') {
    requireLeakFreeCandidate(current);
    writeSeal(path, { protocol: 2, kind: 'repo-harness-merge-seal', repository_root: root,
      base_ref: args.base, base_sha: current.baseSha, head_sha: current.headSha,
      diff_fingerprint: current.diffFingerprint, helper_fingerprint: helper, pr_number: number, sealed_at: new Date().toISOString() });
  }
  const seal = readSeal(path);
  if (seal.repository_root !== root || seal.base_ref !== args.base || seal.base_sha !== current.baseSha
      || seal.head_sha !== current.headSha || seal.diff_fingerprint !== current.diffFingerprint
      || seal.helper_fingerprint !== helper || seal.pr_number !== number) fail('merge seal is stale or belongs to another candidate');
  printResult(args.format, true, current);
}
if (import.meta.main) await runMergeGateCli(process.argv.slice(2));
