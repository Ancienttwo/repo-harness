import { useCallback, useState } from 'react';
import { decodeRuntimeOverlay, RUNTIME_STALE_AFTER_MS, unavailableRuntimeOverlay, type RuntimeOverlay, type RuntimeBadge, type RuntimePaneBadge } from '../core/operator/runtime-status';
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
export function runtimePaneReportsForCard(card: PipelineCard, overlay: RuntimeOverlay): RuntimePaneBadge[] {
  const matches = overlay.pane_observations.filter(report => {
    const identity = report.binding;
    return identity !== null && identity.source_host === card.source_host && identity.repository_id === card.repository_id &&
      identity.task === card.task && identity.pipeline_state_version === card.state_version &&
      card.runs.some(run => run.role === identity.role && run.round === identity.round) &&
      !card.runs.some(run => run.role === identity.role && run.round > identity.round);
  });
  // A card run with more than one linked pane is ambiguous. Show neither report.
  return matches.filter(report => matches.filter(other => other.binding!.role === report.binding!.role && other.binding!.round === report.binding!.round).length === 1);
}
function snapshotFreshness(freshness: RuntimeBadge['freshness'], overlay: RuntimeOverlay, now: number): RuntimeBadge['freshness'] {
  return freshness === 'disconnected' ? 'disconnected' : overlay.observed_at && now - Date.parse(overlay.observed_at) > RUNTIME_STALE_AFTER_MS ? 'stale' : freshness;
}
function RuntimePaneReports({ reports, overlay, now, t }: { reports: RuntimePaneBadge[]; overlay: RuntimeOverlay; now: number; t: OperatorTranslate }) {
  if (reports.length === 0) return null;
  return <div className="pipeline-runtime-badges" aria-label={t('runtimePane.heading')} data-runtime-pane-reports>
    <span>{t('runtimePane.heading')}</span>
    <span>{t('runtimePane.boundary')}</span>
    {reports.map(report => {
      const freshness = snapshotFreshness(report.freshness, overlay, now);
      return <span className="pipeline-runtime-run" key={JSON.stringify(report.pane)}>
      <span className={`operator-badge ${['blocked', 'error'].includes(report.state) ? 'tone-danger' : report.state === 'working' ? 'tone-agent' : 'tone-neutral'}`} data-runtime-pane-state={report.state}>
        {report.binding!.role} · {t(report.state === 'settled' ? 'runtimePane.settled' : LABELS[report.state])}
      </span>
      {report.state === 'blocked' && <span className="operator-badge tone-user">{t(`runtimeObservation.reason.${report.reason}`)}</span>}
      <span className={`operator-badge ${freshness === 'fresh' ? 'tone-neutral' : 'tone-danger'}`} data-runtime-pane-freshness={freshness}>{t(`runtimeObservation.freshness.${freshness}`)}</span>
    </span>;
    })}
  </div>;
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
  return <><div className="pipeline-runtime-badges" aria-label={t('runtimeObservation.heading')}>
    {badges.length === 0 ? <span className="operator-badge tone-neutral" data-runtime-state="unknown">{t('runtimeObservation.heading')}: {t('runtimeObservation.state.unknown')}</span> : badges.map(b => {
      const freshness = snapshotFreshness(b.freshness, view.overlay, now);
      const tone = ['blocked','error'].includes(b.state) ? 'tone-danger' : b.state === 'working' ? 'tone-agent' : 'tone-neutral';
      return <span className="pipeline-runtime-run" key={JSON.stringify(b.identity)}>
        <span className={`operator-badge ${tone}`} data-runtime-state={b.state}>{b.identity.role} · {t(LABELS[b.state])}</span>
        {b.state === 'blocked' && <span className="operator-badge tone-user">{t(`runtimeObservation.reason.${b.reason}`)}</span>}
        <span className={`operator-badge ${freshness === 'fresh' ? 'tone-neutral' : 'tone-danger'}`} data-runtime-freshness={freshness}>{t(`runtimeObservation.freshness.${freshness}`)}</span>
      </span>;
    })}
  </div>
    <RuntimePaneReports reports={runtimePaneReportsForCard(card, view.overlay)} overlay={view.overlay} now={now} t={t} />
  </>;
}
