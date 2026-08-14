import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';

import { validateRuntimeEvidenceReceipt } from '../src/core/release/runtime-evidence';
import { collectRuntimeEvidence, trustedRuntimePath } from '../src/effects/release/runtime-evidence';
import { runProcess } from '../src/effects/process-runner';

const tempDirs: string[] = [];
const SOURCE_ROOT = join(import.meta.dir, '..');
afterEach(() => { for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

function sha1(path: string): string { return createHash('sha1').update(readFileSync(path)).digest('hex'); }
function integrity(path: string): string { return `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`; }

function fixture(): { root: string; registry: string; tarball: string; installedPackage: string; cli: string; hook: string; hookRepo: string } {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-runtime-evidence-'));
  tempDirs.push(root);
  const packageDir = join(root, 'package');
  const installedPackage = join(root, 'node_modules', 'repo-harness');
  const hookRepo = join(root, 'hook-repo');
  mkdirSync(packageDir, { recursive: true });
  mkdirSync(join(packageDir, 'bin'), { recursive: true });
  mkdirSync(hookRepo, { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"name":"repo-harness","version":"1.2.3"}\n');
  writeFileSync(join(packageDir, 'package.json'), '{"name":"repo-harness","version":"1.2.3","bin":{"repo-harness":"bin/repo-harness","repo-harness-hook":"bin/repo-harness-hook"}}\n');
  writeFileSync(join(packageDir, 'bin', 'repo-harness'), '#!/usr/bin/env bun\nconsole.log("1.2.3");\n');
  writeFileSync(join(packageDir, 'bin', 'repo-harness-hook'), '#!/usr/bin/env bun\nconsole.log(JSON.stringify({ protocol: 1, kind: "repo-harness-state-snapshot", state_version: 1 }));\n');
  chmodSync(join(packageDir, 'bin', 'repo-harness'), 0o755);
  chmodSync(join(packageDir, 'bin', 'repo-harness-hook'), 0o755);
  const tarball = join(root, 'repo-harness-1.2.3.tgz');
  const packed = spawnSync('tar', ['-czf', tarball, '-C', root, 'package'], { encoding: 'utf-8' });
  expect(packed.status, packed.stderr).toBe(0);
  const registry = join(root, 'registry.json');
  writeFileSync(registry, JSON.stringify({
    version: '1.2.3', 'dist.integrity': integrity(tarball), 'dist.shasum': sha1(tarball), 'dist.tarball': 'https://registry.example/repo-harness-1.2.3.tgz',
  }));
  cpSync(packageDir, installedPackage, { recursive: true });
  mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
  const cli = join(root, 'node_modules', '.bin', 'repo-harness');
  const hook = join(root, 'node_modules', '.bin', 'repo-harness-hook');
  symlinkSync('../repo-harness/bin/repo-harness', cli);
  symlinkSync('../repo-harness/bin/repo-harness-hook', hook);
  return { root, registry, tarball, installedPackage, cli, hook, hookRepo };
}

describe('RuntimeEvidenceReceipt v1', () => {
  test('uses the trusted Bun runtime directory for real env-shebang readback', () => {
    const value = fixture();
    const priorMinimalPath = runProcess(value.cli, ['--version'], {
      inheritEnv: false,
      env: { PATH: '/usr/bin:/bin' },
      timeoutMs: 15_000,
    });
    expect(priorMinimalPath.ok).toBe(false);
    expect(trustedRuntimePath()).toBe(`${dirname(process.execPath)}:/usr/bin:/bin`);
    expect(collectRuntimeEvidence({
      packageName: 'repo-harness', packageVersion: '1.2.3', registryReadbackPath: value.registry, tarballPath: value.tarball, installedPackagePath: value.installedPackage,
      installedCliPath: value.cli, installedHookPath: value.hook, hookRepo: value.hookRepo,
    }).observations).toHaveLength(3);
  });

  test('binds published tarball, clean install, and installed hook readback without merge authority', () => {
    const value = fixture();
    const receipt = collectRuntimeEvidence({
      packageName: 'repo-harness', packageVersion: '1.2.3', registryReadbackPath: value.registry, tarballPath: value.tarball, installedPackagePath: value.installedPackage,
      installedCliPath: value.cli, installedHookPath: value.hook, hookRepo: value.hookRepo,
    });
    expect(receipt.kind).toBe('repo-harness-runtime-evidence-receipt');
    expect(receipt.observations.map((entry) => entry.invariant)).toEqual(['published_tarball', 'clean_install', 'installed_hook_readback']);
    expect('subject_sha256' in receipt).toBe(false);
    expect(validateRuntimeEvidenceReceipt(JSON.parse(JSON.stringify(receipt))).receipt_sha256).toBe(receipt.receipt_sha256);
  });

  test('rejects external CLI or hook stand-ins even when their output matches', () => {
    const value = fixture();
    const externalCli = join(value.root, 'external-cli');
    const externalHook = join(value.root, 'external-hook');
    writeFileSync(externalCli, '#!/usr/bin/env bun\nconsole.log("1.2.3");\n');
    writeFileSync(externalHook, '#!/usr/bin/env bun\nconsole.log(JSON.stringify({ protocol: 1, kind: "repo-harness-state-snapshot", state_version: 1 }));\n');
    chmodSync(externalCli, 0o755);
    chmodSync(externalHook, 0o755);
    expect(() => collectRuntimeEvidence({
      packageName: 'repo-harness', packageVersion: '1.2.3', registryReadbackPath: value.registry, tarballPath: value.tarball, installedPackagePath: value.installedPackage,
      installedCliPath: externalCli, installedHookPath: value.hook, hookRepo: value.hookRepo,
    })).toThrow('canonical bin');
    expect(() => collectRuntimeEvidence({
      packageName: 'repo-harness', packageVersion: '1.2.3', registryReadbackPath: value.registry, tarballPath: value.tarball, installedPackagePath: value.installedPackage,
      installedCliPath: value.cli, installedHookPath: externalHook, hookRepo: value.hookRepo,
    })).toThrow('canonical bin');
  });

  test('rejects a same-version installed package whose canonical bin differs from the published tarball', () => {
    const value = fixture();
    writeFileSync(join(value.installedPackage, 'bin', 'repo-harness'), '#!/usr/bin/env bun\nconsole.log("1.2.3");\n// altered\n');
    expect(() => collectRuntimeEvidence({
      packageName: 'repo-harness', packageVersion: '1.2.3', registryReadbackPath: value.registry, tarballPath: value.tarball, installedPackagePath: value.installedPackage,
      installedCliPath: value.cli, installedHookPath: value.hook, hookRepo: value.hookRepo,
    })).toThrow('does not match published tarball member');
  });

  test('fails closed when registry metadata does not bind the packed tarball', () => {
    const value = fixture();
    writeFileSync(value.registry, JSON.stringify({
      version: '1.2.3', 'dist.integrity': integrity(value.tarball), 'dist.shasum': '0'.repeat(40), 'dist.tarball': 'https://registry.example/repo-harness-1.2.3.tgz',
    }));
    expect(() => collectRuntimeEvidence({
      packageName: 'repo-harness', packageVersion: '1.2.3', registryReadbackPath: value.registry, tarballPath: value.tarball, installedPackagePath: value.installedPackage,
      installedCliPath: value.cli, installedHookPath: value.hook, hookRepo: value.hookRepo,
    })).toThrow('does not match registry');
  });

  test('CLI writes the separate receipt only after all three runtime invariants pass', () => {
    const value = fixture();
    expect(spawnSync('git', ['init', '-q'], { cwd: value.root, encoding: 'utf-8' }).status).toBe(0);
    const output = '.ai/harness/checks/runtime-evidence.fixture.json';
    const result = spawnSync('bun', [join(SOURCE_ROOT, 'scripts', 'runtime-evidence-receipt.ts'), 'verify',
      '--registry', value.registry,
      '--tarball', value.tarball,
      '--installed-package', value.installedPackage,
      '--installed-cli', value.cli,
      '--installed-hook', value.hook,
      '--hook-repo', value.hookRepo,
      '--output', output,
    ], { cwd: value.root, encoding: 'utf-8' });
    expect(result.status, result.stderr).toBe(0);
    expect(validateRuntimeEvidenceReceipt(JSON.parse(readFileSync(join(value.root, output), 'utf-8'))).package_version).toBe('1.2.3');
  });
});
