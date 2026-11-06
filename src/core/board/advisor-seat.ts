import type { BoardHostPortsV1, BoardSeatTerminalReadV1 } from './board';
import { hasUnredactedSecret, KEY_BEGIN, KEY_END, replaceSecrets } from '../security/secret-patterns';
import { HC_LOCAL_ADDRESS } from '../terminal/hc-address';

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
 * A read-back line longer than this, before or after redaction, is withheld,
 * never cut: a cut could leave a secret fragment that no rule matches. No rule
 * runs on a longer line.
 */
export const ADVISOR_TRANSCRIPT_LINE_MAX_CHARS = 1000;
/** The one text of a withheld read-back line. */
export const ADVISOR_TRANSCRIPT_LINE_WITHHELD = '[line withheld]';

export const ADVISOR_SEAT_SEND_KIND = 'repo-harness.advisor-seat-send' as const;
export const ADVISOR_SEAT_SEND_FAILURE_KIND = 'repo-harness.advisor-seat-send-failure' as const;
export const ADVISOR_SEAT_TRANSCRIPT_KIND = 'repo-harness.advisor-seat-transcript' as const;

/**
 * The board CLI failures; the operator routes add their registry, capacity,
 * timeout and decode codes. `advisor_send_unconfirmed`: `hc send` ran or may
 * have run and did not confirm, so the text may have reached the seat.
 */
export const ADVISOR_SEAT_CLI_FAILURES = ['text_invalid', 'hc_unavailable', 'advisor_seat_absent', 'advisor_seat_ambiguous', 'advisor_send_unconfirmed', 'advisor_read_failed'] as const;
export type AdvisorSeatCliFailure = typeof ADVISOR_SEAT_CLI_FAILURES[number];

/**
 * Every refusal code of the operator advisor routes. The boss command route
 * adds `boss_cooldown`, `advisor_turn_running` and `advisor_turn_unknown`;
 * each stops before a send.
 */
export const ADVISOR_SEAT_FAILURES = [
  ...ADVISOR_SEAT_CLI_FAILURES,
  'repository_read_only', 'registry_unavailable', 'repository_not_found', 'github_unavailable',
  'advisor_busy', 'advisor_timeout', 'advisor_unavailable', 'advisor_invalid', 'invalid_request',
  'boss_cooldown', 'advisor_turn_running', 'advisor_turn_unknown',
] as const;
export type AdvisorSeatFailure = typeof ADVISOR_SEAT_FAILURES[number];

/**
 * The send failures that prove the text was not sent: each one stops before
 * `hc send` runs. Any other failure of a send leaves delivery unknown.
 */
export const ADVISOR_SEAT_NOT_SENT: ReadonlySet<AdvisorSeatFailure> = new Set<AdvisorSeatFailure>([
  'text_invalid', 'hc_unavailable', 'advisor_seat_absent', 'advisor_seat_ambiguous',
  'repository_read_only', 'repository_not_found', 'registry_unavailable', 'github_unavailable', 'advisor_busy',
  'boss_cooldown', 'advisor_turn_running', 'advisor_turn_unknown',
]);

/**
 * The four boss commands (#1757, owner M71): preset texts to the advisor seat
 * only. The client sends the id; the server fills `{parent}` and owns the
 * cooldown. The ids are the `RH_CMD_KEYS` of the approved mockup (#1737).
 */
export const ADVISOR_BOSS_COMMANDS = ['rage', 'carrot', 'mine', 'valve'] as const;
export type AdvisorBossCommand = typeof ADVISOR_BOSS_COMMANDS[number];

export const ADVISOR_BOSS_COMMAND_TABLE: Readonly<Record<AdvisorBossCommand, { readonly cooldown_seconds: number; readonly text: string }>> = Object.freeze({
  rage: {
    cooldown_seconds: 30 * 60,
    text: '【大棒】检查 parent #{parent} 下的执行席和审查席：列出超过时限、没有新提交、推送、评论或 CI 变化的席位，每个给一条处理建议（催一下、重派或停掉）。催一下的直接交给编排席；重派和停掉先回复我，等我确认。',
  },
  carrot: {
    cooldown_seconds: 60 * 60,
    text: '【萝卜】按当前席位上限和配额状态，为 parent #{parent} 提出下一批可并行派工的 issue、写入范围和顺序。只回复方案，等我批准后再交给编排席。',
  },
  mine: {
    cooldown_seconds: 30 * 60,
    text: '【排雷】对比 parent #{parent} 在跑和排队任务的写入范围，列出每个冲突（文件、涉及的 issue）和消除冲突的顺序。只回复结果，不派工。',
  },
  valve: {
    cooldown_seconds: 60 * 60,
    text: '【收放】按配额报告（`repo-harness quota`）和 parent #{parent} 的队列长度，提议新的执行席上限（例如 6 → 5）和理由。只回复方案，等我批准。',
  },
});

