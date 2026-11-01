import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { formatUpgradeResult, runUpgrade, runUpgradeDecide, UPGRADE_AUDIT_MAX_RECORDS } from '../../src/cli/commands/upgrade';
import { runAdoptionApply } from '../../src/cli/commands/adoption-plan';
import { LEGACY_WORKTREE_PROVIDER_DEFERRED, runLegacyWorktreeCleanup } from '../../src/effects/upgrade/legacy-worktree-cleanup';
import { localMergeMode } from '../../src/effects/state/coordination-worktree-topology';
import { taskWorkspaceKey } from '../../src/effects/git/repository-identity';
import { planLegacyLeftovers } from '../../src/effects/upgrade/legacy-inventory';
import { rollbackAdoptionTransaction } from '../../src/effects/fs-transaction';
import { PROFILE_COMPONENTS, readInstalledProfile } from '../../src/cli/installer/install-profile';
import { hashManagedTree } from '../../src/effects/managed-tree';
import { removeOwnedDanglingSkillLinks } from '../../src/effects/skill-tree-integrity';
import expectedReleaseInventory from './upgrade.expected.json';
import { copyUpgradeFixture, readUpgradeFixture, upgradeFixtureProvenance as provenance, UPGRADE_BLOBS, type UpgradeFixture } from '../helpers/upgrade-fixtures';
import { formatRegisteredUpgradeResult, runRegisteredUpgrade, type RegisteredRepoResult } from '../../src/cli/commands/upgrade-registered';
import { adoptedRepo, commitAll, git, registeredReposFixture, worktreeSnapshot, writeRegistry, type RegisteredReposFixture } from '../helpers/registered-repos';

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
    const { items } = JSON.parse(result.stdout);
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

  test('the cleanup audit log keeps only the newest records', () => sandbox((opts) => {
    const auditPath = join(opts.home, '.repo-harness/upgrade-cleanup.log.jsonl');
    const prior = Array.from({ length: UPGRADE_AUDIT_MAX_RECORDS }, (_, index) => JSON.stringify({ transaction_id: `prior-${index}` }));
    writeFileSync(auditPath, `${prior.join('\n')}\n`, { mode: 0o600 });

    const result = runUpgrade({ ...opts, scope: 'global', apply: true });

    expect(result.exitCode).toBe(0);
    const records = readFileSync(auditPath, 'utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
    expect(records).toHaveLength(UPGRADE_AUDIT_MAX_RECORDS);
    expect(records[0].transaction_id).toBe('prior-1');
    expect(records.at(-2).transaction_id).toBe(`prior-${UPGRADE_AUDIT_MAX_RECORDS - 1}`);
    expect(records.at(-1).removed_paths).toEqual(result.removedPaths);
  }));

  test.each(['default', 'custom', 'custom-trailing-slash', 'custom-relative'])('global cleanup removes real installer shim commands from %s REPO_HARNESS_HOME', (kind) => sandbox((opts) => {
    const base = join(opts.home, kind === 'default' ? '.repo-harness' : 'custom-runtime');
    const harnessHome = kind === 'custom-trailing-slash' ? `${base}/` : kind === 'custom-relative' ? 'custom-runtime' : base;
    const shim = `${harnessHome}/hook-shim.sh`;
    const installer = join(opts.home, 'v0.10-installer/scripts/repo-harness.sh');
    copyUpgradeFixture('upgrade-v0.10-home', 'release-source/scripts/repo-harness.sh', installer);
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

  test('init refresh drops retired adoption policy keys and reports them with the upgrade refresh', () => sandbox((opts) => {
    put(join(opts.cwd, '.ai/harness/policy.json'), JSON.stringify({
      active_plan: { directory: 'plans' },
      tasks: { current_status_file: 'tasks/current.md', workstreams_dir: 'tasks/workstreams', lessons_file: 'tasks/lessons.md' },
      custom_key: true,
    }, null, 2));
    const result = runAdoptionApply({ repo: opts.cwd, mode: 'standard', env: { HOME: opts.home } });
    expect(result.exitCode).toBe(0);
    expect((result.report.plan as { warnings: { code: string; message: string }[] }).warnings).toContainEqual(expect.objectContaining({
      code: 'retired-policy-keys',
      message: 'Removed retired harness policy keys: active_plan, tasks.current_status_file, tasks.workstreams_dir',
    }));
    const policy = JSON.parse(readFileSync(join(opts.cwd, '.ai/harness/policy.json'), 'utf8'));
    expect(policy.active_plan).toBeUndefined();
    expect(policy.tasks.current_status_file).toBeUndefined();
    expect(policy.tasks.workstreams_dir).toBeUndefined();
    expect(policy.tasks.lessons_file).toBe('tasks/lessons.md');
    expect(policy.custom_key).toBe(true);
  }));

  const RETIRED_RC_FIXTURE = join(FIXTURES, 'retired-flow-reference-configs');
  const RETIRED_RC_DOCS = [
    'handoff-protocol.md', 'workflow-orchestration.md', 'development-protocol.md',
    'sprint-contracts.md', 'contract-brief-example.md', 'contract-brief-example-bugfix.md',
  ];
  const retiredRcPaths = () => [
    'CLAUDE.md', 'AGENTS.md',
    ...RETIRED_RC_DOCS.map((name) => `docs/reference-configs/${name}`),
    'docs/architecture/snapshots/.gitkeep', 'docs/architecture/domains/.gitkeep',
  ];

  test('retired flow reference configs migrate by exact fingerprint while user edits and populated directories stay', () => sandbox((opts) => {
    cpSync(RETIRED_RC_FIXTURE, opts.cwd, { recursive: true });
    const modified = join(opts.cwd, 'docs/reference-configs/sprint-contracts.md');
    writeFileSync(modified, `${readFileSync(modified, 'utf8')}user edit\n`);
    put(join(opts.cwd, 'docs/architecture/snapshots/user-note.md'), '# User snapshot\n');
    const before = tree(opts.cwd);
    const rootTemplate = readFileSync(join(ROOT, 'assets/templates/root-context.md'), 'utf8');

    const check = runUpgrade({ ...opts, scope: 'project' });
    for (const name of RETIRED_RC_DOCS.filter((name) => name !== 'sprint-contracts.md')) {
      expect(check.items.find((item) => item.path === join(opts.cwd, 'docs/reference-configs', name))).toEqual(expect.objectContaining({
        action: 'remove', ownership: 'owned-clean', proof: 'historical-fingerprint',
      }));
    }
    expect(check.items.find((item) => item.path === modified)).toEqual(expect.objectContaining({
      action: 'report', ownership: 'unowned', proof: null,
    }));
    expect(check.items.find((item) => item.path === join(opts.cwd, 'docs/architecture/snapshots/.gitkeep'))).toEqual(expect.objectContaining({
      action: 'report', ownership: 'owned-clean', proof: 'historical-fingerprint',
    }));
    expect(check.items.find((item) => item.path === join(opts.cwd, 'docs/architecture/domains/.gitkeep'))).toEqual(expect.objectContaining({
      action: 'remove', ownership: 'owned-clean', proof: 'historical-fingerprint',
    }));
    for (const name of ['CLAUDE.md', 'AGENTS.md']) {
      expect(check.items.find((item) => item.path === join(opts.cwd, name))).toEqual(expect.objectContaining({
        action: 'refresh', ownership: 'owned-clean', proof: 'historical-fingerprint',
      }));
    }

    const result = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(result.exitCode, result.error).toBe(0);
    for (const name of RETIRED_RC_DOCS.filter((name) => name !== 'sprint-contracts.md')) {
      expect(existsSync(join(opts.cwd, 'docs/reference-configs', name))).toBe(false);
      expect(result.removedPaths).toContain(join(opts.cwd, 'docs/reference-configs', name));
    }
    expect(readFileSync(modified, 'utf8')).toContain('user edit');
    expect(result.removedPaths).not.toContain(modified);
    expect(existsSync(join(opts.cwd, 'docs/architecture/snapshots/.gitkeep'))).toBe(true);
    expect(existsSync(join(opts.cwd, 'docs/architecture/domains/.gitkeep'))).toBe(false);
    expect(readFileSync(join(opts.cwd, 'docs/architecture/snapshots/user-note.md'), 'utf8')).toBe('# User snapshot\n');
    for (const name of ['CLAUDE.md', 'AGENTS.md']) {
      expect(readFileSync(join(opts.cwd, name), 'utf8')).toBe(rootTemplate);
      expect(result.refreshedPaths).toContain(join(opts.cwd, name));
    }

    // The one transaction restores every touched path to its original bytes.
    const rollback = rollbackAdoptionTransaction({ repoRoot: opts.cwd, transaction: relative(opts.cwd, result.projectBackupPath!) });
    expect(rollback.ok, JSON.stringify(rollback.results)).toBe(true);
    const afterRollback = tree(opts.cwd);
    for (const path of retiredRcPaths().concat(['docs/architecture/snapshots/user-note.md'])) {
      expect(afterRollback[path], path).toBe(before[path]);
    }
  }));

  test('every byte-identical retired reference config is removed once and the migration is idempotent', () => sandbox((opts) => {
    cpSync(RETIRED_RC_FIXTURE, opts.cwd, { recursive: true });
    const result = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(result.exitCode, result.error).toBe(0);
    for (const path of retiredRcPaths()) {
      expect(result.removedPaths.includes(join(opts.cwd, path)) || result.refreshedPaths.includes(join(opts.cwd, path)), path).toBe(true);
      if (path.endsWith('.md') && path.includes('reference-configs')) expect(existsSync(join(opts.cwd, path)), path).toBe(false);
    }
    for (const path of ['docs/architecture/snapshots/.gitkeep', 'docs/architecture/domains/.gitkeep']) {
      expect(existsSync(join(opts.cwd, path))).toBe(false);
    }
    const before = tree(opts.cwd);
    const second = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(second.exitCode).toBe(0);
    expect(second.removedPaths).toEqual([]);
    expect(second.refreshedPaths).toEqual([]);
    expect(tree(opts.cwd)).toEqual(before);
  }));

  test('an injected migration failure restores every original byte and leaves a usable rollback manifest', () => sandbox((opts) => {
    cpSync(RETIRED_RC_FIXTURE, opts.cwd, { recursive: true });
    const before = tree(opts.cwd);
    let calls = 0;
    const result = runUpgrade({ ...opts, scope: 'project', apply: true }, { beforeRemove() {
      calls += 1;
      if (calls === 3) throw new Error('injected migration failure');
    } });
    expect(calls).toBe(3);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('injected migration failure');
    const afterFailure = tree(opts.cwd);
    for (const path of retiredRcPaths()) expect(afterFailure[path], path).toBe(before[path]);
    const rollback = rollbackAdoptionTransaction({ repoRoot: opts.cwd, transaction: relative(opts.cwd, result.projectBackupPath!) });
    expect(rollback.ok, JSON.stringify(rollback.results)).toBe(true);
    const afterRollback = tree(opts.cwd);
    for (const path of retiredRcPaths()) expect(afterRollback[path], path).toBe(before[path]);
  }));

  test('minimal mode removes and reports the retired policy keys like standard mode', () => sandbox((opts) => {
    put(join(opts.cwd, '.ai/harness/policy.json'), JSON.stringify({
      plan_capture: { script: 'repo-harness run capture-plan' },
      planning: { pending_orchestration_file: '.ai/harness/planning/pending.json', source_of_truth: 'plans/ and .ai/harness/active-plan remain authoritative' },
      guards: { edit_plan_gate: 'enforce', edit_plan_gate_modes: ['enforce', 'advice', 'off'], rule: 'the mutation-guard handler blocks implementation edits' },
      active_plan: { directory: 'plans' },
      tasks: { current_status_file: 'tasks/current.md', workstreams_dir: 'tasks/workstreams', lessons_file: 'tasks/lessons.md' },
      custom_key: true,
    }, null, 2));
    const result = runAdoptionApply({ repo: opts.cwd, mode: 'minimal', env: { HOME: opts.home } });
    expect(result.exitCode, result.output).toBe(0);
    const warnings = (result.report.plan as { warnings: { code: string; message: string }[] }).warnings;
    expect(warnings).toContainEqual(expect.objectContaining({
      code: 'retired-policy-keys',
      message: 'Removed retired harness policy keys: active_plan, plan_capture, tasks.current_status_file, tasks.workstreams_dir, guards.edit_plan_gate, guards.edit_plan_gate_modes, guards.rule, planning.source_of_truth',
    }));
    const policy = JSON.parse(readFileSync(join(opts.cwd, '.ai/harness/policy.json'), 'utf8'));
    expect(policy.active_plan).toBeUndefined();
    expect(policy.plan_capture).toBeUndefined();
    expect(policy.tasks.current_status_file).toBeUndefined();
    expect(policy.tasks.workstreams_dir).toBeUndefined();
    expect(policy.tasks.lessons_file).toBe('tasks/lessons.md');
    expect(policy.guards).toBeUndefined();
    expect(policy.planning.source_of_truth).toBeUndefined();
    expect(policy.planning.pending_orchestration_file).toBe('.ai/harness/planning/pending.json');
    expect(policy.custom_key).toBe(true);
  }));

  test('minimal init creates no policy file when the repository has none', () => sandbox((opts) => {
    expect(existsSync(join(opts.cwd, '.ai/harness/policy.json'))).toBe(false);
    const result = runAdoptionApply({ repo: opts.cwd, mode: 'minimal', env: { HOME: opts.home } });
    expect(result.exitCode, result.output).toBe(0);
    expect(existsSync(join(opts.cwd, '.ai/harness/policy.json'))).toBe(false);
  }));

  test('minimal project mode cleans real retired bytes and the source checkout stays a no-op', () => sandbox((opts) => {
    put(join(opts.cwd, '.ai/harness/policy.json'), '{"mode":"minimal"}\n');
    const result = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(result.exitCode).toBe(0); expect(existsSync(join(opts.cwd, projectHook))).toBe(false);
    expect(runUpgrade({ ...opts, cwd: ROOT, scope: 'project', apply: true }).items).toEqual([]);
  }));

  test('retired task artifact projections are removed only when their bytes are proven', () => sandbox((opts) => {
    // Rendered bytes of the deferredGoalLedger adoption template that init shipped before this retirement.
    const ledger = ['# Deferred Goal Ledger', '', '> **Status**: Backlog', '> **Updated**: (initial)',
      '> **Scope**: Medium/long-term goals deferred from active plan execution', '',
      "Current plan tasks live in the active plan's `## Task Breakdown`.",
      'Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.',
      '', '## Deferred Goals', '', '| Goal | Why Deferred | Tradeoff | Revisit Trigger |', '|------|--------------|----------|-----------------|',
      '| (none) | No deferred medium/long-term goal recorded yet. | Keep the first sprint bounded. | Add a row when a real follow-up is postponed. |', ''].join('\n');
    const proven = ['tasks/notes/.gitkeep', 'tasks/todos.md'];
    put(join(opts.cwd, 'tasks/notes/.gitkeep'), '');
    put(join(opts.cwd, 'tasks/todos.md'), ledger);
    put(join(opts.cwd, 'tasks/reviews/.gitkeep'), 'user note\n');
    put(join(opts.cwd, '.claude/templates/review.template.md'), '# Team review\n');
    const result = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(result.exitCode).toBe(0);
    expect([...result.removedPaths].sort()).toEqual(proven.map((path) => join(opts.cwd, path)).sort());
    for (const path of proven) expect(existsSync(join(opts.cwd, path))).toBe(false);
    expect(readFileSync(join(opts.cwd, 'tasks/reviews/.gitkeep'), 'utf8')).toBe('user note\n');
    expect(readFileSync(join(opts.cwd, '.claude/templates/review.template.md'), 'utf8')).toBe('# Team review\n');
    for (const path of ['tasks/reviews/.gitkeep', '.claude/templates/review.template.md']) {
      expect(result.items).toContainEqual(expect.objectContaining({ path: join(opts.cwd, path), ownership: 'unowned', action: 'report' }));
    }
  }, false));

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

  test('retired plan and task scaffolds are removed only when their bytes are proven', () => sandbox((opts) => {
    const helper = '.ai/hooks/lib/workflow-state.sh';
    cpSync(join(FIXTURES, 'retired-plan-task-scaffolds'), opts.cwd, { recursive: true });
    const modified = '.claude/templates/plan.template.md';
    writeFileSync(join(opts.cwd, modified), `${readFileSync(join(opts.cwd, modified), 'utf8')}user edit\n`);
    const proven = [
      'tasks/current.md',
      '.claude/templates/sprint.template.md',
      '.claude/templates/contract.template.md',
      'tasks/workstreams/.gitkeep',
      '.ai/harness/active-plan',
    ];
    const check = runUpgrade({ ...opts, scope: 'project' });
    for (const path of proven) {
      expect(check.items.find((item) => item.path === join(opts.cwd, path)), path).toEqual(expect.objectContaining({
        ownership: 'owned-clean', proof: 'historical-fingerprint', action: 'remove',
      }));
    }
    expect(check.items.find((item) => item.path === join(opts.cwd, modified))).toEqual(expect.objectContaining({
      ownership: 'unowned', proof: null, action: 'report',
    }));
    expect(check.items.find((item) => item.path === join(opts.cwd, helper))).toEqual(expect.objectContaining({ action: 'report', ownership: 'unowned', proof: null }));
    const result = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(result.exitCode).toBe(0);
    for (const path of proven) expect(result.removedPaths, path).toContain(join(opts.cwd, path));
    expect(result.removedPaths).not.toContain(join(opts.cwd, modified));
    for (const path of proven) expect(existsSync(join(opts.cwd, path))).toBe(false);
    expect(readFileSync(join(opts.cwd, modified), 'utf8')).toContain('user edit');
    expect(readFileSync(join(opts.cwd, helper), 'utf8')).toBe(readUpgradeFixture('upgrade-v0.10-project', helper).toString('utf8'));
    const before = tree(opts.cwd);
    const kept = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(kept.removedPaths).toEqual([]); expect(tree(opts.cwd)).toEqual(before);
  }));

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

  test('manifest-owned old-package link refresh retargets the link and keeps a symlink receipt', () => sandbox((opts) => {
    const path = join(opts.home, '.codex/skills/repo-harness-cross-review');
    const oldSource = join(opts.home, 'old-package/assets/skills/repo-harness-cross-review');
    const currentSource = join(ROOT, 'assets/skills/repo-harness-cross-review');
    const statePath = join(opts.home, '.repo-harness/install-state.json');
    put(join(oldSource, 'SKILL.md'), '# old package\n');
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(oldSource, path);
    const receipt = { components: ['cross-model-acceptance'], authority: 'repo-harness-install-transaction', removal: 'managed-surfaces-only', path, type: 'symlink', content_hash: null, managed_marker: null, symlink_target: oldSource } as const;
    const state = { protocol: 2, package_version: '0.19.5', profile: 'full', components: PROFILE_COMPONENTS.full,
      transaction_id: 'prior-install', applied_at: '2026-09-30T00:00:00Z', previous: null, ownership_manifest: [receipt] };
    put(statePath, JSON.stringify(state));
    expect(runUpgrade({ ...opts, scope: 'global' }).items.find((item) => item.path === path)?.action).toBe('refresh');

    const failed = runUpgrade({ ...opts, scope: 'global', apply: true }, { afterStage(item) {
      if (item.path === path) put(statePath, JSON.stringify({ ...state, transaction_id: 'concurrent-writer' }));
    } });
    expect(failed.exitCode).toBe(1);
    expect(readlinkSync(path)).toBe(oldSource);
    put(statePath, JSON.stringify(state));

    const result = runUpgrade({ ...opts, scope: 'global', apply: true });
    expect(result.exitCode, result.error).toBe(0); expect(result.refreshedPaths).toContain(path);
    expect(readlinkSync(path)).toBe(currentSource);
    const current = readInstalledProfile({ ...process.env, HOME: opts.home });
    expect(current?.ownership_manifest.find((surface) => surface.path === path)).toEqual({ ...receipt, symlink_target: currentSource });
    const before = tree(opts.home);
    expect(runUpgrade({ ...opts, scope: 'global', apply: true }).refreshedPaths).toEqual([]);
    expect(tree(opts.home)).toEqual(before);
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

describe('policy worktree template migration', () => {
  const policyPath = (cwd: string) => join(cwd, '.ai/harness/policy.json');
  const LEGACY = ['../{{repo}}-wt-{{slug}}', '/tmp/{{repo}}-wt-{{slug}}'];
  const PORTABLE = '{{system_tmp}}/{{repo}}-wt-{{slug}}';
  const policyText = (template: string) => `{\n    "mode": "standard",\n    "worktree_strategy": {\n        "branch_prefix": "codex/",\n        "worktree_dir_template": ${JSON.stringify(template)},\n        "merge_back": { "target": "main" }\n    }\n}\n`;
  const apply = (opts: { cwd: string; home: string; packageRoot: string }, migrate = true) =>
    runUpgrade({ ...opts, scope: 'project', apply: true, migrateWorktreeTemplate: migrate });

  test.each(LEGACY)('rewrites %s, keeps every other byte and rolls back from the manifest', (legacy) => sandbox((opts) => {
    put(policyPath(opts.cwd), policyText(legacy));
    const result = apply(opts);
    expect(result.exitCode, result.error).toBe(0);
    expect(result.worktreeTemplate).toMatchObject({ applied: true, item: { action: 'rewrite', current: legacy, replacement: PORTABLE } });
    // Four-space indent, key order and the sibling inline object stay as written.
    expect(readFileSync(policyPath(opts.cwd), 'utf8')).toBe(policyText(PORTABLE));
    expect(formatUpgradeResult(result)).toContain('rewritten');
    const manifest = result.worktreeTemplate!.transactionManifestPath!;
    expect(manifest).toStartWith('.ai/harness/backups/fs-transaction/');
    const rollback = rollbackAdoptionTransaction({ repoRoot: opts.cwd, transaction: manifest });
    expect(rollback.ok).toBe(true);
    expect(readFileSync(policyPath(opts.cwd), 'utf8')).toBe(policyText(legacy));
  }, false));

  test.each(['../custom-{{repo}}-{{slug}}', '/var/work/{{repo}}-wt-{{slug}}', '../{{repo}}-wt-{{slug}}/', '{{system_tmp}}/custom-{{repo}}-{{slug}}'])('keeps custom template %s and reports it', (custom) => sandbox((opts) => {
    put(policyPath(opts.cwd), policyText(custom));
    const before = tree(opts.cwd);
    const preview = runUpgrade({ ...opts, scope: 'project' });
    expect(preview.exitCode).toBe(0);
    expect(preview.worktreeTemplate?.item).toMatchObject({ action: 'report', current: custom });
    const result = apply(opts);
    expect(result.exitCode).toBe(0);
    expect(result.worktreeTemplate).toMatchObject({ applied: false, item: { action: 'report', current: custom } });
    expect(formatUpgradeResult(result)).toContain(custom);
    expect(tree(opts.cwd)).toEqual(before);
  }, false));

  test('preview and apply without the confirm flag write nothing', () => sandbox((opts) => {
    put(policyPath(opts.cwd), policyText(LEGACY[0]!));
    const before = tree(opts.cwd);
    const preview = runUpgrade({ ...opts, scope: 'project' });
    expect(preview.exitCode).toBe(1);
    expect(preview.worktreeTemplate).toMatchObject({ applied: false, item: { action: 'rewrite', current: LEGACY[0], replacement: PORTABLE } });
    expect(formatUpgradeResult(preview)).toContain('--apply --migrate-worktree-template');
    expect(JSON.parse(formatUpgradeResult(preview, true)).worktreeTemplate.item.action).toBe('rewrite');
    const unconfirmed = apply(opts, false);
    expect(unconfirmed.exitCode).toBe(0);
    expect(unconfirmed.worktreeTemplate).toMatchObject({ applied: false, item: { action: 'rewrite' } });
    expect(formatUpgradeResult(unconfirmed)).toContain('not written');
    expect(tree(opts.cwd)).toEqual(before);
  }, false));

  test('a second run is a no-op', () => sandbox((opts) => {
    put(policyPath(opts.cwd), policyText(LEGACY[1]!));
    expect(apply(opts).worktreeTemplate?.applied).toBe(true);
    const before = tree(opts.cwd);
    for (const second of [apply(opts), runUpgrade({ ...opts, scope: 'project' })]) {
      expect(second.exitCode).toBe(0);
      expect(second.worktreeTemplate).toBeUndefined();
    }
    expect(tree(opts.cwd)).toEqual(before);
  }, false));

  test('an absent template and an absent policy produce no item', () => sandbox((opts) => {
    expect(runUpgrade({ ...opts, scope: 'project' }).worktreeTemplate).toBeUndefined();
    put(policyPath(opts.cwd), '{"mode":"standard","worktree_strategy":{"branch_prefix":"codex/"}}\n');
    const result = apply(opts);
    expect(result.worktreeTemplate).toBeUndefined();
    expect(readFileSync(policyPath(opts.cwd), 'utf8')).toBe('{"mode":"standard","worktree_strategy":{"branch_prefix":"codex/"}}\n');
  }, false));

  test('a malformed policy is reported and never written', () => sandbox((opts) => {
    put(policyPath(opts.cwd), '{"worktree_strategy": {"worktree_dir_template": "../{{repo}}-wt-{{slug}}",}}\n');
    const before = tree(opts.cwd);
    const result = apply(opts);
    expect(result.worktreeTemplate).toMatchObject({ applied: false, item: { action: 'report' } });
    expect(result.worktreeTemplate?.item?.reason).toContain('not valid JSON');
    expect(tree(opts.cwd)).toEqual(before);
  }, false));

  test('a template literal that cannot be swapped byte-exact stays report-only', () => sandbox((opts) => {
    put(policyPath(opts.cwd), '{"worktree_strategy":{"worktree_dir_template":"..\\/{{repo}}-wt-{{slug}}"}}\n');
    const before = tree(opts.cwd);
    const result = apply(opts);
    expect(result.worktreeTemplate).toMatchObject({ applied: false, item: { action: 'report', current: LEGACY[0] } });
    expect(tree(opts.cwd)).toEqual(before);
  }, false));

  test('a policy edit between planning and writing fails the template write closed', () => sandbox((opts) => {
    put(policyPath(opts.cwd), policyText(LEGACY[0]!));
    const edited = policyText(LEGACY[0]!).replace('"codex/"', '"edited/"');
    const result = runUpgrade({ ...opts, scope: 'project', apply: true, migrateWorktreeTemplate: true },
      { beforeTemplateWrite: () => put(policyPath(opts.cwd), edited) });
    expect(result.exitCode).toBe(1);
    expect(result.worktreeTemplate?.applied).toBe(false);
    expect(result.worktreeTemplate?.error).toBeTruthy();
    expect(result.error).toBe(result.worktreeTemplate?.error);
    expect(readFileSync(policyPath(opts.cwd), 'utf8')).toBe(edited);
  }, false));

  test('global scope never reads the project policy', () => sandbox((opts) => {
    put(policyPath(opts.cwd), policyText(LEGACY[0]!));
    const result = runUpgrade({ ...opts, scope: 'global', apply: true, migrateWorktreeTemplate: true });
    expect(result.worktreeTemplate).toBeUndefined();
    expect(readFileSync(policyPath(opts.cwd), 'utf8')).toBe(policyText(LEGACY[0]!));
  }, false));
});

describe('legacy workflow-state upgrade report', () => {
  for (const edited of [false, true]) {
    test(`check and apply report and preserve ${edited ? 'edited' : 'historical'} library bytes`, () => sandbox((opts) => {
      const path = join(opts.cwd, '.ai/hooks/lib/workflow-state.sh');
      const bytes = readUpgradeFixture('upgrade-v0.10-project', '.ai/hooks/lib/workflow-state.sh').toString('utf8') + (edited ? '\n# Local operator changes\n' : '');
      put(path, bytes); chmodSync(path, 0o755);
      const beforeRepo = tree(opts.cwd); const beforeHome = tree(opts.home);
      const check = runUpgrade({ ...opts, scope: 'project' });
      expect(check.exitCode).toBe(1);
      expect(check.items).toHaveLength(1);
      expect(check.items[0]).toEqual(expect.objectContaining({ path, action: 'report', ownership: 'unowned', proof: null }));
      expect(check.items[0]?.reason).toContain('repo-harness run <helper>');
      expect(check.items[0]?.reason).not.toContain('hook-lib');
      expect(check.items[0]?.reason).toContain('back up');
      expect(check.items[0]?.reason).toContain('review local edits');
      const apply = runUpgrade({ ...opts, scope: 'project', apply: true });
      expect(apply.exitCode).toBe(0);
      expect(apply.keptPaths).toContain(path);
      expect(apply.removedPaths).toEqual([]); expect(apply.refreshedPaths).toEqual([]);
      expect(apply.transactionId).toBeUndefined();
      expect(readFileSync(path, 'utf8')).toBe(bytes);
      expect(lstatSync(path).mode & 0o777).toBe(0o755);
      expect(tree(opts.cwd)).toEqual(beforeRepo); expect(tree(opts.home)).toEqual(beforeHome);
      expect(runUpgrade({ ...opts, scope: 'global' }).items).toEqual([]);
    }, false));
  }

  test('CLI text and JSON both give manual migration steps from a nested cwd', () => sandbox((opts) => {
    const path = join(opts.cwd, '.ai/hooks/lib/workflow-state.sh');
    const bytes = readUpgradeFixture('upgrade-v0.10-project', '.ai/hooks/lib/workflow-state.sh');
    put(path, bytes.toString('utf8'));
    const invoke = (args: string[]) => spawnSync(process.execPath, [CLI, 'upgrade', '--scope', 'project', ...args], {
      cwd: dirname(path), env: { ...process.env, HOME: opts.home }, encoding: 'utf8', timeout: 60000,
    });
    const text = invoke([]); const json = invoke(['--json']);
    expect(text.status, text.stderr).toBe(1); expect(json.status, json.stderr).toBe(1);
    expect(text.stdout).toContain(path); expect(text.stdout).toContain('repo-harness run <helper>');
    const { items } = JSON.parse(json.stdout);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(expect.objectContaining({ path, action: 'report' }));
    expect(items[0].reason).toContain('manual removal');
    expect(readFileSync(path)).toEqual(bytes);
  }, false));

  test('package scripts that call a helper outside the shipped registry are report-only', () => sandbox((opts) => {
    const path = join(opts.cwd, 'package.json');
    const bytes = `${JSON.stringify({ name: 'fixture', scripts: {
      'workflow:check': 'repo-harness run check-task-workflow --strict',
      'check:task-sync': 'repo-harness run check-task-sync',
      'plan:new': 'bunx repo-harness run new-plan',
      'check:context-files': 'repo-harness run check-context-files',
      'spec:new': 'repo-harness run new-spec.sh',
      test: 'bun test',
    } }, null, '\t')}\n`;
    put(path, bytes);
    const check = runUpgrade({ ...opts, scope: 'project' });
    expect(check.items).toEqual([expect.objectContaining({ path, surface: 'file', retiredBy: 'retired-script-reference', action: 'report', ownership: 'unowned' })]);
    expect(check.items[0]?.reason).toContain('workflow:check: repo-harness run check-task-workflow --strict; check:task-sync: repo-harness run check-task-sync; plan:new: bunx repo-harness run new-plan');
    for (const live of ['check:context-files', 'spec:new', 'test:']) expect(check.items[0]?.reason).not.toContain(live);
    expect(runUpgradeDecide({ ...opts, decision: 'remove', paths: ['package.json'] }).rejected.map((rejection) => rejection.path)).toEqual(['package.json']);
    expect(runUpgrade({ ...opts, scope: 'project', apply: true }).keptPaths).toContain(path);
    expect(readFileSync(path, 'utf8')).toBe(bytes);
  }, false));

  test('leaf links are report-only and a symlink parent is never followed', () => sandbox((opts) => {
    const target = join(opts.home, 'operator-library.sh'); put(target, '# Outside operator file\n');
    const libDir = join(opts.cwd, '.ai/hooks/lib'); mkdirSync(libDir, { recursive: true });
    const path = join(libDir, 'workflow-state.sh'); symlinkSync(target, path);
    const check = runUpgrade({ ...opts, scope: 'project' });
    expect(check.items).toContainEqual(expect.objectContaining({ path, surface: 'symlink', action: 'report' }));
    expect(runUpgrade({ ...opts, scope: 'project', apply: true }).keptPaths).toContain(path);
    expect(readlinkSync(path)).toBe(target); expect(readFileSync(target, 'utf8')).toBe('# Outside operator file\n');
    rmSync(libDir, { recursive: true }); symlinkSync(opts.home, libDir, 'dir');
    put(join(opts.home, 'workflow-state.sh'), '# Library outside the repo\n');
    expect(runUpgrade({ ...opts, scope: 'project', apply: true }).items.some((item) => item.path === path)).toBe(false);
    expect(readFileSync(join(opts.home, 'workflow-state.sh'), 'utf8')).toBe('# Library outside the repo\n');
  }, false));
});

describe('upgrade operator decisions', () => {
  const decisionsFile = '.ai/harness/upgrade-decisions.json';
  const library = '.ai/hooks/lib/workflow-state.sh';
  const libraryBytes = () => readUpgradeFixture('upgrade-v0.10-project', library).toString('utf8');
  const sha = (path: string) => `sha256:${new Bun.CryptoHasher('sha256').update(readFileSync(path)).digest('hex')}`;
  const writeDecisions = (cwd: string, decisions: unknown) => put(join(cwd, decisionsFile), JSON.stringify({ version: 1, decisions }));
  const readDecisions = (cwd: string) => JSON.parse(readFileSync(join(cwd, decisionsFile), 'utf8'));

  test('keep removes the item from the pending list and exit code until the bytes change', () => sandbox((opts) => {
    const path = join(opts.cwd, library);
    put(path, libraryBytes());
    writeDecisions(opts.cwd, [{ path: library, decision: 'keep', contentHash: sha(path) }]);
    const check = runUpgrade({ ...opts, scope: 'project' });
    expect(check.exitCode, check.error).toBe(0);
    expect(check.items).toEqual([]);
    expect(check.operatorKept).toEqual([expect.objectContaining({ path, action: 'report', operatorDecision: { decision: 'keep', status: 'applied' } })]);
    const before = tree(opts.cwd);
    const apply = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(apply.exitCode, apply.error).toBe(0);
    expect(apply.removedPaths).toEqual([]);
    expect(apply.operatorKept.map((item) => item.path)).toEqual([path]);
    expect(tree(opts.cwd)).toEqual(before);

    writeFileSync(path, `${libraryBytes()}\n# edited after the decision\n`);
    const stale = runUpgrade({ ...opts, scope: 'project' });
    expect(stale.exitCode).toBe(1);
    expect(stale.operatorKept).toEqual([]);
    expect(stale.items).toEqual([expect.objectContaining({ path, action: 'report', operatorDecision: { decision: 'keep', status: 'stale' } })]);
    expect(stale.items[0]?.reason).toContain('decision is stale');
  }, false));

  test('remove deletes a regular file through the project backup manifest and init rollback restores it', () => sandbox((opts) => {
    const path = join(opts.cwd, library);
    put(path, libraryBytes());
    const decided = runUpgradeDecide({ ...opts, decision: 'remove', paths: [library] });
    expect(decided.exitCode, decided.error).toBe(0);
    expect(readDecisions(opts.cwd)).toEqual({ version: 1, decisions: [{ path: library, decision: 'remove', contentHash: sha(path) }] });
    const check = runUpgrade({ ...opts, scope: 'project' });
    expect(check.exitCode).toBe(1);
    expect(check.items).toEqual([expect.objectContaining({ path, action: 'remove', ownership: 'unowned', operatorDecision: { decision: 'remove', status: 'applied' } })]);
    expect(existsSync(path)).toBe(true);

    const result = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(result.exitCode, result.error).toBe(0);
    expect(result.removedPaths).toEqual([path]);
    expect(existsSync(path)).toBe(false);
    const manifest = JSON.parse(readFileSync(result.projectBackupPath!, 'utf8'));
    expect(manifest.operations).toEqual([expect.objectContaining({ kind: 'remove', path: library, status: 'applied', rollbackStrategy: 'restore-or-delete-file' })]);
    const rollback = rollbackAdoptionTransaction({ repoRoot: opts.cwd, transaction: relative(opts.cwd, result.projectBackupPath!) });
    expect(rollback.ok).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe(libraryBytes());
  }, false));

  test('remove is rejected for a directory and for a document that refers to a retired path', () => sandbox((opts) => {
    const directory = join(opts.cwd, library);
    put(join(directory, 'nested.sh'), '# operator directory\n');
    const doc = join(opts.cwd, 'CLAUDE.md');
    put(doc, `Run ${projectHook} for the old setup.\n`);
    const items = runUpgrade({ ...opts, scope: 'project' }).items;
    expect(items.find((item) => item.path === directory)).toEqual(expect.objectContaining({ surface: 'directory', action: 'report' }));
    expect(items.find((item) => item.path === doc)).toEqual(expect.objectContaining({ retiredBy: 'retired-script-reference', action: 'report' }));

    const decided = runUpgradeDecide({ ...opts, decision: 'remove', paths: [library, 'CLAUDE.md'] });
    expect(decided.exitCode).toBe(1);
    expect(decided.rejected.map((rejection) => rejection.path)).toEqual([library, 'CLAUDE.md']);
    expect(decided.rejected[0]?.reason).toContain('regular file');
    expect(decided.rejected[1]?.reason).toContain('retired path');
    expect(existsSync(join(opts.cwd, decisionsFile))).toBe(false);

    writeDecisions(opts.cwd, [
      { path: library, decision: 'remove', contentHash: hashManagedTree(directory) },
      { path: 'CLAUDE.md', decision: 'remove', contentHash: sha(doc) },
    ]);
    const before = tree(opts.cwd);
    const apply = runUpgrade({ ...opts, scope: 'project', apply: true });
    expect(apply.exitCode, apply.error).toBe(0);
    expect(apply.removedPaths).toEqual([]);
    for (const path of [directory, doc]) {
      expect(apply.items.find((item) => item.path === path)).toEqual(expect.objectContaining({
        action: 'report', operatorDecision: { decision: 'remove', status: 'rejected' },
      }));
    }
    expect(tree(opts.cwd)).toEqual(before);
    expect(runUpgrade({ ...opts, scope: 'project' }).exitCode).toBe(1);

    expect(runUpgradeDecide({ ...opts, decision: 'keep', paths: [library, 'CLAUDE.md'] }).exitCode).toBe(0);
    const kept = runUpgrade({ ...opts, scope: 'project' });
    expect(kept.exitCode, kept.error).toBe(0);
    expect(kept.operatorKept.map((item) => item.path).sort()).toEqual([directory, doc].sort());
  }, false));

  const invalidFiles: readonly [string, (cwd: string, hash: string) => void][] = [
    ['not JSON', (cwd) => put(join(cwd, decisionsFile), '{"version":1,')],
    ['an unknown version', (cwd, contentHash) => put(join(cwd, decisionsFile), JSON.stringify({ version: 2, decisions: [{ path: library, decision: 'keep', contentHash }] }))],
    ['an extra top-level key', (cwd) => put(join(cwd, decisionsFile), JSON.stringify({ version: 1, decisions: [], note: 'x' }))],
    ['an unknown decision', (cwd, contentHash) => writeDecisions(cwd, [{ path: library, decision: 'ignore', contentHash }])],
    ['a malformed hash', (cwd) => writeDecisions(cwd, [{ path: library, decision: 'keep', contentHash: 'sha256:abc' }])],
    ['a path outside the repository', (cwd, contentHash) => writeDecisions(cwd, [{ path: '../outside', decision: 'keep', contentHash }])],
    ['a duplicate path', (cwd, contentHash) => writeDecisions(cwd, [{ path: library, decision: 'keep', contentHash }, { path: library, decision: 'remove', contentHash }])],
    ['a directory at the decision path', (cwd) => mkdirSync(join(cwd, decisionsFile), { recursive: true })],
  ];
  for (const [name, write] of invalidFiles) {
    test(`a decision file with ${name} fails closed`, () => sandbox((opts) => {
      const path = join(opts.cwd, library);
      put(path, libraryBytes());
      write(opts.cwd, sha(path));
      const before = tree(opts.cwd);
      for (const apply of [false, true]) {
        const result = runUpgrade({ ...opts, scope: 'project', apply });
        expect(result.exitCode).toBe(1);
        expect(result.error).toContain('invalid upgrade decision file');
        expect(result.items).toEqual([]);
      }
      const decided = runUpgradeDecide({ ...opts, decision: 'keep', paths: [library] });
      expect(decided.exitCode).toBe(1);
      expect(decided.error).toContain('invalid upgrade decision file');
      expect(tree(opts.cwd)).toEqual(before);
    }, false));
  }

  test('decide rejects paths that are not report items and rewrites an existing entry in path order', () => sandbox((opts) => {
    const path = join(opts.cwd, library);
    put(path, libraryBytes());
    put(join(opts.cwd, 'CLAUDE.md'), `Run ${projectHook} for the old setup.\n`);
    put(join(opts.cwd, 'README.md'), '# User readme\n');

    const rejected = runUpgradeDecide({ ...opts, decision: 'keep', paths: ['README.md', library, '../outside.md'] });
    expect(rejected.exitCode).toBe(1);
    expect(rejected.rejected).toEqual([
      { path: 'README.md', reason: 'Path is not a current project upgrade report item.' },
      { path: '../outside.md', reason: 'Path is outside the repository.' },
    ]);
    expect(existsSync(join(opts.cwd, decisionsFile))).toBe(false);

    expect(runUpgradeDecide({ ...opts, decision: 'keep', paths: ['CLAUDE.md'] }).exitCode).toBe(0);
    expect(runUpgradeDecide({ ...opts, decision: 'keep', paths: [library] }).exitCode).toBe(0);
    const firstHash = sha(path);
    expect(readDecisions(opts.cwd).decisions).toEqual([
      { path: library, decision: 'keep', contentHash: firstHash },
      { path: 'CLAUDE.md', decision: 'keep', contentHash: sha(join(opts.cwd, 'CLAUDE.md')) },
    ]);

    writeFileSync(path, `${libraryBytes()}\n# edited\n`);
    expect(runUpgrade({ ...opts, scope: 'project' }).items[0]?.operatorDecision?.status).toBe('stale');
    const rewritten = runUpgradeDecide({ ...opts, decision: 'remove', paths: [library] });
    expect(rewritten.exitCode, rewritten.error).toBe(0);
    const decisions = readDecisions(opts.cwd).decisions;
    expect(decisions.map((entry: { path: string }) => entry.path)).toEqual([library, 'CLAUDE.md']);
    expect(decisions[0]).toEqual({ path: library, decision: 'remove', contentHash: sha(path) });
    expect(decisions[0].contentHash).not.toBe(firstHash);
    expect(existsSync(path)).toBe(true);
  }, false));

  test('CLI decide from a nested cwd records keep and the project check exits 0', () => sandbox((opts) => {
    const path = join(opts.cwd, library);
    put(path, libraryBytes());
    const invoke = (args: string[]) => spawnSync(process.execPath, [CLI, 'upgrade', ...args], {
      cwd: dirname(path), env: { ...process.env, HOME: opts.home }, encoding: 'utf8', timeout: 60000,
    });
    const decided = invoke(['decide', '--keep', 'workflow-state.sh', '--json']);
    expect(decided.status, decided.stderr).toBe(0);
    expect(JSON.parse(decided.stdout).recorded).toEqual([{ path: library, decision: 'keep', contentHash: sha(path) }]);
    expect(invoke(['decide', 'workflow-state.sh']).status).toBe(2);
    const check = invoke(['--scope', 'project', '--json']);
    expect(check.status, check.stderr).toBe(0);
    const checked = JSON.parse(check.stdout);
    expect(checked.items).toEqual([]);
    expect(checked.operatorKept.map((item: { path: string }) => item.path)).toEqual([expect.stringMatching(/\.ai\/hooks\/lib\/workflow-state\.sh$/)]);
    const text = invoke(['--scope', 'project']);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain(`Operator kept (${decisionsFile}):`);
    expect(text.stdout).toContain(path);
  }, false));
});

interface LegacyWorktreeFixture {
  readonly main: string;
  readonly projects: string;
  readonly managed: string;
  readonly home: string;
  readonly ghBin: string;
  readonly env: NodeJS.ProcessEnv;
  readonly git: (cwd: string, ...args: string[]) => string;
  /** Add a real linked worktree with one own commit, optionally merged into the target. */
  readonly worktree: (path: string, branch: string, merge: boolean) => string;
}

// Real `git worktree add` checkouts beside a primary checkout, with an
// isolated HOME and managed root. The provider stub knows no merged PR.
function legacyWorktreeSandbox(run: (f: LegacyWorktreeFixture) => void): void {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-legacy-worktrees-')));
  const projects = join(parent, 'projects');
  const main = join(projects, 'repo');
  const managed = join(parent, 'managed');
  const home = join(parent, 'home');
  for (const directory of [main, managed, home]) mkdirSync(directory, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, REPO_HARNESS_WORKTREE_ROOT: managed };
  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git(main, 'init', '-q', '-b', 'main');
  git(main, 'config', 'user.name', 'Test');
  git(main, 'config', 'user.email', 'test@example.test');
  writeFileSync(join(main, '.gitignore'), '.ai/\n.claude/\n');
  writeFileSync(join(main, 'README.md'), '# repo\n');
  git(main, 'add', '.');
  git(main, 'commit', '-qm', 'base');
  git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  const ghBin = join(parent, 'gh');
  writeFileSync(ghBin, '#!/bin/sh\necho "[]"\n');
  chmodSync(ghBin, 0o755);
  const worktree = (path: string, branch: string, merge: boolean) => {
    mkdirSync(dirname(path), { recursive: true });
    git(main, 'worktree', 'add', '-q', '-b', branch, path);
    writeFileSync(join(path, `${branch.replaceAll('/', '-')}.txt`), `${branch}\n`);
    git(path, 'add', '.');
    git(path, 'commit', '-qm', branch);
    if (merge) {
      git(main, 'merge', '-q', '--no-ff', '-m', `merge ${branch}`, branch);
      git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    }
    return path;
  };
  try { run({ main, projects, managed, home, ghBin, env, git, worktree }); }
  finally { rmSync(parent, { recursive: true, force: true }); }
}

describe('legacy sibling worktree cleanup', () => {
  test('apply removes only the merged, clean, unlocked and unowned sibling and its branch', () => legacyWorktreeSandbox((f) => {
    const merged = f.worktree(join(f.projects, 'merged'), 'feat/merged', true);
    const dirty = f.worktree(join(f.projects, 'dirty'), 'feat/dirty', true);
    writeFileSync(join(dirty, 'scratch.txt'), 'uncommitted\n');
    const unmerged = f.worktree(join(f.projects, 'unmerged'), 'feat/unmerged', false);
    const locked = f.worktree(join(f.projects, 'locked'), 'feat/locked', true);
    f.git(f.main, 'worktree', 'lock', locked);
    const owned = f.worktree(join(f.projects, 'owned'), 'feat/owned', true);
    put(join(f.main, '.ai/harness/active-worktree'), `${owned}\n`);
    const detached = join(f.projects, 'detached');
    f.git(f.main, 'worktree', 'add', '-q', '--detach', detached, 'HEAD');
    const nested = f.worktree(join(f.main, '.claude/worktrees/nested'), 'feat/nested', true);
    const managed = f.worktree(join(f.managed, 'repo-wt-managed'), 'feat/managed', true);
    const mergedHead = f.git(f.main, 'rev-parse', 'refs/heads/feat/merged');

    const preview = runLegacyWorktreeCleanup(f.main, f.main, f.env, false, { ghBin: f.ghBin });
    expect(preview.error).toBeUndefined();
    const byPath = new Map(preview.candidates.map((item) => [item.path, item]));
    expect([...byPath.keys()].sort()).toEqual([detached, dirty, locked, merged, owned, unmerged].sort());
    expect(byPath.has(nested)).toBe(false);
    expect(byPath.has(managed)).toBe(false);
    expect(byPath.get(merged)).toEqual({
      path: merged, branch: 'feat/merged', head: mergedHead, verdict: 'remove',
      reason: 'merged into refs/remotes/origin/main', rebuild: `git worktree add -b feat/merged ${merged} ${mergedHead}`,
    });
    expect(byPath.get(dirty)).toEqual(expect.objectContaining({ verdict: 'keep', reason: 'dirty worktree', rebuild: null }));
    expect(byPath.get(unmerged)).toEqual(expect.objectContaining({ verdict: 'deferred', reason: LEGACY_WORKTREE_PROVIDER_DEFERRED }));
    expect(byPath.get(locked)).toEqual(expect.objectContaining({ verdict: 'keep', reason: 'locked' }));
    expect(byPath.get(owned)).toEqual(expect.objectContaining({ verdict: 'keep', reason: 'cleanup has an active-worktree marker reference' }));
    expect(byPath.get(detached)).toEqual(expect.objectContaining({ branch: null, verdict: 'keep', reason: 'no local branch' }));
    for (const path of [merged, dirty, unmerged, locked, owned, detached, nested, managed]) expect(existsSync(path)).toBe(true);

    const announced: string[] = [];
    const applied = runLegacyWorktreeCleanup(f.main, f.main, f.env, true, { ghBin: f.ghBin, beforeRemove: (item) => announced.push(item.path) });
    expect(applied.error).toBeUndefined();
    expect(announced).toEqual([merged]);
    expect(applied.candidates.find((item) => item.path === merged)).toEqual(expect.objectContaining({ verdict: 'removed', head: mergedHead }));
    expect(applied.candidates.filter((item) => item.verdict === 'removed')).toHaveLength(1);
    expect(existsSync(merged)).toBe(false);
    expect(f.git(f.main, 'branch', '--list', 'feat/merged')).toBe('');
    for (const path of [dirty, unmerged, locked, owned, detached, nested, managed]) expect(existsSync(path)).toBe(true);
    for (const branch of ['feat/dirty', 'feat/unmerged', 'feat/locked', 'feat/owned', 'feat/nested', 'feat/managed']) {
      expect(f.git(f.main, 'branch', '--list', branch)).not.toBe('');
    }
    expect(readFileSync(join(dirty, 'scratch.txt'), 'utf8')).toBe('uncommitted\n');
  }));

  test('the local merge proof throws on unknown merge-library output instead of reading it as unmerged', () => legacyWorktreeSandbox((f) => {
    const merged = f.worktree(join(f.projects, 'merged'), 'feat/merged', true);
    const target = f.git(f.main, 'rev-parse', 'refs/remotes/origin/main');
    expect(localMergeMode(f.main, f.git(merged, 'rev-parse', 'HEAD'), target, {})).toBe('ancestor');
    // The library skips an empty branch argument, so its output names no mode.
    expect(() => localMergeMode(f.main, '', target, {})).toThrow('cleanup merge is unproven');
  }));

  test('a sibling inside the managed root is left to the sweep', () => legacyWorktreeSandbox((f) => {
    f.worktree(join(f.projects, 'merged'), 'feat/merged', true);
    const outcome = runLegacyWorktreeCleanup(f.main, f.main, { ...f.env, REPO_HARNESS_WORKTREE_ROOT: f.projects }, false, { ghBin: f.ghBin });
    expect(outcome).toEqual({ candidates: [] });
  }));

  test('a sibling that changes after preview is kept by the locked recheck', () => legacyWorktreeSandbox((f) => {
    const merged = f.worktree(join(f.projects, 'merged'), 'feat/merged', true);
    const applied = runLegacyWorktreeCleanup(f.main, f.main, f.env, true, {
      ghBin: f.ghBin, beforeRemove: () => writeFileSync(join(merged, 'late.txt'), 'late edit\n'),
    });
    expect(applied.error).toBeUndefined();
    expect(applied.candidates).toEqual([expect.objectContaining({ path: merged, verdict: 'keep', reason: 'changed before removal: cleanup_blocked_dirty_worktree' })]);
    expect(readFileSync(join(merged, 'late.txt'), 'utf8')).toBe('late edit\n');
    expect(f.git(f.main, 'branch', '--list', 'feat/merged')).not.toBe('');
  }));

  test('a sibling on the cloned integration branch is kept while the primary checkout is on another branch', () => legacyWorktreeSandbox((f) => {
    const clone = join(f.projects, 'clone');
    f.git(f.projects, 'clone', '-q', f.main, clone);
    f.git(clone, 'checkout', '-q', '-b', 'develop');
    const sibling = join(f.projects, 'clone-main');
    f.git(clone, 'worktree', 'add', '-q', sibling, 'main');
    const head = f.git(clone, 'rev-parse', 'refs/heads/main');
    for (const apply of [false, true]) {
      const outcome = runLegacyWorktreeCleanup(clone, clone, f.env, apply, { ghBin: f.ghBin });
      expect(outcome.error).toBeUndefined();
      expect(outcome.candidates).toEqual([{ path: sibling, branch: 'main', head, verdict: 'keep', reason: 'branch has no commits of its own', rebuild: null }]);
    }
    expect(existsSync(sibling)).toBe(true);
    expect(f.git(clone, 'rev-parse', 'refs/heads/main')).toBe(head);
  }));

  test('a sibling on the local integration branch is kept even with a direct commit in its reflog', () => legacyWorktreeSandbox((f) => {
    f.git(f.main, 'checkout', '-q', '-b', 'develop');
    const sibling = join(f.projects, 'main-checkout');
    f.git(f.main, 'worktree', 'add', '-q', sibling, 'main');
    writeFileSync(join(sibling, 'direct.txt'), 'direct\n');
    f.git(sibling, 'add', '.');
    f.git(sibling, 'commit', '-qm', 'direct commit on main');
    f.git(f.main, 'update-ref', 'refs/remotes/origin/main', 'refs/heads/main');
    const head = f.git(f.main, 'rev-parse', 'refs/heads/main');
    for (const apply of [false, true]) {
      const outcome = runLegacyWorktreeCleanup(f.main, f.main, f.env, apply, { ghBin: f.ghBin });
      expect(outcome.error).toBeUndefined();
      expect(outcome.candidates).toEqual([{ path: sibling, branch: 'main', head, verdict: 'keep', reason: 'integration branch', rebuild: null }]);
    }
    expect(existsSync(sibling)).toBe(true);
    expect(f.git(f.main, 'rev-parse', 'refs/heads/main')).toBe(head);
  }));

  test('a sibling on a branch named by a slash-named remote target is kept', () => legacyWorktreeSandbox((f) => {
    put(join(f.main, '.ai/harness/policy.json'), JSON.stringify({ worktree_strategy: { merge_back: { target: 'my/fork/main' } } }));
    f.git(f.main, 'update-ref', 'refs/remotes/my/fork/main', 'HEAD');
    f.git(f.main, 'checkout', '-q', '-b', 'develop');
    const sibling = join(f.projects, 'main-checkout');
    f.git(f.main, 'worktree', 'add', '-q', sibling, 'main');
    writeFileSync(join(sibling, 'direct.txt'), 'direct\n');
    f.git(sibling, 'add', '.');
    f.git(sibling, 'commit', '-qm', 'direct commit on main');
    const head = f.git(f.main, 'rev-parse', 'refs/heads/main');
    for (const apply of [false, true]) {
      const outcome = runLegacyWorktreeCleanup(f.main, f.main, f.env, apply, { ghBin: f.ghBin });
      expect(outcome.error).toBeUndefined();
      expect(outcome.candidates).toEqual([{ path: sibling, branch: 'main', head, verdict: 'keep', reason: 'integration branch', rebuild: null }]);
    }
    expect(existsSync(sibling)).toBe(true);
    expect(f.git(f.main, 'rev-parse', 'refs/heads/main')).toBe(head);
  }));

  test('a target that is not a branch keeps every sibling', () => legacyWorktreeSandbox((f) => {
    f.git(f.main, 'tag', 'v1');
    put(join(f.main, '.ai/harness/policy.json'), JSON.stringify({ worktree_strategy: { merge_back: { target: 'refs/tags/v1' } } }));
    const merged = f.worktree(join(f.projects, 'merged'), 'feat/merged', true);
    const head = f.git(f.main, 'rev-parse', 'refs/heads/feat/merged');
    for (const apply of [false, true]) {
      const outcome = runLegacyWorktreeCleanup(f.main, f.main, f.env, apply, { ghBin: f.ghBin });
      expect(outcome.error).toBeUndefined();
      expect(outcome.candidates).toEqual([{ path: merged, branch: 'feat/merged', head, verdict: 'keep', reason: 'integration target is not a branch', rebuild: null }]);
    }
    expect(existsSync(merged)).toBe(true);
    expect(f.git(f.main, 'branch', '--list', 'feat/merged')).not.toBe('');
  }));

  test('a never-committed branch at the target tip is kept', () => legacyWorktreeSandbox((f) => {
    const fresh = join(f.projects, 'fresh');
    f.git(f.main, 'worktree', 'add', '-q', '-b', 'fresh', fresh, 'refs/remotes/origin/main');
    for (const apply of [false, true]) {
      const outcome = runLegacyWorktreeCleanup(f.main, f.main, f.env, apply, { ghBin: f.ghBin });
      expect(outcome.error).toBeUndefined();
      expect(outcome.candidates).toEqual([expect.objectContaining({ path: fresh, branch: 'fresh', verdict: 'keep', reason: 'branch has no commits of its own' })]);
    }
    expect(existsSync(fresh)).toBe(true);
    expect(f.git(f.main, 'branch', '--list', 'fresh')).not.toBe('');
  }));

  test('a sibling with an open task runtime is kept', () => legacyWorktreeSandbox((f) => {
    const merged = f.worktree(join(f.projects, 'merged'), 'feat/merged', true);
    mkdirSync(join(f.main, '.ai/harness/runs/task-workspaces', taskWorkspaceKey(join(f.main, '.git'), merged)), { recursive: true });
    for (const apply of [false, true]) {
      const outcome = runLegacyWorktreeCleanup(f.main, f.main, f.env, apply, { ghBin: f.ghBin });
      expect(outcome.error).toBeUndefined();
      expect(outcome.candidates).toEqual([expect.objectContaining({ path: merged, verdict: 'keep', reason: 'runtime is open' })]);
    }
    expect(existsSync(merged)).toBe(true);
    expect(f.git(f.main, 'branch', '--list', 'feat/merged')).not.toBe('');
  }));

  test('a sibling with submodules is kept before removal', () => legacyWorktreeSandbox((f) => {
    const sibling = f.worktree(join(f.projects, 'submodules'), 'feat/submodules', false);
    writeFileSync(join(sibling, '.gitmodules'), '');
    f.git(sibling, 'add', '.gitmodules');
    f.git(sibling, 'commit', '-qm', 'gitmodules');
    f.git(f.main, 'merge', '-q', '--no-ff', '-m', 'merge feat/submodules', 'feat/submodules');
    f.git(f.main, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    for (const apply of [false, true]) {
      const outcome = runLegacyWorktreeCleanup(f.main, f.main, f.env, apply, { ghBin: f.ghBin });
      expect(outcome.error).toBeUndefined();
      expect(outcome.candidates).toEqual([expect.objectContaining({ path: sibling, verdict: 'keep', reason: 'submodules present' })]);
    }
    expect(existsSync(sibling)).toBe(true);
  }));

  test('project upgrade keeps the sibling that holds the caller cwd while cwd selects the repository', () => legacyWorktreeSandbox((f) => {
    const merged = f.worktree(join(f.projects, 'merged'), 'feat/merged', true);
    const callerCwd = join(merged, 'sub');
    mkdirSync(callerCwd);
    const opts = { cwd: f.main, callerCwd, home: f.home, packageRoot: ROOT, scope: 'project' as const, env: { REPO_HARNESS_WORKTREE_ROOT: f.managed } };
    for (const apply of [false, true]) {
      const result = runUpgrade({ ...opts, apply });
      expect(result.exitCode, result.error).toBe(0);
      expect(result.legacyWorktrees?.candidates).toEqual([expect.objectContaining({ path: merged, verdict: 'keep', reason: 'current checkout' })]);
    }
    expect(existsSync(merged)).toBe(true);
    expect(f.git(f.main, 'branch', '--list', 'feat/merged')).not.toBe('');
  }));

  test('project upgrade previews path, branch and HEAD with a pending exit, then apply removes the sibling', () => legacyWorktreeSandbox((f) => {
    const merged = f.worktree(join(f.projects, 'merged'), 'feat/merged', true);
    const head = f.git(f.main, 'rev-parse', 'refs/heads/feat/merged');
    const opts = { cwd: f.main, home: f.home, packageRoot: ROOT, scope: 'project' as const, env: { REPO_HARNESS_WORKTREE_ROOT: f.managed } };
    const preview = runUpgrade(opts);
    expect(preview.items).toEqual([]);
    expect(preview.exitCode, preview.error).toBe(1);
    const text = formatUpgradeResult(preview);
    expect(text).toContain('project legacy-worktree:');
    expect(text).toContain(`  ${merged}: branch=feat/merged; head=${head}; remove; merged into refs/remotes/origin/main`);
    expect(text).toContain(`    rebuild: git worktree add -b feat/merged ${merged} ${head}`);
    expect(text).toContain('  note: removal also deletes ignored files in the checkout (for example .env); commit or copy anything you need first.');
    const json = JSON.parse(formatUpgradeResult(preview, true));
    expect(json.legacyWorktrees.candidates).toEqual([expect.objectContaining({ path: merged, branch: 'feat/merged', head, verdict: 'remove' })]);
    expect(existsSync(merged)).toBe(true);

    const announced: string[] = [];
    const applied = runUpgrade({ ...opts, apply: true }, { beforeLegacyWorktreeRemove: (item) => announced.push(item.rebuild!) });
    expect(applied.exitCode, applied.error).toBe(0);
    expect(announced).toEqual([`git worktree add -b feat/merged ${merged} ${head}`]);
    expect(applied.legacyWorktrees?.candidates).toEqual([expect.objectContaining({ path: merged, verdict: 'removed' })]);
    expect(existsSync(merged)).toBe(false);
    expect(f.git(f.main, 'branch', '--list', 'feat/merged')).toBe('');
    const after = runUpgrade(opts);
    expect(after.legacyWorktrees).toBeUndefined();
    expect(after.exitCode, after.error).toBe(0);
  }));

  test('preview defers a squash-merged sibling as pending without querying the provider; apply proves it there and removes it', () => legacyWorktreeSandbox((f) => {
    const squashed = f.worktree(join(f.projects, 'squashed'), 'feat/squashed', false);
    const head = f.git(f.main, 'rev-parse', 'refs/heads/feat/squashed');
    f.git(f.main, 'merge', '-q', '--squash', 'feat/squashed');
    f.git(f.main, 'commit', '-qm', 'squash feat/squashed');
    const squash = f.git(f.main, 'rev-parse', 'HEAD');
    // A later edit of the same file defeats the local merge-tree proof, so only the provider can prove the merge.
    writeFileSync(join(f.main, 'feat-squashed.txt'), 'later\n');
    f.git(f.main, 'commit', '-qam', 'later conflicting edit');
    f.git(f.main, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    const log = join(dirname(f.ghBin), 'gh-merged.log');
    const gh = join(dirname(f.ghBin), 'gh-merged');
    const pulls = [{ number: 7, state: 'closed', merged_at: '2026-10-01T00:00:00Z', base: { ref: 'main' }, merge_commit_sha: squash }];
    writeFileSync(gh, `#!/bin/sh\necho "$*" >> '${log}'\necho '${JSON.stringify(pulls)}'\n`);
    chmodSync(gh, 0o755);

    const preview = runLegacyWorktreeCleanup(f.main, f.main, f.env, false, { ghBin: gh });
    const rebuild = `git worktree add -b feat/squashed ${squashed} ${head}`;
    expect(preview).toEqual({ candidates: [{ path: squashed, branch: 'feat/squashed', head, verdict: 'deferred', reason: LEGACY_WORKTREE_PROVIDER_DEFERRED, rebuild }] });
    expect(existsSync(log)).toBe(false);
    const upgradePreview = runUpgrade({ cwd: f.main, home: f.home, packageRoot: ROOT, scope: 'project', env: { REPO_HARNESS_WORKTREE_ROOT: f.managed } });
    expect(upgradePreview.exitCode, upgradePreview.error).toBe(1);
    expect(upgradePreview.legacyWorktrees?.candidates).toEqual([expect.objectContaining({ path: squashed, verdict: 'deferred', reason: LEGACY_WORKTREE_PROVIDER_DEFERRED })]);
    const text = formatUpgradeResult(upgradePreview);
    expect(text).toContain(`  ${squashed}: branch=feat/squashed; head=${head}; deferred; ${LEGACY_WORKTREE_PROVIDER_DEFERRED}`);
    expect(text).toContain(`    rebuild: ${rebuild}`);
    expect(text).toContain('  note: removal also deletes ignored files in the checkout (for example .env); commit or copy anything you need first.');
    expect(existsSync(log)).toBe(false);
    expect(existsSync(squashed)).toBe(true);

    const applied = runLegacyWorktreeCleanup(f.main, f.main, f.env, true, { ghBin: gh });
    expect(applied.error).toBeUndefined();
    expect(applied.candidates).toEqual([expect.objectContaining({ path: squashed, verdict: 'removed', reason: 'provider-proven merge into refs/remotes/origin/main' })]);
    expect(readFileSync(log, 'utf8')).toContain(`commits/${head}/pulls`);
    expect(existsSync(squashed)).toBe(false);
    expect(f.git(f.main, 'branch', '--list', 'feat/squashed')).toBe('');
  }));
});

// Use the real v0.10 copy writer to establish ownership. The current writer
// then stages a real package projection with active worktree residues.
function projectionSandbox(run: (opts: { cwd: string; home: string; packageRoot: string }, router: string) => void): void {
  sandbox((opts) => {
    const oldSource = join(opts.home, 'old-source');
    copyUpgradeFixture('upgrade-v0.10-home', 'release-source/SKILL.md', join(oldSource, 'SKILL.md'));
    const oldInstaller = join(opts.home, 'old-installer');
    copyUpgradeFixture('upgrade-v0.10-home', 'release-source', oldInstaller);
    const installed = spawnSync('bash', [join(oldInstaller, 'scripts/sync-codex-installed-copies.sh')], {
      env: { ...process.env, HOME: opts.home, AGENTIC_DEV_SOURCE_ROOT: oldSource,
        CODEX_SKILLS_ROOT: join(opts.home, '.codex/skills'), CLAUDE_SKILLS_ROOT: '',
        REPO_HARNESS_INSTALL_PROFILE: 'strict', AGENTIC_DEV_LINK_INSTALLED_COPIES: '0' }, encoding: 'utf8',
    });
    expect(installed.status, installed.stderr).toBe(0);
    const packageRoot = join(opts.home, 'active-source');
    mkdirSync(packageRoot);
    for (const path of ['src', 'scripts', 'assets', 'references', 'SKILL.md', 'package.json']) {
      cpSync(join(ROOT, path), join(packageRoot, path), { recursive: true, verbatimSymlinks: true });
    }
    put(join(packageRoot, '.ai/harness/state/effective.json'), '{"revision":1}\n');
    put(join(packageRoot, 'dist/oar-review-host.js'), 'shipped runtime bundle\n');
    put(join(packageRoot, 'dist/unshipped-build.js'), 'build residue\n');
    put(join(packageRoot, 'plans/untracked.md'), 'untracked plan\n');
    run({ ...opts, packageRoot }, join(opts.home, '.codex/skills/repo-harness'));
  }, false);
}

describe('upgrade copy projection fences', () => {
  test('runtime writes and new untracked plans during staging do not abort a real router refresh', () => projectionSandbox((opts, router) => {
    let staged = false;
    const result = runUpgrade({ ...opts, scope: 'global', apply: true }, {
      afterStage(item) {
        if (item.path !== router) return;
        staged = true;
        put(join(opts.packageRoot, '.ai/harness/state/effective.json'), '{"revision":2}\n');
        put(join(opts.packageRoot, 'plans/new-untracked.md'), 'new concurrent plan\n');
        put(join(opts.packageRoot, 'dist/unshipped-build.js'), 'new build residue\n');
      },
    });
    expect(staged).toBe(true);
    expect(result.exitCode, result.error).toBe(0);
    expect(result.refreshedPaths, JSON.stringify(result.items)).toContain(router);
    expect(readFileSync(join(router, 'SKILL.md'))).toEqual(readFileSync(join(opts.packageRoot, 'SKILL.md')));
    for (const path of ['.ai/harness/state/effective.json', 'plans/untracked.md', 'plans/new-untracked.md', 'dist/unshipped-build.js']) {
      expect(existsSync(join(router, path))).toBe(false);
    }
    expect(runUpgrade({ ...opts, scope: 'global' }).items.some(item => item.path === router)).toBe(false);
  }));

  for (const projected of ['SKILL.md', 'dist/oar-review-host.js']) test(`a projected ${projected} edit during staging aborts and preserves the installed bytes`, () => projectionSandbox((opts, router) => {
    const before = tree(router);
    let staged = false;
    const result = runUpgrade({ ...opts, scope: 'global', apply: true }, {
      afterStage(item) {
        if (item.path !== router) return;
        staged = true;
        put(join(opts.packageRoot, projected), 'concurrent projected file edit\n');
      },
    });
    expect(staged).toBe(true);
    expect(result.exitCode, result.error).toBe(0);
    expect(result.refreshedPaths).not.toContain(router);
    expect(result.items.find(item => item.path === router)).toEqual(expect.objectContaining({
      action: 'report', reason: 'Source or target changed during staging.',
    }));
    expect(tree(router)).toEqual(before);
  }));
});

test('a non-root provider uses its declared surface for hashing and real staging', async () => {
  const { hashUpgradeSource } = await import('../../src/effects/upgrade/legacy-inventory');
  projectionSandbox((opts) => {
    seed('upgrade-v0.19.5-home', opts.home);
    const provider = join(opts.home, '.codex/skills/repo-harness-cross-review');
    const source = join(opts.packageRoot, 'assets/skills/repo-harness-cross-review');
    put(join(source, 'examples/outside-projection.md'), 'source example outside canonical includes\n');
    const planned = runUpgrade({ ...opts, scope: 'global' }).items.find(item => item.path === provider);
    expect(planned?.action).toBe('refresh');
    expect(planned?.sourcePath).toBe(source);
    expect(planned?.sourceSurface).toBe('command-facade');
    expect(hashUpgradeSource(source, opts.packageRoot, 'canonical-skill'))
      .not.toBe(hashUpgradeSource(source, opts.packageRoot, 'command-facade'));
    let staged = false;
    const result = runUpgrade({ ...opts, scope: 'global', apply: true }, {
      afterStage(item, staging) {
        if (item.path !== provider) return;
        staged = true;
        expect(item.sourceSurface).toBe(planned?.sourceSurface);
        expect(hashUpgradeSource(source, opts.packageRoot, item.sourceSurface)).toBe(hashManagedTree(staging));
        expect(planned?.expectedSourceHash).toBe(hashManagedTree(staging));
        put(join(source, '.DS_Store'), 'concurrent excluded metadata edit\n');
      },
    });
    expect(staged).toBe(true);
    expect(result.exitCode, result.error).toBe(0);
    expect(result.refreshedPaths, JSON.stringify(result.items)).toContain(provider);
    expect(existsSync(join(provider, 'examples/outside-projection.md'))).toBe(true);
    expect(readFileSync(join(provider, 'SKILL.md'))).toEqual(readFileSync(join(source, 'SKILL.md')));
    expect(runUpgrade({ ...opts, scope: 'global' }).items.some(item => item.path === provider)).toBe(false);
  });
});

test('directory source hashing rejects missing and invalid surfaces while file hashing needs no surface', async () => {
  const { hashUpgradeSource, legacyPathSnapshot } = await import('../../src/effects/upgrade/legacy-inventory');
  expect(() => hashUpgradeSource(ROOT, ROOT, undefined)).toThrow('source surface is missing or invalid');
  expect(() => Reflect.apply(hashUpgradeSource, undefined, [ROOT, ROOT, 'unknown-surface']))
    .toThrow('source surface is missing or invalid');
  const file = join(ROOT, 'SKILL.md');
  expect(hashUpgradeSource(file, ROOT, undefined)).toBe(legacyPathSnapshot(file)?.contentHash ?? null);
});

function nonRouterSkillSandbox(
  name: 'repo-harness-cross-review' | 'repo-harness-chatgpt',
  run: (opts: { cwd: string; home: string; packageRoot: string }, source: string, installed: string) => void,
): void {
  projectionSandbox((opts) => {
    const source = join(opts.packageRoot, 'assets/skills', name);
    const installed = join(opts.home, '.codex/skills', name);
    const copied = spawnSync('bash', [join(opts.packageRoot, 'scripts/sync-codex-installed-copies.sh'),
      '--stage-owned-copy', source, installed, 'command-facade'], {
      env: { ...process.env, HOME: opts.home, BUN_INSTALL: join(opts.home, '.bun'),
        AGENTIC_DEV_SOURCE_ROOT: opts.packageRoot, AGENTIC_DEV_LINK_INSTALLED_COPIES: '0' }, encoding: 'utf8',
    });
    expect(copied.status, copied.stdout + copied.stderr).toBe(0);
    put(join(source, 'examples/new-resource.md'), 'new non-router resource\n');
    put(join(source, '.DS_Store'), 'excluded metadata\n');
    run(opts, source, installed);
  });
}

for (const name of ['repo-harness-cross-review', 'repo-harness-chatgpt'] as const) {
  test(`${name} refresh keeps top-level examples and matches a whole-folder copy with plain excludes`, async () => {
    const { installedCopyTreeOptions, managedTreeEntries } = await import('../../src/effects/managed-tree');
    nonRouterSkillSandbox(name, (opts, source, installed) => {
      const planned = runUpgrade({ ...opts, scope: 'global' }).items.find(item => item.path === installed);
      expect(planned?.action).toBe('refresh');
      expect(planned?.sourceSurface).toBe('command-facade');
      // Use the installer's real filesystem primitive as the independent copy.
      const wholeFolder = join(opts.home, `whole-folder-${name}`);
      cpSync(source, wholeFolder, { recursive: true });
      const contract = JSON.parse(readFileSync(join(opts.packageRoot, 'assets/workflow-contract.v1.json'), 'utf8'));
      const expectedFiles = managedTreeEntries(wholeFolder, installedCopyTreeOptions('command-facade', contract));
      let staged = false;
      const result = runUpgrade({ ...opts, scope: 'global', apply: true }, {
        afterStage(item, staging) {
          if (item.path !== installed) return;
          staged = true;
          expect(item.sourceSurface).toBe(planned?.sourceSurface);
          expect(managedTreeEntries(staging)).toEqual(expectedFiles);
          expect(planned?.expectedSourceHash).toBe(hashManagedTree(staging));
        },
      });
      expect(staged).toBe(true);
      expect(result.exitCode, result.error).toBe(0);
      expect(result.refreshedPaths, JSON.stringify(result.items)).toContain(installed);
      expect(managedTreeEntries(installed)).toEqual(expectedFiles);
      for (const entry of expectedFiles) {
        if (entry.type === 'symlink') expect(readlinkSync(join(installed, entry.path))).toBe(readlinkSync(join(wholeFolder, entry.path)));
        else expect(readFileSync(join(installed, entry.path))).toEqual(readFileSync(join(wholeFolder, entry.path)));
      }
      expect(readFileSync(join(installed, 'examples/new-resource.md'), 'utf8')).toBe('new non-router resource\n');
      expect(existsSync(join(installed, '.DS_Store'))).toBe(false);
    });
  });

  test(`${name} projected example edit during staging aborts and keeps installed bytes`, () => {
    nonRouterSkillSandbox(name, (opts, source, installed) => {
      const before = tree(installed);
      let staged = false;
      const result = runUpgrade({ ...opts, scope: 'global', apply: true }, {
        afterStage(item) {
          if (item.path !== installed) return;
          staged = true;
          put(join(source, 'examples/new-resource.md'), 'concurrent projected resource edit\n');
        },
      });
      expect(staged).toBe(true);
      expect(result.exitCode, result.error).toBe(0);
      expect(result.refreshedPaths).not.toContain(installed);
      expect(result.items.find(item => item.path === installed)).toEqual(expect.objectContaining({
        action: 'report', reason: 'Source or target changed during staging.',
      }));
      expect(tree(installed)).toEqual(before);
    });
  });
}

test('router keeps canonical includes while non-projected top-level examples change', () => projectionSandbox((opts, router) => {
  put(join(opts.packageRoot, 'examples/router-residue.md'), 'router worktree residue\n');
  const planned = runUpgrade({ ...opts, scope: 'global' }).items.find(item => item.path === router);
  expect(planned?.sourceSurface).toBe('canonical-skill');
  let staged = false;
  const result = runUpgrade({ ...opts, scope: 'global', apply: true }, {
    afterStage(item) {
      if (item.path !== router) return;
      staged = true;
      expect(item.sourceSurface).toBe('canonical-skill');
      put(join(opts.packageRoot, 'examples/router-residue.md'), 'concurrent router residue edit\n');
    },
  });
  expect(staged).toBe(true);
  expect(result.exitCode, result.error).toBe(0);
  expect(result.refreshedPaths).toContain(router);
  for (const path of ['examples/router-residue.md', 'plans/untracked.md', '.ai/harness/state/effective.json', 'dist/unshipped-build.js']) {
    expect(existsSync(join(router, path))).toBe(false);
  }
}));

describe('upgrade --registered', () => {
  const PORTABLE = '{{system_tmp}}/{{repo}}-wt-{{slug}}';
  const policyPath = (repo: string) => join(repo, '.ai/harness/policy.json');
  function registeredSandbox(run: (f: RegisteredReposFixture) => void): void {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-registered-')));
    try { run(registeredReposFixture(root)); }
    finally { rmSync(root, { recursive: true, force: true }); }
  }
  function editPolicy(f: RegisteredReposFixture, repo: string, edit: (policy: { worktree_strategy: Record<string, unknown> }) => void): void {
    const policy = JSON.parse(readFileSync(policyPath(repo), 'utf8'));
    edit(policy);
    writeFileSync(policyPath(repo), `${JSON.stringify(policy, null, 2)}\n`);
    commitAll(f, repo, 'edit policy');
  }
  /** Adopted and committed, then one managed file is deleted and the deletion committed. */
  function staleRepo(f: RegisteredReposFixture, name: string): string {
    const repo = adoptedRepo(f, name);
    rmSync(join(repo, '.ai/hooks/README.md'));
    commitAll(f, repo, 'drop managed file');
    return repo;
  }
  const byPath = (repos: readonly RegisteredRepoResult[], path: string) => {
    const repo = repos.find((entry) => entry.path === path);
    if (!repo) throw new Error(`no result for ${path}`);
    return repo;
  };
  const cli = (f: RegisteredReposFixture, ...args: string[]) => spawnSync(process.execPath, [CLI, 'upgrade', ...args], {
    cwd: f.root, env: { ...f.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' }, encoding: 'utf8', timeout: 120000,
  });

  test('preview classifies every row from one registry snapshot and writes nothing', () => registeredSandbox((f) => {
    const fresh = adoptedRepo(f, 'fresh');
    const stale = staleRepo(f, 'stale');
    const missing = join(f.root, 'missing');
    const linked = join(f.root, 'linked');
    git(f, fresh, 'worktree', 'add', '-q', '-b', 'feature', linked);
    const plain = join(f.root, 'plain');
    mkdirSync(plain);
    git(f, plain, 'init', '-q', '-b', 'main');
    const noBase = adoptedRepo(f, 'no-base');
    editPolicy(f, noBase, (policy) => { delete policy.worktree_strategy.base_branch; });
    const topic = adoptedRepo(f, 'topic');
    git(f, topic, 'checkout', '-q', '-b', 'topic');
    const dirty = adoptedRepo(f, 'dirty');
    writeFileSync(join(dirty, 'untracked.txt'), 'operator work\n');
    const broken = join(f.root, 'broken');
    mkdirSync(join(broken, '.ai/harness'), { recursive: true });
    writeFileSync(join(broken, '.ai/harness/policy.json'), '{}\n');
    writeFileSync(join(broken, '.git'), `gitdir: ${join(f.root, 'no-such-git-dir')}\n`);
    // An unregistered adopted repo is never a target: nothing scans directories.
    const unregistered = staleRepo(f, 'unregistered');
    const targets = [fresh, stale, missing, linked, plain, noBase, topic, dirty, broken];
    writeRegistry(f, targets);
    const registryBefore = readFileSync(f.registry, 'utf8');
    const before = Object.fromEntries([...targets.filter(existsSync), unregistered].map((path) => [path, worktreeSnapshot(path)]));

    const result = runRegisteredUpgrade({ env: f.env, callerCwd: f.root });
    expect(result.error).toBeUndefined();
    expect(result.apply).toBe(false);
    expect(result.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.repos.map((repo) => repo.path).sort()).toEqual([...targets].sort());
    expect(byPath(result.repos, fresh)).toMatchObject({ status: 'ready', pending: false, init: { planned: 0, operations: [] }, sweep: { ran: false } });
    const staleResult = byPath(result.repos, stale);
    expect(staleResult).toMatchObject({ status: 'ready', pending: true });
    expect((staleResult.init as { planned: number }).planned).toBeGreaterThan(0);
    expect((staleResult.init as { operations: readonly unknown[] }).operations).toContainEqual(expect.objectContaining({ path: '.ai/hooks/README.md' }));
    expect(staleResult.upgrade).toMatchObject({ apply: false, operatorKept: [] });
    const reasons = Object.fromEntries(result.repos.filter((repo) => repo.status === 'skipped').map((repo) => [repo.path, repo.reason]));
    expect(reasons).toEqual({
      [missing]: 'path_missing',
      [linked]: 'not_primary_checkout',
      [plain]: 'not_adopted',
      [noBase]: 'default_branch_unknown',
      [topic]: 'not_default_branch',
      [dirty]: 'dirty_worktree',
      [broken]: 'git_probe_failed',
    });
    for (const repo of result.repos.filter((entry) => entry.status === 'skipped')) {
      expect(repo.detail?.length).toBeGreaterThan(0);
      expect(repo.init ?? repo.upgrade ?? repo.sweep).toBeUndefined();
    }
    expect(result.exitCode).toBe(1);
    const text = formatRegisteredUpgradeResult(result);
    expect(text).toContain(`Registry revision: ${result.revision}`);
    expect(text).toContain(`${dirty}: skipped (dirty_worktree)`);
    expect(text).toContain('no dry-run path');
    expect(text).toContain(`--apply --expected-revision ${result.revision}`);

    const json = cli(f, '--registered', '--json');
    expect(json.status, json.stderr).toBe(1);
    const payload = JSON.parse(json.stdout);
    expect(Object.keys(payload).sort()).toEqual(['apply', 'exitCode', 'repos', 'revision']);
    expect(payload.revision).toBe(result.revision);
    expect(payload.repos.map((repo: RegisteredRepoResult) => [repo.path, repo.status, repo.reason ?? null]).sort())
      .toEqual(result.repos.map((repo) => [repo.path, repo.status, repo.reason ?? null]).sort());

    expect(readFileSync(f.registry, 'utf8')).toBe(registryBefore);
    for (const [path, snapshot] of Object.entries(before)) expect(worktreeSnapshot(path)).toEqual(snapshot);
    expect(git(f, dirty, 'status', '--porcelain')).toBe('?? untracked.txt');
  }), 120_000);

  test('apply refuses a missing or changed registry revision before any repo write', () => registeredSandbox((f) => {
    const stale = staleRepo(f, 'stale');
    writeRegistry(f, [stale]);
    const before = worktreeSnapshot(stale);
    const preview = runRegisteredUpgrade({ env: f.env, callerCwd: f.root });
    expect(byPath(preview.repos, stale).pending).toBe(true);

    const unfenced = runRegisteredUpgrade({ apply: true, env: f.env, callerCwd: f.root });
    expect(unfenced).toMatchObject({ exitCode: 2, repos: [], error: '--apply requires --expected-revision from the preview' });

    writeRegistry(f, [stale], 2);
    const changed = runRegisteredUpgrade({ apply: true, expectedRevision: preview.revision!, env: f.env, callerCwd: f.root });
    expect(changed).toMatchObject({ exitCode: 2, repos: [], error: 'registry revision changed; preview again before applying' });
    expect(changed.revision).not.toBe(preview.revision);
    expect(worktreeSnapshot(stale)).toEqual(before);

    const mismatch = cli(f, '--registered', '--apply', '--expected-revision', preview.revision!, '--json');
    expect(mismatch.status).toBe(2);
    expect(JSON.parse(mismatch.stdout)).toMatchObject({ apply: true, repos: [], error: 'registry revision changed; preview again before applying' });
    expect(cli(f, '--expected-revision', preview.revision!).status).toBe(2);
    expect(cli(f, '--registered', '--scope', 'global').status).toBe(2);
    expect(worktreeSnapshot(stale)).toEqual(before);
  }), 120_000);

  test('apply re-checks each repo, isolates a failing repo and never commits', () => registeredSandbox((f) => {
    const stale = staleRepo(f, 'stale');
    const template = adoptedRepo(f, 'template');
    editPolicy(f, template, (policy) => { policy.worktree_strategy.worktree_dir_template = '../{{repo}}-wt-{{slug}}'; });
    const failing = adoptedRepo(f, 'failing');
    // A symlinked ownership target makes the init plan fail closed before it writes.
    mkdirSync(join(failing, '.ai/context'), { recursive: true });
    writeFileSync(join(f.root, 'outside-capabilities.json'), '{}\n');
    rmSync(join(failing, '.ai/context/capabilities.json'), { force: true });
    symlinkSync(join(f.root, 'outside-capabilities.json'), join(failing, '.ai/context/capabilities.json'));
    commitAll(f, failing, 'symlinked capability authority');
    const dirtyLater = staleRepo(f, 'dirty-later');
    const branchLater = staleRepo(f, 'branch-later');
    writeRegistry(f, [stale, template, failing, dirtyLater, branchLater]);
    const heads = Object.fromEntries([stale, template].map((repo) => [repo, git(f, repo, 'rev-parse', 'HEAD')]));

    const preview = runRegisteredUpgrade({ env: f.env, callerCwd: f.root });
    expect(byPath(preview.repos, dirtyLater).status).toBe('ready');
    expect(byPath(preview.repos, branchLater).status).toBe('ready');
    expect(byPath(preview.repos, template)).toMatchObject({ status: 'ready', pending: true,
      upgrade: { worktreeTemplate: { item: { action: 'rewrite', replacement: PORTABLE } } } });
    expect(byPath(preview.repos, failing)).toMatchObject({ status: 'failed' });
    expect(byPath(preview.repos, failing).error).toContain('symlink is not allowed in adoption path');

    // Both repos were ready at preview time; apply must see the change.
    writeFileSync(join(dirtyLater, 'late-edit.txt'), 'operator work\n');
    git(f, branchLater, 'checkout', '-q', '-b', 'topic');
    const dirtyBefore = worktreeSnapshot(dirtyLater);
    const branchBefore = worktreeSnapshot(branchLater);

    const result = runRegisteredUpgrade({ apply: true, expectedRevision: preview.revision!, migrateWorktreeTemplate: true, env: f.env, callerCwd: f.root });
    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(byPath(result.repos, dirtyLater)).toMatchObject({ status: 'skipped', reason: 'dirty_worktree' });
    expect(byPath(result.repos, branchLater)).toMatchObject({ status: 'skipped', reason: 'not_default_branch' });
    expect(worktreeSnapshot(dirtyLater)).toEqual(dirtyBefore);
    expect(worktreeSnapshot(branchLater)).toEqual(branchBefore);
    const failed = byPath(result.repos, failing);
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('symlink is not allowed in adoption path');
    expect(failed.upgrade).toBeUndefined();

    const staleResult = byPath(result.repos, stale);
    expect(staleResult).toMatchObject({ status: 'applied', init: { ok: true, failed: 0 }, upgrade: { apply: true }, sweep: { ran: true } });
    expect((staleResult.init as { applied: number }).applied).toBeGreaterThan(0);
    expect(existsSync(join(stale, '.ai/hooks/README.md'))).toBe(true);
    const templateResult = byPath(result.repos, template);
    expect(templateResult).toMatchObject({ status: 'applied', upgrade: { worktreeTemplate: { applied: true } }, sweep: { ran: true } });
    expect(JSON.parse(readFileSync(policyPath(template), 'utf8')).worktree_strategy.worktree_dir_template).toBe(PORTABLE);
    expect(formatRegisteredUpgradeResult(result)).toContain('Nothing was committed.');
    for (const [repo, head] of Object.entries(heads)) expect(git(f, repo, 'rev-parse', 'HEAD')).toBe(head);

    // The operator commits; a new preview then plans nothing for the refreshed repos.
    commitAll(f, stale, 'refresh');
    commitAll(f, template, 'refresh');
    const again = runRegisteredUpgrade({ env: f.env, callerCwd: f.root });
    expect(again.error).toBeUndefined();
    for (const repo of [stale, template]) {
      expect(byPath(again.repos, repo)).toMatchObject({ status: 'ready', init: { planned: 0, operations: [] } });
      expect(byPath(again.repos, repo).upgrade?.worktreeTemplate?.item?.action).not.toBe('rewrite');
    }
  }), 120_000);

  test('an untracked file counts as dirty even when git config hides untracked files', () => registeredSandbox((f) => {
    const repo = staleRepo(f, 'hidden-untracked');
    git(f, repo, 'config', 'status.showUntrackedFiles', 'no');
    writeRegistry(f, [repo]);
    const preview = runRegisteredUpgrade({ env: f.env, callerCwd: f.root });
    expect(byPath(preview.repos, repo).status).toBe('ready');

    // The init refresh would write this path; the file is the operator's.
    const target = join(repo, '.ai/hooks/README.md');
    writeFileSync(target, 'operator notes\n');
    expect(git(f, repo, 'status', '--porcelain')).toBe('');
    const dirty = runRegisteredUpgrade({ env: f.env, callerCwd: f.root });
    expect(byPath(dirty.repos, repo)).toMatchObject({ status: 'skipped', reason: 'dirty_worktree' });

    const result = runRegisteredUpgrade({ apply: true, expectedRevision: preview.revision!, env: f.env, callerCwd: f.root });
    expect(byPath(result.repos, repo)).toMatchObject({ status: 'skipped', reason: 'dirty_worktree' });
    expect(readFileSync(target, 'utf8')).toBe('operator notes\n');
  }), 120_000);

  test('preview counts a removable legacy sibling worktree as pending and shows it', () => registeredSandbox((f) => {
    const repo = adoptedRepo(f, 'legacy');
    const sibling = join(f.root, 'legacy-old');
    git(f, repo, 'worktree', 'add', '-q', '-b', 'feat/old', sibling);
    writeFileSync(join(sibling, 'old.txt'), 'old work\n');
    commitAll(f, sibling, 'old work');
    git(f, repo, 'merge', '-q', '--no-ff', '-m', 'merge feat/old', 'feat/old');
    git(f, repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    const head = git(f, repo, 'rev-parse', 'refs/heads/feat/old');
    writeRegistry(f, [repo]);

    const result = runRegisteredUpgrade({ env: f.env, callerCwd: f.root });
    const row = byPath(result.repos, repo);
    expect(row).toMatchObject({ status: 'ready', pending: true, init: { planned: 0 }, upgrade: { items: [] } });
    expect(row.upgrade?.worktreeTemplate).toBeUndefined();
    expect(row.upgrade?.legacyWorktrees?.candidates).toEqual([expect.objectContaining({ path: sibling, branch: 'feat/old', head, verdict: 'remove' })]);
    expect(result.exitCode).toBe(1);
    const text = formatRegisteredUpgradeResult(result);
    expect(text).toContain(`${repo}: ready; pending`);
    expect(text).toContain('    project legacy-worktree:');
    expect(text).toContain(`      ${sibling}: branch=feat/old; head=${head}; remove; merged into `);
    expect(existsSync(sibling)).toBe(true);
  }), 120_000);

  test('apply passes the caller cwd to the sweep, which keeps a managed worktree that holds it', () => registeredSandbox((f) => {
    const repo = adoptedRepo(f, 'swept');
    writeRegistry(f, [repo]);
    const managed = join(f.env.REPO_HARNESS_WORKTREE_ROOT!, 'swept-wt-held');
    git(f, repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(f, repo, 'worktree', 'add', '-q', '-b', 'held', managed);
    const preview = runRegisteredUpgrade({ env: f.env, callerCwd: managed });
    const result = runRegisteredUpgrade({ apply: true, expectedRevision: preview.revision!, env: f.env, callerCwd: managed });
    const swept = byPath(result.repos, repo);
    expect(swept.status, swept.error).toBe('applied');
    expect(swept.sweep).toMatchObject({ ran: true });
    expect((swept.sweep as { report: string | null }).report).toContain(`${managed}: kept; session cwd`);
    expect(existsSync(managed)).toBe(true);
  }), 120_000);
});
