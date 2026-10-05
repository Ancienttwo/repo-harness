import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { mcpOAuthTokenStorePath } from '../../src/cli/mcp/auth';
import { McpOAuthTokenStore } from '../../src/cli/mcp/oauth';
import { engineerSha256 } from '../../src/core/engineers/profile-binding';
import { registerRepoHarnessRepo, repoHarnessRepoIdFor, setRepoHarnessAccessMode } from '../../src/effects/repo-registry';
import { listLiveClaimActorReceiptsForEngineer } from '../../src/effects/engineers/claim-actor-store';
import { coordinationRoot, readLease } from '../../src/effects/state/coordination-lease-store';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const cli = resolve(process.cwd(), 'src/cli/index.ts');
const sourceRoot = process.cwd();
const tempRoots: string[] = [];
const engineerId = 'engineer:capability.verification.evals-checks';
const previousRepoHarnessHome = process.env.REPO_HARNESS_HOME;

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-engineer-cli-'));
  tempRoots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(join(root, '.archcontext/model'), { recursive: true });
  mkdirSync(join(root, 'agents'), { recursive: true });
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({
    agent_runtime: { mode: 'active', adapters: { 'herdr-cli-agent': { enabled: true } } },
  }));
  execFileSync('git', ['add', '.archcontext', 'agents/engineers'], { cwd: root });
  return root;
}

/**
 * A fixture whose committed work graph is valid, so `engineer offers` gets past
 * the lane gates and actually reaches the Fleet offer collector.
 */
function graphFixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-engineer-offers-')));
  tempRoots.push(root);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root });
  mkdirSync(join(root, '.archcontext/model'), { recursive: true });
  mkdirSync(join(root, '.ai/harness/sprint'), { recursive: true });
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  mkdirSync(join(root, 'plans/policies'), { recursive: true });
  mkdirSync(join(root, 'plans/rollback'), { recursive: true });
  mkdirSync(join(root, 'tasks'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  const policy = '{"policy":1}\n';
  const rollback = '{"rollback":"wp-a"}\n';
  const repositoryId = repoHarnessRepoIdFor(root);
  writeFileSync(join(root, 'plans/sprints/demo.sprint.md'), `# Sprint: demo
> **Status**: Executing
> **Backlog Schema**: 2

## Backlog

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|---|---|---|---|---|
| 1 | ${fixtureTaskId('task A')} | [ ] | task A | contract | accepted A | (pending) |

## Execution Log
`);
  writeFileSync(join(root, 'plans/sprints/demo.work-graph.v1.json'), `${JSON.stringify({
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: repositoryId,
    sprint_path: 'plans/sprints/demo.sprint.md',
    lane: 'engineering-v2',
    work_packages: [{
      work_package_id: 'wp-a',
      task_id: fixtureTaskId('task A'),
      primary_capability: 'capability.verification.evals-checks',
      depends_on: [],
      priority: 50,
      concurrency: { scope: 'repo', key: 'demo' },
      execution_surface: 'contract',
      integration_group: null,
      required_acceptance: [{
        gate: 'module', policy_id: 'module-default',
        policy_ref: 'plans/policies/module.json', policy_revision: engineerSha256(policy),
      }],
      retry_policy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'exponential', initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } as const,
    rollback_boundary: {
        kind: 'work_package', boundary_id: `${repositoryId}:wp-a`,
        boundary_ref: 'plans/rollback/wp-a.json', boundary_revision: engineerSha256(rollback),
      },
    }],
  })}\n`);
  writeFileSync(join(root, 'plans/policies/module.json'), policy);
  writeFileSync(join(root, 'plans/rollback/wp-a.json'), rollback);
  writeFileSync(join(root, 'tasks/current.md'), '# Current\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({
    worktree_strategy: { merge_back: { target: 'main' } },
    agent_runtime: { mode: 'active', adapters: { 'herdr-cli-agent': { enabled: true } } },
  }));
  writeFileSync(join(root, '.ai/harness/sprint/active-sprint'), 'plans/sprints/demo.sprint.md\n');
  const sprintPath = 'plans/sprints/demo.sprint.md';
  const task = 'task A';
  const planPath = 'plans/plan-20260823-0202-cli-acquire.md';
  const contractPath = 'tasks/contracts/20260823-0202-cli-acquire.contract.md';
  for (const directory of ['tasks/contracts', 'tasks/reviews', 'tasks/notes', 'src', '.claude/templates']) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  cpSync(join(sourceRoot, '.claude/templates/contract.template.md'), join(root, '.claude/templates/contract.template.md'));
  writeFileSync(join(root, planPath), [
    '# Plan: CLI Fleet Acquire Fixture',
    '',
    '> **Status**: Approved',
    '> **Source Ref**: sprint:' + sprintPath + '#' + task,
    '> **Artifact Level**: work-package',
    '> **Promotion Reason**: verification_boundary',
    '> **Verification Boundary**: CLI acquisition proves bound worktree output.',
    '> **Rollback Surface**: Remove the fixture worktree and lease.',
    '> **Task Contract**: ' + contractPath,
    '> **Task Review**: tasks/reviews/20260823-0202-cli-acquire.review.md',
    '> **Implementation Notes**: tasks/notes/20260823-0202-cli-acquire.notes.md',
    '',
    '## Promotion Gate',
    '',
    '- **Merge/PR unit**: One fixture acquisition is independently verifiable.',
    '- **Rollback surface**: Remove the fixture worktree and lease.',
    '- **Verification boundary**: Fleet acquire CLI output and token readback.',
    '- **Review/acceptance boundary**: The test asserts the returned envelope.',
    '- **High-risk surface**: Shared lease election and fresh worktree creation.',
    '- **Why not checklist row**: The acquisition transaction crosses persistent authorities.',
    '',
    '## Evidence Contract',
    '',
    '- **State/progress path**: ' + planPath,
    '- **Verification evidence**: CLI JSON output and worktree token.',
    '- **Evaluator rubric**: This test assertion.',
    '- **Stop condition**: A bound envelope is returned.',
    '- **Rollback surface**: Remove the fixture worktree and lease.',
    '',
  ].join('\n'));
  writeFileSync(join(root, contractPath), [
    '# Task Contract: CLI Fleet Acquire Fixture',
    '',
    '> **Plan**: ' + planPath,
    '> **Task Profile**: code-change',
    '> **Status**: Active',
    '> **Review File**: tasks/reviews/20260823-0202-cli-acquire.review.md',
    '',
    '## Goal', '', 'Keep the authored acquisition contract unchanged.', '',
    '## Why', '', 'Dispatch must use the same authority admitted by the plan proof.', '',
    '## Scope', '', '- In scope: src fixture changes.', '- Out of scope: unrelated files.', '',
    '## Exit Criteria', '', '```yaml', 'exit_criteria:', '  files_exist:', '    - src/index.ts', '```', '',
    '## Allowed Paths',
    '',
    '```yaml',
    'allowed_paths:',
    '  - src/',
    '```',
    '',
    '## Evidence Requirements', '```yaml', 'evidence_requirements:', '  benchmark: not_applicable', '```', '',
    '## Change Assessment', '```json', '{"protocol":1,"oracles":[{"id":"business","kind":"deterministic_test","paths":["*"]}]}', '```', '',
    '## Verification Plan',
    '',
    '```json',
    JSON.stringify({ protocol: 1, checks: [{ id: 'business', kind: 'command', command: 'printf passed > .ai/harness/business-command-ran', cwd: '.', phase: 'verification', cost: 'normal', evidence_policy: 'current_exact', necessity: 'Business-only edits reach canonical execution after acquire.', inputs: { env: [] } }] }),
    '```',
    '',
  ].join('\n'));
  writeFileSync(join(root, 'tasks/reviews/20260823-0202-cli-acquire.review.md'), '# Authored review\n');
  writeFileSync(join(root, 'tasks/notes/20260823-0202-cli-acquire.notes.md'), '# Authored notes\n');
  writeFileSync(join(root, 'tasks/todos.md'), '# Deferred goals\n');
  writeFileSync(join(root, 'src/index.ts'), 'export const business = false;\n');

  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  return root;
}

