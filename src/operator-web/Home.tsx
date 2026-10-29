import { useMemo, useState, type ReactNode } from 'react';
import { Banner } from '@cloudflare/kumo';
import { HourglassIcon, WarningIcon } from '@phosphor-icons/react';
import { DEV_ACTIVITY_COLUMNS, type DevActivityAttention, type DevActivityItem, type DevActivitySnapshotV2 } from '../core/dev-activity/types';
import { BoardState } from './Board';
import { Mascot } from './brand';
import { attentionItem, failedSources, repositoryLabel, truncatedCategories, type DevActivityView } from './dev-activity';
import type { OperatorTranslate } from './i18n';
import { ageWords, ownerAgents } from './labels';
import {
  itemOwner,
  useCiRepairs,
  useExecutions,
  type CiRepairsReader,
  type CiRepairsReason,
  type CiRepairsResult,
  type ExecutionReader,
  type ExecutionResult,
  type ItemOwner,
} from './repository-reads';
import type { DocSessionCreateWriter, DocSessions } from './doc-sessions';
import type { AgentsSettingsReader } from './settings';
import { ExternalLink, PageLink, StatusDot } from './ui';
import type { WorkspaceLocation } from './workspace-location';
import { reclaimableSpace, spaceWords, worktreesOf, type WorktreesView } from './worktrees';

const WAITING_PREVIEW = 5;
const CONTINUE_PREVIEW = 4;
const TODAY_PREVIEW = 3;

const BOARD: WorkspaceLocation = { workspace: 'board', module: null, item: null };
const SYSTEM: WorkspaceLocation = { workspace: 'system', module: null, item: null };
const WORKTREES: WorkspaceLocation = { workspace: 'worktrees', module: null, item: null };
const boardItem = (item: string): WorkspaceLocation => ({ workspace: 'board', module: null, item });

type Open = (next: WorkspaceLocation) => void;

function greeting(now: number, t: OperatorTranslate): string {
  const hour = new Date(now).getHours();
  return t(hour >= 5 && hour < 12 ? 'home.greeting.morning' : hour >= 12 && hour < 18 ? 'home.greeting.afternoon' : 'home.greeting.evening');
}

function startOfToday(now: number): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

