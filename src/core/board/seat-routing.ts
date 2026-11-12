import { weeklyRemainingPercent, type QuotaAccount, type QuotaAccountReport, type QuotaState } from './quota';
import { PI_CODEX_MODEL_PREFIX, ROUTING_CLASSES, isPiCodexSeat, isReviewSeat, type CodexCreditMode, type RoutingClass, type SeatConfigV1, type SeatId, type SeatRoutingV1, type SeatsConfigV1 } from './seats-settings';

export const CODEX_HYPER_MODEL = Object.freeze({ model: 'gpt-6-astra', effort: 'high' });
/** The Claude control-seat model outside its config entry: the orchestrator while Claude is reserved, the advisor outside Claude hyper. */
export const CLAUDE_CONTROL_MODEL = Object.freeze({ model: 'opus', effort: 'high' });
interface AccountQuota { readonly state: QuotaState; readonly remaining: number | null }
export interface SeatAccountQuotas {
  readonly claude: AccountQuota & { readonly mode: 'hyper' | 'normal' | 'saving' | 'unknown' };
  /** `credits`: the owner's credit mode where it acts now (#2630); `off` unless the account is exhausted and has credits at or above the floor. */
  readonly chatgpt: AccountQuota & { readonly mode: 'normal' | 'hyper' | 'unknown'; readonly credits: CodexCreditMode };
}

/**
 * The credit mode acts only on an exhausted account that reports credits at or above the floor. The provider is the
 * authority for the balance: `unlimited` is at or above any floor, so it passes. A balance that is missing or not a
 * finite number fails closed at every floor, 0 included.
 */
function codexCreditMode(account: QuotaAccountReport | undefined, routing: SeatRoutingV1): CodexCreditMode {
  const credits = account?.codex?.credits;
  if (routing.codex_credit_mode === 'off' || account?.state !== 'exhausted' || credits === null || credits === undefined) return 'off';
  if (credits.unlimited) return routing.codex_credit_mode;
  if (!credits.has_credits || credits.balance === null || credits.balance.trim() === '') return 'off';
  const balance = Number(credits.balance);
  return Number.isFinite(balance) && balance >= routing.codex_credit_floor ? routing.codex_credit_mode : 'off';
}

/** Modes depend on weekly remaining quota, never on pace or elapsed week time. Claude saving wins over hyper below its own threshold. */
export function seatAccountQuotas(accounts: readonly QuotaAccountReport[], routing: SeatRoutingV1): SeatAccountQuotas {
  const quota = (id: QuotaAccount): AccountQuota => {
    const account = accounts.find(account => account.account === id);
    return { state: account?.state ?? 'unknown', remaining: weeklyRemainingPercent(account) };
  };
  const claude = quota('claude'), chatgpt = quota('chatgpt');
  return {
    claude: { ...claude, mode: claude.remaining === null ? 'unknown' : claude.remaining < routing.claude_saving_below_remaining ? 'saving'
      : claude.remaining >= routing.claude_hyper_at_or_above_remaining ? 'hyper' : 'normal' },
    chatgpt: { ...chatgpt, credits: codexCreditMode(accounts.find(account => account.account === 'chatgpt'), routing),
      mode: chatgpt.remaining === null ? 'unknown' : chatgpt.remaining >= routing.codex_hyper_at_or_above_remaining ? 'hyper' : 'normal' },
  };
}

/** `null` is a Codex turn that is no seat, such as the operator cleanup investigation: only `all` covers it. */
export const creditsCover = (id: SeatId | null, quota: SeatAccountQuotas): boolean =>
  quota.chatgpt.credits === 'all' || quota.chatgpt.credits === 'review' && id !== null && isReviewSeat(id);

export const claudeReserved = (quota: SeatAccountQuotas): boolean => quota.claude.mode === 'saving' || quota.claude.state === 'exhausted';

export function seatAccount(seat: SeatConfigV1): QuotaAccount | null {
  return seat.runtime === 'claude' ? 'claude' : seat.runtime === 'codex' || isPiCodexSeat(seat) ? 'chatgpt' : null;
}

