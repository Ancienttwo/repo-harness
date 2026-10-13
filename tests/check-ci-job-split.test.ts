import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectAffectedTests, selectCoverage } from '../scripts/select-ci-coverage';
import { architectureWarning, owedCapabilities, owedImplementationPaths, summarizeArchitecture, readArchitectureSummary, ARCHITECTURE_EVIDENCE } from '../scripts/check-ci-architecture';

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

  test('daily native path matrix owns the Windows protected helper contract and Git-layout smoke', () => {
    for (const retired of ['pm-acceptance.yml', 'windows-protected-helper.yml']) {
      expect(existsSync(join(ROOT, '.github/workflows', retired))).toBe(false);
    }
    for (const lane of ['governance', 'test', 'mcp-path-matrix']) {
      expect(workflow.jobs[lane].if).toBe("needs.selection.outputs.mode == 'daily'");
    }
    const job = workflow.jobs['mcp-path-matrix'];
    expect(job['continue-on-error']).toBeUndefined();
    const testFiles = (command: string): string[] => command.match(/tests\/[\w/.-]+\.test\.ts/g) ?? [];
    const matrix = job.steps.find((step: any) => step.name === 'Run the native path tests');
    expect(testFiles(matrix.run)).toContain('tests/unit/windows-protected-helper-platform-contract.test.ts');
    const forced = job.steps.filter((step: any) => step.name === 'Run smoke with each installed internal Git first on PATH');
    expect(forced).toHaveLength(1);
    expect(forced[0].if).toBe("matrix.os == 'windows-latest'");
    expect(forced[0].shell).toBe('bash');
    expect(forced[0].env.REPO_HARNESS_WINDOWS_PROTECTED_HELPER_SMOKE).toBe('1');
    expect(forced[0].run).toContain('for layout in mingw64 ucrt64');
    expect(forced[0].run).toContain('[[ ! -f "$internal/git.exe" ]]');
    expect(forced[0].run).toContain('export PATH="$internal:$PATH"');
    expect(forced[0].run).toContain('test "$tested" -gt 0');
    expect(testFiles(forced[0].run)).toEqual(['tests/cli/windows-protected-helper-runtime-smoke.test.ts']);
    for (const step of job.steps) {
      expect(step['continue-on-error']).toBeUndefined();
      if (step.shell !== 'bash') continue;
      const syntax = spawnSync('/bin/bash', ['-n'], { input: step.run, encoding: 'utf8' });
      expect(syntax.status, syntax.stderr).toBe(0);
    }
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
      'bun run test:files tests/generic-review.test.ts tests/acceptance-receipt.test.ts tests/cli/cross-review.test.ts tests/herdr-task-lifecycle.test.ts tests/cli/pm.test.ts --timeout 60000 --max-concurrency 1',
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


describe('architecture CI delivery', () => {
  test('PR warnings stay outside required checks; daily runs retain complete evidence', () => {
    const job = workflow.jobs.architecture;
    expect(job.if).toBe("needs.selection.outputs.mode == 'affected' || needs.selection.outputs.mode == 'daily'");
    expect(job['continue-on-error']).toBe("${{ needs.selection.outputs.mode == 'affected' }}");
    expect(workflow.jobs.required.needs).not.toContain('architecture');
    expect(job.steps.find((step: any) => step.uses === 'actions/checkout@v4').with).toEqual({
      ref: '${{ needs.selection.outputs.sha }}', 'fetch-depth': 0, 'persist-credentials': false,
    });
    expect(job.steps.find((step: any) => step.run)?.run).toBe('bash scripts/check-ci.sh architecture');
    const upload = job.steps.find((step: any) => step.uses === 'actions/upload-artifact@v4');
    expect(upload.if).toBe("always() && needs.selection.outputs.mode == 'daily'");
    expect(upload.with).toEqual({ name: 'ci-architecture-${{ github.run_attempt }}', path: '.ai/harness/checks/ci-architecture/report.json', 'include-hidden-files': true, 'if-no-files-found': 'error' });
    const shell = readFileSync(join(ROOT, 'scripts/check-ci.sh'), 'utf8');
    expect(shell).toContain('bun scripts/check-ci-architecture.ts');
    expect(shell).not.toContain('architecture-projection check');
    expect(spawnSync('/bin/bash', ['-n', join(ROOT, 'scripts/check-ci.sh')]).status).toBe(0);
  });

  test('only authoritative matches owe capabilities; malformed ownership fails', () => {
    const matched = { matched: true, capability_id: 'capability.test.core', file_path: 'src/main.ts' };
    expect(owedCapabilities([matched, matched, { matched: false, capability_id: 'root', file_path: 'README.md' }])).toEqual(['capability.test.core']);
    expect(owedCapabilities([])).toEqual([]);
    expect(() => owedCapabilities([{ matched: true }])).toThrow('Invalid capability ownership');
  });

  test.each([
    { status: 'noop', files: [], actions: [], row: '| `noop` |' },
    { status: 'planned', files: ['docs/architecture/.projection-manifest.json'], actions: [], row: '| `planned`, only ' },
    { status: 'planned', files: ['docs/architecture/index.md'], actions: [], row: '| `planned`, other ' },
    { status: 'human-action-required', files: [], actions: [{ reasonCode: 'unresolved-major-change' }], row: '| `human-action-required` with ' },
    { status: 'human-action-required', files: [], actions: [{ reasonCode: 'unprovable-required-flow' }], row: '| Other `humanActions`' },
    { status: 'blocked', files: [], actions: [], row: '| Command error,' },
  ])('provider status $status copies its exact action row and keeps stale ids', ({ status, files, actions, row }) => {
    const reference = readFileSync(join(ROOT, ARCHITECTURE_EVIDENCE), 'utf8');
    const summary = summarizeArchitecture({ status, freshness: { staleNodes: [{ nodeId: 'capability.test.core' }] }, files: files.map(path => ({ path })), humanActions: actions }, sha, 2, reference);
    expect(summary.actionRows).toEqual([reference.split('\n').find(line => line.startsWith(row))!]);
    expect(summary.staleNodes).toEqual(['capability.test.core']);
    expect(readArchitectureSummary(summary, sha, 2)).toEqual(summary);
    expect(() => readArchitectureSummary(summary, sha, 1)).toThrow('SHA and attempt');
    expect(() => readArchitectureSummary(summary, '2'.repeat(40), 2)).toThrow('SHA and attempt');
    const warning = architectureWarning(summary, ['capability.test.core']);
    if (status === 'noop') expect(warning).toBeNull();
    else {
      expect(warning).toContain('::warning::');
      expect(warning).toContain('capability.test.core');
      expect(warning).toContain('repo-harness architecture-projection apply --json');
    }
  });

  test('malformed projection cannot synthesize an empty successful report; warnings cannot inject commands', () => {
    const reference = readFileSync(join(ROOT, ARCHITECTURE_EVIDENCE), 'utf8');
    expect(() => summarizeArchitecture({ status: 'noop' }, sha, 1, reference)).toThrow('Invalid architecture');
    const summary = summarizeArchitecture({ status: 'planned', freshness: { staleNodes: [{ nodeId: 'capability.test%\n::error::injected' }] }, files: [], humanActions: [] }, sha, 1, reference);
    const warning = architectureWarning(summary, [])!;
    expect(warning).toContain('%25%0A::error::injected');
    expect(warning.split('\n')).toHaveLength(1);
  });
});


test('owed paths follow the real PR diff after the latest manifest commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'rh-ci-owed-paths-'));
  const original = process.cwd();
  const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const commit = (message: string) => { expect(git('add', '.').status).toBe(0); expect(git('commit', '-qm', message).status).toBe(0); return git('rev-parse', 'HEAD').stdout.trim(); };
  try {
    expect(git('init', '-q').status).toBe(0);
    git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
    mkdirSync(join(root, 'src')); mkdirSync(join(root, 'docs/architecture'), { recursive: true });
    writeFileSync(join(root, 'src/feature.ts'), 'export const value=1;');
    writeFileSync(join(root, 'docs/architecture/.projection-manifest.json'), '{}');
    const base = commit('base'); process.chdir(root);
    writeFileSync(join(root, 'src/feature.ts'), 'export const value=2;');
    const source = commit('source');
    expect(owedImplementationPaths(base, source)).toEqual(['src/feature.ts']);
    writeFileSync(join(root, 'docs/architecture/.projection-manifest.json'), '{"updated":true}');
    const manifest = commit('manifest');
    expect(owedImplementationPaths(base, manifest)).toEqual([]);
    writeFileSync(join(root, 'src/feature.ts'), 'export const value=3;');
    const later = commit('later source');
    expect(owedImplementationPaths(base, later)).toEqual(['src/feature.ts']);
    writeFileSync(join(root, 'docs/guide.md'), '# Guide');
    expect(owedImplementationPaths(base, later, true)).toEqual(['src/feature.ts']);
    expect(() => owedImplementationPaths('invalid', later)).toThrow('Invalid architecture diff');
  } finally { process.chdir(original); rmSync(root, { recursive: true, force: true }); }
});

test('failure results with no freshness preserve unavailable data', () => {
  const summary = summarizeArchitecture({ status: 'blocked', files: [], humanActions: [] }, sha, 1, readFileSync(join(ROOT, ARCHITECTURE_EVIDENCE), 'utf8'));
  expect(summary.staleNodes).toBeNull();
  expect(architectureWarning(summary, [])).toContain('Stale nodes: unavailable');
});
