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

export function getMcpPolicy(profile: McpProfileName, opts: McpPolicyOptions = {}): McpPolicy {
  if (profile === 'planner') {
    const fullDiskRead = opts.fullDiskRead === true;
    return {
      profile,
      readGlobs: fullDiskRead ? ['**'] : withWorkspacePrefixGlobs(PLANNER_READ_GLOBS),
      writeGlobs: withWorkspacePrefixGlobs(PLANNER_WRITE_GLOBS),
      denyGlobs: fullDiskRead ? [] : [
        ...COMMON_DENY_GLOBS,
        'src/**',
        'app/**',
        'packages/**',
        'package.json',
        'bun.lock',
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        '.github/workflows/**',
      ],
      allowAbsoluteRead: fullDiskRead,
      maxFileBytes: 512 * 1024,
      execution: executionPolicy({
        fixedWorkflowCheck: !fullDiskRead,
      }),
    };
  }

  if (profile === 'executor') {
    const fullDiskRead = opts.fullDiskRead === true;
    return {
      profile,
      readGlobs: fullDiskRead ? ['**'] : withWorkspacePrefixGlobs(['plans/**', 'tasks/**', 'docs/spec.md', '.ai/context/**', '.ai/harness/**']),
      writeGlobs: withWorkspacePrefixGlobs(['tasks/reviews/**', '.ai/harness/checks/**', '.ai/harness/handoff/**']),
      denyGlobs: fullDiskRead ? [] : COMMON_DENY_GLOBS,
      allowAbsoluteRead: fullDiskRead,
      maxFileBytes: 512 * 1024,
      execution: executionPolicy({
        fixedWorkflowCheck: !fullDiskRead,
      }),
    };
  }

  if (profile === 'orchestrator') {
    const devRunner = opts.devAgentRunner === true;
    return {
      profile,
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
