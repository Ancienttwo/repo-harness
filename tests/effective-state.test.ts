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
import { revokeUserWaiverGrant } from '../scripts/acceptance-receipt';
import { executeVerificationContract } from '../src/effects/evidence/verification-execution';
import {
  buildStateSnapshot,
  resolveEffectiveState,
} from '../src/effects/state/resolve-effective-state';
import { stateVersionOwnerPath } from '../src/effects/state/git-state-version-store';
import { projectEffectiveStateSessionSection } from '../src/cli/hook/session-context';
import { runMutationGuard } from '../src/cli/hook/mutation-guard';
import { createStateInputCollector } from '../src/effects/loop/state-input-collector';
import { hookIdentity } from './helpers/hook-identity';
import type { EffectiveState } from '../src/core/state/types';
import {
  CONTRACT,
  PLAN,
  commitFixture,
  createEffectiveStateFixture,
  effectiveStateCliRiskArgs,
  makeFreshEvidence,
  nativeVerificationPlan,
  resolveFixtureState,
  runStateCli,
  withRepo,
  writeFixture as write,
} from './state/effective-state-fixture';

describe('native effective-state evidence', () => {
  test('reads executed facts and refuses a revoked user waiver', () => {
    withRepo(cwd => {
      makeFreshEvidence(cwd, Date.now());
      const fresh = resolveFixtureState(cwd);
      expect(fresh.checks.path).toBeNull();
      expect(fresh.checks.status).toBe('passed');
      expect(fresh.checks.freshness).toBe('fresh');
      expect(fresh.checks.result_refs?.[0]?.run_file).toStartWith('.ai/harness/runs/');
      expect(fresh.external_acceptance.freshness).toBe('fresh');
      expect(fresh.external_acceptance.status).toBe('user_waiver');
      revokeUserWaiverGrant({ root: cwd, authorityHome: process.env.HOME! });
      const revoked = resolveFixtureState(cwd);
      expect(revoked.checks.freshness).toBe('fresh');
      expect(revoked.external_acceptance.freshness).toBe('stale');
      expect(revoked.evidence_revision).not.toBe(fresh.evidence_revision);
      expect(revoked.authority_revision).toBe(fresh.authority_revision);
    });
  });

  test('missing, empty, and malformed plans remain non-passing observations', () => {
    withRepo(cwd => {
      const original = readFileSync(join(cwd, CONTRACT), 'utf8');
      const missing = resolveFixtureState(cwd);
      expect(missing.checks.status).toBe('missing');
      expect(missing.checks.reason).toBe('missing_plan');
      expect(missing.checks.freshness).toBe('missing');
      write(cwd, CONTRACT, original + '\n## Verification Plan\n\n```json\n{"protocol":1,"checks":[]}\n```\n');
      const empty = resolveFixtureState(cwd);
      expect(empty.checks.status).toBe('missing');
      expect(empty.checks.reason).toBe('empty_plan');
      expect(empty.checks.freshness).toBe('missing');
      write(cwd, CONTRACT, original + '\n## Verification Plan\n\n```json\n{"protocol":1,"checks":"bad"}\n```\n');
      const malformed = resolveFixtureState(cwd);
      expect(malformed.checks.freshness).toBe('unavailable');
      expect(malformed.checks.status).toBeNull();
      expect(malformed.checks.reason).toContain('VerificationPlanValidationError');
      expect(existsSync(join(cwd, '.ai/harness/evidence/events/log.jsonl'))).toBe(false);
      expect(existsSync(join(cwd, '.ai/harness/runs'))).toBe(false);
      expect(existsSync(join(cwd, '.ai/harness/checks/latest.json'))).toBe(false);
    });
  });

  test('tree churn, plan relation, and direct assessment changes cannot preserve fresh evidence', () => {
    withRepo(cwd => {
      makeFreshEvidence(cwd, Date.now());
      const original = readFileSync(join(cwd, CONTRACT), 'utf8');
      const fresh = resolveFixtureState(cwd);
      write(cwd, 'feature.txt', 'unverified\n');
      const churned = resolveFixtureState(cwd);
      expect(churned.checks.freshness).toBe('missing');
      expect(churned.external_acceptance.freshness).not.toBe('fresh');
      expect(churned.evidence_revision).not.toBe(fresh.evidence_revision);
      write(cwd, 'feature.txt', 'fixture\n');
      write(cwd, CONTRACT, original.replace(`> **Plan**: ${PLAN}`, '> **Plan**: plans/plan-other.md'));
      const mismatch = resolveFixtureState(cwd);
      expect(mismatch.blockers).toContain('conflict:contract_plan_relationship');
      expect(mismatch.checks.freshness).toBe('stale');
      write(cwd, CONTRACT, original);
      const assessmentPath = '.ai/harness/checks/change-assessment.latest.json';
      const assessment = JSON.parse(readFileSync(join(cwd, assessmentPath), 'utf8'));
      assessment.selection_packet.target_revision = '0'.repeat(40);
      write(cwd, assessmentPath, JSON.stringify(assessment));
      const stale = resolveFixtureState(cwd);
      expect(stale.checks.freshness).toBe('stale');
      expect(stale.external_acceptance.freshness).not.toBe('fresh');
    });
  });

  test('a genuine current failed run remains a negative fact', () => {
    withRepo(cwd => {
      write(cwd, 'feature.txt', 'wrong\n');
      write(cwd, CONTRACT, readFileSync(join(cwd, CONTRACT), 'utf8') + nativeVerificationPlan());
      const result = executeVerificationContract({ repoRoot: cwd, contractPath: CONTRACT });
      expect(result.passed).toBe(false);
      expect(result.status).toBe('failed');
      const state = resolveFixtureState(cwd);
      expect(state.checks.status).toBe('failed');
      expect(state.checks.freshness).toBe('fresh');
      expect(state.blockers).toContain('checks_failed');
      expect(state.external_acceptance.freshness).not.toBe('fresh');
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
      expect(existsSync(join(fixture.cwd, '.ai/harness/state/effective.json'))).toBe(false);
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
      expect(existsSync(join(fixture.cwd, '.ai/harness/state/effective.json'))).toBe(false);
      expect(existsSync(stateVersionOwnerPath(fixture.cwd))).toBe(false);
    } finally {
      rmSync(outsideDirectory, { recursive: true, force: true });
      fixture.cleanup();
    }
  }, 30_000);

  test('fails closed when no actual changed or target paths are authoritative', () => {
    withRepo((cwd) => {
      const state = resolveEffectiveState(cwd);
      expect(state.allowed_paths).toEqual(['src/', 'tests/effective-state.test.ts']);
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
      // Strict's separate_contract requirement is unconditionally required
      // (ArtifactRequirementPolicy), so this state keeps blocking under the
      // profile-aware missing_contract decision.
      const state = resolveFixtureState(cwd, Date.now(), {
        targetPaths: ['src/feature.ts'],
        operationKind: 'feature',
        explicitOverride: 'high',
      });
      expect(state.workflow_profile).toBe('high');
      expect(state.phase).toBe('executing');
      expect(state.blockers).not.toContain('missing_contract');
      expect(state.readiness?.ok && state.readiness.allowedToEdit.decision).toBe('allow');
    });
  }, 30_000);

  test('allows approved or executing work under Standard when its contract is missing', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, CONTRACT));
      // Default fixture risk input (targetPaths + operationKind: 'feature',
      // no explicit override) naturally resolves to Standard. Standard's
      // separate_contract requirement defaults to not_required, so the
      // profile-aware decision no longer pushes missing_contract.
      const state = resolveFixtureState(cwd);
      expect(state.workflow_profile).toBe('routine');
      expect(state.blockers).not.toContain('missing_contract');
      expect(state.phase).not.toBe('blocked');
    });
  }, 30_000);

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
      expect(state.workflow_profile).toBe('routine');
      expect(state.blockers).not.toContain('missing_contract');
      expect(state.phase).not.toBe('blocked');
    });
  }, 30_000);

  test('rejects a below-floor profile without inventing a missing-contract blocker', () => {
    withRepo((cwd) => {
      rmSync(join(cwd, CONTRACT));
      // Requesting Lite while real signals (operationKind: 'feature') compute
      // a Standard risk floor is rejected outright (PROFILE_BELOW_RISK_FLOOR,
      // riskResolution.ok === false) rather than silently downgraded. The
      // profile-aware missing_contract decision must fail closed on any
      // unresolved profile, not just the "signals unavailable" case.
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
      expect(second.evidence_revision).toBe(first.evidence_revision);
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

    test('a corrupt policy.json fails closed before cache/version publication', () => {
      withRepo((cwd) => {
        write(cwd, '.ai/harness/policy.json', 'not json{{{');
        expect(() => resolveFixtureState(cwd)).toThrow();
        expect(existsSync(join(cwd, '.ai/harness/state/effective.json'))).toBe(false);
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
          expect(existsSync(join(cwd, '.ai/harness/state/effective.json'))).toBe(false);
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
          expect(existsSync(join(cwd, '.ai/harness/state/effective.json'))).toBe(false);
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

    function seedArchcontextCapability(cwd: string, source = ['  include:', '    - src/**', '  exclude:', '    - src/generated/**']): void {
      write(cwd, '.ai/harness/policy.json', JSON.stringify({ context: { capability_source: 'archcontext' } }));
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

    describe('blocker causes reach state resolve --json and the hook output (#676)', () => {
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

        const guard = runMutationGuard({
          collector: createStateInputCollector({
            repoRoot: cwd,
            resolveEffectiveState: (targetPaths) => ({
              ok: true,
              state: resolveEffectiveState(cwd, Date.now(), { targetPaths, operationKind: 'edit' }),
            }),
          }),
          payload: { tool_input: { file_path: targetPath } },
          identity: hookIdentity(),
        });
        expect(guard.exitCode).toBe(0);
        expect(guard.stdout).toContain(`[WorkflowObservation] ${cause.key}; edit may continue.`);
        expect(guard.stdout).toContain(`  Next: resolve blockers: ${cause.key} ${cause.code}: `);
        expect(guard.stdout).toContain(cause.message);
        expect(guard.stdout).toContain(`fix: ${cause.fix}`);
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

      test('an invalid archcontext node names its node diagnostic and the validate command', () => {
        withRepo((cwd) => {
          write(cwd, '.ai/harness/policy.json', JSON.stringify({ context: { capability_source: 'archcontext' } }));
          write(cwd, '.archcontext/model/nodes/capability.fixture.feature.yaml', archcontextNode('capability.fixture.feature', 'src/**', []));
          commitFixture(cwd, 'seed node without summary');
          expectCause(cwd, 'src/feature.ts', {
            key: 'capability_registry:invalid',
            reason: 'capability:registry:invalid',
            code: 'ARCHCONTEXT_NODE_SUMMARY_INVALID',
            message: 'summary is required',
            fix: 'repo-harness run capability-resolver validate',
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
          write(cwd, '.ai/harness/policy.json', JSON.stringify({ context: { capability_source: 'archcontext' } }));
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
