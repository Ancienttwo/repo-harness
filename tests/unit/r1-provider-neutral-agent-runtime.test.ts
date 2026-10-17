import { boundLeaseFixture } from '../helpers/sprint-fixture';
import {
  seedEngineerBinding,
  claimActorReceiptFixture,
  seedClaimActorReceipt,
} from '../helpers/engineer-state-fixture';
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildTaskMessageDeliveryReceipt,
  buildTaskMessageEvent,
  canonicalTaskMessageDeliveryReceiptBytes,
  transitionTaskMessageDeliveryReceipt,
  validateTaskMessageDeliveryReceipt,
} from '../../src/core/fleet/task-message';
import { buildLeaseOwnerRecord, deriveTaskRevision } from '../../src/core/state/coordination-identity';
import {
  buildAgentRuntimeCapabilityObservation,
  buildAgentRuntimeEffectCurrent,
  buildAgentRuntimeEffectIntent,
  buildAgentRuntimeEffectObservation,
  buildAgentRuntimeHostAction,
  canonicalAgentRuntimeCapabilityBytes,
  canonicalAgentRuntimeEffectIntentBytes,
  deriveAgentRuntimeEffectId,
  validateAgentRuntimeCapabilityObservation,
  validateAgentRuntimeEffectIntent,
} from '../../src/core/engineers/agent-runtime-effect';
import { readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { readAgentRuntimePolicy } from '../../src/effects/engineers/agent-runtime-feature';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { deliverTaskInbox, sendTaskMessage } from '../../src/effects/fleet/task-inbox';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import {
  AgentRuntimeEffectStoreError,
  projectTaskAgentRuntimeState,
  observeAgentRuntimeEffect,
  prepareAgentRuntimeEffect,
  readAgentRuntimeEffectStatus,
  recordAgentRuntimeCapability,
  startAgentRuntimeEffect,
} from '../../src/effects/engineers/agent-runtime-effect-store';
import { seedEngineerTaskMessage, releaseEngineerTaskMessage } from '../helpers/engineer-runtime-fixture';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const sourceRoot = process.cwd();
const roots: string[] = [];
const engineerId = 'engineer:capability.verification.evals-checks';
const bindingOne = '11111111-1111-4111-8111-111111111111';
const bindingTwo = '22222222-2222-4222-8222-222222222222';
const messageOne = '33333333-3333-4333-8333-333333333333';
const digest = `sha256:${'a'.repeat(64)}`;

function fixture(adapter: 'herdr-cli-agent' = 'herdr-cli-agent'): string {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-r1-runtime-'))); roots.push(repoRoot);
  execFileSync('git', ['init', '-q'], { cwd: repoRoot }); execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: repoRoot }); execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: repoRoot });
  mkdirSync(join(repoRoot, '.archcontext/model'), { recursive: true }); mkdirSync(join(repoRoot, 'agents'), { recursive: true }); mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/manifest.yaml'), join(repoRoot, '.archcontext/manifest.yaml')); cpSync(join(sourceRoot, 'agents/engineers'), join(repoRoot, 'agents/engineers'), { recursive: true });
  writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ agent_runtime: { mode: 'active', adapters: { 'herdr-cli-agent': { enabled: true } } } })}\n`);
  execFileSync('git', ['add', '.'], { cwd: repoRoot }); execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repoRoot });
  bind(repoRoot, adapter, bindingOne); return repoRoot;
}

function bind(repoRoot: string, adapter: 'herdr-cli-agent', bindingId: string) {
  const profile = loadEngineerProfile(repoRoot, engineerId); const status = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision); const previous = status.current;
  return seedEngineerBinding(repoRoot, {
    engineer_id: engineerId, idempotency_key: `bind-${bindingId}`, provider: adapter, provider_thread_id: `endpoint-${bindingId.slice(0, 4)}`, host_id: 'local', engineer_contract_revision: profile.engineer_contract_revision,
    expected_current_digest: status.binding ? previous.current_digest : null, expected_binding_generation: status.binding ? previous.binding_generation : 0, expected_binding_id: status.binding ? previous.current_binding_id : null,
    expected_engineer_contract_revision: profile.engineer_contract_revision, binding_id: () => bindingId, now: () => bindingId === bindingOne ? '2026-08-30T10:00:00.000Z' : '2026-08-30T10:10:00.000Z',
  });
}

function message(repoRoot: string, body = 'secret-message-body') {
  return seedEngineerTaskMessage(repoRoot, engineerId, messageOne, body);
}

function capability(repoRoot: string, adapter: 'herdr-cli-agent' = 'herdr-cli-agent') {
  return recordAgentRuntimeCapability(repoRoot, { adapter_kind: adapter, host_id: 'local', operations: { notify_inbox: 'supported', wake_for_offer: 'supported' }, evidence_refs: [{ ref: 'canary', sha256: digest }], observed_at: '2026-08-30T10:02:00.000Z' });
}

function prepare(repoRoot: string, adapter: 'herdr-cli-agent' = 'herdr-cli-agent') {
  const target = message(repoRoot); const observed = capability(repoRoot, adapter);
  const status = prepareAgentRuntimeEffect({ repo_root: repoRoot, ...target, idempotency_key: 'runtime-one', expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T10:03:00.000Z' });
  if (status.intent.operation !== 'notify_inbox') throw new Error('prepared effect is not a message notification');
  return { ...status, intent: status.intent };
}

afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('R1 provider-neutral Agent Runtime', () => {
  test('V2 schemas are closed and host action contains control identity, never message content', () => {
    const observed = buildAgentRuntimeCapabilityObservation({ adapter_kind: 'herdr-cli-agent', host_id: 'local', operations: { notify_inbox: 'supported', wake_for_offer: 'supported' }, evidence_refs: [{ ref: 'canary', sha256: digest }], observed_at: '2026-08-30T10:00:00.000Z' });
    expect(validateAgentRuntimeCapabilityObservation(JSON.parse(canonicalAgentRuntimeCapabilityBytes(observed)))).toEqual(observed);
    expect(() => validateAgentRuntimeCapabilityObservation({ ...observed, send: 'supported' })).toThrow();
    const intent = buildAgentRuntimeEffectIntent({ idempotency_key: 'schema', message_ref: { kind: 'task_message', message_id: messageOne, message_event_digest: digest, task_id: 'a'.repeat(64), task_revision: 'b'.repeat(64), claim_id: bindingOne, lease_generation: 1, delivery_attempt: 1 }, endpoint_fence: { engineer_id: engineerId, binding_id: bindingOne, binding_generation: 1, engineer_contract_revision: digest, adapter_kind: 'herdr-cli-agent', host_id: 'local', endpoint_id: 'opaque-endpoint' }, operation: 'notify_inbox', capability_sha256: digest, created_at: '2026-08-30T10:00:00.000Z' });
    expect(validateAgentRuntimeEffectIntent(JSON.parse(canonicalAgentRuntimeEffectIntentBytes(intent)))).toEqual(intent);
    const action = buildAgentRuntimeHostAction(intent); expect(JSON.stringify(action)).not.toContain('secret-message-body'); expect(action.control_ref).toBe(`repo-harness-inbox:${action.effect_id}:${action.control_sha256}`);
  });

  test('lost acknowledgement reconciles and a repeated start emits no second action', () => {
    const repoRoot = fixture(); const prepared = prepare(repoRoot); const started = startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:04:00.000Z' }); expect(started.action).not.toBeNull();
    const repeated = startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:05:00.000Z' }); expect(repeated.action).toBeNull(); expect(repeated.current.state).toBe('reconciliation_required');
  });

  test('Binding rotation after prepare prevents every Host action', () => {
    const repoRoot = fixture();
    const prepared = prepare(repoRoot);
    releaseEngineerTaskMessage(repoRoot, prepared.intent.message_ref.task_id);
    bind(repoRoot, 'herdr-cli-agent', bindingTwo);
    let refusal: unknown;
    try {
      startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:05:00.000Z' });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(AgentRuntimeEffectStoreError);
    expect(refusal).toMatchObject({
      code: 'agent_runtime_effect_binding_stale',
      message: 'effect endpoint fence does not match the exact current Binding',
    });
    expect(readAgentRuntimeEffectStatus(repoRoot, prepared.intent.effect_id).current.state).toBe('intent_persisted');
  });

  test('Task delivery derives its endpoint from ClaimActorReceipt and preserves the exact Lease fence', () => {
    const repoRoot = fixture();
    const sprintPath = 'plans/sprints/runtime.sprint.md'; const taskCell = 'wake exact task owner'; mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
    writeFileSync(join(repoRoot, sprintPath), ['# Sprint: runtime', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '', '| # | ID | Status | Task | Mode | Acceptance | Plan |', '|---|---|---|---|---|---|---|', `| 1 | ${fixtureTaskId(taskCell)} | [ ] | ${taskCell} | contract | exact receipt | (pending) |`, ''].join('\n'));
    execFileSync('git', ['add', sprintPath], { cwd: repoRoot }); execFileSync('git', ['commit', '-qm', 'task authority'], { cwd: repoRoot });
    const taskId = fixtureTaskId(taskCell); const taskRevision = deriveTaskRevision({ taskCell: taskCell, taskId, modeCell: 'contract', acceptanceCell: 'exact receipt' }); const claimId = '44444444-4444-4444-8444-444444444444';
    const claimed = buildLeaseOwnerRecord({ claimId, taskId, taskRevision, sprintPath, targetRef: 'HEAD', generation: 1, sessionId: 'runtime-session', sourceWorktree: repoRoot });
    const bound = boundLeaseFixture(claimed, { executionWorktree: repoRoot, branch: 'codex/runtime', unitRef: 'plans/runtime.md' }); createLeaseDirectory(repoRoot, taskId); writeLeaseOwnerDurably(repoRoot, taskId, bound);
    const profile = loadEngineerProfile(repoRoot, engineerId); const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;

    const envelope = { protocol: 1 as const, kind: 'repo-harness-work-envelope' as const, repo_id: repoHarnessRepoIdFor(repoRoot), task_id: taskId, task_revision: taskRevision, sprint_path: sprintPath, claim_id: claimId, generation: 1, worktree_path: repoRoot, branch: 'codex/runtime', unit_ref: 'plans/runtime.md', authorization_revision: 1 };
    seedClaimActorReceipt(repoRoot, claimActorReceiptFixture({ envelope, binding, session_id: 'runtime-session', bound_at: '2026-08-30T11:00:00.000Z' }));
    const taskMessageId = '66666666-6666-4666-8666-666666666666';
    sendTaskMessage({ repo_root: repoRoot, canonical_source: { targetRef: 'HEAD', sprintPath }, event: buildTaskMessageEvent({ message_id: taskMessageId, task_id: taskId, task_revision: taskRevision, scope: 'claim', target_claim_id: claimId, target_generation: 1, sender_kind: 'operator', sender_id: 'runtime-test', sender_trust: 'local_operator', audience: 'owner', body: 'task body never enters runtime action', created_at: '2026-08-30T11:01:00.000Z', in_reply_to: null }) });
    const observed = capability(repoRoot); const prepared = prepareAgentRuntimeEffect({ repo_root: repoRoot, message_kind: 'task_message', task_id: taskId, message_id: taskMessageId, idempotency_key: 'task-runtime', expected_task_revision: taskRevision, expected_claim_id: claimId, expected_lease_generation: 1, expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T11:02:00.000Z' });
    const started = startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T11:03:00.000Z' }); expect(started.action).not.toBeNull(); expect(JSON.stringify(started.action)).not.toContain('task body');
    deliverTaskInbox({ repo_root: repoRoot, task_id: taskId, canonical_source: { targetRef: 'HEAD', sprintPath }, recipient: { kind: 'claim', claim_id: claimId, generation: 1 }, execution_worktree: repoRoot, delivery_channel: 'agent_runtime_effect', message_id: taskMessageId, delivery_ref: started.action!.control_ref, delivered_at: '2026-08-30T11:04:00.000Z' });
    const done = observeAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, adapter: { adapter_kind: 'herdr-cli-agent', outcome: 'accepted', process_exit_code: null, process_signal: null }, observed_at: '2026-08-30T11:05:00.000Z', receipt_wait_exhausted: false }); expect(done.current.state).toBe('observed_success'); expect(done.observation.receipt_kind).toBe('task_message_delivery_receipt');
    const input = { repo_root: repoRoot, task_id: taskId, task_revision: taskRevision, current_claim: { claim_id: claimId, generation: 1 } };
    const projection = projectTaskAgentRuntimeState(input);
    expect(projection.delivery_state).toBe('delivered');
    expect(projection.delivery_evidence).toEqual({ candidate_count: 1, latest: {
      adapter_kind: 'herdr-cli-agent', effect_state: 'observed_success', receipt_kind: 'task_message_delivery_receipt',
      observed_at: done.observation.observed_at, observation_sequence: done.current.sequence,
      observation_sha256: done.current.latest_observation_sha256,
    } });
    expect(JSON.stringify(projection)).not.toContain(binding.provider_thread_id);
    for (const changed of [{ current_claim: null }, { task_id: 'f'.repeat(64) }, { task_revision: 'f'.repeat(64) }, { current_claim: { claim_id: bindingTwo, generation: 1 } }, { current_claim: { claim_id: claimId, generation: 2 } }]) {
      expect(projectTaskAgentRuntimeState({ ...input, ...changed, statuses: [done] }).delivery_evidence).toEqual({ candidate_count: 0, latest: null });
    }
    expect(projectTaskAgentRuntimeState({ ...input, statuses: [] }).delivery_evidence).toEqual({ candidate_count: 0, latest: null });
    for (const state of ['stopped', 'superseded'] as const) {
      const observation = buildAgentRuntimeEffectObservation({ ...done.observation, state, receipt_kind: null, receipt_sha256: null });
      const terminal = projectTaskAgentRuntimeState({ ...input, statuses: [{ ...done, observation, current: buildAgentRuntimeEffectCurrent(observation) }] });
      expect(terminal.delivery_state).toBe('pending');
      expect(terminal.delivery_evidence.latest?.effect_state).toBe(state);
    }
    expect(() => projectTaskAgentRuntimeState({ ...input, statuses: [{ ...done, current: prepared.current }] })).toThrow(AgentRuntimeEffectStoreError);
    expect(() => buildAgentRuntimeEffectObservation({ ...done.observation, adapter: { ...done.observation.adapter, adapter_kind: 'codex-app-thread' as never } })).toThrow('adapter_kind is invalid');
    // Two different messages are two candidates, not two runs or an invented latest effect.
    const secondId = '77777777-7777-4777-8777-777777777777';
    sendTaskMessage({ repo_root: repoRoot, canonical_source: { targetRef: 'HEAD', sprintPath }, event: buildTaskMessageEvent({ message_id: secondId, task_id: taskId, task_revision: taskRevision, scope: 'claim', target_claim_id: claimId, target_generation: 1, sender_kind: 'operator', sender_id: 'runtime-test', sender_trust: 'local_operator', audience: 'owner', body: 'another message', created_at: '2026-08-30T11:06:00.000Z', in_reply_to: null }) });
    prepareAgentRuntimeEffect({ repo_root: repoRoot, message_kind: 'task_message', task_id: taskId, message_id: secondId, idempotency_key: 'second-task-runtime', expected_task_revision: taskRevision, expected_claim_id: claimId, expected_lease_generation: 1, expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T11:07:00.000Z' });
    expect(projectTaskAgentRuntimeState(input)).toMatchObject({ delivery_state: 'reconciliation_required', runtime_reachability: 'unknown', delivery_evidence: { candidate_count: 2, latest: null } });
  });

  test('a Task hook delivery or a foreign control reference never proves the effect', () => {
    const repoRoot = fixture();
    const sprintPath = 'plans/sprints/runtime.sprint.md'; const taskCell = 'wake exact task owner'; mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
    writeFileSync(join(repoRoot, sprintPath), ['# Sprint: runtime', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '', '| # | ID | Status | Task | Mode | Acceptance | Plan |', '|---|---|---|---|---|---|---|', `| 1 | ${fixtureTaskId(taskCell)} | [ ] | ${taskCell} | contract | exact receipt | (pending) |`, ''].join('\n'));
    execFileSync('git', ['add', sprintPath], { cwd: repoRoot }); execFileSync('git', ['commit', '-qm', 'task authority'], { cwd: repoRoot });
    const taskId = fixtureTaskId(taskCell); const taskRevision = deriveTaskRevision({ taskCell: taskCell, taskId, modeCell: 'contract', acceptanceCell: 'exact receipt' }); const claimId = '44444444-4444-4444-8444-444444444444';
    const claimed = buildLeaseOwnerRecord({ claimId, taskId, taskRevision, sprintPath, targetRef: 'HEAD', generation: 1, sessionId: 'runtime-session', sourceWorktree: repoRoot });
    const bound = boundLeaseFixture(claimed, { executionWorktree: repoRoot, branch: 'codex/runtime', unitRef: 'plans/runtime.md' }); createLeaseDirectory(repoRoot, taskId); writeLeaseOwnerDurably(repoRoot, taskId, bound);
    const profile = loadEngineerProfile(repoRoot, engineerId); const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;

    const envelope = { protocol: 1 as const, kind: 'repo-harness-work-envelope' as const, repo_id: repoHarnessRepoIdFor(repoRoot), task_id: taskId, task_revision: taskRevision, sprint_path: sprintPath, claim_id: claimId, generation: 1, worktree_path: repoRoot, branch: 'codex/runtime', unit_ref: 'plans/runtime.md', authorization_revision: 1 };
    seedClaimActorReceipt(repoRoot, claimActorReceiptFixture({ envelope, binding, session_id: 'runtime-session', bound_at: '2026-08-30T11:00:00.000Z' }));
    const hookMessageId = '66666666-6666-4666-8666-666666666666';
    sendTaskMessage({ repo_root: repoRoot, canonical_source: { targetRef: 'HEAD', sprintPath }, event: buildTaskMessageEvent({ message_id: hookMessageId, task_id: taskId, task_revision: taskRevision, scope: 'claim', target_claim_id: claimId, target_generation: 1, sender_kind: 'operator', sender_id: 'runtime-test', sender_trust: 'local_operator', audience: 'owner', body: 'hook lane body', created_at: '2026-08-30T11:01:00.000Z', in_reply_to: null }) });
    const observed = capability(repoRoot); const prepared = prepareAgentRuntimeEffect({ repo_root: repoRoot, message_kind: 'task_message', task_id: taskId, message_id: hookMessageId, idempotency_key: 'task-hook-lane', expected_task_revision: taskRevision, expected_claim_id: claimId, expected_lease_generation: 1, expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T11:02:00.000Z' });
    startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T11:03:00.000Z' });
    deliverTaskInbox({ repo_root: repoRoot, task_id: taskId, canonical_source: { targetRef: 'HEAD', sprintPath }, recipient: { kind: 'claim', claim_id: claimId, generation: 1 }, execution_worktree: repoRoot, delivery_channel: 'hook_session', delivered_at: '2026-08-30T11:04:00.000Z' });
    const hookObserved = observeAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, adapter: { adapter_kind: 'herdr-cli-agent', outcome: 'accepted', process_exit_code: null, process_signal: null }, observed_at: '2026-08-30T11:05:00.000Z', receipt_wait_exhausted: true });
    expect(hookObserved.current.state).toBe('reconciliation_required'); expect(hookObserved.observation.failure_class).toBe('receipt_missing');

    const foreignMessageId = '77777777-7777-4777-8777-777777777777';
    sendTaskMessage({ repo_root: repoRoot, canonical_source: { targetRef: 'HEAD', sprintPath }, event: buildTaskMessageEvent({ message_id: foreignMessageId, task_id: taskId, task_revision: taskRevision, scope: 'claim', target_claim_id: claimId, target_generation: 1, sender_kind: 'operator', sender_id: 'runtime-test', sender_trust: 'local_operator', audience: 'owner', body: 'foreign ref body', created_at: '2026-08-30T11:06:00.000Z', in_reply_to: null }) });
    const foreignPrepared = prepareAgentRuntimeEffect({ repo_root: repoRoot, message_kind: 'task_message', task_id: taskId, message_id: foreignMessageId, idempotency_key: 'task-foreign-ref', expected_task_revision: taskRevision, expected_claim_id: claimId, expected_lease_generation: 1, expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T11:07:00.000Z' });
    const foreignStarted = startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: foreignPrepared.intent.effect_id, started_at: '2026-08-30T11:08:00.000Z' });
    deliverTaskInbox({ repo_root: repoRoot, task_id: taskId, canonical_source: { targetRef: 'HEAD', sprintPath }, recipient: { kind: 'claim', claim_id: claimId, generation: 1 }, execution_worktree: repoRoot, delivery_channel: 'agent_runtime_effect', message_id: foreignMessageId, delivery_ref: `repo-harness-inbox:${prepared.intent.effect_id}:sha256:${'a'.repeat(64)}`, delivered_at: '2026-08-30T11:09:00.000Z' });
    const foreignObserved = observeAgentRuntimeEffect({ repo_root: repoRoot, effect_id: foreignPrepared.intent.effect_id, adapter: { adapter_kind: 'herdr-cli-agent', outcome: 'accepted', process_exit_code: null, process_signal: null }, observed_at: '2026-08-30T11:10:00.000Z', receipt_wait_exhausted: true });
    expect(foreignObserved.current.state).toBe('reconciliation_required');
    expect(foreignStarted.action).not.toBeNull();
  });

  test('an effect-channel receipt superseded before delivery stays serializable and never proves success', () => {
    const reserved = buildTaskMessageDeliveryReceipt({ message_id: '88888888-8888-4888-8888-888888888888', recipient: { kind: 'claim', claim_id: '44444444-4444-4444-8444-444444444444', generation: 1 }, task_revision: '0'.repeat(64), delivery_channel: 'agent_runtime_effect' });
    const superseded = transitionTaskMessageDeliveryReceipt(reserved, { state: 'superseded' });
    expect(superseded.delivery_state).toBe('superseded'); expect(superseded.delivery_ref).toBeNull();
    expect(() => validateTaskMessageDeliveryReceipt(JSON.parse(canonicalTaskMessageDeliveryReceiptBytes(superseded)))).not.toThrow();
  });

  test('observe before any delivery observation reconciles instead of throwing', () => {
    const repoRoot = fixture(); const prepared = prepare(repoRoot); startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:04:00.000Z' });
    const observed = observeAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, adapter: { adapter_kind: 'herdr-cli-agent', outcome: 'accepted', process_exit_code: null, process_signal: null }, observed_at: '2026-08-30T10:05:00.000Z', receipt_wait_exhausted: true });
    expect(observed.current.state).toBe('reconciliation_required'); expect(observed.observation.failure_class).toBe('receipt_missing');
  });

  test('an idempotency replay with a different target fence fails closed', () => {
    const repoRoot = fixture(); const target = message(repoRoot); const observed = capability(repoRoot);
    const base = { repo_root: repoRoot, ...target, idempotency_key: 'replay-identity', expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T10:03:00.000Z' };
    const first = prepareAgentRuntimeEffect(base);
    expect(first.intent.effect_id).toBe(deriveAgentRuntimeEffectId('replay-identity'));
    expect(() => prepareAgentRuntimeEffect({ ...base, expected_claim_id: '123e4567-e89b-42d3-a456-426614174000' })).toThrow('idempotency key names another prepare request');
  });

  test('shadow records preparation but refuses Host action', () => {
    const repoRoot = fixture(); const prepared = prepare(repoRoot); writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ agent_runtime: { mode: 'shadow', adapters: { 'herdr-cli-agent': { enabled: true } } } })}\n`);
    expect(() => startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:05:00.000Z' })).toThrow('forbids Host actions');
  });

  test('off and adapter disablement refuse mutation or action without fallback', () => {
    const repoRoot = fixture(); const target = message(repoRoot); const observed = capability(repoRoot);
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ agent_runtime: { mode: 'off', adapters: { 'herdr-cli-agent': { enabled: true } } } })}\n`);
    expect(() => prepareAgentRuntimeEffect({ repo_root: repoRoot, ...target, idempotency_key: 'off-runtime', expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T10:03:00.000Z' })).toThrow('forbids new effects');
    expect(existsSync(join(resolveGitCommonDirectory(repoRoot), 'repo-harness/agent-runtime-effects/v2/effects', deriveAgentRuntimeEffectId('off-runtime').slice(7)))).toBe(false);
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ agent_runtime: { mode: 'active', adapters: { 'herdr-cli-agent': { enabled: false } } } })}\n`);
    const prepared = prepareAgentRuntimeEffect({ repo_root: repoRoot, ...target, idempotency_key: 'disabled-runtime', expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T10:03:00.000Z' });
    expect(() => startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:05:00.000Z' })).toThrow('herdr-cli-agent is disabled');
    expect(readAgentRuntimeEffectStatus(repoRoot, prepared.intent.effect_id).current.state).toBe('intent_persisted');
  });

  test('feature policy rejects undeclared runtime fields instead of accepting a compatibility shape', () => {
    const repoRoot = fixture();
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ agent_runtime: { mode: 'active', adapters: { 'herdr-cli-agent': { enabled: true } }, fallback: 'herdr-cli-agent' } })}\n`);
    expect(() => readAgentRuntimePolicy(repoRoot)).toThrow('agent_runtime.mode must be off, shadow, or active');
  });

  test('retired backend config and capability evidence are rejected without translation', () => {
    const repoRoot = fixture();
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), JSON.stringify({agent_runtime:{mode:'active',adapters:{'codex-app-thread':{enabled:true},'herdr-cli-agent':{enabled:true}}}}));
    expect(() => readAgentRuntimePolicy(repoRoot)).toThrow('Herdr only');
    const evidence = buildAgentRuntimeCapabilityObservation({adapter_kind:'herdr-cli-agent',host_id:'local',operations:{notify_inbox:'supported',wake_for_offer:'supported'},evidence_refs:[{ref:'canary',sha256:digest}],observed_at:'2026-08-30T10:00:00.000Z'});
    expect(() => validateAgentRuntimeCapabilityObservation({...evidence,adapter_kind:'codex-app-thread'})).toThrow('adapter_kind is invalid');
  });

  test('unmigrated V1 store blocks capability recording without changing its bytes', () => {
    const repoRoot = fixture();
    const common = resolveGitCommonDirectory(repoRoot);
    const directory = join(common, 'repo-harness/provider-thread-effects/v1/effects/abc');
    mkdirSync(directory, { recursive: true });
    const file = join(directory, 'current.json');
    const bytes = Buffer.from('{"state":"effect_started"}\n');
    writeFileSync(file, bytes);
    expect(() => capability(repoRoot)).toThrow('Provider Thread V1 store exists without an exact migration receipt');
    expect(readFileSync(file)).toEqual(bytes);
    expect(existsSync(join(common, 'repo-harness/agent-runtime-effects/v2/migrations/v1.json'))).toBe(false);
    expect(existsSync(join(common, 'repo-harness/provider-thread-effects/archive'))).toBe(false);
  });
});
