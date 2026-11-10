import { createHash } from 'crypto';
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  RESET_SEATS, SEAT_NO_RESET_MESSAGE, SEAT_RESET_RETRIES, handoffIdentity, missingHandoffSections, seatResetClaimPath, seatResetLogPath, seatResetRequestPath,
  isSeatSessionSource, seatResetDirectory, seatResumePrompt, seatRewriteMessage, seatSessionPath, type SeatResetIdentity, type SeatSessionSource,
} from '../../core/board/seat-reset';
import { RH_LABEL, hcGet, hcKeys, hcList, hcSend, hcWait, type HerdrCoreOptions } from '../terminal/herdr-core';
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

/**
 * The context tokens of the last assistant entry of a Claude transcript, or null when it has none. Transcripts grow
 * to tens of MB, so it reads the tail and doubles the window until it holds a complete assistant line.
 */
export function readTranscriptContextTokens(path: string): number | null {
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
        if (context !== null) return context;
      }
      if (window === size) return null;
    }
  } finally {
    closeSync(fd);
  }
}

/**
 * The Stop hook records when it asked for the reset and for which transcript; the reset command refuses a handoff
 * older than this. `/clear` starts a new transcript, so the next crossing asks again.
 */
export function writeSeatResetRequest(identity: SeatResetIdentity, now: Date, contextTokens: number, transcriptPath: string): void {
  const path = seatResetRequestPath(identity);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({ requested_at: now.toISOString(), context_tokens: contextTokens, transcript_path: transcriptPath })}\n`);
}

/** True when the Stop hook already asked for a reset of this transcript; an absent or unreadable request is false. */
export function seatResetRequested(identity: SeatResetIdentity, transcriptPath: string): boolean {
  try {
    return (JSON.parse(readFileSync(seatResetRequestPath(identity), 'utf8')) as { transcript_path?: unknown }).transcript_path === transcriptPath;
  } catch {
    return false;
  }
}

/**
 * The SessionStart hook records each new session of a reset seat (`source` clear or startup): the reset command
 * sends the resume prompt only after this signal names a new transcript.
 */
export function recordSeatSession(identity: SeatResetIdentity, session: { readonly sessionId: string | null; readonly transcriptPath: string; readonly source: SeatSessionSource }, now: Date): void {
  const path = seatSessionPath(identity);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({ session_id: session.sessionId, transcript_path: session.transcriptPath, source: session.source, started_at: now.toISOString() })}\n`);
}

/**
 * The transcript of the seat session that the SessionStart hook recorded, or null when the record is missing or any
 * field differs from what `recordSeatSession` writes.
 */
