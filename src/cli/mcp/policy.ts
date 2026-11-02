import type { McpPolicy, McpProfileName } from './types';

const COMMON_DENY_GLOBS = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '.ssh/**',
  '.git/**',
  'node_modules/**',
  'dist/**',
  'build/**',
  'coverage/**',
  'secrets/**',
  'credentials/**',
  'private/**',
  '.cache/**',
  '.DS_Store',
];

function pathParts(value: string): string[] {
  return value.replace(/\\+/g, '/').split('/').filter(Boolean).map((part) => part.toLowerCase());
}

function directoryDenyGlobParts(pattern: string): string[] | undefined {
  if (!pattern.endsWith('/**')) return undefined;
  const directoryPattern = pattern.slice(0, -3);
  if (directoryPattern.length === 0 || /[*?[\]{}]/.test(directoryPattern)) return undefined;
  return directoryPattern.split('/').filter(Boolean).map((part) => part.toLowerCase());
}

function stripPlatformCanonicalizationPrefix(parts: string[]): string[] {
  // realpathSync resolves OS-managed temp roots through /private on macOS
  // (e.g. /tmp -> /private/tmp, per-user tmp -> /private/var/folders/...).
  // That is a filesystem canonicalization artifact, not a user-owned
  // "private" directory, so strip it once before deny-glob matching runs.
  if (parts[0] === 'private' && (parts[1] === 'var' || parts[1] === 'tmp')) {
    return parts.slice(2);
  }
  return parts;
}

function partsContainDeniedRoot(parts: string[], deniedParts: string[]): boolean {
  for (let index = 0; index <= parts.length - deniedParts.length; index += 1) {
    const matches = deniedParts.every((part, offset) => parts[index + offset] === part);
    if (matches) return true;
  }
  return false;
}

export function sensitiveAllowedRootReason(canonicalPath: string, denyGlobs = COMMON_DENY_GLOBS, rawPath?: string): string | undefined {
  const candidateParts = Array.from(new Set([rawPath, canonicalPath]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => stripPlatformCanonicalizationPrefix(pathParts(value)))));

  for (const pattern of denyGlobs) {
    const deniedParts = directoryDenyGlobParts(pattern);
    if (!deniedParts) continue;
    if (candidateParts.some((parts) => partsContainDeniedRoot(parts, deniedParts))) {
      return pattern;
    }
  }

  return undefined;
}

export const PLANNER_READ_GLOBS = [
  'AGENTS.md',
  'CLAUDE.md',
  'SKILL.md',
  'docs/spec.md',
  'docs/reference-configs/**',
  'docs/prds/**',
  'tasks/lessons.md',
  '.ai/context/**',
  '.ai/harness/handoff/**',
  '.ai/harness/checks/**',
];

export const PLANNER_WRITE_GLOBS = [
  'docs/prds/**',
  'tasks/lessons.md',
];

export interface McpPolicyOptions {
  enableReader?: boolean;
  allowedRoots?: string[];
  discoveryRoots?: string[];
}

function withWorkspacePrefixGlobs(globs: string[]): string[] {
  return Array.from(new Set([
    ...globs,
    ...globs.map((glob) => `*/${glob}`),
  ]));
}

function capabilities(overrides: Partial<McpPolicy['capabilities']> = {}): McpPolicy['capabilities'] {
  return {
    workspaceReader: false,
    workflowPlanner: false,
    workflowExecutor: false,
    ...overrides,
  };
}

export function getMcpPolicy(profile: McpProfileName, opts: McpPolicyOptions = {}): McpPolicy {
  if (profile === 'planner') {
    return {
      profile,
      allowedRoots: opts.allowedRoots,
      discoveryRoots: opts.discoveryRoots,
      capabilities: capabilities({
        workspaceReader: opts.enableReader === true,
        workflowPlanner: true,
      }),
      readGlobs: withWorkspacePrefixGlobs(PLANNER_READ_GLOBS),
      writeGlobs: withWorkspacePrefixGlobs(PLANNER_WRITE_GLOBS),
      denyGlobs: COMMON_DENY_GLOBS,
      allowAbsoluteRead: false,
      maxFileBytes: 512 * 1024,
    };
  }

  if (profile === 'executor') {
    return {
      profile,
      allowedRoots: opts.allowedRoots,
      discoveryRoots: opts.discoveryRoots,
      capabilities: capabilities({ workflowExecutor: true }),
      readGlobs: withWorkspacePrefixGlobs(['docs/prds/**', 'tasks/lessons.md', 'docs/spec.md', '.ai/context/**', '.ai/harness/**']),
      writeGlobs: withWorkspacePrefixGlobs(['docs/prds/**', 'tasks/lessons.md', '.ai/harness/checks/**', '.ai/harness/handoff/**']),
      denyGlobs: COMMON_DENY_GLOBS,
      allowAbsoluteRead: false,
      maxFileBytes: 512 * 1024,
    };
  }

  throw new Error(`unknown MCP profile: ${String(profile)}`);
}

function isMcpProfileName(value: string): value is McpProfileName {
  return value === 'planner' || value === 'executor';
}

export function parseMcpProfile(value: string): McpProfileName {
  if (isMcpProfileName(value)) return value;
  throw new Error(`invalid MCP profile "${value}" (expected: planner, executor)`);
}
