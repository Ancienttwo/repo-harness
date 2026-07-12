import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
test('migration adds a non-null status with a safe default', () => {
  const path = 'deploy/sql/0001_add_widget_status.sql';
  expect(existsSync(path)).toBe(true);
  const sql = readFileSync(path, 'utf-8').toLowerCase();
  expect(sql).toContain('add column');
  expect(sql).toContain('status');
  expect(sql).toContain('not null');
  expect(sql).toContain('default');
});
