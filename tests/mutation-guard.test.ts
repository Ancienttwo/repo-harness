import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { runMutationGuard, type MutationGuardCollector } from '../src/cli/hook/mutation-guard';
import { createStateInputCollector } from '../src/effects/loop/state-input-collector';
import { resolveEffectiveState } from '../src/effects/state/resolve-effective-state';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';
import type { EffectiveState } from '../src/core/state/types';
import type { WorkflowProfile } from '../src/core/workflow/profile';
import {
  beginLeaseCompletionRecord,
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  deriveTaskRevision,
  enterReviewingLeaseRecord,
  type LeaseOwnerRecord,
} from '../src/core/state/coordination-identity';
import { resolveRepoIdentity } from '../src/effects/state/coordination-canonical-source';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../src/effects/state/coordination-lease-store';
import { fixtureTaskId } from './helpers/sprint-fixture';

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
          lifecycle: { annotation_end: 'Annotating', approved: 'Approved', executing: 'Executing', terminal_start: 'Complete' },
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

const PUBLICATION_GUARD_SPRINT = 'plans/sprints/publication-guard.sprint.md';
const PUBLICATION_GUARD_TASK = 'publication remediation';
const PUBLICATION_GUARD_CLAIM = 'claim-publication-guard';

interface PublicationGuardFixture {
  readonly root: string;
  readonly worktree: string;
  readonly taskId: string;
  readonly record: LeaseOwnerRecord;
  cleanup(): void;
}

/** A real linked worktree plus the shared owner record that arms the hook. */
function installPublicationGuardFixture(state: 'completing' | 'reviewing'): PublicationGuardFixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-publication-')));
  const primary = join(root, 'primary');
  const worktree = join(root, 'review');
  mkdirSync(primary, { recursive: true });
  initRepo(primary);
  writePolicy(primary);
  mkdirSync(join(primary, 'plans/sprints'), { recursive: true });
  mkdirSync(join(primary, 'docs'), { recursive: true });
  writeFileSync(join(primary, PUBLICATION_GUARD_SPRINT), [
    '# Publication guard sprint', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '| --- |----| --- | --- | --- | --- | --- |',
    `| 1 | ${fixtureTaskId(`${PUBLICATION_GUARD_TASK}`)} | [ ] | ${PUBLICATION_GUARD_TASK} | contract | remediation tests pass | (pending) |`, '',
  ].join('\n'));
  writeFileSync(join(primary, 'docs/spec.md'), '# spec\n');
  mkdirSync(join(primary, '.ai/harness/sprint'), { recursive: true });
  writeFileSync(join(primary, '.ai/harness/sprint/active-sprint'), `${PUBLICATION_GUARD_SPRINT}\n`);
  git(primary, ['add', '.']);
  git(primary, ['commit', '-m', 'publication guard state']);
  git(primary, ['worktree', 'add', '-b', 'codex/publication-guard', worktree]);

  const activePlan = writeActivePlan(worktree, 'Executing');
  const repoIdentity = resolveRepoIdentity(worktree);
  const taskId = fixtureTaskId(PUBLICATION_GUARD_TASK);
  const taskRevision = deriveTaskRevision({ taskCell: PUBLICATION_GUARD_TASK, taskId, modeCell: 'contract', acceptanceCell: 'remediation tests pass' });
  const claimed = buildLeaseOwnerRecord({
    claimId: PUBLICATION_GUARD_CLAIM,
    taskId,
    taskRevision,
    sprintPath: PUBLICATION_GUARD_SPRINT,
    targetRef: 'main',
    generation: 1,
    sessionId: 'publication-guard-session',
    sourceWorktree: primary,
  });
  const bound = bindLeaseRecord(claimed, {
    claimId: PUBLICATION_GUARD_CLAIM,
    executionWorktree: worktree,
    branch: 'codex/publication-guard',
    unitRef: activePlan,
  });
  if (!bound.ok) throw new Error(bound.error);
  const completing = beginLeaseCompletionRecord(bound.record, {
    claimId: PUBLICATION_GUARD_CLAIM,
    executionWorktree: worktree,
    finishTransactionKey: 'finish-publication-guard',
  });
  if (!completing.ok) throw new Error(completing.error);
  const transition = state === 'completing' ? completing : enterReviewingLeaseRecord(completing.record, {
    claimId: PUBLICATION_GUARD_CLAIM,
    publication: {
      publication_id: `sha256:${'a'.repeat(64)}`,
      receipt_sha256: `sha256:${'b'.repeat(64)}`,
      head_sha: 'c'.repeat(40),
      ship_transaction_key: 'ship-publication-guard',
    },
  });
  if (!transition.ok) throw new Error(transition.error);
  if (!createLeaseDirectory(worktree, taskId)) throw new Error('lease election failed');
  writeLeaseOwnerDurably(worktree, taskId, transition.record);
  mkdirSync(join(worktree, '.ai/harness/sprint/claims'), { recursive: true });
  writeFileSync(join(worktree, `.ai/harness/sprint/claims/${taskId}.claim`), [
    `claim_id=${PUBLICATION_GUARD_CLAIM}`,
    `task_id=${taskId}`,
    `sprint=${PUBLICATION_GUARD_SPRINT}`,
    `task=${PUBLICATION_GUARD_TASK}`,
    `unit_ref=${activePlan}`,
    '',
  ].join('\n'));
  return { root, worktree, taskId, record: transition.record, cleanup: () => rmSync(root, { recursive: true, force: true }) };
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
  test('a lite snapshot yields to current standard edit guidance without weakening the plan gate', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-profile-transition-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      writeFileSync(join(cwd, 'docs/spec.md'), '# spec\n');
      const before = resolveEffectiveState(cwd, Date.now());
      expect(before.workflow_profile).toBe('lite');
      expect(edit(cwd, 'src/one.ts').exitCode).toBe(0);

      const result = invoke(cwd, { tool_name: 'apply_patch', tool_input: { command: [
        '*** Begin Patch',
        ...['one', 'two', 'three', 'four', 'five'].flatMap((name) => [
          `*** Add File: src/${name}.ts`, '+export {};',
        ]),
        '*** End Patch',
      ].join('\n') } });
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('PlanStatusGuard');
      expect(result.stderr).toContain('current workflow profile: standard');
      expect(result.stderr).toContain('Earlier session guidance is a snapshot');
      expect(result.stderr).not.toContain('advice/off');
      expect(result.stderr).not.toContain('--execute');
      expect(before.guidance).not.toContain('do not author plan');

      const raised = edit(cwd, 'src/one.ts', { profile: 'standard' });
      expect(raised.exitCode).toBe(2);
      expect(raised.stderr).toContain('current workflow profile: standard');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);
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
  }, 30_000);

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
  }, 30_000);
});

