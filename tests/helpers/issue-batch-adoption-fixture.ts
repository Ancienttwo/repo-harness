import { buildIssueBatchIntent, buildIssueAuthoringSession, renderIssueBatchMarker, type IssueBatchIntentV1, type IssueBatchSlot } from '../../src/core/automation/issue-batch';
import { buildConnectorChallenge } from '../../src/core/automation/connector-challenge';
import { buildExternalSourceRefreshReceipt, buildProviderIssueObservation } from '../../src/core/external-sources/issue-observation';
import { sealCampaignAuthoringTerminal } from '../../src/core/automation/campaign-authoring-budget';
import { messageSha256 } from '../../src/core/messages/mechanics';
import type { IssueBatchAdoptionInput } from '../../src/core/automation/issue-batch-adoption';
import type { CampaignPublicationPolicy } from '../../src/effects/automation/issue-batch-publication';
export const AT = '2026-09-05T00:00:00.000Z';
export const CAP = 'capability.runtime-harness.development-campaign';
export const policy: CampaignPublicationPolicy = {
  required_acceptance: [{ gate: 'module', policy_id: 'repair', policy_ref: 'plans/policies/repair.json', policy_revision: messageSha256('repair') }],
  rollback_boundary: { kind: 'work_package', boundary_id: 'repair', boundary_ref: 'plans/policies/repair.json', boundary_revision: messageSha256('repair') },
  retry_policy: { max_automated_attempts: 1, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'fixed', initial_seconds: 1, maximum_seconds: 1 }, attention_after_seconds: 60, revision_reset: 'reset_on_work_package_revision' },
};
export function makeIntent(overrides: Partial<IssueBatchIntentV1> = {}, count = 2) {
  return buildIssueBatchIntent({ campaign_id: 'campaign-1', group_number: 1, repository_id: 'repo-1', provider_repository: 'acme/widgets', target_ref: 'refs/heads/main', base_main_sha: 'a'.repeat(40), slots: Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, '0')) as IssueBatchSlot[], allowed_issue_kinds: ['bugfix', 'test_gap'], prompt_sha256: messageSha256('prompt'), authoring_policy_sha256: messageSha256('policy'), authoring_parent: 'codex', gpt_pro_transport: 'oracle_browser', browser_transport: 'copy_profile', chrome_profile_directory: 'Profile 1', created_at: AT, expires_at: '2027-09-05T00:00:00.000Z', ...overrides });
}
export function makeSnapshot(intent: IssueBatchIntentV1, slots = intent.slots as readonly string[], overrides: Record<string, unknown> = {}) {
  const observations = slots.map((slot, i) => buildProviderIssueObservation({ registered_repository_id: intent.repository_id, provider: 'github', provider_host: 'github.com', provider_repository_id: '100', provider_issue_id: String(i + 1), display_ref: `acme/widgets#${i + 1}`, url: `https://github.com/acme/widgets/issues/${i + 1}`, observed_at: AT, provider_created_at: AT, provider_updated_at: AT, state: 'open', title: 'display only', body: `${renderIssueBatchMarker(intent.campaign_id, intent.group_number, slot)}\n\n\`\`\`json\n${JSON.stringify({ protocol: 1, kind: 'repo-harness-campaign-issue-metadata', issue_kind: 'bugfix', primary_capability: CAP, priority: 50, depends_on_slots: [], suspected_paths: ['src/index.ts'], ...overrides })}\n\`\`\``, labels: [], assignees: [], comments_policy: 'omitted', policy_revision: intent.authoring_policy_sha256, eligible: true, eligibility_reasons: [] }));
  const receipt = buildExternalSourceRefreshReceipt({ registered_repository_id: intent.repository_id, provider: 'github', provider_host: 'github.com', provider_repository_id: '100', provider_display_ref: intent.provider_repository, policy_revision: intent.authoring_policy_sha256, started_at: AT, completed_at: AT, outcome: 'complete', pages_fetched: 1, issues_seen: observations.length, observations_written: observations.length, limits: { max_pages: 2, max_issues: 20, max_body_bytes: 8192, max_total_bytes: 65536, deadline_ms: 1000 }, source_revisions: observations.map(o => o.source_revision).sort(), failure: null });
  return { observations, receipt };
}
export function makeAdoptionInput(intent = makeIntent(), slots = intent.slots as readonly string[]): IssueBatchAdoptionInput {
  const session = buildIssueAuthoringSession({ intent_sha256: intent.intent_sha256, operation: 'initial', requested_slots: intent.slots, provider_issue_id: null, session_ref: 'initial-session', source_session_ref: null, browser_status: 'completed', verification: 'verified', created_at: AT });
  const challenge = buildConnectorChallenge({ intent_sha256: intent.intent_sha256, base_main_sha: intent.base_main_sha, source_session_ref: session.session_ref, targets: [{ kind: 'directory_entries', path: 'src', line: null, expected: 'index.ts' }, { kind: 'text_line', path: 'src/index.ts', line: 1, expected: 'export {};' }, { kind: 'file_sha256', path: 'src/index.ts', line: null, expected: 'b'.repeat(64) }] });
  const snapshot = makeSnapshot(intent, slots);
  const terminal = sealCampaignAuthoringTerminal({ automation_run_id: 'a'.repeat(64), repository_id: intent.repository_id, campaign_id: intent.campaign_id, group_number: 1, intent_sha256: intent.intent_sha256, authorization_sha256: 'b'.repeat(64), budget_sha256: 'c'.repeat(64), budget_revision: 1, max_authoring_rounds: 1, completed_authoring_rounds: 1, reason: slots.length < intent.slots.length ? 'authoring_exhausted' : 'authoring_completed', reservation_refs: [], event_refs: [], ledger_sha256: 'd'.repeat(64), sealed_at: AT });
  return { intent, session, snapshot: { snapshot_receipt: snapshot.receipt, observations: snapshot.observations }, capability_ids: [CAP], authorization_sha256: terminal.authorization_sha256, terminal, challenge, challenge_response: JSON.stringify({ base_main_sha: intent.base_main_sha, answers: challenge.targets.map(t => t.expected) }), response_session_ref: 'challenge-session', model_verified: true };
}
