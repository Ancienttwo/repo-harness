import { sha256Hex } from '../../core/evidence/sha256';
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  RESET_SEATS, seatNoResetMessage, SEAT_RESET_COMMAND, SEAT_RESET_RETRIES, handoffIdentity, isSeatResetAction, missingHandoffSections, seatResetClaimPath,
  seatResetLogPath, seatResetRequestPath, isSeatSessionSource, seatResetDirectory, seatResumePrompt, seatRewriteMessage, seatSessionPath,
  type SeatLaunchModel, type SeatResetAction, type SeatResetIdentity, type SeatSessionSource,
} from '../../core/board/seat-reset';
import { HerdrCoreError, RH_LABEL, hcGet, hcKeys, hcList, hcSend, hcWait, type HcLabels, type HcWaitResult, type HerdrCoreOptions } from '../terminal/herdr-core';
import { readNotifyConfig } from '../terminal/notify-read';

const TAIL_BYTES = 1024 * 1024;

/** The context of one assistant entry: every input token that the model read for it. */
function entryContext(line: string): number | null {
  let entry: unknown;
  try { entry = JSON.parse(line); } catch { return null; }
  if (typeof entry !== 'object' || entry === null) return null;
  const { type, isSidechain, message } = entry as { type?: unknown; isSidechain?: unknown; message?: { usage?: Record<string, unknown> } };
  const usage = message?.usage;
  if (type !== 'assistant' || isSidechain === true || typeof usage !== 'object' || usage === null) return null;
  const counts = ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].map(key => usage[key] ?? 0);
  return counts.every(count => Number.isSafeInteger(count)) ? (counts as number[]).reduce((sum, count) => sum + count, 0) : null;
}

export interface TranscriptUsage {
  /** The context tokens of the last assistant entry, or null when the transcript has none. */
  readonly contextTokens: number | null;
  /** The transcript file size: the measure of the reset action (#2625). */
  readonly bytes: number;
}

/**
 * The context tokens of the last assistant entry of a Claude transcript and the file size. Transcripts grow to tens
 * of MB, so it reads the tail and doubles the window until it holds a complete assistant line.
 */
export function readTranscriptUsage(path: string): TranscriptUsage {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    for (let window = Math.min(TAIL_BYTES, size); ; window = Math.min(window * 2, size)) {
      const buffer = Buffer.alloc(window);
      readSync(fd, buffer, 0, window, size - window);
      const lines = buffer.toString('utf8').split('\n');
      // The first line of a partial window can be cut.
      for (let index = lines.length - 1; index >= (window < size ? 1 : 0); index -= 1) {
        const context = entryContext(lines[index]!);
        if (context !== null) return { contextTokens: context, bytes: size };
      }
      if (window === size) return { contextTokens: null, bytes: size };
    }
  } finally {
    closeSync(fd);
  }
}

export interface SeatResetRequestRecord {
  readonly contextTokens: number;
  readonly transcriptPath: string;
  readonly transcriptBytes: number;
  readonly action: SeatResetAction;
}

/**
 * The Stop hook records when it asked for the reset, for which transcript and with which action; the reset command
 * refuses a handoff older than this and carries out the recorded action without a second measurement.
 */
export function writeSeatResetRequest(identity: SeatResetIdentity, now: Date, request: SeatResetRequestRecord): void {
  const path = seatResetRequestPath(identity);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({
    requested_at: now.toISOString(), context_tokens: request.contextTokens, transcript_path: request.transcriptPath,
    action: request.action, transcript_bytes: request.transcriptBytes,
  })}\n`);
}

/**
 * True while a valid request for this transcript is open. The block is once per session segment; `/compact` keeps
 * the transcript path, so its SessionStart record ends the segment. An absent request, or one that `readRequest`
 * refuses (an old request without an action), is not open, so the next crossing writes a fresh request.
 */
export function seatResetRequested(identity: SeatResetIdentity, transcriptPath: string): boolean {
  const request = readRequest(identity);
  return request !== null && request.transcriptPath === transcriptPath && requestOpen(identity, request);
}

/** A request is open while no SessionStart record is newer than it: a newer record means a new session segment. */
function requestOpen(identity: SeatResetIdentity, request: SeatRequest): boolean {
  const session = readSeatSession(identity);
  return session === null || Date.parse(session.startedAt) <= Date.parse(request.requestedAt);
}

/**
 * The SessionStart hook records each new session segment of a reset seat (`source` startup, clear or compact): the
 * reset command sends the resume prompt only after this signal. The launch model of the session lets a tier-2 reset
 * see a mode change (#2633).
 */
export function recordSeatSession(identity: SeatResetIdentity, session: SeatLaunchModel & { readonly sessionId: string | null; readonly transcriptPath: string; readonly source: SeatSessionSource }, now: Date): void {
  const path = seatSessionPath(identity);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({ session_id: session.sessionId, transcript_path: session.transcriptPath, source: session.source, started_at: now.toISOString(),
    model: session.model, effort: session.effort })}\n`);
}

