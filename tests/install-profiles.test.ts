import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
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
    const applied = applyInstallProfile('product-planning', env);
    const persisted = JSON.parse(readFileSync(applied.plan.state_path, 'utf-8'));
    expect(persisted.profile).toBe('product-planning');
    expect(persisted.components).toContain('planning-integrations');
    expect(persisted.components).not.toContain('agent-fleet');
    expect(persisted.ownership_manifest.every((entry: { authority: string }) => entry.authority === 'repo-harness-install-transaction')).toBe(true);
    expect(installedProfileStatus(applied.state).drift.status).toBe('consistent');
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
