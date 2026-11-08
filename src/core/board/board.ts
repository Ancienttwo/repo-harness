import { parseClosingReferences } from '../publication/closing-references';
import type { AcceptanceMergeSwitch } from '../publication/acceptance-merge-policy';
import type { PullRequestReadinessV2 } from '../publication/merge-readiness';
import { isSeatStatusMessage, seatStatusMessage } from './advisor-seat';
import { decodePlanBlock, PlanBlockError, type PlanBlockV1 } from './plan-block';
import {
  BoardSourceError,
  newestProtocolComment,
  parseAcceptanceRecord,
  parseClaimStatus,
  parseRefs,
  protocolComments,
  type BoardCommentV1,
  type BoardParentReadV1,
  type BoardPullRequestReadV1,
  type BoardSubIssueReadV1,
  type ClaimStatusV1,
} from './source';
import { isCiRepairIssueBody } from '../ci/test-report';

/**
 * The board: one parent issue, its sub-issues and their pull requests, the
 * hc seat terminals that work on them, the daily full run and the hc pin.
 * It is a read model. GitHub and hc stay the authorities; the board keeps
 * their observation time and never writes back.
 */
export const BOARD_PROTOCOL = 3 as const;
export const BOARD_KIND = 'repo-harness.board' as const;

export type BoardTier = 'low' | 'medium' | 'high';
const TIER_LABELS: Readonly<Record<string, BoardTier>> = { 'tier:low': 'low', 'tier:medium': 'medium', 'tier:high': 'high' };
const PLAN_HEADER = 'repo-harness plan';
const CLAIM_STATUS_HEADER = 'repo-harness issue claim status';
const ACCEPTANCE_RECORD_HEADER = 'repo-harness acceptance record';
const REQUIRED_CHECK = 'Required / CI';

export type BoardPlanV1 =
  /** `revision`: the ordinal of this comment among the parent's plan comments (r1 is the first); null when the comment read is truncated. */
  | { readonly status: 'observed'; readonly comment_url: string; readonly created_at: string; readonly revision: number | null; readonly block: PlanBlockV1 }
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
  /** `record`: an acceptance record has a PASS row for the head, and no record has a FAIL row for it. `tier_low`: every closed issue is `tier:low` and `Required / CI` passed. */
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
  readonly agent: string | null;
  readonly state: 'live' | 'finished';
  /** The program's own 7501 word; null when it never reported. */
  readonly status: string | null;
  readonly status_kind: string | null;
  /** hc `status.msg` as one redacted line (`seatStatusMessage`); null when the status has no message. */
  readonly status_msg: string | null;
  readonly status_ms: number | null;
  readonly turn: number;
  /** The current branch of the terminal's working directory; null for a detached HEAD, a missing directory or a failed read. */
  readonly branch: string | null;
} & (
  | { readonly seat_status: 'observed'; readonly seat: string; readonly issue: number | null; readonly pr: number | null }
  /** The terminal carries the parent label but no seat label. The board does not guess its seat. */
  | { readonly seat_status: 'unavailable'; readonly reason: 'seat_label_missing' | 'seat_label_invalid' }
);

/** One terminal as the host reads it: the seat labels are raw label values, checked by the board collector. */
export interface BoardSeatTerminalReadV1 {
  readonly address: string;
  readonly name: string | null;
  readonly agent: string | null;
  readonly state: 'live' | 'finished';
  readonly status: string | null;
  readonly status_kind: string | null;
  /** The raw hc `status.msg`. `seatTerminal` redacts it before it leaves the host read. */
  readonly status_msg: string | null;
  readonly status_ms: number | null;
  readonly turn: number;
  /** The working directory that hc reports, when it reports one. */
  readonly cwd: string | null;
  readonly labels: { readonly seat?: string; readonly issue?: string; readonly pr?: string; readonly parent?: string };
}

/** A read terminal with its branch in place of its directory: the board carries no machine-local path (ADR-0002). */
export type BoardSeatTerminalInputV1 = Omit<BoardSeatTerminalReadV1, 'cwd'> & { readonly branch: string | null };

const POSITIVE = /^[1-9][0-9]*$/u;

/** The board's one check of the raw seat, issue and pr labels of a terminal (the board and the parent list). */
export function seatTerminal(terminal: BoardSeatTerminalInputV1): BoardTerminalV1 {
  const { labels, status_msg, ...rest } = terminal;
  const base = { ...rest, status_msg: seatStatusMessage(status_msg) };
  const { seat, issue, pr } = labels;
  if (seat === undefined) return { ...base, seat_status: 'unavailable', reason: 'seat_label_missing' };
  if (seat === '' || [issue, pr].some(value => value !== undefined && !POSITIVE.test(value))) {
    return { ...base, seat_status: 'unavailable', reason: 'seat_label_invalid' };
  }
  return { ...base, seat_status: 'observed', seat, issue: issue === undefined ? null : Number(issue), pr: pr === undefined ? null : Number(pr) };
}

