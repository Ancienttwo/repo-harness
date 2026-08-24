import {
  buildClaimActorReceipt,
  type ClaimActorReceiptV1,
  type EngineerPrincipalV1,
} from '../../core/engineers/principal-claim';
import { realpathSync } from 'fs';
import type { CommandOutcome } from '../../core/state/command-outcome';
import {
  acquireFleetTask,
  type FleetAcquireAssertionV1,
  type FleetAcquireOptions,
  type FleetAcquireResult,
  type WorkEnvelopeV1,
} from '../fleet/acquire';
import { readRepoHarnessRegistrySnapshot, type RepoHarnessRegistrySnapshot } from '../repo-registry';
import { readLease, type LeaseRead } from '../state/coordination-lease-store';
import { processSprintDependencies, releaseSprintCommand } from '../state/coordination-sprint';
import { publishClaimActorReceipt, validateClaimActorReceiptLive } from './claim-actor-store';

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
}

export interface EngineerAcquireOptions {
  readonly repo_root: string;
  readonly principal: EngineerPrincipalV1;
  readonly assertion?: FleetAcquireAssertionV1;
  readonly session_id?: string | null;
  readonly max_attempts?: number;
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
    ...overrides,
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function acquireEngineerTask(options: EngineerAcquireOptions): EngineerAcquireResult {
  const deps = dependencies(options.dependencies);
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
  const fleet = deps.acquire({
    repo_id: options.principal.repository_id,
    assertion: options.assertion,
    session_id: `engineer:${options.principal.binding_id}`,
    max_attempts: options.max_attempts,
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
      live = deps.readLease(repo.path, envelope.task_id).record;
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
