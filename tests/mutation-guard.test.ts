import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { runMutationGuard, type MutationGuardCollector } from '../src/cli/hook/mutation-guard';
import { createStateInputCollector } from '../src/effects/loop/state-input-collector';
import { resolveEffectiveState } from '../src/effects/state/resolve-effective-state';
import type { EffectiveState } from '../src/core/state/types';
import type { WorkflowProfile } from '../src/core/workflow/profile';

// HRD-03 falsifier proof + guard-by-guard parity fixtures for the in-process
// mutation-guard handler that replaces worktree-guard.sh + pre-edit-guard.sh.
// Every fixture calls `runMutationGuard()` directly -- no `bash`/subprocess
// script spawn anywhere in this file -- to prove each guard's decision,
// reason token, exit code, output shape, and durable write set are
// reproducible in-process. `resolveGitDir()` inside mutation-guard.ts still
// shells out to `git rev-parse --git-dir` for one fact (see notes: this is
// not the "shell-only process semantics" the Falsifier is about).

function git(cwd: string, args: readonly string[]): void {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function initRepo(cwd: string): void {
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'mutation-guard@example.com']);
  git(cwd, ['config', 'user.name', 'Mutation Guard Test']);
  mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(join(cwd, 'README.md'), '# fixture\n');
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'seed']);
}

function writePolicy(cwd: string, extra: Record<string, unknown> = {}): void {
  writeFileSync(
    join(cwd, '.ai/harness/policy.json'),
    `${JSON.stringify(
      {
        worktree_strategy: { review_base: 'main', base_branch: 'main' },
        active_plan: {
          statuses: [
            'Draft', 'Annotating', 'Approved', 'Executing', 'Blocked', 'Review',
            'Complete', 'Completed', 'Done', 'Fulfilled', 'Archived', 'Abandoned', 'Superseded',
          ],
        },
        ...extra,
      },
      null,
      2,
    )}\n`,
  );
}

function writeActivePlan(cwd: string, status: string, extra: string[] = []): string {
  const plan = 'plans/plan-20260720-0000-mutation-guard-fixture.md';
  mkdirSync(join(cwd, 'plans'), { recursive: true });
  writeFileSync(
    join(cwd, plan),
    ['# Mutation Guard Fixture', '', `> **Status**: ${status}`, ...extra, ''].join('\n'),
  );
  mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/active-plan'), `${plan}\n`);
  writeFileSync(join(cwd, '.ai/harness/active-worktree'), `${realpathSync(cwd)}\n`);
  return plan;
}

/** Builds a real, non-mocked collector: same `resolveEffectiveState` authority production wiring uses. */
function buildCollector(repoRoot: string, explicitOverride?: WorkflowProfile): MutationGuardCollector {
  return createStateInputCollector({
    event: 'PreToolUse',
    repoRoot,
    resolveSessionEffectiveState: () => null,
    resolvePreEditEffectiveState: (targetPaths: readonly string[]): EffectiveState | null => {
      try {
        return resolveEffectiveState(repoRoot, Date.now(), {
          targetPaths,
          operationKind: 'edit',
          explicitOverride,
        });
      } catch {
        return null;
      }
    },
  });
}

function invoke(
  cwd: string,
  payload: unknown,
  options: { readonly env?: NodeJS.ProcessEnv; readonly profile?: WorkflowProfile } = {},
) {
  return runMutationGuard({
    collector: buildCollector(cwd, options.profile),
    input: JSON.stringify(payload),
    env: options.env ?? {},
  });
}

function edit(cwd: string, filePath: string, options: { readonly env?: NodeJS.ProcessEnv; readonly profile?: WorkflowProfile } = {}) {
  return invoke(cwd, { tool_input: { file_path: filePath } }, options);
}

