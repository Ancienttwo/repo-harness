import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Icon } from './icons';
import {
  allCards,
  attentionCards,
  cardsForColumn,
  formatObservedAt,
  OPERATOR_COLUMNS,
  projectSnapshotViewState,
  snapshotViewKind,
  type OperatorApiErrorV1,
  type OperatorFleetCardV1,
  type OperatorFleetColumn,
  type OperatorFleetSnapshotV1,
  type OperatorSnapshotViewState,
} from './types';
import './styles.css';

export interface OperatorAppProps {
  /** A deterministic state injection used by browser fixtures and SSR checks. */
  readonly initialState?: OperatorSnapshotViewState;
  /** A deterministic initial response; production uses the same-origin API. */
  readonly initialSnapshot?: OperatorFleetSnapshotV1;
  readonly fetchSnapshot?: () => Promise<OperatorFleetSnapshotV1>;
}

const DEFAULT_API_ERROR: OperatorApiErrorV1 = {
  code: 'operator_api_unavailable',
  message: 'Fleet snapshot unavailable',
  next_action: 'Run `repo-harness fleet board --json` for diagnostics, then retry.',
};

function asApiError(value: unknown, fallback = DEFAULT_API_ERROR): OperatorApiErrorV1 {
  if (!value || typeof value !== 'object') return fallback;
  const envelope = value as { error?: Partial<OperatorApiErrorV1> };
  if (!envelope.error || typeof envelope.error !== 'object') return fallback;
  return {
    code: typeof envelope.error.code === 'string' ? envelope.error.code : fallback.code,
    message: typeof envelope.error.message === 'string' ? envelope.error.message : fallback.message,
    next_action: typeof envelope.error.next_action === 'string' ? envelope.error.next_action : fallback.next_action,
  };
}

function isOperatorSnapshot(value: unknown): value is OperatorFleetSnapshotV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.protocol !== 1 || candidate.kind !== 'operator_fleet_snapshot') return false;
  if (typeof candidate.registry_revision !== 'string' || typeof candidate.observed_at !== 'string') return false;
  if (!Number.isSafeInteger(candidate.sequence) || Number(candidate.sequence) < 1) return false;
  if (!['stable', 'changed_during_read', 'degraded'].includes(String(candidate.snapshot_consistency))) return false;
  if (!Array.isArray(candidate.repositories) || !candidate.counts || typeof candidate.counts !== 'object') return false;
  const counts = candidate.counts as Record<string, unknown>;
  return ['available', 'working', 'in_review', 'ready_to_merge', 'done', 'unreadable'].every((key) =>
    Number.isSafeInteger(counts[key]) && Number(counts[key]) >= 0,
  );
}

