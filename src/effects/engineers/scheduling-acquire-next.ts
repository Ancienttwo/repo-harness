import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { EngineerOfferV1 } from '../../core/engineers/scheduling';
import type { EngineerPrincipalV1 } from '../../core/engineers/principal-claim';
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
}

export interface AcquireNextScheduledEngineerTaskOptions {
  readonly repo_root: string;
  readonly principal: EngineerPrincipalV1;
  readonly idempotency_key: string;
  readonly filters?: AcquireNextFiltersV1;
  readonly max_selection_attempts?: number;
  readonly session_id?: string | null;
  readonly env?: NodeJS.ProcessEnv;
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
  return { attempts, filters: Object.freeze({ ...filters }) };
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
    && (filters.minimum_priority === undefined || offer.priority >= filters.minimum_priority);
}

function selectionMayBeRetried(result: AcquireNextScheduledEngineerTaskResult): boolean {
  return !result.ok && (result.error === 'engineer_offer_stale'
    || (result.error === 'fleet_acquire_failed'
      && result.fleet?.ok === false
      && result.fleet.error === 'fleet_acquire_failed'
      && result.fleet.fleet?.ok === false
      && (result.fleet.fleet.error === 'offer_stale' || result.fleet.fleet.error === 'claim_failed')));
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
    let result: AcquireNextScheduledEngineerTaskResult = Object.freeze({ ok: false, error: 'engineer_no_eligible_offer', message: 'no eligible Engineer offer matches the closed filters' });
    for (let index = 0; index < attempts; index += 1) {
      const document = deps.collectOffers({ repo_root: options.repo_root, principal: options.principal, env: options.env });
      const selected = document.offers.find((offer) => eligible(offer, filters));
      if (!selected) {
        unlinkSync(path);
        return result;
      }
      result = deps.acquire({ repo_root: options.repo_root, principal: options.principal, assertion: assertion(selected), session_id: options.session_id, env: options.env });
      if (!selectionMayBeRetried(result)) break;
    }
    writeReceipt(path, buildReceipt(requestSha256, 'completed', result));
    return result;
  });
}
