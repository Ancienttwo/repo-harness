import { createHash, randomUUID } from 'crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'fs';
import { basename, isAbsolute, relative, resolve, sep } from 'path';
import { globMatches, isPathInside } from './paths';
import { sensitiveAllowedRootReason } from './policy';
import type { McpPolicy } from './types';

export interface McpAllowedRoot {
  id: string;
  canonicalPath: string;
  displayName: string;
  readable: boolean;
}

export interface McpWorkspace {
  id: string;
  rootId: string;
  canonicalPath: string;
  displayName: string;
  openedAt: number;
  lastUsedAt: number;
}

export interface WorkspaceManagerOptions {
  allowedRoots: string[];
  policy: McpPolicy;
  maxWorkspaces?: number;
  now?: () => number;
}

interface IgnoreRule {
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
}

export type WorkspacePathKind = 'file' | 'directory' | 'symlink' | 'other';

export interface WorkspaceResolvedPath {
  workspace: McpWorkspace;
  relativePath: string;
  absolutePath: string;
  canonicalPath: string;
  kind: WorkspacePathKind;
  size?: number;
  modifiedAt?: string;
}

export class WorkspaceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

const DEFAULT_MAX_WORKSPACES = 16;

function toPosixPath(value: string): string {
  return value.split(sep).join('/').replace(/\\+/g, '/');
}

function rootIdFor(canonicalPath: string): string {
  return `root_${createHash('sha256').update(canonicalPath).digest('hex').slice(0, 16)}`;
}

function stableDisplayName(canonicalPath: string): string {
  return basename(canonicalPath) || canonicalPath;
}

function denyGlobMatches(pattern: string, relativePath: string): boolean {
  if (globMatches(pattern, relativePath)) return true;
  if (pattern.endsWith('/**')) {
    const directoryPattern = pattern.slice(0, -3);
    if (globMatches(directoryPattern, relativePath) || globMatches(`**/${directoryPattern}`, relativePath)) return true;
  }
  if (!pattern.includes('/')) {
    return relativePath.split('/').some((segment) => globMatches(pattern, segment));
  }
  if (!pattern.startsWith('**/')) return globMatches(`**/${pattern}`, relativePath);
  return false;
}

function anyDenyGlobMatches(patterns: string[], relativePath: string): boolean {
  return patterns.some((pattern) => denyGlobMatches(pattern, relativePath));
}

function isWindowsAbsoluteLike(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^[a-zA-Z]:/.test(value) || value.startsWith('\\\\');
}

export function normalizeWorkspaceRelativePath(value: unknown, fallback = '.'): string {
  const raw = String(value ?? fallback).trim() || fallback;
  if (isAbsolute(raw) || isWindowsAbsoluteLike(raw)) {
    throw new WorkspaceError('ABSOLUTE_PATH_DENIED', 'reader workspace paths must be relative');
  }
  const normalized = toPosixPath(raw).replace(/^\.\/+/, '');
  const relativePath = normalized === '' || normalized === '.' ? '.' : normalized;
  if (relativePath.split('/').some((part) => part === '..')) {
    throw new WorkspaceError('TRAVERSAL_DENIED', 'reader workspace paths must not contain traversal segments');
  }
  return relativePath;
}

function pathKind(absolutePath: string): WorkspacePathKind {
  const lstat = lstatSync(absolutePath);
  if (lstat.isSymbolicLink()) return 'symlink';
  const fileStat = statSync(absolutePath);
  if (fileStat.isFile()) return 'file';
  if (fileStat.isDirectory()) return 'directory';
  return 'other';
}

export class WorkspaceManager {
  private readonly roots: McpAllowedRoot[];
  private readonly workspaces = new Map<string, McpWorkspace>();
  private readonly byCanonicalPath = new Map<string, string>();
  private readonly ignoreRulesByRoot = new Map<string, IgnoreRule[]>();
  private readonly maxWorkspaces: number;
  private readonly now: () => number;
  private readonly policy: McpPolicy;

  constructor(options: WorkspaceManagerOptions) {
    this.policy = options.policy;
    this.maxWorkspaces = options.maxWorkspaces ?? DEFAULT_MAX_WORKSPACES;
    this.now = options.now ?? Date.now;
    this.roots = this.canonicalizeRoots(options.allowedRoots);
  }

  listAllowedRoots(): McpAllowedRoot[] {
    return this.roots.map((root) => ({ ...root }));
  }

