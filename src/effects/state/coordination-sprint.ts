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
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, rmdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildAttemptReceipt } from '../../core/state/attempt-ledger';
import type { CommandOutcome } from '../../core/state/command-outcome';
import {
  COMPLETED_ROW_STATUS_PATTERN,
  FIRST_LEASE_GENERATION,
  PENDING_ROW_STATUS,
  RELEASABLE_LEASE_STATES,
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
  type LeaseTransition,
  type PersistedLeaseState,
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
import { createWriteJournal, type JournalFileSystem } from './write-journal';
import {
  readClaimTokenForTask,
  removeClaimTokenForTask,
  writeClaimTokenForBoundLease,
  type ClaimTokenRead,
  type ClaimTokenV1,
  type ClaimTokenWriteInput,
} from './coordination-claim-token';
import { readText, repoPath } from './collect-state-inputs';
import {
  completeBacklogRow,
  SprintRowCompletionError,
} from '../../core/state/sprint-row-completion';
import {
  coordinationRoot,
  createLeaseDirectory,
  findLeaseByClaimId,
  readLease,
  removeLease,
  removeOwnLeaseAfterFailedClaim,
  withBacklogLock,
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
  /** The shared backlog lock, taken before any task lock. */
  readonly withBacklogLock: <T>(run: () => T) => T;
  /** True when this clone has a lease plane at all; false is "nothing owns anything here". */
  readonly leasesRootExists: () => boolean;
  /** The token this tree holds for one task id, addressed by identity. */
  readonly readClaimToken: (taskId: string) => ClaimTokenRead;
  readonly removeClaimToken: (taskId: string) => void;
  /** The working-tree sprint file the completion rewrites. */
  readonly readSprintFile: (repoRelativePath: string) => string | null;
  /** The absolute path the journal records, resolved through the repo guard. */
  readonly sprintFilePath: (repoRelativePath: string) => string;
  /** The journal's filesystem, so a completion rolls back like a migration. */
  readonly journalFs: JournalFileSystem;
  readonly now: () => Date;
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

export interface CompleteRowCommandOptions {
  /** Repo-relative sprint path; the working-tree file the row is rewritten in. */
  readonly sprint?: string;
  /** Backlog index or exact Task cell, resolved inside the locks. */
  readonly task?: string;
  /** Canonical ref the lease was claimed against. */
  readonly targetRef?: string;
  /** Replacement Plan cell, already rendered by the caller. */
  readonly planCell?: string;
  /** Contract finish owns its own release; its transaction ends at publication. */
  readonly deferLeaseRelease?: boolean;
}

/**
 * Complete one backlog row: the whole transaction, in one place.
 *
 * This verb exists because the transaction used to be split. `sprint-backlog.sh`
 * resolved the row, asked the CLI for an identity, compared a claim id and a
 * revision with its own line-oriented readers, rewrote the row with `awk`, and
 * then asked the CLI to release the lease -- four observations of shared state
 * across two processes, with windows between them and two different parsers for
 * the same owner record. A concurrent `steal` or `release` landing in any of
 * those windows produced a row marked `[x]` with no lease state that supports
 * it, which is the one outcome a completion may never produce.
 *
 * Everything now happens inside one boundary: the shared backlog lock, then the
 * row's task lock, in the same order every other multi-lock caller takes them.
 * Inside it the canonical row, the owner record and the claim token are read
 * once each, by their single parsers, and the row flip, the lease release and
 * the token removal either all happen or none do.
 *
 * The no-lease case runs through here too. A clone with no lease plane is the
 * zero-coordination single-agent flow, and its completion still takes the
 * backlog lock -- it just finds no token and no lease to check.
 */
export function completeRowSprintCommand(
  options: CompleteRowCommandOptions,
  deps: SprintCommandDependencies,
): CommandOutcome {
  const sprintPath = requireOption(options.sprint, '--sprint');
  if (isOutcome(sprintPath)) return sprintPath;
  const taskRef = requireOption(options.task, '--task');
  if (isOutcome(taskRef)) return taskRef;
  const targetRef = requireOption(options.targetRef, '--target-ref');
  if (isOutcome(targetRef)) return targetRef;

  const cutover = deps.coordination.legacyCutoverRefusal();
  if (cutover !== null) return refuse(cutover);

  try {
    return deps.coordination.withBacklogLock(() => {
      const sprintText = deps.coordination.readSprintFile(sprintPath);
      if (sprintText === null) return refuse(`sprint file is unreadable: ${sprintPath}`);

      // Resolution happens here, not in the caller: a row resolved before the
      // lock is a row that may have moved by the time it is rewritten.
      const resolved = resolveCanonicalTaskRef(
        { repoIdentity: deps.repoIdentity, sprintPath, sprintText },
        taskRef,
      );
      if (!resolved.ok) return refuse(`sprint-backlog: ${resolved.error}`);
      const row = resolved.task.row;
      const taskId = resolved.task.task_id;
      if (row.status !== PENDING_ROW_STATUS) {
        return refuse(`backlog task '${row.task}' (row ${row.index}) is already complete`);
      }

      return deps.coordination.withTaskLock(taskId, () => {
        // Re-read under the task lock: the backlog lock alone does not stop an
        // ownership verb, which locks per task rather than per backlog.
        const lockedText = deps.coordination.readSprintFile(sprintPath);
        if (lockedText === null) return refuse(`sprint file is unreadable: ${sprintPath}`);
        const lockedResolution = lookupCanonicalTask(
          { repoIdentity: deps.repoIdentity, sprintPath, sprintText: lockedText },
          taskId,
        );
        if (!lockedResolution.ok) return refuse(`sprint-backlog: ${lockedResolution.error}`);
        const lockedRow = lockedResolution.task.row;
        if (lockedRow.status !== PENDING_ROW_STATUS) {
          return refuse(`backlog task '${lockedRow.task}' (row ${lockedRow.index}) is already complete`);
        }

        const gate = completionLeaseGate(deps, {
          sprintPath,
          targetRef,
          taskId,
          taskCell: lockedRow.task,
          willRelease: options.deferLeaseRelease !== true,
        });
        if (isOutcome(gate)) return gate;

        let completion;
        try {
          completion = completeBacklogRow({
            sprintText: lockedText,
            rowIndex: lockedRow.index,
            // The projected row no longer carries `id`; the persisted identity
            // is `task_id`, which is the same datum read once.
            rowId: taskId,
            planCell: options.planCell ?? null,
            timestamp: formatSprintTimestamp(deps.coordination.now()),
          });
        } catch (error) {
          if (error instanceof SprintRowCompletionError) return refuse(`sprint-backlog: ${error.message}`);
          throw error;
        }
        // Every refusable step happens before the first write. The release
        // transition is pure, so computing it here turns "the lease cannot be
        // released" from a post-publication surprise into a refusal that leaves
        // the row pending.
        const releasing = gate !== null && options.deferLeaseRelease !== true;
        let transition: LeaseTransition | null = null;
        if (releasing) {
          const current = deps.coordination.readLease(taskId).record;
          if (current === null) {
            return refuse(`the lease for '${lockedRow.task}' disappeared before it could be released`);
          }
          if (current.claim_id !== gate!.claim_id) {
            return refuse(
              `backlog task '${lockedRow.task}' is claimed by ${current.claim_id}, but this completion gated on `
              + `${gate!.claim_id}; the claim moved, so this tree may not complete the row`,
            );
          }
          const computed = releaseLeaseRecord(current, gate!.claim_id);
          if (!computed.ok) return refuse(computed.error);
          transition = computed;
        }

        // Past this point the transaction commits: sprint bytes, then the lease
        // plane, then the token. Anything that still throws restores the sprint
        // through the same journal the migration uses, so a failure never leaves
        // a row published `[x]` on its own.
        const journal = createWriteJournal(deps.coordination.journalFs);
        let released: string | null = null;
        try {
          journal.writeTracked(deps.coordination.sprintFilePath(sprintPath), completion.sprintText);
          if (transition !== null) {
            deps.coordination.writeLeaseOwner(taskId, transition.record);
            deps.coordination.removeLease(taskId, gate!.claim_id);
            deps.coordination.removeClaimToken(taskId);
            released = gate!.claim_id;
          }
        } catch (error) {
          try {
            journal.restore();
          } catch (restoreError) {
            throw new Error(
              `sprint complete-row failed and could not restore ${sprintPath}: `
              + `${restoreError instanceof Error ? restoreError.message : String(restoreError)} `
              + `(original failure: ${error instanceof Error ? error.message : String(error)})`,
              { cause: error },
            );
          }
          throw error;
        }

        return ok({
          task_id: taskId,
          sprint_path: sprintPath,
          row_index: completion.row.index,
          task: completion.row.task,
          plan_cell: completion.planCell,
          released_claim_id: released,
          done: completion.done,
          total: completion.total,
        });
      });
    });
  } catch (error) {
    return operationalFailure(error);
  }
}

/**
 * The lease half of the completion gate, inside the task lock.
 *
 * Returns the owner record when the row is owned and this tree may complete it,
 * `null` when nothing owns the row, and a refusal otherwise. Flipping a row to
 * `[x]` is the step that publishes "this task is done", so every refusal here
 * is a refusal to publish that on someone else's behalf.
 */
function completionLeaseGate(
  deps: SprintCommandDependencies,
  input: {
    readonly sprintPath: string;
    readonly targetRef: string;
    readonly taskId: string;
    readonly taskCell: string;
    /** True when this completion will release the lease itself. */
    readonly willRelease: boolean;
  },
): LeaseOwnerRecord | null | CommandOutcome {
  // No lease plane at all: its absence is the authority for "nothing owns
  // anything here", which is what keeps the single-agent flow unchanged.
  if (!deps.coordination.leasesRootExists()) return null;

  const lease = deps.coordination.readLease(input.taskId);
  if (lease.classification === 'available') return null;
  if (lease.classification === 'unknown' || lease.record === null) {
    return refuse(
      `the lease for '${input.taskCell}' cannot be classified (${lease.unknown_reason ?? 'no owner record'}); `
      + `run 'repo-harness sprint reconcile --task-id ${input.taskId} --target-ref ${input.targetRef}' before completing it`,
    );
  }
  const record = lease.record;

  // A lease this completion could not hand back must not pass the gate.
  // Without this the row was flipped to `[x]` first and `releaseLeaseRecord`
  // refused second, publishing "done" while the lease and token stayed live --
  // the exact half-applied state the transaction exists to prevent.
  //
  // What counts as acceptable depends on what this completion will actually do
  // with the lease. When it releases, the states are the release path's own,
  // imported rather than repeated so the gate cannot drift from what release
  // will accept. When the caller defers the release -- contract finish, whose
  // transaction ends at the publication commit -- `completing` is not a residue
  // to refuse but the exact window the closeout holds while it back-fills this
  // row, so it is accepted too. `reviewing` and `released` are refused either
  // way: the first belongs to publication recovery, the second to reconcile.
  const acceptableStates: readonly PersistedLeaseState[] = input.willRelease
    ? RELEASABLE_LEASE_STATES
    : [...RELEASABLE_LEASE_STATES, 'completing'];
  if (!acceptableStates.includes(record.state)) {
    const recovery = record.state === 'reviewing'
      ? `its publication is under review; finish or abandon it through the publication recovery verbs before completing the row`
      : `run 'repo-harness sprint reconcile --task-id ${input.taskId} --target-ref ${input.targetRef}' to clear it first`;
    const verb = input.willRelease ? 'released by a completion' : 'completed against';
    return refuse(
      `backlog task '${input.taskCell}' holds a lease in state ${record.state}, which cannot be `
      + `${verb} (only ${acceptableStates.join(' or ')} can); ${recovery}`,
    );
  }

  const token = deps.coordination.readClaimToken(input.taskId);
  if (token.outcome === 'ambiguous') {
    return refuse(
      `the claim token for '${input.taskCell}' is not readable as a single capability (${token.matches.join(', ')}); `
      + 'refusing to complete on an ambiguous token',
    );
  }
  if (token.outcome === 'none') {
    return refuse(
      `backlog task '${input.taskCell}' is claimed by ${record.claim_id} and this worktree holds no claim token for it; `
      + `complete it from the owning worktree, or take the claim over with 'repo-harness sprint steal `
      + `--expected-claim-id ${record.claim_id} --reason <reason> --session-id <id>'`,
    );
  }
  if (token.token.claim_id !== record.claim_id) {
    return refuse(
      `backlog task '${input.taskCell}' is claimed by ${record.claim_id}, but this worktree holds claim `
      + `${token.token.claim_id}; the claim moved, so this tree may not complete the row`,
    );
  }

  // The revision fence. Identity survives a Task title edit -- that is what the
  // persisted ID column is for -- but the definition does not: `task_revision`
  // hashes the Task, Mode and Acceptance cells, so a lease taken before the
  // edit was taken against a row that no longer exists.
  const canonical = deps.coordination.readCanonicalSprint({
    targetRef: input.targetRef,
    sprintPath: input.sprintPath,
  });
  if (!canonical.ok) return refuse(canonical.error);
  const canonicalTask = lookupCanonicalTask(
    { repoIdentity: deps.repoIdentity, sprintPath: input.sprintPath, sprintText: canonical.text },
    input.taskId,
  );
  if (!canonicalTask.ok) return refuse(canonicalTask.error);
  if (canonicalTask.task.task_revision !== record.task_revision) {
    return refuse(
      `backlog task '${input.taskCell}' drifted since it was claimed: canonical revision is `
      + `${canonicalTask.task.task_revision}, the claim observed ${record.task_revision}; release the stale claim `
      + `with 'repo-harness sprint release --claim-id ${record.claim_id}' and re-claim the row at the current `
      + `revision, or take it over explicitly with 'repo-harness sprint steal --expected-claim-id `
      + `${record.claim_id} --reason <reason> --session-id <id>'`,
    );
  }
  return record;
}

/**
 * `YYYY-MM-DD HH:MM` in local time, the format `date '+%Y-%m-%d %H:%M'` wrote
 * when the shell owned this rewrite. Sprint files already carry these stamps,
 * so the format is a compatibility surface, not a preference.
 */
function formatSprintTimestamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}`;
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
      withBacklogLock: (run) => withBacklogLock(cwd, run),
      leasesRootExists: () => existsSync(join(coordinationRoot(cwd), 'leases')),
      readClaimToken: (taskId) => readClaimTokenForTask(cwd, taskId),
      removeClaimToken: (taskId) => removeClaimTokenForTask(cwd, taskId),
      readSprintFile: (relativePath) => readText(cwd, relativePath),
      sprintFilePath: (relativePath) => repoPath(cwd, relativePath),
      journalFs: {
        exists: (path) => existsSync(path),
        readText: (path) => readFileSync(path, 'utf-8'),
        writeText: (path, text) => { writeFileSync(path, text, 'utf-8'); },
        makeDirectory: (path) => { mkdirSync(path, { recursive: true }); },
        removeFile: (path) => { rmSync(path, { force: true }); },
        removeDirectoryIfEmpty: (path) => {
          try {
            rmdirSync(path);
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'ENOTEMPTY' && code !== 'ENOENT' && code !== 'EEXIST') throw error;
          }
        },
      },
      now: () => new Date(),
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
