/**
 * Single-file hook bundle regression guard.
 *
 * The `repo-harness-hook` bin ships as a prepack-built single-file bundle so a
 * hook firing mid-reinstall never resolves a half-replaced multi-file import
 * graph. Bundling breaks two things unless they are held down here:
 *
 * 1. `triggerDetachedToolingPopulate` respawns `import.meta.url`. Unbundled
 *    that is `session-context.ts`, whose `import.meta.main` bootstrap receives
 *    the flag; bundled it is the bundle, and `bun build` folds the non-entry
 *    `import.meta.main` to `false` and eliminates that bootstrap. Without the
 *    `hook-entry.ts` dispatch branch the respawn lands on the usage error
 *    (exit 2) and the tooling report never populates again.
 * 2. `post-bash-importer.ts` derives its package root from `import.meta.url` at
 *    `src/effects/evidence` depth. In the bundle that depth is gone, so the
 *    provider version must come from the build-time `--define`, never from the
 *    "0.0.0" catch.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '..', '..');
const HOOK_ENTRY = join(ROOT, 'src/cli/hook-entry.ts');
const DETACHED_TOOLING_POPULATE_FLAG = '--detached-tooling-populate';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'hook-bundle-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
  }
});

interface PopulateFixture {
  readonly repoRoot: string;
  readonly reportFile: string;
  readonly lockDir: string;
  readonly cliStub: string;
  readonly stubOutput: string;
}

/**
 * Detached populate runs `$REPO_HARNESS_CLI setup check --check-updates`, which
 * would reach the network. The stub keeps the run hermetic while still giving
 * the populate a distinguishable stdout to write into the report file.
 */
function populateFixture(): PopulateFixture {
  const repoRoot = temporaryRoot();
  const stubOutput = '{"stub":"tooling-report"}';
  const cliStub = join(repoRoot, 'cli-stub.js');
  writeFileSync(cliStub, `process.stdout.write(${JSON.stringify(stubOutput)});\n`);
  const lockDir = '.ai/harness/tooling-lock.d';
  mkdirSync(join(repoRoot, lockDir), { recursive: true });
  return { repoRoot, reportFile: '.ai/harness/tooling-report.json', lockDir, cliStub, stubOutput };
}

function runDetachedPopulate(entrypoint: string, fixture: PopulateFixture) {
  return spawnSync(
    'bun',
    [
      entrypoint,
      DETACHED_TOOLING_POPULATE_FLAG,
      fixture.repoRoot,
      'claude',
      fixture.reportFile,
      fixture.lockDir,
    ],
    {
      cwd: fixture.repoRoot,
      encoding: 'utf-8',
      env: { ...process.env, REPO_HARNESS_CLI: fixture.cliStub },
    },
  );
}

function expectPopulateRan(result: ReturnType<typeof spawnSync>, fixture: PopulateFixture): void {
  expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
  expect(result.stderr ?? '').not.toContain('usage: repo-harness-hook');
  // The populate's `finally` always releases the lock -- the observable effect
  // that separates "ran" from "fell through to the usage error".
  expect(existsSync(join(fixture.repoRoot, fixture.lockDir))).toBe(false);
  expect(readFileSync(join(fixture.repoRoot, fixture.reportFile), 'utf-8')).toBe(fixture.stubOutput);
}

function buildBundle(define: string | null): string {
  const outDir = temporaryRoot();
  const outfile = join(outDir, 'hook-entry.js');
  const args = ['build', HOOK_ENTRY, '--target=bun', '--outfile', outfile];
  if (define !== null) args.push('--define', `REPO_HARNESS_BUNDLED_CLI_VERSION="${define}"`);
  const built = spawnSync('bun', args, { cwd: ROOT, encoding: 'utf-8' });
  expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
  return outfile;
}

describe('hook-entry single-file bundle', () => {
  test('unbundled hook entry dispatches the detached tooling populate', () => {
    const fixture = populateFixture();
    expectPopulateRan(runDetachedPopulate(HOOK_ENTRY, fixture), fixture);
  }, 30_000);

  test('bundled hook entry dispatches the detached tooling populate', () => {
    const fixture = populateFixture();
    expectPopulateRan(runDetachedPopulate(buildBundle('0.0.0-test'), fixture), fixture);
  }, 30_000);

  test('bundle keeps the shebang and survives without the eliminated bootstrap', () => {
    const bundle = readFileSync(buildBundle('0.0.0-test'), 'utf-8');
    expect(bundle.split('\n')[0]).toBe('#!/usr/bin/env bun');
    // Present via the hook-entry import; absent when only session-context's
    // dead-code-eliminated bootstrap referenced it.
    expect(bundle).toContain('runDetachedToolingPopulate');
  }, 30_000);

  test('bundle carries the injected provider version and never the undefined identifier', () => {
    const bundle = readFileSync(buildBundle('9.9.9-injected'), 'utf-8');
    expect(bundle).toContain('9.9.9-injected');
    // A surviving identifier means the --define did not land; that is a build
    // defect, and the prepack script fails on exactly this condition.
    expect(bundle).not.toContain('REPO_HARNESS_BUNDLED_CLI_VERSION');
    expect(readFileSync(buildBundle(null), 'utf-8')).toContain('REPO_HARNESS_BUNDLED_CLI_VERSION');
  }, 30_000);

  test('package wiring ships the built bundle as the hook bin', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
      bin: Record<string, string>;
      files: string[];
      scripts: Record<string, string>;
    };
    expect(pkg.bin['repo-harness-hook']).toBe('dist/hook-entry.js');
    expect(pkg.files).toContain('dist/hook-entry.js');
    // Both redirects are load-bearing: `npm pack --json` parses prepack's stdout
    // as part of its own JSON, so either build's chatter would break release tooling.
    expect(pkg.scripts.prepack).toBe('bun run build:hook-bundle 1>&2 && bun run build:operator-web 1>&2');
    expect(pkg.scripts['build:hook-bundle']).toContain('--define REPO_HARNESS_BUNDLED_CLI_VERSION');
    expect(readFileSync(join(ROOT, '.gitignore'), 'utf-8')).toMatch(/^dist\/$/m);
  });
});
