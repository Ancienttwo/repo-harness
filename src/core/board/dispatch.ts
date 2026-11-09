import { PlanBlockError, decodePlanBlock, type PlanBlockV1 } from './plan-block';
import { selectSeatRoute, type SeatAccountQuotas } from './seat-routing';
import { ROUTING_CLASSES, isWorkerSeat, type RoutingClass, type SeatId, type SeatsConfigV1 } from './seats-settings';
import { claimStatusTarget, field, newestProtocolComment, parseClaimStatus, protocolComments, type BoardParentReadV1, type BoardSubIssueReadV1 } from './source';

/**
 * Dispatch (#2004): which sub-issues of a parent are ready, and which seat each one gets. It is a pure
 * projection of the plan block, the sub-issues, the live seat labels and the quota route. It writes nothing.
 */
const PLAN_HEADER = 'repo-harness plan';
const CLAIM_HEADER = 'repo-harness issue claim';
const CLAIM_STATUS_HEADER = 'repo-harness issue claim status';

/** An issue states its task class by one `route:<class>` label. */
export const ROUTE_LABEL_PREFIX = 'route:';
/** Work that touches credentials never goes to a Pi seat, which runs without a sandbox. */
export const CREDENTIALS_LABEL = 'touches:credentials';

export class DispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DispatchError';
  }
}

export type DispatchSkipReason = 'not_sub_issue' | 'closed' | 'held' | 'blocked' | 'claimed' | 'kind_label_invalid' | 'no_route' | 'over_limit';

export type DispatchDecisionV1 =
  | { readonly issue: number; readonly action: 'dispatch'; readonly title: string; readonly route_class: RoutingClass; readonly credentials: boolean; readonly seat: SeatId; readonly route_line: string }
  | { readonly issue: number; readonly action: 'skip'; readonly reason: DispatchSkipReason; readonly detail: string };

/** A live terminal with its raw labels, as the board host reads it. */
export interface DispatchTerminalV1 {
  readonly state: 'live' | 'finished';
  readonly labels: { readonly seat?: string; readonly issue?: string; readonly parent?: string };
}

export interface DispatchInputV1 {
  readonly parent: BoardParentReadV1;
  readonly terminals: readonly DispatchTerminalV1[];
  readonly seats: SeatsConfigV1;
  readonly quota: SeatAccountQuotas;
}

export interface DispatchPlanV1 {
  readonly plan: PlanBlockV1;
  /** Live worker seats that carry this parent's label before this dispatch. */
  readonly live_workers: number;
  readonly coordinator: string | null;
  readonly decisions: readonly DispatchDecisionV1[];
}

function planOf(parent: BoardParentReadV1): PlanBlockV1 {
  const comment = newestProtocolComment(parent.parent.comments, PLAN_HEADER);
  if (comment === null) throw new DispatchError(`#${parent.parent.number} has no plan comment${parent.parent.comments.truncated ? ' in the comments that were read' : ''}`);
  try {
    return decodePlanBlock(comment.body);
  } catch (error) {
    if (error instanceof PlanBlockError) throw new DispatchError(error.message);
    throw error;
  }
}

/** Claimed: the newest claim is not released or done, or the comments are cut and the claim state cannot be known. */
function claimDetail(issue: BoardSubIssueReadV1): string | null {
  const claim = newestProtocolComment(issue.comments, CLAIM_HEADER);
  if (claim === null) return issue.comments.truncated ? 'older comments were not read, so a claim cannot be ruled out' : null;
  // A status closes the claim it names, not any claim: a delayed status of an older claim leaves this one active.
  const closing = protocolComments(issue.comments, CLAIM_STATUS_HEADER)
    .filter(comment => claimStatusTarget(comment) === claim.url)
    .map(parseClaimStatus)
    .some(status => status !== null && (status.status === 'done' || status.status.startsWith('released')));
  return closing ? null : `active claim ${claim.url}`;
}

