import { buildExternalSourceProjection } from '../../core/external-sources/projection';
import { projectProviderBoard, type ProviderBoardV2 } from '../../core/state/provider-board';
import { readLatestExternalSourceSnapshot, type ExternalSourceSnapshotLimits } from '../external-sources/store';

/** Fixed per-spawn read budget. The hook runs on every agent spawn, so history size must not reach it. */
export const SLICE_SOURCE_LIMITS: ExternalSourceSnapshotLimits = Object.freeze({
  max_observations: 200,
  max_issue_directories: 2000,
  max_bytes: 2 * 1024 * 1024,
});

/** Local observation only: hooks never run provider discovery or observe sessions. */
export function collectSliceInputs(cwd: string, limits: ExternalSourceSnapshotLimits = SLICE_SOURCE_LIMITS): ProviderBoardV2 | null {
  const snapshot = readLatestExternalSourceSnapshot(cwd, limits);
  if (snapshot === null) return null;
  const repository_id = snapshot.receipt.registered_repository_id;
  if (snapshot.observations.some(observation => observation.registered_repository_id !== repository_id)) throw new Error('hook_provider_repository_ambiguous');
  return projectProviderBoard({ registered_repository_id: repository_id,
    issues: buildExternalSourceProjection({ registered_repository_id: repository_id, observations: snapshot.observations, receipts: [snapshot.receipt] }),
    sessions: null, session_error: 'unavailable' });
}
