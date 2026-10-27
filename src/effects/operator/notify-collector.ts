// Background notify status collector. It runs only in the `operator serve`
// process on a timer. It is the one owner of the Herdr notify probes
// (`plugin list`, `plugin config-dir`, `plugin log list`): GET notify_status
// and the Bot access collector read its cache and run no probe of their own.

import type { NotifyUnavailableReason } from '../../core/operator/notify-status';
import { NotifyStatusUnavailableError, readNotifyChannelStatus, type NotifyChannelDeliveryStatus, type NotifyStatusReadInput } from './notify-status';

export const NOTIFY_COLLECT_INTERVAL_MS = 60_000;

/** `unavailable` replaces an older value: a failed probe shows no stale status as current. */
export type NotifyCacheV1 =
  | { readonly state: 'pending' }
  | { readonly state: 'unavailable'; readonly reason: NotifyUnavailableReason }
  | { readonly state: 'ok'; readonly value: NotifyChannelDeliveryStatus };

export interface NotifyCollectorOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly interval_ms?: number;
  readonly read?: (input: NotifyStatusReadInput) => Promise<NotifyChannelDeliveryStatus>;
}

export interface NotifyCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: () => NotifyCacheV1;
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/**
 * Collect at start, then every interval after the previous cycle settles. Cycles never overlap.
 * Each cycle reads the install record first, so a new install takes effect without a restart.
 */
export function startNotifyCollector(options: NotifyCollectorOptions = {}): NotifyCollectorHandle {
  let cache: NotifyCacheV1 = { state: 'pending' };
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  const cycle = (): Promise<void> => {
    inflight = (options.read ?? readNotifyChannelStatus)({ env: options.env })
      .then(value => { if (!closed) cache = { state: 'ok', value }; }, (error: unknown) => {
        if (!closed) cache = { state: 'unavailable', reason: error instanceof NotifyStatusUnavailableError ? error.code : 'herdr_unavailable' };
      })
      .finally(() => {
        inflight = null;
        if (closed) return;
        timer = setTimeout(() => { void cycle(); }, options.interval_ms ?? NOTIFY_COLLECT_INTERVAL_MS);
        timer.unref?.();
      });
    return inflight;
  };
  void cycle();
  return Object.freeze({
    read: () => cache,
    settled: () => inflight ?? Promise.resolve(),
    close: async () => {
      closed = true;
      clearTimeout(timer);
      await inflight;
    },
  });
}
