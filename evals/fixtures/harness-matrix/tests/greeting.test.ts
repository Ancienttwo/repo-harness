import { expect, test } from 'bun:test';
import { greeting } from '../src/greeting';
test('Chinese punctuation', () => expect(greeting('小明')).toBe('你好，小明。'));
