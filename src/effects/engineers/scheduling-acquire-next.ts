import { createHash, randomUUID } from 'crypto';
import { closeSync, constants, fstatSync, linkSync, lstatSync, openSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { validateEngineerOffersDocument, type EngineerOffersV1, type EngineerOfferV1 } from '../../core/engineers/scheduling';
import { validateEngineerPrincipal, type EngineerPrincipalV1 } from '../../core/engineers/principal-claim';
import { canonicalEngineerJson, engineerSha256 } from '../../core/engineers/profile-binding';
import { assertMessageExactKeys } from '../../core/messages/mechanics';
import { createFileExclusiveDurably, syncDirectoryDurably } from '../evidence/atomic-append';
import { resolveEngineerPrincipal } from './principal';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import {
  acquireScheduledEngineerTask,
  type ScheduledEngineerAcquireAssertionV1,
  type ScheduledEngineerAcquireResult,
} from './scheduling-acquire';
import { collectEngineerOffers } from './scheduling';

export interface AcquireNextFiltersV1 {
  readonly capability_id?: string;
  readonly minimum_priority?: number;
  readonly task_ids?: readonly string[];
}

export interface AcquireNextScheduledEngineerTaskOptions {
  readonly repo_root: string;
  readonly principal: EngineerPrincipalV1;
  readonly idempotency_key: string;
  readonly filters?: AcquireNextFiltersV1;
  readonly max_selection_attempts?: number;
  readonly session_id?: string | null;
  readonly env?: NodeJS.ProcessEnv;
  /** Reject a fresh handoff, including its own-claim compensation, before recording success. Never runs on replay. */
  readonly accept_acquired?: (result: Extract<ScheduledEngineerAcquireResult, { ok: true }>) => Exclude<ScheduledEngineerAcquireResult, { ok: true }> | void;
  readonly dependencies?: Partial<AcquireNextDependencies>;
}

export type AcquireNextScheduledEngineerTaskResult = ScheduledEngineerAcquireResult | {
  readonly ok: false;
  readonly error: 'engineer_no_eligible_offer' | 'engineer_acquire_next_conflict' | 'engineer_acquire_next_reconciliation_required';
  readonly message: string;
};

interface AcquireNextReceiptV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-engineer-acquire-next-receipt';
  readonly request_sha256: string;
  readonly state: 'pending' | 'completed';
  readonly result: AcquireNextScheduledEngineerTaskResult | null;
  readonly receipt_sha256: string;
}

export interface AcquireNextDependencies {
  readonly collectOffers: typeof collectEngineerOffers;
  readonly acquire: typeof acquireScheduledEngineerTask;
  readonly withLock: <T>(repoRoot: string, key: string, run: () => T) => T;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function validateOptions(options: AcquireNextScheduledEngineerTaskOptions): { attempts: number; filters: AcquireNextFiltersV1 } {
  if (options.idempotency_key.length < 1 || options.idempotency_key.length > 512) throw new Error('idempotency_key must contain 1 through 512 characters');
  const attempts = options.max_selection_attempts ?? 3;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 16) throw new Error('max_selection_attempts must be an integer from 1 through 16');
  const filters = options.filters ?? {};
  if (filters.capability_id !== undefined && !/^capability\.[a-z0-9][a-z0-9.-]*$/.test(filters.capability_id)) throw new Error('filters.capability_id is invalid');
  if (filters.minimum_priority !== undefined && (!Number.isSafeInteger(filters.minimum_priority) || filters.minimum_priority < 0 || filters.minimum_priority > 100)) throw new Error('filters.minimum_priority must be an integer from 0 through 100');
  if (Object.keys(filters).some(key => !['capability_id', 'minimum_priority', 'task_ids'].includes(key))) throw new Error('filters contains an unknown field');
  if (filters.task_ids !== undefined && (!Array.isArray(filters.task_ids) || Array.from(filters.task_ids).some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)))) throw new Error('filters.task_ids must contain canonical Task IDs');
  return { attempts, filters: Object.freeze({
    ...(filters.capability_id === undefined ? {} : { capability_id: filters.capability_id }),
    ...(filters.minimum_priority === undefined ? {} : { minimum_priority: filters.minimum_priority }),
    ...(filters.task_ids === undefined ? {} : { task_ids: Object.freeze([...new Set(filters.task_ids)].sort()) }),
  }) };
}

