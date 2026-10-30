/**
 * Shape every task id must have before it is used as one path component.
 *
 * The id is an opaque 64-character lowercase hex value owned by the task
 * record. A bare hex string is a safe path component on every filesystem this
 * repo targets, so callers may join it directly under their own namespace.
 */
export const TASK_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
