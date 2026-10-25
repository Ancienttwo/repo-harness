import { buildExternalSourceProjection } from '../../core/external-sources/projection';
import { projectProviderBoard, type ProviderBoardInputsV2, type ProviderBoardV2 } from '../../core/state/provider-board';
import { listExternalSourceRefreshReceipts, listProviderIssueObservations } from '../external-sources/store';
import { readAdmittedTaskSessions } from '../sessions/task-sessions';
import { SessionObservationError } from '../sessions/admitted-source';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';

export interface CollectProviderBoardOptions { readonly repository_id: string; readonly env?: NodeJS.ProcessEnv }
export interface ProviderBoardReaders {
  readonly registry: typeof readRepoHarnessRegistryStrictSnapshot;
  readonly observations: typeof listProviderIssueObservations;
  readonly receipts: typeof listExternalSourceRefreshReceipts;
  readonly sessions: typeof readAdmittedTaskSessions;
}
const readers: ProviderBoardReaders = { registry: readRepoHarnessRegistryStrictSnapshot,
  observations: listProviderIssueObservations, receipts: listExternalSourceRefreshReceipts, sessions: readAdmittedTaskSessions };

/** Uses the existing provider observation and admitted-session authorities. Never reads a Sprint or lease. */
export function collectProviderBoardInputs(input: CollectProviderBoardOptions, effects: ProviderBoardReaders = readers): ProviderBoardInputsV2 {
  const registry = effects.registry({ env: input.env, adoptedOnly: false });
  const repo = registry.repos.find(repo => repo.id === input.repository_id);
  if (!repo) throw new Error('provider_board_repository_unavailable');
  const issues = buildExternalSourceProjection({ registered_repository_id: repo.id,
    observations: effects.observations(repo.path), receipts: effects.receipts(repo.path) });
  let sessions: ProviderBoardInputsV2['sessions'] = null;
  let session_error: ProviderBoardInputsV2['session_error'] = null;
  try { sessions = effects.sessions(input); }
  catch (error) {
    session_error = error instanceof SessionObservationError && ['unavailable', 'stale', 'too_large'].includes(error.code)
      ? error.code as NonNullable<ProviderBoardInputsV2['session_error']> : 'unavailable';
  }
  return { registered_repository_id: repo.id, issues, sessions, session_error };
}

export function resolveProviderBoard(input: CollectProviderBoardOptions, effects: ProviderBoardReaders = readers): ProviderBoardV2 {
  let before = projectProviderBoard(collectProviderBoardInputs(input, effects));
  for (let attempt = 0; attempt < 2; attempt++) {
    const after = projectProviderBoard(collectProviderBoardInputs(input, effects));
    if (before.revision === after.revision) return before;
    before = after;
  }
  return Object.freeze({ ...before, snapshot_consistency: 'changed_during_read' });
}
