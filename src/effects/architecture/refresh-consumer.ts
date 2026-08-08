import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ArchitectureRefreshSignalV1, Sha256Digest } from '../../core/architecture/projection';
import { ARCHITECTURE_PROJECTION_RUNTIME_ROOT } from './projection-jobs';

export interface ArchitectureRefreshActionResult {
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
) => readonly ArchitectureRefreshActionResult[];

export interface ArchitectureRefreshReceiptV1 {
  schemaVersion: 'repo-harness.architecture-refresh-receipt/v1';
  signalId: Sha256Digest;
  idempotencyKey: Sha256Digest;
  completedAt: string;
  actions: Array<{ action: ArchitectureRefreshActionResult['action']; outputDigest: Sha256Digest }>;
  receiptDigest: Sha256Digest;
}

const REFRESH_RECEIPTS = `${ARCHITECTURE_PROJECTION_RUNTIME_ROOT}/refresh-receipts`;

export function consumeArchitectureRefreshSignals(
  repoRoot: string,
  signals: readonly ArchitectureRefreshSignalV1[],
  changedPaths: readonly string[],
  options: { env?: NodeJS.ProcessEnv; run?: RunArchitectureRefreshActions; now?: Date } = {},
): ArchitectureRefreshReceiptV1[] {
  const receipts: ArchitectureRefreshReceiptV1[] = [];
  for (const signal of [...signals].sort((a, b) => a.signalId.localeCompare(b.signalId))) {
    const path = receiptPath(repoRoot, signal.signalId);
    if (existsSync(path)) {
      receipts.push(JSON.parse(readFileSync(path, 'utf8')) as ArchitectureRefreshReceiptV1);
      continue;
    }
    const results = signal.mode === 'human-action-required'
      ? []
      : (options.run ?? runDefaultActions)(repoRoot, signal, changedPaths, options.env ?? process.env);
    const failed = results.find((result) => result.status !== 0);
    if (failed) throw new Error(`architecture refresh ${failed.action} failed with exit ${failed.status}: ${(failed.stderr || failed.stdout).trim().slice(0, 300)}`);
    const actions = results.map((result) => ({
      action: result.action,
      outputDigest: digest(`${result.status}\0${result.stdout}\0${result.stderr}`),
    }));
    const body = {
      schemaVersion: 'repo-harness.architecture-refresh-receipt/v1' as const,
      signalId: signal.signalId,
      idempotencyKey: signal.idempotencyKey,
      completedAt: (options.now ?? new Date()).toISOString(),
      actions,
    };
    const receipt: ArchitectureRefreshReceiptV1 = { ...body, receiptDigest: digest(JSON.stringify(body)) };
    atomicJson(path, receipt);
    receipts.push(receipt);
  }
  return receipts;
}

function runDefaultActions(
  repoRoot: string,
  _signal: ArchitectureRefreshSignalV1,
  changedPaths: readonly string[],
  env: NodeJS.ProcessEnv,
): ArchitectureRefreshActionResult[] {
  const results: ArchitectureRefreshActionResult[] = [];
  for (const path of [...new Set(changedPaths)].sort()) {
    const result = runCli(repoRoot, env, ['run', 'architecture-queue', 'record', '--file', path]);
    results.push({ action: 'architecture-queue', ...result });
    if (result.status !== 0) return results;
  }
  const sync = runCli(repoRoot, env, ['run', 'context-contract-sync', 'sync-latest']);
  results.push({ action: 'context-contract-sync', ...sync });
  if (sync.status !== 0) return results;
  const capability = runCli(repoRoot, env, ['capability-context', 'request', '--from-latest-architecture-event']);
  results.push({ action: 'capability-context-request', ...capability });
  return results;
}

function runCli(repoRoot: string, env: NodeJS.ProcessEnv, args: string[]): { status: number; stdout: string; stderr: string } {
  const cli = env.REPO_HARNESS_CLI;
  const command = cli ? (env.REPO_HARNESS_BUN ?? process.execPath) : 'repo-harness';
  const commandArgs = cli ? [cli, ...args] : args;
  const result = spawnSync(command, commandArgs, { cwd: repoRoot, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? result.error?.message ?? '' };
}

function receiptPath(repoRoot: string, signalId: string): string {
  return join(repoRoot, REFRESH_RECEIPTS, `${signalId.replace(/^sha256:/, '')}.json`);
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
