import { canonicalize } from '../../core/evidence/canonical-json';
import { hashVerificationPlan } from '../../core/evidence/verification-plan';
import type { JsonValue } from '../../core/evidence/types';
import { ADMITTED_CONTEXT_MAX_BYTES, decodeAdmittedTaskContext, type AdmittedTaskContext } from '../../core/operator/admitted-task-context';
import { isAdmittedSessionSelector, type AdmittedSessionSelector } from '../../core/sessions/session-selector';
import { readReviewAdmissionSource } from '../admission/admission-source';
import { observeActiveReviewAdmission } from '../admission/issue-goal';
import { observeAdmittedSessionSource, SessionObservationError } from '../sessions/admitted-source';

/** Current protected goal and plan, surrounded by exact session/approval reads. */
export function readOperatorTaskContext(input: AdmittedSessionSelector & { readonly env?: NodeJS.ProcessEnv },
  effects: Parameters<typeof observeAdmittedSessionSource>[1] = {}): AdmittedTaskContext {
  const {env,...selector}=input;
  try {
    if(!isAdmittedSessionSelector(selector))throw new SessionObservationError('unavailable');
    const before=observeAdmittedSessionSource(input,effects);
    const source=(effects.admissionSource ?? readReviewAdmissionSource)(before.sourceRoot,{
      'repository-id':selector.provider_repository_id,'issue-id':selector.issue_id,'campaign-id':selector.campaign_id,
      'grant-sha256':selector.grant_sha256,'policy-sha256':selector.policy_sha256,actor:selector.actor_id,
    });
    const active=observeActiveReviewAdmission(source),admission=active.admission;
    if(active.grant_sha256!==before.approval.grant_sha256||active.revision!==before.approval.revision||admission.admission_sha256!==before.approval.admission_sha256)throw new SessionObservationError('stale');
    const result:AdmittedTaskContext={protocol:2,kind:'operator_admitted_task_context',selector,
      goal:admission.goal,verification:{plan_sha256:hashVerificationPlan(admission.verification_plan),plan_json:canonicalize(admission.verification_plan as unknown as JsonValue)},
      scope:{allowed_paths:admission.allowed_paths,benchmark:admission.benchmark,oracles_json:canonicalize(admission.oracles as unknown as JsonValue)},approval:before.approval,
      execution:{branch:before.branch,runtime:before.identity.runtime,harness_kind:before.identity.harness_kind},observed_at:new Date().toISOString()};
    if(JSON.stringify(before)!==JSON.stringify(observeAdmittedSessionSource(input,effects)))throw new SessionObservationError('stale');
    if(Buffer.byteLength(JSON.stringify(result))>ADMITTED_CONTEXT_MAX_BYTES)throw new SessionObservationError('too_large');
    return decodeAdmittedTaskContext(result,selector);
  }catch(error){if(error instanceof SessionObservationError)throw error;if(error instanceof Error&&error.message==='review_admission_revoked_or_replaced')throw new SessionObservationError('stale');throw new SessionObservationError('unavailable');}
}
