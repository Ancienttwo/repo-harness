import {
  OperatorTaskMessageError,
  sendOperatorTaskMessage,
  type OperatorTaskMessageErrorCode,
  type SendOperatorTaskMessageInput,
  type SendOperatorTaskMessageResult,
} from '../fleet/task-message-request';

interface TaskMessageWorkerRequest {
  readonly input: SendOperatorTaskMessageInput;
}

type TaskMessageWorkerResponse =
  | {
      readonly ok: true;
      readonly result: SendOperatorTaskMessageResult;
    }
  | {
      readonly ok: false;
      readonly code: OperatorTaskMessageErrorCode;
    };

function unavailable(): TaskMessageWorkerResponse {
  return { ok: false, code: 'task_message_unreadable' };
}

self.onmessage = (event: MessageEvent<TaskMessageWorkerRequest>): void => {
  const request = event.data;
  if (typeof request !== 'object' || request === null || typeof request.input !== 'object' || request.input === null) {
    self.postMessage(unavailable());
    return;
  }
  try {
    self.postMessage({
      ok: true,
      result: sendOperatorTaskMessage(request.input),
    } satisfies TaskMessageWorkerResponse);
  } catch (error) {
    self.postMessage(
      error instanceof OperatorTaskMessageError
        ? ({ ok: false, code: error.code } satisfies TaskMessageWorkerResponse)
        : unavailable(),
    );
  }
};
