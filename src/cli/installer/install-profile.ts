import { createHash, randomUUID } from 'crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  writeFileSync,
} from 'fs';
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
  readonly ownership_manifest: readonly ManagedInstallSurface[];
  readonly previous: Omit<InstalledProfileState, 'previous'> | null;
}

export interface ManagedInstallSurface {
  readonly components: readonly InstallComponent[];
  readonly authority: 'repo-harness-install-transaction';
  readonly removal: 'managed-surfaces-only';
  readonly path: string;
  readonly type: 'directory-copy' | 'symlink' | 'managed-file';
  readonly content_hash: string | null;
  readonly managed_marker: string | null;
  readonly symlink_target: string | null;
}

export interface InstalledProfileStatus extends InstalledProfileState {
  readonly drift: {
    readonly status: 'consistent' | 'drift';
    readonly missing_components: readonly InstallComponent[];
    readonly unexpected_components: readonly InstallComponent[];
    readonly ownership_gaps: readonly InstallComponent[];
    readonly surface_drift: readonly string[];
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
const OWNER_MARKER = '.repo-harness-owner.json';
const MANAGED_HOOK_MARKER = 'repo-harness-managed-hook-v1';
const MANAGED_HOOK_PREFIX = `: ${MANAGED_HOOK_MARKER}; `;

function managedAdapterHash(path: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
      hooks?: Record<string, Array<{ matcher?: unknown; hooks?: Array<{ type?: unknown; command?: unknown; timeout?: unknown }> }>>;
    };
    const projection: Record<string, unknown[]> = {};
    for (const [event, entries] of Object.entries(parsed.hooks ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
      const managed = (entries ?? []).filter((entry) => (
        Array.isArray(entry?.hooks)
        && entry.hooks.some((hook) => typeof hook?.command === 'string' && hook.command.startsWith(MANAGED_HOOK_PREFIX))
      ));
      if (managed.length > 0) projection[event] = managed;
    }
    if (Object.keys(projection).length === 0) return null;
    return `sha256:${createHash('sha256').update(JSON.stringify(projection)).digest('hex')}`;
  } catch {
    return null;
  }
}

function hashManagedTree(root: string): string {
  const entries: Array<{ path: string; type: 'file' | 'symlink' }> = [];
  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === OWNER_MARKER) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) entries.push({ path: relative, type: 'file' });
      else if (entry.isSymbolicLink()) entries.push({ path: relative, type: 'symlink' });
    }
  };
  visit(root, '');
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const hash = createHash('sha256');
  for (const entry of entries) {
    const absolute = join(root, entry.path);
    if (entry.type === 'symlink') {
      hash.update(`L\0${entry.path}\0${readlinkSync(absolute)}\0`);
    } else {
      hash.update(`F\0${entry.path}\0`);
      hash.update(readFileSync(absolute));
      hash.update('\0');
    }
  }
  return `sha256:${hash.digest('hex')}`;
}

function captureDirectoryOrLink(
  path: string,
  components: readonly InstallComponent[],
): ManagedInstallSurface | null {
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    return {
      components,
      authority: 'repo-harness-install-transaction',
      removal: 'managed-surfaces-only',
      path,
      type: 'symlink',
      content_hash: null,
      managed_marker: null,
      symlink_target: readlinkSync(path),
    };
  }
  if (!stat.isDirectory()) return null;
  const markerPath = join(path, OWNER_MARKER);
  if (!existsSync(markerPath)) return null;
  try {
    const marker = JSON.parse(readFileSync(markerPath, 'utf-8')) as {
      owner?: unknown;
      surface?: unknown;
      content_hash?: unknown;
    };
    if (
      marker.owner !== 'repo-harness' ||
      (marker.surface !== 'canonical-skill' && marker.surface !== 'command-facade') ||
      typeof marker.content_hash !== 'string'
    ) return null;
    return {
      components,
      authority: 'repo-harness-install-transaction',
      removal: 'managed-surfaces-only',
      path,
      type: 'directory-copy',
      content_hash: marker.content_hash,
      managed_marker: `${OWNER_MARKER}:owner=repo-harness;surface=${marker.surface}`,
      symlink_target: null,
    };
  } catch {
    return null;
  }
}

function captureManagedFile(
  path: string,
  components: readonly InstallComponent[],
): ManagedInstallSurface | null {
  if (!existsSync(path)) return null;
  const contentHash = managedAdapterHash(path);
  if (contentHash === null) return null;
  return {
    components,
    authority: 'repo-harness-install-transaction',
    removal: 'managed-surfaces-only',
    path,
    type: 'managed-file',
    content_hash: contentHash,
    managed_marker: MANAGED_HOOK_MARKER,
    symlink_target: null,
  };
}

