import { createHash } from "crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { basename, dirname, isAbsolute, join, resolve } from "path";
import {
  acquireExclusiveDirectoryLock,
  exclusiveDirectoryLockOwnerLiveness,
  ExclusiveLockContentionError,
  readExclusiveDirectoryLockOwner,
  type ExclusiveDirectoryLockHandle,
  type ExclusiveDirectoryLockOwner,
} from "./locking/exclusive-directory-lock";
import { gitSpawnSync, REPOSITORY_SELECTING_GIT_ENV } from "./git/runner";

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

/** The single account-level harness home; every host-owned authority store roots here. */
export function repoHarnessHome(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.REPO_HARNESS_HOME ?? join(env.HOME ?? env.USERPROFILE ?? homedir(), ".repo-harness"));
}

export function repoHarnessRegisteredReposPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(repoHarnessHome(env), "registered-repos.json");
}

export function repoHarnessRepoIdFor(path: string): string {
  return `repo_${createHash("sha256").update(path).digest("hex").slice(0, 16)}`;
}

/**
 * The single canonicalization rule for a repository root. `repoHarnessRepoIdFor`
 * hashes its argument verbatim, and every writer of a stored `repository_id`
 * passes a path through here first, so any caller that later compares against a
 * stored id must canonicalize the same way. `resolve` alone is not enough: it is
 * lexical and cannot collapse a symlink, so a symlinked root would still derive a
 * different id. Falls back to the resolved path when the target does not exist,
 * so a caller keeps its own clear not-a-repository error instead of a raw ENOENT.
 */
