/**
 * D6 inline payload cap: 200 lines or 8 KiB, whichever first. It uses a
 * dual line/byte threshold with EPC-01's own frozen numbers.
 */
export const INLINE_MAX_LINES = 200;
export const INLINE_MAX_BYTES = 8192;

function lineCount(text: string): number {
  if (!text) return 0;
  const lines = text.split("\n");
  return text.endsWith("\n") ? lines.length - 1 : lines.length;
}

export function exceedsInlineCap(serialized: string): boolean {
  return lineCount(serialized) >= INLINE_MAX_LINES || Buffer.byteLength(serialized, "utf8") >= INLINE_MAX_BYTES;
}
