import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProjection, PROJECTION_PATH, readModelVerification, serializeProjection } from '../scripts/project-test-capabilities';

const sources = new Map([
  ['bunfig.toml', ''],
  ['src/core/a.ts', 'export const a = 1;'],
  ['src/core/b.ts', "import { a } from './a'; export const b = a;"],
  ['src/effects/c.ts', 'export const c = 1;'],
  ['tests/helpers/fixture.ts', "import { c } from '../../src/effects/c'; export const f = c;"],
  ['tests/one.test.ts', "import { b } from '../src/core/b'; import { f } from './helpers/fixture'; void b; void f;"],
  ['tests/two.test.ts', "import { c } from '../src/effects/c'; void c;"],
  ['tests/three.test.tsx', 'export {};'],
]);
const owners = new Map([['src/core/a.ts', 'capability.x.core'], ['src/core/b.ts', 'capability.x.core'], ['src/effects/c.ts', 'capability.x.effects']]);
const verification = new Map([
  ['capability.x.core', ['bun run check:type', 'bun run test:files tests/one.test.ts tests/three.test.tsx tests/gone.test.ts --timeout 60000']],
  ['capability.x.empty', ['bun run check:type']],
]);
const build = () => buildProjection({ sources, verification, ownerOf: paths => new Map(paths.filter(path => owners.has(path)).map(path => [path, owners.get(path)!])) });

describe('test capability projection', () => {
  test('maps each test to the source modules it imports directly and to their owning capabilities', async () => {
    const { tests } = await build();
    expect(tests.map(entry => entry.file)).toEqual(['tests/one.test.ts', 'tests/three.test.tsx', 'tests/two.test.ts']);
    // The transitive import of a.ts and the helper under tests/ are not direct source dependencies of one.test.ts.
    expect(tests[0]).toEqual({
      file: 'tests/one.test.ts', sources: ['src/core/b.ts'],
      capabilities: [{ id: 'capability.x.core', via: ['import', 'verification'] }],
    });
    expect(tests[2]).toEqual({
      file: 'tests/two.test.ts', sources: ['src/effects/c.ts'],
      capabilities: [{ id: 'capability.x.effects', via: ['import'] }],
    });
  });

  test('a declared test with no import link keeps its verification capability', async () => {
    const { tests } = await build();
    expect(tests[1]).toEqual({ file: 'tests/three.test.tsx', sources: [], capabilities: [{ id: 'capability.x.core', via: ['verification'] }] });
  });

  test('declared tests list existing files and report each file that no longer exists', async () => {
    const projection = await build();
    expect(projection.declared).toEqual([{ id: 'capability.x.core', tests: ['tests/one.test.ts', 'tests/three.test.tsx'] }]);
    expect(projection.missing).toEqual([{ id: 'capability.x.core', file: 'tests/gone.test.ts' }]);
  });

  test('serialization is stable, one record per line and valid JSON', async () => {
    const text = serializeProjection(await build());
    expect(text).toBe(serializeProjection(await build()));
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text).tests).toHaveLength(3);
    expect(text.split('\n').filter(line => line.includes('"file":"tests/one.test.ts"'))).toHaveLength(1);
    expect(text).not.toContain(process.cwd());
  });

  test('reads extensions.verification from model node files and rejects a malformed list', () => {
    const root = mkdtempSync(join(tmpdir(), 'rh-test-projection-'));
    try {
      const nodes = join(root, '.archcontext/model/nodes');
      mkdirSync(nodes, { recursive: true });
      writeFileSync(join(nodes, 'capability.a.yaml'), 'id: capability.a\nextensions:\n  verification:\n    - "bun test tests/one.test.ts"\n');
      writeFileSync(join(nodes, 'capability.b.yaml'), 'id: capability.b\nextensions:\n  lspProfile: x\n');
      expect([...readModelVerification(root)]).toEqual([['capability.a', ['bun test tests/one.test.ts']]]);
      writeFileSync(join(nodes, 'capability.c.yaml'), 'id: capability.c\nextensions:\n  verification:\n    - 1\n');
      expect(() => readModelVerification(root)).toThrow('Invalid extensions.verification');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('the committed projection lives at the declared path', () => {
    expect(PROJECTION_PATH).toBe('scripts/test-capability-projection.json');
  });
});
