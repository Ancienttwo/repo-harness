import type { ReactNode } from 'react';
import { Banner } from '@cloudflare/kumo';
import { WarningIcon } from '@phosphor-icons/react';
import type { WorktreeView } from '../core/operator/worktrees';
import { BoardState } from './Board';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import { Age, SectionTitle, StatusDot, type DotTone } from './ui';
import { formatBytes, reclaimableSpace, spaceTotal, spaceWords, type SpaceTotal, type WorktreesView } from './worktrees';

type Judgment = WorktreeView['judgment'];

const JUDGMENTS: readonly Judgment[] = ['green', 'yellow', 'red'];
const TONE: Readonly<Record<Judgment, DotTone>> = { green: 'ok', yellow: 'warn', red: 'danger' };
const BAR: Readonly<Record<Judgment, string>> = { green: 'bg-kumo-success', yellow: 'bg-kumo-warning', red: 'bg-kumo-danger' };

/** The disk bar shares only measured bytes; each judgment's count stays next to its words. */
function DiskBar({ worktrees, t }: { readonly worktrees: readonly WorktreeView[]; readonly t: OperatorTranslate }) {
  const totals = Object.fromEntries(JUDGMENTS.map(judgment => [judgment, spaceTotal(worktrees.filter(tree => tree.judgment === judgment))])) as Record<Judgment, SpaceTotal>;
  const measured = JUDGMENTS.reduce((sum, judgment) => sum + totals[judgment].bytes, 0);
  return (
    <div className="flex flex-col gap-1.5">
      {measured > 0
        ? <div className="flex h-2 w-full overflow-hidden rounded-full bg-kumo-recessed" data-disk-bar>
          {JUDGMENTS.filter(judgment => totals[judgment].bytes > 0).map(judgment => (
            <span key={judgment} className={BAR[judgment]} style={{ width: `${(totals[judgment].bytes / measured) * 100}%` }} data-disk-segment={judgment} data-bytes={totals[judgment].bytes} />
          ))}
        </div>
        : <p className="text-xs text-kumo-subtle">{t('worktrees.repository.unmeasured')}</p>}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-kumo-default">
        {JUDGMENTS.map(judgment => {
          const count = totals[judgment].measured + totals[judgment].unknown;
          return (
            <li key={judgment} className="inline-flex items-center gap-1.5" data-judgment-count={judgment} data-count={count}>
              <StatusDot tone={TONE[judgment]} />
              {t(`worktrees.judgment.${judgment}`)} {count}
              {count > 0 && <span className="text-kumo-subtle">· {spaceWords(totals[judgment], t)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function sizeWords(tree: WorktreeView, now: number, t: OperatorTranslate): string {
  if (tree.size_bytes !== null) return formatBytes(tree.size_bytes);
  return tree.size_observed_at ? t('worktrees.size.lastMeasured', { age: ageWords(tree.size_observed_at, now, t) }) : t('worktrees.size.unknown');
}

/** What a delete would lose, from the collector's counts; an unread count says unknown. */
function lossWords(tree: WorktreeView, t: OperatorTranslate): string {
  const parts: string[] = [];
  const count = (value: number | null, known: OperatorMessageKey, unknown: OperatorMessageKey) => {
    if (value === null) parts.push(t(unknown));
    else if (value > 0) parts.push(t(known, { count: value }));
  };
  count(tree.unpushed_commits, 'worktrees.loss.unpushed', 'worktrees.loss.unpushedUnknown');
  count(tree.dirty_files, 'worktrees.loss.dirty', 'worktrees.loss.dirtyUnknown');
  count(tree.ignored_entries, 'worktrees.loss.ignored', 'worktrees.loss.ignoredUnknown');
  return parts.length > 0 ? parts.join(' · ') : t('worktrees.loss.none');
}

function Lifecycle({ tree, now, t }: { readonly tree: WorktreeView; readonly now: number; readonly t: OperatorTranslate }) {
  const record = tree.record;
  if (record === null) return <p className="text-xs text-kumo-subtle" data-record="none">{t('worktrees.record.none')}</p>;
  const fact = (label: string, value: ReactNode) => <><dt className="text-kumo-subtle">{label}</dt><dd className="min-w-0 break-words">{value}</dd></>;
  return (
    <details className="text-xs" data-record={record.end_state}>
      <summary className="cursor-pointer text-kumo-subtle">{t('worktrees.record')} · {record.purpose}</summary>
      <dl className="mt-1.5 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1">
        {fact(t('worktrees.record.creator'), t(`worktrees.source.${record.creator}`))}
        {fact(t('worktrees.record.purpose'), record.purpose)}
        {record.task_id !== null && fact(t('worktrees.record.task'), <code className="font-mono">{record.task_id}</code>)}
        {record.pull_request !== null && fact(t('worktrees.record.pullRequest'), `#${record.pull_request}`)}
        {fact(t('worktrees.record.created'), <Age at={record.created_at} now={now} t={t} />)}
        {fact(t('worktrees.record.state'), t(`worktrees.record.state.${record.end_state}`))}
        {record.ended_at !== null && fact(t('worktrees.record.ended'), <Age at={record.ended_at} now={now} t={t} />)}
      </dl>
    </details>
  );
}

function WorktreeRow({ tree, now, t }: { readonly tree: WorktreeView; readonly now: number; readonly t: OperatorTranslate }) {
  const occupancy = tree.process_count === null ? t('worktrees.processesUnknown') : tree.process_count > 0 ? t('worktrees.processes', { count: tree.process_count }) : null;
  return (
    <li className="flex flex-col gap-1 border-b border-kumo-hairline px-4 py-3 last:border-b-0" data-worktree={tree.id} data-judgment={tree.judgment}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-kumo-strong"><StatusDot tone={TONE[tree.judgment]} />{t(`worktrees.judgment.${tree.judgment}`)}</span>
        <code className="min-w-0 truncate font-mono text-sm text-kumo-strong" data-directory>{tree.directory}</code>
        <span className="min-w-0 truncate font-mono text-xs text-kumo-subtle">{tree.branch ?? t('worktrees.noBranch')}</span>
        <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-kumo-default" data-size={tree.size_bytes ?? 'unknown'}>{sizeWords(tree, now, t)}</span>
      </div>
      <p className="flex flex-wrap gap-x-2 text-xs text-kumo-subtle">
        <span data-source={tree.source}>{t(`worktrees.source.${tree.source}`)}</span>
        <span>· <span data-merge={tree.merge}>{t(`worktrees.merge.${tree.merge}`)}</span></span>
        {occupancy && <span className={tree.process_count === null ? '' : 'text-kumo-warning'} data-processes={tree.process_count ?? 'unknown'}>· {occupancy}</span>}
      </p>
      {tree.reasons.length > 0 && (
        <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-kumo-default" aria-label={t(`worktrees.judgment.${tree.judgment}`)}>
          {tree.reasons.map(reason => <li key={reason} data-reason={reason}>{t(`worktrees.reason.${reason}`)}</li>)}
        </ul>
      )}
      <p className="text-xs text-kumo-default" data-loss>{t('worktrees.loss')}: {lossWords(tree, t)}</p>
      <Lifecycle tree={tree} now={now} t={t} />
    </li>
  );
}

/** One registered repository, or the directories no repository can claim (`group` null). */
function WorktreeGroup({ group, title, status, worktrees, now, t }: {
  readonly group: string | null; readonly title: string; readonly status: 'ready' | 'unavailable';
  readonly worktrees: readonly WorktreeView[]; readonly now: number; readonly t: OperatorTranslate;
}) {
  const heading = `worktrees-${group ?? 'unassigned'}`;
  return (
    <section aria-labelledby={heading} className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base"
      data-worktree-group={group ?? 'unassigned'} data-status={status}>
      <div className="flex flex-col gap-2 border-b border-kumo-hairline px-4 py-3">
        <SectionTitle id={heading} count={status === 'ready' ? worktrees.length : undefined}>{title}</SectionTitle>
        {status === 'ready' && worktrees.length > 0 && <DiskBar worktrees={worktrees} t={t} />}
      </div>
      {status === 'unavailable'
        ? <p className="px-4 py-3 text-sm text-kumo-danger">{t('worktrees.repository.unavailable')}</p>
        : worktrees.length === 0
          ? <p className="px-4 py-3 text-sm text-kumo-subtle">{t('worktrees.repository.empty')}</p>
          : <ul>{worktrees.map(tree => <WorktreeRow key={tree.id} tree={tree} now={now} t={t} />)}</ul>}
    </section>
  );
}

/**
 * Read-only list of every worktree the collector found. The page has no
 * selection or cleanup control: deletion arrives with a later slice.
 */
export function WorktreesPage({ view, now, t }: { readonly view: WorktreesView; readonly now: number; readonly t: OperatorTranslate }) {
  const header = <header className="border-b border-kumo-hairline pb-4"><h1 className="text-xl font-semibold text-kumo-strong">{t('worktrees.title')}</h1></header>;
  if (view.kind === 'loading') return <div data-worktrees-page="pending">{header}<BoardState loading title={t('freshness.worktrees.loading')} description={t('worktrees.pending.body')} /></div>;
  if (view.kind === 'unreachable') return <div data-worktrees-page="unreachable">{header}<BoardState title={t('board.unreachable.title')} description={t('board.unreachable.body')} command="repo-harness operator serve" /></div>;
  const { snapshot } = view;
  if (snapshot.status === 'unavailable') return <div data-worktrees-page="pending">{header}<BoardState title={t('worktrees.pending.title')} description={t('worktrees.pending.body')} /></div>;
  if (snapshot.repositories.length === 0 && snapshot.unassigned.length === 0) return <div data-worktrees-page="empty">{header}<BoardState title={t('board.noRepositories.title')} description={t('board.noRepositories.body')} command="repo-harness adopt --help" /></div>;
  const reclaimable = reclaimableSpace(snapshot);
  return (
    <div className="flex flex-col gap-5" data-worktrees-page={view.refreshFailed ? 'refresh-failed' : snapshot.status}>
      {header}
      <p className="text-sm text-kumo-default" data-reclaimable={reclaimable.bytes} data-reclaimable-unknown={reclaimable.unknown}>
        <span className="font-medium text-kumo-strong">{t('worktrees.reclaimable')}</span> · <span className="font-mono">{spaceWords(reclaimable, t)}</span>
      </p>
      {snapshot.status === 'partial' && <Banner variant="secondary" icon={<WarningIcon />} title={t('worktrees.partial.title')} description={t('worktrees.partial.body')} />}
      {snapshot.repositories.map(repository => <WorktreeGroup key={repository.repository_id} group={repository.repository_id} title={repository.display_name}
        status={repository.status} worktrees={repository.worktrees} now={now} t={t} />)}
      {snapshot.unassigned.length > 0 && <WorktreeGroup group={null} title={t('worktrees.unassigned')} status="ready" worktrees={snapshot.unassigned} now={now} t={t} />}
    </div>
  );
}
