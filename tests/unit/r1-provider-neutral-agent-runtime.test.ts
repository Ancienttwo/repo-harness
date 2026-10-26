import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedEngineerTaskMessage } from '../helpers/engineer-runtime-fixture';
import { buildTaskMessageDeliveryReceipt, buildTaskMessageEvent, canonicalTaskMessageDeliveryReceiptBytes,
  transitionTaskMessageDeliveryReceipt, validateTaskMessageDeliveryReceipt } from '../../src/core/fleet/admitted-task-message';
import { buildAgentRuntimeCapabilityObservation, buildAgentRuntimeHostAction,
  canonicalAgentRuntimeCapabilityBytes, canonicalAgentRuntimeEffectIntentBytes, deriveAgentRuntimeEffectId,
  validateAgentRuntimeCapabilityObservation, validateAgentRuntimeEffectIntent } from '../../src/core/engineers/agent-runtime-effect';
import { AGENT_RUNTIME_EFFECT_RELATIVE_ROOT, AgentRuntimeEffectStoreError, prepareAgentRuntimeEffect,
  startAgentRuntimeEffect, observeAgentRuntimeEffect, readAgentRuntimeEffectStatus, recordAgentRuntimeCapability,
  projectTaskAgentRuntimeState } from '../../src/effects/engineers/agent-runtime-effect-store';
import { readAgentRuntimePolicy } from '../../src/effects/engineers/agent-runtime-feature';
import { deliverTaskInbox, acknowledgeTaskInbox, sendTaskMessage } from '../../src/effects/fleet/task-inbox';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';

