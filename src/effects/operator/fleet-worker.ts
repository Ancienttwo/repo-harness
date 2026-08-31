import type { FleetBoardSnapshotV1 } from '../../core/fleet/board';
import {
  collectFleetBoard,
  FleetBoardError,
  type FleetBoardFatalErrorCode,
} from '../fleet/board';

interface FleetWorkerRequest {
  readonly env?: Readonly<Record<string, string>>;
  readonly sequence: number;
  readonly max_concurrency: number;
  readonly timeout_ms: number;
}

type FleetWorkerResponse =
  | {
      readonly ok: true;
      readonly snapshot: FleetBoardSnapshotV1;
    }
  | {
      readonly ok: false;
      readonly code: FleetBoardFatalErrorCode;
    };

function unavailable(): FleetWorkerResponse {
  return { ok: false, code: 'fleet_registry_unavailable' };
}

self.onmessage = (event: MessageEvent<FleetWorkerRequest>): void => {
  const request = event.data;
  if (
    typeof request !== 'object'
    || request === null
    || !Number.isSafeInteger(request.sequence)
    || !Number.isSafeInteger(request.max_concurrency)
    || !Number.isSafeInteger(request.timeout_ms)
  ) {
    self.postMessage(unavailable());
    return;
  }
  void collectFleetBoard({
    env: request.env,
    sequence: request.sequence,
    max_concurrency: request.max_concurrency,
    timeout_ms: request.timeout_ms,
  }).then(
    (snapshot) => self.postMessage({ ok: true, snapshot } satisfies FleetWorkerResponse),
    (error) => self.postMessage(
      error instanceof FleetBoardError
        ? ({ ok: false, code: error.code } satisfies FleetWorkerResponse)
        : unavailable(),
    ),
  );
};
