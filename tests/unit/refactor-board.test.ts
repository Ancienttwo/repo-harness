import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { refactorResolutionEvidenceDigest, type RecommendationV3, type RefactorResolutionEvidenceV1 } from 'archctx-contracts';

import { projectRefactorBoard, renderRefactorBoardMarkdown } from '../../src/core/refactor/board';
import { buildRefactorExecutionBinding } from '../../src/core/refactor/execution-binding';
import { buildRefactorProgram } from '../../src/core/refactor/program';

const D = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`; const COMMIT = '1'.repeat(40); const TASK = 'a'.repeat(64);
const program = buildRefactorProgram({ programId: 'rf-board', baseMainSha: COMMIT, providerStage: 'scan', statisticsSnapshotDigest: D('stats'), assessmentDigest: D('assessment'), proposalDigest: D('proposal'), proposalAuthor: { kind: 'developer', source: 'manual' }, scale: 'module', routeReasonCodes: ['single-node-scope'], majorChangeReasons: [], route: 'module_refactor', affectedNodeIds: ['runtime.refactor'], bindings: [{ recommendationId: 'recommendation.board', recommendationDigest: D('recommendation'), candidateAlias: 'C01', workPackageId: 'rf-board', taskRef: `plans/sprints/rf.sprint.md#${TASK}`, executionBoundary: 'module' }] });
const binding = buildRefactorExecutionBinding({ recommendationId: 'recommendation.board', recommendationDigest: D('recommendation'), taskId: TASK, taskRevision: 'b'.repeat(64), planPath: 'plans/plan.md', planSha256: D('plan'), contractPath: 'tasks/contracts/task.md', contractSha256: D('contract'), cutoverClosureSha256: D('closure'), acceptanceReceiptSha256: D('acceptance'), pullRequestNumber: 7, pullRequestHeadSha: '2'.repeat(40), mergeCommitSha: COMMIT });
test('pending boards at different measured heads have different identities', () => {
  const input = { program, recommendations: [recommendation('accepted')], bindings: [binding], resolutions: [] };
  const first = projectRefactorBoard({ ...input, measuredHeadSha: COMMIT });
  const second = projectRefactorBoard({ ...input, measuredHeadSha: '4'.repeat(40) });
  expect(second.boardDigest).not.toBe(first.boardDigest);
});
function recommendation(status: RecommendationV3['status']): RecommendationV3 { return { schemaVersion: 'archcontext.recommendation/v3', recommendationId: 'recommendation.board', runId: 'run.board', fingerprint: D('recommendation'), subject: 'runtime.refactor', status, confidence: 'high', enforcement: 'advisory', risk: 'low', uncertainty: 'low', evidenceBindingIds: [], explanation: [], authoredBy: { kind: 'daemon', id: 'archctxd', source: 'daemon' }, subjectSelectorId: 'runtime.refactor', relations: {}, createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z', category: 'structural_observation', payload: { assessmentDigest: D('assessment'), kind: 'cycle', affectedNodeIds: ['runtime.refactor'], baselineSnapshotDigest: D('stats'), derivedOutcomes: [] } }; }
function resolution(disposition: RefactorResolutionEvidenceV1['disposition']): RefactorResolutionEvidenceV1 { const basis = { schemaVersion: 'archcontext.refactor-resolution-evidence/v1' as const, recommendationId: 'recommendation.board', recommendationDigest: D('provider-resolution-identity'), beforeSnapshotDigest: D('before'), afterSnapshotDigest: D('after'), verifiedHeadSha: COMMIT, verifiedWorktreeDigest: D('worktree'), expectedOutcomes: [{ outcomeId: 'no-cycle', metric: 'repositorySummary.crossModuleCycleCount', subjectSelectorId: 'runtime.refactor', nodeId: null, operator: 'equals' as const, value: 0, required: true }], observedOutcomes: [{ outcomeId: 'no-cycle', observedValue: disposition === 'resolved' ? 0 : 1, satisfied: disposition === 'resolved', direction: disposition === 'resolved' ? 'improved' as const : 'unchanged' as const }], residuals: [], executionEvidenceRefs: [], disposition, verifiedAt: '2026-09-04T00:00:00.000Z' }; return { ...basis, resolutionDigest: refactorResolutionEvidenceDigest({ ...basis, resolutionDigest: D('placeholder') }) }; }

describe('Module 9 Refactor Board pure projection', () => {
  test('uses repo-harness only for merge pending and ArchContext only for resolution', () => {
    const pending = projectRefactorBoard({ program, measuredHeadSha: COMMIT, recommendations: [recommendation('accepted')], bindings: [binding], resolutions: [] }); expect(pending.cards[0]?.architectureResult).toBe('merged_pending_measurement'); expect(pending.cards[0]?.sources.architectureResult).toBe('repo-harness');
    const resolved = projectRefactorBoard({ program, measuredHeadSha: COMMIT, recommendations: [recommendation('resolved')], bindings: [binding], resolutions: [resolution('resolved')] }); expect(resolved.cards[0]?.architectureResult).toBe('resolved'); expect(resolved.cards[0]?.sources.architectureResult).toBe('archctx'); expect(renderRefactorBoardMarkdown(resolved)).toContain('resolved (resolved)');
  });
  test('keeps non-improvement open and rejects a resolution measured away from the board head', () => {
    expect(projectRefactorBoard({ program, measuredHeadSha: COMMIT, recommendations: [recommendation('accepted')], bindings: [binding], resolutions: [resolution('not_improved')] }).cards[0]?.architectureResult).toBe('follow_up_required');
    expect(() => projectRefactorBoard({ program, measuredHeadSha: COMMIT, recommendations: [recommendation('resolved')], bindings: [binding], resolutions: [{ ...resolution('resolved'), verifiedHeadSha: '3'.repeat(40) }] })).toThrow();
  });
});

test('a resolved measurement cannot substitute for provider lifecycle readback', () => {
  expect(projectRefactorBoard({ program, measuredHeadSha: COMMIT, recommendations: [recommendation('accepted')], bindings: [binding], resolutions: [resolution('resolved')] }).cards[0]?.architectureResult).toBe('merged_pending_measurement');
});
