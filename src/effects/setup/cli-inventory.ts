// Background CLI inventory collector (PRD "CLI 清单（G18）"). It runs only on a
// timer in a server process, never on a request path; a GET reads `read()`.
// Every probe is a read-only list command with a fixed argv, no shell and a
// deadline: package-manager listings, `go version -m`, and gh / npm registry
// lookups. Network lookups send only `owner/repo` or a package name and are
// cached in memory for 24 hours. The collector writes no state (reading the
// hook telemetry takes only that log's short rotation lock), never runs an
// uninstall and never reads shell history.

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

import {
  CLI_SEED,
  CLI_SYSTEM_DIRS,
  CLI_UNUSED_DAYS,
  GITHUB_REPO,
  githubLookups,
  projectCliInventory,
  unavailableCliInventory,
  type CliGithubFacts,
  type CliInventorySnapshotV1,
  type CliPackageRecord,
  type CliPathExecutable,
  type CliSeedCatalog,
} from '../../core/setup/cli-inventory';
import { readSegmentedLog } from '../segmented-log';

export const CLI_INVENTORY_INTERVAL_MS = 6 * 3_600_000;
export const CLI_LOOKUP_TTL_MS = 24 * 3_600_000;
const PROBE_TIMEOUT_MS = 30_000;
const PROBE_STDOUT_LIMIT = 32 * 1024 * 1024;
/** Network lookups per cycle; the rest wait for the next cycle. */
const LOOKUP_LIMIT = 40;
const PATH_FILE_LIMIT = 10_000;
const SIZE_ENTRY_LIMIT = 200_000;

/** Stdout of one read-only command, or null when it is missing, fails or times out. */
export type CliProbe = (argv: readonly string[]) => Promise<string | null>;

function probeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env, NO_COLOR: '1', HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ENV_HINTS: '1',
    GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', npm_config_update_notifier: 'false',
  };
}

export function createCliProbe(env: NodeJS.ProcessEnv): CliProbe {
  const childEnv = probeEnv(env);
  return argv => new Promise((settle) => {
    execFile(argv[0]!, argv.slice(1), {
      env: childEnv, timeout: PROBE_TIMEOUT_MS, maxBuffer: PROBE_STDOUT_LIMIT, windowsHide: true, encoding: 'utf8',
    }, (error, stdout) => settle(error ? null : stdout));
  });
}

const json = (text: string | null): unknown => {
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
};
const record = (value: unknown): Record<string, unknown> =>
  (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const strings = (...values: unknown[]): string[] => values.map(str).filter((value): value is string => value !== null);

function readPackageJson(dir: string): Record<string, unknown> {
  try { return record(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))); } catch { return {}; }
}

/** One npm-style package directory: version and repository/homepage URLs from its package.json. */
function nodePackage(source: 'npm' | 'pnpm' | 'bun', name: string, dir: string): CliPackageRecord {
  const pkg = readPackageJson(dir);
  const repository = typeof pkg.repository === 'string' ? pkg.repository : record(pkg.repository).url;
  return { source, dependency: false, name, version: str(pkg.version), roots: [dir], files: [], urls: strings(repository, pkg.homepage), deprecated: false };
}

interface ProbeContext {
  readonly probe: CliProbe;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
}

/** Formulae and casks. A formula not installed on request is a dependency: it claims its files and is not listed. */
async function brewPackages({ probe }: ProbeContext): Promise<CliPackageRecord[]> {
  const prefix = str(await probe(['brew', '--prefix']));
  const info = record(json(await probe(['brew', 'info', '--json=v2', '--installed'])));
  if (prefix === null) return [];
  const formulae = (Array.isArray(info.formulae) ? info.formulae : []).map(record).flatMap((f): CliPackageRecord[] => {
    const installed = (Array.isArray(f.installed) ? f.installed : []).map(record);
    const name = str(f.name);
    if (name === null || installed.length === 0) return [];
    return [{
      source: 'brew', dependency: !installed.some(item => item.installed_on_request === true), name: str(f.full_name) ?? name, version: str(installed.at(-1)?.version), roots: [join(prefix, 'Cellar', name)], files: [],
      urls: strings(f.homepage, record(record(f.urls).stable).url, record(record(f.urls).head).url), deprecated: f.deprecated === true || f.disabled === true,
    }];
  });
  const casks = (Array.isArray(info.casks) ? info.casks : []).map(record).flatMap((c): CliPackageRecord[] => {
    const token = str(c.token);
    if (token === null) return [];
    // A cask binary can live inside an app bundle; its artifact source names that file.
    const files = (Array.isArray(c.artifacts) ? c.artifacts : []).map(record)
      .flatMap(artifact => (Array.isArray(artifact.binary) && typeof artifact.binary[0] === 'string' ? [artifact.binary[0].replace('$APPDIR', '/Applications')] : []));
    return [{
      source: 'brew_cask', dependency: false, name: str(c.full_token) ?? token, version: str(c.installed), roots: [join(prefix, 'Caskroom', token)], files,
      urls: strings(c.homepage, c.url), deprecated: c.deprecated === true || c.disabled === true,
    }];
  });
  return [...formulae, ...casks];
}

