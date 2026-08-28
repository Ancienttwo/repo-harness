import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Icon } from './icons';
import {
  DEFAULT_OPERATOR_LOCALE,
  formatRelativeAge,
  useLocale,
  type OperatorLocale,
  type OperatorMessageKey,
  type OperatorTranslate,
} from './i18n';
import {
  allCards,
  decodeOperatorFleetSnapshot,
  OPERATOR_COLUMNS,
  OPERATOR_PAYLOAD_INVALID_ERROR,
  projectSnapshotViewState,
  snapshotViewKind,
  type OperatorApiErrorV1,
  type OperatorFleetCardV1,
  type OperatorFleetColumn,
  type OperatorFleetRepositoryV1,
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
  /** Tests pin the locale; the browser resolves it from storage or navigator. */
  readonly initialLocale?: OperatorLocale;
}

const DEFAULT_API_ERROR: OperatorApiErrorV1 = {
  code: 'operator_api_unavailable',
  message: 'Fleet snapshot unavailable',
  next_action: 'Run `repo-harness fleet board --json` for diagnostics, then retry.',
};

function isTypedApiError(value: unknown): value is OperatorApiErrorV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OperatorApiErrorV1>;
  return typeof candidate.code === 'string' && candidate.code.trim().length > 0
    && typeof candidate.message === 'string' && candidate.message.trim().length > 0
    && typeof candidate.next_action === 'string' && candidate.next_action.trim().length > 0;
}

/** Accept only the two typed transport forms. Unknown values use the safe default. */
export function asApiError(value: unknown, fallback = DEFAULT_API_ERROR): OperatorApiErrorV1 {
  if (isTypedApiError(value)) return value;
  if (value && typeof value === 'object') {
    const envelope = value as { readonly error?: unknown };
    if (isTypedApiError(envelope.error)) return envelope.error;
  }
  return fallback;
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
  try {
    return decodeOperatorFleetSnapshot(body);
  } catch (error) {
    if (error instanceof Error && error.name === 'OperatorPayloadError') throw error;
    throw OPERATOR_PAYLOAD_INVALID_ERROR;
  }
}

function stateFromSnapshot(snapshot: OperatorFleetSnapshotV1): OperatorSnapshotViewState {
  return projectSnapshotViewState(snapshot);
}

function snapshotForState(state: OperatorSnapshotViewState): OperatorFleetSnapshotV1 | null {
  if (state.kind === 'loading') return state.previous;
  if (state.kind === 'fatal') return null;
  return state.snapshot;
}

/**
 * Selection identity deliberately excludes `task_revision`: a refresh that only
 * re-writes the task definition must keep the pane open and say so, not drop
 * the operator's place on the board.
 */
export function taskKey(card: OperatorFleetCardV1): string {
  return `${card.repository_id}:${card.task_id}`;
}

/** The human label is authority; the id prefix is the fallback, never a guess. */
export function taskDisplayLabel(card: OperatorFleetCardV1): { readonly text: string; readonly isLabel: boolean } {
  if (card.task_label) return { text: card.task_label, isLabel: true };
  return { text: card.task_id.slice(0, 12), isLabel: false };
}

type MergeBlocker = NonNullable<OperatorFleetCardV1['merge_readiness']>['blockers'][number];
type BlockerOwner = MergeBlocker['attention_owner'];

function cardBlockers(card: OperatorFleetCardV1): readonly MergeBlocker[] {
  return card.merge_readiness?.blockers ?? [];
}

export type WorklistCause =
  | { readonly kind: 'blocker'; readonly blocker: MergeBlocker }
  | { readonly kind: 'no_progress' }
  | { readonly kind: 'unread'; readonly count: number };

/**
 * One row shows one reason. The order is the operator's routing order: a
 * blocker you own outranks a stalled agent, which outranks a wait on someone
 * else, which outranks an unread message.
 */
export function primaryCause(card: OperatorFleetCardV1): WorklistCause | null {
  const blockers = cardBlockers(card);
  const owned = (owner: BlockerOwner) => blockers.find((blocker) => blocker.attention_owner === owner);
  const userBlocker = owned('user');
  if (userBlocker) return { kind: 'blocker', blocker: userBlocker };
  if (card.feedback.no_progress) return { kind: 'no_progress' };
  const externalBlocker = owned('external');
  if (externalBlocker) return { kind: 'blocker', blocker: externalBlocker };
  const agentBlocker = owned('agent');
  if (agentBlocker) return { kind: 'blocker', blocker: agentBlocker };
  if (card.inbox.unread_count > 0) return { kind: 'unread', count: card.inbox.unread_count };
  return null;
}

