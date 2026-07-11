import type { McpAgentRunnerName, McpPolicy, McpProfileName } from './types';

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

function partsContainDeniedRoot(parts: string[], deniedParts: string[]): boolean {
  for (let index = 0; index <= parts.length - deniedParts.length; index += 1) {
    if (deniedParts.length === 1 && deniedParts[0] === 'private' && index === 0 && parts[1] === 'var') {
      continue;
    }
    const matches = deniedParts.every((part, offset) => parts[index + offset] === part);
    if (matches) return true;
  }
  return false;
}

export function sensitiveAllowedRootReason(canonicalPath: string, denyGlobs = COMMON_DENY_GLOBS, rawPath?: string): string | undefined {
  const candidateParts = Array.from(new Set([rawPath, canonicalPath]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => pathParts(value))));

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
  '.ai/harness/handoff/codex-goal.md',
  '.ai/harness/handoff/chatgpt-plan.md',
];

export interface McpPolicyOptions {
  devAgentRunner?: boolean;
  allowedAgents?: McpAgentRunnerName[];
  runnerTimeoutMs?: number;
  fullDiskRead?: boolean;
  enableReader?: boolean;
  allowedRoots?: string[];
  discoveryRoots?: string[];
}

const DEFAULT_RUNNER_TIMEOUT_MS = 120_000;

function withWorkspacePrefixGlobs(globs: string[]): string[] {
  return Array.from(new Set([
    ...globs,
    ...globs.map((glob) => `*/${glob}`),
  ]));
}

function executionPolicy(overrides: Partial<McpPolicy['execution']> = {}): McpPolicy['execution'] {
  return {
    fixedWorkflowCheck: false,
    codexRunner: false,
    agentRunner: false,
    allowedAgents: [],
    runnerTimeoutMs: DEFAULT_RUNNER_TIMEOUT_MS,
    ...overrides,
  };
}

function capabilities(overrides: Partial<McpPolicy['capabilities']> = {}): McpPolicy['capabilities'] {
  return {
    workspaceReader: false,
    workflowPlanner: false,
    workflowExecutor: false,
    agentRunner: false,
    ...overrides,
  };
}

export function getMcpPolicy(profile: McpProfileName, opts: McpPolicyOptions = {}): McpPolicy {
  if (profile === 'planner') {
    const broadRead = opts.fullDiskRead === true;
    return {
      profile,
      allowedRoots: opts.allowedRoots,
      discoveryRoots: opts.discoveryRoots,
      capabilities: capabilities({
        workspaceReader: opts.enableReader === true,
        workflowPlanner: true,
      }),
      readGlobs: broadRead ? ['**'] : withWorkspacePrefixGlobs(PLANNER_READ_GLOBS),
      writeGlobs: withWorkspacePrefixGlobs(PLANNER_WRITE_GLOBS),
      denyGlobs: COMMON_DENY_GLOBS,
      allowAbsoluteRead: broadRead,
      maxFileBytes: 512 * 1024,
      execution: executionPolicy({
        fixedWorkflowCheck: !broadRead,
      }),
    };
  }

  if (profile === 'executor') {
    const broadRead = opts.fullDiskRead === true;
    return {
      profile,
      allowedRoots: opts.allowedRoots,
      discoveryRoots: opts.discoveryRoots,
      capabilities: capabilities({ workflowExecutor: true }),
      readGlobs: broadRead ? ['**'] : withWorkspacePrefixGlobs(['plans/**', 'tasks/**', 'docs/spec.md', '.ai/context/**', '.ai/harness/**']),
      writeGlobs: withWorkspacePrefixGlobs(['tasks/reviews/**', '.ai/harness/checks/**', '.ai/harness/handoff/**']),
      denyGlobs: COMMON_DENY_GLOBS,
      allowAbsoluteRead: broadRead,
      maxFileBytes: 512 * 1024,
      execution: executionPolicy({
        fixedWorkflowCheck: !broadRead,
      }),
    };
  }

  if (profile === 'orchestrator') {
    const devRunner = opts.devAgentRunner === true;
    return {
      profile,
      allowedRoots: opts.allowedRoots,
      discoveryRoots: opts.discoveryRoots,
      capabilities: capabilities({ agentRunner: devRunner }),
      readGlobs: devRunner ? withWorkspacePrefixGlobs(['.ai/harness/handoff/codex-goal.md']) : [],
      writeGlobs: [],
      denyGlobs: devRunner ? COMMON_DENY_GLOBS : ['**'],
      maxFileBytes: devRunner ? 512 * 1024 : 0,
      execution: executionPolicy({
        codexRunner: devRunner,
        agentRunner: devRunner,
        allowedAgents: devRunner ? (opts.allowedAgents?.length ? opts.allowedAgents : ['codex']) : [],
        runnerTimeoutMs: opts.runnerTimeoutMs ?? DEFAULT_RUNNER_TIMEOUT_MS,
      }),
    };
  }

  throw new Error(`unknown MCP profile: ${String(profile)}`);
}

export function parseMcpProfile(value: string): McpProfileName {
  if (value === 'planner' || value === 'executor' || value === 'orchestrator') return value;
  throw new Error(`invalid MCP profile "${value}" (expected: planner, executor, orchestrator)`);
}
