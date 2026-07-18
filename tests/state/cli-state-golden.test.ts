import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn, spawnSync } from 'child_process';
import {
  resolveEffectiveState,
} from '../../src/effects/state/resolve-effective-state';
import type { EffectiveState, EffectiveStateRiskInput, StateSnapshot } from '../../src/core/state/types';
import {
  CONTRACT,
  HOOK_ENTRY,
  PLAN,
  REVIEW,
  commitFixture,
  createEffectiveStateFixture,
  replaceContractProfile,
  resolveFixtureState,
  runStateCli,
  writeFixture,
  writeFixtureStateLock,
} from './effective-state-fixture';

const BASELINE = '82550779cdccf0575d674ae53bbc95ba63e44743';
const FIXTURES = join(import.meta.dir, 'fixtures');

interface Scenario {
  readonly name: string;
  readonly risk: EffectiveStateRiskInput;
  readonly cliRiskArgs: readonly string[];
  readonly setup?: (cwd: string) => void;
}

interface GoldenRecord {
  readonly baseline: string;
  readonly scenario: string;
  readonly cli_exit: number | null;
  readonly cli_stderr: string;
  readonly field: {
    readonly exit: number | null;
    readonly stdout: string;
    readonly stderr: string;
  };
  readonly state: unknown;
  readonly hook: unknown;
}

function gitHead(cwd: string): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function makeFreshEvidence(cwd: string): void {
  const nowMs = Date.now();
  const initial = resolveFixtureState(cwd, nowMs);
  const subject = initial.source_hashes.review_subject;
  if (!subject) throw new Error('fixture review subject is unavailable');
  const target = gitHead(cwd);
  writeFixture(cwd, REVIEW, [
    '# Review',
    '> **Recommendation**: pass',
    `> **Reviewed Subject SHA256**: ${subject}`,
    `> **Reviewed Target Revision**: ${target}`,
    '## External Acceptance Advice',
    '> **External Acceptance**: pass',
    `> **Reviewed Subject SHA256**: ${subject}`,
    `> **Reviewed Target Revision**: ${target}`,
    '',
  ].join('\n'));
  const reviewed = resolveFixtureState(cwd, nowMs);
  const authorityRevision = reviewed.source_hashes.authority_revision;
  const handoff = [
    '# Handoff',
    '> **Task ID**: 20260712-2327-effective-fixture',
    `> **Source State Revision**: ${authorityRevision}`,
    '- Exact Next Step: implement resolver',
    '',
  ].join('\n');
  writeFixture(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
    status: 'pass',
    active_plan: PLAN,
    review_subject_sha256: subject,
  }));
  writeFixture(cwd, '.ai/harness/handoff/current.md', handoff);
  writeFixture(cwd, '.ai/harness/handoff/resume.md', [
    '# Resume',
    '> **Task ID**: 20260712-2327-effective-fixture',
    `> **Source State Revision**: ${authorityRevision}`,
    `> **Handoff Hash**: ${sha256(handoff)}`,
    '',
  ].join('\n'));
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'idle-inspect',
    risk: { targetPaths: [], operationKind: 'inspect' },
    cliRiskArgs: ['--operation', 'inspect'],
    setup: (cwd) => {
      rmSync(join(cwd, '.ai/harness/active-plan'));
      rmSync(join(cwd, '.claude/.active-plan'));
    },
  },
  {
    name: 'executing-fresh-evidence',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    cliRiskArgs: ['--target-path', 'src/feature.ts', '--operation', 'feature'],
    setup: makeFreshEvidence,
  },
  {
    name: 'missing-contract',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    cliRiskArgs: ['--target-path', 'src/feature.ts', '--operation', 'feature'],
    setup: (cwd) => rmSync(join(cwd, CONTRACT)),
  },
  {
    name: 'foreign-worktree-owner',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    cliRiskArgs: ['--target-path', 'src/feature.ts', '--operation', 'feature'],
    setup: (cwd) => writeFixture(cwd, '.ai/harness/active-worktree', '/tmp/foreign-worktree\n'),
  },
  {
    name: 'stale-projections',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    cliRiskArgs: ['--target-path', 'src/feature.ts', '--operation', 'feature'],
    setup: (cwd) => {
      writeFixture(cwd, '.ai/harness/checks/latest.json', JSON.stringify({
        status: 'pass',
        active_plan: 'plans/plan-old.md',
      }));
      writeFixture(cwd, '.ai/harness/handoff/current.md', '- Active Plan: plans/plan-old.md\n');
      writeFixture(cwd, 'tasks/current.md', [
        '> **Updated At**: 2020-01-01T00:00:00Z',
        '- Active Plan: plans/plan-old.md',
      ].join('\n'));
      writeFixture(cwd, '.ai/harness/sprint/active-sprint', 'plans/sprints/missing.sprint.md\n');
    },
  },
  {
    name: 'invalid-capability-registry',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'edit' },
    cliRiskArgs: ['--target-path', 'src/feature.ts', '--operation', 'edit'],
    setup: (cwd) => {
      writeFixture(cwd, '.ai/context/capabilities.json', '{not json');
      commitFixture(cwd, 'seed invalid capability registry');
    },
  },
  {
    name: 'profile-below-strict-floor',
    risk: { targetPaths: ['src/security/auth.ts'], operationKind: 'security' },
    cliRiskArgs: ['--target-path', 'src/security/auth.ts', '--operation', 'security'],
  },
  {
    name: 'deleted-cache-reconstruction',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    cliRiskArgs: ['--target-path', 'src/feature.ts', '--operation', 'feature'],
    setup: (cwd) => {
      resolveFixtureState(cwd);
      rmSync(join(cwd, '.ai/harness/state/effective.json'));
    },
  },
  {
    name: 'corrupt-cache-reconstruction',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    cliRiskArgs: ['--target-path', 'src/feature.ts', '--operation', 'feature'],
    setup: (cwd) => {
      resolveFixtureState(cwd);
      writeFixture(cwd, '.ai/harness/state/effective.json', '{broken');
    },
  },
  {
    name: 'stale-dead-lock-reclaimed',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    cliRiskArgs: ['--target-path', 'src/feature.ts', '--operation', 'feature'],
    setup: (cwd) => writeFixtureStateLock(cwd, {
      pid: 99999999,
      created_at: Date.now() - 60_000,
      token: '99999999-0-00000000-0000-4000-8000-000000000003',
    }),
  },
  {
    name: 'live-lock-waits-for-release',
    risk: { targetPaths: ['src/feature.ts'], operationKind: 'feature' },
    cliRiskArgs: ['--target-path', 'src/feature.ts', '--operation', 'feature'],
    setup: (cwd) => {
      const { lockPath, ownerPath } = writeFixtureStateLock(cwd, {
        pid: process.pid,
        created_at: Date.now(),
        token: 'live',
      });
      const release = spawn('sh', ['-c', 'sleep 0.1; rm -f "$1"; rmdir "$2"', 'release-lock', ownerPath, lockPath], {
        cwd,
        stdio: 'ignore',
      });
      release.unref();
    },
  },
  {
    name: 'explicit-strict-without-path-signals',
    risk: { explicitOverride: 'strict' },
    cliRiskArgs: ['--profile', 'strict'],
    setup: (cwd) => replaceContractProfile(cwd, 'strict'),
  },
];

