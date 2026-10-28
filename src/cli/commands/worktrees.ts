import { randomUUID } from 'node:crypto';
import { Command } from 'commander';

import { decodeWorktreeCleanupRequest, decodeWorktreeCleanupResult, worktreeDigestRow, type WorktreeCleanupRequest } from '../../core/operator/worktree-cleanup';
import type { WorktreeView, WorktreesSnapshot } from '../../core/operator/worktrees';
import { executionChildEnvironment } from '../../effects/operator/execution-collector';
import { runWorktreeCleanup, selectionDigest, worktreeCleanupOperation, WORKTREE_CLEANUP_CLI_DEADLINE_MS } from '../../effects/operator/worktree-cleanup';
import { collectWorktreesOnce, emptyWorktreeSizeCache } from '../../effects/operator/worktree-collector';
import { parseOperatorRequestId, runOperatorWrite, type OperatorWriteErrorBodyV1 } from '../../effects/operator/write-run';
import { runSetupProcess } from '../../effects/setup/collector';

/**
 * `repo-harness worktrees list|clean`: the CLI side of the Worktree page.
 * `clean` runs the same effect and write run as `POST /api/v1/worktrees/cleanup`.
 */

export interface WorktreeListOutput {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_list';
  readonly snapshot: WorktreesSnapshot;
  /** The selection digest of each row alone, for a one-row clean command. */
  readonly digests: Readonly<Record<string, string>>;
  readonly green: { readonly ids: readonly string[]; readonly digest: string | null };
}

const rowsOf = (snapshot: WorktreesSnapshot): WorktreeView[] => [...snapshot.repositories.flatMap(group => group.worktrees), ...snapshot.unassigned];

export function worktreeListOutput(snapshot: WorktreesSnapshot): WorktreeListOutput {
  const rows = rowsOf(snapshot);
  const green = rows.filter(row => row.judgment === 'green').sort((left, right) => left.id < right.id ? -1 : 1);
  return {
    protocol: 1,
    kind: 'operator_worktree_list',
    snapshot,
    digests: Object.fromEntries(rows.map(row => [row.id, selectionDigest([worktreeDigestRow(row)])])),
    green: { ids: green.map(row => row.id), digest: green.length ? selectionDigest(green.map(worktreeDigestRow)) : null },
  };
}

const cleanCommand = (ids: readonly string[], digest: string) => `repo-harness worktrees clean --ids ${ids.join(',')} --expected-digest ${digest}`;

function printList(output: WorktreeListOutput): void {
  const names = new Map(output.snapshot.repositories.map(group => [group.repository_id, group.display_name]));
  for (const row of rowsOf(output.snapshot)) {
    const size = row.size_bytes === null ? 'unknown' : `${Math.round(row.size_bytes / 1024 / 1024)} MiB`;
    console.log([row.judgment, row.repository_id === null ? 'unassigned' : names.get(row.repository_id) ?? row.repository_id, row.directory,
      row.branch ?? '-', row.reasons.join(',') || '-', size, row.id].join('\t'));
  }
  if (output.snapshot.status !== 'ready') console.log(`[repo-harness worktrees] inventory ${output.snapshot.status}`);
  if (output.green.digest === null) console.log('[repo-harness worktrees] no green worktrees');
  else console.log(`[repo-harness worktrees] ${output.green.ids.length} green: ${cleanCommand(output.green.ids, output.green.digest)}`);
}

interface CleanOptions { readonly ids: string; readonly expectedDigest: string; readonly requestId?: string; readonly json?: boolean }

function fail(json: boolean | undefined, code: string, message: string): void {
  console.error(json ? JSON.stringify({ error: { code, message } }) : `repo-harness worktrees: ${code}: ${message}`);
  process.exitCode = 2;
}

export function buildWorktreesCommand(): Command {
  const worktrees = new Command('worktrees').description('List worktrees of registered repositories and remove green ones');
  worktrees
    .command('list')
    .description('Collect every worktree with its judgment, reasons and the selection digest')
    .option('--json', 'Output JSON')
    .action(async (options: { readonly json?: boolean }) => {
      const env = executionChildEnvironment({ ...process.env });
      let collected;
      try {
        collected = await collectWorktreesOnce({ env, run_process: runSetupProcess, signal: new AbortController().signal, sizes: emptyWorktreeSizeCache() });
      } catch { collected = null; }
      if (!collected) { fail(options.json, 'inventory_unavailable', 'The registered repositories cannot be read.'); return; }
      const output = worktreeListOutput(collected.snapshot);
      if (options.json) console.log(JSON.stringify(output, null, 2));
      else printList(output);
    });
  worktrees
    .command('clean')
    .description('Remove green worktrees by stable id; a non-green or changed selection removes nothing')
    .requiredOption('--ids <ids>', 'Comma-separated worktree ids from `worktrees list`')
    .requiredOption('--expected-digest <digest>', 'Selection digest from `worktrees list`')
    .option('--request-id <uuid>', 'Lower-case UUID; reuse it to replay the recorded result')
    .option('--json', 'Output JSON')
    .action(async (options: CleanOptions) => {
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
    });
  return worktrees;
}
