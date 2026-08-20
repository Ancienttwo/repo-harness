/**
 * Pure coordination identity: sprint rows -> task identity, task revision, and
 * the lease owner record schema. No clock, PID, randomness, or filesystem
 * input reaches this layer; `src/effects/state/coordination-lease-store.ts`
 * owns every side effect and `src/cli/commands/sprint.ts` owns process I/O.
 *
 * Two derivations, and the reason each excludes what it excludes:
 *
 * - `task_id = digest(protocol + repo identity + canonical sprint path + exact
 *   Task cell text)`. The row index is excluded on purpose: including it means
 *   deleting or reordering row 1 rewrites the identity of every row below it,
 *   orphaning live leases into unreachable directories while the same tasks
 *   become freshly claimable under new ids. The sprint path gives cross-sprint
 *   isolation, and the exact Task cell text -- never `normalize_slug()`, which
 *   collapses "Fix auth bug" and "Fix auth-bug" into one key -- gives
 *   within-sprint separation.
 * - `task_revision = digest(task_id + Mode cell + Acceptance cell)`. The Status
 *   cell is excluded on purpose: a sibling row completing rewrites the sprint
 *   file, and a revision that moved with it would invalidate every other live
 *   claim, making parallel execution impossible. Only this row's own semantic
 *   fields may mark a claim drifted.
 *
 * The digest is `sha256` hex with no `sha256:` prefix, unlike the house
 * `progress_token`/`state_revision` shape. `task_id` is used verbatim as a
 * single path component under the coordination root, and a bare 64-character
 * hex string is a safe path component on every filesystem this repo targets.
 * `TASK_DIGEST_PATTERN` is the validator the effects layer applies before any
 * derived value reaches `join()`.
 */
import { createHash } from 'crypto';
import { backlogRows, type BacklogRow } from './sprint-backlog-rows';

/** Coordination protocol version; part of every digest preimage. */
export const COORDINATION_PROTOCOL = 1;

export const LEASE_OWNER_KIND = 'repo-harness-lease-owner';

/** The only backlog status cell a claim may be taken against. */
export const PENDING_ROW_STATUS = '[ ]';

/**
 * The completed status cell, matching `sprint-backlog.sh`'s own
 * `$2 ~ /^\[[xX]\]$/` counting rule. A completed canonical row is the one piece
 * of evidence that proves a residual lease has nothing left to protect.
 */
export const COMPLETED_ROW_STATUS_PATTERN = /^\[[xX]\]$/;

/** Shape every `task_id` and `task_revision` must have before it is trusted. */
export const TASK_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

const TASK_ID_DOMAIN = 'repo-harness-task-id';
const TASK_REVISION_DOMAIN = 'repo-harness-task-revision';

/**
 * Domain-separated digest over an ordered field list. `JSON.stringify` of a
 * string array is the canonical encoding: every field is quoted and escaped,
 * so no field value can forge a separator into another field's position.
 */
function digest(fields: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(fields), 'utf-8').digest('hex');
}

export interface TaskIdInput {
  /** Stable identity of the clone that owns the coordination plane. */
  readonly repoIdentity: string;
  /** Canonical repo-relative sprint path, as it exists on the target ref. */
  readonly sprintPath: string;
  /** The row's Task cell, verbatim and untransformed. */
  readonly taskCell: string;
}

export function deriveTaskId(input: TaskIdInput): string {
  return digest([
    TASK_ID_DOMAIN,
    String(COORDINATION_PROTOCOL),
    input.repoIdentity,
    input.sprintPath,
    input.taskCell,
  ]);
}

export interface TaskRevisionInput {
  readonly taskId: string;
  readonly modeCell: string;
  readonly acceptanceCell: string;
}

export function deriveTaskRevision(input: TaskRevisionInput): string {
  return digest([
    TASK_REVISION_DOMAIN,
    String(COORDINATION_PROTOCOL),
    input.taskId,
    input.modeCell,
    input.acceptanceCell,
  ]);
}

/** One backlog row resolved to its coordination identity. */
export interface CanonicalTask {
  readonly task_id: string;
  readonly task_revision: string;
  readonly sprint_path: string;
  readonly row: BacklogRow;
}

export interface CanonicalSprintInput {
  readonly repoIdentity: string;
  readonly sprintPath: string;
  readonly sprintText: string;
}

