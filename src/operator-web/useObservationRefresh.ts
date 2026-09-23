import { useCallback, useEffect, useRef } from 'react';

const OBSERVATION_INTERVAL_MS = 30_000;

/** Owns only request lifetime. Readers retain decoding, source state and errors.
 * A promise must retire before the same loop can start its queued request. */
export function useObservationRefresh(
  read: (signal: AbortSignal) => Promise<boolean>,
  identity: string,
  { enabled = true, immediate = true }: { readonly enabled?: boolean; readonly immediate?: boolean } = {},
): () => void {
  const requestRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let active: AbortController | null = null;
    let latest: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let queued = false;
    let failures = 0;
    const visible = () => document.visibilityState !== 'hidden';
    const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
    const schedule = () => {
      if (disposed || active || !visible()) return;
      clearTimer();
      timer = setTimeout(request, OBSERVATION_INTERVAL_MS * 2 ** failures);
    };
    const request = () => {
      if (disposed) return;
      clearTimer();
      if (!visible() || active) { queued = true; return; }
      queued = false;
      latest?.abort();
      const controller = new AbortController();
      active = controller; latest = controller;
      void Promise.resolve().then(() => controller.signal.aborted ? false : read(controller.signal)).catch(() => false).then(success => {
        active = null;
        if (disposed) return;
        if (!controller.signal.aborted) failures = success ? 0 : Math.min(failures + 1, 2);
        if (queued && visible()) request();
        else schedule();
      });
    };
    const visibilityChanged = () => {
      if (visible()) request();
      else { clearTimer(); queued = false; latest?.abort(); }
    };
    requestRef.current = request;
    document.addEventListener('visibilitychange', visibilityChanged);
    if (immediate) request(); else schedule();
    return () => {
      disposed = true;
      clearTimer(); latest?.abort();
      document.removeEventListener('visibilitychange', visibilityChanged);
      if (requestRef.current === request) requestRef.current = () => {};
    };
  }, [read, identity, enabled, immediate]);
  return useCallback(() => requestRef.current(), []);
}
