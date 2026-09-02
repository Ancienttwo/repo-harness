import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  realpathSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeSync,
  accessSync,
  type Stats,
} from 'fs';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'path';

import {
  CODEX_READ_ONLY_ADAPTER_KIND,
  CODEX_READ_ONLY_ARGV_TEMPLATE,
  CODEX_READ_ONLY_PROOF_SURFACE,
  DelegationError,
  assertDelegatedRunTransition,
  buildCodexReadOnlyCapabilityReceipt,
  buildDelegatedRunIntent,
  buildDelegatedRunLaunchClaim,
  buildDelegatedRunObservation,
  buildDelegationAdmissionReceipt,
  buildDelegationEnvelope,
  buildDelegationExecutionPacket,
  buildLogicalRoleProfile,
  buildWorkerResult,
  buildWorkerRunRef,
  canonicalCodexReadOnlyCapabilityReceiptBytes,
  canonicalDelegatedRunIntentBytes,
  canonicalDelegatedRunLaunchClaimBytes,
  canonicalDelegatedRunObservationBytes,
  canonicalDelegationAdmissionReceiptBytes,
  canonicalDelegationEnvelopeBytes,
  canonicalDelegationExecutionPacketBytes,
  canonicalLogicalRoleProfileBytes,
  canonicalWorkerResultBytes,
  canonicalWorkerRunRefBytes,
  deriveDelegatedRunDispatchId,
  validateCodexReadOnlyCapabilityReceipt,
  validateDelegatedRunIntent,
  validateDelegatedRunLaunchClaim,
  validateDelegatedRunObservation,
  validateDelegationAdmissionReceipt,
  validateDelegationEnvelope,
  validateDelegationExecutionPacket,
  validateLogicalRoleProfile,
  validateWorkerEvidenceRefs,
  validateWorkerResult,
  validateWorkerRunRef,
  type CodexReadOnlyCapabilityReceiptV1,
  type DelegatedRunFailureClass,
  type DelegatedRunIntentV1,
  type DelegatedRunLaunchClaimV1,
  type DelegatedRunObservationV1,
  type DelegatedRunState,
  type DelegationAdmissionReceiptV1,
  type DelegationEnvelopeV1,
  type DelegationExecutionPacketV1,
  type DelegationRejectionReason,
  type LogicalRoleProfileV1,
  type WorkerEvidenceRefV1,
  type WorkerResultV1,
  type WorkerRunRefV1,
} from '../../core/engineers/delegation';
import { canonicalMessageBytes, canonicalMessageDigest, messageSha256 } from '../../core/messages/mechanics';
import { type ClaimActorReceiptV1 } from '../../core/engineers/principal-claim';
// The dispatch effect owns the collaboration fence, so this module imports the
// collaboration plane that already imports this one's readers. The cycle is
// resolvable because every edge in both directions is a function declaration
// called at run time; neither module reads the other at evaluation time, and
// nothing here may start doing so.
import { fenceCollaborationDispatch } from '../collaboration/context-delivery';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { runProcess, type ProcessRunResult } from '../process-runner';
import { writeBlob } from '../evidence/blob-store';
import { resolveBlobsDir } from '../evidence/paths';
import { validateClaimActorReceiptLive } from './claim-actor-store';
import { type WorkEnvelopeV1 } from '../fleet/acquire';

export const DELEGATED_RUN_STORE_RELATIVE_ROOT = 'repo-harness/delegated-runs/v1';
/** Codex JSONL includes tool events before the final message and usage receipt. */
export const CODEX_DELEGATED_RUN_MAX_OUTPUT_BYTES = 1024 * 1024;
const STORE_COMPONENTS = Object.freeze(['profiles', 'capabilities', 'packets', 'envelopes', 'admissions', 'intents', 'launch-claims', 'observations', 'process-receipts', 'run-refs', 'results', 'current'] as const);
const SHA = /^sha256:[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ROLE = /^[a-z][a-z0-9-]{0,63}$/u;
const EVIDENCE_BLOB_REF = /^evidence-blob:([0-9a-f]{64})$/u;
const CANARY_WORKTREE_PATH = '.repo-harness-read-only-canary-worktree';
const CANARY_COMMON_PATH = '.repo-harness-read-only-canary-common';
const CODEX_CLI_VERSION = /^codex-cli \d+\.\d+\.\d+$/u;

type StoreKind = typeof STORE_COMPONENTS[number];
type ImmutableStoreKind = Exclude<StoreKind, 'current'>;

export type DelegatedRunStoreErrorCode =
  | 'delegated_run_invalid'
  | 'delegated_run_not_found'
  | 'delegated_run_conflict'
  | 'delegated_run_admission_rejected'
  | 'delegated_run_parent_stale'
  | 'delegated_run_profile_unavailable'
  | 'delegated_run_profile_stale'
  | 'delegated_run_capability_stale'
  | 'delegated_run_snapshot_changed'
  | 'delegated_run_transition_invalid'
  | 'delegated_run_unsafe_path';

export class DelegatedRunStoreError extends Error {
  constructor(readonly code: DelegatedRunStoreErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'DelegatedRunStoreError';
  }
}

export interface CodexProcessReceiptV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-codex-read-only-process-receipt';
  readonly dispatch_id: string;
  readonly intent_sha256: string;
  readonly executable_path: string;
  readonly argv: readonly string[];
  /** Digest of the exact minimal environment set handed to the child process. */
  readonly env_sha256: string;
  readonly exit_code: number;
  readonly timed_out: boolean;
  readonly stdout_sha256: string;
  readonly stdout_ref: string;
  readonly stderr_sha256: string;
  readonly stderr_ref: string;
  readonly error_sha256: string;
  readonly error_ref: string;
  readonly before_snapshot_sha256: string;
  readonly after_snapshot_sha256: string;
  readonly observed_at: string;
  readonly process_receipt_sha256: string;
}

export interface DelegatedRunStatus {
  readonly intent: DelegatedRunIntentV1;
  readonly current: DelegatedRunObservationV1;
  readonly observation: DelegatedRunObservationV1;
  readonly launch_claim: DelegatedRunLaunchClaimV1 | null;
  readonly run_ref: WorkerRunRefV1 | null;
  readonly result: WorkerResultV1 | null;
}

export interface AdmitReadOnlyDelegationInput {
  readonly repo_root: string;
  readonly envelope: DelegationEnvelopeV1;
  readonly role_profile: LogicalRoleProfileV1;
  readonly capability: CodexReadOnlyCapabilityReceiptV1;
  readonly execution_packet: DelegationExecutionPacketV1;
  readonly work_envelope: WorkEnvelopeV1;
  readonly claim_actor_receipt: ClaimActorReceiptV1;
  readonly decided_at: string;
  /** Tests may replace the live authority reader; production always revalidates it. */
  readonly validate_parent?: (cwd: string, receipt: ClaimActorReceiptV1, envelope: WorkEnvelopeV1) => ClaimActorReceiptV1;
}

export interface PrepareDelegatedRunInput {
  readonly repo_root: string;
  readonly idempotency_key: string;
  readonly delegation_id: string;
  readonly admission_receipt_sha256: string;
  readonly context_packet_sha256: string;
  readonly round_index: number;
  readonly observed_at: string;
}

export interface DispatchDelegatedRunInput {
  readonly repo_root: string;
  readonly dispatch_id: string;
  readonly observed_at: string;
  /** Exact protected roots, e.g. worktree:tasks/current.md or common:config. */
  readonly protected_paths: readonly string[];
  /** Fail-closed fault injection only; it cannot manufacture a successful Host receipt. */
  readonly crash_hook?: (boundary: 'after_launch_claim_persisted' | 'after_host_action_before_receipt') => void;
}

export interface CollectDelegatedRunInput {
  readonly repo_root: string;
  readonly dispatch_id: string;
  readonly untrusted_claims: readonly string[];
  /**
   * Host-derived references the caller wants this run's result to point at, in
   * addition to the three process-evidence blobs assembled below.
   *
   * It is required rather than optional so every call site states whether this
   * run produced anything beyond its own process evidence. The collaboration
   * collector passes the contribution commit it just published, which is how
   * `WorkerResultV1` references that commit without a protocol bump: `ref` is
   * already a free printable string. Every other caller passes an empty list,
   * and that is a statement, not a default.
   *
   * The direction of the dependency is why this is an input at all. The
   * collaboration plane reads the delivery plane and never the reverse, so this
   * module cannot import a collaboration record to derive the reference itself.
   */
  readonly contribution_refs: readonly WorkerEvidenceRefV1[];
}

