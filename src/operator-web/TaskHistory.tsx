import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeOperatorTaskHistory, TASK_HISTORY_FAILURES, type OperatorTaskHistory } from '../core/operator/task-history';
import { fetchTaskHistory } from './task-history';
import { useObservationRefresh } from './useObservationRefresh';
import type { OperatorTranslate } from './i18n';
export type TaskHistoryReader = typeof fetchTaskHistory;

/** Historical evidence never mounts current-task actions or constructs a card. */
export function TaskHistory({repositoryId,taskId,revision,generation,read=fetchTaskHistory,onClose,t}:{repositoryId:string;taskId:string;revision:string|null;generation:number;read?:TaskHistoryReader;onClose:()=>void;t:OperatorTranslate}) {
  const identity=JSON.stringify([repositoryId,taskId,revision]);
  const [state,setState]=useState<{identity:string;value:OperatorTaskHistory|null;loading:boolean;failure:string|null}>({identity,value:null,loading:true,failure:null});
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[identity]);
  const observe=useCallback(async(signal:AbortSignal)=>{
    setState(previous=>({identity,value:previous.identity===identity?previous.value:null,loading:true,failure:null}));
    const request={repository_id:repositoryId,task_id:taskId,expected_task_revision:revision};
    try {
      const value=decodeOperatorTaskHistory(await read(request,signal),request);
      if(signal.aborted)return false;
      setState({identity,value,loading:false,failure:null});return true;
    } catch(error) {
      if(signal.aborted)return false;
      const code=error instanceof Error&&TASK_HISTORY_FAILURES.includes(error.message as never)?error.message:'unavailable';
      setState(previous=>({identity,value:previous.identity===identity?previous.value:null,loading:false,failure:code}));return false;
    }
  },[identity,repositoryId,taskId,revision,read]);
  const refresh=useObservationRefresh(observe,JSON.stringify([identity,generation]));
  const current=state.identity===identity?state:{identity,value:null,loading:true,failure:null};
  return <section className="task-history task-evidence" aria-labelledby="task-history-title" onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();onClose();}}}>
    <h2 ref={heading} tabIndex={-1} id="task-history-title">{t('history.title')}</h2>
    <p>{t('history.boundary')}</p>
    <p><code>{repositoryId}</code> · <code>{taskId}</code></p>
    <div><button type="button" onClick={onClose}>{t('detail.close')}</button>{' '}<button type="button" disabled={current.loading} onClick={refresh}>{t('status.refresh')}</button></div>
    {current.loading&&<p role="status">{t('evidence.loading')}</p>}
    {current.failure&&<p role="alert">{t('history.unavailable')} <code>{current.failure}</code></p>}
    {current.value&&<>
      {(current.loading||current.failure)&&<p>{t('evidence.historical')}</p>}
      <dl className="task-evidence__facts">
        <div><dt>{t('evidence.goal')}</dt><dd>{current.value.task.title}</dd></div>
        <div><dt>{t('evidence.acceptance')}</dt><dd>{current.value.task.acceptance||t('evidence.empty')}</dd></div>
        <div><dt>{t('history.recordedStatus')}</dt><dd>{current.value.task.recorded_status}</dd></div>
        <div><dt>{t('field.revision')}</dt><dd><code>{current.value.task_revision}</code></dd></div>
        <div><dt>{t('evidence.observed')}</dt><dd>{current.value.observed_at}</dd></div>
      </dl>
      <p>{t('history.coverage',{count:current.value.coverage.commits_examined})}</p>
      <h3>{t('history.source')}</h3><pre>{JSON.stringify(current.value.source,null,2)}</pre>
    </>}
  </section>;
}
