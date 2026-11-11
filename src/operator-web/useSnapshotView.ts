import { useCallback, useState } from 'react';
import { useObservationRefresh } from './useObservationRefresh';

/** A failed refresh keeps the last good snapshot and says so. */
export type SnapshotView<Snapshot> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'ready'; readonly snapshot: Snapshot; readonly refreshFailed: boolean };

/**
 * Reads one cached server snapshot while `enabled`. A new `generation` reads
 * at once; `reload` reads again at once. An `initial` snapshot is shown without
 * a first read.
 */
export function useSnapshotView<Snapshot>(
  key: string,
  read: (signal: AbortSignal) => Promise<Snapshot>,
  initial: Snapshot | undefined,
  generation: number,
  enabled = true,
): { readonly view: SnapshotView<Snapshot>; readonly reload: () => void } {
  const [view, setView] = useState<SnapshotView<Snapshot>>(() => initial ? { kind: 'ready', snapshot: initial, refreshFailed: false } : { kind: 'loading' });
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    try {
      const snapshot = await read(signal);
      if (signal.aborted) return false;
      setView({ kind: 'ready', snapshot, refreshFailed: false });
      return true;
    } catch {
      if (signal.aborted) return false;
      setView(current => current.kind === 'ready' ? { ...current, refreshFailed: true } : { kind: 'unreachable' });
      return false;
    }
  }, [read]);
  const reload = useObservationRefresh(observe, JSON.stringify([key, generation]), { enabled, immediate: initial === undefined || generation > 0 });
  return { view, reload };
}
