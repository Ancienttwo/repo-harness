import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runGlobalRuntimeSetup, updateLeftoverSummary, updateRegisteredUpgradeSummary } from '../../src/cli/commands/global-runtime';
import { adoptedRepo, commitAll, git, registeredReposFixture, worktreeSnapshot, writeRegistry } from '../helpers/registered-repos';

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
    const payload = `${JSON.stringify({ items, apply: false, exitCode: 1 }, null, 2)}\n`;
    expect(Buffer.byteLength(payload)).toBeGreaterThan(64 * 1024);
    withFakeUpgrade(payload, '', () => {
      expect(updateLeftoverSummary(tmpdir(), false)).toBe('400 leftovers (1 removable). Run: repo-harness upgrade');
    });
  });

  test('reports a failed check as a warning with redacted error text', () => {
    withFakeUpgrade('{"items":[],"error":"catalog failed"}\n', 'catalog failed token=hunter2', () => {
      expect(updateLeftoverSummary(tmpdir(), false))
        .toBe('Leftover check failed: catalog failed token=[redacted]. Run: repo-harness upgrade');
    });
  });

  test('reports a pending template rewrite with no leftover items as pending, not failed', () => {
    const payload = JSON.stringify({ items: [], apply: false, exitCode: 1, worktreeTemplate: { applied: false, item: { path: '.ai/harness/policy.json', action: 'rewrite', current: '../{{repo}}-wt-{{slug}}', replacement: '{{system_tmp}}/{{repo}}-wt-{{slug}}', reason: 'Legacy template.' } } });
    withFakeUpgrade(`${payload}\n`, '', () => {
      expect(updateLeftoverSummary(tmpdir(), false)).toBe(
        '0 leftovers (0 removable). Run: repo-harness upgrade; policy worktree template migration pending; run repo-harness upgrade --scope project --apply --migrate-worktree-template',
      );
    });
  });

  test('reports a removable legacy sibling worktree as pending, not failed', () => {
    const candidates = [
      { path: '/fixture/repo-old', branch: 'feat/old', head: 'a'.repeat(40), verdict: 'remove', reason: 'merged into origin/main', rebuild: 'git worktree add -b feat/old /fixture/repo-old aaa' },
      { path: '/fixture/repo-squash', branch: 'feat/squash', head: 'b'.repeat(40), verdict: 'keep', reason: 'merge proof needs the provider; checked only with --apply', rebuild: null },
    ];
    const payload = JSON.stringify({ items: [], apply: false, exitCode: 1, legacyWorktrees: { candidates } });
    withFakeUpgrade(`${payload}\n`, '', () => {
      expect(updateLeftoverSummary(tmpdir(), false)).toBe(
        '0 leftovers (0 removable). Run: repo-harness upgrade; 1 legacy sibling worktree can be removed; run repo-harness upgrade --scope project --apply',
      );
    });
  });

  test('counts a deferred legacy sibling worktree as pending and names the provider proof', () => {
    const candidate = (name: string, verdict: string) => ({ path: `/fixture/${name}`, branch: `feat/${name}`, head: 'c'.repeat(40), verdict, reason: 'fixture', rebuild: null });
    const hint = (candidates: unknown[]) => {
      let summary = '';
      withFakeUpgrade(`${JSON.stringify({ items: [], apply: false, exitCode: 1, legacyWorktrees: { candidates } })}\n`, '', () => {
        summary = updateLeftoverSummary(tmpdir(), false);
      });
      return summary;
    };
    expect(hint([candidate('old', 'remove'), candidate('squash', 'deferred'), candidate('dirty', 'keep')])).toBe(
      '0 leftovers (0 removable). Run: repo-harness upgrade; 2 legacy sibling worktrees can be removed (1 needs provider proof); run repo-harness upgrade --scope project --apply',
    );
    expect(hint([candidate('a', 'deferred'), candidate('b', 'deferred')])).toBe(
      '0 leftovers (0 removable). Run: repo-harness upgrade; 2 legacy sibling worktrees can be removed (2 need provider proof); run repo-harness upgrade --scope project --apply',
    );
  });

  test('a bare array payload is a failed check', () => {
    withFakeUpgrade('[]\n', '', () => {
      expect(updateLeftoverSummary(tmpdir(), false))
        .toBe('Leftover check failed: upgrade --json returned no leftover list. Run: repo-harness upgrade');
    });
  });

  test('registered summary counts pending ready repos and names skipped and failed repos', () => {
    const repos = [
      { path: '/fixture/a', status: 'ready', pending: true },
      { path: '/fixture/b', status: 'ready', pending: false },
      { path: '/fixture/c', status: 'skipped', reason: 'dirty_worktree' },
      { path: '/fixture/d', status: 'failed', error: 'init plan failed' },
    ];
    withFakeUpgrade(`${JSON.stringify({ revision: `sha256:${'0'.repeat(64)}`, apply: false, exitCode: 1, repos })}\n`, '', () => {
      expect(updateRegisteredUpgradeSummary(tmpdir(), false)).toBe(
        'Registered repos: 1 of 4 have pending project upgrade work; 1 skipped; 1 failed. Preview: repo-harness upgrade --registered',
      );
    });
  });

  test('registered summary says when the count cannot be computed instead of printing a number', () => {
    withFakeUpgrade('{"revision":null,"apply":false,"exitCode":2,"repos":[],"error":"registry authority is not valid JSON"}\n', '', () => {
      expect(updateRegisteredUpgradeSummary(tmpdir(), false)).toBe(
        'Registered repo upgrade check could not be computed: registry authority is not valid JSON. Preview: repo-harness upgrade --registered',
      );
    });
    withFakeUpgrade('not json\n', '', () => {
      expect(updateRegisteredUpgradeSummary(tmpdir(), false)).toBe(
        'Registered repo upgrade check could not be computed: upgrade --registered --json returned no repo list. Preview: repo-harness upgrade --registered',
      );
    });
  });

  test('an object with an error field is a failed check', () => {
    withFakeUpgrade('{"items":[],"apply":false,"exitCode":1,"error":"project upgrade needs a git repository"}\n', '', () => {
      expect(updateLeftoverSummary(tmpdir(), false))
        .toBe('Leftover check failed: project upgrade needs a git repository. Run: repo-harness upgrade');
    });
  });
});

