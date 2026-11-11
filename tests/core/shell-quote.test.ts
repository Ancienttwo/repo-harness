import { expect, test } from 'bun:test';
import { shellQuote } from '../../src/core/shell-quote';

test('quotes each POSIX shell word and preserves embedded quotes and newlines', () => {
  expect(shellQuote("a'b")).toBe("'a'\\''b'");
  expect(shellQuote('')).toBe("''");
  expect(shellQuote('a\nb')).toBe("'a\nb'");
  expect(shellQuote('abc')).toBe("'abc'");
});
