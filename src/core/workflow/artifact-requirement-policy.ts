/**
 * Pure artifact-requirement policy matrix for Lite/Standard/Strict x
 * edit/stop/ship.
 *
 * This module is the single source of truth for which ceremony artifacts
 * (contract, worktree, review, evidence, ...) each workflow profile
 * requires for each operation. Every requirement key and per-cell value
 * derives 1:1 from the nine approved `target_delta` records frozen by
 * LSC-01 in `tests/state/fixtures/loop-semantics/characterization.json`;
 * see `tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md`
 * for the record -> key derivation.
 *
 * LSC-03 wired this module's `resolve()` into `projectEffectiveState`
 * (`src/core/state/project-effective-state.ts`) for Standard work-package
 * contract-policy parity; LSC-04..08 cut PreEdit, Stop, ship, and adapter
 * consumers over one package at a time. This module performs no
 * fs/process/env/network access and imports only the `WorkflowProfile` type
 * from `./profile`. It does not reuse or extend `WorkflowOperationKind`,
 * which is a different (risk-signal) axis with no `stop`/`ship` member.
 */
import type { WorkflowProfile } from './profile';

/**
 * Module-owned operation axis for artifact requirement policy. Deliberately
 * NOT `WorkflowOperationKind` (the risk-signal axis in `./profile`, which
 * has no `stop`/`ship` member).
 */
export type ArtifactRequirementOperation = 'edit' | 'stop' | 'ship';

/**
 * Every requirement key referenced by the nine frozen `target_delta`
 * records. See the notes file for the record -> key derivation.
 */
export type ArtifactRequirementKey =
  | 'safe_path'
  | 'worktree_boundary'
  | 'destructive_action_boundary'
  | 'complete_approved_work_package'
  | 'separate_contract'
  | 'isolated_contract_worktree'
  | 'durable_recovery_state'
  | 'fresh_review'
  | 'external_acceptance'
  | 'fresh_checks'
  | 'subject_bound_targeted_evidence'
  | 'candidate_revision_precondition';

export type ArtifactRequirementStatus = 'required' | 'not_required';

/** One literal matrix cell entry: a requirement key and its policy default. */
export interface ArtifactRequirementEntry {
  readonly key: ArtifactRequirementKey;
  readonly defaultStatus: ArtifactRequirementStatus;
}

/**
 * Exhaustive Lite/Standard/Strict x edit/stop/ship matrix. The mapped type
 * over `WorkflowProfile` and `ArtifactRequirementOperation` forces all nine
 * cells to be present at compile time -- totality is enforced by types, not
 * by a runtime default.
 */
export type ArtifactRequirementMatrix = {
  readonly [profile in WorkflowProfile]: {
    readonly [operation in ArtifactRequirementOperation]: readonly ArtifactRequirementEntry[];
  };
};

/**
 * The literal policy matrix. Derivation (per cell, per key) is recorded in
 * `tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md`.
 *
 * Lite carries only baseline safety/evidence keys (no ceremony artifacts).
 * Standard requires a complete approved work package; its `separate_contract`
 * (and, for ship, `external_acceptance`) default to not_required but may be
 * raised by risk or explicit policy. Strict is the maximal fail-closed
 * envelope: every key it names is unconditionally required.
 */
export const ARTIFACT_REQUIREMENT_MATRIX: ArtifactRequirementMatrix = {
  lite: {
    edit: [
      { key: 'safe_path', defaultStatus: 'required' },
      { key: 'worktree_boundary', defaultStatus: 'required' },
      { key: 'destructive_action_boundary', defaultStatus: 'required' },
    ],
    stop: [
      { key: 'durable_recovery_state', defaultStatus: 'required' },
    ],
    ship: [
      { key: 'subject_bound_targeted_evidence', defaultStatus: 'required' },
    ],
  },
  standard: {
    edit: [
      { key: 'complete_approved_work_package', defaultStatus: 'required' },
      { key: 'separate_contract', defaultStatus: 'not_required' },
    ],
    stop: [
      { key: 'durable_recovery_state', defaultStatus: 'required' },
    ],
    ship: [
      { key: 'complete_approved_work_package', defaultStatus: 'required' },
      { key: 'subject_bound_targeted_evidence', defaultStatus: 'required' },
      { key: 'separate_contract', defaultStatus: 'not_required' },
      { key: 'external_acceptance', defaultStatus: 'not_required' },
    ],
  },
  strict: {
    edit: [
      { key: 'separate_contract', defaultStatus: 'required' },
      { key: 'isolated_contract_worktree', defaultStatus: 'required' },
    ],
    stop: [
      { key: 'durable_recovery_state', defaultStatus: 'required' },
    ],
    ship: [
      { key: 'separate_contract', defaultStatus: 'required' },
      { key: 'isolated_contract_worktree', defaultStatus: 'required' },
      { key: 'fresh_review', defaultStatus: 'required' },
      { key: 'external_acceptance', defaultStatus: 'required' },
      { key: 'fresh_checks', defaultStatus: 'required' },
      { key: 'candidate_revision_precondition', defaultStatus: 'required' },
    ],
  },
};

