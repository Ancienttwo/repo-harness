/**
 * The canonical authority a claim is validated against.
 *
 * A claim never reads the caller's working tree or its local active-sprint
 * marker: a worktree cut from an older commit would otherwise claim against
 * its own stale copy of the backlog. The sprint text is read out of an
 * explicitly named ref, so every worktree of the clone validates against the
 * same bytes.
 *
 * Repo identity is the resolved git common directory. It is stable across
 * every linked worktree of one clone -- which is exactly the coordination
 * plane's scope -- and the contract puts cross-clone and cross-machine
 * coordination out of scope, so nothing needs an identity that outlives the
 * clone's location.
 */
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { resolveGitCommonDirectory } from '../git/common-directory';
import {
  evidenceContractComplete,
  markdownHeader,
  markdownSection,
  parseAllowedPaths,
  planSlugFromPath,
  planStatusFromText,
} from '../../core/state/artifact-parsers';
import { readText, repoPath } from './collect-state-inputs';

export function resolveRepoIdentity(cwd: string): string {
  return resolveGitCommonDirectory(cwd);
}

export interface CanonicalSprintSource {
  /** Ref naming the canonical commit, for example `main` or `origin/main`. */
  readonly targetRef: string;
  /** Repo-relative sprint path as it exists on that ref. */
  readonly sprintPath: string;
}

export type CanonicalSprintRead =
  | { readonly ok: true; readonly commit: string; readonly text: string }
  | { readonly ok: false; readonly error: string };

export type CanonicalTaskPlanFailureCode =
  | 'plan_missing'
  | 'plan_ambiguous'
  | 'plan_not_approved'
  | 'plan_source_mismatch'
  | 'plan_not_projectable'
  | 'contract_missing'
  | 'contract_not_projectable';

/** A plan/contract proof is a read-time fact, not an execution authority. */
export interface CanonicalTaskPlanProof {
  readonly plan_path: string;
  readonly contract_path: string;
  readonly source_ref: string;
  readonly plan_sha256: string;
  readonly contract_sha256: string;
  readonly projectable: true;
}

export type CanonicalTaskPlanProofResult =
  | { readonly ok: true; readonly proof: CanonicalTaskPlanProof }
  | {
    readonly ok: false;
    readonly code: CanonicalTaskPlanFailureCode;
    readonly error: string;
    readonly candidates: readonly string[];
  };

export interface CanonicalTaskPlanProofInput {
  /** The canonical sprint path whose row is being offered. */
  readonly sprintPath: string;
  /** The exact Task cell from the canonical row; never a slug or row index. */
  readonly taskCell: string;
}

const PLACEHOLDER = /^(?:\(required before projection\)|required before projection|tbd|todo|n\/a|none|unknown|\.\.\.)$/i;
const FORBIDDEN_PROMOTION_REASON = /^(?:next_sprint_row_only|red_green_step_only|docs_or_handoff_only|same_allowed_paths_as_active_plan|same_verification_as_active_plan|same_rollback_surface_as_active_plan)$/i;

function concreteMetadata(value: string | null): boolean {
  return value !== null && value.trim().length > 0 && !PLACEHOLDER.test(value.trim());
}

function sectionHasConcreteFields(
  content: string,
  heading: string,
  labels: readonly string[],
): boolean {
  const section = markdownSection(content, heading);
  if (section === null || section.trim().length === 0) return false;
  return labels.every((label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const line = section.split(/\r?\n/).find((candidate) => new RegExp(
      `^\\s*-\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:`,
      'i',
    ).test(candidate));
    if (!line) return false;
    return concreteMetadata(line.slice(line.indexOf(':') + 1).trim());
  });
}

