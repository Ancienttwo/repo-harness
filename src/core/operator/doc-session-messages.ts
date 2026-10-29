/** The only browser/CLI message schema. The host receives the same text and timing. */
export interface DocSessionMessageInput { readonly text: string; readonly when: 'after_turn' | 'now' }
export type DocSessionMessageResult = 'prompted' | 'queued' | 'steered' | 'steer_unsupported' | 'session_closed' | 'starting' | 'refused';
export const DOC_SESSION_MESSAGE_RESULTS: readonly DocSessionMessageResult[] = ['prompted', 'queued', 'steered', 'steer_unsupported', 'session_closed', 'starting', 'refused'];
export const OPERATOR_SESSION_MESSAGES_ROUTE = /^\/api\/v1\/sessions\/([0-9a-f]{32})\/messages$/u;
export const DOC_SESSION_MESSAGE_MAX_BYTES = 16_384;

export function decodeDocSessionMessage(value: unknown): DocSessionMessageInput {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('doc_session_message_invalid');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 2 || !Object.hasOwn(input, 'text') || !Object.hasOwn(input, 'when')
    || typeof input.text !== 'string' || input.text.trim().length === 0 || input.text.includes('\0')
    || new TextEncoder().encode(input.text).length > DOC_SESSION_MESSAGE_MAX_BYTES
    || (input.when !== 'after_turn' && input.when !== 'now')) throw new Error('doc_session_message_invalid');
  return { text: input.text, when: input.when };
}
