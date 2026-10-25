import { describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import {
  buildStateSnapshot,
  resolveEffectiveState,
} from '../src/effects/state/resolve-effective-state';
import { stateVersionOwnerPath } from '../src/effects/state/git-state-version-store';
import { projectEffectiveStateSessionSection } from '../src/cli/hook/session-context';
import type { EffectiveState } from '../src/core/state/types';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';
import {
  CONTRACT,
  PLAN,
  commitFixture,
  createEffectiveStateFixture,
  effectiveStateCliRiskArgs,
  resolveFixtureState,
  runStateCli,
  withRepo,
  writeFixture as write,
} from './state/effective-state-fixture';

describe('effective state ignores the retired task chain', () => {
  test('contract, review, sprint and check records cannot change task authority', () => {
    withRepo(cwd => {
      const before = resolveFixtureState(cwd);
      write(cwd, CONTRACT, '> **Plan**: plans/other.md\n> **Workflow Profile**: high\n> **Review File**: ../outside.md\n');
      write(cwd, '.ai/harness/sprint/active-sprint', '../outside.md\n');
      write(cwd, '.ai/harness/checks/latest.json', '{"status":"failed"}');
      const after = resolveFixtureState(cwd);
      expect(after.authority_revision).toBe(before.authority_revision);
      expect(after.workflow_profile).toBe(before.workflow_profile);
      expect(after.blockers).toEqual(before.blockers);
      for (const field of ['contract', 'review', 'external_acceptance', 'verification', 'checks', 'readiness', 'active_sprint', 'allowed_paths', 'task_profile', 'evidence_revision']) {
        expect(Object.hasOwn(after, field)).toBe(false);
      }
      expect(after.source_hashes[CONTRACT]).toBeUndefined();
      expect(after.source_hashes['.ai/harness/sprint/active-sprint']).toBeUndefined();
      expect(existsSync(join(cwd, '.ai/harness/runs'))).toBe(false);
      expect(projectEffectiveStateSessionSection(after).content).not.toContain('missing_contract');
    });
  });
});

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
          published: existsSync(stateVersionOwnerPath(fixture.cwd)),
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
  }, 30_000);

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
      expect(existsSync(stateVersionOwnerPath(fixture.cwd))).toBe(false);
    } finally {
      rmSync(outsidePath, { force: true });
      fixture.cleanup();
    }
  }, 30_000);

  test('fails closed when a missing authority path has an external symlink ancestor', () => {
    if (process.platform === 'win32') return;
    const fixture = createEffectiveStateFixture();
    const outsideDirectory = join(fixture.cwd, '..', `${basename(fixture.cwd)}-outside-directory`);
    try {
      mkdirSync(outsideDirectory);
      symlinkSync(outsideDirectory, join(fixture.cwd, 'plans/external'));
      write(fixture.cwd, '.ai/harness/active-plan', 'plans/external/missing.md\n');
      expect(() => resolveFixtureState(fixture.cwd)).toThrow('unsafe state source path');
      expect(existsSync(stateVersionOwnerPath(fixture.cwd))).toBe(false);
    } finally {
      rmSync(outsideDirectory, { recursive: true, force: true });
      fixture.cleanup();
    }
  }, 30_000);

  test('fails closed when no actual changed or target paths are authoritative', () => {
    withRepo((cwd) => {
      const state = resolveEffectiveState(cwd);
      expect(state.workflow_profile).toBeNull();
      expect(state.risk_floor).toBe('high');
      expect(state.profile_reasons).toContain('risk-floor:high:signals-unavailable');
      expect(state.blockers).toContain('workflow_profile:invalid_risk_input');
      expect(state.phase).toBe('blocked');
    });
  }, 30_000);

  test('steady-state resolution ignores the retired legacy marker', () => {
    withRepo((cwd) => {
      write(cwd, '.claude/.active-plan', 'plans/plan-other.md\n');
      const state = resolveFixtureState(cwd);
      expect(state.authoritative_plan?.path).toBe(PLAN);
      expect(state.conflicting_sources).not.toContain('active_plan_markers');
      expect(state.source_hashes['.claude/.active-plan']).toBeUndefined();
    });
  }, 30_000);

  test('legacy-only marker is not state authority', () => {
    withRepo((cwd) => {
      write(cwd, '.claude/.active-plan', `${PLAN}\n`);
      rmSync(join(cwd, '.ai/harness/active-plan'));
      expect(resolveEffectiveState(cwd, Date.now(), { targetPaths: ['src/index.ts'] }).authoritative_plan).toBeNull();
    });
  }, 30_000);

  test('high-risk work needs no contract stage approval', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, CONTRACT));
      const state = resolveFixtureState(cwd, Date.now(), {
        targetPaths: ['src/feature.ts'],
        operationKind: 'feature',
        explicitOverride: 'high',
      });
      expect(state.workflow_profile).toBe('high');
      expect(state.phase).toBe('executing');
      expect(state.blockers).not.toContain('missing_contract');
    });
  }, 30_000);

  test('allows approved or executing work under Standard when its contract is missing', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, CONTRACT));
      const state = resolveFixtureState(cwd);
      expect(state.workflow_profile).toBe('routine');
      expect(state.blockers).not.toContain('missing_contract');
      expect(state.phase).not.toBe('blocked');
    });
  }, 30_000);

  test('allows approved or executing work under Lite when its contract is missing', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, CONTRACT));
      const state = resolveFixtureState(cwd, Date.now(), {
        targetPaths: ['src/feature.ts'],
        operationKind: 'edit',
      });
      expect(state.workflow_profile).toBe('routine');
      expect(state.blockers).not.toContain('missing_contract');
      expect(state.phase).not.toBe('blocked');
    });
  }, 30_000);

  test('rejects a below-floor profile without inventing a missing-contract blocker', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, CONTRACT));
      const state = resolveFixtureState(cwd, Date.now(), {
        targetPaths: ['src/security/policy.ts'],
        operationKind: 'feature',
        explicitOverride: 'routine',
      });
      expect(state.workflow_profile).toBeNull();
      expect(state.blockers).not.toContain('missing_contract');
      expect(state.phase).toBe('blocked');
    });
  }, 30_000);

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
      expect(second.progress_token).toBe(first.progress_token);
    });
  }, 30_000);

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
    }, 30_000);

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
    }, 30_000);

    test('corrupt registry JSON fails closed with a structured blocker instead of a silent capabilityCount=0', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', '{not json');
        const state = resolveFixtureState(cwd);
        expect(state.blockers).toContain('capability_registry:invalid');
      });
    }, 30_000);

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
    }, 30_000);

    test('a mixed batch keeps in-repo unowned accounting alongside out-of-repo paths', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({ version: 1, capabilities: [] }));
        const state = resolveFixtureState(cwd, Date.now(), {
          targetPaths: ['src/feature.ts', '/home/user/.pi/agent/extensions/bridge.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).not.toContain('capability_registry:invalid');
        expect(state.profile_reasons).toContain('capability:unowned:1');
        expect(state.profile_reasons).toContain('capability:unowned-path:src/feature.ts');
        expect(state.profile_reasons).toContain('capability:out-of-repo:1');
        // An unowned path is not a capability (#676 finding 4).
        expect(state.profile_signals?.capabilityCount).toBe(0);
        expect(state.profile_signals?.crossCapability).toBe(false);
        expect(state.risk_floor).toBe('routine');
      });
    }, 30_000);

    test('a mapped repo capability plus an out-of-repo path stays one capability', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({
          version: 1,
          capabilities: [capability('feature-cap', ['src/feature'])],
        }));
        const state = resolveFixtureState(cwd, Date.now(), {
          targetPaths: ['src/feature/index.ts', '/home/user/.pi/agent/extensions/bridge.ts'],
          operationKind: 'edit',
        });
        expect(state.profile_reasons).toContain('capability:out-of-repo:1');
        expect(state.profile_reasons).not.toContain('capability:unowned:1');
        expect(state.profile_signals?.capabilityCount).toBe(1);
        expect(state.profile_signals?.crossCapability).toBe(false);
        expect(state.risk_floor).toBe('routine');
      });
    }, 30_000);

    test('capability_ownership reports ids, module documents and unowned paths from the one ownership answer (#678)', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({
          version: 1,
          capabilities: [capability('feature-cap', ['src/feature'])],
        }));
        const options = { targetPaths: ['src/feature/index.ts', 'src/loose.ts'], operationKind: 'edit' as const };
        const state = resolveFixtureState(cwd, Date.now(), options);
        expect(state.capability_ownership?.capability_ids).toEqual(['feature-cap']);
        expect(state.capability_ownership?.capabilities).toEqual([{
          id: 'feature-cap',
          module_document: 'docs/architecture/modules/fixture/feature-cap.md',
          paths: ['src/feature/index.ts'],
        }]);
        expect(state.capability_ownership?.unowned_paths).toContain('src/loose.ts');
        // The count signal and the ownership field come from the same answer.
        expect(state.profile_signals?.capabilityCount).toBe(state.capability_ownership?.capability_ids.length);

        write(cwd, '.ai/context/capabilities.json', '{not json');
        expect(resolveFixtureState(cwd, Date.now(), options).capability_ownership).toBeNull();
      });
    }, 30_000);

    test('main debt extends owed ownership without changing review or edit risk', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({
          version: 1, capabilities: [capability('past', ['src/past']), capability('current', ['src/current'])],
        }));
        write(cwd, 'docs/architecture/.projection-manifest.json', '{}\n');
        write(cwd, 'src/past/a.ts', 'export const a = 1;\n');
        write(cwd, 'src/current/b.ts', 'export const b = 1;\n');
        commitFixture(cwd, 'projected');
        write(cwd, 'src/current/b.ts', 'export const b = 2;\n');
        const risk = { targetPaths: ['src/current/b.ts'], operationKind: 'edit' as const };
        const before = resolveEffectiveState(cwd, Date.now(), risk);

        write(cwd, 'src/past/a.ts', 'export const a = 2;\n');
        write(cwd, 'src/loose.ts', 'export const loose = 1;\n');
        execFileSync('git', ['add', 'src/past/a.ts', 'src/loose.ts'], { cwd });
        execFileSync('git', ['commit', '-qm', 'past owned and unowned debt'], { cwd });
        const after = resolveEffectiveState(cwd, Date.now(), risk);
        expect(after.capability_ownership?.capability_ids).toEqual(['current', 'past']);
        expect(after.capability_ownership?.unowned_paths).toEqual(['src/loose.ts']);
        expect(after.capability_ownership?.capabilities).toMatchObject([
          { id: 'current', paths: ['src/current/b.ts'] }, { id: 'past', paths: ['src/past/a.ts'] },
        ]);
        expect(after.capability_ownership?.review_base).toBe(execFileSync('git', ['rev-parse', 'main'], { cwd, encoding: 'utf8' }).trim());
        expect(after.profile_signals).toEqual(before.profile_signals);
        expect(after.profile_signals?.capabilityCount).toBe(1);
        expect(after.workflow_profile).toBe(before.workflow_profile);
        expect(after.risk_floor).toBe(before.risk_floor);
        expect(after.profile_reasons).toEqual(before.profile_reasons);
        expect(after.blockers).toEqual(before.blockers);
        const review = buildReviewSubject(cwd, { targetRef: 'main' });
        expect(review.status).toBe('ok');
        expect(review.paths).toEqual(['src/current/b.ts']);
        expect(after.source_hashes.review_subject).toBe(review.review_subject_sha256);

        const declared = resolveEffectiveState(cwd, Date.now(), { ...risk, capabilityIds: ['declared'] });
        expect(declared.profile_signals?.capabilityCount).toBe(1);
        expect(declared.capability_ownership).toBeNull();
      });
    }, 30_000);

    test('a NUL-bearing absolute path fails canonical validation instead of bypassing it', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({ version: 1, capabilities: [] }));
        const state = resolveFixtureState(cwd, Date.now(), {
          targetPaths: ['/home/user/.pi/agent/bri\0dge.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).toContain('capability_registry:invalid');
        expect(state.profile_reasons).toContain('capability:registry:invalid');
        expect(state.profile_reasons).not.toContain('capability:out-of-repo:1');
      });
    }, 30_000);

    test('an invalid registry does not also count out-of-repo paths as unowned', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', '{not json');
        const state = resolveFixtureState(cwd, Date.now(), {
          targetPaths: ['/home/user/.pi/agent/extensions/bridge.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).toContain('capability_registry:invalid');
        expect(state.profile_reasons).toContain('capability:out-of-repo:1');
        expect(state.profile_reasons).not.toContain('capability:unowned:1');
      });
    }, 30_000);

    test('in-repo traversal paths still fail closed as invalid', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/context/capabilities.json', JSON.stringify({ version: 1, capabilities: [] }));
        const state = resolveFixtureState(cwd, Date.now(), {
          targetPaths: ['../escape.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).toContain('capability_registry:invalid');
      });
    }, 30_000);

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
    }, 30_000);

    test('a corrupt policy.json fails closed before version publication', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/harness/policy.json', 'not json{{{');
        expect(() => resolveFixtureState(cwd)).toThrow();
        expect(existsSync(stateVersionOwnerPath(cwd))).toBe(false);
      });
    }, 30_000);

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
          expect(existsSync(stateVersionOwnerPath(cwd))).toBe(false);
        });
      }, 30_000);
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
          expect(existsSync(stateVersionOwnerPath(cwd))).toBe(false);
        });
      }, 30_000);
    }

    test('a valid registry with no matching prefix produces no blocker but records the unowned reason', () => {
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
        expect(state.profile_reasons).toContain('capability:unowned:1');
        expect(state.profile_reasons).toContain('capability:unowned-path:src/feature.ts');
      });
    }, 30_000);

    // archctx 0.8.1 resolve needs a complete native model, so the manifest comes with the policy.
    function writeArchcontextAuthority(cwd: string): void {
      write(cwd, '.ai/harness/policy.json', JSON.stringify({ context: { capability_source: 'archcontext' } }));
      write(cwd, '.archcontext/manifest.yaml', 'schemaVersion: archcontext.manifest/v1\nmodel:\n  layout: split\n  root: .archcontext/model\n');
    }

    function seedArchcontextCapability(cwd: string, source = ['  include:', '    - src/**', '  exclude:', '    - src/generated/**']): void {
      writeArchcontextAuthority(cwd);
      write(cwd, '.archcontext/model/nodes/capability.fixture.feature.yaml', [
        'schemaVersion: archcontext.node/v2',
        'id: capability.fixture.feature',
        'kind: capability',
        'name: Feature',
        'status: active',
        'summary: Fixture feature',
        'responsibilities:',
        '  - Own the feature sources',
        'source:',
        ...source,
        'extensions:',
        '  contractFiles:',
        '    agents: AGENTS.md',
        '    claude: CLAUDE.md',
        '  lspProfile: typescript-lsp',
        '  verification: []',
        '',
      ].join('\n'));
      commitFixture(cwd, 'seed archcontext capability');
    }

    test('an ambiguous owed-only path does not block or inflate current edit risk', () => {
      withRepo((cwd) => {
        seedArchcontextCapability(cwd, ['  include:', '    - src/current/**']);
        for (const name of ['left', 'right']) {
          write(cwd, `.archcontext/model/nodes/capability.past.${name}.yaml`, JSON.stringify({
            schemaVersion: 'archcontext.node/v2', id: `capability.past.${name}`, kind: 'capability',
            name, status: 'active', summary: 'Own the past source.', responsibilities: ['Own past source.'],
            source: { include: ['src/past/**'] },
            extensions: { contractFiles: { agents: 'AGENTS.md', claude: 'CLAUDE.md' }, lspProfile: 'typescript-lsp', verification: [] },
          }));
        }
        write(cwd, 'docs/architecture/.projection-manifest.json', '{}\n');
        write(cwd, 'src/past/a.ts', 'export const a = 1;\n');
        write(cwd, 'src/current/b.ts', 'export const b = 1;\n');
        commitFixture(cwd, 'projected');
        const risk = { targetPaths: ['src/current/b.ts'], operationKind: 'edit' as const };
        const before = resolveEffectiveState(cwd, Date.now(), risk);
        write(cwd, 'src/past/a.ts', 'export const a = 2;\n');
        commitFixture(cwd, 'commit ambiguous past debt');
        const after = resolveEffectiveState(cwd, Date.now(), risk);
        expect(after.capability_ownership).toBeNull();
        expect(after.profile_signals).toEqual(before.profile_signals);
        expect(after.profile_signals?.capabilityCount).toBe(1);
        expect(after.profile_reasons).toEqual(before.profile_reasons);
        expect(after.blockers).toEqual(before.blockers);
        expect(after.blockers).not.toContain('capability_registry:invalid');

        // The same error must still block when the current edit selects that path.
        const selected = resolveEffectiveState(cwd, Date.now(), { ...risk, targetPaths: ['src/past/a.ts'] });
        expect(selected.blockers).toContain('capability_registry:invalid');
        expect(selected.profile_reasons).toContain('capability:diagnostic:AMBIGUOUS_MATCH');
      });
    }, 60_000);

    test('an owed-only runtime failure does not become a workflow-only risk blocker', () => {
      withRepo((cwd) => {
        seedArchcontextCapability(cwd);
        write(cwd, 'docs/architecture/.projection-manifest.json', '{}\n');
        write(cwd, 'src/a.ts', 'export const a = 1;\n');
        commitFixture(cwd, 'projected');
        const risk = { targetPaths: ['docs/guide.md'], operationKind: 'edit' as const };
        const before = resolveEffectiveState(cwd, Date.now(), risk);
        write(cwd, 'src/a.ts', 'export const a = 2;\n');
        commitFixture(cwd, 'committed main debt');
        const previous = process.env.REPO_HARNESS_NODE_BIN;
        process.env.REPO_HARNESS_NODE_BIN = join(cwd, '.ai/harness/policy.json');
        try {
          const after = resolveEffectiveState(cwd, Date.now(), risk);
          expect(after.capability_ownership).toBeNull();
          expect(after.profile_signals).toEqual(before.profile_signals);
          expect(after.profile_reasons).toEqual(before.profile_reasons);
          expect(after.blockers).toEqual(before.blockers);
        } finally {
          if (previous === undefined) delete process.env.REPO_HARNESS_NODE_BIN;
          else process.env.REPO_HARNESS_NODE_BIN = previous;
        }
      });
    }, 60_000);

    test('archcontext ownership comes from archctx resolve, including source.exclude', () => {
      withRepo((cwd) => {
        seedArchcontextCapability(cwd);
        const state = resolveEffectiveState(cwd, Date.now(), {
          targetPaths: ['src/feature.ts', 'src/generated/out.ts'],
          operationKind: 'edit',
        });
        expect(state.blockers).not.toContain('capability_registry:invalid');
        expect(state.profile_reasons).toContain('capability:unowned:1');
        expect(state.profile_reasons).toContain('capability:unowned-path:src/generated/out.ts');
      });
    }, 60_000);

    test('archcontext ownership is not reused after a target path turns into a directory', () => {
      withRepo((cwd) => {
        // The exact include owns the file; ArchContext gives the directory contents no owner.
        seedArchcontextCapability(cwd, ['  include:', '    - src/thing']);
        write(cwd, 'src/thing', 'file\n');
        commitFixture(cwd, 'add src/thing as a file');
        const options = { targetPaths: ['src/thing'], operationKind: 'edit' as const };
        expect(resolveEffectiveState(cwd, Date.now(), options).profile_reasons).not.toContain('capability:unowned:1');
        rmSync(join(cwd, 'src/thing'));
        write(cwd, 'src/thing/inner.ts', 'export {};\n');
        commitFixture(cwd, 'turn src/thing into a directory');
        expect(resolveEffectiveState(cwd, Date.now(), options).profile_reasons).toContain('capability:unowned:1');
      });
    }, 60_000);

    test('archcontext ownership fails closed when archctx cannot run', () => {
      withRepo((cwd) => {
        seedArchcontextCapability(cwd);
        const previous = process.env.REPO_HARNESS_NODE_BIN;
        // A non-executable runtime makes the package-local archctx unavailable.
        process.env.REPO_HARNESS_NODE_BIN = join(cwd, '.ai/harness/policy.json');
        try {
          const state = resolveEffectiveState(cwd, Date.now(), {
            targetPaths: ['src/feature.ts'],
            operationKind: 'edit',
          });
          // A runtime failure is not a model fault, so it has its own key (#676 finding 1).
          expect(state.blockers).toEqual(['capability_ownership:unavailable']);
          expect(state.profile_reasons).toContain('capability:ownership:unavailable');
          expect(state.profile_reasons).toContain('capability:diagnostic:ARCHCONTEXT_RESOLVE_FAILED');
          expect(state.profile_reasons).not.toContain('capability:registry:invalid');
        } finally {
          if (previous === undefined) delete process.env.REPO_HARNESS_NODE_BIN;
          else process.env.REPO_HARNESS_NODE_BIN = previous;
        }
      });
    }, 60_000);

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
    }, 30_000);

    test('an unowned implementation path is reported by path and does not count as a second capability', () => {
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
        expect(state.profile_reasons).toContain('capability:unowned:1');
        expect(state.profile_reasons).toContain('capability:unowned-path:src/unmapped/b.ts');
        expect(state.profile_reasons).not.toContain('risk-floor:high:cross-capability');
        expect(state.profile_signals?.capabilityCount).toBe(1);
        expect(state.profile_signals?.crossCapability).toBe(false);
        expect(state.risk_floor).toBe('routine');
        expect(state.blockers).not.toContain('capability_registry:invalid');
      });
    }, 30_000);

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
        expect(state.profile_reasons).not.toContain('capability:unowned:1');
        expect(state.profile_signals?.capabilityCount).toBe(0);
      });
    }, 30_000);

    describe('blocker causes reach state resolve --json and the SessionStart section (#676)', () => {
      function archcontextNode(id: string, include: string, extra: readonly string[] = ['summary: Fixture capability']): string {
        return [
          'schemaVersion: archcontext.node/v2',
          `id: ${id}`,
          'kind: capability',
          `name: ${id}`,
          'status: active',
          ...extra,
          'responsibilities:',
          '  - Own the fixture sources',
          'source:',
          '  include:',
          `    - "${include}"`,
          'extensions:',
          '  contractFiles:',
          '    agents: AGENTS.md',
          '    claude: CLAUDE.md',
          '  lspProfile: typescript-lsp',
          '  verification: []',
          '',
        ].join('\n');
      }

      function expectCause(cwd: string, targetPath: string, cause: { key: string; reason: string; code: string; fix: string; message: string }): void {
        const risk = { targetPaths: [targetPath], operationKind: 'edit' as const };
        const cli = runStateCli(cwd, ['state', 'resolve', '--json', ...effectiveStateCliRiskArgs(risk)]);
        expect(cli.status, cli.stderr).toBe(1);
        const state = JSON.parse(cli.stdout) as EffectiveState;
        expect(state.blockers).toEqual([cause.key]);
        expect(state.profile_reasons).toContain(cause.reason);
        expect(state.profile_reasons).toContain(`capability:diagnostic:${cause.code}`);
        expect(state.next_action).toStartWith(`resolve blockers: ${cause.key} ${cause.code}: `);
        expect(state.next_action).toContain(cause.message);
        expect(state.next_action).toEndWith(`; fix: ${cause.fix}`);

        const session = projectEffectiveStateSessionSection(state)?.content ?? '';
        expect(session).toContain(cause.key);
        expect(session).toContain(`fix: ${cause.fix}`);
      }

      test('an unparseable JSON registry names INVALID_JSON and the validate command', () => {
        withRepo((cwd) => {
          write(cwd, '.ai/context/capabilities.json', '{not json');
          commitFixture(cwd, 'seed invalid registry');
          expectCause(cwd, 'src/feature.ts', {
            key: 'capability_registry:invalid',
            reason: 'capability:registry:invalid',
            code: 'INVALID_JSON',
            message: 'invalid JSON',
            fix: 'repo-harness run capability-resolver validate',
          });
        });
      }, 60_000);

      test('a duplicate-key archcontext node names its model diagnostic and the repair command', () => {
        withRepo((cwd) => {
          writeArchcontextAuthority(cwd);
          write(cwd, '.archcontext/model/nodes/capability.fixture.feature.yaml', archcontextNode('capability.fixture.feature', 'src/**', ['summary: First summary', 'summary: Duplicate summary']));
          commitFixture(cwd, 'seed node with duplicate key');
          expectCause(cwd, 'src/feature.ts', {
            key: 'capability_registry:invalid',
            reason: 'capability:registry:invalid',
            code: 'ARCHCONTEXT_MODEL_REJECTED',
            message: 'archctx resolve rejected the model',
            fix: 'edit .archcontext/model/nodes, then run repo-harness run capability-resolver match --path <path>',
          });
        });
      }, 60_000);

      test('an archctx runtime failure uses the unavailable key and names the update command', () => {
        withRepo((cwd) => {
          seedArchcontextCapability(cwd);
          const previous = process.env.REPO_HARNESS_NODE_BIN;
          // A non-executable runtime makes the package-local archctx unavailable.
          process.env.REPO_HARNESS_NODE_BIN = join(cwd, '.ai/harness/policy.json');
          try {
            expectCause(cwd, 'src/feature.ts', {
              key: 'capability_ownership:unavailable',
              reason: 'capability:ownership:unavailable',
              code: 'ARCHCONTEXT_RESOLVE_FAILED',
              message: 'REPO_HARNESS_NODE_BIN',
              fix: 'repo-harness update',
            });
          } finally {
            if (previous === undefined) delete process.env.REPO_HARNESS_NODE_BIN;
            else process.env.REPO_HARNESS_NODE_BIN = previous;
          }
        });
      }, 90_000);

      test('an ambiguous owner without an owning capability names the candidates and the match command', () => {
        withRepo((cwd) => {
          writeArchcontextAuthority(cwd);
          write(cwd, '.archcontext/model/nodes/capability.shared.left.yaml', archcontextNode('capability.shared.left', 'src/**'));
          write(cwd, '.archcontext/model/nodes/capability.shared.right.yaml', archcontextNode('capability.shared.right', 'src/**'));
          commitFixture(cwd, 'seed two capabilities with one include');
          expectCause(cwd, 'src/feature.ts', {
            key: 'capability_registry:invalid',
            reason: 'capability:registry:invalid',
            code: 'AMBIGUOUS_MATCH',
            message: 'capability.shared.left, capability.shared.right',
            fix: 'repo-harness run capability-resolver match --path src/feature.ts',
          });
        });
      }, 90_000);
    });
  });

});

