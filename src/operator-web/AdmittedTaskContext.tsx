import { useCallback, useState } from 'react';
import { decodeAdmittedTaskContext, type AdmittedTaskContext as Snapshot } from '../core/operator/admitted-task-context';
import { SESSION_OBSERVATION_FAILURES, type AdmittedSessionSelector } from '../core/sessions/session-selector';
import { fetchTaskContext } from './task-context';
import { useObservationRefresh } from './useObservationRefresh';
import type { OperatorTranslate } from './i18n';
export type TaskContextReader=typeof fetchTaskContext;
export function AdmittedTaskContext({selector,generation=0,read=fetchTaskContext,t}:{selector:AdmittedSessionSelector;generation?:number;read?:TaskContextReader;t:OperatorTranslate}){
  const identity=JSON.stringify(selector);
  const [state,setState]=useState<{identity:string;value:Snapshot|null;loading:boolean;error:string|null}>({identity,value:null,loading:true,error:null});
  const observe=useCallback(async(signal:AbortSignal)=>{
    setState(old=>({identity,value:old.identity===identity?old.value:null,loading:true,error:null}));
    try{const value=decodeAdmittedTaskContext(await read(selector,signal),selector);if(signal.aborted)return false;setState({identity,value,loading:false,error:null});return true;}
    catch(error){if(signal.aborted)return false;const message=(error as Error).message;setState(old=>({identity,value:old.identity===identity?old.value:null,loading:false,error:SESSION_OBSERVATION_FAILURES.includes(message as never)?message:'unavailable'}));return false;}
  },[identity,read]);
  const refresh=useObservationRefresh(observe,JSON.stringify([identity,generation]));
  const current=state.identity===identity?state:{identity,value:null,loading:true,error:null},value=current.value;
  return <section className="task-evidence__context" aria-label={t('evidence.context')}>
    <h3>{t('evidence.context')}</h3><p>{t('evidence.admittedContext')}</p>
    <button type="button" disabled={current.loading} onClick={refresh}>{t('status.refresh')}</button>
    {current.loading&&<p role="status">{t('evidence.loading')}</p>}{current.error&&<p role="status">{t('evidence.unavailable')} <code>{current.error}</code></p>}
    {value&&<>{(current.loading||current.error)&&<p className="task-evidence__historical">{t('evidence.historical')}</p>}
      <h4>{t('evidence.goal')}</h4><pre>{value.goal.content}</pre>
      <p><code>{value.goal.revision}</code> · {value.observed_at}</p>
      <h4>{t('evidence.plan')}</h4><pre>{value.verification.plan_json}</pre><code>{value.verification.plan_sha256}</code>
      <h4>{t('evidence.claim')}</h4><p><code>{value.selector.claim_ref} · {value.selector.claim_revision}</code></p>
      <p>{value.profile_selection.state==='selected'?`${value.profile_selection.engineer_id} · ${value.profile_selection.engineer_contract_revision}`:t('org.unassigned')}</p>
      <details><summary>{t('evidence.original')}</summary><pre>{JSON.stringify({approval:value.approval,scope:value.scope,execution:value.execution,profile_selection:value.profile_selection},null,2)}</pre></details>
    </>}
  </section>;
}
