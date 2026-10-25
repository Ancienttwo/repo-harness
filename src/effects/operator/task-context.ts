import { canonicalize } from '../../core/evidence/canonical-json';
import { hashVerificationPlan } from '../../core/evidence/verification-plan';
import type { JsonValue } from '../../core/evidence/types';
import { ADMITTED_CONTEXT_MAX_BYTES, decodeAdmittedTaskContext, type AdmittedTaskContext } from '../../core/operator/admitted-task-context';
import { isTaskDiffRequest, type OperatorTaskDiffRequest } from '../../core/operator/task-diff';
import { readReviewAdmissionSource } from '../review/admission-source';
import { observeActiveReviewAdmission } from '../review/issue-goal';
import { observeOperatorTaskDiffSource, OperatorTaskDiffError } from './task-diff';

/** Current protected goal and plan, surrounded by exact session/approval reads. */
export function readOperatorTaskContext(input: OperatorTaskDiffRequest & { readonly env?: NodeJS.ProcessEnv },
  effects: Parameters<typeof observeOperatorTaskDiffSource>[1] = {}): AdmittedTaskContext {
  const {env,...selector}=input;
  try {
    if(!isTaskDiffRequest(selector))throw new OperatorTaskDiffError('unavailable');
    const before=observeOperatorTaskDiffSource(input,effects);
    const source=(effects.admissionSource ?? readReviewAdmissionSource)(before.sourceRoot,{
      'repository-id':selector.provider_repository_id,'issue-id':selector.issue_id,'campaign-id':selector.campaign_id,
      'grant-sha256':selector.grant_sha256,'policy-sha256':selector.policy_sha256,actor:selector.actor_id,
    });
    const active=observeActiveReviewAdmission(source),admission=active.admission;
    if(active.grant_sha256!==before.approval.grant_sha256||active.revision!==before.approval.revision||admission.admission_sha256!==before.approval.admission_sha256)throw new OperatorTaskDiffError('stale');
    const profile=before.identity.engineer_profile;
    const result:AdmittedTaskContext={protocol:2,kind:'operator_admitted_task_context',selector,
      goal:admission.goal,verification:{plan_sha256:hashVerificationPlan(admission.verification_plan),plan_json:canonicalize(admission.verification_plan as unknown as JsonValue)},
      scope:{allowed_paths:admission.allowed_paths,benchmark:admission.benchmark,oracles_json:canonicalize(admission.oracles as unknown as JsonValue)},approval:before.approval,
      profile_selection:profile?{state:'selected',...profile}:{state:'unassigned'},
      execution:{branch:before.branch,runtime:before.identity.runtime,harness_kind:before.identity.harness_kind},observed_at:new Date().toISOString()};
    if(JSON.stringify(before)!==JSON.stringify(observeOperatorTaskDiffSource(input,effects)))throw new OperatorTaskDiffError('stale');
    if(Buffer.byteLength(JSON.stringify(result))>ADMITTED_CONTEXT_MAX_BYTES)throw new OperatorTaskDiffError('too_large');
    return decodeAdmittedTaskContext(result,selector);
  }catch(error){if(error instanceof OperatorTaskDiffError)throw error;if(error instanceof Error&&error.message==='review_admission_revoked_or_replaced')throw new OperatorTaskDiffError('stale');throw new OperatorTaskDiffError('unavailable');}
}
