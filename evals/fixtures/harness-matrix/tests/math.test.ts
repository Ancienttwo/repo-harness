import { expect, test } from 'bun:test';
import { add, clamp } from '../src/math';
test('add baseline', () => expect(add(2, 3)).toBe(5));
test('clamp bounds values', () => {
  expect(clamp(-1, 0, 10)).toBe(0);
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(11, 0, 10)).toBe(10);
});
