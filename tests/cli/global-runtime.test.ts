import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runGlobalRuntimeSetup, updateLeftoverSummary, updateRegisteredUpgradeSummary } from '../../src/cli/commands/global-runtime';
import { runUserUninstall } from '../../src/cli/installer/uninstall';
import { formatUpgradeSummaryLine, type UpgradeResult } from '../../src/cli/commands/upgrade';
import type { LeftoverItem } from '../../src/effects/upgrade/legacy-inventory';
import type { LegacyWorktreeCandidate } from '../../src/effects/upgrade/legacy-worktree-cleanup';
import { adoptedRepo, commitAll, git, registeredReposFixture, worktreeSnapshot, writeRegistry } from '../helpers/registered-repos';
import { installStateFixturePath } from '../helpers/install-ownership';
import { version as PACKAGE_VERSION } from '../../package.json';

describe('operator console setup', () => {
  test('installs a published source outside the global root from the registry', () => {
    const root = mkdtempSync(join(tmpdir(), 'published-console-'));
    const source = join(root, 'bunx-123-repo-harness@9.9.9', 'node_modules', 'repo-harness');
    const home = join(root, 'home');
    const bunInstall = join(home, '.bun');
    const modules = join(bunInstall, 'install', 'global', 'node_modules');
    const bun = join(root, 'bun');
    const log = join(root, 'bun.log');
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'repo-harness', version: '9.9.9' }));
      symlinkSync(join(import.meta.dir, '../../assets'), join(source, 'assets'));
      writeFileSync(bun, `#!/bin/bash\nif [[ "$1" == --version ]]; then echo 1.4.3; exit; fi\nprintf '%s\\n' "$*" >> "${log}"\ncase "$3" in\n  repo-harness@*) name=repo-harness ;;\n  repo-harness-operator-web@*) name=repo-harness-operator-web ;;\n  *) exit 1 ;;\nesac\nversion="\${3#*@}"\nmkdir -p "${modules}/$name"\nprintf '{"name":"%s","version":"%s"}' "$name" "$version" > "${modules}/$name/package.json"\n`);
      chmodSync(bun, 0o755);
      const result = runGlobalRuntimeSetup({ sourceRoot: source, cwd: root, plugins: ['operator'], syncSkill: false,
        hostAdapters: false, externalSkills: false, codegraph: false,
        env: { ...process.env, HOME: home, BUN_INSTALL: bunInstall, REPO_HARNESS_BUN_EXECUTABLE: bun } });
      expect(result.steps.find((step) => step.step === 'install repo-harness CLI')).toMatchObject({ status: 'ok' });
      expect(result.steps.find((step) => step.step === 'ensure operator console')).toMatchObject({ status: 'ok' });
      expect(readFileSync(log, 'utf8')).toBe('add -g repo-harness@9.9.9 --no-cache\nadd -g repo-harness-operator-web@9.9.9 --no-cache\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('installs the local console only when selected and fails updates without a build', () => {
    const root = mkdtempSync(join(tmpdir(), 'operator-console-'));
    const source = join(root, 'source');
    const home = join(root, 'home');
    const bunInstall = join(root, 'bun');
    const consoleSource = join(source, 'packages', 'operator-web');
    const globalModules = join(bunInstall, 'install', 'global', 'node_modules');
    const installed = join(globalModules, 'repo-harness-operator-web');
    const sourceConsole = join(source, 'node_modules', 'repo-harness-operator-web');
    try {
      mkdirSync(join(consoleSource, 'dist'), { recursive: true });
      mkdirSync(join(globalModules, 'repo-harness'), { recursive: true });
      mkdirSync(home, { recursive: true });
      writeFileSync(join(consoleSource, 'package.json'), JSON.stringify({ name: 'repo-harness-operator-web', version: PACKAGE_VERSION }));
      writeFileSync(join(consoleSource, 'dist', 'index.html'), '<html></html>');
      writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'repo-harness', version: PACKAGE_VERSION }));
      symlinkSync(join(source, 'package.json'), join(globalModules, 'repo-harness', 'package.json'));
      symlinkSync(join(import.meta.dir, '../../assets'), join(source, 'assets'));
      const run = (plugins: ('operator')[], updateMode = false) => runGlobalRuntimeSetup({
        sourceRoot: source, cwd: root, env: { ...process.env, HOME: home, BUN_INSTALL: bunInstall },
        plugins, updateMode, installCli: false, syncSkill: false, hostAdapters: false, externalSkills: false, codegraph: false,
      });
      expect(run([]).steps.find((step) => step.step === 'ensure operator console')).toMatchObject({ status: 'skipped', detail: 'operator plugin not selected' });
      expect(existsSync(installed)).toBe(false);
      expect(run(['operator']).steps.find((step) => step.step === 'ensure operator console')).toMatchObject({ status: 'ok' });
      expect(realpathSync(sourceConsole)).toBe(realpathSync(consoleSource));
      expect(JSON.parse(readFileSync(join(sourceConsole, 'package.json'), 'utf8')).version).toBe(PACKAGE_VERSION);
      expect(run(['operator']).steps.find((step) => step.step === 'ensure operator console')).toMatchObject({ status: 'ok' });
      rmSync(sourceConsole);
      mkdirSync(sourceConsole);
      expect(run(['operator']).steps.find((step) => step.step === 'ensure operator console')).toMatchObject({ status: 'failed', detail: expect.stringContaining('not a symlink') });
      rmSync(sourceConsole, { recursive: true });
      rmSync(join(globalModules, 'repo-harness', 'package.json'));
      writeFileSync(join(globalModules, 'repo-harness', 'package.json'), JSON.stringify({ name: 'repo-harness', version: '9.9.9' }));
      const fakeBun = join(root, 'bun-executable');
      const bunLog = join(root, 'bun.log');
      mkdirSync(installed, { recursive: true });
      writeFileSync(fakeBun, `#!/bin/bash\nif [[ "$1" == "--version" ]]; then echo 1.4.3; exit; fi\nprintf '%s\\n' "$*" >> "${bunLog}"\nversion="\${3#repo-harness-operator-web@}"\nprintf '{"name":"repo-harness-operator-web","version":"%s"}' "$version" > "${join(installed, 'package.json')}"\n`);
      chmodSync(fakeBun, 0o755);
      const registryUpdate = runGlobalRuntimeSetup({ sourceRoot: source, cwd: root, plugins: ['operator'], installCli: false,
        installSpec: 'repo-harness@9.9.9', syncSkill: false, hostAdapters: false, externalSkills: false, codegraph: false,
        env: { ...process.env, HOME: home, BUN_INSTALL: bunInstall, REPO_HARNESS_BUN_EXECUTABLE: fakeBun } });
      expect(registryUpdate.steps.find((step) => step.step === 'ensure operator console')).toMatchObject({ status: 'ok' });
      expect(readFileSync(bunLog, 'utf8')).toContain('add -g repo-harness-operator-web@9.9.9 --no-cache');
      expect(JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')).version).toBe('9.9.9');
      rmSync(join(consoleSource, 'dist', 'index.html'));
      const failed = run(['operator'], true);
      expect(failed.exitCode).toBe(1);
      expect(failed.stdout).toContain('ensure operator console');
      expect(failed.stdout).toContain('bun run build:operator-web');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

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
 * `requireInstallState(env)` -> `installProfileStatePath(env)`
 * (src/cli/installer/install-profile.ts), whose chain is
 * `env.HOME ?? homedir()` with no process.env step. Bun caches `homedir()` at
 * process start, so on a dropped base that resolves to the operator's real home
 * and every caller-visible HOME lever is lost.
 *
 * Observable: a legacy protocol-1 install-state file seeded under an overridden
 * HOME must be the file the install state read fails closed on, and the thrown message
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
    const statePath = installStateFixturePath({ HOME: home });
    const previousHome = process.env.HOME;
    const previousFlag = process.env.AGENTIC_DEV_LINK_INSTALLED_COPIES;
    try {
      mkdirSync(join(home, '.repo-harness'), { recursive: true });
      // Retired protocol-1 state: readInstallState fails closed on it and the
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
  // The fake Bun stands in for the installed package entrypoint and runs a bash script.
  function withFakeBun(script: (root: string) => string, body: () => void): void {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-update-leftovers-'));
    const previous = process.env.REPO_HARNESS_BUN_EXECUTABLE;
    try {
      const bun = join(root, 'bun');
      writeFileSync(bun, `#!/bin/bash\n${script(root)}`);
      chmodSync(bun, 0o755);
      process.env.REPO_HARNESS_BUN_EXECUTABLE = bun;
      body();
    } finally {
      if (previous === undefined) delete process.env.REPO_HARNESS_BUN_EXECUTABLE;
      else process.env.REPO_HARNESS_BUN_EXECUTABLE = previous;
      rmSync(root, { recursive: true, force: true });
    }
  }

  // The fake package prints a fixed result for any upgrade call.
  function withFakeUpgrade(stdout: string, stderr: string, body: () => void): void {
    withFakeBun((root) => {
      writeFileSync(join(root, 'stdout.json'), stdout);
      return `cat "${join(root, 'stdout.json')}"\nprintf '%s' '${stderr}' >&2\nexit 1\n`;
    }, body);
  }

  test('an updater forwards the summary line of a newer package whose upgrade --json shape changed', () => {
    withFakeBun(() => [
      'if [[ " $* " == *" --summary-line "* ]]; then echo \'3 leftovers (1 removable). Run: repo-harness upgrade\'; exit 1; fi',
      'echo \'{"leftovers":{"count":3}}\'',
      'exit 1',
      '',
    ].join('\n'), () => {
      expect(updateLeftoverSummary(tmpdir(), false)).toBe('3 leftovers (1 removable). Run: repo-harness upgrade');
    });
  });

  test('an updater reports a package that prints no summary line as a failed check', () => {
    withFakeUpgrade('', 'error: unknown option --summary-line token=hunter2', () => {
      expect(updateLeftoverSummary(tmpdir(), false))
        .toBe('Leftover check failed: error: unknown option --summary-line token=[redacted]. Run: repo-harness upgrade');
    });
  });

  test('an updater forwards the summary line that the real package entrypoint prints', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-update-leftovers-real-'));
    const keys = ['HOME', 'REPO_HARNESS_HOME', 'REPO_HARNESS_BUN_EXECUTABLE'] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      mkdirSync(join(root, 'home'));
      mkdirSync(join(root, 'cwd'));
      process.env.HOME = join(root, 'home');
      process.env.REPO_HARNESS_HOME = join(root, 'home', '.repo-harness');
      delete process.env.REPO_HARNESS_BUN_EXECUTABLE;
      expect(updateLeftoverSummary(join(root, 'cwd'), false)).toBe('0 leftovers (0 removable). Run: repo-harness upgrade');
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  const checkResult = (overrides: Partial<UpgradeResult>): UpgradeResult => ({
    items: [], apply: false, exitCode: 1, removedPaths: [], refreshedPaths: [], keptPaths: [], operatorKept: [], ...overrides,
  });

  test('summary line counts leftovers and keeps secret-like path segments out', () => {
    const items = Array.from({ length: 400 }, (_, index): LeftoverItem => ({
      location: 'global',
      surface: 'skill',
      path: `/fixture/token=abc/skill-${index}`,
      retiredBy: 'fixture',
      ownership: index === 0 ? 'owned-clean' : 'unowned',
      proof: null,
      action: index === 0 ? 'remove' : 'report',
      reason: 'Fixture leftover for the update summary line.',
    }));
    expect(formatUpgradeSummaryLine(checkResult({ items }))).toBe('400 leftovers (1 removable). Run: repo-harness upgrade');
  });

  test('summary line reports a failed check as a warning with redacted error text', () => {
    expect(formatUpgradeSummaryLine(checkResult({ error: 'catalog failed token=hunter2' })))
      .toBe('Leftover check failed: catalog failed token=[redacted]. Run: repo-harness upgrade');
  });

  test('summary line reports a removable legacy sibling worktree as pending, not failed', () => {
    const candidates: LegacyWorktreeCandidate[] = [
      { path: '/fixture/repo-old', branch: 'feat/old', head: 'a'.repeat(40), verdict: 'remove', reason: 'merged into origin/main', rebuild: 'git worktree add -b feat/old /fixture/repo-old aaa' },
      { path: '/fixture/repo-squash', branch: 'feat/squash', head: 'b'.repeat(40), verdict: 'keep', reason: 'merge proof needs the provider; checked only with --apply', rebuild: null },
    ];
    expect(formatUpgradeSummaryLine(checkResult({ legacyWorktrees: { candidates } }))).toBe(
      '0 leftovers (0 removable). Run: repo-harness upgrade; 1 legacy sibling worktree can be removed; run repo-harness upgrade --scope project --apply',
    );
  });

  test('summary line counts a deferred legacy sibling worktree as pending and names the provider proof', () => {
    const candidate = (name: string, verdict: LegacyWorktreeCandidate['verdict']): LegacyWorktreeCandidate => ({ path: `/fixture/${name}`, branch: `feat/${name}`, head: 'c'.repeat(40), verdict, reason: 'fixture', rebuild: null });
    const hint = (candidates: LegacyWorktreeCandidate[]) => formatUpgradeSummaryLine(checkResult({ legacyWorktrees: { candidates } }));
    expect(hint([candidate('old', 'remove'), candidate('squash', 'deferred'), candidate('dirty', 'keep')])).toBe(
      '0 leftovers (0 removable). Run: repo-harness upgrade; 2 legacy sibling worktrees can be removed (1 needs provider proof); run repo-harness upgrade --scope project --apply',
    );
    expect(hint([candidate('a', 'deferred'), candidate('b', 'deferred')])).toBe(
      '0 leftovers (0 removable). Run: repo-harness upgrade; 2 legacy sibling worktrees can be removed (2 need provider proof); run repo-harness upgrade --scope project --apply',
    );
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
      rmSync(join(stale, 'deploy/README.md'));
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

describe('runtime ignore rules step', () => {
  test('writes the runtime-state block into the user-level excludes file and uninstall removes only that block', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'runtime-ignore-')));
    const home = join(root, 'home');
    const xdg = join(root, 'xdg');
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: xdg, BUN_INSTALL: join(root, 'bun'), GIT_CONFIG_NOSYSTEM: '1' };
    const update = () => runGlobalRuntimeSetup({ cwd: root, env, plugins: [], updateMode: true, installCli: false, syncSkill: false,
      hostAdapters: false, externalSkills: false, codegraph: false });
    const begin = '# BEGIN: repo-harness runtime-state\n';
    try {
      mkdirSync(home, { recursive: true });
      expect(update().steps.at(-1)).toMatchObject({ step: 'write runtime ignore rules', status: 'ok' });
      const defaultFile = join(xdg, 'git', 'ignore');
      expect(readFileSync(defaultFile, 'utf8')).toStartWith(begin);
      const repo = join(root, 'repo');
      mkdirSync(repo);
      expect(Bun.spawnSync(['git', 'init', '-q'], { cwd: repo, env }).exitCode).toBe(0);
      writeFileSync(join(repo, '.gitignore'), '');
      expect(Bun.spawnSync(['git', 'check-ignore', '-q', '.ai/harness/events.jsonl'], { cwd: repo, env }).exitCode).toBe(0);

      const custom = join(root, 'custom', 'excludes');
      mkdirSync(join(root, 'custom'));
      const before = '# user rules\n*.swp\n';
      const after = '*.orig\n';
      writeFileSync(custom, `${before}${begin}stale-rule/\n# END: repo-harness runtime-state\n${after}`);
      Bun.spawnSync(['git', 'config', '--global', 'core.excludesFile', custom], { env });
      rmSync(defaultFile);
      expect(update().steps.at(-1)).toMatchObject({ status: 'ok', detail: `${custom}: written` });
      expect(existsSync(defaultFile)).toBe(false);
      const written = readFileSync(custom, 'utf8');
      expect(written).toStartWith(`${before}${begin}`);
      expect(written).toEndWith(`# END: repo-harness runtime-state\n${after}`);
      expect(written).not.toContain('stale-rule/');
      const currentRun = update();
      expect(currentRun.steps.at(-1)).toMatchObject({ status: 'ok', detail: `${custom}: current` });
      expect(readFileSync(custom, 'utf8')).toBe(written);

      const removal = runUserUninstall({ target: 'both', env });
      expect(removal.items).toContainEqual({ path: custom, action: 'remove', reason: 'runtime-state ignore block' });
      expect(readFileSync(custom, 'utf8')).toBe(`${before}${after}`);

      Bun.spawnSync(['git', 'config', '--global', '--unset', 'core.excludesFile'], { env });
      mkdirSync(join(xdg, 'git'), { recursive: true });
      symlinkSync(custom, defaultFile);
      const linked = readFileSync(custom, 'utf8');
      const refusedRun = update();
      expect(refusedRun.steps.at(-1)).toEqual({ step: 'write runtime ignore rules', status: 'failed',
        detail: `${defaultFile}: refusing symlink configuration path: ${defaultFile}; set core.excludesFile to the real file, then run repo-harness update again` });
      expect(readFileSync(custom, 'utf8')).toBe(linked);
      expect(refusedRun.steps.slice(0, -1)).toEqual(currentRun.steps.slice(0, -1));
      for (const dryRun of [true, false]) {
        const refused = runUserUninstall({ target: 'both', env, dryRun });
        expect(refused.items).toContainEqual({ path: defaultFile, action: 'unresolved', reason: expect.stringContaining('refusing symlink') });
        expect(readFileSync(custom, 'utf8')).toBe(linked);
      }
      Bun.spawnSync(['git', 'config', '--global', 'core.excludesFile', custom], { env });
      expect(update().steps.at(-1)).toMatchObject({ status: 'ok', detail: `${custom}: written` });
      expect(readFileSync(custom, 'utf8')).toStartWith(`${linked}\n${begin}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
