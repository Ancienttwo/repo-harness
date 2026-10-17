import { parentPort, workerData } from 'node:worker_threads';
import type { OperatorRepositorySnapshotV1 } from '../../core/operator/repository-snapshot';
import {
  OperatorRepositoryError,
  readOperatorRepositorySnapshot,
  type OperatorRepositoryErrorCode,
} from './repository-snapshot';

interface RepositoryWorkerRequest {
  readonly env?: Readonly<Record<string, string>>;
  readonly repository_id: string;
}

type RepositoryWorkerResponse =
  | {
      readonly ok: true;
      readonly snapshot: OperatorRepositorySnapshotV1;
    }
  | {
      readonly ok: false;
      readonly code: OperatorRepositoryErrorCode;
    };

function unavailable(): RepositoryWorkerResponse {
  return { ok: false, code: 'repository_snapshot_unavailable' };
}

function collect(request: RepositoryWorkerRequest): void {
  if (
    typeof request !== 'object'
    || request === null
    || typeof request.repository_id !== 'string'
    || request.repository_id.length === 0
  ) {
    parentPort!.postMessage(unavailable());
    return;
  }
  try {
    parentPort!.postMessage({
      ok: true,
      snapshot: readOperatorRepositorySnapshot({
        env: request.env,
        repository_id: request.repository_id,
      }),
    } satisfies RepositoryWorkerResponse);
  } catch (error) {
    parentPort!.postMessage(
      error instanceof OperatorRepositoryError
        ? ({ ok: false, code: error.code } satisfies RepositoryWorkerResponse)
        : unavailable(),
    );
  }
}

collect(workerData);