/**
 * The advisor turn as the read-back `status` (the hc status word) proves it.
 * A boss command goes only to a seat whose turn is over: an allow list, so a
 * missing or new status word never sends. With `blocked` the text and Enter
 * could answer a pending prompt.
 */
const ADVISOR_TURN_OVER: readonly string[] = ['idle', 'done'];
const ADVISOR_TURN_RUNNING: readonly string[] = ['working', 'blocked'];

export function advisorTurnState(status: string | null): 'over' | 'running' | 'unknown' {
  if (status !== null && ADVISOR_TURN_OVER.includes(status)) return 'over';
  return status !== null && ADVISOR_TURN_RUNNING.includes(status) ? 'running' : 'unknown';
}

export function advisorBossCommandText(command: AdvisorBossCommand, parent: number): string {
  return ADVISOR_BOSS_COMMAND_TABLE[command].text.replace('{parent}', String(parent));
}

/** The whole seconds left in the cooldown of one command after its counted sends; 0 when none is inside it. */
export function advisorBossCooldownSeconds(command: AdvisorBossCommand, sentAtMs: readonly number[], nowMs: number): number {
  const window = ADVISOR_BOSS_COMMAND_TABLE[command].cooldown_seconds * 1000;
  return sentAtMs.reduce((remaining, at) => Math.max(remaining, Math.ceil((at + window - nowMs) / 1000)), 0);
}

