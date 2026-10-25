import { currentReadonlyObservation, rejectObservation, observationReadFileSync as readFileSync } from '../readonly-observation';
/**
 * Append-only event log IO (D1/D2/D5). Genesis-before-append is enforced
 * fail-closed; reads apply the pure corrupt-tail policy from
 * `src/core/evidence/fold.ts` and quarantine any discarded tail.
 */
import { closeSync, constants, existsSync, fsyncSync, ftruncateSync, openSync, realpathSync } from "fs";
import { dirname, join } from "path";
import type { EvidenceEventRecord, EvidenceLogRecord, GenesisRecord } from "../../core/evidence/types";
import { findCorruptTail, foldAcceptedEvents, parseLogLine } from "../../core/evidence/fold";
import { withExclusiveDirectoryLock } from "../locking/exclusive-directory-lock";
import { buildEvidenceEvent, type EvidenceEventConstructionInput } from "./event-writer";
import { appendLineDurably, createFileExclusiveDurably, syncDirectoryDurably } from "../atomic-append";
import { EVENTS_DIR_RELATIVE, resolveEventsDir, resolveLogPath } from "./paths";

export type EvidenceEventInput = EvidenceEventConstructionInput;

const LOG_LOCK = `${EVENTS_DIR_RELATIVE}/.log.lock`;

/**
 * Every log mutation (genesis, append, corrupt-tail repair) holds this lock.
 * A repair truncates to an offset that it read, so an append between that
 * read and the truncation would be deleted without a quarantine copy.
 */
function withLogLock<T>(repoRoot: string, operation: () => T): T {
  return withExclusiveDirectoryLock(realpathSync(repoRoot), LOG_LOCK, operation, { reclaimStaleEmptyDirectory: true });
}

/**
 * The final record has no "\n", so an append now would join two records on one
 * line (#862). Appends do not repair: they already hold the log lock, and the
 * repair takes the same lock.
 */
export class UnterminatedEvidenceLogError extends Error {
  constructor(readonly logPath: string, operation: string) {
    super(`${operation}: store at ${logPath} ends with an unterminated record; run a recovery read first, for example \`repo-harness run decision-trail render\``);
    this.name = "UnterminatedEvidenceLogError";
  }
}

/**
 * A terminated record does not parse. D5 truncates the log at that record, so
 * the next read would quarantine an append made now (#880). Appends do not
 * repair, for the same lock reason as above.
 */
export class CorruptEvidenceLogError extends Error {
  constructor(readonly logPath: string, operation: string, readonly line: number) {
    super(`${operation}: store at ${logPath} has a corrupt record at line ${line}; run a recovery read first, for example \`repo-harness run decision-trail render\``);
    this.name = "CorruptEvidenceLogError";
  }
}

/** The raw log bytes, split at each 0x0a; `ends[i]` is the byte offset after line i and its "\n". */
interface RawLog {
  readonly bytes: Buffer;
  readonly lines: readonly Buffer[];
  readonly ends: readonly number[];
  readonly terminated: boolean;
}

function readRawLog(logPath: string): RawLog {
  const bytes = existsSync(logPath) ? readFileSync(logPath) : Buffer.alloc(0);
  const lines: Buffer[] = [];
  const ends: number[] = [];
  let start = 0;
  while (start < bytes.length) {
    const newline = bytes.indexOf(0x0a, start);
    // Every complete record line ends with "\n" by construction (appendLineDurably
    // always writes one), so bytes after the last "\n" mean the last write was
    // truncated mid-line; keep them so they are detected as corrupt.
    const end = newline === -1 ? bytes.length : newline + 1;
    lines.push(bytes.subarray(start, newline === -1 ? end : newline));
    ends.push(end);
    start = end;
  }
  return { bytes, lines, ends, terminated: bytes.length === 0 || bytes[bytes.length - 1] === 0x0a };
}

/** Read and validate exactly the first record as a genesis record; null if the store is empty or malformed. */
export function readGenesisRecord(repoRoot: string): GenesisRecord | null {
  const { lines, terminated } = readRawLog(resolveLogPath(repoRoot));
  if (lines.length === 1 && !terminated) return null;
  if (lines.length === 0) return null;
  const parsed = parseLogLine(lines[0]!.toString("utf-8"));
  if (!parsed.ok || parsed.record.kind !== "evidence_genesis") return null;
  return parsed.record;
}

export interface AppendGenesisOptions {
  readonly worktreeId: string;
}

/**
 * D2: the store's genesis record carries `ledger_epoch_start_sha`. Writing
 * it is idempotent for a matching epoch; fails closed if the store already
 * has a different epoch pinned, or has non-genesis content at position 0.
 */
export function appendGenesisRecord(
  repoRoot: string,
  ledgerEpochStartSha: string,
  opts: AppendGenesisOptions,
): GenesisRecord {
  return withLogLock(repoRoot, () => appendGenesisRecordLocked(repoRoot, ledgerEpochStartSha, opts));
}

function appendGenesisRecordLocked(
  repoRoot: string,
  ledgerEpochStartSha: string,
  opts: AppendGenesisOptions,
): GenesisRecord {
  const logPath = resolveLogPath(repoRoot);
  const { parsedLines } = readAppendableLog(logPath, "cannot write genesis record");

  if (parsedLines.length > 0) {
    const parsed = parsedLines[0]!;
    if (!parsed.ok || parsed.record.kind !== "evidence_genesis") {
      throw new Error(`cannot write genesis record: store at ${logPath} already has non-genesis content`);
    }
    if (parsed.record.ledger_epoch_start_sha !== ledgerEpochStartSha) {
      throw new Error(
        `genesis epoch mismatch: store is pinned to ${parsed.record.ledger_epoch_start_sha}, requested ${ledgerEpochStartSha}`,
      );
    }
    return parsed.record;
  }

  const record: GenesisRecord = {
    kind: "evidence_genesis",
    schema_version: 1,
    worktree_id: opts.worktreeId,
    ledger_epoch_start_sha: ledgerEpochStartSha,
    created_at: new Date().toISOString(),
  };
  appendLineDurably(logPath, JSON.stringify(record));
  return record;
}

