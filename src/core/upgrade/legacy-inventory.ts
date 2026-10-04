import { createHash } from 'crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { hashManagedTree } from '../../cli/installer/install-profile';
import { isRepoHarnessManagedHookCommand, stripRepoHarnessManagedHooks } from '../adoption/managed-hook-config';
import { isRepoHarnessSourceCheckout } from '../adoption/source-checkout';
import { loadWorkflowContractAsset } from '../adoption/workflow-contract-asset';
import { parseSkillSurfaceCatalog, type SkillSurfacePackage } from '../skill-surface/catalog';

export interface LeftoverItem {
  readonly location: 'project' | 'global';
  readonly surface: 'file' | 'directory' | 'skill' | 'symlink' | 'hook-entry';
  readonly path: string;
  readonly retiredBy: string;
  readonly ownership: 'owned-clean' | 'owned-modified' | 'unowned';
  readonly proof: 'manifest' | 'owner-marker' | 'historical-fingerprint' | 'managed-hook' | null;
  readonly action: 'remove' | 'strip-entry' | 'refresh' | 'report';
  readonly sourcePath?: string;
  readonly expectedSourceHash?: string;
  readonly sourceSurface?: 'canonical-skill' | 'command-facade';
  readonly stateArtifact?: boolean;
  readonly expectedContentHash?: string;
  readonly expectedSymlinkTarget?: string;
  readonly hookEvent?: string;
  readonly hookCommand?: string;
  readonly reason?: string;
}

export interface LegacyInventoryOptions {
  readonly scope: 'project' | 'global' | 'all';
  readonly cwd: string;
  readonly home: string;
  readonly packageRoot: string;
  readonly includeStateArtifacts?: boolean;
}

interface RetirementAction {
  readonly id?: string;
  readonly action?: string;
  readonly ownership?: string;
  readonly location?: 'project' | 'global';
  readonly surface?: LeftoverItem['surface'];
  readonly retiredBy?: string;
  readonly cleanupMode?: string;
  readonly paths?: readonly string[];
  readonly fingerprints?: Readonly<Record<string, string>>;
  readonly historicalFingerprints?: Readonly<Record<string, readonly string[]>>;
  readonly commands?: readonly string[];
  readonly sourcePaths?: Readonly<Record<string, string>>;
}
interface Contract { readonly installedCopyExcludes?: readonly string[]; readonly migrations?: { readonly upgrade?: { readonly actions?: readonly RetirementAction[] } } }
interface ManifestSurface {
  readonly authority?: string;
  readonly removal?: string;
  readonly path?: string;
  readonly type?: string;
  readonly content_hash?: string | null;
  readonly symlink_target?: string | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function hash(bytes: string | Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function stat(path: string): ReturnType<typeof lstatSync> | null {
  try { return lstatSync(path); } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
    throw error;
  }
}

/** Check the authority and all descendants without resolving a symlink. */
export function isLegacyPathSafe(root: string, path: string, allowLeafSymlink = true): boolean {
  const authority = resolve(root);
  const target = resolve(path);
  const rel = relative(authority, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  const rootStat = stat(authority);
  if (rootStat?.isSymbolicLink() || (rootStat && !rootStat.isDirectory())) return false;
  let current = authority;
  const parts = rel.split(sep);
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]!);
    const entry = stat(current);
    if (entry?.isSymbolicLink() && !(allowLeafSymlink && index === parts.length - 1)) return false;
    if (entry && index < parts.length - 1 && !entry.isDirectory()) return false;
  }
  return true;
}

export interface LegacyPathSnapshot {
  readonly kind: 'file' | 'directory' | 'symlink';
  readonly contentHash?: string;
  readonly symlinkTarget?: string;
}
/** Call only after checking the selected root with isLegacyPathSafe. */
export function legacyPathSnapshot(path: string): LegacyPathSnapshot | null {
  const entry = stat(path);
  if (!entry) return null;
  if (entry.isSymbolicLink()) return { kind: 'symlink', symlinkTarget: readlinkSync(path) };
  if (entry.isFile()) return { kind: 'file', contentHash: hash(readFileSync(path)) };
  if (entry.isDirectory()) return { kind: 'directory', contentHash: hashManagedTree(path) };
  return null;
}

