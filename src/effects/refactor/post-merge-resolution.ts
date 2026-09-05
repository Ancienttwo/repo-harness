import { execFileSync } from 'child_process';
import { lstatSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { refactorResolutionEvidenceInvariantIssues, type RecommendationV3, type RefactorResolutionEvidenceV1, type RefactorVerificationRequestV1 } from 'archctx-contracts';

import { canonicalize } from '../../core/evidence/canonical-json';
import { projectRefactorBoard, renderRefactorBoardMarkdown, type RefactorBoardV1 } from '../../core/refactor/board';
import { validateRefactorCandidateVerificationReceipt, type RefactorCandidateVerificationReceiptV1 } from '../../core/refactor/candidate-verification';
import { validateRefactorExecutionBinding, type RefactorExecutionBindingV1 } from '../../core/refactor/execution-binding';
import { validateRefactorProgram, type RefactorProgramV1 } from '../../core/refactor/program';
import { assertRefactorVerificationRequest, RefactorProviderError, type RefactorVerifyResultV1 } from '../../core/refactor/provider-contract';
import { readRefactorRecommendationRecords, recordRefactorResolution, runRefactorVerify } from './archctx-provider';
import { appendRefactorExecutionBinding, readRefactorExecutionBindings } from './execution-binding-store';
import { appendRefactorProgramEvent, assertRefactorProgramDigest, readRefactorProgramStatus } from './program-store';
import { persistRefactorResolution, readRefactorResolutions } from './resolution-store';

export class RefactorPostMergeResolutionError extends Error { constructor(readonly code: 'refactor_post_merge_stale' | 'refactor_post_merge_failed', message: string, readonly cause?: unknown) { super(message); this.name = 'RefactorPostMergeResolutionError'; } }
function fail(code: RefactorPostMergeResolutionError['code'], message: string, cause?: unknown): never { throw new RefactorPostMergeResolutionError(code, message, cause); }
function atomic(path: string, bytes: string): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 }); renameSync(temp, path); }
  finally { rmSync(temp, { force: true }); }
}
function assertMergedInto(root: string, bindings: readonly RefactorExecutionBindingV1[], head: string): void {
  for (const binding of bindings) {
    try { execFileSync('git', ['merge-base', '--is-ancestor', binding.mergeCommitSha, head], { cwd: root, stdio: 'ignore' }); }
    catch { fail('refactor_post_merge_stale', `merge commit is not an ancestor of final main: ${binding.recommendationId}`); }
  }
}
function assertSha256(value: string, label: string): void { if (!/^sha256:[a-f0-9]{64}$/u.test(value)) fail('refactor_post_merge_failed', `${label} must be an exact sha256 digest`); }

export interface RefactorPostMergeItemV1 {
  readonly candidateVerification: RefactorCandidateVerificationReceiptV1; readonly binding: RefactorExecutionBindingV1;
  readonly acceptanceReceiptLocator: string; readonly mergeReceiptLocator: string; readonly mergeReceiptSha256: string;
}
export interface RefactorPostMergeDependencies {
  readonly verify?: (request: RefactorVerificationRequestV1, root: string) => RefactorVerifyResultV1;
  readonly resolve?: (recommendationId: string, resolutionDigest: string, worktreeDigest: string, reason: string, root: string) => unknown;
  readonly recommendations?: (head: string, root: string) => readonly RecommendationV3[];
}

