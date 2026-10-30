import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner, Button, Loader, cn } from '@cloudflare/kumo';
import type { DocSessionCitationView } from '../core/operator/doc-session-api';
import type { DocSessionEventV1 } from '../core/operator/doc-session-events';
import type { DocSessionDiscardInput } from '../core/operator/doc-session-finalize';
import type { OperatorDocSessionDetail } from '../core/operator/doc-session-views';
import { Conversation } from './Conversation';
import {
  DOC_SESSION_STATUS_TONE,
  docSessionProgress,
  docSessionReadText,
  docSessionRuntimeName,
  docSessionStatus,
  forgetFinalizeRequests,
  markSessionSeen,
  storedFinalizeRequest,
  storeFinalizeRequest,
  useDocSessionDetail,
  useDocSessionEvents,
  useSessionRead,
  useSessionWrite,
  type DocSessionCommitWriter,
  type DocSessionDetailReader,
  type DocSessionDiffReader,
  type DocSessionDiscardWriter,
  type DocSessionEventsReader,
  type DocSessionEventsView,
  type DocSessionFinalizationReader,
  type DocSessionLossReader,
  type DocSessionMessageWriter,
  type DocSessionProgress,
  type DocSessionRead,
  type DocSessionReadReason,
  type DocSessionStopWriter,
} from './doc-sessions';
import { relativeAge, type OperatorTranslate } from './i18n';
import { CommitControl, FollowUp, OriginalMissing, SessionWriteResult } from './SessionControls';
import { SessionDiff, type SessionDiffMode } from './SessionDiff';
import type { ThemeMode } from './theme';
import { StatusDot } from './ui';
import type { WorkspaceLocation } from './workspace-location';

export interface DocSessionPageProps {
  /** The 32-hex id from `#session/<id>`. */
  readonly sessionId: string;
  readonly readDetail: DocSessionDetailReader;
  readonly readEvents: DocSessionEventsReader;
  readonly readDiff: DocSessionDiffReader;
  readonly readLoss: DocSessionLossReader;
  readonly readFinalization: DocSessionFinalizationReader;
  readonly writeMessage: DocSessionMessageWriter;
  readonly writeStop: DocSessionStopWriter;
  readonly writeCommit: DocSessionCommitWriter;
  readonly writeDiscard: DocSessionDiscardWriter;
  /** The verified citations of the create answer, when this browser opened the session right after creating it; no read returns them. */
  readonly citations: readonly DocSessionCitationView[] | null;
  /** The server answered `steer_unsupported` for this session while the console was open. */
  readonly steerUnsupported: boolean;
  readonly onSteerUnsupported: () => void;
  readonly generation: number;
  /** The resolved theme; reading mode draws mermaid diagrams with it. */
  readonly mode: ThemeMode;
  readonly now: number;
  readonly onOpen: (next: WorkspaceLocation) => void;
  readonly t: OperatorTranslate;
}

/** A session read that failed: which source, why, what to do next, and how old the data still shown is. */
export function SessionReadFailure({ source, reason, stale, t }: {
  readonly source: string; readonly reason: DocSessionReadReason; readonly stale?: string; readonly t: OperatorTranslate;
}) {
  const text = docSessionReadText(reason, t);
  return <Banner variant="error" data-session-failure={reason} title={`${source} · ${text.message}`}
    description={stale === undefined ? text.next_action : <><span className="block">{stale}</span><span className="block">{text.next_action}</span></>} />;
}

