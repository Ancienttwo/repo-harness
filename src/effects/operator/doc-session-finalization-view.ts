import { DOC_SESSION_FINALIZE_BLOCKER, decodeDocSessionFinalizationView, type DocSessionFinalizationView } from '../../core/operator/doc-session-finalize-wire';
import { readDocSessionFinalization } from './doc-session-finalize';

/** This reads only the private journal projection; a removed worktree is valid. */
export function readDocSessionFinalizationView(env: NodeJS.ProcessEnv, request: { readonly session_id: string }): DocSessionFinalizationView {
  return decodeDocSessionFinalizationView({
    protocol: 1, kind: 'operator_docs_session_finalization_state', session_id: request.session_id,
    availability: { state: 'blocked', code: DOC_SESSION_FINALIZE_BLOCKER },
    progress: readDocSessionFinalization(env, request.session_id),
  }, request);
}
