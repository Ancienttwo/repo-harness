import { useCallback, useState } from 'react';
import { Banner, Button, cn } from '@cloudflare/kumo';
import {
  DOC_SESSION_COMMIT_MESSAGE_MAX,
  DOC_SESSION_MESSAGE_MAX,
  DOC_SESSION_MESSAGE_WHEN,
  type DocSessionDeliveryV1,
  type DocSessionMessageWhen,
  type DocSessionStepState,
  type OperatorDocSessionCommitV1,
  type OperatorDocSessionDetailV1,
  type OperatorDocSessionMessageV1,
  type OperatorDocSessionStopV1,
} from '../core/operator/doc-session-api';
import type { OperatorDocSessionDiffV1 } from '../core/operator/doc-session-changes';
import {
  localizeDocSessionRefusal,
  useSessionWrite,
  type DocSessionCommitRequest,
  type DocSessionCommitWriter,
  type DocSessionMessageRequest,
  type DocSessionMessageWriter,
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
        {refusal.paths.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5" data-refusal-paths>
            {refusal.paths.map(path => <li key={path}><code className="font-mono text-xs [overflow-wrap:anywhere]">{path}</code></li>)}
          </ul>
        )}
        {/* A pushed branch is never deleted from the page; the server names the command. */}
        {refusal.code === 'branch_pushed' && <CommandLine command={refusal.next_action} t={t} className="mt-2" />}
      </>} />
  );
}

/** A follow-up message to the doc session's agent (`4-DSES-P2`), and「停止」while a turn runs. */
export function FollowUp({ sessionId, detail, writeMessage, writeStop, onSent, t }: {
  readonly sessionId: string; readonly detail: OperatorDocSessionDetailV1;
  readonly writeMessage: DocSessionMessageWriter; readonly writeStop: DocSessionStopWriter;
  readonly onSent: () => void; readonly t: OperatorTranslate;
}) {
  const [text, setText] = useState('');
  const [when, setWhen] = useState<DocSessionMessageWhen>('after_turn');
  const message = useSessionWrite<DocSessionMessageRequest, OperatorDocSessionMessageV1>(
    useCallback(body => writeMessage(sessionId, body), [writeMessage, sessionId]));
  const stop = useSessionWrite<object, OperatorDocSessionStopV1>(useCallback((body: RequestId) => writeStop(sessionId, body), [writeStop, sessionId]));
  const closed = detail.outcome !== null || detail.agent === 'stopped' || detail.agent === 'failed';
  const steerUnsupported = detail.steer === 'unsupported';
  const sending = message.state.kind === 'sending';
  const send = async () => {
    const outcome = await message.submit({ text, when });
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
        <textarea value={text} onChange={event => setText(event.target.value)} disabled={closed} maxLength={DOC_SESSION_MESSAGE_MAX} rows={3}
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
          {detail.agent === 'running' && (
            <Button variant="secondary" size="sm" onClick={() => void halt()} disabled={stop.state.kind === 'sending'} data-stop>{t('docSession.composer.stop')}</Button>
          )}
          <Button variant="primary" size="sm" onClick={() => void send()} disabled={closed || sending || text.trim() === ''} data-send>
            {t(sending ? 'docSession.composer.sending' : 'docSession.composer.send')}
          </Button>
        </div>
      </div>
      {steerUnsupported && !closed && <p className="type-caption text-kumo-subtle" data-steer-unsupported>{t('docSession.composer.steerUnsupported')}</p>}
      {sent?.state === 'ok' && <p role="status" className="text-sm text-kumo-subtle" data-landed={sent.result.landed}>{t(`docSession.landed.${sent.result.landed}`)}</p>}
      {sent !== null && <SessionWriteResult outcome={sent} t={t} />}
      {stopped?.state === 'ok' && <p role="status" className="text-sm text-kumo-subtle" data-stop-result={stopped.result.result}>{t('docSession.stop.aborting')}</p>}
      {stopped !== null && <SessionWriteResult outcome={stopped} t={t} />}
    </section>
  );
}

const STEP_TONE: Readonly<Record<DocSessionStepState, DotTone>> = { done: 'ok', failed: 'danger', pending: 'unknown' };

