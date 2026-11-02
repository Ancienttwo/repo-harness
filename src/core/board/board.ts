import { parseClosingReferences } from '../publication/closing-references';
import type { PullRequestReadinessV2 } from '../publication/merge-readiness';
import { decodePlanBlock, PlanBlockError, type PlanBlockV1 } from './plan-block';
import {
  BoardSourceError,
  newestProtocolComment,
  parseAcceptanceRecord,
  parseClaimStatus,
  parseRefs,
  type BoardParentReadV1,
  type BoardPullRequestReadV1,
  type BoardSubIssueReadV1,
  type ClaimStatusV1,
} from './source';
import { isCiRepairIssueBody } from '../operator/tests';

/**
 * The board: one parent issue, its sub-issues and their pull requests, the
 * hc seat terminals that work on them, the daily full run and the hc pin.
 * It is a read model. GitHub and hc stay the authorities; the board keeps
 * their observation time and never writes back.
 */
export const BOARD_PROTOCOL = 1 as const;
export const BOARD_KIND = 'repo-harness.board' as const;

export type BoardTier = 'low' | 'medium' | 'high';
const TIER_LABELS: Readonly<Record<string, BoardTier>> = { 'tier:low': 'low', 'tier:medium': 'medium', 'tier:high': 'high' };
const PLAN_HEADER = 'repo-harness plan';
const CLAIM_STATUS_HEADER = 'repo-harness issue claim status';
const ACCEPTANCE_RECORD_HEADER = 'repo-harness acceptance record';
const REQUIRED_CHECK = 'Required / CI';

export type BoardPlanV1 =
  | { readonly status: 'observed'; readonly comment_url: string; readonly created_at: string; readonly block: PlanBlockV1 }
  | { readonly status: 'absent'; readonly truncated: boolean }
  | { readonly status: 'unavailable'; readonly comment_url: string; readonly reason: string };

export type BoardClaimStatusV1 =
  | ({ readonly status_kind: 'observed' } & ClaimStatusV1)
  | { readonly status_kind: 'none' }
  /** Older comments exist that the read did not return, and the newest ones hold no status. */
  | { readonly status_kind: 'unknown' };

export interface BoardItemV1 {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: 'open' | 'closed';
  readonly labels: readonly string[];
  readonly tier: BoardTier | null;
  readonly milestone: string | null;
  readonly blocked_by: readonly { readonly number: number; readonly state: 'open' | 'closed' }[];
  readonly claim_status: BoardClaimStatusV1;
  /** Pull requests whose body closes or refs this issue. */
  readonly pull_requests: readonly number[];
}

export type BoardRequiredCheckV1 =
  | { readonly status: 'success' | 'failure'; readonly completed_at: string }
  | { readonly status: 'pending' | 'missing' };

export type BoardAcceptanceV1 =
  /** `record`: the newest acceptance record has a PASS row for the head. `tier_low`: every closed issue is `tier:low` and `Required / CI` passed. */
  | { readonly status: 'accepted'; readonly via: 'record' | 'tier_low'; readonly accepted_at: string; readonly evidence_url: string }
  | { readonly status: 'not_accepted' }
  | { readonly status: 'unknown'; readonly reason: 'acceptance_record_unparsed' | 'comments_truncated'; readonly evidence_url: string | null };

export interface BoardPullRequestV1 {
  readonly number: number;
  readonly url: string;
  readonly state: 'open' | 'closed' | 'merged';
  readonly is_draft: boolean;
  readonly base_ref: string;
  readonly base_sha: string;
  readonly head_ref: string;
  readonly head_sha: string;
  readonly head_committed_at: string;
  readonly merged_at: string | null;
  readonly closes: readonly number[];
  readonly refs: readonly number[];
  readonly files: readonly string[] | null;
  readonly required_check: BoardRequiredCheckV1;
  readonly acceptance: BoardAcceptanceV1;
  /** The single-PR readiness projection, for open pull requests only. */
  readonly merge_readiness: PullRequestReadinessV2 | null;
}

export type BoardTerminalV1 = {
  readonly address: string;
  readonly name: string | null;
  readonly state: 'live' | 'finished';
  /** The program's own 7501 word; null when it never reported. */
  readonly status: string | null;
  readonly status_kind: string | null;
  readonly status_ms: number | null;
  readonly turn: number;
} & (
  | { readonly seat_status: 'observed'; readonly seat: string; readonly issue: number | null; readonly pr: number | null }
  /** The terminal carries the parent label but no seat label. The board does not guess its seat. */
  | { readonly seat_status: 'unavailable'; readonly reason: 'seat_label_missing' | 'seat_label_invalid' }
);

