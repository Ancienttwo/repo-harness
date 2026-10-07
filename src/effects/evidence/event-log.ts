import { currentReadonlyObservation, rejectObservation, observationReadFileSync as readFileSync } from '../state/readonly-observation';
/**
 * Append-only event log IO (D1/D2/D5). Genesis-before-append is enforced
 * fail-closed; reads apply the pure corrupt-tail policy from
 * `src/core/evidence/fold.ts` and quarantine any discarded tail.
 */
import { existsSync, realpathSync, truncateSync } from "fs";
import { join } from "path";
import type { EvidenceEventRecord, EvidenceLogRecord, GenesisRecord } from "../../core/evidence/types";
import { findCorruptTail, foldAcceptedEvents, parseLogLine } from "../../core/evidence/fold";
import { withExclusiveDirectoryLock } from "../locking/exclusive-directory-lock";
import { buildEvidenceEvent, type EvidenceEventConstructionInput } from "./event-writer";
import { appendLineDurably, writeFileDurably } from "./atomic-append";
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

function readRawLines(logPath: string): string[] {
  if (!existsSync(logPath)) return [];
  const raw = readFileSync(logPath, "utf-8");
  if (raw.length === 0) return [];
  const lines = raw.split("\n");
  // Every complete record line ends with "\n" by construction (appendLineDurably
  // always writes one), so a non-empty final split element means the last
  // write was truncated mid-line; keep it so it is detected as corrupt.
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Read and validate exactly the first record as a genesis record; null if the store is empty or malformed. */
export function readGenesisRecord(repoRoot: string): GenesisRecord | null {
  const lines = readRawLines(resolveLogPath(repoRoot));
  if (lines.length === 0) return null;
  const parsed = parseLogLine(lines[0]!);
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
  const lines = readRawLines(logPath);

  if (lines.length > 0) {
    const parsed = parseLogLine(lines[0]!);
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
 * skipped D6's invariants. Fails closed if the store has no genesis record.
 */
export function appendEvidenceEvent(repoRoot: string, input: EvidenceEventInput): EvidenceEventRecord {
  const logPath = resolveLogPath(repoRoot);
  return withLogLock(repoRoot, () => {
    if (!readGenesisRecord(repoRoot)) {
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
  readonly rawLines: readonly string[];
  readonly parsedLines: readonly ReturnType<typeof parseLogLine>[];
  readonly corruptTail: ReturnType<typeof findCorruptTail>;
}

function readLogSnapshot(logPath: string): LogSnapshot {
  const rawLines = readRawLines(logPath);
  const parsedLines = rawLines.map((line) => parseLogLine(line));
  return { rawLines, parsedLines, corruptTail: findCorruptTail(parsedLines) };
}

/** Re-read under the log lock, so the quarantine holds every byte that the truncation removes. */
function repairCorruptTail(repoRoot: string, logPath: string): LogSnapshot & { readonly quarantinedPath: string | null } {
  return withLogLock(repoRoot, () => {
    const snapshot = readLogSnapshot(logPath);
    const { rawLines, corruptTail } = snapshot;
    if (corruptTail.corruptStartIndex === null) return { ...snapshot, quarantinedPath: null };
    const corruptLines = rawLines.slice(corruptTail.corruptStartIndex);
    const quarantinedPath = join(resolveEventsDir(repoRoot), `events.corrupt-${Date.now()}`);
    writeFileDurably(quarantinedPath, `${corruptLines.join("\n")}\n`);

    const validPrefix = rawLines.slice(0, corruptTail.validLineCount).map((line) => `${line}\n`).join("");
    truncateSync(logPath, Buffer.byteLength(validPrefix, "utf-8"));
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
