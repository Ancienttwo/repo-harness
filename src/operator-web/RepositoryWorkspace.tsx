import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge, Banner, Button, Empty, Loader, cn } from '@cloudflare/kumo';
import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  FlagIcon,
  TrayIcon,
  WarningIcon,
  XIcon,
} from '@phosphor-icons/react';
import { AutomationSummary, type RepositoryObservationReader } from './AutomationSummary';
import { DrawerFrame, useModalFocus } from './Drawer';
import { localizeApiError } from './fleet-api';
import { relativeAge, type OperatorMessageKey, type OperatorTranslate } from './i18n';
import { DecisionSummary, OrganizationSummary } from './OrganizationSummary';
import { PlanningView } from './PlanningView';
import { TaskDiff } from './TaskDiff';
import { TaskEvidence, type TaskActivityReader, type TaskContextReader } from './TaskEvidence';
import { TaskHistory, type TaskHistoryReader } from './TaskHistory';
import type { TaskLocation } from './task-location';
import {
  OPERATOR_COLUMNS,
  snapshotViewKind,
  type OperatorApiErrorV1,
  type OperatorCollaborationSnapshotV4,
  type OperatorCollaborationSource,
  type OperatorFleetCardV1,
  type OperatorFleetErrorV1,
  type OperatorFleetRepositoryV1,
  type OperatorFleetSnapshotV1,
  type OperatorSnapshotViewState,
  type OperatorWorkExchangeSnapshot,
} from './types';
import { Age, CopyButton, StatusDot, type DotTone } from './ui';
import {
  cardBlockers,
  defaultCollapsedGroups,
  groupWorklist,
  primaryCause,
  taskDisplayLabel,
  taskKey,
  type MergeBlocker,
  type WorklistCause,
  type WorklistGroupId,
} from './worklist';

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

export function snapshotForState(state: OperatorSnapshotViewState): OperatorFleetSnapshotV1 | null {
  if (state.kind === 'loading') return state.previous;
  if (state.kind === 'fatal') return null;
  return state.snapshot;
}

export function staleErrorForState(state: OperatorSnapshotViewState): OperatorApiErrorV1 | null {
  if (state.kind === 'stale') return state.error;
  return state.kind === 'loading' ? state.staleError ?? null : null;
}

type BlockerOwner = MergeBlocker['attention_owner'];

function stageKey(placement: OperatorFleetCardV1['placement']): OperatorMessageKey {
  return `stage.${placement.kind === 'column' ? placement.column : placement.kind}` as OperatorMessageKey;
}

function attentionKey(owner: OperatorFleetCardV1['attention_owner']): OperatorMessageKey {
  return `attention.${owner}` as OperatorMessageKey;
}

function blockerKey(code: MergeBlocker['code']): OperatorMessageKey {
  return `blocker.${code}` as OperatorMessageKey;
}

function attentionTone(owner: BlockerOwner | OperatorFleetCardV1['attention_owner']): string {
  return owner === 'user' ? 'tone-user' : owner === 'agent' ? 'tone-agent' : owner === 'external' ? 'tone-external' : 'tone-neutral';
}

const BADGE_VARIANT: Readonly<Record<string, 'warning' | 'info' | 'purple' | 'error' | 'neutral' | 'success'>> = {
  'tone-user': 'warning', 'tone-agent': 'info', 'tone-external': 'purple', 'tone-danger': 'error', 'tone-neutral': 'neutral', 'tone-ok': 'success',
};

/** A Kumo badge that keeps the tone class as a stable hook for the closed attention vocabulary. */
function ToneBadge({ children, tone = 'tone-neutral' }: { readonly children: ReactNode; readonly tone?: string }) {
  return <Badge variant={BADGE_VARIANT[tone] ?? 'neutral'} className={`operator-badge ${tone}`}>{children}</Badge>;
}

export function ApiErrorText({ error, t }: { readonly error: OperatorApiErrorV1; readonly t: OperatorTranslate }) {
  const localized = localizeApiError(error, t);
  return (
    <>
      {localized.message} {localized.next_action}
      {!localized.localized && <> ({t('error.untranslated')})</>}
    </>
  );
}

function CopyValue({ label, value, t }: { readonly label: string; readonly value: string | null; readonly t: OperatorTranslate }) {
  return (
    <div className="copy-value">
      <code>{value ?? t('copy.missing', { label })}</code>
      {value && <CopyButton label={label} value={value} t={t} />}
    </div>
  );
}

