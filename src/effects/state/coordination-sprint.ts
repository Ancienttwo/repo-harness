/**
 * Effect-owned coordination verbs for the shared lease protocol.
 *
 * Every verb below is a pure command projection returning `CommandOutcome`.
 * All filesystem and Git access arrives through
 * `SprintCommandDependencies`, so the verbs are testable without a repo and
 * the effect modules stay the single owners of their side effects.
 *
 * Two rules hold across all ownership verbs:
 *
 * - every ownership mutation runs inside that task's lock, because a bare
 *   compare-and-mutate on `claim_id` is still a TOCTOU: A reads owner = B, B is
 *   stolen and the owner becomes C, A deletes based on its stale read;
 * - the fencing token is compared before any mutation, so an agent whose task
 *   was reassigned can neither delete the new owner's lease nor act on it.
 *
 * Exit codes follow `state.ts`: 2 is a malformed invocation, 1 is an
 * operational failure or a fail-closed refusal, 0 is a completed verb.
 */
import { randomUUID } from 'crypto';
import { realpathSync } from 'fs';
import { buildAttemptReceipt } from '../../core/state/attempt-ledger';
import type { CommandOutcome } from '../../core/state/command-outcome';
import {
  COMPLETED_ROW_STATUS_PATTERN,
  FIRST_LEASE_GENERATION,
  PENDING_ROW_STATUS,
  TASK_DIGEST_PATTERN,
  abortLeaseCompletionRecord,
  beginLeaseCompletionRecord,
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  lookupCanonicalTask,
  releaseLeaseRecord,
  resolveCanonicalTaskRef,
  stealLeaseRecord,
  type CanonicalTask,
  type LeaseOwnerRecord,
} from '../../core/state/coordination-identity';
import {
  readCanonicalSprint,
  resolveRepoIdentity,
  type CanonicalSprintRead,
  type CanonicalSprintSource,
} from './coordination-canonical-source';
import { appendAttemptReceipt } from './attempt-ledger-store';
import {
  SPRINT_BACKLOG_SCHEMA_V1,
  SprintSchemaError,
  sprintBacklogSchema,
  type SprintBacklogSchema,
} from '../../core/state/sprint-backlog-rows';
import { lookupLegacyTaskForReconcile } from '../../core/state/sprint-schema-v1';
import { legacyCutoverRefusal } from './coordination-cutover';
import {
  writeClaimTokenForBoundLease,
  type ClaimTokenV1,
  type ClaimTokenWriteInput,
} from './coordination-claim-token';
import {
  createLeaseDirectory,
  findLeaseByClaimId,
  readLease,
  removeLease,
  removeOwnLeaseAfterFailedClaim,
  withTaskLock,
  writeLeaseOwnerDurably,
  type LeaseClaimLookup,
  type LeaseRead,
} from './coordination-lease-store';

/** Every filesystem and Git effect the verbs may reach, injected. */
export interface CoordinationPort {
  /**
   * The refusal text when this clone still carries retired per-worktree
   * markers and has not crossed over, or `null` when ownership verbs may run.
   */
  readonly legacyCutoverRefusal: () => string | null;
  readonly readCanonicalSprint: (source: CanonicalSprintSource) => CanonicalSprintRead;
  readonly withTaskLock: <T>(taskId: string, run: () => T) => T;
  readonly readLease: (taskId: string) => LeaseRead;
  readonly createLeaseDirectory: (taskId: string) => boolean;
  readonly writeLeaseOwner: (taskId: string, record: LeaseOwnerRecord) => void;
  readonly removeLease: (taskId: string, claimId: string) => void;
  readonly rollbackOwnLease: (taskId: string, claimId: string) => void;
  readonly findLeaseByClaimId: (claimId: string) => LeaseClaimLookup;
  readonly writeClaimToken: (input: ClaimTokenWriteInput) => ClaimTokenV1;
  /**
   * Append one `resumed` attempt receipt to the execution worktree's own
   * ignored runtime ledger. Throws on failure; `bind` fails closed on it.
   */
  readonly appendResumedReceipt: (worktree: string, unitRef: string) => void;
}