function DeliverySteps({ delivery, t }: { readonly delivery: DocSessionDeliveryV1; readonly t: OperatorTranslate }) {
  const failed = delivery.steps.find(step => step.state === 'failed');
  return (
    <div className="flex flex-col gap-2" data-delivery>
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {delivery.steps.map(step => (
          <li key={step.step} className="flex items-center gap-1.5" data-step={step.step} data-step-state={step.state}>
            <StatusDot tone={STEP_TONE[step.state]} />
            <span className="text-kumo-default">{t(`docSession.step.${step.step}`)}</span>
            <span className="text-xs text-kumo-subtle">{t(`docSession.step.state.${step.state}`)}</span>
          </li>
        ))}
      </ol>
      {failed !== undefined && <p className="text-sm text-kumo-danger" data-delivery-stopped={failed.step}>{t('docSession.commit.stopped', { step: t(`docSession.step.${failed.step}`) })}</p>}
      {delivery.pull_request !== null && (
        <ExternalLink href={delivery.pull_request.url} className="w-fit text-sm">{t('docSession.commit.pullRequest', { number: delivery.pull_request.number })}</ExternalLink>
      )}
    </div>
  );
}

/**
 * Commit, push and open a Draft PR (`4-DSES-P1`, C19). The request binds the
 * diff the user read: its head and digest. A delivery that stopped at a step
 * resumes through the same request; the server skips the steps already done.
 */
export function CommitControl({ sessionId, title, awaitingReview, diff, reviewed, delivery, writeCommit, onDiffChanged, onDelivered, t }: {
  readonly sessionId: string; readonly title: string; readonly awaitingReview: boolean;
  /** The current diff read; null while it is not loaded. */
  readonly diff: OperatorDocSessionDiffV1 | null;
  /** The user saw the diff view of this diff digest. */
  readonly reviewed: boolean;
  /** The delivery the session detail last reported. */
  readonly delivery: DocSessionDeliveryV1 | null;
  readonly writeCommit: DocSessionCommitWriter; readonly onDiffChanged: () => void; readonly onDelivered: () => void; readonly t: OperatorTranslate;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const commit = useSessionWrite<DocSessionCommitRequest, OperatorDocSessionCommitV1>(
    useCallback(body => writeCommit(sessionId, body), [writeCommit, sessionId]));
  const text = message ?? title;
  const answered = commit.state.kind === 'answered' ? commit.state.outcome : null;
  const shown = answered?.state === 'ok' ? answered.result.delivery : delivery;
  const done = shown !== null && shown.steps.every(step => step.state === 'done');
  const resume = shown !== null && shown.steps.some(step => step.state === 'failed');
  const ready = awaitingReview && diff !== null && diff.files.length > 0 && reviewed && text.trim() !== '';
  const sending = commit.state.kind === 'sending';
  const submit = async () => {
    if (diff === null) return;
    const outcome = await commit.submit({ expected_head: diff.head_commit, expected_diff_sha256: diff.diff_sha256, message: text });
    if (outcome?.state === 'refused' && outcome.refusal.code === 'diff_changed') onDiffChanged();
    if (outcome?.state === 'ok') onDelivered();
  };
  const hint = !awaitingReview ? 'docSession.commit.notReady' : diff !== null && !reviewed ? 'docSession.commit.needsReview' : null;
  return (
    <section className="flex flex-col gap-3" data-commit aria-label={t('docSession.commit.submit')}>
      {shown !== null && <DeliverySteps delivery={shown} t={t} />}
      {!done && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="type-caption text-kumo-subtle">{t('docSession.commit.message')}</span>
            <input type="text" value={text} onChange={event => setMessage(event.target.value)} maxLength={DOC_SESSION_COMMIT_MESSAGE_MAX} data-commit-message
              className="h-9 rounded-md border border-kumo-line bg-kumo-base px-3 text-sm text-kumo-default outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void submit()} disabled={!ready || sending} loading={sending} data-commit-submit={resume ? 'resume' : 'commit'}>
              {t(resume ? 'docSession.commit.retry' : sending ? 'docSession.commit.sending' : 'docSession.commit.submit')}
            </Button>
            {hint !== null && <span className="text-sm text-kumo-subtle" data-commit-hint>{t(hint)}</span>}
          </div>
        </>
      )}
      {answered !== null && <SessionWriteResult outcome={answered} t={t} />}
    </section>
  );
}
