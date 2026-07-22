/**
 * Deterministic JSON serialization: object keys are sorted recursively so
 * the same logical value always serializes to the same bytes regardless of
 * construction order. Arrays keep their given order (order is significant).
 * Used by the idempotency key (D5) and payload-size measurement (D6).
 */
import type { JsonValue } from "./types";

function canonicalizeValue(value: JsonValue): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeValue(entry)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalizeValue((value as Record<string, JsonValue>)[key]!)}`);
  return `{${entries.join(",")}}`;
}

export function canonicalize(value: JsonValue): string {
  return canonicalizeValue(value);
}