export interface SprintCommandDependencies {
  /** Stable identity of the clone; part of every `task_id` preimage. */
  readonly repoIdentity: string;
  /** The worktree the verb was invoked from; recorded, never trusted as authority. */
  readonly sourceWorktree: string;
  readonly newClaimId: () => string;
  readonly coordination: CoordinationPort;
}

function usage(message: string): CommandOutcome {
  return { exitCode: 2, stdout: '', stderr: `${message}\n` };
}

function refuse(message: string): CommandOutcome {
  return { exitCode: 1, stdout: '', stderr: `${message}\n` };
}

function operationalFailure(error: unknown): CommandOutcome {
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: 1, stdout: '', stderr: `${message}\n` };
}

function ok(value: unknown): CommandOutcome {
  return { exitCode: 0, stdout: `${JSON.stringify(value, null, 2)}\n`, stderr: '' };
}

function requireOption(value: string | undefined, flag: string): string | CommandOutcome {
  if (value === undefined || value.length === 0) return usage(`${flag} is required`);
  return value;
}

/** Narrows the `<value> | CommandOutcome` shape the option and lease helpers return. */
function isOutcome(value: unknown): value is CommandOutcome {
  return typeof value === 'object' && value !== null && 'exitCode' in value && 'stdout' in value;
}

export interface ClaimCommandOptions {
  readonly taskId?: string;
  readonly expectedTaskRevision?: string;
  readonly targetRef?: string;
  readonly sprintPath?: string;
  readonly sessionId?: string;
}

/**
 * Resolve one canonical task and check the two preconditions a claim depends
 * on: the row is still pending, and its revision still matches what the caller
 * observed. Both are re-checked after the lease is published -- and nothing
 * else is, deliberately. A sibling row completing rewrites the sprint file
 * without touching either predicate, which is precisely the property the
 * contract's falsifier pins down; comparing whole-file or whole-ref state here
 * would invalidate every concurrent claim on every unrelated completion.
 */
function verifyCanonicalPreconditions(
  deps: SprintCommandDependencies,
  source: CanonicalSprintSource,
  taskId: string,
  expectedTaskRevision: string,
): { readonly ok: true; readonly task: CanonicalTask } | { readonly ok: false; readonly error: string } {
  const canonical = deps.coordination.readCanonicalSprint(source);
  if (!canonical.ok) return { ok: false, error: canonical.error };

  const lookup = lookupCanonicalTask(
    {
      repoIdentity: deps.repoIdentity,
      sprintPath: source.sprintPath,
      sprintText: canonical.text,
    },
    taskId,
  );
  if (!lookup.ok) return { ok: false, error: lookup.error };

  const task = lookup.task;
  if (task.row.status !== PENDING_ROW_STATUS) {
    return {
      ok: false,
      error: `task ${taskId} is not pending on ${source.targetRef}: status is ${task.row.status || '(empty)'}`,
    };
  }
  if (task.task_revision !== expectedTaskRevision) {
    return {
      ok: false,
      error: `task ${taskId} drifted: canonical revision is ${task.task_revision}, not ${expectedTaskRevision}`,
    };
  }
  return { ok: true, task };
}

export interface IdentifyCommandOptions {
  readonly task?: string;
  readonly targetRef?: string;
  readonly sprintPath?: string;
}

/**
 * Derive one row's `task_id` and `task_revision` from the canonical sprint.
 *
 * `sprint-backlog.sh` resolves rows by index or Task cell and cannot hash them:
 * re-deriving either digest in awk would be a second implementation of the
 * identity contract, which is precisely the shadow derivation the repo rules
 * forbid. This verb is the shell's only route to those two values, and it reads
 * the same canonical ref every other verb validates against, so the shell can
 * never hand `claim` a revision it observed in a stale local copy.
 */
export function identifySprintCommand(
  options: IdentifyCommandOptions,
  deps: SprintCommandDependencies,
): CommandOutcome {
  const task = requireOption(options.task, '--task');
  if (isOutcome(task)) return task;
  const targetRef = requireOption(options.targetRef, '--target-ref');
  if (isOutcome(targetRef)) return targetRef;
  const sprintPath = requireOption(options.sprintPath, '--sprint-path');
  if (isOutcome(sprintPath)) return sprintPath;

  try {
    const canonical = deps.coordination.readCanonicalSprint({ targetRef, sprintPath });
    if (!canonical.ok) return refuse(canonical.error);
    const lookup = resolveCanonicalTaskRef(
      { repoIdentity: deps.repoIdentity, sprintPath, sprintText: canonical.text },
      task,
    );
    if (!lookup.ok) return refuse(lookup.error);
    return ok({
      task_id: lookup.task.task_id,
      task_revision: lookup.task.task_revision,
      sprint_path: sprintPath,
      target_ref: targetRef,
      commit: canonical.commit,
      index: lookup.task.row.index,
      status: lookup.task.row.status,
      task: lookup.task.row.task,
      mode: lookup.task.row.mode,
    });
  } catch (error) {
    return operationalFailure(error);
  }
}

