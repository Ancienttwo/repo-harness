import { afterAll, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { historicalPlanningFixture } from './helpers/historical-campaign-lifecycle';
import { fixtureTemplate } from './helpers/repo-fixture';
const templates = fixtureTemplate(historicalPlanningFixture);
afterAll(() => templates.dispose());
// This test includes repository setup, both bounded children, settlement and replay.
// Keep each child's 10-second runtime deadline in the fixture; budget setup separately.
for (const scenario of ['worker_nonzero', 'verifier_fail', 'verifier_without_result']) test(`actual finish(fail): ${scenario} settles once`, async () => {
  const f = await templates.materialize();
  const { root, home, env, intent, authorization, executeInput, secondAuthorization } = f;
  const run = spawnSync(process.execPath, [join(import.meta.dir, 'fixtures/brc-audit/finish-failure.ts'), scenario], {
    encoding: 'utf8', timeout: 60000,
    input: JSON.stringify({ root, home, env, intent, authorization, executeInput, secondAuthorization }),
  });
  expect(run.status, `${run.error?.message ?? ""}\n${run.stdout}${run.stderr}`).toBe(0);
  expect(run.stdout).toContain('actual finish(fail) settled and replayed');
}, 65000);
