import { planIssues } from './plan-block';
import { boardMergeDecisions } from './merge';
import type { BoardItemV1, BoardPullRequestV1, BoardReviewHarness, BoardTerminalV1, BoardV1 } from './board';
import { hcStatusClass, liveSeats, seatItem, seatPullRequest } from './desk';
import { pathHazardHits, pathHighHits } from './hazards';
import { compareHcVersions } from '../terminal/herdr-pin';
import { WORKER_SEAT_IDS } from './seats-settings';

/**
 * Attention rules over one board. Each rule is a pure function of the board
 * and its observation time. A rules route to the orchestrator seat, R rules
 * to the advisor seat. A rule whose input is unavailable is listed as
 * unevaluated with the reason; it never fires on a guess.
 */
export const BOARD_ATTENTION_PROTOCOL = 2 as const;
export const BOARD_ATTENTION_KIND = 'repo-harness.board-attention' as const;

const MINUTE = 60_000;
/** A1: an accepted, ready pull request waits this long unmerged. */
export const A1_UNMERGED_MS = 15 * MINUTE;
/** A3: a worker seat stays blocked or in error this long. */
export const A3_STUCK_MS = 10 * MINUTE;
/** A12: a writer claim has no pull request and no claim status for this long. */
export const A12_NO_PR_MS = 120 * MINUTE;
/** A13: a worker seat is done or idle this long while its item has no open or merged pull request. A19 reads a review seat with the same bound. */
export const A13_IDLE_MS = 10 * MINUTE;
/** A14: the failed required check of an open pull request is this old. */
export const A14_RED_MS = 30 * MINUTE;
/** A20: the required check of an open pull request is pending or missing this long after its head commit. A run of this repository ends in 10 to 20 min. */
export const A20_STUCK_MS = 60 * MINUTE;
/** A15: an unresolved FAIL record of the head is this old. */
export const A15_FAIL_MS = 60 * MINUTE;
/** A16: a question to the coordinator has no answer for this long. */
export const A16_QUESTION_MS = 15 * MINUTE;
/** A17: a blocked claim status is this old. */
export const A17_BLOCKED_MS = 15 * MINUTE;
/** R1: this many open items are not in the latest plan. */
export const R1_UNPLANNED_ITEMS = 3;
/** R4: an accepted pull request in the merge order waits this long unmerged. */
export const R4_STALLED_MS = 4 * 60 * MINUTE;
/** R6: a free worker seat and fewer ready issues than this. The weekly threshold review changes it. */
export const R6_READY_MIN = 2;
const WORKER_SEATS = new Set<string>(WORKER_SEAT_IDS);
/** The review seat ids of the seats config; the gatekeeper-fallback seat launches under the gatekeeper label (#2253). */
const REVIEW_SEATS = new Set<string>(['gatekeeper', 'gatekeeper-fallback', 'reviewer']);
/** The hc agent name of each review runtime. */
const AGENT_HARNESS: ReadonlyMap<string, BoardReviewHarness> = new Map([['claude-code', 'claude'], ['codex', 'codex'], ['pi', 'pi']]);
const RED_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);

export type BoardRuleId = 'A1' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9' | 'A10' | 'A11' | 'A12' | 'A13' | 'A14' | 'A15' | 'A16' | 'A17' | 'A18' | 'A19' | 'A20' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';
export type BoardAttentionRoute = 'orchestrator' | 'advisor';
/** P0: a seat cannot continue. P1: a worker or an issue waits for the coordinator, or a High change has a lower tier. P2: a pull request or the plan waits. P3: housekeeping. */
export type BoardPriority = 'P0' | 'P1' | 'P2' | 'P3';
/** Highest first. A delivery entry and a `board attention` line print the priority of their finding. */
export const BOARD_PRIORITY_ORDER: readonly BoardPriority[] = Object.freeze(['P0', 'P1', 'P2', 'P3']);
/**
 * The priority of each rule, the only source of a finding's priority. The
 * record names every rule, so a new rule without a priority fails the
 * typecheck. The skill text reads the priority from the message; it keeps no
 * copy of this table.
 */
