import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Banner, Empty, Loader, cn } from '@cloudflare/kumo';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BroomIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  CircuitryIcon,
  GitBranchIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  HandIcon,
  HourglassIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TerminalWindowIcon,
  WarningIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { DEV_ACTIVITY_COLUMNS, type DevActivityAttention, type DevActivityColumn, type DevActivityItem, type DevActivitySnapshotV1 } from '../core/dev-activity/types';
import { nativeRuntimeFreshness, type NativeRuntimeSourceSummary } from '../core/operator/runtime-status';
import {
  attentionItem,
  filterItems,
  itemBlocks,
  orderColumn,
  repositoryLabel,
  type BoardFilters,
  type DevActivityView,
} from './dev-activity';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { ageWords, blockReasonLabel, phaseLabel, runtimeStateLabel, runtimeTone } from './labels';
import { ItemDrawer } from './ItemDrawer';
import type { RuntimeView } from './RuntimeBadges';
import { Age, CommandLine, ExternalLink, SectionTitle, StatusDot } from './ui';

const ATTENTION_PREVIEW = 5;
const RUNTIME_CONFIG_COMMAND = 'repo-harness operator serve --runtime-status-config <absolute-path>';

const ATTENTION_ICON: Readonly<Record<DevActivityAttention['kind'], ReactNode>> = {
  ready_to_merge: <GitMergeIcon size={16} />,
  ledger_waiting_owner: <HandIcon size={16} />,
  human_request: <ChatCircleDotsIcon size={16} />,
  runtime_blocked: <WarningIcon size={16} />,
};

function AttentionRow({ row, snapshot, now, onOpen, t }: {
  readonly row: DevActivityAttention; readonly snapshot: DevActivitySnapshotV1; readonly now: number;
  readonly onOpen: (id: string) => void; readonly t: OperatorTranslate;
}) {
  const item = attentionItem(snapshot, row);
  const where = [repositoryLabel(snapshot.repositories, row.repository_id), item?.branch].filter(Boolean).join(' / ');
  return (
    <li className="flex flex-col gap-2 border-b border-kumo-hairline px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4" data-attention-kind={row.kind}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 shrink-0 text-kumo-warning">{ATTENTION_ICON[row.kind]}</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-kumo-subtle">{t(`attention.kind.${row.kind}` as OperatorMessageKey)}</p>
          {item ? (
            <button type="button" className="block max-w-full cursor-pointer truncate text-left text-sm font-medium text-kumo-strong hover:underline" onClick={() => onOpen(item.id)}>{row.summary}</button>
          ) : <p className="truncate text-sm font-medium text-kumo-strong">{row.summary}</p>}
          <p className="truncate text-xs text-kumo-subtle">{where}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 pl-7 sm:pl-0">
        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-kumo-subtle">
          <HourglassIcon size={12} aria-hidden="true" />
          {t('attention.waiting', { age: ageWords(row.waiting_since, now, t) })}
        </span>
        {row.url && <ExternalLink href={row.url} className="text-sm">{t('attention.openLink')}</ExternalLink>}
        {!row.url && row.command && <CommandLine command={row.command} t={t} className="max-w-full sm:max-w-md lg:max-w-xl" />}
      </div>
    </li>
  );
}

/** §3.4: one queue, oldest first. Its length is the page count and the tab title. */
function AttentionQueue({ snapshot, now, onOpen, t }: {
  readonly snapshot: DevActivitySnapshotV1; readonly now: number; readonly onOpen: (id: string) => void; readonly t: OperatorTranslate;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = snapshot.attention;
  const shown = expanded ? rows : rows.slice(0, ATTENTION_PREVIEW);
  return (
    <section aria-labelledby="needs-you-heading" className="needs-you overflow-hidden rounded-xl border border-kumo-line bg-kumo-base" data-attention-count={rows.length}>
      <div className="flex items-center justify-between gap-2 border-b border-kumo-hairline px-4 py-2.5">
        <SectionTitle id="needs-you-heading" count={rows.length}><span tabIndex={-1} id="needs-you" className="outline-none">{t('attention.title')}</span></SectionTitle>
      </div>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-kumo-subtle"><CheckCircleIcon size={16} className="text-kumo-success" />{t('attention.empty')}</p>
      ) : (
        <ul>{shown.map(row => <AttentionRow key={`${row.kind}:${row.subject_id}`} row={row} snapshot={snapshot} now={now} onOpen={onOpen} t={t} />)}</ul>
      )}
      {rows.length > ATTENTION_PREVIEW && (
        <button type="button" className="w-full cursor-pointer border-t border-kumo-hairline px-4 py-2 text-left text-sm text-kumo-link hover:bg-kumo-tint" onClick={() => setExpanded(value => !value)}>
          {expanded ? t('attention.less') : t('attention.more', { count: rows.length - ATTENTION_PREVIEW })}
        </button>
      )}
    </section>
  );
}