async function npmPackages({ probe }: ProbeContext): Promise<CliPackageRecord[]> {
  const root = str(await probe(['npm', 'root', '-g']));
  const list = record(json(await probe(['npm', 'ls', '-g', '--json', '--depth=0'])));
  if (root === null) return [];
  return Object.keys(record(list.dependencies)).map(name => nodePackage('npm', name, join(root, name)));
}

async function pnpmPackages({ probe }: ProbeContext): Promise<CliPackageRecord[]> {
  const list = json(await probe(['pnpm', 'ls', '-g', '--json', '--depth=0']));
  return (Array.isArray(list) ? list : []).map(record).flatMap(project => Object.entries(record(project.dependencies)).flatMap(([name, dep]) => {
    const path = str(record(dep).path);
    return path === null ? [] : [nodePackage('pnpm', name, path)];
  }));
}

/** Bun keeps its global packages in one directory; no command needed. */
async function bunPackages({ env, home }: ProbeContext): Promise<CliPackageRecord[]> {
  const global = join(env.BUN_INSTALL || join(home, '.bun'), 'install', 'global');
  return Object.keys(record(readPackageJson(global).dependencies)).map(name => nodePackage('bun', name, join(global, 'node_modules', name)));
}

async function pipxPackages({ probe }: ProbeContext): Promise<CliPackageRecord[]> {
  const venvs = record(record(json(await probe(['pipx', 'list', '--json']))).venvs);
  return Object.entries(venvs).flatMap(([name, venv]): CliPackageRecord[] => {
    const main = record(record(record(venv).metadata).main_package);
    const app = str(record((Array.isArray(main.app_paths) ? main.app_paths : [])[0]).__Path__);
    // <venv>/bin/<app>: the venv directory holds the package.
    return [{ source: 'pipx', dependency: false, name, version: str(main.package_version), roots: app === null ? [] : [dirname(dirname(app))], files: [], urls: [], deprecated: false }];
  });
}

async function uvPackages({ probe }: ProbeContext): Promise<CliPackageRecord[]> {
  const dir = str(await probe(['uv', 'tool', 'dir']));
  const list = await probe(['uv', 'tool', 'list']);
  if (dir === null || list === null) return [];
  return list.split('\n').flatMap((line): CliPackageRecord[] => {
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*) v(\S+)/u.exec(line);
    return match === null ? [] : [{ source: 'uv', dependency: false, name: match[1]!, version: match[2]!, roots: [join(dir, match[1]!)], files: [], urls: [], deprecated: false }];
  });
}

async function cargoPackages({ probe, env, home }: ProbeContext): Promise<CliPackageRecord[]> {
  const list = await probe(['cargo', 'install', '--list']);
  if (list === null) return [];
  const bin = join(env.CARGO_HOME || join(home, '.cargo'), 'bin');
  const records: { name: string; version: string; files: string[] }[] = [];
  for (const line of list.split('\n')) {
    const header = /^([A-Za-z0-9][A-Za-z0-9_-]*) v([^\s:]+)/u.exec(line);
    if (header !== null) records.push({ name: header[1]!, version: header[2]!, files: [] });
    else if (/^\s+\S/u.test(line)) records.at(-1)?.files.push(join(bin, line.trim()));
  }
  return records.map(r => ({ source: 'cargo', dependency: false, name: r.name, version: r.version, roots: [], files: r.files, urls: [], deprecated: false }));
}

async function misePackages({ probe }: ProbeContext): Promise<CliPackageRecord[]> {
  const tools = record(json(await probe(['mise', 'ls', '--installed', '--json'])));
  return Object.entries(tools).flatMap(([name, versions]) => (Array.isArray(versions) ? versions : []).map(record).flatMap((item): CliPackageRecord[] => {
    const path = str(item.install_path);
    return path === null ? [] : [{ source: 'mise', dependency: false, name, version: str(item.version), roots: [path], files: [], urls: [], deprecated: false }];
  }));
}

