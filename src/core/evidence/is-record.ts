/**
 * The one record guard. A record is a non-null, non-array object; the guard
 * keeps that shape deliberately and does not narrow it to plain objects.
 * Core, CLI and effects modules read this one definition.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
