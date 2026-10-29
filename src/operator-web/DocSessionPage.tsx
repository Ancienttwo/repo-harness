import { useEffect } from 'react';
import { Banner, Loader } from '@cloudflare/kumo';
import type { DocSessionCitationView } from '../core/operator/doc-session-api';
import { Conversation } from './Conversation';
import {
  docSessionReadText,
  markSessionSeen,
  useDocSessionDetail,
  useDocSessionEvents,
  type DocSessionCommitWriter,
  type DocSessionDetailReader,
  type DocSessionDiffReader,
  type DocSessionDiscardWriter,
  type DocSessionEventsReader,
  type DocSessionEventsView,
  type DocSessionLossReader,
  type DocSessionMessageWriter,
  type DocSessionReadReason,
  type DocSessions,
  type DocSessionStopWriter,
} from './doc-sessions';
import type { OperatorTranslate } from './i18n';
import type { WorkspaceLocation } from './workspace-location';

export interface DocSessionPageProps {
  /** The 32-hex id from `#session/<id>`. */
  readonly sessionId: string;
  /** The one list read; `absent` means this server serves no doc session. */
  readonly docSessions: DocSessions;
  readonly readDetail: DocSessionDetailReader;
  readonly readEvents: DocSessionEventsReader;
  readonly readDiff: DocSessionDiffReader;
  readonly readLoss: DocSessionLossReader;
  readonly writeMessage: DocSessionMessageWriter;
  readonly writeStop: DocSessionStopWriter;
  readonly writeCommit: DocSessionCommitWriter;
  readonly writeDiscard: DocSessionDiscardWriter;
  readonly generation: number;
  readonly now: number;
  readonly onOpen: (next: WorkspaceLocation) => void;
  readonly t: OperatorTranslate;
}

/** A session read that failed: which source, why, and what to do next. */
export function SessionReadFailure({ source, reason, t }: { readonly source: string; readonly reason: DocSessionReadReason; readonly t: OperatorTranslate }) {
  const text = docSessionReadText(reason, t);
  return <Banner variant="error" data-session-failure={reason} title={`${source} · ${text.message}`} description={text.next_action} />;
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

/** One doc session (4-DSES). This shell shows the record; the review, composer and delivery controls come with the page slice. */
export function DocSessionPage({ sessionId, docSessions, readDetail, readEvents, generation, t }: DocSessionPageProps) {
  const listed = docSessions.view.kind !== 'absent';
  const { read: detail } = useDocSessionDetail(readDetail, listed ? sessionId : null, generation);
  const events = useDocSessionEvents(readEvents, listed ? sessionId : null);
  const header = (
    <header className="border-b border-kumo-hairline pb-4">
      <h1 className="text-xl font-semibold text-kumo-strong [overflow-wrap:anywhere]">{detail?.state === 'ok' ? detail.value.title : t('docSession.title')}</h1>
    </header>
  );
  if (!listed) return <div className="flex min-w-0 flex-col gap-5" data-doc-session-page="absent">{header}<p role="status" className="text-sm text-kumo-subtle">{t('docSession.absent')}</p></div>;
  return (
    <div className="flex min-w-0 flex-col gap-5" data-doc-session-page={sessionId}>
      {header}
      {detail?.state === 'unavailable' && <SessionReadFailure source={t('docSession.source.detail')} reason={detail.reason} t={t} />}
      <SessionRecord sessionId={sessionId} events={events} runtime={detail?.state === 'ok' ? detail.value.runtime : null}
        citations={detail?.state === 'ok' ? detail.value.citations : undefined} t={t} />
    </div>
  );
}