function planIsProjectable(planPath: string, planText: string): boolean {
  const artifactLevel = markdownHeader(planText, 'Artifact Level');
  const promotionReason = markdownHeader(planText, 'Promotion Reason');
  const verificationBoundary = markdownHeader(planText, 'Verification Boundary');
  const rollbackSurface = markdownHeader(planText, 'Rollback Surface');
  if (artifactLevel !== 'work-package') return false;
  if (!concreteMetadata(promotionReason) || FORBIDDEN_PROMOTION_REASON.test(promotionReason!)) return false;
  if (!concreteMetadata(verificationBoundary) || !concreteMetadata(rollbackSurface)) return false;
  if (!evidenceContractComplete(planText)) return false;
  if (!sectionHasConcreteFields(planText, 'Promotion Gate', [
    'Merge/PR unit',
    'Rollback surface',
    'Verification boundary',
    'Review/acceptance boundary',
    'High-risk surface',
    'Why not checklist row',
  ])) return false;

  const orchestrationKind = markdownHeader(planText, 'Orchestration Kind');
  if (orchestrationKind === 'sprint-inline' || orchestrationKind?.endsWith('-inline')) return false;
  const slug = planSlugFromPath(planPath);
  if (slug !== null && /^(?:think-plan|codex-plan|approved-plan)-\d+(?:-|$)/.test(slug)) return false;
  return true;
}

function sha256Text(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf-8').digest('hex')}`;
}

function failure(
  code: CanonicalTaskPlanFailureCode,
  error: string,
  candidates: readonly string[],
): CanonicalTaskPlanProofResult {
  return { ok: false, code, error, candidates: Object.freeze([...candidates]) };
}

/**
 * Prove one already-read plan/contract pair is projectable.  The source-ref
 * comparison is exact and uses the canonical sprint path plus the verbatim
 * Task cell, which prevents a filename or Plan cell from becoming a second
 * identity authority.
 */
export function proveCanonicalTaskPlan(
  input: CanonicalTaskPlanProofInput & {
    readonly planPath: string;
    readonly planText: string;
    readonly contractText: string | null;
  },
): CanonicalTaskPlanProofResult {
  const expectedSourceRef = `sprint:${input.sprintPath}#${input.taskCell}`;
  const sourceRef = markdownHeader(input.planText, 'Source Ref');
  if (sourceRef !== expectedSourceRef) {
    return failure(
      'plan_source_mismatch',
      `plan ${input.planPath} Source Ref is ${JSON.stringify(sourceRef)}, expected ${JSON.stringify(expectedSourceRef)}`,
      [input.planPath],
    );
  }
  if (planStatusFromText(input.planText) !== 'approved') {
    return failure('plan_not_approved', `plan ${input.planPath} is not Approved`, [input.planPath]);
  }
  if (!planIsProjectable(input.planPath, input.planText)) {
    return failure('plan_not_projectable', `plan ${input.planPath} is not projectable`, [input.planPath]);
  }

  const contractPath = markdownHeader(input.planText, 'Task Contract');
  if (!contractPath) {
    return failure('contract_missing', `plan ${input.planPath} does not name a Task Contract`, [input.planPath]);
  }
  if (input.contractText === null) {
    return failure('contract_missing', `task contract ${contractPath} is missing`, [input.planPath]);
  }
  const contractPlan = markdownHeader(input.contractText, 'Plan');
  if (contractPlan !== input.planPath || parseAllowedPaths(input.contractText).length === 0) {
    return failure('contract_not_projectable', `task contract ${contractPath} is not projectable`, [input.planPath]);
  }

  return {
    ok: true,
    proof: Object.freeze({
      plan_path: input.planPath,
      contract_path: contractPath,
      source_ref: expectedSourceRef,
      plan_sha256: sha256Text(input.planText),
      contract_sha256: sha256Text(input.contractText),
      projectable: true,
    }),
  };
}

function planCandidates(cwd: string): string[] {
  let entries: Array<{ readonly isFile: () => boolean; readonly name: string }>;
  try {
    entries = readdirSync(repoPath(cwd, 'plans'), { withFileTypes: true, encoding: 'utf8' }) as Array<{
      readonly isFile: () => boolean;
      readonly name: string;
    }>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && /^plan-.+\.md$/.test(entry.name))
    .map((entry) => `plans/${entry.name}`)
    .sort();
}

/**
 * Scan only durable plan carriers and require exactly one exact Source Ref.
 * `row.plan` is intentionally not an input: stale Plan cells and filenames
 * must never select an execution plan.
 */
