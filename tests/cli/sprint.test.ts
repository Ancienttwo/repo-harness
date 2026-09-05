import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { engineerSha256 } from '../../src/core/engineers/profile-binding';
import { registerRepoHarnessRepo, repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const cli = resolve(process.cwd(), 'src/cli/index.ts');
const sourceRoot = process.cwd();
const roots: string[] = [];
const previousRepoHarnessHome = process.env.REPO_HARNESS_HOME;
const sprintPath = 'plans/sprints/demo.sprint.md';

function fixture(): { readonly root: string; readonly home: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-sprint-graph-cli-')));
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-sprint-graph-home-')));
  roots.push(root, home);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root });
  mkdirSync(join(root, '.archcontext/model'), { recursive: true });
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  mkdirSync(join(root, 'plans/policies'), { recursive: true });
  mkdirSync(join(root, 'plans/rollback'), { recursive: true });
  mkdirSync(join(root, 'tasks'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  const sprint = `# Sprint: demo
> **Status**: Executing
> **Backlog Schema**: 2

## Backlog

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|---|---|---|---|---|
| 1 | ${fixtureTaskId('task A')} | [ ] | task A | contract | accepted A | (pending) |

## Execution Log
`;
  const policy = '{"policy":1}\n';
  const rollback = '{"rollback":"wp-a"}\n';
  const repositoryId = repoHarnessRepoIdFor(root);
  const graph = {
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: repositoryId,
    sprint_path: sprintPath,
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
      required_acceptance: [{ gate: 'module', policy_id: 'module-default', policy_ref: 'plans/policies/module.json', policy_revision: engineerSha256(policy) }],
      retry_policy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'exponential', initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } as const,
    rollback_boundary: { kind: 'work_package', boundary_id: `${repositoryId}:wp-a`, boundary_ref: 'plans/rollback/wp-a.json', boundary_revision: engineerSha256(rollback) },
    }],
  };
  writeFileSync(join(root, sprintPath), sprint);
  writeFileSync(join(root, 'plans/sprints/demo.work-graph.v1.json'), `${JSON.stringify(graph)}\n`);
  writeFileSync(join(root, 'plans/policies/module.json'), policy);
  writeFileSync(join(root, 'plans/rollback/wp-a.json'), rollback);
  writeFileSync(join(root, 'tasks/current.md'), '# Current\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ worktree_strategy: { merge_back: { target: 'main' } } }));
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  process.env.REPO_HARNESS_HOME = home;
  registerRepoHarnessRepo(root, 'manual', { env: process.env, requireAdopted: false });
  return { root, home };
}

function run(root: string, args: string[]) {
  const result = Bun.spawnSync([process.execPath, cli, ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe', env: { ...process.env } });
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

afterEach(() => {
  if (previousRepoHarnessHome === undefined) delete process.env.REPO_HARNESS_HOME;
  else process.env.REPO_HARNESS_HOME = previousRepoHarnessHome;
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('repo-harness sprint graph CLI', () => {
  test('projects the exact canonical ME-1A graph as a read-only independent view', () => {
    const { root, home } = fixture();
    const before = execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, encoding: 'utf8' });
    const rendered = run(root, ['sprint', 'graph', '--sprint', sprintPath, '--format', 'json']);
    expect(rendered.exitCode).toBe(0);
    const graph = JSON.parse(rendered.stdout) as { lane: string; graph: { work_graph_revision: string; work_packages: Array<{ work_package_id: string; primary_capability: string }> } };
    expect(graph.lane).toBe('engineering-v2');
    expect(graph.graph.work_graph_revision).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(graph.graph.work_packages).toEqual([expect.objectContaining({ work_package_id: 'wp-a', primary_capability: 'capability.verification.evals-checks' })]);
    expect(run(root, ['sprint', 'graph', '--sprint', sprintPath, '--format', 'text']).stdout).toContain('wp-a task=');
    expect(run(root, ['sprint', 'graph', '--sprint', sprintPath, '--format', 'yaml']).exitCode).toBe(1);
    writeFileSync(join(home, 'registered-repos.json'), '{malformed');
    const unreadable = run(root, ['sprint', 'graph', '--sprint', sprintPath, '--format', 'json']);
    expect(unreadable.exitCode).toBe(1);
    expect(unreadable.stderr).toContain('registry authority is not valid JSON');
    expect(execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, encoding: 'utf8' })).toBe(before);
  });

  test('reports layered machine error codes instead of flattening every failure to work_graph_invalid', () => {
    const { root, home } = fixture();

    const badFormat = run(root, ['sprint', 'graph', '--sprint', sprintPath, '--format', 'yaml']);
    expect(badFormat.exitCode).toBe(1);
    expect(JSON.parse(badFormat.stderr)).toMatchObject({ ok: false, error: 'invalid_argument' });

    const missingSprint = run(root, ['sprint', 'graph', '--sprint', 'plans/sprints/absent.sprint.md', '--format', 'json']);
    expect(missingSprint.exitCode).toBe(1);
    expect(JSON.parse(missingSprint.stderr)).toMatchObject({ ok: false, error: 'work_graph_unclassified' });

    writeFileSync(join(home, 'registered-repos.json'), '{malformed');
    const unreadableRegistry = run(root, ['sprint', 'graph', '--sprint', sprintPath, '--format', 'json']);
    expect(unreadableRegistry.exitCode).toBe(1);
    expect(JSON.parse(unreadableRegistry.stderr)).toMatchObject({ ok: false, error: 'fleet_registry_invalid' });
  });

  test('a carrier naming an unresolvable primary_capability reports a domain code', () => {
    const { root } = fixture();
    const carrier = join(root, 'plans/sprints/demo.work-graph.v1.json');
    const graph = JSON.parse(readFileSync(carrier, 'utf8')) as {
      work_packages: Array<{ primary_capability: string }>;
    };
    // Well-formed capability_id that no capability node declares, so the carrier
    // passes work-graph shape validation and fails at capability resolution.
    graph.work_packages[0]!.primary_capability = 'capability.absent.not-a-capability';
    writeFileSync(carrier, `${JSON.stringify(graph)}\n`);
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'unresolvable capability'], { cwd: root });

    const projected = run(root, ['sprint', 'graph', '--sprint', sprintPath, '--format', 'json']);
    expect(projected.exitCode).toBe(1);
    const failure = JSON.parse(projected.stderr) as { ok: boolean; error: string };
    expect(failure.ok).toBeFalse();
    expect(failure.error).toBe('work_graph_invalid');
  });
});
