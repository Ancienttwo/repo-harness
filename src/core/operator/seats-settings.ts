// Public contracts for the seat settings (G33): the `seats` section of
// `~/.repo-harness/config.json` and GET/POST /api/v1/settings/seats. The
// decoders check shape only. The allowed models, efforts and fleet roles come
// from the fleet role profiles, so the configuration effect checks them; the
// GET body carries the result as `ranges`, and the browser renders only that.

export const SEAT_IDS = ['orchestrator', 'advisor', 'worker'] as const;
export type SeatId = typeof SEAT_IDS[number];

/** The runtimes that run in a Herdr pane. */
export const SEAT_RUNTIMES = ['claude', 'codex', 'pi'] as const;
export type SeatRuntime = typeof SEAT_RUNTIMES[number];

/** Tool groups. `read` is always on. */
export const SEAT_TOOLS = ['read', 'edit', 'shell', 'net', 'tasks', 'mcp', 'gh'] as const;
export type SeatTool = typeof SEAT_TOOLS[number];

const TOKEN = /^[a-z0-9][a-z0-9.-]{0,63}$/u;
const ROLE = /^[a-z][a-z0-9-]{0,63}$/u;
const REVISION = /^(?:absent|sha256:[0-9a-f]{64})$/u;

/** One seat. A null `model` or `effort` means the host default. */
export interface SeatConfigV1 {
  readonly runtime: SeatRuntime;
  readonly model: string | null;
  readonly effort: string | null;
  readonly tools: readonly SeatTool[];
  readonly fleet: readonly string[];
}

export type SeatsConfigV1 = { readonly [seat in SeatId]: SeatConfigV1 };

/**
 * The section an absent `seats` key reads as: the canvas defaults, with the
 * orchestrator on Opus high (G36). `repo-harness seats argv` launches from the
 * same value. The configuration effect checks these lists against the fleet
 * role profiles.
 */
export const DEFAULT_SEATS_CONFIG: SeatsConfigV1 = Object.freeze({
  orchestrator: Object.freeze({ runtime: 'claude', model: 'opus', effort: 'high', tools: Object.freeze(['gh', 'mcp', 'net', 'read', 'shell', 'tasks'] as const), fleet: Object.freeze([]) }),
  advisor: Object.freeze({ runtime: 'claude', model: 'opus', effort: 'max', tools: Object.freeze(['mcp', 'net', 'read', 'shell'] as const), fleet: Object.freeze(['deep-reasoner', 'explorer']) }),
  worker: Object.freeze({
    runtime: 'codex', model: 'gpt-6.1-sol', effort: 'high', tools: Object.freeze(['edit', 'gh', 'mcp', 'net', 'read', 'shell', 'tasks'] as const),
    fleet: Object.freeze(['deep-reasoner', 'deep-worker', 'explorer', 'fast-worker', 'gatekeeper', 'harness-evaluator', 'root-cause-prover']),
  }),
});

/** One pane runtime as the seat form may offer it. `models` is empty when the host picks the model. */
export interface SeatRuntimeRangeV1 {
  readonly id: SeatRuntime;
  /** In `agents.enabled`. A seat can be saved only on an enabled runtime. */
  readonly enabled: boolean;
  readonly models: readonly string[];
  readonly effort: boolean;
  readonly fleet: boolean;
}

export interface SeatRoleV1 {
  readonly name: string;
  readonly writable: boolean;
}

/** What one seat may select: the fleet roles and the tool groups. */
export interface SeatRangeV1 {
  readonly fleet: readonly string[];
  readonly tools: readonly SeatTool[];
}

export interface SeatsRangesV1 {
  readonly runtimes: readonly SeatRuntimeRangeV1[];
  readonly efforts: readonly string[];
  readonly roles: readonly SeatRoleV1[];
  readonly seats: { readonly [seat in SeatId]: SeatRangeV1 };
}

/** GET /api/v1/settings/seats. An absent section reads as the defaults. `revision` is the revision of the whole file. */
export interface SeatsSettingsV1 {
  readonly protocol: 1;
  readonly kind: 'operator_seats_settings';
  readonly config: SeatsConfigV1 & { readonly revision: string };
  /** The section an absent `seats` key reads as; the form shows it as the recommendation. */
  readonly defaults: SeatsConfigV1;
  readonly ranges: SeatsRangesV1;
}

/** POST /api/v1/settings/seats without `request_id`. `seats` replaces the whole section. */
export interface SeatsSettingsRequestV1 {
  readonly expected_revision: string;
  readonly seats: SeatsConfigV1;
}

/** POST success. `changed_keys` names the seat fields whose value changed, such as `seats.worker.fleet`. */
export interface SeatsSettingsResultV1 {
  readonly config_revision: string;
  readonly changed_keys: readonly string[];
}

function invalid(code: string): never {
  throw new Error(code);
}

function object(value: unknown, keys: readonly string[], code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(code);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!keys.includes(key)) invalid(code);
  for (const key of keys) if (!(key in record)) invalid(code);
  return record;
}

function text(value: unknown, code: string): string {
  return typeof value === 'string' ? value : invalid(code);
}

function nullableToken(value: unknown, code: string): string | null {
  return value === null ? null : (typeof value === 'string' && TOKEN.test(value) ? value : invalid(code));
}