describe('effective state resolution cost (#770)', () => {
  test('one resolution in an idle repository spawns at most 8 git processes', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-git-count-')));
    const cwd = join(root, 'repo');
    const bin = join(root, 'bin');
    const log = join(root, 'git.log');
    const previousPath = process.env.PATH;
    try {
      mkdirSync(cwd);
      mkdirSync(bin);
      writeFileSync(join(cwd, 'README.md'), '# idle\n');
      const gitEnv = { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' };
      for (const args of [
        ['init', '-b', 'main'],
        ['config', 'user.email', 'fixture@example.com'],
        ['config', 'user.name', 'Fixture'],
        ['add', '.'],
        ['commit', '-m', 'idle fixture'],
      ]) {
        const git = spawnSync('git', args, { cwd, encoding: 'utf-8', env: gitEnv });
        if (git.status !== 0) throw new Error(git.stderr);
      }
      const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf-8' }).stdout.trim();
      expect(realGit).not.toBe('');
      writeFileSync(join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexec '${realGit}' "$@"\n`);
      chmodSync(join(bin, 'git'), 0o755);
      process.env.PATH = `${bin}:${previousPath ?? ''}`;
      const state = resolveEffectiveState(cwd, Date.now());
      expect(state.phase).toBe('idle');
      const calls = existsSync(log) ? readFileSync(log, 'utf-8').trimEnd().split('\n') : [];
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.length).toBeLessThanOrEqual(8);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
