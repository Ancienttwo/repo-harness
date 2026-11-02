export const NOTIFY_STATUS_KEYS = ['WEBHOOK_URL', 'WEBHOOK_KEY', 'SLACK_WEBHOOK_URL'] as const;

export type NotifyConfigKey = typeof NOTIFY_STATUS_KEYS[number];
export type NotifyPresence = 'configured' | 'missing';
export const NOTIFY_CHANNELS = ['webhook', 'slack', 'discord', 'telegram'] as const;

export type NotifyChannel = typeof NOTIFY_CHANNELS[number];

/** Why the notify status is unknown. A probe that fails is never read as "not configured". */
export const NOTIFY_SESSION_REASONS = ['notify_session_missing', 'notify_session_invalid'] as const;
/** The relay install record is absent or unreadable. */
export type NotifySessionReason = typeof NOTIFY_SESSION_REASONS[number];
/** `relay_stopped`: hc answered, and no live terminal carries the relay labels. */
export const NOTIFY_UNAVAILABLE_REASONS = [...NOTIFY_SESSION_REASONS, 'hc_unavailable', 'relay_stopped', 'notify_config_unavailable'] as const;
export type NotifyUnavailableReason = typeof NOTIFY_UNAVAILABLE_REASONS[number];
export type NotifyDeliveryState = 'succeeded' | 'failed' | 'unavailable' | 'missing';

export interface NotifyDeliveryV1 {
  readonly at: string | null;
  readonly result: NotifyDeliveryState;
}

/** The newest recorded delivery of each channel. One channel's result never stands in for another's. */
export type NotifyChannelDeliveriesV1 = Readonly<Record<NotifyChannel, NotifyDeliveryV1>>;

export interface NotifyStatusV1 {
  readonly protocol: 2;
  readonly kind: 'operator_notify_status';
  /** A status exists only while the relay terminal is live; a stopped relay is `relay_stopped`. */
  readonly relay: 'live';
  readonly config: Readonly<Record<NotifyConfigKey, NotifyPresence>>;
  readonly last_delivery: NotifyDeliveryV1;
  readonly observed_at: string;
}

const PRESENCE = new Set<NotifyPresence>(['configured', 'missing']);
const DELIVERY = new Set<NotifyDeliveryState>(['succeeded', 'failed', 'unavailable', 'missing']);

export function decodeNotifyStatus(value: unknown): NotifyStatusV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('notify_status_invalid');
  const record = value as Partial<NotifyStatusV1>;
  const config = record.config as Partial<Record<NotifyConfigKey, NotifyPresence>> | undefined;
  const delivery = record.last_delivery;
  if (record.protocol !== 2 || record.kind !== 'operator_notify_status' || record.relay !== 'live'
    || typeof record.observed_at !== 'string'
    || !config || NOTIFY_STATUS_KEYS.some(key => !PRESENCE.has(config[key] as NotifyPresence))
    || !delivery || (delivery.at !== null && typeof delivery.at !== 'string') || !DELIVERY.has(delivery.result)) {
    throw new Error('notify_status_invalid');
  }
  return {
    protocol: 2,
    kind: 'operator_notify_status',
    relay: 'live',
    config: {
      WEBHOOK_URL: config.WEBHOOK_URL as NotifyPresence,
      WEBHOOK_KEY: config.WEBHOOK_KEY as NotifyPresence,
      SLACK_WEBHOOK_URL: config.SLACK_WEBHOOK_URL as NotifyPresence,
    },
    last_delivery: { at: delivery.at, result: delivery.result },
    observed_at: record.observed_at,
  };
}

/** One recorded attempt result. The relay writes it; the status reads it back. */
export interface RelayAttemptV1 {
  readonly at: string;
  readonly result: 'succeeded' | 'failed';
}

/**
 * The relay's delivery record: the newest attempt of each channel, and the newest event
 * (`last`), which succeeded only when every attempt it made succeeded. The relay is its one writer.
 */
export interface RelayDeliveriesV1 {
  readonly protocol: 1;
  readonly kind: 'notify_relay_deliveries';
  readonly last: RelayAttemptV1 | null;
  readonly channels: Readonly<Record<NotifyChannel, RelayAttemptV1 | null>>;
}

export const EMPTY_RELAY_DELIVERIES: RelayDeliveriesV1 = {
  protocol: 1, kind: 'notify_relay_deliveries', last: null,
  channels: { webhook: null, slack: null, discord: null, telegram: null },
};

const ISO = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;

function attempt(value: unknown): RelayAttemptV1 | null {
  if (value === null) return null;
  const record = value as Partial<RelayAttemptV1> | undefined;
  if (typeof record !== 'object' || Array.isArray(record) || Object.keys(record).length !== 2 || !ISO(record.at)
    || (record.result !== 'succeeded' && record.result !== 'failed')) throw new Error('relay_deliveries_invalid');
  return { at: record.at, result: record.result };
}

export function decodeRelayDeliveries(value: unknown): RelayDeliveriesV1 {
  const record = value as Partial<RelayDeliveriesV1> | null;
  const channels = record?.channels as Record<string, unknown> | undefined;
  if (typeof record !== 'object' || record === null || Array.isArray(record) || record.protocol !== 1 || record.kind !== 'notify_relay_deliveries'
    || typeof channels !== 'object' || channels === null || Array.isArray(channels)
    || Object.keys(channels).sort().join() !== [...NOTIFY_CHANNELS].sort().join()) throw new Error('relay_deliveries_invalid');
  return {
    protocol: 1, kind: 'notify_relay_deliveries', last: attempt(record.last),
    channels: { webhook: attempt(channels.webhook), slack: attempt(channels.slack), discord: attempt(channels.discord), telegram: attempt(channels.telegram) },
  };
}

const unavailable = (): NotifyDeliveryV1 => ({ at: null, result: 'unavailable' });
const shown = (value: RelayAttemptV1 | null): NotifyDeliveryV1 => value ?? { at: null, result: 'missing' };

/** `null` is an unreadable record: every channel is `unavailable`, never `missing`. */
export function readDeliveries(record: RelayDeliveriesV1 | null): {
  readonly last_delivery: NotifyDeliveryV1;
  readonly deliveries: NotifyChannelDeliveriesV1;
} {
  if (record === null) {
    return { last_delivery: unavailable(), deliveries: { webhook: unavailable(), slack: unavailable(), discord: unavailable(), telegram: unavailable() } };
  }
  const { channels } = record;
  return {
    last_delivery: shown(record.last),
    deliveries: { webhook: shown(channels.webhook), slack: shown(channels.slack), discord: shown(channels.discord), telegram: shown(channels.telegram) },
  };
}