/**
 * Compare-and-swap claim. Ordered exactly as the work package specifies:
 * resolve the sprint from the explicit canonical ref (never the caller's local
 * active-sprint marker, which in a worktree cut from an older commit is a
 * stale copy), verify pending, verify the expected revision, take the per-task
 * lock, elect the lease with one atomic `mkdir`, publish the owner record
 * durably, re-read canonical, and on any change roll back only the lease this
 * call created and fail closed.
 */
export function claimSprintCommand(
  options: ClaimCommandOptions,
  deps: SprintCommandDependencies,
): CommandOutcome {
  const taskId = requireOption(options.taskId, '--task-id');
  if (isOutcome(taskId)) return taskId;
  if (!TASK_DIGEST_PATTERN.test(taskId)) return usage(`malformed --task-id: ${taskId}`);

  const expectedTaskRevision = requireOption(
    options.expectedTaskRevision,
    '--expected-task-revision',
  );
  if (isOutcome(expectedTaskRevision)) return expectedTaskRevision;
  if (!TASK_DIGEST_PATTERN.test(expectedTaskRevision)) {
    return usage(`malformed --expected-task-revision: ${expectedTaskRevision}`);
  }

  const targetRef = requireOption(options.targetRef, '--target-ref');
  if (isOutcome(targetRef)) return targetRef;
  const sprintPath = requireOption(options.sprintPath, '--sprint-path');
  if (isOutcome(sprintPath)) return sprintPath;
  const sessionId = requireOption(options.sessionId, '--session-id');
  if (isOutcome(sessionId)) return sessionId;

  const source: CanonicalSprintSource = { targetRef, sprintPath };
  try {
    // Before anything is elected: a claim taken on a clone that never crossed
    // over would run the v1 plane beside legacy markers it cannot see.
    const cutover = deps.coordination.legacyCutoverRefusal();
    if (cutover !== null) return refuse(cutover);

    const before = verifyCanonicalPreconditions(deps, source, taskId, expectedTaskRevision);
    if (!before.ok) return refuse(before.error);

    return deps.coordination.withTaskLock(taskId, () => {
      const existing = deps.coordination.readLease(taskId);
      if (existing.classification !== 'available') {
        return refuse(
          `task ${taskId} is not available: lease is ${existing.classification}`
          + `${existing.unknown_reason ? ` (${existing.unknown_reason}; run sprint reconcile)` : ''}`,
        );
      }
      if (!deps.coordination.createLeaseDirectory(taskId)) {
        return refuse(`lost the lease election for task ${taskId}`);
      }

      const claimId = deps.newClaimId();
      const record = buildLeaseOwnerRecord({
        claimId,
        taskId,
        taskRevision: before.task.task_revision,
        sprintPath,
        // Captured, not re-derived later: every verb that re-reads canonical
        // must prove it read the same authority this claim was validated on.
        targetRef,
        generation: FIRST_LEASE_GENERATION,
        sessionId,
        sourceWorktree: deps.sourceWorktree,
      });
      try {
        deps.coordination.writeLeaseOwner(taskId, record);
      } catch (error) {
        deps.coordination.rollbackOwnLease(taskId, claimId);
        throw error;
      }

      const after = verifyCanonicalPreconditions(deps, source, taskId, expectedTaskRevision);
      if (!after.ok) {
        deps.coordination.rollbackOwnLease(taskId, claimId);
        return refuse(`canonical authority changed during claim; lease rolled back: ${after.error}`);
      }
      return ok(record);
    });
  } catch (error) {
    return operationalFailure(error);
  }
}

