import type { OperatorCollaborationSnapshotV1 } from '../../core/operator/collaboration-snapshot';
import {
  OperatorCollaborationError,
  readOperatorCollaborationSnapshot,
  type OperatorCollaborationErrorCode,
} from './collaboration';

interface CollaborationWorkerRequest {
  readonly env?: Readonly<Record<string, string>>;
  readonly repository_id: string;
}

type CollaborationWorkerResponse =
  | {
      readonly ok: true;
      readonly snapshot: OperatorCollaborationSnapshotV1;
    }
  | {
      readonly ok: false;
      readonly code: OperatorCollaborationErrorCode;
    };

function unavailable(): CollaborationWorkerResponse {
  return { ok: false, code: 'collaboration_snapshot_unavailable' };
}

self.onmessage = (event: MessageEvent<CollaborationWorkerRequest>): void => {
  const request = event.data;
  if (
    typeof request !== 'object'
    || request === null
    || typeof request.repository_id !== 'string'
    || request.repository_id.length === 0
  ) {
    self.postMessage(unavailable());
    return;
  }
  try {
    self.postMessage({
      ok: true,
      snapshot: readOperatorCollaborationSnapshot({
        env: request.env,
        repository_id: request.repository_id,
      }),
    } satisfies CollaborationWorkerResponse);
  } catch (error) {
    self.postMessage(
      error instanceof OperatorCollaborationError
        ? ({ ok: false, code: error.code } satisfies CollaborationWorkerResponse)
        : unavailable(),
    );
  }
};