/**
 * The host reads that the board needs, as a core contract. The terminal host
 * is a plugin, so only the composition root (`src/cli/index.ts`) passes its
 * implementation in.
 */
export interface BoardHostPortsV1 {
  /**
   * The terminals that carry the repository label (the GitHub numeric
   * repository id, decimal), with their raw parent label; watcher terminals
   * are left out. One hc core can host seats of several repositories that
   * share a parent number. The board selects the seats of one parent; the
   * parent list keeps every seat of the repository.
   */
  readonly seatTerminals: (repositoryId: string) =>
    | { readonly status: 'observed'; readonly terminals: readonly BoardSeatTerminalReadV1[] }
    | { readonly status: 'unavailable'; readonly reason: string };
  /** `seatTerminals` with finished terminals too (`hc ls --all`). Only the post-merge closeout reads it, to remove a finished seat terminal (#2021). */
  readonly closeoutTerminals: BoardHostPortsV1['seatTerminals'];
  /** The installed hc client version, `x.y.z`. */
  readonly hcVersion: () => { readonly status: 'observed'; readonly version: string } | { readonly status: 'unavailable'; readonly reason: string };
  /** `hc send` of plain text to the advisor terminal that the caller resolved from `seatTerminals` (#1756). */
  readonly advisorSend: (address: string, text: string) =>
    | { readonly status: 'sent'; readonly started: boolean | null; readonly turn: number }
    | { readonly status: 'unavailable'; readonly reason: string };
  /** `hc read --lines <lines>` of the advisor terminal that the caller resolved from `seatTerminals` (#1756). */
  readonly advisorRead: (address: string, lines: number) =>
    | { readonly status: 'observed'; readonly text: string; readonly complete: boolean; readonly why: string | null }
    | { readonly status: 'unavailable'; readonly reason: string };
  /** `hc kill`, then `hc rm`, of a seat terminal that the post-merge closeout resolved from `closeoutTerminals` (#2005). */
  readonly closeTerminal: (address: string) =>
    | { readonly status: 'closed' }
    | { readonly status: 'unavailable'; readonly reason: string };
}

export type BoardExecutionV1 =
  | { readonly status: 'observed'; readonly terminals: readonly BoardTerminalV1[] }
  | { readonly status: 'unavailable'; readonly reason: string };

export type BoardDailyRunV1 =
  | { readonly status: 'observed'; readonly run_url: string; readonly conclusion: string | null; readonly created_at: string; readonly open_repair_issues: readonly number[] }
  | { readonly status: 'unavailable'; readonly reason: string };

/** The owning capability of one changed path, as `archctx resolve` reports it. The board never guesses an owner. */
export type BoardPathOwnerV1 =
  | { readonly path: string; readonly status: 'owned'; readonly capability: string }
  | { readonly path: string; readonly status: 'unowned' | 'ambiguous' };

/** One entry for each changed path of each open pull request with a complete file list, sorted by path. */
export type BoardPathOwnersV1 =
  | { readonly status: 'observed'; readonly owners: readonly BoardPathOwnerV1[] }
  | { readonly status: 'unavailable'; readonly reason: string };

/** `publication.acceptance_merge` on the default branch; `unknown` when the policy file could not be read or decoded. */
export type BoardAcceptanceMergeV1 = AcceptanceMergeSwitch | 'unknown';

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
  readonly acceptance_merge: BoardAcceptanceMergeV1;
  readonly parent: { readonly number: number; readonly title: string; readonly url: string; readonly state: 'open' | 'closed'; readonly labels: readonly string[]; readonly milestone: string | null };
  readonly plan: BoardPlanV1;
  readonly items: readonly BoardItemV1[];
  readonly pull_requests: readonly BoardPullRequestV1[];
  readonly path_owners: BoardPathOwnersV1;
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
  readonly acceptance_merge: BoardAcceptanceMergeV1;
  readonly pull_requests: readonly BoardPullRequestReadV1[];
  readonly readiness: readonly PullRequestReadinessV2[];
  readonly path_owners: BoardPathOwnersV1;
  readonly execution: BoardExecutionV1;
  readonly daily_run: BoardDailyRunInputV1;
  readonly tooling: BoardToolingV1;
}

