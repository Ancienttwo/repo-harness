/**
 * Every side effect the hook slice performs, in one place.
 *
 * Four reads, and nothing else:
 *
 * 1. the active-sprint marker plus the canonical target ref from policy,
 * 2. the canonical sprint at that ref (`git show <commit>:<path>`, 14.3ms),
 * 3. this sprint's leases on the shared plane (~0.1ms each),
 * 4. `git worktree list --porcelain` (6.9ms).
 *
 * ## What is deliberately NOT read
 *
 * - `resolveEffectiveStateReadOnly`. It costs ~100ms per owner worktree and is
 *   what makes the full board 644-1288ms. `PreToolUse.edit` fires roughly
 *   2,141 times a year at a measured p50 of 256.2ms; paying a second Effective
 *   State resolution per owner would not be a slower hook, it would be a
 *   different product. The slice therefore has no progress dimension at all --
 *   not a degraded one.
 * - Attempt ledgers, in any form. `evaluateAttemptStall` is the repository's
 *   only stall rule and it consumes a ledger plus the owner's envelope-scoped
 *   `progress_token`; without the second input a ledger read could only
 *   produce a weaker stall rule, which is a shadow of an existing authority.
 *   `stalled` is absent from the slice for exactly this reason.
 *
 * Both prohibitions are structural, not stylistic: the slice's output type has
 * no field either read could fill, so a future caller cannot quietly reinstate
 * them "just for one field".
 *
 * There is no caching and no A/B round. A cached slice is a strictly worse
 * stale read than a fresh one -- it lacks even the `changed_during_read`
 * signal the board publishes -- and the real authority re-reads the lease
 * under its own task lock inside `finish`. This collector observes; it never
 * decides.
 */
import { projectCanonicalTasks } from '../../core/state/coordination-identity';
import type { BoardOwnershipInput } from '../../core/state/project-board';
import type { BoardCanonicalTargetV1 } from '../../core/state/types';
import { readWorktreeTopology } from '../git/worktree-topology';
import {
  readActiveSprintPath,
  readCanonicalTargetRef,
} from './collect-board-inputs';
import { safeRealpath } from './collect-state-inputs';
import {
  readCanonicalSprint,
  resolveRepoIdentity,
} from './coordination-canonical-source';
import { readLease } from './coordination-lease-store';

export interface SliceCollectionOptions {
  readonly sprintPath: string;
  readonly targetRef: string;
}

export interface SliceCollection {
  readonly canonical_target: BoardCanonicalTargetV1;
  readonly sprint_path: string;
  readonly tasks: readonly BoardOwnershipInput[];
}

/**
 * One observation of every slice input. Enumerates from canonical rows, like
 * the board does, so another sprint's lease residue cannot appear here as this
 * sprint's anomaly.
 */
export function collectSliceInputs(
  cwd: string,
  options: SliceCollectionOptions,
): SliceCollection {
  const canonical = readCanonicalSprint(cwd, {
    targetRef: options.targetRef,
    sprintPath: options.sprintPath,
  });
  if (!canonical.ok) throw new Error(canonical.error);

  const canonicalTasks = projectCanonicalTasks({
    repoIdentity: resolveRepoIdentity(cwd),
    sprintPath: options.sprintPath,
    sprintText: canonical.text,
  });

  const topologyPaths = new Set(
    readWorktreeTopology(cwd).worktrees.map((entry) => safeRealpath(entry.path)),
  );

  const tasks: BoardOwnershipInput[] = canonicalTasks.map((task) => {
    const lease = readLease(cwd, task.task_id);
    const ownerWorktree = lease.record?.execution_worktree ?? null;
    return {
      task_id: task.task_id,
      task_revision: task.task_revision,
      row: task.row,
      lease: {
        classification: lease.classification,
        unknown_reason: lease.unknown_reason,
        record: lease.record,
      },
      // Null, not false, when the lease names no worktree: nothing was
      // observed, which is a different fact from "git lost it".
      worktree_present: ownerWorktree === null
        ? null
        : topologyPaths.has(safeRealpath(ownerWorktree)),
    };
  });

  return {
    canonical_target: { ref: options.targetRef, oid: canonical.commit },
    sprint_path: options.sprintPath,
    tasks,
  };
}

/**
 * Resolve this repository's slice options, or null when it runs no sprint.
 * Absence of the active-sprint marker is the authority for "there is no
 * coordination here"; it is never an error, and every caller treats null as
 * "nothing to say" rather than as a failed read.
 */
export function resolveSliceOptions(cwd: string): SliceCollectionOptions | null {
  const sprintPath = readActiveSprintPath(cwd);
  if (sprintPath === null) return null;
  return { sprintPath, targetRef: readCanonicalTargetRef(cwd) };
}
