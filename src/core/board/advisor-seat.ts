import type { BoardHostPortsV1, BoardSeatTerminalReadV1 } from './board';
import { hasUnredactedSecret, replaceSecrets } from '../security/secret-patterns';

/**
 * The advisor seat of one board (#1756, D11): the only console channel that
 * writes into an agent terminal. The board CLI resolves the target from the
 * hc seat labels and runs the send and the read; the operator routes run that
 * CLI and decode its result with the decoders here. A client never names a
 * terminal.
 */
export const ADVISOR_SEAT = 'advisor' as const;
export const ADVISOR_TEXT_MAX_CHARS = 4000;
/** The read-back is the last lines of `hc read --lines <this>`. */
export const ADVISOR_TRANSCRIPT_LINES = 200;
/**
 * Each read-back line is cut to this length before redaction. `containsSecret`
 * is quadratic on a long lowercase run, so one long line must not stall the read.
 */
export const ADVISOR_TRANSCRIPT_LINE_MAX_CHARS = 1000;
export const ADVISOR_TRANSCRIPT_LINE_WITHHELD = '[line withheld: secret]';

export const ADVISOR_SEAT_SEND_KIND = 'repo-harness.advisor-seat-send' as const;
export const ADVISOR_SEAT_TRANSCRIPT_KIND = 'repo-harness.advisor-seat-transcript' as const;

/** The board CLI failures; the operator routes add their registry, capacity, timeout and decode codes. */
export const ADVISOR_SEAT_CLI_FAILURES = ['text_invalid', 'hc_unavailable', 'advisor_seat_absent', 'advisor_seat_ambiguous', 'advisor_send_failed', 'advisor_read_failed'] as const;
export type AdvisorSeatCliFailure = typeof ADVISOR_SEAT_CLI_FAILURES[number];

/** Every refusal code of the two operator routes. */
export const ADVISOR_SEAT_FAILURES = [
  ...ADVISOR_SEAT_CLI_FAILURES,
  'repository_read_only', 'registry_unavailable', 'repository_not_found', 'github_unavailable',
  'advisor_busy', 'advisor_timeout', 'advisor_unavailable', 'advisor_invalid', 'invalid_request',
] as const;
export type AdvisorSeatFailure = typeof ADVISOR_SEAT_FAILURES[number];

export class AdvisorSeatError extends Error {
  constructor(readonly code: AdvisorSeatCliFailure, message: string) {
    super(message);
    this.name = 'AdvisorSeatError';
  }
}

export interface AdvisorSeatRequestV1 {
  readonly repository_id: string;
  readonly parent: number;
}

export interface AdvisorSeatMessageRequestV1 extends AdvisorSeatRequestV1 {
  readonly text: string;
}

interface AdvisorSeatTargetV1 {
  readonly protocol: 1;
  readonly github_repository_id: number;
  readonly parent: number;
  /** The advisor terminal that the CLI resolved from the seat labels. */
  readonly terminal: string;
}

export interface AdvisorSeatSendV1 extends AdvisorSeatTargetV1 {
  readonly kind: typeof ADVISOR_SEAT_SEND_KIND;
  readonly started: boolean | null;
  readonly turn: number;
}

export interface AdvisorSeatTranscriptV1 extends AdvisorSeatTargetV1 {
  readonly kind: typeof ADVISOR_SEAT_TRANSCRIPT_KIND;
  /** The seat's status word and turn as hc reported them with the seat labels. */
  readonly status: string | null;
  readonly status_kind: string | null;
  readonly turn: number;
  /** False when hc says part of the asked text may be missing; `why` names the reason. */
  readonly complete: boolean;
  readonly why: string | null;
  readonly lines: readonly string[];
}

const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const PARENT = /^[1-9][0-9]{0,9}$/u;
const ADDRESS = /^t[1-9][0-9bcdfghjkmnpqrstvwxyz]{0,6}$/u;
// Every C0 and C1 control character except the newline.
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u;

