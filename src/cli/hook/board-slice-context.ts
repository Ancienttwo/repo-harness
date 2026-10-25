import type { OperatorTaskSessions } from '../../core/operator/task-sessions';
import type { ProviderBoardV2 } from '../../core/state/provider-board';
import { collectSliceInputs } from '../../effects/state/collect-slice-inputs';
import type { StateInputCollector } from '../../effects/loop/state-input-collector';

export const BOARD_SLICE_MARKER = '[repo-harness:board-slice]';
export const BOARD_SLICE_MAX_BYTES = 2000;
const MAX_RENDERED_PEERS = 8;
const POINTER_LINE = 'progress/stall not computed here — repo-harness state board --json';
export type BoardSliceCollector = Pick<StateInputCollector, 'getRepoRoot' | 'getActivePlanMarker'> & {
  /** Trusted in-process runtime snapshot, already admitted outside the hook. */
  readonly getAdmittedTaskSessions?: () => OperatorTaskSessions;
  readonly getSelfSessionBinding?: () => string | null;
};
export interface ProviderBoardSliceV2 {
  readonly protocol: 2;
  readonly kind: 'repo-harness-board-slice';
  readonly board: ProviderBoardV2;
  readonly self_session_binding_sha256: string | null;
}
function capBytes(text: string, budget: number): string {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= budget) return text;
  let end = budget;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8');
}
/** Same deterministic advisory bytes for both hosts. Provider state never grants ownership. */
export function renderBoardSlice(slice: ProviderBoardSliceV2): string {
  const self = slice.self_session_binding_sha256 === null ? undefined : slice.board.cards.flatMap(card => card.sessions)
    .find(session => session.selector.session_binding_sha256 === slice.self_session_binding_sha256);
  const lines = [`${BOARD_SLICE_MARKER} provider issues (${slice.board.source_status})`,
    self ? `self: ${self.selector.task} claim=${self.selector.claim_ref} revision=${self.selector.claim_revision}` : 'self: unobserved — no exact admitted runtime session supplied'];
  for (const card of slice.board.cards.slice(0, MAX_RENDERED_PEERS)) {
    lines.push(`  - ${card.issue?.title ?? card.provider_issue_id} [${card.provider_repository_id}/${card.provider_issue_id}] state=${card.issue_status === 'observed' ? card.issue!.state : 'unavailable'} execution=${card.execution_status}`);
    for (const session of card.sessions) lines.push(`    session=${session.selector.task} role=${session.selector.role} branch=${session.branch} claim=${session.selector.claim_ref}`);
  }
  if (slice.board.cards.length > MAX_RENDERED_PEERS) lines.push(`  +${slice.board.cards.length - MAX_RENDERED_PEERS} more`);
  const suffix = `\n${POINTER_LINE}`;
  const budget = BOARD_SLICE_MAX_BYTES - Buffer.byteLength(suffix);
  while (lines.length > 2 && Buffer.byteLength(lines.join('\n')) > budget) lines.pop();
  return capBytes(lines.join('\n'), budget) + suffix;
}
export function resolveBoardSlice(collector: BoardSliceCollector): ProviderBoardSliceV2 | null {
  const board = collectSliceInputs(collector.getRepoRoot(), { sessions: collector.getAdmittedTaskSessions?.() });
  if (board === null) return null;
  const requestedSelf = collector.getSelfSessionBinding?.() ?? null;
  const matches = board.cards.flatMap(card => card.sessions).filter(session => session.selector.session_binding_sha256 === requestedSelf);
  return { protocol: 2, kind: 'repo-harness-board-slice', board,
    self_session_binding_sha256: matches.length === 1 ? requestedSelf : null };
}
export function resolveBoardSliceBlock(collector: BoardSliceCollector): string | null {
  try { const slice = resolveBoardSlice(collector); return slice === null ? null : renderBoardSlice(slice); }
  catch { return null; }
}
