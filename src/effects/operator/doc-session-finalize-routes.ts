import { fileURLToPath } from 'node:url';
import { decodeDocSessionCommit, decodeDocSessionDiscard } from '../../core/operator/doc-session-finalize';
import { decodeDocSessionFinalizeResponse, OPERATOR_SESSION_COMMIT_ROUTE, OPERATOR_SESSION_DISCARD_ROUTE, type DocSessionFinalizeAction } from '../../core/operator/doc-session-finalize-wire';
import { runSetupProcess, type SetupProcessRunner } from '../setup/collector';
import type { OperatorWriteRoute } from './write-channel';
import type { OperatorWriteOperation } from './write-run';

const CHILD = fileURLToPath(new URL('./doc-session-finalize-worker.ts', import.meta.url));
const CWD = fileURLToPath(new URL('../../../', import.meta.url));
export const DOC_SESSION_FINALIZE_TIMEOUT_MS = 120_000;

/** Shared HTTP/CLI operation. Its caller holds the audited session target lock
 * until the bounded worker settles. Unknown output leaves the intent unresolved.
 */
export function boundedDocSessionFinalizeOperation(env: NodeJS.ProcessEnv, action: DocSessionFinalizeAction, sid: string, fields: Readonly<Record<string, unknown>>, run: SetupProcessRunner = runSetupProcess): OperatorWriteOperation {
  if (!/^[0-9a-f]{32}$/u.test(sid) || !['commit', 'discard'].includes(action)) throw new Error('finalize identity');
  const input = action === 'commit' ? { ...decodeDocSessionCommit(fields) } : { ...decodeDocSessionDiscard(fields) };
  return {
    operation: `docs_session_${action}`, target: `docs_session:${sid}`, input: { session_id: sid, ...input },
    execute: async () => {
      const result = await run([CHILD], { cwd: CWD, env, timeout_ms: DOC_SESSION_FINALIZE_TIMEOUT_MS,
        signal: new AbortController().signal, service: 'docs-session-finalize', stdin: JSON.stringify({ action, session_id: sid, fields: input }) });
      if (!result.ok) throw new Error('finalize worker outcome unknown');
      return decodeDocSessionFinalizeResponse(JSON.parse(result.stdout), action);
    },
  };
}
export function docSessionFinalizeRoutes(env: NodeJS.ProcessEnv): OperatorWriteRoute[] {
  return [
    { id: 'sessions_commit', path: OPERATOR_SESSION_COMMIT_ROUTE, decode: (fields, params) => boundedDocSessionFinalizeOperation(env, 'commit', params[0]!, fields) },
    { id: 'sessions_discard', path: OPERATOR_SESSION_DISCARD_ROUTE, decode: (fields, params) => boundedDocSessionFinalizeOperation(env, 'discard', params[0]!, fields) },
  ];
}
