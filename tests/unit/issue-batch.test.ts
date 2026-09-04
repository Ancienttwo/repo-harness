import { describe, expect, test } from 'bun:test';

import { messageSha256 } from '../../src/core/messages/mechanics';
import {
  buildIssueAuthoringSession,
  buildIssueBatchIntent,
  declaredIssueBatchSlot,
  parseIssueBatchMarker,
  renderIssueBatchMarker,
  requireVerifiedIssueAuthoringSession,
  validateIssueBatchIntent,
} from '../../src/core/automation/issue-batch';

const sha = (seed: string): string => messageSha256(seed);
const base = 'a'.repeat(40);

function intent() {
  return buildIssueBatchIntent({
    campaign_id: 'campaign-1', group_number: 1, repository_id: 'repo-1', provider_repository: 'acme/widgets',
    target_ref: 'refs/heads/main', base_main_sha: base, slots: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'],
    allowed_issue_kinds: ['bugfix', 'test_gap'], prompt_sha256: sha('prompt'), authoring_policy_sha256: sha('policy'),
    authoring_parent: 'codex', gpt_pro_transport: 'oracle_browser', browser_transport: 'copy_profile', chrome_profile_directory: 'Profile-13',
    created_at: '2026-09-05T00:00:00.000Z', expires_at: '2026-09-06T00:00:00.000Z',
  });
}

describe('IssueBatchIntentV1 and marker authority', () => {
  test('seals exact repo/ref/base SHA, ten slots, and rejects unknown fields or stale bytes', () => {
    const value = intent();
    expect(value).toMatchObject({ repository_id: 'repo-1', provider_repository: 'acme/widgets', target_ref: 'refs/heads/main', base_main_sha: base });
    expect(value.slots).toHaveLength(10);
    expect(() => validateIssueBatchIntent({ ...value, extra: true })).toThrow('fields are invalid');
    expect(() => validateIssueBatchIntent({ ...value, base_main_sha: 'b'.repeat(40) })).toThrow('digest is stale');
    expect(() => buildIssueBatchIntent({ ...value, slots: ['01', '03'] } as never)).toThrow('contiguous prefix');
  });

  test('uses only the exact three-field body marker and ignores title-shaped or foreign issues', () => {
    const value = intent();
    const marker = renderIssueBatchMarker('campaign-1', 1, '01');
    expect(marker).toBe('<!-- repo-harness-campaign:v1\ncampaign_id=campaign-1\ngroup=1\nslot=01\n-->');
    expect(marker).not.toMatch(/sha|digest/);
    expect(parseIssueBatchMarker(marker)).toEqual({ campaign_id: 'campaign-1', group_number: 1, slot: '01' });
    expect(declaredIssueBatchSlot(value, marker)).toBe('01');
    expect(declaredIssueBatchSlot(value, '[rh-campaign:campaign-1:g01:s01][bugfix] title only')).toBeNull();
    expect(declaredIssueBatchSlot(value, renderIssueBatchMarker('other-campaign', 1, '01'))).toBeNull();
    expect(declaredIssueBatchSlot(value, renderIssueBatchMarker('campaign-1', 2, '01'))).toBeNull();
    expect(declaredIssueBatchSlot(value, renderIssueBatchMarker('campaign-1', 1, '11'))).toBeNull();
    expect(parseIssueBatchMarker(`${marker}\n<!-- repo-harness-campaign:v1\ncampaign_id=campaign-1\ngroup=1\nslot=02\ndigest=x\n-->`)).toBeNull();
  });

  test('fails adoption closed for an unverified authoring session', () => {
    const session = buildIssueAuthoringSession({
      intent_sha256: intent().intent_sha256, operation: 'fill_missing', requested_slots: ['08', '09', '10'], provider_issue_id: null,
      session_ref: 'session-2', source_session_ref: 'session-1', browser_status: 'completed', verification: 'unverified', created_at: '2026-09-05T01:00:00.000Z',
    });
    expect(() => requireVerifiedIssueAuthoringSession(session)).toThrow('cannot be adopted');
  });
});
