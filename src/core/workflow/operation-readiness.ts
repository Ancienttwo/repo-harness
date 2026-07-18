/**
 * Pure operation-readiness evaluator for Lite/Standard/Strict x
 * edit/stop/ship.
 *
 * `evaluateReadiness` is the single typed authority LSC-06 establishes for
 * the row acceptance: it consumes `profile`, the already-resolved
 * `ArtifactRequirementPolicy.resolve()` decision for each of edit/stop/ship,
 * and caller-observed evidence facts, and returns exactly five surfaces --
 * `allowedToEdit`, `allowedToStop`, `readyToShip`, `requirements`, and
 * `nextAction` -- whose semantics reproduce the nine frozen
 * `approved_target_delta` records in
 * `tests/state/fixtures/loop-semantics/characterization.json`. See
 * `tasks/notes/20260718-2239-lsc-06-operation-readiness-evaluator.notes.md`
 * for the per-cell delta -> semantics derivation.
 *
 * This module performs no fs/process/env/network access and imports only
 * types from `./profile` and `./artifact-requirement-policy`. It consumes
 * `resolve()` decisions verbatim -- it does not re-derive or duplicate the
 * `ARTIFACT_REQUIREMENT_MATRIX`. No consumer imports this module yet:
 * LSC-07 (Stop) and LSC-08 (adapter parity) cut consumers over separately.
 *
 * Design note -- why `operation` is part of the input even though
 * `allowedToEdit`/`allowedToStop`/`readyToShip` are always all three
 * computed together: the frozen `strict.stop.not-ready-to-ship-still-allows`
 * cell requires `allowedToStop=allow` and `readyToShip=block` from the SAME
 * evaluation, with `nextAction=null` (the delta's own `next_action` is
 * `'stop'`, i.e. the trivial "proceed" case) even though `readyToShip` is
 * blocked. A caller-scoped `nextAction` selector is the only way to keep
 * that cell's `nextAction=null` while still letting the `lite.ship` /
 * `standard.ship` / `strict.ship` cells (where the SAME kind of
 * ship-readiness gap is the very thing being asked about) surface a typed
 * `nextAction`. `allowedToEdit`, `allowedToStop`, `readyToShip`, and
 * `requirements` are unaffected by `operation` -- only `nextAction`'s scope
 * depends on it, so a Stop consumer can read `readyToShip` off the same
 * result without a second call and without `nextAction` leaking ship-only
 * remediation into a Stop response.
 */
import type { WorkflowProfile } from './profile';
import type {
  ArtifactRequirementDecision,
  ArtifactRequirementKey,
  ArtifactRequirementOperation,
  ArtifactRequirementResolution,
  ArtifactRequirementResolveResult,
  ArtifactRequirementStatus,
} from './artifact-requirement-policy';

/** One resolved requirement key annotated with its observed evidence status. */
export interface OperationReadinessRequirementStatus {
  readonly key: ArtifactRequirementKey;
  /** `status` from `resolve()`, i.e. post risk/policy raise. */
  readonly status: ArtifactRequirementStatus;
  /** `not_required` entries are always `satisfied`; `required` entries are
   * satisfied only when `evidence.satisfiedRequirements` names the key. */
  readonly satisfied: boolean;
}

/** The per-operation requirement decisions, each with satisfied/missing status. */
export interface OperationReadinessRequirements {
  readonly edit: readonly OperationReadinessRequirementStatus[];
  readonly stop: readonly OperationReadinessRequirementStatus[];
  readonly ship: readonly OperationReadinessRequirementStatus[];
}

/**
 * Typed missing-requirement reason vocabulary. `required_contract_missing`
 * and `required_worktree_missing` are the two literal reason strings named
 * by the frozen `strict.edit.missing-contract-blocks` delta
 * (`behavior_changes: ["return typed required_contract_missing and
 * required_worktree_missing reasons"]`); every other member extends that
 * same `required_<noun>_missing` naming pattern to the remaining
 * `ArtifactRequirementKey` values so every required key has exactly one
 * deterministic, total reason code (see `REASON_FOR_KEY` below).
 * `hard_blocker_present` covers the caller-observed hard-blocker evidence
 * fact, which is distinct from any single requirement key.
 */
export type OperationReadinessMissingReasonCode =
  | 'required_safe_path_missing'
  | 'required_worktree_boundary_missing'
  | 'required_destructive_action_boundary_missing'
  | 'required_work_package_missing'
  | 'required_contract_missing'
  | 'required_worktree_missing'
  | 'required_recovery_state_missing'
  | 'required_review_missing'
  | 'required_external_acceptance_missing'
  | 'required_checks_missing'
  | 'required_evidence_missing'
  | 'required_candidate_revision_missing'
  | 'hard_blocker_present';

