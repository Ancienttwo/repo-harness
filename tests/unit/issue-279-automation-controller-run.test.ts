import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

import { buildAutomationControllerRun } from '../../src/core/automation/controller';
import { workEnvelopeSha256 } from '../../src/core/engineers/principal-claim';
import { buildLeaseLivenessPolicy } from '../../src/core/state/lease-liveness';
import { startAutomationControllerRun } from '../../src/effects/automation/controller-store';
import { stepAutomationController, stopAutomationController } from '../../src/effects/automation/controller-run';

const SHA = `sha256:${'a'.repeat(64)}`;
const RUN_ID = `sha256:${'b'.repeat(64)}`;
const principal = {
  protocol: 1, kind: 'repo-harness-engineer-principal', repository_id: 'repo_0123456789abcdef',
  engineer_id: 'engineer:capability.runtime-harness.automation', binding_id: '11111111-1111-4111-8111-111111111111',
  binding_generation: 1, engineer_contract_revision: SHA, carrier: 'mcp_oauth', auth_subject: 'authorization-1',
  provider: 'tmux-cli-agent', provider_thread_id: null,
} as const;

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'controller-run-')); spawnSync('git', ['init', '-q'], { cwd: root });
  const run = buildAutomationControllerRun({ run_id: RUN_ID, repository_id: principal.repository_id,
    principal: { authorization_id: principal.auth_subject, engineer_id: principal.engineer_id, binding_id: principal.binding_id, binding_generation: 1, engineer_contract_revision: SHA, authorization_revision: 7 }, budget_sha256: SHA,
    policy: { maximum_steps_per_invocation: 8, maximum_duration_ms: 10_000, maximum_transient_retries: 2, initial_backoff_ms: 100, maximum_backoff_ms: 1_000, lease_liveness: buildLeaseLivenessPolicy({ renewal_interval_ms: 1_000, maximum_ttl_ms: 10_000, renewal_actor_kind: 'controller', required_evidence_sources: ['controller'], unproven_behavior: 'require_attention' }) }, protected_paths: ['plans', 'tasks'], created_at: '2026-09-04T00:00:00.000Z' });
  startAutomationControllerRun({ repo_root: root, run, idempotency_key: 'start', observed_at: run.created_at }); return { root, run };
}

function dependencies(acquire: unknown, dispatch: unknown = null) {
  let reservation = 0;
  return {
    now: () => new Date('2026-09-04T00:00:01.000Z'), resolvePrincipal: () => principal as never,
    authorizationRevision: () => 7,
    readBudget: () => ({ budget: { budget_sha256: SHA, unattended: true, engineer_id: principal.engineer_id }, current: { state: 'active' }, stored_current: {}, stop_receipt: null, drift: 'none', latest_record_at: null }) as never,
    reserveBudget: () => ({ reservation_sha256: `sha256:${String(++reservation).padStart(64, '0')}` }) as never,
    appendUsage: () => ({ event: { event_sha256: `sha256:${'e'.repeat(64)}` }, current: {}, stop_receipt: null }) as never,
    acquireNext: () => acquire as never, dispatch: () => dispatch as never,
    readLease: () => ({ record: { task_id: 'c'.repeat(64), task_revision: 'd'.repeat(64), claim_id: '22222222-2222-4222-8222-222222222222', generation: 1, execution_worktree: null, branch: null, state: 'reserving' } }) as never,
    renewLiveness: () => ({ renewal: { renewal_sha256: SHA }, current: {} }) as never,
  };
}

function acquired(root: string) {
  return { ok: true, offer: { work_package_id: 'wp-1', work_package_revision: SHA, sprint_path: 'plans/sprints/test.sprint.md', task_id: 'c'.repeat(64), task_revision: 'd'.repeat(64), eligible_since: '2026-09-04T00:00:00.000Z', retry_policy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'fixed', initial_seconds: 30, maximum_seconds: 30 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } }, envelope: { protocol: 1, kind: 'repo-harness-work-envelope', repo_id: principal.repository_id, task_id: 'c'.repeat(64), task_revision: 'd'.repeat(64), sprint_path: 'plans/sprints/test.sprint.md', claim_id: '22222222-2222-4222-8222-222222222222', generation: 1, worktree_path: root, branch: 'codex/test', unit_ref: 'unit', authorization_revision: 7, offer_revision: SHA, canonical_target: {}, plan: {}, claim_token: {} }, receipt: { receipt_sha256: SHA } } as const;
}

function dispatchAuthority(root: string, change: { task_id?: string; task_revision?: string; claim_id?: string; lease_generation?: number; work_envelope_sha256?: string; engineer_id?: string; binding_id?: string; binding_generation?: number } = {}) {
  const acquisition = acquired(root);
  return {
    intent: { dispatch_id: SHA, admission_receipt_sha256: SHA },
    admission: { decision: 'admitted', envelope_sha256: SHA },
    envelope: {
      parent: {
        task_id: change.task_id ?? acquisition.envelope.task_id,
        task_revision: change.task_revision ?? acquisition.envelope.task_revision,
        claim_id: change.claim_id ?? acquisition.envelope.claim_id,
        lease_generation: change.lease_generation ?? acquisition.envelope.generation,
        work_envelope_sha256: change.work_envelope_sha256 ?? workEnvelopeSha256(acquisition.envelope as never),
      },
      engineer: {
        engineer_id: change.engineer_id ?? principal.engineer_id,
        binding_id: change.binding_id ?? principal.binding_id,
        binding_generation: change.binding_generation ?? principal.binding_generation,
      },
    },
  };
}

