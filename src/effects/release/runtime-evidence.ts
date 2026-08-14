import { createHash } from 'crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'path';
import { spawnSync } from 'child_process';

import {
  buildRuntimeEvidenceReceipt,
  runtimeEvidenceSha256,
  type RuntimeEvidenceObservation,
  type RuntimeEvidenceReceipt,
} from '../../core/release/runtime-evidence';
import { runProcess } from '../process-runner';

export type RegistryTarballReadback = {
  readonly version: string;
  readonly integrity: string;
  readonly shasum: string;
  readonly tarball: string;
};

function sha1File(path: string): string {
  return createHash('sha1').update(readFileSync(path)).digest('hex');
}

function sha512Integrity(path: string): string {
  return `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`;
}

function sha256Bytes(value: Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function parseRegistryReadback(path: string): RegistryTarballReadback {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(`registry readback is invalid JSON: ${(error as Error).message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('registry readback must be an object');
  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'string' || typeof record['dist.integrity'] !== 'string'
    || typeof record['dist.shasum'] !== 'string' || typeof record['dist.tarball'] !== 'string') {
    throw new Error('registry readback requires version, dist.integrity, dist.shasum, and dist.tarball');
  }
  return Object.freeze({
    version: record.version,
    integrity: record['dist.integrity'],
    shasum: record['dist.shasum'],
    tarball: record['dist.tarball'],
  });
}

function requireRegularFile(path: string, label: string): string {
  const absolute = resolve(path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error(`${label} is not a regular file: ${path}`);
  return absolute;
}

function tarballMember(tarball: string, member: string): Buffer {
  const listing = spawnSync('tar', ['-tzf', tarball], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (listing.error || listing.status !== 0) throw new Error(`published tarball cannot list members: ${listing.stderr || listing.error?.message || 'unknown error'}`);
  const matches = (listing.stdout ?? '').split(/\r?\n/u).filter((entry) => entry === member);
  if (matches.length !== 1) throw new Error(`published tarball member is missing or ambiguous: ${member}`);
  const extracted = spawnSync('tar', ['-xOf', tarball, member], { maxBuffer: 64 * 1024 * 1024 });
  if (extracted.error || extracted.status !== 0 || !Buffer.isBuffer(extracted.stdout)) {
    throw new Error(`published tarball member is unreadable: ${member}`);
  }
  return extracted.stdout;
}

function observation(invariant: RuntimeEvidenceObservation['invariant'], detail: string, basis: unknown): RuntimeEvidenceObservation {
  return Object.freeze({ invariant, status: 'pass', detail, evidence_sha256: runtimeEvidenceSha256(basis) });
}

/**
 * Installed scripts use `#!/usr/bin/env bun`. Their readback runs with a
 * deliberately minimal environment, so retain only the current trusted Bun
 * runtime directory plus the system command paths required by the shebang.
 */
export function trustedRuntimePath(): string {
  return `${dirname(process.execPath)}:/usr/bin:/bin`;
}

function installedVersion(command: string, expectedVersion: string, label: string): { readonly executable: string; readonly version: string } {
  const executable = requireRegularFile(command, label);
  const result = runProcess(executable, ['--version'], { inheritEnv: false, env: { PATH: trustedRuntimePath() }, timeoutMs: 15_000 });
  const version = result.stdout.trim().replace(/^v/u, '');
  if (!result.ok || version !== expectedVersion) {
    throw new Error(`${label} version readback failed: expected ${expectedVersion}, got ${version || result.stderr || result.error || 'no output'}`);
  }
  return Object.freeze({ executable: basename(executable), version });
}

type InstalledPackageReadback = {
  readonly package_json_sha256: string;
  readonly installed_cli: string;
  readonly installed_hook: string;
  readonly cli_sha256: string;
  readonly hook_sha256: string;
};

function canonicalPackageBin(packageRoot: string, binValue: unknown, key: 'repo-harness' | 'repo-harness-hook'): { readonly executable: string; readonly tarballMember: string } {
  if (typeof binValue !== 'string' || binValue.trim() === '' || isAbsolute(binValue) || binValue.includes('\\') || binValue.includes('\0')) {
    throw new Error(`installed package bin.${key} must be a repository-relative file`);
  }
  const requested = resolve(packageRoot, binValue);
  const normalized = relative(packageRoot, requested).replaceAll('\\', '/');
  if (!normalized || normalized === '..' || normalized.startsWith('../') || isAbsolute(normalized)) {
    throw new Error(`installed package bin.${key} escapes the package`);
  }
  const executable = realpathSync(requireRegularFile(requested, `installed package bin.${key}`));
  const actualRelative = relative(packageRoot, executable).replaceAll('\\', '/');
  if (!actualRelative || actualRelative === '..' || actualRelative.startsWith('../') || isAbsolute(actualRelative)) {
    throw new Error(`installed package bin.${key} escapes the package`);
  }
  return Object.freeze({ executable, tarballMember: `package/${normalized}` });
}

function requireInstalledBin(command: string, expected: string, label: string): string {
  const actual = realpathSync(requireRegularFile(command, label));
  if (actual !== expected) throw new Error(`${label} does not resolve to the installed package canonical bin`);
  return actual;
}

function installedPackageReadback(path: string, packageName: string, expectedVersion: string, tarball: string): InstalledPackageReadback {
  const packageRoot = realpathSync(resolve(path));
  if (!existsSync(packageRoot) || !statSync(packageRoot).isDirectory()) throw new Error(`installed package is not a directory: ${path}`);
  const manifest = requireRegularFile(resolve(packageRoot, 'package.json'), 'installed package manifest');
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(manifest, 'utf-8'));
  } catch (error) {
    throw new Error(`installed package manifest is invalid JSON: ${(error as Error).message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('installed package manifest must be an object');
  const record = value as Record<string, unknown>;
  if (record.name !== packageName || record.version !== expectedVersion) {
    throw new Error(`installed package manifest does not match ${packageName}@${expectedVersion}`);
  }
  if (!record.bin || typeof record.bin !== 'object' || Array.isArray(record.bin)) {
    throw new Error('installed package manifest must declare canonical bin targets');
  }
  const bins = record.bin as Record<string, unknown>;
  const cli = canonicalPackageBin(packageRoot, bins['repo-harness'], 'repo-harness');
  const hook = canonicalPackageBin(packageRoot, bins['repo-harness-hook'], 'repo-harness-hook');
  const manifestBytes = readFileSync(manifest);
  const cliBytes = readFileSync(cli.executable);
  const hookBytes = readFileSync(hook.executable);
  for (const [label, actual, expected] of [
    ['package.json', manifestBytes, tarballMember(tarball, 'package/package.json')],
    ['repo-harness bin', cliBytes, tarballMember(tarball, cli.tarballMember)],
    ['repo-harness-hook bin', hookBytes, tarballMember(tarball, hook.tarballMember)],
  ] as const) {
    if (!actual.equals(expected)) throw new Error(`installed ${label} does not match published tarball member`);
  }
  return Object.freeze({
    package_json_sha256: sha256Bytes(manifestBytes),
    installed_cli: cli.executable,
    installed_hook: hook.executable,
    cli_sha256: sha256Bytes(cliBytes),
    hook_sha256: sha256Bytes(hookBytes),
  });
}

function installedHookReadback(command: string, repo: string): RuntimeEvidenceObservation {
  const executable = requireRegularFile(command, 'installed hook');
  const repoRoot = resolve(repo);
  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) throw new Error(`hook readback repository is not a directory: ${repo}`);
  const result = runProcess(executable, ['state-snapshot', '--json'], {
    cwd: repoRoot,
    inheritEnv: false,
    env: { PATH: trustedRuntimePath() },
    timeoutMs: 15_000,
  });
  let value: unknown;
  try {
    value = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`installed hook did not return JSON: ${(error as Error).message}`);
  }
  if (!result.ok || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('installed hook state readback failed');
  const record = value as Record<string, unknown>;
  if (record.protocol !== 1 || record.kind !== 'repo-harness-state-snapshot') {
    throw new Error('installed hook returned an invalid StateSnapshot v1');
  }
  return observation('installed_hook_readback', 'installed hook returned StateSnapshot v1', {
    protocol: record.protocol,
    kind: record.kind,
    state_version: record.state_version,
  });
}

export function collectRuntimeEvidence(args: {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly registryReadbackPath: string;
  readonly tarballPath: string;
  readonly installedPackagePath: string;
  readonly installedCliPath: string;
  readonly installedHookPath: string;
  readonly hookRepo: string;
}): RuntimeEvidenceReceipt {
  const registry = parseRegistryReadback(args.registryReadbackPath);
  if (registry.version !== args.packageVersion) throw new Error(`registry version ${registry.version} does not match package ${args.packageVersion}`);
  const tarball = requireRegularFile(args.tarballPath, 'published tarball');
  const integrity = sha512Integrity(tarball);
  const shasum = sha1File(tarball);
  if (integrity !== registry.integrity || shasum !== registry.shasum) throw new Error('published tarball does not match registry integrity/shasum');
  const tarballObservation = observation('published_tarball', `registry tarball ${registry.tarball} matches ${basename(tarball)}`, {
    registry,
    tarball: basename(tarball),
    integrity,
    shasum,
  });
  const installedPackage = installedPackageReadback(args.installedPackagePath, args.packageName, args.packageVersion, tarball);
  const installedCli = installedVersion(requireInstalledBin(args.installedCliPath, installedPackage.installed_cli, 'installed CLI'), args.packageVersion, 'installed CLI');
  const installObservation = observation('clean_install', `installed package and CLI report ${args.packageName}@${args.packageVersion}`, {
    ...installedPackage,
    installed_cli: installedCli,
  });
  const hookObservation = installedHookReadback(requireInstalledBin(args.installedHookPath, installedPackage.installed_hook, 'installed hook'), args.hookRepo);
  return buildRuntimeEvidenceReceipt({
    package_name: args.packageName,
    package_version: args.packageVersion,
    tarball_sha512: integrity,
    observations: [tarballObservation, installObservation, hookObservation],
  });
}
