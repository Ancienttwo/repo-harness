import { createHash } from 'crypto';
import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { buildLeaseRenewalObservation, foldLeaseLivenessCurrent, type LeaseLivenessCurrentV1, type LeaseLivenessPolicyV1, type LeaseReclaimEligibilityReceiptV1, type LeaseRenewalObservationV1 } from '../../core/state/lease-liveness';
import type { LeaseOwnerRecord } from '../../core/state/coordination-identity';
import { coordinationRoot, readLease, withTaskLock } from './coordination-lease-store';

const SHA = /^sha256:[0-9a-f]{64}$/u;
const TASK = /^[0-9a-f]{64}$/u;
const CLAIM = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
interface GenerationIdentity { readonly claim_id: string; readonly lease_generation: number; }
interface LeaseLivenessPointerV1 extends GenerationIdentity { readonly protocol: 1; readonly kind: 'repo-harness-lease-liveness-pointer'; readonly task_id: string; readonly current_sha256: string; }

export class LeaseLivenessStoreError extends Error {
  constructor(readonly code: 'liveness_not_found' | 'liveness_conflict' | 'liveness_unsafe_path' | 'liveness_persistence_failed', message: string, readonly cause?: unknown) { super(message); this.name = 'LeaseLivenessStoreError'; }
}
function fail(code: LeaseLivenessStoreError['code'], message: string, cause?: unknown): never { throw new LeaseLivenessStoreError(code, message, cause); }
function safeTask(value: string): string { if (!TASK.test(value)) fail('liveness_unsafe_path', 'invalid liveness task id'); return value; }
function safeIdentity(identity: GenerationIdentity): GenerationIdentity { if (!CLAIM.test(identity.claim_id) || !Number.isSafeInteger(identity.lease_generation) || identity.lease_generation < 1) fail('liveness_unsafe_path', 'invalid lease generation identity'); return identity; }
function shaName(value: string): string { if (!SHA.test(value)) fail('liveness_unsafe_path', 'invalid liveness digest'); return value.slice(7); }
function generationKey(identity: GenerationIdentity): string { safeIdentity(identity); return createHash('sha256').update(`${identity.claim_id}\0${identity.lease_generation}`, 'utf8').digest('hex'); }
function taskRoot(repoRoot: string, taskId: string) { const base = join(coordinationRoot(resolve(repoRoot)), 'liveness', safeTask(taskId)); return { base, pointer: join(base, 'current-generation.json'), generations: join(base, 'generations') }; }
function pathsFor(repoRoot: string, taskId: string, identity: GenerationIdentity) { const task = taskRoot(repoRoot, taskId); const generation = join(task.generations, generationKey(identity)); return { ...task, generation, policy: join(generation, 'policy.json'), current: join(generation, 'current.json'), eligibility: join(generation, 'eligibility.json'), renewals: join(generation, 'renewals') }; }
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
function sameOwner(actual: LeaseOwnerRecord, expected: LeaseOwnerRecord): boolean { return actual.task_id === expected.task_id && actual.task_revision === expected.task_revision && actual.claim_id === expected.claim_id && actual.generation === expected.generation && actual.execution_worktree === expected.execution_worktree && actual.branch === expected.branch && actual.state === expected.state; }
function readCurrent(paths: ReturnType<typeof pathsFor>): LeaseLivenessCurrentV1 | null { return existsSync(paths.current) ? json(paths.current) : null; }
function readRenewal(paths: ReturnType<typeof pathsFor>, digest: string): LeaseRenewalObservationV1 { return json(join(paths.renewals, `${shaName(digest)}.json`)); }
function assertNoUnprojected(paths: ReturnType<typeof pathsFor>, current: LeaseLivenessCurrentV1 | null): void {
  for (const entry of readdirSync(paths.renewals, { withFileTypes: true })) {
    if (!entry.isFile() || !/^[0-9a-f]{64}\.json$/u.test(entry.name)) fail('liveness_unsafe_path', `unexpected renewal entry: ${entry.name}`);
    const renewal = json<LeaseRenewalObservationV1>(join(paths.renewals, entry.name));
    if (renewal.previous_renewal_sha256 === (current?.last_renewal_sha256 ?? null) && renewal.renewal_sha256 !== current?.last_renewal_sha256) fail('liveness_persistence_failed', 'durable renewal is not folded into current; replay its exact observation');
  }
}
function pointerFor(current: LeaseLivenessCurrentV1): LeaseLivenessPointerV1 { return Object.freeze({ protocol: 1, kind: 'repo-harness-lease-liveness-pointer', task_id: current.task_id, claim_id: current.claim_id, lease_generation: current.lease_generation, current_sha256: current.current_sha256 }); }
function readPointer(repoRoot: string, taskId: string): LeaseLivenessPointerV1 {
  const path = taskRoot(repoRoot, taskId).pointer; if (!existsSync(path)) fail('liveness_not_found', 'lease liveness is missing');
  const pointer = json<LeaseLivenessPointerV1>(path);
  if (pointer.protocol !== 1 || pointer.kind !== 'repo-harness-lease-liveness-pointer' || pointer.task_id !== taskId || !SHA.test(pointer.current_sha256)) fail('liveness_conflict', 'invalid lease liveness generation pointer');
  safeIdentity(pointer); return pointer;
}

