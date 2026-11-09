import { parseClosingReferences } from '../publication/closing-references';
import type { AcceptanceMergeSwitch } from '../publication/acceptance-merge-policy';
import type { PullRequestReadinessV2 } from '../publication/merge-readiness';
import { isSeatStatusMessage, seatStatusMessage } from './advisor-seat';
import { readMergeHold, type BoardMergeHoldV1 } from './merge';
import { decodePlanBlock, PlanBlockError, type PlanBlockV1 } from './plan-block';
import {
  BoardSourceError,
  commentId,
  field,
  newestProtocolComment,
  parseAcceptanceRecord,
  parseClaimStatus,
  parseRefs,
  protocolComments,
  type BoardCommentV1,
  type BoardParentReadV1,
  type BoardPullRequestReadV1,
  type AcceptanceRowV1,
  type BoardSubIssueReadV1,
  type ClaimStatusV1,
} from './source';
import { isCiRepairIssueBody } from '../ci/test-report';
import { pathHazardHits, pathHighHits } from './hazards';

/**
 * The board: one parent issue, its sub-issues and their pull requests, the
 * hc seat terminals that work on them, the daily full run and the hc pin.
 * It is a read model. GitHub and hc stay the authorities; the board keeps
 * their observation time and never writes back.
 */
export const BOARD_PROTOCOL = 4 as const;
export const BOARD_KIND = 'repo-harness.board' as const;

export type BoardTier = 'low' | 'medium' | 'high';
const TIER_LABELS: Readonly<Record<string, BoardTier>> = { 'tier:low': 'low', 'tier:medium': 'medium', 'tier:high': 'high' };
const PLAN_HEADER = 'repo-harness plan';
const CLAIM_HEADER = 'repo-harness issue claim';
const CLAIM_STATUS_HEADER = 'repo-harness issue claim status';
export const ACCEPTANCE_RECORD_HEADER = 'repo-harness acceptance record';
const ACCEPTANCE_CLAIM_HEADER = 'repo-harness acceptance claim';
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
  readonly merge_hold: BoardMergeHoldV1;
}

export type BoardRequiredCheckV1 =
  | { readonly status: 'success' | 'failure'; readonly completed_at: string }
  | { readonly status: 'pending' | 'missing' };

export type BoardAcceptanceV1 =
  /**
   * `record`: an acceptance record has a PASS row for the head and no record has a FAIL row for it; an open High or unknown-tier pull request
   * also needs PASS rows of two distinct claims, one recorded `different-family`; an open Medium one needs one claimed PASS row recorded `different-family` (`acceptor.md` section 2.2). `tier_low`: every closed issue is `tier:low` and `Required / CI` passed. */
  | { readonly status: 'accepted'; readonly via: 'record' | 'tier_low'; readonly accepted_at: string; readonly evidence_url: string }
  /** `record` on the rows of `carried_from`, an earlier reviewed head of which the head is a merge-only sync (#2074). */
  | { readonly status: 'accepted'; readonly via: 'sync'; readonly carried_from: string; readonly accepted_at: string; readonly evidence_url: string }
  | { readonly status: 'not_accepted' }
  | { readonly status: 'unknown'; readonly reason: 'acceptance_record_unparsed' | 'comments_truncated'; readonly evidence_url: string | null };

export type BoardClaudeReviewV1 = 'not_required' | 'pending' | 'recorded';

