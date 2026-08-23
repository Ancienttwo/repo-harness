import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { checkStateBoundaries } from '../scripts/check-state-boundaries';

const ROOT = join(import.meta.dir, '..');

describe('fleet acquire effect boundary', () => {
  test('does not depend on CLI command adapters', async () => {
    const result = await checkStateBoundaries(ROOT);
    const reverseImports = result.violations.filter((violation) =>
      violation.code === 'EFFECTS_REVERSE_IMPORT'
      && violation.file === 'src/effects/fleet/acquire.ts',
    );

    expect(reverseImports).toEqual([]);
  });
});
