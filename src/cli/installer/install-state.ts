import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { version as PACKAGE_VERSION } from '../../../package.json';
import { isRecord } from '../../core/evidence/is-record';
import { isPluginId, PLUGIN_IDS, type PluginId, type PluginSelection } from '../../core/skill-surface/plugin-manifest';

/**
 * The install-state read model: the state path, the protocol, the plugins and
 * the selection. It has no package-asset and no host-path dependency, so a
 * hook process can read the recorded selection. The installer
 * (install-profile.ts) builds on this parser and checks each ownership
 * surface against its host mutation paths.
 */

export const INSTALL_STATE_PROTOCOL = 3 as const;

export interface InstalledPlugin {
  readonly id: PluginId;
  readonly version: string;
}

export interface RecordedInstallState {
  readonly protocol: typeof INSTALL_STATE_PROTOCOL;
  /** Core records only its version. The package manifest owns the plugin-to-surface map. */
  readonly core: { readonly version: string };
  /** Enabled plugins only: sorted, unique. Absence means disabled. */
  readonly plugins: readonly InstalledPlugin[];
  /** How the plugin set was chosen. An explicit list equals the plugin ids; `all` holds any subset. */
  readonly selection: PluginSelection;
  readonly transaction_id: string;
  readonly applied_at: string;
  /** Not checked here: the installer checks each surface against its host mutation paths. */
  readonly ownership_manifest: readonly unknown[];
  readonly previous: RecordedInstallSnapshot | null;
}

export type RecordedInstallSnapshot = Omit<RecordedInstallState, 'previous'>;

export type InstallStateErrorCode =
  | 'install_state_missing'
  | 'install_state_protocol_retired'
  | 'install_state_invalid'
  | 'install_state_invalid_ownership'
  | 'install_plugin_unavailable';

/** Typed failure of the install state or of a requested selection. Nothing is written before it is thrown. */
export class InstallStateError extends Error {
  constructor(readonly code: InstallStateErrorCode, readonly path: string, message: string) {
    super(message);
    this.name = 'InstallStateError';
  }
}

export function installProfileStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.HOME ?? homedir(), '.repo-harness', 'install-state.json');
}

export function enabledPlugins(state: Pick<RecordedInstallState, 'plugins'>): readonly PluginId[] {
  return state.plugins.map(plugin => plugin.id);
}

function invalidInstallState(path: string, detail: string): InstallStateError {
  return new InstallStateError('install_state_invalid', path, `install state ${detail}; inspect: rh install --state: ${path}`);
}

/** The installer throws the same error for a surface that fails its host-path check. */
export function invalidOwnership(path: string): InstallStateError {
  return new InstallStateError('install_state_invalid_ownership', path,
    `install state has an invalid ownership surface (unknown path, malformed entry, or an owner that is not enabled); inspect: rh install --state: ${path}`);
}

function parsePlugins(raw: unknown, coreVersion: string, path: string): readonly InstalledPlugin[] {
  if (!Array.isArray(raw)) throw invalidInstallState(path, 'has no plugins array');
  const plugins = raw.map((entry): InstalledPlugin => {
    if (!isRecord(entry) || Object.keys(entry).sort().join(',') !== 'id,version') throw invalidInstallState(path, 'has a malformed plugin entry');
    if (!isPluginId(entry.id)) {
      throw new InstallStateError('install_state_invalid', path, `install state names unknown plugin ${JSON.stringify(entry.id)}; expected one of ${PLUGIN_IDS.join(', ')}: ${path}`);
    }
    // Plugin versions equal the core version until plugins ship separately (#1287 step 4).
    if (entry.version !== coreVersion) throw invalidInstallState(path, `records plugin ${entry.id} at version ${String(entry.version)}, not ${coreVersion}`);
    return { id: entry.id, version: entry.version };
  });
  const ids = plugins.map(plugin => plugin.id);
  if (ids.join(',') !== PLUGIN_IDS.filter(id => ids.includes(id)).join(',')) throw invalidInstallState(path, 'plugins are not sorted and unique');
  return plugins;
}

