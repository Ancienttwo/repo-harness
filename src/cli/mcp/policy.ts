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

export function getMcpPolicy(profile: McpProfileName): McpPolicy {
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
      execution: {
        fixedWorkflowCheck: true,
        codexRunner: false,
      },
    };
  }

  if (profile === 'executor') {
    return {
      profile,
      readGlobs: ['plans/**', 'tasks/**', 'docs/spec.md', '.ai/context/**', '.ai/harness/**'],
      writeGlobs: ['tasks/reviews/**', '.ai/harness/checks/**', '.ai/harness/handoff/**'],
      denyGlobs: COMMON_DENY_GLOBS,
      maxFileBytes: 512 * 1024,
      execution: {
        fixedWorkflowCheck: true,
        codexRunner: false,
      },
    };
  }

  if (profile === 'orchestrator') {
    return {
      profile,
      readGlobs: [],
      writeGlobs: [],
      denyGlobs: ['**'],
      maxFileBytes: 0,
      execution: {
        fixedWorkflowCheck: false,
        codexRunner: false,
      },
    };
  }

  throw new Error(`unknown MCP profile: ${String(profile)}`);
}

export function parseMcpProfile(value: string): McpProfileName {
  if (value === 'planner' || value === 'executor' || value === 'orchestrator') return value;
  throw new Error(`invalid MCP profile "${value}" (expected: planner, executor, orchestrator)`);
}
