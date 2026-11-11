import { useMemo, useState, type ReactNode } from 'react';
import { Banner, cn } from '@cloudflare/kumo';
import { MagnifyingGlassIcon, WarningIcon } from '@phosphor-icons/react';
import type { BoardFindingV1 } from '../core/board/attention';
import type { BoardItemV1, BoardPullRequestV1, BoardV1 } from '../core/board/board';
import { joinBoardParents, type BoardParentsV1, type BoardParentV1, type BoardSeatsV1 } from '../core/board/parents';
import { primaryPullRequest } from '../core/board/pull-requests';
import type { QuotaAccountReport } from '../core/board/quota';
import {
  BOARD_STAGES, findingItem, itemStage, itemTerminals, shippedToday,
  useBoard, useBoardParents, useBoardSeats, type BoardSeatsReader, type BoardSeatsView, type BoardParentsReader, type BoardParentsView, type BoardReader, type BoardReason, type BoardStage, type BoardView,
} from './board-view';
import { activeParent, officeLit, officeRoom } from './board-office';
import { BoardLayoutSwitch, BoardOfficeOverview, BoardOfficeRoom } from './BoardOffice';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import type { BossCommandWriter } from './office-boss';
import { OfficeSetupChecklist, officeSetupRows, type OfficeSetupReads } from './OfficeSetupChecklist';
import type { AdvisorMessageWriter, AdvisorTranscriptReader } from './OfficeAdvisorDialog';
import type { ThemeMode } from './theme';
import { isTaskMessagesTaskId } from '../core/operator/task-messages';
import type { QuotaView } from './quota';
import { itemOwner, useExecutions, useTaskMessages, type ExecutionReader, type ItemOwner, type TaskMessagesReader } from './repository-reads';
import { QUOTA_TONE, quotaAttention, QuotaUnavailable, QuotaWindow } from './SetupPages';
import { TaskDrawer } from './TaskDrawer';
import { Age, BoardState, ExternalLink, PageLink, SectionTitle, StatusDot, type DotTone } from './ui';
import { boardLocation, type BoardLayout, type BoardPlace, type WorkspaceLocation } from './workspace-location';

const INFLIGHT_PREVIEW = 4;
type BoardTab = 'all' | 'attention' | Exclude<BoardStage, 'closed'>;

export interface BoardRepositoryOption {
  readonly id: string;
  readonly label: string;
}

const STAGE_TONE: Readonly<Record<BoardStage, DotTone>> = { building: 'active', verifying: 'warn', ready: 'ok', closed: 'neutral' };

/** The visible repository of the parent list: the App's choice while it is an option, else the first option. */
export function boardListRepository(repositories: readonly BoardRepositoryOption[], chosenRepository: string | null): string | null {
  return repositories.find(option => option.id === chosenRepository)?.id ?? repositories[0]?.id ?? null;
}