export type WorklistGroupId =
  | 'needs_you'
  | 'ready_to_merge'
  | 'unreadable'
  | 'unclassified'
  | 'agent_working'
  | 'external'
  | 'done';

export const WORKLIST_GROUP_ORDER: readonly WorklistGroupId[] = [
  'needs_you',
  'ready_to_merge',
  'unreadable',
  'unclassified',
  'agent_working',
  'external',
  'done',
];

const DEFAULT_COLLAPSED_GROUPS: readonly WorklistGroupId[] = ['agent_working', 'external', 'done'];

/**
 * Assignment order is not the display order. `unclassified` is claimed before
 * `external` so a card Fleet could not classify can never land in a group the
 * board collapses by default.
 */
function groupForCard(card: OperatorFleetCardV1): Exclude<WorklistGroupId, 'unreadable'> {
  if (card.attention_owner === 'user') return 'needs_you';
  if (card.column === null) return 'unclassified';
  if (card.column === 'ready_to_merge') return 'ready_to_merge';
  if (card.attention_owner === 'external') return 'external';
  if (card.column === 'done') return 'done';
  return 'agent_working';
}

function compareCards(left: OperatorFleetCardV1, right: OperatorFleetCardV1): number {
  if (left.repository_id !== right.repository_id) return left.repository_id < right.repository_id ? -1 : 1;
  const leftIndex = left.task_index ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = right.task_index ?? Number.MAX_SAFE_INTEGER;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return left.task_id < right.task_id ? -1 : left.task_id > right.task_id ? 1 : 0;
}

export interface WorklistGroup {
  readonly id: WorklistGroupId;
  readonly cards: readonly OperatorFleetCardV1[];
  readonly repositories: readonly OperatorFleetRepositoryV1[];
  readonly count: number;
}

export function groupWorklist(snapshot: OperatorFleetSnapshotV1): readonly WorklistGroup[] {
  const buckets = new Map<WorklistGroupId, OperatorFleetCardV1[]>(
    WORKLIST_GROUP_ORDER.map((id) => [id, []]),
  );
  for (const card of allCards(snapshot)) {
    buckets.get(groupForCard(card))?.push(card);
  }
  const unreadable = snapshot.repositories.filter((repository) => repository.status === 'unreadable');
  return WORKLIST_GROUP_ORDER.map((id) => {
    const cards = (buckets.get(id) ?? []).slice().sort(compareCards);
    const repositories = id === 'unreadable' ? unreadable : [];
    return { id, cards, repositories, count: cards.length + repositories.length };
  });
}

function stageKey(column: OperatorFleetColumn | null): OperatorMessageKey {
  return column === null ? 'stage.unclassified' : (`stage.${column}` as OperatorMessageKey);
}

function attentionKey(owner: OperatorFleetCardV1['attention_owner']): OperatorMessageKey {
  return `attention.${owner}` as OperatorMessageKey;
}

function blockerKey(code: MergeBlocker['code']): OperatorMessageKey {
  return `blocker.${code}` as OperatorMessageKey;
}

