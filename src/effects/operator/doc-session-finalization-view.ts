import { decodeDocSessionFinalizationView, type DocSessionFinalizationView } from '../../core/operator/doc-session-finalization-view';
import { readDocSessionFinalization } from './doc-session-finalize';
import { readRegisteredDocSessionRecord } from './doc-session-views';

/** Admit metadata without resolving a worktree that a saved discard may have removed. */
export function readDocSessionFinalizationView(env: NodeJS.ProcessEnv, request: { readonly session_id: string }): DocSessionFinalizationView {
  readRegisteredDocSessionRecord(env, request.session_id);
  return decodeDocSessionFinalizationView({
    protocol: 1, kind: 'operator_docs_session_finalization_state', session_id: request.session_id,
    progress: readDocSessionFinalization(env, request.session_id),
  }, request);
}
