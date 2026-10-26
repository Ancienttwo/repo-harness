import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { checkStateBoundaries } from '../scripts/check-state-boundaries';

const ROOT = join(import.meta.dir, '..');

describe('provider board effect boundary', () => {
  test('does not depend on CLI command adapters', async () => {
    const result = await checkStateBoundaries(ROOT);
    const reverseImports = result.violations.filter((violation) =>
      violation.code === 'EFFECTS_REVERSE_IMPORT'
      && ['src/effects/fleet/board.ts', 'src/effects/state/collect-provider-board-inputs.ts'].includes(violation.file),
    );

    expect(reverseImports).toEqual([]);
  });
});
