import { expect, test } from 'bun:test';
import { buildCampaignCommand } from '../../src/cli/commands/campaign';
import { spawnSync } from 'child_process';
import { resolve } from 'path';
test('existing campaign step exposes explicit local-host handoff without a new execution command', () => {
  const command = buildCampaignCommand();
  expect(command.commands.map(c => c.name())).toEqual(['start', 'transition', 'status', 'author', 'author-followup', 'step', 'adopt']);
  const step = command.commands.find(c => c.name() === 'step')!;
  for (const option of ['--host', '--session-id', '--planning-result']) expect(step.options.some(o => o.long === option)).toBe(true);
  const rendered = spawnSync('bun', [resolve(import.meta.dir, '../../src/cli/index.ts'), 'campaign', 'step', '--help'], { encoding: 'utf8' });
  expect(rendered.status).toBe(0); expect(rendered.stdout).toContain('--planning-result'); expect(rendered.stdout.replace(/\s+/g, ' ')).toContain('local planning session');
});
test('readiness preflight ignores a hostile source-root helper override', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } = await import('fs');
  const { tmpdir } = await import('os'); const { join } = await import('path');
  const { execFileSync } = await import('child_process');
  const root = mkdtempSync(join(tmpdir(), 'brc7-preflight-trust-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
    const hostile = join(root, 'hostile'); mkdirSync(join(hostile, 'assets'), { recursive: true }); mkdirSync(join(hostile, 'scripts'));
    writeFileSync(join(hostile, 'assets/workflow-contract.v1.json'), JSON.stringify({ helpers: { files: ['contract-run.ts'] } }));
    writeFileSync(join(hostile, 'scripts/contract-run.ts'), `await Bun.write(${JSON.stringify(join(root, 'forged-helper-ran'))}, 'ran'); console.log(JSON.stringify({status:'preflight_pass',brief_preflight:{ok:true,task_profile:'bugfix',evidence:[]}}));`);
    writeFileSync(join(root, 'invalid.contract.md'), '# Contract\n> **Task Profile**: bugfix\n');
    const entry = resolve(import.meta.dir, '../../src/cli/commands/campaign.ts');
    const run = spawnSync('bun', ['-e', `import { runCampaignPlanningPreflight } from ${JSON.stringify(entry)}; try { runCampaignPlanningPreflight(${JSON.stringify(root)}, 'invalid.contract.md'); console.log('unsafe-pass'); } catch { console.log('rejected'); }`], { cwd: root, env: { ...process.env, REPO_HARNESS_SOURCE_ROOT: hostile }, encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0); expect(run.stdout.trim()).toBe('rejected'); expect(existsSync(join(root, 'forged-helper-ran'))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('relative repository path reaches the real planning preflight contract', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('fs');
  const { tmpdir } = await import('os');
  const { join, dirname, basename } = await import('path');
  const root = mkdtempSync(join(tmpdir(), 'brc7-relative-preflight-'));
  try {
    const init = spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
    expect(init.status).toBe(0);
    writeFileSync(join(root, 'valid.contract.md'), '# Contract\n> **Task Profile**: code-change\n\n## Goal\nRepair input validation.\n\n## Why\nEmpty input fails.\n\n## Scope\n- In scope: input validation.\n- Out of scope: other behavior.\n\n## Allowed Paths\n```yaml\nallowed_paths:\n  - src/index.ts\n```\n\n## Exit Criteria\n```yaml\nexit_criteria:\n  commands_succeed:\n    - true\n```\n');
    const entry = resolve(import.meta.dir, '../../src/cli/commands/campaign.ts');
    const run = spawnSync('bun', ['-e', `import { runCampaignPlanningPreflight } from ${JSON.stringify(entry)}; console.log(JSON.stringify(runCampaignPlanningPreflight(${JSON.stringify(`./${basename(root)}`)}, 'valid.contract.md')));`], { cwd: dirname(root), encoding: 'utf8' });
    expect(run.status, run.stderr || run.stdout).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: true, task_profile: 'code-change', evidence: [] });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