function assertHashes(state: EffectiveState): void {
  expect(state.state_revision).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(new Set(Object.keys(state.source_hashes)).size).toBe(Object.keys(state.source_hashes).length);
  expect(state.source_hashes.authority_revision).toMatch(/^sha256:[0-9a-f]{64}$/);
  for (const value of Object.values(state.source_hashes)) {
    expect(value).toMatch(/^sha256:[0-9a-f]{64}$/);
  }
}

function sourceHash(cwd: string, path: string): string {
  try {
    return sha256(readFileSync(join(cwd, path), 'utf-8'));
  } catch {
    return sha256(`missing:${path}`);
  }
}

function contentRevision(sourceHashes: Readonly<Record<string, string>>): string {
  return sha256(JSON.stringify(Object.fromEntries(
    Object.entries(sourceHashes).sort(([a], [b]) => a.localeCompare(b)),
  )));
}

function assertExactHashContract(state: EffectiveState, cwd: string): void {
  for (const [path, value] of Object.entries(state.source_hashes)) {
    if (path === 'review_subject' || path === 'authority_revision') continue;
    expect(value).toBe(sourceHash(cwd, path));
  }
  // LSC-04: authority_revision now composes policy/capability-registry/
  // active-sprint marker+file/task identity and excludes the review-subject
  // fingerprint (that moved to subject_revision, checked separately below).
  const expectedAuthorityRevision = contentRevision({
    active_plan: sourceHash(cwd, '.ai/harness/active-plan'),
    active_worktree: sourceHash(cwd, '.ai/harness/active-worktree'),
    plan: state.authoritative_plan
      ? sourceHash(cwd, state.authoritative_plan.path)
      : sha256('missing:plan'),
    contract: state.authoritative_plan ? sourceHash(cwd, CONTRACT) : sha256('missing:contract'),
    policy: sourceHash(cwd, '.ai/harness/policy.json'),
    capability_registry: sourceHash(cwd, '.ai/context/capabilities.json'),
    active_sprint_marker: sourceHash(cwd, '.ai/harness/sprint/active-sprint'),
    active_sprint_file: state.active_sprint.path
      ? sourceHash(cwd, state.active_sprint.path)
      : sha256('missing:active-sprint-file'),
    task_identity: sha256(state.task_id ?? 'missing:task-id'),
  });
  expect(state.source_hashes.authority_revision).toBe(expectedAuthorityRevision);
  expect(state.authority_revision).toBe(expectedAuthorityRevision);
  expect(state.state_revision).toBe(contentRevision(state.source_hashes));
}

