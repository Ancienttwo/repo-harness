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

export const OPERATOR_SESSION_FINALIZATION_ROUTE = /^\/api\/v1\/sessions\/([0-9a-f]{32})\/finalization$/u;
/** Capability of the installed production adapter, not a persisted lifecycle fact. */
export const DOC_SESSION_FINALIZE_BLOCKER = 'quiescence_unavailable' as const;
export interface DocSessionFinalizationView {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session_finalization_state';
  readonly session_id: string;
  readonly availability: { readonly state: 'blocked'; readonly code: typeof DOC_SESSION_FINALIZE_BLOCKER };
  readonly progress: JsonValue | null;
}
export function decodeDocSessionFinalizationView(value: unknown, request: { readonly session_id: string }): DocSessionFinalizationView {
  const view = object(value);
  keys(view, ['protocol', 'kind', 'session_id', 'availability', 'progress']);
  const availability = object(view.availability); keys(availability, ['state', 'code']);
  if (!/^[0-9a-f]{32}$/u.test(request.session_id) || view.protocol !== 1 || view.kind !== 'operator_docs_session_finalization_state'
    || view.session_id !== request.session_id || availability.state !== 'blocked' || availability.code !== DOC_SESSION_FINALIZE_BLOCKER) throw new Error('finalization view identity');
  if (view.progress !== null) {
    const progress = object(view.progress);
    if (progress.operation !== 'commit' && progress.operation !== 'discard') throw new Error('finalization progress operation');
    decodeDocSessionFinalizeResponse({ status: 200, body: progress }, progress.operation);
  }
  return view as unknown as DocSessionFinalizationView;
}