/** The text rule of a send: non-empty, at most ADVISOR_TEXT_MAX_CHARS characters, no control character except newline. */
export function advisorTextProblem(text: string): string | null {
  if (text === '') return 'the text is empty';
  if ([...text].length > ADVISOR_TEXT_MAX_CHARS) return `the text is longer than ${ADVISOR_TEXT_MAX_CHARS} characters`;
  if (CONTROL.test(text)) return 'the text holds a control character other than newline';
  return null;
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('advisor seat value is not an object');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError('advisor seat value has other fields');
  return value as Record<string, unknown>;
}

/** The parent as the query string or the CLI option spells it. */
export function decodeAdvisorParent(value: unknown): number {
  if (typeof value !== 'string' || !PARENT.test(value)) throw new TypeError('parent is not an issue number');
  return Number(value);
}

export function decodeAdvisorSeatRequest(value: unknown): AdvisorSeatRequestV1 {
  const fields = record(value, ['parent', 'repository_id']);
  if (typeof fields.repository_id !== 'string' || !REPOSITORY_ID.test(fields.repository_id)) throw new TypeError('repository_id is invalid');
  return { repository_id: fields.repository_id, parent: decodeAdvisorParent(fields.parent) };
}

/** The POST body without `request_id`. The parent is a JSON number here. */
export function decodeAdvisorSeatMessageRequest(value: unknown): AdvisorSeatMessageRequestV1 {
  const fields = record(value, ['parent', 'repository_id', 'text']);
  if (!Number.isSafeInteger(fields.parent) || (fields.parent as number) < 1) throw new TypeError('parent is not an issue number');
  const { repository_id, parent } = decodeAdvisorSeatRequest({ repository_id: fields.repository_id, parent: String(fields.parent) });
  if (typeof fields.text !== 'string' || advisorTextProblem(fields.text) !== null) throw new TypeError('text is invalid');
  return { repository_id, parent, text: fields.text };
}

function target(fields: Record<string, unknown>): AdvisorSeatTargetV1 {
  if (fields.protocol !== 1 || !Number.isSafeInteger(fields.github_repository_id) || (fields.github_repository_id as number) < 1
    || !Number.isSafeInteger(fields.parent) || (fields.parent as number) < 1 || typeof fields.terminal !== 'string' || !ADDRESS.test(fields.terminal)) {
    throw new TypeError('advisor seat target is invalid');
  }
  return { protocol: 1, github_repository_id: fields.github_repository_id as number, parent: fields.parent as number, terminal: fields.terminal };
}

const isTurn = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isTextOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string';

export function decodeAdvisorSeatSend(value: unknown): AdvisorSeatSendV1 {
  const fields = record(value, ['github_repository_id', 'kind', 'parent', 'protocol', 'started', 'terminal', 'turn']);
  if (fields.kind !== ADVISOR_SEAT_SEND_KIND || !(fields.started === null || typeof fields.started === 'boolean') || !isTurn(fields.turn)) {
    throw new TypeError('advisor seat send is invalid');
  }
  return { ...target(fields), kind: ADVISOR_SEAT_SEND_KIND, started: fields.started, turn: fields.turn };
}

/** A line that leaves the server is cut to the line limit, holds no newline and no unredacted secret. */
function isPublicLine(line: unknown): line is string {
  return typeof line === 'string' && line.length <= ADVISOR_TRANSCRIPT_LINE_MAX_CHARS && !line.includes('\n') && !hasUnredactedSecret(line);
}

export function decodeAdvisorSeatTranscript(value: unknown): AdvisorSeatTranscriptV1 {
  const fields = record(value, ['complete', 'github_repository_id', 'kind', 'lines', 'parent', 'protocol', 'status', 'status_kind', 'terminal', 'turn', 'why']);
  const { lines } = fields;
  if (fields.kind !== ADVISOR_SEAT_TRANSCRIPT_KIND || !isTextOrNull(fields.status) || !isTextOrNull(fields.status_kind) || !isTurn(fields.turn)
    || typeof fields.complete !== 'boolean' || !isTextOrNull(fields.why)
    || !Array.isArray(lines) || lines.length > ADVISOR_TRANSCRIPT_LINES || !lines.every(isPublicLine)) {
    throw new TypeError('advisor seat transcript is invalid');
  }
  return {
    ...target(fields), kind: ADVISOR_SEAT_TRANSCRIPT_KIND, status: fields.status, status_kind: fields.status_kind, turn: fields.turn,
    complete: fields.complete, why: fields.why, lines: Object.freeze([...lines]),
  };
}