export interface SeatSessionRecord extends SeatLaunchModel {
  readonly sessionId: string | null;
  readonly transcriptPath: string;
  readonly source: SeatSessionSource;
  readonly startedAt: string;
}

/**
 * The seat session that the SessionStart hook recorded, or null when the record is missing or any field differs from what
 * `recordSeatSession` writes. A record without the launch model (the old hook) has a null model and effort.
 */
export function readSeatSession(identity: SeatResetIdentity): SeatSessionRecord | null {
  let value: unknown;
  try { value = JSON.parse(readFileSync(seatSessionPath(identity), 'utf8')); } catch { return null; }
  if (typeof value !== 'object' || value === null) return null;
  const { session_id: sessionId, transcript_path: transcriptPath, source, started_at: startedAt, model = null, effort = null } = value as Record<string, unknown>;
  const valid = (sessionId === null || typeof sessionId === 'string') && typeof transcriptPath === 'string' && transcriptPath !== ''
    && isSeatSessionSource(source) && typeof startedAt === 'string' && isoInstant(startedAt)
    && (model === null || typeof model === 'string') && (effort === null || typeof effort === 'string');
  return valid ? { sessionId, transcriptPath, source, startedAt, model, effort } : null;
}

/** True for the exact `Date.toISOString()` form that `recordSeatSession` writes. */
function isoInstant(text: string): boolean {
  const time = Date.parse(text);
  return Number.isFinite(time) && new Date(time).toISOString() === text;
}

/** `nothing_sent`: no terminal got a message. `uncertain`: the requester may already be cleared, or got part of a message. */
export type SeatResetOutcome = 'nothing_sent' | 'rewrite_requested' | 'no_reset' | 'uncertain';

export type SeatResetCode = 'handoff_path_invalid' | 'handoff_missing' | 'request_missing' | 'handoff_stale' | 'handoff_sha256_mismatch'
  | 'handoff_sections_missing' | 'already_claimed' | 'claim_failed' | 'caller_unknown' | 'requester_not_found' | 'requester_busy' | 'message_not_sent'
  | 'hc_failed' | 'resume_not_sent' | 'request_invalid' | 'request_closed';

export class SeatResetError extends Error {
  constructor(readonly code: SeatResetCode, readonly outcome: SeatResetOutcome, message: string, readonly logErrors: readonly string[] = []) {
    super(message);
  }
}

type HandoffCode = 'handoff_missing' | 'handoff_stale' | 'handoff_sha256_mismatch' | 'handoff_sections_missing';

interface SeatRequest {
  readonly requestedAt: string;
  readonly transcriptPath: string | null;
  readonly action: SeatResetAction;
}

/**
 * The one boundary validator of request.json for the Stop hook and `seats reset`. It returns a typed request only for
 * an object with a valid time and a recorded action; for any other content it returns null and never throws, so both
 * readers take their invalid-request path. Nothing chooses the action again.
 */
function readRequest(identity: SeatResetIdentity): SeatRequest | null {
  let value: unknown;
  try { value = JSON.parse(readFileSync(seatResetRequestPath(identity), 'utf8')); } catch { return null; }
  // Any JSON value that is not a plain object (null, an array, a number, a string, a boolean) is not a request.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { requested_at: requestedAt, transcript_path: transcriptPath, action } = value as Record<string, unknown>;
  if (typeof requestedAt !== 'string' || !Number.isFinite(Date.parse(requestedAt)) || !isSeatResetAction(action)) return null;
  return { requestedAt, transcriptPath: typeof transcriptPath === 'string' ? transcriptPath : null, action };
}

