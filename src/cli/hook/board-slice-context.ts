import type { ProviderBoardV2 } from '../../core/state/provider-board';
import { collectSliceInputs } from '../../effects/state/collect-slice-inputs';
import type { StateInputCollector } from '../../effects/loop/state-input-collector';

export const BOARD_SLICE_MARKER = '[repo-harness:board-slice]';
export const BOARD_SLICE_MAX_BYTES = 2000;
const MAX_RENDERED_PEERS = 8;
export type BoardSliceCollector = Pick<StateInputCollector, 'getRepoRoot'>;
export interface ProviderBoardSliceV2 {
  readonly protocol: 2;
  readonly kind: 'repo-harness-board-slice';
  readonly board: ProviderBoardV2;
}
function capBytes(text: string, budget: number): string {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= budget) return text;
  let end = budget;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8');
}
/**
 * Same deterministic advisory bytes for both hosts. Provider state never grants ownership.
 * Provider-authored text (title, body) goes into agent prompts, so only the issue
 * reference, state and execution status render.
 */
export function renderBoardSlice(slice: ProviderBoardSliceV2): string {
  const lines = [`${BOARD_SLICE_MARKER} provider issues (${slice.board.source_status})`];
  for (const card of slice.board.cards.slice(0, MAX_RENDERED_PEERS)) {
    lines.push(`  - [${card.provider_repository_id}/${card.provider_issue_id}] state=${card.issue_status === 'observed' ? card.issue!.state : 'unavailable'} execution=${card.execution_status}`);
  }
  if (slice.board.cards.length > MAX_RENDERED_PEERS) lines.push(`  +${slice.board.cards.length - MAX_RENDERED_PEERS} more`);
  const suffix = `\nprogress/stall not computed here — repo-harness state board --repository-id ${slice.board.registered_repository_id} --json`;
  const budget = BOARD_SLICE_MAX_BYTES - Buffer.byteLength(suffix);
  while (lines.length > 1 && Buffer.byteLength(lines.join('\n')) > budget) lines.pop();
  return capBytes(lines.join('\n'), budget) + suffix;
}
export function resolveBoardSlice(collector: BoardSliceCollector): ProviderBoardSliceV2 | null {
  const board = collectSliceInputs(collector.getRepoRoot());
  return board === null ? null : { protocol: 2, kind: 'repo-harness-board-slice', board };
}
export function resolveBoardSliceBlock(collector: BoardSliceCollector): string | null {
  try { const slice = resolveBoardSlice(collector); return slice === null ? null : renderBoardSlice(slice); }
  catch { return null; }
}
