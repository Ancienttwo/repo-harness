import { expect, test } from 'bun:test';
import { recoveryState } from '../src/recovery';
test('resume completes recorded action', () => expect(recoveryState()).toBe('complete'));
