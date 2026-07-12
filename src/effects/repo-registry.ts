import { createHash, randomUUID } from "crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";

export type RepoHarnessRegistrySource = "adopt" | "init" | "mcp-setup" | "manual" | "discovery";
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
  return value === "adopt" || value === "init" || value === "mcp-setup" || value === "manual" || value === "discovery"
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
      } finally {
        closeSync(descriptor);
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
  const path = repoHarnessRegisteredReposPath(opts.env);
  const repos = dedupeRepos(readRegistryFile(path).repos);
  return opts.adoptedOnly === true
    ? repos.filter((repo) => isRepoHarnessAdoptedPath(repo.path))
    : repos;
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