/** The record stream with its loading and failure states. Shared with the cleanup session page. */
export function SessionRecord({ sessionId, events, runtime, citations, t }: {
  readonly sessionId: string; readonly events: DocSessionEventsView; readonly runtime: string | null;
  readonly citations?: readonly DocSessionCitationView[]; readonly t: OperatorTranslate;
}) {
  // The newest cursor on screen is what this browser has seen.
  useEffect(() => { if (events.cursor !== null) markSessionSeen(sessionId, events.cursor); }, [sessionId, events.cursor]);
  return (
    <section className="flex flex-col gap-4" data-session-record>
      {events.failure !== null && <SessionReadFailure source={t('docSession.source.events')} reason={events.failure} t={t} />}
      {events.activity === null && events.failure === null
        ? <p role="status" className="flex items-center gap-1.5 text-sm text-kumo-subtle"><Loader size={12} />{t('docSession.events.loading')}</p>
        : events.events.length === 0 ? <p className="text-sm text-kumo-subtle" data-session-empty>{t('docSession.events.empty')}</p>
          : <Conversation events={events.events} runtime={runtime} citations={citations} t={t} />}
    </section>
  );
}

/** The last successful value of a read, so a failed refresh keeps it on screen. */
function useLastOk<T>(read: DocSessionRead<T> | null): T | null {
  const [last, setLast] = useState<T | null>(null);
  useEffect(() => { if (read?.state === 'ok') setLast(read.value); }, [read]);
  return read?.state === 'ok' ? read.value : last;
}

function staleText(value: { readonly observed_at: string } | null, now: number, t: OperatorTranslate): string | undefined {
  const age = value === null ? null : relativeAge(value.observed_at, now);
  return age === null ? undefined : t('docSession.stale', { age: t(age.key, { count: age.count }) });
}

function Fact({ label, children }: { readonly label: string; readonly children: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="type-caption shrink-0 text-kumo-subtle">{label}</dt>
      <dd className="min-w-0 font-mono text-xs text-kumo-default [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function SessionFacts({ detail, progress, t }: { readonly detail: OperatorDocSessionDetail; readonly progress: DocSessionProgress | null; readonly t: OperatorTranslate }) {
  const status = docSessionStatus(detail.session.state, progress);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-kumo-strong" data-session-status={status}>
        <StatusDot tone={DOC_SESSION_STATUS_TONE[status]} pulse={status === 'running'} />{t(`docSession.status.${status}`)}
      </span>
      <dl className="flex flex-wrap gap-x-5 gap-y-1">
        <Fact label={t('docSession.fact.repository')}>{detail.session.repository_name}</Fact>
        <Fact label={t('docSession.agent')}>{docSessionRuntimeName(detail.session.runtime, t)}</Fact>
        <Fact label={t('docSession.fact.branch')}>{detail.branch}</Fact>
        <Fact label={t('docSession.fact.worktree')}>{detail.worktree}</Fact>
      </dl>
    </div>
  );
}

type FailureEvent = Extract<DocSessionEventV1, { readonly type: 'failure' }>;

/** `4-DSES-F3`: a refused boundary or a failed host ends the session; nothing offers to run it without isolation. */
function IsolationFailure({ detail, events, t }: { readonly detail: OperatorDocSessionDetail; readonly events: readonly DocSessionEventV1[]; readonly t: OperatorTranslate }) {
  const failures = events.filter((event): event is FailureEvent => event.type === 'failure');
  const denied = failures.some(event => event.category === 'boundary_denied');
  if (!denied && detail.session.state !== 'failed') return null;
  const reason = denied ? 'boundary_denied' : failures.at(-1)?.category;
  return <Banner variant="error" data-session-isolation={reason ?? 'failed'}
    title={reason === undefined ? t('docSession.status.failed') : t(`docSession.failure.${reason}`)} description={t('docSession.isolation.kept')} />;
}

type DiscardProgress = Extract<DocSessionProgress, { readonly operation: 'discard' }>;

/**
 * `4-DSES-F4`: the loss read first, then a confirm bound to its head and digest. A pushed branch gets no
 * delete control. Once the server saved the discard, a retry sends the first request unchanged.
 */