function time(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/** `repository · PR #n`, or the branch when there is no PR. */
function where(snapshot: DevActivitySnapshotV2, item: DevActivityItem | null, repositoryId: string): string {
  const subject = item?.pull_request ? `PR #${item.pull_request.number}` : item?.branch;
  return [repositoryLabel(snapshot.repositories, repositoryId), subject].filter(Boolean).join(' · ');
}

/** The verified agent of a row's item, else 「agent 未知」: identity comes only from a verified session (G2). */
function AgentCell({ owner, t }: { readonly owner: ItemOwner | null; readonly t: OperatorTranslate }) {
  if (owner?.state !== 'verified') return <span className="inline-flex w-28 items-center gap-1.5 text-xs text-kumo-subtle" data-agent="unknown"><StatusDot tone="unknown" />{t('home.agentUnknown')}</span>;
  return <span className="inline-flex w-28 items-center gap-1.5 text-xs text-kumo-default" data-agent="verified"><StatusDot tone="active" /><span className="truncate">{ownerAgents(owner.tasks, t)}</span></span>;
}

function ListGroup({ id, title, count, children }: { readonly id: string; readonly title: string; readonly count?: number; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="type-small flex items-center gap-2 text-kumo-subtle">
        {title}{count !== undefined && <span className="font-mono tabular-nums">{count}</span>}
      </h2>
      <div className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base">{children}</div>
    </section>
  );
}

function FoldButton({ expanded, hidden, onToggle, t }: { readonly expanded: boolean; readonly hidden: number; readonly onToggle: () => void; readonly t: OperatorTranslate }) {
  return (
    <button type="button" aria-expanded={expanded} onClick={onToggle}
      className="w-full cursor-pointer border-t border-kumo-hairline px-5 py-2.5 text-left text-sm text-kumo-link hover:bg-kumo-tint">
      {expanded ? t('attention.less') : t('attention.more', { count: hidden })}
    </button>
  );
}

const ROW = 'flex flex-col gap-2 border-b border-kumo-hairline px-5 py-3.5 last:border-b-0 rail:flex-row rail:items-center rail:gap-6';

function WaitingRow({ row, snapshot, executions, now, onOpen, t }: {
  readonly row: DevActivityAttention; readonly snapshot: DevActivitySnapshotV2; readonly executions: readonly ExecutionResult[] | null;
  readonly now: number; readonly onOpen: Open; readonly t: OperatorTranslate;
}) {
  const item = attentionItem(snapshot, row);
  return (
    <li className={ROW} data-attention-kind={row.kind}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <StatusDot tone="accent" className="mt-1.5" />
        <div className="min-w-0">
          {item
            ? <PageLink to={boardItem(item.id)} onOpen={onOpen} className="block truncate text-sm font-medium text-kumo-strong hover:underline">{row.summary}</PageLink>
            : <p className="truncate text-sm font-medium text-kumo-strong">{row.summary}</p>}
          <p className="type-caption truncate text-kumo-subtle">{t(`attention.kind.${row.kind}`)} · {where(snapshot, item, row.repository_id)}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 pl-5 rail:pl-0">
        <AgentCell owner={item ? itemOwner(executions, item) : null} t={t} />
        <span className="inline-flex w-24 items-center gap-1 text-xs tabular-nums text-kumo-subtle">
          <HourglassIcon size={12} aria-hidden="true" />{ageWords(row.waiting_since, now, t)}
        </span>
        <span className="w-14 text-right">{row.url && <ExternalLink href={row.url} className="text-sm">{t('attention.openLink')}</ExternalLink>}</span>
      </div>
    </li>
  );
}

function ContinueRow({ item, snapshot, executions, now, onOpen, t }: {
  readonly item: DevActivityItem; readonly snapshot: DevActivitySnapshotV2; readonly executions: readonly ExecutionResult[] | null;
  readonly now: number; readonly onOpen: Open; readonly t: OperatorTranslate;
}) {
  return (
    <li className={ROW} data-continue-item={item.id}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <StatusDot tone="active" className="mt-1.5" />
        <div className="min-w-0">
          <PageLink to={boardItem(item.id)} onOpen={onOpen} className="block truncate text-sm font-medium text-kumo-strong hover:underline">{item.title}</PageLink>
          <p className="type-caption truncate text-kumo-subtle">{where(snapshot, item, item.repository_id)}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 pl-5 rail:pl-0">
        <span className="w-20 text-xs text-kumo-subtle">{t(`column.${item.column}`)}</span>
        <AgentCell owner={itemOwner(executions, item)} t={t} />
        <span className="w-24 text-xs tabular-nums text-kumo-subtle">{item.column_since ? ageWords(item.column_since, now, t) : '—'}</span>
      </div>
    </li>
  );
}

type RowState = 'ready' | 'unavailable' | 'loading' | 'off';

function TodayRow({ id, label, state, children, link }: {
  readonly id: string; readonly label: string; readonly state: RowState; readonly children: ReactNode; readonly link?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-kumo-hairline px-5 py-3.5 last:border-b-0 rail:flex-row rail:items-baseline rail:gap-6" data-today={id} data-state={state}>
      <span className="w-28 shrink-0 text-sm font-medium text-kumo-strong">{label}</span>
      <div className={`min-w-0 flex-1 text-sm ${state === 'unavailable' ? 'text-kumo-danger' : 'text-kumo-default'}`}>{children}</div>
      {link && <span className="shrink-0 text-sm">{link}</span>}
    </li>
  );
}

function ItemLinks({ items, onOpen }: { readonly items: readonly { readonly id: string; readonly text: string; readonly meta: string }[]; readonly onOpen: Open }) {
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {items.map(entry => (
        <li key={entry.id} className="flex min-w-0 items-baseline gap-2">
          <PageLink to={boardItem(entry.id)} onOpen={onOpen} className="min-w-0 truncate text-kumo-link hover:underline">{entry.text}</PageLink>
          <span className="type-caption shrink-0 text-kumo-subtle">{entry.meta}</span>
        </li>
      ))}
    </ul>
  );
}

/** Repositories whose GitHub source failed outright, and those that dropped merged PRs for the query limit (G28). */
function githubGaps(snapshot: DevActivitySnapshotV2) {
  const github = snapshot.repositories.filter(repository => repository.github !== null);
  const failed = github.filter(repository => failedSources(repository).some(source => source.kind === 'github'));
  const mergedDropped = github.filter(repository => repository.sources.some(source => source.kind === 'github' && (truncatedCategories(source)?.includes('merged') ?? false)));
  return { github, failed, mergedDropped, allFailed: github.length > 0 && failed.length === github.length };
}

