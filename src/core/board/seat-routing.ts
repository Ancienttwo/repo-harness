import { weeklyRemainingPercent, type QuotaAccount, type QuotaAccountReport, type QuotaState } from './quota';
import { PI_CODEX_MODEL_PREFIX, ROUTING_CLASSES, isPiCodexSeat, type RoutingClass, type SeatConfigV1, type SeatId, type SeatRoutingV1, type SeatsConfigV1 } from './seats-settings';

export const CODEX_HYPER_MODEL = Object.freeze({ model: 'gpt-6-astra', effort: 'high' });
interface AccountQuota { readonly state: QuotaState; readonly remaining: number | null }
export interface SeatAccountQuotas {
  readonly claude: AccountQuota & { readonly mode: 'normal' | 'saving' | 'unknown' };
  /** `on_credits` marks the owner-authorized credit grant; the state is then `tight` (#2251). */
  readonly chatgpt: AccountQuota & { readonly mode: 'normal' | 'hyper' | 'unknown'; readonly on_credits?: boolean };
}

/** The owner-authorized credit grant of one launch (#2251). Every other caller takes the default. */
export interface SeatAccountOptions { readonly spendCredits?: boolean }

/** The provider reports credits. The rate limit that makes the account `exhausted` is the state the credit grant exists for, so it does not block. */
function codexCredits(account: QuotaAccountReport | undefined): boolean {
  const codex = account?.codex;
  return codex !== undefined
    && (codex.credits?.has_credits === true || codex.credits?.unlimited === true);
}

/** Modes depend on weekly remaining quota, never on pace or elapsed week time. */
export function seatAccountQuotas(accounts: readonly QuotaAccountReport[], routing: SeatRoutingV1, options: SeatAccountOptions = {}): SeatAccountQuotas {
  const quota = (id: QuotaAccount): AccountQuota => {
    const account = accounts.find(account => account.account === id);
    return { state: account?.state ?? 'unknown', remaining: weeklyRemainingPercent(account) };
  };
  const claude = quota('claude'), chatgpt = quota('chatgpt');
  // An exhausted account that still has credits takes the display state `tight`, so routing and the launch check admit it.
  const onCredits = options.spendCredits === true && chatgpt.state === 'exhausted'
    && codexCredits(accounts.find(account => account.account === 'chatgpt'));
  return {
    claude: { ...claude, mode: claude.remaining === null ? 'unknown' : claude.remaining < routing.claude_saving_below_remaining ? 'saving' : 'normal' },
    chatgpt: { ...chatgpt, ...(onCredits ? { state: 'tight' as const, on_credits: true } : {}),
      mode: chatgpt.remaining === null ? 'unknown' : chatgpt.remaining >= routing.codex_hyper_at_or_above_remaining ? 'hyper' : 'normal' },
  };
}

export const claudeReserved = (quota: SeatAccountQuotas): boolean => quota.claude.mode === 'saving' || quota.claude.state === 'exhausted';

export function seatAccount(seat: SeatConfigV1): QuotaAccount | null {
  return seat.runtime === 'claude' ? 'claude' : seat.runtime === 'codex' || isPiCodexSeat(seat) ? 'chatgpt' : null;
}

/** One model projection serves the launch argv and the human dispatch lines. */
export function effectiveSeatConfig<Id extends SeatId>(id: Id, seats: SeatsConfigV1, quota: SeatAccountQuotas): SeatsConfigV1[Id];
export function effectiveSeatConfig(id: SeatId, seats: SeatsConfigV1, quota: SeatAccountQuotas): SeatConfigV1 | null {
  const seat = seats[id];
  if (seat === null) return seat;
  if (seat.runtime === 'codex' && quota.chatgpt.mode === 'hyper') return { ...seat, ...CODEX_HYPER_MODEL };
  if (isPiCodexSeat(seat) && quota.chatgpt.mode === 'hyper') return { ...seat, model: `${PI_CODEX_MODEL_PREFIX}${CODEX_HYPER_MODEL.model}`, effort: CODEX_HYPER_MODEL.effort };
  if (seat.runtime === 'claude' && (id === 'advisor' || id === 'orchestrator') && claudeReserved(quota)) {
    return { ...seat, model: 'opus', effort: 'high' };
  }
  return seat;
}

const modelText = (seat: { readonly model: string | null; readonly effort: string | null }): string =>
  [seat.model ?? 'default', seat.effort].filter(value => value !== null).join(' ');
const launchText = (seat: SeatConfigV1): string => `${seat.runtime} ${modelText(seat)}`;

function accountText(seat: SeatConfigV1, quota: SeatAccountQuotas): string | null {
  const account = seatAccount(seat);
  const credits = account === 'chatgpt' && quota.chatgpt.on_credits === true ? ', on credits' : '';
  return account === null ? null : `${account} ${quota[account].state}${credits}${account === 'claude' && claudeReserved(quota) ? ', reserved for advisor and orchestrator' : ''}`;
}

export function formatSeatModes(seats: SeatsConfigV1, quota: SeatAccountQuotas): string {
  const line = (id: QuotaAccount, label: string, threshold: number, comparison: string): string => {
    const account = quota[id];
    return `${label} mode: ${account.mode} (${account.remaining === null ? 'weekly quota unavailable' : `${account.remaining}% left ${comparison} ${threshold}%`})`;
  };
  return [line('claude', 'claude', seats.routing.claude_saving_below_remaining, quota.claude.mode === 'saving' ? '<' : '>='),
    line('chatgpt', 'codex', seats.routing.codex_hyper_at_or_above_remaining, quota.chatgpt.mode === 'hyper' ? '>=' : '<')].join('\n');
}