  ensureAllowedRoot(path: string): McpAllowedRoot {
    const [root] = this.canonicalizeRoots([path]);
    if (!root) throw new WorkspaceError('ROOT_NOT_FOUND', 'allowed root is not readable', { path });
    if (!root.readable || sensitiveAllowedRootReason(root.canonicalPath, this.policy.denyGlobs, path)) {
      throw new WorkspaceError('ROOT_DENIED', 'allowed root is denied by MCP policy', { path });
    }
    const existing = this.roots.find((entry) => entry.canonicalPath === root.canonicalPath);
    if (existing) return { ...existing };
    this.roots.push(root);
    return { ...root };
  }

  listWorkspaces(): McpWorkspace[] {
    return Array.from(this.workspaces.values()).map((workspace) => ({ ...workspace }));
  }

  get openWorkspaceCount(): number {
    return this.workspaces.size;
  }

  openWorkspace(rootId: string, relativeSubpath = '.'): McpWorkspace {
    const root = this.roots.find((entry) => entry.id === rootId);
    if (!root) throw new WorkspaceError('ROOT_NOT_FOUND', 'allowed root is unknown', { root_id: rootId });
    if (!root.readable || sensitiveAllowedRootReason(root.canonicalPath, this.policy.denyGlobs)) {
      throw new WorkspaceError('ROOT_DENIED', 'allowed root is denied by MCP policy', { root_id: rootId });
    }

    const relativePath = normalizeWorkspaceRelativePath(relativeSubpath);
    const candidate = relativePath === '.' ? root.canonicalPath : resolve(root.canonicalPath, relativePath);
    const resolved = this.realpathInsideRoot(root.canonicalPath, candidate, relativePath, { requireDirectory: true });
    const existingId = this.byCanonicalPath.get(resolved.canonicalPath);
    if (existingId) {
      const existing = this.workspaces.get(existingId);
      if (existing) {
        existing.lastUsedAt = this.now();
        return { ...existing };
      }
    }
    if (this.workspaces.size >= this.maxWorkspaces) {
      throw new WorkspaceError('WORKSPACE_LIMIT_REACHED', `at most ${this.maxWorkspaces} workspaces can be open in one MCP session`);
    }
    const workspace: McpWorkspace = {
      id: `ws_${randomUUID()}`,
      rootId: root.id,
      canonicalPath: resolved.canonicalPath,
      displayName: relativePath === '.' ? root.displayName : stableDisplayName(resolved.canonicalPath),
      openedAt: this.now(),
      lastUsedAt: this.now(),
    };
    this.workspaces.set(workspace.id, workspace);
    this.byCanonicalPath.set(workspace.canonicalPath, workspace.id);
    return { ...workspace };
  }

  resolve(workspaceId: string, value: unknown, options: { requireFile?: boolean; requireDirectory?: boolean } = {}): WorkspaceResolvedPath {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new WorkspaceError('WORKSPACE_NOT_FOUND', 'workspace_id is unknown or expired; call open_workspace first', { workspace_id: workspaceId });
    }
    const root = this.roots.find((entry) => entry.id === workspace.rootId);
    if (!root) throw new WorkspaceError('ROOT_NOT_FOUND', 'workspace root is no longer configured');
    const workspaceRoot = this.realpathInsideRoot(root.canonicalPath, workspace.canonicalPath, '.', { requireDirectory: true }).canonicalPath;
    workspace.canonicalPath = workspaceRoot;
    workspace.lastUsedAt = this.now();

