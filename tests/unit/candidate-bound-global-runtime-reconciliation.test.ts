import { describe, expect, test } from 'bun:test';
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';

import { buildManagedHooks } from '../../src/cli/installer/managed-entries';
import { beginInstallHostTransaction, PROFILE_COMPONENTS, readInstalledProfile, rollbackInstallHostTransaction } from '../../src/cli/installer/install-profile';
import {
  assertCandidateReconciliationReceipt,
  candidatePackageIdentity,
  encodeCandidateRequest,
  managedProjectionDigest,
  publishCandidateReconciliationCapability,
  routeRegistryDigest,
  sha256,
  type CandidateReconciliationRequest,
  type CandidateReconciliationReceipt,
} from '../../src/cli/runtime/candidate-reconciliation';
import { acquireExclusiveDirectoryLock } from '../../src/effects/locking/exclusive-directory-lock';

const ROOT = join(import.meta.dir, '..', '..');
const CLI = join(ROOT, 'src', 'cli', 'index.ts');

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function copyRuntimeFixture(
  destination: string,
  version: string,
  stopTimeout: 30 | 150,
  legacyParent = false,
): string {
  cpSync(ROOT, destination, {
    recursive: true,
    filter: (source) => !['.git', 'node_modules', '_ops'].includes(basename(source)),
  });
  const manifestPath = join(destination, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { version?: string };
  manifest.version = version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const managedEntriesPath = join(destination, 'src', 'cli', 'installer', 'managed-entries.ts');
  const managedEntries = readFileSync(managedEntriesPath, 'utf-8');
  const authority = "route.event === 'Stop' && route.routeId === 'default' ? 150 : 30";
  if (!managedEntries.includes(authority)) throw new Error('fixture requires the managed Stop timeout authority');
  if (stopTimeout === 30) {
    writeFileSync(managedEntriesPath, managedEntries.replace(
      authority,
      "route.event === 'Stop' && route.routeId === 'default' ? 30 : 30",
    ));
  }
  if (legacyParent) {
    const globalRuntimePath = join(destination, 'src', 'cli', 'commands', 'global-runtime.ts');
    const globalRuntime = readFileSync(globalRuntimePath, 'utf-8');
    const frozenLegacy = globalRuntime.replace(
      'if (updateMode && opts.installCli !== false && opts.installSpec && opts.candidateHandoff) {',
      'if (false) {',
    );
    if (frozenLegacy === globalRuntime) throw new Error('fixture requires the candidate handoff branch');
    writeFileSync(globalRuntimePath, frozenLegacy);
  }
  symlinkSync(join(ROOT, 'node_modules'), join(destination, 'node_modules'), 'dir');
  return destination;
}

function writeCandidateSwitchingBun(
  path: string,
  logPath: string,
  globalPackagePath: string,
  candidateRoot: string,
): void {
  const canonicalCandidateRoot = realpathSync(candidateRoot);
  writeExecutable(path, [
    '#!/bin/bash',
    `printf '%s\\n' "$*" >> "${logPath}"`,
    'if [[ "${1:-}" == "--version" ]]; then echo 1.4.0; exit 0; fi',
    `if [[ "$1" == "add" && "$2" == "-g" ]]; then rm -rf "${globalPackagePath}"; ln -s "${candidateRoot}" "${globalPackagePath}"; exit 0; fi`,
    `if [[ "$1" == "${canonicalCandidateRoot}/src/cli/index.ts" ]]; then exec "${process.execPath}" "$@"; fi`,
    'exit 0',
    '',
  ].join('\n'));
}

function writeMinimalInstallState(home: string): void {
  mkdirSync(join(home, '.repo-harness'), { recursive: true });
  writeFileSync(join(home, '.repo-harness', 'install-state.json'), `${JSON.stringify({
    protocol: 2,
    profile: 'minimal',
    components: PROFILE_COMPONENTS.minimal,
    transaction_id: 'fixture-install',
    applied_at: '2026-09-04T00:00:00.000Z',
    ownership_manifest: [],
    previous: null,
  }, null, 2)}\n`);
}

function candidateReceipt(adapterDigest: string): CandidateReconciliationReceipt {
  const identity = candidatePackageIdentity(import.meta.dir + '/../..');
  return {
    protocol: 1,
    transaction_id: 'transaction-fixture',
    candidate_package_root: identity.root,
    candidate_version: identity.version,
    candidate_package_digest: identity.package_digest,
    route_registry_digest: routeRegistryDigest(),
    selected_target: 'codex',
    adapter_projection_digests: { codex: adapterDigest },
    ownership_manifest_digest: 'sha256:ledger-fixture',
    reconciliation_scope: 'complete',
    verified_at: '2026-09-04T00:00:00.000Z',
  };
}

function invokeCandidateChild(
  request: CandidateReconciliationRequest,
  env: NodeJS.ProcessEnv,
): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [
    CLI,
    '__reconcile-installed-runtime',
    '--request',
    encodeCandidateRequest(request),
  ], {
    cwd: request.cwd,
    encoding: 'utf-8',
    env: {
      ...env,
      REPO_HARNESS_RUNTIME_RECONCILIATION_PARENT: '1',
      REPO_HARNESS_RUNTIME_RECONCILIATION_TOKEN: request.parent_token,
    },
  });
}

