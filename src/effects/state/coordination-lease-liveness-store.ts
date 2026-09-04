import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeSync } from 'fs';
import { dirname, join, resolve } from 'path';
import {
  buildLeaseRenewalObservation,
  foldLeaseLivenessCurrent,
  type LeaseLivenessCurrentV1,
  type LeaseLivenessPolicyV1,
  type LeaseRenewalObservationV1,
} from '../../core/state/lease-liveness';
import type { LeaseOwnerRecord } from '../../core/state/coordination-identity';
import { coordinationRoot, withTaskLock } from './coordination-lease-store';

const SHA = /^sha256:[0-9a-f]{64}$/u;
const TASK = /^[0-9a-f]{64}$/u;

export class LeaseLivenessStoreError extends Error {
  constructor(readonly code: 'liveness_not_found' | 'liveness_conflict' | 'liveness_unsafe_path' | 'liveness_persistence_failed', message: string, readonly cause?: unknown) { super(message); this.name = 'LeaseLivenessStoreError'; }
}
function fail(code: LeaseLivenessStoreError['code'], message: string, cause?: unknown): never { throw new LeaseLivenessStoreError(code, message, cause); }
function safeTask(value: string): string { if (!TASK.test(value)) fail('liveness_unsafe_path', 'invalid liveness task id'); return value; }
function shaName(value: string): string { if (!SHA.test(value)) fail('liveness_unsafe_path', 'invalid liveness digest'); return value.slice(7); }
function root(repoRoot: string, taskId: string) { const base = join(coordinationRoot(resolve(repoRoot)), 'liveness', safeTask(taskId)); return { base, policy: join(base, 'policy.json'), current: join(base, 'current.json'), renewals: join(base, 'renewals') }; }
function ensure(path: string): void { mkdirSync(path, { recursive: true, mode: 0o700 }); const stat = lstatSync(path); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('liveness_unsafe_path', `unsafe liveness directory: ${path}`); }
function regular(path: string): Buffer { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) fail('liveness_unsafe_path', `unsafe liveness file: ${path}`); return readFileSync(path); }
function atomic(path: string, bytes: Buffer): void {
  ensure(dirname(path)); const temp = `${path}.${process.pid}.${Date.now()}.tmp`; let fd: number;
  try { fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); } catch (error) { return fail('liveness_persistence_failed', `cannot create ${path}`, error); }
  try { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset); fsyncSync(fd); } finally { closeSync(fd); }
  try { renameSync(temp, path); const directory = openSync(dirname(path), constants.O_RDONLY); try { fsyncSync(directory); } finally { closeSync(directory); } } catch (error) { fail('liveness_persistence_failed', `cannot publish ${path}`, error); }
}
function canonical(value: unknown): Buffer { return Buffer.from(`${JSON.stringify(value)}\n`, 'utf8'); }
function immutable(path: string, value: unknown): void { const bytes = canonical(value); if (existsSync(path)) { if (!regular(path).equals(bytes)) fail('liveness_conflict', `${path} names different bytes`); return; } atomic(path, bytes); }
function json<T>(path: string): T { try { return JSON.parse(regular(path).toString('utf8')) as T; } catch (error) { return fail('liveness_conflict', `invalid liveness record: ${path}`, error); } }
function validateOwner(owner: LeaseOwnerRecord, input: { task_id: string; task_revision: string; claim_id: string; lease_generation: number; execution_worktree: string | null; branch: string | null }): void {
  if (owner.task_id !== input.task_id || owner.task_revision !== input.task_revision || owner.claim_id !== input.claim_id || owner.generation !== input.lease_generation || owner.execution_worktree !== input.execution_worktree || owner.branch !== input.branch || !['reserving', 'bound'].includes(owner.state)) fail('liveness_conflict', 'renewal does not bind the exact current reserving/bound lease');
}
function readCurrent(paths: ReturnType<typeof root>): LeaseLivenessCurrentV1 | null { return existsSync(paths.current) ? json(paths.current) : null; }
function readRenewal(paths: ReturnType<typeof root>, digest: string): LeaseRenewalObservationV1 { return json(join(paths.renewals, `${shaName(digest)}.json`)); }
function assertNoUnprojected(paths: ReturnType<typeof root>, current: LeaseLivenessCurrentV1 | null): void {
  for (const entry of readdirSync(paths.renewals, { withFileTypes: true })) {
    if (!entry.isFile() || !/^[0-9a-f]{64}\.json$/u.test(entry.name)) fail('liveness_unsafe_path', `unexpected renewal entry: ${entry.name}`);
    const renewal = json<LeaseRenewalObservationV1>(join(paths.renewals, entry.name));
    if (renewal.previous_renewal_sha256 === (current?.last_renewal_sha256 ?? null) && renewal.renewal_sha256 !== current?.last_renewal_sha256) fail('liveness_persistence_failed', 'durable renewal is not folded into current; replay its exact observation');
  }
}

