import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { engineerSha256 } from '../../src/core/engineers/profile-binding';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { buildMcpToolDefinitions, callMcpTool } from '../../src/cli/mcp/tools';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { bindEngineer, readEngineerBindingStatus, retireEngineer } from '../../src/effects/engineers/binding-store';
import { enrollEngineerPrincipal, revokeEngineerPrincipal } from '../../src/effects/engineers/principal-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import {
  prepareAgentRuntimeEffect,
  recordAgentRuntimeCapability,
} from '../../src/effects/engineers/agent-runtime-effect-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const roots: string[] = [];
const sourceRoot = process.cwd();
const engineerId = 'engineer:capability.verification.evals-checks';
const authorizationId = '22222222-2222-4222-8222-222222222222';

function fixture(): { repoRoot: string; home: string } {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me0b-mcp-engineer-')));
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me0b-mcp-engineer-home-')));
  roots.push(repoRoot, home);
  execFileSync('git', ['init', '-q'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: repoRoot });
  mkdirSync(join(repoRoot, '.archcontext/model'), { recursive: true });
  mkdirSync(join(repoRoot, 'agents'), { recursive: true });
  mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(repoRoot, 'agents/engineers'), { recursive: true });
  writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ agent_runtime: { mode: 'active', adapters: { 'codex-app-thread': { enabled: true }, 'tmux-cli-agent': { enabled: true } } } })}\n`);
  writeFileSync(join(repoRoot, 'README.md'), 'fixture\n');
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repoRoot });
  return { repoRoot, home };
}

const otherCapability = 'capability.workflow-engine.contract-assets';
const sprintPath = 'plans/sprints/demo.sprint.md';

/** A registered read_write repository carrying one canonical engineering-v2
 * work graph, so the scheduling tools run against the real projection chain
 * instead of an injected offers document. */
function schedulingFixture(): { repoRoot: string; home: string; repositoryId: string } {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me1a-mcp-')));
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me1a-mcp-home-')));
  roots.push(repoRoot, home);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: repoRoot });
  mkdirSync(join(repoRoot, '.archcontext/model'), { recursive: true });
  mkdirSync(join(repoRoot, 'agents'), { recursive: true });
  mkdirSync(join(repoRoot, '.ai/harness/sprint'), { recursive: true });
  mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
  mkdirSync(join(repoRoot, 'plans/policies'), { recursive: true });
  mkdirSync(join(repoRoot, 'plans/rollback'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(repoRoot, 'agents/engineers'), { recursive: true });
  const policyBytes = '{"policy":1}\n';
  const rollbackA = '{"rollback":"wp-a"}\n';
  const rollbackB = '{"rollback":"wp-b"}\n';
  const repositoryId = repoHarnessRepoIdFor(repoRoot);
  const workPackage = (id: string, taskRef: string, capability: string, rollback: string) => ({
    work_package_id: id,
    task_id: fixtureTaskId(taskRef),
    primary_capability: capability,
    depends_on: [],
    priority: 50,
    concurrency: { scope: 'repo', key: 'release' },
    execution_surface: 'contract',
    integration_group: null,
    required_acceptance: [{
      gate: 'module', policy_id: 'module-default',
      policy_ref: 'plans/policies/module.json', policy_revision: engineerSha256(policyBytes),
    }],
    retry_policy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'exponential', initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } as const,
    rollback_boundary: {
      kind: 'work_package', boundary_id: `${repositoryId}:${id}`,
      boundary_ref: `plans/rollback/${id}.json`, boundary_revision: engineerSha256(rollback),
    },
  });
  writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{"worktree_strategy":{"merge_back":{"target":"main"}}}\n');
  writeFileSync(join(repoRoot, '.ai/harness/sprint/active-sprint'), `${sprintPath}\n`);
  writeFileSync(join(repoRoot, sprintPath), [
    '# Sprint: demo', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|---|---|---|---|---|',
    `| 1 | ${fixtureTaskId('task A')} | [ ] | task A | contract | accepted A | (pending) |`,
    `| 2 | ${fixtureTaskId('task B')} | [ ] | task B | contract | accepted B | (pending) |`, '',
    '## Execution Log', '',
  ].join('\n'));
  writeFileSync(join(repoRoot, 'plans/sprints/demo.work-graph.v1.json'), `${JSON.stringify({
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: repositoryId,
    sprint_path: sprintPath,
    lane: 'engineering-v2',
    work_packages: [
      workPackage('wp-a', 'task A', 'capability.verification.evals-checks', rollbackA),
      workPackage('wp-b', 'task B', otherCapability, rollbackB),
    ],
  })}\n`);
  writeFileSync(join(repoRoot, 'plans/policies/module.json'), policyBytes);
  writeFileSync(join(repoRoot, 'plans/rollback/wp-a.json'), rollbackA);
  writeFileSync(join(repoRoot, 'plans/rollback/wp-b.json'), rollbackB);
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repoRoot });
  writeFileSync(join(home, 'registered-repos.json'), `${JSON.stringify({
    version: 1, authorizationRevision: 1, repos: [{
      id: repositoryId, path: repoRoot, accessMode: 'read_write', source: 'manual',
      registeredAt: '2026-08-25T00:00:00.000Z', lastSeenAt: '2026-08-25T00:00:00.000Z',
    }],
  })}\n`);
  return { repoRoot, home, repositoryId };
}

/** Every coordination authority the Fleet acquire path can write lives under
 * the git common directory, so this listing is the mutation probe. */
function coordinationState(repoRoot: string): string[] {
  const root = join(resolveGitCommonDirectory(repoRoot), 'repo-harness');
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true }).map((entry) => String(entry)).sort();
}

/** Every byte the Agent Runtime Effect store owns, so a read path that
 * creates store or lock directories, or repairs `current.json`, is visible. */
function agentRuntimeEffectState(repoRoot: string): string[] {
  const root = join(resolveGitCommonDirectory(repoRoot), 'repo-harness', 'agent-runtime-effects');
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true }).map((entry) => {
    const relative = String(entry);
    const target = join(root, relative);
    return statSync(target).isDirectory() ? `${relative}/` : `${relative}=${readFileSync(target, 'utf8')}`;
  }).sort();
}

afterEach(() => {
  delete process.env.REPO_HARNESS_HOME;
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('restricted Engineer MCP tools', () => {
  test('profile inventory is exact and contains no generic authority surfaces', () => {
    const policy = getMcpPolicy('engineer');
    const names = buildMcpToolDefinitions(policy, { enableChatgptBrowser: true }).map((tool) => tool.name);
    expect(names).toEqual([
      'engineer_status',
      'engineer_offers',
      'engineer_acquire',
      'engineer_acquire_next',
      'engineer_messages',
      'engineer_message_send',
      'engineer_message_ack',
      'engineer_runtime_effect_capability',
      'engineer_runtime_effect_status',
      'engineer_interface_change_propose',
      'engineer_interface_change_transition',
      'engineer_work_demand_propose',
      'engineer_work_demand_transition',
      // C7's collaboration block. It extends the same closed inventory rather
      // than opening a second profile, so this list stays the one place the
      // engineer profile's whole surface is stated.
      'collaboration_exchange',
      'collaboration_threads',
      'collaboration_packet',
      'collaboration_signal_post',
      'collaboration_handoff_publish',
      'collaboration_handoff_adopt',
    ]);
    expect(names.some((name) =>
      /(?:^|_)(shell|read|write|fleet|publication|acceptance|binding|browser|agent)(?:_|$)/u.test(name))).toBe(false);
  });

  test('status derives the principal from verified authorization and rejects another subject or generic tool', async () => {
    const { repoRoot, home } = fixture();
    process.env.REPO_HARNESS_HOME = home;
    const profile = loadEngineerProfile(repoRoot, engineerId);
    const current = bindEngineer(repoRoot, {
      engineer_id: engineerId,
      idempotency_key: 'bind-1',
      provider: 'codex-app-thread',
      provider_thread_id: 'thread-1',
      host_id: 'local',
      engineer_contract_revision: profile.engineer_contract_revision,
      expected_current_digest: null,
      expected_binding_generation: 0,
      expected_binding_id: null,
      expected_engineer_contract_revision: profile.engineer_contract_revision,
      now: () => '2026-08-25T00:00:00.000Z',
      binding_id: () => '11111111-1111-4111-8111-111111111111',
    });
    const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
    enrollEngineerPrincipal({ repository_id: repoHarnessRepoIdFor(repoRoot), authorization_id: authorizationId, binding, env: process.env });
    const policy = getMcpPolicy('engineer');
    const context = { repoRoot, policy, engineerAuthorizationId: authorizationId };
    const status = await callMcpTool(context, 'engineer_status', {
      engineer_id: engineerId,
      binding_id: current.current_binding_id,
      binding_generation: current.binding_generation,
      engineer_contract_revision: profile.engineer_contract_revision,
    });
    expect(status.isError).toBeUndefined();
    expect(status.structuredContent).toMatchObject({ ok: true, principal: { auth_subject: authorizationId, binding_id: current.current_binding_id } });

    const sent = await callMcpTool(context, 'engineer_message_send', {
      message_id: '55555555-5555-4555-8555-555555555555',
      capability_id: 'capability.verification.evals-checks',
      target_engineer_id: engineerId,
      scope: 'assignment',
      target_binding_id: binding.binding_id,
      target_binding_generation: binding.binding_generation,
      target_engineer_contract_revision: binding.engineer_contract_revision,
      message_type: 'status_update',
      subject_ref: null,
      resource_refs: [],
      body: 'MCP-derived sender identity.',
      created_at: '2026-08-25T00:30:00.000Z',
    });
    expect(sent).toMatchObject({
      structuredContent: {
        event: { sender: { kind: 'engineer', principal_ref: engineerId, binding_generation: 1 } },
        receipt: { delivery_state: 'pending' },
      },
    });
    const capability = recordAgentRuntimeCapability(repoRoot, {
      adapter_kind: 'codex-app-thread',
      host_id: 'local',
      operations: { notify_inbox: 'supported', wake_for_offer: 'supported' },
      evidence_refs: [{ ref: 'canary', sha256: `sha256:${'a'.repeat(64)}` }],
      observed_at: '2026-08-25T00:31:00.000Z',
    });
    const sentEvent = (sent.structuredContent as { event: { message_id: string } }).event;
    const effect = prepareAgentRuntimeEffect({
      repo_root: repoRoot,
      message_kind: 'module_message',
      engineer_id: engineerId,
      message_id: sentEvent.message_id,
      idempotency_key: 'mcp-read-only-effect',
      expected_binding_id: binding.binding_id,
      expected_binding_generation: binding.binding_generation,
      expected_engineer_contract_revision: binding.engineer_contract_revision,
      expected_capability_sha256: capability.capability_sha256,
      created_at: '2026-08-25T00:32:00.000Z',
    });
    const capabilityView = await callMcpTool(context, 'engineer_runtime_effect_capability', {});
    expect(capabilityView).toMatchObject({
      structuredContent: { capability: { capability_sha256: capability.capability_sha256, operations: { notify_inbox: 'supported', wake_for_offer: 'supported' } } },
    });
    const effectView = await callMcpTool(context, 'engineer_runtime_effect_status', { effect_id: effect.intent.effect_id });
    expect(effectView).toMatchObject({
      structuredContent: { intent: { effect_id: effect.intent.effect_id }, current: { state: 'intent_persisted' } },
    });
    const messages = await callMcpTool(context, 'engineer_messages', {});
    expect(messages).toMatchObject({
      structuredContent: {
        entries: [{ event: { message_id: '55555555-5555-4555-8555-555555555555' }, receipt: { delivery_state: 'delivered' } }],
      },
    });
    const acknowledged = await callMcpTool(context, 'engineer_message_ack', {
      message_id: '55555555-5555-4555-8555-555555555555',
    });
    expect(acknowledged).toMatchObject({
      structuredContent: { receipt: { delivery_state: 'acknowledged', acknowledged_by_binding_generation: 1 } },
    });

    const mismatchedFence = await callMcpTool(context, 'engineer_status', { binding_generation: current.binding_generation + 1 });
    expect(mismatchedFence).toMatchObject({ isError: true, structuredContent: { error: { code: 'engineer_principal_mismatch' } } });

    const other = await callMcpTool({ ...context, engineerAuthorizationId: '33333333-3333-4333-8333-333333333333' }, 'engineer_status', {});
    expect(other).toMatchObject({ isError: true, structuredContent: { error: { code: 'engineer_principal_unmapped' } } });
    const generic = await callMcpTool(context, 'fleet_acquire', {});
    expect(generic).toMatchObject({ structuredContent: { error: { code: 'TOOL_NOT_AVAILABLE' } } });

    const invalidMessageType = await callMcpTool(context, 'engineer_message_send', {
      message_id: '66666666-6666-4666-8666-666666666666',
      capability_id: 'capability.verification.evals-checks',
      target_engineer_id: engineerId,
      scope: 'assignment',
      target_binding_id: binding.binding_id,
      target_binding_generation: binding.binding_generation,
      target_engineer_contract_revision: binding.engineer_contract_revision,
      message_type: 'not_a_module_message_type',
      subject_ref: null,
      resource_refs: [],
      body: 'Schema rejection must stay typed across CLI and MCP.',
      created_at: '2026-08-25T00:40:00.000Z',
    });
    expect(invalidMessageType).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'module_message_invalid' } },
    });

    const invalidAttempts = await callMcpTool(context, 'engineer_acquire', {
      repo_id: repoHarnessRepoIdFor(repoRoot),
      task_id: 'a'.repeat(64),
      offer_revision: `sha256:${'b'.repeat(64)}`,
      authorization_revision: 0,
      max_attempts: 17,
    });
    expect(invalidAttempts).toMatchObject({ isError: true, structuredContent: { error: { code: 'INVALID_ARGUMENT' } } });

    const secondAuthorization = '44444444-4444-4444-8444-444444444444';
    enrollEngineerPrincipal({ repository_id: repoHarnessRepoIdFor(repoRoot), authorization_id: secondAuthorization, binding, env: process.env });
    revokeEngineerPrincipal(repoHarnessRepoIdFor(repoRoot), authorizationId, { revoked_at: '2026-08-25T01:00:00.000Z', env: process.env });
    const revoked = await callMcpTool(context, 'engineer_status', {});
    expect(revoked).toMatchObject({ isError: true, structuredContent: { error: { code: 'engineer_principal_revoked' } } });

    retireEngineer(repoRoot, {
      engineer_id: engineerId,
      idempotency_key: 'retire-1',
      expected_current_digest: current.current_digest,
      expected_binding_generation: current.binding_generation,
      expected_binding_id: current.current_binding_id!,
      expected_engineer_contract_revision: profile.engineer_contract_revision,
      now: () => '2026-08-25T02:00:00.000Z',
    });
    const stale = await callMcpTool({ ...context, engineerAuthorizationId: secondAuthorization }, 'engineer_status', {});
    expect(stale).toMatchObject({ isError: true, structuredContent: { error: { code: 'engineer_principal_stale' } } });
  });

  test('runtime effect status is a pure read: an unknown or foreign effect_id creates no store or lock path and repairs no current.json', async () => {
    const { repoRoot, home } = fixture();
    process.env.REPO_HARNESS_HOME = home;
    const profile = loadEngineerProfile(repoRoot, engineerId);
    bindEngineer(repoRoot, {
      engineer_id: engineerId,
      idempotency_key: 'bind-read-only',
      provider: 'codex-app-thread',
      provider_thread_id: 'thread-read-only',
      host_id: 'local',
      engineer_contract_revision: profile.engineer_contract_revision,
      expected_current_digest: null,
      expected_binding_generation: 0,
      expected_binding_id: null,
      expected_engineer_contract_revision: profile.engineer_contract_revision,
      now: () => '2026-08-25T00:00:00.000Z',
      binding_id: () => '11111111-1111-4111-8111-111111111111',
    });
    const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
    enrollEngineerPrincipal({ repository_id: repoHarnessRepoIdFor(repoRoot), authorization_id: authorizationId, binding, env: process.env });
    const context = { repoRoot, policy: getMcpPolicy('engineer'), engineerAuthorizationId: authorizationId };

    // No effect exists yet, so a read that prepared the store would leave the
    // whole agent-runtime-effects tree behind.
    expect(agentRuntimeEffectState(repoRoot)).toEqual([]);
    const unknown = await callMcpTool(context, 'engineer_runtime_effect_status', { effect_id: `sha256:${'c'.repeat(64)}` });
    expect(unknown).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'agent_runtime_effect_not_found' } },
    });
    expect(agentRuntimeEffectState(repoRoot)).toEqual([]);

    const capability = recordAgentRuntimeCapability(repoRoot, {
      adapter_kind: 'codex-app-thread',
      host_id: 'local',
      operations: { notify_inbox: 'supported', wake_for_offer: 'supported' },
      evidence_refs: [{ ref: 'canary', sha256: `sha256:${'a'.repeat(64)}` }],
      observed_at: '2026-08-25T00:31:00.000Z',
    });
    const sent = await callMcpTool(context, 'engineer_message_send', {
      message_id: '77777777-7777-4777-8777-777777777777',
      capability_id: 'capability.verification.evals-checks',
      target_engineer_id: engineerId,
      scope: 'assignment',
      target_binding_id: binding.binding_id,
      target_binding_generation: binding.binding_generation,
      target_engineer_contract_revision: binding.engineer_contract_revision,
      message_type: 'status_update',
      subject_ref: null,
      resource_refs: [],
      body: 'Effect owner for the read-only probe.',
      created_at: '2026-08-25T00:30:00.000Z',
    });
    const effect = prepareAgentRuntimeEffect({
      repo_root: repoRoot,
      message_kind: 'module_message',
      engineer_id: engineerId,
      message_id: (sent.structuredContent as { event: { message_id: string } }).event.message_id,
      idempotency_key: 'mcp-read-only-probe',
      expected_binding_id: binding.binding_id,
      expected_binding_generation: binding.binding_generation,
      expected_engineer_contract_revision: binding.engineer_contract_revision,
      expected_capability_sha256: capability.capability_sha256,
      created_at: '2026-08-25T00:32:00.000Z',
    });

    const otherEngineerId = `engineer:${otherCapability}`;
    const otherProfile = loadEngineerProfile(repoRoot, otherEngineerId);
    bindEngineer(repoRoot, {
      engineer_id: otherEngineerId,
      idempotency_key: 'bind-read-only-other',
      provider: 'codex-app-thread',
      provider_thread_id: 'thread-read-only-other',
      host_id: 'local',
      engineer_contract_revision: otherProfile.engineer_contract_revision,
      expected_current_digest: null,
      expected_binding_generation: 0,
      expected_binding_id: null,
      expected_engineer_contract_revision: otherProfile.engineer_contract_revision,
      now: () => '2026-08-25T00:33:00.000Z',
      binding_id: () => '44444444-4444-4444-8444-444444444444',
    });
    const otherBinding = readEngineerBindingStatus(repoRoot, otherEngineerId, otherProfile.engineer_contract_revision).binding!;
    const otherAuthorization = '88888888-8888-4888-8888-888888888888';
    enrollEngineerPrincipal({ repository_id: repoHarnessRepoIdFor(repoRoot), authorization_id: otherAuthorization, binding: otherBinding, env: process.env });

    const before = agentRuntimeEffectState(repoRoot);
    expect(before.length).toBeGreaterThan(0);
    const foreign = await callMcpTool(
      { ...context, engineerAuthorizationId: otherAuthorization },
      'engineer_runtime_effect_status',
      { effect_id: effect.intent.effect_id },
    );
    expect(foreign).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'engineer_principal_mismatch' } },
    });
    expect(agentRuntimeEffectState(repoRoot)).toEqual(before);
  }, 30_000);

  test('the scheduling tools carry the ME-1A protocol: principal-scoped offers, required fences, and a stale offer that never mutates Fleet', async () => {
    const { repoRoot, home, repositoryId } = schedulingFixture();
    process.env.REPO_HARNESS_HOME = home;
    const profile = loadEngineerProfile(repoRoot, engineerId);
    bindEngineer(repoRoot, {
      engineer_id: engineerId,
      idempotency_key: 'bind-scheduling',
      provider: 'codex-app-thread',
      provider_thread_id: 'thread-scheduling',
      host_id: 'local',
      engineer_contract_revision: profile.engineer_contract_revision,
      expected_current_digest: null,
      expected_binding_generation: 0,
      expected_binding_id: null,
      expected_engineer_contract_revision: profile.engineer_contract_revision,
      now: () => '2026-08-25T00:00:00.000Z',
      binding_id: () => '11111111-1111-4111-8111-111111111111',
    });
    const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
    enrollEngineerPrincipal({ repository_id: repositoryId, authorization_id: authorizationId, binding, env: process.env });
    const context = { repoRoot, policy: getMcpPolicy('engineer'), engineerAuthorizationId: authorizationId };

    const offers = await callMcpTool(context, 'engineer_offers', {});
    expect(offers.isError).toBeUndefined();
    const document = offers.structuredContent as {
      protocol: number; kind: string; repository_id: string; engineer_id: string; lane: string;
      work_graph_revision: string | null;
      offers: Array<{ work_package_id: string; engineer_id: string }>;
      exclusions: Array<{ work_package_id: string; engineer_id: string; blockers: string[] }>;
    };
    expect(document).toMatchObject({
      protocol: 1,
      kind: 'repo-harness-engineer-offers',
      repository_id: repositoryId,
      engineer_id: engineerId,
      lane: 'engineering-v2',
    });
    expect(document.work_graph_revision).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect([...document.offers, ...document.exclusions].every((item) => item.engineer_id === engineerId)).toBeTrue();
    expect(document.exclusions.find((item) => item.work_package_id === 'wp-b')?.blockers)
      .toContain('profile_capability_mismatch');
    expect(document.offers.some((item) => item.work_package_id === 'wp-b')).toBeFalse();

    const fences = {
      repo_id: repositoryId,
      engineer_id: engineerId,
      binding_id: binding.binding_id,
      binding_generation: binding.binding_generation,
      engineer_contract_revision: binding.engineer_contract_revision,
    };
    const acquireArgs = {
      ...fences,
      work_package_id: 'wp-a',
      work_package_revision: `sha256:${'1'.repeat(64)}`,
      work_graph_revision: document.work_graph_revision!,
      task_id: 'a'.repeat(64),
      task_revision: 'b'.repeat(64),
      offer_revision: `sha256:${'2'.repeat(64)}`,
      dependency_revision: `sha256:${'3'.repeat(64)}`,
      concurrency_revision: `sha256:${'4'.repeat(64)}`,
      fleet_offer_revision: `sha256:${'5'.repeat(64)}`,
      authorization_revision: 1,
    };

    const { work_package_revision: _revision, ...withoutWorkPackageRevision } = acquireArgs;
    const missingWorkPackageRevision = await callMcpTool(context, 'engineer_acquire', withoutWorkPackageRevision);
    expect(missingWorkPackageRevision).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'INVALID_ARGUMENT', message: 'work_package_revision is required' } },
    });

    const { dependency_revision: _dependency, ...withoutDependencyRevision } = acquireArgs;
    const missingDependencyRevision = await callMcpTool(context, 'engineer_acquire', withoutDependencyRevision);
    expect(missingDependencyRevision).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'INVALID_ARGUMENT', message: 'dependency_revision is required' } },
    });

    const before = coordinationState(repoRoot);
    const noNextOffer = await callMcpTool(context, 'engineer_acquire_next', {
      ...fences,
      idempotency_key: 'no-next-offer',
      capability_id: 'capability.workflow-engine.contract-assets',
      minimum_priority: 100,
      max_selection_attempts: 2,
    });
    expect(noNextOffer).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'engineer_no_eligible_offer' } },
    });
    expect(coordinationState(repoRoot).filter((path) => path.endsWith('.json'))).toEqual(before.filter((path) => path.endsWith('.json')));

    const beforeStale = coordinationState(repoRoot);
    const staleOffer = await callMcpTool(context, 'engineer_acquire', acquireArgs);
    expect(staleOffer).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'engineer_offer_stale' } },
    });
    expect(coordinationState(repoRoot)).toEqual(beforeStale);
  }, 30_000);
});
