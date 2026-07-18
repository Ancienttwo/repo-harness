import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  resolveEffectiveState,
} from '../../src/effects/state/resolve-effective-state';
import type { EffectiveState, StateSnapshot } from '../../src/core/state/types';
import {
  CONTRACT,
  EFFECTIVE_STATE_SCENARIOS,
  HOOK_ENTRY,
  createEffectiveStateFixture,
  effectiveStateCliRiskArgs,
  runStateCli,
  writeFixture,
} from './effective-state-fixture';

const BASELINE = '82550779cdccf0575d674ae53bbc95ba63e44743';
const FIXTURES = join(import.meta.dir, 'fixtures');

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

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

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
    Object.entries(sourceHashes).sort(([left], [right]) => (
      left < right ? -1 : left > right ? 1 : 0
    )),
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

function captureScenario(scenario: (typeof EFFECTIVE_STATE_SCENARIOS)[number]): GoldenRecord {
  const fixture = createEffectiveStateFixture({ includeLegacyActivePlan: true });
  try {
    const nowMs = Date.now();
    writeFixture(fixture.cwd, 'docs/spec.md', '# Effective State fixture spec\n');
    scenario.setup?.(fixture.cwd, nowMs);
    const direct = resolveEffectiveState(fixture.cwd, nowMs, scenario.risk);
    assertHashes(direct);
    assertExactHashContract(direct, fixture.cwd);
    const cliRiskArgs = effectiveStateCliRiskArgs(scenario.risk);
    const cli = runStateCli(fixture.cwd, ['state', 'resolve', '--json', ...cliRiskArgs]);
    const cliState = JSON.parse(cli.stdout) as EffectiveState;
    assertHashes(cliState);
    assertExactHashContract(cliState, fixture.cwd);
    expect(cliState.source_hashes).toEqual(direct.source_hashes);
    expect(cliState.state_revision).toBe(direct.state_revision);
    expect(normalize(cliState, fixture.cwd)).toEqual(normalize(direct, fixture.cwd));
    const field = runStateCli(fixture.cwd, [
      'state', 'resolve', '--json', '--field', 'workflow_profile', ...cliRiskArgs,
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
    expect(EFFECTIVE_STATE_SCENARIOS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(EFFECTIVE_STATE_SCENARIOS.map((scenario) => scenario.name)).size)
      .toBe(EFFECTIVE_STATE_SCENARIOS.length);
  });

  for (const scenario of EFFECTIVE_STATE_SCENARIOS) {
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
