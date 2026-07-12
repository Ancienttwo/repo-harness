import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  applyInstallProfile,
  installedProfileStatus,
  planInstallProfile,
  profileEnablesCodegraph,
  readInstalledProfile,
  rollbackInstallProfile,
} from '../src/cli/installer/install-profile';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');

function withHome(run: (env: NodeJS.ProcessEnv) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-profile-'));
  try { run({ ...process.env, HOME: home }); } finally { rmSync(home, { recursive: true, force: true }); }
}

function writeManagedHostSurfaces(env: NodeJS.ProcessEnv): { canonical: string; source: string } {
  const home = env.HOME!;
  const source = join(home, 'package-source');
  const canonical = join(home, '.codex', 'skills', 'repo-harness');
  mkdirSync(source, { recursive: true });
  mkdirSync(join(home, '.codex', 'skills'), { recursive: true });
  mkdirSync(join(home, '.codex'), { recursive: true });
  writeFileSync(join(source, 'SKILL.md'), '# managed\n');
  symlinkSync(source, canonical);
  writeFileSync(join(home, '.codex', 'hooks.json'), JSON.stringify({
    theme: 'user-owned',
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: ': repo-harness-managed-hook-v1; repo-harness hook', timeout: 30 }] }],
    },
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
    const first = applyInstallProfile('standard', env, new Date('2026-01-01T00:00:00Z'));
    const second = applyInstallProfile('standard', env, new Date('2026-01-02T00:00:00Z'));
    expect(second.plan.install).toEqual([]);
    expect(second.plan.remove).toEqual([]);
    expect(second.state.transaction_id).toBe(first.state.transaction_id);
    expect(second.state.applied_at).toBe(first.state.applied_at);
  }));

  test('switch lists removals and rollback restores the previous profile', () => withHome((env) => {
    applyInstallProfile('strict', env, new Date('2026-01-01T00:00:00Z'));
    const switched = applyInstallProfile('minimal', env, new Date('2026-01-02T00:00:00Z'));
    expect(switched.plan.remove).toContain('agent-fleet');
    expect(switched.plan.remove).toContain('cross-model-acceptance');
    expect(rollbackInstallProfile(env).profile).toBe('strict');
  }));

  test('state is machine readable and rejects implicit legacy defaults', () => withHome((env) => {
    writeManagedHostSurfaces(env);
    const applied = applyInstallProfile('product-planning', env);
    const persisted = JSON.parse(readFileSync(applied.plan.state_path, 'utf-8'));
    expect(persisted.profile).toBe('product-planning');
    expect(persisted.components).toContain('planning-integrations');
    expect(persisted.components).not.toContain('agent-fleet');
    expect(persisted.ownership_manifest.every((entry: { authority: string; path: string; type: string; content_hash: string | null }) => (
      entry.authority === 'repo-harness-install-transaction'
      && entry.path.startsWith(env.HOME!)
      && ['symlink', 'managed-file'].includes(entry.type)
      && (entry.type !== 'managed-file' || entry.content_hash?.startsWith('sha256:') === true)
    ))).toBe(true);
    expect(installedProfileStatus(applied.state).drift.status).toBe('consistent');
  }));

  test('status detects actual managed host surface drift', () => withHome((env) => {
    const { canonical } = writeManagedHostSurfaces(env);
    const applied = applyInstallProfile('minimal', env);
    expect(installedProfileStatus(applied.state).drift.status).toBe('consistent');

    rmSync(canonical);
    const foreign = join(env.HOME!, 'foreign-source');
    mkdirSync(foreign);
    symlinkSync(foreign, canonical);

    const drift = installedProfileStatus(applied.state).drift;
    expect(drift.status).toBe('drift');
    expect(drift.surface_drift).toContain(canonical);
  }));

  test('managed adapter ownership hashes only package entries and preserves sibling edits', () => withHome((env) => {
    writeManagedHostSurfaces(env);
    const applied = applyInstallProfile('minimal', env);
    const adapter = join(env.HOME!, '.codex', 'hooks.json');
    const config = JSON.parse(readFileSync(adapter, 'utf-8'));
    config.theme = 'changed-by-user';
    writeFileSync(adapter, JSON.stringify(config));
    expect(installedProfileStatus(applied.state).drift.status).toBe('consistent');

    config.hooks.SessionStart[0].hooks[0].command = ': repo-harness-managed-hook-v1; changed';
    writeFileSync(adapter, JSON.stringify(config));
    expect(installedProfileStatus(applied.state).drift.surface_drift).toContain(adapter);
  }));

  test('profile state without real managed surfaces reports ownership gaps', () => withHome((env) => {
    const applied = applyInstallProfile('minimal', env);
    expect(applied.state.ownership_manifest).toEqual([]);
    expect(installedProfileStatus(applied.state).drift).toMatchObject({
      status: 'drift',
      ownership_gaps: applied.state.components,
    });
    expect(existsSync(applied.plan.state_path)).toBe(true);
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
    expect(installedProfileStatus(migrated).drift.status).toBe('drift');
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

    applyInstallProfile('minimal', env);
    const state = spawnSync(process.execPath, [CLI, 'install', '--state', '--json'], {
      cwd: ROOT, env, encoding: 'utf-8',
    });
    expect(state.status).toBe(0);
    expect(JSON.parse(state.stdout).profile).toBe('minimal');
  }));
});
