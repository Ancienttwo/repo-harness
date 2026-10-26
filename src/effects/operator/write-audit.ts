import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import type { JsonValue } from '../../core/evidence/types';
import { repoHarnessHome } from '../repo-registry';

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

export function operatorAuditPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(operatorStateDir(env), 'audit.jsonl');
}

/** The canonical lock root. The directory lock refuses a root reached through a symlink. */
export function prepareOperatorStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const dir = operatorStateDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
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

/** One durable line per record. A record that is not on disk does not count as written. */
export function appendOperatorAuditRecord(auditPath: string, record: OperatorAuditRecordV1): void {
  const fd = openSync(auditPath, 'a', 0o600);
  try {
    writeSync(fd, `${JSON.stringify(record)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
