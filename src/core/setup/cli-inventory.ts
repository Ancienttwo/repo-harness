// CLI inventory: every command-line tool on this machine's PATH, grouped by the
// package manager or install script that put it there. Pure module: the
// background collector (src/effects/setup/cli-inventory.ts) supplies every
// probe result. The projection never runs an uninstall; it only renders the
// command string from a fixed template. A local path leaves this module only as
// `~/...` or as `[private path]`.

import { publicAgentConfigText } from '../operator/agent-config';
import seedJson from './cli-seed.v1.json';

export const CLI_INVENTORY_PROJECTION = 'repo-harness.cli-inventory.v1' as const;
export const CLI_SEED_VERSION = 'repo-harness.cli-seed.v1';

export const CLI_PACKAGE_SOURCES = ['brew', 'brew_cask', 'npm', 'pnpm', 'bun', 'pipx', 'uv', 'cargo', 'mise', 'go'] as const;
export type CliPackageSource = typeof CLI_PACKAGE_SOURCES[number];
/** `script`: an official install script's location from the seed. `manual`: nothing claims the file. */
export const CLI_SOURCES = [...CLI_PACKAGE_SOURCES, 'script', 'manual'] as const;
export type CliSource = typeof CLI_SOURCES[number];

/** Package registries the seed names packages in. */
export const CLI_REGISTRIES = ['brew', 'brew_cask', 'npm', 'pypi', 'crates', 'go', 'mise'] as const;
export type CliRegistry = typeof CLI_REGISTRIES[number];
const REGISTRY_OF: Readonly<Record<CliPackageSource, CliRegistry>> = {
  brew: 'brew', brew_cask: 'brew_cask', npm: 'npm', pnpm: 'npm', bun: 'npm', pipx: 'pypi', uv: 'pypi', cargo: 'crates', mise: 'mise', go: 'go',
};

/** No package-manager scan reads these; their files belong to the OS. */
export const CLI_SYSTEM_DIRS: readonly string[] = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
/** A tool is unused when no agent ran it in this many days. */
export const CLI_UNUSED_DAYS = 90;

export const CLI_INVENTORY_STATUSES = ['ready', 'stale', 'unavailable'] as const;
export type CliInventoryStatus = typeof CLI_INVENTORY_STATUSES[number];
export const CLI_INVENTORY_REASONS = ['collection_pending', 'collection_failed'] as const;
export type CliInventoryReason = typeof CLI_INVENTORY_REASONS[number];

/** Package names reach a shell command template, so the set is closed: no space, quote or shell metacharacter. */
const PACKAGE_NAME = /^[@A-Za-z0-9][A-Za-z0-9._@/+-]{0,213}$/u;
const COMMAND_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/u;

// ---------------------------------------------------------------------------
// Seed directory
// ---------------------------------------------------------------------------

export interface CliSeedTool {
  readonly id: string;
  readonly commands: readonly string[];
  /** GitHub `owner/repo`. */
  readonly repo: string;
  /** The repository holds more than this CLI, so its stars are not the CLI's alone. */
  readonly monorepo: boolean;
  readonly packages: readonly { readonly registry: CliRegistry; readonly name: string }[];
  /** `~/`-relative directories an official install script writes. */
  readonly install_roots: readonly string[];
  /** Single files an official install script writes. */
  readonly install_files: readonly string[];
  /** The vendor's uninstall commands for a script install, in order. */
  readonly script_uninstall: readonly string[];
  /** Vendor steps that must run before any uninstall, e.g. a logout. */
  readonly before_uninstall: readonly string[];
  /** Removes configuration and login state; never merged into the uninstall. */
  readonly config_uninstall: string | null;
}

export interface CliSeedCatalog {
  readonly seed_version: typeof CLI_SEED_VERSION;
  readonly observed_on: string;
  readonly tools: readonly CliSeedTool[];
}

