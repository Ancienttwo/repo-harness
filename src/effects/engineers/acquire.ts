import { canonicalMessageBytes } from '../../core/messages/mechanics';
import {
  buildClaimActorReceipt,
  type ClaimActorReceiptV1,
  type EngineerPrincipalV1,
} from '../../core/engineers/principal-claim';
import { realpathSync } from 'fs';
import type { CommandOutcome } from '../../core/state/command-outcome';
import {
  acquireFleetTask,
  resumeReclaimedFleetWork,
  type FleetAcquireAssertionV1,
  type FleetAcquireOptions,
  type FleetAcquireResult,
  type WorkEnvelopeV1,
} from '../fleet/acquire';
import { readRepoHarnessRegistrySnapshot, type RepoHarnessRegistrySnapshot } from '../repo-registry';
import { readLease, type LeaseRead } from '../state/coordination-lease-store';
import { processSprintDependencies, releaseSprintCommand } from '../state/coordination-sprint';
import {
  listLiveClaimActorReceiptsForEngineer,
  readClaimActorReceipt,
  publishClaimActorReceipt,
  validateClaimActorReceiptLive,
} from './claim-actor-store';
import { readEngineerBindingStatus, withEngineerBindingLock } from './binding-store';
import { loadEngineerProfile } from './profile-store';

export type EngineerAcquireFailureCode = 'fleet_acquire_failed' | 'claim_actor_receipt_failed' | 'rollback_failed';

export type EngineerAcquireResult =
  | { readonly ok: true; readonly envelope: WorkEnvelopeV1; readonly receipt: ClaimActorReceiptV1 }
  | {
      readonly ok: false;
      readonly error: EngineerAcquireFailureCode;
      readonly message: string;
      readonly fleet?: Exclude<FleetAcquireResult, { readonly ok: true }>;
      readonly residual_worktree?: string;
    };

export interface EngineerAcquireDependencies {
  readonly acquire: (options: FleetAcquireOptions) => FleetAcquireResult;
  readonly publish: typeof publishClaimActorReceipt;
  readonly validateLive: typeof validateClaimActorReceiptLive;
  readonly readLease: (cwd: string, taskId: string) => LeaseRead;
  readonly readRegistry: (options?: { readonly env?: NodeJS.ProcessEnv; readonly adoptedOnly?: boolean }) => RepoHarnessRegistrySnapshot;
  readonly release: (repoRoot: string, claimId: string) => CommandOutcome;
  readonly readBinding: typeof readEngineerBindingStatus;
  readonly withBindingLock: typeof withEngineerBindingLock;
  readonly loadProfile: typeof loadEngineerProfile;
  readonly listLiveClaims: typeof listLiveClaimActorReceiptsForEngineer;
}

export interface EngineerAcquireOptions {
  readonly repo_root: string;
  readonly principal: EngineerPrincipalV1;
  readonly assertion?: FleetAcquireAssertionV1;
  readonly session_id?: string | null;
  readonly now?: () => Date;
  readonly env?: NodeJS.ProcessEnv;
  readonly dependencies?: Partial<EngineerAcquireDependencies>;
}

