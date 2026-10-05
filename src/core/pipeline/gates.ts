import { equal, PipelineError, type Evidence, type PipelineRecord, type Requirement, type Run, type Subject } from './types';

export function currentSubject(record:PipelineRecord):Subject|null {
  const observation=record.observations.slice().reverse().find(o=>o.kind==='subject');
  return observation?.data.quality==='verified' ? observation.data.subject as Subject : null;
}
export function refreshValidity(record:PipelineRecord,subject:Subject|null):void {
  record.evidence.forEach(e=>{e.current=subject!==null && equal(e.subject,subject);});
  const approval=record.merge.owner_approval;
  if(approval && !approval.consumed_at && (!subject || approval.head_sha!==subject.head_sha || approval.base_sha!==subject.base_sha || approval.tree_digest!==subject.tree_digest)) {
    approval.expired=true;approval.expired_reason=subject?'candidate_moved':'source_unavailable';
  }
}
export function requirementPass(record:PipelineRecord,kind:string):boolean {
  const requirement=record.policy.verification[kind] as Requirement|undefined;
  const subject=currentSubject(record);
  if(!subject || !subject.worktree_clean || !requirement || typeof requirement==='string' || requirement.check_ids.length===0) return false;
  return requirement.check_ids.every(id=>{
    const rows=record.evidence.filter(e=>e.kind===kind && e.check_id===id && e.current && equal(e.subject,subject) && e.subject.contract_identity===requirement.identity && e.subject.check_set_identity===record.policy.verification.check_set_identity);
    if(!rows.length) return false;
    const latest=Math.max(...rows.map(e=>e.execution_order));
    // Equal authority order with conflicting claims cannot be resolved by arrival.
    return rows.filter(e=>e.execution_order===latest).every(e=>e.source==='verified' && e.verdict==='pass');
  });
}
export function requireGate(condition:boolean,message:string):void {if(!condition) throw new PipelineError('gate_not_satisfied',5,message);}
// The highest registered round is the current attempt. Older rounds stay history.
export function currentRun(record:PipelineRecord,role:string):Run|undefined {return record.runs.filter(r=>r.role===role).sort((a,b)=>b.round-a.round)[0];}
export function latestPlan(record:PipelineRecord):Evidence|undefined {return record.evidence.filter(e=>e.kind==='plan' && e.current && e.source==='verified').sort((a,b)=>b.execution_order-a.execution_order)[0];}
