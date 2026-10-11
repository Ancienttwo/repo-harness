import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runGlobalRuntimeSetup, updateLeftoverSummary } from '../../src/cli/commands/global-runtime';

/**
 * Regression guard for the #169 base-dropping class on the setup-global surface.
 *
 * `runGlobalRuntimeSetup` builds its one environment record as
 * `bindBunRuntimeEnv(commandEnv(sourceRoot, opts.env), bunExecutable)`
 * (src/cli/commands/global-runtime.ts). With no caller env both helpers used to
 * base on `{}`, so the composed record held one or two keys and the whole
 * process environment was discarded.
 *
 * Most consumers are masked: `homeDir(env)` resolves
 * `env?.HOME ?? process.env.HOME ?? homedir()`, so it re-reads process.env and
 * survives the drop. The one unmasked sink is the very first use of the record,
 * `readInstalledProfile(env)` -> `installProfileStatePath(env)`
 * (src/cli/installer/install-profile.ts:502), whose chain is
 * `env.HOME ?? homedir()` with no process.env step. Bun caches `homedir()` at
 * process start, so on a dropped base that resolves to the operator's real home
 * and every caller-visible HOME lever is lost.
 *
 * Observable: a legacy protocol-1 install-state file seeded under an overridden
 * HOME must be the file the profile read fails closed on, and the thrown message
 * carries the resolved path. That read happens before any process spawn or
 * filesystem write, so this guard has no side effects on either code path.
 */
describe('global runtime setup command env base', () => {
  function runWithSeededHome(sourceRoot: string, home: string): () => unknown {
    return () => runGlobalRuntimeSetup({
      sourceRoot,
      cwd: home,
      installCli: false,
      syncSkill: false,
      hostAdapters: false,
      externalSkills: false,
      codegraph: false,
    });
  }

  function withOverriddenHome(label: string, body: (tmp: string, home: string, statePath: string) => void): void {
    const tmp = join(tmpdir(), `repo-harness-global-runtime-env-base-${label}-${Date.now()}`);
    const home = join(tmp, 'home');
    const statePath = join(home, '.repo-harness', 'install-state.json');
    const previousHome = process.env.HOME;
    const previousFlag = process.env.AGENTIC_DEV_LINK_INSTALLED_COPIES;
    try {
      mkdirSync(join(home, '.repo-harness'), { recursive: true });
      // Legacy protocol-1 state: readInstalledProfile fails closed on it and the
      // error names the path it resolved, which is exactly the datum under guard.
      writeFileSync(statePath, JSON.stringify({ protocol: 1, profile: 'full' }));
      process.env.HOME = home;
      delete process.env.AGENTIC_DEV_LINK_INSTALLED_COPIES;
      body(tmp, home, statePath);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousFlag === undefined) delete process.env.AGENTIC_DEV_LINK_INSTALLED_COPIES;
      else process.env.AGENTIC_DEV_LINK_INSTALLED_COPIES = previousFlag;
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  test('npx cache source with no caller env keeps process.env as the constructed env base', () => {
    withOverriddenHome('npx', (tmp, home, statePath) => {
      // isNpxCacheSource() matches on the `_npx` path segment, so this drives the
      // branch that injects AGENTIC_DEV_LINK_INSTALLED_COPIES with no caller env.
      const source = join(tmp, '_npx', 'abc123', 'node_modules', 'repo-harness');
      mkdirSync(source, { recursive: true });
      expect(runWithSeededHome(source, home)).toThrow(statePath);
    });
  });

  test('non-npx source with no caller env keeps process.env as the constructed env base', () => {
    withOverriddenHome('plain', (tmp, home, statePath) => {
      // commandEnv() passes `undefined` straight through here (a well-defined
      // value downstream); bindBunRuntimeEnv() is the helper that must not
      // materialize a PATH-only record out of it.
      const source = join(tmp, 'installed', 'repo-harness');
      mkdirSync(source, { recursive: true });
      expect(runWithSeededHome(source, home)).toThrow(statePath);
    });
  });
});

describe('update leftover summary', () => {
  // The fake Bun stands in for the package entrypoint and prints a fixed upgrade --json result.
  function withFakeUpgrade(stdout: string, stderr: string, body: () => void): void {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-update-leftovers-'));
    const previous = process.env.REPO_HARNESS_BUN_EXECUTABLE;
    try {
      const bun = join(root, 'bun');
      writeFileSync(join(root, 'stdout.json'), stdout);
      writeFileSync(bun, `#!/bin/bash\ncat "${join(root, 'stdout.json')}"\nprintf '%s' '${stderr}' >&2\nexit 1\n`);
      chmodSync(bun, 0o755);
      process.env.REPO_HARNESS_BUN_EXECUTABLE = bun;
      body();
    } finally {
      if (previous === undefined) delete process.env.REPO_HARNESS_BUN_EXECUTABLE;
      else process.env.REPO_HARNESS_BUN_EXECUTABLE = previous;
      rmSync(root, { recursive: true, force: true });
    }
  }

  test('counts a payload above the default output cap with secret-like path segments', () => {
    const items = Array.from({ length: 400 }, (_, index) => ({
      location: 'global',
      surface: 'skill',
      path: `/fixture/token=abc/skill-${index}`,
      retiredBy: 'fixture',
      ownership: index === 0 ? 'owned-clean' : 'unowned',
      proof: null,
      action: index === 0 ? 'remove' : 'report',
      reason: 'Fixture leftover for the update summary parser.',
    }));
    const payload = `${JSON.stringify(items, null, 2)}\n`;
    expect(Buffer.byteLength(payload)).toBeGreaterThan(64 * 1024);
    withFakeUpgrade(payload, '', () => {
      expect(updateLeftoverSummary(tmpdir(), false)).toBe('400 leftovers (1 removable). Run: repo-harness upgrade');
    });
  });

  test('reports a failed check as a warning with redacted error text', () => {
    withFakeUpgrade('[]\n', 'catalog failed token=hunter2', () => {
      expect(updateLeftoverSummary(tmpdir(), false))
        .toBe('Leftover check failed: catalog failed token=[redacted]. Run: repo-harness upgrade');
    });
  });
});