/**
 * Append one evidence event. Always goes through `buildEvidenceEvent`'s
 * construction path -- there is no way to append a hand-built record that
 * skipped D6's invariants. Fails closed if the store has no genesis record,
 * ends with an unterminated record, or holds a record that does not parse.
 */
export function appendEvidenceEvent(repoRoot: string, input: EvidenceEventInput): EvidenceEventRecord {
  const logPath = resolveLogPath(repoRoot);
  return withLogLock(repoRoot, () => {
    const first = readAppendableLog(logPath, "cannot append").parsedLines[0];
    if (!first?.ok || first.record.kind !== "evidence_genesis") {
      throw new Error(`cannot append: store at ${logPath} has no genesis record; call appendGenesisRecord first`);
    }
    const record = buildEvidenceEvent(repoRoot, input);
    appendLineDurably(logPath, JSON.stringify(record));
    return record;
  });
}

export interface ReadAcceptedEventsResult {
  readonly genesis: GenesisRecord | null;
  readonly accepted: readonly EvidenceEventRecord[];
  readonly quarantinedPath: string | null;
}

/**
 * Read the log, apply D5's corrupt-tail policy (truncate at the last valid
 * offset, quarantine the discarded tail, never skip a corrupt middle
 * record and resume), and fold the valid evidence events into the accepted
 * set.
 */
interface LogSnapshot {
  readonly raw: RawLog;
  readonly parsedLines: readonly ReturnType<typeof parseLogLine>[];
  readonly corruptTail: ReturnType<typeof findCorruptTail>;
}

function readLogSnapshot(logPath: string): LogSnapshot {
  const raw = readRawLog(logPath);
  // A lenient UTF-8 decode keeps the accepted set as before; byte offsets keep the repair exact.
  const parsedLines = raw.lines.map((line, index) =>
    index === raw.lines.length - 1 && !raw.terminated
      ? { ok: false as const, error: "unterminated record" }
      : parseLogLine(line.toString("utf-8")));
  return { raw, parsedLines, corruptTail: findCorruptTail(parsedLines) };
}

/**
 * Call under the log lock before an append. Every record must parse: D5 drops
 * all records from the first corrupt one, so a later append would be lost.
 */
function readAppendableLog(logPath: string, operation: string): LogSnapshot {
  const snapshot = readLogSnapshot(logPath);
  if (!snapshot.raw.terminated) throw new UnterminatedEvidenceLogError(logPath, operation);
  const { corruptStartIndex } = snapshot.corruptTail;
  if (corruptStartIndex !== null) throw new CorruptEvidenceLogError(logPath, operation, corruptStartIndex + 1);
  return snapshot;
}

/** Persist the removed bytes before truncation. The caller must hold the log lock
 * and supply the snapshot and byte offset read under that lock. */
export function quarantineEvidenceTail(logPath: string, quarantinedPath: string, bytes: Buffer, validEnd: number): void {
  createFileExclusiveDurably(quarantinedPath, bytes.subarray(validEnd));
  syncDirectoryDurably(dirname(quarantinedPath));
  const fd = openSync(logPath, constants.O_WRONLY);
  try {
    ftruncateSync(fd, validEnd);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Re-read under the log lock, so the quarantine holds every byte that the truncation removes. */
function repairCorruptTail(repoRoot: string, logPath: string): LogSnapshot & { readonly quarantinedPath: string | null } {
  return withLogLock(repoRoot, () => {
    const snapshot = readLogSnapshot(logPath);
    const { raw, corruptTail } = snapshot;
    if (corruptTail.corruptStartIndex === null) return { ...snapshot, quarantinedPath: null };
    const quarantinedPath = join(resolveEventsDir(repoRoot), `events.corrupt-${Date.now()}`);
    const validEnd = corruptTail.validLineCount === 0 ? 0 : raw.ends[corruptTail.validLineCount - 1]!;
    quarantineEvidenceTail(logPath, quarantinedPath, raw.bytes, validEnd);
    return { ...snapshot, quarantinedPath };
  });
}

export function readAcceptedEvents(repoRoot: string): ReadAcceptedEventsResult {
  const logPath = resolveLogPath(repoRoot);
  const unlocked = readLogSnapshot(logPath);
  if (currentReadonlyObservation() && unlocked.corruptTail.corruptStartIndex !== null) rejectObservation('Corrupt evidence tail requires owner repair; observation cannot repair');
  // A clean read changes nothing, so only a repair takes the log lock.
  const { parsedLines, corruptTail, quarantinedPath } = unlocked.corruptTail.corruptStartIndex === null
    ? { ...unlocked, quarantinedPath: null }
    : repairCorruptTail(repoRoot, logPath);

  const validRecords: EvidenceLogRecord[] = [];
  for (let i = 0; i < corruptTail.validLineCount; i++) {
    const parsed = parsedLines[i]!;
    if (parsed.ok) validRecords.push(parsed.record);
  }

  const genesis = validRecords.find((record): record is GenesisRecord => record.kind === "evidence_genesis") ?? null;
  const events = validRecords.filter((record): record is EvidenceEventRecord => record.kind === "evidence_event");
  const fold = foldAcceptedEvents(events);

  return { genesis, accepted: fold.accepted, quarantinedPath };
}
