/**
 * Generic, pure recursive walkers over a `JsonValue` tree. Shared by path
 * field discovery and secret redaction so both operate the same way over
 * arbitrary payload shapes.
 */
import type { JsonValue } from "./types";

export interface StringLeaf {
  readonly path: readonly string[];
  readonly value: string;
}

export function collectStringLeaves(value: JsonValue, pathPrefix: readonly string[] = []): readonly StringLeaf[] {
  if (typeof value === "string") {
    return [{ path: pathPrefix, value }];
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectStringLeaves(entry, [...pathPrefix, String(index)]));
  }
  const record = value as Record<string, JsonValue>;
  return Object.keys(record).flatMap((key) => collectStringLeaves(record[key]!, [...pathPrefix, key]));
}

export function mapStringLeaves(
  value: JsonValue,
  fn: (path: readonly string[], leaf: string) => string,
  pathPrefix: readonly string[] = [],
): JsonValue {
  if (typeof value === "string") {
    return fn(pathPrefix, value);
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => mapStringLeaves(entry, fn, [...pathPrefix, String(index)]));
  }
  const record = value as Record<string, JsonValue>;
  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(record)) {
    result[key] = mapStringLeaves(record[key]!, fn, [...pathPrefix, key]);
  }
  return result;
}