/** `go install` leaves only a binary; `go version -m` reads its module path from the file. */
async function goPackages({ probe }: ProbeContext, executables: readonly CliPathExecutable[]): Promise<CliPackageRecord[]> {
  const [gobin, gopath] = (await probe(['go', 'env', 'GOBIN', 'GOPATH']) ?? '').split('\n').map(line => line.trim());
  const bin = gobin || (gopath ? join(gopath.split(':')[0]!, 'bin') : '');
  if (bin === '') return [];
  const records: CliPackageRecord[] = [];
  for (const file of executables.filter(item => dirname(item.path) === bin)) {
    const info = await probe(['go', 'version', '-m', file.path]);
    const mod = info === null ? null : /^\s*mod\s+(\S+)\s+(\S+)/mu.exec(info);
    if (mod === null || mod === undefined) continue;
    records.push({ source: 'go', dependency: false, name: mod[1]!, version: mod[2]!, roots: [], files: [file.path], urls: [`https://${mod[1]}`], deprecated: false });
  }
  return records;
}

/** Executable files on PATH, in PATH order, outside the system directories. */
export async function scanPath(pathValue: string): Promise<CliPathExecutable[]> {
  const out: CliPathExecutable[] = [];
  for (const dir of [...new Set(pathValue.split(':'))]) {
    if (!isAbsolute(dir) || CLI_SYSTEM_DIRS.includes(dir) || dir.includes('/node_modules/.bin')) continue;
    let names: string[];
    try { names = (await readdir(dir)).sort(); } catch { continue; }
    for (const name of names) {
      if (out.length >= PATH_FILE_LIMIT) return out;
      const path = join(dir, name);
      try {
        const target = await stat(path);
        if (!target.isFile() || (target.mode & 0o111) === 0) continue;
        out.push({ name, path, real_path: await realpath(path) });
      } catch { /* dangling link or vanished file */ }
    }
  }
  return out;
}

/** Newest agent use per command name from hook telemetry `command_names`, inside the unused window. */
export function readCommandUsage(sources: readonly CliUsageSource[], nowMs: number): Map<string, number> {
  const since = nowMs - CLI_UNUSED_DAYS * 86_400_000;
  const usage = new Map<string, number>();
  for (const source of sources) {
    let lines: Iterable<string> | null;
    try { lines = readSegmentedLog(join(source.repo_root, source.telemetry_path), source.repo_root); } catch { continue; }
    for (const line of lines ?? []) {
      // Only records that carry names; skip the JSON parse for the rest.
      if (!line.includes('"command_names":["')) continue;
      const r = record(json(line));
      const at = typeof r.started_at === 'string' ? Date.parse(r.started_at) : Number.NaN;
      if (!Number.isFinite(at) || at < since || at > nowMs || !Array.isArray(r.command_names)) continue;
      for (const name of r.command_names) if (typeof name === 'string' && at > (usage.get(name) ?? -Infinity)) usage.set(name, at);
    }
  }
  return usage;
}

/** Bytes under `root`; null past the entry budget or when unreadable. */
async function directorySize(root: string): Promise<number | null> {
  let bytes = 0;
  let entries = 0;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let names: string[];
    try { names = await readdir(dir); } catch { return null; }
    for (const name of names) {
      if (++entries > SIZE_ENTRY_LIMIT) return null;
      try {
        const item = await lstat(join(dir, name));
        if (item.isDirectory()) stack.push(join(dir, name));
        else bytes += item.size;
      } catch { /* vanished */ }
    }
  }
  return bytes;
}

export interface CliUsageSource {
  readonly repo_root: string;
  /** `HOOK_EVENT_TELEMETRY_PATH`, relative to `repo_root`; the hook layer owns it. */
  readonly telemetry_path: string;
}

/** Lookups and sizes kept across cycles. Memory only. */
export interface CliInventoryCache {
  readonly github: Map<string, { readonly at: number; readonly facts: CliGithubFacts | null }>;
  readonly deprecated: Map<string, { readonly at: number; readonly value: boolean }>;
  readonly sizes: Map<string, { readonly mtime: number; readonly bytes: number | null }>;
}

export function createCliInventoryCache(): CliInventoryCache {
  return { github: new Map(), deprecated: new Map(), sizes: new Map() };
}

export interface CliInventoryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly probe?: CliProbe;
  readonly seed?: CliSeedCatalog;
  readonly usage_sources?: readonly CliUsageSource[];
  readonly cache?: CliInventoryCache;
  readonly now?: () => number;
}

async function githubFacts(probe: CliProbe, repo: string): Promise<CliGithubFacts | null> {
  const facts = record(json(await probe(['gh', 'api', `repos/${repo}`, '--jq', '{full_name: .full_name, stars: .stargazers_count, archived: .archived}'])));
  // gh output is external: a name that is not `owner/repo` is no fact.
  return typeof facts.full_name === 'string' && GITHUB_REPO.test(facts.full_name)
    && typeof facts.stars === 'number' && Number.isSafeInteger(facts.stars) && facts.stars >= 0 && typeof facts.archived === 'boolean'
    ? { full_name: facts.full_name, stars: facts.stars, archived: facts.archived }
    : null;
}

