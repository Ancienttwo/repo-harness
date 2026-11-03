import {
  readDeliveries,
  type NotifyChannel,
  type NotifyChannelDeliveriesV1,
  type NotifyConfigKey,
  type NotifyPresence,
  type NotifyStatusV1,
  type NotifyUnavailableReason,
  type RelayDeliveriesV1,
} from '../../core/operator/notify-status';
import { hcListAsync } from '../terminal/herdr-core';
import { readNotifyConfig, readNotifyInstallRecord, readRelayDeliveries, relayIsLive, type NotifyConfig } from '../terminal/notify-read';

/** A probe failed, so the status is unknown. The code is public; the cause stays here. */
export class NotifyStatusUnavailableError extends Error {
  constructor(readonly code: NotifyUnavailableReason) {
    super(code);
    this.name = 'NotifyStatusUnavailableError';
  }
}

const HC_TIMEOUT_MS = 10_000;

export interface NotifyStatusReadInput {
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: Date;
  /** Deadline of the hc call. */
  readonly timeout_ms?: number;
}

function presence(config: Partial<NotifyConfig>, ...keys: readonly (keyof NotifyConfig)[]): NotifyPresence {
  return keys.every(key => config[key]) ? 'configured' : 'missing';
}

interface ConfigPresence {
  readonly config: Record<NotifyConfigKey, NotifyPresence>;
  /** A channel is configured when the relay would send to it. */
  readonly channels: Record<NotifyChannel, NotifyPresence>;
}

function presences(config: Partial<NotifyConfig>): ConfigPresence {
  return {
    config: {
      WEBHOOK_URL: presence(config, 'WEBHOOK_URL'),
      WEBHOOK_KEY: presence(config, 'WEBHOOK_KEY'),
      SLACK_WEBHOOK_URL: presence(config, 'SLACK_WEBHOOK_URL'),
    },
    channels: {
      webhook: presence(config, 'WEBHOOK_URL', 'WEBHOOK_KEY'),
      slack: presence(config, 'SLACK_WEBHOOK_URL'),
      discord: presence(config, 'DISCORD_WEBHOOK_URL'),
      telegram: presence(config, 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'),
    },
  };
}

export interface NotifyChannelStatus {
  readonly status: NotifyStatusV1;
  readonly channels: Readonly<Record<NotifyChannel, NotifyPresence>>;
}

/** Adds the newest recorded delivery of each channel to the status. */
export interface NotifyChannelDeliveryStatus extends NotifyChannelStatus {
  readonly deliveries: NotifyChannelDeliveriesV1;
}

/**
 * The status, whether each channel is configured, and each channel's newest delivery,
 * from one read. Values stay out. A missing or invalid install record, an hc that does
 * not answer, no live relay terminal, or an unreadable or invalid config throws NotifyStatusUnavailableError.
 * An unreadable delivery record shows each channel as `unavailable`.
 */
export async function readNotifyChannelStatus(input: NotifyStatusReadInput = {}): Promise<NotifyChannelDeliveryStatus> {
  const env = { ...process.env, ...input.env };
  const record = readNotifyInstallRecord(env);
  if (record.state === 'missing') throw new NotifyStatusUnavailableError('notify_session_missing');
  if (record.state === 'invalid') throw new NotifyStatusUnavailableError('notify_session_invalid');
  let relays;
  try { relays = await hcListAsync(record.relay.labels, { env, timeoutMs: input.timeout_ms ?? HC_TIMEOUT_MS }); }
  catch { throw new NotifyStatusUnavailableError('hc_unavailable'); }
  if (!relayIsLive(relays, record.relay)) throw new NotifyStatusUnavailableError('relay_stopped');
  let config;
  try { config = presences(readNotifyConfig(env) ?? {}); }
  catch { throw new NotifyStatusUnavailableError('notify_config_unavailable'); }
  let saved: RelayDeliveriesV1 | null;
  try { saved = readRelayDeliveries(env); } catch { saved = null; }
  const { last_delivery, deliveries } = readDeliveries(saved);
  return { channels: config.channels, deliveries, status: {
    protocol: 2,
    kind: 'operator_notify_status',
    relay: 'live',
    config: config.config,
    last_delivery,
    observed_at: (input.now ?? new Date()).toISOString(),
  } };
}
