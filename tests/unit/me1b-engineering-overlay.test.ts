import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  validateEngineeringOverlaySnapshot,
  validateOrganizationAttentionSnapshot,
} from '../../src/core/engineers/engineering-overlay';
import { projectFleetBoardSnapshot } from '../../src/core/fleet/board';
import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import {
  collectEngineeringBoard,
  type EngineeringOverlayDependencies,
} from '../../src/effects/engineers/engineering-overlay';
import { listEngineerProfiles, loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

const sourceRoot = process.cwd();
const roots: string[] = [];
const engineerId = 'engineer:capability.verification.evals-checks';
const bindingOne = '11111111-1111-4111-8111-111111111111';
const bindingTwo = '22222222-2222-4222-8222-222222222222';

function fleetBytes(): string {
  return JSON.stringify(projectFleetBoardSnapshot({
    registry_revision: `sha256:${'a'.repeat(64)}`,
    sequence: 1,
    observed_at: '2026-08-25T15:02:00.000Z',
    repositories: [{
      repository_id: 'repo_0123456789abcdef', repo_root: '/fixture', access_mode: 'read_write', status: 'ok', snapshot_consistency: 'stable', error: null,
      cards: [{
        task_id: 'b'.repeat(64), task_revision: `sha256:${'c'.repeat(64)}`, task_state: 'pending', lease_state: 'bound',
        claim_id: bindingOne, generation: 1, current_publication: null, merge_readiness: null, execution_readiness: 'execution_ready',
        feedback: { pending_count: 0, no_progress: false, repair_actions: [] }, inbox: { unread_count: 0, addressed_to_current_claim: false }, snapshot_consistency: 'stable',
      }],
    }],
  }));
}

function fixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me1b-overlay-')));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root });
  mkdirSync(join(root, '.archcontext/model'), { recursive: true });
  mkdirSync(join(root, 'agents'), { recursive: true });
  mkdirSync(join(root, 'tasks'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  writeFileSync(join(root, 'tasks/current.md'), 'task authority\n');
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
    listProviderEffects: () => Object.freeze([]),
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

  test('never labels a mixed binding generation stable', () => {
    const root = fixture();
    const first = bind(root, bindingOne);
    const fleetBefore = fleetBytes();
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
    expect(fleetBytes()).toBe(fleetBefore);
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
