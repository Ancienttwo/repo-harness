import { useCallback, useState, type ReactNode } from 'react';
import { decodePipelineBoard, PIPELINE_STALE_AFTER_MS, type PipelineBoardV2, type PipelineCard } from '../core/pipeline/board';
import { Icon } from './icons';
import { useObservationRefresh } from './useObservationRefresh';
import {
  formatRelativeAge,
  isOperatorMessageKey,
  type OperatorMessageKey,
  type OperatorTranslate,
} from './i18n';

/**
 * Read-only view of the ledger board projection (design §10).
 *
 * - Cards key by the canonical `(source_host, repository_id, task)` triple;
 *   `repository_id` is an opaque digest on the board.
 * - A failed refresh keeps the last good board, so every timestamp on it stays
 *   the original read time.
 * - Enum labels come from the closed dictionary; an unknown value renders as
 *   the server's own text instead of an invented label.
 */
export type PipelineBoardReader = (signal: AbortSignal) => Promise<PipelineBoardV2>;

async function fetchPipelineBoard(signal: AbortSignal): Promise<PipelineBoardV2> {
  const response = await fetch('/api/v1/pipelines', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('pipeline_board_unavailable');
  return decodePipelineBoard(await response.json());
}

/** The canonical parent key, never the display id. */
export function pipelineCardKey(card: PipelineCard): string {
  return JSON.stringify([card.source_host, card.repository_id, card.task]);
}

/**
 * Display staleness for a served generation that stopped advancing (A11). It
 * matches the projection's default threshold; the board's own status stays
 * authority for everything else.
 */
const BOARD_STALE_AFTER_MS = PIPELINE_STALE_AFTER_MS;

export type PipelineDisplayState =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'partial'
  | 'stale'
  | 'unavailable'
  | 'refresh-failed';

function isStaleByAge(generatedAt: string | null, now: number): boolean {
  if (generatedAt === null) return false;
  const generated = Date.parse(generatedAt);
  return !Number.isNaN(generated) && now - generated > BOARD_STALE_AFTER_MS;
}

/** One labeled state at a time; refresh failure outranks the served status. */
function displayState(board: PipelineBoardV2, refreshFailed: boolean, now: number): PipelineDisplayState {
  if (refreshFailed) return 'refresh-failed';
  if (board.status === 'ready' && isStaleByAge(board.generated_at, now)) return 'stale';
  return board.status;
}

function enumLabel(prefix: string, value: string, t: OperatorTranslate): string {
  const key = `${prefix}.${value}`;
  return isOperatorMessageKey(key) ? t(key) : value;
}

const STATE_STATUS_KEYS: Readonly<Record<Exclude<PipelineDisplayState, 'loading'>, OperatorMessageKey>> = {
  ready: 'pipeline.status.ready',
  empty: 'pipeline.status.empty',
  partial: 'pipeline.status.partial',
  stale: 'pipeline.status.stale',
  unavailable: 'pipeline.status.unavailable',
  'refresh-failed': 'pipeline.status.refresh_failed',
};

function statusTone(state: PipelineDisplayState): string {
  if (state === 'stale' || state === 'unavailable') return 'tone-danger';
  if (state === 'partial' || state === 'refresh-failed') return 'tone-user';
  return 'tone-neutral';
}

const FLAG_TONES: Readonly<Record<string, string>> = {
  stalled: 'tone-user',
  blocked: 'tone-danger',
  pending_attention: 'tone-user',
  stale_subject: 'tone-user',
  waiting_owner: 'tone-user',
  run_external_pending: 'tone-external',
  source_stale: 'tone-danger',
  attested_only: 'tone-agent',
  registration_incomplete: 'tone-danger',
};

function Badge({ children, tone = 'tone-neutral' }: { readonly children: ReactNode; readonly tone?: string }) {
  return <span className={`operator-badge ${tone}`}>{children}</span>;
}

function Age({ at, now, t }: { readonly at: string; readonly now: number; readonly t: OperatorTranslate }) {
  return <time dateTime={at} title={at}>{formatRelativeAge(at, now, t)}</time>;
}

function Notice({ tone, title, body }: { readonly tone: 'danger' | 'warning'; readonly title: string; readonly body: string }) {
  return (
    <div
      className={`operator-notice operator-notice--${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? undefined : 'polite'}
    >
      <Icon name="alert" size={16} />
      <div><strong>{title}</strong><span>{body}</span></div>
    </div>
  );
}

function yesNo(value: boolean, t: OperatorTranslate): string {
  return value ? t('pipeline.yes') : t('pipeline.no');
}

type BoardView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly board: PipelineBoardV2; readonly refreshFailed: boolean }
  | { readonly kind: 'unavailable' };

/** Read-only observation of the ledger projection. No control changes ledger state. */
export function PipelineBoardPanel({
  readBoard = fetchPipelineBoard,
  initialBoard,
  refreshGeneration = 0,
  active = true,
  t,
}: {
  readonly readBoard?: PipelineBoardReader;
  readonly initialBoard?: PipelineBoardV2;
  /** The page-level explicit refresh generation; a change re-requests now. */
  readonly refreshGeneration?: number;
  /** False while the owning panel is hidden; polling pauses and the last result stays. */
  readonly active?: boolean;
  readonly t: OperatorTranslate;
}) {
  const [view, setView] = useState<BoardView>(
    initialBoard ? { kind: 'ready', board: initialBoard, refreshFailed: false } : { kind: 'loading' },
  );
  const read = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    try {
      const board = await readBoard(signal);
      if (signal.aborted) return false;
      setView({ kind: 'ready', board, refreshFailed: false });
      return true;
    } catch {
      if (signal.aborted) return false;
      // A failed refresh keeps the last good board and every timestamp on it.
      setView((current) => (current.kind === 'ready' ? { ...current, refreshFailed: true } : { kind: 'unavailable' }));
      return false;
    }
  }, [readBoard]);
  // An explicit refresh must re-request now even when initial data seeded the
  // panel, so the generation participates in both identity and immediacy.
  useObservationRefresh(read, JSON.stringify(['pipeline-board', refreshGeneration]), { enabled: active, immediate: initialBoard === undefined || refreshGeneration > 0 });
  const now = Date.now();
  const state = view.kind === 'ready' ? displayState(view.board, view.refreshFailed, now) : view.kind;
  return (
    <section className="pipeline-board" aria-labelledby="pipeline-board-heading" data-pipeline-state={state}>
      <header className="pipeline-board__heading">
        <div>
          <p>{t('pipeline.eyebrow')}</p>
          <h2 id="pipeline-board-heading">{t('pipeline.title')}</h2>
        </div>
        {view.kind === 'ready' && state !== 'loading' && <Badge tone={statusTone(state)}>{t(STATE_STATUS_KEYS[state])}</Badge>}
      </header>
      {view.kind === 'loading' && <p role="status">{t('pipeline.loading')}</p>}
      {view.kind === 'unavailable' && (
        <Notice tone="danger" title={t('pipeline.notice.unavailableTitle')} body={t('pipeline.notice.unavailableBody')} />
      )}
      {view.kind === 'ready' && <BoardBody board={view.board} refreshFailed={view.refreshFailed} now={now} t={t} />}
    </section>
  );
}

function StatusNotice({ board, staleByAge, t }: {
  readonly board: PipelineBoardV2;
  readonly staleByAge: boolean;
  readonly t: OperatorTranslate;
}) {
  if (board.status === 'unavailable') {
    return <Notice tone="danger" title={t('pipeline.notice.unavailableTitle')} body={t('pipeline.notice.unavailableBody')} />;
  }
  if (board.status === 'stale' || staleByAge) {
    return <Notice tone="danger" title={t('pipeline.notice.staleTitle')} body={t('pipeline.notice.staleBody')} />;
  }
  if (board.status === 'partial') {
    return <Notice tone="warning" title={t('pipeline.notice.partialTitle')} body={t('pipeline.notice.partialBody')} />;
  }
  return null;
}

function BoardBody({ board, refreshFailed, now, t }: {
  readonly board: PipelineBoardV2;
  readonly refreshFailed: boolean;
  readonly now: number;
  readonly t: OperatorTranslate;
}) {
  const staleByAge = board.status === 'ready' && isStaleByAge(board.generated_at, now);
  return (
    <>
      {refreshFailed && (
        <Notice tone="warning" title={t('pipeline.refreshFailedTitle')} body={t('pipeline.refreshFailedBody')} />
      )}
      <StatusNotice board={board} staleByAge={staleByAge} t={t} />
      <dl className="detail-list pipeline-facts">
        <div>
          <dt>{t('pipeline.facts.generated')}</dt>
          <dd>{board.generated_at ? <Age at={board.generated_at} now={now} t={t} /> : t('field.none')}</dd>
        </div>
        <div>
          <dt>{t('pipeline.facts.reconciled')}</dt>
          <dd>{board.last_reconciled_at ? <Age at={board.last_reconciled_at} now={now} t={t} /> : t('field.none')}</dd>
        </div>
        <div>
          <dt>{t('pipeline.facts.epoch')}</dt>
          <dd className="mono-value">{board.epoch ?? t('field.none')}</dd>
        </div>
        <div>
          <dt>{t('pipeline.facts.commitSeq')}</dt>
          <dd className="mono-value">{board.commit_seq ?? t('field.none')}</dd>
        </div>
        <div>
          <dt>{t('pipeline.facts.coverage')}</dt>
          <dd>{t('pipeline.coverageLine', { ...board.coverage })}</dd>
        </div>
        {Object.entries(board.source_observed_at).map(([source, at]) => (
          <div key={source}>
            <dt>{t('pipeline.facts.sourceAge', { source })}</dt>
            <dd><Age at={at} now={now} t={t} /></dd>
          </div>
        ))}
      </dl>
      {board.cards.length === 0 ? (
        <div className="empty-inline"><Icon name="check" size={16} /><span>{t('pipeline.empty')}</span></div>
      ) : (
        <section aria-labelledby="pipeline-cards-heading">
          <h3 className="pipeline-cards__heading" id="pipeline-cards-heading">
            {t('pipeline.cards.heading')} <span>{board.cards.length}</span>
          </h3>
          <ul className="pipeline-cards">
            {board.cards.map((card) => <PipelineCardItem key={pipelineCardKey(card)} card={card} now={now} t={t} />)}
          </ul>
        </section>
      )}
    </>
  );
}

function PipelineCardItem({ card, now, t }: {
  readonly card: PipelineCard;
  readonly now: number;
  readonly t: OperatorTranslate;
}) {
  return (
    <li className="pipeline-card">
      <div className="pipeline-card__head">
        <strong className="pipeline-card__title">{card.title !== '' ? card.title : card.id}</strong>
        <span className="pipeline-card__badges">
          <Badge>{enumLabel('pipeline.phase', card.phase, t)}</Badge>
          <Badge tone={card.admission === 'gate_qualified' ? 'tone-agent' : 'tone-user'}>
            {enumLabel('pipeline.admission', card.admission, t)}
          </Badge>
          {card.flags.map((flag) => (
            <Badge key={flag} tone={FLAG_TONES[flag] ?? 'tone-danger'}>{enumLabel('pipeline.flag', flag, t)}</Badge>
          ))}
        </span>
      </div>
      <p className="pipeline-card__meta">
        <span><Icon name="repo" size={13} /> {card.repo}</span>
        <span className="mono-value" title={card.task}>{card.task}</span>
        <span>{t('pipeline.runs.count', { count: card.runs.length })}</span>
      </p>
      {card.blocked !== null && (
        <p className="pipeline-card__blocked">
          <Icon name="alert" size={13} />
          <span>{t('pipeline.card.blocked', { reason: card.blocked })}</span>
        </p>
      )}
      <dl className="detail-list">
        <div><dt>{t('pipeline.card.updated')}</dt><dd><Age at={card.record_updated_at} now={now} t={t} /></dd></div>
        <div><dt>{t('pipeline.card.phaseSince')}</dt><dd><Age at={card.phase_since} now={now} t={t} /></dd></div>
        <div><dt>{t('pipeline.card.stateVersion')}</dt><dd className="mono-value">{card.state_version}</dd></div>
        {card.subject === null ? (
          <div><dt>{t('pipeline.subject.heading')}</dt><dd>{t('pipeline.subject.none')}</dd></div>
        ) : (
          <>
            <div><dt>{t('pipeline.subject.head')}</dt><dd className="mono-value">{card.subject.head_sha}</dd></div>
            <div><dt>{t('pipeline.subject.base')}</dt><dd className="mono-value">{card.subject.base_sha}</dd></div>
          </>
        )}
        {card.approval === null ? (
          <div><dt>{t('pipeline.approval.heading')}</dt><dd>{t('pipeline.approval.none')}</dd></div>
        ) : (
          <>
            <div><dt>{t('pipeline.approval.attested')}</dt><dd>{yesNo(card.approval.attested, t)}</dd></div>
            <div><dt>{t('pipeline.approval.expired')}</dt><dd>{yesNo(card.approval.expired, t)}</dd></div>
            {card.approval.expired_reason !== null && (
              <div><dt>{t('pipeline.approval.expiredReason')}</dt><dd>{card.approval.expired_reason}</dd></div>
            )}
          </>
        )}
        <div>
          <dt>{t('pipeline.externalFact.heading')}</dt>
          <dd>{card.external_fact === null ? t('pipeline.externalFact.none') : t('pipeline.externalFact.recorded', { source: card.external_fact.source })}</dd>
        </div>
      </dl>
      <details className="pipeline-card__detail">
        <summary>{t('pipeline.card.detail')}</summary>
        <p className="detail-quiet">{t('pipeline.detail.bounded')}</p>
        <dl className="detail-list">
          <div><dt>{t('pipeline.card.recordId')}</dt><dd className="mono-value">{card.id}</dd></div>
          <div><dt>{t('pipeline.card.task')}</dt><dd className="mono-value">{card.task}</dd></div>
          <div><dt>{t('pipeline.card.repository')}</dt><dd className="mono-value">{card.repository_id}</dd></div>
          <div><dt>{t('pipeline.card.sourceHost')}</dt><dd className="mono-value">{card.source_host}</dd></div>
          {card.subject !== null && (
            <>
              <div><dt>{t('pipeline.subject.tree')}</dt><dd className="mono-value">{card.subject.tree_digest}</dd></div>
              <div><dt>{t('pipeline.subject.environment')}</dt><dd className="mono-value">{card.subject.environment}</dd></div>
            </>
          )}
          {card.external_fact !== null && (
            <>
              <div><dt>{t('pipeline.externalFact.squash')}</dt><dd className="mono-value">{card.external_fact.squash_commit}</dd></div>
              <div><dt>{t('pipeline.externalFact.approvalNotRecorded')}</dt><dd>{yesNo(card.external_fact.approval_not_recorded, t)}</dd></div>
              <div><dt>{t('pipeline.externalFact.confirmedDeviation')}</dt><dd>{yesNo(card.external_fact.confirmed_deviation, t)}</dd></div>
            </>
          )}
        </dl>
        <h4>{t('pipeline.runs.heading')}</h4>
        {card.runs.length === 0 ? <p className="detail-quiet">{t('pipeline.runs.empty')}</p> : (
          <ul className="pipeline-runs">
            {card.runs.map((run, index) => (
              <li key={`${run.role}:${run.round}:${index}`}>
                <span className="mono-value">{run.role}</span>
                {' · '}{t('pipeline.runs.round', { round: run.round })}
                {' — '}{enumLabel('pipeline.runStatus', run.status, t)}
                {' / '}{enumLabel('pipeline.resultState', run.result_state, t)}
              </li>
            ))}
          </ul>
        )}
        <h4>{t('pipeline.evidence.heading')}</h4>
        {card.evidence.length === 0 ? <p className="detail-quiet">{t('pipeline.evidence.empty')}</p> : (
          <ul className="pipeline-evidence">
            {card.evidence.map((row, index) => (
              <li key={`${row.kind}:${row.source}:${row.verdict}:${row.current}:${index}`}>
                {enumLabel('pipeline.evidenceKind', row.kind, t)}
                {' · '}{enumLabel('pipeline.evidenceSource', row.source, t)}
                {' · '}{enumLabel('pipeline.evidenceVerdict', row.verdict, t)}
                {' · '}{row.current ? t('pipeline.evidence.current') : t('pipeline.evidence.superseded')}
                {' × '}{row.count}
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}
