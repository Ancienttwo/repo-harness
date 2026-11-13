import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fixtureGit, fixtureWrite } from './helpers/module-repository';

// Real-entry regressions for the archimap measure script: every case runs the
// committed script through Bun against a real committed Git repository, with
// no mocked transpiler or dependency resolution.
const MEASURE = join(import.meta.dir, '..', 'assets/skills/repo-harness-archimap/scripts/measure.ts');
function moduleDefs() {
  return [
    { id: 'app', include: ['apps/app/**'] },
    { id: 'client', include: ['packages/shared/src/client.ts'] },
    { id: 'server', include: ['packages/shared/src/server/**'] },
    { id: 'shared', include: ['packages/shared/src/main.ts'] },
  ];
}

interface MeasureOutput {
  modules: {
    id: string; files: number; loc: number; self: number; docs: string[];
    behaviorSpecs: { id: string; path: string; node: string }[];
    stateMachines: { id: string; name: string; capabilityId: string; path: string; doc: string | null }[];
  }[];
  model: { uncoveredNodes: string[]; unknownNodes: string[]; duplicateNodes: string[]; undocumentedNodes: string[] };
  edges: { from: string; to: string; value: number }[];
  unresolved: { count: number; examples: string[] };
}

// The script reads the model node directory and the committed projection manifest; the fixture
// writes both, because the map no longer falls back to package or directory layout.
const MODEL_DIR = 'model/nodes';
const MANIFEST = 'docs/architecture/.projection-manifest.json';
interface ManifestEntry { capabilityId: string; path?: string; members?: string[] }
type FixtureNode = [id: string, kind: string, fields?: Record<string, unknown>];
/** A declared machine: the state-machine directory sits beside the node directory. */
type FixtureMachine = [id: string, capabilityId: string];
interface FixtureModel { nodes?: FixtureNode[]; manifest?: ManifestEntry[]; machines?: FixtureMachine[] }
const DEFAULT_NODES: FixtureNode[] = [['capability.example', 'capability']];
const DEFAULT_MANIFEST: ManifestEntry[] = [{ capabilityId: 'capability.example', path: 'docs/architecture/modules/example/example.md' }];

function nodeYaml(id: string, kind: string, fields: Record<string, unknown> = {}): string {
  return `${JSON.stringify({ schemaVersion: 'archcontext.node/v2', id, kind, ...fields })}\n`;
}
function manifest(entries: ManifestEntry[]): string {
  const targets: Record<string, unknown> = {};
  for (const entry of entries) {
    const row: Record<string, unknown> = {
      type: 'entity-summary',
      scope: { kind: 'entity', id: entry.capabilityId, entityKind: 'capability' },
      ownership: 'mixed',
      format: 'markdown',
      outputDigest: `sha256:${'0'.repeat(64)}`,
    };
    if (entry.path !== undefined) row.path = entry.path;
    targets[`projection_target.entity.${entry.capabilityId}`] = row;
  }
  const capabilities = entries.map((entry) => ({ capabilityId: entry.capabilityId, memberNodeIds: [entry.capabilityId, ...(entry.members ?? [])] }));
  return `${JSON.stringify({ schemaVersion: 'archcontext.architecture-docs-projection-manifest/v4', semanticBaseline: { capabilities }, targets }, null, 2)}\n`;
}

