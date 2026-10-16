import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeAffectedTests, bundleInputPaths, discoverPlatformInputs, platformImportClosure, selectAffectedTests, selectCoverage, selectPlatformCoverage } from '../scripts/select-ci-coverage';
import { auditDroppedTests } from '../scripts/ci-edge-audit';
import { replayNeedsSource } from '../scripts/replay-ci-coverage';
import { ARCHITECTURE_JOB, ARCHITECTURE_SUMMARY_PATH } from '../scripts/report-ci';

const ROOT = resolve(import.meta.dir, '..');
const workflow = Bun.YAML.parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as any;
const sha = '1'.repeat(40);
const input = { eventName: 'pull_request', event: { pull_request: { draft: true, base: { sha } } }, headSha: sha, actualHead: sha };

function writePlatformFixture(write: (path: string, content: string) => void) {
  write('.github/workflows/ci.yml', `jobs:
  home-isolation:
    steps:
      - name: Run the isolation tests
        run: run_bun_test_file tests/home.test.ts
  native-oar:
    steps:
      - name: Run native OAR acceptance tests
        run: bun run test:files tests/native.test.ts
`);
  write('bunfig.toml', '[test]\npreload = ["./tests/preload.ts"]\n');
  write('tests/preload.ts', 'export {};');
  write('tests/home.test.ts', 'export {};');
  write('tests/native.test.ts', 'export {};');
  write('src/host.ts', 'export {};');
  write('package.json', JSON.stringify({ scripts: {
    'build:oar-review-host': 'bun build src/host.ts --target=node --format=esm --packages=external',
    'build:oar-coding-host': 'bun build src/host.ts --target=node --format=esm --packages=external',
  } }));
}

const record = `:100644 100644 ${sha} ${sha} M\0src/feature.ts\0`;