export class AdvisorSeatError extends Error {
  constructor(
    readonly code: AdvisorSeatCliFailure,
    message: string,
    /** The resolved advisor terminal; null when the failure came before the seat was resolved. */
    readonly terminal: string | null = null,
  ) {
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

export interface AdvisorBossCommandRequestV1 extends AdvisorSeatRequestV1 {
  readonly command: AdvisorBossCommand;
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

/** A failed send as the CLI reports it; `terminal` is null when the seat was not resolved. */
export interface AdvisorSeatSendFailureV1 {
  readonly protocol: 1;
  readonly kind: typeof ADVISOR_SEAT_SEND_FAILURE_KIND;
  readonly github_repository_id: number;
  readonly parent: number;
  readonly terminal: string | null;
  readonly code: AdvisorSeatCliFailure;
}

/**
 * The `advisor_seat` field of the recorded result of a failed send, so the
 * audit names the board seat of every outcome. `terminal` is null when the
 * seat was not resolved; `delivery` is `unknown` when `hc send` may have run.
 * It never holds the message text.
 */
export interface AdvisorSeatSendOutcomeV1 {
  readonly repository_id: string;
  readonly parent: number;
  readonly terminal: string | null;
  readonly code: AdvisorSeatFailure;
  readonly delivery: 'not_sent' | 'unknown';
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

/** The repository and the parent of a POST body; the parent is a JSON number there. */
function decodeAdvisorPostScope(fields: Record<string, unknown>): AdvisorSeatRequestV1 {
  if (!Number.isSafeInteger(fields.parent) || (fields.parent as number) < 1) throw new TypeError('parent is not an issue number');
  return decodeAdvisorSeatRequest({ repository_id: fields.repository_id, parent: String(fields.parent) });
}

/** The POST body without `request_id`. */
export function decodeAdvisorSeatMessageRequest(value: unknown): AdvisorSeatMessageRequestV1 {
  const fields = record(value, ['parent', 'repository_id', 'text']);
  const { repository_id, parent } = decodeAdvisorPostScope(fields);
  if (typeof fields.text !== 'string' || advisorTextProblem(fields.text) !== null) throw new TypeError('text is invalid');
  return { repository_id, parent, text: fields.text };
}

/** The boss command POST body without `request_id`: the command id, never a text. */
export function decodeAdvisorBossCommandRequest(value: unknown): AdvisorBossCommandRequestV1 {
  const fields = record(value, ['command', 'parent', 'repository_id']);
  const { repository_id, parent } = decodeAdvisorPostScope(fields);
  if (!(ADVISOR_BOSS_COMMANDS as readonly unknown[]).includes(fields.command)) throw new TypeError('command is not a boss command');
  return { repository_id, parent, command: fields.command as AdvisorBossCommand };
}

function target(fields: Record<string, unknown>): AdvisorSeatTargetV1 {
  if (fields.protocol !== 1 || !Number.isSafeInteger(fields.github_repository_id) || (fields.github_repository_id as number) < 1
    || !Number.isSafeInteger(fields.parent) || (fields.parent as number) < 1 || typeof fields.terminal !== 'string' || !HC_LOCAL_ADDRESS.test(fields.terminal)) {
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

export function decodeAdvisorSeatSendFailure(value: unknown): AdvisorSeatSendFailureV1 {
  const fields = record(value, ['code', 'github_repository_id', 'kind', 'parent', 'protocol', 'terminal']);
  if (fields.protocol !== 1 || fields.kind !== ADVISOR_SEAT_SEND_FAILURE_KIND
    || !Number.isSafeInteger(fields.github_repository_id) || (fields.github_repository_id as number) < 1
    || !Number.isSafeInteger(fields.parent) || (fields.parent as number) < 1
    || !(fields.terminal === null || (typeof fields.terminal === 'string' && HC_LOCAL_ADDRESS.test(fields.terminal)))
    || !(ADVISOR_SEAT_CLI_FAILURES as readonly unknown[]).includes(fields.code)) {
    throw new TypeError('advisor seat send failure is invalid');
  }
  return {
    protocol: 1, kind: ADVISOR_SEAT_SEND_FAILURE_KIND, github_repository_id: fields.github_repository_id as number,
    parent: fields.parent as number, terminal: fields.terminal, code: fields.code as AdvisorSeatCliFailure,
  };
}

/** A line that leaves the server is within the line limit, holds no newline and no unredacted secret. */
function isPublicLine(line: unknown): line is string {
  return typeof line === 'string' && line.length <= ADVISOR_TRANSCRIPT_LINE_MAX_CHARS && !line.includes('\n') && !hasUnredactedSecret(line);
}

export function decodeAdvisorSeatTranscript(value: unknown): AdvisorSeatTranscriptV1 {
  const fields = record(value, ['complete', 'github_repository_id', 'kind', 'lines', 'parent', 'protocol', 'status', 'status_kind', 'terminal', 'turn', 'why']);
  const { lines } = fields;
  if (fields.kind !== ADVISOR_SEAT_TRANSCRIPT_KIND || !isTextOrNull(fields.status) || !isTextOrNull(fields.status_kind) || !isTurn(fields.turn)
    || typeof fields.complete !== 'boolean' || !isTextOrNull(fields.why)
    || !Array.isArray(lines) || lines.length > ADVISOR_TRANSCRIPT_LINES || !lines.every(isPublicLine)
    // A rule that spans lines, such as a private key block, matches only the joined text.
    || hasUnredactedSecret(lines.join('\n'))) {
    throw new TypeError('advisor seat transcript is invalid');
  }
  return {
    ...target(fields), kind: ADVISOR_SEAT_TRANSCRIPT_KIND, status: fields.status, status_kind: fields.status_kind, turn: fields.turn,
    complete: fields.complete, why: fields.why, lines: Object.freeze([...lines]),
  };
}

// A marker walks only its own header, so the search stays linear on a line of any length.
const BEGIN_MARKER = new RegExp(KEY_BEGIN, 'gu');
const END_MARKER = new RegExp(KEY_END, 'gu');

/** The positions of the first and the last marker on one line; -1 when the line has none. */
function markers(line: string, marker: RegExp): { readonly first: number; readonly last: number } {
  let first = -1, last = -1;
  for (const match of line.matchAll(marker)) {
    if (first < 0) first = match.index;
    last = match.index;
  }
  return { first, last };
}

/**
 * One linear pass that marks every line of a private key block: BEGIN through
 * END, BEGIN to the last line when no END follows, and the first line to END
 * when no BEGIN precedes it, because the window or the hc read cut the block.
 * An open block keeps its earliest BEGIN, so a second BEGIN never releases the
 * lines before it.
 */
function privateKeyLines(lines: readonly string[]): readonly boolean[] {
  const marked = lines.map(() => false);
  const mark = (from: number, to: number) => { for (let at = from; at <= to; at += 1) marked[at] = true; };
  let open: number | null = null;
  lines.forEach((line, at) => {
    const begin = markers(line, BEGIN_MARKER), end = markers(line, END_MARKER);
    if (end.last >= 0) {
      // An END closes the open block; with none open, an END before every BEGIN of its line closes a block that began above the window.
      mark(open ?? (begin.first < 0 || end.first < begin.first ? 0 : at), at);
      open = null;
    }
    // A BEGIN after the last END of its line leaves a block open.
    if (begin.last > end.last) open ??= at;
  });
  if (open !== null) mark(open, lines.length - 1);
  return marked;
}

/** One line outside a key block: the shared token rules, then a secret left over or a line over the limit withholds it. */
function redactAdvisorLine(line: string): string {
  if (line.length > ADVISOR_TRANSCRIPT_LINE_MAX_CHARS) return ADVISOR_TRANSCRIPT_LINE_WITHHELD;
  const redacted = replaceSecrets(line);
  return redacted.length > ADVISOR_TRANSCRIPT_LINE_MAX_CHARS || hasUnredactedSecret(redacted) ? ADVISOR_TRANSCRIPT_LINE_WITHHELD : redacted;
}

/**
 * The read-back lines of one hc read: the last ADVISOR_TRANSCRIPT_LINES lines,
 * every private key block withheld, then each other line redacted. The whole
 * text never goes through the general secret rules.
 */
export function advisorTranscriptLines(text: string): readonly string[] {
  const lines = text.split('\n').slice(-ADVISOR_TRANSCRIPT_LINES);
  const keys = privateKeyLines(lines);
  return Object.freeze(lines.map((line, at) => keys[at] ? ADVISOR_TRANSCRIPT_LINE_WITHHELD : redactAdvisorLine(line)));
}

/**
 * Exactly one live terminal with the advisor seat label. The host read holds
 * the seat terminals of this repository with any parent label or none,
 * without the watcher: one advisor serves the whole repository (#1780).
 */
export function resolveAdvisorSeat(terminals: readonly BoardSeatTerminalReadV1[]): BoardSeatTerminalReadV1 {
  const advisors = terminals.filter(terminal => terminal.state === 'live' && terminal.labels.seat === ADVISOR_SEAT);
  if (advisors.length === 0) throw new AdvisorSeatError('advisor_seat_absent', 'No live terminal carries the advisor seat label of this repository.');
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
  const read = scope.host.seatTerminals(String(scope.github_repository_id));
  if (read.status === 'unavailable') throw new AdvisorSeatError('hc_unavailable', `hc did not list the seat terminals: ${read.reason}`);
  return resolveAdvisorSeat(read.terminals);
}

/** The CLI report of a failed send: the scope, the resolved terminal or null, and the code. */
export function advisorSeatSendFailure(scope: Pick<AdvisorSeatScope, 'github_repository_id' | 'parent'>, error: AdvisorSeatError): AdvisorSeatSendFailureV1 {
  return {
    protocol: 1, kind: ADVISOR_SEAT_SEND_FAILURE_KIND, github_repository_id: scope.github_repository_id, parent: scope.parent,
    terminal: error.terminal, code: error.code,
  };
}

/** Check the text, resolve the one advisor terminal, and send the text to it as plain text. */
export function sendToAdvisorSeat(scope: AdvisorSeatScope, text: string): AdvisorSeatSendV1 {
  const problem = advisorTextProblem(text);
  if (problem !== null) throw new AdvisorSeatError('text_invalid', `The advisor message is refused: ${problem}.`);
  const seat = advisorSeat(scope);
  const sent = scope.host.advisorSend(seat.address, text);
  // `hc send` may have pasted the text before it failed, timed out or answered badly.
  if (sent.status === 'unavailable') throw new AdvisorSeatError('advisor_send_unconfirmed', `hc did not confirm the send to ${seat.address}: ${sent.reason}`, seat.address);
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
    lines: advisorTranscriptLines(read.text),
  };
}