/** The model family of a writer runtime. A Pi seat runs any model, so its runtime names no family. */
export type BoardWriterFamily = 'anthropic' | 'openai';
const RUNTIME_FAMILIES: ReadonlyMap<string, BoardWriterFamily> = new Map([['claude', 'anthropic'], ['codex', 'openai']]);

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
  /** `high` when a changed path is on the High list or the change hazard list, or the file list is incomplete; otherwise the highest review tier of the linked issues (the parent excluded), null when the pull request links none, or one is outside the board or has no tier label. */
  readonly tier: BoardTier | null;
  /**
   * An unknown tier counts as High here (fail closed). `pending`: an open High pull request whose head does not meet the High acceptance rule and has no acceptance row
   * from a Claude reviewer. `recorded`: such a row exists. `not_required` for any other pull request, and for a High head that meets the rule without a Claude row.
   * The rows of an earlier head of which the head is a proven merge-only sync count as rows of the head (#2074).
   */
  readonly claude_review: BoardClaudeReviewV1;
  /**
   * The family of the `Runtime:` that the newest writer claim bound to the head branch names, the same on every linked issue (the parent
   * excluded); null when a linked issue has no such claim, a runtime names no family, or the issues disagree. It selects the Medium review
   * seat only: the record's `Model relation:` line stays the authority of acceptance.
   */
  readonly writer_family: BoardWriterFamily | null;
  readonly merge_hold: BoardMergeHoldV1;
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
  /** The hold record on the parent: it holds the whole batch, or the issues of its `Issues:` line. */
  readonly merge_hold: BoardMergeHoldV1;
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
  /** For each open pull request, the candidates of `syncCarryCandidates` that git proved to be merge-only syncs of the head (`provenMergeOnlySyncs`). */
  readonly merge_only_syncs: ReadonlyMap<number, readonly string[]>;
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
  for (const pr of board.pull_requests ?? []) {
    const { acceptance } = pr;
    if (acceptance?.status === 'accepted' && acceptance.via === 'sync' && !/^[0-9a-f]{40}$/u.test(String(acceptance.carried_from))) {
      throw new Error(`invalid board carried_from on PR #${pr.number}: ${String(acceptance.carried_from)}`);
    }
  }
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

/**
 * The capability that owns the hook paths. The owner approves a hook diff for one exact head, and a joint decision cannot carry that
 * approval to a sync head (#2048), so a pull request that changes one of its paths never carries an acceptance.
 */
const OWNER_APPROVED_CAPABILITY = 'capability.runtime-harness.hook-adapters';

/**
 * The earlier reviewed heads that could carry their acceptance rows to the head of an open pull request (#2074): every other subject
 * with a record row, PASS or FAIL. Git proves which of them the head is a merge-only sync of (`provenMergeOnlySyncs`), and
 * `reviewedSubjects` selects the carry source among them. None when a row fails the head, the file list is incomplete, the path owners
 * are unknown, or a changed path is a hook path or ambiguous.
 */
export function syncCarryCandidates(read: BoardPullRequestReadV1, owners: BoardPathOwnersV1): readonly string[] {
  if (read.state !== 'open' || read.files === null || owners.status !== 'observed') return [];
  const files = new Set(read.files);
  if (owners.owners.some(owner => files.has(owner.path) && (owner.status === 'ambiguous' || (owner.status === 'owned' && owner.capability === OWNER_APPROVED_CAPABILITY)))) return [];
  const rows = protocolComments(read.comments, ACCEPTANCE_RECORD_HEADER).flatMap(record => parseAcceptanceRecord(record) ?? []);
  if (rows.some(row => row.verdict === 'FAIL' && row.subject_sha === read.head_sha)) return [];
  return [...new Set(rows.filter(row => row.subject_sha !== read.head_sha).map(row => row.subject_sha))];
}

/**
 * The head, and the newest proven reviewed head when it can carry: the subject of the newest record with a row of a proven head. Only
 * its rows count with the rows of the head, so reviews split across older heads never add up. A FAIL row on any proven head, earlier or
 * later than a PASS, stops the carry.
 */
function reviewedSubjects(read: BoardPullRequestReadV1, owners: BoardPathOwnersV1, proven: readonly string[]): ReadonlySet<string> {
  const syncs = new Set(syncCarryCandidates(read, owners).filter(sha => proven.includes(sha)));
  const records = protocolComments(read.comments, ACCEPTANCE_RECORD_HEADER)
    .map(record => ({ created_at: record.created_at, rows: (parseAcceptanceRecord(record) ?? []).filter(row => syncs.has(row.subject_sha)) }))
    .filter(record => record.rows.length > 0);
  if (records.length === 0 || records.some(record => record.rows.some(row => row.verdict === 'FAIL'))) return new Set([read.head_sha]);
  const newest = records.reduce((latest, record) => (record.created_at >= latest.created_at ? record : latest));
  return new Set([read.head_sha, newest.rows.at(-1)!.subject_sha]);
}

