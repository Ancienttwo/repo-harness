import type { JsonValue } from '../evidence/types';

export const OPERATOR_SESSION_FINALIZATION_ROUTE = /^\/api\/v1\/sessions\/([0-9a-f]{32})\/finalization$/u;
export const DOC_SESSION_FINALIZATION_FAILURES = ['session_not_found', 'events_unavailable', 'too_large', 'unavailable'] as const;
export interface DocSessionFinalizationView {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session_finalization_state';
  readonly session_id: string;
  /** Saved journal progress, not live capability or proof of an audited outcome. */
  readonly progress: JsonValue | null;
}

function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== fields.sort().join(',')) throw new Error('finalization fields');
  return value as Record<string, unknown>;
}

/** Closed read egress. Never serialize input, remote URL, message or step audit. */
export function decodeDocSessionFinalizationView(value: unknown, request: { readonly session_id: string }): DocSessionFinalizationView {
  const view = object(value, ['protocol', 'kind', 'session_id', 'progress']);
  if (!/^[0-9a-f]{32}$/u.test(request.session_id) || view.protocol !== 1
    || view.kind !== 'operator_docs_session_finalization_state' || view.session_id !== request.session_id) throw new Error('finalization identity');
  if (view.progress !== null) {
    const candidate = view.progress as Record<string, unknown>;
    const commit = candidate?.operation === 'commit';
    const progress = object(candidate, ['protocol', 'kind', 'operation', 'stage', ...(commit ? ['commit', 'pushed', 'pr'] : [])]);
    if (progress.protocol !== 1 || progress.kind !== 'operator_docs_session_finalize'
      || (!commit && progress.operation !== 'discard') || typeof progress.stage !== 'string'
      || !(commit ? ['prepared', 'committed', 'pushed', 'creating_pr', 'pr_failed', 'complete'] : ['removing', 'removed', 'complete']).includes(progress.stage)) throw new Error('finalization progress');
    if (commit) {
      if (typeof progress.commit !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(progress.commit)
        || progress.pushed !== ['pushed', 'creating_pr', 'pr_failed', 'complete'].includes(progress.stage)) throw new Error('finalization commit');
      if (progress.pr !== null) {
        const pr = object(progress.pr, ['number', 'url']);
        if (typeof pr.number !== 'number' || !Number.isSafeInteger(pr.number) || pr.number < 1
          || typeof pr.url !== 'string' || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/u.test(pr.url)
          || !pr.url.endsWith(`/pull/${pr.number}`)) throw new Error('finalization pr');
      }
      if ((progress.stage === 'complete') !== (progress.pr !== null)) throw new Error('finalization completion');
    }
  }
  return view as unknown as DocSessionFinalizationView;
}