describe('HRD-03 falsifier: worktree refusal + SpecGuard reproduced in-process without a subprocess', () => {
  test('worktree warning: primary working tree, no enforcement marker -> exit 0, warns, does not block', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-worktree-warn-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const result = edit(cwd, 'src/feature.ts');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[WorktreeGuard] Warning: primary working tree detected (.git).');
      expect(result.stdout).toContain('To enforce linked worktrees, create .claude/.require-worktree');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('worktree block: enforcement marker present -> exit 2, structured error, failure log + circuit breaker written', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-worktree-block-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      mkdirSync(join(cwd, '.claude'), { recursive: true });
      writeFileSync(join(cwd, '.claude/.require-worktree'), '1\n');

      const result = edit(cwd, 'src/feature.ts', { env: { HOOK_RUN_ID: 'falsifier-run' } });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('[WorktreeGuard] Mutation blocked: primary working tree detected (.git).');
      expect(result.stdout).toContain('Enforcement marker found: .claude/.require-worktree');
      expect(result.stdout).toContain('"guard":"WorktreeGuard"');
      expect(result.stdout).toContain('"failure_class":"state_violation"');
      expect(result.stderr).toContain('[WorktreeGuard] Primary working tree detected at .git while .claude/.require-worktree is present.');
      expect(result.stderr).toContain('Fix: Create and switch to a linked worktree before retrying the write operation.');

      const failureLog = readFileSync(join(cwd, '.ai/harness/failures/latest.jsonl'), 'utf-8');
      expect(failureLog).toContain('"guard":"WorktreeGuard"');
      expect(failureLog).toContain('"run_id":"falsifier-run"');
      expect(existsSync(join(cwd, '.ai/harness/state/circuit-breaker.json'))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('linked worktree: git-dir under .git/worktrees/ -> silent, no warning at all', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-linked-')));
    const base = join(root, 'base');
    const worktree = join(root, 'worktree');
    try {
      mkdirSync(base, { recursive: true });
      initRepo(base);
      git(base, ['worktree', 'add', '-b', 'codex/mutation-guard-fixture', worktree]);
      writePolicy(worktree);
      const result = edit(worktree, 'src/feature.ts');
      expect(result.stdout).not.toContain('[WorktreeGuard]');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('SpecGuard: implementation edit without docs/spec.md -> exit 2, blocks before plan lookup', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-specguard-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const result = edit(cwd, 'src/feature.ts', { profile: 'standard' });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('[SpecGuard] Implementation edit without docs/spec.md: src/feature.ts');
      expect(result.stdout).toContain('"guard":"SpecGuard"');
      expect(result.stdout).toContain('"failure_class":"missing_artifact"');
      expect(result.stderr).toContain('[SpecGuard] Implementation edit to src/feature.ts without docs/spec.md.');
      expect(result.stderr).toContain('Fix: Run repo-harness run new-spec and capture stable product intent before implementing.');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('SpecGuard advisory mode: reports without blocking', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-specguard-advice-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const result = edit(cwd, 'src/feature.ts', {
        profile: 'standard',
        env: { REPO_HARNESS_EDIT_PLAN_GATE: 'advice' },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[SpecGuard] Implementation edit without docs/spec.md: src/feature.ts');
      expect(result.stdout).toContain('[SpecGuard] Advisory: run repo-harness run new-spec and capture stable product intent.');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('lite profile skips SpecGuard entirely (workflow surface exemption reached before it)', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-specguard-lite-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const result = edit(cwd, 'src/feature.ts', { profile: 'lite' });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('SpecGuard');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('HRD-03 event-level cost proof: at most one Effective State resolution per event', () => {
  test('a single-file edit resolves Effective State exactly once', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-cost-single-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      writeFileSync(join(cwd, 'docs/spec.md'), '# Spec\n');

      let resolutions = 0;
      const collector = createStateInputCollector({
        event: 'PreToolUse',
        repoRoot: cwd,
        resolveSessionEffectiveState: () => null,
        resolvePreEditEffectiveState: (targetPaths: readonly string[]): EffectiveState | null => {
          resolutions += 1;
          try {
            return resolveEffectiveState(cwd, Date.now(), { targetPaths, operationKind: 'edit', explicitOverride: 'lite' });
          } catch {
            return null;
          }
        },
      });
      const result = runMutationGuard({ collector, input: JSON.stringify({ tool_input: { file_path: 'src/feature.ts' } }) });
      expect(result.exitCode).toBe(0);
      expect(resolutions).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('an apply_patch batch touching many files still resolves Effective State exactly once (collapses the old N-recursion N-resolution cost)', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-cost-batch-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);

      let resolutions = 0;
      const collector = createStateInputCollector({
        event: 'PreToolUse',
        repoRoot: cwd,
        resolveSessionEffectiveState: () => null,
        resolvePreEditEffectiveState: (targetPaths: readonly string[]): EffectiveState | null => {
          resolutions += 1;
          try {
            return resolveEffectiveState(cwd, Date.now(), { targetPaths, operationKind: 'edit', explicitOverride: 'lite' });
          } catch {
            return null;
          }
        },
      });
      const patch = [
        '*** Begin Patch',
        '*** Add File: src/alpha.ts',
        '+export const alpha = true;',
        '*** Add File: src/beta.ts',
        '+export const beta = true;',
        '*** Add File: src/gamma.ts',
        '+export const gamma = true;',
        '*** End Patch',
      ].join('\n');
      const result = runMutationGuard({
        collector,
        input: JSON.stringify({ tool_name: 'apply_patch', tool_input: { command: patch } }),
      });
      expect(result.exitCode).toBe(0);
      expect(resolutions).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('HRD-03 guard-by-guard parity: previously-uncovered decision branches', () => {
  test('ContractScopeGuard: an edit outside the active contract allowed_paths blocks', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-scope-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      writeFileSync(join(cwd, 'docs/spec.md'), '# Spec\n');
      // Contract named by the plan's own stem (not an explicit "Task
      // Contract" header): resolveEffectiveState's own internal contract
      // derivation only does stem/slug matching (no explicit-header
      // override), so an explicit header naming a differently-stemmed
      // contract file would make resolveEffectiveState itself see "no
      // contract" and block with a WorkflowProfileGuard blocker before this
      // guard's own scope check is ever reached -- stem-matching keeps the
      // two contract-path derivations agreeing.
      const plan = writeActivePlan(cwd, 'Executing');
      mkdirSync(join(cwd, 'tasks/contracts'), { recursive: true });
      writeFileSync(
        join(cwd, 'tasks/contracts/20260720-0000-mutation-guard-fixture.contract.md'),
        ['# Contract', '', '> **Status**: Active', `> **Plan**: ${plan}`, '', '## Allowed Paths', '', '```yaml', 'allowed_paths:', '  - src/auth/', '```', ''].join('\n'),
      );

      const result = edit(cwd, 'src/other/outside.ts', { profile: 'standard' });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('[ContractScopeGuard]');
      expect(result.stdout).toContain('"guard":"ContractScopeGuard"');
      expect(result.stdout).toContain('"failure_class":"contract_failure"');

      const allowed = edit(cwd, 'src/auth/session.ts', { profile: 'standard' });
      expect(allowed.stdout).not.toContain('ContractScopeGuard');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('strict profile without a contract blocks with StrictContractGuard, not StrictWorktreeGuard', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-strict-contract-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      writeFileSync(join(cwd, 'docs/spec.md'), '# Spec\n');
      writeActivePlan(cwd, 'Blocked');

      const result = edit(cwd, 'src/feature.ts', { profile: 'strict' });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('[StrictContractGuard]');
      expect(result.stdout).toContain('Strict workflow edit to src/feature.ts has no active contract.');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('gate mode off: no SpecGuard, no PlanStatusGuard, edit passes silently through the plan gate', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-gate-off-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const result = edit(cwd, 'src/feature.ts', { profile: 'standard', env: { REPO_HARNESS_EDIT_PLAN_GATE: 'off' } });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('SpecGuard');
      expect(result.stdout).not.toContain('PlanStatusGuard');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('apply_patch: paths are processed in patch order, stopping at the first blocking path', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-apply-patch-order-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const patch = [
        '*** Begin Patch',
        '*** Add File: src/plain.ts',
        '+export const plain = true;',
        '*** Add File: _ref/upstream/note.md',
        '+external',
        '*** Add File: src/never-reached.ts',
        '+export const neverReached = true;',
        '*** End Patch',
      ].join('\n');
      const result = invoke(cwd, { tool_name: 'apply_patch', tool_input: { command: patch } }, { profile: 'lite' });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('[ExternalReferenceGuard]');
      expect(result.stdout).toContain('_ref/upstream/note.md');
      // The third path's own guard messages never fire once the second path blocks.
      expect(result.stdout).not.toContain('never-reached');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('apply_patch with an unparseable command blocks with ApplyPatchScopeGuard', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-apply-patch-unparseable-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const result = invoke(cwd, { tool_name: 'apply_patch', tool_input: { command: 'not a real patch body' } });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('"guard":"ApplyPatchScopeGuard"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('gate round-1 parity closure: restored input-normalization fallbacks', () => {
  test('CLAUDE_FILE_PATH env fallback: no JSON file_path field resolves, env var supplies the target path', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-claude-file-path-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      // No `.file_path` / `.tool_input.file_path` / `.trigger_file_path` /
      // `.parent_file_path` anywhere in the payload -- if CLAUDE_FILE_PATH
      // were not consulted, `filePath` would resolve empty and the handler
      // would return exit 0 before any guard ever runs (see the early
      // `if (!filePath) return finish(ctx, 0);` in runMutationGuard).
      const result = invoke(cwd, { tool_input: {} }, {
        profile: 'lite',
        env: { CLAUDE_FILE_PATH: '_ref/upstream/note.md' },
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('[ExternalReferenceGuard]');
      expect(result.stdout).toContain('_ref/upstream/note.md');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('symlink-canonicalization: an absolute file_path reached through a symlinked repo ancestor still normalizes to repo-relative', () => {
    // Mirrors the macOS /var -> /private/var shape the bash port's comment
    // describes: repoRoot is the symlink spelling, but the host reports the
    // file_path already resolved through the real (physical) directory, so
    // the plain prefix strip cannot match and only the realpath-resolution
    // fallback tiers in normalizeFilePath() can recover a repo-relative path.
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-symlink-')));
    const real = join(root, 'real');
    const alias = join(root, 'alias');
    mkdirSync(real, { recursive: true });
    symlinkSync(real, alias);
    try {
      initRepo(alias);
      writePolicy(alias);
      const throughReal = join(real, '_ref/upstream/note.md');
      const result = invoke(alias, { tool_input: { file_path: throughReal } }, { profile: 'lite' });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('[ExternalReferenceGuard]');
      expect(result.stdout).toContain('_ref/upstream/note.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