function acceptance(read: BoardPullRequestReadV1, subjects: ReadonlySet<string>, check: BoardRequiredCheckV1, closedTiers: readonly (BoardTier | null)[], rule: ReviewRule): BoardAcceptanceV1 {
  // One round is one subject SHA, and a High round has two reviews of it (`acceptor.md`, section 2): every record counts.
  const records = protocolComments(read.comments, ACCEPTANCE_RECORD_HEADER);
  const passes: { readonly record: BoardCommentV1; readonly subject: string }[] = [];
  const head: AcceptanceRowV1[] = [];
  let failed = false;
  for (const record of records) {
    const rows = parseAcceptanceRecord(record);
    if (rows === null) return { status: 'unknown', reason: 'acceptance_record_unparsed', evidence_url: record.url };
    const own = rows.filter(row => subjects.has(row.subject_sha));
    head.push(...own);
    if (own.some(row => row.verdict === 'FAIL')) failed = true;
    else if (own.length > 0) passes.push({ record, subject: own.some(row => row.subject_sha === read.head_sha) ? read.head_sha : own[0]!.subject_sha });
  }
  if (!failed && passes.length > 0) {
    // An older comment outside the read can hold a FAIL on the head.
    if (read.comments.truncated) return { status: 'unknown', reason: 'comments_truncated', evidence_url: null };
    if (rule === 'none' || (rule === 'medium' ? mediumRuleMet(read, head) : highRuleMet(read, head))) {
      // A head that has its own PASS row is accepted on its newest own record; otherwise the newest carried record names its reviewed head.
      const own = passes.filter(pass => pass.subject === read.head_sha);
      const newest = (own.length > 0 ? own : passes).reduce((latest, pass) => (pass.record.created_at >= latest.record.created_at ? pass : latest));
      const accepted = { accepted_at: newest.record.created_at, evidence_url: newest.record.url };
      if (own.length > 0) return { status: 'accepted', via: 'record', ...accepted };
      return { status: 'accepted', via: 'sync', carried_from: newest.subject, ...accepted };
    }
  }
  if (records.length === 0 && read.comments.truncated) return { status: 'unknown', reason: 'comments_truncated', evidence_url: null };
  // A Low pull request has no accept seat (`agentic-development-flow.md`, Review by risk).
  if (check.status === 'success' && closedTiers.length > 0 && closedTiers.every(tier => tier === 'low')) {
    return { status: 'accepted', via: 'tier_low', accepted_at: check.completed_at, evidence_url: read.url };
  }
  return { status: 'not_accepted' };
}

/**
 * The rows of the head whose `Claim:` cites an `acceptance claim` comment of the pull request with the row's `Subject:` and `Round:`
 * (`review publish` writes both); the comment id is the claim identity.
 */
function claimedRows(read: BoardPullRequestReadV1, head: readonly AcceptanceRowV1[]): AcceptanceRowV1[] {
  const claims = new Map(protocolComments(read.comments, ACCEPTANCE_CLAIM_HEADER).map(claim => [commentId(claim.url), `${field(claim.body, 'Round')} ${field(claim.body, 'Subject')}`] as const));
  return head.filter(row => row.claim !== null && claims.get(row.claim) === `${row.round} ${row.subject_sha}`);
}

/**
 * The High rule (`acceptor.md` section 2.2), for High and unknown tiers: claimed PASS rows of the head from two distinct review claims,
 * and at least one of them recorded `Model relation: different-family` to the writer. An unknown writer family records `unknown`,
 * so it fails closed. A head with a `FAIL` row does not meet the rule.
 */
function highRuleMet(read: BoardPullRequestReadV1, head: readonly AcceptanceRowV1[]): boolean {
  if (head.some(row => row.verdict === 'FAIL')) return false;
  const passes = claimedRows(read, head);
  return new Set(passes.map(row => row.claim)).size >= 2 && passes.some(row => row.different_family);
}

/** The Medium rule (`acceptor.md` section 2.2): one claimed PASS row of the head recorded `different-family`; `unknown` never counts. `acceptance` has ruled out a `FAIL` row. */
function mediumRuleMet(read: BoardPullRequestReadV1, head: readonly AcceptanceRowV1[]): boolean {
  return claimedRows(read, head).some(row => row.different_family);
}

