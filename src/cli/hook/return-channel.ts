/**
 * PreToolUse.subagent: stamp the delivery contract and standing orders onto a
 * Claude Agent spawn prompt. The runtime decides which hosts run this route.
 */

import type { StateInputCollector } from '../../effects/loop/state-input-collector';
import type { HookHandlerResult } from './handler-contract';
import { payloadString, payloadValue, type HookPayload } from './hook-input';
import { appendStandingOrders } from './standing-orders-context';

export interface ReturnChannelInput {
  readonly collector: Pick<StateInputCollector, 'getRepoRoot'>;
  readonly payload: HookPayload;
}

const RETURN_CONTRACT_MARKER = '[repo-harness:return-channel]';
const RETURN_CONTRACT_TEXT = '[repo-harness:return-channel] Your final text message is the only channel returned to your caller. Put the complete findings/report in final text. Do not call SendUserMessage for report delivery; content sent through SendUserMessage is delivered outside the Agent tool result.';

const NO_OUTPUT: HookHandlerResult = { exitCode: 0 };

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
    : `${prompt}\n\n${RETURN_CONTRACT_TEXT}`;
  const updatedPrompt = appendStandingOrders(input.collector.getRepoRoot(), withContract);
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
