import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

function runMcp(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync('bun', [CLI, 'mcp', ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

function withGhStub<T>(fn: (env: NodeJS.ProcessEnv) => T): T {
  const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-gh-'));
  try {
    writeFileSync(join(binDir, 'gh'), [
      '#!/bin/sh',
      'if [ -n "${GH_STUB_ERROR:-}" ]; then printf "%s\\n" "$GH_STUB_ERROR" >&2; exit 1; fi',
      'printf "%s\\n" "$GH_STUB_JSON"',
      '',
    ].join('\n'), { mode: 0o755 });
    return fn({ PATH: `${binDir}:${process.env.PATH ?? ''}` });
  } finally {
    rmSync(binDir, { recursive: true, force: true });
  }
}

interface StubComment {
  author: { login: string };
  body: string;
  url: string;
}

const ISSUE: {
  number: number;
  title: string;
  state: string;
  url: string;
  body: string;
  assignees: Array<{ login: string }>;
  comments: StubComment[];
} = {
  number: 123,
  title: 'Issue goal fixture',
  state: 'OPEN',
  url: 'https://github.com/example/repo/issues/123',
  body: [
    'The issue body owns task identity.',
    '',
    '## Scope',
    '',
    'Only docs/prds and tasks/lessons.md.',
    '',
    '## Non-goals',
    '',
    'No migrations.',
    '',
    '## Acceptance checks',
    '',
    '- Run bun run check:type.',
    '- Run the MCP tests.',
    '',
    '## Stop condition',
    '',
    'Verified completion or a named blocker.',
  ].join('\n'),
  assignees: [{ login: 'alice' }, { login: 'bob' }],
  comments: [],
};

function issueEnv(issue = ISSUE, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { GH_STUB_JSON: JSON.stringify(issue), ...extra };
}

describe('mcp command', () => {
  test('prints help for command group and subcommands', () => {
    const root = runMcp(['--help']);
    expect(root.status).toBe(0);
    expect(root.stdout).toContain('Run and configure the repo-harness MCP workflow sidecar');
    expect(root.stdout).toContain('serve');
    expect(root.stdout).toContain('doctor');
    expect(root.stdout).toContain('setup');
    expect(root.stdout).toContain('prepare-goal');

    const serve = runMcp(['serve', '--help']);
    expect(serve.status).toBe(0);
    expect(serve.stdout).toContain('--transport <transport>');
    expect(serve.stdout).toContain('--profile <profile>');
    expect(serve.stdout).toContain('planner|executor|orchestrator');
    expect(serve.stdout).toContain('--enable-reader');
    expect(serve.stdout).toContain('--allow-root <path>');
    expect(serve.stdout).toContain('oauth|bearer|url-token');

    const doctor = runMcp(['doctor', '--help']);
    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain('Check repo-harness MCP setup status');

    const setup = runMcp(['setup', '--help']);
    expect(setup.status).toBe(0);
    expect(setup.stdout).toContain('chatgpt');
    expect(setup.stdout).toContain('codex');

    const prepareGoal = runMcp(['prepare-goal', '--help']);
    expect(prepareGoal.status).toBe(0);
    expect(prepareGoal.stdout).toContain('--issue <number>');
    expect(prepareGoal.stdout).not.toContain('--prd');
    expect(prepareGoal.stdout).not.toContain('--sprint');
  }, 30_000);

  test('rejects invalid subcommands with a useful error', () => {
    const result = runMcp(['missing']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown command 'missing'");
  }, 30_000);

  test('prepare-goal prints the Goal prompt shape from an OPEN issue', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-goal-'));
    try {
      withGhStub((env) => {
        const result = runMcp(['prepare-goal', '--repo', repoRoot, '--issue', '123'], { ...env, ...issueEnv() });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout.startsWith('/goal\n')).toBe(true);
        expect(result.stdout).toContain('Goal: Issue goal fixture');
        expect(result.stdout).toContain('Issue: https://github.com/example/repo/issues/123');
        expect(result.stdout).toContain('PR: none yet');
        expect(result.stdout).toContain('Claim: no active claim; assignees: alice, bob (https://github.com/example/repo/issues/123)');
        expect(result.stdout).toContain('Authority: the current GitHub issue and PR');
        expect(result.stdout).toContain('Scope: Only docs/prds and tasks/lessons.md.');
        expect(result.stdout).toContain('Non-goals: No migrations.');
        expect(result.stdout).toContain('Acceptance checks: Run bun run check:type. Run the MCP tests.');
        expect(result.stdout).toContain('Stop condition: Verified completion or a named blocker.');
        expect(result.stdout).toContain('Delegation: use only existing authorization');
        expect(result.stdout).toContain('Reporting: use the user\'s language');
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 30_000);

  test('prepare-goal parses the claim status word before the first semicolon', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-goal-claim-'));
    const comment = (login: string, status: string, id: number) => ({
      author: { login },
      body: `repo-harness issue claim\n\nStatus: ${status}\nAgent: test`,
      url: `https://github.com/example/repo/issues/123#issuecomment-${id}`,
    });
    const goal = (env: NodeJS.ProcessEnv, comments: StubComment[]) => runMcp(['prepare-goal', '--repo', repoRoot, '--issue', '123'], {
      ...env,
      ...issueEnv({ ...ISSUE, comments }),
    });
    try {
      withGhStub((env) => {
        const active = goal(env, [
          comment('carol', 'released', 1),
          comment('dave', 'active', 2),
          { author: { login: 'erin' }, body: 'unrelated review note', url: 'https://github.com/example/repo/issues/123#issuecomment-3' },
        ]);
        expect(active.status).toBe(0);
        expect(active.stdout).toContain('Claim: dave (https://github.com/example/repo/issues/123#issuecomment-2)');

        for (const retained of ['active; D1 blocked by the docs-host network boundary', 'blocked; waiting for review', 'ready for review; checks pass']) {
          const result = goal(env, [comment('dave', retained, 2)]);
          expect(result.status).toBe(0);
          expect(result.stdout).toContain('Claim: dave (https://github.com/example/repo/issues/123#issuecomment-2)');
          expect(result.stdout).not.toContain('no active claim');
        }

        for (const cleared of ['released; handoff complete', 'done; checks passed']) {
          const result = goal(env, [comment('dave', cleared, 4)]);
          expect(result.status).toBe(0);
          expect(result.stdout).toContain('Claim: no active claim; assignees: alice, bob (https://github.com/example/repo/issues/123)');
        }

        const unknown = goal(env, [comment('dave', 'reviewing; pending owner reply', 5)]);
        expect(unknown.status).toBe(0);
        expect(unknown.stdout).toContain('Claim: claim status unknown: reviewing; pending owner reply dave (https://github.com/example/repo/issues/123#issuecomment-5)');
        expect(unknown.stdout).not.toContain('no active claim');
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 30_000);

  test('prepare-goal exits 2 with the reason when the issue is not OPEN or gh fails', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-goal-negative-'));
    try {
      withGhStub((env) => {
        const closed = runMcp(['prepare-goal', '--repo', repoRoot, '--issue', '123'], {
          ...env, ...issueEnv({ ...ISSUE, state: 'CLOSED' }),
        });
        expect(closed.status).toBe(2);
        expect(closed.stderr.trim()).toBe('prepare-goal: issue 123 is unavailable: state CLOSED');

        const failed = runMcp(['prepare-goal', '--repo', repoRoot, '--issue', '123'], {
          ...env, ...issueEnv(ISSUE, { GH_STUB_ERROR: 'gh: authentication required' }),
        });
        expect(failed.status).toBe(2);
        expect(failed.stderr.trim()).toBe('prepare-goal: issue 123 is unavailable: gh: authentication required');

        for (const [flag, value] of [
          ['--prd', 'docs/prds/example.prd.md'],
          ['--sprint', 'plans/sprints/example.sprint.md'],
          ['--reference-repo', '/tmp/reference-repo'],
          ['--extra-instructions', 'extra'],
          ['--expected-sha256', 'a'.repeat(64)],
        ]) {
          const removed = runMcp(['prepare-goal', '--repo', repoRoot, '--issue', '123', flag, value], env);
          expect(removed.status).not.toBe(0);
          expect(removed.stderr).toContain(`unknown option '${flag}'`);
        }
      });
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
