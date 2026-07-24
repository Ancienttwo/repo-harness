import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { basename, join } from 'path';
import {
  buildStateSnapshot,
  resolveEffectiveState,
} from '../src/effects/state/resolve-effective-state';
import { stateVersionOwnerPath } from '../src/effects/state/git-state-version-store';
import { migrateLegacyActivePlan } from '../src/cli/hook/legacy-active-plan-migration';
import {
  CONTRACT,
  PLAN,
  commitFixture,
  createEffectiveStateFixture,
  resolveFixtureState,
  withRepo,
  writeFixture as write,
} from './state/effective-state-fixture';

describe('effective state resolver', () => {
  test('fails closed when artifact-derived paths escape the repository', () => {
    const cases = [
      {
        name: 'active-plan marker',
        setup(cwd: string, outsidePath: string, outsideRelative: string) {
          writeFileSync(outsidePath, '# Outside plan\n> **Status**: Executing\n- [ ] leak\n');
          write(cwd, '.ai/harness/active-plan', `${outsideRelative}\n`);
        },
        run(cwd: string) { resolveFixtureState(cwd); },
      },
      {
        name: 'contract review header with Win32 traversal',
        setup(cwd: string, outsidePath: string) {
          writeFileSync(outsidePath, '# Outside review\n> **Recommendation**: pass\n');
          const contract = readFileSync(join(cwd, CONTRACT), 'utf-8');
          write(cwd, CONTRACT, contract.replace(
            /^> \*\*Review File\*\*: .*$/m,
            `> **Review File**: \`..\\${basename(outsidePath)}\``,
          ));
        },
        run(cwd: string) { resolveFixtureState(cwd); },
      },
      {
        name: 'active-sprint marker',
        setup(cwd: string, outsidePath: string, outsideRelative: string) {
          writeFileSync(outsidePath, '# Outside sprint\n');
          write(cwd, '.ai/harness/sprint/active-sprint', `${outsideRelative}\n`);
        },
        run(cwd: string) { resolveFixtureState(cwd); },
      },
      {
        name: 'pending draft path',
        setup(cwd: string, outsidePath: string, outsideRelative: string) {
          writeFileSync(outsidePath, '# Outside draft\n> **Status**: Draft\n');
          const pendingPath = join(cwd, '.ai/harness/planning/pending.json');
          write(cwd, '.ai/harness/planning/pending.json', JSON.stringify({
            draft_plan_path: outsideRelative,
          }));
          const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
          utimesSync(pendingPath, old, old);
        },
        run(cwd: string) { buildStateSnapshot(cwd); },
      },
    ] as const;

    const results: Array<{ readonly name: string; readonly failedClosed: boolean; readonly published: boolean }> = [];
    for (const entry of cases) {
      const fixture = createEffectiveStateFixture();
      const outsidePath = join(fixture.cwd, '..', `${basename(fixture.cwd)}-${entry.name.replaceAll(' ', '-')}.md`);
      const outsideRelative = `../${basename(outsidePath)}`;
      try {
        entry.setup(fixture.cwd, outsidePath, outsideRelative);
        let failedClosed = false;
        try {
          entry.run(fixture.cwd);
        } catch {
          failedClosed = true;
        }
        results.push({
          name: entry.name,
          failedClosed,
          published: existsSync(join(fixture.cwd, '.ai/harness/state/effective.json'))
            || existsSync(stateVersionOwnerPath(fixture.cwd)),
        });
      } finally {
        rmSync(outsidePath, { force: true });
        fixture.cleanup();
      }
    }

    expect(results).toEqual(cases.map((entry) => ({
      name: entry.name,
      failedClosed: true,
      published: false,
    })));
  });

  test('fails closed when an in-repo authority path symlinks outside the repository', () => {
    if (process.platform === 'win32') return;
    const fixture = createEffectiveStateFixture();
    const outsidePath = join(fixture.cwd, '..', `${basename(fixture.cwd)}-symlink-plan.md`);
    try {
      writeFileSync(outsidePath, '# Outside plan\n> **Status**: Executing\n- [ ] leak\n');
      const linkedPlan = join(fixture.cwd, 'plans/external-plan.md');
      symlinkSync(outsidePath, linkedPlan);
      write(fixture.cwd, '.ai/harness/active-plan', 'plans/external-plan.md\n');
      expect(() => resolveFixtureState(fixture.cwd)).toThrow('unsafe state source path');
      expect(existsSync(join(fixture.cwd, '.ai/harness/state/effective.json'))).toBe(false);
      expect(existsSync(stateVersionOwnerPath(fixture.cwd))).toBe(false);
    } finally {
      rmSync(outsidePath, { force: true });
      fixture.cleanup();
    }
  });

  test('fails closed when a missing authority path has an external symlink ancestor', () => {
    if (process.platform === 'win32') return;
    const fixture = createEffectiveStateFixture();
    const outsideDirectory = join(fixture.cwd, '..', `${basename(fixture.cwd)}-outside-directory`);
    try {
      mkdirSync(outsideDirectory);
      symlinkSync(outsideDirectory, join(fixture.cwd, 'plans/external'));
      write(fixture.cwd, '.ai/harness/active-plan', 'plans/external/missing.md\n');
      expect(() => resolveFixtureState(fixture.cwd)).toThrow('unsafe state source path');
      expect(existsSync(join(fixture.cwd, '.ai/harness/state/effective.json'))).toBe(false);
      expect(existsSync(stateVersionOwnerPath(fixture.cwd))).toBe(false);
    } finally {
      rmSync(outsideDirectory, { recursive: true, force: true });
      fixture.cleanup();
    }
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
      write(cwd, '.claude/.active-plan', `${PLAN}\n`);
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
      write(cwd, '.claude/.active-plan', `${PLAN}\n`);
      const marker = join(cwd, '.ai/harness/active-plan');
      rmSync(marker);
      mkdirSync(marker);
      expect(() => migrateLegacyActivePlan(cwd)).toThrow();
      expect(readFileSync(join(cwd, '.claude/.active-plan'), 'utf-8')).toContain(PLAN);
    });
  });

  test('blocks approved or executing work under Strict when its contract is missing', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, CONTRACT));
      // Strict's separate_contract requirement is unconditionally required
      // (ArtifactRequirementPolicy), so this state keeps blocking under the
      // profile-aware missing_contract decision.
      const state = resolveFixtureState(cwd, Date.now(), {
        targetPaths: ['src/feature.ts'],
        operationKind: 'feature',
        explicitOverride: 'strict',
      });
      expect(state.workflow_profile).toBe('strict');
      expect(state.phase).toBe('blocked');
      expect(state.blockers).toContain('missing_contract');
      expect(state.next_action).toBe('resolve blockers');
    });
  });

  test('allows approved or executing work under Standard when its contract is missing', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, CONTRACT));
      // Default fixture risk input (targetPaths + operationKind: 'feature',
      // no explicit override) naturally resolves to Standard. Standard's
      // separate_contract requirement defaults to not_required, so the
      // profile-aware decision no longer pushes missing_contract.
      const state = resolveFixtureState(cwd);
      expect(state.workflow_profile).toBe('standard');
      expect(state.blockers).not.toContain('missing_contract');
      expect(state.phase).not.toBe('blocked');
    });
  });

  test('allows approved or executing work under Lite when its contract is missing', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, CONTRACT));
      // Lite's edit matrix cell carries no separate_contract entry at all
      // (ArtifactRequirementPolicy) -- the absent-entry path, distinct from
      // Standard's explicit not_required entry.
      const state = resolveFixtureState(cwd, Date.now(), {
        targetPaths: ['src/feature.ts'],
        operationKind: 'edit',
      });
      expect(state.workflow_profile).toBe('lite');
      expect(state.blockers).not.toContain('missing_contract');
      expect(state.phase).not.toBe('blocked');
    });
  });

  test('fails closed with missing_contract when the workflow profile cannot be resolved', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, CONTRACT));
      // Requesting Lite while real signals (operationKind: 'feature') compute
      // a Standard risk floor is rejected outright (PROFILE_BELOW_RISK_FLOOR,
      // riskResolution.ok === false) rather than silently downgraded. The
      // profile-aware missing_contract decision must fail closed on any
      // unresolved profile, not just the "signals unavailable" case.
      const state = resolveFixtureState(cwd, Date.now(), {
        targetPaths: ['src/feature.ts'],
        operationKind: 'feature',
        explicitOverride: 'lite',
      });
      expect(state.workflow_profile).toBeNull();
      expect(state.blockers).toContain('missing_contract');
      expect(state.phase).toBe('blocked');
    });
  });

  test('rewriting handoff and resume advances only projection and state revision, never authority, subject, evidence, or the progress token', () => {
    withRepo((cwd) => {
      const first = resolveFixtureState(cwd);

      // Handoff/resume are gitignored by the fixture AND excluded from the
      // review-subject scan (isOperationalReviewPath), so rewriting them is
      // pure projection churn with zero side effect on any other bucket --
      // no commit needed, which also means target_rev (an ingredient of
      // subject_revision) cannot move as a side effect of this rewrite.
      write(cwd, '.ai/harness/handoff/current.md', '# Handoff\nrewritten body\n');
      write(cwd, '.ai/harness/handoff/resume.md', '# Resume\nrewritten body\n');

      const second = resolveFixtureState(cwd);

      expect(second.projection_revision).not.toBe(first.projection_revision);
      expect(second.state_revision).not.toBe(first.state_revision);
      expect(second.state_version).toBe(first.state_version + 1);
      expect(second.authority_revision).toBe(first.authority_revision);
      expect(second.subject_revision).toBe(first.subject_revision);
      expect(second.evidence_revision).toBe(first.evidence_revision);
      expect(second.progress_token).toBe(first.progress_token);
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

    test('absolute target paths outside the repo do not invalidate a valid registry', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({ version: 1, capabilities: [] }));
        const state = resolveFixtureState(cwd, Date.now(), {
          targetPaths: ['/home/user/.pi/agent/extensions/bridge.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).not.toContain('capability_registry:invalid');
        expect(state.profile_reasons).not.toContain('capability:registry:invalid');
        expect(state.profile_reasons).toContain('capability:out-of-repo:1');
        expect(state.phase).not.toBe('blocked');
      });
    });

    test('a mixed batch keeps in-repo unmapped accounting alongside out-of-repo paths', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({ version: 1, capabilities: [] }));
        const state = resolveFixtureState(cwd, Date.now(), {
          targetPaths: ['src/feature.ts', '/home/user/.pi/agent/extensions/bridge.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).not.toContain('capability_registry:invalid');
        expect(state.profile_reasons).toContain('capability:unmapped:1');
        expect(state.profile_reasons).toContain('capability:out-of-repo:1');
      });
    });

    test('in-repo traversal paths still fail closed as invalid', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({ version: 1, capabilities: [] }));
        const state = resolveFixtureState(cwd, Date.now(), {
          targetPaths: ['../escape.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).toContain('capability_registry:invalid');
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

    test('registry and policy changes advance the state revision, durable version, and authority revision', () => {
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
        // The registry is part of the authority bucket now (LSC-04): an
        // invalid registry moves authority_revision (a new capability hash
        // ingredient). Note: this fixture commits every step directly onto
        // the same branch used as the review target, so subject_revision
        // (bound to target_rev) legitimately moves on every commit too --
        // that is a property of this single-branch fixture's git shape, not
        // of the authority/subject partition, so it is intentionally not
        // asserted either way here (see the projection-only isolation test
        // above, and the pure-projector progress_token test, for the actual
        // bucket-isolation proof without this confound).
        expect(second.authority_revision).not.toBe(first.authority_revision);

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
        // Policy is a pure authority ingredient: authority_revision moves,
        // and the still-invalid registry contributes the same blocker set as
        // `second` (policy adds no new blocker).
        expect(third.authority_revision).not.toBe(second.authority_revision);
        expect(third.blockers).toEqual(second.blockers);
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

});
