import { expect, test } from 'bun:test';
import { buildLeaseLivenessPolicy, validateLeaseLivenessPolicy } from '../../src/core/state/lease-liveness';

test('liveness policy survives canonical grant key ordering without accepting changed policy or digest', () => {
  const policy = buildLeaseLivenessPolicy({ renewal_interval_ms: 1000, maximum_ttl_ms: 6000, renewal_actor_kind: 'controller', required_evidence_sources: ['controller', 'runtime_effect'], unproven_behavior: 'require_attention' });
  const transported = Object.fromEntries(Object.entries(policy).sort(([a], [b]) => a.localeCompare(b)));
  expect(validateLeaseLivenessPolicy(transported)).toEqual(policy);
  expect(() => validateLeaseLivenessPolicy({ ...transported, maximum_ttl_ms: 7000 })).toThrow();
  expect(() => validateLeaseLivenessPolicy({ ...transported, policy_sha256: 'sha256:' + '0'.repeat(64) })).toThrow();
  expect(() => validateLeaseLivenessPolicy({ ...transported, invented: true })).toThrow();
});
