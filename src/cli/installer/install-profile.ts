import { globalConfigurationPath, mutateGlobalConfiguration, restoreGlobalConfiguration } from '../../effects/configuration/global-configuration';
import wazaRules from "../../core/skill-surface/waza-shared-rules.json";
import { bunGlobalPackageRoot, expectedSkillProjections, skillLinkMatches } from './skill-projection';
import { configurationReceiptPath } from './configuration-ownership';
import { globalContextBackupEligible, globalContextPath } from './global-context';
import { acquireRuntimeTransactionLock, assertRuntimeTransactionContext, globalRuntimeScope, runtimeTransactionRoot, type RuntimeTransactionContext, type RuntimeTransactionLock } from '../../effects/locking/runtime-transaction-lock';
import { createHash, randomUUID } from 'crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { basename, delimiter, dirname, join } from 'path';
import {
  MANAGED_TAG,
  canonicalManagedHookProjection,
  compareManagedHookProjection,
  type HookHost,
} from './managed-entries';
import {
  mutationPathSkillNames as catalogMutationPathSkillNames,
  requiredExplicitExternalDependencyInstallGroups,
  validateSkillSurfaceCatalogValue,
  selectionOwnedSkillNames,
  type SkillSurfaceCatalog,
} from '../../core/skill-surface/catalog';
import {
  COMMAND_PLUGINS,
  HOST_PROGRAM_PLUGINS,
  installSelectionCommand,
  UPDATE_COMMAND,
  isCommandPlugin,
  isHostProgramPlugin,
  isSurfaceOwner,
  ownerEnabled,
  PLUGIN_IDS,
  type PluginId,
  type PluginSelection,
  type SurfaceOwner,
} from '../../core/skill-surface/plugin-manifest';
import { hostSkillRoot, providerSkillLock, stagedSkillRoot, syncSkillRoots, type SkillHost } from '../../effects/host-skill-roots';
import { MANAGED_AGENTS } from '../../effects/terminal/task-role-profiles';
import { hashManagedTree, OWNER_MARKER } from '../../effects/managed-tree';
import { piPackagePresent, planPiPackage, removePiPackage, type PiPackageStep } from './pi-package';
import { piExecutable } from '../../effects/pi-executable';
import { capabilitySourceModeFromPolicy } from '../../core/capabilities/resolver';
import skillSurfaceManifest from '../../../assets/skill-commands/manifest.json';
import { version as PACKAGE_VERSION } from '../../../package.json';
import { pluginRepair } from './architecture-selection';
import {
  enabledPlugins,
  INSTALL_STATE_PROTOCOL,
  installProfileStatePath,
  InstallStateError,
  invalidOwnership,
  parseRecordedInstallState,
  readRecordedInstallState,
  type RecordedInstallSnapshot,
  type RecordedInstallState,
} from './install-state';

/**
 * Parses this package's own skill-surface manifest. Not parameterized by
 * env/sourceRoot: install-profile.ts manages installed state at the user's
 * HOME, not a foreign source tree, so its manifest is always the running
 * package's own file. The module system resolves it at build time in a bundle
 * and at load time in source. Fails closed before any caller mutates host
 * state. Deliberately does not pass an `exists` callback for package sources.
 */
export function loadSkillSurfaceCatalog(): SkillSurfaceCatalog {
  const resolution = validateSkillSurfaceCatalogValue(skillSurfaceManifest, { declared: true });
  if (resolution.status !== 'valid') {
    const detail = resolution.diagnostics.map((d) => `${d.code} ${d.path}: ${d.message}`).join('; ');
    throw new Error(`invalid skill-surface catalog assets/skill-commands/manifest.json: ${detail}`);
  }
  return resolution.catalog;
}

export const INSTALL_HOSTS = ['claude', 'codex', 'pi'] as const;
const AGENT_FLEET_FILE = new RegExp(
  `/(?:\\.claude/agents/(?:${MANAGED_AGENTS.join('|')})\\.md|\\.codex/agents/(?:${MANAGED_AGENTS.join('|')})\\.toml)$`,
);

export interface ManagedInstallSurface {
  /** `core`, or the enabled plugin whose selection owns this surface. */
  readonly owner: SurfaceOwner;
  readonly path: string;
  readonly type: 'directory-copy' | 'symlink' | 'managed-file' | 'pi-package';
  readonly authority: 'repo-harness-install-transaction';
  readonly removal: 'managed-surfaces-only';
  readonly content_hash: string | null;
  readonly managed_marker: string | null;
  readonly symlink_target: string | null;
}

/** The recorded state after the host-path check of each ownership surface. */
export interface InstallState extends Omit<RecordedInstallState, 'ownership_manifest' | 'previous'> {
  readonly ownership_manifest: readonly ManagedInstallSurface[];
  readonly previous: InstallStateSnapshot | null;
}

export type InstallStateSnapshot = Omit<InstallState, 'previous'>;

export interface OwnerProbe {
  readonly status: 'present' | 'missing';
  readonly evidence: readonly string[];
  /** The named checks that found no evidence. */
  readonly missing: readonly string[];
}

export interface InstallStateStatus extends InstallState {
  /** `core` and each enabled plugin. */
  readonly probes: Readonly<Partial<Record<SurfaceOwner, OwnerProbe>>>;
  readonly drift: {
    readonly status: 'consistent' | 'drift';
    readonly missing_owners: readonly SurfaceOwner[];
    readonly surface_drift: readonly string[];
  };
}

/** A host plugin that the `all` selection does not run or record, because its host program or target is absent. */
export interface SkippedPlugin {
  readonly id: PluginId;
  readonly reason: string;
  /** The command that adds the plugin after the host program is installed. */
  readonly command: string;
}

/** A recorded host plugin of the `all` selection whose host program or target is now absent. */
export interface KeptPlugin {
  readonly id: PluginId;
  readonly reason: string;
  /** The explicit selection that removes the plugin. */
  readonly command: string;
}

/**
 * The plugin set of a selection on this host. `run` drives the setup steps;
 * `record` is the set that the install state stores. They differ only by the
 * `kept` plugins, whose ledger surfaces stay untouched.
 */
export interface SelectionResolution {
  readonly run: readonly PluginId[];
  readonly record: readonly PluginId[];
  readonly skipped: readonly SkippedPlugin[];
  readonly kept: readonly KeptPlugin[];
  /** Plugins that a complete refresh would add; a partial refresh never grows the recorded set. */
  readonly notAdded: readonly PluginId[];
}

interface HostSurfaceSnapshot {
  readonly path: string;
  readonly existed: boolean;
  readonly backup_path: string | null;
}

export interface InstallHostTransaction {
  readonly protocol: 1;
  readonly backup_root: string;
  readonly snapshots: readonly HostSurfaceSnapshot[];
}

/** What ownership capture reads from a transaction: which paths existed before it, and their backups. */
export type HostSurfaceSnapshots = Pick<InstallHostTransaction, 'snapshots'>;

export interface InstallPlan {
  readonly hosts: typeof INSTALL_HOSTS;
  readonly pi_package: PiPackageStep;
  readonly skill_projections: ReturnType<typeof expectedSkillProjections>;
  readonly protocol: typeof INSTALL_STATE_PROTOCOL;
  readonly selection: PluginSelection;
  readonly requested_plugins: readonly PluginId[];
  readonly current_plugins: readonly PluginId[] | null;
  readonly install: readonly PluginId[];
  readonly keep: readonly PluginId[];
  readonly remove: readonly PluginId[];
  readonly skipped: readonly SkippedPlugin[];
  readonly state_path: string;
}

const CODEGRAPH_CONFIG_MARKER = 'codegraph-config-projection';
/** Markers of records that own one fragment of a shared host configuration file. */
const SECTION_MARKERS: ReadonlySet<string> = new Set([MANAGED_TAG, CODEGRAPH_CONFIG_MARKER]);

function managedAdapterHash(path: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
      hooks?: unknown;
    };
    const projection = canonicalManagedHookProjection(parsed.hooks);
    if (Object.keys(projection).length === 0) return null;
    return `sha256:${createHash('sha256').update(JSON.stringify(projection)).digest('hex')}`;
  } catch {
    return null;
  }
}

export function codegraphProjection(configPath: string, readPath = configPath): string | null {
  try {
    const raw = readFileSync(readPath, 'utf-8');
    if (configPath.endsWith('.toml')) {
      const lines = raw.split(/\r?\n/);
      const start = lines.findIndex((line) => line.trim() === '[mcp_servers.codegraph]');
      if (start < 0) return null;
      let end = start + 1;
      while (end < lines.length && !/^\s*\[/.test(lines[end])) end += 1;
      return `sha256:${createHash('sha256').update(lines.slice(start, end).join('\n').trim()).digest('hex')}`;
    }
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<string, unknown>;
      allowedTools?: unknown[];
    };
    const server = parsed.mcpServers?.codegraph;
    const allowedTools = Array.isArray(parsed.allowedTools)
      ? parsed.allowedTools.filter((entry) => typeof entry === 'string' && entry.toLowerCase().includes('codegraph'))
      : [];
    if (server === undefined && allowedTools.length === 0) return null;
    return `sha256:${createHash('sha256').update(JSON.stringify({ server, allowedTools })).digest('hex')}`;
  } catch {
    return null;
  }
}

