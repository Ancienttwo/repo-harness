import { decodeDocSessionCommit, decodeDocSessionDiscard } from '../../core/operator/doc-session-finalize';
import { decodeDocSessionFinalizeResponse, type DocSessionFinalizeAction } from '../../core/operator/doc-session-finalize-wire';
import { isDocsHostWritablePath } from '../review/docs-host-isolation';
import { docSessionCommitOperation, docSessionDiscardOperation } from './doc-session-finalize';
import { createDocSessionGithubAdapters } from './doc-session-finalize-github';
import { createDocSessionScopeValidator } from './doc-session-finalize-scope';
import { withQuiescedDocSession } from './doc-session-quiescence';
import { sessionDirectory, DocSessionEventsError } from './doc-session-events';
import { OperatorWriteRefusal } from './write-run';

// One bounded private stdin request. The parent owns audit and the target lock.
async function main(): Promise<void> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > 64 * 1024) throw new Error('finalize request too large');
    chunks.push(bytes);
  }
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!request || Object.keys(request).sort().join(',') !== 'action,fields,session_id' || !['commit', 'discard'].includes(request.action)
    || typeof request.session_id !== 'string' || !/^[0-9a-f]{32}$/u.test(request.session_id)) throw new Error('finalize request invalid');
  const action = request.action as DocSessionFinalizeAction;
  const fields = action === 'commit' ? { ...decodeDocSessionCommit(request.fields) } : { ...decodeDocSessionDiscard(request.fields) };
  const env = process.env;
  const deps = { env, ...createDocSessionGithubAdapters(env),
    validate_changes: createDocSessionScopeValidator({ is_writable_path: isDocsHostWritablePath }),
    with_quiesced_session: <T>(sid: string, effect: () => Promise<T>) => withQuiescedDocSession(env, sid, effect),
  };
  let response;
  try {
    // Resolve before the core lock so an absent session has a definite refusal.
    try { sessionDirectory(env, request.session_id); }
    catch (error) {
      if (error instanceof DocSessionEventsError) throw new OperatorWriteRefusal(error.code === 'session_not_found' ? 404 : 503, error.code === 'session_not_found' ? 'session_not_found' : 'session_state_unavailable', 'The session cannot be read.', 'Choose an available session before retrying.');
      throw error;
    }
    const operation = action === 'commit' ? docSessionCommitOperation(request.session_id, fields, deps) : docSessionDiscardOperation(request.session_id, fields, deps);
    response = await operation.execute();
  } catch (error) {
    if (!(error instanceof OperatorWriteRefusal)) throw error;
    response = { status: error.status, body: { error: { code: error.code, message: error.message, next_action: error.next_action } } };
  }
  process.stdout.write(JSON.stringify(decodeDocSessionFinalizeResponse(response, action)) + '\n');
}
void main().catch(() => { process.exitCode = 1; });