export type SeatRouteV1 =
  | { readonly id: SeatId; readonly seat: SeatConfigV1; readonly line: string }
  | { readonly id: null; readonly line: string };

/**
 * The seat for one task class: the one source of the `route` line and of dispatch.
 * `allow` removes seats before the account rules apply (for example Pi seats for work that touches credentials).
 */
export function selectSeatRoute(task: RoutingClass, seats: SeatsConfigV1, quota: SeatAccountQuotas, allow: (seat: SeatConfigV1) => boolean = () => true): SeatRouteV1 {
  const reserved = claudeReserved(quota);
  const savingRoute = reserved && (task === 'important_deep' || task === 'important_fast');
  if (savingRoute) {
    if (seats['worker-light'] === null) return { id: null, line: `route ${task}: none (worker-light not configured)` };
    if (seats['worker-light'].runtime !== 'pi') return { id: null, line: `route ${task}: none (worker-light is not a Pi seat)` };
  }
  const ids = savingRoute ? ['worker-light'] as const : seats.routing[task];
  // The section decoder refuses routes that name an unconfigured seat.
  const candidates = ids.map(id => ({ id, seat: effectiveSeatConfig(id, seats, quota)! })).filter(({ seat }) => allow(seat));
  if (candidates.length === 0) return { id: null, line: `route ${task}: none (no seat in the route may take this task)` };
  const state = (seat: SeatConfigV1) => {
    const account = seatAccount(seat);
    return account === null ? null : quota[account].state;
  };
  const available = candidates.filter(({ seat }) => state(seat) !== 'exhausted' && !(seatAccount(seat) === 'claude' && reserved));
  const selected = available.find(({ seat }) => state(seat) !== 'unknown')
    ?? available.find(({ seat }) => state(seat) === 'unknown');
  if (selected === undefined) {
    const reasons = [...new Set(candidates.map(({ seat }) => accountText(seat, quota)))].join('; ');
    return { id: null, line: `route ${task}: none (${reasons}${task === 'frontend' ? '; frontend waits for claude' : ''})` };
  }
  const selectedState = state(selected.seat);
  const warning = selectedState === 'unknown' || selectedState === 'tight' ? `; ${accountText(selected.seat, quota)}` : '';
  const skipped = candidates.slice(0, candidates.indexOf(selected)).map(({ id, seat }) => `; skipped ${id}: ${accountText(seat, quota)}`).join('');
  return { id: selected.id, seat: selected.seat, line: `route ${task}: ${selected.id} (${launchText(selected.seat)}${warning})${skipped}` };
}

/** A review seat waits while its account is exhausted, or while Claude is reserved for a Claude seat. */
function reviewSeatBlocked(seat: SeatConfigV1, quota: SeatAccountQuotas): boolean {
  const account = seatAccount(seat);
  return account !== null && (quota[account].state === 'exhausted' || account === 'claude' && claudeReserved(quota));
}

const accountSuffix = (seat: SeatConfigV1, quota: SeatAccountQuotas): string => seatAccount(seat) === null ? '' : `; ${accountText(seat, quota)}`;

/**
 * The effective gatekeeper (#2253): the one source of the gatekeeper route line, of `seats argv gatekeeper` and of the review plan.
 * The gatekeeper-fallback seat takes over only while the gatekeeper account is exhausted; a tight, unknown or reserved gatekeeper keeps its own rule.
 */
export function effectiveGatekeeper(seats: SeatsConfigV1, quota: SeatAccountQuotas): SeatRouteV1 {
  const gatekeeper = effectiveSeatConfig('gatekeeper', seats, quota);
  if (!reviewSeatBlocked(gatekeeper, quota)) {
    return { id: 'gatekeeper', seat: gatekeeper, line: `gatekeeper: gatekeeper (${launchText(gatekeeper)}${accountSuffix(gatekeeper, quota)})` };
  }
  const cause = accountText(gatekeeper, quota);
  const fallback = effectiveSeatConfig('gatekeeper-fallback', seats, quota);
  if (fallback === null || quota[seatAccount(gatekeeper)!].state !== 'exhausted') return { id: null, line: `gatekeeper: none (${cause})` };
  if (reviewSeatBlocked(fallback, quota)) return { id: null, line: `gatekeeper: none (${cause}; gatekeeper-fallback: ${accountText(fallback, quota)})` };
  return { id: 'gatekeeper-fallback', seat: fallback,
    line: `gatekeeper: gatekeeper-fallback (${launchText(fallback)}${accountSuffix(fallback, quota)}; gatekeeper: ${cause})` };
}

/** The saving threshold reserves Claude; pace-based tight is only a display state. */
export function formatSeatRoutes(seats: SeatsConfigV1, quota: SeatAccountQuotas): string {
  const reserved = claudeReserved(quota);
  const lines: string[] = ROUTING_CLASSES.map(task => selectSeatRoute(task, seats, quota).line);
  lines.push(reserved
    ? `explorer: ${modelText(seats.routing.low_quota_explorer)} (claude ${quota.claude.state === 'exhausted' ? 'exhausted' : quota.claude.mode}; pass model ${seats.routing.low_quota_explorer.model} when you call the explorer)`
    : 'explorer: default');
  lines.push(effectiveGatekeeper(seats, quota).line);
  const reviewer = effectiveSeatConfig('reviewer', seats, quota);
  lines.push(reviewSeatBlocked(reviewer, quota) ? `reviewer: none (${accountText(reviewer, quota)})` : `reviewer: reviewer (${launchText(reviewer)}${accountSuffix(reviewer, quota)})`);
  return lines.join('\n');
}