function removeCodegraphProjection(path: string): void {
  const raw = readFileSync(path, 'utf-8');
  let next: string;
  if (path.endsWith('.toml')) {
    const lines = raw.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === '[mcp_servers.codegraph]');
    if (start < 0) return;
    let end = start + 1;
    while (end < lines.length && !/^\s*\[/.test(lines[end])) end += 1;
    lines.splice(start, end - start);
    next = lines.join('\n').replace(/^\s+/, '');
  } else {
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<string, unknown>;
      allowedTools?: unknown[];
    };
    if (parsed.mcpServers) delete parsed.mcpServers.codegraph;
    if (Array.isArray(parsed.allowedTools)) {
      parsed.allowedTools = parsed.allowedTools.filter((entry) => (
        typeof entry !== 'string' || !entry.toLowerCase().includes('codegraph')
      ));
    }
    next = `${JSON.stringify(parsed, null, 2)}${raw.endsWith('\n') ? '\n' : ''}`;
  }
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, next, { mode: 0o600 });
  renameSync(temp, path);
}

function adapterHasRequiredProjection(path: string, host: HookHost, env: NodeJS.ProcessEnv): boolean {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { hooks?: unknown };
    const projection = compareManagedHookProjection(parsed.hooks ?? {}, host, env);
    // A selection transition may probe still-present managed routes before the
    // installer rewrites the adapter. Extra routes are tolerated by this
    // presence probe, but any required route field drift, duplicate, or
    // missing route is not.
    return projection.error === undefined && projection.mismatches.every((mismatch) => mismatch.kind === 'unexpected');
  } catch {
    return false;
  }
}

function captureDirectoryOrLink(path: string, owner: SurfaceOwner): ManagedInstallSurface | null {
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    // A pre-existing symlink has no embedded repo-harness ownership proof.
    // Newly created transaction symlinks are captured separately from the
    // before/after transaction snapshots.
    return null;
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
      owner,
      path,
      type: 'directory-copy',
      authority: 'repo-harness-install-transaction',
      removal: 'managed-surfaces-only',
      content_hash: marker.content_hash,
      managed_marker: `${OWNER_MARKER}:owner=repo-harness;surface=${marker.surface}`,
      symlink_target: null,
    };
  } catch {
    return null;
  }
}

function captureManagedFile(path: string): ManagedInstallSurface | null {
  if (!existsSync(path)) return null;
  const contentHash = managedAdapterHash(path);
  if (contentHash === null) return null;
  return {
    owner: 'core',
    path,
    type: 'managed-file',
    authority: 'repo-harness-install-transaction',
    removal: 'managed-surfaces-only',
    content_hash: contentHash,
    managed_marker: MANAGED_TAG,
    symlink_target: null,
  };
}

function captureOwnedPath(path: string, owner: SurfaceOwner): ManagedInstallSurface | null {
  if (!existsSync(path) && !lstatExists(path)) return null;
  const stat = lstatSync(path);
  const base = { owner, path, authority: 'repo-harness-install-transaction' as const, removal: 'managed-surfaces-only' as const };
  if (stat.isSymbolicLink()) {
    return { ...base, type: 'symlink', content_hash: null, managed_marker: null, symlink_target: readlinkSync(path) };
  }
  if (stat.isDirectory()) {
    return { ...base, type: 'directory-copy', content_hash: hashManagedTree(path), managed_marker: 'transaction-created-directory', symlink_target: null };
  }
  if (!stat.isFile()) return null;
  return {
    ...base,
    type: 'managed-file',
    content_hash: `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`,
    managed_marker: 'transaction-created-file',
    symlink_target: null,
  };
}

/**
 * A facade is canonical when the package still ships its source directory,
 * checked through the host's already-synced canonical `repo-harness` skill
 * copy. A name absent from the catalog's facade-kind packages (a fully
 * retired name) is never canonical.
 */
function facadeIsCanonical(root: string, name: string, catalog: SkillSurfaceCatalog): boolean {
  const source = catalog.packages.find((pkg) => pkg.kind === 'facade' && pkg.name === name)?.source;
  return typeof source === 'string' && existsSync(join(root, 'repo-harness', source, 'SKILL.md'));
}

const FACADE_NAME_PREFIX = 'repo-harness-';

const SKILL_HOSTS: readonly SkillHost[] = ['codex', 'claude', 'pi'];

function hostSkillRoots(home: string, env: NodeJS.ProcessEnv = process.env): readonly string[] {
  return SKILL_HOSTS.map((host) => hostSkillRoot(home, host, env));
}

/**
 * The skill hosts that a selection manages. The Pi root is the `pi` plugin's
 * surface, so discovery and probes never read it without `pi`: a copy left
 * there is not evidence and not a record.
 */
function selectedSkillHosts(plugins: readonly PluginId[]): readonly SkillHost[] {
  return SKILL_HOSTS.filter((host) => host !== 'pi' || plugins.includes('pi'));
}

/**
 * Discovery records every owner-marked repo-harness-* directory, including a
 * name that later leaves the catalog. The state reader accepts the same
 * bounded set, so a committed receipt stays readable until removal.
 */
function isDiscoveredFacadePath(path: string, home: string, env: NodeJS.ProcessEnv): boolean {
  const name = basename(path);
  return name.startsWith(FACADE_NAME_PREFIX) && hostSkillRoots(home, env).some((root) => join(root, name) === path);
}

/**
 * The plugin manifest's surface map for paths outside the skill catalog, and
 * the catalog owner for skill paths. The Pi skill root is the `pi` plugin's
 * surface, whatever package it holds. Null means that no selection owns the path.
 */
export function ownerForInstallPath(path: string, env: NodeJS.ProcessEnv = process.env): SurfaceOwner | null {
  const normalized = path.replaceAll('\\', '/');
  const name = normalized.split('/').at(-1) ?? '';
  const home = env.HOME ?? homedir();
  const inSkills = normalized.includes('/skills/');
  if (inSkills && normalized.startsWith(`${hostSkillRoot(home, 'pi', env).replaceAll('\\', '/')}/`)) return 'pi';
  if (name === 'repo-harness' && inSkills) return 'core';
  if (inSkills) {
    const catalog = loadSkillSurfaceCatalog();
    const pkg = catalog.packages.find(entry => entry.name === name);
    if (pkg?.kind === 'facade' || pkg?.kind === 'provider-skill') return pkg.owner;
    if (selectionOwnedSkillNames(catalog).includes(name)) return pkg!.owner;
    const obsidianSelection = requiredExplicitExternalDependencyInstallGroups(catalog, 'obsidian-memory', ['claude', 'codex']);
    if (obsidianSelection.status !== 'selected') {
      throw new Error(`invalid Obsidian dependency selection: ${obsidianSelection.status}:${obsidianSelection.name}`);
    }
    if (obsidianSelection.groups.some(({ skills }) => skills.includes(name))) return pkg!.owner;
  }
  if (AGENT_FLEET_FILE.test(normalized)) return 'core';
  if (wazaRules.files.includes(name) && /\/(?:\.agents|\.codex|\.claude)\/rules\/[^/]+$/.test(normalized)) return 'core';
  if (normalized.endsWith('/bin/codegraph')) return 'architecture';
  if (normalized.endsWith('/bin/repo-harness')) return 'core';
  return null;
}

