import { describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import {
  CONTRACT,
  PLAN,
  createEffectiveStateFixture,
  resolveFixtureState,
  writeFixture,
  writeFixtureStateLock,
} from './effective-state-fixture';
import {
  EFFECTIVE_STATE_CACHE,
  writeEffectiveStateCache,
  type StateCacheWriteEffects,
} from '../../src/effects/state/state-cache';
import { withStateLock } from '../../src/effects/state/state-lock';
import {
  currentStateVersion,
  stateVersionOwnerPath,
  type StateVersionWriteEffects,
} from '../../src/effects/state/git-state-version-store';
import { resolveEffectiveState } from '../../src/effects/state/resolve-effective-state';

describe('Effective State lock effects', () => {
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
      expect(readdirSync(lockPath)).toEqual(['replacement-owner.json']);
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

  for (const ancestor of ['.ai', '.ai/harness', '.ai/harness/state']) {
    test(`a symlinked repo-local lock ancestor ${ancestor} fails closed`, () => {
      const fixture = createEffectiveStateFixture();
      const external = createEffectiveStateFixture();
      try {
        const ancestorPath = join(fixture.cwd, ancestor);
        rmSync(ancestorPath, { recursive: true, force: true });
        const victim = join(external.cwd, 'victim');
        writeFileSync(victim, 'preserve\n');
        symlinkSync(external.cwd, ancestorPath);
        const outsideBefore = readdirSync(external.cwd).sort();
        let ran = false;
        expect(() => withStateLock(fixture.cwd, () => { ran = true; })).toThrow('unsafe lock ancestor');
        expect(ran).toBe(false);
        expect(readdirSync(external.cwd).sort()).toEqual(outsideBefore);
        const suffix = ['.ai', 'harness', 'state', 'effective.lock']
          .slice(ancestor.split('/').length);
        expect(existsSync(join(external.cwd, ...suffix))).toBe(false);
        expect(readFileSync(victim, 'utf-8')).toBe('preserve\n');
      } finally {
        fixture.cleanup();
        external.cleanup();
      }
    });
  }

  test('a symlinked canonical root fails closed before running the critical section', () => {
    const fixture = createEffectiveStateFixture();
    const link = `${fixture.cwd}-root-link`;
    try {
      symlinkSync(fixture.cwd, link);
      let ran = false;
      expect(() => withStateLock(link, () => { ran = true; })).toThrow('unsafe lock ancestor');
      expect(ran).toBe(false);
    } finally {
      rmSync(link, { force: true });
      fixture.cleanup();
    }
  });

  test('a symlinked Git common-dir lock ancestor fails closed without external publication', () => {
    const fixture = createEffectiveStateFixture();
    const external = createEffectiveStateFixture();
    try {
      const commonDir = realpathSync(join(fixture.cwd, '.git'));
      const sharedAncestor = join(commonDir, 'repo-harness');
      const victim = join(external.cwd, 'victim');
      writeFileSync(victim, 'preserve\n');
      symlinkSync(external.cwd, sharedAncestor);
      expect(() => resolveFixtureState(fixture.cwd)).toThrow('unsafe lock ancestor');
      expect(existsSync(join(external.cwd, 'effective-state-version.json'))).toBe(false);
      expect(existsSync(join(external.cwd, 'effective-state-version.json.lock'))).toBe(false);
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

describe('Effective State version/cache publication transaction', () => {
  const risk = { targetPaths: ['src/feature.ts'], operationKind: 'feature' } as const;

  function mutateAuthority(cwd: string): void {
    const plan = readFileSync(join(cwd, PLAN), 'utf-8');
    writeFixture(cwd, PLAN, `${plan}\n<!-- publication fault revision -->\n`);
  }

  function tempNames(directory: string): string[] {
    return readdirSync(directory).filter((name) => name.includes('.tmp-'));
  }

  test('a cold cache-path failure does not create the version owner and retry starts at version 1', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const cachePath = join(fixture.cwd, EFFECTIVE_STATE_CACHE);
      const ownerPath = stateVersionOwnerPath(fixture.cwd);
      mkdirSync(cachePath, { recursive: true });
      expect(() => resolveEffectiveState(fixture.cwd, Date.now(), risk)).toThrow();
      expect(existsSync(ownerPath)).toBe(false);
      rmSync(cachePath, { recursive: true });
      expect(resolveEffectiveState(fixture.cwd, Date.now(), risk).state_version).toBe(1);
    } finally {
      fixture.cleanup();
    }
  });

  for (const fault of ['cache-temp', 'cache-publish', 'owner-temp', 'owner-publish'] as const) {
    test(`${fault} failure preserves exact owner/cache bytes and retry consumes only version 2`, () => {
      const fixture = createEffectiveStateFixture();
      try {
        const first = resolveEffectiveState(fixture.cwd, Date.now(), risk);
        const cachePath = join(fixture.cwd, EFFECTIVE_STATE_CACHE);
        const ownerPath = stateVersionOwnerPath(fixture.cwd);
        const priorCache = readFileSync(cachePath);
        const priorOwner = readFileSync(ownerPath);
        mutateAuthority(fixture.cwd);

        const cacheEffects: StateCacheWriteEffects | undefined = fault.startsWith('cache-') ? {
          writeTemp(path, content) {
            if (fault === 'cache-temp') throw new Error('injected cache temp failure');
            writeFileSync(path, content, { mode: 0o600 });
          },
          publish() {
            throw new Error('injected cache publish failure');
          },
          removeTemp(path) { rmSync(path, { force: true }); },
        } : undefined;
        const versionEffects: StateVersionWriteEffects | undefined = fault.startsWith('owner-') ? {
          writeTemp(path, content) {
            if (fault === 'owner-temp') throw new Error('injected owner temp failure');
            writeFileSync(path, content, { mode: 0o600 });
          },
          publish() {
            throw new Error('injected owner publish failure');
          },
          removeTemp(path) { rmSync(path, { force: true }); },
        } : undefined;

        expect(() => resolveEffectiveState(fixture.cwd, Date.now(), risk, {
          cache: cacheEffects,
          version: versionEffects,
        })).toThrow(`injected ${fault.replace('-', ' ')} failure`);
        expect(readFileSync(cachePath).equals(priorCache)).toBe(true);
        expect(readFileSync(ownerPath).equals(priorOwner)).toBe(true);
        expect(tempNames(join(fixture.cwd, '.ai/harness/state'))).toEqual([]);
        expect(tempNames(join(ownerPath, '..'))).toEqual([]);
        expect(resolveEffectiveState(fixture.cwd, Date.now(), risk).state_version)
          .toBe(first.state_version + 1);
      } finally {
        fixture.cleanup();
      }
    });
  }

  test('same-revision cache reconstruction never invokes version-owner write effects', () => {
    const fixture = createEffectiveStateFixture();
    try {
      const first = resolveEffectiveState(fixture.cwd, Date.now(), risk);
      rmSync(join(fixture.cwd, EFFECTIVE_STATE_CACHE));
      let ownerEffectCalls = 0;
      const version: StateVersionWriteEffects = {
        writeTemp() { ownerEffectCalls += 1; },
        publish() { ownerEffectCalls += 1; },
        removeTemp() { ownerEffectCalls += 1; },
      };
      const rebuilt = resolveEffectiveState(fixture.cwd, Date.now(), risk, { version });
      expect(rebuilt.state_version).toBe(first.state_version);
      expect(ownerEffectCalls).toBe(0);
      expect(existsSync(join(fixture.cwd, EFFECTIVE_STATE_CACHE))).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });
});

describe('Effective State authority metadata failures', () => {
  function supportsPermissionProof(): boolean {
    return process.platform !== 'win32'
      && (typeof process.getuid !== 'function' || process.getuid() !== 0);
  }

  for (const authority of ['plan-directory', 'policy', 'capability-registry'] as const) {
    test(`${authority} EACCES fails closed before cache/version publication`, () => {
      if (!supportsPermissionProof()) return;
      const fixture = createEffectiveStateFixture();
      let restrictedPath = '';
      try {
        if (authority === 'plan-directory') {
          restrictedPath = join(fixture.cwd, 'plans');
        } else if (authority === 'policy') {
          restrictedPath = join(fixture.cwd, '.ai/harness/policy.json');
          writeFileSync(restrictedPath, '{}\n');
        } else {
          restrictedPath = join(fixture.cwd, '.ai/context/capabilities.json');
          writeFixture(fixture.cwd, '.ai/context/capabilities.json', '{"version":1,"capabilities":[]}\n');
        }
        chmodSync(restrictedPath, 0);
        expect(() => resolveFixtureState(fixture.cwd)).toThrow();
        expect(existsSync(join(fixture.cwd, EFFECTIVE_STATE_CACHE))).toBe(false);
        expect(existsSync(stateVersionOwnerPath(fixture.cwd))).toBe(false);
      } finally {
        if (restrictedPath) chmodSync(restrictedPath, authority === 'plan-directory' ? 0o700 : 0o600);
        fixture.cleanup();
      }
    });
  }
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
