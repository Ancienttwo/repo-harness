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
}

const DEFAULT_RUNNER_TIMEOUT_MS = 120_000;

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
    return {
      profile,
      readGlobs: PLANNER_READ_GLOBS,
      writeGlobs: PLANNER_WRITE_GLOBS,
      denyGlobs: [
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
      maxFileBytes: 512 * 1024,
      execution: executionPolicy({
        fixedWorkflowCheck: true,
      }),
    };
  }

  if (profile === 'executor') {
    return {
      profile,
      readGlobs: ['plans/**', 'tasks/**', 'docs/spec.md', '.ai/context/**', '.ai/harness/**'],
      writeGlobs: ['tasks/reviews/**', '.ai/harness/checks/**', '.ai/harness/handoff/**'],
      denyGlobs: COMMON_DENY_GLOBS,
      maxFileBytes: 512 * 1024,
      execution: executionPolicy({
        fixedWorkflowCheck: true,
      }),
    };
  }

  if (profile === 'orchestrator') {
    const devRunner = opts.devAgentRunner === true;
    return {
      profile,
      readGlobs: devRunner ? ['.ai/harness/handoff/codex-goal.md'] : [],
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
