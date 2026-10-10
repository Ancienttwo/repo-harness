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
    expect(selectAffectedTests(['DEBUG.md', 'examples/agent-architecture.md'], sources)).toEqual([]);
    expect(() => selectAffectedTests(['unknown/product.conf'], sources)).toThrow('coverage is unknown');
    expect(selectAffectedTests(['src/core/deleted.ts'], new Map([...sources, ['src/core/deleted.ts', 'export const feature=1'], ['src/effects/feature.ts', "// old imported edge kept for this diff\nimport { feature } from '../core/deleted';"]]))).toEqual(['tests/cli/consumer.test.ts', 'tests/unit/feature.test.ts']);
  });

  test('private pstack files select their real isolated test owner without granting a prefix exemption', () => {
    const owner = 'tests/pstack-offline-experiment.test.ts';
    const prefix = 'experiments/private/pstack-watch-pr/';
    const files = [
      'README.md', 'RESULTS.md', 'PROVENANCE.json', 'results.json', 'verification.json',
      'baseline-poller.ts', 'comparison.test.ts', 'fixtures.ts', 'offline-guard.ts',
      'bunfig.toml', 'tsconfig.json', 'vendor/LICENSE', 'vendor/fakes.test-helper.ts',
      'vendor/github.test.ts', 'vendor/github.ts', 'vendor/policy.test.ts', 'vendor/policy.ts',
      'vendor/render.ts', 'vendor/types.ts',
    ].map(file => `${prefix}${file}`);
    const sources = new Map(files.map(file => [file, readFileSync(join(ROOT, file), 'utf8')]));
    sources.set(owner, readFileSync(join(ROOT, owner), 'utf8'));
    expect(selectAffectedTests(files, sources)).toEqual([owner]);
    for (const file of files) expect(selectAffectedTests([file], sources)).toEqual([owner]);
    sources.delete(owner);
    expect(() => selectAffectedTests([`${prefix}vendor/policy.ts`], sources)).toThrow('coverage is unknown');
    sources.set(owner, readFileSync(join(ROOT, owner), 'utf8'));
    for (const path of ['experiments/private/unregistered/runner.ts', 'experiments/public/runner.ts', 'unknown/product.conf']) {
      expect(() => selectAffectedTests([path], sources)).toThrow('coverage is unknown');
    }
  });

  test('canonical changelog uses the docs policy and keeps real consumer coverage', () => {
    expect(selectAffectedTests(['docs/CHANGELOG.md'], new Map())).toEqual([]);
    const sources = new Map([
      ['tests/release-notes.test.ts', "readFileSync('docs/CHANGELOG.md');"],
    ]);
    expect(selectAffectedTests(['docs/CHANGELOG.md'], sources)).toEqual(['tests/release-notes.test.ts']);
    for (const path of ['CHANGELOG.md', 'RELEASE.md', 'release/CHANGELOG.md', 'unknown/product.conf']) {
      expect(() => selectAffectedTests([path], new Map())).toThrow('coverage is unknown');
    }
  });

  test('workflow confines full and matrix jobs to fixed main daily snapshots', () => {
    const { jobs } = workflow;
    expect(workflow.on.schedule).toEqual([{ cron: '0 19 * * *' }]);
    expect(jobs.required.name).toBe('Required / CI');
    expect(jobs.required.needs).toEqual(['selection', 'verify', 'test-home-isolation']);
    expect(jobs.verify.if).toBe("needs.selection.outputs.mode == 'affected'");
    expect(jobs.verify.steps.some((step: any) => step.run === 'bash scripts/check-ci.sh affected')).toBe(true);
    const upload = jobs.selection.steps.find((step: any) => step.uses === 'actions/upload-artifact@v4');
    expect(upload.with.path).toBe('.ci-affected-tests.json');
    expect(upload.with['include-hidden-files']).toBe(true);
    expect(upload.with['if-no-files-found']).toBe('error');
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

  test('Windows PR acceptance uses a read-only exact head and the unchanged native matrix', () => {
    const native = Bun.YAML.parse(readFileSync(join(ROOT, '.github/workflows/windows-protected-helper.yml'), 'utf8')) as any;
    expect(Object.keys(native.on)).toEqual(['pull_request']);
    expect(native.on.pull_request.types).toEqual(['opened', 'synchronize', 'reopened']);
    expect(native.on.pull_request.paths).toContain('src/effects/runtime/protected-helper-platform.ts');
    expect(native.on.pull_request.paths).toContain('tests/cli/mcp-oauth.test.ts');
    expect(native.on.pull_request.paths).toContain('.github/workflows/windows-protected-helper.yml');
    expect(native.on.pull_request.paths).not.toContain('**');
    expect(native.permissions).toEqual({ contents: 'read' });
    const job = native.jobs['windows-protected-helper'];
    expect(job['runs-on']).toBe('windows-latest');
    expect(job['timeout-minutes']).toBe(60);
    expect(job['continue-on-error']).toBeUndefined();
    expect(job.permissions).toBeUndefined();
    expect(job.env.REPO_HARNESS_WINDOWS_PROTECTED_HELPER_SMOKE).toBe('1');
    const checkout = job.steps.find((step: any) => step.uses === 'actions/checkout@v4');
    expect(checkout.with).toEqual({ ref: '${{ github.event.pull_request.head.sha }}', 'persist-credentials': false });
    expect(job.steps.find((step: any) => step.uses === 'actions/setup-node@v4').with['node-version']).toBe('24');
    expect(job.steps.find((step: any) => step.uses === 'oven-sh/setup-bun@v2').with['bun-version']).toBe('1.4.3');
    expect(job.steps.some((step: any) => step.run === 'bun install --frozen-lockfile')).toBe(true);
    const matrix = job.steps.find((step: any) => step.name === 'Run the native Windows path matrix and contract tests');
    const daily = workflow.jobs['mcp-path-matrix'].steps.find((step: any) => step.name === 'Run the native path tests');
    const testFiles = (command: string): string[] => command.match(/tests\/[\w/.-]+\.test\.ts/g) ?? [];
    expect(testFiles(matrix.run)).toEqual([
      ...testFiles(daily.run), 'tests/unit/windows-protected-helper-platform-contract.test.ts',
    ]);
    const forced = job.steps.find((step: any) => step.name === 'Run smoke with each installed internal Git first on PATH');
    expect(forced.run).toContain('for layout in mingw64 ucrt64');
    expect(forced.run).toContain('[[ ! -f "$internal/git.exe" ]]');
    expect(forced.run).toContain('export PATH="$internal:$PATH"');
    expect(forced.run).toContain('test "$tested" -gt 0');
    expect(testFiles(forced.run)).toEqual(['tests/cli/windows-protected-helper-runtime-smoke.test.ts']);
    const identity = job.steps.find((step: any) => step.name === 'Record the native candidate and tools');
    expect(identity.env.EXPECTED_HEAD).toBe('${{ github.event.pull_request.head.sha }}');
    expect(identity.run).toContain('test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"');
    expect(identity.run).toContain('where.exe git');
    expect(identity.run).toContain('git --version');
    for (const step of job.steps) {
      expect(step['continue-on-error']).toBeUndefined();
      if (step.shell !== 'bash') continue;
      const syntax = spawnSync('/bin/bash', ['-n'], { input: step.run, encoding: 'utf8' });
      expect(syntax.status, syntax.stderr).toBe(0);
    }
    expect(JSON.stringify(native)).not.toContain('secrets.');
  });

  test('real aggregate shell rejects failure, cancellation, omission and invalid coverage', () => {
    const command = workflow.jobs.required.steps[0].run;
    for (const selection of ['success', 'failure', 'cancelled', 'skipped']) {
      for (const verification of ['success', 'failure', 'cancelled', 'skipped']) {
        for (const mode of ['affected', 'daily', 'invalid', '']) {
          for (const isolation of ['success', 'failure', 'cancelled', 'skipped', '']) {
            const result = spawnSync('/bin/bash', ['-c', command], { encoding: 'utf8', env: { ...process.env, SELECTION_RESULT: selection, COVERAGE_MODE: mode, VERIFY_RESULT: verification, HOME_ISOLATION_RESULT: isolation } });
            expect(result.status === 0).toBe(selection === 'success' && verification === 'success' && mode === 'affected' && isolation === 'success');
          }
        }
      }
    }
  });

  test('required HOME isolation runs native OAR acceptance only on the exact macOS candidate', () => {
    const job = workflow.jobs['test-home-isolation'];
    expect(job.needs).toBe('selection');
    expect(job.if).toBe("needs.selection.outputs.mode == 'affected' || needs.selection.outputs.mode == 'daily'");
    expect(job['runs-on']).toBe('${{ matrix.os }}');
    expect(job.strategy.matrix.os).toEqual(['ubuntu-latest', 'macos-latest', 'windows-latest']);
    expect(job['continue-on-error']).toBeUndefined();
    expect(job.steps.every((step: any) => step['continue-on-error'] === undefined)).toBe(true);
    expect(job.steps.find((step: any) => step.uses === 'actions/checkout@v4').with).toEqual({
      ref: '${{ needs.selection.outputs.sha }}', 'persist-credentials': false,
    });
    expect(job.steps.find((step: any) => step.uses === 'actions/setup-node@v4').with['node-version']).toBe('24');
    expect(job.steps.some((step: any) => step.uses === 'actions/download-artifact@v4')).toBe(false);
    const install = job.steps.filter((step: any) => step.name === 'Install pinned Herdr runtime');
    expect(install).toHaveLength(1);
    expect(install[0].if).toBe("matrix.os == 'macos-latest'");
    expect(install[0].uses).toBe('./.github/actions/install-pinned-herdr');
    expect(job.steps.indexOf(install[0])).toBeLessThan(job.steps.findIndex((step: any) => step.name === 'Run native OAR acceptance tests'));
    const native = job.steps.filter((step: any) => step.name === 'Run native OAR acceptance tests');
    expect(native).toHaveLength(1);
    expect(native[0].if).toBe("matrix.os == 'macos-latest'");
    expect(native[0].shell).toBe('bash');
    expect(native[0].env).toEqual({ EXPECTED_SHA: '${{ needs.selection.outputs.sha }}' });
    expect(native[0].run.trim().split('\n')).toEqual([
      'set -euo pipefail',
      'test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"',
      `bun -e 'if (process.platform !== "darwin") process.exit(1)'`,
      `node -e 'if (process.platform !== "darwin" || process.versions.bun || !process.versions.node.startsWith("24.")) process.exit(1)'`,
      'test -x /usr/bin/sandbox-exec',
      'bun install --frozen-lockfile',
      'test ! -e dist/oar-review-host.js',
      'test ! -e dist/oar-coding-host.js',
      'bun run build:oar-hosts',
      'test -s dist/oar-review-host.js',
      'test -s dist/oar-coding-host.js',
      'bun run test:files tests/generic-review.test.ts tests/acceptance-receipt.test.ts tests/cli/cross-review.test.ts tests/herdr-task-lifecycle.test.ts --timeout 60000 --max-concurrency 1',
    ]);
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

  test('local base selects committed, staged, unstaged and untracked changes with removed import edges', () => {
    const repo = mkdtempSync(join(tmpdir(), 'rh-ci-local-selection-'));
    const git = (...args: string[]) => {
      const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      if (result.status !== 0) throw Error(result.stderr);
      return result.stdout.trim();
    };
    const write = (path: string, content: string) => {
      mkdirSync(resolve(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), content);
    };
    const select = (...args: string[]) => spawnSync(process.execPath, [join(ROOT, 'scripts/select-ci-coverage.ts'), ...args], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_PATH: '', GITHUB_OUTPUT: '' },
    });
    const selected = () => JSON.parse(readFileSync(join(repo, '.ci-affected-tests.json'), 'utf8'));
    try {
      git('init', '-q'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
      for (const name of ['committed', 'staged', 'unstaged', 'deleted']) {
        write(`src/${name}.ts`, 'export const value=1;');
        write(`tests/${name}.test.ts`, `import { value } from '../src/${name}';`);
      }
      write('src/deleted-consumer.ts', "import { value } from './deleted'; export { value };");
      write('tests/deleted.test.ts', "import { value } from '../src/deleted-consumer';");
      git('add', '.'); git('commit', '-qm', 'base');
      git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
      expect(select('--base', 'origin/main').status).toBe(0);
      expect(selected()).toEqual([]);
      write('src/committed.ts', 'export const value=2;'); git('add', 'src/committed.ts'); git('commit', '-qm', 'candidate');
      write('src/staged.ts', 'export const value=2;'); git('add', 'src/staged.ts');
      write('src/unstaged.ts', 'export const value=2;');
      git('rm', '-q', 'src/deleted.ts'); write('src/deleted-consumer.ts', 'export const value=2;');
      write('src/untracked.ts', 'export const value=1;');
      write('tests/untracked.test.ts', "import { value } from '../src/untracked';");
      const result = select('--base', 'origin/main');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('mode=affected');
      expect(selected()).toEqual(['tests/committed.test.ts', 'tests/deleted.test.ts', 'tests/staged.test.ts', 'tests/unstaged.test.ts', 'tests/untracked.test.ts']);
      expect(select('--base', 'origin/main').status).toBe(0);
      write('unknown/product.conf', 'unknown');
      const unknown = select('--base', 'origin/main');
      expect(unknown.status).not.toBe(0); expect(unknown.stderr).toContain('coverage is unknown');
      expect(select('--base', 'missing-ref').status).not.toBe(0);
      expect(select('--base').status).not.toBe(0);
      expect(select('--base', 'origin/main', '--extra').status).not.toBe(0);
      write('tests/invalid\nname.test.ts', 'export {};');
      expect(select('--base', 'origin/main').stderr).toContain('invalid-diff');
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  test('local affected shell rejects invalid base arguments before running a gate', () => {
    for (const args of [['affected', '--base'], ['all', '--base', 'origin/main'], ['affected', '--base', '--bad'], ['affected', '--base', 'origin/main', '--extra']]) {
      const result = spawnSync('/bin/bash', [join(ROOT, 'scripts/check-ci.sh'), ...args], { encoding: 'utf8' });
      expect(result.status).toBe(2); expect(result.stderr).toContain('Usage:');
      expect(result.stdout).not.toContain('[ci] install');
    }
  });
});
