import { existsSync, lstatSync, realpathSync } from 'fs';
import { dirname, isAbsolute, resolve, sep } from 'path';
import type { McpPathDecision, McpPathIntent, McpPolicy } from './types';

function toPosixPath(value: string): string {
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

function realpathInside(child: string, parent: string): boolean {
  const normalizedParent = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  return child === parent || child.startsWith(normalizedParent);
}

function nearestExistingPath(path: string): string | undefined {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return current;
}

export function resolveMcpPath(repoRoot: string, inputPath: string, policy: McpPolicy, intent: McpPathIntent): McpPathDecision {
  const normalized = normalizeMcpRelativePath(inputPath);
  if (!normalized.ok || !normalized.relativePath) return normalized;

  const relativePath = normalized.relativePath;
  if (anyDenyGlobMatches(policy.denyGlobs, relativePath)) {
    return { ok: false, relativePath, reason: `path is denied by MCP policy: ${relativePath}` };
  }

  const allowGlobs = intent === 'read' ? policy.readGlobs : policy.writeGlobs;
  if (!anyGlobMatches(allowGlobs, relativePath)) {
    return { ok: false, relativePath, reason: `path is not allowed for ${intent}: ${relativePath}` };
  }

  const repoRealpath = realpathSync(repoRoot);
  const absolutePath = resolve(repoRealpath, relativePath);
  if (intent === 'read' && !existsSync(absolutePath)) {
    return { ok: false, relativePath, reason: `path does not exist: ${relativePath}` };
  }

  const existingPath = existsSync(absolutePath) ? absolutePath : nearestExistingPath(dirname(absolutePath));
  if (!existingPath) {
    return { ok: false, relativePath, reason: `path cannot be resolved: ${relativePath}` };
  }

  const realExistingPath = realpathSync(existingPath);
  if (!realpathInside(realExistingPath, repoRealpath)) {
    return { ok: false, relativePath, reason: `path escapes repository root: ${relativePath}` };
  }

  if (existsSync(absolutePath) && lstatSync(absolutePath).isSymbolicLink()) {
    const realTarget = realpathSync(absolutePath);
    if (!realpathInside(realTarget, repoRealpath)) {
      return { ok: false, relativePath, reason: `symlink escapes repository root: ${relativePath}` };
    }
  }

  return { ok: true, relativePath, absolutePath };
}
