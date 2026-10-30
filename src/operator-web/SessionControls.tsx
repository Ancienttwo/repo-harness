import { useCallback, useState } from 'react';
import { Banner, Button, cn } from '@cloudflare/kumo';
import {
  DOC_SESSION_MESSAGE_MAX_BYTES,
  DOC_SESSION_MESSAGE_WHEN,
  type DocSessionMessageWhen,
  type OperatorDocSessionMessageV1,
  type OperatorDocSessionStopV1,
} from '../core/operator/doc-session-api';
import type { OperatorDocSessionDiffV1 } from '../core/operator/doc-session-changes';
import type { DocSessionCommitInput } from '../core/operator/doc-session-finalize';
import type { OperatorDocSessionDetail } from '../core/operator/doc-session-views';
import {
  localizeDocSessionRefusal,
  refusalSavedNothing,
  storedFinalizeRequest,
  storeFinalizeRequest,
  useFinalizeBinding,
  useSessionWrite,
  type DocSessionCommitWriter,
  type DocSessionMessageRequest,
  type DocSessionMessageWriter,
  type DocSessionProgress,
  type DocSessionRead,
  type DocSessionStopWriter,
  type DocSessionWrite,
  type RequestId,
} from './doc-sessions';
import type { OperatorTranslate } from './i18n';
import { CommandLine, ExternalLink, StatusDot, type DotTone } from './ui';

/** A write that did not succeed: the refusal's reason and next step, its files, or that no answer came. */
export function SessionWriteResult({ outcome, t }: { readonly outcome: DocSessionWrite<unknown>; readonly t: OperatorTranslate }) {
  if (outcome.state === 'ok') return null;
  if (outcome.state === 'unreachable') return <Banner variant="error" data-write-result="unreachable" description={t('docSession.write.unreachable')} />;
  if (outcome.state === 'unreadable') return <Banner variant="alert" data-write-result="unreadable" description={t('docSession.write.unreadable')} />;
  const { refusal } = outcome;
  const text = localizeDocSessionRefusal(refusal, t);
  return (
    <Banner variant="error" data-write-result={refusal.code} title={text.message}
      description={<>
        {!text.localized && <span className="block text-xs">{t('docSession.serverText')}</span>}
        <span className="block">{text.next_action}</span>
        {refusal.files.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5" data-refusal-files>
            {refusal.files.map(path => <li key={path}><code className="font-mono text-xs [overflow-wrap:anywhere]">{path}</code></li>)}
          </ul>
        )}
        {/* A pushed branch is never deleted from the page; the server names the command. */}
        {refusal.code === 'branch_pushed' && <CommandLine command={refusal.next_action} t={t} className="mt-2" />}
      </>} />
  );
}

const messageBytes = (text: string): number => new TextEncoder().encode(text).length;

/**
 * A follow-up message to the doc session's agent (`4-DSES-P2`), and「停止」while a turn runs.
 * Whether the runtime takes a message into the running turn is known only from the server's
 * `steer_unsupported` answer; the page keeps that answer per session.
 */