export function decodeCliSeed(value: unknown): CliSeedCatalog {
  const fail = (what: string): never => { throw new Error(`cli seed invalid: ${what}`); };
  const obj = (v: unknown, keys: readonly string[], what: string): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(what);
    if (Object.keys(v).sort().join(',') !== [...keys].sort().join(',')) return fail(`${what} fields`);
    return v as Record<string, unknown>;
  };
  const list = <T>(v: unknown, read: (x: unknown) => T, what: string): T[] => (Array.isArray(v) ? v.map(read) : fail(what));
  const match = (v: unknown, pattern: RegExp, what: string): string => (typeof v === 'string' && pattern.test(v) ? v : fail(what));
  // Seed text is a fixed template: one line, `~/` or absolute paths only, no shell expansion.
  const template = (v: unknown, what: string): string =>
    (typeof v === 'string' && v.length > 0 && v.length <= 256 && !/[\x00-\x1f\x7f`$]/u.test(v) ? v : fail(what));
  const root = obj(value, ['seed_version', 'observed_on', 'tools'], 'seed');
  if (root.seed_version !== CLI_SEED_VERSION) fail('seed_version');
  const ids = new Set<string>();
  const tools = list(root.tools, (raw): CliSeedTool => {
    const t = obj(raw, ['id', 'commands', 'repo', 'monorepo', 'packages', 'install_roots', 'install_files', 'script_uninstall', 'before_uninstall', 'config_uninstall'], 'tool');
    const id = match(t.id, /^[a-z0-9][a-z0-9-]{0,63}$/u, 'tool id');
    if (ids.has(id)) fail(`duplicate ${id}`);
    ids.add(id);
    if (typeof t.monorepo !== 'boolean') fail(`${id} monorepo`);
    const commands = list(t.commands, x => match(x, COMMAND_NAME, `${id} command`), `${id} commands`);
    if (commands.length === 0) fail(`${id} commands`);
    return {
      id,
      commands,
      repo: match(t.repo, REPO, `${id} repo`),
      monorepo: t.monorepo as boolean,
      packages: list(t.packages, (p) => {
        const pkg = obj(p, ['registry', 'name'], `${id} package`);
        if (!(CLI_REGISTRIES as readonly string[]).includes(pkg.registry as string)) fail(`${id} registry`);
        return { registry: pkg.registry as CliRegistry, name: match(pkg.name, PACKAGE_NAME, `${id} package name`) };
      }, `${id} packages`),
      install_roots: list(t.install_roots, x => match(x, /^~\/[A-Za-z0-9._/-]+$/u, `${id} install_root`), `${id} install_roots`),
      install_files: list(t.install_files, x => match(x, /^(?:~|)\/[A-Za-z0-9._/-]+$/u, `${id} install_file`), `${id} install_files`),
      script_uninstall: list(t.script_uninstall, x => template(x, `${id} script_uninstall`), `${id} script_uninstall`),
      before_uninstall: list(t.before_uninstall, x => template(x, `${id} before_uninstall`), `${id} before_uninstall`),
      config_uninstall: t.config_uninstall === null ? null : template(t.config_uninstall, `${id} config_uninstall`),
    };
  }, 'tools');
  return { seed_version: CLI_SEED_VERSION, observed_on: match(root.observed_on, /^\d{4}-\d{2}-\d{2}$/u, 'observed_on'), tools };
}

/** The packaged seed. A decode failure is a build error; the inventory tests stop it. */
export const CLI_SEED: CliSeedCatalog = decodeCliSeed(seedJson);

// ---------------------------------------------------------------------------
// Probe facts (collector output) and the public snapshot
// ---------------------------------------------------------------------------

/** One package a manager reports as installed. */
export interface CliPackageRecord {
  readonly source: CliPackageSource;
  /** Pulled in by another package (Homebrew `installed_on_request: false`): its files are claimed but not listed. */
  readonly dependency: boolean;
  readonly name: string;
  readonly version: string | null;
  /** Absolute directories that hold the package; a PATH file whose real path is inside one belongs to it. */
  readonly roots: readonly string[];
  /** Absolute executable files the package owns outside its roots (cargo, go). */
  readonly files: readonly string[];
  /** Repository or homepage URLs from the local package metadata. */
  readonly urls: readonly string[];
  /** The manager marks the package deprecated or disabled (Homebrew). */
  readonly deprecated: boolean;
}

export interface CliPathExecutable {
  readonly name: string;
  /** Absolute path in the PATH directory. */
  readonly path: string;
  readonly real_path: string;
}

export interface CliGithubFacts {
  /** Canonical `owner/repo` after redirects. */
  readonly full_name: string;
  readonly stars: number;
  readonly archived: boolean;
}

export interface CliInventoryInput {
  readonly collected_at: string;
  readonly home: string;
  readonly packages: readonly CliPackageRecord[];
  readonly path_executables: readonly CliPathExecutable[];
  readonly seed: CliSeedCatalog;
  /** Command name -> epoch ms of its newest agent use. */
  readonly last_used: ReadonlyMap<string, number>;
  /** Lowercase `owner/repo` -> gh facts; absent or null when gh had none. */
  readonly github: ReadonlyMap<string, CliGithubFacts | null>;
  /** `<source>:<name>` -> the registry marks the package deprecated. */
  readonly registry_deprecated: ReadonlyMap<string, boolean>;
  /** Package root -> bytes on disk. */
  readonly sizes: ReadonlyMap<string, number>;
}

export interface CliGithub {
  /** Null when the match is ambiguous; see `candidates`. */
  repo: string | null;
  /** Several seed repositories share the command name and no package name decides. */
  candidates: string[];
  monorepo: boolean;
  stars: number | null;
  archived: boolean | null;
  /** The repository answers under another name. */
  moved: boolean;
}

export interface CliUninstall {
  /** Run in order: vendor prerequisites first, then the removal. The console never runs them. */
  steps: string[];
  /** Removes configuration and login state; separate from the removal. */
  config: string | null;
}

export interface CliInventoryEntry {
  /** `<source>:<package>`, `script:<seed id>` or `manual:<command>`. */
  id: string;
  source: CliSource;
  package: string | null;
  version: string | null;
  /** Command names on PATH. */
  commands: string[];
  /** Directory of the first command: `~/...` or `[private path]`. */
  location: string;
  size_bytes: number | null;
  last_used_at: string | null;
  /** No agent use in CLI_UNUSED_DAYS. */
  unused: boolean;
  github: CliGithub | null;
  /** The manager or the registry marks the package deprecated, or the repository is archived. */
  deprecated: boolean;
  /** Null for a manual file and for a script install the seed does not cover. */
  uninstall: CliUninstall | null;
}

export interface CliInventorySnapshotV1 {
  projection_version: typeof CLI_INVENTORY_PROJECTION;
  status: CliInventoryStatus;
  reason: CliInventoryReason | null;
  collected_at: string | null;
  entries: CliInventoryEntry[];
}

export function unavailableCliInventory(reason: CliInventoryReason = 'collection_pending'): CliInventorySnapshotV1 {
  return { projection_version: CLI_INVENTORY_PROJECTION, status: 'unavailable', reason, collected_at: null, entries: [] };
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

const dirname = (path: string): string => path.slice(0, Math.max(1, path.lastIndexOf('/')));
const inside = (path: string, root: string): boolean => path === root || path.startsWith(`${root.replace(/\/+$/u, '')}/`);
const expandHome = (path: string, home: string): string => (path.startsWith('~/') ? `${home}${path.slice(1)}` : path);

/** `~/...` for a path under HOME; every other absolute path becomes `[private path]`. */
export function displayPath(path: string, home: string): string {
  const shown = home !== '' && home !== '/' && inside(path, home) ? `~${path.slice(home.replace(/\/+$/u, '').length)}` : path;
  return publicAgentConfigText(shown);
}

/** `owner/repo` from a GitHub URL in any npm, PyPI or Homebrew metadata form. */
export function githubRepo(url: string): string | null {
  const match = /^(?:git\+)?(?:https?:\/\/|git:\/\/|ssh:\/\/git@|git@)?(?:www\.)?github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/#?].*)?$/u.exec(url.trim())
    ?? /^github:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/u.exec(url.trim());
  const repo = match === null ? null : `${match[1]}/${match[2]}`;
  return repo !== null && REPO.test(repo) ? repo : null;
}

function uninstallCommand(record: CliPackageRecord): string | null {
  const name = record.name;
  switch (record.source) {
    case 'brew': return `brew uninstall ${name}`;
    case 'brew_cask': return `brew uninstall --cask ${name}`;
    case 'npm': return `npm rm -g ${name}`;
    case 'pnpm': return `pnpm rm -g ${name}`;
    case 'bun': return `bun rm -g ${name}`;
    case 'pipx': return `pipx uninstall ${name}`;
    case 'uv': return `uv tool uninstall ${name}`;
    case 'cargo': return `cargo uninstall ${name}`;
    case 'mise': return record.version === null ? `mise uninstall ${name}` : `mise uninstall ${name}@${record.version}`;
    // go install has no uninstall; the binary is the whole install.
    case 'go': return null;
  }
}

/**
 * `rm` of every binary of a go module: go install has no uninstall, the files
 * are the whole install. Only `~/` paths make a usable command; a path with
 * text outside a plain set keeps tilde expansion and single-quotes the rest.
 */
function removeFiles(paths: readonly string[], home: string): string | null {
  const args: string[] = [];
  for (const path of paths) {
    const shown = displayPath(path, home);
    if (!shown.startsWith('~/')) return null;
    const rest = shown.slice(2);
    args.push(/^[A-Za-z0-9._/+-]+$/u.test(rest) ? shown : `~/'${rest.replaceAll("'", "'\\''")}'`);
  }
  return `rm ${args.join(' ')}`;
}

interface Claimed { readonly record: CliPackageRecord | null; readonly seed: CliSeedTool | null; readonly files: CliPathExecutable[] }

export function projectCliInventory(input: CliInventoryInput): CliInventorySnapshotV1 {
  const { home, seed } = input;
  const nowMs = Date.parse(input.collected_at);
  const records = input.packages.filter(record => PACKAGE_NAME.test(record.name) && (record.version === null || VERSION.test(record.version)));
  const seedFor = (record: CliPackageRecord) => seed.tools.find(tool =>
    tool.packages.some(pkg => pkg.registry === REGISTRY_OF[record.source] && pkg.name === record.name)) ?? null;

  // PATH order wins: a later file with the same name is shadowed and not listed.
  const seen = new Set<string>();
  const claims = new Map<string, Claimed>();
  const claim = (key: string, record: CliPackageRecord | null, seedTool: CliSeedTool | null, file: CliPathExecutable) => {
    const current = claims.get(key) ?? { record, seed: seedTool, files: [] };
    current.files.push(file);
    claims.set(key, current);
  };
  for (const file of input.path_executables) {
    if (!COMMAND_NAME.test(file.name) || seen.has(file.name)) continue;
    if (CLI_SYSTEM_DIRS.includes(dirname(file.path)) || file.path.includes('/node_modules/.bin/')) continue;
    seen.add(file.name);
    const record = records.find(r => r.files.includes(file.real_path) || r.files.includes(file.path)
      || r.roots.some(root => inside(file.real_path, root)));
    if (record !== undefined) {
      if (!record.dependency) claim(`${record.source}:${record.name}`, record, seedFor(record), file);
      continue;
    }
    const seedTool = seed.tools.find(tool =>
      tool.install_roots.some(root => inside(file.real_path, expandHome(root, home)) || inside(file.path, expandHome(root, home)))
      || tool.install_files.some(path => expandHome(path, home) === file.path));
    if (seedTool !== undefined) { claim(`script:${seedTool.id}`, null, seedTool, file); continue; }
    claim(`manual:${file.name}`, null, null, file);
  }

  const entries = [...claims].map(([id, { record, seed: seedTool, files }]): CliInventoryEntry => {
    const commands = files.map(file => file.name);
    const source: CliSource = record?.source ?? (seedTool !== null ? 'script' : 'manual');
    const lastUsed = Math.max(-Infinity, ...commands.map(name => input.last_used.get(name) ?? -Infinity));
    const github = resolveGithub(record, seedTool, commands, input);
    const removal = record !== null ? uninstallCommand(record)
      : source === 'script' && seedTool!.script_uninstall.length > 0 ? seedTool!.script_uninstall.join(' && ') : null;
    const goRemoval = record?.source === 'go' ? removeFiles(files.map(file => file.path), home) : null;
    const steps = removal ?? goRemoval;
    const root = record?.roots[0];
    return {
      id,
      source,
      package: record?.name ?? null,
      version: record?.version ?? null,
      commands,
      location: displayPath(dirname(files[0]!.path), home),
      size_bytes: root === undefined ? null : input.sizes.get(root) ?? null,
      last_used_at: Number.isFinite(lastUsed) ? new Date(lastUsed).toISOString() : null,
      unused: !Number.isFinite(lastUsed) || lastUsed < nowMs - CLI_UNUSED_DAYS * 86_400_000,
      github,
      deprecated: record?.deprecated === true || input.registry_deprecated.get(id) === true || github?.archived === true,
      uninstall: steps === null ? null : { steps: [...(seedTool?.before_uninstall ?? []), steps], config: seedTool?.config_uninstall ?? null },
    };
  });
  return { projection_version: CLI_INVENTORY_PROJECTION, status: 'ready', reason: null, collected_at: input.collected_at, entries };
}

/**
 * Repository: local package metadata first, then the seed by package name or
 * install location. A command name alone that several seed repositories share
 * gives candidates and no stars.
 */
function resolveGithub(record: CliPackageRecord | null, seedTool: CliSeedTool | null, commands: readonly string[], input: CliInventoryInput): CliGithub | null {
  const fromMetadata = record?.urls.map(githubRepo).find(repo => repo !== null) ?? null;
  const repo = fromMetadata ?? seedTool?.repo ?? null;
  if (repo === null) {
    const candidates = [...new Set(input.seed.tools.filter(tool => tool.commands.some(name => commands.includes(name))).map(tool => tool.repo))];
    return candidates.length === 0 ? null : { repo: null, candidates, monorepo: false, stars: null, archived: null, moved: false };
  }
  const facts = input.github.get(repo.toLowerCase()) ?? null;
  const shown = facts?.full_name ?? repo;
  return {
    repo: shown,
    candidates: [],
    monorepo: input.seed.tools.some(tool => tool.monorepo && tool.repo.toLowerCase() === shown.toLowerCase()),
    stars: facts?.stars ?? null,
    archived: facts?.archived ?? null,
    moved: facts !== null && facts.full_name.toLowerCase() !== repo.toLowerCase(),
  };
}

/** Repositories whose stars the collector asks gh for. Ambiguous matches are left out. */
export function githubLookups(snapshot: CliInventorySnapshotV1): string[] {
  return [...new Set(snapshot.entries.flatMap(entry => (entry.github?.repo ? [entry.github.repo.toLowerCase()] : [])))];
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

/** Strict decoder: exact keys, closed vocabularies, and no absolute path outside `~/` or `[private path]`. */
export function decodeCliInventory(value: unknown): CliInventorySnapshotV1 {
  const fail = (what: string): never => { throw new Error(`cli inventory invalid: ${what}`); };
  const obj = (v: unknown, keys: readonly string[], what: string): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(what);
    if (Object.keys(v).sort().join(',') !== [...keys].sort().join(',')) return fail(`${what} fields`);
    return v as Record<string, unknown>;
  };
  const array = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(what));
  const match = (v: unknown, pattern: RegExp, what: string): string => (typeof v === 'string' && pattern.test(v) ? v : fail(what));
  const nullable = <T>(v: unknown, read: (x: unknown) => T): T | null => (v === null ? null : read(v));
  const oneOf = <T extends string>(v: unknown, values: readonly T[], what: string): T =>
    (typeof v === 'string' && (values as readonly string[]).includes(v) ? v as T : fail(what));
  const bool = (v: unknown, what: string): boolean => (typeof v === 'boolean' ? v : fail(what));
  const count = (v: unknown, what: string): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : fail(what));
  const time = (v: unknown, what: string): string => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : fail(what));
  const text = (v: unknown, what: string): string =>
    (typeof v === 'string' && v.length > 0 && publicAgentConfigText(v) === v ? v : fail(what));

  const v = obj(value, ['projection_version', 'status', 'reason', 'collected_at', 'entries'], 'snapshot');
  if (v.projection_version !== CLI_INVENTORY_PROJECTION) fail('projection_version');
  const status = oneOf(v.status, CLI_INVENTORY_STATUSES, 'status');
  const reason = nullable(v.reason, x => oneOf(x, CLI_INVENTORY_REASONS, 'reason'));
  if ((status === 'ready') !== (reason === null)) fail('reason');
  const collectedAt = nullable(v.collected_at, x => time(x, 'collected_at'));
  if ((collectedAt === null) !== (status === 'unavailable')) fail('collected_at');
  const ids = new Set<string>();
  for (const raw of array(v.entries, 'entries')) {
    const e = obj(raw, ['id', 'source', 'package', 'version', 'commands', 'location', 'size_bytes', 'last_used_at', 'unused', 'github', 'deprecated', 'uninstall'], 'entry');
    const id = match(e.id, /^[a-z_]+:[@A-Za-z0-9][A-Za-z0-9._@/+-]{0,213}$/u, 'entry id');
    if (ids.has(id)) fail('duplicate entry');
    ids.add(id);
    oneOf(e.source, CLI_SOURCES, 'source');
    nullable(e.package, x => match(x, PACKAGE_NAME, 'package'));
    nullable(e.version, x => match(x, VERSION, 'version'));
    if (array(e.commands, 'commands').length === 0) fail('commands');
    for (const name of e.commands as unknown[]) match(name, COMMAND_NAME, 'command');
    text(e.location, 'location');
    nullable(e.size_bytes, x => count(x, 'size_bytes'));
    nullable(e.last_used_at, x => time(x, 'last_used_at'));
    bool(e.unused, 'unused');
    bool(e.deprecated, 'deprecated');
    nullable(e.github, x => {
      const g = obj(x, ['repo', 'candidates', 'monorepo', 'stars', 'archived', 'moved'], 'github');
      const repo = nullable(g.repo, y => match(y, REPO, 'repo'));
      const candidates = array(g.candidates, 'candidates').map(y => match(y, REPO, 'candidate'));
      if ((repo === null) === (candidates.length === 0)) fail('github repo');
      bool(g.monorepo, 'monorepo');
      bool(g.moved, 'moved');
      if (nullable(g.stars, y => count(y, 'stars')) !== null && repo === null) fail('stars');
      nullable(g.archived, y => bool(y, 'archived'));
      return g;
    });
    nullable(e.uninstall, x => {
      const u = obj(x, ['steps', 'config'], 'uninstall');
      if (array(u.steps, 'steps').length === 0) fail('steps');
      for (const step of u.steps as unknown[]) text(step, 'step');
      nullable(u.config, y => text(y, 'config'));
      return u;
    });
  }
  if (status === 'unavailable' && ids.size > 0) fail('unavailable snapshot carries data');
  return v as unknown as CliInventorySnapshotV1;
}