export const BOARD_RULE_PRIORITY: Readonly<Record<BoardRuleId, BoardPriority>> = Object.freeze({
  A1: 'P2', A3: 'P0', A4: 'P1', A5: 'P1', A6: 'P1', A7: 'P2', A8: 'P3', A9: 'P3', A10: 'P2', A11: 'P2',
  A12: 'P1', A13: 'P1', A14: 'P2', A15: 'P2', A16: 'P1', A17: 'P1', A18: 'P2', A19: 'P1', A20: 'P2',
  R1: 'P2', R2: 'P2', R3: 'P1', R4: 'P2', R5: 'P1', R6: 'P1', R7: 'P2',
});

export interface BoardFindingV1 {
  readonly rule: BoardRuleId;
  readonly priority: BoardPriority;
  readonly route: BoardAttentionRoute;
  readonly issues: readonly number[];
  readonly pull_requests: readonly number[];
  readonly terminals: readonly string[];
  /** The comment URLs the finding is about: an A16 finding names its question, so each question is its own finding. */
  readonly comments: readonly string[];
  readonly message: string;
}

export interface BoardUnevaluatedV1 {
  readonly rule: BoardRuleId;
  readonly reason: string;
  readonly subject: string | null;
}

export interface BoardAttentionV1 {
  readonly protocol: typeof BOARD_ATTENTION_PROTOCOL;
  readonly kind: typeof BOARD_ATTENTION_KIND;
  readonly parent: number;
  readonly observed_at: string;
  readonly findings: readonly BoardFindingV1[];
  readonly unevaluated: readonly BoardUnevaluatedV1[];
}

interface Context {
  readonly board: BoardV1;
  readonly now: number;
  readonly findings: BoardFindingV1[];
  readonly unevaluated: BoardUnevaluatedV1[];
}

function find(context: Context, rule: BoardRuleId, subject: { issues?: number[]; pull_requests?: number[]; terminals?: string[]; comments?: string[] }, message: string): void {
  context.findings.push(Object.freeze({
    rule,
    priority: BOARD_RULE_PRIORITY[rule],
    route: rule.startsWith('A') ? 'orchestrator' : 'advisor',
    issues: Object.freeze(subject.issues ?? []),
    pull_requests: Object.freeze(subject.pull_requests ?? []),
    terminals: Object.freeze(subject.terminals ?? []),
    comments: Object.freeze(subject.comments ?? []),
    message,
  }));
}

function skip(context: Context, rule: BoardRuleId, reason: string, subject: string | null = null): void {
  context.unevaluated.push(Object.freeze({ rule, reason, subject }));
}

const minutes = (ms: number): number => Math.floor(ms / MINUTE);

function itemsOf(board: BoardV1, pr: BoardPullRequestV1): number[] {
  const items = new Set(board.items.map(item => item.number));
  return [...new Set([...pr.closes, ...pr.refs])].filter(number => items.has(number)).sort((left, right) => left - right);
}

/** A dependency edge: one pull request stacks on the other, or one of its items is blocked by an item of the other. */
function hasEdge(board: BoardV1, left: BoardPullRequestV1, right: BoardPullRequestV1): boolean {
  if (left.base_ref === right.head_ref || right.base_ref === left.head_ref) return true;
  const leftItems = itemsOf(board, left);
  const rightItems = itemsOf(board, right);
  return board.items.some(item => (leftItems.includes(item.number) && item.blocked_by.some(blocker => rightItems.includes(blocker.number)))
    || (rightItems.includes(item.number) && item.blocked_by.some(blocker => leftItems.includes(blocker.number))));
}

function openPullRequests(board: BoardV1): BoardPullRequestV1[] {
  return board.pull_requests.filter(pr => pr.state === 'open');
}

/** A pull request with an item that the plan block holds. The hold is a decision, so the merge rules skip it. */
function held(board: BoardV1, pr: BoardPullRequestV1): boolean {
  if (board.plan.status !== 'observed') return false;
  const holds = new Set(board.plan.block.holds.map(hold => hold.issue));
  return itemsOf(board, pr).some(number => holds.has(number));
}

/** Open, not held pull requests with a known acceptance. An unknown one is listed for each rule that needs it. */
function accepted(context: Context, rule: BoardRuleId): (BoardPullRequestV1 & { readonly acceptance: { readonly status: 'accepted'; readonly accepted_at: string } })[] {
  return unheld(context.board).flatMap((pr) => {
    if (pr.acceptance.status === 'unknown') {
      skip(context, rule, pr.acceptance.reason, `#${pr.number}`);
      return [];
    }
    return pr.acceptance.status === 'accepted' ? [pr as BoardPullRequestV1 & { readonly acceptance: { readonly status: 'accepted'; readonly accepted_at: string } }] : [];
  });
}