/** `#1651`, `1651` or a part of the title. */
function parentMatches(parent: BoardParentV1, query: string): boolean {
  const words = query.trim().toLowerCase();
  if (words === '') return true;
  const number = words.replace(/^#/u, '');
  return (/^[0-9]+$/u.test(number) && String(parent.number).startsWith(number)) || parent.title.toLowerCase().includes(words);
}

function ParentRow({ repository, parent, onOpen, now, t }: {
  readonly repository: string; readonly parent: BoardParentV1 & { readonly seats: number };
  readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const { total, completed } = parent.sub_issues;
  return (
    <li className="border-b border-kumo-hairline last:border-b-0" data-board-parent-row={parent.number} data-seats={parent.seats}>
      <PageLink to={boardLocation({ repository_id: repository, parent: parent.number, issue: null, layout: 'list' })} onOpen={onOpen}
        className="flex flex-col gap-2 px-4 py-3 hover:bg-kumo-tint focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none active:bg-kumo-recessed md:flex-row md:items-center md:gap-4">
        <StatusDot tone={parent.seats > 0 ? 'active' : 'neutral'} className="hidden md:inline-flex" />
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0 font-mono text-xs text-kumo-subtle">#{parent.number}</span>
          <span className="min-w-0 text-sm font-medium break-words text-kumo-strong md:truncate">{parent.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-x-4 text-xs md:justify-end">
          <span className="inline-flex w-24 items-center gap-2" data-progress={`${completed}/${total}`}>
            <span className="flex h-1.5 w-12 overflow-hidden rounded-full bg-kumo-recessed" aria-hidden="true">
              <span className="bg-kumo-success" style={{ width: `${(completed / total) * 100}%` }} />
            </span>
            <span className="tabular-nums text-kumo-default">{completed}/{total}</span>
          </span>
          <span className={cn('w-20', parent.seats > 0 ? 'text-kumo-default' : 'text-kumo-subtle')}>{parent.seats === 0 ? t('board.parents.seatsNone') : parent.seats === 1 ? t('board.parents.seatsOne') : t('board.parents.seats', { count: parent.seats })}</span>
          <span className="w-16 text-right text-kumo-subtle"><Age at={parent.updated_at} now={now} t={t} bare /></span>
        </span>
      </PageLink>
    </li>
  );
}

/**
 * The entry of the Board page: the open parent issues of one repository. A
 * row opens that parent's board; a closed parent's board stays reachable
 * through its `#board/<repository>/<parent>` link.
 */
function ParentList({ repositories, repository, onRepository, parents, seats, onOpen, now, t }: {
  readonly repositories: readonly BoardRepositoryOption[]; readonly repository: string | null; readonly onRepository: (id: string) => void;
  readonly seats: BoardSeatsView | null;
  readonly parents: BoardParentsView | null; readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => parents?.kind === 'ready' && seats?.kind === 'ready' ? joinBoardParents(parents.list, seats.seats).parents.filter(parent => parentMatches(parent, query)) : [], [parents, seats, query]);
  const field = 'h-9 rounded-md border border-kumo-line bg-kumo-base px-2.5 text-sm text-kumo-default focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none';
  return (
    <section className="flex w-full max-w-4xl flex-col gap-4" aria-labelledby="board-parents" data-board-subject>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <h1 id="board-parents" className="text-base font-semibold text-kumo-strong">{t('board.subject.title')}</h1>
        <BoardLayoutSwitch layout="list" place={null} onOpen={onOpen} t={t} />
        <label className="flex min-w-0 md:ml-auto">
          <span className="sr-only">{t('board.subject.repository')}</span>
          <select className={cn(field, 'w-full md:w-56')} value={repository ?? ''} onChange={event => onRepository(event.target.value)}>
            {repositories.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="relative flex min-w-0 items-center md:w-64">
          <MagnifyingGlassIcon size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-kumo-subtle" />
          <span className="sr-only">{t('board.parents.filter')}</span>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('board.parents.filterPlaceholder')}
            className={cn(field, 'w-full pl-8 placeholder:text-kumo-placeholder')} data-board-parents-filter />
        </label>
      </div>
      {parents === null ? <BoardState title={t('board.parents.noRepository.title')} description={t('board.parents.noRepository.body')} />
        : parents.kind === 'loading' ? <BoardState loading title={t('board.parents.loading.title')} description={t('board.parents.loading.body')} />
        : parents.kind === 'failed' ? (
          <div data-board-parents-reason={parents.reason}>
            <BoardState title={t('board.parents.failed.title')} description={t(`board.reason.${parents.reason}` as OperatorMessageKey)} command="repo-harness board parents --json" />
          </div>
        )
        : seats?.kind === 'loading' ? <BoardState loading title={t('board.loading.title')} description={t('board.office.card.loading')} />
        : seats?.kind === 'failed' ? <BoardState title={t('board.parents.failed.title')} description={t(`board.reason.${seats.reason}` as OperatorMessageKey)} command="repo-harness board seats --json" />
        : parents.list.parents.length === 0 ? <BoardState title={t('board.parents.empty.title')} description={t('board.parents.empty.body')} />
        : shown.length === 0 ? <BoardState title={t('board.parents.noMatch.title')} description={t('board.parents.noMatch.body', { query: query.trim() })} />
        : (
          <ul className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base" data-board-parents>
            {shown.map(parent => <ParentRow key={parent.number} repository={repository!} parent={parent} onOpen={onOpen} now={now} t={t} />)}
          </ul>
        )}
    </section>
  );
}

function pullRequestLabel(pr: BoardPullRequestV1 | null, t: OperatorTranslate): string {
  if (pr === null) return t('board.pr.none');
  if (pr.state === 'merged') return t('board.pr.merged', { number: pr.number });
  return t(pr.is_draft ? 'board.pr.draft' : 'board.pr.open', { number: pr.number });
}

function ChecksCell({ pr, t }: { readonly pr: BoardPullRequestV1 | null; readonly t: OperatorTranslate }) {
  if (pr === null || pr.state !== 'open') return <span className="text-kumo-subtle">—</span>;
  const status = pr.required_check.status;
  return <span className={cn(status === 'failure' && 'text-kumo-danger', status === 'success' && 'text-kumo-success')} data-required-check={status}>{t(`board.check.${status}` as OperatorMessageKey)}</span>;
}

function SeatCell({ board, item, t }: { readonly board: BoardV1; readonly item: BoardItemV1; readonly t: OperatorTranslate }) {
  const terminal = itemTerminals(board, item)[0];
  if (terminal === undefined) return <span className="text-kumo-subtle" data-seat="none">{t('board.seat.none')}</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" data-seat={terminal.seat}>
      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-kumo-recessed font-mono text-[11px] font-semibold text-kumo-strong">{terminal.address}</span>
      <span className="truncate">{terminal.name ?? terminal.seat}</span>
      {terminal.status !== null && <span className="text-kumo-subtle">· {terminal.status}</span>}
    </span>
  );
}

/** The time a row last moved: its pull request head commit, else its newest claim status. */
function rowTime(item: BoardItemV1, pr: BoardPullRequestV1 | null): string | null {
  if (pr !== null) return pr.head_committed_at;
  return item.claim_status.status_kind === 'observed' ? item.claim_status.created_at : null;
}

function RowMeta({ board, item, pr, t }: { readonly board: BoardV1; readonly item: BoardItemV1 | null; readonly pr: BoardPullRequestV1 | null; readonly t: OperatorTranslate }) {
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-kumo-subtle">
      <span>{board.repository}{item ? `#${item.number}` : ''}</span>
      {pr && <><span aria-hidden="true">·</span><span className="truncate font-mono">{pr.head_ref}</span></>}
      <span aria-hidden="true">·</span><span>{pullRequestLabel(pr, t)}</span>
    </p>
  );
}

function AttentionRow({ board, finding, place, onOpen, now, t }: {
  readonly board: BoardV1; readonly finding: BoardFindingV1; readonly place: BoardPlace;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const item = findingItem(board, finding);
  const pr = board.pull_requests.find(entry => finding.pull_requests.includes(entry.number)) ?? (item ? primaryPullRequest(board, item) : null);
  const at = item ? rowTime(item, pr) : null;
  return (
    <li className="flex flex-col gap-2 border-b border-kumo-hairline px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4" data-finding={finding.rule}>
      <StatusDot tone={finding.route === 'orchestrator' ? 'accent' : 'warn'} className="hidden md:inline-flex" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {item
          ? <PageLink to={boardLocation({ ...place, issue: item.number })} onOpen={onOpen} className="truncate text-sm font-medium text-kumo-strong hover:underline">{item.title}</PageLink>
          : <span className="text-sm font-medium text-kumo-strong">{finding.message}</span>}
        {item && <span className="truncate text-xs text-kumo-default">{finding.message}</span>}
        <RowMeta board={board} item={item} pr={pr} t={t} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs md:justify-end">
        <span className="w-28"><span className="inline-flex rounded-full bg-(--rh-accent-tint) px-2 py-0.5 font-mono text-[11px] text-kumo-brand" data-rule={finding.rule}>{t(`board.rule.${finding.rule}`)}</span></span>
        <span className="w-32 min-w-0">{item ? <SeatCell board={board} item={item} t={t} /> : null}</span>
        <span className="w-20"><ChecksCell pr={pr} t={t} /></span>
        <span className="w-16 text-right text-kumo-subtle">{at ? <Age at={at} now={now} t={t} bare /> : null}</span>
        {pr ? <ExternalLink href={pr.url} className="w-12">PR</ExternalLink> : <span className="w-12" />}
      </div>
    </li>
  );
}

const quotaAccounts = (quota: QuotaView): readonly QuotaAccountReport[] => quota.kind === 'ready' ? quotaAttention(quota.report) : [];
const quotaTitle = (account: QuotaAccountReport, t: OperatorTranslate): string => t('board.quota.title', { account: t(`setup.quota.account.${account.account}`) });

/** One quota account in the attention row layout. The account has no item, seat or pull request, so those columns stay empty. */
function QuotaAttentionRow({ account, now, t }: { readonly account: QuotaAccountReport; readonly now: number; readonly t: OperatorTranslate }) {
  return (
    <li className="flex flex-col gap-2 border-b border-kumo-hairline px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4" data-quota-finding={account.account}>
      <StatusDot tone={QUOTA_TONE[account.state]} className="hidden md:inline-flex" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-kumo-strong">{quotaTitle(account, t)}</span>
        {account.reason !== null && <span className="text-xs [overflow-wrap:anywhere] text-kumo-default" data-quota-reason>{account.reason}</span>}
        {account.windows.some(window => window.state === account.state) && <ul className="flex flex-col gap-0.5">{account.windows.filter(window => window.state === account.state).map(window => <QuotaWindow key={window.window} window={window} bare t={t} />)}</ul>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs md:justify-end">
        <span className="w-28"><span className={cn('inline-flex rounded-full px-2 py-0.5 font-mono text-[11px]', account.state === 'exhausted' ? 'bg-kumo-danger-tint text-kumo-danger' : 'bg-kumo-warning-tint text-kumo-warning')} data-quota-chip={account.state}>{t(`setup.quota.state.${account.state}`)}</span></span>
        <span className="w-32" />
        <span className="w-20" />
        <span className="w-16 text-right text-kumo-subtle">{account.observed_at !== null ? <Age at={account.observed_at} now={now} t={t} bare /> : null}</span>
        <span className="w-12" />
      </div>
    </li>
  );
}

function AttentionSection({ count, children, t }: { readonly count: number; readonly children: ReactNode; readonly t: OperatorTranslate }) {
  return (
    <section aria-labelledby="board-attention" className="flex flex-col gap-2.5">
      <SectionTitle id="board-attention" count={count}>{t('board.attention.title')}</SectionTitle>
      <ul className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base">{children}</ul>
    </section>
  );
}

function InflightRow({ board, item, place, onOpen, now, t }: {
  readonly board: BoardV1; readonly item: BoardItemV1; readonly place: BoardPlace;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const pr = primaryPullRequest(board, item);
  const stage = itemStage(board, item);
  const at = rowTime(item, pr);
  return (
    <li className="flex flex-col gap-2 border-b border-kumo-hairline px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4" data-item={item.number} data-stage={stage}>
      <StatusDot tone={STAGE_TONE[stage]} className="hidden md:inline-flex" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <PageLink to={boardLocation({ ...place, issue: item.number })} onOpen={onOpen} className="truncate text-sm font-medium text-kumo-strong hover:underline">{item.title}</PageLink>
        <RowMeta board={board} item={item} pr={pr} t={t} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs md:justify-end">
        <span className="w-28"><span className="inline-flex rounded-full bg-kumo-recessed px-2 py-0.5 font-mono text-[11px] text-kumo-subtle">{t(`board.stage.${stage}` as OperatorMessageKey)}</span></span>
        <span className="w-32 min-w-0"><SeatCell board={board} item={item} t={t} /></span>
        <span className="w-20"><ChecksCell pr={pr} t={t} /></span>
        <span className="w-16 text-right text-kumo-subtle">{at ? <Age at={at} now={now} t={t} bare /> : null}</span>
        <span className="w-12" />
      </div>
    </li>
  );
}

/** One banner per source the board could not read; the other data still show (ADR-0002). */
function SourceBanners({ board, refreshFailed, unevaluated, quota, t }: {
  readonly board: BoardV1; readonly refreshFailed: BoardReason | null; readonly unevaluated: number; readonly quota: QuotaView; readonly t: OperatorTranslate;
}) {
  const rows: { readonly key: string; readonly text: string }[] = [];
  if (refreshFailed !== null) rows.push({ key: 'refresh', text: t('board.banner.refreshFailed', { reason: t(`board.reason.${refreshFailed}` as OperatorMessageKey) }) });
  if (board.execution.status === 'unavailable') rows.push({ key: 'execution', text: board.execution.reason === 'no_seat_terminals' ? t('board.banner.execution.no_seat_terminals') : t('board.banner.execution', { reason: board.execution.reason }) });
  if (board.daily_run.status === 'unavailable') rows.push({ key: 'daily', text: t('board.banner.dailyRun', { reason: board.daily_run.reason }) });
  if (board.plan.status === 'unavailable') rows.push({ key: 'plan', text: t('board.banner.plan', { reason: board.plan.reason }) });
  if (board.tooling.hc.status === 'unavailable') rows.push({ key: 'hc', text: t('board.banner.hc', { reason: board.tooling.hc.reason }) });
  if (unevaluated > 0) rows.push({ key: 'unevaluated', text: t('board.banner.unevaluated', { count: unevaluated }) });
  return (
    <>
      {rows.map(row => <Banner key={row.key} variant="alert" icon={<WarningIcon />} description={row.text} data-board-banner={row.key} />)}
      {quota.kind === 'unavailable' && <QuotaUnavailable reason={quota.reason} t={t} />}
    </>
  );
}

function matches(board: BoardV1, item: BoardItemV1, query: string): boolean {
  if (query === '') return true;
  const pr = primaryPullRequest(board, item);
  return [item.title, `#${item.number}`, pr?.head_ref ?? '', pr ? `#${pr.number}` : ''].some(text => text.toLowerCase().includes(query));
}

function ReadyBoard({ view, place, quota, readExecution, readTaskMessages, generation, onOpen, now, t }: {
  readonly view: BoardView & { readonly kind: 'ready' }; readonly place: BoardPlace; readonly quota: QuotaView;
  readonly readExecution: ExecutionReader; readonly readTaskMessages: TaskMessagesReader; readonly generation: number;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const { board, attention } = view;
  const [tab, setTab] = useState<BoardTab>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [shippedOpen, setShippedOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const open = useMemo(() => board.items.filter(item => item.state === 'open'), [board]);
  // An item leaves "in progress" only when a "waiting for you" row shows it.
  const flagged = useMemo(() => new Set(attention.findings.flatMap(finding => findingItem(board, finding)?.number ?? [])), [board, attention]);
  const findings = attention.findings.filter((finding) => {
    const item = findingItem(board, finding);
    if (tab !== 'all' && tab !== 'attention' && (item === null || itemStage(board, item) !== tab)) return false;
    return item === null ? needle === '' || finding.message.toLowerCase().includes(needle) : matches(board, item, needle);
  });
  // A quota account has no stage, as a finding with no item; only the two tabs without a stage list it.
  const accounts = quotaAccounts(quota);
  const quotaShown = tab === 'all' || tab === 'attention' ? accounts.filter(account => needle === '' || quotaTitle(account, t).toLowerCase().includes(needle)) : [];
  const inflight = tab === 'attention' ? [] : open.filter(item => !flagged.has(item.number) && (tab === 'all' || itemStage(board, item) === tab) && matches(board, item, needle));
  const shown = expanded ? inflight : inflight.slice(0, INFLIGHT_PREVIEW);
  const shipped = shippedToday(board, now);
  const tabs: readonly { readonly id: BoardTab; readonly count: number }[] = [
    { id: 'all', count: open.length },
    { id: 'attention', count: attention.findings.length + accounts.length },
    ...BOARD_STAGES.map(stage => ({ id: stage, count: open.filter(item => itemStage(board, item) === stage).length })),
  ];
  return (
    <div className="flex flex-col gap-5" data-board-parent={board.parent.number}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-base font-semibold text-kumo-strong">{t('board.parent', { number: board.parent.number })}</h1>
        <ExternalLink href={board.parent.url} className="min-w-0 text-sm">{board.parent.title}</ExternalLink>
        <span className="text-xs text-kumo-subtle">{board.repository}</span>
        <span className="ml-auto self-center"><BoardLayoutSwitch layout="list" place={place} onOpen={onOpen} t={t} /></span>
      </header>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-wrap gap-0.5 rounded-lg border border-kumo-line bg-kumo-base p-0.5" role="group" aria-label={t('board.tabs')}>
          {tabs.map(entry => (
            <button key={entry.id} type="button" aria-pressed={tab === entry.id} data-board-tab={entry.id}
              className={cn('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm', tab === entry.id ? 'bg-kumo-tint text-kumo-strong' : 'text-kumo-subtle hover:text-kumo-default')}
              onClick={() => { setTab(entry.id); setExpanded(false); }}>
              {t(entry.id === 'all' ? 'board.tab.all' : entry.id === 'attention' ? 'board.tab.attention' : `board.stage.${entry.id}` as OperatorMessageKey)}
              <span className="font-mono text-xs tabular-nums">{entry.count}</span>
            </button>
          ))}
        </div>
        <label className="relative flex min-w-0 items-center md:ml-auto md:w-72">
          <MagnifyingGlassIcon size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-kumo-subtle" />
          <span className="sr-only">{t('board.search')}</span>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('board.searchPlaceholder')}
            className="h-8 w-full rounded-md border border-kumo-line bg-kumo-base pr-2 pl-8 text-sm text-kumo-default placeholder:text-kumo-placeholder focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none" />
        </label>
      </div>
      <SourceBanners board={board} refreshFailed={view.refreshFailed} unevaluated={attention.unevaluated.length} quota={quota} t={t} />
      {findings.length + quotaShown.length > 0 && (
        <AttentionSection count={findings.length + quotaShown.length} t={t}>
          {quotaShown.map(account => <QuotaAttentionRow key={account.account} account={account} now={now} t={t} />)}
          {findings.map((finding, index) => <AttentionRow key={`${finding.rule}:${index}`} board={board} finding={finding} place={place} onOpen={onOpen} now={now} t={t} />)}
        </AttentionSection>
      )}
      {inflight.length > 0 && (
        <section aria-labelledby="board-inflight" className="flex flex-col gap-2.5">
          <SectionTitle id="board-inflight" count={inflight.length}>{t('board.inflight.title')}</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base">
            <ul>{shown.map(item => <InflightRow key={item.number} board={board} item={item} place={place} onOpen={onOpen} now={now} t={t} />)}</ul>
            {inflight.length > INFLIGHT_PREVIEW && (
              <button type="button" aria-expanded={expanded} className="h-10 w-full cursor-pointer border-t border-kumo-hairline text-sm text-kumo-subtle hover:bg-kumo-tint" onClick={() => setExpanded(value => !value)}>
                {expanded ? t('board.inflight.less', { count: INFLIGHT_PREVIEW }) : t('board.inflight.more', { count: inflight.length - INFLIGHT_PREVIEW })}
              </button>
            )}
          </div>
        </section>
      )}
      {findings.length === 0 && quotaShown.length === 0 && inflight.length === 0 && <BoardState title={t('board.empty.title')} description={t('board.empty.parentBody')} />}
      {shipped.length > 0 && (
        <section className="flex flex-col gap-2">
          <button type="button" aria-expanded={shippedOpen} className="self-start cursor-pointer text-sm text-kumo-subtle hover:text-kumo-default" onClick={() => setShippedOpen(value => !value)}>
            {t('board.shipped', { count: shipped.length })} {shippedOpen ? '⌃' : '⌄'}
          </button>
          {shippedOpen && (
            <ul className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base">
              {shipped.map(pr => (
                <li key={pr.number} className="flex items-center gap-3 border-b border-kumo-hairline px-4 py-2.5 text-sm last:border-b-0" data-shipped={pr.number}>
                  <StatusDot tone="neutral" />
                  <span className="min-w-0 flex-1 truncate">{board.items.find(item => pr.closes.includes(item.number))?.title ?? pr.head_ref}</span>
                  <ExternalLink href={pr.url} className="text-xs">#{pr.number}</ExternalLink>
                  <span className="w-16 text-right text-xs text-kumo-subtle"><Age at={pr.merged_at!} now={now} t={t} bare /></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <BoardDrawer view={view} place={place} readExecution={readExecution} readTaskMessages={readTaskMessages} generation={generation}
        order={[...new Set([...findings.flatMap(finding => findingItem(board, finding) ?? []), ...inflight])]} onOpen={onOpen} now={now} t={t} />
    </div>
  );
}

/** The Task drawer of `place.issue`, with the verified sessions and the inbox it reads; both layouts open it. */
function BoardDrawer({ view, place, readExecution, readTaskMessages, generation, order, onOpen, now, t }: {
  readonly view: BoardView & { readonly kind: 'ready' }; readonly place: BoardPlace;
  readonly readExecution: ExecutionReader; readonly readTaskMessages: TaskMessagesReader; readonly generation: number;
  readonly order: readonly BoardItemV1[]; readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const { board, attention } = view;
  // Only the open drawer needs the verified sessions of this repository.
  const executions = useExecutions(readExecution, useMemo(() => [place.repository_id], [place.repository_id]), generation, place.issue !== null);
  const drawerItem = place.issue === null ? null : board.items.find(item => item.number === place.issue) ?? null;
  const drawerBranch = drawerItem ? primaryPullRequest(board, drawerItem)?.head_ref ?? null : null;
  const owner: ItemOwner = drawerBranch === null ? { state: 'none' } : itemOwner(executions, { repository_id: place.repository_id, branch: drawerBranch });
  // Only a verified session names the task whose inbox the drawer reads, and only a 64-hex task id has an inbox.
  const taskIds = owner.state === 'verified' ? [...new Set(owner.tasks.map(task => task.task).filter(isTaskMessagesTaskId))] : [];
  const inboxReads = useTaskMessages(readTaskMessages, place.repository_id, taskIds, generation, place.issue !== null);
  if (place.issue === null) return null;
  return (
    <TaskDrawer board={board} attention={attention} item={drawerItem} issue={place.issue}
      owner={owner} inbox={taskIds.length === 0 ? null : { reads: inboxReads }}
      order={order} place={place} onOpen={onOpen} now={now} t={t} />
  );
}

/**
 * The room of one repository: its seats, and the board and Task drawer of the active parent. `reading`: the board read is pending.
 * `failure`: the board read failed; the room keeps its seats and shows the failure in the board region.
 */
function OfficeRoomView({ repositoryId, list, seats, parents, view, failure, reading, place, parent, quota, setup, writeBossCommand, readAdvisorTranscript, writeAdvisorMessage, mode, readExecution, readTaskMessages, generation, onOpen, now, t }: {
  readonly repositoryId: string; readonly list: BoardParentsV1 | null; readonly seats: BoardSeatsV1; readonly parents: BoardParentsView; readonly view: (BoardView & { readonly kind: 'ready' }) | null; readonly failure: ReactNode; readonly reading: boolean;
  readonly place: BoardPlace | null; readonly parent: number | null; readonly quota: QuotaView; readonly setup: OfficeSetupReads; readonly writeBossCommand: BossCommandWriter;
  readonly readAdvisorTranscript: AdvisorTranscriptReader; readonly writeAdvisorMessage: AdvisorMessageWriter; readonly mode: ThemeMode;
  readonly readExecution: ExecutionReader; readonly readTaskMessages: TaskMessagesReader; readonly generation: number;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const board = view?.board ?? null;
  const attention = view?.attention ?? null;
  const room = useMemo(() => officeRoom(seats, board === null || attention === null ? null : { board, attention }), [seats, board, attention]);
  // j/k in the drawer move through the desks, then the acceptance queue.
  const accounts = quotaAccounts(quota);
  const order = board === null ? [] : [...new Set([...room.desks.map(desk => desk.drawerIssue), ...room.queue.map(entry => entry.issue)])]
    .flatMap(issue => board.items.find(item => item.number === issue) ?? []);
  return (
    <>
      <BoardOfficeRoom key={`${repositoryId}:${parent}`} repository={list?.repository ?? repositoryId} repositoryId={repositoryId} parent={parent} defaultBranch={board?.default_branch ?? null} room={room} reading={reading} place={place} writeBoss={writeBossCommand} readAdvisor={readAdvisorTranscript} writeAdvisor={writeAdvisorMessage} mode={mode} onOpen={onOpen} now={now} t={t}
        banners={view === null ? failure : (
          <>
            <SourceBanners board={view.board} refreshFailed={view.refreshFailed} unevaluated={view.attention.unevaluated.length} quota={quota} t={t} />
            {accounts.length > 0 && <AttentionSection count={accounts.length} t={t}>{accounts.map(account => <QuotaAttentionRow key={account.account} account={account} now={now} t={t} />)}</AttentionSection>}
          </>
        )}
        setup={officeLit(room) ? null : <OfficeSetupChecklist rows={officeSetupRows(setup, { kind: 'room', repositoryId, parent, parents, seats: { kind: 'ready', seats }, plan: parents.kind !== 'ready' || reading ? 'unread' : board?.plan ?? (parent === null ? 'no_parent' : 'unread') }, t)} t={t} />} />
      {view !== null && place !== null && (
        <BoardDrawer view={view} place={place} readExecution={readExecution} readTaskMessages={readTaskMessages} generation={generation} order={order} onOpen={onOpen} now={now} t={t} />
      )}
    </>
  );
}

/** A failed board read of `parent`: its reason and the command that reads the board again. */
function BoardFailure({ reason, parent, t }: { readonly reason: BoardReason; readonly parent: number; readonly t: OperatorTranslate }) {
  return (
    <div data-board-reason={reason}>
      <BoardState title={t('board.failed.title', { number: parent })} description={t(`board.reason.${reason}` as OperatorMessageKey)} command={`repo-harness board --parent ${parent} --json`} />
    </div>
  );
}

/**
 * The office of one repository. Every seat comes from the parent list. A
 * location with a parent shows the board that the App read; a location
 * without one reads the board of the active parent, if the repository has one.
 */
function OfficeRepository({ repositoryId, place, placeView, quota, setup, readBoard, readBoardParents, readBoardSeats, writeBossCommand, readAdvisorTranscript, writeAdvisorMessage, mode, readExecution, readTaskMessages, generation, onOpen, now, t }: {
  readonly repositoryId: string; readonly place: BoardPlace | null; readonly placeView: BoardView | null; readonly quota: QuotaView; readonly setup: OfficeSetupReads;
  readonly readBoard: BoardReader; readonly readBoardParents: BoardParentsReader; readonly readBoardSeats: BoardSeatsReader; readonly writeBossCommand: BossCommandWriter;
  readonly readAdvisorTranscript: AdvisorTranscriptReader; readonly writeAdvisorMessage: AdvisorMessageWriter; readonly mode: ThemeMode;
  readonly readExecution: ExecutionReader; readonly readTaskMessages: TaskMessagesReader; readonly generation: number;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const parents = useBoardParents(readBoardParents, repositoryId, generation)!;
  const seats = useBoardSeats(readBoardSeats, repositoryId, generation)!;
  const active = place === null && parents.kind === 'ready' && seats.kind === 'ready' ? activeParent(parents.list, seats.seats) : null;
  const activeView = useBoard(readBoard, useMemo(() => (active === null ? null : { repository_id: repositoryId, parent: active }), [repositoryId, active]), generation);
  const view = place === null ? activeView : placeView;
  const parent = place?.parent ?? active;
  if (seats.kind === 'failed') {
    return (
      <div className="board-office" data-board-parents-reason={seats.reason}>
        <OfficeSetupChecklist rows={officeSetupRows(setup, { kind: 'room', repositoryId, parent, parents, seats, plan: 'unread' }, t)} t={t} />
      </div>
    );
  }
  if (seats.kind === 'loading') return <BoardState loading title={t('board.loading.title')} description={t('board.office.card.loading')} />;
  const failure = view?.kind === 'failed' && <BoardFailure reason={view.reason} parent={parent!} t={t} />;
  return <OfficeRoomView repositoryId={repositoryId} list={parents.kind === 'ready' ? parents.list : null} seats={seats.seats} parents={parents} view={view?.kind === 'ready' ? view : null} failure={failure} reading={view?.kind === 'loading'} place={place} parent={parent} quota={quota} setup={setup} writeBossCommand={writeBossCommand} readAdvisorTranscript={readAdvisorTranscript} writeAdvisorMessage={writeAdvisorMessage} mode={mode} readExecution={readExecution} readTaskMessages={readTaskMessages} generation={generation} onOpen={onOpen} now={now} t={t} />;
}

export function BoardPage({ layout, place, room, view, parents, repositories, chosenRepository, onRepository, setup, quota, readBoard, readBoardParents, readBoardSeats, writeBossCommand, readAdvisorTranscript, writeAdvisorMessage, mode, readExecution, readTaskMessages, generation, onOpen, now, t }: {
  /** The layout of the location; with a board it equals `place.layout`. */
  readonly layout: BoardLayout;
  readonly place: BoardPlace | null;
  /** The repository of a room with no selected parent; null otherwise. */
  readonly room: string | null;
  /** The board route, for the active parent of a room with no selected parent and of each overview card. */
  readonly readBoard: BoardReader;
  /** The parents route: the office overview reads it once for each registered repository, and a room reads its seats. */
  readonly readBoardParents: BoardParentsReader;
  readonly readBoardSeats: BoardSeatsReader;
  /** The boss command route of the office room (#1757). */
  readonly writeBossCommand: BossCommandWriter;
  readonly readAdvisorTranscript: AdvisorTranscriptReader;
  readonly writeAdvisorMessage: AdvisorMessageWriter;
  /** Night in the scene follows the resolved theme. */
  readonly mode: ThemeMode;
  /** The execution route: the verified sessions behind the Task drawer's follow-up. */
  readonly readExecution: ExecutionReader;
  /** The task messages route: the stored inbox of each verified task in the Task drawer. */
  readonly readTaskMessages: TaskMessagesReader;
  readonly generation: number;
  /** Null exactly when `place` is null. */
  readonly view: BoardView | null;
  /** The parent list of the chosen repository; null when the page shows a board or no repository is registered. */
  readonly parents: BoardParentsView | null;
  readonly repositories: readonly BoardRepositoryOption[];
  readonly chosenRepository: string | null;
  readonly onRepository: (id: string) => void;
  /** The reads of the Office setup checklist that no Board read carries. */
  readonly setup: OfficeSetupReads;
  /** The account-wide quota read: every board shows the same state. */
  readonly quota: QuotaView;
  readonly onOpen: (next: WorkspaceLocation) => void;
  readonly now: number;
  readonly t: OperatorTranslate;
}) {
  const listRepository = place === null && room === null && layout === 'list' ? boardListRepository(repositories, chosenRepository) : null;
  const listSeats = useBoardSeats(readBoardSeats, listRepository, generation);
  const office = { quota, setup, readBoard, readBoardParents, readBoardSeats, writeBossCommand, readAdvisorTranscript, writeAdvisorMessage, mode, readExecution, readTaskMessages, generation, onOpen, now, t };
  if (place === null || view === null) {
    if (room !== null) return <OfficeRepository repositoryId={room} place={null} placeView={null} {...office} />;
    if (layout === 'office') return <BoardOfficeOverview repositories={repositories} readParents={readBoardParents} readSeats={readBoardSeats} readBoard={readBoard} setup={setup} generation={generation} mode={mode} onOpen={onOpen} t={t} />;
    return <ParentList repositories={repositories} repository={boardListRepository(repositories, chosenRepository)} onRepository={onRepository} parents={parents} seats={listSeats} onOpen={onOpen} now={now} t={t} />;
  }
  if (place.layout === 'office') return <OfficeRepository repositoryId={place.repository_id} place={place} placeView={view} {...office} />;
  if (view.kind === 'failed') return <BoardFailure reason={view.reason} parent={place.parent} t={t} />;
  if (view.kind === 'loading') return <BoardState loading title={t('board.loading.title')} description={t('board.loading.parentBody', { number: place.parent })} />;
  return <ReadyBoard view={view} place={place} quota={quota} readExecution={readExecution} readTaskMessages={readTaskMessages} generation={generation} onOpen={onOpen} now={now} t={t} />;
}