function attentionTone(owner: OperatorFleetCardV1['attention_owner']): string {
  return owner === 'user' ? 'tone-user' : owner === 'agent' ? 'tone-agent' : owner === 'external' ? 'tone-external' : 'tone-neutral';
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

function Badge({ children, tone = 'tone-neutral' }: { readonly children: ReactNode; readonly tone?: string }) {
  return <span className={`operator-badge ${tone}`}>{children}</span>;
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

function CopyValue({ label, value, t }: { readonly label: string; readonly value: string | null; readonly t: OperatorTranslate }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => setStatus('idle'), [value]);
  return (
    <div className="copy-value">
      <code>{value ?? t('copy.missing', { label })}</code>
      {value && (
        <button
          className="copy-value__button"
          type="button"
          aria-label={t('copy.action', { label })}
          onClick={() => void copyOperatorIdentifier(value).then((copied) => setStatus(copied ? 'copied' : 'failed'))}
        >
          <Icon name="copy" size={14} />
          <span>{status === 'copied' ? t('copy.copied') : status === 'failed' ? t('copy.failed') : t('copy.idle')}</span>
        </button>
      )}
      <span className="copy-value__status" role="status" aria-live="polite">
        {status === 'copied' ? t('copy.copiedStatus', { label }) : status === 'failed' ? t('copy.failedStatus', { label }) : ''}
      </span>
    </div>
  );
}

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function StatusBar({
  snapshot,
  stale,
  busy,
  locale,
  onLocale,
  onRefresh,
  t,
}: {
  readonly snapshot: OperatorFleetSnapshotV1 | null;
  readonly stale: boolean;
  readonly busy: boolean;
  readonly locale: OperatorLocale;
  readonly onLocale: (locale: OperatorLocale) => void;
  readonly onRefresh: () => void;
  readonly t: OperatorTranslate;
}) {
  const now = useNow();
  const consistency = snapshot?.snapshot_consistency ?? 'degraded';
  const unreadable = snapshot?.counts.unreadable ?? 0;
  return (
    <header className="operator-statusbar">
      <div className="operator-statusbar__brand">
        <BrandMark />
        <span className="operator-statusbar__name">repo<span>-</span>harness</span>
        <span className="operator-statusbar__subtitle">{t('app.subtitle')}</span>
      </div>
      <div className="operator-statusbar__facts">
        <span className={`statusbar-fact statusbar-fact--age${stale ? ' is-stale' : ''}`} data-fact="age">
          {snapshot ? formatRelativeAge(snapshot.observed_at, now, t) : t('status.observedUnknown')}
          {stale ? ` · ${t('status.stale')}` : ''}
        </span>
        <span className="statusbar-fact" data-fact="sequence">
          {t('status.sequence')} <strong>{snapshot?.sequence ?? '—'}</strong>
        </span>
        <span className="statusbar-fact" data-fact="consistency">
          <StatusDot status={consistency === 'stable' ? 'ok' : consistency === 'degraded' ? 'danger' : 'warn'} />
          {t('status.consistency')} <strong>{t(`status.consistency.${consistency}` as OperatorMessageKey)}</strong>
        </span>
        <span className="statusbar-fact" data-fact="repositories">
          {t('status.repositories', { count: snapshot?.repositories.length ?? 0 })}
          {unreadable > 0 ? ` · ${t('status.unreadable', { count: unreadable })}` : ''}
        </span>
      </div>
      <div className="operator-statusbar__actions">
        <button className="operator-button operator-button--secondary" type="button" onClick={onRefresh} disabled={busy}>
          <Icon name="refresh" size={15} />
          <span>{busy ? t('status.refreshing') : t('status.refresh')}</span>
        </button>
        <div className="locale-switch" role="group" aria-label={t('status.language')}>
          <button type="button" aria-pressed={locale === 'en'} className={locale === 'en' ? 'is-active' : ''} onClick={() => onLocale('en')}>
            {t('status.languageEnglish')}
          </button>
          <button type="button" aria-pressed={locale === 'zh'} className={locale === 'zh' ? 'is-active' : ''} onClick={() => onLocale('zh')}>
            {t('status.languageChinese')}
          </button>
        </div>
      </div>
    </header>
  );
}

function SnapshotNotice({
  state,
  onRetry,
  t,
}: {
  readonly state: OperatorSnapshotViewState;
  readonly onRetry: () => void;
  readonly t: OperatorTranslate;
}) {
  if (state.kind === 'loading' && state.previous === null) {
    return (
      <div className="operator-notice operator-notice--loading" role="status" aria-live="polite">
        <span className="operator-progress" aria-hidden="true" />
        <div><strong>{t('notice.loadingTitle')}</strong><span>{t('notice.loadingBody')}</span></div>
      </div>
    );
  }
  if (state.kind === 'stale') {
    return (
      <div className="operator-notice operator-notice--danger" role="alert">
        <Icon name="alert" size={18} />
        <div><strong>{t('notice.staleTitle')}</strong><span>{state.error.message}. {state.error.next_action}</span></div>
        <button className="operator-button operator-button--secondary" type="button" onClick={onRetry}>{t('notice.retry')}</button>
      </div>
    );
  }
  if (state.kind === 'changed-during-read') {
    return (
      <div className="operator-notice operator-notice--warning" role="status" aria-live="polite">
        <Icon name="alert" size={18} />
        <div><strong>{t('notice.changedTitle')}</strong><span>{t('notice.changedBody')}</span></div>
      </div>
    );
  }
  if (state.kind === 'repo-degraded') {
    return (
      <div className="operator-notice operator-notice--warning" role="status" aria-live="polite">
        <Icon name="alert" size={18} />
        <div><strong>{t('notice.degradedTitle')}</strong><span>{t('notice.degradedBody')}</span></div>
      </div>
    );
  }
  return null;
}

function CauseLine({ card, t }: { readonly card: OperatorFleetCardV1; readonly t: OperatorTranslate }) {
  const cause = primaryCause(card);
  if (!cause) {
    return <span className="worklist-row__cause worklist-row__cause--quiet">{t('row.noCause')}</span>;
  }
  if (cause.kind === 'blocker') {
    return (
      <span className={`worklist-row__cause ${attentionTone(cause.blocker.attention_owner)}`}>
        <Icon name="alert" size={13} />
        <span className="cause-owner">{t(attentionKey(cause.blocker.attention_owner))}</span>
        <span className="cause-text">{t(blockerKey(cause.blocker.code))}</span>
        <code className="cause-code">{cause.blocker.code}</code>
      </span>
    );
  }
  if (cause.kind === 'no_progress') {
    return (
      <span className="worklist-row__cause tone-agent">
        <Icon name="flag" size={13} />
        <span className="cause-text">{t('row.noProgress')}</span>
      </span>
    );
  }
  return (
    <span className="worklist-row__cause tone-neutral">
      <Icon name="inbox" size={13} />
      <span className="cause-text">{t('row.unread', { count: cause.count })}</span>
    </span>
  );
}

function WorklistRow({
  card,
  selected,
  onSelect,
  t,
}: {
  readonly card: OperatorFleetCardV1;
  readonly selected: boolean;
  readonly onSelect: (card: OperatorFleetCardV1) => void;
  readonly t: OperatorTranslate;
}) {
  const label = taskDisplayLabel(card);
  const changed = card.snapshot_consistency === 'changed_during_read';
  return (
    <button
      className={`worklist-row${selected ? ' is-selected' : ''}`}
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(card)}
    >
      <span className="worklist-row__head">
        <span className={`worklist-row__label${label.isLabel ? '' : ' worklist-row__label--id'}`}>{label.text}</span>
        {card.attention_owner !== 'none' && (
          <Badge tone={attentionTone(card.attention_owner)}>{t('attention.owned', { owner: t(attentionKey(card.attention_owner)) })}</Badge>
        )}
      </span>
      <span className="worklist-row__meta">
        <span className="worklist-row__repository"><Icon name="repo" size={13} />{card.repository_id}</span>
        <span className="worklist-row__stage">{t(stageKey(card.column))}</span>
        {changed && <span className="worklist-row__changed">{t('row.changedDuringRead')}</span>}
      </span>
      <CauseLine card={card} t={t} />
      <span className="worklist-row__signals">
        {card.feedback.pending_count > 0 && <span>{t('row.feedback', { count: card.feedback.pending_count })}</span>}
        {card.inbox.unread_count > 0 && <span>{t('row.unread', { count: card.inbox.unread_count })}</span>}
      </span>
    </button>
  );
}

