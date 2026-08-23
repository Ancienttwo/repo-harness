import { createHash, randomUUID } from "crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, isAbsolute, join, resolve } from "path";

export type RepoHarnessRegistrySource = "adopt" | "init" | "mcp-setup" | "manual" | "discovery"; // "adopt": legacy-read-only, no current writers
export type RepoHarnessAccessMode = "read_only" | "read_write";

export interface RepoHarnessRegisteredRepo {
  readonly id: string;
  readonly path: string;
  readonly accessMode: RepoHarnessAccessMode;
  readonly source: RepoHarnessRegistrySource;
  readonly registeredAt: string;
  readonly lastSeenAt: string;
}

interface RepoHarnessRegistryFile {
  readonly version: 1;
  readonly authorizationRevision: number;
  readonly repos: readonly RepoHarnessRegisteredRepo[];
}

const REGISTRY_LOCK_RETRY_MS = 10;
const REGISTRY_LOCK_TIMEOUT_MS = 10_000;
const REGISTRY_LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));

interface RegistryLockOwner {
  readonly pid: number;
  readonly token: string;
  readonly acquiredAt: string;
}

export interface RepoHarnessAccessUpdateResult extends RepoHarnessRegisterResult {
  readonly accessMode: RepoHarnessAccessMode;
  readonly authorizationRevision: number;
}

export interface RepoHarnessRegisterResult {
  readonly path: string;
  readonly registryPath: string;
  readonly registered: boolean;
  readonly changed: boolean;
  readonly reason?: string;
}

export interface RepoHarnessRegistryBatchEntry {
  readonly repoRoot: string;
  readonly source: RepoHarnessRegistrySource;
  readonly accessMode?: RepoHarnessAccessMode;
}

export interface RepoHarnessRegistryBatchResult {
  readonly registryPath: string;
  readonly changed: boolean;
  readonly authorizationRevision: number;
  readonly repos: readonly RepoHarnessRegisteredRepo[];
}

/**
 * One read of the registry authority.  `repos` and
 * `authorizationRevision` come from the same atomically replaced file, so a
 * caller cannot accidentally pair an authorization fence from one revision
 * with repository rows from another.
 */
export interface RepoHarnessRegistrySnapshot {
  readonly registryPath: string;
  readonly authorizationRevision: number;
  readonly repos: readonly RepoHarnessRegisteredRepo[];
}

/**
 * The normal registry reader predates the fleet projection and intentionally
 * turns a malformed optional registry into an empty list for legacy callers.
 * Fleet enumeration is an authority boundary instead: silently treating bad
 * authorization bytes as zero repositories would make a successful board
 * indistinguishable from a lost registry.  Keep that stricter policy here,
 * beside the only registry parser, rather than teaching fleet a second parser.
 */
export type RepoHarnessRegistryStrictErrorCode =
  | 'fleet_registry_unavailable'
  | 'fleet_registry_invalid';

export class RepoHarnessRegistryStrictError extends Error {
  constructor(readonly code: RepoHarnessRegistryStrictErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RepoHarnessRegistryStrictError';
  }
}

export interface RepoHarnessRegistryStrictSnapshot extends RepoHarnessRegistrySnapshot {
  /** Digest of the exact authority bytes observed for this enumeration. */
  readonly registryRevision: string;
}

function repoHarnessHome(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.REPO_HARNESS_HOME ?? join(env.HOME ?? env.USERPROFILE ?? homedir(), ".repo-harness"));
}

export function repoHarnessRegisteredReposPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(repoHarnessHome(env), "registered-repos.json");
}

export function repoHarnessRepoIdFor(path: string): string {
  return `repo_${createHash("sha256").update(path).digest("hex").slice(0, 16)}`;
}

