/**
 * PreToolUse.subagent: stamp the delivery contract, standing orders and board slice onto a
 * Claude Agent spawn prompt. The runtime decides which hosts run this route.
 */

import { BOARD_SLICE_MARKER, resolveBoardSliceBlock, type BoardSliceCollector } from './board-slice-context';
import type { HookHandlerResult } from './handler-contract';
import { payloadString, payloadValue, type HookPayload } from './hook-input';
import { resolveStandingOrdersBlock, STANDING_ORDERS_MARKER } from './standing-orders-context';

export interface ReturnChannelInput {
  readonly collector: BoardSliceCollector;
  readonly payload: HookPayload;
}

const RETURN_CONTRACT_MARKER = '[repo-harness:return-channel]';
const RETURN_CONTRACT_TEXT = '[repo-harness:return-channel] Your final text message is the only channel returned to your caller. Put the complete findings/report in final text. Do not call SendUserMessage for report delivery; content sent through SendUserMessage is delivered outside the Agent tool result.';

const NO_OUTPUT: HookHandlerResult = { exitCode: 0 };

/**
 * Append the read-only board slice once. Advisory in every direction: a
 * resolution failure means no block, and an already-present marker means no
 * second block.
 */
function appendBoardSlice(collector: BoardSliceCollector, prompt: string): string {
  if (prompt.includes(BOARD_SLICE_MARKER)) return prompt;
  const block = resolveBoardSliceBlock(collector);
  return block === null ? prompt : `${prompt}\n\n${block}`;
}

/** Insert only at a block boundary. Keep inline marker references intact. */
function insertBeforeBoardSlice(prompt: string, block: string): string {
  if (prompt.startsWith(BOARD_SLICE_MARKER)) return `${block}\n\n${prompt}`;
  const boardStart = prompt.indexOf(`\n\n${BOARD_SLICE_MARKER}`);
  return boardStart < 0
    ? `${prompt}\n\n${block}`
    : `${prompt.slice(0, boardStart)}\n\n${block}${prompt.slice(boardStart)}`;
}

/** Keep new orders before a board slice that the parent already supplied. */
function insertStandingOrders(repoRoot: string, prompt: string): string {
  if (prompt.includes(STANDING_ORDERS_MARKER)) return prompt;
  const block = resolveStandingOrdersBlock(repoRoot);
  return block === null ? prompt : insertBeforeBoardSlice(prompt, block);
}

/**
 * Each appendix has its own marker. A repeated spawn can receive a missing
 * appendix. Emit the envelope whenever an appendix changes the prompt.
 */
export function runReturnChannel(input: ReturnChannelInput): HookHandlerResult {
  const toolName = payloadString(input.payload, 'tool_name');
  if (toolName !== 'Agent') return NO_OUTPUT;
  const toolInput = payloadValue(input.payload, 'tool_input');
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) return NO_OUTPUT;
  const prompt = (toolInput as Readonly<Record<string, unknown>>).prompt;
  if (typeof prompt !== 'string') return NO_OUTPUT;
  const withContract = prompt.includes(RETURN_CONTRACT_MARKER)
    ? prompt
    : insertBeforeBoardSlice(prompt, RETURN_CONTRACT_TEXT);
  const withOrders = insertStandingOrders(input.collector.getRepoRoot(), withContract);
  const updatedPrompt = appendBoardSlice(input.collector, withOrders);
  if (updatedPrompt === prompt) return NO_OUTPUT;
  return {
    exitCode: 0,
    permission: {
      decision: 'allow',
      reason: 'subagent-return-channel-guard: delivery contract appended to spawn prompt',
      updatedInput: { ...(toolInput as Readonly<Record<string, unknown>>), prompt: updatedPrompt },
    },
  };
}
