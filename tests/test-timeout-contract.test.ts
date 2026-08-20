import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE_ROOT = join(import.meta.dir, '..');

/**
 * Regression guard for the full-suite timing-flake class.
 *
 * `bunfig.toml [test] timeout` is NOT a key Bun reads, and a default-timeout
 * call (`jest.setTimeout` or `setDefaultTimeout`) made from a Bun preload only
 * applies to the FIRST test file of a run (verified on Bun 1.3.14). Every later
 * file silently falls back to Bun's 5000ms default, so any test without an
 * explicit third-argument timeout is load-sensitive in a full-suite run while
 * passing in isolation. The only mechanism that applies to every file is the
 * `--timeout` CLI flag, so the repo's test entrypoint must carry it and no
 * config surface may claim otherwise.
 */
describe('test runner timeout contract', () => {
  test('the --timeout flag applies to every test file, not just the first', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-timeout-contract-'));
    try {
      mkdirSync(join(root, 'tests'), { recursive: true });
      // Two files, each with one test that has NO explicit per-test timeout and
      // needs more than Bun's 5000ms default. Both must survive.
      for (const name of ['a', 'b']) {
        writeFileSync(join(root, 'tests', `slow-${name}.test.ts`),
          `import { expect, test } from 'bun:test';\n`
          + `test('slow-${name} needs more than the bun 5000ms default', async () => {\n`
          + `  const started = Date.now();\n`
          + `  await new Promise((resolve) => setTimeout(resolve, 6_000));\n`
          + `  expect(Date.now() - started).toBeGreaterThan(5_900);\n`
          + `});\n`);
      }
      const result = spawnSync('bun', ['test', '--timeout', '60000'], { cwd: root, encoding: 'utf8', timeout: 120_000 });
      expect(`${result.stdout}${result.stderr}`).not.toContain('timed out after 5000ms');
      expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  test('the repo test entrypoint carries the flag and no config surface claims a timeout Bun ignores', () => {
    const scripts = JSON.parse(readFileSync(join(SOURCE_ROOT, 'package.json'), 'utf8')).scripts as Record<string, string>;
    expect(scripts.test).toContain('--timeout 60000');
    const bunfig = readFileSync(join(SOURCE_ROOT, 'bunfig.toml'), 'utf8');
    expect(bunfig).not.toMatch(/^\s*timeout\s*=/m);
    expect(bunfig).not.toContain('setup-timeout');
  });
});
