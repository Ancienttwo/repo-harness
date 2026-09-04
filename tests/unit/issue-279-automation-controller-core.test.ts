import { describe, expect, test } from 'bun:test';
import {
  AutomationControllerError,
  buildAutomationControllerEvent,
  buildAutomationControllerRun,
  foldAutomationControllerCurrent,
  nextAutomationControllerState,
} from '../../src/core/automation/controller';
import { buildLeaseLivenessPolicy } from '../../src/core/state/lease-liveness';

const SHA = `sha256:${'a'.repeat(64)}`;
const RUN_ID = `sha256:${'b'.repeat(64)}`;

function run() {
  return buildAutomationControllerRun({
    run_id: RUN_ID,
    repository_id: 'repo_0123456789abcdef',
    principal: {
      authorization_id: 'authorization-1',
      engineer_id: 'engineer:capability.runtime-harness.automation',
      binding_id: '11111111-1111-4111-8111-111111111111',
      binding_generation: 3,
      engineer_contract_revision: SHA,
      authorization_revision: 7,
    },
    budget_sha256: SHA,
    policy: {
      maximum_steps_per_invocation: 8,
      maximum_duration_ms: 60_000,
      maximum_transient_retries: 3,
      initial_backoff_ms: 500,
      maximum_backoff_ms: 8_000,
      lease_liveness: buildLeaseLivenessPolicy({ renewal_interval_ms: 1_000, maximum_ttl_ms: 10_000, renewal_actor_kind: 'controller', required_evidence_sources: ['controller'], unproven_behavior: 'require_attention' }),
    },
    protected_paths: ['plans', 'tasks'],
    created_at: '2026-09-04T00:00:00.000Z',
  });
}

function event(
  operation: Parameters<typeof buildAutomationControllerEvent>[0]['operation'],
  revision: number,
  previous: ReturnType<typeof foldAutomationControllerCurrent> | null,
  extra: Partial<Parameters<typeof buildAutomationControllerEvent>[0]> = {},
) {
  return buildAutomationControllerEvent({
    run_id: RUN_ID,
    revision,
    idempotency_key: `step-${revision}`,
    operation,
    previous_state: previous?.state ?? null,
    attention_owner: 'none',
    blocker: null,
    retry_at: null,
    receipt: {
      operation,
      outcome: 'ok',
      work_package_id: null,
      task_id: null,
      claim_id: null,
      lease_generation: null,
      work_envelope_sha256: null,
      dispatch_id: null,
      runtime_effect_id: null,
      evidence_refs: [],
    },
    observed_at: `2026-09-04T00:00:0${revision}.000Z`,
    previous_event_sha256: previous?.current_event_sha256 ?? null,
    ...extra,
  });
}

describe('issue #279 automation controller core', () => {
  test('freezes the principal, budget and bounded invocation policy', () => {
    const value = run();
    expect(value.run_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(value.policy.maximum_steps_per_invocation).toBe(8);
    expect(() => buildAutomationControllerRun({ ...value, policy: { ...value.policy, maximum_steps_per_invocation: 65 } })).toThrow('<= 64');
    expect(() => buildAutomationControllerRun({ ...value, policy: { ...value.policy, maximum_backoff_ms: 100 } })).toThrow('must be >=');
  });

  test('walks observation through one exact acquisition and dispatch evidence boundary', () => {
    const definition = run();
    let current = foldAutomationControllerCurrent(definition, null, event('start', 1, null));
    current = foldAutomationControllerCurrent(definition, current, event('observe', 2, current));
    current = foldAutomationControllerCurrent(definition, current, event('begin_acquire', 3, current));
    const acquired = event('acquired', 4, current, {
      receipt: {
        operation: 'acquired', outcome: 'acquired', work_package_id: 'wp-1', task_id: 'c'.repeat(64),
        claim_id: '22222222-2222-4222-8222-222222222222', lease_generation: 1,
        work_envelope_sha256: SHA, dispatch_id: null, runtime_effect_id: null, evidence_refs: [`work-envelope:${SHA}`],
      },
    });
    current = foldAutomationControllerCurrent(definition, current, acquired);
    expect(current.state).toBe('executing');
    current = foldAutomationControllerCurrent(definition, current, event('dispatch_started', 5, current, {
      receipt: { ...acquired.receipt, operation: 'dispatch_started', outcome: 'started', dispatch_id: SHA },
    }));
    expect(current.state).toBe('waiting_for_evidence');
  });

  test('user blockers terminate without entering a retry state', () => {
    const definition = run();
    let current = foldAutomationControllerCurrent(definition, null, event('start', 1, null));
    current = foldAutomationControllerCurrent(definition, current, event('observe', 2, current));
    current = foldAutomationControllerCurrent(definition, current, event('block', 3, current, {
      attention_owner: 'user', blocker: 'approval_required', receipt: {
        operation: 'block', outcome: 'user_blocked', work_package_id: null, task_id: null,
        claim_id: null, lease_generation: null, work_envelope_sha256: null, dispatch_id: null,
        runtime_effect_id: null, evidence_refs: ['blocker:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      },
    }));
    expect(current.state).toBe('blocked');
    expect(() => nextAutomationControllerState('blocked', 'retry_wait')).toThrow(AutomationControllerError);
  });

  test('explicit stop cannot silently discard an uncertain side effect', () => {
    expect(nextAutomationControllerState('observing', 'request_stop')).toBe('stopping');
    expect(nextAutomationControllerState('stopping', 'stop')).toBe('stopped');
    expect(nextAutomationControllerState('executing', 'request_stop')).toBe('stopping');
    expect(nextAutomationControllerState('executing', 'require_reconciliation')).toBe('reconciliation_required');
    expect(() => nextAutomationControllerState('executing', 'stop')).toThrow('cannot stop');
  });

  test('folding rejects a stale or forked event chain', () => {
    const definition = run();
    const first = foldAutomationControllerCurrent(definition, null, event('start', 1, null));
    expect(() => foldAutomationControllerCurrent(definition, first, event('observe', 3, first))).toThrow('does not extend');
  });
});