function dependencies(overrides: Partial<EngineerAcquireDependencies> = {}): EngineerAcquireDependencies {
  return {
    acquire: acquireFleetTask,
    publish: publishClaimActorReceipt,
    validateLive: validateClaimActorReceiptLive,
    readLease,
    readRegistry: readRepoHarnessRegistrySnapshot,
    release: (repoRoot, claimId) => releaseSprintCommand({ claimId }, processSprintDependencies(repoRoot)),
    readBinding: readEngineerBindingStatus,
    withBindingLock: withEngineerBindingLock,
    loadProfile: loadEngineerProfile,
    listLiveClaims: listLiveClaimActorReceiptsForEngineer,
    ...overrides,
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Enforce the Profile limit under the Binding lock. Offer checks run under a
 * per-concurrency-key lock, so acquisitions on different keys reach this lock
 * after their own offer check and must recount every live Claim here.
 */
function activeClaimCapacityRefusal(options: EngineerAcquireOptions, deps: EngineerAcquireDependencies): string | null {
  try {
    const profile = deps.loadProfile(options.repo_root, options.principal.engineer_id);
    if (profile.engineer_contract_revision !== options.principal.engineer_contract_revision) {
      return 'authenticated Engineer Profile is not current';
    }
    const live = deps.listLiveClaims(options.repo_root, options.principal.engineer_id, deps.readLease).length;
    return live >= profile.profile.max_active_claims
      ? `Engineer active Claim limit is reached (${live} of ${profile.profile.max_active_claims})`
      : null;
  } catch (error) {
    return `Engineer active Claim capacity cannot be verified: ${message(error)}`;
  }
}

function acquireEngineerTaskLocked(options: EngineerAcquireOptions, deps: EngineerAcquireDependencies): EngineerAcquireResult {
  const binding = deps.readBinding(
    options.repo_root,
    options.principal.engineer_id,
    options.principal.engineer_contract_revision,
  );
  if (binding.current.state !== 'active'
    || binding.current.current_binding_id !== options.principal.binding_id
    || binding.current.binding_generation !== options.principal.binding_generation
    || binding.current.engineer_contract_revision !== options.principal.engineer_contract_revision) {
    return Object.freeze({
      ok: false,
      error: 'fleet_acquire_failed',
      message: 'authenticated Engineer Binding is not current',
    });
  }
  try {
    const initialRegistry = deps.readRegistry({ env: options.env, adoptedOnly: true });
    const initialRepo = initialRegistry.repos.find((entry) => entry.id === options.principal.repository_id && entry.accessMode === 'read_write');
    if (!initialRepo || realpathSync(initialRepo.path) !== realpathSync(options.repo_root)) {
      return Object.freeze({
        ok: false,
        error: 'fleet_acquire_failed',
        message: 'authenticated Engineer repository is not the current registered read_write target',
      });
    }
  } catch (error) {
    return Object.freeze({
      ok: false,
      error: 'fleet_acquire_failed',
      message: `authenticated Engineer repository cannot be verified: ${message(error)}`,
    });
  }
  const capacityRefusal = activeClaimCapacityRefusal(options, deps);
  if (capacityRefusal !== null) return Object.freeze({ ok: false, error: 'fleet_acquire_failed', message: capacityRefusal });
  const fleet = deps.acquire({
    repo_id: options.principal.repository_id,
    assertion: options.assertion,
    session_id: `engineer:${options.principal.binding_id}`,
    env: options.env,
  });
  if (!fleet.ok) return Object.freeze({ ok: false, error: 'fleet_acquire_failed', message: fleet.message, fleet });

  const envelope = fleet.envelope;
  let repo: RepoHarnessRegistrySnapshot['repos'][number] | undefined;
  try {
    const registry = deps.readRegistry({ env: options.env, adoptedOnly: true });
    repo = registry.repos.find((entry) => entry.id === envelope.repo_id && entry.accessMode === 'read_write');
    if (!repo) throw new Error('acquired repository is no longer registered read_write');
    const receipt = buildClaimActorReceipt({
      envelope,
      principal: options.principal,
      session_id: options.session_id ?? null,
      bound_at: (options.now ?? (() => new Date()))().toISOString(),
    });
    const published = deps.publish(repo.path, receipt);
    deps.validateLive(repo.path, published, envelope, deps.readLease);
    return Object.freeze({ ok: true, envelope, receipt: published });
  } catch (error) {
    if (!repo) return Object.freeze({ ok: false, error: 'rollback_failed', message: `${message(error)}; acquired repository is unavailable for own-claim release`, residual_worktree: envelope.worktree_path });
    let live: LeaseRead['record'];
    try {
      const readback = deps.readLease(repo.path, envelope.task_id);
      if (readback.classification === 'unknown') throw new Error('own Lease state is unknown');
      live = readback.record;
    } catch (readError) {
      return Object.freeze({ ok: false, error: 'rollback_failed', message: `${message(error)}; own-claim readback failed: ${message(readError)}`, residual_worktree: envelope.worktree_path });
    }
    if (!live || live.claim_id !== envelope.claim_id || live.generation !== envelope.generation) {
      return Object.freeze({ ok: false, error: 'claim_actor_receipt_failed', message: `${message(error)}; own Claim is no longer current and no foreign Claim was released`, residual_worktree: envelope.worktree_path });
    }
    let released: CommandOutcome;
    try {
      released = deps.release(repo.path, envelope.claim_id);
    } catch (releaseError) {
      return Object.freeze({ ok: false, error: 'rollback_failed', message: `${message(error)}; own-claim release threw: ${message(releaseError)}`, residual_worktree: envelope.worktree_path });
    }
    if (released.exitCode !== 0) {
      return Object.freeze({ ok: false, error: 'rollback_failed', message: `${message(error)}; own-claim release failed: ${released.stderr || released.stdout}`, residual_worktree: envelope.worktree_path });
    }
    return Object.freeze({ ok: false, error: 'claim_actor_receipt_failed', message: message(error), residual_worktree: envelope.worktree_path });
  }
}

export function acquireEngineerTask(options: EngineerAcquireOptions): EngineerAcquireResult {
  const deps = dependencies(options.dependencies);
  return deps.withBindingLock(
    options.repo_root,
    options.principal.engineer_id,
    () => acquireEngineerTaskLocked(options, deps),
  );
}

/** Retain the authenticated Binding while publishing the new generation's actor receipt. */
export function resumeReclaimedEngineerTask(input: {
  repo_root: string; principal: EngineerPrincipalV1; previous: WorkEnvelopeV1;
  previous_receipt: ClaimActorReceiptV1; claim_id: string;
  receipt: import('../../core/state/lease-liveness').LeaseReclaimEligibilityReceiptV1;
  session_id: string; bound_at: string; env?: NodeJS.ProcessEnv;
  crash_hook?: (boundary: 'after_bind' | 'after_token' | 'after_actor') => void;
}) {
  return withEngineerBindingLock(input.repo_root, input.principal.engineer_id, () => {
    const binding = readEngineerBindingStatus(input.repo_root, input.principal.engineer_id, input.principal.engineer_contract_revision);
    if (binding.current.state !== 'active' || binding.current.current_binding_id !== input.principal.binding_id
      || binding.current.binding_generation !== input.principal.binding_generation
      || input.previous_receipt.engineer_id !== input.principal.engineer_id || input.previous_receipt.binding_id !== input.principal.binding_id
      || input.previous_receipt.binding_generation !== input.principal.binding_generation) throw new Error('reclaimed Engineer Binding differs');
    const original = readClaimActorReceipt(input.repo_root, input.previous.task_id, input.previous.claim_id);
    if (!original || canonicalMessageBytes({ receipt: original }) !== canonicalMessageBytes({ receipt: input.previous_receipt })) throw new Error('original ClaimActor receipt differs');
    const envelope = resumeReclaimedFleetWork(input);
    const receipt = buildClaimActorReceipt({ envelope, principal: input.principal, session_id: input.session_id, bound_at: input.bound_at });
    const existing = readClaimActorReceipt(input.repo_root, envelope.task_id, envelope.claim_id);
    if (existing && canonicalMessageBytes({ receipt: existing }) !== canonicalMessageBytes({ receipt })) throw new Error('reclaimed ClaimActor receipt differs');
    const published = publishClaimActorReceipt(input.repo_root, receipt);
    input.crash_hook?.('after_actor');
    validateClaimActorReceiptLive(input.repo_root, published, envelope);
    return Object.freeze({ envelope, receipt: published });
  });
}
