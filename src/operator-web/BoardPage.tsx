import { useMemo, useState, type FormEvent } from 'react';
import { Banner, Button, cn } from '@cloudflare/kumo';
import { MagnifyingGlassIcon, WarningIcon } from '@phosphor-icons/react';
import type { BoardFindingV1 } from '../core/board/attention';
import type { BoardItemV1, BoardPullRequestV1, BoardV1 } from '../core/board/board';
import {
  BOARD_STAGES, findingItem, itemStage, itemTerminals, primaryPullRequest, shippedToday,
  type BoardReason, type BoardStage, type BoardView,
} from './board-view';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { itemOwner, useExecutions, type ExecutionReader } from './repository-reads';
import { TaskDrawer } from './TaskDrawer';
import { Age, BoardState, ExternalLink, PageLink, SectionTitle, StatusDot, type DotTone } from './ui';
import { boardLocation, type BoardPlace, type WorkspaceLocation } from './workspace-location';

const INFLIGHT_PREVIEW = 4;
type BoardTab = 'all' | 'attention' | Exclude<BoardStage, 'closed'>;

export interface BoardRepositoryOption {
  readonly id: string;
  readonly label: string;
}

const STAGE_TONE: Readonly<Record<BoardStage, DotTone>> = { building: 'active', verifying: 'warn', ready: 'ok', closed: 'neutral' };

