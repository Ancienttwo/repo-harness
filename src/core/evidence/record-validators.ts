/**
 * The one set of record validator primitives for the evidence and publication
 * policy decoders. Each failure throws `Error` with the caller's label, so the
 * error messages stay `<label> is invalid` and `<label> fields are invalid`.
 */

export function fail(message: string): never {
  throw new Error(message);
}

export function exactKeys(value: Record<string, unknown>, label: string, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} fields are invalid`);
  }
}

export function requiredString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.trim() === '' || (pattern && !pattern.test(value))) {
    fail(`${label} is invalid`);
  }
  return value;
}

export function oneOf<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  // A JSON array such as ["timeout"] must not pass through String() coercion.
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) fail(`${label} is invalid`);
  return value as T;
}

/** The path rule of the protected-path and generated-artifact policy blocks. */
export function repoRelativePath(value: string): boolean {
  return value.length > 0 && !value.startsWith('/') && !value.includes('\\')
    && !value.includes('\0') && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}
