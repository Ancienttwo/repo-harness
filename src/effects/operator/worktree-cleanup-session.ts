import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { WorktreeView } from '../../core/operator/worktrees';
import type { JsonValue } from '../../core/evidence/types';
import { decodeCleanupSessionCreate, type CleanupSessionCreate, type CleanupSessionRecord } from '../../core/operator/worktree-cleanup-session';
import { WORKTREE_CLEANUP_MAX_IDS } from '../../core/operator/worktree-cleanup';
import { assertDocsHostPlatform } from '../review/docs-host-isolation';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { managedWorktreeRoot } from '../git/managed-worktree';
import { worktreeId } from '../git/worktree-record';
import { worktreeProcesses } from '../git/worktree-processes';
import { entries } from '../state/coordination-worktree-topology';
import { runSetupProcess } from '../setup/collector';
import { registeredWorktreePaths, repositoryWorktreeRow } from './worktree-collector-worker';
import { collectOrphanWorktrees } from './worktree-orphans-worker';
import { observeCleanupLoss, type CleanupObservationTarget } from './worktree-cleanup-observation';
import { assertDocsRuntime, writeSessionRecord } from './doc-session';
import { saveCleanupObservation, validateCleanupObservation, type CleanupSessionObservation } from './worktree-cleanup-session-store';
import { sessionDirectory } from './doc-session-events';
import type { DocSessionAgentState } from './doc-session-agent';
import { OperatorWriteRefusal, type OperatorWriteOperation } from './write-run';

const refuse = (code: string, status = 503) => new OperatorWriteRefusal(status, code, 'The cleanup investigation cannot start.', 'Restore the inventory or select fewer worktree ids, then retry with a new request_id.');
/** Runs in the bounded Bun child. No repository is written and no runtime starts here. */
export function prepareCleanupSession(input: CleanupSessionCreate, env: NodeJS.ProcessEnv, platform = process.platform): string {
  try { assertDocsHostPlatform(platform); } catch { throw refuse('platform_unsupported', 501); }
  assertDocsRuntime(input.runtime, env);
  const repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos;
  if (!repos.length) throw refuse('registry_unavailable');
  const deadline = Date.now() + 50_000;
  const root = managedWorktreeRoot(env);
  const processes = worktreeProcesses(Math.min(deadline, Date.now() + 5000))?.filter(p => p.pid !== process.pid) ?? null;
  const selected = input.ids === undefined ? null : new Set(input.ids);
  const items: CleanupSessionObservation['items'][number][] = [];
  const add = (target: CleanupObservationTarget | null, row: WorktreeView) => {
    if (selected !== null && !selected.has(row.id)) return;
    if (items.some(item => item.observation.worktree.id === row.id)) throw refuse('inventory_ambiguous');
    if (items.length >= WORKTREE_CLEANUP_MAX_IDS) throw refuse('inventory_too_large', 422);
    let loss = null;
    if (target !== null && row.judgment !== 'red') {
      try { loss = observeCleanupLoss(target, { env, deadline }); } catch { /* An unreadable item stays visible but cannot be selected. */ }
    }
    items.push({ target, observation: { worktree: row, loss } });
  };
  for (const repo of repos) {
    const common = resolveGitCommonDirectory(repo.path);
    for (const { path, entry } of registeredWorktreePaths(entries(repo.path, { deadline }))) {
      const id = worktreeId(common, path);
      if (selected !== null && !selected.has(id)) continue;
      add({ repository: realpathSync(repo.path), worktree: path, id, kind: 'registered' }, repositoryWorktreeRow({
        repo, common, managed_root: root, id, path, entry, size_bytes: null, size_observed_at: null, caller_cwd: null, env, deadline, processes,
      }));
    }
  }
  collectOrphanWorktrees(repos, {}, env, undefined, ({ repo, path, row }) => add(repo ? { repository: realpathSync(repo.path), worktree: path, id: row.id, kind: 'orphan' } : null, row));
  if (!items.length || selected !== null && items.length !== selected.size) throw refuse('worktree_not_found', 404);
  const sid = randomBytes(16).toString('hex');
  const record: CleanupSessionRecord = { protocol: 1, kind: 'worktree_cleanup', session_id: sid, state: 'created', created_at: new Date().toISOString(),
    repository_id: repos[0]!.id, runtime: input.runtime, worktree: realpathSync(repos[0]!.path),
    instruction: 'Inspect the selected worktrees without changing any repository. Return a complete advice plan for human review.',
  };
  let observed: CleanupSessionObservation;
  try { observed = validateCleanupObservation({ protocol: 1, session_id: sid, observed_at: record.created_at, items }, sid); }
  catch { throw refuse('inventory_unavailable'); }
  writeSessionRecord(env, sid, record as unknown as JsonValue);
  saveCleanupObservation(sessionDirectory(env, sid), observed);
  return sid;
}
const CHILD = fileURLToPath(new URL('./worktree-cleanup-session-worker.ts', import.meta.url));
export function cleanupSessionCreateOperation(fields: Readonly<Record<string, unknown>>, deps: { env: NodeJS.ProcessEnv; launch_agent: (sid: string) => DocSessionAgentState }): OperatorWriteOperation {
  const input = decodeCleanupSessionCreate(fields);
  return { operation: 'worktree_cleanup_session_create', target: 'worktree_cleanup_sessions', input: input as unknown as JsonValue,
    execute: async () => {
      const child = await runSetupProcess([CHILD], { env: deps.env, cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        timeout_ms: 60_000, signal: new AbortController().signal, service: 'cleanup-investigation', stdin: JSON.stringify(input) });
      if (!child.ok) throw new Error('cleanup_creation_outcome_unknown');
      const value = JSON.parse(child.stdout);
      if (value && Object.keys(value).sort().join(',') === 'code,status' && [404, 422, 501, 503].includes(value.status) && typeof value.code === 'string'
        && /^[a-z][a-z0-9_]{0,63}$/u.test(value.code)) throw refuse(value.code, value.status);
      if (!value || Object.keys(value).join(',') !== 'session_id' || typeof value.session_id !== 'string' || !/^[0-9a-f]{32}$/u.test(value.session_id)) throw new Error('cleanup_creation_response_invalid');
      deps.launch_agent(value.session_id);
      return { status: 201, body: { protocol: 1, kind: 'operator_worktree_cleanup_session_created', session_id: value.session_id } };
    },
  };
}
