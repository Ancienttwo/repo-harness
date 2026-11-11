import {
  DEFAULT_SEATS_CONFIG,
  ROUTING_CLASSES,
  SEAT_IDS,
  seatTakesFleet,
  decodeSeatsSettings,
  decodeSeatsSettingsResult,
  type SeatConfigV1,
  type RoutingClass,
  type OptionalSeatId,
  type SeatId,
  type SeatModelV1,
  type SeatRuntime,
  type SeatsConfigV1,
  type SeatsSettingsRequestV1,
  type SeatsSettingsV1,
  type SeatTool,
  type WorkerSeatId,
} from '../core/board/seats-settings';
import {
  fetchSettings,
  postSettings,
  useSettingsForm,
  type SettingsForm,
  type SettingsReader,
  type SettingsSection,
  type SettingsWriter,
} from './settings';

/** Browser side of `GET` and `POST /api/v1/settings/seats`. Save sends the whole section. */
const SEATS_SETTINGS_PATH = '/api/v1/settings/seats';

export type SeatsSettingsReader = SettingsReader<SeatsSettingsV1>;
export type SeatsSettingsWriter = SettingsWriter<SeatsSettingsRequestV1>;
export type SeatsSettingsForm = SettingsForm<SeatsSettingsV1, SeatsSettingsV1['config'], SeatsConfigV1, SeatsSettingsRequestV1>;

export const fetchSeatsSettings: SeatsSettingsReader = signal => fetchSettings(SEATS_SETTINGS_PATH, decodeSeatsSettings, signal);
export const postSeatsSettings: SeatsSettingsWriter = body => postSettings(SEATS_SETTINGS_PATH, decodeSeatsSettingsResult, body);

export function seatsDraftOf(config: SeatsSettingsV1['config']): SeatsConfigV1 {
  const { revision: _revision, ...seats } = config;
  return seats;
}

const sameSeat = (left: SeatConfigV1 | null, right: SeatConfigV1 | null): boolean =>
  left === null || right === null ? left === right : left.runtime === right.runtime && left.model === right.model && left.effort === right.effort
  && left.tools.join() === right.tools.join() && left.fleet.join() === right.fleet.join();

const ROUTING_FIELDS = [...ROUTING_CLASSES, 'claude_saving_below_remaining', 'codex_hyper_at_or_above_remaining', 'low_quota_explorer'] as const;
const changedRouting = (base: SeatsConfigV1, draft: SeatsConfigV1): number =>
  ROUTING_FIELDS.filter(field => JSON.stringify(base.routing[field]) !== JSON.stringify(draft.routing[field])).length;

export const sameSeats = (left: SeatsConfigV1, right: SeatsConfigV1): boolean => SEAT_IDS.every(id => sameSeat(left[id], right[id])) && changedRouting(left, right) === 0;

/** The number of seat and routing fields that differ, for the save bar. It counts the fields that the server names in `changed_keys`. */
export function seatChanges(base: SeatsConfigV1, draft: SeatsConfigV1): number {
  return SEAT_IDS.reduce((count, id) => {
    const before = base[id], after = draft[id];
    return count + (before === null || after === null ? Number(before !== after) : (['runtime', 'model', 'effort', 'tools', 'fleet'] as const)
      .filter(field => String(before[field]) !== String(after[field])).length);
  }, changedRouting(base, draft));
}

const SEATS_SECTION: SettingsSection<SeatsSettingsV1, SeatsSettingsV1['config'], SeatsConfigV1, SeatsSettingsRequestV1> = {
  id: 'seats',
  config: settings => settings.config,
  draftOf: seatsDraftOf,
  request: (base, draft) => (sameSeats(seatsDraftOf(base), draft) ? null : { expected_revision: base.revision, seats: draft }),
  sameDraft: sameSeats,
  applied: (revision, draft) => ({ revision, ...draft }),
};

export function useSeatsSettingsForm(read: SeatsSettingsReader, write: SeatsSettingsWriter, generation: number, agentsSaves: number, enabled: boolean): SeatsSettingsForm {
  return useSettingsForm(SEATS_SECTION, read, write, generation, agentsSaves, enabled);
}

