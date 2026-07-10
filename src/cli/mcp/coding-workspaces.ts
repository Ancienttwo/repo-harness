import { randomBytes, randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import {
  isRepoHarnessAdoptedPath,
  readRegisteredRepoHarnessRepos,
  type RepoHarnessRegisteredRepo,
} from '../../effects/repo-registry';
import { globMatches, isPathInside } from './paths';

export type CodingWorkspaceMode = 'checkout' | 'worktree';

export interface CodingWorkspace {
  id: string;
  repoId: string;
  displayName: string;
  root: string;
  sourceRoot: string;
  mode: CodingWorkspaceMode;
  branch: string;
  baseRef: string;
  baseSha: string;
  dirtySource: boolean;
  openedAt: string;
  managed: boolean;
}

export interface CodingWorkspacePublic {
  workspace_id: string;
  repo_id: string;
  display_name: string;
  mode: CodingWorkspaceMode;
  branch: string;
  base_ref: string;
  base_sha: string;
  dirty_source: boolean;
  managed: boolean;
  instructions: Array<{ path: string; content: string }>;
  available_instruction_files: string[];
}

interface CodingWorkspaceStateFile {
  version: 1;
  workspaces: CodingWorkspace[];
}

interface IgnoreRule {
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
  anchored: boolean;
}

export class CodingWorkspaceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CodingWorkspaceError';
  }
}

const MAX_INSTRUCTION_BYTES = 128 * 1024;
const MAX_NESTED_INSTRUCTIONS = 100;
const MAX_INSTRUCTION_DEPTH = 8;
const ALWAYS_READ_DENIED = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '.ssh/**',
  '.aws/**',
  '.kube/**',
  '.config/gcloud/**',
  '.docker/config.json',
  '.npmrc',
  '.netrc',
  '.pypirc',
  '.git/**',
  'secrets/**',
  'credentials/**',
  '_ops/**',
];
const ALWAYS_WRITE_DENIED = [...ALWAYS_READ_DENIED, '_ref/**'];

function repoHarnessHome(env: NodeJS.ProcessEnv): string {
  return resolve(env.REPO_HARNESS_HOME ?? join(env.HOME ?? homedir(), '.repo-harness'));
}

export function codingWorkspaceStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(repoHarnessHome(env), 'mcp-workspaces.json');
}

export function codingWorktreeRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.REPO_HARNESS_MCP_WORKTREE_ROOT ?? join(repoHarnessHome(env), 'mcp-worktrees'));
}

function toPosix(value: string): string {
  return value.split(sep).join('/').replace(/\\+/g, '/');
}

function isWindowsAbsoluteLike(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^[a-zA-Z]:/.test(value) || value.startsWith('\\\\');
}

export function normalizeCodingRelativePath(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.includes('\0') || isAbsolute(raw) || isWindowsAbsoluteLike(raw)) {
    throw new CodingWorkspaceError('INVALID_RELATIVE_PATH', 'coding workspace paths must be non-empty relative paths');
  }
  const normalized = toPosix(raw).replace(/^\.\/+/, '').replace(/\/+$/, '');
  if (!normalized || normalized === '.' || normalized.split('/').some((part) => part === '..' || part === '')) {
    throw new CodingWorkspaceError('INVALID_RELATIVE_PATH', 'coding workspace paths must not contain traversal or empty segments', { path: raw });
  }
  return normalized;
}

function denyGlobMatches(pattern: string, relativePath: string): boolean {
  if (globMatches(pattern, relativePath)) return true;
  if (pattern.endsWith('/**')) {
    const directory = pattern.slice(0, -3);
    return relativePath === directory || relativePath.startsWith(`${directory}/`) || globMatches(`**/${pattern}`, relativePath);
  }
  if (!pattern.includes('/')) return relativePath.split('/').some((segment) => globMatches(pattern, segment));
  return !pattern.startsWith('**/') && globMatches(`**/${pattern}`, relativePath);
}

function readIgnoreRules(root: string): IgnoreRule[] {
  const path = join(root, '.ignore');
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const negated = line.startsWith('!');
        const raw = negated ? line.slice(1) : line;
        const directoryOnly = raw.endsWith('/');
        const anchored = raw.startsWith('/');
        return {
          pattern: raw.replace(/^\/+/, '').replace(/\/+$/, ''),
          negated,
          directoryOnly,
          anchored,
        };
      })
      .filter((rule) => rule.pattern.length > 0);
  } catch {
    return [];
  }
}