function writeBoard(root: string, board: RefactorBoardV1): { readonly jsonPath: string; readonly markdownPath: string } {
  const directory = join(root, 'tasks', 'workstreams', 'refactor'); const jsonPath = join(directory, `${board.programId}.board.v1.json`); const markdownPath = join(directory, `${board.programId}.md`);
  // A lexical repo-relative path is insufficient when any ancestor is a symlink.
  let parent = root;
  for (const segment of ['tasks', 'workstreams', 'refactor']) {
    parent = join(parent, segment);
    try { const stat = lstatSync(parent); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('refactor_post_merge_failed', `unsafe board directory: ${parent}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; mkdirSync(parent); }
  }
  for (const path of [jsonPath, markdownPath]) {
    try { if (!lstatSync(path).isFile()) fail('refactor_post_merge_failed', `unsafe board file: ${path}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  atomic(jsonPath, `${canonicalize(board as never)}\n`); atomic(markdownPath, renderRefactorBoardMarkdown(board)); return Object.freeze({ jsonPath, markdownPath });
}

export function rebuildRefactorBoard(input: { readonly repo_root: string; readonly program: RefactorProgramV1; readonly head_sha: string; readonly env?: NodeJS.ProcessEnv }, dependencies: Pick<RefactorPostMergeDependencies, 'recommendations'> = {}): { readonly board: RefactorBoardV1; readonly jsonPath: string; readonly markdownPath: string } {
  const root = realpathSync(input.repo_root); const program = validateRefactorProgram(input.program); const head = execFileSync('git', ['rev-parse', '--verify', `${input.head_sha}^{commit}`], { cwd: root, encoding: 'utf8' }).trim(); if (head !== input.head_sha) fail('refactor_post_merge_stale', 'board head is not an exact commit');
  assertRefactorProgramDigest(readRefactorProgramStatus(root, program.programId, input.env ?? process.env), program.programDigest);
  const recommendations = (dependencies.recommendations ?? ((value, repo) => readRefactorRecommendationRecords(value, repo, { env: input.env }).recommendations))(head, root);
  const bindings = readRefactorExecutionBindings(root, program.programId);
  assertMergedInto(root, bindings, head);
  const board = projectRefactorBoard({ program, measuredHeadSha: head, recommendations, bindings, resolutions: readRefactorResolutions(root, program.programId) });
  return Object.freeze({ board, ...writeBoard(root, board) });
}

export async function resolveRefactorPostMerge(input: {
  readonly repo_root: string; readonly program: RefactorProgramV1; readonly final_main_sha: string; readonly final_worktree_digest: string;
  readonly items: readonly RefactorPostMergeItemV1[]; readonly expected_current_sha256: string; readonly idempotency_key: string; readonly observed_at: string; readonly env?: NodeJS.ProcessEnv;
}, dependencies: RefactorPostMergeDependencies = {}): Promise<{ readonly board: RefactorBoardV1; readonly jsonPath: string; readonly markdownPath: string; readonly stage: 'resolved' | 'follow_up_required' | 'merged_pending_measurement' | 'reconciliation_required' }> {
  const root = realpathSync(input.repo_root); const program = validateRefactorProgram(input.program); let status = readRefactorProgramStatus(root, program.programId, input.env ?? process.env);
  assertRefactorProgramDigest(status, program.programDigest);
  const finalMain = execFileSync('git', ['rev-parse', '--verify', `${input.final_main_sha}^{commit}`], { cwd: root, encoding: 'utf8' }).trim(); if (finalMain !== input.final_main_sha || execFileSync('git', ['rev-parse', '--verify', `${status.program.target_ref}^{commit}`], { cwd: root, encoding: 'utf8' }).trim() !== finalMain) fail('refactor_post_merge_stale', 'final main is not the exact current target ref');
  if (input.items.length !== program.bindings.length) fail('refactor_post_merge_failed', 'post-merge evidence must cover every Program binding');
  assertSha256(input.final_worktree_digest, 'final_worktree_digest');
  const expectedKeys = new Set(program.bindings.map((entry) => `${entry.recommendationId}\0${entry.recommendationDigest}`)); const suppliedKeys = new Set<string>();
  for (const item of input.items) { const binding = validateRefactorExecutionBinding(item.binding); const key = `${binding.recommendationId}\0${binding.recommendationDigest}`; if (!expectedKeys.has(key) || suppliedKeys.has(key)) fail('refactor_post_merge_failed', 'post-merge evidence does not exactly cover Program bindings'); suppliedKeys.add(key); assertSha256(item.mergeReceiptSha256, 'mergeReceiptSha256'); }
  assertMergedInto(root, input.items.map((item) => item.binding), finalMain);
  for (const item of input.items) appendRefactorExecutionBinding({ repo_root: root, program, candidate_verification: validateRefactorCandidateVerificationReceipt(item.candidateVerification), binding: item.binding, env: input.env });
  if (status.current.state === 'verifying') { const next = appendRefactorProgramEvent({ repo_root: root, program_id: program.programId, expected_current_sha256: input.expected_current_sha256, idempotency_key: `${input.idempotency_key}:merge`, operation: 'begin_merge', evidence_refs: input.items.map((entry) => entry.binding.bindingSha256), observed_at: input.observed_at, owned_target_revision: finalMain, env: input.env }); status = { ...status, current: next.current, events: [...status.events, next.event] }; }
  if (status.current.state === 'merging') { const next = appendRefactorProgramEvent({ repo_root: root, program_id: program.programId, expected_current_sha256: status.current.current_sha256, idempotency_key: `${input.idempotency_key}:measure`, operation: 'begin_post_merge_measure', evidence_refs: [finalMain], observed_at: input.observed_at, owned_target_revision: finalMain, env: input.env }); status = { ...status, current: next.current, events: [...status.events, next.event] }; }
  if (!['post_merge_measuring', 'resolving', 'complete', 'reconciliation_required'].includes(status.current.state)) fail('refactor_post_merge_failed', `program is ${status.current.state}, not ready for post-merge measurement`);
  let providerUnavailable = false; let stale = false;
  const readRecommendations = () => (dependencies.recommendations ?? ((head, repo) => readRefactorRecommendationRecords(head, repo, { env: input.env }).recommendations))(finalMain, root);
  let recommendations = readRecommendations();
  const authorityFor = (binding: RefactorExecutionBindingV1) => {
    const matches = recommendations.filter((entry) => entry.recommendationId === binding.recommendationId);
    if (matches.length !== 1 || matches[0]!.fingerprint !== binding.recommendationDigest) fail('refactor_post_merge_failed', `missing exact recommendation readback: ${binding.recommendationId}`);
    return matches[0]!;
  };
  // Provider resolution identity is opaque; Program recommendationDigest is a fingerprint.
  const existingResolutions = new Map<string, RefactorResolutionEvidenceV1>();
  for (const entry of readRefactorResolutions(root, program.programId)) {
    if (existingResolutions.has(entry.recommendationId)) fail('refactor_post_merge_failed', `duplicate resolution evidence: ${entry.recommendationId}`);
    existingResolutions.set(entry.recommendationId, entry);
  }
  for (const item of input.items) {
    const candidate = validateRefactorCandidateVerificationReceipt(item.candidateVerification); const binding = validateRefactorExecutionBinding(item.binding);
    authorityFor(binding);
    const refs = [
      { kind: 'task_contract' as const, locator: binding.contractPath, sha256: binding.contractSha256.slice('sha256:'.length) },
      { kind: 'cutover_closure' as const, locator: candidate.cutoverClosureLocator, sha256: binding.cutoverClosureSha256.slice('sha256:'.length) },
      { kind: 'acceptance_receipt' as const, locator: item.acceptanceReceiptLocator, sha256: binding.acceptanceReceiptSha256.slice('sha256:'.length) },
      { kind: 'merge_receipt' as const, locator: item.mergeReceiptLocator, sha256: item.mergeReceiptSha256.slice('sha256:'.length) },
    ];
    const request: RefactorVerificationRequestV1 = { schemaVersion: 'archcontext.refactor-verification-request/v1', recommendationId: binding.recommendationId, expectedHeadSha: finalMain, expectedWorktreeDigest: input.final_worktree_digest, executionEvidenceRefs: refs };
    assertRefactorVerificationRequest(request);
    let evidence = existingResolutions.get(binding.recommendationId);
    if (!evidence) {
      if (status.current.state !== 'post_merge_measuring') fail('refactor_post_merge_failed', 'program advanced without stored final-main evidence');
      let result: RefactorVerifyResultV1;
      try { result = (dependencies.verify ?? ((value, repo) => runRefactorVerify(value, repo, { env: input.env })))(request, root); }
      catch (error) { if (error instanceof RefactorProviderError && error.code === 'refactor_provider_version_mismatch') { providerUnavailable = true; break; } throw error; }
      if (!result.evidence || result.disposition !== result.evidence.disposition) fail('refactor_post_merge_failed', 'missing or inconsistent post-merge resolution evidence');
      evidence = result.evidence;
    }
    const issues = refactorResolutionEvidenceInvariantIssues(evidence);
    if (issues.length || evidence.recommendationId !== binding.recommendationId || evidence.verifiedHeadSha !== finalMain || evidence.verifiedWorktreeDigest !== input.final_worktree_digest
      || canonicalize(evidence.executionEvidenceRefs as never) !== canonicalize(refs as never)) fail('refactor_post_merge_stale', 'resolution does not bind exact final main and execution evidence');
    persistRefactorResolution(root, program.programId, evidence);
    if (evidence.disposition === 'stale') { stale = true; continue; }
    if (evidence.disposition === 'resolved' && authorityFor(binding).status !== 'resolved') {
      if (authorityFor(binding).status !== 'accepted') fail('refactor_post_merge_failed', 'resolution requires an accepted recommendation');
      // Persisted measurement survives a failed lifecycle write; retry must finish that write.
      (dependencies.resolve ?? ((id, digest, worktree, reason, repo) => recordRefactorResolution(id, digest, worktree, reason, repo, { env: input.env })))(binding.recommendationId, evidence.resolutionDigest, input.final_worktree_digest, `Resolved by exact Refactor Program ${program.programId} final-main measurement.`, root);
      recommendations = readRecommendations();
      if (authorityFor(binding).status !== 'resolved') fail('refactor_post_merge_failed', 'provider readback is not resolved after lifecycle write');
    }
  }
  if (stale && status.current.state === 'post_merge_measuring') appendRefactorProgramEvent({ repo_root: root, program_id: program.programId, expected_current_sha256: status.current.current_sha256, idempotency_key: `${input.idempotency_key}:reconcile`, operation: 'require_reconciliation', evidence_refs: [finalMain], observed_at: input.observed_at, owned_target_revision: finalMain, env: input.env });
  else if (!providerUnavailable && status.current.state === 'post_merge_measuring') appendRefactorProgramEvent({ repo_root: root, program_id: program.programId, expected_current_sha256: status.current.current_sha256, idempotency_key: `${input.idempotency_key}:resolve`, operation: 'begin_resolve', evidence_refs: readRefactorResolutions(root, program.programId).map((entry) => entry.resolutionDigest), observed_at: input.observed_at, owned_target_revision: finalMain, env: input.env });
  recommendations = readRecommendations();
  const board = projectRefactorBoard({ program, measuredHeadSha: finalMain, recommendations, bindings: readRefactorExecutionBindings(root, program.programId), resolutions: readRefactorResolutions(root, program.programId) });
  const { jsonPath, markdownPath } = writeBoard(root, board);
  const results = new Set(board.cards.map((entry) => entry.architectureResult)); const stage = providerUnavailable || results.has('merged_pending_measurement') ? 'merged_pending_measurement' : stale ? 'reconciliation_required' : results.size === 1 && results.has('resolved') ? 'resolved' : 'follow_up_required';
  if (stage === 'resolved') { const current = readRefactorProgramStatus(root, program.programId, input.env ?? process.env).current; if (current.state === 'resolving') appendRefactorProgramEvent({ repo_root: root, program_id: program.programId, expected_current_sha256: current.current_sha256, idempotency_key: `${input.idempotency_key}:complete`, operation: 'complete', evidence_refs: [board.boardDigest], observed_at: input.observed_at, owned_target_revision: finalMain, env: input.env }); }
  return Object.freeze({ board, jsonPath, markdownPath, stage });
}
