import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { buildModuleMessageEvent } from '../../src/core/engineers/module-message';
import { buildLeaseOwnerRecord, serializeLeaseOwnerRecord } from '../../src/core/state/coordination-identity';
import {
  buildProviderThreadCapabilityObservation,
  buildProviderThreadEffectIntent,
  canonicalProviderThreadCapabilityBytes,
  canonicalProviderThreadEffectIntentBytes,
  validateProviderThreadCapabilityObservation,
  validateProviderThreadEffectIntent,
} from '../../src/core/engineers/provider-thread-effect';
import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import {
  readModuleMessageDelivery,
  recordModuleMessageDeliveryObservation,
  sendModuleMessage,
} from '../../src/effects/engineers/module-inbox';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { leaseOwnerPath } from '../../src/effects/state/coordination-lease-store';
import {
  ProviderThreadEffectStoreError,
  listProviderThreadEffects,
  observeProviderThreadEffect,
  prepareProviderThreadEffect,
  readProviderThreadEffectStatus,
  recordProviderThreadCapability,
  startProviderThreadEffect,
} from '../../src/effects/engineers/provider-thread-effect-store';

const sourceRoot = process.cwd();
const roots: string[] = [];
const engineerId = 'engineer:capability.verification.evals-checks';
const capabilityId = 'capability.verification.evals-checks';
const bindingOne = '11111111-1111-4111-8111-111111111111';
const bindingTwo = '22222222-2222-4222-8222-222222222222';
const messageOne = '33333333-3333-4333-8333-333333333333';
const messageTwo = '44444444-4444-4444-8444-444444444444';
const messageThree = '55555555-5555-4555-8555-555555555555';
const canaryDigest = `sha256:${'a'.repeat(64)}`;
const sentinelTaskId = 'b'.repeat(64);

function fixture(): string {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me3a-effect-')));
  roots.push(repoRoot);
  execFileSync('git', ['init', '-q'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: repoRoot });
  mkdirSync(join(repoRoot, '.archcontext/model'), { recursive: true });
  mkdirSync(join(repoRoot, 'agents'), { recursive: true });
  mkdirSync(join(repoRoot, 'tasks'), { recursive: true });
  mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(repoRoot, 'agents/engineers'), { recursive: true });
  writeFileSync(join(repoRoot, 'tasks/current.md'), 'task authority\n');
  writeFileSync(join(repoRoot, '.ai/harness/fleet.json'), 'fleet authority\n');
  writeFileSync(join(repoRoot, '.ai/harness/acceptance.json'), 'acceptance authority\n');
  const leasePath = leaseOwnerPath(repoRoot, sentinelTaskId);
  mkdirSync(dirname(leasePath), { recursive: true });
  writeFileSync(leasePath, serializeLeaseOwnerRecord(buildLeaseOwnerRecord({
    claimId: 'sentinel-claim',
    taskId: sentinelTaskId,
    taskRevision: 'c'.repeat(64),
    sprintPath: 'plans/sprints/sentinel.md',
    targetRef: 'HEAD',
    generation: 1,
    sessionId: 'session-sentinel',
    sourceWorktree: repoRoot,
  })));
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repoRoot });
  return repoRoot;
}

function authorityBytes(repoRoot: string): Readonly<Record<string, string>> {
  return Object.freeze({
    task: readFileSync(join(repoRoot, 'tasks/current.md'), 'utf8'),
    lease: readFileSync(leaseOwnerPath(repoRoot, sentinelTaskId), 'utf8'),
    fleet: readFileSync(join(repoRoot, '.ai/harness/fleet.json'), 'utf8'),
    acceptance: readFileSync(join(repoRoot, '.ai/harness/acceptance.json'), 'utf8'),
  });
}

function bind(repoRoot: string, bindingId = bindingOne, previous?: ReturnType<typeof readEngineerBindingStatus>['current']) {
  const profile = loadEngineerProfile(repoRoot, engineerId);
  return bindEngineer(repoRoot, {
    engineer_id: engineerId,
    idempotency_key: `bind-${bindingId}`,
    provider: 'codex',
    provider_thread_id: `thread-${bindingId.slice(0, 4)}`,
    host_id: 'local',
    engineer_contract_revision: profile.engineer_contract_revision,
    expected_current_digest: previous?.current_digest ?? null,
    expected_binding_generation: previous?.binding_generation ?? 0,
    expected_binding_id: previous?.current_binding_id ?? null,
    expected_engineer_contract_revision: profile.engineer_contract_revision,
    binding_id: () => bindingId,
    now: () => previous ? '2026-08-25T13:10:00.000Z' : '2026-08-25T13:00:00.000Z',
  });
}

