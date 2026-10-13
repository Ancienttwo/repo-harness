import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { EffectiveState } from '../src/core/state/types';
import { createStateInputCollector, type EffectiveStateResolution } from '../src/effects/loop/state-input-collector';

interface Fixture {
  readonly root: string;
  cleanup(): void;
}

// Builds a plain (non-git) fixture repo with the two marker files the
// collector's worktree/active-plan getters read. No git init is needed --
// neither getter shells out to git; `getWorktreeOwnership` only realpaths
// the fixture directory and reads the owner marker text.
function buildFixture(activePlan = 'plans/plan-example.md'): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'state-input-collector-')));
  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/active-plan'), `${activePlan}\n`);
  writeFileSync(join(root, '.ai/harness/active-worktree'), `${root}\n`);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function withFixture(fn: (root: string) => void, activePlan?: string): void {
  const fixture = buildFixture(activePlan);
  try {
    fn(fixture.root);
  } finally {
    fixture.cleanup();
  }
}

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g;
const PID_FIELD = /("pid")\s*:\s*\d+/gi;

// Normalizes exactly path/time/PID, matching the same limit
// tests/hook-runtime-characterization.test.ts's `normalize()` uses -- none
// of today's four getters embed time/PID, but a fixture-root substring
// (the one genuinely nondeterministic part, a fresh mkdtemp dir per fixture)
// always needs it, and the rest stay ready for getters HRD-03..06 may add.
function normalize(snapshot: unknown, root: string): unknown {
  const text = JSON.stringify(snapshot)
    .split(root).join('<FIXTURE_ROOT>')
    .replace(ISO_TIMESTAMP, '<TIMESTAMP>')
    .replace(PID_FIELD, '$1:"<PID>"');
  return JSON.parse(text);
}

function snapshotOf(collector: ReturnType<typeof createStateInputCollector>): unknown {
  return {
    repoRoot: collector.getRepoRoot(),
    worktreeOwnership: collector.getWorktreeOwnership(),
    activePlanMarker: collector.getActivePlanMarker(),
    effectiveState: collector.getEffectiveState(),
  };
}

// A fixed, non-random stand-in for a resolved Effective State: the resolver's
// own determinism is covered by tests/state/*; this test file is about the
// collector's memoizing mechanics, not the resolve path.
const FIXED_RESOLUTION: EffectiveStateResolution = {
  ok: true,
  state: { task_id: null } as unknown as EffectiveState,
};

const FIXED_FAILURE: EffectiveStateResolution = {
  ok: false,
  reason_code: 'state_resolution_failed',
  error_hash: 'sha256:fixture',
  message: 'fixture failure',
};

describe('createStateInputCollector: laziness', () => {
  test('construction performs zero collections', () => {
    let resolveCalls = 0;
    // A NUL byte makes every real fs call on this path throw synchronously
    // (Node rejects paths with embedded NUL bytes before touching the OS),
    // and the injected resolver throws outright -- so if construction
    // eagerly ran any getter body, this would throw. It must not.
    const poisonedRoot = 'poisoned-repo-root\u0000';
    let collector!: ReturnType<typeof createStateInputCollector>;
    expect(() => {
      collector = createStateInputCollector({
        repoRoot: poisonedRoot,
        resolveEffectiveState: () => {
          resolveCalls += 1;
          throw new Error('resolveEffectiveState must not run at construction');
        },
      });
    }).not.toThrow();
    expect(resolveCalls).toBe(0);

    // The poison is real, not merely unreachable: invoking any getter after
    // construction does hit it, confirming construction truly touched none
    // of them.
    expect(() => collector.getWorktreeOwnership()).toThrow();
    expect(() => collector.getActivePlanMarker()).toThrow();
    expect(() => collector.getEffectiveState()).toThrow();
    expect(resolveCalls).toBe(1);
  });
});

