import type { ReactNode } from 'react';
import { Badge } from '@cloudflare/kumo';
import { ShieldCheckIcon } from '@phosphor-icons/react';
import type { NotifyStatusV1 } from '../core/operator/notify-status';
import type { RuntimeOverlay } from '../core/operator/runtime-status';
import type { PipelineBoardV2 } from '../core/pipeline/board';
import { repositoryLabel, sourceHealth, type DevActivityView } from './dev-activity';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { NotifyStatusPanel, type NotifyStatusReader } from './NotifyStatus';
import { PipelineBoardPanel, type PipelineBoardReader } from './PipelineBoard';
import { SourceChips } from './RepositoriesPage';
import type { RuntimeOverlayReader } from './RuntimeBadges';
import { ageWords } from './labels';
import { SectionTitle } from './ui';

function Card({ labelledBy, children }: { readonly labelledBy: string; readonly children: ReactNode }) {
  return <section aria-labelledby={labelledBy} className="flex flex-col gap-3 rounded-xl border border-kumo-line bg-kumo-base p-4 sm:p-5">{children}</section>;
}

const SNAPSHOT_BADGE = { ready: 'success', partial: 'warning', unavailable: 'error' } as const;

/** Per-repository, per-source health of the background collector. Unhealthy rows first. */
function CollectorHealth({ view, now, t }: { readonly view: DevActivityView; readonly now: number; readonly t: OperatorTranslate }) {
  if (view.kind !== 'ready') {
    return <Card labelledBy="collector-heading">
      <SectionTitle id="collector-heading">{t('system.collector')}</SectionTitle>
      <p className="text-sm text-kumo-subtle">{t(view.kind === 'loading' ? 'board.loading.title' : 'board.unreachable.title')}</p>
    </Card>;
  }
  const { snapshot } = view;
  const counts = sourceHealth(snapshot.repositories);
  const rank = (sources: readonly { status: string }[]) => sources.filter(source => source.status !== 'ok' && source.status !== 'not_configured').length;
  const repositories = snapshot.repositories.slice().sort((left, right) => rank(right.sources) - rank(left.sources) || left.display_name.localeCompare(right.display_name));
  return (
    <Card labelledBy="collector-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle id="collector-heading">{t('system.collector')}</SectionTitle>
        <Badge variant={SNAPSHOT_BADGE[snapshot.status]}>{t(`system.snapshot.${snapshot.status}` as OperatorMessageKey)}</Badge>
      </div>
      <p className="text-sm text-kumo-subtle">
        {snapshot.collected_at ? <time dateTime={snapshot.collected_at} title={snapshot.collected_at}>{t('system.collectedAt', { age: ageWords(snapshot.collected_at, now, t) })}</time> : t('system.neverCollected')}
        {' · '}{t('system.sourceCounts', { ok: counts.ok, stale: counts.stale, unavailable: counts.unavailable, off: counts.not_configured })}
      </p>
      {repositories.length > 0 && (
        <ul className="divide-y divide-kumo-hairline rounded-lg border border-kumo-hairline">
          {repositories.map(repository => (
            <li key={repository.repository_id} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4" data-collector-repository={repository.repository_id}>
              <span className="min-w-0 truncate text-sm font-medium text-kumo-strong sm:w-56">{repositoryLabel(snapshot.repositories, repository.repository_id)}</span>
              <SourceChips sources={repository.sources} t={t} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The read-only and evidence boundaries, stated once here instead of on every card. */
function Boundaries({ t }: { readonly t: OperatorTranslate }) {
  const items: readonly OperatorMessageKey[] = ['system.boundary.readOnly', 'system.boundary.authority', 'system.boundary.agents', 'system.boundary.runtime', 'system.boundary.evidence', 'system.boundary.privacy'];
  return (
    <Card labelledBy="boundaries-heading">
      <SectionTitle id="boundaries-heading"><ShieldCheckIcon size={16} aria-hidden="true" />{t('system.boundaries')}</SectionTitle>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-kumo-default">{items.map(key => <li key={key}>{t(key)}</li>)}</ul>
    </Card>
  );
}

export function SystemPage({ view, now, refreshGeneration, active, readNotifyStatus, initialNotifyStatus, readPipelineBoard, initialPipelineBoard, readRuntimeStatus, initialRuntimeOverlay, t }: {
  readonly view: DevActivityView;
  readonly now: number;
  readonly refreshGeneration: number;
  /** False while another page is shown; the panels pause and keep their last result. */
  readonly active: boolean;
  readonly readNotifyStatus?: NotifyStatusReader;
  readonly initialNotifyStatus?: NotifyStatusV1;
  readonly readPipelineBoard?: PipelineBoardReader;
  readonly initialPipelineBoard?: PipelineBoardV2;
  readonly readRuntimeStatus?: RuntimeOverlayReader;
  readonly initialRuntimeOverlay?: RuntimeOverlay;
  readonly t: OperatorTranslate;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold text-kumo-strong">{t('nav.system')}</h1>
      <CollectorHealth view={view} now={now} t={t} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-kumo-line bg-kumo-base p-4 sm:p-5">
          <NotifyStatusPanel readStatus={readNotifyStatus} initialStatus={initialNotifyStatus} refreshGeneration={refreshGeneration} active={active} t={t} />
        </div>
        <Boundaries t={t} />
      </div>
      <div className="rounded-xl border border-kumo-line bg-kumo-base p-4 sm:p-5">
        <PipelineBoardPanel readBoard={readPipelineBoard} initialBoard={initialPipelineBoard} readRuntimeStatus={readRuntimeStatus} initialRuntimeOverlay={initialRuntimeOverlay}
          refreshGeneration={refreshGeneration} active={active} t={t} />
      </div>
    </div>
  );
}