function a1(context: Context): void {
  for (const pr of accepted(context, 'A1')) {
    const waited = context.now - Date.parse(pr.acceptance.accepted_at);
    if (pr.merge_readiness?.ready === true && waited > A1_UNMERGED_MS) {
      find(context, 'A1', { issues: itemsOf(context.board, pr), pull_requests: [pr.number] },
        `#${pr.number} is accepted and ready, unmerged for ${minutes(waited)} min`);
    }
  }
}

type SeatTerminal = BoardTerminalV1 & { readonly seat_status: 'observed' };

function workerTerminals(context: Context, rule: BoardRuleId): SeatTerminal[] {
  return seatTerminals(context, rule, WORKER_SEATS);
}

function seatTerminals(context: Context, rule: BoardRuleId, seats: ReadonlySet<string>): SeatTerminal[] {
  const execution = context.board.execution;
  if (execution.status === 'unavailable') {
    skip(context, rule, execution.reason);
    return [];
  }
  return execution.terminals.flatMap((terminal) => {
    if (terminal.seat_status === 'unavailable') {
      skip(context, rule, terminal.reason, terminal.address);
      return [];
    }
    return seats.has(terminal.seat) && terminal.state === 'live' ? [terminal] : [];
  });
}

function a3(context: Context): void {
  for (const terminal of workerTerminals(context, 'A3')) {
    const word = hcStatusClass(terminal.status);
    if (word !== 'blocked' && word !== 'error') continue;
    if (terminal.status_ms === null) {
      skip(context, 'A3', 'status_time_missing', terminal.address);
    } else if (context.now - terminal.status_ms > A3_STUCK_MS) {
      find(context, 'A3', { issues: terminal.issue === null ? [] : [terminal.issue], terminals: [terminal.address] },
        `worker ${terminal.address} is ${terminal.status} for ${minutes(context.now - terminal.status_ms)} min`);
    }
  }
}

function a4(context: Context): void {
  for (const terminal of workerTerminals(context, 'A4')) {
    const word = hcStatusClass(terminal.status);
    if (word !== 'done' && word !== 'idle') continue;
    if (terminal.issue === null) {
      skip(context, 'A4', 'issue_label_missing', terminal.address);
      continue;
    }
    const item = context.board.items.find(entry => entry.number === terminal.issue);
    if (item === undefined) {
      skip(context, 'A4', 'issue_off_board', terminal.address);
      continue;
    }
    const prs = context.board.pull_requests.filter(pr => pr.state === 'open' && (terminal.pr === null ? item.pull_requests.includes(pr.number) : pr.number === terminal.pr));
    if (prs.length === 0) continue;
    const lastCommit = prs.map(pr => pr.head_committed_at).sort().at(-1)!;
    if (item.claim_status.status_kind === 'unknown') {
      skip(context, 'A4', 'comments_truncated', `#${item.number}`);
    } else if (item.claim_status.status_kind === 'none' || item.claim_status.created_at < lastCommit) {
      find(context, 'A4', { issues: [item.number], pull_requests: prs.map(pr => pr.number), terminals: [terminal.address] },
        `worker ${terminal.address} is ${terminal.status} and #${item.number} has no claim status after its last commit (${lastCommit})`);
    }
  }
}

function a5(context: Context): void {
  for (const item of context.board.items) {
    const status = item.claim_status;
    if (status.status_kind !== 'observed' || status.pr === null || !/^done\b/u.test(status.status)) continue;
    const pr = context.board.pull_requests.find(entry => entry.number === status.pr);
    if (pr === undefined) {
      skip(context, 'A5', 'claim_pr_off_board', `#${item.number}`);
    } else if (pr.state !== 'merged') {
      find(context, 'A5', { issues: [item.number], pull_requests: [pr.number] },
        `#${item.number} claim status says done, but #${pr.number} is ${pr.state} (${status.url})`);
    }
  }
}

function cycles(items: readonly BoardItemV1[]): number[][] {
  const edges = new Map(items.map(item => [item.number, item.blocked_by.map(blocker => blocker.number)] as const));
  const found = new Map<string, number[]>();
  const walk = (start: number, current: number, path: number[]): void => {
    for (const next of edges.get(current) ?? []) {
      if (next === start) {
        const cycle = [...path].sort((left, right) => left - right);
        found.set(cycle.join(','), cycle);
      } else if (!path.includes(next) && edges.has(next)) {
        walk(start, next, [...path, next]);
      }
    }
  };
  for (const item of items) walk(item.number, item.number, [item.number]);
  return [...found.values()];
}