/** Locate the lease a fencing token owns, then run `mutate` under its lock. */
function withOwnedLease(
  deps: SprintCommandDependencies,
  claimId: string,
  mutate: (taskId: string) => CommandOutcome,
): CommandOutcome {
  const lookup = deps.coordination.findLeaseByClaimId(claimId);
  if (!lookup.ok) return refuse(lookup.error);
  // The scan above is a lookup only. The record is re-read and re-compared
  // inside the lock, so a lease that moves in between is caught there.
  return deps.coordination.withTaskLock(lookup.lease.task_id, () => mutate(lookup.lease.task_id));
}

function lockedRecord(
  deps: SprintCommandDependencies,
  taskId: string,
): LeaseOwnerRecord | CommandOutcome {
  const read = deps.coordination.readLease(taskId);
  if (read.record === null) {
    return refuse(
      `lease for task ${taskId} is ${read.classification}`
      + `${read.unknown_reason ? ` (${read.unknown_reason}; run sprint reconcile)` : ''}`,
    );
  }
  return read.record;
}

export interface BindCommandOptions {
  readonly claimId?: string;
  readonly worktree?: string;
  readonly branch?: string;
  readonly unitRef?: string;
}

export interface WriteClaimTokenCommandOptions {
  readonly taskId?: string;
  readonly claimId?: string;
  readonly worktree?: string;
  readonly sprintPath?: string;
  readonly task?: string;
  readonly unitRef?: string;
}

/**
 * Publish a worktree-local capability only after the lease is already bound.
 * This deliberately follows `bind` rather than participating in it: the
 * token is a projection for shell/hooks, never lease authority, and failure
 * leaves the bound lease intact for explicit compensation by its caller.
 */
export function writeClaimTokenSprintCommand(
  options: WriteClaimTokenCommandOptions,
  deps: SprintCommandDependencies,
): CommandOutcome {
  const taskId = requireOption(options.taskId, '--task-id');
  if (isOutcome(taskId)) return taskId;
  const claimId = requireOption(options.claimId, '--claim-id');
  if (isOutcome(claimId)) return claimId;
  const worktree = requireOption(options.worktree, '--worktree');
  if (isOutcome(worktree)) return worktree;
  const sprintPath = requireOption(options.sprintPath, '--sprint-path');
  if (isOutcome(sprintPath)) return sprintPath;
  const task = requireOption(options.task, '--task');
  if (isOutcome(task)) return task;
  const unitRef = requireOption(options.unitRef, '--unit-ref');
  if (isOutcome(unitRef)) return unitRef;

  try {
    return ok(deps.coordination.writeClaimToken({
      task_id: taskId,
      claim_id: claimId,
      worktree,
      sprint: sprintPath,
      task,
      unit_ref: unitRef,
    }));
  } catch (error) {
    return operationalFailure(error);
  }
}

/**
 * `reserving -> bound`. Claiming precedes worktree creation, so the first
 * record cannot name an execution worktree that does not exist yet; this verb
 * fills it once `contract-worktree start` has succeeded.
 *
 * The `resumed` receipt is appended BEFORE the bound record is written, and
 * the order is not incidental. `evaluateAttemptStall` walks a unit's receipts
 * backwards and stops at anything that is not a no-progress `completed`, so a
 * `resumed` receipt is what stops a new generation from inheriting the
 * previous claim's stall count -- without it, the first board read after a
 * steal-then-rebind reports a `stalled` that never happened to this owner.
 *
 * Appending after the owner write would leave the window this exists to close:
 * a lease already `bound` while still carrying the old claim's stall count. So
 * an append failure fails the bind closed -- the lease stays `reserving` and
 * the caller's existing `rollback_claim` path applies. The opposite residue,
 * an orphan `resumed` receipt from a bind that then failed, is harmless: a
 * receipt is evidence, never authority, and the worst it can do is clear one
 * stall count.
 *
 * It is not conditioned on `generation`: a first bind's ledger has no receipts
 * for the unit to clear, so the receipt is a no-op there, and branching on
 * generation would add a second rule for the same invariant.
 */