export function FollowUp({ sessionId, detail, progress, steerUnsupported, onSteerUnsupported, writeMessage, writeStop, onSent, t }: {
  readonly sessionId: string; readonly detail: OperatorDocSessionDetail; readonly progress: DocSessionProgress | null;
  readonly steerUnsupported: boolean; readonly onSteerUnsupported: () => void;
  readonly writeMessage: DocSessionMessageWriter; readonly writeStop: DocSessionStopWriter;
  readonly onSent: () => void; readonly t: OperatorTranslate;
}) {
  const [text, setText] = useState('');
  const [chosen, setWhen] = useState<DocSessionMessageWhen>('after_turn');
  const message = useSessionWrite<DocSessionMessageRequest, OperatorDocSessionMessageV1>(
    useCallback(body => writeMessage(sessionId, body), [writeMessage, sessionId]));
  const stop = useSessionWrite<object, OperatorDocSessionStopV1>(useCallback((body: RequestId) => writeStop(sessionId, body), [writeStop, sessionId]));
  const { state } = detail.session;
  // A started commit or discard ends the conversation as surely as a stopped agent.
  const closed = state === 'stopped' || state === 'failed' || progress !== null;
  const when = steerUnsupported ? 'after_turn' : chosen;
  const tooLong = messageBytes(text) > DOC_SESSION_MESSAGE_MAX_BYTES;
  const sending = message.state.kind === 'sending';
  const send = async () => {
    const outcome = await message.submit({ text, when });
    if (outcome?.state === 'refused' && outcome.refusal.code === 'steer_unsupported') onSteerUnsupported();
    if (outcome?.state === 'ok') { setText(''); onSent(); }
  };
  const halt = async () => {
    const outcome = await stop.submit({});
    if (outcome?.state === 'ok') onSent();
  };
  const sent = message.state.kind === 'answered' ? message.state.outcome : null;
  const stopped = stop.state.kind === 'answered' ? stop.state.outcome : null;
  return (
    <section className="flex flex-col gap-2" data-follow-up aria-label={t('docSession.composer.label')}>
      {closed && <p className="text-sm text-kumo-subtle" data-follow-up-closed>{t('docSession.error.session_closed.message')}</p>}
      <div className="flex flex-col rounded-xl border border-kumo-line bg-kumo-control">
        <textarea value={text} onChange={event => setText(event.target.value)} disabled={closed} rows={3}
          aria-label={t('docSession.composer.label')} placeholder={t('docSession.composer.placeholder')}
          className="min-h-20 resize-y rounded-t-xl bg-transparent px-4 py-3 text-sm text-kumo-default outline-none placeholder:text-kumo-subtle disabled:cursor-not-allowed" />
        <div className="flex flex-wrap items-center gap-2 border-t border-kumo-hairline px-3 py-2">
          <div role="radiogroup" aria-label={t('docSession.composer.when')} className="flex gap-0.5 rounded-lg border border-kumo-line bg-kumo-base p-0.5">
            {DOC_SESSION_MESSAGE_WHEN.map(option => {
              const disabled = closed || (option === 'now' && steerUnsupported);
              return (
                <button key={option} type="button" role="radio" aria-checked={when === option} disabled={disabled} data-when={option}
                  title={option === 'now' && steerUnsupported ? t('docSession.composer.steerUnsupported') : undefined}
                  onClick={() => setWhen(option)}
                  className={cn('h-7 cursor-pointer rounded-md px-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50',
                    when === option ? 'bg-kumo-tint text-kumo-strong' : 'text-kumo-subtle')}>
                  {t(`docSession.composer.${option}`)}
                </button>
              );
            })}
          </div>
          <span className="flex-1" />
          {state === 'running' && (
            <Button variant="secondary" size="sm" onClick={() => void halt()} disabled={stop.state.kind === 'sending'} data-stop>{t('docSession.composer.stop')}</Button>
          )}
          <Button variant="primary" size="sm" onClick={() => void send()} disabled={closed || sending || text.trim() === '' || tooLong} data-send>
            {t(sending ? 'docSession.composer.sending' : 'docSession.composer.send')}
          </Button>
        </div>
      </div>
      {tooLong && <p className="type-caption text-kumo-warning" data-message-too-long>{t('docSession.composer.tooLong', { max: DOC_SESSION_MESSAGE_MAX_BYTES })}</p>}
      {steerUnsupported && !closed && <p className="type-caption text-kumo-subtle" data-steer-unsupported>{t('docSession.composer.steerUnsupported')}</p>}
      {sent?.state === 'ok' && <p role="status" className="text-sm text-kumo-subtle" data-landed={sent.result.landed}>{t(`docSession.landed.${sent.result.landed}`)}</p>}
      {sent !== null && <SessionWriteResult outcome={sent} t={t} />}
      {stopped?.state === 'ok' && <p role="status" className="text-sm text-kumo-subtle" data-stop-result={stopped.result.result}>{t('docSession.stop.aborting')}</p>}
      {stopped !== null && <SessionWriteResult outcome={stopped} t={t} />}
    </section>
  );
}

type StepState = 'done' | 'pending' | 'failed';
const STEP_TONE: Readonly<Record<StepState, DotTone>> = { done: 'ok', failed: 'danger', pending: 'unknown' };
type CommitProgress = Extract<DocSessionProgress, { readonly operation: 'commit' }>;

/** The three delivery steps, read from the saved journal progress. */
function CommitSteps({ progress, t }: { readonly progress: CommitProgress; readonly t: OperatorTranslate }) {
  const steps: readonly (readonly ['commit' | 'push' | 'pull_request', StepState])[] = [
    ['commit', progress.stage === 'prepared' ? 'pending' : 'done'],
    ['push', progress.pushed ? 'done' : 'pending'],
    ['pull_request', progress.pr !== null ? 'done' : progress.stage === 'pr_failed' ? 'failed' : 'pending'],
  ];
  return (
    <div className="flex flex-col gap-2" data-delivery data-finalize-stage={progress.stage}>
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {steps.map(([step, state]) => (
          <li key={step} className="flex items-center gap-1.5" data-step={step} data-step-state={state}>
            <StatusDot tone={STEP_TONE[state]} />
            <span className="text-kumo-default">{t(`docSession.step.${step}`)}</span>
            <span className="text-xs text-kumo-subtle">{t(`docSession.step.state.${state}`)}</span>
          </li>
        ))}
      </ol>
      {progress.stage !== 'complete' && <p className="text-sm text-kumo-default" data-delivery-stopped={progress.stage}>{t(`docSession.finalize.stage.${progress.stage}`)}</p>}
      {progress.pr !== null && (
        <ExternalLink href={progress.pr.url} className="w-fit text-sm">{t('docSession.commit.pullRequest', { number: progress.pr.number })}</ExternalLink>
      )}
    </div>
  );
}

