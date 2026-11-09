// Public contracts for the seat settings (G33): the `seats` section of
// `~/.repo-harness/config.json` and GET/POST /api/v1/settings/seats. The
// decoders check shape and seat invariants. The allowed models, efforts and fleet roles come
// from the fleet role profiles, so the configuration effect checks them; the
// GET body carries the result as `ranges`, and the browser renders only that.

export const WORKER_SEAT_IDS = ['worker', 'worker-deep', 'worker-important', 'worker-important-fast', 'worker-light'] as const;
export type WorkerSeatId = typeof WORKER_SEAT_IDS[number];
export const FRONTEND_SEAT_IDS = ['worker-important', 'worker-important-fast'] as const;
export const ROUTING_CLASSES = ['important_deep', 'important_fast', 'simple_deep', 'simple_fast', 'frontend'] as const;
export type RoutingClass = typeof ROUTING_CLASSES[number];
export const SEAT_IDS = ['orchestrator', 'advisor', ...WORKER_SEAT_IDS, 'gatekeeper', 'reviewer'] as const;
export type SeatId = typeof SEAT_IDS[number];
export const isWorkerSeat = (seat: SeatId): seat is WorkerSeatId => WORKER_SEAT_IDS.includes(seat as WorkerSeatId);

/** The runtimes that run in a Herdr pane. */
export const SEAT_RUNTIMES = ['claude', 'codex', 'pi'] as const;
export type SeatRuntime = typeof SEAT_RUNTIMES[number];

/** Tool groups. `read` is always on. */
export const SEAT_TOOLS = ['read', 'edit', 'shell', 'net', 'tasks', 'schedule', 'mcp', 'gh'] as const;
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

/** A Pi seat on this model prefix runs a Codex-range GPT model through magpie: it draws on the same ChatGPT account as a Codex seat. */
export const PI_CODEX_MODEL_PREFIX = 'magpie/codex/';
export const isPiCodexSeat = (seat: { readonly runtime: SeatRuntime; readonly model: string | null }): boolean =>
  seat.runtime === 'pi' && seat.model?.startsWith(PI_CODEX_MODEL_PREFIX) === true;
/** The fleet roles are pinned to GPT models, so a Pi seat takes them only on a GPT model. */
export const seatTakesFleet = (seat: { readonly runtime: SeatRuntime; readonly model: string | null }): boolean =>
  seat.runtime !== 'pi' || isPiCodexSeat(seat);

export interface SeatModelV1 {
  readonly model: string | null;
  readonly effort: string | null;
}

export type SeatRoutingV1 = { readonly [task in RoutingClass]: readonly WorkerSeatId[] } & {
  readonly claude_saving_below_remaining: number;
  readonly codex_hyper_at_or_above_remaining: number;
  readonly low_quota_explorer: SeatModelV1;
};
export type SeatsConfigV1 = { readonly [seat in Exclude<SeatId, 'worker-light'>]: SeatConfigV1 } & {
  readonly 'worker-light': SeatConfigV1 | null;
  readonly routing: SeatRoutingV1;
};

const WORKER_TOOLS = Object.freeze(['edit', 'gh', 'mcp', 'net', 'read', 'shell', 'tasks'] as const);
const WORKER_FLEET = Object.freeze(['deep-reasoner', 'deep-worker', 'explorer', 'fast-worker', 'gatekeeper', 'harness-evaluator', 'root-cause-prover']);
const REVIEW_TOOLS: readonly SeatTool[] = Object.freeze(['net', 'read', 'shell'] as const);

/**
 * The section an absent `seats` key reads as: the canvas defaults, with the
 * orchestrator on Opus high (G36). `repo-harness seats argv` launches from the
 * same value. No runtime check compares it with the fleet role profiles: a
 * save checks it as any other section, and a route test compares the default
 * worker fleet with the worker range.
 */
