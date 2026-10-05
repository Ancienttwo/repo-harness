import { TaskHistory, type TaskHistoryReader } from './TaskHistory';
import { parseTaskLocation, taskLocationSearch, type TaskLocation } from './task-location';
import { useObservationRefresh } from './useObservationRefresh';
import { PlanningView } from './PlanningView';
import { DecisionSummary, OrganizationSummary } from './OrganizationSummary';
import type { OperatorWorkExchangeSnapshot } from './types';
import { TaskEvidence, type TaskContextReader, type TaskActivityReader } from './TaskEvidence';
import { AutomationSummary, type RepositoryObservationReader } from './AutomationSummary';
import { type NotifyStatusV1 } from '../core/operator/notify-status';
import { NotifyStatusPanel, type NotifyStatusReader } from './NotifyStatus';
import { type PipelineBoardV2 } from '../core/pipeline/board';
import { PipelineBoardPanel, type PipelineBoardReader } from './PipelineBoard';
import { TaskDiff } from './TaskDiff';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Icon } from './icons';
import { CarrotMark, DunkieMark, HookMark } from './marks';
import {
  DEFAULT_OPERATOR_LOCALE,
  formatRelativeAge,
  relativeAge,
  isOperatorMessageKey,
  translate,
  useLocale,
  type OperatorLocale,
  type OperatorMessageKey,
  type OperatorTranslate,
} from './i18n';
import {
  allCards,
  decodeOperatorCollaborationSnapshot,
  decodeOperatorFleetSnapshot,
  OPERATOR_COLUMNS,
  OPERATOR_COLLABORATION_PAYLOAD_INVALID_ERROR,
  OPERATOR_PAYLOAD_INVALID_ERROR,
  projectSnapshotViewState,
  snapshotViewKind,
  type OperatorApiErrorCode,
  type OperatorApiErrorV1,
  type OperatorCollaborationSnapshotV4,
  type OperatorCollaborationSource,
  type OperatorFleetCardV1,
  type OperatorFleetErrorV1,
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
  readonly fetchSnapshot?: (signal?: AbortSignal) => Promise<OperatorFleetSnapshotV1>;
  /** The read-only collaboration read, injectable on the same terms. */
  readonly fetchCollaboration?: (repositoryId: string, signal: AbortSignal, decisionAfter: string | null) => Promise<OperatorCollaborationSnapshotV4>;
  /** A deterministic collaboration state for fixtures and server renders. */
  readonly initialCollaboration?: CollaborationViewState;
  /** Tests pin the locale; the browser resolves it from storage or navigator. */
  readonly initialLocale?: OperatorLocale;
  readonly fetchRepositoryObservation?: RepositoryObservationReader;
  readonly readTaskHistory?: TaskHistoryReader;
  readonly readTaskContext?: TaskContextReader;
  readonly readTaskActivity?: TaskActivityReader;
  readonly readNotifyStatus?: NotifyStatusReader;
  readonly initialNotifyStatus?: NotifyStatusV1;
  readonly readPipelineBoard?: PipelineBoardReader;
  readonly initialPipelineBoard?: PipelineBoardV2;
}

/**
 * A typed error the browser raises for itself. Its sentences are read out of the
 * dictionary rather than restated here, so the board and a rejected promise
 * cannot disagree about what the same code means.
 */
function clientApiError(code: OperatorApiErrorCode): OperatorApiErrorV1 {
  return Object.freeze({
    code,
    message: translate(DEFAULT_OPERATOR_LOCALE, `error.${code}.message` as OperatorMessageKey),
    next_action: translate(DEFAULT_OPERATOR_LOCALE, `error.${code}.action` as OperatorMessageKey),
  });
}

const DEFAULT_API_ERROR: OperatorApiErrorV1 = clientApiError('operator_api_unavailable');

export interface LocalizedApiError {
  readonly message: string;
  readonly next_action: string;
  /** False when the sentence below is the server's own English, not board copy. */
  readonly localized: boolean;
}

/**
 * Error copy is client-owned and keyed by the typed code. A code outside the
 * closed set belongs to a server ahead of this bundle: its English sentence is
 * shown, and labelled as the server's rather than presented as board copy.
 */
export function localizeApiError(error: OperatorApiErrorV1, t: OperatorTranslate): LocalizedApiError {
  const messageKey = `error.${error.code}.message`;
  const actionKey = `error.${error.code}.action`;
  if (isOperatorMessageKey(messageKey) && isOperatorMessageKey(actionKey)) {
    return { message: t(messageKey), next_action: t(actionKey), localized: true };
  }
  return { message: error.message, next_action: error.next_action, localized: false };
}

function ApiErrorText({ error, t }: { readonly error: OperatorApiErrorV1; readonly t: OperatorTranslate }) {
  const localized = localizeApiError(error, t);
  return (
    <>
      {localized.message} {localized.next_action}
      {!localized.localized && <> ({t('error.untranslated')})</>}
    </>
  );
}

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

