import { describe, expect, test } from 'bun:test';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listHelperFiles, resolveHelper } from '../../src/effects/runtime/helper-runner';
const ROOT = join(import.meta.dir, '..', '..');
describe('single executable helper authority', () => {
  test('every packaged helper resolves the exact canonical script, including protected helpers', () => {
    const files = listHelperFiles({});
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const actual = resolveHelper(file, ROOT, {});
      expect(actual?.source).toBe('package');
      expect(actual?.path).toBe(join(ROOT, 'scripts', file));
      expect(lstatSync(actual!.path).isFile()).toBe(true);
      expect(lstatSync(actual!.path).isSymbolicLink()).toBe(false);
    }
  });
  test('local and packaged workflow manifests agree on the one runtime location', () => {
    const packed = JSON.parse(readFileSync(join(ROOT, 'assets/workflow-contract.v1.json'), 'utf8'));
    const local = JSON.parse(readFileSync(join(ROOT, '.ai/harness/workflow-contract.json'), 'utf8'));
    expect(packed.helpers.runtimeDirectory).toBe('package:scripts');
    expect(local).toEqual(packed);
  });
});