export function readCanonicalTaskPlanProof(
  cwd: string,
  input: CanonicalTaskPlanProofInput,
): CanonicalTaskPlanProofResult {
  const candidates = planCandidates(cwd);
  const expectedSourceRef = `sprint:${input.sprintPath}#${input.taskCell}`;
  const matching = candidates.filter((path) => markdownHeader(readText(cwd, path) ?? '', 'Source Ref') === expectedSourceRef);
  if (matching.length > 1) {
    return failure('plan_ambiguous', `multiple plans carry Source Ref ${expectedSourceRef}`, matching);
  }
  if (matching.length === 0) {
    const sourceMatchedSprint = candidates.filter((path) => {
      const sourceRef = markdownHeader(readText(cwd, path) ?? '', 'Source Ref');
      return sourceRef !== null && sourceRef.startsWith(`sprint:${input.sprintPath}#`);
    });
    return sourceMatchedSprint.length > 0
      ? failure('plan_source_mismatch', `no plan carries exact Source Ref ${expectedSourceRef}`, sourceMatchedSprint)
      : failure('plan_missing', `no plan carries Source Ref ${expectedSourceRef}`, []);
  }

  const planPath = matching[0]!;
  const planText = readText(cwd, planPath);
  if (planText === null) return failure('plan_missing', `plan ${planPath} is unreadable`, [planPath]);
  const contractPath = markdownHeader(planText, 'Task Contract');
  let contractText: string | null = null;
  if (contractPath !== null) {
    try {
      contractText = readText(cwd, contractPath);
    } catch {
      return failure('contract_not_projectable', `task contract ${contractPath} is not a safe repository path`, [planPath]);
    }
  }
  return proveCanonicalTaskPlan({ ...input, planPath, planText, contractText });
}

function unsafeSprintPath(sprintPath: string): boolean {
  return sprintPath.length === 0
    || sprintPath.startsWith('/')
    || sprintPath.startsWith('-')
    || sprintPath.includes('\0')
    || sprintPath.includes('\n')
    || sprintPath.includes('\r')
    || sprintPath.split('/').includes('..');
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Read one repo-relative file at one already-resolved commit, or `null` when
 * the commit does not carry it.
 *
 * `readCanonicalSprint` resolves the ref and returns the sprint; a caller that
 * must also compare a *sibling* of that sprint -- the Work Graph carrier -- has
 * to read it at the same commit, not from the working tree, or it would bind a
 * receipt to bytes the commit never had.
 */
export function readCanonicalFileAtCommit(
  cwd: string,
  commit: string,
  repoRelativePath: string,
): string | null {
  if (unsafeSprintPath(repoRelativePath)) {
    throw new Error(`unsafe canonical path: ${JSON.stringify(repoRelativePath)}`);
  }
  if (!/^[0-9a-f]{40,64}$/.test(commit)) {
    throw new Error(`unsafe canonical commit: ${JSON.stringify(commit)}`);
  }
  try {
    return git(cwd, ['show', `${commit}:${repoRelativePath}`]);
  } catch {
    return null;
  }
}

/**
 * Read one sprint file at one commit. The ref is resolved to a commit first,
 * so the returned bytes and the returned SHA are the same observation and a
 * caller re-reading after its write can tell a moved ref from a moved file.
 */
export function readCanonicalSprint(
  cwd: string,
  source: CanonicalSprintSource,
): CanonicalSprintRead {
  if (unsafeSprintPath(source.sprintPath)) {
    return { ok: false, error: `unsafe canonical sprint path: ${JSON.stringify(source.sprintPath)}` };
  }
  if (source.targetRef.length === 0 || source.targetRef.startsWith('-')) {
    return { ok: false, error: `unsafe canonical target ref: ${JSON.stringify(source.targetRef)}` };
  }

  let commit: string;
  try {
    commit = git(cwd, ['rev-parse', '--verify', '--end-of-options', `${source.targetRef}^{commit}`]).trim();
  } catch {
    return { ok: false, error: `canonical target ref does not resolve to a commit: ${source.targetRef}` };
  }
  if (!/^[0-9a-f]{40,64}$/.test(commit)) {
    return { ok: false, error: `canonical target ref resolved to an unexpected commit: ${commit}` };
  }

  try {
    // `git show <sha>:<path>` takes one object name, so no `--` separator is
    // available here; both halves are validated above instead.
    return { ok: true, commit, text: git(cwd, ['show', `${commit}:${source.sprintPath}`]) };
  } catch {
    return {
      ok: false,
      error: `canonical sprint ${source.sprintPath} is absent at ${source.targetRef} (${commit})`,
    };
  }
}
