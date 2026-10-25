import { useEffect, useRef, useState } from 'react';
import { decodeOperatorTaskDiff, TASK_DIFF_FAILURES, type OperatorTaskDiff, type OperatorTaskDiffRequest, type TaskDiffFailure } from '../core/operator/task-diff';
import type { OperatorTranslate } from './i18n';
import { decodeOperatorTaskSessions, type OperatorTaskSessions, type OperatorTaskSessionsRequest } from '../core/operator/task-sessions';

export type FetchTaskDiff = (request: OperatorTaskDiffRequest, signal: AbortSignal) => Promise<OperatorTaskDiff>;
const fetchTaskDiff: FetchTaskDiff = async (request, signal) => {
  const query = new URLSearchParams(Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'repository_id')));
  const response = await fetch(`/api/v1/fleet/task-sessions/${request.repository_id}/diff?${query}`, { signal, cache: 'no-store' });
  const value: unknown = await response.json();
  if (!response.ok) {
    const code = (value as { code?: unknown } | null)?.code;
    throw new Error(TASK_DIFF_FAILURES.includes(code as TaskDiffFailure) ? code as string : 'unavailable');
  }
  return decodeOperatorTaskDiff(value, request);
};

type View = { kind: 'idle' | 'loading' } | { kind: 'ready'; snapshot: OperatorTaskDiff } | { kind: 'error'; code: TaskDiffFailure };

/** Remounted on the entire task/claim fence, never just the card identity. */
export function TaskDiff({ selector, t, read = fetchTaskDiff }: { readonly selector: OperatorTaskDiffRequest; readonly t: OperatorTranslate; readonly read?: FetchTaskDiff }) {
  const [view, setView] = useState<View>({ kind: 'idle' });
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  const load = async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setView({ kind: 'loading' });
    const request = selector;
    try {
      const snapshot = decodeOperatorTaskDiff(await read(request, controller.signal), request);
      if (!controller.signal.aborted) setView({ kind: 'ready', snapshot });
    } catch (error) {
      if (!controller.signal.aborted) setView({ kind: 'error', code: TASK_DIFF_FAILURES.includes((error as Error).message as TaskDiffFailure) ? (error as Error).message as TaskDiffFailure : 'unavailable' });
    }
  };
  return <section className="detail-block task-diff" aria-label={t('diff.title')}>
    <h3 className="detail-eyebrow">{t('diff.title')}</h3>
    <p className="detail-quiet">{t('diff.scope')}</p>
    <button className="operator-button operator-button--secondary" type="button" onClick={() => void load()} disabled={view.kind === 'loading'}>{t(view.kind === 'loading' ? 'diff.loading' : view.kind === 'idle' ? 'diff.load' : 'diff.refresh')}</button>
    <div aria-live="polite">
      {view.kind === 'error' && <p role="status">{t(`diff.${view.code}`)}</p>}
      {view.kind === 'ready' && <>
        <dl className="detail-list">
          <div><dt>{t('diff.base')}</dt><dd><code>{view.snapshot.target_ref} · {view.snapshot.base_sha}</code></dd></div>
          <div><dt>HEAD</dt><dd><code>{view.snapshot.branch} · {view.snapshot.head_sha}</code></dd></div>
          <div><dt>{t('diff.observed')}</dt><dd><time>{view.snapshot.observed_at}</time></dd></div>
        </dl>
        {view.snapshot.patch ? <pre className="task-diff__patch" tabIndex={0} aria-label={t('diff.patch')}>{view.snapshot.patch}</pre> : <p>{t('diff.empty')}</p>}
        {view.snapshot.untracked_paths.length > 0 && <><h4>{t('diff.untracked')}</h4><ul>{view.snapshot.untracked_paths.map(path => <li key={path}><code>{path}</code></li>)}</ul></>}
      </>}
    </div>
  </section>;
}


export type FetchTaskSessions = (request: OperatorTaskSessionsRequest, signal: AbortSignal) => Promise<OperatorTaskSessions>;
const fetchTaskSessions: FetchTaskSessions = async (request, signal) => {
  const response = await fetch(`/api/v1/fleet/task-sessions/${request.repository_id}`, { signal, cache: 'no-store' });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error('unavailable');
  return decodeOperatorTaskSessions(value, request);
};
/** Repository scope has no implicit relationship to a legacy sprint card. */
export function TaskSessions({ repositoryId, t, read = fetchTaskSessions, readDiff }: {
  readonly repositoryId: string; readonly t: OperatorTranslate; readonly read?: FetchTaskSessions; readonly readDiff?: FetchTaskDiff;
}) {
  const [view, setView] = useState<{ kind: 'idle' | 'loading' | 'error' } | { kind: 'ready'; snapshot: OperatorTaskSessions }>({ kind: 'idle' });
  const [selected, setSelected] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const refresh = async () => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setSelected(''); setView({ kind: 'loading' });
    try {
      const snapshot = decodeOperatorTaskSessions(await read({ repository_id: repositoryId }, controller.signal), { repository_id: repositoryId });
      if (!controller.signal.aborted) setView({ kind: 'ready', snapshot });
    } catch { if (!controller.signal.aborted) setView({ kind: 'error' }); }
  };
  const session = view.kind === 'ready' ? view.snapshot.sessions.find(session => session.selector.session_binding_sha256 === selected) : undefined;
  return <section className="detail-block task-sessions" aria-label={t('sessions.title')}>
    <h2 className="detail-eyebrow">{t('sessions.title')}</h2>
    <p className="detail-quiet">{t('sessions.scope')}</p>
    <button className="operator-button operator-button--secondary" type="button" disabled={view.kind === 'loading'} onClick={() => void refresh()}>{t(view.kind === 'loading' ? 'sessions.loading' : 'sessions.refresh')}</button>
    {view.kind === 'error' && <p role="status">{t('sessions.unavailable')}</p>}
    {view.kind === 'ready' && (view.snapshot.sessions.length === 0 ? <p role="status">{t('sessions.empty')}</p> : <>
      <label>{t('sessions.select')}
        <select value={selected} onChange={event => setSelected(event.target.value)}>
          <option value="">{t('sessions.choose')}</option>
          {view.snapshot.sessions.map(session => <option key={session.selector.session_binding_sha256} value={session.selector.session_binding_sha256}>
            {session.selector.provider_repository_id} / {session.selector.issue_id} · {session.selector.campaign_id} · {session.selector.task} / {session.selector.role} · {session.branch} · {session.runtime}
          </option>)}
        </select>
      </label>
    </>)}
    {session && <TaskDiff key={JSON.stringify(session.selector)} selector={session.selector} t={t} read={readDiff} />}
  </section>;
}
