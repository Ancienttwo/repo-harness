import { parentPort, workerData } from 'node:worker_threads';
import { isDecisionCursor } from '../../core/operator/decision-inventory';
import type { OperatorCollaborationSnapshotV4 } from '../../core/operator/collaboration-snapshot';
import {
  OperatorCollaborationError,
  readOperatorCollaborationSnapshot,
  type OperatorCollaborationErrorCode,
} from './collaboration';

interface CollaborationWorkerRequest {
  readonly env?: Readonly<Record<string, string>>;
  readonly repository_id: string;
  readonly decision_after: string | null;
}

type CollaborationWorkerResponse =
  | {
      readonly ok: true;
      readonly snapshot: OperatorCollaborationSnapshotV4;
    }
  | {
      readonly ok: false;
      readonly code: OperatorCollaborationErrorCode;
    };

function unavailable(): CollaborationWorkerResponse {
  return { ok: false, code: 'collaboration_snapshot_unavailable' };
}

function collect(request: CollaborationWorkerRequest): void {
  if (
    typeof request !== 'object'
    || request === null
    || typeof request.repository_id !== 'string'
    || request.repository_id.length === 0
    || !isDecisionCursor(request.decision_after)
  ) {
    parentPort!.postMessage(unavailable());
    return;
  }
  try {
    parentPort!.postMessage({
      ok: true,
      snapshot: readOperatorCollaborationSnapshot({
        env: request.env,
        repository_id: request.repository_id,
        decision_after: request.decision_after,
      }),
    } satisfies CollaborationWorkerResponse);
  } catch (error) {
    parentPort!.postMessage(
      error instanceof OperatorCollaborationError
        ? ({ ok: false, code: error.code } satisfies CollaborationWorkerResponse)
        : unavailable(),
    );
  }
}

collect(workerData);
