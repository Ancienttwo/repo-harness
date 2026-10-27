import type { JsonValue } from '../../core/evidence/types';
import {
  AGENT_RUNTIME_CAPABILITIES,
  decodeAgentsSettings,
  decodeAgentsSettingsRequest,
  decodeAgentsSettingsResult,
  type AgentRuntimesCacheV1,
  type AgentsSettingsV1,
} from '../../core/operator/agents-settings';
import { isReviewRuntimeId } from '../../core/review/review-runtimes';
import {
  AgentsConfigurationError,
  applyAgentsSettings,
  readAgentsConfiguration,
  type AgentsConfigurationErrorCode,
} from '../configuration/agents-configuration';
import type { OperatorWriteRoute } from './write-channel';
import { OperatorWriteRefusal } from './write-run';

export const OPERATOR_SETTINGS_AGENTS_PATH = '/api/v1/settings/agents' as const;
export const OPERATOR_SETTINGS_AGENTS_ROUTE = /^\/api\/v1\/settings\/agents$/u;

const CONFIG_ACTION = 'Fix the agents section of ~/.repo-harness/config.json, then reload the page.';

export const AGENTS_CONFIGURATION_FAILURES: Readonly<Record<AgentsConfigurationErrorCode, { readonly status: number; readonly next_action: string }>> = Object.freeze({
  config_invalid: { status: 503, next_action: CONFIG_ACTION },
  revision_conflict: { status: 409, next_action: 'Reload the settings, then apply your change again.' },
  runtime_unknown: { status: 422, next_action: 'Choose a runtime from the runtime list.' },
  runtime_not_enabled: { status: 422, next_action: 'Enable the runtime, or remove its uses.' },
  use_not_supported: { status: 422, next_action: 'Use claude or codex for review.' },
  default_docs_invalid: { status: 422, next_action: 'Choose a docs runtime as the default, or clear the default.' },
});

/** GET: the stored section with its revision, and the probe cache. It reads the file and the cache; it starts no probe. */
export function readAgentsSettings(readRuntimes: () => AgentRuntimesCacheV1, env?: NodeJS.ProcessEnv): AgentsSettingsV1 {
  const { revision, agents } = readAgentsConfiguration(env);
  const cache = readRuntimes();
  const probe = cache.status === 'unavailable' ? null : cache.probe;
  return decodeAgentsSettings({
    protocol: 1,
    kind: 'operator_agents_settings',
    config: { revision, ...agents },
    runtimes: {
      status: cache.status,
      reason: cache.status === 'ready' ? null : cache.reason,
      collected_at: probe?.collected_at ?? null,
      entries: (probe?.entries ?? []).map(entry => ({
        ...entry,
        review_supported: isReviewRuntimeId(entry.id),
        capabilities: AGENT_RUNTIME_CAPABILITIES,
      })),
    },
  });
}

/**
 * POST: the first production write route. Known runtimes come from the probe
 * cache, the projection of the runtime registry; without a probe nothing is
 * written.
 */
export function agentsSettingsWriteRoute(readRuntimes: () => AgentRuntimesCacheV1, env?: NodeJS.ProcessEnv): OperatorWriteRoute {
  return {
    id: 'settings_agents_write',
    path: OPERATOR_SETTINGS_AGENTS_ROUTE,
    decode(fields) {
      const request = decodeAgentsSettingsRequest(fields);
      return {
        operation: 'settings_agents',
        target: 'config',
        input: request as unknown as JsonValue,
        execute: async () => {
          const cache = readRuntimes();
          if (cache.status === 'unavailable') {
            throw new OperatorWriteRefusal(503, 'runtimes_unavailable', 'The runtime list is not collected yet. Nothing was changed.',
              'Wait for the runtime probe, then send the change with a new request_id.');
          }
          try {
            const result = applyAgentsSettings(request, cache.probe.entries.map(entry => entry.id), env);
            return { status: 200, body: decodeAgentsSettingsResult(result) as unknown as JsonValue };
          } catch (error) {
            if (!(error instanceof AgentsConfigurationError)) throw error;
            const failure = AGENTS_CONFIGURATION_FAILURES[error.code];
            throw new OperatorWriteRefusal(failure.status, error.code, error.message, failure.next_action);
          }
        },
      };
    },
  };
}
