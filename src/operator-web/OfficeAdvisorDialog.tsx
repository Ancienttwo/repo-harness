import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { XIcon } from '@phosphor-icons/react';
import {
  ADVISOR_TEXT_MAX_CHARS, advisorTurnState, decodeAdvisorSeatSend, decodeAdvisorSeatTranscript,
  type AdvisorSeatMessageRequestV1, type AdvisorSeatRequestV1, type AdvisorSeatSendV1, type AdvisorSeatTranscriptV1,
} from '../core/board/advisor-seat';
import { useModalFocus } from './Drawer';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { asApiError, type OperatorApiErrorV1 } from './operator-api-error';
import { postOperatorWrite, WriteReloadBanner, type OperatorWriteAnswer, type OperatorWriteFailure } from './operator-write';

/**
 * The advisor seat dialog of the office room (#1809): browser side of the two
 * #1756 routes. The server owns the redaction and the status: the page draws
 * only what the decoders return. The read-back runs on open and after each
 * send. No background read runs, because the room polls no transcript.
 */
const MESSAGES_PATH = '/api/v1/seats/advisor/messages';
const TRANSCRIPT_PATH = '/api/v1/seats/advisor/transcript';

export type AdvisorTranscriptRead =
  | { readonly state: 'ok'; readonly transcript: AdvisorSeatTranscriptV1 }
  | { readonly state: 'refused'; readonly error: OperatorApiErrorV1 }
  | { readonly state: 'unreachable' }
  | { readonly state: 'unreadable' };
export type AdvisorTranscriptReader = (subject: AdvisorSeatRequestV1, signal: AbortSignal) => Promise<AdvisorTranscriptRead>;

export type AdvisorMessagePost = AdvisorSeatMessageRequestV1 & { readonly request_id: string };
export type AdvisorMessageWrite = OperatorWriteAnswer<AdvisorSeatSendV1>;
export type AdvisorMessageWriter = (body: AdvisorMessagePost) => Promise<AdvisorMessageWrite>;

const UNTYPED: OperatorApiErrorV1 = Object.freeze({ code: '', message: '', next_action: '' });

