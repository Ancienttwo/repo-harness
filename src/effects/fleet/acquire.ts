/**
 * Read-side fleet offers and the acquisition seam.
 *
 * The first half of this module is deliberately only a projection: registry,
 * canonical board, and plan/contract proof are read and joined into the
 * immutable FleetOffersV1 document.  The mutation half (claim -> provision ->
 * bind -> token/envelope) is kept below this boundary so callers cannot turn
 * an offer into authority without re-reading the owning stores.
 */

import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { join } from 'path';
import {
  lookupCanonicalTask,
  PENDING_ROW_STATUS,
  type LeaseOwnerRecord,
} from '../../core/state/coordination-identity';
import type { BoardDocumentV1 } from '../../core/state/types';
import {
  classifyTaskOffer,
  FLEET_OFFERS_KIND,
  FLEET_OFFERS_PROTOCOL,
  freezeTaskOffer,
  selectExecutionReadyOffer,
  TASK_OFFER_KIND,
  TASK_OFFER_PROTOCOL,
  taskOfferRevision,
  type ClassifyTaskOfferInput,
  type FleetOffersV1,
  type TaskOfferBlockerV1,
  type TaskOfferPlanProofV1,
  type TaskOfferSnapshotConsistency,
  type TaskOfferV1,
} from '../../core/fleet/task-offer';
import {
  bindSprintCommand,
  claimSprintCommand,
  processSprintDependencies,
  releaseSprintCommand,
  type SprintCommandDependencies,
} from '../state/coordination-sprint';
import type { CommandOutcome } from '../../core/state/command-outcome';
import { readWorktreeTopology, type WorktreeTopology } from '../git/worktree-topology';
import {
  readRepoHarnessRegistrySnapshot,
  type RepoHarnessRegisteredRepo,
  type RepoHarnessRegistrySnapshot,
} from '../repo-registry';
import {
  readActiveSprintPath,
  readCanonicalTargetRef,
} from '../state/collect-board-inputs';
import {
  readCanonicalSprint,
  readCanonicalTaskPlanProof,
  resolveRepoIdentity,
  type CanonicalTaskPlanProof,
  type CanonicalTaskPlanProofResult,
  type CanonicalSprintRead,
} from '../state/coordination-canonical-source';
import {
  writeClaimTokenForBoundLease,
  type ClaimTokenV1,
  type ClaimTokenWriteInput,
} from '../state/coordination-claim-token';
import { readLease, type LeaseRead } from '../state/coordination-lease-store';
import { resolveBoard } from '../state/resolve-board';
import { campaignTaskPlanProof } from '../automation/campaign-planning-proof';

type TaskOfferPlanFailure = NonNullable<ClassifyTaskOfferInput['plan_failure']>;

export type FleetOffersErrorCode = 'repo_unavailable' | 'canonical_unavailable';

export class FleetOffersError extends Error {
  readonly code: FleetOffersErrorCode;
  readonly repo_id: string;

  constructor(code: FleetOffersErrorCode, repo: RepoHarnessRegisteredRepo, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`${code} for ${repo.id} (${repo.path}): ${detail}`);
    this.name = 'FleetOffersError';
    this.code = code;
    this.repo_id = repo.id;
  }
}

export interface FleetOffersOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly repo_id?: string;
  readonly now_ms?: number;
  /** Injectable for deterministic effect tests; production reads one file. */
  readonly registry_snapshot?: RepoHarnessRegistrySnapshot;
  /** Injectable board projection; it must remain a read-only resolver. */
  readonly board_reader?: typeof resolveBoard;
  /** Injectable exact plan proof; it must not infer from filename or Plan cell. */
  readonly plan_reader?: typeof readCanonicalTaskPlanProof;
}

export interface RepoTaskOffers {
  readonly repo: RepoHarnessRegisteredRepo;
  readonly sprint_path: string;
  readonly offers: readonly TaskOfferV1[];
  readonly snapshot_consistency: TaskOfferSnapshotConsistency;
}

function planFailureCode(result: CanonicalTaskPlanProofResult): TaskOfferPlanFailure | undefined {
  if (result.ok) return undefined;
  switch (result.code) {
    case 'plan_missing': return 'missing';
    case 'plan_ambiguous': return 'ambiguous';
    case 'plan_not_approved': return 'not_approved';
    case 'plan_source_mismatch': return 'source_mismatch';
    case 'plan_not_projectable': return 'not_projectable';
    case 'contract_missing': return 'contract_missing';
    case 'contract_not_projectable': return 'contract_not_projectable';
  }
}