function RepairReasons({ rows, snapshot, t }: { readonly rows: readonly CiRepairsResult[]; readonly snapshot: DevActivitySnapshotV2; readonly t: OperatorTranslate }) {
  const byReason = new Map<CiRepairsReason, string[]>();
  for (const row of rows) {
    if (row.state !== 'unavailable') continue;
    byReason.set(row.reason, [...byReason.get(row.reason) ?? [], repositoryLabel(snapshot.repositories, row.repository_id)]);
  }
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-kumo-subtle">
      {[...byReason].map(([reason, repositories]) => (
        <li key={reason} data-repairs-reason={reason}>{t(`tests.reason.${reason}`)} · {repositories.join(' · ')}</li>
      ))}
    </ul>
  );
}

/** Reclaimable space from the worktree collector; an unmeasured size is never counted as 0 B. */
function ReclaimableRow({ worktrees, onOpen, t }: { readonly worktrees: WorktreesView; readonly onOpen: Open; readonly t: OperatorTranslate }) {
  const snapshot = worktreesOf(worktrees);
  const state: RowState = worktrees.kind === 'loading' ? 'loading' : snapshot === null ? 'unavailable' : 'ready';
  const unread = snapshot?.repositories.filter(repository => repository.status === 'unavailable').length ?? 0;
  return (
    <TodayRow id="reclaimable" label={t('home.today.reclaimable')} state={state}
      link={<PageLink to={WORKTREES} onOpen={onOpen} className="text-kumo-link hover:underline">{t('nav.worktrees')} ›</PageLink>}>
      {state === 'loading' ? <span className="text-kumo-subtle">{t('home.today.loading')}</span>
        : snapshot === null ? t('home.today.unavailable')
          : <>
            <span className="font-mono">{spaceWords(reclaimableSpace(snapshot), t)}</span>
            {unread > 0 && <span className="type-caption text-kumo-warning"> · {t('home.today.partial', { count: unread })}</span>}
          </>}
    </TodayRow>
  );
}