export interface RenewLeaseLivenessInput { readonly repo_root: string; readonly owner: LeaseOwnerRecord; readonly policy: LeaseLivenessPolicyV1; readonly owner_id: string; readonly observed_at: string; readonly requested_ttl_ms: number; readonly binding_generation: number | null; readonly runtime_effect_id: string | null; readonly expected_current_sha256: string | null; readonly crash_hook?: (boundary: 'after_renewal_fsync' | 'after_current_fsync') => void; }
export function renewLeaseLiveness(input: RenewLeaseLivenessInput): { readonly renewal: LeaseRenewalObservationV1; readonly current: LeaseLivenessCurrentV1 } {
  return withTaskLock(resolve(input.repo_root), input.owner.task_id, () => {
    const lease = readLease(input.repo_root, input.owner.task_id);
    if (lease.record === null || !sameOwner(lease.record, input.owner) || !['reserving', 'bound'].includes(lease.record.state)) fail('liveness_conflict', 'renewal does not bind the exact current reserving/bound lease');
    const paths = pathsFor(input.repo_root, input.owner.task_id, { claim_id: input.owner.claim_id, lease_generation: input.owner.generation }); ensure(paths.generation); ensure(paths.renewals); immutable(paths.policy, input.policy);
    const current = readCurrent(paths); if ((current?.current_sha256 ?? null) !== input.expected_current_sha256) fail('liveness_conflict', 'liveness current changed');
    if (current && current.policy_sha256 !== input.policy.policy_sha256) fail('liveness_conflict', 'lease generation cannot change liveness policy');
    const previous = current ? readRenewal(paths, current.last_renewal_sha256) : null;
    const renewal = buildLeaseRenewalObservation({ policy: input.policy, task_id: input.owner.task_id, task_revision: input.owner.task_revision, claim_id: input.owner.claim_id, lease_generation: input.owner.generation, owner_id: input.owner_id, execution_worktree: input.owner.execution_worktree, branch: input.owner.branch, observed_at: input.observed_at, requested_ttl_ms: input.requested_ttl_ms, binding_generation: input.binding_generation, runtime_effect_id: input.runtime_effect_id, previous });
    const renewalPath = join(paths.renewals, `${shaName(renewal.renewal_sha256)}.json`); if (!existsSync(renewalPath)) assertNoUnprojected(paths, current);
    immutable(renewalPath, renewal); input.crash_hook?.('after_renewal_fsync');
    const next = foldLeaseLivenessCurrent(renewal); atomic(paths.current, canonical(next)); atomic(paths.pointer, canonical(pointerFor(next))); input.crash_hook?.('after_current_fsync'); return Object.freeze({ renewal, current: next });
  });
}

export function readLeaseLiveness(repoRoot: string, taskId: string, identity?: GenerationIdentity): { readonly policy: LeaseLivenessPolicyV1; readonly renewal: LeaseRenewalObservationV1; readonly current: LeaseLivenessCurrentV1 } {
  const selected = identity ?? readPointer(repoRoot, taskId); const paths = pathsFor(repoRoot, taskId, selected);
  if (!existsSync(paths.policy) || !existsSync(paths.current)) fail('liveness_not_found', 'lease liveness generation is missing');
  const policy = json<LeaseLivenessPolicyV1>(paths.policy); const current = readCurrent(paths)!; const renewal = readRenewal(paths, current.last_renewal_sha256);
  if (current.claim_id !== selected.claim_id || current.lease_generation !== selected.lease_generation || policy.policy_sha256 !== current.policy_sha256 || renewal.renewal_sha256 !== current.last_renewal_sha256 || renewal.claim_id !== current.claim_id || renewal.lease_generation !== current.lease_generation) fail('liveness_conflict', 'lease liveness projection is internally inconsistent');
  if (!identity && readPointer(repoRoot, taskId).current_sha256 !== current.current_sha256) fail('liveness_conflict', 'lease liveness pointer is stale');
  return Object.freeze({ policy, renewal, current });
}
export function writeLeaseReclaimEligibility(repoRoot: string, receipt: LeaseReclaimEligibilityReceiptV1): void {
  const paths = pathsFor(repoRoot, receipt.task_id, receipt); const current = readCurrent(paths); const pointer = readPointer(repoRoot, receipt.task_id);
  if (current === null || current.last_renewal_sha256 !== receipt.renewal_sha256 || pointer.claim_id !== receipt.claim_id || pointer.lease_generation !== receipt.lease_generation || pointer.current_sha256 !== current.current_sha256) fail('liveness_conflict', 'reclaim receipt does not bind current lease generation');
  atomic(paths.eligibility, canonical(receipt));
}
export function readLeaseReclaimEligibility(repoRoot: string, taskId: string): LeaseReclaimEligibilityReceiptV1 | null {
  let pointer: LeaseLivenessPointerV1; try { pointer = readPointer(repoRoot, taskId); } catch (error) { if (error instanceof LeaseLivenessStoreError && error.code === 'liveness_not_found') return null; throw error; }
  const paths = pathsFor(repoRoot, taskId, pointer); if (!existsSync(paths.eligibility)) return null; const receipt = json<LeaseReclaimEligibilityReceiptV1>(paths.eligibility); const current = readCurrent(paths);
  if (current === null || current.current_sha256 !== pointer.current_sha256 || current.last_renewal_sha256 !== receipt.renewal_sha256 || receipt.claim_id !== pointer.claim_id || receipt.lease_generation !== pointer.lease_generation) return null; return receipt;
}
