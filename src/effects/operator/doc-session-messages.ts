import type { Session } from '@botiverse/oar';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { decodeDocSessionMessage, DOC_SESSION_MESSAGE_RESULTS, OPERATOR_SESSION_MESSAGES_ROUTE, type DocSessionMessageInput, type DocSessionMessageResult } from '../../core/operator/doc-session-messages';
import { readSessionArtifact, writeSessionArtifact } from '../terminal/task-session-io';
import { docSessionDirectory, docSessionRequestsDirectory, isTerminalAgentState, readDocSessionAgent } from './doc-session-agent';
import type { OperatorWriteRoute } from './write-channel';
import { OperatorWriteRefusal, type OperatorWriteOperation } from './write-run';

/** Use OAR's state and control outcomes. Explicit `now` never falls back to queue. */
export async function deliverDocSessionMessage(session: Pick<Session, 'prompt' | 'queue' | 'steer' | 'status'>, input: DocSessionMessageInput, inputId: string): Promise<DocSessionMessageResult> {
  const options = { inputId };
  if (session.status().value.kind === 'idle') {
    const outcome = await session.prompt(input.text, options);
    if (outcome.kind === 'accepted') return 'prompted';
    if (outcome.code !== 'busy') return 'refused';
    // A native turn can open between the idle observation and prompt. The rejected prompt applied nothing.
  }
  if (input.when === 'after_turn') return (await session.queue(input.text, options)).kind === 'accepted' ? 'queued' : 'refused';
  if (!session.steer) return 'steer_unsupported';
  const outcome = await session.steer(input.text, options);
  if (outcome.kind === 'accepted') return 'steered';
  if (outcome.code === 'unsupported') return 'steer_unsupported';
  if (outcome.code === 'no_active_turn' && session.status().value.kind === 'idle') {
    return (await session.prompt(input.text, options)).kind === 'accepted' ? 'prompted' : 'refused';
  }
  return 'refused';
}

/** A request can run after an acknowledgement deadline. Unknown delivery throws, so audit forbids replay. */
export async function requestDocSessionMessage(env: NodeJS.ProcessEnv, sessionId: string, input: DocSessionMessageInput): Promise<DocSessionMessageResult> {
  let directory: string;
  try { directory = docSessionDirectory(env, sessionId); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as Error).message === 'doc_session_directory_unsafe') {
      throw new OperatorWriteRefusal(404, 'session_not_found', 'This doc session does not exist.', 'Choose a session from the list.');
    }
    throw error;
  }
  const record = readDocSessionAgent(directory);
  if (record === null || isTerminalAgentState(record.state)) return 'session_closed';
  if (record.state === 'starting') return 'starting';
  const inputId = randomUUID();
  const requests = docSessionRequestsDirectory(directory);
  const name = `message-${inputId}`;
  writeSessionArtifact(join(requests, `${name}.json`), { kind: 'message', epoch: record.epoch, input_id: inputId, ...input });
  for (const deadline = Date.now() + 10_000; Date.now() < deadline;) {
    try {
      const ack = readSessionArtifact<{ epoch: number; result: DocSessionMessageResult }>(join(requests, `${name}.ack.json`));
      if (Object.keys(ack).length !== 2 || ack.epoch !== record.epoch || !DOC_SESSION_MESSAGE_RESULTS.includes(ack.result)) throw new Error('doc_session_message_ack_invalid');
      return ack.result;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const current = readDocSessionAgent(directory);
    if (current === null || current.epoch !== record.epoch || isTerminalAgentState(current.state)) throw new Error('doc_session_message_outcome_unknown');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('doc_session_message_unanswered');
}

export function docSessionMessageOperation(env: NodeJS.ProcessEnv, sessionId: string, input: DocSessionMessageInput): OperatorWriteOperation {
  if (!/^[0-9a-f]{32}$/u.test(sessionId)) throw new Error('doc_session_id_invalid');
  const message = decodeDocSessionMessage(input);
  return {
    operation: 'docs_session_message', target: `docs_session:${sessionId}`, input: { session_id: sessionId, ...message },
    execute: async () => {
      const result = await requestDocSessionMessage(env, sessionId, message);
      if (result === 'prompted' || result === 'queued' || result === 'steered') {
        return { status: 202, body: { protocol: 1, kind: 'operator_docs_session_message', session_id: sessionId, landed: result } };
      }
      const closed = result === 'session_closed', unsupported = result === 'steer_unsupported';
      throw new OperatorWriteRefusal(closed || unsupported ? 409 : 503, closed ? 'session_closed' : unsupported ? 'steer_unsupported' : result === 'starting' ? 'busy' : 'message_refused',
        closed ? 'The session agent has ended.' : unsupported ? 'This runtime cannot insert a message into the current turn.' : 'The agent did not accept this message.',
        closed ? 'Open another session.' : unsupported ? 'Choose after_turn explicitly.' : 'Wait, then retry with a new request_id.');
    },
  };
}

export function docSessionMessagesRoute(env: NodeJS.ProcessEnv): OperatorWriteRoute {
  return { id: 'sessions_messages', path: OPERATOR_SESSION_MESSAGES_ROUTE,
    decode: (fields, params) => docSessionMessageOperation(env, params[0]!, decodeDocSessionMessage(fields)) };
}