export function canonicalRepoPath(path: string): string {
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

export type RepoHarnessCheckoutRejectionReason = "not_primary_checkout" | "git_probe_failed";

export interface RepoHarnessCheckoutRejection {
  readonly reason: RepoHarnessCheckoutRejectionReason;
  readonly message: string;
}

type GitLines = { readonly ok: true; readonly lines: string[] } | { readonly ok: false; readonly detail: string };

// The probe must read the checkout at repoRoot, not the repository an outer git hook selected.
function probeEnv(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  const probe = { ...(env ?? process.env) };
  for (const key of [...REPOSITORY_SELECTING_GIT_ENV, "GIT_COMMON_DIR"]) delete probe[key];
  return probe;
}

function gitLines(repoRoot: string, args: readonly string[], env: NodeJS.ProcessEnv | undefined): GitLines {
  const result = gitSpawnSync(args, { cwd: repoRoot, env: probeEnv(env), encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error) return { ok: false, detail: result.error.message };
  if (result.status !== 0) return { ok: false, detail: result.stderr.trim() || `git exited with status ${result.status}` };
  return { ok: true, lines: result.stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0) };
}

function gitEntryPresent(repoRoot: string): boolean {
  try {
    lstatSync(join(repoRoot, ".git"));
    return true;
  } catch (error) {
    return !(isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTDIR"));
  }
}

function linkedWorktreeMessage(repoRoot: string, commonDir: string, env: NodeJS.ProcessEnv | undefined): string {
  const listing = gitLines(repoRoot, ["worktree", "list", "--porcelain"], env);
  if (!listing.ok) {
    return `${repoRoot} is a linked worktree of ${commonDir}, not a primary checkout; its primary checkout could not be listed: ${listing.detail}`;
  }
  // Git lists the main worktree first; a bare main worktree carries a `bare` line.
  const first = listing.lines[0] ?? "";
  if (!first.startsWith("worktree ")) {
    return `${repoRoot} is a linked worktree of ${commonDir}, not a primary checkout; its primary checkout could not be listed`;
  }
  const mainPath = canonicalRepoPath(first.slice("worktree ".length));
  const nextRecord = listing.lines.findIndex((line, index) => index > 0 && line.startsWith("worktree "));
  const mainRecord = listing.lines.slice(1, nextRecord < 0 ? undefined : nextRecord);
  if (mainRecord.includes("bare")) {
    return `${repoRoot} is a linked worktree of the bare repository ${mainPath}, which has no primary checkout`;
  }
  return `${repoRoot} is a linked worktree, not a primary checkout; register the primary checkout ${mainPath} instead`;
}

/**
 * Registry rows name primary checkouts only. A linked worktree carries the
 * same tracked adoption marker, so adoption cannot tell it apart; git's own
 * directories can. The path is never rewritten to the primary checkout: the
 * caller decides which path to register. A root without a `.git` entry that
 * git does not place in any work tree is a non-git scaffold (`init --repo`)
 * and stays registrable; a failed probe of a root with a `.git` entry fails
 * closed.
 */
export function repoHarnessCheckoutRejection(
  repoRoot: string,
  env?: NodeJS.ProcessEnv,
): RepoHarnessCheckoutRejection | null {
  const dirs = gitLines(repoRoot, ["rev-parse", "--git-dir", "--git-common-dir"], env);
  if (!dirs.ok) {
    if (!gitEntryPresent(repoRoot)) return null;
    return { reason: "git_probe_failed", message: `cannot read the git directories of ${repoRoot}: ${dirs.detail}` };
  }
  if (dirs.lines.length !== 2) {
    return { reason: "git_probe_failed", message: `cannot read the git directories of ${repoRoot}: unexpected rev-parse output` };
  }
  let gitDir: string;
  let commonDir: string;
  try {
    gitDir = realpathSync(resolve(repoRoot, dirs.lines[0]!));
    commonDir = realpathSync(resolve(repoRoot, dirs.lines[1]!));
  } catch (error) {
    return {
      reason: "git_probe_failed",
      message: `cannot resolve the git directories of ${repoRoot}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (gitDir === commonDir) return null;
  return { reason: "not_primary_checkout", message: linkedWorktreeMessage(repoRoot, commonDir, env) };
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
  const canonicalRepos = dedupeRepos(repos).map((repo): RepoHarnessRegisteredRepo => ({
    id: repoHarnessRepoIdFor(repo.path),
    path: repo.path,
    accessMode: repo.accessMode,
    source: repo.source,
    registeredAt: repo.registeredAt,
    lastSeenAt: repo.lastSeenAt,
  }));
  writeFileSync(temporary, `${JSON.stringify({ version: 1, authorizationRevision, repos: canonicalRepos }, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  renameSync(temporary, path);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

interface RegistryLockLocation {
  readonly root: string;
  readonly relativePath: string;
}

function registryLockLocation(registryPath: string): RegistryLockLocation {
  mkdirSync(dirname(registryPath), { recursive: true, mode: 0o700 });
  return { root: realpathSync(dirname(registryPath)), relativePath: `${basename(registryPath)}.lock` };
}

function describeRegistryLock(location: RegistryLockLocation): string {
  let owner: ExclusiveDirectoryLockOwner | null;
  try {
    owner = readExclusiveDirectoryLockOwner(location.root, location.relativePath);
  } catch {
    owner = null;
  }
  if (owner === null) return 'owner metadata is unreadable; verify and remove this stale lock manually';
  const liveness = exclusiveDirectoryLockOwnerLiveness(owner);
  if (liveness === 'live') return `owner pid ${owner.pid} is still running`;
  if (liveness === 'dead') return `owner pid ${owner.pid} is not running; verify and remove this stale lock manually`;
  return `owner pid ${owner.pid} could not be verified`;
}

class RegistryMutationLockTimeoutError extends Error {}

function acquireRegistryMutationLock(registryPath: string, waitMs = REGISTRY_LOCK_TIMEOUT_MS): () => void {
  const location = registryLockLocation(registryPath);
  let lock: ExclusiveDirectoryLockHandle;
  try {
    lock = acquireExclusiveDirectoryLock(location.root, location.relativePath, {
      waitTimeoutMs: waitMs,
      reclaimStaleEmptyDirectory: true,
    });
  } catch (error) {
    if (!(error instanceof ExclusiveLockContentionError)) throw error;
    throw new RegistryMutationLockTimeoutError(
      `timed out waiting for registry mutation lock ${error.lockPath}: ${describeRegistryLock(location)}`,
    );
  }
  return () => {
    try {
      lock.assertOwned();
    } catch (error) {
      if (!(error instanceof ExclusiveLockContentionError)) throw error;
      throw new Error(`registry mutation lock ownership changed before release: ${lock.lockPath}`);
    } finally {
      // Release removes only this handle's own token, so it is safe after lost ownership.
      lock.release();
    }
  };
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
  const canonicalPath = canonicalRepoPath(entry.path);
  if (canonicalPath !== entry.path) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', `registry repo ${index} path is not canonical`);
  }
  if (entry.id !== repoHarnessRepoIdFor(canonicalPath)) {
    throw new RepoHarnessRegistryStrictError('fleet_registry_invalid', `registry repo ${index} id does not match its canonical path`);
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

/**
 * Serialize an authorization-sensitive operation with registry mutations.
 *
 * The callback observes one strict registry revision while its mutation lock
 * remains held. Task publication callers acquire their task lock before this
 * short final authorization section; never wait for a task lock inside it.
 * Registry mutation paths acquire no task or Engineer locks.
 */
export function withRepoHarnessRegistryAuthorizationLock<T>(
  opts: { readonly env?: NodeJS.ProcessEnv } = {},
  action: (snapshot: RepoHarnessRegistryStrictSnapshot) => T,
): T {
  const registryPath = repoHarnessRegisteredReposPath(opts.env);
  return withRegistryMutationLock(registryPath, () => (
    action(readRepoHarnessRegistryStrictSnapshot({ env: opts.env, adoptedOnly: false }))
  ));
}

/** Hold the existing authorization lock until a bounded launch or delivery settles. */
export async function withRepoHarnessRegistryAuthorizationLockAsync<T>(
  opts: { readonly env?: NodeJS.ProcessEnv } = {},
  action: (snapshot: RepoHarnessRegistryStrictSnapshot) => Promise<T>,
): Promise<T> {
  const deadline = Date.now() + REGISTRY_LOCK_TIMEOUT_MS;
  let release: () => void;
  for (;;) {
    try { release = acquireRegistryMutationLock(repoHarnessRegisteredReposPath(opts.env), 1); break; }
    catch (error) {
      if (!(error instanceof RegistryMutationLockTimeoutError) || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, REGISTRY_LOCK_RETRY_MS));
    }
  }
  try { return await action(readRepoHarnessRegistryStrictSnapshot({ env: opts.env, adoptedOnly: false })); }
  finally { release(); }
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
    readonly recordChanges?: (before: readonly RepoHarnessRegisteredRepo[], after: readonly RepoHarnessRegisteredRepo[]) => void;
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
    for (const entry of canonicalEntries) {
      const rejection = repoHarnessCheckoutRejection(entry.repoRoot, opts.env);
      if (rejection) throw new Error(rejection.message);
    }
    const registry = opts.recordChanges ? readRepoHarnessRegistryStrictSnapshot({ env: opts.env }) : readRegistryFile(registryPath);
    const now = new Date().toISOString();
    let repos = dedupeRepos(registry.repos);
    let accessChanged = false;
    for (const entry of canonicalEntries) {
      const previous = repos.find((repo) => repo.path === entry.repoRoot);
      const accessMode = entry.accessMode ?? previous?.accessMode ?? 'read_only';
      if (accessMode !== (previous?.accessMode ?? 'read_only')) accessChanged = true;
      const next: RepoHarnessRegisteredRepo = {
        id: repoHarnessRepoIdFor(entry.repoRoot),
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
      opts.recordChanges?.(registry.repos, repos);
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
  const rejection = repoHarnessCheckoutRejection(canonical, opts.env);
  if (rejection) {
    return { path: canonical, registryPath, registered: false, changed: false, reason: rejection.message };
  }

  return withRegistryMutationLock(registryPath, () => {
    const now = new Date().toISOString();
    const registry = readRegistryFile(registryPath);
    const existing = dedupeRepos(registry.repos);
    const previous = existing.find((repo) => repo.path === canonical);
    const nextEntry: RepoHarnessRegisteredRepo = {
      id: repoHarnessRepoIdFor(canonical),
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

/** Restore only proven setup-owned rows while holding the registry's mutation lock. */
export function restoreRepoHarnessRegistryEntries(
  changes: readonly { before: RepoHarnessRegisteredRepo | null; installed: RepoHarnessRegisteredRepo }[],
  opts: { env?: NodeJS.ProcessEnv; dryRun?: boolean } = {},
): { restored: string[]; conflicts: string[] } {
  const apply = () => {
    const snapshot = readRepoHarnessRegistryStrictSnapshot({ env: opts.env });
    let repos = [...snapshot.repos];
    const restored: string[] = [], conflicts: string[] = [];
    for (const entry of changes) {
      strictRegistryEntry(entry.installed, 0);
      if (entry.before) strictRegistryEntry(entry.before, 0);
      if (entry.before && entry.before.path !== entry.installed.path) throw new Error('registry restore identity mismatch');
      const current = repos.find((row) => row.path === entry.installed.path) ?? null;
      const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      if (equal(current, entry.before)) { restored.push(entry.installed.path); continue; }
      if (!equal(current, entry.installed)) { conflicts.push(entry.installed.path); continue; }
      repos = repos.filter((row) => row.path !== entry.installed.path);
      if (entry.before) repos.push(entry.before);
      restored.push(entry.installed.path);
    }
    if (!opts.dryRun && JSON.stringify(repos) !== JSON.stringify(snapshot.repos)) {
      writeRegistryFile(snapshot.registryPath, repos, snapshot.authorizationRevision + 1);
    }
    return { restored, conflicts };
  };
  return opts.dryRun ? apply() : withRegistryMutationLock(repoHarnessRegisteredReposPath(opts.env), apply);
}

export type RepoHarnessBackfillRejectionReason = "missing" | "unreadable" | "not_adopted" | RepoHarnessCheckoutRejectionReason;

export interface RepoHarnessBackfillResult {
  readonly registry_path: string;
  readonly registered: readonly { readonly id: string; readonly path: string }[];
  readonly already_registered: readonly { readonly id: string; readonly path: string }[];
  readonly rejected: readonly { readonly path: string; readonly reason: RepoHarnessBackfillRejectionReason; readonly message: string }[];
}

function backfillRejection(
  path: string,
  env: NodeJS.ProcessEnv | undefined,
): { reason: RepoHarnessBackfillRejectionReason; message: string } | null {
  try {
    statSync(path);
  } catch (error) {
    const code = isNodeError(error) ? error.code : undefined;
    return code === "ENOENT" || code === "ENOTDIR"
      ? { reason: "missing", message: `${path} does not exist` }
      : { reason: "unreadable", message: `${path} cannot be inspected (${code ?? "probe_failed"})` };
  }
  if (!isRepoHarnessAdoptedPath(path)) return { reason: "not_adopted", message: `${path} is not repo-harness adopted` };
  return repoHarnessCheckoutRejection(path, env);
}

/**
 * Operator-invoked one-shot backfill of explicit paths. It never scans a
 * directory tree. Each path is checked and written on its own, so one rejected
 * path does not block the others. An existing row keeps its source and access.
 */
export function backfillRepoHarnessRegistry(
  paths: readonly string[],
  opts: { readonly env?: NodeJS.ProcessEnv } = {},
): RepoHarnessBackfillResult {
  const registryPath = repoHarnessRegisteredReposPath(opts.env);
  // A malformed registry is a global precondition: fail before any write.
  readRepoHarnessRegistryStrictSnapshot({ env: opts.env });
  const registered: { id: string; path: string }[] = [];
  const alreadyRegistered: { id: string; path: string }[] = [];
  const rejected: { path: string; reason: RepoHarnessBackfillRejectionReason; message: string }[] = [];
  for (const input of paths) {
    const path = canonicalRepoPath(input);
    const rejection = backfillRejection(path, opts.env);
    if (rejection) {
      rejected.push({ path, ...rejection });
      continue;
    }
    const id = repoHarnessRepoIdFor(path);
    const added = withRegistryMutationLock(registryPath, () => {
      const snapshot = readRepoHarnessRegistryStrictSnapshot({ env: opts.env });
      if (snapshot.repos.some((repo) => repo.path === path)) return false;
      const now = new Date().toISOString();
      writeRegistryFile(registryPath, [...snapshot.repos, {
        id, path, accessMode: "read_only", source: "manual", registeredAt: now, lastSeenAt: now,
      }], snapshot.authorizationRevision);
      return true;
    });
    (added ? registered : alreadyRegistered).push({ id, path });
  }
  return { registry_path: registryPath, registered, already_registered: alreadyRegistered, rejected };
}

export type RepoHarnessPruneReason = "path_missing" | "not_primary_checkout";

/** Explicit operator cleanup; unreadable paths are not proof of absence. */
export function pruneRepoHarnessRegistry(opts: {
  readonly env?: NodeJS.ProcessEnv;
  readonly apply?: boolean;
  readonly expectedRevision?: string;
  readonly repoIds?: readonly string[];
} = {}) {
  if (opts.apply && !/^sha256:[0-9a-f]{64}$/.test(opts.expectedRevision ?? '')) {
    throw new Error('--apply requires --expected-revision from the preview');
  }
  const inspect = (snapshot: RepoHarnessRegistryStrictSnapshot) => {
    if (opts.expectedRevision !== undefined && opts.expectedRevision !== snapshot.registryRevision) {
      throw new Error('registry revision changed; preview again before applying');
    }
    const selected = opts.repoIds === undefined ? null : new Set(opts.repoIds);
    for (const id of selected ?? []) {
      if (!snapshot.repos.some(repo => repo.id === id)) throw new Error(`unknown registered repo id: ${id}`);
    }
    const candidates: (RepoHarnessRegisteredRepo & { reason: RepoHarnessPruneReason })[] = [];
    const skipped: { id: string; path: string; reason: string }[] = [];
    for (const repo of snapshot.repos) {
      if (selected !== null && !selected.has(repo.id)) continue;
      try {
        lstatSync(repo.path);
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') candidates.push({ ...repo, reason: 'path_missing' });
        else skipped.push({ id: repo.id, path: repo.path, reason: isNodeError(error) ? error.code ?? 'probe_failed' : 'probe_failed' });
        continue;
      }
      const rejection = repoHarnessCheckoutRejection(repo.path, opts.env);
      if (rejection?.reason === 'not_primary_checkout') candidates.push({ ...repo, reason: 'not_primary_checkout' });
      else skipped.push({ id: repo.id, path: repo.path, reason: rejection?.reason ?? 'path_present' });
    }
    const removed: RepoHarnessRegisteredRepo[] = opts.apply ? candidates.map(({ reason: _reason, ...repo }) => repo) : [];
    const ids = new Set(removed.map(repo => repo.id));
    const authorizationRevision = snapshot.authorizationRevision + (removed.length > 0 ? 1 : 0);
    if (removed.length > 0) {
      writeRegistryFile(snapshot.registryPath, snapshot.repos.filter(repo => !ids.has(repo.id)), authorizationRevision);
    }
    return { registry_path: snapshot.registryPath, registry_revision: snapshot.registryRevision,
      applied: opts.apply === true, authorization_revision: authorizationRevision,
      candidates, removed, skipped, remaining_count: snapshot.repos.length - removed.length };
  };
  return opts.apply
    ? withRepoHarnessRegistryAuthorizationLock({ env: opts.env }, inspect)
    : inspect(readRepoHarnessRegistryStrictSnapshot({ env: opts.env, adoptedOnly: false }));
}