/** The first failed check of the handoff of a `RESET-REQUEST`, or null when it passes. */
function handoffProblem(path: string, sha256: string, request: SeatRequest): { readonly code: HandoffCode; readonly message: string } | null {
  if (!existsSync(path)) return { code: 'handoff_missing', message: `${path} does not exist.` };
  if (statSync(path).mtimeMs <= Date.parse(request.requestedAt)) return { code: 'handoff_stale', message: `${path} is older than the reset request of ${request.requestedAt}.` };
  const text = readFileSync(path);
  const actual = sha256Hex(text);
  if (actual !== sha256.toLowerCase()) return { code: 'handoff_sha256_mismatch', message: `${path} has sha256 ${actual}, not ${sha256}.` };
  const missing = missingHandoffSections(text.toString('utf8'));
  return missing.length === 0 ? null : { code: 'handoff_sections_missing', message: `${path} has no section ${missing.map(section => `"## ${section}"`).join(', ')}.` };
}

interface NewSession {
  readonly transcript: string;
  readonly sessionId: string | null;
}

/**
 * The session segment that started at or after `since`: for `/compact` a `compact` record of the transcript of the
 * request, for `/clear` and a relaunch a record of another transcript.
 */
function newSession(identity: SeatResetIdentity, since: number, request: SeatRequest, action: SeatResetAction): NewSession | null {
  const session = readSeatSession(identity);
  if (session === null || Date.parse(session.startedAt) < since) return null;
  const segment = action === 'compact'
    ? session.source === 'compact' && session.transcriptPath === request.transcriptPath
    : session.transcriptPath !== request.transcriptPath;
  return segment ? { transcript: session.transcriptPath, sessionId: session.sessionId } : null;
}

