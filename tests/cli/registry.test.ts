import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  ALL_TARGETS,
  getTarget,
  listTargetIds,
} from '../../src/cli/installer/targets/registry';
import { codexTarget } from '../../src/cli/installer/targets/codex';
import { claudeTarget } from '../../src/cli/installer/targets/claude';
import {
  applyRepoHarnessRegistryBatch,
  readRegisteredRepoHarnessRepos,
  repoHarnessAuthorizationRevision,
} from '../../src/effects/repo-registry';

describe('installer target registry', () => {
  test('ALL_TARGETS lists codex then claude in stable order', () => {
    expect(ALL_TARGETS.length).toBe(2);
    expect(ALL_TARGETS[0].id).toBe('codex');
    expect(ALL_TARGETS[1].id).toBe('claude');
  });

  test('ALL_TARGETS is frozen so plug-in order cannot drift at runtime', () => {
    expect(Object.isFrozen(ALL_TARGETS)).toBe(true);
  });

  test('getTarget returns the registered instance by id', () => {
    expect(getTarget('codex')).toBe(codexTarget);
    expect(getTarget('claude')).toBe(claudeTarget);
  });

  test('getTarget returns undefined for unknown id', () => {
    expect(getTarget('cursor')).toBeUndefined();
    expect(getTarget('')).toBeUndefined();
    expect(getTarget('CODEX')).toBeUndefined();
  });

  test('listTargetIds matches registry order', () => {
    expect(listTargetIds()).toEqual(['codex', 'claude']);
  });

  test('codex supportsLocation is global-only (Phase 0 verified contract)', () => {
    expect(codexTarget.supportsLocation('global')).toBe(true);
    expect(codexTarget.supportsLocation('local')).toBe(false);
  });

  test('claude supportsLocation accepts both global and local', () => {
    expect(claudeTarget.supportsLocation('global')).toBe(true);
    expect(claudeTarget.supportsLocation('local')).toBe(true);
  });

  test('describePaths returns expected host slot for each location (Phase 1B: absolute paths)', () => {
    // Phase 1A scaffolds returned literal ~/ paths; Phase 1B resolves to
    // absolute via $HOME / os.homedir(), so we assert the endpoint shape
    // rather than the literal prefix.
    expect(codexTarget.describePaths('global')[0]).toMatch(/\/\.codex\/hooks\.json$/);
    expect(codexTarget.describePaths('local')).toEqual([]);
    expect(claudeTarget.describePaths('global')[0]).toMatch(/\/\.claude\/settings\.json$/);
    expect(claudeTarget.describePaths('local')[0]).toMatch(/\/\.claude\/settings\.json$/);
  });
});

