/**
 * Deterministic JSON serialization: object keys are sorted recursively by
 * UTF-8 bytes, so the same logical value always serializes to the same bytes
 * regardless of construction order. Arrays keep their given order (order is
 * significant). This is the one byte contract for every digest input.
 */
import { byteCompare } from "./byte-compare";

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(byteCompare).map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}