function persistMessage(repoRoot: string, messageId: string, createdAt: string) {
  const profile = loadEngineerProfile(repoRoot, engineerId);
  const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
  return sendModuleMessage({
    repo_root: repoRoot,
    event: buildModuleMessageEvent({
      message_id: messageId,
      capability_id: capabilityId,
      target_engineer_id: engineerId,
      scope: 'assignment',
      target_binding_id: binding.binding_id,
      target_binding_generation: binding.binding_generation,
      target_engineer_contract_revision: binding.engineer_contract_revision,
      message_type: 'work_request',
      subject_ref: null,
      resource_refs: [],
      sender: { kind: 'program_orchestrator', principal_ref: 'human:me3a-test', binding_generation: null },
      body: 'Execute exactly one host-owned Codex turn.',
      created_at: createdAt,
    }),
  });
}

function capability(repoRoot: string, overrides: Partial<Record<'send' | 'resume' | 'observe' | 'stop',
  'supported' | 'unsupported' | 'unavailable' | 'unverifiable'>> = {}) {
  return recordProviderThreadCapability(repoRoot, {
    host_id: 'local',
    operations: {
      send: 'supported',
      resume: 'supported',
      observe: 'supported',
      stop: 'supported',
      ...overrides,
    },
    evidence_refs: [{ ref: 'docs/researches/20260825-runtime-admission-canary.md', sha256: canaryDigest }],
    observed_at: '2026-08-25T13:01:00.000Z',
  });
}