function ignoreRuleMatches(rule: IgnoreRule, relativePath: string): boolean {
  const path = toPosix(relativePath);
  const match = rule.anchored
    ? globMatches(rule.pattern, path)
    : globMatches(rule.pattern, path) || globMatches(`**/${rule.pattern}`, path) || (!rule.pattern.includes('/') && path.split('/').some((part) => globMatches(rule.pattern, part)));
  if (!rule.directoryOnly) return match;
  return match || path === rule.pattern || path.startsWith(`${rule.pattern}/`) || path.includes(`/${rule.pattern}/`);
}

function ignoredByPolicy(root: string, relativePath: string): boolean {
  let ignored = false;
  for (const rule of readIgnoreRules(root)) {
    if (ignoreRuleMatches(rule, relativePath)) ignored = !rule.negated;
  }
  return ignored;
}

function assertCodingPathPolicy(root: string, relativePath: string, intent: 'read' | 'write'): void {
  const deny = intent === 'write' ? ALWAYS_WRITE_DENIED : ALWAYS_READ_DENIED;
  if (deny.some((pattern) => denyGlobMatches(pattern, relativePath))) {
    throw new CodingWorkspaceError('PATH_DENIED', 'path is denied by coding MCP policy', { path: relativePath, intent });
  }
  if (ignoredByPolicy(root, relativePath)) {
    throw new CodingWorkspaceError('PATH_IGNORED', 'path is excluded by repository .ignore policy', { path: relativePath });
  }
}

function canonicalRoot(root: string): string {
  const canonical = realpathSync(root);
  if (!statSync(canonical).isDirectory()) throw new CodingWorkspaceError('WORKSPACE_NOT_FOUND', 'workspace root is not a directory');
  return canonical;
}

export interface ResolvedCodingPath {
  relativePath: string;
  absolutePath: string;
  canonicalPath: string;
  exists: boolean;
  kind: 'file' | 'directory';
}

export function resolveCodingPath(
  workspace: CodingWorkspace,
  value: unknown,
  options: { intent: 'read' | 'write'; allowMissing?: boolean; requireDirectory?: boolean } = { intent: 'read' },
): ResolvedCodingPath {
  const relativePath = normalizeCodingRelativePath(value);
  const root = canonicalRoot(workspace.root);
  assertCodingPathPolicy(root, relativePath, options.intent);
  const absolutePath = resolve(root, relativePath);
  if (!isPathInside(root, absolutePath)) throw new CodingWorkspaceError('PATH_OUTSIDE_REPO', 'path escapes the coding workspace', { path: relativePath });

  if (existsSync(absolutePath)) {
    const link = lstatSync(absolutePath);
    if (link.isSymbolicLink()) throw new CodingWorkspaceError('SYMLINK_ESCAPE', 'coding tools do not read or write through symlinks', { path: relativePath });
    const canonicalPath = realpathSync(absolutePath);
    if (!isPathInside(root, canonicalPath)) throw new CodingWorkspaceError('SYMLINK_ESCAPE', 'path resolves outside the coding workspace', { path: relativePath });
    const stat = statSync(canonicalPath);
    const kind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : undefined;
    if (!kind) throw new CodingWorkspaceError('NOT_A_FILE', 'coding tools support regular files and directories only', { path: relativePath });
    if (options.requireDirectory && kind !== 'directory') throw new CodingWorkspaceError('NOT_A_DIRECTORY', 'working directory must be a directory', { path: relativePath });
    return { relativePath, absolutePath, canonicalPath, exists: true, kind };
  }

  if (!options.allowMissing) throw new CodingWorkspaceError('NOT_FOUND', 'path does not exist', { path: relativePath });
  const parent = dirname(absolutePath);
  if (!existsSync(parent)) throw new CodingWorkspaceError('PARENT_NOT_FOUND', 'parent directory does not exist', { path: relativePath });
  const parentLink = lstatSync(parent);
  if (parentLink.isSymbolicLink()) throw new CodingWorkspaceError('SYMLINK_ESCAPE', 'coding tools do not write through symlink parents', { path: relativePath });
  const canonicalParent = realpathSync(parent);
  if (!isPathInside(root, canonicalParent)) throw new CodingWorkspaceError('SYMLINK_ESCAPE', 'parent resolves outside the coding workspace', { path: relativePath });
  return { relativePath, absolutePath, canonicalPath: join(canonicalParent, basename(absolutePath)), exists: false, kind: 'file' };
}

function stateFile(env: NodeJS.ProcessEnv): CodingWorkspaceStateFile {
  const path = codingWorkspaceStatePath(env);
  if (!existsSync(path)) return { version: 1, workspaces: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as CodingWorkspaceStateFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.workspaces)) return { version: 1, workspaces: [] };
    return parsed;
  } catch {
    return { version: 1, workspaces: [] };
  }
}

