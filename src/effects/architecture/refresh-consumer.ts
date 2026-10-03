import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ArchitectureRefreshSignalV1, Sha256Digest } from '../../core/architecture/projection';
import { ARCHITECTURE_PROJECTION_RUNTIME_ROOT } from './projection-jobs';

export interface ArchitectureRefreshActionResult {
  readonly actionKey: string;
  readonly action: 'architecture-queue' | 'context-contract-sync' | 'capability-context-request';
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type RunArchitectureRefreshActions = (
  repoRoot: string,
  signal: ArchitectureRefreshSignalV1,
  changedPaths: readonly string[],
  env: NodeJS.ProcessEnv,
  completedActionKeys: ReadonlySet<string>,
  deadlineMs?: number,
  nowMs?: () => number,
  onActionCompleted?: (result: ArchitectureRefreshActionResult) => void,
) => readonly ArchitectureRefreshActionResult[];

export interface ArchitectureRefreshReceiptV1 {
  schemaVersion: 'repo-harness.architecture-refresh-receipt/v1';
  signalId: Sha256Digest;
  idempotencyKey: Sha256Digest;
  completedAt: string;
  actions: Array<{ actionKey: string; action: ArchitectureRefreshActionResult['action']; outputDigest: Sha256Digest }>;
  receiptDigest: Sha256Digest;
}

const REFRESH_RECEIPTS = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/refresh-receipts`;
const REFRESH_PROGRESS = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/refresh-progress`;

export function consumeArchitectureRefreshSignals(
  repoRoot: string,
  signals: readonly ArchitectureRefreshSignalV1[],
  changedPaths: readonly string[],
  options: { env?: NodeJS.ProcessEnv; run?: RunArchitectureRefreshActions; now?: Date; deadlineMs?: number; nowMs?: () => number } = {},
): ArchitectureRefreshReceiptV1[] {
  const receipts: ArchitectureRefreshReceiptV1[] = [];
  for (const signal of [...signals].sort((a, b) => a.signalId.localeCompare(b.signalId))) {
    const path = receiptPath(repoRoot, signal.signalId);
    if (existsSync(path)) {
      receipts.push(JSON.parse(readFileSync(path, 'utf8')) as ArchitectureRefreshReceiptV1);
      continue;
    }
    const progressPath = refreshProgressPath(repoRoot, signal.signalId);
    const completed = readRefreshProgress(progressPath);
    const actions = [...completed];
    const checkpoint = (result: ArchitectureRefreshActionResult): void => {
      if (result.status !== 0 || actions.some((entry) => entry.actionKey === result.actionKey)) return;
      actions.push({
        actionKey: result.actionKey,
        action: result.action,
        outputDigest: digest(`${result.status}\0${result.stdout}\0${result.stderr}`),
      });
      atomicJson(progressPath, { schemaVersion: 'repo-harness.architecture-refresh-progress/v1', signalId: signal.signalId, actions });
    };
    const results = signal.mode === 'human-action-required'
      ? []
      : (options.run ?? runDefaultActions)(
          repoRoot,
          signal,
          changedPaths,
          options.env ?? process.env,
          new Set(completed.map((entry) => entry.actionKey)),
          options.deadlineMs,
          options.nowMs,
          checkpoint,
        );
    for (const result of results) {
      if (result.status !== 0) throw new Error(`architecture refresh ${result.action} failed with exit ${result.status}: ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
      checkpoint(result);
    }
    const body = {
      schemaVersion: 'repo-harness.architecture-refresh-receipt/v1' as const,
      signalId: signal.signalId,
      idempotencyKey: signal.idempotencyKey,
      completedAt: (options.now ?? new Date()).toISOString(),
      actions,
    };
    const receipt: ArchitectureRefreshReceiptV1 = { ...body, receiptDigest: digest(JSON.stringify(body)) };
    atomicJson(path, receipt);
    try { unlinkSync(progressPath); } catch { /* receipt is authoritative */ }
    receipts.push(receipt);
  }
  return receipts;
}

// Architecture refreshes are explicit provider facts. They do not schedule
// per-edit drift or author agent-context blocks and workstream pointers.
function runDefaultActions(): ArchitectureRefreshActionResult[] { return []; }

function receiptPath(repoRoot: string, signalId: string): string { return join(repoRoot, REFRESH_RECEIPTS, `${signalId.replace(/^sha256:/, '')}.json`); }
function refreshProgressPath(repoRoot: string, signalId: string): string { return join(repoRoot, REFRESH_PROGRESS, `${signalId.replace(/^sha256:/, '')}.json`); }

function readRefreshProgress(path: string): ArchitectureRefreshReceiptV1['actions'] {
  if (!existsSync(path)) return [];
  const value = JSON.parse(readFileSync(path, 'utf8')) as { schemaVersion?: unknown; actions?: unknown };
  if (value.schemaVersion !== 'repo-harness.architecture-refresh-progress/v1' || !Array.isArray(value.actions)) {
    throw new Error('architecture refresh progress is invalid');
  }
  return value.actions as ArchitectureRefreshReceiptV1['actions'];
}

function digest(value: string): Sha256Digest {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temp, path);
}