/** The one route class that the labels name, or the reason that they do not. */
function routeClass(labels: readonly string[]): { readonly kind: RoutingClass } | { readonly error: string } {
  const names = labels.filter(label => label.startsWith(ROUTE_LABEL_PREFIX)).map(label => label.slice(ROUTE_LABEL_PREFIX.length));
  if (names.length !== 1) return { error: names.length === 0 ? 'the issue has no route label' : `the issue has several route labels: ${names.join(', ')}` };
  const kind = ROUTING_CLASSES.find(candidate => candidate === names[0]);
  return kind === undefined ? { error: `${names[0]} is not a route class (${ROUTING_CLASSES.join(', ')})` } : { kind };
}

export function planDispatch(input: DispatchInputV1): DispatchPlanV1 {
  const { parent, seats, quota } = input;
  const plan = planOf(parent);
  const comments = parent.parent.comments;
  const closed = new Set(protocolComments(comments, CLAIM_STATUS_HEADER).filter(comment => {
    const status = parseClaimStatus(comment)?.status;
    return status === 'done' || status?.startsWith('released');
  }).map(claimStatusTarget));
  const coordinator = protocolComments(comments, CLAIM_HEADER)
    .filter(comment => field(comment.body, 'Role') === 'coordinator' && field(comment.body, 'Status') === 'active' && !closed.has(comment.url))
    .reduce<typeof comments.comments[number] | null>((latest, comment) => latest === null || comment.created_at >= latest.created_at ? comment : latest, null);
  const parentLabel = String(parent.parent.number);
  const liveWorkers = input.terminals.filter(({ state, labels }) => state === 'live' && labels.parent === parentLabel
    && labels.seat !== undefined && isWorkerSeat(labels.seat as SeatId));
  // A seat started without a parent label still occupies its issue, so occupancy reads every live worker of the repository.
  const liveIssues = new Set(input.terminals.filter(({ state, labels }) => state === 'live' && labels.seat !== undefined && isWorkerSeat(labels.seat as SeatId))
    .map(({ labels }) => labels.issue));
  const held = new Map(plan.holds.map(hold => [hold.issue, hold.reason]));
  const issues = new Map(parent.sub_issues.map(issue => [issue.number, issue]));
  let running = liveWorkers.length;
  const decisions = plan.merge_order.map((number): DispatchDecisionV1 => {
    const skip = (reason: DispatchSkipReason, detail: string): DispatchDecisionV1 => ({ issue: number, action: 'skip', reason, detail });
    const issue = issues.get(number);
    if (issue === undefined) return skip('not_sub_issue', `#${number} is not a sub-issue of #${parent.parent.number}`);
    if (issue.state === 'closed') return skip('closed', 'the issue is closed');
    const hold = held.get(number);
    if (hold !== undefined) return skip('held', hold);
    const open = issue.blocked_by.filter(blocker => blocker.state === 'open').map(blocker => `#${blocker.number}`);
    if (open.length > 0) return skip('blocked', `blocked by ${open.join(', ')}`);
    const claim = claimDetail(issue) ?? (liveIssues.has(String(number)) ? 'a live worker seat carries the issue label' : null);
    if (claim !== null) return skip('claimed', claim);
    const kind = routeClass(issue.labels);
    if ('error' in kind) return skip('kind_label_invalid', kind.error);
    const credentials = issue.labels.includes(CREDENTIALS_LABEL);
    const route = selectSeatRoute(kind.kind, seats, quota, credentials ? seat => seat.runtime !== 'pi' : undefined);
    if (route.id === null) return skip('no_route', route.line);
    if (running >= plan.seat_limits.worker) return skip('over_limit', `${running} of ${plan.seat_limits.worker} worker seats run`);
    running += 1;
    return { issue: number, action: 'dispatch', title: issue.title, route_class: kind.kind, credentials, seat: route.id, route_line: route.line };
  });
  return Object.freeze({ plan, live_workers: liveWorkers.length, coordinator: coordinator?.url ?? null, decisions: Object.freeze(decisions) });
}
