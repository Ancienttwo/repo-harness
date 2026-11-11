/**
 * The one byte-order comparator. Sorts strings by their UTF-8 bytes, so a
 * receipt, fingerprint or feedback record has one sort order in every module.
 */
export function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}
