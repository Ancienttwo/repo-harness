import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import type { JsonValue } from '../../core/evidence/types';
import {
  decodeWorktreeCleanupRequest,
  decodeWorktreeCleanupResult,
  selectionDigestInput,
  worktreeDigestRow,
  type WorktreeCleanupItem,
  type WorktreeCleanupReason,
  type WorktreeCleanupRequest,
  type WorktreeCleanupResult,
  type WorktreeDigestRow,
} from '../../core/operator/worktree-cleanup';
import type { WorktreeView } from '../../core/operator/worktrees';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { managedWorktreeRoot } from '../git/managed-worktree';
import { withoutRepositorySelectingGitEnv } from '../git/runner';
import { worktreeId } from '../git/worktree-record';
import { worktreeProcesses, type WorktreeProcess } from '../git/worktree-processes';
import { ExclusiveLockContentionError } from '../locking/exclusive-directory-lock';
import { readRepoHarnessRegistryStrictSnapshot, type RepoHarnessRegisteredRepo } from '../repo-registry';
import { runSetupProcess, type SetupProcessRunner } from '../setup/collector';
import { entries, removeGreenWorktrees, WorktreeNotGreenError } from '../state/coordination-worktree-topology';
import { registeredWorktreePaths, repositoryWorktreeRow, type WorktreeTopologyEntry } from './worktree-collector-worker';
import type { OperatorWriteRoute } from './write-channel';
import { OperatorWriteRefusal, type OperatorWriteOperation } from './write-run';

/**
 * Green worktree cleanup (G24, slice 5.1). `runWorktreeCleanup` is the one
 * effect: the CLI runs it in its own process, and the HTTP route runs it in a
 * supervised child so that sync Git never blocks the serve event loop. Both go
 * through `runOperatorWrite` for the target lock, idempotency and audit.
 * Non-green worktrees are refused; authorized removal comes with the cleanup
 * session (5.2).
 */

export const OPERATOR_WORKTREES_CLEANUP_ROUTE = /^\/api\/v1\/worktrees\/cleanup$/u;
export const WORKTREE_CLEANUP_CHILD_TIMEOUT_MS = 20_000;
/** The child stops starting new work this long before the parent kills its process group. */
const CHILD_DEADLINE_MARGIN_MS = 5_000;
export const WORKTREE_CLEANUP_CLI_DEADLINE_MS = 60_000;

type RefusalCode = 'digest_changed' | 'in_use' | 'not_approved' | 'inventory_unavailable';
const REFUSALS: Readonly<Record<RefusalCode, { readonly status: number; readonly message: string; readonly next_action: string }>> = Object.freeze({
  digest_changed: { status: 409, message: 'A selected worktree changed or is no longer listed. Nothing was removed.', next_action: 'Reload the worktree list, select again, then send a new request_id.' },
  in_use: { status: 422, message: 'A selected worktree is in use. Nothing was removed.', next_action: 'Stop the process or session that uses it, reload the list, then send a new request_id.' },
  not_approved: { status: 422, message: 'A selected worktree is not green. Nothing was removed.', next_action: 'Select only green worktrees. A non-green worktree needs a cleanup session.' },
  inventory_unavailable: { status: 503, message: 'The worktree inventory cannot be read. Nothing was removed.', next_action: 'Check the registered repositories, then send a new request_id.' },
});
const refusal = (code: RefusalCode) => new OperatorWriteRefusal(REFUSALS[code].status, code, REFUSALS[code].message, REFUSALS[code].next_action);

export function selectionDigest(rows: readonly WorktreeDigestRow[]): string {
  return createHash('sha256').update(selectionDigestInput(rows)).digest('hex');
}

export type WorktreeProcessProbe = (deadline: number) => WorktreeProcess[] | null;

export interface WorktreeCleanupOptions {
  readonly env: NodeJS.ProcessEnv;
  /** This directory and everything below it are never removed. */
  readonly caller_cwd: string;
  readonly deadline_ms: number;
  readonly processes?: WorktreeProcessProbe;
}

interface Located {
  readonly repo: RepoHarnessRegisteredRepo;
  readonly common: string;
  readonly path: string;
  readonly entry: WorktreeTopologyEntry | undefined;
}

/** A row changed between the request check and the topology barrier. */
class WorktreeCleanupChanged extends Error {
  constructor(readonly reason: WorktreeCleanupReason) { super('worktree changed before removal'); }
}

