import { existsSync, lstatSync, realpathSync, statSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { isPathInside } from '../../effects/path-containment';
import type { McpPathDecision, McpPathIntent, McpPolicy } from './types';

export function toPosixPath(value: string): string {
  return value.split(sep).join('/').replace(/\\+/g, '/');
}

export function normalizeMcpRelativePath(input: string): McpPathDecision {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'path is required' };
  if (isAbsolute(trimmed)) return { ok: false, reason: 'absolute paths are not allowed' };
  const normalized = toPosixPath(trimmed).replace(/^\.\/+/, '');
  if (normalized === '' || normalized === '.') return { ok: false, reason: 'path must target a file' };
  if (normalized.split('/').some((part) => part === '..')) {
    return { ok: false, reason: 'path traversal is not allowed' };
  }
  return { ok: true, relativePath: normalized };
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

export function globMatches(pattern: string, relativePath: string): boolean {
  if (pattern === '**') return true;
  let expression = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      expression += '.*';
      index += 1;
    } else if (char === '*') {
      expression += '[^/]*';
    } else {
      expression += escapeRegex(char);
    }
  }
  return new RegExp(`^${expression}$`).test(relativePath);
}

function anyGlobMatches(patterns: string[], relativePath: string): boolean {
  return patterns.some((pattern) => globMatches(pattern, relativePath));
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
  if (!pattern.startsWith('**/')) {
    return globMatches(`**/${pattern}`, relativePath);
  }
  return false;
}

function anyDenyGlobMatches(patterns: string[], relativePath: string): boolean {
  return patterns.some((pattern) => denyGlobMatches(pattern, relativePath));
}

export function isWindowsAbsoluteLike(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^[a-zA-Z]:/.test(value) || value.startsWith('\\\\');
}

// A canonical directory is the real path of an existing directory. A missing
// path, a file or a link loop gives null.
export function canonicalDirectory(path: string): string | null {
  const absolute = resolve(path);
  try {
    if (!statSync(absolute).isDirectory()) return null;
    return realpathSync(absolute);
  } catch {
    return null;
  }
}

function hasEntry(path: string): boolean {
  try {
    return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
  } catch (error) {
    // A path below a regular file or a link loop has no entry. The walk
    // continues to that file or loop link; a loop link has no real path.
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOTDIR' || code === 'ELOOP') return false;
    throw error;
  }
}

// lstatSync does not follow links, so a dangling parent link is the nearest
// entry. It has no real path, so the caller refuses the path.
function nearestExistingPath(path: string): string | undefined {
  let current = path;
  while (!hasEntry(current)) {
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return existsSync(current) ? current : undefined;
}

export function resolveMcpPath(repoRoot: string, inputPath: string, policy: McpPolicy, intent: McpPathIntent): McpPathDecision {
  const trimmed = inputPath.trim();
  const repoRealpath = realpathSync(repoRoot);
  let relativePath: string;
  let absolutePath: string;

  if (isAbsolute(trimmed)) {
    if (!(intent === 'read' && policy.allowAbsoluteRead === true)) {
      return { ok: false, reason: 'absolute paths are not allowed' };
    }
    absolutePath = resolve(trimmed);
    const comparablePath = existsSync(absolutePath) ? realpathSync(absolutePath) : absolutePath;
    relativePath = toPosixPath(relative(repoRealpath, comparablePath));
    if (relativePath === '') return { ok: false, reason: 'path must target a file' };
  } else {
    const normalized = normalizeMcpRelativePath(inputPath);
    if (!normalized.ok || !normalized.relativePath) return normalized;
    relativePath = normalized.relativePath;
    absolutePath = resolve(repoRealpath, relativePath);
  }

  if (anyDenyGlobMatches(policy.denyGlobs, relativePath)) {
    return { ok: false, relativePath, reason: `path is denied by MCP policy: ${relativePath}` };
  }

  const allowGlobs = intent === 'read' ? policy.readGlobs : policy.writeGlobs;
  if (!anyGlobMatches(allowGlobs, relativePath)) {
    return { ok: false, relativePath, reason: `path is not allowed for ${intent}: ${relativePath}` };
  }

  if (intent === 'read' && !existsSync(absolutePath)) {
    return { ok: false, relativePath, reason: `path does not exist: ${relativePath}` };
  }

  const existingPath = existsSync(absolutePath) ? absolutePath : nearestExistingPath(dirname(absolutePath));
  if (!existingPath) {
    return { ok: false, relativePath, reason: `path cannot be resolved: ${relativePath}` };
  }

  // A link inside an allowed root can point into a denied or unlisted root,
  // so the policy also applies to the path that the filesystem resolves.
  const realPath = join(realpathSync(existingPath), relative(existingPath, absolutePath));
  if (!isPathInside(repoRealpath, realPath)) {
    return { ok: false, relativePath, reason: `path escapes repository root: ${relativePath}` };
  }
  const realRelativePath = toPosixPath(relative(repoRealpath, realPath));
  if (anyDenyGlobMatches(policy.denyGlobs, realRelativePath)) {
    return { ok: false, relativePath, reason: `path resolves to a path denied by MCP policy: ${relativePath}` };
  }
  if (!anyGlobMatches(allowGlobs, realRelativePath)) {
    return { ok: false, relativePath, reason: `path resolves to a path not allowed for ${intent}: ${relativePath}` };
  }

  return { ok: true, relativePath, absolutePath };
}
