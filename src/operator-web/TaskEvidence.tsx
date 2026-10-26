import { useObservationRefresh } from './useObservationRefresh';
import { useCallback, useState } from 'react';
import { decodeOperatorTaskActivity, TASK_ACTIVITY_FAILURES, type OperatorTaskActivity, type OperatorTaskActivityRequest } from '../core/operator/task-activity';
import { fetchTaskActivity } from './task-activity';
import type { OperatorTranslate } from './i18n';

export type { TaskContextReader } from './AdmittedTaskContext';
export type TaskActivityReader = typeof fetchTaskActivity;

// Both independent sources obey the same scope and supersession invariant.
function useObservation<T>(key: string, generation: number, read: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ key: string; generation: number; value: T | null; loading: boolean; failed: boolean; code: string | null }>({ key, generation, value: null, loading: true, failed: false, code: null });
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    setState(previous => ({ key, generation, value: previous.key === key ? previous.value : null, loading: true, failed: false, code: null }));
    try {
      const value = await read(signal);
      if (signal.aborted) return false;
      setState({key,generation,value,loading:false,failed:false,code:null});
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      const code = error instanceof Error && TASK_ACTIVITY_FAILURES.includes(error.message as never) ? error.message : 'unavailable';
      setState(previous => ({key,generation,value:previous.key===key ? previous.value : null,loading:false,failed:true,code}));
      return false;
    }
  }, [key,generation,read]);
  useObservationRefresh(observe, JSON.stringify([key,generation]));
  // Render-time identity prevents one frame of old data before effect cleanup.
  if (state.key !== key) return { value: null, loading: true, failed: false, code: null };
  if (state.generation !== generation) return { ...state, loading: true, failed: false, code: null };
  return state;
}

function Original({ value, t }: { value: unknown; t: OperatorTranslate }) {
  return <details className="task-evidence__original"><summary>{t('evidence.original')}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
}
function Notice({ loading, failed, historical, code, t }: { loading: boolean; failed: boolean; historical: boolean; code: string | null; t: OperatorTranslate }) {
  return <>{loading && <p role="status">{t('evidence.loading')}</p>}{failed && <p role="alert">{t('evidence.unavailable')} <code>{code}</code></p>}{historical && <p className="task-evidence__historical">{t('evidence.historical')}</p>}</>;
}

interface EvidenceProps {
  repositoryId: string;
  taskId: string;
  revision: string;
  generation: number;
  t: OperatorTranslate;
}
function ActivityEvidence({ repositoryId, taskId, generation, readActivity, t }: Omit<EvidenceProps, 'revision'> & { readActivity: TaskActivityReader }) {
  const [page, setPage] = useState<{ after: string | null; message: string | null }>({ after: null, message: null });
  const read = useCallback(async (signal: AbortSignal): Promise<OperatorTaskActivity> => {
    const request: OperatorTaskActivityRequest = { repository_id: repositoryId, task_id: taskId, limit: page.message === null ? 50 : 1, after: page.after, message_id: page.message };
    return decodeOperatorTaskActivity(await readActivity(request, signal), request);
  }, [repositoryId, taskId, page.after, page.message, readActivity]);
  const state = useObservation(JSON.stringify([repositoryId, taskId, page]), generation, read);
  const value = state.value;
  const lookup = (message: string) => setPage({ after: null, message });
  return <section className="task-evidence__activity" aria-label={t('evidence.historicalActivity')}>
    <h3>{t('evidence.historicalActivity')}</h3>
    <p>{t('evidence.receiptBoundary')}</p>
    <Notice loading={state.loading} failed={state.failed} code={state.code} historical={!!value && (state.loading || state.failed)} t={t} />
    {(page.after !== null || page.message !== null) && <button type="button" onClick={() => setPage({ after: null, message: null })}>{t('evidence.firstPage')}</button>}
    {page.message && <p>{t('evidence.messageLookup')}: <code>{page.message}</code></p>}
    {value && <>
      <p>{t('evidence.observed')}: {value.observed_at}</p>
      <p className="task-evidence__coverage">{value.coverage.complete ? t('evidence.pageComplete') : t('evidence.partial')} · <code>{value.coverage.scope}</code>{value.coverage.reason && <> · <code>{value.coverage.reason}</code></>}</p>
      {value.entries.length === 0 && <p>{t('evidence.noEntries')}</p>}
      {value.entries.map(entry => <article className="task-evidence__message" key={entry.event.message_id}>
        <h4><code>{entry.event.message_id}</code></h4>
        <p className="task-evidence__body">{entry.event.body || t('evidence.emptyBody')}</p>
        <p>{t('evidence.sender')}: <code>{entry.event.sender_kind}</code> · <code>{entry.event.sender_id ?? '—'}</code></p>
        <p>{t('evidence.provenance')}: <code>{entry.provenance}</code></p>
        {entry.event.in_reply_to && <button type="button" onClick={() => lookup(entry.event.in_reply_to!)}>{t('evidence.parent')}</button>}
        <h4>{t('evidence.receipts')}</h4>
        {entry.receipts.length === 0 && <p>{t('evidence.noReceipts')}</p>}
        <ul>{entry.receipts.map((receipt, index) => <li key={index}>
          <code>{receipt.recipient_kind}</code> · <code>{receipt.recipient_id}</code> · <code>{receipt.delivery_state}</code>
          <Original value={receipt} t={t} />
        </li>)}</ul>
        <h4>{t('evidence.replies')}</h4>
        {entry.replies.length === 0 && <p>{t('evidence.noReplies')}</p>}
        <ul>{entry.replies.map((reply, index) => <li key={index}>
          <code>{reply.claim_id}</code> / {reply.generation} · <code>{reply.state}</code>
          {reply.reply_message_id && reply.reply_message_id !== entry.event.message_id && <button type="button" onClick={() => lookup(reply.reply_message_id!)}>{t('evidence.openReply')}</button>}
          <Original value={reply} t={t} />
        </li>)}</ul>
        <Original value={entry.event} t={t} />
      </article>)}
      {value.next_cursor && <button type="button" disabled={state.loading || state.failed} onClick={() => setPage({ after: value.next_cursor, message: null })}>{t('evidence.nextPage')}</button>}
    </>}
  </section>;
}

export function HistoricalTaskActivity(props: Omit<EvidenceProps, 'revision'> & { readActivity?: TaskActivityReader }) {
  return <ActivityEvidence {...props} key={JSON.stringify([props.repositoryId,props.taskId])} readActivity={props.readActivity ?? fetchTaskActivity} />;
}
