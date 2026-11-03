import { declareArchitectureAbsent, registerArchitecturePorts, type ArchitecturePorts } from '../../core/architecture/contracts';
import type { PluginId } from '../../core/skill-surface/plugin-manifest';
import { architectureRepair, enabledPlugins, installProfileStatePath, InstallStateError, readInstallState } from './install-profile';

/**
 * The recorded install selection as one process root reads it, once. No
 * install state is "not selected": a source checkout or a fresh HOME runs
 * core only until `repo-harness install` records a selection.
 */
export type RecordedSelection =
  | { readonly status: 'recorded'; readonly plugins: readonly PluginId[] }
  | { readonly status: 'none' }
  | { readonly status: 'unreadable'; readonly error: InstallStateError };

export function readRecordedSelection(env: NodeJS.ProcessEnv = process.env): RecordedSelection {
  try {
    const state = readInstallState(env);
    return state === null ? { status: 'none' } : { status: 'recorded', plugins: enabledPlugins(state) };
  } catch (error) {
    if (error instanceof InstallStateError) return { status: 'unreadable', error };
    throw error;
  }
}

export function architectureSelected(selection: RecordedSelection): boolean {
  return selection.status === 'recorded' && selection.plugins.includes('architecture');
}

/** The recorded plugins; an unreadable selection fails closed with its own error. */
export function recordedPlugins(selection: RecordedSelection): readonly PluginId[] {
  if (selection.status === 'unreadable') throw selection.error;
  return selection.status === 'recorded' ? selection.plugins : [];
}

function notSelectedMessage(selection: RecordedSelection): string {
  return `the architecture plugin is not selected; run: ${architectureRepair(selection.status === 'recorded' ? selection.plugins : null)}`;
}

export type ArchitectureSelectionReport =
  | { readonly status: 'selected'; readonly message: '' }
  | { readonly status: 'not-selected' | 'unreadable'; readonly message: string };

/** The gate outcome with its reason; the shell gate (scripts/lib/architecture-plugin.sh) prints this. */
export function architectureSelectionReport(selection: RecordedSelection): ArchitectureSelectionReport {
  if (architectureSelected(selection)) return { status: 'selected', message: '' };
  if (selection.status === 'unreadable') return { status: 'unreadable', message: `the install selection cannot be read: ${selection.error.message}` };
  return { status: 'not-selected', message: notSelectedMessage(selection) };
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
  if (architectureSelected(selection)) registerArchitecturePorts(await load());
  else declareArchitectureSelection(selection);
}

/** The guard of each architecture command: it runs before any probe or write. */
export function assertArchitectureCommandSelected(selection: RecordedSelection, command: string, env: NodeJS.ProcessEnv = process.env): void {
  if (architectureSelected(selection)) return;
  if (selection.status === 'unreadable') throw selection.error;
  throw new InstallStateError('install_plugin_unavailable', installProfileStatePath(env), `repo-harness ${command} needs the architecture plugin: ${notSelectedMessage(selection)}`);
}
