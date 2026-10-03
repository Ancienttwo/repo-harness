import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

// Optional plan metadata cannot authorize or block ordinary edits.
const ROOT = join(import.meta.dir, '..');
const RUNTIME_MODULE = join(ROOT, 'src/cli/hook/runtime.ts');

// Mirrors .ai/harness/policy.json's active_plan.statuses (owner-decided
// 13-value union: the 11-value code union plus Blocked and Review, which
// live on three current real plans). Duplicated here deliberately as test
// input data, not as a second guard authority -- the guard itself reads
// only the scratch repo's own policy.json at runtime.
const KNOWN_STATUSES = [
  'Draft',
  'Annotating',
  'Approved',
  'Executing',
  'Blocked',
  'Review',
  'Complete',
  'Completed',
  'Done',
  'Fulfilled',
  'Archived',
  'Abandoned',
  'Superseded',
];
const PLAN_LIFECYCLE = {
  annotation_end: 'Annotating', approved: 'Approved', executing: 'Executing', terminal_start: 'Complete',
};

function git(cwd: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function initRepo(cwd: string, options: { withStatusesArray?: boolean; withLifecycle?: boolean } = {}): void {
  const withStatusesArray = options.withStatusesArray ?? true;
  const withLifecycle = options.withLifecycle ?? true;
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'plan-status-gate@example.com']);
  git(cwd, ['config', 'user.name', 'Plan Status Gate Test']);
  mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  mkdirSync(join(cwd, 'plans'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(
    join(cwd, '.ai/harness/policy.json'),
    JSON.stringify(
      {
        worktree_strategy: { review_base: 'main', base_branch: 'main' },
        ...(withStatusesArray ? { active_plan: { statuses: KNOWN_STATUSES, ...(withLifecycle ? { lifecycle: PLAN_LIFECYCLE } : {}) } } : {}),
      },
      null,
      2,
    ),
  );
  writeFileSync(join(cwd, 'docs/spec.md'), '# Spec\n');
  writeFileSync(join(cwd, 'README.md'), '# fixture\n');
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'seed']);
}

function writeActivePlan(cwd: string, status: string): string {
  const plan = 'plans/plan-20260720-0000-gate-fixture.md';
  writeFileSync(
    join(cwd, plan),
    ['# Gate Fixture', '', `> **Status**: ${status}`, ''].join('\n'),
  );
  writeFileSync(join(cwd, '.ai/harness/active-plan'), `${plan}\n`);
  writeFileSync(join(cwd, '.ai/harness/active-worktree'), `${cwd}\n`);
  return plan;
}

function preEdit(cwd: string, path: string, extraEnv: NodeJS.ProcessEnv = {}) {
  const moduleUrl = pathToFileURL(RUNTIME_MODULE).href;
  const script = [
    'const stdinText = await Bun.stdin.text();',
    `const { runHook } = await import(${JSON.stringify(moduleUrl)});`,
    "const result = runHook({ event: 'PreToolUse', routeId: 'edit', input: stdinText.length > 0 ? stdinText : undefined });",
    'process.exit(result.exitCode);',
  ].join('\n');
  return spawnSync(process.execPath, ['-e', script], {
    cwd,
    input: JSON.stringify({ tool_input: { file_path: path } }),
    encoding: 'utf-8',
    env: {
      ...process.env,
      HOOK_REPO_ROOT: cwd,
      REPO_HARNESS_WORKFLOW_PROFILE: 'routine',
      ...extraEnv,
    },
  });
}

describe('ordinary edits are independent of optional plan status', () => {
  for (const status of [...KNOWN_STATUSES, '!!broken!!', '', 'InProgress', 'executing']) {
    test(`${JSON.stringify(status)} does not become an edit permission`, () => {
      const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'plan-status-advisory-')));
      try {
        initRepo(cwd); writeActivePlan(cwd, status);
        const result = preEdit(cwd, 'src/feature.ts');
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout + result.stderr).not.toContain('PlanStatusGuard');
      } finally { rmSync(cwd, { recursive: true, force: true }); }
    });
  }
  for (const missing of ['plan', 'statuses', 'lifecycle', 'policy'] as const) {
    test(`missing ${missing} does not block ordinary edits`, () => {
      const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'plan-status-missing-')));
      try {
        initRepo(cwd, { withStatusesArray: missing !== 'statuses', withLifecycle: missing !== 'lifecycle' });
        const path = writeActivePlan(cwd, 'Executing');
        if (missing === 'plan') rmSync(join(cwd, path));
        if (missing === 'policy') rmSync(join(cwd, '.ai/harness/policy.json'));
        const result = preEdit(cwd, 'src/feature.ts');
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout + result.stderr).not.toContain('PlanStatusGuard');
      } finally { rmSync(cwd, { recursive: true, force: true }); }
    });
  }
});