export type BoardExecutionV1 =
  | { readonly status: 'observed'; readonly terminals: readonly BoardTerminalV1[] }
  | { readonly status: 'unavailable'; readonly reason: string };

export type BoardDailyRunV1 =
  | { readonly status: 'observed'; readonly run_url: string; readonly conclusion: string | null; readonly created_at: string; readonly open_repair_issues: readonly number[] }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface BoardToolingV1 {
  readonly hc: { readonly status: 'observed'; readonly version: string; readonly min_version: string } | { readonly status: 'unavailable'; readonly reason: string };
  /** No policy pin exists for Herdr.app yet. */
  readonly herdr_app: { readonly status: 'not_pinned' };
}

export interface BoardV1 {
  readonly protocol: typeof BOARD_PROTOCOL;
  readonly kind: typeof BOARD_KIND;
  readonly observed_at: string;
  readonly repository: string;
  readonly default_branch: string;
  readonly parent: { readonly number: number; readonly title: string; readonly url: string; readonly state: 'open' | 'closed'; readonly labels: readonly string[]; readonly milestone: string | null };
  readonly plan: BoardPlanV1;
  readonly items: readonly BoardItemV1[];
  readonly pull_requests: readonly BoardPullRequestV1[];
  readonly execution: BoardExecutionV1;
  readonly daily_run: BoardDailyRunV1;
  readonly tooling: BoardToolingV1;
}

export type BoardDailyRunInputV1 =
  | { readonly status: 'observed'; readonly run_url: string; readonly conclusion: string | null; readonly created_at: string }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface BoardInputV1 {
  readonly observed_at: string;
  readonly parent: BoardParentReadV1;
  readonly pull_requests: readonly BoardPullRequestReadV1[];
  readonly readiness: readonly PullRequestReadinessV2[];
  readonly execution: BoardExecutionV1;
  readonly daily_run: BoardDailyRunInputV1;
  readonly tooling: BoardToolingV1;
}

/** Refuse a board of another protocol or kind at a process boundary (Surface contract, docs/adr/ADR-0002). */
export function decodeBoard(value: unknown): BoardV1 {
  const board = value as Partial<BoardV1> | null;
  if (board?.protocol !== BOARD_PROTOCOL) throw new Error(`unsupported board protocol: ${String(board?.protocol)}`);
  if (board.kind !== BOARD_KIND) throw new Error(`unsupported board kind: ${String(board.kind)}`);
  return board as BoardV1;
}

function projectPlan(parent: BoardParentReadV1['parent']): BoardPlanV1 {
  const comment = newestProtocolComment(parent.comments, PLAN_HEADER);
  if (comment === null) return { status: 'absent', truncated: parent.comments.truncated };
  try {
    return { status: 'observed', comment_url: comment.url, created_at: comment.created_at, block: decodePlanBlock(comment.body) };
  } catch (error) {
    if (!(error instanceof PlanBlockError)) throw error;
    return { status: 'unavailable', comment_url: comment.url, reason: error.message };
  }
}

function claimStatus(issue: BoardSubIssueReadV1): BoardClaimStatusV1 {
  const comment = newestProtocolComment(issue.comments, CLAIM_STATUS_HEADER);
  const status = comment === null ? null : parseClaimStatus(comment);
  if (status !== null) return { status_kind: 'observed', ...status };
  return issue.comments.truncated ? { status_kind: 'unknown' } : { status_kind: 'none' };
}

function requiredCheck(read: BoardPullRequestReadV1): BoardRequiredCheckV1 {
  const runs = read.checks.filter(check => check.name === REQUIRED_CHECK);
  if (runs.length === 0) return { status: 'missing' };
  const run = runs.reduce((newest, check) => ((check.completed_at ?? '9') > (newest.completed_at ?? '9') ? check : newest));
  if (run.status !== 'COMPLETED' || run.completed_at === null) return { status: 'pending' };
  return { status: run.conclusion === 'SUCCESS' ? 'success' : 'failure', completed_at: run.completed_at };
}

function acceptance(read: BoardPullRequestReadV1, check: BoardRequiredCheckV1, closedTiers: readonly (BoardTier | null)[]): BoardAcceptanceV1 {
  const record = newestProtocolComment(read.comments, ACCEPTANCE_RECORD_HEADER);
  if (record !== null) {
    const rows = parseAcceptanceRecord(record);
    if (rows === null) return { status: 'unknown', reason: 'acceptance_record_unparsed', evidence_url: record.url };
    if (rows.some(row => row.verdict === 'PASS' && row.subject_sha === read.head_sha)) {
      return { status: 'accepted', via: 'record', accepted_at: record.created_at, evidence_url: record.url };
    }
  } else if (read.comments.truncated) {
    return { status: 'unknown', reason: 'comments_truncated', evidence_url: null };
  }
  // A Low pull request has no accept seat (`agentic-development-flow.md`, Review by risk).
  if (check.status === 'success' && closedTiers.length > 0 && closedTiers.every(tier => tier === 'low')) {
    return { status: 'accepted', via: 'tier_low', accepted_at: check.completed_at, evidence_url: read.url };
  }
  return { status: 'not_accepted' };
}

