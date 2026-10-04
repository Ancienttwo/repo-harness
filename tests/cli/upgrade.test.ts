import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { runUpgrade } from '../../src/cli/commands/upgrade';
import { planLegacyLeftovers } from '../../src/core/upgrade/legacy-inventory';
import { rollbackAdoptionTransaction } from '../../src/effects/fs-transaction';
import { hashManagedTree, PROFILE_COMPONENTS, readInstalledProfile } from '../../src/cli/installer/install-profile';
import { removeOwnedDanglingSkillLinks } from '../../src/effects/skill-tree-integrity';
import expectedReleaseInventory from './upgrade.expected.json';
import { copyUpgradeFixture, readUpgradeFixture, upgradeFixtureProvenance as provenance, UPGRADE_BLOBS, type UpgradeFixture } from '../helpers/upgrade-fixtures';

const ROOT = join(import.meta.dir, '../..');
const FIXTURES = join(ROOT, 'tests/fixtures');
const CLI = join(ROOT, 'src/cli/index.ts');
function seed(name: UpgradeFixture, target: string): void {
  for (const entry of provenance(name)) {
    if (entry.fixture_path.startsWith('release-source/')) continue;
    const dest = join(target, entry.fixture_path);
    copyUpgradeFixture(name, entry.fixture_path, dest);
  }
}
/** Include all file bytes and links. Never follow a link into another tree. */
function tree(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  function walk(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      const rel = relative(root, path);
      if (stat.isSymbolicLink()) result[rel] = `link:${readlinkSync(path)}`;
      else if (stat.isDirectory()) { result[rel] = 'directory'; walk(path); }
      else result[rel] = readFileSync(path).toString('base64');
    }
  }
  walk(root);
  return result;
}
function sandbox(run: (opts: { cwd: string; home: string; packageRoot: string }) => void, fixtures = true): void {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-real-release-')));
  const cwd = join(root, 'repo');
  const home = join(root, 'home');
  mkdirSync(cwd); mkdirSync(home);
  expect(spawnSync('git', ['init', '-q', cwd]).status).toBe(0);
  if (fixtures) { seed('upgrade-v0.10-project', cwd); seed('upgrade-v0.10-home', home); }
  try { run({ cwd, home, packageRoot: ROOT }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
function put(path: string, content: string): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
const projectHook = '.ai/hooks/prompt-guard.sh';

describe('upgrade with real release bytes', () => {
  test('every fixture file has release provenance and its recorded Git blob identity', () => {
    const listedBlobs = new Set<string>();
    for (const name of ['upgrade-v0.10-project', 'upgrade-v0.10-home', 'upgrade-v0.19.5-home'] as const) {
      const listed = new Set<string>();
      for (const entry of provenance(name)) {
        expect(entry.tag).toMatch(/^v0\./);
        expect(entry.commit).toMatch(/^[a-f0-9]{40}$/);
        expect(entry.path.length).toBeGreaterThan(0);
        const file = join(UPGRADE_BLOBS, entry.blob_sha);
        const result = spawnSync('git', ['hash-object', '--no-filters', file], { encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(entry.blob_sha);
        listed.add(entry.fixture_path);
        listedBlobs.add(entry.blob_sha);
      }
      expect(readdirSync(join(FIXTURES, name))).toEqual(['provenance.json']);
      sandbox(({ home }) => {
        copyUpgradeFixture(name, '', home);
        for (const [path, bytes] of Object.entries(tree(home))) {
          if (bytes !== 'directory') expect(listed.has(path)).toBe(true);
        }
        for (const entry of provenance(name)) {
          expect(readFileSync(join(home, entry.fixture_path))).toEqual(readUpgradeFixture(name, entry.fixture_path));
          expect(lstatSync(join(home, entry.fixture_path)).mode & 0o777).toBe(entry.mode);
        }
      }, false);
    }
    expect(readdirSync(UPGRADE_BLOBS).sort()).toEqual([...listedBlobs].sort());
  });

  test('CLI check returns structured ownership and writes no bytes or directories', () => sandbox((opts) => {
    const beforeHome = tree(opts.home); const beforeRepo = tree(opts.cwd);
    const result = spawnSync(process.execPath, [CLI, 'upgrade', '--json'], {
      cwd: opts.cwd, env: { ...process.env, HOME: opts.home, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' }, encoding: 'utf8', timeout: 60000,
    });
    expect(result.status).toBe(1);
    const items = JSON.parse(result.stdout);
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((item: Record<string, string>) => [item.location, item.surface,
      relative(item.location === 'global' ? opts.home : opts.cwd, item.path!), item.retiredBy,
      item.ownership, item.proof, item.action, item.hookEvent ?? null, item.hookCommand ?? null,
    ])).toEqual(expectedReleaseInventory);
    expect(items).toContainEqual(expect.objectContaining({
      location: 'project', surface: 'file', path: join(opts.cwd, projectHook),
      ownership: 'owned-clean', proof: 'historical-fingerprint', action: 'remove',
    }));
    expect(items).toContainEqual(expect.objectContaining({
      location: 'global', path: join(opts.home, '.repo-harness/hook-shim.sh'),
      ownership: 'owned-clean', proof: 'historical-fingerprint', action: 'remove',
    }));
    expect(tree(opts.home)).toEqual(beforeHome); expect(tree(opts.cwd)).toEqual(beforeRepo);
  }));

  test('check classifies a fixed release subset with a golden ownership report', () => sandbox((opts) => {
    for (const path of [projectHook, 'scripts/capture-plan.sh']) {
      put(join(opts.cwd, path), readUpgradeFixture('upgrade-v0.10-project', path).toString('utf8'));
    }
    seed('upgrade-v0.19.5-home', opts.home);
    const items = planLegacyLeftovers({ ...opts, scope: 'all' }).items;
    const targets = [join(opts.cwd, projectHook), join(opts.cwd, 'scripts/capture-plan.sh'), join(opts.home, '.codex/skills/claude-plan'), join(opts.home, '.codex/skills/repo-harness-cross-review')];
    expect(items.filter((item) => targets.includes(item.path)).map(({ path, ownership, proof, action }) => ({ path, ownership, proof, action })).sort((a, b) => a.path.localeCompare(b.path))).toEqual(targets.map((path) => ({ path, ownership: 'owned-clean' as const, proof: 'historical-fingerprint' as const, action: path.endsWith('/repo-harness-cross-review') ? 'refresh' as const : 'remove' as const })).sort((a, b) => a.path.localeCompare(b.path)));
  }, false));

  test('apply preserves modified surfaces, user files, docs and sibling hook keys', () => sandbox((opts) => {
    seed('upgrade-v0.19.5-home', opts.home);
    const modified = [join(opts.cwd, projectHook), join(opts.home, '.repo-harness/hook-shim.sh'), join(opts.home, '.codex/skills/claude-plan/SKILL.md')];
    for (const path of modified) writeFileSync(path, `${readFileSync(path, 'utf8')}\nuser edit\n`);
    const custom = join(opts.cwd, 'scripts/custom-owner-hook.sh'); put(custom, 'user script\n');
    const doc = join(opts.cwd, 'AGENTS.md'); put(doc, 'Run .ai/hooks/prompt-guard.sh for old setup.\n');
    const settingsPath = join(opts.home, '.claude/settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    settings.hooks.Stop ??= [];
    settings.hooks.Stop.push({ matcher: 'user', hooks: [{ type: 'command', command: 'echo user hook' }] });
    const config = { first: 'preserve', ...settings, last: { enabled: true } };
    writeFileSync(settingsPath, JSON.stringify(config, null, 2));
    chmodSync(settingsPath, 0o600);
    const result = runUpgrade({ ...opts, apply: true });
    expect(result.exitCode).toBe(0); expect(result.removedPaths.length).toBeGreaterThan(0);
    for (const path of modified) expect(readFileSync(path, 'utf8')).toContain('user edit');
    expect(readFileSync(custom, 'utf8')).toBe('user script\n');
    expect(readFileSync(doc, 'utf8')).toContain('prompt-guard.sh');
    expect(result.items.find((item) => item.path === doc)?.action).toBe('report');
    expect(lstatSync(settingsPath).mode & 0o777).toBe(0o600);
    const next = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(Object.keys(next)).toEqual(Object.keys(config));
    expect(next.hooks.Stop).toContainEqual({ matcher: 'user', hooks: [{ type: 'command', command: 'echo user hook' }] });
    expect(next.first).toBe('preserve'); expect(next.last).toEqual({ enabled: true });
    expect(existsSync(join(opts.home, '.codex/skills/repo-harness-cross-review/SKILL.md'))).toBe(true);
    expect(readFileSync(join(opts.home, '.codex/skills/repo-harness-cross-review/SKILL.md'), 'utf8')).toBe(readFileSync(join(ROOT, 'assets/skills/repo-harness-cross-review/SKILL.md'), 'utf8'));
    expect(existsSync(join(opts.home, '.codex/skills/repo-harness-cross-review/references/codex-plugin-mode.md'))).toBe(false);
    expect(result.items.some((item) => item.ownership !== 'owned-clean' && item.action === 'report')).toBe(true);
  }));

  test('global cleanup keeps user commands that contain retired hook paths', () => sandbox((opts) => {
    const shim = join(opts.home, '.repo-harness/hook-shim.sh');
    const userCommands = [
      'echo .ai/hooks/run-hook.sh',
      'echo .claude/hooks/run-hook.sh',
      `echo ${shim}`,
      `${shim} --user-option`,
      `bash "${shim}"`,
      'repo-harness hook Stop --route user',
    ];
    for (const name of ['.claude/settings.json', '.codex/hooks.json']) {
      const path = join(opts.home, name);
      const settings = JSON.parse(readFileSync(path, 'utf8'));
      const userHooks = userCommands.map((command) => ({ type: 'command', command }));
      settings.hooks.Stop = [{ matcher: 'user', hooks: [...userHooks, { type: 'command', command: shim }] }];
      writeFileSync(path, JSON.stringify(settings));
    }
    const plan = planLegacyLeftovers({ ...opts, scope: 'global' });
    expect(plan.items.filter((item) => userCommands.includes(item.hookCommand!))).toEqual([]);
    expect(plan.items.filter((item) => item.hookCommand === shim)).toHaveLength(2);
    expect(plan.items.some((item) => item.hookEvent === 'SessionStart')).toBe(true);
    const result = runUpgrade({ ...opts, scope: 'global', apply: true });
    expect(result.exitCode).toBe(0);
    for (const name of ['.claude/settings.json', '.codex/hooks.json']) {
      const settings = JSON.parse(readFileSync(join(opts.home, name), 'utf8'));
      expect(settings.hooks.Stop).toEqual([{
        matcher: 'user', hooks: userCommands.map((command) => ({ type: 'command', command })),
      }]);
      expect(settings.hooks.SessionStart).toBeUndefined();
    }
  }));

  test.each(['default', 'custom', 'custom-trailing-slash', 'custom-relative'])('global cleanup removes real installer shim commands from %s REPO_HARNESS_HOME', (kind) => sandbox((opts) => {
    const base = join(opts.home, kind === 'default' ? '.repo-harness' : 'custom-runtime');
    const harnessHome = kind === 'custom-trailing-slash' ? `${base}/` : kind === 'custom-relative' ? 'custom-runtime' : base;
    const shim = `${harnessHome}/hook-shim.sh`;
    const installer = join(FIXTURES, 'upgrade-v0.10-home/release-source/scripts/repo-harness.sh');
    const generated = spawnSync('bash', ['-c', 'source "$1" help >/dev/null; build_hooks_json', 'release-installer', installer], {
      env: { ...process.env, HOME: opts.home, REPO_HARNESS_HOME: harnessHome }, encoding: 'utf8',
    });
    expect(generated.status, generated.stderr).toBe(0);
    const hooks: Record<string, { hooks: { type: string; command: string }[] }[]> = JSON.parse(generated.stdout);
    const legacy = Object.values(hooks).flatMap((blocks) => blocks.flatMap((block) => block.hooks.map((hook) => hook.command)));
    expect(legacy).toHaveLength(11);
    expect(legacy).toContain(`bash ${shim} session-start-context.sh`);
    const user = [
      `echo ${legacy[0]}`,
      `${legacy[0]} --user-option`,
      `bash ${shim} user-owner.sh`,
      ': repo-harness-managed-hook-v1; repo-harness-hook Stop --route default',
    ].map((command) => ({ type: 'command', command }));
    for (const name of ['.claude/settings.json', '.codex/hooks.json']) {
      put(join(opts.home, name), JSON.stringify({ owner: 'user', hooks: {
        ...hooks, Stop: [...hooks.Stop, { matcher: 'user', hooks: user }],
      } }));
    }
    const env = { REPO_HARNESS_HOME: harnessHome };
    const plan = runUpgrade({ ...opts, env, scope: 'global' });
    expect(plan.items.filter((item) => legacy.includes(item.hookCommand!))).toHaveLength(22);
    expect(plan.items.filter((item) => user.some((hook) => hook.command === item.hookCommand))).toEqual([]);
    const result = runUpgrade({ ...opts, env, scope: 'global', apply: true });
    expect(result.exitCode).toBe(0);
    for (const name of ['.claude/settings.json', '.codex/hooks.json']) {
      expect(JSON.parse(readFileSync(join(opts.home, name), 'utf8'))).toEqual({
        owner: 'user', hooks: { Stop: [{ matcher: 'user', hooks: user }] },
      });
    }
  }));

  test('global cleanup removes four early installer shim hooks and keeps user mentions', () => sandbox((opts) => {
    const release = spawnSync('git', ['show', 'v0.1.2:scripts/repo-harness.sh'], { cwd: ROOT, encoding: 'utf8' });
    expect(release.status, release.stderr).toBe(0);
    const installer = join(opts.home, 'release-source/scripts/repo-harness.sh');
    put(installer, release.stdout);
    const generated = spawnSync('bash', ['-c', 'source "$1" help >/dev/null; build_hooks_json', 'early-release-installer', installer], {
      env: { ...process.env, HOME: opts.home }, encoding: 'utf8',
    });
    expect(generated.status, generated.stderr).toBe(0);
    const hooks: Record<string, { hooks: { type: string; command: string }[] }[]> = JSON.parse(generated.stdout);
    const names = ['trace-event.sh', 'context-pressure-hook.sh', 'autoresearch-advisory.sh', 'finalize-handoff.sh'];
    const legacy = Object.values(hooks).flatMap((blocks) => blocks.flatMap((block) => block.hooks.map((hook) => hook.command)));
    const early = legacy.filter((command) => names.some((name) => command.endsWith(` ${name}`)));
    expect([...new Set(early)].sort()).toEqual(names.map((name) => `bash ${opts.home}/.repo-harness/hook-shim.sh ${name}`).sort());
    const user = [...new Set(early)].flatMap((command) => [`echo ${command}`, `${command} --user-option`])
      .map((command) => ({ type: 'command', command }));
    for (const name of ['.claude/settings.json', '.codex/hooks.json']) {
      put(join(opts.home, name), JSON.stringify({ owner: 'user', hooks: {
        ...hooks, Stop: [...hooks.Stop, { matcher: 'user', hooks: user }],
      } }));
    }
    const plan = runUpgrade({ ...opts, scope: 'global' });
    expect(plan.items.filter((item) => early.includes(item.hookCommand!))).toHaveLength(early.length * 2);
    expect(plan.items.filter((item) => user.some((hook) => hook.command === item.hookCommand))).toEqual([]);
    expect(runUpgrade({ ...opts, scope: 'global', apply: true }).exitCode).toBe(0);
    for (const name of ['.claude/settings.json', '.codex/hooks.json']) {
      expect(JSON.parse(readFileSync(join(opts.home, name), 'utf8'))).toEqual({
        owner: 'user', hooks: { Stop: [{ matcher: 'user', hooks: user }] },
      });
    }
  }));

  test('global cleanup removes only full legacy typed command forms', () => sandbox((opts) => {
    const legacy = [
      'HOOK_HOST=codex repo-harness hook PreToolUse --route edit',
      'HOOK_HOST=claude repo-harness hook SessionStart --route default',
      'repo-harness hook Stop --route quality',
    ];
    const user = [
      ...legacy.flatMap((command) => [`echo ${command}`, `${command}; echo user`, `${command}\n`]),
      'repo-harness hook Stop --route user',
      'HOOK_HOST=other repo-harness hook Stop --route quality',
      'HOOK_HOST=codex repo-harness hook Unknown --route default',
    ].map((command) => ({ type: 'command', command }));
    for (const name of ['.claude/settings.json', '.codex/hooks.json']) {
      put(join(opts.home, name), JSON.stringify({ hooks: { Stop: [{ matcher: 'mixed', hooks: [
        ...legacy.map((command) => ({ type: 'command', command })), ...user,
      ] }] } }));
    }
    const plan = runUpgrade({ ...opts, scope: 'global' });
    expect(plan.items.filter((item) => legacy.includes(item.hookCommand!))).toHaveLength(6);
    expect(plan.items.filter((item) => user.some((hook) => hook.command === item.hookCommand))).toEqual([]);
    expect(runUpgrade({ ...opts, scope: 'global', apply: true }).exitCode).toBe(0);
    for (const name of ['.claude/settings.json', '.codex/hooks.json']) {
      expect(JSON.parse(readFileSync(join(opts.home, name), 'utf8')).hooks.Stop).toEqual([{ matcher: 'mixed', hooks: user }]);
    }
  }, false));

  test('a second apply removes nothing and changes no bytes', () => sandbox((opts) => {
    expect(runUpgrade({ ...opts, apply: true }).exitCode).toBe(0);
    const beforeHome = tree(opts.home); const beforeRepo = tree(opts.cwd);
    const second = runUpgrade({ ...opts, apply: true });
    expect(second.exitCode).toBe(0); expect(second.removedPaths).toEqual([]);
    expect(tree(opts.home)).toEqual(beforeHome); expect(tree(opts.cwd)).toEqual(beforeRepo);
  }));

  test('backups restore exact pre-apply target bytes and project rollback uses the adoption manifest', () => sandbox((opts) => {
    const originals = new Map(planLegacyLeftovers({ ...opts, scope: 'all' }).items.filter((item) => item.action !== 'report').map((item) => [item.path, lstatSync(item.path).isDirectory() ? tree(item.path) : readFileSync(item.path).toString('base64')]));
    const result = runUpgrade({ ...opts, apply: true });
    expect(result.exitCode).toBe(0); expect(result.backupPath).toBeDefined(); expect(result.projectBackupPath).toBeDefined();
    const manifestPath = join(result.backupPath!, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const snapshot of manifest.snapshots) {
      if (!snapshot.existed || !snapshot.backup_path) continue;
      rmSync(snapshot.path, { recursive: true, force: true });
      cpSync(snapshot.backup_path, snapshot.path, { recursive: true, verbatimSymlinks: true });
    }
    const rollback = rollbackAdoptionTransaction({ repoRoot: opts.cwd, transaction: relative(opts.cwd, result.projectBackupPath!) });
    expect(rollback.ok).toBe(true);
    for (const [path, bytes] of originals) expect(typeof bytes === 'string' ? readFileSync(path).toString('base64') : tree(path)).toEqual(bytes);
  }));

  test('TOCTOU edit after backup stays and appears as a report', () => sandbox((opts) => {
    const target = join(opts.cwd, projectHook);
    const result = runUpgrade({ ...opts, scope: 'project', apply: true }, { beforeRemove(item) { if (item.path === target) writeFileSync(target, 'concurrent user edit\n'); } });
    expect(result.exitCode).toBe(0); expect(readFileSync(target, 'utf8')).toBe('concurrent user edit\n');
    expect(result.items.find((item) => item.path === target)?.action).toBe('report');
    expect(result.removedPaths).not.toContain(target);
  }));

  test('a mid-apply write failure rolls back earlier targets and exits 1', () => sandbox((opts) => {
    const before = tree(opts.cwd); let count = 0; let lockedDir: string | undefined;
    try {
      const result = runUpgrade({ ...opts, scope: 'project', apply: true }, { beforeRemove(item) {
        if (++count === 2) {
          lockedDir = dirname(item.path);
          chmodSync(lockedDir, 0o555);
          // Cause a real permission failure. Restore the parent so compensation
          // can run without changing user permissions during rollback.
          try { rmSync(item.path); } finally { chmodSync(lockedDir, 0o755); }
        }
      } });
      expect(count).toBeGreaterThanOrEqual(2); expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
    } finally { if (lockedDir) chmodSync(lockedDir, 0o755); }
    for (const [path, content] of Object.entries(before)) expect(tree(opts.cwd)[path]).toBe(content);
  }));

  test('minimal project mode cleans real retired bytes and the source checkout stays a no-op', () => sandbox((opts) => {
    put(join(opts.cwd, '.ai/harness/policy.json'), '{"mode":"minimal"}\n');
    const result = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(result.exitCode).toBe(0); expect(existsSync(join(opts.cwd, projectHook))).toBe(false);
    expect(runUpgrade({ ...opts, cwd: ROOT, scope: 'project', apply: true }).items).toEqual([]);
  }));

  test('old package dangling links need an exact manifest target', () => sandbox((opts) => {
    const root = join(opts.home, '.codex/skills'); mkdirSync(root, { recursive: true });
    const owned = join(root, 'old-owned'); const unowned = join(root, 'old-user');
    const target = join(opts.home, 'old-package/missing-skill'); symlinkSync(target, owned); symlinkSync(target, unowned);
    put(join(opts.home, '.repo-harness/install-state.json'), JSON.stringify({ ownership_manifest: [{ authority: 'repo-harness-install-transaction', removal: 'managed-surfaces-only', path: owned, type: 'symlink', content_hash: null, symlink_target: target }] }));
    const result = runUpgrade({ ...opts, scope: 'global', apply: true });
    expect(result.exitCode).toBe(0); expect(() => lstatSync(owned)).toThrow(); expect(lstatSync(unowned).isSymbolicLink()).toBe(true);
    expect(result.items.find((item) => item.path === unowned)?.ownership).toBe('unowned');
  }, false));

  test('existing dangling-link helper uses exact old-package receipt without claiming a sibling', () => sandbox((opts) => {
    const root = join(opts.home, '.codex/skills'); mkdirSync(root, { recursive: true });
    const owned = join(root, 'old-owned'); const user = join(root, 'old-user');
    const target = join(opts.home, 'old-package/missing'); symlinkSync(target, owned); symlinkSync(target, user);
    const manifest = [{ authority: 'repo-harness-install-transaction', removal: 'managed-surfaces-only', path: owned, type: 'symlink', symlink_target: target }];
    expect(removeOwnedDanglingSkillLinks(ROOT, [root], true, manifest)).toEqual([owned]);
    expect(lstatSync(owned).isSymbolicLink()).toBe(true);
    expect(removeOwnedDanglingSkillLinks(ROOT, [root], false, manifest)).toEqual([owned]);
    expect(lstatSync(user).isSymbolicLink()).toBe(true);
  }, false));

  test('symlinked parents never grant ownership for matching release bytes', () => sandbox((opts) => {
    const external = join(opts.home, 'user-hooks'); mkdirSync(external);
    put(join(external, 'prompt-guard.sh'), readUpgradeFixture('upgrade-v0.10-project', projectHook).toString('utf8'));
    mkdirSync(join(opts.cwd, '.ai')); symlinkSync(external, join(opts.cwd, '.ai/hooks'));
    const before = tree(external);
    expect(runUpgrade({ ...opts, scope: 'project', apply: true }).removedPaths).toEqual([]);
    expect(tree(external)).toEqual(before);
  }, false));

  test('current global typed adapters stay while a legacy adapter is removed', () => sandbox((opts) => {
    const path = join(opts.home, '.codex/hooks.json');
    const current = ': repo-harness-managed-hook-v1; repo-harness-hook SessionStart --route context';
    const user = 'echo repo-harness';
    put(path, JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ command: current }, { command: 'repo-harness hook SessionStart --route context' }, { command: user }] }] } }));
    const result = runUpgrade({ ...opts, scope: 'global', apply: true });
    expect(result.exitCode).toBe(0);
    const after = readFileSync(path, 'utf8'); expect(after).toContain(current); expect(after).toContain(user);
    expect(after).not.toContain('repo-harness hook SessionStart');
  }, false));

  test('still-shipped historical copies refresh from this package and keep user-edited copies', () => sandbox((opts) => {
    seed('upgrade-v0.19.5-home', opts.home);
    const clean = join(opts.home, '.claude/skills/repo-harness-cross-review');
    const edited = join(opts.home, '.codex/skills/repo-harness-cross-review');
    writeFileSync(join(edited, 'SKILL.md'), `${readFileSync(join(edited, 'SKILL.md'), 'utf8')}\nuser edit\n`);
    const editedBefore = tree(edited);
    const check = runUpgrade({ ...opts, scope: 'global' });
    expect(check.items.find((item) => item.path === clean)?.action).toBe('refresh');
    expect(check.items.find((item) => item.path === edited)?.action).toBe('report');
    const result = runUpgrade({ ...opts, scope: 'global', apply: true });
    expect(result.exitCode).toBe(0); expect(result.refreshedPaths).toContain(clean);
    expect(readFileSync(join(clean, 'SKILL.md'), 'utf8')).toBe(readFileSync(join(ROOT, 'assets/skills/repo-harness-cross-review/SKILL.md'), 'utf8'));
    expect(existsSync(join(clean, 'references/generic-review.md'))).toBe(true);
    expect(existsSync(join(clean, 'references/claude-mode.md'))).toBe(false);
    expect(tree(edited)).toEqual(editedBefore);
    expect(runUpgrade({ ...opts, scope: 'global' }).items.some((item) => item.path === clean)).toBe(false);
    const before = tree(opts.home);
    expect(runUpgrade({ ...opts, scope: 'global', apply: true }).refreshedPaths).toEqual([]);
    expect(tree(opts.home)).toEqual(before);
  }, false));

  test('real v0.10 installer markers prove ownership for still-shipped copied skills', () => sandbox((opts) => {
    const source = join(opts.home, 'release-source'); mkdirSync(join(source, 'assets/skill-commands'), { recursive: true });
    copyUpgradeFixture('upgrade-v0.10-home', 'release-source/SKILL.md', join(source, 'SKILL.md'));
    for (const name of ['repo-harness-plan', 'repo-harness-handoff', 'repo-harness-gptpro', 'repo-harness-check']) {
      copyUpgradeFixture('upgrade-v0.10-home', `.codex/skills/${name}`, join(source, 'assets/skill-commands', name));
    }
    // The old installer must stay outside the source tree it copies and hashes.
    const installerRoot = join(opts.home, 'release-installer');
    copyUpgradeFixture('upgrade-v0.10-home', 'release-source', installerRoot);
    const installerPath = join(installerRoot, 'scripts/sync-codex-installed-copies.sh');
    const installer = spawnSync('bash', [installerPath], {
      env: { ...process.env, HOME: opts.home, AGENTIC_DEV_SOURCE_ROOT: source, CODEX_SKILLS_ROOT: join(opts.home, '.codex/skills'), CLAUDE_SKILLS_ROOT: '', REPO_HARNESS_INSTALL_PROFILE: 'strict', AGENTIC_DEV_LINK_INSTALLED_COPIES: '0', BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' }, encoding: 'utf8', timeout: 60000,
    });
    expect(installer.status).toBe(0);
    const installed = join(opts.home, '.codex/skills/repo-harness-check');
    expect(existsSync(join(installed, '.repo-harness-owner.json'))).toBe(true);
    const item = runUpgrade({ ...opts, scope: 'global' }).items.find((item) => item.path === installed);
    expect(item?.proof).toBe('owner-marker'); expect(item?.action).toBe('refresh');
    const result = runUpgrade({ ...opts, scope: 'global', apply: true });
    expect(result.exitCode).toBe(0); expect(result.refreshedPaths).toContain(installed);
    const router = join(opts.home, '.codex/skills/repo-harness');
    expect(result.refreshedPaths, JSON.stringify(result.items.find((item) => item.path === router))).toContain(router);
    expect(existsSync(join(router, '.git'))).toBe(false);
    expect(existsSync(join(router, 'node_modules'))).toBe(false);
  }, false));

  test('project helper and contract template refresh only with exact historical proof', () => sandbox((opts) => {
    const helper = '.ai/hooks/lib/workflow-state.sh'; const template = '.claude/templates/contract.template.md';
    for (const path of [helper, template]) put(join(opts.cwd, path), readUpgradeFixture('upgrade-v0.10-project', path).toString('utf8'));
    const check = runUpgrade({ ...opts, scope: 'project' });
    for (const path of [helper, template]) expect(check.items.find((item) => item.path === join(opts.cwd, path))).toEqual(expect.objectContaining({ proof: 'historical-fingerprint', action: 'refresh' }));
    const result = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(opts.cwd, helper), 'utf8')).toBe(readFileSync(join(ROOT, 'assets/hooks/lib/workflow-state.sh'), 'utf8'));
    expect(readFileSync(join(opts.cwd, template), 'utf8')).toBe(readFileSync(join(ROOT, 'assets/templates/contract.template.md'), 'utf8'));
    const rollback = rollbackAdoptionTransaction({ repoRoot: opts.cwd, transaction: relative(opts.cwd, result.projectBackupPath!) });
    expect(rollback.ok).toBe(true);
    for (const path of [helper, template]) writeFileSync(join(opts.cwd, path), `${readFileSync(join(opts.cwd, path), 'utf8')}\nuser edit\n`);
    const before = tree(opts.cwd);
    const kept = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(kept.refreshedPaths).toEqual([]); expect(tree(opts.cwd)).toEqual(before);
  }, false));

  test('manifest-owned refresh updates its backed-up receipt and remains clean', () => sandbox((opts) => {
    seed('upgrade-v0.19.5-home', opts.home);
    const path = join(opts.home, '.codex/skills/repo-harness-cross-review');
    const statePath = join(opts.home, '.repo-harness/install-state.json');
    const oldHash = hashManagedTree(path);
    const state = { protocol: 2, package_version: '0.19.5', profile: 'full', components: PROFILE_COMPONENTS.full,
      transaction_id: 'prior-install', applied_at: '2026-09-30T00:00:00Z', previous: null,
      ownership_manifest: [{ components: [], authority: 'repo-harness-install-transaction', removal: 'managed-surfaces-only', path, type: 'directory-copy', content_hash: oldHash, managed_marker: 'transaction-created-directory', symlink_target: null }] };
    put(statePath, JSON.stringify(state));
    const result = runUpgrade({ ...opts, scope: 'global', apply: true });
    expect(result.exitCode, result.error).toBe(0); expect(result.refreshedPaths).toContain(path);
    const current = readInstalledProfile({ ...process.env, HOME: opts.home });
    expect(current?.ownership_manifest.find((surface) => surface.path === path)?.content_hash).toBe(hashManagedTree(path));
    expect(current?.package_version).toBe(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version);
    const backup = JSON.parse(readFileSync(join(result.backupPath!, 'manifest.json'), 'utf8')).snapshots.find((snapshot: { path: string }) => snapshot.path === statePath);
    expect(JSON.parse(readFileSync(backup.backup_path, 'utf8'))).toEqual(state);
    expect(runUpgrade({ ...opts, scope: 'global' }).items.some((item) => item.path === path)).toBe(false);
  }, false));

  test('state artifact removal needs apply, explicit flag, and matching ownership', () => sandbox((opts) => {
    const gate = join(opts.home, '.repo-harness/gates/project/merge-gate.latest.json');
    const archive = join(opts.home, '.repo-harness/packages/repo-harness-0.10.0-local.tgz');
    const backup = join(opts.home, '.repo-harness/backups/pre-0.19.5-skills-local');
    const unowned = join(opts.home, '.repo-harness/gates/user/merge-gate.latest.json');
    put(gate, '{"status":"complete"}\n'); put(unowned, '{"status":"user"}\n');
    mkdirSync(dirname(archive), { recursive: true });
    const archiveSource = join(opts.cwd, 'archive-source');
    copyUpgradeFixture('upgrade-v0.19.5-home', '.codex/skills/repo-harness-cross-review', join(archiveSource, 'repo-harness-cross-review'));
    expect(spawnSync('tar', ['-czf', archive, '-C', archiveSource, 'repo-harness-cross-review']).status).toBe(0);
    cpSync(join(archiveSource, 'repo-harness-cross-review'), backup, { recursive: true });
    const surfaces = [gate, archive, backup].map((path) => ({ components: [], authority: 'repo-harness-install-transaction', removal: 'managed-surfaces-only', path, type: lstatSync(path).isDirectory() ? 'directory-copy' : 'managed-file', content_hash: lstatSync(path).isDirectory() ? hashManagedTree(path) : `sha256:${new Bun.CryptoHasher('sha256').update(readFileSync(path)).digest('hex')}`, managed_marker: 'transaction-created-file', symlink_target: null }));
    put(join(opts.home, '.repo-harness/install-state.json'), JSON.stringify({ ownership_manifest: surfaces }));
    const before = tree(opts.home);
    const check = runUpgrade({ ...opts, scope: 'global', includeStateArtifacts: true });
    for (const path of [gate, archive, backup]) expect(check.items.find((item) => item.path === path)?.action).toBe('report');
    expect(tree(opts.home)).toEqual(before);
    expect(runUpgrade({ ...opts, scope: 'global', apply: true }).removedPaths).toEqual([]);
    expect(tree(opts.home)).toEqual(before);
    const applied = runUpgrade({ ...opts, scope: 'global', apply: true, includeStateArtifacts: true });
    expect(applied.exitCode).toBe(0);
    for (const path of [gate, archive, backup]) expect(existsSync(path)).toBe(false);
    expect(readFileSync(unowned, 'utf8')).toBe('{"status":"user"}\n');
    expect(applied.items.find((item) => item.path === unowned)?.action).toBe('report');
  }, false));

  test('third-party Codex plugin and user rule lines always remain report-only', () => sandbox((opts) => {
    const plugin = join(opts.home, '.claude/plugins/cache/openai-codex/codex/1.0.0');
    put(join(plugin, 'plugin.json'), '{"name":"codex"}\n');
    put(join(opts.home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'codex@openai-codex': [{ installPath: plugin }] } }));
    put(join(opts.home, '.claude/settings.json'), JSON.stringify({ enabledPlugins: { 'codex@openai-codex': true } }));
    const docs = [join(opts.home, '.claude/CLAUDE.md'), join(opts.home, '.codex/AGENTS.md')];
    for (const path of docs) put(path, 'Use codex@openai-codex and scripts/capture-plan.sh.\n');
    const before = tree(opts.home);
    const result = runUpgrade({ ...opts, scope: 'global', apply: true, includeStateArtifacts: true });
    expect(result.exitCode).toBe(0); expect(result.removedPaths).toEqual([]); expect(result.refreshedPaths).toEqual([]);
    for (const path of [plugin, ...docs]) expect(result.items.find((item) => item.path === path)?.action).toBe('report');
    expect(tree(opts.home)).toEqual(before);
  }, false));
});
