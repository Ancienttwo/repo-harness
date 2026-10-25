import { buildExternalSourceProjection } from '../../core/external-sources/projection';
import { decodeAdmittedTaskSessions, type AdmittedTaskSessions } from '../../core/sessions/task-sessions';
import { projectProviderBoard, type ProviderBoardV2 } from '../../core/state/provider-board';
import { listExternalSourceRefreshReceipts, listProviderIssueObservations } from '../external-sources/store';

export interface SliceCollectionOptions {
  /** Supplied by the runtime's existing admission observation. Never discovered by a hook. */
  readonly sessions?: AdmittedTaskSessions;
}

/** Local observation only: hooks never run provider discovery or infer a self claim. */
export function collectSliceInputs(cwd: string, options: SliceCollectionOptions = {}): ProviderBoardV2 | null {
  const observations = listProviderIssueObservations(cwd);
  const receipts = listExternalSourceRefreshReceipts(cwd);
  const ids = new Set([...observations, ...receipts].map(value => value.registered_repository_id));
  if (options.sessions) ids.add(options.sessions.repository_id);
  if (ids.size === 0) return null;
  if (ids.size !== 1) throw new Error('hook_provider_repository_ambiguous');
  const repository_id = [...ids][0]!;
  const sessions = options.sessions ? decodeAdmittedTaskSessions(options.sessions, { repository_id }) : null;
  return projectProviderBoard({ registered_repository_id: repository_id,
    issues: buildExternalSourceProjection({ registered_repository_id: repository_id, observations, receipts }),
    sessions, session_error: sessions === null ? 'unavailable' : null });
}