function discoverManagedSurfaces(
  profile: InstallProfile,
  env: NodeJS.ProcessEnv,
): readonly ManagedInstallSurface[] {
  const home = env.HOME ?? homedir();
  const desired = PROFILE_COMPONENTS[profile];
  const runtimeComponents = desired.filter((component) => component !== 'host-adapters');
  const surfaces: ManagedInstallSurface[] = [];
  for (const root of [join(home, '.codex', 'skills'), join(home, '.claude', 'skills')]) {
    const canonical = captureDirectoryOrLink(join(root, 'repo-harness'), runtimeComponents);
    if (canonical) surfaces.push(canonical);
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root).filter((entry) => entry.startsWith('repo-harness-')).sort()) {
      const facadeComponents = name === 'repo-harness-handoff'
        ? desired.filter((component) => component === 'handoff')
        : name === 'repo-harness-check'
          ? desired.filter((component) => component === 'scope-worktree-check-guards' || component === 'verifier')
          : desired.filter((component) => component === 'adaptive-workflow' || component === 'planning-integrations');
      const facade = captureDirectoryOrLink(join(root, name), facadeComponents);
      if (facade) surfaces.push(facade);
    }
  }
  for (const file of [join(home, '.codex', 'hooks.json'), join(home, '.claude', 'settings.json')]) {
    const adapter = captureManagedFile(file, desired.filter((component) => component === 'host-adapters'));
    if (adapter) surfaces.push(adapter);
  }
  return surfaces;
}

function surfaceIsCurrent(surface: ManagedInstallSurface): boolean {
  if (!existsSync(surface.path)) return false;
  try {
    const stat = lstatSync(surface.path);
    if (surface.type === 'symlink') {
      return stat.isSymbolicLink() && readlinkSync(surface.path) === surface.symlink_target;
    }
    if (surface.type === 'managed-file') {
      return stat.isFile() && surface.managed_marker === MANAGED_HOOK_MARKER
        && surface.content_hash !== null
        && managedAdapterHash(surface.path) === surface.content_hash;
    }
    if (!stat.isDirectory() || surface.content_hash === null || surface.managed_marker === null) return false;
    const markerPath = join(surface.path, OWNER_MARKER);
    return existsSync(markerPath)
      && readFileSync(markerPath, 'utf-8').includes('"owner":"repo-harness"')
      && hashManagedTree(surface.path) === surface.content_hash;
  } catch {
    return false;
  }
}

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
  const legacyManifest = parsed.ownership_manifest as unknown as Array<Record<string, unknown>>;
  if (legacyManifest.every((entry) => (
    typeof entry.component === 'string'
    && entry.authority === 'repo-harness-install-transaction'
    && entry.removal === 'managed-surfaces-only'
    && entry.path === undefined
  ))) {
    // One-shot migration: old component labels never proved filesystem
    // ownership. Preserve the profile selection but claim no managed surface;
    // the next successful sync preflights the host and writes concrete proofs.
    return { ...parsed, ownership_manifest: [] };
  }
  if (parsed.ownership_manifest.some((surface) => (
    !Array.isArray(surface.components)
    || surface.authority !== 'repo-harness-install-transaction'
    || surface.removal !== 'managed-surfaces-only'
    || typeof surface.path !== 'string'
    || !['directory-copy', 'symlink', 'managed-file'].includes(surface.type)
  ))) {
    throw new Error(`installed profile state has an invalid ownership surface; rerun repo-harness install --profile <profile>: ${path}`);
  }
  return parsed;
}

export function installedProfileStatus(state: InstalledProfileState): InstalledProfileStatus {
  const desired = PROFILE_COMPONENTS[state.profile];
  const active = new Set(state.components);
  const currentSurfaces = state.ownership_manifest.filter(surfaceIsCurrent);
  const owned = new Set(currentSurfaces.flatMap((entry) => entry.components));
  const missing = desired.filter((component) => !active.has(component));
  const unexpected = state.components.filter((component) => !desired.includes(component));
  const ownershipGaps = state.components.filter((component) => !owned.has(component));
  const surfaceDrift = state.ownership_manifest
    .filter((surface) => !surfaceIsCurrent(surface))
    .map((surface) => surface.path);
  return {
    ...state,
    drift: {
      status: missing.length === 0 && unexpected.length === 0 && ownershipGaps.length === 0 && surfaceDrift.length === 0
        ? 'consistent'
        : 'drift',
      missing_components: missing,
      unexpected_components: unexpected,
      ownership_gaps: ownershipGaps,
      surface_drift: surfaceDrift,
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
  const ownershipManifest = discoverManagedSurfaces(profile, env);
  const sameOwnership = current !== null
    && JSON.stringify(current.ownership_manifest) === JSON.stringify(ownershipManifest);
  const state: InstalledProfileState = {
    protocol: 1,
    profile,
    components: PROFILE_COMPONENTS[profile],
    transaction_id: current?.profile === profile && plan.install.length === 0 && plan.remove.length === 0 && sameOwnership
      ? current.transaction_id
      : randomUUID(),
    applied_at: current?.profile === profile && plan.install.length === 0 && plan.remove.length === 0 && sameOwnership
      ? current.applied_at
      : now.toISOString(),
    ownership_manifest: ownershipManifest,
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
  const restored: InstalledProfileState = {
    ...current.previous,
    transaction_id: randomUUID(),
    applied_at: new Date().toISOString(),
    ownership_manifest: discoverManagedSurfaces(current.previous.profile, env),
    previous: null,
  };
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
