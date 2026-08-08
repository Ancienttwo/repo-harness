import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
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

function runDefaultActions(
  repoRoot: string,
  _signal: ArchitectureRefreshSignalV1,
  changedPaths: readonly string[],
  env: NodeJS.ProcessEnv,
  completedActionKeys: ReadonlySet<string>,
  deadlineMs?: number,
  nowMs?: () => number,
  onActionCompleted?: (result: ArchitectureRefreshActionResult) => void,
): ArchitectureRefreshActionResult[] {
  const results: ArchitectureRefreshActionResult[] = [];
  for (const path of [...new Set(changedPaths)].sort()) {
    const actionKey = `architecture-queue:${path}`;
    if (completedActionKeys.has(actionKey)) continue;
    const result = runCli(repoRoot, env, ['run', 'architecture-queue', 'record', '--file', path], remainingRefreshTimeout(deadlineMs, nowMs));
    const completed = { actionKey, action: 'architecture-queue' as const, ...result };
    results.push(completed);
    if (result.status !== 0) return results;
    onActionCompleted?.(completed);
  }
  if (!completedActionKeys.has('context-contract-sync')) {
    const sync = runCli(repoRoot, env, ['run', 'context-contract-sync', 'sync-latest'], remainingRefreshTimeout(deadlineMs, nowMs));
    const completed = { actionKey: 'context-contract-sync', action: 'context-contract-sync' as const, ...sync };
    results.push(completed);
    if (sync.status !== 0) return results;
    onActionCompleted?.(completed);
  }
  if (!completedActionKeys.has('capability-context-request')) {
    const capability = runCli(repoRoot, env, ['capability-context', 'request', '--from-latest-architecture-event'], remainingRefreshTimeout(deadlineMs, nowMs));
    const completed = { actionKey: 'capability-context-request', action: 'capability-context-request' as const, ...capability };
    results.push(completed);
    if (capability.status === 0) onActionCompleted?.(completed);
  }
  return results;
}

function runCli(repoRoot: string, env: NodeJS.ProcessEnv, args: string[], timeoutMs: number): { status: number; stdout: string; stderr: string } {
  const cli = env.REPO_HARNESS_CLI;
  const command = cli ? (env.REPO_HARNESS_BUN ?? process.execPath) : 'repo-harness';
  const commandArgs = cli ? [cli, ...args] : args;
  const result = spawnSync(command, commandArgs, { cwd: repoRoot, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? result.error?.message ?? '' };
}

function remainingRefreshTimeout(deadlineMs?: number, nowMs: () => number = Date.now): number {
  if (deadlineMs === undefined) return 30_000;
  const remaining = Math.floor(deadlineMs - nowMs());
  if (remaining <= 0) throw new Error('architecture refresh timeout before canonical action');
  return Math.min(30_000, remaining);
}

function receiptPath(repoRoot: string, signalId: string): string {
  return join(repoRoot, REFRESH_RECEIPTS, `${signalId.replace(/^sha256:/, '')}.json`);
}

function refreshProgressPath(repoRoot: string, signalId: string): string {
  return join(repoRoot, REFRESH_PROGRESS, `${signalId.replace(/^sha256:/, '')}.json`);
}

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