const sameRow = (left: WorktreeView, right: WorktreeView) => selectionDigestInput([worktreeDigestRow(left)]) === selectionDigestInput([worktreeDigestRow(right)]);

function skippedReason(error: unknown, deadline: number): WorktreeCleanupReason {
  if (error instanceof WorktreeCleanupChanged) return error.reason;
  if (error instanceof WorktreeNotGreenError) return error.reasons[0] ?? 'changed';
  if (error instanceof ExclusiveLockContentionError) return 'busy';
  return Date.now() >= deadline ? 'deadline' : 'changed';
}

/**
 * Check the whole selection first; any refusal removes nothing. Then remove
 * each item through the sweep's green path, which checks the row again inside
 * the topology barrier.
 */
export function runWorktreeCleanup(request: WorktreeCleanupRequest, options: WorktreeCleanupOptions): WorktreeCleanupResult {
  const { env } = options;
  const deadline = Date.now() + options.deadline_ms;
  const probe = options.processes ?? worktreeProcesses;
  // Like the collector, the observer does not occupy what it inventories; `caller_cwd` protects its own directory.
  const scan = (): WorktreeProcess[] | null => probe(Math.min(deadline, Date.now() + 5_000))?.filter(row => row.pid !== process.pid) ?? null;
  let repos: readonly RepoHarnessRegisteredRepo[], managedRoot: string;
  try {
    repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos;
    managedRoot = managedWorktreeRoot(env);
  } catch { throw refusal('inventory_unavailable'); }

  const wanted = new Set(request.ids);
  const found = new Map<string, Located>();
  let unreadable = false;
  for (const repo of repos) {
    try {
      const common = resolveGitCommonDirectory(repo.path);
      for (const { path, entry } of registeredWorktreePaths(entries(repo.path, { deadline }))) {
        const id = worktreeId(common, path);
        if (wanted.has(id)) found.set(id, { repo, common, path, entry });
      }
    } catch { unreadable = true; }
  }
  // An id that a readable inventory does not list is gone; with an unreadable repository it is unknown.
  if (found.size !== wanted.size) throw refusal(unreadable ? 'inventory_unavailable' : 'digest_changed');

  const rowOf = (id: string, located: Located, processes: WorktreeProcess[] | null) => repositoryWorktreeRow({
    repo: located.repo, common: located.common, managed_root: managedRoot, id, path: located.path, entry: located.entry,
    size_bytes: null, size_observed_at: null, caller_cwd: options.caller_cwd, env, deadline, processes,
  });
  const processes = scan();
  const rows = new Map(request.ids.map(id => [id, rowOf(id, found.get(id)!, processes)]));
  if ([...rows.values()].some(row => row.judgment === 'red')) throw refusal('in_use');
  if ([...rows.values()].some(row => row.judgment !== 'green')) throw refusal('not_approved');
  if (selectionDigest([...rows.values()].map(worktreeDigestRow)) !== request.expected_digest) throw refusal('digest_changed');

  const items = new Map<string, WorktreeCleanupItem>();
  const item = (id: string, outcome: WorktreeCleanupItem['outcome'], reason: WorktreeCleanupReason | null) => {
    const row = rows.get(id)!;
    items.set(id, { id, repository_id: row.repository_id!, directory: row.directory, outcome, reason });
  };
  for (const repo of repos) {
    const ids = request.ids.filter(id => found.get(id)!.repo.id === repo.id);
    if (!ids.length) continue;
    const verify = (id: string) => () => {
      const located = found.get(id)!;
      const current = registeredWorktreePaths(entries(repo.path, { deadline })).find(row => row.path === located.path);
      if (!current || worktreeId(located.common, located.path) !== id) throw new WorktreeCleanupChanged('changed');
      const fresh = rowOf(id, { ...located, entry: current.entry }, scan());
      if (fresh.judgment !== 'green') throw new WorktreeCleanupChanged(fresh.reasons[0] ?? 'changed');
      if (!sameRow(fresh, rows.get(id)!)) throw new WorktreeCleanupChanged('changed');
    };
    let removal;
    try {
      removal = removeGreenWorktrees(repo.path, options.caller_cwd, env, ids.map(id => ({ path: found.get(id)!.path, verify: verify(id) })), { deadline, processes: scan });
    } catch (error) {
      for (const id of ids) item(id, 'skipped', skippedReason(error, deadline));
      continue;
    }
    if (removal.recovery_blocked) { for (const id of ids) item(id, 'skipped', 'recovery_pending'); continue; }
    ids.forEach((id, index) => {
      const result = removal.results[index]!;
      if (result.removed) item(id, 'removed', null);
      else if (result.started) item(id, 'failed', 'removal_unproven');
      else item(id, 'skipped', skippedReason(result.error, deadline));
    });
  }
  return decodeWorktreeCleanupResult({ protocol: 1, kind: 'operator_worktree_cleanup', items: request.ids.map(id => items.get(id)!) });
}

