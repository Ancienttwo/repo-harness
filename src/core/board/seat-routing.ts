import { weeklyRemainingPercent, type QuotaAccount, type QuotaAccountReport, type QuotaState } from './quota';
import { PI_CODEX_MODEL_PREFIX, ROUTING_CLASSES, isPiCodexSeat, type SeatConfigV1, type SeatId, type SeatRoutingV1, type SeatsConfigV1 } from './seats-settings';

export const CODEX_HYPER_MODEL = Object.freeze({ model: 'gpt-6-astra', effort: 'high' });
interface AccountQuota { readonly state: QuotaState; readonly remaining: number | null }
export interface SeatAccountQuotas {
  readonly claude: AccountQuota & { readonly mode: 'normal' | 'saving' | 'unknown' };
  readonly chatgpt: AccountQuota & { readonly mode: 'normal' | 'hyper' | 'unknown' };
}

/** Modes depend on weekly remaining quota, never on pace or elapsed week time. */
export function seatAccountQuotas(accounts: readonly QuotaAccountReport[], routing: SeatRoutingV1): SeatAccountQuotas {
  const quota = (id: QuotaAccount): AccountQuota => {
    const account = accounts.find(account => account.account === id);
    return { state: account?.state ?? 'unknown', remaining: weeklyRemainingPercent(account) };
  };
  const claude = quota('claude'), chatgpt = quota('chatgpt');
  return {
    claude: { ...claude, mode: claude.remaining === null ? 'unknown' : claude.remaining < routing.claude_saving_below_remaining ? 'saving' : 'normal' },
    chatgpt: { ...chatgpt, mode: chatgpt.remaining === null ? 'unknown' : chatgpt.remaining >= routing.codex_hyper_at_or_above_remaining ? 'hyper' : 'normal' },
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
  return account === null ? null : `${account} ${quota[account].state}${account === 'claude' && claudeReserved(quota) ? ', reserved for advisor and orchestrator' : ''}`;
}

export function formatSeatModes(seats: SeatsConfigV1, quota: SeatAccountQuotas): string {
  const line = (id: QuotaAccount, label: string, threshold: number, comparison: string): string => {
    const account = quota[id];
    return `${label} mode: ${account.mode} (${account.remaining === null ? 'weekly quota unavailable' : `${account.remaining}% left ${comparison} ${threshold}%`})`;
  };
  return [line('claude', 'claude', seats.routing.claude_saving_below_remaining, quota.claude.mode === 'saving' ? '<' : '>='),
    line('chatgpt', 'codex', seats.routing.codex_hyper_at_or_above_remaining, quota.chatgpt.mode === 'hyper' ? '>=' : '<')].join('\n');
}

/** The saving threshold reserves Claude; pace-based tight is only a display state. */
export function formatSeatRoutes(seats: SeatsConfigV1, quota: SeatAccountQuotas): string {
  const reserved = claudeReserved(quota);
  const lines = ROUTING_CLASSES.map(task => {
    const savingRoute = reserved && (task === 'important_deep' || task === 'important_fast');
    if (savingRoute) {
      if (seats['worker-light'] === null) return `route ${task}: none (worker-light not configured)`;
      if (seats['worker-light'].runtime !== 'pi') return `route ${task}: none (worker-light is not a Pi seat)`;
    }
    const ids = savingRoute ? ['worker-light'] as const : seats.routing[task];
    // The section decoder refuses routes that name an unconfigured seat.
    const candidates = ids.map(id => ({ id, seat: effectiveSeatConfig(id, seats, quota)! }));
    const state = (seat: SeatConfigV1) => {
      const account = seatAccount(seat);
      return account === null ? null : quota[account].state;
    };
    const available = candidates.filter(({ seat }) => state(seat) !== 'exhausted' && !(seatAccount(seat) === 'claude' && reserved));
    const selected = available.find(({ seat }) => state(seat) !== 'unknown')
      ?? available.find(({ seat }) => state(seat) === 'unknown');
    if (selected === undefined) {
      const reasons = [...new Set(candidates.map(({ seat }) => accountText(seat, quota)))].join('; ');
      return `route ${task}: none (${reasons}${task === 'frontend' ? '; frontend waits for claude' : ''})`;
    }
    const selectedState = state(selected.seat);
    const warning = selectedState === 'unknown' || selectedState === 'tight' ? `; ${accountText(selected.seat, quota)}` : '';
    const skipped = candidates.slice(0, candidates.indexOf(selected)).map(({ id, seat }) => `; skipped ${id}: ${accountText(seat, quota)}`).join('');
    return `route ${task}: ${selected.id} (${launchText(selected.seat)}${warning})${skipped}`;
  });
  lines.push(reserved
    ? `explorer: ${modelText(seats.routing.low_quota_explorer)} (claude ${quota.claude.state === 'exhausted' ? 'exhausted' : quota.claude.mode}; pass model ${seats.routing.low_quota_explorer.model} when you call the explorer)`
    : 'explorer: default');
  for (const id of ['gatekeeper', 'reviewer'] as const) {
    const seat = effectiveSeatConfig(id, seats, quota);
    const account = seatAccount(seat);
    const blocked = account !== null && (quota[account].state === 'exhausted' || account === 'claude' && reserved);
    lines.push(blocked ? `${id}: none (${accountText(seat, quota)})` : `${id}: ${id} (${launchText(seat)}${account === null ? '' : `; ${accountText(seat, quota)}`})`);
  }
  return lines.join('\n');
}
