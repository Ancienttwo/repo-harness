import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createStateInputCollector } from '../src/effects/loop/state-input-collector';

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

function snapshotOf(collector: {
  getRepoRoot(): string;
  getWorktreeOwnership(): unknown;
  getActivePlanMarker(): string | null;
  getSessionEffectiveState(): unknown;
}): unknown {
  return {
    repoRoot: collector.getRepoRoot(),
    worktreeOwnership: collector.getWorktreeOwnership(),
    activePlanMarker: collector.getActivePlanMarker(),
    sessionEffectiveState: collector.getSessionEffectiveState(),
  };
}

// A fixed, non-random stand-in for effectiveStateSessionSection: the real
// function's own determinism is covered by tests/state/*; this test file is
// about the collector's memoizing mechanics, not the CLI's resolve path.
const FIXED_SESSION_STATE = {
  id: 'effective-state',
  priority: 2 as const,
  content: '[HarnessState] {"task_id":null}',
  mandatory: true,
  actionable: true,
  reference: 'repo-harness state resolve --json',
};

describe('createStateInputCollector: laziness', () => {
  test('construction performs zero collections', () => {
    let sessionCalls = 0;
    // A NUL byte makes every real fs call on this path throw synchronously
    // (Node rejects paths with embedded NUL bytes before touching the OS),
    // and the injected resolver throws outright -- so if construction
    // eagerly ran any getter body, this would throw. It must not.
    const poisonedRoot = 'poisoned-repo-root\u0000';
    let collector!: ReturnType<typeof createStateInputCollector>;
    expect(() => {
      collector = createStateInputCollector({
        event: 'SessionStart',
        repoRoot: poisonedRoot,
        resolveSessionEffectiveState: () => {
          sessionCalls += 1;
          throw new Error('resolveSessionEffectiveState must not run at construction');
        },
      });
    }).not.toThrow();
    expect(sessionCalls).toBe(0);

    // The poison is real, not merely unreachable: invoking any getter after
    // construction does hit it, confirming construction truly touched none
    // of them.
    expect(() => collector.getWorktreeOwnership()).toThrow();
    expect(() => collector.getActivePlanMarker()).toThrow();
    expect(() => collector.getSessionEffectiveState()).toThrow();
    expect(sessionCalls).toBe(1);
  });
});

describe('createStateInputCollector: memoization', () => {
  test('getStopEffectiveState resolves at most once across downstream reads', () => {
    let calls = 0;
    const collector = createStateInputCollector({
      event: 'Stop',
      repoRoot: '/tmp/repo-harness-stop-collector',
      resolveSessionEffectiveState: () => null,
      resolveStopEffectiveState: () => ({ revision: ++calls }),
    });

    expect(collector.getStopEffectiveState()).toEqual({ revision: 1 });
    expect(collector.getStopEffectiveState()).toEqual({ revision: 1 });
    expect(calls).toBe(1);
  });

  test('getSessionEffectiveState collects at most once across N calls', () => {
    let calls = 0;
    const collector = createStateInputCollector({
      event: 'SessionStart',
      repoRoot: '/does/not/matter/for/this/getter',
      resolveSessionEffectiveState: () => {
        calls += 1;
        return FIXED_SESSION_STATE;
      },
    });

    const first = collector.getSessionEffectiveState();
    const second = collector.getSessionEffectiveState();
    const third = collector.getSessionEffectiveState();

    expect(calls).toBe(1);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  test('a resolver that legitimately returns null is still cached (not retried)', () => {
    let calls = 0;
    const collector = createStateInputCollector({
      event: 'Stop',
      repoRoot: '/does/not/matter/for/this/getter',
      resolveSessionEffectiveState: () => {
        calls += 1;
        return null;
      },
    });

    expect(collector.getSessionEffectiveState()).toBeNull();
    expect(collector.getSessionEffectiveState()).toBeNull();
    expect(collector.getSessionEffectiveState()).toBeNull();
    expect(calls).toBe(1);
  });

  test('getWorktreeOwnership and getActivePlanMarker collect at most once each', () => {
    withFixture((root) => {
      const collector = createStateInputCollector({
        event: 'SessionStart',
        repoRoot: root,
        resolveSessionEffectiveState: () => FIXED_SESSION_STATE,
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
        event: 'SessionStart',
        repoRoot: fixtureA.root,
        resolveSessionEffectiveState: () => FIXED_SESSION_STATE,
      });
      const collectorB = createStateInputCollector({
        event: 'SessionStart',
        repoRoot: fixtureB.root,
        resolveSessionEffectiveState: () => FIXED_SESSION_STATE,
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
        event: 'SessionStart',
        repoRoot: root,
        resolveSessionEffectiveState: () => FIXED_SESSION_STATE,
      });

      expect(collector.getWorktreeOwnership()).toEqual({
        current: root,
        owner: root,
        ownedByCurrent: true,
      });
    });
  });
});

describe('createStateInputCollector: SessionStart single-resolution invariant', () => {
  test('any number of downstream reads within one event resolve Effective State exactly once', () => {
    let calls = 0;
    const collector = createStateInputCollector({
      event: 'SessionStart',
      repoRoot: '/does/not/matter/for/this/getter',
      resolveSessionEffectiveState: () => {
        calls += 1;
        return FIXED_SESSION_STATE;
      },
    });

    // Simulate several independent call sites within the same event (e.g.
    // the SessionStart context budget plus a future HRD consumer) all
    // asking for the Effective State section.
    for (let i = 0; i < 5; i += 1) {
      collector.getSessionEffectiveState();
    }

    expect(calls).toBe(1);
  });

  test('a fresh collector per event means a new event gets its own resolution', () => {
    let calls = 0;
    const resolveSessionEffectiveState = () => {
      calls += 1;
      return FIXED_SESSION_STATE;
    };

    const first = createStateInputCollector({
      event: 'SessionStart',
      repoRoot: '/does/not/matter/for/this/getter',
      resolveSessionEffectiveState,
    });
    first.getSessionEffectiveState();
    first.getSessionEffectiveState();
    expect(calls).toBe(1);

    const second = createStateInputCollector({
      event: 'SessionStart',
      repoRoot: '/does/not/matter/for/this/getter',
      resolveSessionEffectiveState,
    });
    second.getSessionEffectiveState();
    expect(calls).toBe(2);
  });
});

describe('createStateInputCollector: basic shape', () => {
  test('exposes the constructing event and repo root unchanged', () => {
    withFixture((root) => {
      const collector = createStateInputCollector({
        event: 'PreToolUse',
        repoRoot: root,
        resolveSessionEffectiveState: () => null,
      });

      expect(collector.event).toBe('PreToolUse');
      expect(collector.getRepoRoot()).toBe(root);
    });
  });
});