function Discard({ sessionId, progress, readLoss, writeDiscard, generation, onAnswered, t }: {
  readonly sessionId: string; readonly progress: DiscardProgress | null; readonly readLoss: DocSessionLossReader;
  readonly writeDiscard: DocSessionDiscardWriter; readonly generation: number; readonly onAnswered: () => void; readonly t: OperatorTranslate;
}) {
  const [open, setOpen] = useState(false);
  const { read: loss, reload } = useSessionRead('doc-session-loss', readLoss, open && progress === null ? sessionId : null, generation);
  const discard = useSessionWrite<DocSessionDiscardInput, null>(useCallback(body => writeDiscard(sessionId, body), [writeDiscard, sessionId]));
  const answered = discard.state.kind === 'answered' ? discard.state.outcome : null;
  const sending = discard.state.kind === 'sending';
  const send = async (body: DocSessionDiscardInput) => {
    const outcome = await discard.submit(body);
    if (outcome === null) return;
    if (outcome.state === 'refused' && outcome.refusal.code === 'loss_changed') reload();
    onAnswered();
  };
  if (progress?.stage === 'complete') return <p role="status" className="text-sm text-kumo-default" data-discard-done>{t('docSession.discard.done')}</p>;
  if (progress !== null) {
    const stored = storedFinalizeRequest(sessionId, 'discard');
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-kumo-line bg-kumo-base p-4" data-discard data-finalize-stage={progress.stage} aria-label={t('docSession.discard')}>
        <p className="text-sm text-kumo-default" data-delivery-stopped={progress.stage}>{t(`docSession.finalize.stage.discard_${progress.stage}`)}</p>
        {stored !== null
          ? <Button variant="destructive" className="w-fit" onClick={() => void send(stored)} disabled={sending} data-discard-confirm="resume">{t('docSession.discard.retry')}</Button>
          : <OriginalMissing answered={answered} t={t} />}
        {answered !== null && <SessionWriteResult outcome={answered} t={t} />}
      </section>
    );
  }
  const pushed = (loss?.state === 'ok' && loss.value.pushed) || (answered?.state === 'refused' && answered.refusal.code === 'branch_pushed');
  if (!open) return <Button variant="secondary-destructive" className="w-fit" onClick={() => setOpen(true)} data-discard-open>{t('docSession.discard')}</Button>;
  const confirm = async () => {
    if (loss?.state !== 'ok') return;
    const body: DocSessionDiscardInput = { expected_head: loss.value.head_commit, expected_loss_sha256: loss.value.loss_sha256 };
    storeFinalizeRequest(sessionId, 'discard', body);
    await send(body);
  };
  const list = (title: string, items: readonly { readonly key: string; readonly text: string; readonly note?: string }[], name: string) => items.length > 0 && (
    <div className="flex flex-col gap-1">
      <h4 className="type-caption text-kumo-subtle">{title}</h4>
      <ul className="flex flex-col gap-0.5" data-loss={name}>
        {items.map(item => <li key={item.key} className="flex min-w-0 items-baseline gap-2"><code className="min-w-0 font-mono text-xs [overflow-wrap:anywhere]">{item.text}</code>
          {item.note !== undefined && <span className="shrink-0 text-xs text-kumo-subtle">{item.note}</span>}</li>)}
      </ul>
    </div>
  );
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-kumo-line bg-kumo-base p-4" data-discard aria-label={t('docSession.discard')}>
      <h3 className="text-sm font-semibold text-kumo-strong">{t('docSession.discard.title')}</h3>
      {loss === null && <p role="status" className="flex items-center gap-1.5 text-sm text-kumo-subtle"><Loader size={12} />{t('docSession.discard.loading')}</p>}
      {loss?.state === 'unavailable' && <SessionReadFailure source={t('docSession.source.loss')} reason={loss.reason} t={t} />}
      {loss?.state === 'ok' && (
        <>
          <p className="text-sm text-kumo-default">{t('docSession.discard.removes')}</p>
          {list(t('docSession.discard.files'), loss.value.files.map(file => ({
            key: file.path, text: file.path, note: `${t(`docSession.change.${file.status}`)}${file.tracked ? '' : ` · ${t('docSession.diff.untracked')}`}`,
          })), 'files')}
          {list(t('docSession.discard.ignored'), loss.value.ignored.map(path => ({ key: path, text: path })), 'ignored')}
          {list(t('docSession.discard.commits'), loss.value.commits.map(commit => ({ key: commit, text: commit.slice(0, 12) })), 'commits')}
          {loss.value.pushed && <p className="text-sm text-kumo-warning" data-loss-pushed>{t('docSession.error.branch_pushed.message')}</p>}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {loss?.state === 'ok' && !pushed && (
          <Button variant="destructive" onClick={() => void confirm()} disabled={sending} data-discard-confirm="first">{t('docSession.discard.confirm')}</Button>
        )}
        <Button variant="ghost" onClick={() => { setOpen(false); discard.reset(); }}>{t('docSession.discard.cancel')}</Button>
      </div>
      {answered !== null && <SessionWriteResult outcome={answered} t={t} />}
    </section>
  );
}

