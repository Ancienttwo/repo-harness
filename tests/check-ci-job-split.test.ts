import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectAffectedTests, selectCoverage } from '../scripts/select-ci-coverage';

const ROOT = resolve(import.meta.dir, '..');
const workflow = Bun.YAML.parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as any;
const sha = '1'.repeat(40);
const input = { eventName: 'pull_request', event: { pull_request: { draft: true, base: { sha } } }, headSha: sha, actualHead: sha };
const record = `:100644 100644 ${sha} ${sha} M\0src/feature.ts\0`;

describe('single affected verification and daily fallback', () => {
  test('exact complete diff is required, including draft candidates', () => {
    expect(selectCoverage({ ...input, diffRaw: record })).toEqual({ mode: 'affected', reason: 'complete-diff', paths: ['src/feature.ts'] });
    for (const diffRaw of [null, '', record.slice(0, -1), record + '\0', record.replace(' M\0', ' R100\0'), record.replace(sha, 'bad'), record.replace('src/feature.ts', 'src/../feature.ts')]) {
      expect(selectCoverage({ ...input, diffRaw }).mode).toBe('invalid');
    }
    expect(selectCoverage({ ...input, actualHead: '2'.repeat(40), diffRaw: record }).mode).toBe('invalid');
    expect(selectCoverage({ ...input, eventName: 'schedule', diffRaw: null }).mode).toBe('daily');
    expect(selectCoverage({ ...input, eventName: 'push', event: { before: sha }, diffRaw: record }).mode).toBe('report');
  });

  test('real dependency and runtime consumers expand transitively; unknown coverage fails instead of full-suite', () => {
    const sources = new Map([
      ['src/core/feature.ts', 'export const feature = 1'],
      ['src/effects/feature.ts', "import { feature } from '../core/feature'; export const result = feature"],
      ['tests/unit/feature.test.ts', "import { result } from '../../src/effects/feature';"],
      ['src/cli/index.ts', "import { result } from '../effects/feature';"],
      ['tests/cli/consumer.test.ts', "const CLI = join(ROOT, 'src/cli/index.ts'); spawnSync('bun', [CLI]);"],
      ['tests/unrelated.test.ts', "import { other } from '../src/other';"],
    ]);
    expect(selectAffectedTests(['src/core/feature.ts'], sources)).toEqual(['tests/cli/consumer.test.ts', 'tests/unit/feature.test.ts']);
    expect(selectAffectedTests(['tests/unrelated.test.ts'], sources)).toEqual(['tests/unrelated.test.ts']);
    expect(selectAffectedTests(['docs/researches/observation.md'], sources)).toEqual([]);
    expect(() => selectAffectedTests(['unknown/product.conf'], sources)).toThrow('coverage is unknown');
    expect(selectAffectedTests(['src/core/deleted.ts'], new Map([...sources, ['src/core/deleted.ts', 'export const feature=1'], ['src/effects/feature.ts', "// old imported edge kept for this diff\nimport { feature } from '../core/deleted';"]]))).toEqual(['tests/cli/consumer.test.ts', 'tests/unit/feature.test.ts']);
  });

  test('workflow confines full and matrix jobs to fixed main daily snapshots', () => {
    const { jobs } = workflow;
    expect(workflow.on.schedule).toEqual([{ cron: '0 19 * * *' }]);
    expect(jobs.required.name).toBe('Required / CI');
    expect(jobs.required.needs).toEqual(['selection', 'verify']);
    expect(jobs.verify.if).toBe("needs.selection.outputs.mode == 'affected'");
    expect(jobs.verify.steps.some((step: any) => step.run === 'bash scripts/check-ci.sh affected')).toBe(true);
    for (const id of ['governance', 'test', 'mcp-path-matrix']) {
      expect(jobs[id].if).toBe("needs.selection.outputs.mode == 'daily'");
      expect(jobs[id].steps.find((step: any) => step.uses === 'actions/checkout@v4').with.ref).toBe('${{ needs.selection.outputs.sha }}');
      expect(jobs[id]['continue-on-error']).toBeUndefined();
      expect(jobs[id]['timeout-minutes']).toBeGreaterThan(0);
    }
    const reporter = Bun.YAML.parse(readFileSync(join(ROOT, '.github/workflows/ci-report.yml'), 'utf8')) as any;
    expect(reporter.on.workflow_run.types).toEqual(['completed']);
    expect(reporter.jobs.report.if).toContain("head_branch == 'main'");
    expect(reporter.jobs.report.steps.find((step: any) => step.uses === 'actions/checkout@v4').with.ref).toBe('main');
  });

  test('real aggregate shell rejects failure, cancellation, omission and invalid coverage', () => {
    const command = workflow.jobs.required.steps[0].run;
    for (const selection of ['success', 'failure', 'cancelled', 'skipped']) {
      for (const verification of ['success', 'failure', 'cancelled', 'skipped']) {
        for (const mode of ['affected', 'daily', 'invalid', '']) {
          const result = spawnSync('/bin/bash', ['-c', command], { encoding: 'utf8', env: { ...process.env, SELECTION_RESULT: selection, COVERAGE_MODE: mode, VERIFY_RESULT: verification } });
          expect(result.status === 0).toBe(selection === 'success' && verification === 'success' && mode === 'affected');
        }
      }
    }
  });

  test('selector uses actual complete Git PR diff and outputs selected files', () => {
    const repo = mkdtempSync(join(tmpdir(), 'rh-ci-selection-'));
    const git = (...args: string[]) => { const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); if (result.status !== 0) throw Error(result.stderr); return result.stdout.trim(); };
    const write = (path: string, content: string) => { mkdirSync(resolve(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), content); };
    try {
      git('init', '-q'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
      write('src/feature.ts', 'export const feature=1;');
      write('tests/feature.test.ts', "import { feature } from '../src/feature';");
      git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
      write('src/feature.ts', 'export const feature=2;'); git('add', '.'); git('commit', '-qm', 'candidate'); const head = git('rev-parse', 'HEAD');
      const event = join(repo, '.git/event.json'); const output = join(repo, '.git/output');
      writeFileSync(event, JSON.stringify({ pull_request: { draft: true, base: { sha: base } } })); writeFileSync(output, '');
      const result = spawnSync(process.execPath, [join(ROOT, 'scripts/select-ci-coverage.ts')], { cwd: repo, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_SHA: head } });
      expect(result.status).toBe(0);
      expect(JSON.parse(readFileSync(join(repo, '.ci-affected-tests.json'), 'utf8'))).toEqual(['tests/feature.test.ts']);
      expect(readFileSync(output, 'utf8')).toBe(`mode=affected\nsha=${head}\n`);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
});