const PROVIDER_ICON: Readonly<Record<NativeRuntimeSourceSummary['provider'], ReactNode>> = {
  codex: <TerminalWindowIcon size={16} />,
  claude: <ChatCircleDotsIcon size={16} />,
  pi: <CircuitryIcon size={16} />,
};

function RosterEntry({ source, now, t }: { readonly source: NativeRuntimeSourceSummary; readonly now: number; readonly t: OperatorTranslate }) {
  const latest = source.observations.slice().sort((a, b) => Date.parse(b.event_received_at) - Date.parse(a.event_received_at))[0] ?? null;
  // Retain server rejection states. Only a current source can age locally.
  const freshness = source.freshness === 'fresh' ? nativeRuntimeFreshness(source, now) : source.freshness;
  const state = latest?.state ?? null;
  const changed = latest ? latest.changed_at ?? latest.event_received_at : null;
  return (
    <li className="flex min-w-56 shrink-0 items-start gap-3 rounded-lg border border-kumo-hairline bg-kumo-base px-3 py-2.5" data-roster-source={source.source_id}>
      <span className="mt-0.5 text-kumo-subtle">{PROVIDER_ICON[source.provider]}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-kumo-strong">
          <span className="capitalize">{source.provider}</span>
          <span className="truncate font-mono text-xs font-normal text-kumo-subtle">{source.source_id}</span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-kumo-default">
          <StatusDot tone={runtimeTone(state)} pulse={state === 'working'} />
          <span>{state === null ? t('roster.noReport') : runtimeStateLabel(state, t)}</span>
          {state === 'blocked' && latest && <span className="text-kumo-warning">· {t(`runtimeObservation.reason.${latest.reason}` as OperatorMessageKey)}</span>}
          {changed && <span className="text-kumo-subtle">· <Age at={changed} now={now} t={t} bare /></span>}
        </p>
        <p className="text-xs text-kumo-subtle">
          {t('roster.unbound')} · <span className={freshness === 'fresh' ? '' : 'text-kumo-danger'} data-roster-freshness={freshness}>{t(`runtimeNative.freshness.${freshness}` as OperatorMessageKey)}</span>
        </p>
      </div>
    </li>
  );
}

/** One chip per runtime source. Sources carry no verified task binding, so none claims a card. */
function AgentRoster({ runtime, now, t }: { readonly runtime: RuntimeView; readonly now: number; readonly t: OperatorTranslate }) {
  const sources = runtime.overlay.native_sources;
  if (sources.length === 0) {
    return (
      <section aria-labelledby="roster-heading" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3" data-roster="not-connected">
        <h2 id="roster-heading" className="sr-only">{t('roster.title')}</h2>
        <p className="text-sm text-kumo-subtle">{t(runtime.failed ? 'roster.refreshFailed' : 'roster.notConnected')}</p>
        <CommandLine command={RUNTIME_CONFIG_COMMAND} t={t} className="max-w-full sm:max-w-lg" />
      </section>
    );
  }
  return (
    <section aria-labelledby="roster-heading" className="flex flex-col gap-2" data-roster="connected">
      <SectionTitle id="roster-heading" count={sources.length}>{t('roster.title')}</SectionTitle>
      {runtime.failed && <p className="text-xs text-kumo-warning">{t('roster.refreshFailed')}</p>}
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{sources.map(source => <RosterEntry key={source.source_id} source={source} now={now} t={t} />)}</ul>
    </section>
  );
}

