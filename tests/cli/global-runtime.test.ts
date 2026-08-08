import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runGlobalRuntimeSetup } from '../../src/cli/commands/global-runtime';

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