/** Total, compile-time-checked map from every requirement key to its reason code. */
const REASON_FOR_KEY: Readonly<Record<ArtifactRequirementKey, OperationReadinessMissingReasonCode>> = {
  safe_path: 'required_safe_path_missing',
  worktree_boundary: 'required_worktree_boundary_missing',
  destructive_action_boundary: 'required_destructive_action_boundary_missing',
  complete_approved_work_package: 'required_work_package_missing',
  separate_contract: 'required_contract_missing',
  isolated_contract_worktree: 'required_worktree_missing',
  durable_recovery_state: 'required_recovery_state_missing',
  fresh_review: 'required_review_missing',
  external_acceptance: 'required_external_acceptance_missing',
  fresh_checks: 'required_checks_missing',
  subject_bound_targeted_evidence: 'required_evidence_missing',
  candidate_revision_precondition: 'required_candidate_revision_missing',
};

/**
 * Typed next-action vocabulary, closed to exactly the three non-null
 * `next_action` values named across the nine frozen deltas
 * (`create_contract_worktree`, `run_targeted_verification`,
 * `complete_strict_acceptance`). A missing requirement key with no known
 * remediation action in `KEY_REMEDIATION` below leaves `nextAction=null`
 * rather than inventing a fourth literal.
 */
export type OperationReadinessNextAction =
  | 'create_contract_worktree'
  | 'run_targeted_verification'
  | 'complete_strict_acceptance';

/** Partial map: only keys with an established frozen-delta remediation action. */
const KEY_REMEDIATION: Readonly<Partial<Record<ArtifactRequirementKey, OperationReadinessNextAction>>> = {
  separate_contract: 'create_contract_worktree',
  isolated_contract_worktree: 'create_contract_worktree',
  subject_bound_targeted_evidence: 'run_targeted_verification',
  fresh_review: 'complete_strict_acceptance',
  external_acceptance: 'complete_strict_acceptance',
  fresh_checks: 'complete_strict_acceptance',
  candidate_revision_precondition: 'complete_strict_acceptance',
};

export interface OperationReadinessAllow {
  readonly decision: 'allow';
}
export interface OperationReadinessBlock {
  readonly decision: 'block';
  readonly reasons: readonly OperationReadinessMissingReasonCode[];
}
/** Shared decision shape for all three gates -- one literal decision path per operation. */
export type OperationReadinessDecision = OperationReadinessAllow | OperationReadinessBlock;

/**
 * Caller-observed evidence facts: which required keys are currently
 * satisfied, and any hard blockers unrelated to a specific requirement key
 * (e.g. an unsafe in-progress destructive operation). Omitted/absent keys
 * are treated as NOT satisfied -- evidence is fail-closed, never defaulted
 * to satisfied.
 */
export interface OperationReadinessEvidence {
  readonly satisfiedRequirements: readonly ArtifactRequirementKey[];
  /** Non-empty forces `block` on every gate (edit/stop/ship alike). */
  readonly hardBlockers?: readonly string[];
}

/** The three already-resolved per-operation requirement decisions this evaluator consumes. */
export interface OperationReadinessRequirementInputs {
  readonly edit: ArtifactRequirementResolveResult;
  readonly stop: ArtifactRequirementResolveResult;
  readonly ship: ArtifactRequirementResolveResult;
}

export interface EvaluateReadinessInput {
  readonly profile: WorkflowProfile;
  /** Selects which gate's remediation `nextAction` is surfaced; see the module docstring. */
  readonly operation: ArtifactRequirementOperation;
  readonly requirements: OperationReadinessRequirementInputs;
  readonly evidence: OperationReadinessEvidence;
}

export interface OperationReadinessResult {
  readonly ok: true;
  readonly allowedToEdit: OperationReadinessDecision;
  readonly allowedToStop: OperationReadinessDecision;
  readonly readyToShip: OperationReadinessDecision;
  readonly requirements: OperationReadinessRequirements;
  readonly nextAction: OperationReadinessNextAction | null;
}

export type OperationReadinessErrorCode =
  | 'INVALID_PROFILE'
  | 'INVALID_OPERATION'
  | 'INVALID_REQUIREMENT_DECISION'
  | 'REQUIREMENT_MISMATCH';

export interface OperationReadinessError {
  readonly ok: false;
  readonly code: OperationReadinessErrorCode;
  readonly message: string;
}

export type EvaluateReadinessResult = OperationReadinessResult | OperationReadinessError;

const KNOWN_PROFILES: ReadonlySet<string> = new Set<WorkflowProfile>(['lite', 'standard', 'strict']);
const KNOWN_OPERATIONS: ReadonlySet<string> = new Set<ArtifactRequirementOperation>(['edit', 'stop', 'ship']);

