// Bot access fixtures. Each passes the strict decoder. Like the collector's
// projection, none holds a token, passphrase, webhook URL or local path.
import type { BotAccessSnapshotV1 } from '../../core/operator/bot-access';
import { HERDR_OBSERVATION_PROTOCOL, HERDR_OBSERVATION_REVISION, HERDR_OBSERVATION_VERSION } from '../../core/operator/herdr-pin';
import { NOTIFY_PLUGIN_ID, type NotifyDeliveryV1, type NotifyStatusV1 } from '../../core/operator/notify-status';
import { slackTsToIso, type SlackReviewsSnapshotV1, type SlackReviewThreadV1 } from '../../core/operator/slack-review';
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

function notifyStatus(now: number, enabled: NotifyStatusV1['enabled'], last: NotifyDeliveryV1): NotifyStatusV1 {
  return {
    protocol: 1, kind: 'operator_notify_status', plugin_id: NOTIFY_PLUGIN_ID, linked: 'linked', enabled,
    config: { WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'configured', SLACK_WEBHOOK_URL: 'configured' },
    last_delivery: last, observed_at: at(now - 30_000),
  };
}

/** Every section read: two registered Bots, an aligned Herdr server with three agent panes. */
export function busyBotAccess(now: number): BotAccessSnapshotV1 {
  const sent = at(now - 40 * MINUTE);
  return {
    protocol: 1, kind: 'operator_bot_access', observed_at: at(now - 20_000),
    bots: { state: 'ok', bots: [
      { bot_id: 'grok-pm', name: 'Grok PM', host: 'Grok', slack_bot_id: null, herdr_agent: 'grok-pm' },
      { bot_id: 'hermes', name: 'Hermes', host: 'Hermes', slack_bot_id: 'B07HERMES1', herdr_agent: 'hermes' },
    ] },
    mcp: { state: 'ok', doctor: {
      status: 'ready_user', package_version: '0.25.0', config_version_ok: true,
      capabilities: { workspace_reader: true, workflow_planner: true, workflow_executor: true },
      registered_repo_count: 3, allowed_root_count: 1, unsafe_allowed_root_count: 0, legacy_full_disk_read: false,
    } },
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

const HARNESS_REPO = 'Ancienttwo/repo-harness';
// Heads are padded short SHAs: this file holds no 40-hex literal, so it cannot restate the Herdr pin revision.
const head = (short: string) => short.padEnd(40, '0');
/** The short head of #1440, the first real Dot round trip on 2026-11-02. */
const HEAD_1440 = head('15dbb25');
const HEAD_B = head('7c41e0a');
const HEAD_C = head('a3f9c2d');
const slackTs = (time: number) => `${Math.floor(time / 1000)}.000100`;

function thread(now: number, ageMs: number, fields: Omit<SlackReviewThreadV1, 'thread_ts' | 'requested_at' | 'replied_at'> & { readonly repliedAfterMs?: number }): SlackReviewThreadV1 {
  const { repliedAfterMs, ...rest } = fields;
  const ts = slackTs(now - ageMs);
  return { thread_ts: ts, requested_at: slackTsToIso(ts), replied_at: repliedAfterMs === undefined ? null : slackTsToIso(slackTs(now - ageMs + repliedAfterMs)), ...rest };
}

/** One thread per state, newest first, as the collector lists them. Result text never holds a URL or a path. */
export function busyBotReviews(now: number): SlackReviewsSnapshotV1 {
  return {
    protocol: 1, kind: 'operator_bot_reviews', reason: null, stale: false, truncated: false, collected_at: at(now - 25_000),
    threads: [
      thread(now, 4 * MINUTE, { repo: HARNESS_REPO, pr: 1450, head: HEAD_B, state: 'waiting', finding_count: null, text: { state: 'none' } }),
      thread(now, 9 * MINUTE, { repo: HARNESS_REPO, pr: 1449, head: HEAD_C, state: 'acknowledged', finding_count: null, text: { state: 'none' }, repliedAfterMs: 2 * MINUTE }),
      thread(now, 3 * HOUR, { repo: HARNESS_REPO, pr: 1440, head: HEAD_1440, state: 'result', finding_count: 1, repliedAfterMs: 10 * MINUTE, text: { state: 'shown', truncated: false,
        value: `repo-harness review result PR #1440 @ ${HEAD_1440}: 1 findings\nP2 docs/reference-configs/dot-review-protocol.md:41 The ack line does not say which head it acknowledges.` } }),
      thread(now, 5 * HOUR, { repo: HARNESS_REPO, pr: 1438, head: HEAD_C, state: 'head_mismatch', finding_count: 0, repliedAfterMs: 6 * MINUTE, text: { state: 'shown', truncated: false,
        value: `repo-harness review result PR #1438 @ ${HEAD_B}: 0 findings` } }),
      thread(now, 8 * HOUR, { repo: HARNESS_REPO, pr: 1436, head: HEAD_B, state: 'rejected', finding_count: null, repliedAfterMs: MINUTE, text: { state: 'text_withheld' } }),
      thread(now, 2 * DAY, { repo: null, pr: null, head: null, state: 'request_invalid', finding_count: null, text: { state: 'none' } }),
    ],
  };
}

/** Slack rate-limited the newest cycle: the previous threads stay, marked stale, from a history longer than one page. */
export function degradedBotReviews(now: number): SlackReviewsSnapshotV1 {
  return { ...busyBotReviews(now - 7 * MINUTE), reason: 'slack_rate_limited', stale: true, truncated: true };
}