describe('single affected verification and daily fallback', () => {
  test('path values exclude words, comments and target-repository paths but keep anchored reads', async () => {
    const sources = new Map([
      ['assets/item.json', '{}'],
      ['src/words.ts', "export const command = 'assets'; // 'assets/item.json'"],
      ['src/target.ts', "export const target = join(process.cwd(), 'assets/item.json');"],
      ['src/reader.ts', "const ROOT = join(import.meta.dir, '..'); readFileSync(join(ROOT, 'assets', name));"],
      ['tests/words.test.ts', "import '../src/words';"],
      ['tests/target.test.ts', "import '../src/target';"],
      ['src/template.ts', "const ROOT = join(import.meta.dir, '..'); readFileSync(`${ROOT}/assets/item.json`);"],
      ['tests/template.test.ts', "import '../src/template';"],
      ['tests/reader.test.ts', "import '../src/reader';"],
      ['tests/list.test.ts', "const ROOT = join(import.meta.dir, '..'); readdirSync(join(ROOT, 'assets'));"],
    ]);
    expect(await selectAffectedTests(['assets/item.json'], sources, [])).toEqual(['tests/list.test.ts', 'tests/reader.test.ts', 'tests/template.test.ts']);
  });

  test('directory content edges apply to direct changes while execution edges propagate', async () => {
    const sources = new Map([
      ['src/base.ts', 'export const value = 1'],
      ['src/copied/entry.ts', "import '../base';"],
      ['tests/wrapper.test.ts', "const launch = (paths: string[]) => spawnSync('bun', paths); launch(['src/copied']);"],
      ['tests/read.test.ts', "readFileSync(join(ROOT, 'src/copied'));"],
      ['tests/execute.test.ts', "import { spawnSync as launch } from 'node:child_process'; launch('bun', ['src/copied']);"],
    ]);
    expect(await selectAffectedTests(['src/base.ts'], sources, [])).toEqual(['tests/execute.test.ts', 'tests/wrapper.test.ts']);
    expect(await selectAffectedTests(['src/copied/entry.ts'], sources, [])).toEqual(['tests/execute.test.ts', 'tests/read.test.ts', 'tests/wrapper.test.ts']);
  });

  test('directory construction is not a read but passing it to a helper keeps coverage', async () => {
    const sources = new Map([
      ['scripts/smoke.sh', 'echo ok'],
      ['scripts/paths.ts', "const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url)); const ROOT = join(SCRIPT_DIR, '..'); export const name = basename(SCRIPT_DIR);"],
      ['tests/paths.test.ts', "import '../scripts/paths';"],
      ['tests/read.test.ts', "const DIR = join(import.meta.dir, '..', 'scripts'); consumeDirectory(DIR);"],
      ['tests/options.test.ts', "const DIR = join(import.meta.dir, '..', 'scripts'); const options = { directory: DIR }; consumeDirectory({...options});"],
    ]);
    expect(await selectAffectedTests(['scripts/smoke.sh'], sources, [])).toEqual(['tests/options.test.ts', 'tests/read.test.ts']);
  });

  test('keeps the real setup fleet consumer and exported directory roots', async () => {
    const sources = new Map([
      ['agents/fleet/example.md', '# Role'],
      ['src/cli/commands/setup-snapshot.ts', readFileSync(join(ROOT, 'src/cli/commands/setup-snapshot.ts'), 'utf8')],
      ['tests/fleet.test.ts', "import { readFleetRoles } from '../src/cli/commands/setup-snapshot'; readFleetRoles();"],
      ['src/root.ts', "const DIR = join(import.meta.dir, '../agents/fleet'); export { DIR };"],
      ['tests/export.test.ts', "import { DIR } from '../src/root'; consume(DIR);"],
      ['src/default.ts', "const DIR = join(import.meta.dir, '../agents/fleet'); function read(directory = DIR) { return readdirSync(directory); } export function run(value) { return read(value); }"],
      ['tests/default.test.ts', "import '../src/default';"],
    ]);
    expect(await selectAffectedTests(['agents/fleet/example.md'], sources, [])).toEqual(['tests/default.test.ts', 'tests/export.test.ts', 'tests/fleet.test.ts']);
  });

  test('retains directories returned by the real canonical ChatGPT skill source', async () => {
    const sources = new Map([
      ['assets/skills/repo-harness-chatgpt/SKILL.md', '# Skill'],
      ['src/cli/chatgpt-skill/source.ts', readFileSync(join(ROOT, 'src/cli/chatgpt-skill/source.ts'), 'utf8')],
      ['tests/skill-root.test.ts', "import '../src/cli/chatgpt-skill/source';"],
    ]);
    expect(await selectAffectedTests(['assets/skills/repo-harness-chatgpt/SKILL.md'], sources, [])).toEqual(['tests/skill-root.test.ts']);
  });

  test('path transformations retain directories passed through returned or exported values', async () => {
    const sources = new Map([
      ['assets/file.json', '{}'],
      ['src/url.ts', "const DIR = join(import.meta.dir, '../assets'); export const url = pathToFileURL(DIR);"],
      ['src/normalized.ts', "const DIR = join(import.meta.dir, '../assets'); export const root = () => normalize(DIR);"],
      ['src/relative.ts', "const DIR = join(import.meta.dir, '../assets'); export const root = relative(process.cwd(), DIR);"],
      ['tests/url.test.ts', "import '../src/url';"],
      ['tests/normalized.test.ts', "import '../src/normalized';"],
      ['tests/relative.test.ts', "import '../src/relative';"],
    ]);
    expect(await selectAffectedTests(['assets/file.json'], sources, [])).toEqual(['tests/normalized.test.ts', 'tests/relative.test.ts', 'tests/url.test.ts']);
  });

  test('retains imports in executable templates and variable dynamic imports', async () => {
    const sources = new Map([
      ['src/feature.ts', 'export {}'],
      ['assets/templates/helper.ts', "import '../../src/feature';"],
      ['src/dynamic.ts', "const modulePath = './feature'; export const load = () => import(modulePath);"],
      ['tests/template.test.ts', "import '../assets/templates/helper';"],
      ['tests/dynamic.test.ts', "import '../src/dynamic';"],
    ]);
    expect(await selectAffectedTests(['src/feature.ts'], sources, [])).toEqual(['tests/dynamic.test.ts', 'tests/template.test.ts']);
  });

  test('removed-edge audit checks competing baseline paths instead of accepting one harmless witness', async () => {
    const root = 'src/input.ts', test = 'tests/final.test.ts';
    const baseline = new Map([
      [root, new Set(['tests/comment.ts', 'tests/reader.ts'])],
      ['tests/comment.ts', new Set([test])], ['tests/reader.ts', new Set([test])],
    ]);
    const reverse = new Map([...baseline].filter(([file]) => file !== root));
    const sources = new Map([
      [root, 'export {}'], ['tests/comment.ts', "// 'src/input.ts'"],
      ['tests/reader.ts', "readFileSync('../src/input.ts');"], [test, "import './comment'; import './reader';"],
    ]);
    const audit = await auditDroppedTests([root], [test], baseline, { reverse, data: new Map() }, sources, new Map());
    expect(audit.witnesses[0]!.reason).toBe('comment-not-code');
    expect(audit.edges).toContainEqual({ dependency: root, consumer: 'tests/reader.ts', reason: 'unclassified' });
    const kept = await auditDroppedTests([root], [test], baseline, { reverse, data: new Map([[root, new Set(['tests/comment.ts'])]]) }, sources, new Map());
    expect(kept.witnesses[0]!.reason).toBe('unclassified');
  });

  test('edge evidence distinguishes compiler comments and string inspection from reads', async () => {
    const root = 'scripts/tool.ts', test = 'tests/final.test.ts';
    const consumers = new Map([
      ['src/comment.ts', '/** `scripts/` describes a boundary. */\nexport {};'],
      ['src/inspect.ts', "const root = import.meta.url; export const check = (path: string) => path.startsWith('scripts/') && path.length > 'scripts/'.length;"],
      ['src/read.ts', "const root = import.meta.url; readFileSync('scripts/'); // real read"],
      ['src/string.ts', 'const root = import.meta.url; const text = "// \'scripts/\'";'],
    ]);
    const baseline = new Map([[root, new Set(consumers.keys())], ...[...consumers.keys()].map(file => [file, new Set([test])] as const)]);
    const audit = await auditDroppedTests([root], [test], baseline, { reverse: new Map(), data: new Map() }, consumers, new Map());
    expect(audit.edges.find(edge => edge.consumer === 'src/comment.ts')?.reason).toBe('comment-not-code');
    expect(audit.edges.find(edge => edge.consumer === 'src/inspect.ts')?.reason).toBe('string-length-only+string-predicate-argument');
    expect(audit.edges.find(edge => edge.consumer === 'src/read.ts')?.reason).toBe('unclassified');
    expect(audit.edges.find(edge => edge.consumer === 'src/string.ts')?.reason).toBe('unclassified');
  });

  test('deleted paths retain old imports and only entirely retired closures need no test', async () => {
    await expect(selectAffectedTests(['src/standalone.ts'], new Map(), [], new Map([['src/standalone.ts', 'export {}']]))).rejects.toThrow('coverage is unknown');
    const old = new Map([['src/gone.ts', 'export const value = 1'], ['tests/gone.test.ts', "import '../src/gone';"]]);
    expect(await selectAffectedTests(['src/gone.ts', 'tests/gone.test.ts'], new Map(), [], old)).toEqual([]);
    const sources = new Map([['src/live.ts', 'export {}'], ['tests/live.test.ts', "import '../src/live';"]]);
    const previous = new Map([...old, ['src/live.ts', "import './gone';"]]);
    expect(await selectAffectedTests(['src/gone.ts', 'src/live.ts'], sources, [], previous)).toEqual(['tests/live.test.ts']);
    await expect(selectAffectedTests(['unknown/new.ts'], sources, [])).rejects.toThrow('coverage is unknown');
  });

  test('dependency manifests select every test without hiding another unknown path', async () => {
    const sources = new Map([['tests/a.test.ts', 'export {}'], ['tests/b.test.ts', 'export {}']]);
    for (const path of ['package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json']) {
      expect(await selectAffectedTests([path], sources, [])).toEqual(['tests/a.test.ts', 'tests/b.test.ts']);
    }
    await expect(selectAffectedTests(['bun.lock', 'unknown/new.ts'], sources, [])).rejects.toThrow('coverage is unknown');
  });

  test('test preloads, their imports and the CI test runner select every test', async () => {
    const sources = new Map([
      ['bunfig.toml', '[test]\npreload = ["./tests/preload.ts"]'],
      ['tests/preload.ts', "import '../scripts/lib/iso.mjs';"],
      ['scripts/lib/iso.mjs', 'export {}'],
      ['scripts/lib/ci-run-tests.sh', '#!/usr/bin/env bash'],
      ['tests/a.test.ts', 'export {}'],
      ['tests/b.test.ts', 'export {}'],
    ]);
    for (const path of ['tests/preload.ts', 'scripts/lib/iso.mjs', 'scripts/lib/ci-run-tests.sh']) {
      expect(await selectAffectedTests([path], sources, [])).toEqual(['tests/a.test.ts', 'tests/b.test.ts']);
      expect((await analyzeAffectedTests([path], sources, [])).fullReasons).toEqual([path]);
    }
    await expect(selectAffectedTests(['tests/preload.ts', 'unknown/new.ts'], sources, [])).rejects.toThrow('coverage is unknown');
  });

  test('exact complete diff is required, including draft candidates', () => {
    expect(selectCoverage({ ...input, diffRaw: record })).toEqual({ mode: 'affected', reason: 'complete-diff', paths: ['src/feature.ts'] });
    for (const diffRaw of [null, '', record.slice(0, -1), record + '\0', record.replace(' M\0', ' R100\0'), record.replace(sha, 'bad'), record.replace('src/feature.ts', 'src/../feature.ts')]) {
      expect(selectCoverage({ ...input, diffRaw }).mode).toBe('invalid');
    }
    expect(selectCoverage({ ...input, actualHead: '2'.repeat(40), diffRaw: record }).mode).toBe('invalid');
    expect(selectCoverage({ ...input, eventName: 'schedule', diffRaw: null }).mode).toBe('daily');
    expect(selectCoverage({ ...input, eventName: 'push', event: { before: sha }, diffRaw: record }).mode).toBe('report');
  });

  test('real dependency and runtime consumers expand transitively; unknown coverage fails instead of full-suite', async () => {
    const sources = new Map([
      ['src/core/feature.ts', 'export const feature = 1'],
      ['src/effects/feature.ts', "import { feature } from '../core/feature'; export const result = feature"],
      ['tests/unit/feature.test.ts', "import { result } from '../../src/effects/feature';"],
      ['src/cli/index.ts', "import { result } from '../effects/feature';"],
      ['tests/cli/consumer.test.ts', "const CLI = join(ROOT, 'src/cli/index.ts'); spawnSync('bun', [CLI]);"],
      ['tests/unrelated.test.ts', "import { other } from '../src/other';"],
    ]);
    expect(await selectAffectedTests(['src/core/feature.ts'], sources, [])).toEqual(['tests/cli/consumer.test.ts', 'tests/unit/feature.test.ts']);
    expect(await selectAffectedTests(['tests/unrelated.test.ts'], sources, [])).toEqual(['tests/unrelated.test.ts']);
    expect(await selectAffectedTests(['docs/researches/observation.md'], sources, [])).toEqual([]);
    expect(await selectAffectedTests(['DEBUG.md', 'examples/agent-architecture.md'], sources, [])).toEqual([]);
    await expect(selectAffectedTests(['unknown/product.conf'], sources, [])).rejects.toThrow('coverage is unknown');
    const hub = new Map([...sources, ['tests/docs.test.ts', 'export {}'], ['src/core/feature.ts', "export const targetFiles = ['plans', 'docs/guide.md']; export const feature = 1"]]);
    expect(await selectAffectedTests(['plans/plan.md', 'docs/guide.md'], hub, ['tests/docs.test.ts'])).toEqual(['tests/docs.test.ts']);
    expect(await selectAffectedTests(['docs/guide.md', 'src/core/feature.ts'], hub, ['tests/docs.test.ts'])).toEqual(['tests/cli/consumer.test.ts', 'tests/docs.test.ts', 'tests/unit/feature.test.ts']);
    expect(await selectAffectedTests(['src/core/deleted.ts'], new Map([...sources, ['src/core/deleted.ts', 'export const feature=1'], ['src/effects/feature.ts', "// old imported edge kept for this diff\nimport { feature } from '../core/deleted';"]]), [])).toEqual(['tests/cli/consumer.test.ts', 'tests/unit/feature.test.ts']);
  });

  test('private pstack files select their real isolated test owner without granting a prefix exemption', async () => {
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
    expect(await selectAffectedTests(files, sources, [])).toEqual([owner]);
    for (const file of files) expect(await selectAffectedTests([file], sources, [])).toEqual([owner]);
    sources.delete(owner);
    await expect(selectAffectedTests([`${prefix}vendor/policy.ts`], sources, [])).rejects.toThrow('coverage is unknown');
    sources.set(owner, readFileSync(join(ROOT, owner), 'utf8'));
    for (const path of ['experiments/private/unregistered/runner.ts', 'experiments/public/runner.ts', 'unknown/product.conf']) {
      await expect(selectAffectedTests([path], sources, [])).rejects.toThrow('coverage is unknown');
    }
  });

  test('canonical changelog uses the docs policy and keeps real consumer coverage', async () => {
    expect(await selectAffectedTests(['docs/CHANGELOG.md'], new Map(), [])).toEqual([]);
    const sources = new Map([
      ['tests/release-notes.test.ts', "readFileSync('docs/CHANGELOG.md');"],
    ]);
    expect(await selectAffectedTests(['docs/CHANGELOG.md'], sources, ['tests/release-notes.test.ts'])).toEqual(['tests/release-notes.test.ts']);
    for (const path of ['CHANGELOG.md', 'RELEASE.md', 'release/CHANGELOG.md', 'unknown/product.conf']) {
      await expect(selectAffectedTests([path], new Map(), [])).rejects.toThrow('coverage is unknown');
    }
  });

  test('workflow confines full and matrix jobs to fixed main daily snapshots', () => {
    const { jobs } = workflow;
    expect(workflow.on.schedule).toEqual([{ cron: '0 19 * * *' }]);
    expect(jobs.required.name).toBe('Required / CI');
    expect(jobs.required.needs).toEqual(['selection', 'verify', 'home-isolation', 'native-oar']);
    expect(jobs.verify.if).toBe("needs.selection.outputs.mode == 'affected'");
    const affected = jobs.verify.steps.find((step: any) => step.run === 'bash scripts/check-ci.sh affected');
    const total = Number(/^\$\{\{ matrix\.shard \}\}\/(\d+)$/.exec(affected.env.CI_SHARD)![1]);
    expect(jobs.verify.strategy).toEqual({ 'fail-fast': false, matrix: { shard: Array.from({ length: total }, (_, index) => index) } });
    expect(total).toBeGreaterThan(1);
    const upload = jobs.selection.steps.find((step: any) => step.uses === 'actions/upload-artifact@v4');
    expect(upload.with.path).toBe('.ci-affected-tests.json');
    expect(upload.with['include-hidden-files']).toBe(true);
    expect(upload.with['if-no-files-found']).toBe('error');
    for (const id of ['governance', 'architecture', 'test', 'mcp-path-matrix']) {
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
    for (const lane of ['governance', 'architecture', 'test', 'mcp-path-matrix']) {
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
    const run = (selection: string, verification: string, mode: string, home: string, native: string, homeFlag: string, nativeFlag: string) =>
      spawnSync('/bin/bash', ['-c', command], { encoding: 'utf8', env: { ...process.env,
        SELECTION_RESULT: selection, COVERAGE_MODE: mode, VERIFY_RESULT: verification,
        HOME_ISOLATION_RESULT: home, NATIVE_OAR_RESULT: native, HOME_ISOLATION: homeFlag, NATIVE_OAR: nativeFlag,
      } }).status;
    for (const selection of ['success', 'failure', 'cancelled', 'skipped']) {
      for (const verification of ['success', 'failure', 'cancelled', 'skipped']) {
        for (const mode of ['affected', 'daily', 'invalid', '']) {
          expect(run(selection, verification, mode, 'success', 'success', 'true', 'true') === 0)
            .toBe(selection === 'success' && verification === 'success' && mode === 'affected');
        }
      }
    }
    for (const home of ['success', 'failure', 'cancelled', 'skipped', '']) {
      for (const native of ['success', 'failure', 'cancelled', 'skipped', '']) {
        for (const homeFlag of ['true', 'false', '']) {
          for (const nativeFlag of ['true', 'false', '']) {
            expect(run('success', 'success', 'affected', home, native, homeFlag, nativeFlag) === 0).toBe(
              (home === 'success' || (homeFlag === 'false' && home === 'skipped'))
              && (native === 'success' || (nativeFlag === 'false' && native === 'skipped')));
          }
        }
      }
    }
  });

  test('platform triggers use bundle inputs, full test import closures and configured preloads', () => {
    const sources = new Map([
      ['tests/native.test.ts', "import './helpers/native'; import '../src/other';"],
      ['tests/helpers/native.ts', "import './nested';"], ['tests/helpers/nested.ts', 'export {};'],
      ['tests/home.test.ts', "import '../src/home';"], ['src/home.ts', "import './nested';"],
      ['src/nested.ts', 'export {};'], ['src/other.ts', "import './deep'; import schema from '../assets/schema.json';"], ['src/deep.ts', 'export {};'],
      ['assets/schema.json', '{ "type": "object", "properties": {} }'],
      ['src/unrelated.ts', 'export {};'], ['tests/preload.ts', 'export {};'],
    ]);
    const native = platformImportClosure(['tests/native.test.ts', 'tests/preload.ts'], sources);
    for (const path of bundleInputPaths({ inputs: { 'src/host.ts': {}, './src/host-dependency.ts': {} } })) native.add(path);
    const home = platformImportClosure(['tests/home.test.ts', 'tests/preload.ts'], sources);
    const inputs = { native, home };
    for (const path of ['.github/actions/install/action.yml', 'package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json', 'scripts/check-ci.sh', 'scripts/lib/test-home-isolation.mjs', 'scripts/select-ci-coverage.ts']) {
      expect(selectPlatformCoverage([path], inputs)).toEqual({ native_oar: true, home_isolation: true });
    }
    for (const path of ['src/host.ts', 'src/host-dependency.ts', 'scripts/contract-worktree.sh', 'tests/native.test.ts', 'tests/helpers/nested.ts']) {
      expect(selectPlatformCoverage([path], inputs)).toEqual({ native_oar: true, home_isolation: false });
    }
    expect(selectPlatformCoverage(['.ai/harness/policy.json'], inputs)).toEqual({ native_oar: true, home_isolation: false });
    // A src module imported only by a native test root, directly or transitively, triggers the native lane.
    for (const path of ['src/other.ts', 'src/deep.ts', 'assets/schema.json']) {
      expect(selectPlatformCoverage([path], inputs)).toEqual({ native_oar: true, home_isolation: false });
    }
    expect(selectPlatformCoverage(['src/nested.ts'], inputs)).toEqual({ native_oar: false, home_isolation: true });
    expect(selectPlatformCoverage(['tests/preload.ts'], inputs)).toEqual({ native_oar: true, home_isolation: true });
    expect(selectPlatformCoverage(['docs/guide.md', 'plans/plan.md', 'src/unrelated.ts'], inputs)).toEqual({ native_oar: false, home_isolation: false });
    expect(() => bundleInputPaths({ inputs: {} })).toThrow('missing');
    expect(() => bundleInputPaths({ inputs: { '../outside.ts': {} } })).toThrow('Invalid');
    expect(() => platformImportClosure(['tests/missing.ts'], sources)).toThrow('requires source');
    expect(() => platformImportClosure(['tests/broken.ts'], new Map([['tests/broken.ts', "import './missing';"]]))).toThrow('Unresolved');
    expect(() => discoverPlatformInputs(new Map())).toThrow('Platform coverage requires');
  });

  test('separate platform jobs run on their trigger flags and keep exact candidate checks', () => {
    const home = workflow.jobs['home-isolation'];
    expect(home.if).toBe("needs.selection.outputs.mode == 'daily' || (needs.selection.outputs.mode == 'affected' && needs.selection.outputs.home_isolation != 'false')");
    expect(home['runs-on']).toBe('${{ matrix.os }}');
    expect(home.strategy.matrix.os).toEqual(['ubuntu-latest', 'macos-latest', 'windows-latest']);
    expect(home.steps.some((step: any) => step.name === 'Run native OAR acceptance tests')).toBe(false);
    expect(home.steps.some((step: any) => step.name === 'Run the isolation tests')).toBe(true);
    const job = workflow.jobs['native-oar'];
    expect(job.needs).toBe('selection');
    expect(job.if).toBe("needs.selection.outputs.mode == 'daily' || (needs.selection.outputs.mode == 'affected' && needs.selection.outputs.native_oar != 'false')");
    expect(workflow.jobs.selection.outputs.native_oar).toBe('${{ steps.select.outputs.native_oar }}');
    expect(workflow.jobs.selection.outputs.home_isolation).toBe('${{ steps.select.outputs.home_isolation }}');
    expect(workflow.jobs.selection.outputs.documentation).toBeUndefined();
    expect(workflow.jobs.required.steps[0].env.NATIVE_OAR).toBe('${{ needs.selection.outputs.native_oar }}');
    expect(workflow.jobs.required.steps[0].env.HOME_ISOLATION).toBe('${{ needs.selection.outputs.home_isolation }}');
    expect(job['runs-on']).toBe('macos-latest');
    expect(job['continue-on-error']).toBeUndefined();
    expect(job.steps.every((step: any) => step['continue-on-error'] === undefined)).toBe(true);
    expect(job.steps.find((step: any) => step.uses === 'actions/checkout@v4').with).toEqual({
      ref: '${{ needs.selection.outputs.sha }}', 'persist-credentials': false,
    });
    expect(job.steps.find((step: any) => step.uses === 'actions/setup-node@v4').with['node-version']).toBe('24');
    expect(job.steps.some((step: any) => step.uses === 'actions/download-artifact@v4')).toBe(false);
    const install = job.steps.filter((step: any) => step.name === 'Install pinned Herdr runtime');
    expect(install).toHaveLength(1);
    expect(install[0].if).toBeUndefined();
    expect(install[0].uses).toBe('./.github/actions/install-pinned-herdr');
    expect(job.steps.indexOf(install[0])).toBeLessThan(job.steps.findIndex((step: any) => step.name === 'Run native OAR acceptance tests'));
    const native = job.steps.filter((step: any) => step.name === 'Run native OAR acceptance tests');
    expect(native).toHaveLength(1);
    expect(native[0].if).toBeUndefined();
    expect(native[0].shell).toBe('bash');
    expect(native[0].env).toEqual({ EXPECTED_SHA: '${{ needs.selection.outputs.sha }}', MODE: '${{ needs.selection.outputs.mode }}' });
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
      'case "$MODE" in',
      "  affected) set -- -t 'darwin: ' ;;",
      '  daily) set -- ;;',
      '  *) echo "Unknown coverage mode: $MODE" >&2; exit 1 ;;',
      'esac',
      'bun run test:files tests/generic-review.test.ts tests/acceptance-receipt.test.ts tests/herdr-task-lifecycle.test.ts tests/cli/pm.test.ts "$@" --timeout 60000 --max-concurrency 1',
    ]);
    // A PR runs only the darwin cases; the daily run keeps every native case. The filesystem probe step is gone.
    expect(job.steps.map((step: any) => step.name ?? step.uses)).toEqual([
      'actions/checkout@v4', 'actions/setup-node@v4', 'oven-sh/setup-bun@v2', 'Install pinned Herdr runtime', 'Run native OAR acceptance tests',
    ]);
  });

  test('selector uses actual complete Git PR diff and outputs selected files', () => {
    const repo = mkdtempSync(join(tmpdir(), 'rh-ci-selection-'));
    const git = (...args: string[]) => { const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); if (result.status !== 0) throw Error(result.stderr); return result.stdout.trim(); };
    const write = (path: string, content: string) => { mkdirSync(resolve(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), content); };
    try {
      writePlatformFixture(write);
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
      expect(readFileSync(output, 'utf8')).toBe(`mode=affected\nsha=${head}\nnative_oar=false\nhome_isolation=false\n`);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  test('documentation-only PR selects scanned checkout consumers and reports both platform skips', () => {
    const repo = mkdtempSync(join(tmpdir(), 'rh-ci-documentation-selection-'));
    const git = (...args: string[]) => { const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); if (result.status !== 0) throw Error(result.stderr); return result.stdout.trim(); };
    const write = (path: string, content: string) => { mkdirSync(resolve(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), content); };
    try {
      writePlatformFixture(write);
      git('init', '-q'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
      write('tsconfig.json', JSON.stringify({ compilerOptions: { noEmit: true }, include: ['src/**/*.ts', 'tests/**/*.ts'] }));
      write('docs/guide.md', '# Guide');
      write('src/feature.ts', "export const targetDirectories = ['docs', 'plans'];");
      write('tests/feature.test.ts', "import { targetDirectories } from '../src/feature';");
      write('tests/guide.test.ts', "import { join } from 'node:path'; import { readFileSync } from 'node:fs'; const ROOT = join(import.meta.dir, '..'); readFileSync(join(ROOT, 'docs/guide.md'));");
      git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
      write('docs/guide.md', '# Changed guide'); write('plans/plan.md', '# Plan'); git('add', '.'); git('commit', '-qm', 'candidate'); const head = git('rev-parse', 'HEAD');
      const event = join(repo, '.git/event.json'); const output = join(repo, '.git/output');
      writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: base } } })); writeFileSync(output, '');
      const result = spawnSync(process.execPath, [join(ROOT, 'scripts/select-ci-coverage.ts')], { cwd: repo, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_SHA: head } });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(readFileSync(join(repo, '.ci-affected-tests.json'), 'utf8'))).toEqual(['tests/guide.test.ts']);
      expect(readFileSync(output, 'utf8')).toBe(`mode=affected\nsha=${head}\nnative_oar=false\nhome_isolation=false\n`);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  }, 60_000);

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
      writePlatformFixture(write);
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
    for (const args of [['affected', '--base'], ['all', '--base', 'origin/main'], ['affected', '--base', '--bad'], ['affected', '--base', 'origin/main', '--extra'],
      ['architecture', '--base', 'origin/main'], ['architecture-advisory'], ['architecture-advisory', '--base']]) {
      const result = spawnSync('/bin/bash', [join(ROOT, 'scripts/check-ci.sh'), ...args], { encoding: 'utf8' });
      expect(result.status).toBe(2); expect(result.stderr).toContain('Usage:');
      expect(result.stdout).not.toContain('[ci] install');
    }
  });

  test('architecture runs as one daily job and one advisory PR job outside the required aggregate', () => {
    const { jobs } = workflow;
    const daily = jobs.architecture;
    expect(daily.name).toBe(ARCHITECTURE_JOB);
    const check = daily.steps.find((step: any) => step.name === 'Check architecture documents');
    expect(check.run).toBe('bash scripts/check-ci.sh architecture');
    expect(check.env.ARCHITECTURE_SUMMARY).toBe('${{ runner.temp }}/architecture/summary.json');
    const upload = daily.steps.find((step: any) => step.uses === 'actions/upload-artifact@v4');
    expect(upload.if).toBe('always()');
    expect(upload.with.name).toBe('architecture-freshness-${{ github.run_attempt }}');
    expect(upload.with.path).toBe(check.env.ARCHITECTURE_SUMMARY);
    expect(daily.steps.indexOf(upload)).toBeGreaterThan(daily.steps.indexOf(check));
    expect(jobs.governance.steps.some((step: any) => step.run === 'bash scripts/check-ci.sh governance')).toBe(true);

    const reporter = Bun.YAML.parse(readFileSync(join(ROOT, '.github/workflows/ci-report.yml'), 'utf8')) as any;
    const download = reporter.jobs.report.steps.find((step: any) => step.uses === 'actions/download-artifact@v4');
    expect(download.with).toEqual({
      pattern: 'architecture-freshness-${{ github.event.workflow_run.run_attempt }}', path: ARCHITECTURE_SUMMARY_PATH.split('/')[0],
      'merge-multiple': true, 'run-id': '${{ github.event.workflow_run.id }}', 'github-token': '${{ github.token }}',
    });
    expect(reporter.jobs.report.permissions).toEqual({ actions: 'read', contents: 'read', issues: 'write' });

    const advisory = jobs['architecture-advisory'];
    expect(advisory.if).toBe("needs.selection.outputs.mode == 'affected'");
    expect(advisory.permissions).toBeUndefined();
    expect(jobs.required.needs).not.toContain('architecture-advisory');
    const warn = advisory.steps.find((step: any) => step.name === 'Warn about owed architecture documents');
    expect(warn.env).toEqual({ BASE_SHA: '${{ github.event.pull_request.base.sha }}' });
    expect(warn.run).toBe('bash scripts/check-ci.sh architecture-advisory --base "$BASE_SHA"');
    expect(advisory.steps.find((step: any) => step.uses === 'actions/checkout@v4').with['fetch-depth']).toBe(0);
  });
});