/** One collection: local probes, then cached network lookups for what the local facts name. */
export async function collectCliInventory(options: CliInventoryOptions = {}): Promise<CliInventorySnapshotV1> {
  const env = options.env ?? process.env;
  const now = (options.now ?? Date.now)();
  const home = env.HOME || homedir();
  const probe = options.probe ?? createCliProbe(env);
  const cache = options.cache ?? createCliInventoryCache();
  const context: ProbeContext = { probe, env, home };
  const pathExecutables = await scanPath(env.PATH ?? '');
  const packages = (await Promise.all([
    brewPackages(context), npmPackages(context), pnpmPackages(context), bunPackages(context), pipxPackages(context),
    uvPackages(context), cargoPackages(context), misePackages(context), goPackages(context, pathExecutables),
  ])).flat();

  const sizes = new Map<string, number>();
  for (const root of new Set(packages.flatMap(item => item.roots.slice(0, 1)))) {
    let mtime: number;
    try { mtime = (await stat(root)).mtimeMs; } catch { continue; }
    const cached = cache.sizes.get(root);
    const bytes = cached !== undefined && cached.mtime === mtime ? cached.bytes : await directorySize(root);
    cache.sizes.set(root, { mtime, bytes });
    if (bytes !== null) sizes.set(root, bytes);
  }

  const input = {
    collected_at: new Date(now).toISOString(),
    home,
    packages,
    path_executables: pathExecutables,
    seed: options.seed ?? CLI_SEED,
    last_used: readCommandUsage(options.usage_sources ?? [], now),
    sizes,
  };
  const local = projectCliInventory({ ...input, github: new Map(), registry_deprecated: new Map() });

  let lookups = 0;
  const fresh = (at: number) => now - at < CLI_LOOKUP_TTL_MS;
  const github = new Map<string, CliGithubFacts | null>();
  for (const repo of githubLookups(local)) {
    const cached = cache.github.get(repo);
    if (cached === undefined || !fresh(cached.at)) {
      if (lookups++ >= LOOKUP_LIMIT) continue;
      cache.github.set(repo, { at: now, facts: await githubFacts(probe, repo) });
    }
    github.set(repo, cache.github.get(repo)!.facts);
  }
  const registryDeprecated = new Map<string, boolean>();
  for (const entry of local.entries) {
    if (entry.package === null || !(entry.source === 'npm' || entry.source === 'pnpm' || entry.source === 'bun')) continue;
    const key = `npm:${entry.package}`;
    const cached = cache.deprecated.get(key);
    if (cached === undefined || !fresh(cached.at)) {
      if (lookups++ >= LOOKUP_LIMIT) continue;
      const message = json(await probe(['npm', 'view', entry.package, 'deprecated', '--json']));
      cache.deprecated.set(key, { at: now, value: typeof message === 'string' && message.trim() !== '' });
    }
    registryDeprecated.set(entry.id, cache.deprecated.get(key)!.value);
  }
  return projectCliInventory({ ...input, github, registry_deprecated: registryDeprecated });
}

export interface CliInventoryCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: () => CliInventorySnapshotV1;
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/**
 * Collect at start, then every interval after the previous cycle settles.
 * A failed cycle keeps the last good data as `stale`.
 */
export function startCliInventoryCollector(options: CliInventoryOptions & { readonly interval_ms?: number } = {}): CliInventoryCollectorHandle {
  const cache = options.cache ?? createCliInventoryCache();
  let current = unavailableCliInventory('collection_pending');
  let lastGood: CliInventorySnapshotV1 | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  const cycle = (): Promise<void> => {
    inflight = collectCliInventory({ ...options, cache })
      .then((snapshot) => {
        if (closed) return;
        lastGood = snapshot;
        current = snapshot;
      }, () => {
        if (closed) return;
        current = lastGood === null ? unavailableCliInventory('collection_failed') : { ...lastGood, status: 'stale', reason: 'collection_failed' };
      })
      .finally(() => {
        inflight = null;
        if (closed) return;
        timer = setTimeout(cycle, options.interval_ms ?? CLI_INVENTORY_INTERVAL_MS);
        timer.unref?.();
      });
    return inflight;
  };
  void cycle();
  return Object.freeze({
    read: () => current,
    settled: () => inflight ?? Promise.resolve(),
    close: async () => {
      closed = true;
      clearTimeout(timer);
      await inflight;
    },
  });
}
