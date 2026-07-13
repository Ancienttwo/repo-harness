import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  migrateLegacyActivePlan,
  resolveEffectiveState,
  type EffectiveState,
} from '../src/cli/hook/state-snapshot';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const PLAN = 'plans/plan-20260712-2327-effective-fixture.md';
const CONTRACT = 'tasks/contracts/20260712-2327-effective-fixture.contract.md';
const REVIEW = 'tasks/reviews/20260712-2327-effective-fixture.review.md';

function write(cwd: string, path: string, content: string): void {
  mkdirSync(join(cwd, path, '..'), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

// Commits a fixture write so it lands on HEAD instead of staying an
// uncommitted diff. Needed for files (like .ai/context/capabilities.json)
// that the resolver itself might otherwise pick up as an "observed target
// path" via buildImplementationDiffFingerprint's branch/status scan --
// polluting the very capability-mapping input the test is trying to control.
function commitFixture(cwd: string, message: string): void {
  for (const args of [['add', '.'], ['commit', '-m', message]]) {
    const git = spawnSync('git', args, { cwd, encoding: 'utf-8' });
    if (git.status !== 0) throw new Error(git.stderr);
  }
}

function withRepo(fn: (cwd: string) => void): void {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-effective-')));
  try {
    for (const path of ['plans', 'tasks/contracts', 'tasks/reviews', '.ai/harness/handoff', '.claude']) {
      mkdirSync(join(cwd, path), { recursive: true });
    }
    write(cwd, '.ai/harness/active-plan', `${PLAN}\n`);
    write(cwd, '.claude/.active-plan', `${PLAN}\n`);
    write(cwd, '.ai/harness/active-worktree', `${cwd}\n`);
    write(cwd, PLAN, [
      '# Plan: Effective Fixture',
      '',
      '> **Status**: Executing',
      `> **Task Contract**: \`${CONTRACT}\``,
      '',
      '## Task Breakdown',
      '- [x] first task',
      '- [ ] implement resolver',
      '',
      '## Evidence Contract',
      '- **State/progress path**: plan',
      '- **Verification evidence**: tests',
      '- **Evaluator rubric**: review',
      '- **Stop condition**: pass',
      '- **Rollback surface**: revert',
      '',
    ].join('\n'));
    write(cwd, CONTRACT, [
      '# Task Contract: effective-fixture',
      '',
      '> **Status**: Active',
      `> **Plan**: ${PLAN}`,
      '> **Task Profile**: code-change',
      '> **Workflow Profile**: standard',
      `> **Review File**: \`${REVIEW}\``,
      '',
      '## Allowed Paths',
      '',
      '```yaml',
      'allowed_paths:',
      '  - src/',
      '  - tests/effective-state.test.ts',
      '```',
      '',
    ].join('\n'));
    write(cwd, REVIEW, [
      '# Review',
      '> **Recommendation**: fail',
      '> **Reviewed Diff Fingerprint**: pending',
      '## External Acceptance Advice',
      '> **External Acceptance**: unavailable',
      '',
    ].join('\n'));
    write(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
      status: 'fail',
      active_plan: PLAN,
    }));
    write(cwd, 'tasks/current.md', [
      '# Current',
      `> **Updated At**: ${new Date().toISOString()}`,
      `- Active Plan: ${PLAN}`,
      '',
    ].join('\n'));
    write(cwd, '.gitignore', '.ai/harness/state/\n.ai/harness/checks/\n.ai/harness/handoff/\n');
    for (const args of [
      ['init', '-b', 'main'],
      ['config', 'user.email', 'fixture@example.com'],
      ['config', 'user.name', 'Fixture'],
      ['add', '.'],
      ['commit', '-m', 'fixture'],
    ]) {
      const git = spawnSync('git', args, { cwd, encoding: 'utf-8' });
      if (git.status !== 0) throw new Error(git.stderr);
    }
    fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function runCli(cwd: string): { status: number | null; state: EffectiveState; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, 'state', 'resolve', '--json'], {
    cwd,
    encoding: 'utf-8',
  });
  return {
    status: result.status,
    state: JSON.parse(result.stdout) as EffectiveState,
    stderr: result.stderr,
  };
}