const ACCEPTANCE_MERGE_VALUES: ReadonlySet<unknown> = new Set<BoardAcceptanceMergeV1>(['off', 'on', 'unknown']);

/** The `branch` and `status_msg` checks of the board and the parent list decoders: an absent value is a refusal, and null is the explicit none. The error never repeats a refused message. */
export function checkSeatTerminals(terminals: unknown): void {
  if (!Array.isArray(terminals)) throw new Error('board seat terminals are not a list');
  for (const { address, branch, status_msg } of terminals as readonly BoardTerminalV1[]) {
    if (branch !== null && (typeof branch !== 'string' || branch === '')) throw new Error(`invalid board seat branch on ${address}: ${String(branch)}`);
    if (!isSeatStatusMessage(status_msg)) throw new Error(`invalid board seat status message on ${address}`);
  }
}

/** Refuse a board of another protocol or kind, or a board without a valid new value, at a process boundary (Surface contract, docs/adr/ADR-0002). */
export function decodeBoard(value: unknown): BoardV1 {
  const board = value as Partial<BoardV1> | null;
  if (board?.protocol !== BOARD_PROTOCOL) throw new Error(`unsupported board protocol: ${String(board?.protocol)}`);
  if (board.kind !== BOARD_KIND) throw new Error(`unsupported board kind: ${String(board.kind)}`);
  if (!ACCEPTANCE_MERGE_VALUES.has(board.acceptance_merge)) throw new Error(`invalid board acceptance_merge: ${String(board.acceptance_merge)}`);
  if (board.plan?.status === 'observed') {
    const { revision } = board.plan;
    if (revision !== null && (!Number.isSafeInteger(revision) || revision < 1)) throw new Error(`invalid board plan revision: ${String(revision)}`);
  }
  if (board.execution?.status === 'observed') checkSeatTerminals(board.execution.terminals);
  return board as BoardV1;
}

function projectPlan(parent: BoardParentReadV1['parent']): BoardPlanV1 {
  const comment = newestProtocolComment(parent.comments, PLAN_HEADER);
  if (comment === null) return { status: 'absent', truncated: parent.comments.truncated };
  try {
    const revision = parent.comments.truncated ? null : protocolComments(parent.comments, PLAN_HEADER).length;
    return { status: 'observed', comment_url: comment.url, created_at: comment.created_at, revision, block: decodePlanBlock(comment.body) };
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
  // One round is one subject SHA, and a High round has two reviews of it (`acceptor.md`, section 2): every record counts.
  const records = protocolComments(read.comments, ACCEPTANCE_RECORD_HEADER);
  const passes: BoardCommentV1[] = [];
  let failed = false;
  for (const record of records) {
    const rows = parseAcceptanceRecord(record);
    if (rows === null) return { status: 'unknown', reason: 'acceptance_record_unparsed', evidence_url: record.url };
    const head = rows.filter(row => row.subject_sha === read.head_sha);
    if (head.some(row => row.verdict === 'FAIL')) failed = true;
    else if (head.length > 0) passes.push(record);
  }
  if (!failed && passes.length > 0) {
    // An older comment outside the read can hold a FAIL on the head.
    if (read.comments.truncated) return { status: 'unknown', reason: 'comments_truncated', evidence_url: null };
    const newest = passes.reduce((latest, record) => (record.created_at >= latest.created_at ? record : latest));
    return { status: 'accepted', via: 'record', accepted_at: newest.created_at, evidence_url: newest.url };
  }
  if (records.length === 0 && read.comments.truncated) return { status: 'unknown', reason: 'comments_truncated', evidence_url: null };
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
      // A closed issue outside this board has no observed tier, so it withholds the Low path.
      acceptance: acceptance(read, check, closes.map(number => tiers.get(number) ?? null)),
      merge_readiness: readiness ?? null,
    });
  }).sort((left, right) => left.number - right.number);
  if (input.path_owners.status === 'observed') {
    const owned = new Set(input.path_owners.owners.map(owner => owner.path));
    const missing = pullRequests.filter(pr => pr.state === 'open').flatMap(pr => pr.files ?? []).find(path => !owned.has(path));
    if (missing !== undefined) throw new Error(`board input has no path owner for ${missing}`);
  }
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
    acceptance_merge: input.acceptance_merge,
    parent: Object.freeze({ number: parent.number, title: parent.title, url: parent.url, state: parent.state, labels: parent.labels, milestone: parent.milestone }),
    plan: projectPlan(parent),
    items: Object.freeze(items),
    pull_requests: Object.freeze(pullRequests),
    path_owners: input.path_owners,
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
