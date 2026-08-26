import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { buildMcpToolDefinitions, callMcpTool } from '../../src/cli/mcp/tools';
import { bindEngineer, readEngineerBindingStatus, retireEngineer } from '../../src/effects/engineers/binding-store';
import { enrollEngineerPrincipal, revokeEngineerPrincipal } from '../../src/effects/engineers/principal-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import {
  prepareProviderThreadEffect,
  recordProviderThreadCapability,
} from '../../src/effects/engineers/provider-thread-effect-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

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
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(repoRoot, 'agents/engineers'), { recursive: true });
  writeFileSync(join(repoRoot, 'README.md'), 'fixture\n');
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repoRoot });
  return { repoRoot, home };
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
      'engineer_messages',
      'engineer_message_send',
      'engineer_message_ack',
      'engineer_thread_effect_capability',
      'engineer_thread_effect_status',
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
      provider: 'codex',
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
      scope: 'module',
      target_binding_id: null,
      target_binding_generation: null,
      target_engineer_contract_revision: null,
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
    const capability = recordProviderThreadCapability(repoRoot, {
      host_id: 'local',
      operations: { send: 'supported', resume: 'unverifiable', observe: 'supported', stop: 'unsupported' },
      evidence_refs: [{ ref: 'canary', sha256: `sha256:${'a'.repeat(64)}` }],
      observed_at: '2026-08-25T00:31:00.000Z',
    });
    const sentEvent = (sent.structuredContent as { event: { message_id: string } }).event;
    const effect = prepareProviderThreadEffect({
      repo_root: repoRoot,
      engineer_id: engineerId,
      message_id: sentEvent.message_id,
      idempotency_key: 'mcp-read-only-effect',
      operation: 'send',
      expected_binding_id: binding.binding_id,
      expected_binding_generation: binding.binding_generation,
      expected_engineer_contract_revision: binding.engineer_contract_revision,
      expected_capability_sha256: capability.capability_sha256,
      created_at: '2026-08-25T00:32:00.000Z',
    });
    const capabilityView = await callMcpTool(context, 'engineer_thread_effect_capability', { operation: 'send' });
    expect(capabilityView).toMatchObject({
      structuredContent: { status: 'supported', capability: { capability_sha256: capability.capability_sha256 } },
    });
    const effectView = await callMcpTool(context, 'engineer_thread_effect_status', { effect_id: effect.intent.effect_id });
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
      scope: 'module',
      target_binding_id: null,
      target_binding_generation: null,
      target_engineer_contract_revision: null,
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
});
