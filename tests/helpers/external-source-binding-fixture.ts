import { createHash } from 'node:crypto';
import { admittedInboxFixture } from './admitted-inbox-fixture';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

export async function externalSourceBindingFixture() {
  const fixture = await admittedInboxFixture('1'.repeat(64), { repositoryId: '101', issueId: '202' });
  const repoId = repoHarnessRepoIdFor(fixture.root);
  const session = { repository_id: repoId, provider_repository_id: '101', issue_id: '202',
    campaign_id: fixture.admission.identity.campaign_id, task: fixture.task, role: fixture.source.session.role,
    claim_ref: fixture.source.authority.claim.reference, claim_revision: fixture.source.authority.claim.revision,
    grant_sha256: fixture.approved.grant, policy_sha256: fixture.approved.admission.policy.policy_sha256,
    actor_id: fixture.approved.admission.actor_id,
    session_binding_sha256: `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(fixture.binding)))).digest('hex')}` };
  return { ...fixture, repoId, session };
}
