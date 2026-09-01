import {
  OperatorTaskMessageError,
  sendOperatorTaskMessage,
  type OperatorTaskMessageErrorCode,
  type SendOperatorTaskMessageInput,
  type SendOperatorTaskMessageResult,
} from '../fleet/task-message-request';

interface TaskMessageProcessRequest {
  readonly input: SendOperatorTaskMessageInput;
}

type TaskMessageProcessResponse =
  | { readonly ok: true; readonly result: SendOperatorTaskMessageResult }
  | { readonly ok: false; readonly code: OperatorTaskMessageErrorCode };

function unavailable(): TaskMessageProcessResponse {
  return { ok: false, code: 'task_message_unreadable' };
}

function respond(response: TaskMessageProcessResponse): void {
  process.stdout.write(JSON.stringify(response));
}

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => {
  input += chunk;
});
process.stdin.once('end', () => {
  let request: unknown;
  try {
    request = JSON.parse(input);
  } catch {
    respond(unavailable());
    return;
  }
  if (typeof request !== 'object'
    || request === null
    || !('input' in request)
    || typeof request.input !== 'object'
    || request.input === null) {
    respond(unavailable());
    return;
  }
  try {
    respond({
      ok: true,
      result: sendOperatorTaskMessage((request as TaskMessageProcessRequest).input),
    });
  } catch (error) {
    respond(error instanceof OperatorTaskMessageError
      ? { ok: false, code: error.code }
      : unavailable());
  }
});