export const DEFAULT_SEATS_CONFIG: SeatsConfigV1 = Object.freeze({
  orchestrator: Object.freeze({ runtime: 'claude', model: 'opus', effort: 'high', tools: Object.freeze(['gh', 'mcp', 'net', 'read', 'shell', 'tasks'] as const), fleet: Object.freeze([]) }),
  advisor: Object.freeze({ runtime: 'claude', model: 'opus', effort: 'max', tools: Object.freeze(['mcp', 'net', 'read', 'shell'] as const), fleet: Object.freeze(['deep-reasoner', 'explorer']) }),
  worker: Object.freeze({ runtime: 'codex', model: 'gpt-6.1-terra', effort: 'high', tools: WORKER_TOOLS, fleet: WORKER_FLEET }),
  'worker-deep': Object.freeze({ runtime: 'codex', model: 'gpt-6.1-sol', effort: 'high', tools: WORKER_TOOLS, fleet: WORKER_FLEET }),
  'worker-important': Object.freeze({ runtime: 'claude', model: 'opus', effort: 'medium', tools: WORKER_TOOLS, fleet: WORKER_FLEET }),
  'worker-important-fast': Object.freeze({ runtime: 'claude', model: 'sonnet', effort: 'medium', tools: WORKER_TOOLS, fleet: WORKER_FLEET }),
  'worker-light': Object.freeze({ runtime: 'pi', model: 'magpie/cursor/deepseek-v41-flash-1017', effort: null, tools: WORKER_TOOLS, fleet: Object.freeze([]) }),
  gatekeeper: Object.freeze({ runtime: 'codex', model: 'gpt-6.1-terra', effort: 'high', tools: REVIEW_TOOLS, fleet: Object.freeze([]) }),
  reviewer: Object.freeze({ runtime: 'claude', model: 'opus', effort: 'high', tools: REVIEW_TOOLS, fleet: Object.freeze([]) }),
  routing: Object.freeze({
    claude_saving_below_remaining: 20,
    codex_hyper_at_or_above_remaining: 50,
    important_deep: Object.freeze(['worker-important', 'worker-deep'] as const),
    important_fast: Object.freeze(['worker-important-fast', 'worker'] as const),
    simple_deep: Object.freeze(['worker-deep', 'worker-important'] as const),
    simple_fast: Object.freeze(['worker'] as const),
    frontend: Object.freeze(['worker-important', 'worker-important-fast'] as const),
    low_quota_explorer: Object.freeze({ model: 'haiku', effort: 'high' }),
  }),
});

export const SEATS_CONFIG_UPDATE_ACTION = 'repo-harness update';

export class SeatsConfigMigrationRequiredError extends Error {
  readonly code = 'seats_config_migration_required';
  readonly next_action = SEATS_CONFIG_UPDATE_ACTION;
  constructor() {
    super(`The stored seats section needs a one-shot migration. Run ${SEATS_CONFIG_UPDATE_ACTION}.`);
  }
}

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
  readonly routing: {
    readonly classes: readonly RoutingClass[];
    readonly worker_seats: readonly WorkerSeatId[];
    readonly frontend_seats: readonly typeof FRONTEND_SEAT_IDS[number][];
  };
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

function object(value: unknown, keys: readonly string[], code: string, required = keys): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(code);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!keys.includes(key)) invalid(code);
  for (const key of required) if (!(key in record)) invalid(code);
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

function decodeSeat(id: SeatId, value: unknown, code: string): SeatConfigV1 {
  const record = object(value, ['runtime', 'model', 'effort', 'tools', 'fleet'], code);
  if (!SEAT_RUNTIMES.includes(record.runtime as SeatRuntime)) invalid(code);
  const tools = ascending(record.tools, isTool, code);
  if (!tools.includes('read')) invalid(code);
  const fleet = ascending(record.fleet, isRole, code);
  if ((id === 'gatekeeper' || id === 'reviewer') && (tools.some(tool => !REVIEW_TOOLS.includes(tool)) || fleet.length > 0)) invalid(code);
  const model = record.runtime === 'pi' && record.model !== null
    ? (typeof record.model === 'string' && /^[^/]+\/.+$/u.test(record.model) ? record.model : invalid(code))
    : nullableToken(record.model, code);
  if (fleet.length > 0 && !seatTakesFleet({ runtime: record.runtime as SeatRuntime, model })) invalid(code);
  return {
    runtime: record.runtime as SeatRuntime,
    model,
    effort: nullableToken(record.effort, code),
    tools,
    fleet,
  };
}

const SECTION_KEYS = [...SEAT_IDS, 'routing'];

function decodeModel(value: unknown, code: string): SeatModelV1 {
  const record = object(value, ['model', 'effort'], code);
  return { model: nullableToken(record.model, code), effort: nullableToken(record.effort, code) };
}

