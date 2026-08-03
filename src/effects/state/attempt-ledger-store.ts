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
 * `src/effects/evidence/atomic-append.ts`.
 *
 * Reading is `readText`, exactly like every other state source: repository
 * confined, absent-tolerant, and write-free.
 */
import { realpathSync } from 'fs';
import { resolve } from 'path';
import {
  parseAttemptLedger,
  type AttemptLedgerRead,
} from '../../core/state/attempt-ledger';
import type { AttemptReceiptV1 } from '../../core/state/types';
import { appendLineDurably } from '../evidence/atomic-append';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { readText, repoPath } from './collect-state-inputs';

export const ATTEMPT_LEDGER_PATH = '.ai/harness/runs/continuation/attempts.jsonl';
const ATTEMPT_LEDGER_LOCK_PATH = '.ai/harness/runs/continuation/attempts.lock';

/**
 * Append exactly one receipt line. Dumb by contract: no state resolution, no
 * derivation, and no tracked file is touched -- `.ai/harness/runs/` is ignored
 * runtime evidence.
 */
export function appendAttemptReceipt(cwd: string, receipt: AttemptReceiptV1): void {
  const canonicalRoot = realpathSync(resolve(cwd));
  const ledgerPath = repoPath(canonicalRoot, ATTEMPT_LEDGER_PATH);
  withExclusiveDirectoryLock(canonicalRoot, ATTEMPT_LEDGER_LOCK_PATH, () => {
    appendLineDurably(ledgerPath, JSON.stringify(receipt));
  });
}

/** Read-only ledger load for the continuation envelope. */
export function readAttemptLedger(cwd: string): AttemptLedgerRead {
  return parseAttemptLedger(readText(cwd, ATTEMPT_LEDGER_PATH));
}