/** One read-back line: cut first, then the shared token rules; a secret left over withholds the line. */
export function redactAdvisorLine(line: string): string {
  const redacted = replaceSecrets(line.slice(0, ADVISOR_TRANSCRIPT_LINE_MAX_CHARS));
  return hasUnredactedSecret(redacted) ? ADVISOR_TRANSCRIPT_LINE_WITHHELD : redacted;
}

/**
 * Exactly one live terminal with the advisor seat label. The host read holds
 * only the seat terminals of this repository and parent, without the watcher.
 */
export function resolveAdvisorSeat(terminals: readonly BoardSeatTerminalReadV1[]): BoardSeatTerminalReadV1 {
  const advisors = terminals.filter(terminal => terminal.state === 'live' && terminal.labels.seat === ADVISOR_SEAT);
  if (advisors.length === 0) throw new AdvisorSeatError('advisor_seat_absent', 'No live terminal carries the advisor seat label of this repository and parent.');
  if (advisors.length > 1) {
    throw new AdvisorSeatError('advisor_seat_ambiguous', `More than one live terminal carries the advisor seat label: ${advisors.map(terminal => terminal.address).join(', ')}.`);
  }
  return advisors[0]!;
}

interface AdvisorSeatScope {
  readonly github_repository_id: number;
  readonly parent: number;
  readonly host: BoardHostPortsV1;
}

function advisorSeat(scope: AdvisorSeatScope): BoardSeatTerminalReadV1 {
  const read = scope.host.seatTerminals(String(scope.github_repository_id), scope.parent);
  if (read.status === 'unavailable') throw new AdvisorSeatError('hc_unavailable', `hc did not list the seat terminals: ${read.reason}`);
  return resolveAdvisorSeat(read.terminals);
}

/** Check the text, resolve the one advisor terminal, and send the text to it as plain text. */
export function sendToAdvisorSeat(scope: AdvisorSeatScope, text: string): AdvisorSeatSendV1 {
  const problem = advisorTextProblem(text);
  if (problem !== null) throw new AdvisorSeatError('text_invalid', `The advisor message is refused: ${problem}.`);
  const seat = advisorSeat(scope);
  const sent = scope.host.advisorSend(seat.address, text);
  if (sent.status === 'unavailable') throw new AdvisorSeatError('advisor_send_failed', `hc did not send to ${seat.address}: ${sent.reason}`);
  return {
    protocol: 1, kind: ADVISOR_SEAT_SEND_KIND, github_repository_id: scope.github_repository_id, parent: scope.parent,
    terminal: seat.address, started: sent.started, turn: sent.turn,
  };
}

/** Resolve the one advisor terminal and read its last lines; every line is redacted before it is returned. */
export function readAdvisorSeat(scope: AdvisorSeatScope): AdvisorSeatTranscriptV1 {
  const seat = advisorSeat(scope);
  const read = scope.host.advisorRead(seat.address, ADVISOR_TRANSCRIPT_LINES);
  if (read.status === 'unavailable') throw new AdvisorSeatError('advisor_read_failed', `hc did not read ${seat.address}: ${read.reason}`);
  return {
    protocol: 1, kind: ADVISOR_SEAT_TRANSCRIPT_KIND, github_repository_id: scope.github_repository_id, parent: scope.parent,
    terminal: seat.address, status: seat.status, status_kind: seat.status_kind, turn: seat.turn, complete: read.complete, why: read.why,
    lines: Object.freeze(read.text.split('\n').slice(-ADVISOR_TRANSCRIPT_LINES).map(redactAdvisorLine)),
  };
}
