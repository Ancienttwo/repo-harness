import type { WatchClock } from './vendor/policy.ts';

export interface BaselineObservation { ready: boolean; unavailable: boolean; key: string }
// Minimal bounded poller. The collector owns readiness. This stub owns only
// cadence and duplicate suppression. It has no provider or merge operations.
export async function simplePoll(args: {
  read: () => BaselineObservation;
  clock: WatchClock;
  emit: (observation: BaselineObservation) => void;
  interval: number;
  timeout: number;
}) {
  const start = args.clock.now();
  let lastKey: string | null = null;
  let polls = 0;
  for (;;) {
    const value = args.read();
    polls++;
    if (value.key !== lastKey) { args.emit(value); lastKey = value.key; }
    if (value.ready) return { outcome: 'ready' as const, polls };
    if (!value.unavailable && !value.key.includes('checks_pending')) return { outcome: 'blocked' as const, polls };
    if (args.clock.now() - start >= args.timeout) return { outcome: 'timeout' as const, polls };
    await args.clock.sleep(args.interval);
  }
}