export function bindSprintCommand(
  options: BindCommandOptions,
  deps: SprintCommandDependencies,
): CommandOutcome {
  const claimId = requireOption(options.claimId, '--claim-id');
  if (isOutcome(claimId)) return claimId;
  const worktree = requireOption(options.worktree, '--worktree');
  if (isOutcome(worktree)) return worktree;
  const branch = requireOption(options.branch, '--branch');
  if (isOutcome(branch)) return branch;
  const unitRef = requireOption(options.unitRef, '--unit-ref');
  if (isOutcome(unitRef)) return unitRef;

  try {
    return withOwnedLease(deps, claimId, (taskId) => {
      const current = lockedRecord(deps, taskId);
      if (isOutcome(current)) return current;
      const transition = bindLeaseRecord(current, {
        claimId,
        executionWorktree: worktree,
        branch,
        unitRef,
      });
      if (!transition.ok) return refuse(transition.error);
      deps.coordination.appendResumedReceipt(worktree, unitRef);
      deps.coordination.writeLeaseOwner(taskId, transition.record);
      return ok(transition.record);
    });
  } catch (error) {
    return operationalFailure(error);
  }
}

export interface BeginCompletionCommandOptions {
  readonly claimId?: string;
  readonly worktree?: string;
  readonly targetRef?: string;
  readonly finishTransactionKey?: string;
}

export interface AbortCompletionCommandOptions {
  readonly claimId?: string;
  readonly worktree?: string;
  readonly targetRef?: string;
}

/**
 * The canonical ref a verb was asked to validate against must be the one the
 * claim was taken on. Anything else re-reads a different authority: a row that
 * is pending on the caller's ref says nothing about the ref the lease protects,
 * so the check fails closed rather than silently switching authority.
 */
function targetRefDrift(record: LeaseOwnerRecord, targetRef: string): string | null {
  if (record.target_ref === targetRef) return null;
  return `lease for task ${record.task_id} was claimed against ${record.target_ref}, not ${targetRef}`;
}

/**
 * The contract-finish gate, run before the publication tree is built:
 *
 * - the fencing token still owns a lease,
 * - that lease is bound to the worktree the finish is running in,
 * - the row's `task_revision` still matches canonical.
 *
 * All three run inside the per-task lock, so a `steal` landing mid-check is
 * serialized rather than raced. The record moves to `completing`, which names
 * the window between this gate and the publication: a crash there leaves
 * `completing` with a pending canonical row, and a crash after publication
 * leaves `completing` with a completed one, which `reconcile` can clear.
 *
 * The row's status is deliberately not a precondition. The canonical row stays
 * `[ ]` until the publication commit back-fills it, and on a replay after a
 * crashed publication it is already `[x]`; neither says anything about whether
 * this token still owns the work.
 */
export function beginCompletionSprintCommand(
  options: BeginCompletionCommandOptions,
  deps: SprintCommandDependencies,
): CommandOutcome {
  const claimId = requireOption(options.claimId, '--claim-id');
  if (isOutcome(claimId)) return claimId;
  const worktree = requireOption(options.worktree, '--worktree');
  if (isOutcome(worktree)) return worktree;
  const targetRef = requireOption(options.targetRef, '--target-ref');
  if (isOutcome(targetRef)) return targetRef;

  try {
    return withOwnedLease(deps, claimId, (taskId) => {
      const current = lockedRecord(deps, taskId);
      if (isOutcome(current)) return current;
      const drift = targetRefDrift(current, targetRef);
      if (drift !== null) return refuse(drift);
      const transition = beginLeaseCompletionRecord(current, {
        claimId,
        executionWorktree: worktree,
        finishTransactionKey: options.finishTransactionKey ?? null,
      });
      if (!transition.ok) return refuse(transition.error);

      const canonical = deps.coordination.readCanonicalSprint({
        targetRef,
        sprintPath: current.sprint_path,
      });
      if (!canonical.ok) return refuse(canonical.error);
      const lookup = lookupCanonicalTask(
        {
          repoIdentity: deps.repoIdentity,
          sprintPath: current.sprint_path,
          sprintText: canonical.text,
        },
        taskId,
      );
      if (!lookup.ok) return refuse(lookup.error);
      if (lookup.task.task_revision !== current.task_revision) {
        return refuse(
          `task ${taskId} drifted since it was claimed: canonical revision is `
          + `${lookup.task.task_revision}, the claim observed ${current.task_revision}`,
        );
      }

      deps.coordination.writeLeaseOwner(taskId, transition.record);
      return ok({ ...transition.record, canonical_status: lookup.task.row.status });
    });
  } catch (error) {
    return operationalFailure(error);
  }
}

