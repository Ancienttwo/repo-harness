import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  agentRuntimeControlRef,
  buildAgentRuntimeCapabilityObservation,
  buildAgentRuntimeControllerStepReceipt,
  buildAgentRuntimeEffectIntent,
  buildAgentRuntimeHostAction,
  buildAgentRuntimeOfferWakeSnapshot,
  canonicalAgentRuntimeControllerStepReceiptBytes,
  canonicalAgentRuntimeEffectIntentBytes,
  decideAgentRuntimeOfferWake,
  deriveAgentRuntimeOfferWakeIdempotencyKey,
  assertAgentRuntimeReceiptKindForOperation,
  validateAgentRuntimeControllerStepReceipt,
  validateAgentRuntimeEffectIntent,
  validateAgentRuntimeHostAction,
  type AgentRuntimeAdapterKind,
  type AgentRuntimeOfferWakeHostActionV2,
} from '../../src/core/engineers/agent-runtime-effect';
import {
  buildEngineerOfferCandidate,
  buildEngineerOffersDocument,
  projectWorkGraph,
  validateWorkGraph,
  type EngineerOfferCandidateResult,
  type EngineerOffersV1,
  type WorkPackageDependencyObservationV1,
} from '../../src/core/engineers/scheduling';
import type { EngineerPrincipalV1 } from '../../src/core/engineers/principal-claim';
import { CODEX_APP_THREAD_OPERATIONS, executeCodexAppThreadAction } from '../../src/effects/engineers/agent-runtime-adapters/codex-app-thread';
import { TMUX_CLI_AGENT_OPERATIONS, executeTmuxCliAgentAction } from '../../src/effects/engineers/agent-runtime-adapters/tmux-cli-agent';
import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { collectEngineeringBoard } from '../../src/effects/engineers/engineering-overlay';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { acquireScheduledEngineerTask } from '../../src/effects/engineers/scheduling-acquire';
import {
  AgentRuntimeEffectStoreError,
  listDueOfferWakes,
  observeAgentRuntimeEffect,
  readAgentRuntimeEffectStatus,
  readOfferWakeLedger,
  recordAgentRuntimeCapability,
  recordAgentRuntimeControllerStep,
  recordEngineerOfferSnapshot,
  startAgentRuntimeEffect,
  subscribeToOfferWakes,
} from '../../src/effects/engineers/agent-runtime-effect-store';
import {
  bumpRepoHarnessAuthorizationRevision,
  repoHarnessRepoIdFor,
} from '../../src/effects/repo-registry';

const sourceRoot = process.cwd();
const disposable: string[] = [];
const engineerId = 'engineer:capability.verification.evals-checks';
const capabilityId = 'capability.verification.evals-checks';
const bindingOne = '11111111-1111-4111-8111-111111111111';
const bindingTwo = '22222222-2222-4222-8222-222222222222';
const digest = `sha256:${'a'.repeat(64)}`;
const taskId = '1'.repeat(64);
const taskRevision = '2'.repeat(64);

interface Fixture {
  readonly repoRoot: string;
  readonly env: NodeJS.ProcessEnv;
  readonly repositoryId: string;
  readonly bindingId: string;
  readonly bindingGeneration: number;
  readonly capabilitySha256: string;
}

function temporary(prefix: string): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  disposable.push(path);
  return path;
}

function bind(repoRoot: string, adapter: AgentRuntimeAdapterKind, bindingId: string) {
  const profile = loadEngineerProfile(repoRoot, engineerId);
  const status = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision);
  const previous = status.current;
  return bindEngineer(repoRoot, {
    engineer_id: engineerId,
    idempotency_key: `bind-${bindingId}`,
    provider: adapter,
    provider_thread_id: `endpoint-${bindingId.slice(0, 4)}`,
    host_id: 'local',
    engineer_contract_revision: profile.engineer_contract_revision,
    expected_current_digest: status.binding ? previous.current_digest : null,
    expected_binding_generation: status.binding ? previous.binding_generation : 0,
    expected_binding_id: status.binding ? previous.current_binding_id : null,
    expected_engineer_contract_revision: profile.engineer_contract_revision,
    binding_id: () => bindingId,
    now: () => (bindingId === bindingOne ? '2026-09-03T10:00:00.000Z' : '2026-09-03T10:10:00.000Z'),
  });
}

function capability(
  repoRoot: string,
  adapter: AgentRuntimeAdapterKind,
  wake: 'supported' | 'unsupported' | 'unavailable' | 'unverifiable' = 'supported',
) {
  return recordAgentRuntimeCapability(repoRoot, {
    adapter_kind: adapter,
    host_id: 'local',
    operations: { notify_inbox: 'supported', wake_for_offer: wake },
    evidence_refs: [{ ref: 'canary', sha256: digest }],
    observed_at: '2026-09-03T10:02:00.000Z',
  });
}

/** A real repository plus a private registry home naming exactly it, so the
 * authorization revision fence reads a registry this test owns. */