function actionsOf(): readonly RetirementAction[] {
  const actions = loadWorkflowContractAsset<Contract>().migrations?.upgrade?.actions ?? [];
  for (const action of actions) {
    if (!['remove', 'refresh'].includes(action.action ?? '') || action.ownership !== 'known_generated') continue;
    const paths = action.paths ?? [];
    if (action.cleanupMode === 'exact_fingerprint') {
      if (new Set(paths).size !== paths.length) throw new Error(`duplicate path in exact-fingerprint migration action ${action.id ?? '<unnamed>'}`);
      for (const path of paths) {
        if (path.includes('*')) throw new Error(`wildcard is not allowed in exact-fingerprint migration action: ${path}`);
        if (action.fingerprints?.[path] === undefined) throw new Error(`missing exact fingerprint for ${path} in migration action ${action.id ?? '<unnamed>'}`);
      }
      for (const path of Object.keys(action.fingerprints ?? {})) {
        if (!paths.includes(path)) throw new Error(`fingerprint declared for undeclared migration path ${path}`);
      }
    }
    for (const digest of [...Object.values(action.fingerprints ?? {}), ...Object.values(action.historicalFingerprints ?? {}).flat()]) {
      if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error(`invalid known-generated fingerprint in ${action.id ?? '<unnamed>'}`);
    }
  }
  return actions;
}

function historicalCommands(actions: readonly RetirementAction[]): Set<string> {
  return new Set(actions.flatMap((action) => action.surface === 'hook-entry' ? [...(action.commands ?? [])] : []));
}

function retiredHook(command: unknown, location: 'project' | 'global', commands: ReadonlySet<string>): command is string {
  if (typeof command !== 'string') return false;
  if (commands.has(command)) return true;
  if (!isRepoHarnessManagedHookCommand(command)) return false;
  // Current user-level typed adapters remain the execution authority.
  return location === 'project' || !command.includes('repo-harness-hook ');
}

export function stripLegacyHookEntries(
  value: unknown,
  options: { readonly location?: 'project' | 'global' } = {},
): { config: Record<string, unknown>; removed: readonly { event: string; command: string }[] } {
  if (!record(value)) throw new Error('hook settings must be a JSON object');
  if (value.hooks === undefined) return { config: { ...value }, removed: [] };
  if (!record(value.hooks)) throw new Error('managed hook config must be an object keyed by event');
  const commands = historicalCommands(actionsOf());
  const location = options.location ?? 'project';
  // Keep the existing merger as the owner of managed-entry removal.
  const managed = location === 'project' ? stripRepoHarnessManagedHooks(value.hooks) : { hooks: value.hooks, removed: [] };
  const hooks: Record<string, unknown> = {};
  const removed: { event: string; command: string }[] = [...managed.removed];
  for (const [event, blocks] of Object.entries(managed.hooks)) {
    if (!Array.isArray(blocks)) { hooks[event] = blocks; continue; }
    const kept: unknown[] = [];
    for (const block of blocks) {
      if (!record(block) || !Array.isArray(block.hooks)) { kept.push(block); continue; }
      const entries = block.hooks.filter((entry: unknown) => {
        const command = record(entry) ? entry.command : undefined;
        if (!retiredHook(command, location, commands)) return true;
        removed.push({ event, command });
        return false;
      });
      if (entries.length > 0) kept.push({ ...block, hooks: entries });
    }
    if (kept.length > 0) hooks[event] = kept;
  }
  const config = { ...value };
  if (Object.keys(hooks).length > 0) config.hooks = hooks;
  else delete config.hooks;
  return { config, removed };
}

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; }
}
function manifestOf(home: string): readonly ManifestSurface[] {
  const path = join(home, '.repo-harness/install-state.json');
  if (!isLegacyPathSafe(home, path, false) || !stat(path)?.isFile()) return [];
  const state = readJson(path);
  if (!record(state) || !Array.isArray(state.ownership_manifest)) return [];
  return state.ownership_manifest.filter((surface: unknown): surface is ManifestSurface => record(surface)
    && surface.authority === 'repo-harness-install-transaction'
    && surface.removal === 'managed-surfaces-only'
    && typeof surface.path === 'string');
}

