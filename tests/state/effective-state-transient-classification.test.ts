import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  acquireExclusiveDirectoryLock,
  type ExclusiveDirectoryLockHandle,
} from '../../src/effects/locking/exclusive-directory-lock';
import { resolveSessionEffectiveState } from '../../src/cli/hook/runtime';
import type { EffectiveState, EffectiveStateRiskInput } from '../../src/core/state/types';

// Regression guard for
// tasks/contracts/20260818-0126-typed-lock-transient-errors.contract.md.
//
// Root cause: isTransientResolutionInstability (src/cli/hook/runtime.ts)
// matched only two message shapes -- the stability-exhausted literal and the
// `timed out waiting for exclusive lock ` prefix. The exclusive lock layer has
// a third failure signature, `lost exclusive lock ownership: <path>`
// (src/effects/locking/exclusive-directory-lock.ts, acquire-race and
// assertOwned hold-phase), which is the same contention class but fell through
// to the permanent `state_resolution_failed` branch.
//
// Every lock failure below is raised by the real lock layer, never by a
// hand-written Error, so this guard also proves the classifier is driven by the
// error's type rather than by its message text.

type StateResolver = (
  repoRoot: string,
  nowMs: number,
  risk?: EffectiveStateRiskInput,
) => EffectiveState;

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function lockFixtureRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'transient-classification-')));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function holdLock(root: string): ExclusiveDirectoryLockHandle {
  const handle = acquireExclusiveDirectoryLock(root, 'state.lock');
  cleanups.push(() => handle.release());
  return handle;
}

/**
 * Drive the real assertOwned() hold-phase check into its lost-ownership throw:
 * publishing a second entry inside the lock directory makes ownsExclusiveToken
 * observe an entry set that is no longer this handle's single token.
 */
function realLostOwnershipFailure(): unknown {
  const root = lockFixtureRoot();
  const handle = holdLock(root);
  writeFileSync(join(handle.lockPath, 'intruder.json'), '{}\n', { mode: 0o600 });
  try {
    handle.assertOwned();
  } catch (error) {
    return error;
  }
  throw new Error('expected assertOwned to report lost exclusive lock ownership');
}

/** Drive the real acquire path into its wait-timeout throw. */
function realLockTimeoutFailure(): unknown {
  const root = lockFixtureRoot();
  holdLock(root);
  try {
    acquireExclusiveDirectoryLock(root, 'state.lock', { waitTimeoutMs: 1 });
  } catch (error) {
    return error;
  }
  throw new Error('expected a second acquire to time out while the lock is held');
}

function classifyResolutionFailure(failure: unknown): string {
  let attempts = 0;
  const outcome = resolveSessionEffectiveState('/private/repo-b', 123, (() => {
    attempts += 1;
    throw failure;
  }) as StateResolver);
  if (outcome.kind !== 'unavailable') throw new Error(`expected unavailable, got ${outcome.kind}`);
  expect(attempts).toBeGreaterThan(0);
  return outcome.diagnostic.reason_code;
}

describe('effective-state transient classification', () => {
  test('a real lost-ownership lock failure classifies as transient', () => {
    const failure = realLostOwnershipFailure();
    expect((failure as Error).message).toStartWith('lost exclusive lock ownership: ');
    expect(classifyResolutionFailure(failure)).toBe('state_resolution_unstable');
  });

  test('a real lock wait-timeout failure classifies as transient', () => {
    const failure = realLockTimeoutFailure();
    expect((failure as Error).message).toStartWith('timed out waiting for exclusive lock ');
    expect(classifyResolutionFailure(failure)).toBe('state_resolution_unstable');
  });

  test('an unrelated resolver failure stays permanent', () => {
    expect(classifyResolutionFailure(new TypeError('injected non-lock failure')))
      .toBe('state_resolution_failed');
  });
});
