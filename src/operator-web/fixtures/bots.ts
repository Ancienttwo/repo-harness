// Bot access fixtures. Each passes the strict decoder. Like the collector's
// projection, none holds a token, passphrase, webhook URL or local path.
import type { BotAccessSnapshotV1 } from '../../core/operator/bot-access';
import type { NotifyDeliveryV1, NotifyStatusV1 } from '../../core/operator/notify-status';
import { slackTsToIso, type SlackReviewsSnapshotV1, type SlackReviewThreadV1 } from '../../core/operator/slack-review';
import { HARNESS_ID } from './dev-activity';

// The same registry ids as the Dev Activity fixture.
const SITE_ID = 'repo_1f2e3d4c5b6a7980';
const DOCS_ID = 'repo_0a1b2c3d4e5f6071';
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const at = (time: number) => new Date(time).toISOString();

/** The policy pin of the scenario; the server reads the real one from the registered repository policies. */
const PIN = { min_version: '0.1.17' };
const REGISTRY_REVISION = `sha256:${'4c'.repeat(32)}`;

function notifyStatus(now: number, last: NotifyDeliveryV1): NotifyStatusV1 {
  return {
    protocol: 2, kind: 'operator_notify_status', relay: 'live',
    config: { WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'configured', SLACK_WEBHOOK_URL: 'configured' },
    last_delivery: last, observed_at: at(now - 30_000),
  };
}

/** Every section read: two registered Bots, an hc core at the pin with three task terminals. */
export function busyBotAccess(now: number): BotAccessSnapshotV1 {
  const sent = at(now - 40 * MINUTE);
  return {
    protocol: 2, kind: 'operator_bot_access', observed_at: at(now - 20_000),
    bots: { state: 'ok', bots: [
      { bot_id: 'grok-pm', name: 'Grok PM', host: 'Grok', slack_bot_id: null, herdr_agent: 'grok-pm' },
      { bot_id: 'hermes', name: 'Hermes', host: 'Hermes', slack_bot_id: 'B07HERMES1', herdr_agent: 'hermes' },
    ] },
    mcp: { state: 'ok', doctor: {
      status: 'ready_user', package_version: '0.26.0', config_version_ok: true,
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
    hc: {
      state: 'ok', version: { state: 'ok', value: { state: 'aligned', expected: PIN, actual: { version: '0.1.17' } } }, herdr_app: { state: 'not_pinned' },
      terminals: { state: 'ok', value: [
        { address: 't12', name: 'task-1f0c2a9e4b7d3c5a8e61', status: 'working' },
        { address: 't1b', name: 'task-7a3e9c1d5b2f4e6a8c90', status: 'blocked' },
        { address: 't7', name: null, status: 'unknown' },
      ] },
    },
    notify: {
      state: 'ok', status: notifyStatus(now, { at: sent, result: 'failed' }),
      channels: { webhook: 'configured', slack: 'configured', discord: 'missing', telegram: 'missing' },
      deliveries: { webhook: { at: sent, result: 'succeeded' }, slack: { at: sent, result: 'failed' }, discord: { at: null, result: 'missing' }, telegram: { at: null, result: 'missing' } },
    },
  };
}

/**
 * The Bot registry and `mcp doctor` fail, one audit log is unreadable, the
 * notify relay is stopped, and the hc core is 0.1.15, below the pin (1-BOTS-F1).
 */
export function degradedBotAccess(now: number): BotAccessSnapshotV1 {
  return {
    protocol: 2, kind: 'operator_bot_access', observed_at: at(now - 6 * MINUTE),
    bots: { state: 'unavailable', reason: 'bot_registry_invalid' },
    mcp: { state: 'unavailable', reason: 'mcp_doctor_timeout' },
    registry: { state: 'ok', authorization_revision: 12, registry_revision: REGISTRY_REVISION, repos: [
      { repo_id: HARNESS_ID, label: 'repo-harness', access_mode: 'read_write', last_audit: { state: 'unavailable', reason: 'audit_unreadable' } },
      { repo_id: SITE_ID, label: 'operator-site', access_mode: 'read_only',
        last_audit: { state: 'ok', entry: { at: at(now - 2 * DAY), tool: 'harness_status', status: 'failed', bot: { state: 'unavailable' } } } },
    ] },
    hc: {
      state: 'ok', version: { state: 'ok', value: { state: 'mismatch', expected: PIN, actual: { version: '0.1.15' } } }, herdr_app: { state: 'not_pinned' },
      terminals: { state: 'unavailable', reason: 'hc_version_mismatch' },
    },
    // The relay terminal has ended: notices are paused until the manual restart command runs.
    notify: { state: 'unavailable', reason: 'relay_stopped' },
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
