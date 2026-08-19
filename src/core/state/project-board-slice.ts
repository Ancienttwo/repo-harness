/**
 * Pure hook slice projection: collected slice inputs -> one `BoardSliceV1`.
 *
 * Zero IO, zero clock, zero randomness -- the same contract
 * `src/core/state/project-board.ts` holds, and for a sharper reason here: the
 * same slice is rendered into a Codex `SubagentStart.context` payload and into
 * a Claude `PreToolUse.subagent` prompt appendix, and the two are asserted
 * byte-equal. A projection that could vary on its own would make that
 * assertion vacuous.
 *
 * This module derives NOTHING itself. Every ownership decision -- task state,
 * diagnostics, offered actions, the projected claim -- is imported from
 * `project-board.ts`, because a slice that classified a lease differently from
 * `repo-harness state board --json` would be a second, quieter authority
 * telling an agent it owns work the board says it does not. The only decisions
 * that live here are which row is `self`, which rows are peers, and their
 * order.
 *
 * What the slice structurally omits (`progress_state`, `column`, every
 * conflict field) and why is documented on `BoardSliceV1` in `./types`.
 */
import {
  ACTIVE_LEASE_STATES,
  deriveActions,
  deriveClaim,
  deriveColumn,
  deriveOwnershipDiagnostics,
  deriveTaskState,
  type BoardOwnershipInput,
} from './project-board';
import type {
  BoardCanonicalTargetV1,
  BoardSlicePeerV1,
  BoardSliceSelfV1,
  BoardSliceV1,
} from './types';

/** Slice document protocol; independent of `BOARD_PROTOCOL`. */
export const BOARD_SLICE_PROTOCOL = 1;

export interface BoardSliceInputsV1 {
  readonly canonical_target: BoardCanonicalTargetV1;
  readonly sprint_path: string;
  /**
   * The task id the current tree's claim token names, or null when it holds
   * none (or holds an ambiguous set). Null is not an error here: a tree with
   * no claim still learns who its peers are, which is the whole value of the
   * spawn-time injection.
   */
  readonly self_task_id: string | null;
  /** Every canonical row of the sprint, in file order. */
  readonly tasks: readonly BoardOwnershipInput[];
}

function projectSelf(
  task: BoardOwnershipInput,
  canonicalRef: string,
): BoardSliceSelfV1 {
  const lease = task.lease.classification;
  const state = deriveTaskState(task);
  const diagnostics = deriveOwnershipDiagnostics(task, state, lease, canonicalRef);
  // `not_observed` is the honest progress value for a projection that never
  // reads a ledger. The resulting column decides only which actions are
  // offered; it is deliberately never published (see `BoardSliceV1`).
  const column = deriveColumn(state, lease, 'not_observed', diagnostics);
  return {
    task_id: task.task_id,
    task_revision: task.task_revision,
    task: task.row?.task ?? '',
    plan: task.row?.plan ?? '',
    task_state: state,
    lease_state: lease,
    claim: deriveClaim(task.lease.record),
    diagnostics,
    actions: deriveActions(task, lease, column, diagnostics, canonicalRef),
  };
}

function projectPeer(task: BoardOwnershipInput): BoardSlicePeerV1 {
  const record = task.lease.record;
  return {
    task_id: task.task_id,
    task: task.row?.task ?? '',
    lease_state: task.lease.classification,
    worktree: record?.execution_worktree ?? null,
    branch: record?.branch ?? null,
    // A lease with no execution worktree yet (`reserving`) has nothing for git
    // to have lost, so it reports present rather than inventing an orphan.
    worktree_present: task.worktree_present !== false,
  };
}

/**
 * Peers are the rows with a live lease other than `self`, ordered by `task_id`
 * so two hosts injecting the same repository state emit the same bytes. File
 * order is the board's ordering because the sprint file asserts it; here the
 * set is a filtered subset that the renderer additionally truncates, and a
 * truncation over an order the caller cannot reproduce is not deterministic
 * from the consumer's side.
 *
 * A `released` or `unknown` lease is not a peer: it names no live owner to
 * coordinate with, and reporting it as one would tell a spawned agent someone
 * is working on a row nobody holds. Those shapes stay visible where they are
 * actionable -- on `self.diagnostics` when it is this tree's own row, and on
 * the full board otherwise.
 */
export function projectBoardSlice(inputs: BoardSliceInputsV1): BoardSliceV1 {
  const canonicalRef = inputs.canonical_target.ref;
  const selfTask = inputs.self_task_id === null
    ? null
    : inputs.tasks.find((task) => task.task_id === inputs.self_task_id) ?? null;
  const peers = inputs.tasks
    .filter((task) => (
      task.task_id !== selfTask?.task_id
      && ACTIVE_LEASE_STATES.has(task.lease.classification)
    ))
    .map(projectPeer)
    .sort((left, right) => (
      left.task_id < right.task_id ? -1 : left.task_id > right.task_id ? 1 : 0
    ));
  return {
    protocol: BOARD_SLICE_PROTOCOL,
    kind: 'repo-harness-board-slice',
    canonical_target: inputs.canonical_target,
    sprint_path: inputs.sprint_path,
    self: selfTask === null ? null : projectSelf(selfTask, canonicalRef),
    peers,
  };
}
