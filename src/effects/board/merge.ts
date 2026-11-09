import { boardMergeDecisions, type BoardMergeDecisionV1 } from '../../core/board/merge';
import { executePublicationMerge, type PublicationMergeResult } from '../publication/merge-executor';
import { collectBoard, readRepositoryId, type BoardCollectInput } from './collect';

export interface BoardMergeInput extends BoardCollectInput {
  /** The pull request to merge; null takes the first eligible one in plan merge order. */
  readonly pr: number | null;
  /** Decide only: no merge request. */
  readonly dry_run: boolean;
  /** Effect seam for tests: the merge executor. */
  readonly merge?: typeof executePublicationMerge;
}

export interface BoardMergeResultV1 {
  readonly decisions: readonly BoardMergeDecisionV1[];
  /** The pull request that the command selected; null when none is eligible. */
  readonly target: number | null;
  /** The executor document; null when no merge request ran. */
  readonly merge: PublicationMergeResult['document'] | null;
  /** The executor exit code, 4 when no eligible target exists, 0 for a dry run with a target. */
  readonly exit_code: 0 | 3 | 4 | 5 | 6;
}

/**
 * One fresh board read, one eligibility pass, at most one merge. The executor
 * keeps all its own gates (base policy, branch protection, readiness, head and
 * base pins), so the board decision only narrows what it is asked to merge.
 */
export function runBoardMerge(input: BoardMergeInput): BoardMergeResultV1 {
  const board = collectBoard(input);
  const decisions = boardMergeDecisions(board);
  const chosen = input.pr === null ? decisions.find(decision => decision.eligible) : decisions.find(decision => decision.pr === input.pr);
  if (chosen === undefined || !chosen.eligible) return { decisions, target: null, merge: null, exit_code: 4 };
  if (input.dry_run) return { decisions, target: chosen.pr, merge: null, exit_code: 0 };
  const pr = board.pull_requests.find(entry => entry.number === chosen.pr)!;
  const result = (input.merge ?? executePublicationMerge)({
    repo_root: input.repo_root, repository: board.repository, provider_repository_id: String(readRepositoryId(input)),
    pr_number: pr.number, expected_head_sha: pr.head_sha, expected_base_sha: pr.base_sha, gh_bin: input.gh_bin,
  });
  return { decisions, target: pr.number, merge: result.document, exit_code: result.exit_code };
}
