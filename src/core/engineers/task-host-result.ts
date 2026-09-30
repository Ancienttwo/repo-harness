/** Versioned, pure projections of protected provider completion events. */
export interface TaskHostAdapter { kind: string; version: string }
export interface TaskHostProjection { value: unknown; provider_session_ref: string }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('task_host_event_invalid');
  return value as Record<string, unknown>;
}
export function extractTaskHostEvent(adapter: TaskHostAdapter, raw: string): TaskHostProjection {
  if (adapter.kind !== 'claude-stream-json' || adapter.version !== '1') throw new Error('task_host_adapter_unsupported');
  const event = record(JSON.parse(raw));
  if (event.type !== 'result' || event.subtype !== 'success' || event.is_error !== false
    || typeof event.session_id !== 'string' || !event.session_id || !Object.hasOwn(event, 'structured_output')) {
    throw new Error('task_host_event_invalid');
  }
  return { value: event.structured_output, provider_session_ref: event.session_id };
}