async function fetchOperatorSnapshot(signal?: AbortSignal): Promise<OperatorFleetSnapshotV1> {
  const response = await fetch('/api/v1/fleet/snapshot', {
    headers: { Accept: 'application/json' },
    cache: 'no-store', signal,
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
type ReadinessBlocker = NonNullable<OperatorFleetCardV1['readiness_blockers']>[number];
type BlockerOwner = MergeBlocker['attention_owner'];

function cardBlockers(card: OperatorFleetCardV1): readonly MergeBlocker[] {
  return card.merge_readiness?.blockers ?? [];
}

export type WorklistCause =
  | { readonly kind: 'blocker'; readonly blocker: MergeBlocker }
  | { readonly kind: 'readiness'; readonly blocker: ReadinessBlocker }
  | { readonly kind: 'no_progress' }
  | { readonly kind: 'unread'; readonly count: number };

/**
 * One row shows one reason. The order is the operator's routing order: a
 * blocker you own outranks a stalled agent, which outranks a wait on someone
 * else, which outranks an unread message.
 */
export function primaryCause(card: OperatorFleetCardV1): WorklistCause | null {
  const preExecution = card.task_state === 'pending' && (card.placement.kind !== 'column' || card.placement.column === 'available');
  if (preExecution && card.readiness_blockers?.length) {
    const blocker = card.readiness_blockers.find(blocker => blocker.attention_owner === 'user')
      ?? card.readiness_blockers.find(blocker => blocker.attention_owner === 'external')
      ?? card.readiness_blockers[0]!;
    return { kind: 'readiness', blocker };
  }
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
  | 'claimed'
  | 'available'
  | 'preparation'
  | 'external'
  | 'done';

export const WORKLIST_GROUP_ORDER: readonly WorklistGroupId[] = [
  'needs_you',
  'ready_to_merge',
  'unreadable',
  'unclassified',
  'preparation',
  'available',
  'claimed',
  'external',
  'done',
];

/**
 * Assignment order is not the display order. `unclassified` is claimed before
 * `external` so a card Fleet could not classify can never land in a group the
 * board collapses by default.
 */
function groupForCard(card: OperatorFleetCardV1): Exclude<WorklistGroupId, 'unreadable'> {
  if (card.attention_owner === 'user') return 'needs_you';
  if (card.placement.kind === 'unclassified') return 'unclassified';
  if (card.placement.kind === 'preparation' || card.placement.kind === 'alternate_workflow') return 'preparation';
  if (card.placement.column === 'available') return 'available';
  if (card.placement.column === 'ready_to_merge') return 'ready_to_merge';
  if (card.attention_owner === 'external') return 'external';
  if (card.placement.column === 'done') return 'done';
  return 'claimed';
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

export function groupWorklist(snapshot: Pick<OperatorFleetSnapshotV1, 'repositories'>): readonly WorklistGroup[] {
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

/** Start with one useful group open; zero-count and lower-priority groups stay out of the first viewport. */
export function defaultCollapsedGroups(groups: readonly WorklistGroup[]): readonly WorklistGroupId[] {
  const firstNonEmpty = groups.find((group) => group.count > 0)?.id ?? null;
  return groups.filter((group) => group.id !== firstNonEmpty).map((group) => group.id);
}

function RuntimeExceptionBadges({ card, t }: { readonly card: OperatorFleetCardV1; readonly t: OperatorTranslate }) {
  return (
    <>
      {card.inbox.runtime_reachability === 'unavailable' && (
        <Badge tone="tone-danger">{t('runtime.unavailable')}</Badge>
      )}
      {(card.inbox.delivery_state === 'failed' || card.inbox.delivery_state === 'reconciliation_required') && (
        <Badge tone="tone-danger">{t(`delivery.${card.inbox.delivery_state}` as OperatorMessageKey)}</Badge>
      )}
    </>
  );
}

function stageKey(placement: OperatorFleetCardV1['placement']): OperatorMessageKey {
  return `stage.${placement.kind === 'column' ? placement.column : placement.kind}` as OperatorMessageKey;
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
  return <CarrotMark height={24} className="brand-mark" />;
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
  repositoryId,
  onRepository,
  t,
}: {
  readonly snapshot: OperatorFleetSnapshotV1 | null;
  readonly repositoryId: string;
  readonly onRepository: (id: string) => void;
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
        <label className="repository-switch">
          <span>{t('field.repository')}</span>
          <select aria-label={t('repository.select')} value={repositoryId} onChange={(event) => onRepository(event.target.value)} disabled={!snapshot?.repositories.length}>
            <option value="" disabled>{t('repository.select')}</option>
            {snapshot?.repositories.map((repo) => (
              <option key={repo.repository_id} value={repo.repository_id}>
                {repo.display_name}{snapshot.repositories.filter((other) => other.display_name === repo.display_name).length > 1 ? ` · ${repo.repository_id}` : ''}
              </option>
            ))}
          </select>
        </label>
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
        <div><strong>{t('notice.staleTitle')}</strong><span><ApiErrorText error={state.error} t={t} /></span></div>
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

function CauseLine({ cause, t }: { readonly cause: WorklistCause | null; readonly t: OperatorTranslate }) {
  if (!cause) {
    return <span className="worklist-row__cause worklist-row__cause--quiet">{t('row.noCause')}</span>;
  }
  if (cause.kind === 'blocker' || cause.kind === 'readiness') {
    return (
      <span className={`worklist-row__cause ${attentionTone(cause.blocker.attention_owner)}`}>
        <Icon name="alert" size={13} />
        <span className="cause-owner">{t(attentionKey(cause.blocker.attention_owner))}</span>
        <span className="cause-text">{t(cause.kind === 'readiness' ? `readinessBlocker.${cause.blocker.code}` as OperatorMessageKey : blockerKey(cause.blocker.code))}</span>
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
  const cause = primaryCause(card);
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
        <RuntimeExceptionBadges card={card} t={t} />
      </span>
      <span className="worklist-row__meta">
        <span className="worklist-row__repository"><Icon name="repo" size={13} />{card.repository_id}</span>
        <span className="worklist-row__stage">{t(stageKey(card.placement))}</span>
        {changed && <span className="worklist-row__changed">{t('row.changedDuringRead')}</span>}
      </span>
      <CauseLine cause={cause} t={t} />
      <span className="worklist-row__signals">
        {card.feedback.pending_count > 0 && <span>{t('row.feedback', { count: card.feedback.pending_count })}</span>}
        {/* The cause line already states the unread count when unread is the reason this row is here. */}
        {cause?.kind !== 'unread' && card.inbox.unread_count > 0 && (
          <span>{t('row.unread', { count: card.inbox.unread_count })}</span>
        )}
      </span>
    </button>
  );
}

/**
 * The server sentence for a repository failure is a diagnostic contract, not
 * board copy. Every code in the closed vocabulary therefore has its own entry
 * here, which the type checker requires to stay exhaustive.
 */
const REPOSITORY_ERROR_KEYS: Readonly<Record<OperatorFleetErrorV1['code'], OperatorMessageKey>> = {
  repo_unreadable: 'repo.error.repo_unreadable',
  repo_authority_invalid: 'repo.error.repo_authority_invalid',
  repo_snapshot_changed: 'repo.error.repo_snapshot_changed',
  repo_board_unavailable: 'repo.error.repo_board_unavailable',
  repo_publication_unreadable: 'repo.error.repo_publication_unreadable',
  repo_readiness_unavailable: 'repo.error.repo_readiness_unavailable',
  repo_feedback_unreadable: 'repo.error.repo_feedback_unreadable',
  repo_inbox_unreadable: 'repo.error.repo_inbox_unreadable',
  repo_runtime_effect_unreadable: 'repo.error.repo_runtime_effect_unreadable',
  repo_collection_timeout: 'repo.error.repo_collection_timeout',
};

function repositoryErrorMessage(
  error: NonNullable<OperatorFleetRepositoryV1['error']>,
  t: OperatorTranslate,
): string {
  return t(REPOSITORY_ERROR_KEYS[error.code]);
}

function UnreadableRepositoryRow({
  repository,
  t,
}: {
  readonly repository: OperatorFleetRepositoryV1;
  readonly t: OperatorTranslate;
}) {
  return (
    <div className="worklist-row worklist-row--repository" role="group" aria-label={repository.repository_id}>
      <span className="worklist-row__head">
        <span className="worklist-row__label">{repository.repository_id}</span>
        <Badge tone="tone-danger">{t('repo.status.unreadable')}</Badge>
      </span>
      {repository.error && (
        <span className="worklist-row__cause tone-danger">
          <Icon name="alert" size={13} />
          <span className="cause-text">{repositoryErrorMessage(repository.error, t)}</span>
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
  readonly snapshot: Pick<OperatorFleetSnapshotV1, 'repositories'>;
  readonly selectedKey: string | null;
  readonly onSelect: (card: OperatorFleetCardV1) => void;
  readonly t: OperatorTranslate;
}) {
  const groups = useMemo(() => groupWorklist(snapshot), [snapshot]);
  const [filter, setFilter] = useState<WorklistGroupId | 'all'>('all');
  /**
   * `undefined` means the group still follows the attention-first default for
   * the current snapshot. Once an operator toggles a group, its explicit
   * choice survives later snapshots while all other groups may be reconciled
   * against the new first non-empty group.
   */
  const [groupOverrides, setGroupOverrides] = useState<Partial<Record<WorklistGroupId, boolean>>>({});
  const automaticCollapsed = useMemo(() => new Set(defaultCollapsedGroups(groups)), [groups]);
  /**
   * Cards and unreadable repositories are different populations. Summing the
   * per-group counts made the All chip claim one task per unreadable
   * repository, so each population is counted where it is labelled.
   */
  const cardTotal = groups.reduce((sum, group) => sum + group.cards.length, 0);
  const repositoryTotal = groups.reduce((sum, group) => sum + group.repositories.length, 0);
  const visible = groups.filter((group) => filter === 'all' || group.id === filter);

  const isCollapsed = (id: WorklistGroupId): boolean => groupOverrides[id] ?? automaticCollapsed.has(id);
  const toggle = (id: WorklistGroupId) => {
    const nextCollapsed = !isCollapsed(id);
    setGroupOverrides((current) => ({ ...current, [id]: nextCollapsed }));
  };

  return (
    <section className="worklist" id="worklist" aria-labelledby="worklist-heading">
      <div className="worklist__header">
        <h2 id="worklist-heading">{t('worklist.title')}</h2>
      </div>
      <div className="worklist__filters" role="group" aria-label={t('worklist.filters')}>
        <button type="button" aria-pressed={filter === 'all'} className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>
          {t('worklist.filterAll')}<span>{cardTotal}</span>
        </button>
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            aria-pressed={filter === group.id}
            className={filter === group.id ? 'is-active' : ''}
            onClick={() => {
              setFilter(group.id);
              // Choosing a group filter is also an explicit request to see
              // that group's rows; keep it open when a later snapshot arrives.
              setGroupOverrides((current) => ({ ...current, [group.id]: false }));
            }}
          >
            {t(`group.${group.id}` as OperatorMessageKey)}<span>{group.count}</span>
          </button>
        ))}
      </div>
      {cardTotal + repositoryTotal === 0 ? (
        <div className="empty-inline"><Icon name="check" size={16} /><span>{t('worklist.empty')}</span></div>
      ) : (
        <div className="worklist__groups">
          {visible.map((group) => {
            const groupLabel = t(`group.${group.id}` as OperatorMessageKey);
            const open = !isCollapsed(group.id);
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
                    {group.count === 0 && (
                      <p className="worklist-group__empty">
                        {group.id === 'needs_you' && <CarrotMark height={16} />}
                        {t('worklist.groupEmpty')}
                      </p>
                    )}
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

type ObservationView = 'planning' | 'delivery' | 'organization';
const OBSERVATION_VIEWS: readonly ObservationView[] = ['planning', 'delivery', 'organization'];
function ObservationTabs({ view, onChange, t }: { readonly view: ObservationView; readonly onChange: (view: ObservationView) => void; readonly t: OperatorTranslate }) {
  return <div className="observation-tabs" role="tablist" aria-label={t('view.label')}>
    {OBSERVATION_VIEWS.map((item,index) => <button key={item} type="button" role="tab" id={`view-tab-${item}`} aria-controls={`view-panel-${item}`} aria-selected={view === item} tabIndex={view === item ? 0 : -1}
      onClick={() => onChange(item)} onKeyDown={event => {
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? OBSERVATION_VIEWS.length - 1
          : event.key === 'ArrowRight' ? (index + 1) % OBSERVATION_VIEWS.length : event.key === 'ArrowLeft' ? (index + OBSERVATION_VIEWS.length - 1) % OBSERVATION_VIEWS.length : null;
        if (next === null) return;
        event.preventDefault(); onChange(OBSERVATION_VIEWS[next]!);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}>{t(`view.${item}`)}</button>)}
  </div>;
}

function DeliveryView({ repository, selectedKey, onSelect, t }: {
  readonly repository: OperatorFleetRepositoryV1;
  readonly selectedKey: string | null;
  readonly onSelect: (card: OperatorFleetCardV1) => void;
  readonly t: OperatorTranslate;
}) {
  const cards = repository.cards;
  const group = (id:string, label:string, rows:readonly OperatorFleetCardV1[]) => <section className="delivery-stage" key={id} data-delivery-stage={id} aria-labelledby={`delivery-${id}`}>
    <h3 id={`delivery-${id}`}>{label} <span>{rows.length}</span></h3>
    {rows.length === 0 ? <p>{t('delivery.empty')}</p> : rows.map(card => <WorklistRow key={taskKey(card)} card={card} selected={selectedKey === taskKey(card)} onSelect={onSelect} t={t} />)}
  </section>;
  return <section className="delivery-view" aria-labelledby="delivery-heading">
    <h2 id="delivery-heading">{t('view.delivery')}</h2>
    {repository.status === 'unreadable' ? <UnreadableRepositoryRow repository={repository} t={t} /> : <>
      <div className="delivery-columns">{OPERATOR_COLUMNS.map(column => group(column.id,t(stageKey({kind:'column',column:column.id})),cards.filter(card => card.task_state !== 'missing' && card.placement.kind === 'column' && card.placement.column === column.id)))}</div>
      <div className="delivery-other">{(['preparation','alternate_workflow','unclassified'] as const).map(kind => group(kind,t(`stage.${kind}`),cards.filter(card => card.task_state !== 'missing' && card.placement.kind === kind)))}
        {group('isolated',t('repo.isolatedHeading'),cards.filter(card => card.task_state === 'missing'))}
      </div>
    </>}
  </section>;
}

function StageMatrix({ snapshot, t }: { readonly snapshot: Pick<OperatorFleetSnapshotV1, 'repositories'>; readonly t: OperatorTranslate }) {
  return (
    <div className="stage-matrix__scroll">
      <table className="stage-matrix">
        <caption className="detail-eyebrow">{t('detail.matrixTitle')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('detail.matrixRepository')}</th>
            {(['preparation', 'alternate_workflow'] as const).map(kind => <th scope="col" key={kind}>{t(`stage.${kind}`)}</th>)}
            {OPERATOR_COLUMNS.map((column) => <th scope="col" key={column.id}>{t(stageKey({ kind: 'column', column: column.id }))}</th>)}
            <th scope="col">{t('stage.unclassified')}</th><th scope="col">{t('repo.isolatedHeading')}</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.repositories.map((repository) => (
            <tr key={repository.repository_id}>
              <th scope="row">{repository.display_name}</th>
              {(['preparation', 'alternate_workflow'] as const).map(kind => <td key={kind}>{repository.status === 'unreadable' ? '—' : repository.cards.filter(card => card.task_state !== 'missing' && card.placement.kind === kind).length}</td>)}
              {OPERATOR_COLUMNS.map((column) => (
                <td key={column.id}>{repository.status === 'unreadable' ? '—' : repository.cards.filter((card) => card.task_state !== 'missing' && card.placement.kind === 'column' && card.placement.column === column.id).length}</td>
              ))}
              <td>{repository.status === 'unreadable' ? '—' : repository.cards.filter(card => card.task_state !== 'missing' && card.placement.kind === 'unclassified').length}</td>
              <td>{repository.status === 'unreadable' ? '—' : repository.cards.filter(card => card.task_state === 'missing').length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RepositoryHealth({
  snapshot,
  t,
}: {
  readonly snapshot: Pick<OperatorFleetSnapshotV1, 'repositories'>;
  readonly t: OperatorTranslate;
}) {
  return (
    <div className="repository-list">
      {snapshot.repositories.map((repository) => {
        const repoStatus = repository.status === 'unreadable' ? 'danger' : repository.snapshot_consistency === 'stable' ? 'ok' : 'warn';
        return (
          <article className={`repository-row repository-row--${repoStatus}`} key={repository.repository_id}>
            <div className="repository-row__main">
              <strong>{repository.display_name}</strong>
              <span>
                {t(`repo.accessMode.${repository.access_mode}` as OperatorMessageKey)} · {repository.status === 'unreadable' ? t('repo.tasksUnknown') : t('repo.tasks', { count: repository.cards.filter(card => card.task_state !== 'missing').length })}
                {repository.cards.some(card => card.task_state === 'missing') && <> · {t('repo.isolated', { count: repository.cards.filter(card => card.task_state === 'missing').length })}</>}
              </span>
            </div>
            <span className="repository-row__state">
              <StatusDot status={repoStatus} />
              {repository.status === 'unreadable'
                ? t('repo.status.unreadable')
                : t(`status.consistency.${repository.snapshot_consistency}` as OperatorMessageKey)}
            </span>
            {repository.error && <span className="repository-row__error">{repositoryErrorMessage(repository.error, t)}</span>}
          </article>
        );
      })}
    </div>
  );
}

function TaskCauses({ card, t }: { readonly card: OperatorFleetCardV1; readonly t: OperatorTranslate }) {
  const blockers = cardBlockers(card);
  const quiet = blockers.length === 0 && !card.feedback.no_progress && card.inbox.unread_count === 0;
  if (quiet && (card.readiness_blockers?.length ?? 0) > 0) return null;
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
  const evidence = card.inbox.delivery_evidence;
  const observation = evidence?.latest ?? null;
  const observationAge = observation === null ? null : relativeAge(observation.observed_at, Date.now());
  const terminalNotice = observation?.effect_state === 'stopped' || observation?.effect_state === 'superseded';
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
        <Badge>{t(stageKey(card.placement))}</Badge>
        <Badge>{card.repository_id}</Badge>
      </div>
      <TaskCauses card={card} t={t} />
      {card.readiness_blockers !== null && card.readiness_blockers.length > 0 && (
        <section className="detail-block" aria-labelledby="detail-readiness-heading">
          <h3 className="detail-eyebrow" id="detail-readiness-heading">{t('detail.readinessBlockers')}</h3>
          <ul className="cause-list">{card.readiness_blockers.map((blocker, index) => (
            <li className={`cause-item ${attentionTone(blocker.attention_owner)}`} key={`${blocker.code}:${index}`}>
              <span className="cause-text">{t(`readinessBlocker.${blocker.code}` as OperatorMessageKey)}</span>
              <span className="cause-owner">{t('detail.blockerOwner', { owner: t(attentionKey(blocker.attention_owner)) })}</span>
              <code className="cause-code">{blocker.code}</code>
            </li>
          ))}</ul>
        </section>
      )}
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
      <section className="detail-block" aria-labelledby="detail-delivery-heading">
        <h3 className="detail-eyebrow" id="detail-delivery-heading">{t('detail.deliveryRuntime')}</h3>
        <p className="detail-description">{t('deliveryEvidence.explanation')}</p>
        {evidence === null ? <p>{t('deliveryEvidence.unavailable')}</p>
          : evidence.candidate_count === 0 ? <p>{t(card.claim_id === null ? 'deliveryEvidence.noClaim' : 'deliveryEvidence.empty')}</p>
          : evidence.candidate_count > 1 ? <p>{t('deliveryEvidence.multiple', { count: evidence.candidate_count })}</p>
          : null}
        {observation && <dl className="detail-list">
          <div><dt>{t('deliveryEvidence.adapter')}</dt><dd>{observation.adapter_kind}</dd></div>
          <div><dt>{t('deliveryEvidence.phase')}</dt><dd>{t(`effect.${observation.effect_state}` as OperatorMessageKey)}</dd></div>
          <div><dt>{t('deliveryEvidence.observedAt')}</dt><dd><time dateTime={observation.observed_at} title={observation.observed_at}>{observationAge && t('deliveryEvidence.observedAgo', { age: t(observationAge.key, { count: observationAge.count }) })}</time></dd></div>
          <div><dt>{t('deliveryEvidence.receipt')}</dt><dd>{t(`receipt.${observation.receipt_kind ?? 'none'}` as OperatorMessageKey)}</dd></div>
        </dl>}
        <details>
          <summary>{t('deliveryEvidence.identifiers')}</summary>
          <CopyValue label={t('field.effectSha')} value={card.inbox.effect_sha256} t={t} />
          {observation && <>
            <dl className="detail-list">
              <div><dt>{t('deliveryEvidence.sequence')}</dt><dd>{observation.observation_sequence}</dd></div>
              <div><dt>{t('deliveryEvidence.observedAt')}</dt><dd><time dateTime={observation.observed_at}>{observation.observed_at}</time></dd></div>
            </dl>
            <CopyValue label={t('deliveryEvidence.observationSha')} value={observation.observation_sha256} t={t} />
          </>}
        </details>
        <dl className="detail-list">
          <div>
            <dt>{t('field.deliveryState')}</dt>
            <dd>{terminalNotice ? t(`effect.${observation.effect_state}` as OperatorMessageKey) : t(`delivery.${card.inbox.delivery_state}` as OperatorMessageKey)}</dd>
          </div>
          <div>
            <dt>{t('field.runtimeReachability')}</dt>
            <dd>{t(`runtime.${card.inbox.runtime_reachability}` as OperatorMessageKey)}</dd>
          </div>
          <div>
            <dt>{t('field.failureClass')}</dt>
            <dd className="mono-value">{card.inbox.failure_class ?? t('field.none')}</dd>
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

/**
 * The board's collaboration read, as a state machine rather than a nullable
 * snapshot.
 *
 * `idle` and an empty snapshot are different facts and are kept apart on
 * purpose: the first says nothing has been read for this repository yet, the
 * second says the store was read and holds nothing. Collapsing them is how a
 * collaboration store that could not be read starts looking quiet.
 */
export type CollaborationViewState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly repository_id: string }
  | { readonly kind: 'ready'; readonly snapshot: OperatorCollaborationSnapshotV4 }
  | {
      readonly kind: 'failed';
      readonly repository_id: string;
      readonly error: OperatorApiErrorV1;
    };

const COLLABORATION_UNAVAILABLE_ERROR: OperatorApiErrorV1 = clientApiError('collaboration_snapshot_unavailable');

const COLLABORATION_REPOSITORY_MISMATCH_ERROR: OperatorApiErrorV1 = clientApiError('collaboration_repository_mismatch');

function assertCollaborationRepository(
  snapshot: OperatorCollaborationSnapshotV4,
  repositoryId: string,
  decisionAfter: string | null = null,
): OperatorCollaborationSnapshotV4 {
  if (snapshot.repository_id !== repositoryId || snapshot.decision_after !== decisionAfter) throw COLLABORATION_REPOSITORY_MISMATCH_ERROR;
  return snapshot;
}

async function fetchOperatorCollaborationSnapshot(
  repositoryId: string,
  signal?: AbortSignal,
  decisionAfter: string | null = null,
): Promise<OperatorCollaborationSnapshotV4> {
  if (decisionAfter !== null && !/^[0-9a-f]{64}$/u.test(decisionAfter)) throw OPERATOR_COLLABORATION_PAYLOAD_INVALID_ERROR;
  const query = decisionAfter === null ? '' : `?decision_after=${decisionAfter}`;
  const response = await fetch(`/api/v1/collaboration/${encodeURIComponent(repositoryId)}/snapshot${query}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw asApiError(body, COLLABORATION_UNAVAILABLE_ERROR);
  let snapshot: OperatorCollaborationSnapshotV4;
  try {
    snapshot = decodeOperatorCollaborationSnapshot(body);
  } catch {
    // Fleet and collaboration payloads are separate authorities. Keep a
    // malformed collaboration response from borrowing Fleet diagnostics.
    throw OPERATOR_COLLABORATION_PAYLOAD_INVALID_ERROR;
  }
  return assertCollaborationRepository(snapshot, repositoryId, decisionAfter);
}

function sourceList(
  sources: readonly OperatorCollaborationSource[],
  t: OperatorTranslate,
): string {
  return sources.map((source) => t(`collab.source.${source}` as OperatorMessageKey)).join(', ');
}

/**
 * The consistency banner.
 *
 * `degraded` and `changed_during_read` are stated with the sources that produced
 * them, because the collector already knows which ones moved and a banner that
 * only said "incomplete" would send the reader back to guessing. A quiet panel
 * is never an acceptable rendering of either.
 */
function CollaborationConsistency({
  snapshot,
  t,
}: {
  readonly snapshot: OperatorWorkExchangeSnapshot;
  readonly t: OperatorTranslate;
}) {
  if (snapshot.snapshot_consistency === 'degraded') {
    return (
      <div className="operator-notice operator-notice--danger" role="alert">
        <Icon name="alert" size={16} />
        <div>
          <strong>{t('collab.degradedTitle')}</strong>
          <span>{t('collab.degradedBody', { sources: sourceList(snapshot.degraded_sources, t) })}</span>
        </div>
      </div>
    );
  }
  if (snapshot.snapshot_consistency === 'changed_during_read') {
    return (
      <div className="operator-notice operator-notice--warning" role="status" aria-live="polite">
        <Icon name="alert" size={16} />
        <div>
          <strong>{t('collab.changedTitle')}</strong>
          <span>{t('collab.changedBody', { sources: sourceList(snapshot.changed_sources, t) })}</span>
        </div>
      </div>
    );
  }
  return null;
}

function CollaborationLanes({
  snapshot,
  t,
}: {
  readonly snapshot: OperatorWorkExchangeSnapshot;
  readonly t: OperatorTranslate;
}) {
  return (
    <section className="detail-block" aria-labelledby="collab-lanes-heading">
      <h3 className="detail-eyebrow" id="collab-lanes-heading">{t('collab.lanes')}</h3>
      {snapshot.threads.length === 0 ? (
        <p className="detail-quiet">{t('collab.lanesEmpty')}</p>
      ) : (
        <ul className="collab-list">
          {snapshot.threads.map((thread) => (
            <li className="collab-lane" key={thread.thread_key}>
              <span className="collab-lane__head">
                <strong className="collab-lane__key">{thread.thread_key}</strong>
                <Badge>{t('collab.laneHotspot', { score: thread.hotspot_score })}</Badge>
              </span>
              <span className="collab-meta">
                <span>{t('collab.laneSignals', { count: thread.signal_count })}</span>
                <span>{t('collab.laneContributors', { count: thread.distinct_contributor_count })}</span>
                <span>{t('collab.laneArtifacts', { count: thread.artifact_ref_count })}</span>
                {thread.unadopted_handoff_count > 0 && (
                  <span>{t('collab.laneUnadopted', { count: thread.unadopted_handoff_count })}</span>
                )}
                {thread.adoption_count > 0 && (
                  <span>{t('collab.laneAdopted', { count: thread.adoption_count })}</span>
                )}
                {thread.cross_thread_reference_count > 0 && (
                  <span>{t('collab.laneCrossRefs', { count: thread.cross_thread_reference_count })}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CollaborationDiscoveries({
  snapshot,
  t,
}: {
  readonly snapshot: OperatorWorkExchangeSnapshot;
  readonly t: OperatorTranslate;
}) {
  return (
    <section className="detail-block" aria-labelledby="collab-signals-heading">
      <h3 className="detail-eyebrow" id="collab-signals-heading">{t('collab.discoveries')}</h3>
      {snapshot.signals.length === 0 ? (
        <p className="detail-quiet">{t('collab.discoveriesEmpty')}</p>
      ) : (
        <ul className="collab-list">
          {snapshot.signals.map((signal) => (
            <li className={`collab-signal${signal.superseded ? ' is-superseded' : ''}`} key={signal.signal_id}>
              <span className="collab-signal__title">{signal.title}</span>
              <span className="collab-meta">
                <span className="collab-lane__key">{signal.thread_key}</span>
                <span className="mono-value">{signal.actor_lineage}</span>
                {signal.artifact_ref_count > 0 && (
                  <span>{t('collab.signalArtifacts', { count: signal.artifact_ref_count })}</span>
                )}
                {signal.superseded && <span className="collab-flag">{t('collab.superseded')}</span>}
              </span>
              {signal.labels.length > 0 && (
                <span className="collab-labels">
                  {signal.labels.map((label) => <code className="cause-code" key={label}>{label}</code>)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CollaborationHandoffs({
  snapshot,
  t,
}: {
  readonly snapshot: OperatorWorkExchangeSnapshot;
  readonly t: OperatorTranslate;
}) {
  return (
    <section className="detail-block" aria-labelledby="collab-handoffs-heading">
      <h3 className="detail-eyebrow" id="collab-handoffs-heading">{t('collab.handoffs')}</h3>
      {snapshot.handoffs.length === 0 ? (
        <p className="detail-quiet">{t('collab.handoffsEmpty')}</p>
      ) : (
        <ul className="collab-list">
          {snapshot.handoffs.map((handoff) => (
            <li className="collab-handoff" key={handoff.handoff_id}>
              <span className="collab-handoff__head">
                <strong>{handoff.goal}</strong>
                <Badge>{t('collab.handoffAdoptions', { count: handoff.adoption_count })}</Badge>
              </span>
              <span className="collab-meta">
                <span className="collab-lane__key">{handoff.thread_key}</span>
                <span>{t('collab.handoffTrigger', { trigger: handoff.trigger })}</span>
                <span>{t('collab.handoffNextActions', { count: handoff.next_action_count })}</span>
                <span>{t('collab.handoffHypotheses', { count: handoff.open_hypothesis_count })}</span>
              </span>
              <span className={`collab-context${handoff.execution_context_kind === null ? ' is-withheld' : ''}`}>
                {handoff.execution_context_kind === null
                  ? t('collab.contextWithheld')
                  : t(`collab.context.${handoff.execution_context_kind}` as OperatorMessageKey)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {snapshot.unverified_execution_context_count > 0 && (
        <div className="detail-callout detail-callout--warning">
          <Icon name="alert" size={15} />
          <div>
            <strong>{t('collab.unverified', { count: snapshot.unverified_execution_context_count })}</strong>
            <span>{t('collab.unverifiedBody')}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function CollaborationContributors({
  snapshot,
  t,
}: {
  readonly snapshot: OperatorWorkExchangeSnapshot;
  readonly t: OperatorTranslate;
}) {
  return (
    <section className="detail-block" aria-labelledby="collab-contributors-heading">
      <h3 className="detail-eyebrow" id="collab-contributors-heading">{t('collab.contributors')}</h3>
      {snapshot.participants.length === 0 ? (
        <p className="detail-quiet">{t('collab.contributorsEmpty')}</p>
      ) : (
        <ul className="collab-list">
          {snapshot.participants.map((participant) => (
            <li className="collab-contributor" key={participant.actor_lineage}>
              <span className="collab-contributor__head">
                <span className="mono-value">{participant.actor_lineage}</span>
                <Badge>{t(`collab.actor.${participant.actor_kind}` as OperatorMessageKey)}</Badge>
              </span>
              <span className="collab-meta">
                {t('collab.contributorCounts', {
                  signals: participant.signal_count,
                  handoffs: participant.handoff_count,
                  lanes: participant.thread_keys.length,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CollaborationOpportunities({
  snapshot,
  t,
}: {
  readonly snapshot: OperatorWorkExchangeSnapshot;
  readonly t: OperatorTranslate;
}) {
  if (snapshot.opportunities.length === 0) return null;
  return (
    <section className="detail-block" aria-labelledby="collab-opportunities-heading">
      <h3 className="detail-eyebrow" id="collab-opportunities-heading">{t('collab.opportunities')}</h3>
      <ul className="collab-list">
        {snapshot.opportunities.map((opportunity) => (
          <li className="collab-opportunity" key={`${opportunity.thread_key}:${opportunity.reason}`}>
            <span className="collab-lane__key">{opportunity.thread_key}</span>
            <span>{t(`collab.reason.${opportunity.reason}` as OperatorMessageKey)}</span>
            <code className="cause-code">{opportunity.reason}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The whole read-only collaboration surface.
 *
 * Every panel below renders a field the server already decided. Nothing here
 * ranks, joins or infers; all panels are read-only.
 */
export function CollaborationPane({
  state,
  t,
}: {
  readonly state: CollaborationViewState;
  readonly t: OperatorTranslate;
}) {
  if (state.kind === 'idle') {
    return (
      <section className="detail-block collab-pane" aria-labelledby="collab-heading">
        <h3 className="detail-eyebrow" id="collab-heading">{t('collab.title')}</h3>
        <p className="detail-quiet">{t('collab.hint')}</p>
      </section>
    );
  }
  if (state.kind === 'loading') {
    return (
      <section className="detail-block collab-pane" aria-labelledby="collab-heading">
        <h3 className="detail-eyebrow" id="collab-heading">{t('collab.title')}</h3>
        <div className="operator-notice operator-notice--loading" role="status" aria-live="polite">
          <span className="operator-progress" aria-hidden="true" />
          <div><strong>{t('collab.loading')}</strong><span>{t('collab.scope', { repository: state.repository_id })}</span></div>
        </div>
      </section>
    );
  }
  if (state.kind === 'failed') {
    return (
      <section className="detail-block collab-pane" aria-labelledby="collab-heading">
        <h3 className="detail-eyebrow" id="collab-heading">{t('collab.title')}</h3>
        <div className="operator-notice operator-notice--danger" role="alert">
          <Icon name="alert" size={16} />
          <div>
            <strong>{t('collab.failedTitle')}</strong>
            <span><ApiErrorText error={state.error} t={t} /></span>
          </div>
        </div>
      </section>
    );
  }
  if (state.snapshot.exchange.status === 'unavailable') return (
    <section className="detail-block collab-pane"><h3>{t('collab.title')}</h3><p role="status">{t('org.sourceUnavailable')}</p></section>
  );
  const snapshot = state.snapshot.exchange.snapshot;
  return (
    <section className="detail-block collab-pane" aria-labelledby="collab-heading" data-collab-mode={snapshot.mode}>
      <h3 className="detail-eyebrow" id="collab-heading">{t('collab.title')}</h3>
      <div className="detail-chips">
        <Badge>{t('collab.scope', { repository: snapshot.repository_id })}</Badge>
        <Badge>{t('collab.mode')} {t(`collab.mode.${snapshot.mode}` as OperatorMessageKey)}</Badge>
        <Badge>{t('collab.readOnly')}</Badge>
      </div>
      <CollaborationConsistency snapshot={snapshot} t={t} />
      {snapshot.mode === 'off' && (
        <div className="detail-callout">
          <Icon name="flag" size={15} />
          <div><strong>{t('collab.modeOffTitle')}</strong><span>{t('collab.modeOffBody')}</span></div>
        </div>
      )}
      <CollaborationLanes snapshot={snapshot} t={t} />
      <CollaborationDiscoveries snapshot={snapshot} t={t} />
      <CollaborationHandoffs snapshot={snapshot} t={t} />
      <CollaborationContributors snapshot={snapshot} t={t} />
      <CollaborationOpportunities snapshot={snapshot} t={t} />
      <div className="detail-callout">
        <Icon name="flag" size={15} />
        <div><strong>{t('collab.offersTitle')}</strong><span>{t('collab.offersBody')}</span></div>
      </div>
      <dl className="detail-list">
        <div>
          <dt>{t('collab.sourceDigest')}</dt>
          <dd className="mono-value">{snapshot.source_snapshot_sha256}</dd>
        </div>
      </dl>
    </section>
  );
}

function DetailPane({
  snapshot,
  card,
  collaboration,
  revisionChangedFrom,
  evidenceGeneration,
  readTaskContext,
  readTaskActivity,
  onClose,
  onRefresh,
  t,
}: {
  readonly snapshot: OperatorFleetSnapshotV1 | null;
  readonly card: OperatorFleetCardV1;
  readonly collaboration: CollaborationViewState;
  readonly revisionChangedFrom: string | null;
  readonly evidenceGeneration: number;
  readonly readTaskContext?: TaskContextReader;
  readonly readTaskActivity?: TaskActivityReader;
  readonly onClose: () => void;
  readonly onRefresh: () => void;
  readonly t: OperatorTranslate;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const cardKey = taskKey(card);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (event.isComposing || event.keyCode === 229) return;
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
    // Task identity owns the focus lifecycle; resize and incidental
    // card replacement does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [cardKey]);

  const label = taskDisplayLabel(card);
  return (
    <>
      <button className="pane-scrim" type="button" tabIndex={-1} aria-label={t('detail.close')} onClick={onClose} />
      <aside
        ref={dialogRef}
        className="detail-pane"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-pane-title"
      >
        <div className="detail-pane__header">
          <div className="detail-pane__title">
            <p className="detail-eyebrow">{t('detail.taskDetail')}</p>
            <h2 id="detail-pane-title" className={!label.isLabel ? 'mono-value' : ''}>
              {label.text}
            </h2>
            {label.isLabel && <code className="detail-pane__id">{card.task_id.slice(0, 12)}</code>}
          </div>
          <div className="detail-pane__actions">
          <button type="button" className="operator-button operator-button--secondary" onClick={onRefresh}>{t('status.refresh')}</button>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label={t('detail.close')}>
              <Icon name="close" size={18} />
          </button>
          </div>
        </div>
        <div className="detail-pane__body">
          <TaskDetail card={card} revisionChangedFrom={revisionChangedFrom} t={t} />
          <TaskEvidence repositoryId={card.repository_id} taskId={card.task_id} revision={card.task_revision} generation={evidenceGeneration} readContext={readTaskContext} readActivity={readTaskActivity} t={t} />
          {snapshot && <TaskDiff key={JSON.stringify([snapshot.service_epoch, card.repository_id, card.task_id, card.task_revision, card.claim_id, card.generation])} card={card} t={t} />}
          {/* Below the task's own facts, never above them: collaboration is
              context for a decision the worklist already surfaced. */}
          <CollaborationPane state={collaboration} t={t} />
        </div>
      </aside>
    </>
  );
}

function EmptyFleet({ t }: { readonly t: OperatorTranslate }) {
  return (
    <section className="empty-state" aria-labelledby="empty-heading">
      <span className="empty-state__mascot"><DunkieMark height={72} /></span>
      <p className="detail-eyebrow">{t('empty.eyebrow')}</p>
      <h2 id="empty-heading">{t('empty.title')}</h2>
      <p>{t('empty.body')}</p>
      <code>repo-harness adopt --help</code>
    </section>
  );
}

function LoadingState({ t }: { readonly t: OperatorTranslate }) {
  return (
    <section className="loading-board" aria-label={t('loading.boardLabel')}>
      <span className="loading-board__mascot"><HookMark height={40} /></span>
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
      <p><ApiErrorText error={error} t={t} /></p>
      <button className="operator-button operator-button--secondary" type="button" onClick={onRetry}>{t('fatal.retry')}</button>
    </section>
  );
}

export const OPERATOR_REPOSITORY_STORAGE_KEY = 'repo-harness:operator-repository';

type Selection = NonNullable<TaskLocation['selection']>;

export function OperatorApp({
  initialState,
  initialSnapshot,
  fetchSnapshot = fetchOperatorSnapshot,
  fetchCollaboration = fetchOperatorCollaborationSnapshot,
  initialCollaboration,
  initialLocale,
  fetchRepositoryObservation,
  readTaskContext,
  readTaskActivity,
  readTaskHistory,
  readNotifyStatus,
  initialNotifyStatus,
  readPipelineBoard,
  initialPipelineBoard,
}: OperatorAppProps) {
  const initial = initialState ?? (initialSnapshot ? stateFromSnapshot(initialSnapshot) : { kind: 'loading', previous: null } as const);
  const [state, setState] = useState<OperatorSnapshotViewState>(initial);
  const [location, setLocation] = useState(() => parseTaskLocation(typeof window === 'undefined' ? '' : window.location.search));
  const [repositoryId, setRepositoryId] = useState<string | null>(() => {
    if (location.repositoryId !== null) return location.repositoryId;
    if (typeof window === 'undefined') return null;
    try { return localStorage.getItem(OPERATOR_REPOSITORY_STORAGE_KEY); } catch { return null; }
  });
  const [view, setView] = useState<ObservationView>('organization');
  const [selection, setSelection] = useState<Selection | null>(location.selection);
  const [collaboration, setCollaboration] = useState<CollaborationViewState>(
    initialCollaboration ?? { kind: 'idle' },
  );
  const [decisionPage, setDecisionPage] = useState<{ repositoryId: string; after: string | null } | null>(null);
  const [collaborationRefreshGeneration, setCollaborationRefreshGeneration] = useState(0);
  const { locale, setLocale, t } = useLocale(initialLocale);
  const stateRef = useRef<OperatorSnapshotViewState>(initial);
  const snapshot = snapshotForState(state);
  const activeRepositoryId = repositoryId ?? snapshot?.repositories[0]?.repository_id ?? '';
  const activeRepository = snapshot?.repositories.find((repo) => repo.repository_id === activeRepositoryId) ?? null;
  const visibleRepositories = useMemo(() => activeRepository ? [activeRepository] : [], [activeRepository]);
  useEffect(() => {
    if (!activeRepository) return;
    setRepositoryId(activeRepository.repository_id);
    try { localStorage.setItem(OPERATOR_REPOSITORY_STORAGE_KEY, activeRepository.repository_id); } catch { /* Browser storage is optional UI preference. */ }
  }, [activeRepository]);
  useEffect(() => {
    const restore = () => {
      const next = parseTaskLocation(window.location.search);
      setLocation(next); setRepositoryId(next.repositoryId); setSelection(next.selection);
      setCollaboration({kind:'idle'}); setDecisionPage(null);
    };
    window.addEventListener('popstate',restore);
    return () => window.removeEventListener('popstate',restore);
  }, []);
  const navigate = (id: string | null, next: Selection | null) => {
    const search=taskLocationSearch(id,next);
    window.history.pushState(null,'',window.location.pathname+search);
    setLocation({repositoryId:id,selection:next,invalid:false});
    setSelection(next);
  };
  const closeSelection = () => navigate(activeRepositoryId || null,null);
  const switchRepository = (id: string) => {
    if (id !== activeRepository?.repository_id) { setCollaboration({ kind: 'idle' }); setDecisionPage(null); }
    setRepositoryId(id);
    navigate(id,null);
  };
  const busy = state.kind === 'loading';
  const stateKind = state.kind;

  const readFleet = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const previous = snapshotForState(stateRef.current);
    const loading: OperatorSnapshotViewState = { kind: 'loading', previous };
    stateRef.current = loading;
    setState(loading);
    try {
      const nextSnapshot = await fetchSnapshot(signal);
      if (signal.aborted) return false;
      if (previous?.service_epoch === nextSnapshot.service_epoch && nextSnapshot.sequence < previous.sequence) throw OPERATOR_PAYLOAD_INVALID_ERROR;
      if (previous && previous.service_epoch !== nextSnapshot.service_epoch) {
        setCollaboration({ kind: 'idle' });
        setCollaborationRefreshGeneration(current => current + 1);
      }
      const nextState = stateFromSnapshot(nextSnapshot);
      stateRef.current = nextState; setState(nextState);
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      const apiError = asApiError(error);
      const nextState: OperatorSnapshotViewState = previous
        ? { kind: 'stale', snapshot: previous, error: apiError }
        : { kind: 'fatal', error: apiError };
      stateRef.current = nextState; setState(nextState);
      return false;
    }
  }, [fetchSnapshot]);
  const requestFleet = useObservationRefresh(readFleet, 'fleet', { immediate: !initialState && !initialSnapshot });
  const refresh = () => {
    // Explicit refresh still supersedes scoped observations and returns the
    // Decision inventory to page one. Automatic reads preserve the current page.
    setDecisionPage(null);
    setCollaboration({ kind: 'idle' });
    setCollaborationRefreshGeneration(current => current + 1);
    requestFleet();
  };

  const selectedCard = selection && !selection.historical && snapshot
    ? activeRepository?.cards.find((card) => taskKey(card) === selection.key) ?? null
    : null;
  // A current URL carries no revision, so the first snapshot that resolves the
  // selection supplies the comparison baseline. Capturing it into the selection
  // puts URL-opened and restored panes under the same changed-definition
  // warning as clicked cards; later snapshots never move a stored baseline.
  useEffect(() => {
    if (!selection || selection.historical || selection.revision !== null || !selectedCard) return;
    const baseline = selectedCard.task_revision;
    setSelection((current) => current !== null && !current.historical && current.revision === null
      && current.key === selection.key
      ? { ...current, revision: baseline }
      : current);
  }, [selection, selectedCard]);
  const revisionChangedFrom = selectedCard && selection && selectedCard.task_revision !== selection.revision
    ? selection.revision
    : null;
  const collaborationRepositoryId = activeRepository?.repository_id ?? null;
  const decisionAfter = decisionPage?.repositoryId === collaborationRepositoryId ? decisionPage.after : null;
  const changeDecisionPage = (after: string | null) => {
    if (!collaborationRepositoryId) return;
    setCollaboration({ kind: 'idle' });
    setDecisionPage({ repositoryId: collaborationRepositoryId, after });
  };

  // One observation belongs to the selected repository; task selection shares it.
  const readCollaboration = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    if (collaborationRepositoryId === null) return false;
    setCollaboration({ kind: 'loading', repository_id: collaborationRepositoryId });
    try {
      const next = await fetchCollaboration(collaborationRepositoryId, signal, decisionAfter);
      if (signal.aborted) return false;
      setCollaboration({kind:'ready',snapshot:assertCollaborationRepository(decodeOperatorCollaborationSnapshot(next),collaborationRepositoryId,decisionAfter)});
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      setCollaboration({kind:'failed',repository_id:collaborationRepositoryId,error:asApiError(error,COLLABORATION_UNAVAILABLE_ERROR)});
      return false;
    }
  }, [collaborationRepositoryId,decisionAfter,fetchCollaboration]);
  useObservationRefresh(readCollaboration, JSON.stringify([collaborationRepositoryId,decisionAfter,collaborationRefreshGeneration]), {
    enabled: !initialCollaboration && collaborationRepositoryId !== null,
  });
  const selectCard = (card: OperatorFleetCardV1) => navigate(card.repository_id,{ key: taskKey(card), taskId: card.task_id, revision: card.task_revision, historical: false });

  return (
    <div
      className={`operator-app${selectedCard ? ' has-selection' : ''}`}
      data-state={stateKind}
      data-locale={locale}
      lang={locale === 'zh' ? 'zh' : 'en'}
    >
      <StatusBar
        snapshot={snapshot}
        repositoryId={activeRepository?.repository_id ?? ''}
        onRepository={switchRepository}
        stale={stateKind === 'stale'}
        busy={busy}
        locale={locale}
        onLocale={setLocale}
        onRefresh={() => void refresh()}
        t={t}
      />
      <div className="operator-main">
        <main className="operator-content">
          {location.invalid && <p role="alert">{t('history.invalidLink')}</p>}
          {selection && (selection.historical || (snapshot !== null && !selectedCard)) && <TaskHistory
            repositoryId={activeRepositoryId} taskId={selection.taskId} revision={selection.revision}
            generation={collaborationRefreshGeneration} read={readTaskHistory} onClose={closeSelection} t={t} />}

          {activeRepository && <ObservationTabs view={view} onChange={setView} t={t} />}
          <div role="tabpanel" id="view-panel-organization" aria-labelledby="view-tab-organization" hidden={activeRepository !== null && view !== 'organization'}>
          {activeRepository && <AutomationSummary
            repositoryId={activeRepository.repository_id}
            refreshGeneration={collaborationRefreshGeneration}
            readObservation={fetchRepositoryObservation}
            t={t}
          />}
          {activeRepository && <DecisionSummary state={collaboration} repositoryId={activeRepository.repository_id} after={decisionAfter} onPage={changeDecisionPage} t={t} />}
          {activeRepository && <OrganizationSummary state={collaboration} repositoryId={activeRepository.repository_id} t={t} />}
          <NotifyStatusPanel readStatus={readNotifyStatus} initialStatus={initialNotifyStatus} t={t} />
          <PipelineBoardPanel readBoard={readPipelineBoard} initialBoard={initialPipelineBoard} t={t} />
          <SnapshotNotice state={state} onRetry={() => void refresh()} t={t} />
          {state.kind === 'loading' && state.previous === null ? <LoadingState t={t} />
            : state.kind === 'fatal' ? <FatalState error={state.error} onRetry={() => void refresh()} t={t} />
              : snapshot ? (
                snapshotViewKind(snapshot) === 'empty'
                  ? <EmptyFleet t={t} />
                  : !activeRepository ? <p role="status">{t('repository.select')}</p>
                  : <Worklist
                    key={activeRepository.repository_id}
                    snapshot={{ repositories: visibleRepositories }}
                    selectedKey={selection?.key ?? null}
                    onSelect={selectCard}
                    t={t}
                  />
              ) : null}
          </div>
          <div role="tabpanel" id="view-panel-planning" aria-labelledby="view-tab-planning" hidden={view !== 'planning'}>
            {view === 'planning' && activeRepository && <PlanningView state={collaboration} repositoryId={activeRepository.repository_id} cards={activeRepository.cards} onSelect={selectCard} t={t} />}
          </div>
          <div role="tabpanel" id="view-panel-delivery" aria-labelledby="view-tab-delivery" hidden={view !== 'delivery'}>
            {view === 'delivery' && activeRepository && <DeliveryView repository={activeRepository} selectedKey={selection?.key ?? null} onSelect={selectCard} t={t} />}
          </div>
          {view !== 'organization' && <SnapshotNotice state={state} onRetry={() => void refresh()} t={t} />}
          {activeRepository && <details className="repository-overview">
            <summary>{t('detail.overviewTitle')}</summary>
            <StageMatrix snapshot={{ repositories: visibleRepositories }} t={t} />
            <section aria-label={t('detail.repositoryHealth')}>
              <h3>{t('detail.repositoryHealth')}</h3>
              <RepositoryHealth snapshot={{ repositories: visibleRepositories }} t={t} />
            </section>
            {!selectedCard && <CollaborationPane state={collaboration} t={t} />}
          </details>}
        </main>
        {selectedCard && state.kind !== 'fatal' && (
          <DetailPane
            key={activeRepository?.repository_id ?? 'none'}
            snapshot={snapshot}
            card={selectedCard}
            collaboration={collaboration}
            revisionChangedFrom={revisionChangedFrom}
            evidenceGeneration={collaborationRefreshGeneration}
            readTaskContext={readTaskContext}
            readTaskActivity={readTaskActivity}
            onClose={closeSelection}
            onRefresh={() => void refresh()}
            t={t}
          />
        )}
      </div>
      <footer className="operator-footer">
        <span className="operator-footer__mascots">
          <DunkieMark height={20} />
          <HookMark height={20} />
        </span>
        <span>repo-harness operator</span>
        {/* Without an observed snapshot there is no protocol to report; the
            constant this bundle compiled against is not one. */}
        <span>{t('footer.protocol', { protocol: snapshot?.protocol ?? '—', sequence: snapshot?.sequence ?? '—' })}</span>
        <span className="operator-footer__right">read-only</span>
      </footer>
    </div>
  );
}

export { DEFAULT_OPERATOR_LOCALE, fetchOperatorCollaborationSnapshot, fetchOperatorSnapshot };
