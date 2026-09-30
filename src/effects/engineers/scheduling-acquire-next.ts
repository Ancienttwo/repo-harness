import { createHash, randomUUID } from 'crypto';
import { closeSync, constants, fstatSync, linkSync, lstatSync, openSync, readdirSync, realpathSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { validateEngineerOffersDocument, type EngineerOffersV1, type EngineerOfferV1 } from '../../core/engineers/scheduling';
import { validateEngineerPrincipal, type EngineerPrincipalV1 } from '../../core/engineers/principal-claim';
import { canonicalEngineerJson, engineerSha256 } from '../../core/engineers/profile-binding';
import { assertMessageExactKeys } from '../../core/messages/mechanics';
import { createFileExclusiveDurably, syncDirectoryDurably } from '../evidence/atomic-append';
import { readRepoHarnessRegistrySnapshot } from '../repo-registry';
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

/** Trusted entrypoint metadata, never a transport-selected callback or policy. R1 preserves today's callback. */
export interface AcquisitionPolicyR1 {
  readonly policy_id: 'engineer/plain' | 'engineer/campaign';
  readonly policy_revision: 'R1';
  readonly scope: null | Readonly<{
    campaign_id: string; group_number: number; intent_sha256: string; manifest_sha256: string;
    authorization_revision: string; parent_host: string; parent_session: string;
  }>;
}
export const PLAIN_ACQUISITION_POLICY_R1: AcquisitionPolicyR1 = Object.freeze({ policy_id: 'engineer/plain', policy_revision: 'R1', scope: null });

export interface AcquireNextScheduledEngineerTaskOptions {
  readonly repo_root: string;
  readonly principal: EngineerPrincipalV1;
  readonly idempotency_key: string;
  readonly filters?: AcquireNextFiltersV1;
  readonly max_selection_attempts?: number;
  readonly session_id?: string | null;
  readonly env?: NodeJS.ProcessEnv;
  readonly admission_policy?: AcquisitionPolicyR1;
  readonly accept_acquired?: (result: Extract<ScheduledEngineerAcquireResult, { ok: true }>) => Exclude<ScheduledEngineerAcquireResult, { ok: true }> | void;
  readonly dependencies?: Partial<AcquireNextDependencies>;
}
export interface AcquireSelectedEngineerTaskOptions extends Omit<AcquireNextScheduledEngineerTaskOptions, 'filters' | 'max_selection_attempts'> {
  readonly assertion: ScheduledEngineerAcquireAssertionV1;
  readonly observation_ref: string;
}
export type AcquireNextScheduledEngineerTaskResult = ScheduledEngineerAcquireResult | {
  readonly ok: false;
  readonly error: 'engineer_no_eligible_offer' | 'engineer_acquire_next_conflict' | 'engineer_acquire_next_reconciliation_required';
  readonly message: string;
};
export interface AcquireNextDependencies {
  readonly collectOffers: typeof collectEngineerOffers;
  readonly acquire: typeof acquireScheduledEngineerTask;
  readonly resolvePrincipal: typeof resolveEngineerPrincipal;
  readonly now: () => number;
  readonly withLock: <T>(repoRoot: string, key: string, run: () => T) => T;
}
export interface AcquisitionRequestV2 {
  readonly protocol: 2;
  readonly operation: 'auto' | 'selected';
  readonly key_sha256: string;
  readonly repository: string;
  readonly principal: EngineerPrincipalV1;
  readonly session_id: string | null;
  readonly policy: AcquisitionPolicyR1;
  readonly filters: AcquireNextFiltersV1 | null;
  readonly max_selection_attempts: number | null;
  readonly assertion: ScheduledEngineerAcquireAssertionV1 | null;
  readonly observation_ref: string | null;
}
interface AcquisitionReceiptV2 {
  readonly protocol: 2;
  readonly kind: 'repo-harness-engineer-acquisition-receipt';
  readonly request: AcquisitionRequestV2 | null;
  readonly request_sha256: string | null;
  readonly state: 'pending' | 'completed' | 'idle' | 'fenced';
  readonly result: AcquireNextScheduledEngineerTaskResult | null;
  readonly observation_ref: string | null;
  readonly legacy_bytes: string | null;
  readonly receipt_sha256: string;
}
const ACQUISITION_STORE = 'repo-harness/engineer-scheduling/v1/acquire-next'; // Preserve the physical logical-key address.
const CUTOVER_KIND = 'repo-harness-engineer-acquisition-cutover';
interface CutoverSeal {
  protocol: 2; kind: typeof CUTOVER_KIND; inventory_sha256: string; migrated_keys: readonly string[];
  quiescence_evidence: string; seal_sha256: string;
}
function digest(value: unknown): string { return engineerSha256(canonicalEngineerJson(value)); }
function acquisitionFailure(error: 'engineer_acquire_next_conflict' | 'engineer_acquire_next_reconciliation_required', message: string): AcquireNextScheduledEngineerTaskResult {
  return Object.freeze({ ok: false, error, message });
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
  return { offer_revision: offer.offer_revision, work_package_id: offer.work_package_id,
    work_package_revision: offer.work_package_revision, work_graph_revision: offer.work_graph_revision,
    task_id: offer.task_id, task_revision: offer.task_revision, dependency_revision: offer.dependency_revision,
    concurrency_revision: offer.concurrency_revision, binding_id: offer.binding_id, binding_generation: offer.binding_generation,
    engineer_contract_revision: offer.engineer_contract_revision, fleet_offer_revision: offer.fleet_offer_revision,
    authorization_revision: offer.authorization_revision };
}
function closedAssertion(value: ScheduledEngineerAcquireAssertionV1): ScheduledEngineerAcquireAssertionV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('selected assertion is required');
  const keys = ['offer_revision','work_package_id','work_package_revision','work_graph_revision','task_id','task_revision',
    'dependency_revision','concurrency_revision','binding_id','binding_generation','engineer_contract_revision','fleet_offer_revision','authorization_revision'];
  assertMessageExactKeys(value as unknown as Record<string, unknown>, keys, 'selected assertion', message => { throw new Error(message); });
  for (const key of keys) {
    const item = (value as unknown as Record<string, unknown>)[key];
    if (key === 'binding_generation' || key === 'authorization_revision') {
      if (!Number.isSafeInteger(item) || (item as number) < (key === 'binding_generation' ? 1 : 0)) throw new Error(`selected ${key} is invalid`);
    } else if (typeof item !== 'string' || !item.length || item.length > 512) throw new Error(`selected ${key} is invalid`);
  }
  return Object.freeze({ ...value });
}
function policyFor(options: AcquireNextScheduledEngineerTaskOptions): AcquisitionPolicyR1 {
  const policy = options.admission_policy ?? PLAIN_ACQUISITION_POLICY_R1;
  assertMessageExactKeys(policy as unknown as Record<string, unknown>, ['policy_id','policy_revision','scope'], 'acquisition policy', message => { throw new Error(message); });
  if (policy.policy_revision !== 'R1' || !['engineer/plain','engineer/campaign'].includes(policy.policy_id)) throw new Error('unsupported trusted acquisition policy');
  if (policy.policy_id === 'engineer/plain') {
    if (policy.scope !== null || options.accept_acquired) throw new Error('plain acquisition cannot carry a campaign callback');
  } else {
    if (!policy.scope || !options.accept_acquired) throw new Error('campaign acquisition requires its trusted R1 scope and callback');
    assertMessageExactKeys(policy.scope, ['campaign_id','group_number','intent_sha256','manifest_sha256','authorization_revision','parent_host','parent_session'], 'campaign acquisition scope', message => { throw new Error(message); });
    for (const [key, value] of Object.entries(policy.scope)) {
      if (key === 'group_number' ? !Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 3 : typeof value !== 'string' || !value.length || value.length > 512) throw new Error('campaign acquisition scope is invalid');
    }
  }
  return Object.freeze({ ...policy, scope: policy.scope === null ? null : Object.freeze({ ...policy.scope }) });
}
function acquisitionDependencies(options: AcquireNextScheduledEngineerTaskOptions): AcquireNextDependencies {
  return { collectOffers: collectEngineerOffers, acquire: acquireScheduledEngineerTask, now: Date.now,
    resolvePrincipal: input => {
      const principal = resolveEngineerPrincipal(input);
      const registry = readRepoHarnessRegistrySnapshot({ env: input.env, adoptedOnly: true });
      const repo = registry.repos.find(entry => entry.id === principal.repository_id);
      if (!repo || repo.accessMode !== 'read_write' || realpathSync(repo.path) !== realpathSync(input.repo_root)) throw new Error('current acquisition principal lacks registered read_write authority');
      return principal;
    },
    withLock: (root, key, run) => withExclusiveDirectoryLock(resolveGitCommonDirectory(root), `${ACQUISITION_STORE}/${createHash('sha256').update(key).digest('hex')}.lock`, run, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true }),
    ...options.dependencies };
}
function storedEntryExists(path: string): boolean {
  try { lstatSync(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new Error('ledger metadata is unreadable; requires reconciliation');
  }
}
function receiptPath(repoRoot: string, key: string): string {
  return join(resolveGitCommonDirectory(repoRoot), ACQUISITION_STORE, `${createHash('sha256').update(key).digest('hex')}.json`);
}
function writeReceipt(path: string, value: unknown): void {
  const temporary = `${path}.tmp-${randomUUID()}`;
  try {
    createFileExclusiveDurably(temporary, Buffer.from(`${canonicalEngineerJson(value)}\n`));
    renameSync(temporary, path); syncDirectoryDurably(dirname(path));
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
function buildReceipt(request: AcquisitionRequestV2 | null, state: AcquisitionReceiptV2['state'], result: AcquireNextScheduledEngineerTaskResult | null, legacyBytes: string | null = null): AcquisitionReceiptV2 {
  const basis = { protocol: 2 as const, kind: 'repo-harness-engineer-acquisition-receipt' as const, request,
    request_sha256: request === null ? null : digest(request), state, result,
    observation_ref: request?.observation_ref ?? null, legacy_bytes: legacyBytes };
  return Object.freeze({ ...basis, receipt_sha256: digest(basis) });
}
function readReceipt(path: string): AcquisitionReceiptV2 {
  const raw = readObservationFile(path);
  const value = JSON.parse(raw) as AcquisitionReceiptV2;
  assertMessageExactKeys(value as unknown as Record<string, unknown>, ['protocol','kind','request','request_sha256','state','result','observation_ref','legacy_bytes','receipt_sha256'], 'acquisition receipt', message => { throw new Error(`${message}; requires reconciliation, never a new transaction`); });
  const { receipt_sha256, ...basis } = value;
  if (value.protocol !== 2 || value.kind !== 'repo-harness-engineer-acquisition-receipt' || receipt_sha256 !== digest(basis)
    || raw !== `${canonicalEngineerJson(value)}\n` || !['pending','completed','idle','fenced'].includes(value.state)
    || (value.state === 'fenced' ? value.request !== null || value.result !== null || typeof value.legacy_bytes !== 'string'
      : value.request === null || value.request_sha256 !== digest(value.request) || value.observation_ref !== value.request.observation_ref || value.legacy_bytes !== null)
    || (value.state === 'pending' ? value.result !== null : value.state !== 'fenced' && value.result === null)
    || (value.state === 'idle' && (value.request?.operation !== 'auto' || value.result?.ok !== false || value.result.error !== 'engineer_no_eligible_offer'))) throw new Error('acquisition receipt is malformed or has been modified; requires reconciliation');
  return value;
}
function sealPath(root: string): string { return join(resolveGitCommonDirectory(root), ACQUISITION_STORE, 'cutover-v2.json'); }
function readSeal(root: string): CutoverSeal {
  const value = JSON.parse(readObservationFile(sealPath(root))) as CutoverSeal;
  assertMessageExactKeys(value as unknown as Record<string, unknown>, ['protocol','kind','inventory_sha256','migrated_keys','quiescence_evidence','seal_sha256'], 'acquisition cutover seal', message => { throw new Error(message); });
  const { seal_sha256, ...basis } = value;
  if (value.protocol !== 2 || value.kind !== CUTOVER_KIND || seal_sha256 !== digest(basis) || !Array.isArray(value.migrated_keys)
    || value.migrated_keys.some(key => !/^[a-f0-9]{64}$/.test(key)) || !/^sha256:[a-f0-9]{64}$/.test(value.inventory_sha256) || !value.quiescence_evidence) throw new Error('acquisition cutover seal requires reconciliation');
  return value;
}
function cutoverLock<T>(root: string, run: () => T): T {
  const common = resolveGitCommonDirectory(root);
  return withExclusiveDirectoryLock(common, 'repo-harness/engineer-scheduling/v1/acquisition-cutover.lock', run, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}
/** Read-only operator inventory. This is never called by a normal v2 receipt reader. */
export function inspectAcquisitionReceiptCutover(repoRoot: string) {
  const directory = join(resolveGitCommonDirectory(repoRoot), ACQUISITION_STORE);
  if (existsSync(directory)) guardedSchedulingDirectory(resolveGitCommonDirectory(repoRoot), ACQUISITION_STORE, false);
  const entries = !existsSync(directory) ? [] : readdirSync(directory).sort().filter(name => name !== 'cutover-v2.json').map(name => {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) throw new Error('acquisition cutover requires quiesced producers and reconciliation of unsettled files/locks');
    const raw = readObservationFile(join(directory, name));
    const value = JSON.parse(raw);
    // Interrupted one-shot conversion retains the exact source bytes in the closed v2 fence.
    const bytes = value.protocol === 2 ? readReceipt(join(directory, name)).legacy_bytes : raw;
    if (typeof bytes !== 'string') throw new Error('cutover inventory contains a non-legacy transaction');
    return { key: name.slice(0,-5), bytes };
  });
  return Object.freeze({ inventory_sha256: digest(entries), entries: Object.freeze(entries) });
}
/** Offline one-shot cutover, after operator quiescence/recovery. Pending/unknown never become fabricated completed results. */
export function migrateAcquisitionReceipts(options: { repo_root: string; expected_inventory_sha256: string; quiescence_evidence: string }) {
  if (!options.quiescence_evidence.trim()) throw new Error('explicit old-producer quiescence evidence is required');
  return cutoverLock(options.repo_root, () => {
    if (storedEntryExists(sealPath(options.repo_root))) {
      const seal = readSeal(options.repo_root);
      if (seal.inventory_sha256 !== options.expected_inventory_sha256) throw new Error('cutover already sealed with another inventory');
      return seal;
    }
    guardedSchedulingDirectory(resolveGitCommonDirectory(options.repo_root), ACQUISITION_STORE, true);
    const inventory = inspectAcquisitionReceiptCutover(options.repo_root);
    if (inventory.inventory_sha256 !== options.expected_inventory_sha256) throw new Error('cutover inventory changed');
    // This parser exists only on the explicit one-shot operation, never on normal acquisition/replay.
    for (const { bytes } of inventory.entries) {
      const value = JSON.parse(bytes);
      assertMessageExactKeys(value, ['protocol','kind','request_sha256','state','result','receipt_sha256'], 'legacy acquisition receipt', message => { throw new Error(message); });
      const basis = { protocol: value.protocol, kind: value.kind, request_sha256: value.request_sha256, state: value.state, result: value.result };
      const oldDigest = `sha256:${createHash('sha256').update(JSON.stringify(basis)).digest('hex')}`;
      if (value.protocol !== 1 || value.kind !== 'repo-harness-engineer-acquire-next-receipt' || value.receipt_sha256 !== oldDigest || value.state !== 'completed' || value.result === null || typeof value.result.ok !== 'boolean' || !/^sha256:[a-f0-9]{64}$/.test(value.request_sha256)) throw new Error('legacy pending, corrupt or unknown effect must be explicitly reconciled before cutover');
    }
    for (const { key, bytes } of inventory.entries) writeReceipt(join(resolveGitCommonDirectory(options.repo_root), ACQUISITION_STORE, `${key}.json`), buildReceipt(null,'fenced',null,bytes));
    const basis = { protocol: 2 as const, kind: CUTOVER_KIND, inventory_sha256: inventory.inventory_sha256,
      migrated_keys: inventory.entries.map(entry => entry.key), quiescence_evidence: options.quiescence_evidence };
    const seal = { ...basis, seal_sha256: digest(basis) }; writeReceipt(sealPath(options.repo_root), seal); return seal;
  });
}
/** Empty new stores may initialize v2. Any pre-existing key requires explicit offline cutover. */
export function requireAcquisitionLedgerV2(repoRoot: string): void {
  if (storedEntryExists(sealPath(repoRoot))) { readSeal(repoRoot); return; }
  cutoverLock(repoRoot, () => {
    if (storedEntryExists(sealPath(repoRoot))) { readSeal(repoRoot); return; }
    const common = resolveGitCommonDirectory(repoRoot), directory = join(common, ACQUISITION_STORE);
    // Normal activation never parses legacy bytes. Non-empty/unsettled stores require the one-shot operator path.
    if (existsSync(directory)) {
      guardedSchedulingDirectory(common, ACQUISITION_STORE, false);
      if (readdirSync(directory).length) throw new Error('explicit one-shot acquisition receipt cutover is required before any new effect');
    }
    guardedSchedulingDirectory(common, ACQUISITION_STORE, true);
    const basis = { protocol: 2 as const, kind: CUTOVER_KIND, inventory_sha256: digest([]),
      migrated_keys: [] as string[], quiescence_evidence: 'new-empty-store' };
    writeReceipt(sealPath(repoRoot), { ...basis, seal_sha256: digest(basis) });
  });
}
/** The outer budget owner checks inner key state before reserving. This reads v2 only and never replays an effect. */
export function requireFreshAcquisitionBudgetAdmission(repoRoot: string, request: AcquisitionRequestV2): void {
  if (request.repository !== resolveGitCommonDirectory(repoRoot) || !/^sha256:[a-f0-9]{64}$/.test(request.key_sha256)) throw new Error('inner acquisition request identity is invalid');
  requireAcquisitionLedgerV2(repoRoot);
  const path = join(request.repository, ACQUISITION_STORE, `${request.key_sha256.slice(7)}.json`);
  if (!storedEntryExists(path)) {
    if (readSeal(repoRoot).migrated_keys.includes(request.key_sha256.slice(7))) throw new Error('known inner legacy fence is missing; requires reconciliation');
    return;
  }
  const receipt = readReceipt(path);
  if (receipt.state === 'fenced' || receipt.request_sha256 !== digest(request)) throw new Error('inner acquisition key conflict before budget reservation');
  if (receipt.state !== 'idle') throw new Error('inner acquisition has no matching outer outcome; requires reconciliation before budget reservation');
}

function eligible(offer: EngineerOfferV1, filters: AcquireNextFiltersV1): boolean {
  return (filters.capability_id === undefined || offer.primary_capability === filters.capability_id)
    && (filters.minimum_priority === undefined || offer.priority >= filters.minimum_priority)
    && (filters.task_ids === undefined || filters.task_ids.includes(offer.task_id));
}
function selectionMayBeRetried(result: AcquireNextScheduledEngineerTaskResult): boolean {
  return !result.ok && (result.error === 'engineer_offer_stale' || (result.error === 'fleet_acquire_failed' && result.fleet?.ok === false && result.fleet.error === 'fleet_acquire_failed' && result.fleet.fleet?.ok === false && (result.fleet.fleet.error === 'offer_stale' || result.fleet.fleet.error === 'claim_failed')));
}
function campaignCapacityBlocked(result: AcquireNextScheduledEngineerTaskResult): boolean {
  return !result.ok && result.error === 'fleet_acquire_failed' && result.fleet?.ok === false && result.fleet.fleet?.ok === false && result.fleet.fleet.error === 'no_eligible_task' && result.fleet.fleet.reason === 'campaign_capacity_full';
}
function runAcquisitionTransaction(options: AcquireNextScheduledEngineerTaskOptions, request: AcquisitionRequestV2, deps: AcquireNextDependencies, perform: (observation: PreparedEngineerObservation | null) => AcquireNextScheduledEngineerTaskResult): AcquireNextScheduledEngineerTaskResult {
  const authorized = deps.resolvePrincipal({ repo_root: options.repo_root, authorization_id: options.principal.auth_subject, env: options.env });
  if (canonicalEngineerJson(authorized) !== canonicalEngineerJson(request.principal)) throw new Error('current acquisition principal/Binding differs');
  requireAcquisitionLedgerV2(options.repo_root);
  return deps.withLock(options.repo_root, options.idempotency_key, () => {
    const current = deps.resolvePrincipal({ repo_root: options.repo_root, authorization_id: options.principal.auth_subject, env: options.env });
    if (canonicalEngineerJson(current) !== canonicalEngineerJson(request.principal)) throw new Error('current acquisition principal/Binding differs');
    const path = receiptPath(options.repo_root, options.idempotency_key);
    if (storedEntryExists(path)) {
      const receipt = readReceipt(path);
      if (receipt.state === 'fenced') return acquisitionFailure('engineer_acquire_next_conflict','legacy completed key is fenced; choose a new key after explicit recovery');
      if (receipt.request_sha256 !== digest(request)) return acquisitionFailure('engineer_acquire_next_conflict','idempotency key names another authenticated acquisition request');
      if (receipt.state === 'pending') return acquisitionFailure('engineer_acquire_next_reconciliation_required','previous acquisition crossed an unresolved effect boundary');
      if (receipt.state === 'completed') return receipt.result!;
      // Determinate auto idle may be retried without pretending an effect happened; identity stays bound.
    } else if (readSeal(options.repo_root).migrated_keys.includes(createHash('sha256').update(options.idempotency_key).digest('hex'))) {
      return acquisitionFailure('engineer_acquire_next_reconciliation_required','known legacy fence is missing; never treat it as a new request');
    }
    // Observation lookup/freshness belongs here, AFTER pending/completed/conflict handling, BEFORE pending/effect.
    const observation = request.operation !== 'selected' ? null : readEngineerObservation({
      repo_root: options.repo_root, principal: current, env: options.env, observation_ref: request.observation_ref!,
      dependencies: { now: deps.now, resolvePrincipal: deps.resolvePrincipal },
    });
    writeReceipt(path, buildReceipt(request,'pending',null));
    let result = perform(observation);
    if (result.ok && options.accept_acquired) result = options.accept_acquired(result) ?? result;
    const idle = request.operation === 'auto' && !result.ok && result.error === 'engineer_no_eligible_offer';
    if (idle) {
      // A determinate no-effect poll remains uncached, under the key lock, as in the original auto path.
      unlinkSync(path); syncDirectoryDurably(dirname(path));
    } else {
      writeReceipt(path, buildReceipt(request,'completed',result));
    }
    return result;
  });
}
function requestBasis(options: AcquireNextScheduledEngineerTaskOptions, operation: 'auto' | 'selected', filters: AcquireNextFiltersV1 | null, attempts: number | null, selected: ScheduledEngineerAcquireAssertionV1 | null, observationRef: string | null): AcquisitionRequestV2 {
  if (!options.idempotency_key || options.idempotency_key.length > 512) throw new Error('idempotency_key must contain 1 through 512 characters');
  const session = options.session_id ?? null;
  if (session !== null && (typeof session !== 'string' || !session.trim() || session.length > 512)) throw new Error('session identity is invalid');
  return Object.freeze({ protocol: 2, operation, key_sha256: engineerSha256(options.idempotency_key), repository: resolveGitCommonDirectory(options.repo_root), principal: validateEngineerPrincipal(options.principal),
    session_id: session, policy: policyFor(options), filters, max_selection_attempts: attempts, assertion: selected, observation_ref: observationRef });
}
/** One identity owner for inner ledger and the campaign budget wrapper. Only trusted server code supplies policy/callback. */
export function buildAcquisitionRequestIdentity(options: AcquireNextScheduledEngineerTaskOptions | AcquireSelectedEngineerTaskOptions): AcquisitionRequestV2 {
  if ('assertion' in options) {
    if (!/^sha256:[a-f0-9]{64}$/.test(options.observation_ref)) throw new Error('selected observation_ref is invalid');
    return requestBasis(options,'selected',null,null,closedAssertion(options.assertion),options.observation_ref);
  }
  const { filters, attempts } = validateOptions(options);
  return requestBasis(options,'auto',filters,attempts,null,null);
}

export function acquireNextScheduledEngineerTask(options: AcquireNextScheduledEngineerTaskOptions): AcquireNextScheduledEngineerTaskResult {
  const { attempts, filters } = validateOptions(options), deps = acquisitionDependencies(options);
  const request = requestBasis(options,'auto',filters,attempts,null,null);
  return runAcquisitionTransaction(options,request,deps,() => {
    const observedAt = deps.now();
    const noEligible = Object.freeze({ ok: false as const, error: 'engineer_no_eligible_offer' as const, message: 'no eligible Engineer offer matches the closed filters and current campaign capacity' });
    let result: AcquireNextScheduledEngineerTaskResult = noEligible;
    const fullCandidates = new Set<string>(); let capacityScanLimit: number | undefined;
    for (let index = 0; index < attempts; index += 1) {
      const document = deps.collectOffers({ repo_root: options.repo_root, principal: options.principal, env: options.env, now_ms: observedAt });
      capacityScanLimit ??= document.offers.length;
      const selected = document.offers.find(offer => eligible(offer,filters) && !fullCandidates.has(offer.task_id));
      if (!selected) return noEligible;
      result = deps.acquire({ repo_root: options.repo_root, principal: options.principal, assertion: assertion(selected), session_id: options.session_id, env: options.env, offer_options: { now_ms: observedAt } });
      if (campaignCapacityBlocked(result)) { fullCandidates.add(selected.task_id); result = noEligible; if (fullCandidates.size >= capacityScanLimit) return result; index -= 1; continue; }
      if (!selectionMayBeRetried(result)) break;
    }
    return result;
  });
}
export function acquireSelectedEngineerTask(options: AcquireSelectedEngineerTaskOptions): AcquireNextScheduledEngineerTaskResult {
  if (Object.keys(options).some(key => !['repo_root','principal','idempotency_key','session_id','env','admission_policy','accept_acquired','dependencies','assertion','observation_ref'].includes(key))) throw new Error('selected request contains an unknown field');
  if (!/^sha256:[a-f0-9]{64}$/.test(options.observation_ref)) throw new Error('selected observation_ref is invalid');
  const deps = acquisitionDependencies(options), selected = closedAssertion(options.assertion);
  const request = requestBasis(options,'selected',null,null,selected,options.observation_ref);
  return runAcquisitionTransaction(options,request,deps,observation => {
    const matches = observation!.offers.offers.filter(offer => canonicalEngineerJson(assertion(offer)) === canonicalEngineerJson(selected));
    if (matches.length !== 1) return { ok: false, error: 'engineer_offer_stale', message: 'caller assertion is not one exact offer in the trusted snapshot' };
    return deps.acquire({ repo_root: options.repo_root, principal: options.principal, assertion: selected,
      session_id: options.session_id, env: options.env, offer_options: { now_ms: observation!.observation.observed_at_ms } });
  });
}

/** Evidence only. S2 must check key-ledger state before applying this admission-start TTL. */
export const ENGINEER_OBSERVATION_FRESHNESS_MS = 30_000;
const OBSERVATION_STORE = 'repo-harness/engineer-scheduling/v1/observations';
const OBSERVATION_PRODUCER = 'repo-harness-engineer-observation-v1';

export type EngineerObservationErrorCode = 'engineer_observation_missing' | 'engineer_observation_corrupt'
  | 'engineer_observation_identity_mismatch' | 'engineer_observation_expired' | 'engineer_observation_future'
  | 'engineer_observation_policy_changed' | 'engineer_observation_unsafe_path';
export class EngineerObservationError extends Error {
  constructor(message: string, readonly code: EngineerObservationErrorCode = 'engineer_observation_corrupt') {
    super(message); this.name = 'EngineerObservationError';
  }
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

function invalidObservation(message: string, code: EngineerObservationErrorCode = 'engineer_observation_corrupt'): never {
  throw new EngineerObservationError(message, code);
}
function observationJson(bytes: string): unknown {
  try { return JSON.parse(bytes); } catch { return invalidObservation('observation JSON is corrupt'); }
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
  if (canonicalEngineerJson(current) !== canonicalEngineerJson(options.principal)) invalidObservation('observation principal no longer matches current authenticated Binding', 'engineer_observation_identity_mismatch');
  return current;
}

function observationPolicy(repoRoot: string): string {
  // No default policy or compatibility projection: absent source authority refuses prepare/read.
  const path = join(repoRoot, '.ai/harness/policy.json');
  const bytes = readObservationFile(path);
  observationJson(bytes);
  return engineerSha256(canonicalEngineerJson({ producer: OBSERVATION_PRODUCER,
    freshness_ms: ENGINEER_OBSERVATION_FRESHNESS_MS, policy_sha256: engineerSha256(bytes) }));
}

function readObservationFile(path: string): string {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) invalidObservation('observation source must be a regular non-linked file', 'engineer_observation_unsafe_path');
    return readFileSync(fd, 'utf8');
  } catch (error) {
    if (error instanceof EngineerObservationError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    return invalidObservation(code === 'ENOENT' ? 'observation authority or record is missing' : 'observation store cannot be safely read',
      code === 'ENOENT' ? 'engineer_observation_missing' : code === 'ELOOP' ? 'engineer_observation_unsafe_path' : 'engineer_observation_corrupt');
  } finally { if (fd !== undefined) closeSync(fd); }
}

/** Check each descendant before opening/creating it; reject symlinked store ancestors. */
function guardedSchedulingDirectory(common: string, relative: string, create: boolean): string {
  let path = common;
  for (const part of relative.split('/')) {
    path = join(path, part);
    if (create && !existsSync(path)) {
      try { mkdirSync(path, { mode: 0o700 }); syncDirectoryDurably(dirname(path)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
    let stat;
    try { stat = lstatSync(path); } catch (error) {
      return invalidObservation('observation store directory is missing or unreadable', (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'engineer_observation_missing' : 'engineer_observation_corrupt');
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalidObservation('observation store path is unsafe', 'engineer_observation_unsafe_path');
  }
  return path;
}

function decodeObservation(bytes: string, ref: string): EngineerObservationV1 {
  if (engineerSha256(bytes) !== ref) invalidObservation('observation receipt was modified');
  const value = observationJson(bytes) as Record<string, unknown>;
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidObservation('observation record is invalid');
  assertMessageExactKeys(value, ['protocol', 'kind', 'producer', 'repository_id', 'git_common_directory', 'principal',
    'snapshot_bytes', 'snapshot_sha256', 'observed_at_ms', 'expires_at_ms', 'policy_revision'], 'observation', invalidObservation);
  if (value.protocol !== 1 || value.kind !== 'repo-harness-engineer-observation' || value.producer !== OBSERVATION_PRODUCER
    || canonicalEngineerJson(value) !== bytes) invalidObservation('observation schema or canonical bytes are invalid');
  let principal: EngineerPrincipalV1;
  try { principal = validateEngineerPrincipal(value.principal); } catch { return invalidObservation('observation principal metadata is corrupt'); }
  if (typeof value.snapshot_bytes !== 'string' || engineerSha256(value.snapshot_bytes) !== value.snapshot_sha256) invalidObservation('observation snapshot digest is invalid');
  let offers: EngineerOffersV1;
  try { offers = validateEngineerOffersDocument(observationJson(value.snapshot_bytes)); } catch { return invalidObservation('observation offers snapshot is corrupt'); }
  if (canonicalEngineerJson(offers) !== value.snapshot_bytes || offers.repository_id !== value.repository_id
    || offers.repository_id !== principal.repository_id || offers.engineer_id !== principal.engineer_id
    || offers.offers.some(offer => offer.binding_id !== principal.binding_id || offer.binding_generation !== principal.binding_generation
      || offer.engineer_contract_revision !== principal.engineer_contract_revision)) invalidObservation('observation snapshot ownership is invalid', 'engineer_observation_identity_mismatch');
  if (!Number.isSafeInteger(value.observed_at_ms) || (value.observed_at_ms as number) < 0
    || !Number.isSafeInteger(value.expires_at_ms)
    || value.expires_at_ms !== (value.observed_at_ms as number) + ENGINEER_OBSERVATION_FRESHNESS_MS) invalidObservation('observation time bounds are invalid');
  return Object.freeze({ ...value, principal }) as unknown as EngineerObservationV1;
}

export function prepareEngineerObservation(options: EngineerObservationOptions): PreparedEngineerObservation {
  const principal = observationPrincipal(options);
  const common = resolveGitCommonDirectory(options.repo_root);
  const policyRevision = observationPolicy(options.repo_root);
  const observedAt = observationClock(options);
  const offers = validateEngineerOffersDocument((options.dependencies?.collectOffers ?? collectEngineerOffers)({
    repo_root: options.repo_root, principal, env: options.env, now_ms: observedAt,
  }));
  if (observationPolicy(options.repo_root) !== policyRevision) invalidObservation('observation policy changed during prepare', 'engineer_observation_policy_changed');
  observationPrincipal(options);
  const snapshotBytes = canonicalEngineerJson(offers);
  const observation: EngineerObservationV1 = Object.freeze({ protocol: 1, kind: 'repo-harness-engineer-observation',
    producer: OBSERVATION_PRODUCER, repository_id: principal.repository_id, git_common_directory: common, principal,
    snapshot_bytes: snapshotBytes, snapshot_sha256: engineerSha256(snapshotBytes), observed_at_ms: observedAt,
    expires_at_ms: observedAt + ENGINEER_OBSERVATION_FRESHNESS_MS, policy_revision: policyRevision });
  const bytes = canonicalEngineerJson(observation);
  const ref = engineerSha256(bytes);
  decodeObservation(bytes, ref);
  const directory = guardedSchedulingDirectory(common, OBSERVATION_STORE, true);
  return withExclusiveDirectoryLock(common, `${OBSERVATION_STORE}/${ref.slice(7)}.lock`, () => {
    guardedSchedulingDirectory(common, OBSERVATION_STORE, false);
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
  const directory = guardedSchedulingDirectory(common, OBSERVATION_STORE, false);
  const observation = decodeObservation(readObservationFile(join(directory, `${options.observation_ref.slice(7)}.json`)), options.observation_ref);
  if (observation.git_common_directory !== common || observation.repository_id !== principal.repository_id
    || canonicalEngineerJson(observation.principal) !== canonicalEngineerJson(principal)) invalidObservation('observation belongs to another repository or principal/Binding', 'engineer_observation_identity_mismatch');
  if (observation.policy_revision !== observationPolicy(options.repo_root)) invalidObservation('observation policy revision changed', 'engineer_observation_policy_changed');
  const now = observationClock(options);
  if (now < observation.observed_at_ms) invalidObservation('observation is in the future or the server clock rolled back', 'engineer_observation_future');
  if (now >= observation.expires_at_ms) invalidObservation('observation expired for a new admission start', 'engineer_observation_expired');
  return Object.freeze({ observation_ref: options.observation_ref, observation,
    offers: validateEngineerOffersDocument(JSON.parse(observation.snapshot_bytes)) });
}