function canonicalRepoPath(path: string): string {
  const absolute = resolve(path);
  try {
    if (!statSync(absolute).isDirectory()) return absolute;
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

export function isRepoHarnessAdoptedPath(repoRoot: string): boolean {
  return existsSync(join(repoRoot, ".ai", "harness", "policy.json")) ||
    existsSync(join(repoRoot, "tasks", "current.md"));
}

function normalizeSource(value: unknown): RepoHarnessRegistrySource {
  return value === "adopt" || value === "init" || value === "mcp-setup" || value === "manual" || value === "discovery" // "adopt" read-only; see RepoHarnessRegistrySource
    ? value
    : "manual";
}

function normalizeAccessMode(value: unknown): RepoHarnessAccessMode {
  return value === "read_write" ? "read_write" : "read_only";
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function readRegistryFile(path: string): RepoHarnessRegistryFile {
  if (!existsSync(path)) return { version: 1, authorizationRevision: 0, repos: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
      version?: unknown;
      repos?: unknown;
    };
    if (parsed.version !== undefined && parsed.version !== 1) return { version: 1, authorizationRevision: 0, repos: [] };
    if (!Array.isArray(parsed.repos)) return { version: 1, authorizationRevision: 0, repos: [] };
    const now = new Date().toISOString();
    const repos = parsed.repos
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry))
      .map((entry): RepoHarnessRegisteredRepo | null => {
        const rawPath = typeof entry.path === "string" ? entry.path.trim() : "";
        if (!rawPath) return null;
        const canonicalPath = canonicalRepoPath(rawPath);
        return {
          id: typeof entry.id === "string" && entry.id.trim() ? entry.id : repoHarnessRepoIdFor(canonicalPath),
          path: canonicalPath,
          accessMode: normalizeAccessMode(entry.accessMode),
          source: normalizeSource(entry.source),
          registeredAt: normalizeTimestamp(entry.registeredAt, now),
          lastSeenAt: normalizeTimestamp(entry.lastSeenAt, now),
        };
      })
      .filter((entry): entry is RepoHarnessRegisteredRepo => entry !== null);
    const authorizationRevision = typeof (parsed as { authorizationRevision?: unknown }).authorizationRevision === 'number'
      && Number.isInteger((parsed as { authorizationRevision: number }).authorizationRevision)
      && (parsed as { authorizationRevision: number }).authorizationRevision >= 0
      ? (parsed as { authorizationRevision: number }).authorizationRevision
      : 0;
    return { version: 1, authorizationRevision, repos };
  } catch {
    return { version: 1, authorizationRevision: 0, repos: [] };
  }
}

function dedupeRepos(repos: readonly RepoHarnessRegisteredRepo[]): RepoHarnessRegisteredRepo[] {
  const byPath = new Map<string, RepoHarnessRegisteredRepo>();
  for (const repo of repos) {
    const existing = byPath.get(repo.path);
    if (!existing || repo.lastSeenAt.localeCompare(existing.lastSeenAt) >= 0) {
      byPath.set(repo.path, repo);
    }
  }
  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function writeRegistryFile(path: string, repos: readonly RepoHarnessRegisteredRepo[], authorizationRevision: number): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ version: 1, authorizationRevision, repos: dedupeRepos(repos) }, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  renameSync(temporary, path);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function describeRegistryLock(path: string): string {
  try {
    const owner = JSON.parse(readFileSync(path, 'utf-8')) as Partial<RegistryLockOwner>;
    if (!Number.isInteger(owner.pid) || typeof owner.token !== 'string' || typeof owner.acquiredAt !== 'string') {
      return 'owner metadata is invalid';
    }
    try {
      process.kill(owner.pid!, 0);
      return `owner pid ${owner.pid} is still running`;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ESRCH') {
        return `owner pid ${owner.pid} is not running; verify and remove this stale lock manually`;
      }
      return `owner pid ${owner.pid} could not be verified`;
    }
  } catch {
    return 'owner metadata is unreadable; verify and remove this stale lock manually';
  }
}

