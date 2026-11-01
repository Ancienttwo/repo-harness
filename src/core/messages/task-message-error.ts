/** Shared error identity for admitted message records and claim references. */
export type TaskMessageErrorCode =
  | 'task_message_invalid'
  | 'message_id_conflict'
  | 'task_message_transition_invalid'
  | 'task_message_channel_retired';

/** #1345 removed the agent_runtime_effect channel. Readers add the record path and the operator action. */
export const RETIRED_DELIVERY_CHANNEL_MESSAGE = 'delivery_channel agent_runtime_effect is retired';
export function retiredDeliveryChannelRecord(path: string): string {
  return `${RETIRED_DELIVERY_CHANNEL_MESSAGE}: ${path}. The operator removes or archives this record by hand.`;
}
export function retiredDeliveryChannel(): never {
  throw new TaskMessageError('task_message_channel_retired', RETIRED_DELIVERY_CHANNEL_MESSAGE);
}

export class TaskMessageError extends Error {
  constructor(readonly code: TaskMessageErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'TaskMessageError';
  }
}

