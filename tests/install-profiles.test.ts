import { syncCrossReviewSkills } from '../src/cli/commands/init';
import { architectureSelectionReport, assertPluginCommandSelected, readRecordedSelection } from '../src/cli/installer/architecture-selection';
import { configureRequiredHerdrSkill } from '../src/cli/commands/herdr-skill';
import { describe, expect, test } from 'bun:test';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { spawnSync, type SpawnSyncReturns } from 'child_process';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import {
  applyInstallSelection,
  assertArchitecturePolicySelection,
  beginInstallHostTransaction,
  codegraphProjection,
  commitInstallHostTransaction,
  effectiveSkillRoots,
  installProfileHostMutationPaths,
  installProfileTransactionPaths,
  installStateStatus,
  loadSkillSurfaceCatalog,
  piPackageSurface,
  planInstallSelection,
  prepareInstallSelectionSwitch,
  readInstallState,
  recordRefreshedInstallOwnership,
  recordVerifiedAgentFleetOwnership,
  resolveRecordedSelection,
  rollbackInstallHostTransaction,
  rollbackInstallSelection,
  versions,
  type InstallState,
} from '../src/cli/installer/install-profile';
import {
  enabledPlugins,
  installProfileStatePath,
  InstallStateError,
} from '../src/cli/installer/install-state';
import { isCommandPlugin, ownerEnabled, PLUGIN_IDS, type PluginId, type PluginSelection, type SurfaceOwner } from '../src/core/skill-surface/plugin-manifest';
import { runTransactionalRuntimeRefresh } from '../src/cli/index';
import { CANDIDATE_RECONCILE_STEP, type GlobalRuntimeOptions, type GlobalRuntimeResult } from '../src/cli/commands/global-runtime';
import { CandidateRequestProtocolRetiredError, parseCandidateRequest } from '../src/cli/commands/candidate-reconciliation';
import { installPiPackage } from '../src/cli/installer/pi-package';
import { bunGlobalPackageRoot } from '../src/cli/installer/skill-projection';
import { hostSkillRoot, providerSkillLock } from '../src/effects/host-skill-roots';
import { MANAGED_AGENTS } from '../src/effects/terminal/task-role-profiles';
import { recordInstallOwnership, recordPluginSelection, seedGlobalPackageFixture } from './helpers/install-ownership';
import { hashManagedTree } from '../src/effects/managed-tree';
import { buildManagedHooks } from '../src/cli/installer/managed-entries';
import { runUserUninstall } from '../src/cli/installer/uninstall';
import { copyUpgradeFixture } from './helpers/upgrade-fixtures';
import { writeFakeHc } from './helpers/fake-hc';
import { HC_MIN_VERSION } from '../src/core/terminal/herdr-pin';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');

/** What `all` resolves to on a host without `pi` on PATH. */
const ALL_PLUGINS = ['architecture', 'cross-review', 'mcp', 'operator', 'peer-runtime', 'platform', 'product', 'strategy-memory'] as const satisfies readonly PluginId[];
const ALL_WITH_PI = ['architecture', 'cross-review', 'mcp', 'operator', 'peer-runtime', 'pi', 'platform', 'product', 'strategy-memory'] as const satisfies readonly PluginId[];
/** The plugins with owner probe rows; command plugins have none. */
const PROBE_PLUGINS = ALL_PLUGINS.filter(id => !isCommandPlugin(id));
/** The plugins that own host files, including peer-runtime's Claude portal skill. */
const HOST_FILE_PLUGINS = ALL_PLUGINS.filter(id => id !== 'mcp' && id !== 'operator');
const CORE_FACADES = ['repo-harness-check', 'repo-harness-issue-flow', 'repo-harness-ship', 'repo-harness-test'];
const WAZA_SKILLS = ['think', 'hunt', 'check', 'health', 'mermaid'];
/** The host roots and skills each plugin owns (the herdr portal ships for Claude only). */
const PLUGIN_SKILLS: Readonly<Partial<Record<PluginId, readonly (readonly ['codex' | 'claude', string])[]>>> = {
  architecture: [['codex', 'repo-harness-architecture'], ['codex', 'repo-harness-archimap']],
  'cross-review': [['codex', 'repo-harness-cross-review']],
  'peer-runtime': [['claude', 'repo-harness-herdr-portal']],
  platform: [['codex', 'windows-python-first']],
  product: [['codex', 'repo-harness-product']],
  'strategy-memory': [['codex', 'obsidian-memory']],
};
const PROVIDER_SKILLS = ['repo-harness-cross-review', 'repo-harness-herdr-portal'];
const FACADE_SOURCES = new Map(loadSkillSurfaceCatalog().packages.flatMap(pkg => (pkg.kind === 'facade' && pkg.source ? [[pkg.name, pkg.source] as const] : [])));
const P2_MINIMAL = ['cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters', 'adaptive-workflow', 'codegraph-conditional'];
const P2_FULL = [...P2_MINIMAL, 'planning-integrations', 'agent-fleet', 'verifier', 'cross-model-acceptance', 'release-deployment-gates'];

/**
 * A scratch HOME, provider lock, runtime home and Bun root. PATH holds Bun and
 * the system tools only, so neither a real `pi` nor a global repo-harness
 * leaks into a probe.
 */
function withHome(run: (env: NodeJS.ProcessEnv) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-profile-'));
  const tools = join(home, 'tool-bin');
  mkdirSync(tools);
  symlinkSync(process.execPath, join(tools, 'bun'));
  const env: NodeJS.ProcessEnv = {
    ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun'), XDG_STATE_HOME: join(home, '.local', 'state'),
    REPO_HARNESS_HOME: join(home, '.repo-harness'), PATH: `${tools}:/usr/bin:/bin`,
  };
  seedGlobalPackageFixture(env, { mutable: true });
  for (const key of ['CODEX_SKILLS_ROOT', 'CLAUDE_SKILLS_ROOT', 'PI_CODING_AGENT_DIR', 'REPO_HARNESS_INSTALL_PLUGINS', 'REPO_HARNESS_INCLUDE_PI']) delete env[key];
  try { run(env); } finally { rmSync(home, { recursive: true, force: true }); }
}

/** A fake `pi` on a PATH of explicit directories. It keeps its user package list in $HOME/pi-packages. */
function withPi(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const bin = join(env.HOME!, 'pi-bin');
  if (!existsSync(join(bin, 'pi'))) {
    writePath(join(bin, 'pi'), [
      '#!/bin/sh',
      'f="$HOME/pi-packages"; touch "$f"',
      'case "$1" in',
      '  list) if [ -s "$f" ]; then echo "User packages:"; sed "s/^/  /" "$f"; else echo "No packages installed."; fi ;;',
      '  install) echo "$2" >> "$f" ;;',
      '  remove) grep -vxF "$2" "$f" > "$f.next"; mv "$f.next" "$f" ;;',
      '  --version) echo 1.4.0 ;;',
      'esac',
      '',
    ].join('\n'));
    chmodSync(join(bin, 'pi'), 0o755);
    writePath(join(bunGlobalPackageRoot(env)!, 'package.json'), JSON.stringify({ name: 'repo-harness', version: '0.0.0', pi: { extensions: ['./extension.ts'] } }));
  }
  return { ...env, PATH: `${bin}:${env.PATH}` };
}

function skillLock(env: NodeJS.ProcessEnv): string {
  return providerSkillLock(env.HOME!, env).path;
}

function writePath(path: string, content = ''): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

// Mirrors effects/managed-tree.ts hashManagedTree for a
// single-file directory, so tests can
// construct a facade whose owner marker is provably unmodified without
// running an actual install/sync.
function writeMarkedFacade(dest: string, skillMdContent: string): void {
  writePath(join(dest, 'SKILL.md'), skillMdContent);
  const hash = createHash('sha256');
  hash.update('F\0SKILL.md\0');
  hash.update(Buffer.from(skillMdContent));
  hash.update('\0');
  writeFileSync(join(dest, '.repo-harness-owner.json'), JSON.stringify({
    owner: 'repo-harness',
    surface: 'command-facade',
    content_hash: `sha256:${hash.digest('hex')}`,
  }));
}

// The skill sync writer resolves its catalog adapter from the source root.
function seedSyncRuntime(source: string): void {
  mkdirSync(join(source, 'scripts'), { recursive: true });
  cpSync(join(ROOT, 'scripts', 'skill-surface-select.ts'), join(source, 'scripts', 'skill-surface-select.ts'));
  cpSync(join(ROOT, 'src'), join(source, 'src'), { recursive: true });
  mkdirSync(join(source, 'assets', 'skill-commands'), { recursive: true });
  cpSync(join(ROOT, 'assets', 'skill-commands', 'manifest.json'), join(source, 'assets', 'skill-commands', 'manifest.json'));
}

function runSkillSync(env: NodeJS.ProcessEnv, extra: Record<string, string>): SpawnSyncReturns<string> {
  return spawnSync('bash', [join(ROOT, 'scripts', 'sync-codex-installed-copies.sh')], {
    cwd: ROOT, encoding: 'utf-8', env: { ...env, ...extra },
  });
}

// The shell reports each skill root it syncs. This is the drift check for effectiveSkillRoots.
function syncedSkillRoots(stdout: string): string[] {
  return [...stdout.matchAll(/^\[sync-installed\] command facades \(\w+\): \d+ into (.+)$/gm)].map((match) => match[1]!);
}

function treeSnapshot(root: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const visit = (path: string, relative: string): void => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) entries[relative] = `link:${readlinkSync(path)}`;
    else if (stat.isDirectory()) {
      entries[relative] = 'dir';
      for (const name of readdirSync(path).sort()) visit(join(path, name), relative ? `${relative}/${name}` : name);
    } else entries[relative] = `file:${readFileSync(path, 'utf-8')}`;
  };
  if (existsSync(root)) visit(root, '');
  return entries;
}

/** Write the probe evidence of core and of each given plugin. */
function writeManagedHostSurfaces(
  env: NodeJS.ProcessEnv,
  plugins: readonly PluginId[] = [],
): { canonical: string; source: string } {
  const home = env.HOME!;
  const source = join(home, 'package-source');
  const canonical = join(home, '.codex', 'skills', 'repo-harness');
  mkdirSync(source, { recursive: true });
  mkdirSync(join(home, '.codex', 'skills'), { recursive: true });
  writePath(join(source, 'SKILL.md'), '# managed\n');
  for (const relative of [
    'src/cli/commands/state.ts',
    'src/cli/hook/mutation-guard.ts',
    'scripts/contract-worktree.sh',
    'references/handoff.md',
    'scripts/verify-sprint.sh',
    'scripts/ship-worktrees.sh',
  ]) writePath(join(source, relative), '# managed\n');
  writePath(join(source, 'src/core/workflow/profile.ts'), '// managed\n');
  writePath(join(source, 'src/effects/review-runner/task-oar-host.ts'), '// managed\n');
  // Owner-marked copies of facades that the canonical source ships, as an install leaves them.
  const markedFacade = (dest: string) => {
    writePath(join(source, FACADE_SOURCES.get(basename(dest))!, 'SKILL.md'), '# managed\n');
    writeMarkedFacade(dest, '# managed\n');
  };
  for (const facade of CORE_FACADES) markedFacade(join(home, '.codex', 'skills', facade));
  for (const skill of WAZA_SKILLS) writePath(join(home, '.codex', 'skills', skill, 'SKILL.md'), '# external\n');
  for (const agent of MANAGED_AGENTS) writePath(join(home, '.codex', 'agents', `${agent}.toml`), '# managed\n');
  for (const id of plugins) {
    // Provider skills sync without an owner marker; facades carry one.
    for (const [host, skill] of PLUGIN_SKILLS[id] ?? []) {
      if (PROVIDER_SKILLS.includes(skill)) writePath(join(home, `.${host}`, 'skills', skill, 'SKILL.md'), '# managed\n');
      else markedFacade(join(home, `.${host}`, 'skills', skill));
    }
  }
  if (plugins.includes('architecture')) writePath(join(home, '.bun', 'bin', 'codegraph'), '#!/bin/sh\n');
  writePath(join(home, '.bun', 'bin', 'repo-harness'), '#!/bin/sh\n');
  symlinkSync(source, canonical);
  writeFileSync(join(home, '.codex', 'hooks.json'), JSON.stringify({
    theme: 'user-owned',
    hooks: buildManagedHooks('codex', env),
  }));
  return { canonical, source };
}

function seededState(plugins: readonly PluginId[], selection: PluginSelection, ownership: readonly object[] = []): object {
  return { protocol: 3, ...versions(plugins), selection, transaction_id: 'seeded', applied_at: '2026-11-01T00:00:00.000Z', ownership_manifest: ownership, previous: null };
}

function installStateCode(run: () => unknown): string | undefined {
  try { run(); } catch (error) { if (error instanceof InstallStateError) return error.code; throw error; }
  return undefined;
}

