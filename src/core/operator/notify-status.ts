export const NOTIFY_PLUGIN_ID = 'aimpact.webhook-notify' as const;
export const NOTIFY_STATUS_KEYS = ['WEBHOOK_URL', 'WEBHOOK_KEY', 'SLACK_WEBHOOK_URL'] as const;

export type NotifyConfigKey = typeof NOTIFY_STATUS_KEYS[number];
export type NotifyPresence = 'configured' | 'missing';
export type NotifyLinkState = 'linked' | 'missing';
export type NotifyEnableState = 'enabled' | 'disabled' | 'missing';
export const NOTIFY_CHANNELS = ['webhook', 'slack', 'discord', 'telegram'] as const;

export type NotifyChannel = typeof NOTIFY_CHANNELS[number];
export type NotifyDeliveryState = 'succeeded' | 'failed' | 'unsupported' | 'unavailable' | 'missing';

export interface NotifyDeliveryV1 {
  readonly at: string | null;
  readonly result: NotifyDeliveryState;
}

/** The newest recorded delivery of each channel. One channel's result never stands in for another's. */
export type NotifyChannelDeliveriesV1 = Readonly<Record<NotifyChannel, NotifyDeliveryV1>>;

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

export interface NotifyLogEntry {
  readonly finished_unix_ms?: unknown;
  readonly stderr?: unknown;
}

type AttemptResult = 'succeeded' | 'failed';

interface LogEntryReading {
  /** A result for every channel the entry names. */
  readonly attempts: Partial<Record<NotifyChannel, AttemptResult>>;
  /** True when a line is in no format the reader knows. It could belong to any channel. */
  readonly unknown: boolean;
}

const is2xx = (code: string) => Number(code) >= 200 && Number(code) < 300;
const CHANNEL_NAMES: Readonly<Record<string, NotifyChannel>> = {
  WEBHOOK: 'webhook', SLACK: 'slack', DISCORD: 'discord', TELEGRAM: 'telegram',
};
const LEGACY_CHANNEL_NAMES: Readonly<Record<string, NotifyChannel>> = { POST: 'webhook', SLACK: 'slack' };

type LineReading = { readonly channel: NotifyChannel; readonly result: AttemptResult } | 'ignored' | null;

/**
 * Every stderr line format the reader knows. The current plugin writes
 * `<CHANNEL>: HTTP <status>[ app-failed]` or `<CHANNEL>: delivery failed.`. The 0.1.0
 * plugin, still installed on some machines, writes `POST|SLACK <identity> -> <status>`
 * or `POST|SLACK failed: <reason>`. Lines that record no attempt are `ignored`; a line in
 * no known format is `null`.
 */
function readLine(line: string): LineReading {
  let match = line.match(/^\[webhook-notify\] ([A-Z]+): HTTP (\d{3})( app-failed)?$/u);
  if (match) {
    const channel = CHANNEL_NAMES[match[1]!];
    return channel ? { channel, result: is2xx(match[2]!) && match[3] === undefined ? 'succeeded' : 'failed' } : null;
  }
  match = line.match(/^\[webhook-notify\] ([A-Z]+): delivery failed\.$/u);
  if (match) {
    const channel = CHANNEL_NAMES[match[1]!];
    return channel ? { channel, result: 'failed' } : null;
  }
  match = line.match(/^\[webhook-notify\] (POST|SLACK) \S+ -> (\d{3})$/u);
  if (match) return { channel: LEGACY_CHANNEL_NAMES[match[1]!]!, result: is2xx(match[2]!) ? 'succeeded' : 'failed' };
  match = line.match(/^\[webhook-notify\] (POST|SLACK) failed: /u);
  if (match) return { channel: LEGACY_CHANNEL_NAMES[match[1]!]!, result: 'failed' };
  if (/^\[webhook-notify\] (?:Invalid config, event, or state\.|Cannot read debounce state\. Using empty state\.)$/u.test(line)
    || /^\[webhook-notify\] (?:invalid \S+: |skip test workspace |no target configured |debounced |state write failed: |error: )/u.test(line)) return 'ignored';
  return null;
}

function readEntry(stderr: string): LogEntryReading {
  const attempts: Partial<Record<NotifyChannel, AttemptResult>> = {};
  let unknown = false;
  for (const line of stderr.split('\n').map(item => item.trimEnd()).filter(Boolean)) {
    const reading = readLine(line);
    if (reading === null) unknown = true;
    else if (reading !== 'ignored' && attempts[reading.channel] !== 'failed') attempts[reading.channel] = reading.result;
  }
  return { attempts, unknown };
}

function finishedAt(entry: NotifyLogEntry | null | undefined): number | null {
  const finished = entry?.finished_unix_ms;
  return typeof finished === 'number' && Number.isSafeInteger(finished) && finished >= 0 ? finished : null;
}

const unavailable = (): NotifyDeliveryV1 => ({ at: null, result: 'unavailable' });

/**
 * Herdr does not promise log order, so the newest finish time selects the entry. An entry
 * without a valid finish time cannot be placed in time and is skipped. A channel's newest
 * entry is the newest one that names the channel, or that holds a line the reader cannot
 * interpret (`unsupported`, never `missing`). The combined record is the newest entry with
 * any attempt; it succeeded only when every attempt in it succeeded.
 */
export function readDeliveries(logs: readonly NotifyLogEntry[] | null): {
  readonly last_delivery: NotifyDeliveryV1;
  readonly deliveries: NotifyChannelDeliveriesV1;
} {
  if (logs === null) {
    return { last_delivery: unavailable(), deliveries: { webhook: unavailable(), slack: unavailable(), discord: unavailable(), telegram: unavailable() } };
  }
  const newest = new Map<NotifyChannel | 'any', { readonly finished: number; readonly result: NotifyDeliveryState }>();
  const keep = (key: NotifyChannel | 'any', finished: number, result: NotifyDeliveryState) => {
    const current = newest.get(key);
    if (current === undefined || finished > current.finished) newest.set(key, { finished, result });
  };
  for (const entry of logs) {
    const finished = finishedAt(entry);
    if (finished === null) continue;
    const { attempts, unknown } = readEntry(typeof entry?.stderr === 'string' ? entry.stderr : '');
    const results = Object.values(attempts);
    for (const channel of NOTIFY_CHANNELS) {
      const result = attempts[channel];
      if (result !== undefined) keep(channel, finished, result);
      else if (unknown) keep(channel, finished, 'unsupported');
    }
    if (unknown) keep('any', finished, 'unsupported');
    else if (results.length > 0) keep('any', finished, results.every(result => result === 'succeeded') ? 'succeeded' : 'failed');
  }
  const delivery = (key: NotifyChannel | 'any'): NotifyDeliveryV1 => {
    const found = newest.get(key);
    return found === undefined ? { at: null, result: 'missing' } : { at: new Date(found.finished).toISOString(), result: found.result };
  };
  return {
    last_delivery: delivery('any'),
    deliveries: { webhook: delivery('webhook'), slack: delivery('slack'), discord: delivery('discord'), telegram: delivery('telegram') },
  };
}
