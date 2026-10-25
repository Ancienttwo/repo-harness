/**
 * Attempt-ledger IO: one append-only JSONL file under ignored runtime
 * evidence, plus the read the continuation envelope performs.
 *
 * One ledger, not one file per run: `<run-id>` sharding is deliberately
 * rejected until contention is actually observed, so ordering stays a property
 * of the file itself and the reader needs no merge step.
 *
 * The append is serialized by the repository's exclusive-directory lock (the
 * house mutual-exclusion primitive -- neither Bun nor Node expose `flock(2)`,
 * and macOS ships no `flock(1)`, so this is the available equivalent and adds
 * no dependency) and lands as a single whole-line `O_APPEND` write plus
 * `fsync`, which is the house atomic-append pattern from
 * `src/effects/atomic-append.ts`.
 *
 * Reading is `readText`, exactly like every other state source: repository
 * confined, absent-tolerant, and write-free. Only the explicit repair writes
 * outside an append, and it takes the same lock.
 */
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
} from 'fs';
import { dirname, posix, resolve } from 'path';
import {
  parseAttemptLedger,
  type AttemptLedgerRead,
} from '../../core/state/attempt-ledger';
import type { AttemptReceiptV1 } from '../../core/state/types';
import {
  appendLineDurably,
  createFileExclusiveDurably,
  syncDirectoryDurably,
} from '../atomic-append';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { readText, repoPath } from './collect-state-inputs';

export const ATTEMPT_LEDGER_PATH = '.ai/harness/runs/continuation/attempts.jsonl';
const ATTEMPT_LEDGER_LOCK_PATH = '.ai/harness/runs/continuation/attempts.lock';
const ATTEMPT_LEDGER_REPAIR_COMMAND = 'repo-harness state attempt-repair --json';

const NEWLINE = 0x0a;

/**
 * The last receipt has no "\n", so an append now would join two receipts on
 * one line (#881). The append does not repair: discarding bytes is an explicit
 * operator step.
 */
export class UnterminatedAttemptLedgerError extends Error {
  constructor(readonly ledgerPath: string) {
    super(`cannot append attempt receipt: ledger ${ATTEMPT_LEDGER_PATH} (${ledgerPath}) ends with an unterminated line; run \`${ATTEMPT_LEDGER_REPAIR_COMMAND}\` to quarantine it`);
    this.name = 'UnterminatedAttemptLedgerError';
  }
}

/** Reads only the last byte, because the ledger grows without bound. */
function endsWithUnterminatedLine(ledgerPath: string): boolean {
  let fd: number;
  try {
    fd = openSync(ledgerPath, constants.O_RDONLY);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  try {
    const { size } = fstatSync(fd);
    if (size === 0) return false;
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] !== NEWLINE;
  } finally {
    closeSync(fd);
  }
}

/**
 * Append exactly one receipt line. Dumb by contract: no state resolution, no
 * derivation, and no tracked file is touched -- `.ai/harness/runs/` is ignored
 * runtime evidence.
 */
export function appendAttemptReceipt(cwd: string, receipt: AttemptReceiptV1): void {
  const canonicalRoot = realpathSync(resolve(cwd));
  const ledgerPath = repoPath(canonicalRoot, ATTEMPT_LEDGER_PATH);
  withExclusiveDirectoryLock(canonicalRoot, ATTEMPT_LEDGER_LOCK_PATH, () => {
    if (endsWithUnterminatedLine(ledgerPath)) throw new UnterminatedAttemptLedgerError(ledgerPath);
    appendLineDurably(ledgerPath, JSON.stringify(receipt));
  });
}

/** Read-only ledger load for the continuation envelope. */
export function readAttemptLedger(cwd: string): AttemptLedgerRead {
  return parseAttemptLedger(readText(cwd, ATTEMPT_LEDGER_PATH));
}

export interface AttemptLedgerRepair {
  /** Repo-relative quarantine file, or null when the ledger had no torn tail. */
  readonly quarantinedPath: string | null;
  /** The ledger read after the repair; a malformed middle line stays unreadable. */
  readonly ledger: AttemptLedgerRead;
}

function truncateDurably(path: string, length: number): void {
  const fd = openSync(path, constants.O_WRONLY);
  try {
    ftruncateSync(fd, length);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Move the bytes after the last "\n" to a new quarantine file, then truncate
 * the ledger to its last complete line. The quarantine is durable before the
 * truncate, so a crash between the two leaves at most a duplicate quarantine.
 */
function quarantineUnterminatedTail(canonicalRoot: string, nowMs: number): string | null {
  const ledgerPath = repoPath(canonicalRoot, ATTEMPT_LEDGER_PATH);
  if (!endsWithUnterminatedLine(ledgerPath)) return null;
  const bytes = readFileSync(ledgerPath);
  // 0x0a never occurs inside a UTF-8 multi-byte sequence, so this is a line boundary.
  const keepLength = bytes.lastIndexOf(NEWLINE) + 1;
  const quarantinedPath = posix.join(posix.dirname(ATTEMPT_LEDGER_PATH), `attempts.torn-${nowMs}`);
  createFileExclusiveDurably(repoPath(canonicalRoot, quarantinedPath), bytes.subarray(keepLength));
  syncDirectoryDurably(dirname(ledgerPath));
  truncateDurably(ledgerPath, keepLength);
  return quarantinedPath;
}

/**
 * Explicit repair for a torn tail. It changes only the bytes after the last
 * complete receipt and keeps them in the quarantine file.
 */
export function repairAttemptLedgerTail(cwd: string, nowMs: number): AttemptLedgerRepair {
  const canonicalRoot = realpathSync(resolve(cwd));
  return withExclusiveDirectoryLock(canonicalRoot, ATTEMPT_LEDGER_LOCK_PATH, () => ({
    quarantinedPath: quarantineUnterminatedTail(canonicalRoot, nowMs),
    ledger: readAttemptLedger(canonicalRoot),
  }));
}