const KNOWN_PROFILES: ReadonlySet<string> = new Set(Object.keys(ARTIFACT_REQUIREMENT_MATRIX));
const KNOWN_OPERATIONS: ReadonlySet<string> = new Set(Object.keys(ARTIFACT_REQUIREMENT_MATRIX.lite));
const PROFILE_RANK: Readonly<Record<WorkflowProfile, number>> = { lite: 0, standard: 1, strict: 2 };
/**
 * Derived from `ARTIFACT_REQUIREMENT_MATRIX` itself (every requirement key
 * appears in at least one cell), so this stays the single source of truth
 * for "known requirement key" rather than a hand-maintained duplicate list.
 */
const KNOWN_REQUIREMENT_KEYS: ReadonlySet<string> = new Set(
  Object.values(ARTIFACT_REQUIREMENT_MATRIX).flatMap((operations) => Object.values(operations).flatMap(
    (entries) => entries.map((entry) => entry.key),
  )),
);

/** Explicit policy override: names requirement keys to force to `required`. */
export interface ArtifactRequirementPolicyOverride {
  readonly require?: readonly ArtifactRequirementKey[];
}

export interface ArtifactRequirementResolveInput {
  readonly profile: WorkflowProfile;
  readonly operation: ArtifactRequirementOperation;
  /**
   * An independently computed risk signal, ranked on the same
   * lite < standard < strict scale as `profile`. When `risk` outranks
   * `profile`, every not_required entry in the resolved cell is raised to
   * required. Omit when no distinct risk signal is available.
   */
  readonly risk?: WorkflowProfile;
  /** Explicit policy override; raises named not_required entries. */
  readonly policy?: ArtifactRequirementPolicyOverride;
}

export type ArtifactRequirementRaiseSource = 'risk' | 'policy';

export interface ArtifactRequirementDecision {
  readonly key: ArtifactRequirementKey;
  readonly defaultStatus: ArtifactRequirementStatus;
  /** `defaultStatus` after applying the risk/policy raise rule. */
  readonly status: ArtifactRequirementStatus;
  /** Empty unless a not_required entry was raised to required. */
  readonly raisedBy: readonly ArtifactRequirementRaiseSource[];
}

export interface ArtifactRequirementResolution {
  readonly ok: true;
  readonly profile: WorkflowProfile;
  readonly operation: ArtifactRequirementOperation;
  readonly requirements: readonly ArtifactRequirementDecision[];
}

export type ArtifactRequirementResolveErrorCode =
  | 'INVALID_PROFILE'
  | 'INVALID_OPERATION'
  | 'INVALID_RISK'
  | 'INVALID_POLICY_REQUIRE_KEY';

export interface ArtifactRequirementResolveError {
  readonly ok: false;
  readonly code: ArtifactRequirementResolveErrorCode;
  readonly message: string;
}

export type ArtifactRequirementResolveResult =
  | ArtifactRequirementResolution
  | ArtifactRequirementResolveError;

/**
 * Resolve the artifact-requirement decision for one profile x operation
 * cell, applying the risk/policy raise rule to any not_required entry.
 * Unknown profile, operation, `risk`, and `policy.require` values are all
 * rejected, never defaulted.
 */
export function resolve(input: ArtifactRequirementResolveInput): ArtifactRequirementResolveResult {
  if (!KNOWN_PROFILES.has(input.profile)) {
    return { ok: false, code: 'INVALID_PROFILE', message: `unknown workflow profile: ${input.profile}` };
  }
  if (!KNOWN_OPERATIONS.has(input.operation)) {
    return {
      ok: false,
      code: 'INVALID_OPERATION',
      message: `unknown artifact requirement operation: ${input.operation}`,
    };
  }
  if (input.risk !== undefined && !KNOWN_PROFILES.has(input.risk)) {
    return { ok: false, code: 'INVALID_RISK', message: `unknown risk profile: ${input.risk}` };
  }
  for (const key of input.policy?.require ?? []) {
    if (!KNOWN_REQUIREMENT_KEYS.has(key)) {
      return { ok: false, code: 'INVALID_POLICY_REQUIRE_KEY', message: `unknown policy requirement key: ${key}` };
    }
  }

  const cell = ARTIFACT_REQUIREMENT_MATRIX[input.profile][input.operation];
  const riskRaises = input.risk !== undefined && PROFILE_RANK[input.risk] > PROFILE_RANK[input.profile];
  const policyRequires = new Set(input.policy?.require ?? []);

  const requirements = cell.map((entry): ArtifactRequirementDecision => {
    if (entry.defaultStatus === 'required') {
      return { key: entry.key, defaultStatus: entry.defaultStatus, status: 'required', raisedBy: [] };
    }
    const raisedBy: ArtifactRequirementRaiseSource[] = [];
    if (riskRaises) raisedBy.push('risk');
    if (policyRequires.has(entry.key)) raisedBy.push('policy');
    return {
      key: entry.key,
      defaultStatus: entry.defaultStatus,
      status: raisedBy.length > 0 ? 'required' : 'not_required',
      raisedBy,
    };
  });

  return { ok: true, profile: input.profile, operation: input.operation, requirements };
}
