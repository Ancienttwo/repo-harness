import { useCallback, useState } from 'react';
import { decodeRuntimeOverlay, RUNTIME_STALE_AFTER_MS, unavailableRuntimeOverlay, type RuntimeOverlay, type RuntimeBadge } from '../core/operator/runtime-status';
import type { PipelineCard } from '../core/pipeline/board';
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
const LABELS: Record<RuntimeBadge['state'], OperatorMessageKey> = {
  unknown: 'runtimeObservation.state.unknown', idle: 'runtimeObservation.state.idle', working: 'runtimeObservation.state.working', blocked: 'runtimeObservation.state.blocked',
  'done-unseen': 'runtimeObservation.state.done-unseen', settled: 'runtimeObservation.state.settled', error: 'runtimeObservation.state.error', cancelled: 'runtimeObservation.state.cancelled', clear: 'runtimeObservation.state.clear',
};
export function runtimeBadgesForCard(card: PipelineCard, overlay: RuntimeOverlay): RuntimeBadge[] {
  const matches = overlay.badges.filter(b => b.identity.source_host === card.source_host && b.identity.repository_id === card.repository_id && b.identity.task === card.task && b.identity.pipeline_state_version === card.state_version && card.runs.some(r => r.role === b.identity.role && r.round === b.identity.round) && !card.runs.some(r => r.role === b.identity.role && r.round > b.identity.round));
  // Two attempt/request identities for one current run are ambiguous. Claim neither.
  return matches.filter(b => matches.filter(other => other.identity.role === b.identity.role && other.identity.round === b.identity.round).length === 1);
}
export function RuntimeSummary({ view, now, t }: { view: RuntimeView; now: number; t: OperatorTranslate }) {
  const { overlay, failed } = view;
  return <div className="pipeline-runtime-summary" data-runtime-status={failed ? 'refresh-failed' : overlay.status} role="status">
    <span>{t(failed ? 'runtimeObservation.refreshFailed' : overlay.status === 'unavailable' ? 'runtimeObservation.unavailable' : 'runtimeObservation.readOnly')}</span>
    <span>{t('runtimeObservation.unclaimed', { count: overlay.unclaimed })}</span>
    {overlay.observed_at && <time dateTime={overlay.observed_at} title={overlay.observed_at}>{t('runtimeObservation.observed')} {formatRelativeAge(overlay.observed_at, now, t)}</time>}
  </div>;
}
export function RuntimeCardBadges({ card, view, now, t }: { card: PipelineCard; view: RuntimeView; now: number; t: OperatorTranslate }) {
  const badges = runtimeBadgesForCard(card, view.overlay);
  return <div className="pipeline-runtime-badges" aria-label={t('runtimeObservation.heading')}>
    {badges.length === 0 ? <span className="operator-badge tone-neutral" data-runtime-state="unknown">{t('runtimeObservation.heading')}: {t('runtimeObservation.state.unknown')}</span> : badges.map(b => {
      const freshness = b.freshness === 'disconnected' ? 'disconnected' : view.overlay.observed_at && now - Date.parse(view.overlay.observed_at) > RUNTIME_STALE_AFTER_MS ? 'stale' : b.freshness;
      const tone = ['blocked','error'].includes(b.state) ? 'tone-danger' : b.state === 'working' ? 'tone-agent' : 'tone-neutral';
      return <span className="pipeline-runtime-run" key={JSON.stringify(b.identity)}>
        <span className={`operator-badge ${tone}`} data-runtime-state={b.state}>{b.identity.role} · {t(LABELS[b.state])}</span>
        {b.state === 'blocked' && <span className="operator-badge tone-user">{t(`runtimeObservation.reason.${b.reason}`)}</span>}
        <span className={`operator-badge ${freshness === 'fresh' ? 'tone-neutral' : 'tone-danger'}`} data-runtime-freshness={freshness}>{t(`runtimeObservation.freshness.${freshness}`)}</span>
      </span>;
    })}
  </div>;
}
