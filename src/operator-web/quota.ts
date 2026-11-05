import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeQuotaReport, OPERATOR_QUOTA_PATH, type QuotaReport } from '../core/operator/quota';
import { fetchSettings, type SettingsReader, type SettingsReason } from './settings';

/**
 * Browser side of `GET /api/v1/quota`. The route answers 503 `quota_busy` and
 * 502 `quota_invalid` as refusals, so `fetchSettings` names both `unreachable`
 * (decision on #1752, option A); Refresh is the recovery for all three.
 */
export type QuotaReader = SettingsReader<QuotaReport>;
export const fetchQuota: QuotaReader = signal => fetchSettings(OPERATOR_QUOTA_PATH, decodeQuotaReport, signal);

export type QuotaView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly reason: SettingsReason }
  | { readonly kind: 'ready'; readonly report: QuotaReport };

export interface QuotaSection {
  readonly view: QuotaView;
  readonly reading: boolean;
  readonly refresh: () => void;
}

/**
 * One read for each new `opened` value and one per Refresh; no polling. Null reads nothing.
 * A quota read starts provider processes on the server, so it never repeats on a timer.
 * A failed read replaces the report: a page shows no number it did not just read.
 */
export function useQuota(read: QuotaReader, opened: string | null): QuotaSection {
  const [view, setView] = useState<QuotaView>({ kind: 'loading' });
  const [reading, setReading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setReading(true);
    read(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      active.current = null;
      setReading(false);
      setView(result.state === 'ok' ? { kind: 'ready', report: result.settings } : { kind: 'unavailable', reason: result.reason });
    }, (error: unknown) => {
      if (!controller.signal.aborted) throw error;
    });
  }, [read]);
  useEffect(() => {
    if (opened === null) return;
    refresh();
    return () => { active.current?.abort(); active.current = null; };
  }, [opened, refresh]);
  return { view, reading, refresh };
}
