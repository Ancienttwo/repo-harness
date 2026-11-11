// The one set of strict decode readers for the snapshot decoders. A decoder
// passes its own `fail`, so every error message stays the decoder's own. A
// reader with another body or another return type stays local to its decoder.
// Browser-safe: no imports and no I/O.

/**
 * Build the readers over one decoder's `fail`. Take only the readers that the
 * decoder uses.
 */
export function decodeReaders(fail: (what: string) => never) {
  return {
    /** A record whose key set is exactly `keys`; anything else fails. */
    obj: (v: unknown, keys: readonly string[], what: string): Record<string, unknown> => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(what);
      if (Object.keys(v).sort().join(',') !== [...keys].sort().join(',')) return fail(`${what} fields`);
      return v as Record<string, unknown>;
    },
    /** `null` stays `null`; every other value goes through `read`. */
    nullable: <T>(v: unknown, read: (x: unknown) => T): T | null => (v === null ? null : read(v)),
    array: (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(what)),
    bool: (v: unknown, what: string): boolean => (typeof v === 'boolean' ? v : fail(what)),
    /** A safe integer that is not negative. */
    count: (v: unknown, what: string): number =>
      (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : fail(what)),
    /** A string in the closed vocabulary `values`. */
    oneOf: <T extends string>(v: unknown, values: readonly T[], what: string): T =>
      (typeof v === 'string' && (values as readonly string[]).includes(v) ? v as T : fail(what)),
    /** A string that matches `pattern`. */
    match: (v: unknown, pattern: RegExp, what: string): string => (typeof v === 'string' && pattern.test(v) ? v : fail(what)),
  };
}