function UnreadableRepositoryRow({ repository, t }: { readonly repository: OperatorFleetRepositoryV1; readonly t: OperatorTranslate }) {
  return (
    <div className="worklist-row worklist-row--repository" role="group" aria-label={repository.repository_id}>
      <span className="worklist-row__head">
        <span className="worklist-row__label">{repository.repository_id}</span>
        <Badge tone="tone-danger">{t('repo.status.unreadable')}</Badge>
      </span>
      {repository.error && (
        <span className="worklist-row__cause tone-danger">
          <Icon name="alert" size={13} />
          <span className="cause-text">{repository.error.message}</span>
          <code className="cause-code">{repository.error.code}</code>
        </span>
      )}
    </div>
  );
}

function Worklist({
  snapshot,
  selectedKey,
  onSelect,
  t,
}: {
  readonly snapshot: OperatorFleetSnapshotV1;
  readonly selectedKey: string | null;
  readonly onSelect: (card: OperatorFleetCardV1) => void;
  readonly t: OperatorTranslate;
}) {
  const groups = useMemo(() => groupWorklist(snapshot), [snapshot]);
  const [filter, setFilter] = useState<WorklistGroupId | 'all'>('all');
  const [collapsed, setCollapsed] = useState<readonly WorklistGroupId[]>(DEFAULT_COLLAPSED_GROUPS);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const visible = groups.filter((group) => filter === 'all' || group.id === filter);

  const toggle = (id: WorklistGroupId) =>
    setCollapsed((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  return (
    <section className="worklist" id="worklist" aria-labelledby="worklist-heading">
      <div className="worklist__header">
        <h2 id="worklist-heading">{t('worklist.title')}</h2>
      </div>
      <div className="worklist__filters" role="group" aria-label={t('worklist.filters')}>
        <button type="button" aria-pressed={filter === 'all'} className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>
          {t('worklist.filterAll')}<span>{total}</span>
        </button>
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            aria-pressed={filter === group.id}
            className={filter === group.id ? 'is-active' : ''}
            onClick={() => {
              setFilter(group.id);
              setCollapsed((current) => current.filter((entry) => entry !== group.id));
            }}
          >
            {t(`group.${group.id}` as OperatorMessageKey)}<span>{group.count}</span>
          </button>
        ))}
      </div>
      {total === 0 ? (
        <div className="empty-inline"><Icon name="check" size={16} /><span>{t('worklist.empty')}</span></div>
      ) : (
        <div className="worklist__groups">
          {visible.map((group) => {
            const groupLabel = t(`group.${group.id}` as OperatorMessageKey);
            const open = !collapsed.includes(group.id);
            return (
              <section className={`worklist-group worklist-group--${group.id}`} key={group.id} aria-labelledby={`group-${group.id}`}>
                <button
                  className="worklist-group__header"
                  type="button"
                  aria-expanded={open}
                  aria-label={open ? t('worklist.collapse', { group: groupLabel }) : t('worklist.expand', { group: groupLabel })}
                  onClick={() => toggle(group.id)}
                >
                  <Icon name="chevron" size={15} className={open ? 'is-open' : ''} />
                  <strong id={`group-${group.id}`}>{groupLabel}</strong>
                  <span className="worklist-group__count">{group.count}</span>
                </button>
                {open && (
                  <div className="worklist-group__rows">
                    {group.repositories.map((repository) => (
                      <UnreadableRepositoryRow key={repository.repository_id} repository={repository} t={t} />
                    ))}
                    {group.cards.map((card) => (
                      <WorklistRow
                        key={taskKey(card)}
                        card={card}
                        selected={taskKey(card) === selectedKey}
                        onSelect={onSelect}
                        t={t}
                      />
                    ))}
                    {group.count === 0 && <p className="worklist-group__empty">{t('worklist.groupEmpty')}</p>}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StageMatrix({ snapshot, t }: { readonly snapshot: OperatorFleetSnapshotV1; readonly t: OperatorTranslate }) {
  return (
    <div className="stage-matrix__scroll">
      <table className="stage-matrix">
        <caption className="detail-eyebrow">{t('detail.matrixTitle')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('detail.matrixRepository')}</th>
            {OPERATOR_COLUMNS.map((column) => <th scope="col" key={column.id}>{t(stageKey(column.id))}</th>)}
          </tr>
        </thead>
        <tbody>
          {snapshot.repositories.map((repository) => (
            <tr key={repository.repository_id}>
              <th scope="row">{repository.repository_id}</th>
              {OPERATOR_COLUMNS.map((column) => (
                <td key={column.id}>{repository.cards.filter((card) => card.column === column.id).length}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RepositoryHealth({ snapshot, t }: { readonly snapshot: OperatorFleetSnapshotV1; readonly t: OperatorTranslate }) {
  return (
    <div className="repository-list">
      {snapshot.repositories.map((repository) => {
        const repoStatus = repository.status === 'unreadable' ? 'danger' : repository.snapshot_consistency === 'stable' ? 'ok' : 'warn';
        return (
          <article className={`repository-row repository-row--${repoStatus}`} key={repository.repository_id}>
            <div className="repository-row__main">
              <strong>{repository.repository_id}</strong>
              <span>
                {t(`repo.accessMode.${repository.access_mode}` as OperatorMessageKey)} · {t('repo.tasks', { count: repository.cards.length })}
              </span>
            </div>
            <span className="repository-row__state">
              <StatusDot status={repoStatus} />
              {repository.status === 'unreadable'
                ? t('repo.status.unreadable')
                : t(`status.consistency.${repository.snapshot_consistency}` as OperatorMessageKey)}
            </span>
            {repository.error && <span className="repository-row__error">{repository.error.message}</span>}
          </article>
        );
      })}
    </div>
  );
}

function TaskCauses({ card, t }: { readonly card: OperatorFleetCardV1; readonly t: OperatorTranslate }) {
  const blockers = cardBlockers(card);
  const quiet = blockers.length === 0 && !card.feedback.no_progress && card.inbox.unread_count === 0;
  return (
    <section className="detail-block" aria-labelledby="detail-cause-heading">
      <h3 className="detail-eyebrow" id="detail-cause-heading">{t('detail.cause')}</h3>
      {quiet && <p className="detail-quiet">{t('detail.causeEmpty')}</p>}
      {blockers.length > 0 && (
        <ul className="cause-list">
          {blockers.map((blocker) => (
            <li className={`cause-item ${attentionTone(blocker.attention_owner)}`} key={blocker.code}>
              <span className="cause-text">{t(blockerKey(blocker.code))}</span>
              <span className="cause-owner">{t('detail.blockerOwner', { owner: t(attentionKey(blocker.attention_owner)) })}</span>
              <code className="cause-code">{blocker.code}</code>
            </li>
          ))}
        </ul>
      )}
      {card.feedback.no_progress && (
        <div className="detail-callout detail-callout--warning">
          <Icon name="flag" size={15} />
          <div>
            <strong>{t('detail.noProgressTitle')}</strong>
            <span>{t('detail.noProgressBody')}</span>
            {card.feedback.repair_actions.length > 0 && (
              <>
                <span className="detail-repair-title">{t('detail.repairTitle')}</span>
                <ul className="repair-list">
                  {card.feedback.repair_actions.map((action) => (
                    <li key={action}>
                      {t(`repair.${action}` as OperatorMessageKey)} <code className="cause-code">{action}</code>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
      {card.inbox.unread_count > 0 && (
        <div className="detail-callout">
          <Icon name="inbox" size={15} />
          <div><strong>{t('row.unread', { count: card.inbox.unread_count })}</strong></div>
        </div>
      )}
    </section>
  );
}

function TaskDetail({
  card,
  revisionChangedFrom,
  t,
}: {
  readonly card: OperatorFleetCardV1;
  readonly revisionChangedFrom: string | null;
  readonly t: OperatorTranslate;
}) {
  const label = taskDisplayLabel(card);
  return (
    <>
      {revisionChangedFrom && (
        <div className="detail-callout detail-callout--warning" role="status">
          <Icon name="alert" size={15} />
          <div>
            <strong>{t('detail.revisionChanged')}</strong>
            <span>{t('detail.revisionChangedBody', { previous: revisionChangedFrom, current: card.task_revision })}</span>
          </div>
        </div>
      )}
      <div className="detail-chips">
        <Badge tone={attentionTone(card.attention_owner)}>
          {card.attention_owner === 'none'
            ? t('attention.none')
            : t('attention.owned', { owner: t(attentionKey(card.attention_owner)) })}
        </Badge>
        <Badge>{t(stageKey(card.column))}</Badge>
        <Badge>{card.repository_id}</Badge>
      </div>
      <TaskCauses card={card} t={t} />
      <section className="detail-block" aria-labelledby="detail-identity-heading">
        <h3 className="detail-eyebrow" id="detail-identity-heading">{t('detail.identity')}</h3>
        <CopyValue label={t('field.taskId')} value={card.task_id} t={t} />
        <CopyValue label={t('field.publication')} value={card.publication_id} t={t} />
        <CopyValue label={t('field.headSha')} value={card.head_sha} t={t} />
        <dl className="detail-list">
          <div><dt>{t('field.repository')}</dt><dd>{card.repository_id}</dd></div>
          <div><dt>{t('field.revision')}</dt><dd className="mono-value">{card.task_revision}</dd></div>
          <div><dt>{t('field.claim')}</dt><dd className="mono-value">{card.claim_id ?? t('field.notClaimed')}</dd></div>
          <div><dt>{t('field.generation')}</dt><dd className="mono-value">{card.generation ?? t('field.none')}</dd></div>
          <div><dt>{t('field.lease')}</dt><dd>{t(`lease.${card.lease_state}` as OperatorMessageKey)}</dd></div>
          <div>
            <dt>{t('field.execution')}</dt>
            <dd>{card.execution_readiness ? t(`execution.${card.execution_readiness}` as OperatorMessageKey) : t('field.notApplicable')}</dd>
          </div>
        </dl>
      </section>
      <section className="detail-block" aria-labelledby="detail-signals-heading">
        <h3 className="detail-eyebrow" id="detail-signals-heading">{t('detail.signals')}</h3>
        <div className="signal-grid">
          <span><strong>{card.feedback.pending_count}</strong> {t('detail.signalFeedback')}</span>
          <span><strong>{card.inbox.unread_count}</strong> {t('detail.signalInbox')}</span>
          <span><strong>{cardBlockers(card).length}</strong> {t('detail.signalBlockers')}</span>
        </div>
      </section>
      {card.snapshot_consistency === 'changed_during_read' && (
        <div className="detail-callout detail-callout--warning">
          <Icon name="alert" size={15} />
          <div><strong>{t('detail.changedDuringRead')}</strong></div>
        </div>
      )}
    </>
  );
}

const WIDE_LAYOUT_QUERY = '(min-width: 901px)';

function useWideLayout(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(WIDE_LAYOUT_QUERY).matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(WIDE_LAYOUT_QUERY);
    const update = (event: MediaQueryListEvent) => setWide(event.matches);
    setWide(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}

function DetailPane({
  snapshot,
  card,
  revisionChangedFrom,
  modal,
  onClose,
  t,
}: {
  readonly snapshot: OperatorFleetSnapshotV1 | null;
  readonly card: OperatorFleetCardV1 | null;
  readonly revisionChangedFrom: string | null;
  readonly modal: boolean;
  readonly onClose: () => void;
  readonly t: OperatorTranslate;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const cardKey = card ? taskKey(card) : null;

  useEffect(() => {
    if (!cardKey || typeof document === 'undefined') return;
    if (modal) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeButtonRef.current?.focus();
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (!modal || event.key !== 'Tab') return;
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
      if (modal) returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
    // Task identity and responsive modality own the focus lifecycle; incidental
    // card replacement does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, modal]);

  if (modal && !card) return null;
  const label = card ? taskDisplayLabel(card) : null;
  return (
    <>
      {modal && card && (
        <button className="pane-scrim" type="button" tabIndex={-1} aria-label={t('detail.close')} onClick={onClose} />
      )}
      <aside
        ref={dialogRef}
        className="detail-pane"
        role={modal ? 'dialog' : 'complementary'}
        aria-modal={modal ? 'true' : undefined}
        aria-labelledby="detail-pane-title"
      >
        <div className="detail-pane__header">
          <div className="detail-pane__title">
            <p className="detail-eyebrow">{card ? t('detail.taskDetail') : t('detail.overviewTitle')}</p>
            <h2 id="detail-pane-title" className={label && !label.isLabel ? 'mono-value' : ''}>
              {label ? label.text : t('detail.overviewTitle')}
            </h2>
            {card && label?.isLabel && <code className="detail-pane__id">{card.task_id.slice(0, 12)}</code>}
          </div>
          {card && (
            <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label={t('detail.close')}>
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        <div className="detail-pane__body">
          {card ? (
            <TaskDetail card={card} revisionChangedFrom={revisionChangedFrom} t={t} />
          ) : snapshot ? (
            <>
              <p className="detail-quiet">{t('detail.overviewHint')}</p>
              <StageMatrix snapshot={snapshot} t={t} />
              <section className="detail-block" aria-labelledby="detail-health-heading">
                <h3 className="detail-eyebrow" id="detail-health-heading">{t('detail.repositoryHealth')}</h3>
                <RepositoryHealth snapshot={snapshot} t={t} />
              </section>
            </>
          ) : null}
        </div>
        <div data-slot="composer" />
      </aside>
    </>
  );
}

function EmptyFleet({ t }: { readonly t: OperatorTranslate }) {
  return (
    <section className="empty-state" aria-labelledby="empty-heading">
      <span className="empty-state__mark"><Icon name="repo" size={22} /></span>
      <p className="detail-eyebrow">{t('empty.eyebrow')}</p>
      <h2 id="empty-heading">{t('empty.title')}</h2>
      <p>{t('empty.body')}</p>
      <code>repo-harness adopt --help</code>
    </section>
  );
}

function LoadingState() {
  return (
    <section className="loading-board" aria-label="Loading Fleet board">
      <div className="loading-board__line loading-board__line--wide" />
      <div className="loading-board__rows">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
    </section>
  );
}

function FatalState({ error, onRetry, t }: { readonly error: OperatorApiErrorV1; readonly onRetry: () => void; readonly t: OperatorTranslate }) {
  return (
    <section className="fatal-state" aria-labelledby="fatal-heading">
      <span className="fatal-state__mark"><Icon name="alert" size={22} /></span>
      <p className="detail-eyebrow">{t('fatal.eyebrow')}</p>
      <h2 id="fatal-heading">{t('fatal.title')}</h2>
      <p>{error.message}</p>
      <code>{error.next_action}</code>
      <button className="operator-button operator-button--secondary" type="button" onClick={onRetry}>{t('fatal.retry')}</button>
    </section>
  );
}

interface Selection {
  readonly key: string;
  readonly revision: string;
}

export function OperatorApp({
  initialState,
  initialSnapshot,
  fetchSnapshot = fetchOperatorSnapshot,
  initialLocale,
}: OperatorAppProps) {
  const initial = initialState ?? (initialSnapshot ? stateFromSnapshot(initialSnapshot) : { kind: 'loading', previous: null } as const);
  const [state, setState] = useState<OperatorSnapshotViewState>(initial);
  const [selection, setSelection] = useState<Selection | null>(null);
  const { locale, setLocale, t } = useLocale(initialLocale);
  const wideLayout = useWideLayout();
  const refreshInFlight = useRef(false);
  const snapshot = snapshotForState(state);
  const busy = state.kind === 'loading';
  const stateKind = state.kind;

  const refresh = async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const previous = snapshotForState(state);
    setState({ kind: 'loading', previous });
    try {
      const nextSnapshot = await fetchSnapshot();
      setSelection((current) => (current === null || allCards(nextSnapshot).some((card) => taskKey(card) === current.key))
        ? current
        : null);
      setState(stateFromSnapshot(nextSnapshot));
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

  const selectedCard = selection && snapshot
    ? allCards(snapshot).find((card) => taskKey(card) === selection.key) ?? null
    : null;
  const revisionChangedFrom = selectedCard && selection && selectedCard.task_revision !== selection.revision
    ? selection.revision
    : null;
  const selectCard = (card: OperatorFleetCardV1) => setSelection({ key: taskKey(card), revision: card.task_revision });

  return (
    <div
      className={`operator-app${selectedCard ? ' has-selection' : ''}`}
      data-state={stateKind}
      data-locale={locale}
      lang={locale === 'zh' ? 'zh' : 'en'}
    >
      <StatusBar
        snapshot={snapshot}
        stale={stateKind === 'stale'}
        busy={busy}
        locale={locale}
        onLocale={setLocale}
        onRefresh={() => void refresh()}
        t={t}
      />
      <div className="operator-main">
        <main className="operator-content">
          <SnapshotNotice state={state} onRetry={() => void refresh()} t={t} />
          {state.kind === 'loading' && state.previous === null ? <LoadingState />
            : state.kind === 'fatal' ? <FatalState error={state.error} onRetry={() => void refresh()} t={t} />
              : snapshot ? (
                snapshotViewKind(snapshot) === 'empty'
                  ? <EmptyFleet t={t} />
                  : <Worklist snapshot={snapshot} selectedKey={selection?.key ?? null} onSelect={selectCard} t={t} />
              ) : null}
        </main>
        {(wideLayout || selectedCard) && state.kind !== 'fatal' && (
          <DetailPane
            snapshot={snapshot}
            card={selectedCard}
            revisionChangedFrom={revisionChangedFrom}
            modal={!wideLayout}
            onClose={() => setSelection(null)}
            t={t}
          />
        )}
      </div>
      <footer className="operator-footer">
        <span>repo-harness operator</span>
        <span>{t('footer.protocol', { protocol: 2, sequence: snapshot?.sequence ?? '—' })}</span>
        <span className="operator-footer__right">read-only / localhost</span>
      </footer>
    </div>
  );
}

export { DEFAULT_OPERATOR_LOCALE, fetchOperatorSnapshot };
