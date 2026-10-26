import { createHash } from 'node:crypto';

import { canonicalize } from '../../core/evidence/canonical-json';
import type { JsonValue } from '../../core/evidence/types';
import { acquireExclusiveDirectoryLock, ExclusiveLockContentionError, type ExclusiveDirectoryLockHandle } from '../locking/exclusive-directory-lock';
import {
  OPERATOR_AUDIT_PROTOCOL,
  appendOperatorAuditRecord,
  operatorAuditPath,
  prepareOperatorStateDir,
  readOperatorAuditRequest,
  type OperatorAuditRequestState,
} from './write-audit';

/**
 * The write run shared by the HTTP channel and the CLI (I7): both pass a
 * decoded operation here, so idempotency, locking and audit order cannot
 * differ between a browser click and a terminal command.
 */

export interface OperatorWriteErrorBodyV1 {
  readonly error: { readonly code: string; readonly message: string; readonly next_action: string };
}

export interface OperatorWriteResponse {
  readonly status: number;
  readonly body: JsonValue;
}

export interface OperatorWriteOperation {
  /** Stable operation id, for example `settings_agents`. */
  readonly operation: string;
  /** Logical target and lock key, for example `config` or `docs_session:<sid>`. Never a path. */
  readonly target: string;
  /** The closed decoded request without request_id; it is bound to the request_id. */
  readonly input: JsonValue;
  /** Returns the outcome, or throws OperatorWriteRefusal when nothing was applied. */
  readonly execute: () => Promise<OperatorWriteResponse>;
}

/** A typed failure that proves the action applied nothing, so it is safe to record and replay. */
export class OperatorWriteRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly next_action: string,
  ) {
    super(message);
    this.name = 'OperatorWriteRefusal';
  }
}

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OPERATION = /^[a-z][a-z0-9_]{0,63}$/u;
// A target is a logical name plus an optional id; the shape keeps paths out of the audit log.
const TARGET = /^[a-z][a-z0-9_]{0,63}(?::[A-Za-z0-9][A-Za-z0-9._-]{0,127})?$/u;
// The directory lock waits with a blocking sleep. In-process contention is
// refused before it, so this bound only covers a short CLI critical section.
const TARGET_LOCK_WAIT_MS = 50;
const AUDIT_LOCK_WAIT_MS = 1_000;

const OPERATOR_RECONCILE_ACTION = 'Check the target state before you retry. Do not send the request again with a new request_id.';

export function operatorWriteError(code: string, message: string, nextAction: string): OperatorWriteErrorBodyV1 {
  return { error: { code, message, next_action: nextAction } };
}

/** Lower-case canonical UUID only, so one request has exactly one spelling. */
export function parseOperatorRequestId(value: unknown): string | null {
  return typeof value === 'string' && REQUEST_ID.test(value) ? value : null;
}

function operatorWriteBinding(operation: string, target: string, input: JsonValue): string {
  return createHash('sha256').update(canonicalize({ operation, target, input })).digest('hex');
}

function failure(status: number, code: string, message: string, nextAction: string): OperatorWriteResponse {
  return { status, body: operatorWriteError(code, message, nextAction) as unknown as JsonValue };
}

const busy = () => failure(503, 'busy', 'Another write to this target is running.', 'Wait for the other write to finish, then retry with the same request_id.');
const auditUnavailable = () => failure(503, 'audit_unavailable', 'The operator audit log is unavailable. Nothing was changed.', 'Check the operator audit log, then retry with the same request_id.');
const reconcileRequired = () => failure(409, 'reconcile_required', 'The action may have run, but its result is not recorded.', OPERATOR_RECONCILE_ACTION);
const requestMismatch = () => failure(409, 'request_mismatch', 'This request_id was already used for a different request.', 'Send a new request_id for a different request.');

const activeTargets = new Set<string>();

function acquire(root: string, relativePath: string, waitTimeoutMs: number): ExclusiveDirectoryLockHandle | 'busy' | 'unavailable' {
  try {
    return acquireExclusiveDirectoryLock(root, relativePath, { waitTimeoutMs });
  } catch (error) {
    return error instanceof ExclusiveLockContentionError ? 'busy' : 'unavailable';
  }
}

/** Runs one audit step under the audit lock. Any failure returns null. */
function withAuditLock<T>(root: string, step: () => T): T | null {
  const lock = acquire(root, 'locks/audit', AUDIT_LOCK_WAIT_MS);
  if (typeof lock === 'string') return null;
  try {
    lock.assertOwned();
    return step();
  } catch {
    return null;
  } finally {
    lock.release();
  }
}

/**
 * Order: target lock, request lookup, intent record, execute, result record.
 * Nothing executes unless the intent record is on disk. An executed action
 * whose result record could not be written stays `reconcile_required`; it is
 * never replayed automatically.
 */
export async function runOperatorWrite(
  requestId: string,
  operation: OperatorWriteOperation,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OperatorWriteResponse> {
  if (!REQUEST_ID.test(requestId) || !OPERATION.test(operation.operation) || !TARGET.test(operation.target)) {
    throw new Error('operator write operation is malformed');
  }
  const binding = operatorWriteBinding(operation.operation, operation.target, operation.input);
  let root: string;
  try {
    root = prepareOperatorStateDir(env);
  } catch {
    return auditUnavailable();
  }
  const auditPath = operatorAuditPath(env);
  const targetKey = `${root}\0${operation.target}`;
  if (activeTargets.has(targetKey)) return busy();
  const targetLock = acquire(root, `locks/target-${createHash('sha256').update(operation.target).digest('hex').slice(0, 32)}`, TARGET_LOCK_WAIT_MS);
  if (targetLock === 'busy') return busy();
  if (targetLock === 'unavailable') return auditUnavailable();
  activeTargets.add(targetKey);
  try {
    const admission = withAuditLock(root, (): OperatorAuditRequestState | 'admitted' => {
      const state = readOperatorAuditRequest(auditPath, requestId);
      if (state.intent !== null || state.result !== null) return state;
      appendOperatorAuditRecord(auditPath, {
        protocol: OPERATOR_AUDIT_PROTOCOL,
        phase: 'intent',
        recorded_at: new Date().toISOString(),
        request_id: requestId,
        operation: operation.operation,
        target: operation.target,
        binding_sha256: binding,
      });
      return 'admitted';
    });
    if (admission === null) return auditUnavailable();
    if (admission !== 'admitted') {
      const recordedBinding = admission.intent?.binding_sha256 ?? admission.result?.binding_sha256;
      if (recordedBinding !== binding) return requestMismatch();
      if (admission.result !== null) return { status: admission.result.status, body: admission.result.body };
      return reconcileRequired();
    }

    let outcome: OperatorWriteResponse;
    try {
      targetLock.assertOwned();
      outcome = await operation.execute();
    } catch (error) {
      if (!(error instanceof OperatorWriteRefusal)) return reconcileRequired();
      outcome = failure(error.status, error.code, error.message, error.next_action);
    }
    const recorded = withAuditLock(root, () => {
      appendOperatorAuditRecord(auditPath, {
        protocol: OPERATOR_AUDIT_PROTOCOL,
        phase: 'result',
        recorded_at: new Date().toISOString(),
        request_id: requestId,
        binding_sha256: binding,
        status: outcome.status,
        body: outcome.body,
      });
      return true;
    });
    return recorded === true ? outcome : reconcileRequired();
  } finally {
    activeTargets.delete(targetKey);
    targetLock.release();
  }
}
