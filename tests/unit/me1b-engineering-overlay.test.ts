import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';

import {
  validateEngineeringOverlaySnapshot,
  validateOrganizationAttentionSnapshot,
} from '../../src/core/engineers/engineering-overlay';
import { engineerSha256 } from '../../src/core/engineers/profile-binding';
import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import {
  collectEngineeringBoard,
  type EngineeringOverlayDependencies,
} from '../../src/effects/engineers/engineering-overlay';
import { readProjectedWorkGraphAt } from '../../src/effects/engineers/scheduling';
import { collectFleetBoard } from '../../src/effects/fleet/board';
import { listEngineerProfiles, loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { repoHarnessRepoIdFor, type RepoHarnessRegisteredRepo } from '../../src/effects/repo-registry';

const sourceRoot = process.cwd();
const roots: string[] = [];
const engineerId = 'engineer:capability.verification.evals-checks';
const capabilityId = 'capability.verification.evals-checks';
const bindingOne = '11111111-1111-4111-8111-111111111111';
const bindingTwo = '22222222-2222-4222-8222-222222222222';
const sprintPath = 'plans/sprints/demo.sprint.md';
const policyBytes = '{"policy":1}\n';
const rollbackBytes = '{"rollback":"wp-a"}\n';

/** Read the real Fleet projection of this exact fixture repository. The
 * observed_at/sequence inputs are pinned so any difference in the returned
 * bytes comes from repository state, not from the clock. */
async function fleetBytes(home: string): Promise<string> {
  return JSON.stringify(await collectFleetBoard({
    env: { ...process.env, REPO_HARNESS_HOME: home },
    sequence: 1,
    observed_at: '2026-08-25T15:02:00.000Z',
    timeout_ms: 10_000,
  }));
}

function registeredRepo(root: string): RepoHarnessRegisteredRepo {
  return {
    id: repoHarnessRepoIdFor(root), path: root, accessMode: 'read_write', source: 'manual',
    registeredAt: '2026-08-25T15:00:00.000Z', lastSeenAt: '2026-08-25T15:00:00.000Z',
  };
}

/** A private registry home naming exactly this fixture as a read_write repo. */
function fleetHome(root: string): string {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me1b-home-')));
  roots.push(home);
  writeFileSync(join(home, 'registered-repos.json'), `${JSON.stringify({
    version: 1, authorizationRevision: 1, repos: [registeredRepo(root)],
  })}\n`);
  return home;
}

function fixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me1b-overlay-')));
  roots.push(root);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root });
  mkdirSync(join(root, '.archcontext/model'), { recursive: true });
  mkdirSync(join(root, 'agents'), { recursive: true });
  mkdirSync(join(root, 'tasks'), { recursive: true });
  mkdirSync(join(root, '.ai/harness/sprint'), { recursive: true });
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  mkdirSync(join(root, 'plans/policies'), { recursive: true });
  mkdirSync(join(root, 'plans/rollback'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  writeFileSync(join(root, 'tasks/current.md'), 'task authority\n');
  writeFileSync(join(root, '.ai/harness/policy.json'), '{"worktree_strategy":{"merge_back":{"target":"main"}}}\n');
  writeFileSync(join(root, '.ai/harness/sprint/active-sprint'), `${sprintPath}\n`);
  writeFileSync(join(root, sprintPath), [
    '# Sprint: demo', '', '## Backlog', '',
    '| # | Status | Task | Mode | Acceptance | Plan |',
    '|---|---|---|---|---|---|',
    '| 1 | [ ] | task A | contract | accepted A | (pending) |', '',
    '## Execution Log', '',
  ].join('\n'));
  writeFileSync(join(root, 'plans/sprints/demo.work-graph.v1.json'), `${JSON.stringify({
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: repoHarnessRepoIdFor(root),
    sprint_path: sprintPath,
    lane: 'engineering-v2',
    work_packages: [{
      work_package_id: 'wp-a',
      task_ref: 'task A',
      primary_capability: capabilityId,
      depends_on: [],
      priority: 50,
      concurrency: { scope: 'repo', key: 'release' },
      execution_surface: 'contract',
      integration_group: null,
      required_acceptance: [{
        gate: 'module', policy_id: 'module-default',
        policy_ref: 'plans/policies/module.json', policy_revision: engineerSha256(policyBytes),
      }],
      rollback_boundary: {
        kind: 'work_package', boundary_id: `${repoHarnessRepoIdFor(root)}:wp-a`,
        boundary_ref: 'plans/rollback/wp-a.json', boundary_revision: engineerSha256(rollbackBytes),
      },
    }],
  })}\n`);
  writeFileSync(join(root, 'plans/policies/module.json'), policyBytes);
  writeFileSync(join(root, 'plans/rollback/wp-a.json'), rollbackBytes);
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  return root;
}

function bind(root: string, bindingId: string, previous?: ReturnType<typeof readEngineerBindingStatus>['current']) {
  const profile = loadEngineerProfile(root, engineerId);
  return bindEngineer(root, {
    engineer_id: engineerId,
    idempotency_key: `bind-${bindingId}`,
    provider: 'codex',
    provider_thread_id: `thread-${bindingId.slice(0, 4)}`,
    host_id: 'local',
    engineer_contract_revision: profile.engineer_contract_revision,
    expected_current_digest: previous?.current_digest ?? null,
    expected_binding_generation: previous?.binding_generation ?? 0,
    expected_binding_id: previous?.current_binding_id ?? null,
    expected_engineer_contract_revision: profile.engineer_contract_revision,
    binding_id: () => bindingId,
    now: () => previous ? '2026-08-25T15:01:00.000Z' : '2026-08-25T15:00:00.000Z',
  });
}

function deps(root: string, overrides: Partial<EngineeringOverlayDependencies> = {}): Partial<EngineeringOverlayDependencies> {
  return {
    readRegistry: () => ({
      registryPath: '/fixture/registered-repos.json',
      authorizationRevision: 1,
      registryRevision: `sha256:${'2'.repeat(64)}`,
      repos: [{
        id: repoHarnessRepoIdFor(root), path: root, accessMode: 'read_write', source: 'manual',
        registeredAt: '2026-08-25T15:00:00.000Z', lastSeenAt: '2026-08-25T15:00:00.000Z',
      }],
    }),
    listProfiles: listEngineerProfiles,
    readBinding: readEngineerBindingStatus,
    listClaims: () => Object.freeze([]),
    readMessages: () => Object.freeze({ pending: 0, delivery_failed: 0, revision: `sha256:${'3'.repeat(64)}` }),
    listRuntimeEffects: () => Object.freeze([]),
    ...overrides,
  };
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('ME-1B Engineering Overlay', () => {
  test('projects stable binding/message attention without mutating tracked task authority', () => {
    const root = fixture();
    bind(root, bindingOne);
    const before = execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, encoding: 'utf8' });
    const board = collectEngineeringBoard({
      repo_root: root,
      observed_at: '2026-08-25T15:02:00.000Z',
      dependencies: deps(root, {
        readMessages: (_root, id) => Object.freeze({ pending: id === engineerId ? 1 : 0, delivery_failed: id === engineerId ? 1 : 0, revision: `sha256:${id === engineerId ? '4'.repeat(64) : '5'.repeat(64)}` }),
      }),
    });
    expect(board.overlay.registry_revision).toBe(`sha256:${'2'.repeat(64)}`);
    expect(board.overlay.snapshot_consistency).toBe('stable');
    expect(board.overlay.engineers.find((item) => item.engineer_id === engineerId)).toMatchObject({
      binding: { support: 'available', state: 'active', value: { observation: 'unknown' } },
      active_claim: { support: 'available', value: null },
      delegations: { support: 'unsupported', value: null },
      messages: { support: 'available', pending: 1, delivery_failed: 1 },
      memory: { support: 'unsupported', value: null },
    });
    expect(board.organization_attention.attention).toContainEqual(expect.objectContaining({
      engineer_id: engineerId,
      reason: 'message_delivery_failed',
    }));
    expect(execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, encoding: 'utf8' })).toBe(before);
  });

  test('never labels a mixed binding generation stable', async () => {
    const root = fixture();
    const home = fleetHome(root);
    const first = bind(root, bindingOne);
    const fleetBefore = await fleetBytes(home);
    const board = collectEngineeringBoard({
      repo_root: root,
      observed_at: '2026-08-25T15:02:00.000Z',
      dependencies: deps(root),
      between_reads: () => { bind(root, bindingTwo, first); },
    });
    expect(board.overlay.snapshot_consistency).toBe('changed_during_read');
    const component = board.overlay.components.find((item) => item.component === 'bindings')!;
    expect(component.observation_before).not.toBe(component.observation_after);
    expect(board.overlay.engineers.find((item) => item.engineer_id === engineerId)?.binding)
      .toMatchObject({ state: 'active', value: { binding_id: bindingTwo, binding_generation: 2 } });
    expect(await fleetBytes(home)).toBe(fleetBefore);
  }, 30_000);

  test('one fixture serves the sprint graph, the Fleet projection, and the Engineer board as independent views', async () => {
    const root = fixture();
    const home = fleetHome(root);
    const first = bind(root, bindingOne);

    const graphBefore = readProjectedWorkGraphAt(registeredRepo(root), sprintPath);
    const fleetBefore = await fleetBytes(home);
    const boardBefore = collectEngineeringBoard({
      repo_root: root, observed_at: '2026-08-25T15:02:00.000Z', dependencies: deps(root),
    });
    // A vacuous projection would make the invariance below meaningless.
    expect(graphBefore.graph?.work_packages.map((item) => item.work_package_id)).toEqual(['wp-a']);
    expect(JSON.parse(fleetBefore).repositories[0]).toMatchObject({ status: 'ok' });
    expect(JSON.parse(fleetBefore).repositories[0].cards.length).toBeGreaterThan(0);
    expect(boardBefore.overlay.engineers.find((item) => item.engineer_id === engineerId)?.binding)
      .toMatchObject({ state: 'active', value: { binding_id: bindingOne, binding_generation: 1 } });

    bind(root, bindingTwo, first);

    const graphAfter = readProjectedWorkGraphAt(registeredRepo(root), sprintPath);
    const boardAfter = collectEngineeringBoard({
      repo_root: root, observed_at: '2026-08-25T15:02:00.000Z', dependencies: deps(root),
    });
    expect(graphAfter.graph?.work_graph_revision).toBe(graphBefore.graph!.work_graph_revision);
    expect(await fleetBytes(home)).toBe(fleetBefore);
    expect(boardAfter.overlay.engineers.find((item) => item.engineer_id === engineerId)?.binding)
      .toMatchObject({ state: 'active', value: { binding_id: bindingTwo, binding_generation: 2 } });
    expect(boardAfter.overlay.snapshot_sha256).not.toBe(boardBefore.overlay.snapshot_sha256);
  }, 30_000);

  test('the overlay registers no route on the operator server or web surface', () => {
    const sources = readdirSync(join(sourceRoot, 'src'), { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.tsx'))
      .map((entry) => join('src', entry));
    const importers = sources.filter((entry) => {
      const text = readFileSync(join(sourceRoot, entry), 'utf8');
      return /engineers\/engineering-overlay|collectEngineeringBoard/u.test(text);
    }).map((entry) => relative('src', entry).split('\\').join('/')).sort();

    expect(importers).toEqual([
      'cli/commands/engineer.ts',
      'effects/engineers/engineering-overlay.ts',
    ]);
    expect(importers.some((entry) => entry.startsWith('operator-web/') || entry.startsWith('effects/operator/'))).toBeFalse();
  });

  test('keeps unreadable distinct from healthy empty and rejects illegal binding combinations', () => {
    const root = fixture();
    const board = collectEngineeringBoard({
      repo_root: root,
      observed_at: '2026-08-25T15:02:00.000Z',
      dependencies: deps(root, { readMessages: () => { throw new Error('unreadable'); } }),
    });
    expect(board.overlay.snapshot_consistency).toBe('degraded');
    expect(board.overlay.engineers.every((item) => item.messages.support === 'unreadable')).toBeTrue();
    const active = board.overlay.engineers.find((item) => item.binding.state === 'unbound')!;
    expect(() => validateEngineeringOverlaySnapshot({
      ...board.overlay,
      engineers: board.overlay.engineers.map((item) => item.engineer_id === active.engineer_id
        ? { ...item, binding: { ...item.binding, value: { binding_id: bindingOne } } }
        : item),
    })).toThrow('unbound binding must have null value');
    expect(() => validateEngineeringOverlaySnapshot({
      ...board.overlay,
      snapshot_consistency: 'stable',
    })).toThrow('snapshot_consistency does not match component observations');
    expect(() => validateEngineeringOverlaySnapshot({
      ...board.overlay,
      components: [...board.overlay.components].reverse(),
    })).toThrow('components are not in canonical order');
    expect(() => validateEngineeringOverlaySnapshot({
      ...board.overlay,
      engineers: board.overlay.engineers.map((item, index) => index === 0
        ? { ...item, capability_id: 'capability.overlay.mismatch' }
        : item),
    })).toThrow('engineer_id does not match capability_id');
    expect(() => validateOrganizationAttentionSnapshot({
      ...board.organization_attention,
      attention: board.organization_attention.attention.map((item, index) => index === 0
        ? { ...item, owner: 'runtime_operator' }
        : item),
    })).toThrow('attention owner does not match reason');
  });

  test('converges on the same degraded projection whichever read pass loses the Profile authority', () => {
    const root = fixture();
    bind(root, bindingOne);
    let firstReads = 0;
    const firstReadFailure = collectEngineeringBoard({
      repo_root: root,
      observed_at: '2026-08-25T15:02:00.000Z',
      dependencies: deps(root, {
        listProfiles: (cwd) => {
          firstReads += 1;
          if (firstReads === 1) throw new Error('profile authority unreadable');
          return listEngineerProfiles(cwd);
        },
      }),
    });
    expect(firstReads).toBe(2);
    expect(firstReadFailure.overlay.snapshot_consistency).toBe('degraded');
    expect(firstReadFailure.overlay.engineers).toEqual([]);
    expect(firstReadFailure.overlay.components.every((item) => item.support === 'unreadable')).toBeTrue();

    let secondReads = 0;
    const secondReadFailure = collectEngineeringBoard({
      repo_root: root,
      observed_at: '2026-08-25T15:02:00.000Z',
      dependencies: deps(root, {
        listProfiles: (cwd) => {
          secondReads += 1;
          if (secondReads === 2) throw new Error('profile authority unreadable');
          return listEngineerProfiles(cwd);
        },
      }),
    });
    expect(secondReads).toBe(2);
    expect(secondReadFailure.overlay.snapshot_consistency).toBe('degraded');
    expect(secondReadFailure.overlay.engineers).toEqual([]);
    expect(secondReadFailure.overlay.snapshot_sha256).toBe(firstReadFailure.overlay.snapshot_sha256);
    expect(firstReadFailure.organization_attention.attention).toEqual(secondReadFailure.organization_attention.attention);
  });

  test('fails closed when the repository registry authority is unreadable', () => {
    const root = fixture();
    expect(() => collectEngineeringBoard({
      repo_root: root,
      dependencies: deps(root, { readRegistry: () => { throw new Error('malformed registry'); } }),
    })).toThrow('repository registry authority is unreadable');
  });

  test('projects ten Engineers within the local three-second budget', () => {
    const root = fixture();
    const template = listEngineerProfiles(root)[0];
    const profiles = Array.from({ length: 10 }, (_, index) => ({
      ...template,
      profile: {
        ...template.profile,
        engineer_id: `engineer:capability.overlay.engineer-${index}`,
        capability_id: `capability.overlay.engineer-${index}`,
      },
      engineer_contract_revision: `sha256:${String(index).padStart(64, '0')}`,
    })) as any;
    const started = performance.now();
    const board = collectEngineeringBoard({
      repo_root: root,
      observed_at: '2026-08-25T15:02:00.000Z',
      dependencies: deps(root, {
        listProfiles: () => profiles,
        readBinding: (_cwd, id, revision) => ({
          current: { state: 'unbound', current_digest: `sha256:${'6'.repeat(64)}`, engineer_contract_revision: revision },
          binding: null, event: null, genesis: true,
        } as any),
      }),
    });
    expect(board.overlay.engineers).toHaveLength(10);
    expect(performance.now() - started).toBeLessThan(3_000);
  });
});
