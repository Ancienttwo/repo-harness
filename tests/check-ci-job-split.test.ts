import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeAffectedTests, bundleInputPaths, discoverDailyInputs, discoverPlatformInputs, nativeTriggers, platformImportClosure, selectAffectedTests, selectCoverage, selectPlatformCoverage } from '../scripts/select-ci-coverage';
import { auditDroppedTests } from '../scripts/ci-edge-audit';
import { replayNeedsSource } from '../scripts/replay-ci-coverage';
import { changelogPreamble, checkReleasedSections, fragmentMessage, releasedSections, sectionDrift, withoutUnreleasedSection } from '../scripts/check-changelog-released-sections';
import { assemble, FRAGMENT_PATH_FORM, fragmentPaths, parseFragment, renderSection } from '../scripts/changelog-fragments';
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
    strategy:
      matrix:
        test: [tests/native.test.ts]
    steps:
      - name: Run native OAR acceptance tests
        run: bun run test:files "$TEST_FILE"
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

  test('eval fixtures select the eval suite and fail closed without it', async () => {
    const fixture = 'evals/fixtures/prd-to-issues/docs/prds/20260101-0000-sample-feature.prd.md';
    const withConsumer = new Map([[ 'tests/run-skill-evals.test.ts', '' ], [fixture, '']]);
    expect(await analyzeAffectedTests([fixture], withConsumer, [])).toMatchObject({ tests: ['tests/run-skill-evals.test.ts'], uncovered: [] });
    const withoutConsumer = new Map([[fixture, '']]);
    expect(await analyzeAffectedTests([fixture], withoutConsumer, [])).toMatchObject({ tests: [], uncovered: [fixture] });
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

  test('a root parameter of an exported entry with no local caller keeps the real global rules consumer', async () => {
    const rules = 'assets/reference-configs/global-working-rules.md';
    const sources = new Map([
      [rules, '# Rules'],
      ['src/cli/installer/global-context.ts', readFileSync(join(ROOT, 'src/cli/installer/global-context.ts'), 'utf8')],
      ['tests/unit/herdr-peer-harness.test.ts', readFileSync(join(ROOT, 'tests/unit/herdr-peer-harness.test.ts'), 'utf8')],
    ]);
    expect(await selectAffectedTests([rules], sources, [])).toEqual(['tests/unit/herdr-peer-harness.test.ts']);
  });

  test('retains directories returned through a named constant and an environment branch', async () => {
    const source = [
      "import { dirname, isAbsolute, join, resolve } from 'path';",
      "import { fileURLToPath } from 'url';",
      "export const SKILL_NAME = 'example-skill';",
      "const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');",
      'export function skillRoot(): string {',
      '  const sourceRoot = process.env.REPO_HARNESS_SOURCE_ROOT?.trim();',
      "  if (sourceRoot) return join(sourceRoot, 'assets', 'skills', SKILL_NAME);",
      "  return join(PACKAGE_ROOT, 'assets', 'skills', SKILL_NAME);",
      '}',
    ].join('\n');
    const sources = new Map([
      ['assets/skills/example-skill/SKILL.md', '# Skill'],
      ['src/cli/example-skill/source.ts', source],
      ['tests/skill-root.test.ts', "import '../src/cli/example-skill/source';"],
    ]);
    expect(await selectAffectedTests(['assets/skills/example-skill/SKILL.md'], sources, [])).toEqual(['tests/skill-root.test.ts']);
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

  test('deleted skill-routing evidence is retired; source and changed evidence still fail closed', async () => {
    const evidence = new Map<string, string>([
      ['evals/skill-routing/packed-profile-discovery-probe.sh', '#!/usr/bin/env bash\n'],
      ['evals/skill-routing/retirement-matrix-coverage.md', '# matrix\n'],
      ['evals/skill-routing/routing-report-strict-claude.json', '{}\n'],
      ['evals/skill-routing/routing-report-strict-claude.json.sha256', `${'0'.repeat(64)}  evals/skill-routing/routing-report-strict-claude.json\n`],
    ]);
    const deletedSource = 'evals/skill-routing/gone.ts';
    const changed = 'evals/skill-routing/routing-report-full-claude.json';
    const previous = new Map<string, string>([...evidence, [deletedSource, 'export {}'], [changed, '{}']]);
    const sources = new Map<string, string>([[changed, '{"changed":true}']]);
    const coverage = await analyzeAffectedTests([...evidence.keys(), deletedSource, changed], sources, [], previous);
    expect(coverage.retired.sort()).toEqual([...evidence.keys()].sort());
    expect(coverage.uncovered).toEqual([deletedSource, changed]);
  }, 30_000);

  test('dependency manifests select every test without hiding another unknown path', async () => {
    const sources = new Map([['tests/a.test.ts', 'export {}'], ['tests/b.test.ts', 'export {}']]);
    for (const path of ['package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json']) {
      expect(await selectAffectedTests([path], sources, [])).toEqual(['tests/a.test.ts', 'tests/b.test.ts']);
    }
    const coverage = await analyzeAffectedTests(['package.json', 'bun.lock'], sources, []);
    expect(coverage.fullReasons).toEqual(['package.json', 'bun.lock']);
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

  test('persisted path references give the full-parse result on hit, partial hit, miss and corrupt input', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rh-ci-path-cache-'));
    const sources = [
      ['tests/guide.test.ts', "import { readFileSync } from 'node:fs'; readFileSync('docs/guide.md'); // comment"],
      ['scripts/run.ts', "import { spawnSync } from 'node:child_process'; spawnSync('bash', ['scripts/tool.sh'], { cwd: '/repo' });"],
      ['src/data.ts', "import { join } from 'node:path'; export const data = join(import.meta.dir, '../templates/data.json');"],
    ];
    // A fresh process per row, so only the persisted file can supply an entry.
    const parse = (cache: string, save = false) => {
      const result = spawnSync(process.execPath, ['-e', `
        const { discoverPathReferences, loadPathReferences, savePathReferences, sourceEvidence, sourceKey } = await import(${JSON.stringify(join(ROOT, 'scripts/ci-path-consumers.ts'))});
        const sources = JSON.parse(process.env.SOURCES);
        const loaded = loadPathReferences(process.env.CACHE, 'analyzer-1');
        const references = await discoverPathReferences(sources);
        if (process.env.SAVE) savePathReferences(process.env.CACHE, 'analyzer-1', sources);
        console.log(JSON.stringify({ loaded, entries: sources.map(([file, source]) => [references.get(sourceKey(file, source)), sourceEvidence.get(sourceKey(file, source))]) }));
      `], { encoding: 'utf8', env: { ...process.env, SOURCES: JSON.stringify(sources), CACHE: cache, SAVE: save ? '1' : '' } });
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout) as { loaded: number; entries: unknown[] };
    };
    try {
      const full = join(directory, 'full.json');
      const baseline = parse(full, true);
      expect(baseline.loaded).toBe(0);
      expect(baseline.entries.every(entry => Array.isArray((entry as unknown[])[0]))).toBe(true);
      const saved = JSON.parse(readFileSync(full, 'utf8'));
      const keys = Object.keys(saved.entries);
      expect(keys).toHaveLength(sources.length);
      const variant = (name: string, content: string) => { const file = join(directory, name); writeFileSync(file, content); return file; };
      const rows: [string, string, number][] = [
        ['hit', full, sources.length],
        ['partial hit', variant('partial.json', JSON.stringify({ ...saved, entries: { [keys[0]!]: saved.entries[keys[0]!] } })), 1],
        ['miss: no file', join(directory, 'absent.json'), 0],
        ['miss: another analyzer', variant('analyzer.json', JSON.stringify({ ...saved, analyzer: 'analyzer-2' })), 0],
        ['corrupt file', variant('corrupt.json', '{"analyzer":'), 0],
        ['corrupt entry', variant('entry.json', JSON.stringify({ ...saved, entries: { ...saved.entries, [keys[1]!]: { references: [{ path: 1 }], evidence: [] } } })), sources.length - 1],
      ];
      for (const [name, cache, loaded] of rows) {
        const result = parse(cache);
        expect({ name, loaded: result.loaded }).toEqual({ name, loaded });
        expect({ name, entries: result.entries }).toEqual({ name, entries: baseline.entries });
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 60_000);

  test('exact complete diff is required, including draft candidates', () => {
    expect(selectCoverage({ ...input, diffRaw: record })).toEqual({ mode: 'affected', reason: 'complete-diff', paths: ['src/feature.ts'] });
    for (const diffRaw of [null, '', record.slice(0, -1), record + '\0', record.replace(' M\0', ' R100\0'), record.replace(sha, 'bad'), record.replace('src/feature.ts', 'src/../feature.ts')]) {
      expect(selectCoverage({ ...input, diffRaw }).mode).toBe('invalid');
    }
    expect(selectCoverage({ ...input, actualHead: '2'.repeat(40), diffRaw: record }).mode).toBe('invalid');
    expect(selectCoverage({ ...input, eventName: 'schedule', diffRaw: null }).mode).toBe('daily');
    expect(selectCoverage({ ...input, eventName: 'push', event: { before: sha }, diffRaw: record }).mode).toBe('report');
    expect(selectCoverage({ ...input, eventName: 'merge_group', event: { merge_group: { base_sha: sha } }, diffRaw: record })).toEqual({ mode: 'invalid', reason: 'unknown-event', paths: [] });
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
    expect(await selectAffectedTests(['tasks/lessons.md'], sources, [])).toEqual([]);
    await expect(selectAffectedTests(['tasks/todos.md'], sources, [])).rejects.toThrow('coverage is unknown');
    await expect(selectAffectedTests(['plans/plan.md'], sources, [])).rejects.toThrow('coverage is unknown');
    await expect(selectAffectedTests(['unknown/product.conf'], sources, [])).rejects.toThrow('coverage is unknown');
    const hub = new Map([...sources, ['tests/docs.test.ts', 'export {}'], ['src/core/feature.ts', "export const targetFiles = ['plans', 'docs/guide.md']; export const feature = 1"]]);
    expect(await selectAffectedTests(['tasks/lessons.md', 'docs/guide.md'], hub, ['tests/docs.test.ts'])).toEqual(['tests/docs.test.ts']);
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
    expect(workflow.on.schedule).toEqual([{ cron: '17 19 * * *' }]);
    expect(jobs.required.name).toBe('Required / CI');
    expect(jobs.required.needs).toEqual(['selection', 'state-boundaries', 'verify', 'home-isolation', 'native-oar', 'architecture-advisory']);
    // State boundaries run on every event except a push to main and a documentation-only diff, and Required / CI requires them.
    expect(jobs['state-boundaries'].needs).toBe('selection');
    expect(jobs['state-boundaries'].if).toBe("github.event_name != 'push' && needs.selection.outputs.mode != 'documentation'");
    expect(workflow.on.merge_group).toBeUndefined();
    expect(jobs.required.if).toBe("always() && github.event_name == 'pull_request'");
    const pushJobs = Object.entries(jobs).filter(([, job]: [string, any]) => !job.needs && job.if !== "github.event_name != 'push'").map(([id]) => id);
    expect(pushJobs).toEqual(['selection']);
    expect(jobs.selection.steps.some((step: any) => step.run === 'bun run check:state-boundaries')).toBe(false);
    const boundarySteps = jobs['state-boundaries'].steps.filter((step: any) => step.run === 'bun run check:state-boundaries');
    expect(boundarySteps).toHaveLength(1);
    const boundary = boundarySteps[0];
    expect(boundary.if).toBeUndefined();
    expect(boundary['continue-on-error']).toBeUndefined();
    expect(jobs['state-boundaries'].steps.indexOf(boundary)).toBeGreaterThan(
      jobs['state-boundaries'].steps.findIndex((step: any) => step.run === 'bun install --frozen-lockfile'),
    );
    const select = jobs.selection.steps.find((step: any) => step.id === 'select');
    const referenceCache = jobs.selection.steps.find((step: any) => step.uses === 'actions/cache@v4' && step.with.path === select.env.CI_PATH_REFERENCE_CACHE);
    expect(referenceCache.with).toEqual({ path: '${{ runner.temp }}/ci-path-references.json', key: 'ci-path-references-${{ github.sha }}', 'restore-keys': 'ci-path-references-' });
    expect(jobs.selection.steps.indexOf(referenceCache)).toBeLessThan(jobs.selection.steps.indexOf(select));
    expect(jobs.verify.if).toBe("needs.selection.outputs.mode == 'affected'");
    const affected = jobs.verify.steps.find((step: any) => step.run === 'bash scripts/check-ci.sh affected');
    const total = Number(/^\$\{\{ matrix\.shard \}\}\/(\d+)$/.exec(affected.env.CI_SHARD)![1]);
    expect(jobs.verify.strategy).toEqual({ 'fail-fast': false, matrix: { shard: Array.from({ length: total }, (_, index) => index) } });
    expect(total).toBeGreaterThan(1);
    // The selection job writes one plan array per verify shard from the durations that only the daily run on main saves.
    expect(select.env.CI_SHARD_TOTAL).toBe(total);
    const durationRestore = jobs.selection.steps.find((step: any) => step.uses === 'actions/cache/restore@v4');
    expect(durationRestore.with).toEqual({ path: select.env.TEST_DURATIONS_FILE, key: 'test-durations-${{ github.run_id }}', 'restore-keys': 'test-durations-' });
    expect(jobs.selection.steps.indexOf(durationRestore)).toBeLessThan(jobs.selection.steps.indexOf(select));
    const durationSaves = Object.values(jobs).flatMap((job: any) => job.steps ?? []).filter((step: any) => /^actions\/cache(\/save)?@/.test(step.uses ?? '') && String(step.with?.key).startsWith('test-durations-'));
    expect(durationSaves).toEqual([jobs.test.steps.find((step: any) => step.uses === 'actions/cache/save@v4')]);
    expect(durationSaves[0].if).toBe("${{ !cancelled() && github.ref == 'refs/heads/main' && steps.durations.outcome == 'success' }}");
    expect(durationSaves[0].with).toEqual({ path: '${{ runner.temp }}/test-durations.json', key: 'test-durations-${{ github.run_id }}-${{ github.run_attempt }}' });
    expect(jobs.test.steps.find((step: any) => step.id === 'durations').if).toBe("${{ !cancelled() && github.ref == 'refs/heads/main' }}");
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
    const run = (selection: string, verification: string, mode: string, home: string, native: string, homeFlag: string, nativeFlag: string, boundaries = 'success', architecture = 'success') =>
      spawnSync('/bin/bash', ['-c', command], { encoding: 'utf8', env: { ...process.env,
        SELECTION_RESULT: selection, STATE_BOUNDARIES_RESULT: boundaries, COVERAGE_MODE: mode, VERIFY_RESULT: verification,
        HOME_ISOLATION_RESULT: home, NATIVE_OAR_RESULT: native, HOME_ISOLATION: homeFlag, NATIVE_OAR: nativeFlag, ARCHITECTURE_RESULT: architecture,
      } }).status;
    for (const selection of ['success', 'failure', 'cancelled', 'skipped']) {
      for (const verification of ['success', 'failure', 'cancelled', 'skipped']) {
        for (const mode of ['affected', 'documentation', 'daily', 'invalid', '']) {
          // A documentation-only diff passes with its verify job skipped.
          const pass = selection === 'success' && ((verification === 'success' && mode === 'affected') || (verification === 'skipped' && mode === 'documentation'));
          expect(run(selection, verification, mode, 'success', 'success', 'true', 'true') === 0).toBe(pass);
          expect(run(selection, verification, mode, 'skipped', 'skipped', 'false', 'false') === 0).toBe(pass);
        }
      }
    }
    for (const boundaries of ['success', 'failure', 'cancelled', 'skipped', '']) {
      expect(run('success', 'success', 'affected', 'success', 'success', 'true', 'true', boundaries) === 0).toBe(boundaries === 'success');
      expect(run('success', 'skipped', 'documentation', 'skipped', 'skipped', 'false', 'false', boundaries) === 0).toBe(boundaries === 'success' || boundaries === 'skipped');
    }
    // Mode affected needs both check jobs to succeed; mode documentation also passes with them skipped.
    for (const architecture of ['success', 'failure', 'cancelled', 'skipped', '']) {
      expect(run('success', 'success', 'affected', 'success', 'success', 'true', 'true', 'success', architecture) === 0).toBe(architecture === 'success');
      expect(run('success', 'skipped', 'documentation', 'skipped', 'skipped', 'false', 'false', 'success', architecture) === 0).toBe(architecture === 'success' || architecture === 'skipped');
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

  test('platform triggers use bundle inputs, full test import closures and configured preloads', async () => {
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
    for (const path of ['.github/workflows/ci.yml', 'package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json', 'scripts/check-ci.sh', 'scripts/lib/test-home-isolation.mjs', 'scripts/select-ci-coverage.ts', 'src/core/ci/documentation-path.ts',
      'scripts/ci-path-consumers.ts', 'scripts/ci-documentation-consumers.ts']) {
      expect(selectPlatformCoverage([path], inputs)).toEqual({ native_oar: true, home_isolation: true });
    }
    for (const path of ['src/host.ts', 'src/host-dependency.ts', 'tests/native.test.ts', 'tests/helpers/nested.ts']) {
      expect(selectPlatformCoverage([path], inputs)).toEqual({ native_oar: true, home_isolation: false });
    }
    expect(selectPlatformCoverage(['src/core/terminal/herdr-core-pin.json'], inputs)).toEqual({ native_oar: true, home_isolation: false });
    // Other workflows and actions that the native job does not use leave the native lane off.
    for (const path of ['.github/workflows/release.yml', '.github/actions/install/action.yml']) {
      expect(selectPlatformCoverage([path], inputs)).toEqual({ native_oar: false, home_isolation: true });
    }
    expect(nativeTriggers(['docs/guide.md', 'package.json', 'src/core/terminal/herdr-core-pin.json', 'src/deep.ts', '.github/workflows/release.yml'], inputs)).toEqual([
      { cause: 'shared', path: 'package.json' }, { cause: 'herdr-pin', path: 'src/core/terminal/herdr-core-pin.json' }, { cause: 'native-closure', path: 'src/deep.ts' },
    ]);
    // A src module imported only by a native test root, directly or transitively, triggers the native lane.
    for (const path of ['src/other.ts', 'src/deep.ts', 'assets/schema.json']) {
      expect(selectPlatformCoverage([path], inputs)).toEqual({ native_oar: true, home_isolation: false });
    }
    expect(selectPlatformCoverage(['src/nested.ts'], inputs)).toEqual({ native_oar: false, home_isolation: true });
    expect(selectPlatformCoverage(['tests/preload.ts'], inputs)).toEqual({ native_oar: true, home_isolation: true });
    expect(selectPlatformCoverage(['docs/guide.md', 'plans/plan.md', 'src/unrelated.ts', 'scripts/unrelated.sh'], inputs)).toEqual({ native_oar: false, home_isolation: false });
    expect(() => bundleInputPaths({ inputs: {} })).toThrow('missing');
    expect(() => bundleInputPaths({ inputs: { '../outside.ts': {} } })).toThrow('Invalid');
    expect(() => platformImportClosure(['tests/missing.ts'], sources)).toThrow('requires source');
    expect(() => platformImportClosure(['tests/broken.ts'], new Map([['tests/broken.ts', "import './missing';"]]))).toThrow('Unresolved');
    await expect(discoverPlatformInputs(new Map())).rejects.toThrow('Platform coverage requires');
    await expect(discoverPlatformInputs(new Map([
      ['bunfig.toml', '[test]\npreload = ["./tests/preload.ts"]\n'],
      ['.github/workflows/ci.yml', 'jobs:\n  native-oar:\n    strategy:\n      matrix:\n        test: [tests/native.test.ts, scripts/native.ts]\n    steps:\n      - name: Run native OAR acceptance tests\n        run: bun run test:files "$TEST_FILE"\n'],
    ]))).rejects.toThrow('Platform tests are missing');
  });

  test('every repository shell script that a native leg names is a native input', async () => {
    const files = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
    const sources = new Map(files.filter(file => existsSync(join(ROOT, file))).map(file => [file, readFileSync(join(ROOT, file), 'utf8')]));
    const inputs = await discoverPlatformInputs(sources, ROOT);
    const job = workflow.jobs['native-oar'];
    const named = [job.steps.find((step: any) => step.name === 'Run native OAR acceptance tests').run, ...job.strategy.matrix.test.flatMap((leg: string) => leg.split(' ').map(file => sources.get(file)!))]
      .flatMap(text => text.match(/[\w./-]+\.sh\b/g) ?? []).filter(path => sources.has(path));
    expect(named).toContain('scripts/contract-worktree.sh');
    for (const path of named) expect([path, inputs.native.has(path)]).toEqual([path, true]);
    expect(selectPlatformCoverage(['scripts/contract-worktree.sh'], inputs).native_oar).toBe(true);
    expect(selectPlatformCoverage(['.github/actions/install-pinned-herdr-core/action.yml'], inputs).native_oar).toBe(true);
  }, 120000);

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
    expect(job['timeout-minutes']).toBe(10);
    expect(job.strategy).toEqual({ 'fail-fast': false, matrix: { test: [
      'tests/generic-review.test.ts', 'tests/acceptance-receipt.test.ts tests/herdr-task-lifecycle.test.ts',
    ] } });
    expect(job['continue-on-error']).toBeUndefined();
    expect(job.steps.every((step: any) => step['continue-on-error'] === undefined)).toBe(true);
    expect(job.steps.find((step: any) => step.uses === 'actions/checkout@v4').with).toEqual({
      ref: '${{ needs.selection.outputs.sha }}', 'persist-credentials': false,
    });
    expect(job.steps.find((step: any) => step.uses === 'actions/setup-node@v4').with['node-version']).toBe('24');
    expect(job.steps.some((step: any) => step.uses === 'actions/download-artifact@v4')).toBe(false);
    const install = job.steps.filter((step: any) => step.name === 'Install pinned herdr-core runtime');
    expect(install).toHaveLength(1);
    expect(install[0].if).toBeUndefined();
    expect(install[0].uses).toBe('./.github/actions/install-pinned-herdr-core');
    expect(job.steps.indexOf(install[0])).toBeLessThan(job.steps.findIndex((step: any) => step.name === 'Run native OAR acceptance tests'));
    const native = job.steps.filter((step: any) => step.name === 'Run native OAR acceptance tests');
    expect(native).toHaveLength(1);
    expect(native[0].if).toBeUndefined();
    expect(native[0].shell).toBe('bash');
    expect(native[0].env).toEqual({ EXPECTED_SHA: '${{ needs.selection.outputs.sha }}', MODE: '${{ needs.selection.outputs.mode }}', TEST_FILES: '${{ matrix.test }}' });
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
      'read -r -a files <<< "$TEST_FILES"',
      'bun run test:files "${files[@]}" "$@" --timeout 60000 --max-concurrency 1',
    ]);
    // A PR runs only the darwin cases; the daily run keeps every native case. The filesystem probe step is gone.
    expect(job.steps.map((step: any) => step.name ?? step.uses)).toEqual([
      'actions/checkout@v4', 'actions/setup-node@v4', 'oven-sh/setup-bun@v2',
      'Install pinned herdr-core runtime', 'Run native OAR acceptance tests',
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
      expect(JSON.parse(readFileSync(join(repo, '.ci-affected-tests.json'), 'utf8'))).toEqual([['tests/feature.test.ts']]);
      expect(readFileSync(output, 'utf8')).toBe(`mode=affected\nsha=${head}\nnative_oar=false\nhome_isolation=false\n`);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  test('documentation diffs select named readers; root-process consumers run daily; program-input documents select their readers', () => {
    const repo = mkdtempSync(join(tmpdir(), 'rh-ci-documentation-selection-'));
    const git = (...args: string[]) => { const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); if (result.status !== 0) throw Error(result.stderr); return result.stdout.trim(); };
    const write = (path: string, content: string) => { mkdirSync(resolve(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), content); };
    try {
      writePlatformFixture(write);
      git('init', '-q'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
      write('tsconfig.json', JSON.stringify({ compilerOptions: { noEmit: true }, include: ['src/**/*.ts', 'tests/**/*.ts'] }));
      for (const document of ['docs/guide.md', 'docs/helper.md', 'docs/unread.md', 'docs/named.md', 'docs/area/page.md', 'docs/glob/one.md', 'tasks/lessons.md']) write(document, '# Document');
      // Targets: a module document, and a code path outside docs/architecture/ that the manifest must not turn into documentation.
      const manifest = (extra = {}) => JSON.stringify({ targets: { module: { path: 'docs/architecture/modules/x.md' }, outside: { path: 'src/manifest.ts' }, generated: { path: 'docs/architecture/generated.svg' } }, ...extra });
      write('docs/architecture/.projection-manifest.json', manifest());
      write('docs/architecture/modules/x.md', '# Module');
      write('docs/architecture/generated.svg', '<svg/>');
      write('docs/architecture/diagrams/not-a-target.mmd', 'graph TD');
      write('tests/modules.test.ts', "import { join } from 'node:path'; import { readdirSync } from 'node:fs'; const ROOT = join(import.meta.dir, '..'); readdirSync(join(ROOT, 'docs/architecture/modules'));");
      write('src/feature.ts', "export const targetDirectories = ['docs', 'plans'];");
      write('src/manifest.ts', "import { readFileSync } from 'node:fs'; import { join } from 'node:path'; export const manifest = () => readFileSync(join(import.meta.dir, '../docs/architecture/.projection-manifest.json'));");
      write('tests/feature.test.ts', "import { targetDirectories } from '../src/feature';");
      write('tests/manifest.test.ts', "import { manifest } from '../src/manifest';");
      write('tests/guide.test.ts', "import { join } from 'node:path'; import { readFileSync } from 'node:fs'; const ROOT = join(import.meta.dir, '..'); readFileSync(join(ROOT, 'docs/guide.md'));");
      write('tests/helpers/doc.ts', "import { join } from 'node:path'; import { readFileSync } from 'node:fs'; export const helper = () => readFileSync(join(import.meta.dir, '../..', 'docs/helper.md'));");
      write('tests/helper.test.ts', "import { helper } from './helpers/doc';");
      // The named-checkout rule: a fixture read of a tracked guide name in a test that resolves checkout code.
      write('tests/named.test.ts', "import { join } from 'node:path'; import { mkdtempSync, readFileSync } from 'node:fs'; const CLI = join(import.meta.dir, '..', 'src/feature.ts'); readFileSync(join(mkdtempSync('fixture'), 'docs/named.md'));");
      write('tests/directory.test.ts', "import { join } from 'node:path'; import { readdirSync } from 'node:fs'; const ROOT = join(import.meta.dir, '..'); readdirSync(join(ROOT, 'docs/area'));");
      write('tests/glob.test.ts', "import { join } from 'node:path'; import { readFileSync } from 'node:fs'; const ROOT = join(import.meta.dir, '..'); for (const name of process.argv) readFileSync(join(ROOT, 'docs/glob', name));");
      write('tests/root.test.ts', "import { join } from 'node:path'; import { spawnSync } from 'node:child_process'; const ROOT = join(import.meta.dir, '..'); spawnSync('bun', ['scripts/check.ts'], { cwd: ROOT });");
      git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
      const event = join(repo, '.git/event.json'); const output = join(repo, '.git/output'); const selected = join(repo, '.ci-affected-tests.json');
      writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: base } } }));
      const rows: [string, string[], string, string[] | null, string?, string?][] = [
        ['named read', ['docs/guide.md', 'tasks/lessons.md'], 'affected', ['tests/guide.test.ts']],
        ['helper import', ['docs/helper.md'], 'affected', ['tests/helper.test.ts']],
        ['root-process consumer runs daily only', ['docs/unread.md'], 'documentation', null],
        ['directory prefix', ['docs/area/page.md'], 'affected', ['tests/directory.test.ts']],
        ['glob', ['docs/glob/one.md'], 'affected', ['tests/glob.test.ts']],
        // Deleted documents are matched as well: the base tree still names them.
        ['deleted document keeps its named reader', ['-docs/named.md'], 'affected', ['tests/named.test.ts']],
        ['mixed diff keeps every documentation consumer', ['docs/unread.md', 'src/feature.ts'], 'affected', ['tests/directory.test.ts', 'tests/feature.test.ts', 'tests/glob.test.ts', 'tests/guide.test.ts', 'tests/helper.test.ts', 'tests/modules.test.ts', 'tests/named.test.ts', 'tests/root.test.ts']],
        ['projection output is documentation', ['docs/architecture/.projection-manifest.json'], 'documentation', null],
        ['projection output skips the reader of its directory', ['docs/architecture/.projection-manifest.json', 'docs/architecture/modules/x.md'], 'documentation', null],
        // A projection output adds no document reader to a mixed diff; src/feature.ts selects its own tests.
        ['manifest with a code path stays affected', ['docs/architecture/.projection-manifest.json', 'src/feature.ts'], 'affected', ['tests/feature.test.ts', 'tests/named.test.ts']],
        ['code path that a target names stays affected without the manifest', ['src/manifest.ts'], 'affected', ['tests/manifest.test.ts']],
        // The manifest lists src/manifest.ts as a target; the docs/architecture/ bound keeps it out of the output set.
        ['target outside docs/architecture stays affected', ['docs/architecture/.projection-manifest.json', 'src/manifest.ts'], 'affected', ['tests/manifest.test.ts']],
        ['unlisted diagram is not documentation', ['docs/architecture/diagrams/not-a-target.mmd'], 'error', null, undefined, 'coverage is unknown'],
        ['generated target with a code path selects without an uncovered path', ['docs/architecture/generated.svg', 'src/feature.ts'], 'affected', ['tests/feature.test.ts', 'tests/named.test.ts']],
        ['manifest without targets stops the selection', ['docs/architecture/.projection-manifest.json'], 'error', null, '{}', 'has no targets object'],
        ...['', 'docs/architecture/../other.svg', 'docs/architecture//file.svg'].map((path): [string, string[], string, string[] | null, string, string] =>
          [`target path ${JSON.stringify(path)} stops the selection`, ['docs/architecture/.projection-manifest.json'], 'error', null, JSON.stringify({ targets: { bad: { path } } }), 'has a target with an invalid path']),
        ['no reader', ['tasks/lessons.md'], 'documentation', null],
      ];
      for (const [name, changed, mode, tests, manifestText, message] of rows) {
        rmSync(selected, { force: true }); git('checkout', '-q', '-B', 'candidate', base);
        for (const path of changed) {
          if (path.startsWith('-')) rmSync(join(repo, path.slice(1)));
          else write(path, path.endsWith('.json') ? (manifestText ?? manifest({ changed: true })) : `${readFileSync(join(repo, path), 'utf8')}\nchanged\n`);
        }
        git('add', '.'); git('commit', '-qm', name); const head = git('rev-parse', 'HEAD');
        writeFileSync(output, '');
        const result = spawnSync(process.execPath, [join(ROOT, 'scripts/select-ci-coverage.ts')], { cwd: repo, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_SHA: head } });
        if (mode === 'error') { expect({ name, failed: result.status !== 0, stderr: result.stderr.includes(message!) }).toEqual({ name, failed: true, stderr: true }); continue; }
        expect({ name, status: result.status }, result.stderr).toEqual({ name, status: 0 });
        expect({ name, output: readFileSync(output, 'utf8') }).toEqual({ name, output: `mode=${mode}\nsha=${head}\nnative_oar=false\nhome_isolation=false\n` });
        expect({ name, plan: existsSync(selected) ? JSON.parse(readFileSync(selected, 'utf8')) : null }).toEqual({ name, plan: tests && [tests] });
      }
      // The local affected lane stops after a documentation selection; an affected selection goes on to typecheck.
      for (const file of ['scripts/check-ci.sh', 'scripts/lib/ci-run-tests.sh', 'scripts/lib/architecture-plugin.sh', 'scripts/select-test-suite.ts']) write(file, readFileSync(join(ROOT, file), 'utf8'));
      // The shard plan reader is real; every other bun command is logged only.
      write('bin/bun', '#!/bin/bash\necho "bun $*" >> "$BUN_LOG"\nif [ "$1" = scripts/select-test-suite.ts ]; then exec "$REAL_BUN" "$@"; fi\nif [ "$1" = scripts/select-ci-coverage.ts ]; then echo "mode=$SELECTED_MODE"; fi\n');
      spawnSync('chmod', ['+x', join(repo, 'bin/bun')]);
      writeFileSync(selected, '[[]]');
      for (const [mode, typecheck] of [['documentation', false], ['affected', true]] as const) {
        const log = join(repo, `.git/bun-${mode}.log`);
        const lane = spawnSync('/bin/bash', [join(repo, 'scripts/check-ci.sh'), 'affected', '--base', base], { cwd: repo, encoding: 'utf8',
          env: { PATH: `${join(repo, 'bin')}:/usr/bin:/bin`, HOME: repo, BUN_LOG: log, SELECTED_MODE: mode, REAL_BUN: process.execPath } });
        expect({ mode, status: lane.status }, lane.stderr).toEqual({ mode, status: 0 });
        expect({ mode, exit: lane.stdout.includes('[ci] Documentation-only diff: no build or test job.') }).toEqual({ mode, exit: !typecheck });
        expect({ mode, typecheck: readFileSync(log, 'utf8').includes('bun run check:type') }).toEqual({ mode, typecheck });
      }
      // A shard whose plan does not hold one array per shard starts no test.
      writeFileSync(selected, JSON.stringify([['tests/feature.test.ts']]));
      const shardLog = join(repo, '.git/bun-shard.log');
      const shard = spawnSync('/bin/bash', [join(repo, 'scripts/check-ci.sh'), 'affected'], { cwd: repo, encoding: 'utf8',
        env: { PATH: `${join(repo, 'bin')}:/usr/bin:/bin`, HOME: repo, BUN_LOG: shardLog, CI_SHARD: '1/3', REAL_BUN: process.execPath } });
      expect(shard.status).not.toBe(0);
      expect(shard.stderr).toContain('Invalid shard plan');
      expect(readFileSync(shardLog, 'utf8')).not.toContain('build:hook-bundle');
    } finally { rmSync(repo, { recursive: true, force: true }); }
  }, 120_000);

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
      expect(selected()).toEqual([[]]);
      write('src/committed.ts', 'export const value=2;'); git('add', 'src/committed.ts'); git('commit', '-qm', 'candidate');
      write('src/staged.ts', 'export const value=2;'); git('add', 'src/staged.ts');
      write('src/unstaged.ts', 'export const value=2;');
      git('rm', '-q', 'src/deleted.ts'); write('src/deleted-consumer.ts', 'export const value=2;');
      write('src/untracked.ts', 'export const value=1;');
      write('tests/untracked.test.ts', "import { value } from '../src/untracked';");
      const result = select('--base', 'origin/main');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('mode=affected');
      expect(selected()).toEqual([['tests/committed.test.ts', 'tests/deleted.test.ts', 'tests/staged.test.ts', 'tests/unstaged.test.ts', 'tests/untracked.test.ts']]);
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

  test('architecture runs as one daily job and one PR job that the required aggregate reads', () => {
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
    expect(jobs.required.steps[0].env.ARCHITECTURE_RESULT).toBe('${{ needs.architecture-advisory.result }}');
    const warn = advisory.steps.find((step: any) => step.name === 'Check the plugin-internals constraint and warn about architecture debt');
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
  const PLUGIN_INTERNALS = 'constraint.surface.plugin-internals';
  const LAYER_DIRECTION = 'constraint.architecture.layer-direction';
  const constraintViolation = (constraintId: string) => ({ constraintId, fromPath: 'src/effects/operator/a.ts', toPath: 'src/effects/terminal/herdr-core.ts',
    fromNode: 'component.operator.primary', toNode: 'component.task-agent-host.primary', severity: constraintId === PLUGIN_INTERNALS ? 'error' : 'warning' });
  // An `archctx constraints check --json` envelope. The layer-direction warning keeps the global status violated, as on main.
  const constraints = (fields: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'constraints', data: {
    schemaVersion: 'archcontext.dependency-constraint-evaluation/v1', status: 'violated', coverage: 'complete', reasonCodes: [], warnings: [],
    constraintIds: [LAYER_DIRECTION, PLUGIN_INTERNALS], importEdgeCount: 5521, unresolvedImports: [], violations: [constraintViolation(LAYER_DIRECTION)], ...fields } });

  // Real check-ci.sh with stub CLI results. `bun -e` and the shell logic stay real.
  function runLane(args: string[], fixture: { debt?: string; debtExit?: number; check?: string; checkExit?: number; codegraphExit?: number; constraints?: string; summary?: boolean; history?: Array<{ manifest: boolean; hoursAgo: number }>; shallow?: boolean; gitFails?: string; changelog?: string; changelogExit?: number }) {
    const root = mkdtempSync(join(tmpdir(), 'rh-ci-architecture-'));
    const bin = join(root, 'bin');
    try {
      mkdirSync(join(root, 'repo/scripts/lib'), { recursive: true }); mkdirSync(bin);
      for (const path of ['scripts/check-ci.sh', 'scripts/lib/ci-run-tests.sh', 'scripts/lib/architecture-plugin.sh', 'scripts/host-test-queue.ts']) writeFileSync(join(root, 'repo', path), readFileSync(join(ROOT, path)));
      // The advisory imports the action map from the real source tree.
      symlinkSync(join(ROOT, 'src'), join(root, 'repo/src'));
      // The lane records its architecture selection with the package version.
      writeFileSync(join(root, 'repo/package.json'), readFileSync(join(ROOT, 'package.json')));
      writeFileSync(join(root, 'debt.json'), fixture.debt ?? '');
      writeFileSync(join(root, 'check.json'), fixture.check ?? '');
      writeFileSync(join(root, 'constraints.json'), fixture.constraints ?? constraints());
      // First-parent main history for the daily freshness input: each commit changes the projection manifest or a product file.
      if (fixture.history) {
        const git = (gitArgs: string[], date?: string) => spawnSync('git', gitArgs, { cwd: join(root, 'repo'), encoding: 'utf8',
          env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
        git(['init', '-q']);
        mkdirSync(join(root, 'repo/docs/architecture'), { recursive: true });
        fixture.history.forEach(({ manifest, hoursAgo }, index) => {
          const path = manifest ? 'docs/architecture/.projection-manifest.json' : 'product.txt';
          writeFileSync(join(root, 'repo', path), String(index));
          git(['add', path]);
          expect(git(['commit', '-q', '-m', String(index)], new Date(Date.now() - hoursAgo * 3_600_000).toISOString()).status).toBe(0);
        });
        // A shallow file marks the clone boundary, as a checkout without fetch-depth 0 leaves it.
        if (fixture.shallow) writeFileSync(join(root, 'repo/.git/shallow'), `${git(['rev-parse', 'HEAD']).stdout.trim()}\n`);
      }
      if (fixture.gitFails) writeFileSync(join(bin, 'git'), [
        '#!/bin/bash',
        `if [[ "$1" == ${fixture.gitFails} ]]; then echo "fatal: injected $1 failure" >&2; exit 128; fi`,
        `exec ${JSON.stringify(Bun.which('git'))} "$@"`,
      ].join('\n'), { mode: 0o755 });
      writeFileSync(join(bin, 'bun'), [
        '#!/bin/bash',
        'if [[ "$1" == install ]]; then exit 0; fi',
        `if [[ "$1" == src/cli/index.ts && "$2" == architecture-debt ]]; then echo "$*" > ${JSON.stringify(join(root, 'debt-args'))}; cat ${JSON.stringify(join(root, 'debt.json'))}; if [[ ${fixture.debtExit ?? 0} -ne 0 ]]; then echo "$5 does not resolve to a commit" >&2; fi; exit ${fixture.debtExit ?? 0}; fi`,
        `if [[ "$1" == src/cli/index.ts && "$2" == architecture-projection ]]; then touch ${JSON.stringify(join(root, 'checked'))}; cat ${JSON.stringify(join(root, 'check.json'))}; exit ${fixture.checkExit ?? 1}; fi`,
        `exec ${JSON.stringify(process.execPath)} "$@"`,
      ].join('\n'), { mode: 0o755 });
      // archctx exits 0 for every report, as 0.11.2 does for violated and undetermined.
      writeFileSync(join(bin, 'npm'), [
        '#!/bin/bash',
        `if [[ "$4" == archctx ]]; then cat ${JSON.stringify(join(root, 'constraints.json'))}; exit 0; fi`,
        `exit ${fixture.codegraphExit ?? 0}`,
      ].join('\n'), { mode: 0o755 });
      // The released-CHANGELOG check reads git; this stub records its arguments and reports fixture.results.
      writeFileSync(join(root, 'repo/scripts/check-changelog-released-sections.ts'), [
        `await Bun.write(${JSON.stringify(join(root, 'changelog-args'))}, process.argv.slice(2).join(' '));`,
        `if (${JSON.stringify(fixture.changelog ?? '')}) console.log(${JSON.stringify(fixture.changelog ?? '')});`,
        `if (${fixture.changelogExit ?? 0} !== 0) { console.error('[changelog] the merge result does not keep the bytes of the 0.31.0 section.'); process.exit(${fixture.changelogExit ?? 0}); }`,
      ].join('\n'));
      const summaryPath = join(root, 'out/architecture/summary.json');
      const result = spawnSync('/bin/bash', ['scripts/check-ci.sh', ...args], {
        cwd: join(root, 'repo'), encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...(fixture.summary ? { ARCHITECTURE_SUMMARY: summaryPath } : {}) },
      });
      return {
        status: result.status, stdout: result.stdout, stderr: result.stderr,
        checked: existsSync(join(root, 'checked')),
        debtArgs: existsSync(join(root, 'debt-args')) ? readFileSync(join(root, 'debt-args'), 'utf8').trim() : null,
        changelogArgs: existsSync(join(root, 'changelog-args')) ? readFileSync(join(root, 'changelog-args'), 'utf8').trim() : null,
        summary: existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : null,
      };
    } finally {
      // Remove the link first, so the recursive delete cannot reach the real source tree.
      if (existsSync(join(root, 'repo/src'))) unlinkSync(join(root, 'repo/src'));
      rmSync(root, { recursive: true, force: true });
    }
  }
  const warnings = (stdout: string) => stdout.split('\n').filter(line => line.startsWith('::warning '));
  const errors = (stdout: string) => stdout.split('\n').filter(line => line.startsWith('::error '));

  test('the PR lane runs the released-CHANGELOG check with the PR base and fails on a changed released section', () => {
    const passed = runLane(['architecture-advisory', '--base', 'abc123'], { debt: debt([]), check: noop, checkExit: 0 });
    expect(passed.status, passed.stderr).toBe(0);
    expect(passed.changelogArgs).toBe('--base abc123');
    expect(passed.stdout).toContain('[ci] released CHANGELOG sections');

    // A changed released section stops the lane before the archctx gate.
    const failed = runLane(['architecture-advisory', '--base', 'abc123'], { debt: debt([]), check: noop, checkExit: 0, changelogExit: 1 });
    expect(failed.status, failed.stderr).toBe(1);
    expect(failed.stderr).toContain('[changelog] the merge result does not keep the bytes of the 0.31.0 section.');
    expect(errors(failed.stdout)).toEqual(['::error title=Released CHANGELOG sections::scripts/check-changelog-released-sections.ts failed for base abc123. Read the [changelog] line in the job log.']);
    expect(failed.checked).toBe(false);
  });

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

    // Without code facts the debt and hand-edit checks only warn; the constraint gate fails.
    const noFacts = runLane(['architecture-advisory', '--base', 'abc123'], { debt: debt([debtItem(1)]), codegraphExit: 1 });
    expect(noFacts.status, noFacts.stderr).toBe(1);
    expect(noFacts.debtArgs).toBeNull();
    expect(noFacts.checked).toBe(false);
    expect(warnings(noFacts.stdout).map(line => line.split('::')[1])).toEqual(['warning title=Architecture debt check failed', 'warning title=Architecture check failed']);
    expect(errors(noFacts.stdout)).toEqual(['::error title=Plugin internals constraint::archctx constraints check --json gave no valid report. Read the job log.']);
  });

  const RULE = 'ADR-0002 rule 5: a surface reads plugin state only through the plugin contract node.';
  test.each([
    ['pass with the layer-direction warning only', constraints(), []],
    ['violation', constraints({ violations: [constraintViolation(LAYER_DIRECTION), constraintViolation(PLUGIN_INTERNALS)] }),
      ['src/effects/operator/a.ts imports src/effects/terminal/herdr-core.ts (component.operator.primary -> component.task-agent-host.primary)']],
    ['undetermined with stale code facts', constraints({ status: 'undetermined', coverage: 'unknown', reasonCodes: ['code-facts-unavailable'], importEdgeCount: 0, violations: [] }),
      ['coverage is unknown', 'reason codes: code-facts-unavailable']],
    ['partial coverage', constraints({ coverage: 'partial' }), ['coverage is partial']],
    ['unresolved import', constraints({ unresolvedImports: [{ from: 'src/effects/operator/a.ts', specifier: './missing' }] }),
      ['unresolved import ./missing from src/effects/operator/a.ts']],
    ['constraint not evaluated', constraints({ constraintIds: [LAYER_DIRECTION] }), [`${PLUGIN_INTERNALS} was not evaluated`]],
  ])('the PR lane gates only on the plugin-internals result: %s', (_name, report, failures) => {
    const result = runLane(['architecture-advisory', '--base', 'abc123'], { debt: debt([]), check: noop, checkExit: 0, constraints: report });
    expect(result.status, result.stderr).toBe(failures.length === 0 ? 0 : 1);
    expect(errors(result.stdout)).toEqual(failures.map(failure => `::error title=Plugin internals constraint::${failure}. ${RULE}`));
    if (failures.length === 0) expect(result.stdout).toContain(`[ci] ${PLUGIN_INTERNALS}: 0 violations, coverage complete.`);
    // The warning steps still run after a gate failure.
    expect(result.checked).toBe(true);
  });

  test('a failed archctx envelope fails the gate without reading its exit code', () => {
    const result = runLane(['architecture-advisory', '--base', 'abc123'], { debt: debt([]), check: noop, checkExit: 0,
      constraints: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: false, requestId: 'constraints', error: { code: 'AC_CODE_FACTS_UNAVAILABLE' } }) });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('archctx constraints check failed: {"code":"AC_CODE_FACTS_UNAVAILABLE"}');
    expect(errors(result.stdout)).toEqual(['::error title=Plugin internals constraint::archctx constraints check --json gave no valid report. Read the job log.']);
  });

  const equivalent = { status: 'planned', renderEquivalent: true, differingPaths: [], humanActions: [] };
  const differs = { status: 'planned', renderEquivalent: false, differingPaths: ['docs/architecture/a.md'], humanActions: [] };
  const humanAction = { status: 'human-action-required', renderEquivalent: null, differingPaths: [], humanActions: [{ reasonCode: 'unprovable-required-flow' }] };
  // M is the newest commit that changes the manifest. The oldest commit after M, else M, dates the unpublished difference.
  const afterM = (hoursAgo: number) => [{ manifest: true, hoursAgo: 30 }, { manifest: false, hoursAgo }, { manifest: false, hoursAgo: 0.1 }];
  const onlyM = (hoursAgo: number) => [{ manifest: false, hoursAgo: 30 }, { manifest: true, hoursAgo }];
  test.each([
    ['no difference', equivalent, afterM(30), 30, 'fresh', 0],
    ['difference, commit after M younger than 3 h', differs, afterM(1), 1, 'lag', 0],
    ['difference, commit after M older than 3 h', differs, afterM(4), 4, 'stale', 1],
    ['difference, no commit after M, M younger than 3 h', differs, onlyM(1), 1, 'lag', 0],
    ['difference, no commit after M, M older than 3 h', differs, onlyM(4), 4, 'stale', 1],
    ['human action', humanAction, afterM(1), 1, 'human-action', 1],
  ] as const)('daily classifies %s from the git history and saves the writer repair summary', (_name, summary, history, sinceHours, freshness, exit) => {
    const result = runLane(['architecture'], { check: JSON.stringify(summary), checkExit: summary.renderEquivalent === true ? 0 : 1, summary: true, history: [...history] });
    expect(result.status, result.stderr).toBe(exit);
    expect(result.checked).toBe(true);
    expect(result.debtArgs).toBeNull();
    expect(result.summary).toMatchObject({ ...summary, freshness });
    expect(Math.round((Date.now() - Date.parse(result.summary.unpublishedSince)) / 3_600_000)).toBe(sinceHours);
    expect(warnings(result.stdout).length).toBe(freshness === 'lag' ? 1 : 0);
    expect(result.stdout).not.toContain('[ci] typecheck');
  });

  test.each([
    ['no commit changes the projection manifest', { history: [{ manifest: false, hoursAgo: 1 }] }, 'No first-parent commit changes docs/architecture/.projection-manifest.json.'],
    // The young boundary commit of a shallow clone would read as M and give a false lag.
    ['the checkout is shallow', { history: afterM(4), shallow: true }, 'The checkout is shallow'],
    // Without the status check, the failed read would fall back to the time of M and pass as lag.
    ['the commits after M cannot be read', { history: [{ manifest: true, hoursAgo: 1 }, { manifest: false, hoursAgo: 0.5 }], gitFails: 'rev-list' }, 'fatal: injected rev-list failure'],
  ])('daily fails closed with no summary when %s', (_name, fixture, message) => {
    const result = runLane(['architecture'], { check: JSON.stringify(differs), checkExit: 1, summary: true, ...fixture });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(result.stderr).toContain('The oldest unpublished main commit could not be read from git.');
    expect(result.summary).toBeNull();
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

describe('released CHANGELOG sections', () => {
  const CHANGELOG = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- New entry. (#3)\n\n## [0.31.0] - 2026-11-12\n\n### Added\n\n- Released entry. (#1)\n\n## [0.30.0] - 2026-11-10\n\n### Fixed\n\n- Older entry. (#2)\n`;  // The merge result that git makes when the base renames [Unreleased] to 0.31.0 and the head adds its entry
  // below the old heading: the entry lands inside the released section and the merge is still clean.
  const PLACED_INSIDE = CHANGELOG.replace('- Released entry. (#1)\n', '- Released entry. (#1)\n- New entry. (#3)\n');
  const RELEASE = CHANGELOG.replace('## [Unreleased]\n', '## [Unreleased]\n\n## [0.32.0] - 2026-11-14\n\n### Added\n\n- The release entry. (#4)\n');
  // After the cutover `docs/CHANGELOG.md` holds released sections only, and each PR writes a fragment.
  const CUT = CHANGELOG.replace('## [Unreleased]\n\n### Added\n\n- New entry. (#3)\n\n', '');
  // The preamble of a real `docs/CHANGELOG.md`: the only text that may stand above the first released section.
  const CUT_PREAMBLE = CHANGELOG.slice(0, CHANGELOG.indexOf('## [Unreleased]'));

  // This case does two jobs. It proves that the fragments committed in this repository parse, and it keeps
  // this test file a named reader of `docs/changelog.d` and `docs/CHANGELOG.md`. The CI selection makes a
  // documents-only diff `affected` only when a test names the changed document, and the `architecture-advisory`
  // lane that runs the check starts only in mode `affected`. Without this reader a PR that changes one fragment
  // would select mode `documentation`, skip the lane, and pass `Required / CI` with no changelog check.
  test('every committed fragment parses, and this test reads the fragment directory', () => {
    // The literal path is load-bearing: the CI selection reads this test as a named reader of the fragment
    // directory, and only then does a documents-only changelog diff select mode `affected`.
    // No fragment is a valid state: git does not track an empty directory, so a release commit that deletes
    // the last fragment leaves no directory at all. The read below is therefore conditional, and the
    // assertion is that the two readers agree, not that files exist. The literal path stays: it is what
    // makes this test a named reader of the fragment directory for the CI selection.
    const present = existsSync(join(ROOT, 'docs/changelog.d'));
    const paths = present ? readdirSync(join(ROOT, 'docs/changelog.d')).map((name) => `docs/changelog.d/${name}`).sort() : [];
    expect(fragmentPaths(ROOT)).toEqual(paths);
    for (const path of paths) expect([path, parseFragment(path, readFileSync(join(ROOT, path), 'utf8')).path]).toEqual([path, path]);
    // The released file holds no authoring heading: the fragments are its only authoring path.
    const changelog = readFileSync(join(ROOT, 'docs/CHANGELOG.md'), 'utf8');
    expect(changelog.includes('## [Unreleased]')).toBe(false);
    expect(changelog.startsWith('# Changelog')).toBe(true);
  });

  test('a section runs from its heading to the next version heading', () => {
    const sections = releasedSections(CHANGELOG);
    expect([...sections.keys()]).toEqual(['0.31.0', '0.30.0']);
    expect(sections.get('0.31.0')).toBe('## [0.31.0] - 2026-11-12\n\n### Added\n\n- Released entry. (#1)\n\n');
    expect(sections.get('0.30.0')!.endsWith('- Older entry. (#2)\n')).toBe(true);
    // [Unreleased] is not a released section, so its entries are free to change.
    expect(sections.has('Unreleased')).toBe(false);
  });

  test('an entry that a merge placed inside a released section is drift', () => {
    expect(sectionDrift(CHANGELOG, PLACED_INSIDE)).toEqual([{ version: '0.31.0', reason: 'changed' }]);
  });

  test('an [Unreleased] entry and a new version section are not drift', () => {
    const entryOnly = CHANGELOG.replace('- New entry. (#3)', '- New entry. (#3) and a second sentence.');
    expect(sectionDrift(CHANGELOG, entryOnly)).toEqual([]);
    expect(sectionDrift(CHANGELOG, RELEASE)).toEqual([]);
  });

  test('a removed released section is drift, and a duplicate version heading fails closed', () => {
    const removed = CHANGELOG.replace(/## \[0\.30\.0\][\s\S]*$/, '');
    expect(sectionDrift(CHANGELOG, removed)).toEqual([{ version: '0.30.0', reason: 'removed' }]);
    expect(() => releasedSections(`${CHANGELOG}\n## [0.31.0] - 2026-11-13\n`)).toThrow('two sections for version 0.31.0');
  });

  // The real fault from #2622: the released section at the base of the merge result, not of the branch.
  test('the check compares with the PR base of the merge result, not with the merge base of the branch', () => {
    const repo = mkdtempSync(join(tmpdir(), 'rh-changelog-sections-'));
    const git = (...args: string[]) => {
      const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      if (result.status !== 0) throw Error(result.stderr);
      return result.stdout.trim();
    };
    const commit = (path: string, content: string, message: string) => {
      mkdirSync(resolve(repo, path, '..'), { recursive: true });
      writeFileSync(join(repo, path), content);
      git('add', '.');
      git('commit', '-qm', message);
      return git('rev-parse', 'HEAD');
    };
    try {
      git('init', '-q', '-b', 'main'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
      const before = commit('docs/CHANGELOG.md', CHANGELOG, 'before release');
      // The branch starts before the release commit and adds its entry below [Unreleased].
      git('checkout', '-q', '-b', 'entry');
      const head = commit('docs/CHANGELOG.md', CHANGELOG.replace('- New entry. (#3)', '- New entry. (#3) [the PR entry]'), 'the PR entry');
      // main publishes a release: the new 0.32.0 section takes the entries that were under [Unreleased].
      git('checkout', '-q', 'main');
      const base = commit('docs/CHANGELOG.md', RELEASE, 'release 0.32.0');
      // git places the branch hunk by its context lines, so the entry lands inside the released 0.32.0 section.
      const report = checkReleasedSections(base, head, repo);
      expect(report.sectionsAtBase).toBe(3);
      expect(report.drift).toEqual([{ version: '0.32.0', reason: 'changed' }]);
      // The same head against the pre-release base keeps the entry under [Unreleased], so there is no drift:
      // the release commit, not the branch, moved the entry into a released section.
      expect(checkReleasedSections(before, head, repo).drift).toEqual([]);
      // A branch that starts at the release commit and adds its entry under [Unreleased] passes.
      git('checkout', '-q', '-b', 'rebased', base);
      const rebased = commit('docs/CHANGELOG.md', RELEASE.replace('## [Unreleased]\n', '## [Unreleased]\n\n### Added\n\n- Rebased entry. (#5)\n'), 'the rebased entry');
      expect(checkReleasedSections(base, rebased, repo).drift).toEqual([]);
      // A base that git cannot resolve fails with the reason, not with a silent pass.
      expect(() => checkReleasedSections('missing', rebased, repo)).toThrow('is not a commit');
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  function cutoverRepository(name: string) {
    const repo = mkdtempSync(join(tmpdir(), name));
    const git = (...args: string[]) => {
      const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      if (result.status !== 0) throw Error(result.stderr);
      return result.stdout.trim();
    };
    const write = (path: string, content: string) => {
      mkdirSync(resolve(repo, path, '..'), { recursive: true });
      writeFileSync(join(repo, path), content);
    };
    const commit = (message: string) => { git('add', '.'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'CI fixture');
    git('config', 'user.email', 'ci@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    return { repo, git, write, commit };
  }

  // Contract item 3: the merge result must follow the fragment form, and the error names the path form.
  test('a merge result whose text above the first released section differs from the base fails, and the error names the fragment path form', () => {
    const { repo, git, write, commit } = cutoverRepository('rh-changelog-preamble-');
    try {
      // Two base states, because the rule has one allowed difference and it comes from the base.
      // Base A still holds `## [Unreleased]`: the cutover that removes the block is allowed.
      const PREAMBLE = CUT.slice(0, CUT.indexOf('## [0.31.0]'));
      const BASE_A = `${PREAMBLE}## [Unreleased]\n\n### Added\n\n- The base entry. (#7)\n\n${CUT.slice(PREAMBLE.length)}`;
      // Base B is post-cutover and holds no `[Unreleased]` block: nothing above the first released
      // section may change, so a restored heading fails.
      const BASE_B = CUT;
      // One root commit, then a fresh branch per case: each case starts from the base text it names.
      write('docs/CHANGELOG.md', BASE_B);
      const root = commit('the root commit');
      // An unchanged file gives an empty diff, which is a real case here, so the commits allow it.
      const commitCase = (message: string) => { git('add', '-A'); git('commit', '-qm', message, '--allow-empty'); return git('rev-parse', 'HEAD'); };
      const faultsOf = (baseText: string, headText: string, name: string) => {
        git('checkout', '-q', '-B', 'work', root);
        write('docs/CHANGELOG.md', baseText);
        const base = commitCase(`base for ${name}`);
        write('docs/CHANGELOG.md', headText);
        return checkReleasedSections(base, commitCase(name), repo);
      };
      // Each of these changes a byte above the first released section, and none is the allowed cutover.
      const refused = [
        ['an added prose line', BASE_B, `${PREAMBLE}An added sentence.\n\n${CUT.slice(PREAMBLE.length)}`],
        ['a restored [Unreleased] heading', BASE_B, BASE_A],
        ['an entry with no heading', BASE_B, `${PREAMBLE}- Directly authored entry. (#6)\n\n${CUT.slice(PREAMBLE.length)}`],
        ['a star bullet', BASE_B, `${PREAMBLE}* A star bullet.\n\n${CUT.slice(PREAMBLE.length)}`],
        ['an indented heading', BASE_B, `${PREAMBLE}  ### Added\n\n${CUT.slice(PREAMBLE.length)}`],
        // A pre-cutover base allows only the removal. The block may not be kept, and not edited either:
        // the merge result must hold no `## [Unreleased]` block at all.
        ['a kept [Unreleased] block', BASE_A, BASE_A],
        ['an edited [Unreleased] entry', BASE_A, BASE_A.replace('- The base entry. (#7)', '- A different entry. (#8)')],
        // The transform applies to the base side only, so no trailing newline is normalized away: a base
        // preamble that ends with three newlines expects three, and a merge result with two fails.
        ['a trailing blank line', `${PREAMBLE}\n${CUT.slice(PREAMBLE.length)}`, BASE_B],
      ] as const;
      for (const [name, baseText, headText] of refused) {
        const report = faultsOf(baseText, headText, name);
        // The released sections are untouched in every case, so only the preamble rule can fail the merge.
        expect([name, report.drift]).toEqual([name, []]);
        expect([name, report.fragmentFaults.length]).toEqual([name, 1]);
        expect(report.fragmentFaults[0]).toContain('changes the text above its first released section');
        expect(report.fragmentFaults[0]).toContain(FRAGMENT_PATH_FORM);
        // The lane prints one message that names the base, the head and every fault.
        expect(fragmentMessage(report)).toContain(FRAGMENT_PATH_FORM);
      }
      // The allowed forms pass: the cutover from a pre-cutover base, and an unchanged post-cutover file.
      expect(faultsOf(BASE_A, BASE_B, 'the cutover').fragmentFaults).toEqual([]);
      expect(faultsOf(BASE_B, BASE_B, 'unchanged').fragmentFaults).toEqual([]);
      // The preamble reader is the rule's input: the cutover's preamble is the base's minus the block.
      expect(changelogPreamble(BASE_B)).toBe(PREAMBLE);
      expect(changelogPreamble(BASE_A)).toContain('## [Unreleased]');
      // The transform is a cut at the heading and nothing else: a base without the block keeps every byte,
      // trailing newlines included, so the rule never normalizes the merge result either.
      expect(withoutUnreleasedSection(PREAMBLE)).toBe(PREAMBLE);
      expect(withoutUnreleasedSection(`${PREAMBLE}\n`)).toBe(`${PREAMBLE}\n`);
      expect(withoutUnreleasedSection(changelogPreamble(BASE_A))).toBe(PREAMBLE);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  test('a fragment with an unknown category, no entry line or a heading line fails, and a multi-bullet fragment passes', () => {
    const { repo, git, write, commit } = cutoverRepository('rh-changelog-fragment-faults-');
    try {
      write('docs/CHANGELOG.md', CUT);
      const base = commit('the cutover');
      git('checkout', '-q', '-b', 'fragments');
      // Contract item 2: a fragment holds "one or more - bullet lines", so two entries of one category are legal.
      write('docs/changelog.d/31.added.md', '- An added entry. (#31)\n- A second entry of the same category. (#31)\n');
      expect(checkReleasedSections(base, commit('a valid fragment'), repo).fragmentFaults).toEqual([]);
      // Every fault is named with its own path, and the check reads each path under the directory.
      const faults = [
        ['docs/changelog.d/32.improved.md', '- An entry. (#32)\n', `the path form is ${FRAGMENT_PATH_FORM}`],
        ['docs/changelog.d/next.fixed.md', '- An entry.\n', `the path form is ${FRAGMENT_PATH_FORM}`],
        ['docs/changelog.d/33.fixed.md', 'An entry with no bullet line.\n', 'holds a line that is not a "- " entry'],
        // A heading would put a section in the released section that no entry accounts for.
        ['docs/changelog.d/34.fixed.md', '- An entry. (#34)\n\n### Upgrade\n\n- Another. (#34)\n', 'holds a line that is not a "- " entry'],
        ['docs/changelog.d/35.fixed.md', '', 'is empty'],
        ['docs/changelog.d/README.md', '- An entry.\n', `the path form is ${FRAGMENT_PATH_FORM}`],
      ] as const;
      for (const [path, content, fault] of faults) {
        write(path, content);
        const report = checkReleasedSections(base, commit(`fault ${path}`), repo);
        expect([path, report.fragmentFaults.length]).toEqual([path, 1]);
        expect(report.fragmentFaults[0]).toStartWith(`${path} `);
        expect(report.fragmentFaults[0]).toContain(fault);
        unlinkSync(join(repo, path));
        commit(`drop ${path}`);
      }
      expect(checkReleasedSections(base, git('rev-parse', 'HEAD'), repo).fragmentFaults).toEqual([]);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  // Contract item 3: `assemble` writes the section above the newest released section, in category order and
  // issue order, and deletes the fragments. It copies the bullet bytes and adds no reference.
  test('assemble writes the section in category and issue order above the newest release and deletes the fragments', () => {
    const { repo, write } = cutoverRepository('rh-changelog-assemble-');
    try {
      write('docs/CHANGELOG.md', CUT);
      write('docs/changelog.d/42.fixed.md', '- The second fix. (#42)\n- A second bullet of the second fix.\n');
      write('docs/changelog.d/41.fixed.md', '- The first fix. (#41)\n');
      write('docs/changelog.d/43.breaking.md', '- The breaking change. (#43)\n');
      write('docs/changelog.d/43.added.md', '- The added change. (#43)\n');
      expect(fragmentPaths(repo)).toEqual(['docs/changelog.d/41.fixed.md', 'docs/changelog.d/42.fixed.md', 'docs/changelog.d/43.added.md', 'docs/changelog.d/43.breaking.md']);
      const result = assemble({ version: '0.32.0', date: '2026-11-14', root: repo });
      expect(result.removed).toEqual(['docs/changelog.d/41.fixed.md', 'docs/changelog.d/42.fixed.md', 'docs/changelog.d/43.added.md', 'docs/changelog.d/43.breaking.md']);
      // A section writes its bullets on consecutive lines, as every released section of the file does.
      expect(result.section).toBe('## [0.32.0] - 2026-11-14\n\n### Breaking\n\n- The breaking change. (#43)\n\n### Added\n\n- The added change. (#43)\n\n### Fixed\n\n- The first fix. (#41)\n- The second fix. (#42)\n- A second bullet of the second fix.\n\n');
      const after = readFileSync(join(repo, 'docs/CHANGELOG.md'), 'utf8');
      // The new section takes the place of the deleted [Unreleased] heading, and every older section keeps its bytes.
      expect(after).toBe(`# Changelog\n\n${result.section}${CUT.slice('# Changelog\n\n'.length)}`);
      expect(releasedSections(after).get('0.31.0')).toBe(releasedSections(CUT).get('0.31.0'));
      expect(fragmentPaths(repo)).toEqual([]);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  // Git does not track an empty directory, so a release commit that deletes the last fragment leaves no
  // `docs/changelog.d` at all. Both states must read as zero fragments, with no error and no section.
  test('assemble with no docs/changelog.d and with an empty one gives no error and no section', () => {
    const { repo, write, commit } = cutoverRepository('rh-changelog-assemble-empty-');
    try {
      write('docs/CHANGELOG.md', CUT);
      const base = commit('a tree with no fragment directory');
      expect(fragmentPaths(repo)).toEqual([]);
      const absent = assemble({ version: '0.32.0', date: '2026-11-14', root: repo });
      expect(absent).toEqual({ version: '0.32.0', section: '', removed: [] });
      // The file is untouched: no section is written.
      expect(readFileSync(join(repo, 'docs/CHANGELOG.md'), 'utf8')).toBe(CUT);
      // An empty directory is the same state. It is not committed, because git cannot hold it.
      mkdirSync(join(repo, 'docs/changelog.d'), { recursive: true });
      expect(fragmentPaths(repo)).toEqual([]);
      expect(assemble({ version: '0.32.0', date: '2026-11-14', root: repo })).toEqual({ version: '0.32.0', section: '', removed: [] });
      // The check reads the same two states as zero fragments, not as a fault.
      expect(checkReleasedSections(base, base, repo).fragmentFaults).toEqual([]);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  test('assemble fails with a fragment that does not parse and with a version that exists', () => {
    const { repo, write } = cutoverRepository('rh-changelog-assemble-faults-');
    try {
      write('docs/CHANGELOG.md', CUT);
      write('docs/changelog.d/44.changed.md', 'no bullet line\n');
      expect(() => assemble({ version: '0.32.0', date: '2026-11-14', root: repo })).toThrow('holds a line that is not a "- " entry');
      write('docs/changelog.d/44.changed.md', '- An entry. (#44)\n');
      expect(() => assemble({ version: '0.31.0', date: '2026-11-14', root: repo })).toThrow('already has a section for 0.31.0');
      // A refused run leaves the file and the fragment as they were.
      expect(readFileSync(join(repo, 'docs/CHANGELOG.md'), 'utf8')).toBe(CUT);
      expect(fragmentPaths(repo)).toEqual(['docs/changelog.d/44.changed.md']);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  test('the fragment parser keeps the bullet bytes and rejects a path outside the form', () => {
    expect(parseFragment('docs/changelog.d/2660.changed.md', '- One entry.\n- Another.\n\n')).toEqual({
      path: 'docs/changelog.d/2660.changed.md', issue: 2660, category: 'changed', block: '- One entry.\n- Another.',
    });
    // The assembler copies the bytes: it adds no reference and rewrites nothing.
    expect(renderSection('0.32.0', '2026-11-14', [parseFragment('docs/changelog.d/7.added.md', '- `x` stays `x`. (#7)\n')]))
      .toBe('## [0.32.0] - 2026-11-14\n\n### Added\n\n- `x` stays `x`. (#7)\n\n');
    expect(() => parseFragment('docs/CHANGELOG.md', '- An entry.\n')).toThrow(FRAGMENT_PATH_FORM);
    // The category is lower case, so a heading form in the file name is not a fragment.
    expect(() => parseFragment('docs/changelog.d/7.Changed.md', '- An entry.\n')).toThrow(FRAGMENT_PATH_FORM);
  });

  // A conflicted merge gives no tree whose released sections are evidence. Before this case, a conflict in a path
  // other than docs/CHANGELOG.md left the released sections equal and the check reported success.
  test('a conflict in any path fails closed and names the conflicted paths', () => {
    const repo = mkdtempSync(join(tmpdir(), 'rh-changelog-conflict-'));
    const git = (...args: string[]) => {
      const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      if (result.status !== 0) throw Error(result.stderr);
      return result.stdout.trim();
    };
    const write = (path: string, content: string) => { mkdirSync(resolve(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), content); };
    const commit = (message: string) => { git('add', '.'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
    try {
      git('init', '-q', '-b', 'main'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
      write('docs/CHANGELOG.md', CHANGELOG);
      write('src/a.ts', 'export const value = 1;\n');
      write('src/b.ts', 'export const other = 1;\n');
      commit('base');
      // The branch and main change the same line of src/a.ts, so the merge conflicts outside the CHANGELOG.
      git('checkout', '-q', '-b', 'branch');
      write('src/a.ts', 'export const value = 2;\n');
      const head = commit('the branch');
      git('checkout', '-q', 'main');
      write('src/a.ts', 'export const value = 3;\n');
      const base = commit('main moves');
      // The released sections are untouched by both sides, so only the conflict can stop this check.
      expect(() => checkReleasedSections(base, head, repo)).toThrow(/conflicts in src\/a\.ts/);
      // A conflict inside the CHANGELOG is reported the same way, with the path named.
      git('checkout', '-q', '-b', 'changelog', base);
      write('docs/CHANGELOG.md', CHANGELOG.replace('- Older entry. (#2)', '- Older entry. (#2) [branch]'));
      const changelogHead = commit('the branch edits a released line');
      git('checkout', '-q', 'main');
      write('docs/CHANGELOG.md', CHANGELOG.replace('- Older entry. (#2)', '- Older entry. (#2) [main]'));
      const changelogBase = commit('main edits the same line');
      expect(() => checkReleasedSections(changelogBase, changelogHead, repo)).toThrow(/conflicts in docs\/CHANGELOG\.md/);
      // Two paths that conflict are both named, so the reader gets the whole conflict set.
      git('checkout', '-q', 'branch');
      write('src/b.ts', 'export const other = 2;\n');
      const twoPathHead = commit('the branch edits both');
      git('checkout', '-q', 'main');
      write('src/b.ts', 'export const other = 3;\n');
      const twoPathBase = commit('main edits both');
      expect(() => checkReleasedSections(twoPathBase, twoPathHead, repo)).toThrow(/conflicts in src\/a\.ts, src\/b\.ts/);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
});
