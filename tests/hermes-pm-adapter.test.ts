import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

test('Hermes PM transport keeps operator bindings and rejects arbitrary arguments', () => {
  const result = spawnSync('python3', [resolve(import.meta.dir, '../assets/hermes/test_adapter.py')], {
    encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, timeout: 30_000,
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stderr).toContain('Ran 4 tests');
  expect(result.stderr).toContain('OK');
});