function resolveFixtureState(cwd: string): EffectiveState {
  return resolveEffectiveState(cwd, Date.now(), {
    targetPaths: ['src/feature.ts'],
    operationKind: 'feature',
  });
}

describe('effective state resolver', () => {
  test('normalizes authoritative workflow sources and writes an atomic cache', () => {
    withRepo((cwd) => {
      const state = resolveFixtureState(cwd);
      expect(state.task_id).toBe('20260712-2327-effective-fixture');
      expect(state.phase).toBe('executing');
      expect(state.authoritative_plan).toEqual({ path: PLAN, status: 'executing' });
      expect(state.contract).toEqual({ path: CONTRACT, status: 'Active', plan: PLAN });
      expect(state.task_profile).toBe('code-change');
      expect(state.workflow_profile).toBe('standard');
      expect(state.requested_workflow_profile).toBe('standard');
      expect(state.risk_floor).toBe('standard');
      expect(state.profile_reasons).toContain('risk-floor:standard:feature');
      expect(state.allowed_paths).toEqual(['src/', 'tests/effective-state.test.ts']);
      expect(state.next_action).toBe('implement resolver');
      expect(state.blockers).toEqual([]);
      expect(state.review.freshness).toBe('stale');
      expect(state.external_acceptance.status).toBe('unavailable');
      expect(state.checks).toMatchObject({ freshness: 'stale', status: 'fail' });
      expect(state.handoff.freshness).toBe('missing');
      expect(state.resume.freshness).toBe('missing');
      expect(state.current_snapshot.freshness).toBe('fresh');
      expect(state.source_hashes[PLAN]).toMatch(/^sha256:[0-9a-f]{64}$/);

      const cached = JSON.parse(readFileSync(join(cwd, '.ai/harness/state/effective.json'), 'utf-8'));
      expect(cached).toEqual(state);
      expect(readdirSync(join(cwd, '.ai/harness/state'))).toEqual(['effective.json']);
    });
  });

  test('uses a durable monotonic version plus content revision across cache deletion or corruption', () => {
    withRepo((cwd) => {
      const first = resolveFixtureState(cwd);
      const unchanged = resolveFixtureState(cwd);
      expect(unchanged.state_version).toBe(first.state_version);

      rmSync(join(cwd, '.ai/harness/state/effective.json'));
      expect(resolveFixtureState(cwd).state_version).toBe(first.state_version);
      write(cwd, '.ai/harness/state/effective.json', '{broken');
      expect(resolveFixtureState(cwd).state_version).toBe(first.state_version);

      write(cwd, CONTRACT, readFileSync(join(cwd, CONTRACT), 'utf-8').replace('standard', 'strict'));
      const changed = resolveFixtureState(cwd);
      expect(changed.state_version).toBe(first.state_version + 1);
      expect(changed.state_revision).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(changed.workflow_profile).toBe('strict');
    });
  });

  test('fails closed when no actual changed or target paths are authoritative', () => {
    withRepo((cwd) => {
      const state = resolveEffectiveState(cwd);
      expect(state.allowed_paths).toEqual(['src/', 'tests/effective-state.test.ts']);
      expect(state.workflow_profile).toBeNull();
      expect(state.risk_floor).toBe('strict');
      expect(state.profile_reasons).toContain('risk-floor:strict:signals-unavailable');
      expect(state.blockers).toContain('workflow_profile:invalid_risk_input');
      expect(state.phase).toBe('blocked');
    });
  });

  test('steady-state resolution ignores the retired legacy marker', () => {
    withRepo((cwd) => {
      write(cwd, '.claude/.active-plan', 'plans/plan-other.md\n');
      const state = resolveFixtureState(cwd);
      expect(state.authoritative_plan?.path).toBe(PLAN);
      expect(state.conflicting_sources).not.toContain('active_plan_markers');
      expect(state.source_hashes['.claude/.active-plan']).toBeUndefined();
    });
  });

  test('performs legacy migration only through the explicit one-shot command', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, '.ai/harness/active-plan'));
      expect(resolveEffectiveState(cwd, Date.now(), { targetPaths: ['src/index.ts'] }).authoritative_plan).toBeNull();
      const migrated = migrateLegacyActivePlan(cwd);
      expect(migrated).toMatchObject({ migrated: true, plan: PLAN });
      expect(readFileSync(join(cwd, '.ai/harness/active-plan'), 'utf-8').trim()).toBe(PLAN);
      expect(() => readFileSync(join(cwd, '.claude/.active-plan'), 'utf-8')).toThrow();
      expect(resolveFixtureState(cwd).authoritative_plan?.path).toBe(PLAN);
    });
  });

  test('explicit legacy migration fails closed on a real authority conflict', () => {
    withRepo((cwd) => {
      write(cwd, '.claude/.active-plan', 'plans/plan-other.md\n');
      expect(() => migrateLegacyActivePlan(cwd)).toThrow('conflicts with canonical');
    });
  });

  test('blocks approved or executing work when its contract is missing', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, CONTRACT));
      const state = resolveFixtureState(cwd);
      expect(state.phase).toBe('blocked');
      expect(state.blockers).toContain('missing_contract');
      expect(state.next_action).toBe('resolve blockers');
    });
  });

  test('keeps the legacy snapshot projection read-only', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, '.ai/harness/active-plan'));
      const result = spawnSync(process.execPath, [join(ROOT, 'src/cli/hook-entry.ts'), 'state-snapshot', '--json'], {
        cwd,
        encoding: 'utf-8',
      });
      expect(result.status).toBe(0);
      expect(() => readFileSync(join(cwd, '.ai/harness/active-plan'), 'utf-8')).toThrow();
      expect(() => readFileSync(join(cwd, '.ai/harness/state/effective.json'), 'utf-8')).toThrow();
    });
  });

  test('marks stale projections without allowing tasks/current to become authority', () => {
    withRepo((cwd) => {
      write(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
        status: 'pass',
        active_plan: 'plans/plan-old.md',
      }));
      write(cwd, '.ai/harness/handoff/current.md', '- Active plan: plans/plan-old.md\n');
      write(cwd, 'tasks/current.md', [
        '> **Updated At**: 2020-01-01T00:00:00Z',
        '- Active Plan: plans/plan-old.md',
      ].join('\n'));
      write(cwd, '.ai/harness/sprint/active-sprint', 'plans/sprints/missing.sprint.md\n');

      const state = resolveFixtureState(cwd);
      expect(state.authoritative_plan?.path).toBe(PLAN);
      expect(state.stale_sources).toEqual(expect.arrayContaining([
        'checks',
        'handoff',
        'current_snapshot',
        'active_sprint',
      ]));
      expect(state.checks.freshness).toBe('stale');
      expect(state.active_sprint.freshness).toBe('stale');
    });
  });

  test('binds checks to the exact implementation fingerprint', () => {
    withRepo((cwd) => {
      const initial = resolveFixtureState(cwd);
      write(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
        status: 'fail',
        active_plan: PLAN,
        diff_base: { ref: 'main' },
        implementation_fingerprint: initial.source_hashes.implementation_diff,
      }));
      const bound = resolveFixtureState(cwd);
      expect(initial.source_hashes.implementation_diff).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(bound.checks.freshness).toBe('fresh');
      expect(bound.blockers).toContain('checks_failed');
      expect(bound.phase).toBe('blocked');

      write(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
        status: 'pass',
        active_plan: PLAN,
        diff_base: { ref: 'main' },
        implementation_fingerprint: 'sha256:' + '0'.repeat(64),
      }));
      expect(resolveFixtureState(cwd).checks.freshness).toBe('stale');
    });
  });

  test('binds handoff and resume to task id, authority revision, and handoff hash', () => {
    withRepo((cwd) => {
      const initial = resolveFixtureState(cwd);
      const revision = initial.source_hashes.authority_revision;
      const handoff = [
        '# Handoff',
        `> **Task ID**: ${initial.task_id}`,
        `> **Source State Revision**: ${revision}`,
        '- Exact Next Step: continue bound task',
        '',
      ].join('\n');
      write(cwd, '.ai/harness/handoff/current.md', handoff);
      write(cwd, '.ai/harness/handoff/resume.md', [
        '# Resume',
        `> **Task ID**: ${initial.task_id}`,
        `> **Source State Revision**: ${revision}`,
        `> **Handoff Hash**: sha256:${createHash('sha256').update(handoff).digest('hex')}`,
        '',
      ].join('\n'));
      const bound = resolveFixtureState(cwd);
      expect(bound.handoff.freshness).toBe('fresh');
      expect(bound.resume.freshness).toBe('fresh');

      write(cwd, '.ai/harness/handoff/resume.md', `> **Task ID**: ${initial.task_id}\nold ${revision}\n`);
      expect(resolveFixtureState(cwd).resume.freshness).toBe('stale');
    });
  });

  test('records lock ownership and reclaims a stale dead owner', () => {
    withRepo((cwd) => {
      write(cwd, '.ai/harness/state/effective.lock', JSON.stringify({
        pid: 99999999,
        created_at: Date.now() - 60_000,
        token: 'dead',
      }));
      const state = resolveFixtureState(cwd);
      expect(state.task_id).toBe('20260712-2327-effective-fixture');
      expect(() => readFileSync(join(cwd, '.ai/harness/state/effective.lock'), 'utf-8')).toThrow();
    });
  });

  test('--field workflow_profile prints only the resolved profile value, matching the full JSON field', () => {
    withRepo((cwd) => {
      const full = resolveFixtureState(cwd);
      const fieldOutput = spawnSync(process.execPath, [
        CLI, 'state', 'resolve', '--json', '--field', 'workflow_profile',
        '--target-path', 'src/feature.ts', '--operation', 'feature',
      ], { cwd, encoding: 'utf-8' });
      expect(fieldOutput.status).toBe(0);
      expect(fieldOutput.stdout).toBe(`${full.workflow_profile}\n`);
      expect(fieldOutput.stdout).not.toContain('{');
      expect(fieldOutput.stderr).toBe('');
    });
  });

  test('--field prints nothing for a null field and still preserves the blocked exit code', () => {
    withRepo((cwd) => {
      const fieldOutput = spawnSync(process.execPath, [
        CLI, 'state', 'resolve', '--json', '--field', 'workflow_profile',
      ], { cwd, encoding: 'utf-8' });
      expect(fieldOutput.status).toBe(1);
      expect(fieldOutput.stdout).toBe('');
    });
  });

  test('--field serializes a non-string field as JSON while still suppressing the full document', () => {
    withRepo((cwd) => {
      const full = resolveFixtureState(cwd);
      const fieldOutput = spawnSync(process.execPath, [
        CLI, 'state', 'resolve', '--json', '--field', 'blockers',
        '--target-path', 'src/feature.ts', '--operation', 'feature',
      ], { cwd, encoding: 'utf-8' });
      expect(fieldOutput.status).toBe(0);
      expect(JSON.parse(fieldOutput.stdout)).toEqual(full.blockers);
    });
  });

  test('--field on an unknown field name prints nothing and still resolves the full state underneath', () => {
    withRepo((cwd) => {
      const fieldOutput = spawnSync(process.execPath, [
        CLI, 'state', 'resolve', '--json', '--field', 'not_a_real_field',
        '--target-path', 'src/feature.ts', '--operation', 'feature',
      ], { cwd, encoding: 'utf-8' });
      expect(fieldOutput.status).toBe(0);
      expect(fieldOutput.stdout).toBe('');
    });
  });

  function setContractProfile(cwd: string, profile: string): void {
    const current = readFileSync(join(cwd, CONTRACT), 'utf-8');
    write(cwd, CONTRACT, current.replace(
      /^> \*\*Workflow Profile\*\*: .*$/m,
      `> **Workflow Profile**: ${profile}`,
    ));
  }

  test('guidance encodes the ceremony bound per resolved profile: lite zero, standard capped, strict full', () => {
    withRepo((cwd) => {
      // Lite: no strict category, no cross-capability, no medium scope, not
      // an explicit "feature" operation -- riskFloor is lite, and an
      // explicit override to lite matches it exactly.
      setContractProfile(cwd, 'lite');
      const lite = resolveEffectiveState(cwd, Date.now(), {
        targetPaths: ['src/feature.ts'],
        operationKind: 'edit',
      });
      expect(lite.workflow_profile).toBe('lite');
      expect(lite.guidance).toBe(
        'brief -> edit -> targeted test; do not author plan, contract, notes, todos, or checks files (zero ceremony)',
      );

      // Standard: restore the fixture's default contract override + feature operation.
      setContractProfile(cwd, 'standard');
      const standard = resolveFixtureState(cwd);
      expect(standard.workflow_profile).toBe('standard');
      expect(standard.guidance).toBe(
        'at most one active plan artifact; no contract, notes, or todos scaffolding beyond it',
      );

      // Strict: raising the override is always allowed (raise-only floor).
      setContractProfile(cwd, 'strict');
      const strict = resolveFixtureState(cwd);
      expect(strict.workflow_profile).toBe('strict');
      expect(strict.guidance).toBe('full envelope: plan, contract, notes, and checks as required');
    });
  });

  test('guidance is null when the risk floor cannot resolve a profile', () => {
    withRepo((cwd) => {
      const state = resolveEffectiveState(cwd);
      expect(state.workflow_profile).toBeNull();
      expect(state.guidance).toBeNull();
    });
  });

  describe('capability registry resolution (Phase C1)', () => {
    test('a repo that never declared a registry keeps no-signal behavior with no blocker', () => {
      withRepo((cwd) => {
        const state = resolveFixtureState(cwd);
        expect(state.blockers).not.toContain('capability_registry:invalid');
        expect(state.profile_reasons).not.toContain('capability:registry:invalid');
        expect(state.profile_reasons).toContain('capability:registry:absent');
      });
    });

    test('a declared-but-missing registry fails closed with a structured blocker', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/harness/policy.json', JSON.stringify({
          context: { capability_registry_file: '.ai/context/capabilities.json' },
        }));
        const state = resolveFixtureState(cwd);
        expect(state.blockers).toContain('capability_registry:invalid');
        expect(state.profile_reasons).toContain('capability:registry:invalid');
        expect(state.phase).toBe('blocked');
      });
    });

    test('corrupt registry JSON fails closed with a structured blocker instead of a silent capabilityCount=0', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', '{not json');
        const state = resolveFixtureState(cwd);
        expect(state.blockers).toContain('capability_registry:invalid');
      });
    });

    test('a non-array capabilities field fails closed with a structured blocker', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({ capabilities: 'oops' }));
        const state = resolveFixtureState(cwd);
        expect(state.blockers).toContain('capability_registry:invalid');
      });
    });

    test('a valid registry with no matching prefix produces no blocker but records the unmapped reason', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({
          version: 1,
          capabilities: [{ id: 'other-capability', prefixes: ['src/other'] }],
        }));
        commitFixture(cwd, 'seed registry');
        const state = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['src/feature.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).not.toContain('capability_registry:invalid');
        expect(state.profile_reasons).toContain('capability:unmapped:1');
      });
    });

    test('an unmapped implementation path contributes one cross-capability bucket without lowering the floor', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({
          version: 1,
          capabilities: [{ id: 'mapped-capability', prefixes: ['src/mapped'] }],
        }));
        commitFixture(cwd, 'seed registry');
        const state = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['src/mapped/a.ts', 'src/unmapped/b.ts'],
          operationKind: 'edit',
        });
        expect(state.profile_reasons).toContain('capability:unmapped:1');
        expect(state.risk_floor).toBe('standard');
        expect(state.blockers).not.toContain('capability_registry:invalid');
      });
    });
  });
});
