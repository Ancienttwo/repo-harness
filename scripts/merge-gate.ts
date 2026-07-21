#!/usr/bin/env bun

import { spawnSync } from "child_process";
import { createHash } from "crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "fs";
import { userInfo } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  acceptanceReceiptPath,
  verifyAcceptance,
  type AcceptanceReceipt,
} from "./acceptance-receipt.ts";

type OutputFormat = "json" | "sha";

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

type Seal = {
  protocol: 1;
  kind: "repo-harness-merge-seal";
  repository_root: string;
  base_ref: string;
  base_sha: string;
  head_sha: string;
  diff_fingerprint: string;
  acceptance_receipt_sha256: string;
  acceptance_subject_sha256: string;
  acceptance_disposition: AcceptanceReceipt["disposition"];
  post_freeze_allowlist: string[];
  post_freeze_destinations: Record<string, string>;
  helper_fingerprint: string;
  sealed_at: string;
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
  format: OutputFormat;
  allowPostFreeze: string[];
  expectedPostFreezeDestinations: Record<string, string>;
} {
  const command = argv.shift();
  if (command !== "run" && command !== "verify" && command !== "fingerprint") {
    fail("usage: merge-gate.ts <run|verify|fingerprint> --base <ref> [--format json|sha] [--allow-post-freeze <path>] [--expect-post-freeze-destination <path=sha256:...>]", 2);
  }
  let base = "";
  let format: OutputFormat = "json";
  const allowPostFreeze: string[] = [];
  const expectedPostFreezeDestinations: Record<string, string> = {};
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--base") base = argv.shift() ?? "";
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
  return { command, base, format, allowPostFreeze, expectedPostFreezeDestinations };
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

function acceptanceReceiptFingerprint(root: string, authorityHome: string): string {
  const path = acceptanceReceiptPath(root, authorityHome);
  if (!existsSync(path)) fail(`AcceptanceReceipt is missing: ${path}`);
  requireHostOwnedRegular(path, "AcceptanceReceipt");
  return sha256(readFileSync(path));
}

function readSeal(path: string): Seal {
  if (!existsSync(path)) fail(`merge seal is missing: ${path}`);
  requireHostOwnedRegular(path, "merge seal");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    fail(`invalid merge seal JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed) || parsed.protocol !== 1 || parsed.kind !== "repo-harness-merge-seal") fail("merge seal kind/protocol is invalid");
  for (const field of [
    "repository_root", "base_ref", "base_sha", "head_sha", "diff_fingerprint",
    "acceptance_receipt_sha256", "acceptance_subject_sha256", "acceptance_disposition",
    "helper_fingerprint", "sealed_at",
  ] as const) {
    if (typeof parsed[field] !== "string" || parsed[field].trim() === "") fail(`merge seal ${field} is required`);
  }
  if (!Array.isArray(parsed.post_freeze_allowlist) || parsed.post_freeze_allowlist.some((item) => typeof item !== "string")) {
    fail("merge seal post_freeze_allowlist must be an array of strings");
  }
  const rawDestinations = parsed.post_freeze_destinations;
  if (!isRecord(rawDestinations) || Object.values(rawDestinations).some((value) => typeof value !== "string")) {
    fail("merge seal post_freeze_destinations must map paths to sha256 strings");
  }
  const postFreezeAllowlist = parsed.post_freeze_allowlist as string[];
  const postFreezeDestinations = rawDestinations as Record<string, string>;
  validatePostFreezeAllowlistShape(postFreezeAllowlist);
  validatePostFreezeDestinations(postFreezeAllowlist, postFreezeDestinations);
  return { ...parsed, post_freeze_allowlist: postFreezeAllowlist, post_freeze_destinations: postFreezeDestinations } as Seal;
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

function verifySeal(
  root: string,
  authorityHome: string,
  baseRef: string,
  current: Candidate,
  acceptance: AcceptanceReceipt,
  helper: string,
): Seal {
  requireCleanCandidate(root);
  const seal = readSeal(sealPath(root, authorityHome));
  if (seal.repository_root !== root) fail("merge seal repository_root does not match current repository");
  if (seal.base_ref !== baseRef) fail("merge seal base_ref does not match requested base");
  if (seal.base_sha !== current.baseSha) fail("merge seal base_sha is stale");

  if (seal.head_sha === current.headSha) {
    if (seal.diff_fingerprint !== current.diffFingerprint) fail("merge seal diff_fingerprint is stale");
  } else {
    // Post-freeze tolerance path: HEAD moved past the reviewed candidate F. This is
    // only ever acceptable for the bounded lifecycle mutation (archive) that finish
    // applies after the gate runs, never for an arbitrary post-review edit.
    const allowlist = seal.post_freeze_allowlist;
    const destinations = seal.post_freeze_destinations;
    if (allowlist.length === 0) fail("merge seal head_sha is stale");
    const ancestry = runGit(root, ["merge-base", "--is-ancestor", seal.head_sha, current.headSha], false, false);
    if (ancestry.status !== 0) fail("merge seal head_sha is stale");
    if (frozenDiffFingerprint(root, seal.base_sha, seal.head_sha) !== seal.diff_fingerprint) {
      fail("merge seal diff_fingerprint is stale");
    }
    const allowSet = new Set(allowlist);
    const diffEntries = diffEntriesBetween(root, seal.head_sha, current.headSha);
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

  if (seal.acceptance_receipt_sha256 !== acceptanceReceiptFingerprint(root, authorityHome)) fail("merge seal AcceptanceReceipt fingerprint is stale");
  if (seal.acceptance_subject_sha256 !== acceptance.subject_sha256) fail("merge seal acceptance subject is stale");
  if (seal.acceptance_disposition !== acceptance.disposition) fail("merge seal acceptance disposition is stale");
  if (seal.helper_fingerprint !== helper) fail("merge seal helper fingerprint is stale");
  console.error(`[MergeGate] verified local seal for ${current.headSha} (${current.diffFingerprint})`);
  return seal;
}

function writeSeal(path: string, seal: Seal): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(seal, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

export async function runMergeGateCli(argv: string[], authorityHome = osAccountHome()): Promise<void> {
const args = parseArgs(argv);
const root = repositoryRoot();
const trustedHome = realpathSync(authorityHome);
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

const helper = helperFingerprint(root);
const acceptance = await verifyAcceptance({ root, authorityHome: trustedHome });
if (args.command === "verify") {
  verifySeal(root, trustedHome, args.base, current, acceptance, helper);
  printResult(args.format, true, current);
  process.exit(0);
}

requireCleanCandidate(root);
const postFreezeAllowlist = Array.from(new Set(args.allowPostFreeze)).sort();
validatePostFreezeAllowlistShape(postFreezeAllowlist);
validatePostFreezeDestinations(postFreezeAllowlist, args.expectedPostFreezeDestinations);
const path = sealPath(root, trustedHome, true);
const seal: Seal = {
  protocol: 1,
  kind: "repo-harness-merge-seal",
  repository_root: root,
  base_ref: args.base,
  base_sha: current.baseSha,
  head_sha: current.headSha,
  diff_fingerprint: current.diffFingerprint,
  acceptance_receipt_sha256: acceptanceReceiptFingerprint(root, trustedHome),
  acceptance_subject_sha256: acceptance.subject_sha256,
  acceptance_disposition: acceptance.disposition,
  post_freeze_allowlist: postFreezeAllowlist,
  post_freeze_destinations: args.expectedPostFreezeDestinations,
  helper_fingerprint: helper,
  sealed_at: new Date().toISOString(),
};
writeSeal(path, seal);
verifySeal(root, trustedHome, args.base, current, acceptance, helper);
printResult(args.format, true, current);
process.exit(0);
}

if (import.meta.main) await runMergeGateCli(process.argv.slice(2));
