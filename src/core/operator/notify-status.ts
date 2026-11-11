import type { NotifyChannelSecretKey } from '../decision/notify-secret-keys';
import type { NotifyChannel, RelayAttemptV1, RelayDeliveriesV1 } from '../decision/notify-relay-record';

/** The channel keys whose presence the status shows. */
export const NOTIFY_STATUS_KEYS = ['WEBHOOK_URL', 'WEBHOOK_KEY', 'SLACK_WEBHOOK_URL'] as const satisfies readonly NotifyChannelSecretKey[];

export type NotifyConfigKey = typeof NOTIFY_STATUS_KEYS[number];
export type NotifyPresence = 'configured' | 'missing';

/** Why the notify status is unknown. A probe that fails is never read as "not configured". */
export const NOTIFY_SESSION_REASONS = ['notify_session_missing', 'notify_session_invalid'] as const;
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