const roots: string[] = [];
function fixture(files: Record<string, string>, modules: unknown = moduleDefs(), model: FixtureModel = {}): string {
  const root = mkdtempSync('/tmp/rh-archimap-measure-');
  roots.push(root);
  fixtureGit(root, ['init', '-q']);
  fixtureGit(root, ['config', 'maintenance.auto', 'false']);
  fixtureGit(root, ['config', 'gc.auto', '0']);
  for (const [path, content] of Object.entries(files)) fixtureWrite(root, path, content);
  fixtureWrite(root, 'modules.json', `${JSON.stringify({ modules })}\n`);
  for (const [id, kind, fields] of model.nodes ?? DEFAULT_NODES) fixtureWrite(root, `${MODEL_DIR}/${id}.yaml`, nodeYaml(id, kind, fields));
  for (const [id, capabilityId] of model.machines ?? []) {
    fixtureWrite(root, `model/state-machines/${id}.yaml`, `${JSON.stringify({ schemaVersion: 'archcontext.state-machine/v1', id, capabilityId, name: `Machine ${id}`, regions: [] })}\n`);
  }
  fixtureWrite(root, MANIFEST, manifest(model.manifest ?? DEFAULT_MANIFEST));
  fixtureGit(root, ['add', '.']);
  fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture']);
  return root;
}
function runMeasure(args: string[]): string {
  return execFileSync('bun', [MEASURE, ...args], { encoding: 'utf8', stdio: 'pipe' });
}
function measure(root: string): MeasureOutput {
  const stdout = runMeasure(['--root', root, '--modules', join(root, 'modules.json'), '--model', MODEL_DIR]);
  return JSON.parse(stdout) as MeasureOutput;
}
/** The exact usage failure: a non-zero exit and the message on stderr. */
function measureFailure(root: string, args: string[]): { status: number | null; stderr: string } {
  try {
    runMeasure(['--root', root, ...args]);
  } catch (error) {
    const failure = error as { status?: number | null; stderr?: Buffer | string };
    return { status: failure.status ?? null, stderr: String(failure.stderr ?? '') };
  }
  throw new Error('measure.ts exited 0; a usage error was expected');
}
const appImport = (specifier: string) => `import { client } from '${specifier}';\nclient();\n`;
const sharedPackage = (pkg: Record<string, unknown>) => `${JSON.stringify(pkg)}\n`;
/** The reviewer's fixture shape: one client file off every resolution fallback, two server files, one app importer. */
function sharedFixture(pkg: Record<string, string | object>, appSpecifier: string): string {
  return fixture({
    'apps/app/main.ts': appImport(appSpecifier),
    'packages/shared/package.json': sharedPackage({ name: '@example/shared', ...pkg }),
    'packages/shared/src/client.ts': 'export const client = 1;\n',
    'packages/shared/src/server/a.ts': 'export const a = 1;\n',
    'packages/shared/src/server/b.ts': 'export const b = 1;\n',
  });
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('archimap measure workspace resolution', () => {
  test('an exports subpath resolves to the module owning the export target', () => {
    const root = sharedFixture({ exports: { './client': './src/client.ts' } }, '@example/shared/client');
    const result = measure(root);
    expect(result.edges).toEqual([{ from: 'app', to: 'client', value: 1 }]);
    expect(result.unresolved.count).toBe(0);
  });

  test('an unsupported exports condition is unresolved, not guessed from file counts', () => {
    const root = sharedFixture({ exports: { './client': { custom: './src/client.ts' } } }, '@example/shared/client');
    const result = measure(root);
    expect(result.edges).toEqual([]);
    expect(result.unresolved.count).toBe(1);
    expect(result.unresolved.examples.some((entry) => entry.includes('@example/shared/client'))).toBe(true);
  });

  test('a bare workspace import without a resolvable entry is unresolved, not guessed', () => {
    const root = sharedFixture({}, '@example/shared');
    const result = measure(root);
    expect(result.edges).toEqual([]);
    expect(result.unresolved.count).toBe(1);
    expect(result.unresolved.examples.some((entry) => entry.includes('@example/shared'))).toBe(true);
  });

  test('a bare workspace import resolves through main to the owning module', () => {
    const root = sharedFixture({ main: './src/main.ts' }, '@example/shared');
    fixtureWrite(root, 'packages/shared/src/main.ts', 'export const main = 1;\n');
    fixtureGit(root, ['add', '.']);
    fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Entry']);
    const result = measure(root);
    expect(result.edges).toEqual([{ from: 'app', to: 'shared', value: 1 }]);
    expect(result.unresolved.count).toBe(0);
  });

  test('a direct subpath outside exports resolves to the tracked file', () => {
    const root = sharedFixture({}, '@example/shared/src/main');
    fixtureWrite(root, 'packages/shared/src/main.ts', 'export const main = 1;\n');
    fixtureGit(root, ['add', '.']);
    fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Entry']);
    const result = measure(root);
    expect(result.edges).toEqual([{ from: 'app', to: 'shared', value: 1 }]);
    expect(result.unresolved.count).toBe(0);
  });

  test('the entry object resolves through its deterministic import condition', () => {
    const root = sharedFixture({ exports: { '.': { require: './src/missing.ts', import: './src/main.ts' } } }, '@example/shared');
    fixtureWrite(root, 'packages/shared/src/main.ts', 'export const main = 1;\n');
    fixtureGit(root, ['add', '.']);
    fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Entry']);
    const result = measure(root);
    expect(result.edges).toEqual([{ from: 'app', to: 'shared', value: 1 }]);
    expect(result.unresolved.count).toBe(0);
  });

  test('a null exports subpath stays unresolved and does not fall back to a direct file', () => {
    const root = sharedFixture({ exports: { './client': null } }, '@example/shared/client');
    // The direct path exists and is owned by another module; a fallback here would invent an edge.
    fixtureWrite(root, 'packages/shared/client.ts', 'export const stray = 1;\n');
    fixtureGit(root, ['add', '.']);
    fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Stray']);
    const result = measure(root);
    expect(result.edges).toEqual([]);
    expect(result.unresolved.count).toBe(1);
    expect(result.unresolved.examples.some((entry) => entry.includes('@example/shared/client'))).toBe(true);
  });

  test('a single-star exports pattern resolves with the captured segment', () => {
    const root = fixture({
      'apps/app/main.ts': appImport('@example/shared/features/client'),
      'packages/shared/package.json': sharedPackage({ name: '@example/shared', exports: { './features/*': './src/features/*.ts' } }),
      'packages/shared/src/features/client.ts': 'export const client = 1;\n',
      'packages/shared/src/server/a.ts': 'export const a = 1;\n',
      'packages/shared/src/server/b.ts': 'export const b = 1;\n',
    }, [
      { id: 'app', include: ['apps/app/**'] },
      { id: 'client', include: ['packages/shared/src/features/**'] },
      { id: 'server', include: ['packages/shared/src/server/**'] },
    ]);
    const result = measure(root);
    expect(result.edges).toEqual([{ from: 'app', to: 'client', value: 1 }]);
    expect(result.unresolved.count).toBe(0);
  });

  test('an undeclared subpath under exports stays unresolved without a direct fallback', () => {
    const root = sharedFixture({ exports: { './client': './src/client.ts' } }, '@example/shared/undeclared');
    fixtureWrite(root, 'packages/shared/undeclared.ts', 'export const stray = 1;\n');
    fixtureGit(root, ['add', '.']);
    fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Stray']);
    const result = measure(root);
    expect(result.edges).toEqual([]);
    expect(result.unresolved.count).toBe(1);
  });
});

describe('archimap measure requires the adopted model', () => {
  test('a missing --model exits 2 instead of falling back to directory layout', () => {
    const root = fixture({ 'apps/app/main.ts': 'export const app = 1;\n' });
    const failure = measureFailure(root, ['--modules', join(root, 'modules.json')]);
    expect(failure.status).toBe(2);
    expect(failure.stderr).toContain('--model is required');
  });

  test('a missing projection manifest exits 2', () => {
    const root = fixture({ 'apps/app/main.ts': 'export const app = 1;\n' });
    unlinkSync(join(root, MANIFEST));
    const failure = measureFailure(root, ['--modules', join(root, 'modules.json'), '--model', MODEL_DIR]);
    expect(failure.status).toBe(2);
    expect(failure.stderr).toContain(MANIFEST);
  });

  test.each([
    ['a v3 manifest that lists capability members', 'v3', null],
    ['a v3 manifest with an unmet renderer floor', 'v3', 'archcontext.docs-renderer/v7'],
    ['a v5 manifest', 'v5', null],
  ])('%s exits 2 and names both remedies', (_name, schema, floor) => {
    const root = fixture({ 'apps/app/main.ts': 'export const app = 1;\n' });
    const v4 = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'));
    writeFileSync(join(root, MANIFEST), JSON.stringify({ ...v4, schemaVersion: `archcontext.architecture-docs-projection-manifest/${schema}`, ...(floor === null ? {} : { minimumRendererVersion: floor }) }));
    const failure = measureFailure(root, ['--modules', join(root, 'modules.json'), '--model', MODEL_DIR]);
    expect(failure.status).toBe(2);
    expect(failure.stderr).toContain(`"archcontext.architecture-docs-projection-manifest/${schema}" is not archcontext.architecture-docs-projection-manifest/v4`);
    expect(failure.stderr).toContain('update repo-harness for a newer manifest or when archctx reports projection-manifest-incompatible');
  });

  test('a capability target without a document path exits 2 instead of guessing one', () => {
    const root = fixture({ 'apps/app/main.ts': 'export const app = 1;\n' }, moduleDefs(), {
      manifest: [{ capabilityId: 'capability.example' }],
    });
    const failure = measureFailure(root, ['--modules', join(root, 'modules.json'), '--model', MODEL_DIR]);
    expect(failure.status).toBe(2);
    expect(failure.stderr).toContain('.path must be a document path');
  });

  test('modules link to the capability documents of the projection manifest', () => {
    const root = fixture({
      'src/alpha/core.ts': 'export const core = 1;\n',
      'src/beta/beta.ts': 'export const beta = 1;\n',
    }, [
      { id: 'alpha', include: ['src/alpha/**'], nodes: ['component.alpha.core'] },
      { id: 'beta', include: ['src/beta/**'], nodes: ['capability.beta'] },
    ], {
      nodes: [['capability.alpha', 'capability'], ['capability.beta', 'capability'], ['component.alpha.core', 'component']],
      manifest: [{ capabilityId: 'capability.alpha', path: 'docs/architecture/modules/dom/alpha.md', members: ['component.alpha.core'] }],
    });
    const result = measure(root);
    // A component node resolves through the capability whose memberNodeIds name it; a capability with
    // no target has no document, and the script does not build a path from its id.
    expect(result.modules.map((module) => module.docs)).toEqual([
      ['docs/architecture/modules/dom/alpha.md'],
      [],
    ]);
    // measure.ts reports the path from the repository root. The map links it from
    // docs/architecture/archimap.html, so the path must sit under the map directory and resolve
    // back to the same document after the prefix is removed.
    const doc = result.modules[0]!.docs[0]!;
    expect(doc.startsWith('docs/architecture/')).toBe(true);
    expect(posix.join('docs/architecture', doc.slice('docs/architecture/'.length))).toBe(doc);
    expect(result.model.undocumentedNodes).toEqual(['capability.beta']);
    // The fixture model has no state-machine directory: no module lists a machine.
    expect(result.modules.map((module) => module.stateMachines)).toEqual([[], []]);
    expect(result.model.uncoveredNodes).toEqual(['capability.alpha']);
    expect(result.model.unknownNodes).toEqual([]);
    expect(result.model.duplicateNodes).toEqual([]);
  });
});

describe('archimap measure reads behavior specs', () => {
  const SPEC = 'specs/tla/Protocol.tla';
  const specNode = (behaviorSpecs: unknown, parent = 'capability.alpha'): FixtureModel => ({
    nodes: [
      ['capability.alpha', 'capability'],
      ['capability.beta', 'capability'],
      ['component.alpha.protocol', 'component', { parent, extensions: { behaviorSpecs } }],
    ],
    manifest: [{ capabilityId: 'capability.alpha', path: 'docs/architecture/modules/dom/alpha.md' }],
  });
  const specFixture = (model: FixtureModel) => fixture({ 'src/alpha/core.ts': 'export const core = 1;\n', [SPEC]: '---- MODULE Protocol ----\n' }, [
    { id: 'alpha', include: ['src/alpha/**'], nodes: ['capability.alpha'] },
    { id: 'beta', include: ['src/beta/**'], nodes: ['capability.beta'] },
  ], model);
  const specArgs = (root: string) => ['--modules', join(root, 'modules.json'), '--model', MODEL_DIR];

  test('a spec lands on the module that lists the nearest ancestor of its node', () => {
    const result = measure(specFixture(specNode([{ id: 'protocol-claim', path: SPEC }])));
    expect(result.modules.map((module) => module.behaviorSpecs)).toEqual([
      [{ id: 'protocol-claim', path: SPEC, node: 'component.alpha.protocol' }],
      [],
    ]);
  });

  test('a spec path that does not exist exits 2 with behavior_spec_missing', () => {
    const root = specFixture(specNode([{ id: 'protocol-claim', path: 'specs/tla/Missing.tla' }]));
    const failure = measureFailure(root, specArgs(root));
    expect(failure.status).toBe(2);
    expect(failure.stderr).toContain('behavior_spec_missing:specs/tla/Missing.tla');
  });

  test.each([
    ['an entry without path', [{ id: 'protocol-claim' }]],
    ['a non-kebab-case id', [{ id: 'Protocol_Claim', path: SPEC }]],
    ['an absolute path', [{ id: 'protocol-claim', path: `/${SPEC}` }]],
    ['a path outside the repository', [{ id: 'protocol-claim', path: `../${SPEC}` }]],
    ['an extra entry key', [{ id: 'protocol-claim', path: SPEC, kind: 'tla' }]],
    ['a value that is not a list', { id: 'protocol-claim', path: SPEC }],
  ])('%s exits 2 with behavior_spec_invalid instead of a skip', (_name, behaviorSpecs) => {
    const root = specFixture(specNode(behaviorSpecs));
    const failure = measureFailure(root, specArgs(root));
    expect(failure.status).toBe(2);
    expect(failure.stderr).toContain('behavior_spec_invalid:component.alpha.protocol');
  });

  test('a spec node that no module covers on its parent chain exits 2 with behavior_spec_uncovered', () => {
    const root = specFixture(specNode([{ id: 'protocol-claim', path: SPEC }], 'capability.unlisted'));
    const failure = measureFailure(root, specArgs(root));
    expect(failure.status).toBe(2);
    expect(failure.stderr).toContain('behavior_spec_uncovered:component.alpha.protocol');
  });
});

describe('archimap measure reports board geometry', () => {
  const box = (cls: string, left: number, top: number) =>
    `<div class="${cls}" style="left:${left}px;top:${top}px;width:100px;height:100px"></div>`;
  const board = (caption: string, body: string) => `<section><h2 class="caption">${caption}</h2><div class="board">${body}</div></section>`;
  const paths = (...d: string[]) => `<svg><defs><marker id="m"><path d="M0 0 C1 1 2 2 3 3"/></marker></defs>${d.map((v) => `<path d="${v}"/>`).join('')}</svg>`;
  const mapHtml = (boards: string[]) =>
    `<script type="application/json" id="archimap-meta">${JSON.stringify({ modules: moduleDefs() })}</script>${boards.join('')}`;
  const mapRoot = (boards: string[]) => fixture({ 'map.html': mapHtml(boards) });
  const mapArgs = (root: string) => ['--map', join(root, 'map.html'), '--model', MODEL_DIR];
  type Geometry = { checked: string[]; unchecked: string[]; findings: { board: string; kind: string }[] };

  test('each defect kind gives one finding; clean and node-free boards give none; exit stays 0', () => {
    const placed = board('1 · Placed',
      `${box('node', 0, 0)}${box('node', 50, 50)}${box('node', 400, 0)}`
      + paths('M500 50 H560')
      + '<div class="elabel" style="left:520px;top:42px">hi</div>');
    const clean = board('2 · Clean', `${box('node', 0, 0)}${box('node', 300, 0)}${paths('M100 50 H300')}<div class="elabel" style="left:150px;top:20px">ok</div>`);
    const sequence = board('3 · Sequence', `${box('panel', 0, 0)}<svg><path d="M0 0 C1 1 2 2 3 3"/></svg>`);
    const root = mapRoot([placed, clean, sequence]);
    const output = JSON.parse(runMeasure(['--root', root, ...mapArgs(root)])) as { geometry: Geometry };
    expect(output.geometry.checked).toEqual(['1 · Placed', '2 · Clean']);
    expect(output.geometry.unchecked).toEqual(['3 · Sequence']);
    expect(output.geometry.findings.map((f) => [f.board, f.kind])).toEqual([
      ['1 · Placed', 'box_overlap'],
      ['1 · Placed', 'line_end_open'],
      ['1 · Placed', 'label_on_line'],
    ]);
  });

  test('a path command outside M, H, V, L on a checked board exits 2', () => {
    const root = mapRoot([board('1 · Curve', `${box('node', 0, 0)}${paths('M100 50 C150 50 200 50 250 50')}`)]);
    const failure = measureFailure(root, mapArgs(root));
    expect(failure.status).toBe(2);
    expect(failure.stderr).toContain('geometry_path_unsupported:1 · Curve');
  });

  const run = (boards: string[]) => {
    const root = mapRoot(boards);
    return (JSON.parse(runMeasure(['--root', root, ...mapArgs(root)])) as { geometry: Geometry }).geometry;
  };

  test('each subpath of a path is checked for open ends', () => {
    const geometry = run([board('1 · Subpaths', `${box('node', 0, 0)}${box('node', -200, 0)}${paths('M0 20 H-100 M-300 20 H-400 M0 40 H-100')}`)]);
    expect(geometry.findings.map((f) => f.kind)).toEqual(['line_end_open', 'line_end_open']);
  });

  // Probes of PR #2168 rounds 1-6 and the owner-approved design table. The node is (0,0)-(100,100) unless `node` is set.
  const throughBox: { d: string; node?: [number, number]; found: boolean }[] = [
    { d: 'M0 50 H150 V60 H50 H150', found: true },
    { d: 'M0 50 H16', node: [16, 100], found: false },
    { d: 'M5 50 H-5 H-100', found: false },
    { d: 'M-100 50 H-5 H5', found: false },
    { d: 'M1 40 V50', found: false },
    { d: 'M1 50 V40', found: false },
    { d: 'M-100 50 H5 H-100', found: false },
    { d: 'M50 50 H50', found: true },
    { d: 'M-50 50 H150', found: true },
    { d: 'M-80 50 H0', found: false },
    { d: 'M-80 50 H8', found: false },
    { d: 'M-80 50 H9', found: true },
    { d: 'M-10 4 L4 -10', found: false },
    { d: 'M-10 40 L40 -10', found: true },
    { d: 'M-50 3 H150', found: false },
    { d: 'M-50 8 H150', found: false },
  ];
  test.each(throughBox)('line_through_box by the 8 px inset rule: $d', ({ d, node, found }) => {
    const [width, height] = node ?? [100, 100];
    const body = `<div class="node" style="left:0px;top:0px;width:${width}px;height:${height}px"></div>${paths(d)}`;
    const kinds = run([board('1 · Probe', body)]).findings.map((f) => f.kind);
    expect(kinds.includes('line_through_box')).toBe(found);
  });

  test('markup outside a board does not make a node-free board checked', () => {
    const unplaced = `${board('A', '<div class="panel"></div>')}${box('node', 0, 0)}`;
    const geometry = run([unplaced]);
    expect(geometry.unchecked).toEqual(['A']);
    expect(geometry.findings).toEqual([]);
  });
});

describe('archimap measure reads declared state machines', () => {
  const MACHINE = 'state-machine.alpha.claim';
  const machineFixture = (capabilityId: string) => fixture({ 'src/alpha/core.ts': 'export const core = 1;\n' }, [
    { id: 'alpha', include: ['src/alpha/**'], nodes: ['capability.alpha'] },
    { id: 'beta', include: ['src/beta/**'], nodes: ['capability.beta'] },
  ], {
    nodes: [['capability.alpha', 'capability'], ['capability.beta', 'capability'], ['capability.gamma', 'capability']],
    manifest: [{ capabilityId: 'capability.alpha', path: 'docs/architecture/modules/dom/alpha.md' }],
    machines: [[MACHINE, capabilityId]],
  });
  const machineArgs = (root: string) => ['--modules', join(root, 'modules.json'), '--model', MODEL_DIR];

  test('a machine lands on the module that covers its capability, with the document of the diagram', () => {
    const result = measure(machineFixture('capability.alpha'));
    expect(result.modules.map((module) => module.stateMachines)).toEqual([
      [{
        id: MACHINE, name: `Machine ${MACHINE}`, capabilityId: 'capability.alpha',
        path: `model/state-machines/${MACHINE}.yaml`, doc: 'docs/architecture/modules/dom/alpha.md',
      }],
      [],
    ]);
  });

  test('a machine whose capability has no projected document is listed with doc null', () => {
    const result = measure(machineFixture('capability.beta'));
    expect(result.modules[1]!.stateMachines).toEqual([{
      id: MACHINE, name: `Machine ${MACHINE}`, capabilityId: 'capability.beta',
      path: `model/state-machines/${MACHINE}.yaml`, doc: null,
    }]);
    expect(result.model.undocumentedNodes).toEqual(['capability.beta', 'capability.gamma']);
  });

  test('a machine whose capability no module covers exits 2 with state_machine_uncovered', () => {
    const root = machineFixture('capability.gamma');
    const failure = measureFailure(root, machineArgs(root));
    expect(failure.status).toBe(2);
    expect(failure.stderr).toContain(`state_machine_uncovered:${MACHINE}`);
  });
});