/** Selects the Fleet repository a page reads. Duplicate names carry their id so two rows never look the same. */
export function RepositorySwitch({ snapshot, repositoryId, onRepository, t }: {
  readonly snapshot: OperatorFleetSnapshotV1 | null;
  readonly repositoryId: string;
  readonly onRepository: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  return (
    <label className="repository-switch flex min-w-0 items-center gap-2 text-sm text-kumo-subtle">
      <span className="shrink-0">{t('field.repository')}</span>
      <select
        className="h-8 min-w-0 max-w-full flex-1 rounded-md border border-kumo-line bg-kumo-base px-2 text-sm text-kumo-default focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none sm:w-64 sm:flex-none"
        aria-label={t('repository.select')}
        value={repositoryId}
        onChange={(event) => onRepository(event.target.value)}
        disabled={!snapshot?.repositories.length}
      >
        <option value="" disabled>{t('repository.select')}</option>
        {snapshot?.repositories.map((repo) => (
          <option key={repo.repository_id} value={repo.repository_id}>
            {repo.display_name}{snapshot.repositories.filter((other) => other.display_name === repo.display_name).length > 1 ? ` · ${repo.repository_id}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The Fleet read facts that belong to this page: age, sequence, consistency and repository counts. */
function FleetFacts({ snapshot, stale, now, t }: {
  readonly snapshot: OperatorFleetSnapshotV1 | null; readonly stale: boolean; readonly now: number; readonly t: OperatorTranslate;
}) {
  const consistency = snapshot?.snapshot_consistency ?? 'degraded';
  const unreadable = snapshot?.counts.unreadable ?? 0;
  const tone: DotTone = consistency === 'stable' ? 'ok' : consistency === 'degraded' ? 'danger' : 'warn';
  return (
    <div role="group" className="operator-statusbar flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-kumo-subtle" aria-label={t('status.fleetFacts')}>
      <span className={cn('statusbar-fact statusbar-fact--age font-mono', stale && 'is-stale font-medium text-kumo-danger')} data-fact="age">
        {snapshot ? <Age at={snapshot.observed_at} now={now} t={t} /> : t('status.observedUnknown')}
        {stale ? ` · ${t('status.stale')}` : ''}
      </span>
      <span className="statusbar-fact" data-fact="sequence">
        {t('status.sequence')} <strong className="font-mono font-medium text-kumo-default">{snapshot?.sequence ?? '—'}</strong>
      </span>
      <span className="statusbar-fact inline-flex items-center gap-1.5" data-fact="consistency">
        <StatusDot tone={tone} />
        {t('status.consistency')} <strong className="font-medium text-kumo-default">{t(`status.consistency.${consistency}` as OperatorMessageKey)}</strong>
      </span>
      <span className="statusbar-fact" data-fact="repositories">
        {t('status.repositories', { count: snapshot?.repositories.length ?? 0 })}
        {unreadable > 0 ? ` · ${t('status.unreadable', { count: unreadable })}` : ''}
      </span>
    </div>
  );
}

/** Retained Fleet facts after a failed read. The task pane omits Retry: its header already refreshes. */
function FleetStaleNotice({ error, onRetry, t }: { readonly error: OperatorApiErrorV1; readonly onRetry?: () => void; readonly t: OperatorTranslate }) {
  return (
    <div className="operator-notice operator-notice--danger" role="alert">
      <Banner
        variant="error"
        icon={<WarningIcon />}
        title={t('notice.staleTitle')}
        description={<ApiErrorText error={error} t={t} />}
        action={onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>{t('notice.retry')}</Button>}
      />
    </div>
  );
}

function SnapshotNotice({ state, onRetry, t }: {
  readonly state: OperatorSnapshotViewState;
  readonly onRetry: () => void;
  readonly t: OperatorTranslate;
}) {
  if (state.kind === 'loading' && state.previous === null) {
    return (
      <div className="operator-notice operator-notice--loading" role="status" aria-live="polite">
        <Banner variant="secondary" icon={<Loader size={14} />} title={t('notice.loadingTitle')} description={t('notice.loadingBody')} />
      </div>
    );
  }
  const staleError = staleErrorForState(state);
  if (staleError) return <FleetStaleNotice error={staleError} onRetry={onRetry} t={t} />;
  if (state.kind === 'changed-during-read' || state.kind === 'repo-degraded') {
    const prefix = state.kind === 'changed-during-read' ? 'notice.changed' : 'notice.degraded';
    return (
      <div className="operator-notice operator-notice--warning" role="status" aria-live="polite">
        <Banner variant="alert" icon={<WarningIcon />} title={t(`${prefix}Title` as OperatorMessageKey)} description={t(`${prefix}Body` as OperatorMessageKey)} />
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
        <WarningIcon size={13} />
        <span className="cause-owner">{t(attentionKey(cause.blocker.attention_owner))}</span>
        <span className="cause-text">{t(cause.kind === 'readiness' ? `readinessBlocker.${cause.blocker.code}` as OperatorMessageKey : blockerKey(cause.blocker.code))}</span>
        <code className="cause-code">{cause.blocker.code}</code>
      </span>
    );
  }
  if (cause.kind === 'no_progress') {
    return (
      <span className="worklist-row__cause tone-agent">
        <FlagIcon size={13} />
        <span className="cause-text">{t('row.noProgress')}</span>
      </span>
    );
  }
  return (
    <span className="worklist-row__cause tone-neutral">
      <TrayIcon size={13} />
      <span className="cause-text">{t('row.unread', { count: cause.count })}</span>
    </span>
  );
}

function RuntimeExceptionBadges({ card, t }: { readonly card: OperatorFleetCardV1; readonly t: OperatorTranslate }) {
  return (
    <>
      {card.inbox.runtime_reachability === 'unavailable' && (
        <ToneBadge tone="tone-danger">{t('runtime.unavailable')}</ToneBadge>
      )}
      {(card.inbox.delivery_state === 'failed' || card.inbox.delivery_state === 'reconciliation_required') && (
        <ToneBadge tone="tone-danger">{t(`delivery.${card.inbox.delivery_state}` as OperatorMessageKey)}</ToneBadge>
      )}
    </>
  );
}

function WorklistRow({ card, selected, onSelect, t }: {
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
      className={cn('worklist-row', selected && 'is-selected')}
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(card)}
    >
      <span className="worklist-row__head">
        <span className={cn('worklist-row__label', !label.isLabel && 'worklist-row__label--id')}>{label.text}</span>
        {card.attention_owner !== 'none' && (
          <ToneBadge tone={attentionTone(card.attention_owner)}>{t('attention.owned', { owner: t(attentionKey(card.attention_owner)) })}</ToneBadge>
        )}
        <RuntimeExceptionBadges card={card} t={t} />
      </span>
      <span className="worklist-row__meta">
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

function repositoryErrorMessage(error: NonNullable<OperatorFleetRepositoryV1['error']>, t: OperatorTranslate): string {
  return t(REPOSITORY_ERROR_KEYS[error.code]);
}

function UnreadableRepositoryRow({ repository, t }: { readonly repository: OperatorFleetRepositoryV1; readonly t: OperatorTranslate }) {
  return (
    <div className="worklist-row worklist-row--repository" role="group" aria-label={repository.repository_id}>
      <span className="worklist-row__head">
        <span className="worklist-row__label">{repository.display_name === repository.repository_id ? repository.repository_id : `${repository.display_name} · ${repository.repository_id}`}</span>
        <ToneBadge tone="tone-danger">{t('repo.status.unreadable')}</ToneBadge>
      </span>
      {repository.error && (
        <span className="worklist-row__cause tone-danger">
          <WarningIcon size={13} />
          <span className="cause-text">{repositoryErrorMessage(repository.error, t)}</span>
          <code className="cause-code">{repository.error.code}</code>
        </span>
      )}
    </div>
  );
}

function Worklist({ snapshot, selectedKey, onSelect, t }: {
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
  const chip = (active: boolean) => cn(
    'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
    active ? 'border-kumo-contrast bg-kumo-contrast text-kumo-inverse' : 'border-kumo-line bg-kumo-base text-kumo-strong hover:bg-kumo-tint',
  );

  return (
    <section className="worklist flex flex-col gap-3" id="worklist" aria-labelledby="worklist-heading">
      <h2 id="worklist-heading" className="text-base font-semibold text-kumo-strong">{t('worklist.title')}</h2>
      <div className="worklist__filters flex flex-wrap gap-1.5" role="group" aria-label={t('worklist.filters')}>
        <button type="button" aria-pressed={filter === 'all'} className={chip(filter === 'all')} onClick={() => setFilter('all')}>
          {t('worklist.filterAll')}<span className="tabular-nums opacity-70">{cardTotal}</span>
        </button>
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            aria-pressed={filter === group.id}
            className={chip(filter === group.id)}
            onClick={() => {
              setFilter(group.id);
              // Choosing a group filter is also an explicit request to see
              // that group's rows; keep it open when a later snapshot arrives.
              setGroupOverrides((current) => ({ ...current, [group.id]: false }));
            }}
          >
            {t(`group.${group.id}` as OperatorMessageKey)}<span className="tabular-nums opacity-70">{group.count}</span>
          </button>
        ))}
      </div>
      {cardTotal + repositoryTotal === 0 ? (
        <div className="empty-inline flex items-center gap-2 rounded-lg border border-dashed border-kumo-line px-4 py-6 text-sm text-kumo-subtle">
          <CheckCircleIcon size={16} /><span>{t('worklist.empty')}</span>
        </div>
      ) : (
        <div className="worklist__groups flex flex-col gap-2">
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
                  {open ? <CaretDownIcon size={14} /> : <CaretRightIcon size={14} />}
                  <strong id={`group-${group.id}`}>{groupLabel}</strong>
                  <span className="worklist-group__count">{group.count}</span>
                </button>
                {open && (
                  <div className="worklist-group__rows">
                    {group.repositories.map((repository) => (
                      <UnreadableRepositoryRow key={repository.repository_id} repository={repository} t={t} />
                    ))}
                    {group.cards.map((card) => (
                      <WorklistRow key={taskKey(card)} card={card} selected={taskKey(card) === selectedKey} onSelect={onSelect} t={t} />
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

export type ObservationView = 'planning' | 'delivery' | 'organization';
const OBSERVATION_VIEWS: readonly ObservationView[] = ['planning', 'delivery', 'organization'];

function ObservationTabs({ view, onChange, t }: { readonly view: ObservationView; readonly onChange: (view: ObservationView) => void; readonly t: OperatorTranslate }) {
  return (
    <div className="observation-tabs inline-flex w-full max-w-full gap-0.5 overflow-x-auto rounded-lg bg-kumo-recessed p-0.5 sm:w-auto" role="tablist" aria-label={t('view.label')}>
      {OBSERVATION_VIEWS.map((item, index) => (
        <button
          key={item} type="button" role="tab" id={`view-tab-${item}`} aria-controls={`view-panel-${item}`} aria-selected={view === item} tabIndex={view === item ? 0 : -1}
          className={cn('h-8 flex-1 cursor-pointer whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none sm:flex-none',
            view === item ? 'bg-kumo-base text-kumo-strong shadow-xs' : 'text-kumo-subtle hover:text-kumo-default')}
          onClick={() => onChange(item)}
          onKeyDown={event => {
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? OBSERVATION_VIEWS.length - 1
              : event.key === 'ArrowRight' ? (index + 1) % OBSERVATION_VIEWS.length : event.key === 'ArrowLeft' ? (index + OBSERVATION_VIEWS.length - 1) % OBSERVATION_VIEWS.length : null;
            if (next === null) return;
            event.preventDefault(); onChange(OBSERVATION_VIEWS[next]!);
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
          }}
        >{t(`view.${item}`)}</button>
      ))}
    </div>
  );
}

function DeliveryView({ repository, selectedKey, onSelect, t }: {
  readonly repository: OperatorFleetRepositoryV1;
  readonly selectedKey: string | null;
  readonly onSelect: (card: OperatorFleetCardV1) => void;
  readonly t: OperatorTranslate;
}) {
  const cards = repository.cards;
  const group = (id: string, label: string, rows: readonly OperatorFleetCardV1[]) => (
    <section className="delivery-stage" key={id} data-delivery-stage={id} aria-labelledby={`delivery-${id}`}>
      <h3 id={`delivery-${id}`}>{label} <span>{rows.length}</span></h3>
      {rows.length === 0 ? <p>{t('delivery.empty')}</p> : rows.map(card => <WorklistRow key={taskKey(card)} card={card} selected={selectedKey === taskKey(card)} onSelect={onSelect} t={t} />)}
    </section>
  );
  return (
    <section className="delivery-view" aria-labelledby="delivery-heading">
      <h2 id="delivery-heading" className="sr-only">{t('view.delivery')}</h2>
      {repository.status === 'unreadable' ? <UnreadableRepositoryRow repository={repository} t={t} /> : <>
        <div className="delivery-columns">{OPERATOR_COLUMNS.map(column => group(column.id, t(stageKey({ kind: 'column', column: column.id })), cards.filter(card => card.task_state !== 'missing' && card.placement.kind === 'column' && card.placement.column === column.id)))}</div>
        <div className="delivery-other">{(['preparation', 'alternate_workflow', 'unclassified'] as const).map(kind => group(kind, t(`stage.${kind}`), cards.filter(card => card.task_state !== 'missing' && card.placement.kind === kind)))}
          {group('isolated', t('repo.isolatedHeading'), cards.filter(card => card.task_state === 'missing'))}
        </div>
      </>}
    </section>
  );
}

function StageMatrix({ snapshot, t }: { readonly snapshot: Pick<OperatorFleetSnapshotV1, 'repositories'>; readonly t: OperatorTranslate }) {
  const count = (repository: OperatorFleetRepositoryV1, match: (card: OperatorFleetCardV1) => boolean) =>
    repository.status === 'unreadable' ? '—' : repository.cards.filter(match).length;
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
              {(['preparation', 'alternate_workflow'] as const).map(kind => <td key={kind}>{count(repository, card => card.task_state !== 'missing' && card.placement.kind === kind)}</td>)}
              {OPERATOR_COLUMNS.map((column) => (
                <td key={column.id}>{count(repository, card => card.task_state !== 'missing' && card.placement.kind === 'column' && card.placement.column === column.id)}</td>
              ))}
              <td>{count(repository, card => card.task_state !== 'missing' && card.placement.kind === 'unclassified')}</td>
              <td>{count(repository, card => card.task_state === 'missing')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RepositoryHealth({ snapshot, t }: { readonly snapshot: Pick<OperatorFleetSnapshotV1, 'repositories'>; readonly t: OperatorTranslate }) {
  return (
    <div className="repository-list">
      {snapshot.repositories.map((repository) => {
        const repoStatus: DotTone = repository.status === 'unreadable' ? 'danger' : repository.snapshot_consistency === 'stable' ? 'ok' : 'warn';
        const tasks = repository.cards.filter(card => card.task_state !== 'missing').length;
        const isolated = repository.cards.filter(card => card.task_state === 'missing').length;
        return (
          <article className={`repository-row repository-row--${repoStatus}`} key={repository.repository_id}>
            <div className="repository-row__main">
              <strong>{repository.display_name}</strong>
              <span>
                {t(`repo.accessMode.${repository.access_mode}` as OperatorMessageKey)} · {repository.status === 'unreadable' ? t('repo.tasksUnknown') : t('repo.tasks', { count: tasks })}
                {isolated > 0 && <> · {t('repo.isolated', { count: isolated })}</>}
              </span>
            </div>
            <span className="repository-row__state">
              <StatusDot tone={repoStatus} />
              {repository.status === 'unreadable' ? t('repo.status.unreadable') : t(`status.consistency.${repository.snapshot_consistency}` as OperatorMessageKey)}
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
          <FlagIcon size={15} />
          <div>
            <strong>{t('detail.noProgressTitle')}</strong>
            <span>{t('detail.noProgressBody')}</span>
            {card.feedback.repair_actions.length > 0 && (
              <>
                <span className="detail-repair-title">{t('detail.repairTitle')}</span>
                <ul className="repair-list">
                  {card.feedback.repair_actions.map((action) => (
                    <li key={action}>{t(`repair.${action}` as OperatorMessageKey)} <code className="cause-code">{action}</code></li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
      {card.inbox.unread_count > 0 && (
        <div className="detail-callout">
          <TrayIcon size={15} />
          <div><strong>{t('row.unread', { count: card.inbox.unread_count })}</strong></div>
        </div>
      )}
    </section>
  );
}

function TaskDetail({ card, revisionChangedFrom, t }: {
  readonly card: OperatorFleetCardV1;
  readonly revisionChangedFrom: string | null;
  readonly t: OperatorTranslate;
}) {
  const evidence = card.inbox.delivery_evidence;
  const observation = evidence?.latest ?? null;
  const observationAge = observation === null ? null : relativeAge(observation.observed_at, Date.now());
  const terminalNotice = observation?.effect_state === 'stopped' || observation?.effect_state === 'superseded';
  return (
    <>
      {revisionChangedFrom && (
        <div className="detail-callout detail-callout--warning" role="status">
          <WarningIcon size={15} />
          <div>
            <strong>{t('detail.revisionChanged')}</strong>
            <span>{t('detail.revisionChangedBody', { previous: revisionChangedFrom, current: card.task_revision })}</span>
          </div>
        </div>
      )}
      <div className="detail-chips">
        <ToneBadge tone={attentionTone(card.attention_owner)}>
          {card.attention_owner === 'none' ? t('attention.none') : t('attention.owned', { owner: t(attentionKey(card.attention_owner)) })}
        </ToneBadge>
        <ToneBadge>{t(stageKey(card.placement))}</ToneBadge>
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
          <div><dt>{t('field.repository')}</dt><dd className="mono-value">{card.repository_id}</dd></div>
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
          <div><dt>{t('field.runtimeReachability')}</dt><dd>{t(`runtime.${card.inbox.runtime_reachability}` as OperatorMessageKey)}</dd></div>
          <div><dt>{t('field.failureClass')}</dt><dd className="mono-value">{card.inbox.failure_class ?? t('field.none')}</dd></div>
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
          <WarningIcon size={15} />
          <div><strong>{t('detail.changedDuringRead')}</strong></div>
        </div>
      )}
    </>
  );
}

function sourceList(sources: readonly OperatorCollaborationSource[], t: OperatorTranslate): string {
  return sources.map((source) => t(`collab.source.${source}` as OperatorMessageKey)).join(', ');
}

/**
 * The consistency banner. `degraded` and `changed_during_read` are stated with
 * the sources that produced them; a quiet panel is never an acceptable
 * rendering of either.
 */
function CollaborationConsistency({ snapshot, t }: { readonly snapshot: OperatorWorkExchangeSnapshot; readonly t: OperatorTranslate }) {
  if (snapshot.snapshot_consistency === 'degraded') {
    return (
      <div className="operator-notice operator-notice--danger" role="alert">
        <Banner variant="error" icon={<WarningIcon />} title={t('collab.degradedTitle')} description={t('collab.degradedBody', { sources: sourceList(snapshot.degraded_sources, t) })} />
      </div>
    );
  }
  if (snapshot.snapshot_consistency === 'changed_during_read') {
    return (
      <div className="operator-notice operator-notice--warning" role="status" aria-live="polite">
        <Banner variant="alert" icon={<WarningIcon />} title={t('collab.changedTitle')} description={t('collab.changedBody', { sources: sourceList(snapshot.changed_sources, t) })} />
      </div>
    );
  }
  return null;
}

function CollaborationLanes({ snapshot, t }: { readonly snapshot: OperatorWorkExchangeSnapshot; readonly t: OperatorTranslate }) {
  return (
    <section className="detail-block" aria-labelledby="collab-lanes-heading">
      <h3 className="detail-eyebrow" id="collab-lanes-heading">{t('collab.lanes')}</h3>
      {snapshot.threads.length === 0 ? <p className="detail-quiet">{t('collab.lanesEmpty')}</p> : (
        <ul className="collab-list">
          {snapshot.threads.map((thread) => (
            <li className="collab-lane" key={thread.thread_key}>
              <span className="collab-lane__head">
                <strong className="collab-lane__key">{thread.thread_key}</strong>
                <ToneBadge>{t('collab.laneHotspot', { score: thread.hotspot_score })}</ToneBadge>
              </span>
              <span className="collab-meta">
                <span>{t('collab.laneSignals', { count: thread.signal_count })}</span>
                <span>{t('collab.laneContributors', { count: thread.distinct_contributor_count })}</span>
                <span>{t('collab.laneArtifacts', { count: thread.artifact_ref_count })}</span>
                {thread.unadopted_handoff_count > 0 && <span>{t('collab.laneUnadopted', { count: thread.unadopted_handoff_count })}</span>}
                {thread.adoption_count > 0 && <span>{t('collab.laneAdopted', { count: thread.adoption_count })}</span>}
                {thread.cross_thread_reference_count > 0 && <span>{t('collab.laneCrossRefs', { count: thread.cross_thread_reference_count })}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CollaborationDiscoveries({ snapshot, t }: { readonly snapshot: OperatorWorkExchangeSnapshot; readonly t: OperatorTranslate }) {
  return (
    <section className="detail-block" aria-labelledby="collab-signals-heading">
      <h3 className="detail-eyebrow" id="collab-signals-heading">{t('collab.discoveries')}</h3>
      {snapshot.signals.length === 0 ? <p className="detail-quiet">{t('collab.discoveriesEmpty')}</p> : (
        <ul className="collab-list">
          {snapshot.signals.map((signal) => (
            <li className={cn('collab-signal', signal.superseded && 'is-superseded')} key={signal.signal_id}>
              <span className="collab-signal__title">{signal.title}</span>
              <span className="collab-meta">
                <span className="collab-lane__key">{signal.thread_key}</span>
                <span className="mono-value">{signal.actor_lineage}</span>
                {signal.artifact_ref_count > 0 && <span>{t('collab.signalArtifacts', { count: signal.artifact_ref_count })}</span>}
                {signal.superseded && <span className="collab-flag">{t('collab.superseded')}</span>}
              </span>
              {signal.labels.length > 0 && (
                <span className="collab-labels">{signal.labels.map((label) => <code className="cause-code" key={label}>{label}</code>)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CollaborationHandoffs({ snapshot, t }: { readonly snapshot: OperatorWorkExchangeSnapshot; readonly t: OperatorTranslate }) {
  return (
    <section className="detail-block" aria-labelledby="collab-handoffs-heading">
      <h3 className="detail-eyebrow" id="collab-handoffs-heading">{t('collab.handoffs')}</h3>
      {snapshot.handoffs.length === 0 ? <p className="detail-quiet">{t('collab.handoffsEmpty')}</p> : (
        <ul className="collab-list">
          {snapshot.handoffs.map((handoff) => (
            <li className="collab-handoff" key={handoff.handoff_id}>
              <span className="collab-handoff__head">
                <strong>{handoff.goal}</strong>
                <ToneBadge>{t('collab.handoffAdoptions', { count: handoff.adoption_count })}</ToneBadge>
              </span>
              <span className="collab-meta">
                <span className="collab-lane__key">{handoff.thread_key}</span>
                <span>{t('collab.handoffTrigger', { trigger: handoff.trigger })}</span>
                <span>{t('collab.handoffNextActions', { count: handoff.next_action_count })}</span>
                <span>{t('collab.handoffHypotheses', { count: handoff.open_hypothesis_count })}</span>
              </span>
              <span className={cn('collab-context', handoff.execution_context_kind === null && 'is-withheld')}>
                {handoff.execution_context_kind === null ? t('collab.contextWithheld') : t(`collab.context.${handoff.execution_context_kind}` as OperatorMessageKey)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {snapshot.unverified_execution_context_count > 0 && (
        <div className="detail-callout detail-callout--warning">
          <WarningIcon size={15} />
          <div>
            <strong>{t('collab.unverified', { count: snapshot.unverified_execution_context_count })}</strong>
            <span>{t('collab.unverifiedBody')}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function CollaborationContributors({ snapshot, t }: { readonly snapshot: OperatorWorkExchangeSnapshot; readonly t: OperatorTranslate }) {
  return (
    <section className="detail-block" aria-labelledby="collab-contributors-heading">
      <h3 className="detail-eyebrow" id="collab-contributors-heading">{t('collab.contributors')}</h3>
      {snapshot.participants.length === 0 ? <p className="detail-quiet">{t('collab.contributorsEmpty')}</p> : (
        <ul className="collab-list">
          {snapshot.participants.map((participant) => (
            <li className="collab-contributor" key={participant.actor_lineage}>
              <span className="collab-contributor__head">
                <span className="mono-value">{participant.actor_lineage}</span>
                <ToneBadge>{t(`collab.actor.${participant.actor_kind}` as OperatorMessageKey)}</ToneBadge>
              </span>
              <span className="collab-meta">
                {t('collab.contributorCounts', { signals: participant.signal_count, handoffs: participant.handoff_count, lanes: participant.thread_keys.length })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CollaborationOpportunities({ snapshot, t }: { readonly snapshot: OperatorWorkExchangeSnapshot; readonly t: OperatorTranslate }) {
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
 * The whole read-only collaboration surface. Every panel renders a field the
 * server already decided. Nothing here ranks, joins or infers.
 */
export function CollaborationPane({ state, t }: { readonly state: CollaborationViewState; readonly t: OperatorTranslate }) {
  const frame = (children: ReactNode, mode?: string) => (
    <section className="detail-block collab-pane" aria-labelledby="collab-heading" data-collab-mode={mode}>
      <h3 className="detail-eyebrow" id="collab-heading">{t('collab.title')}</h3>
      {children}
    </section>
  );
  if (state.kind === 'idle') return frame(<p className="detail-quiet">{t('collab.hint')}</p>);
  if (state.kind === 'loading') {
    return frame(
      <div className="operator-notice operator-notice--loading" role="status" aria-live="polite">
        <Banner variant="secondary" icon={<Loader size={14} />} title={t('collab.loading')} description={t('collab.scope', { repository: state.repository_id })} />
      </div>,
    );
  }
  if (state.kind === 'failed') {
    return frame(
      <div className="operator-notice operator-notice--danger" role="alert">
        <Banner variant="error" icon={<WarningIcon />} title={t('collab.failedTitle')} description={<ApiErrorText error={state.error} t={t} />} />
      </div>,
    );
  }
  if (state.snapshot.exchange.status === 'unavailable') return frame(<p role="status">{t('org.sourceUnavailable')}</p>);
  const snapshot = state.snapshot.exchange.snapshot;
  return frame(<>
    <div className="detail-chips">
      <ToneBadge>{t('collab.scope', { repository: snapshot.repository_id })}</ToneBadge>
      <ToneBadge>{t('collab.mode')} {t(`collab.mode.${snapshot.mode}` as OperatorMessageKey)}</ToneBadge>
    </div>
    <CollaborationConsistency snapshot={snapshot} t={t} />
    {snapshot.mode === 'off' && (
      <div className="detail-callout">
        <FlagIcon size={15} />
        <div><strong>{t('collab.modeOffTitle')}</strong><span>{t('collab.modeOffBody')}</span></div>
      </div>
    )}
    <CollaborationLanes snapshot={snapshot} t={t} />
    <CollaborationDiscoveries snapshot={snapshot} t={t} />
    <CollaborationHandoffs snapshot={snapshot} t={t} />
    <CollaborationContributors snapshot={snapshot} t={t} />
    <CollaborationOpportunities snapshot={snapshot} t={t} />
    <div className="detail-callout">
      <FlagIcon size={15} />
      <div><strong>{t('collab.offersTitle')}</strong><span>{t('collab.offersBody')}</span></div>
    </div>
    <dl className="detail-list">
      <div><dt>{t('collab.sourceDigest')}</dt><dd className="mono-value">{snapshot.source_snapshot_sha256}</dd></div>
    </dl>
  </>, snapshot.mode);
}

function DetailPane({ snapshot, card, collaboration, revisionChangedFrom, evidenceGeneration, fleetStaleError, readTaskContext, readTaskActivity, onClose, onRefresh, t }: {
  readonly snapshot: OperatorFleetSnapshotV1 | null;
  readonly card: OperatorFleetCardV1;
  readonly collaboration: CollaborationViewState;
  readonly revisionChangedFrom: string | null;
  readonly evidenceGeneration: number;
  /** Set while the Fleet read that produced `card` is stale; the retained facts carry the mark. */
  readonly fleetStaleError: OperatorApiErrorV1 | null;
  readonly readTaskContext?: TaskContextReader;
  readonly readTaskActivity?: TaskActivityReader;
  readonly onClose: () => void;
  readonly onRefresh: () => void;
  readonly t: OperatorTranslate;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useModalFocus({ dialogRef, closeRef: closeButtonRef, identity: taskKey(card), onClose });
  const label = taskDisplayLabel(card);
  const header = (
    <div className="detail-pane__header flex items-start justify-between gap-3 border-b border-kumo-hairline px-5 py-4 sm:px-6">
      <div className="detail-pane__title min-w-0">
        <p className="detail-eyebrow">{t('detail.taskDetail')}</p>
        <h2 id="detail-pane-title" className={cn('text-lg font-semibold text-kumo-strong', !label.isLabel && 'mono-value')}>{label.text}</h2>
        {label.isLabel && <code className="detail-pane__id text-xs text-kumo-subtle">{card.task_id.slice(0, 12)}</code>}
      </div>
      <div className="detail-pane__actions flex shrink-0 items-center gap-1">
        <Button size="sm" variant="secondary" className="operator-button" icon={<ArrowClockwiseIcon />} onClick={onRefresh}>{t('status.refresh')}</Button>
        <button ref={closeButtonRef} className="icon-button inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-kumo-subtle hover:bg-kumo-tint focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none" type="button" onClick={onClose} aria-label={t('detail.close')}>
          <XIcon size={18} />
        </button>
      </div>
    </div>
  );
  return (
    <DrawerFrame dialogRef={dialogRef} labelledBy="detail-pane-title" className="detail-pane" closeLabel={t('detail.close')} onClose={onClose} header={header}>
      <div className="detail-pane__body flex flex-col gap-5 pt-4">
        {fleetStaleError && <FleetStaleNotice error={fleetStaleError} t={t} />}
        <TaskDetail card={card} revisionChangedFrom={revisionChangedFrom} t={t} />
        <TaskEvidence repositoryId={card.repository_id} taskId={card.task_id} revision={card.task_revision} generation={evidenceGeneration} readContext={readTaskContext} readActivity={readTaskActivity} t={t} />
        {snapshot && <TaskDiff key={JSON.stringify([snapshot.service_epoch, card.repository_id, card.task_id, card.task_revision, card.claim_id, card.generation])} card={card} t={t} />}
        {/* Below the task's own facts, never above them: collaboration is
            context for a decision the worklist already surfaced. */}
        <CollaborationPane state={collaboration} t={t} />
      </div>
    </DrawerFrame>
  );
}

function EmptyFleet({ t }: { readonly t: OperatorTranslate }) {
  return (
    <section className="empty-state flex flex-col gap-2" aria-label={t('empty.title')}>
      <p className="text-xs font-medium tracking-wide text-kumo-subtle uppercase">{t('empty.eyebrow')}</p>
      <Empty icon={<TrayIcon size={40} />} title={t('empty.title')} description={t('empty.body')} commandLine="repo-harness adopt --help" />
    </section>
  );
}

function LoadingState({ t }: { readonly t: OperatorTranslate }) {
  return (
    <section className="loading-board flex flex-col gap-2" aria-label={t('loading.boardLabel')}>
      {Array.from({ length: 5 }, (_, index) => <span key={index} className="skeleton-line h-14 rounded-lg bg-kumo-recessed" />)}
    </section>
  );
}

function FatalState({ error, onRetry, t }: { readonly error: OperatorApiErrorV1; readonly onRetry: () => void; readonly t: OperatorTranslate }) {
  return (
    <section className="fatal-state flex flex-col items-start gap-3 rounded-xl border border-kumo-line bg-kumo-base p-6" aria-labelledby="fatal-heading">
      <p className="detail-eyebrow">{t('fatal.eyebrow')}</p>
      <h2 id="fatal-heading" className="text-lg font-semibold text-kumo-strong">{t('fatal.title')}</h2>
      <p className="text-sm text-kumo-default"><ApiErrorText error={error} t={t} /></p>
      <Button variant="secondary" onClick={onRetry}>{t('fatal.retry')}</Button>
    </section>
  );
}

export interface RepositoryWorkspaceProps {
  readonly state: OperatorSnapshotViewState;
  readonly activeRepository: OperatorFleetRepositoryV1 | null;
  readonly activeRepositoryId: string;
  readonly onRepository: (id: string) => void;
  readonly location: TaskLocation;
  readonly selection: TaskLocation['selection'];
  readonly selectedCard: OperatorFleetCardV1 | null;
  readonly revisionChangedFrom: string | null;
  readonly view: ObservationView;
  readonly onView: (view: ObservationView) => void;
  readonly collaboration: CollaborationViewState;
  readonly decisionAfter: string | null;
  readonly onDecisionPage: (after: string | null) => void;
  readonly refreshGeneration: number;
  readonly onRefresh: () => void;
  readonly onSelect: (card: OperatorFleetCardV1) => void;
  readonly onCloseSelection: () => void;
  readonly fetchRepositoryObservation?: RepositoryObservationReader;
  readonly readTaskContext?: TaskContextReader;
  readonly readTaskActivity?: TaskActivityReader;
  readonly readTaskHistory?: TaskHistoryReader;
  readonly onBack: () => void;
  readonly now: number;
  readonly t: OperatorTranslate;
}

/** One repository's Fleet tasks, automation and organization, with the task drawer. */
export function RepositoryWorkspace(props: RepositoryWorkspaceProps) {
  const { state, activeRepository, selection, selectedCard, view, collaboration, t } = props;
  const snapshot = snapshotForState(state);
  const visibleRepositories = useMemo(() => activeRepository ? [activeRepository] : [], [activeRepository]);
  // Organization-only readers stay mounted to keep their last result, but they
  // poll only while their panel shows; the shared Fleet read keeps running.
  const organizationActive = activeRepository === null || view === 'organization';
  return (
    <>
      <header className="flex flex-col gap-3 border-b border-kumo-hairline pb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" className="cursor-pointer text-sm text-kumo-link hover:underline" onClick={props.onBack}>{t('repositories.back')}</button>
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-kumo-strong">{activeRepository?.display_name ?? t('repository.select')}</h1>
          <RepositorySwitch snapshot={snapshot} repositoryId={activeRepository?.repository_id ?? ''} onRepository={props.onRepository} t={t} />
        </div>
        <FleetFacts snapshot={snapshot} stale={state.kind === 'stale'} now={props.now} t={t} />
      </header>
      {props.location.invalid && <p role="alert" className="text-sm text-kumo-danger">{t('history.invalidLink')}</p>}
      {selection && (selection.historical || (snapshot !== null && !selectedCard)) && <TaskHistory
        repositoryId={props.activeRepositoryId} taskId={selection.taskId} revision={selection.revision}
        generation={props.refreshGeneration} read={props.readTaskHistory} onClose={props.onCloseSelection} t={t} />}
      {activeRepository && <ObservationTabs view={view} onChange={props.onView} t={t} />}
      <div role="tabpanel" id="view-panel-organization" aria-labelledby="view-tab-organization" hidden={!organizationActive} className="flex flex-col gap-6">
        {activeRepository && <AutomationSummary repositoryId={activeRepository.repository_id} refreshGeneration={props.refreshGeneration} active={organizationActive} readObservation={props.fetchRepositoryObservation} t={t} />}
        {activeRepository && <DecisionSummary state={collaboration} repositoryId={activeRepository.repository_id} after={props.decisionAfter} onPage={props.onDecisionPage} t={t} />}
        {activeRepository && <OrganizationSummary state={collaboration} repositoryId={activeRepository.repository_id} t={t} />}
        <SnapshotNotice state={state} onRetry={props.onRefresh} t={t} />
        {state.kind === 'loading' && state.previous === null ? <LoadingState t={t} />
          : state.kind === 'fatal' ? <FatalState error={state.error} onRetry={props.onRefresh} t={t} />
            : snapshot ? (
              snapshotViewKind(snapshot) === 'empty' ? <EmptyFleet t={t} />
                : !activeRepository ? <p role="status" className="text-sm text-kumo-subtle">{t('repository.select')}</p>
                  : <Worklist key={activeRepository.repository_id} snapshot={{ repositories: visibleRepositories }} selectedKey={selection?.key ?? null} onSelect={props.onSelect} t={t} />
            ) : null}
      </div>
      <div role="tabpanel" id="view-panel-planning" aria-labelledby="view-tab-planning" hidden={view !== 'planning'}>
        {view === 'planning' && activeRepository && <PlanningView state={collaboration} repositoryId={activeRepository.repository_id} cards={activeRepository.cards} onSelect={props.onSelect} t={t} />}
      </div>
      <div role="tabpanel" id="view-panel-delivery" aria-labelledby="view-tab-delivery" hidden={view !== 'delivery'}>
        {view === 'delivery' && activeRepository && <DeliveryView repository={activeRepository} selectedKey={selection?.key ?? null} onSelect={props.onSelect} t={t} />}
      </div>
      {view !== 'organization' && <SnapshotNotice state={state} onRetry={props.onRefresh} t={t} />}
      {activeRepository && <details className="repository-overview">
        <summary>{t('detail.overviewTitle')}</summary>
        <StageMatrix snapshot={{ repositories: visibleRepositories }} t={t} />
        <section aria-label={t('detail.repositoryHealth')}>
          <h3>{t('detail.repositoryHealth')}</h3>
          <RepositoryHealth snapshot={{ repositories: visibleRepositories }} t={t} />
        </section>
        {!selectedCard && <CollaborationPane state={collaboration} t={t} />}
      </details>}
      {/* Without an observed snapshot there is no protocol to report; the
          constant this bundle compiled against is not one. */}
      <p className="operator-footer text-xs text-kumo-subtle">{t('footer.protocol', { protocol: snapshot?.protocol ?? '—', sequence: snapshot?.sequence ?? '—' })}</p>
      {selectedCard && state.kind !== 'fatal' && (
        <DetailPane
          key={activeRepository?.repository_id ?? 'none'}
          snapshot={snapshot}
          card={selectedCard}
          collaboration={collaboration}
          revisionChangedFrom={props.revisionChangedFrom}
          evidenceGeneration={props.refreshGeneration}
          fleetStaleError={staleErrorForState(state)}
          readTaskContext={props.readTaskContext}
          readTaskActivity={props.readTaskActivity}
          onClose={props.onCloseSelection}
          onRefresh={props.onRefresh}
          t={t}
        />
      )}
    </>
  );
}