const toggled = <T extends string>(items: readonly T[], item: T, on: boolean): readonly T[] =>
  on ? (items.includes(item) ? items : [...items, item].sort()) : items.filter(value => value !== item);

// The page edits the fields of a configured seat only; an optional seat set to null shows no seat controls.
const patch = (draft: SeatsConfigV1, seat: SeatId, change: Partial<SeatConfigV1>): SeatsConfigV1 => ({ ...draft, [seat]: { ...draft[seat]!, ...change } });

/**
 * A new runtime keeps the model and effort only where that runtime accepts
 * them, and keeps fleet roles only where the runtime and model take them. Codex always
 * runs commands, so its shell group is on.
 */
export function setSeatRuntime(draft: SeatsConfigV1, seat: SeatId, runtime: SeatRuntime, ranges: SeatsSettingsV1['ranges']): SeatsConfigV1 {
  const range = ranges.runtimes.find(entry => entry.id === runtime)!;
  const current = draft[seat]!;
  const model = current.model !== null && range.models.includes(current.model) ? current.model : null;
  return patch(draft, seat, {
    runtime,
    model,
    effort: range.effort ? current.effort : null,
    fleet: range.fleet && seatTakesFleet({ runtime, model }) ? current.fleet : [],
    tools: runtime === 'codex' ? toggled(current.tools, 'shell', true) : current.tools,
  });
}

/** A Pi seat that leaves the GPT models loses its fleet roles, as a runtime change does. */
export const setSeatModel = (draft: SeatsConfigV1, seat: SeatId, model: string | null): SeatsConfigV1 => {
  const current = draft[seat]!;
  return patch(draft, seat, { model, fleet: seatTakesFleet({ runtime: current.runtime, model }) ? current.fleet : [] });
};
export const setSeatEffort = (draft: SeatsConfigV1, seat: SeatId, effort: string | null): SeatsConfigV1 => patch(draft, seat, { effort });
export const setSeatTool = (draft: SeatsConfigV1, seat: SeatId, tool: SeatTool, on: boolean): SeatsConfigV1 =>
  patch(draft, seat, { tools: toggled(draft[seat]!.tools, tool, on) });
export const setSeatRole = (draft: SeatsConfigV1, seat: SeatId, role: string, on: boolean): SeatsConfigV1 =>
  patch(draft, seat, { fleet: toggled(draft[seat]!.fleet, role, on) });

/**
 * Switching the gatekeeper-fallback seat on starts from a Pi seat on the DeepSeek model, outside the model family
 * and the account of the default gatekeeper; the seat has no default of its own.
 */
export const GATEKEEPER_FALLBACK_STARTER: SeatConfigV1 = Object.freeze({
  runtime: 'pi', model: DEFAULT_SEATS_CONFIG['worker-light']!.model, effort: null, tools: DEFAULT_SEATS_CONFIG.gatekeeper.tools, fleet: [],
});

/** An optional seat set to null leaves the routes, since the section refuses a route that names an unconfigured seat. */
export function setOptionalSeat(draft: SeatsConfigV1, id: OptionalSeatId, seat: SeatConfigV1 | null): SeatsConfigV1 {
  if (seat !== null) return { ...draft, [id]: seat };
  const routes = Object.fromEntries(ROUTING_CLASSES.map(task => [task, draft.routing[task].filter(route => route !== id)]));
  return { ...draft, [id]: null, routing: { ...draft.routing, ...routes } };
}

export const setRoute = (draft: SeatsConfigV1, task: RoutingClass, seats: readonly WorkerSeatId[]): SeatsConfigV1 =>
  ({ ...draft, routing: { ...draft.routing, [task]: seats } });
export const setThreshold = (draft: SeatsConfigV1, field: 'claude_saving_below_remaining' | 'codex_hyper_at_or_above_remaining', value: number): SeatsConfigV1 =>
  ({ ...draft, routing: { ...draft.routing, [field]: value } });
export const setExplorer = (draft: SeatsConfigV1, change: Partial<SeatModelV1>): SeatsConfigV1 =>
  ({ ...draft, routing: { ...draft.routing, low_quota_explorer: { ...draft.routing.low_quota_explorer, ...change } } });
