import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  applyInstallProfile,
  assertInstallProfile,
  beginInstallHostTransaction,
  commitInstallHostTransaction,
  INSTALL_PROFILES,
  installProfileHostMutationPaths,
  installedProfileStatus,
  planInstallProfile,
  PROFILE_COMPONENTS,
  profileEnablesCodegraph,
  prepareLegacyInstallProfileMigration,
  prepareInstallProfileSwitch,
  readLegacyInstalledProfileForMigration,
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
  profile: 'minimal' | 'full' = 'minimal',
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
    'src/cli/hook/mutation-guard.ts',
    'scripts/contract-worktree.sh',
    'references/handoff.md',
  ]) writePath(join(source, relative), '# managed\n');
  writePath(join(source, 'src/core/workflow/profile.ts'), '// managed\n');
  writePath(join(source, 'src/cli/tools/codegraph.ts'), '// managed\n');
  if (profile === 'full') {
    writePath(join(source, 'assets/skills/repo-harness-product/SKILL.md'), '# managed\n');
    for (const skill of ['think', 'hunt', 'check', 'health', 'mermaid']) {
      writePath(join(home, '.codex', 'skills', skill, 'SKILL.md'), '# external\n');
    }
    writePath(join(source, 'scripts/contract-run.ts'), '// managed\n');
    writePath(join(source, 'scripts/verify-sprint.sh'), '# managed\n');
    writePath(join(source, 'scripts/ship-worktrees.sh'), '# managed\n');
    writePath(join(home, '.bun', 'bin', 'codegraph'), '#!/bin/sh\n');
    for (const agent of ['explorer', 'deep-reasoner', 'fast-worker', 'gatekeeper', 'root-cause-prover', 'harness-evaluator']) {
      writePath(join(home, '.codex', 'agents', `${agent}.toml`), '# managed\n');
    }
    writePath(join(home, '.codex', 'skills', 'repo-harness-cross-review', 'SKILL.md'), '# external\n');
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
  test('steady-state vocabulary is minimal/full with protocol 2 and exact 7/11 hook projections', () => withHome((env) => {
    expect(INSTALL_PROFILES).toEqual(['minimal', 'full']);
    expect(Object.keys(PROFILE_COMPONENTS)).toEqual(['minimal', 'full']);
    const minimal = assertInstallProfile('minimal');
    const full = assertInstallProfile('full');
    expect(Object.values(buildManagedHooks('codex', minimal)).flat()).toHaveLength(7);
    expect(Object.values(buildManagedHooks('codex', full)).flat()).toHaveLength(11);
    expect(planInstallProfile(full, null, env).protocol).toBe(2);
  }));

  test('normal state read rejects protocol 1 with an explicit migration instruction', () => withHome((env) => {
    writePath(join(env.HOME!, '.repo-harness', 'install-state.json'), `${JSON.stringify({
      protocol: 1,
      profile: 'standard',
      components: [
        'cli',
        'effective-state',
        'scope-worktree-check-guards',
        'handoff',
        'host-adapters',
        'adaptive-workflow',
        'codegraph-conditional',
      ],
      transaction_id: 'legacy-standard',
      applied_at: '2026-07-14T00:00:00.000Z',
      ownership_manifest: [],
      previous: null,
    })}\n`);
    expect(() => readInstalledProfile(env)).toThrow('--migrate-profile-state');
  }));

  test('fresh install dry-run defaults to full', () => withHome((env) => {
    const result = spawnSync(process.execPath, [CLI, 'install', '--dry-run', '--json'], {
      cwd: ROOT,
      encoding: 'utf-8',
      env,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).requested_profile).toBe('full');
  }));

  test('explicit legacy migration dry-run targets full by default without mutating state', () => withHome((env) => {
    const statePath = join(env.HOME!, '.repo-harness', 'install-state.json');
    const legacy = {
      protocol: 1,
      profile: 'minimal',
      components: ['cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters'],
      transaction_id: 'legacy-minimal',
      applied_at: '2026-07-14T00:00:00.000Z',
      ownership_manifest: [],
      previous: null,
    };
    writePath(statePath, `${JSON.stringify(legacy)}\n`);
    const result = spawnSync(process.execPath, [
      CLI,
      'install',
      '--migrate-profile-state',
      '--dry-run',
      '--json',
    ], {
      cwd: ROOT,
      encoding: 'utf-8',
      env,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      migration: { from_protocol: 1, from_profile: 'minimal', to_protocol: 2, to_profile: 'full' },
      requested_profile: 'full',
    });
    expect(JSON.parse(readFileSync(statePath, 'utf-8'))).toEqual(legacy);
  }));

  test('explicit migration replaces protocol 1 atomically and carries forward current owned surfaces without legacy rollback history', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'full');
    const agentPath = join(env.HOME!, '.codex', 'agents', 'explorer.toml');
    const agentHash = `sha256:${createHash('sha256').update(readFileSync(agentPath)).digest('hex')}`;
    const statePath = join(env.HOME!, '.repo-harness', 'install-state.json');
    writePath(statePath, `${JSON.stringify({
      protocol: 1,
      profile: 'strict',
      components: [
        'cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters',
        'adaptive-workflow', 'codegraph-conditional', 'agent-fleet', 'verifier',
        'cross-model-acceptance', 'release-deployment-gates',
      ],
      transaction_id: 'legacy-strict',
      applied_at: '2026-07-14T00:00:00.000Z',
      ownership_manifest: [{
        components: ['agent-fleet'],
        authority: 'repo-harness-install-transaction',
        removal: 'managed-surfaces-only',
        path: agentPath,
        type: 'managed-file',
        content_hash: agentHash,
        managed_marker: 'transaction-created-file',
        symlink_target: null,
      }],
      previous: null,
    }, null, 2)}\n`);

    const transaction = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    const legacy = prepareLegacyInstallProfileMigration('full', env);
    const migrated = applyInstallProfile(
      'full',
      env,
      new Date('2026-07-24T00:00:00.000Z'),
      transaction,
      legacy,
    ).state;
    commitInstallHostTransaction(transaction);

    expect(migrated.protocol).toBe(2);
    expect(migrated.profile).toBe('full');
    expect(migrated.previous).toBeNull();
    expect(migrated.ownership_manifest.some(({ path }) => path === agentPath)).toBe(true);
    expect(readInstalledProfile(env)).toEqual(migrated);
    expect(installedProfileStatus(migrated, env).drift.status).toBe('consistent');
  }));

  test('failed strict-to-minimal migration restores state, optional surfaces, skill lock, and hooks byte-for-byte', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'full');
    const home = env.HOME!;
    const statePath = join(home, '.repo-harness', 'install-state.json');
    const hooksPath = join(home, '.codex', 'hooks.json');
    const agentPath = join(home, '.codex', 'agents', 'explorer.toml');
    const stagingSkill = join(home, '.agents', 'skills', 'repo-harness-cross-review');
    const stagingSkillPath = join(stagingSkill, 'SKILL.md');
    const stagingMarkerPath = join(stagingSkill, '.repo-harness-owner.json');
    const lockPath = join(home, '.agents', '.skill-lock.json');

    writeMarkedFacade(stagingSkill, '# owned staging skill\n');
    writePath(lockPath, `${JSON.stringify({
      version: 3,
      skills: {
        'repo-harness-cross-review': { source: 'repo-harness' },
        'user-skill': { source: 'user/repo' },
      },
    }, null, 2)}\n`);

    const agentHash = `sha256:${createHash('sha256').update(readFileSync(agentPath)).digest('hex')}`;
    const stagingHash = JSON.parse(readFileSync(stagingMarkerPath, 'utf-8')).content_hash as string;
    writePath(statePath, `${JSON.stringify({
      protocol: 1,
      profile: 'strict',
      components: [
        'cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters',
        'adaptive-workflow', 'codegraph-conditional', 'agent-fleet', 'verifier',
        'cross-model-acceptance', 'release-deployment-gates',
      ],
      transaction_id: 'legacy-strict-rollback',
      applied_at: '2026-07-14T00:00:00.000Z',
      ownership_manifest: [
        {
          components: ['agent-fleet'],
          authority: 'repo-harness-install-transaction',
          removal: 'managed-surfaces-only',
          path: agentPath,
          type: 'managed-file',
          content_hash: agentHash,
          managed_marker: 'transaction-created-file',
          symlink_target: null,
        },
        {
          components: ['cross-model-acceptance'],
          authority: 'repo-harness-install-transaction',
          removal: 'managed-surfaces-only',
          path: stagingSkill,
          type: 'directory-copy',
          content_hash: stagingHash,
          managed_marker: '.repo-harness-owner.json:owner=repo-harness;surface=command-facade',
          symlink_target: null,
        },
      ],
      previous: null,
    }, null, 2)}\n`);

    const before = {
      state: readFileSync(statePath),
      hooks: readFileSync(hooksPath),
      agent: readFileSync(agentPath),
      stagingSkill: readFileSync(stagingSkillPath),
      stagingMarker: readFileSync(stagingMarkerPath),
      lock: readFileSync(lockPath),
    };
    const managedBin = join(home, 'managed-bin');
    const oldBun = join(managedBin, 'bun');
    const prepareObserved = join(home, 'prepare-observed');
    mkdirSync(managedBin, { recursive: true });
    writeFileSync(oldBun, [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then',
      '  if [ ! -e "$HOME/.repo-harness/install-state.json" ] \\',
      '    && [ ! -e "$HOME/.codex/agents/explorer.toml" ] \\',
      '    && [ ! -e "$HOME/.agents/skills/repo-harness-cross-review" ] \\',
      '    && ! grep -q repo-harness-cross-review "$HOME/.agents/.skill-lock.json"; then',
      '    printf "prepared\\n" > "$HOME/prepare-observed"',
      '  fi',
      '  echo 1.1.34',
      '  exit 0',
      'fi',
      'exit 0',
      '',
    ].join('\n'), { mode: 0o755 });

    const failed = spawnSync(process.execPath, [
      CLI,
      'install',
      '--migrate-profile-state',
      '--profile',
      'minimal',
      '--target',
      'codex',
      '--json',
    ], {
      cwd: ROOT,
      encoding: 'utf-8',
      env: {
        ...env,
        PATH: `${managedBin}:${env.PATH ?? ''}`,
        REPO_HARNESS_BUN_EXECUTABLE: oldBun,
      },
    });

    expect(failed.status).not.toBe(0);
    expect(readFileSync(prepareObserved, 'utf-8')).toBe('prepared\n');
    expect(readFileSync(statePath)).toEqual(before.state);
    expect(readFileSync(hooksPath)).toEqual(before.hooks);
    expect(readFileSync(agentPath)).toEqual(before.agent);
    expect(readFileSync(stagingSkillPath)).toEqual(before.stagingSkill);
    expect(readFileSync(stagingMarkerPath)).toEqual(before.stagingMarker);
    expect(readFileSync(lockPath)).toEqual(before.lock);
  }));

  test('dry-run plan is explicit and has no side effects', () => withHome((env) => {
    const plan = planInstallProfile('minimal', null, env);
    expect(plan.install).toContain('effective-state');
    expect(plan.remove).toEqual([]);
    expect(readInstalledProfile(env)).toBeNull();
  }));

  test('apply is idempotent', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'minimal');
    const first = applyInstallProfile('minimal', env, new Date('2026-01-01T00:00:00Z'));
    const second = applyInstallProfile('minimal', env, new Date('2026-01-02T00:00:00Z'));
    expect(second.plan.install).toEqual([]);
    expect(second.plan.remove).toEqual([]);
    expect(second.state.transaction_id).toBe(first.state.transaction_id);
    expect(second.state.applied_at).toBe(first.state.applied_at);
  }));

  test('switch lists removals and rollback restores the previous profile', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'full');
    applyInstallProfile('full', env, new Date('2026-01-01T00:00:00Z'));
    const switched = applyInstallProfile('minimal', env, new Date('2026-01-02T00:00:00Z'));
    expect(switched.plan.remove).toContain('agent-fleet');
    expect(switched.plan.remove).toContain('cross-model-acceptance');
    expect(rollbackInstallProfile(env).profile).toBe('full');
  }));

  test('state is machine readable and rejects implicit legacy defaults', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'full');
    const applied = applyInstallProfile('full', env);
    const persisted = JSON.parse(readFileSync(applied.plan.state_path, 'utf-8'));
    expect(persisted.protocol).toBe(2);
    expect(persisted.profile).toBe('full');
    expect(persisted.components).toContain('planning-integrations');
    expect(persisted.components).toContain('agent-fleet');
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
      protocol: 2,
      profile: 'full',
      components: ['cli'],
      transaction_id: 'conflicting-state',
      applied_at: '2026-07-14T00:00:00.000Z',
      ownership_manifest: [],
      previous: null,
    })}\n`);
    expect(() => readInstalledProfile(env)).toThrow('components do not match profile full');
  }));

  test('legacy ownership migration rejects malformed rollback history', () => withHome((env) => {
    writePath(join(env.HOME!, '.repo-harness', 'install-state.json'), `${JSON.stringify({
      protocol: 1,
      profile: 'strict',
      components: [
        'cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters',
        'adaptive-workflow', 'codegraph-conditional', 'agent-fleet', 'verifier',
        'cross-model-acceptance', 'release-deployment-gates',
      ],
      transaction_id: 'legacy-current',
      applied_at: '2026-07-14T00:00:00.000Z',
      ownership_manifest: [],
      previous: {},
    })}\n`);
    expect(() => readLegacyInstalledProfileForMigration(env)).toThrow('invalid previous state');
  }));

  test('discoverManagedSurfaces empties the component set for a facade retired from the canonical package', () => withHome((env) => {
    const { source } = writeManagedHostSurfaces(env, 'minimal');
    const codexSkills = join(env.HOME!, '.codex', 'skills');

    // Canonical control: repo-harness-plan is still shipped by the package
    // (source gets it here, at its post-cutover assets/skills/ location), so
    // it keeps the existing adaptive-workflow bucket.
    writePath(join(source, 'assets', 'skills', 'repo-harness-plan', 'SKILL.md'), '# managed\n');
    writeMarkedFacade(join(codexSkills, 'repo-harness-plan'), '# managed\n');

    // Retired: physically present on host (e.g. left over from a broader
    // sync), but the package no longer ships its source directory at all.
    const retiredDest = join(codexSkills, 'repo-harness-retired-demo');
    writeMarkedFacade(retiredDest, '---\nname: repo-harness-retired-demo\n---\n');

    const applied = applyInstallProfile('minimal', env, new Date('2026-01-01T00:00:00Z'));
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

  test('explicit migration rejects component-only ownership with no filesystem proof', () => withHome((env) => {
    const statePath = join(env.HOME!, '.repo-harness', 'install-state.json');
    mkdirSync(join(env.HOME!, '.repo-harness'), { recursive: true });
    writeFileSync(statePath, JSON.stringify({
      protocol: 1,
      profile: 'minimal',
      components: ['cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters'],
      transaction_id: 'legacy',
      applied_at: '2026-01-01T00:00:00.000Z',
      ownership_manifest: [{
        component: 'cli',
        authority: 'repo-harness-install-transaction',
        removal: 'managed-surfaces-only',
      }],
      previous: null,
    }));

    expect(() => readLegacyInstalledProfileForMigration(env)).toThrow('invalid ownership surface');
  }));

  test('component probes do not infer full capabilities from the minimal canonical skill alone', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'minimal');
    const minimal = applyInstallProfile('minimal', env).state;
    const forged = { ...minimal, profile: 'full' as const, components: PROFILE_COMPONENTS.full };
    const status = installedProfileStatus(forged, env);
    expect(status.component_probes['agent-fleet'].status).toBe('missing');
    expect(status.component_probes['verifier'].status).toBe('missing');
    expect(status.component_probes['cross-model-acceptance'].status).toBe('missing');
    expect(status.component_probes['release-deployment-gates'].status).toBe('missing');
    expect(status.drift.status).toBe('drift');
  }));

  test('planning probe does not treat staging-only skills as host discovery', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'minimal');
    const minimal = applyInstallProfile('minimal', env).state;
    for (const skill of ['think', 'hunt', 'check', 'health', 'mermaid']) {
      writePath(join(env.HOME!, '.agents', 'skills', skill, 'SKILL.md'), '# staging only\n');
    }
    const status = installedProfileStatus({
      ...minimal,
      profile: 'full',
      components: PROFILE_COMPONENTS.full,
    }, env);
    expect(status.component_probes['planning-integrations'].status).toBe('missing');
    expect(status.drift.missing_components).toContain('planning-integrations');
  }));

  test('mutation-path rollback coverage includes all four profile-gated facades on both hosts', () => withHome((env) => {
    const paths = installProfileHostMutationPaths(env);
    for (const host of ['.codex', '.claude']) {
      for (const facade of ['repo-harness-plan', 'repo-harness-check', 'repo-harness-product', 'repo-harness-ship']) {
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
    const failed = spawnSync(process.execPath, [CLI, 'install', '--profile', 'full', '--target', 'codex', '--json'], {
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
    writeManagedHostSurfaces(env, 'full');
    const codexConfig = join(env.HOME!, '.codex', 'config.toml');
    writePath(codexConfig, 'default_mode_request_user_input = true\n\n[mcp_servers.codegraph]\ncommand = "codegraph"\nargs = ["mcp"]\n');
    const lock = join(env.HOME!, '.agents', '.skill-lock.json');
    writePath(join(env.HOME!, '.agents', 'skills', 'repo-harness-cross-review', 'SKILL.md'), '# owned staging skill\n');
    writePath(lock, `${JSON.stringify({ version: 3, skills: {
      'repo-harness-cross-review': { source: 'repo-harness' },
      'user-skill': { source: 'user/repo' },
    } }, null, 2)}\n`);
    const full = applyInstallProfile('full', env, new Date('2026-01-01T00:00:00Z'), first);
    commitInstallHostTransaction(first);
    expect(full.state.ownership_manifest.some(({ components }) => components.includes('agent-fleet'))).toBe(true);
    expect(full.state.ownership_manifest.some(({ components }) => components.includes('cross-model-acceptance'))).toBe(true);
    expect(full.state.ownership_manifest.some(({ managed_marker }) => managed_marker === 'codegraph-config-projection')).toBe(true);

    const second = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    prepareInstallProfileSwitch('minimal', env);
    writeFileSync(join(env.HOME!, '.codex', 'hooks.json'), JSON.stringify({
      hooks: buildManagedHooks('codex', 'minimal'),
    }));
    const minimal = applyInstallProfile('minimal', env, new Date('2026-01-02T00:00:00Z'), second);
    commitInstallHostTransaction(second);

    expect(existsSync(join(env.HOME!, '.codex', 'agents', 'explorer.toml'))).toBe(false);
    expect(existsSync(join(env.HOME!, '.codex', 'skills', 'repo-harness-cross-review'))).toBe(false);
    expect(readFileSync(codexConfig, 'utf-8')).toContain('default_mode_request_user_input = true');
    expect(readFileSync(codexConfig, 'utf-8')).toContain('[mcp_servers.codegraph]');
    const lockState = JSON.parse(readFileSync(lock, 'utf-8'));
    expect(lockState.skills['repo-harness-cross-review']).toBeUndefined();
    expect(lockState.skills['user-skill']).toEqual({ source: 'user/repo' });
    expect(installedProfileStatus(minimal.state, env).drift.status).toBe('consistent');
  }));

  test('profile switch rejects ownership paths outside canonical managed surfaces', () => withHome((env) => {
    const external = join(env.HOME!, 'user-owned.txt');
    const content = 'must survive';
    writeFileSync(external, content);
    writePath(join(env.HOME!, '.repo-harness', 'install-state.json'), `${JSON.stringify({
      protocol: 2,
      profile: 'full',
      components: PROFILE_COMPONENTS.full,
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
    writeManagedHostSurfaces(env, 'full');
    const config = join(env.HOME!, '.codex', 'config.toml');
    writePath(config, '[mcp_servers.codegraph]\ncommand = "codegraph"\nargs = ["serve"]\n');
    const initial = applyInstallProfile('full', env, new Date('2026-01-01T00:00:00Z'), first);
    commitInstallHostTransaction(first);
    const original = initial.state.ownership_manifest.find(({ managed_marker }) => (
      managed_marker === 'codegraph-config-projection'
    ));
    expect(original).toBeDefined();

    const second = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    writeFileSync(config, '[mcp_servers.codegraph]\ncommand = "codegraph"\nargs = ["serve", "--mcp"]\n');
    const refreshed = applyInstallProfile('full', env, new Date('2026-01-02T00:00:00Z'), second);
    commitInstallHostTransaction(second);
    const next = refreshed.state.ownership_manifest.find(({ managed_marker }) => (
      managed_marker === 'codegraph-config-projection'
    ));
    expect(next).toBeDefined();
    expect(next?.content_hash).not.toBe(original?.content_hash);
    expect(installedProfileStatus(refreshed.state, env).drift.status).toBe('consistent');
  }));

  test('downgrade preserves a user-owned staging skill registry when only host links are transaction-owned', () => withHome((env) => {
    writeManagedHostSurfaces(env, 'full');
    const names = ['think', 'hunt', 'check', 'health', 'mermaid'];
    for (const name of names) writePath(join(env.HOME!, '.agents', 'skills', name, 'SKILL.md'), `# ${name}\n`);
    const lock = join(env.HOME!, '.agents', '.skill-lock.json');
    writePath(lock, `${JSON.stringify({ version: 3, skills: {
      think: { source: 'user/waza' },
      mermaid: { source: 'user/mermaid' },
    } }, null, 2)}\n`);

    for (const name of names) {
      rmSync(join(env.HOME!, '.codex', 'skills', name), { recursive: true, force: true });
    }
    const first = beginInstallHostTransaction(installProfileHostMutationPaths(env), env);
    for (const name of names) {
      const destination = join(env.HOME!, '.codex', 'skills', name);
      symlinkSync(join(env.HOME!, '.agents', 'skills', name), destination);
    }
    const planning = applyInstallProfile('full', env, new Date('2026-01-01T00:00:00Z'), first);
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

  // SSD-07 phase A (D2 coverage map): every other multi-call profile-transition
  // test in this file goes full -> minimal (downgrade) or
  // reapplies the same profile (reinstall); none goes ascending. This closes
  // that genuinely uncovered lifecycle cell (minimal -> full upgrade).
  test('profile upgrade adds ownership for newly required components without disturbing prior ones', () => withHome((env) => {
    const { source } = writeManagedHostSurfaces(env, 'minimal');
    const minimal = applyInstallProfile('minimal', env, new Date('2026-01-01T00:00:00Z'));
    expect(minimal.state.components).not.toContain('agent-fleet');
    expect(minimal.state.components).not.toContain('cross-model-acceptance');
    expect(installedProfileStatus(minimal.state, env).drift.status).toBe('consistent');
    const canonicalSkillBefore = readFileSync(join(env.HOME!, '.codex', 'skills', 'repo-harness', 'src/cli/commands/state.ts'), 'utf-8');

    // Materialize the additional full-only host surfaces on top of the
    // still-present minimal ones (writeManagedHostSurfaces itself is not
    // re-callable on the same env -- it always (re)creates the canonical
    // symlink -- so the full-only delta is added directly here, mirroring
    // exactly the profile==='full' branch of that
    // fixture helper), then upgrade in place without a prior removal step.
    writePath(join(source, 'src/core/workflow/profile.ts'), '// managed\n');
    writePath(join(source, 'src/cli/tools/codegraph.ts'), '// managed\n');
    writePath(join(source, 'assets/skills/repo-harness-product/SKILL.md'), '# managed\n');
    for (const skill of ['think', 'hunt', 'check', 'health', 'mermaid']) {
      writePath(join(env.HOME!, '.codex', 'skills', skill, 'SKILL.md'), '# external\n');
    }
    writePath(join(source, 'scripts/contract-run.ts'), '// managed\n');
    writePath(join(source, 'scripts/verify-sprint.sh'), '# managed\n');
    writePath(join(source, 'scripts/ship-worktrees.sh'), '# managed\n');
    writePath(join(env.HOME!, '.bun', 'bin', 'codegraph'), '#!/bin/sh\n');
    for (const agent of ['explorer', 'deep-reasoner', 'fast-worker', 'gatekeeper', 'root-cause-prover', 'harness-evaluator']) {
      writePath(join(env.HOME!, '.codex', 'agents', `${agent}.toml`), '# managed\n');
    }
    writePath(join(env.HOME!, '.codex', 'skills', 'repo-harness-cross-review', 'SKILL.md'), '# external\n');
    writeFileSync(join(env.HOME!, '.codex', 'hooks.json'), JSON.stringify({
      theme: 'user-owned',
      hooks: buildManagedHooks('codex', 'full'),
    }));

    const full = applyInstallProfile('full', env, new Date('2026-01-02T00:00:00Z'));
    expect(full.state.components).toContain('agent-fleet');
    expect(full.state.components).toContain('planning-integrations');
    expect(full.state.components).toContain('cross-model-acceptance');
    expect(full.state.components).toContain('effective-state');
    expect(full.plan.current_profile).toBe('minimal');
    expect(full.plan.remove).toEqual([]);
    expect(installedProfileStatus(full.state, env).drift.status).toBe('consistent');
    expect(existsSync(join(env.HOME!, '.codex', 'agents', 'explorer.toml'))).toBe(true);
    // The prior minimal-profile projection is untouched by the upgrade.
    expect(readFileSync(join(env.HOME!, '.codex', 'skills', 'repo-harness', 'src/cli/commands/state.ts'), 'utf-8')).toBe(canonicalSkillBefore);
    expect(rollbackInstallProfile(env).profile).toBe('minimal');
  }));

  test('Minimal CodeGraph stays conditional while Full enables it', () => withHome((env) => {
    const cwd = env.HOME!;
    expect(profileEnablesCodegraph('minimal', cwd)).toBe(false);
    expect(profileEnablesCodegraph('full', cwd)).toBe(true);
  }));

  test('CLI dry-run and state query expose machine-readable profile authority', () => withHome((env) => {
    const dryRun = spawnSync(process.execPath, [CLI, 'install', '--profile', 'full', '--dry-run', '--json'], {
      cwd: ROOT, env, encoding: 'utf-8',
    });
    expect(dryRun.status).toBe(0);
    expect(JSON.parse(dryRun.stdout).requested_profile).toBe('full');
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
