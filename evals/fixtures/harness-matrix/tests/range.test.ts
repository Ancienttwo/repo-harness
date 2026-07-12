import { expect, test } from 'bun:test';
import { inclusiveRangeEnd } from '../src/range';
test('inclusive end', () => expect(inclusiveRangeEnd(4, 3)).toBe(6));