function validateRequirementResult(
  operation: ArtifactRequirementOperation,
  profile: WorkflowProfile,
  result: ArtifactRequirementResolveResult,
): ArtifactRequirementResolution | OperationReadinessError {
  if (!result.ok) {
    return {
      ok: false,
      code: 'INVALID_REQUIREMENT_DECISION',
      message: `${operation} requirement decision was rejected by resolve(): [${result.code}] ${result.message}`,
    };
  }
  if (result.profile !== profile) {
    return {
      ok: false,
      code: 'REQUIREMENT_MISMATCH',
      message: `${operation} requirement decision profile "${result.profile}" does not match input profile "${profile}"`,
    };
  }
  if (result.operation !== operation) {
    return {
      ok: false,
      code: 'REQUIREMENT_MISMATCH',
      message: `${operation} requirement decision is for operation "${result.operation}", expected "${operation}"`,
    };
  }
  return result;
}

function statusesFor(
  decisions: readonly ArtifactRequirementDecision[],
  satisfied: ReadonlySet<ArtifactRequirementKey>,
): readonly OperationReadinessRequirementStatus[] {
  return decisions.map((decision) => ({
    key: decision.key,
    status: decision.status,
    satisfied: decision.status === 'not_required' ? true : satisfied.has(decision.key),
  }));
}

function missingOf(
  statuses: readonly OperationReadinessRequirementStatus[],
): readonly OperationReadinessRequirementStatus[] {
  return statuses.filter((status) => status.status === 'required' && !status.satisfied);
}

function decisionFor(
  statuses: readonly OperationReadinessRequirementStatus[],
  hardBlocked: boolean,
): OperationReadinessDecision {
  const missing = missingOf(statuses);
  if (missing.length === 0 && !hardBlocked) {
    return { decision: 'allow' };
  }
  const reasons: OperationReadinessMissingReasonCode[] = missing.map((status) => REASON_FOR_KEY[status.key]);
  if (hardBlocked) reasons.push('hard_blocker_present');
  return { decision: 'block', reasons };
}

function nextActionFor(statuses: readonly OperationReadinessRequirementStatus[]): OperationReadinessNextAction | null {
  for (const status of missingOf(statuses)) {
    const action = KEY_REMEDIATION[status.key];
    if (action) return action;
  }
  return null;
}

/**
 * Evaluate edit/stop/ship readiness from one profile, the three already
 * resolved `ArtifactRequirementPolicy.resolve()` decisions, and observed
 * evidence facts. Unknown profile/operation values and malformed or
 * mismatched requirement decisions are rejected, never defaulted.
 */
export function evaluateReadiness(input: EvaluateReadinessInput): EvaluateReadinessResult {
  if (!KNOWN_PROFILES.has(input.profile)) {
    return { ok: false, code: 'INVALID_PROFILE', message: `unknown workflow profile: ${input.profile}` };
  }
  if (!KNOWN_OPERATIONS.has(input.operation)) {
    return { ok: false, code: 'INVALID_OPERATION', message: `unknown operation-readiness operation: ${input.operation}` };
  }

  const edit = validateRequirementResult('edit', input.profile, input.requirements.edit);
  if (!edit.ok) return edit;
  const stop = validateRequirementResult('stop', input.profile, input.requirements.stop);
  if (!stop.ok) return stop;
  const ship = validateRequirementResult('ship', input.profile, input.requirements.ship);
  if (!ship.ok) return ship;

  const satisfied = new Set(input.evidence.satisfiedRequirements);
  const hardBlocked = (input.evidence.hardBlockers?.length ?? 0) > 0;

  const editStatuses = statusesFor(edit.requirements, satisfied);
  const stopStatuses = statusesFor(stop.requirements, satisfied);
  const shipStatuses = statusesFor(ship.requirements, satisfied);

  const allowedToEdit = decisionFor(editStatuses, hardBlocked);
  const allowedToStop = decisionFor(stopStatuses, hardBlocked);
  const readyToShip = decisionFor(shipStatuses, hardBlocked);

  const scoped = input.operation === 'edit'
    ? { decision: allowedToEdit, statuses: editStatuses }
    : input.operation === 'stop'
      ? { decision: allowedToStop, statuses: stopStatuses }
      : { decision: readyToShip, statuses: shipStatuses };
  const nextAction = scoped.decision.decision === 'block' ? nextActionFor(scoped.statuses) : null;

  return {
    ok: true,
    allowedToEdit,
    allowedToStop,
    readyToShip,
    requirements: { edit: editStatuses, stop: stopStatuses, ship: shipStatuses },
    nextAction,
  };
}
