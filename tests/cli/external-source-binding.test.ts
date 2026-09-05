import { describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildExternalSourceCommand } from '../../src/cli/commands/external-source';
import { buildProviderIssueObservation } from '../../src/core/external-sources/issue-observation';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { writeProviderIssueObservation } from '../../src/effects/external-sources/store';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const ROOT = join(import.meta.dir, '..', '..');

function plan(sprint: string, task: string, planPath: string, contractPath: string): string {
  return [
    '# Plan: bound issue', '', '> **Status**: Approved', `> **Source Ref**: sprint:${sprint}#${task}`, '> **Artifact Level**: work-package',
    '> **Promotion Reason**: verification_boundary', '> **Verification Boundary**: CLI binding and Fleet offer readback.', '> **Rollback Surface**: Remove the fixture.',
    `> **Task Contract**: ${contractPath}`, '', '## Promotion Gate', '', '- **Merge/PR unit**: One bound task.', '- **Rollback surface**: Remove the fixture.',
    '- **Verification boundary**: CLI JSON assertions.', '- **Review/acceptance boundary**: Test assertions.', '- **High-risk surface**: Canonical identity binding.',
    '- **Why not checklist row**: Crosses the external/canonical authority boundary.', '', '## Evidence Contract', '', `- **State/progress path**: ${planPath}`,
    '- **Verification evidence**: CLI readback.', '- **Evaluator rubric**: Test assertions.', '- **Stop condition**: Binding and offer are present.', '- **Rollback surface**: Remove the fixture.', '',
  ].join('\n');
}

describe('external-source binding CLI contract', () => {
  test('requires exact source and canonical identity fences for bind', () => {
    const command = buildExternalSourceCommand();
    const bind = command.commands.find((candidate) => candidate.name() === 'bind');
    expect(bind).toBeDefined();
    expect(bind!.options.map((option) => option.long)).toEqual([
      '--repo', '--source-revision', '--sprint', '--task-id', '--target-ref', '--format',
    ]);
    expect(command.commands.find((candidate) => candidate.name() === 'bindings')).toBeDefined();
    expect(command.commands.find((candidate) => candidate.name() === 'context')).toBeDefined();
  });

  test('binds immutable evidence to a canonical task that the unchanged Fleet board offers', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'external-binding-cli-'));
    mkdirSync(join(fixture, 'repo'));
    const repo = realpathSync(join(fixture, 'repo'));
    const home = join(fixture, 'home');
    const sprint = 'plans/sprints/intake.sprint.md';
    const task = 'implement issue seven';
    const planPath = 'plans/plan-intake.md';
    const contractPath = 'tasks/contracts/intake.contract.md';
    try {
      mkdirSync(join(repo, '.ai/harness/sprint'), { recursive: true });
      mkdirSync(join(repo, 'plans/sprints'), { recursive: true });
      mkdirSync(join(repo, 'tasks/contracts'), { recursive: true });
      mkdirSync(home, { recursive: true });
      writeFileSync(join(repo, '.ai/harness/policy.json'), '{}\n');
      writeFileSync(join(repo, '.ai/harness/sprint/active-sprint'), `${sprint}\n`);
      writeFileSync(join(repo, sprint), `# Sprint\n\n> **Status**: Executing\n> **Backlog Schema**: 2\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n|---|----|---|---|---|---|---|\n| 1 | ${fixtureTaskId(task)} | [ ] | ${task} | contract | tests pass | (pending) |\n`);
      writeFileSync(join(repo, planPath), plan(sprint, task, planPath, contractPath));
      writeFileSync(join(repo, contractPath), `# Contract\n\n> **Plan**: ${planPath}\n\n## Allowed Paths\n\n\`\`\`yaml\nallowed_paths:\n  - src/\n\`\`\`\n`);
      execFileSync('git', ['init', '-b', 'main'], { cwd: repo });
      execFileSync('git', ['config', 'user.name', 'Binding Test'], { cwd: repo });
      execFileSync('git', ['config', 'user.email', 'binding@test.local'], { cwd: repo });
      execFileSync('git', ['add', '.'], { cwd: repo });
      execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repo });
      const repoId = repoHarnessRepoIdFor(repo);
      writeFileSync(join(home, 'registered-repos.json'), `${JSON.stringify({ version: 1, authorizationRevision: 9, repos: [{ id: repoId, path: repo, accessMode: 'read_write', source: 'manual', registeredAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-01T00:00:00Z' }] })}\n`);
      const observation = buildProviderIssueObservation({
        registered_repository_id: repoId, provider: 'github', provider_host: 'github.com', provider_repository_id: '101', provider_issue_id: '202', display_ref: 'acme/widgets#7',
        url: 'https://github.com/acme/widgets/issues/7', observed_at: '2026-09-01T00:00:00Z', provider_created_at: null, provider_updated_at: null, state: 'open',
        title: 'issue', body: 'untrusted request', labels: ['ready'], assignees: [], comments_policy: 'omitted', policy_revision: `sha256:${'a'.repeat(64)}`, eligible: true, eligibility_reasons: [],
      });
      writeProviderIssueObservation(repo, observation);
      const taskId = fixtureTaskId(task);
      const env = { ...process.env, REPO_HARNESS_HOME: home };
      const bound = spawnSync('bun', ['src/cli/index.ts', 'external-source', 'bind', '--repo', repoId, '--source-revision', observation.source_revision, '--sprint', sprint, '--task-id', taskId, '--target-ref', 'main', '--format', 'json'], { cwd: ROOT, env, encoding: 'utf8' });
      expect(bound.status, bound.stderr).toBe(0);
      expect(JSON.parse(bound.stdout).task_id).toBe(taskId);
      const bindings = spawnSync('bun', ['src/cli/index.ts', 'external-source', 'bindings', '--repo', repoId, '--format', 'json'], { cwd: ROOT, env, encoding: 'utf8' });
      expect(bindings.status, bindings.stderr).toBe(0);
      expect(JSON.parse(bindings.stdout).bindings[0].attention).toBe('none');
      const offers = spawnSync('bun', ['src/cli/index.ts', 'fleet', 'offers', '--repo-id', repoId, '--json'], { cwd: ROOT, env, encoding: 'utf8' });
      expect(offers.status, offers.stderr).toBe(0);
      expect(JSON.parse(offers.stdout).offers[0].execution_readiness).toBe('execution_ready');
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });
});
