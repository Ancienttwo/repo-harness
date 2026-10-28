import { useCallback, useState } from 'react';
import { decodeRuntimeOverlay, nativeRuntimeFreshness, unavailableRuntimeOverlay, type RuntimeOverlay } from '../core/operator/runtime-status';
import type { NativeRuntimeState } from '../core/operator/runtime-capture';
import { useObservationRefresh } from './useObservationRefresh';
import { formatRelativeAge, type OperatorTranslate, type OperatorMessageKey } from './i18n';

export type RuntimeOverlayReader = (signal: AbortSignal) => Promise<RuntimeOverlay>;
export async function fetchRuntimeOverlay(signal: AbortSignal): Promise<RuntimeOverlay> {
  const response = await fetch('/api/v1/runtime/status', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('runtime_overlay_unavailable');
  return decodeRuntimeOverlay(await response.json());
}
export interface RuntimeView { overlay: RuntimeOverlay; failed: boolean }
export function useRuntimeOverlay(read: RuntimeOverlayReader, initial: RuntimeOverlay | undefined, active: boolean, generation: number): RuntimeView {
  const [view, setView] = useState<RuntimeView>(() => ({ overlay: initial ? decodeRuntimeOverlay(initial) : unavailableRuntimeOverlay(), failed: false }));
  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const overlay = decodeRuntimeOverlay(await read(signal));
      if (signal.aborted) return false;
      setView({ overlay, failed: false }); return true;
    } catch {
      if (signal.aborted) return false;
      setView(current => ({ ...current, failed: true })); return false;
    }
  }, [read]);
  useObservationRefresh(refresh, JSON.stringify(['runtime-overlay', generation]), { enabled: active, immediate: initial === undefined || generation > 0 });
  return view;
}
const LABELS: Record<NativeRuntimeState, OperatorMessageKey> = {
  unknown: 'runtimeObservation.state.unknown', idle: 'runtimeObservation.state.idle', working: 'runtimeObservation.state.working', blocked: 'runtimeObservation.state.blocked',
  settled: 'runtimeNative.settled', error: 'runtimeObservation.state.error', cancelled: 'runtimeObservation.state.cancelled',
};
export function RuntimeSummary({ view, now, t }: { view: RuntimeView; now: number; t: OperatorTranslate }) {
  const { overlay, failed } = view;
  return <><div className="runtime-summary" data-runtime-status={failed ? 'refresh-failed' : overlay.status} role="status">
    <span>{t(failed ? 'runtimeObservation.refreshFailed' : overlay.status === 'unavailable' ? 'runtimeObservation.unavailable' : 'runtimeObservation.readOnly')}</span>
    {overlay.native_sources.length === 0 && <span>{t('runtimeObservation.unclaimed', { count: overlay.unclaimed })}</span>}
    {overlay.observed_at && <time dateTime={overlay.observed_at} title={overlay.observed_at}>{formatRelativeAge(overlay.observed_at, now, t)}</time>}
  </div>
    <NativeRuntimeSources overlay={overlay} now={now} t={t} />
  </>;
}

function NativeRuntimeSources({ overlay, now, t }: { overlay: RuntimeOverlay; now: number; t: OperatorTranslate }) {
  if (overlay.native_sources.length === 0) return null;
  return <section className="native-runtime" aria-label={t('runtimeNative.heading')} data-native-runtime>
    <h3>{t('runtimeNative.heading')}</h3>
    <p>{t('runtimeNative.boundary')}</p>
    <ul className="native-runtime-sources">
      {overlay.native_sources.map(source => {
        // Retain server rejection states. Only a current source can age locally.
        const freshness = source.freshness === 'fresh' ? nativeRuntimeFreshness(source, now) : source.freshness;
        return <li key={source.source_id} data-native-source={source.source_id}>
          <div className="runtime-run">
            <strong className="mono-value">{source.provider} · {source.source_id}</strong>
            <span className="operator-badge tone-neutral" data-native-capture={source.capture_status}>{t(`runtimeNative.capture.${source.capture_status}`)}</span>
            <span className={`operator-badge ${freshness === 'fresh' ? 'tone-neutral' : 'tone-danger'}`} data-native-freshness={freshness}>{t(`runtimeNative.freshness.${freshness}`)}</span>
          </div>
          <p>{t('runtimeNative.heartbeat')}: {source.heartbeat_at ? <time dateTime={source.heartbeat_at} title={source.heartbeat_at}>{formatRelativeAge(source.heartbeat_at, now, t)}</time> : t('field.none')}</p>
          {source.observations.length === 0 ? <p data-native-empty>{t('runtimeNative.empty')}</p> : <ul className="native-runtime-observations">
            {source.observations.map(observation => <li key={JSON.stringify([observation.scope, observation.session_id, observation.turn_id])}>
              <div className="runtime-run">
                <span>{t(`runtimeNative.scope.${observation.scope}`)}{observation.session_id && <> · <span className="mono-value">{observation.session_id}</span></>}</span>
                <span className={`operator-badge ${['blocked', 'error'].includes(observation.state) ? 'tone-danger' : observation.state === 'working' ? 'tone-agent' : 'tone-neutral'}`} data-native-state={observation.state}>{t(LABELS[observation.state])}</span>
                {observation.state === 'blocked' && <span className="operator-badge tone-user">{t(`runtimeObservation.reason.${observation.reason}`)}</span>}
              </div>
              <p>{t('runtimeNative.eventReceived')}: <time dateTime={observation.event_received_at} title={observation.event_received_at}>{formatRelativeAge(observation.event_received_at, now, t)}</time></p>
              {observation.changed_at && <p>{t('runtimeNative.changed')}: <time dateTime={observation.changed_at} title={observation.changed_at}>{formatRelativeAge(observation.changed_at, now, t)}</time></p>}
            </li>)}
          </ul>}
        </li>;
      })}
    </ul>
  </section>;
}
