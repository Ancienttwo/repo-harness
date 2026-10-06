import { createHash, randomUUID } from "crypto";
import { execFileSync } from "child_process";
import { accessSync, constants, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { basename, delimiter, isAbsolute, join, relative, resolve } from "path";

import { canonicalize } from "../../core/evidence/canonical-json";
import type { EvidenceEventRecord, GenesisRecord, JsonValue, SubjectIdentity } from "../../core/evidence/types";
import { redactPayloadStrings, SECRET_DENYLIST_ENV_KEYS } from "../../core/evidence/redaction";
import {
  VerificationPlanValidationError,
  fingerprintVerificationCheck,
  fingerprintVerificationCheckExecution,
  hashVerificationPlan,
  parseVerificationPlanFromContractText,
  type VerificationCheck,
  type VerificationPlan,
} from "../../core/evidence/verification-plan";
import { resolveGitCommonDirectory } from "../git/common-directory";
import {
  acquireExclusiveDirectoryLock,
  ExclusiveLockContentionError,
} from "../locking/exclusive-directory-lock";
import { resolveInsideRepo } from "../path-safety";
import { redactProcessOutput, runProcess } from "../process-runner";
import { createFileExclusiveDurably, writeFileDurably } from "./atomic-append";
import { resolveBlobsDir } from "./paths";
import { LEDGER_EPOCH_START_SHA } from "./epoch";
import { appendEvidenceEvent, appendGenesisRecord, readAcceptedEvents, readGenesisRecord } from "./event-log";
import { collectDenylistSecretValues } from "./secret-env";

const EVENT_TYPE = "verification_execution.result";
const PRODUCER = "verification-execution";
const REQUEST_LOCK_ROOT = "repo-harness/verification-execution";
const VERIFICATION_DIAGNOSTIC_MAX_BYTES = 16 * 1024 * 1024;

export type VerificationExecutionState = "executed" | "reused" | "baseline" | "missing";
export type VerificationReportStatus = "passed" | "failed" | "missing" | "needs_verification_plan" | "waiting";

export interface GitVirtualTreeSnapshot {
  readonly head_commit: string;
  readonly tree_hash: string;
  readonly snapshot_hash: string;
}

export interface VerificationExecutionResult {
  readonly id: string;
  readonly kind: VerificationCheck["kind"];
  readonly target: "current_exact" | "historical_baseline_with_current_delta";
  readonly passed: boolean;
  readonly message: string;
  readonly duration_ms: number;
  readonly timed_out: boolean;
  readonly exit_code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly execution: VerificationExecutionState;
  readonly cache_key: string;
  readonly command: string;
  readonly force_reason: string | null;
  readonly execution_id: string | null;
  readonly run_file: string | null;
  readonly failure_log_file: string | null;
}

export interface VerificationEvaluation {
  readonly requirements_hash: string;
  readonly snapshot_hash: string;
  readonly exact_passed: number;
  readonly baseline_passed: number;
  readonly unmet_check_ids: readonly string[];
  readonly snapshot_changed_during_execution: boolean;
}

export interface VerificationExecutionReport {
  readonly protocol: 1;
  readonly kind: "verification_execution_report";
  readonly target: {
    readonly contract: string;
    readonly plan_hash: string;
    readonly snapshot_hash: string;
    readonly tree_hash: string;
    readonly head_commit: string;
  };
  readonly passed: boolean;
  readonly status: VerificationReportStatus;
  readonly evaluation: VerificationEvaluation;
  readonly results: readonly VerificationExecutionResult[];
}

export interface VerificationUnavailable {
  readonly kind: "verification_unavailable";
  readonly status: "missing";
  readonly passed: false;
  readonly reason: "missing_plan" | "empty_plan";
  readonly contract: string;
  readonly results: readonly [];
}

export type VerificationContractOutcome = VerificationExecutionReport | VerificationUnavailable;

export interface VerificationContractInput {
  readonly repoRoot: string;
  readonly contractPath: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

export interface ExecuteVerificationContractInput extends VerificationContractInput {
  readonly reportFile?: string;
  readonly forceReason?: string;
}

export interface VerificationContractValidation {
  readonly protocol: 1;
  readonly kind: "verification_plan_validation";
  readonly valid: true;
  readonly contract: string;
  readonly plan_hash: string;
  readonly plan: VerificationPlan;
}

export interface VerificationExecutionReportValidation {
  readonly valid: true;
  readonly report: VerificationExecutionReport;
}

interface ExecutionPayload {
  readonly protocol: 1;
  readonly contract_path: string;
  readonly contract_hash: string;
  readonly plan_hash: string;
  readonly check_id: string;
  readonly check_fingerprint: string;
  readonly execution_spec_hash: string;
  readonly inputs_hash: string;
  readonly toolchain_hash: string;
  readonly snapshot_hash: string;
  readonly cache_key: string;
  readonly execution_id: string;
  readonly run_file: string;
  readonly run_record_hash: string;
  readonly passed: boolean;
}

/** Ledger and contract facts. Historical validation needs no live toolchain. */
interface EvidenceContext {
  readonly repoRoot: string;
  readonly contractPath: string;
  readonly contractText: string;
  readonly contractHash: string;
  readonly plan: VerificationPlan;
  readonly planHash: string;
  readonly snapshot: GitVirtualTreeSnapshot;
  readonly env: NodeJS.ProcessEnv;
}

interface PreparedContext extends EvidenceContext {
  readonly toolchainHash: string;
  readonly envProviderId: string;
}

function sha256(content: string | Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function git(repoRoot: string, args: readonly string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function virtualTreeOnce(repoRoot: string): string {
  const temporary = mkdtempSync(join(tmpdir(), "repo-harness-verification-index-"));
  const indexPath = join(temporary, "index");
  const indexEnv = { GIT_INDEX_FILE: indexPath };
  try {
    try {
      git(repoRoot, ["read-tree", "HEAD"], indexEnv);
    } catch {
      git(repoRoot, ["read-tree", "--empty"], indexEnv);
    }
    git(repoRoot, ["add", "-A", "--", "."], indexEnv);
    return git(repoRoot, ["write-tree"], indexEnv);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/**
 * Capture the complete Git-visible filesystem as a virtual tree. A temporary
 * index preserves modes, deletions, symlinks, gitlinks, staged/unstaged edits,
 * and non-ignored untracked files without changing the caller's index.
 */
export function captureGitVirtualTreeSnapshot(repoRoot: string): GitVirtualTreeSnapshot {
  const root = resolve(repoRoot);
  const before = git(root, ["status", "--porcelain=v2", "--untracked-files=all"]);
  const firstTree = virtualTreeOnce(root);
  const secondTree = virtualTreeOnce(root);
  const after = git(root, ["status", "--porcelain=v2", "--untracked-files=all"]);
  if (firstTree !== secondTree || before !== after) {
    throw new Error("repository changed while capturing the verification source snapshot");
  }
  let headCommit: string;
  try {
    headCommit = git(root, ["rev-parse", "HEAD"]);
  } catch {
    headCommit = "unborn";
  }
  return {
    head_commit: headCommit,
    tree_hash: firstTree,
    // An empty commit changes provenance but not the source inputs consumed by
    // a check. Keep HEAD in the snapshot record while keying input identity to
    // the complete virtual tree itself.
    snapshot_hash: sha256(canonicalize({ tree_hash: firstTree })),
  };
}

function resolveContract(repoRoot: string, contractPath: string): { readonly absolute: string; readonly text: string } {
  const resolved = resolveInsideRepo(repoRoot, contractPath);
  if (!resolved.ok || !resolved.path) throw new Error(resolved.error ?? `invalid contract path: ${contractPath}`);
  if (!existsSync(resolved.path)) throw new Error(`verification contract does not exist: ${contractPath}`);
  return { absolute: resolved.path, text: readFileSync(resolved.path, "utf8") };
}

function resolveExecutablePath(command: string, env: NodeJS.ProcessEnv): string {
  const candidates = command.includes("/") || command.includes("\\")
    ? [command]
    : (env.PATH ?? "").split(delimiter).filter(Boolean).flatMap((directory) => {
        const base = join(directory, command);
        if (process.platform !== "win32") return [base];
        const extensions = (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean);
        return [base, ...extensions.map((extension) => `${base}${extension.toLowerCase()}`), ...extensions.map((extension) => `${base}${extension.toUpperCase()}`)];
      });
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      const canonical = realpathSync(candidate);
      if (statSync(canonical).isFile()) return canonical;
    } catch {
      // Continue through PATH candidates; absence is rejected below.
    }
  }
  throw new Error(`verification toolchain executable is unavailable: ${command}`);
}

function versionOf(command: string, args: readonly string[], env: NodeJS.ProcessEnv): string {
  try {
    const version = execFileSync(command, [...args], {
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "pipe"],
      // File workers share CPU and process startup. Keep discovery bounded under load.
      timeout: 15_000,
    }).trim();
    if (!version) throw new Error("empty version output");
    return version;
  } catch (error) {
    throw new Error(`verification toolchain version probe failed for ${command}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function resolveToolchain(env: NodeJS.ProcessEnv): { readonly hash: string; readonly providerId: string } {
  const git = resolveExecutablePath(env.REPO_HARNESS_GIT_BIN || "git", env);
  const bash = resolveExecutablePath(env.REPO_HARNESS_BASH_BIN || "/bin/bash", env);
  const bun = resolveExecutablePath(env.REPO_HARNESS_BUN_BIN || process.execPath, env);
  const packageRoot = resolve(import.meta.dir, "../../..");
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  } catch (error) {
    throw new Error(`verification runner package manifest is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const packageVersion = typeof manifest === "object" && manifest !== null && !Array.isArray(manifest)
    ? (manifest as Record<string, unknown>).version
    : undefined;
  if (typeof packageVersion !== "string" || packageVersion.length === 0) {
    throw new Error("verification runner package version is unavailable");
  }
  const runnerSources = [
    ["verification-execution", join(packageRoot, "src/effects/evidence/verification-execution.ts")],
    ["verification-plan", join(packageRoot, "src/core/evidence/verification-plan.ts")],
    ["evidence-redaction", join(packageRoot, "src/core/evidence/redaction.ts")],
    ["evidence-secret-env", join(packageRoot, "src/effects/evidence/secret-env.ts")],
    ["process-runner", join(packageRoot, "src/effects/process-runner.ts")],
    ["process-supervisor", join(packageRoot, "src/effects/process-supervisor.ts")],
    ["expensive-run-lock", join(packageRoot, "src/effects/expensive-run-lock.ts")],
    ["process-group-launcher", join(packageRoot, "src/effects/process-group-launcher.ts")],
    ["git-common-directory", join(packageRoot, "src/effects/git/common-directory.ts")],
    ["exclusive-directory-lock", join(packageRoot, "src/effects/locking/exclusive-directory-lock.ts")],
  ] as const;
  const sourceHashes = Object.fromEntries(runnerSources.map(([name, path]) => {
    try {
      return [name, sha256(readFileSync(path))];
    } catch (error) {
      throw new Error(`verification runner source is unavailable (${name}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }));
  const toolchain = {
    protocol: 1,
    package_version: packageVersion,
    runner_sources: sourceHashes,
    platform: { os: process.platform, arch: process.arch },
    path: env.PATH ?? null,
    tools: {
      git: { path: git, version: versionOf(git, ["--version"], env) },
      bash: { path: bash, version: versionOf(bash, ["--version"], env) },
      bun: { path: bun, version: versionOf(bun, ["--version"], env) },
    },
  };
  const hash = sha256(canonicalize(toolchain));
  return { hash, providerId: `verification-execution/${hash}` };
}

function prepare(input: VerificationContractInput): PreparedContext | VerificationUnavailable {
  const repoRoot = resolve(input.repoRoot);
  const contract = resolveContract(repoRoot, input.contractPath);
  let plan: VerificationPlan;
  try {
    plan = parseVerificationPlanFromContractText(contract.text);
  } catch (error) {
    if (!(error instanceof VerificationPlanValidationError) || error.reason !== "missing_plan") throw error;
    return { kind: "verification_unavailable", status: "missing", passed: false,
      reason: "missing_plan", contract: input.contractPath, results: [] };
  }
  if (plan.checks.length === 0) return { kind: "verification_unavailable", status: "missing", passed: false,
    reason: "empty_plan", contract: input.contractPath, results: [] };
  const env = input.env ?? process.env;
  const toolchain = resolveToolchain(env);
  return {
    repoRoot,
    contractPath: input.contractPath,
    contractText: contract.text,
    contractHash: sha256(contract.text),
    plan,
    planHash: hashVerificationPlan(plan),
    snapshot: captureGitVirtualTreeSnapshot(repoRoot),
    env,
    toolchainHash: toolchain.hash,
    envProviderId: toolchain.providerId,
  };
}

export function validateVerificationContract(
  input: Pick<VerificationContractInput, "repoRoot" | "contractPath">,
): VerificationContractValidation {
  const repoRoot = resolve(input.repoRoot);
  const contract = resolveContract(repoRoot, input.contractPath);
  const plan = parseVerificationPlanFromContractText(contract.text);
  return {
    protocol: 1,
    kind: "verification_plan_validation",
    valid: true,
    contract: input.contractPath,
    plan_hash: hashVerificationPlan(plan),
    plan,
  };
}

function declaredEnvironment(check: VerificationCheck, env: NodeJS.ProcessEnv): JsonValue {
  return Object.fromEntries(check.inputs.env.map((name) => [
    name,
    env[name] === undefined ? { present: false } : { present: true, value_hash: sha256(env[name]!) },
  ])) as JsonValue;
}

function declaredEnvironmentHash(check: VerificationCheck, env: NodeJS.ProcessEnv): string {
  return sha256(canonicalize(declaredEnvironment(check, env)));
}

function cacheKeyFromIdentity(input: {
  readonly check: VerificationCheck;
  readonly snapshotHash: string;
  readonly toolchainHash: string;
  readonly inputsHash: string;
}): string {
  return sha256(canonicalize({
    protocol: 1,
    execution_spec_hash: fingerprintVerificationCheckExecution(input.check),
    snapshot_hash: input.snapshotHash,
    cwd: input.check.cwd,
    toolchain_hash: input.toolchainHash,
    inputs_hash: input.inputsHash,
  }));
}

function cacheKey(context: PreparedContext, check: VerificationCheck): string {
  return cacheKeyFromIdentity({
    check,
    snapshotHash: context.snapshot.snapshot_hash,
    toolchainHash: context.toolchainHash,
    inputsHash: declaredEnvironmentHash(check, context.env),
  });
}

function displayCommand(check: VerificationCheck): string {
  return redactProcessOutput(check.kind === "command" ? check.command : `bun run test -- ${check.path}`);
}

function resolveExecutionCwd(repoRoot: string, cwd: string): string {
  const lexical = cwd === "." ? repoRoot : resolveInsideRepo(repoRoot, cwd);
  const lexicalPath = typeof lexical === "string" ? lexical : (lexical.ok ? lexical.path : undefined);
  if (!lexicalPath) throw new Error(typeof lexical === "string" ? "invalid cwd" : lexical.error);
  const canonicalRoot = realpathSync(repoRoot);
  const canonicalCwd = realpathSync(lexicalPath);
  const fromRoot = relative(canonicalRoot, canonicalCwd);
  if (fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\") || isAbsolute(fromRoot)) {
    throw new Error(`verification cwd resolves outside the repository: ${cwd}`);
  }
  if (!statSync(canonicalCwd).isDirectory()) throw new Error(`verification cwd is not a directory: ${cwd}`);
  return canonicalCwd;
}

function isWithin(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot === "" || (!isAbsolute(fromRoot) && fromRoot !== ".." && !fromRoot.startsWith("../") && !fromRoot.startsWith("..\\"));
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function resolvePackageTest(
  context: PreparedContext,
  check: Extract<VerificationCheck, { readonly kind: "package_test" }>,
): { readonly command: string; readonly args: readonly string[]; readonly cwd: string } {
  const canonicalRoot = realpathSync(context.repoRoot);
  const declaredCwd = resolveExecutionCwd(context.repoRoot, check.cwd);
  let testPath: string;
  try {
    testPath = realpathSync(resolve(declaredCwd, check.path));
  } catch {
    throw new Error(`package_test path is missing or symlink-ambiguous: ${check.path}`);
  }
  if (!isWithin(canonicalRoot, testPath)) throw new Error(`package_test path resolves outside repository: ${check.path}`);

  let ancestor = statSync(testPath).isDirectory() ? testPath : resolve(testPath, "..");
  while (isWithin(canonicalRoot, ancestor)) {
    const manifest = join(ancestor, "package.json");
    if (pathEntryExists(manifest)) {
      let canonicalManifest: string;
      try {
        canonicalManifest = realpathSync(manifest);
      } catch {
        throw new Error(`package_test package manifest is symlink-ambiguous: ${check.path}`);
      }
      if (canonicalManifest !== manifest || !isWithin(canonicalRoot, canonicalManifest)) {
        throw new Error(`package_test package manifest is symlink-ambiguous: ${check.path}`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(canonicalManifest, "utf8"));
      } catch {
        throw new Error(`package_test package manifest is malformed: ${check.path}`);
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(`package_test package manifest is malformed: ${check.path}`);
      }
      const scripts = (parsed as Record<string, unknown>).scripts;
      if (typeof scripts !== "object" || scripts === null || Array.isArray(scripts)) {
        throw new Error(`package_test package scripts.test is missing: ${check.path}`);
      }
      const testScript = (scripts as Record<string, unknown>).test;
      if (typeof testScript !== "string" || testScript.trim().length === 0) {
        throw new Error(`package_test package scripts.test is missing: ${check.path}`);
      }
      const owner = relative(canonicalRoot, ancestor) || ".";
      const testRelative = relative(ancestor, testPath);
      const bun = context.env.REPO_HARNESS_BUN_BIN || process.execPath;
      return { command: bun, args: ["run", "--cwd", owner, "test", "--", testRelative], cwd: canonicalRoot };
    }
    if (ancestor === canonicalRoot) break;
    const parent = resolve(ancestor, "..");
    if (parent === ancestor) break;
    ancestor = parent;
  }
  throw new Error(`package_test package owner is missing: ${check.path}`);
}

function verificationChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const scrubbed: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (key === "BASH_ENV" || key.startsWith("REPO_HARNESS_")) continue;
    scrubbed[key] = value;
  }
  return scrubbed;
}

function redactKnownEnvironmentValues(value: string, env: NodeJS.ProcessEnv): string {
  let redacted = value;
  const secrets = SECRET_DENYLIST_ENV_KEYS
    .map((key) => env[key])
    .filter((secret): secret is string => typeof secret === "string" && secret.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const secret of secrets) redacted = redacted.split(secret).join(sha256(secret));
  return redacted;
}

function payloadOf(repoRoot: string, event: EvidenceEventRecord): ExecutionPayload | null {
  let value: unknown = event.payload;
  if (value === undefined && event.blob_sha256) {
    try {
      value = JSON.parse(readFileSync(join(resolveBlobsDir(repoRoot), event.blob_sha256), "utf8"));
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.protocol !== 1 || typeof record.contract_path !== "string" || typeof record.check_id !== "string") return null;
  if (typeof record.cache_key !== "string" || typeof record.execution_id !== "string" || typeof record.run_file !== "string") return null;
  if (typeof record.run_record_hash !== "string" || typeof record.passed !== "boolean") return null;
  if (typeof record.inputs_hash !== "string" || typeof record.toolchain_hash !== "string") return null;
  return record as unknown as ExecutionPayload;
}

function executionEvents(context: EvidenceContext): readonly { event: EvidenceEventRecord; payload: ExecutionPayload }[] {
  return readAcceptedEvents(context.repoRoot).accepted.flatMap((event) => {
    if (event.event_type !== EVENT_TYPE || event.producer !== PRODUCER || event.trust_class !== "authoritative_machine") return [];
    const payload = payloadOf(context.repoRoot, event);
    if (!payload || payload.contract_path !== context.contractPath) return [];
    return [{ event, payload }];
  });
}

interface LedgerView {
  readonly events: readonly { event: EvidenceEventRecord; payload: ExecutionPayload }[];
  readonly genesis: GenesisRecord | null;
}

/**
 * Reads the ledger at most once, on first use. Share one view only between
 * checks with no append between them; take a new view after an append.
 */
function ledgerView(context: EvidenceContext): LedgerView {
  let events: LedgerView["events"] | undefined;
  let genesis: { readonly value: GenesisRecord | null } | undefined;
  return {
    get events() { return events ??= executionEvents(context); },
    get genesis() { return (genesis ??= { value: readGenesisRecord(context.repoRoot) }).value; },
  };
}

function readValidRunResult(context: EvidenceContext, payload: ExecutionPayload): VerificationExecutionResult | null {
  if (!payload.run_file.startsWith(".ai/harness/runs/")) return null;
  const resolved = resolveInsideRepo(context.repoRoot, payload.run_file);
  if (!resolved.ok || !resolved.path || !existsSync(resolved.path)) return null;
  try {
    const bytes = readFileSync(resolved.path);
    if (sha256(bytes) !== payload.run_record_hash) return null;
    const record = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    if (!(record.protocol === 1
      && record.kind === "verification_execution_record"
      && record.execution_id === payload.execution_id
      && record.cache_key === payload.cache_key
      && typeof record.result === "object"
      && record.result !== null
      && !Array.isArray(record.result))) return null;
    const result = record.result as unknown as VerificationExecutionResult;
    return result.passed === payload.passed ? result : null;
  } catch {
    return null;
  }
}

function currentResult(context: PreparedContext, check: VerificationCheck, ledger: LedgerView): VerificationExecutionResult | null {
  const key = cacheKey(context, check);
  const matches = ledger.events.filter(({ payload }) => payload.cache_key === key);
  const winner = matches[matches.length - 1];
  if (!winner) return null;
  const result = readValidRunResult(context, winner.payload);
  if (!result || result.id !== check.id) return null;
  if (!result.passed && result.exit_code === 0 && !result.timed_out && result.signal === null) return null;
  const projected = { ...result, execution: result.passed ? "reused" as const : "executed" as const };
  const materialized = (redactPayloadStrings({ result: projected } as unknown as JsonValue, collectDenylistSecretValues()) as unknown as { result: VerificationExecutionResult }).result;
  return matchingImmutableExecution(context, check, materialized, false, context.toolchainHash, ledger) ? projected : null;
}

function reusableResult(context: PreparedContext, check: VerificationCheck, ledger: LedgerView): VerificationExecutionResult | null {
  const result = currentResult(context, check, ledger);
  return result?.passed ? result : null;
}

function priorExecutionExists(context: PreparedContext, check: VerificationCheck, ledger: LedgerView): boolean {
  return ledger.events.some(({ payload }) =>
    payload.execution_spec_hash === fingerprintVerificationCheckExecution(check));
}

function baselineResult(
  context: EvidenceContext,
  check: VerificationCheck,
  current: ReadonlyMap<string, VerificationExecutionResult>,
  ledger: LedgerView,
): VerificationExecutionResult {
  const key = sha256(canonicalize({
    policy: "baseline_with_delta",
    plan_hash: context.planHash,
    snapshot_hash: context.snapshot.snapshot_hash,
    execution_spec_hash: fingerprintVerificationCheckExecution(check),
    baseline: check.baseline ?? null,
    delta: (check.delta_checks ?? []).map((id) => ({ id, cache_key: current.get(id)?.cache_key ?? null })),
  } as unknown as JsonValue));
  const base = {
    id: check.id,
    kind: check.kind,
    target: "historical_baseline_with_current_delta" as const,
    duration_ms: 0,
    timed_out: false,
    exit_code: null,
    signal: null,
    execution: "missing" as VerificationExecutionState,
    cache_key: key,
    command: displayCommand(check),
    force_reason: null,
    execution_id: check.baseline?.execution_id ?? null,
    run_file: check.baseline?.run_file ?? null,
    failure_log_file: null,
  };
  if (!check.baseline || !check.delta_checks) return { ...base, passed: false, message: "baseline reference is incomplete" };
  const events = ledger.events;
  const eventMatch = events.find(({ payload }) =>
    payload.execution_id === check.baseline!.execution_id
      && payload.run_file === check.baseline!.run_file
      && payload.execution_spec_hash === fingerprintVerificationCheckExecution(check)
      && payload.passed
      && readValidRunResult(context, payload)?.passed === true);
  if (!eventMatch) return { ...base, passed: false, message: "baseline execution is missing, failed, forged, or stale" };
  const sameInput = events.filter(({ payload }) => payload.cache_key === eventMatch.payload.cache_key);
  const latest = sameInput[sameInput.length - 1];
  if (!latest?.payload.passed || readValidRunResult(context, latest.payload)?.passed !== true) {
    return { ...base, passed: false, message: "baseline is superseded because a newer execution failed or is invalid" };
  }
  const unmet = check.delta_checks.filter((id) => current.get(id)?.passed !== true);
  if (unmet.length > 0) return { ...base, passed: false, message: `current delta checks are unsatisfied: ${unmet.join(", ")}` };
  return {
    ...base,
    passed: true,
    message: `historical baseline ${check.baseline.execution_id} retained with current delta checks`,
    execution: "baseline",
  };
}

function skippedResult(check: VerificationCheck, message: string, key: string): VerificationExecutionResult {
  return {
    id: check.id,
    kind: check.kind,
    target: "current_exact",
    passed: false,
    message,
    duration_ms: 0,
    timed_out: false,
    exit_code: null,
    signal: null,
    execution: "missing",
    cache_key: key,
    command: displayCommand(check),
    force_reason: null,
    execution_id: null,
    run_file: null,
    failure_log_file: null,
  };
}

function missingResult(context: PreparedContext, check: VerificationCheck, message: string): VerificationExecutionResult {
  return skippedResult(check, message, cacheKey(context, check));
}

/** A skipped result claims no execution, so only its exact materialized shape is valid. */
function isMaterializedSkippedResult(check: VerificationCheck, result: VerificationExecutionResult): boolean {
  if (typeof result.message !== "string" || typeof result.cache_key !== "string") return false;
  const expected = (redactPayloadStrings(
    { result: skippedResult(check, result.message, result.cache_key) } as unknown as JsonValue,
    collectDenylistSecretValues(),
  ) as unknown as { result: JsonValue }).result;
  return canonicalize(result as unknown as JsonValue) === canonicalize(expected);
}

function buildReport(
  context: EvidenceContext,
  results: readonly VerificationExecutionResult[],
  status: VerificationReportStatus,
  snapshotChanged = false,
): VerificationExecutionReport {
  return {
    protocol: 1,
    kind: "verification_execution_report",
    target: {
      contract: context.contractPath,
      plan_hash: context.planHash,
      snapshot_hash: context.snapshot.snapshot_hash,
      tree_hash: context.snapshot.tree_hash,
      head_commit: context.snapshot.head_commit,
    },
    passed: status === "passed",
    status,
    evaluation: {
      requirements_hash: context.planHash,
      snapshot_hash: context.snapshot.snapshot_hash,
      exact_passed: results.filter((result) => result.passed && result.target === "current_exact").length,
      baseline_passed: results.filter((result) => result.passed && result.execution === "baseline").length,
      unmet_check_ids: results.filter((result) => !result.passed).map((result) => result.id),
      snapshot_changed_during_execution: snapshotChanged,
    },
    results,
  };
}

function evaluatePrepared(context: PreparedContext): VerificationExecutionReport {
  const ledger = ledgerView(context);
  const current = new Map<string, VerificationExecutionResult>();
  for (const check of context.plan.checks) {
    if (check.evidence_policy !== "current_exact") continue;
    current.set(check.id, currentResult(context, check, ledger) ?? missingResult(context, check, "current exact execution is missing"));
  }
  const results = context.plan.checks.map((check) => check.evidence_policy === "current_exact"
    ? current.get(check.id)!
    : baselineResult(context, check, current, ledger));
  return buildReport(context, results, results.every((result) => result.passed) ? "passed"
    : results.some(result => result.execution === "executed" && !result.passed) ? "failed" : "missing");
}

/** Read-only evidence evaluation. This function never invokes a check command. */
export function evaluateVerificationContract(input: VerificationContractInput): VerificationContractOutcome {
  const context = prepare(input);
  return "kind" in context ? context : evaluatePrepared(context);
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function materializedVerificationCheckId(id: string): string {
  const projected = redactPayloadStrings({
    execution_evaluation: { results: [{ id }] },
  } as unknown as JsonValue, collectDenylistSecretValues()) as {
    readonly execution_evaluation: { readonly results: readonly [{ readonly id: string }] };
  };
  return projected.execution_evaluation.results[0].id;
}

function matchesLedgerCheckId(storedId: string, declaredId: string): boolean {
  if (storedId === declaredId) return true;
  // Older writers treated check_id as an untyped string. Compare that exact
  // projection; the immutable run must still contain the declared ID.
  const legacy = redactPayloadStrings({ id: declaredId }, []) as { readonly id: string };
  return storedId === legacy.id;
}

/** `currentToolchainHash` is null for historical proof, which uses the event's self-bound toolchain identity. */
function matchingImmutableExecution(
  context: EvidenceContext,
  check: VerificationCheck,
  result: VerificationExecutionResult,
  requirePass: boolean,
  currentToolchainHash: string | null,
  ledger: LedgerView,
): boolean {
  return ledger.events.some(({ event, payload }) => {
    if (currentToolchainHash !== null && (payload.contract_hash !== context.contractHash
      || payload.toolchain_hash !== currentToolchainHash
      || payload.inputs_hash !== declaredEnvironmentHash(check, context.env))) return false;
    if (payload.contract_hash !== context.contractHash) return false;
    if (!matchesLedgerCheckId(payload.check_id, check.id)
      || payload.plan_hash !== context.planHash
      || payload.check_fingerprint !== fingerprintVerificationCheck(check)
      || payload.execution_spec_hash !== fingerprintVerificationCheckExecution(check)
      || payload.snapshot_hash !== context.snapshot.snapshot_hash
      || payload.cache_key !== result.cache_key
      || payload.execution_id !== result.execution_id
      || payload.run_file !== result.run_file
      || (requirePass && !payload.passed)) return false;
    const genesis = ledger.genesis;
    if (!genesis || event.worktree_id !== genesis.worktree_id) return false;
    const identity = event.subject_identity;
    if (identity.authority_commit !== identity.base_commit
      || identity.target_commit !== context.snapshot.tree_hash
      || identity.scope_hash !== payload.plan_hash
      || identity.subject_hash !== payload.snapshot_hash
      || identity.contract_hash !== payload.contract_hash
      || identity.command_hash !== payload.check_fingerprint
      || identity.env_provider_id !== `verification-execution/${payload.toolchain_hash}`) return false;
    const selfBoundCacheKey = cacheKeyFromIdentity({
      check,
      snapshotHash: payload.snapshot_hash,
      toolchainHash: payload.toolchain_hash,
      inputsHash: payload.inputs_hash,
    });
    if (selfBoundCacheKey !== payload.cache_key) return false;
    const stored = readValidRunResult(context, payload);
    if (!stored || (requirePass && !stored.passed)) return false;
    const normalized = { ...result, execution: "executed" as const };
    const ledgerProjection = (redactPayloadStrings(
      { result: stored } as unknown as JsonValue,
      collectDenylistSecretValues(),
    ) as unknown as { result: JsonValue }).result;
    return canonicalize(normalized as unknown as JsonValue) === canonicalize(ledgerProjection);
  });
}

/**
 * Validate a ledger-writer-projected report against immutable run evidence.
 * Callers must supply the materialized representation consumed by receipts,
 * after the evidence writer's canonical redaction pass. Raw execute/evaluate
 * output containing entropy-redacted leaves is outside this API boundary.
 * The report's frozen snapshot is verified while the current checkout may
 * have moved because receipt/archive readers consume historical facts.
 */
interface MaterializedVerificationInput {
  readonly repoRoot: string;
  readonly contractPath: string;
  /** Caller-verified archived contract bytes for a retired declared path. */
  readonly contractText?: string;
  readonly report: unknown;
  readonly env?: NodeJS.ProcessEnv;
  readonly current?: boolean;
}

export function validateMaterializedVerificationExecutionReport(input: MaterializedVerificationInput): VerificationExecutionReportValidation {
  return validateMaterializedOutcome(input, true);
}

/** Observer admission retains negative immutable outcomes without granting a pass. */
export function validateMaterializedVerificationExecutionOutcome(input: MaterializedVerificationInput): VerificationExecutionReportValidation {
  return validateMaterializedOutcome(input, false);
}

function validateMaterializedOutcome(input: MaterializedVerificationInput, requirePass: boolean): VerificationExecutionReportValidation {
  const reportObject = objectValue(input.report, "verification report");
  if (reportObject.protocol !== 1 || reportObject.kind !== "verification_execution_report") {
    throw new Error("verification report protocol or kind is invalid");
  }
  if (requirePass && (reportObject.status !== "passed" || reportObject.passed !== true)) {
    throw new Error("verification report is not a passing evaluation");
  }
  const target = objectValue(reportObject.target, "verification report target");
  if (target.contract !== input.contractPath) throw new Error("verification report contract does not match the requested contract");
  const treeHash = stringValue(target.tree_hash, "verification report target.tree_hash");
  const snapshotHash = stringValue(target.snapshot_hash, "verification report target.snapshot_hash");
  if (snapshotHash !== sha256(canonicalize({ tree_hash: treeHash }))) throw new Error("verification report snapshot hash is invalid");

  const repoRoot = resolve(input.repoRoot);
  const contractText = input.contractText ?? resolveContract(repoRoot, input.contractPath).text;
  const plan = parseVerificationPlanFromContractText(contractText);
  if (plan.checks.length === 0) throw new Error("verification evidence is unavailable: empty_plan");
  const planHash = hashVerificationPlan(plan);
  if (target.plan_hash !== planHash) throw new Error("verification report plan hash does not match current contract authority");
  const env = input.env ?? process.env;
  const currentToolchainHash = input.current ? resolveToolchain(env).hash : null;
  const context: EvidenceContext = {
    repoRoot,
    contractPath: input.contractPath,
    contractText,
    contractHash: sha256(contractText),
    plan,
    planHash,
    snapshot: {
      head_commit: stringValue(target.head_commit, "verification report target.head_commit"),
      tree_hash: treeHash,
      snapshot_hash: snapshotHash,
    },
    env,
  };
  const ledger = ledgerView(context);
  if (!Array.isArray(reportObject.results) || reportObject.results.length !== plan.checks.length) {
    throw new Error("verification report results do not cover the plan exactly");
  }
  const expectedByMaterializedId = new Map<string, VerificationCheck>();
  for (const check of plan.checks) {
    const materializedId = materializedVerificationCheckId(check.id);
    if (expectedByMaterializedId.has(materializedId)) {
      throw new Error("verification report result ids are ambiguous after materialization");
    }
    expectedByMaterializedId.set(materializedId, check);
  }
  const supplied = new Map<string, VerificationExecutionResult>();
  for (const raw of reportObject.results) {
    const candidate = objectValue(raw, "verification report result") as unknown as VerificationExecutionResult;
    if (typeof candidate.id !== "string") throw new Error("verification report result ids are missing or invalid");
    const check = expectedByMaterializedId.get(candidate.id);
    if (!check) throw new Error(`verification report result id is unknown: ${candidate.id}`);
    if (supplied.has(check.id)) throw new Error("verification report result ids are duplicated");
    supplied.set(check.id, candidate);
  }
  if (supplied.size !== plan.checks.length) {
    throw new Error("verification report result ids do not cover the plan exactly");
  }
  for (const check of plan.checks) {
    const result = supplied.get(check.id);
    if (!result || result.kind !== check.kind || typeof result.passed !== "boolean" || (requirePass && result.passed !== true)) throw new Error(`verification report result is invalid: ${check.id}`);
    if (check.evidence_policy === "current_exact") {
      // A failed preflight skips later checks. Those skipped results must not
      // remove the authority of the recorded failure from a negative outcome.
      const skipped = !requirePass && result.execution === "missing" && isMaterializedSkippedResult(check, result);
      if (result.target !== "current_exact" || (!skipped && result.execution !== "executed" && result.execution !== "reused")) {
        throw new Error(`verification report exact result has invalid disposition: ${check.id}`);
      }
      if (!skipped && !matchingImmutableExecution(context, check, result, requirePass, currentToolchainHash, ledger)) {
        throw new Error(`verification report exact result is not backed by immutable evidence: ${check.id}`);
      }
    }
  }
  for (const check of plan.checks) {
    if (check.evidence_policy !== "baseline_with_delta") continue;
    const result = supplied.get(check.id)!;
    const evaluated = baselineResult(context, check, supplied, ledger);
    if (requirePass && !evaluated.passed) {
      throw new Error(`verification report baseline result is not backed by immutable evidence: ${check.id}`);
    }
    const projectedExpected = (redactPayloadStrings(
      { result: evaluated } as unknown as JsonValue,
      collectDenylistSecretValues(),
    ) as unknown as { result: JsonValue }).result;
    if (canonicalize(result as unknown as JsonValue) !== canonicalize(projectedExpected)) {
      throw new Error(`verification report baseline result was altered: ${check.id}`);
    }
  }
  const results = plan.checks.map((check) => supplied.get(check.id)!);
  const expected = buildReport(context, results, results.every(result => result.passed) ? "passed" : "failed", false);
  if (!requirePass && (reportObject.status !== expected.status || reportObject.passed !== expected.passed)) throw new Error("verification report outcome is inconsistent");
  const evaluation = objectValue(reportObject.evaluation, "verification report evaluation");
  const projectedEvaluation = redactPayloadStrings(
    expected.evaluation as unknown as JsonValue,
    collectDenylistSecretValues(),
  );
  if (canonicalize(evaluation as JsonValue) !== canonicalize(projectedEvaluation)) {
    throw new Error("verification report evaluation metadata is inconsistent");
  }
  return { valid: true, report: input.report as VerificationExecutionReport };
}

export function verificationOutcomeProvenance(input: MaterializedVerificationInput, checkId: string) {
  const { report } = validateMaterializedVerificationExecutionOutcome(input);
  const plan = parseVerificationPlanFromContractText(input.contractText ?? resolveContract(input.repoRoot, input.contractPath).text);
  const result = report.results.find(item => item.id === materializedVerificationCheckId(checkId));
  if (!result) throw new Error("verification check is absent");
  const events = readAcceptedEvents(input.repoRoot).accepted;
  const offset = events.slice().reverse().findIndex(event => {
    const payload = payloadOf(input.repoRoot, event);
    return payload?.execution_id === result.execution_id
      && matchesLedgerCheckId(payload.check_id, checkId)
      && payload.cache_key === result.cache_key;
  });
  if (offset < 0) throw new Error("verification sequence is unavailable");
  const index = events.length - 1 - offset;
  const payload = payloadOf(input.repoRoot, events[index]!)!;
  return { report, result, execution_order: index + 1,
    environment: `verification-execution/${payload.toolchain_hash}`,
    contract_identity: payload.contract_hash,
    check_set_identity: sha256(canonicalize(plan.checks.map(check => check.id))),
  };
}

export function verificationContractProvenance(repoRoot: string, contractPath: string, env: NodeJS.ProcessEnv = process.env) {
  const contractText = resolveContract(repoRoot, contractPath).text;
  const plan = parseVerificationPlanFromContractText(contractText);
  return { contract_identity: sha256(contractText),
    check_set_identity: sha256(canonicalize(plan.checks.map(check => check.id))),
    environment: resolveToolchain(env).providerId, check_ids: plan.checks.map(check => check.id) };
}

function subjectIdentity(context: PreparedContext, check: VerificationCheck, key: string): SubjectIdentity {
  return {
    authority_commit: context.snapshot.head_commit,
    base_commit: context.snapshot.head_commit,
    target_commit: context.snapshot.tree_hash,
    scope_hash: context.planHash,
    subject_hash: context.snapshot.snapshot_hash,
    contract_hash: context.contractHash,
    command_hash: fingerprintVerificationCheck(check),
    env_provider_id: context.envProviderId,
  };
}

function ensureGenesis(context: PreparedContext): void {
  if (readGenesisRecord(context.repoRoot)) return;
  const worktreeId = basename(context.contractPath).replace(/\.contract\.md$/, "");
  appendGenesisRecord(context.repoRoot, LEDGER_EPOCH_START_SHA, { worktreeId });
}

interface ExecutedCheckOutcome {
  readonly result: VerificationExecutionResult;
  readonly snapshotStable: boolean;
}

function executeCheck(
  context: PreparedContext,
  check: VerificationCheck,
  input: ExecuteVerificationContractInput,
  deadlineMs: number,
): ExecutedCheckOutcome | "waiting" {
  const key = cacheKey(context, check);
  const commonDir = resolveGitCommonDirectory(context.repoRoot, context.env.REPO_HARNESS_GIT_BIN || "git");
  let requestLock;
  try {
    requestLock = acquireExclusiveDirectoryLock(commonDir, `${REQUEST_LOCK_ROOT}/${key.slice("sha256:".length)}.lock`, {
      waitTimeoutMs: 1,
      reclaimStaleOwner: true,
      reclaimStaleEmptyDirectory: true,
    });
  } catch (error) {
    if (error instanceof ExclusiveLockContentionError) return "waiting";
    throw error;
  }
  try {
    requestLock.assertOwned();
    // Another writer can append before this lock is held, so read a new view.
    const afterLock = input.forceReason ? null : reusableResult(context, check, ledgerView(context));
    if (afterLock) return { result: afterLock, snapshotStable: true };
    const invocation = check.kind === "command"
      ? {
          command: context.env.REPO_HARNESS_BASH_BIN || "/bin/bash",
          args: ["--noprofile", "--norc", "-c", check.command] as readonly string[],
          cwd: resolveExecutionCwd(context.repoRoot, check.cwd),
        }
      : resolvePackageTest(context, check);
    const started = Date.now();
    const run = runProcess(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: verificationChildEnv(context.env),
      inheritEnv: false,
      timeoutMs: Math.max(1, deadlineMs - Date.now()),
      maxOutputBytes: VERIFICATION_DIAGNOSTIC_MAX_BYTES,
      processGroup: true,
      ...(check.cost === "expensive"
        ? { expensiveRunLock: { cwd: context.repoRoot, gitBin: context.env.REPO_HARNESS_GIT_BIN || "git" } }
        : {}),
    });
    // Keep protocol ids below the ledger's generic high-entropy token length;
    // hashes carry cryptographic identity, while this id only correlates the
    // immutable run file and event.
    let snapshotStable = false;
    let snapshotDiagnostic: string | null = null;
    try {
      const afterRun = captureGitVirtualTreeSnapshot(context.repoRoot);
      snapshotStable = afterRun.snapshot_hash === context.snapshot.snapshot_hash;
      if (!snapshotStable) snapshotDiagnostic = "repository snapshot changed during execution";
    } catch {
      snapshotDiagnostic = "repository snapshot could not be captured after execution";
    }
    const passed = run.ok && snapshotStable;
    const executionId = `vx-${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const runFile = `.ai/harness/runs/verification-${executionId}.json`;
    const failureLogFile = passed ? null : `.ai/harness/runs/verification-${executionId}.log`;
    const message = passed
      ? "check passed"
      : run.timedOut
        ? `check timed out; diagnostics: ${failureLogFile}`
        : run.signal !== null
          ? `check terminated by ${run.signal}; diagnostics: ${failureLogFile}`
          : !run.ok
            ? `check exited ${run.status}; diagnostics: ${failureLogFile}`
            : `check exited successfully but ${snapshotDiagnostic}; diagnostics: ${failureLogFile}`;
    const result: VerificationExecutionResult = {
      id: check.id,
      kind: check.kind,
      target: "current_exact",
      passed,
      message,
      duration_ms: Date.now() - started,
      timed_out: run.timedOut,
      exit_code: run.signal === null ? run.status : null,
      signal: run.signal,
      execution: "executed",
      cache_key: key,
      command: run.command.join(" "),
      force_reason: input.forceReason?.trim() || null,
      execution_id: executionId,
      run_file: runFile,
      failure_log_file: failureLogFile,
    };
    if (failureLogFile) {
      const failureLogPath = resolveInsideRepo(context.repoRoot, failureLogFile);
      if (!failureLogPath.ok || !failureLogPath.path) throw new Error(failureLogPath.error ?? "invalid failure log path");
      const diagnostics = redactKnownEnvironmentValues(
        [message, run.stdout, run.stderr || run.error].filter(Boolean).join("\n"),
        context.env,
      );
      createFileExclusiveDurably(failureLogPath.path, Buffer.from(`${diagnostics}\n`, "utf8"));
    }
    const durableRecord = {
      protocol: 1,
      kind: "verification_execution_record",
      execution_id: executionId,
      cache_key: key,
      result,
    } as const;
    const runPath = resolveInsideRepo(context.repoRoot, runFile);
    if (!runPath.ok || !runPath.path) throw new Error(runPath.error ?? "invalid verification run path");
    const durableBytes = Buffer.from(`${JSON.stringify(durableRecord, null, 2)}\n`, "utf8");
    createFileExclusiveDurably(runPath.path, durableBytes);
    ensureGenesis(context);
    const genesis = readGenesisRecord(context.repoRoot)!;
    const payload: ExecutionPayload = {
      protocol: 1,
      contract_path: context.contractPath,
      contract_hash: context.contractHash,
      plan_hash: context.planHash,
      check_id: check.id,
      check_fingerprint: fingerprintVerificationCheck(check),
      execution_spec_hash: fingerprintVerificationCheckExecution(check),
      inputs_hash: declaredEnvironmentHash(check, context.env),
      toolchain_hash: context.toolchainHash,
      snapshot_hash: context.snapshot.snapshot_hash,
      cache_key: key,
      execution_id: executionId,
      run_file: runFile,
      run_record_hash: sha256(durableBytes),
      passed: result.passed,
    };
    requestLock.assertOwned();
    appendEvidenceEvent(context.repoRoot, {
      worktreeId: genesis.worktree_id,
      eventType: EVENT_TYPE,
      trustClass: "authoritative_machine",
      producer: PRODUCER,
      correlationRunId: executionId,
      subjectIdentity: subjectIdentity(context, check, key),
      payload: { kind: "json", value: payload as unknown as JsonValue },
    });
    return { result, snapshotStable };
  } finally {
    requestLock.release();
  }
}

/** The existing report writer and direct readers consume the same ledger-safe projection. */
export function materializeVerificationExecutionReport(report: VerificationExecutionReport): VerificationExecutionReport {
  return redactPayloadStrings(report as unknown as JsonValue, collectDenylistSecretValues()) as unknown as VerificationExecutionReport;
}

export function writeVerificationExecutionReport(
  repoRoot: string,
  relativePath: string,
  report: VerificationContractOutcome,
): void {
  if (report.kind !== "verification_execution_report") throw new Error(`verification evidence is unavailable: ${report.reason}`);
  const outputPath = isAbsolute(relativePath) ? relativePath : resolve(repoRoot, relativePath);
  writeFileDurably(outputPath, `${JSON.stringify(materializeVerificationExecutionReport(report), null, 2)}\n`);
}

/** The only command-spawning Verification Plan effect. */
export function executeVerificationContract(input: ExecuteVerificationContractInput): VerificationContractOutcome {
  if (input.forceReason !== undefined && input.forceReason.trim().length === 0) {
    throw new Error("forceReason must be non-empty when provided");
  }
  const budgetMs = input.timeoutMs ?? 3_600_000;
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 1) throw new Error("timeoutMs must be a positive integer");
  const deadlineMs = Date.now() + budgetMs;
  const context = prepare(input);
  if ("kind" in context) return context;
  const results = new Map<string, VerificationExecutionResult>();
  let waiting = false;
  let needsPlan = false;
  let executionEligibilityFailed = false;
  let preflightFailed = false;
  let baselinePreflightsEvaluated = false;

  const evaluateBaselinePreflights = (): void => {
    if (baselinePreflightsEvaluated) return;
    baselinePreflightsEvaluated = true;
    const ledger = ledgerView(context);
    for (const check of context.plan.checks) {
      if (check.phase !== "preflight" || check.evidence_policy !== "baseline_with_delta") continue;
      const result = baselineResult(context, check, results, ledger);
      results.set(check.id, result);
      if (!result.passed) preflightFailed = true;
    }
  };

  const ordered = [...context.plan.checks].sort((left, right) =>
    (left.phase === right.phase ? 0 : left.phase === "preflight" ? -1 : 1));
  for (const check of ordered) {
    if (check.phase === "verification") evaluateBaselinePreflights();
    if (check.evidence_policy !== "current_exact") continue;
    if (preflightFailed) {
      results.set(check.id, missingResult(context, check, "not run because preflight failed"));
      continue;
    }
    // executeCheck appends to the ledger, so each check reads a new view.
    const ledger = ledgerView(context);
    const reused = input.forceReason ? null : reusableResult(context, check, ledger);
    if (reused) {
      results.set(check.id, reused);
      continue;
    }
    if (check.cost === "expensive" && priorExecutionExists(context, check, ledger) && !input.forceReason) {
      results.set(check.id, missingResult(context, check, "expensive input drift requires a new Verification Plan or an explicit force reason"));
      needsPlan = true;
      if (check.phase === "preflight") preflightFailed = true;
      continue;
    }
    const result = executeCheck(context, check, input, deadlineMs);
    if (result === "waiting") {
      results.set(check.id, missingResult(context, check, "an identical execution request is already running"));
      waiting = true;
      if (check.phase === "preflight") preflightFailed = true;
      continue;
    }
    results.set(check.id, result.result);
    if (!result.snapshotStable) executionEligibilityFailed = true;
    if (check.phase === "preflight" && !result.result.passed) preflightFailed = true;
  }
  evaluateBaselinePreflights();

  const finalLedger = ledgerView(context);
  const planOrder = context.plan.checks.map((check) => check.evidence_policy === "current_exact"
    ? results.get(check.id) ?? missingResult(context, check, "current exact execution is missing")
    : baselineResult(context, check, results, finalLedger));
  let snapshotChanged = false;
  try {
    snapshotChanged = captureGitVirtualTreeSnapshot(context.repoRoot).snapshot_hash !== context.snapshot.snapshot_hash;
  } catch {
    snapshotChanged = true;
  }
  let status: VerificationReportStatus;
  const processFailed = planOrder.some((result) => result.execution === "executed"
    && !result.passed
    && (result.exit_code !== 0 || result.timed_out || result.signal !== null));
  if (waiting) status = "waiting";
  else if (processFailed) status = "failed";
  else if (needsPlan || executionEligibilityFailed || snapshotChanged) status = "needs_verification_plan";
  else if (preflightFailed) status = "failed";
  else if (planOrder.every((result) => result.passed)) status = "passed";
  else status = "missing";
  const report = buildReport(context, planOrder, status, snapshotChanged);
  if (input.reportFile) writeVerificationExecutionReport(context.repoRoot, input.reportFile, report);
  return report;
}
