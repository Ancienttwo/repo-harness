import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dir, '..');
const laneScript = readFileSync(join(ROOT, 'scripts/check-ci.sh'), 'utf8');
const GATED_FILES = ['tests/harness-benchmark-matrix.test.ts', 'tests/claude-review.test.ts'];

// The lane script is the single authority for the variable name; the gated test
// files are checked against whatever it exports, so a rename cannot leave one
// side pointing at a dead name while the release lane silently loses coverage.
function exportedGateVariable(): string {
  const matches = [...laneScript.matchAll(/^\s*export\s+([A-Z0-9_]+)=1$/gm)].map(match => match[1]);
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function runLane(lane: string) {
  const bin = mkdtempSync(join(tmpdir(), 'rh-expensive-gate-'));
  try {
    // The bun stub reports the variable the lane actually handed to `bun test`,
    // so the assertion reads the real exported environment, not the script text.
    writeFileSync(join(bin, 'bun'), `#!/bin/bash\nif [[ "$1" == test ]]; then echo "TEST_LANE_GATE=\${${exportedGateVariable()}:-unset}"; fi\nexit 0\n`, { mode: 0o755 });
    writeFileSync(join(bin, 'npm'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(bin, 'bash'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
    return spawnSync('/bin/bash', ['scripts/check-ci.sh', lane], {
      cwd: ROOT, encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BUN_TEST_ISOLATE_FILES: '0', REPO_HARNESS_DIFF_BASE: 'HEAD' },
    });
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

test('the release lane enables the expensive test gate and the hosted functional lane does not', () => {
  const all = runLane('all');
  const functional = runLane('functional');
  expect(all.status).toBe(0);
  expect(all.stdout).toContain('TEST_LANE_GATE=1');
  expect(functional.status).toBe(0);
  expect(functional.stdout).toContain('TEST_LANE_GATE=unset');
});

test('both expensive test files gate on the exact variable the release lane exports', () => {
  const variable = exportedGateVariable();
  for (const file of GATED_FILES) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    expect(source).toContain(`test.skipIf(!process.env.${variable})`);
    // No other environment name may gate this file, otherwise the release lane
    // would enable one gate and leave a second one closed.
    const referenced = new Set([...source.matchAll(/test\.skipIf\(!process\.env\.([A-Z0-9_]+)\)/g)].map(match => match[1]));
    expect([...referenced]).toEqual([variable]);
  }
});
