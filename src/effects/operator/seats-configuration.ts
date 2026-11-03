import { decodeAgentsConfig } from '../../core/operator/agents-settings';
import {
  SEAT_IDS,
  SEAT_RUNTIMES,
  SEAT_TOOLS,
  decodeSeatsConfig,
  type SeatConfigV1,
  type SeatId,
  type SeatRuntime,
  type SeatRuntimeRangeV1,
  type SeatsConfigV1,
  type SeatsRangesV1,
  type SeatsSettingsResultV1,
  type SeatTool,
} from '../../core/operator/seats-settings';
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
  | 'config_is_link'
  | 'revision_conflict'
  | 'seat_runtime_not_enabled'
  | 'seat_model_invalid'
  | 'seat_effort_invalid'
  | 'seat_tool_not_allowed'
  | 'seat_fleet_not_allowed';

export class SeatsConfigurationError extends Error {
  constructor(readonly code: SeatsConfigurationErrorCode, message: string) {
    super(message);
    this.name = 'SeatsConfigurationError';
  }
}

// Every range below is a projection of the fleet role profiles.
const READ_ONLY_SUB_AGENTS = MANAGED_AGENTS.filter(role => !WRITABLE_AGENTS.has(role));
const without = (...excluded: SeatTool[]): readonly SeatTool[] => SEAT_TOOLS.filter(tool => !excluded.includes(tool));

/**
 * Owner rules: the orchestrator calls only the four read-only roles of M37 by name (writers and the Codex review run in
 * Herdr seats); the orchestrator and the advisor do not edit (#1472); the advisor does not write GitHub (#1472).
 */
const SEAT_RANGES: SeatsRangesV1['seats'] = {
  orchestrator: { fleet: ['explorer', 'deep-reasoner', 'gatekeeper', 'root-cause-prover'], tools: without('edit') },
  advisor: { fleet: READ_ONLY_SUB_AGENTS, tools: without('edit', 'gh') },
  worker: { fleet: MANAGED_AGENTS, tools: SEAT_TOOLS },
};

/** Claude takes a fleet model family, Codex a fleet target model. Pi uses its own model and effort, and has no fleet roles. */
const RUNTIME_RANGES: Readonly<Record<SeatRuntime, Omit<SeatRuntimeRangeV1, 'id' | 'enabled'>>> = {
  claude: { models: Object.keys(MODEL_FAMILY_LABELS), effort: true, fleet: true },
  codex: { models: [...new Set(Object.values(AGENT_TARGET_OVERRIDES).map(target => target.model))], effort: true, fleet: true },
  pi: { models: [], effort: false, fleet: false },
};

export function seatsRanges(enabledRuntimes: readonly string[]): SeatsRangesV1 {
  return {
    runtimes: SEAT_RUNTIMES.map(id => ({ id, enabled: enabledRuntimes.includes(id), ...RUNTIME_RANGES[id] })),
    efforts: EFFORT_LEVELS,
    roles: MANAGED_AGENTS.map(name => ({ name, writable: WRITABLE_AGENTS.has(name) })),
    seats: SEAT_RANGES,
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

/** The stored section is checked for shape only, so a range that changes later never locks the page; the next save checks it. */
function sectionOf(config: Record<string, unknown>): SeatsConfigV1 {
  try { return decodeSeatsConfig(config.seats); } catch { throw configInvalid('seats'); }
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

function checkSeat(id: SeatId, seat: SeatConfigV1, enabledRuntimes: readonly string[]): void {
  const runtime = RUNTIME_RANGES[seat.runtime];
  const range = SEAT_RANGES[id];
  if (!enabledRuntimes.includes(seat.runtime)) {
    throw new SeatsConfigurationError('seat_runtime_not_enabled', `The ${id} seat runtime ${seat.runtime} is not enabled in Agent settings.`);
  }
  if (seat.model !== null && !runtime.models.includes(seat.model)) {
    throw new SeatsConfigurationError('seat_model_invalid', `The ${id} seat cannot use model ${seat.model} on ${seat.runtime}.`);
  }
  if (seat.effort !== null && (!runtime.effort || !EFFORT_LEVELS.includes(seat.effort))) {
    throw new SeatsConfigurationError('seat_effort_invalid', `The ${id} seat cannot use effort ${seat.effort} on ${seat.runtime}.`);
  }
  const tool = seat.tools.find(item => !range.tools.includes(item));
  if (tool !== undefined) throw new SeatsConfigurationError('seat_tool_not_allowed', `The ${id} seat cannot have the ${tool} tool group.`);
  const role = seat.fleet.find(name => !runtime.fleet || !range.fleet.includes(name));
  if (role !== undefined) throw new SeatsConfigurationError('seat_fleet_not_allowed', `The ${id} seat on ${seat.runtime} cannot call the ${role} sub-agent.`);
}

const FIELDS = ['runtime', 'model', 'effort', 'tools', 'fleet'] as const;

function changedKeys(current: SeatsConfigV1, next: SeatsConfigV1): string[] {
  return SEAT_IDS.flatMap(id => FIELDS
    .filter(field => JSON.stringify(current[id][field]) !== JSON.stringify(next[id][field]))
    .map(field => `seats.${id}.${field}`));
}

/** Replaces the `seats` section. It writes only the configuration file; panes that run keep their launch arguments. */
export function applySeatsSettings(
  request: { readonly expected_revision: string; readonly seats: SeatsConfigV1 },
  env: NodeJS.ProcessEnv = process.env,
): SeatsSettingsResultV1 {
  try {
    const result = mutateGlobalConfiguration(env, (config) => {
      const enabled = enabledRuntimesOf(config);
      for (const id of SEAT_IDS) checkSeat(id, request.seats[id], enabled);
      const changed = changedKeys(sectionOf(config), request.seats);
      return { ...(changed.length ? { config: { ...config, seats: request.seats } } : {}), value: changed };
    }, { expectedRevision: request.expected_revision });
    return { config_revision: result.revision, changed_keys: result.value };
  } catch (error) {
    if (error instanceof GlobalConfigurationError) throw new SeatsConfigurationError(error.code, error.message);
    throw error;
  }
}
