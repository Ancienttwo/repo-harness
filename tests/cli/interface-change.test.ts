import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { buildMcpToolDefinitions, callMcpTool } from '../../src/cli/mcp/tools';
import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { enrollEngineerPrincipal } from '../../src/effects/engineers/principal-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

const sourceRoot = process.cwd();
const roots: string[] = [];
const SOURCE_CAPABILITY = 'capability.verification.evals-checks';
const TARGET_CAPABILITY = 'capability.workflow-engine.contract-assets';
const SOURCE_ENGINEER = `engineer:${SOURCE_CAPABILITY}`;
const TARGET_ENGINEER = `engineer:${TARGET_CAPABILITY}`;
const AUTHORIZATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const D = (char: string) => `sha256:${char.repeat(64)}`;

function fixture(): { repoRoot: string; home: string } {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me4b-cli-')));
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me4b-cli-home-')));
  roots.push(repoRoot, home);
  execFileSync('git', ['init', '-q'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: repoRoot });
  mkdirSync(join(repoRoot, '.archcontext/model'), { recursive: true });
  mkdirSync(join(repoRoot, 'agents'), { recursive: true });
  mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(repoRoot, 'agents/engineers'), { recursive: true });
  writeFileSync(join(repoRoot, 'plans/sprints/interface.sprint.md'), `# Sprint: interface

## Backlog

| # | Status | Task | Mode | Acceptance | Plan |
|---|---|---|---|---|---|
| 1 | [ ] | change target interface | contract | exact | (pending) |
`);
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repoRoot });
  bind(repoRoot, SOURCE_ENGINEER, '11111111-1111-4111-8111-111111111111');
  bind(repoRoot, TARGET_ENGINEER, '22222222-2222-4222-8222-222222222222');
  process.env.REPO_HARNESS_HOME = home;
  const sourceProfile = loadEngineerProfile(repoRoot, SOURCE_ENGINEER);
  const sourceBinding = readEngineerBindingStatus(repoRoot, SOURCE_ENGINEER, sourceProfile.engineer_contract_revision).binding!;
  enrollEngineerPrincipal({ repository_id: repoHarnessRepoIdFor(repoRoot), authorization_id: AUTHORIZATION, binding: sourceBinding, env: process.env });
  return { repoRoot, home };
}

function bind(root: string, engineerId: string, bindingId: string): void {
  const profile = loadEngineerProfile(root, engineerId);
  bindEngineer(root, { engineer_id: engineerId, idempotency_key: `bind-${bindingId}`, provider: 'codex', provider_thread_id: `thread-${bindingId}`, host_id: 'local', engineer_contract_revision: profile.engineer_contract_revision, expected_current_digest: null, expected_binding_generation: 0, expected_binding_id: null, expected_engineer_contract_revision: profile.engineer_contract_revision, binding_id: () => bindingId, now: () => '2026-08-26T09:00:00.000Z' });
}

function definition() {
  return {
    work_package_id: 'interface-contract-v2', task_ref: 'change target interface', primary_capability: TARGET_CAPABILITY,
    depends_on: [], priority: 80, concurrency: { scope: 'repo', key: 'interface-contract' }, execution_surface: 'contract', integration_group: null,
    required_acceptance: [{ gate: 'module', policy_id: 'interface-owner', policy_ref: 'plans/policies/interface.json', policy_revision: D('a') }],
    rollback_boundary: { kind: 'work_package', boundary_id: 'interface-contract-v2', boundary_ref: 'plans/rollback/interface.json', boundary_revision: D('b') },
  };
}

function cli(root: string, ...args: string[]) {
  return spawnSync('bun', [join(sourceRoot, 'src/cli/index.ts'), 'interface-change', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env } });
}

