import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  buildStateSnapshot,
  resolveEffectiveState,
} from '../src/effects/state/resolve-effective-state';
import { stateVersionOwnerPath } from '../src/effects/state/git-state-version-store';
import { migrateLegacyActivePlan } from '../src/cli/hook/legacy-active-plan-migration';
import {
  CLI,
  CONTRACT,
  PLAN,
  REVIEW,
  ROOT,
  commitFixture,
  resolveFixtureState,
  runCli,
  withRepo,
  writeFixture as write,
  writeFixtureStateLock,
} from './state/effective-state-fixture';

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

  test('explicit legacy migration fails closed when a canonical marker is unreadable', () => {
    withRepo((cwd) => {
      const marker = join(cwd, '.ai/harness/active-plan');
      rmSync(marker);
      mkdirSync(marker);
      expect(() => migrateLegacyActivePlan(cwd)).toThrow();
      expect(readFileSync(join(cwd, '.claude/.active-plan'), 'utf-8')).toContain(PLAN);
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

  test('binds checks to the exact review subject', () => {
    withRepo((cwd) => {
      const initial = resolveFixtureState(cwd);
      write(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
        status: 'fail',
        active_plan: PLAN,
        review_subject_sha256: initial.source_hashes.review_subject,
      }));
      const bound = resolveFixtureState(cwd);
      expect(initial.source_hashes.review_subject).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(bound.checks.freshness).toBe('fresh');
      expect(bound.blockers).toContain('checks_failed');
      expect(bound.phase).toBe('blocked');

      write(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
        status: 'pass',
        active_plan: PLAN,
        review_subject_sha256: 'sha256:' + '0'.repeat(64),
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
      writeFixtureStateLock(cwd, {
        pid: 99999999,
        created_at: Date.now() - 60_000,
        token: '99999999-0-00000000-0000-4000-8000-000000000005',
      });
      const state = resolveFixtureState(cwd);
      expect(state.task_id).toBe('20260712-2327-effective-fixture');
      expect(() => readdirSync(join(cwd, '.ai/harness/state/effective.lock'))).toThrow();
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

  test('--field on an unknown field name reports an error and exits non-zero, listing legal fields', () => {
    withRepo((cwd) => {
      const fieldOutput = spawnSync(process.execPath, [
        CLI, 'state', 'resolve', '--json', '--field', 'not_a_real_field',
        '--target-path', 'src/feature.ts', '--operation', 'feature',
      ], { cwd, encoding: 'utf-8' });
      expect(fieldOutput.status).toBe(2);
      expect(fieldOutput.stdout).toBe('');
      expect(fieldOutput.stderr).toContain('not_a_real_field');
      expect(fieldOutput.stderr).toContain('workflow_profile');
    });
  });

  test('--field suppresses the printed value when blockers are present, even though the field itself resolved a value', () => {
    withRepo((cwd) => {
      // missing_contract fires (Executing plan, no contract file yet) while
      // workflow_profile still resolves a real, non-null value ('standard')
      // -- the CLI must not print a value a caller could mistake for
      // trustworthy when the exit code already signals "blocked".
      rmSync(join(cwd, CONTRACT));
      const full = resolveFixtureState(cwd);
      expect(full.blockers).toContain('missing_contract');
      expect(full.workflow_profile).not.toBeNull();

      const fieldOutput = spawnSync(process.execPath, [
        CLI, 'state', 'resolve', '--json', '--field', 'workflow_profile',
        '--target-path', 'src/feature.ts', '--operation', 'feature',
      ], { cwd, encoding: 'utf-8' });
      expect(fieldOutput.status).toBe(1);
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
    function capability(id: string, prefixes: readonly string[]) {
      return {
        id,
        domain: 'fixture',
        name: id,
        prefixes,
        contract_files: {
          agents: `${prefixes[0]}/AGENTS.md`,
          claude: `${prefixes[0]}/CLAUDE.md`,
        },
        architecture_module: `docs/architecture/modules/fixture/${id}.md`,
        workstream_dir: `tasks/workstreams/fixture/${id}`,
        lsp_profile: 'typescript-lsp',
        verification_hints: ['bun test'],
      };
    }

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

    test('a declared registry file that is zero-byte or otherwise unreadable already fails closed the same as missing (locks in existing behavior; external acceptance verified this was not actually a gap)', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/harness/policy.json', JSON.stringify({
          context: { capability_registry_file: '.ai/context/capabilities.json' },
        }));
        // readFileSync on a zero-byte file returns '' (does not throw), and
        // '' is falsy in JS -- capabilityIdsForPaths' `if (!text)` branch
        // already treats a present-but-empty file identically to a missing
        // one, so a declared registry that is zero-byte already resolves
        // 'invalid' today. This test locks that in explicitly rather than
        // only covering the "file does not exist at all" case above.
        write(cwd, '.ai/context/capabilities.json', '');
        const state = resolveFixtureState(cwd);
        expect(state.blockers).toContain('capability_registry:invalid');
        expect(state.profile_reasons).toContain('capability:registry:invalid');
      });
    });

    test('malformed entries inside an otherwise-parseable registry are counted and fail closed instead of silently dropped', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({
          version: 1,
          capabilities: [
            capability('good-cap', ['src/good']),
            { id: 'bad-entry-no-prefixes' },
            'just a string',
            { prefixes: ['src/no-id'] },
            { id: 'mixed-cap', prefixes: ['src/mixed', 42, 'src/mixed2'] },
          ],
        }));
        commitFixture(cwd, 'seed malformed registry');
        const state = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['src/no-id/x.ts'],
          operationKind: 'edit',
        });
        // 4 malformed entries: missing prefixes, non-object string element,
        // missing id, and mixed-cap (keeps its 2 valid prefixes for matching
        // purposes, but still counts as malformed since it also dropped one
        // non-string prefix element -- partial recovery of the good part
        // does not un-flag the entry).
        expect(state.profile_reasons).toContain('capability:registry:malformed-entries:4');
        expect(state.blockers).toContain('capability_registry:invalid');
        expect(state.phase).toBe('blocked');
      });
    });

    test('a corrupt policy.json fails closed before cache/version publication', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/harness/policy.json', 'not json{{{');
        expect(() => resolveFixtureState(cwd)).toThrow();
        expect(existsSync(join(cwd, '.ai/harness/state/effective.json'))).toBe(false);
        expect(existsSync(stateVersionOwnerPath(cwd))).toBe(false);
      });
    });

    for (const malformed of [
      {
        name: 'non-string capability registry declaration',
        policy: { context: { capability_registry_file: 42 } },
        resolve: resolveFixtureState,
      },
      {
        name: 'non-string review base',
        policy: { worktree_strategy: { review_base: 42 } },
        resolve: resolveFixtureState,
      },
      {
        name: 'non-object worktree strategy',
        policy: { worktree_strategy: 42 },
        resolve: resolveFixtureState,
      },
      {
        name: 'unsafe pending orchestration path',
        policy: { planning: { pending_orchestration_file: '../../outside' } },
        resolve: buildStateSnapshot,
      },
      {
        name: 'win32 traversal pending orchestration path',
        policy: { planning: { pending_orchestration_file: '.ai/harness/planning/..\\..\\outside.json' } },
        resolve: buildStateSnapshot,
      },
    ] as const) {
      test(`parseable malformed policy fails closed: ${malformed.name}`, () => {
        withRepo((cwd) => {
          write(cwd, '.ai/harness/policy.json', JSON.stringify(malformed.policy));
          expect(() => malformed.resolve(cwd)).toThrow();
          expect(existsSync(join(cwd, '.ai/harness/state/effective.json'))).toBe(false);
          expect(existsSync(stateVersionOwnerPath(cwd))).toBe(false);
        });
      });
    }

    for (const malformed of [
      { context: 42 },
      { context: { capability_registry_file: '../../outside' } },
    ] as const) {
      test(`clean inspect validates all policy authority eagerly: ${JSON.stringify(malformed)}`, () => {
        withRepo((cwd) => {
          write(cwd, '.ai/harness/policy.json', JSON.stringify(malformed));
          commitFixture(cwd, 'commit malformed policy authority');
          expect(() => resolveEffectiveState(cwd, Date.now(), {
            targetPaths: [],
            operationKind: 'inspect',
          })).toThrow();
          expect(existsSync(join(cwd, '.ai/harness/state/effective.json'))).toBe(false);
          expect(existsSync(stateVersionOwnerPath(cwd))).toBe(false);
        });
      });
    }

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
          capabilities: [capability('other-capability', ['src/other'])],
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

    test('registry and policy changes advance the state revision and durable version', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({
          version: 1,
          capabilities: [capability('feature-capability', ['src'])],
        }));
        commitFixture(cwd, 'seed valid capability registry');
        const first = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['src/feature.ts'],
          operationKind: 'edit',
        });

        write(cwd, '.ai/context/capabilities.json', '{invalid registry');
        commitFixture(cwd, 'invalidate capability registry');
        const second = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['src/feature.ts'],
          operationKind: 'edit',
        });
        expect(second.state_revision).not.toBe(first.state_revision);
        expect(second.state_version).toBe(first.state_version + 1);
        expect(second.blockers).toContain('capability_registry:invalid');

        write(cwd, '.ai/harness/policy.json', JSON.stringify({
          worktree_strategy: { review_base: 'main' },
        }));
        commitFixture(cwd, 'add workflow policy');
        const third = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['src/feature.ts'],
          operationKind: 'edit',
        });
        expect(third.state_revision).not.toBe(second.state_revision);
        expect(third.state_version).toBe(second.state_version + 1);
      });
    });

    test('an unmapped implementation path contributes one cross-capability bucket without lowering the floor', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({
          version: 1,
          capabilities: [capability('mapped-capability', ['src/mapped'])],
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

    test('workflow-surface-only target paths never reach capability resolution as implementation paths (Phase C2)', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({
          version: 1,
          capabilities: [capability('docs-capability', ['docs'])],
        }));
        commitFixture(cwd, 'seed registry');
        const state = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['docs/a.md', 'docs/b.md'],
          operationKind: 'edit',
        });
        expect(state.profile_reasons).not.toContain('capability:unmapped:1');
        expect(state.profile_signals?.capabilityCount).toBe(0);
      });
    });
  });

  // Round 2 external acceptance: capabilityIdsForPaths previously marked a
  // registry 'valid' even when version !== 1, an entry's id was an empty
  // string, or an entry's prefixes was an empty array -- all three are
  // rejected by the canonical registry validator (scripts/capability-
  // resolver.ts, projected to assets/templates/helpers/capability-
  // resolver.ts), so a malformed registry of exactly this shape silently
  // bypassed the capability_registry:invalid blocker. This describe block
  // proves both sides agree on accept/reject for the same fixture, using the
  // real, independently-shipped canonical script (copied into the fixture
  // repo, not imported) rather than trusting the two implementations stay in
  // sync by inspection alone.
  describe('registry validation parity with capability-resolver.ts (Round 2 external acceptance)', () => {
    function installCanonicalValidator(cwd: string): void {
      mkdirSync(join(cwd, 'scripts'), { recursive: true });
      writeFileSync(
        join(cwd, 'scripts/capability-resolver.ts'),
        readFileSync(join(ROOT, 'assets/templates/helpers/capability-resolver.ts')),
      );
    }

    function runCanonicalValidate(cwd: string): { status: number | null; stdout: string; errors: string[] } {
      const result = spawnSync('bun', ['scripts/capability-resolver.ts', 'validate', '--repo', '.', '--format', 'json'], {
        cwd,
        encoding: 'utf-8',
      });
      let errors: string[] = [];
      try {
        errors = (JSON.parse(result.stdout) as { errors?: string[] }).errors ?? [];
      } catch {
        // readRegistry() throws before producing any JSON for a structural
        // failure (e.g. version !== 1); the CLI still exits non-zero with a
        // plain-text message on stderr/stdout, which is what this parity
        // check actually asserts -- the errors array is only populated when
        // readRegistry() succeeded and validateRegistry() ran.
      }
      return { status: result.status, stdout: result.stdout, errors };
    }

    const validCapability = {
      id: 'good-cap',
      domain: 'good-domain',
      name: 'good-name',
      prefixes: ['src/good'],
      contract_files: { agents: 'src/good/AGENTS.md', claude: 'src/good/CLAUDE.md' },
      architecture_module: 'docs/architecture/modules/good/good.md',
      workstream_dir: 'tasks/workstreams/good/good',
      lsp_profile: 'typescript-lsp',
      verification_hints: ['bun test'],
    };

    function seedRegistry(cwd: string, version: unknown, capability: Record<string, unknown>): void {
      write(cwd, 'src/good/f.ts', 'export const good = true;\n');
      write(cwd, '.ai/context/capabilities.json', JSON.stringify({ version, capabilities: [capability] }));
      installCanonicalValidator(cwd);
      commitFixture(cwd, 'seed registry parity fixture');
    }

    test('a fully valid registry passes both state resolution and capability-resolver.ts validate', () => {
      withRepo((cwd) => {
        seedRegistry(cwd, 1, validCapability);
        const state = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['src/good/f.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).not.toContain('capability_registry:invalid');

        const canonical = runCanonicalValidate(cwd);
        expect(canonical.status).toBe(0);
        expect(canonical.errors).toEqual([]);
      });
    });

    test('version !== 1 fails closed on both sides', () => {
      withRepo((cwd) => {
        seedRegistry(cwd, 2, validCapability);
        const state = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['src/good/f.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).toContain('capability_registry:invalid');

        const canonical = runCanonicalValidate(cwd);
        expect(canonical.status).not.toBe(0);
      });
    });

    test('an empty (post-trim) id fails closed on both sides', () => {
      withRepo((cwd) => {
        seedRegistry(cwd, 1, { ...validCapability, id: '  ' });
        const state = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['src/good/f.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).toContain('capability_registry:invalid');
        expect(state.profile_reasons).toContain('capability:registry:malformed-entries:1');

        const canonical = runCanonicalValidate(cwd);
        expect(canonical.status).not.toBe(0);
        expect(canonical.errors.some((error) => error.includes('id is required'))).toBe(true);
      });
    });

    test('empty prefixes fails closed on both sides', () => {
      withRepo((cwd) => {
        seedRegistry(cwd, 1, { ...validCapability, prefixes: [] });
        const state = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['src/good/f.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).toContain('capability_registry:invalid');
        expect(state.profile_reasons).toContain('capability:registry:malformed-entries:1');

        const canonical = runCanonicalValidate(cwd);
        expect(canonical.status).not.toBe(0);
        expect(canonical.errors.some((error) => error.includes('prefixes must contain at least one path'))).toBe(true);
      });
    });
  });
});
