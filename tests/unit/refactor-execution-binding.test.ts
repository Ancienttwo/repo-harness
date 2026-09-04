import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildRefactorCandidateVerificationReceipt } from '../../src/core/refactor/candidate-verification';
import { buildRefactorExecutionBinding, validateRefactorExecutionBinding } from '../../src/core/refactor/execution-binding';
import { buildRefactorProgram } from '../../src/core/refactor/program';
import { appendRefactorExecutionBinding, readRefactorExecutionBindings } from '../../src/effects/refactor/execution-binding-store';

const roots: string[] = []; const D = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`; const TASK = 'f'.repeat(64); const REVISION = 'a'.repeat(64);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'refactor-binding-')); roots.push(root); execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root }); execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root }); execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  mkdirSync(join(root, 'plans'), { recursive: true }); mkdirSync(join(root, 'tasks', 'contracts'), { recursive: true }); writeFileSync(join(root, 'plans', 'plan.md'), '# Plan\n'); writeFileSync(join(root, 'tasks', 'contracts', 'task.md'), '# Contract\n'); execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-qm', 'candidate'], { cwd: root }); const candidateHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); execFileSync('git', ['commit', '--allow-empty', '-qm', 'merge'], { cwd: root }); const merge = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const program = buildRefactorProgram({ programId: 'rf-binding', baseMainSha: candidateHead, providerStage: 'scan', statisticsSnapshotDigest: D('stats'), assessmentDigest: D('assessment'), proposalDigest: D('proposal'), proposalAuthor: { kind: 'developer', source: 'manual' }, scale: 'module', routeReasonCodes: ['single-node-scope'], majorChangeReasons: [], route: 'module_refactor', affectedNodeIds: ['runtime.refactor'], bindings: [{ recommendationId: 'recommendation.binding', recommendationDigest: D('recommendation'), candidateAlias: 'C01', workPackageId: 'rf-binding', taskRef: `plans/sprints/rf.sprint.md#${TASK}`, executionBoundary: 'module' }] });
  const candidate = buildRefactorCandidateVerificationReceipt({ recommendationId: 'recommendation.binding', recommendationDigest: D('recommendation'), candidateHeadSha: candidateHead, candidateWorktreeDigest: D('worktree'), taskId: TASK, taskRevision: REVISION, contractPath: 'tasks/contracts/task.md', contractSha256: D('# Contract\n'), contractVerificationSha256: D('verify'), cutoverClosureLocator: '.ai/harness/checks/closure.json', cutoverClosureSha256: D('closure'), candidateVerify: 'passed', candidateVerifyResultSha256: D('provider'), acceptanceReceiptSha256: D('acceptance') });
  const binding = buildRefactorExecutionBinding({ recommendationId: 'recommendation.binding', recommendationDigest: D('recommendation'), taskId: TASK, taskRevision: REVISION, planPath: 'plans/plan.md', planSha256: D('# Plan\n'), contractPath: 'tasks/contracts/task.md', contractSha256: D('# Contract\n'), cutoverClosureSha256: D('closure'), acceptanceReceiptSha256: D('acceptance'), pullRequestNumber: 42, pullRequestHeadSha: candidateHead, mergeCommitSha: merge }); return { root, candidateHead, merge, program, candidate, binding };
}

afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('Module 8 immutable execution binding', () => {
  test('uses the exact PRD field set with no lifecycle state', () => {
    const f = fixture(); expect(Object.keys(f.binding).sort()).toEqual(['acceptanceReceiptSha256', 'bindingSha256', 'contractPath', 'contractSha256', 'cutoverClosureSha256', 'mergeCommitSha', 'planPath', 'planSha256', 'pullRequestHeadSha', 'pullRequestNumber', 'recommendationDigest', 'recommendationId', 'taskId', 'taskRevision'].sort());
    expect(() => validateRefactorExecutionBinding({ ...f.binding, status: 'resolved' })).toThrow('fields are invalid');
  });

  test('appends only a candidate-bound execution whose PR head is in the merge', () => {
    const f = fixture(); expect(appendRefactorExecutionBinding({ repo_root: f.root, program: f.program, candidate_verification: f.candidate, binding: f.binding })).toEqual(f.binding); expect(readRefactorExecutionBindings(f.root, f.program.programId)).toEqual([f.binding]);
    expect(appendRefactorExecutionBinding({ repo_root: f.root, program: f.program, candidate_verification: f.candidate, binding: f.binding })).toEqual(f.binding);
    const tree = execFileSync('git', ['rev-parse', `${f.candidateHead}^{tree}`], { cwd: f.root, encoding: 'utf8' }).trim(); const unrelated = execFileSync('git', ['commit-tree', tree, '-m', 'unrelated'], { cwd: f.root, encoding: 'utf8' }).trim();
    const stale = buildRefactorExecutionBinding({ ...f.binding, mergeCommitSha: unrelated });
    expect(() => appendRefactorExecutionBinding({ repo_root: f.root, program: f.program, candidate_verification: f.candidate, binding: stale })).toThrow('not an ancestor');
  });
});
