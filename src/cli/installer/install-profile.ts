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
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { delimiter, dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { buildManagedHooks, isManagedEntry, type HookHost, type HooksByEvent } from './managed-entries';
import {
  mutationPathSkillNames as catalogMutationPathSkillNames,
  parseSkillSurfaceCatalog,
  probeExpectations as catalogProbeExpectations,
  profileOwnedSkillNames as catalogProfileOwnedSkillNames,
  type SkillSurfaceCatalog,
} from '../../core/skill-surface/catalog';
import { PROFILE_COMPONENTS, type InstallComponent } from '../../core/skill-surface/profile-components';

const SKILL_SURFACE_MANIFEST_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..',
  'assets', 'skill-commands', 'manifest.json',
);

/**
 * Reads and parses this package's own bundled skill-surface manifest. Not
 * parameterized by env/sourceRoot: install-profile.ts manages installed
 * state at the user's HOME, not a foreign source tree, so its manifest is
 * always the currently-running package's own file, resolved relative to this
 * module's own location. Fails closed before any caller mutates host state.
 * Deliberately does not pass an `exists` callback for package sources (this
 * call site's pre-catalog behavior never checked package source paths on
 * disk either), so behavior stays byte-identical to the literals it
 * replaces. Called lazily (never at module load) so importing this module
 * never has a filesystem side effect on its own.
 */
function loadSkillSurfaceCatalog(): SkillSurfaceCatalog {
  const source = existsSync(SKILL_SURFACE_MANIFEST_PATH)
    ? readFileSync(SKILL_SURFACE_MANIFEST_PATH, 'utf-8')
    : null;
  const resolution = parseSkillSurfaceCatalog(source, {
    declared: true,
    profileComponents: PROFILE_COMPONENTS,
  });
  if (resolution.status !== 'valid') {
    const detail = resolution.diagnostics.map((d) => `${d.code} ${d.path}: ${d.message}`).join('; ');
    throw new Error(`invalid skill-surface catalog at ${SKILL_SURFACE_MANIFEST_PATH}: ${detail}`);
  }
  return resolution.catalog;
}

export const INSTALL_PROFILES = ['minimal', 'standard', 'product-planning', 'strict'] as const;
export type InstallProfile = (typeof INSTALL_PROFILES)[number];

// InstallComponent and PROFILE_COMPONENTS now live in
// src/core/skill-surface/profile-components.ts (the pure catalog core owns
// the single source of truth for the crossref mapping); re-exported here
// unchanged, at their former definition site, so every existing
// `from '../installer/install-profile'` import keeps working.
export type { InstallComponent };
export { PROFILE_COMPONENTS };

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
  readonly component_probes: Readonly<Record<InstallComponent, {
    readonly status: 'present' | 'missing';
    readonly evidence: readonly string[];
  }>>;
  readonly drift: {
    readonly status: 'consistent' | 'drift';
    readonly missing_components: readonly InstallComponent[];
    readonly unexpected_components: readonly InstallComponent[];
    readonly ownership_gaps: readonly InstallComponent[];
    readonly surface_drift: readonly string[];
  };
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
const CODEGRAPH_CONFIG_MARKER = 'codegraph-config-projection';

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