    const relativePath = normalizeWorkspaceRelativePath(value);
    const candidate = relativePath === '.' ? workspaceRoot : resolve(workspaceRoot, relativePath);
    return this.realpathInsideRoot(workspaceRoot, candidate, relativePath, options, workspace);
  }

  private canonicalizeRoots(rawRoots: string[]): McpAllowedRoot[] {
    const roots: McpAllowedRoot[] = [];
    const seen = new Set<string>();
    for (const rawRoot of rawRoots) {
      const absoluteRoot = resolve(rawRoot);
      try {
        const fileStat = statSync(absoluteRoot);
        if (!fileStat.isDirectory()) continue;
        const canonicalPath = realpathSync(absoluteRoot);
        if (seen.has(canonicalPath)) continue;
        seen.add(canonicalPath);
        if (sensitiveAllowedRootReason(canonicalPath, this.policy.denyGlobs, rawRoot)) {
          roots.push({
            id: rootIdFor(canonicalPath),
            canonicalPath,
            displayName: stableDisplayName(canonicalPath),
            readable: false,
          });
          continue;
        }
        this.ignoreRulesByRoot.set(canonicalPath, readIgnoreRules(canonicalPath));
        roots.push({
          id: rootIdFor(canonicalPath),
          canonicalPath,
          displayName: stableDisplayName(canonicalPath),
          readable: true,
        });
      } catch (_error) {
        roots.push({
          id: rootIdFor(absoluteRoot),
          canonicalPath: absoluteRoot,
          displayName: stableDisplayName(absoluteRoot),
          readable: false,
        });
      }
    }
    return roots;
  }

  private realpathInsideRoot(
    root: string,
    absolutePath: string,
    logicalRelativePath: string,
    options: { requireFile?: boolean; requireDirectory?: boolean },
    workspace?: McpWorkspace,
  ): WorkspaceResolvedPath {
    if (sensitiveAllowedRootReason(root, this.policy.denyGlobs)) {
      throw new WorkspaceError('ROOT_DENIED', 'allowed root is denied by MCP policy', { path: logicalRelativePath });
    }
    if (logicalRelativePath !== '.' && anyDenyGlobMatches(this.policy.denyGlobs, logicalRelativePath)) {
      throw new WorkspaceError('PATH_DENIED', 'path is denied by MCP policy', { path: logicalRelativePath });
    }
    if (logicalRelativePath !== '.' && this.isIgnored(root, logicalRelativePath)) {
      throw new WorkspaceError('PATH_IGNORED', 'path is ignored by repository ignore rules', { path: logicalRelativePath });
    }
    if (!existsSync(absolutePath)) {
      throw new WorkspaceError('PATH_NOT_FOUND', 'path does not exist', { path: logicalRelativePath });
    }

    const kind = pathKind(absolutePath);
    const canonicalPath = realpathSync(absolutePath);
    if (!isPathInside(root, canonicalPath)) {
      throw new WorkspaceError('OUTSIDE_ROOT', 'path escapes the allowed workspace root', { path: logicalRelativePath });
    }
    const physicalRelativePath = toPosixPath(relative(root, canonicalPath)) || '.';
    if (physicalRelativePath !== '.' && anyDenyGlobMatches(this.policy.denyGlobs, physicalRelativePath)) {
      throw new WorkspaceError('PATH_DENIED', 'target path is denied by MCP policy', { path: logicalRelativePath });
    }
    if (physicalRelativePath !== '.' && this.isIgnored(root, physicalRelativePath)) {
      throw new WorkspaceError('PATH_IGNORED', 'target path is ignored by repository ignore rules', { path: logicalRelativePath });
    }

    const fileStat = statSync(absolutePath);
    if (options.requireFile && !fileStat.isFile()) {
      throw new WorkspaceError('NOT_A_FILE', 'path is not a regular file', { path: logicalRelativePath });
    }
    if (options.requireDirectory && !fileStat.isDirectory()) {
      throw new WorkspaceError('NOT_A_DIRECTORY', 'path is not a directory', { path: logicalRelativePath });
    }
    return {
      workspace: workspace ?? {
        id: '',
        rootId: '',
        canonicalPath: root,
        displayName: stableDisplayName(root),
        openedAt: this.now(),
        lastUsedAt: this.now(),
      },
      relativePath: logicalRelativePath,
      absolutePath,
      canonicalPath,
      kind,
      size: fileStat.isFile() ? fileStat.size : undefined,
      modifiedAt: fileStat.mtime.toISOString(),
    };
  }

  private isIgnored(root: string, relativePath: string): boolean {
    const rules = this.ignoreRulesByRoot.get(root) ?? [];
    let ignored = false;
    for (const rule of rules) {
      if (ignoreRuleMatches(rule, relativePath)) ignored = !rule.negated;
    }
    return ignored;
  }
}

function readIgnoreRules(root: string): IgnoreRule[] {
  const ignorePath = resolve(root, '.gitignore');
  if (!existsSync(ignorePath)) return [];
  try {
    return readFileSync(ignorePath, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line): IgnoreRule => {
        const negated = line.startsWith('!');
        const withoutNegation = negated ? line.slice(1) : line;
        const directoryOnly = withoutNegation.endsWith('/');
        const pattern = withoutNegation.replace(/^\/+/, '').replace(/\/+$/, '');
        return { pattern, negated, directoryOnly };
      })
      .filter((rule) => rule.pattern.length > 0);
  } catch (_error) {
    return [];
  }
}

function ignoreRuleMatches(rule: IgnoreRule, relativePath: string): boolean {
  const path = relativePath.replace(/\\/g, '/');
  const pattern = rule.pattern;
  if (rule.directoryOnly) {
    return path === pattern || path.startsWith(`${pattern}/`) || path.split('/').some((_, index, parts) => {
      const joined = parts.slice(index).join('/');
      return joined === pattern || joined.startsWith(`${pattern}/`);
    });
  }
  if (!pattern.includes('/')) {
    return path.split('/').some((segment) => globMatches(pattern, segment));
  }
  return globMatches(pattern, path) || globMatches(`**/${pattern}`, path);
}