afterEach(() => {
  delete process.env.REPO_HARNESS_HOME;
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('ME-4B CLI and authenticated Engineer MCP boundary', () => {
  test('exposes Engineer mutation only through restricted MCP and keeps Human CLI closed', async () => {
    const { repoRoot } = fixture();
    const policy = getMcpPolicy('engineer');
    const names = buildMcpToolDefinitions(policy).map((tool) => tool.name);
    expect(names).toContain('engineer_interface_change_propose');
    expect(names).toContain('engineer_interface_change_transition');

    const help = cli(repoRoot, '--help');
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('human-transition');
    expect(help.stdout).toContain('read');
    expect(help.stdout).toContain('lookup');
    expect(help.stdout).not.toContain('propose');
    expect(help.stdout).not.toContain('authorization-id');

    const context = { repoRoot, policy, engineerAuthorizationId: AUTHORIZATION };
    const proposed = await callMcpTool(context, 'engineer_interface_change_propose', {
      request_id: REQUEST,
      source_capability_id: SOURCE_CAPABILITY,
      target_capability_id: TARGET_CAPABILITY,
      target_engineer_id: TARGET_ENGINEER,
      interface_ref: 'src/public/interface.ts#ContractV1',
      proposed_change: 'Add exact field.',
      compatibility_impact: 'Breaking change.',
      idempotency_key: 'propose',
    });
    expect(proposed.isError).toBeUndefined();
    expect(JSON.stringify(proposed.structuredContent)).not.toContain(AUTHORIZATION);
    const proposedCurrent = (proposed.structuredContent as { current: { current_digest: string } }).current;
    const submitted = await callMcpTool(context, 'engineer_interface_change_transition', {
      request_id: REQUEST,
      transition: 'submit',
      idempotency_key: 'submit',
      expected_current_digest: proposedCurrent.current_digest,
      materialization_commit: null,
      evidence_sha256: null,
    });
    expect(submitted).toMatchObject({ structuredContent: { current: { state: 'under_review' } } });

    const illegalAccept = await callMcpTool(context, 'engineer_interface_change_transition', {
      request_id: REQUEST,
      transition: 'accept',
      idempotency_key: 'accept-via-engineer',
      expected_current_digest: (submitted.structuredContent as { current: { current_digest: string } }).current.current_digest,
      materialization_commit: null,
      evidence_sha256: null,
    });
    expect(illegalAccept).toMatchObject({ isError: true, structuredContent: { error: { code: 'INVALID_ARGUMENT' } } });

    writeFileSync(join(repoRoot, 'human.json'), `${JSON.stringify({
      request_id: REQUEST,
      idempotency_key: 'human-accept',
      transition: 'accept',
      expected_current_digest: (submitted.structuredContent as { current: { current_digest: string } }).current.current_digest,
      human_principal_ref: 'human:ancienttwo',
      planning_projection: { sprint_ref: 'plans/sprints/interface.sprint.md', expected_work_graph_revision: null, proposed_work_package: definition() },
      evidence_sha256: null,
    })}\n`);
    const accepted = cli(repoRoot, 'human-transition', '--input', 'human.json');
    expect(accepted.status).toBe(0);
    expect(JSON.parse(accepted.stdout)).toMatchObject({ current: { state: 'accepted' } });
  });

  test('message prose cannot transition request state', async () => {
    const { repoRoot } = fixture();
    const policy = getMcpPolicy('engineer');
    const context = { repoRoot, policy, engineerAuthorizationId: AUTHORIZATION };
    const proposed = await callMcpTool(context, 'engineer_interface_change_propose', {
      request_id: REQUEST, source_capability_id: SOURCE_CAPABILITY, target_capability_id: TARGET_CAPABILITY,
      target_engineer_id: TARGET_ENGINEER, interface_ref: 'src/public/interface.ts#ContractV1', proposed_change: 'Add exact field.', compatibility_impact: 'Breaking change.', idempotency_key: 'propose',
    });
    const digest = (proposed.structuredContent as { current: { current_digest: string } }).current.current_digest;
    const sent = await callMcpTool(context, 'engineer_message_send', {
      message_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', capability_id: TARGET_CAPABILITY, target_engineer_id: TARGET_ENGINEER,
      scope: 'module', target_binding_id: null, target_binding_generation: null, target_engineer_contract_revision: null,
      message_type: 'subject_notification', subject_ref: { kind: 'interface_change_request', id: REQUEST, revision: digest }, resource_refs: [], body: 'accepted and integrated', created_at: '2026-08-26T09:01:00.000Z',
    });
    expect(sent.isError).toBeUndefined();
    const read = cli(repoRoot, 'read', '--request-id', REQUEST);
    expect(JSON.parse(read.stdout)).toMatchObject({ current: { state: 'proposed', current_digest: digest } });
  });

  test('classifies malformed Human CLI input separately from domain failures', () => {
    const { repoRoot } = fixture();
    writeFileSync(join(repoRoot, 'malformed.json'), '{');
    const malformed = cli(repoRoot, 'human-transition', '--input', 'malformed.json');
    expect(malformed.status).toBe(1);
    expect(JSON.parse(malformed.stderr)).toMatchObject({ ok: false, error: 'cli_argument_invalid' });

    const missing = cli(repoRoot, 'human-transition', '--input', 'missing.json');
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stderr)).toMatchObject({ ok: false, error: 'cli_argument_invalid' });
  });
});
