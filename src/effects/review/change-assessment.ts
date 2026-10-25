import { realpathSync } from 'node:fs';
import { join } from 'path';
import { observeActiveReviewAdmission } from './issue-goal';
import type { ReviewAdmissionSource } from './admission-source';

import {
  assessChange,
  buildReviewSelectionPacket,
  type ChangeAssessmentResult,
  type ReviewSelectionPacket,
  validateReviewSelectionPacketAgainstAssessment,
} from '../../core/review/change-assessment';
import { resolveWorkflowProfile, type StrictRiskCategory, type WorkflowProfile } from '../../core/workflow/profile';
import { buildReviewSubject, resolvePolicyReviewBase, reviewSubjectAddedLines, type ReviewSubject } from './diff-fingerprint';

export type PreparedChangeAssessment = {
  readonly assessment: ChangeAssessmentResult;
  readonly packet: ReviewSelectionPacket | null;
};

function addedHunkLooksNovel(content: string): boolean {
  return /\b(?:interface|abstract\s+class|Adapter|Factory|Strategy|Wrapper)\b/u.test(content);
}

/**
 * Detect only a narrow, deterministic review-routing signal. This is neither
 * a semantic judgment nor a replacement for the human pattern review: it
 * merely routes a newly-added abstraction-shaped hunk to that review surface.
 * Existing tokens in the final file are intentionally irrelevant: only a
 * policy-base diff hunk can establish this routing signal.
 */
export function collectPatternNoveltyPaths(repoRoot: string, subject: ReviewSubject): readonly string[] {
  const result: string[] = [];
  const additions = reviewSubjectAddedLines(repoRoot, subject);
  for (const { path, line } of additions) {
    if (!/\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift)$/u.test(path)) continue;
    if (addedHunkLooksNovel(line)) result.push(path);
  }
  return Object.freeze([...new Set(result)].sort());
}

function profileFor(paths: readonly string[]): { readonly workflowProfile: WorkflowProfile; readonly strictCategories: readonly StrictRiskCategory[] } {
  if (paths.length === 0) return { workflowProfile: 'routine', strictCategories: [] };
  const profile = resolveWorkflowProfile({ targetPaths: paths, strictScanPaths: paths, operationKind: 'edit' });
  if (!profile.ok) throw new Error(`workflow profile is unavailable: ${profile.message}`);
  return { workflowProfile: profile.profile, strictCategories: profile.signals.strictCategories };
}

/**
 * The authoritative preparation entry point. It recomputes its own final
 * subject from the policy-owned review base and deliberately has no input for
 * PostToolUse observations or model output.
 */
export function prepareChangeAssessment(args: {
  readonly repoRoot: string;
  readonly authority: ReviewAdmissionSource;
  /** An acceptance reader pins historical assessment to the receipt target. */
  readonly targetRevision?: string;
  /** A prior packet may contribute only the closed reviewer-disagreement overlay. */
  readonly reviewerDisagreementPacket?: unknown;
}): PreparedChangeAssessment {
  const reviewBase = resolvePolicyReviewBase(args.repoRoot);
  if (!reviewBase.ok) throw new Error(`Change Assessment cannot resolve review base: ${reviewBase.reason}`);
  if (realpathSync(args.authority.repoRoot) !== realpathSync(args.repoRoot)) throw new Error('assessment authority repository mismatch');
  const approved = observeActiveReviewAdmission(args.authority);
  const subject = buildReviewSubject(args.repoRoot, {
    targetRef: reviewBase.targetRef,
    targetRevision: args.targetRevision,
  });
  const profile = profileFor(subject.paths);
  const assessment = assessChange({
    subject,
    workflowProfile: profile.workflowProfile,
    strictCategories: profile.strictCategories,
    patternNoveltyPaths: subject.status === 'ok' ? collectPatternNoveltyPaths(args.repoRoot, subject) : [],
    declaredOracles: approved.admission.oracles,
  });
  const current = observeActiveReviewAdmission(args.authority);
  if (current.grant_sha256 !== approved.grant_sha256 || current.revision !== approved.revision) throw new Error('assessment admission changed during observation');
  if (assessment.status === 'degraded') return { assessment, packet: null };
  const packet = args.reviewerDisagreementPacket === undefined
    ? buildReviewSelectionPacket(assessment)
    : validateReviewSelectionPacketAgainstAssessment(args.reviewerDisagreementPacket, assessment);
  return Object.freeze({ assessment, packet });
}

export function defaultChangeAssessmentPath(): string {
  return join('.ai', 'harness', 'checks', 'change-assessment.latest.json');
}