function writeState(env: NodeJS.ProcessEnv, state: CodingWorkspaceStateFile): void {
  const path = codingWorkspaceStatePath(env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  renameSync(temporary, path);
}

function git(root: string, args: string[], opts: { allowFailure?: boolean } = {}): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0 && !opts.allowFailure) {
    throw new CodingWorkspaceError('GIT_COMMAND_FAILED', (result.stderr || result.stdout || `git exited ${result.status}`).trim(), {
      operation: args[0],
    });
  }
  return result.status === 0 ? result.stdout.trim() : '';
}

function sanitizeBranchPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'repo';
}

function registeredRepo(repoId: string, env: NodeJS.ProcessEnv): RepoHarnessRegisteredRepo {
  const repo = readRegisteredRepoHarnessRepos({ env, adoptedOnly: true }).find((entry) => entry.id === repoId);
  if (!repo) throw new CodingWorkspaceError('REPO_NOT_ALLOWED', 'repo_id is not in the adopted registered-repo whitelist', { repo_id: repoId });
  if (repo.accessMode !== 'read_write') throw new CodingWorkspaceError('WRITE_DISABLED', 'coding workspaces require an explicit read_write repo grant', { repo_id: repoId });
  if (!isRepoHarnessAdoptedPath(repo.path)) throw new CodingWorkspaceError('REPO_NOT_ALLOWED', 'registered repo is no longer repo-harness adopted', { repo_id: repoId });
  return repo;
}

function isDirty(root: string): boolean {
  return git(root, ['status', '--porcelain=v1']).length > 0;
}

function rootInstructions(root: string): Array<{ path: string; content: string }> {
  const files = ['AGENTS.md', 'AGENTS.MD', 'CLAUDE.md', 'CLAUDE.MD'];
  const result: Array<{ path: string; content: string }> = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const path of files) {
    const absolute = join(root, path);
    if (!existsSync(absolute)) continue;
    const link = lstatSync(absolute);
    if (link.isSymbolicLink() || !link.isFile()) continue;
    const canonical = realpathSync(absolute);
    if (!isPathInside(root, canonical)) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const content = readFileSync(absolute, 'utf-8');
    const remaining = MAX_INSTRUCTION_BYTES - bytes;
    if (remaining <= 0) break;
    const bounded = Buffer.byteLength(content) <= remaining ? content : Buffer.from(content).subarray(0, remaining).toString('utf-8');
    result.push({ path, content: bounded });
    bytes += Buffer.byteLength(bounded);
  }
  return result;
}

function nestedInstructionFiles(root: string): string[] {
  const result: string[] = [];
  const walk = (absolute: string, rel: string, depth: number): void => {
    if (depth > MAX_INSTRUCTION_DEPTH || result.length >= MAX_NESTED_INSTRUCTIONS) return;
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (result.length >= MAX_NESTED_INSTRUCTIONS) return;
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '_ops' || entry.name === '_ref') continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (ignoredByPolicy(root, childRel)) continue;
      if (entry.isDirectory()) {
        walk(join(absolute, entry.name), childRel, depth + 1);
      } else if (rel && ['AGENTS.md', 'AGENTS.MD', 'CLAUDE.md', 'CLAUDE.MD'].includes(entry.name)) {
        result.push(childRel);
      }
    }
  };
  walk(root, '', 0);
  return result;
}

function publicWorkspace(workspace: CodingWorkspace): CodingWorkspacePublic {
  return {
    workspace_id: workspace.id,
    repo_id: workspace.repoId,
    display_name: workspace.displayName,
    mode: workspace.mode,
    branch: workspace.branch,
    base_ref: workspace.baseRef,
    base_sha: workspace.baseSha,
    dirty_source: workspace.dirtySource,
    managed: workspace.managed,
    instructions: rootInstructions(workspace.root),
    available_instruction_files: nestedInstructionFiles(workspace.root),
  };
}

