// Background notify status collector. It runs only in the `operator serve`
// process on a timer. It is the one owner of the notify relay probe
// (`hc ls --label repo-harness.role=notify-relay`): GET notify_status
// and the Bot access collector read its cache and run no probe of their own.

import type { NotifyUnavailableReason } from '../../core/operator/notify-status';
import { startObservationLoop, replaceObservation } from '../observation-loop';
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
 * Keep rule: a failed probe replaces the older status, so no stale status is served as current.
 */
export function startNotifyCollector(options: NotifyCollectorOptions = {}): NotifyCollectorHandle {
  const loop = startObservationLoop<NotifyChannelDeliveryStatus, NotifyUnavailableReason>({
    cycle: async () => {
      try { return { state: 'observed', value: await (options.read ?? readNotifyChannelStatus)({ env: options.env }) }; }
      catch (error) { return { state: 'unavailable', reason: error instanceof NotifyStatusUnavailableError ? error.code : 'hc_unavailable' }; }
    },
    keep: replaceObservation,
    failure: 'hc_unavailable',
    interval_ms: options.interval_ms ?? NOTIFY_COLLECT_INTERVAL_MS,
  });
  return Object.freeze({
    read: (): NotifyCacheV1 => {
      const state = loop.read();
      if (state.state === 'pending') return { state: 'pending' };
      if (state.state === 'unavailable') return { state: 'unavailable', reason: state.reason };
      return { state: 'ok', value: state.value };
    },
    settled: loop.settled,
    close: loop.close,
  });
}