function assertion(offer: EngineerOfferV1): ScheduledEngineerAcquireAssertionV1 {
  return {
    offer_revision: offer.offer_revision, work_package_id: offer.work_package_id,
    work_package_revision: offer.work_package_revision, work_graph_revision: offer.work_graph_revision,
    task_id: offer.task_id, task_revision: offer.task_revision,
    dependency_revision: offer.dependency_revision, concurrency_revision: offer.concurrency_revision,
    binding_id: offer.binding_id, binding_generation: offer.binding_generation,
    engineer_contract_revision: offer.engineer_contract_revision,
    fleet_offer_revision: offer.fleet_offer_revision, authorization_revision: offer.authorization_revision,
  };
}

function receiptPath(repoRoot: string, key: string): string {
  const name = createHash('sha256').update(key, 'utf8').digest('hex');
  return join(resolveGitCommonDirectory(repoRoot), 'repo-harness/engineer-scheduling/v1/acquire-next', `${name}.json`);
}

function writeReceipt(path: string, receipt: AcquireNextReceiptV1): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, `${JSON.stringify(receipt)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  renameSync(temporary, path);
}

function buildReceipt(requestSha256: string, state: AcquireNextReceiptV1['state'], result: AcquireNextScheduledEngineerTaskResult | null): AcquireNextReceiptV1 {
  const basis = { protocol: 1 as const, kind: 'repo-harness-engineer-acquire-next-receipt' as const, request_sha256: requestSha256, state, result };
  return Object.freeze({ ...basis, receipt_sha256: digest(basis) });
}

function readReceipt(path: string): AcquireNextReceiptV1 {
  const value = JSON.parse(readFileSync(path, 'utf8')) as AcquireNextReceiptV1;
  const basis = { protocol: value.protocol, kind: value.kind, request_sha256: value.request_sha256, state: value.state, result: value.result };
  if (value.protocol !== 1 || value.kind !== 'repo-harness-engineer-acquire-next-receipt'
    || (value.state !== 'pending' && value.state !== 'completed') || value.receipt_sha256 !== digest(basis)
    || (value.state === 'pending' ? value.result !== null : value.result === null)) {
    throw new Error('acquire-next receipt is malformed or has been modified');
  }
  return value;
}

function eligible(offer: EngineerOfferV1, filters: AcquireNextFiltersV1): boolean {
  return (filters.capability_id === undefined || offer.primary_capability === filters.capability_id)
    && (filters.minimum_priority === undefined || offer.priority >= filters.minimum_priority)
    && (filters.task_ids === undefined || filters.task_ids.includes(offer.task_id));
}

function selectionMayBeRetried(result: AcquireNextScheduledEngineerTaskResult): boolean {
  return !result.ok && (result.error === 'engineer_offer_stale'
    || (result.error === 'fleet_acquire_failed'
      && result.fleet?.ok === false
      && result.fleet.error === 'fleet_acquire_failed'
      && result.fleet.fleet?.ok === false
      && (result.fleet.fleet.error === 'offer_stale' || result.fleet.fleet.error === 'claim_failed')));
}

function campaignCapacityBlocked(result: AcquireNextScheduledEngineerTaskResult): boolean {
  return !result.ok && result.error === 'fleet_acquire_failed' && result.fleet?.ok === false
    && result.fleet.error === 'fleet_acquire_failed' && result.fleet.fleet?.ok === false
    && result.fleet.fleet.error === 'no_eligible_task' && result.fleet.fleet.reason === 'campaign_capacity_full';
}

export function acquireNextScheduledEngineerTask(options: AcquireNextScheduledEngineerTaskOptions): AcquireNextScheduledEngineerTaskResult {
  const { attempts, filters } = validateOptions(options);
  const deps: AcquireNextDependencies = {
    collectOffers: collectEngineerOffers,
    acquire: acquireScheduledEngineerTask,
    withLock: (root, key, run) => withExclusiveDirectoryLock(resolveGitCommonDirectory(root), `repo-harness/engineer-scheduling/v1/acquire-next/${createHash('sha256').update(key).digest('hex')}.lock`, run, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true }),
    ...options.dependencies,
  };
  const requestSha256 = digest({ principal: options.principal, filters, max_selection_attempts: attempts });
  return deps.withLock(options.repo_root, options.idempotency_key, () => {
    const path = receiptPath(options.repo_root, options.idempotency_key);
    if (existsSync(path)) {
      const receipt = readReceipt(path);
      if (receipt.request_sha256 !== requestSha256) {
        return Object.freeze({ ok: false, error: 'engineer_acquire_next_conflict', message: 'idempotency key names another acquire-next request' });
      }
      if (receipt.state === 'pending') return Object.freeze({ ok: false, error: 'engineer_acquire_next_reconciliation_required', message: 'the previous acquire-next attempt crossed an unresolved side-effect boundary' });
      return receipt.result!;
    }
    writeReceipt(path, buildReceipt(requestSha256, 'pending', null));
    // Retry eligibility is a time-indexed snapshot; revalidation must use the same observation instant.
    const observedAt = Date.now();
    const noEligible = Object.freeze({ ok: false as const, error: 'engineer_no_eligible_offer' as const, message: 'no eligible Engineer offer matches the closed filters and current campaign capacity' });
    let result: AcquireNextScheduledEngineerTaskResult = noEligible;
    const fullCandidates = new Set<string>();
    let capacityScanLimit: number | undefined;
    for (let index = 0; index < attempts; index += 1) {
      const document = deps.collectOffers({ repo_root: options.repo_root, principal: options.principal, env: options.env, now_ms: observedAt });
      capacityScanLimit ??= document.offers.length;
      const selected = document.offers.find((offer) => eligible(offer, filters) && !fullCandidates.has(offer.task_id));
      if (!selected) {
        unlinkSync(path);
        return result;
      }
      result = deps.acquire({ repo_root: options.repo_root, principal: options.principal, assertion: assertion(selected), session_id: options.session_id, env: options.env, offer_options: { now_ms: observedAt } });
      if (campaignCapacityBlocked(result)) {
        fullCandidates.add(selected.task_id);
        result = noEligible;
        if (fullCandidates.size >= capacityScanLimit) {
          unlinkSync(path);
          return result;
        }
        // Capacity refusals precede claim; scan the bounded snapshot without spending race retries.
        index -= 1;
        continue;
      }
      if (!selectionMayBeRetried(result)) break;
    }
    if (result.ok && options.accept_acquired) result = options.accept_acquired(result) ?? result;
    writeReceipt(path, buildReceipt(requestSha256, 'completed', result));
    return result;
  });
}

/** Evidence only. S2 must check key-ledger state before applying this admission-start TTL. */
export const ENGINEER_OBSERVATION_FRESHNESS_MS = 30_000;
const OBSERVATION_STORE = 'repo-harness/engineer-scheduling/v1/observations';
const OBSERVATION_PRODUCER = 'repo-harness-engineer-observation-v1';

export class EngineerObservationError extends Error {
  readonly code = 'engineer_observation_invalid';
}

export interface EngineerObservationV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-engineer-observation';
  readonly producer: typeof OBSERVATION_PRODUCER;
  readonly repository_id: string;
  readonly git_common_directory: string;
  readonly principal: EngineerPrincipalV1;
  readonly snapshot_bytes: string;
  readonly snapshot_sha256: string;
  readonly observed_at_ms: number;
  readonly expires_at_ms: number;
  readonly policy_revision: string;
}

/** These ports are trusted server code, never transport fields. */
export interface EngineerObservationOptions {
  readonly repo_root: string;
  readonly principal: EngineerPrincipalV1;
  readonly env?: NodeJS.ProcessEnv;
  readonly dependencies?: Partial<{
    now: () => number;
    resolvePrincipal: typeof resolveEngineerPrincipal;
    collectOffers: typeof collectEngineerOffers;
  }>;
}

export interface PreparedEngineerObservation {
  readonly observation_ref: string;
  readonly observation: EngineerObservationV1;
  readonly offers: EngineerOffersV1;
}

function invalidObservation(message: string): never {
  throw new EngineerObservationError(message);
}

function observationClock(options: EngineerObservationOptions): number {
  const now = (options.dependencies?.now ?? Date.now)();
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000 - ENGINEER_OBSERVATION_FRESHNESS_MS) invalidObservation('server observation clock is invalid');
  return now;
}

function observationPrincipal(options: EngineerObservationOptions): EngineerPrincipalV1 {
  const current = (options.dependencies?.resolvePrincipal ?? resolveEngineerPrincipal)({
    repo_root: options.repo_root, authorization_id: options.principal.auth_subject, env: options.env,
  });
  if (canonicalEngineerJson(current) !== canonicalEngineerJson(options.principal)) invalidObservation('observation principal no longer matches current authenticated Binding');
  return current;
}

function observationPolicy(repoRoot: string): string {
  // No default policy or compatibility projection: absent source authority refuses prepare/read.
  const path = join(repoRoot, '.ai/harness/policy.json');
  const bytes = readObservationFile(path);
  JSON.parse(bytes);
  return engineerSha256(canonicalEngineerJson({ producer: OBSERVATION_PRODUCER,
    freshness_ms: ENGINEER_OBSERVATION_FRESHNESS_MS, policy_sha256: engineerSha256(bytes) }));
}

function readObservationFile(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) invalidObservation('observation source must be a regular non-linked file');
    return readFileSync(fd, 'utf8');
  } finally { closeSync(fd); }
}

/** Check each descendant before opening/creating it; reject symlinked store ancestors. */
function observationDirectory(common: string, create: boolean): string {
  let path = common;
  for (const part of OBSERVATION_STORE.split('/')) {
    path = join(path, part);
    if (create && !existsSync(path)) {
      try { mkdirSync(path, { mode: 0o700 }); syncDirectoryDurably(dirname(path)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalidObservation('observation store path is unsafe');
  }
  return path;
}

function decodeObservation(bytes: string, ref: string): EngineerObservationV1 {
  if (engineerSha256(bytes) !== ref) invalidObservation('observation receipt was modified');
  const value = JSON.parse(bytes) as Record<string, unknown>;
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidObservation('observation record is invalid');
  assertMessageExactKeys(value, ['protocol', 'kind', 'producer', 'repository_id', 'git_common_directory', 'principal',
    'snapshot_bytes', 'snapshot_sha256', 'observed_at_ms', 'expires_at_ms', 'policy_revision'], 'observation', invalidObservation);
  if (value.protocol !== 1 || value.kind !== 'repo-harness-engineer-observation' || value.producer !== OBSERVATION_PRODUCER
    || canonicalEngineerJson(value) !== bytes) invalidObservation('observation schema or canonical bytes are invalid');
  const principal = validateEngineerPrincipal(value.principal);
  if (typeof value.snapshot_bytes !== 'string' || engineerSha256(value.snapshot_bytes) !== value.snapshot_sha256) invalidObservation('observation snapshot digest is invalid');
  const offers = validateEngineerOffersDocument(JSON.parse(value.snapshot_bytes));
  if (canonicalEngineerJson(offers) !== value.snapshot_bytes || offers.repository_id !== value.repository_id
    || offers.repository_id !== principal.repository_id || offers.engineer_id !== principal.engineer_id
    || offers.offers.some(offer => offer.binding_id !== principal.binding_id || offer.binding_generation !== principal.binding_generation
      || offer.engineer_contract_revision !== principal.engineer_contract_revision)) invalidObservation('observation snapshot ownership is invalid');
  if (!Number.isSafeInteger(value.observed_at_ms) || (value.observed_at_ms as number) < 0
    || !Number.isSafeInteger(value.expires_at_ms)
    || value.expires_at_ms !== (value.observed_at_ms as number) + ENGINEER_OBSERVATION_FRESHNESS_MS) invalidObservation('observation time bounds are invalid');
  return Object.freeze({ ...value, principal }) as unknown as EngineerObservationV1;
}

export function prepareEngineerObservation(options: EngineerObservationOptions): PreparedEngineerObservation {
  const principal = observationPrincipal(options);
  const common = resolveGitCommonDirectory(options.repo_root);
  const directory = observationDirectory(common, true);
  const policyRevision = observationPolicy(options.repo_root);
  const observedAt = observationClock(options);
  const offers = validateEngineerOffersDocument((options.dependencies?.collectOffers ?? collectEngineerOffers)({
    repo_root: options.repo_root, principal, env: options.env, now_ms: observedAt,
  }));
  if (observationPolicy(options.repo_root) !== policyRevision) invalidObservation('observation policy changed during prepare');
  observationPrincipal(options);
  const snapshotBytes = canonicalEngineerJson(offers);
  const observation: EngineerObservationV1 = Object.freeze({ protocol: 1, kind: 'repo-harness-engineer-observation',
    producer: OBSERVATION_PRODUCER, repository_id: principal.repository_id, git_common_directory: common, principal,
    snapshot_bytes: snapshotBytes, snapshot_sha256: engineerSha256(snapshotBytes), observed_at_ms: observedAt,
    expires_at_ms: observedAt + ENGINEER_OBSERVATION_FRESHNESS_MS, policy_revision: policyRevision });
  const bytes = canonicalEngineerJson(observation);
  const ref = engineerSha256(bytes);
  decodeObservation(bytes, ref);
  return withExclusiveDirectoryLock(common, `${OBSERVATION_STORE}/${ref.slice(7)}.lock`, () => {
    observationDirectory(common, false);
    const path = join(directory, `${ref.slice(7)}.json`);
    if (existsSync(path)) {
      if (readObservationFile(path) !== bytes) invalidObservation('immutable observation ref conflicts with stored bytes');
    } else {
      const temporary = join(directory, `.prepare-${randomUUID()}`);
      try {
        createFileExclusiveDurably(temporary, Buffer.from(bytes));
        linkSync(temporary, path); // Publish complete, flushed bytes without replacing an existing ref.
      } finally { if (existsSync(temporary)) unlinkSync(temporary); }
      syncDirectoryDurably(directory);
    }
    return Object.freeze({ observation_ref: ref, observation, offers });
  });
}

export function readEngineerObservation(options: EngineerObservationOptions & { readonly observation_ref: string }): PreparedEngineerObservation {
  if (!/^sha256:[0-9a-f]{64}$/.test(options.observation_ref)) invalidObservation('observation ref is invalid');
  const principal = observationPrincipal(options);
  const common = resolveGitCommonDirectory(options.repo_root);
  const directory = observationDirectory(common, false);
  const observation = decodeObservation(readObservationFile(join(directory, `${options.observation_ref.slice(7)}.json`)), options.observation_ref);
  if (observation.git_common_directory !== common || observation.repository_id !== principal.repository_id
    || canonicalEngineerJson(observation.principal) !== canonicalEngineerJson(principal)) invalidObservation('observation belongs to another repository or principal/Binding');
  if (observation.policy_revision !== observationPolicy(options.repo_root)) invalidObservation('observation policy revision changed');
  const now = observationClock(options);
  if (now < observation.observed_at_ms) invalidObservation('observation is in the future or the server clock rolled back');
  if (now >= observation.expires_at_ms) invalidObservation('observation expired for a new admission start');
  return Object.freeze({ observation_ref: options.observation_ref, observation,
    offers: validateEngineerOffersDocument(JSON.parse(observation.snapshot_bytes)) });
}