describe('update registered repo summary', () => {
  test('runs the real preview and writes nothing in registered repos or the registry', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-update-registered-')));
    const f = registeredReposFixture(root);
    const keys = ['HOME', 'XDG_CONFIG_HOME', 'GIT_CONFIG_NOSYSTEM', 'REPO_HARNESS_HOME', 'REPO_HARNESS_WORKTREE_ROOT', 'REPO_HARNESS_BUN_EXECUTABLE'] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      const current = adoptedRepo(f, 'current');
      const stale = adoptedRepo(f, 'stale');
      rmSync(join(stale, '.ai/hooks/README.md'));
      commitAll(f, stale, 'drop managed file');
      writeRegistry(f, [current, stale, join(root, 'missing')]);
      const registryBefore = readFileSync(f.registry, 'utf8');
      const before = [current, stale].map((repo) => [worktreeSnapshot(repo), git(f, repo, 'status', '--porcelain'), git(f, repo, 'rev-parse', 'HEAD')]);
      for (const key of keys) {
        if (f.env[key] === undefined) delete process.env[key];
        else process.env[key] = f.env[key];
      }
      expect(updateRegisteredUpgradeSummary(root, false)).toBe(
        'Registered repos: 1 of 3 have pending project upgrade work; 1 skipped. Preview: repo-harness upgrade --registered',
      );
      expect(readFileSync(f.registry, 'utf8')).toBe(registryBefore);
      expect([current, stale].map((repo) => [worktreeSnapshot(repo), git(f, repo, 'status', '--porcelain'), git(f, repo, 'rev-parse', 'HEAD')])).toEqual(before);
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});
