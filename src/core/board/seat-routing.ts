import type { QuotaAccount, QuotaState } from './quota';
import { ROUTING_CLASSES, type SeatConfigV1, type SeatId, type SeatsConfigV1 } from './seats-settings';

export type SeatAccountStates = Readonly<Record<QuotaAccount, QuotaState>>;

export function seatAccount(seat: SeatConfigV1): QuotaAccount | null {
  return seat.runtime === 'claude' ? 'claude' : seat.runtime === 'codex' ? 'chatgpt' : null;
}

/** One model projection serves the launch argv and the human dispatch lines. */
export function effectiveSeatConfig(id: SeatId, seats: SeatsConfigV1, claudeState: QuotaState | null): SeatConfigV1 {
  const seat = seats[id];
  if (seats.routing.mode === 'standard') return seat;
  if (id === 'advisor') {
    return claudeState === 'exhausted'
      ? { ...seat, runtime: 'codex', ...seats.routing.hyper.codex }
      : { ...seat, runtime: 'claude', ...seats.routing.hyper.advisor };
  }
  return seat.runtime === 'pi' ? seat : { ...seat, ...seats.routing.hyper[seat.runtime] };
}

const modelText = (seat: { readonly model: string | null; readonly effort: string | null }): string =>
  [seat.model ?? 'default', seat.effort].filter(value => value !== null).join(' ');
const launchText = (seat: SeatConfigV1): string => `${seat.runtime} ${modelText(seat)}`;

function accountText(seat: SeatConfigV1, states: SeatAccountStates): string | null {
  const account = seatAccount(seat);
  return account === null ? null : `${account} ${states[account]}${account === 'claude' && (states.claude === 'tight' || states.claude === 'exhausted') ? ', reserved for advisor and orchestrator' : ''}`;
}

/** Ordered two-pass routing keeps Claude's tight capacity for the advisor and orchestrator. */
export function formatSeatRoutes(seats: SeatsConfigV1, states: SeatAccountStates): string {
  const lines = ROUTING_CLASSES.map(task => {
    const candidates = seats.routing[task].map(id => ({ id, seat: effectiveSeatConfig(id, seats, states.claude) }));
    const state = (seat: SeatConfigV1) => {
      const account = seatAccount(seat);
      return account === null ? null : states[account];
    };
    const selected = candidates.find(({ seat }) => state(seat) === null || state(seat) === 'normal' || state(seat) === 'surplus')
      ?? candidates.find(({ seat }) => state(seat) === 'unknown' || (seatAccount(seat) === 'chatgpt' && state(seat) === 'tight'));
    if (selected === undefined) {
      const reasons = [...new Set(candidates.map(({ seat }) => accountText(seat, states)))].join('; ');
      return `route ${task}: none (${reasons}${task === 'frontend' ? '; frontend waits for claude' : ''})`;
    }
    const selectedState = state(selected.seat);
    const warning = selectedState === 'unknown' || selectedState === 'tight' ? `; ${accountText(selected.seat, states)}` : '';
    const skipped = candidates.slice(0, candidates.indexOf(selected)).map(({ id, seat }) => `; skipped ${id}: ${accountText(seat, states)}`).join('');
    return `route ${task}: ${selected.id} (${launchText(selected.seat)}${warning})${skipped}`;
  });
  lines.push(states.claude === 'tight' || states.claude === 'exhausted'
    ? `explorer: ${modelText(seats.routing.low_quota_explorer)} (claude ${states.claude})`
    : 'explorer: default');
  for (const id of ['gatekeeper', 'reviewer'] as const) {
    const seat = effectiveSeatConfig(id, seats, states.claude);
    const account = accountText(seat, states);
    lines.push(`${id}: ${id} (${launchText(seat)}${account === null ? '' : `; ${account}`})`);
  }
  if (seats.routing.mode === 'hyper' && states.claude === 'exhausted') {
    lines.push(`advisor: fallback codex ${modelText(seats.routing.hyper.codex)} (claude exhausted)`);
  }
  return lines.join('\n');
}
