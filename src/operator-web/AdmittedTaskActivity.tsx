import { useEffect, useRef, useState } from 'react';
import { decodeAdmittedTaskActivity, type AdmittedTaskActivity as Snapshot, type AdmittedTaskActivityRequest } from '../core/operator/admitted-task-activity';
import { SESSION_OBSERVATION_FAILURES, type AdmittedSessionSelector } from '../core/sessions/session-selector';
import { TASK_ACTIVITY_FAILURES } from '../core/operator/task-activity';
import type { OperatorTranslate } from './i18n';
export type ReadAdmittedActivity = (request: AdmittedTaskActivityRequest, signal: AbortSignal) => Promise<Snapshot>;
const readActivity: ReadAdmittedActivity = async (request, signal) => {
  const query = new URLSearchParams(Object.entries(request.selector).filter(([key]) => key !== 'repository_id'));
  if (request.message_id !== null) query.set('message_id', request.message_id);
  else { query.set('limit', String(request.limit)); if (request.after !== null) query.set('after', request.after); }
  const response = await fetch(`/api/v1/fleet/task-sessions/${request.selector.repository_id}/activity?${query}`, { signal, cache: 'no-store' });
  const value: unknown = await response.json();
  if (!response.ok) {
    const code = (value as { code?: unknown } | null)?.code;
    throw new Error([...TASK_ACTIVITY_FAILURES, ...SESSION_OBSERVATION_FAILURES].includes(code as never) ? String(code) : 'unavailable');
  }
  return decodeAdmittedTaskActivity(value, request);
};
/** Explicit selected-session read; stale results never become a new selection. */
export function AdmittedTaskActivity({ selector, t, read = readActivity }: { selector: AdmittedSessionSelector; t: OperatorTranslate; read?: ReadAdmittedActivity }) {
  const [view, setView] = useState<{ loading: boolean; error: string | null; value: Snapshot | null }>({ loading:false,error:null,value:null });
  const active = useRef<AbortController | null>(null);
  const identity = JSON.stringify(selector);
  useEffect(() => { setView({loading:false,error:null,value:null}); return () => { active.current?.abort(); }; }, [identity]);
  const load = async (after: string | null = null, message_id: string | null = null) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const request = { selector, limit: message_id === null ? 50 : 1, after, message_id };
    setView(previous => ({...previous,loading:true,error:null}));
    try {
      const value = decodeAdmittedTaskActivity(await read(request, controller.signal), request);
      if (!controller.signal.aborted) setView({loading:false,error:null,value});
    } catch (error) {
      if (!controller.signal.aborted) setView(previous => ({...previous,loading:false,error:(error as Error).message}));
    }
  };
  const value = view.value;
  const original = (data: unknown) => <details><summary>{t('evidence.original')}</summary><pre tabIndex={0}>{JSON.stringify(data,null,2)}</pre></details>;
  return <section className="task-evidence__activity" aria-label={t('evidence.admittedActivity')}>
    <h3>{t('evidence.admittedActivity')}</h3><p>{t('evidence.admittedBoundary')}</p>
    <button type="button" disabled={view.loading} onClick={() => void load()}>{t(view.loading ? 'evidence.loading' : value ? 'evidence.refresh' : 'evidence.load')}</button>
    {view.error && <p role="status"><code>{view.error}</code></p>}
    {value && <>
      {(view.loading || view.error) && <p role="status">{t('evidence.historical')}</p>}
      <p>{t('evidence.observed')}: {value.observed_at} · <code>{value.admission_sha256}</code></p>
      <p>{value.coverage.complete ? t('evidence.pageComplete') : t('evidence.partial')} · <code>{value.coverage.scope} {value.coverage.reason}</code></p>
      {(value.after !== null || value.message_id !== null) && <button type="button" disabled={view.loading} onClick={() => void load()}>{t('evidence.firstPage')}</button>}
      {value.entries.length === 0 && <p>{t('evidence.noEntries')}</p>}
      {value.entries.map(entry => <article className="task-evidence__message" key={entry.event.message_id}>
        <h4><code>{entry.event.message_id}</code></h4><p className="task-evidence__body">{entry.event.body || t('evidence.emptyBody')}</p>
        <p>{t('evidence.sender')}: <code>{entry.event.sender_kind} · {entry.event.sender_id ?? '—'}</code></p>
        <p>{t('evidence.provenance')}: <code>{entry.event.sender_trust}</code></p>
        {entry.event.in_reply_to && <button type="button" disabled={view.loading || !!view.error} onClick={() => void load(null,entry.event.in_reply_to)}>{t('evidence.parent')}</button>}
        <h4>{t('evidence.receipts')}</h4>{entry.receipts.length === 0 && <p>{t('evidence.noReceipts')}</p>}
        <ul>{entry.receipts.map((receipt,index) => <li key={index}><code>{receipt.recipient_kind} · {receipt.recipient_id} · {receipt.delivery_state}</code>{original(receipt)}</li>)}</ul>
        {original(entry.event)}
      </article>)}
      {value.next_cursor && <button type="button" disabled={view.loading || !!view.error} onClick={() => void load(value.next_cursor)}>{t('evidence.nextPage')}</button>}
    </>}
  </section>;
}
