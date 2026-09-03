import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

import { buildAutomationControllerRun } from '../../src/core/automation/controller';
import {
  AutomationControllerStoreError,
  appendAutomationControllerEvent,
  readAutomationControllerStatus,
  startAutomationControllerRun,
} from '../../src/effects/automation/controller-store';

const SHA = `sha256:${'a'.repeat(64)}`;
function fixture(): string { const root = mkdtempSync(join(tmpdir(), 'controller-store-')); spawnSync('git', ['init', '-q'], { cwd: root }); return root; }
function definition(runId = `sha256:${'b'.repeat(64)}`) {
  return buildAutomationControllerRun({
    run_id: runId, repository_id: 'repo_0123456789abcdef',
    principal: { authorization_id: 'authorization-1', engineer_id: 'engineer:capability.runtime-harness.automation', binding_id: '11111111-1111-4111-8111-111111111111', binding_generation: 1, engineer_contract_revision: SHA, authorization_revision: 1 },
    budget_sha256: SHA,
    policy: { maximum_steps_per_invocation: 4, maximum_duration_ms: 10_000, maximum_transient_retries: 2, initial_backoff_ms: 100, maximum_backoff_ms: 1_000 },
    created_at: '2026-09-04T00:00:00.000Z',
  });
}
function emptyReceipt(operation: 'observe') { return { operation, outcome: 'observed', work_package_id: null, task_id: null, claim_id: null, lease_generation: null, work_envelope_sha256: null, dispatch_id: null, runtime_effect_id: null, evidence_refs: [] } as const; }

describe('issue #279 automation controller store', () => {
  test('same-key start is idempotent and one Engineer has one current controller', () => {
    const root = fixture();
    try {
      const first = startAutomationControllerRun({ repo_root: root, run: definition(), idempotency_key: 'start-1', observed_at: '2026-09-04T00:00:00.000Z' });
      const replay = startAutomationControllerRun({ repo_root: root, run: definition(), idempotency_key: 'start-1', observed_at: '2026-09-04T00:00:00.000Z' });
      expect(replay.current.current_sha256).toBe(first.current.current_sha256);
      expect(() => startAutomationControllerRun({ repo_root: root, run: definition(`sha256:${'c'.repeat(64)}`), idempotency_key: 'start-2', observed_at: '2026-09-04T00:00:01.000Z' })).toThrow(AutomationControllerStoreError);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('event-first crash repairs the same exact chain and stale CAS cannot fork it', () => {
    const root = fixture();
    try {
      const started = startAutomationControllerRun({ repo_root: root, run: definition(), idempotency_key: 'start-1', observed_at: '2026-09-04T00:00:00.000Z' });
      const input = { repo_root: root, run_id: started.run.run_id, expected_current_sha256: started.current.current_sha256, idempotency_key: 'observe-1', operation: 'observe' as const, attention_owner: 'none' as const, blocker: null, retry_at: null, receipt: emptyReceipt('observe'), observed_at: '2026-09-04T00:00:01.000Z' };
      expect(() => appendAutomationControllerEvent({ ...input, crash_hook: (point) => { if (point === 'after_event_fsync') throw new Error('crash'); } })).toThrow('crash');
      expect(readAutomationControllerStatus(root, started.run.run_id).current.state).toBe('created');
      const repaired = appendAutomationControllerEvent(input);
      expect(repaired.current.state).toBe('observing');
      expect(appendAutomationControllerEvent(input).current.current_sha256).toBe(repaired.current.current_sha256);
      expect(() => appendAutomationControllerEvent({ ...input, idempotency_key: 'observe-2' })).toThrow('controller current changed');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
