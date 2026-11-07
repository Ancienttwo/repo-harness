import { decodeAgentsConfig } from '../../core/board/agents-settings';
import {
  SEAT_IDS,
  SEAT_RUNTIMES,
  SEAT_TOOLS,
  DEFAULT_SEATS_CONFIG,
  FRONTEND_SEAT_IDS,
  ROUTING_CLASSES,
  WORKER_SEAT_IDS,
  CodexSeatNetworkError,
  SeatsConfigMigrationRequiredError,
  checkCodexSeatNetwork,
  decodeSeatsConfig,
  type SeatConfigV1,
  type SeatModelV1,
  type SeatRoutingV1,
  type SeatId,
  type SeatRuntime,
  type SeatRuntimeRangeV1,
  type SeatsConfigV1,
  type SeatsRangesV1,
  type SeatsSettingsResultV1,
  type SeatTool,
} from '../../core/board/seats-settings';
import {
  AGENT_TARGET_OVERRIDES,
  EFFORT_LEVELS,
  MANAGED_AGENTS,
  MODEL_FAMILY_LABELS,
  WRITABLE_AGENTS,
} from '../terminal/task-role-profiles';
import { GlobalConfigurationError, mutateGlobalConfiguration, readGlobalConfiguration } from '../configuration/global-configuration';

export type SeatsConfigurationErrorCode =
  | 'busy'
  | 'config_invalid'
  | SeatsConfigMigrationRequiredError['code']
  | 'config_is_link'
  | 'revision_conflict'
  | 'seat_runtime_not_enabled'
  | 'seat_model_invalid'
  | 'seat_effort_invalid'
  | 'seat_tool_not_allowed'
  | 'seat_fleet_not_allowed'
  | CodexSeatNetworkError['code'];

export class SeatsConfigurationError extends Error {
  constructor(readonly code: SeatsConfigurationErrorCode, message: string) {
    super(message);
    this.name = 'SeatsConfigurationError';
  }
}

// Fleet role profiles supply the allowed sub-agents.
const READ_ONLY_SUB_AGENTS = MANAGED_AGENTS.filter(role => !WRITABLE_AGENTS.has(role));
const without = (...excluded: SeatTool[]): readonly SeatTool[] => SEAT_TOOLS.filter(tool => !excluded.includes(tool));

/**
 * Owner rules: the orchestrator and the advisor call only the read-only roles (M40); the writers, root-cause-prover
 * included, and the Codex review run in Herdr seats; the orchestrator and the advisor do not edit (#1472); the advisor
 * does not write GitHub (#1472).
 */
const SEAT_RANGES: SeatsRangesV1['seats'] = {
  orchestrator: { fleet: READ_ONLY_SUB_AGENTS, tools: without('edit') },
  advisor: { fleet: READ_ONLY_SUB_AGENTS, tools: without('edit', 'gh') },
  worker: { fleet: MANAGED_AGENTS, tools: SEAT_TOOLS },
  'worker-deep': { fleet: MANAGED_AGENTS, tools: SEAT_TOOLS },
  'worker-important': { fleet: MANAGED_AGENTS, tools: SEAT_TOOLS },
  'worker-important-fast': { fleet: MANAGED_AGENTS, tools: SEAT_TOOLS },
  'worker-light': { fleet: MANAGED_AGENTS, tools: SEAT_TOOLS },
  gatekeeper: { fleet: [], tools: ['read', 'shell'] },
  reviewer: { fleet: [], tools: ['read', 'shell'] },
};

/** Claude takes a fleet model family, Codex a fleet target model. Pi uses its own model and effort, and has no fleet roles. */
const RUNTIME_RANGES: Readonly<Record<SeatRuntime, Omit<SeatRuntimeRangeV1, 'id' | 'enabled'>>> = {
  claude: { models: Object.keys(MODEL_FAMILY_LABELS), effort: true, fleet: true },
  codex: { models: [...new Set([...Object.values(AGENT_TARGET_OVERRIDES).map(target => target.model),
    ...SEAT_IDS.flatMap(id => {
      const seat = DEFAULT_SEATS_CONFIG[id];
      return seat?.runtime === 'codex' && seat.model !== null ? [seat.model] : [];
    })])], effort: true, fleet: true },
  pi: { models: ['magpie/cursor/deepseek-v41-flash-1017'], effort: false, fleet: false },
};

export function seatsRanges(enabledRuntimes: readonly string[]): SeatsRangesV1 {
  return {
    runtimes: SEAT_RUNTIMES.map(id => ({ id, enabled: enabledRuntimes.includes(id), ...RUNTIME_RANGES[id] })),
    efforts: EFFORT_LEVELS,
    roles: MANAGED_AGENTS.map(name => ({ name, writable: WRITABLE_AGENTS.has(name) })),
    seats: SEAT_RANGES,
    routing: { classes: ROUTING_CLASSES, worker_seats: WORKER_SEAT_IDS, frontend_seats: FRONTEND_SEAT_IDS },
  };
}

export interface SeatsConfiguration {
  readonly revision: string;
  readonly seats: SeatsConfigV1;
  readonly enabled_runtimes: readonly string[];
}

