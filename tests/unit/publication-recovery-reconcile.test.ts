import { describe, expect, test } from 'bun:test';
import { buildPublicationIntegrationObservation, validatePublicationIntegrationObservation, canonicalPublicationIntegrationObservationBytes } from '../../src/core/publication/publication-lifecycle';

describe('historical integration observations', () => {
  test('integration observations are deterministic and reject stale or unknown schema fields', () => {
    const input = {
      publication_id: `sha256:${'a'.repeat(64)}`, receipt_sha256: `sha256:${'b'.repeat(64)}`,
      task_id: '1'.repeat(64), task_revision: '2'.repeat(64), claim_id: 'claim-observation', generation: 1,
      head_sha: 'c'.repeat(40), target_ref: 'main', fetched_target_oid: 'd'.repeat(40),
      observation_ref: `refs/repo-harness/observations/publication/${'a'.repeat(64)}/${'d'.repeat(40)}`,
      provider_pr_number: 1, provider_state: 'MERGED', provider_merged_at: '2026-08-22T05:05:55Z' as string | null,
      integration_state: 'merged' as const,
    };
    const first = buildPublicationIntegrationObservation(input);
    expect(buildPublicationIntegrationObservation(input)).toEqual(first);
    expect(buildPublicationIntegrationObservation({ ...input, fetched_target_oid: 'e'.repeat(40) }).observation_id).not.toBe(first.observation_id);
    expect(validatePublicationIntegrationObservation(first)).toEqual(first);
    expect(() => validatePublicationIntegrationObservation({ ...first, unknown: true })).toThrow('fields are invalid');
    expect(() => validatePublicationIntegrationObservation({ ...first, observation_id: `sha256:${'f'.repeat(64)}` })).toThrow('id is stale');
  });

});