function discoverManagedSurfaces(
  plugins: readonly PluginId[],
  env: NodeJS.ProcessEnv,
): readonly ManagedInstallSurface[] {
  const home = env.HOME ?? homedir();
  const catalog = loadSkillSurfaceCatalog();
  const surfaces: ManagedInstallSurface[] = [];
  const enabled = (owner: SurfaceOwner | null): owner is SurfaceOwner => owner !== null && ownerEnabled(owner, plugins);
  // A catalog facade can lack the prefix (obsidian-memory). Its copy needs
  // the same marker-based receipt as a prefixed facade copy.
  const facadeNames = new Set(catalog.packages.filter((pkg) => pkg.kind === 'facade').map((pkg) => pkg.name));
  for (const root of selectedSkillHosts(plugins).map((host) => hostSkillRoot(home, host, env))) {
    const canonicalOwner = ownerForInstallPath(join(root, 'repo-harness'), env);
    if (enabled(canonicalOwner)) {
      const canonical = captureDirectoryOrLink(join(root, 'repo-harness'), canonicalOwner);
      if (canonical) surfaces.push(canonical);
    }
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root).filter((entry) => entry.startsWith(FACADE_NAME_PREFIX) || facadeNames.has(entry)).sort()) {
      // A retired facade keeps its receipt under `core` until skill sync removes it; in the Pi root it stays `pi`.
      const owner = facadeIsCanonical(root, name, catalog) || root === hostSkillRoot(home, 'pi', env) ? ownerForInstallPath(join(root, name), env) : 'core';
      if (!enabled(owner)) continue;
      const facade = captureDirectoryOrLink(join(root, name), owner);
      if (facade) surfaces.push(facade);
    }
  }
  const sourceRoot = bunGlobalPackageRoot(env);
  // A matching stable package or staging link is ownership proof. Never
  // acquire an arbitrary link merely because the transaction found it.
  if (sourceRoot !== null) {
    for (const projection of expectedSkillProjections(catalog, sourceRoot, home, plugins, env)) {
      if (!skillLinkMatches(projection.destination, projection.source)) continue;
      const owner = ownerForInstallPath(projection.destination, env);
      if (!enabled(owner)) continue;
      const surface = captureOwnedPath(projection.destination, owner);
      if (surface) surfaces.push(surface);
    }
  }
  for (const file of [join(home, '.codex', 'hooks.json'), join(home, '.claude', 'settings.json')]) {
    const adapter = captureManagedFile(file);
    if (adapter) surfaces.push(adapter);
  }
  return surfaces;
}

function surfaceIsCurrent(surface: ManagedInstallSurface, env: NodeJS.ProcessEnv = process.env): boolean {
  if (surface.type === 'pi-package') {
    try { return piPackagePresent(surface.path, env); } catch { return false; }
  }
  if (!existsSync(surface.path)) return false;
  try {
    const stat = lstatSync(surface.path);
    if (surface.type === 'symlink') {
      return stat.isSymbolicLink() && readlinkSync(surface.path) === surface.symlink_target;
    }
    if (surface.type === 'managed-file') {
      if (!stat.isFile() || surface.content_hash === null) return false;
      if (surface.managed_marker === MANAGED_TAG) {
        return managedAdapterHash(surface.path) === surface.content_hash;
      }
      if (surface.managed_marker === CODEGRAPH_CONFIG_MARKER) {
        return codegraphProjection(surface.path) === surface.content_hash;
      }
      return surface.managed_marker === 'transaction-created-file'
        && `sha256:${createHash('sha256').update(readFileSync(surface.path)).digest('hex')}` === surface.content_hash;
    }
    if (!stat.isDirectory() || surface.content_hash === null || surface.managed_marker === null) return false;
    if (surface.managed_marker === 'transaction-created-directory') {
      return hashManagedTree(surface.path) === surface.content_hash;
    }
    const markerPath = join(surface.path, OWNER_MARKER);
    return existsSync(markerPath)
      && readFileSync(markerPath, 'utf-8').includes('"owner":"repo-harness"')
      && hashManagedTree(surface.path) === surface.content_hash;
  } catch {
    return false;
  }
}

/** Verify one recorded managed surface without requiring unrelated owner probes. */
export function managedInstallSurfaceIsCurrent(surface: Pick<ManagedInstallSurface, 'path' | 'type' | 'content_hash' | 'managed_marker' | 'symlink_target'>, env: NodeJS.ProcessEnv = process.env): boolean {
  return surfaceIsCurrent(surface as ManagedInstallSurface, env);
}

/** Generated agent fleet targets written by scripts/install-agent-fleet.sh. */
function agentFleetTargetPaths(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const home = env.HOME ?? homedir();
  return MANAGED_AGENTS.flatMap((agent) => [
    join(home, '.codex', 'agents', `${agent}.toml`),
    join(home, '.claude', 'agents', `${agent}.md`),
  ]);
}

export function agentFleetUserManagedReceiptPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.HOME ?? homedir(), '.repo-harness', 'agent-fleet-user-managed.json');
}

/**
 * Sole reader of the fleet user-managed receipt that scripts/install-agent-fleet.sh
 * writes. A malformed receipt fails closed as `ok: false`.
 */
export function readAgentFleetUserManagedReceipt(
  env: NodeJS.ProcessEnv = process.env,
): { readonly ok: boolean; readonly hashes: ReadonlyMap<string, string> } {
  const receiptPath = agentFleetUserManagedReceiptPath(env);
  if (!existsSync(receiptPath)) return { ok: true, hashes: new Map() };
  const allowedPaths = new Set(agentFleetTargetPaths(env));
  try {
    const parsed = JSON.parse(readFileSync(receiptPath, 'utf-8'));
    if (
      parsed?.protocol !== 1
      || parsed?.authority !== 'user-managed-agent-fleet'
      || !Array.isArray(parsed.files)
    ) return { ok: false, hashes: new Map() };
    const hashes = new Map<string, string>();
    for (const entry of parsed.files) {
      if (
        !entry
        || typeof entry.path !== 'string'
        || !allowedPaths.has(entry.path)
        || typeof entry.sha256 !== 'string'
        || !/^sha256:[a-f0-9]{64}$/.test(entry.sha256)
        || hashes.has(entry.path)
      ) return { ok: false, hashes: new Map() };
      hashes.set(entry.path, entry.sha256);
    }
    return { ok: true, hashes };
  } catch {
    return { ok: false, hashes: new Map() };
  }
}

/**
 * Fleet files written before ownership tracking, or during an update, are never
 * transaction-created, so a later fleet projection change would report them as
 * drift. Right after a successful fleet run every target is either the generated
 * projection or receipt-accepted user-managed content; only the former is adopted.
 */
