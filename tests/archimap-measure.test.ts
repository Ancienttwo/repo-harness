import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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

interface MeasureOutput {  edges: { from: string; to: string; value: number }[];
  unresolved: { count: number; examples: string[] };
}

const roots: string[] = [];
function fixture(files: Record<string, string>, modules: unknown = moduleDefs()): string {
  const root = mkdtempSync('/tmp/rh-archimap-measure-');
  roots.push(root);
  fixtureGit(root, ['init', '-q']);
  fixtureGit(root, ['config', 'maintenance.auto', 'false']);
  fixtureGit(root, ['config', 'gc.auto', '0']);
  for (const [path, content] of Object.entries(files)) fixtureWrite(root, path, content);
  fixtureWrite(root, 'modules.json', `${JSON.stringify({ modules })}\n`);
  fixtureGit(root, ['add', '.']);
  fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture']);
  return root;
}
function measure(root: string): MeasureOutput {
  const stdout = execFileSync('bun', [MEASURE, '--root', root, '--modules', join(root, 'modules.json')], { encoding: 'utf8' });
  return JSON.parse(stdout) as MeasureOutput;
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
