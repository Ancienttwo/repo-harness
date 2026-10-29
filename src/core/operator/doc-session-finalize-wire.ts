import type { JsonValue } from '../evidence/types';
import { isRepositoryRelativePath } from './doc-session-events';

export const OPERATOR_SESSION_COMMIT_ROUTE = /^\/api\/v1\/sessions\/([0-9a-f]{32})\/commit$/u;
export const OPERATOR_SESSION_DISCARD_ROUTE = /^\/api\/v1\/sessions\/([0-9a-f]{32})\/discard$/u;
export type DocSessionFinalizeAction = 'commit' | 'discard';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('finalize response object');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  if (required.some(key => !(key in value)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw new Error('finalize response fields');
}
function errorBody(value: unknown): JsonValue {
  const error = object(value);
  keys(error, ['code', 'message', 'next_action'], ['files']);
  if (typeof error.code !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(error.code)
    || typeof error.message !== 'string' || error.message.length > 1000
    || typeof error.next_action !== 'string' || error.next_action.length > 2000) throw new Error('finalize response error');
  if (error.files !== undefined && (!Array.isArray(error.files) || error.files.length > 1000 || !error.files.every(isRepositoryRelativePath))) throw new Error('finalize response paths');
  return error as JsonValue;
}

/** Reject private journal fields and malformed or mismatched child output. */
export function decodeDocSessionFinalizeResponse(value: unknown, action: DocSessionFinalizeAction): { status: number; body: JsonValue } {
  const response = object(value);
  keys(response, ['status', 'body']);
  if (typeof response.status !== 'number' || ![200, 404, 409, 413, 422, 503].includes(response.status)) throw new Error('finalize response status');
  const body = object(response.body);
  if (Object.keys(body).length === 1 && 'error' in body) {
    if (response.status === 200) throw new Error('finalize error success');
    return { status: response.status, body: { error: errorBody(body.error) } };
  }
  keys(body, ['protocol', 'kind', 'operation', 'stage', ...(action === 'commit' ? ['commit', 'pushed', 'pr'] : [])], ['error']);
  if (body.protocol !== 1 || body.kind !== 'operator_docs_session_finalize' || body.operation !== action
    || typeof body.stage !== 'string' || !(action === 'commit' ? ['prepared', 'committed', 'pushed', 'creating_pr', 'pr_failed', 'complete'] : ['removing', 'removed', 'complete']).includes(body.stage)) throw new Error('finalize response identity');
  if (action === 'commit') {
    if (typeof body.commit !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(body.commit)
      || body.pushed !== ['pushed', 'creating_pr', 'pr_failed', 'complete'].includes(body.stage)) throw new Error('finalize response commit');
    if (body.pr !== null) {
      const pr = object(body.pr); keys(pr, ['number', 'url']);
      if (typeof pr.number !== 'number' || !Number.isSafeInteger(pr.number) || pr.number < 1 || typeof pr.url !== 'string'
        || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/u.test(pr.url)
        || !pr.url.endsWith(`/pull/${pr.number}`)) throw new Error('finalize response pr');
    }
    if ((body.stage === 'complete') !== (body.pr !== null)) throw new Error('finalize response completion');
  }
  if (body.error !== undefined) errorBody(body.error);
  if ((response.status === 200) !== (body.error === undefined) || ![200, 503].includes(response.status)) throw new Error('finalize response outcome');
  return { status: response.status, body: body as JsonValue };
}
