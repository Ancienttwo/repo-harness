import { describe, expect, test } from 'bun:test';

import {
  buildDevelopmentCampaignDefinition,
  buildDevelopmentCampaignEvent,
  foldDevelopmentCampaignCurrent,
  validateDevelopmentCampaignDefinition,
  validateDevelopmentCampaignEvent,
} from '../../src/core/automation/development-campaign';

const hex = (seed: string): string => new Bun.CryptoHasher('sha256').update(seed).digest('hex');
const observedAt = '2026-09-05T00:00:00.000Z';

function definition() {
  return buildDevelopmentCampaignDefinition({
    campaign_id: 'campaign-1', authorization_id: 'authorization-1', authorization_sha256: hex('authorization'),
    repository_id: 'repo-1', target_ref: 'refs/heads/main', target_revision: hex('target').slice(0, 40), created_at: observedAt,
  });
}

describe('development campaign canonical protocol', () => {
  test('uses exact keys and content-bound digests', () => {
    const campaign = definition();
    expect(validateDevelopmentCampaignDefinition(campaign)).toEqual(campaign);
    expect(() => validateDevelopmentCampaignDefinition({ ...campaign, extra: true })).toThrow('fields are invalid');
    expect(() => validateDevelopmentCampaignDefinition({ ...campaign, campaign_sha256: `sha256:${hex('wrong')}` })).toThrow('digest is stale');
  });

  test('folds one contiguous append-only chain into current', () => {
    const campaign = definition();
    const first = buildDevelopmentCampaignEvent({ campaign_id: campaign.campaign_id, revision: 1, idempotency_key: 'authorize-1', operation: 'authorize', previous_state: null, evidence_refs: [], observed_at: observedAt, previous_event_sha256: null });
    const second = buildDevelopmentCampaignEvent({ campaign_id: campaign.campaign_id, revision: 2, idempotency_key: 'group-1', operation: 'prepare_group', previous_state: first.next_state, evidence_refs: ['intent-1'], observed_at: observedAt, previous_event_sha256: first.event_sha256 });
    expect(validateDevelopmentCampaignEvent(second)).toEqual(second);
    expect(foldDevelopmentCampaignCurrent(campaign, [first, second])).toMatchObject({ revision: 2, state: 'group_preparing', current_event_sha256: second.event_sha256 });
    expect(() => foldDevelopmentCampaignCurrent(campaign, [second])).toThrow('not contiguous');
  });

  test('rejects transitions outside the frozen state machine', () => {
    expect(() => buildDevelopmentCampaignEvent({ campaign_id: 'campaign-1', revision: 1, idempotency_key: 'complete-early', operation: 'complete', previous_state: null, evidence_refs: [], observed_at: observedAt, previous_event_sha256: null })).toThrow('cannot follow empty');
  });
});