function classify(
  path: string, snapshot: LegacyPathSnapshot, action: RetirementAction, contractPath: string,
  manifest: readonly ManifestSurface[],
): Pick<LeftoverItem, 'ownership' | 'proof' | 'reason'> {
  const declared = manifest.find((surface) => resolve(surface.path!) === path);
  if (declared) {
    const matches = snapshot.kind === 'symlink'
      ? declared.type === 'symlink' && declared.symlink_target === snapshot.symlinkTarget
      : declared.content_hash === snapshot.contentHash;
    return { ownership: matches ? 'owned-clean' : 'owned-modified', proof: 'manifest', reason: matches ? undefined : 'Install manifest does not match current bytes.' };
  }
  if (snapshot.kind === 'directory') {
    const markerPath = join(path, '.repo-harness-owner.json');
    const markerEntry = stat(markerPath);
    const marker = markerEntry?.isFile() ? readJson(markerPath) : undefined;
    if (record(marker) && marker.owner === 'repo-harness' && ['canonical-skill', 'command-facade'].includes(String(marker.surface)) && typeof marker.content_hash === 'string') {
      const matches = marker.content_hash === snapshot.contentHash;
      return { ownership: matches ? 'owned-clean' : 'owned-modified', proof: 'owner-marker', reason: matches ? undefined : 'Owner marker does not match current tree.' };
    }
    // Tree hashes omit this marker. Unknown marker bytes cannot use a historical proof.
    if (markerEntry) return { ownership: 'unowned', proof: null, reason: 'Owner marker is invalid; preserve the tree.' };
  }
  const fingerprints = [...(action.historicalFingerprints?.[contractPath] ?? []), ...(action.fingerprints?.[contractPath] ? [action.fingerprints[contractPath]!] : [])];
  if (snapshot.contentHash && fingerprints.includes(snapshot.contentHash)) return { ownership: 'owned-clean', proof: 'historical-fingerprint' };
  return { ownership: 'unowned', proof: null, reason: fingerprints.length > 0 ? 'Current bytes do not match the declared retired generated asset.' : 'No ownership proof.' };
}

/** Apply the copy writer's contract filters to its content hash without writes. */
export function projectedManagedTreeHash(source: string): string {
  if (!stat(source)?.isDirectory()) throw new Error(`upgrade source is not a regular directory: ${source}`);
  const excludes = loadWorkflowContractAsset<Contract>().installedCopyExcludes;
  if (!excludes || !excludes.every((pattern) => typeof pattern === 'string')) throw new Error('installed copy exclusions are missing from the workflow contract');
  const patterns = excludes.map((pattern) => ({
    directory: pattern.endsWith('/'),
    basename: !pattern.replace(/\/$/, '').includes('/'),
    glob: new Bun.Glob(`${pattern.replace(/\/$/, '').includes('/') ? '**/' : ''}${pattern.replace(/\/$/, '')}`),
  }));
  const entries: { path: string; type: 'file' | 'symlink' }[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.repo-harness-owner.json') continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (patterns.some((pattern) => (!pattern.directory || entry.isDirectory()) && pattern.glob.match(pattern.basename ? entry.name : path))) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute, path);
      else if (entry.isFile()) entries.push({ path, type: 'file' });
      else if (entry.isSymbolicLink()) entries.push({ path, type: 'symlink' });
      else throw new Error(`unsupported installed-copy source entry: ${path}`);
    }
  };
  walk(source, '');
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const digest = createHash('sha256');
  for (const entry of entries) {
    const path = join(source, entry.path);
    if (entry.type === 'symlink') digest.update(`L\0${entry.path}\0${readlinkSync(path)}\0`);
    else { digest.update(`F\0${entry.path}\0`); digest.update(readFileSync(path)); digest.update('\0'); }
  }
  return `sha256:${digest.digest('hex')}`;
}