function decodeRouting(value: unknown, code: string): SeatRoutingV1 {
  const record = object(value, [...ROUTING_CLASSES, 'claude_saving_below_remaining', 'codex_hyper_at_or_above_remaining', 'low_quota_explorer'], code);
  const percent = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : invalid(code);
  const routes = Object.fromEntries(ROUTING_CLASSES.map(task => {
    const seats = record[task];
    const allowed = task === 'frontend' ? FRONTEND_SEAT_IDS : WORKER_SEAT_IDS;
    if (!Array.isArray(seats) || seats.length === 0 || new Set(seats).size !== seats.length
      || seats.some(seat => !(allowed as readonly unknown[]).includes(seat))) invalid(code);
    return [task, seats as readonly WorkerSeatId[]];
  })) as Pick<SeatRoutingV1, RoutingClass>;
  return { ...routes, claude_saving_below_remaining: percent(record.claude_saving_below_remaining),
    codex_hyper_at_or_above_remaining: percent(record.codex_hyper_at_or_above_remaining),
    low_quota_explorer: decodeModel(record.low_quota_explorer, code) };
}

function decodeSeatsRecord(record: Record<string, unknown>, code: string, requireExplorerModel = true): SeatsConfigV1 {
  const seats = Object.fromEntries(SEAT_IDS.filter(id => id in record)
    .map(id => [id, id === 'worker-light' && record[id] === null ? null : decodeSeat(id, record[id], code)])) as Partial<Omit<SeatsConfigV1, 'routing'>>;
  const routing = 'routing' in record ? decodeRouting(record.routing, code) : undefined;
  if (routing !== undefined) {
    if (requireExplorerModel && routing.low_quota_explorer.model === null) invalid(code);
    if (ROUTING_CLASSES.some(task => routing[task].some(id => seats[id] === null))) invalid(code);
    if (routing.frontend.some(id => seats[id] !== undefined && seats[id]!.runtime !== 'claude')) invalid(code);
  }
  if (SECTION_KEYS.some(key => !(key in record))) throw new SeatsConfigMigrationRequiredError();
  return { ...(seats as Omit<SeatsConfigV1, 'routing'>), routing: routing! };
}

function decodeSeats(value: unknown, code: string): SeatsConfigV1 {
  return decodeSeatsRecord(object(value, SECTION_KEYS, code), code);
}

/** The shape of the stored `seats` section. An absent section (`undefined`) reads as the defaults. */
export function decodeSeatsConfig(value: unknown): SeatsConfigV1 {
  if (value === undefined) return DEFAULT_SEATS_CONFIG;
  const code = 'seats_config_invalid';
  const record = object(value, SECTION_KEYS, code, ['orchestrator', 'advisor', 'worker']);
  if (typeof record.routing === 'object' && record.routing !== null && ('mode' in record.routing || 'hyper' in record.routing)) {
    throw new SeatsConfigMigrationRequiredError();
  }
  return decodeSeatsRecord(record, code);
}

function decodeRoutingRanges(value: unknown, code: string): SeatsRangesV1['routing'] {
  const record = object(value, ['classes', 'worker_seats', 'frontend_seats'], code);
  const ranges = { classes: ROUTING_CLASSES, worker_seats: WORKER_SEAT_IDS, frontend_seats: FRONTEND_SEAT_IDS };
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    if (JSON.stringify(record[key]) !== JSON.stringify(ranges[key])) invalid(code);
  }
  return ranges;
}

function decodeRanges(value: unknown, code: string): SeatsRangesV1 {
  const record = object(value, ['runtimes', 'efforts', 'roles', 'seats', 'routing'], code);
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
    seats: Object.fromEntries(SEAT_IDS.map(id => [id, seat(id)])) as SeatsRangesV1['seats'],
    routing: decodeRoutingRanges(record.routing, code),
  };
}

export function decodeSeatsSettings(value: unknown): SeatsSettingsV1 {
  const code = 'seats_settings_invalid';
  const record = object(value, ['protocol', 'kind', 'config', 'defaults', 'ranges'], code);
  if (record.protocol !== 1 || record.kind !== 'operator_seats_settings') invalid(code);
  const config = object(record.config, ['revision', ...SECTION_KEYS], code);
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
  // Save validation returns seat_model_invalid for a null explorer model, as it does for a model outside the runtime range.
  return { expected_revision: expected, seats: decodeSeatsRecord(object(record.seats, SECTION_KEYS, code), code, false) };
}

export function decodeSeatsSettingsResult(value: unknown): SeatsSettingsResultV1 {
  const code = 'seats_settings_result_invalid';
  const record = object(value, ['config_revision', 'changed_keys'], code);
  const revision = text(record.config_revision, code);
  if (!REVISION.test(revision) || !Array.isArray(record.changed_keys)) invalid(code);
  return { config_revision: revision, changed_keys: record.changed_keys.map(key => text(key, code)) };
}
