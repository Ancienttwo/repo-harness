// Bot access fixtures. Each passes the strict decoder. Like the collector's
// projection, none holds a token, passphrase, webhook URL or local path.
import type { BotAccessSnapshotV1 } from '../../core/operator/bot-access';
import { HERDR_OBSERVATION_PROTOCOL, HERDR_OBSERVATION_REVISION, HERDR_OBSERVATION_VERSION } from '../../core/operator/herdr-pin';
import { NOTIFY_PLUGIN_ID, type NotifyDeliveryV1, type NotifyStatusV1 } from '../../core/operator/notify-status';
import { HARNESS_ID } from './dev-activity';

// The same registry ids as the Dev Activity fixture.
const SITE_ID = 'repo_1f2e3d4c5b6a7980';
const DOCS_ID = 'repo_0a1b2c3d4e5f6071';
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const at = (time: number) => new Date(time).toISOString();

/** The observation pin the server compares a running Herdr server against. */
const EXPECTED = { version: HERDR_OBSERVATION_VERSION, protocol: HERDR_OBSERVATION_PROTOCOL, revision: HERDR_OBSERVATION_REVISION };
const REGISTRY_REVISION = `sha256:${'4c'.repeat(32)}`;
export const HERMES_CLIENT = '3f6c1a2e-8b9d-4e5f-a1b2-c3d4e5f60718';
export const EXECUTOR_CLIENT = '9b2d7e41-5a6c-4f80-b3d2-1e0f9a8c7b65';
const IDLE_CLIENT = 'c0ffee00-1234-4abc-9def-0123456789ab';

function notifyStatus(now: number, enabled: NotifyStatusV1['enabled'], last: NotifyDeliveryV1): NotifyStatusV1 {
  return {
    protocol: 1, kind: 'operator_notify_status', plugin_id: NOTIFY_PLUGIN_ID, linked: 'linked', enabled,
    config: { WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'configured', SLACK_WEBHOOK_URL: 'configured' },
    last_delivery: last, observed_at: at(now - 30_000),
  };
}

/** Every section read: two registered Bots, three OAuth clients, an aligned Herdr server with three agent panes. */
export function busyBotAccess(now: number): BotAccessSnapshotV1 {
  const sent = at(now - 40 * MINUTE);
  return {
    protocol: 1, kind: 'operator_bot_access', observed_at: at(now - 20_000),
    bots: { state: 'ok', bots: [
      { bot_id: 'grok-pm', name: 'Grok PM', host: 'Grok', mcp_client_id: null, slack_bot_id: null, herdr_agent: 'grok-pm' },
      { bot_id: 'hermes', name: 'Hermes', host: 'Hermes', mcp_client_id: HERMES_CLIENT, slack_bot_id: 'B07HERMES1', herdr_agent: 'hermes' },
    ] },
    mcp: { state: 'ok', doctor: {
      status: 'ready_user', package_version: '0.24.3', config_version_ok: true, auth_mode: 'oauth', auth_configured: true,
      capabilities: { workspace_reader: true, workflow_planner: true, workflow_executor: true, workspace_coder: false },
      registered_repo_count: 3, allowed_root_count: 1, unsafe_allowed_root_count: 0, legacy_full_disk_read: false, authorization_revision: 12,
      codex: { cli_available: true, configured: true }, chatgpt: { server_name_configured: true, public_endpoint_configured: true },
    } },
    oauth: { state: 'ok', unreadable_clients: 0, clients: [
      { client_id: HERMES_CLIENT, bot: { state: 'registered', bot_id: 'hermes' }, issued_at: at(now - 9 * DAY), profiles: ['planner'], expires_at: at(now + 21 * DAY + 3 * HOUR) },
      { client_id: EXECUTOR_CLIENT, bot: { state: 'unregistered' }, issued_at: at(now - 28 * DAY), profiles: ['executor'], expires_at: at(now + 2 * DAY - HOUR) },
      { client_id: IDLE_CLIENT, bot: { state: 'unregistered' }, issued_at: at(now - 64 * DAY), profiles: [], expires_at: null },
    ] },
    registry: { state: 'ok', authorization_revision: 12, registry_revision: REGISTRY_REVISION, repos: [
      { repo_id: HARNESS_ID, label: 'repo-harness', access_mode: 'read_write',
        last_audit: { state: 'ok', entry: { at: at(now - 12 * MINUTE), tool: 'write_plan', status: 'ok', bot: { state: 'registered', bot_id: 'hermes' } } } },
      { repo_id: SITE_ID, label: 'operator-site', access_mode: 'read_only',
        last_audit: { state: 'ok', entry: { at: at(now - 3 * HOUR), tool: 'write_prd', status: 'blocked', bot: { state: 'unregistered' } } } },
      { repo_id: DOCS_ID, label: 'field-notes', access_mode: 'read_only', last_audit: { state: 'missing' } },
    ] },
    herdr: {
      state: 'ok', session: 'main',
      status: { state: 'ok', value: {
        client: { version: '0.9.5', protocol: 22 },
        server: { status: 'running', version: { state: 'aligned', expected: EXPECTED, actual: { version: '0.9.5', protocol: 22 } }, restart_needed: false },
      } },
      snapshot: { state: 'ok', value: { workspaces: 2, tabs: 5, panes: 7, agents: [
        { pane_id: 'w1:p1', agent: 'claude', name: 'hermes', agent_status: 'idle', bot: { state: 'registered', bot_id: 'hermes' } },
        { pane_id: 'w2:p1', agent: 'codex', name: 'kanban-redesign', agent_status: 'working', bot: { state: 'unregistered' } },
        { pane_id: 'w2:p2', agent: 'claude', name: null, agent_status: 'blocked', bot: { state: 'unregistered' } },
      ] } },
    },
    notify: {
      state: 'ok', status: notifyStatus(now, 'enabled', { at: sent, result: 'failed' }),
      channels: { webhook: 'configured', slack: 'configured', discord: 'missing', telegram: 'missing' },
      deliveries: { webhook: { at: sent, result: 'succeeded' }, slack: { at: sent, result: 'failed' }, discord: { at: null, result: 'missing' }, telegram: { at: null, result: 'missing' } },
    },
  };
}