/** The write operation that both the CLI and the HTTP route pass to `runOperatorWrite`. */
export function worktreeCleanupOperation(request: WorktreeCleanupRequest, run: () => Promise<WorktreeCleanupResult>): OperatorWriteOperation {
  return {
    operation: 'worktrees_cleanup',
    target: 'worktrees',
    input: request as unknown as JsonValue,
    execute: async () => ({ status: 200, body: decodeWorktreeCleanupResult(await run()) as unknown as JsonValue }),
  };
}

const CHILD_ENTRY = fileURLToPath(import.meta.url);

/**
 * The child prints a refusal code or a result. A timeout, crash or any other
 * output is not a refusal: the run records `reconcile_required`, and the sweep
 * trash receipts let a later sweep finish an interrupted removal.
 */
export function decodeWorktreeCleanupChildOutput(stdout: string): WorktreeCleanupResult {
  const value: unknown = JSON.parse(stdout);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('worktree cleanup child output is invalid');
  const output = value as Record<string, unknown>;
  const keys = Object.keys(output).sort().join(',');
  if (keys === 'ok,result' && output.ok === true) return decodeWorktreeCleanupResult(output.result);
  if (keys === 'ok,refusal' && output.ok === false && typeof output.refusal === 'string' && Object.hasOwn(REFUSALS, output.refusal)) throw refusal(output.refusal as RefusalCode);
  throw new Error('worktree cleanup child output is invalid');
}

export async function runWorktreeCleanupChild(request: WorktreeCleanupRequest, options: { readonly env?: NodeJS.ProcessEnv; readonly run_process?: SetupProcessRunner; readonly timeout_ms?: number } = {}): Promise<WorktreeCleanupResult> {
  const timeoutMs = options.timeout_ms ?? WORKTREE_CLEANUP_CHILD_TIMEOUT_MS;
  const env = withoutRepositorySelectingGitEnv({ ...process.env, ...options.env, GIT_TERMINAL_PROMPT: '0' });
  // Not aborted on server close: a started removal finishes or meets the process-group deadline.
  const result = await (options.run_process ?? runSetupProcess)([CHILD_ENTRY, JSON.stringify(request), String(Math.max(1_000, timeoutMs - CHILD_DEADLINE_MARGIN_MS))],
    { cwd: process.cwd(), env, timeout_ms: timeoutMs, signal: new AbortController().signal, service: 'worktree-cleanup' });
  if (!result.ok) throw new Error(`worktree cleanup child ${result.code}`);
  return decodeWorktreeCleanupChildOutput(result.stdout);
}

/** `POST /api/v1/worktrees/cleanup`: decode, then the shared run with the effect in a child. */
export function worktreeCleanupWriteRoute(env?: NodeJS.ProcessEnv): OperatorWriteRoute {
  return {
    id: 'worktrees_cleanup',
    path: OPERATOR_WORKTREES_CLEANUP_ROUTE,
    decode(fields) {
      const request = decodeWorktreeCleanupRequest(fields);
      return worktreeCleanupOperation(request, () => runWorktreeCleanupChild(request, { env }));
    },
  };
}

if (import.meta.main) {
  const request = decodeWorktreeCleanupRequest(JSON.parse(process.argv[2] ?? ''));
  const deadlineMs = Number(process.argv[3]);
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) throw new Error('worktree cleanup deadline is invalid');
  let output: unknown;
  try {
    output = { ok: true, result: runWorktreeCleanup(request, { env: process.env, caller_cwd: process.cwd(), deadline_ms: deadlineMs }) };
  } catch (error) {
    if (!(error instanceof OperatorWriteRefusal)) throw error;
    output = { ok: false, refusal: error.code };
  }
  process.stdout.write(JSON.stringify(output) + '\n', () => process.exit(0));
}
