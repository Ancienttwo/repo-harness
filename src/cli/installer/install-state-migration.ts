// One-shot install-state migration, protocol 2 -> 3 (#1601). It is the only
// reader of protocol 2. `repo-harness update` runs it under the global runtime
// lock and inside its host transaction, so a later failure restores the
// protocol 2 file and every deleted byte. Delete this module in the 0.26.0
// release PR (#1607); protocol 2 then gets install_state_protocol_retired.
import { randomUUID } from 'crypto';
import { existsSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { MANAGED_TAG } from './managed-entries';
import {
  agentFleetTargetPaths,
  agentFleetUserManagedReceiptPath,
  canonicalOwnership,
  hostPluginAbsence,
  INSTALL_STATE_PROTOCOL,
  InstallStateError,
  installProfileStatePath,
  loadSkillSurfaceCatalog,
  managedInstallSurfaceIsCurrent,
  ownerForInstallPath,
  readRawInstallState,
  skippedPluginLine,
  UPDATE_COMMAND,
  validSurfaceShape,
  versions,
  writeState,
  type ManagedInstallSurface,
  type SkippedPlugin,
} from './install-profile';
import { hostSkillRoot } from '../../effects/host-skill-roots';
import { PLUGIN_IDS, selectionLabel, type PluginId, type PluginSelection, type SurfaceOwner } from '../../core/skill-surface/plugin-manifest';

const PROTOCOL_2_PROFILES = ['minimal', 'full'] as const;
type Protocol2Profile = (typeof PROTOCOL_2_PROFILES)[number];
const PROTOCOL_2_MINIMAL = ['cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters', 'adaptive-workflow', 'codegraph-conditional'];
const PROTOCOL_2_COMPONENTS: Readonly<Record<Protocol2Profile, readonly string[]>> = {
  minimal: PROTOCOL_2_MINIMAL,
  full: [...PROTOCOL_2_MINIMAL, 'planning-integrations', 'agent-fleet', 'verifier', 'cross-model-acceptance', 'release-deployment-gates'],
};
/** M35 mapping. `full` also selects `pi` when the host runs Pi (owner decision on #1601). */
const PROFILE_PLUGINS: Readonly<Record<Protocol2Profile, readonly PluginId[]>> = {
  minimal: ['platform', 'strategy-memory'],
  full: PLUGIN_IDS,
};
const CODEGRAPH_CONFIG_MARKER = 'codegraph-config-projection';
const SURFACE_KEYS = ['authority', 'components', 'content_hash', 'managed_marker', 'path', 'removal', 'symlink_target', 'type'].join(',');

interface Protocol2Surface extends Omit<ManagedInstallSurface, 'owner'> {
  readonly components: readonly string[];
}

interface Protocol2State {
  readonly profile: Protocol2Profile;
  readonly ownership_manifest: readonly Protocol2Surface[];
}

export interface InstallStateMigrationPlan {
  readonly from_protocol: 2;
  readonly from_profile: Protocol2Profile;
  readonly to_protocol: typeof INSTALL_STATE_PROTOCOL;
  /** `full` maps to `all`; `minimal` maps to the explicit list of its plugins. */
  readonly selection: PluginSelection;
  readonly plugins: readonly PluginId[];
  readonly from_profile_plugins: readonly PluginId[];
  /** Owners of recorded surfaces that the profile mapping does not select. */
  readonly from_ledger_plugins: readonly PluginId[];
  /** Host plugins that the `all` selection skips now; an explicit list has none. */
  readonly skipped: readonly SkippedPlugin[];
  /** The core surfaces that a former minimal install gains. */
  readonly added_core_surfaces: readonly string[];
  /** Owned, unchanged files that the migration deletes. */
  readonly remove: readonly string[];
  /** Owned files that changed; the migration keeps them and drops them from the ledger. */
  readonly keep: readonly { readonly path: string; readonly reason: string }[];
  readonly state_path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function retiredFleetFile(env: NodeJS.ProcessEnv): string {
  return join(env.HOME ?? homedir(), '.claude', 'agents', 'orchestrator.md');
}

function invalid(path: string, detail: string): InstallStateError {
  return new InstallStateError('install_state_invalid', path, `protocol 2 install state ${detail}; it cannot be migrated: ${path}`);
}

function parseBase(raw: unknown, path: string, env: NodeJS.ProcessEnv, label: string): Protocol2State {
  if (!isRecord(raw) || raw.protocol !== 2 || !PROTOCOL_2_PROFILES.includes(raw.profile as Protocol2Profile)) throw invalid(path, `${label} is malformed`);
  const profile = raw.profile as Protocol2Profile;
  const expected = PROTOCOL_2_COMPONENTS[profile];
  if (!Array.isArray(raw.components) || raw.components.join(',') !== expected.join(',')) throw invalid(path, `${label} components do not match profile ${profile}`);
  const known = PROTOCOL_2_COMPONENTS.full;
  const retired = retiredFleetFile(env);
  const valid = (surface: unknown): surface is Protocol2Surface => isRecord(surface)
    && Object.keys(surface).sort().join(',') === SURFACE_KEYS
    && Array.isArray(surface.components) && surface.components.every(component => known.includes(component as string))
    && (surface.type !== 'pi-package' || (surface.components.length === 1 && surface.components[0] === 'host-adapters'))
    && validSurfaceShape(surface, env, retired);
  if (!Array.isArray(raw.ownership_manifest) || !raw.ownership_manifest.every(valid)) {
    throw new InstallStateError('install_state_invalid_ownership', path, `protocol 2 install state ${label} has an invalid ownership surface; it cannot be migrated: ${path}`);
  }
  if (typeof raw.transaction_id !== 'string' || typeof raw.applied_at !== 'string') throw invalid(path, `${label} has invalid metadata`);
  if (raw.package_version !== undefined && (typeof raw.package_version !== 'string' || !raw.package_version.trim())) throw invalid(path, `${label} has an invalid package version`);
  return { profile, ownership_manifest: raw.ownership_manifest };
}

/** Strict protocol 2 reader: the state, its previous state and the fleet receipt, before any host change. */
export function parseProtocol2State(raw: unknown, path: string, env: NodeJS.ProcessEnv): Protocol2State {
  const state = parseBase(raw, path, env, 'state');
  const previous = isRecord(raw) ? raw.previous : undefined;
  if (previous !== null) {
    if (!isRecord(previous) || 'previous' in previous) throw invalid(path, 'has an invalid previous state');
    parseBase(previous, path, env, 'previous state');
  }
  return state;
}

function parseFleetReceipt(env: NodeJS.ProcessEnv): Record<string, unknown> | null {
  const path = agentFleetUserManagedReceiptPath(env);
  if (!existsSync(path)) return null;
  const allowed = new Set([...agentFleetTargetPaths(env), retiredFleetFile(env)]);
  let receipt: unknown;
  try { receipt = JSON.parse(readFileSync(path, 'utf8')); } catch { throw invalid(path, 'fleet receipt is not valid JSON'); }
  if (!isRecord(receipt) || receipt.protocol !== 1 || receipt.authority !== 'user-managed-agent-fleet' || !Array.isArray(receipt.files)) {
    throw invalid(path, 'fleet receipt is malformed');
  }
  const paths = receipt.files.map(entry => (isRecord(entry) ? entry.path : undefined));
  if (new Set(paths).size !== paths.length || !receipt.files.every(entry => isRecord(entry) && typeof entry.path === 'string'
    && allowed.has(entry.path) && typeof entry.sha256 === 'string' && /^sha256:[a-f0-9]{64}$/.test(entry.sha256))) {
    throw invalid(path, 'fleet receipt is malformed');
  }
  return receipt;
}

function ownerOf(surface: Protocol2Surface, env: NodeJS.ProcessEnv, statePath: string): SurfaceOwner {
  if (surface.type === 'pi-package') return 'pi';
  if (surface.managed_marker === CODEGRAPH_CONFIG_MARKER) return 'architecture';
  if (surface.managed_marker === MANAGED_TAG || surface.components.length === 0) return 'core';
  const owner = ownerForInstallPath(surface.path, env);
  if (owner === null) {
    throw new InstallStateError('install_state_invalid_ownership', statePath, `protocol 2 install state records ${surface.path}, which no protocol 3 owner claims; it cannot be migrated: ${statePath}`);
  }
  return owner;
}

function minimalAddedCoreSurfaces(env: NodeJS.ProcessEnv): readonly string[] {
  const home = env.HOME ?? homedir();
  const facades = loadSkillSurfaceCatalog().packages
    .filter(pkg => pkg.kind === 'facade' && pkg.owner === 'core' && !pkg.explicitOnly && pkg.name !== 'repo-harness-check')
    .map(pkg => pkg.name);
  return [
    `skills: ${facades.join(', ')}`,
    `agent fleet files: ${join(home, '.claude', 'agents')}/*.md and ${join(home, '.codex', 'agents')}/*.toml`,
    'hook routes: PreToolUse.subagent (Claude) and SubagentStart.context (Codex)',
    'Waza and Mermaid skills: the next repo-harness install fetches them (update does not)',
  ];
}

interface Prepared {
  readonly plan: InstallStateMigrationPlan;
  readonly ledger: readonly ManagedInstallSurface[];
  readonly receipt: Record<string, unknown> | null;
}

function prepare(env: NodeJS.ProcessEnv): Prepared | null {
  const raw = readRawInstallState(env);
  if (!isRecord(raw) || raw.protocol !== 2) return null;
  const statePath = installProfileStatePath(env);
  const state = parseProtocol2State(raw, statePath, env);
  const receipt = parseFleetReceipt(env);
  const retired = retiredFleetFile(env);
  const piRoot = `${hostSkillRoot(env.HOME ?? homedir(), 'pi', env)}/`;

  const piAbsence = hostPluginAbsence('pi', env);
  const fromProfile = PROFILE_PLUGINS[state.profile].filter(id => id !== 'pi' || piAbsence === null);
  const owned = state.ownership_manifest.filter(surface => surface.path !== retired)
    .map(surface => ({ surface, owner: ownerOf(surface, env, statePath) }));
  // Only the Pi package registration selects `pi` through the ledger; Pi skill root copies follow the selection.
  const fromLedger = [...new Set(owned
    .filter(({ surface, owner }) => owner !== 'core' && (owner !== 'pi' || surface.type === 'pi-package'))
    .map(({ owner }) => owner as PluginId))].filter(id => !fromProfile.includes(id));
  const plugins = PLUGIN_IDS.filter(id => fromProfile.includes(id) || fromLedger.includes(id));
  const selection: PluginSelection = state.profile === 'full' ? 'all' : plugins;
  // An explicit list fails closed on an absent host program. Update cannot select without it,
  // and install refuses protocol 2, so the message names both ways out.
  if (selection !== 'all' && selection.includes('pi') && piAbsence !== null) {
    throw new InstallStateError('install_plugin_unavailable', statePath,
      `protocol 2 install state ${statePath} records a Pi package, so it maps to an explicit plugin list with pi, and ${piAbsence}. `
      + `Install pi, then run: repo-harness update; or roll back: bun add -g repo-harness@0.25.3 --no-cache, delete ${statePath}, and reinstall with 0.25.3`);
  }

  // `update` adds a skipped host plugin of the `all` selection once its program is present.
  const skipped: SkippedPlugin[] = [];
  if (selection === 'all') {
    if (!plugins.includes('pi') && piAbsence !== null) skipped.push({ id: 'pi', reason: piAbsence, command: UPDATE_COMMAND });
  }

  const remove: string[] = [];
  const keep: { path: string; reason: string }[] = [];
  const dropped = (surface: Protocol2Surface, why: string) => {
    if (managedInstallSurfaceIsCurrent(surface, env)) remove.push(surface.path);
    else if (existsSync(surface.path) || lstatExists(surface.path)) keep.push({ path: surface.path, reason: `${why}; it changed after install, so review it and delete it by hand` });
  };
  const fleet = state.ownership_manifest.find(surface => surface.path === retired);
  if (fleet !== undefined) dropped(fleet, 'the orchestrator is a seat now (repo-harness seats argv orchestrator)');
  else if (lstatExists(retired)) keep.push({ path: retired, reason: 'the install state does not own it; the orchestrator is a seat now (repo-harness seats argv orchestrator)' });
  const ledger: ManagedInstallSurface[] = [];
  for (const { surface, owner } of owned) {
    if (owner === 'pi' && !plugins.includes('pi') && surface.path.startsWith(piRoot)) {
      dropped(surface, 'the pi plugin is not selected');
      continue;
    }
    const { components: _components, ...shape } = surface;
    ledger.push({ owner, ...shape });
  }

  return {
    plan: {
      from_protocol: 2, from_profile: state.profile, to_protocol: INSTALL_STATE_PROTOCOL, selection, plugins,
      from_profile_plugins: fromProfile, from_ledger_plugins: fromLedger, skipped,
      added_core_surfaces: state.profile === 'minimal' ? minimalAddedCoreSurfaces(env) : [],
      remove, keep, state_path: statePath,
    },
    ledger: canonicalOwnership(ledger),
    receipt,
  };
}

function lstatExists(path: string): boolean {
  try { lstatSync(path); return true; } catch { return false; }
}

/** The read-only mapping that `update --check` prints. Null when the state is not protocol 2. */
export function planInstallStateMigration(env: NodeJS.ProcessEnv = process.env): InstallStateMigrationPlan | null {
  return prepare(env)?.plan ?? null;
}

/** Paths outside the install transaction set that the migration can delete or rewrite. */
export function installStateMigrationPaths(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  return [retiredFleetFile(env), agentFleetUserManagedReceiptPath(env)];
}

export function formatInstallStateMigrationPlan(plan: InstallStateMigrationPlan): readonly string[] {
  const list = (values: readonly string[]) => values.join(',') || '(none)';
  return [
    `install state protocol 2 -> 3: protocol 2 set "${plan.from_profile}" -> selection ${selectionLabel(plan.selection)}; plugins ${list(plan.plugins)}`,
    `  from the protocol 2 set: ${list(plan.from_profile_plugins)}; from the ledger: ${list(plan.from_ledger_plugins)}`,
    ...plan.skipped.map(entry => `  ${skippedPluginLine(entry)}`),
    ...plan.added_core_surfaces.map(surface => `  adds core ${surface}`),
    ...plan.remove.map(path => `  removes ${path}`),
    ...plan.keep.map(entry => `  keeps ${entry.path}: ${entry.reason}`),
  ];
}

/**
 * Migrate a protocol 2 state. The caller holds the global runtime lock and has
 * snapshotted the transaction paths and `installStateMigrationPaths`. Every
 * check runs before the first delete; the state commits by atomic rename.
 */
export function migrateInstallState(env: NodeJS.ProcessEnv = process.env, now = new Date()): InstallStateMigrationPlan | null {
  const prepared = prepare(env);
  if (prepared === null) return null;
  const { plan, ledger, receipt } = prepared;
  for (const path of plan.remove) rmSync(path, { recursive: true, force: true });
  const retired = retiredFleetFile(env);
  if (receipt !== null && (receipt.files as { path: string }[]).some(entry => entry.path === retired)) {
    const receiptPath = agentFleetUserManagedReceiptPath(env);
    const temp = `${receiptPath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temp, `${JSON.stringify({ ...receipt, files: (receipt.files as { path: string }[]).filter(entry => entry.path !== retired) }, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, receiptPath);
  }
  writeState({
    protocol: INSTALL_STATE_PROTOCOL,
    ...versions(plan.plugins),
    selection: plan.selection,
    transaction_id: randomUUID(),
    applied_at: now.toISOString(),
    ownership_manifest: ledger,
    previous: null,
  }, env);
  return plan;
}

/** The pre-migration snapshot's Pi package paths, for the candidate's Pi ownership delta. */
export function protocol2SnapshotSurfaces(raw: unknown, path: string, env: NodeJS.ProcessEnv): readonly Pick<ManagedInstallSurface, 'path' | 'type'>[] {
  return parseProtocol2State(raw, path, env).ownership_manifest;
}
