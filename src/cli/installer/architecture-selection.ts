import { declareArchitectureAbsent, registerArchitecturePorts, type ArchitecturePorts } from '../../core/architecture/contracts';
import { installSelectionCommand, PLUGIN_IDS, type PluginId } from '../../core/skill-surface/plugin-manifest';
import { enabledPlugins, installProfileStatePath, InstallStateError, readRecordedInstallState } from './install-state';

/**
 * The recorded install selection as one process root reads it, once. No
 * install state is "not selected": a source checkout or a fresh HOME runs
 * core only until `repo-harness install` records a selection.
 */
export type RecordedSelection =
  | { readonly status: 'recorded'; readonly plugins: readonly PluginId[] }
  | { readonly status: 'none' }
  | { readonly status: 'unreadable'; readonly error: InstallStateError };

/**
 * The selection read of a process root. It reads the install-state read model
 * only: the host-path check of the ownership surfaces runs in the installer
 * commands (install, update, doctor, status), not in a hook or command root.
 */
export function readRecordedSelection(env: NodeJS.ProcessEnv = process.env): RecordedSelection {
  try {
    const state = readRecordedInstallState(env);
    return state === null ? { status: 'none' } : { status: 'recorded', plugins: enabledPlugins(state) };
  } catch (error) {
    if (error instanceof InstallStateError) return { status: 'unreadable', error };
    throw error;
  }
}

export function pluginSelected(selection: RecordedSelection, id: PluginId): boolean {
  return selection.status === 'recorded' && selection.plugins.includes(id);
}

/** The recorded plugins; an unreadable selection fails closed with its own error. */
export function recordedPlugins(selection: RecordedSelection): readonly PluginId[] {
  if (selection.status === 'unreadable') throw selection.error;
  return selection.status === 'recorded' ? selection.plugins : [];
}

/** The install command that keeps these plugins and adds `added`; with no recorded state, the default install. */
export function pluginRepair(added: PluginId, plugins: readonly PluginId[] | null): string {
  return plugins === null ? installSelectionCommand('all') : installSelectionCommand(PLUGIN_IDS.filter(id => plugins.includes(id) || id === added));
}

function notSelectedMessage(selection: RecordedSelection, id: PluginId): string {
  return `the ${id} plugin is not selected; run: ${pluginRepair(id, selection.status === 'recorded' ? selection.plugins : null)}`;
}

export type ArchitectureSelectionReport =
  | { readonly status: 'selected'; readonly message: '' }
  | { readonly status: 'not-selected' | 'unreadable'; readonly message: string };

/** The gate outcome with its reason; the shell gate (scripts/lib/architecture-plugin.sh) prints this. */
export function architectureSelectionReport(selection: RecordedSelection): ArchitectureSelectionReport {
  if (pluginSelected(selection, 'architecture')) return { status: 'selected', message: '' };
  if (selection.status === 'unreadable') return { status: 'unreadable', message: `the install selection cannot be read: ${selection.error.message}` };
  return { status: 'not-selected', message: notSelectedMessage(selection, 'architecture') };
}

/** A root that registers no architecture provider records why, so each port reports it. */
export function declareArchitectureSelection(selection: RecordedSelection): void {
  const report = architectureSelectionReport(selection);
  if (report.status === 'selected') return;
  declareArchitectureAbsent(report.status === 'unreadable' ? 'ARCHITECTURE_PROVIDER_UNAVAILABLE' : 'ARCHITECTURE_PLUGIN_NOT_SELECTED', report.message);
}

/**
 * The selection-checked loading of a process entry: `load` imports the
 * providers only for a selected plugin. The caller owns the import, so the
 * plugin edge stays in the entry.
 */
export async function registerSelectedArchitecturePorts(selection: RecordedSelection, load: () => Promise<Partial<ArchitecturePorts>>): Promise<void> {
  if (pluginSelected(selection, 'architecture')) registerArchitecturePorts(await load());
  else declareArchitectureSelection(selection);
}

/** The guard of each plugin command: it runs before any probe or write. */
export function assertPluginCommandSelected(selection: RecordedSelection, id: PluginId, command: string, env: NodeJS.ProcessEnv = process.env): void {
  if (pluginSelected(selection, id)) return;
  if (selection.status === 'unreadable') throw selection.error;
  throw new InstallStateError('install_plugin_unavailable', installProfileStatePath(env), `repo-harness ${command} needs the ${id} plugin: ${notSelectedMessage(selection, id)}`);
}
