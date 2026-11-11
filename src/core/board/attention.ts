import { planIssues } from './plan-block';
import { boardMergeDecisions } from './merge';
import type { BoardItemV1, BoardPullRequestV1, BoardTerminalV1, BoardV1 } from './board';
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
export const BOARD_ATTENTION_PROTOCOL = 1 as const;
export const BOARD_ATTENTION_KIND = 'repo-harness.board-attention' as const;

const MINUTE = 60_000;
/** A1: an accepted, ready pull request waits this long unmerged. */
export const A1_UNMERGED_MS = 15 * MINUTE;
/** A3: a worker seat stays blocked or in error this long. */
export const A3_STUCK_MS = 10 * MINUTE;
/** R1: this many open items are not in the latest plan. */
export const R1_UNPLANNED_ITEMS = 3;
/** R4: an accepted pull request in the merge order waits this long unmerged. */
export const R4_STALLED_MS = 4 * 60 * MINUTE;
const WORKER_SEATS = new Set<string>(WORKER_SEAT_IDS);
const RED_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);

export type BoardRuleId = 'A1' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9' | 'A10' | 'A11' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
export type BoardAttentionRoute = 'orchestrator' | 'advisor';

export interface BoardFindingV1 {
  readonly rule: BoardRuleId;
  readonly route: BoardAttentionRoute;
  readonly issues: readonly number[];
  readonly pull_requests: readonly number[];
  readonly terminals: readonly string[];
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

function find(context: Context, rule: BoardRuleId, subject: { issues?: number[]; pull_requests?: number[]; terminals?: string[] }, message: string): void {
  context.findings.push(Object.freeze({
    rule,
    route: rule.startsWith('A') ? 'orchestrator' : 'advisor',
    issues: Object.freeze(subject.issues ?? []),
    pull_requests: Object.freeze(subject.pull_requests ?? []),
    terminals: Object.freeze(subject.terminals ?? []),
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
  return openPullRequests(context.board).filter(pr => !held(context.board, pr)).flatMap((pr) => {
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
    return WORKER_SEATS.has(terminal.seat) && terminal.state === 'live' ? [terminal] : [];
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

/** Almost every pull request appends one line here, so a shared hit is one rebase, not a conflict between the changes. */
const R2_IGNORED_PATH = 'docs/CHANGELOG.md';

function r2(context: Context): void {
  const open = openPullRequests(context.board);
  for (const pr of open.filter(entry => entry.files === null)) skip(context, 'R2', 'files_incomplete', `#${pr.number}`);
  const complete = open.filter(pr => pr.files !== null);
  for (const [index, left] of complete.entries()) {
    for (const right of complete.slice(index + 1)) {
      const shared = left.files!.filter(path => path !== R2_IGNORED_PATH && right.files!.includes(path));
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

export function evaluateBoardAttention(board: BoardV1): BoardAttentionV1 {
  const context: Context = { board, now: Date.parse(board.observed_at), findings: [], unevaluated: [] };
  for (const rule of [a1, a3, a4, a5, a6, a7, a8, a9, a10, a11, r1, r2, r3, r4, r5]) rule(context);
  return Object.freeze({
    protocol: BOARD_ATTENTION_PROTOCOL,
    kind: BOARD_ATTENTION_KIND,
    parent: board.parent.number,
    observed_at: board.observed_at,
    findings: Object.freeze(context.findings),
    unevaluated: Object.freeze(context.unevaluated),
  });
}