describe('createStateInputCollector: memoization', () => {
  test('getEffectiveState resolves at most once across N calls', () => {
    let calls = 0;
    const collector = createStateInputCollector({
      repoRoot: '/does/not/matter/for/this/getter',
      resolveEffectiveState: () => {
        calls += 1;
        return FIXED_RESOLUTION;
      },
    });

    const first = collector.getEffectiveState();
    const second = collector.getEffectiveState();
    const third = collector.getEffectiveState();

    expect(calls).toBe(1);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  test('a failed resolution is still cached (not retried)', () => {
    let calls = 0;
    const collector = createStateInputCollector({
      repoRoot: '/does/not/matter/for/this/getter',
      resolveEffectiveState: () => {
        calls += 1;
        return FIXED_FAILURE;
      },
    });

    expect(collector.getEffectiveState()).toEqual(FIXED_FAILURE);
    expect(collector.getEffectiveState()).toEqual(FIXED_FAILURE);
    expect(collector.getEffectiveState()).toEqual(FIXED_FAILURE);
    expect(calls).toBe(1);
  });

  test('getWorktreeOwnership and getActivePlanMarker collect at most once each', () => {
    withFixture((root) => {
      const collector = createStateInputCollector({
        repoRoot: root,
        resolveEffectiveState: () => FIXED_RESOLUTION,
      });

      const firstOwnership = collector.getWorktreeOwnership();
      const firstMarker = collector.getActivePlanMarker();

      // Mutate the underlying marker files after the first read. If the
      // getter re-read on a second call, these calls would observe the new
      // content; memoization means they must not.
      writeFileSync(join(root, '.ai/harness/active-worktree'), '/tmp/a-different-worktree\n');
      writeFileSync(join(root, '.ai/harness/active-plan'), 'plans/plan-changed-after-first-read.md\n');

      expect(collector.getWorktreeOwnership()).toEqual(firstOwnership);
      expect(collector.getActivePlanMarker()).toBe(firstMarker);
    });
  });
});

describe('createStateInputCollector: determinism', () => {
  test('two collectors over equivalent fixture repos produce the same normalized snapshot', () => {
    const fixtureA = buildFixture();
    const fixtureB = buildFixture();
    try {
      const collectorA = createStateInputCollector({
        repoRoot: fixtureA.root,
        resolveEffectiveState: () => FIXED_RESOLUTION,
      });
      const collectorB = createStateInputCollector({
        repoRoot: fixtureB.root,
        resolveEffectiveState: () => FIXED_RESOLUTION,
      });

      const snapshotA = normalize(snapshotOf(collectorA), fixtureA.root);
      const snapshotB = normalize(snapshotOf(collectorB), fixtureB.root);

      expect(snapshotA).toEqual(snapshotB);
    } finally {
      fixtureA.cleanup();
      fixtureB.cleanup();
    }
  });

  test('worktree ownership reflects the current fixture root once normalized', () => {
    withFixture((root) => {
      const collector = createStateInputCollector({
        repoRoot: root,
        resolveEffectiveState: () => FIXED_RESOLUTION,
      });

      expect(collector.getWorktreeOwnership()).toEqual({
        current: root,
        owner: root,
        ownedByCurrent: true,
      });
    });
  });
});

describe('createStateInputCollector: single-resolution invariant', () => {
  test('a fresh collector per event means a new event gets its own resolution', () => {
    let calls = 0;
    const resolveEffectiveState = () => {
      calls += 1;
      return FIXED_RESOLUTION;
    };

    const first = createStateInputCollector({ repoRoot: '/does/not/matter/for/this/getter', resolveEffectiveState });
    first.getEffectiveState();
    first.getEffectiveState();
    expect(calls).toBe(1);

    const second = createStateInputCollector({ repoRoot: '/does/not/matter/for/this/getter', resolveEffectiveState });
    second.getEffectiveState();
    expect(calls).toBe(2);
  });
});

describe('createStateInputCollector: basic shape', () => {
  test('exposes the repo root unchanged', () => {
    withFixture((root) => {
      const collector = createStateInputCollector({
        repoRoot: root,
        resolveEffectiveState: () => FIXED_RESOLUTION,
      });

      expect(collector.getRepoRoot()).toBe(root);
    });
  });
});