describe('HRD-03 guard-by-guard parity: previously-uncovered decision branches', () => {
  test('checks_failed permits only contract-authorized repo repair paths', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-checks-repair-')));
    const escapedRoot = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-escaped-target-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const plan = writeActivePlan(cwd, 'Executing');
      const contract = 'tasks/contracts/20260720-0000-mutation-guard-fixture.contract.md';
      const review = 'tasks/reviews/20260720-0000-mutation-guard-fixture.review.md';
      mkdirSync(join(cwd, 'tasks/contracts'), { recursive: true });
      mkdirSync(join(cwd, 'tasks/reviews'), { recursive: true });
      writeFileSync(
        join(cwd, contract),
        ['# Contract', '', '> **Status**: Active', `> **Plan**: ${plan}`, '', '## Allowed Paths', '', '```yaml', 'allowed_paths:', `  - ${review}`, '```', ''].join('\n'),
      );
      git(cwd, ['add', '.']);
      git(cwd, ['commit', '-m', 'active repair contract']);

      const subject = buildReviewSubject(cwd, { targetRef: 'main' });
      expect(subject.status).toBe('ok');
      mkdirSync(join(cwd, '.ai/harness/checks'), { recursive: true });
      writeFileSync(join(cwd, '.ai/harness/checks/latest.json'), `${JSON.stringify({
        schema: 'repo-harness-run-trace.v1',
        source: 'verify-sprint',
        status: 'fail',
        active_plan: plan,
        review_subject_sha256: subject.review_subject_sha256,
      }, null, 2)}\n`);

      const failedState = resolveEffectiveState(cwd, Date.now(), {
        targetPaths: [review],
        operationKind: 'edit',
        explicitOverride: 'standard',
      });
      expect(failedState.blockers).toEqual(['checks_failed']);
      expect(failedState.allowed_paths).toEqual([review]);
      expect(failedState.readiness?.ok).toBe(true);
      if (failedState.readiness?.ok) {
        expect(failedState.readiness.allowedToEdit).toEqual({ decision: 'allow' });
        expect(failedState.readiness.allowedToStop.decision).toBe('block');
        expect(failedState.readiness.readyToShip.decision).toBe('block');
      }

      const allowed = edit(cwd, review, { profile: 'standard' });
      expect(allowed.exitCode, `${allowed.stdout}\n${allowed.stderr}`).toBe(0);
      expect(allowed.stdout).not.toContain('[WorkflowProfileGuard]');

      const outsideContract = edit(cwd, 'tasks/reviews/other.review.md', { profile: 'standard' });
      expect(outsideContract.exitCode).toBe(2);

      const outsideRepo = edit(cwd, join(tmpdir(), 'outside-repair.review.md'), { profile: 'standard' });
      expect(outsideRepo.exitCode).toBe(2);

      const traversal = edit(cwd, 'tasks/reviews/../../../outside.review.md', { profile: 'standard' });
      expect(traversal.exitCode).toBe(2);
      expect(traversal.stdout).toContain('[RepoScopeGuard]');

      symlinkSync(escapedRoot, join(cwd, 'tasks/reviews/escape'));
      const symlinkEscape = edit(cwd, 'tasks/reviews/escape/outside.review.md', { profile: 'standard' });
      expect(symlinkEscape.exitCode).toBe(2);
      expect(symlinkEscape.stdout).toContain('[RepoScopeGuard]');

      const traversalPatch = [
        '*** Begin Patch',
        `*** Update File: ${review}`,
        '@@',
        '-old',
        '+new',
        '*** Add File: tasks/reviews/../../../outside.patch.md',
        '+escape',
        '*** End Patch',
      ].join('\n');
      const patchedTraversal = invoke(
        cwd,
        { tool_input: { command: traversalPatch } },
        { profile: 'standard' },
      );
      expect(patchedTraversal.exitCode).toBe(2);

      const symlinkPatch = [
        '*** Begin Patch',
        `*** Update File: ${review}`,
        '@@',
        '-old',
        '+new',
        '*** Add File: tasks/reviews/escape/outside.patch.md',
        '+escape',
        '*** End Patch',
      ].join('\n');
      const patchedSymlink = invoke(
        cwd,
        { tool_input: { command: symlinkPatch } },
        { profile: 'standard' },
      );
      expect(patchedSymlink.exitCode).toBe(2);

      const contractText = readFileSync(join(cwd, contract), 'utf-8');
      writeFileSync(join(cwd, contract), contractText.replace(`> **Plan**: ${plan}`, '> **Plan**: plans/plan-conflict.md'));
      const withAuthorityConflict = edit(cwd, review, { profile: 'standard' });
      expect(withAuthorityConflict.exitCode).toBe(2);
      expect(withAuthorityConflict.stdout).toContain('[WorkflowProfileGuard]');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(escapedRoot, { recursive: true, force: true });
    }
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);

  test.each([
    { name: 'primary with matching owner', linked: false, owner: 'current', allowed: false },
    { name: 'linked with matching owner', linked: true, owner: 'current', allowed: true },
    { name: 'linked without owner', linked: true, owner: 'missing', allowed: false },
    { name: 'linked with foreign owner', linked: true, owner: 'foreign', allowed: false },
  ])('strict isolated worktree agreement: $name', ({ linked, owner, allowed }) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-isolation-')));
    const primary = join(root, 'primary');
    const cwd = linked ? join(root, 'linked') : primary;
    try {
      mkdirSync(primary);
      initRepo(primary);
      if (linked) git(primary, ['worktree', 'add', '-b', 'codex/isolation-fixture', cwd]);
      writePolicy(cwd);
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      writeFileSync(join(cwd, 'docs/spec.md'), '# Spec\n');
      const plan = writeActivePlan(cwd, 'Executing');
      const contract = 'tasks/contracts/20260720-0000-mutation-guard-fixture.contract.md';
      mkdirSync(join(cwd, 'tasks/contracts'), { recursive: true });
      writeFileSync(join(cwd, contract), [
        '# Contract', '> **Status**: Active', `> **Plan**: ${plan}`,
        '> **Workflow Profile**: strict', '', '## Allowed Paths', '',
        '```yaml', 'allowed_paths:', '  - src/', '```', '',
      ].join('\n'));
      if (owner === 'missing') rmSync(join(cwd, '.ai/harness/active-worktree'));
      if (owner === 'foreign') writeFileSync(join(cwd, '.ai/harness/active-worktree'), `${primary}\n`);

      const state = resolveEffectiveState(cwd, Date.now(), {
        targetPaths: ['src/feature.ts'], operationKind: 'edit', explicitOverride: 'strict',
      });
      const guard = edit(cwd, 'src/feature.ts', { profile: 'strict' });
      const readiness = state.readiness;
      expect(readiness?.ok).toBe(true);
      if (!readiness?.ok) throw new Error('readiness unavailable');
      expect(readiness.requirements.edit.find((entry) => entry.key === 'isolated_contract_worktree')?.satisfied).toBe(allowed);
      expect(readiness.allowedToEdit.decision).toBe(allowed ? 'allow' : 'block');
      expect(guard.exitCode).toBe(allowed ? 0 : 2);
      if ((owner === 'current' && !linked) || owner === 'missing') {
        expect(guard.stdout).toContain('[StrictWorktreeGuard]');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);
});

describe('MainLoopDispatchGuard: opt-in orchestrator/subagent edit split', () => {
  const armed = { REPO_HARNESS_MAIN_LOOP_EDIT_GUARD: '1', HOOK_HOST: 'claude' } as const;

  test('armed, no agent_id/agent_type, code path -> exit 2 with the dispatch instruction', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-main-loop-block-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const result = invoke(cwd, { tool_input: { file_path: 'src/feature.ts' } }, {
        profile: 'lite',
        env: { ...armed },
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('[MainLoopDispatchGuard]');
      expect(result.stdout).toContain('"guard":"MainLoopDispatchGuard"');
      expect(result.stdout).toContain('"failure_class":"state_violation"');
      expect(result.stderr).toContain('The orchestrator does not hand-edit code files.');
      expect(result.stderr).toContain('Operator off-switch: unset REPO_HARNESS_MAIN_LOOP_EDIT_GUARD.');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('armed, agent_id present -> subagent edit passes this guard', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-main-loop-subagent-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const result = invoke(cwd, { agent_id: 'agent_01abc', tool_input: { file_path: 'src/feature.ts' } }, {
        profile: 'lite',
        env: { ...armed },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('MainLoopDispatchGuard');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('env unset -> guard is inert, existing behavior unchanged', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-main-loop-unset-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const result = edit(cwd, 'src/feature.ts', { profile: 'lite' });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('MainLoopDispatchGuard');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('armed, markdown path -> not blocked (plans and docs stay a main-loop surface)', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-main-loop-md-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const result = invoke(cwd, { tool_input: { file_path: 'docs/notes.md' } }, {
        profile: 'lite',
        env: { ...armed },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('MainLoopDispatchGuard');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('armed but HOOK_HOST=codex -> guard is inert', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-main-loop-codex-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const result = invoke(cwd, { tool_input: { file_path: 'src/feature.ts' } }, {
        profile: 'lite',
        env: { REPO_HARNESS_MAIN_LOOP_EDIT_GUARD: '1', HOOK_HOST: 'codex' },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('MainLoopDispatchGuard');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('armed, apply_patch expanding to a code file, no agent_id -> blocked on that path', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-main-loop-apply-patch-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      const patch = [
        '*** Begin Patch',
        '*** Add File: docs/notes.md',
        '+notes',
        '*** Add File: src/alpha.ts',
        '+export const alpha = true;',
        '*** End Patch',
      ].join('\n');
      const result = invoke(cwd, { tool_name: 'apply_patch', tool_input: { command: patch } }, {
        profile: 'lite',
        env: { ...armed },
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('[MainLoopDispatchGuard] Main-loop source edit blocked: src/alpha.ts');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
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
  }, 30_000);

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
  }, 30_000);

  // WP3 falsification-matrix row: "non-sprint execution is unaffected by the
  // lease gate". Every other guard's fixture in this file is a repository with
  // no coordination state, so this asserts the invariant those fixtures all
  // silently depend on. The armed paths live in tests/board-slice.test.ts.
  test('LeaseOwnershipGuard: an ordinary plan without any sprint state is untouched', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-guard-no-lease-')));
    try {
      initRepo(cwd);
      writePolicy(cwd);
      writeActivePlan(cwd, 'Approved');
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      writeFileSync(join(cwd, 'docs/spec.md'), '# spec\n');
      const result = edit(cwd, 'src/feature.ts', { profile: 'lite' });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('LeaseOwnershipGuard');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('publication lifecycle remediation is routed outside sprint reconcile', () => {
  test('a reviewing lease names reconcile, reopen, takeover, and abandon with its fenced publication identity', () => {
    const fixture = installPublicationGuardFixture('reviewing');
    try {
      const result = edit(fixture.worktree, 'src/feature.ts', { profile: 'lite' });
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.exitCode).toBe(2);
      expect(output).toContain('[LeaseOwnershipGuard] lease_state_not_bound:');
      expect(output).toContain(`repo-harness publication reconcile --task-id ${fixture.taskId}`);
      expect(output).toContain('--expected-claim-id claim-publication-guard --expected-generation 1');
      expect(output).toContain(`--publication-id ${(fixture.record as Extract<LeaseOwnerRecord, { state: 'reviewing' }>).current_publication.publication_id}`);
      expect(output).toContain('publication reopen/takeover/abandon');
      expect(output).not.toContain('repo-harness sprint reconcile');
    } finally {
      fixture.cleanup();
    }
  }, 30_000);

  test('a completing lease directs the owner to publication recover inspect, not sprint reconcile', () => {
    const fixture = installPublicationGuardFixture('completing');
    try {
      const result = edit(fixture.worktree, 'src/feature.ts', { profile: 'lite' });
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.exitCode).toBe(2);
      expect(output).toContain('[LeaseOwnershipGuard] lease_state_not_bound:');
      expect(output).toContain('repo-harness publication recover inspect');
      expect(output).not.toContain('repo-harness sprint reconcile');
    } finally {
      fixture.cleanup();
    }
  }, 30_000);
});