/** Every backlog row of one canonical sprint, in file order. */
export function projectCanonicalTasks(input: CanonicalSprintInput): CanonicalTask[] {
  return backlogRows(input.sprintText).map((row) => {
    const taskId = deriveTaskId({
      repoIdentity: input.repoIdentity,
      sprintPath: input.sprintPath,
      taskCell: row.task,
    });
    return {
      task_id: taskId,
      task_revision: deriveTaskRevision({
        taskId,
        modeCell: row.mode,
        acceptanceCell: row.acceptance,
      }),
      sprint_path: input.sprintPath,
      row,
    };
  });
}

export type CanonicalTaskLookup =
  | { readonly ok: true; readonly task: CanonicalTask }
  | { readonly ok: false; readonly error: string };

/**
 * Resolve one `task_id` against a canonical sprint. Duplicate Task cells fail
 * closed rather than picking the first match: the identity contract requires a
 * Task cell to be unique within a sprint, and `sprint-backlog.sh`'s own task-ref
 * resolution already refuses ambiguous references.
 */
export function lookupCanonicalTask(
  input: CanonicalSprintInput,
  taskId: string,
): CanonicalTaskLookup {
  if (!TASK_DIGEST_PATTERN.test(taskId)) {
    return { ok: false, error: `malformed task id: ${taskId}` };
  }
  const matches = projectCanonicalTasks(input).filter((task) => task.task_id === taskId);
  if (matches.length === 0) {
    return { ok: false, error: `no backlog row in ${input.sprintPath} has task id ${taskId}` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `ambiguous task id ${taskId} (${matches.length} backlog rows match) in ${input.sprintPath}`,
    };
  }
  return { ok: true, task: matches[0] };
}

/**
 * Resolve the caller-facing task reference `sprint-backlog.sh` already accepts
 * -- a backlog index or an exact Task cell -- against the canonical sprint.
 *
 * This is the only bridge from the shell's human reference to the coordination
 * `task_id`, and it deliberately reuses the script's own resolution rule,
 * including its refusal of ambiguous references. Nothing downstream may
 * re-derive an identity from a slug or a row position.
 */
export function resolveCanonicalTaskRef(
  input: CanonicalSprintInput,
  taskRef: string,
): CanonicalTaskLookup {
  if (taskRef.length === 0) return { ok: false, error: 'empty task reference' };
  const matches = projectCanonicalTasks(input).filter(
    (task) => task.row.index === taskRef || task.row.task === taskRef,
  );
  if (matches.length === 0) {
    return { ok: false, error: `no backlog row matches task '${taskRef}' in ${input.sprintPath}` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `task reference '${taskRef}' is ambiguous (${matches.length} backlog rows match) in ${input.sprintPath}`,
    };
  }
  return { ok: true, task: matches[0] };
}

/**
 * States a lease owner record may carry on disk. `available` is deliberately
 * not one of them -- it is the absence of a lease, classified by the store.
 *
 * `released` is written durably before the lease directory is removed, so a
 * crash inside `release` leaves a record that proves the transfer finished;
 * `reconcile` can then clear it without guessing. `completing` is written by
 * the completion split once the publication transaction has passed its claim,
 * binding, and revision gates, so a crash inside the publication window is a
 * named state rather than an ambiguous `bound`.
 */
export const PERSISTED_LEASE_STATES = [
  'reserving',
  'bound',
  'completing',
  'released',
] as const;

export type PersistedLeaseState = (typeof PERSISTED_LEASE_STATES)[number];

/** The full lifecycle, including the no-lease state the store reports. */
export type LeaseState = 'available' | PersistedLeaseState;

export interface LeaseClaimedBy {
  readonly session_id: string;
  readonly source_worktree: string;
}

/** Provenance of a preemption; null on a first claim. */
export interface LeaseStolenFrom {
  readonly claim_id: string;
  readonly reason: string;
}

/** The first `generation` a fresh claim mints; every steal increments it. */
export const FIRST_LEASE_GENERATION = 1;

