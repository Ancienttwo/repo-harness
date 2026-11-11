import { sha256Prefixed } from '../evidence/sha256';
import { TASK_DIGEST_PATTERN } from '../state/coordination-identity';
import { TaskMessageError } from './task-message-error';

export const MESSAGE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const MESSAGE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;

export type MessageInvalid = (message: string) => never;

/** Closed protocols use this helper so unknown fields always fail rather than becoming implicit extension points. */
export function assertMessageExactKeys(
  value: Record<string, unknown>,
  fields: readonly string[],
  subject: string,
  invalid: MessageInvalid,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) invalid(`${subject} fields are invalid`);
}

export function messageRequiredString(value: unknown, field: string, invalid: MessageInvalid): string {
  if (typeof value !== 'string' || value.length === 0) invalid(`${field} is required`);
  return value;
}

export function messageNullableString(value: unknown, field: string, invalid: MessageInvalid): string | null {
  if (value === null) return null;
  return messageRequiredString(value, field, invalid);
}

export function assertMessageUuid(value: string, field: string, invalid: MessageInvalid): void {
  if (!MESSAGE_UUID_PATTERN.test(value)) invalid(`${field} is invalid`);
}

export function assertMessageTimestamp(value: string, field: string, invalid: MessageInvalid): void {
  if (!MESSAGE_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) invalid(`${field} is invalid`);
}

export function assertMessageInteger(value: unknown, field: string, minimum: number, invalid: MessageInvalid): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) invalid(`${field} is invalid`);
}

export function assertMessageBoundedUtf8(value: unknown, field: string, maximum: number, invalid: MessageInvalid): asserts value is string {
  if (typeof value !== 'string') invalid(`${field} is invalid`);
  if (Buffer.byteLength(value, 'utf-8') > maximum) invalid(`${field} exceeds ${maximum} bytes`);
}

export function messageSha256(value: string | Buffer): string {
  return sha256Prefixed(value);
}

/** Task-message record validators share these bindings, so each invalid field throws the one shared error class. */
export function invalidTaskMessage(message: string): never {
  throw new TaskMessageError('task_message_invalid', message);
}

export function assertTaskMessageExactKeys(value: Record<string, unknown>, fields: readonly string[], subject: string): void {
  assertMessageExactKeys(value, fields, subject, invalidTaskMessage);
}

export function assertTaskMessageUuid(value: string, field: string): void {
  assertMessageUuid(value, field, invalidTaskMessage);
}

export function assertTaskMessageDigest(value: string, field: string): void {
  if (!TASK_DIGEST_PATTERN.test(value)) invalidTaskMessage(`${field} is invalid`);
}

export function assertTaskMessageTimestamp(value: string, field: string): void {
  assertMessageTimestamp(value, field, invalidTaskMessage);
}
