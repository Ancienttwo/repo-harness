/** Shared error identity for admitted message records and claim references. */
export type TaskMessageErrorCode =
  | 'task_message_invalid'
  | 'message_id_conflict'
  | 'task_message_transition_invalid';

export class TaskMessageError extends Error {
  constructor(readonly code: TaskMessageErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'TaskMessageError';
  }
}

