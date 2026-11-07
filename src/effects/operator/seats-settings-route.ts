import type { JsonValue } from '../../core/evidence/types';
import {
  DEFAULT_SEATS_CONFIG,
  SEATS_CONFIG_UPDATE_ACTION,
  decodeSeatsSettings,
  decodeSeatsSettingsRequest,
  decodeSeatsSettingsResult,
  type SeatsSettingsV1,
} from '../../core/board/seats-settings';
import {
  SeatsConfigurationError,
  applySeatsSettings,
  readSeatsConfiguration,
  seatsRanges,
  type SeatsConfigurationErrorCode,
} from '../board/seats-configuration';
import type { OperatorWriteRoute } from './write-channel';
import { OperatorWriteRefusal } from './write-run';

export const OPERATOR_SETTINGS_SEATS_PATH = '/api/v1/settings/seats' as const;
export const OPERATOR_SETTINGS_SEATS_ROUTE = /^\/api\/v1\/settings\/seats$/u;

const CHOOSE_FROM_RANGES = 'Choose a value that the seat settings page offers, then save again.';

export const SEATS_CONFIGURATION_FAILURES: Readonly<Record<SeatsConfigurationErrorCode, { readonly status: number; readonly next_action: string }>> = Object.freeze({
  busy: { status: 503, next_action: 'Wait for the runtime transaction to end, then send the change with a new request_id.' },
  config_invalid: { status: 503, next_action: 'Fix the agents and seats sections of ~/.repo-harness/config.json, then reload the page.' },
  seats_config_migration_required: { status: 503, next_action: SEATS_CONFIG_UPDATE_ACTION },
  config_is_link: { status: 409, next_action: 'Edit the seats section in the file that ~/.repo-harness/config.json links to, or replace the link with a regular file.' },
  revision_conflict: { status: 409, next_action: 'Reload the settings, then apply your change again.' },
  seat_runtime_not_enabled: { status: 422, next_action: 'Enable the runtime in Agent settings, or choose an enabled runtime.' },
  seat_model_invalid: { status: 422, next_action: CHOOSE_FROM_RANGES },
  seat_effort_invalid: { status: 422, next_action: CHOOSE_FROM_RANGES },
  seat_tool_not_allowed: { status: 422, next_action: CHOOSE_FROM_RANGES },
  seat_fleet_not_allowed: { status: 422, next_action: CHOOSE_FROM_RANGES },
  seat_codex_edit_net: { status: 422, next_action: 'Turn Network off on that seat, then save again.' },
});

/** GET: the stored section, or the defaults, with its revision, the defaults and the ranges the form may offer. */
export function readSeatsSettings(env?: NodeJS.ProcessEnv): SeatsSettingsV1 {
  const { revision, seats, enabled_runtimes } = readSeatsConfiguration(env);
  return decodeSeatsSettings({ protocol: 1, kind: 'operator_seats_settings', config: { revision, ...seats },
    defaults: DEFAULT_SEATS_CONFIG, ranges: seatsRanges(enabled_runtimes) });
}

/** POST: replaces the `seats` section of the host config. It starts, stops and changes no pane. */
export function seatsSettingsWriteRoute(env?: NodeJS.ProcessEnv): OperatorWriteRoute {
  return {
    id: 'settings_seats_write',
    path: OPERATOR_SETTINGS_SEATS_ROUTE,
    decode(fields) {
      const request = decodeSeatsSettingsRequest(fields);
      return {
        operation: 'settings_seats',
        target: 'config',
        input: request as unknown as JsonValue,
        execute: async () => {
          try {
            return { status: 200, body: decodeSeatsSettingsResult(applySeatsSettings(request, env)) as unknown as JsonValue };
          } catch (error) {
            if (!(error instanceof SeatsConfigurationError)) throw error;
            const failure = SEATS_CONFIGURATION_FAILURES[error.code];
            throw new OperatorWriteRefusal(failure.status, error.code, error.message, failure.next_action);
          }
        },
      };
    },
  };
}
