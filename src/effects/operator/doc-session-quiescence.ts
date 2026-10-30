import { randomUUID } from 'node:crypto';
import { DOC_SESSION_FINALIZE_BLOCKER } from '../../core/operator/doc-session-finalization-view';
import { occupiesWorktree, worktreeProcesses, type WorktreeProcess } from '../git/worktree-processes';
import { ExclusiveLockContentionError, acquireExclusiveDirectoryLock, type ExclusiveDirectoryLockHandle } from '../locking/exclusive-directory-lock';
import { DOC_SESSION_AGENT_LOCK, readDocSessionAgent } from './doc-session-agent';
import { DocSessionReadError, resolveDocSession } from './doc-session-changes';
import { docSessionEventsTail, sessionDirectory, DocSessionEventsError } from './doc-session-events';
import { OperatorWriteRefusal, runOperatorWrite } from './write-run';

/** Fixture seams. Production leaves every field but `kind` unset: the real
 * platform, the host's agent.lock and the fail-closed OS worktree-cwd
 * inventory decide. */
export interface DocSessionQuiescenceDependencies {
  readonly kind: 'commit' | 'discard';
  readonly platform?: NodeJS.Platform;
  readonly processes?: (deadline: number) => readonly WorktreeProcess[] | null;
}

const blocker = () => new OperatorWriteRefusal(503, DOC_SESSION_FINALIZE_BLOCKER,
  'The runtime cannot prove that the host and all its descendants have stopped.',
  'Wait for a runtime with verified session cleanup support. Do not repeat this action or remove the worktree manually.');
const stateUnavailable = () => new OperatorWriteRefusal(503, 'session_state_unavailable',
  'The session state cannot be verified.',
  'Restore the session state before retrying with a new request_id.');

/** Called under docs_session:<sid>, the same write lock as messages/resume.
 * Owner decision (2026-10-31): the macOS commit path accepts the observable
 * quiescence proof — a terminal or idle agent record, the host's agent.lock
 * released, and zero observable worktree-cwd occupancy — and refuses 503 when
 * any part is unprovable. Discard and every other platform still require the
 * complete descendant-cleanup acknowledgement that no OAR version provides.
 */
export async function withQuiescedDocSession<T>(env: NodeJS.ProcessEnv, sid: string, action: () => Promise<T>, deps: DocSessionQuiescenceDependencies): Promise<T> {
  let directory: string, agent: ReturnType<typeof readDocSessionAgent>;
  try {
    directory = sessionDirectory(env, sid);
    agent = readDocSessionAgent(directory);
    if (agent !== null && (agent.protocol !== 1 || agent.kind !== 'docs_session_agent' || agent.session_id !== sid
      || !Number.isSafeInteger(agent.epoch) || agent.epoch < 1 || !['starting', 'running', 'idle', 'stopped', 'failed'].includes(agent.state))) throw new Error('agent identity');
    const tail = docSessionEventsTail(env, sid);
    if (agent?.state === 'running' || tail.activity === 'running') throw new OperatorWriteRefusal(409, 'turn_active', 'A session turn is active.', 'Stop the turn, then review the diff or loss again.');
    if (agent?.state === 'starting') throw new OperatorWriteRefusal(503, 'busy', 'The session host is starting.', 'Wait for startup before retrying with a new request_id.');
  } catch (error) {
    if (error instanceof OperatorWriteRefusal) throw error;
    if (error instanceof DocSessionEventsError && error.code === 'session_not_found') throw new OperatorWriteRefusal(404, 'session_not_found', 'This doc session does not exist.', 'Choose a session from the list.');
    throw stateUnavailable();
  }
  if (deps.kind === 'discard' || (deps.platform ?? process.platform) !== 'darwin') throw blocker();
  // The agent record is the only lifecycle fact that survives the host. A
  // session without one has no finished host to prove.
  if (agent === null || !['idle', 'stopped', 'failed'].includes(agent.state)) throw blocker();
  const host = agent;
  let worktree: string;
  try { ({ worktree } = resolveDocSession(env, sid)); }
  catch (error) { if (error instanceof DocSessionReadError) throw stateUnavailable(); throw error; }
  let lock: ExclusiveDirectoryLockHandle;
  try {
    // The host holds this lock for its whole run and releases it in its final
    // block, so acquiring it proves the host process finished. The same bounded
    // wait as a resumed host's claim covers a host in teardown.
    lock = acquireExclusiveDirectoryLock(directory, DOC_SESSION_AGENT_LOCK, { waitTimeoutMs: 2_000 });
  } catch (error) {
    if (error instanceof ExclusiveLockContentionError) throw new OperatorWriteRefusal(503, 'session_host_active',
      'The session host still holds its lifecycle lock.',
      'Wait for the host to finish, then retry with a new request_id.');
    throw error;
  }
  try {
    lock.assertOwned();
    const platform = deps.platform ?? process.platform;
    const processes = (deps.processes ?? worktreeProcesses)(Date.now() + 5000);
    if (processes === null) throw blocker();
    if (occupiesWorktree(processes, worktree)) throw new OperatorWriteRefusal(503, 'session_occupied',
      'A process still runs inside the session worktree.',
      'Stop the process that uses the session worktree, then retry with a new request_id.');
    const recorded = await runOperatorWrite(randomUUID(), {
      operation: 'docs_finalize_quiescence', target: `docs_finalize_step:${sid}`,
      input: { session_id: sid, step: 'quiescence' },
      execute: async () => ({ status: 200, body: { step: 'quiescence', completed: true, value: { platform, agent_state: host.state, occupancy_processes: 0 } as const } }),
    }, env);
    if (recorded.status !== 200) throw new OperatorWriteRefusal(503, 'audit_unavailable',
      'The quiescence proof could not be recorded.',
      'Check the operator audit log, then retry with a new request_id.');
    return await action();
  } finally { lock.release(); }
}
