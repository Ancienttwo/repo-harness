import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
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
  modules: { id: string; files: number; loc: number; self: number; docs: string[] }[];
  model: { uncoveredNodes: string[]; unknownNodes: string[]; duplicateNodes: string[]; undocumentedNodes: string[] };
  edges: { from: string; to: string; value: number }[];
  unresolved: { count: number; examples: string[] };
}

// The script reads the model node directory and the committed projection manifest; the fixture
// writes both, because the map no longer falls back to package or directory layout.
const MODEL_DIR = 'model/nodes';
const MANIFEST = 'docs/architecture/.projection-manifest.json';
interface ManifestEntry { capabilityId: string; path?: string; stamps?: string[] }
interface FixtureModel { nodes?: [string, string][]; manifest?: ManifestEntry[] }
const DEFAULT_NODES: [string, string][] = [['capability.example', 'capability']];
const DEFAULT_MANIFEST: ManifestEntry[] = [{ capabilityId: 'capability.example', path: 'docs/architecture/modules/example/example.md' }];

function nodeYaml(id: string, kind: string): string {
  return `${JSON.stringify({ schemaVersion: 'archcontext.node/v2', id, kind })}\n`;
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
      sourceStamps: Object.fromEntries((entry.stamps ?? [entry.capabilityId]).map((id) => [id, `sha256:${'1'.repeat(64)}`])),
    };
    if (entry.path !== undefined) row.path = entry.path;
    targets[`projection_target.entity.${entry.capabilityId}`] = row;
  }
  return `${JSON.stringify({ schemaVersion: 'archcontext.architecture-docs-projection-manifest/v3', targets }, null, 2)}\n`;
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
  for (const [id, kind] of model.nodes ?? DEFAULT_NODES) fixtureWrite(root, `${MODEL_DIR}/${id}.yaml`, nodeYaml(id, kind));
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
      manifest: [{ capabilityId: 'capability.alpha', path: 'docs/architecture/modules/dom/alpha.md', stamps: ['component.alpha.core'] }],
    });
    const result = measure(root);
    // A component node resolves through the capability target that stamps it; a capability with
    // no target has no document, and the script does not build a path from its id.
    expect(result.modules.map((module) => module.docs)).toEqual([
      ['docs/architecture/modules/dom/alpha.md'],
      [],
    ]);
    expect(result.model.undocumentedNodes).toEqual(['capability.beta']);
    expect(result.model.uncoveredNodes).toEqual(['capability.alpha']);
    expect(result.model.unknownNodes).toEqual([]);
    expect(result.model.duplicateNodes).toEqual([]);
  });
});
