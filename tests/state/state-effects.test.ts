import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { CONTRACT, resolveFixtureState, createEffectiveStateFixture, writeFixtureStateLock } from './effective-state-fixture';
import {
  EFFECTIVE_STATE_CACHE,
  writeEffectiveStateCache,
  type StateCacheWriteEffects,
} from '../../src/effects/state/state-cache';
import { withStateLock } from '../../src/effects/state/state-lock';
import {
  currentStateVersion,
  stateVersionOwnerPath,
} from '../../src/effects/state/git-state-version-store';

describe('Effective State lock effects', () => {
  test('an aged empty lock directory left before token publication is reclaimed', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const lockPath = join(fixture.cwd, '.ai/harness/state/effective.lock');
      mkdirSync(lockPath, { recursive: true });
      const old = new Date(Date.now() - 60_000);
      utimesSync(lockPath, old, old);
      expect(resolveFixtureState(fixture.cwd).phase).toBe('executing');
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test('a malformed stale lock is reclaimed only when its filename PID is dead', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const lockPath = join(fixture.cwd, '.ai/harness/state/effective.lock');
      const { ownerPath } = writeFixtureStateLock(fixture.cwd, {
        pid: 99999999,
        created_at: Date.now() - 60_000,
        token: '99999999-0-00000000-0000-4000-8000-000000000000',
      }, '{malformed');
      const old = new Date(Date.now() - 60_000);
      utimesSync(ownerPath, old, old);
      expect(resolveFixtureState(fixture.cwd).phase).toBe('executing');
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test('a token mismatch never deletes a lock now owned by another resolver', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const lockPath = join(fixture.cwd, '.ai/harness/state/effective.lock');
      withStateLock(fixture.cwd, () => {
        writeFileSync(join(lockPath, 'replacement-owner.json'), `${JSON.stringify({
          pid: process.pid,
          created_at: Date.now(),
          token: 'replacement-owner',
        })}\n`);
      });
      expect(JSON.parse(readFileSync(join(lockPath, 'replacement-owner.json'), 'utf-8')).token).toBe('replacement-owner');
      rmSync(lockPath, { recursive: true, force: true });
    } finally {
      fixture.cleanup();
    }
  });

  test('a symlinked lock directory fails closed without deleting an external entry', () => {
    const fixture = createEffectiveStateFixture();
    const external = createEffectiveStateFixture();
    try {
      const lockPath = join(fixture.cwd, '.ai/harness/state/effective.lock');
      mkdirSync(join(fixture.cwd, '.ai/harness/state'), { recursive: true });
      const victim = join(external.cwd, 'external-victim');
      writeFileSync(victim, 'preserve\n');
      const old = new Date(Date.now() - 60_000);
      utimesSync(victim, old, old);
      symlinkSync(external.cwd, lockPath);
      expect(() => withStateLock(fixture.cwd, () => undefined)).toThrow('unsafe lock path');
      expect(readFileSync(victim, 'utf-8')).toBe('preserve\n');
    } finally {
      fixture.cleanup();
      external.cleanup();
    }
  });
});

describe('Effective State cache publication faults', () => {
  test('an authoritative path read error fails closed before cache publication', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const contractPath = join(fixture.cwd, CONTRACT);
      rmSync(contractPath);
      mkdirSync(contractPath);
      expect(() => resolveFixtureState(fixture.cwd)).toThrow();
      expect(existsSync(join(fixture.cwd, EFFECTIVE_STATE_CACHE))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  function withState(run: (fixture: ReturnType<typeof createEffectiveStateFixture>, state: ReturnType<typeof resolveFixtureState>) => void): void {
    const fixture = createEffectiveStateFixture();
    try {
      const state = resolveFixtureState(fixture.cwd);
      rmSync(join(fixture.cwd, EFFECTIVE_STATE_CACHE), { force: true });
      run(fixture, state);
    } finally {
      fixture.cleanup();
    }
  }

  test('a temporary-write failure publishes neither a final cache nor a leaked temp', () => {
    withState((fixture, state) => {
      const effects: StateCacheWriteEffects = {
        writeTemp() { throw new Error('injected temp write failure'); },
        publish() { throw new Error('publish must not run'); },
        removeTemp(path) { rmSync(path, { force: true }); },
      };
      expect(() => writeEffectiveStateCache(fixture.cwd, state, effects)).toThrow('injected temp write failure');
      const stateDir = join(fixture.cwd, '.ai/harness/state');
      expect(existsSync(join(fixture.cwd, EFFECTIVE_STATE_CACHE))).toBe(false);
      expect(readdirSync(stateDir).filter((name) => name.includes('.tmp-'))).toEqual([]);
    });
  });

  test('an injected rename failure preserves the prior cache and removes the new temp', () => {
    withState((fixture, state) => {
      const cachePath = join(fixture.cwd, EFFECTIVE_STATE_CACHE);
      writeFileSync(cachePath, 'prior-cache\n');
      const effects: StateCacheWriteEffects = {
        writeTemp(path, content) { writeFileSync(path, content, { mode: 0o600 }); },
        publish() { throw new Error('injected rename failure'); },
        removeTemp(path) { rmSync(path, { force: true }); },
      };
      expect(() => writeEffectiveStateCache(fixture.cwd, state, effects)).toThrow('injected rename failure');
      expect(readFileSync(cachePath, 'utf-8')).toBe('prior-cache\n');
      expect(readdirSync(join(fixture.cwd, '.ai/harness/state')).filter((name) => name.includes('.tmp-'))).toEqual([]);
    });
  });

  test('successful publication replaces the cache with a complete JSON document', () => {
    withState((fixture, state) => {
      writeEffectiveStateCache(fixture.cwd, state);
      const parsed = JSON.parse(readFileSync(join(fixture.cwd, EFFECTIVE_STATE_CACHE), 'utf-8'));
      expect(parsed).toEqual(state);
      expect(readdirSync(join(fixture.cwd, '.ai/harness/state')).filter((name) => name.includes('.tmp-'))).toEqual([]);
    });
  });
});

describe('Effective State version read effects', () => {
  test('read-only version lookup preserves non-Git compatibility without hiding a corrupt owner', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const ownerPath = stateVersionOwnerPath(fixture.cwd);
      mkdirSync(join(ownerPath, '..'), { recursive: true });
      writeFileSync(ownerPath, '{"version":0,"revision":"invalid"}\n');
      expect(() => currentStateVersion(fixture.cwd)).toThrow('invalid effective-state version owner');
    } finally {
      fixture.cleanup();
    }
  });
});