function codegraphProjection(configPath: string, readPath = configPath): string | null {
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

function adapterHasRequiredProjection(path: string, host: HookHost, profile: InstallProfile): boolean {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { hooks?: HooksByEvent };
    const actual = parsed.hooks ?? {};
    const expected = buildManagedHooks(host, profile);
    return Object.entries(expected).every(([event, entries]) => {
      const managedActual = (actual[event] ?? []).filter(isManagedEntry);
      return entries.every((entry) => managedActual.some((candidate) => (
        JSON.stringify(candidate) === JSON.stringify(entry)
      )));
    });
  } catch {
    return false;
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

function captureOwnedPath(
  path: string,
  components: readonly InstallComponent[],
): ManagedInstallSurface | null {
  if (components.length === 0 || (!existsSync(path) && !lstatExists(path))) return null;
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
  if (stat.isDirectory()) {
    return {
      components,
      authority: 'repo-harness-install-transaction',
      removal: 'managed-surfaces-only',
      path,
      type: 'directory-copy',
      content_hash: hashManagedTree(path),
      managed_marker: 'transaction-created-directory',
      symlink_target: null,
    };
  }
  if (!stat.isFile()) return null;
  return {
    components,
    authority: 'repo-harness-install-transaction',
    removal: 'managed-surfaces-only',
    path,
    type: 'managed-file',
    content_hash: `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`,
    managed_marker: 'transaction-created-file',
    symlink_target: null,
  };
}

/**
 * A facade is canonical when the package still ships its source directory,
 * checked through the host's already-synced canonical `repo-harness` skill
 * copy (the same evidence source `canonicalEvidence` uses elsewhere in this
 * file). A host-present, owner-marked facade whose canonical source has
 * been retired from the package gets an empty component set in
 * discoverManagedSurfaces below instead of being folded into the generic
 * adaptive-workflow/planning-integrations bucket, so the ownership manifest
 * stops representing a retired facade as a profile-desired surface.
 *
 * Resolves the expected source path from the manifest-derived catalog
 * (facade-kind packages no longer all live under one fixed
 * assets/skill-commands/<name> parent -- e.g. repo-harness-plan sources from
 * assets/skills/repo-harness-plan) rather than assuming a fixed parent
 * directory. A name absent from the catalog's facade-kind packages (a fully
 * retired name, e.g. a stale repo-harness-handoff left over from an older
 * install) is never canonical.
 */
function facadeIsCanonical(root: string, name: string, catalog: SkillSurfaceCatalog): boolean {
  const source = catalog.packages.find((pkg) => pkg.kind === 'facade' && pkg.name === name)?.source;
  return typeof source === 'string' && existsSync(join(root, 'repo-harness', source, 'SKILL.md'));
}

function discoverManagedSurfaces(
  profile: InstallProfile,
  env: NodeJS.ProcessEnv,
): readonly ManagedInstallSurface[] {
  const home = env.HOME ?? homedir();
  const desired = PROFILE_COMPONENTS[profile];
  const catalog = loadSkillSurfaceCatalog();
  const runtimeComponents = desired.filter((component) => [
    'effective-state',
    'scope-worktree-check-guards',
    'handoff',
    'adaptive-workflow',
    'codegraph-conditional',
    'release-deployment-gates',
  ].includes(component));
  const surfaces: ManagedInstallSurface[] = [];
  for (const root of [join(home, '.codex', 'skills'), join(home, '.claude', 'skills')]) {
    const canonical = captureDirectoryOrLink(join(root, 'repo-harness'), runtimeComponents);
    if (canonical) surfaces.push(canonical);
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root).filter((entry) => entry.startsWith('repo-harness-')).sort()) {
      // repo-harness-handoff retired as a facade (SSD-06): 'handoff' is now
      // fulfilled by the root router's own references/handoff.md rather than
      // a separately discoverable Skill. A stale repo-harness-handoff dir
      // left over from an older install falls through to the generic
      // canonical check below, which correctly reports it uncanonical (its
      // assets/skill-commands/repo-harness-handoff source no longer exists)
      // and empties its component set.
      const facadeComponents = name === 'repo-harness-check'
        ? desired.filter((component) => component === 'scope-worktree-check-guards' || component === 'verifier')
        : name === 'repo-harness-ship'
          ? desired.filter((component) => component === 'release-deployment-gates')
          : facadeIsCanonical(root, name, catalog)
            ? desired.filter((component) => component === 'adaptive-workflow' || component === 'planning-integrations')
            : [];
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
      if (!stat.isFile() || surface.content_hash === null) return false;
      if (surface.managed_marker === MANAGED_HOOK_MARKER) {
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

export function assertInstallProfile(value: string): InstallProfile {
  if (!INSTALL_PROFILES.includes(value as InstallProfile)) {
    throw new Error(`invalid install profile ${value}; expected ${INSTALL_PROFILES.join('|')}`);
  }
  return value as InstallProfile;
}

export function installProfileStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.HOME ?? homedir(), '.repo-harness', 'install-state.json');
}

export function installProfileHostMutationPaths(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const home = env.HOME ?? homedir();
  const bunRoot = env.BUN_INSTALL ?? join(home, '.bun');
  const { repoHarnessSkills: skills, externalSkills } = catalogMutationPathSkillNames(loadSkillSurfaceCatalog());
  const agents = ['explorer', 'deep-reasoner', 'fast-worker', 'gatekeeper', 'root-cause-prover', 'harness-evaluator'];
  const paths = [
    join(bunRoot, 'bin', 'repo-harness'),
    join(bunRoot, 'bin', 'codegraph'),
    join(bunRoot, 'install', 'global', 'package.json'),
    join(bunRoot, 'install', 'global', 'bun.lock'),
    join(bunRoot, 'install', 'global', 'bun.lockb'),
    join(bunRoot, 'install', 'global', 'node_modules', 'repo-harness'),
    join(bunRoot, 'install', 'global', 'node_modules', '@colbymchenry', 'codegraph'),
    join(home, '.codex', 'hooks.json'),
    join(home, '.codex', 'config.toml'),
    join(home, '.claude', 'settings.json'),
    join(home, '.claude.json'),
    join(home, '.repo-harness', 'config.json'),
    installProfileStatePath(env),
    join(home, '.agents', '.skill-lock.json'),
  ];
  for (const host of ['.codex', '.claude']) {
    for (const skill of [...skills, ...externalSkills]) paths.push(join(home, host, 'skills', skill));
  }
  for (const skill of externalSkills) {
    paths.push(join(home, '.agents', 'skills', skill));
  }
  for (const rule of ['anti-patterns.md', 'chinese.md', 'durable-context.md', 'english.md']) {
    paths.push(
      join(home, '.agents', 'rules', rule),
      join(home, '.codex', 'rules', rule),
      join(home, '.claude', 'rules', rule),
    );
  }
  for (const agent of agents) {
    paths.push(join(home, '.codex', 'agents', `${agent}.toml`), join(home, '.claude', 'agents', `${agent}.md`));
  }
  return [...new Set(paths)];
}

export function beginInstallHostTransaction(
  paths: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): InstallHostTransaction {
  const transactionRoot = join(env.HOME ?? homedir(), '.repo-harness', 'transactions');
  mkdirSync(transactionRoot, { recursive: true });
  const backupRoot = mkdtempSync(join(transactionRoot, 'install-'));
  try {
    const snapshots = [...new Set(paths)].map((path, index): HostSurfaceSnapshot => {
      if (!existsSync(path) && !lstatExists(path)) return { path, existed: false, backup_path: null };
      const backupPath = join(backupRoot, String(index));
      cpSync(path, backupPath, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
      return { path, existed: true, backup_path: backupPath };
    });
    return { protocol: 1, backup_root: backupRoot, snapshots };
  } catch (error) {
    rmSync(backupRoot, { recursive: true, force: true });
    throw error;
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

export function rollbackInstallHostTransaction(transaction: InstallHostTransaction): void {
  const failures: string[] = [];
  for (const snapshot of [...transaction.snapshots].reverse()) {
    try {
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
  rmSync(transaction.backup_root, { recursive: true, force: true });
  if (failures.length > 0) throw new Error(`install transaction compensation failed:\n${failures.join('\n')}`);
}

export function commitInstallHostTransaction(transaction: InstallHostTransaction): void {
  rmSync(transaction.backup_root, { recursive: true, force: true });
}

/** Lazy (never evaluated at module load) so importing this module has no filesystem side effect. */
function profileOwnedSkillsSet(): ReadonlySet<string> {
  return new Set(catalogProfileOwnedSkillNames(loadSkillSurfaceCatalog()));
}

function componentsForTransactionPath(path: string): readonly InstallComponent[] {
  const normalized = path.replaceAll('\\', '/');
  const name = normalized.split('/').at(-1) ?? '';
  const ownedSkills = profileOwnedSkillsSet();
  if (ownedSkills.has(name) && normalized.includes('/skills/')) {
    const crossModelSkills = catalogProbeExpectations(loadSkillSurfaceCatalog()).crossModel;
    return crossModelSkills.includes(name)
      ? ['cross-model-acceptance']
      : ['planning-integrations'];
  }
  if (/\/(?:\.codex|\.claude)\/agents\/(?:explorer|deep-reasoner|fast-worker|gatekeeper|root-cause-prover|harness-evaluator)\.(?:toml|md)$/.test(normalized)) {
    return name.startsWith('gatekeeper.') ? ['agent-fleet', 'verifier'] : ['agent-fleet'];
  }
  if (/\/(?:\.agents|\.codex|\.claude)\/rules\/(?:anti-patterns|chinese|durable-context|english)\.md$/.test(normalized)) {
    return ['planning-integrations'];
  }
  if (normalized.endsWith('/bin/codegraph')) return ['codegraph-conditional'];
  if (normalized.endsWith('/bin/repo-harness')) return ['cli'];
  return [];
}

function transactionOwnedSurfaces(
  transaction: InstallHostTransaction,
  previous: Pick<InstalledProfileState, 'ownership_manifest'> | null = null,
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
          components: ['codegraph-conditional'],
          authority: 'repo-harness-install-transaction' as const,
          removal: 'managed-surfaces-only' as const,
          path: snapshot.path,
          type: 'managed-file' as const,
          content_hash: after,
          managed_marker: CODEGRAPH_CONFIG_MARKER,
          symlink_target: null,
        }];
      }
    }
    if (snapshot.existed) return [];
    const surface = captureOwnedPath(snapshot.path, componentsForTransactionPath(snapshot.path));
    return surface ? [surface] : [];
  });
}

function removeOwnedSkillLockEntries(home: string, skillNames: ReadonlySet<string>): void {
  if (skillNames.size === 0) return;
  const lockPath = join(home, '.agents', '.skill-lock.json');
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

export function prepareInstallProfileSwitch(
  profile: InstallProfile,
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const current = readInstalledProfile(env);
  if (!current || current.profile === profile) return [];
  const desired = new Set(PROFILE_COMPONENTS[profile]);
  const retired = current.ownership_manifest.filter((surface) => (
    surface.components.length > 0 && surface.components.every((component) => !desired.has(component))
  ));
  const unique = [...new Map(retired.map((surface) => [surface.path, surface])).values()];
  for (const surface of unique) {
    if (!surfaceIsCurrent(surface)) {
      throw new Error(`refusing profile switch because managed surface drifted: ${surface.path}`);
    }
  }
  const removedSkills = new Set<string>();
  for (const surface of unique) {
    const normalized = surface.path.replaceAll('\\', '/');
    const name = normalized.split('/').at(-1) ?? '';
    if (profileOwnedSkillsSet().has(name) && normalized.includes('/.agents/skills/')) removedSkills.add(name);
    if (surface.managed_marker === CODEGRAPH_CONFIG_MARKER) removeCodegraphProjection(surface.path);
    else rmSync(surface.path, { recursive: true, force: true });
  }
  removeOwnedSkillLockEntries(env.HOME ?? homedir(), removedSkills);
  return unique.map(({ path }) => path);
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
  if (!Array.isArray(parsed.components)) {
    throw new Error(`installed profile state has invalid components; rerun repo-harness install --profile <profile>: ${path}`);
  }
  if (typeof parsed.transaction_id !== 'string' || typeof parsed.applied_at !== 'string') {
    throw new Error(`installed profile state has invalid metadata; rerun repo-harness install --profile <profile>: ${path}`);
  }
  const isLegacyManifest = (manifest: readonly unknown[]): boolean => manifest.length > 0 && manifest.every((rawEntry) => {
    const entry = rawEntry as Record<string, unknown>;
    return (
    typeof entry.component === 'string'
    && entry.authority === 'repo-harness-install-transaction'
    && entry.removal === 'managed-surfaces-only'
    && entry.path === undefined
    );
  });
  const invalidComponents = (profile: InstallProfile, components: readonly InstallComponent[]): boolean => {
    const expected = PROFILE_COMPONENTS[profile];
    return components.length !== expected.length
      || components.some((component, index) => component !== expected[index]);
  };
  const allowedPaths = new Set(installProfileHostMutationPaths(env));
  const invalidSurface = (surface: ManagedInstallSurface): boolean => (
    !Array.isArray(surface.components)
    || surface.components.some((component: unknown) => !ALL_COMPONENTS.includes(component as InstallComponent))
    || surface.authority !== 'repo-harness-install-transaction'
    || surface.removal !== 'managed-surfaces-only'
    || typeof surface.path !== 'string'
    || !allowedPaths.has(surface.path)
    || !['directory-copy', 'symlink', 'managed-file'].includes(surface.type)
    || (surface.content_hash !== null && typeof surface.content_hash !== 'string')
    || (surface.managed_marker !== null && typeof surface.managed_marker !== 'string')
    || (surface.symlink_target !== null && typeof surface.symlink_target !== 'string')
    || (surface.type === 'symlink'
      ? surface.symlink_target === null || surface.content_hash !== null || surface.managed_marker !== null
      : surface.symlink_target !== null || surface.content_hash === null || surface.managed_marker === null)
  );
  const normalizedPrevious = (() => {
    if (parsed.previous === null) return null;
    const previous = parsed.previous;
    if (
      typeof previous !== 'object'
      || Array.isArray(previous)
      || previous.protocol !== 1
      || !INSTALL_PROFILES.includes(previous.profile)
      || !Array.isArray(previous.components)
      || typeof previous.transaction_id !== 'string'
      || typeof previous.applied_at !== 'string'
      || !Array.isArray(previous.ownership_manifest)
    ) {
      throw new Error(`installed profile state has invalid previous state; rerun repo-harness install --profile <profile>: ${path}`);
    }
    if (isLegacyManifest(previous.ownership_manifest)) {
      return { ...previous, components: PROFILE_COMPONENTS[previous.profile], ownership_manifest: [] };
    }
    if (invalidComponents(previous.profile, previous.components) || previous.ownership_manifest.some(invalidSurface)) {
      throw new Error(`installed profile state has invalid previous state; rerun repo-harness install --profile <profile>: ${path}`);
    }
    return previous;
  })();
  if (isLegacyManifest(parsed.ownership_manifest)) {
    // One-shot migration: old component labels never proved filesystem
    // ownership. Preserve the validated profile history but claim no managed
    // surface; the next successful sync writes concrete ownership proofs.
    return {
      ...parsed,
      components: PROFILE_COMPONENTS[parsed.profile],
      ownership_manifest: [],
      previous: normalizedPrevious,
    };
  }
  if (invalidComponents(parsed.profile, parsed.components)) {
    throw new Error(`installed profile state components do not match profile ${parsed.profile}: ${path}`);
  }
  if (parsed.ownership_manifest.some(invalidSurface)) {
    throw new Error(`installed profile state has an invalid ownership surface; rerun repo-harness install --profile <profile>: ${path}`);
  }
  return { ...parsed, previous: normalizedPrevious };
}

function existing(paths: readonly string[]): string[] {
  return paths.filter((path) => existsSync(path));
}

function canonicalRoots(home: string): string[] {
  return [join(home, '.codex', 'skills', 'repo-harness'), join(home, '.claude', 'skills', 'repo-harness')];
}

function canonicalEvidence(home: string, relativePaths: readonly string[]): string[] {
  return existing(canonicalRoots(home).flatMap((root) => relativePaths.map((relative) => join(root, relative))));
}

function executableEvidence(name: string, env: NodeJS.ProcessEnv): string[] {
  const home = env.HOME ?? homedir();
  const bunRoot = env.BUN_INSTALL ?? join(home, '.bun');
  const candidates = [join(bunRoot, 'bin', name)];
  for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) candidates.push(join(directory, name));
  return existing([...new Set(candidates)]);
}

function skillEvidence(home: string, names: readonly string[]): string[] {
  return existing(['.codex', '.claude'].flatMap((host) => (
    names.map((name) => join(home, host, 'skills', name, 'SKILL.md'))
  )));
}

function completeHostSkillSetEvidence(home: string, names: readonly string[]): string[] {
  for (const host of ['.codex', '.claude']) {
    const paths = names.map((name) => join(home, host, 'skills', name, 'SKILL.md'));
    if (paths.every(existsSync)) return paths;
  }
  return [];
}

function completeAgentFleetEvidence(home: string): string[] {
  const agents = ['explorer', 'deep-reasoner', 'fast-worker', 'gatekeeper', 'root-cause-prover', 'harness-evaluator'];
  for (const [root, extension] of [[join(home, '.codex', 'agents'), '.toml'], [join(home, '.claude', 'agents'), '.md']] as const) {
    const paths = agents.map((agent) => join(root, `${agent}${extension}`));
    if (paths.every(existsSync)) return paths;
  }
  return [];
}

function probeInstalledComponents(
  state: InstalledProfileState,
  env: NodeJS.ProcessEnv,
): InstalledProfileStatus['component_probes'] {
  const home = env.HOME ?? homedir();
  const adapterCandidates: ReadonlyArray<{ path: string; host: HookHost }> = [
    { path: join(home, '.codex', 'hooks.json'), host: 'codex' },
    { path: join(home, '.claude', 'settings.json'), host: 'claude' },
  ];
  const adapterEvidence = adapterCandidates
    .filter(({ path, host }) => existsSync(path) && adapterHasRequiredProjection(path, host, state.profile))
    .map(({ path }) => path);
  const cliEvidence = executableEvidence('repo-harness', env);
  const effectiveStateEvidence = canonicalEvidence(home, ['src/cli/commands/state.ts']);
  // HRD-03 retired assets/hooks/pre-edit-guard.sh: the `scope-worktree-check-guards`
  // capability it used to prove now lives in the in-process
  // src/cli/hook/mutation-guard.ts handler (bundled straight into the CLI
  // source tree, so it is vendored the same way every other canonicalEvidence
  // path here is -- see effectiveStateEvidence / adaptiveEvidence / releaseEvidence
  // above for the same pattern). scripts/contract-worktree.sh is untouched by
  // this cutover and stays.
  const guardPaths = ['src/cli/hook/mutation-guard.ts', 'scripts/contract-worktree.sh'];
  const guardEvidence = canonicalEvidence(home, guardPaths);
  // SSD-06: repo-harness-handoff retired as a standalone facade. 'handoff' is
  // now fulfilled by the root router's own progressive reference
  // (references/handoff.md), bundled into the canonical repo-harness skill
  // copy itself, so its evidence is that reference file's presence there --
  // same canonicalEvidence idiom as effectiveStateEvidence/adaptiveEvidence
  // below, not a separate host-installed Skill directory.
  const handoffEvidence = canonicalEvidence(home, ['references/handoff.md']);
  const adaptiveEvidence = canonicalEvidence(home, ['src/core/workflow/profile.ts']);
  const codegraphEvidence = state.profile === 'strict'
    ? executableEvidence('codegraph', env)
    : canonicalEvidence(home, ['src/cli/tools/codegraph.ts']);
  const probeExpectations = catalogProbeExpectations(loadSkillSurfaceCatalog());
  const planningSkillNames = probeExpectations.planningSkillNames;
  const planningSkills = completeHostSkillSetEvidence(home, planningSkillNames);
  const planningCapabilityPaths = probeExpectations.planningCapabilityPaths;
  const planningCapabilities = canonicalEvidence(home, planningCapabilityPaths);
  const planningEvidence = planningSkills.length === planningSkillNames.length
    && planningCapabilityPaths.every((relative) => planningCapabilities.some((path) => path.endsWith(relative)))
    ? [...planningSkills, ...planningCapabilities]
    : [];
  const fleetEvidence = completeAgentFleetEvidence(home);
  const verifierEvidence = fleetEvidence.some((path) => /\/gatekeeper\.(?:toml|md)$/.test(path))
    ? canonicalEvidence(home, ['scripts/contract-run.ts'])
    : [];
  const crossModelEvidence = skillEvidence(home, probeExpectations.crossModel);
  const releasePaths = ['scripts/verify-sprint.sh', 'scripts/ship-worktrees.sh'];
  const releaseEvidence = canonicalEvidence(home, releasePaths);
  const evidence: Record<InstallComponent, readonly string[]> = {
    'cli': cliEvidence,
    'effective-state': effectiveStateEvidence,
    'scope-worktree-check-guards': guardPaths.every((relative) => guardEvidence.some((path) => path.endsWith(relative))) ? guardEvidence : [],
    'handoff': handoffEvidence,
    'host-adapters': adapterEvidence,
    'adaptive-workflow': adaptiveEvidence,
    'codegraph-conditional': codegraphEvidence,
    'planning-integrations': planningEvidence,
    'agent-fleet': fleetEvidence,
    'verifier': verifierEvidence,
    'cross-model-acceptance': crossModelEvidence,
    'release-deployment-gates': releasePaths.every((relative) => releaseEvidence.some((path) => path.endsWith(relative))) ? releaseEvidence : [],
  };
  return Object.fromEntries(ALL_COMPONENTS.map((component) => [component, {
    status: evidence[component].length > 0 ? 'present' : 'missing',
    evidence: evidence[component],
  }])) as InstalledProfileStatus['component_probes'];
}

export function installedProfileStatus(
  state: InstalledProfileState,
  env: NodeJS.ProcessEnv = process.env,
): InstalledProfileStatus {
  const desired = PROFILE_COMPONENTS[state.profile];
  const active = new Set(state.components);
  const componentProbes = probeInstalledComponents(state, env);
  const missing = desired.filter((component) => !active.has(component) || componentProbes[component].status === 'missing');
  const unexpected = state.components.filter((component) => !desired.includes(component));
  // A valid profile may intentionally consume a pre-existing user-managed CLI,
  // skill, or CodeGraph installation. Ownership is required before removal,
  // not before truthful presence can be reported.
  const ownershipGaps: InstallComponent[] = [];
  const surfaceDrift = state.ownership_manifest
    .filter((surface) => !surfaceIsCurrent(surface))
    .map((surface) => surface.path);
  return {
    ...state,
    component_probes: componentProbes,
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
  transaction?: InstallHostTransaction,
): { readonly plan: InstallProfilePlan; readonly state: InstalledProfileState } {
  const current = readInstalledProfile(env);
  const plan = planInstallProfile(profile, current, env);
  const desired = new Set(PROFILE_COMPONENTS[profile]);
  const discovered = discoverManagedSurfaces(profile, env);
  const preserved = (current?.ownership_manifest ?? []).filter((surface) => (
    surface.components.every((component) => desired.has(component)) && surfaceIsCurrent(surface)
  ));
  const transactionOwned = transaction ? transactionOwnedSurfaces(transaction, current) : [];
  const ownershipManifest = [...new Map(
    [...discovered, ...preserved, ...transactionOwned].map((surface) => [
      `${surface.path}\0${surface.managed_marker ?? surface.type}`,
      surface,
    ]),
  ).values()].sort((left, right) => left.path.localeCompare(right.path));
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
  const status = installedProfileStatus(state, env);
  if (status.drift.status !== 'consistent') {
    throw new Error(
      `install profile projection is incomplete for ${profile}: missing=${status.drift.missing_components.join(',') || '(none)'}; ownership_gaps=${status.drift.ownership_gaps.join(',') || '(none)'}; surface_drift=${status.drift.surface_drift.join(',') || '(none)'}`,
    );
  }
  writeState(state, env);
  return { plan, state };
}

export function rollbackInstallProfile(
  env: NodeJS.ProcessEnv = process.env,
  transaction?: InstallHostTransaction,
): InstalledProfileState {
  const current = readInstalledProfile(env);
  if (!current?.previous) throw new Error('no previous install profile transaction to roll back');
  const restored: InstalledProfileState = {
    ...current.previous,
    transaction_id: randomUUID(),
    applied_at: new Date().toISOString(),
    ownership_manifest: [
      ...discoverManagedSurfaces(current.previous.profile, env),
      ...(transaction ? transactionOwnedSurfaces(transaction, current.previous) : []),
    ],
    previous: null,
  };
  const status = installedProfileStatus(restored, env);
  if (status.drift.status !== 'consistent') {
    throw new Error(
      `rollback profile projection is incomplete for ${restored.profile}: missing=${status.drift.missing_components.join(',') || '(none)'}; ownership_gaps=${status.drift.ownership_gaps.join(',') || '(none)'}; surface_drift=${status.drift.surface_drift.join(',') || '(none)'}`,
    );
  }
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
