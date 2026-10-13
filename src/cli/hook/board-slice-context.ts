/**
 * The one renderer for the hook board slice, and the one resolver both hosts
 * call.
 *
 * Codex reaches this through `SubagentStart.context`'s `additionalContext`
 * array; Claude reaches it through `PreToolUse.subagent`'s `Task|Agent` prompt
 * appendix. Both take the string `renderBoardSlice()` returns and wrap it --
 * neither reformats, reorders, or abridges it -- so the marker block a spawned
 * agent reads is byte-identical across hosts. That equality is asserted in
 * `tests/board-slice.test.ts`; a second renderer would silently make the
 * assertion a tautology about two copies of the same bug.
 *
 * Everything here is advisory. The slice never blocks a spawn, never fails a
 * hook, and never carries a decision: resolution failure means no injection,
 * which is exactly what happens in a repository that runs no sprint at all.
 */
import { projectBoardSlice } from '../../core/state/project-board-slice';
import type { BoardSliceV1 } from '../../core/state/types';
import { findClaimTokenForActivePlan } from '../../effects/state/coordination-claim-token';
import {
  collectSliceInputs,
  resolveSliceOptions,
} from '../../effects/state/collect-slice-inputs';
import type { StateInputCollector } from '../../effects/loop/state-input-collector';

/** Idempotence marker; presence in a target string is authoritative. */
export const BOARD_SLICE_MARKER = '[repo-harness:board-slice]';

/**
 * Structural cap. Not a budget negotiated with anything else in the context:
 * `session-context-budget` orders SessionStart sections only. Two thousand bytes fits the
 * whole shape below with every peer line and leaves the receiving agent's
 * window essentially untouched.
 */
export const BOARD_SLICE_MAX_BYTES = 2000;

/** Peers beyond this are summarized as a count; the rest is one command away. */
const MAX_RENDERED_PEERS = 8;

const POINTER_LINE = 'progress/stall not computed here — repo-harness state board --json';

/** The two state facts a slice needs: the tree and its active plan marker. */
export type BoardSliceCollector = Pick<StateInputCollector, 'getRepoRoot' | 'getActivePlanMarker'>;

/** Short, stable prefix of a 64-hex task id; the full id stays in the actions. */
function shortId(taskId: string): string {
  return taskId.slice(0, 12);
}

function selfLines(slice: BoardSliceV1): string[] {
  const self = slice.self;
  if (self === null) {
    return ['self: no claim token in this tree — this unit is not sprint-bound'];
  }
  const lines = [
    `self: ${self.task} [${shortId(self.task_id)}]`,
    `  task_state=${self.task_state} lease_state=${self.lease_state}`,
  ];
  const claim = self.claim;
  if (claim !== null) {
    lines.push(`  claim=${claim.claim_id} generation=${claim.generation}`);
    lines.push(`  worktree=${claim.worktree ?? '(unbound)'} branch=${claim.branch ?? '(unbound)'}`);
  }
  const flags = Object.entries({
    definition_drift: self.diagnostics.definition_drift,
    target_ref_mismatch: self.diagnostics.target_ref_mismatch,
    worktree_missing: self.diagnostics.worktree_missing,
    orphan_reclaimable: self.diagnostics.orphan_reclaimable,
    lease_cleanup_required: self.diagnostics.lease_cleanup_required,
  })
    .filter(([, raised]) => raised)
    .map(([name]) => name);
  if (self.diagnostics.lease_unknown_reason !== null) {
    flags.push(`lease_unknown=${self.diagnostics.lease_unknown_reason}`);
  }
  if (flags.length > 0) lines.push(`  warnings: ${flags.join(' ')}`);
  for (const [verb, command] of [
    ['release', self.actions.release],
    ['steal', self.actions.steal],
    ['reconcile', self.actions.reconcile],
  ] as const) {
    if (command !== null) lines.push(`  ${verb}: ${command}`);
  }
  return lines;
}