export interface LeaseOwnerRecordV1 {
  readonly protocol: typeof COORDINATION_PROTOCOL;
  readonly kind: typeof LEASE_OWNER_KIND;
  readonly claim_id: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly sprint_path: string;
  /**
   * The canonical ref the claim was validated against. Every later verb that
   * re-reads canonical compares its own `--target-ref` against this value, so a
   * completion validated on a different ref than the claim was taken on fails
   * closed instead of proving pendingness against the wrong authority.
   */
  readonly target_ref: string;
  /**
   * Fencing history. `claim_id` alone says who owns the lease now; `generation`
   * says how many owners preceded them, which is what a preemption chain needs
   * and what a stale reader cannot forge by re-minting a uuid.
   */
  readonly generation: number;
  readonly state: PersistedLeaseState;
  readonly claimed_by: LeaseClaimedBy;
  readonly execution_worktree: string | null;
  readonly branch: string | null;
  readonly unit_ref: string | null;
  /**
   * The closeout journal key the publication window runs under, set when the
   * lease enters `completing`. Null in every other state: outside that window
   * there is no finish transaction to recover, and inventing one would name a
   * journal entry that does not exist.
   */
  readonly finish_transaction_key: string | null;
  /** Who this lease was taken from, and why. Never inferred; only `steal` sets it. */
  readonly stolen_from: LeaseStolenFrom | null;
}

export interface BuildLeaseOwnerInput {
  readonly claimId: string;
  readonly taskId: string;
  readonly taskRevision: string;
  readonly sprintPath: string;
  readonly targetRef: string;
  readonly generation: number;
  readonly sessionId: string;
  readonly sourceWorktree: string;
  readonly stolenFrom?: LeaseStolenFrom | null;
}

/** The record a fresh claim (or a steal) publishes: always `reserving`. */
export function buildLeaseOwnerRecord(input: BuildLeaseOwnerInput): LeaseOwnerRecordV1 {
  return {
    protocol: COORDINATION_PROTOCOL,
    kind: LEASE_OWNER_KIND,
    claim_id: input.claimId,
    task_id: input.taskId,
    task_revision: input.taskRevision,
    sprint_path: input.sprintPath,
    target_ref: input.targetRef,
    generation: input.generation,
    state: 'reserving',
    claimed_by: { session_id: input.sessionId, source_worktree: input.sourceWorktree },
    execution_worktree: null,
    branch: null,
    unit_ref: null,
    finish_transaction_key: null,
    stolen_from: input.stolenFrom ?? null,
  };
}

export function serializeLeaseOwnerRecord(record: LeaseOwnerRecordV1): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || nonEmptyString(value);
}

/**
 * Parse one owner record. `null` means the bytes are not a valid record, which
 * the store classifies `unknown`; it never means "assume a default". Every
 * field is checked, so a truncated or hand-edited record fails closed instead
 * of being partially trusted.
 */
export function parseLeaseOwnerRecord(raw: string): LeaseOwnerRecordV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;

  if (value.protocol !== COORDINATION_PROTOCOL) return null;
  if (value.kind !== LEASE_OWNER_KIND) return null;
  if (!nonEmptyString(value.claim_id)) return null;
  if (typeof value.task_id !== 'string' || !TASK_DIGEST_PATTERN.test(value.task_id)) return null;
  if (
    typeof value.task_revision !== 'string'
    || !TASK_DIGEST_PATTERN.test(value.task_revision)
  ) return null;
  if (!nonEmptyString(value.sprint_path)) return null;
  // Absent is rejected, not defaulted: a record written by a build that did not
  // carry these fields cannot be distinguished from one whose fields were
  // stripped, and inventing either value would forge fencing or canonical
  // authority. The store classifies such a record `unknown`.
  if (!nonEmptyString(value.target_ref)) return null;
  if (typeof value.generation !== 'number'
    || !Number.isInteger(value.generation)
    || value.generation < FIRST_LEASE_GENERATION) return null;
  if (!nullableString(value.finish_transaction_key)) return null;
  if (
    typeof value.state !== 'string'
    || !(PERSISTED_LEASE_STATES as readonly string[]).includes(value.state)
  ) return null;

  const claimedBy = value.claimed_by;
  if (typeof claimedBy !== 'object' || claimedBy === null || Array.isArray(claimedBy)) return null;
  const claimedByValue = claimedBy as Record<string, unknown>;
  if (!nonEmptyString(claimedByValue.session_id)) return null;
  if (!nonEmptyString(claimedByValue.source_worktree)) return null;

  if (!nullableString(value.execution_worktree)) return null;
  if (!nullableString(value.branch)) return null;
  if (!nullableString(value.unit_ref)) return null;

  let stolenFrom: LeaseStolenFrom | null = null;
  if (value.stolen_from !== null && value.stolen_from !== undefined) {
    const candidate = value.stolen_from;
    if (typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const candidateValue = candidate as Record<string, unknown>;
    if (!nonEmptyString(candidateValue.claim_id)) return null;
    if (!nonEmptyString(candidateValue.reason)) return null;
    stolenFrom = { claim_id: candidateValue.claim_id, reason: candidateValue.reason };
  }

  return {
    protocol: COORDINATION_PROTOCOL,
    kind: LEASE_OWNER_KIND,
    claim_id: value.claim_id,
    task_id: value.task_id,
    task_revision: value.task_revision,
    sprint_path: value.sprint_path,
    target_ref: value.target_ref,
    generation: value.generation,
    state: value.state as PersistedLeaseState,
    claimed_by: {
      session_id: claimedByValue.session_id,
      source_worktree: claimedByValue.source_worktree,
    },
    execution_worktree: value.execution_worktree as string | null,
    branch: value.branch as string | null,
    unit_ref: value.unit_ref as string | null,
    finish_transaction_key: value.finish_transaction_key as string | null,
    stolen_from: stolenFrom,
  };
}

