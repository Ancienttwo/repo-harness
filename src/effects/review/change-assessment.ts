import { readFileSync } from 'fs';
import { join, resolve } from 'path';

import {
  assessChange,
  buildReviewSelectionPacket,
  type ChangeAssessmentResult,
  type DeclaredReviewOracle,
  type ReviewOracleKind,
  type ReviewSelectionPacket,
  validateReviewSelectionPacketAgainstAssessment,
} from '../../core/review/change-assessment';
import { resolveWorkflowProfile, type StrictRiskCategory, type WorkflowProfile } from '../../core/workflow/profile';
import { buildReviewSubject, resolvePolicyReviewBase, reviewSubjectAddedLines, type ReviewSubject } from './diff-fingerprint';

export type ChangeAssessmentContract = {
  readonly protocol: 1;
  readonly oracles: readonly DeclaredReviewOracle[];
};

export type PreparedChangeAssessment = {
  readonly assessment: ChangeAssessmentResult;
  readonly packet: ReviewSelectionPacket | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseOracle(value: unknown, index: number): DeclaredReviewOracle {
  if (!isRecord(value)) throw new Error(`Change Assessment oracle ${index} must be an object`);
  if (typeof value.id !== 'string') throw new Error(`Change Assessment oracle ${index} id is required`);
  if (typeof value.kind !== 'string') throw new Error(`Change Assessment oracle ${index} kind is required`);
  if (!Array.isArray(value.paths) || value.paths.some((path) => typeof path !== 'string')) {
    throw new Error(`Change Assessment oracle ${index} paths must be strings`);
  }
  return { id: value.id, kind: value.kind as ReviewOracleKind, paths: value.paths as string[] };
}

/**
 * Strict contract parser for the per-work-package oracle declaration. The
 * block is authority owned by the active contract; absent or malformed data is
 * an error at prepare-acceptance rather than an implicit empty-oracle fallback.
 */
export function parseChangeAssessmentContract(contractText: string): ChangeAssessmentContract {
  const section = contractText.match(/^## Change Assessment[ \t]*\r?\n+```json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/m);
  if (!section) throw new Error('contract Change Assessment JSON block is missing');
  let value: unknown;
  try {
    value = JSON.parse(section[1]!);
  } catch (error) {
    throw new Error(`contract Change Assessment is invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value) || value.protocol !== 1 || !Array.isArray(value.oracles)) {
    throw new Error('contract Change Assessment must contain protocol 1 and oracles');
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['oracles', 'protocol'])) {
    throw new Error('contract Change Assessment contains unknown fields');
  }
  return Object.freeze({
    protocol: 1,
    oracles: Object.freeze(value.oracles.map(parseOracle)),
  });
}

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
  if (paths.length === 0) return { workflowProfile: 'lite', strictCategories: [] };
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
  readonly contractPath: string;
  /** A prior packet may contribute only the closed reviewer-disagreement overlay. */
  readonly reviewerDisagreementPacket?: unknown;
}): PreparedChangeAssessment {
  const reviewBase = resolvePolicyReviewBase(args.repoRoot);
  if (!reviewBase.ok) throw new Error(`Change Assessment cannot resolve review base: ${reviewBase.reason}`);
  const contractAbsolute = resolve(args.repoRoot, args.contractPath);
  if (!contractAbsolute.startsWith(`${resolve(args.repoRoot)}/`)) throw new Error('contract path escapes repository');
  let contract: string;
  try {
    contract = readFileSync(contractAbsolute, 'utf-8');
  } catch {
    throw new Error(`contract is unreadable: ${args.contractPath}`);
  }
  const declaration = parseChangeAssessmentContract(contract);
  const subject = buildReviewSubject(args.repoRoot, { targetRef: reviewBase.targetRef });
  const profile = profileFor(subject.paths);
  const assessment = assessChange({
    subject,
    workflowProfile: profile.workflowProfile,
    strictCategories: profile.strictCategories,
    patternNoveltyPaths: subject.status === 'ok' ? collectPatternNoveltyPaths(args.repoRoot, subject) : [],
    declaredOracles: declaration.oracles,
  });
  if (assessment.status === 'degraded') return { assessment, packet: null };
  const packet = args.reviewerDisagreementPacket === undefined
    ? buildReviewSelectionPacket(assessment)
    : validateReviewSelectionPacketAgainstAssessment(args.reviewerDisagreementPacket, assessment);
  return Object.freeze({ assessment, packet });
}

export function defaultChangeAssessmentPath(): string {
  return join('.ai', 'harness', 'checks', 'change-assessment.latest.json');
}
