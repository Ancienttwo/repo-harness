import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { archctxConsumerPaths, isArchctx093Upgrade, analyzeAffectedTests, bundleInputPaths, discoverDailyInputs, discoverPlatformInputs, platformImportClosure, selectAffectedTests, selectCoverage, selectPlatformCoverage } from '../scripts/select-ci-coverage';
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
  } }));
}

const record = `:100644 100644 ${sha} ${sha} M\0src/feature.ts\0`;

describe('single affected verification and daily fallback', () => {
  // Independently recorded raw diff for PR951 at f47e937c. No repo history or
  // network is needed to exercise the admission boundary.
  const upgradeDiff = [
    ['100644', '100644', 'f8b767a51e24934870214582551da004dd5dcc81', '16d2b0050da97a42799593f5019c56b521bb7ad8', 'M', 'bun.lock'],
    ['000000', '100644', '0'.repeat(40), 'e1b7f0bff6223a0ac596e9d452da2af42b241b68', 'A', 'docs/verification/archctx-0.9.3-capabilities.json'],
    ['000000', '100644', '0'.repeat(40), '029c80f7c4f8720598c6ff0525effad9dcce79fa', 'A', 'docs/verification/archctx-0.9.3-installed-bytes.json'],
    ['000000', '100644', '0'.repeat(40), '8ef66695b4a61550b2a70e7827ba2180a9b733e5', 'A', 'docs/verification/archctx-0.9.3-upgrade.md'],
    ['100644', '100644', 'c8af35f4d7cfc2fe9c80702aefaf8895a4f64021', '612d382dcffed1412b00b566388898e73ec56b21', 'M', 'docs/verification/axr5-archctx-clean-room-readback.json'],
    ['100644', '100644', 'd4ba864fb748205fbc55a531822c5deee308da18', '60ff292329fdcba945501cb727e60e73e48c7b4e', 'M', 'package.json'],
    ['100644', '100644', '90f076567abf4e242a8997898401adfdade044a5', '3521418aebfddd8b22103e26f249193d8d2237a3', 'M', 'tests/architecture-projection-e2e.test.ts'],
  ].map(([oldMode, newMode, oldBlob, newBlob, status, path]) =>
    `:${oldMode} ${newMode} ${oldBlob} ${newBlob} ${status}\0${path}\0`).join('');

  test('archctx narrow admission binds the full reviewed diff and exact checkout', () => {
    expect(isArchctx093Upgrade({ ...input, diffRaw: upgradeDiff })).toBe(true);
    for (const candidate of [
      { ...input, actualHead: '2'.repeat(40) },
      { ...input, eventName: 'local', event: { before: sha } },
      { ...input, eventName: 'push', event: { before: sha } },
      { ...input, eventName: 'workflow_dispatch' },
      { ...input, event: { pull_request: { base: { sha: '' } } } },
    ]) expect(isArchctx093Upgrade({ ...candidate, diffRaw: upgradeDiff })).toBe(false);
    for (const diffRaw of [null, '', upgradeDiff.slice(0, -1),
      upgradeDiff.replace('16d2b0050da97a42799593f5019c56b521bb7ad8', sha),
      upgradeDiff.replace('d4ba864fb748205fbc55a531822c5deee308da18', sha),
      upgradeDiff.replace('100644', '100755'),
      upgradeDiff.replace('3521418aebfddd8b22103e26f249193d8d2237a3', sha),
      upgradeDiff.replace('8ef66695b4a61550b2a70e7827ba2180a9b733e5', sha),
      upgradeDiff.replace('612d382dcffed1412b00b566388898e73ec56b21', sha),
      upgradeDiff.split('\0').slice(0, -3).join('\0') + '\0',
    ]) expect(isArchctx093Upgrade({ ...input, diffRaw })).toBe(false);
  });

  test('archctx mixed changes cannot use the narrow dependency exception', async () => {
    for (const path of ['src/feature.ts', '.github/workflows/ci.yml', 'scripts/select-ci-coverage.ts',
      'scripts/axr5-archctx-clean-room.ts', 'bunfig.toml', 'docs/extra.md']) {
      const diffRaw = upgradeDiff + `:100644 100644 ${sha} ${sha} M\0${path}\0`;
      expect(isArchctx093Upgrade({ ...input, diffRaw })).toBe(false);
    }
    // Rejected dependency changes still take the established global-input path.
    const coverage = await analyzeAffectedTests(['package.json', 'bun.lock'], new Map([
      ['tests/architecture.test.ts', 'export {};'], ['tests/unrelated.test.ts', 'export {};'],
    ]), []);
    expect(coverage.fullReasons).toEqual(['package.json', 'bun.lock']);
    expect(coverage.tests).toEqual(['tests/architecture.test.ts', 'tests/unrelated.test.ts']);
  });

  test('archctx consumers include CLI strings and propagate through normal imports', async () => {
    const sources = new Map([
      ['src/effects/architecture/archctx-provider.ts', 'export const name = "archctx";'],
      ['src/core/architecture/projection.ts', 'import type { Json } from "archctx-contracts";'],
      ['tests/architecture-projection-e2e.test.ts', 'spawnSync("archctx", ["capabilities"]);'],
      ['tests/architecture-projection-provider.test.ts', 'const cli = "archctx";'],
      ['tests/consumer.test.ts', 'import "../src/effects/architecture/archctx-provider"; import "../src/core/architecture/projection";'],
      ['tests/unrelated.test.ts', 'export {};'],
    ]);
    const coverage = await analyzeAffectedTests(archctxConsumerPaths(sources), sources, []);
    expect(coverage.uncovered).toEqual([]);
    expect(coverage.fullReasons).toEqual([]);
    expect(coverage.tests).toEqual(['tests/architecture-projection-e2e.test.ts', 'tests/architecture-projection-provider.test.ts', 'tests/consumer.test.ts']);
    sources.delete('src/core/architecture/projection.ts');
    expect(() => archctxConsumerPaths(sources)).toThrow('Missing archctx consumer');
  });

  test('affected artifacts bind to the selected SHA and verification checks that checkout', () => {
    const upload = workflow.jobs.selection.steps.find((step: any) => step.uses === 'actions/upload-artifact@v4');
    const download = workflow.jobs.verify.steps.find((step: any) => step.uses === 'actions/download-artifact@v4');
    expect(upload.with.name).toBe('affected-tests-${{ steps.select.outputs.sha }}');
    expect(download.with.name).toBe('affected-tests-${{ needs.selection.outputs.sha }}');
    const binding = workflow.jobs.verify.steps.find((step: any) => step.name === 'Verify selected checkout');
    expect(binding.env.EXPECTED_SHA).toBe('${{ needs.selection.outputs.sha }}');
    expect(binding.run).toBe('test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"');
    expect(workflow.jobs.verify.steps.indexOf(binding)).toBeLessThan(workflow.jobs.verify.steps.findIndex((step: any) => step.run === 'bash scripts/check-ci.sh affected'));
  });

  test('rooted paths do not select suffix collisions and unknown roots keep consumers', async () => {
    const sources = new Map([
      ['scripts/tool.ts', 'export {};'], ['fixtures/scripts/tool.ts', 'export {};'],
      ['assets/x.json', '{}'],
      ['tests/rooted.test.ts', "readFileSync(join(import.meta.dir, '../scripts/tool.ts'));"],
      ['tests/unknown.test.ts', "readFileSync(join(root(), 'assets', 'x.json'));"],
      ['tests/concat.test.ts', "const ROOT = join(import.meta.dir, '..'); readFileSync(ROOT + '/scripts/tool.ts');"],
      ['tests/fixture.test.ts', "readFileSync(join(import.meta.dir, '../fixtures/scripts/tool.ts'));"],
    ]);
    expect(await selectAffectedTests(['scripts/tool.ts'], sources, [])).toEqual(['tests/concat.test.ts', 'tests/rooted.test.ts']);
    expect(await selectAffectedTests(['fixtures/scripts/tool.ts'], sources, [])).toEqual(['tests/fixture.test.ts']);
    expect(await selectAffectedTests(['assets/x.json'], sources, [])).toEqual(['tests/unknown.test.ts']);
  });

  test('launcher arguments use child cwd and inherited or unknown cwd keeps execution aliases', async () => {
    const sources = new Map([
      ['src/base.ts', 'export {};'], ['src/other.ts', 'export {};'],
      ['scripts/tasks/run.ts', "import '../../src/base';"],
      ['scripts/other/run.ts', "import '../../src/other';"],
      ['tests/direct.test.ts', "import '../src/base';"],
      ['tests/cwd.test.ts', "spawnSync('bun', ['run.ts'], { cwd: join(import.meta.dir, '../scripts/tasks') });"],
      ['tests/options.test.ts', "const cwd = join(import.meta.dir, '../scripts/tasks'); const options = { cwd }; spawnSync('bun', ['run.ts'], options);"],
      ['tests/other.test.ts', "spawnSync('bun', ['run.ts'], { cwd: join(import.meta.dir, '../scripts/other') });"],
      ['tests/inherited.test.ts', "spawnSync('bun', ['run.ts']);"],
      ['tests/unknown.test.ts', "spawnSync('bun', ['run.ts'], { cwd: target() });"],
    ]);
    expect(await selectAffectedTests(['src/base.ts'], sources, [])).toEqual(['tests/cwd.test.ts', 'tests/direct.test.ts', 'tests/inherited.test.ts', 'tests/options.test.ts', 'tests/unknown.test.ts']);
    expect(await selectAffectedTests(['src/other.ts'], sources, [])).toEqual(['tests/inherited.test.ts', 'tests/other.test.ts', 'tests/unknown.test.ts']);
  });

  test('absolute launcher targets retain their root for inherited and unknown child cwd', async () => {
    const sources = new Map([
      ['src/base.ts', 'export {};'], ['src/other.ts', 'export {};'],
      ['scripts/tasks/run.ts', "import '../../src/base';"],
      ['fixtures/scripts/tasks/run.ts', "import '../../../src/other';"],
      ['tests/inherited.test.ts', "spawnSync('bun', [join(import.meta.dir, '../scripts/tasks/run.ts')]);"],
      ['tests/unknown.test.ts', "const ENTRY = join(import.meta.dir, '../scripts/tasks/run.ts'); spawnSync(process.execPath, [ENTRY], { cwd: target() });"],
      ['tests/executable.test.ts', "spawnSync(join(import.meta.dir, '../scripts/tasks/run.ts'), [], { cwd: target() });"],
      ['tests/relative.test.ts', "spawnSync('bun', ['run.ts'], { cwd: target() });"],
      ['tests/fixture.test.ts', "spawnSync('bun', [join(import.meta.dir, '../fixtures/scripts/tasks/run.ts')]);"],
    ]);
    expect(await selectAffectedTests(['src/base.ts'], sources, [])).toEqual([
      'tests/executable.test.ts', 'tests/inherited.test.ts', 'tests/relative.test.ts', 'tests/unknown.test.ts',
    ]);
    expect(await selectAffectedTests(['src/other.ts'], sources, [])).toEqual(['tests/fixture.test.ts', 'tests/relative.test.ts']);
  });

  test('opaque cwd wrappers, changed options and spreads keep execution coverage', async () => {
    const sources = new Map([
      ['src/base.ts', 'export {};'],
      ['scripts/tasks/run.ts', "import '../../src/base';"],
      ['tests/direct.test.ts', "import '../src/base';"],
      ['tests/wrapper.test.ts', "spawnSync('bun', ['run.ts'], { cwd: choose(join(import.meta.dir, '../scripts/other')) });"],
      ['tests/mutated.test.ts', "const options = { cwd: join(import.meta.dir, '../scripts/other') }; options.cwd = target(); spawnSync('bun', ['run.ts'], options);"],
      ['tests/spread.test.ts', "Bun.spawn({ cmd: ['bun', 'run.ts'], cwd: join(import.meta.dir, '../scripts/other'), ...options });"],
    ]);
    expect(await selectAffectedTests(['src/base.ts'], sources, [])).toEqual(['tests/direct.test.ts', 'tests/mutated.test.ts', 'tests/spread.test.ts', 'tests/wrapper.test.ts']);
  });

  test('an unknown path wrapper cannot prove that a read is outside the checkout', async () => {
    const sources = new Map([
      ['scripts/tool.ts', 'export {};'],
      ['tests/wrapper.test.ts', "readFileSync(join(choose('/outside'), 'scripts', 'tool.ts'));"],
    ]);
    expect(await selectAffectedTests(['scripts/tool.ts'], sources, [])).toEqual(['tests/wrapper.test.ts']);
  });

  test('unresolved data roots keep the real installed-copy projection consumer', async () => {
    const sources = new Map([
      ['SKILL.md', '# Skill'],
      ['tests/direct.test.ts', "readFileSync(join(import.meta.dir, '../SKILL.md'));"],
      ['tests/installed-copy-sync.test.ts', readFileSync(join(ROOT, 'tests/installed-copy-sync.test.ts'), 'utf8')],
    ]);
    expect(await selectAffectedTests(['SKILL.md'], sources, [])).toEqual(['tests/direct.test.ts', 'tests/installed-copy-sync.test.ts']);
  });

  test('round 2: launcher data arguments keep aliases under a known cwd', async () => {
    const sources = new Map([
      ['assets/templates/a.md', '# A'], ['assets/templates/b.md', '# B'],
      ['scripts/render.ts', "readFileSync(asset(process.argv[2]));"],
      ['tests/other.test.ts', "readFileSync(join(import.meta.dir, '../assets/templates/a.md'));"],
      ['tests/render.test.ts', "spawnSync('bun', ['scripts/render.ts', 'templates/a.md'], { cwd: join(import.meta.dir, '..') });"],
      ['tests/negative.test.ts', "spawnSync('bun', ['scripts/render.ts', 'templates/b.md'], { cwd: join(import.meta.dir, '..') });"],
    ]);
    expect(await selectAffectedTests(['assets/templates/a.md'], sources, [])).toEqual(['tests/other.test.ts', 'tests/render.test.ts']);
    expect(await selectAffectedTests(['assets/templates/b.md'], sources, [])).toEqual(['tests/negative.test.ts']);
    const audit = await auditDroppedTests(['assets/templates/a.md'], ['tests/render.test.ts'],
      new Map([['assets/templates/a.md', new Set(['tests/render.test.ts'])]]),
      { reverse: new Map(), data: new Map() }, sources, new Map());
    expect(audit.edges[0]?.reason).toBe('unclassified');
  });

  test('round 2: a script cwd stays unresolved when a test supplies another cwd', async () => {
    const sources = new Map([
      ['scripts/tasks/config.json', '{}'],
      ['scripts/tasks/run.ts', "const ROOT = process.cwd(); readFileSync(join(ROOT, 'config.json'));"],
      ['tests/other.test.ts', "readFileSync(join(import.meta.dir, '../scripts/tasks/config.json'));"],
      ['tests/cwd.test.ts', "spawnSync('bun', ['run.ts'], { cwd: join(import.meta.dir, '../scripts/tasks') });"],
      ['tests/negative.test.ts', "spawnSync('bun', ['other.ts'], { cwd: join(import.meta.dir, '../scripts/elsewhere') });"],
    ]);
    expect(await selectAffectedTests(['scripts/tasks/config.json'], sources, [])).toEqual(['tests/cwd.test.ts', 'tests/other.test.ts']);
    const result = await analyzeAffectedTests(['scripts/tasks/config.json'], sources, []);
    expect(result.graph.reverse.get('scripts/tasks/config.json')?.has('scripts/tasks/run.ts')).toBe(true);
  });

  test('round 2: directory audit cites the matching reference and does not hide an execution edge', async () => {
    const root = 'src/base.ts', dependency = 'src/entry.ts', consumer = 'tests/final.test.ts';
    const baseline = new Map([[root, new Set([dependency])], [dependency, new Set([consumer])]]);
    const current = { reverse: new Map([[root, new Set([dependency])]]), data: new Map([[dependency, new Set([consumer])]]) };
    const source = "const ROOT = join(import.meta.dir, '..');\nreaddirSync(join(ROOT, 'src'));";
    const audit = await auditDroppedTests([root], [consumer], baseline, current, new Map([[consumer, source]]), new Map());
    expect(audit.edges[0]?.reason).toBe('directory-data-not-transitive');
    expect(audit.edges[0]?.evidence?.[0]?.line).toBe(2);
    expect(audit.edges[0]?.evidence?.[0]?.text).toContain("join(ROOT, 'src')");
    const ambiguous = await auditDroppedTests([root], [consumer], baseline, current,
      new Map([[consumer, source + "\nspawnSync('bun', ['entry.ts']);"]]), new Map());
    expect(ambiguous.edges[0]?.reason).toBe('unclassified');
    expect(ambiguous.witnesses[0]?.reason).toBe('unclassified');
  });

  test('round 3: implicit resolve keeps consumers after process.chdir', async () => {
    const sources = new Map([
      ['scripts/tool.ts', 'export {};'], ['fixtures/scripts/tool.ts', 'export {};'],
      ['tests/chdir.test.ts', "process.chdir('fixtures'); readFileSync(resolve('scripts/tool.ts'));"],
      ['tests/namespace.test.ts', "process.chdir('fixtures'); readFileSync(path.resolve('scripts', 'tool.ts'));"],
      ['tests/cwd.test.ts', "process.chdir('fixtures'); readFileSync(join(process.cwd(), 'scripts/tool.ts'));"],
      ['tests/default.test.ts', "readFileSync(resolve('scripts/tool.ts'));"],
      ['tests/absolute.test.ts', "process.chdir('fixtures'); readFileSync(resolve(import.meta.dir, '../scripts/tool.ts'));"],
      ['tests/other.test.ts', "readFileSync(join(import.meta.dir, '../fixtures/scripts/tool.ts'));"],
    ]);
    expect(await selectAffectedTests(['fixtures/scripts/tool.ts'], sources, [])).toEqual([
      'tests/chdir.test.ts', 'tests/cwd.test.ts', 'tests/namespace.test.ts', 'tests/other.test.ts',
    ]);
    expect(await selectAffectedTests(['scripts/tool.ts'], sources, [])).toEqual([
      'tests/absolute.test.ts', 'tests/chdir.test.ts', 'tests/cwd.test.ts', 'tests/default.test.ts', 'tests/namespace.test.ts',
    ]);
  });

  test('round 3: product reads keep unresolved implicit roots without treating layouts as reads', async () => {
    const sources = new Map([
      ['fixtures/scripts/tool.ts', 'export {};'],
      ['src/resolver.ts', "export const read = () => readFileSync(path.resolve('scripts/tool.ts'));"],
      ['src/relative.ts', "export const read = () => readFileSync('scripts/tool.ts');"],
      ['src/opaque.ts', "import { consume } from './consume'; export const read = () => consume(resolve('scripts/tool.ts'));"],
      ['src/consume.ts', "export const consume = (path: string) => readFileSync(path);"],
      ['src/url.ts', "export const read = () => readFileSync(new URL('scripts/tool.ts', base()));"],
      ['src/layout.ts', "export const output = join(process.cwd(), 'scripts/tool.ts');"],
      ['tests/resolver.test.ts', "import '../src/resolver';"],
      ['tests/relative.test.ts', "import '../src/relative';"],
      ['tests/opaque.test.ts', "import '../src/opaque';"],
      ['tests/url.test.ts', "import '../src/url';"],
      ['tests/layout.test.ts', "import '../src/layout';"],
      ['tests/other.test.ts', "readFileSync(join(import.meta.dir, '../fixtures/scripts/tool.ts'));"],
    ]);
    expect(await selectAffectedTests(['fixtures/scripts/tool.ts'], sources, [])).toEqual([
      'tests/opaque.test.ts', 'tests/other.test.ts', 'tests/relative.test.ts', 'tests/resolver.test.ts', 'tests/url.test.ts',
    ]);
    const audit = await auditDroppedTests(['fixtures/scripts/tool.ts'], ['tests/relative.test.ts'], new Map([
      ['fixtures/scripts/tool.ts', new Set(['src/relative.ts'])],
      ['src/relative.ts', new Set(['tests/relative.test.ts'])],
    ]), { reverse: new Map(), data: new Map() }, sources, new Map());
    expect(audit.edges[0]?.reason).toBe('unclassified');
  });

  test('round 3: absolute resolve inputs retain their root in product code', async () => {
    const sources = new Map([
      ['scripts/tool.ts', 'export {};'], ['fixtures/scripts/tool.ts', 'export {};'],
      ['src/absolute.ts', "export const read = () => readFileSync(resolve('ignored', import.meta.dir, '../scripts/tool.ts'));"],
      ['src/external.ts', "export const read = () => readFileSync(resolve('/outside', 'scripts/tool.ts'));"],
      ['tests/absolute.test.ts', "import '../src/absolute';"],
      ['tests/external.test.ts', "import '../src/external';"],
      ['tests/fixture.test.ts', "readFileSync(join(import.meta.dir, '../fixtures/scripts/tool.ts'));"],
    ]);
    expect(await selectAffectedTests(['scripts/tool.ts'], sources, [])).toEqual(['tests/absolute.test.ts']);
    expect(await selectAffectedTests(['fixtures/scripts/tool.ts'], sources, [])).toEqual(['tests/fixture.test.ts']);
  });

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

  test('removed path fragments cite their full source expression and keep unresolved reads blocked', async () => {
    const dependency = 'scripts/tasks/run.ts', test = 'tests/final.test.ts';
    const consumers = new Map([
      ['tests/other.ts', "spawnSync('bun', ['run.ts'], { cwd: join(import.meta.dir, '../scripts/other') });"],
      ['tests/unresolved.ts', "spawnSync('bun', ['run.ts'], { cwd: unknown() });"],
      ['tests/fragment.ts', "readFileSync(join(import.meta.dir, '../fixtures/scripts/tasks', 'run.ts'));"],
    ]);
    const baseline = new Map([[dependency, new Set(consumers.keys())], ...[...consumers.keys()].map(file => [file, new Set([test])] as const)]);
    const audit = await auditDroppedTests([dependency], [test], baseline, { reverse: new Map(), data: new Map() }, consumers, new Map());
    for (const consumer of ['tests/other.ts', 'tests/fragment.ts']) {
      const edge = audit.edges.find(edge => edge.consumer === consumer)!;
      expect(edge.reason).toBe('path-fragment-resolves-elsewhere');
      expect(edge.evidence?.[0]?.source).toMatch(new RegExp(`^${consumer}:[a-f0-9]{64}$`));
      expect(edge.evidence?.[0]?.line).toBe(1);
      expect(edge.evidence?.[0]?.text).toContain('run.ts');
    }
    expect(audit.edges.find(edge => edge.consumer === 'tests/unresolved.ts')?.reason).toBe('unclassified');
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

  test('deleted preload helpers select every test from the base import closure', async () => {
    const sources = new Map([
      ['bunfig.toml', '[test]\npreload = ["./tests/preload.ts"]'],
      ['tests/preload.ts', 'export {};'],
      ['tests/a.test.ts', 'export {};'], ['tests/b.test.ts', 'export {};'],
    ]);
    const previous = new Map([
      ['tests/preload.ts', "import '../scripts/lib/gone.ts';"],
      ['scripts/lib/gone.ts', 'export {};'],
    ]);
    expect(await selectAffectedTests(['scripts/lib/gone.ts'], sources, [], previous)).toEqual(['tests/a.test.ts', 'tests/b.test.ts']);
    await expect(selectAffectedTests(['scripts/lib/gone.ts', 'unknown/new.ts'], sources, [], previous)).rejects.toThrow('coverage is unknown');
  });

  test('daily inputs stop at the matching functional fi', async () => {
    const sources = new Map([
      ['scripts/check-ci.sh', 'if [[ "$lane" == all || "$lane" == functional ]]; then\n  if true; then\n    bash scripts/nested.sh\n  fi\n  echo "fi"\n  bash scripts/daily.sh\nfi\nbash scripts/after.sh'],
      ['scripts/nested.sh', 'echo nested'], ['scripts/daily.sh', 'echo daily'], ['scripts/after.sh', 'echo after'],
    ]);
    expect([...discoverDailyInputs(sources)]).toEqual(['scripts/nested.sh', 'scripts/daily.sh']);
    expect((await analyzeAffectedTests(['scripts/daily.sh'], sources, [])).dailyOnly).toEqual(['scripts/daily.sh']);
    await expect(selectAffectedTests(['scripts/after.sh'], sources, [])).rejects.toThrow('coverage is unknown');
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
      'bun run build:oar-review-host',
      'test -s dist/oar-review-host.js',
      'case "$MODE" in',
      "  affected) set -- -t 'darwin: ' ;;",
      '  daily) set -- ;;',
      '  *) echo "Unknown coverage mode: $MODE" >&2; exit 1 ;;',
      'esac',
      'bun run test:files tests/generic-review.test.ts tests/acceptance-receipt.test.ts tests/herdr-task-lifecycle.test.ts "$@" --timeout 60000 --max-concurrency 1',
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
    const warn = advisory.steps.find((step: any) => step.name === 'Warn about architecture debt');
    expect(warn.env).toEqual({ BASE_SHA: '${{ github.event.pull_request.base.sha }}' });
    expect(warn.run).toBe('bash scripts/check-ci.sh architecture-advisory --base "$BASE_SHA"');
    expect(advisory.steps.find((step: any) => step.uses === 'actions/checkout@v4').with['fetch-depth']).toBe(0);
  });
});

describe('architecture lanes', () => {
  const debtItem = (n: number, capabilityIds: string[] = [`capability.module-${n}`]) => ({
    id: `debt.${String(n).padStart(4, '0')}`, kind: 'flow-proof-failed', nodeIds: capabilityIds, capabilityIds, paths: [`src/module-${n}.ts`],
    reasonCode: 'no-direct-call', action: 'archctx flows check --json', details: {} });
  const debt = (introduced: unknown[], coverage: { head?: string; headCodes?: string[]; base?: string; baseCodes?: string[] } = {}) => JSON.stringify({
    kind: 'repo-harness-architecture-debt',
    head: { sha: 'a'.repeat(40), debt: { coverage: coverage.head ?? 'complete', coverageReasonCodes: coverage.headCodes ?? [], items: introduced } },
    base: { ref: 'abc123', sha: 'b'.repeat(40), debtDigest: 'sha256:base', coverage: coverage.base ?? 'complete', coverageReasonCodes: coverage.baseCodes ?? [] },
    introduced, resolvedIds: ['debt.gone'] });
  const planned = JSON.stringify({ edits: [{ path: 'docs/architecture/a.md', reasonCode: 'projection-generated-region-manually-edited' }] });
  const noop = JSON.stringify({ edits: [] });

  // Real check-ci.sh with stub CLI results. `bun -e` and the shell logic stay real.
  function runLane(args: string[], fixture: { debt?: string; debtExit?: number; check?: string; checkExit?: number; codegraphExit?: number; summary?: boolean }) {
    const root = mkdtempSync(join(tmpdir(), 'rh-ci-architecture-'));
    const bin = join(root, 'bin');
    try {
      mkdirSync(join(root, 'repo/scripts/lib'), { recursive: true }); mkdirSync(bin);
      for (const path of ['scripts/check-ci.sh', 'scripts/lib/ci-run-tests.sh']) writeFileSync(join(root, 'repo', path), readFileSync(join(ROOT, path)));
      // The advisory imports the action map from the real source tree.
      symlinkSync(join(ROOT, 'src'), join(root, 'repo/src'));
      writeFileSync(join(root, 'debt.json'), fixture.debt ?? '');
      writeFileSync(join(root, 'check.json'), fixture.check ?? '');
      writeFileSync(join(bin, 'bun'), [
        '#!/bin/bash',
        'if [[ "$1" == install ]]; then exit 0; fi',
        `if [[ "$1" == src/cli/index.ts && "$2" == architecture-debt ]]; then echo "$*" > ${JSON.stringify(join(root, 'debt-args'))}; cat ${JSON.stringify(join(root, 'debt.json'))}; if [[ ${fixture.debtExit ?? 0} -ne 0 ]]; then echo "$5 does not resolve to a commit" >&2; fi; exit ${fixture.debtExit ?? 0}; fi`,
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
        debtArgs: existsSync(join(root, 'debt-args')) ? readFileSync(join(root, 'debt-args'), 'utf8').trim() : null,
        summary: existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : null,
      };
    } finally {
      // Remove the link first, so the recursive delete cannot reach the real source tree.
      if (existsSync(join(root, 'repo/src'))) unlinkSync(join(root, 'repo/src'));
      rmSync(root, { recursive: true, force: true });
    }
  }
  const warnings = (stdout: string) => stdout.split('\n').filter(line => line.startsWith('::warning '));

  test('new PR debt warns once per item with its subjects and action, then hand-edited generated output warns, and the lane exits 0', () => {
    const result = runLane(['architecture-advisory', '--base', 'abc123'], { debt: debt([debtItem(1), debtItem(2, [])]), check: planned, checkExit: 0 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.debtArgs).toBe('src/cli/index.ts architecture-debt --json --base abc123');
    expect(result.checked).toBe(true);
    expect(result.stdout).toContain('[ci] Architecture debt: head coverage complete. Introduced 2. Resolved 1.');
    expect(warnings(result.stdout)).toEqual([
      '::warning title=Architecture debt introduced::flow-proof-failed (no-direct-call) in capability.module-1. Action: repo-harness architecture-debt --json',
      '::warning title=Architecture debt introduced::flow-proof-failed (no-direct-call) in src/module-2.ts. Action: repo-harness architecture-debt --json',
      '::warning title=Architecture generated output hand edited::docs/architecture/a.md: projection-generated-region-manually-edited. Keep model and human prose changes in this PR; the archctx rolling writer owns generated output.',
    ]);
  });

  test('a stale-anchor action names the repo-harness anchors command, never a bare archctx from PATH', () => {
    const staleAnchor = { ...debtItem(1), kind: 'stale-anchor', reasonCode: 'missing-path', action: 'archctx docs anchors --json' };
    const result = runLane(['architecture-advisory', '--base', 'abc123'], { debt: debt([staleAnchor]), check: noop, checkExit: 0 });
    expect(result.status, result.stderr).toBe(0);
    expect(warnings(result.stdout)).toEqual([
      '::warning title=Architecture debt introduced::stale-anchor (missing-path) in capability.module-1. Action: repo-harness architecture-projection anchors --json',
    ]);
  });

  test('a PR without new debt and with current documents prints no warning', () => {
    const result = runLane(['architecture-advisory', '--base', 'abc123'], { debt: debt([]), check: noop, checkExit: 0 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.checked).toBe(true);
    expect(warnings(result.stdout)).toEqual([]);
    expect(result.stdout).toContain('[ci] No new architecture debt.');
    expect(result.stdout).toContain('[ci] No hand-edited generated output in this PR.');
  });

  test('debt annotations stop at 20 and one more warning counts the rest', () => {
    const result = runLane(['architecture-advisory', '--base', 'abc123'], { debt: debt(Array.from({ length: 23 }, (_, n) => debtItem(n))), check: noop, checkExit: 0 });
    expect(result.status, result.stderr).toBe(0);
    const debtWarnings = warnings(result.stdout).filter(line => line.startsWith('::warning title=Architecture debt introduced::'));
    expect(debtWarnings).toHaveLength(21);
    expect(debtWarnings[19]).toContain('capability.module-19.');
    expect(debtWarnings[20]).toBe('::warning title=Architecture debt introduced::3 more new debt items have no annotation. Run repo-harness architecture-debt --json --base abc123 to list them.');
  });

  test('a coverage gap prints its reason codes and never claims that the PR has no debt', () => {
    const result = runLane(['architecture-advisory', '--base', 'abc123'], {
      debt: debt([], { head: 'partial', headCodes: ['practices:not-enabled', 'practices:not-evaluated'], base: 'unknown', baseCodes: ['flows:not-evaluated'] }),
      check: noop, checkExit: 0,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('[ci] Head coverage is partial. Reason codes: practices:not-enabled, practices:not-evaluated. Debt outside the covered checks is not measured.');
    expect(result.stdout).toContain('[ci] Base coverage is unknown. Reason codes: flows:not-evaluated. Debt outside the covered checks is not measured.');
    expect(result.stdout).not.toContain('No new architecture debt');
    expect(warnings(result.stdout)).toEqual([]);
  });

  test('debt and check failures become warnings, not PR failures', () => {
    const failed = runLane(['architecture-advisory', '--base', 'missing'], { debtExit: 1 });
    expect(failed.status, failed.stderr).toBe(0);
    expect(failed.checked).toBe(true);
    expect(warnings(failed.stdout)[0]).toStartWith('::warning title=Architecture debt check failed::repo-harness architecture-debt --json --base missing failed: ');
    expect(warnings(failed.stdout)[0]).toContain('missing does not resolve to a commit');
    expect(warnings(failed.stdout)[1]).toStartWith('::warning title=Architecture check failed::');

    const malformed = runLane(['architecture-advisory', '--base', 'abc123'], { debt: JSON.stringify({ kind: 'repo-harness-architecture-debt', base: null }), check: noop, checkExit: 0 });
    expect(malformed.status, malformed.stderr).toBe(0);
    expect(warnings(malformed.stdout)).toHaveLength(1);
    expect(warnings(malformed.stdout)[0]).toContain('not an architecture debt report with a base');

    const noFacts = runLane(['architecture-advisory', '--base', 'abc123'], { debt: debt([debtItem(1)]), codegraphExit: 1 });
    expect(noFacts.status, noFacts.stderr).toBe(0);
    expect(noFacts.debtArgs).toBeNull();
    expect(noFacts.checked).toBe(false);
    expect(warnings(noFacts.stdout).map(line => line.split('::')[1])).toEqual(['warning title=Architecture debt check failed', 'warning title=Architecture check failed']);
  });

  test.each([
    [{ status: 'planned', renderEquivalent: true, differingPaths: [], humanActions: [] }, 0],
    [{ status: 'planned', renderEquivalent: false, differingPaths: ['docs/architecture/a.md'], humanActions: [] }, 1],
    [{ status: 'human-action-required', renderEquivalent: null, differingPaths: [], humanActions: [{ reasonCode: 'unprovable-required-flow' }] }, 1],
  ])('daily consumes render equivalence, preserves incomplete results, and saves the writer repair summary: %j', (summary, exit) => {
    const result = runLane(['architecture'], { check: JSON.stringify(summary), checkExit: exit as number, summary: true });
    expect(result.status, result.stderr).toBe(exit);
    expect(result.checked).toBe(true);
    expect(result.debtArgs).toBeNull();
    expect(result.summary).toEqual(summary);
    expect(result.stdout).not.toContain('[ci] typecheck');
    expect(result.stderr).not.toContain('apply in a PR');
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
