import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

// Edit-guard fixtures for the mutation-guard.ts (HRD-03; formerly
// pre-edit-guard.sh) fail-closed default branch (2026-07-20 falsifier
// resolution): any plan status outside the single authority --
// .ai/harness/policy.json's active_plan.statuses array -- deterministically
// blocks implementation edits, while every status in that array (including
// Blocked/Review, added by owner decision) behaves exactly as before.
// Covers: malformed, empty, unrecognized, each known-good status, and the
// missing-authority case (policy.json lacks the array).
//
// Migrated from a direct `bash assets/hooks/pre-edit-guard.sh` spawn to
// exercising the handler through `runHook()` (HRD-03 test migration): the
// fixture repo below never creates `.ai/hooks`, so `runHook()`'s
// `mutationGuardScriptsAbsent` check is satisfied and the in-process handler
// runs. `preEdit()` still spawns exactly one subprocess per call -- a `bun
// -e` wrapper importing and calling `runHook()` in-process -- purely so this
// test can observe real host-visible fd1/fd2 output (`RunHookResult` itself
// carries no stdout/stderr text; the previous single `bash` spawn served the
// same "capture real process output" role). REPO_HARNESS_CLI /
// REPO_HARNESS_HOOK_CLI are gone: the handler calls `resolveEffectiveState`
// and `recordCircuitAttempt` in-process, so there is no CLI subprocess left
// to point at.
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

function git(cwd: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function initRepo(cwd: string, options: { withStatusesArray?: boolean } = {}): void {
  const withStatusesArray = options.withStatusesArray ?? true;
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
        hook_source: 'repo',
        worktree_strategy: { review_base: 'main', base_branch: 'main' },
        ...(withStatusesArray ? { active_plan: { statuses: KNOWN_STATUSES } } : {}),
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
      REPO_HARNESS_WORKFLOW_PROFILE: 'standard',
      // Forces hooksDir resolution to the fixture's own (nonexistent)
      // .ai/hooks regardless of policy.json's hook_source pin -- several
      // fixtures below deliberately delete policy.json to exercise the
      // plan-status authority-unavailable branch, which would otherwise
      // ALSO strip the repo-pin signal `resolveHooksDir()` reads from the
      // same file and silently fall back to this checkout's own real
      // assets/hooks/ scripts instead of the in-process handler under test.
      REPO_HARNESS_HOOK_SOURCE: 'repo',
      ...extraEnv,
    },
  });
}

describe('pre-edit-guard plan-status fail-closed default (falsifier-resolved authority)', () => {
  test('malformed status blocks with a structured reason naming the status and plan file', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'plan-status-malformed-')));
    try {
      initRepo(cwd);
      const plan = writeActivePlan(cwd, '!!broken!!');
      const result = preEdit(cwd, 'src/feature.ts');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('PlanStatusGuard');
      expect(result.stderr).toContain('!!broken!!');
      expect(result.stderr).toContain(plan);
      expect(result.stderr).toContain('not in the known-status authority');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('empty status blocks with a structured reason', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'plan-status-empty-')));
    try {
      initRepo(cwd);
      const plan = 'plans/plan-20260720-0000-gate-fixture.md';
      // No "> **Status**:" line at all: get_plan_status returns "".
      writeFileSync(join(cwd, plan), ['# Gate Fixture', ''].join('\n'));
      writeFileSync(join(cwd, '.ai/harness/active-plan'), `${plan}\n`);
      writeFileSync(join(cwd, '.ai/harness/active-worktree'), `${cwd}\n`);
      const result = preEdit(cwd, 'src/feature.ts');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('PlanStatusGuard');
      expect(result.stderr).toContain(plan);
      expect(result.stderr).toContain('not in the known-status authority');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('unrecognized (but plausible-looking) status blocks -- not just literal garbage', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'plan-status-unrecognized-')));
    try {
      initRepo(cwd);
      const plan = writeActivePlan(cwd, 'InProgress');
      const result = preEdit(cwd, 'src/feature.ts');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('PlanStatusGuard');
      expect(result.stderr).toContain('InProgress');
      expect(result.stderr).toContain(plan);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('casing variant of a known status is not byte-equal and blocks', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'plan-status-casing-')));
    try {
      initRepo(cwd);
      writeActivePlan(cwd, 'executing');
      const result = preEdit(cwd, 'src/feature.ts');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('PlanStatusGuard');
      expect(result.stderr).toContain('executing');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('missing plan file keeps the existing missing_artifact path unchanged', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'plan-status-missing-plan-')));
    try {
      initRepo(cwd);
      // Active-plan marker points at a plan file that does not exist.
      writeFileSync(join(cwd, '.ai/harness/active-plan'), 'plans/plan-does-not-exist.md\n');
      writeFileSync(join(cwd, '.ai/harness/active-worktree'), `${cwd}\n`);
      const result = preEdit(cwd, 'src/feature.ts');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('PlanStatusGuard');
      expect(result.stderr).toContain('without an active plan');
      expect(result.stderr).not.toContain('not in the known-status authority');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  describe('each known-good status', () => {
    for (const status of KNOWN_STATUSES) {
      test(`'${status}' behaves exactly as today`, () => {
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), `plan-status-known-${status.toLowerCase()}-`)));
        try {
          initRepo(cwd);
          writeActivePlan(cwd, status);
          const result = preEdit(cwd, 'src/feature.ts');
          if (status === 'Draft' || status === 'Annotating') {
            // Unchanged pre-existing behavior: still blocks, but via the
            // original Draft/Annotating message, never the new
            // "not in the known-status authority" reason.
            expect(result.status).toBe(2);
            expect(result.stderr).toContain('PlanStatusGuard');
            expect(result.stderr).toContain(`plan status is ${status}`);
            expect(result.stderr).not.toContain('not in the known-status authority');
          } else {
            // Every other known-good status passes through silently, same
            // as before this package: no PlanStatusGuard block at all.
            expect(result.status).toBe(0);
            expect(result.stdout).not.toContain('PlanStatusGuard');
            expect(result.stderr).not.toContain('PlanStatusGuard');
          }
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      });
    }
  });

  test('missing active_plan.statuses array is itself a fail-closed authority-unavailable condition', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'plan-status-no-authority-')));
    try {
      initRepo(cwd, { withStatusesArray: false });
      // Even a status that would otherwise be perfectly legitimate (Executing)
      // must still block when the authority itself cannot be read: an
      // unavailable authority is not "nothing to check against".
      const plan = writeActivePlan(cwd, 'Executing');
      const result = preEdit(cwd, 'src/feature.ts');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('PlanStatusGuard');
      expect(result.stderr).toContain('policy.json');
      expect(result.stderr).toContain('active_plan.statuses');
      expect(result.stderr).not.toContain('not in the known-status authority');
      expect(result.stderr).not.toContain(plan);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('missing policy.json entirely is also fail-closed', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'plan-status-no-policy-file-')));
    try {
      initRepo(cwd, { withStatusesArray: false });
      rmSync(join(cwd, '.ai/harness/policy.json'));
      writeActivePlan(cwd, 'Executing');
      const result = preEdit(cwd, 'src/feature.ts');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('PlanStatusGuard');
      expect(result.stderr).toContain('policy.json');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('advice mode reports the same unrecognized status without hard-blocking', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'plan-status-advice-')));
    try {
      initRepo(cwd);
      writeActivePlan(cwd, 'InProgress');
      const result = preEdit(cwd, 'src/feature.ts', { REPO_HARNESS_EDIT_PLAN_GATE: 'advice' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('PlanStatusGuard');
      expect(result.stdout).toContain('Advisory');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