const sourceRoot = process.cwd(), roots: string[] = [];
const engineerId = 'engineer:capability.verification.evals-checks';
const messageOne = '33333333-3333-4333-8333-333333333333';
const digest = `sha256:${'a'.repeat(64)}`;
const now = '2026-08-30T10:04:00.000Z';
const adapter = { adapter_kind: 'herdr-cli-agent' as const, outcome: 'accepted' as const, process_exit_code: 0, process_signal: null };
async function fixture() {
  const container = realpathSync(mkdtempSync(join(tmpdir(), 'runtime-admitted-'))); roots.push(container);
  const root = join(container, 'repo'), home = join(container, 'authority'); mkdirSync(root); mkdirSync(home, { mode: 0o700 });
  execFileSync('git', ['init', '-q'], { cwd: root }); execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: root }); execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root });
  mkdirSync(join(root, '.archcontext/model'), { recursive: true }); mkdirSync(join(root, 'agents'), { recursive: true }); mkdirSync(join(root, '.ai/harness'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/manifest.yaml'), join(root, '.archcontext/manifest.yaml')); cpSync(join(sourceRoot, 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '.ai/\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ agent_runtime: { mode: 'active', adapters: { 'herdr-cli-agent': { enabled: true } } } }));
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  const target = await seedEngineerTaskMessage(root, engineerId, messageOne, 'secret-message-body', { authorityHome: home });
  return { root, home, target, source: target.source };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function capability(f: Fixture) {
  return recordAgentRuntimeCapability(f.root, { adapter_kind: 'herdr-cli-agent', transport_endpoint_sha256: f.target.endpoint.transport_endpoint_sha256,
    operations: { notify_inbox: 'supported', wake_for_offer: 'supported' }, evidence_refs: [{ ref: 'canary', sha256: digest }], observed_at: now });
}
function prepare(f: Fixture, messageId = messageOne, key = 'runtime-one') {
  const observed = capability(f);
  const result = prepareAgentRuntimeEffect({ repo_root: f.root, ...f.target, message_id: messageId,
    idempotency_key: key, expected_capability_sha256: observed.capability_sha256, created_at: now });
  if (result.intent.operation !== 'notify_inbox') throw new Error('not a notification');
  return { ...result, intent: result.intent };
}
function start(f: Fixture, effectId: string) { return startAgentRuntimeEffect({ repo_root: f.root, source: f.source, effect_id: effectId, started_at: now }); }
function observe(f: Fixture, effectId: string) { return observeAgentRuntimeEffect({ repo_root: f.root, source: f.source, effect_id: effectId, adapter, observed_at: now, receipt_wait_exhausted: true }); }
function inbox(f: Fixture) { return { repo_root: f.root, source: f.source, task_id: f.target.task_id,
  recipient: { kind: 'claim' as const, claim: f.source.authority.claim }, execution_worktree: f.root }; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('R1 admitted Agent Runtime', () => {
  test('V2 schemas are closed and host action contains control identity, never message content', async () => {
    const f = await fixture(); const observed = capability(f);
    expect(validateAgentRuntimeCapabilityObservation(JSON.parse(canonicalAgentRuntimeCapabilityBytes(observed)))).toEqual(observed);
    expect(() => validateAgentRuntimeCapabilityObservation({ ...observed, send: 'supported' })).toThrow();
    const prepared = prepare(f), intent = prepared.intent;
    expect(validateAgentRuntimeEffectIntent(JSON.parse(canonicalAgentRuntimeEffectIntentBytes(intent)))).toEqual(intent);
    expect(() => validateAgentRuntimeEffectIntent({ ...intent, endpoint_fence: { ...intent.endpoint_fence, binding_generation: 1 } })).toThrow();
    const action = buildAgentRuntimeHostAction(intent);
    expect(JSON.stringify(action)).not.toContain('secret-message-body');
    expect(action.control_ref).toBe(`repo-harness-inbox:${action.effect_id}:${action.control_sha256}`);
  });
  test('lost acknowledgement reconciles and a repeated start emits no second action', async () => {
    const f = await fixture(), prepared = prepare(f);
    expect(start(f, prepared.intent.effect_id).action).not.toBeNull();
    const repeated = start(f, prepared.intent.effect_id);
    expect(repeated.action).toBeNull(); expect(repeated.current.state).toBe('reconciliation_required');
  });
  test('revoked admission after prepare prevents every Host action', async () => {
    const f = await fixture(), prepared = prepare(f); f.target.revoke();
    let refusal: unknown; try { start(f, prepared.intent.effect_id); } catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(AgentRuntimeEffectStoreError);
    expect(refusal).toMatchObject({ code: 'agent_runtime_effect_binding_stale' });
    expect(readAgentRuntimeEffectStatus(f.root, prepared.intent.effect_id).current.state).toBe('intent_persisted');
  });
  test('a different publicly bound session cannot execute an older prepared action', async () => {
    const f = await fixture(), prepared = prepare(f);
    const replacement = await f.target.rebind('reviewer');
    expect(replacement.binding.task_admission!.approval.grant_sha256).toBe(f.target.admission.approval.grant_sha256);
    expect(() => startAgentRuntimeEffect({ repo_root: f.root, source: replacement.source,
      effect_id: prepared.intent.effect_id, started_at: now })).toThrow('exact current admitted session');
    expect(readAgentRuntimeEffectStatus(f.root, prepared.intent.effect_id).current.state).toBe('intent_persisted');
  });
  test('Task delivery binds admitted profile, immutable claim and exact effect control receipt', async () => {
    const f = await fixture(), prepared = prepare(f), started = start(f, prepared.intent.effect_id);
    expect(started.action).not.toBeNull();
    expect(prepared.intent.endpoint_fence).toEqual(f.target.endpoint);
    expect(prepared.intent.message_ref.claim).toEqual(f.source.authority.claim);
    deliverTaskInbox({ ...inbox(f), delivery_channel: 'agent_runtime_effect', message_id: messageOne,
      delivery_ref: started.action!.control_ref, delivered_at: now });
    const completed = observe(f, prepared.intent.effect_id);
    expect(completed.current.state).toBe('observed_success');
    expect(completed.observation.receipt_kind).toBe('task_message_delivery_receipt');
    const query = { repo_root: f.root, task_id: f.target.task_id, admission_sha256: f.target.expected_admission_sha256,
      session_binding_sha256: f.target.endpoint.session_binding_sha256, current_claim: f.source.authority.claim };
    expect(projectTaskAgentRuntimeState(query).delivery_state).toBe('delivered');
    acknowledgeTaskInbox({ ...inbox(f), message_id: messageOne, acknowledged_at: now });
    expect(projectTaskAgentRuntimeState(query).delivery_state).toBe('acknowledged');
    expect(projectTaskAgentRuntimeState({ ...query, session_binding_sha256: digest }).delivery_evidence.candidate_count).toBe(0);
  });
  test('a Task hook delivery or a foreign control reference never proves the effect', async () => {
    const f = await fixture(), prepared = prepare(f); start(f, prepared.intent.effect_id);
    deliverTaskInbox({ ...inbox(f), delivery_channel: 'hook_session', delivered_at: now });
    const hookObserved = observe(f, prepared.intent.effect_id);
    expect(hookObserved.current.state).toBe('reconciliation_required'); expect(hookObserved.observation.failure_class).toBe('receipt_missing');
    const foreignId = '77777777-7777-4777-8777-777777777777';
    sendTaskMessage({ repo_root: f.root, source: f.source, event: buildTaskMessageEvent({ ...f.target.event, message_id: foreignId }) });
    const foreign = prepare(f, foreignId, 'foreign'); expect(start(f, foreign.intent.effect_id).action).not.toBeNull();
    deliverTaskInbox({ ...inbox(f), delivery_channel: 'agent_runtime_effect', message_id: foreignId,
      delivery_ref: `repo-harness-inbox:${prepared.intent.effect_id}:${digest}`, delivered_at: now });
    expect(observe(f, foreign.intent.effect_id).current.state).toBe('reconciliation_required');
  });
  test('an effect-channel receipt superseded before delivery stays serializable and never proves success', () => {
    const reserved = buildTaskMessageDeliveryReceipt({ message_id: messageOne, recipient: { kind: 'claim', claim: { reference: 'fixture', revision: digest } }, admission_sha256: digest, delivery_channel: 'agent_runtime_effect' });
    const superseded = transitionTaskMessageDeliveryReceipt(reserved, { state: 'superseded' });
    expect(superseded.delivery_state).toBe('superseded'); expect(superseded.delivery_ref).toBeNull();
    expect(() => validateTaskMessageDeliveryReceipt(JSON.parse(canonicalTaskMessageDeliveryReceiptBytes(superseded)))).not.toThrow();
  });
  test('observe before any delivery observation reconciles instead of throwing', async () => {
    const f = await fixture(), prepared = prepare(f); start(f, prepared.intent.effect_id);
    const observed = observe(f, prepared.intent.effect_id);
    expect(observed.current.state).toBe('reconciliation_required'); expect(observed.observation.failure_class).toBe('receipt_missing');
  });
  test('an idempotency replay with a different target fence fails closed', async () => {
    const f = await fixture(), observed = capability(f);
    const input = { repo_root: f.root, ...f.target, idempotency_key: 'replay-identity', expected_capability_sha256: observed.capability_sha256, created_at: now };
    expect(prepareAgentRuntimeEffect(input).intent.effect_id).toBe(deriveAgentRuntimeEffectId('replay-identity'));
    expect(() => prepareAgentRuntimeEffect({ ...input, expected_admission_sha256: digest })).toThrow('idempotency key names another prepare request');
  });
  test('shadow records preparation but refuses Host action', async () => {
    const f = await fixture(), prepared = prepare(f);
    writeFileSync(join(f.root, '.ai/harness/policy.json'), JSON.stringify({ agent_runtime: { mode: 'shadow', adapters: { 'herdr-cli-agent': { enabled: true } } } }));
    expect(() => start(f, prepared.intent.effect_id)).toThrow('forbids Host actions');
  });
  test('off and adapter disablement refuse mutation or action without fallback', async () => {
    const f = await fixture();
    writeFileSync(join(f.root, '.ai/harness/policy.json'), JSON.stringify({ agent_runtime: { mode: 'off', adapters: { 'herdr-cli-agent': { enabled: true } } } }));
    expect(() => prepare(f)).toThrow('forbids new effects');
    expect(existsSync(join(resolveGitCommonDirectory(f.root), AGENT_RUNTIME_EFFECT_RELATIVE_ROOT, 'effects', deriveAgentRuntimeEffectId('runtime-one').slice(7)))).toBe(false);
    writeFileSync(join(f.root, '.ai/harness/policy.json'), JSON.stringify({ agent_runtime: { mode: 'active', adapters: { 'herdr-cli-agent': { enabled: false } } } }));
    const prepared = prepare(f); expect(() => start(f, prepared.intent.effect_id)).toThrow('herdr-cli-agent is disabled');
    expect(readAgentRuntimeEffectStatus(f.root, prepared.intent.effect_id).current.state).toBe('intent_persisted');
  });
  test('feature policy rejects undeclared runtime fields instead of accepting a compatibility shape', async () => {
    const f = await fixture(); writeFileSync(join(f.root, '.ai/harness/policy.json'), JSON.stringify({ agent_runtime: { mode: 'active', adapters: { 'herdr-cli-agent': { enabled: true } }, fallback: 'herdr-cli-agent' } }));
    expect(() => readAgentRuntimePolicy(f.root)).toThrow('agent_runtime.mode must be off, shadow, or active');
  });
  test('retired backend config and capability evidence are rejected without translation', async () => {
    const f = await fixture(); writeFileSync(join(f.root, '.ai/harness/policy.json'), JSON.stringify({ agent_runtime: { mode: 'active', adapters: { 'codex-app-thread': { enabled: true }, 'herdr-cli-agent': { enabled: true } } } }));
    expect(() => readAgentRuntimePolicy(f.root)).toThrow('Herdr only');
    const evidence = buildAgentRuntimeCapabilityObservation({ adapter_kind: 'herdr-cli-agent', transport_endpoint_sha256: digest, operations: { notify_inbox: 'supported', wake_for_offer: 'supported' }, evidence_refs: [], observed_at: now });
    expect(() => validateAgentRuntimeCapabilityObservation({ ...evidence, adapter_kind: 'codex-app-thread' })).toThrow('adapter_kind is invalid');
  });
  test('admitted journal preserves retired bytes without treating them as current effects', async () => {
    const f = await fixture(), common = resolveGitCommonDirectory(f.root);
    const directory = join(common, 'repo-harness/provider-thread-effects/v1/effects/abc'); mkdirSync(directory, { recursive: true });
    const file = join(directory, 'current.json'), bytes = Buffer.from('{"state":"effect_started"}\n'); writeFileSync(file, bytes);
    expect(prepare(f).current.state).toBe('intent_persisted'); expect(readFileSync(file)).toEqual(bytes);
    expect(existsSync(join(common, 'repo-harness/agent-runtime-effects/v2/migrations/v1.json'))).toBe(false);
    expect(existsSync(join(common, 'repo-harness/provider-thread-effects/archive'))).toBe(false);
  });
});