/**
 * The Bot registry and `mcp doctor` fail, one audit log is unreadable, the
 * notify plugin is disabled, and Herdr runs an older 0.9.3 server (1-BOTS-F1).
 */
export function degradedBotAccess(now: number): BotAccessSnapshotV1 {
  return {
    protocol: 1, kind: 'operator_bot_access', observed_at: at(now - 6 * MINUTE),
    bots: { state: 'unavailable', reason: 'bot_registry_invalid' },
    mcp: { state: 'unavailable', reason: 'mcp_doctor_timeout' },
    oauth: { state: 'ok', unreadable_clients: 1, clients: [
      { client_id: EXECUTOR_CLIENT, bot: { state: 'unavailable' }, issued_at: at(now - 29 * DAY), profiles: ['executor'], expires_at: at(now + 20 * HOUR) },
    ] },
    registry: { state: 'ok', authorization_revision: 12, registry_revision: REGISTRY_REVISION, repos: [
      { repo_id: HARNESS_ID, label: 'repo-harness', access_mode: 'read_write', last_audit: { state: 'unavailable', reason: 'audit_unreadable' } },
      { repo_id: SITE_ID, label: 'operator-site', access_mode: 'read_only',
        last_audit: { state: 'ok', entry: { at: at(now - 2 * DAY), tool: 'harness_status', status: 'failed', bot: { state: 'unavailable' } } } },
    ] },
    herdr: {
      state: 'ok', session: 'main',
      status: { state: 'ok', value: {
        client: { version: '0.9.5', protocol: 22 },
        server: { status: 'running', version: { state: 'mismatch', expected: EXPECTED, actual: { version: '0.9.3', protocol: 22 } }, restart_needed: false },
      } },
      snapshot: { state: 'unavailable', reason: 'herdr_version_mismatch' },
    },
    notify: {
      state: 'ok', status: notifyStatus(now, 'disabled', { at: at(now - 2 * DAY), result: 'failed' }),
      channels: { webhook: 'configured', slack: 'configured', discord: 'missing', telegram: 'missing' },
      deliveries: { webhook: { at: at(now - 2 * DAY), result: 'failed' }, slack: { at: at(now - 3 * DAY), result: 'unsupported' }, discord: { at: null, result: 'missing' }, telegram: { at: null, result: 'missing' } },
    },
  };
}
