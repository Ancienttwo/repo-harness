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
  'plans/**',
  'tasks/current.md',
  'tasks/contracts/**',
  'tasks/reviews/**',
  'tasks/notes/**',
  '.ai/context/**',
  '.ai/harness/handoff/**',
  '.ai/harness/checks/**',
];

export const PLANNER_WRITE_GLOBS = [
  'plans/prds/**',
  'plans/sprints/**',
  'plans/plan-*.md',
  '.ai/harness/handoff/task-goal.md',
  '.ai/harness/handoff/chatgpt-plan.md',
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

function executionPolicy(overrides: Partial<McpPolicy['execution']> = {}): McpPolicy['execution'] {
  return {
    fixedWorkflowCheck: false,
    codingShell: false,
    ...overrides,
  };
}

function capabilities(overrides: Partial<McpPolicy['capabilities']> = {}): McpPolicy['capabilities'] {
  return {
    workspaceReader: false,
    workflowPlanner: false,
    workflowExecutor: false,
    workspaceCoder: false,
    taskDispatch: false,
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
      execution: executionPolicy({
        fixedWorkflowCheck: true,
      }),
    };
  }

  if (profile === 'executor') {
    return {
      profile,
      allowedRoots: opts.allowedRoots,
      discoveryRoots: opts.discoveryRoots,
      capabilities: capabilities({ workflowExecutor: true }),
      readGlobs: withWorkspacePrefixGlobs(['plans/**', 'tasks/**', 'docs/spec.md', '.ai/context/**', '.ai/harness/**']),
      writeGlobs: withWorkspacePrefixGlobs(['tasks/reviews/**', '.ai/harness/checks/**', '.ai/harness/handoff/**']),
      denyGlobs: COMMON_DENY_GLOBS,
      allowAbsoluteRead: false,
      maxFileBytes: 512 * 1024,
      execution: executionPolicy({
        fixedWorkflowCheck: true,
      }),
    };
  }

  if (profile === 'orchestrator') {
    // Dispatch only: no workflow file, reader, planner write, or shell surface.
    return {
      profile,
      allowedRoots: opts.allowedRoots,
      discoveryRoots: opts.discoveryRoots,
      capabilities: capabilities({ taskDispatch: true }),
      readGlobs: [],
      writeGlobs: [],
      denyGlobs: ['**'],
      maxFileBytes: 0,
      execution: executionPolicy(),
    };
  }

  if (profile === 'coding') {
    return {
      profile,
      allowedRoots: opts.allowedRoots,
      discoveryRoots: opts.discoveryRoots,
      capabilities: capabilities({
        workflowPlanner: true,
        workspaceCoder: true,
      }),
      readGlobs: withWorkspacePrefixGlobs(PLANNER_READ_GLOBS),
      writeGlobs: withWorkspacePrefixGlobs(PLANNER_WRITE_GLOBS),
      denyGlobs: COMMON_DENY_GLOBS,
      maxFileBytes: 512 * 1024,
      execution: executionPolicy({
        fixedWorkflowCheck: true,
        codingShell: true,
      }),
    };
  }

  throw new Error(`unknown MCP profile: ${String(profile)}`);
}

/**
 * Profiles whose tokens carry repo authority. This table is the only place
 * that names them: the OAuth scope, the OAuth-only rule, the read_write grant
 * and the authorization revision checks all read it.
 */
const AUTHORIZATION_PROFILES: Readonly<Partial<Record<McpProfileName, McpAuthorizationProfile>>> = Object.freeze({
  coding: Object.freeze({ requiredScope: 'repo-harness.coding' }),
  orchestrator: Object.freeze({ requiredScope: 'repo-harness.orchestrator' }),
});

export interface McpAuthorizationProfile {
  readonly requiredScope: string;
}

export function authorizationProfile(profile: string | undefined): McpAuthorizationProfile | null {
  return profile !== undefined && Object.hasOwn(AUTHORIZATION_PROFILES, profile)
    ? AUTHORIZATION_PROFILES[profile as McpProfileName] ?? null
    : null;
}

/** Scopes this profile advertises and accepts. */
export function mcpSupportedScopes(profile: string): string[] {
  const requiredScope = authorizationProfile(profile)?.requiredScope;
  return ['repo-harness', ...(requiredScope ? [requiredScope] : []), 'offline_access'];
}

export function isMcpProfileName(value: string): value is McpProfileName {
  return value === 'planner' || value === 'executor' || value === 'orchestrator' || value === 'coding';
}

export function parseMcpProfile(value: string): McpProfileName {
  if (isMcpProfileName(value)) return value;
  throw new Error(`invalid MCP profile "${value}" (expected: planner, executor, orchestrator, coding)`);
}
