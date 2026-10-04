export const NOTIFY_PLUGIN_ID = 'aimpact.webhook-notify' as const;
export const NOTIFY_STATUS_KEYS = ['WEBHOOK_URL', 'WEBHOOK_KEY', 'SLACK_WEBHOOK_URL'] as const;

export type NotifyConfigKey = typeof NOTIFY_STATUS_KEYS[number];
export type NotifyPresence = 'configured' | 'missing';
export type NotifyLinkState = 'linked' | 'missing';
export type NotifyEnableState = 'enabled' | 'disabled' | 'missing';
export type NotifyDeliveryState = 'succeeded' | 'failed' | 'unsupported' | 'unavailable' | 'missing';

export interface NotifyDeliveryV1 {
  readonly at: string | null;
  readonly result: NotifyDeliveryState;
}

export interface NotifyStatusV1 {
  readonly protocol: 1;
  readonly kind: 'operator_notify_status';
  readonly plugin_id: typeof NOTIFY_PLUGIN_ID;
  readonly linked: NotifyLinkState;
  readonly enabled: NotifyEnableState;
  readonly config: Readonly<Record<NotifyConfigKey, NotifyPresence>>;
  readonly last_delivery: NotifyDeliveryV1;
  readonly observed_at: string;
}

const PRESENCE = new Set<NotifyPresence>(['configured', 'missing']);
const LINK = new Set<NotifyLinkState>(['linked', 'missing']);
const ENABLE = new Set<NotifyEnableState>(['enabled', 'disabled', 'missing']);
const DELIVERY = new Set<NotifyDeliveryState>(['succeeded', 'failed', 'unsupported', 'unavailable', 'missing']);

export function decodeNotifyStatus(value: unknown): NotifyStatusV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('notify_status_invalid');
  const record = value as Partial<NotifyStatusV1>;
  const config = record.config as Partial<Record<NotifyConfigKey, NotifyPresence>> | undefined;
  const delivery = record.last_delivery;
  if (record.protocol !== 1 || record.kind !== 'operator_notify_status' || record.plugin_id !== NOTIFY_PLUGIN_ID
    || !LINK.has(record.linked as NotifyLinkState) || !ENABLE.has(record.enabled as NotifyEnableState)
    || typeof record.observed_at !== 'string'
    || !config || NOTIFY_STATUS_KEYS.some(key => !PRESENCE.has(config[key] as NotifyPresence))
    || !delivery || (delivery.at !== null && typeof delivery.at !== 'string') || !DELIVERY.has(delivery.result)) {
    throw new Error('notify_status_invalid');
  }
  return {
    protocol: 1,
    kind: 'operator_notify_status',
    plugin_id: NOTIFY_PLUGIN_ID,
    linked: record.linked as NotifyLinkState,
    enabled: record.enabled as NotifyEnableState,
    config: {
      WEBHOOK_URL: config.WEBHOOK_URL as NotifyPresence,
      WEBHOOK_KEY: config.WEBHOOK_KEY as NotifyPresence,
      SLACK_WEBHOOK_URL: config.SLACK_WEBHOOK_URL as NotifyPresence,
    },
    last_delivery: { at: delivery.at, result: delivery.result },
    observed_at: record.observed_at,
  };
}