export const seatOnCredits = (id: SeatId, seat: SeatConfigV1, quota: SeatAccountQuotas): boolean => seatAccount(seat) === 'chatgpt' && creditsCover(id, quota);

/** The account state that routes and launches the seat: a seat on credits is `tight`, so it is available and its line warns. */
export function seatState(id: SeatId, seat: SeatConfigV1, quota: SeatAccountQuotas): QuotaState | null {
  const account = seatAccount(seat);
  return account === null ? null : seatOnCredits(id, seat, quota) ? 'tight' : quota[account].state;
}

/**
 * One model projection serves the launch argv and the human dispatch lines. Claude hyper routes workers as normal; it
 * only lets the advisor take its config entry (#2633).
 */
export function effectiveSeatConfig<Id extends SeatId>(id: Id, seats: SeatsConfigV1, quota: SeatAccountQuotas): SeatsConfigV1[Id];
export function effectiveSeatConfig(id: SeatId, seats: SeatsConfigV1, quota: SeatAccountQuotas): SeatConfigV1 | null {
  const seat = seats[id];
  if (seat === null) return seat;
  if (seat.runtime === 'codex' && quota.chatgpt.mode === 'hyper') return { ...seat, ...CODEX_HYPER_MODEL };
  if (isPiCodexSeat(seat) && quota.chatgpt.mode === 'hyper') return { ...seat, model: `${PI_CODEX_MODEL_PREFIX}${CODEX_HYPER_MODEL.model}`, effort: CODEX_HYPER_MODEL.effort };
  const control = id === 'orchestrator' ? claudeReserved(quota) : id === 'advisor' && (claudeReserved(quota) || quota.claude.mode !== 'hyper');
  if (seat.runtime === 'claude' && control) return { ...seat, ...CLAUDE_CONTROL_MODEL };
  return seat;
}

const modelText = (seat: { readonly model: string | null; readonly effort: string | null }): string =>
  [seat.model ?? 'default', seat.effort].filter(value => value !== null).join(' ');
const launchText = (seat: SeatConfigV1): string => `${seat.runtime} ${modelText(seat)}`;

function accountText(id: SeatId, seat: SeatConfigV1, quota: SeatAccountQuotas): string | null {
  const account = seatAccount(seat);
  const credits = seatOnCredits(id, seat, quota) ? ', on credits' : '';
  return account === null ? null : `${account} ${quota[account].state}${credits}${account === 'claude' && claudeReserved(quota) ? ', reserved for advisor and orchestrator' : ''}`;
}

export function formatSeatModes(seats: SeatsConfigV1, quota: SeatAccountQuotas): string {
  const { claude_saving_below_remaining: saving, claude_hyper_at_or_above_remaining: hyper, codex_hyper_at_or_above_remaining: codexHyper } = seats.routing;
  const line = (id: QuotaAccount, label: string, bounds: string): string => {
    const account = quota[id];
    return `${label} mode: ${account.mode} (${account.remaining === null ? 'weekly quota unavailable' : `${account.remaining}% left ${bounds}`})`;
  };
  const claude = { saving: `< ${saving}%`, hyper: `>= ${hyper}%`, normal: `>= ${saving}% and < ${hyper}%`, unknown: '' }[quota.claude.mode];
  return [line('claude', 'claude', claude),
    line('chatgpt', 'codex', quota.chatgpt.mode === 'hyper' ? `>= ${codexHyper}%` : `< ${codexHyper}%`)].join('\n');
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
  // While Claude is reserved, worker-light takes the place of each Claude-account seat of an important route (#1954, #2679).
  const savingRoute = reserved && (task === 'important_deep' || task === 'important_fast')
    && seats.routing[task].some(id => seatAccount(seats[id]!) === 'claude');
  if (savingRoute) {
    if (seats['worker-light'] === null) return { id: null, line: `route ${task}: none (worker-light not configured)` };
    if (seats['worker-light'].runtime !== 'pi') return { id: null, line: `route ${task}: none (worker-light is not a Pi seat)` };
  }
  const ids = savingRoute
    ? [...new Set(seats.routing[task].map(id => seatAccount(seats[id]!) === 'claude' ? 'worker-light' as const : id))]
    : seats.routing[task];
  // The section decoder refuses routes that name an unconfigured seat.
  const candidates = ids.map(id => ({ id, seat: effectiveSeatConfig(id, seats, quota)! })).filter(({ seat }) => allow(seat));
  if (candidates.length === 0) return { id: null, line: `route ${task}: none (no seat in the route may take this task)` };
  const available = candidates.filter(({ id, seat }) => seatState(id, seat, quota) !== 'exhausted' && !(seatAccount(seat) === 'claude' && reserved));
  const selected = available.find(({ id, seat }) => seatState(id, seat, quota) !== 'unknown')
    ?? available.find(({ id, seat }) => seatState(id, seat, quota) === 'unknown');
  if (selected === undefined) {
    const reasons = [...new Set(candidates.map(({ id, seat }) => accountText(id, seat, quota)))].join('; ');
    return { id: null, line: `route ${task}: none (${reasons}${task === 'frontend' ? '; frontend waits for claude' : ''})` };
  }
  const selectedState = seatState(selected.id, selected.seat, quota);
  const warning = selectedState === 'unknown' || selectedState === 'tight' ? `; ${accountText(selected.id, selected.seat, quota)}` : '';
  const skipped = candidates.slice(0, candidates.indexOf(selected)).map(({ id, seat }) => `; skipped ${id}: ${accountText(id, seat, quota)}`).join('');
  return { id: selected.id, seat: selected.seat, line: `route ${task}: ${selected.id} (${launchText(selected.seat)}${warning})${skipped}` };
}

