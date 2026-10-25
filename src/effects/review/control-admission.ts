import { realpathSync } from 'node:fs';
import { createReviewAdmission, type ReviewAdmissionInput } from '../../core/review/authority-context';
import { validateControlApproval } from '../../core/review/control-delegation';
import { approveReviewAdmission } from './admission-store';

/** Trusted upstream integration entry. The Bot must authenticate the human and
 * enforce current delegation before calling. This function binds that request
 * to an exact admission; it does not authenticate arbitrary JSON or actor names.
 */
export function approveDelegatedReviewAdmission(input: {
  repoRoot: string;
  admission: ReviewAdmissionInput;
  approval: unknown;
  expectedRevision: number;
  authorityHome?: string;
}) {
  const repoRoot = realpathSync(input.repoRoot);
  const admission = createReviewAdmission(input.admission);
  const approval = validateControlApproval(input.approval, Date.now(), admission, repoRoot, input.expectedRevision);
  const result = approveReviewAdmission({ repoRoot, authorityHome: input.authorityHome,
    admission: input.admission, expectedAdmissionSha256: admission.admission_sha256,
    expectedRevision: input.expectedRevision, controlApproval: approval });
  return { ...result, bot_id: approval.bot_id, authorization_ref: approval.authorization_ref,
    execution_actor: admission.actor_id };
}
