/** Read-only task offers used by the operator board and engineer snapshots. */
import {
  classifyTaskOffer,
  freezeTaskOffer,
  TASK_OFFER_KIND,
  TASK_OFFER_PROTOCOL,
  taskOfferRevision,
  type ClassifyTaskOfferInput,
  type TaskOfferBlockerV1,
  type TaskOfferPlanProofV1,
  type TaskOfferSnapshotConsistency,
  type TaskOfferV1,
} from '../../core/fleet/task-offer';
import type { BoardDocumentV1 } from '../../core/state/types';
import { type RepoHarnessRegisteredRepo, type RepoHarnessRegistrySnapshot } from '../repo-registry';
import { readActiveSprintPath, readCanonicalTargetRef } from '../state/collect-board-inputs';
import {
  readCanonicalTaskPlanProof,
  type CanonicalTaskPlanProof,
  type CanonicalTaskPlanProofResult,
} from '../state/coordination-canonical-source';
import { resolveBoard } from '../state/resolve-board';

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

interface TaskOfferReadOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly task_id?: string;
  readonly now_ms?: number;
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
  options: TaskOfferReadOptions = {},
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
  const offers = board.cards.flatMap((card, index) => {
    if (options.task_id !== undefined && card.task_id !== options.task_id) return [];
    let proofResult: CanonicalTaskPlanProofResult | null = null;
    if (card.mode.trim().toLowerCase() === 'contract') {
      proofResult = planReader(repo.path, {
        sprintPath: board.sprint_path,
        taskCell: card.task,
      });
    }
    return [buildTaskOffer(repo, registry, board, card, index, proofResult)];
  });
  return Object.freeze({
    repo: Object.freeze({ ...repo }),
    sprint_path: board.sprint_path,
    offers: Object.freeze(offers),
    snapshot_consistency: board.snapshot_consistency,
  });
}