/** `all`, or the explicit list, which must equal the recorded plugin ids. Nothing is inferred from the plugin entries. */
function parseSelection(raw: unknown, ids: readonly PluginId[], path: string, label: string): PluginSelection {
  if (raw === 'all') return 'all';
  if (!Array.isArray(raw) || !raw.every(isPluginId)) throw invalidInstallState(path, `${label} has no valid selection ("all" or a list of plugin ids)`);
  if (raw.join(',') !== ids.join(',')) {
    throw invalidInstallState(path, `${label} selection ${JSON.stringify(raw)} does not equal its plugins ${JSON.stringify(ids)}`);
  }
  return ids;
}

/** 0.25.4 is the last release that reads protocol 2: its `update` migrates the state to protocol 3 (#1607). */
const PROTOCOL_2_BRIDGE = 'bun add -g repo-harness@0.25.4 --no-cache && rh update --version 0.25.4';
const CURRENT_PACKAGE_UPDATE = `bun add -g repo-harness@${PACKAGE_VERSION} --no-cache && rh update`;

function parseSnapshot(raw: unknown, path: string, label: string): RecordedInstallSnapshot {
  if (!isRecord(raw)) throw invalidInstallState(path, `${label} is not an object`);
  if (raw.protocol === 1) {
    throw new InstallStateError('install_state_protocol_retired', path,
      `install state ${path} is protocol 1, which this package no longer reads. Migrate it with the 0.25.x bridge first: `
      + 'bun add -g repo-harness@0.25.3 --no-cache, then run its protocol 1 migration (rh install --help in 0.25.3 names it); '
      + `then the protocol 2 bridge: ${PROTOCOL_2_BRIDGE}; then: ${CURRENT_PACKAGE_UPDATE}`);
  }
  if (raw.protocol === 2) {
    throw new InstallStateError('install_state_protocol_retired', path,
      `install state ${path} is protocol 2, which this package no longer reads. Migrate it with the 0.25.4 bridge first: `
      + `${PROTOCOL_2_BRIDGE} (its update migrates protocol 2 to 3); then: ${CURRENT_PACKAGE_UPDATE}`);
  }
  if (raw.protocol !== INSTALL_STATE_PROTOCOL) throw invalidInstallState(path, `${label} has unsupported protocol ${String(raw.protocol)}`);
  if (!isRecord(raw.core) || Object.keys(raw.core).join(',') !== 'version' || typeof raw.core.version !== 'string' || !raw.core.version.trim()) {
    throw invalidInstallState(path, `${label} has an invalid core version`);
  }
  const plugins = parsePlugins(raw.plugins, raw.core.version, path);
  const selection = parseSelection(raw.selection, plugins.map(plugin => plugin.id), path, label);
  if (!Array.isArray(raw.ownership_manifest)) throw invalidOwnership(path);
  if (typeof raw.transaction_id !== 'string' || typeof raw.applied_at !== 'string') throw invalidInstallState(path, `${label} has invalid metadata`);
  return {
    protocol: INSTALL_STATE_PROTOCOL,
    core: { version: raw.core.version },
    plugins,
    selection,
    transaction_id: raw.transaction_id,
    applied_at: raw.applied_at,
    ownership_manifest: raw.ownership_manifest,
  };
}

/** The strict protocol 3 reader. Protocol 1 and 2 fail closed with their typed codes. */
export function parseRecordedInstallState(raw: unknown, path: string): RecordedInstallState {
  const current = parseSnapshot(raw, path, 'state');
  const previousRaw = isRecord(raw) ? raw.previous : undefined;
  if (previousRaw === null) return { ...current, previous: null };
  if (!isRecord(previousRaw) || 'previous' in previousRaw) throw invalidInstallState(path, 'has an invalid previous state');
  return { ...current, previous: parseSnapshot(previousRaw, path, 'previous state') };
}

/** The recorded state at the HOME of `env`, or null when the file is absent. */
export function readRecordedInstallState(env: NodeJS.ProcessEnv = process.env): RecordedInstallState | null {
  const path = installProfileStatePath(env);
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  } catch (error) {
    throw invalidInstallState(path, `is not valid JSON (${(error as Error).message})`);
  }
  return parseRecordedInstallState(raw, path);
}