/** Public capability admission request. Runtime facts are always host-derived. */
export interface ReadOnlyCapabilityRequest {
  readonly logical_role: string;
  readonly observed_at: string;
}

function fail(code: DelegatedRunStoreErrorCode, message: string, cause?: unknown): never {
  throw new DelegatedRunStoreError(code, message, cause);
}

function digest(value: string, label: string): string {
  if (!SHA.test(value)) fail('delegated_run_invalid', `${label} is invalid`);
  return value;
}

function dispatchId(value: string): string {
  return digest(value, 'dispatch_id');
}

function safeRole(value: string): string {
  if (!ROLE.test(value)) fail('delegated_run_invalid', 'logical role is invalid');
  return value;
}

function assertCapabilityRequest(value: ReadOnlyCapabilityRequest): ReadOnlyCapabilityRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('delegated_run_invalid', 'capability request is invalid');
  const record = value as unknown as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['logical_role', 'observed_at'])) fail('delegated_run_invalid', 'capability request fields are invalid');
  safeRole(value.logical_role);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value.observed_at)) fail('delegated_run_invalid', 'observed_at is invalid');
  return value;
}

/**
 * Exact environment keys handed to every Codex child process.  Both entries are
 * required for the CLI to start at all: `PATH` resolves the sandbox launcher and
 * the tools Codex runs inside it, and `HOME` resolves the default `CODEX_HOME`
 * that carries authentication state (`--ignore-user-config` suppresses
 * `config.toml`, not `auth.json`).  No credential key is forwarded: Codex reads
 * its bearer token from that home file, so the environment never has to carry
 * one.  Every other parent variable is withheld.
 */
const CODEX_CHILD_ENV_KEYS = Object.freeze(['HOME', 'PATH'] as const);

function codexChildEnvironment(): { readonly env: NodeJS.ProcessEnv; readonly sha256: string } {
  const selected: Record<string, string> = {};
  for (const key of CODEX_CHILD_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value !== 'string') fail('delegated_run_capability_stale', `Host environment lacks required child variable ${key}`);
    selected[key] = value;
  }
  return Object.freeze({
    env: Object.freeze({ ...selected }),
    sha256: canonicalMessageDigest({ domain: 'repo-harness-delegated-run-child-env.v1', env: selected }),
  });
}

function findCodexOnHostPath(): string {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, 'codex');
    try {
      const lexical = lstatSync(candidate);
      if (!lexical.isFile() && !lexical.isSymbolicLink()) continue;
      const actual = realpathSync(candidate);
      const stat = lstatSync(actual);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      accessSync(actual, constants.X_OK);
      return actual;
    } catch {
      // Keep scanning the host PATH; no caller-selected executable is accepted.
    }
  }
  fail('delegated_run_capability_stale', 'codex executable is unavailable on Host PATH');
}

