import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '..', '..');
const VERIFY_CONTRACT = join(ROOT, 'scripts/verify-contract.sh');
const temporaryRoots: string[] = [];

type VerificationResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  report: {
    results: Array<{ kind: string; target: string; passed: boolean; message: string }>;
  };
};

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
  }
});

function workspace(prefix: string): string {
  const cwd = mkdtempSync(join(tmpdir(), `${prefix}-`));
  temporaryRoots.push(cwd);
  return cwd;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTestWithRequiredConfig(root: string, relativePath: string, configFile: string, marker: string) {
  const absolutePath = join(root, relativePath);
  mkdirSync(join(absolutePath, '..'), { recursive: true });
  writeFileSync(
    absolutePath,
    [
      "import { expect, test } from 'bun:test';",
      '',
      `test(${JSON.stringify(relativePath)}, () => {`,
      `  expect((globalThis as typeof globalThis & { ${marker}?: boolean }).${marker}).toBe(true);`,
      '});',
      '',
    ].join('\n'),
  );
  writeFileSync(join(root, configFile), `globalThis.${marker} = true;\n`);
}

function writeContract(root: string, paths: string[]): string {
  const contract = join(root, 'task.contract.md');
  writeFileSync(
    contract,
    [
      '# Task Contract: package-owned-runner',
      '',
      '> **Status**: Active',
      '> **Task Profile**: code-change',
      '',
      '## Allowed Paths',
      '',
      '```yaml',
      'allowed_paths:',
      '  - tests/',
      '```',
      '',
      '## Exit Criteria (Machine Verifiable)',
      '',
      '```yaml',
      'exit_criteria:',
      '  tests_pass:',
      ...paths.map((path) => `    - path: ${path}`),
      '```',
      '',
      '## Evidence Requirements',
      '',
      '```yaml',
      'evidence_requirements:',
      '  benchmark: not_applicable',
      '```',
      '',
    ].join('\n'),
  );
  return contract;
}

function runVerifier(root: string, contract: string): VerificationResult {
  const reportPath = join(root, 'report.json');
  const result = spawnSync(
    'bash',
    [VERIFY_CONTRACT, '--contract', contract, '--strict', '--read-only', '--report-file', reportPath],
    {
      cwd: root,
      encoding: 'utf-8',
      env: {
        ...process.env,
        REPO_HARNESS_WORKFLOW_STATE_LIB: join(ROOT, '.ai/hooks/lib/workflow-state.sh'),
      },
    },
  );
  expect(existsSync(reportPath), `${result.stdout}\n${result.stderr}`).toBe(true);
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    report: JSON.parse(readFileSync(reportPath, 'utf-8')),
  };
}

function criterion(result: VerificationResult, path: string) {
  return result.report.results.find((entry) => entry.kind === 'tests_pass' && entry.target === path);
}

describe('package-owned contract test runner', () => {
  test('runs a workspace test through its package script so package-local Bun configuration is preserved', () => {
    const cwd = workspace('package-owned-workspace');
    const path = 'packages/client/tests/requires-package-config.test.ts';
    writeJson(join(cwd, 'package.json'), { name: 'fixture-root', private: true, scripts: { test: 'bun test --preload ./root-config.ts' } });
    writeJson(join(cwd, 'packages/client/package.json'), {
      name: '@fixture/client',
      private: true,
      scripts: { test: 'bun test --preload ./package-config.ts' },
    });
    writeTestWithRequiredConfig(cwd, path, 'packages/client/package-config.ts', '__PACKAGE_CONFIG_LOADED');
    const result = runVerifier(cwd, writeContract(cwd, [path]));

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(criterion(result, path)).toMatchObject({ passed: true });
    expect(result.stdout).toContain(`bun run --cwd packages/client test -- tests/requires-package-config.test.ts`);
  }, 30_000);

  test('runs a root single-package Bun test through the root package script', () => {
    const cwd = workspace('package-owned-root');
    const path = 'tests/requires-root-config.test.ts';
    writeJson(join(cwd, 'package.json'), {
      name: 'fixture-root',
      private: true,
      scripts: { test: 'bun test --preload ./root-config.ts' },
    });
    writeTestWithRequiredConfig(cwd, path, 'root-config.ts', '__ROOT_CONFIG_LOADED');
    const result = runVerifier(cwd, writeContract(cwd, [path]));

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(criterion(result, path)).toMatchObject({ passed: true });
    expect(result.stdout).toContain('bun run --cwd . test -- tests/requires-root-config.test.ts');
  }, 30_000);

  test('fails closed when no owning package declares a test script', () => {
    const cwd = workspace('package-owned-missing-script');
    const path = 'packages/no-test-script/tests/plain.test.ts';
    writeJson(join(cwd, 'package.json'), { name: 'fixture-root', private: true, scripts: { test: 'bun test' } });
    writeJson(join(cwd, 'packages/no-test-script/package.json'), { name: '@fixture/no-test-script', private: true });
    mkdirSync(join(cwd, 'packages/no-test-script/tests'), { recursive: true });
    writeFileSync(
      join(cwd, path),
      "import { expect, test } from 'bun:test';\ntest('plain', () => expect(true).toBe(true));\n",
    );
    const result = runVerifier(cwd, writeContract(cwd, [path]));

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
    expect(criterion(result, path)).toMatchObject({ passed: false });
    expect(result.stdout).toContain('package scripts.test is missing');
  }, 30_000);

  test('fails closed when the nearest package manifest is malformed', () => {
    const cwd = workspace('package-owned-malformed-manifest');
    const path = 'packages/broken/tests/plain.test.ts';
    writeJson(join(cwd, 'package.json'), { name: 'fixture-root', private: true, scripts: { test: 'bun test' } });
    mkdirSync(join(cwd, 'packages/broken/tests'), { recursive: true });
    writeFileSync(join(cwd, 'packages/broken/package.json'), '{ this is not JSON }\n');
    writeFileSync(
      join(cwd, path),
      "import { expect, test } from 'bun:test';\ntest('plain', () => expect(true).toBe(true));\n",
    );
    const result = runVerifier(cwd, writeContract(cwd, [path]));

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
    expect(criterion(result, path)).toMatchObject({ passed: false });
    expect(result.stdout).toContain('package manifest is malformed');
  }, 30_000);

  test('fails closed when a tests_pass symlink resolves outside the repository', () => {
    const cwd = workspace('package-owned-symlink-root');
    const outside = workspace('package-owned-symlink-outside');
    const path = 'linked-tests/plain.test.ts';
    writeJson(join(cwd, 'package.json'), { name: 'fixture-root', private: true, scripts: { test: 'bun test' } });
    mkdirSync(join(outside, 'tests'), { recursive: true });
    writeFileSync(
      join(outside, 'tests/plain.test.ts'),
      "import { expect, test } from 'bun:test';\ntest('plain', () => expect(true).toBe(true));\n",
    );
    symlinkSync(join(outside, 'tests'), join(cwd, 'linked-tests'), 'dir');
    const result = runVerifier(cwd, writeContract(cwd, [path]));

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
    expect(criterion(result, path)).toMatchObject({ passed: false });
    expect(result.stdout).toContain('tests_pass path resolves outside repository');
  }, 30_000);

  test('contains no bare Bun test fallback for tests_pass criteria', () => {
    const source = readFileSync(VERIFY_CONTRACT, 'utf-8');
    expect(source).not.toContain('run_bounded "$log_path" "$result_path" "$bun_bin" test "$path"');
  });
});
