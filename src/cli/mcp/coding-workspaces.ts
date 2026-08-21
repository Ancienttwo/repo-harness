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
  integrationTargetRef: string | null;
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
  integration_target_ref: string | null;
  dirty_source: boolean;
  managed: boolean;
  instructions: Array<{ path: string; content: string }>;
  available_instruction_files: string[];
}

type PersistedCodingWorkspace = Omit<CodingWorkspace, 'integrationTargetRef'> & {
  integrationTargetRef?: unknown;
};

interface CodingWorkspaceStateFile {
  version: 1;
  workspaces: PersistedCodingWorkspace[];
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
  let policy: ReturnType<typeof lstatSync>;
  try {
    policy = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new CodingWorkspaceError('IGNORE_POLICY_UNAVAILABLE', 'repository .ignore policy could not be read safely');
  }
  if (!policy.isFile() || policy.isSymbolicLink()) {
    throw new CodingWorkspaceError('IGNORE_POLICY_UNAVAILABLE', 'repository .ignore policy could not be read safely');
  }
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
    throw new CodingWorkspaceError('IGNORE_POLICY_UNAVAILABLE', 'repository .ignore policy could not be read safely');
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

function assertNoSymlinkComponents(root: string, relativePath: string): void {
  let candidate = root;
  for (const component of relativePath.split('/')) {
    candidate = join(candidate, component);
    try {
      if (lstatSync(candidate).isSymbolicLink()) {
        throw new CodingWorkspaceError('SYMLINK_ESCAPE', 'coding tools do not read or write through symlinks', { path: relativePath });
      }
    } catch (error) {
      if (error instanceof CodingWorkspaceError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new CodingWorkspaceError('PATH_UNAVAILABLE', 'coding workspace path could not be inspected safely', { path: relativePath });
    }
  }
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
  assertNoSymlinkComponents(root, relativePath);

  if (existsSync(absolutePath)) {
    const canonicalPath = realpathSync(absolutePath);
    if (!isPathInside(root, canonicalPath)) throw new CodingWorkspaceError('SYMLINK_ESCAPE', 'path resolves outside the coding workspace', { path: relativePath });
    assertCodingPathPolicy(root, toPosix(relative(root, canonicalPath)), options.intent);
    const stat = statSync(canonicalPath);
    const kind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : undefined;
    if (!kind) throw new CodingWorkspaceError('NOT_A_FILE', 'coding tools support regular files and directories only', { path: relativePath });
    if (options.requireDirectory && kind !== 'directory') throw new CodingWorkspaceError('NOT_A_DIRECTORY', 'working directory must be a directory', { path: relativePath });
    return { relativePath, absolutePath, canonicalPath, exists: true, kind };
  }

  if (!options.allowMissing) throw new CodingWorkspaceError('NOT_FOUND', 'path does not exist', { path: relativePath });
  const parent = dirname(absolutePath);
  if (!existsSync(parent)) throw new CodingWorkspaceError('PARENT_NOT_FOUND', 'parent directory does not exist', { path: relativePath });
  const canonicalParent = realpathSync(parent);
  if (!isPathInside(root, canonicalParent)) throw new CodingWorkspaceError('SYMLINK_ESCAPE', 'parent resolves outside the coding workspace', { path: relativePath });
  const canonicalPath = join(canonicalParent, basename(absolutePath));
  assertCodingPathPolicy(root, toPosix(relative(root, canonicalPath)), options.intent);
  return { relativePath, absolutePath, canonicalPath, exists: false, kind: 'file' };
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

type WorktreeMergeMode = 'ancestor' | 'absorbed' | 'unmerged';

const WORKTREE_MERGE_LIB = resolve(import.meta.dir, '../../../scripts/worktree-merge-lib.sh');

function resolveIntegrationTargetRef(root: string, value: string): string {
  const requested = value.trim();
  if (!requested) {
    throw new CodingWorkspaceError('INTEGRATION_TARGET_REQUIRED', 'managed workspaces require a non-empty integration target ref');
  }

  const args = requested === 'HEAD'
    ? ['-C', root, 'symbolic-ref', '--quiet', 'HEAD']
    : ['-C', root, 'rev-parse', '--symbolic-full-name', '--verify', requested];
  const result = spawnSync('git', args, { encoding: 'utf-8', maxBuffer: 1024 * 1024 });
  const targetRef = result.status === 0 ? result.stdout.trim() : '';
  if (!targetRef || targetRef.includes('\n') || (!targetRef.startsWith('refs/heads/') && !targetRef.startsWith('refs/remotes/'))) {
    throw new CodingWorkspaceError(
      'INTEGRATION_TARGET_INVALID',
      'integration target must resolve to one local or remote branch ref; detached HEAD, tags, and commit ids are not cleanup authorities',
      { integration_target_ref: requested },
    );
  }
  return targetRef;
}

function worktreeMergeMode(sourceRoot: string, branchCommit: string, targetCommit: string): WorktreeMergeMode {
  if (!existsSync(WORKTREE_MERGE_LIB)) {
    throw new CodingWorkspaceError('MERGE_CHECK_UNAVAILABLE', 'the packaged worktree merge authority is unavailable');
  }
  const result = spawnSync('bash', [WORKTREE_MERGE_LIB, '--target', targetCommit, branchCommit], {
    cwd: sourceRoot,
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new CodingWorkspaceError('MERGE_CHECK_UNAVAILABLE', 'the worktree merge authority could not classify the workspace branch', {
      branch_commit: branchCommit,
      integration_target_commit: targetCommit,
    });
  }
  const rows = result.stdout.trim().split('\n');
  const [classifiedBranch, mode, ...extra] = rows[0]?.split('\t') ?? [];
  if (rows.length !== 1 || extra.length > 0 || classifiedBranch !== branchCommit || (mode !== 'ancestor' && mode !== 'absorbed' && mode !== 'unmerged')) {
    throw new CodingWorkspaceError('MERGE_CHECK_UNAVAILABLE', 'the worktree merge authority returned an invalid classification', {
      branch_commit: branchCommit,
      integration_target_commit: targetCommit,
    });
  }
  return mode;
}

function workspaceBranchSnapshot(sourceRoot: string, branch: string): { branchRef: string; branchCommit: string } {
  const branchRef = `refs/heads/${branch}`;
  const result = spawnSync('git', ['-C', sourceRoot, 'rev-parse', '--symbolic-full-name', '--verify', branchRef], {
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.stdout.trim() !== branchRef) {
    throw new CodingWorkspaceError('WORKSPACE_BRANCH_INVALID', 'managed workspace branch is missing or is not a canonical local branch ref', {
      branch,
    });
  }
  return {
    branchRef,
    branchCommit: git(sourceRoot, ['rev-parse', '--verify', `${branchRef}^{commit}`]),
  };
}

export function deleteCodingWorkspaceBranchAtSnapshot(
  sourceRoot: string,
  branchRef: string,
  branchCommit: string,
  targetRef: string,
  targetCommit: string,
): void {
  const transaction = [
    'start',
    `verify ${targetRef} ${targetCommit}`,
    `delete ${branchRef} ${branchCommit}`,
    'prepare',
    'commit',
    '',
  ].join('\n');
  const result = spawnSync('git', ['-C', sourceRoot, 'update-ref', '--stdin'], {
    input: transaction,
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new CodingWorkspaceError(
      'WORKSPACE_REFS_CHANGED',
      'workspace branch or integration target changed during cleanup; the branch and state record were retained',
      { branch_ref: branchRef, integration_target_ref: targetRef },
    );
  }
}

function cleanupIntegrationTargetRef(
  workspace: PersistedCodingWorkspace,
  targetOverride: string | undefined,
): string {
  const stored = typeof workspace.integrationTargetRef === 'string' ? workspace.integrationTargetRef.trim() : '';
  if (!stored || stored === 'HEAD') {
    if (!targetOverride?.trim()) {
      throw new CodingWorkspaceError(
        'INTEGRATION_TARGET_REQUIRED',
        'managed workspace has no stable integration target; rerun cleanup with an explicit --target branch ref',
        { workspace_id: workspace.id },
      );
    }
    return resolveIntegrationTargetRef(workspace.sourceRoot, targetOverride);
  }

  const targetRef = resolveIntegrationTargetRef(workspace.sourceRoot, stored);
  if (targetRef !== stored) {
    throw new CodingWorkspaceError('INTEGRATION_TARGET_INVALID', 'persisted integration target is not a canonical branch ref', {
      workspace_id: workspace.id,
      integration_target_ref: stored,
    });
  }
  if (targetOverride?.trim()) {
    const overrideRef = resolveIntegrationTargetRef(workspace.sourceRoot, targetOverride);
    if (overrideRef !== targetRef) {
      throw new CodingWorkspaceError('INTEGRATION_TARGET_MISMATCH', 'explicit cleanup target does not match the workspace-bound integration target', {
        workspace_id: workspace.id,
        integration_target_ref: targetRef,
        requested_target_ref: overrideRef,
      });
    }
  }
  return targetRef;
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
    integration_target_ref: workspace.integrationTargetRef,
    dirty_source: workspace.dirtySource,
    managed: workspace.managed,
    instructions: rootInstructions(workspace.root),
    available_instruction_files: nestedInstructionFiles(workspace.root),
  };
}

export class CodingWorkspaceManager {
  private readonly workspaces = new Map<string, CodingWorkspace>();

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  open(
    repoId: string,
    mode: CodingWorkspaceMode = 'worktree',
    baseRef = 'HEAD',
    integrationTargetRef = 'HEAD',
  ): CodingWorkspacePublic {
    const repo = registeredRepo(repoId, this.env);
    const sourceRoot = realpathSync(repo.path);
    const baseSha = git(sourceRoot, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
    const boundIntegrationTargetRef = mode === 'worktree'
      ? resolveIntegrationTargetRef(sourceRoot, integrationTargetRef)
      : null;
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
      integrationTargetRef: boundIntegrationTargetRef,
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
    if (!workspace) throw new CodingWorkspaceError('WORKSPACE_NOT_FOUND', 'workspace_id is unknown or unavailable for this coding authorization', { workspace_id: workspaceId });
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

export function listManagedCodingWorkspaces(env: NodeJS.ProcessEnv = process.env): Array<
  Omit<CodingWorkspace, 'root' | 'sourceRoot' | 'integrationTargetRef'>
  & { integrationTargetRef: string | null; dirty: boolean | null; path_exists: boolean; stale_reason: string | null }
> {
  return stateFile(env).workspaces.map((workspace) => {
    const pathExists = existsSync(workspace.root);
    // A recorded directory that still exists but is no longer a usable worktree
    // is reported as one explicit stale row with an unknown dirty state. It is
    // never skipped, never repaired, and never allowed to fail the whole list.
    let dirty: boolean | null = pathExists ? null : false;
    let staleReason: string | null = null;
    if (pathExists) {
      try {
        dirty = isDirty(workspace.root);
      } catch (error) {
        staleReason = error instanceof Error ? error.message : String(error);
      }
    }
    return {
      id: workspace.id,
      repoId: workspace.repoId,
      displayName: workspace.displayName,
      mode: workspace.mode,
      branch: workspace.branch,
      baseRef: workspace.baseRef,
      baseSha: workspace.baseSha,
      integrationTargetRef: typeof workspace.integrationTargetRef === 'string' ? workspace.integrationTargetRef : null,
      dirtySource: workspace.dirtySource,
      openedAt: workspace.openedAt,
      managed: workspace.managed,
      path_exists: pathExists,
      dirty,
      stale_reason: staleReason,
    };
  });
}

export function cleanupManagedCodingWorkspace(
  workspaceId: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { targetRef?: string } = {},
): { workspace_id: string; removed: true; branch: string; integration_target_ref: string; merge_mode: Exclude<WorktreeMergeMode, 'unmerged'> } {
  const state = stateFile(env);
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  if (!workspace || !workspace.managed) throw new CodingWorkspaceError('WORKSPACE_NOT_FOUND', 'managed workspace is unknown', { workspace_id: workspaceId });
  if (existsSync(workspace.root) && isDirty(workspace.root)) {
    throw new CodingWorkspaceError('WORKTREE_DIRTY', 'refusing to remove a dirty managed worktree', { workspace_id: workspaceId });
  }
  const targetRef = cleanupIntegrationTargetRef(workspace, options.targetRef);
  const targetCommit = git(workspace.sourceRoot, ['rev-parse', '--verify', `${targetRef}^{commit}`]);
  const { branchRef, branchCommit } = workspaceBranchSnapshot(workspace.sourceRoot, workspace.branch);
  const mergeMode = worktreeMergeMode(workspace.sourceRoot, branchCommit, targetCommit);
  if (mergeMode === 'unmerged') {
    throw new CodingWorkspaceError('WORKTREE_UNMERGED', 'refusing to remove a managed worktree that is unmerged from its integration target', {
      workspace_id: workspaceId,
      branch: workspace.branch,
      integration_target_ref: targetRef,
    });
  }
  if (existsSync(workspace.root)) git(workspace.sourceRoot, ['worktree', 'remove', workspace.root]);
  deleteCodingWorkspaceBranchAtSnapshot(workspace.sourceRoot, branchRef, branchCommit, targetRef, targetCommit);
  state.workspaces = state.workspaces.filter((entry) => entry.id !== workspaceId);
  writeState(env, state);
  if (existsSync(workspace.root)) rmSync(workspace.root, { recursive: true, force: true });
  return {
    workspace_id: workspaceId,
    removed: true,
    branch: workspace.branch,
    integration_target_ref: targetRef,
    merge_mode: mergeMode,
  };
}
