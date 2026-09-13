import { expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { join } from 'path';
// This process includes repository setup, both bounded children, settlement and replay.
// Keep each child's 10-second runtime deadline in the fixture; budget setup separately.
for (const scenario of ['worker_nonzero', 'verifier_fail', 'verifier_without_result']) test(`actual finish(fail): ${scenario} settles once`, () => {
  const run = spawnSync(process.execPath, [join(import.meta.dir, 'fixtures/brc-audit/finish-failure.ts'), scenario], { encoding: 'utf8', timeout: 60000 });
  expect(run.status, `${run.error?.message ?? ""}\n${run.stdout}${run.stderr}`).toBe(0);
  expect(run.stdout).toContain('actual finish(fail) settled and replayed');
}, 65000);
