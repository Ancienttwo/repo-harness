import { createHash } from 'crypto';
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  handoffIdentity, missingHandoffSections, seatResetRequestPath, seatResumePrompt, type SeatResetIdentity,
} from '../../core/board/seat-reset';
import { RH_LABEL, hcList, hcSend, hcWait, type HerdrCoreOptions } from '../terminal/herdr-core';

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

/** The Stop hook records when it asked for the reset; the reset command refuses a handoff older than this. */
export function writeSeatResetRequest(identity: SeatResetIdentity, now: Date, contextTokens: number): void {
  const path = seatResetRequestPath(identity);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({ requested_at: now.toISOString(), context_tokens: contextTokens })}\n`);
}

export class SeatResetError extends Error {
  constructor(readonly code: 'handoff_path_invalid' | 'handoff_missing' | 'request_missing' | 'handoff_stale' | 'handoff_sha256_mismatch' | 'handoff_sections_missing'
    | 'caller_unknown' | 'requester_not_found' | 'requester_busy' | 'resume_not_sent', message: string) {
    super(message);
  }
}

const WAIT_SECONDS = 600;

/** Checks the handoff of a `RESET-REQUEST`. Any failure throws before a terminal is touched. */
function checkHandoff(path: string, sha256: string): SeatResetIdentity {
  const identity = handoffIdentity(path);
  if (identity === null) throw new SeatResetError('handoff_path_invalid', `${path} is not the handoff path of the orchestrator or advisor seat.`);
  let requestedAt = Number.NaN;
  try { requestedAt = Date.parse((JSON.parse(readFileSync(seatResetRequestPath(identity), 'utf8')) as { requested_at: string }).requested_at); } catch { /* checked below */ }
  if (!Number.isFinite(requestedAt)) {
    throw new SeatResetError('request_missing', `${seatResetRequestPath(identity)} is missing or not valid: the Stop hook did not ask for this reset.`);
  }
  let modifiedAt: number;
  try { modifiedAt = statSync(path).mtimeMs; } catch { throw new SeatResetError('handoff_missing', `${path} does not exist.`); }
  if (modifiedAt <= requestedAt) {
    throw new SeatResetError('handoff_stale', `${path} is older than the reset request of ${new Date(requestedAt).toISOString()}. Ask the ${identity.seat} seat to write it again.`);
  }
  const text = readFileSync(path);
  const actual = createHash('sha256').update(text).digest('hex');
  if (actual !== sha256.toLowerCase()) throw new SeatResetError('handoff_sha256_mismatch', `${path} has sha256 ${actual}, not ${sha256}.`);
  const missing = missingHandoffSections(text.toString('utf8'));
  if (missing.length > 0) throw new SeatResetError('handoff_sections_missing', `${path} has no section ${missing.map(section => `"## ${section}"`).join(', ')}.`);
  return identity;
}

/**
 * The peer seat runs this on a `RESET-REQUEST`. It finds the requester by its seat labels, waits for its turn to
 * end, sends `/clear` and then the resume prompt. A failure before `/clear` sends nothing.
 */
export function runSeatReset(path: string, sha256: string, options: HerdrCoreOptions = {}): { readonly requester: string; readonly seat: string } {
  const env = options.env ?? process.env;
  const identity = checkHandoff(path, sha256);
  const caller = env.HC_TERMINAL_ID;
  if (!caller) throw new SeatResetError('caller_unknown', 'HC_TERMINAL_ID is not set: run the reset from the peer seat terminal.');
  const terminals = hcList({ [RH_LABEL.seat]: identity.seat, [RH_LABEL.repository]: identity.repository }, options);
  if (terminals.length !== 1) {
    throw new SeatResetError('requester_not_found', `${terminals.length} live terminals carry repo-harness.seat=${identity.seat} and repo-harness.repository=${identity.repository}; the reset needs exactly one.`);
  }
  const requester = terminals[0]!.address;
  if (requester === caller) throw new SeatResetError('caller_unknown', `The ${identity.seat} seat cannot reset itself: run the reset from the peer seat.`);
  const wait = () => {
    const result = hcWait(requester, WAIT_SECONDS, options);
    if (!result.ended) throw new SeatResetError('requester_busy', `${requester} did not end its turn in ${WAIT_SECONDS} s (${result.reason}).`);
  };
  wait();
  hcSend(requester, '/clear', options);
  try {
    wait();
    hcSend(requester, seatResumePrompt(identity, caller), options);
  } catch (error) {
    throw new SeatResetError('resume_not_sent', `${requester} got /clear, but not the resume prompt: ${(error as Error).message}. Send it by hand: ${seatResumePrompt(identity, caller)}`);
  }
  return { requester, seat: identity.seat };
}