export type LeaseTransition =
  | { readonly ok: true; readonly record: LeaseOwnerRecordV1 }
  | { readonly ok: false; readonly error: string };

function claimMismatch(record: LeaseOwnerRecordV1, claimId: string): string {
  return `claim id mismatch for task ${record.task_id}: lease is owned by ${record.claim_id}, not ${claimId}`;
}

export interface BindLeaseInput {
  readonly claimId: string;
  readonly executionWorktree: string;
  readonly branch: string;
  readonly unitRef: string;
}

/**
 * `reserving -> bound`, filling the execution worktree, branch, and unit ref.
 * Only the holder of the same fencing token may bind, and only from
 * `reserving`: a `bound` lease rebinding to a second worktree would silently
 * move ownership without any record of the transfer.
 */
export function bindLeaseRecord(
  record: LeaseOwnerRecordV1,
  input: BindLeaseInput,
): LeaseTransition {
  if (record.claim_id !== input.claimId) {
    return { ok: false, error: claimMismatch(record, input.claimId) };
  }
  if (record.state !== 'reserving') {
    return { ok: false, error: `cannot bind a lease in state ${record.state}; expected reserving` };
  }
  return {
    ok: true,
    record: {
      ...record,
      state: 'bound',
      execution_worktree: input.executionWorktree,
      branch: input.branch,
      unit_ref: input.unitRef,
    },
  };
}

export interface BeginCompletionInput {
  readonly claimId: string;
  /** The worktree the completion runs in, already resolved to its real path. */
  readonly executionWorktree: string;
  /**
   * The closeout journal key this publication window runs under, or null when
   * the caller opened no journal. Never derived here: the journal is the
   * closeout transaction's own authority and this layer only records what it
   * was handed.
   */
  readonly finishTransactionKey: string | null;
}

/**
 * `bound -> completing`, the contract-finish gate. All three checks the work
 * package names are here: the fencing token, the binding to the worktree the
 * completion actually runs in, and (in the caller, against canonical) the task
 * revision.
 *
 * The binding check is what a stolen-from agent cannot pass: `steal` mints a
 * new record whose `execution_worktree` is null, so the displaced worktree
 * fails both the token comparison and the binding comparison independently.
 *
 * `completing -> completing` is admitted because contract finish is re-runnable
 * by design -- its closeout journal replays -- and a retry by the same token
 * from the same worktree must not be refused for having already passed.
 */
export function beginLeaseCompletionRecord(
  record: LeaseOwnerRecordV1,
  input: BeginCompletionInput,
): LeaseTransition {
  if (record.claim_id !== input.claimId) {
    return { ok: false, error: claimMismatch(record, input.claimId) };
  }
  if (record.state !== 'bound' && record.state !== 'completing') {
    return {
      ok: false,
      error: `cannot complete a lease in state ${record.state}; expected bound`,
    };
  }
  if (record.execution_worktree !== input.executionWorktree) {
    return {
      ok: false,
      error: `lease for task ${record.task_id} is bound to ${record.execution_worktree ?? '(no worktree)'}, not ${input.executionWorktree}`,
    };
  }
  return {
    ok: true,
    record: {
      ...record,
      state: 'completing',
      finish_transaction_key: input.finishTransactionKey,
    },
  };
}

export interface AbortCompletionInput {
  readonly claimId: string;
  /** The worktree whose failed closeout is being rolled back. */
  readonly executionWorktree: string;
}