function peerLines(slice: BoardSliceV1): string[] {
  if (slice.peers.length === 0) return ['peers: none holding a live lease'];
  const lines = [`peers (${slice.peers.length} holding a live lease):`];
  for (const peer of slice.peers.slice(0, MAX_RENDERED_PEERS)) {
    const worktree = peer.worktree ?? '(unbound)';
    const missing = peer.worktree_present ? '' : ' worktree_missing';
    lines.push(`  - ${peer.task} [${shortId(peer.task_id)}] ${peer.lease_state} ${worktree}${missing}`);
  }
  if (slice.peers.length > MAX_RENDERED_PEERS) {
    lines.push(`  +${slice.peers.length - MAX_RENDERED_PEERS} more`);
  }
  return lines;
}

/**
 * Truncate to a byte budget on a UTF-8 boundary. Reached only by a
 * pathological sprint (very long task cells).
 */
function capBytes(text: string, budget: number): string {
  const encoded = Buffer.from(text, 'utf-8');
  if (encoded.byteLength <= budget) return text;
  let end = budget;
  // Never split a multi-byte sequence: back off over continuation bytes.
  while (end > 0 && (encoded[end]! & 0xc0) === 0x80) end -= 1;
  return encoded.subarray(0, end).toString('utf-8');
}

/**
 * One slice -> one block, never longer than `BOARD_SLICE_MAX_BYTES`.
 * Deterministic: identical input bytes yield identical output bytes, with no
 * clock, no environment, and no host discrimination.
 *
 * Truncation degrades the tail, in two ordered stages: whole lines are dropped
 * from the end first, then whatever remains is byte-capped. The marker, the
 * header, and `self` are emitted first and are therefore the last to go -- an
 * agent that loses its peer list still learns what it holds. The pointer line
 * survives unconditionally because it is what makes every structural absence
 * in this document recoverable.
 */
export function renderBoardSlice(slice: BoardSliceV1): string {
  const lines = [
    `${BOARD_SLICE_MARKER} sprint ${slice.sprint_path} @ ${slice.canonical_target.ref}`,
    ...selfLines(slice),
    ...peerLines(slice),
  ];
  const suffix = `\n${POINTER_LINE}`;
  const budget = BOARD_SLICE_MAX_BYTES - Buffer.byteLength(suffix, 'utf-8');
  while (lines.length > 1 && Buffer.byteLength(lines.join('\n'), 'utf-8') > budget) {
    lines.pop();
  }
  return `${capBytes(lines.join('\n'), budget)}${suffix}`;
}

/**
 * Resolve one slice for the current tree, or null when there is nothing to
 * say. Null on every one of: no active sprint, no coordination state, and a
 * slice whose `self` and `peers` are both empty -- injecting a block that
 * reports nothing would be noise in every repository that does not run a
 * sprint.
 *
 * Callers wrap this in their own try/catch. It is kept throwing rather than
 * swallowing internally so the `PreToolUse.edit` gate, whose failure semantics
 * differ from a spawn advisory's, can decide for itself.
 */
export function resolveBoardSlice(collector: BoardSliceCollector): BoardSliceV1 | null {
  const repoRoot = collector.getRepoRoot();
  const options = resolveSliceOptions(repoRoot);
  if (options === null) return null;
  const token = findClaimTokenForActivePlan(repoRoot, collector.getActivePlanMarker());
  const collection = collectSliceInputs(repoRoot, options);
  const slice = projectBoardSlice({
    canonical_target: collection.canonical_target,
    sprint_path: collection.sprint_path,
    // An ambiguous token names no single row, so the slice reports no self
    // rather than picking one. The `PreToolUse.edit` gate treats the same
    // ambiguity as a refusal; a spawn advisory has nothing to refuse.
    self_task_id: token.outcome === 'found' ? token.token.task_id : null,
    tasks: collection.tasks,
  });
  return slice.self === null && slice.peers.length === 0 ? null : slice;
}

/**
 * The rendered block, or null. Total: any failure -- unreadable policy, a
 * canonical ref that does not resolve, a sprint file that left the ref -- is
 * absence of advice, never a failed hook.
 */
export function resolveBoardSliceBlock(collector: BoardSliceCollector): string | null {
  try {
    const slice = resolveBoardSlice(collector);
    return slice === null ? null : renderBoardSlice(slice);
  } catch {
    return null;
  }
}
