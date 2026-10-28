import {
  EMPTY_AGENTS_CONFIG,
  decodeAgentsConfig,
  type AgentsConfigV1,
  type AgentsSettingsRequestV1,
  type AgentsSettingsResultV1,
} from '../../core/operator/agents-settings';
import { isReviewRuntimeId } from '../../core/review/review-runtimes';
import { GlobalConfigurationError, mutateGlobalConfiguration, readGlobalConfiguration } from './global-configuration';

/** The operator target lock precedes the shared global runtime transaction lock. */

export type AgentsConfigurationErrorCode =
  | 'busy'
  | 'config_invalid'
  | 'config_is_link'
  | 'revision_conflict'
  | 'runtime_unknown'
  | 'runtime_not_enabled'
  | 'use_not_supported'
  | 'default_docs_invalid';

export class AgentsConfigurationError extends Error {
  constructor(readonly code: AgentsConfigurationErrorCode, message: string) {
    super(message);
    this.name = 'AgentsConfigurationError';
  }
}

export interface AgentsConfiguration {
  readonly revision: string;
  readonly agents: AgentsConfigV1;
}

export function readAgentsConfiguration(env: NodeJS.ProcessEnv = process.env): AgentsConfiguration {
  let document: ReturnType<typeof readGlobalConfiguration>;
  try {
    document = readGlobalConfiguration(env);
  } catch {
    throw new AgentsConfigurationError('config_invalid', 'The repo-harness configuration file is not a valid JSON object.');
  }
  return { revision: document.revision, agents: sectionOf(document.config) };
}

function sectionOf(config: Record<string, unknown>): AgentsConfigV1 {
  if (config.agents === undefined) return EMPTY_AGENTS_CONFIG;
  try {
    return decodeAgentsConfig(config.agents);
  } catch {
    throw new AgentsConfigurationError('config_invalid', 'The agents section of the repo-harness configuration is not valid.');
  }
}

const sorted = (ids: Iterable<string>): string[] => [...ids].sort();
const sameList = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);

function nextSection(current: AgentsConfigV1, request: AgentsSettingsRequestV1, knownRuntimes: ReadonlySet<string>): AgentsConfigV1 {
  const enabled = new Set(current.enabled);
  const docs = new Set(current.uses.docs);
  const review = new Set(current.uses.review);
  for (const change of request.changes) {
    // A runtime that left the registry, for example after an OAR upgrade, can still be turned off.
    const disables = !change.enabled && change.uses.length === 0;
    if (!disables && !knownRuntimes.has(change.runtime)) {
      throw new AgentsConfigurationError('runtime_unknown', `Runtime ${change.runtime} is not in the runtime registry.`);
    }
    if (!change.enabled && change.uses.length > 0) {
      throw new AgentsConfigurationError('runtime_not_enabled', `Runtime ${change.runtime} must be enabled to have a use.`);
    }
    if (change.uses.includes('review') && !isReviewRuntimeId(change.runtime)) {
      throw new AgentsConfigurationError('use_not_supported', `Runtime ${change.runtime} cannot review; only claude and codex can.`);
    }
    if (change.enabled) enabled.add(change.runtime);
    else enabled.delete(change.runtime);
    for (const [use, set] of [['docs', docs], ['review', review]] as const) {
      if (change.uses.includes(use)) set.add(change.runtime);
      else set.delete(change.runtime);
    }
  }
  const defaultDocs = request.default_docs_runtime === undefined ? current.default_docs : request.default_docs_runtime;
  if (defaultDocs !== null && !docs.has(defaultDocs)) {
    throw new AgentsConfigurationError('default_docs_invalid', 'The default docs runtime must be enabled for docs. Choose another default or clear it.');
  }
  return { enabled: sorted(enabled), uses: { docs: sorted(docs), review: sorted(review) }, default_docs: defaultDocs };
}

function changedKeys(current: AgentsConfigV1, next: AgentsConfigV1): string[] {
  return [
    ...(sameList(current.enabled, next.enabled) ? [] : ['agents.enabled']),
    ...(sameList(current.uses.docs, next.uses.docs) ? [] : ['agents.uses.docs']),
    ...(sameList(current.uses.review, next.uses.review) ? [] : ['agents.uses.review']),
    ...(current.default_docs === next.default_docs ? [] : ['agents.default_docs']),
  ];
}

export function applyAgentsSettings(
  request: AgentsSettingsRequestV1,
  knownRuntimes: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): AgentsSettingsResultV1 {
  try {
    const result = mutateGlobalConfiguration(env, (config) => {
      const current = sectionOf(config);
      const next = nextSection(current, request, new Set(knownRuntimes));
      const changed = changedKeys(current, next);
      return { ...(changed.length ? { config: { ...config, agents: next } } : {}), value: changed };
    }, { expectedRevision: request.expected_revision });
    return { config_revision: result.revision, changed_keys: result.value };
  } catch (error) {
    if (error instanceof GlobalConfigurationError) throw new AgentsConfigurationError(error.code, error.message);
    throw error;
  }
}
