// The package's plugin manifest: the closed set of plugin ids and the owner
// vocabulary of every install surface. Pure data and pure functions, so the
// skill catalog, the installer and the shell adapter read one authority.
// Skill packages name their owner in assets/skill-commands/manifest.json; the
// installer maps the other surfaces (Pi registration, CodeGraph projection,
// fleet files, adapters) through `ownerForInstallPath`.

/** Sorted. Each id owns a real install surface (a skill, a host file or a guarded command) or a real host probe today (#1287 step 2). */
export const PLUGIN_IDS = [
  "architecture",
  "cross-review",
  "mcp",
  "operator",
  "peer-runtime",
  "pi",
  "platform",
  "product",
  "strategy-memory",
] as const;
export type PluginId = (typeof PLUGIN_IDS)[number];

/**
 * What the install state records beside its plugin set: `"all"` (every plugin
 * this version ships that the host can run, so `update` adds new ones), or an
 * explicit, sorted id list that never grows by itself (`[]` is core only).
 */
export type PluginSelection = "all" | readonly PluginId[];

export const SURFACE_OWNERS = ["core", ...PLUGIN_IDS] as const;
export type SurfaceOwner = (typeof SURFACE_OWNERS)[number];

/**
 * Plugins whose host program repo-harness does not install. The `all`
 * selection skips one of them while its host program is definitely absent and
 * adds it on a later `update` once the program is present; an explicit
 * selection fails closed instead.
 */
export const HOST_PROGRAM_PLUGINS = ["pi"] as const satisfies readonly PluginId[];

/**
 * Command plugins have no owner probe row. Their commands can run on every
 * target; any provider skill still installs only on its declared hosts.
 */
export const COMMAND_PLUGINS = ["mcp", "operator", "peer-runtime"] as const satisfies readonly PluginId[];

export const OPERATOR_WEB_PACKAGE_NAME = "repo-harness-operator-web";

export function isCommandPlugin(id: PluginId): id is (typeof COMMAND_PLUGINS)[number] {
  return (COMMAND_PLUGINS as readonly PluginId[]).includes(id);
}

export function isHostProgramPlugin(id: PluginId): id is (typeof HOST_PROGRAM_PLUGINS)[number] {
  return (HOST_PROGRAM_PLUGINS as readonly PluginId[]).includes(id);
}

export function isPluginId(value: unknown): value is PluginId {
  return typeof value === "string" && (PLUGIN_IDS as readonly string[]).includes(value);
}

export function isSurfaceOwner(value: unknown): value is SurfaceOwner {
  return typeof value === "string" && (SURFACE_OWNERS as readonly string[]).includes(value);
}

export class UnknownPluginError extends Error {
  readonly code = "install_plugin_unknown";
  constructor(readonly id: string) {
    super(`unknown plugin ${JSON.stringify(id)}; expected one of ${PLUGIN_IDS.join(", ")}`);
    this.name = "UnknownPluginError";
  }
}

/** The one parser of a requested plugin list: unknown ids fail closed; the result is sorted and unique. */
export function parsePluginIds(values: readonly string[]): readonly PluginId[] {
  const ids = new Set<PluginId>();
  for (const value of values) {
    if (!isPluginId(value)) throw new UnknownPluginError(value);
    ids.add(value);
  }
  return PLUGIN_IDS.filter((id) => ids.has(id));
}

/** Parse the `--plugins a,b` value. An empty value is not a selection; `--no-plugins` selects core only. */
export function parsePluginList(value: string): readonly PluginId[] {
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.some((entry) => entry === "")) throw new UnknownPluginError(value);
  return parsePluginIds(entries);
}

export function ownerEnabled(owner: SurfaceOwner, plugins: readonly PluginId[]): boolean {
  return owner === "core" || plugins.includes(owner);
}

/** Refreshes the recorded selection; a recorded `all` gains every plugin that this host can run. */
export const UPDATE_COMMAND = "rh update";

/**
 * The install command that records this selection: `all` stays `all` (a bare
 * install, so the set keeps growing), and a list stays that exact list.
 */
export function installSelectionCommand(selection: PluginSelection): string {
  if (selection === "all") return "rh install";
  return selection.length === 0
    ? "rh install --no-plugins"
    : `rh install --plugins ${selection.join(",")}`;
}

/** `all`, the explicit list, or `(core only)`. */
export function selectionLabel(selection: PluginSelection): string {
  if (selection === "all") return "all";
  return selection.join(",") || "(core only)";
}
