// The on-disk relay delivery record: the notify relay in task-agent-host writes it, and the
// notify read contract decodes it once for the relay and the operator.

/** Writes the config and starts the relay; the operator shows it when no install record exists. */
export const NOTIFY_INSTALL_COMMAND = 'rh herdr notify install';
/** The one manual command that starts the relay terminal again; the relay never restarts itself. */
export const NOTIFY_START_COMMAND = 'rh herdr notify start';

/** The channels the relay sends to. The record keys each channel's newest attempt by these names. */
export const NOTIFY_CHANNELS = ['webhook', 'slack', 'discord', 'telegram'] as const;

export type NotifyChannel = typeof NOTIFY_CHANNELS[number];

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