describe('issue #279 bounded controller orchestration', () => {
  test('persists acquisition before consuming a real WorkEnvelope and dispatches only through the fenced dependency', () => {
    const { root } = setup();
    try {
      const acquisition = acquired(root);
      const first = stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'step-1' }, dependencies(acquisition));
      expect(first.current.state).toBe('executing');
      expect(first.acquisition?.ok).toBe(true);
      let dispatchCalls = 0;
      const dispatched = { current: { state: 'completed', observation_sha256: SHA } };
      const second = stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'step-2', dispatch_id: SHA }, { ...dependencies(acquisition, dispatched), readDispatchAuthority: () => dispatchAuthority(root), dispatch: () => { dispatchCalls += 1; return dispatched as never; } } as never);
      expect(dispatchCalls).toBe(1);
      expect(second.current.state).toBe('observing');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test.each([
    ['task', { task_id: 'e'.repeat(64) }],
    ['task revision', { task_revision: 'e'.repeat(64) }],
    ['claim', { claim_id: '44444444-4444-4444-8444-444444444444' }],
    ['claim generation', { lease_generation: 2 }],
    ['WorkEnvelope digest', { work_envelope_sha256: `sha256:${'f'.repeat(64)}` }],
    ['Engineer', { engineer_id: 'engineer:capability.runtime-harness.other' }],
    ['Engineer Binding', { binding_id: '33333333-3333-4333-8333-333333333333' }],
    ['Engineer Binding generation', { binding_generation: 2 }],
  ] as const)('rejects a dispatch for a different %s before any host action', (_label, mismatch) => {
    const { root } = setup();
    try {
      const acquisition = acquired(root);
      stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'acquire' }, dependencies(acquisition));
      let reservations = 0; let attempts = 0; let launches = 0; let attributions = 0;
      const deps = {
        ...dependencies(acquisition),
        readDispatchAuthority: () => dispatchAuthority(root, mismatch),
        reserveBudget: () => { reservations += 1; return { reservation_sha256: SHA } as never; },
        startAttempt: () => { attempts += 1; throw new Error('must not start attempt'); },
        dispatch: () => { launches += 1; throw new Error('must not launch'); },
        appendUsage: () => { attributions += 1; throw new Error('must not attribute usage'); },
        completeAttempt: () => { attributions += 1; throw new Error('must not attribute outcome'); },
      };
      expect(() => stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'dispatch', dispatch_id: SHA }, deps as never)).toThrow('does not match acquired authority');
      expect({ reservations, attempts, launches, attributions }).toEqual({ reservations: 0, attempts: 0, launches: 0, attributions: 0 });
      expect(stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'inspect' }, deps as never).current.state).toBe('executing');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('an unresolved persisted acquisition boundary becomes reconciliation_required instead of claiming twice', () => {
    const { root } = setup();
    try {
      const deps = dependencies({ ok: false, error: 'engineer_no_eligible_offer', message: 'none' });
      const first = stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'step-1' }, { ...deps, acquireNext: () => { throw new Error('crash after side effect boundary'); } });
      expect(first).toBeUndefined();
    } catch (error) {
      expect((error as Error).message).toContain('crash');
      const recovered = stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'step-2' }, dependencies({ ok: false }));
      expect(recovered.current.state).toBe('reconciliation_required');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('transient acquisition failures persist deterministic bounded backoff and then stop', () => {
    const { root } = setup(); let now = 1_000; let calls = 0; let reservation = 0;
    const deps = {
      ...dependencies({ ok: false }), now: () => new Date(Date.parse('2026-09-04T00:00:00.000Z') + now),
      acquireNext: () => { calls += 1; return { ok: false, error: 'engineer_concurrency_unavailable', message: 'busy' } as never; },
      reserveBudget: () => ({ reservation_sha256: `sha256:${String(++reservation).padStart(64, '0')}` }) as never,
    };
    try {
      const first = stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'retry-1' }, deps);
      expect(first.current.state).toBe('observing'); expect(first.current.consecutive_transient_failures).toBe(1); expect(calls).toBe(1);
      stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'too-early' }, deps); expect(calls).toBe(1);
      now += 100;
      const second = stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'retry-2' }, deps); expect(second.current.consecutive_transient_failures).toBe(2);
      now += 200;
      const third = stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'retry-3' }, deps); expect(third.current.state).toBe('blocked'); expect(third.current.blocker).toBe('transient_retry_exhausted');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('explicit stop prevents later acquisition without releasing work authority', () => {
    const { root } = setup(); let calls = 0;
    try {
      const stopped = stopAutomationController(root, RUN_ID, 'stop-1', { now: () => new Date('2026-09-04T00:00:02.000Z') });
      expect(stopped.current.state).toBe('stopped');
      const result = stepAutomationController({ repo_root: root, run_id: RUN_ID, idempotency_key: 'after-stop' }, { ...dependencies({ ok: false }), acquireNext: () => { calls += 1; return { ok: false } as never; } });
      expect(result.current.state).toBe('stopped'); expect(calls).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
