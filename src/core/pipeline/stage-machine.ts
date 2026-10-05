import { currentRun, currentSubject, latestPlan, requireGate, requirementPass } from './gates';
import { PipelineError, type Phase, type PipelineRecord } from './types';

export function advanceRecord(record:PipelineRecord,to:Phase,reason?:string):void {
  const from=record.phase;const now=new Date().toISOString();
  let qualified=false;
  if(from==='cleanup' || from==='abandoned' && to!=='cleanup') throw new PipelineError('transition_not_allowed',7,'Terminal record');
  if(to==='blocked'||to==='abandoned') {
    if(!reason) throw new PipelineError('usage',2,'This transition requires a reason');
    if(to==='blocked') record.blocked={reason,since:now,return_to:from};
  } else if(from==='blocked' && to===record.blocked?.return_to) record.blocked=null;
  else if((from==='cross-review'&&to==='implement')||(from==='test'&&to==='cross-review')||(from==='merge-ask'&&to==='test')) {
    if(!reason) throw new PipelineError('usage',2,'Rework requires a reason');
    record.counters.fix_loops++;record.counters.review_rounds[to]=(record.counters.review_rounds[to]??0)+1;
  } else {
    const subject=currentSubject(record);
    if(from==='plan'&&to==='plan-review') requireGate(!!latestPlan(record),'Current verified plan is required');
    else if(from==='plan-review'&&to==='implement') {
      requireGate(requirementPass(record,'plan_review'),'Plan review checks did not pass');
      const plan=latestPlan(record);const index=plan?record.evidence.indexOf(plan):-1;
      requireGate(index>=0 && record.relations.some(r=>r.rel==='reviews'&&r.to===index && record.evidence[r.from]?.kind==='plan_review' && record.evidence[r.from]?.current),'Review must bind to the current plan');
    } else if(from==='implement'&&to==='cross-review') {
      requireGate(!!record.resources.branch && (currentRun(record,'implement')?.result_state==='validated' || (!!subject?.worktree_clean && record.observations.some(o=>o.kind==='commit'&&o.data.head_sha===subject.head_sha && o.data.base_sha===subject.base_sha))),'Validated result or observed clean commit is required');
    } else if(from==='cross-review'&&to==='test') {
      requireGate(requirementPass(record,'cross_review'),'Cross review checks did not pass');
      const harness=record.runs.filter(r=>r.role==='implement').map(r=>r.harness_kind);
      requireGate(harness.length>0 && record.evidence.filter(e=>e.kind==='cross_review'&&e.current && e.source==='verified').every(e=>!harness.includes(e.reviewer)),'Reviewer must differ from implementer');
    } else if(from==='test'&&to==='merge-ask') {
      for(const kind of ['typecheck','affected_tests','full_suite']) requireGate(requirementPass(record,kind),`${kind} checks did not pass`);
      record.merge.phase_entry_facts={base_sha:subject!.base_sha,head_sha:subject!.head_sha};
    } else if(from==='merge-ask'&&to==='merged') {
      const fact=record.merge.external_merge;const go=record.merge.owner_approval;
      requireGate(!!fact && !!go && !go.expired && go.head_sha===fact.pre_merge_head && go.base_sha===fact.pre_merge_base && go.tree_digest===fact.tree_digest && go.merge_method===fact.method && go.at<=fact.observed_at,'Historical go must cover the recorded merge');
      record.merge.owner_approval!.consumed_at=fact!.observed_at;
      record.merge.squash_commit=fact!.squash_commit;
    } else if((from==='merged'||from==='abandoned') && to==='cleanup') {
      const checklist=record.observations.slice().reverse().find(o=>o.kind==='cleanup_checklist');
      requireGate(!!checklist && ['merge_recorded','no_active_run','registered_secondary','identity_rechecked','clean','no_untracked','pushed','plain_remove'].every(k=>checklist.data[k]===true),'Cleanup checklist is incomplete');
      requireGate(!!record.resources.worktree && checklist!.data.path===record.resources.worktree,'Cleanup path must match the registry');
      if(from==='abandoned'||record.admission==='observed') requireGate(checklist!.data.owner_approval===true,'Owner approval is required for this cleanup observation');
    } else throw new PipelineError('transition_not_allowed',7,`${from} to ${to} is not allowed`);
    qualified=true;
  }
  record.phase=to;record.phase_since=now;
  record.admission=qualified&&!['merged','cleanup','abandoned','blocked'].includes(to)?'gate_qualified':'observed';
}