/**
 * Restore a failed, provably unpublished completion window to `bound`.
 * Publication proof remains the shell transaction owner's responsibility;
 * this command independently fences the mutation and refuses to reopen a row
 * whose canonical authority no longer says pending.
 */
export function abortCompletionSprintCommand(
  options: AbortCompletionCommandOptions,
  deps: SprintCommandDependencies,
): CommandOutcome {
  const claimId = requireOption(options.claimId, '--claim-id');
  if (isOutcome(claimId)) return claimId;
  const worktree = requireOption(options.worktree, '--worktree');
  if (isOutcome(worktree)) return worktree;
  const targetRef = requireOption(options.targetRef, '--target-ref');
  if (isOutcome(targetRef)) return targetRef;

  try {
    return withOwnedLease(deps, claimId, (taskId) => {
      const current = lockedRecord(deps, taskId);
      if (isOutcome(current)) return current;
      const drift = targetRefDrift(current, targetRef);
      if (drift !== null) return refuse(drift);
      const transition = abortLeaseCompletionRecord(current, {
        claimId,
        executionWorktree: worktree,
      });
      if (!transition.ok) return refuse(transition.error);

      const canonical = deps.coordination.readCanonicalSprint({
        targetRef,
        sprintPath: current.sprint_path,
      });
      if (!canonical.ok) return refuse(canonical.error);
      const lookup = lookupCanonicalTask(
        {
          repoIdentity: deps.repoIdentity,
          sprintPath: current.sprint_path,
          sprintText: canonical.text,
        },
        taskId,
      );
      if (!lookup.ok) return refuse(lookup.error);
      if (lookup.task.row.status !== PENDING_ROW_STATUS) {
        return refuse(
          `cannot abort completion of task ${taskId} on ${targetRef}: canonical status is `
          + `${lookup.task.row.status || '(empty)'}, expected ${PENDING_ROW_STATUS}`,
        );
      }

      deps.coordination.writeLeaseOwner(taskId, transition.record);
      return ok({ ...transition.record, canonical_status: lookup.task.row.status });
    });
  } catch (error) {
    return operationalFailure(error);
  }
}

export interface ReleaseCommandOptions {
  readonly claimId?: string;
}

/**
 * Give the lease up. The `released` record is published before the directory
 * is removed, so the window between the two is a named state a later
 * `reconcile` can clear rather than an ambiguous one.
 */
export function releaseSprintCommand(
  options: ReleaseCommandOptions,
  deps: SprintCommandDependencies,
): CommandOutcome {
  const claimId = requireOption(options.claimId, '--claim-id');
  if (isOutcome(claimId)) return claimId;

  try {
    return withOwnedLease(deps, claimId, (taskId) => {
      const current = lockedRecord(deps, taskId);
      if (isOutcome(current)) return current;
      const transition = releaseLeaseRecord(current, claimId);
      if (!transition.ok) return refuse(transition.error);
      deps.coordination.writeLeaseOwner(taskId, transition.record);
      deps.coordination.removeLease(taskId, claimId);
      return ok({ released: transition.record });
    });
  } catch (error) {
    return operationalFailure(error);
  }
}

export interface StealCommandOptions {
  readonly expectedClaimId?: string;
  readonly reason?: string;
  readonly sessionId?: string;
}

/**
 * Preemption with provenance, and the reason `start-task --force` is retired:
 * `--force` was unconditional and left no record of who took what from whom.
 * The new record names the claim it displaced and the stated reason, and the
 * displaced token can no longer release, bind, or publish.
 */