const DYNAMIC_HASH_KEYS = new Set([
  '.ai/harness/active-worktree',
  '.ai/harness/handoff/current.md',
  '.ai/harness/handoff/resume.md',
  'authority_revision',
  'state_revision',
  // Handoff/resume content embeds authority_revision (dynamic, via the
  // active-worktree marker's tmpdir path) in the executing-fresh-evidence
  // scenario, which cascades into projection_revision.
  'projection_revision',
]);

function normalize(value: unknown, cwd: string, key = ''): unknown {
  if (typeof value === 'string') {
    const rooted = value.replaceAll(cwd, '<repo>');
    if (DYNAMIC_HASH_KEYS.has(key) && /^sha256:[0-9a-f]{64}$/.test(rooted)) {
      return `sha256:<dynamic:${key}>`;
    }
    return rooted;
  }
  if (Array.isArray(value)) return value.map((entry) => normalize(entry, cwd, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entry]) => [
        entryKey,
        normalize(entry, cwd, entryKey),
      ]),
    );
  }
  return value;
}

function runHook(cwd: string): StateSnapshot {
  const result = spawnSync(process.execPath, [HOOK_ENTRY, 'state-snapshot', '--json'], {
    cwd,
    encoding: 'utf-8',
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout) as StateSnapshot;
}

function captureScenario(scenario: Scenario): GoldenRecord {
  const fixture = createEffectiveStateFixture();
  try {
    writeFixture(fixture.cwd, 'docs/spec.md', '# Effective State fixture spec\n');
    scenario.setup?.(fixture.cwd);
    const direct = resolveEffectiveState(fixture.cwd, Date.now(), scenario.risk);
    assertHashes(direct);
    assertExactHashContract(direct, fixture.cwd);
    const cli = runStateCli(fixture.cwd, ['state', 'resolve', '--json', ...scenario.cliRiskArgs]);
    const cliState = JSON.parse(cli.stdout) as EffectiveState;
    assertHashes(cliState);
    assertExactHashContract(cliState, fixture.cwd);
    expect(cliState.source_hashes).toEqual(direct.source_hashes);
    expect(cliState.state_revision).toBe(direct.state_revision);
    expect(normalize(cliState, fixture.cwd)).toEqual(normalize(direct, fixture.cwd));
    const field = runStateCli(fixture.cwd, [
      'state', 'resolve', '--json', '--field', 'workflow_profile', ...scenario.cliRiskArgs,
    ]);
    return {
      baseline: BASELINE,
      scenario: scenario.name,
      cli_exit: cli.status,
      cli_stderr: cli.stderr,
      field: {
        exit: field.status,
        stdout: field.stdout,
        stderr: field.stderr,
      },
      state: normalize(cliState, fixture.cwd),
      hook: normalize(runHook(fixture.cwd), fixture.cwd),
    };
  } finally {
    fixture.cleanup();
  }
}

describe('Effective State baseline characterization goldens', () => {
  test('covers at least ten named authority/risk/concurrency states', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SCENARIOS.map((scenario) => scenario.name)).size).toBe(SCENARIOS.length);
  });

  for (const scenario of SCENARIOS) {
    test(scenario.name, () => {
      const actual = captureScenario(scenario);
      const fixturePath = join(FIXTURES, `${scenario.name}.json`);
      if (process.env.UPDATE_EFFECTIVE_STATE_GOLDENS === '1') {
        mkdirSync(FIXTURES, { recursive: true });
        writeFileSync(fixturePath, `${JSON.stringify(actual, null, 2)}\n`);
      }
      const expected = JSON.parse(readFileSync(fixturePath, 'utf-8')) as GoldenRecord;
      expect(JSON.stringify(actual, null, 2)).toBe(JSON.stringify(expected, null, 2));
    }, 15_000);
  }
});