const CI_ICON: Readonly<Record<string, ReactNode>> = {
  success: <CheckCircleIcon size={13} className="text-kumo-success" />,
  failure: <XCircleIcon size={13} className="text-kumo-danger" />,
  pending: <CircleDashedIcon size={13} className="text-kumo-warning" />,
};

function ItemSignals({ item, t }: { readonly item: DevActivityItem; readonly t: OperatorTranslate }) {
  const pr = item.pull_request;
  const tree = item.worktrees[0] ?? null;
  const dirty = item.worktrees.some(row => row.dirty);
  const signals: ReactNode[] = [];
  if (pr) {
    signals.push(<a key="pr" href={pr.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-kumo-link hover:underline" onClick={event => event.stopPropagation()}>
      <GitPullRequestIcon size={13} aria-hidden="true" />#{pr.number}</a>);
    if (pr.is_draft) signals.push(<span key="draft">{t('card.draft')}</span>);
    if (pr.ci !== null && pr.ci !== 'none') signals.push(<span key="ci" className="inline-flex items-center gap-1" data-ci={pr.ci}>{CI_ICON[pr.ci]}{t(`card.ci.${pr.ci}` as OperatorMessageKey)}</span>);
    if (pr.review !== 'none' && pr.state === 'open') signals.push(<span key="review" className={pr.review === 'changes_requested' ? 'text-kumo-danger' : ''} data-review={pr.review}>{t(`card.review.${pr.review}` as OperatorMessageKey)}</span>);
    if (pr.state === 'closed') signals.push(<span key="closed">{t('card.closed')}</span>);
  }
  if (dirty) signals.push(<span key="dirty" className="inline-flex items-center gap-1"><PencilSimpleIcon size={12} aria-hidden="true" />{t('card.dirty')}</span>);
  if (tree?.ahead) signals.push(<span key="ahead" className="inline-flex items-center gap-0.5" title={t('card.ahead', { count: tree.ahead })}><ArrowUpIcon size={11} aria-hidden="true" />{tree.ahead}<span className="sr-only"> {t('card.ahead', { count: tree.ahead })}</span></span>);
  if (tree?.behind) signals.push(<span key="behind" className="inline-flex items-center gap-0.5" title={t('card.behind', { count: tree.behind })}><ArrowDownIcon size={11} aria-hidden="true" />{tree.behind}<span className="sr-only"> {t('card.behind', { count: tree.behind })}</span></span>);
  if (item.cleanup_pending) signals.push(<span key="cleanup" className="inline-flex items-center gap-1 text-kumo-subtle"><BroomIcon size={12} aria-hidden="true" />{t('card.cleanup')}</span>);
  if (signals.length === 0) return null;
  return <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-kumo-default">{signals}</p>;
}

function AgentLine({ item, now, t }: { readonly item: DevActivityItem; readonly now: number; readonly t: OperatorTranslate }) {
  const blocks = itemBlocks(item);
  if (blocks.length > 0) {
    const block = blocks[0]!;
    return (
      <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-kumo-danger" data-blocked>
        <WarningIcon size={13} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{t('card.blocked', { reason: blockReasonLabel(block, t), age: ageWords(block.since, now, t) })}</span>
      </p>
    );
  }
  // No agent is the common case without runtime status; the roster already says so once.
  if (!item.agent) return null;
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs text-kumo-default">
      <StatusDot tone={runtimeTone(item.agent.runtime_state)} pulse={item.agent.runtime_state === 'working'} />
      <span className="truncate font-medium">{item.agent.label}</span>
      {item.agent.runtime_state && <span className="shrink-0 text-kumo-subtle">· {runtimeStateLabel(item.agent.runtime_state, t)}</span>}
    </p>
  );
}

/** Each column's own clock: merge time when shipped, PR creation for open PRs. */
function ColumnAge({ item, now, t }: { readonly item: DevActivityItem; readonly now: number; readonly t: OperatorTranslate }) {
  const pr = item.pull_request;
  if (item.column === 'shipped' && pr?.merged_at) return <span className="inline-flex items-center gap-1"><GitMergeIcon size={11} aria-hidden="true" />{t('card.merged', { age: ageWords(pr.merged_at, now, t) })}</span>;
  if (!item.column_since) return null;
  const key = pr?.state === 'open' ? 'card.prOpened' : 'card.inColumn';
  return <span className="inline-flex items-center gap-1"><HourglassIcon size={11} aria-hidden="true" />{t(key, { age: ageWords(item.column_since, now, t) })}</span>;
}

/** Four lines at most: what, where it stands, who, and the signals that exist. */
function ItemCard({ item, snapshot, now, selected, onOpen, t }: {
  readonly item: DevActivityItem; readonly snapshot: DevActivitySnapshotV1; readonly now: number;
  readonly selected: boolean; readonly onOpen: (id: string) => void; readonly t: OperatorTranslate;
}) {
  const blocked = itemBlocks(item).length > 0;
  return (
    <article
      className={cn('board-card group relative flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-kumo-base px-3 py-2.5 transition-colors hover:border-kumo-line hover:bg-kumo-elevated',
        blocked ? 'border-kumo-hairline border-l-4 border-l-kumo-danger' : 'border-kumo-hairline',
        selected && 'ring-2 ring-kumo-brand')}
      data-item-id={item.id}
      data-column={item.column}
      data-blocked={blocked || undefined}
      onClick={() => onOpen(item.id)}
    >
      <button type="button" data-card-open className="min-w-0 cursor-pointer text-left text-sm font-medium leading-snug text-kumo-strong focus-visible:underline focus-visible:outline-none" onClick={event => { event.stopPropagation(); onOpen(item.id); }}>
        <span className="line-clamp-2">{item.title}</span>
      </button>
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-kumo-subtle">
        <span className="min-w-0 max-w-full truncate">{repositoryLabel(snapshot.repositories, item.repository_id)}</span>
        {item.ledger && <span className="rounded border border-kumo-line px-1.5 text-[11px] leading-4 text-kumo-default" data-phase={item.ledger.phase}>{phaseLabel(item.ledger.phase, t)}</span>}
        <ColumnAge item={item} now={now} t={t} />
        {!item.ledger && !item.column_since && !item.pull_request?.merged_at && item.branch && item.branch !== item.title && <span className="inline-flex min-w-0 items-center gap-1"><GitBranchIcon size={11} aria-hidden="true" /><span className="truncate font-mono">{item.branch}</span></span>}
      </p>
      <AgentLine item={item} now={now} t={t} />
      <ItemSignals item={item} t={t} />
    </article>
  );
}

function BoardToolbar({ filters, onFilters, searchRef, t }: {
  readonly filters: BoardFilters; readonly onFilters: (next: BoardFilters) => void;
  readonly searchRef: React.RefObject<HTMLInputElement | null>; readonly t: OperatorTranslate;
}) {
  const check = 'size-4 cursor-pointer accent-[var(--color-kumo-brand)]';
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4" role="group" aria-label={t('board.filters')}>
      <label className="relative flex min-w-0 items-center sm:w-72">
        <MagnifyingGlassIcon size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-kumo-subtle" />
        <span className="sr-only">{t('board.search')}</span>
        <input
          ref={searchRef}
          id="board-search"
          type="search"
          value={filters.query}
          onChange={event => onFilters({ ...filters, query: event.target.value })}
          placeholder={t('board.searchPlaceholder')}
          className="h-8 w-full rounded-md border border-kumo-line bg-kumo-base pr-8 pl-8 text-sm text-kumo-default placeholder:text-kumo-placeholder focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none"
        />
        <kbd className="pointer-events-none absolute right-2 rounded border border-kumo-hairline px-1 font-mono text-[11px] text-kumo-subtle">/</kbd>
      </label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-kumo-default">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input type="checkbox" className={check} checked={filters.onlyNeedsYou} onChange={event => onFilters({ ...filters, onlyNeedsYou: event.target.checked })} />
          {t('board.onlyNeedsYou')}
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input type="checkbox" className={check} checked={filters.showClosed} onChange={event => onFilters({ ...filters, showClosed: event.target.checked })} />
          {t('board.showClosed')}
        </label>
      </div>
    </div>
  );
}

