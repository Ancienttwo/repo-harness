import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  applyInstallProfile,
  beginInstallHostTransaction,
  commitInstallHostTransaction,
  installProfileHostMutationPaths,
  installedProfileStatus,
  planInstallProfile,
  profileEnablesCodegraph,
  prepareInstallProfileSwitch,
  readInstalledProfile,
  rollbackInstallHostTransaction,
  rollbackInstallProfile,
} from '../src/cli/installer/install-profile';
import { buildManagedHooks } from '../src/cli/installer/managed-entries';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');

function withHome(run: (env: NodeJS.ProcessEnv) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-profile-'));
  try { run({ ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun') }); } finally { rmSync(home, { recursive: true, force: true }); }
}

function writePath(path: string, content = ''): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

// Mirrors install-profile.ts's internal hashManagedTree for a
// single-file directory (its own algorithm is not exported), so tests can
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

function writeManagedHostSurfaces(
  env: NodeJS.ProcessEnv,
  profile: 'minimal' | 'standard' | 'product-planning' | 'strict' = 'minimal',
): { canonical: string; source: string } {
  const home = env.HOME!;
  const source = join(home, 'package-source');
  const canonical = join(home, '.codex', 'skills', 'repo-harness');
  mkdirSync(source, { recursive: true });
  mkdirSync(join(home, '.codex', 'skills'), { recursive: true });
  mkdirSync(join(home, '.codex'), { recursive: true });
  writePath(join(source, 'SKILL.md'), '# managed\n');
  for (const relative of [
    'src/cli/commands/state.ts',
    'assets/hooks/pre-edit-guard.sh',
    'scripts/contract-worktree.sh',
    'assets/skill-commands/repo-harness-handoff/SKILL.md',
  ]) writePath(join(source, relative), '# managed\n');
  if (profile !== 'minimal') {
    writePath(join(source, 'src/core/workflow/profile.ts'), '// managed\n');
    writePath(join(source, 'src/cli/tools/codegraph.ts'), '// managed\n');
  }
  if (profile === 'product-planning') {
    for (const command of ['prd', 'sprint', 'goal']) {
      writePath(join(source, `assets/skill-commands/repo-harness-${command}/SKILL.md`), '# managed\n');
    }
    for (const skill of ['think', 'hunt', 'check', 'health', 'mermaid']) {
      writePath(join(home, '.codex', 'skills', skill, 'SKILL.md'), '# external\n');
    }
  }
  if (profile === 'strict') {
    writePath(join(source, 'scripts/contract-run.ts'), '// managed\n');
    writePath(join(source, 'scripts/verify-sprint.sh'), '# managed\n');
    writePath(join(source, 'scripts/ship-worktrees.sh'), '# managed\n');
    writePath(join(home, '.bun', 'bin', 'codegraph'), '#!/bin/sh\n');
    for (const agent of ['explorer', 'deep-reasoner', 'fast-worker', 'gatekeeper', 'root-cause-prover', 'harness-evaluator']) {
      writePath(join(home, '.codex', 'agents', `${agent}.toml`), '# managed\n');
    }
    writePath(join(home, '.codex', 'skills', 'claude-review', 'SKILL.md'), '# external\n');
  }
  writePath(join(home, '.bun', 'bin', 'repo-harness'), '#!/bin/sh\n');
  symlinkSync(source, canonical);
  writeFileSync(join(home, '.codex', 'hooks.json'), JSON.stringify({
    theme: 'user-owned',
    hooks: buildManagedHooks('codex', profile),
  }));
  return { canonical, source };
}

describe('install profiles', () => {
  test('dry-run plan is explicit and has no side effects', () => withHome((env) => {
    const plan = planInstallProfile('minimal', null, env);
    expect(plan.install).toContain('effective-state');
    expect(plan.remove).toEqual([]);
    expect(readInstalledProfile(env)).toBeNull();
  }));

  test('apply is idempotent', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'standard');
    const first = applyInstallProfile('standard', env, new Date('2026-01-01T00:00:00Z'));
    const second = applyInstallProfile('standard', env, new Date('2026-01-02T00:00:00Z'));
    expect(second.plan.install).toEqual([]);
    expect(second.plan.remove).toEqual([]);
    expect(second.state.transaction_id).toBe(first.state.transaction_id);
    expect(second.state.applied_at).toBe(first.state.applied_at);
  }));

  test('switch lists removals and rollback restores the previous profile', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'strict');
    applyInstallProfile('strict', env, new Date('2026-01-01T00:00:00Z'));
    const switched = applyInstallProfile('minimal', env, new Date('2026-01-02T00:00:00Z'));
    expect(switched.plan.remove).toContain('agent-fleet');
    expect(switched.plan.remove).toContain('cross-model-acceptance');
    expect(rollbackInstallProfile(env).profile).toBe('strict');
  }));

  test('state is machine readable and rejects implicit legacy defaults', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'product-planning');
    const applied = applyInstallProfile('product-planning', env);
    const persisted = JSON.parse(readFileSync(applied.plan.state_path, 'utf-8'));
    expect(persisted.profile).toBe('product-planning');
    expect(persisted.components).toContain('planning-integrations');
    expect(persisted.components).not.toContain('agent-fleet');
    expect(persisted.ownership_manifest.every((entry: { authority: string; path: string; type: string; content_hash: string | null }) => (
      entry.authority === 'repo-harness-install-transaction'
      && entry.path.startsWith(env.HOME!)
      && ['symlink', 'managed-file', 'directory-copy'].includes(entry.type)
      && (entry.type === 'symlink' || entry.content_hash?.startsWith('sha256:') === true)
    ))).toBe(true);
    expect(persisted.ownership_manifest.some((entry: { path: string }) => entry.path === join(env.HOME!, '.bun', 'bin', 'repo-harness'))).toBe(false);
    expect(persisted.ownership_manifest.some((entry: { path: string }) => entry.path === join(env.HOME!, '.codex', 'skills', 'repo-harness'))).toBe(false);
    expect(installedProfileStatus(applied.state, env).drift.status).toBe('consistent');
  }));

  test('state rejects a component projection that conflicts with its profile authority', () => withHome((env) => {
    writePath(join(env.HOME!, '.repo-harness', 'install-state.json'), `${JSON.stringify({
      protocol: 1,
      profile: 'strict',
      components: ['cli'],
      transaction_id: 'conflicting-state',
      applied_at: '2026-07-14T00:00:00.000Z',
      ownership_manifest: [],
      previous: null,
    })}\n`);
    expect(() => readInstalledProfile(env)).toThrow('components do not match profile strict');
  }));

  test('legacy ownership migration rejects malformed rollback history', () => withHome((env) => {
    writePath(join(env.HOME!, '.repo-harness', 'install-state.json'), `${JSON.stringify({
      protocol: 1,
      profile: 'strict',
      components: ['strict-only-legacy-label'],
      transaction_id: 'legacy-current',
      applied_at: '2026-07-14T00:00:00.000Z',
      ownership_manifest: [{
        component: 'strict-only-legacy-label',
        authority: 'repo-harness-install-transaction',
        removal: 'managed-surfaces-only',
      }],
      previous: {},
    })}\n`);
    expect(() => readInstalledProfile(env)).toThrow('invalid previous state');
  }));

  test('discoverManagedSurfaces empties the component set for a facade retired from the canonical package', () => withHome((env) => {
    const { source } = writeManagedHostSurfaces(env, 'standard');
    const codexSkills = join(env.HOME!, '.codex', 'skills');

    // Canonical control: repo-harness-plan is still shipped by the package
    // (source gets it here), so it keeps the existing adaptive-workflow
    // bucket.
    writePath(join(source, 'assets', 'skill-commands', 'repo-harness-plan', 'SKILL.md'), '# managed\n');
    writeMarkedFacade(join(codexSkills, 'repo-harness-plan'), '# managed\n');

    // Retired: physically present on host (e.g. left over from a broader
    // sync), but the package no longer ships its source directory at all.
    const retiredDest = join(codexSkills, 'repo-harness-retired-demo');
    writeMarkedFacade(retiredDest, '---\nname: repo-harness-retired-demo\n---\n');

    const applied = applyInstallProfile('standard', env, new Date('2026-01-01T00:00:00Z'));
    const planSurface = applied.state.ownership_manifest.find(({ path }) => path === join(codexSkills, 'repo-harness-plan'));
    const retiredSurface = applied.state.ownership_manifest.find(({ path }) => path === retiredDest);
    expect(planSurface?.components).toEqual(['adaptive-workflow']);
    expect(retiredSurface).toBeDefined();
    expect(retiredSurface?.components).toEqual([]);
    expect(installedProfileStatus(applied.state, env).drift.status).toBe('consistent');
  }));

  test('status detects actual managed host surface drift', () => withHome((env) => {
    const { canonical } = writeManagedHostSurfaces(env);
    const applied = applyInstallProfile('minimal', env);
    expect(installedProfileStatus(applied.state, env).drift.status).toBe('consistent');

    rmSync(canonical);
    const foreign = join(env.HOME!, 'foreign-source');
    mkdirSync(foreign);
    symlinkSync(foreign, canonical);

    const drift = installedProfileStatus(applied.state, env).drift;
    expect(drift.status).toBe('drift');
    expect(drift.missing_components).toContain('effective-state');
  }));

  test('managed adapter ownership hashes only package entries and preserves sibling edits', () => withHome((env) => {
    writeManagedHostSurfaces(env);
    const applied = applyInstallProfile('minimal', env);
    const adapter = join(env.HOME!, '.codex', 'hooks.json');
    const config = JSON.parse(readFileSync(adapter, 'utf-8'));
    config.theme = 'changed-by-user';
    writeFileSync(adapter, JSON.stringify(config));
    expect(installedProfileStatus(applied.state, env).drift.status).toBe('consistent');

    config.hooks.SessionStart[0].hooks[0].command = ': repo-harness-managed-hook-v1; changed';
    writeFileSync(adapter, JSON.stringify(config));
    expect(installedProfileStatus(applied.state, env).drift.surface_drift).toContain(adapter);
  }));

  test('adapter probe requires the complete profile route projection', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'minimal');
    const applied = applyInstallProfile('minimal', env);
    const adapter = join(env.HOME!, '.codex', 'hooks.json');
    const config = JSON.parse(readFileSync(adapter, 'utf-8'));
    delete config.hooks.PreToolUse;
    writeFileSync(adapter, JSON.stringify(config));
    const status = installedProfileStatus(applied.state, env);
    expect(status.component_probes['host-adapters'].status).toBe('missing');
    expect(status.drift.missing_components).toContain('host-adapters');
  }));

  test('profile state is not committed without a complete host projection', () => withHome((env) => {
    expect(() => applyInstallProfile('minimal', env)).toThrow('install profile projection is incomplete');
    expect(existsSync(join(env.HOME!, '.repo-harness', 'install-state.json'))).toBe(false);
  }));

  test('legacy component-only ownership migrates to no ownership claim', () => withHome((env) => {
    const statePath = join(env.HOME!, '.repo-harness', 'install-state.json');
    mkdirSync(join(env.HOME!, '.repo-harness'), { recursive: true });
    writeFileSync(statePath, JSON.stringify({
      protocol: 1,
      profile: 'minimal',
      components: ['cli'],
      transaction_id: 'legacy',
      applied_at: '2026-01-01T00:00:00.000Z',
      ownership_manifest: [{
        component: 'cli',
        authority: 'repo-harness-install-transaction',
        removal: 'managed-surfaces-only',
      }],
      previous: null,
    }));

    const migrated = readInstalledProfile(env)!;
    expect(migrated.profile).toBe('minimal');
    expect(migrated.ownership_manifest).toEqual([]);
    expect(installedProfileStatus(migrated, env).drift.status).toBe('drift');
  }));

  test('component probes do not infer strict capabilities from the canonical skill alone', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'standard');
    const standard = applyInstallProfile('standard', env).state;
    const forged = { ...standard, profile: 'strict' as const, components: [
      ...standard.components,
      'agent-fleet' as const,
      'verifier' as const,
      'cross-model-acceptance' as const,
      'release-deployment-gates' as const,
    ] };
    const status = installedProfileStatus(forged, env);
    expect(status.component_probes['agent-fleet'].status).toBe('missing');
    expect(status.component_probes['verifier'].status).toBe('missing');
    expect(status.component_probes['cross-model-acceptance'].status).toBe('missing');
    expect(status.component_probes['release-deployment-gates'].status).toBe('missing');
    expect(status.drift.status).toBe('drift');
  }));

  test('planning probe does not treat staging-only skills as host discovery', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'standard');
    const standard = applyInstallProfile('standard', env).state;
    for (const skill of ['think', 'hunt', 'check', 'health', 'mermaid']) {
      writePath(join(env.HOME!, '.agents', 'skills', skill, 'SKILL.md'), '# staging only\n');
    }
    const status = installedProfileStatus({
      ...standard,
      profile: 'product-planning',
      components: [...standard.components, 'planning-integrations'],
    }, env);
    expect(status.component_probes['planning-integrations'].status).toBe('missing');
    expect(status.drift.missing_components).toContain('planning-integrations');
  }));

  test('mutation-path rollback coverage includes all four command facades on both hosts', () => withHome((env) => {
    const paths = installProfileHostMutationPaths(env);
    for (const host of ['.codex', '.claude']) {
      for (const facade of ['repo-harness-plan', 'repo-harness-check', 'repo-harness-handoff', 'repo-harness-gptpro']) {
        expect(paths).toContain(join(env.HOME!, host, 'skills', facade));
      }
    }
  }));

  test('host transaction restores prior bytes and removes later mutations', () => withHome((env) => {
    writeManagedHostSurfaces(env);
    const adapter = join(env.HOME!, '.codex', 'hooks.json');
    const before = readFileSync(adapter);
    const statePath = join(env.HOME!, '.repo-harness', 'install-state.json');
    const lockPath = join(env.HOME!, '.agents', '.skill-lock.json');
    writePath(statePath, '{"previous":"state"}\n');
    writePath(lockPath, '{"previous":"lock"}\n');
    const transaction = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    writeFileSync(adapter, '{"partially":"mutated"}\n');
    writeFileSync(statePath, '{"next":"state"}\n');
    writeFileSync(lockPath, '{"next":"lock"}\n');
    const created = join(env.HOME!, '.codex', 'skills', 'repo-harness-plan');
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
    writeFileSync(join(bin, 'bunx'), '#!/bin/sh\nmkdir -p "$HOME/.agents"\nprintf "{\\"partial\\":true}\\n" > "$HOME/.agents/.skill-lock.json"\nexit 19\n', { mode: 0o755 });
    const adapter = join(env.HOME!, '.codex', 'hooks.json');
    mkdirSync(join(env.HOME!, '.codex'), { recursive: true });
    const before = '{"theme":"user-owned"}\n';
    writeFileSync(adapter, before);
    const failed = spawnSync(process.execPath, [CLI, 'install', '--profile', 'product-planning', '--target', 'codex', '--json'], {
      cwd: ROOT,
      env: {
        ...env,
        PATH: `${bin}:/bin:/usr/bin`,
        BUN_INSTALL: join(env.HOME!, '.bun'),
        REPO_HARNESS_BUN_EXECUTABLE: join(bin, 'bun'),
      },
      encoding: 'utf-8',
    });
    expect(failed.status).not.toBe(0);
    expect(readFileSync(adapter, 'utf-8')).toBe(before);
    expect(existsSync(join(env.HOME!, '.codex', 'skills', 'repo-harness'))).toBe(false);
    expect(existsSync(join(env.HOME!, '.agents', '.skill-lock.json'))).toBe(false);
    expect(readInstalledProfile(env)).toBeNull();
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

  test('profile switch removes only transaction-owned optional surfaces and skill lock entries', () => withHome((env) => {
    const first = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    writeManagedHostSurfaces(env, 'strict');
    const codexConfig = join(env.HOME!, '.codex', 'config.toml');
    writePath(codexConfig, 'default_mode_request_user_input = true\n\n[mcp_servers.codegraph]\ncommand = "codegraph"\nargs = ["mcp"]\n');
    const lock = join(env.HOME!, '.agents', '.skill-lock.json');
    writePath(join(env.HOME!, '.agents', 'skills', 'claude-review', 'SKILL.md'), '# owned staging skill\n');
    writePath(lock, `${JSON.stringify({ version: 3, skills: {
      'claude-review': { source: 'repo-harness' },
      'user-skill': { source: 'user/repo' },
    } }, null, 2)}\n`);
    const strict = applyInstallProfile('strict', env, new Date('2026-01-01T00:00:00Z'), first);
    commitInstallHostTransaction(first);
    expect(strict.state.ownership_manifest.some(({ components }) => components.includes('agent-fleet'))).toBe(true);
    expect(strict.state.ownership_manifest.some(({ components }) => components.includes('cross-model-acceptance'))).toBe(true);
    expect(strict.state.ownership_manifest.some(({ managed_marker }) => managed_marker === 'codegraph-config-projection')).toBe(true);

    const second = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    prepareInstallProfileSwitch('minimal', env);
    writeFileSync(join(env.HOME!, '.codex', 'hooks.json'), JSON.stringify({
      hooks: buildManagedHooks('codex', 'minimal'),
    }));
    const minimal = applyInstallProfile('minimal', env, new Date('2026-01-02T00:00:00Z'), second);
    commitInstallHostTransaction(second);

    expect(existsSync(join(env.HOME!, '.codex', 'agents', 'explorer.toml'))).toBe(false);
    expect(existsSync(join(env.HOME!, '.codex', 'skills', 'claude-review'))).toBe(false);
    expect(readFileSync(codexConfig, 'utf-8')).toContain('default_mode_request_user_input = true');
    expect(readFileSync(codexConfig, 'utf-8')).not.toContain('[mcp_servers.codegraph]');
    const lockState = JSON.parse(readFileSync(lock, 'utf-8'));
    expect(lockState.skills['claude-review']).toBeUndefined();
    expect(lockState.skills['user-skill']).toEqual({ source: 'user/repo' });
    expect(installedProfileStatus(minimal.state, env).drift.status).toBe('consistent');
  }));

  test('profile switch rejects ownership paths outside canonical managed surfaces', () => withHome((env) => {
    const external = join(env.HOME!, 'user-owned.txt');
    const content = 'must survive';
    writeFileSync(external, content);
    writePath(join(env.HOME!, '.repo-harness', 'install-state.json'), `${JSON.stringify({
      protocol: 1,
      profile: 'strict',
      components: [
        'cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters',
        'adaptive-workflow', 'codegraph-conditional', 'agent-fleet', 'verifier',
        'cross-model-acceptance', 'release-deployment-gates',
      ],
      transaction_id: 'crafted-state',
      applied_at: '2026-07-14T00:00:00.000Z',
      ownership_manifest: [{
        components: ['agent-fleet'],
        authority: 'repo-harness-install-transaction',
        removal: 'managed-surfaces-only',
        path: external,
        type: 'managed-file',
        content_hash: `sha256:${createHash('sha256').update(content).digest('hex')}`,
        managed_marker: 'transaction-created-file',
        symlink_target: null,
      }],
      previous: null,
    }, null, 2)}\n`);

    expect(() => prepareInstallProfileSwitch('minimal', env)).toThrow('invalid ownership surface');
    expect(readFileSync(external, 'utf-8')).toBe(content);
  }));

  test('reinstall refreshes ownership for an already-owned CodeGraph projection', () => withHome((env) => {
    const first = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    writeManagedHostSurfaces(env, 'strict');
    const config = join(env.HOME!, '.codex', 'config.toml');
    writePath(config, '[mcp_servers.codegraph]\ncommand = "codegraph"\nargs = ["serve"]\n');
    const initial = applyInstallProfile('strict', env, new Date('2026-01-01T00:00:00Z'), first);
    commitInstallHostTransaction(first);
    const original = initial.state.ownership_manifest.find(({ managed_marker }) => (
      managed_marker === 'codegraph-config-projection'
    ));
    expect(original).toBeDefined();

    const second = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    writeFileSync(config, '[mcp_servers.codegraph]\ncommand = "codegraph"\nargs = ["serve", "--mcp"]\n');
    const refreshed = applyInstallProfile('strict', env, new Date('2026-01-02T00:00:00Z'), second);
    commitInstallHostTransaction(second);
    const next = refreshed.state.ownership_manifest.find(({ managed_marker }) => (
      managed_marker === 'codegraph-config-projection'
    ));
    expect(next).toBeDefined();
    expect(next?.content_hash).not.toBe(original?.content_hash);
    expect(installedProfileStatus(refreshed.state, env).drift.status).toBe('consistent');
  }));

  test('downgrade preserves a user-owned staging skill registry when only host links are transaction-owned', () => withHome((env) => {
    const { source } = writeManagedHostSurfaces(env, 'standard');
    for (const command of ['prd', 'sprint', 'goal']) {
      writePath(join(source, `assets/skill-commands/repo-harness-${command}/SKILL.md`), '# planning\n');
    }
    const names = ['think', 'hunt', 'check', 'health', 'mermaid'];
    for (const name of names) writePath(join(env.HOME!, '.agents', 'skills', name, 'SKILL.md'), `# ${name}\n`);
    const lock = join(env.HOME!, '.agents', '.skill-lock.json');
    writePath(lock, `${JSON.stringify({ version: 3, skills: {
      think: { source: 'user/waza' },
      mermaid: { source: 'user/mermaid' },
    } }, null, 2)}\n`);

    const first = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    for (const name of names) {
      const destination = join(env.HOME!, '.codex', 'skills', name);
      rmSync(destination, { recursive: true, force: true });
      symlinkSync(join(env.HOME!, '.agents', 'skills', name), destination);
    }
    const planning = applyInstallProfile('product-planning', env, new Date('2026-01-01T00:00:00Z'), first);
    commitInstallHostTransaction(first);
    expect(planning.state.ownership_manifest.some(({ path }) => path.endsWith('/.codex/skills/think'))).toBe(true);

    const second = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    prepareInstallProfileSwitch('minimal', env);
    writeFileSync(join(env.HOME!, '.codex', 'hooks.json'), JSON.stringify({ hooks: buildManagedHooks('codex', 'minimal') }));
    applyInstallProfile('minimal', env, new Date('2026-01-02T00:00:00Z'), second);
    commitInstallHostTransaction(second);

    expect(existsSync(join(env.HOME!, '.agents', 'skills', 'think', 'SKILL.md'))).toBe(true);
    expect(JSON.parse(readFileSync(lock, 'utf-8')).skills).toEqual({
      think: { source: 'user/waza' },
      mermaid: { source: 'user/mermaid' },
    });
  }));

  test('Standard CodeGraph stays conditional while Strict enables it', () => withHome((env) => {
    const cwd = env.HOME!;
    expect(profileEnablesCodegraph('standard', cwd)).toBe(false);
    expect(profileEnablesCodegraph('strict', cwd)).toBe(true);
  }));

  test('CLI dry-run and state query expose machine-readable profile authority', () => withHome((env) => {
    const dryRun = spawnSync(process.execPath, [CLI, 'install', '--profile', 'strict', '--dry-run', '--json'], {
      cwd: ROOT, env, encoding: 'utf-8',
    });
    expect(dryRun.status).toBe(0);
    expect(JSON.parse(dryRun.stdout).requested_profile).toBe('strict');
    expect(readInstalledProfile(env)).toBeNull();

    writeManagedHostSurfaces(env);
    applyInstallProfile('minimal', env);
    const state = spawnSync(process.execPath, [CLI, 'install', '--state', '--json'], {
      cwd: ROOT, env, encoding: 'utf-8',
    });
    expect(state.status).toBe(0);
    expect(JSON.parse(state.stdout).profile).toBe('minimal');
  }));
});