/** The bytes of a file after `offset`, or '' when it is missing; the evidence poll reads only what was appended. */
function readAppended(path: string, offset: number): string {
  let fd: number;
  try { fd = openSync(path, 'r'); } catch { return ''; }
  try {
    const length = Math.max(0, fstatSync(fd).size - offset);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, offset);
    return buffer.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

const fileSize = (path: string): number => { try { return statSync(path).size; } catch { return 0; } };

const RESUMED_WORDS: readonly string[] = ['RESUMED', "'RESUMED'", '"RESUMED"'];

/**
 * Only the one simple command `hc send <peer> RESUMED` counts, with the message bare or in plain quotes. A compound,
 * piped, background or substituted command, another address and a command that only prints the text all fail the
 * word compare.
 */
function isResumedSend(command: string, peer: string): boolean {
  const words = command.trim().split(/[ \t]+/u);
  return words.length === 4 && words[0] === 'hc' && words[1] === 'send' && words[2] === peer && RESUMED_WORDS.includes(words[3]!);
}

type Part = { type?: unknown; name?: unknown; text?: unknown; id?: unknown; tool_use_id?: unknown; is_error?: unknown; input?: { command?: unknown } } | null;

/** The fields that the resume evidence reads from one transcript line. */
interface TranscriptLine {
  readonly type: unknown;
  /** `message.content`: the prompt text, or the parts, of the entry. */
  readonly content: unknown;
  /** `attachment` of the entry: a prompt that arrives during a turn comes as a queued command here. */
  readonly attachment: { readonly type: unknown; readonly prompt: unknown } | null;
}

/**
 * The evidence fields of one transcript line, or null for a line that is not a JSON object: a JSON null, an array, a
 * scalar and a cut line are skipped, never a throw.
 */
function transcriptLine(line: string): TranscriptLine | null {
  let entry: unknown;
  try { entry = JSON.parse(line); } catch { return null; }
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
  const { type, message, attachment } = entry as { type?: unknown; message?: { content?: unknown } | null; attachment?: unknown };
  const queued = typeof attachment === 'object' && attachment !== null ? attachment as { type?: unknown; prompt?: unknown } : null;
  return { type, content: message?.content, attachment: queued === null ? null : { type: queued.type, prompt: queued.prompt } };
}

/**
 * True when the line holds the resume prompt: a user entry, which hc may wrap, or the `queued_command` attachment of an
 * `attachment` entry, which Claude Code writes when the prompt arrives while the session is in a turn (#2637). The entry
 * type must be `attachment`, so an assistant line that carries an `attachment` field of its own is no prompt.
 */
function holdsPrompt(entry: TranscriptLine, parts: readonly Part[], prompt: string): boolean {
  const holds = (value: unknown) => typeof value === 'string' && value.includes(prompt);
  const queued = entry.type === 'attachment' && entry.attachment !== null && entry.attachment.type === 'queued_command'
    && holds(entry.attachment.prompt);
  return queued || (entry.type === 'user' && (holds(entry.content) || parts.some(part => holds(part?.text))));
}

/**
 * Mechanical resume evidence in the text appended after the prompt send: the entry that holds the resume prompt, then
 * an assistant Bash tool call whose command sends RESUMED to the peer with hc send, then its tool result without an
 * error. A refused, failed or missing result is no evidence.
 */
function sentResumed(appended: string, prompt: string, peer: string): boolean {
  let asked = false;
  const sends = new Set<unknown>();
  for (const line of appended.split('\n')) {
    const entry = transcriptLine(line);
    if (entry === null) continue;
    const parts = Array.isArray(entry.content) ? entry.content as Part[] : [];
    if (entry.type === 'user' && parts.some(part => part?.type === 'tool_result' && sends.has(part.tool_use_id) && part.is_error !== true)) return true;
    if (holdsPrompt(entry, parts, prompt)) asked = true;
    if (!asked || entry.type !== 'assistant') continue;
    for (const part of parts) {
      const command = part?.type === 'tool_use' && part.name === 'Bash' ? part.input?.command : undefined;
      if (typeof command === 'string' && isResumedSend(command, peer)) sends.add(part!.id);
    }
  }
  return false;
}

/** The characters that `hc keys` takes as single-character key names, and the space key. */
const TYPABLE = /^[A-Za-z0-9 /.-]+$/u;

/**
 * Types one line and Enter with `hc keys`. `hc send` wraps its text in an envelope, so Claude reads a sent slash
 * command as chat text and a shell reads a sent line as a parse error.
 */
function typeLine(terminal: string, line: string, options: HerdrCoreOptions): void {
  if (!TYPABLE.test(line)) throw new Error(`${JSON.stringify(line)} has a character that hc keys cannot type`);
  hcKeys(terminal, [...[...line].map(character => (character === ' ' ? 'space' : character)), 'enter'], options);
}

/** An error message without its final period, for use inside a sentence. */
const sentence = (error: unknown): string => (error as Error).message.replace(/\.$/u, '');

function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

export interface SeatResetTimeouts {
  readonly signalMs: number;
  /** The signal budget after `/compact`: a compaction in this repository took 71 s median and 237 s max. */
  readonly compactSignalMs: number;
  readonly evidenceMs: number;
  readonly exitMs: number;
  readonly pollMs: number;
}

const TIMEOUTS: SeatResetTimeouts = { signalMs: 60_000, compactSignalMs: 300_000, evidenceMs: 120_000, exitMs: 60_000, pollMs: 1_000 };
const WAIT_SECONDS = 600;

/** The notice port of the reset: one bot event to the configured notify channels; a failure is a result. */
export type SeatResetNotify = (env: NodeJS.ProcessEnv, event: {
  readonly repository: string | null; readonly kind: string; readonly data: Record<string, unknown>; readonly text: string;
}) => Promise<'sent' | 'failed' | 'not_configured'>;

/** The launch of `repo-harness seats argv <seat> --repository-id <id>` under the current quota: its argv and its effective model and effort. */
export interface SeatRelaunch extends SeatLaunchModel {
  readonly argv: readonly string[];
}

export interface SeatResetOptions extends HerdrCoreOptions {
  /** The seat launch for the relaunch and for the model check of a tier-2 reset. */
  readonly relaunch: (identity: SeatResetIdentity) => Promise<SeatRelaunch>;
  /** Tests only: shorter waits. */
  readonly timeouts?: SeatResetTimeouts;
  /** Posts one notice. Only the peer-runtime plugin supplies it; without it every failure records `not_configured`. */
  readonly notify?: SeatResetNotify;
}

export interface SeatResetResult {
  readonly requester: string;
  readonly seat: string;
  readonly relaunched: boolean;
  /** Reset log lines that could not be written; the reset went on without them. */
  readonly logErrors: readonly string[];
}

/** The notices of one run get this much time in total at the end of the run. */
const NOTICE_SETTLE_MS = 5_000;

/**
 * The peer seat runs this on a `RESET-REQUEST`. It finds the requester by its seat labels. A failed handoff check
 * asks for a rewrite, at most 3 times per request, and then tells the requester to continue without a reset. A
 * valid handoff gets the recorded action, `/compact` or `/clear`; the resume prompt goes out only after the
 * new-session signal. A missing signal after `/clear` types `/clear` again; a missing signal after `/compact` ends
 * the run, and auto-compaction stays as the net. A missing answer to the prompt sends it again. After 3 retries in
 * total the requester starts again from its seat argv in the same terminal. A `reset` request whose effective launch
 * model or effort differs from the session record starts the requester again from its seat argv instead of `/clear`
 * (#2633); `compact` never restarts. Each failure appends one entry to the
 * reset log, then posts one notice that nothing waits for. A completed request is never reset again.
 */
export async function runSeatReset(path: string, sha256: string, options: SeatResetOptions): Promise<SeatResetResult> {
  const identity = handoffIdentity(path);
  if (identity === null) throw new SeatResetError('handoff_path_invalid', 'nothing_sent', `${path} is not the handoff path of the orchestrator or advisor seat.`);
  const run = new SeatResetRun(identity, path, options);
  try {
    return { ...await run.reset(sha256), logErrors: run.logErrors };
  } catch (error) {
    if (error instanceof SeatResetError) throw new SeatResetError(error.code, error.outcome, error.message, run.logErrors);
    throw error;
  } finally {
    await run.settleNotices();
  }
}

/** One run of `seats reset` for a valid handoff path: the log, the notices and the reset steps. */
class SeatResetRun {
  readonly logErrors: string[] = [];
  private readonly notices: Promise<unknown>[] = [];
  private readonly env: NodeJS.ProcessEnv;
  private readonly timeouts: SeatResetTimeouts;
  private readonly logPath: string;
  private request: SeatRequest | null = null;
  private requester = '';
  private caller = '';
  private prompt = '';

  constructor(private readonly identity: SeatResetIdentity, private readonly path: string, private readonly options: SeatResetOptions) {
    this.env = options.env ?? process.env;
    this.timeouts = options.timeouts ?? TIMEOUTS;
    this.logPath = seatResetLogPath(identity);
  }

  /** Appends one log entry first, then dispatches its notice without waiting. A failed write is kept for the result. */
  private record(kind: string, detail: string, extra: Record<string, unknown> = {}): void {
    const notify = this.options.notify;
    let notice: 'none' | 'dispatched' | 'not_configured' | 'config_invalid' = 'none';
    if (kind !== 'reset' && notify === undefined) notice = 'not_configured';
    else if (kind !== 'reset') {
      try { notice = readNotifyConfig(this.env) === null ? 'not_configured' : 'dispatched'; } catch { notice = 'config_invalid'; }
    }
    try {
      appendFileSync(this.logPath, `${JSON.stringify({ at: new Date().toISOString(), requested_at: this.request?.requestedAt ?? null, kind, detail, notice, ...extra })}\n`);
    } catch (error) {
      this.logErrors.push(`${kind}: ${sentence(error)}`);
    }
    if (notice !== 'dispatched' || notify === undefined) return;
    this.notices.push(notify(this.env, {
      repository: this.identity.repository, kind: 'seat.reset_failed', data: { seat: this.identity.seat, failure: kind, detail, handoff: this.path },
      text: `seat reset ${kind}: ${this.identity.seat} (${detail})`,
    }));
  }

  /** Records the failure and returns the error to throw. */
  private refuse(code: SeatResetCode, outcome: SeatResetOutcome, message: string, kind: string = code): SeatResetError {
    this.record(kind, code === kind ? message : code);
    return new SeatResetError(code, outcome, message);
  }

  private count(kind: string): number {
    let lines: string[] = [];
    try { lines = readFileSync(this.logPath, 'utf8').split('\n'); } catch { /* no log yet */ }
    return lines.filter((line) => {
      try {
        const entry = JSON.parse(line) as { requested_at?: unknown; kind?: unknown };
        return entry.requested_at === this.request?.requestedAt && entry.kind === kind;
      } catch {
        return false;
      }
    }).length;
  }

  async settleNotices(): Promise<void> {
    await Promise.race([Promise.allSettled(this.notices), new Promise(resolve => setTimeout(resolve, NOTICE_SETTLE_MS).unref())]);
  }

  async reset(sha256: string): Promise<Omit<SeatResetResult, 'logErrors'>> {
    mkdirSync(seatResetDirectory(this.identity), { recursive: true, mode: 0o700 });
    try {
      const requestPath = seatResetRequestPath(this.identity);
      this.request = readRequest(this.identity);
      if (this.request === null && !existsSync(requestPath)) {
        throw this.refuse('request_missing', 'nothing_sent', `${requestPath} is missing: the Stop hook did not ask for this reset.`);
      }
      if (this.request === null) {
        // An old request without an action, or a damaged one: no action is invented. The Stop hook does not count it
        // as open, so the next crossing writes a fresh request.
        this.findRequester();
        throw this.release('request_invalid', `${requestPath} has no valid time or action, so nothing was typed`);
      }
      // A claimed request gets no message at all, not even REWRITE or NO-RESET.
      const claim = seatResetClaimPath(this.identity, this.request.requestedAt);
      if (existsSync(claim)) throw this.alreadyClaimed();
      this.findRequester();
      this.prompt = seatResumePrompt(this.identity, this.caller, this.request.action);
      this.checkHandoff(sha256);
      this.wait();
      this.claim(claim);
      // An auto-compaction or another reset after the request started a new segment: a second action would compact
      // or clear the new summary.
      if (!requestOpen(this.identity, this.request)) {
        throw this.release('request_closed', `a session segment started after the reset request of ${this.request.requestedAt}, so nothing was typed`);
      }
    } catch (error) {
      if (error instanceof SeatResetError) throw error;
      throw this.refuse('hc_failed', 'nothing_sent', `hc failed before the first typed command: ${sentence(error)}.`);
    }
    // From the first typed command on, the requester may already be reset, so a failure gives the prompt to send by hand.
    try {
      return await this.resetAndResume();
    } catch (error) {
      if (error instanceof SeatResetError && error.outcome === 'uncertain') throw error;
      throw this.refuse('resume_not_sent', 'uncertain', `${this.requester} may have got ${SEAT_RESET_COMMAND[this.request!.action]}, but not the resume prompt: ${sentence(error)}. Send it by hand: ${this.prompt}`);
    }
  }

  private alreadyClaimed(): SeatResetError {
    return this.refuse('already_claimed', 'nothing_sent', `The reset request of ${this.request!.requestedAt} is already claimed by an earlier run.`);
  }

  /** The exclusive create is the claim: a concurrent run gets EEXIST. Any other failure types nothing. */
  private claim(path: string): void {
    try {
      closeSync(openSync(path, 'wx', 0o600));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw this.alreadyClaimed();
      throw this.refuse('claim_failed', 'nothing_sent', `${path} could not be created: ${sentence(error)}.`);
    }
  }

  private findRequester(): void {
    const caller = this.env.HC_TERMINAL_ID;
    if (!caller) throw this.refuse('caller_unknown', 'nothing_sent', 'HC_TERMINAL_ID is not set: run the reset from the peer seat terminal.');
    const terminals = hcList({ [RH_LABEL.seat]: this.identity.seat, [RH_LABEL.repository]: this.identity.repository }, this.options);
    if (terminals.length !== 1) {
      throw this.refuse('requester_not_found', 'nothing_sent', `${terminals.length} live terminals carry repo-harness.seat=${this.identity.seat} and repo-harness.repository=${this.identity.repository}; the reset needs exactly one.`);
    }
    this.requester = terminals[0]!.address;
    if (this.requester === caller) throw this.refuse('caller_unknown', 'nothing_sent', `The ${this.identity.seat} seat cannot reset itself: run the reset from the peer seat.`);
    const peer = RESET_SEATS.find(seat => seat !== this.identity.seat)!;
    let labels: HcLabels;
    try {
      labels = hcGet(caller, this.options).labels;
    } catch (error) {
      if (!(error instanceof HerdrCoreError) || error.reason !== 'unowned') throw error;
      throw this.refuse('caller_unknown', 'nothing_sent', `${caller} has no repo-harness label; the reset of ${this.identity.seat} requires ${RH_LABEL.repository}=${this.identity.repository} and ${RH_LABEL.seat}=${peer}.`);
    }
    for (const [key, expected] of [[RH_LABEL.repository, this.identity.repository], [RH_LABEL.seat, peer]] as const) {
      if (labels[key] !== expected) {
        throw this.refuse('caller_unknown', 'nothing_sent', `${caller} carries ${key}=${labels[key] ?? '(missing)'}; the reset of ${this.identity.seat} requires the caller to carry ${key}=${expected}.`);
      }
    }
    this.caller = caller;
  }

  /** Sends one message to the requester and records it once; a refused send records only the failure. */
  private tell(kind: string, message: string, detail: string, problem: string): void {
    try {
      hcSend(this.requester, message, this.options);
    } catch (error) {
      throw this.refuse('message_not_sent', 'uncertain', `The ${kind} message to ${this.requester} failed: ${sentence(error)}. ${problem}`);
    }
    this.record(kind, detail);
  }

  /** Releases the requester with NO-RESET: it continues, and no slash command is typed. */
  private release(code: 'request_invalid' | 'request_closed', reason: string): SeatResetError {
    this.tell('no_reset', seatNoResetMessage(reason), code, `${reason}.`);
    return new SeatResetError(code, 'no_reset', `${reason}. No reset: the requester continues.`);
  }

  /** A failed check asks for a rewrite, at most 3 times per request; then the requester continues without a reset. */
  private checkHandoff(sha256: string): void {
    const problem = handoffProblem(this.path, sha256, this.request!);
    if (problem === null) return;
    const rewrites = this.count('rewrite');
    const [kind, message, outcome, result] = rewrites < SEAT_RESET_RETRIES
      ? ['rewrite', seatRewriteMessage(this.identity, problem.message, rewrites + 1), 'rewrite_requested' as const, `Rewrite ${rewrites + 1}/${SEAT_RESET_RETRIES} asked.`]
      : ['no_reset', seatNoResetMessage('the handoff failed every rewrite'), 'no_reset' as const, 'The rewrites are used up: no reset; the requester continues.'];
    this.tell(kind, message, problem.code, problem.message);
    throw new SeatResetError(problem.code, outcome, `${problem.message} ${result}`);
  }

  /**
   * A message to the waiting seat also ends its wait (#2305), so the wait goes on for the rest of the WAIT_SECONDS
   * budget; the remaining budget shrinks with the time that passed. Returns the last result, started or not.
   */
  private waitForTurn(): HcWaitResult {
    const deadline = Date.now() + WAIT_SECONDS * 1000;
    let result = hcWait(this.requester, WAIT_SECONDS, this.options);
    while (!result.ended && result.reason === 'message') {
      const seconds = Math.ceil((deadline - Date.now()) / 1000);
      if (seconds < 1) break;
      result = hcWait(this.requester, seconds, this.options);
    }
    return result;
  }

  /** Only a requester that still works after the whole budget is busy. */
  private wait(): void {
    const result = this.waitForTurn();
    if (!result.ended) throw this.refuse('requester_busy', 'nothing_sent', `${this.requester} did not end its turn in ${WAIT_SECONDS} s (${result.reason}).`);
  }

  private async poll<T>(read: () => T | null, ms: number): Promise<T | null> {
    for (const deadline = Date.now() + ms; ; await new Promise(resolve => setTimeout(resolve, this.timeouts.pollMs))) {
      const value = read();
      if (value !== null || Date.now() >= deadline) return value;
    }
  }

  private waitForSession(since: number, action: SeatResetAction): Promise<NewSession | null> {
    const ms = action === 'compact' ? this.timeouts.compactSignalMs : this.timeouts.signalMs;
    return this.poll(() => newSession(this.identity, since, this.request!, action), ms);
  }

  /** Sends the prompt; true when the model sends RESUMED in the new transcript within the evidence window. */
  private async promptAnswered(session: NewSession): Promise<boolean> {
    const offset = fileSize(session.transcript);
    hcSend(this.requester, this.prompt, this.options);
    return await this.poll(() => (sentResumed(readAppended(session.transcript, offset), this.prompt, this.caller) ? true : null), this.timeouts.evidenceMs) !== null;
  }

  private done(session: NewSession, detail: 'compacted' | 'cleared' | 'relaunched' | 'restarted'): Omit<SeatResetResult, 'logErrors'> {
    this.record('reset', detail, { session_id: session.sessionId });
    return { requester: this.requester, seat: this.identity.seat, relaunched: detail === 'relaunched' || detail === 'restarted' };
  }

  /**
   * The launch of the requester when its effective model or effort differs from the session record, else null. A record
   * without a model gives null. A launch that cannot be built is logged and gives null: the reset types `/clear` as
   * before #2633, and the seat keeps its model.
   */
  private async modelChange(): Promise<SeatRelaunch | null> {
    const session = readSeatSession(this.identity);
    if (session === null || session.model === null) return null;
    let launch: SeatRelaunch;
    try {
      launch = await this.options.relaunch(this.identity);
    } catch (error) {
      this.record('model_check_failed', `relaunch_argv_failed: ${sentence(error)}`);
      return null;
    }
    return launch.model === session.model && launch.effort === session.effort ? null : launch;
  }

  /**
   * Types the recorded action once. No signal after `/clear` types it again; no signal after `/compact` ends the run
   * (a second `/compact` would compact a summary). No answer sends the prompt again. After 3 retries the requester is
   * relaunched.
   */
  private async resetAndResume(): Promise<Omit<SeatResetResult, 'logErrors'>> {
    const { action } = this.request!;
    const changed = action === 'reset' ? await this.modelChange() : null;
    if (changed !== null) return this.relaunch(changed);
    let since = Date.now();
    typeLine(this.requester, SEAT_RESET_COMMAND[action], this.options);
    let session: NewSession | null = null;
    // The log counts across runs; the run counts too, so an unwritable log still ends the retries.
    for (let failures = 1; ; failures += 1) {
      session ??= await this.waitForSession(since, action);
      const failure = session === null ? 'no_signal' : await this.promptAnswered(session) ? null : 'no_evidence';
      if (failure === null) return this.done(session!, action === 'compact' ? 'compacted' : 'cleared');
      this.record('resume', failure);
      if (failure === 'no_signal' && action === 'compact') {
        throw new SeatResetError('resume_not_sent', 'uncertain', `${this.requester} got /compact, but no compact session record came in ${this.timeouts.compactSignalMs / 1000} s. No second /compact: the seat continues and Claude Code auto-compaction stays as the net. If it compacts later, send: ${this.prompt}`);
      }
      if (failures > SEAT_RESET_RETRIES || this.count('resume') > SEAT_RESET_RETRIES) return this.relaunch();
      if (failure === 'no_signal') {
        since = Date.now();
        typeLine(this.requester, '/clear', this.options);
      }
    }
  }

  /** `launch` is the launch of a model change; without it the relaunch builds the launch after the retries. */
  private async relaunch(launch?: SeatRelaunch): Promise<Omit<SeatResetResult, 'logErrors'>> {
    // A relaunched process has no compaction summary, so it gets the prompt with the git and gh check.
    this.prompt = seatResumePrompt(this.identity, this.caller, 'reset');
    const stop = (detail: string, running = false): SeatResetError => {
      const next = running ? `No key was typed; its session still runs. Send it: ${this.prompt}`
        : `Start it from \`repo-harness seats argv ${this.identity.seat} --repository-id ${this.identity.repository}\` and send: ${this.prompt}`;
      this.record('relaunch_failed', detail);
      return new SeatResetError('resume_not_sent', 'uncertain', `The relaunch of ${this.requester} failed (${detail}). ${next}`);
    };
    // The argv needs characters that hc keys cannot type, so the login shell runs it from a script. The script is
    // ready before /exit, so a failed build leaves the running session in place.
    const script = `${seatResetDirectory(this.identity)}/relaunch.sh`;
    if (!TYPABLE.test(script) || script.includes(' ')) throw stop('relaunch_path_untypable', true);
    try {
      writeFileSync(script, `${(launch ?? await this.options.relaunch(this.identity)).argv.map(shellQuote).join(' ')}\n`, { mode: 0o700 });
    } catch (error) {
      throw stop(`relaunch_argv_failed: ${sentence(error)}`, true);
    }
    const turn = this.waitForTurn();
    if (!turn.ended) throw stop('requester_busy', true);
    typeLine(this.requester, '/exit', this.options);
    if (await this.poll(() => (hcGet(this.requester, this.options).foreground?.name === 'claude' ? null : true), this.timeouts.exitMs) === null) {
      throw stop('claude_did_not_exit');
    }
    const startedAt = Date.now();
    typeLine(this.requester, `sh ${script}`, this.options);
    const session = await this.waitForSession(startedAt, 'reset');
    if (session === null) throw stop('no_signal');
    if (!await this.promptAnswered(session)) throw stop('no_evidence');
    return this.done(session, launch === undefined ? 'relaunched' : 'restarted');
  }
}
