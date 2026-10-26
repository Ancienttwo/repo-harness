import { assertMessageExactKeys, messageRequiredString } from './mechanics';
import { TaskMessageError } from './task-message-error';

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
function invalid(message: string): never { throw new TaskMessageError('task_message_invalid', message); }

export interface TaskMessageClaim { readonly reference: string; readonly revision: string }
export function validateTaskMessageClaim(value: unknown): TaskMessageClaim {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('claim reference is required');
  const record = value as Record<string, unknown>;
  assertMessageExactKeys(record, ['reference', 'revision'], 'claim reference', invalid);
  const reference = messageRequiredString(record.reference, 'claim reference', invalid), revision = messageRequiredString(record.revision, 'claim revision', invalid);
  if (!reference.trim() || /[\x00-\x1f\x7f]/.test(reference) || !SHA256_PATTERN.test(revision)) invalid('claim reference is invalid');
  return Object.freeze({ reference, revision });
}
export function sameTaskMessageClaim(left: TaskMessageClaim | null, right: TaskMessageClaim | null): boolean {
  return left === null || right === null ? left === right : left.reference === right.reference && left.revision === right.revision;
}
