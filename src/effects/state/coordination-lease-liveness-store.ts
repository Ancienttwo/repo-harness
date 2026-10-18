import { createHash } from 'crypto';
import { existsSync, lstatSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { validateLeaseLivenessCurrent, validateLeaseLivenessPolicy, validateLeaseReclaimEligibility, validateLeaseRenewalObservation, type LeaseLivenessCurrentV1, type LeaseLivenessPolicyV1, type LeaseReclaimEligibilityReceiptV1, type LeaseRenewalObservationV1 } from '../../core/state/lease-liveness';
import { coordinationRoot } from './coordination-lease-store';

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
function regular(path: string): Buffer { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) fail('liveness_unsafe_path', `unsafe liveness file: ${path}`); return readFileSync(path); }
function json<T>(path: string): T { try { return JSON.parse(regular(path).toString('utf8')) as T; } catch (error) { return fail('liveness_conflict', `invalid liveness record: ${path}`, error); } }
function readCurrent(paths: ReturnType<typeof pathsFor>): LeaseLivenessCurrentV1 | null { return existsSync(paths.current) ? validateLeaseLivenessCurrent(json(paths.current)) : null; }
function readRenewal(paths: ReturnType<typeof pathsFor>, digest: string): LeaseRenewalObservationV1 { return validateLeaseRenewalObservation(json(join(paths.renewals, `${shaName(digest)}.json`))); }
function readPointer(repoRoot: string, taskId: string): LeaseLivenessPointerV1 {
  const path = taskRoot(repoRoot, taskId).pointer; if (!existsSync(path)) fail('liveness_not_found', 'lease liveness is missing');
  const pointer = json<LeaseLivenessPointerV1>(path);
  if (pointer.protocol !== 1 || pointer.kind !== 'repo-harness-lease-liveness-pointer' || pointer.task_id !== taskId || !SHA.test(pointer.current_sha256)) fail('liveness_conflict', 'invalid lease liveness generation pointer');
  safeIdentity(pointer); return pointer;
}


export function readLeaseLiveness(repoRoot: string, taskId: string, identity?: GenerationIdentity): { readonly policy: LeaseLivenessPolicyV1; readonly renewal: LeaseRenewalObservationV1; readonly current: LeaseLivenessCurrentV1 } {
  const selected = identity ?? readPointer(repoRoot, taskId); const paths = pathsFor(repoRoot, taskId, selected);
  if (!existsSync(paths.policy) || !existsSync(paths.current)) fail('liveness_not_found', 'lease liveness generation is missing');
  const policy = validateLeaseLivenessPolicy(json(paths.policy)); const current = readCurrent(paths)!; const renewal = readRenewal(paths, current.last_renewal_sha256);
  if (current.claim_id !== selected.claim_id || current.lease_generation !== selected.lease_generation || policy.policy_sha256 !== current.policy_sha256 || renewal.renewal_sha256 !== current.last_renewal_sha256 || renewal.claim_id !== current.claim_id || renewal.lease_generation !== current.lease_generation) fail('liveness_conflict', 'lease liveness projection is internally inconsistent');
  if (!identity && readPointer(repoRoot, taskId).current_sha256 !== current.current_sha256) fail('liveness_conflict', 'lease liveness pointer is stale');
  return Object.freeze({ policy, renewal, current });
}
export function readLeaseReclaimEligibility(repoRoot: string, taskId: string): LeaseReclaimEligibilityReceiptV1 | null {
  let pointer: LeaseLivenessPointerV1; try { pointer = readPointer(repoRoot, taskId); } catch (error) { if (error instanceof LeaseLivenessStoreError && error.code === 'liveness_not_found') return null; throw error; }
  const paths = pathsFor(repoRoot, taskId, pointer); if (!existsSync(paths.eligibility)) return null; const receipt = validateLeaseReclaimEligibility(json(paths.eligibility)); const current = readCurrent(paths);
  if (current === null || current.current_sha256 !== pointer.current_sha256 || current.last_renewal_sha256 !== receipt.renewal_sha256 || receipt.claim_id !== pointer.claim_id || receipt.lease_generation !== pointer.lease_generation) return null; return receipt;
}
