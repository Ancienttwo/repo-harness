import { createInterface } from 'node:readline';

import type { FleetBoardSnapshotV1 } from '../../core/fleet/board';
import {
  collectFleetBoard,
  FleetBoardError,
  type FleetBoardFatalErrorCode,
} from '../fleet/board';

export interface FleetCollectorStartRequest {
  readonly type: 'start';
  readonly env?: Readonly<Record<string, string>>;
  readonly sequence: number;
  readonly max_concurrency: number;
  readonly timeout_ms: number;
}

export interface FleetCollectorCancelRequest {
  readonly type: 'cancel';
}

export type FleetCollectorRequest = FleetCollectorStartRequest | FleetCollectorCancelRequest;

export type FleetCollectorResponse =
  | { readonly ok: true; readonly snapshot: FleetBoardSnapshotV1 }
  | { readonly ok: false; readonly code: FleetBoardFatalErrorCode }
  | { readonly ok: false; readonly cancelled: true };

function unavailable(): FleetCollectorResponse {
  return { ok: false, code: 'fleet_registry_unavailable' };
}

export function parseFleetCollectorRequest(value: unknown): FleetCollectorRequest | null {
  if (typeof value !== 'object' || value === null || !('type' in value)) return null;
  const record = value as Record<string, unknown>;
  if (record.type === 'cancel') return { type: 'cancel' };
  if (
    record.type !== 'start'
    || !Number.isSafeInteger(record.sequence)
    || !Number.isSafeInteger(record.max_concurrency)
    || !Number.isSafeInteger(record.timeout_ms)
  ) return null;
  if (record.env !== undefined && (typeof record.env !== 'object' || record.env === null || Array.isArray(record.env))) return null;
  const envRecord = record.env as Record<string, unknown> | undefined;
  const env = envRecord === undefined
    ? undefined
    : Object.fromEntries(Object.entries(envRecord).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  if (envRecord !== undefined && Object.keys(env ?? {}).length !== Object.keys(envRecord).length) return null;
  return {
    type: 'start',
    env,
    sequence: record.sequence as number,
    max_concurrency: record.max_concurrency as number,
    timeout_ms: record.timeout_ms as number,
  };
}

function run(): void {
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let controller: AbortController | null = null;
  let started = false;
  let settled = false;
  const finish = (response: FleetCollectorResponse): void => {
    if (settled) return;
    settled = true;
    process.removeListener('SIGTERM', cancel);
    process.removeListener('SIGINT', cancel);
    reader.close();
    process.stdout.write(`${JSON.stringify(response)}\n`, () => process.exit(0));
  };
  const cancel = (): void => {
    controller?.abort();
    if (!started) finish({ ok: false, cancelled: true });
  };
  process.once('SIGTERM', cancel);
  process.once('SIGINT', cancel);
  reader.once('close', () => {
    if (!settled) finish({ ok: false, cancelled: true });
  });
  reader.on('line', (line) => {
    if (settled) return;
    let request: FleetCollectorRequest | null = null;
    try { request = parseFleetCollectorRequest(JSON.parse(line)); } catch { /* malformed request is unavailable */ }
    if (request === null) {
      finish(unavailable());
      return;
    }
    if (request.type === 'cancel') {
      cancel();
      return;
    }
    if (started) {
      finish(unavailable());
      return;
    }
    started = true;
    controller = new AbortController();
    void collectFleetBoard({
      env: request.env,
      sequence: request.sequence,
      max_concurrency: request.max_concurrency,
      timeout_ms: request.timeout_ms,
      signal: controller.signal,
    }).then(
      (snapshot) => finish(controller?.signal.aborted
        ? ({ ok: false, cancelled: true } satisfies FleetCollectorResponse)
        : ({ ok: true, snapshot } satisfies FleetCollectorResponse)),
      (error) => finish(controller?.signal.aborted
        ? ({ ok: false, cancelled: true } satisfies FleetCollectorResponse)
        : error instanceof FleetBoardError
          ? ({ ok: false, code: error.code } satisfies FleetCollectorResponse)
          : unavailable()),
    );
  });
}

if (import.meta.main) run();