export async function fetchAdvisorTranscript(subject: AdvisorSeatRequestV1, signal: AbortSignal): Promise<AdvisorTranscriptRead> {
  const query = new URLSearchParams({ repository_id: subject.repository_id, parent: String(subject.parent) });
  let response: Response;
  try {
    response = await fetch(`${TRANSCRIPT_PATH}?${query}`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = asApiError(body, UNTYPED);
    return error === UNTYPED ? { state: 'unreachable' } : { state: 'refused', error };
  }
  try { return { state: 'ok', transcript: decodeAdvisorSeatTranscript(body) }; } catch { return { state: 'unreadable' }; }
}

export const postAdvisorMessage: AdvisorMessageWriter = body => postOperatorWrite(MESSAGES_PATH, body, decodeAdvisorSeatSend);

/** The refusals with their own text; the route decoder and the body cap refuse the same bad text as `text_invalid` does. */
const TEXT_REFUSALS: readonly string[] = ['text_invalid', 'invalid_body', 'body_too_large'];
const CODE_NOTICES: readonly string[] = [
  'repository_read_only', 'repository_not_found', 'registry_unavailable', 'github_unavailable', 'hc_unavailable',
  'advisor_seat_absent', 'advisor_seat_ambiguous', 'advisor_busy', 'advisor_read_failed', 'advisor_timeout', 'advisor_unavailable', 'advisor_invalid',
];

const refusalText = (error: OperatorApiErrorV1, t: OperatorTranslate): string => (TEXT_REFUSALS.includes(error.code)
  ? t('board.office.advisor.notice.text_invalid', { max: ADVISOR_TEXT_MAX_CHARS })
  : CODE_NOTICES.includes(error.code) ? t(`board.office.advisor.notice.${error.code}` as OperatorMessageKey) : `${error.message} ${error.next_action}`);

/** Every other refusal proves that nothing was sent; `reconcile_required` does not, so it asks for a read and never for a resend. */
function sendNoticeText(failure: Exclude<OperatorWriteFailure, { readonly state: 'reload_required' }>, t: OperatorTranslate): string {
  if (failure.state !== 'refused') return t(`board.office.advisor.notice.${failure.state}`);
  if (failure.error.code === 'reconcile_required') return t('board.office.advisor.notice.reconcile_required');
  return `${refusalText(failure.error, t)} ${t('board.office.advisor.notice.notSent')}`;
}

function ReadBack({ read, reading, t }: { readonly read: AdvisorTranscriptRead | null; readonly reading: boolean; readonly t: OperatorTranslate }) {
  const logRef = useRef<HTMLPreElement | null>(null);
  const lines = read?.state === 'ok' ? read.transcript.lines : null;
  // The newest terminal text is at the end of the read-back.
  useEffect(() => {
    if (logRef.current !== null) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);
  if (read === null) return <p className="board-office__advisor-state" data-advisor-loading>{t('board.office.advisor.loading')}</p>;
  if (read.state !== 'ok') {
    const code = read.state === 'refused' ? read.error.code : read.state;
    return <p className="board-office__notice board-office__advisor-state" role="status" data-advisor-read-failure={code}>{read.state === 'refused' ? refusalText(read.error, t) : t(`board.office.advisor.read.${read.state}`)}</p>;
  }
  const { complete, why } = read.transcript;
  return (
    <>
      {!complete && <p className="board-office__notice board-office__advisor-state" data-advisor-incomplete>{why === null ? t('board.office.advisor.incomplete') : `${t('board.office.advisor.incomplete')} ${why}`}</p>}
      {lines!.length === 0
        ? <p className="board-office__advisor-state" data-advisor-empty>{t('board.office.advisor.empty')}</p>
        : <pre ref={logRef} className="board-office__advisor-log" tabIndex={0} aria-label={t('board.office.advisor.readback')} aria-busy={reading} data-advisor-readback>{lines!.join('\n')}</pre>}
    </>
  );
}

export function OfficeAdvisorDialog({ repositoryId, parent, agent, portrait, read, write, onClose, t }: {
  readonly repositoryId: string; readonly parent: number; readonly agent: string; readonly portrait: ReactNode;
  readonly read: AdvisorTranscriptReader; readonly write: AdvisorMessageWriter;
  readonly onClose: () => void; readonly t: OperatorTranslate;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const readControl = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const [transcript, setTranscript] = useState<AdvisorTranscriptRead | null>(null);
  const [reading, setReading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<AdvisorSeatSendV1 | null>(null);
  const [failure, setFailure] = useState<OperatorWriteFailure | null>(null);

  const refresh = useCallback(() => {
    readControl.current?.abort();
    const control = new AbortController();
    readControl.current = control;
    setReading(true);
    read({ repository_id: repositoryId, parent }, control.signal).then((answer) => {
      if (control.signal.aborted) return;
      setReading(false);
      setTranscript(answer);
    }, (error: unknown) => {
      if (!control.signal.aborted) throw error;
    });
  }, [read, repositoryId, parent]);

  useEffect(() => {
    refresh();
    return () => readControl.current?.abort();
  }, [refresh]);

  // A close during a send would drop its answer, and the owner must see a refusal or a reconcile notice.
  const close = () => { if (!inFlight.current) onClose(); };
  useModalFocus({ dialogRef, closeRef: fieldRef, identity: 'board-office-advisor', onClose: close });

  const text = draft.trim();
  const locked = sending || reading || text === '';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (locked || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setSent(null);
    setFailure(null);
    void write({ request_id: crypto.randomUUID(), repository_id: repositoryId, parent, text }).then((answer) => {
      inFlight.current = false;
      setSending(false);
      if (answer.state === 'ok') {
        setDraft('');
        setSent(answer.value);
      } else {
        setFailure(answer);
      }
      refresh();
    });
  };

  const seat = transcript?.state === 'ok' ? transcript.transcript : null;
  const turn = seat === null ? null : advisorTurnState(seat.status);
  return (
    <div className="board-office__overlay">
      <div ref={dialogRef} className="board-office__advisor" role="dialog" aria-modal="true" aria-labelledby="board-office-advisor-title" data-advisor-dialog>
        <header>
          <span className="board-office__portrait" aria-hidden="true">{portrait}</span>
          <div>
            <h2 id="board-office-advisor-title">{t('board.office.lead.advisor')}</h2>
            <span data-advisor-seat>{seat === null ? agent : t('board.office.advisor.seat', { terminal: seat.terminal, agent, status: seat.status ?? t('board.office.panel.none'), turn: seat.turn })}</span>
          </div>
          {turn !== null && <span className="board-office__advisor-turn" data-advisor-turn={turn}>{t(`board.office.advisor.turn.${turn}`)}</span>}
          <button type="button" className="board-office__advisor-close" aria-label={t('board.office.advisor.close')} aria-disabled={sending} data-advisor-close onClick={close}>
            <XIcon size={16} aria-hidden="true" />
          </button>
        </header>
        <ReadBack read={transcript} reading={reading} t={t} />
        {sent !== null && <p className="board-office__advisor-sent" role="status" data-advisor-sent={sent.turn}>{t('board.office.advisor.sent', { terminal: sent.terminal, turn: sent.turn })}</p>}
        {failure?.state === 'reload_required'
          ? <div className="board-office__advisor-state"><WriteReloadBanner t={t} /></div>
          : failure !== null && <p className="board-office__notice board-office__advisor-state" role="status" data-advisor-notice={failure.state === 'refused' ? failure.error.code : failure.state}>{sendNoticeText(failure, t)}</p>}
        <form onSubmit={submit}>
          <textarea ref={fieldRef} rows={2} value={draft} aria-label={t('board.office.advisor.field')} placeholder={t('board.office.advisor.field')} data-advisor-text onChange={event => setDraft(event.target.value)} />
          <button type="submit" aria-disabled={locked} data-advisor-send>{t(sending ? 'board.office.advisor.sending' : 'board.office.advisor.send')}</button>
        </form>
      </div>
    </div>
  );
}