/** Revalidate a refresh source against the same copy projection used by staging. */
export function hashUpgradeSource(sourcePath: string, packageRoot: string): string | null {
  const root = resolve(packageRoot);
  const path = resolve(sourcePath);
  if (path === root ? !stat(root)?.isDirectory() : !isLegacyPathSafe(root, path, false)) return null;
  const entry = stat(path);
  if (entry?.isFile()) return hash(readFileSync(path));
  if (entry?.isDirectory()) return projectedManagedTreeHash(path);
  return null;
}

type AddItem = (item: LeftoverItem) => void;

function refreshItem(
  options: LegacyInventoryOptions, location: LeftoverItem['location'], path: string, sourcePath: string,
  action: RetirementAction, contractPath: string, manifest: readonly ManifestSurface[], surface: LeftoverItem['surface'],
  sourceSurface?: LeftoverItem['sourceSurface'],
): LeftoverItem | null {
  const root = location === 'project' ? options.cwd : options.home;
  const base = { location, surface, path, retiredBy: surface === 'skill' ? 'current-package-skill' : action.id ?? 'stale-project-copy' };
  if (!isLegacyPathSafe(root, path)) return { ...base, ownership: 'unowned', proof: null, action: 'report', reason: 'Copy path has a protected symlink or non-directory ancestor.' };
  const snapshot = legacyPathSnapshot(path);
  if (!snapshot) return null;
  const expectedSourceHash = hashUpgradeSource(sourcePath, options.packageRoot);
  if (expectedSourceHash === null || (surface === 'skill' && !stat(sourcePath)?.isDirectory())) return { ...base, ownership: 'unowned', proof: null, action: 'report', reason: 'Package source has a protected symlink or is missing.' };
  // A current source link needs no refresh. No link target is opened here.
  if (snapshot.kind === 'symlink' && resolve(dirname(path), snapshot.symlinkTarget!) === resolve(sourcePath)) return null;
  const ownership = classify(path, snapshot, action, contractPath, manifest);
  if (snapshot.contentHash === expectedSourceHash) {
    // This item also prevents a retired-facade action from removing a current package copy.
    return { ...base, ...ownership, action: 'report',
      reason: ownership.ownership === 'owned-modified' ? ownership.reason : 'Installed copy already matches the current package.' };
  }
  return { ...base, ...ownership,
    action: ownership.ownership === 'owned-clean' ? 'refresh' : 'report',
    sourcePath, sourceSurface, expectedSourceHash,
    expectedContentHash: snapshot.contentHash, expectedSymlinkTarget: snapshot.symlinkTarget,
    reason: ownership.ownership === 'owned-clean' ? 'Refresh an unchanged owned copy from the current package.' : ownership.reason,
  };
}

function currentCatalogPackages(packageRoot: string): readonly SkillSurfacePackage[] {
  const path = join(packageRoot, 'assets/skill-commands/manifest.json');
  if (!isLegacyPathSafe(packageRoot, path, false) || !stat(path)?.isFile()) throw new Error('current package skill catalog is missing or has a protected symlink');
  const parsed = parseSkillSurfaceCatalog(readFileSync(path, 'utf8'), { declared: true });
  if (parsed.status !== 'valid') throw new Error('current package skill catalog is invalid');
  return parsed.catalog.packages.filter((pkg) => pkg.source !== null && pkg.provider === null && pkg.kind !== 'external');
}

function scanInstalledSkills(options: LegacyInventoryOptions, actions: readonly RetirementAction[], manifest: readonly ManifestSurface[], add: AddItem, packages: readonly SkillSurfacePackage[]): void {
  for (const pkg of packages) {
    const sourcePath = resolve(options.packageRoot, pkg.source!);
    for (const host of ['.claude', '.codex', '.agents']) {
      const contractPath = `${host}/skills/${pkg.name}`;
      const path = join(options.home, contractPath);
      const historicalFingerprints = actions.reduce<Record<string, readonly string[]>>((values, action) => {
        if (action.location === 'global' && action.paths?.includes(contractPath)) values[contractPath] = [
          ...(values[contractPath] ?? []), ...(action.historicalFingerprints?.[contractPath] ?? []),
          ...(action.fingerprints?.[contractPath] ? [action.fingerprints[contractPath]!] : []),
        ];
        return values;
      }, {});
      const item = refreshItem(options, 'global', path, sourcePath,
        { id: 'stale-installed-skills', historicalFingerprints }, contractPath, manifest, 'skill',
        pkg.kind === 'facade' ? 'command-facade' : 'canonical-skill');
      if (item && item.reason !== 'Installed copy already matches the current package.') add(item);
    }
  }
}