/**
 * `completing -> bound`, after the caller has proved that publication did not
 * land. This pure layer owns only the fenced state transition; the caller owns
 * the canonical-row and publication checks that authorize it.
 *
 * An already restored `bound` record with no finish key is idempotent. That
 * closes the crash window between publishing this lease update and recording
 * the closeout journal as aborted. No other `bound` shape is accepted.
 */
export function abortLeaseCompletionRecord(
  record: LeaseOwnerRecordV1,
  input: AbortCompletionInput,
): LeaseTransition {
  if (record.claim_id !== input.claimId) {
    return { ok: false, error: claimMismatch(record, input.claimId) };
  }
  if (record.execution_worktree !== input.executionWorktree) {
    return {
      ok: false,
      error: `lease for task ${record.task_id} is bound to ${record.execution_worktree ?? '(no worktree)'}, not ${input.executionWorktree}`,
    };
  }
  if (record.state === 'bound' && record.finish_transaction_key === null) {
    return { ok: true, record };
  }
  if (record.state !== 'completing') {
    return {
      ok: false,
      error: `cannot abort completion of a lease in state ${record.state}; expected completing`,
    };
  }
  return {
    ok: true,
    record: {
      ...record,
      state: 'bound',
      finish_transaction_key: null,
    },
  };
}

/** The only states a lease may be given up from (spec 8.3). */
const RELEASABLE_LEASE_STATES: readonly PersistedLeaseState[] = ['reserving', 'bound'];

/**
 * `-> released`. The record is written before the lease directory is removed,
 * so the crash window between the two is a named, reconcilable state rather
 * than an ambiguous one.
 *
 * Only `reserving` and `bound` may be given up. `completing` is excluded
 * because a release there cannot tell whether the publication landed: the
 * canonical row is the authority on that, and `reconcile` is the verb that
 * reads it. Releasing from `completing` would drop the lease on work whose
 * publication may have failed, freeing the row for a second agent while the
 * finish journal is still open.
 */
export function releaseLeaseRecord(
  record: LeaseOwnerRecordV1,
  claimId: string,
): LeaseTransition {
  if (record.claim_id !== claimId) {
    return { ok: false, error: claimMismatch(record, claimId) };
  }
  if (!RELEASABLE_LEASE_STATES.includes(record.state)) {
    return {
      ok: false,
      error: `cannot release a lease in state ${record.state}; expected reserving or bound`,
    };
  }
  return { ok: true, record: { ...record, state: 'released' } };
}

export interface StealLeaseInput {
  readonly expectedClaimId: string;
  readonly reason: string;
  readonly newClaimId: string;
  readonly sessionId: string;
  readonly sourceWorktree: string;
}

/**
 * Preemption with provenance: the new owner record names the claim it took the
 * lease from and why. This is what `start-task --force` could not do, and the
 * reason `--force` is retired by this work package.
 *
 * The stolen lease keeps its observed `task_revision` and `target_ref`.
 * Re-validating the row against canonical is the caller's job, exactly as it is
 * for `claim`.
 *
 * `completing` is refused outright (spec 6). Once the completion split has
 * passed its gate the publication may already have landed, and a steal there
 * would erase the window marker that says so -- the new owner would find a
 * pending-looking row whose work is in fact already published.
 */
export function stealLeaseRecord(
  record: LeaseOwnerRecordV1,
  input: StealLeaseInput,
): LeaseTransition {
  if (record.claim_id !== input.expectedClaimId) {
    return {
      ok: false,
      error: `expected claim id ${input.expectedClaimId} for task ${record.task_id}, but the lease is owned by ${record.claim_id}`,
    };
  }
  if (record.state === 'completing') {
    return {
      ok: false,
      error: `cannot steal a lease in state completing for task ${record.task_id}; `
        + 'its publication window is open, so resolve the finish first with sprint reconcile',
    };
  }
  if (input.newClaimId === record.claim_id) {
    return { ok: false, error: 'a steal must mint a new claim id' };
  }
  return {
    ok: true,
    record: {
      ...buildLeaseOwnerRecord({
        claimId: input.newClaimId,
        taskId: record.task_id,
        taskRevision: record.task_revision,
        sprintPath: record.sprint_path,
        targetRef: record.target_ref,
        generation: record.generation + 1,
        sessionId: input.sessionId,
        sourceWorktree: input.sourceWorktree,
        stolenFrom: { claim_id: record.claim_id, reason: input.reason },
      }),
    },
  };
}