export interface RenewLeaseLivenessInput {
  readonly repo_root: string; readonly owner: LeaseOwnerRecord; readonly policy: LeaseLivenessPolicyV1;
  readonly owner_id: string; readonly observed_at: string; readonly requested_ttl_ms: number;
  readonly binding_generation: number | null; readonly runtime_effect_id: string | null;
  readonly expected_current_sha256: string | null;
  readonly crash_hook?: (boundary: 'after_renewal_fsync' | 'after_current_fsync') => void;
}

export function renewLeaseLiveness(input: RenewLeaseLivenessInput): { readonly renewal: LeaseRenewalObservationV1; readonly current: LeaseLivenessCurrentV1 } {
  return withTaskLock(resolve(input.repo_root), input.owner.task_id, () => {
    const paths = root(input.repo_root, input.owner.task_id); ensure(paths.base); ensure(paths.renewals); immutable(paths.policy, input.policy);
    const current = readCurrent(paths); if ((current?.current_sha256 ?? null) !== input.expected_current_sha256) fail('liveness_conflict', 'liveness current changed');
    validateOwner(input.owner, { task_id: input.owner.task_id, task_revision: input.owner.task_revision, claim_id: input.owner.claim_id, lease_generation: input.owner.generation, execution_worktree: input.owner.execution_worktree, branch: input.owner.branch });
    if (current && (current.claim_id !== input.owner.claim_id || current.lease_generation !== input.owner.generation || current.policy_sha256 !== input.policy.policy_sha256)) fail('liveness_conflict', 'old lease generation cannot renew current liveness');
    const previous = current ? readRenewal(paths, current.last_renewal_sha256) : null;
    const renewal = buildLeaseRenewalObservation({ policy: input.policy, task_id: input.owner.task_id, task_revision: input.owner.task_revision, claim_id: input.owner.claim_id, lease_generation: input.owner.generation, owner_id: input.owner_id, execution_worktree: input.owner.execution_worktree, branch: input.owner.branch, observed_at: input.observed_at, requested_ttl_ms: input.requested_ttl_ms, binding_generation: input.binding_generation, runtime_effect_id: input.runtime_effect_id, previous });
    const renewalPath = join(paths.renewals, `${shaName(renewal.renewal_sha256)}.json`);
    if (!existsSync(renewalPath)) assertNoUnprojected(paths, current);
    immutable(renewalPath, renewal); input.crash_hook?.('after_renewal_fsync');
    const next = foldLeaseLivenessCurrent(renewal); atomic(paths.current, canonical(next)); input.crash_hook?.('after_current_fsync'); return Object.freeze({ renewal, current: next });
  });
}

export function readLeaseLiveness(repoRoot: string, taskId: string): { readonly policy: LeaseLivenessPolicyV1; readonly renewal: LeaseRenewalObservationV1; readonly current: LeaseLivenessCurrentV1 } {
  const paths = root(repoRoot, taskId); if (!existsSync(paths.policy) || !existsSync(paths.current)) fail('liveness_not_found', 'lease liveness is missing');
  const policy = json<LeaseLivenessPolicyV1>(paths.policy); const current = readCurrent(paths)!; const renewal = readRenewal(paths, current.last_renewal_sha256);
  if (policy.policy_sha256 !== current.policy_sha256 || renewal.renewal_sha256 !== current.last_renewal_sha256 || renewal.claim_id !== current.claim_id || renewal.lease_generation !== current.lease_generation) fail('liveness_conflict', 'lease liveness projection is internally inconsistent');
  return Object.freeze({ policy, renewal, current });
}