describe('architecture lanes', () => {
  const owed = (status: string) => JSON.stringify({ protocol: 1, kind: 'repo-harness-owed-capabilities', base: 'base', status,
    capabilities: status === 'owed' ? [{ id: 'workflow-engine-workflow-state', module_document: 'docs/architecture/modules/workflow-engine/workflow-state.md', paths: ['src/core/state/types.ts'] }] : [],
    new_unowned_paths: [], next: [] });
  const planned = JSON.stringify({ status: 'planned', freshness: { staleNodes: [{ nodeId: 'capability.workflow-engine.workflow-state' }, { nodeId: 'capability.verification.evals-checks' }] },
    files: [{ path: 'docs/architecture/.projection-manifest.json' }], humanActions: [] });

  // Real check-ci.sh with stub CLI results. `bun -e` and the shell logic stay real.
  function runLane(args: string[], fixture: { owed?: string; owedExit?: number; check?: string; checkExit?: number; codegraphExit?: number; summary?: boolean }) {
    const root = mkdtempSync(join(tmpdir(), 'rh-ci-architecture-'));
    const bin = join(root, 'bin');
    try {
      mkdirSync(join(root, 'repo/scripts/lib'), { recursive: true }); mkdirSync(bin);
      for (const path of ['scripts/check-ci.sh', 'scripts/lib/ci-run-tests.sh']) writeFileSync(join(root, 'repo', path), readFileSync(join(ROOT, path)));
      writeFileSync(join(root, 'owed.json'), fixture.owed ?? '');
      writeFileSync(join(root, 'check.json'), fixture.check ?? '');
      writeFileSync(join(bin, 'bun'), [
        '#!/bin/bash',
        'if [[ "$1" == install ]]; then exit 0; fi',
        `if [[ "$1" == src/cli/index.ts && "$2" == state ]]; then echo "$*" > ${JSON.stringify(join(root, 'owed-args'))}; cat ${JSON.stringify(join(root, 'owed.json'))}; if [[ ${fixture.owedExit ?? 0} -ne 0 ]]; then echo "Unknown base ref: missing" >&2; fi; exit ${fixture.owedExit ?? 0}; fi`,
        `if [[ "$1" == src/cli/index.ts && "$2" == architecture-projection ]]; then touch ${JSON.stringify(join(root, 'checked'))}; cat ${JSON.stringify(join(root, 'check.json'))}; exit ${fixture.checkExit ?? 1}; fi`,
        `exec ${JSON.stringify(process.execPath)} "$@"`,
      ].join('\n'), { mode: 0o755 });
      writeFileSync(join(bin, 'npm'), `#!/bin/bash\nexit ${fixture.codegraphExit ?? 0}\n`, { mode: 0o755 });
      const summaryPath = join(root, 'out/architecture/summary.json');
      const result = spawnSync('/bin/bash', ['scripts/check-ci.sh', ...args], {
        cwd: join(root, 'repo'), encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...(fixture.summary ? { ARCHITECTURE_SUMMARY: summaryPath } : {}) },
      });
      return {
        status: result.status, stdout: result.stdout, stderr: result.stderr,
        checked: existsSync(join(root, 'checked')),
        owedArgs: existsSync(join(root, 'owed-args')) ? readFileSync(join(root, 'owed-args'), 'utf8').trim() : null,
        summary: existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : null,
      };
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  const warnings = (stdout: string) => stdout.split('\n').filter(line => line.startsWith('::warning '));

  test('an owed PR capability warns with its id, the stale nodes and the apply command, and exits 0', () => {
    const result = runLane(['architecture-advisory', '--base', 'abc123'], { owed: owed('owed'), check: planned });
    expect(result.status, result.stderr).toBe(0);
    expect(result.owedArgs).toBe('src/cli/index.ts state owed --json --base abc123');
    expect(result.checked).toBe(true);
    expect(warnings(result.stdout)).toEqual([
      '::warning title=Architecture update owed::This PR changes paths owned by these capabilities after the last architecture manifest update: workflow-engine-workflow-state.',
      '::warning title=Architecture documents stale::Status: planned. Stale nodes: capability.workflow-engine.workflow-state, capability.verification.evals-checks. Owed capabilities: workflow-engine-workflow-state. In this PR run: repo-harness architecture-projection apply --json. Then commit docs/architecture/.',
    ]);
  });

  test('a clear PR runs no architecture check and prints no warning', () => {
    const result = runLane(['architecture-advisory', '--base', 'abc123'], { owed: owed('clear') });
    expect(result.status, result.stderr).toBe(0);
    expect(result.checked).toBe(false);
    expect(warnings(result.stdout)).toEqual([]);
    expect(result.stdout).toContain('[ci] No architecture check needed.');
  });

  test('owed-rule and check failures become warnings, not PR failures', () => {
    const failed = runLane(['architecture-advisory', '--base', 'missing'], { owedExit: 1 });
    expect(failed.status, failed.stderr).toBe(0);
    expect(failed.checked).toBe(false);
    expect(warnings(failed.stdout)).toHaveLength(1);
    expect(warnings(failed.stdout)[0]).toStartWith('::warning title=Architecture owed check failed::repo-harness state owed --json --base missing failed: ');
    expect(warnings(failed.stdout)[0]).toContain('Unknown base ref: missing');

    const noFacts = runLane(['architecture-advisory', '--base', 'abc123'], { owed: owed('owed'), codegraphExit: 1 });
    expect(noFacts.status, noFacts.stderr).toBe(0);
    expect(noFacts.checked).toBe(false);
    expect(warnings(noFacts.stdout)[1]).toStartWith('::warning title=Architecture check failed::');
  });

  test('the daily lane fails on stale documents and writes the summary for the report', () => {
    const result = runLane(['architecture'], { check: planned, summary: true });
    expect(result.status).toBe(1);
    expect(result.checked).toBe(true);
    expect(result.owedArgs).toBeNull();
    expect(result.summary).toEqual({ status: 'planned', staleNodes: ['capability.workflow-engine.workflow-state', 'capability.verification.evals-checks'],
      files: ['docs/architecture/.projection-manifest.json'], humanActions: [] });
    expect(result.stdout).not.toContain('[ci] typecheck');
  });

  test('the daily lane passes after a manifest-only refresh and reports no remaining stale nodes', () => {
    const result = runLane(['architecture'], {
      check: JSON.stringify({ status: 'noop', freshness: { ok: true, staleNodes: [] }, files: [], humanActions: [] }),
      checkExit: 0,
      summary: true,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.checked).toBe(true);
    expect(result.owedArgs).toBeNull();
    expect(result.summary).toEqual({ status: 'noop', staleNodes: [], files: [], humanActions: [] });
    expect(warnings(result.stdout)).toEqual([]);
    expect(result.stdout).toContain('[ci] OK');
    expect(result.stdout).not.toContain('[ci] typecheck');
  });
});

describe('historical replay source loading', () => {
  test('loads the files the selector parses, including the bunfig.toml preloads', () => {
    expect(replayNeedsSource('bunfig.toml')).toBe(true);
    expect(replayNeedsSource('scripts/check-ci.sh')).toBe(true);
    expect(replayNeedsSource('src/x.ts')).toBe(true);
    expect(replayNeedsSource('docs/guide.md')).toBe(false);
  });
});
