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

const HOOK_ENTRY = join(import.meta.dir, '../src/cli/hook-entry.ts');

/** The installed host path: `repo-harness-hook PreToolUse --route edit` in a child process with an isolated HOME. */
function hostEdit(cwd: string, home: string, toolInput: Record<string, string>) {
  const result = spawnSync(process.execPath, [HOOK_ENTRY, 'PreToolUse', '--route', 'edit'], {
    cwd,
    encoding: 'utf-8',
    input: JSON.stringify({ tool_name: 'Edit', tool_input: toolInput }),
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: home, HOOK_HOST: 'claude', HOOK_REPO_ROOT: cwd },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('mutation boundaries after workflow cutover', () => {
  test('primary edit ignores old markers, missing plans and high-risk ceremony', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-cutover-')));
    try {
      initRepo(cwd); writePolicy(cwd);
      mkdirSync(join(cwd, '.claude'), { recursive: true });
      writeFileSync(join(cwd, '.claude/.require-worktree'), '');
      const result = edit(cwd, 'src/security/feature.ts', { profile: 'high', env: {
        HOOK_HOST: 'claude', REPO_HARNESS_MAIN_LOOP_EDIT_GUARD: '1', REPO_HARNESS_EDIT_PLAN_GATE: 'enforce',
      } });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('action":"block');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  test('path traversal, symlink escapes and private/reference state remain refused', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-cutover-path-')));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-cutover-outside-')));
    try {
      initRepo(cwd); writePolicy(cwd);
      symlinkSync(outside, join(cwd, 'escape'));
      for (const path of ['../outside.ts', 'escape/secret.ts', '_ops/secret.env', '_ref/upstream.ts']) {
        expect(edit(cwd, path).exitCode).toBe(2);
      }
      expect(existsSync(join(outside, 'secret.ts'))).toBe(false);
    } finally { rmSync(cwd, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });
  test('host edit route refuses absolute aliases of private/reference targets and allows verified external paths', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-alias-')));
    const cwd = join(root, 'repo');
    const outside = join(root, 'outside');
    const home = join(root, 'home');
    try {
      for (const dir of [cwd, outside, home]) mkdirSync(dir, { recursive: true });
      initRepo(cwd);
      for (const dir of ['src', '_ops', '_ref']) mkdirSync(join(cwd, dir), { recursive: true });
      symlinkSync(join(cwd, '_ops'), join(cwd, 'src/opslink'));
      // Literal strings: path.join would collapse the `..` and `//` forms before the hook sees them.
      const refused = [
        `${cwd}/src/../_ops/secret.env`,
        `${cwd}/src/../_ref/upstream.txt`,
        `${cwd}//_ops/secret.env`,
        `${cwd}/./_ops/secret.env`,
        `${cwd}/src/opslink/secret.env`,
        `${outside}/../repo/_ops/secret.env`,
      ];
      // macOS volumes are usually case-insensitive; there `_OPS` is the same directory as `_ops`.
      if (existsSync(join(cwd, '_OPS'))) refused.push(`${cwd}/_OPS/secret.env`, `${cwd.toUpperCase()}/_ops/secret.env`);
      for (const filePath of refused) {
        const result = hostEdit(cwd, home, { file_path: filePath });
        expect({ filePath, status: result.status }).toEqual({ filePath, status: 2 });
        expect(result.stdout).toMatch(/\[(RepoScopeGuard|OpsPrivateGuard|ExternalReferenceGuard)\]/);
      }
      const patched = hostEdit(cwd, home, { command: `*** Begin Patch\n*** Add File: ${cwd}/src/../_ops/secret.env\n+secret\n*** End Patch` });
      expect(patched.status).toBe(2);
      expect(patched.stdout).toContain('[RepoScopeGuard]');

      const external = hostEdit(cwd, home, { file_path: `${outside}/notes.md` });
      expect(external.status).toBe(0);
      expect(external.stdout).not.toContain('action":"block');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);
  test('state resolution failure and contract-scope deviation are recorded without blocking', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-cutover-state-')));
    try {
      initRepo(cwd);
      const collector = buildCollector(cwd);
      const result = runMutationGuard({ collector: { ...collector, getPreEditEffectiveState() { throw new Error('unstable'); } },
        input: JSON.stringify({ tool_input: { file_path: 'src/feature.ts' } }), env: {} });
      expect(result.exitCode).toBe(0); expect(result.stdout).toContain('State unavailable');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  test('unparseable patch fails closed and a private target stops the batch', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-cutover-patch-')));
    try {
      initRepo(cwd);
      expect(invoke(cwd, { tool_input: { command: 'unparseable' } }).exitCode).toBe(2);
      const result = invoke(cwd, { tool_input: { command: '*** Begin Patch\n*** Add File: _ops/secret.env\n+secret\n*** Add File: src/okay.ts\n+okay\n*** End Patch' } });
      expect(result.exitCode).toBe(2); expect(result.stdout).toContain('OpsPrivateGuard');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  for (const phase of ['reviewing', 'completing'] as const) {
    test(`lease ${phase} is an observation; shared publication fencing remains in its writer`, () => {
      const fixture = installPublicationGuardFixture(phase);
      try {
        const result = edit(fixture.worktree, 'src/feature.ts', { profile: 'routine' });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('LeaseOwnershipGuard');
        expect(result.stdout).toContain('advisory');
      } finally { fixture.cleanup(); }
    });
  }
});
