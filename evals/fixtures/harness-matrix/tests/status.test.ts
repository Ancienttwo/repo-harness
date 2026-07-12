import { expect, test } from 'bun:test';
import { apiStatus } from '../src/api/status';
import { uiStatus } from '../src/ui/status';
test('both consumers use the shared status format', () => {
  expect(apiStatus('ok')).toBe('STATUS: OK');
  expect(uiStatus('pending')).toBe('STATUS: PENDING');
});
