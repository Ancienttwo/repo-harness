import { useState } from 'react';
import { Empty, Loader, cn } from '@cloudflare/kumo';
import { CaretDownIcon, CaretRightIcon, CaretUpIcon, CircleDashedIcon, GithubLogoIcon } from '@phosphor-icons/react';
import type { DevActivityRepository, DevActivitySnapshotV2, DevActivitySourceHealth } from '../core/dev-activity/types';
import type { OperatorRepositoryV1 } from '../core/operator/repositories';
import { Mascot } from './brand';
import { openPullRequests, repositoryById, snapshotOf, worktreeCount, type DevActivityView } from './dev-activity';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import { registeredLabel, type RepositoriesView } from './repositories';
import { CommandLine, SectionTitle, StatusDot, type DotTone } from './ui';

/** The artboard shows the first six rows; the rest stay behind one toggle. */
const FIRST_ROWS = 6;

const SOURCE_TONE: Readonly<Record<DevActivitySourceHealth['status'], DotTone>> = {
  ok: 'ok', stale: 'warn', unavailable: 'danger', not_configured: 'neutral',
};

export function SourceChips({ sources, t }: { readonly sources: readonly DevActivitySourceHealth[]; readonly t: OperatorTranslate }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {sources.map(source => (
        <li key={source.kind} className="inline-flex items-center gap-1.5 text-xs text-kumo-default" data-source-kind={source.kind} data-source-status={source.status}
          title={source.reason ?? undefined}>
          <StatusDot tone={SOURCE_TONE[source.status]} />
          <span>{t(`source.kind.${source.kind}` as OperatorMessageKey)}</span>
          {source.status !== 'ok' && <span className="text-kumo-subtle">{t(`source.status.${source.status}` as OperatorMessageKey)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** The age of the oldest source observation of the row: the data on screen is no newer than that. */
function oldestObservation(repository: DevActivityRepository): string | null {
  const times = repository.sources.map(source => source.observed_at).filter((at): at is string => at !== null).sort();
  return times[0] ?? null;
}

function RepositoryRow({ repository, registered, activity, now, onOpen, t }: {
  readonly repository: OperatorRepositoryV1; readonly registered: readonly OperatorRepositoryV1[];
  readonly activity: DevActivitySnapshotV2 | null; readonly now: number;
  readonly onOpen: (id: string) => void; readonly t: OperatorTranslate;
}) {
  const id = repository.repository_id;
  const collected = activity ? repositoryById(activity, id) : null;
  const observed = collected ? oldestObservation(collected) : null;
  return (
    <li>
      <button type="button" onClick={() => onOpen(id)} data-repository={id}
        className="flex w-full cursor-pointer flex-col gap-2 px-4 py-3 text-left hover:bg-kumo-tint focus-visible:bg-kumo-tint focus-visible:outline-none md:flex-row md:items-center md:gap-6">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md bg-kumo-recessed text-sm font-semibold text-kumo-strong">
            {repository.display_name.slice(0, 1).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-kumo-strong">{registeredLabel(registered, id)}</span>
            <span className="flex items-center gap-1 truncate text-xs text-kumo-subtle">
              {collected === null ? null
                : collected.github ? <><GithubLogoIcon size={12} aria-hidden="true" />{collected.github}</> : t('repositories.noRemote')}
            </span>
          </span>
        </span>
        <span className="md:w-72">
          {collected ? <SourceChips sources={collected.sources} t={t} />
            : <span className="text-xs text-kumo-subtle" data-not-collected>{t('repositories.notCollected')}</span>}
        </span>
        <span className={cn('w-fit shrink-0 rounded-full px-2 py-0.5 text-xs', repository.access_mode === 'read_only' ? 'bg-kumo-recessed text-kumo-subtle' : 'bg-kumo-tint text-kumo-strong')}
          data-access={repository.access_mode}>
          {t(`repo.accessMode.${repository.access_mode}`)}
        </span>
        <span className="flex shrink-0 gap-4 text-xs text-kumo-default tabular-nums md:w-56">
          {collected && activity ? <>
            <span>{t('repositories.worktrees', { count: worktreeCount(activity.items, id) })}</span>
            <span>{t('repositories.openPulls', { count: openPullRequests(activity.items, id) })}</span>
          </> : null}
        </span>
        <span className="shrink-0 text-xs text-kumo-subtle md:w-24">{observed ? ageWords(observed, now, t) : null}</span>
        <CaretRightIcon size={14} aria-hidden="true" className="hidden shrink-0 text-kumo-subtle md:block" />
      </button>
    </li>
  );
}

/** Registry rows whose root is gone, folded into one row. Removal stays a copied command. */
function StaleRegistrations({ count, t }: { readonly count: number; readonly t: OperatorTranslate }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-col gap-3 bg-kumo-recessed/50 px-4 py-3" data-stale-registrations={count}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex w-full cursor-pointer items-center gap-3 text-left">
        <Mascot name="buddy-sleep" className="size-8" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-kumo-strong">{t('repositories.stale', { count })}</span>
          <span className="text-xs text-kumo-subtle">{t('repositories.staleReason')}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-kumo-subtle">
          {open ? t('repositories.staleClose') : t('repositories.staleOpen')}
          {open ? <CaretUpIcon size={12} aria-hidden="true" /> : <CaretDownIcon size={12} aria-hidden="true" />}
        </span>
      </button>
      {open && <div className="flex flex-col gap-2">
        <p className="text-xs text-kumo-subtle">{t('repositories.staleBody')}</p>
        <CommandLine command="repo-harness fleet prune" t={t} className="max-w-full sm:max-w-md" />
        <p className="text-xs text-kumo-danger">{t('repositories.staleApply')}</p>
        <CommandLine command="repo-harness fleet prune --apply --expected-revision <digest>" t={t} className="max-w-full sm:max-w-xl" />
      </div>}
    </li>
  );
}

export function RepositoriesPage({ view, activity, now, onOpen, t }: {
  readonly view: RepositoriesView; readonly activity: DevActivityView; readonly now: number;
  readonly onOpen: (repositoryId: string) => void; readonly t: OperatorTranslate;
}) {
  const [expanded, setExpanded] = useState(false);
  if (view.kind === 'loading') return <Empty size="sm" icon={<Loader size={24} />} title={t('repositories.loading')} />;
  if (view.kind === 'failed') {
    return <Empty size="sm" icon={<CircleDashedIcon size={32} />} title={t('repositories.failed.title')} description={t('repositories.failed.body')} commandLine="repo-harness operator serve" />;
  }
  const { repositories, stale_registrations: stale } = view.list;
  const shown = expanded ? repositories : repositories.slice(0, FIRST_ROWS);
  const hidden = repositories.length - FIRST_ROWS;
  return (
    <section aria-labelledby="repositories-heading" className="flex flex-col gap-4">
      <SectionTitle id="repositories-heading" count={repositories.length} className="text-base">{t('nav.repositories')}</SectionTitle>
      {repositories.length === 0 && stale === 0
        ? <Empty size="sm" icon={<CircleDashedIcon size={32} />} title={t('board.noRepositories.title')} description={t('board.noRepositories.body')} commandLine="repo-harness adopt --help" />
        : (
          <ul className="divide-y divide-kumo-hairline overflow-hidden rounded-xl border border-kumo-line bg-kumo-base">
            {shown.map(repository => (
              <RepositoryRow key={repository.repository_id} repository={repository} registered={repositories}
                activity={snapshotOf(activity)} now={now} onOpen={onOpen} t={t} />
            ))}
            {hidden > 0 && <li>
              <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} data-more-repositories
                className="w-full cursor-pointer px-4 py-2 text-left text-xs text-kumo-subtle hover:bg-kumo-tint">
                {expanded ? t('repositories.fewer', { count: FIRST_ROWS }) : t('repositories.more', { count: hidden })}
              </button>
            </li>}
            {stale > 0 && <StaleRegistrations count={stale} t={t} />}
          </ul>
        )}
    </section>
  );
}
