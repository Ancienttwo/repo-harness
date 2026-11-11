/**
 * Deterministic JSON serialization: object keys are sorted recursively by
 * Unicode code point, so the same logical value always serializes to the same
 * bytes regardless of construction order. Arrays keep their given order (order
 * is significant). This is the one byte contract for every digest input.
 */

/**
 * Code point order equals UTF-8 byte order for well-formed text and UTF-16
 * code unit order when no key holds a surrogate pair. A lone surrogate sorts by
 * its own value, so two distinct keys never compare equal (a UTF-8 encoder
 * would turn every lone surrogate into U+FFFD).
 */
function codePointCompare(left: string, right: string): number {
  let index = 0;
  while (index < left.length && index < right.length) {
    const a = left.codePointAt(index)!;
    const b = right.codePointAt(index)!;
    if (a !== b) return a - b;
    index += a > 0xffff ? 2 : 1;
  }
  return left.length - right.length;
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(codePointCompare).map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}