export class CodingWorkspaceManager {
  private readonly workspaces = new Map<string, CodingWorkspace>();

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  open(repoId: string, mode: CodingWorkspaceMode = 'worktree', baseRef = 'HEAD'): CodingWorkspacePublic {
    const repo = registeredRepo(repoId, this.env);
    const sourceRoot = realpathSync(repo.path);
    const baseSha = git(sourceRoot, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
    const dirtySource = isDirty(sourceRoot);
    const id = `cws_${randomUUID()}`;
    let root = sourceRoot;
    let branch = git(sourceRoot, ['branch', '--show-current']) || '(detached)';
    let managed = false;

    if (mode === 'worktree') {
      const suffix = randomBytes(4).toString('hex');
      branch = `codex/mcp-${sanitizeBranchPart(basename(sourceRoot))}-${suffix}`;
      root = join(codingWorktreeRoot(this.env), sanitizeBranchPart(basename(sourceRoot)), id);
      mkdirSync(dirname(root), { recursive: true, mode: 0o700 });
      git(sourceRoot, ['worktree', 'add', '-b', branch, root, baseSha]);
      root = realpathSync(root);
      managed = true;
    }

    const workspace: CodingWorkspace = {
      id,
      repoId,
      displayName: basename(sourceRoot),
      root,
      sourceRoot,
      mode,
      branch,
      baseRef,
      baseSha,
      dirtySource,
      openedAt: new Date().toISOString(),
      managed,
    };
    this.workspaces.set(id, workspace);
    if (managed) {
      const state = stateFile(this.env);
      state.workspaces = [...state.workspaces.filter((entry) => entry.id !== id), workspace];
      writeState(this.env, state);
    }
    return publicWorkspace(workspace);
  }

  get(workspaceId: string): CodingWorkspace {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new CodingWorkspaceError('WORKSPACE_NOT_FOUND', 'workspace_id is unknown or belongs to another MCP session', { workspace_id: workspaceId });
    const repo = registeredRepo(workspace.repoId, this.env);
    if (realpathSync(repo.path) !== workspace.sourceRoot) {
      throw new CodingWorkspaceError('REPO_NOT_ALLOWED', 'workspace repo grant no longer matches its registered source', { repo_id: workspace.repoId });
    }
    canonicalRoot(workspace.root);
    return workspace;
  }

  getForAudit(workspaceId: string): CodingWorkspace | undefined {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return undefined;
    try {
      canonicalRoot(workspace.root);
      return workspace;
    } catch {
      return undefined;
    }
  }

  workingDirectory(workspaceId: string, value: unknown = '.'): string {
    const workspace = this.get(workspaceId);
    if (value === undefined || value === null || String(value).trim() === '' || String(value).trim() === '.') return canonicalRoot(workspace.root);
    return resolveCodingPath(workspace, value, { intent: 'read', requireDirectory: true }).canonicalPath;
  }

  closeSession(): void {
    this.workspaces.clear();
  }
}

export function listManagedCodingWorkspaces(env: NodeJS.ProcessEnv = process.env): Array<Omit<CodingWorkspace, 'root' | 'sourceRoot'> & { dirty: boolean; path_exists: boolean }> {
  return stateFile(env).workspaces.map((workspace) => ({
    id: workspace.id,
    repoId: workspace.repoId,
    displayName: workspace.displayName,
    mode: workspace.mode,
    branch: workspace.branch,
    baseRef: workspace.baseRef,
    baseSha: workspace.baseSha,
    dirtySource: workspace.dirtySource,
    openedAt: workspace.openedAt,
    managed: workspace.managed,
    path_exists: existsSync(workspace.root),
    dirty: existsSync(workspace.root) ? isDirty(workspace.root) : false,
  }));
}

export function cleanupManagedCodingWorkspace(workspaceId: string, env: NodeJS.ProcessEnv = process.env): { workspace_id: string; removed: true; branch: string } {
  const state = stateFile(env);
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  if (!workspace || !workspace.managed) throw new CodingWorkspaceError('WORKSPACE_NOT_FOUND', 'managed workspace is unknown', { workspace_id: workspaceId });
  if (existsSync(workspace.root) && isDirty(workspace.root)) {
    throw new CodingWorkspaceError('WORKTREE_DIRTY', 'refusing to remove a dirty managed worktree', { workspace_id: workspaceId });
  }
  const merged = spawnSync('git', ['-C', workspace.sourceRoot, 'merge-base', '--is-ancestor', workspace.branch, 'HEAD'], { encoding: 'utf-8' });
  if (merged.status !== 0) throw new CodingWorkspaceError('WORKTREE_UNMERGED', 'refusing to remove an unmerged managed worktree', { workspace_id: workspaceId, branch: workspace.branch });
  if (existsSync(workspace.root)) git(workspace.sourceRoot, ['worktree', 'remove', workspace.root]);
  git(workspace.sourceRoot, ['branch', '-d', workspace.branch]);
  state.workspaces = state.workspaces.filter((entry) => entry.id !== workspaceId);
  writeState(env, state);
  if (existsSync(workspace.root)) rmSync(workspace.root, { recursive: true, force: true });
  return { workspace_id: workspaceId, removed: true, branch: workspace.branch };
}