describe('repo registration persistence', () => {
  test('batch authorization validates every repo and commits one revision atomically', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'repo-harness-registry-batch-'));
    const env = { ...process.env, REPO_HARNESS_HOME: join(fixtureRoot, 'home') };
    const adoptedA = join(fixtureRoot, 'repo-a');
    const adoptedB = join(fixtureRoot, 'repo-b');
    const unadopted = join(fixtureRoot, 'not-adopted');
    try {
      for (const repo of [adoptedA, adoptedB]) {
        mkdirSync(join(repo, '.ai', 'harness'), { recursive: true });
        writeFileSync(join(repo, '.ai', 'harness', 'policy.json'), '{}\n');
      }
      mkdirSync(unadopted, { recursive: true });
      let prepared = false;
      expect(() => applyRepoHarnessRegistryBatch([
        { repoRoot: adoptedA, source: 'manual', accessMode: 'read_write' },
        { repoRoot: unadopted, source: 'manual', accessMode: 'read_write' },
      ], { env, beforeCommit: () => { prepared = true; } })).toThrow('not repo-harness adopted');
      expect(prepared).toBe(false);
      expect(readRegisteredRepoHarnessRepos({ env })).toEqual([]);
      expect(repoHarnessAuthorizationRevision(env)).toBe(0);

      let preparedRevision = -1;
      const result = applyRepoHarnessRegistryBatch([
        { repoRoot: adoptedA, source: 'manual', accessMode: 'read_write' },
        { repoRoot: adoptedB, source: 'manual', accessMode: 'read_write' },
      ], { env, bumpAuthorizationRevision: true, beforeCommit: (revision) => { preparedRevision = revision; } });
      expect(preparedRevision).toBe(1);
      expect(result.authorizationRevision).toBe(1);
      expect(readRegisteredRepoHarnessRepos({ env }).map(({ accessMode }) => accessMode)).toEqual(['read_write', 'read_write']);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test('batch authorization restores prepared config when the registry commit fails', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'repo-harness-registry-commit-failure-'));
    const registryHome = join(fixtureRoot, 'home');
    const adopted = join(fixtureRoot, 'repo');
    const configPath = join(fixtureRoot, 'mcp.local.json');
    const registryModule = resolve(import.meta.dir, '../../src/effects/repo-registry.ts');
    const workerScript = `
      import { mock } from 'bun:test';
      import * as actualFs from 'node:fs';
      const originalRenameSync = actualFs.renameSync.bind(actualFs);
      const originalWriteFileSync = actualFs.writeFileSync.bind(actualFs);
      mock.module('fs', () => ({
        ...actualFs,
        renameSync(source, target) {
          if (String(target).endsWith('registered-repos.json')) {
            const error = new Error('injected registry commit failure');
            error.code = 'EIO';
            throw error;
          }
          return originalRenameSync(source, target);
        },
      }));
      const registry = await import(process.env.REGISTRY_MODULE + '?commit-failure');
      const adopted = process.env.ADOPTED_REPO;
      const configPath = process.env.CONFIG_PATH;
      let failure = '';
      try {
        registry.applyRepoHarnessRegistryBatch([
          { repoRoot: adopted, source: 'manual', accessMode: 'read_write' },
        ], {
          beforeCommit: (revision) => originalWriteFileSync(configPath, 'new:' + revision),
          onCommitFailure: () => originalWriteFileSync(configPath, 'old'),
        });
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      process.stdout.write(JSON.stringify({
        failure,
        config: actualFs.readFileSync(configPath, 'utf-8'),
        repos: registry.readRegisteredRepoHarnessRepos(),
        revision: registry.repoHarnessAuthorizationRevision(),
      }));
    `;

    try {
      mkdirSync(join(adopted, '.ai', 'harness'), { recursive: true });
      writeFileSync(join(adopted, '.ai', 'harness', 'policy.json'), '{}\n');
      writeFileSync(configPath, 'old');
      const worker = Bun.spawn(['bun', '-e', workerScript], {
        cwd: resolve(import.meta.dir, '../..'),
        env: {
          ...process.env,
          REPO_HARNESS_HOME: registryHome,
          REGISTRY_MODULE: registryModule,
          ADOPTED_REPO: adopted,
          CONFIG_PATH: configPath,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [exitCode, output, errorOutput] = await Promise.all([
        worker.exited,
        new Response(worker.stdout).text(),
        new Response(worker.stderr).text(),
      ]);
      expect(exitCode, errorOutput).toBe(0);
      expect(JSON.parse(output)).toEqual({
        failure: 'injected registry commit failure',
        config: 'old',
        repos: [],
        revision: 0,
      });
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test('removes its newly created lock when owner metadata persistence fails', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'repo-harness-registry-lock-failure-'));
    const registryHome = join(fixtureRoot, 'home');
    const registryModule = resolve(import.meta.dir, '../../src/effects/repo-registry.ts');
    const workerScript = `
      import { mock } from 'bun:test';
      import * as actualFs from 'node:fs';
      const originalWriteFileSync = actualFs.writeFileSync.bind(actualFs);
      const originalExistsSync = actualFs.existsSync.bind(actualFs);
      let failOwnerWrite = true;
      mock.module('fs', () => ({
        ...actualFs,
        writeFileSync(target, ...args) {
          if (typeof target === 'number' && failOwnerWrite) {
            failOwnerWrite = false;
            const error = new Error('injected owner metadata write failure');
            error.code = 'EIO';
            throw error;
          }
          return originalWriteFileSync(target, ...args);
        },
      }));
      const registry = await import(process.env.REGISTRY_MODULE + '?lock-failure');
      let firstError = '';
      try {
        registry.bumpRepoHarnessAuthorizationRevision();
      } catch (error) {
        firstError = error instanceof Error ? error.message : String(error);
      }
      const lockPath = registry.repoHarnessRegisteredReposPath() + '.lock';
      const lockExistsAfterFailure = originalExistsSync(lockPath);
      const revision = registry.bumpRepoHarnessAuthorizationRevision();
      process.stdout.write(JSON.stringify({ firstError, lockExistsAfterFailure, revision }));
    `;

    try {
      mkdirSync(registryHome, { recursive: true });
      const worker = Bun.spawn(['bun', '-e', workerScript], {
        cwd: resolve(import.meta.dir, '../..'),
        env: {
          ...process.env,
          REPO_HARNESS_HOME: registryHome,
          REGISTRY_MODULE: registryModule,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [exitCode, output, errorOutput] = await Promise.all([
        worker.exited,
        new Response(worker.stdout).text(),
        new Response(worker.stderr).text(),
      ]);
      expect(exitCode, errorOutput).toBe(0);
      expect(JSON.parse(output)).toEqual({
        firstError: 'injected owner metadata write failure',
        lockExistsAfterFailure: false,
        revision: 1,
      });
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test('serializes concurrent registrations, access updates, and authorization revision bumps', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'repo-harness-registry-concurrency-'));
    const registryHome = join(fixtureRoot, 'home');
    const startPath = join(fixtureRoot, 'start');
    const registryModule = resolve(import.meta.dir, '../../src/effects/repo-registry.ts');
    const workerCount = 10;
    const bumpsPerWorker = 30;
    const workerScript = `
      import { existsSync } from 'fs';
      const registry = await import(process.env.REGISTRY_MODULE);
      while (!existsSync(process.env.START_PATH)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
      registry.registerRepoHarnessRepo(process.env.TEST_REPO, 'manual');
      registry.setRepoHarnessAccessMode(process.env.TEST_REPO, 'read_write');
      for (let index = 0; index < Number(process.env.BUMP_COUNT); index += 1) {
        registry.bumpRepoHarnessAuthorizationRevision();
      }
    `;

    try {
      mkdirSync(registryHome, { recursive: true });
      const repos = Array.from({ length: workerCount }, (_, index) => join(fixtureRoot, `repo-${index}`));
      for (const repo of repos) {
        mkdirSync(join(repo, '.ai', 'harness'), { recursive: true });
        writeFileSync(join(repo, '.ai', 'harness', 'policy.json'), '{}\n');
      }

      const workers = repos.map((repo) => Bun.spawn(['bun', '-e', workerScript], {
        cwd: resolve(import.meta.dir, '../..'),
        env: {
          ...process.env,
          REPO_HARNESS_HOME: registryHome,
          REGISTRY_MODULE: registryModule,
          START_PATH: startPath,
          TEST_REPO: repo,
          BUMP_COUNT: String(bumpsPerWorker),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      }));
      writeFileSync(startPath, 'go\n');

      const exitCodes = await Promise.all(workers.map((worker) => worker.exited));
      const errors = await Promise.all(workers.map(async (worker) => new Response(worker.stderr).text()));
      expect(exitCodes, errors.filter(Boolean).join('\n')).toEqual(Array(workerCount).fill(0));

      const registryPath = join(registryHome, 'registered-repos.json');
      expect(existsSync(registryPath)).toBe(true);
      const registry = JSON.parse(readFileSync(registryPath, 'utf-8')) as {
        authorizationRevision: number;
        repos: Array<{ path: string; accessMode: string }>;
      };
      expect(registry.authorizationRevision).toBe(workerCount * (bumpsPerWorker + 1));
      expect(registry.repos).toHaveLength(workerCount);
      expect(registry.repos.every((repo) => repo.accessMode === 'read_write')).toBe(true);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