function prepare(repoRoot: string, messageId: string, idempotencyKey: string, operation: 'send' | 'resume' = 'send') {
  const profile = loadEngineerProfile(repoRoot, engineerId);
  const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
  const observed = capability(repoRoot);
  return prepareProviderThreadEffect({
    repo_root: repoRoot,
    engineer_id: engineerId,
    message_id: messageId,
    idempotency_key: idempotencyKey,
    operation,
    expected_binding_id: binding.binding_id,
    expected_binding_generation: binding.binding_generation,
    expected_engineer_contract_revision: binding.engineer_contract_revision,
    expected_capability_sha256: observed.capability_sha256,
    created_at: '2026-08-25T13:02:00.000Z',
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('ME-3A Provider Thread effect adapter', () => {
  test('canonical schemas reject stale digests and never infer missing capability', () => {
    const observed = buildProviderThreadCapabilityObservation({
      host_id: 'local',
      operations: { send: 'supported', resume: 'unverifiable', observe: 'supported', stop: 'unsupported' },
      evidence_refs: [{ ref: 'canary', sha256: canaryDigest }],
      observed_at: '2026-08-25T13:01:00.000Z',
    });
    expect(validateProviderThreadCapabilityObservation(JSON.parse(canonicalProviderThreadCapabilityBytes(observed))))
      .toEqual(observed);
    expect(() => validateProviderThreadCapabilityObservation({ ...observed, capability_sha256: canaryDigest }))
      .toThrow('capability_sha256 is stale');

    const intent = buildProviderThreadEffectIntent({
      idempotency_key: 'schema-intent',
      message_id: messageOne,
      message_event_digest: canaryDigest,
      delivery_attempt: 1,
      engineer_id: engineerId,
      binding_id: bindingOne,
      binding_generation: 1,
      engineer_contract_revision: canaryDigest,
      operation: 'send',
      host_id: 'local',
      provider_thread_id: 'thread-1111',
      capability_sha256: observed.capability_sha256,
      payload: 'bounded payload',
      created_at: '2026-08-25T13:02:00.000Z',
    });
    expect(validateProviderThreadEffectIntent(JSON.parse(canonicalProviderThreadEffectIntentBytes(intent))))
      .toEqual(intent);
    expect(() => validateProviderThreadEffectIntent({ ...intent, payload: 'changed' }))
      .toThrow('derived digest is stale');
  });

  test('persists intent, admits exactly one host action, reconciles lost ACK, and idempotently delivers ME-1C', () => {
    const repoRoot = fixture();
    bind(repoRoot);
    const persisted = persistMessage(repoRoot, messageOne, '2026-08-25T13:01:30.000Z');
    const authorityBefore = authorityBytes(repoRoot);
    const before = execFileSync('git', ['status', '--porcelain=v1'], { cwd: repoRoot, encoding: 'utf8' });
    const prepared = prepare(repoRoot, messageOne, 'effect-lost-ack');
    expect(prepared).toMatchObject({
      intent: {
        message_event_digest: persisted.event.event_digest,
        delivery_attempt: 1,
        adapter_kind: 'codex-app-thread',
      },
      current: { state: 'intent_persisted', sequence: 0 },
    });
    expect(prepare(repoRoot, messageOne, 'effect-lost-ack').intent.intent_sha256)
      .toBe(prepared.intent.intent_sha256);

    const first = startProviderThreadEffect({
      repo_root: repoRoot,
      effect_id: prepared.intent.effect_id,
      started_at: '2026-08-25T13:03:00.000Z',
    });
    expect(first.action).toMatchObject({
      effect_id: prepared.intent.effect_id,
      provider_thread_id: 'thread-1111',
      message_event_digest: persisted.event.event_digest,
    });
    const duplicate = startProviderThreadEffect({
      repo_root: repoRoot,
      effect_id: prepared.intent.effect_id,
      started_at: '2026-08-25T13:04:00.000Z',
    });
    expect(duplicate.action).toBeNull();
    expect(duplicate.current.state).toBe('reconciliation_required');

    const observed = observeProviderThreadEffect({
      repo_root: repoRoot,
      effect_id: prepared.intent.effect_id,
      state: 'observed_success',
      message_event_digest: persisted.event.event_digest,
      host_id: 'local',
      provider_thread_id: 'thread-1111',
      provider_turn_id: '01a03901-1cc7-7da0-9030-a2952b14018d',
      provider_user_message_id: '01a03901-28c7-72c0-9d49-b13b631787a4',
      provider_assistant_message_id: 'msg_02baa1d254731806016a8d91b8d7bc87d0a4cc46c9fe0ecd7f',
      provider_effect_ref: 'RUNTIME_ADMISSION_CANARY_ACK_5b1aa6af',
      failure_class: 'none',
      usage: { authority: 'unavailable', input_tokens: null, cached_input_tokens: null, output_tokens: null },
      observed_at: '2026-08-25T13:05:00.000Z',
    });
    expect(observed.current.state).toBe('observed_success');
    expect(readModuleMessageDelivery({ repo_root: repoRoot, engineer_id: engineerId, message_id: messageOne }).receipt)
      .toMatchObject({ delivery_state: 'delivered', attempt: 1 });
    expect(observeProviderThreadEffect({
      repo_root: repoRoot,
      effect_id: prepared.intent.effect_id,
      state: 'observed_success',
      message_event_digest: persisted.event.event_digest,
      host_id: 'local',
      provider_thread_id: 'thread-1111',
      provider_turn_id: '01a03901-1cc7-7da0-9030-a2952b14018d',
      provider_user_message_id: '01a03901-28c7-72c0-9d49-b13b631787a4',
      provider_assistant_message_id: 'msg_02baa1d254731806016a8d91b8d7bc87d0a4cc46c9fe0ecd7f',
      provider_effect_ref: 'RUNTIME_ADMISSION_CANARY_ACK_5b1aa6af',
      failure_class: 'none',
      usage: { authority: 'unavailable', input_tokens: null, cached_input_tokens: null, output_tokens: null },
      observed_at: '2026-08-25T13:05:00.000Z',
    }).observation.observation_sha256).toBe(observed.observation.observation_sha256);
    expect(listProviderThreadEffects(repoRoot, engineerId)).toHaveLength(1);
    expect(authorityBytes(repoRoot)).toEqual(authorityBefore);
    expect(execFileSync('git', ['status', '--porcelain=v1'], { cwd: repoRoot, encoding: 'utf8' })).toBe(before);
  });

  test('repairs current after crash at observation fsync and never re-emits the action', () => {
    const repoRoot = fixture();
    bind(repoRoot);
    persistMessage(repoRoot, messageTwo, '2026-08-25T13:01:31.000Z');
    const prepared = prepare(repoRoot, messageTwo, 'effect-crash');
    expect(() => startProviderThreadEffect({
      repo_root: repoRoot,
      effect_id: prepared.intent.effect_id,
      started_at: '2026-08-25T13:03:00.000Z',
      crash_hook(boundary) {
        if (boundary === 'after_observation_fsync') throw new Error('simulated crash');
      },
    })).toThrow('simulated crash');
    expect(readProviderThreadEffectStatus(repoRoot, prepared.intent.effect_id).current.state).toBe('effect_started');
    const retry = startProviderThreadEffect({
      repo_root: repoRoot,
      effect_id: prepared.intent.effect_id,
      started_at: '2026-08-25T13:04:00.000Z',
    });
    expect(retry.action).toBeNull();
    expect(retry.current.state).toBe('reconciliation_required');
  });

  test('revalidates the exact pending ME-1C attempt before admitting a host action', () => {
    const repoRoot = fixture();
    bind(repoRoot);
    const persisted = persistMessage(repoRoot, messageTwo, '2026-08-25T13:01:31.000Z');
    const prepared = prepare(repoRoot, messageTwo, 'effect-receipt-race');
    recordModuleMessageDeliveryObservation({
      repo_root: repoRoot,
      engineer_id: engineerId,
      message_id: messageTwo,
      expected_message_event_digest: persisted.event.event_digest,
      expected_attempt: 1,
      result: {
        outcome: 'delivered',
        provider_delivery_ref: 'another-authoritative-delivery',
        observed_at: '2026-08-25T13:02:30.000Z',
      },
    });

    expect(() => startProviderThreadEffect({
      repo_root: repoRoot,
      effect_id: prepared.intent.effect_id,
      started_at: '2026-08-25T13:03:00.000Z',
    })).toThrow('effect no longer matches the exact pending ME-1C delivery attempt');
    expect(readProviderThreadEffectStatus(repoRoot, prepared.intent.effect_id).current.state).toBe('intent_persisted');
  });

  test('fails closed on Binding rotation, unsupported capability, and incomplete success correlation', () => {
    const repoRoot = fixture();
    const firstBinding = bind(repoRoot);
    persistMessage(repoRoot, messageThree, '2026-08-25T13:01:32.000Z');
    const prepared = prepare(repoRoot, messageThree, 'effect-stale');
    bind(repoRoot, bindingTwo, firstBinding);
    expect(() => startProviderThreadEffect({
      repo_root: repoRoot,
      effect_id: prepared.intent.effect_id,
      started_at: '2026-08-25T13:03:00.000Z',
    })).toThrow(ProviderThreadEffectStoreError);
    expect(readProviderThreadEffectStatus(repoRoot, prepared.intent.effect_id).current.state).toBe('intent_persisted');

    const otherRoot = fixture();
    bind(otherRoot);
    persistMessage(otherRoot, messageOne, '2026-08-25T13:01:30.000Z');
    const profile = loadEngineerProfile(otherRoot, engineerId);
    const binding = readEngineerBindingStatus(otherRoot, engineerId, profile.engineer_contract_revision).binding!;
    const unsupported = capability(otherRoot, { resume: 'unsupported' });
    expect(() => prepareProviderThreadEffect({
      repo_root: otherRoot,
      engineer_id: engineerId,
      message_id: messageOne,
      idempotency_key: 'unsupported-resume',
      operation: 'resume',
      expected_binding_id: binding.binding_id,
      expected_binding_generation: binding.binding_generation,
      expected_engineer_contract_revision: binding.engineer_contract_revision,
      expected_capability_sha256: unsupported.capability_sha256,
      created_at: '2026-08-25T13:02:00.000Z',
    })).toThrow('resume capability is unsupported');

    const sendPrepared = prepare(otherRoot, messageOne, 'effect-incomplete');
    startProviderThreadEffect({
      repo_root: otherRoot,
      effect_id: sendPrepared.intent.effect_id,
      started_at: '2026-08-25T13:03:00.000Z',
    });
    expect(() => observeProviderThreadEffect({
      repo_root: otherRoot,
      effect_id: sendPrepared.intent.effect_id,
      state: 'observed_success',
      message_event_digest: sendPrepared.intent.message_event_digest,
      host_id: 'local',
      provider_thread_id: 'thread-1111',
      provider_turn_id: 'turn',
      provider_user_message_id: null,
      provider_assistant_message_id: 'assistant',
      provider_effect_ref: null,
      failure_class: 'none',
      usage: { authority: 'unavailable', input_tokens: null, cached_input_tokens: null, output_tokens: null },
      observed_at: '2026-08-25T13:05:00.000Z',
    })).toThrow('requires exact Provider correlation');
  });
});