const configInvalid = (section: string) =>
  new SeatsConfigurationError('config_invalid', `The ${section} section of the repo-harness configuration is not valid.`);

function enabledRuntimesOf(config: Record<string, unknown>): readonly string[] {
  if (config.agents === undefined) return [];
  try { return decodeAgentsConfig(config.agents).enabled; } catch { throw configInvalid('agents'); }
}

/** Reads enforce the section contract; only saves enforce the runtime ranges that can change later. */
function sectionOf(config: Record<string, unknown>): SeatsConfigV1 {
  try { return decodeSeatsConfig(config.seats); } catch (error) {
    if (error instanceof SeatsConfigMigrationRequiredError) throw new SeatsConfigurationError(error.code, error.message);
    throw configInvalid('seats');
  }
}

export function readSeatsConfiguration(env: NodeJS.ProcessEnv = process.env): SeatsConfiguration {
  let document: ReturnType<typeof readGlobalConfiguration>;
  try {
    document = readGlobalConfiguration(env);
  } catch {
    throw new SeatsConfigurationError('config_invalid', 'The repo-harness configuration file is not a valid JSON object.');
  }
  return { revision: document.revision, seats: sectionOf(document.config), enabled_runtimes: enabledRuntimesOf(document.config) };
}

function checkModelAndEffort(subject: string, model: SeatModelV1, runtimeId: SeatRuntime): void {
  const runtime = RUNTIME_RANGES[runtimeId];
  if (model.model !== null && !runtime.models.includes(model.model)) {
    throw new SeatsConfigurationError('seat_model_invalid', `The ${subject} cannot use model ${model.model} on ${runtimeId}.`);
  }
  if (model.effort !== null && (!runtime.effort || !EFFORT_LEVELS.includes(model.effort))) {
    throw new SeatsConfigurationError('seat_effort_invalid', `The ${subject} cannot use effort ${model.effort} on ${runtimeId}.`);
  }
}

export function checkSeatRoutingModels(routing: SeatRoutingV1): void {
  if (routing.low_quota_explorer.model === null) {
    throw new SeatsConfigurationError('seat_model_invalid', 'The routing.low_quota_explorer model is required.');
  }
  checkModelAndEffort('routing.low_quota_explorer', routing.low_quota_explorer, 'claude');
}

function checkSeat(id: SeatId, seat: SeatConfigV1, enabledRuntimes: readonly string[]): void {
  const runtime = RUNTIME_RANGES[seat.runtime];
  const range = SEAT_RANGES[id];
  if (!enabledRuntimes.includes(seat.runtime)) {
    throw new SeatsConfigurationError('seat_runtime_not_enabled', `The ${id} seat runtime ${seat.runtime} is not enabled in Agent settings.`);
  }
  checkModelAndEffort(`${id} seat`, seat, seat.runtime);
  const tool = seat.tools.find(item => !range.tools.includes(item));
  if (tool !== undefined) throw new SeatsConfigurationError('seat_tool_not_allowed', `The ${id} seat cannot have the ${tool} tool group.`);
  checkCodexSeatNetwork(id, seat);
  const role = seat.fleet.find(name => !runtime.fleet || !range.fleet.includes(name));
  if (role !== undefined) throw new SeatsConfigurationError('seat_fleet_not_allowed', `The ${id} seat on ${seat.runtime} cannot call the ${role} sub-agent.`);
}

const FIELDS = ['runtime', 'model', 'effort', 'tools', 'fleet'] as const;

function changedKeys(current: SeatsConfigV1, next: SeatsConfigV1): string[] {
  return [...SEAT_IDS.flatMap(id => {
    const before = current[id], after = next[id];
    if (before === null || after === null) return before === after ? [] : [`seats.${id}`];
    return FIELDS.filter(field => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
      .map(field => `seats.${id}.${field}`);
  }),
  ...([...ROUTING_CLASSES, 'claude_saving_below_remaining', 'codex_hyper_at_or_above_remaining', 'low_quota_explorer'] as const)
    .filter(field => JSON.stringify(current.routing[field]) !== JSON.stringify(next.routing[field]))
    .map(field => `seats.routing.${field}`)];
}

/** Replaces the `seats` section. It writes only the configuration file; panes that run keep their launch arguments. */
export function applySeatsSettings(
  request: { readonly expected_revision: string; readonly seats: SeatsConfigV1 },
  env: NodeJS.ProcessEnv = process.env,
): SeatsSettingsResultV1 {
  try {
    const result = mutateGlobalConfiguration(env, (config) => {
      const enabled = enabledRuntimesOf(config);
      for (const id of SEAT_IDS) {
        const seat = request.seats[id];
        if (seat !== null) checkSeat(id, seat, enabled);
      }
      checkSeatRoutingModels(request.seats.routing);
      const changed = changedKeys(sectionOf(config), request.seats);
      return { config: { ...config, seats: request.seats }, value: changed };
    }, { expectedRevision: request.expected_revision });
    return { config_revision: result.revision, changed_keys: result.value };
  } catch (error) {
    if (error instanceof GlobalConfigurationError || error instanceof CodexSeatNetworkError) throw new SeatsConfigurationError(error.code, error.message);
    throw error;
  }
}