export function stealSprintCommand(
  options: StealCommandOptions,
  deps: SprintCommandDependencies,
): CommandOutcome {
  const expectedClaimId = requireOption(options.expectedClaimId, '--expected-claim-id');
  if (isOutcome(expectedClaimId)) return expectedClaimId;
  const reason = requireOption(options.reason, '--reason');
  if (isOutcome(reason)) return reason;
  const sessionId = requireOption(options.sessionId, '--session-id');
  if (isOutcome(sessionId)) return sessionId;

  try {
    // Same gate as `claim`: a steal is the other way a token is minted, so it
    // may not run on a clone that never crossed over either.
    const cutover = deps.coordination.legacyCutoverRefusal();
    if (cutover !== null) return refuse(cutover);

    return withOwnedLease(deps, expectedClaimId, (taskId) => {
      const current = lockedRecord(deps, taskId);
      if (isOutcome(current)) return current;
      const transition = stealLeaseRecord(current, {
        expectedClaimId,
        reason,
        newClaimId: deps.newClaimId(),
        sessionId,
        sourceWorktree: deps.sourceWorktree,
      });
      if (!transition.ok) return refuse(transition.error);
      deps.coordination.writeLeaseOwner(taskId, transition.record);
      return ok(transition.record);
    });
  } catch (error) {
    return operationalFailure(error);
  }
}

export interface ReconcileCommandOptions {
  readonly taskId?: string;
  readonly targetRef?: string;
  readonly expectedClaimId?: string;
}

export type ReconcileAction =
  | 'none'
  | 'cleared_released_lease'
  | 'cleared_completed_lease';

/**
 * Explicit inspection of one lease, and the only verb allowed to act without a
 * caller-supplied fencing token -- so it acts only where some authority other
 * than the caller proves the lease has nothing left to protect.
 *
 * Two proofs qualify, and they are the two crash windows the completion split
 * creates:
 *
 * - a `released` record: the owner published it before removing the directory,
 *   so completing the removal cannot take anything from anyone;
 * - a canonical row that is already `[x]`: no atomic operation spans a git
 *   publication and a filesystem lease, so a finish that published and then
 *   crashed leaves exactly this shape. The tracked row owns completion, and a
 *   completed row means no execution ownership remains to hold.
 *
 * Everything else is reported and left alone. `unknown` in particular is never
 * cleared here: an empty lease directory cannot distinguish a crashed claim
 * from a live one paused between `mkdir` and the durable write.
 *
 * `--target-ref` is required rather than optional because the completed-row
 * proof is only as good as the ref it was read from; a reconcile that silently
 * skipped the canonical check when a ref was absent would report `none` for a
 * lease it was asked to resolve.
 *
 * `--expected-claim-id` is optional and narrowing, never widening: an operator
 * resolving a residue has no token to offer, while a caller cleaning up after
 * its own publication does, and passing it means "clear my lease or nothing".
 * Without it the verb behaves exactly as before -- the proofs it acts on come
 * from an authority other than the caller either way.
 */