function scanProjectRefresh(options: LegacyInventoryOptions, actions: readonly RetirementAction[], manifest: readonly ManifestSurface[], add: AddItem): void {
  for (const action of actions) {
    if (action.action !== 'refresh' || action.location !== 'project' || action.ownership !== 'known_generated') continue;
    for (const contractPath of action.paths ?? []) {
      const source = action.sourcePaths?.[contractPath];
      if (!source || isAbsolute(contractPath) || contractPath.split('/').includes('..') || isAbsolute(source) || source.split('/').includes('..')) throw new Error(`unsafe or missing refresh source for ${contractPath}`);
      const item = refreshItem(options, 'project', resolve(options.cwd, contractPath), resolve(options.packageRoot, source), action, contractPath, manifest, 'file');
      if (item && item.reason !== 'Installed copy already matches the current package.') add(item);
    }
  }
}

function scanGlobalDocuments(options: LegacyInventoryOptions, actions: readonly RetirementAction[], add: AddItem, packages: readonly SkillSurfacePackage[]): void {
  const retired = actions.filter((action) => action.action === 'remove');
  const liveNames = new Set(packages.map((pkg) => pkg.name));
  const tokens = [
    ...retired.filter((action) => action.location !== 'global').flatMap((action) => [...(action.paths ?? [])]),
    ...historicalCommands(actions), 'codex@openai-codex',
    ...retired.filter((action) => action.surface === 'skill').flatMap((action) => [...(action.paths ?? [])]).map((path) => path.split('/').at(-1)!).filter((name) => !liveNames.has(name)),
  ].filter((token) => token.length > 0 && !token.includes('*'));
  for (const name of ['.claude/CLAUDE.md', '.codex/AGENTS.md']) {
    const path = join(options.home, name);
    if (!isLegacyPathSafe(options.home, path, false) || !stat(path)?.isFile()) continue;
    const content = readFileSync(path, 'utf8');
    if (tokens.some((token) => content.includes(token))) add({ location: 'global', surface: 'file', path,
      retiredBy: 'retired-global-instructions', ownership: 'unowned', proof: null, action: 'report',
      reason: 'Document contains a retired instruction. Review the lines without automatic edits.' });
  }
}

function scanCodexPlugin(options: LegacyInventoryOptions, add: AddItem): void {
  const id = 'codex@openai-codex';
  const report = (path: string, reason: string): void => add({ location: 'global', surface: 'directory', path,
    retiredBy: id, ownership: 'unowned', proof: null, action: 'report', reason });
  const registryPath = join(options.home, '.claude/plugins/installed_plugins.json');
  if (isLegacyPathSafe(options.home, registryPath, false) && stat(registryPath)?.isFile()) {
    const registry = readJson(registryPath);
    const registrations = record(registry) && record(registry.plugins) ? registry.plugins[id] : undefined;
    if (Array.isArray(registrations)) for (const entry of registrations) {
      if (!record(entry) || typeof entry.installPath !== 'string') continue;
      const path = resolve(entry.installPath);
      report(path, 'Third-party Codex plugin registration. Disable or remove it with the plugin manager.');
    }
  }
  const cache = join(options.home, '.claude/plugins/cache/openai-codex/codex');
  if (isLegacyPathSafe(options.home, cache, false) && stat(cache)?.isDirectory()) {
    for (const version of readdirSync(cache).sort()) {
      const path = join(cache, version);
      if (stat(path)) report(path, 'Third-party Codex plugin cache. Keep it outside owned cleanup.');
    }
  }
  const settings = join(options.home, '.claude/settings.json');
  if (isLegacyPathSafe(options.home, settings, false) && stat(settings)?.isFile()) {
    const value = readJson(settings);
    if (record(value) && record(value.enabledPlugins) && Object.hasOwn(value.enabledPlugins, id)) add({ location: 'global', surface: 'file', path: settings,
      retiredBy: id, ownership: 'unowned', proof: null, action: 'report', reason: 'Third-party Codex plugin has a settings registration. Review it with the plugin manager.' });
  }
}