/** Long columns fold; Shipped folds sooner because it is history, not work. */
const COLUMN_PREVIEW: Readonly<Record<DevActivityColumn, number>> = { planned: 12, building: 12, verifying: 12, ready_to_merge: 12, shipped: 6 };

function BoardColumns({ columns, snapshot, now, selectedId, mobileColumn, onMobileColumn, onOpen, t }: {
  readonly columns: ReadonlyMap<DevActivityColumn, readonly DevActivityItem[]>; readonly snapshot: DevActivitySnapshotV1; readonly now: number;
  readonly selectedId: string | null; readonly mobileColumn: DevActivityColumn; readonly onMobileColumn: (column: DevActivityColumn) => void;
  readonly onOpen: (id: string) => void; readonly t: OperatorTranslate;
}) {
  const [unfolded, setUnfolded] = useState<ReadonlySet<DevActivityColumn>>(new Set());
  const toggle = (column: DevActivityColumn) => setUnfolded(current => {
    const next = new Set(current);
    if (next.has(column)) next.delete(column); else next.add(column);
    return next;
  });
  return (
    <section aria-label={t('board.columns')} className="flex flex-col gap-3">
      {/* Narrow screens show one column at a time behind a segmented control. */}
      <div className="flex gap-0.5 overflow-x-auto rounded-lg bg-kumo-recessed p-0.5 md:hidden" role="tablist" aria-label={t('board.columns')}>
        {DEV_ACTIVITY_COLUMNS.map(column => (
          <button key={column} type="button" role="tab" aria-selected={mobileColumn === column}
            className={cn('flex h-8 flex-1 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium',
              mobileColumn === column ? 'bg-kumo-base text-kumo-strong shadow-xs' : 'text-kumo-subtle')}
            onClick={() => onMobileColumn(column)}>
            {t(`column.${column}` as OperatorMessageKey)}<span className="tabular-nums opacity-70">{columns.get(column)?.length ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="board-columns grid grid-cols-1 gap-3 md:grid-cols-5">
        {DEV_ACTIVITY_COLUMNS.map(column => {
          const items = columns.get(column) ?? [];
          // The open drawer's item stays in view even inside a folded column.
          const limit = COLUMN_PREVIEW[column];
          const open = unfolded.has(column);
          const shown = open || items.length <= limit ? items : items.slice(0, limit).concat(items.slice(limit).filter(item => item.id === selectedId));
          return (
            <section key={column} aria-labelledby={`column-${column}`} data-board-column={column}
              className={cn('min-w-0 flex-col gap-2 rounded-xl bg-kumo-recessed/60 p-2', mobileColumn === column ? 'flex' : 'hidden md:flex')}>
              <h3 id={`column-${column}`} className="flex items-center justify-between px-1 pt-0.5 text-xs font-semibold tracking-wide text-kumo-subtle uppercase">
                {t(`column.${column}` as OperatorMessageKey)}
                <span className="tabular-nums" data-column-count>{items.length}</span>
              </h3>
              {items.length === 0
                ? <p className="px-1 pb-2 text-xs text-kumo-inactive">{t('column.empty')}</p>
                : shown.map(item => <ItemCard key={item.id} item={item} snapshot={snapshot} now={now} selected={item.id === selectedId} onOpen={onOpen} t={t} />)}
              {items.length > limit && (
                <button type="button" className="cursor-pointer rounded-md px-1 py-1 text-left text-xs text-kumo-link hover:underline" aria-expanded={open} onClick={() => toggle(column)} data-column-fold={column}>
                  {open ? t('column.fold') : t('column.more', { count: items.length - limit })}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function BoardState({ title, description, command, loading = false }: { readonly title: string; readonly description: string; readonly command?: string; readonly loading?: boolean }) {
  return <Empty size="sm" icon={loading ? <Loader size={24} /> : <CircleDashedIcon size={32} />} title={title} description={description} commandLine={command} />;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export function Board({ view, runtime, filters, onFilters, itemId, onOpenItem, onCloseItem, now, t }: {
  readonly view: DevActivityView;
  readonly runtime: RuntimeView;
  readonly filters: BoardFilters;
  readonly onFilters: (next: BoardFilters) => void;
  readonly itemId: string | null;
  readonly onOpenItem: (id: string) => void;
  readonly onCloseItem: () => void;
  readonly now: number;
  readonly t: OperatorTranslate;
}) {
  const snapshot = view.kind === 'ready' ? view.snapshot : null;
  const searchRef = useRef<HTMLInputElement>(null);
  const [mobileColumn, setMobileColumn] = useState<DevActivityColumn>('building');
  const visible = useMemo(() => snapshot ? filterItems(snapshot, filters) : [], [snapshot, filters]);
  const columns = useMemo(() => new Map(DEV_ACTIVITY_COLUMNS.map(column => [column, orderColumn(column, visible.filter(item => item.column === column))])), [visible]);
  const order = useMemo(() => DEV_ACTIVITY_COLUMNS.flatMap(column => columns.get(column) ?? []), [columns]);
  const selected = snapshot && itemId !== null ? snapshot.items.find(item => item.id === itemId) ?? null : null;

  const keys = useRef({ order, itemId, onOpenItem, pendingG: 0 });
  keys.current = { ...keys.current, order, itemId, onOpenItem };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const current = keys.current;
      if (event.key === '/' && current.itemId === null) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === 'g') { current.pendingG = Date.now(); return; }
      if (event.key === 'n' && Date.now() - current.pendingG < 1000) {
        current.pendingG = 0;
        if (current.itemId !== null) return;
        const target = document.getElementById('needs-you');
        target?.scrollIntoView?.({ block: 'start' });
        target?.focus();
        return;
      }
      if (event.key !== 'j' && event.key !== 'k') return;
      if (current.order.length === 0) return;
      const step = event.key === 'j' ? 1 : -1;
      if (current.itemId !== null) {
        const index = current.order.findIndex(item => item.id === current.itemId);
        const next = current.order[Math.min(current.order.length - 1, Math.max(0, index + step))];
        if (next && next.id !== current.itemId) current.onOpenItem(next.id);
        return;
      }
      const focusedId = document.activeElement instanceof HTMLElement ? document.activeElement.closest('[data-item-id]')?.getAttribute('data-item-id') ?? null : null;
      const index = focusedId === null ? -1 : current.order.findIndex(item => item.id === focusedId);
      const next = current.order[index === -1 ? (step === 1 ? 0 : current.order.length - 1) : Math.min(current.order.length - 1, Math.max(0, index + step))];
      if (!next) return;
      event.preventDefault();
      const card = Array.from(document.querySelectorAll<HTMLElement>('[data-item-id]')).find(element => element.getAttribute('data-item-id') === next.id);
      card?.querySelector<HTMLElement>('[data-card-open]')?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  if (view.kind === 'loading') return <BoardState loading title={t('board.loading.title')} description={t('board.loading.body')} />;
  if (view.kind === 'unreachable') return <BoardState title={t('board.unreachable.title')} description={t('board.unreachable.body')} command="repo-harness operator serve" />;
  const ready = view.snapshot;
  return (
    <div className="flex flex-col gap-5">
      {view.refreshFailed && (
        <Banner variant="alert" icon={<WarningIcon />} title={t('board.refreshFailed.title')}
          description={ready.collected_at ? t('board.refreshFailed.body', { age: ageWords(ready.collected_at, now, t) }) : t('board.refreshFailed.bodyUnknown')} />
      )}
      {ready.status === 'unavailable' ? (
        <BoardState title={t('board.unavailable.title')} description={t('board.unavailable.body')} command="repo-harness operator serve" />
      ) : <>
        {ready.status === 'partial' && <Banner variant="secondary" icon={<WarningIcon />} title={t('board.partial.title')} description={t('board.partial.body')} />}
        <AttentionQueue snapshot={ready} now={now} onOpen={onOpenItem} t={t} />
        <AgentRoster runtime={runtime} now={now} t={t} />
        <BoardToolbar filters={filters} onFilters={onFilters} searchRef={searchRef} t={t} />
        {ready.repositories.length === 0
          ? <BoardState title={t('board.noRepositories.title')} description={t('board.noRepositories.body')} command="repo-harness adopt --help" />
          : ready.items.length === 0
            ? <BoardState title={t('board.empty.title')} description={t('board.empty.body')} command="gh pr status" />
            : <BoardColumns columns={columns} snapshot={ready} now={now} selectedId={itemId} mobileColumn={mobileColumn} onMobileColumn={setMobileColumn} onOpen={onOpenItem} t={t} />}
      </>}
      {itemId !== null && (
        <ItemDrawer item={selected} snapshot={ready} itemId={itemId} now={now} onClose={onCloseItem} t={t} />
      )}
    </div>
  );
}
