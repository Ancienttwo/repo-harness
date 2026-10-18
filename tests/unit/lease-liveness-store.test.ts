import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { buildLeaseLivenessPolicy, buildLeaseRenewalObservation, foldLeaseLivenessCurrent } from '../../src/core/state/lease-liveness';
import { coordinationRoot } from '../../src/effects/state/coordination-lease-store';
import { readLeaseLiveness } from '../../src/effects/state/coordination-lease-liveness-store';

const task = 'a'.repeat(64);
function historicalGeneration(root: string, claim: string, generation: number) {
  const policy = buildLeaseLivenessPolicy({ renewal_interval_ms: 1_000, maximum_ttl_ms: 10_000, renewal_actor_kind: 'controller', required_evidence_sources: ['controller'], unproven_behavior: 'require_attention' });
  const renewal = buildLeaseRenewalObservation({ policy, task_id: task, task_revision: 'b'.repeat(64), claim_id: claim, lease_generation: generation, owner_id: 'controller-1', execution_worktree: null, branch: null, observed_at: '2026-09-04T00:00:00.000Z', requested_ttl_ms: 2_000, binding_generation: 1, runtime_effect_id: null, previous: null });
  const current = foldLeaseLivenessCurrent(renewal);
  const base = join(coordinationRoot(root), 'liveness', task);
  const key = createHash('sha256').update(`${claim}\0${generation}`).digest('hex');
  const dir = join(base, 'generations', key);
  mkdirSync(join(dir, 'renewals'), { recursive: true });
  for (const [path, value] of [
    [join(dir, 'policy.json'), policy], [join(dir, 'current.json'), current],
    [join(dir, 'renewals', `${renewal.renewal_sha256.slice(7)}.json`), renewal],
    [join(base, 'current-generation.json'), { protocol: 1, kind: 'repo-harness-lease-liveness-pointer', task_id: task, claim_id: claim, lease_generation: generation, current_sha256: current.current_sha256 }],
  ] as const) writeFileSync(path, `${JSON.stringify(value)}\n`);
  return current;
}

describe('historical lease liveness reader', () => {
  test('reads the selected generation and keeps prior generations addressable', () => {
    const root = mkdtempSync(join(tmpdir(), 'liveness-read-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      const first = historicalGeneration(root, 'claim-1', 1);
      const next = historicalGeneration(root, 'claim-2', 2);
      expect(readLeaseLiveness(root, task).current).toEqual(next);
      expect(readLeaseLiveness(root, task, { claim_id: 'claim-1', lease_generation: 1 }).current.current_sha256).toBe(first.current_sha256);
      const pointer = join(coordinationRoot(root), 'liveness', task, 'current-generation.json');
      writeFileSync(pointer, JSON.stringify({ protocol: 1, kind: 'repo-harness-lease-liveness-pointer', task_id: task, claim_id: 'claim-2', lease_generation: 2, current_sha256: first.current_sha256 }));
      expect(() => readLeaseLiveness(root, task)).toThrow('pointer is stale');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
