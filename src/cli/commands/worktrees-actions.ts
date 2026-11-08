import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { decodeWorktreeCleanupRequest, decodeWorktreeCleanupResult, worktreeDigestRow, WORKTREE_CLEANUP_MAX_IDS, type WorktreeCleanupRequest } from '../../core/operator/worktree-cleanup';
import type { WorktreeView, WorktreesSnapshot } from '../../core/public-projections/worktrees';
import { resolveGitCommonDirectory } from '../../effects/git/common-directory';
import { worktreeId } from '../../effects/git/worktree-record';
import { executionChildEnvironment } from '../../effects/operator/execution-collector';
import { runWorktreeCleanup, selectionDigest, worktreeCleanupOperation, WORKTREE_CLEANUP_CLI_DEADLINE_MS } from '../../effects/operator/worktree-cleanup';
import { collectWorktreesOnce, emptyWorktreeSizeCache } from '../../effects/operator/worktree-collector';
import { parseOperatorRequestId, runOperatorWrite, type OperatorWriteErrorBodyV1 } from '../../effects/operator/write-run';
import { registeredWorktreePaths } from '../../effects/operator/worktree-collector-worker';
import { readRepoHarnessRegistryStrictSnapshot, type RepoHarnessRegisteredRepo } from '../../effects/repo-registry';
import { runSetupProcess } from '../../effects/setup/collector';
import { entries } from '../../effects/state/coordination-worktree-topology';

/**
 * `repo-harness worktrees list|clean|path`: the CLI side of the Worktree page.
 * `clean` runs the same effect and write run as `POST /api/v1/worktrees/cleanup`.
 * `path` serves the desktop shell, which opens a row in a local app; no HTTP
 * response carries a worktree path (operator invariant 7).
 */

export interface WorktreeListOutput {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_list';
  readonly snapshot: WorktreesSnapshot;
  /** The selection digest of each row alone, for a one-row clean command. */
  readonly digests: Readonly<Record<string, string>>;
  /** Green rows in id order, in selections that one clean request accepts; empty when nothing is green. */
  readonly green: readonly GreenCleanupBatch[];
}

export interface GreenCleanupBatch { readonly ids: readonly string[]; readonly digest: string }

const rowsOf = (snapshot: WorktreesSnapshot): WorktreeView[] => [...snapshot.repositories.flatMap(group => group.worktrees), ...snapshot.unassigned];
const byId = (left: WorktreeView, right: WorktreeView) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

/** Green rows in id order, split into selections that one clean request accepts, each with its own digest. */
export function greenCleanupBatches(snapshot: WorktreesSnapshot): GreenCleanupBatch[] {
  const green = rowsOf(snapshot).filter(row => row.judgment === 'green').sort(byId);
  const batches: GreenCleanupBatch[] = [];
  for (let start = 0; start < green.length; start += WORKTREE_CLEANUP_MAX_IDS) {
    const batch = green.slice(start, start + WORKTREE_CLEANUP_MAX_IDS);
    batches.push({ ids: batch.map(row => row.id), digest: selectionDigest(batch.map(worktreeDigestRow)) });
  }
  return batches;
}

/** The JSON of `worktrees list --json`; its green batches are the ones the human output prints. */
export function worktreeListOutput(snapshot: WorktreesSnapshot): WorktreeListOutput {
  return {
    protocol: 1,
    kind: 'operator_worktree_list',
    snapshot,
    digests: Object.fromEntries(rowsOf(snapshot).map(row => [row.id, selectionDigest([worktreeDigestRow(row)])])),
    green: greenCleanupBatches(snapshot),
  };
}

export const cleanCommand = (ids: readonly string[], digest: string) => `repo-harness worktrees clean --ids ${ids.join(',')} --expected-digest ${digest}`;

function printList(output: WorktreeListOutput): void {
  const names = new Map(output.snapshot.repositories.map(group => [group.repository_id, group.display_name]));
  for (const row of rowsOf(output.snapshot)) {
    const size = row.size_bytes === null ? 'unknown' : `${Math.round(row.size_bytes / 1024 / 1024)} MiB`;
    console.log([row.judgment, row.repository_id === null ? 'unassigned' : names.get(row.repository_id) ?? row.repository_id, row.directory,
      row.branch ?? '-', row.reasons.join(',') || '-', size, row.id].join('\t'));
  }
  if (output.snapshot.status !== 'ready') console.log(`[repo-harness worktrees] inventory ${output.snapshot.status}`);
  if (!output.green.length) console.log('[repo-harness worktrees] no green worktrees');
  else console.log(`[repo-harness worktrees] ${output.green.reduce((total, batch) => total + batch.ids.length, 0)} green:`);
  for (const batch of output.green) console.log(cleanCommand(batch.ids, batch.digest));
}