function bodyLinks(repository: string, body: string): { readonly closes: number[]; readonly refs: number[] } {
  const prefix = `${repository.toLowerCase()}#`;
  const closes = parseClosingReferences(repository, body).references
    .filter(reference => reference.startsWith(prefix))
    .map(reference => Number(reference.slice(prefix.length)));
  return { closes, refs: parseRefs(body) };
}

/** A cross-reference alone does not link a pull request to an item; its body must close or ref one. */
export function linkedPullRequests(parent: BoardParentReadV1, reads: readonly BoardPullRequestReadV1[]): BoardPullRequestReadV1[] {
  const items = new Set(parent.sub_issues.map(issue => issue.number));
  return reads.filter((read) => {
    const links = bodyLinks(parent.repository.name_with_owner, read.body);
    return [...links.closes, ...links.refs].some(number => items.has(number));
  });
}

export function projectBoard(input: BoardInputV1): BoardV1 {
  const repository = input.parent.repository.name_with_owner;
  const itemNumbers = new Set(input.parent.sub_issues.map(issue => issue.number));
  const tiers = new Map(input.parent.sub_issues.map(issue => [issue.number, tierOf(issue.labels)] as const));
  const pullRequests = linkedPullRequests(input.parent, input.pull_requests).map((read): BoardPullRequestV1 => {
    const { closes, refs } = bodyLinks(repository, read.body);
    const check = requiredCheck(read);
    const readiness = read.state === 'open' ? input.readiness.find(entry => entry.pr_number === read.number) : undefined;
    if (read.state === 'open' && readiness === undefined) throw new Error(`board input has no merge readiness for open PR #${read.number}`);
    return Object.freeze({
      number: read.number,
      url: read.url,
      state: read.state,
      is_draft: read.is_draft,
      base_ref: read.base_ref,
      base_sha: read.base_sha,
      head_ref: read.head_ref,
      head_sha: read.head_sha,
      head_committed_at: read.head_committed_at,
      merged_at: read.merged_at,
      closes: Object.freeze(closes),
      refs: Object.freeze(refs),
      files: read.files,
      required_check: check,
      acceptance: acceptance(read, check, closes.filter(number => itemNumbers.has(number)).map(number => tiers.get(number) ?? null)),
      merge_readiness: readiness ?? null,
    });
  }).sort((left, right) => left.number - right.number);
  const items = input.parent.sub_issues.map((issue): BoardItemV1 => Object.freeze({
    number: issue.number,
    title: issue.title,
    url: issue.url,
    state: issue.state,
    labels: issue.labels,
    tier: tiers.get(issue.number) ?? null,
    milestone: issue.milestone,
    blocked_by: issue.blocked_by,
    claim_status: claimStatus(issue),
    pull_requests: Object.freeze(pullRequests.filter(pr => pr.closes.includes(issue.number) || pr.refs.includes(issue.number)).map(pr => pr.number)),
  })).sort((left, right) => left.number - right.number);
  const daily: BoardDailyRunV1 = input.daily_run.status === 'unavailable' ? input.daily_run : {
    ...input.daily_run,
    open_repair_issues: Object.freeze(input.parent.repair_candidates.filter(issue => isCiRepairIssueBody(issue.body)).map(issue => issue.number).sort((left, right) => left - right)),
  };
  const parent = input.parent.parent;
  return Object.freeze({
    protocol: BOARD_PROTOCOL,
    kind: BOARD_KIND,
    observed_at: input.observed_at,
    repository,
    default_branch: input.parent.repository.default_branch,
    parent: Object.freeze({ number: parent.number, title: parent.title, url: parent.url, state: parent.state, labels: parent.labels, milestone: parent.milestone }),
    plan: projectPlan(parent),
    items: Object.freeze(items),
    pull_requests: Object.freeze(pullRequests),
    execution: input.execution,
    daily_run: daily,
    tooling: input.tooling,
  });
}

function tierOf(labels: readonly string[]): BoardTier | null {
  const tiers = [...new Set(labels.flatMap(label => (TIER_LABELS[label] ? [TIER_LABELS[label]] : [])))];
  if (tiers.length > 1) throw new BoardSourceError(`an issue carries more than one tier label: ${tiers.join(', ')}`);
  return tiers[0] ?? null;
}