function planProof(proof: CanonicalTaskPlanProof | null): TaskOfferPlanProofV1 | null {
  if (proof === null) return null;
  return Object.freeze({
    plan_path: proof.plan_path,
    contract_path: proof.contract_path,
    source_ref: proof.source_ref,
    plan_sha256: proof.plan_sha256,
    contract_sha256: proof.contract_sha256,
  });
}

function rowOrder(rowIndex: string, fallback: number): number {
  const parsed = Number.parseInt(rowIndex, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function blockerRevision(blockers: readonly TaskOfferBlockerV1[]): string {
  return blockers.map((entry) => `${entry.code}:${entry.attention_owner}`).join(',');
}

function buildTaskOffer(
  repo: RepoHarnessRegisteredRepo,
  registry: RepoHarnessRegistrySnapshot,
  board: BoardDocumentV1,
  card: BoardDocumentV1['cards'][number],
  cardIndex: number,
  proofResult: CanonicalTaskPlanProofResult | null,
): TaskOfferV1 {
  const proof = proofResult?.ok === true ? planProof(proofResult.proof) : null;
  const classification = classifyTaskOffer({
    repo_access_mode: repo.accessMode,
    // Board's task_state is a projection of the canonical status cell.  The
    // classifier only needs the pending/non-pending boundary; no second row
    // parser is introduced here.
    row_status: card.task_state === 'pending' ? '[ ]' : card.task_state === 'done' ? '[x]' : '[~]',
    mode: card.mode,
    lease_state: card.lease_state,
    snapshot_consistency: board.snapshot_consistency,
    plan: proof,
    plan_failure: planFailureCode(proofResult ?? { ok: false, code: 'plan_missing', error: '', candidates: [] }),
    canonical_available: Boolean(board.canonical_target.oid),
  });
  const row = rowOrder(card.row_index, cardIndex + 1);
  const offerRevision = taskOfferRevision([
    repo.id,
    card.task_id,
    card.task_revision,
    board.sprint_path,
    row,
    classification.execution_readiness,
    board.snapshot_consistency,
    blockerRevision(classification.blockers),
    board.canonical_target.ref,
    board.canonical_target.oid,
    proof?.plan_sha256 ?? null,
    proof?.contract_sha256 ?? null,
    registry.authorizationRevision,
  ]);
  return freezeTaskOffer({
    protocol: TASK_OFFER_PROTOCOL,
    kind: TASK_OFFER_KIND,
    repo_id: repo.id,
    task_id: card.task_id,
    task_revision: card.task_revision,
    sprint_path: board.sprint_path,
    row_order: row,
    execution_readiness: classification.execution_readiness,
    snapshot_consistency: board.snapshot_consistency,
    blockers: classification.blockers,
    offer_revision: offerRevision,
    authorization_revision: registry.authorizationRevision,
    canonical_target: board.canonical_target,
    plan: proof,
  });
}

/**
 * Collect one registered repository in canonical row order.  The board is
 * the status/lease authority; this function intentionally does not inspect a
 * Plan cell or derive a plan from a filename.
 */
export function collectRepoTaskOffers(
  repo: RepoHarnessRegisteredRepo,
  registry: RepoHarnessRegistrySnapshot,
  options: Pick<FleetOffersOptions, 'env' | 'now_ms' | 'board_reader' | 'plan_reader'> = {},
): RepoTaskOffers | null {
  const sprintPath = readActiveSprintPath(repo.path);
  if (sprintPath === null) return null;
  const targetRef = readCanonicalTargetRef(repo.path);
  let board: BoardDocumentV1;
  try {
    board = (options.board_reader ?? resolveBoard)(repo.path, {
      sprintPath,
      targetRef,
      nowMs: options.now_ms ?? Date.now(),
    });
  } catch (error) {
    throw new FleetOffersError('canonical_unavailable', repo, error);
  }

  const planReader = options.plan_reader ?? readCanonicalTaskPlanProof;
  const offers = board.cards.map((card, index) => {
    let proofResult: CanonicalTaskPlanProofResult | null = null;
    if (card.mode.trim().toLowerCase() === 'contract') {
      proofResult = planReader(repo.path, {
        sprintPath: board.sprint_path,
        taskCell: card.task,
      });
    }
    if (proofResult?.ok) proofResult = campaignTaskPlanProof(repo.path, card.task_id, card.task_revision, proofResult, options.env, targetRef);
    return buildTaskOffer(repo, registry, board, card, index, proofResult);
  });
  return Object.freeze({
    repo: Object.freeze({ ...repo }),
    sprint_path: board.sprint_path,
    offers: Object.freeze(offers),
    snapshot_consistency: board.snapshot_consistency,
  });
}

function offerSort(left: TaskOfferV1, right: TaskOfferV1): number {
  const repo = left.repo_id.localeCompare(right.repo_id);
  if (repo !== 0) return repo;
  if (left.sprint_path !== right.sprint_path) return left.sprint_path.localeCompare(right.sprint_path);
  if (left.row_order !== right.row_order) return left.row_order - right.row_order;
  return left.task_id.localeCompare(right.task_id);
}

/** Collect all registered, adopted repositories into one deterministic view. */
export function collectFleetOffers(options: FleetOffersOptions = {}): FleetOffersV1 {
  const registry = options.registry_snapshot ?? readRepoHarnessRegistrySnapshot({
    env: options.env,
    adoptedOnly: true,
  });
  const repos = registry.repos
    .filter((repo) => options.repo_id === undefined || repo.id === options.repo_id)
    .sort((left, right) => left.id.localeCompare(right.id) || left.path.localeCompare(right.path));
  const byRepo = repos.flatMap((repo) => {
    try {
      const result = collectRepoTaskOffers(repo, registry, options);
      return result === null ? [] : [...result.offers];
    } catch (error) {
      if (error instanceof FleetOffersError) throw error;
      throw new FleetOffersError('repo_unavailable', repo, error);
    }
  });
  const offers = byRepo.sort(offerSort);
  const snapshotConsistency: TaskOfferSnapshotConsistency = offers.some(
    (offer) => offer.snapshot_consistency === 'changed_during_read',
  ) ? 'changed_during_read' : 'stable';
  const offerRevision = taskOfferRevision([
    registry.authorizationRevision,
    snapshotConsistency,
    ...offers.flatMap((offer) => [offer.repo_id, offer.task_id, offer.offer_revision]),
  ]);
  return Object.freeze({
    protocol: FLEET_OFFERS_PROTOCOL,
    kind: FLEET_OFFERS_KIND,
    authorization_revision: registry.authorizationRevision,
    snapshot_consistency: snapshotConsistency,
    offer_revision: offerRevision,
    offers: Object.freeze(offers),
  });
}

/** Public effect spelling used by CLI/MCP adapters. */
export const resolveFleetOffers = collectFleetOffers;

/** The only machine-readable result accepted from `contract-worktree start --json`. */
export interface ContractWorktreeStartV1 {
  readonly protocol: 1;
  readonly kind: 'repo-harness-contract-worktree-start';
  readonly worktree_path: string;
  readonly branch: string;
  readonly plan_path: string;
  /** Acquisition only accepts a newly created execution authority. */
  readonly disposition: 'created';
}

export const WORK_ENVELOPE_PROTOCOL = 1 as const;
export const WORK_ENVELOPE_KIND = 'repo-harness-work-envelope' as const;

/**
 * A returned envelope is a capability snapshot, not a second lease authority.
 * Every field is re-read from or fenced by the owning authority before it is
 * returned, so callers never receive an envelope for a merely-reserving lease.
 */
export interface WorkEnvelopeV1 {
  readonly protocol: typeof WORK_ENVELOPE_PROTOCOL;
  readonly kind: typeof WORK_ENVELOPE_KIND;
  readonly repo_id: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly sprint_path: string;
  readonly claim_id: string;
  readonly generation: number;
  readonly worktree_path: string;
  readonly branch: string;
  readonly unit_ref: string;
  readonly authorization_revision: number;
  readonly offer_revision: string;
  readonly canonical_target: NonNullable<TaskOfferV1['canonical_target']>;
  readonly plan: NonNullable<TaskOfferV1['plan']>;
  readonly claim_token: ClaimTokenV1;
}

export type FleetAcquireErrorCode =
  | 'authorization_stale'
  | 'offer_stale'
  | 'no_eligible_task'
  | 'claim_failed'
  | 'provision_failed'
  | 'topology_failed'
  | 'bind_failed'
  | 'token_failed'
  | 'projection_failed'
  | 'final_verify_failed'
  | 'rollback_failed';

export interface FleetAcquireFailure {
  readonly ok: false;
  readonly error: FleetAcquireErrorCode;
  readonly message: string;
  /** Present only when release of this call's own claim also failed. */
  readonly cause?: Exclude<FleetAcquireErrorCode, 'rollback_failed'>;
}

export interface FleetAcquireSuccess {
  readonly ok: true;
  readonly envelope: WorkEnvelopeV1;
}

export type FleetAcquireResult = FleetAcquireSuccess | FleetAcquireFailure;

/** An optional optimistic assertion made by a transport over a previously read offer. */
export interface FleetAcquireAssertionV1 {
  readonly repo_id?: string;
  readonly task_id?: string;
  readonly offer_revision?: string;
  readonly authorization_revision?: number;
}

export interface FleetAcquireOptions extends Pick<
  FleetOffersOptions,
  'env' | 'repo_id' | 'now_ms' | 'board_reader' | 'plan_reader' | 'registry_snapshot'
> {
  readonly assertion?: FleetAcquireAssertionV1;
  /** Recorded on the lease; one invocation keeps this value across retries. */
  readonly session_id?: string;
  /** A bounded retry is only for losing the task-lock claim race. */
  readonly max_attempts?: number;
  /** Injectable side-effect seam for the acquisition falsifier and failure tests. */
  readonly dependencies?: Partial<FleetAcquireDependencies>;
}

export interface FleetAcquireDependencies {
  readonly collectOffers: typeof collectFleetOffers;
  readonly readRegistry: typeof readRepoHarnessRegistrySnapshot;
  readonly claim: typeof claimSprintCommand;
  readonly bind: typeof bindSprintCommand;
  readonly release: typeof releaseSprintCommand;
  readonly sprintDependencies: typeof processSprintDependencies;
  readonly start: (repo: RepoHarnessRegisteredRepo, offer: TaskOfferV1) => ContractWorktreeStartV1;
  readonly topology: typeof readWorktreeTopology;
  readonly writeToken: (cwd: string, input: ClaimTokenWriteInput) => ClaimTokenV1;
  readonly project: (worktreePath: string, planPath: string) => void;
  readonly readLease: (cwd: string, taskId: string) => LeaseRead;
  readonly readCanonicalSprint: (cwd: string, source: {
    readonly targetRef: string;
    readonly sprintPath: string;
  }) => CanonicalSprintRead;
  readonly readPlanProof: typeof readCanonicalTaskPlanProof;
  readonly campaignPlanProof: typeof campaignTaskPlanProof;
  readonly repoIdentity: typeof resolveRepoIdentity;
}

const DEFAULT_ACQUIRE_ATTEMPTS = 3;

function failure(
  error: FleetAcquireErrorCode,
  message: string,
  cause?: Exclude<FleetAcquireErrorCode, 'rollback_failed'>,
): FleetAcquireFailure {
  return cause === undefined
    ? Object.freeze({ ok: false, error, message })
    : Object.freeze({ ok: false, error, message, cause });
}

function defaultStart(repo: RepoHarnessRegisteredRepo, offer: TaskOfferV1): ContractWorktreeStartV1 {
  if (offer.plan === null) throw new Error(`offer ${offer.task_id} has no plan proof`);
  const script = join(repo.path, 'scripts', 'contract-worktree.sh');
  const bash = process.env.REPO_HARNESS_BASH_BIN ?? '/bin/bash';
  const stdout = execFileSync(bash, [
    script,
    'start',
    '--plan', offer.plan.plan_path,
    '--fresh',
    '--json',
    '--no-plan-to-todo',
  ], {
    cwd: repo.path,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseStartResult(stdout);
}

function defaultProject(worktreePath: string, planPath: string): void {
  const bash = process.env.REPO_HARNESS_BASH_BIN ?? '/bin/bash';
  execFileSync(bash, [join(worktreePath, 'scripts', 'plan-to-todo.sh'), '--plan', planPath], {
    cwd: worktreePath,
    env: {
      ...process.env,
      REPO_HARNESS_TARGET_REPO_ROOT: worktreePath,
      REPO_HARNESS_CONTRACT_WORKTREE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function acquisitionDependencies(overrides: Partial<FleetAcquireDependencies> = {}): FleetAcquireDependencies {
  return {
    collectOffers: collectFleetOffers,
    readRegistry: readRepoHarnessRegistrySnapshot,
    claim: claimSprintCommand,
    bind: bindSprintCommand,
    release: releaseSprintCommand,
    sprintDependencies: processSprintDependencies,
    start: defaultStart,
    topology: readWorktreeTopology,
    writeToken: writeClaimTokenForBoundLease,
    project: defaultProject,
    readLease,
    readCanonicalSprint,
    readPlanProof: readCanonicalTaskPlanProof,
    campaignPlanProof: campaignTaskPlanProof,
    repoIdentity: resolveRepoIdentity,
    ...overrides,
  };
}

function parseStartResult(stdout: string): ContractWorktreeStartV1 {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`contract-worktree start returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('contract-worktree start returned a non-object JSON document');
  }
  const result = value as Record<string, unknown>;
  if (result.protocol !== 1 || result.kind !== 'repo-harness-contract-worktree-start') {
    throw new Error('contract-worktree start returned an unexpected protocol or kind');
  }
  if (typeof result.worktree_path !== 'string' || result.worktree_path.length === 0
    || typeof result.branch !== 'string' || result.branch.length === 0
    || typeof result.plan_path !== 'string' || result.plan_path.length === 0
    || result.disposition !== 'created') {
    throw new Error('contract-worktree start returned an invalid or non-fresh result');
  }
  return Object.freeze({
    protocol: 1,
    kind: 'repo-harness-contract-worktree-start',
    worktree_path: result.worktree_path,
    branch: result.branch,
    plan_path: result.plan_path,
    disposition: 'created',
  });
}

function commandMessage(outcome: CommandOutcome): string {
  return outcome.stderr.trim() || outcome.stdout.trim() || `command exited ${outcome.exitCode}`;
}

function readCommandRecord(outcome: CommandOutcome, label: string): LeaseOwnerRecord {
  let value: unknown;
  try {
    value = JSON.parse(outcome.stdout);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || typeof (value as Record<string, unknown>).claim_id !== 'string'
    || typeof (value as Record<string, unknown>).task_id !== 'string') {
    throw new Error(`${label} returned no lease owner record`);
  }
  return value as LeaseOwnerRecord;
}

function requestedRepoId(options: FleetAcquireOptions): string | undefined {
  const asserted = options.assertion?.repo_id;
  if (asserted !== undefined && options.repo_id !== undefined && asserted !== options.repo_id) {
    throw new Error('fleet acquire assertion repo_id conflicts with --repo-id');
  }
  return asserted ?? options.repo_id;
}

type OfferSelection =
  | { readonly ok: true; readonly offer: TaskOfferV1 }
  | { readonly ok: false; readonly result: FleetAcquireFailure };

function selectOffer(document: FleetOffersV1, options: FleetAcquireOptions): OfferSelection {
  const assertion = options.assertion;
  const repoId = requestedRepoId(options);
  if (assertion?.authorization_revision !== undefined
    && assertion.authorization_revision !== document.authorization_revision) {
    return { ok: false, result: failure('authorization_stale', 'asserted authorization revision is no longer current') };
  }

  let offer: TaskOfferV1 | null;
  if (assertion?.task_id !== undefined) {
    offer = document.offers.find((candidate) => (
      candidate.task_id === assertion.task_id
      && (repoId === undefined || candidate.repo_id === repoId)
    )) ?? null;
    if (offer === null || offer.execution_readiness !== 'execution_ready' || offer.snapshot_consistency !== 'stable') {
      return { ok: false, result: failure('offer_stale', 'asserted task is not execution-ready in the current offer document') };
    }
  } else {
    offer = selectExecutionReadyOffer(document, repoId);
    if (offer === null) return { ok: false, result: failure('no_eligible_task', 'no execution-ready task is available') };
  }
  if (assertion?.offer_revision !== undefined && assertion.offer_revision !== offer.offer_revision) {
    return { ok: false, result: failure('offer_stale', 'asserted offer revision is no longer current') };
  }
  return { ok: true, offer };
}

function collectOptions(
  options: FleetAcquireOptions,
  registry: RepoHarnessRegistrySnapshot,
): FleetOffersOptions {
  return {
    env: options.env,
    repo_id: requestedRepoId(options),
    now_ms: options.now_ms,
    registry_snapshot: registry,
    board_reader: options.board_reader,
    plan_reader: options.plan_reader,
  };
}

function registeredWritableRepo(
  registry: RepoHarnessRegistrySnapshot,
  offer: TaskOfferV1,
  expected: RepoHarnessRegisteredRepo | null = null,
): RepoHarnessRegisteredRepo | null {
  const repo = registry.repos.find((candidate) => candidate.id === offer.repo_id) ?? null;
  if (repo === null || repo.accessMode !== 'read_write') return null;
  if (expected !== null && repo.path !== expected.path) return null;
  return repo;
}

type OfferRevalidation =
  | { readonly ok: true; readonly repo: RepoHarnessRegisteredRepo; readonly registry: RepoHarnessRegistrySnapshot }
  | { readonly ok: false; readonly result: FleetAcquireFailure };

/** Re-read registry and whole offer before the first ownership mutation. */
function revalidateOffer(
  offer: TaskOfferV1,
  originalRepo: RepoHarnessRegisteredRepo,
  options: FleetAcquireOptions,
  deps: FleetAcquireDependencies,
): OfferRevalidation {
  const registry = deps.readRegistry({ env: options.env, adoptedOnly: true });
  if (registry.authorizationRevision !== offer.authorization_revision) {
    return { ok: false, result: failure('authorization_stale', 'registry authorization revision changed before claim') };
  }
  const repo = registeredWritableRepo(registry, offer, originalRepo);
  if (repo === null) {
    return { ok: false, result: failure('authorization_stale', 'repository authorization changed before claim') };
  }
  const fresh = deps.collectOffers(collectOptions(options, registry));
  const current = fresh.offers.find((candidate) => (
    candidate.repo_id === offer.repo_id && candidate.task_id === offer.task_id
  ));
  if (current === undefined || current.offer_revision !== offer.offer_revision
    || current.execution_readiness !== 'execution_ready' || current.snapshot_consistency !== 'stable') {
    return { ok: false, result: failure('offer_stale', 'offer changed before claim') };
  }
  return { ok: true, repo, registry };
}

function topologyMatches(
  topology: WorktreeTopology,
  start: ContractWorktreeStartV1,
): boolean {
  return topology.worktrees.some((entry) => (
    entry.path === start.worktree_path
    && entry.branch === `refs/heads/${start.branch}`
    && entry.head !== null
    && !entry.detached
  ));
}

function samePlanProof(left: NonNullable<TaskOfferV1['plan']>, right: CanonicalTaskPlanProof): boolean {
  return left.plan_path === right.plan_path
    && left.contract_path === right.contract_path
    && left.source_ref === right.source_ref
    && left.plan_sha256 === right.plan_sha256
    && left.contract_sha256 === right.contract_sha256;
}

/**
 * A claim changes lease availability, so re-collecting an offer afterwards
 * would necessarily invalidate our own offer. Revalidate the independent
 * authorities instead: registry, canonical target/row, and exact plan proof.
 */
type ClaimAuthorityRevalidation =
  | { readonly ok: true; readonly task: string }
  | { readonly ok: false; readonly result: FleetAcquireFailure };

function revalidateClaimAuthority(
  offer: TaskOfferV1,
  repo: RepoHarnessRegisteredRepo,
  options: FleetAcquireOptions,
  deps: FleetAcquireDependencies,
): ClaimAuthorityRevalidation {
  const registry = deps.readRegistry({ env: options.env, adoptedOnly: true });
  if (registry.authorizationRevision !== offer.authorization_revision
    || registeredWritableRepo(registry, offer, repo) === null) {
    return { ok: false, result: failure('authorization_stale', 'registry authorization changed after claim') };
  }
  if (offer.canonical_target === null || offer.plan === null) {
    return { ok: false, result: failure('offer_stale', 'claimed offer lost canonical target or plan proof') };
  }
  const canonical = deps.readCanonicalSprint(repo.path, {
    targetRef: offer.canonical_target.ref,
    sprintPath: offer.sprint_path,
  });
  if (!canonical.ok || canonical.commit !== offer.canonical_target.oid) {
    return {
      ok: false,
      result: failure('offer_stale', canonical.ok
        ? 'canonical target moved after claim'
        : `canonical target became unreadable after claim: ${canonical.error}`),
    };
  }
  const task = lookupCanonicalTask({
    repoIdentity: deps.repoIdentity(repo.path),
    sprintPath: offer.sprint_path,
    sprintText: canonical.text,
  }, offer.task_id);
  if (!task.ok || task.task.row.status !== PENDING_ROW_STATUS
    || task.task.task_revision !== offer.task_revision) {
    return {
      ok: false,
      result: failure('offer_stale', task.ok
        ? 'canonical task changed after claim'
        : `canonical task became unavailable after claim: ${task.error}`),
    };
  }
  const proof = deps.readPlanProof(repo.path, {
    sprintPath: offer.sprint_path,
    taskCell: task.task.row.task,
  });
  if (!proof.ok || !samePlanProof(offer.plan, proof.proof)) {
    return {
      ok: false,
      result: failure('offer_stale', proof.ok
        ? 'plan or contract proof changed after claim'
        : `plan or contract proof became invalid after claim: ${proof.error}`),
    };
  }
  const campaignProof = deps.campaignPlanProof(repo.path, offer.task_id, offer.task_revision, proof, options.env, offer.canonical_target.ref);
  if (!campaignProof.ok) return { ok: false, result: failure('offer_stale', `campaign planning authority changed after claim: ${campaignProof.error}`) };
  return { ok: true, task: task.task.row.task };
}

function envelope(
  offer: TaskOfferV1,
  start: ContractWorktreeStartV1,
  lease: LeaseOwnerRecord,
  token: ClaimTokenV1,
): WorkEnvelopeV1 {
  if (offer.canonical_target === null || offer.plan === null) {
    throw new Error('cannot build WorkEnvelopeV1 without canonical target and plan proof');
  }
  return Object.freeze({
    protocol: WORK_ENVELOPE_PROTOCOL,
    kind: WORK_ENVELOPE_KIND,
    repo_id: offer.repo_id,
    task_id: offer.task_id,
    task_revision: offer.task_revision,
    sprint_path: offer.sprint_path,
    claim_id: lease.claim_id,
    generation: lease.generation,
    worktree_path: start.worktree_path,
    branch: start.branch,
    unit_ref: offer.plan.plan_path,
    authorization_revision: offer.authorization_revision,
    offer_revision: offer.offer_revision,
    canonical_target: Object.freeze({ ...offer.canonical_target }),
    plan: Object.freeze({ ...offer.plan }),
    claim_token: Object.freeze({ ...token }),
  });
}

/** Release only the current call's token; a stolen claim can never release another owner. */
function compensate(
  code: Exclude<FleetAcquireErrorCode, 'rollback_failed'>,
  message: string,
  repo: RepoHarnessRegisteredRepo,
  claimId: string,
  deps: FleetAcquireDependencies,
): FleetAcquireFailure {
  const released = deps.release({ claimId }, deps.sprintDependencies(repo.path));
  if (released.exitCode === 0) return failure(code, message);
  return failure('rollback_failed', `${message}; own-claim release failed: ${commandMessage(released)}`, code);
}

function validateAttempts(value: number | undefined): number {
  const attempts = value ?? DEFAULT_ACQUIRE_ATTEMPTS;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 16) {
    throw new Error('fleet acquire max_attempts must be an integer from 1 through 16');
  }
  return attempts;
}

/**
 * Mutate one execution-ready offer through the existing claim/bind authorities.
 * No global fleet lock is introduced: the registry is optimistically fenced,
 * while the existing per-task lock remains the sole election authority.
 */
export function acquireFleetTask(options: FleetAcquireOptions = {}): FleetAcquireResult {
  const deps = acquisitionDependencies(options.dependencies);
  const attempts = validateAttempts(options.max_attempts);
  const sessionId = options.session_id ?? `fleet-acquire-${randomUUID()}`;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const initialRegistry = attempt === 0 && options.registry_snapshot !== undefined
      ? options.registry_snapshot
      : deps.readRegistry({ env: options.env, adoptedOnly: true });
    const initial = deps.collectOffers(collectOptions(options, initialRegistry));
    const selected = selectOffer(initial, options);
    if (!selected.ok) return selected.result;
    const offer = selected.offer;
    if (offer.canonical_target === null || offer.plan === null) {
      return failure('offer_stale', 'execution-ready offer lacks canonical target or plan proof');
    }
    const originalRepo = registeredWritableRepo(initialRegistry, offer);
    if (originalRepo === null) {
      return failure('authorization_stale', 'selected offer no longer has write authorization');
    }

    const revalidated = revalidateOffer(offer, originalRepo, options, deps);
    if (!revalidated.ok) return revalidated.result;
    const claim = deps.claim({
      taskId: offer.task_id,
      expectedTaskRevision: offer.task_revision,
      targetRef: offer.canonical_target.ref,
      sprintPath: offer.sprint_path,
      sessionId,
    }, deps.sprintDependencies(revalidated.repo.path));
    if (claim.exitCode !== 0) {
      // Losing an election is expected under concurrency. Re-read the offer on
      // the next bounded attempt; no lease exists that this caller may release.
      if (attempt + 1 < attempts) continue;
      return failure('no_eligible_task', `claim race was not won: ${commandMessage(claim)}`);
    }

    let record: LeaseOwnerRecord;
    try {
      record = readCommandRecord(claim, 'sprint claim');
    } catch (error) {
      return failure('claim_failed', error instanceof Error ? error.message : String(error));
    }
    if (record.claim_id.length === 0 || record.task_id !== offer.task_id) {
      return failure('claim_failed', 'sprint claim returned an owner record for a different task');
    }

    let start: ContractWorktreeStartV1;
    try {
      start = deps.start(revalidated.repo, offer);
      if (offer.plan === null || start.plan_path !== join(start.worktree_path, offer.plan.plan_path)) {
        throw new Error('fresh worktree start returned a plan path that does not match the selected proof');
      }
    } catch (error) {
      return compensate('provision_failed', error instanceof Error ? error.message : String(error), revalidated.repo, record.claim_id, deps);
    }

    try {
      if (!topologyMatches(deps.topology(revalidated.repo.path), start)) {
        return compensate('topology_failed', 'fresh worktree is absent from the expected Git topology', revalidated.repo, record.claim_id, deps);
      }
    } catch (error) {
      return compensate('topology_failed', error instanceof Error ? error.message : String(error), revalidated.repo, record.claim_id, deps);
    }

    const authority = revalidateClaimAuthority(offer, revalidated.repo, options, deps);
    if (!authority.ok) {
      if (authority.result.error === 'rollback_failed') return authority.result;
      return compensate(authority.result.error, authority.result.message, revalidated.repo, record.claim_id, deps);
    }

    const bound = deps.bind({
      claimId: record.claim_id,
      worktree: start.worktree_path,
      branch: start.branch,
      unitRef: offer.plan!.plan_path,
    }, deps.sprintDependencies(revalidated.repo.path));
    if (bound.exitCode !== 0) {
      return compensate('bind_failed', commandMessage(bound), revalidated.repo, record.claim_id, deps);
    }

    let token: ClaimTokenV1;
    try {
      token = deps.writeToken(revalidated.repo.path, {
        task_id: offer.task_id,
        claim_id: record.claim_id,
        worktree: start.worktree_path,
        sprint: offer.sprint_path,
        task: authority.task,
        unit_ref: offer.plan.plan_path,
      });
    } catch (error) {
      return compensate('token_failed', error instanceof Error ? error.message : String(error), revalidated.repo, record.claim_id, deps);
    }

    // Token publication is itself a side effect. Re-read the canonical task
    // and proof immediately afterwards, while the plan is still Approved; the
    // following projection intentionally changes plan lifecycle state.
    const tokenAuthority = revalidateClaimAuthority(offer, revalidated.repo, options, deps);
    if (!tokenAuthority.ok) {
      if (tokenAuthority.result.error === 'rollback_failed') return tokenAuthority.result;
      return compensate(tokenAuthority.result.error, tokenAuthority.result.message, revalidated.repo, record.claim_id, deps);
    }

    try {
      deps.project(start.worktree_path, offer.plan.plan_path);
    } catch (error) {
      return compensate('projection_failed', error instanceof Error ? error.message : String(error), revalidated.repo, record.claim_id, deps);
    }

    let finalTopology: WorktreeTopology;
    try {
      finalTopology = deps.topology(revalidated.repo.path);
    } catch (error) {
      return compensate('final_verify_failed', error instanceof Error ? error.message : String(error), revalidated.repo, record.claim_id, deps);
    }
    const finalRegistry = deps.readRegistry({ env: options.env, adoptedOnly: true });
    const finalLease = deps.readLease(revalidated.repo.path, offer.task_id).record;
    if (!topologyMatches(finalTopology, start)
      || finalRegistry.authorizationRevision !== offer.authorization_revision
      || registeredWritableRepo(finalRegistry, offer, revalidated.repo) === null
      || finalLease === null
      || finalLease.claim_id !== record.claim_id
      || finalLease.state !== 'bound'
      || finalLease.execution_worktree !== start.worktree_path
      || finalLease.branch !== start.branch
      || finalLease.unit_ref !== offer.plan.plan_path) {
      return compensate('final_verify_failed', 'authorization or bound lease changed before envelope return', revalidated.repo, record.claim_id, deps);
    }
    return Object.freeze({ ok: true, envelope: envelope(offer, start, finalLease, token) });
  }

  return failure('no_eligible_task', 'no execution-ready task is available after bounded claim retries');
}
