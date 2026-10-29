import { docSessionEventsTail, sessionDirectory, DocSessionEventsError } from './doc-session-events';
import { readDocSessionAgent } from './doc-session-agent';
import { OperatorWriteRefusal } from './write-run';

/** Called under docs_session:<sid>, the same write lock as messages/resume.
 * OAR 0.75.0 has no complete descendant-cleanup acknowledgement. Refuse before
 * sending control or changing lifecycle state; do not turn a stop into a
 * no-effect refusal. No OS currently has a supported proof adapter here.
 */
export async function withQuiescedDocSession<T>(env: NodeJS.ProcessEnv, sid: string, _action: () => Promise<T>): Promise<T> {
  try {
    const directory = sessionDirectory(env, sid);
    const agent = readDocSessionAgent(directory);
    if (agent !== null && (agent.protocol !== 1 || agent.kind !== 'docs_session_agent' || agent.session_id !== sid
      || !Number.isSafeInteger(agent.epoch) || agent.epoch < 1 || !['starting', 'running', 'idle', 'stopped', 'failed'].includes(agent.state))) throw new Error('agent identity');
    const tail = docSessionEventsTail(env, sid);
    if (agent?.state === 'running' || tail.activity === 'running') throw new OperatorWriteRefusal(409, 'turn_active', 'A session turn is active.', 'Stop the turn, then review the diff or loss again.');
    if (agent?.state === 'starting') throw new OperatorWriteRefusal(503, 'busy', 'The session host is starting.', 'Wait for startup before retrying with a new request_id.');
  } catch (error) {
    if (error instanceof OperatorWriteRefusal) throw error;
    if (error instanceof DocSessionEventsError && error.code === 'session_not_found') throw new OperatorWriteRefusal(404, 'session_not_found', 'This doc session does not exist.', 'Choose a session from the list.');
    throw new OperatorWriteRefusal(503, 'session_state_unavailable', 'The session state cannot be verified.', 'Restore the session state before retrying with a new request_id.');
  }
  throw new OperatorWriteRefusal(503, 'quiescence_unavailable', 'The runtime cannot prove that the host and all its descendants have stopped.', 'Wait for a runtime with verified session cleanup support. Do not repeat this action or remove the worktree manually.');
}