export function readSeatSessionTranscript(identity: SeatResetIdentity): string | null {
  let value: unknown;
  try { value = JSON.parse(readFileSync(seatSessionPath(identity), 'utf8')); } catch { return null; }
  if (typeof value !== 'object' || value === null) return null;
  const { session_id: sessionId, transcript_path: transcript, source, started_at: startedAt } = value as Record<string, unknown>;
  const valid = (sessionId === null || typeof sessionId === 'string') && typeof transcript === 'string' && transcript !== ''
    && isSeatSessionSource(source) && typeof startedAt === 'string' && isoInstant(startedAt);
  return valid ? transcript : null;
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
  | 'hc_failed' | 'resume_not_sent';

export class SeatResetError extends Error {
  constructor(readonly code: SeatResetCode, readonly outcome: SeatResetOutcome, message: string, readonly logErrors: readonly string[] = []) {
    super(message);
  }
}

type HandoffCode = 'handoff_missing' | 'handoff_stale' | 'handoff_sha256_mismatch' | 'handoff_sections_missing';

interface SeatRequest {
  readonly requestedAt: string;
  readonly transcriptPath: string | null;
}

function readRequest(identity: SeatResetIdentity): SeatRequest | null {
  let value: { requested_at?: unknown; transcript_path?: unknown } = {};
  try { value = JSON.parse(readFileSync(seatResetRequestPath(identity), 'utf8')); } catch { /* checked below */ }
  if (typeof value.requested_at !== 'string' || !Number.isFinite(Date.parse(value.requested_at))) return null;
  return { requestedAt: value.requested_at, transcriptPath: typeof value.transcript_path === 'string' ? value.transcript_path : null };
}

/** The first failed check of the handoff of a `RESET-REQUEST`, or null when it passes. */
function handoffProblem(path: string, sha256: string, request: SeatRequest): { readonly code: HandoffCode; readonly message: string } | null {
  if (!existsSync(path)) return { code: 'handoff_missing', message: `${path} does not exist.` };
  if (statSync(path).mtimeMs <= Date.parse(request.requestedAt)) return { code: 'handoff_stale', message: `${path} is older than the reset request of ${request.requestedAt}.` };
  const text = readFileSync(path);
  const actual = createHash('sha256').update(text).digest('hex');
  if (actual !== sha256.toLowerCase()) return { code: 'handoff_sha256_mismatch', message: `${path} has sha256 ${actual}, not ${sha256}.` };
  const missing = missingHandoffSections(text.toString('utf8'));
  return missing.length === 0 ? null : { code: 'handoff_sections_missing', message: `${path} has no section ${missing.map(section => `"## ${section}"`).join(', ')}.` };
}

interface NewSession {
  readonly transcript: string;
  readonly sessionId: string | null;
}

/** The session that started at or after `since` in a transcript that is not the transcript of the request. */
function newSession(identity: SeatResetIdentity, since: number, request: SeatRequest): NewSession | null {
  try {
    const value = JSON.parse(readFileSync(seatSessionPath(identity), 'utf8')) as { transcript_path?: unknown; started_at?: unknown; session_id?: unknown };
    const fresh = typeof value.started_at === 'string' && Date.parse(value.started_at) >= since;
    return fresh && typeof value.transcript_path === 'string' && value.transcript_path !== request.transcriptPath
      ? { transcript: value.transcript_path, sessionId: typeof value.session_id === 'string' ? value.session_id : null } : null;
  } catch {
    return null;
  }
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

/**
 * Mechanical resume evidence in the text appended after the prompt send: the user entry that holds the resume
 * prompt (hc may wrap it), then an assistant Bash tool call whose command sends RESUMED to the peer with hc send,
 * then its tool result without an error. A refused, failed or missing result is no evidence.
 */
function sentResumed(appended: string, prompt: string, peer: string): boolean {
  type Part = { type?: unknown; name?: unknown; text?: unknown; id?: unknown; tool_use_id?: unknown; is_error?: unknown; input?: { command?: unknown } } | null;
  const holds = (value: unknown) => typeof value === 'string' && value.includes(prompt);
  let asked = false;
  const sends = new Set<unknown>();
  for (const line of appended.split('\n')) {
    let entry: { type?: unknown; message?: { content?: unknown } };
    try { entry = JSON.parse(line); } catch { continue; }
    const content = entry.message?.content;
    const parts = Array.isArray(content) ? content as Part[] : [];
    if (entry.type === 'user' && parts.some(part => part?.type === 'tool_result' && sends.has(part.tool_use_id) && part.is_error !== true)) return true;
    if (entry.type === 'user' && (holds(content) || parts.some(part => holds(part?.text)))) asked = true;
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
  readonly evidenceMs: number;
  readonly exitMs: number;
  readonly pollMs: number;
}

const TIMEOUTS: SeatResetTimeouts = { signalMs: 60_000, evidenceMs: 120_000, exitMs: 60_000, pollMs: 1_000 };
const WAIT_SECONDS = 600;

/** The notice port of the reset: one bot event to the configured notify channels; a failure is a result. */
export type SeatResetNotify = (env: NodeJS.ProcessEnv, event: {
  readonly repository: string | null; readonly kind: string; readonly data: Record<string, unknown>; readonly text: string;
}) => Promise<'sent' | 'failed' | 'not_configured'>;

export interface SeatResetOptions extends HerdrCoreOptions {
  /** The argv of `repo-harness seats argv <seat> --repository-id <id>`, for the relaunch. */
  readonly relaunchArgv: (identity: SeatResetIdentity) => Promise<readonly string[]>;
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
 * valid handoff gets `/clear`; the resume prompt goes out only after the new-session signal. A missing signal types
 * `/clear` again, and a missing answer to the prompt sends it again, at most 3 times in total. Then the requester
 * starts again from its seat argv in the same terminal. Each failure appends one entry to the reset log, then
 * posts one notice that nothing waits for. A completed request is never reset again.
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
      this.request = readRequest(this.identity);
      if (this.request === null) {
        throw this.refuse('request_missing', 'nothing_sent', `${seatResetRequestPath(this.identity)} is missing or not valid: the Stop hook did not ask for this reset.`);
      }
      // A claimed request gets no message at all, not even REWRITE or NO-RESET.
      const claim = seatResetClaimPath(this.identity, this.request.requestedAt);
      if (existsSync(claim)) throw this.alreadyClaimed();
      this.findRequester();
      this.checkHandoff(sha256);
      this.wait();
      this.claim(claim);
    } catch (error) {
      if (error instanceof SeatResetError) throw error;
      throw this.refuse('hc_failed', 'nothing_sent', `hc failed before /clear: ${sentence(error)}.`);
    }
    // From the /clear on, the requester may already be cleared, so a failure gives the prompt to send by hand.
    try {
      return await this.clearAndResume();
    } catch (error) {
      if (error instanceof SeatResetError && error.outcome === 'uncertain') throw error;
      throw this.refuse('resume_not_sent', 'uncertain', `${this.requester} may have got /clear, but not the resume prompt: ${sentence(error)}. Send it by hand: ${this.prompt}`);
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
    const labels = hcGet(caller, this.options).labels;
    const peer = RESET_SEATS.find(seat => seat !== this.identity.seat)!;
    for (const [key, expected] of [[RH_LABEL.repository, this.identity.repository], [RH_LABEL.seat, peer]] as const) {
      if (labels[key] !== expected) {
        throw this.refuse('caller_unknown', 'nothing_sent', `${caller} carries ${key}=${labels[key] ?? '(missing)'}; the reset of ${this.identity.seat} requires the caller to carry ${key}=${expected}.`);
      }
    }
    this.caller = caller;
    this.prompt = seatResumePrompt(this.identity, caller);
  }

  /** A failed check asks for a rewrite, at most 3 times per request; then the requester continues without a reset. */
  private checkHandoff(sha256: string): void {
    const problem = handoffProblem(this.path, sha256, this.request!);
    if (problem === null) return;
    const rewrites = this.count('rewrite');
    const [kind, message, outcome, result] = rewrites < SEAT_RESET_RETRIES
      ? ['rewrite', seatRewriteMessage(this.identity, problem.message, rewrites + 1), 'rewrite_requested' as const, `Rewrite ${rewrites + 1}/${SEAT_RESET_RETRIES} asked.`]
      : ['no_reset', SEAT_NO_RESET_MESSAGE, 'no_reset' as const, 'The rewrites are used up: no reset; the requester continues.'];
    try {
      hcSend(this.requester, message, this.options);
    } catch (error) {
      throw this.refuse('message_not_sent', 'uncertain', `The ${kind} message to ${this.requester} failed: ${sentence(error)}. ${problem.message}`);
    }
    this.record(kind, problem.code);
    throw new SeatResetError(problem.code, outcome, `${problem.message} ${result}`);
  }

  private wait(): void {
    const result = hcWait(this.requester, WAIT_SECONDS, this.options);
    if (!result.ended) throw this.refuse('requester_busy', 'nothing_sent', `${this.requester} did not end its turn in ${WAIT_SECONDS} s (${result.reason}).`);
  }

  private async poll<T>(read: () => T | null, ms: number): Promise<T | null> {
    for (const deadline = Date.now() + ms; ; await new Promise(resolve => setTimeout(resolve, this.timeouts.pollMs))) {
      const value = read();
      if (value !== null || Date.now() >= deadline) return value;
    }
  }

  private waitForSession(since: number): Promise<NewSession | null> {
    return this.poll(() => newSession(this.identity, since, this.request!), this.timeouts.signalMs);
  }

  /** Sends the prompt; true when the model sends RESUMED in the new transcript within the evidence window. */
  private async promptAnswered(session: NewSession): Promise<boolean> {
    const offset = fileSize(session.transcript);
    hcSend(this.requester, this.prompt, this.options);
    return await this.poll(() => (sentResumed(readAppended(session.transcript, offset), this.prompt, this.caller) ? true : null), this.timeouts.evidenceMs) !== null;
  }

  private done(session: NewSession, relaunched: boolean): Omit<SeatResetResult, 'logErrors'> {
    this.record('reset', relaunched ? 'relaunched' : 'cleared', { session_id: session.sessionId });
    return { requester: this.requester, seat: this.identity.seat, relaunched };
  }

  /** No signal types /clear again; no answer sends the prompt again. After 3 retries the requester is relaunched. */
  private async clearAndResume(): Promise<Omit<SeatResetResult, 'logErrors'>> {
    let since = Date.now();
    typeLine(this.requester, '/clear', this.options);
    let session: NewSession | null = null;
    // The log counts across runs; the run counts too, so an unwritable log still ends the retries.
    for (let failures = 1; ; failures += 1) {
      session ??= await this.waitForSession(since);
      const failure = session === null ? 'no_signal' : await this.promptAnswered(session) ? null : 'no_evidence';
      if (failure === null) return this.done(session!, false);
      this.record('resume', failure);
      if (failures > SEAT_RESET_RETRIES || this.count('resume') > SEAT_RESET_RETRIES) return this.relaunch();
      if (failure === 'no_signal') {
        since = Date.now();
        typeLine(this.requester, '/clear', this.options);
      }
    }
  }

  private async relaunch(): Promise<Omit<SeatResetResult, 'logErrors'>> {
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
      writeFileSync(script, `${(await this.options.relaunchArgv(this.identity)).map(shellQuote).join(' ')}\n`, { mode: 0o700 });
    } catch (error) {
      throw stop(`relaunch_argv_failed: ${sentence(error)}`, true);
    }
    const turn = hcWait(this.requester, WAIT_SECONDS, this.options);
    if (!turn.ended) throw stop('requester_busy', true);
    typeLine(this.requester, '/exit', this.options);
    if (await this.poll(() => (hcGet(this.requester, this.options).foreground?.name === 'claude' ? null : true), this.timeouts.exitMs) === null) {
      throw stop('claude_did_not_exit');
    }
    const startedAt = Date.now();
    typeLine(this.requester, `sh ${script}`, this.options);
    const session = await this.waitForSession(startedAt);
    if (session === null) throw stop('no_signal');
    if (!await this.promptAnswered(session)) throw stop('no_evidence');
    return this.done(session, true);
  }
}