function versionBefore(value: string, current: string): boolean {
  const parse = (version: string): number[] | null => /^\d+\.\d+\.\d+$/.test(version) ? version.split('.').map(Number) : null;
  const left = parse(value); const right = parse(current);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index]! < right[index]!;
  }
  return false;
}

function scanStateArtifacts(options: LegacyInventoryOptions, manifest: readonly ManifestSurface[], add: AddItem): void {
  const stateRoot = join(options.home, '.repo-harness');
  const packagePath = join(options.packageRoot, 'package.json');
  const pkg = isLegacyPathSafe(options.packageRoot, packagePath, false) ? readJson(packagePath) : undefined;
  const currentVersion = record(pkg) && typeof pkg.version === 'string' ? pkg.version : '';
  const report = (path: string, removableByVersion: boolean, reason: string): void => {
    if (!isLegacyPathSafe(options.home, path)) return;
    const snapshot = legacyPathSnapshot(path);
    if (!snapshot) return;
    const ownership = classify(path, snapshot, { id: 'legacy-state-artifacts' }, '', manifest);
    const remove = options.includeStateArtifacts === true && removableByVersion && ownership.ownership === 'owned-clean';
    add({ location: 'global', surface: snapshot.kind, path, retiredBy: 'legacy-state-artifacts', ...ownership,
      action: remove ? 'remove' : 'report', stateArtifact: true,
      expectedContentHash: snapshot.contentHash, expectedSymlinkTarget: snapshot.symlinkTarget,
      reason: remove ? undefined : ownership.ownership === 'owned-clean' && removableByVersion ? 'State artifact cleanup needs --include-state-artifacts.' : reason });
  };
  const directories = (path: string): readonly string[] => isLegacyPathSafe(options.home, path, false) && stat(path)?.isDirectory() ? readdirSync(path).sort() : [];
  const gates = join(stateRoot, 'gates');
  for (const name of directories(gates)) report(join(gates, name, 'merge-gate.latest.json'), true, 'Retired merge-gate state. No current ownership proof grants removal.');
  const packages = join(stateRoot, 'packages');
  for (const name of directories(packages)) if (/^repo-harness-0\.10\.0-.+\.tgz$/.test(name)) report(join(packages, name), versionBefore('0.10.0', currentVersion), 'Old package archive. Preserve it without verified ownership.');
  const backups = join(stateRoot, 'backups');
  for (const name of directories(backups)) {
    const path = join(backups, name);
    if (!isLegacyPathSafe(options.home, path, false)) { report(path, false, 'Backup has a protected symlink.'); continue; }
    let version = /^pre-(\d+\.\d+\.\d+)-/.exec(name)?.[1];
    if (!version && stat(path)?.isDirectory()) {
      const versionPath = join(path, '.version');
      if (isLegacyPathSafe(options.home, versionPath, false) && stat(versionPath)?.isFile()) version = readFileSync(versionPath, 'utf8').trim();
      const manifestPath = join(path, 'package.json');
      const value = isLegacyPathSafe(options.home, manifestPath, false) && stat(manifestPath)?.isFile() ? readJson(manifestPath) : undefined;
      if (!version && record(value) && typeof value.version === 'string') version = value.version;
    }
    if (!version || versionBefore(version, currentVersion)) report(path, Boolean(version), version ? 'Backup belongs to an older package version. Preserve it without verified ownership.' : 'Backup package version is unknown. Preserve it.');
  }
}

