import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';

import { copyPackageRuntimeFixture } from '../helpers/repo-fixture';
import { startFakeHcRelease, writeFakeHc } from '../helpers/fake-hc';
import { HC_MIN_VERSION } from '../../src/core/terminal/herdr-pin';
import { recordPluginSelection } from '../helpers/install-ownership';
import { buildManagedHooks } from '../../src/cli/installer/managed-entries';
import { beginInstallHostTransaction, readInstallState, versions, rollbackInstallHostTransaction } from '../../src/cli/installer/install-profile';
import {
  assertCandidateReconciliationReceipt,
  candidatePackageIdentity,
  encodeCandidateRequest,
  installedAdapterProjectionDigest,
  managedProjectionDigest,
  publishCandidateReconciliationCapability,
  routeRegistryDigest,
  sha256,
  type CandidatePackageIdentity,
  type CandidateReconciliationRequest,
  type CandidateReconciliationReceipt,
} from '../../src/cli/commands/candidate-reconciliation';
import { acquireExclusiveDirectoryLock } from '../../src/effects/locking/exclusive-directory-lock';

const ROOT = join(import.meta.dir, '..', '..');
const CLI = join(ROOT, 'src', 'cli', 'index.ts');

// The update runs the Herdr skill step, which spawns `hc` from PATH; a fake hc first on PATH keeps the developer's hc out of every test.
const fakeHcBin = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-candidate-runtime-hc-')));
const pathBeforeFakeHc = process.env.PATH;
const previousBunInstall = process.env.BUN_INSTALL;
beforeAll(() => {
  writeFakeHc(fakeHcBin);
  process.env.PATH = `${fakeHcBin}:${pathBeforeFakeHc ?? ''}`;
  process.env.BUN_INSTALL = join(fakeHcBin, '.bun');
  const modules = join(process.env.BUN_INSTALL, 'install/global/node_modules');
  mkdirSync(modules, { recursive: true });
  symlinkSync(ROOT, join(modules, 'repo-harness'), 'dir');
});
afterAll(() => {
  process.env.PATH = pathBeforeFakeHc;
  if (previousBunInstall === undefined) delete process.env.BUN_INSTALL;
  else process.env.BUN_INSTALL = previousBunInstall;
  rmSync(fakeHcBin, { recursive: true, force: true });
});

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
  copyPackageRuntimeFixture(ROOT, destination);
  const manifestPath = join(destination, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { version?: string };
  manifest.version = version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const managedEntriesPath = join(destination, 'src', 'cli', 'installer', 'managed-entries.ts');
  const managedEntries = readFileSync(managedEntriesPath, 'utf-8');
  const authority = "timeout: 30";
  if (!managedEntries.includes(authority)) throw new Error('fixture requires the managed Stop timeout authority');
  if (stopTimeout === 150) {
    writeFileSync(managedEntriesPath, managedEntries.replace(
      authority,
      "timeout: route.event === 'Stop' ? 150 : 30",
    ));
  }
  if (legacyParent) {
    const globalRuntimePath = join(destination, 'src', 'cli', 'commands', 'global-runtime.ts');
    const globalRuntime = readFileSync(globalRuntimePath, 'utf-8');
    const frozenLegacy = globalRuntime.replace(
      "if (updateMode && install.status === 'ok' && opts.installSpec && opts.candidateHandoff) {",
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
  replacedPredecessorAsset?: string,
): void {
  const canonicalCandidateRoot = realpathSync(candidateRoot);
  const candidateVersion = JSON.parse(readFileSync(join(candidateRoot, 'package.json'), 'utf-8')).version;
  // Bun replaces package files in place; the predecessor then sees assets it cannot parse.
  const replaceAsset = replacedPredecessorAsset ? `printf '{}' > "${replacedPredecessorAsset}"; ` : '';
  writeExecutable(path, [
    '#!/bin/bash',
    `printf '%s\\n' "$*" >> "${logPath}"`,
    'if [[ "${1:-}" == "--version" ]]; then echo 1.4.0; exit 0; fi',
    `if [[ "\${1:-}" == "pm" && "\${2:-}" == "view" ]]; then printf '%s\\n' '${JSON.stringify(candidateVersion)}'; exit 0; fi`,
    `if [[ "$1" == "add" && "$2" == "-g" ]]; then ${replaceAsset}rm -rf "${globalPackagePath}"; ln -s "${candidateRoot}" "${globalPackagePath}"; exit 0; fi`,
    `if [[ "$1" == "${canonicalCandidateRoot}/src/cli/index.ts" || "$1" == "${globalPackagePath}/src/cli/index.ts" ]]; then exec "${process.execPath}" "$@"; fi`,
    'exit 0',
    '',
  ].join('\n'));
}

// Restore the renderer check from v0.21.2 in one CLI copy. The provider is real.
function requireLegacyRenderer(packageRoot: string): void {
  const path = join(packageRoot, 'src', 'core', 'architecture', 'projection.ts');
  const source = readFileSync(path, 'utf-8');
  const anchor = "  const pkg = record(input.package, 'archctx capabilities.package');";
  if (!source.includes(anchor)) throw new Error('fixture requires assertArchctxVersion');
  writeFileSync(path, source.replace(anchor, `${anchor}
  const renderers = record(input.renderers, 'archctx capabilities.renderers');
  if (renderers.architectureDocs !== 'archcontext.docs-renderer/v4') throw new Error('archctx architecture docs renderer mismatch');`));
}

function writeCoreOnlyInstallState(home: string): void {
  mkdirSync(join(home, '.repo-harness'), { recursive: true });
  writeFileSync(join(home, '.repo-harness', 'install-state.json'), `${JSON.stringify({
    protocol: 3,
    selection: [],
    ...versions([]),
    transaction_id: 'fixture-install',
    applied_at: '2026-09-04T00:00:00.000Z',
    ownership_manifest: [],
    previous: null,
  }, null, 2)}\n`);
}

const candidateRoots: string[] = [];
afterAll(() => { for (const root of candidateRoots) rmSync(root, { recursive: true, force: true }); });

// Agent trace writes change the live checkout. Each test owns immutable candidate code.
function fixtureCandidate(ownerRoot?: string): CandidatePackageIdentity {
  const root = ownerRoot ?? mkdtempSync(join(tmpdir(), 'repo-harness-candidate-identity-'));
  if (!ownerRoot) candidateRoots.push(root);
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version;
  return candidatePackageIdentity(copyRuntimeFixture(join(root, 'candidate'), version, 30));
}

function candidateReceipt(identity: CandidatePackageIdentity, adapterDigest: string): CandidateReconciliationReceipt {
  return {
    protocol: 3,
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
    join(request.candidate.root, 'src', 'cli', 'index.ts'),
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

const GLOBAL_RUNTIME_LOCK = '.repo-harness/transactions/global-runtime.lock';

interface ParentLock {
  readonly lockPath: string;
  readonly ownerToken: string;
  release(): void;
}

// A 0.24.1 parent publishes { pid, created_at, token } with no start_time (#973).
function holdLegacyParentLock(home: string, pid: number): ParentLock {
  const lockPath = join(realpathSync(home), GLOBAL_RUNTIME_LOCK);
  const ownerToken = `${pid}-${Date.now()}-${randomUUID()}`;
  mkdirSync(lockPath, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(lockPath, `${ownerToken}.json`),
    `${JSON.stringify({ pid, created_at: Date.now(), token: ownerToken })}\n`,
    { mode: 0o600 },
  );
  return { lockPath, ownerToken, release: () => rmSync(lockPath, { recursive: true, force: true }) };
}

function runCandidateChild(
  request: CandidateReconciliationRequest,
  env: NodeJS.ProcessEnv,
  holdParentLock: (home: string) => ParentLock = home => acquireExclusiveDirectoryLock(home, GLOBAL_RUNTIME_LOCK),
): ReturnType<typeof spawnSync> {
  const home = realpathSync(env.HOME!);
  const globalModules = join(env.BUN_INSTALL!, 'install', 'global', 'node_modules');
  mkdirSync(globalModules, { recursive: true });
  symlinkSync(request.candidate.root, join(globalModules, 'repo-harness'), 'dir');
  const lock = holdParentLock(home);
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
    const identity = fixtureCandidate();
    const candidate = buildManagedHooks('codex');
    const predecessor = structuredClone(candidate);
    const stop = predecessor.Stop?.find((entry) => entry.hooks[0]?.command.includes(' Stop --route default'));
    if (!stop) throw new Error('fixture requires Stop.default');
    stop.hooks[0]!.timeout = 150;

    expect(candidate.Stop?.[0]?.hooks[0]?.timeout).toBe(30);
    expect(managedProjectionDigest(predecessor)).not.toBe(managedProjectionDigest(candidate));
    expect(() => assertCandidateReconciliationReceipt(candidateReceipt(identity, managedProjectionDigest(predecessor)), {
      transaction_id: 'transaction-fixture',
      candidate: identity,
      target: 'codex',
      require_complete: true,
    })).toThrow('adapter projection mismatch for codex');
  });

  test('accepts the candidate projection and binds its package identity to the transaction receipt', () => {
    const identity = fixtureCandidate();
    const candidate = buildManagedHooks('codex');
    expect(() => assertCandidateReconciliationReceipt(candidateReceipt(identity, managedProjectionDigest(candidate)), {
      transaction_id: 'transaction-fixture',
      candidate: identity,
      target: 'codex',
      require_complete: true,
    })).not.toThrow();
  });

  test('candidate authority replaces a predecessor Stop timeout and preserves an unmanaged hook', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-runtime-'));
    const home = join(root, 'home');
    const cwd = join(root, 'repo');
    const candidate = fixtureCandidate(root);
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
      // The candidate reads the recorded selection; a partial reconciliation commits no new install transaction.
      writeCoreOnlyInstallState(home);
      const transaction = beginInstallHostTransaction([], env);
      expect(existsSync(transaction.backup_root)).toBe(true);
      const predecessor = structuredClone(buildManagedHooks('codex'));
      const stop = predecessor.Stop?.find((entry) => entry.hooks[0]?.command.includes(' Stop --route default'));
      if (!stop) throw new Error('fixture requires Stop.default');
      stop.hooks[0]!.timeout = 150;
      const hookPath = join(home, '.codex', 'hooks.json');
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(hookPath, JSON.stringify({
        hooks: predecessor,
        custom: { untouched: true },
      }, null, 2));

      const request: CandidateReconciliationRequest = {
        protocol: 3,
        transaction_id: sha256(transaction.backup_root),
        transaction_backup_root: transaction.backup_root,
        parent_token: token,
        candidate,
        cwd,
        target: 'codex',
        sync_skill: false,
        host_adapters: true,
        external_skills: false,
        obsidian_skills: false,
        codegraph: false,
      };
      const result = runCandidateChild(request, env);
      expect(result.status).toBe(0);
      const receipt = JSON.parse((result.stdout ?? '').toString()) as CandidateReconciliationReceipt;

      const installed = JSON.parse(readFileSync(hookPath, 'utf-8')) as { hooks: Record<string, Array<{ hooks: Array<{ timeout: number; command: string }> }>>; custom: unknown };
      const installedStop = installed.hooks.Stop?.[0]?.hooks[0]?.timeout;
      expect(installedStop).toBe(30);
      expect(installed.custom).toEqual({ untouched: true });
      expect(receipt.reconciliation_scope).toBe('partial');
      expect<string | null | undefined>(receipt.adapter_projection_digests.codex).toBe(installedAdapterProjectionDigest(hookPath));
      expect(installed.hooks.Stop[0].hooks[0].command).toContain(`'${join(candidate.root, 'dist/hook-entry.js')}' Stop --route default`);
      expect(readInstallState(env)).toMatchObject({ transaction_id: 'fixture-install', selection: [], plugins: [] });
      rollbackInstallHostTransaction(transaction);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('candidate mutation rejects a forged transaction directory and consumes its parent capability once', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-capability-'));
    const home = join(root, 'home');
    const cwd = join(root, 'repo');
    const candidate = fixtureCandidate(root);
    const token = 'c'.repeat(64);
    const env = { ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun') };
    try {
      mkdirSync(cwd, { recursive: true });
      writeCoreOnlyInstallState(home);
      const transaction = beginInstallHostTransaction([], env);
      const predecessor = structuredClone(buildManagedHooks('codex'));
      const stop = predecessor.Stop?.find((entry) => entry.hooks[0]?.command.includes(' Stop --route default'));
      if (!stop) throw new Error('fixture requires Stop.default');
      stop.hooks[0]!.timeout = 150;
      const hookPath = join(home, '.codex', 'hooks.json');
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(hookPath, JSON.stringify({ hooks: predecessor }, null, 2));
      const requestBase = {
        protocol: 3 as const,
        parent_token: token,
        candidate,
        cwd,
        target: 'codex' as const,
        sync_skill: false,
        host_adapters: true,
        external_skills: false,
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
      expect(JSON.parse(readFileSync(hookPath, 'utf-8')).hooks.Stop[0].hooks[0].timeout).toBe(150);

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
      expect(JSON.parse(readFileSync(hookPath, 'utf-8')).hooks.Stop[0].hooks[0].timeout).toBe(150);
      rollbackInstallHostTransaction(transaction);

      const activeTransaction = beginInstallHostTransaction([], env);
      const request: CandidateReconciliationRequest = {
        ...requestBase,
        transaction_id: sha256(activeTransaction.backup_root),
        transaction_backup_root: activeTransaction.backup_root,
      };
      expect(runCandidateChild(request, env).status).toBe(0);
      expect(JSON.parse(readFileSync(hookPath, 'utf-8')).hooks.Stop[0].hooks[0].timeout).toBe(30);
      expect(invokeCandidateChild(request, env).status).toBe(1);
      rollbackInstallHostTransaction(activeTransaction);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('#973: a 0.24.1 parent lock record without start_time authorizes the candidate; a pid or token mismatch does not', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-legacy-lock-'));
    const home = join(root, 'home');
    const cwd = join(root, 'repo');
    const candidate = fixtureCandidate(root);
    const token = 'd'.repeat(64);
    const env = { ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun') };
    try {
      mkdirSync(cwd, { recursive: true });
      writeCoreOnlyInstallState(home);
      const predecessor = structuredClone(buildManagedHooks('codex'));
      const stop = predecessor.Stop?.find((entry) => entry.hooks[0]?.command.includes(' Stop --route default'));
      if (!stop) throw new Error('fixture requires Stop.default');
      stop.hooks[0]!.timeout = 150;
      const hookPath = join(home, '.codex', 'hooks.json');
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(hookPath, JSON.stringify({ hooks: predecessor }, null, 2));
      const requestFor = (backupRoot: string): CandidateReconciliationRequest => ({
        protocol: 3,
        parent_token: token,
        transaction_id: sha256(backupRoot),
        transaction_backup_root: backupRoot,
        candidate,
        cwd,
        target: 'codex',
        sync_skill: false,
        host_adapters: true,
        external_skills: false,
        obsidian_skills: false,
        codegraph: false,
      });
      const publish = (request: CandidateReconciliationRequest, lock: ParentLock, lockOwnerToken: string): void => {
        publishCandidateReconciliationCapability({
          transactionId: request.transaction_id,
          transactionBackupRoot: request.transaction_backup_root,
          parentToken: token,
          parentPid: process.pid,
          lockPath: lock.lockPath,
          lockOwnerToken,
        });
      };

      const refusals = [
        { lockPid: process.pid + 1, capabilityToken: (lock: ParentLock) => lock.ownerToken },
        { lockPid: process.pid, capabilityToken: () => `${process.pid}-${Date.now()}-${randomUUID()}` },
      ];
      for (const refusal of refusals) {
        const transaction = beginInstallHostTransaction([], env);
        const request = requestFor(transaction.backup_root);
        const lock = holdLegacyParentLock(home, refusal.lockPid);
        try {
          publish(request, lock, refusal.capabilityToken(lock));
          const result = invokeCandidateChild(request, env);
          expect(result.status).toBe(1);
          expect(String(result.stderr)).toContain('parent does not own the active global runtime lock');
        } finally {
          lock.release();
        }
        rollbackInstallHostTransaction(transaction);
      }
      expect(JSON.parse(readFileSync(hookPath, 'utf-8')).hooks.Stop[0].hooks[0].timeout).toBe(150);

      const transaction = beginInstallHostTransaction([], env);
      const request = requestFor(transaction.backup_root);
      const result = runCandidateChild(request, env, canonicalHome => holdLegacyParentLock(canonicalHome, process.pid));
      expect(String(result.stderr)).not.toContain('parent does not own the active global runtime lock');
      expect(result.status).toBe(0);
      expect(JSON.parse(readFileSync(hookPath, 'utf-8')).hooks.Stop[0].hooks[0].timeout).toBe(30);
      rollbackInstallHostTransaction(transaction);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('candidate reconciliation refreshes a complete ownership ledger after exact host projection verification', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-ledger-'));
    const home = join(root, 'home');
    const cwd = join(root, 'repo');
    const candidate = fixtureCandidate(root);
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
      writeCoreOnlyInstallState(home);
      const transaction = beginInstallHostTransaction([], env);
      const request: CandidateReconciliationRequest = {
        protocol: 3,
        transaction_id: sha256(transaction.backup_root),
        transaction_backup_root: transaction.backup_root,
        parent_token: token,
        candidate,
        cwd,
        target: 'codex',
        sync_skill: true,
        host_adapters: true,
        external_skills: false,
        obsidian_skills: false,
        codegraph: false,
      };
      const result = runCandidateChild(request, env);
      expect(result.status).toBe(0);
      const receipt = JSON.parse((result.stdout ?? '').toString()) as CandidateReconciliationReceipt;

      const installed = readInstallState(env);
      expect(receipt.reconciliation_scope).toBe('complete');
      expect(receipt.ownership_manifest_digest).toBe(`sha256:${createHash('sha256').update(JSON.stringify(installed?.ownership_manifest)).digest('hex')}`);
      expect(installed?.plugins).toEqual([]);
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
      writeCoreOnlyInstallState(home);
      const predecessor = structuredClone(buildManagedHooks('codex'));
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

  for (const scenario of ['parent-renderer', 'candidate-renderer', 'wrong-version', 'candidate-daemon'] as const) {
    test(`#699 ${scenario}: update binds verification to the installed candidate`, () => {
      const root = mkdtempSync(join(tmpdir(), 'repo-harness-update-699-'));
      const home = join(root, 'home');
      const repo = join(root, 'repo');
      const bin = join(root, 'bin');
      const parentRoot = join(root, 'parent');
      const candidateRoot = join(root, 'candidate');
      const bunLog = join(root, 'bun.log');
      try {
        mkdirSync(repo, { recursive: true });
        mkdirSync(bin, { recursive: true });
        copyRuntimeFixture(parentRoot, '0.21.2', 30);
        copyRuntimeFixture(candidateRoot, '0.22.1', 150);
        if (scenario === 'parent-renderer') requireLegacyRenderer(parentRoot);
        if (scenario === 'candidate-renderer') requireLegacyRenderer(candidateRoot);
        if (scenario === 'candidate-daemon') {
          // Inject a daemon status failure without starting or changing any shared daemon.
          const providerPath = join(candidateRoot, 'src', 'effects', 'architecture', 'archctx-provider.ts');
          const provider = readFileSync(providerPath, 'utf-8');
          const anchor = 'export function verifyArchctxDaemonRuntime(repoRoot: string, options: ArchctxProviderOptions = {}): void {';
          if (!provider.includes(anchor)) throw new Error('fixture requires the daemon inspector');
          writeFileSync(providerPath, provider.replace(anchor, `${anchor}
  throw new Error('User authorization required: daemon fixture needs maintenance');`));
        }
        const globalRoot = join(home, '.bun', 'install', 'global');
        const globalPackage = join(globalRoot, 'node_modules', 'repo-harness');
        mkdirSync(join(globalRoot, 'node_modules'), { recursive: true });
        symlinkSync(parentRoot, globalPackage, 'dir');
        // The renderer and daemon checks belong to the architecture plugin.
        recordPluginSelection({ HOME: home });
        const globalManifest = join(globalRoot, 'package.json');
        const oldManifest = JSON.stringify({ dependencies: { 'repo-harness': '^0.21.2' } });
        writeFileSync(globalManifest, oldManifest);
        const cliBin = join(home, '.bun', 'bin', 'repo-harness');
        mkdirSync(join(home, '.bun', 'bin'), { recursive: true });
        const oldBin = '#!/bin/sh\necho 0.21.2\n';
        writeExecutable(cliBin, oldBin);
        const hookPath = join(home, '.codex', 'hooks.json');
        mkdirSync(join(home, '.codex'), { recursive: true });
        const oldHooks = JSON.stringify({ hooks: {}, custom: 'preserve' });
        writeFileSync(hookPath, oldHooks);
        const statePath = join(home, '.repo-harness', 'install-state.json');
        const oldState = readFileSync(statePath, 'utf-8');
        writeCandidateSwitchingBun(join(bin, 'bun'), bunLog, globalPackage, candidateRoot);
        // Model the package manager's manifest and bin writes as well as its package link.
        const bunSource = readFileSync(join(bin, 'bun'), 'utf-8');
        writeExecutable(join(bin, 'bun'), bunSource.replace(
          'if [[ "$1" == "add" && "$2" == "-g" ]]; then ',
          `if [[ "$1" == "add" && "$2" == "-g" ]]; then printf '%s' '{"dependencies":{"repo-harness":"^0.22.1"}}' > "${globalManifest}"; printf '#!/bin/sh\\necho 0.22.1\\n' > "${cliBin}"; `,
        ));
        const env = {
          ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun'),
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          REPO_HARNESS_BUN_EXECUTABLE: join(bin, 'bun'),
        };
        const args = ['update', '--target', 'codex', '--no-sync-skill', '--no-external-skills', '--no-codegraph', '--json'];
        const result = spawnSync(process.execPath, [join(parentRoot, 'src', 'cli', 'index.ts'), ...args,
          '--version', scenario === 'wrong-version' ? '0.22.2' : '0.22.1'], { cwd: repo, encoding: 'utf-8', env });
        const runtime = JSON.parse(result.stdout);
        const handoff = runtime.steps.find((step: { step: string }) => step.step === 'reconcile installed candidate runtime');
        const log = readFileSync(bunLog, 'utf-8');
        if (scenario === 'parent-renderer' || scenario === 'candidate-daemon') {
          expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
          expect(handoff.status).toBe('ok');
          expect(handoff.detail).toContain('candidate=0.22.1');
          expect(runtime.steps.some((step: { step: string }) => step.step === 'verify managed runtime dependencies')).toBe(false);
          expect(realpathSync(globalPackage)).toBe(realpathSync(candidateRoot));
          expect(JSON.parse(readFileSync(globalManifest, 'utf-8')).dependencies['repo-harness']).toBe('^0.22.1');
          expect(readFileSync(cliBin, 'utf-8')).toContain('0.22.1');
          expect(JSON.parse(readFileSync(hookPath, 'utf-8')).hooks.Stop[0].hooks[0].timeout).toBe(150);
          if (scenario === 'candidate-daemon') {
            expect(handoff.detail).toContain('Daemon readiness pending');
            expect(runtime.lines.join('\n')).toContain('User authorization required: daemon fixture needs maintenance');
          }
          // The same parent verifier must still reject v5 without a handoff.
          if (scenario === 'parent-renderer') {
            const noCli = spawnSync(process.execPath, [join(parentRoot, 'src', 'cli', 'index.ts'), ...args,
              '--version', '0.22.1', '--no-cli'], { cwd: repo, encoding: 'utf-8', env });
            expect(noCli.status).toBe(1);
            expect(noCli.stdout).toContain('archctx architecture docs renderer mismatch');
          }
        } else {
          expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(1);
          expect(handoff).toMatchObject({ status: 'failed' });
          if (scenario === 'candidate-renderer') {
            expect(handoff.stderr).toContain('archctx architecture docs renderer mismatch');
          } else {
            expect(handoff.detail).toContain('expected 0.22.2, got 0.22.1');
          }
          expect(realpathSync(globalPackage)).toBe(realpathSync(parentRoot));
          expect(readFileSync(globalManifest, 'utf-8')).toBe(oldManifest);
          expect(readFileSync(cliBin, 'utf-8')).toBe(oldBin);
          expect(readFileSync(hookPath, 'utf-8')).toBe(oldHooks);
          expect(readFileSync(statePath, 'utf-8')).toBe(oldState);
        }
        expect(log.includes('__reconcile-installed-runtime')).toBe(scenario !== 'wrong-version');
        expect(log).toContain(`add -g repo-harness@${scenario === 'wrong-version' ? '0.22.2' : '0.22.1'} --no-cache`);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }, 60_000);
  }

  test('the leftover summary comes from candidate C after B assets change in place', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-leftovers-'));
    const home = join(root, 'home');
    const repo = join(root, 'repo');
    const bin = join(root, 'bin');
    const parentRoot = join(root, 'parent-b');
    const candidateRoot = join(root, 'candidate-c');
    const bunLog = join(root, 'bun.log');
    try {
      mkdirSync(repo, { recursive: true });
      mkdirSync(bin, { recursive: true });
      copyRuntimeFixture(parentRoot, '0.17.0', 150);
      copyRuntimeFixture(candidateRoot, '0.18.0', 150);
      const globalPackagePath = join(home, '.bun', 'install', 'global', 'node_modules', 'repo-harness');
      mkdirSync(join(home, '.bun', 'install', 'global', 'node_modules'), { recursive: true });
      symlinkSync(parentRoot, globalPackagePath, 'dir');
      writeCoreOnlyInstallState(home);
      writeCandidateSwitchingBun(
        join(bin, 'bun'),
        bunLog,
        globalPackagePath,
        candidateRoot,
        join(parentRoot, 'assets', 'skill-commands', 'manifest.json'),
      );

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
      const runtime = JSON.parse(result.stdout) as { lines: string[] };
      expect(runtime.lines.filter((line) => /^\d+ leftovers \(\d+ removable\)\. Run: repo-harness upgrade$/.test(line))).toHaveLength(1);
      // The registered-repo line follows the leftover summary.
      expect(runtime.lines.at(-1)).toMatch(/^Registered repos: \d+ of \d+ have pending project upgrade work\..* Preview: repo-harness upgrade --registered$/);
      expect(readFileSync(bunLog, 'utf-8')).toContain(`${candidateRoot}/src/cli/index.ts upgrade --summary-line`);
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
      writeCoreOnlyInstallState(home);
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
  // This test copies two runtimes and runs two complete updates.
  // The full-suite run reached 32.5 seconds; one update is not the full budget.
  }, 60_000);

  // The candidate's hc step result reaches the parent for each branch: the
  // PATH hint of a fresh install (the review finding), the update and the no-change line.
  test.each([
    { label: 'missing hc, ~/.local/bin off PATH', hcBefore: null, requests: 1,
      lines: (dir: string) => [`[runtime] ok: ensure herdr-core (hc) - installed hc ${HC_MIN_VERSION} (sha256 verified) into ${dir}`, `add ${dir} to PATH to use hc; this run uses it for its later steps`] },
    { label: 'hc below the floor', hcBefore: '0.1.15', requests: 0,
      lines: (_dir: string, hc: string) => [`[runtime] ok: ensure herdr-core (hc) - hc client 0.1.15 was below the repo-harness floor ${HC_MIN_VERSION}; hc update --version ${HC_MIN_VERSION} updated it to ${HC_MIN_VERSION} at ${hc}`] },
    { label: 'hc at the floor', hcBefore: HC_MIN_VERSION, requests: 0,
      lines: (_dir: string, hc: string) => [`[runtime] ok: ensure herdr-core (hc) - hc ${HC_MIN_VERSION} at ${hc} is at or above ${HC_MIN_VERSION}; no change`] },
  ])('the default update shows the hc step result of candidate C: $label', async ({ hcBefore, requests, lines }) => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-hc-'));
    const home = join(root, 'home');
    const repo = join(root, 'repo');
    const bin = join(root, 'bin');
    const hcBin = join(root, 'hc-bin');
    const pkg = join(root, 'pkg');
    const release = join(root, 'release');
    const parentRoot = join(root, 'parent-b');
    const candidateRoot = join(root, 'candidate-c');
    const bunLog = join(root, 'bun.log');
    const server = startFakeHcRelease(root, release);
    // An hc that answers --version and --skill; `update --version X` sets its version to X.
    const fakeHc = (versionFile: string) => `#!/bin/sh\nif [ "\${1:-}" = --skill ]; then printf '%s\\n' '# hc manual (herdr-core)' '' '\`$HC_TERMINAL_ID\` is your address.'; `
      + `elif [ "\${1:-}" = update ]; then printf '%s' "$3" > "${versionFile}"; else printf 'hc %s\\n' "$(cat "${versionFile}")"; fi\n`;
    try {
      for (const dir of [repo, bin, hcBin, pkg, release]) mkdirSync(dir, { recursive: true });
      copyRuntimeFixture(parentRoot, '0.17.0', 30);
      copyRuntimeFixture(candidateRoot, '0.18.0', 30);
      writeFileSync(join(root, 'release-version'), HC_MIN_VERSION);
      writeExecutable(join(pkg, 'herdr-core'), fakeHc(join(root, 'release-version')));
      if (hcBefore !== null) {
        writeFileSync(join(root, 'hc-version'), hcBefore);
        writeExecutable(join(hcBin, 'hc'), fakeHc(join(root, 'hc-version')));
      }
      expect(spawnSync('tar', ['-czf', join(release, 'herdr-core.tar.gz'), '-C', pkg, 'herdr-core']).status).toBe(0);
      const sha256 = createHash('sha256').update(readFileSync(join(release, 'herdr-core.tar.gz'))).digest('hex');
      const url = `http://127.0.0.1:${await server.port}/herdr-core.tar.gz`;
      // Candidate C reads its own package pin; it points at the fake release.
      const assets = Object.fromEntries(['linux-aarch64', 'linux-x86_64', 'macos-aarch64', 'macos-x86_64', 'windows-x86_64'].map(name => [name, { url, sha256 }]));
      writeFileSync(join(candidateRoot, 'src', 'core', 'terminal', 'herdr-core-pin.json'), `${JSON.stringify({ min_version: HC_MIN_VERSION, release_assets: assets }, null, 2)}\n`);
      const globalPackagePath = join(home, '.bun', 'install', 'global', 'node_modules', 'repo-harness');
      mkdirSync(join(home, '.bun', 'install', 'global', 'node_modules'), { recursive: true });
      symlinkSync(parentRoot, globalPackagePath, 'dir');
      writeCoreOnlyInstallState(home);
      writeCandidateSwitchingBun(join(bin, 'bun'), bunLog, globalPackagePath, candidateRoot);

      const result = spawnSync(process.execPath, [
        join(parentRoot, 'src', 'cli', 'index.ts'),
        'update', '--target', 'codex', '--no-sync-skill', '--no-external-skills', '--no-codegraph', '--json',
      ], {
        cwd: repo,
        encoding: 'utf-8',
        // An explicit PATH: the fake hc dir or no hc, and never ~/.local/bin.
        env: { ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun'), PATH: `${bin}:${hcBin}:/usr/bin:/bin`, REPO_HARNESS_BUN_EXECUTABLE: join(bin, 'bun') },
      });

      expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
      const runtime = JSON.parse(result.stdout) as { steps: Array<{ step: string; status: string; detail?: string }> };
      const reconcile = runtime.steps.find((step) => step.step === 'reconcile installed candidate runtime');
      expect(reconcile?.status).toBe('ok');
      for (const line of lines(join(home, '.local', 'bin'), join(hcBin, 'hc'))) expect(reconcile?.detail).toContain(line);
      expect(server.requests()).toHaveLength(requests);
    } finally {
      server.stop();
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

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
        protocol: 3,
        selection: [],
        ...versions([]),
        transaction_id: 'predecessor-install',
        applied_at: '2026-09-04T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      }, null, 2)}\n`);
      const predecessor = structuredClone(buildManagedHooks('codex'));
      const stop = predecessor.Stop?.find((entry) => entry.hooks[0]?.command.includes(' Stop --route default'));
      if (!stop) throw new Error('fixture requires Stop.default');
      stop.hooks[0]!.timeout = 30;
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'hooks.json'), `${JSON.stringify({ hooks: predecessor }, null, 2)}\n`);
      writeExecutable(join(bin, 'bun'), [
        '#!/bin/bash',
        'if [[ "${1:-}" == "--version" ]]; then echo 1.4.0; exit 0; fi',
        `if [[ "\${1:-}" == "pm" && "\${2:-}" == "view" ]]; then printf '%s\\n' '${JSON.stringify(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version)}'; exit 0; fi`,
        `if [[ "\${1:-}" == "${ROOT}/src/cli/index.ts" || "\${1:-}" == "${join(globalModules, 'repo-harness', 'src', 'cli', 'index.ts')}" || "\${1:-}" == "${ROOT}/scripts/"* ]]; then exec "${process.execPath}" "$@"; fi`,
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
