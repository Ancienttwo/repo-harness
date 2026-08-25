import { createHash } from 'crypto';

import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';

export const MESSAGE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const MESSAGE_SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
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

export function assertMessageSha256(value: string, field: string, invalid: MessageInvalid): void {
  if (!MESSAGE_SHA256_PATTERN.test(value)) invalid(`${field} is invalid`);
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
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function canonicalMessageBytes(value: Readonly<Record<string, unknown>>): string {
  return canonicalize(value as JsonValue);
}

export function canonicalMessageDigest(value: Readonly<Record<string, unknown>>): string {
  return messageSha256(canonicalMessageBytes(value));
}
