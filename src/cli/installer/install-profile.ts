import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';

export const INSTALL_PROFILES = ['minimal', 'standard', 'product-planning', 'strict'] as const;
export type InstallProfile = (typeof INSTALL_PROFILES)[number];

export type InstallComponent =
  | 'cli'
  | 'effective-state'
  | 'scope-worktree-check-guards'
  | 'handoff'
  | 'host-adapters'
  | 'adaptive-workflow'
  | 'codegraph-conditional'
  | 'planning-integrations'
  | 'agent-fleet'
  | 'verifier'
  | 'cross-model-acceptance'
  | 'release-deployment-gates';

const PROFILE_COMPONENTS: Readonly<Record<InstallProfile, readonly InstallComponent[]>> = Object.freeze({
  minimal: ['cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters'],
  standard: [
    'cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters',
    'adaptive-workflow', 'codegraph-conditional',
  ],
  'product-planning': [
    'cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters',
    'adaptive-workflow', 'codegraph-conditional', 'planning-integrations',
  ],
  strict: [
    'cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters',
    'adaptive-workflow', 'codegraph-conditional', 'agent-fleet', 'verifier',
    'cross-model-acceptance', 'release-deployment-gates',
  ],
});

export interface InstalledProfileState {
  readonly protocol: 1;
  readonly profile: InstallProfile;
  readonly components: readonly InstallComponent[];
  readonly transaction_id: string;
  readonly applied_at: string;
  readonly ownership_manifest: readonly {
    readonly component: InstallComponent;
    readonly authority: 'repo-harness-install-transaction';
    readonly removal: 'managed-surfaces-only';
  }[];
  readonly previous: Omit<InstalledProfileState, 'previous'> | null;
}

export interface InstalledProfileStatus extends InstalledProfileState {
  readonly drift: {
    readonly status: 'consistent' | 'drift';
    readonly missing_components: readonly InstallComponent[];
    readonly unexpected_components: readonly InstallComponent[];
    readonly ownership_gaps: readonly InstallComponent[];
  };
}

export interface InstallProfilePlan {
  readonly protocol: 1;
  readonly requested_profile: InstallProfile;
  readonly current_profile: InstallProfile | null;
  readonly install: readonly InstallComponent[];
  readonly skip: readonly InstallComponent[];
  readonly remove: readonly InstallComponent[];
  readonly state_path: string;
}

const ALL_COMPONENTS = [...new Set(Object.values(PROFILE_COMPONENTS).flat())] as InstallComponent[];

export function assertInstallProfile(value: string): InstallProfile {
  if (!INSTALL_PROFILES.includes(value as InstallProfile)) {
    throw new Error(`invalid install profile ${value}; expected ${INSTALL_PROFILES.join('|')}`);
  }
  return value as InstallProfile;
}

export function installProfileStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.HOME ?? homedir(), '.repo-harness', 'install-state.json');
}

export function readInstalledProfile(env: NodeJS.ProcessEnv = process.env): InstalledProfileState | null {
  const path = installProfileStatePath(env);
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as InstalledProfileState;
  if (parsed.protocol !== 1 || !INSTALL_PROFILES.includes(parsed.profile)) {
    throw new Error(`invalid installed profile state: ${path}`);
  }
  if (!Array.isArray(parsed.ownership_manifest)) {
    throw new Error(`installed profile state has no ownership manifest; rerun repo-harness install --profile <profile>: ${path}`);
  }
  return parsed;
}

export function installedProfileStatus(state: InstalledProfileState): InstalledProfileStatus {
  const desired = PROFILE_COMPONENTS[state.profile];
  const active = new Set(state.components);
  const owned = new Set(state.ownership_manifest.map((entry) => entry.component));
  const missing = desired.filter((component) => !active.has(component));
  const unexpected = state.components.filter((component) => !desired.includes(component));
  const ownershipGaps = state.components.filter((component) => !owned.has(component));
  return {
    ...state,
    drift: {
      status: missing.length === 0 && unexpected.length === 0 && ownershipGaps.length === 0 ? 'consistent' : 'drift',
      missing_components: missing,
      unexpected_components: unexpected,
      ownership_gaps: ownershipGaps,
    },
  };
}

export function planInstallProfile(
  profile: InstallProfile,
  current: InstalledProfileState | null,
  env: NodeJS.ProcessEnv = process.env,
): InstallProfilePlan {
  const desired = PROFILE_COMPONENTS[profile];
  const installed = new Set(current?.components ?? []);
  const desiredSet = new Set(desired);
  return {
    protocol: 1,
    requested_profile: profile,
    current_profile: current?.profile ?? null,
    install: desired.filter((component) => !installed.has(component)),
    skip: desired.filter((component) => installed.has(component)),
    remove: ALL_COMPONENTS.filter((component) => installed.has(component) && !desiredSet.has(component)),
    state_path: installProfileStatePath(env),
  };
}

function writeState(state: InstalledProfileState, env: NodeJS.ProcessEnv): void {
  const target = installProfileStatePath(env);
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, target);
}

export function applyInstallProfile(
  profile: InstallProfile,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): { readonly plan: InstallProfilePlan; readonly state: InstalledProfileState } {
  const current = readInstalledProfile(env);
  const plan = planInstallProfile(profile, current, env);
  const state: InstalledProfileState = {
    protocol: 1,
    profile,
    components: PROFILE_COMPONENTS[profile],
    transaction_id: current?.profile === profile && plan.install.length === 0 && plan.remove.length === 0
      ? current.transaction_id
      : randomUUID(),
    applied_at: current?.profile === profile && plan.install.length === 0 && plan.remove.length === 0
      ? current.applied_at
      : now.toISOString(),
    ownership_manifest: PROFILE_COMPONENTS[profile].map((component) => ({
      component,
      authority: 'repo-harness-install-transaction',
      removal: 'managed-surfaces-only',
    })),
    previous: current ? {
      protocol: current.protocol,
      profile: current.profile,
      components: current.components,
      transaction_id: current.transaction_id,
      applied_at: current.applied_at,
      ownership_manifest: current.ownership_manifest,
    } : null,
  };
  writeState(state, env);
  return { plan, state };
}

export function rollbackInstallProfile(env: NodeJS.ProcessEnv = process.env): InstalledProfileState {
  const current = readInstalledProfile(env);
  if (!current?.previous) throw new Error('no previous install profile transaction to roll back');
  const restored: InstalledProfileState = { ...current.previous, previous: null };
  writeState(restored, env);
  return restored;
}

export function profileEnablesExternalSkills(profile: InstallProfile): boolean {
  return profile === 'product-planning' || profile === 'strict';
}

export function profileEnablesCodegraph(profile: InstallProfile, cwd = process.cwd()): boolean {
  if (profile === 'strict') return true;
  if (profile === 'minimal') return false;
  try {
    const policy = JSON.parse(readFileSync(join(cwd, '.ai/harness/policy.json'), 'utf-8')) as {
      tooling?: { codegraph?: { enabled?: unknown } };
    };
    if (policy.tooling?.codegraph?.enabled === true) return true;
  } catch { /* policy opt-in absent */ }
  const tracked = spawnSync('git', ['ls-files'], { cwd, encoding: 'utf-8' });
  if (tracked.status !== 0) return false;
  return tracked.stdout.split('\n').filter(Boolean).length >= 2_000;
}
