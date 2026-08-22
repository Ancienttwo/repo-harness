/**
 * Real filesystem proof for WP2's token publication seam. A token remains a
 * worktree-local capability, so its writer must prove the shared lease while
 * holding the task lock; otherwise a steal between `bind` and a shell redirect
 * would leave a new execution tree armed with an old claim.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildLeaseOwnerRecord,
  deriveTaskId,
  deriveTaskRevision,
  type LeaseOwnerRecord,
} from '../src/core/state/coordination-identity';
import type { FleetOffersV1, TaskOfferV1 } from '../src/core/fleet/task-offer';
import {
  acquireFleetTask,
  type ContractWorktreeStartV1,
  type FleetAcquireDependencies,
} from '../src/effects/fleet/acquire';
import type { RepoHarnessRegisteredRepo, RepoHarnessRegistrySnapshot } from '../src/effects/repo-registry';
import { resolveRepoIdentity } from '../src/effects/state/coordination-canonical-source';
import { readLease, type LeaseRead } from '../src/effects/state/coordination-lease-store';
import type { SprintCommandDependencies } from '../src/cli/commands/sprint';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const SPRINT_PATH = 'plans/sprints/20260823-0202-acquire.sprint.md';
const TASK = 'acquire exactly one task';
const PLAN = 'plans/plan-20260823-0202-acquire-fixture.md';
const FIXTURES = new Set<string>();

interface CommandRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(cwd: string, args: readonly string[]): CommandRun {
  const child = spawnSync(process.execPath, [CLI, 'sprint', ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env },
  });
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

function git(cwd: string, args: readonly string[]): string {
  const child = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if (child.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${child.stderr}`);
  return child.stdout;
}

function runFleet(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv): CommandRun {
  const child = spawnSync(process.execPath, [CLI, 'fleet', ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

function runFleetAcquireInProcess(
  cwd: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<CommandRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, 'fleet', 'acquire', '--json', ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer | string) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk: Buffer | string) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function racePlan(sprintPath: string, task: string, planPath: string, contractPath: string): string {
  return [
    '# Plan: Fleet Acquire Race Fixture',
    '',
    '> **Status**: Approved',
    `> **Source Ref**: sprint:${sprintPath}#${task}`,
    '> **Artifact Level**: work-package',
    '> **Promotion Reason**: verification_boundary',
    '> **Verification Boundary**: Concurrent fleet acquisition returns one envelope.',
    '> **Rollback Surface**: Remove the fixture worktree and lease.',
    `> **Task Contract**: ${contractPath}`,
    '',
    '## Promotion Gate',
    '',
    '- **Merge/PR unit**: One acquisition is independently verifiable.',
    '- **Rollback surface**: Remove the fixture worktree and lease.',
    '- **Verification boundary**: Concurrent CLI acquisition and token readback.',
    '- **Review/acceptance boundary**: This test asserts one envelope.',
    '- **High-risk surface**: Shared lease election and fresh worktree creation.',
    '- **Why not checklist row**: The transaction crosses persistent authorities.',
    '',
    '## Evidence Contract',
    '',
    `- **State/progress path**: ${planPath}`,
    '- **Verification evidence**: Concurrent CLI JSON results and the winner token.',
    '- **Evaluator rubric**: Exactly one bound envelope and token.',
    '- **Stop condition**: All competing processes have completed.',
    '- **Rollback surface**: Remove the fixture worktree and lease.',
    '',
  ].join('\n');
}

function raceContract(planPath: string): string {
  return [
    '# Task Contract: Fleet Acquire Race Fixture',
    '',
    `> **Plan**: ${planPath}`,
    '',
    '## Allowed Paths',
    '',
    '```yaml',
    'allowed_paths:',
    '  - src/',
    '```',
    '',
  ].join('\n');
}

interface FleetRaceFixture {
  readonly root: string;
  readonly home: string;
  readonly repo: string;
  readonly repoId: string;
  readonly task: string;
  cleanup(): void;
}

function createFleetRaceFixture(): FleetRaceFixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fleet-acquire-process-race-')));
  FIXTURES.add(root);
  const repo = join(root, 'repo');
  const home = join(root, 'home');
  const repoId = 'repo-process-race';
  const sprintPath = 'plans/sprints/20260823-0202-process-race.sprint.md';
  const task = 'acquire one task across competing processes';
  const planPath = 'plans/plan-20260823-0202-process-race.md';
  const contractPath = 'tasks/contracts/20260823-0202-process-race.contract.md';
  mkdirSync(join(repo, '.ai/harness/sprint'), { recursive: true });
  mkdirSync(join(repo, 'plans/sprints'), { recursive: true });
  mkdirSync(join(repo, 'tasks/contracts'), { recursive: true });
  mkdirSync(home, { recursive: true });
  cpSync(join(ROOT, 'assets/templates/helpers'), join(repo, 'scripts'), { recursive: true });
  chmodSync(join(repo, 'scripts/contract-worktree.sh'), 0o755);
  chmodSync(join(repo, 'scripts/plan-to-todo.sh'), 0o755);
  writeFileSync(join(repo, '.ai/harness/policy.json'), JSON.stringify({
    worktree_strategy: { merge_back: { target: 'main' }, branch_prefix: 'codex/' },
  }));
  writeFileSync(join(repo, '.ai/harness/sprint/active-sprint'), `${sprintPath}\n`);
  writeFileSync(join(repo, sprintPath), [
    '# Fleet process race sprint',
    '',
    '## Backlog',
    '',
    '| # | Status | Task | Mode | Acceptance | Plan |',
    '| --- | --- | --- | --- | --- | --- |',
    `| 1 | [ ] | ${task} | contract | returns one bound envelope | (pending) |`,
    '',
  ].join('\n'));
  writeFileSync(join(repo, planPath), racePlan(sprintPath, task, planPath, contractPath));
  writeFileSync(join(repo, contractPath), raceContract(planPath));
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Fleet Race Test']);
  git(repo, ['config', 'user.email', 'fleet-race@test.local']);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'seed fleet acquire process race']);
  const canonicalRepo = realpathSync(repo);
  writeFileSync(join(home, 'registered-repos.json'), `${JSON.stringify({
    version: 1,
    authorizationRevision: 23,
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
    task,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
      FIXTURES.delete(root);
    },
  };
}

function raceEnvironment(home: string): NodeJS.ProcessEnv {
  return {
    REPO_HARNESS_HOME: home,
    REPO_HARNESS_TARGET_REPO_ROOT: '',
    REPO_HARNESS_HELPER_SOURCE_PATH: '',
    REPO_HARNESS_BASH_BIN: '/bin/bash',
    REPO_HARNESS_BUN_BIN: '',
  };
}

interface Fixture {
  readonly primary: string;
  readonly worktree: string;
  readonly taskId: string;
  readonly taskRevision: string;
  cleanup(): void;
}

function createFixture(): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fleet-acquire-token-')));
  FIXTURES.add(root);
  const primary = join(root, 'primary');
  const worktree = join(root, 'execution');
  mkdirSync(primary, { recursive: true });
  git(primary, ['init', '-b', 'main']);
  git(primary, ['config', 'user.name', 'Fleet Test']);
  git(primary, ['config', 'user.email', 'fleet@test.local']);
  mkdirSync(join(primary, 'plans/sprints'), { recursive: true });
  writeFileSync(join(primary, SPRINT_PATH), [
    '# Acquire fixture',
    '',
    '## Backlog',
    '',
    '| # | Status | Task | Mode | Acceptance | Plan |',
    '| --- | --- | --- | --- | --- | --- |',
    `| 1 | [ ] | ${TASK} | contract | exact token provenance | (pending) |`,
    '',
  ].join('\n'));
  writeFileSync(join(primary, PLAN), '# Acquire fixture\n');
  git(primary, ['add', '.']);
  git(primary, ['commit', '-m', 'seed']);
  git(primary, ['worktree', 'add', '-b', 'codex/acquire-fixture', worktree]);

  const taskId = deriveTaskId({
    repoIdentity: resolveRepoIdentity(primary),
    sprintPath: SPRINT_PATH,
    taskCell: TASK,
  });
  return {
    primary,
    worktree: realpathSync(worktree),
    taskId,
    taskRevision: deriveTaskRevision({
      taskId,
      modeCell: 'contract',
      acceptanceCell: 'exact token provenance',
    }),
    cleanup: () => {
      git(primary, ['worktree', 'remove', '--force', worktree]);
      rmSync(root, { recursive: true, force: true });
      FIXTURES.delete(root);
    },
  };
}

function claim(fixture: Fixture): { claim_id: string } {
  const result = run(fixture.primary, [
    'claim',
    '--task-id', fixture.taskId,
    '--expected-task-revision', fixture.taskRevision,
    '--target-ref', 'main',
    '--sprint-path', SPRINT_PATH,
    '--session-id', 'fleet-session-one',
  ]);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as { claim_id: string };
}

function tokenArgs(fixture: Fixture, claimId: string): string[] {
  return [
    'write-claim-token',
    '--task-id', fixture.taskId,
    '--claim-id', claimId,
    '--worktree', fixture.worktree,
    '--sprint-path', SPRINT_PATH,
    '--task', TASK,
    '--unit-ref', PLAN,
  ];
}

describe('fleet acquire claim token fencing', () => {
  test('writes atomically only after bind and refuses a token displaced by steal', () => {
    const fixture = createFixture();
    try {
      const owner = claim(fixture);
      const beforeBind = run(fixture.primary, tokenArgs(fixture, owner.claim_id));
      expect(beforeBind.status).toBe(1);
      expect(beforeBind.stderr).toContain('lease is reserving, not bound');

      const bound = run(fixture.primary, [
        'bind',
        '--claim-id', owner.claim_id,
        '--worktree', fixture.worktree,
        '--branch', 'codex/acquire-fixture',
        '--unit-ref', PLAN,
      ]);
      expect(bound.status, bound.stderr).toBe(0);

      const written = run(fixture.primary, tokenArgs(fixture, owner.claim_id));
      expect(written.status, written.stderr).toBe(0);
      expect(JSON.parse(written.stdout)).toMatchObject({
        task_id: fixture.taskId,
        claim_id: owner.claim_id,
        sprint: SPRINT_PATH,
        task: TASK,
        unit_ref: PLAN,
      });
      const tokenPath = join(fixture.worktree, '.ai/harness/sprint/claims', `${fixture.taskId}.claim`);
      const originalBytes = readFileSync(tokenPath, 'utf-8');
      expect(originalBytes).toContain(`claim_id=${owner.claim_id}\n`);

      const stolen = run(fixture.primary, [
        'steal',
        '--expected-claim-id', owner.claim_id,
        '--reason', 'acquire race winner',
        '--session-id', 'fleet-session-two',
      ]);
      expect(stolen.status, stolen.stderr).toBe(0);

      const stale = run(fixture.primary, tokenArgs(fixture, owner.claim_id));
      expect(stale.status).toBe(1);
      expect(stale.stderr).toContain('claim id mismatch');
      expect(readFileSync(tokenPath, 'utf-8')).toBe(originalBytes);
    } finally {
      fixture.cleanup();
    }
  }, 60_000);
});

describe('fleet acquire process race', () => {
  test('three real CLI processes return at most one bound envelope and token', async () => {
    const fixture = createFleetRaceFixture();
    try {
      const env = raceEnvironment(fixture.home);
      const offers = runFleet(fixture.repo, ['offers', '--json', '--repo-id', fixture.repoId], env);
      expect(offers.status, offers.stderr).toBe(0);
      const document = JSON.parse(offers.stdout) as {
        authorization_revision: number;
        offers: Array<{ readonly task_id: string; readonly offer_revision: string; readonly execution_readiness: string }>;
      };
      expect(document.offers).toHaveLength(1);
      const offer = document.offers[0]!;
      expect(offer.execution_readiness).toBe('execution_ready');

      const results = await Promise.all([0, 1, 2].map((index) => runFleetAcquireInProcess(fixture.repo, [
        '--repo-id', fixture.repoId,
        '--task-id', offer.task_id,
        '--offer-revision', offer.offer_revision,
        '--authorization-revision', String(document.authorization_revision),
        '--session-id', `fleet-process-race-${index}`,
        '--max-attempts', '1',
      ], env)));
      const parsed = results.map((result) => {
        expect(result.stderr).toBe('');
        expect(result.stdout).not.toBe('');
        return JSON.parse(result.stdout) as {
          readonly ok: boolean;
          readonly error?: string;
          readonly envelope?: {
            readonly claim_id: string;
            readonly task_id: string;
            readonly worktree_path: string;
            readonly branch: string;
            readonly claim_token: { readonly path: string; readonly claim_id: string };
          };
        };
      });
      const winners = parsed.filter((result) => result.ok && result.envelope !== undefined);
      expect(winners).toHaveLength(1);
      for (const result of parsed.filter((candidate) => !candidate.ok)) {
        expect(result.error).toBeDefined();
        expect(['no_eligible_task', 'offer_stale']).toContain(result.error!);
      }

      const winner = winners[0]!.envelope!;
      expect(winner.task_id).toBe(offer.task_id);
      expect(existsSync(winner.worktree_path)).toBe(true);
      const token = readFileSync(join(winner.worktree_path, winner.claim_token.path), 'utf-8');
      expect(token).toContain(`claim_id=${winner.claim_id}\n`);
      expect(winner.claim_token.claim_id).toBe(winner.claim_id);
      expect(readLease(fixture.repo, winner.task_id).record).toMatchObject({
        claim_id: winner.claim_id,
        state: 'bound',
        execution_worktree: winner.worktree_path,
        branch: winner.branch,
      });
      expect((git(fixture.repo, ['worktree', 'list', '--porcelain']).match(/^worktree /gm) ?? [])).toHaveLength(2);
    } finally {
      fixture.cleanup();
    }
  }, 90_000);
});

afterAll(() => {
  for (const fixture of FIXTURES) rmSync(fixture, { recursive: true, force: true });
});

const EFFECT_REPO: RepoHarnessRegisteredRepo = {
  id: 'repo-effect',
  path: '/repo-effect',
  accessMode: 'read_write',
  source: 'manual',
  registeredAt: '2026-08-23T00:00:00.000Z',
  lastSeenAt: '2026-08-23T00:00:00.000Z',
};
const EFFECT_SPRINT = 'plans/sprints/effect.sprint.md';
const EFFECT_TASK = 'acquire through every mutation boundary';
const EFFECT_TARGET = { ref: 'main', oid: 'b'.repeat(40) };
const EFFECT_PLAN = 'plans/plan-20260823-0202-effect.md';
const EFFECT_CONTRACT = 'tasks/contracts/20260823-0202-effect.contract.md';
const EFFECT_WORKTREE = '/repo-effect-worktree';
const EFFECT_BRANCH = 'codex/effect';
const EFFECT_START: ContractWorktreeStartV1 = {
  protocol: 1,
  kind: 'repo-harness-contract-worktree-start',
  worktree_path: EFFECT_WORKTREE,
  branch: EFFECT_BRANCH,
  plan_path: `${EFFECT_WORKTREE}/${EFFECT_PLAN}`,
  disposition: 'created',
};

function effectSprintText(): string {
  return [
    '# Effect fixture',
    '',
    '## Backlog',
    '',
    '| # | Status | Task | Mode | Acceptance | Plan |',
    '| --- | --- | --- | --- | --- | --- |',
    `| 1 | [ ] | ${EFFECT_TASK} | contract | all stages converge | (pending) |`,
    '',
  ].join('\n');
}

function effectFixture() {
  const taskId = deriveTaskId({
    repoIdentity: EFFECT_REPO.path,
    sprintPath: EFFECT_SPRINT,
    taskCell: EFFECT_TASK,
  });
  const taskRevision = deriveTaskRevision({
    taskId,
    modeCell: 'contract',
    acceptanceCell: 'all stages converge',
  });
  const proof = {
    plan_path: EFFECT_PLAN,
    contract_path: EFFECT_CONTRACT,
    source_ref: `sprint:${EFFECT_SPRINT}#${EFFECT_TASK}`,
    plan_sha256: 'sha256:effect-plan',
    contract_sha256: 'sha256:effect-contract',
  };
  const offer: TaskOfferV1 = {
    protocol: 1,
    kind: 'repo-harness-task-offer',
    repo_id: EFFECT_REPO.id,
    task_id: taskId,
    task_revision: taskRevision,
    sprint_path: EFFECT_SPRINT,
    row_order: 1,
    execution_readiness: 'execution_ready',
    snapshot_consistency: 'stable',
    blockers: [],
    offer_revision: 'sha256:effect-offer',
    authorization_revision: 9,
    canonical_target: EFFECT_TARGET,
    plan: proof,
  };
  const document: FleetOffersV1 = {
    protocol: 1,
    kind: 'repo-harness-fleet-offers',
    authorization_revision: 9,
    snapshot_consistency: 'stable',
    offer_revision: 'sha256:effect-fleet',
    offers: [offer],
  };
  const registry: RepoHarnessRegistrySnapshot = {
    registryPath: '/registry.json',
    authorizationRevision: 9,
    repos: [EFFECT_REPO],
  };
  const claimed = buildLeaseOwnerRecord({
    claimId: 'claim-effect',
    taskId,
    taskRevision,
    sprintPath: EFFECT_SPRINT,
    targetRef: EFFECT_TARGET.ref,
    generation: 1,
    sessionId: 'effect-session',
    sourceWorktree: EFFECT_REPO.path,
  });
  return { taskId, taskRevision, proof, offer, document, registry, claimed };
}

function outcome(value: unknown, exitCode: 0 | 1 = 0): { exitCode: 0 | 1; stdout: string; stderr: string } {
  return exitCode === 0
    ? { exitCode, stdout: `${JSON.stringify(value)}\n`, stderr: '' }
    : { exitCode, stdout: '', stderr: String(value) };
}

function leaseRead(taskId: string, record: LeaseOwnerRecord | null): LeaseRead {
  return record === null
    ? { task_id: taskId, classification: 'available', record: null, unknown_reason: null, raw: null }
    : {
      task_id: taskId,
      classification: record.state,
      record,
      unknown_reason: null,
      raw: JSON.stringify(record),
    };
}

function buildEffectDependencies(
  options: {
    readonly projectionError?: Error;
    readonly tokenError?: Error;
    readonly claimRace?: boolean;
    readonly authorizationStaleAfterClaim?: boolean;
  } = {},
): { readonly dependencies: Partial<FleetAcquireDependencies>; readonly calls: string[]; readonly released: string[] } {
  const fixture = effectFixture();
  const calls: string[] = [];
  const released: string[] = [];
  let lease: LeaseOwnerRecord | null = fixture.claimed;
  let claimAttempts = 0;
  let registryReads = 0;
  const dependencies: Partial<FleetAcquireDependencies> = {
    collectOffers: (() => {
      calls.push('collect');
      return fixture.document;
    }) as FleetAcquireDependencies['collectOffers'],
    readRegistry: (() => {
      calls.push('registry');
      registryReads += 1;
      if (options.authorizationStaleAfterClaim === true && registryReads >= 3) {
        return { ...fixture.registry, authorizationRevision: 10 };
      }
      return fixture.registry;
    }) as FleetAcquireDependencies['readRegistry'],
    sprintDependencies: (() => ({} as SprintCommandDependencies)) as FleetAcquireDependencies['sprintDependencies'],
    claim: (() => {
      calls.push('claim');
      claimAttempts += 1;
      return options.claimRace === true && claimAttempts === 1
        ? outcome('lost task lock', 1)
        : outcome(fixture.claimed);
    }) as FleetAcquireDependencies['claim'],
    start: (() => {
      calls.push('start');
      return EFFECT_START;
    }) as FleetAcquireDependencies['start'],
    topology: (() => {
      calls.push('topology');
      return {
        raw: '',
        worktrees: [{ path: EFFECT_WORKTREE, branch: `refs/heads/${EFFECT_BRANCH}`, head: EFFECT_TARGET.oid, detached: false }],
      };
    }) as FleetAcquireDependencies['topology'],
    readCanonicalSprint: (() => {
      calls.push('canonical');
      return { ok: true, commit: EFFECT_TARGET.oid, text: effectSprintText() };
    }) as FleetAcquireDependencies['readCanonicalSprint'],
    repoIdentity: (() => {
      calls.push('identity');
      return EFFECT_REPO.path;
    }) as FleetAcquireDependencies['repoIdentity'],
    readPlanProof: (() => {
      calls.push('proof');
      return { ok: true, proof: { ...fixture.proof, projectable: true as const } };
    }) as FleetAcquireDependencies['readPlanProof'],
    bind: (() => {
      calls.push('bind');
      lease = {
        ...fixture.claimed,
        state: 'bound',
        execution_worktree: EFFECT_WORKTREE,
        branch: EFFECT_BRANCH,
        unit_ref: EFFECT_PLAN,
      };
      return outcome(lease);
    }) as FleetAcquireDependencies['bind'],
    writeToken: (() => {
      calls.push('token');
      if (lease?.state !== 'bound') throw new Error('token ran before bind');
      if (options.tokenError !== undefined) throw options.tokenError;
      return {
        path: `.ai/harness/sprint/claims/${fixture.taskId}.claim`,
        claim_id: fixture.claimed.claim_id,
        task_id: fixture.taskId,
        sprint: EFFECT_SPRINT,
        task: EFFECT_TASK,
        unit_ref: EFFECT_PLAN,
      };
    }) as FleetAcquireDependencies['writeToken'],
    project: (() => {
      calls.push('project');
      if (options.projectionError !== undefined) throw options.projectionError;
    }) as FleetAcquireDependencies['project'],
    readLease: (() => {
      calls.push('lease');
      return leaseRead(fixture.taskId, lease);
    }) as FleetAcquireDependencies['readLease'],
    release: ((input: { readonly claimId?: string }) => {
      calls.push('release');
      released.push(input.claimId ?? '');
      if (lease?.claim_id === input.claimId) lease = null;
      return outcome({ released: true });
    }) as FleetAcquireDependencies['release'],
  };
  return { dependencies, calls, released };
}

describe('fleet acquire mutation orchestration', () => {
  test('returns an envelope only after claim, fresh topology, bind, token, projection, and final verify', () => {
    const fixture = buildEffectDependencies();
    const result = acquireFleetTask({ dependencies: fixture.dependencies, session_id: 'effect-session' });

    expect(result).toMatchObject({
      ok: true,
      envelope: {
        kind: 'repo-harness-work-envelope',
        worktree_path: EFFECT_WORKTREE,
        branch: EFFECT_BRANCH,
        claim_id: 'claim-effect',
        authorization_revision: 9,
      },
    });
    expect(fixture.calls).toEqual([
      'registry', 'collect', 'registry', 'collect', 'claim', 'start', 'topology',
      'registry', 'canonical', 'identity', 'proof', 'bind', 'token',
      'registry', 'canonical', 'identity', 'proof', 'project', 'topology', 'registry', 'lease',
    ]);
    expect(fixture.released).toEqual([]);
  });

  test('loses one claim race by re-reading and then binds only the winning claim', () => {
    const fixture = buildEffectDependencies({ claimRace: true });
    const result = acquireFleetTask({ dependencies: fixture.dependencies, session_id: 'effect-session' });

    expect(result.ok).toBe(true);
    expect(fixture.calls.filter((call) => call === 'claim')).toHaveLength(2);
    expect(fixture.calls.filter((call) => call === 'start')).toHaveLength(1);
    expect(fixture.released).toEqual([]);
  });

  test('projection failure releases only the acquired claim and returns a typed outcome', () => {
    const fixture = buildEffectDependencies({ projectionError: new Error('projection fault') });
    const result = acquireFleetTask({ dependencies: fixture.dependencies, session_id: 'effect-session' });

    expect(result).toEqual({ ok: false, error: 'projection_failed', message: 'projection fault' });
    expect(fixture.released).toEqual(['claim-effect']);
    expect(fixture.calls.at(-1)).toBe('release');
  });

  test('token failure releases only the acquired claim before projection', () => {
    const fixture = buildEffectDependencies({ tokenError: new Error('token fault') });
    const result = acquireFleetTask({ dependencies: fixture.dependencies, session_id: 'effect-session' });

    expect(result).toEqual({ ok: false, error: 'token_failed', message: 'token fault' });
    expect(fixture.released).toEqual(['claim-effect']);
    expect(fixture.calls).not.toContain('project');
  });

  test('authorization drift after fresh provision releases only this claim before bind', () => {
    const fixture = buildEffectDependencies({ authorizationStaleAfterClaim: true });
    const result = acquireFleetTask({ dependencies: fixture.dependencies, session_id: 'effect-session' });

    expect(result).toEqual({
      ok: false,
      error: 'authorization_stale',
      message: 'registry authorization changed after claim',
    });
    expect(fixture.released).toEqual(['claim-effect']);
    expect(fixture.calls).not.toContain('bind');
  });
});