function Today({ snapshot, repairs, worktrees, now, onOpen, t }: {
  readonly snapshot: DevActivitySnapshotV2; readonly repairs: readonly CiRepairsResult[] | null; readonly worktrees: WorktreesView;
  readonly now: number; readonly onOpen: Open; readonly t: OperatorTranslate;
}) {
  const gaps = githubGaps(snapshot);
  const since = startOfToday(now);
  const merged = snapshot.items.filter(item => item.pull_request?.state === 'merged' && time(item.pull_request.merged_at) >= since);
  const failedChecks = snapshot.items.filter(item => item.hidden === null && item.pull_request?.state === 'open' && item.pull_request.ci === 'failure');
  const longest = snapshot.attention.slice(0, TODAY_PREVIEW);
  const partial = gaps.failed.length > 0 && !gaps.allFailed
    ? <span className="type-caption text-kumo-warning"> · {t('home.today.partial', { count: gaps.failed.length })}</span> : null;
  const githubDown = <>{t('home.today.unavailable')} · {t('switch.status.unavailable', { source: t('source.kind.github') })}</>;
  const boardLink = <PageLink to={BOARD} onOpen={onOpen} className="text-kumo-link hover:underline">{t('nav.board')} ›</PageLink>;
  const issues = repairs?.flatMap(row => row.state === 'ok' ? row.issues : []) ?? [];
  const refused = repairs?.filter(row => row.state === 'unavailable') ?? [];
  const repairsState: RowState = gaps.github.length === 0 ? 'off' : repairs === null ? 'loading' : refused.length === repairs.length ? 'unavailable' : 'ready';
  return (
    <ListGroup id="home-today" title={t('home.today')}>
      <ul>
        {/* G28: a dropped merged-PR query makes only this row unavailable, never a 0. */}
        <TodayRow id="merged" label={t('home.today.merged')} state={gaps.mergedDropped.length > 0 || gaps.allFailed ? 'unavailable' : 'ready'} link={boardLink}>
          {gaps.mergedDropped.length > 0
            ? <>{t('home.today.unavailable')} · {t('home.today.truncated', { repositories: gaps.mergedDropped.map(repository => repositoryLabel(snapshot.repositories, repository.repository_id)).join(' · ') })}</>
            : gaps.allFailed ? githubDown : <>{t('home.today.mergedCount', { count: merged.length })}{partial}</>}
        </TodayRow>
        <TodayRow id="longest" label={t('home.today.longest')} state={gaps.allFailed ? 'unavailable' : 'ready'} link={boardLink}>
          {gaps.allFailed ? githubDown : longest.length === 0 ? <>{t('home.today.none')}{partial}</> : <>
            {partial}
            <ItemLinks onOpen={onOpen} items={longest.map(row => ({ id: row.subject_id, text: row.summary, meta: t('attention.waiting', { age: ageWords(row.waiting_since, now, t) }) }))} />
          </>}
        </TodayRow>
        <TodayRow id="failed" label={t('home.today.failed')} state={gaps.allFailed ? 'unavailable' : 'ready'} link={boardLink}>
          {gaps.allFailed ? githubDown : <>
            {t('home.today.failedCount', { count: failedChecks.length })}{partial}
            {failedChecks.length > 0 && <ItemLinks onOpen={onOpen} items={failedChecks.slice(0, TODAY_PREVIEW).map(item => ({ id: item.id, text: item.title, meta: where(snapshot, item, item.repository_id) }))} />}
          </>}
        </TodayRow>
        <TodayRow id="repairs" label={t('home.today.repairs')} state={repairsState}>
          {repairsState === 'off' ? <span className="text-kumo-subtle">{t('home.today.notConfigured')}</span>
            : repairsState === 'loading' ? <span className="text-kumo-subtle">{t('home.today.loading')}</span>
              : <>
                {repairsState === 'unavailable' ? t('home.today.unavailable') : t('home.today.repairsCount', { count: issues.length })}
                {repairsState === 'ready' && refused.length > 0 && <span className="type-caption text-kumo-warning"> · {t('home.today.partial', { count: refused.length })}</span>}
                {issues.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-1">
                    {issues.slice(0, TODAY_PREVIEW).map(issue => <li key={issue.url}><ExternalLink href={issue.url}>#{issue.number} {issue.title}</ExternalLink></li>)}
                  </ul>
                )}
                {refused.length > 0 && <RepairReasons rows={refused} snapshot={snapshot} t={t} />}
              </>}
        </TodayRow>
        <ReclaimableRow worktrees={worktrees} onOpen={onOpen} t={t} />
      </ul>
    </ListGroup>
  );
}

/** One banner at most: a failed refresh first, then the first failed Git or GitHub source. */
function SourceBanner({ view, snapshot, now, onOpen, t }: {
  readonly view: DevActivityView & { readonly kind: 'ready' }; readonly snapshot: DevActivitySnapshotV2; readonly now: number; readonly onOpen: Open; readonly t: OperatorTranslate;
}) {
  const action = <PageLink to={SYSTEM} onOpen={onOpen} className="text-sm font-medium text-kumo-link hover:underline">{t('home.systemLink')} ›</PageLink>;
  if (view.refreshFailed) {
    return <Banner variant="alert" icon={<WarningIcon />} title={t('board.refreshFailed.title')} action={action} data-source-banner="refresh"
      description={snapshot.collected_at ? t('board.refreshFailed.body', { age: ageWords(snapshot.collected_at, now, t) }) : t('board.refreshFailed.bodyUnknown')} />;
  }
  const failures = snapshot.repositories.flatMap(repository => failedSources(repository).map(source => ({ repository, source })));
  const first = failures[0];
  if (first === undefined) return null;
  const params = { source: t(`source.kind.${first.source.kind}`), repository: repositoryLabel(snapshot.repositories, first.repository.repository_id) };
  const sentence = first.source.status === 'stale' && first.source.observed_at
    ? t('home.banner.stale', { ...params, age: ageWords(first.source.observed_at, now, t) })
    : t('home.banner.unavailable', params);
  return <Banner variant="alert" icon={<WarningIcon />} action={action} data-source-banner={first.source.status}
    title={failures.length > 1 ? `${sentence} · ${t('home.banner.more', { count: failures.length - 1 })}` : sentence} />;
}

export function Home({ view, worktrees, readCiRepairs, readExecution, generation, now, onOpen, t }: {
  readonly view: DevActivityView;
  readonly worktrees: WorktreesView;
  readonly readCiRepairs: CiRepairsReader;
  readonly readExecution: ExecutionReader;
  /** The doc session list; a start control shows only for a kind it lists. */
  readonly docSessions?: DocSessions;
  readonly readAgentsSettings?: AgentsSettingsReader;
  readonly createDocSession?: DocSessionCreateWriter;
  readonly generation: number;
  readonly now: number;
  readonly onOpen: Open;
  readonly t: OperatorTranslate;
}) {
  const snapshot = view.kind === 'ready' ? view.snapshot : null;
  const githubIds = useMemo(() => snapshot?.repositories.filter(repository => repository.github !== null).map(repository => repository.repository_id) ?? [], [snapshot]);
  const repairs = useCiRepairs(readCiRepairs, githubIds, generation, snapshot !== null);
  const repositoryIds = useMemo(() => snapshot?.repositories.map(repository => repository.repository_id) ?? [], [snapshot]);
  const executions = useExecutions(readExecution, repositoryIds, generation, snapshot !== null);
  const [waitingExpanded, setWaitingExpanded] = useState(false);
  const [continueExpanded, setContinueExpanded] = useState(false);

  if (view.kind === 'loading') return <BoardState loading title={t('board.loading.title')} description={t('board.loading.body')} />;
  if (view.kind === 'unreachable') return <BoardState title={t('board.unreachable.title')} description={t('board.unreachable.body')} command="repo-harness operator serve" />;
  const ready = view.snapshot;
  if (ready.status === 'unavailable') return <BoardState title={t('board.unavailable.title')} description={t('board.unavailable.body')} command="repo-harness operator serve" />;
  if (ready.repositories.length === 0) return <BoardState title={t('board.noRepositories.title')} description={t('board.noRepositories.body')} command="repo-harness adopt --help" />;

  const waiting = ready.attention;
  const subjects = new Set(waiting.map(row => row.subject_id));
  // Only tasks continue here; document sessions join this list with slice 4.
  const continuing = ready.items
    .filter(item => item.hidden === null && (item.column === 'building' || item.column === 'verifying') && !subjects.has(item.id))
    .sort((left, right) => time(right.pull_request?.updated_at) - time(left.pull_request?.updated_at) || (left.id < right.id ? -1 : 1));
  const trouble = view.refreshFailed || ready.repositories.some(repository => failedSources(repository).length > 0);
  const lead = greeting(now, t);
  return (
    <div className="mx-auto flex w-full max-w-[1152px] flex-col gap-8" data-home>
      <header className="flex items-end justify-between gap-6 pt-2">
        <h1 className="type-display text-kumo-strong" data-waiting-count={waiting.length}>
          {waiting.length > 0 ? t('home.waiting', { greeting: lead, count: waiting.length }) : t('home.clear', { greeting: lead })}
        </h1>
        {/* One character per screen; a source problem takes the slot. */}
        <Mascot name={trouble ? 'cloud-off' : 'buddy-happy'} className="max-rail:hidden" />
      </header>
      <SourceBanner view={view} snapshot={ready} now={now} onOpen={onOpen} t={t} />
      <ListGroup id="home-waiting" title={t('attention.title')} count={waiting.length}>
        {waiting.length === 0 ? <p className="px-5 py-4 text-sm text-kumo-subtle">{t('attention.empty')}</p> : (
          <ul>{(waitingExpanded ? waiting : waiting.slice(0, WAITING_PREVIEW)).map(row =>
            <WaitingRow key={`${row.kind}:${row.subject_id}`} row={row} snapshot={ready} executions={executions} now={now} onOpen={onOpen} t={t} />)}</ul>
        )}
        {waiting.length > WAITING_PREVIEW && <FoldButton expanded={waitingExpanded} hidden={waiting.length - WAITING_PREVIEW} onToggle={() => setWaitingExpanded(value => !value)} t={t} />}
      </ListGroup>
      <ListGroup id="home-continue" title={t('home.continue')} count={continuing.length}>
        {continuing.length === 0 ? <p className="px-5 py-4 text-sm text-kumo-subtle">{t('board.empty.title')}</p> : (
          <ul>{(continueExpanded ? continuing : continuing.slice(0, CONTINUE_PREVIEW)).map(item =>
            <ContinueRow key={item.id} item={item} snapshot={ready} executions={executions} now={now} onOpen={onOpen} t={t} />)}</ul>
        )}
        {continuing.length > CONTINUE_PREVIEW && <FoldButton expanded={continueExpanded} hidden={continuing.length - CONTINUE_PREVIEW} onToggle={() => setContinueExpanded(value => !value)} t={t} />}
      </ListGroup>
      <section aria-labelledby="home-stages" className="flex flex-col gap-2">
        <h2 id="home-stages" className="type-small text-kumo-subtle">{t('board.columns')}</h2>
        <ul className="grid grid-cols-2 gap-2 rail:grid-cols-5">
          {DEV_ACTIVITY_COLUMNS.map(column => (
            <li key={column}>
              <PageLink to={BOARD} onOpen={onOpen} data-stage={column} className="flex flex-col gap-1 rounded-xl border border-kumo-line bg-kumo-base px-4 py-3 hover:bg-kumo-tint">
                <span className="text-xs text-kumo-subtle">{t(`column.${column}`)}</span>
                <span className="font-mono text-xl font-semibold tabular-nums text-kumo-strong">{ready.items.filter(item => item.hidden === null && item.column === column).length}</span>
              </PageLink>
            </li>
          ))}
        </ul>
      </section>
      <Today snapshot={ready} repairs={repairs} worktrees={worktrees} now={now} onOpen={onOpen} t={t} />
    </div>
  );
}