function run(root: string, args: string[]): { readonly exitCode: number; readonly stdout: string; readonly stderr: string } {
  const result = Bun.spawnSync([process.execPath, cli, ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe', env: { ...process.env } });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

afterEach(() => {
  if (previousRepoHarnessHome === undefined) delete process.env.REPO_HARNESS_HOME;
  else process.env.REPO_HARNESS_HOME = previousRepoHarnessHome;
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe('repo-harness engineer CLI', () => {
  test('projects the read-only Engineering Overlay and Organization Attention board', () => {
    const root = fixture();
    const registryHome = mkdtempSync(join(tmpdir(), 'repo-harness-engineer-board-home-'));
    tempRoots.push(registryHome);
    process.env.REPO_HARNESS_HOME = registryHome;
    mkdirSync(join(root, 'tasks'), { recursive: true });
    writeFileSync(join(root, 'tasks/current.md'), '# Current\n');
    registerRepoHarnessRepo(root, 'manual', { env: process.env, requireAdopted: false });

    const rendered = run(root, ['engineer', 'board', '--format', 'json']);
    expect({ exitCode: rendered.exitCode, stderr: rendered.stderr }).toEqual({ exitCode: 0, stderr: '' });
    const board = JSON.parse(rendered.stdout) as {
      overlay: { snapshot_consistency: string; engineers: Array<{ binding: { state: string } }> };
      organization_attention: { attention: Array<{ reason: string }> };
    };
    expect(board.overlay.snapshot_consistency).toBe('stable');
    expect(board.overlay.engineers).toHaveLength(2);
    expect(board.overlay.engineers.every((item) => item.binding.state === 'unbound')).toBeTrue();
    expect(board.organization_attention.attention.filter((item) => item.reason === 'binding_missing')).toHaveLength(2);

    const text = run(root, ['engineer', 'board', '--format', 'text']);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain('consistency: stable');
    expect(run(root, ['engineer', 'board', '--format', 'yaml']).exitCode).toBe(1);
  });

  test('lists and shows capability-backed tracked Profiles', () => {
    const root = fixture();
    const listed = run(root, ['engineer', 'profile', 'list', '--json']);
    expect(listed.exitCode).toBe(0);
    const profiles = JSON.parse(listed.stdout) as Array<{ engineer_id: string; engineer_contract_revision: string }>;
    expect(profiles).toHaveLength(2);
    expect(profiles[0].engineer_id).toBe(engineerId);
    expect(profiles[0].engineer_contract_revision).toMatch(/^sha256:[0-9a-f]{64}$/u);

    const shown = run(root, ['engineer', 'profile', 'show', '--engineer-id', engineerId, '--json']);
    expect(shown.exitCode).toBe(0);
    const result = JSON.parse(shown.stdout) as { profile: { capability_id: string }; capability: { prefixes: string[] } };
    expect(result.profile.capability_id).toBe('capability.verification.evals-checks');
    expect(result.capability.prefixes).toContain('tests');
  });

  test('reports argument validation failures without reusing a protocol domain error code', () => {
    const root = fixture();
    const profiles = JSON.parse(run(root, ['engineer', 'profile', 'list', '--json']).stdout) as Array<{
      engineer_id: string;
      engineer_contract_revision: string;
    }>;
    const revision = profiles.find((item) => item.engineer_id === engineerId)!.engineer_contract_revision;
    const invalid = run(root, [
      'engineer', 'binding', 'bind', '--engineer-id', engineerId,
      '--idempotency-key', 'cli-bind-invalid', '--provider', 'codex',
      '--provider-thread-id', 'thread-cli', '--host-id', 'local',
      '--expected-current-digest', 'null', '--expected-binding-generation', 'abc',
      '--expected-binding-id', 'null', '--expected-engineer-contract-revision', revision,
      '--json',
    ]);
    expect(invalid.exitCode).toBe(1);
    const failure = JSON.parse(invalid.stderr) as { ok: boolean; error: string; message: string };
    expect(failure.ok).toBeFalse();
    expect(failure.error).toBe('invalid_argument');
    expect(failure.message).toContain('--expected-binding-generation');
  });

  test('binds, reports status, retries, retires, and renders a bounded read-only capsule', () => {
    const root = fixture();
    const profiles = JSON.parse(run(root, ['engineer', 'profile', 'list', '--json']).stdout) as Array<{
      engineer_id: string;
      engineer_contract_revision: string;
    }>;
    const revision = profiles.find((item) => item.engineer_id === engineerId)!.engineer_contract_revision;
    const bindArgs = [
      'engineer', 'binding', 'bind', '--engineer-id', engineerId,
      '--idempotency-key', 'cli-bind-1', '--provider', 'herdr-cli-agent',
      '--provider-thread-id', 'thread-cli', '--host-id', 'local',
      '--expected-current-digest', 'null', '--expected-binding-generation', '0',
      '--expected-binding-id', 'null', '--expected-engineer-contract-revision', revision,
      '--json',
    ];
    const first = run(root, bindArgs);
    expect(first.exitCode).toBe(0);
    const active = JSON.parse(first.stdout) as {
      state: string;
      current_digest: string;
      current_binding_id: string;
      binding_generation: number;
    };
    expect(active.state).toBe('active');
    expect(run(root, bindArgs).stdout).toBe(first.stdout);

    const status = run(root, ['engineer', 'binding', 'status', '--engineer-id', engineerId, '--json']);
    expect(status.exitCode).toBe(0);
    expect(JSON.parse(status.stdout).current.current_digest).toBe(active.current_digest);

    const sent = run(root, [
      'engineer', 'message', 'send',
      '--message-id', '33333333-3333-4333-8333-333333333333',
      '--capability-id', 'capability.verification.evals-checks',
      '--target-engineer-id', engineerId,
      '--scope', 'assignment',
      '--target-binding-id', active.current_binding_id,
      '--target-binding-generation', String(active.binding_generation),
      '--target-engineer-contract-revision', revision,
      '--message-type', 'work_request',
      '--subject-ref-json', 'null',
      '--resource-refs-json', '[]',
      '--sender-kind', 'program_orchestrator',
      '--sender-principal', 'human:cli-test',
      '--body', 'CLI durable message',
      '--created-at', '2026-08-25T00:30:00.000Z',
      '--json',
    ]);
    expect(sent.exitCode).toBe(0);
    const sentMessage = JSON.parse(sent.stdout) as {
      event: { event_digest: string; sender: { kind: string; principal_ref: string } };
      receipt: { delivery_state: string };
    };
    expect(sentMessage).toMatchObject({
      event: { sender: { kind: 'program_orchestrator', principal_ref: 'human:cli-test' } },
      receipt: { delivery_state: 'pending' },
    });

    const observedCapability = run(root, [
      'engineer', 'runtime-effect', 'capability',
      '--adapter-kind', 'herdr-cli-agent',
      '--host-id', 'local',
      '--operations-json', JSON.stringify({ notify_inbox: 'supported', wake_for_offer: 'supported' }),
      '--evidence-refs-json', JSON.stringify([{ ref: 'canary', sha256: `sha256:${'a'.repeat(64)}` }]),
      '--observed-at', '2026-08-25T00:31:00.000Z',
      '--json',
    ]);
    expect(observedCapability.exitCode).toBe(0);
    const capability = JSON.parse(observedCapability.stdout) as { capability_sha256: string };
    const preparedEffect = run(root, [
      'engineer', 'runtime-effect', 'prepare-module',
      '--engineer-id', engineerId,
      '--message-id', '33333333-3333-4333-8333-333333333333',
      '--idempotency-key', 'cli-effect-1',
      '--expected-binding-id', active.current_binding_id,
      '--expected-binding-generation', String(active.binding_generation),
      '--expected-engineer-contract-revision', revision,
      '--expected-capability-sha256', capability.capability_sha256,
      '--created-at', '2026-08-25T00:32:00.000Z',
      '--json',
    ]);
    expect(preparedEffect.exitCode, preparedEffect.stderr).toBe(0);
    const effect = JSON.parse(preparedEffect.stdout) as { intent: { effect_id: string }; current: { state: string } };
    expect(effect.current.state).toBe('intent_persisted');
    const startedEffect = run(root, [
      'engineer', 'runtime-effect', 'start',
      '--effect-id', effect.intent.effect_id,
      '--started-at', '2026-08-25T00:33:00.000Z',
      '--json',
    ]);
    expect(JSON.parse(startedEffect.stdout)).toMatchObject({ current: { state: 'effect_started' }, action: { operation: 'notify_inbox' } });
    const duplicateStart = run(root, [
      'engineer', 'runtime-effect', 'start',
      '--effect-id', effect.intent.effect_id,
      '--started-at', '2026-08-25T00:34:00.000Z',
      '--json',
    ]);
    expect(JSON.parse(duplicateStart.stdout)).toMatchObject({ current: { state: 'reconciliation_required' }, action: null });
    const effectStatus = run(root, [
      'engineer', 'runtime-effect', 'status', '--effect-id', effect.intent.effect_id, '--json',
    ]);
    expect(JSON.parse(effectStatus.stdout)).toMatchObject({
      intent: { message_ref: { message_event_digest: sentMessage.event.event_digest } },
      current: { state: 'reconciliation_required' },
    });

    const capsuleResult = run(root, ['engineer', 'bootstrap-prompt', '--engineer-id', engineerId, '--json']);
    expect(capsuleResult.exitCode).toBe(0);
    const capsule = JSON.parse(capsuleResult.stdout) as { prompt: string; estimated_tokens: number };
    expect(capsule.estimated_tokens).toBeLessThanOrEqual(400);
    expect(capsule.prompt).toContain('authority=read-only bootstrap');
    expect(capsule.prompt).not.toContain('claim_id=');
    expect(capsule.prompt).not.toContain('lease_generation=');
    expect(capsule.prompt).not.toContain('bearer');

    appendFileSync(join(root, 'agents/engineers/sops/verification-evals-checks.md'), '\nContract revision change.\n');
    const staleCapsule = run(root, ['engineer', 'bootstrap-prompt', '--engineer-id', engineerId, '--json']);
    expect(staleCapsule.exitCode).toBe(1);
    expect(staleCapsule.stderr).toContain('binding current Engineer contract revision is stale');

    const retired = run(root, [
      'engineer', 'binding', 'retire', '--engineer-id', engineerId,
      '--idempotency-key', 'cli-retire-1', '--expected-current-digest', active.current_digest,
      '--expected-binding-generation', String(active.binding_generation),
      '--expected-binding-id', active.current_binding_id,
      '--expected-engineer-contract-revision', revision, '--json',
    ]);
    expect(retired.exitCode).toBe(0);
    expect(JSON.parse(retired.stdout).state).toBe('retired');
  });

  test('exposes operator principal mapping and the bounded acquire-next route', () => {
    const root = fixture();
    const help = run(root, ['engineer', '--help']);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('local Human-operator binding transitions');
    expect(help.stdout).not.toContain('session-bind');
    expect(help.stdout).toContain('principal');
    expect(help.stdout).toContain('offers');
    expect(help.stdout).toContain('prepare');
    const prepareHelp = run(root, ['engineer', 'prepare', '--help']);
    expect(prepareHelp.exitCode).toBe(0);
    expect(prepareHelp.stdout).toContain('--authorization-id');
    expect(prepareHelp.stdout).not.toContain('--observed-at');
    expect(help.stdout).toContain('message');
    expect(help.stdout).toContain('runtime-effect');
    expect(help.stdout).not.toContain('claim');
    expect(help.stdout).toContain('acquire-next');
    const offersHelp = run(root, ['engineer', 'offers', '--help']);
    expect(offersHelp.exitCode).toBe(0);
    expect(offersHelp.stdout).toContain('--authorization-id');
    expect(offersHelp.stdout).not.toContain('acquire');
    const principalHelp = run(root, ['engineer', 'principal', '--help']);
    expect(principalHelp.stdout).toContain('list');
    expect(principalHelp.stdout).toContain('enroll');
    expect(principalHelp.stdout).toContain('revoke');
    expect(principalHelp.stdout).toContain('status');
    expect(principalHelp.stdout).not.toContain('acquire');
  });

  test('acquires only the selected trusted offer and rejects incomplete or conflicting requests', () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-engineer-selected-home-')));
    tempRoots.push(home);
    process.env.REPO_HARNESS_HOME = home;
    const root = graphFixture();
    setRepoHarnessAccessMode(root, 'read_write', { env: process.env, requireAdopted: false });

    const profiles = JSON.parse(run(root, ['engineer', 'profile', 'list', '--json']).stdout) as Array<{
      engineer_id: string;
      engineer_contract_revision: string;
    }>;
    const revision = profiles.find((item) => item.engineer_id === engineerId)!.engineer_contract_revision;
    const bound = run(root, [
      'engineer', 'binding', 'bind', '--engineer-id', engineerId,
      '--idempotency-key', 'selected-bind-1', '--provider', 'codex',
      '--provider-thread-id', 'thread-offers', '--host-id', 'local',
      '--expected-current-digest', 'null', '--expected-binding-generation', '0',
      '--expected-binding-id', 'null', '--expected-engineer-contract-revision', revision, '--json',
    ]);
    expect(bound.exitCode).toBe(0);
    const current = JSON.parse(bound.stdout) as { current_binding_id: string; binding_generation: number };
    const authorizationId = '44444444-4444-4444-8444-444444444444';
    const tokenStore = new McpOAuthTokenStore(mcpOAuthTokenStorePath());
    tokenStore.setAccessToken('offers-bearer', {
      token: 'offers-bearer',
      clientId: 'client-engineer-offers-test',
      scopes: ['repo-harness', 'repo-harness.engineer', 'offline_access'],
      profile: 'engineer',
      authorizationRevision: 1,
      authorizationId,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(run(root, [
      'engineer', 'principal', 'enroll', '--authorization-id', authorizationId,
      '--engineer-id', engineerId,
      '--expected-binding-id', current.current_binding_id,
      '--expected-binding-generation', String(current.binding_generation),
      '--expected-engineer-contract-revision', revision, '--json',
    ]).exitCode).toBe(0);

    const prepared = run(root, ['engineer', 'prepare', '--authorization-id', authorizationId, '--json']);
    expect(prepared.exitCode, prepared.stderr).toBe(0);
    const observation = JSON.parse(prepared.stdout);
    expect(observation.offers.offers).toHaveLength(1);
    const offer = observation.offers.offers[0];
    const assertion = Object.fromEntries([
      'offer_revision', 'work_package_id', 'work_package_revision', 'work_graph_revision',
      'task_id', 'task_revision', 'dependency_revision', 'concurrency_revision',
      'binding_id', 'binding_generation', 'engineer_contract_revision',
      'fleet_offer_revision', 'authorization_revision',
    ].map(key => [key, offer[key]]));
    const assertionFile = join(root, 'selected-assertion.json');
    writeFileSync(assertionFile, JSON.stringify(assertion));
    const args = [
      'engineer', 'acquire', '--authorization-id', authorizationId,
      '--idempotency-key', 'selected-key', '--observation-ref', observation.observation_ref,
      '--assertion-file', assertionFile, '--session-id', 'cli-selected-session', '--json',
    ];
    for (const flag of ['--authorization-id', '--idempotency-key', '--observation-ref', '--assertion-file']) {
      const missing = [...args];
      missing.splice(missing.indexOf(flag), 2);
      expect(run(root, missing).exitCode).toBe(1);
    }
    writeFileSync(assertionFile, '{invalid');
    const malformed = run(root, args);
    expect(malformed.exitCode).toBe(1);
    expect(JSON.parse(malformed.stderr).error).toBe('invalid_argument');
    for (const value of [null, {}, { ...assertion, unexpected: true }, { ...assertion, binding_generation: '1' }]) {
      writeFileSync(assertionFile, JSON.stringify(value));
      const invalidAssertion = run(root, args);
      expect(invalidAssertion.exitCode).toBe(1);
      expect(JSON.parse(invalidAssertion.stderr)).toMatchObject({ ok: false, error: 'invalid_argument' });
    }
    writeFileSync(assertionFile, JSON.stringify(assertion));
    const missingFile = [...args];
    missingFile[missingFile.indexOf('--assertion-file') + 1] = join(root, 'absent.json');
    const missingFileResult = run(root, missingFile);
    expect(missingFileResult.exitCode).toBe(1);
    expect(JSON.parse(missingFileResult.stderr).error).toBe('invalid_argument');
    const missingObservation = [...args];
    missingObservation[missingObservation.indexOf('--observation-ref') + 1] = `sha256:${'0'.repeat(64)}`;
    const missingResult = run(root, missingObservation);
    expect(missingResult.exitCode).toBe(1);
    expect(JSON.parse(missingResult.stderr).error).toBe('engineer_observation_missing');
    const invalidObservation = [...args];
    invalidObservation[invalidObservation.indexOf('--observation-ref') + 1] = 'invalid';
    const invalidRef = run(root, invalidObservation);
    expect(invalidRef.exitCode).toBe(1);
    expect(JSON.parse(invalidRef.stderr)).toMatchObject({ ok: false, error: 'invalid_argument' });
    for (const [flag, value] of [
      ['--idempotency-key', ''], ['--idempotency-key', 'k'.repeat(513)],
      ['--session-id', ''], ['--session-id', '   '], ['--session-id', 's'.repeat(513)],
    ]) {
      const invalidArgs = [...args];
      invalidArgs[invalidArgs.indexOf(flag!) + 1] = value!;
      const invalidInput = run(root, invalidArgs);
      expect(invalidInput.exitCode).toBe(1);
      expect(JSON.parse(invalidInput.stderr)).toMatchObject({ ok: false, error: 'invalid_argument' });
    }
    writeFileSync(assertionFile, JSON.stringify({ ...assertion, work_package_id: 'wp-absent' }));
    const nonmatchingArgs = [...args];
    nonmatchingArgs[nonmatchingArgs.indexOf('--idempotency-key') + 1] = 'nonmatching-key';
    const nonmatching = run(root, nonmatchingArgs);
    expect(nonmatching.exitCode).toBe(1);
    expect(JSON.parse(nonmatching.stdout)).toMatchObject({ ok: false, error: 'engineer_offer_stale' });
    const afterRefusals = run(root, ['engineer', 'offers', '--authorization-id', authorizationId, '--json']);
    expect(afterRefusals.exitCode, afterRefusals.stderr).toBe(0);
    expect(JSON.parse(afterRefusals.stdout).offers.map((item: { work_package_id: string }) => item.work_package_id)).toEqual(['wp-a']);

    expect(readLease(root, fixtureTaskId('task A')).record).toBeNull();
    expect(listLiveClaimActorReceiptsForEngineer(root, engineerId)).toHaveLength(0);
    writeFileSync(assertionFile, JSON.stringify(assertion));
    const selected = run(root, args);
    if (selected.exitCode === 0) tempRoots.push(JSON.parse(selected.stdout).envelope.worktree_path);
    expect(selected.exitCode, selected.stderr).toBe(0);
    expect(JSON.parse(selected.stdout)).toMatchObject({ ok: true, offer: { work_package_id: 'wp-a' } });
    expect(JSON.parse(selected.stdout).receipt.session_id).toBe('cli-selected-session');
    const replay = run(root, args);
    expect(replay.exitCode, replay.stderr).toBe(0);
    expect(JSON.parse(replay.stdout)).toEqual(JSON.parse(selected.stdout));
    expect(listLiveClaimActorReceiptsForEngineer(root, engineerId)).toHaveLength(1);
    writeFileSync(assertionFile, JSON.stringify({ ...assertion, task_revision: 'f'.repeat(64) }));
    const conflict = run(root, args);
    expect(conflict.exitCode).toBe(1);
    expect(JSON.parse(conflict.stdout)).toMatchObject({ ok: false, error: 'engineer_acquire_next_conflict' });
    const afterClaim = run(root, ['engineer', 'offers', '--authorization-id', authorizationId, '--json']);
    expect(JSON.parse(afterClaim.stdout).offers).toHaveLength(0);
  });

  test('offers report the Fleet domain error code when the coordination surface is unreadable', () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-engineer-offers-home-')));
    tempRoots.push(home);
    process.env.REPO_HARNESS_HOME = home;
    const root = graphFixture();
    setRepoHarnessAccessMode(root, 'read_write', { env: process.env, requireAdopted: false });

    const profiles = JSON.parse(run(root, ['engineer', 'profile', 'list', '--json']).stdout) as Array<{
      engineer_id: string;
      engineer_contract_revision: string;
    }>;
    const revision = profiles.find((item) => item.engineer_id === engineerId)!.engineer_contract_revision;
    const bound = run(root, [
      'engineer', 'binding', 'bind', '--engineer-id', engineerId,
      '--idempotency-key', 'offers-bind-1', '--provider', 'codex',
      '--provider-thread-id', 'thread-offers', '--host-id', 'local',
      '--expected-current-digest', 'null', '--expected-binding-generation', '0',
      '--expected-binding-id', 'null', '--expected-engineer-contract-revision', revision, '--json',
    ]);
    expect(bound.exitCode).toBe(0);
    const current = JSON.parse(bound.stdout) as { current_binding_id: string; binding_generation: number };
    const authorizationId = '44444444-4444-4444-8444-444444444444';
    const tokenStore = new McpOAuthTokenStore(mcpOAuthTokenStorePath());
    tokenStore.setAccessToken('offers-bearer', {
      token: 'offers-bearer',
      clientId: 'client-engineer-offers-test',
      scopes: ['repo-harness', 'repo-harness.engineer', 'offline_access'],
      profile: 'engineer',
      authorizationRevision: 1,
      authorizationId,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(run(root, [
      'engineer', 'principal', 'enroll', '--authorization-id', authorizationId,
      '--engineer-id', engineerId,
      '--expected-binding-id', current.current_binding_id,
      '--expected-binding-generation', String(current.binding_generation),
      '--expected-engineer-contract-revision', revision, '--json',
    ]).exitCode).toBe(0);

    const prepared = run(root, ['engineer', 'prepare', '--authorization-id', authorizationId, '--json']);
    expect(prepared.exitCode).toBe(0);
    const observation = JSON.parse(prepared.stdout);
    expect(observation.observation_ref).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(observation.observation.expires_at_ms - observation.observation.observed_at_ms).toBe(30_000);
    expect(JSON.parse(observation.observation.snapshot_bytes)).toEqual(observation.offers);
    expect(run(root, ['engineer', 'prepare', '--authorization-id', authorizationId, '--observed-at-ms', '9999999999999']).exitCode).toBe(1);

    // The committed work graph stays readable, so the lane gates pass and the
    // failure lands inside collectFleetOffers: a regular file where the lease
    // directories belong makes every lease read fail with ENOTDIR.
    const leases = join(coordinationRoot(root), 'leases');
    mkdirSync(join(coordinationRoot(root)), { recursive: true });
    writeFileSync(leases, 'not-a-directory\n');

    const offers = run(root, ['engineer', 'offers', '--authorization-id', authorizationId, '--json']);
    expect(offers.exitCode).toBe(1);
    const failure = JSON.parse(offers.stderr) as { ok: boolean; error: string };
    expect(failure.ok).toBeFalse();
    // `canonical_unavailable` and `repo_unavailable` are the two FleetOffersError
    // codes; either one reaching the caller means the class is on the whitelist.
    expect(failure.error).toBe('canonical_unavailable');
    expect(failure.error).not.toBe('internal_error');
  });

  test('lists, enrolls, reads, and revokes an issued Engineer authorization without exposing bearer tokens', () => {
    const root = fixture();
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-engineer-cli-home-')));
    tempRoots.push(home);
    process.env.REPO_HARNESS_HOME = home;
    const profiles = JSON.parse(run(root, ['engineer', 'profile', 'list', '--json']).stdout) as Array<{
      engineer_id: string;
      engineer_contract_revision: string;
    }>;
    const revision = profiles.find((item) => item.engineer_id === engineerId)!.engineer_contract_revision;
    const bound = run(root, [
      'engineer', 'binding', 'bind', '--engineer-id', engineerId,
      '--idempotency-key', 'principal-bind-1', '--provider', 'codex',
      '--provider-thread-id', 'thread-principal', '--host-id', 'local',
      '--expected-current-digest', 'null', '--expected-binding-generation', '0',
      '--expected-binding-id', 'null', '--expected-engineer-contract-revision', revision, '--json',
    ]);
    expect(bound.exitCode).toBe(0);
    const current = JSON.parse(bound.stdout) as { current_binding_id: string; binding_generation: number };
    const authorizationId = '22222222-2222-4222-8222-222222222222';
    const bearer = 'must-never-appear-in-operator-output';
    const tokenStore = new McpOAuthTokenStore(mcpOAuthTokenStorePath());
    tokenStore.setAccessToken(bearer, {
      token: bearer,
      clientId: 'client-engineer-cli-test',
      scopes: ['repo-harness', 'repo-harness.engineer', 'offline_access'],
      profile: 'engineer',
      authorizationRevision: 1,
      authorizationId,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    const listed = run(root, ['engineer', 'principal', 'list', '--json']);
    expect(listed.exitCode).toBe(0);
    expect(listed.stdout).toContain(authorizationId);
    expect(listed.stdout).toContain('"mapping": null');
    expect(listed.stdout).not.toContain(bearer);
    const enrolled = run(root, [
      'engineer', 'principal', 'enroll', '--authorization-id', authorizationId,
      '--engineer-id', engineerId,
      '--expected-binding-id', current.current_binding_id,
      '--expected-binding-generation', String(current.binding_generation),
      '--expected-engineer-contract-revision', revision, '--json',
    ]);
    expect(enrolled.exitCode).toBe(0);
    expect(JSON.parse(enrolled.stdout)).toMatchObject({ authorization_id: authorizationId, state: 'active', engineer_id: engineerId });
    expect(enrolled.stdout).not.toContain(bearer);
    const status = run(root, ['engineer', 'principal', 'status', '--authorization-id', authorizationId, '--json']);
    expect(JSON.parse(status.stdout)).toMatchObject({ mapping: { state: 'active', binding_id: current.current_binding_id } });
    const revoked = run(root, ['engineer', 'principal', 'revoke', '--authorization-id', authorizationId, '--json']);
    expect(JSON.parse(revoked.stdout)).toMatchObject({ state: 'revoked', authorization_id: authorizationId });
  });
});