/** A strictly ascending list, so the config bytes, and so the revision, stay stable. */
function ascending<T extends string>(value: unknown, accept: (item: unknown) => item is T, code: string): readonly T[] {
  if (!Array.isArray(value)) invalid(code);
  const items = value.map(item => (accept(item) ? item : invalid(code)));
  if (items.some((item, index) => index > 0 && items[index - 1]! >= item)) invalid(code);
  return items;
}

const isTool = (value: unknown): value is SeatTool => SEAT_TOOLS.includes(value as SeatTool);
const isRole = (value: unknown): value is string => typeof value === 'string' && ROLE.test(value);

function decodeSeat(value: unknown, code: string): SeatConfigV1 {
  const record = object(value, ['runtime', 'model', 'effort', 'tools', 'fleet'], code);
  if (!SEAT_RUNTIMES.includes(record.runtime as SeatRuntime)) invalid(code);
  const tools = ascending(record.tools, isTool, code);
  if (!tools.includes('read')) invalid(code);
  return {
    runtime: record.runtime as SeatRuntime,
    model: nullableToken(record.model, code),
    effort: nullableToken(record.effort, code),
    tools,
    fleet: ascending(record.fleet, isRole, code),
  };
}

function decodeSeats(value: unknown, code: string): SeatsConfigV1 {
  const record = object(value, SEAT_IDS, code);
  return { orchestrator: decodeSeat(record.orchestrator, code), advisor: decodeSeat(record.advisor, code), worker: decodeSeat(record.worker, code) };
}

/** The shape of the stored `seats` section. An absent section (`undefined`) reads as the defaults. */
export function decodeSeatsConfig(value: unknown): SeatsConfigV1 {
  return value === undefined ? DEFAULT_SEATS_CONFIG : decodeSeats(value, 'seats_config_invalid');
}

function decodeRanges(value: unknown, code: string): SeatsRangesV1 {
  const record = object(value, ['runtimes', 'efforts', 'roles', 'seats'], code);
  if (!Array.isArray(record.runtimes) || !Array.isArray(record.efforts) || !Array.isArray(record.roles)) invalid(code);
  const runtimes = record.runtimes.map((entry) => {
    const runtime = object(entry, ['id', 'enabled', 'models', 'effort', 'fleet'], code);
    if (!SEAT_RUNTIMES.includes(runtime.id as SeatRuntime) || !Array.isArray(runtime.models)) invalid(code);
    if (typeof runtime.enabled !== 'boolean' || typeof runtime.effort !== 'boolean' || typeof runtime.fleet !== 'boolean') invalid(code);
    return { id: runtime.id as SeatRuntime, enabled: runtime.enabled, models: runtime.models.map(model => text(model, code)),
      effort: runtime.effort, fleet: runtime.fleet };
  });
  if (runtimes.map(runtime => runtime.id).join() !== SEAT_RUNTIMES.join()) invalid(code);
  const roles = record.roles.map((entry) => {
    const role = object(entry, ['name', 'writable'], code);
    if (!isRole(role.name) || typeof role.writable !== 'boolean') invalid(code);
    return { name: role.name, writable: role.writable };
  });
  const seats = object(record.seats, SEAT_IDS, code);
  const seat = (id: SeatId): SeatRangeV1 => {
    const range = object(seats[id], ['fleet', 'tools'], code);
    if (!Array.isArray(range.fleet) || !Array.isArray(range.tools)) invalid(code);
    return { fleet: range.fleet.map(name => (isRole(name) ? name : invalid(code))), tools: range.tools.map(tool => (isTool(tool) ? tool : invalid(code))) };
  };
  return {
    runtimes,
    efforts: record.efforts.map(effort => text(effort, code)),
    roles,
    seats: { orchestrator: seat('orchestrator'), advisor: seat('advisor'), worker: seat('worker') },
  };
}

export function decodeSeatsSettings(value: unknown): SeatsSettingsV1 {
  const code = 'seats_settings_invalid';
  const record = object(value, ['protocol', 'kind', 'config', 'defaults', 'ranges'], code);
  if (record.protocol !== 1 || record.kind !== 'operator_seats_settings') invalid(code);
  const config = object(record.config, ['revision', ...SEAT_IDS], code);
  const revision = text(config.revision, code);
  if (!REVISION.test(revision)) invalid(code);
  const { revision: _revision, ...section } = config;
  return {
    protocol: 1, kind: 'operator_seats_settings', config: { revision, ...decodeSeats(section, code) },
    defaults: decodeSeats(record.defaults, code), ranges: decodeRanges(record.ranges, code),
  };
}

/** The closed POST body without `request_id`. */
export function decodeSeatsSettingsRequest(fields: Readonly<Record<string, unknown>>): SeatsSettingsRequestV1 {
  const code = 'seats_settings_request_invalid';
  const record = object(fields, ['expected_revision', 'seats'], code);
  const expected = text(record.expected_revision, code);
  if (!REVISION.test(expected)) invalid(code);
  return { expected_revision: expected, seats: decodeSeats(record.seats, code) };
}

export function decodeSeatsSettingsResult(value: unknown): SeatsSettingsResultV1 {
  const code = 'seats_settings_result_invalid';
  const record = object(value, ['config_revision', 'changed_keys'], code);
  const revision = text(record.config_revision, code);
  if (!REVISION.test(revision) || !Array.isArray(record.changed_keys)) invalid(code);
  return { config_revision: revision, changed_keys: record.changed_keys.map(key => text(key, code)) };
}