function runCandidateChild(
  request: CandidateReconciliationRequest,
  env: NodeJS.ProcessEnv,
): ReturnType<typeof spawnSync> {
  const home = realpathSync(env.HOME!);
  const lock = acquireExclusiveDirectoryLock(home, '.repo-harness/transactions/global-runtime.lock');
  try {
    publishCandidateReconciliationCapability({
      transactionId: request.transaction_id,
      transactionBackupRoot: request.transaction_backup_root,
      parentToken: request.parent_token,
      parentPid: process.pid,
      lockPath: lock.lockPath,
      lockOwnerToken: lock.ownerToken,
    });
    return invokeCandidateChild(request, env);
  } finally {
    lock.release();
  }
}

describe('candidate-bound global runtime reconciliation', () => {
  test('rejects a predecessor Stop timeout projection even when the route count is unchanged', () => {
    const candidate = buildManagedHooks('codex', 'full');
    const predecessor = structuredClone(candidate);
    const stop = predecessor.Stop?.find((entry) => entry.hooks[0]?.command.includes(' Stop --route default'));
    if (!stop) throw new Error('fixture requires Stop.default');
    stop.hooks[0]!.timeout = 30;

    expect(candidate.Stop?.[0]?.hooks[0]?.timeout).toBe(150);
    expect(managedProjectionDigest(predecessor)).not.toBe(managedProjectionDigest(candidate));
    expect(() => assertCandidateReconciliationReceipt(candidateReceipt(managedProjectionDigest(predecessor)), {
      transaction_id: 'transaction-fixture',
      candidate: candidatePackageIdentity(import.meta.dir + '/../..'),
      target: 'codex',
      profile: 'full',
      require_complete: true,
    })).toThrow('adapter projection mismatch for codex');
  });

  test('accepts the candidate projection and binds its package identity to the transaction receipt', () => {
    const candidate = buildManagedHooks('codex', 'full');
    expect(() => assertCandidateReconciliationReceipt(candidateReceipt(managedProjectionDigest(candidate)), {
      transaction_id: 'transaction-fixture',
      candidate: candidatePackageIdentity(import.meta.dir + '/../..'),
      target: 'codex',
      profile: 'full',
      require_complete: true,
    })).not.toThrow();
  });

  test('candidate authority replaces a predecessor Stop timeout and preserves an unmanaged hook', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-runtime-'));
    const home = join(root, 'home');
    const cwd = join(root, 'repo');
    const candidate = candidatePackageIdentity(import.meta.dir + '/../..');
    const token = 'a'.repeat(64);
    const env = {
      ...process.env,
      HOME: home,
      BUN_INSTALL: join(home, '.bun'),
      REPO_HARNESS_RUNTIME_RECONCILIATION_PARENT: '1',
      REPO_HARNESS_RUNTIME_RECONCILIATION_TOKEN: token,
    };
    try {
      mkdirSync(cwd, { recursive: true });
      const transaction = beginInstallHostTransaction([], env);
      expect(existsSync(transaction.backup_root)).toBe(true);
      const predecessor = structuredClone(buildManagedHooks('codex', 'minimal'));
      const stop = predecessor.Stop?.find((entry) => entry.hooks[0]?.command.includes(' Stop --route default'));
      if (!stop) throw new Error('fixture requires Stop.default');
      stop.hooks[0]!.timeout = 30;
      const hookPath = join(home, '.codex', 'hooks.json');
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(hookPath, JSON.stringify({
        hooks: predecessor,
        custom: { untouched: true },
      }, null, 2));

      const request: CandidateReconciliationRequest = {
        protocol: 1,
        transaction_id: sha256(transaction.backup_root),
        transaction_backup_root: transaction.backup_root,
        parent_token: token,
        candidate,
        cwd,
        target: 'codex',
        profile: 'minimal',
        sync_skill: false,
        host_adapters: true,
        external_skills: false,
        reverse_skill: false,
        obsidian_skills: false,
        codegraph: false,
      };
      const result = runCandidateChild(request, env);
      expect(result.status).toBe(0);
      const receipt = JSON.parse((result.stdout ?? '').toString()) as CandidateReconciliationReceipt;

      const installed = JSON.parse(readFileSync(hookPath, 'utf-8')) as { hooks: Record<string, Array<{ hooks: Array<{ timeout: number }> }>>; custom: unknown };
      const installedStop = installed.hooks.Stop?.[0]?.hooks[0]?.timeout;
      expect(installedStop).toBe(150);
      expect(installed.custom).toEqual({ untouched: true });
      expect(receipt.reconciliation_scope).toBe('partial');
      expect(receipt.adapter_projection_digests.codex).toBe(managedProjectionDigest(buildManagedHooks('codex', 'minimal')));
      expect(existsSync(join(home, '.repo-harness', 'install-state.json'))).toBe(false);
      rollbackInstallHostTransaction(transaction);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('candidate mutation rejects a forged transaction directory and consumes its parent capability once', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-capability-'));
    const home = join(root, 'home');
    const cwd = join(root, 'repo');
    const candidate = candidatePackageIdentity(import.meta.dir + '/../..');
    const token = 'c'.repeat(64);
    const env = { ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun') };
    try {
      mkdirSync(cwd, { recursive: true });
      const transaction = beginInstallHostTransaction([], env);
      const predecessor = structuredClone(buildManagedHooks('codex', 'minimal'));
      const stop = predecessor.Stop?.find((entry) => entry.hooks[0]?.command.includes(' Stop --route default'));
      if (!stop) throw new Error('fixture requires Stop.default');
      stop.hooks[0]!.timeout = 30;
      const hookPath = join(home, '.codex', 'hooks.json');
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(hookPath, JSON.stringify({ hooks: predecessor }, null, 2));
      const requestBase = {
        protocol: 1 as const,
        parent_token: token,
        candidate,
        cwd,
        target: 'codex' as const,
        profile: 'minimal' as const,
        sync_skill: false,
        host_adapters: true,
        external_skills: false,
        reverse_skill: false,
        obsidian_skills: false,
        codegraph: false,
      };
      const forgedBackup = join(home, '.repo-harness', 'transactions', 'install-forged');
      mkdirSync(forgedBackup);
      const forged: CandidateReconciliationRequest = {
        ...requestBase,
        transaction_id: sha256(forgedBackup),
        transaction_backup_root: forgedBackup,
      };
      expect(invokeCandidateChild(forged, env).status).toBe(1);
      expect(JSON.parse(readFileSync(hookPath, 'utf-8')).hooks.Stop[0].hooks[0].timeout).toBe(30);

      const invalidLockRequest: CandidateReconciliationRequest = {
        ...requestBase,
        transaction_id: sha256(transaction.backup_root),
        transaction_backup_root: transaction.backup_root,
      };
      const lock = acquireExclusiveDirectoryLock(realpathSync(home), '.repo-harness/transactions/global-runtime.lock');
      try {
        publishCandidateReconciliationCapability({
          transactionId: invalidLockRequest.transaction_id,
          transactionBackupRoot: invalidLockRequest.transaction_backup_root,
          parentToken: token,
          parentPid: process.pid,
          lockPath: lock.lockPath,
          lockOwnerToken: lock.ownerToken.replace(/^[1-9]\d*/, String(process.pid + 1)),
        });
        expect(invokeCandidateChild(invalidLockRequest, env).status).toBe(1);
      } finally {
        lock.release();
      }
      expect(JSON.parse(readFileSync(hookPath, 'utf-8')).hooks.Stop[0].hooks[0].timeout).toBe(30);
      rollbackInstallHostTransaction(transaction);

      const activeTransaction = beginInstallHostTransaction([], env);
      const request: CandidateReconciliationRequest = {
        ...requestBase,
        transaction_id: sha256(activeTransaction.backup_root),
        transaction_backup_root: activeTransaction.backup_root,
      };
      expect(runCandidateChild(request, env).status).toBe(0);
      expect(JSON.parse(readFileSync(hookPath, 'utf-8')).hooks.Stop[0].hooks[0].timeout).toBe(150);
      expect(invokeCandidateChild(request, env).status).toBe(1);
      rollbackInstallHostTransaction(activeTransaction);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('candidate reconciliation refreshes a complete ownership ledger after exact host projection verification', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-ledger-'));
    const home = join(root, 'home');
    const cwd = join(root, 'repo');
    const candidate = candidatePackageIdentity(import.meta.dir + '/../..');
    const token = 'b'.repeat(64);
    const env = {
      ...process.env,
      HOME: home,
      BUN_INSTALL: join(home, '.bun'),
      REPO_HARNESS_RUNTIME_RECONCILIATION_PARENT: '1',
      REPO_HARNESS_RUNTIME_RECONCILIATION_TOKEN: token,
    };
    try {
      mkdirSync(cwd, { recursive: true });
      mkdirSync(join(home, '.bun', 'bin'), { recursive: true });
      writeExecutable(join(home, '.bun', 'bin', 'repo-harness'), '#!/bin/sh\nexit 0\n');
      const transaction = beginInstallHostTransaction([], env);
      const request: CandidateReconciliationRequest = {
        protocol: 1,
        transaction_id: sha256(transaction.backup_root),
        transaction_backup_root: transaction.backup_root,
        parent_token: token,
        candidate,
        cwd,
        target: 'codex',
        profile: 'minimal',
        sync_skill: true,
        host_adapters: true,
        external_skills: false,
        reverse_skill: false,
        obsidian_skills: false,
        codegraph: false,
      };
      const result = runCandidateChild(request, env);
      expect(result.status).toBe(0);
      const receipt = JSON.parse((result.stdout ?? '').toString()) as CandidateReconciliationReceipt;

      const installed = readInstalledProfile(env);
      expect(receipt.reconciliation_scope).toBe('complete');
      expect(receipt.ownership_manifest_digest).toBe(`sha256:${createHash('sha256').update(JSON.stringify(installed?.ownership_manifest)).digest('hex')}`);
      expect(installed?.profile).toBe('minimal');
      expect(installed?.ownership_manifest.some((surface) => surface.path === join(home, '.codex', 'hooks.json'))).toBe(true);
      rollbackInstallHostTransaction(transaction);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  test('B parent builder=30 hands one update to distinct C candidate builder=150', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-version-bound-'));
    const home = join(root, 'home');
    const repo = join(root, 'repo');
    const bin = join(root, 'bin');
    const parentRoot = join(root, 'parent-b');
    const candidateRoot = join(root, 'candidate-c');
    const bunLog = join(root, 'bun.log');
    try {
      mkdirSync(repo, { recursive: true });
      mkdirSync(bin, { recursive: true });
      copyRuntimeFixture(parentRoot, '0.17.0', 30);
      copyRuntimeFixture(candidateRoot, '0.18.0', 150);
      const globalPackagePath = join(home, '.bun', 'install', 'global', 'node_modules', 'repo-harness');
      mkdirSync(join(home, '.bun', 'install', 'global', 'node_modules'), { recursive: true });
      symlinkSync(parentRoot, globalPackagePath, 'dir');
      writeMinimalInstallState(home);
      const predecessor = structuredClone(buildManagedHooks('codex', 'minimal'));
      const stop = predecessor.Stop?.find((entry) => entry.hooks[0]?.command.includes(' Stop --route default'));
      if (!stop) throw new Error('fixture requires Stop.default');
      stop.hooks[0]!.timeout = 30;
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'hooks.json'), `${JSON.stringify({
        hooks: predecessor,
        custom: { preserved: true },
      }, null, 2)}\n`);
      writeCandidateSwitchingBun(join(bin, 'bun'), bunLog, globalPackagePath, candidateRoot);

      const result = spawnSync(process.execPath, [
        join(parentRoot, 'src', 'cli', 'index.ts'),
        'update',
        '--target', 'codex',
        '--no-sync-skill',
        '--no-external-skills',
        '--no-codegraph',
        '--json',
      ], {
        cwd: repo,
        encoding: 'utf-8',
        env: {
          ...process.env,
          HOME: home,
          BUN_INSTALL: join(home, '.bun'),
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          REPO_HARNESS_BUN_EXECUTABLE: join(bin, 'bun'),
        },
      });

      expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
      const runtime = JSON.parse(result.stdout) as { steps: Array<{ step: string; status: string; detail?: string }> };
      expect(runtime.steps.find((step) => step.step === 'reconcile installed candidate runtime')).toMatchObject({
        status: 'ok',
        detail: expect.stringContaining('candidate=0.18.0'),
      });
      const installed = JSON.parse(readFileSync(join(home, '.codex', 'hooks.json'), 'utf-8')) as {
        hooks: Record<string, Array<{ hooks: Array<{ timeout: number }> }>>;
        custom: unknown;
      };
      expect(installed.hooks.Stop?.[0]?.hooks[0]?.timeout).toBe(150);
      expect(installed.custom).toEqual({ preserved: true });
      expect(realpathSync(globalPackagePath)).toBe(realpathSync(candidateRoot));
      expect(readFileSync(bunLog, 'utf-8')).toContain(`${candidateRoot}/src/cli/index.ts __reconcile-installed-runtime --request`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  test('frozen legacy B can only bootstrap C; an explicit second C update reconciles its predecessor projection', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-legacy-migration-'));
    const home = join(root, 'home');
    const repo = join(root, 'repo');
    const bin = join(root, 'bin');
    const legacyParentRoot = join(root, 'legacy-b');
    const candidateRoot = join(root, 'candidate-c');
    const bunLog = join(root, 'bun.log');
    try {
      mkdirSync(repo, { recursive: true });
      mkdirSync(bin, { recursive: true });
      copyRuntimeFixture(legacyParentRoot, '0.17.0', 30, true);
      copyRuntimeFixture(candidateRoot, '0.18.0', 150);
      const globalPackagePath = join(home, '.bun', 'install', 'global', 'node_modules', 'repo-harness');
      mkdirSync(join(home, '.bun', 'install', 'global', 'node_modules'), { recursive: true });
      symlinkSync(legacyParentRoot, globalPackagePath, 'dir');
      writeMinimalInstallState(home);
      writeCandidateSwitchingBun(join(bin, 'bun'), bunLog, globalPackagePath, candidateRoot);
      const sharedEnv = {
        ...process.env,
        HOME: home,
        BUN_INSTALL: join(home, '.bun'),
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        REPO_HARNESS_BUN_EXECUTABLE: join(bin, 'bun'),
      };
      const updateArgs = ['update', '--target', 'codex', '--no-sync-skill', '--no-external-skills', '--no-codegraph', '--json'];

      const bootstrap = spawnSync(process.execPath, [join(legacyParentRoot, 'src', 'cli', 'index.ts'), ...updateArgs], {
        cwd: repo,
        encoding: 'utf-8',
        env: sharedEnv,
      });
      expect(bootstrap.status, `${bootstrap.stderr}\n${bootstrap.stdout}`).toBe(0);
      expect(realpathSync(globalPackagePath)).toBe(realpathSync(candidateRoot));
      const bootstrappedHooks = JSON.parse(readFileSync(join(home, '.codex', 'hooks.json'), 'utf-8')) as {
        hooks: Record<string, Array<{ hooks: Array<{ timeout: number }> }>>;
      };
      expect(bootstrappedHooks.hooks.Stop?.[0]?.hooks[0]?.timeout).toBe(30);

      const reconciled = spawnSync(process.execPath, [join(candidateRoot, 'src', 'cli', 'index.ts'), ...updateArgs], {
        cwd: repo,
        encoding: 'utf-8',
        env: sharedEnv,
      });
      expect(reconciled.status, `${reconciled.stderr}\n${reconciled.stdout}`).toBe(0);
      const reconciledHooks = JSON.parse(readFileSync(join(home, '.codex', 'hooks.json'), 'utf-8')) as {
        hooks: Record<string, Array<{ hooks: Array<{ timeout: number }> }>>;
      };
      expect(reconciledHooks.hooks.Stop?.[0]?.hooks[0]?.timeout).toBe(150);
      expect(JSON.parse(reconciled.stdout).steps.find((step: { step: string }) => step.step === 'reconcile installed candidate runtime')).toMatchObject({
        status: 'ok',
        detail: expect.stringContaining('candidate=0.18.0'),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  test('a candidate failure after projection restores the predecessor adapter through the parent transaction', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-rollback-'));
    const home = join(root, 'home');
    const repo = join(root, 'repo');
    const bin = join(root, 'bin');
    try {
      mkdirSync(repo, { recursive: true });
      mkdirSync(bin, { recursive: true });
      const globalModules = join(home, '.bun', 'install', 'global', 'node_modules');
      mkdirSync(globalModules, { recursive: true });
      symlinkSync(ROOT, join(globalModules, 'repo-harness'), 'dir');
      mkdirSync(join(home, '.repo-harness'), { recursive: true });
      writeFileSync(join(home, '.repo-harness', 'install-state.json'), `${JSON.stringify({
        protocol: 2,
        profile: 'minimal',
        components: PROFILE_COMPONENTS.minimal,
        transaction_id: 'predecessor-install',
        applied_at: '2026-09-04T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      }, null, 2)}\n`);
      const predecessor = structuredClone(buildManagedHooks('codex', 'minimal'));
      const stop = predecessor.Stop?.find((entry) => entry.hooks[0]?.command.includes(' Stop --route default'));
      if (!stop) throw new Error('fixture requires Stop.default');
      stop.hooks[0]!.timeout = 30;
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'hooks.json'), `${JSON.stringify({ hooks: predecessor }, null, 2)}\n`);
      writeExecutable(join(bin, 'bun'), [
        '#!/bin/bash',
        'if [[ "${1:-}" == "--version" ]]; then echo 1.4.0; exit 0; fi',
        `if [[ "\${1:-}" == "${ROOT}/src/cli/index.ts" || "\${1:-}" == "${ROOT}/scripts/"* ]]; then exec "${process.execPath}" "$@"; fi`,
        'exit 0',
        '',
      ].join('\n'));

      const result = spawnSync(process.execPath, [
        CLI,
        'update',
        '--no-external-skills',
        '--no-codegraph',
        '--json',
      ], {
        cwd: repo,
        encoding: 'utf-8',
        env: {
          ...process.env,
          HOME: home,
          BUN_INSTALL: join(home, '.bun'),
          PATH: `${bin}:/usr/bin:/bin`,
          REPO_HARNESS_BUN_EXECUTABLE: join(bin, 'bun'),
        },
      });

      expect(result.status).toBe(1);
      const installed = JSON.parse(readFileSync(join(home, '.codex', 'hooks.json'), 'utf-8')) as {
        hooks: Record<string, Array<{ hooks: Array<{ timeout: number }> }>>;
      };
      expect(installed.hooks.Stop?.[0]?.hooks[0]?.timeout).toBe(30);
      expect(existsSync(join(home, '.codex', 'skills', 'repo-harness'))).toBe(false);
      expect(JSON.parse(readFileSync(join(home, '.repo-harness', 'install-state.json'), 'utf-8')).transaction_id).toBe('predecessor-install');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