/** Read-only inventory. Only the shipped contract defines retired paths. */
export function planLegacyLeftovers(options: LegacyInventoryOptions): { items: LeftoverItem[] } {
  const actions = actionsOf();
  const manifest = manifestOf(options.home);
  const packages = options.scope === 'project' ? [] : currentCatalogPackages(options.packageRoot);
  const livePaths = new Set(packages.flatMap((pkg) => ['.claude', '.codex', '.agents'].map((host) => `${host}/skills/${pkg.name}`)));
  const hookAction = actions.find((action) => action.surface === 'hook-entry');
  const hookRetirement = `${hookAction?.retiredBy ?? ''} ${hookAction?.id ?? 'retired-host-hook-templates'}`.trim();
  const items = new Map<string, LeftoverItem>();
  const projectEnabled = options.scope !== 'global' && !isRepoHarnessSourceCheckout(options.cwd);
  const add = (item: LeftoverItem): void => {
    const key = `${item.location}:${item.path}:${item.surface}:${item.hookEvent ?? ''}:${item.hookCommand ?? ''}`;
    const old = items.get(key);
    if (!old || item.retiredBy === 'current-package-skill' || (old.action === 'report' && item.action !== 'report')) items.set(key, item);
  };
  for (const action of actions) {
    if (action.action !== 'remove' || action.ownership !== 'known_generated' || action.surface === 'hook-entry') continue;
    const location = action.location ?? 'project';
    if (location === 'project' ? !projectEnabled : options.scope === 'project') continue;
    const root = resolve(location === 'project' ? options.cwd : options.home);
    for (const contractPath of action.paths ?? []) {
      if (contractPath.includes('*') || (location === 'global' && livePaths.has(contractPath))) continue;
      if (isAbsolute(contractPath) || contractPath.includes('\\') || contractPath.split('/').includes('..')) throw new Error(`unsafe legacy inventory path: ${contractPath}`);
      const path = resolve(root, contractPath);
      const base = { location, path, retiredBy: `${action.retiredBy ?? ''} ${action.id ?? 'retired-asset'}`.trim() };
      if (!isLegacyPathSafe(root, path)) {
        add({ ...base, surface: action.surface ?? 'file', ownership: 'unowned', proof: null, action: 'report', reason: 'Path has a protected symlink or non-directory ancestor.' });
        continue;
      }
      const snapshot = legacyPathSnapshot(path);
      if (!snapshot) continue;
      const ownership = classify(path, snapshot, action, contractPath, location === 'global' ? manifest : []);
      add({ ...base, surface: snapshot.kind === 'symlink' ? 'symlink' : snapshot.kind === 'directory' ? (action.surface === 'skill' ? 'skill' : 'directory') : 'file',
        ...ownership, action: ownership.ownership === 'owned-clean' ? 'remove' : 'report',
        expectedContentHash: snapshot.contentHash, expectedSymlinkTarget: snapshot.symlinkTarget });
    }
  }
  for (const location of ['project', 'global'] as const) {
    if (location === 'project' ? !projectEnabled : options.scope === 'project') continue;
    const root = resolve(location === 'project' ? options.cwd : options.home);
    for (const name of ['.claude/settings.json', '.codex/hooks.json']) {
      const path = join(root, name);
      if (!isLegacyPathSafe(root, path, false)) {
        if (stat(dirname(path))) add({ location, surface: 'hook-entry', path, retiredBy: hookRetirement, ownership: 'unowned', proof: null, action: 'report', reason: 'Hook path has a protected symlink ancestor.' });
        continue;
      }
      if (!stat(path)) continue;
      const value = readJson(path);
      if (!record(value) || (value.hooks !== undefined && !record(value.hooks))) {
        add({ location, surface: 'hook-entry', path, retiredBy: hookRetirement, ownership: 'unowned', proof: null, action: 'report', reason: 'Invalid hook settings; preserve current bytes.' });
        continue;
      }
      const stripped = stripLegacyHookEntries(value, { location });
      for (const entry of stripped.removed) add({ location, surface: 'hook-entry', path, retiredBy: hookRetirement, ownership: 'owned-clean', proof: 'managed-hook', action: 'strip-entry', expectedContentHash: hash(readFileSync(path)), hookEvent: entry.event, hookCommand: entry.command });
    }
  }
  if (options.scope !== 'project') {
    for (const name of ['.claude/skills', '.codex/skills', '.agents/skills']) {
      const root = join(resolve(options.home), name);
      if (!isLegacyPathSafe(options.home, root, false) || !stat(root)?.isDirectory()) continue;
      for (const name of readdirSync(root).sort()) {
        const path = join(root, name);
        if (!stat(path)?.isSymbolicLink() || existsSync(path)) continue;
        const target = readlinkSync(path);
        // An older package path is owned only by an exact manifest link record.
        const owned = manifest.some((surface) => resolve(surface.path!) === path && surface.type === 'symlink' && surface.symlink_target === target);
        add({ location: 'global', surface: 'symlink', path, retiredBy: 'dangling-skill-link', ownership: owned ? 'owned-clean' : 'unowned', proof: owned ? 'manifest' : null, action: owned ? 'remove' : 'report', expectedSymlinkTarget: target, reason: owned ? undefined : 'Dangling link has no exact install manifest record.' });
      }
    }
  }
  if (projectEnabled) {
    const retiredPaths = actions.filter((action) => (action.location ?? 'project') === 'project' && action.action === 'remove').flatMap((action) => [...(action.paths ?? [])]).filter((path) => !path.includes('*'));
    const root = resolve(options.cwd);
    const scanDocument = (path: string): void => {
      if (!isLegacyPathSafe(root, path, false) || !stat(path)?.isFile()) return;
      const content = readFileSync(path, 'utf8');
      if (retiredPaths.some((retired) => content.includes(retired))) add({ location: 'project', surface: 'file', path, retiredBy: 'retired-script-reference', ownership: 'unowned', proof: null, action: 'report', reason: 'Document refers to a retired path; review it without automatic edits.' });
    };
    for (const name of ['AGENTS.md', 'CLAUDE.md']) scanDocument(join(root, name));
    const walk = (directory: string): void => {
      if (!isLegacyPathSafe(root, directory, false) || !stat(directory)?.isDirectory()) return;
      for (const name of readdirSync(directory).sort()) {
        const path = join(directory, name);
        const entry = stat(path);
        if (entry?.isDirectory()) walk(path);
        else if (entry?.isFile() && name.endsWith('.md')) scanDocument(path);
      }
    };
    walk(join(root, '.ai'));
  }
  if (projectEnabled) scanProjectRefresh(options, actions, manifest, add);
  if (options.scope !== 'project') {
    scanInstalledSkills(options, actions, manifest, add, packages);
    scanGlobalDocuments(options, actions, add, packages);
    scanCodexPlugin(options, add);
    scanStateArtifacts(options, manifest, add);
  }
  const planned = [...items.values()];
  const liveRefreshPaths = new Set(planned.filter((item) => item.surface === 'skill' && (item.action === 'refresh' || item.retiredBy === 'current-package-skill')).map((item) => item.path));
  const selected = planned.filter((item) => !(item.action === 'remove' && liveRefreshPaths.has(item.path)));
  const preservedSkills = selected.filter((item) => item.surface === 'skill' && item.retiredBy === 'current-package-skill' && item.action === 'report');
  const preserved = selected.map((item) => item.action !== 'report' && preservedSkills.some((skill) => item.path.startsWith(`${skill.path}${sep}`))
    ? { ...item, action: 'report' as const, reason: 'Keep this entry inside an installed skill that cannot be refreshed.' } : item);
  const directories = preserved.filter((item) => ['remove', 'refresh'].includes(item.action) && (item.surface === 'directory' || item.surface === 'skill'));
  // A proved whole tree owns its children. Keep leaves visible when the tree differs.
  const visible = preserved.filter((item) => !directories.some((directory) => directory.location === item.location
    && item.path.startsWith(`${directory.path}${sep}`)));
  return { items: visible.sort((left, right) => `${left.location}:${left.surface}:${left.path}:${left.hookEvent ?? ''}:${left.hookCommand ?? ''}`.localeCompare(`${right.location}:${right.surface}:${right.path}:${right.hookEvent ?? ''}:${right.hookCommand ?? ''}`)) };
}

export function formatLegacyLeftoverSummary(plan: { readonly items: readonly LeftoverItem[] } | readonly LeftoverItem[]): string {
  const items = Array.isArray(plan) ? plan as readonly LeftoverItem[] : (plan as { readonly items: readonly LeftoverItem[] }).items;
  return `${items.length} leftovers (${items.filter((item) => item.action !== 'report').length} removable). Run: repo-harness upgrade`;
}
