import { realpathSync } from 'node:fs';
import { createReviewAdmission, type ReviewAdmissionInput } from '../../core/review/authority-context';
import { verifyControlApproval } from '../../core/review/control-delegation';
import { readReviewControlTrust } from './control-trust';
import { approveReviewAdmission } from './admission-store';

/** Public control entry. The signed user delegation authenticates the Bot; the
 * signed Bot decision binds the exact approval and CAS revision. An execution
 * actor name is only a selector and cannot grant authority here.
 */
export function approveDelegatedReviewAdmission(input: {
  repoRoot: string;
  admission: ReviewAdmissionInput;
  envelope: unknown;
  expectedRevision: number;
  /** Trusted in-process test seam; never exposed as a command option. */
  authorityHome?: string;
  controlTrustHome?: string;
}) {
  const repoRoot = realpathSync(input.repoRoot);
  const admission = createReviewAdmission(input.admission);
  const envelope = JSON.parse(JSON.stringify(input.envelope));
  const approval = verifyControlApproval(envelope, readReviewControlTrust(input.controlTrustHome),
    Date.now(), admission, repoRoot, input.expectedRevision);
  const result = approveReviewAdmission({ repoRoot, authorityHome: input.authorityHome, controlTrustHome: input.controlTrustHome,
    admission: input.admission, expectedAdmissionSha256: admission.admission_sha256,
    expectedRevision: input.expectedRevision, controlEnvelope: envelope });
  return { ...result, approved_by: approval.bot_id, delegated_by: approval.user_id,
    execution_actor: admission.actor_id, delegation_sha256: approval.delegation_sha256 };
}