function readCodexCliVersion(executablePath: string): string {
  let version: string;
  try { version = execFileSync(executablePath, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (error) {
    throw new DelegatedRunStoreError('delegated_run_capability_stale', 'codex executable version cannot be read', error);
  }
  if (!CODEX_CLI_VERSION.test(version)) fail('delegated_run_capability_stale', 'codex executable did not report an exact codex-cli semver');
  return version;
}

function verifyCapabilityExecutable(executablePath: string, expectedSha256: string, expectedVersion: string): string {
  if (!isAbsolute(executablePath) || executablePath.includes('\0')) fail('delegated_run_capability_stale', 'admitted executable path must be absolute');
  let actual: string;
  try { actual = realpathSync(executablePath); } catch (error) { throw new DelegatedRunStoreError('delegated_run_capability_stale', 'admitted executable is unavailable', error); }
  let stat: ReturnType<typeof lstatSync>;
  try { stat = lstatSync(actual); } catch (error) { throw new DelegatedRunStoreError('delegated_run_capability_stale', 'admitted executable cannot be inspected', error); }
  if (!stat.isFile() || stat.isSymbolicLink() || messageSha256(readFileSync(actual)) !== expectedSha256) fail('delegated_run_capability_stale', 'admitted executable bytes changed');
  let version: string;
  try { version = execFileSync(actual, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (error) { throw new DelegatedRunStoreError('delegated_run_capability_stale', 'admitted executable version cannot be revalidated', error); }
  if (version !== expectedVersion) fail('delegated_run_capability_stale', 'admitted executable version changed');
  return actual;
}

function storePath(repoRoot: string, kind: StoreKind, create: boolean): string {
  let current = resolveGitCommonDirectory(repoRoot);
  for (const component of [...DELEGATED_RUN_STORE_RELATIVE_ROOT.split('/'), kind]) {
    current = join(current, component);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw new DelegatedRunStoreError('delegated_run_not_found', `delegated run ${kind} store is unavailable`, error);
      try { mkdirSync(current, { mode: 0o700 }); } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw new DelegatedRunStoreError('delegated_run_unsafe_path', `cannot create delegated run ${kind} store`, mkdirError);
      }
      try { stat = lstatSync(current); } catch (statError) { throw new DelegatedRunStoreError('delegated_run_unsafe_path', `cannot verify delegated run ${kind} store`, statError); }
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('delegated_run_unsafe_path', `delegated run ${kind} store ancestor is unsafe`);
  }
  return current;
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function writeAll(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}

function readRegular(path: string, label: string): Buffer {
  let stat: ReturnType<typeof lstatSync>;
  try { stat = lstatSync(path); } catch (error) { throw new DelegatedRunStoreError('delegated_run_not_found', `${label} is unavailable`, error); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('delegated_run_unsafe_path', `${label} is not a regular file`);
  try { return readFileSync(path); } catch (error) { throw new DelegatedRunStoreError('delegated_run_not_found', `${label} is unreadable`, error); }
}

function immutablePath(repoRoot: string, kind: ImmutableStoreKind, valueDigest: string, create = false): string {
  return join(storePath(repoRoot, kind, create), `${digest(valueDigest, `${kind} digest`).slice('sha256:'.length)}.json`);
}

function persistImmutable(repoRoot: string, kind: ImmutableStoreKind, valueDigest: string, canonical: string): void {
  const target = immutablePath(repoRoot, kind, valueDigest, true);
  const directory = dirname(target);
  const bytes = Buffer.from(`${canonical}\n`, 'utf8');
  if (existsSync(target)) {
    if (!readRegular(target, `${kind} evidence`).equals(bytes)) fail('delegated_run_conflict', `${kind} digest already contains different bytes`);
    return;
  }
  const temporary = join(directory, `.${valueDigest.slice('sha256:'.length)}.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
  } finally { if (fd !== null) closeSync(fd); }
  try {
    // Link publication never replaces an existing digest path.  That makes a
    // content-address collision/concurrent writer observable instead of
    // allowing rename(2) to overwrite immutable evidence on POSIX.
    linkSync(temporary, target);
    fsyncDirectory(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new DelegatedRunStoreError('delegated_run_conflict', `cannot persist ${kind}`, error);
    if (!readRegular(target, `${kind} evidence`).equals(bytes)) fail('delegated_run_conflict', `${kind} digest already contains different bytes`);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

function readImmutable<T>(repoRoot: string, kind: ImmutableStoreKind, valueDigest: string, validate: (value: unknown) => T, canonical: (value: T) => string): T {
  const raw = readRegular(immutablePath(repoRoot, kind, valueDigest), `${kind} evidence`);
  let value: unknown;
  try { value = JSON.parse(raw.toString('utf8')); } catch (error) { throw new DelegatedRunStoreError('delegated_run_invalid', `${kind} evidence is not JSON`, error); }
  let result: T;
  try { result = validate(value); } catch (error) { throw new DelegatedRunStoreError('delegated_run_invalid', `${kind} evidence is invalid`, error); }
  if (!raw.equals(Buffer.from(`${canonical(result)}\n`, 'utf8'))) fail('delegated_run_conflict', `${kind} evidence is not canonical`);
  return result;
}

function currentPath(repoRoot: string, id: string, create = false): string {
  return join(storePath(repoRoot, 'current', create), `${dispatchId(id).slice('sha256:'.length)}.json`);
}

function writeCurrent(repoRoot: string, observation: DelegatedRunObservationV1): void {
  const target = currentPath(repoRoot, observation.dispatch_id, true);
  const directory = dirname(target);
  const bytes = Buffer.from(`${canonicalDelegatedRunObservationBytes(observation)}\n`, 'utf8');
  const temporary = join(directory, `.${observation.dispatch_id.slice('sha256:'.length)}.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeAll(fd, bytes); fsyncSync(fd);
  } finally { if (fd !== null) closeSync(fd); }
  try { renameSync(temporary, target); fsyncDirectory(directory); } catch (error) {
    throw new DelegatedRunStoreError('delegated_run_conflict', 'cannot publish current delegated run observation', error);
  } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}

function readCurrent(repoRoot: string, id: string): DelegatedRunObservationV1 {
  const raw = readRegular(currentPath(repoRoot, id), 'delegated run current');
  let value: DelegatedRunObservationV1;
  try { value = validateDelegatedRunObservation(JSON.parse(raw.toString('utf8'))); } catch (error) { throw new DelegatedRunStoreError('delegated_run_invalid', 'delegated run current is invalid', error); }
  if (raw.toString('utf8') !== `${canonicalDelegatedRunObservationBytes(value)}\n`) fail('delegated_run_conflict', 'delegated run current is not canonical');
  return value;
}

function lockRelative(id: string): string {
  return `${DELEGATED_RUN_STORE_RELATIVE_ROOT}/locks/${dispatchId(id).slice('sha256:'.length)}.lock`;
}

function withDispatchLock<T>(repoRoot: string, id: string, work: () => T): T {
  return withExclusiveDirectoryLock(resolveGitCommonDirectory(repoRoot), lockRelative(id), work, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

function tomlScalar(source: string, key: string): string | null {
  const match = source.match(new RegExp(`^${key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*=\\s*"([^"]*)"\\s*$`, 'm'));
  return match?.[1] ?? null;
}

function trackedRegularFile(repoRoot: string, relativePath: string): Buffer {
  if (isAbsolute(relativePath) || relativePath.includes('\0') || relativePath.split('/').includes('..')) fail('delegated_run_unsafe_path', 'role profile path is unsafe');
  const lexical = resolve(repoRoot, relativePath);
  const scoped = relative(repoRoot, lexical);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) fail('delegated_run_unsafe_path', 'role profile escapes repository');
  // Absence is a typed, distinct outcome from a changed profile, and every
  // message names the repository-relative path only; the Host absolute path is
  // never surfaced to a caller.
  const inspect = (path: string): Stats => {
    try { return lstatSync(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail('delegated_run_profile_unavailable', `logical Role Profile ${relativePath} is unavailable`);
      throw new DelegatedRunStoreError('delegated_run_unsafe_path', `logical Role Profile ${relativePath} cannot be inspected`, error);
    }
  };
  let current = repoRoot;
  for (const component of scoped.split(sep)) {
    current = join(current, component);
    if (inspect(current).isSymbolicLink()) fail('delegated_run_unsafe_path', 'role profile path contains a symlink');
  }
  if (!inspect(lexical).isFile()) fail('delegated_run_unsafe_path', 'role profile is not a regular file');
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relativePath], { cwd: repoRoot, stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (error) {
    throw new DelegatedRunStoreError('delegated_run_profile_stale', 'logical Role Profile is not tracked by Git', error);
  }
  try { return readFileSync(lexical); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail('delegated_run_profile_unavailable', `logical Role Profile ${relativePath} is unavailable`);
    throw new DelegatedRunStoreError('delegated_run_profile_stale', `logical Role Profile ${relativePath} is unreadable`, error);
  }
}

export function readLogicalRoleInstructions(repoRoot: string, profile: LogicalRoleProfileV1): string {
  const bytes = trackedRegularFile(repoRoot, profile.source_ref);
  const source = bytes.toString('utf8');
  const instructions = source.match(/^developer_instructions\s*=\s*'''([\s\S]*?)'''\s*$/m)?.[1] ?? null;
  if (instructions === null || messageSha256(bytes) !== profile.toml_sha256 || messageSha256(instructions) !== profile.developer_instructions_sha256) {
    fail('delegated_run_profile_stale', 'tracked logical Role Profile bytes changed');
  }
  return instructions;
}

/** Load a tracked TOML role as a logical profile; it never claims Provider-native identity. */
export function loadLogicalReadOnlyRoleProfile(repoRoot: string, logicalRole: string): LogicalRoleProfileV1 {
  const role = safeRole(logicalRole);
  const sourceRef = `.codex/agents/${role}.toml`;
  const bytes = trackedRegularFile(repoRoot, sourceRef);
  const source = bytes.toString('utf8');
  const name = tomlScalar(source, 'name');
  const model = tomlScalar(source, 'model');
  const declaredSandbox = tomlScalar(source, 'sandbox_mode');
  const instructions = source.match(/^developer_instructions\s*=\s*'''([\s\S]*?)'''\s*$/m)?.[1] ?? null;
  if (name !== role || !model || !instructions || declaredSandbox !== 'read-only') {
    fail('delegated_run_invalid', `logical Role Profile ${role} is not an exact tracked read-only profile`);
  }
  return buildLogicalRoleProfile({
    logical_role: role,
    source_ref: sourceRef,
    toml_sha256: messageSha256(bytes),
    model,
    developer_instructions_sha256: messageSha256(instructions),
    declared_sandbox_mode: 'read_only',
  });
}

export function delegatedRunProtectedScopeSha(paths: readonly string[]): string {
  const sorted = [...paths];
  let hasWorktree = false;
  let hasCommon = false;
  for (const value of sorted) {
    if (!/^(?:worktree|common):[^\0]*$/u.test(value) || value.includes('..') || value.endsWith(':')) {
      fail('delegated_run_invalid', 'protected path is invalid');
    }
    if (value.startsWith('worktree:')) hasWorktree = true;
    if (value.startsWith('common:')) hasCommon = true;
  }
  sorted.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (sorted.length === 0 || !hasWorktree || !hasCommon) fail('delegated_run_invalid', 'protected paths require explicit worktree and common regular-or-absent files');
  if (new Set(sorted).size !== sorted.length || paths.some((value, index) => value !== sorted[index])) fail('delegated_run_invalid', 'protected paths must be sorted and unique');
  return canonicalMessageDigest({ domain: 'repo-harness-delegated-run-protected-scope.v1', paths: sorted });
}

function snapshotOne(root: string, relativePath: string): { readonly path: string; readonly state: 'absent' | 'file'; readonly sha256: string | null } {
  if (relativePath.length === 0 || isAbsolute(relativePath) || relativePath.includes('\0') || relativePath.split('/').includes('..')) fail('delegated_run_invalid', 'protected snapshot path is invalid');
  const lexical = resolve(root, relativePath);
  const scoped = relative(root, lexical);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) fail('delegated_run_unsafe_path', 'protected snapshot path escapes root');
  let stat: ReturnType<typeof lstatSync>;
  try { stat = lstatSync(lexical); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.freeze({ path: relativePath, state: 'absent' as const, sha256: null }); throw error; }
  if (stat.isSymbolicLink() || !stat.isFile()) fail('delegated_run_unsafe_path', 'protected snapshot target is not a regular file');
  return Object.freeze({ path: relativePath, state: 'file' as const, sha256: messageSha256(readFileSync(lexical)) });
}

function protectedSnapshot(repoRoot: string, paths: readonly string[]): string {
  const scope = delegatedRunProtectedScopeSha(paths);
  const common = resolveGitCommonDirectory(repoRoot);
  const entries = paths.map((entry) => {
    const [prefix, ...rest] = entry.split(':');
    const relativePath = rest.join(':');
    return Object.freeze({ root: prefix, ...snapshotOne(prefix === 'worktree' ? repoRoot : common, relativePath) });
  });
  return canonicalMessageDigest({ domain: 'repo-harness-delegated-run-protected-snapshot.v1', scope, entries });
}

type ProfileAvailability = 'matches' | 'unavailable' | 'stale';

/** An absent tracked profile is a distinct admission outcome from a changed one. */
function profileAvailability(repoRoot: string, profile: LogicalRoleProfileV1): ProfileAvailability {
  try {
    return loadLogicalReadOnlyRoleProfile(repoRoot, profile.logical_role).role_profile_sha256 === profile.role_profile_sha256
      && readLogicalRoleInstructions(repoRoot, profile).length > 0 ? 'matches' : 'stale';
  } catch (error) {
    return error instanceof DelegatedRunStoreError && error.code === 'delegated_run_profile_unavailable' ? 'unavailable' : 'stale';
  }
}

function profileMatchesStored(repoRoot: string, profile: LogicalRoleProfileV1): boolean {
  return profileAvailability(repoRoot, profile) === 'matches';
}

function persistProfile(repoRoot: string, value: LogicalRoleProfileV1): void { persistImmutable(repoRoot, 'profiles', value.role_profile_sha256, canonicalLogicalRoleProfileBytes(value)); }
function persistCapability(repoRoot: string, value: CodexReadOnlyCapabilityReceiptV1): void { persistImmutable(repoRoot, 'capabilities', value.capability_sha256, canonicalCodexReadOnlyCapabilityReceiptBytes(value)); }
function persistPacket(repoRoot: string, value: DelegationExecutionPacketV1): void { persistImmutable(repoRoot, 'packets', value.packet_sha256, canonicalDelegationExecutionPacketBytes(value)); }
function persistEnvelope(repoRoot: string, value: DelegationEnvelopeV1): void { persistImmutable(repoRoot, 'envelopes', value.envelope_sha256, canonicalDelegationEnvelopeBytes(value)); }
function persistAdmission(repoRoot: string, value: DelegationAdmissionReceiptV1): void { persistImmutable(repoRoot, 'admissions', value.admission_receipt_sha256, canonicalDelegationAdmissionReceiptBytes(value)); }
function persistIntent(repoRoot: string, value: DelegatedRunIntentV1): void { persistImmutable(repoRoot, 'intents', value.intent_sha256, canonicalDelegatedRunIntentBytes(value)); }
function persistLaunchClaim(repoRoot: string, value: DelegatedRunLaunchClaimV1): void { persistImmutable(repoRoot, 'launch-claims', value.launch_claim_sha256, canonicalDelegatedRunLaunchClaimBytes(value)); }
function persistObservation(repoRoot: string, value: DelegatedRunObservationV1): void { persistImmutable(repoRoot, 'observations', value.observation_sha256, canonicalDelegatedRunObservationBytes(value)); }
function persistRunRef(repoRoot: string, value: WorkerRunRefV1): void { persistImmutable(repoRoot, 'run-refs', value.run_ref_sha256, canonicalWorkerRunRefBytes(value)); }
function persistResult(repoRoot: string, value: WorkerResultV1): void { persistImmutable(repoRoot, 'results', value.result_sha256, canonicalWorkerResultBytes(value)); }

function evidenceBlob(repoRoot: string, value: string): { readonly ref: string; readonly sha256: string } {
  const written = writeBlob(repoRoot, Buffer.from(value, 'utf8'));
  return Object.freeze({ ref: `evidence-blob:${written.sha256}`, sha256: `sha256:${written.sha256}` });
}

function readEvidenceBlob(repoRoot: string, ref: string, expectedSha256: string): Buffer {
  const matched = EVIDENCE_BLOB_REF.exec(ref);
  if (!matched || expectedSha256 !== `sha256:${matched[1]}`) fail('delegated_run_invalid', 'evidence blob reference is invalid');
  const target = join(resolveBlobsDir(repoRoot), matched[1]);
  const bytes = readRegular(target, 'process evidence blob');
  if (messageSha256(bytes) !== expectedSha256) fail('delegated_run_conflict', 'process evidence blob bytes changed');
  return bytes;
}

function canaryPaths(repoRoot: string): { readonly worktree: string; readonly common: string; readonly protectedPaths: readonly string[] } {
  const common = resolveGitCommonDirectory(repoRoot);
  return Object.freeze({
    worktree: join(repoRoot, CANARY_WORKTREE_PATH),
    common: join(common, CANARY_COMMON_PATH),
    protectedPaths: Object.freeze([`common:${CANARY_COMMON_PATH}`, `worktree:${CANARY_WORKTREE_PATH}`]),
  });
}

function assertCanaryScope(repoRoot: string, protectedPaths: readonly string[]): void {
  const expected = canaryPaths(repoRoot).protectedPaths;
  delegatedRunProtectedScopeSha(protectedPaths);
  if (!expected.every((value) => protectedPaths.includes(value))) fail('delegated_run_invalid', 'protected paths must include fixed read-only canary sentinels');
}

function canaryArgv(repoRoot: string): readonly string[] {
  const paths = canaryPaths(repoRoot);
  return Object.freeze([
    'sandbox',
    '--permission-profile',
    ':read-only',
    '--include-managed-config',
    '--cd',
    repoRoot,
    '/usr/bin/touch',
    '--',
    paths.worktree,
    paths.common,
  ]);
}

function strictCanaryDenials(stderr: string, repoRoot: string): void {
  const paths = canaryPaths(repoRoot);
  const denied = new Set<string>();
  for (const line of stderr.split('\n')) {
    const matched = /^touch: (.*): Operation not permitted$/u.exec(line);
    if (matched) denied.add(matched[1]);
  }
  const expected = [paths.worktree, paths.common].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const actual = [...denied].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('delegated_run_capability_stale', 'read-only canary denial set does not exactly match both protected sentinels');
  }
}

export function recordCodexReadOnlyCapability(repoRoot: string, request: ReadOnlyCapabilityRequest): CodexReadOnlyCapabilityReceiptV1 {
  const root = resolve(repoRoot);
  const input = assertCapabilityRequest(request);
  const profile = loadLogicalReadOnlyRoleProfile(root, input.logical_role);
  const protectedPaths = canaryPaths(root).protectedPaths;
  assertCanaryScope(root, protectedPaths);
  const executablePath = findCodexOnHostPath();
  const executableSha256 = messageSha256(readFileSync(executablePath));
  const version = readCodexCliVersion(executablePath);
  verifyCapabilityExecutable(executablePath, executableSha256, version);
  const before = protectedSnapshot(root, protectedPaths);
  const argv = canaryArgv(root);
  const childEnv = codexChildEnvironment();
  let outcome: ProcessRunResult;
  try { outcome = runProcess(executablePath, argv, { cwd: root, timeoutMs: 120_000, env: childEnv.env, inheritEnv: false }); } catch (error) { throw new DelegatedRunStoreError('delegated_run_capability_stale', 'read-only canary process failed before evidence', error); }
  const after = protectedSnapshot(root, protectedPaths);
  const stdout = evidenceBlob(root, outcome.stdout);
  const stderr = evidenceBlob(root, outcome.stderr);
  const processError = evidenceBlob(root, outcome.error);
  const receipt = processReceiptCanonical({
    dispatch_id: canonicalMessageDigest({ domain: 'repo-harness-read-only-canary-dispatch.v1', executable_path: executablePath, argv_sha256: canonicalMessageDigest({ argv }), protected_scope_sha256: delegatedRunProtectedScopeSha(protectedPaths) }),
    intent_sha256: canonicalMessageDigest({ domain: 'repo-harness-read-only-canary-intent.v1', argv }),
    executable_path: executablePath, argv, env_sha256: childEnv.sha256, exit_code: outcome.status, timed_out: outcome.timedOut,
    stdout_sha256: stdout.sha256, stdout_ref: stdout.ref, stderr_sha256: stderr.sha256, stderr_ref: stderr.ref, error_sha256: processError.sha256, error_ref: processError.ref,
    before_snapshot_sha256: before, after_snapshot_sha256: after, observed_at: input.observed_at,
  });
  // A failed capability attempt must remain auditable even though no
  // capability receipt will be published for it.
  persistProcessReceipt(root, receipt);
  if (before !== after || outcome.timedOut) fail('delegated_run_capability_stale', 'read-only canary did not preserve the protected snapshot');
  if (outcome.ok || outcome.status !== 1) fail('delegated_run_capability_stale', 'read-only canary did not fail exactly at the denied mutation boundary');
  strictCanaryDenials(outcome.stderr, root);
  for (const sentinel of canaryPaths(root).protectedPaths) {
    const [prefix, ...parts] = sentinel.split(':');
    const snapshot = snapshotOne(prefix === 'worktree' ? root : resolveGitCommonDirectory(root), parts.join(':'));
    if (snapshot.state !== 'absent') fail('delegated_run_capability_stale', 'read-only canary sentinel exists after execution');
  }
  const capability = buildCodexReadOnlyCapabilityReceipt({
    executable_path: executablePath, executable_sha256: executableSha256, version, model: profile.model,
    argv_template: CODEX_READ_ONLY_ARGV_TEMPLATE,
    sandbox_mode: 'read_only', env_sha256: childEnv.sha256, proof_surface: CODEX_READ_ONLY_PROOF_SURFACE,
    mutation_matrix_sha256: canonicalMessageDigest({ domain: 'repo-harness-read-only-canary-mutation.v1', argv }),
    protected_scope_sha256: delegatedRunProtectedScopeSha(protectedPaths), canary_before_snapshot_sha256: before, canary_after_snapshot_sha256: after,
    canary_process_receipt_sha256: receipt.process_receipt_sha256, evidence_refs: [stdout, stderr, processError], observed_at: input.observed_at,
  });
  persistCapability(repoRoot, capability);
  return capability;
}

function capabilityCanaryVerified(repoRoot: string, capability: CodexReadOnlyCapabilityReceiptV1): boolean {
  try {
    verifyCapabilityExecutable(capability.executable_path, capability.executable_sha256, capability.version);
    const receipt = readProcessReceipt(repoRoot, capability.canary_process_receipt_sha256);
    const expectedArgv = canaryArgv(repoRoot);
    const expectedScope = delegatedRunProtectedScopeSha(canaryPaths(repoRoot).protectedPaths);
    const expectedMutation = canonicalMessageDigest({ domain: 'repo-harness-read-only-canary-mutation.v1', argv: expectedArgv });
    const expectedDispatch = canonicalMessageDigest({ domain: 'repo-harness-read-only-canary-dispatch.v1', executable_path: capability.executable_path, argv_sha256: canonicalMessageDigest({ argv: expectedArgv }), protected_scope_sha256: capability.protected_scope_sha256 });
    const expectedIntent = canonicalMessageDigest({ domain: 'repo-harness-read-only-canary-intent.v1', argv: expectedArgv });
    if (capability.protected_scope_sha256 !== expectedScope || capability.mutation_matrix_sha256 !== expectedMutation
      || capability.proof_surface !== CODEX_READ_ONLY_PROOF_SURFACE || capability.env_sha256 !== receipt.env_sha256
      || JSON.stringify(capability.argv_template) !== JSON.stringify(CODEX_READ_ONLY_ARGV_TEMPLATE)
      || receipt.dispatch_id !== expectedDispatch || receipt.executable_path !== capability.executable_path || JSON.stringify(receipt.argv) !== JSON.stringify(expectedArgv)
      || receipt.intent_sha256 !== expectedIntent || receipt.exit_code !== 1 || receipt.timed_out || receipt.before_snapshot_sha256 !== receipt.after_snapshot_sha256
      || receipt.before_snapshot_sha256 !== capability.canary_before_snapshot_sha256 || receipt.after_snapshot_sha256 !== capability.canary_after_snapshot_sha256) return false;
    const refs = [
      { ref: receipt.stdout_ref, sha256: receipt.stdout_sha256 },
      { ref: receipt.stderr_ref, sha256: receipt.stderr_sha256 },
      { ref: receipt.error_ref, sha256: receipt.error_sha256 },
    ];
    if (JSON.stringify(refs) !== JSON.stringify(capability.evidence_refs)) return false;
    strictCanaryDenials(readEvidenceBlob(repoRoot, receipt.stderr_ref, receipt.stderr_sha256).toString('utf8'), repoRoot);
    for (const sentinel of canaryPaths(repoRoot).protectedPaths) {
      const [prefix, ...parts] = sentinel.split(':');
      if (snapshotOne(prefix === 'worktree' ? repoRoot : resolveGitCommonDirectory(repoRoot), parts.join(':')).state !== 'absent') return false;
    }
    return true;
  } catch { return false; }
}

function parentReason(error: unknown): DelegationRejectionReason {
  return error instanceof DelegationError ? 'sandbox_capability_unverified' : 'parent_stale';
}

function validateDelegationParent(
  repoRoot: string,
  input: Pick<AdmitReadOnlyDelegationInput, 'claim_actor_receipt' | 'work_envelope' | 'validate_parent'>,
) {
  if (input.validate_parent !== undefined) {
    return input.validate_parent(repoRoot, input.claim_actor_receipt, input.work_envelope);
  }
  return validateClaimActorReceiptLive(repoRoot, input.claim_actor_receipt, input.work_envelope);
}

/**
 * Persist exact evidence first.  Any admission mismatch produces a terminal
 * rejected receipt; rejected receipts never create an intent or host action.
 */
export function admitReadOnlyDelegation(input: AdmitReadOnlyDelegationInput): { readonly envelope: DelegationEnvelopeV1; readonly receipt: DelegationAdmissionReceiptV1 } {
  const repoRoot = resolve(input.repo_root);
  const envelope = validateDelegationEnvelope(input.envelope);
  const profile = validateLogicalRoleProfile(input.role_profile);
  const capability = validateCodexReadOnlyCapabilityReceipt(input.capability);
  const packet = validateDelegationExecutionPacket(input.execution_packet);
  persistProfile(repoRoot, profile); persistCapability(repoRoot, capability); persistPacket(repoRoot, packet); persistEnvelope(repoRoot, envelope);
  let reason: DelegationRejectionReason | null = null;
  try {
    const live = validateDelegationParent(repoRoot, input);
    const availability = profileAvailability(repoRoot, profile);
    if (live.receipt_sha256 !== envelope.engineer.claim_actor_receipt_sha256
      || live.task_id !== envelope.parent.task_id || live.task_revision !== envelope.parent.task_revision
      || live.claim_id !== envelope.parent.claim_id || live.lease_generation !== envelope.parent.lease_generation
      || live.work_envelope_sha256 !== envelope.parent.work_envelope_sha256) reason = 'parent_stale';
    else if (live.engineer_id !== envelope.engineer.engineer_id || live.binding_id !== envelope.engineer.binding_id || live.binding_generation !== envelope.engineer.binding_generation) reason = 'binding_stale';
    else if (availability === 'unavailable') reason = 'role_profile_unavailable';
    else if (profile.role_profile_sha256 !== envelope.role_profile_sha256 || profile.logical_role !== envelope.logical_role || availability !== 'matches') reason = 'role_profile_stale';
    else if (capability.capability_sha256 !== envelope.runtime_capability_sha256) reason = 'runtime_capability_stale';
    else if (capability.sandbox_mode !== 'read_only' || capability.canary_before_snapshot_sha256 !== capability.canary_after_snapshot_sha256 || !capabilityCanaryVerified(repoRoot, capability)) reason = 'sandbox_capability_unverified';
    else if (packet.packet_sha256 !== envelope.execution_packet_sha256 || packet.delegation_id !== envelope.delegation_id || packet.logical_role !== envelope.logical_role || packet.role_profile_sha256 !== profile.role_profile_sha256 || packet.model !== profile.model || packet.role_instructions !== readLogicalRoleInstructions(repoRoot, profile) || packet.goal !== envelope.goal || JSON.stringify(packet.allowed_read_paths) !== JSON.stringify(envelope.allowed_read_paths) || packet.max_turns !== envelope.budget.max_turns || packet.max_depth !== envelope.budget.max_depth) reason = 'role_profile_stale';
  } catch (error) { reason = parentReason(error); }
  const receipt = reason === null
    ? buildDelegationAdmissionReceipt({ delegation_id: envelope.delegation_id, envelope_sha256: envelope.envelope_sha256, decision: 'admitted', rejection_reason: null, admitted_role_profile_sha256: profile.role_profile_sha256, admitted_mode: 'read_only', admitted_sandbox_policy_sha256: capability.protected_scope_sha256, expected_runtime_observation_sha256: capability.capability_sha256, decided_at: input.decided_at })
    : buildDelegationAdmissionReceipt({ delegation_id: envelope.delegation_id, envelope_sha256: envelope.envelope_sha256, decision: 'rejected', rejection_reason: reason, admitted_role_profile_sha256: null, admitted_mode: null, admitted_sandbox_policy_sha256: null, expected_runtime_observation_sha256: null, decided_at: input.decided_at });
  persistAdmission(repoRoot, receipt);
  return Object.freeze({ envelope, receipt });
}

export function readDelegationEnvelope(repoRoot: string, envelopeSha256: string): DelegationEnvelopeV1 { return readImmutable(repoRoot, 'envelopes', envelopeSha256, validateDelegationEnvelope, canonicalDelegationEnvelopeBytes); }
export function readDelegationAdmissionReceipt(repoRoot: string, receiptSha256: string): DelegationAdmissionReceiptV1 { return readImmutable(repoRoot, 'admissions', receiptSha256, validateDelegationAdmissionReceipt, canonicalDelegationAdmissionReceiptBytes); }
export function readDelegatedRunIntent(repoRoot: string, intentSha256: string): DelegatedRunIntentV1 { return readImmutable(repoRoot, 'intents', intentSha256, validateDelegatedRunIntent, canonicalDelegatedRunIntentBytes); }
export function readCodexReadOnlyCapability(repoRoot: string, capabilitySha256: string): CodexReadOnlyCapabilityReceiptV1 { return readImmutable(repoRoot, 'capabilities', capabilitySha256, validateCodexReadOnlyCapabilityReceipt, canonicalCodexReadOnlyCapabilityReceiptBytes); }

export function prepareDelegatedRun(input: PrepareDelegatedRunInput): DelegatedRunStatus {
  const repoRoot = resolve(input.repo_root);
  const admission = readDelegationAdmissionReceipt(repoRoot, input.admission_receipt_sha256);
  if (admission.decision !== 'admitted') fail('delegated_run_admission_rejected', 'delegated run requires an admitted receipt');
  const envelope = readDelegationEnvelope(repoRoot, admission.envelope_sha256);
  if (envelope.delegation_id !== input.delegation_id || envelope.execution_packet_sha256 !== input.context_packet_sha256) fail('delegated_run_admission_rejected', 'admission does not match the exact delegation packet');
  const intent = buildDelegatedRunIntent({ idempotency_key: input.idempotency_key, delegation_id: input.delegation_id, admission_receipt_sha256: admission.admission_receipt_sha256, round_index: input.round_index, context_packet_sha256: input.context_packet_sha256 });
  return withDispatchLock(repoRoot, intent.dispatch_id, () => {
    persistIntent(repoRoot, intent);
    let current: DelegatedRunObservationV1;
    try { current = readCurrent(repoRoot, intent.dispatch_id); } catch (error) {
      if (!(error instanceof DelegatedRunStoreError) || error.code !== 'delegated_run_not_found') throw error;
      current = buildDelegatedRunObservation({ dispatch_id: intent.dispatch_id, intent_sha256: intent.intent_sha256, worker_run_ref: null, runtime_principal_id: null, state: 'intent_persisted', failure_class: 'none', observed_capabilities_sha256: envelope.runtime_capability_sha256, protected_before_snapshot_sha256: null, protected_after_snapshot_sha256: null, process_receipt_sha256: null, previous_observation_sha256: null, observed_at: input.observed_at });
      persistObservation(repoRoot, current); writeCurrent(repoRoot, current);
    }
    if (current.intent_sha256 !== intent.intent_sha256) fail('delegated_run_conflict', 'dispatch idempotency key maps to different immutable intent');
    return status(repoRoot, intent, current);
  });
}

function processReceiptCanonical(input: Omit<CodexProcessReceiptV1, 'protocol' | 'kind' | 'process_receipt_sha256'>): CodexProcessReceiptV1 {
  if (!SHA.test(input.dispatch_id) || !SHA.test(input.intent_sha256) || !SHA.test(input.env_sha256) || !SHA.test(input.before_snapshot_sha256) || !SHA.test(input.after_snapshot_sha256)) fail('delegated_run_invalid', 'process receipt digest is invalid');
  if (!isAbsolute(input.executable_path) || input.executable_path.includes('\0')
    || !Array.isArray(input.argv) || input.argv.some((part) => typeof part !== 'string' || part.includes('\0'))
    || typeof input.timed_out !== 'boolean') fail('delegated_run_invalid', 'process receipt command is invalid');
  for (const evidence of [[input.stdout_ref, input.stdout_sha256], [input.stderr_ref, input.stderr_sha256], [input.error_ref, input.error_sha256]] as const) {
    const matched = EVIDENCE_BLOB_REF.exec(evidence[0]);
    if (!matched || evidence[1] !== `sha256:${matched[1]}`) fail('delegated_run_invalid', 'process receipt evidence reference is invalid');
  }
  if (!Number.isInteger(input.exit_code) || input.exit_code < 0 || input.exit_code > 255 || !/^\d{4}-\d{2}-\d{2}T/.test(input.observed_at)) fail('delegated_run_invalid', 'process receipt fields are invalid');
  const basis = { protocol: 1 as const, kind: 'repo-harness-codex-read-only-process-receipt' as const, ...input };
  return Object.freeze({ ...basis, process_receipt_sha256: canonicalMessageDigest(basis) });
}

function validateProcessReceipt(value: unknown): CodexProcessReceiptV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('delegated_run_invalid', 'process receipt is invalid');
  const record = value as Record<string, unknown>;
  const expected = ['protocol', 'kind', 'dispatch_id', 'intent_sha256', 'executable_path', 'argv', 'env_sha256', 'exit_code', 'timed_out', 'stdout_sha256', 'stdout_ref', 'stderr_sha256', 'stderr_ref', 'error_sha256', 'error_ref', 'before_snapshot_sha256', 'after_snapshot_sha256', 'observed_at', 'process_receipt_sha256'].sort();
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expected)) fail('delegated_run_invalid', 'process receipt fields are invalid');
  const built = processReceiptCanonical({ dispatch_id: record.dispatch_id as string, intent_sha256: record.intent_sha256 as string, executable_path: record.executable_path as string, argv: record.argv as readonly string[], env_sha256: record.env_sha256 as string, exit_code: record.exit_code as number, timed_out: record.timed_out as boolean, stdout_sha256: record.stdout_sha256 as string, stdout_ref: record.stdout_ref as string, stderr_sha256: record.stderr_sha256 as string, stderr_ref: record.stderr_ref as string, error_sha256: record.error_sha256 as string, error_ref: record.error_ref as string, before_snapshot_sha256: record.before_snapshot_sha256 as string, after_snapshot_sha256: record.after_snapshot_sha256 as string, observed_at: record.observed_at as string });
  if (record.process_receipt_sha256 !== built.process_receipt_sha256) fail('delegated_run_invalid', 'process receipt digest is stale');
  return built;
}

function canonicalProcessReceipt(value: CodexProcessReceiptV1): string { return canonicalMessageBytes(validateProcessReceipt(value) as unknown as Readonly<Record<string, unknown>>); }
function persistProcessReceipt(repoRoot: string, receipt: CodexProcessReceiptV1): void { persistImmutable(repoRoot, 'process-receipts', receipt.process_receipt_sha256, canonicalProcessReceipt(receipt)); }
function readProcessReceipt(repoRoot: string, valueDigest: string): CodexProcessReceiptV1 { return readImmutable(repoRoot, 'process-receipts', valueDigest, validateProcessReceipt, canonicalProcessReceipt); }

function appendObservation(repoRoot: string, previous: DelegatedRunObservationV1, next: Omit<DelegatedRunObservationV1, 'protocol' | 'kind' | 'previous_observation_sha256' | 'observation_sha256'>): DelegatedRunObservationV1 {
  try { assertDelegatedRunTransition(previous.state, next.state); } catch (error) { if (error instanceof DelegationError) throw new DelegatedRunStoreError('delegated_run_transition_invalid', error.message, error); throw error; }
  const observation = buildDelegatedRunObservation({ ...next, previous_observation_sha256: previous.observation_sha256 });
  persistObservation(repoRoot, observation); writeCurrent(repoRoot, observation);
  return observation;
}

function intentForDispatch(repoRoot: string, id: string): { readonly intent: DelegatedRunIntentV1; readonly current: DelegatedRunObservationV1; readonly envelope: DelegationEnvelopeV1; readonly admission: DelegationAdmissionReceiptV1; readonly capability: CodexReadOnlyCapabilityReceiptV1; readonly packet: DelegationExecutionPacketV1; readonly profile: LogicalRoleProfileV1 } {
  const current = readCurrent(repoRoot, id);
  const intent = readDelegatedRunIntent(repoRoot, current.intent_sha256);
  if (intent.dispatch_id !== id) fail('delegated_run_conflict', 'current observation dispatch does not match intent');
  const admission = readDelegationAdmissionReceipt(repoRoot, intent.admission_receipt_sha256);
  if (admission.decision !== 'admitted') fail('delegated_run_admission_rejected', 'intent admission is not admitted');
  const envelope = readDelegationEnvelope(repoRoot, admission.envelope_sha256);
  const capability = readCodexReadOnlyCapability(repoRoot, envelope.runtime_capability_sha256);
  const packet = readImmutable(repoRoot, 'packets', envelope.execution_packet_sha256, validateDelegationExecutionPacket, canonicalDelegationExecutionPacketBytes);
  const profile = readImmutable(repoRoot, 'profiles', envelope.role_profile_sha256, validateLogicalRoleProfile, canonicalLogicalRoleProfileBytes);
  if (packet.packet_sha256 !== intent.context_packet_sha256 || profile.role_profile_sha256 !== admission.admitted_role_profile_sha256 || capability.capability_sha256 !== admission.expected_runtime_observation_sha256 || packet.max_turns !== 1 || packet.model !== capability.model || profile.model !== capability.model) fail('delegated_run_conflict', 'immutable delegated run references do not join');
  return { intent, current, envelope, admission, capability, packet, profile };
}

function launchClaimFor(repoRoot: string, id: string, intentSha: string): DelegatedRunLaunchClaimV1 | null {
  let directory: string;
  try { directory = storePath(repoRoot, 'launch-claims', false); } catch (error) {
    if (error instanceof DelegatedRunStoreError && error.code === 'delegated_run_not_found') return null;
    throw error;
  }
  for (const entry of readdirSync(directory).sort()) {
    if (!/^[0-9a-f]{64}\.json$/u.test(entry)) fail('delegated_run_unsafe_path', 'launch claim store contains unexpected entry');
    const raw = readRegular(join(directory, entry), 'launch claim');
    let claim: DelegatedRunLaunchClaimV1;
    try { claim = validateDelegatedRunLaunchClaim(JSON.parse(raw.toString('utf8'))); } catch (error) { throw new DelegatedRunStoreError('delegated_run_invalid', 'launch claim is invalid', error); }
    if (claim.dispatch_id === id && claim.intent_sha256 === intentSha) return claim;
  }
  return null;
}

function status(repoRoot: string, intent: DelegatedRunIntentV1, current: DelegatedRunObservationV1): DelegatedRunStatus {
  const launchClaim = launchClaimFor(repoRoot, intent.dispatch_id, intent.intent_sha256);
  const runRef = current.worker_run_ref && SHA.test(current.worker_run_ref) ? readImmutable(repoRoot, 'run-refs', current.worker_run_ref, validateWorkerRunRef, canonicalWorkerRunRefBytes) : null;
  let result: WorkerResultV1 | null = null;
  if (runRef !== null) {
    let directory: string | null = null;
    try { directory = storePath(repoRoot, 'results', false); } catch (error) {
      if (!(error instanceof DelegatedRunStoreError) || error.code !== 'delegated_run_not_found') throw error;
    }
    if (directory !== null && existsSync(directory)) for (const entry of readdirSync(directory).sort()) {
      if (!/^[0-9a-f]{64}\.json$/u.test(entry)) continue;
      const candidate = readImmutable(repoRoot, 'results', `sha256:${entry.slice(0, -'.json'.length)}`, validateWorkerResult, canonicalWorkerResultBytes);
      if (candidate.worker_run_ref_sha256 === runRef.run_ref_sha256) { result = candidate; break; }
    }
  }
  return Object.freeze({ intent, current, observation: current, launch_claim: launchClaim, run_ref: runRef, result });
}

function noActionReconciliation(repoRoot: string, current: DelegatedRunObservationV1, observedAt: string): DelegatedRunObservationV1 {
  if (current.state === 'reconciliation_required' || current.state === 'completed' || current.state === 'failed') return current;
  return appendObservation(repoRoot, current, {
    dispatch_id: current.dispatch_id, intent_sha256: current.intent_sha256, worker_run_ref: null, runtime_principal_id: null,
    state: 'reconciliation_required', failure_class: 'unknown', observed_capabilities_sha256: current.observed_capabilities_sha256,
    protected_before_snapshot_sha256: current.protected_before_snapshot_sha256, protected_after_snapshot_sha256: current.protected_after_snapshot_sha256,
    process_receipt_sha256: current.process_receipt_sha256, observed_at: observedAt,
  });
}

/**
 * One persisted launch claim permits one and only one subprocess action.
 *
 * The collaboration fence runs here rather than in front of here. C6/C7 made it
 * a pre-step at the delegation CLI, which held only as long as every caller
 * remembered it: a controller that acquires work and dispatches it — agent task
 * automation, an MCP surface, a scheduler — reaches this function directly, and
 * a forgotten pre-step is not a refusal but a silent bypass. Enforcing it inside
 * the only exported dispatch means there is no unfenced entry to forget.
 *
 * It is the first statement under the dispatch lock, which is where the
 * pre-step could not be. The pre-step read the run and its binding outside the
 * lock and then re-read them here, so a binding could be replaced between the
 * two reads; the fence now decides on the same locked view the host action is
 * taken from. Everything below is unchanged: `fenceCollaborationDispatch()`
 * returns null for a run carrying neither a binding nor an untrusted marker,
 * which is every delegation-only run.
 */
export function dispatchDelegatedRun(input: DispatchDelegatedRunInput): DelegatedRunStatus {
  const repoRoot = resolve(input.repo_root);
  const id = dispatchId(input.dispatch_id);
  return withDispatchLock(repoRoot, id, () => {
    fenceCollaborationDispatch({ repo_root: repoRoot, dispatch_id: id });
    const beforeState = intentForDispatch(repoRoot, id);
    if (launchClaimFor(repoRoot, id, beforeState.intent.intent_sha256) !== null) {
      const current = noActionReconciliation(repoRoot, beforeState.current, input.observed_at);
      return status(repoRoot, beforeState.intent, current);
    }
    if (beforeState.current.state !== 'intent_persisted') {
      const current = noActionReconciliation(repoRoot, beforeState.current, input.observed_at);
      return status(repoRoot, beforeState.intent, current);
    }
    if (delegatedRunProtectedScopeSha(input.protected_paths) !== beforeState.capability.protected_scope_sha256) fail('delegated_run_capability_stale', 'protected snapshot scope does not match admitted capability');
    if (!profileMatchesStored(repoRoot, beforeState.profile)) fail('delegated_run_profile_stale', 'tracked logical Role Profile changed after admission');
    const executable = beforeState.capability.executable_path;
    verifyCapabilityExecutable(executable, beforeState.capability.executable_sha256, beforeState.capability.version);
    const beforeSnapshot = protectedSnapshot(repoRoot, input.protected_paths);
    const claim = buildDelegatedRunLaunchClaim({ dispatch_id: id, intent_sha256: beforeState.intent.intent_sha256, claimed_at: input.observed_at });
    persistLaunchClaim(repoRoot, claim);
    input.crash_hook?.('after_launch_claim_persisted');
    let current = appendObservation(repoRoot, beforeState.current, {
      dispatch_id: id, intent_sha256: beforeState.intent.intent_sha256, worker_run_ref: null, runtime_principal_id: null, state: 'launch_claimed', failure_class: 'none', observed_capabilities_sha256: beforeState.capability.capability_sha256, protected_before_snapshot_sha256: beforeSnapshot, protected_after_snapshot_sha256: null, process_receipt_sha256: null, observed_at: input.observed_at,
    });
    const developerInstructionsConfig = `developer_instructions=${JSON.stringify(readLogicalRoleInstructions(repoRoot, beforeState.profile))}`;
    const argvSubstitutions: Readonly<Record<string, string>> = {
      '{model}': beforeState.capability.model,
      '{developer_instructions_config}': developerInstructionsConfig,
      '{execution_packet}': canonicalDelegationExecutionPacketBytes(beforeState.packet),
    };
    const argv = CODEX_READ_ONLY_ARGV_TEMPLATE.map((part) => argvSubstitutions[part] ?? part);
    const childEnv = codexChildEnvironment();
    let outcome: ProcessRunResult;
    try {
      current = appendObservation(repoRoot, current, {
        dispatch_id: id, intent_sha256: beforeState.intent.intent_sha256, worker_run_ref: null, runtime_principal_id: null, state: 'running', failure_class: 'none', observed_capabilities_sha256: beforeState.capability.capability_sha256, protected_before_snapshot_sha256: beforeSnapshot, protected_after_snapshot_sha256: null, process_receipt_sha256: null, observed_at: input.observed_at,
      });
      outcome = runProcess(executable, argv, {
        cwd: repoRoot,
        timeoutMs: 120_000,
        maxOutputBytes: CODEX_DELEGATED_RUN_MAX_OUTPUT_BYTES,
        processGroup: true,
        env: childEnv.env,
        inheritEnv: false,
      });
      input.crash_hook?.('after_host_action_before_receipt');
    } catch (_error) {
      const unknown = noActionReconciliation(repoRoot, current, input.observed_at);
      return status(repoRoot, beforeState.intent, unknown);
    }
    const afterSnapshot = protectedSnapshot(repoRoot, input.protected_paths);
    const stdout = evidenceBlob(repoRoot, outcome.stdout);
    const stderr = evidenceBlob(repoRoot, outcome.stderr);
    const processError = evidenceBlob(repoRoot, outcome.error);
    const receipt = processReceiptCanonical({ dispatch_id: id, intent_sha256: beforeState.intent.intent_sha256, executable_path: executable, argv, env_sha256: childEnv.sha256, exit_code: outcome.status, timed_out: outcome.timedOut, stdout_sha256: stdout.sha256, stdout_ref: stdout.ref, stderr_sha256: stderr.sha256, stderr_ref: stderr.ref, error_sha256: processError.sha256, error_ref: processError.ref, before_snapshot_sha256: beforeSnapshot, after_snapshot_sha256: afterSnapshot, observed_at: input.observed_at });
    persistProcessReceipt(repoRoot, receipt);
    current = appendObservation(repoRoot, current, {
      dispatch_id: id, intent_sha256: beforeState.intent.intent_sha256, worker_run_ref: null, runtime_principal_id: null, state: 'collecting', failure_class: 'none', observed_capabilities_sha256: beforeState.capability.capability_sha256, protected_before_snapshot_sha256: beforeSnapshot, protected_after_snapshot_sha256: afterSnapshot, process_receipt_sha256: receipt.process_receipt_sha256, observed_at: input.observed_at,
    });
    if (!outcome.ok || beforeSnapshot !== afterSnapshot) {
      const failure: DelegatedRunFailureClass = beforeSnapshot === afterSnapshot ? (outcome.timedOut ? 'infrastructure' : 'provider') : 'protected_state_changed';
      current = appendObservation(repoRoot, current, {
        dispatch_id: id, intent_sha256: beforeState.intent.intent_sha256, worker_run_ref: null, runtime_principal_id: null, state: 'failed', failure_class: failure, observed_capabilities_sha256: beforeState.capability.capability_sha256, protected_before_snapshot_sha256: beforeSnapshot, protected_after_snapshot_sha256: afterSnapshot, process_receipt_sha256: receipt.process_receipt_sha256, observed_at: input.observed_at,
      });
      return status(repoRoot, beforeState.intent, current);
    }
    const workerRunId = randomUUID();
    if (!UUID.test(workerRunId)) fail('delegated_run_invalid', 'worker_run_id is invalid');
    const runRef = buildWorkerRunRef({ worker_run_id: workerRunId, delegation_id: beforeState.envelope.delegation_id, admission_receipt_sha256: beforeState.admission.admission_receipt_sha256, logical_role: beforeState.profile.logical_role, role_profile_sha256: beforeState.profile.role_profile_sha256, runtime_principal_ref: `codex-exec:${receipt.process_receipt_sha256}`, launch_claim_sha256: claim.launch_claim_sha256, execution_receipt_sha256: receipt.process_receipt_sha256, read_only_sandbox_receipt_sha256: canonicalMessageDigest({ capability_sha256: beforeState.capability.capability_sha256, protected_before_snapshot_sha256: beforeSnapshot, protected_after_snapshot_sha256: afterSnapshot }) });
    persistRunRef(repoRoot, runRef);
    current = appendObservation(repoRoot, current, {
      dispatch_id: id, intent_sha256: beforeState.intent.intent_sha256, worker_run_ref: runRef.run_ref_sha256, runtime_principal_id: runRef.runtime_principal_ref, state: 'completed', failure_class: 'none', observed_capabilities_sha256: beforeState.capability.capability_sha256, protected_before_snapshot_sha256: beforeSnapshot, protected_after_snapshot_sha256: afterSnapshot, process_receipt_sha256: receipt.process_receipt_sha256, observed_at: input.observed_at,
    });
    return status(repoRoot, beforeState.intent, current);
  });
}

/** Results are only untrusted evidence; this function has no authority mutation dependency. */
export function collectDelegatedRunResult(input: CollectDelegatedRunInput): DelegatedRunStatus {
  const repoRoot = resolve(input.repo_root);
  const id = dispatchId(input.dispatch_id);
  return withDispatchLock(repoRoot, id, () => {
    const joined = intentForDispatch(repoRoot, id);
    if (joined.current.state !== 'completed' || joined.current.worker_run_ref === null || joined.current.process_receipt_sha256 === null) fail('delegated_run_transition_invalid', 'only a completed verified run can collect a result');
    const runRef = readImmutable(repoRoot, 'run-refs', joined.current.worker_run_ref, validateWorkerRunRef, canonicalWorkerRunRefBytes);
    const receipt = readProcessReceipt(repoRoot, joined.current.process_receipt_sha256);
    if (receipt.before_snapshot_sha256 !== receipt.after_snapshot_sha256 || runRef.delegation_id !== joined.envelope.delegation_id || runRef.role_profile_sha256 !== joined.profile.role_profile_sha256) fail('delegated_run_snapshot_changed', 'cannot collect result after protected state changed');
    const evidenceRefs = Object.freeze([
      Object.freeze({ ref: receipt.stdout_ref, sha256: receipt.stdout_sha256 }),
      Object.freeze({ ref: receipt.stderr_ref, sha256: receipt.stderr_sha256 }),
      Object.freeze({ ref: receipt.error_ref, sha256: receipt.error_sha256 }),
      ...validateWorkerEvidenceRefs(input.contribution_refs, 'contribution_refs', 8),
    ]);
    const result = buildWorkerResult({ delegation_id: joined.envelope.delegation_id, worker_run_id: runRef.worker_run_id, worker_run_ref_sha256: runRef.run_ref_sha256, logical_role: joined.profile.logical_role, runtime_observation_sha256: joined.current.observation_sha256, read_only_sandbox_receipt_sha256: runRef.read_only_sandbox_receipt_sha256, evidence_refs: evidenceRefs, untrusted_claims: input.untrusted_claims });
    // Exactly one result per run.  Results are content-addressed, so two
    // different results for one run would land at two paths and both persist;
    // `status()` would then pick whichever sorted first and a reader would have
    // no way to tell it had been given a choice.  Collecting the same run twice
    // with the same inputs is still idempotent -- the digests match and the
    // create-once write is a no-op.
    const persisted = status(repoRoot, joined.intent, joined.current).result;
    if (persisted !== null && persisted.result_sha256 !== result.result_sha256) fail('delegated_run_conflict', 'a different WorkerResult is already persisted for this run');
    persistResult(repoRoot, result);
    return status(repoRoot, joined.intent, joined.current);
  });
}

export function readDelegatedRunStatus(repoRoot: string, id: string): DelegatedRunStatus {
  const current = readCurrent(repoRoot, dispatchId(id));
  const intent = readDelegatedRunIntent(repoRoot, current.intent_sha256);
  return status(repoRoot, intent, current);
}

export function readCodexProcessReceipt(repoRoot: string, receiptSha256: string): CodexProcessReceiptV1 { return readProcessReceipt(repoRoot, receiptSha256); }
export function readDelegatedRunEvidenceBlob(repoRoot: string, ref: string, sha256: string): Buffer { return readEvidenceBlob(resolve(repoRoot), ref, sha256); }
export function readDelegatedRunRunRef(repoRoot: string, runRefSha256: string): WorkerRunRefV1 { return readImmutable(resolve(repoRoot), 'run-refs', runRefSha256, validateWorkerRunRef, canonicalWorkerRunRefBytes); }
export function readDelegatedRunResult(repoRoot: string, resultSha256: string): WorkerResultV1 { return readImmutable(resolve(repoRoot), 'results', resultSha256, validateWorkerResult, canonicalWorkerResultBytes); }
