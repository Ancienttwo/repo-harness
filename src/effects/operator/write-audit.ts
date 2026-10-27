import { closeSync, constants, fstatSync, fsyncSync, ftruncateSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { JsonValue } from '../../core/evidence/types';
import { syncDirectoryDurably } from '../atomic-append';
import { repoHarnessHome } from '../repo-harness-home';

/**
 * Every console write is recorded in one account-level log, not in a worktree
 * evidence ledger: a new docs worktree has no genesis record, and discard and
 * cleanup delete the worktree together with anything stored in it. The log
 * roots at `repoHarnessHome`, the single account home authority, so
 * REPO_HARNESS_HOME moves it together with the registry and MCP state.
 *
 * The log is also the idempotency index. A second store keyed by request_id
 * could disagree with the log; deriving replay state from the log cannot.
 */
export const OPERATOR_AUDIT_PROTOCOL = 1 as const;

export function operatorStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(repoHarnessHome(env), 'operator');
}

export function operatorAuditPathIn(stateDir: string): string {
  return join(stateDir, 'audit.jsonl');
}

export function operatorAuditPath(env: NodeJS.ProcessEnv = process.env): string {
  return operatorAuditPathIn(operatorStateDir(env));
}

/** The canonical lock root. The directory lock refuses a root reached through a symlink. */
export function prepareOperatorStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const dir = operatorStateDir(env);
  const firstCreated = mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (firstCreated !== undefined) {
    // A new directory entry survives a crash only after its parent is synced.
    for (let created = dir; dirname(created) !== created; created = dirname(created)) {
      // syncDirectoryDurably refuses a symlink, so sync the resolved parent.
      syncDirectoryDurably(realpathSync(dirname(created)));
      if (created === firstCreated) break;
    }
  }
  return realpathSync(dir);
}

export interface OperatorWriteIntentRecordV1 {
  readonly protocol: typeof OPERATOR_AUDIT_PROTOCOL;
  readonly phase: 'intent';
  readonly recorded_at: string;
  readonly request_id: string;
  readonly operation: string;
  readonly target: string;
  readonly binding_sha256: string;
}

export interface OperatorWriteResultRecordV1 {
  readonly protocol: typeof OPERATOR_AUDIT_PROTOCOL;
  readonly phase: 'result';
  readonly recorded_at: string;
  readonly request_id: string;
  readonly binding_sha256: string;
  readonly status: number;
  readonly body: JsonValue;
}

export type OperatorAuditRecordV1 = OperatorWriteIntentRecordV1 | OperatorWriteResultRecordV1;

export interface OperatorAuditRequestState {
  readonly intent: OperatorWriteIntentRecordV1 | null;
  readonly result: OperatorWriteResultRecordV1 | null;
}

/** The log could not be read or holds a record this decoder does not accept. */
export class OperatorAuditUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorAuditUnavailableError';
  }
}

const SHA256 = /^[0-9a-f]{64}$/u;
const INTENT_KEYS = ['binding_sha256', 'operation', 'phase', 'protocol', 'recorded_at', 'request_id', 'target'];
const RESULT_KEYS = ['binding_sha256', 'body', 'phase', 'protocol', 'recorded_at', 'request_id', 'status'];

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function decodeAuditRecord(value: unknown): OperatorAuditRecordV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OperatorAuditUnavailableError('audit record is not an object');
  const record = value as Record<string, unknown>;
  const common = record.protocol === OPERATOR_AUDIT_PROTOCOL
    && typeof record.recorded_at === 'string'
    && typeof record.request_id === 'string'
    && typeof record.binding_sha256 === 'string'
    && SHA256.test(record.binding_sha256);
  if (common && record.phase === 'intent' && hasExactKeys(record, INTENT_KEYS)
    && typeof record.operation === 'string' && typeof record.target === 'string') {
    return record as unknown as OperatorWriteIntentRecordV1;
  }
  if (common && record.phase === 'result' && hasExactKeys(record, RESULT_KEYS)
    && Number.isSafeInteger(record.status) && 'body' in record) {
    return record as unknown as OperatorWriteResultRecordV1;
  }
  throw new OperatorAuditUnavailableError('audit record does not match the closed schema');
}

/**
 * Fails closed on an unreadable or malformed log: a request_id cannot be
 * proven new when part of the log is unreadable, so nothing may execute.
 */
export function readOperatorAuditRequest(auditPath: string, requestId: string): OperatorAuditRequestState {
  let text: string;
  try {
    text = readFileSync(auditPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { intent: null, result: null };
    throw new OperatorAuditUnavailableError('audit log is unreadable');
  }
  let intent: OperatorWriteIntentRecordV1 | null = null;
  let result: OperatorWriteResultRecordV1 | null = null;
  for (const line of text.split('\n')) {
    if (line === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new OperatorAuditUnavailableError('audit log has a malformed line');
    }
    const record = decodeAuditRecord(parsed);
    if (record.request_id !== requestId) continue;
    if (record.phase === 'intent') intent ??= record;
    else result ??= record;
  }
  return { intent, result };
}

function openAuditLog(auditPath: string): { readonly fd: number; readonly created: boolean } {
  const flags = constants.O_RDWR | constants.O_APPEND;
  try {
    return { fd: openSync(auditPath, flags | constants.O_CREAT | constants.O_EXCL, 0o600), created: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return { fd: openSync(auditPath, flags), created: false };
  }
}

/**
 * One durable line per record. A record that is not on disk does not count as
 * written: the line, and for a new log its directory entry, are synced before
 * this returns. The caller holds the audit lock.
 */
export function appendOperatorAuditRecord(auditPath: string, record: OperatorAuditRecordV1): void {
  const line = `${JSON.stringify(record)}\n`;
  // A line the reader refuses would fail every later lookup closed for the
  // whole account, so it must not reach the log.
  decodeAuditRecord(JSON.parse(line));
  const { fd, created } = openAuditLog(auditPath);
  try {
    const before = fstatSync(fd).size;
    // An interrupted append can leave a record without its newline. Appending
    // after it would join two records on one line, so refuse and leave the
    // tail for an operator to inspect; never repair it here.
    if (before > 0) {
      const last = Buffer.alloc(1);
      if (readSync(fd, last, 0, 1, before - 1) !== 1 || last[0] !== 0x0a) {
        throw new OperatorAuditUnavailableError('audit log ends with an unterminated record');
      }
    }
    const written = writeSync(fd, line);
    if (written !== Buffer.byteLength(line)) {
      // Cut the torn tail so the log stays readable; the caller holds the audit lock.
      ftruncateSync(fd, before);
      throw new OperatorAuditUnavailableError('audit record was only partly written');
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (created) syncDirectoryDurably(dirname(auditPath));
}