export function reconcileSprintCommand(
  options: ReconcileCommandOptions,
  deps: SprintCommandDependencies,
): CommandOutcome {
  const taskId = requireOption(options.taskId, '--task-id');
  if (isOutcome(taskId)) return taskId;
  if (!TASK_DIGEST_PATTERN.test(taskId)) return usage(`malformed --task-id: ${taskId}`);
  const targetRef = requireOption(options.targetRef, '--target-ref');
  if (isOutcome(targetRef)) return targetRef;

  try {
    return deps.coordination.withTaskLock(taskId, () => {
      const read = deps.coordination.readLease(taskId);
      let action: ReconcileAction = 'none';
      let canonicalStatus: string | null = null;
      let canonicalError: string | null = null;

      if (read.record !== null) {
        const drift = targetRefDrift(read.record, targetRef);
        if (drift !== null) return refuse(drift);
        if (
          options.expectedClaimId !== undefined
          && read.record.claim_id !== options.expectedClaimId
        ) {
          return refuse(
            `claim id mismatch for task ${taskId}: lease is owned by ${read.record.claim_id}, `
            + `not ${options.expectedClaimId}`,
          );
        }
        if (read.record.state === 'reviewing') {
          return refuse(
            `cannot reconcile a reviewing lease for task ${taskId}; use publication reconcile after provider-backed verification`,
          );
        }
        if (read.record.state === 'released') {
          deps.coordination.removeLease(taskId, read.record.claim_id);
          action = 'cleared_released_lease';
        } else {
          const canonical = deps.coordination.readCanonicalSprint({
            targetRef,
            sprintPath: read.record.sprint_path,
          });
          if (!canonical.ok) {
            canonicalError = canonical.error;
          } else {
            const source = {
              repoIdentity: deps.repoIdentity,
              sprintPath: read.record.sprint_path,
              sprintText: canonical.text,
            };
            let schema: SprintBacklogSchema | null = null;
            try {
              schema = sprintBacklogSchema(canonical.text);
            } catch (error) {
              canonicalError = error instanceof SprintSchemaError ? error.message : String(error);
            }

            if (schema === SPRINT_BACKLOG_SCHEMA_V1) {
              // The pre-migration recovery window, and the only runtime read of
              // the schema 1 identity derivation. `migrate-schema` refuses a
              // non-released lease and schema 2 identity is fail-closed on a
              // schema 1 sprint, so without this a lease minted before the
              // migration could never be proved finished and the sprint could
              // never be migrated. It is bounded to a `completing` residue: a
              // `reserving` or `bound` lease is live work that still belongs to
              // its owner, who releases it through the normal verbs.
              if (read.record.state !== 'completing') {
                canonicalError = `cannot reconcile a ${read.record.state} lease for task ${taskId} on the schema 1 sprint `
                  + `${read.record.sprint_path}: only a completing residue is recoverable before migration, and this lease `
                  + `still belongs to ${read.record.execution_worktree ?? read.record.claimed_by.source_worktree}`;
              } else {
                const legacy = lookupLegacyTaskForReconcile({ ...source, taskId });
                if (!legacy.ok) {
                  canonicalError = legacy.error;
                } else {
                  canonicalStatus = legacy.row.status;
                  if (COMPLETED_ROW_STATUS_PATTERN.test(canonicalStatus)) {
                    deps.coordination.removeLease(taskId, read.record.claim_id);
                    action = 'cleared_completed_lease';
                  }
                }
              }
            } else if (schema !== null) {
              const lookup = lookupCanonicalTask(source, taskId);
              if (!lookup.ok) {
                canonicalError = lookup.error;
              } else {
                canonicalStatus = lookup.task.row.status;
                if (COMPLETED_ROW_STATUS_PATTERN.test(canonicalStatus)) {
                  deps.coordination.removeLease(taskId, read.record.claim_id);
                  action = 'cleared_completed_lease';
                }
              }
            }
          }
        }
      }

      return ok({
        task_id: taskId,
        classification: read.classification,
        unknown_reason: read.unknown_reason,
        record: read.record,
        canonical_status: canonicalStatus,
        canonical_error: canonicalError,
        action,
      });
    });
  } catch (error) {
    return operationalFailure(error);
  }
}

/** The live effect wiring; the verbs above never reach the filesystem directly. */
export function processSprintDependencies(cwd: string): SprintCommandDependencies {
  return {
    repoIdentity: resolveRepoIdentity(cwd),
    sourceWorktree: realpathSync(cwd),
    newClaimId: () => randomUUID(),
    coordination: {
      legacyCutoverRefusal: () => legacyCutoverRefusal(cwd),
      readCanonicalSprint: (source) => readCanonicalSprint(cwd, source),
      withTaskLock: (taskId, run) => withTaskLock(cwd, taskId, run),
      readLease: (taskId) => readLease(cwd, taskId),
      createLeaseDirectory: (taskId) => createLeaseDirectory(cwd, taskId),
      writeLeaseOwner: (taskId, record) => writeLeaseOwnerDurably(cwd, taskId, record),
      removeLease: (taskId, claimId) => removeLease(cwd, taskId, claimId),
      rollbackOwnLease: (taskId, claimId) => removeOwnLeaseAfterFailedClaim(cwd, taskId, claimId),
      findLeaseByClaimId: (claimId) => findLeaseByClaimId(cwd, claimId),
      writeClaimToken: (input) => writeClaimTokenForBoundLease(cwd, input),
      appendResumedReceipt: (worktree, unitRef) => {
        // The ledger is the execution worktree's own ignored runtime evidence,
        // which is the only ledger `evaluateAttemptStall` is ever pointed at
        // for this lease. The receipt reuses `buildAttemptReceipt` rather than
        // hand-building a line, so there stays exactly one definition of a
        // well-formed receipt.
        const built = buildAttemptReceipt({
          unitRef,
          outcome: 'resumed',
          recordedAt: new Date().toISOString(),
        });
        if (!built.ok) throw new Error(built.error);
        appendAttemptReceipt(worktree, built.receipt);
      },
    },
  };
}