function verifiedAgentFleetSurfaces(env: NodeJS.ProcessEnv): readonly ManagedInstallSurface[] {
  const receipt = readAgentFleetUserManagedReceipt(env);
  if (!receipt.ok) return [];
  return agentFleetTargetPaths(env).flatMap((path) => {
    if (!lstatExists(path) || !lstatSync(path).isFile()) return [];
    const hash = `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
    if (receipt.hashes.get(path) === hash) return [];
    const surface = captureOwnedPath(path, 'core');
    return surface ? [surface] : [];
  });
}

/**
 * The one order of every written ownership manifest, so a writer that changes
 * nothing rewrites no bytes and an unchanged check compares like with like.
 */
function canonicalOwnership(surfaces: readonly ManagedInstallSurface[]): ManagedInstallSurface[] {
  return [...surfaces].sort((left, right) => left.path.localeCompare(right.path)
    || left.type.localeCompare(right.type)
    || (left.managed_marker ?? '').localeCompare(right.managed_marker ?? ''));
}

function sameOwnership(left: readonly ManagedInstallSurface[], right: readonly ManagedInstallSurface[]): boolean {
  return JSON.stringify(canonicalOwnership(left)) === JSON.stringify(canonicalOwnership(right));
}

function mergeOwnership(surfaces: readonly ManagedInstallSurface[]): ManagedInstallSurface[] {
  return canonicalOwnership([...new Map(surfaces.map((surface) => [
    `${surface.path}\0${surface.managed_marker ?? surface.type}`,
    surface,
  ])).values()]);
}

/**
 * The ledger that a selection commits: every source (discovery, carried-over
 * records, transaction captures, fleet and Pi package surfaces) passes this one
 * filter, so no surface of a plugin outside `plugins` is recorded.
 */
function selectionOwnership(surfaces: readonly ManagedInstallSurface[], plugins: readonly PluginId[]): ManagedInstallSurface[] {
  return mergeOwnership(surfaces.filter((surface) => ownerEnabled(surface.owner, plugins)));
}

/**
 * The current records that a rebuilt ledger carries: each surface still on
 * disk unchanged, a Pi package registration, and every surface of a kept
 * plugin. A record leaves the ledger only when the projection removed or
 * changed its surface, or `selectionOwnership` drops its owner.
 */
function carriedOwnership(
  current: Pick<InstallState, 'ownership_manifest'> | null,
  env: NodeJS.ProcessEnv,
  kept: readonly PluginId[] = [],
): readonly ManagedInstallSurface[] {
  return (current?.ownership_manifest ?? []).filter((surface) => (
    surface.type === 'pi-package' || (kept as readonly SurfaceOwner[]).includes(surface.owner) || surfaceIsCurrent(surface, env)
  ));
}

/**
 * Update paths run the fleet helper but may never reach applyInstallSelection
 * (partial or in-process reconciliation), so the verified fleet surfaces are
 * merged into the existing ownership manifest right after the helper succeeds.
 * Without installed state there is no manifest to extend.
 */
export function recordVerifiedAgentFleetOwnership(env: NodeJS.ProcessEnv = process.env): void {
  const current = readInstallState(env);
  if (current === null) return;
  const ownershipManifest = mergeOwnership([...current.ownership_manifest, ...verifiedAgentFleetSurfaces(env)]);
  if (sameOwnership(ownershipManifest, current.ownership_manifest)) return;
  writeState({ ...current, ownership_manifest: ownershipManifest }, env);
}

/** Refresh held receipts. Callers must prove ownership of each newly claimed path. */
export function recordRefreshedInstallOwnership(
  paths: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  newlyOwnedPaths: readonly string[] = [],
): void {
  const current = readInstallState(env);
  if (current === null) return;
  const selected = new Set(paths);
  const plugins = enabledPlugins(current);
  const ownershipManifest = current.ownership_manifest.map((surface) => {
    if (!selected.has(surface.path)) return surface;
    // Recapture bytes without requiring or inventing a new owner marker.
    const refreshed = captureOwnedPath(surface.path, surface.owner);
    if (!refreshed || refreshed.type !== surface.type) throw new Error(`cannot refresh install ownership: ${surface.path}`);
    return { ...surface, content_hash: refreshed.content_hash, symlink_target: refreshed.symlink_target };
  });
  for (const path of new Set(newlyOwnedPaths)) {
    if (!selected.has(path)) throw new Error(`new install ownership path is outside this refresh: ${path}`);
    if (ownershipManifest.some((surface) => surface.path === path)) continue;
    const owner = ownerForInstallPath(path, env);
    if (owner === null || !ownerEnabled(owner, plugins)) throw new Error(`no enabled owner for new install ownership: ${path}`);
    const created = captureOwnedPath(path, owner);
    if (!created) throw new Error(`cannot record new install ownership: ${path}`);
    ownershipManifest.push(created);
  }
  if (sameOwnership(ownershipManifest, current.ownership_manifest)) return;
  writeState({ ...current, ...versions(plugins), ownership_manifest: canonicalOwnership(ownershipManifest) }, env);
}

export function recordPiInstallOwnership(surfaces: readonly ManagedInstallSurface[], env: NodeJS.ProcessEnv = process.env, transaction?: HostSurfaceSnapshots): void {
  const current = readInstallState(env);
  if (current === null) {
    if (surfaces.length === 0) return;
    throw new Error('Pi package ownership requires an install state');
  }
  if (surfaces.some(surface => surface.type !== 'pi-package' || !validateManagedSurface(surface, env, enabledPlugins(current)))) throw new Error('invalid Pi package ownership');
  const root = hostSkillRoot(env.HOME ?? homedir(), 'pi', env);
  const skills = transaction
    ? selectionOwnership(transactionOwnedSurfaces(transaction, current, env), enabledPlugins(current)).filter(surface => surface.path.startsWith(root + '/'))
    : [];
  if (surfaces.length === 0 && skills.length === 0) return;
  const ownership = new Map(current.ownership_manifest.map(surface => [`${surface.path}\0${surface.type}`, surface]));
  for (const surface of [...surfaces, ...skills]) ownership.set(`${surface.path}\0${surface.type}`, surface);
  if (sameOwnership([...ownership.values()], current.ownership_manifest)) return;
  writeState({ ...current, ownership_manifest: canonicalOwnership([...ownership.values()]) }, env);
}

/** The Pi package surface that a new registration owns. */
export function piPackageSurface(path: string): ManagedInstallSurface {
  return {
    owner: 'pi', path, type: 'pi-package', authority: 'repo-harness-install-transaction', removal: 'managed-surfaces-only',
    content_hash: null, managed_marker: 'pi-package-source', symlink_target: null,
  };
}

/** Preserve only the external resources that rollback could not remove. */
export function recordUnresolvedPiOwnership(
  selection: PluginSelection,
  plugins: readonly PluginId[],
  surfaces: readonly ManagedInstallSurface[],
  env: NodeJS.ProcessEnv,
  transactionId: string,
): void {
  if (surfaces.length === 0) return;
  const current = readInstallState(env);
  // The state records the attempted selection. Probes still report the
  // missing filesystem surfaces of an incomplete, rolled-back installation.
  const state: InstallState = current ?? {
    protocol: INSTALL_STATE_PROTOCOL, ...versions(plugins), selection,
    transaction_id: transactionId, applied_at: new Date().toISOString(), ownership_manifest: [], previous: null,
  };
  if (surfaces.some(surface => surface.type !== 'pi-package' || !validateManagedSurface(surface, env, enabledPlugins(state)))) throw new Error('invalid Pi rollback ownership');
  const pending = new Map(surfaces.map(surface => [surface.path, surface]));
  const retained = state.ownership_manifest.filter(surface => surface.type !== 'pi-package' || !pending.has(surface.path));
  writeState({ ...state, ownership_manifest: canonicalOwnership([...retained, ...pending.values()]) }, env);
}

/** Candidate processes publish ownership into the same ledger as the parent. */
export function newPiPackagesSinceTransaction(transaction: InstallHostTransaction, env: NodeJS.ProcessEnv): readonly ManagedInstallSurface[] {
  const snapshot = transaction.snapshots.find(entry => entry.path === installProfileStatePath(env));
  const before = snapshot?.existed && snapshot.backup_path
    ? checkedState(parseRecordedInstallState(JSON.parse(readFileSync(snapshot.backup_path, 'utf8')), snapshot.backup_path), snapshot.backup_path, env).ownership_manifest
    : [];
  const sources = new Set(before.filter(surface => surface.type === 'pi-package').map(surface => surface.path));
  const current = readInstallState(env);
  return (current?.ownership_manifest ?? []).filter(surface => surface.type === 'pi-package' && !sources.has(surface.path));
}

/**
 * The mandatory runtime dependencies that repo-harness pins in its package
 * dependencies. Bun hoists them beside the CLI package, so a CLI install
 * rewrites them and a host transaction must restore them with the CLI.
 */
export const ARCHCTX_PACKAGES = ['archctx', 'archctx-contracts'] as const;

export function installProfileHostMutationPaths(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const home = env.HOME ?? homedir();
  const bunRoot = env.BUN_INSTALL ?? join(home, '.bun');
  const { repoHarnessSkills: skills, externalSkills } = catalogMutationPathSkillNames(loadSkillSurfaceCatalog());
  const paths = [
    join(bunRoot, 'bin', 'repo-harness'),
    join(bunRoot, 'bin', 'codegraph'),
    join(bunRoot, 'install', 'global', 'package.json'),
    join(bunRoot, 'install', 'global', 'bun.lock'),
    join(bunRoot, 'install', 'global', 'bun.lockb'),
    join(bunRoot, 'install', 'global', 'node_modules', 'repo-harness'),
    join(bunRoot, 'install', 'global', 'node_modules', '@colbymchenry', 'codegraph'),
    ...ARCHCTX_PACKAGES.map(name => join(bunRoot, 'install', 'global', 'node_modules', name)),
    join(home, '.codex', 'hooks.json'),
    join(home, '.codex', 'config.toml'),
    join(home, '.claude', 'settings.json'),
    join(home, '.claude.json'),
    join(home, '.repo-harness', 'config.json'),
    installProfileStatePath(env),
    configurationReceiptPath(home),
    providerSkillLock(home, env).path,
  ];
  for (const root of hostSkillRoots(home, env)) {
    for (const skill of [...skills, ...externalSkills]) paths.push(join(root, skill));
  }
  for (const skill of externalSkills) {
    paths.push(join(stagedSkillRoot(home), skill));
  }
  for (const rule of wazaRules.files) {
    paths.push(
      join(home, '.agents', 'rules', rule),
      join(home, '.codex', 'rules', rule),
      join(home, '.claude', 'rules', rule),
    );
  }
  paths.push(...agentFleetTargetPaths(env));
  // Install and update rewrite the managed Global Working Rules block. A path
  // whose copy would fail (unreadable or special file) stays out of the
  // backup; the rules plan skips that file and never writes it.
  for (const host of ['codex', 'claude'] as const) {
    const path = globalContextPath(home, host);
    if (globalContextBackupEligible(path)) paths.push(path);
  }
  return [...new Set(paths)];
}

/**
 * The skill roots that scripts/sync-codex-installed-copies.sh writes for a
 * selection. The shell reads the same syncSkillRoots result from
 * skill-surface-select.ts.
 */
export function effectiveSkillRoots(plugins: readonly PluginId[], env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const roots = syncSkillRoots(env, env.HOME ?? homedir(), plugins);
  return [roots.codex, roots.claude, roots.pi].filter((root): root is string => root !== null);
}

/**
 * Skill sync also retires repo-harness-* facades and owned dangling links
 * that the current catalog does not name. A host transaction snapshots that
 * full set before sync runs.
 */
export function installProfileTransactionPaths(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const { repoHarnessSkills } = catalogMutationPathSkillNames(loadSkillSurfaceCatalog());
  const paths = [...installProfileHostMutationPaths(env)];
  // The snapshot covers every root that any selection's sync can write.
  for (const root of effectiveSkillRoots(PLUGIN_IDS, env)) {
    for (const skill of repoHarnessSkills) paths.push(join(root, skill));
    // Follow a linked root, as the shell's [[ -d ]] test does.
    if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) continue;
    for (const name of readdirSync(root)) {
      const path = join(root, name);
      if (name.startsWith(FACADE_NAME_PREFIX) || (lstatSync(path).isSymbolicLink() && !existsSync(path))) paths.push(path);
    }
  }
  return [...new Set(paths)];
}

const transactionLocks = new WeakMap<InstallHostTransaction, { context: RuntimeTransactionContext; owned: RuntimeTransactionLock | undefined }>();

export function beginInstallHostTransaction(
  paths: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  options: { readonly retainBackup?: boolean; readonly runtimeLock?: RuntimeTransactionContext } = {},
): InstallHostTransaction {
  const scope = globalRuntimeScope(env);
  const containsConfig = paths.includes(globalConfigurationPath(env)) || paths.includes(join(scope.root, '.repo-harness', 'config.json'));
  let owned: RuntimeTransactionLock | undefined;
  const context = containsConfig ? options.runtimeLock ?? (owned = acquireRuntimeTransactionLock(scope)) : options.runtimeLock;
  try {
    if (context) assertRuntimeTransactionContext(context, scope);
    if (containsConfig) mutateGlobalConfiguration(env, () => ({ value: undefined }), { runtimeLock: context });
    const transactionRoot = runtimeTransactionRoot(scope);
    mkdirSync(transactionRoot, { recursive: true });
    const backupRoot = mkdtempSync(join(transactionRoot, 'install-'));
    try {
      const snapshots = [...new Set(paths)].map((path, index): HostSurfaceSnapshot => {
        if (!existsSync(path) && !lstatExists(path)) return { path, existed: false, backup_path: null };
        const backupPath = join(backupRoot, String(index));
        cpSync(path, backupPath, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
        return { path, existed: true, backup_path: backupPath };
      });
      const transaction: InstallHostTransaction = { protocol: 1, backup_root: backupRoot, snapshots };
      if (context) transactionLocks.set(transaction, { context, owned });
      if (options.retainBackup === true) {
        writeFileSync(join(backupRoot, 'manifest.json'), `${JSON.stringify(transaction, null, 2)}\n`, { mode: 0o600 });
      }
      return transaction;
    } catch (error) {
      rmSync(backupRoot, { recursive: true, force: true });
      throw error;
    }
  } catch (error) {
    owned?.release();
    throw error;
  }
}

function isGlobalConfigurationSnapshot(path: string): boolean {
  return path.replaceAll('\\', '/').endsWith('/.repo-harness/config.json');
}

function assertTransactionLock(transaction: InstallHostTransaction, context?: RuntimeTransactionContext): void {
  const held = transactionLocks.get(transaction)?.context ?? context;
  if (held) {
    assertRuntimeTransactionContext(held, held.scope);
    for (const snapshot of transaction.snapshots) {
      if (isGlobalConfigurationSnapshot(snapshot.path)) assertRuntimeTransactionContext(held, process.platform === 'win32' ? globalRuntimeScope() : { kind: 'global', root: dirname(dirname(snapshot.path)) });
    }
    return;
  }
  if (transaction.snapshots.some(snapshot => isGlobalConfigurationSnapshot(snapshot.path))) {
    throw new Error('configuration rollback requires its original runtime transaction context');
  }
}

function lstatExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function rollbackInstallHostTransaction(
  transaction: InstallHostTransaction,
  options: { readonly retainBackup?: boolean; readonly runtimeLock?: RuntimeTransactionContext;
    readonly unresolvedPi?: { readonly selection: PluginSelection; readonly plugins: readonly PluginId[]; readonly surfaces: readonly ManagedInstallSurface[]; readonly env: NodeJS.ProcessEnv } } = {},
): void {
  assertTransactionLock(transaction, options.runtimeLock);
  try {
    const failures: string[] = [];
    const unresolved = options.unresolvedPi;
    if (unresolved?.surfaces.length) {
      try {
        writeFileSync(join(transaction.backup_root, 'pi-ownership.json'), JSON.stringify({ protocol: 1,
          transaction_id: basename(transaction.backup_root), plugins: unresolved.plugins, ownership_manifest: unresolved.surfaces }), { mode: 0o600 });
      } catch (error) { failures.push(`Pi recovery record: ${String((error as Error).message ?? error)}`); }
    }
    for (const snapshot of [...transaction.snapshots].reverse()) {
      try {
        if (isGlobalConfigurationSnapshot(snapshot.path)) {
          const context = transactionLocks.get(transaction)?.context ?? options.runtimeLock;
          if (!context) throw new Error('configuration rollback lost its runtime transaction context');
          restoreGlobalConfiguration(snapshot.path, snapshot.existed && snapshot.backup_path !== null ? readFileSync(snapshot.backup_path) : null, context);
          continue;
        }
        // A path under a regular file cannot exist, so an absent snapshot there is already restored.
        if (!snapshot.existed && lstatSync(dirname(snapshot.path), { throwIfNoEntry: false })?.isFile()) continue;
        rmSync(snapshot.path, { recursive: true, force: true });
        if (snapshot.existed && snapshot.backup_path !== null) {
          mkdirSync(dirname(snapshot.path), { recursive: true });
          cpSync(snapshot.backup_path, snapshot.path, {
            recursive: true,
            force: false,
            errorOnExist: true,
            verbatimSymlinks: true,
          });
        }
      } catch (error) {
        failures.push(`${snapshot.path}: ${String((error as Error).message ?? error)}`);
      }
    }
    if (unresolved?.surfaces.length) {
      try { recordUnresolvedPiOwnership(unresolved.selection, unresolved.plugins, unresolved.surfaces, unresolved.env, basename(transaction.backup_root)); }
      catch (error) { failures.push(`Pi ownership could not be restored to the ledger; recovery transaction ${transaction.backup_root}: ${String((error as Error).message ?? error)}`); }
    }
    if (failures.length === 0 && options.retainBackup !== true) {
      rmSync(transaction.backup_root, { recursive: true, force: true });
    }
    if (failures.length > 0) throw new Error(`install transaction compensation failed:\n${failures.join('\n')}`);
  } finally {
    transactionLocks.get(transaction)?.owned?.release();
    transactionLocks.delete(transaction);
  }
}

export function commitInstallHostTransaction(transaction: InstallHostTransaction): void {
  assertTransactionLock(transaction);
  rmSync(transaction.backup_root, { recursive: true, force: true });
  transactionLocks.get(transaction)?.owned?.release();
  transactionLocks.delete(transaction);
}

/**
 * The Pi skill-root paths of a refresh, with their existence before it. The
 * candidate process takes them before its setup and records the Pi skill-root
 * receipts itself; it has no backups, and none of these paths needs one.
 */
export function piSkillRootSnapshots(env: NodeJS.ProcessEnv = process.env): HostSurfaceSnapshots {
  const root = `${hostSkillRoot(env.HOME ?? homedir(), 'pi', env)}/`;
  return {
    snapshots: installProfileTransactionPaths(env)
      .filter(path => path.startsWith(root))
      .map(path => ({ path, existed: existsSync(path) || lstatExists(path), backup_path: null })),
  };
}

function transactionOwnedSurfaces(
  transaction: HostSurfaceSnapshots,
  previous: Pick<InstallState, 'ownership_manifest'> | null,
  env: NodeJS.ProcessEnv,
): readonly ManagedInstallSurface[] {
  return transaction.snapshots.flatMap((snapshot) => {
    const normalized = snapshot.path.replaceAll('\\', '/');
    if (
      normalized.endsWith('/.codex/config.toml')
      || normalized.endsWith('/.claude.json')
      || normalized.endsWith('/.claude/settings.json')
    ) {
      const before = snapshot.existed && snapshot.backup_path
        ? codegraphProjection(snapshot.path, snapshot.backup_path)
        : null;
      const after = codegraphProjection(snapshot.path);
      const previouslyOwned = before !== null && previous?.ownership_manifest.some((surface) => (
        surface.path === snapshot.path
        && surface.managed_marker === CODEGRAPH_CONFIG_MARKER
        && surface.content_hash === before
      ));
      if ((before === null || previouslyOwned) && after !== null) {
        return [{
          owner: 'architecture' as const,
          path: snapshot.path,
          type: 'managed-file' as const,
          authority: 'repo-harness-install-transaction' as const,
          removal: 'managed-surfaces-only' as const,
          content_hash: after,
          managed_marker: CODEGRAPH_CONFIG_MARKER,
          symlink_target: null,
        }];
      }
    }
    if (snapshot.existed) {
      // A section record (CodeGraph MCP config, managed hook entries) owns a fragment of a shared
      // file, never the whole file. Only a whole-path record is recaptured.
      const previousSurface = previous?.ownership_manifest.find((surface) => (
        surface.path === snapshot.path && !SECTION_MARKERS.has(surface.managed_marker ?? '')
      ));
      if (previousSurface === undefined) return [];
      const refreshed = captureOwnedPath(snapshot.path, previousSurface.owner);
      return refreshed ? [refreshed] : [];
    }
    const owner = ownerForInstallPath(snapshot.path, env);
    if (owner === null) return [];
    const surface = captureOwnedPath(snapshot.path, owner);
    return surface ? [surface] : [];
  });
}

function removeOwnedSkillLockEntries(env: NodeJS.ProcessEnv, skillNames: ReadonlySet<string>): void {
  if (skillNames.size === 0) return;
  const lockPath = providerSkillLock(env.HOME ?? homedir(), env).path;
  if (!existsSync(lockPath)) return;
  const parsed = JSON.parse(readFileSync(lockPath, 'utf-8')) as { skills?: Record<string, unknown> };
  if (!parsed || typeof parsed !== 'object' || !parsed.skills || typeof parsed.skills !== 'object') {
    throw new Error(`invalid external skill lock: ${lockPath}`);
  }
  for (const name of skillNames) delete parsed.skills[name];
  const temp = `${lockPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, lockPath);
}

/** Remove the owned surfaces of each plugin that the target selection drops. A changed surface stops the switch. */
function removeRetiredOwnedSurfaces(
  plugins: readonly PluginId[],
  current: Pick<InstallState, 'ownership_manifest'>,
  env: NodeJS.ProcessEnv,
): readonly string[] {
  const retired = current.ownership_manifest.filter((surface) => !ownerEnabled(surface.owner, plugins));
  const unique = [...new Map(retired.map((surface) => [surface.path, surface])).values()];
  for (const surface of unique) {
    if (surface.type !== 'pi-package' && !surfaceIsCurrent(surface, env)) {
      throw new Error(`refusing plugin switch because managed surface drifted: ${surface.path}`);
    }
  }
  const ownedSkills = new Set(selectionOwnedSkillNames(loadSkillSurfaceCatalog()));
  const removedSkills = new Set<string>();
  for (const surface of unique) {
    if (surface.type === 'pi-package') {
      // Only a registration that this install created is in the ledger.
      removePiPackage(surface.path, env);
      continue;
    }
    const normalized = surface.path.replaceAll('\\', '/');
    const name = normalized.split('/').at(-1) ?? '';
    if (ownedSkills.has(name) && normalized.includes('/.agents/skills/')) removedSkills.add(name);
    if (surface.managed_marker === CODEGRAPH_CONFIG_MARKER) removeCodegraphProjection(surface.path);
    else rmSync(surface.path, { recursive: true, force: true });
  }
  removeOwnedSkillLockEntries(env, removedSkills);
  return unique.map(({ path }) => path);
}

export function prepareInstallSelectionSwitch(
  plugins: readonly PluginId[],
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const current = readInstallState(env);
  if (!current) return [];
  return removeRetiredOwnedSurfaces(plugins, current, env);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The path allowlist, type and hash shape of a recorded ownership surface. */
function validSurfaceShape(raw: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
  if (raw.type === 'pi-package') {
    return raw.authority === 'repo-harness-install-transaction' && raw.removal === 'managed-surfaces-only'
      && raw.path === bunGlobalPackageRoot(env) && raw.managed_marker === 'pi-package-source'
      && raw.content_hash === null && raw.symlink_target === null;
  }
  const allowedPaths = new Set(installProfileHostMutationPaths(env));
  return (
    raw.authority === 'repo-harness-install-transaction'
    && raw.removal === 'managed-surfaces-only'
    && typeof raw.path === 'string'
    && (allowedPaths.has(raw.path) || isDiscoveredFacadePath(raw.path, env.HOME ?? homedir(), env))
    && ['directory-copy', 'symlink', 'managed-file'].includes(String(raw.type))
    && (raw.content_hash === null || typeof raw.content_hash === 'string')
    && (raw.managed_marker === null || typeof raw.managed_marker === 'string')
    && (raw.symlink_target === null || typeof raw.symlink_target === 'string')
    && (raw.type === 'symlink'
      ? raw.symlink_target !== null && raw.content_hash === null && raw.managed_marker === null
      : raw.symlink_target === null && typeof raw.content_hash === 'string' && typeof raw.managed_marker === 'string')
  );
}

const SURFACE_KEYS = ['authority', 'content_hash', 'managed_marker', 'owner', 'path', 'removal', 'symlink_target', 'type'].join(',');

function validateManagedSurface(raw: unknown, env: NodeJS.ProcessEnv, plugins: readonly PluginId[]): raw is ManagedInstallSurface {
  if (!isRecord(raw) || Object.keys(raw).sort().join(',') !== SURFACE_KEYS) return false;
  if (!isSurfaceOwner(raw.owner) || !ownerEnabled(raw.owner, plugins)) return false;
  if (raw.type === 'pi-package' && raw.owner !== 'pi') return false;
  return validSurfaceShape(raw, env);
}

/** The host-path check of each ownership surface, against the plugins of the same snapshot. */
function checkedSurfaces(snapshot: RecordedInstallSnapshot, path: string, env: NodeJS.ProcessEnv): readonly ManagedInstallSurface[] {
  const plugins = enabledPlugins(snapshot);
  const surfaces = snapshot.ownership_manifest;
  if (!surfaces.every((surface): surface is ManagedInstallSurface => validateManagedSurface(surface, env, plugins))) throw invalidOwnership(path);
  return surfaces;
}

/** The read model's state with each ownership surface checked; the installer commands read state only through this. */
function checkedState(recorded: RecordedInstallState, path: string, env: NodeJS.ProcessEnv): InstallState {
  const previous = recorded.previous === null ? null : { ...recorded.previous, ownership_manifest: checkedSurfaces(recorded.previous, path, env) };
  return { ...recorded, ownership_manifest: checkedSurfaces(recorded, path, env), previous };
}

export function readInstallState(env: NodeJS.ProcessEnv = process.env): InstallState | null {
  const recorded = readRecordedInstallState(env);
  return recorded === null ? null : checkedState(recorded, installProfileStatePath(env), env);
}

/** `update` resolves the recorded selection; without a state it has none. */
export function requireInstallState(env: NodeJS.ProcessEnv = process.env): InstallState {
  const state = readInstallState(env);
  if (state === null) {
    const path = installProfileStatePath(env);
    throw new InstallStateError('install_state_missing', path, `no install state at ${path}; run: repo-harness install`);
  }
  return state;
}

function existing(paths: readonly string[]): string[] {
  return paths.filter((path) => existsSync(path));
}

function canonicalEvidence(home: string, hosts: readonly SkillHost[], relativePaths: readonly string[], env: NodeJS.ProcessEnv): string[] {
  return existing(hosts.flatMap((host) => relativePaths.map((relative) => join(hostSkillRoot(home, host, env), 'repo-harness', relative))));
}

function executableEvidence(name: string, env: NodeJS.ProcessEnv): string[] {
  const home = env.HOME ?? homedir();
  const bunRoot = env.BUN_INSTALL ?? join(home, '.bun');
  const candidates = [join(bunRoot, 'bin', name)];
  for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) candidates.push(join(directory, name));
  return existing([...new Set(candidates)]);
}

/** The facades and provider skills that an owner's probe requires. */
function ownedProbeSkills(catalog: SkillSurfaceCatalog, owner: SurfaceOwner) {
  return catalog.packages.filter(pkg => (pkg.kind === 'facade' || pkg.kind === 'provider-skill') && pkg.owner === owner && !pkg.explicitOnly);
}

/**
 * Each host root requires the owned skills that list its host. The set is
 * present when one root holds its non-empty required set completely.
 */
function completeHostSkillSetEvidence(home: string, hosts: readonly SkillHost[], packages: ReturnType<typeof ownedProbeSkills>, env: NodeJS.ProcessEnv): string[] {
  for (const host of hosts) {
    const root = hostSkillRoot(home, host, env);
    const paths = packages.filter(pkg => pkg.hosts.includes(host)).map(pkg => join(root, pkg.name, 'SKILL.md'));
    if (paths.length > 0 && paths.every(existsSync)) return paths;
  }
  return [];
}

function completeAgentFleetEvidence(home: string): string[] {
  for (const [root, extension] of [[join(home, '.codex', 'agents'), '.toml'], [join(home, '.claude', 'agents'), '.md']] as const) {
    const paths = MANAGED_AGENTS.map((agent) => join(root, `${agent}${extension}`));
    if (paths.every(existsSync)) return paths;
  }
  return [];
}

function probe(checks: Readonly<Record<string, readonly string[]>>): OwnerProbe {
  const missing = Object.entries(checks).filter(([, evidence]) => evidence.length === 0).map(([name]) => name);
  return { status: missing.length === 0 ? 'present' : 'missing', evidence: Object.values(checks).flat(), missing };
}

function allOrNone(home: string, hosts: readonly SkillHost[], relativePaths: readonly string[], env: NodeJS.ProcessEnv): string[] {
  const evidence = canonicalEvidence(home, hosts, relativePaths, env);
  return relativePaths.every((relative) => evidence.some((path) => path.endsWith(relative))) ? evidence : [];
}

function probeCore(env: NodeJS.ProcessEnv, catalog: SkillSurfaceCatalog, hosts: readonly SkillHost[]): OwnerProbe {
  const home = env.HOME ?? homedir();
  const adapters = ([
    { path: join(home, '.codex', 'hooks.json'), host: 'codex' },
    { path: join(home, '.claude', 'settings.json'), host: 'claude' },
  ] as const).filter(({ path, host }) => existsSync(path) && adapterHasRequiredProjection(path, host, env)).map(({ path }) => path);
  const fleet = completeAgentFleetEvidence(home);
  const coreFacades = ownedProbeSkills(catalog, 'core').filter(pkg => pkg.kind === 'facade');
  return probe({
    'cli': executableEvidence('repo-harness', env),
    'effective-state': canonicalEvidence(home, hosts, ['src/cli/commands/state.ts'], env),
    // The mutation guard is an in-process handler bundled in the canonical copy.
    'guards': allOrNone(home, hosts, ['src/cli/hook/mutation-guard.ts', 'scripts/contract-worktree.sh'], env),
    'handoff': canonicalEvidence(home, hosts, ['references/handoff.md'], env),
    'host-adapters': adapters,
    'workflow': canonicalEvidence(home, hosts, ['src/core/workflow/profile.ts'], env),
    'core-skills': completeHostSkillSetEvidence(home, hosts, coreFacades, env),
    'agent-fleet': fleet,
    'verifier': fleet.some((path) => /\/gatekeeper\.(?:toml|md)$/.test(path))
      ? canonicalEvidence(home, hosts, ['src/effects/review-runner/task-oar-host.ts'], env)
      : [],
    'release-gates': allOrNone(home, hosts, ['scripts/verify-sprint.sh', 'scripts/ship-worktrees.sh'], env),
  });
}

/** The Pi plugin's real state: the `pi` executable and its user package entry for this package. A failed `pi list` throws. */
function probePi(env: NodeJS.ProcessEnv): OwnerProbe {
  const source = bunGlobalPackageRoot(env);
  if (piExecutable(env) === null || source === null) return { status: 'missing', evidence: [], missing: ['pi-executable'] };
  return probe({ 'pi-package': piPackagePresent(source, env) ? [source] : [] });
}

function probeOwners(plugins: readonly PluginId[], env: NodeJS.ProcessEnv): Partial<Record<SurfaceOwner, OwnerProbe>> {
  const home = env.HOME ?? homedir();
  const catalog = loadSkillSurfaceCatalog();
  const hosts = selectedSkillHosts(plugins);
  const probes: Partial<Record<SurfaceOwner, OwnerProbe>> = { core: probeCore(env, catalog, hosts) };
  for (const id of plugins) {
    if (isCommandPlugin(id)) continue;
    if (id === 'pi') probes.pi = probePi(env);
    else probes[id] = probe({ skills: completeHostSkillSetEvidence(home, hosts, ownedProbeSkills(catalog, id), env) });
  }
  return probes;
}

export function installStateStatus(
  state: InstallState,
  env: NodeJS.ProcessEnv = process.env,
): InstallStateStatus {
  const probes = probeOwners(enabledPlugins(state), env);
  const missing = (Object.entries(probes) as [SurfaceOwner, OwnerProbe][])
    .filter(([, result]) => result.status === 'missing')
    .map(([owner]) => owner);
  // A valid selection may consume a pre-existing user-managed CLI, skill, or
  // CodeGraph installation. Ownership is required before removal, not before
  // truthful presence can be reported.
  const surfaceDrift = state.ownership_manifest
    .filter(surface => surface.type !== 'pi-package' || piExecutable(env) !== null)
    .filter((surface) => !surfaceIsCurrent(surface, env))
    .map((surface) => surface.path);
  return {
    ...state,
    probes,
    drift: {
      status: missing.length === 0 && surfaceDrift.length === 0 ? 'consistent' : 'drift',
      missing_owners: missing,
      surface_drift: surfaceDrift,
    },
  };
}

/** Why a host plugin cannot be selected now, or null when its host program is present. Other read errors throw. */
function hostPluginAbsence(_id: (typeof HOST_PROGRAM_PLUGINS)[number], env: NodeJS.ProcessEnv): string | null {
  return piExecutable(env) === null ? 'pi is not on PATH' : null;
}

type InstallTarget = 'claude' | 'codex' | 'both';

const TARGET_HOSTS: Readonly<Record<InstallTarget, readonly SkillHost[]>> = { claude: ['claude'], codex: ['codex'], both: ['claude', 'codex', 'pi'] };
const TARGET_BOTH_COMMAND = 'repo-harness install --target both';

/**
 * Why this target cannot run a plugin now, and the command that adds it, or
 * null. The target must hold a host of one of the plugin's skills (for `pi`,
 * the Pi host), and a host plugin needs its program. A read error other than
 * a definite absence throws.
 */
function pluginUnavailable(id: PluginId, target: InstallTarget, env: NodeJS.ProcessEnv): { readonly reason: string; readonly command: string } | null {
  if (isCommandPlugin(id)) return null;
  if (id === 'pi' && target !== 'both') return { reason: `--target ${target} does not include the Pi host`, command: TARGET_BOTH_COMMAND };
  const skills = ownedProbeSkills(loadSkillSurfaceCatalog(), id);
  if (skills.length > 0 && !skills.some(pkg => pkg.hosts.some(host => (TARGET_HOSTS[target] as readonly string[]).includes(host)))) {
    return { reason: `--target ${target} has no host for its skills`, command: TARGET_BOTH_COMMAND };
  }
  const absence = isHostProgramPlugin(id) ? hostPluginAbsence(id, env) : null;
  return absence === null ? null : { reason: absence, command: UPDATE_COMMAND };
}

/** An explicit plugin fails closed before any write when its host program or a host of its skills is absent. */
export function assertExplicitSelectionRunnable(plugins: readonly PluginId[], target: InstallTarget, env: NodeJS.ProcessEnv = process.env): void {
  const unavailable = plugins.flatMap((id) => {
    const absent = pluginUnavailable(id, target, env);
    return absent === null ? [] : [`${id} (${absent.reason})`];
  });
  if (unavailable.length > 0) {
    throw new InstallStateError('install_plugin_unavailable', installProfileStatePath(env),
      `cannot select ${unavailable.join(', ')}; install the host program or choose a target with its host, or drop the plugin from --plugins`);
  }
}

/**
 * The one resolver of a selection on this host, for install, update and the
 * candidate process. An explicit list runs and records exactly its ids or
 * fails closed. `all` runs and records every plugin of this version; a host
 * plugin whose program or target is absent is skipped, or kept in the record
 * when the state already records it (removal needs an explicit selection).
 */
export function resolveRecordedSelection(
  state: Pick<InstallState, 'selection' | 'plugins'>,
  target: InstallTarget,
  env: NodeJS.ProcessEnv = process.env,
  options: { readonly partial?: boolean } = {},
): SelectionResolution {
  if (state.selection !== 'all') {
    assertExplicitSelectionRunnable(state.selection, target, env);
    return { run: state.selection, record: state.selection, skipped: [], kept: [], notAdded: [] };
  }
  const recorded = enabledPlugins(state);
  const run: PluginId[] = [];
  const keptReasons = new Map<PluginId, string>();
  const skipped: SkippedPlugin[] = [];
  for (const id of PLUGIN_IDS) {
    const absent = pluginUnavailable(id, target, env);
    if (absent === null) run.push(id);
    else if (recorded.includes(id)) keptReasons.set(id, absent.reason);
    else skipped.push({ id, ...absent });
  }
  const grown = PLUGIN_IDS.filter(id => run.includes(id) || keptReasons.has(id));
  // A partial refresh (--no-sync-skill or --no-hooks) runs and records only the recorded set.
  const record = options.partial === true ? grown.filter(id => recorded.includes(id)) : grown;
  const kept = [...keptReasons].map(([id, reason]) => ({ id, reason, command: installSelectionCommand(record.filter(other => other !== id)) }));
  return {
    run: run.filter(id => record.includes(id)), record, skipped, kept,
    notAdded: grown.filter(id => !record.includes(id)),
  };
}

/** A fresh `all` selection: every plugin that the host can run. */
export function defaultPluginSelection(target: InstallTarget, env: NodeJS.ProcessEnv = process.env): { readonly plugins: readonly PluginId[]; readonly skipped: readonly SkippedPlugin[] } {
  const { run, skipped } = resolveRecordedSelection({ selection: 'all', plugins: [] }, target, env);
  return { plugins: run, skipped };
}

export function skippedPluginLine(entry: SkippedPlugin): string {
  const after = entry.command === UPDATE_COMMAND ? 'install the host program, then run' : 'run';
  return `skipped ${entry.id}: ${entry.reason}; to add it later, ${after}: ${entry.command}`;
}

export function keptPluginLine(entry: KeptPlugin): string {
  return `kept ${entry.id}: ${entry.reason}; update keeps the recorded plugin; to remove it, run: ${entry.command}`;
}

export function notAddedPluginLine(id: PluginId): string {
  return `not added ${id} in a partial refresh; run: ${UPDATE_COMMAND}`;
}

/** The O3 repair of an explicit list: one command for every unselected command plugin, because a second command would drop the first id. */
export function commandPluginRepairLines(selection: PluginSelection): string[] {
  if (selection === 'all') return [];
  const missing = COMMAND_PLUGINS.filter(id => !selection.includes(id));
  if (missing.length === 0) return [];
  const repair = installSelectionCommand(PLUGIN_IDS.filter(id => selection.includes(id) || isCommandPlugin(id)));
  return [`[plugins] not selected ${missing.join(', ')}: an explicit list does not grow; to add them, run: ${repair}`];
}

/**
 * A repository whose policy sets `context.capability_source: archcontext` or
 * `tooling.codegraph.enabled: true` needs the architecture plugin. update,
 * install and init stop here before any write when the selection lacks it.
 */
export function assertArchitecturePolicySelection(cwd: string, plugins: readonly PluginId[], env: NodeJS.ProcessEnv = process.env): void {
  if (plugins.includes('architecture')) return;
  const policyPath = join(cwd, '.ai/harness/policy.json');
  let raw: string;
  try {
    raw = readFileSync(policyPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const policy = JSON.parse(raw) as { tooling?: { codegraph?: { enabled?: unknown } } };
  const needs = [
    ...(capabilitySourceModeFromPolicy(policy) === 'archcontext' ? ['context.capability_source: archcontext'] : []),
    ...(policy.tooling?.codegraph?.enabled === true ? ['tooling.codegraph.enabled: true'] : []),
  ];
  if (needs.length === 0) return;
  throw new InstallStateError('install_plugin_unavailable', installProfileStatePath(env),
    `${policyPath} sets ${needs.join(' and ')}, which needs the architecture plugin; run: ${pluginRepair('architecture', plugins)}`);
}

/** `run` drives the Pi package and skill projections; `record` is the plugin set that the plan installs, keeps and removes. */
export function planInstallSelection(
  selection: PluginSelection,
  resolved: Pick<SelectionResolution, 'run' | 'record'> & { readonly skipped?: readonly SkippedPlugin[] },
  current: InstallState | null,
  env: NodeJS.ProcessEnv = process.env,
): InstallPlan {
  const packageRoot = bunGlobalPackageRoot(env);
  if (packageRoot === null) throw new Error('Bun global package root unavailable: set HOME, USERPROFILE or BUN_INSTALL');
  const installed = current === null ? [] : enabledPlugins(current);
  const plugins = resolved.record;
  return {
    hosts: INSTALL_HOSTS,
    pi_package: planPiPackage(packageRoot, resolved.run.includes('pi'), env),
    skill_projections: expectedSkillProjections(loadSkillSurfaceCatalog(), packageRoot, env.HOME ?? env.USERPROFILE ?? homedir(), resolved.run, env),
    protocol: INSTALL_STATE_PROTOCOL,
    selection,
    requested_plugins: plugins,
    current_plugins: current === null ? null : installed,
    install: plugins.filter((id) => !installed.includes(id)),
    keep: plugins.filter((id) => installed.includes(id)),
    remove: installed.filter((id) => !plugins.includes(id)),
    skipped: resolved.skipped ?? [],
    state_path: installProfileStatePath(env),
  };
}

function writeState(state: InstallState, env: NodeJS.ProcessEnv): void {
  const target = installProfileStatePath(env);
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, target);
}

/** Core and every enabled plugin record the running package version until plugins ship separately (#1287 step 4). */
export function versions(plugins: readonly PluginId[]): Pick<InstallState, 'core' | 'plugins'> {
  return { core: { version: PACKAGE_VERSION }, plugins: plugins.map(id => ({ id, version: PACKAGE_VERSION })) };
}

function snapshot(state: InstallState): InstallStateSnapshot {
  const { previous: _previous, ...rest } = state;
  return rest;
}

/**
 * Commit a selection. `plugins` is the recorded set (`record` of the resolver).
 * A `kept` plugin is recorded but did not run: its ledger surfaces stay as
 * they are, and neither its probe nor its surfaces gate this commit.
 */
export function applyInstallSelection(
  selection: PluginSelection,
  plugins: readonly PluginId[],
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
  transaction?: HostSurfaceSnapshots,
  options: {
    readonly agentFleetVerified?: boolean;
    readonly additionalSurfaces?: readonly ManagedInstallSurface[];
    readonly kept?: readonly PluginId[];
  } = {},
): { readonly plan: InstallPlan; readonly state: InstallState } {
  if (selection !== 'all' && selection.join(',') !== plugins.join(',')) {
    throw new Error(`explicit selection ${selection.join(',')} does not equal the recorded plugins ${plugins.join(',')}`);
  }
  const kept = options.kept ?? [];
  const ran = plugins.filter(id => !kept.includes(id));
  const current = readInstallState(env);
  if (options.additionalSurfaces?.some(surface => surface.type !== 'pi-package' || !validateManagedSurface(surface, env, plugins))) throw new Error('invalid Pi package ownership');
  const plan = planInstallSelection(selection, { run: ran, record: plugins }, current, env);
  const discovered = discoverManagedSurfaces(ran, env);
  const preserved = carriedOwnership(current, env, kept);
  const transactionOwned = transaction ? transactionOwnedSurfaces(transaction, current, env) : [];
  const fleetOwned = options.agentFleetVerified === true ? verifiedAgentFleetSurfaces(env) : [];
  // Current verified link projections own their classification. Historical
  // records must not restore a retired owner.
  const ownershipManifest = selectionOwnership([...discovered, ...preserved, ...transactionOwned, ...fleetOwned,
    ...(options.additionalSurfaces ?? []), ...discovered.filter(surface => surface.type === 'symlink')], plugins);
  const recordedVersions = versions(plugins);
  const unchanged = current !== null
    && JSON.stringify({ core: current.core, plugins: current.plugins }) === JSON.stringify(recordedVersions)
    && JSON.stringify(current.selection) === JSON.stringify(selection)
    && sameOwnership(current.ownership_manifest, ownershipManifest);
  const state: InstallState = {
    protocol: INSTALL_STATE_PROTOCOL,
    ...recordedVersions,
    selection,
    transaction_id: randomUUID(),
    applied_at: now.toISOString(),
    ownership_manifest: ownershipManifest,
    previous: current === null ? null : snapshot(current),
  };
  const status = installStateStatus({
    ...state,
    plugins: state.plugins.filter(plugin => !kept.includes(plugin.id)),
    ownership_manifest: ownershipManifest.filter(surface => !(kept as readonly SurfaceOwner[]).includes(surface.owner)),
  }, env);
  if (status.drift.status !== 'consistent') {
    throw new Error(
      `install projection is incomplete: missing=${status.drift.missing_owners.map(owner => `${owner}(${status.probes[owner]?.missing.join('+')})`).join(',') || '(none)'}; surface_drift=${status.drift.surface_drift.join(',') || '(none)'}`,
    );
  }
  // A no-change apply writes nothing, so `previous` keeps the last real change for a rollback.
  if (unchanged) return { plan, state: current };
  writeState(state, env);
  return { plan, state };
}

export function rollbackInstallSelection(
  env: NodeJS.ProcessEnv = process.env,
  transaction?: InstallHostTransaction,
): InstallState {
  const current = readInstallState(env);
  if (!current?.previous) throw new Error('no previous install transaction to roll back');
  const plugins = enabledPlugins(current.previous);
  const restored: InstallState = {
    ...current.previous,
    ...versions(plugins),
    transaction_id: randomUUID(),
    applied_at: new Date().toISOString(),
    ownership_manifest: selectionOwnership([
      ...discoverManagedSurfaces(plugins, env),
      ...carriedOwnership(current, env),
      ...(transaction ? transactionOwnedSurfaces(transaction, current.previous, env) : []),
    ], plugins),
    previous: null,
  };
  const status = installStateStatus(restored, env);
  if (status.drift.status !== 'consistent') {
    throw new Error(
      `rollback projection is incomplete: missing=${status.drift.missing_owners.map(owner => `${owner}(${status.probes[owner]?.missing.join('+')})`).join(',') || '(none)'}; surface_drift=${status.drift.surface_drift.join(',') || '(none)'}`,
    );
  }
  writeState(restored, env);
  return restored;
}
