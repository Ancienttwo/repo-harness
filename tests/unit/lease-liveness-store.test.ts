import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs'; import { tmpdir } from 'os'; import { join } from 'path'; import { spawnSync } from 'child_process';
import { buildLeaseOwnerRecord } from '../../src/core/state/coordination-identity';
import { buildLeaseLivenessPolicy } from '../../src/core/state/lease-liveness';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { readLeaseLiveness, renewLeaseLiveness } from '../../src/effects/state/coordination-lease-liveness-store';
const task = 'a'.repeat(64); const revision = 'b'.repeat(64);
function fixture() { const root = mkdtempSync(join(tmpdir(), 'liveness-store-')); spawnSync('git', ['init', '-q'], { cwd: root }); createLeaseDirectory(root, task); writeLeaseOwnerDurably(root, task, owner()); return root; }
const policy = buildLeaseLivenessPolicy({ renewal_interval_ms: 1_000, maximum_ttl_ms: 10_000, renewal_actor_kind: 'controller', required_evidence_sources: ['controller'], unproven_behavior: 'require_attention' });
function owner(generation = 1, claimId = 'claim-1') { return buildLeaseOwnerRecord({ claimId, taskId: task, taskRevision: revision, sprintPath: 'plans/sprints/a.md', targetRef: 'main', generation, sessionId: 'session-1', sourceWorktree: '/source' }); }
function input(root: string) { return { repo_root: root, owner: owner(), policy, owner_id: 'controller-1', observed_at: '2026-09-04T00:00:00.000Z', requested_ttl_ms: 2_000, binding_generation: 1, runtime_effect_id: null, expected_current_sha256: null }; }
describe('issue #286 lease liveness store', () => {
  test('persists and advances one exact renewal chain', () => { const root = fixture(); try { const first = renewLeaseLiveness(input(root)); const second = renewLeaseLiveness({ ...input(root), observed_at: '2026-09-04T00:00:01.000Z', expected_current_sha256: first.current.current_sha256 }); expect(second.renewal.sequence).toBe(2); expect(readLeaseLiveness(root, task).current.current_sha256).toBe(second.current.current_sha256); } finally { rmSync(root, { recursive: true, force: true }); } });
  test('event-first crash requires exact replay and cannot fork', () => { const root = fixture(); try { expect(() => renewLeaseLiveness({ ...input(root), crash_hook: (point) => { if (point === 'after_renewal_fsync') throw new Error('crash'); } })).toThrow('crash'); expect(() => renewLeaseLiveness({ ...input(root), observed_at: '2026-09-04T00:00:01.000Z' })).toThrow('durable renewal'); const repaired = renewLeaseLiveness(input(root)); expect(repaired.current.sequence).toBe(1); } finally { rmSync(root, { recursive: true, force: true }); } });
  test('preemption starts a new journal and fences the old generation', () => { const root = fixture(); try {
    const first = renewLeaseLiveness(input(root)); const nextOwner = owner(2, 'claim-2'); writeLeaseOwnerDurably(root, task, nextOwner);
    expect(() => renewLeaseLiveness({ ...input(root), expected_current_sha256: first.current.current_sha256 })).toThrow('exact current');
    const next = renewLeaseLiveness({ ...input(root), owner: nextOwner, expected_current_sha256: null });
    expect(next.renewal.sequence).toBe(1); expect(readLeaseLiveness(root, task).current.claim_id).toBe('claim-2');
    expect(readLeaseLiveness(root, task, { claim_id: 'claim-1', lease_generation: 1 }).current.current_sha256).toBe(first.current.current_sha256);
  } finally { rmSync(root, { recursive: true, force: true }); } });
});
