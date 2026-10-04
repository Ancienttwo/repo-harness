import { useCallback, useState } from 'react';
import { decodeNotifyStatus, NOTIFY_STATUS_KEYS, type NotifyStatusV1 } from '../core/operator/notify-status';
import { useObservationRefresh } from './useObservationRefresh';
import type { OperatorTranslate } from './i18n';

export type NotifyStatusReader = (signal: AbortSignal) => Promise<NotifyStatusV1>;

type NotifyView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly status: NotifyStatusV1 }
  | { readonly kind: 'unavailable' };

async function fetchNotifyStatus(signal: AbortSignal): Promise<NotifyStatusV1> {
  const response = await fetch('/api/v1/notify/status', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('notify_status_unavailable');
  return decodeNotifyStatus(await response.json());
}

/** Read-only facts. No control changes plugin state. */
export function NotifyStatusPanel({
  readStatus = fetchNotifyStatus,
  initialStatus,
  t,
}: {
  readonly readStatus?: NotifyStatusReader;
  readonly initialStatus?: NotifyStatusV1;
  readonly t: OperatorTranslate;
}) {
  const [view, setView] = useState<NotifyView>(initialStatus ? { kind: 'ready', status: initialStatus } : { kind: 'loading' });
  const read = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    try {
      const status = await readStatus(signal);
      if (!signal.aborted) setView({ kind: 'ready', status });
      return true;
    } catch {
      if (!signal.aborted) setView({ kind: 'unavailable' });
      return false;
    }
  }, [readStatus]);
  useObservationRefresh(read, 'notify-status', { immediate: initialStatus === undefined });
  return (
    <section className="notify-status" aria-labelledby="notify-status-heading" data-notify-state={view.kind}>
      <header className="notify-status__heading">
        <p>{t('notify.eyebrow')}</p>
        <h2 id="notify-status-heading">{t('notify.title')}</h2>
      </header>
      {view.kind === 'loading' && <p role="status">{t('notify.loading')}</p>}
      {view.kind === 'unavailable' && <p role="status">{t('notify.unavailable')}</p>}
      {view.kind === 'ready' && <NotifyFacts status={view.status} t={t} />}
    </section>
  );
}

function NotifyFacts({ status, t }: { readonly status: NotifyStatusV1; readonly t: OperatorTranslate }) {
  return (
    <dl className="detail-list">
      <div><dt>{t('notify.plugin')}</dt><dd>{status.plugin_id}</dd></div>
      <div><dt>{t('notify.linked')}</dt><dd>{t(`notify.link.${status.linked}`)}</dd></div>
      <div><dt>{t('notify.enabled')}</dt><dd>{t(`notify.enable.${status.enabled}`)}</dd></div>
      {NOTIFY_STATUS_KEYS.map(key => (
        <div key={key}><dt>{key}</dt><dd>{t(`notify.presence.${status.config[key]}`)}</dd></div>
      ))}
      <div>
        <dt>{t('notify.lastDelivery')}</dt>
        <dd>
          {status.last_delivery.at && <time dateTime={status.last_delivery.at}>{status.last_delivery.at}</time>}
          <span>{t(`notify.delivery.${status.last_delivery.result}`)}</span>
        </dd>
      </div>
    </dl>
  );
}