/** The board has no default subject: the operator names the repository and the parent issue. */
function SubjectForm({ repositories, initialRepository, onOpen, t }: {
  readonly repositories: readonly BoardRepositoryOption[]; readonly initialRepository: string | null;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const [repository, setRepository] = useState(() => repositories.find(option => option.id === initialRepository)?.id ?? repositories[0]?.id ?? '');
  const [parent, setParent] = useState('');
  const valid = repository !== '' && /^[1-9][0-9]{0,9}$/u.test(parent);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onOpen(boardLocation({ repository_id: repository, parent: Number(parent), issue: null }));
  };
  const field = 'h-9 rounded-md border border-kumo-line bg-kumo-base px-2.5 text-sm text-kumo-default focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none';
  return (
    <form className="flex max-w-xl flex-col gap-3 rounded-xl border border-kumo-line bg-kumo-base p-5" onSubmit={submit} data-board-subject>
      <h1 className="text-base font-semibold text-kumo-strong">{t('board.subject.title')}</h1>
      <p className="text-sm text-kumo-subtle">{t('board.subject.body')}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-kumo-subtle">
          {t('board.subject.repository')}
          <select className={field} value={repository} onChange={event => setRepository(event.target.value)}>
            {repositories.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-kumo-subtle sm:w-36">
          {t('board.subject.parent')}
          <input className={cn(field, 'font-mono')} inputMode="numeric" placeholder="1503" value={parent} onChange={event => setParent(event.target.value.trim())} />
        </label>
        <Button type="submit" variant="primary" disabled={!valid}>{t('board.subject.open')}</Button>
      </div>
    </form>
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
        <span className="w-28"><span className="inline-flex rounded-full bg-(--rh-accent-tint) px-2 py-0.5 font-mono text-[11px] text-kumo-brand" data-rule={finding.rule}>{t(`board.rule.${finding.rule}` as OperatorMessageKey)}</span></span>
        <span className="w-32 min-w-0">{item ? <SeatCell board={board} item={item} t={t} /> : null}</span>
        <span className="w-20"><ChecksCell pr={pr} t={t} /></span>
        <span className="w-16 text-right text-kumo-subtle">{at ? <Age at={at} now={now} t={t} bare /> : null}</span>
        {pr ? <ExternalLink href={pr.url} className="w-12">PR</ExternalLink> : <span className="w-12" />}
      </div>
    </li>
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
function SourceBanners({ board, refreshFailed, unevaluated, t }: {
  readonly board: BoardV1; readonly refreshFailed: BoardReason | null; readonly unevaluated: number; readonly t: OperatorTranslate;
}) {
  const rows: { readonly key: string; readonly text: string }[] = [];
  if (refreshFailed !== null) rows.push({ key: 'refresh', text: t('board.banner.refreshFailed', { reason: t(`board.reason.${refreshFailed}` as OperatorMessageKey) }) });
  if (board.execution.status === 'unavailable') rows.push({ key: 'execution', text: t('board.banner.execution', { reason: board.execution.reason }) });
  if (board.daily_run.status === 'unavailable') rows.push({ key: 'daily', text: t('board.banner.dailyRun', { reason: board.daily_run.reason }) });
  if (board.plan.status === 'unavailable') rows.push({ key: 'plan', text: t('board.banner.plan', { reason: board.plan.reason }) });
  if (board.tooling.hc.status === 'unavailable') rows.push({ key: 'hc', text: t('board.banner.hc', { reason: board.tooling.hc.reason }) });
  if (unevaluated > 0) rows.push({ key: 'unevaluated', text: t('board.banner.unevaluated', { count: unevaluated }) });
  if (rows.length === 0) return null;
  return <>{rows.map(row => <Banner key={row.key} variant="alert" icon={<WarningIcon />} description={row.text} data-board-banner={row.key} />)}</>;
}

function matches(board: BoardV1, item: BoardItemV1, query: string): boolean {
  if (query === '') return true;
  const pr = primaryPullRequest(board, item);
  return [item.title, `#${item.number}`, pr?.head_ref ?? '', pr ? `#${pr.number}` : ''].some(text => text.toLowerCase().includes(query));
}

function ReadyBoard({ view, place, readExecution, generation, onOpen, now, t }: {
  readonly view: BoardView & { readonly kind: 'ready' }; readonly place: BoardPlace;
  readonly readExecution: ExecutionReader; readonly generation: number;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const { board, attention } = view;
  // Only the open drawer needs the verified sessions of this repository.
  const executions = useExecutions(readExecution, useMemo(() => [place.repository_id], [place.repository_id]), generation, place.issue !== null);
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
  const inflight = tab === 'attention' ? [] : open.filter(item => !flagged.has(item.number) && (tab === 'all' || itemStage(board, item) === tab) && matches(board, item, needle));
  const shown = expanded ? inflight : inflight.slice(0, INFLIGHT_PREVIEW);
  const shipped = shippedToday(board, now);
  const tabs: readonly { readonly id: BoardTab; readonly count: number }[] = [
    { id: 'all', count: open.length },
    { id: 'attention', count: attention.findings.length },
    ...BOARD_STAGES.map(stage => ({ id: stage, count: open.filter(item => itemStage(board, item) === stage).length })),
  ];
  const drawerItem = place.issue === null ? null : board.items.find(item => item.number === place.issue) ?? null;
  const drawerBranch = drawerItem ? primaryPullRequest(board, drawerItem)?.head_ref ?? null : null;
  return (
    <div className="flex flex-col gap-5" data-board-parent={board.parent.number}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-base font-semibold text-kumo-strong">{t('board.parent', { number: board.parent.number })}</h1>
        <ExternalLink href={board.parent.url} className="min-w-0 text-sm">{board.parent.title}</ExternalLink>
        <span className="text-xs text-kumo-subtle">{board.repository}</span>
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
      <SourceBanners board={board} refreshFailed={view.refreshFailed} unevaluated={attention.unevaluated.length} t={t} />
      {findings.length > 0 && (
        <section aria-labelledby="board-attention" className="flex flex-col gap-2.5">
          <SectionTitle id="board-attention" count={findings.length}>{t('board.attention.title')}</SectionTitle>
          <ul className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-base">
            {findings.map((finding, index) => <AttentionRow key={`${finding.rule}:${index}`} board={board} finding={finding} place={place} onOpen={onOpen} now={now} t={t} />)}
          </ul>
        </section>
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
      {findings.length === 0 && inflight.length === 0 && <BoardState title={t('board.empty.title')} description={t('board.empty.parentBody')} />}
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
      {place.issue !== null && (
        <TaskDrawer board={board} attention={attention} item={drawerItem} issue={place.issue}
          owner={drawerBranch === null ? { state: 'none' } : itemOwner(executions, { repository_id: place.repository_id, branch: drawerBranch })}
          order={[...new Set([...findings.flatMap(finding => findingItem(board, finding) ?? []), ...inflight])]}
          place={place} onOpen={onOpen} now={now} t={t} />
      )}
    </div>
  );
}

export function BoardPage({ place, view, repositories, initialRepository, readExecution, generation, onOpen, now, t }: {
  readonly place: BoardPlace | null;
  /** The execution route: the verified sessions behind the Task drawer's follow-up. */
  readonly readExecution: ExecutionReader;
  readonly generation: number;
  /** Null exactly when `place` is null. */
  readonly view: BoardView | null;
  readonly repositories: readonly BoardRepositoryOption[];
  readonly initialRepository: string | null;
  readonly onOpen: (next: WorkspaceLocation) => void;
  readonly now: number;
  readonly t: OperatorTranslate;
}) {
  if (place === null || view === null) return <SubjectForm repositories={repositories} initialRepository={initialRepository} onOpen={onOpen} t={t} />;
  if (view.kind === 'loading') return <BoardState loading title={t('board.loading.title')} description={t('board.loading.parentBody', { number: place.parent })} />;
  if (view.kind === 'failed') {
    return (
      <div data-board-reason={view.reason}>
        <BoardState title={t('board.failed.title', { number: place.parent })} description={t(`board.reason.${view.reason}` as OperatorMessageKey)}
          command={`repo-harness board --parent ${place.parent} --json`} />
      </div>
    );
  }
  return <ReadyBoard view={view} place={place} readExecution={readExecution} generation={generation} onOpen={onOpen} now={now} t={t} />;
}
