import { createHash } from 'crypto';

import {
  EngineerSchedulingError,
  validateEngineerOffer,
  type EngineerOfferV1,
} from '../../core/engineers/scheduling';
import type {
  ClaimActorReceiptV1,
  EngineerPrincipalV1,
} from '../../core/engineers/principal-claim';
import type { WorkEnvelopeV1 } from '../fleet/acquire';
import { resolveGitCommonDirectory } from '../git/common-directory';
import {
  ExclusiveLockContentionError,
  withExclusiveDirectoryLock,
} from '../locking/exclusive-directory-lock';
import {
  acquireEngineerTask,
  type EngineerAcquireOptions,
  type EngineerAcquireResult,
} from './acquire';
import {
  collectEngineerOffers,
  type CollectEngineerOffersOptions,
} from './scheduling';

export interface ScheduledEngineerAcquireAssertionV1 {
  readonly offer_revision: string;
  readonly work_package_id: string;
  readonly work_package_revision: string;
  readonly work_graph_revision: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly dependency_revision: string;
  readonly concurrency_revision: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
  readonly fleet_offer_revision: string;
  readonly authorization_revision: number;
}

export type ScheduledEngineerAcquireResult =
  | {
      readonly ok: true;
      readonly offer: EngineerOfferV1;
      readonly envelope: WorkEnvelopeV1;
      readonly receipt: ClaimActorReceiptV1;
    }
  | {
      readonly ok: false;
      readonly error:
        | 'engineer_offer_stale'
        | 'engineer_concurrency_unavailable'
        | 'fleet_acquire_failed'
        | 'claim_actor_receipt_failed'
        | 'rollback_failed';
      readonly message: string;
      readonly fleet?: EngineerAcquireResult;
    };

export interface ScheduledEngineerAcquireDependencies {
  readonly collectOffers: typeof collectEngineerOffers;
  readonly acquire: typeof acquireEngineerTask;
  readonly withConcurrencyLock: <T>(repoRoot: string, concurrencyKey: string, run: () => T) => T;
}

export interface ScheduledEngineerAcquireOptions {
  readonly repo_root: string;
  readonly principal: EngineerPrincipalV1;
  readonly assertion: ScheduledEngineerAcquireAssertionV1;
  readonly session_id?: string | null;
  readonly max_attempts?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly offer_options?: Omit<CollectEngineerOffersOptions, 'repo_root' | 'principal' | 'env'>;
  readonly acquire_options?: Pick<EngineerAcquireOptions, 'now'>;
  readonly dependencies?: Partial<ScheduledEngineerAcquireDependencies>;
}

function concurrencyLock<T>(repoRoot: string, concurrencyKey: string, run: () => T): T {
  const key = createHash('sha256').update(concurrencyKey, 'utf8').digest('hex');
  return withExclusiveDirectoryLock(
    resolveGitCommonDirectory(repoRoot),
    `repo-harness/engineer-scheduling/v1/concurrency/${key}.lock`,
    run,
    { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true },
  );
}

export function delegateScheduledEngineerAcquire(options: EngineerAcquireOptions): EngineerAcquireResult {
  return acquireEngineerTask(options);
}

function dependencies(overrides: Partial<ScheduledEngineerAcquireDependencies> = {}): ScheduledEngineerAcquireDependencies {
  return {
    collectOffers: collectEngineerOffers,
    acquire: delegateScheduledEngineerAcquire,
    withConcurrencyLock: concurrencyLock,
    ...overrides,
  };
}

function stale(message: string): ScheduledEngineerAcquireResult {
  return Object.freeze({ ok: false, error: 'engineer_offer_stale', message });
}

function matchesAssertion(offer: EngineerOfferV1, assertion: ScheduledEngineerAcquireAssertionV1): boolean {
  return offer.offer_revision === assertion.offer_revision
    && offer.work_package_id === assertion.work_package_id
    && offer.work_package_revision === assertion.work_package_revision
    && offer.work_graph_revision === assertion.work_graph_revision
    && offer.task_id === assertion.task_id
    && offer.task_revision === assertion.task_revision
    && offer.dependency_revision === assertion.dependency_revision
    && offer.concurrency_revision === assertion.concurrency_revision
    && offer.binding_id === assertion.binding_id
    && offer.binding_generation === assertion.binding_generation
    && offer.engineer_contract_revision === assertion.engineer_contract_revision
    && offer.fleet_offer_revision === assertion.fleet_offer_revision
    && offer.authorization_revision === assertion.authorization_revision;
}

function selectCurrentOffer(options: ScheduledEngineerAcquireOptions, deps: ScheduledEngineerAcquireDependencies): EngineerOfferV1 | null {
  const document = deps.collectOffers({
    repo_root: options.repo_root,
    principal: options.principal,
    env: options.env,
    ...options.offer_options,
  });
  const offer = document.offers.find((candidate) => candidate.work_package_id === options.assertion.work_package_id) ?? null;
  if (!offer || !matchesAssertion(offer, options.assertion)) return null;
  return validateEngineerOffer(offer);
}

export function acquireScheduledEngineerTask(options: ScheduledEngineerAcquireOptions): ScheduledEngineerAcquireResult {
  const deps = dependencies(options.dependencies);
  const observed = selectCurrentOffer(options, deps);
  if (!observed) return stale('asserted Engineer offer is not current');

  try {
    return deps.withConcurrencyLock(options.repo_root, `${observed.repository_id}:${observed.concurrency_key}`, () => {
      const current = selectCurrentOffer(options, deps);
      if (!current) return stale('Engineer offer changed before Fleet mutation');
      const acquired = deps.acquire({
        repo_root: options.repo_root,
        principal: options.principal,
        assertion: {
          repo_id: current.repository_id,
          task_id: current.task_id,
          offer_revision: current.fleet_offer_revision,
          authorization_revision: current.authorization_revision,
        },
        session_id: options.session_id,
        max_attempts: options.max_attempts,
        env: options.env,
        now: options.acquire_options?.now,
      });
      if (!acquired.ok) return Object.freeze({
        ok: false,
        error: acquired.error,
        message: acquired.message,
        fleet: acquired,
      });
      return Object.freeze({
        ok: true,
        offer: current,
        envelope: acquired.envelope,
        receipt: acquired.receipt,
      });
    });
  } catch (error) {
    if (error instanceof ExclusiveLockContentionError) {
      return Object.freeze({
        ok: false,
        error: 'engineer_concurrency_unavailable',
        message: error.message,
      });
    }
    if (error instanceof EngineerSchedulingError && error.code === 'engineer_offer_stale') return stale(error.message);
    throw error;
  }
}
