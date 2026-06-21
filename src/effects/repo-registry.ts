import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";

export type RepoHarnessRegistrySource = "adopt" | "init" | "mcp-setup" | "manual" | "discovery";

export interface RepoHarnessRegisteredRepo {
  readonly id: string;
  readonly path: string;
  readonly source: RepoHarnessRegistrySource;
  readonly registeredAt: string;
  readonly lastSeenAt: string;
}

interface RepoHarnessRegistryFile {
  readonly version: 1;
  readonly repos: readonly RepoHarnessRegisteredRepo[];
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

function repoIdFor(path: string): string {
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

function normalizeTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function readRegistryFile(path: string): RepoHarnessRegistryFile {
  if (!existsSync(path)) return { version: 1, repos: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
      version?: unknown;
      repos?: unknown;
    };
    if (parsed.version !== undefined && parsed.version !== 1) return { version: 1, repos: [] };
    if (!Array.isArray(parsed.repos)) return { version: 1, repos: [] };
    const now = new Date().toISOString();
    const repos = parsed.repos
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry))
      .map((entry): RepoHarnessRegisteredRepo | null => {
        const rawPath = typeof entry.path === "string" ? entry.path.trim() : "";
        if (!rawPath) return null;
        const canonicalPath = canonicalRepoPath(rawPath);
        return {
          id: typeof entry.id === "string" && entry.id.trim() ? entry.id : repoIdFor(canonicalPath),
          path: canonicalPath,
          source: normalizeSource(entry.source),
          registeredAt: normalizeTimestamp(entry.registeredAt, now),
          lastSeenAt: normalizeTimestamp(entry.lastSeenAt, now),
        };
      })
      .filter((entry): entry is RepoHarnessRegisteredRepo => entry !== null);
    return { version: 1, repos };
  } catch {
    return { version: 1, repos: [] };
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

function writeRegistryFile(path: string, repos: readonly RepoHarnessRegisteredRepo[]): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({ version: 1, repos: dedupeRepos(repos) }, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
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

  const now = new Date().toISOString();
  const existing = dedupeRepos(readRegistryFile(registryPath).repos);
  const previous = existing.find((repo) => repo.path === canonical);
  const nextEntry: RepoHarnessRegisteredRepo = {
    id: previous?.id ?? repoIdFor(canonical),
    path: canonical,
    source,
    registeredAt: previous?.registeredAt ?? now,
    lastSeenAt: now,
  };
  const next = previous
    ? existing.map((repo) => repo.path === canonical ? nextEntry : repo)
    : [...existing, nextEntry];
  const changed = !previous || previous.source !== nextEntry.source || previous.lastSeenAt !== nextEntry.lastSeenAt;
  if (changed) writeRegistryFile(registryPath, next);
  return { path: canonical, registryPath, registered: true, changed };
}
