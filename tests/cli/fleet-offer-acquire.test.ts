import { describe, expect, test } from 'bun:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { runHelper } from '../../src/effects/runtime/helper-runner';
import { readLease } from '../../src/effects/state/coordination-lease-store';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const CLI = resolve(import.meta.dir, '../../src/cli/index.ts');
const CWD = resolve(import.meta.dir, '../..');

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(args: readonly string[], env: NodeJS.ProcessEnv): CliResult {
  const result = spawnSync('bun', [CLI, ...args], {
    cwd: CWD,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return result as unknown as CliResult;
}

function registryFixture(): { readonly root: string; readonly home: string } {
  const root = mkdtempSync(join(tmpdir(), 'fleet-acquire-cli-'));
  const home = join(root, 'home');
  const repo = join(root, 'repo');
  mkdirSync(join(repo, '.ai', 'harness'), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(join(repo, '.ai', 'harness', 'policy.json'), '{}\n');
  writeFileSync(join(home, 'registered-repos.json'), `${JSON.stringify({
    version: 1,
    authorizationRevision: 1,
    repos: [{
      id: 'repo-cli',
      path: repo,
      accessMode: 'read_write',
      source: 'manual',
      registeredAt: '2026-08-23T00:00:00.000Z',
      lastSeenAt: '2026-08-23T00:00:00.000Z',
    }],
  })}\n`);
  return { root, home };
}

function git(cwd: string, args: readonly string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

function projectablePlan(sprintPath: string, task: string, planPath: string, contractPath: string): string {
  return [
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
  ].join('\n');
}

function projectableContract(planPath: string): string {
  return [
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
  ].join('\n');
}

interface AcquireFixture {
  readonly root: string;
  readonly home: string;
  readonly repo: string;
  readonly repoId: string;
  readonly sprintPath: string;
  readonly task: string;
  cleanup(): void;
}

function acquireFixture(): AcquireFixture {
  const root = mkdtempSync(join(tmpdir(), 'fleet-acquire-cli-real-'));
  const repo = join(root, 'repo');
  const home = join(root, 'home');
  const repoId = 'repo-cli-real';
  const sprintPath = 'plans/sprints/20260823-0202-cli-acquire.sprint.md';
  const task = 'acquire one real CLI worktree';
  const planPath = 'plans/plan-20260823-0202-cli-acquire.md';
  const contractPath = 'tasks/contracts/20260823-0202-cli-acquire.contract.md';
  mkdirSync(join(repo, '.ai/harness/sprint'), { recursive: true });
  mkdirSync(join(repo, '.claude/templates'), { recursive: true });
  mkdirSync(join(repo, 'plans/sprints'), { recursive: true });
  mkdirSync(join(repo, 'tasks/contracts'), { recursive: true });
  mkdirSync(home, { recursive: true });
  cpSync(join(CWD, '.claude/templates/contract.template.md'), join(repo, '.claude/templates/contract.template.md'));
  writeFileSync(join(repo, '.ai/harness/policy.json'), JSON.stringify({
    worktree_strategy: { merge_back: { target: 'main' }, review_base: 'main', branch_prefix: 'codex/' },
  }));
  writeFileSync(join(repo, '.ai/harness/sprint/active-sprint'), `${sprintPath}\n`);
  writeFileSync(join(repo, sprintPath), [
    '# CLI acquire sprint',
    '> **Status**: Executing',
    '> **Backlog Schema**: 2',
    '',
    '## Backlog',
    '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '| --- |----| --- | --- | --- | --- | --- |',
    `| 1 | ${fixtureTaskId(`${task}`)} | [ ] | ${task} | contract | returns one bound envelope | (pending) |`,
    '',
  ].join('\n'));
  writeFileSync(join(repo, planPath), projectablePlan(sprintPath, task, planPath, contractPath));
  writeFileSync(join(repo, contractPath), projectableContract(planPath));
  for (const directory of ['tasks/reviews', 'tasks/notes', 'src']) mkdirSync(join(repo, directory), { recursive: true });
  writeFileSync(join(repo, 'tasks/reviews/20260823-0202-cli-acquire.review.md'), '# Authored review\n');
  writeFileSync(join(repo, 'tasks/notes/20260823-0202-cli-acquire.notes.md'), '# Authored notes\n');
  writeFileSync(join(repo, 'tasks/todos.md'), '# Deferred goals\n');
  writeFileSync(join(repo, 'src/index.ts'), 'export const business = false;\n');
  writeFileSync(join(repo, '.gitignore'), '.ai/harness/*\n!.ai/harness/policy.json\n');
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Fleet CLI Test']);
  git(repo, ['config', 'user.email', 'fleet-cli@test.local']);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'seed real fleet acquire']);
  const canonicalRepo = realpathSync(repo);
  writeFileSync(join(home, 'registered-repos.json'), `${JSON.stringify({
    version: 1,
    authorizationRevision: 17,
    repos: [{
      id: repoId,
      path: canonicalRepo,
      accessMode: 'read_write',
      source: 'manual',
      registeredAt: '2026-08-23T00:00:00.000Z',
      lastSeenAt: '2026-08-23T00:00:00.000Z',
    }],
  })}\n`);
  return {
    root,
    home,
    repo: canonicalRepo,
    repoId,
    sprintPath,
    task,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function acquireEnvironment(home: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    REPO_HARNESS_HOME: home,
    REPO_HARNESS_TARGET_REPO_ROOT: '',
    REPO_HARNESS_HELPER_SOURCE_PATH: '',
    REPO_HARNESS_BASH_BIN: '/bin/bash',
    REPO_HARNESS_BUN_BIN: '',
  };
}

describe('fleet offers CLI', () => {
  test('emits the deterministic empty FleetOffersV1 document when the registry is empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-offers-cli-'));
    try {
      const result = runCli(['fleet', 'offers', '--json'], { REPO_HARNESS_HOME: join(root, 'home') });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe('');
      const document = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(document.protocol).toBe(1);
      expect(document.kind).toBe('repo-harness-fleet-offers');
      expect(document.authorization_revision).toBe(0);
      expect(document.snapshot_consistency).toBe('stable');
      expect(document.offers).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('acquire help exposes every optimistic assertion and retry option', () => {
    const result = runCli(['fleet', 'acquire', '--help'], {});
    expect(result.status, result.stderr).toBe(0);
    for (const option of [
      '--repo-id',
      '--task-id',
      '--offer-revision',
      '--authorization-revision',
      '--session-id',
      '--max-attempts',
    ]) {
      expect(result.stdout).toContain(option);
    }
  });

  test('acquire requires an authorization revision before invoking the effect', () => {
    const fixture = registryFixture();
    try {
      const result = runCli(
        ['fleet', 'acquire', '--json', '--repo-id', 'repo-cli'],
        { REPO_HARNESS_HOME: fixture.home },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('--authorization-revision');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('acquire rejects an out-of-range max-attempts value as invalid_argument', () => {
    const fixture = registryFixture();
    try {
      const result = runCli(
        [
          'fleet', 'acquire', '--json',
          '--authorization-revision', '1',
          '--max-attempts', '0',
        ],
        { REPO_HARNESS_HOME: fixture.home },
      );
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, error: 'invalid_argument' });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('no eligible task is a successful empty result with effect-shaped JSON', () => {
    const fixture = registryFixture();
    try {
      const result = runCli(
        [
          'fleet', 'acquire', '--json',
          '--repo-id', 'repo-cli',
          '--authorization-revision', '1',
          '--session-id', 'cli-session',
          '--max-attempts', '1',
        ],
        { REPO_HARNESS_HOME: fixture.home },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: 'no_eligible_task',
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('task and offer assertions reach the effect as a typed stale result', () => {
    const fixture = registryFixture();
    try {
      const result = runCli(
        [
          'fleet', 'acquire', '--json',
          '--repo-id', 'repo-cli',
          '--task-id', 'task-assertion',
          '--offer-revision', 'sha256:offer',
          '--authorization-revision', '1',
          '--session-id', 'cli-session',
          '--max-attempts', '1',
        ],
        { REPO_HARNESS_HOME: fixture.home },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: 'offer_stale',
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('acquires a package-helper-only repository and never returns a second envelope', () => {
    const fixture = acquireFixture();
    try {
      expect(existsSync(join(fixture.repo, 'scripts/contract-worktree.sh'))).toBe(false);
      expect(existsSync(join(fixture.repo, 'scripts/plan-to-todo.sh'))).toBe(false);
      const env = acquireEnvironment(fixture.home);
      const offers = runCli(['fleet', 'offers', '--json', '--repo-id', fixture.repoId], env);
      expect(offers.status, offers.stderr).toBe(0);
      const offered = JSON.parse(offers.stdout) as {
        authorization_revision: number;
        offers: Array<{ task_id: string; offer_revision: string; execution_readiness: string }>;
      };
      const offer = offered.offers[0];
      expect(offer).toMatchObject({ execution_readiness: 'execution_ready' });

      const args = [
        'fleet', 'acquire', '--json',
        '--repo-id', fixture.repoId,
        '--task-id', offer!.task_id,
        '--offer-revision', offer!.offer_revision,
        '--authorization-revision', String(offered.authorization_revision),
        '--session-id', 'cli-real-session',
        '--max-attempts', '2',
      ];
      const acquired = runCli(args, env);
      expect(acquired.status, acquired.stderr || acquired.stdout).toBe(0);
      expect(acquired.stderr).toBe('');
      const result = JSON.parse(acquired.stdout) as {
        ok: boolean;
        envelope?: {
          kind: string;
          claim_id: string;
          task_id: string;
          worktree_path: string;
          branch: string;
          plan: { plan_path: string; contract_path: string; contract_sha256: string };
          claim_token: { path: string; claim_id: string };
        };
      };
      expect(result.ok).toBe(true);
      expect(result.envelope).toMatchObject({
        kind: 'repo-harness-work-envelope',
        task_id: offer!.task_id,
      });
      const envelope = result.envelope!;
      expect(existsSync(envelope.worktree_path)).toBe(true);
      expect(existsSync(join(envelope.worktree_path, envelope.plan.contract_path))).toBe(true);
      const authored = readFileSync(join(fixture.repo, envelope.plan.contract_path), 'utf8');
      expect(readFileSync(join(envelope.worktree_path, envelope.plan.contract_path), 'utf8')).toBe(authored);
      const workflowPaths = [envelope.plan.plan_path, envelope.plan.contract_path, 'tasks/reviews/20260823-0202-cli-acquire.review.md', 'tasks/notes/20260823-0202-cli-acquire.notes.md', 'tasks/todos.md'];
      for (const path of workflowPaths) expect(readFileSync(join(envelope.worktree_path, path), 'utf8'), path).toBe(readFileSync(join(fixture.repo, path), 'utf8'));
      expect(readFileSync(join(envelope.worktree_path, '.ai/harness/active-plan'), 'utf8').trim()).toBe(envelope.plan.plan_path);
      expect(readFileSync(join(envelope.worktree_path, '.ai/harness/active-worktree'), 'utf8').trim()).toBe(envelope.worktree_path);

      const preflight = spawnSync(process.execPath, [join(CWD, 'scripts/contract-run.ts'), 'preflight',
        '--repo', envelope.worktree_path, '--contract', envelope.plan.contract_path, '--json'], { encoding: 'utf8', env: { ...process.env, ...env } });
      expect(preflight.status, preflight.stdout + preflight.stderr).toBe(0);
      expect(readLease(fixture.repo, envelope.task_id).record).toMatchObject({
        claim_id: envelope.claim_id,
        state: 'bound',
        execution_worktree: envelope.worktree_path,
        branch: envelope.branch,
      });
      const token = readFileSync(join(envelope.worktree_path, envelope.claim_token.path), 'utf8');
      expect(token).toContain(`claim_id=${envelope.claim_id}\n`);
      expect(token).toContain(`task=${fixture.task}\n`);

      writeFileSync(join(envelope.worktree_path, 'src/index.ts'), 'export const business = true;\n');
      // A clean runtime cannot borrow the developer's globally installed hook CLI.
      const verifierBun = join(fixture.root, process.platform === 'win32' ? 'bun.exe' : 'bun');
      cpSync(process.execPath, verifierBun);
      const verify = () => {
        const run = spawnSync(verifierBun, ['-e',
          `import { runHelper } from ${JSON.stringify(join(CWD, 'src/effects/runtime/helper-runner.ts'))}; console.log(JSON.stringify(runHelper(${JSON.stringify({
            helper: 'verify-sprint', args: ['--prepare-acceptance'], cwd: envelope.worktree_path,
            trustedPackage: true, stdio: 'pipe',
          })})));`,
        ], { cwd: envelope.worktree_path, encoding: 'utf8', env: { ...process.env, ...env } });
        expect(run.status, run.stderr).toBe(0);
        return JSON.parse(run.stdout) as ReturnType<typeof runHelper>;
      };
      const snapshot = () => {
        const runs = join(envelope.worktree_path, '.ai/harness/runs');
        const files = readdirSync(runs).filter(path => path.startsWith('run-') && path.endsWith('.json')).sort();
        return JSON.parse(readFileSync(join(runs, files.at(-1)!), 'utf8'));
      };
      const accepted = verify();
      expect(accepted.exitCode, (accepted.stdout ?? "") + (accepted.stderr ?? "")).toBe(0);
      expect(snapshot().allowed_paths_check.status).toBe('pass');
      expect(snapshot().contract.status).toBe('pass');
      const sentinel = join(envelope.worktree_path, '.ai/harness/business-command-ran');
      expect(readFileSync(sentinel, 'utf8')).toBe('passed');
      rmSync(sentinel);
      const notesPath = 'tasks/notes/20260823-0202-cli-acquire.notes.md';
      writeFileSync(join(envelope.worktree_path, notesPath), '# Out of scope workflow mutation\n');
      const refused = verify();
      expect(refused.exitCode, (refused.stdout ?? "") + (refused.stderr ?? "")).toBe(1);
      expect(snapshot().allowed_paths_check.outside).toContain(notesPath);
      expect(existsSync(sentinel)).toBe(false);
      writeFileSync(join(envelope.worktree_path, notesPath), readFileSync(join(fixture.repo, notesPath)));

      // Missing contracts are initialized; replay must leave that template invalid
      // and byte-identical until an author supplies the actual task authority.
      const contractFile = join(envelope.worktree_path, envelope.plan.contract_path);
      rmSync(contractFile);
      const project = () => {
        const planFile = join(envelope.worktree_path, envelope.plan.plan_path);
        writeFileSync(planFile, readFileSync(planFile, 'utf8').replace('**Status**: Executing', '**Status**: Approved'));
        return spawnSync('bash', [join(CWD, 'scripts/plan-to-todo.sh'), '--plan', envelope.plan.plan_path], {
        cwd: envelope.worktree_path, encoding: 'utf8',
        env: { ...process.env, ...env, REPO_HARNESS_TARGET_REPO_ROOT: envelope.worktree_path },
        });
      };
      const initialized = project();
      expect(initialized.status, initialized.stdout + initialized.stderr).toBe(0);
      const template = readFileSync(contractFile, 'utf8');
      expect(template).toContain('Describe the exact outcome this task must deliver.');
      const rejected = spawnSync(process.execPath, [join(CWD, 'scripts/contract-run.ts'), 'preflight',
        '--repo', envelope.worktree_path, '--contract', envelope.plan.contract_path, '--json'], { encoding: 'utf8', env: { ...process.env, ...env } });
      expect(rejected.status).not.toBe(0);
      expect(rejected.stdout).toContain('incomplete_brief');
      const replayed = project();
      expect(replayed.status, replayed.stdout + replayed.stderr).toBe(0);
      expect(readFileSync(contractFile, 'utf8')).toBe(template);

      const repeated = runCli(args, env);
      expect(repeated.status).not.toBe(0);
      expect(repeated.stderr).toBe('');
      expect(JSON.parse(repeated.stdout)).toMatchObject({ ok: false, error: 'offer_stale' });
      expect(repeated.stdout).not.toContain('repo-harness-work-envelope');
    } finally {
      fixture.cleanup();
    }
  }, 60_000);
});

for (const state of ['missing', 'uncommitted-only'] as const) test(`acquire refuses ${state} review artifact without returning a dispatch envelope`, () => {
  const fixture = acquireFixture();
  try {
    const review = 'tasks/reviews/20260823-0202-cli-acquire.review.md';
    git(fixture.repo, ['rm', ...(state === 'uncommitted-only' ? ['--cached'] : []), review]);
    git(fixture.repo, ['commit', '-m', 'remove review from acquisition base']);
    const env = acquireEnvironment(fixture.home);
    const offers = runCli(['fleet', 'offers', '--json', '--repo-id', fixture.repoId], env);
    expect(offers.status, offers.stderr).toBe(0);
    const document = JSON.parse(offers.stdout);
    const offer = document.offers[0];
    const result = runCli(['fleet', 'acquire', '--json', '--repo-id', fixture.repoId, '--task-id', offer.task_id, '--authorization-revision', String(document.authorization_revision)], env);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    const refused = JSON.parse(result.stdout);
    expect(refused).toMatchObject({ ok: false, error: state === 'missing' ? 'offer_stale' : 'provision_failed' });
    expect(refused.message).toContain('review artifact');
    expect(result.stdout).not.toContain('repo-harness-work-envelope');
    const lease = readLease(fixture.repo, offer.task_id).record;
    expect(lease).toBeNull();
    const topology = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: fixture.repo, encoding: 'utf8' });
    expect(topology.stdout.match(/^worktree /gm)).toHaveLength(state === 'missing' ? 1 : 2);
  } finally { fixture.cleanup(); }
});