function fixture(
  adapter: AgentRuntimeAdapterKind = 'codex-app-thread',
  wake: 'supported' | 'unsupported' | 'unavailable' | 'unverifiable' = 'supported',
): Fixture {
  const repoRoot = temporary('repo-harness-issue281-');
  execFileSync('git', ['init', '-q'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: repoRoot });
  mkdirSync(join(repoRoot, '.archcontext/model'), { recursive: true });
  mkdirSync(join(repoRoot, 'agents'), { recursive: true });
  mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(repoRoot, 'agents/engineers'), { recursive: true });
  writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({
    agent_runtime: { mode: 'active', adapters: { 'codex-app-thread': { enabled: true }, 'tmux-cli-agent': { enabled: true } } },
  })}\n`);
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repoRoot });
  const home = temporary('repo-harness-issue281-home-');
  const repositoryId = repoHarnessRepoIdFor(repoRoot);
  writeFileSync(join(home, 'registered-repos.json'), `${JSON.stringify({
    version: 1,
    authorizationRevision: 1,
    repos: [{
      id: repositoryId, path: repoRoot, accessMode: 'read_write', source: 'manual',
      registeredAt: '2026-09-03T10:00:00.000Z', lastSeenAt: '2026-09-03T10:00:00.000Z',
    }],
  })}\n`);
  bind(repoRoot, adapter, bindingOne);
  const profile = loadEngineerProfile(repoRoot, engineerId);
  const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
  const observed = capability(repoRoot, adapter, wake);
  return Object.freeze({
    repoRoot,
    env: { ...process.env, REPO_HARNESS_HOME: home },
    repositoryId,
    bindingId: binding.binding_id,
    bindingGeneration: binding.binding_generation,
    capabilitySha256: observed.capability_sha256,
  });
}

interface OfferOptions {
  readonly workPackageId?: string;
  readonly eligible?: boolean;
  readonly blocker?: 'dependency' | 'concurrency';
  readonly authorizationRevision?: number;
  readonly taskRevision?: string;
}

function candidate(fx: Fixture, options: OfferOptions = {}): EngineerOfferCandidateResult {
  const workPackageId = options.workPackageId ?? 'wp-a';
  const revision = options.taskRevision ?? taskRevision;
  const blocked = options.eligible === false;
  const dependencies: readonly WorkPackageDependencyObservationV1[] = blocked && options.blocker === 'dependency'
    ? [{ repository_id: fx.repositoryId, work_package_id: 'wp-upstream', required_state: 'canonical_done', status: 'unsatisfied', authority_revision: digest }]
    : [];
  const graph = projectWorkGraph(validateWorkGraph({
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: fx.repositoryId,
    sprint_path: 'plans/sprints/demo.sprint.md',
    lane: 'engineering-v2',
    work_packages: [{
      work_package_id: workPackageId,
      task_ref: 'task A',
      primary_capability: capabilityId,
      depends_on: dependencies.map((entry) => ({
        repository_id: entry.repository_id, work_package_id: entry.work_package_id, required_state: entry.required_state,
      })),
      priority: 50,
      concurrency: { scope: 'repo', key: 'release' },
      execution_surface: 'contract',
      integration_group: null,
      required_acceptance: [{ gate: 'module', policy_id: 'module', policy_ref: 'plans/policy.json', policy_revision: digest }],
      rollback_boundary: { kind: 'work_package', boundary_id: workPackageId, boundary_ref: 'plans/rollback.json', boundary_revision: digest },
    }],
  }), [{ task_id: taskId, task_revision: revision, task_ref: 'task A', status: '[ ]', row_order: 1 }]);
  return buildEngineerOfferCandidate({
    graph,
    work_package: graph.work_packages[0]!,
    engineer: { engineer_id: engineerId, capability_id: capabilityId, engineer_contract_revision: digest, max_active_claims: 1 },
    binding: { state: 'active', binding_id: fx.bindingId, binding_generation: fx.bindingGeneration },
    fleet_offer: {
      execution_readiness: 'execution_ready',
      snapshot_consistency: 'stable',
      task_id: taskId,
      task_revision: revision,
      offer_revision: `sha256:${'b'.repeat(64)}`,
      authorization_revision: options.authorizationRevision ?? 1,
    },
    dependencies,
    concurrency_available: !(blocked && options.blocker === 'concurrency'),
    concurrency_revision: `sha256:${'c'.repeat(64)}`,
    active_claims: 0,
  });
}

function offers(fx: Fixture, options: OfferOptions = {}): EngineerOffersV1 {
  const result = candidate(fx, options);
  if (options.eligible === false && result.eligible) throw new Error('fixture candidate should be blocked');
  if (options.eligible !== false && !result.eligible) throw new Error('fixture candidate should be eligible');
  return buildEngineerOffersDocument({
    repository_id: fx.repositoryId,
    engineer_id: engineerId,
    lane: 'engineering-v2',
    work_graph_revision: result.eligible ? result.offer.work_graph_revision : `sha256:${'d'.repeat(64)}`,
    candidates: [result],
  });
}

function emptyOffers(fx: Fixture): EngineerOffersV1 {
  return buildEngineerOffersDocument({
    repository_id: fx.repositoryId,
    engineer_id: engineerId,
    lane: 'engineering-v2',
    work_graph_revision: null,
    candidates: [],
  });
}

function record(fx: Fixture, document: EngineerOffersV1, observedAt: string, policy?: { debounce_ms?: number; polling_fallback_enabled?: boolean }) {
  return recordEngineerOfferSnapshot({
    repo_root: fx.repoRoot,
    offers: document,
    observed_at: observedAt,
    expected_capability_sha256: fx.capabilitySha256,
    wake_policy: {
      debounce_ms: policy?.debounce_ms ?? 0,
      polling_fallback_enabled: policy?.polling_fallback_enabled ?? false,
    },
    env: fx.env,
  });
}

function principal(fx: Fixture): EngineerPrincipalV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-engineer-principal',
    repository_id: fx.repositoryId,
    engineer_id: engineerId,
    binding_id: fx.bindingId,
    binding_generation: fx.bindingGeneration,
    engineer_contract_revision: digest,
    carrier: 'mcp_oauth',
    auth_subject: '22222222-2222-4222-8222-222222222222',
    provider: 'unknown',
    provider_thread_id: null,
  };
}

afterEach(() => {
  while (disposable.length > 0) rmSync(disposable.pop()!, { recursive: true, force: true });
});

describe('issue #281 durable task-offer wake protocol', () => {
  test('the capability matrix and the operation union carry both runtime operations', () => {
    const observation = buildAgentRuntimeCapabilityObservation({
      adapter_kind: 'tmux-cli-agent',
      host_id: 'local',
      operations: { notify_inbox: 'supported', wake_for_offer: 'unsupported' },
      evidence_refs: [],
      observed_at: '2026-09-03T10:00:00.000Z',
    });
    expect(observation.operations.wake_for_offer).toBe('unsupported');
    expect(() => buildAgentRuntimeCapabilityObservation({
      adapter_kind: 'tmux-cli-agent',
      host_id: 'local',
      operations: { notify_inbox: 'supported' } as never,
      evidence_refs: [],
      observed_at: '2026-09-03T10:00:00.000Z',
    })).toThrow();
  });

  test('a wake intent binds the exact Engineer, Binding, repository, authorization and snapshot fence', () => {
    const intent = buildAgentRuntimeEffectIntent({
      idempotency_key: 'wake-one',
      operation: 'wake_for_offer',
      wake_ref: { repository_id: 'repo_0123456789abcdef', authorization_revision: 4, snapshot_revision: digest, wake_reason: 'new_eligible_offer' },
      endpoint_fence: {
        engineer_id: engineerId, binding_id: bindingOne, binding_generation: 1, engineer_contract_revision: digest,
        adapter_kind: 'tmux-cli-agent', host_id: 'local', endpoint_id: 'opaque-endpoint',
      },
      capability_sha256: digest,
      created_at: '2026-09-03T10:00:00.000Z',
    });
    if (intent.operation !== 'wake_for_offer') throw new Error('intent should be a wake');
    expect(validateAgentRuntimeEffectIntent(JSON.parse(canonicalAgentRuntimeEffectIntentBytes(intent)))).toEqual(intent);
    expect(intent.wake_ref).toEqual({ repository_id: 'repo_0123456789abcdef', authorization_revision: 4, snapshot_revision: digest, wake_reason: 'new_eligible_offer' });
    expect(() => validateAgentRuntimeEffectIntent({ ...intent, wake_ref: { ...intent.wake_ref, snapshot_revision: `sha256:${'9'.repeat(64)}` } })).toThrow();
    expect(() => buildAgentRuntimeEffectIntent({
      idempotency_key: 'wake-bad-reason',
      operation: 'wake_for_offer',
      wake_ref: { repository_id: 'repo_0123456789abcdef', authorization_revision: 4, snapshot_revision: digest, wake_reason: 'because' as never },
      endpoint_fence: {
        engineer_id: engineerId, binding_id: bindingOne, binding_generation: 1, engineer_contract_revision: digest,
        adapter_kind: 'tmux-cli-agent', host_id: 'local', endpoint_id: 'opaque-endpoint',
      },
      capability_sha256: digest,
      created_at: '2026-09-03T10:00:00.000Z',
    })).toThrow();
  });

  test('a wake Host action carries a bounded wake control reference and no claim or writable authority', () => {
    const intent = buildAgentRuntimeEffectIntent({
      idempotency_key: 'wake-two',
      operation: 'wake_for_offer',
      wake_ref: { repository_id: 'repo_0123456789abcdef', authorization_revision: 4, snapshot_revision: digest, wake_reason: 'dependency_unblocked' },
      endpoint_fence: {
        engineer_id: engineerId, binding_id: bindingOne, binding_generation: 3, engineer_contract_revision: digest,
        adapter_kind: 'codex-app-thread', host_id: 'local', endpoint_id: 'thread-9',
      },
      capability_sha256: digest,
      created_at: '2026-09-03T10:00:00.000Z',
    });
    const action = buildAgentRuntimeHostAction(intent) as AgentRuntimeOfferWakeHostActionV2;
    expect(action.operation).toBe('wake_for_offer');
    expect(action.control_ref).toBe(`repo-harness-wake:${action.effect_id}:${action.control_sha256}`);
    expect(agentRuntimeControlRef(intent)).toBe(action.control_ref);
    const serialized = JSON.stringify(action);
    for (const forbidden of ['claim_id', 'lease_generation', 'task_id', 'task_revision', 'message_id', 'delivery_attempt', 'token', 'write']) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(validateAgentRuntimeHostAction(JSON.parse(JSON.stringify(action)))).toEqual(action);
  });

  test('receipt kinds are bound to their operation so a message receipt can never close a wake', () => {
    expect(() => assertAgentRuntimeReceiptKindForOperation('wake_for_offer', 'module_message_delivery_receipt')).toThrow();
    expect(() => assertAgentRuntimeReceiptKindForOperation('wake_for_offer', 'task_message_delivery_receipt')).toThrow();
    expect(() => assertAgentRuntimeReceiptKindForOperation('notify_inbox', 'controller_step_receipt')).toThrow();
    expect(() => assertAgentRuntimeReceiptKindForOperation('wake_for_offer', 'controller_step_receipt')).not.toThrow();
    expect(() => assertAgentRuntimeReceiptKindForOperation('notify_inbox', 'module_message_delivery_receipt')).not.toThrow();
  });

  test('a controller-step receipt is canonical, digest-sealed and bound to one control reference', () => {
    const receipt = buildAgentRuntimeControllerStepReceipt({
      effect_id: digest,
      intent_sha256: digest,
      control_ref: `repo-harness-wake:${digest}:${digest}`,
      control_sha256: digest,
      engineer_id: engineerId,
      binding_id: bindingOne,
      binding_generation: 1,
      observed_snapshot_revision: `sha256:${'e'.repeat(64)}`,
      observed_at: '2026-09-03T10:05:00.000Z',
    });
    expect(validateAgentRuntimeControllerStepReceipt(JSON.parse(canonicalAgentRuntimeControllerStepReceiptBytes(receipt)))).toEqual(receipt);
    expect(() => validateAgentRuntimeControllerStepReceipt({ ...receipt, observed_at: '2026-09-03T11:05:00.000Z' })).toThrow();
  });
});

describe('issue #281 pure offer-transition observer', () => {
  const fx = () => ({ repositoryId: 'repo_0123456789abcdef', bindingId: bindingOne, bindingGeneration: 1 } as unknown as Fixture);

  test('an empty to eligible transition is due with new_eligible_offer', () => {
    const base = fx();
    const previous = buildAgentRuntimeOfferWakeSnapshot(emptyOffers(base));
    const decision = decideAgentRuntimeOfferWake(previous, buildAgentRuntimeOfferWakeSnapshot(offers(base)));
    expect(decision).toMatchObject({ due: true, wake_reason: 'new_eligible_offer' });
  });

  test('no previous observation still wakes on the first eligible snapshot', () => {
    const decision = decideAgentRuntimeOfferWake(null, buildAgentRuntimeOfferWakeSnapshot(offers(fx())));
    expect(decision).toMatchObject({ due: true, wake_reason: 'new_eligible_offer' });
  });

  test('a previously dependency-blocked Work Package wakes as dependency_unblocked', () => {
    const base = fx();
    const previous = buildAgentRuntimeOfferWakeSnapshot(offers(base, { eligible: false, blocker: 'dependency' }));
    const decision = decideAgentRuntimeOfferWake(previous, buildAgentRuntimeOfferWakeSnapshot(offers(base)));
    expect(decision).toMatchObject({ due: true, wake_reason: 'dependency_unblocked' });
  });

  test('a previously concurrency-blocked Work Package wakes as concurrency_released', () => {
    const base = fx();
    const previous = buildAgentRuntimeOfferWakeSnapshot(offers(base, { eligible: false, blocker: 'concurrency' }));
    const decision = decideAgentRuntimeOfferWake(previous, buildAgentRuntimeOfferWakeSnapshot(offers(base)));
    expect(decision).toMatchObject({ due: true, wake_reason: 'concurrency_released' });
  });

  test('the same snapshot, an already eligible Engineer and an empty snapshot are never due', () => {
    const base = fx();
    const eligible = buildAgentRuntimeOfferWakeSnapshot(offers(base));
    expect(decideAgentRuntimeOfferWake(eligible, eligible)).toMatchObject({ due: false, cause: 'unchanged_snapshot' });
    const newer = buildAgentRuntimeOfferWakeSnapshot(offers(base, { taskRevision: '3'.repeat(64) }));
    expect(decideAgentRuntimeOfferWake(eligible, newer)).toMatchObject({ due: false, cause: 'already_eligible' });
    expect(decideAgentRuntimeOfferWake(eligible, buildAgentRuntimeOfferWakeSnapshot(emptyOffers(base))))
      .toMatchObject({ due: false, cause: 'no_eligible_offers' });
  });

  test('a snapshot for another Engineer or repository is refused instead of diffed', () => {
    const base = fx();
    const other = { ...base, repositoryId: 'repo_fedcba9876543210' } as Fixture;
    const previous = buildAgentRuntimeOfferWakeSnapshot(emptyOffers(base));
    expect(() => decideAgentRuntimeOfferWake(previous, buildAgentRuntimeOfferWakeSnapshot(emptyOffers(other)))).toThrow();
  });

  test('the idempotency key is a deterministic function of Binding, snapshot and reason', () => {
    const input = { engineer_id: engineerId, binding_id: bindingOne, binding_generation: 1, snapshot_revision: digest, wake_reason: 'new_eligible_offer' } as const;
    expect(deriveAgentRuntimeOfferWakeIdempotencyKey(input)).toBe(deriveAgentRuntimeOfferWakeIdempotencyKey({ ...input }));
    expect(deriveAgentRuntimeOfferWakeIdempotencyKey({ ...input, wake_reason: 'retry_due' }))
      .not.toBe(deriveAgentRuntimeOfferWakeIdempotencyKey(input));
  });
});

describe('issue #281 durable wake store', () => {
  test('the empty to eligible transition creates exactly one durable wake intent and repeats are idempotent', () => {
    const fx = fixture();
    expect(record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z')).toMatchObject({ outcome: 'no_wake', cause: 'no_eligible_offers' });
    const eligible = offers(fx);
    const first = record(fx, eligible, '2026-09-03T10:04:00.000Z');
    expect(first.outcome).toBe('wake_prepared');
    expect(first.status!.current.state).toBe('intent_persisted');
    expect(first.status!.intent.operation).toBe('wake_for_offer');
    const again = record(fx, eligible, '2026-09-03T10:05:00.000Z');
    expect(again).toMatchObject({ outcome: 'unchanged', cause: 'unchanged_snapshot' });
    expect(again.status!.intent.effect_id).toBe(first.status!.intent.effect_id);
    const ledger = readOfferWakeLedger(fx.repoRoot, { engineer_id: engineerId, binding_id: fx.bindingId, binding_generation: fx.bindingGeneration })!;
    expect(ledger.pending!.effect_id).toBe(first.status!.intent.effect_id);
    expect(ledger.observed.snapshot_revision).toBe(eligible.snapshot_revision);
  });

  test('a newer snapshot supersedes an unstarted wake, keeps the newest revision and never starts the old one', () => {
    const fx = fixture();
    record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z');
    const first = record(fx, offers(fx), '2026-09-03T10:04:00.000Z');
    record(fx, emptyOffers(fx), '2026-09-03T10:04:30.000Z');
    const newer = offers(fx, { taskRevision: '3'.repeat(64) });
    const second = record(fx, newer, '2026-09-03T10:05:00.000Z');
    expect(second.outcome).toBe('wake_coalesced');
    expect(second.status!.intent.effect_id).not.toBe(first.status!.intent.effect_id);
    expect(second.ledger.pending!.snapshot_revision).toBe(newer.snapshot_revision);
    expect(() => startAgentRuntimeEffect({ repo_root: fx.repoRoot, effect_id: first.status!.intent.effect_id, started_at: '2026-09-03T10:06:00.000Z', env: fx.env }))
      .toThrow(AgentRuntimeEffectStoreError);
    expect(readAgentRuntimeEffectStatus(fx.repoRoot, first.status!.intent.effect_id).current.state).toBe('intent_persisted');
    expect(startAgentRuntimeEffect({ repo_root: fx.repoRoot, effect_id: second.status!.intent.effect_id, started_at: '2026-09-03T10:06:00.000Z', env: fx.env }).action)
      .not.toBeNull();
  });

  test('the bounded debounce window coalesces repeated changes and is never extended by them', () => {
    const fx = fixture();
    record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z', { debounce_ms: 60_000 });
    const first = record(fx, offers(fx), '2026-09-03T10:04:00.000Z', { debounce_ms: 60_000 });
    expect(first.ledger.pending!.coalesce_until).toBe('2026-09-03T10:05:00.000Z');
    expect(listDueOfferWakes(fx.repoRoot, { now: '2026-09-03T10:04:30.000Z' })).toHaveLength(0);
    expect(() => startAgentRuntimeEffect({ repo_root: fx.repoRoot, effect_id: first.status!.intent.effect_id, started_at: '2026-09-03T10:04:30.000Z', env: fx.env }))
      .toThrow(AgentRuntimeEffectStoreError);
    record(fx, emptyOffers(fx), '2026-09-03T10:04:40.000Z', { debounce_ms: 60_000 });
    const second = record(fx, offers(fx, { taskRevision: '3'.repeat(64) }), '2026-09-03T10:04:50.000Z', { debounce_ms: 60_000 });
    expect(second.outcome).toBe('wake_coalesced');
    expect(second.ledger.pending!.coalesce_until).toBe('2026-09-03T10:05:00.000Z');
    expect(listDueOfferWakes(fx.repoRoot, { now: '2026-09-03T10:05:00.000Z' })).toHaveLength(1);
  });

  test('a started wake is never superseded and a newer snapshot never opens a second concurrent wake', () => {
    const fx = fixture();
    record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z');
    const first = record(fx, offers(fx), '2026-09-03T10:04:00.000Z');
    startAgentRuntimeEffect({ repo_root: fx.repoRoot, effect_id: first.status!.intent.effect_id, started_at: '2026-09-03T10:04:10.000Z', env: fx.env });
    record(fx, emptyOffers(fx), '2026-09-03T10:04:20.000Z');
    const second = record(fx, offers(fx, { taskRevision: '3'.repeat(64) }), '2026-09-03T10:04:30.000Z');
    expect(second).toMatchObject({ outcome: 'no_wake', cause: 'wake_in_flight' });
    expect(second.ledger.pending!.effect_id).toBe(first.status!.intent.effect_id);
  });

  test('Binding rotation, capability downgrade and authorization change all fail before the Host action', () => {
    const rotated = fixture();
    record(rotated, emptyOffers(rotated), '2026-09-03T10:03:00.000Z');
    const wake = record(rotated, offers(rotated), '2026-09-03T10:04:00.000Z');
    bind(rotated.repoRoot, 'codex-app-thread', bindingTwo);
    expect(() => startAgentRuntimeEffect({ repo_root: rotated.repoRoot, effect_id: wake.status!.intent.effect_id, started_at: '2026-09-03T10:05:00.000Z', env: rotated.env }))
      .toThrow(AgentRuntimeEffectStoreError);
    expect(readAgentRuntimeEffectStatus(rotated.repoRoot, wake.status!.intent.effect_id).current.state).toBe('intent_persisted');

    const downgraded = fixture();
    record(downgraded, emptyOffers(downgraded), '2026-09-03T10:03:00.000Z');
    const second = record(downgraded, offers(downgraded), '2026-09-03T10:04:00.000Z');
    capability(downgraded.repoRoot, 'codex-app-thread', 'unavailable');
    expect(() => startAgentRuntimeEffect({ repo_root: downgraded.repoRoot, effect_id: second.status!.intent.effect_id, started_at: '2026-09-03T10:05:00.000Z', env: downgraded.env }))
      .toThrow(AgentRuntimeEffectStoreError);
    expect(readAgentRuntimeEffectStatus(downgraded.repoRoot, second.status!.intent.effect_id).current.state).toBe('intent_persisted');

    const reauthorized = fixture();
    record(reauthorized, emptyOffers(reauthorized), '2026-09-03T10:03:00.000Z');
    const third = record(reauthorized, offers(reauthorized), '2026-09-03T10:04:00.000Z');
    bumpRepoHarnessAuthorizationRevision(reauthorized.env);
    expect(() => startAgentRuntimeEffect({
      repo_root: reauthorized.repoRoot, effect_id: third.status!.intent.effect_id, started_at: '2026-09-03T10:05:00.000Z', env: reauthorized.env,
    })).toThrow(AgentRuntimeEffectStoreError);
    expect(readAgentRuntimeEffectStatus(reauthorized.repoRoot, third.status!.intent.effect_id).current.state).toBe('intent_persisted');
  });

  test('a stale authorization revision in the snapshot never mints a wake intent', () => {
    const fx = fixture();
    record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z');
    expect(() => record(fx, offers(fx, { authorizationRevision: 7 }), '2026-09-03T10:04:00.000Z')).toThrow(AgentRuntimeEffectStoreError);
  });

  test('an adapter without wake support fails closed unless the controller policy allows scheduled polling', () => {
    const strict = fixture('tmux-cli-agent', 'unsupported');
    record(strict, emptyOffers(strict), '2026-09-03T10:03:00.000Z');
    expect(() => record(strict, offers(strict), '2026-09-03T10:04:00.000Z')).toThrow(AgentRuntimeEffectStoreError);

    const permitted = fixture('tmux-cli-agent', 'unavailable');
    record(permitted, emptyOffers(permitted), '2026-09-03T10:03:00.000Z', { polling_fallback_enabled: true });
    const result = record(permitted, offers(permitted), '2026-09-03T10:04:00.000Z', { polling_fallback_enabled: true });
    expect(result).toMatchObject({ outcome: 'polling_fallback', cause: 'wake_unsupported', status: null });
    expect(result.ledger.pending).toBeNull();
  });
});

describe('issue #281 controller-step receipt is the only wake success evidence', () => {
  function started(fx: Fixture) {
    record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z');
    const wake = record(fx, offers(fx), '2026-09-03T10:04:00.000Z');
    const start = startAgentRuntimeEffect({ repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id, started_at: '2026-09-03T10:04:10.000Z', env: fx.env });
    return { wake, start };
  }

  test('an accepted adapter outcome without a receipt reconciles instead of succeeding', () => {
    const fx = fixture();
    const { wake } = started(fx);
    const observed = observeAgentRuntimeEffect({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id,
      adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: 0, process_signal: null },
      observed_at: '2026-09-03T10:05:00.000Z', receipt_wait_exhausted: true,
    });
    expect(observed.current.state).toBe('reconciliation_required');
    expect(observed.observation.failure_class).toBe('receipt_missing');
  });

  test('an exact controller-step receipt closes the wake and a foreign control reference never does', () => {
    const foreign = fixture();
    const foreignStart = started(foreign);
    expect(() => recordAgentRuntimeControllerStep({
      repo_root: foreign.repoRoot, effect_id: foreignStart.wake.status!.intent.effect_id,
      control_ref: `repo-harness-wake:sha256:${'f'.repeat(64)}:sha256:${'e'.repeat(64)}`,
      observed_snapshot_revision: foreignStart.wake.ledger.observed.snapshot_revision,
      observed_at: '2026-09-03T10:05:00.000Z',
    })).toThrow(AgentRuntimeEffectStoreError);

    const fx = fixture();
    const { wake, start } = started(fx);
    recordAgentRuntimeControllerStep({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id, control_ref: start.action!.control_ref,
      observed_snapshot_revision: wake.ledger.observed.snapshot_revision, observed_at: '2026-09-03T10:05:00.000Z',
    });
    const observed = observeAgentRuntimeEffect({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id,
      adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null },
      observed_at: '2026-09-03T10:06:00.000Z', receipt_wait_exhausted: false,
    });
    expect(observed.current.state).toBe('observed_success');
    expect(observed.observation.receipt_kind).toBe('controller_step_receipt');
  });

  test('a receipt cannot be recorded before the Host action ran', () => {
    const fx = fixture();
    record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z');
    const wake = record(fx, offers(fx), '2026-09-03T10:04:00.000Z');
    expect(() => recordAgentRuntimeControllerStep({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id,
      control_ref: `repo-harness-wake:${wake.status!.intent.effect_id}:sha256:${'e'.repeat(64)}`,
      observed_snapshot_revision: wake.ledger.observed.snapshot_revision, observed_at: '2026-09-03T10:05:00.000Z',
    })).toThrow(AgentRuntimeEffectStoreError);
  });

  test('a stale observed snapshot is still an acknowledged wake', () => {
    const fx = fixture();
    const { wake, start } = started(fx);
    recordAgentRuntimeControllerStep({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id, control_ref: start.action!.control_ref,
      observed_snapshot_revision: `sha256:${'9'.repeat(64)}`, observed_at: '2026-09-03T10:05:00.000Z',
    });
    const observed = observeAgentRuntimeEffect({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id,
      adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null },
      observed_at: '2026-09-03T10:06:00.000Z', receipt_wait_exhausted: false,
    });
    expect(observed.current.state).toBe('observed_success');
  });
});

describe('issue #281 non-CLI subscription seam', () => {
  test('a controller consumes due wakes directly from the effect layer', () => {
    const fx = fixture();
    record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z');
    const wake = record(fx, offers(fx), '2026-09-03T10:04:00.000Z');
    const due = listDueOfferWakes(fx.repoRoot, { now: '2026-09-03T10:04:10.000Z', engineer_id: engineerId });
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      effect_id: wake.status!.intent.effect_id,
      engineer_id: engineerId,
      wake_reason: 'new_eligible_offer',
      state: 'intent_persisted',
    });
    const seen: string[] = [];
    const subscription = subscribeToOfferWakes(fx.repoRoot, { engineer_id: engineerId, on_wake: (event) => { seen.push(`${event.effect_id}:${event.state}`); } });
    expect(subscription.poll('2026-09-03T10:04:10.000Z')).toBe(1);
    expect(subscription.poll('2026-09-03T10:04:20.000Z')).toBe(0);
    startAgentRuntimeEffect({ repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id, started_at: '2026-09-03T10:04:30.000Z', env: fx.env });
    expect(subscription.poll('2026-09-03T10:04:40.000Z')).toBe(1);
    expect(seen).toEqual([
      `${wake.status!.intent.effect_id}:intent_persisted`,
      `${wake.status!.intent.effect_id}:effect_started`,
    ]);
  });
});

describe('issue #281 adapters invoke exactly one bounded controller step', () => {
  function wakeAction(fx: Fixture) {
    record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z');
    const wake = record(fx, offers(fx), '2026-09-03T10:04:00.000Z');
    return startAgentRuntimeEffect({ repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id, started_at: '2026-09-03T10:04:10.000Z', env: fx.env }).action!;
  }

  test('the Codex App thread adapter invokes one bounded step carrying only the wake control reference', () => {
    const fx = fixture('codex-app-thread');
    const action = wakeAction(fx);
    const calls: unknown[] = [];
    const observation = executeCodexAppThreadAction(action, (input) => { calls.push(input); return { accepted: true }; });
    expect(observation).toMatchObject({ adapter_kind: 'codex-app-thread', outcome: 'accepted' });
    expect(calls).toEqual([{ host_id: 'local', thread_id: 'endpoint-1111', operation: 'wake_for_offer', control_ref: action.control_ref }]);
  });

  test('the tmux adapter sends exactly one bounded wake control reference and never a command', () => {
    const fx = fixture('tmux-cli-agent');
    const action = wakeAction(fx);
    const calls: string[][] = [];
    const observation = executeTmuxCliAgentAction(action, ({ endpoint_id }) => `%resolved-${endpoint_id}`, (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, signal: null, error: undefined, output: [], pid: 1, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    });
    expect(observation).toMatchObject({ adapter_kind: 'tmux-cli-agent', outcome: 'accepted', process_exit_code: 0 });
    expect(calls).toEqual([['tmux', 'send-keys', '-t', '%resolved-endpoint-1111', '--', action.control_ref, 'Enter']]);
  });

  test('both adapters declare the same operation contract and report unsupported for anything else', () => {
    expect([...CODEX_APP_THREAD_OPERATIONS]).toEqual(['notify_inbox', 'wake_for_offer']);
    expect([...TMUX_CLI_AGENT_OPERATIONS]).toEqual(['notify_inbox', 'wake_for_offer']);
    const fx = fixture('codex-app-thread');
    const action = wakeAction(fx);
    const foreign = { ...action, operation: 'stop_agent' } as unknown as typeof action;
    expect(() => executeCodexAppThreadAction(foreign, () => { throw new Error('must not run'); })).toThrow();
    expect(() => executeTmuxCliAgentAction(foreign as never, () => '%pane', () => { throw new Error('must not run'); })).toThrow();
  });
});

describe('issue #281 end-to-end idle to wake to re-read', () => {
  test('a woken controller re-reads offers and acquires through the ordinary scheduling seam', () => {
    const fx = fixture();
    record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z');
    const document = offers(fx);
    const wake = record(fx, document, '2026-09-03T10:04:00.000Z');
    const start = startAgentRuntimeEffect({ repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id, started_at: '2026-09-03T10:04:10.000Z', env: fx.env });
    executeCodexAppThreadAction(start.action!, () => ({ accepted: true }));

    let acquisitions = 0;
    const current = document.offers[0]!;
    const result = acquireScheduledEngineerTask({
      repo_root: fx.repoRoot,
      principal: principal(fx),
      assertion: {
        offer_revision: current.offer_revision, work_package_id: current.work_package_id,
        work_package_revision: current.work_package_revision, work_graph_revision: current.work_graph_revision,
        task_id: current.task_id, task_revision: current.task_revision, dependency_revision: current.dependency_revision,
        concurrency_revision: current.concurrency_revision, binding_id: current.binding_id,
        binding_generation: current.binding_generation, engineer_contract_revision: current.engineer_contract_revision,
        fleet_offer_revision: current.fleet_offer_revision, authorization_revision: current.authorization_revision,
      },
      env: fx.env,
      dependencies: {
        collectOffers: () => document,
        acquire: () => { acquisitions += 1; return { ok: false, error: 'fleet_offer_stale', message: 'fixture stops before the Fleet mutation' } as never; },
      },
    });
    expect(acquisitions).toBe(1);
    expect(result.ok).toBe(false);

    recordAgentRuntimeControllerStep({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id, control_ref: start.action!.control_ref,
      observed_snapshot_revision: document.snapshot_revision, observed_at: '2026-09-03T10:05:00.000Z',
    });
    const observed = observeAgentRuntimeEffect({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id,
      adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null },
      observed_at: '2026-09-03T10:06:00.000Z', receipt_wait_exhausted: false,
    });
    expect(observed.current.state).toBe('observed_success');
  });

  test('a wake whose snapshot went empty is a no-op acknowledgement and never a claim', () => {
    const fx = fixture();
    record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z');
    const document = offers(fx);
    const wake = record(fx, document, '2026-09-03T10:04:00.000Z');
    const start = startAgentRuntimeEffect({ repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id, started_at: '2026-09-03T10:04:10.000Z', env: fx.env });
    const stale = emptyOffers(fx);

    let acquisitions = 0;
    const current = document.offers[0]!;
    const result = acquireScheduledEngineerTask({
      repo_root: fx.repoRoot,
      principal: principal(fx),
      assertion: {
        offer_revision: current.offer_revision, work_package_id: current.work_package_id,
        work_package_revision: current.work_package_revision, work_graph_revision: current.work_graph_revision,
        task_id: current.task_id, task_revision: current.task_revision, dependency_revision: current.dependency_revision,
        concurrency_revision: current.concurrency_revision, binding_id: current.binding_id,
        binding_generation: current.binding_generation, engineer_contract_revision: current.engineer_contract_revision,
        fleet_offer_revision: current.fleet_offer_revision, authorization_revision: current.authorization_revision,
      },
      env: fx.env,
      dependencies: {
        collectOffers: () => stale,
        acquire: () => { acquisitions += 1; return { ok: true } as never; },
      },
    });
    expect(acquisitions).toBe(0);
    expect(result).toMatchObject({ ok: false, error: 'engineer_offer_stale' });

    recordAgentRuntimeControllerStep({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id, control_ref: start.action!.control_ref,
      observed_snapshot_revision: stale.snapshot_revision, observed_at: '2026-09-03T10:05:00.000Z',
    });
    expect(observeAgentRuntimeEffect({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id,
      adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null },
      observed_at: '2026-09-03T10:06:00.000Z', receipt_wait_exhausted: false,
    }).current.state).toBe('observed_success');
  });
});

describe('issue #281 wake state is observational in the Engineering board', () => {
  test('the overlay projects pending, delivered, failed and reconciliation-required wake counts', () => {
    const fx = fixture();
    record(fx, emptyOffers(fx), '2026-09-03T10:03:00.000Z');
    const wake = record(fx, offers(fx), '2026-09-03T10:04:00.000Z');
    const pending = collectEngineeringBoard({ repo_root: fx.repoRoot, env: fx.env });
    expect(pending.overlay.engineers[0]!.runtime_effects.wake).toEqual({ pending: 1, delivered: 0, failed: 0, reconciliation_required: 0 });

    const start = startAgentRuntimeEffect({ repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id, started_at: '2026-09-03T10:04:10.000Z', env: fx.env });
    recordAgentRuntimeControllerStep({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id, control_ref: start.action!.control_ref,
      observed_snapshot_revision: wake.ledger.observed.snapshot_revision, observed_at: '2026-09-03T10:05:00.000Z',
    });
    observeAgentRuntimeEffect({
      repo_root: fx.repoRoot, effect_id: wake.status!.intent.effect_id,
      adapter: { adapter_kind: 'codex-app-thread', outcome: 'accepted', process_exit_code: null, process_signal: null },
      observed_at: '2026-09-03T10:06:00.000Z', receipt_wait_exhausted: false,
    });
    const delivered = collectEngineeringBoard({ repo_root: fx.repoRoot, env: fx.env });
    expect(delivered.overlay.engineers[0]!.runtime_effects.wake).toEqual({ pending: 0, delivered: 1, failed: 0, reconciliation_required: 0 });
  });
});