export interface WorktreeCleanOptions { readonly ids: string; readonly expectedDigest: string; readonly requestId?: string; readonly json?: boolean }

function fail(json: boolean | undefined, code: string, message: string): void {
  console.error(json ? JSON.stringify({ error: { code, message } }) : `repo-harness worktrees: ${code}: ${message}`);
  process.exitCode = 2;
}

export async function list(options: { readonly json?: boolean }): Promise<void> {
  const env = executionChildEnvironment({ ...process.env });
  let collected;
  try {
    collected = await collectWorktreesOnce({ env, run_process: runSetupProcess, signal: new AbortController().signal, sizes: emptyWorktreeSizeCache() });
  } catch { collected = null; }
  if (!collected) { fail(options.json, 'inventory_unavailable', 'The registered repositories cannot be read.'); return; }
  const output = worktreeListOutput(collected.snapshot);
  if (options.json) console.log(JSON.stringify(output, null, 2));
  else printList(output);
}

export async function clean(options: WorktreeCleanOptions): Promise<void> {
  let request: WorktreeCleanupRequest;
  try { request = decodeWorktreeCleanupRequest({ ids: options.ids.split(','), expected_digest: options.expectedDigest }); }
  catch { fail(options.json, 'invalid_argument', `--ids needs 1 to 16 unique worktree ids and --expected-digest a lower-case SHA-256.`); return; }
  const requestId = options.requestId === undefined ? randomUUID() : parseOperatorRequestId(options.requestId);
  if (requestId === null) { fail(options.json, 'invalid_argument', '--request-id must be a lower-case UUID.'); return; }
  const operation = worktreeCleanupOperation(request, async () => runWorktreeCleanup(request,
    { env: process.env, caller_cwd: process.cwd(), deadline_ms: WORKTREE_CLEANUP_CLI_DEADLINE_MS }));
  const response = await runOperatorWrite(requestId, operation, process.env);
  if (response.status !== 200) {
    const { error } = response.body as unknown as OperatorWriteErrorBodyV1;
    if (options.json) console.error(JSON.stringify({ request_id: requestId, status: response.status, ...response.body as object }));
    else console.error(`repo-harness worktrees: ${error.code}: ${error.message} ${error.next_action} (request_id ${requestId})`);
    process.exitCode = 2;
    return;
  }
  const result = decodeWorktreeCleanupResult(response.body);
  if (options.json) console.log(JSON.stringify({ request_id: requestId, ...result }, null, 2));
  else for (const item of result.items) console.log([item.outcome, item.directory, item.reason ?? '-', item.id].join('\t'));
  if (result.items.some(item => item.outcome !== 'removed')) process.exitCode = 1;
}

/** Both options are checked here, not by Commander, so a missing one also gets the JSON refusal. */
export interface WorktreePathOptions { readonly repository?: string; readonly worktree?: string }
export interface WorktreePathOutput {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_path';
  readonly repository_id: string;
  readonly worktree_id: string;
  readonly path: string;
}

const PATH_DEADLINE_MS = 25_000;

/** Resolves one registered worktree id inside one registered repository, with the identity rule of the cleanup `locate`. */
export function path(options: WorktreePathOptions): void {
  const { repository, worktree } = options;
  if (repository === undefined || worktree === undefined || !/^repo_[0-9a-f]{16}$/u.test(repository) || !/^wt_[a-f0-9]{64}$/u.test(worktree)) {
    fail(true, 'invalid_argument', '--repository needs a repo_ id and --worktree a wt_ id from `worktrees list --json`.');
    return;
  }
  const env = executionChildEnvironment({ ...process.env });
  let repo: RepoHarnessRegisteredRepo | undefined;
  try { repo = readRepoHarnessRegistryStrictSnapshot({ env }).repos.find(row => row.id === repository); }
  catch { fail(true, 'inventory_unavailable', 'The registered repositories cannot be read.'); return; }
  if (!repo) { fail(true, 'repository_not_found', 'The repository is not registered.'); return; }
  let found: string | undefined;
  try {
    const deadline = Date.now() + PATH_DEADLINE_MS;
    const common = resolveGitCommonDirectory(repo.path, undefined, PATH_DEADLINE_MS, env);
    found = registeredWorktreePaths(entries(repo.path, { deadline })).find(item => worktreeId(common, item.path) === worktree)?.path;
  } catch { fail(true, 'inventory_unavailable', 'The worktrees of the repository cannot be read.'); return; }
  // Git keeps listing a removed directory, and the collector marks it `missing` by the same check; it has no real path to open.
  if (found === undefined || !existsSync(found)) { fail(true, 'worktree_not_found', 'The repository has no registered worktree directory with this id.'); return; }
  const output: WorktreePathOutput = { protocol: 1, kind: 'operator_worktree_path', repository_id: repo.id, worktree_id: worktree, path: found };
  console.log(JSON.stringify(output));
}
