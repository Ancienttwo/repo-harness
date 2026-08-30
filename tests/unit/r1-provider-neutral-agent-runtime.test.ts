import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildModuleMessageEvent } from '../../src/core/engineers/module-message';
import { buildClaimActorReceipt, validateEngineerPrincipal } from '../../src/core/engineers/principal-claim';
import {
  buildTaskMessageDeliveryReceipt,
  buildTaskMessageEvent,
  canonicalTaskMessageDeliveryReceiptBytes,
  transitionTaskMessageDeliveryReceipt,
  validateTaskMessageDeliveryReceipt,
} from '../../src/core/fleet/task-message';
import { bindLeaseRecord, buildLeaseOwnerRecord, deriveTaskId, deriveTaskRevision } from '../../src/core/state/coordination-identity';
import {
  buildAgentRuntimeCapabilityObservation,
  buildAgentRuntimeEffectCurrent,
  buildAgentRuntimeEffectIntent,
  buildAgentRuntimeEffectObservation,
  buildAgentRuntimeHostAction,
  canonicalAgentRuntimeCapabilityBytes,
  canonicalAgentRuntimeEffectCurrentBytes,
  canonicalAgentRuntimeEffectIntentBytes,
  canonicalAgentRuntimeEffectObservationBytes,
  deriveAgentRuntimeEffectId,
  validateAgentRuntimeCapabilityObservation,
  validateAgentRuntimeEffectIntent,
} from '../../src/core/engineers/agent-runtime-effect';
import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { publishClaimActorReceipt } from '../../src/effects/engineers/claim-actor-store';
import { recordModuleMessageDeliveryObservation, sendModuleMessage } from '../../src/effects/engineers/module-inbox';
import { readAgentRuntimePolicy } from '../../src/effects/engineers/agent-runtime-feature';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { deliverTaskInbox, sendTaskMessage } from '../../src/effects/fleet/task-inbox';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import {
  AgentRuntimeEffectStoreError,
  migrateProviderThreadEffectsV1,
  observeAgentRuntimeEffect,
  prepareAgentRuntimeEffect,
  readAgentRuntimeEffectStatus,
  recordAgentRuntimeCapability,
  startAgentRuntimeEffect,
} from '../../src/effects/engineers/agent-runtime-effect-store';

const sourceRoot = process.cwd();
const roots: string[] = [];
const engineerId = 'engineer:capability.verification.evals-checks';
const capabilityId = 'capability.verification.evals-checks';
const bindingOne = '11111111-1111-4111-8111-111111111111';
const bindingTwo = '22222222-2222-4222-8222-222222222222';
const messageOne = '33333333-3333-4333-8333-333333333333';
const digest = `sha256:${'a'.repeat(64)}`;

