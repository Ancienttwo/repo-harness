import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');

describe('external source authority boundary', () => {
  test('does not import or write canonical scheduler, collaboration, or runtime authorities', () => {
    const implementation = [
      'src/core/external-sources/issue-observation.ts',
      'src/core/external-sources/projection.ts',
      'src/core/external-sources/binding.ts',
      'src/effects/external-sources/policy.ts',
      'src/effects/external-sources/store.ts',
      'src/effects/external-sources/github.ts',
      'src/effects/external-sources/refresh.ts',
      'src/effects/external-sources/binding.ts',
      'src/cli/commands/external-source.ts',
    ].map((path) => readFileSync(join(ROOT, path), 'utf8')).join('\n');
    for (const forbidden of ['fleet/task-offer', 'coordination-lease-store', 'collaboration/', 'engineers/agent-runtime', 'WorkEnvelope', 'execution_ready']) {
      expect(implementation).not.toContain(forbidden);
    }
    expect(implementation).toContain('repo-harness/external-sources/v1');
  });
});