/** A resume needs the first request; without it the page says so and builds no new body. */
export function OriginalMissing({ answered, t }: { readonly answered: DocSessionWrite<unknown> | null; readonly t: OperatorTranslate }) {
  const action = answered?.state === 'refused' ? localizeDocSessionRefusal(answered.refusal, t).next_action : t('docSession.finalize.originalMissing.action');
  return <Banner variant="alert" data-original-missing title={t('docSession.finalize.originalMissing.message')} description={action} />;
}

/**
 * Commit, push and open a Draft PR (`4-DSES-P1`, C19). The first request
 * binds the diff the user read: its head and digest. The browser keeps that
 * request. Once the server may have saved it, every later request carries the
 * same fields (a changed field answers `finalization_conflict`), so the message
 * is locked and each retry resends the stored request with the step the server
 * did not finish. The progress shown is the `/finalization` read, never the
 * write answer.
 */
export function CommitControl({ sessionId, title, awaitingReview, diff, reviewed, progress, finalizationRead, writeCommit, onDiffChanged, onAnswered, t }: {
  readonly sessionId: string; readonly title: string; readonly awaitingReview: boolean;
  /** The current diff read; null while it is not loaded. */
  readonly diff: OperatorDocSessionDiffV1 | null;
  /** The user saw the diff view of this diff digest. */
  readonly reviewed: boolean;
  /** The commit progress of the last `/finalization` read. */
  readonly progress: CommitProgress | null;
  /** The last `/finalization` read as it came, so an answer can wait for a newer one. */
  readonly finalizationRead: DocSessionRead<unknown> | null;
  readonly writeCommit: DocSessionCommitWriter; readonly onDiffChanged: () => void; readonly onAnswered: () => void; readonly t: OperatorTranslate;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const commit = useSessionWrite<DocSessionCommitInput, null>(useCallback(body => writeCommit(sessionId, body), [writeCommit, sessionId]));
  const binding = useFinalizeBinding(sessionId, 'commit', finalizationRead, progress === null);
  const stored = storedFinalizeRequest(sessionId, 'commit');
  const text = stored?.message ?? message ?? title;
  const answered = commit.state.kind === 'answered' ? commit.state.outcome : null;
  const sending = commit.state.kind === 'sending';
  const resume = progress !== null && progress.stage !== 'complete';
  const send = async (body: DocSessionCommitInput, first: boolean) => {
    const outcome = await commit.submit(body);
    if (outcome === null) return;
    // A first-send refusal saved nothing; the stored body goes, and a diff_changed one needs a new diff read.
    if (first && refusalSavedNothing('commit', outcome)) {
      binding.release();
      if (outcome.state === 'refused' && outcome.refusal.code === 'diff_changed') { onDiffChanged(); return; }
    } else binding.awaitRead();
    onAnswered();
  };
  const first = async () => {
    if (diff === null) return;
    const body: DocSessionCommitInput = { expected_head: diff.head_commit, expected_diff_sha256: diff.diff_sha256, message: text };
    storeFinalizeRequest(sessionId, 'commit', body);
    await send(body, true);
  };
  const ready = stored !== null || (awaitingReview && diff !== null && diff.files.length > 0 && reviewed && text.trim() !== '');
  const hint = stored !== null ? 'docSession.commit.messageLocked' : !awaitingReview ? 'docSession.commit.notReady' : diff !== null && !reviewed ? 'docSession.commit.needsReview' : null;
  return (
    <section className="flex flex-col gap-3" data-commit aria-label={t('docSession.commit.submit')}>
      {progress !== null && <CommitSteps progress={progress} t={t} />}
      {progress === null && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="type-caption text-kumo-subtle">{t('docSession.commit.message')}</span>
            <input type="text" value={text} onChange={event => setMessage(event.target.value)} disabled={stored !== null} data-commit-message
              className="h-9 rounded-md border border-kumo-line bg-kumo-base px-3 text-sm text-kumo-default outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand disabled:cursor-not-allowed disabled:opacity-60" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void (stored !== null ? send(stored, false) : first())} disabled={!ready || sending} loading={sending} data-commit-submit="commit">
              {t(sending ? 'docSession.commit.sending' : 'docSession.commit.submit')}
            </Button>
            {hint !== null && <span className="text-sm text-kumo-subtle" data-commit-hint>{t(hint)}</span>}
          </div>
        </>
      )}
      {resume && stored !== null && (
        <Button variant="primary" className="w-fit" onClick={() => void send(stored, false)} disabled={sending} loading={sending} data-commit-submit="resume">
          {t('docSession.commit.retry')}
        </Button>
      )}
      {resume && stored === null && <OriginalMissing answered={answered} t={t} />}
      {answered !== null && <SessionWriteResult outcome={answered} t={t} />}
    </section>
  );
}