function fixture(adapter: 'codex-app-thread' | 'tmux-cli-agent' = 'codex-app-thread'): string {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-r1-runtime-'))); roots.push(repoRoot);
  execFileSync('git', ['init', '-q'], { cwd: repoRoot }); execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: repoRoot }); execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: repoRoot });
  mkdirSync(join(repoRoot, '.archcontext/model'), { recursive: true }); mkdirSync(join(repoRoot, 'agents'), { recursive: true }); mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(repoRoot, '.archcontext/model/nodes'), { recursive: true }); cpSync(join(sourceRoot, 'agents/engineers'), join(repoRoot, 'agents/engineers'), { recursive: true });
  writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ agent_runtime: { mode: 'active', adapters: { 'codex-app-thread': { enabled: true }, 'tmux-cli-agent': { enabled: true } } } })}\n`);
  execFileSync('git', ['add', '.'], { cwd: repoRoot }); execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repoRoot });
  bind(repoRoot, adapter, bindingOne); return repoRoot;
}

function bind(repoRoot: string, adapter: 'codex-app-thread' | 'tmux-cli-agent', bindingId: string) {
  const profile = loadEngineerProfile(repoRoot, engineerId); const status = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision); const previous = status.current;
  return bindEngineer(repoRoot, {
    engineer_id: engineerId, idempotency_key: `bind-${bindingId}`, provider: adapter, provider_thread_id: `endpoint-${bindingId.slice(0, 4)}`, host_id: 'local', engineer_contract_revision: profile.engineer_contract_revision,
    expected_current_digest: status.binding ? previous.current_digest : null, expected_binding_generation: status.binding ? previous.binding_generation : 0, expected_binding_id: status.binding ? previous.current_binding_id : null,
    expected_engineer_contract_revision: profile.engineer_contract_revision, binding_id: () => bindingId, now: () => bindingId === bindingOne ? '2026-08-30T10:00:00.000Z' : '2026-08-30T10:10:00.000Z',
  });
}

function message(repoRoot: string, body = 'secret-message-body') {
  const profile = loadEngineerProfile(repoRoot, engineerId); const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
  return sendModuleMessage({ repo_root: repoRoot, event: buildModuleMessageEvent({
    message_id: messageOne, capability_id: capabilityId, target_engineer_id: engineerId, scope: 'assignment', target_binding_id: binding.binding_id,
    target_binding_generation: binding.binding_generation, target_engineer_contract_revision: binding.engineer_contract_revision, message_type: 'work_request', subject_ref: null,
    resource_refs: [], sender: { kind: 'program_orchestrator', principal_ref: 'human:r1', binding_generation: null }, body, created_at: '2026-08-30T10:01:00.000Z',
  }) });
}

function capability(repoRoot: string, adapter: 'codex-app-thread' | 'tmux-cli-agent' = 'codex-app-thread') {
  return recordAgentRuntimeCapability(repoRoot, { adapter_kind: adapter, host_id: 'local', operations: { notify_inbox: 'supported' }, evidence_refs: [{ ref: 'canary', sha256: digest }], observed_at: '2026-08-30T10:02:00.000Z' });
}

function prepare(repoRoot: string, adapter: 'codex-app-thread' | 'tmux-cli-agent' = 'codex-app-thread') {
  message(repoRoot); const profile = loadEngineerProfile(repoRoot, engineerId); const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!; const observed = capability(repoRoot, adapter);
  return prepareAgentRuntimeEffect({ repo_root: repoRoot, message_kind: 'module_message', engineer_id: engineerId, message_id: messageOne, idempotency_key: 'runtime-one', expected_binding_id: binding.binding_id, expected_binding_generation: binding.binding_generation, expected_engineer_contract_revision: binding.engineer_contract_revision, expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T10:03:00.000Z' });
}

afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('R1 provider-neutral Agent Runtime', () => {
  test('V2 schemas are closed and host action contains control identity, never message content', () => {
    const observed = buildAgentRuntimeCapabilityObservation({ adapter_kind: 'tmux-cli-agent', host_id: 'local', operations: { notify_inbox: 'supported' }, evidence_refs: [{ ref: 'canary', sha256: digest }], observed_at: '2026-08-30T10:00:00.000Z' });
    expect(validateAgentRuntimeCapabilityObservation(JSON.parse(canonicalAgentRuntimeCapabilityBytes(observed)))).toEqual(observed);
    expect(() => validateAgentRuntimeCapabilityObservation({ ...observed, send: 'supported' })).toThrow();
    const intent = buildAgentRuntimeEffectIntent({ idempotency_key: 'schema', message_ref: { kind: 'module_message', message_id: messageOne, message_event_digest: digest, engineer_id: engineerId, binding_id: bindingOne, binding_generation: 1, engineer_contract_revision: digest, delivery_attempt: 1 }, endpoint_fence: { engineer_id: engineerId, binding_id: bindingOne, binding_generation: 1, engineer_contract_revision: digest, adapter_kind: 'tmux-cli-agent', host_id: 'local', endpoint_id: 'opaque-endpoint' }, operation: 'notify_inbox', capability_sha256: digest, created_at: '2026-08-30T10:00:00.000Z' });
    expect(validateAgentRuntimeEffectIntent(JSON.parse(canonicalAgentRuntimeEffectIntentBytes(intent)))).toEqual(intent);
    const action = buildAgentRuntimeHostAction(intent); expect(JSON.stringify(action)).not.toContain('secret-message-body'); expect(action.control_ref).toBe(`repo-harness-inbox:${action.effect_id}:${action.control_sha256}`);
  });

  test('persists before one Host action and exact Module receipt is the only success evidence', () => {
    const repoRoot = fixture(); const prepared = prepare(repoRoot); const started = startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:04:00.000Z' });
    expect(started.action?.adapter_kind).toBe('codex-app-thread'); expect(readAgentRuntimeEffectStatus(repoRoot, prepared.intent.effect_id).current.state).toBe('effect_started');
    recordModuleMessageDeliveryObservation({ repo_root: repoRoot, engineer_id: engineerId, message_id: messageOne, expected_message_event_digest: prepared.intent.message_ref.message_event_digest, expected_attempt: 1, result: { outcome: 'delivered', provider_delivery_ref: started.action!.control_ref, observed_at: '2026-08-30T10:05:00.000Z' } });
    const done = observeAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null }, observed_at: '2026-08-30T10:06:00.000Z', receipt_wait_exhausted: false });
    expect(done.current.state).toBe('observed_success'); expect(done.observation.receipt_kind).toBe('module_message_delivery_receipt');
  });

  test('a Module delivery observation without this effect control reference never succeeds', () => {
    const repoRoot = fixture(); const prepared = prepare(repoRoot); const started = startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:04:00.000Z' });
    recordModuleMessageDeliveryObservation({ repo_root: repoRoot, engineer_id: engineerId, message_id: messageOne, expected_message_event_digest: prepared.intent.message_ref.message_event_digest, expected_attempt: 1, result: { outcome: 'delivered', provider_delivery_ref: null, observed_at: '2026-08-30T10:05:00.000Z' } });
    const observed = observeAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null }, observed_at: '2026-08-30T10:06:00.000Z', receipt_wait_exhausted: true });
    expect(observed.current.state).toBe('reconciliation_required'); expect(observed.observation.failure_class).toBe('receipt_missing');
  });

  test('a foreign control reference on a Module delivery observation never succeeds', () => {
    const repoRoot = fixture(); const prepared = prepare(repoRoot); startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:04:00.000Z' });
    const foreign = `repo-harness-inbox:sha256:${'f'.repeat(64)}:sha256:${'e'.repeat(64)}`;
    recordModuleMessageDeliveryObservation({ repo_root: repoRoot, engineer_id: engineerId, message_id: messageOne, expected_message_event_digest: prepared.intent.message_ref.message_event_digest, expected_attempt: 1, result: { outcome: 'delivered', provider_delivery_ref: foreign, observed_at: '2026-08-30T10:05:00.000Z' } });
    const observed = observeAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null }, observed_at: '2026-08-30T10:06:00.000Z', receipt_wait_exhausted: true });
    expect(observed.current.state).toBe('reconciliation_required');
  });

  test('lost acknowledgement reconciles and a repeated start emits no second action', () => {
    const repoRoot = fixture(); const prepared = prepare(repoRoot); const started = startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:04:00.000Z' }); expect(started.action).not.toBeNull();
    const repeated = startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:05:00.000Z' }); expect(repeated.action).toBeNull(); expect(repeated.current.state).toBe('reconciliation_required');
  });

  test('Binding rotation after prepare prevents every Host action', () => {
    const repoRoot = fixture(); const prepared = prepare(repoRoot); bind(repoRoot, 'codex-app-thread', bindingTwo);
    expect(() => startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:05:00.000Z' })).toThrow(AgentRuntimeEffectStoreError);
    expect(readAgentRuntimeEffectStatus(repoRoot, prepared.intent.effect_id).current.state).toBe('intent_persisted');
  });

  test('Task delivery derives its endpoint from ClaimActorReceipt and preserves the exact Lease fence', () => {
    const repoRoot = fixture();
    const sprintPath = 'plans/sprints/runtime.sprint.md'; const taskCell = 'wake exact task owner'; mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
    writeFileSync(join(repoRoot, sprintPath), ['# Sprint: runtime', '', '## Backlog', '', '| # | Status | Task | Mode | Acceptance | Plan |', '|---|---|---|---|---|---|', `| 1 | [ ] | ${taskCell} | contract | exact receipt | (pending) |`, ''].join('\n'));
    execFileSync('git', ['add', sprintPath], { cwd: repoRoot }); execFileSync('git', ['commit', '-qm', 'task authority'], { cwd: repoRoot });
    const taskId = deriveTaskId({ repoIdentity: resolveRepoIdentity(repoRoot), sprintPath, taskCell }); const taskRevision = deriveTaskRevision({ taskId, modeCell: 'contract', acceptanceCell: 'exact receipt' }); const claimId = '44444444-4444-4444-8444-444444444444';
    const claimed = buildLeaseOwnerRecord({ claimId, taskId, taskRevision, sprintPath, targetRef: 'HEAD', generation: 1, sessionId: 'runtime-session', sourceWorktree: repoRoot });
    const bound = bindLeaseRecord(claimed, { claimId, executionWorktree: repoRoot, branch: 'codex/runtime', unitRef: 'plans/runtime.md' }); if (!bound.ok) throw new Error(bound.error); createLeaseDirectory(repoRoot, taskId); writeLeaseOwnerDurably(repoRoot, taskId, bound.record);
    const profile = loadEngineerProfile(repoRoot, engineerId); const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
    const principal = validateEngineerPrincipal({ protocol: 1, kind: 'repo-harness-engineer-principal', repository_id: repoHarnessRepoIdFor(repoRoot), engineer_id: engineerId, binding_id: binding.binding_id, binding_generation: binding.binding_generation, engineer_contract_revision: binding.engineer_contract_revision, carrier: 'mcp_oauth', auth_subject: '55555555-5555-4555-8555-555555555555', provider: binding.provider, provider_thread_id: binding.provider_thread_id });
    const envelope = { protocol: 1 as const, kind: 'repo-harness-work-envelope' as const, repo_id: repoHarnessRepoIdFor(repoRoot), task_id: taskId, task_revision: taskRevision, sprint_path: sprintPath, claim_id: claimId, generation: 1, worktree_path: repoRoot, branch: 'codex/runtime', unit_ref: 'plans/runtime.md', authorization_revision: 1 };
    publishClaimActorReceipt(repoRoot, buildClaimActorReceipt({ envelope, principal, session_id: 'runtime-session', bound_at: '2026-08-30T11:00:00.000Z' }));
    const taskMessageId = '66666666-6666-4666-8666-666666666666';
    sendTaskMessage({ repo_root: repoRoot, canonical_source: { targetRef: 'HEAD', sprintPath }, event: buildTaskMessageEvent({ message_id: taskMessageId, task_id: taskId, task_revision: taskRevision, scope: 'claim', target_claim_id: claimId, target_generation: 1, sender_kind: 'operator', sender_id: 'runtime-test', sender_trust: 'local_operator', audience: 'owner', body: 'task body never enters runtime action', created_at: '2026-08-30T11:01:00.000Z', in_reply_to: null }) });
    const observed = capability(repoRoot); const prepared = prepareAgentRuntimeEffect({ repo_root: repoRoot, message_kind: 'task_message', task_id: taskId, message_id: taskMessageId, idempotency_key: 'task-runtime', expected_task_revision: taskRevision, expected_claim_id: claimId, expected_lease_generation: 1, expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T11:02:00.000Z' });
    const started = startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T11:03:00.000Z' }); expect(started.action).not.toBeNull(); expect(JSON.stringify(started.action)).not.toContain('task body');
    deliverTaskInbox({ repo_root: repoRoot, task_id: taskId, canonical_source: { targetRef: 'HEAD', sprintPath }, recipient: { kind: 'claim', claim_id: claimId, generation: 1 }, execution_worktree: repoRoot, delivery_channel: 'agent_runtime_effect', message_id: taskMessageId, delivery_ref: started.action!.control_ref, delivered_at: '2026-08-30T11:04:00.000Z' });
    const done = observeAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null }, observed_at: '2026-08-30T11:05:00.000Z', receipt_wait_exhausted: false }); expect(done.current.state).toBe('observed_success'); expect(done.observation.receipt_kind).toBe('task_message_delivery_receipt');
  });

  test('a Task hook delivery or a foreign control reference never proves the effect', () => {
    const repoRoot = fixture();
    const sprintPath = 'plans/sprints/runtime.sprint.md'; const taskCell = 'wake exact task owner'; mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
    writeFileSync(join(repoRoot, sprintPath), ['# Sprint: runtime', '', '## Backlog', '', '| # | Status | Task | Mode | Acceptance | Plan |', '|---|---|---|---|---|---|', `| 1 | [ ] | ${taskCell} | contract | exact receipt | (pending) |`, ''].join('\n'));
    execFileSync('git', ['add', sprintPath], { cwd: repoRoot }); execFileSync('git', ['commit', '-qm', 'task authority'], { cwd: repoRoot });
    const taskId = deriveTaskId({ repoIdentity: resolveRepoIdentity(repoRoot), sprintPath, taskCell }); const taskRevision = deriveTaskRevision({ taskId, modeCell: 'contract', acceptanceCell: 'exact receipt' }); const claimId = '44444444-4444-4444-8444-444444444444';
    const claimed = buildLeaseOwnerRecord({ claimId, taskId, taskRevision, sprintPath, targetRef: 'HEAD', generation: 1, sessionId: 'runtime-session', sourceWorktree: repoRoot });
    const bound = bindLeaseRecord(claimed, { claimId, executionWorktree: repoRoot, branch: 'codex/runtime', unitRef: 'plans/runtime.md' }); if (!bound.ok) throw new Error(bound.error); createLeaseDirectory(repoRoot, taskId); writeLeaseOwnerDurably(repoRoot, taskId, bound.record);
    const profile = loadEngineerProfile(repoRoot, engineerId); const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
    const principal = validateEngineerPrincipal({ protocol: 1, kind: 'repo-harness-engineer-principal', repository_id: repoHarnessRepoIdFor(repoRoot), engineer_id: engineerId, binding_id: binding.binding_id, binding_generation: binding.binding_generation, engineer_contract_revision: binding.engineer_contract_revision, carrier: 'mcp_oauth', auth_subject: '55555555-5555-4555-8555-555555555555', provider: binding.provider, provider_thread_id: binding.provider_thread_id });
    const envelope = { protocol: 1 as const, kind: 'repo-harness-work-envelope' as const, repo_id: repoHarnessRepoIdFor(repoRoot), task_id: taskId, task_revision: taskRevision, sprint_path: sprintPath, claim_id: claimId, generation: 1, worktree_path: repoRoot, branch: 'codex/runtime', unit_ref: 'plans/runtime.md', authorization_revision: 1 };
    publishClaimActorReceipt(repoRoot, buildClaimActorReceipt({ envelope, principal, session_id: 'runtime-session', bound_at: '2026-08-30T11:00:00.000Z' }));
    const hookMessageId = '66666666-6666-4666-8666-666666666666';
    sendTaskMessage({ repo_root: repoRoot, canonical_source: { targetRef: 'HEAD', sprintPath }, event: buildTaskMessageEvent({ message_id: hookMessageId, task_id: taskId, task_revision: taskRevision, scope: 'claim', target_claim_id: claimId, target_generation: 1, sender_kind: 'operator', sender_id: 'runtime-test', sender_trust: 'local_operator', audience: 'owner', body: 'hook lane body', created_at: '2026-08-30T11:01:00.000Z', in_reply_to: null }) });
    const observed = capability(repoRoot); const prepared = prepareAgentRuntimeEffect({ repo_root: repoRoot, message_kind: 'task_message', task_id: taskId, message_id: hookMessageId, idempotency_key: 'task-hook-lane', expected_task_revision: taskRevision, expected_claim_id: claimId, expected_lease_generation: 1, expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T11:02:00.000Z' });
    startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T11:03:00.000Z' });
    deliverTaskInbox({ repo_root: repoRoot, task_id: taskId, canonical_source: { targetRef: 'HEAD', sprintPath }, recipient: { kind: 'claim', claim_id: claimId, generation: 1 }, execution_worktree: repoRoot, delivery_channel: 'hook_session', delivered_at: '2026-08-30T11:04:00.000Z' });
    const hookObserved = observeAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null }, observed_at: '2026-08-30T11:05:00.000Z', receipt_wait_exhausted: true });
    expect(hookObserved.current.state).toBe('reconciliation_required'); expect(hookObserved.observation.failure_class).toBe('receipt_missing');

    const foreignMessageId = '77777777-7777-4777-8777-777777777777';
    sendTaskMessage({ repo_root: repoRoot, canonical_source: { targetRef: 'HEAD', sprintPath }, event: buildTaskMessageEvent({ message_id: foreignMessageId, task_id: taskId, task_revision: taskRevision, scope: 'claim', target_claim_id: claimId, target_generation: 1, sender_kind: 'operator', sender_id: 'runtime-test', sender_trust: 'local_operator', audience: 'owner', body: 'foreign ref body', created_at: '2026-08-30T11:06:00.000Z', in_reply_to: null }) });
    const foreignPrepared = prepareAgentRuntimeEffect({ repo_root: repoRoot, message_kind: 'task_message', task_id: taskId, message_id: foreignMessageId, idempotency_key: 'task-foreign-ref', expected_task_revision: taskRevision, expected_claim_id: claimId, expected_lease_generation: 1, expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T11:07:00.000Z' });
    const foreignStarted = startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: foreignPrepared.intent.effect_id, started_at: '2026-08-30T11:08:00.000Z' });
    deliverTaskInbox({ repo_root: repoRoot, task_id: taskId, canonical_source: { targetRef: 'HEAD', sprintPath }, recipient: { kind: 'claim', claim_id: claimId, generation: 1 }, execution_worktree: repoRoot, delivery_channel: 'agent_runtime_effect', message_id: foreignMessageId, delivery_ref: `repo-harness-inbox:${prepared.intent.effect_id}:sha256:${'a'.repeat(64)}`, delivered_at: '2026-08-30T11:09:00.000Z' });
    const foreignObserved = observeAgentRuntimeEffect({ repo_root: repoRoot, effect_id: foreignPrepared.intent.effect_id, adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null }, observed_at: '2026-08-30T11:10:00.000Z', receipt_wait_exhausted: true });
    expect(foreignObserved.current.state).toBe('reconciliation_required');
    expect(foreignStarted.action).not.toBeNull();
  });

  test('an effect-channel receipt superseded before delivery stays serializable and never proves success', () => {
    const reserved = buildTaskMessageDeliveryReceipt({ message_id: '88888888-8888-4888-8888-888888888888', recipient: { kind: 'claim', claim_id: '44444444-4444-4444-8444-444444444444', generation: 1 }, task_revision: '0'.repeat(64), delivery_channel: 'agent_runtime_effect' });
    const superseded = transitionTaskMessageDeliveryReceipt(reserved, { state: 'superseded' });
    expect(superseded.delivery_state).toBe('superseded'); expect(superseded.delivery_ref).toBeNull();
    expect(() => validateTaskMessageDeliveryReceipt(JSON.parse(canonicalTaskMessageDeliveryReceiptBytes(superseded)))).not.toThrow();
  });

  test('prepare refuses module-scope messages that carry no Binding fence', () => {
    const repoRoot = fixture();
    sendModuleMessage({ repo_root: repoRoot, event: buildModuleMessageEvent({
      message_id: '99999999-9999-4999-8999-999999999999', capability_id: capabilityId, target_engineer_id: engineerId, scope: 'module', target_binding_id: null,
      target_binding_generation: null, target_engineer_contract_revision: null, message_type: 'work_request', subject_ref: null,
      resource_refs: [], sender: { kind: 'program_orchestrator', principal_ref: 'human:r1', binding_generation: null }, body: 'module scope body', created_at: '2026-08-30T10:01:30.000Z',
    }) });
    const profile = loadEngineerProfile(repoRoot, engineerId); const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
    const observed = capability(repoRoot);
    expect(() => prepareAgentRuntimeEffect({ repo_root: repoRoot, message_kind: 'module_message', engineer_id: engineerId, message_id: '99999999-9999-4999-8999-999999999999', idempotency_key: 'module-scope-refusal', expected_binding_id: binding.binding_id, expected_binding_generation: binding.binding_generation, expected_engineer_contract_revision: binding.engineer_contract_revision, expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T10:03:30.000Z' })).toThrow('no Binding fence');
  });

  test('observe before any delivery observation reconciles instead of throwing', () => {
    const repoRoot = fixture(); const prepared = prepare(repoRoot); startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:04:00.000Z' });
    const observed = observeAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null }, observed_at: '2026-08-30T10:05:00.000Z', receipt_wait_exhausted: true });
    expect(observed.current.state).toBe('reconciliation_required'); expect(observed.observation.failure_class).toBe('receipt_missing');
  });

  test('an idempotency replay with a different target fence fails closed', () => {
    const repoRoot = fixture(); const profile = loadEngineerProfile(repoRoot, engineerId); const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!; message(repoRoot); const observed = capability(repoRoot);
    const base = { repo_root: repoRoot, message_kind: 'module_message' as const, engineer_id: engineerId, message_id: messageOne, idempotency_key: 'replay-identity', expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T10:03:00.000Z' };
    const first = prepareAgentRuntimeEffect({ ...base, expected_binding_id: binding.binding_id, expected_binding_generation: binding.binding_generation, expected_engineer_contract_revision: binding.engineer_contract_revision });
    expect(first.intent.effect_id).toBe(deriveAgentRuntimeEffectId('replay-identity'));
    expect(() => prepareAgentRuntimeEffect({ ...base, expected_binding_id: '123e4567-e89b-42d3-a456-426614174000', expected_binding_generation: binding.binding_generation, expected_engineer_contract_revision: binding.engineer_contract_revision })).toThrow('idempotency key names another prepare request');
  });

  test('start refuses a persisted pre-hardening intent over a module-scope message', () => {
    const repoRoot = fixture();
    const sent = sendModuleMessage({ repo_root: repoRoot, event: buildModuleMessageEvent({
      message_id: '99999999-9999-4999-8999-999999999999', capability_id: capabilityId, target_engineer_id: engineerId, scope: 'module', target_binding_id: null,
      target_binding_generation: null, target_engineer_contract_revision: null, message_type: 'work_request', subject_ref: null,
      resource_refs: [], sender: { kind: 'program_orchestrator', principal_ref: 'human:r1', binding_generation: null }, body: 'module scope body', created_at: '2026-08-30T10:01:30.000Z',
    }) });
    const profile = loadEngineerProfile(repoRoot, engineerId); const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!; const cap = capability(repoRoot);
    const intent = buildAgentRuntimeEffectIntent({ idempotency_key: 'legacy-module-scope', message_ref: { kind: 'module_message', message_id: '99999999-9999-4999-8999-999999999999', message_event_digest: sent.event.event_digest, engineer_id: engineerId, binding_id: binding.binding_id, binding_generation: binding.binding_generation, engineer_contract_revision: binding.engineer_contract_revision, delivery_attempt: 1 }, endpoint_fence: { engineer_id: engineerId, binding_id: binding.binding_id, binding_generation: binding.binding_generation, engineer_contract_revision: binding.engineer_contract_revision, adapter_kind: 'codex-app-thread', host_id: 'local', endpoint_id: 'endpoint-1111' }, operation: 'notify_inbox', capability_sha256: cap.capability_sha256, created_at: '2026-08-30T10:03:00.000Z' });
    const effectDir = join(resolveGitCommonDirectory(repoRoot), 'repo-harness/agent-runtime-effects/v2/effects', deriveAgentRuntimeEffectId('legacy-module-scope').slice(7));
    mkdirSync(effectDir, { recursive: true }); writeFileSync(join(effectDir, 'intent.json'), canonicalAgentRuntimeEffectIntentBytes(intent));
    const initial = buildAgentRuntimeEffectObservation({ effect_id: intent.effect_id, intent_sha256: intent.intent_sha256, sequence: 0, state: 'intent_persisted', adapter: { adapter_kind: 'codex-app-thread', outcome: 'unknown', process_exit_code: null, process_signal: null }, receipt_kind: null, receipt_sha256: null, failure_class: 'none', observed_at: intent.created_at, previous_observation_sha256: null });
    mkdirSync(join(effectDir, 'observations'), { recursive: true }); writeFileSync(join(effectDir, 'observations', '00000000.json'), canonicalAgentRuntimeEffectObservationBytes(initial));
    writeFileSync(join(effectDir, 'current.json'), canonicalAgentRuntimeEffectCurrentBytes(buildAgentRuntimeEffectCurrent(initial)));
    expect(() => startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: intent.effect_id, started_at: '2026-08-30T10:04:00.000Z' })).toThrow('no Binding fence');
  });

  test('shadow records preparation but refuses Host action', () => {
    const repoRoot = fixture(); const prepared = prepare(repoRoot); writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ agent_runtime: { mode: 'shadow', adapters: { 'codex-app-thread': { enabled: true }, 'tmux-cli-agent': { enabled: true } } } })}\n`);
    expect(() => startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:05:00.000Z' })).toThrow('forbids Host actions');
  });

  test('off and adapter disablement refuse mutation or action without fallback', () => {
    const repoRoot = fixture(); message(repoRoot); const profile = loadEngineerProfile(repoRoot, engineerId); const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!; const observed = capability(repoRoot);
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ agent_runtime: { mode: 'off', adapters: { 'codex-app-thread': { enabled: true }, 'tmux-cli-agent': { enabled: true } } } })}\n`);
    expect(() => prepareAgentRuntimeEffect({ repo_root: repoRoot, message_kind: 'module_message', engineer_id: engineerId, message_id: messageOne, idempotency_key: 'off-runtime', expected_binding_id: binding.binding_id, expected_binding_generation: binding.binding_generation, expected_engineer_contract_revision: binding.engineer_contract_revision, expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T10:03:00.000Z' })).toThrow('forbids new effects');
    expect(existsSync(join(resolveGitCommonDirectory(repoRoot), 'repo-harness/agent-runtime-effects/v2/effects', deriveAgentRuntimeEffectId('off-runtime').slice(7)))).toBe(false);
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ agent_runtime: { mode: 'active', adapters: { 'codex-app-thread': { enabled: false }, 'tmux-cli-agent': { enabled: true } } } })}\n`);
    const prepared = prepareAgentRuntimeEffect({ repo_root: repoRoot, message_kind: 'module_message', engineer_id: engineerId, message_id: messageOne, idempotency_key: 'disabled-runtime', expected_binding_id: binding.binding_id, expected_binding_generation: binding.binding_generation, expected_engineer_contract_revision: binding.engineer_contract_revision, expected_capability_sha256: observed.capability_sha256, created_at: '2026-08-30T10:03:00.000Z' });
    expect(() => startAgentRuntimeEffect({ repo_root: repoRoot, effect_id: prepared.intent.effect_id, started_at: '2026-08-30T10:05:00.000Z' })).toThrow('codex-app-thread is disabled');
    expect(readAgentRuntimeEffectStatus(repoRoot, prepared.intent.effect_id).current.state).toBe('intent_persisted');
  });

  test('feature policy rejects undeclared runtime fields instead of accepting a compatibility shape', () => {
    const repoRoot = fixture();
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ agent_runtime: { mode: 'active', adapters: { 'codex-app-thread': { enabled: true }, 'tmux-cli-agent': { enabled: true } }, fallback: 'tmux-cli-agent' } })}\n`);
    expect(() => readAgentRuntimePolicy(repoRoot)).toThrow('agent_runtime.mode must be off, shadow, or active');
  });

  test('V1 retirement is terminal-only and moves exact bytes without synthesizing V2 effects', () => {
    const repoRoot = fixture(); const common = resolveGitCommonDirectory(repoRoot); const v1 = join(common, 'repo-harness/provider-thread-effects/v1/effects/abc'); mkdirSync(v1, { recursive: true }); writeFileSync(join(v1, 'current.json'), '{"state":"observed_success"}\n');
    const receipt = migrateProviderThreadEffectsV1(repoRoot, '2026-08-30T10:20:00.000Z')!; expect(receipt.archive_relative_path).toContain(receipt.source_tree_sha256.slice(7)); expect(existsSync(join(common, receipt.archive_relative_path))).toBe(true); expect(existsSync(join(common, 'repo-harness/agent-runtime-effects/v2/effects'))).toBe(true);
    expect(migrateProviderThreadEffectsV1(repoRoot, '2026-08-30T10:21:00.000Z')).toEqual(receipt);
  });

  test('V1 retirement refuses non-terminal state and recovers a crash after archive rename', () => {
    const blockedRoot = fixture(); const blockedCommon = resolveGitCommonDirectory(blockedRoot); const blocked = join(blockedCommon, 'repo-harness/provider-thread-effects/v1/effects/abc'); mkdirSync(blocked, { recursive: true }); writeFileSync(join(blocked, 'current.json'), '{"state":"effect_started"}\n');
    expect(() => migrateProviderThreadEffectsV1(blockedRoot, '2026-08-30T10:20:00.000Z')).toThrow('non-terminal');
    expect(existsSync(join(blockedCommon, 'repo-harness/provider-thread-effects/v1'))).toBe(true);

    const repoRoot = fixture(); const common = resolveGitCommonDirectory(repoRoot); const terminal = join(common, 'repo-harness/provider-thread-effects/v1/effects/abc'); mkdirSync(terminal, { recursive: true }); writeFileSync(join(terminal, 'current.json'), '{"state":"observed_failure"}\n');
    expect(() => migrateProviderThreadEffectsV1(repoRoot, '2026-08-30T10:30:00.000Z', () => { throw new Error('crash'); })).toThrow('crash');
    expect(existsSync(join(common, 'repo-harness/provider-thread-effects/v1'))).toBe(false);
    const recovered = migrateProviderThreadEffectsV1(repoRoot, '2026-08-30T10:31:00.000Z');
    expect(recovered?.migrated_at).toBe('2026-08-30T10:31:00.000Z');
    expect(migrateProviderThreadEffectsV1(repoRoot, '2026-08-30T10:32:00.000Z')).toEqual(recovered);
  });
});