function a6(context: Context): void {
  for (const item of context.board.items.filter(entry => entry.state === 'open')) {
    const closed = item.blocked_by.filter(blocker => blocker.state === 'closed').map(blocker => blocker.number);
    if (closed.length > 0) {
      find(context, 'A6', { issues: [item.number, ...closed] }, `#${item.number} is blocked by closed ${closed.map(number => `#${number}`).join(', ')}`);
    }
  }
  for (const cycle of cycles(context.board.items)) {
    find(context, 'A6', { issues: cycle }, `blocked-by cycle: ${cycle.map(number => `#${number}`).join(' ')}`);
  }
}

function a7(context: Context): void {
  const run = context.board.daily_run;
  if (run.status === 'unavailable') return skip(context, 'A7', run.reason);
  if (run.conclusion !== null && RED_CONCLUSIONS.has(run.conclusion) && run.open_repair_issues.length === 0) {
    find(context, 'A7', {}, `the daily full run is ${run.conclusion} (${run.run_url}) and no CI repair issue is open`);
  }
}

function a8(context: Context): void {
  const hc = context.board.tooling.hc;
  if (hc.status === 'unavailable') return skip(context, 'A8', hc.reason);
  if (compareHcVersions(hc.version, hc.min_version) < 0) find(context, 'A8', {}, `hc client ${hc.version} is below the repo-harness floor ${hc.min_version}; run hc update --version ${hc.min_version}`);
}

/** A9: a seat of a merged pull request is still open; the post-merge closeout closed it or kept it with a reason (#2005). */
function a9(context: Context): void {
  const execution = context.board.execution;
  if (execution.status === 'unavailable') return skip(context, 'A9', execution.reason);
  for (const terminal of liveSeats(execution.terminals)) {
    if (terminal.issue === null && terminal.pr === null) continue;
    const pr = seatPullRequest(context.board, terminal, seatItem(context.board, terminal));
    if (pr?.state !== 'merged') continue;
    find(context, 'A9', { issues: terminal.issue === null ? [] : [terminal.issue], pull_requests: [pr.number], terminals: [terminal.address] },
      `${terminal.seat} ${terminal.address} of merged #${pr.number} is still open; run repo-harness board closeout --pr ${pr.number}`);
  }
}

/** A10: an open High pull request whose head does not meet the High acceptance rule has no Claude reviewer row for its head (`claude_review: pending`). No merge gate holds it, so the board does. */
function a10(context: Context): void {
  for (const pr of openPullRequests(context.board).filter(entry => !entry.is_draft && entry.claude_review === 'pending')) {
    find(context, 'A10', { issues: itemsOf(context.board, pr), pull_requests: [pr.number] },
      `#${pr.number} is ${pr.tier === null ? 'of unknown tier (counted as High)' : 'High tier'} and has no Claude review of ${pr.head_sha.slice(0, 9)}; start the Claude reviewer seat`);
  }
}

/** A11: an open pull request meets every `board merge` condition. The watcher only wakes the orchestrator; the merge starts from its seat. */
function a11(context: Context): void {
  for (const decision of boardMergeDecisions(context.board).filter(entry => entry.eligible)) {
    const pr = context.board.pull_requests.find(entry => entry.number === decision.pr)!;
    find(context, 'A11', { issues: itemsOf(context.board, pr), pull_requests: [pr.number] },
      `eligible: run repo-harness board merge --parent ${context.board.parent.number} --pr ${pr.number}`);
  }
}

/** A12: a writer holds an open item with no pull request and no claim status after the claim. */
function a12(context: Context): void {
  for (const item of context.board.items.filter(entry => entry.state === 'open')) {
    const { claim, claim_status: status } = item;
    if (claim.status === 'unknown') {
      skip(context, 'A12', 'comments_truncated', `#${item.number}`);
      continue;
    }
    if (claim.status !== 'active' || claim.role !== 'writer' || item.pull_requests.length > 0) continue;
    // The claim is in the read, so a later status is too: an unknown status holds none after the claim.
    if (status.status_kind === 'observed' && status.created_at > claim.created_at) continue;
    const waited = context.now - Date.parse(claim.created_at);
    if (waited > A12_NO_PR_MS) {
      find(context, 'A12', { issues: [item.number] }, `#${item.number} has a writer claim for ${minutes(waited)} min, no PR and no claim status (${claim.url})`);
    }
  }
}

/** A13: a worker seat is done or idle and its item has no open or merged pull request; A4 reads the seat once a pull request is open. */
function a13(context: Context): void {
  for (const terminal of workerTerminals(context, 'A13')) {
    const word = hcStatusClass(terminal.status);
    if (word !== 'done' && word !== 'idle') continue;
    if (terminal.issue === null) {
      skip(context, 'A13', 'issue_label_missing', terminal.address);
      continue;
    }
    const item = context.board.items.find(entry => entry.number === terminal.issue);
    if (item === undefined) {
      skip(context, 'A13', 'issue_off_board', terminal.address);
      continue;
    }
    if (context.board.pull_requests.some(pr => item.pull_requests.includes(pr.number) && pr.state !== 'closed')) continue;
    if (terminal.status_ms === null) {
      skip(context, 'A13', 'status_time_missing', terminal.address);
    } else if (context.now - terminal.status_ms > A13_IDLE_MS) {
      find(context, 'A13', { issues: [item.number], terminals: [terminal.address] },
        `worker ${terminal.address} is ${terminal.status} for ${minutes(context.now - terminal.status_ms)} min and #${item.number} has no PR`);
    }
  }
}

/**
 * A19: a review seat is done or idle on an open pull request that has no record of the seat's harness after the seat's status time.
 * A seat without the `net` tool cannot publish its row, and only the session that started it reads the pane (`acceptor.md`).
 */
function a19(context: Context): void {
  for (const terminal of seatTerminals(context, 'A19', REVIEW_SEATS)) {
    const word = hcStatusClass(terminal.status);
    if (word !== 'done' && word !== 'idle') continue;
    if (terminal.pr === null) {
      skip(context, 'A19', 'pr_label_missing', terminal.address);
      continue;
    }
    const pr = context.board.pull_requests.find(entry => entry.number === terminal.pr);
    if (pr === undefined) {
      skip(context, 'A19', 'pr_off_board', terminal.address);
      continue;
    }
    if (pr.state !== 'open') continue;
    if (terminal.status_ms === null) {
      skip(context, 'A19', 'status_time_missing', terminal.address);
      continue;
    }
    if (context.now - terminal.status_ms <= A13_IDLE_MS) continue;
    const harness = terminal.agent === null ? undefined : AGENT_HARNESS.get(terminal.agent);
    if (harness === undefined) {
      skip(context, 'A19', 'harness_unknown', terminal.address);
      continue;
    }
    if (pr.review_records.status === 'unknown') {
      skip(context, 'A19', pr.review_records.reason, `#${pr.number}`);
      continue;
    }
    const recorded = pr.review_records[harness];
    if (recorded !== null && Date.parse(recorded) > terminal.status_ms) continue;
    find(context, 'A19', { issues: itemsOf(context.board, pr), pull_requests: [pr.number], terminals: [terminal.address] },
      `review seat ${terminal.address} is ${terminal.status} for ${minutes(context.now - terminal.status_ms)} min and #${pr.number} has no record from it; read the pane and publish`);
  }
}

/** Open pull requests that the plan does not hold. */
function unheld(board: BoardV1): BoardPullRequestV1[] {
  return openPullRequests(board).filter(pr => !held(board, pr));
}

/** A14: the required check of an open, ready-for-review pull request failed and stays red. */
function a14(context: Context): void {
  for (const pr of unheld(context.board).filter(entry => !entry.is_draft)) {
    const check = pr.required_check;
    if (check.status !== 'failure') continue;
    const waited = context.now - Date.parse(check.completed_at);
    if (waited > A14_RED_MS) {
      find(context, 'A14', { issues: itemsOf(context.board, pr), pull_requests: [pr.number] },
        `#${pr.number} has a failed required check on ${pr.head_sha.slice(0, 9)} for ${minutes(waited)} min`);
    }
  }
}

/** A20: the required check of an open, ready-for-review pull request stays pending or missing; the bound is the head commit time. */
function a20(context: Context): void {
  for (const pr of unheld(context.board).filter(entry => !entry.is_draft)) {
    const check = pr.required_check;
    if (check.status === 'unavailable') {
      skip(context, 'A20', check.reason, `#${pr.number}`);
      continue;
    }
    if (check.status !== 'pending' && check.status !== 'missing') continue;
    const waited = context.now - Date.parse(pr.head_committed_at);
    if (waited > A20_STUCK_MS) {
      const open = check.contexts.filter(entry => entry.status !== 'success').map(entry => entry.name).join(', ');
      find(context, 'A20', { issues: itemsOf(context.board, pr), pull_requests: [pr.number] },
        `#${pr.number} required check is ${check.status} for ${minutes(waited)} min after its head commit: ${open}`);
    }
  }
}

/** A15: an unresolved FAIL record of the head gets no new head. */
function a15(context: Context): void {
  for (const pr of unheld(context.board)) {
    if (pr.acceptance.status === 'unknown') {
      skip(context, 'A15', pr.acceptance.reason, `#${pr.number}`);
      continue;
    }
    if (pr.review_fail === null) continue;
    const waited = context.now - Date.parse(pr.review_fail.recorded_at);
    if (waited > A15_FAIL_MS) {
      find(context, 'A15', { issues: itemsOf(context.board, pr), pull_requests: [pr.number] },
        `#${pr.number} has a FAIL record on ${pr.head_sha.slice(0, 9)} for ${minutes(waited)} min and no new head (${pr.review_fail.url})`);
    }
  }
}

/** A16: a boundary question to the coordinator on an open item or an open pull request has no answer. */
function a16(context: Context): void {
  const threads = [
    ...context.board.items.filter(item => item.state === 'open').map(item => ({ number: item.number, questions: item.open_questions, subject: { issues: [item.number] } })),
    ...unheld(context.board).map(pr => ({ number: pr.number, questions: pr.open_questions, subject: { issues: itemsOf(context.board, pr), pull_requests: [pr.number] } })),
  ];
  for (const thread of threads) {
    if (thread.questions.status === 'unknown') {
      skip(context, 'A16', 'comments_truncated', `#${thread.number}`);
      continue;
    }
    for (const question of thread.questions.questions) {
      const waited = context.now - Date.parse(question.created_at);
      if (waited > A16_QUESTION_MS) {
        find(context, 'A16', { ...thread.subject, comments: [question.url] }, `#${thread.number} has a question to the coordinator with no answer for ${minutes(waited)} min (${question.url})`);
      }
    }
  }
}

/** A17: the claim status of an open item that the plan does not hold says blocked. An unobserved plan cannot rule out a hold. */
function a17(context: Context): void {
  const plan = context.board.plan;
  for (const item of context.board.items.filter(entry => entry.state === 'open')) {
    const status = item.claim_status;
    if (status.status_kind === 'unknown') {
      skip(context, 'A17', 'comments_truncated', `#${item.number}`);
      continue;
    }
    if (status.status_kind !== 'observed' || !status.status.startsWith('blocked')) continue;
    if (plan.status !== 'observed') {
      skip(context, 'A17', plan.status === 'absent' ? 'plan_absent' : 'plan_unavailable', `#${item.number}`);
      continue;
    }
    if (plan.block.holds.some(hold => hold.issue === item.number)) continue;
    const waited = context.now - Date.parse(status.created_at);
    if (waited > A17_BLOCKED_MS) {
      find(context, 'A17', { issues: [item.number] }, `#${item.number} claim status is blocked for ${minutes(waited)} min (${status.url})`);
    }
  }
}

/** A18: an open, ready-for-review pull request does not merge into its base. */
function a18(context: Context): void {
  for (const pr of unheld(context.board).filter(entry => !entry.is_draft)) {
    if (pr.merge_readiness === null) {
      skip(context, 'A18', 'readiness_missing', `#${pr.number}`);
    } else if (pr.merge_readiness.blockers.some(blocker => blocker.code === 'not_mergeable')) {
      find(context, 'A18', { issues: itemsOf(context.board, pr), pull_requests: [pr.number] },
        `#${pr.number} does not merge into ${pr.base_ref}; the head owner merges main into the branch`);
    }
  }
}

function r1(context: Context): void {
  const plan = context.board.plan;
  if (plan.status === 'unavailable') return skip(context, 'R1', 'plan_unavailable', plan.comment_url);
  if (plan.status === 'absent' && plan.truncated) return skip(context, 'R1', 'comments_truncated');
  const planned = plan.status === 'observed' ? planIssues(plan.block) : new Set<number>();
  const unplanned = context.board.items.filter(item => item.state === 'open' && !planned.has(item.number)).map(item => item.number);
  if (unplanned.length >= R1_UNPLANNED_ITEMS) {
    find(context, 'R1', { issues: unplanned }, `${unplanned.length} open items are not in the latest plan: ${unplanned.map(number => `#${number}`).join(' ')}`);
  }
}

function r2(context: Context): void {
  const open = openPullRequests(context.board);
  for (const pr of open.filter(entry => entry.files === null)) skip(context, 'R2', 'files_incomplete', `#${pr.number}`);
  const complete = open.filter(pr => pr.files !== null);
  for (const [index, left] of complete.entries()) {
    for (const right of complete.slice(index + 1)) {
      const shared = left.files!.filter(path => right.files!.includes(path));
      if (shared.length > 0 && !hasEdge(context.board, left, right)) {
        find(context, 'R2', { pull_requests: [left.number, right.number] },
          `#${left.number} and #${right.number} both change ${shared.slice(0, 3).join(', ')}${shared.length > 3 ? ` and ${shared.length - 3} more` : ''} with no dependency edge`);
      }
    }
  }
}

/**
 * A path rule over open pull requests (R3, R5): a pull request whose changed paths hit the list, with an item that it closes or
 * refs whose tier label is below High. One hit sets High (`agentic-development-flow.md`, Review by risk). A pull request without a
 * complete file list, or an item without a tier label, is unevaluated, never a miss.
 */
function belowHighOnHits(context: Context, rule: 'R3' | 'R5', hitsOf: (files: readonly string[]) => readonly { readonly path: string; readonly id: string }[], what: string): void {
  for (const pr of openPullRequests(context.board)) {
    if (pr.files === null) {
      skip(context, rule, 'files_incomplete', `#${pr.number}`);
      continue;
    }
    const hits = hitsOf(pr.files);
    if (hits.length === 0) continue;
    const items = itemsOf(context.board, pr).map(number => context.board.items.find(item => item.number === number)!);
    for (const item of items.filter(entry => entry.tier === null)) skip(context, rule, 'tier_label_missing', `#${pr.number} #${item.number}`);
    const below = items.filter(item => item.tier === 'low' || item.tier === 'medium');
    if (below.length > 0) {
      find(context, rule, { issues: below.map(item => item.number), pull_requests: [pr.number] },
        `#${pr.number} changes ${hits.slice(0, 3).map(hit => `${hit.path} (${hit.id})`).join(', ')}${hits.length > 3 ? ` and ${hits.length - 3} more` : ''}, ${what}, but ${below.map(item => `#${item.number} is tier:${item.tier}`).join(', ')}`);
    }
  }
}

/** R3: an open pull request changes a path on the change hazard list. */
function r3(context: Context): void {
  belowHighOnHits(context, 'R3', files => pathHazardHits(files).map(hit => ({ path: hit.path, id: hit.hazard })), 'a High hazard');
}

/** R5: an open pull request changes a path on the High list (permissions, hooks, secrets, deletion, release, merge and push). */
function r5(context: Context): void {
  belowHighOnHits(context, 'R5', files => pathHighHits(files).map(hit => ({ path: hit.path, id: hit.signal })), 'a High signal');
}

function r4(context: Context): void {
  const plan = context.board.plan;
  if (plan.status !== 'observed') return skip(context, 'R4', plan.status === 'absent' ? 'plan_absent' : 'plan_unavailable');
  const ordered = new Set(plan.block.merge_order);
  for (const pr of accepted(context, 'R4')) {
    const waited = context.now - Date.parse(pr.acceptance.accepted_at);
    if (itemsOf(context.board, pr).some(number => ordered.has(number)) && waited > R4_STALLED_MS) {
      find(context, 'R4', { issues: itemsOf(context.board, pr), pull_requests: [pr.number] },
        `#${pr.number} in the merge order is accepted and unmerged for ${minutes(waited)} min`);
    }
  }
}

/**
 * R6: a worker seat is free and the plan has fewer ready issues than `R6_READY_MIN`. Quota and route labels are not read: an issue that
 * no seat can take still counts as ready, and `board dispatch --dry-run` gives that reason.
 */
function r6(context: Context): void {
  const { plan, items } = context.board;
  if (plan.status !== 'observed') return skip(context, 'R6', plan.status === 'absent' ? 'plan_absent' : 'plan_unavailable');
  if (context.board.execution.status === 'unavailable') return skip(context, 'R6', context.board.execution.reason);
  const terminals = workerTerminals(context, 'R6');
  // A live terminal with an unknown seat may be a worker, so the free count is unknown (workerTerminals listed the reason).
  if (context.board.execution.terminals.some(terminal => terminal.state === 'live' && terminal.seat_status === 'unavailable')) return;
  const open = new Map(items.filter(item => item.state === 'open').map(item => [item.number, item] as const));
  const queued = plan.block.merge_order.flatMap(number => (open.has(number) ? [open.get(number)!] : []));
  const truncated = queued.filter(item => item.claim.status === 'unknown');
  for (const item of truncated) skip(context, 'R6', 'comments_truncated', `#${item.number}`);
  if (truncated.length > 0 || open.size === 0) return;
  const holds = new Set(plan.block.holds.map(hold => hold.issue));
  const seated = new Set(terminals.map(terminal => terminal.issue));
  const ready = queued.filter(item => !holds.has(item.number) && item.blocked_by.every(blocker => blocker.state === 'closed')
    && item.claim.status === 'none' && !seated.has(item.number));
  const free = plan.block.seat_limits.worker - terminals.length;
  if (free >= 1 && ready.length < R6_READY_MIN) {
    find(context, 'R6', { issues: ready.map(item => item.number) }, `${free} worker seats are free and the plan has ${ready.length} ready issues; propose the next issues`);
  }
}

/** R7: an accepted pull request waits behind an earlier open entry of the merge order that is held, which blocks each ready pull request behind it. */
function r7(context: Context): void {
  const { board } = context;
  if (board.plan.status !== 'observed') return skip(context, 'R7', board.plan.status === 'absent' ? 'plan_absent' : 'plan_unavailable');
  const { merge_order: order, holds } = board.plan.block;
  const onBoard = new Map(board.items.map(item => [item.number, item] as const));
  const refused = new Set(boardMergeDecisions(board).filter(decision => !decision.eligible && decision.reason === 'merge_order').map(decision => decision.pr));
  for (const pr of openPullRequests(board).filter(entry => refused.has(entry.number) && entry.acceptance.status === 'accepted')) {
    const last = Math.max(...itemsOf(board, pr).map(number => order.indexOf(number)));
    const earlier = order.slice(0, last).filter(number => onBoard.get(number)?.state !== 'closed');
    for (const number of earlier.filter(entry => !onBoard.has(entry))) skip(context, 'R7', 'item_off_board', `#${number}`);
    // An off-board entry has no observed state, so only an open board item is a held candidate.
    const hold = earlier.find(number => onBoard.get(number)?.state === 'open' && (holds.some(entry => entry.issue === number) || onBoard.get(number)!.merge_hold.status === 'held'));
    if (hold !== undefined) {
      find(context, 'R7', { issues: [hold], pull_requests: [pr.number] }, `#${pr.number} is accepted and waits behind held #${hold} in merge_order; move #${hold} to the tail`);
    }
  }
}

/** One finding line of `repo-harness board attention`: the priority first, so no line is without one. */
export function attentionFindingLine(finding: BoardFindingV1): string {
  return `${finding.priority} ${finding.rule} ${finding.route}: ${finding.message}`;
}

/** The text output of `repo-harness board attention`: one line for each finding, then one for each unevaluated rule. */
export function renderAttentionText(attention: BoardAttentionV1): string {
  const lines = attention.findings.map(attentionFindingLine);
  if (lines.length === 0) lines.push(`no attention findings for #${attention.parent}`);
  for (const entry of attention.unevaluated) lines.push(`${entry.rule} not evaluated: ${entry.reason}${entry.subject === null ? '' : ` (${entry.subject})`}`);
  return `${lines.join('\n')}\n`;
}

export function evaluateBoardAttention(board: BoardV1): BoardAttentionV1 {
  const context: Context = { board, now: Date.parse(board.observed_at), findings: [], unevaluated: [] };
  for (const rule of [a1, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16, a17, a18, a19, a20, r1, r2, r3, r4, r5, r6, r7]) rule(context);
  return Object.freeze({
    protocol: BOARD_ATTENTION_PROTOCOL,
    kind: BOARD_ATTENTION_KIND,
    parent: board.parent.number,
    observed_at: board.observed_at,
    findings: Object.freeze(context.findings),
    unevaluated: Object.freeze(context.unevaluated),
  });
}
