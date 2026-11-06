import {
  SEAT_IDS,
  decodeSeatsSettings,
  decodeSeatsSettingsResult,
  type SeatConfigV1,
  type SeatId,
  type SeatRuntime,
  type SeatsConfigV1,
  type SeatsSettingsRequestV1,
  type SeatsSettingsV1,
  type SeatTool,
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
  return { orchestrator: config.orchestrator, advisor: config.advisor, worker: config.worker };
}

const sameSeat = (left: SeatConfigV1, right: SeatConfigV1): boolean =>
  left.runtime === right.runtime && left.model === right.model && left.effort === right.effort
  && left.tools.join() === right.tools.join() && left.fleet.join() === right.fleet.join();

export const sameSeats = (left: SeatsConfigV1, right: SeatsConfigV1): boolean => SEAT_IDS.every(id => sameSeat(left[id], right[id]));

/** The number of seat fields that differ, for the save bar. */
export function seatChanges(base: SeatsConfigV1, draft: SeatsConfigV1): number {
  return SEAT_IDS.reduce((count, id) => count + (['runtime', 'model', 'effort', 'tools', 'fleet'] as const)
    .filter(field => String(base[id][field]) !== String(draft[id][field])).length, 0);
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

const patch = (draft: SeatsConfigV1, seat: SeatId, change: Partial<SeatConfigV1>): SeatsConfigV1 => ({ ...draft, [seat]: { ...draft[seat], ...change } });

/**
 * A new runtime keeps the model and effort only where that runtime accepts
 * them, and keeps fleet roles only on a runtime that has them. Codex always
 * runs commands, so its shell group is on.
 */
export function setSeatRuntime(draft: SeatsConfigV1, seat: SeatId, runtime: SeatRuntime, ranges: SeatsSettingsV1['ranges']): SeatsConfigV1 {
  const range = ranges.runtimes.find(entry => entry.id === runtime)!;
  const current = draft[seat];
  return patch(draft, seat, {
    runtime,
    model: current.model !== null && range.models.includes(current.model) ? current.model : null,
    effort: range.effort ? current.effort : null,
    fleet: range.fleet ? current.fleet : [],
    tools: runtime === 'codex' ? toggled(current.tools, 'shell', true) : current.tools,
  });
}

export const setSeatModel = (draft: SeatsConfigV1, seat: SeatId, model: string | null): SeatsConfigV1 => patch(draft, seat, { model });
export const setSeatEffort = (draft: SeatsConfigV1, seat: SeatId, effort: string | null): SeatsConfigV1 => patch(draft, seat, { effort });
export const setSeatTool = (draft: SeatsConfigV1, seat: SeatId, tool: SeatTool, on: boolean): SeatsConfigV1 =>
  patch(draft, seat, { tools: toggled(draft[seat].tools, tool, on) });
export const setSeatRole = (draft: SeatsConfigV1, seat: SeatId, role: string, on: boolean): SeatsConfigV1 =>
  patch(draft, seat, { fleet: toggled(draft[seat].fleet, role, on) });