describe('install selection', () => {
  test('one managed tree hash matches the actual copy projection with embedded Git metadata', () => withHome((env) => {
    const source = join(env.HOME!, 'release-skill');
    const copied = join(env.HOME!, 'copied-skill');
    copyUpgradeFixture('upgrade-v0.19.5-home', '.codex/skills/repo-harness-cross-review', source);
    expect(spawnSync('git', ['init', '-q', source], { env }).status).toBe(0);
    const result = spawnSync('bash', [join(ROOT, 'scripts/sync-codex-installed-copies.sh'),
      '--stage-owned-copy', source, copied, 'canonical-skill'], {
      env: { ...env, AGENTIC_DEV_SOURCE_ROOT: ROOT, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' }, encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(source, '.git'))).toBe(true);
    expect(existsSync(join(copied, '.git'))).toBe(false);
    const marker = JSON.parse(readFileSync(join(copied, '.repo-harness-owner.json'), 'utf8'));
    const excludes: string[] = JSON.parse(readFileSync(join(ROOT, 'assets/workflow-contract.v1.json'), 'utf8')).installedCopyExcludes;
    expect(hashManagedTree(source, { excludes })).toBe(marker.content_hash);
    expect(hashManagedTree(copied)).toBe(marker.content_hash);
    expect(hashManagedTree(source)).not.toBe(marker.content_hash);
  }));

  test('stage-owned-copy refuses an existing destination without changing it', () => {
    const home = mkdtempSync('/tmp/repo-harness-stage-existing-');
    try {
      const source = join(home, 'source');
      const dest = join(home, 'destination');
      writePath(join(source, 'SKILL.md'), 'source bytes\n');
      writePath(join(dest, 'SKILL.md'), 'user bytes\n');
      const result = spawnSync('bash', [join(ROOT, 'scripts/sync-codex-installed-copies.sh'),
        '--stage-owned-copy', source, dest, 'canonical-skill'], {
        env: { ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun'), AGENTIC_DEV_SOURCE_ROOT: ROOT }, encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(2);
      expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toBe('user bytes\n');
      expect(existsSync(join(dest, '.repo-harness-owner.json'))).toBe(false);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  test('stage-owned-copy refuses a dangling symlink destination without changing it', () => {
    const home = mkdtempSync('/tmp/repo-harness-stage-symlink-');
    try {
      const source = join(home, 'source');
      const dest = join(home, 'destination');
      const target = join(home, 'missing-target');
      writePath(join(source, 'SKILL.md'), 'source bytes\n');
      symlinkSync(target, dest);
      const result = spawnSync('bash', [join(ROOT, 'scripts/sync-codex-installed-copies.sh'),
        '--stage-owned-copy', source, dest, 'canonical-skill'], {
        env: { ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun'), AGENTIC_DEV_SOURCE_ROOT: ROOT }, encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(2);
      expect(readlinkSync(dest)).toBe(target);
      expect(existsSync(target)).toBe(false);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  test('refresh retains a markerless owned directory receipt under its owner and writes the ledger in canonical order', () => withHome((env) => {
    const path = join(env.HOME!, '.codex/skills/repo-harness-cross-review');
    const fleet = join(env.HOME!, '.codex/agents/explorer.toml');
    copyUpgradeFixture('upgrade-v0.19.5-home', '.codex/skills/repo-harness-cross-review', path);
    writePath(fleet, '# managed\n');
    const previousHash = hashManagedTree(path);
    // The helper keeps the given order, so this ledger is not in canonical order.
    recordInstallOwnership([path, fleet], env);
    const statePath = installProfileStatePath(env);
    const unsorted = readFileSync(statePath);
    // A refresh that changes nothing rewrites no bytes, whatever the stored order.
    recordRefreshedInstallOwnership([path, fleet], env);
    expect(readFileSync(statePath)).toEqual(unsorted);

    rmSync(path, { recursive: true });
    cpSync(join(ROOT, 'assets/skills/repo-harness-cross-review'), path, { recursive: true });
    expect(existsSync(join(path, '.repo-harness-owner.json'))).toBe(false);
    expect(() => recordRefreshedInstallOwnership([path], env)).not.toThrow();
    const refreshed = readInstallState(env)!;
    const receipt = refreshed.ownership_manifest.find((surface) => surface.path === path)!;
    expect(receipt.owner).toBe('cross-review');
    expect(receipt.content_hash).toBe(hashManagedTree(path));
    expect(receipt.content_hash).not.toBe(previousHash);
    expect(receipt.managed_marker).toBe('transaction-created-directory');
    expect(refreshed.ownership_manifest.map(surface => surface.path)).toEqual([fleet, path]);
  }));

  test('install state protocol 3 names the plugins, and every hook route is core', () => withHome((env) => {
    expect(PLUGIN_IDS).toEqual(['architecture', 'cross-review', 'mcp', 'operator', 'peer-runtime', 'pi', 'platform', 'product', 'strategy-memory']);
    expect(Object.values(buildManagedHooks('codex', env)).flat()).toHaveLength(5);
    expect(Object.values(buildManagedHooks('claude', env)).flat()).toHaveLength(6);
    expect(planInstallSelection('all', { run: ALL_PLUGINS, record: ALL_PLUGINS }, null, env).protocol).toBe(3);
  }));

  test('protocol 1 and 2 refuse a state and a candidate request before any write, and name the bridges', () => {
    const protocol2Bridge = 'bun add -g repo-harness@0.25.4 --no-cache && repo-harness update --version 0.25.4';
    const rows = [
      // The protocol 1 bridge continues through the protocol 2 bridge.
      { protocol: 1, profile: 'standard', components: P2_MINIMAL, bridge: ['bun add -g repo-harness@0.25.3 --no-cache', `then the protocol 2 bridge: ${protocol2Bridge}`] },
      { protocol: 2, profile: 'full', components: P2_FULL, bridge: [protocol2Bridge] },
    ] as const;
    for (const row of rows) withHome((env) => {
      const statePath = installProfileStatePath(env);
      writePath(statePath, `${JSON.stringify({
        protocol: row.protocol,
        profile: row.profile,
        components: row.components,
        transaction_id: `retired-protocol-${row.protocol}`,
        applied_at: '2026-07-14T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      })}\n`);
      const before = readFileSync(statePath);
      expect(installStateCode(() => readInstallState(env)), `protocol ${row.protocol}`).toBe('install_state_protocol_retired');
      for (const step of row.bridge) expect(() => readInstallState(env)).toThrow(step);
      expect(() => readInstallState(env)).toThrow(`then: bun add -g repo-harness@${versions([]).core.version} --no-cache && repo-harness update`);
      const update = spawnSync(process.execPath, [CLI, 'update', '--no-cli', '--json'], { cwd: ROOT, encoding: 'utf-8', env });
      expect(update.status).not.toBe(0);
      expect(update.stderr).toContain(`is protocol ${row.protocol}, which this package no longer reads`);
      expect(readFileSync(statePath)).toEqual(before);
    });

    const request = Buffer.from(JSON.stringify({ protocol: 1, profile: 'full' }), 'utf-8').toString('base64url');
    expect(() => parseCandidateRequest(request, '0.26.0')).toThrow(CandidateRequestProtocolRetiredError);
    expect(() => parseCandidateRequest(request, '0.26.0')).toThrow('bun add -g repo-harness@0.26.0 --no-cache && repo-harness update');
  }, 60_000);

  test('fresh install dry-run selects all and skips the host plugins this host cannot run', () => withHome((env) => {
    const result = spawnSync(process.execPath, [CLI, 'install', '--dry-run', '--json'], {
      cwd: ROOT,
      encoding: 'utf-8',
      env,
    });
    expect(result.status, result.stderr).toBe(0);
    const plan = JSON.parse(result.stdout);
    expect(plan.selection).toBe('all');
    expect(plan.requested_plugins).toEqual([...ALL_PLUGINS]);
    expect(plan.skipped.map(({ id, command }: { id: string; command: string }) => [id, command])).toEqual([
      ['pi', 'repo-harness update'],
    ]);
  }), 30_000);

  test('dry-run plan is explicit and has no side effects', () => withHome((env) => {
    const plan = planInstallSelection('all', { run: ALL_PLUGINS, record: ALL_PLUGINS }, null, env);
    expect(plan.selection).toBe('all');
    expect(plan.install).toContain('architecture');
    expect(plan.remove).toEqual([]);
    expect(readInstallState(env)).toBeNull();
  }));

  test('apply is idempotent: a no-change apply keeps the state bytes and previous', () => withHome((env) => {
    writeManagedHostSurfaces(env, ['product']);
    const first = applyInstallSelection([], [], env, new Date('2026-01-01T00:00:00Z'));
    const second = applyInstallSelection(['product'], ['product'], env, new Date('2026-01-02T00:00:00Z'));
    const bytes = readFileSync(installProfileStatePath(env));
    const third = applyInstallSelection(['product'], ['product'], env, new Date('2026-01-03T00:00:00Z'));
    expect(third.plan.install).toEqual([]);
    expect(third.plan.remove).toEqual([]);
    expect(readFileSync(installProfileStatePath(env))).toEqual(bytes);
    expect(third.state).toEqual(second.state);
    expect(third.state.previous?.transaction_id).toBe(first.state.transaction_id);
  }));

  test('switch lists removals and rollback restores the previous selection', () => withHome((env) => {
    writeManagedHostSurfaces(env, ALL_PLUGINS);
    applyInstallSelection('all', ALL_PLUGINS, env, new Date('2026-01-01T00:00:00Z'));
    const switched = applyInstallSelection([], [], env, new Date('2026-01-02T00:00:00Z'));
    expect(switched.plan.remove).toContain('architecture');
    expect(switched.plan.remove).toContain('cross-review');
    const restored = rollbackInstallSelection(env);
    expect(restored.selection).toBe('all');
    expect(enabledPlugins(restored)).toEqual([...ALL_PLUGINS]);
  }));

  test('a rebuilt ledger keeps each current surface whose owner stays selected, and uninstall still plans it', () => {
    for (const writer of ['rollback', 'apply'] as const) withHome((env) => {
      writeManagedHostSurfaces(env, ['platform', 'product']);
      applyInstallSelection(['platform'], ['platform'], env, new Date('2026-01-01T00:00:00Z'));
      // `install --plugins product` adds core Waza surfaces that discovery does not find: a staging copy and a rule.
      const forward = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
      prepareInstallSelectionSwitch(['product'], env);
      const rule = join(env.HOME!, '.agents', 'rules', 'english.md');
      const staged = join(env.HOME!, '.agents', 'skills', 'think');
      writePath(rule, '# rule\n');
      writePath(join(staged, 'SKILL.md'), '# think\n');
      applyInstallSelection(['product'], ['product'], env, new Date('2026-01-02T00:00:00Z'), forward);
      commitInstallHostTransaction(forward);
      const productSurfaces = readInstallState(env)!.ownership_manifest.filter(({ owner }) => owner === 'product').map(({ path }) => path);
      expect(productSurfaces.length, writer).toBeGreaterThan(0);

      // Back to platform: the switch removes product, and the projection writes the platform facade again.
      const back = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
      prepareInstallSelectionSwitch(['platform'], env);
      for (const [host, skill] of PLUGIN_SKILLS.platform!) writeMarkedFacade(join(env.HOME!, `.${host}`, 'skills', skill), '# managed\n');
      if (writer === 'rollback') rollbackInstallSelection(env, back);
      else applyInstallSelection(['platform'], ['platform'], env, new Date('2026-01-03T00:00:00Z'), back);
      commitInstallHostTransaction(back);

      const state = readInstallState(env)!;
      expect(state.selection, writer).toEqual(['platform']);
      const owned = state.ownership_manifest.map(({ path }) => path);
      expect([owned.includes(rule), owned.includes(staged)], writer).toEqual([true, true]);
      expect(state.ownership_manifest.filter(({ owner }) => owner === 'product'), writer).toEqual([]);
      for (const path of productSurfaces) expect(existsSync(path), `${writer}: ${path}`).toBe(false);
      const planned = new Set(runUserUninstall({ target: 'both', dryRun: true, env }).items.map(({ path }) => path));
      expect(owned.filter(path => !planned.has(path)), writer).toEqual([]);
    });
  });

  test('a rollback that cannot complete its projection names the missing owner', () => withHome((env) => {
    writeManagedHostSurfaces(env, ALL_PLUGINS);
    applyInstallSelection('all', ALL_PLUGINS, env, new Date('2026-01-01T00:00:00Z'));
    applyInstallSelection([], [], env, new Date('2026-01-02T00:00:00Z'));
    rmSync(join(env.HOME!, '.codex', 'skills', 'repo-harness-product'), { recursive: true });
    expect(() => rollbackInstallSelection(env)).toThrow('rollback projection is incomplete: missing=product(skills)');
  }));

  test('state is machine readable: protocol 3 with versions, selection and owned surfaces', () => withHome((env) => {
    writeManagedHostSurfaces(env, ALL_PLUGINS);
    const applied = applyInstallSelection('all', ALL_PLUGINS, env);
    const persisted = JSON.parse(readFileSync(applied.plan.state_path, 'utf-8'));
    const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    expect(persisted.protocol).toBe(3);
    expect(persisted.core).toEqual({ version });
    expect(persisted.plugins).toEqual(ALL_PLUGINS.map(id => ({ id, version })));
    expect(persisted.selection).toBe('all');
    expect(persisted.ownership_manifest.every((entry: { owner: string; authority: string; path: string; type: string; content_hash: string | null }) => (
      ['core', ...ALL_PLUGINS].includes(entry.owner)
      && entry.authority === 'repo-harness-install-transaction'
      && entry.path.startsWith(env.HOME!)
      && ['symlink', 'managed-file', 'directory-copy'].includes(entry.type)
      && (entry.type === 'symlink' || entry.content_hash?.startsWith('sha256:') === true)
    ))).toBe(true);
    expect(persisted.ownership_manifest.some((entry: { path: string }) => entry.path === join(env.HOME!, '.bun', 'bin', 'repo-harness'))).toBe(false);
    expect(persisted.ownership_manifest.some((entry: { path: string }) => entry.path === join(env.HOME!, '.codex', 'skills', 'repo-harness'))).toBe(false);
    expect(installStateStatus(applied.state, env).drift.status).toBe('consistent');
  }));

  test('the strict reader rejects a selection that differs from its plugins, a missing selection and an unknown plugin', () => withHome((env) => {
    const statePath = installProfileStatePath(env);
    const { selection: _selection, ...withoutSelection } = seededState(['platform'], ['platform']) as Record<string, unknown>;
    const { previous: _previous, ...snapshotWithoutSelection } = withoutSelection;
    const plugin = (id: string) => ({ id, version: versions([]).core.version });
    for (const [state, message] of [
      [seededState(['platform'], ['platform', 'product']), 'does not equal its plugins'],
      [seededState(['platform', 'product'], ['product', 'platform']), 'does not equal its plugins'],
      [withoutSelection, 'has no valid selection'],
      [seededState(['platform'], 'full' as PluginSelection), 'has no valid selection'],
      [{ ...seededState(['platform'], 'all'), plugins: [plugin('platform'), plugin('future-plugin')] }, 'names unknown plugin "future-plugin"'],
      // The removed DSH plugin (M45) has no reader: a recorded dsh entry fails closed like any unknown id.
      [{ ...seededState(['platform'], 'all'), plugins: [plugin('dsh'), plugin('platform')] }, 'names unknown plugin "dsh"'],
      [{ ...seededState(['platform'], ['platform']), selection: ['dsh', 'platform'], plugins: [plugin('dsh'), plugin('platform')] }, 'names unknown plugin "dsh"'],
      [{ ...seededState([], []), previous: snapshotWithoutSelection }, 'previous state has no valid selection'],
    ] as const) {
      writePath(statePath, `${JSON.stringify(state)}\n`);
      expect(installStateCode(() => readInstallState(env))).toBe('install_state_invalid');
      expect(() => readInstallState(env)).toThrow(message);
    }
  }));

  test('discovery keeps a retired facade under core, and under pi in the Pi root', () => {
    // A retired facade keeps its receipt until skill sync removes it. In the
    // Pi root the receipt stays with the pi plugin, never core.
    const rows: readonly { readonly label: string; readonly plugins: readonly PluginId[]; readonly root: (env: NodeJS.ProcessEnv) => string; readonly owner: SurfaceOwner }[] = [
      { label: 'codex root, product', plugins: ['product'], root: env => join(env.HOME!, '.codex', 'skills'), owner: 'core' },
      { label: 'Pi root, pi and product', plugins: ['pi', 'product'], root: env => hostSkillRoot(env.HOME!, 'pi', env), owner: 'pi' },
    ];
    for (const row of rows) withHome((base) => {
      const env = row.plugins.includes('pi') ? withPi(base) : base;
      const { source } = writeManagedHostSurfaces(env, row.plugins);
      const codexSkills = join(env.HOME!, '.codex', 'skills');

      // Canonical control: repo-harness-product is still shipped by the package
      // (source gets it at its assets/skills/ location), so it keeps its plugin owner.
      writePath(join(source, 'assets', 'skills', 'repo-harness-product', 'SKILL.md'), '# managed\n');
      writeMarkedFacade(join(codexSkills, 'repo-harness-product'), '# managed\n');

      // Retired: physically present on host (e.g. left over from a broader
      // sync), but the package no longer ships its source directory at all.
      const retiredDest = join(row.root(env), 'repo-harness-retired-demo');
      writeMarkedFacade(retiredDest, '---\nname: repo-harness-retired-demo\n---\n');

      const additionalSurfaces = row.plugins.includes('pi')
        ? [piPackageSurface(installPiPackage(bunGlobalPackageRoot(env)!, true, env).source)]
        : [];
      const applied = applyInstallSelection([...row.plugins], row.plugins, env, new Date('2026-01-01T00:00:00Z'), undefined, { additionalSurfaces });
      const planSurface = applied.state.ownership_manifest.find(({ path }) => path === join(codexSkills, 'repo-harness-product'));
      const retiredSurface = applied.state.ownership_manifest.find(({ path }) => path === retiredDest);
      expect(planSurface?.owner, row.label).toBe('product');
      expect(retiredSurface, row.label).toBeDefined();
      expect(retiredSurface?.owner, row.label).toBe(row.owner);
      expect(installStateStatus(applied.state, env).drift.status, row.label).toBe('consistent');
      expect(readInstallState(env)?.ownership_manifest, row.label).toEqual(applied.state.ownership_manifest);
    });
  });

  test('state keeps a formerly managed facade receipt readable after its catalog retirement', () => withHome((env) => {
    writeManagedHostSurfaces(env);
    const retired = join(env.HOME!, '.claude', 'skills', 'repo-harness-handoff');
    const oldSource = join(env.HOME!, 'old-package', 'assets', 'skill-commands', 'repo-harness-handoff');
    writePath(join(oldSource, 'SKILL.md'), '# old\n');
    mkdirSync(join(retired, '..'), { recursive: true });
    symlinkSync(oldSource, retired);
    const receipt = {
      owner: 'core',
      authority: 'repo-harness-install-transaction',
      removal: 'managed-surfaces-only',
      path: retired,
      type: 'symlink',
      content_hash: null,
      managed_marker: null,
      symlink_target: oldSource,
    } as const;
    const statePath = installProfileStatePath(env);
    const state = seededState([], [], [receipt]);
    writePath(statePath, `${JSON.stringify(state)}\n`);
    expect(readInstallState(env)?.ownership_manifest).toEqual([receipt]);

    const applied = applyInstallSelection([], [], env, new Date('2026-01-02T00:00:00Z'));
    expect(applied.state.ownership_manifest).toContainEqual(receipt);
    expect(readInstallState(env)?.ownership_manifest).toEqual(applied.state.ownership_manifest);

    for (const path of [join(env.HOME!, 'elsewhere', 'repo-harness-handoff'), join(env.HOME!, '.claude', 'skills', 'foreign-skill')]) {
      writePath(statePath, `${JSON.stringify({ ...state, ownership_manifest: [{ ...receipt, path }] })}\n`);
      expect(() => readInstallState(env)).toThrow('invalid ownership surface');
    }
  }));

  for (const plugins of ['platform', undefined] as const) {
    for (const mode of ['0', '1'] as const) {
      test(`${plugins === undefined ? 'all' : plugins} sync projects windows-python-first to both hosts in ${mode === '0' ? 'copy' : 'link'} mode`, () => withHome((env) => {
        const { source } = writeManagedHostSurfaces(env, plugins === undefined ? ALL_PLUGINS : [plugins]);
        rmSync(join(env.HOME!, '.codex', 'skills', 'windows-python-first'), { recursive: true });
        seedSyncRuntime(source);
        const skillSource = join(source, 'assets', 'skills', 'windows-python-first');
        cpSync(join(ROOT, 'assets', 'skills', 'windows-python-first'), skillSource, { recursive: true });
        const sync = runSkillSync(env, {
          AGENTIC_DEV_SOURCE_ROOT: source,
          AGENTIC_DEV_LINK_INSTALLED_COPIES: mode,
          ...(plugins === undefined ? {} : { REPO_HARNESS_INSTALL_PLUGINS: plugins }),
        });
        expect(sync.status, sync.stderr).toBe(0);
        for (const host of ['.codex', '.claude']) {
          const destination = join(env.HOME!, host, 'skills', 'windows-python-first');
          for (const file of ['SKILL.md', 'agents/openai.yaml']) {
            expect(readFileSync(join(destination, file))).toEqual(readFileSync(join(skillSource, file)));
          }
          expect(lstatSync(destination).isSymbolicLink()).toBe(mode === '1');
          if (mode === '1') {
            expect(readlinkSync(destination)).toBe(skillSource);
          } else {
            expect(JSON.parse(readFileSync(join(destination, '.repo-harness-owner.json'), 'utf-8'))).toMatchObject({
              owner: 'repo-harness', surface: 'command-facade',
            });
          }
        }
      }));
    }
  }

  test('copy-mode sync gives a non-prefixed plugin facade an ownership receipt that uninstall honors', () => withHome((env) => {
    const { source } = writeManagedHostSurfaces(env);
    seedSyncRuntime(source);
    cpSync(join(ROOT, 'assets', 'skills', 'obsidian-memory'), join(source, 'assets', 'skills', 'obsidian-memory'), { recursive: true });
    const sync = runSkillSync(env, { AGENTIC_DEV_SOURCE_ROOT: source, AGENTIC_DEV_LINK_INSTALLED_COPIES: '0', REPO_HARNESS_INSTALL_PLUGINS: 'strategy-memory' });
    expect(sync.status, sync.stderr).toBe(0);
    const copies = ['.codex', '.claude'].map((host) => join(env.HOME!, host, 'skills', 'obsidian-memory'));
    for (const copy of copies) expect(existsSync(join(copy, '.repo-harness-owner.json'))).toBe(true);

    const applied = applyInstallSelection(['strategy-memory'], ['strategy-memory'], env, new Date('2026-01-01T00:00:00Z'));
    for (const copy of copies) {
      expect(applied.state.ownership_manifest.find(({ path }) => path === copy)).toMatchObject({
        owner: 'strategy-memory',
        type: 'directory-copy',
        managed_marker: '.repo-harness-owner.json:owner=repo-harness;surface=command-facade',
      });
    }
    expect(readInstallState(env)?.ownership_manifest).toEqual(applied.state.ownership_manifest);

    const [unchanged, edited] = copies;
    writeFileSync(join(edited!, 'SKILL.md'), '# user edit\n');
    const uninstall = runUserUninstall({ target: 'both', env });
    expect(uninstall.status).toBe('partial');
    expect(existsSync(unchanged!)).toBe(false);
    expect(readFileSync(join(edited!, 'SKILL.md'), 'utf-8')).toBe('# user edit\n');
    expect(readInstallState(env)?.ownership_manifest.some(({ path }) => path === edited)).toBe(true);
  }));

  for (const linkedRoot of [false, true]) {
    test(`host transaction rollback restores a retired facade that skill sync removed${linkedRoot ? ' through a symlinked skill root' : ''}`, () => withHome((env) => {
      const source = join(env.HOME!, 'package-source');
      seedSyncRuntime(source);
      writePath(join(source, 'SKILL.md'), '# managed\n');
      const roots = ['.codex', '.claude'].map((host) => join(env.HOME!, host, 'skills'));
      // A dotfiles setup can link a host skill root. The sync writer follows that link.
      const realRoots = linkedRoot ? roots.map((root) => join(env.HOME!, 'dotfiles', basename(dirname(root)))) : roots;
      for (const [index, root] of roots.entries()) {
        mkdirSync(realRoots[index]!, { recursive: true });
        if (linkedRoot) {
          mkdirSync(dirname(root), { recursive: true });
          symlinkSync(realRoots[index]!, root);
        }
        writeMarkedFacade(join(root, 'repo-harness-retired-demo'), '# retired\n');
      }
      const before = realRoots.map(treeSnapshot);

      const transaction = beginInstallHostTransaction(installProfileTransactionPaths(env), env);
      const sync = runSkillSync(env, { AGENTIC_DEV_SOURCE_ROOT: source, AGENTIC_DEV_LINK_INSTALLED_COPIES: '1', REPO_HARNESS_INSTALL_PLUGINS: '' });
      expect(sync.status, sync.stderr).toBe(0);
      expect(syncedSkillRoots(sync.stdout)).toEqual([...effectiveSkillRoots([], env)]);
      for (const root of roots) expect(existsSync(join(root, 'repo-harness-retired-demo'))).toBe(false);
      rollbackInstallHostTransaction(transaction);

      expect(realRoots.map(treeSnapshot)).toEqual(before);
    }));
  }

  for (const claudeOverride of [true, false]) {
    test(`host transaction rollback restores effective custom skill roots${claudeOverride ? '' : ' when only CODEX_SKILLS_ROOT is set'}`, () => withHome((env) => {
      const source = join(env.HOME!, 'package-source');
      seedSyncRuntime(source);
      writePath(join(source, 'SKILL.md'), '# managed\n');
      writePath(join(source, 'assets', 'skill-commands', 'repo-harness-check', 'SKILL.md'), '# check\n');
      const codexRoot = join(env.HOME!, 'custom', 'codex-skills');
      const claudeRoot = claudeOverride ? join(env.HOME!, 'custom', 'claude-skills') : join(env.HOME!, '.claude', 'skills');
      const { CLAUDE_SKILLS_ROOT: _claude, ...base } = env;
      const custom = { ...base, CODEX_SKILLS_ROOT: codexRoot, ...(claudeOverride ? { CLAUDE_SKILLS_ROOT: claudeRoot } : {}) };
      writeMarkedFacade(join(claudeOverride ? claudeRoot : codexRoot, 'repo-harness-retired-demo'), '# retired\n');
      writePath(join(codexRoot, 'user-skill', 'SKILL.md'), '# user\n');
      if (!claudeOverride) writeMarkedFacade(join(claudeRoot, 'repo-harness-retired-demo'), '# not synced\n');
      const before = [codexRoot, claudeRoot].map(treeSnapshot);

      const transaction = beginInstallHostTransaction(installProfileTransactionPaths(custom), custom);
      const sync = runSkillSync(custom, { AGENTIC_DEV_SOURCE_ROOT: source, AGENTIC_DEV_LINK_INSTALLED_COPIES: '1', REPO_HARNESS_INSTALL_PLUGINS: '' });
      expect(sync.status, sync.stderr).toBe(0);
      expect(syncedSkillRoots(sync.stdout)).toEqual([...effectiveSkillRoots([], custom)]);
      expect(readlinkSync(join(codexRoot, 'repo-harness'))).toBe(source);
      if (claudeOverride) {
        expect(readlinkSync(join(claudeRoot, 'repo-harness-check'))).toBe(join(source, 'assets', 'skill-commands', 'repo-harness-check'));
      } else {
        expect(existsSync(join(claudeRoot, 'repo-harness-check'))).toBe(false);
      }
      rollbackInstallHostTransaction(transaction);

      expect([codexRoot, claudeRoot].map(treeSnapshot)).toEqual(before);
    }));
  }

  test('skill sync takes its roots from the TypeScript root rule', () => withHome((env) => {
    const source = join(env.HOME!, 'package-source');
    seedSyncRuntime(source);
    writePath(join(source, 'SKILL.md'), '# managed\n');
    const codexRoot = join(env.HOME!, 'custom', 'codex-skills');
    const claudeRoot = join(env.HOME!, 'custom', 'claude-skills');
    const custom = { ...env, CODEX_SKILLS_ROOT: `${codexRoot}/`, CLAUDE_SKILLS_ROOT: `${claudeRoot}/` };
    const sync = runSkillSync(custom, { AGENTIC_DEV_SOURCE_ROOT: source, AGENTIC_DEV_LINK_INSTALLED_COPIES: '1', REPO_HARNESS_INSTALL_PLUGINS: '' });
    expect(sync.status, sync.stderr).toBe(0);
    expect(syncedSkillRoots(sync.stdout)).toEqual([codexRoot, claudeRoot]);
    expect(effectiveSkillRoots([], custom)).toEqual([codexRoot, claudeRoot]);

    const { HOME: _home, CODEX_SKILLS_ROOT: _codex, ...homeless } = env;
    const rejected = runSkillSync(homeless, { AGENTIC_DEV_SOURCE_ROOT: source, REPO_HARNESS_INSTALL_PLUGINS: '' });
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('HOME is required when CODEX_SKILLS_ROOT is not set.');
    expect(rejected.stdout).not.toContain('command facades');
  }));

  test('status detects actual managed host surface drift', () => withHome((env) => {
    const { canonical } = writeManagedHostSurfaces(env);
    const applied = applyInstallSelection([], [], env);
    expect(installStateStatus(applied.state, env).drift.status).toBe('consistent');

    rmSync(canonical);
    const foreign = join(env.HOME!, 'foreign-source');
    mkdirSync(foreign);
    symlinkSync(foreign, canonical);

    const status = installStateStatus(applied.state, env);
    expect(status.drift.status).toBe('drift');
    expect(status.drift.missing_owners).toContain('core');
    expect(status.probes.core?.missing).toContain('effective-state');
  }));

  test('managed adapter ownership hashes only package entries and preserves sibling edits', () => withHome((env) => {
    writeManagedHostSurfaces(env);
    const applied = applyInstallSelection([], [], env);
    const adapter = join(env.HOME!, '.codex', 'hooks.json');
    const config = JSON.parse(readFileSync(adapter, 'utf-8'));
    config.theme = 'changed-by-user';
    writeFileSync(adapter, JSON.stringify(config));
    expect(installStateStatus(applied.state, env).drift.status).toBe('consistent');

    config.hooks.SessionStart[0].hooks.push({
      type: 'command',
      command: 'echo user-owned-sibling',
      timeout: 30,
    });
    writeFileSync(adapter, JSON.stringify(config));
    expect(installStateStatus(applied.state, env).drift.status).toBe('consistent');

    config.hooks.SessionStart[0].hooks[0].command = ': repo-harness-managed-hook-v1; changed';
    writeFileSync(adapter, JSON.stringify(config));
    expect(installStateStatus(applied.state, env).drift.surface_drift).toContain(adapter);
  }));

  test('adapter probe requires the complete core route projection', () => withHome((env) => {
    writeManagedHostSurfaces(env);
    const applied = applyInstallSelection([], [], env);
    const adapter = join(env.HOME!, '.codex', 'hooks.json');
    const config = JSON.parse(readFileSync(adapter, 'utf-8'));
    const original = readFileSync(adapter, 'utf-8');
    delete config.hooks.PreToolUse;
    writeFileSync(adapter, JSON.stringify(config));
    const status = installStateStatus(applied.state, env);
    expect(status.probes.core?.missing).toContain('host-adapters');
    expect(status.drift.missing_owners).toContain('core');
    writeFileSync(adapter, original);
    rmSync(join(bunGlobalPackageRoot(env)!, 'dist/hook-entry.js'));
    expect(installStateStatus(applied.state, env).probes.core?.missing).toContain('host-adapters');
  }));

  test('install state is not committed without a complete host projection', () => withHome((env) => {
    expect(() => applyInstallSelection([], [], env)).toThrow('install projection is incomplete');
    expect(existsSync(installProfileStatePath(env))).toBe(false);
  }));

  test('plugin probes do not infer plugin skills from the core projection alone', () => withHome((env) => {
    writeManagedHostSurfaces(env);
    const core = applyInstallSelection([], [], env).state;
    const forged: InstallState = { ...core, ...versions(ALL_PLUGINS), selection: 'all' };
    const status = installStateStatus(forged, env);
    for (const id of PROBE_PLUGINS) expect(status.probes[id]?.status, id).toBe('missing');
    expect(status.probes.core?.status).toBe('present');
    expect(status.drift.status).toBe('drift');
  }));

  test('mcp commits with no probe row and no owned surface', () => withHome((env) => {
    writeManagedHostSurfaces(env);
    const { state } = applyInstallSelection(['mcp'], ['mcp'], env);
    const status = installStateStatus(state, env);
    expect(enabledPlugins(state)).toEqual(['mcp']);
    expect(state.ownership_manifest.every(({ owner }) => owner === 'core')).toBe(true);
    expect(status.probes.mcp).toBeUndefined();
    expect(status.drift.status).toBe('consistent');
  }));

  test('a plugin probe reads only the host roots of the selection, never staging', () => {
    const rows: readonly { readonly root: (env: NodeJS.ProcessEnv) => string; readonly plugins: readonly PluginId[]; readonly status: 'present' | 'missing' }[] = [
      { root: env => join(env.HOME!, '.agents', 'skills'), plugins: ['product'], status: 'missing' },
      // A copy left in the Pi root is evidence only when the selection has `pi`.
      { root: env => hostSkillRoot(env.HOME!, 'pi', env), plugins: ['product'], status: 'missing' },
      { root: env => hostSkillRoot(env.HOME!, 'pi', env), plugins: ['pi', 'product'], status: 'present' },
    ];
    for (const row of rows) withHome((env) => {
      writeManagedHostSurfaces(env);
      const core = applyInstallSelection([], [], env).state;
      writePath(join(row.root(env), 'repo-harness-product', 'SKILL.md'), '# outside the host roots\n');
      const status = installStateStatus({ ...core, ...versions(row.plugins), selection: row.plugins }, env);
      expect(status.probes.product?.status, `${row.root(env)} ${row.plugins}`).toBe(row.status);
    });
  });

  test('a target without a host for a plugin skips it under all, fails an explicit list and probes per host root', () => withHome((base) => {
    const env = withPi(base);
    const rows: readonly { readonly id: PluginId; readonly target: 'claude' | 'codex'; readonly reason: string | null }[] = [
      { id: 'peer-runtime', target: 'codex', reason: null },
      { id: 'peer-runtime', target: 'claude', reason: null },
      { id: 'pi', target: 'claude', reason: '--target claude does not include the Pi host' },
      { id: 'pi', target: 'codex', reason: '--target codex does not include the Pi host' },
      { id: 'product', target: 'claude', reason: null },
      { id: 'cross-review', target: 'codex', reason: null },
    ];
    writeManagedHostSurfaces(env);
    const core = applyInstallSelection([], [], env).state;
    for (const { id, target, reason } of rows) {
      const label = `${id}/${target}`;
      const all = resolveRecordedSelection({ selection: 'all', plugins: [] }, target, env);
      expect(all.run.includes(id), label).toBe(reason === null);
      expect(all.skipped.find(entry => entry.id === id), label)
        .toEqual(reason === null ? undefined : { id, reason, command: 'repo-harness install --target both' });
      // A recorded plugin that the target cannot run stays in the record.
      const recorded = resolveRecordedSelection({ selection: 'all', plugins: versions([id]).plugins }, target, env);
      expect(recorded.record.includes(id), label).toBe(true);
      expect(recorded.kept.map(entry => entry.id), label).toEqual(reason === null ? [] : [id]);
      expect(installStateCode(() => resolveRecordedSelection({ selection: [id], plugins: versions([id]).plugins }, target, env)), label)
        .toBe(reason === null ? undefined : 'install_plugin_unavailable');
      if (reason === null && isCommandPlugin(id)) {
        expect(installStateStatus({ ...core, ...versions([id]), selection: [id] }, env).probes[id], label).toBeUndefined();
      } else if (reason === null) {
        // The probe of a skill plugin needs only the root of the target's host.
        writePath(join(env.HOME!, `.${target}`, 'skills', PLUGIN_SKILLS[id]![0]![1], 'SKILL.md'), '# managed\n');
        expect(installStateStatus({ ...core, ...versions([id]), selection: [id] }, env).probes[id]?.status, label).toBe('present');
      }
    }
  }));

  test('mutation-path rollback coverage includes the plugin-owned and explicit facades on both hosts', () => withHome((env) => {
    const paths = installProfileHostMutationPaths(env);
    for (const host of ['.codex', '.claude']) {
      for (const facade of ['repo-harness-check', 'repo-harness-product', 'repo-harness-ship']) {
        expect(paths).toContain(join(env.HOME!, host, 'skills', facade));
      }
      expect(paths).toContain(join(env.HOME!, host, 'skills', 'obsidian-markdown'));
      expect(paths).toContain(join(env.HOME!, host, 'skills', 'obsidian-cli'));
    }
    expect(paths).toContain(join(env.HOME!, '.agents', 'skills', 'obsidian-markdown'));
    expect(paths).toContain(join(env.HOME!, '.agents', 'skills', 'obsidian-cli'));
  }));

  test('explicit Obsidian companion projections become transaction-owned receipts and roll back atomically', () => withHome((env) => {
    writeManagedHostSurfaces(env, ['strategy-memory']);
    const transaction = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    const receiptPaths: string[] = [];
    for (const skill of ['obsidian-markdown', 'obsidian-cli']) {
      const staging = join(env.HOME!, '.agents', 'skills', skill);
      writePath(join(staging, 'SKILL.md'), `# ${skill}\n`);
      receiptPaths.push(staging);
      for (const host of ['.codex', '.claude']) {
        const projected = join(env.HOME!, host, 'skills', skill);
        mkdirSync(join(projected, '..'), { recursive: true });
        symlinkSync(staging, projected, 'dir');
        receiptPaths.push(projected);
      }
    }

    const installed = applyInstallSelection(
      ['strategy-memory'],
      ['strategy-memory'],
      env,
      new Date('2026-08-21T00:00:00.000Z'),
      transaction,
    ).state;
    for (const path of receiptPaths) {
      expect(installed.ownership_manifest.some((surface) => (
        surface.path === path && surface.owner === 'strategy-memory'
      ))).toBe(true);
    }
    expect(installStateStatus(installed, env).drift.status).toBe('consistent');

    writeFileSync(join(env.HOME!, '.agents', 'skills', 'obsidian-cli', 'SKILL.md'), '# drift\n');
    expect(installStateStatus(installed, env).drift.surface_drift)
      .toContain(join(env.HOME!, '.agents', 'skills', 'obsidian-cli'));

    rollbackInstallHostTransaction(transaction);
    for (const path of receiptPaths) expect(existsSync(path)).toBe(false);
    expect(readInstallState(env)).toBeNull();
  }));

  test('managed Obsidian refresh recaptures the changed tree hash in the existing install-state receipt', () => withHome((env) => {
    writeManagedHostSurfaces(env, ['strategy-memory']);
    const staging = join(env.HOME!, '.agents', 'skills', 'obsidian-cli');
    const projected = join(env.HOME!, '.codex', 'skills', 'obsidian-cli');

    const first = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    writePath(join(staging, 'SKILL.md'), '# old\n');
    mkdirSync(join(projected, '..'), { recursive: true });
    symlinkSync(staging, projected, 'dir');
    const initial = applyInstallSelection(['strategy-memory'], ['strategy-memory'], env, new Date('2026-08-21T00:00:00.000Z'), first).state;
    commitInstallHostTransaction(first);
    const before = initial.ownership_manifest.find((surface) => surface.path === staging)?.content_hash;
    expect(before).toBeDefined();

    const second = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    writeFileSync(join(staging, 'SKILL.md'), '# refreshed\n');
    const refreshed = applyInstallSelection(['strategy-memory'], ['strategy-memory'], env, new Date('2026-08-21T00:01:00.000Z'), second).state;
    commitInstallHostTransaction(second);
    const after = refreshed.ownership_manifest.find((surface) => surface.path === staging)?.content_hash;
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
    expect(installStateStatus(refreshed, env).drift.status).toBe('consistent');
  }));

  test('host transaction restores prior bytes and removes later mutations', () => withHome((env) => {
    writeManagedHostSurfaces(env);
    const adapter = join(env.HOME!, '.codex', 'hooks.json');
    const before = readFileSync(adapter);
    const statePath = installProfileStatePath(env);
    const lockPath = skillLock(env);
    writePath(statePath, '{"previous":"state"}\n');
    writePath(lockPath, '{"previous":"lock"}\n');
    const transaction = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    writeFileSync(adapter, '{"partially":"mutated"}\n');
    writeFileSync(statePath, '{"next":"state"}\n');
    writeFileSync(lockPath, '{"next":"lock"}\n');
    const created = join(env.HOME!, '.codex', 'skills', 'repo-harness-product');
    mkdirSync(created, { recursive: true });
    writeFileSync(join(created, 'SKILL.md'), '# partial\n');
    rollbackInstallHostTransaction(transaction);
    expect(readFileSync(adapter)).toEqual(before);
    expect(readFileSync(statePath, 'utf-8')).toBe('{"previous":"state"}\n');
    expect(readFileSync(lockPath, 'utf-8')).toBe('{"previous":"lock"}\n');
    expect(existsSync(created)).toBe(false);
  }));

  test('failed install compensates earlier host writes and never commits state', () => withHome((env) => {
    const bin = join(env.HOME!, 'fake-bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'bun'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1.2.0; exit 0; fi\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(bin, 'bunx'), '#!/bin/sh\nmkdir -p "$XDG_STATE_HOME/skills"\nprintf "{\\"partial\\":true}\\n" > "$XDG_STATE_HOME/skills/.skill-lock.json"\nexit 19\n', { mode: 0o755 });
    const adapter = join(env.HOME!, '.codex', 'hooks.json');
    mkdirSync(join(env.HOME!, '.codex'), { recursive: true });
    const before = '{"theme":"user-owned"}\n';
    writeFileSync(adapter, before);
    const failed = spawnSync(process.execPath, [CLI, 'install', '--target', 'codex', '--json'], {
      cwd: ROOT,
      env: {
        ...env,
        PATH: `${bin}:/bin:/usr/bin`,
        REPO_HARNESS_BUN_EXECUTABLE: join(bin, 'bun'),
      },
      encoding: 'utf-8',
    });
    expect(failed.status).not.toBe(0);
    expect(readFileSync(adapter, 'utf-8')).toBe(before);
    expect(existsSync(join(env.HOME!, '.codex', 'skills', 'repo-harness'))).toBe(false);
    expect(existsSync(skillLock(env))).toBe(false);
    expect(readInstallState(env)).toBeNull();
  }), 30_000);

  test('failed install restores the provider lock under XDG_STATE_HOME', () => withHome((env) => {
    const bin = join(env.HOME!, 'fake-bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'bun'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1.4.0; exit 0; fi\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(bin, 'bunx'), '#!/bin/sh\nprintf "{\\"skills\\":{\\"think\\":{}}}\\n" > "$XDG_STATE_HOME/skills/.skill-lock.json"\nexit 19\n', { mode: 0o755 });
    const stateHome = join(env.HOME!, 'custom-state');
    const lock = join(stateHome, 'skills', '.skill-lock.json');
    const before = '{"skills":{"user-skill":{}}}\n';
    writePath(lock, before);
    const failed = spawnSync(process.execPath, [CLI, 'install', '--target', 'codex', '--json'], {
      cwd: ROOT,
      env: { ...env, PATH: `${bin}:/bin:/usr/bin`, XDG_STATE_HOME: stateHome, REPO_HARNESS_BUN_EXECUTABLE: join(bin, 'bun') },
      encoding: 'utf-8',
    });
    expect(failed.status).not.toBe(0);
    expect(readFileSync(lock, 'utf-8')).toBe(before);
    expect(existsSync(join(env.HOME!, '.agents', '.skill-lock.json'))).toBe(false);
  }), 30_000);

  // This selection exercises the Waza rule refresh. FAKE_CURL_FAIL makes the fetch fail.
  function installWithFreshRules(env: NodeJS.ProcessEnv, extraEnv: NodeJS.ProcessEnv = {}) {
    const bin = join(env.HOME!, 'fake-bin');
    if (!existsSync(bin)) {
      writeManagedHostSurfaces(env, ALL_PLUGINS);
      for (const skill of [...WAZA_SKILLS, 'repo-harness-cross-review']) rmSync(join(env.HOME!, '.codex', 'skills', skill), { recursive: true });
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, 'bun'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1.4.0; fi\nexit 0\n', { mode: 0o755 });
      writeFileSync(join(bin, 'bunx'), '#!/bin/sh\nfor s in think hunt check health mermaid; do mkdir -p "$HOME/.agents/skills/$s"; echo "# $s" > "$HOME/.agents/skills/$s/SKILL.md"; done\n', { mode: 0o755 });
      writeFileSync(join(bin, 'curl'), '#!/bin/sh\n[ -n "$FAKE_CURL_FAIL" ] && { echo "fixture HTTP 503" >&2; exit 22; }\nwhile [ $# -gt 0 ]; do case "$1" in --output) out="$2"; shift;; https://*) url="$1";; esac; shift; done\necho "# upstream ${url##*/}" > "$out"\n', { mode: 0o755 });
      writeFakeHc(bin);
    }
    const run = spawnSync(process.execPath, [CLI, 'install', '--plugins', ALL_PLUGINS.filter(id => id !== 'operator').join(','), '--target', 'codex', '--no-cli', '--no-sync-skill', '--no-codegraph', '--json'], {
      cwd: ROOT, env: { ...env, ...extraEnv, PATH: `${bin}:/bin:/usr/bin`, REPO_HARNESS_BUN_EXECUTABLE: join(bin, 'bun') }, encoding: 'utf-8',
    });
    return { status: run.status, rules: JSON.parse(run.stdout).steps.find(({ step }: { step: string }) => step === 'sync Waza shared rules') };
  }

  test('a failed fresh Waza rule fetch rolls the install back and reports the step', () => withHome((env) => {
    const failed = installWithFreshRules(env, { FAKE_CURL_FAIL: '1' });
    expect(failed.status).not.toBe(0);
    expect(failed.rules).toMatchObject({ status: 'failed', detail: expect.stringContaining('fixture HTTP 503') });
    expect(readInstallState(env)).toBeNull();
    for (const root of ['.agents', '.codex']) expect(existsSync(join(env.HOME!, root, 'rules'))).toBe(false);
  }), 30_000);

  test('a regular file at the staging rules path gives the JSON failure and restores HOME', () => withHome((env) => {
    const staging = join(env.HOME!, '.agents', 'rules');
    writePath(staging, 'not a directory\n');
    const failed = installWithFreshRules(env);
    expect(failed.status).not.toBe(0);
    expect(failed.rules).toMatchObject({ status: 'failed', detail: expect.stringContaining('ENOTDIR') });
    expect(readFileSync(staging, 'utf-8')).toBe('not a directory\n');
    expect(readInstallState(env)).toBeNull();
    expect(existsSync(join(env.HOME!, '.codex', 'rules'))).toBe(false);
  }), 30_000);

  test('a fresh rule refresh keeps a locally edited owned host rule and the state bytes', () => withHome((env) => {
    expect(installWithFreshRules(env).status).toBe(0);
    const english = join(env.HOME!, '.codex', 'rules', 'english.md');
    const statePath = installProfileStatePath(env);
    const stateBefore = readFileSync(statePath);
    rmSync(join(env.HOME!, '.agents', 'rules'), { recursive: true });
    writeFileSync(english, '# local edit\n');
    const refused = installWithFreshRules(env);
    expect(refused.status).not.toBe(0);
    expect(refused.rules).toMatchObject({ status: 'failed', detail: `refusing to overwrite unowned rule ${english}` });
    expect(readFileSync(english, 'utf-8')).toBe('# local edit\n');
    expect(readFileSync(statePath)).toEqual(stateBefore);
  }), 60_000);

  test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('an install retries the fresh rules after a rolled-back host write', () => withHome((env) => {
    const hostRules = join(env.HOME!, '.codex', 'rules');
    mkdirSync(hostRules, { recursive: true });
    chmodSync(hostRules, 0o500);
    expect(installWithFreshRules(env).status).not.toBe(0);
    expect(readdirSync(join(env.HOME!, '.agents', 'rules'))).toEqual([]);
    chmodSync(hostRules, 0o700);
    const retried = installWithFreshRules(env);
    expect(retried.status).toBe(0);
    expect(retried.rules).toMatchObject({ status: 'ok' });
    expect(readFileSync(join(hostRules, 'english.md'), 'utf-8')).toBe('# upstream english.md\n');
  }), 60_000);

  test('a writer reaches the Pi skill root only when pi is selected', () => {
    const rows = [
      { name: 'pi absent: the old Herdr copy stays the only Pi entry', pi: false, entries: ['herdr'] },
      { name: 'pi selected: Waza, Mermaid, cross-review and Herdr project into the Pi root', pi: true,
        entries: ['check', 'health', 'herdr', 'hunt', 'mermaid', 'repo-harness-cross-review', 'think'] },
    ];
    for (const row of rows) withHome((base) => {
      const env = row.pi ? withPi(base) : base;
      writeManagedHostSurfaces(env, row.pi ? ALL_WITH_PI : ALL_PLUGINS);
      for (const skill of [...WAZA_SKILLS, 'repo-harness-cross-review']) rmSync(join(env.HOME!, '.codex', 'skills', skill), { recursive: true });
      rmSync(join(env.HOME!, '.claude', 'skills', 'repo-harness-herdr-portal'), { recursive: true });
      const bin = join(env.HOME!, 'fake-bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, 'bun'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1.4.0; fi\nexit 0\n', { mode: 0o755 });
      writeFileSync(join(bin, 'bunx'), '#!/bin/sh\nfor s in think hunt check health mermaid; do mkdir -p "$HOME/.agents/skills/$s"; echo "# $s" > "$HOME/.agents/skills/$s/SKILL.md"; done\n', { mode: 0o755 });
      writeFileSync(join(bin, 'curl'), '#!/bin/sh\nwhile [ $# -gt 0 ]; do case "$1" in --output) out="$2"; shift;; https://*) url="$1";; esac; shift; done\necho "# upstream ${url##*/}" > "$out"\n', { mode: 0o755 });
      // hc answers --version as the real binary does; the install step reads it before --skill.
      const hc = (manual: string) => writeFileSync(join(bin, 'hc'), `#!/bin/sh\n[ "$1" = --version ] && { echo "hc ${HC_MIN_VERSION}"; exit 0; }\nprintf "%s\\n" "# hc manual (herdr-core)" "${manual}" "\\\`\\$HC_TERMINAL_ID\\\` is your address."\n`, { mode: 0o755 });
      const runEnv = { ...env, PATH: `${bin}:${env.PATH}`, REPO_HARNESS_BUN_EXECUTABLE: join(bin, 'bun') };
      // The 0.25.x Herdr step created the Pi root and its herdr copy; the install then refreshes a newer manual.
      hc('old manual');
      expect(configureRequiredHerdrSkill('both', runEnv).status).toBe('ok');
      hc('new manual');
      const piRoot = hostSkillRoot(env.HOME!, 'pi', env);
      const plugins = (row.pi ? ALL_WITH_PI : ALL_PLUGINS).filter(id => id !== 'operator');
      const run = spawnSync(process.execPath, [CLI, 'install', '--plugins', plugins.join(','), '--target', 'both', '--no-cli', '--no-sync-skill', '--no-codegraph', '--json'], {
        cwd: ROOT, env: runEnv, encoding: 'utf-8',
      });
      expect(run.status, `${row.name}\n${run.stdout}\n${run.stderr}`).toBe(0);
      expect(readdirSync(piRoot).sort(), row.name).toEqual(row.entries);
      expect(readFileSync(join(piRoot, 'herdr', 'SKILL.md'), 'utf-8'), row.name).toContain(row.pi ? 'new manual' : 'old manual');
      // The strict reader accepts the state; the pre-existing Herdr copy stays unrecorded.
      const recorded = readInstallState(env)!.ownership_manifest.filter(surface => surface.path.startsWith(`${piRoot}/`));
      expect(recorded.map(surface => `${surface.owner}:${basename(surface.path)}`), row.name)
        .toEqual(row.pi ? row.entries.filter(name => name !== 'herdr').map(name => `pi:${name}`) : []);
    });
  }, 60_000);

  test('a relative XDG_STATE_HOME fails before the install takes its runtime lock', () => withHome((env) => {
    const failed = spawnSync(process.execPath, [CLI, 'install', '--no-plugins', '--json'], { cwd: env.HOME, env: { ...env, XDG_STATE_HOME: 'state' }, encoding: 'utf-8' });
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain('XDG_STATE_HOME must be an absolute path: state');
    expect(existsSync(join(env.HOME!, '.repo-harness'))).toBe(false);
  }));

  test('a relative XDG_STATE_HOME fails before the update takes its runtime lock', () => withHome((env) => {
    const failed = spawnSync(process.execPath, [CLI, 'update', '--json'], { cwd: ROOT, env: { ...env, XDG_STATE_HOME: 'state' }, encoding: 'utf-8' });
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain('XDG_STATE_HOME must be an absolute path: state');
    expect(existsSync(join(env.HOME!, '.repo-harness'))).toBe(false);
  }));

  test('committing a host transaction only discards its backups', () => withHome((env) => {
    const path = join(env.HOME!, 'surface');
    writeFileSync(path, 'before');
    const transaction = beginInstallHostTransaction([path], env);
    writeFileSync(path, 'after');
    commitInstallHostTransaction(transaction);
    expect(readFileSync(path, 'utf-8')).toBe('after');
    expect(existsSync(transaction.backup_root)).toBe(false);
  }));

  test('dropping plugins from all removes only their owned surfaces and sections, and records nothing of them', () => {
    // Each plugin alone, `install --plugins product` (five at once), and CodeGraph sections that a user wrote before the install.
    const rows: readonly { readonly keep: readonly PluginId[]; readonly userSections?: true }[] = [
      ...ALL_PLUGINS.map(dropped => ({ keep: ALL_PLUGINS.filter(id => id !== dropped) })),
      { keep: ['product'] },
      { keep: ALL_PLUGINS.filter(id => id !== 'architecture'), userSections: true },
    ];
    for (const { keep, userSections } of rows) withHome((env) => {
      const name = `keep ${keep.join(',')}${userSections ? ', user sections' : ''}`;
      const codexConfig = join(env.HOME!, '.codex', 'config.toml');
      const claudeJson = join(env.HOME!, '.claude.json');
      const claudeSettings = join(env.HOME!, '.claude', 'settings.json');
      // The CodeGraph sections that `codegraph install` and the Claude allowed-tools step write, beside user content.
      const writeConfigs = () => {
        writePath(codexConfig, 'default_mode_request_user_input = true\n\n[mcp_servers.codegraph]\ncommand = "codegraph"\nargs = ["serve", "--mcp"]\n\n[profiles.user]\nmodel = "user-model"\n');
        writePath(claudeJson, `${JSON.stringify({ userSetting: true, mcpServers: {
          'user-server': { type: 'stdio', command: 'user-mcp' },
          codegraph: { type: 'stdio', command: 'codegraph', args: ['serve', '--mcp'], alwaysLoad: true },
        } }, null, 2)}\n`);
        writePath(claudeSettings, `${JSON.stringify({ hooks: buildManagedHooks('claude', env), permissions: { allow: ['Bash(ls)'] }, allowedTools: ['Read', 'mcp__codegraph__*'] }, null, 2)}\n`);
      };
      if (userSections) writeConfigs();
      const first = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
      writeManagedHostSurfaces(env, ALL_PLUGINS);
      if (!userSections) writeConfigs();
      const lock = skillLock(env);
      writePath(join(env.HOME!, '.agents', 'skills', 'repo-harness-cross-review', 'SKILL.md'), '# owned staging skill\n');
      writePath(lock, `${JSON.stringify({ version: 3, skills: {
        'repo-harness-cross-review': { source: 'repo-harness' },
        'user-skill': { source: 'user/repo' },
      } }, null, 2)}\n`);
      const all = applyInstallSelection('all', ALL_PLUGINS, env, new Date('2026-01-01T00:00:00Z'), first);
      commitInstallHostTransaction(first);
      const owners = new Set(all.state.ownership_manifest.map(({ owner }) => owner));
      for (const owner of ['core', ...HOST_FILE_PLUGINS]) expect(owners.has(owner as PluginId), owner).toBe(true);
      const sections = all.state.ownership_manifest.filter(({ managed_marker }) => managed_marker === 'codegraph-config-projection').map(({ path }) => path);
      expect(sections.sort(), name).toEqual(userSections ? [] : [claudeJson, claudeSettings, codexConfig].sort());

      const second = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
      const removed = prepareInstallSelectionSwitch(keep, env);
      applyInstallSelection(keep, keep, env, new Date('2026-01-02T00:00:00Z'), second);
      commitInstallHostTransaction(second);

      const state = readInstallState(env)!;
      expect(state.selection, name).toEqual(keep);
      expect(state.ownership_manifest.filter(({ owner }) => !ownerEnabled(owner, keep)), name).toEqual([]);
      // A shared configuration file is never owned as a whole file.
      expect(state.ownership_manifest.filter(({ path, managed_marker }) => (
        [codexConfig, claudeJson, claudeSettings, join(env.HOME!, '.codex', 'hooks.json')].includes(path) && managed_marker === 'transaction-created-file'
      )), name).toEqual([]);
      const droppedSurfaces = all.state.ownership_manifest.filter(({ owner }) => !ownerEnabled(owner, keep));
      expect([...new Set(removed)].sort(), name).toEqual([...new Set(droppedSurfaces.map(({ path }) => path))].sort());
      for (const surface of droppedSurfaces) {
        if (surface.managed_marker === 'codegraph-config-projection') expect(codegraphProjection(surface.path), `${name}: ${surface.path}`).toBeNull();
        else expect(existsSync(surface.path), `${name}: ${surface.path}`).toBe(false);
      }
      for (const { path } of all.state.ownership_manifest.filter(({ owner }) => ownerEnabled(owner, keep))) expect(existsSync(path), `${name}: ${path}`).toBe(true);
      // An owned section goes with architecture; a user's section stays.
      for (const path of [claudeJson, claudeSettings, codexConfig]) expect(codegraphProjection(path) !== null, `${name}: ${path}`).toBe(keep.includes('architecture') || userSections === true);
      expect(readFileSync(codexConfig, 'utf-8'), name).toContain('default_mode_request_user_input = true');
      expect(readFileSync(codexConfig, 'utf-8'), name).toContain('[profiles.user]\nmodel = "user-model"');
      expect(JSON.parse(readFileSync(claudeJson, 'utf-8')), name).toMatchObject({ userSetting: true, mcpServers: { 'user-server': { command: 'user-mcp' } } });
      const settings = JSON.parse(readFileSync(claudeSettings, 'utf-8'));
      expect([settings.permissions, settings.allowedTools.includes('Read'), settings.hooks], name).toEqual([{ allow: ['Bash(ls)'] }, true, buildManagedHooks('claude', env)]);
      const lockState = JSON.parse(readFileSync(lock, 'utf-8'));
      expect(lockState.skills['user-skill'], name).toEqual({ source: 'user/repo' });
      expect(lockState.skills['repo-harness-cross-review'] !== undefined, name).toBe(keep.includes('cross-review'));
      expect(installStateStatus(state, env).drift.status, name).toBe('consistent');
    });
  }, 60_000);

  test('a selection switch rejects ownership paths outside canonical managed surfaces', () => withHome((env) => {
    const external = join(env.HOME!, 'user-owned.txt');
    const content = 'must survive';
    writeFileSync(external, content);
    writePath(installProfileStatePath(env), `${JSON.stringify(seededState(ALL_PLUGINS, 'all', [{
      owner: 'core',
      authority: 'repo-harness-install-transaction',
      removal: 'managed-surfaces-only',
      path: external,
      type: 'managed-file',
      content_hash: `sha256:${createHash('sha256').update(content).digest('hex')}`,
      managed_marker: 'transaction-created-file',
      symlink_target: null,
    }]), null, 2)}\n`);

    expect(() => prepareInstallSelectionSwitch([], env)).toThrow('invalid ownership surface');
    expect(readFileSync(external, 'utf-8')).toBe(content);
    // The hook selection read uses the read model only; the installer commands own the surface check (#1680).
    expect(readRecordedSelection(env)).toEqual({ status: 'recorded', selection: 'all', plugins: ALL_PLUGINS });
  }));

  test('the plugin guards of a recorded all print update, because an explicit list would end all', () => withHome((env) => {
    recordPluginSelection(env, ['product'], 'all');
    const selection = readRecordedSelection(env);
    expect(selection).toEqual({ status: 'recorded', selection: 'all', plugins: ['product'] });
    // scripts/lib/architecture-plugin.sh prints this report.
    expect(architectureSelectionReport(selection)).toEqual({ status: 'not-selected', message: 'the architecture plugin is not selected; run: repo-harness update' });
    for (const [id, command] of [['mcp', 'mcp serve'], ['strategy-memory', 'strategy']] as const) {
      expect(() => assertPluginCommandSelected(selection, id, command, env))
        .toThrow(`install_plugin_unavailable: repo-harness ${command} needs the ${id} plugin: the ${id} plugin is not selected; run: repo-harness update`);
    }
  }));

  test('reinstall refreshes ownership for an already-owned CodeGraph projection', () => withHome((env) => {
    const first = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    writeManagedHostSurfaces(env, ALL_PLUGINS);
    const config = join(env.HOME!, '.codex', 'config.toml');
    writePath(config, '[mcp_servers.codegraph]\ncommand = "codegraph"\nargs = ["serve"]\n');
    const initial = applyInstallSelection('all', ALL_PLUGINS, env, new Date('2026-01-01T00:00:00Z'), first);
    commitInstallHostTransaction(first);
    const original = initial.state.ownership_manifest.find(({ managed_marker }) => (
      managed_marker === 'codegraph-config-projection'
    ));
    expect(original?.owner).toBe('architecture');

    const second = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    writeFileSync(config, '[mcp_servers.codegraph]\ncommand = "codegraph"\nargs = ["serve", "--mcp"]\n');
    const refreshed = applyInstallSelection('all', ALL_PLUGINS, env, new Date('2026-01-02T00:00:00Z'), second);
    commitInstallHostTransaction(second);
    const next = refreshed.state.ownership_manifest.find(({ managed_marker }) => (
      managed_marker === 'codegraph-config-projection'
    ));
    expect(next).toBeDefined();
    expect(next?.content_hash).not.toBe(original?.content_hash);
    expect(installStateStatus(refreshed.state, env).drift.status).toBe('consistent');
  }));

  test('update resolves the recorded selection on this host', () => {
    interface Row {
      readonly name: string;
      readonly selection: PluginSelection;
      readonly recorded: readonly PluginId[];
      /** pi on PATH while the state is seeded, and during the update. */
      readonly pi: readonly [boolean, boolean];
      readonly options?: Partial<GlobalRuntimeOptions>;
      readonly ran: readonly PluginId[];
      readonly lines?: readonly string[];
      /** Null: the state bytes stay as they were. */
      readonly committed: readonly PluginId[] | null;
    }
    const keptCommand = `repo-harness install --plugins ${ALL_PLUGINS.join(',')}`;
    const rows: readonly Row[] = [
      {
        name: 'all, pi appears: update installs and records pi', selection: 'all', recorded: ALL_PLUGINS, pi: [false, true], ran: ALL_WITH_PI,
        committed: ALL_WITH_PI,
      },
      { name: 'explicit list, pi appears: the list does not grow', selection: ALL_PLUGINS, recorded: ALL_PLUGINS, pi: [false, true], ran: ALL_PLUGINS, committed: null },
      {
        name: 'explicit list without command plugins: one repair keeps the list and adds them', selection: ['architecture', 'product'], recorded: ['architecture', 'product'], pi: [false, false], ran: ['architecture', 'product'],
        lines: ['[plugins] not selected mcp, operator, peer-runtime: an explicit list does not grow; to add them, run: repo-harness install --plugins architecture,mcp,operator,peer-runtime,product'], committed: null,
      },
      {
        name: 'explicit list without operator and peer-runtime: the repair adds both', selection: ['mcp'], recorded: ['mcp'], pi: [false, false], ran: ['mcp'],
        lines: ['[plugins] not selected operator, peer-runtime: an explicit list does not grow; to add them, run: repo-harness install --plugins mcp,operator,peer-runtime'], committed: null,
      },
      {
        name: 'all, recorded pi disappears: kept with its line', selection: 'all', recorded: ALL_WITH_PI, pi: [true, false], ran: ALL_PLUGINS,
        lines: [`[plugins] kept pi: pi is not on PATH; update keeps the recorded plugin; to remove it, run: ${keptCommand}`], committed: null,
      },
      {
        name: 'all, pi appears in a partial refresh: not added', selection: 'all', recorded: ALL_PLUGINS, pi: [false, true], options: { syncSkill: false }, ran: ALL_PLUGINS,
        lines: ['[plugins] not added pi in a partial refresh; run: repo-harness update'], committed: null,
      },
    ];
    for (const row of rows) withHome((base) => {
      const seedEnv = row.pi[0] ? withPi(base) : base;
      const env = row.pi[1] ? withPi(base) : base;
      writeManagedHostSurfaces(seedEnv, row.recorded);
      const source = bunGlobalPackageRoot(seedEnv)!;
      const seededPi = row.recorded.includes('pi') ? [installPiPackage(source, true, seedEnv)] : [];
      expect(seededPi.every(step => step.created), row.name).toBe(true);
      applyInstallSelection(row.selection, row.recorded, seedEnv, new Date('2026-11-01T00:00:00Z'), undefined,
        { additionalSurfaces: seededPi.map(step => piPackageSurface(step.source)) });
      const statePath = installProfileStatePath(env);
      const before = readFileSync(statePath);
      const ran: PluginId[][] = [];
      const result = runTransactionalRuntimeRefresh({ env, cwd: env.HOME, target: 'both', ...row.options }, (options): GlobalRuntimeResult => {
        ran.push([...options.plugins!]);
        const pi = installPiPackage(source, options.plugins!.includes('pi'), options.env!);
        return { exitCode: 0, steps: [{ ...pi, ...(pi.created ? { owned_surface: piPackageSurface(pi.source) } : {}) }], lines: [], stdout: '', stderr: '' };
      });
      expect({ name: row.name, exitCode: result.exitCode, ran }).toEqual({ name: row.name, exitCode: 0, ran: [[...row.ran]] });
      for (const line of row.lines ?? []) expect(result.lines.some(entry => entry.startsWith(line)), `${row.name}: ${line}`).toBe(true);
      const notSelected = (lines: readonly string[]) => lines.filter(line => line.startsWith('[plugins] not selected'));
      expect(notSelected(result.lines), row.name).toEqual(notSelected(row.lines ?? []));
      if (row.committed === null) {
        expect(readFileSync(statePath), row.name).toEqual(before);
        return;
      }
      const state = readInstallState(env)!;
      expect([state.selection, enabledPlugins(state), enabledPlugins(state.previous!)], row.name)
        .toEqual([row.selection, [...row.committed], [...row.recorded]]);
      expect(state.ownership_manifest.filter(({ type }) => type === 'pi-package'), row.name).toEqual([piPackageSurface(source)]);
    });
  }, 60_000);

  test('after a candidate handoff the parent leaves the install state to the candidate', () => withHome((env) => {
    writeManagedHostSurfaces(env, ALL_PLUGINS);
    applyInstallSelection('all', ALL_PLUGINS, env);
    const statePath = installProfileStatePath(env);
    // A newer candidate records a plugin that this version does not know.
    const candidateState = `${JSON.stringify({ ...seededState(ALL_PLUGINS, 'all'), plugins: [...versions(ALL_PLUGINS).plugins, { id: 'future-plugin', version: versions([]).core.version }] })}\n`;
    const result = runTransactionalRuntimeRefresh({ env, cwd: env.HOME, target: 'both' }, (): GlobalRuntimeResult => {
      writeFileSync(statePath, candidateState);
      return { exitCode: 0, steps: [{ step: CANDIDATE_RECONCILE_STEP, status: 'ok' }], lines: [], stdout: '', stderr: '' };
    });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(statePath, 'utf-8')).toBe(candidateState);
  }));

  test('update with no install state fails with install_state_missing before setup', () => withHome((env) => {
    let setupRan = false;
    expect(installStateCode(() => runTransactionalRuntimeRefresh({ env, cwd: env.HOME, updateMode: true }, () => {
      setupRan = true;
      throw new Error('unreachable');
    }))).toBe('install_state_missing');
    expect(setupRan).toBe(false);
    expect(existsSync(installProfileStatePath(env))).toBe(false);
  }));

  test('a verified fleet run adopts pristine agents so a fleet projection change upgrades past a user-managed agent', () => withHome((env) => {
    const home = env.HOME!;
    writeManagedHostSurfaces(env, ALL_PLUGINS);
    rmSync(join(home, '.codex', 'agents'), { recursive: true, force: true });
    const packageRoot = join(home, 'fleet-package');
    const script = join(packageRoot, 'scripts', 'install-agent-fleet.sh');
    mkdirSync(join(packageRoot, 'scripts'), { recursive: true });
    cpSync(join(ROOT, 'scripts', 'install-agent-fleet.sh'), script);
    cpSync(join(ROOT, 'agents', 'fleet'), join(packageRoot, 'agents', 'fleet'), { recursive: true });
    symlinkSync(join(ROOT, 'src'), join(packageRoot, 'src'), 'dir');
    const runFleet = (...args: string[]) => spawnSync('bash', [script, ...args], { cwd: ROOT, encoding: 'utf-8', env });
    expect(runFleet().status).toBe(0);

    const custom = join(home, '.codex', 'agents', 'explorer.toml');
    const customContent = readFileSync(custom, 'utf-8').replace('model = "gpt-6-luna"', 'model = "gpt-6.1-sol"');
    writeFileSync(custom, customContent);
    expect(runFleet('--accept-user-managed').status).toBe(0);

    const pristine = join(home, '.codex', 'agents', 'deep-worker.toml');
    const unverified = applyInstallSelection('all', ALL_PLUGINS, env).state;
    expect(unverified.ownership_manifest.some(({ path }) => path === pristine)).toBe(false);

    // Update paths record into the existing manifest without re-applying the selection.
    recordVerifiedAgentFleetOwnership(env);
    const recorded = readInstallState(env)!;
    const recordedPaths = recorded.ownership_manifest.map(({ path }) => path);
    expect(recordedPaths).toContain(pristine);
    expect(recordedPaths).toContain(join(home, '.claude', 'agents', 'explorer.md'));
    expect(recordedPaths).not.toContain(custom);
    expect(installStateStatus(recorded, env).drift.status).toBe('consistent');

    // Bootstrap has no prior manifest, so applyInstallSelection adopts directly.
    rmSync(installProfileStatePath(env));
    const adopted = applyInstallSelection('all', ALL_PLUGINS, env, new Date(), undefined, { agentFleetVerified: true }).state;
    expect(adopted.ownership_manifest.map(({ path }) => path).sort()).toEqual(recordedPaths.sort());

    for (const agent of MANAGED_AGENTS) {
      const source = join(packageRoot, 'agents', 'fleet', `${agent}.md`);
      writeFileSync(source, `${readFileSync(source, 'utf-8')}\nUpdated role instruction.\n`);
    }
    const upgraded = runFleet();
    expect(upgraded.status).toBe(0);
    expect(upgraded.stdout).toContain('[fleet] codex/deep-worker.toml: installed');
    expect(upgraded.stdout).toContain('[fleet] codex/explorer.toml: user-managed');
    expect(readFileSync(pristine, 'utf-8')).toContain('Updated role instruction.');
    expect(readFileSync(custom, 'utf-8')).toBe(customContent);
  }), 60_000);

  test('dropping a plugin preserves a user-owned staging skill registry when only host links are transaction-owned', () => withHome((env) => {
    writeManagedHostSurfaces(env, ALL_PLUGINS);
    const names = ['obsidian-markdown', 'obsidian-cli', 'reverse-skill-router'];
    for (const name of names) writePath(join(env.HOME!, '.agents', 'skills', name, 'SKILL.md'), `# ${name}\n`);
    const lock = skillLock(env);
    writePath(lock, `${JSON.stringify({ version: 3, skills: {
      'obsidian-markdown': { source: 'user/obsidian' },
      'reverse-skill-router': { source: 'user/reverse' },
    } }, null, 2)}\n`);

    const first = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    for (const name of names) {
      const destination = join(env.HOME!, '.codex', 'skills', name);
      symlinkSync(join(env.HOME!, '.agents', 'skills', name), destination);
    }
    const all = applyInstallSelection('all', ALL_PLUGINS, env, new Date('2026-01-01T00:00:00Z'), first);
    commitInstallHostTransaction(first);
    expect(all.state.ownership_manifest.find(({ path }) => path.endsWith('/.codex/skills/obsidian-markdown'))?.owner).toBe('strategy-memory');
    expect(all.state.ownership_manifest.some(({ path }) => path.includes('/reverse-skill-router'))).toBe(false);

    const second = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    prepareInstallSelectionSwitch([], env);
    applyInstallSelection([], [], env, new Date('2026-01-02T00:00:00Z'), second);
    commitInstallHostTransaction(second);

    expect(existsSync(join(env.HOME!, '.codex', 'skills', 'obsidian-markdown'))).toBe(false);
    expect(existsSync(join(env.HOME!, '.agents', 'skills', 'obsidian-markdown', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(env.HOME!, '.codex', 'skills', 'reverse-skill-router', 'SKILL.md'))).toBe(true);
    expect(JSON.parse(readFileSync(lock, 'utf-8')).skills).toEqual({
      'obsidian-markdown': { source: 'user/obsidian' },
      'reverse-skill-router': { source: 'user/reverse' },
    });
  }));

  // Every other multi-call selection test in this file drops plugins or
  // reapplies the same selection; this one goes from core only to all.
  test('a selection upgrade adds ownership for newly selected plugins without disturbing prior ones', () => withHome((env) => {
    writeManagedHostSurfaces(env);
    const core = applyInstallSelection([], [], env, new Date('2026-01-01T00:00:00Z'));
    expect(enabledPlugins(core.state)).toEqual([]);
    expect(installStateStatus(core.state, env).drift.status).toBe('consistent');
    const canonicalSkillBefore = readFileSync(join(env.HOME!, '.codex', 'skills', 'repo-harness', 'src/cli/commands/state.ts'), 'utf-8');

    // Materialize the plugin skills on top of the still-present core ones,
    // then upgrade in place without a prior removal step.
    for (const id of ALL_PLUGINS) {
      for (const [host, skill] of PLUGIN_SKILLS[id] ?? []) writePath(join(env.HOME!, `.${host}`, 'skills', skill, 'SKILL.md'), '# managed\n');
    }

    const all = applyInstallSelection('all', ALL_PLUGINS, env, new Date('2026-01-02T00:00:00Z'));
    expect(enabledPlugins(all.state)).toEqual([...ALL_PLUGINS]);
    expect(all.plan.current_plugins).toEqual([]);
    expect(all.plan.install).toEqual([...ALL_PLUGINS]);
    expect(all.plan.remove).toEqual([]);
    expect(installStateStatus(all.state, env).drift.status).toBe('consistent');
    expect(existsSync(join(env.HOME!, '.codex', 'agents', 'explorer.toml'))).toBe(true);
    // The prior core projection is untouched by the upgrade.
    expect(readFileSync(join(env.HOME!, '.codex', 'skills', 'repo-harness', 'src/cli/commands/state.ts'), 'utf-8')).toBe(canonicalSkillBefore);
    expect(rollbackInstallSelection(env).selection).toEqual([]);
  }));

  test('CodeGraph and the archcontext source follow the architecture plugin: a policy opt-in without it fails closed, never repo size', () => withHome((env) => {
    const cwd = env.HOME!;
    expect(() => assertArchitecturePolicySelection(cwd, [], env)).not.toThrow();

    // Each policy key that needs the plugin, alone and together.
    for (const [policy, needs] of [
      [{ tooling: { codegraph: { enabled: true } } }, 'tooling.codegraph.enabled: true'],
      [{ context: { capability_source: 'archcontext' } }, 'context.capability_source: archcontext'],
      [{ context: { capability_source: 'archcontext' }, tooling: { codegraph: { enabled: true } } }, 'context.capability_source: archcontext and tooling.codegraph.enabled: true'],
    ] as const) {
      const optIn = mkdtempSync(join(tmpdir(), 'repo-harness-architecture-optin-'));
      try {
        writePath(join(optIn, '.ai/harness/policy.json'), JSON.stringify(policy));
        expect(installStateCode(() => assertArchitecturePolicySelection(optIn, ['product'], env))).toBe('install_plugin_unavailable');
        expect(() => assertArchitecturePolicySelection(optIn, ['product'], env)).toThrow(`sets ${needs}, which needs the architecture plugin; run: repo-harness install --plugins architecture,product`);
        expect(() => assertArchitecturePolicySelection(optIn, ['architecture'], env)).not.toThrow();
      } finally {
        rmSync(optIn, { recursive: true, force: true });
      }
    }

    // A large tracked-file count is not an opt-in signal: no policy entry, no CodeGraph requirement.
    const large = mkdtempSync(join(tmpdir(), 'repo-harness-codegraph-large-'));
    try {
      expect(spawnSync('git', ['init', '-q'], { cwd: large, encoding: 'utf-8' }).status).toBe(0);
      mkdirSync(join(large, 'src'), { recursive: true });
      for (let i = 0; i < 2_100; i += 1) writeFileSync(join(large, 'src', `f${i}.ts`), 'export const x = 1;\n');
      expect(spawnSync('git', ['add', '-A'], { cwd: large, encoding: 'utf-8' }).status).toBe(0);
      const tracked = spawnSync('git', ['ls-files'], { cwd: large, encoding: 'utf-8' });
      expect(tracked.stdout.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(2_000);
      expect(() => assertArchitecturePolicySelection(large, [], env)).not.toThrow();
    } finally {
      rmSync(large, { recursive: true, force: true });
    }
  }), 30_000);

  test('CLI dry-run and state query expose the machine-readable selection', () => withHome((env) => {
    // The checkout's own policy enables CodeGraph, so these runs start outside it.
    const dryRun = spawnSync(process.execPath, [CLI, 'install', '--plugins', 'product', '--dry-run', '--json'], {
      cwd: env.HOME, env, encoding: 'utf-8',
    });
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(JSON.parse(dryRun.stdout)).toMatchObject({ selection: ['product'], requested_plugins: ['product'] });
    expect(readInstallState(env)).toBeNull();

    const unknown = spawnSync(process.execPath, [CLI, 'install', '--plugins', 'product,future-plugin', '--dry-run', '--json'], {
      cwd: env.HOME, env, encoding: 'utf-8',
    });
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr).toContain('unknown plugin "future-plugin"');

    writeManagedHostSurfaces(env);
    applyInstallSelection([], [], env);
    const state = spawnSync(process.execPath, [CLI, 'install', '--state', '--json'], {
      cwd: ROOT, env, encoding: 'utf-8',
    });
    expect(state.status).toBe(0);
    expect(JSON.parse(state.stdout)).toMatchObject({ selection: [], plugins: [] });
  }), 30_000);
});

describe('skill projection ownership', () => {
  function packageAt(home: string, source: string): string {
    const packageRoot = join(home, '.bun/install/global/node_modules/repo-harness');
    cpSync(source, packageRoot, { recursive: true });
    writePath(join(packageRoot, 'package.json'), JSON.stringify({ name: 'repo-harness', version: '0.20.0' }));
    mkdirSync(join(packageRoot, 'assets/skill-commands'), { recursive: true });
    cpSync(join(ROOT, 'assets/skill-commands/manifest.json'), join(packageRoot, 'assets/skill-commands/manifest.json'));
    for (const skill of ['repo-harness-cross-review', 'repo-harness-herdr-portal']) {
      cpSync(join(ROOT, 'assets/skills', skill), join(packageRoot, 'assets/skills', skill), { recursive: true });
    }
    return packageRoot;
  }

  for (const mode of ['global', 'global-alias', 'checkout', 'npx', 'explicit-copy'] as const) {
    test(`${mode} provider projection records the on-disk type`, () => withHome(env => {
      const { canonical, source } = writeManagedHostSurfaces(env, ALL_PLUGINS);
      const packageRoot = packageAt(env.HOME!, source);
      let selectedSource = packageRoot;
      if (mode === 'checkout' || mode === 'npx') {
        selectedSource = join(env.HOME!, mode === 'npx' ? '_npx/cache/node_modules/repo-harness' : 'checkout');
        cpSync(packageRoot, selectedSource, { recursive: true });
      }
      if (mode === 'global-alias') {
        selectedSource = join(env.HOME!, 'source-alias');
        symlinkSync(packageRoot, selectedSource);
      }
      const linked = mode === 'global' || mode === 'global-alias';
      const activeEnv = { ...env, AGENTIC_DEV_LINK_INSTALLED_COPIES: mode === 'explicit-copy' ? '0' : '1' };
      rmSync(canonical); symlinkSync(packageRoot, canonical);
      const paths = ['.claude', '.codex'].map(host => join(env.HOME!, host, 'skills/repo-harness-cross-review'));
      for (const dest of [...paths, join(env.HOME!, '.claude/skills/repo-harness-herdr-portal')]) rmSync(dest, { recursive: true, force: true });
      const transaction = beginInstallHostTransaction(paths, activeEnv);
      try {
        expect(syncCrossReviewSkills(selectedSource, 'both', activeEnv).every(step => step.status === 'ok')).toBe(true);
        const state = applyInstallSelection('all', ALL_PLUGINS, activeEnv, new Date(), transaction).state;
        for (const dest of paths) {
          const record = state.ownership_manifest.find(surface => surface.path === dest);
          expect(record?.type).toBe(linked ? 'symlink' : 'directory-copy');
          expect(lstatSync(dest).isSymbolicLink()).toBe(linked);
          if (linked) expect(readlinkSync(dest)).toBe(join(packageRoot, 'assets/skills/repo-harness-cross-review'));
          expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toBe(readFileSync(join(packageRoot, 'assets/skills/repo-harness-cross-review/SKILL.md'), 'utf8'));
        }
        expect(installStateStatus(state, activeEnv).drift.surface_drift).toEqual([]);
        expect(readInstallState(activeEnv)?.ownership_manifest).toEqual(state.ownership_manifest);
      } finally { commitInstallHostTransaction(transaction); }
    }));
  }

  test('global projection is idempotent and keeps current link ownership', () => withHome(base => {
    // The Pi skill root belongs to the pi plugin, so this selection runs with a fake pi.
    const env = withPi(base);
    const { canonical, source } = writeManagedHostSurfaces(env, ALL_WITH_PI);
    const packageRoot = packageAt(env.HOME!, source);
    writePath(join(packageRoot, 'package.json'), JSON.stringify({ name: 'repo-harness', version: '0.20.0', pi: { extensions: ['./extension.ts'] } }));
    const pi = installPiPackage(packageRoot, true, env);
    expect(pi.created).toBe(true);
    rmSync(canonical); symlinkSync(packageRoot, canonical);
    const paths = [
      ...['.claude', '.codex'].map(host => join(env.HOME!, host, 'skills/repo-harness-cross-review')),
      join(env.HOME!, '.pi/agent/skills/repo-harness-cross-review'),
      join(env.HOME!, '.claude/skills/repo-harness-herdr-portal'),
    ];
    for (const dest of paths) rmSync(dest, { recursive: true, force: true });
    mkdirSync(join(env.HOME!, '.pi/agent/skills'), { recursive: true });
    expect(syncCrossReviewSkills(packageRoot, 'both', env).every(step => step.status === 'ok')).toBe(true);
    const first = applyInstallSelection('all', ALL_WITH_PI, env, new Date(), undefined, { additionalSurfaces: [piPackageSurface(pi.source)] }).state;
    const links = paths.map(dest => ({ inode: lstatSync(dest).ino, target: readlinkSync(dest) }));
    const steps = syncCrossReviewSkills(packageRoot, 'both', env);
    expect(steps).toHaveLength(paths.length);
    expect(steps.every(step => step.status === 'ok' && step.detail === 'already present')).toBe(true);
    const second = applyInstallSelection('all', ALL_WITH_PI, env).state;
    for (const [index, dest] of paths.entries()) {
      expect(lstatSync(dest).ino).toBe(links[index]!.inode);
      expect(readlinkSync(dest)).toBe(links[index]!.target);
      expect(second.ownership_manifest.find(surface => surface.path === dest)?.type).toBe('symlink');
    }
    expect(second.transaction_id).toBe(first.transaction_id);
    expect(installStateStatus(second, env).drift.surface_drift).toEqual([]);
  }));

  test('review regression: existing checkout links stay user-owned and accepted', () => withHome(env => {
    const { source } = writeManagedHostSurfaces(env, ALL_PLUGINS);
    mkdirSync(join(source, 'assets/skill-commands'), { recursive: true });
    cpSync(join(ROOT, 'assets/skill-commands/manifest.json'), join(source, 'assets/skill-commands/manifest.json'));
    const links = [
      ...['.claude', '.codex'].map(host => ({ skill: 'repo-harness-cross-review', dest: join(env.HOME!, host, 'skills/repo-harness-cross-review') })),
      { skill: 'repo-harness-cross-review', dest: join(env.HOME!, '.pi/agent/skills/repo-harness-cross-review') },
      { skill: 'repo-harness-herdr-portal', dest: join(env.HOME!, '.claude/skills/repo-harness-herdr-portal') },
    ].map(({ skill, dest }) => ({ dest, bundled: join(source, 'assets/skills', skill) }));
    for (const skill of ['repo-harness-cross-review', 'repo-harness-herdr-portal']) {
      cpSync(join(ROOT, 'assets/skills', skill), join(source, 'assets/skills', skill), { recursive: true });
    }
    const paths = links.map(link => link.dest);
    for (const { dest, bundled } of links) {
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(join(dest, '..'), { recursive: true });
      symlinkSync(bundled, dest);
    }
    const transaction = beginInstallHostTransaction(paths, env);
    try {
      const steps = syncCrossReviewSkills(source, 'both', env);
      expect(steps).toHaveLength(paths.length);
      expect(steps.every(step => step.status === 'ok' && step.detail === 'already present')).toBe(true);
      const state = applyInstallSelection('all', ALL_PLUGINS, env, new Date(), transaction).state;
      expect(state.ownership_manifest.filter(surface => paths.includes(surface.path))).toEqual([]);
      for (const { dest, bundled } of links) expect(readlinkSync(dest)).toBe(bundled);
    } finally { commitInstallHostTransaction(transaction); }
  }));

  for (const acquisition of ['discovered', 'transaction-created', 'recorded-under-another-owner'] as const) {
    test(`review regression: ${acquisition} Waza links are core-owned and survive a switch to core only`, () => withHome(env => {
      writeManagedHostSurfaces(env, ALL_PLUGINS);
      const names = ['think', 'hunt', 'check', 'health'];
      const paths = ['.codex', '.claude'].flatMap(host => names.map(name => join(env.HOME!, host, 'skills', name)));
      for (const dest of paths) rmSync(dest, { recursive: true, force: true });
      const transaction = acquisition === 'transaction-created' ? beginInstallHostTransaction(paths, env) : undefined;
      try {
        for (const name of names) {
          const source = join(env.HOME!, '.agents/skills', name);
          writePath(join(source, 'SKILL.md'), `# user-staged ${name}\n`);
          for (const host of ['.codex', '.claude']) {
            const dest = join(env.HOME!, host, 'skills', name);
            mkdirSync(join(dest, '..'), { recursive: true });
            symlinkSync(source, dest);
          }
        }
        const state = applyInstallSelection('all', ALL_PLUGINS, env, new Date(), transaction).state;
        for (const dest of paths) {
          expect(state.ownership_manifest.find(surface => surface.path === dest)?.owner).toBe('core');
        }
        if (acquisition === 'recorded-under-another-owner') {
          const ledgerPath = installProfileStatePath(env);
          const recorded = JSON.parse(readFileSync(ledgerPath, 'utf8'));
          for (const surface of recorded.ownership_manifest) {
            if (paths.includes(surface.path)) surface.owner = 'product';
          }
          writeFileSync(ledgerPath, JSON.stringify(recorded));
          const refreshed = applyInstallSelection('all', ALL_PLUGINS, env).state;
          for (const dest of paths) {
            expect(refreshed.ownership_manifest.find(surface => surface.path === dest)?.owner).toBe('core');
          }
        }
        const removed = prepareInstallSelectionSwitch([], env);
        const core = applyInstallSelection([], [], env).state;
        for (const dest of paths) {
          expect(removed).not.toContain(dest);
          expect(existsSync(dest)).toBe(true);
          expect(core.ownership_manifest.find(surface => surface.path === dest)?.owner).toBe('core');
        }
        for (const name of names) {
          expect(readFileSync(join(env.HOME!, '.agents/skills', name, 'SKILL.md'), 'utf8')).toBe(`# user-staged ${name}\n`);
        }
      } finally { if (transaction) commitInstallHostTransaction(transaction); }
    }));
  }

  test('correct pre-existing package links repair stale ledger ownership and work from a checkout', () => withHome(env => {
    const { canonical, source } = writeManagedHostSurfaces(env, ALL_PLUGINS);
    const packageRoot = packageAt(env.HOME!, source);
    rmSync(canonical); symlinkSync(packageRoot, canonical);
    const paths = ['.claude', '.codex'].map(host => join(env.HOME!, host, 'skills/repo-harness-cross-review'));
    for (const dest of paths) rmSync(dest, { recursive: true, force: true });
    // Record the real copied tree, then reproduce the audit's hand-made conversion.
    const transaction = beginInstallHostTransaction(paths, env);
    for (const dest of paths) cpSync(join(packageRoot, 'assets/skills/repo-harness-cross-review'), dest, { recursive: true });
    const previous = applyInstallSelection('all', ALL_PLUGINS, env, new Date(), transaction).state;
    commitInstallHostTransaction(transaction);
    for (const dest of paths) { rmSync(dest, { recursive: true }); symlinkSync(join(packageRoot, 'assets/skills/repo-harness-cross-review'), dest); }
    expect(installStateStatus(previous, env).drift.surface_drift).toEqual(expect.arrayContaining(paths));
    // The unowned fixture portal would block the checkout sync, which projects its own.
    rmSync(join(env.HOME!, '.claude/skills/repo-harness-herdr-portal'), { recursive: true });
    expect(syncCrossReviewSkills(ROOT, 'both', env).every(step => step.status === 'ok')).toBe(true);
    const state = applyInstallSelection('all', ALL_PLUGINS, env).state;
    for (const dest of paths) expect(state.ownership_manifest.find(surface => surface.path === dest)?.type).toBe('symlink');
    expect(state.ownership_manifest.find(surface => surface.path === canonical)?.type).toBe('symlink');
    expect(installStateStatus(state, env).drift.surface_drift).toEqual([]);
  }));

  test('correct Codex relative Waza links gain ownership; unrelated links do not', () => withHome(env => {
    writeManagedHostSurfaces(env, ALL_PLUGINS);
    for (const name of ['think', 'hunt', 'check', 'health']) {
      const stage = join(env.HOME!, '.agents/skills', name);
      writePath(join(stage, 'SKILL.md'), `# ${name}\n`);
      const dest = join(env.HOME!, '.codex/skills', name);
      rmSync(dest, { recursive: true });
      symlinkSync(`../../.agents/skills/${name}`, dest);
    }
    const state = applyInstallSelection('all', ALL_PLUGINS, env).state;
    for (const name of ['think', 'hunt', 'check', 'health']) {
      const record = state.ownership_manifest.find(surface => surface.path === join(env.HOME!, '.codex/skills', name));
      expect(record?.type).toBe('symlink');
      expect(record?.symlink_target).toBe(`../../.agents/skills/${name}`);
    }
    expect(installStateStatus(state, env).drift.surface_drift).toEqual([]);
    const dest = join(env.HOME!, '.codex/skills/think');
    rmSync(dest); symlinkSync(join(env.HOME!, '.codex/skills/mermaid'), dest);
    expect(installStateStatus(state, env).drift.surface_drift).toContain(dest);
    const refreshed = applyInstallSelection('all', ALL_PLUGINS, env).state;
    expect(refreshed.ownership_manifest.some(surface => surface.path === dest)).toBe(false);
    expect(readlinkSync(dest)).toBe(join(env.HOME!, '.codex/skills/mermaid'));
  }));
});