async function fetchOperatorSnapshot(): Promise<OperatorFleetSnapshotV1> {
  const response = await fetch('/api/v1/fleet/snapshot', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw asApiError(body);
  if (!isOperatorSnapshot(body)) {
    throw {
      code: 'operator_payload_invalid',
      message: 'Fleet snapshot response is invalid',
      next_action: 'Run `repo-harness fleet board --json` for diagnostics, then retry.',
    } satisfies OperatorApiErrorV1;
  }
  return body as OperatorFleetSnapshotV1;
}

function stateFromSnapshot(snapshot: OperatorFleetSnapshotV1): OperatorSnapshotViewState {
  return projectSnapshotViewState(snapshot);
}

function snapshotForState(state: OperatorSnapshotViewState): OperatorFleetSnapshotV1 | null {
  if (state.kind === 'loading') return state.previous;
  if (state.kind === 'fatal') return null;
  return state.snapshot;
}

function taskKey(card: OperatorFleetCardV1): string {
  return `${card.repository_id}:${card.task_id}:${card.task_revision}`;
}

function displayRepository(card: OperatorFleetCardV1): string {
  return card.repository_id || 'unknown repository';
}

function statusLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

function attentionLabel(owner: OperatorFleetCardV1['attention_owner']): string {
  return owner === 'none' ? 'No attention' : `${owner} attention`;
}

function attentionTone(owner: OperatorFleetCardV1['attention_owner']): string {
  return owner === 'user' ? 'tone-carrot' : owner === 'agent' ? 'tone-blue' : owner === 'external' ? 'tone-purple' : 'tone-neutral';
}

function IconBadge({ children, tone = 'neutral' }: { readonly children: ReactNode; readonly tone?: string }) {
  return <span className={`operator-badge ${tone}`}>{children}</span>;
}

export async function copyOperatorIdentifier(
  value: string,
  clipboard: Pick<Clipboard, 'writeText'> | null | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function CopyValue({ label, value }: { readonly label: string; readonly value: string | null }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => setStatus('idle'), [value]);
  const rendered = value ?? `No ${label.toLowerCase()} recorded`;
  return (
    <div className="copy-value">
      <code>{rendered}</code>
      {value && (
        <button
          className="copy-value__button"
          type="button"
          aria-label={`Copy ${label}`}
          onClick={() => void copyOperatorIdentifier(value).then((copied) => setStatus(copied ? 'copied' : 'failed'))}
        >
          <Icon name="copy" size={14} />
          <span>{status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy'}</span>
        </button>
      )}
      <span className="copy-value__status" role="status" aria-live="polite">
        {status === 'copied' ? `${label} copied` : status === 'failed' ? `${label} could not be copied` : ''}
      </span>
    </div>
  );
}

function StatusDot({ status }: { readonly status: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  return <span aria-hidden="true" className={`status-dot status-dot-${status}`} />;
}

function BrandMark() {
  return (
    <span aria-hidden="true" className="brand-mark">
      <span className="brand-mark__stem" />
      <span className="brand-mark__leaf brand-mark__leaf--one" />
      <span className="brand-mark__leaf brand-mark__leaf--two" />
    </span>
  );
}

function AppRail({ state, repositoryCount }: { readonly state: OperatorSnapshotViewState; readonly repositoryCount: number }) {
  const snapshot = snapshotForState(state);
  const consistency = snapshot?.snapshot_consistency ?? 'degraded';
  return (
    <aside className="operator-rail" aria-label="Operator navigation">
      <div className="operator-brand">
        <BrandMark />
        <span className="operator-brand__name">repo<span>-</span>harness</span>
      </div>
      <p className="operator-rail__eyebrow">human control board</p>
      <nav className="operator-nav" aria-label="Board sections">
        <a className="operator-nav__link is-active" href="#fleet-board">
          <Icon name="activity" size={17} />
          <span>Fleet board</span>
        </a>
        <a className="operator-nav__link" href="#attention-inbox">
          <Icon name="inbox" size={17} />
          <span>Attention inbox</span>
        </a>
        <a className="operator-nav__link" href="#repositories">
          <Icon name="repo" size={17} />
          <span>Repositories</span>
        </a>
      </nav>
      <div className="operator-rail__bottom">
        <div className="operator-rail__status">
          <StatusDot status={consistency === 'stable' ? 'ok' : consistency === 'degraded' ? 'danger' : 'warn'} />
          <div>
            <span className="operator-rail__status-label">observation</span>
            <strong>{statusLabel(consistency)}</strong>
          </div>
        </div>
        <div className="operator-rail__meta">
          <span>{repositoryCount} repositories</span>
          <span>localhost only</span>
        </div>
      </div>
    </aside>
  );
}

function Topbar({
  state,
  busy,
  onRefresh,
}: {
  readonly state: OperatorSnapshotViewState;
  readonly busy: boolean;
  readonly onRefresh: () => void;
}) {
  const snapshot = snapshotForState(state);
  return (
    <header className="operator-topbar">
      <div>
        <p className="operator-eyebrow">fleet / read-only</p>
        <h1>Control board</h1>
      </div>
      <div className="operator-topbar__actions">
        <span className="operator-topbar__source">
          <StatusDot status={busy ? 'warn' : snapshot ? 'ok' : 'danger'} />
          {busy ? 'collecting snapshot' : snapshot ? 'snapshot connected' : 'snapshot unavailable'}
        </span>
        <button className="operator-button operator-button--secondary" type="button" onClick={onRefresh} disabled={busy}>
          <Icon name="refresh" size={16} />
          <span>{busy ? 'Refreshing' : 'Refresh'}</span>
        </button>
      </div>
    </header>
  );
}

function SnapshotNotice({ state, onRetry }: { readonly state: OperatorSnapshotViewState; readonly onRetry: () => void }) {
  if (state.kind === 'loading' && state.previous === null) {
    return (
      <div className="operator-notice operator-notice--loading" role="status" aria-live="polite">
        <span className="operator-progress" aria-hidden="true" />
        <div><strong>Reading Fleet authority</strong><span>Collecting one bounded snapshot from adopted repositories.</span></div>
      </div>
    );
  }
  if (state.kind === 'fatal') {
    return (
      <div className="operator-notice operator-notice--danger" role="alert">
        <Icon name="alert" size={19} />
        <div><strong>{state.error.message}</strong><span>{state.error.next_action}</span></div>
        <button className="operator-button operator-button--primary" type="button" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (state.kind === 'stale') {
    return (
      <div className="operator-notice operator-notice--danger" role="alert">
        <Icon name="alert" size={19} />
        <div><strong>Showing the last successful snapshot</strong><span>{state.error.message}. {state.error.next_action}</span></div>
        <button className="operator-button operator-button--primary" type="button" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (state.kind === 'changed-during-read') {
    return (
      <div className="operator-notice operator-notice--warning" role="status" aria-live="polite">
        <Icon name="alert" size={19} />
        <div><strong>Snapshot changed during read</strong><span>Some task facts moved while Fleet authority was observed. Review the source before acting.</span></div>
      </div>
    );
  }
  if (state.kind === 'repo-degraded') {
    return (
      <div className="operator-notice operator-notice--warning" role="status" aria-live="polite">
        <Icon name="alert" size={19} />
        <div><strong>One or more repositories are degraded</strong><span>Fleet remains readable; the affected repository row carries its typed recovery message.</span></div>
      </div>
    );
  }
  return null;
}

function SummaryStrip({ snapshot }: { readonly snapshot: OperatorFleetSnapshotV1 }) {
  const summary = [
    { label: 'Available', value: snapshot.counts.available, tone: 'summary-card--carrot' },
    { label: 'Working', value: snapshot.counts.working, tone: 'summary-card--blue' },
    { label: 'In review', value: snapshot.counts.in_review, tone: 'summary-card--purple' },
    { label: 'Ready to merge', value: snapshot.counts.ready_to_merge, tone: 'summary-card--green' },
    { label: 'Unreadable repos', value: snapshot.counts.unreadable, tone: snapshot.counts.unreadable ? 'summary-card--red' : 'summary-card--neutral' },
  ] as const;
  return (
    <section className="summary-strip" aria-labelledby="summary-heading">
      <div className="section-heading section-heading--compact">
        <div><p className="operator-eyebrow">at a glance</p><h2 id="summary-heading">Fleet summary</h2></div>
        <span className="summary-strip__sequence">seq <strong>{snapshot.sequence}</strong> · {formatObservedAt(snapshot.observed_at)}</span>
      </div>
      <div className="summary-grid">
        {summary.map((item) => (
          <div className={`summary-card ${item.tone}`} key={item.label}>
            <span>{item.label}</span><strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function AttentionInbox({ snapshot, onSelect }: { readonly snapshot: OperatorFleetSnapshotV1; readonly onSelect: (card: OperatorFleetCardV1) => void }) {
  const cards = attentionCards(snapshot);
  return (
    <section id="attention-inbox" className="attention-section" aria-labelledby="attention-heading">
      <div className="section-heading">
        <div><p className="operator-eyebrow">needs a human look</p><h2 id="attention-heading">Attention Inbox</h2></div>
        <span className="section-heading__count">{cards.length} {cards.length === 1 ? 'item' : 'items'}</span>
      </div>
      {cards.length === 0 ? (
        <div className="empty-inline"><Icon name="check" size={17} /><span>No attention items in this snapshot.</span></div>
      ) : (
        <div className="attention-list">
          {cards.map((card) => (
            <button className="attention-item" type="button" key={taskKey(card)} onClick={() => onSelect(card)}>
              <span className={`attention-item__icon ${attentionTone(card.attention_owner)}`}><Icon name="inbox" size={16} /></span>
              <span className="attention-item__body">
                <strong>{card.task_id}</strong>
                <span>{displayRepository(card)} · {attentionLabel(card.attention_owner)}</span>
              </span>
              <Icon name="arrow" size={16} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function TaskCard({ card, onSelect }: { readonly card: OperatorFleetCardV1; readonly onSelect: (card: OperatorFleetCardV1) => void }) {
  const degraded = card.snapshot_consistency === 'changed_during_read';
  return (
    <button className="task-card" type="button" onClick={() => onSelect(card)}>
      <span className="task-card__topline">
        <span className="task-card__repository"><Icon name="repo" size={14} />{displayRepository(card)}</span>
        {card.attention_owner !== 'none' && <StatusDot status={card.attention_owner === 'user' ? 'warn' : 'danger'} />}
      </span>
      <strong className="task-card__id">{card.task_id}</strong>
      <span className="task-card__revision">{card.task_revision}</span>
      <span className="task-card__bottomline">
        <IconBadge tone={degraded ? 'tone-amber' : card.merge_readiness?.ready ? 'tone-green' : 'tone-neutral'}>
          {degraded ? 'changed during read' : card.column ? statusLabel(card.column) : 'unclassified'}
        </IconBadge>
        {card.feedback.pending_count > 0 && <span className="task-card__signal">{card.feedback.pending_count} feedback</span>}
        {card.inbox.unread_count > 0 && <span className="task-card__signal">{card.inbox.unread_count} unread</span>}
      </span>
    </button>
  );
}

function BoardColumn({
  column,
  cards,
  active,
  onActivate,
  onSelect,
}: {
  readonly column: { readonly id: OperatorFleetColumn; readonly label: string };
  readonly cards: readonly OperatorFleetCardV1[];
  readonly active: boolean;
  readonly onActivate: () => void;
  readonly onSelect: (card: OperatorFleetCardV1) => void;
}) {
  return (
    <section className={`board-column ${active ? 'is-active' : ''}`} aria-labelledby={`column-${column.id}`}>
      <button className="board-column__header" type="button" onClick={onActivate} aria-expanded={active}>
        <span><span className="board-column__index">{String(OPERATOR_COLUMNS.findIndex((item) => item.id === column.id) + 1).padStart(2, '0')}</span><strong id={`column-${column.id}`}>{column.label}</strong></span>
        <span className="board-column__count">{cards.length}</span>
      </button>
      <div className="board-column__cards">
        {cards.length === 0 ? (
          <div className="column-empty"><span>—</span><small>No tasks in this column</small></div>
        ) : cards.map((card) => <TaskCard key={taskKey(card)} card={card} onSelect={onSelect} />)}
      </div>
    </section>
  );
}

function FleetBoard({ snapshot, onSelect }: { readonly snapshot: OperatorFleetSnapshotV1; readonly onSelect: (card: OperatorFleetCardV1) => void }) {
  const [activeColumn, setActiveColumn] = useState<OperatorFleetColumn>('available');
  const unclassified = allCards(snapshot).filter((card) => card.column === null);
  return (
    <section id="fleet-board" className="board-section" aria-labelledby="board-heading">
      <div className="section-heading">
        <div><p className="operator-eyebrow">authoritative order</p><h2 id="board-heading">Fleet board</h2></div>
        <span className="section-heading__count">5 columns</span>
      </div>
      <div className="column-switcher" aria-label="Fleet column selector">
        {OPERATOR_COLUMNS.map((column) => {
          const count = cardsForColumn(snapshot, column.id).length;
          return <button key={column.id} type="button" aria-pressed={activeColumn === column.id} className={activeColumn === column.id ? 'is-active' : ''} onClick={() => setActiveColumn(column.id)}>{column.label}<span>{count}</span></button>;
        })}
      </div>
      <div className="board-columns">
        {OPERATOR_COLUMNS.map((column) => <BoardColumn key={column.id} column={column} cards={cardsForColumn(snapshot, column.id)} active={activeColumn === column.id} onActivate={() => setActiveColumn(column.id)} onSelect={onSelect} />)}
      </div>
      {unclassified.length > 0 && (
        <div className="unclassified-band" role="status">
          <Icon name="alert" size={16} />
          <span><strong>{unclassified.length} task{unclassified.length === 1 ? '' : 's'} not classified</strong> · Fleet did not assign a sound column; no client-side classification was applied.</span>
        </div>
      )}
    </section>
  );
}

function RepositoryList({ snapshot }: { readonly snapshot: OperatorFleetSnapshotV1 }) {
  return (
    <section id="repositories" className="repositories-section" aria-labelledby="repositories-heading">
      <div className="section-heading">
        <div><p className="operator-eyebrow">source health</p><h2 id="repositories-heading">Repositories</h2></div>
        <span className="section-heading__count">{snapshot.repositories.length} adopted</span>
      </div>
      <div className="repository-list">
        {snapshot.repositories.map((repository) => {
          const repoStatus = repository.status === 'unreadable' ? 'danger' : repository.snapshot_consistency === 'stable' ? 'ok' : 'warn';
          return (
            <article className={`repository-row repository-row--${repoStatus}`} key={repository.repository_id}>
              <span className="repository-row__mark"><Icon name="repo" size={17} /></span>
              <div className="repository-row__main"><strong>{repository.repository_id}</strong><span>{repository.access_mode.replace('_', ' ')} · {repository.cards.length} tasks</span></div>
              <span className="repository-row__state"><StatusDot status={repoStatus} />{repository.status === 'unreadable' ? 'unreadable' : statusLabel(repository.snapshot_consistency)}</span>
              {repository.error && <span className="repository-row__error">{repository.error.message}</span>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TaskDrawer({ card, onClose }: { readonly card: OperatorFleetCardV1 | null; readonly onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const cardKey = card ? taskKey(card) : null;

  useEffect(() => {
    if (!cardKey || typeof document === 'undefined') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
    // The task identity, not incidental card object replacement, owns one modal lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);

  if (!card) return null;
  return (
    <>
      <button className="drawer-scrim" type="button" tabIndex={-1} aria-label="Close task details" onClick={onClose} />
      <aside ref={dialogRef} className="task-drawer" role="dialog" aria-modal="true" aria-labelledby="task-drawer-title">
        <div className="task-drawer__header">
          <div><p className="operator-eyebrow">task detail</p><h2 id="task-drawer-title">{card.task_id}</h2></div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="Close task details"><Icon name="close" size={19} /></button>
        </div>
        <div className="task-drawer__body">
          <div className="drawer-status"><IconBadge tone={attentionTone(card.attention_owner)}>{attentionLabel(card.attention_owner)}</IconBadge><IconBadge tone="tone-neutral">{card.column ? statusLabel(card.column) : 'unclassified'}</IconBadge></div>
          <div className="drawer-block"><p className="operator-eyebrow">task identifier</p><CopyValue label="Task identifier" value={card.task_id} /></div>
          <dl className="detail-list">
            <div><dt>repository</dt><dd>{displayRepository(card)}</dd></div>
            <div><dt>revision</dt><dd className="mono-value">{card.task_revision}</dd></div>
            <div><dt>claim</dt><dd className="mono-value">{card.claim_id ?? 'not claimed'}</dd></div>
            <div><dt>generation</dt><dd className="mono-value">{card.generation ?? '—'}</dd></div>
            <div><dt>lease</dt><dd>{statusLabel(card.lease_state)}</dd></div>
            <div><dt>execution</dt><dd>{card.execution_readiness ? statusLabel(card.execution_readiness) : 'not applicable'}</dd></div>
          </dl>
          <div className="drawer-block"><p className="operator-eyebrow">publication</p><CopyValue label="Publication identifier" value={card.publication_id} /><CopyValue label="Head SHA" value={card.head_sha} /></div>
          <div className="drawer-block"><p className="operator-eyebrow">signals</p><div className="signal-grid"><span><strong>{card.feedback.pending_count}</strong> feedback</span><span><strong>{card.inbox.unread_count}</strong> inbox</span><span><strong>{card.blocker_codes.length}</strong> blockers</span></div></div>
          {card.blocker_codes.length > 0 && <div className="drawer-callout drawer-callout--warning"><Icon name="alert" size={16} /><span>{card.blocker_codes.join(', ')}</span></div>}
          {card.snapshot_consistency === 'changed_during_read' && <div className="drawer-callout drawer-callout--warning"><Icon name="alert" size={16} /><span>This task changed while the snapshot was read. Re-observe before acting.</span></div>}
        </div>
        <div className="task-drawer__footer"><span>read-only surface</span><span className="mono-value">no mutations</span></div>
      </aside>
    </>
  );
}

function EmptyFleet() {
  return (
    <section className="empty-state" aria-labelledby="empty-heading">
      <span className="empty-state__mark"><Icon name="repo" size={23} /></span>
      <p className="operator-eyebrow">no adopted repositories</p>
      <h2 id="empty-heading">The Fleet is quiet.</h2>
      <p>Adopt a repository, then refresh this local board to observe its authoritative task state.</p>
      <code>repo-harness adopt --help</code>
    </section>
  );
}

function LoadingState() {
  return (
    <section className="loading-board" aria-label="Loading Fleet board">
      <div className="loading-board__line loading-board__line--wide" />
      <div className="loading-board__grid">{Array.from({ length: 5 }, (_, index) => <div className="loading-board__column" key={index}><span /><span /><span /></div>)}</div>
    </section>
  );
}

export function OperatorApp({ initialState, initialSnapshot, fetchSnapshot = fetchOperatorSnapshot }: OperatorAppProps) {
  const initial = initialState ?? (initialSnapshot ? stateFromSnapshot(initialSnapshot) : { kind: 'loading', previous: null } as const);
  const [state, setState] = useState<OperatorSnapshotViewState>(initial);
  const [selectedTask, setSelectedTask] = useState<OperatorFleetCardV1 | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const refreshInFlight = useRef(false);
  const snapshot = snapshotForState(state);
  const busy = state.kind === 'loading';
  const repositoryCount = snapshot?.repositories.length ?? 0;
  const stateKind = state.kind;

  const refresh = async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const previous = snapshotForState(state);
    setState({ kind: 'loading', previous });
    try {
      setState(stateFromSnapshot(await fetchSnapshot()));
    } catch (error) {
      const apiError = asApiError(error);
      setState(previous ? { kind: 'stale', snapshot: previous, error: apiError } : { kind: 'fatal', error: apiError });
    } finally {
      refreshInFlight.current = false;
    }
  };

  useEffect(() => {
    if (initialState || initialSnapshot) return;
    void refresh();
    // The initial browser read is intentionally one-shot. Explicit refresh
    // owns subsequent collection and single-flight behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedKey = selectedTask ? taskKey(selectedTask) : null;
  const visibleSelectedTask = useMemo(() => {
    if (!selectedKey || !snapshot) return null;
    return allCards(snapshot).find((card) => taskKey(card) === selectedKey) ?? selectedTask;
  }, [selectedKey, selectedTask, snapshot]);

  return (
    <div className={`operator-app ${mobileMenuOpen ? 'mobile-menu-open' : ''}`} data-state={stateKind}>
      <AppRail state={state} repositoryCount={repositoryCount} />
      <div className="operator-workspace">
        <Topbar state={state} busy={busy} onRefresh={() => void refresh()} />
        <button className="mobile-menu-button icon-button" type="button" aria-label="Toggle navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}><Icon name={mobileMenuOpen ? 'close' : 'menu'} size={19} /></button>
        <main className="operator-content">
          <SnapshotNotice state={state} onRetry={() => void refresh()} />
          {state.kind === 'loading' && state.previous === null ? <LoadingState /> : state.kind === 'fatal' ? <EmptyFatalState error={state.error} onRetry={() => void refresh()} /> : snapshot ? (
            snapshotViewKind(snapshot) === 'empty' ? <EmptyFleet /> : (
              <>
                <SummaryStrip snapshot={snapshot} />
                <AttentionInbox snapshot={snapshot} onSelect={setSelectedTask} />
                <FleetBoard snapshot={snapshot} onSelect={setSelectedTask} />
                <RepositoryList snapshot={snapshot} />
              </>
            )
          ) : null}
        </main>
        <footer className="operator-footer"><span>repo-harness operator</span><span>protocol 1 · sequence {snapshot?.sequence ?? '—'}</span><span className="operator-footer__right">read-only / localhost</span></footer>
      </div>
      <TaskDrawer card={visibleSelectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  );
}

function EmptyFatalState({ error, onRetry }: { readonly error: OperatorApiErrorV1; readonly onRetry: () => void }) {
  return (
    <section className="fatal-state" aria-labelledby="fatal-heading">
      <span className="fatal-state__mark"><Icon name="alert" size={24} /></span>
      <p className="operator-eyebrow">authority boundary</p>
      <h2 id="fatal-heading">Fleet snapshot unavailable</h2>
      <p>{error.message}</p>
      <code>{error.next_action}</code>
      <button className="operator-button operator-button--primary" type="button" onClick={onRetry}>Retry observation</button>
    </section>
  );
}

export { fetchOperatorSnapshot };
