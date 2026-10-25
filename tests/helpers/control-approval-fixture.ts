import { realpathSync } from 'node:fs';
import type { ReviewAdmission } from '../../src/core/review/authority-context';
import type { ControlApproval } from '../../src/core/review/control-delegation';

/** Synthetic request at the trusted Bot integration boundary. This fixture does
 * not authenticate a human, provision keys or exercise a live upstream service.
 * Waiver eligibility must be requested explicitly; it is never a waiver grant.
 */
export function controlApprovalFixture(root: string, admission: ReviewAdmission, revision: number,
  action: ControlApproval['action'] = 'admit'): ControlApproval {
  return { protocol: 1, kind: 'repo-harness-upstream-control-approval', authorization_ref: 'fixture-upstream-authorization',
    bot_id: 'fixture-bot', action, repository_id: admission.repository_id, issue_id: admission.issue_id,
    campaign_id: admission.campaign_id, execution_actor: admission.actor_id,
    parent_scope: { issue_ids: [admission.issue_id], allowed_paths: [...admission.allowed_paths],
      policy: { ...admission.policy }, benchmark: admission.benchmark, not_before: Date.now() - 1000, expires_at: Date.now() + 3_600_000 },
    admission_sha256: admission.admission_sha256, repository_root: realpathSync(root), expected_revision: revision,
    expires_at: Date.now() + 3_599_000 };
}
