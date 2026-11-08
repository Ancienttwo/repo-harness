import { createHash } from 'crypto';
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { appendFileSync, existsSync } from 'fs';
import {
  SEAT_NO_RESET_MESSAGE, SEAT_RESET_RETRIES, handoffIdentity, missingHandoffSections, seatResetLogPath, seatResetRequestPath,
  seatResetDirectory, seatResumePrompt, seatRewriteMessage, seatSessionPath, type SeatResetIdentity,
} from '../../core/board/seat-reset';
import { RH_LABEL, hcGet, hcKeys, hcList, hcSend, hcWait, type HerdrCoreOptions } from '../terminal/herdr-core';
import { postNotifyEvent } from '../terminal/notify-relay';

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
export function recordSeatSession(identity: SeatResetIdentity, session: { readonly sessionId: string | null; readonly transcriptPath: string; readonly source: string }, now: Date): void {
  const path = seatSessionPath(identity);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({ session_id: session.sessionId, transcript_path: session.transcriptPath, source: session.source, started_at: now.toISOString() })}\n`);
}

/** `nothing_sent`: no terminal got a message. `uncertain`: the requester may already be cleared. */
export type SeatResetOutcome = 'nothing_sent' | 'rewrite_requested' | 'no_reset' | 'uncertain';

export class SeatResetError extends Error {
  constructor(readonly code: 'handoff_path_invalid' | 'handoff_missing' | 'request_missing' | 'handoff_stale' | 'handoff_sha256_mismatch' | 'handoff_sections_missing'
    | 'caller_unknown' | 'requester_not_found' | 'requester_busy' | 'resume_not_sent', readonly outcome: SeatResetOutcome, message: string) {
    super(message);
  }
}

type HandoffCode = 'handoff_missing' | 'handoff_stale' | 'handoff_sha256_mismatch' | 'handoff_sections_missing';
type LogKind = 'rewrite' | 'no_reset' | 'resume' | 'relaunch_failed' | 'resume_not_sent';

interface SeatRequest {
  readonly requestedAt: string;
  readonly transcriptPath: string | null;
}

function readRequest(identity: SeatResetIdentity): SeatRequest {
  let value: { requested_at?: unknown; transcript_path?: unknown } = {};
  try { value = JSON.parse(readFileSync(seatResetRequestPath(identity), 'utf8')); } catch { /* checked below */ }
  if (typeof value.requested_at !== 'string' || !Number.isFinite(Date.parse(value.requested_at))) {
    throw new SeatResetError('request_missing', 'nothing_sent', `${seatResetRequestPath(identity)} is missing or not valid: the Stop hook did not ask for this reset.`);
  }
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

/** The transcript of a session that started at or after `since` and is not the transcript of the request. */
function newSession(identity: SeatResetIdentity, since: number, request: SeatRequest): string | null {
  try {
    const value = JSON.parse(readFileSync(seatSessionPath(identity), 'utf8')) as { transcript_path?: unknown; started_at?: unknown };
    const fresh = typeof value.started_at === 'string' && Date.parse(value.started_at) >= since;
    return fresh && typeof value.transcript_path === 'string' && value.transcript_path !== request.transcriptPath ? value.transcript_path : null;
  } catch {
    return null;
  }
}

/** Mechanical resume evidence: the transcript has a user entry whose text holds the resume prompt (hc may wrap it). */
function hasUserPrompt(transcript: string, prompt: string): boolean {
  let text: string;
  try { text = readFileSync(transcript, 'utf8'); } catch { return false; }
  return text.split('\n').some((line) => {
    try {
      const entry = JSON.parse(line) as { type?: unknown; message?: { content?: unknown } };
      const content = entry.message?.content;
      const holds = (value: unknown) => typeof value === 'string' && value.includes(prompt);
      return entry.type === 'user' && (holds(content) || (Array.isArray(content) && content.some(part => holds((part as { text?: unknown } | null)?.text))));
    } catch {
      return false;
    }
  });
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

export interface SeatResetOptions extends HerdrCoreOptions {
  /** The argv of `repo-harness seats argv <seat> --repository-id <id>`, for the relaunch. */
  readonly relaunchArgv: (identity: SeatResetIdentity) => Promise<readonly string[]>;
  /** Tests only: shorter waits. */
  readonly timeouts?: SeatResetTimeouts;
}

export interface SeatResetResult {
  readonly requester: string;
  readonly seat: string;
  readonly relaunched: boolean;
}

/**
 * The peer seat runs this on a `RESET-REQUEST`. It finds the requester by its seat labels. A failed handoff check
 * asks for a rewrite, at most 3 times per request, and then tells the requester to continue without a reset. A
 * valid handoff gets `/clear`; the resume prompt goes out only after the new-session signal, and goes out again
 * when the signal or the resume evidence is missing, at most 3 times. Then the requester starts again from its
 * seat argv in the same terminal. Each failure appends one entry to the reset log and posts one notice.
 */
export async function runSeatReset(path: string, sha256: string, options: SeatResetOptions): Promise<SeatResetResult> {
  const env = options.env ?? process.env;
  const timeouts = options.timeouts ?? TIMEOUTS;
  const identity = handoffIdentity(path);
  if (identity === null) throw new SeatResetError('handoff_path_invalid', 'nothing_sent', `${path} is not the handoff path of the orchestrator or advisor seat.`);
  const request = readRequest(identity);
  const caller = env.HC_TERMINAL_ID;
  if (!caller) throw new SeatResetError('caller_unknown', 'nothing_sent', 'HC_TERMINAL_ID is not set: run the reset from the peer seat terminal.');
  const terminals = hcList({ [RH_LABEL.seat]: identity.seat, [RH_LABEL.repository]: identity.repository }, options);
  if (terminals.length !== 1) {
    throw new SeatResetError('requester_not_found', 'nothing_sent', `${terminals.length} live terminals carry repo-harness.seat=${identity.seat} and repo-harness.repository=${identity.repository}; the reset needs exactly one.`);
  }
  const requester = terminals[0]!.address;
  if (requester === caller) throw new SeatResetError('caller_unknown', 'nothing_sent', `The ${identity.seat} seat cannot reset itself: run the reset from the peer seat.`);

  const logPath = seatResetLogPath(identity);
  const count = (kind: LogKind) => (existsSync(logPath) ? readFileSync(logPath, 'utf8').split('\n') : []).filter((line) => {
    try {
      const entry = JSON.parse(line) as { requested_at?: unknown; kind?: unknown };
      return entry.requested_at === request.requestedAt && entry.kind === kind;
    } catch {
      return false;
    }
  }).length;
  const fail = async (kind: LogKind, detail: string) => {
    const notice = await postNotifyEvent(env, {
      repository: identity.repository, kind: 'seat.reset_failed', data: { seat: identity.seat, failure: kind, detail, handoff: path },
      text: `seat reset ${kind}: ${identity.seat} (${detail})`,
    });
    appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), requested_at: request.requestedAt, kind, detail, notice })}\n`);
  };

  const problem = handoffProblem(path, sha256, request);
  if (problem !== null) {
    const rewrites = count('rewrite');
    if (rewrites < SEAT_RESET_RETRIES) {
      hcSend(requester, seatRewriteMessage(identity, problem.message, rewrites + 1), options);
      await fail('rewrite', problem.code);
      throw new SeatResetError(problem.code, 'rewrite_requested', `${problem.message} Rewrite ${rewrites + 1}/${SEAT_RESET_RETRIES} asked.`);
    }
    hcSend(requester, SEAT_NO_RESET_MESSAGE, options);
    await fail('no_reset', problem.code);
    throw new SeatResetError(problem.code, 'no_reset', `${problem.message} The rewrites are used up: no reset; the requester continues.`);
  }

  const wait = () => {
    const result = hcWait(requester, WAIT_SECONDS, options);
    if (!result.ended) throw new SeatResetError('requester_busy', 'nothing_sent', `${requester} did not end its turn in ${WAIT_SECONDS} s (${result.reason}).`);
  };
  wait();
  const prompt = seatResumePrompt(identity, caller);
  const poll = async <T>(read: () => T | null, ms: number): Promise<T | null> => {
    for (const deadline = Date.now() + ms; ; await new Promise(resolve => setTimeout(resolve, timeouts.pollMs))) {
      const value = read();
      if (value !== null || Date.now() >= deadline) return value;
    }
  };
  /** Waits for the new-session signal, sends the prompt and waits for the evidence; the failure detail, or null. */
  const resume = async (since: number): Promise<string | null> => {
    const transcript = await poll(() => newSession(identity, since, request), timeouts.signalMs);
    if (transcript === null) return 'no_signal';
    hcSend(requester, prompt, options);
    return await poll(() => (hasUserPrompt(transcript, prompt) ? true : null), timeouts.evidenceMs) ? null : 'no_evidence';
  };

  // From the /clear send on, the requester may already be cleared, so a failure gives the prompt to send by hand.
  try {
    const clearedAt = Date.now();
    typeLine(requester, '/clear', options);
    for (let failure = await resume(clearedAt); failure !== null; failure = await resume(clearedAt)) {
      await fail('resume', failure);
      if (count('resume') > SEAT_RESET_RETRIES) return await relaunch();
    }
    return { requester, seat: identity.seat, relaunched: false };
  } catch (error) {
    if (error instanceof SeatResetError && error.outcome === 'uncertain') throw error;
    await fail('resume_not_sent', (error as Error).message);
    throw new SeatResetError('resume_not_sent', 'uncertain', `${requester} may have got /clear, but not the resume prompt: ${(error as Error).message}. Send it by hand: ${prompt}`);
  }

  async function relaunch(): Promise<SeatResetResult> {
    const stop = async (detail: string): Promise<never> => {
      await fail('relaunch_failed', detail);
      throw new SeatResetError('resume_not_sent', 'uncertain', `The relaunch of ${requester} failed (${detail}). Start it from \`repo-harness seats argv ${identity!.seat} --repository-id ${identity!.repository}\` and send: ${prompt}`);
    };
    wait();
    typeLine(requester, '/exit', options);
    if (await poll(() => (hcGet(requester, options).foreground?.name === 'claude' ? null : true), timeouts.exitMs) === null) return stop('claude_did_not_exit');
    // The argv needs characters that hc keys cannot type, so the login shell runs it from a script.
    const script = `${seatResetDirectory(identity!)}/relaunch.sh`;
    if (!TYPABLE.test(script) || script.includes(' ')) return stop('relaunch_path_untypable');
    writeFileSync(script, `${(await options.relaunchArgv(identity!)).map(shellQuote).join(' ')}\n`, { mode: 0o700 });
    const startedAt = Date.now();
    typeLine(requester, `sh ${script}`, options);
    const failure = await resume(startedAt);
    return failure === null ? { requester, seat: identity!.seat, relaunched: true } : stop(failure);
  }
}
