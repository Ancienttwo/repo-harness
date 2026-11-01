import { z } from 'zod';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { GUARD_DENIED_ERROR_CODE, GUARD_DENIALS_KEY, type GuardDenial } from './protocol';

/**
 * Session projection of the calls this plugin denied.
 *
 * The plugin writes no session event of its own: DSH refuses to load a log
 * that holds an unknown event type without the `ignorable` marker, and
 * `appendPluginRecord` is reserved for DSH's own experimental packages. A
 * denial already reaches the log as a `tool/result` whose `error` carries the
 * plugin's `info`, and the tool name comes from the matching `tool/call`.
 * Both are DSH event types, so a session stays loadable after the plugin is
 * disabled or removed.
 *
 * Nested PTC calls report through `tool/ptc-dispatch`, not `tool/result`, so
 * this projection lists root calls only.
 */

export interface GuardDenialsState {
  /** Tool names of calls that have no result yet, by call id. */
  readonly pending: Readonly<Record<string, string>>;
  readonly denials: readonly GuardDenial[];
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    'repo-harness-guard-denials': GuardDenialsState;
  }
  interface SessionProjectionMap {
    /** Calls the repo-harness guard denied in this session, oldest first. */
    'repo-harness-guard-denials': readonly GuardDenial[];
  }
}

const denialSchema = z.object({
  call_id: z.string(),
  tool: z.string().nullable(),
  reason: z.string().nullable(),
}).strict();
const denialsSchema = z.array(denialSchema).readonly();
const stateSchema = z.object({
  pending: z.record(z.string(), z.string()).readonly(),
  denials: denialsSchema,
}).strict().readonly();

const EMPTY: GuardDenialsState = Object.freeze({ pending: Object.freeze({}), denials: Object.freeze([]) });

export function foldGuardDenials(state: GuardDenialsState, event: SessionEvent): GuardDenialsState {
  if (event.type === 'tool/call') {
    return { ...state, pending: { ...state.pending, [String(event.data.callId)]: event.data.name } };
  }
  if (event.type !== 'tool/result') return state;
  const callId = String(event.data.message.toolCallId);
  const error = event.data.error;
  const denied = error?.code === GUARD_DENIED_ERROR_CODE;
  if (!denied && !Object.hasOwn(state.pending, callId)) return state;
  const { [callId]: tool, ...pending } = state.pending;
  if (!denied) return { ...state, pending };
  return {
    pending,
    denials: [...state.denials, { call_id: callId, tool: tool ?? null, reason: error.reason ?? null }],
  };
}

export const guardDenialsProjection = {
  key: GUARD_DENIALS_KEY,
  stateSchema,
  stateVersion: 1,
  init: () => EMPTY,
  apply: foldGuardDenials,
  wire: {
    viewSchema: denialsSchema,
    // The array keeps its reference until a denial lands, so other events publish nothing.
    view: (state: GuardDenialsState) => state.denials,
  },
} satisfies ProjectionDefinition<typeof GUARD_DENIALS_KEY>;