/** The review rule of a pull request: `high` for an open pull request of High or unknown tier, `medium` for an open Medium one, `none` otherwise. */
type ReviewRule = 'high' | 'medium' | 'none';
function reviewRule(read: BoardPullRequestReadV1, tier: BoardTier | null): ReviewRule {
  if (read.state !== 'open') return 'none';
  return tier === null || tier === 'high' ? 'high' : tier === 'medium' ? 'medium' : 'none';
}

/**
 * The one effective tier of a pull request, for the Low acceptance path and the review planner alike. A changed path on the High
 * list or the change hazard list sets High whatever the labels say (`agentic-development-flow.md`, Review by risk); R3 and R5 name
 * the labels to fix. An incomplete file list can hide such a path, so it sets High too. Otherwise null unless every linked issue
 * (the parent excluded) is on the board with a tier label.
 */
function effectiveTier(closes: readonly number[], refs: readonly number[], files: readonly string[] | null, parent: BoardParentReadV1, tiers: ReadonlyMap<number, BoardTier | null>): BoardTier | null {
  if (files === null || pathHighHits(files).length > 0 || pathHazardHits(files).length > 0) return 'high';
  const linked = [...new Set([...closes, ...refs])].filter(number => number !== parent.parent.number);
  const known = linked.map(number => tiers.get(number) ?? null);
  return linked.length === 0 || known.includes(null) ? null : known.includes('high') ? 'high' : known.includes('medium') ? 'medium' : 'low';
}

/**
 * The Claude review state of a pull request: a projection of the High rule, not a second rule. `recorded`: a Claude reviewer has a row
 * for the head. `pending`: the High rule is not met for the head and no Claude row exists, so the Claude reviewer seat supplies the
 * missing review (the second review for a Claude writer, the different-family review for any other writer).
 */
function claudeReview(read: BoardPullRequestReadV1, subjects: ReadonlySet<string>, tier: BoardTier | null): BoardClaudeReviewV1 {
  if (reviewRule(read, tier) !== 'high') return 'not_required';
  const head = protocolComments(read.comments, ACCEPTANCE_RECORD_HEADER).flatMap(record => parseAcceptanceRecord(record) ?? []).filter(row => subjects.has(row.subject_sha));
  if (head.some(row => row.harness === 'claude')) return 'recorded';
  return highRuleMet(read, head) ? 'not_required' : 'pending';
}

/** The writer family of a pull request (`BoardPullRequestV1.writer_family`). */
function writerFamily(read: BoardPullRequestReadV1, closes: readonly number[], refs: readonly number[], parent: BoardParentReadV1): BoardWriterFamily | null {
  const issues = new Map(parent.sub_issues.map(issue => [issue.number, issue]));
  const linked = [...new Set([...closes, ...refs])].filter(number => number !== parent.parent.number);
  const families = new Set(linked.map((number) => {
    const issue = issues.get(number);
    if (issue === undefined) return null;
    const claims = protocolComments(issue.comments, CLAIM_HEADER).filter(claim => field(claim.body, 'Role') === 'writer' && field(claim.body, 'Branch') === read.head_ref);
    const newest = claims.length === 0 ? null : newestProtocolComment({ ...issue.comments, comments: claims }, CLAIM_HEADER);
    return newest === null ? null : RUNTIME_FAMILIES.get(field(newest.body, 'Runtime') ?? '') ?? null;
  }));
  const [family] = families;
  return families.size === 1 && family !== undefined ? family : null;
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
    const tier = effectiveTier(closes, refs, read.files, input.parent, tiers);
    const subjects = reviewedSubjects(read, input.path_owners, input.merge_only_syncs.get(read.number) ?? []);
    const claude = claudeReview(read, subjects, tier);
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
      // An issue outside this board has no observed tier, so it withholds the Low path; so does any non-Low linked issue.
      acceptance: acceptance(read, subjects, check, [tier], reviewRule(read, tier)),
      merge_readiness: readiness ?? null,
      tier,
      claude_review: claude,
      writer_family: writerFamily(read, closes, refs, input.parent),
      merge_hold: readMergeHold(read.comments, false),
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
    merge_hold: readMergeHold(issue.comments, false),
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
    merge_hold: readMergeHold(parent.comments, true),
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