function acquireRegistryMutationLock(registryPath: string): () => void {
  mkdirSync(dirname(registryPath), { recursive: true, mode: 0o700 });
  const lockPath = `${registryPath}.lock`;
  const owner: RegistryLockOwner = {
    pid: process.pid,
    token: randomUUID(),
    acquiredAt: new Date().toISOString(),
  };
  const deadline = Date.now() + REGISTRY_LOCK_TIMEOUT_MS;

  while (true) {
    try {
      const descriptor = openSync(lockPath, 'wx', 0o600);
      try {
        writeFileSync(descriptor, `${JSON.stringify(owner)}\n`, { encoding: 'utf-8' });
        closeSync(descriptor);
      } catch (error) {
        try {
          closeSync(descriptor);
        } catch {
          // Best effort: the descriptor may already have been closed by a failed close.
        }
        try {
          unlinkSync(lockPath);
        } catch {
          // Preserve the acquisition error; a later attempt will fail closed on any leftover lock.
        }
        throw error;
      }
      return () => {
        const current = JSON.parse(readFileSync(lockPath, 'utf-8')) as Partial<RegistryLockOwner>;
        if (current.token !== owner.token) {
          throw new Error(`registry mutation lock ownership changed before release: ${lockPath}`);
        }
        unlinkSync(lockPath);
      };
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for registry mutation lock ${lockPath}: ${describeRegistryLock(lockPath)}`);
      }
      Atomics.wait(REGISTRY_LOCK_SLEEP, 0, 0, REGISTRY_LOCK_RETRY_MS);
    }
  }
}

function withRegistryMutationLock<T>(registryPath: string, mutation: () => T): T {
  const release = acquireRegistryMutationLock(registryPath);
  try {
    return mutation();
  } finally {
    release();
  }
}

export function readRegisteredRepoHarnessRepos(opts: {
  readonly env?: NodeJS.ProcessEnv;
  readonly adoptedOnly?: boolean;
} = {}): RepoHarnessRegisteredRepo[] {
  return [...readRepoHarnessRegistrySnapshot(opts).repos];
}

/**
 * Read the registry once and return a coherent authorization snapshot.  The
 * registry writer uses temp+rename, so `readFileSync` observes either the old
 * complete document or the new complete document, never a partially-written
 * one.  Filtering adopted repos happens after the parse but remains part of
 * this one returned snapshot.
 */
export function readRepoHarnessRegistrySnapshot(opts: {
  readonly env?: NodeJS.ProcessEnv;
  readonly adoptedOnly?: boolean;
} = {}): RepoHarnessRegistrySnapshot {
  const registryPath = repoHarnessRegisteredReposPath(opts.env);
  const registry = readRegistryFile(registryPath);
  const repos = dedupeRepos(registry.repos).filter((repo) => (
    opts.adoptedOnly !== true || isRepoHarnessAdoptedPath(repo.path)
  ));
  return Object.freeze({
    registryPath,
    authorizationRevision: registry.authorizationRevision,
    repos: Object.freeze(repos.map((repo) => Object.freeze({ ...repo }))),
  });
}

function strictRegistryEntry(value: unknown, index: number): RepoHarnessRegisteredRepo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', `registry repo ${index} must be an object`);
  }
  const entry = value as Record<string, unknown>;
  const expected = ['accessMode', 'id', 'lastSeenAt', 'path', 'registeredAt', 'source'];
  const keys = Object.keys(entry).sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', `registry repo ${index} fields are invalid`);
  }
  if (typeof entry.id !== 'string' || entry.id.trim() === '') {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', `registry repo ${index} id is invalid`);
  }
  if (typeof entry.path !== 'string' || entry.path.trim() === '' || !isAbsolute(entry.path) || resolve(entry.path) !== entry.path) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', `registry repo ${index} path is invalid`);
  }
  if (entry.accessMode !== 'read_only' && entry.accessMode !== 'read_write') {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', `registry repo ${index} access mode is invalid`);
  }
  if (entry.source !== 'adopt' && entry.source !== 'init' && entry.source !== 'mcp-setup'
    && entry.source !== 'manual' && entry.source !== 'discovery') {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', `registry repo ${index} source is invalid`);
  }
  if (typeof entry.registeredAt !== 'string' || entry.registeredAt.trim() === ''
    || typeof entry.lastSeenAt !== 'string' || entry.lastSeenAt.trim() === '') {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', `registry repo ${index} timestamps are invalid`);
  }
  return Object.freeze({
    id: entry.id,
    path: entry.path,
    accessMode: entry.accessMode,
    source: entry.source,
    registeredAt: entry.registeredAt,
    lastSeenAt: entry.lastSeenAt,
  });
}

/**
 * Read every authorized row once without the legacy empty-registry fallback.
 * This does not touch repository paths: a missing or unsafe individual root
 * is a repository-local fleet result, while malformed enumeration authority is
 * fatal before a collector can claim it saw all authorized repositories.
 */
export function readRepoHarnessRegistryStrictSnapshot(opts: {
  readonly env?: NodeJS.ProcessEnv;
  readonly adoptedOnly?: false;
} = {}): RepoHarnessRegistryStrictSnapshot {
  const registryPath = repoHarnessRegisteredReposPath(opts.env);
  let stat;
  try {
    stat = lstatSync(registryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Object.freeze({
        registryPath,
        authorizationRevision: 0,
        registryRevision: `sha256:${createHash('sha256').update('repo-harness-registry-v1:empty', 'utf-8').digest('hex')}`,
        repos: Object.freeze([]),
      });
    }
    throw new RepoHarnessRegistryStrictError('fleet_registry_unavailable', `cannot inspect registry authority: ${registryPath}`, error);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', `registry authority is not a regular file: ${registryPath}`);
  }
  let raw: string;
  try {
    raw = readFileSync(registryPath, 'utf-8');
  } catch (error) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_unavailable', `cannot read registry authority: ${registryPath}`, error);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', `registry authority is not valid JSON: ${registryPath}`, error);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', 'registry authority must be an object');
  }
  const record = parsed as Record<string, unknown>;
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(['authorizationRevision', 'repos', 'version'])) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', 'registry authority fields are invalid');
  }
  if (record.version !== 1 || !Number.isInteger(record.authorizationRevision) || (record.authorizationRevision as number) < 0) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', 'registry authority version or revision is invalid');
  }
  if (!Array.isArray(record.repos)) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', 'registry authority repos must be an array');
  }
  const repos = record.repos.map(strictRegistryEntry);
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const repo of repos) {
    if (ids.has(repo.id) || paths.has(repo.path)) {
      throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', 'registry authority has duplicate repository identities');
    }
    ids.add(repo.id);
    paths.add(repo.path);
  }
  return Object.freeze({
    registryPath,
    authorizationRevision: record.authorizationRevision as number,
    registryRevision: `sha256:${createHash('sha256').update(raw, 'utf-8').digest('hex')}`,
    repos: Object.freeze([...repos].sort((left, right) => left.id.localeCompare(right.id))),
  });
}

export function repoHarnessAuthorizationRevision(env: NodeJS.ProcessEnv = process.env): number {
  return readRegistryFile(repoHarnessRegisteredReposPath(env)).authorizationRevision;
}

export function bumpRepoHarnessAuthorizationRevision(env: NodeJS.ProcessEnv = process.env): number {
  const path = repoHarnessRegisteredReposPath(env);
  return withRegistryMutationLock(path, () => {
    const registry = readRegistryFile(path);
    const next = registry.authorizationRevision + 1;
    writeRegistryFile(path, registry.repos, next);
    return next;
  });
}

export function applyRepoHarnessRegistryBatch(
  entries: readonly RepoHarnessRegistryBatchEntry[],
  opts: {
    readonly env?: NodeJS.ProcessEnv;
    readonly requireAdopted?: boolean;
    readonly bumpAuthorizationRevision?: boolean;
    readonly beforeCommit?: (authorizationRevision: number) => void;
    readonly onCommitFailure?: () => void;
  } = {},
): RepoHarnessRegistryBatchResult {
  const registryPath = repoHarnessRegisteredReposPath(opts.env);
  const canonicalEntries = entries.map((entry) => ({ ...entry, repoRoot: canonicalRepoPath(entry.repoRoot) }));
  return withRegistryMutationLock(registryPath, () => {
    if (opts.requireAdopted !== false) {
      const unadopted = canonicalEntries.find((entry) => !isRepoHarnessAdoptedPath(entry.repoRoot));
      if (unadopted) throw new Error(`repo is not repo-harness adopted: ${unadopted.repoRoot}`);
    }
    const registry = readRegistryFile(registryPath);
    const now = new Date().toISOString();
    let repos = dedupeRepos(registry.repos);
    let accessChanged = false;
    for (const entry of canonicalEntries) {
      const previous = repos.find((repo) => repo.path === entry.repoRoot);
      const accessMode = entry.accessMode ?? previous?.accessMode ?? 'read_only';
      if (accessMode !== (previous?.accessMode ?? 'read_only')) accessChanged = true;
      const next: RepoHarnessRegisteredRepo = {
        id: previous?.id ?? repoHarnessRepoIdFor(entry.repoRoot),
        path: entry.repoRoot,
        accessMode,
        source: entry.source,
        registeredAt: previous?.registeredAt ?? now,
        lastSeenAt: now,
      };
      repos = previous
        ? repos.map((repo) => repo.path === entry.repoRoot ? next : repo)
        : [...repos, next];
    }
    repos = dedupeRepos(repos);
    const revisionChanged = accessChanged || opts.bumpAuthorizationRevision === true;
    const authorizationRevision = registry.authorizationRevision + (revisionChanged ? 1 : 0);
    const changed = JSON.stringify(repos) !== JSON.stringify(dedupeRepos(registry.repos)) || revisionChanged;
    let prepared = false;
    try {
      opts.beforeCommit?.(authorizationRevision);
      prepared = true;
      if (changed) writeRegistryFile(registryPath, repos, authorizationRevision);
    } catch (error) {
      if (prepared) opts.onCommitFailure?.();
      throw error;
    }
    return { registryPath, changed, authorizationRevision, repos };
  });
}

export function registeredRepoHarnessRoots(opts: {
  readonly env?: NodeJS.ProcessEnv;
  readonly adoptedOnly?: boolean;
} = {}): string[] {
  return readRegisteredRepoHarnessRepos(opts).map((repo) => repo.path);
}

export function isRegisteredRepoHarnessRoot(repoRoot: string, opts: { readonly env?: NodeJS.ProcessEnv } = {}): boolean {
  const canonical = canonicalRepoPath(repoRoot);
  return readRegisteredRepoHarnessRepos({ env: opts.env, adoptedOnly: true }).some((repo) => repo.path === canonical);
}

export function registerRepoHarnessRepo(
  repoRoot: string,
  source: RepoHarnessRegistrySource,
  opts: { readonly env?: NodeJS.ProcessEnv; readonly requireAdopted?: boolean } = {},
): RepoHarnessRegisterResult {
  const canonical = canonicalRepoPath(repoRoot);
  const registryPath = repoHarnessRegisteredReposPath(opts.env);
  if (opts.requireAdopted !== false && !isRepoHarnessAdoptedPath(canonical)) {
    return {
      path: canonical,
      registryPath,
      registered: false,
      changed: false,
      reason: "repo is not repo-harness adopted",
    };
  }

  return withRegistryMutationLock(registryPath, () => {
    const now = new Date().toISOString();
    const registry = readRegistryFile(registryPath);
    const existing = dedupeRepos(registry.repos);
    const previous = existing.find((repo) => repo.path === canonical);
    const nextEntry: RepoHarnessRegisteredRepo = {
      id: previous?.id ?? repoHarnessRepoIdFor(canonical),
      path: canonical,
      accessMode: previous?.accessMode ?? "read_only",
      source,
      registeredAt: previous?.registeredAt ?? now,
      lastSeenAt: now,
    };
    const next = previous
      ? existing.map((repo) => repo.path === canonical ? nextEntry : repo)
      : [...existing, nextEntry];
    const changed = !previous || previous.source !== nextEntry.source || previous.lastSeenAt !== nextEntry.lastSeenAt;
    if (changed) writeRegistryFile(registryPath, next, registry.authorizationRevision);
    return { path: canonical, registryPath, registered: true, changed };
  });
}

export function setRepoHarnessAccessMode(
  repoRoot: string,
  accessMode: RepoHarnessAccessMode,
  opts: { readonly env?: NodeJS.ProcessEnv; readonly requireAdopted?: boolean } = {},
): RepoHarnessAccessUpdateResult {
  const registration = registerRepoHarnessRepo(repoRoot, 'manual', opts);
  if (!registration.registered) {
    return {
      ...registration,
      accessMode,
      authorizationRevision: repoHarnessAuthorizationRevision(opts.env),
    };
  }
  const registryPath = registration.registryPath;
  return withRegistryMutationLock(registryPath, () => {
    const registry = readRegistryFile(registryPath);
    const canonical = registration.path;
    const previous = registry.repos.find((entry) => entry.path === canonical);
    if (!previous) {
      throw new Error(`registered repo disappeared before access update: ${canonical}`);
    }
    const changed = previous.accessMode !== accessMode;
    const authorizationRevision = changed ? registry.authorizationRevision + 1 : registry.authorizationRevision;
    const repos = registry.repos.map((entry) => entry.path === canonical ? { ...entry, accessMode, lastSeenAt: new Date().toISOString() } : entry);
    if (changed || registration.changed) writeRegistryFile(registryPath, repos, authorizationRevision);
    return {
      path: canonical,
      registryPath,
      registered: true,
      changed,
      accessMode,
      authorizationRevision,
    };
  });
}
