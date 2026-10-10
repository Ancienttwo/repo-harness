import { Empty, Loader, cn } from '@cloudflare/kumo';
import { CaretRightIcon, CircleDashedIcon, GithubLogoIcon, TrashIcon } from '@phosphor-icons/react';
import type { DevActivityRepository, DevActivitySourceHealth } from '../core/dev-activity/types';
import { openPullRequests, repositoryLabel, worktreeCount, type DevActivityView } from './dev-activity';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { CommandLine, SectionTitle, StatusDot, type DotTone } from './ui';

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

function RepositoryRow({ repository, repositories, worktrees, pulls, onOpen, t }: {
  readonly repository: DevActivityRepository; readonly repositories: readonly DevActivityRepository[];
  readonly worktrees: number; readonly pulls: number; readonly onOpen: (id: string) => void; readonly t: OperatorTranslate;
}) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(repository.repository_id)} data-repository={repository.repository_id}
        className="flex w-full cursor-pointer flex-col gap-2 px-4 py-3 text-left hover:bg-kumo-tint focus-visible:bg-kumo-tint focus-visible:outline-none md:flex-row md:items-center md:gap-6">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-kumo-strong">{repositoryLabel(repositories, repository.repository_id)}</span>
          <span className="flex items-center gap-1 truncate text-xs text-kumo-subtle">
            {repository.github ? <><GithubLogoIcon size={12} aria-hidden="true" />{repository.github}</> : t('repositories.noRemote')}
          </span>
        </span>
        <span className="flex shrink-0 gap-4 text-xs text-kumo-default tabular-nums md:w-56">
          <span>{t('repositories.worktrees', { count: worktrees })}</span>
          <span>{t('repositories.openPulls', { count: pulls })}</span>
        </span>
        <span className="md:w-72"><SourceChips sources={repository.sources} t={t} /></span>
        <CaretRightIcon size={14} aria-hidden="true" className="hidden shrink-0 text-kumo-subtle md:block" />
      </button>
    </li>
  );
}

/** Registry rows whose path is gone, folded into one row. Removal stays a copied command. */
function StaleRegistrations({ count, t }: { readonly count: number; readonly t: OperatorTranslate }) {
  return (
    <li className="flex flex-col gap-2 bg-kumo-recessed/50 px-4 py-3" data-stale-registrations={count}>
      <p className="flex items-center gap-2 text-sm font-medium text-kumo-strong">
        <TrashIcon size={14} aria-hidden="true" className="text-kumo-subtle" />
        {t('repositories.stale', { count })}
      </p>
      <p className="text-xs text-kumo-subtle">{t('repositories.staleBody')}</p>
      <CommandLine command="repo-harness fleet prune" t={t} className="max-w-full sm:max-w-md" />
      <p className="text-xs text-kumo-subtle">{t('repositories.staleApply')} <code className="font-mono">repo-harness fleet prune --apply --expected-revision &lt;digest&gt;</code></p>
    </li>
  );
}

export function RepositoriesPage({ view, onOpen, t }: {
  readonly view: DevActivityView; readonly onOpen: (repositoryId: string) => void; readonly t: OperatorTranslate;
}) {
  if (view.kind === 'loading') return <Empty size="sm" icon={<Loader size={24} />} title={t('board.loading.title')} description={t('board.loading.body')} />;
  if (view.kind === 'unreachable') return <Empty size="sm" icon={<CircleDashedIcon size={32} />} title={t('board.unreachable.title')} description={t('board.unreachable.body')} commandLine="repo-harness operator serve" />;
  const snapshot = view.snapshot;
  const repositories = snapshot.repositories.slice().sort((left, right) => left.display_name.localeCompare(right.display_name));
  return (
    <section aria-labelledby="repositories-heading" className="flex flex-col gap-4">
      <SectionTitle id="repositories-heading" count={repositories.length} className="text-base">{t('nav.repositories')}</SectionTitle>
      {repositories.length === 0 && snapshot.unreadable_registrations === 0
        ? <Empty size="sm" icon={<CircleDashedIcon size={32} />} title={t('board.noRepositories.title')} description={t('board.noRepositories.body')} commandLine="repo-harness adopt --help" />
        : (
          <ul className={cn('divide-y divide-kumo-hairline overflow-hidden rounded-xl border border-kumo-line bg-kumo-base')}>
            {repositories.map(repository => (
              <RepositoryRow key={repository.repository_id} repository={repository} repositories={snapshot.repositories}
                worktrees={worktreeCount(snapshot.items, repository.repository_id)} pulls={openPullRequests(snapshot.items, repository.repository_id)} onOpen={onOpen} t={t} />
            ))}
            {snapshot.unreadable_registrations > 0 && <StaleRegistrations count={snapshot.unreadable_registrations} t={t} />}
          </ul>
        )}
    </section>
  );
}