const VIEWS: readonly SessionDiffMode[] = ['diff', 'reading'];

/** One session's page state; keyed by session id, so nothing carries over to another session. */
function SessionView({ sessionId, readDetail, readEvents, readDiff, readLoss, readFinalization, writeMessage, writeStop, writeCommit, writeDiscard,
  citations, steerUnsupported, onSteerUnsupported, generation, mode, now, onOpen, t }: DocSessionPageProps) {
  const { read: detailRead, reload: reloadDetail } = useDocSessionDetail(readDetail, sessionId, generation);
  const { read: diffRead, reload: reloadDiff } = useSessionRead('doc-session-diff', readDiff, sessionId, generation);
  const { read: finalizationRead, reload: reloadFinalization } = useSessionRead('doc-session-finalization', readFinalization, sessionId, generation);
  const events = useDocSessionEvents(readEvents, sessionId);
  const detail = useLastOk(detailRead);
  const diffShown = useLastOk(diffRead);
  const finalization = useLastOk(finalizationRead);
  const progress = finalization === null ? null : docSessionProgress(finalization);
  const diff = diffRead?.state === 'ok' ? diffRead.value : null;
  const [view, setView] = useState<SessionDiffMode>('diff');
  const [reviewed, setReviewed] = useState<string | null>(null);
  // Showing the diff view of a loaded diff is what binds a commit to its digest.
  useEffect(() => { if (view === 'diff' && diff !== null) setReviewed(diff.diff_sha256); }, [view, diff]);
  // A turn that starts or ends changes the host state and the worktree; read both again then.
  const activity = useRef(events.activity);
  useEffect(() => {
    if (activity.current !== null && activity.current !== events.activity) { reloadDetail(); reloadDiff(); }
    activity.current = events.activity;
  }, [events.activity, reloadDetail, reloadDiff]);
  // A completed finalization needs no stored request any more.
  const complete = progress?.stage === 'complete';
  useEffect(() => { if (complete) forgetFinalizeRequests(sessionId); }, [complete, sessionId]);
  const diffChanged = useCallback(() => { setReviewed(null); reloadDiff(); }, [reloadDiff]);
  // Every commit or discard answer is followed by the reads that own its result.
  const finalized = useCallback(() => { reloadFinalization(); reloadDiff(); reloadDetail(); }, [reloadFinalization, reloadDiff, reloadDetail]);
  const status = detail === null ? null : docSessionStatus(detail.session.state, progress);
  // A discarded session has no worktree left, so its detail and diff reads fail by design.
  const discarded = progress?.operation === 'discard' && complete;
  const commitProgress = progress?.operation === 'commit' ? progress : null;
  const discardProgress = progress?.operation === 'discard' ? progress : null;
  return (
    <div className="flex min-w-0 flex-col gap-5" data-doc-session-page={sessionId}>
      <header className="border-b border-kumo-hairline pb-4">
        <h1 className="text-xl font-semibold text-kumo-strong [overflow-wrap:anywhere]">{detail?.session.title ?? t('docSession.title')}</h1>
        {detail !== null && <SessionFacts detail={detail} progress={progress} t={t} />}
        {detail === null && detailRead === null && <p role="status" className="mt-2 flex items-center gap-1.5 text-sm text-kumo-subtle"><Loader size={12} />{t('docSession.loading')}</p>}
      </header>
      {detailRead?.state === 'unavailable' && !discarded && <SessionReadFailure source={t('docSession.source.detail')} reason={detailRead.reason} t={t} />}
      {finalizationRead?.state === 'unavailable' && <SessionReadFailure source={t('docSession.source.finalization')} reason={finalizationRead.reason} t={t} />}
      {detail !== null && <IsolationFailure detail={detail} events={events.events} t={t} />}
      <div className="grid min-w-0 gap-8 xl:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-4" data-session-changes aria-label={t('docSession.source.diff')}>
          <div className="flex w-fit gap-0.5 rounded-lg border border-kumo-line bg-kumo-base p-0.5" role="group" aria-label={t('docSession.view.label')}>
            {VIEWS.map(option => (
              <button key={option} type="button" aria-pressed={view === option} data-view={option} onClick={() => setView(option)}
                className={cn('h-8 cursor-pointer rounded-md px-3 text-sm font-medium', view === option ? 'bg-kumo-tint text-kumo-strong' : 'text-kumo-subtle hover:text-kumo-default')}>
                {t(`docSession.view.${option}`)}
              </button>
            ))}
          </div>
          {diffRead?.state === 'unavailable' && !discarded && <SessionReadFailure source={t('docSession.source.diff')} reason={diffRead.reason} stale={staleText(diffShown, now, t)} t={t} />}
          {diffRead === null && <p role="status" className="flex items-center gap-1.5 text-sm text-kumo-subtle"><Loader size={12} />{t('docSession.diff.loading')}</p>}
          {diffShown !== null && !discarded && <SessionDiff diff={diffShown} view={view} mode={mode} onOpen={onOpen} t={t} />}
          {/* Delivery progress comes only from the finalization read, so nothing offers a commit before it answered. */}
          {detail !== null && finalization !== null && discardProgress === null && (
            <CommitControl sessionId={sessionId} title={detail.session.title} awaitingReview={status === 'awaiting_review'} diff={diff}
              reviewed={diff !== null && reviewed === diff.diff_sha256} progress={commitProgress} writeCommit={writeCommit}
              onDiffChanged={diffChanged} onAnswered={finalized} t={t} />
          )}
          {finalization !== null && commitProgress === null && (detail !== null || discardProgress !== null) && (
            <Discard sessionId={sessionId} progress={discardProgress} readLoss={readLoss} writeDiscard={writeDiscard} generation={generation} onAnswered={finalized} t={t} />
          )}
        </section>
        <section className="flex min-w-0 flex-col gap-4" aria-label={t('docSession.source.events')}>
          <SessionRecord sessionId={sessionId} events={events} runtime={detail?.session.runtime ?? null} citations={citations ?? undefined} t={t} />
          {detail !== null && <FollowUp sessionId={sessionId} detail={detail} progress={progress} steerUnsupported={steerUnsupported}
            onSteerUnsupported={onSteerUnsupported} writeMessage={writeMessage} writeStop={writeStop} onSent={reloadDetail} t={t} />}
        </section>
      </div>
    </div>
  );
}

/** One doc session (4-DSES): the changes with commit and discard on the left, the record and follow-up on the right. */
export function DocSessionPage(props: DocSessionPageProps) {
  return <SessionView key={props.sessionId} {...props} />;
}
