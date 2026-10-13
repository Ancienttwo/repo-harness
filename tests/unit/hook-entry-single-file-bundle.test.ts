/**
 * Single-file hook bundle regression guard.
 *
 * The `repo-harness-hook` bin ships as a prepack-built single-file bundle so a
 * hook firing mid-reinstall never resolves a half-replaced multi-file import
 * graph. Bundling breaks things unless they are held down here:
 *
 * 1. The process supervisor re-enters the bundle with its own flag.
 * 2. `post-bash-importer.ts` derives its package root from `import.meta.url` at
 *    `src/effects/evidence` depth. In the bundle that depth is gone, so the
 *    provider version must come from the build-time `--define`, never from the
 *    "0.0.0" catch.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '..', '..');
const HOOK_ENTRY = join(ROOT, 'src/cli/hook-entry.ts');
const PROCESS_SUPERVISOR_FLAG = '--process-supervisor';

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

function buildBundle(define: string | null): string {
  const outDir = temporaryRoot();
  const outfile = join(outDir, 'hook-entry.js');
  const args = ['build', HOOK_ENTRY, '--target=bun', '--outfile', outfile];
  if (define !== null) args.push('--define', `REPO_HARNESS_BUNDLED_CLI_VERSION="${define}"`);
  const built = spawnSync('bun', args, { cwd: ROOT, encoding: 'utf-8' });
  expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
  return outfile;
}

function runBundledSupervisor(
  bundle: string,
  metadataPath: string,
  timeoutMs: number,
  command: string,
  args: readonly string[],
) {
  return spawnSync('bun', [
    bundle,
    PROCESS_SUPERVISOR_FLAG,
    '--metadata', metadataPath,
    '--parent-pid', String(process.pid),
    '--timeout-ms', String(timeoutMs),
    '--capture-bytes', '65536',
    '--stdio', 'pipe',
    '--', command, ...args,
  ], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 5_000,
    killSignal: 'SIGKILL',
  });
}

function processGroupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

describe('hook-entry single-file bundle', () => {
  test('bundled hook entry supervises a successful child through bundled re-entry', () => {
    const root = temporaryRoot();
    const metadataPath = join(root, 'receipt.json');
    const result = runBundledSupervisor(
      buildBundle('0.0.0-test'),
      metadataPath,
      2_000,
      process.execPath,
      ['-e', 'process.stdout.write("supervised-ok")'],
    );

    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
    expect(result.stdout).toBe('supervised-ok');
    expect(JSON.parse(readFileSync(metadataPath, 'utf-8'))).toMatchObject({
      status: 0,
      timedOut: false,
      completed: true,
    });
  }, 30_000);

  test.skipIf(process.platform === 'win32')(
    'bundled hook entry kills a TERM-resistant descendant on timeout',
    () => {
      const root = temporaryRoot();
      const metadataPath = join(root, 'receipt.json');
      const descendantPidPath = join(root, 'descendant.pid');
      const target = [
        "const { spawn } = require('child_process');",
        "process.on('SIGTERM', () => {});",
        `spawn(process.execPath, ['-e', ${JSON.stringify([
          "process.on('SIGTERM', () => {});",
          `require('fs').writeFileSync(${JSON.stringify(descendantPidPath)}, String(process.pid));`,
          "process.stdout.write('descendant-ready\\n');",
          "setInterval(() => {}, 1000);",
        ].join('\n'))}], { stdio: 'inherit' });`,
        'setInterval(() => {}, 1000);',
      ].join('\n');
      const result = runBundledSupervisor(
        buildBundle('0.0.0-test'),
        metadataPath,
        // Include bundled launcher startup before exercising descendant cleanup.
        2_000,
        process.execPath,
        ['-e', target],
      );
      let processGroupPid: number | null = null;
      try {
        const receipt = JSON.parse(readFileSync(metadataPath, 'utf-8')) as {
          timedOut: boolean;
          completed: boolean;
          processGroupPid: number;
        };
        processGroupPid = receipt.processGroupPid;
        const descendantPid = Number(readFileSync(descendantPidPath, 'utf-8'));

        expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
        expect(result.stdout).toContain('descendant-ready');
        expect(receipt).toMatchObject({ timedOut: true, completed: true });
        expect(Number.isSafeInteger(descendantPid) && descendantPid > 0).toBe(true);
        expect(processExists(descendantPid)).toBe(false);
        expect(processGroupExists(processGroupPid)).toBe(false);
      } finally {
        if (processGroupPid !== null && processGroupExists(processGroupPid)) {
          process.kill(-processGroupPid, 'SIGKILL');
        }
      }
    },
    30_000,
  );

  test('bundle keeps the shebang and carries no detached SessionStart child', () => {
    const bundle = readFileSync(buildBundle('0.0.0-test'), 'utf-8');
    expect(bundle.split('\n')[0]).toBe('#!/usr/bin/env bun');
    expect(bundle).not.toContain('--detached-tooling-populate');
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
    // All redirects are load-bearing: `npm pack --json` parses prepack's stdout
    // as part of its own JSON, so any build's chatter would break release tooling.
    expect(pkg.scripts.prepack).toBe('bun run check:pi-package 1>&2 && bun run build:hook-bundle 1>&2 && bun run build:oar-hosts 1>&2 && bun run build:operator-web 1>&2');
    expect(pkg.scripts['build:oar-hosts']).toBe('bun run build:oar-review-host && bun run build:oar-coding-host');
    expect(pkg.files).toContain('dist/oar-review-host.js');
    expect(pkg.scripts['build:hook-bundle']).toContain('--define REPO_HARNESS_BUNDLED_CLI_VERSION');
    expect(readFileSync(join(ROOT, '.gitignore'), 'utf-8')).toMatch(/^dist\/$/m);
  });
});

// The bundle must contain the observation owner rather than resolve an eager
// dynamic package path at runtime. The execution cases above test this from
// isolated folders with no source tree.
test('bundle includes the observation owner without a dynamic source require', () => {
  const bundle = readFileSync(buildBundle('0.0.0-test'), 'utf8');
  expect(/(?:require|requireFromHelper)\([^;\n]*readonly-observation/.test(bundle)).toBe(false);
  expect(bundle).toContain('AsyncLocalStorage');
});