/** A review seat waits while its account is exhausted and it is not on credits, or while Claude is reserved for a Claude seat. */
function reviewSeatBlocked(id: SeatId, seat: SeatConfigV1, quota: SeatAccountQuotas): boolean {
  const account = seatAccount(seat);
  return account !== null && (seatState(id, seat, quota) === 'exhausted' || account === 'claude' && claudeReserved(quota));
}

const accountSuffix = (id: SeatId, seat: SeatConfigV1, quota: SeatAccountQuotas): string => seatAccount(seat) === null ? '' : `; ${accountText(id, seat, quota)}`;

/**
 * The effective gatekeeper (#2253): the one source of the gatekeeper route line, of `seats argv gatekeeper` and of the review plan.
 * The gatekeeper-fallback seat takes over only while the gatekeeper account is exhausted; a tight, unknown or reserved gatekeeper keeps its own rule.
 */
export function effectiveGatekeeper(seats: SeatsConfigV1, quota: SeatAccountQuotas): SeatRouteV1 {
  const gatekeeper = effectiveSeatConfig('gatekeeper', seats, quota);
  if (!reviewSeatBlocked('gatekeeper', gatekeeper, quota)) {
    return { id: 'gatekeeper', seat: gatekeeper, line: `gatekeeper: gatekeeper (${launchText(gatekeeper)}${accountSuffix('gatekeeper', gatekeeper, quota)})` };
  }
  const cause = accountText('gatekeeper', gatekeeper, quota);
  const fallback = effectiveSeatConfig('gatekeeper-fallback', seats, quota);
  if (fallback === null || quota[seatAccount(gatekeeper)!].state !== 'exhausted') return { id: null, line: `gatekeeper: none (${cause})` };
  if (reviewSeatBlocked('gatekeeper-fallback', fallback, quota)) {
    return { id: null, line: `gatekeeper: none (${cause}; gatekeeper-fallback: ${accountText('gatekeeper-fallback', fallback, quota)})` };
  }
  return { id: 'gatekeeper-fallback', seat: fallback,
    line: `gatekeeper: gatekeeper-fallback (${launchText(fallback)}${accountSuffix('gatekeeper-fallback', fallback, quota)}; gatekeeper: ${cause})` };
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
  lines.push(reviewSeatBlocked('reviewer', reviewer, quota)
    ? `reviewer: none (${accountText('reviewer', reviewer, quota)})`
    : `reviewer: reviewer (${launchText(reviewer)}${accountSuffix('reviewer', reviewer, quota)})`);
  lines.push(`advisor: advisor (${launchText(effectiveSeatConfig('advisor', seats, quota))})`);
  return lines.join('\n');
}
