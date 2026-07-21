import { describe, expect, test } from 'bun:test';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative, resolve } from 'path';
import {
  BENCHMARK_MAX_CONCURRENCY,
  BENCHMARK_PROFILES,
  BENCHMARK_WALL_TIME_BUDGET_MS,
  addLinkedArmWorkspace,
  assertBenchmarkRuntimeArtifactUnchanged,
  assertBenchmarkSubjectUnchanged,
  benchmarkSubject,
  benchmarkChangedFiles,
  benchmarkRunLayout,
  captureBenchmarkSourceAuthority,
  claudeBenchmarkCommand,
  cloneImmutableWorkspaceBase,
  cleanupArmHostRoot,
  codexBenchmarkCommand,
  createRunOverlay,
  hashTree,
  isolatedHarnessEnvironment,
  isAuthoritativeCompletedRecord,
  isCompleteBenchmarkMatrix,
  loadHarnessScenarioManifest,
  mapWithConcurrency,
  noHarnessIsolation,
  parsePorcelainPaths,
  prepareBenchmarkRuntimeArtifact,
  prepareBenchmarkProfiles,
  rebaseAbsoluteSymlinks,
  readHookMetrics,
  writeResumeProjection,
  reportByteBindingPath,
  runBoundedProviderProcess,
  runHarnessProfileBenchmark,
  validateHarnessBenchmarkReport,
  validateHarnessBenchmarkReportByteBinding,
} from '../scripts/run-harness-profile-benchmark';

const ROOT = join(import.meta.dir, '..');

describe('No Harness / Lite / Strict benchmark authority', () => {
  test('fixes producer cost at two concurrent arms and a 50 minute absolute budget', () => {
    expect(BENCHMARK_MAX_CONCURRENCY).toBe(2);
    expect(BENCHMARK_WALL_TIME_BUDGET_MS).toBe(50 * 60 * 1000);
  });

  test('bounded arm pool preserves matrix order and never exceeds the fixed concurrency', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([0, 1, 2, 3, 4], BENCHMARK_MAX_CONCURRENCY, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Bun.sleep((5 - value) * 5);
      active -= 1;
      return value * 2;
    });
    expect(result).toEqual([0, 2, 4, 6, 8]);
    expect(peak).toBe(BENCHMARK_MAX_CONCURRENCY);
  });

  test('bounded arm pool stops scheduling new work after the first failure', async () => {
    const started: number[] = [];
    const execution = mapWithConcurrency([0, 1, 2, 3], BENCHMARK_MAX_CONCURRENCY, async (value) => {
      started.push(value);
      if (value === 1) throw new Error('arm failed');
      await Bun.sleep(20);
      return value;
    });
    await expect(execution).rejects.toThrow('arm failed');
    expect(started).toEqual([0, 1]);
  });

  test('provider deadline terminates a detached process group instead of orphaning its child', async () => {
    const started = Date.now();
    const result = await runBoundedProviderProcess(
      ['bash', '-lc', 'sleep 30 & child=$!; echo "$child"; wait "$child"'],
      ROOT,
      process.env,
      Date.now() + 100,
    );
    expect(result.timedOut).toBe(true);
    expect(result.signalCode).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
    const childPid = Number(result.stdout.trim());
    expect(Number.isInteger(childPid)).toBe(true);
    const childState = Bun.spawnSync(['ps', '-o', 'stat=', '-p', String(childPid)], {
      stdout: 'pipe', stderr: 'pipe',
    });
    const state = childState.exitCode === 0 ? childState.stdout.toString().trim() : '';
    // Linux can retain a killed descendant as a non-runnable zombie until PID
    // 1 reaps it. A zombie is terminated even though kill(pid, 0) still sees
    // the process-table entry; any runnable/sleeping descendant is a failure.
    expect(state === '' || state.startsWith('Z')).toBe(true);
  });

  test('final-content detection includes provider commits made after the arm baseline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-committed-final-content-'));
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(['git', ...args], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
      expect(result.exitCode).toBe(0);
      return result.stdout.toString().trim();
    };
    try {
      git('init', '-q');
      git('config', 'user.name', 'Benchmark Test');
      git('config', 'user.email', 'benchmark@example.com');
      mkdirSync(join(dir, 'src'));
      writeFileSync(join(dir, 'src/status.ts'), 'export const status = "old";\n');
      git('add', '.');
      git('commit', '-qm', 'seed');
      const baseline = git('rev-parse', 'HEAD');
      writeFileSync(join(dir, 'src/status.ts'), 'export const status = "new";\n');
      git('add', '.');
      git('commit', '-qm', 'provider implementation');
      expect(git('status', '--porcelain')).toBe('');
      expect(benchmarkChangedFiles(dir, baseline)).toEqual(['src/status.ts']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('workspace overlays share no mutable Git objects and push only to an arm-owned origin', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-workspace-overlay-'));
    const source = join(dir, 'source');
    const target = join(dir, 'target');
    const git = (cwd: string, ...args: string[]) => Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
    try {
      mkdirSync(source);
      expect(git(source, 'init', '-q', '--initial-branch=source-seed').exitCode).toBe(0);
      expect(git(source, 'config', 'user.name', 'Benchmark Test').exitCode).toBe(0);
      expect(git(source, 'config', 'user.email', 'benchmark@example.com').exitCode).toBe(0);
      writeFileSync(join(source, 'seed.txt'), 'seed\n');
      expect(git(source, 'add', '.').exitCode).toBe(0);
      expect(git(source, 'commit', '-qm', 'seed').exitCode).toBe(0);
      const sourceHead = git(source, 'rev-parse', 'HEAD').stdout.toString().trim();
      cloneImmutableWorkspaceBase(source, target);
      const armOrigin = join(dir, 'origin.git');
      expect(git(target, 'remote', 'get-url', 'origin').stdout.toString().trim()).toBe(armOrigin);
      expect(git(target, 'branch', '--show-current').stdout.toString().trim()).toBe('main');
      const object = git(source, 'rev-parse', 'HEAD:seed.txt').stdout.toString().trim();
      expect(statSync(join(source, '.git/objects', object.slice(0, 2), object.slice(2))).ino)
        .not.toBe(statSync(join(target, '.git/objects', object.slice(0, 2), object.slice(2))).ino);
      writeFileSync(join(target, 'arm.txt'), 'arm-only\n');
      expect(git(target, 'add', '.').exitCode).toBe(0);
      expect(git(target, 'commit', '-qm', 'arm change').exitCode).toBe(0);
      expect(git(target, 'push', '-q').exitCode).toBe(0);
      expect(git(source, 'rev-parse', 'HEAD').stdout.toString().trim()).toBe(sourceHead);
      expect(git(armOrigin, 'rev-parse', 'main').stdout.toString().trim())
        .toBe(git(target, 'rev-parse', 'HEAD').stdout.toString().trim());
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('HOME overlays rebase absolute cache symlinks away from the immutable profile base', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-home-overlay-'));
    const source = join(dir, 'source');
    const target = join(dir, 'target');
    try {
      mkdirSync(join(source, 'cache'), { recursive: true });
      writeFileSync(join(source, 'cache/package.json'), '{}\n');
      symlinkSync(join(source, 'cache'), join(source, 'current'));
      cpSync(source, target, { recursive: true });
      rebaseAbsoluteSymlinks(source, target);
      expect(readlinkSync(join(target, 'current'))).toBe(join(target, 'cache'));
      expect(readlinkSync(join(source, 'current'))).toBe(join(source, 'cache'));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('Strict workspace overlays start as linked worktrees', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-strict-linked-worktree-'));
    const primary = join(dir, 'primary');
    const linked = join(dir, 'linked');
    const git = (cwd: string, ...args: string[]) => Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
    try {
      mkdirSync(primary);
      expect(git(primary, 'init', '-q', '--initial-branch=source-seed').exitCode).toBe(0);
      expect(git(primary, 'config', 'user.name', 'Benchmark Test').exitCode).toBe(0);
      expect(git(primary, 'config', 'user.email', 'benchmark@example.com').exitCode).toBe(0);
      writeFileSync(join(primary, 'seed.txt'), 'seed\n');
      expect(git(primary, 'add', '.').exitCode).toBe(0);
      expect(git(primary, 'commit', '-qm', 'seed').exitCode).toBe(0);
      addLinkedArmWorkspace(primary, linked);
      writeResumeProjection(linked);
      const gitDir = git(linked, 'rev-parse', '--git-dir').stdout.toString().trim();
      expect(gitDir).toContain('.git/worktrees/');
      expect(git(linked, 'branch', '--show-current').stdout.toString().trim()).toBe('codex/benchmark');
      expect(readFileSync(join(linked, '.ai/harness/handoff/resume.md'), 'utf8')).toContain('## Exact Next Step');
      expect(realpathSync(linked)).not.toBe('');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('harness-enabled arm overlays grade the precreated linked provider workspace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-profile-linked-workspaces-'));
    const source = join(dir, 'source');
    const home = join(dir, 'base-home');
    const git = (cwd: string, ...args: string[]) => Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
    try {
      mkdirSync(source);
      mkdirSync(home);
      expect(git(source, 'init', '-q', '--initial-branch=main').exitCode).toBe(0);
      expect(git(source, 'config', 'user.name', 'Benchmark Test').exitCode).toBe(0);
      expect(git(source, 'config', 'user.email', 'benchmark@example.com').exitCode).toBe(0);
      writeFileSync(join(source, '.gitignore'), [
        '.ai/harness/active-plan',
        '.ai/harness/active-worktree',
        '.ai/harness/handoff/resume.md',
        '',
      ].join('\n'));
      writeFileSync(join(source, 'seed.txt'), 'seed\n');
      expect(git(source, 'add', '.').exitCode).toBe(0);
      expect(git(source, 'commit', '-qm', 'seed').exitCode).toBe(0);

      const scenario = {
        id: 'linked-workspace',
        category: 'ordinary-feature',
        prompt: 'task',
        expected_paths: [],
        acceptance_command: 'true',
        requires_resume_projection: true,
      };
      for (const profile of BENCHMARK_PROFILES) {
        const armRoot = join(dir, profile);
        const layout = {
          profile,
          scenario_id: scenario.id,
          profile_base_id: `${profile}-base`,
          workspace: join(armRoot, 'workspace'),
          home: join(armRoot, 'home'),
        };
        createRunOverlay({
          id: layout.profile_base_id,
          profile,
          workspace: realpathSync(source),
          home: realpathSync(home),
          workspaceSha256: hashTree(source),
          homeSha256: hashTree(home),
        }, layout, scenario);

        const gitDir = git(layout.workspace, 'rev-parse', '--git-dir').stdout.toString().trim();
        expect(gitDir.includes('.git/worktrees/')).toBe(profile !== 'no-harness');
        expect(existsSync(join(layout.workspace, 'plans/plan-20000101-0000-benchmark.md')))
          .toBe(profile === 'strict-harness');
        expect(existsSync(join(layout.workspace, 'tasks/contracts/20000101-0000-benchmark.contract.md')))
          .toBe(profile === 'strict-harness');
        expect(existsSync(join(layout.workspace, '.ai/harness/handoff/resume.md'))).toBe(true);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('manifest contains the exact 3x9 matrix', () => {
    const manifest = loadHarnessScenarioManifest(join(ROOT, 'evals/harness/scenarios.json'));
    expect(manifest.profiles).toEqual([...BENCHMARK_PROFILES]);
    expect(manifest.scenarios).toHaveLength(9);
    expect(new Set(manifest.scenarios.map((scenario) => scenario.category)).size).toBe(9);
    const crossCapability = manifest.scenarios.find((scenario) => scenario.category === 'cross-capability-feature');
    expect(crossCapability?.prompt).toContain('If the environment defines a workflow profile');
    expect(crossCapability?.prompt).toContain('otherwise implement directly');
    expect(crossCapability?.prompt).toContain('Stay inside the benchmark workspace');
    expect(crossCapability?.prompt).toContain('then stop without unrelated full-suite or cleanup work');
    expect(crossCapability?.prompt).not.toContain('required Standard workflow');
  });

  test('No Harness command isolates user config and rules; harness arms do not', () => {
    const noHarness = codexBenchmarkCommand('no-harness', '/tmp/work', 'task');
    expect(noHarness).toContain('--ignore-user-config');
    expect(noHarness).toContain('--ignore-rules');
    expect(noHarness).toContain('--ephemeral');
    const lite = codexBenchmarkCommand('adaptive-lite', '/tmp/work', 'task');
    expect(lite).not.toContain('--ignore-user-config');
    expect(lite).toContain('--dangerously-bypass-hook-trust');
    const claudeNoHarness = claudeBenchmarkCommand('no-harness', '/tmp/host', 'task');
    expect(claudeNoHarness).toContain('--safe-mode');
    expect(claudeNoHarness).toContain('--disable-slash-commands');
    const claudeLite = claudeBenchmarkCommand('adaptive-lite', '/tmp/host', 'task');
    expect(claudeLite).toContain('/tmp/host/.claude/settings.json');
    expect(claudeLite).not.toContain('--safe-mode');
  });

  test('binds mutable harness authorities to the disposable benchmark host', () => {
    const env = isolatedHarnessEnvironment('/tmp/benchmark-host');
    expect(env.HOME).toBe('/tmp/benchmark-host');
    expect(env.CODEX_HOME).toBe('/tmp/benchmark-host/.codex');
    expect(env.REPO_HARNESS_BRAIN_ROOT).toBe('/tmp/benchmark-host/brain');
    expect(env.BUN_INSTALL).toBe('/tmp/benchmark-host/.bun');
    expect(env.PATH?.split(':')[0]).toBe('/tmp/benchmark-host/.bun/bin');
  });

  test('packs exactly one external immutable runtime artifact and rejects mutation', () => {
    const runRoot = mkdtempSync(join(tmpdir(), 'harness-runtime-artifact-'));
    try {
      const artifact = prepareBenchmarkRuntimeArtifact(ROOT, runRoot);
      const packageRoot = join(runRoot, 'runtime-package');
      const tarballs = readdirSync(packageRoot).filter((entry) => entry.endsWith('.tgz'));

      expect(tarballs).toEqual([relative(packageRoot, artifact.path)]);
      expect(artifact.path).toMatch(/\.tgz$/);
      expect(artifact.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      const artifactOutsideRoot = relative(ROOT, realpathSync(artifact.path));
      expect(artifactOutsideRoot === '..' || artifactOutsideRoot.startsWith('../')).toBe(true);
      expect(() => assertBenchmarkRuntimeArtifactUnchanged(artifact)).not.toThrow();

      writeFileSync(artifact.path, Buffer.concat([
        readFileSync(artifact.path),
        Buffer.from('mutation'),
      ]));
      expect(() => assertBenchmarkRuntimeArtifactUnchanged(artifact))
        .toThrow('benchmark runtime artifact changed');
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });

  test('reuses one packed artifact across isolated installs without mutating source authority', () => {
    const runRoot = mkdtempSync(join(tmpdir(), 'harness-runtime-install-'));
    const manifest = join(ROOT, 'evals/harness/scenarios.json');
    const seed = resolve(ROOT, 'evals/fixtures/harness-matrix');
    try {
      const authority = captureBenchmarkSourceAuthority(ROOT, manifest, seed);
      const artifact = prepareBenchmarkRuntimeArtifact(ROOT, runRoot);
      assertBenchmarkSubjectUnchanged(authority, 'runtime artifact preparation');

      for (const suffix of ['one', 'two']) {
        const home = join(runRoot, `home-${suffix}`);
        mkdirSync(home, { recursive: true });
        const env = isolatedHarnessEnvironment(home);
        const install = Bun.spawnSync([process.execPath, 'add', '-g', artifact.path], {
          cwd: ROOT,
          env,
          stdout: 'pipe',
          stderr: 'pipe',
        });
        expect(install.exitCode).toBe(0);

        const installedCli = join(env.BUN_INSTALL ?? join(home, '.bun'), 'bin', 'repo-harness');
        expect(existsSync(installedCli)).toBe(true);
        const installedTargetOutsideRoot = relative(ROOT, realpathSync(installedCli));
        expect(installedTargetOutsideRoot === '..' || installedTargetOutsideRoot.startsWith('../')).toBe(true);
        const version = Bun.spawnSync([installedCli, '--version'], {
          cwd: ROOT,
          env,
          stdout: 'pipe',
          stderr: 'pipe',
        });
        expect(version.exitCode).toBe(0);
        expect(version.stdout.toString().trim()).toMatch(/^\d+\.\d+\.\d+/);
        expect(() => assertBenchmarkRuntimeArtifactUnchanged(artifact)).not.toThrow();
        expect(() => assertBenchmarkSubjectUnchanged(authority, `isolated install ${suffix}`))
          .not.toThrow();
      }
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });

  test('profile preparation skips no-harness installation and uses the packed absolute CLI for both harness profiles', () => {
    const source = readFileSync(join(ROOT, 'scripts/run-harness-profile-benchmark.ts'), 'utf8');
    const start = source.indexOf('function projectHarnessBase(');
    const end = source.indexOf('\nfunction prepareProfileBase(', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const block = source.slice(start, end);
    const noHarness = block.indexOf("if (profile === 'no-harness') return;");
    const artifactInstall = block.indexOf(
      "run(process.execPath, ['add', '-g', runtimeArtifact.path], workspace, env);",
    );
    const installedCli = block.indexOf(
      "const installedCli = join(env.BUN_INSTALL ?? join(hostRoot, '.bun'), 'bin', 'repo-harness');",
    );
    const installProfile = block.indexOf(
      "const installProfile = profile === 'adaptive-lite' ? 'standard' : 'strict';",
    );

    expect(noHarness).toBeGreaterThanOrEqual(0);
    expect(artifactInstall).toBeGreaterThan(noHarness);
    expect(installedCli).toBeGreaterThan(artifactInstall);
    expect(installProfile).toBeGreaterThan(installedCli);
    expect(block).toContain("assertPathOutsideRoot(installedCli, ROOT, 'installed benchmark CLI')");
    expect(block).toContain("run(installedCli, ['adopt'");
    expect(block).toContain("'install', '--profile', installProfile");
    expect(block).toContain("'--no-cli'");
    expect(block).not.toContain("join(ROOT, 'src/cli/index.ts')");
  });

  test('report construction follows the provider-execution guard and uses captured source authority', () => {
    const source = readFileSync(join(ROOT, 'scripts/run-harness-profile-benchmark.ts'), 'utf8');
    const artifactGuard = 'if (runtimeArtifact) assertBenchmarkRuntimeArtifactUnchanged(runtimeArtifact);';
    const preparedBases = source.indexOf('const preparedBases = options.execute');
    const profileSubjectGuard = source.indexOf(
      "assertBenchmarkSubjectUnchanged(sourceAuthority, 'profile preparation');",
      preparedBases,
    );
    const profileArtifactGuard = source.lastIndexOf(artifactGuard, profileSubjectGuard);
    const providerGuard = source.indexOf(
      "assertBenchmarkSubjectUnchanged(sourceAuthority, 'provider execution');",
    );
    const providerArtifactGuard = source.lastIndexOf(artifactGuard, providerGuard);
    const reportStart = source.indexOf('const report: HarnessBenchmarkReport = {', providerGuard);
    const reportWrite = source.indexOf('writeHarnessBenchmarkReport(report, options.report);', reportStart);

    expect(preparedBases).toBeGreaterThanOrEqual(0);
    expect(profileArtifactGuard).toBeGreaterThan(preparedBases);
    expect(profileArtifactGuard).toBeLessThan(profileSubjectGuard);
    expect(providerArtifactGuard).toBeGreaterThan(profileSubjectGuard);
    expect(providerArtifactGuard).toBeLessThan(providerGuard);
    expect(providerGuard).toBeGreaterThanOrEqual(0);
    expect(reportStart).toBeGreaterThan(providerGuard);
    expect(reportWrite).toBeGreaterThan(reportStart);
    expect(source.slice(providerGuard, reportStart)).not.toContain('benchmarkSubject(');
    const reportBlock = source.slice(reportStart, reportWrite);
    expect(reportBlock).toContain('source_commit: sourceAuthority.sourceCommit');
    expect(reportBlock).toContain('...sourceAuthority.subject');
    expect(reportBlock).not.toContain('benchmarkSubject(');
  });

  test('rejects Git-clean install-profile mode drift against the initial benchmark subject', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-subject-mode-drift-'));
    const source = join(dir, 'source');
    const host = join(dir, 'host');
    const manifest = join(source, 'manifest.json');
    const seed = join(source, 'seed');
    const executablePaths = [
      join(source, 'src/cli/index.ts'),
      join(source, 'src/cli/hook-entry.ts'),
    ];
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(['git', ...args], { cwd: source, stdout: 'pipe', stderr: 'pipe' });
      expect(result.exitCode).toBe(0);
      return result.stdout.toString().trim();
    };
    type BenchmarkAuthority = {
      root: string;
      manifestPath: string;
      seed: string;
      sourceCommit: string;
      subject: ReturnType<typeof benchmarkSubject>;
    };
    const runner = await import('../scripts/run-harness-profile-benchmark') as unknown as {
      captureBenchmarkSourceAuthority?: (root: string, manifestPath: string, seed: string) => BenchmarkAuthority;
      assertBenchmarkSubjectUnchanged?: (authority: BenchmarkAuthority, phase: string) => void;
    };
    try {
      mkdirSync(join(source, 'src/cli'), { recursive: true });
      mkdirSync(join(source, 'assets'));
      mkdirSync(seed);
      writeFileSync(join(source, 'package.json'), JSON.stringify({
        name: 'benchmark-mode-drift-fixture',
        version: '1.0.0',
        bin: {
          'benchmark-mode-drift-fixture': 'src/cli/index.ts',
          'benchmark-mode-drift-hook': 'src/cli/hook-entry.ts',
        },
      }));
      writeFileSync(executablePaths[0], '#!/usr/bin/env bun\n');
      writeFileSync(executablePaths[1], '#!/usr/bin/env bun\n');
      executablePaths.forEach((path) => chmodSync(path, 0o755));
      writeFileSync(manifest, '{}\n');
      writeFileSync(join(seed, 'fixture.txt'), 'seed\n');
      git('init', '-q', '--initial-branch=main');
      git('config', 'user.name', 'Benchmark Test');
      git('config', 'user.email', 'benchmark@example.com');
      git('config', 'core.filemode', 'false');
      git('add', '.');
      git('commit', '-qm', 'seed');

      const authority = runner.captureBenchmarkSourceAuthority?.(source, manifest, seed);
      const initialSubject = benchmarkSubject(source, manifest, seed);
      expect(executablePaths.map((path) => statSync(path).mode & 0o777)).toEqual([0o755, 0o755]);

      const install = Bun.spawnSync([process.execPath, 'add', '-g', source], {
        cwd: source,
        env: { ...process.env, HOME: host, BUN_INSTALL: join(host, '.bun') },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(install.exitCode).toBe(0);
      expect(git('status', '--porcelain')).toBe('');
      expect(executablePaths.map((path) => statSync(path).mode & 0o777)).toEqual([0o777, 0o777]);
      const driftedSubject = benchmarkSubject(source, manifest, seed);
      expect(driftedSubject.install_profile_inputs_sha256).not.toBe(initialSubject.install_profile_inputs_sha256);
      expect(driftedSubject.benchmark_subject_sha256).not.toBe(initialSubject.benchmark_subject_sha256);

      expect(typeof runner.captureBenchmarkSourceAuthority).toBe('function');
      expect(typeof runner.assertBenchmarkSubjectUnchanged).toBe('function');
      expect(() => runner.assertBenchmarkSubjectUnchanged!(authority!, 'profile-preparation'))
        .toThrow(/profile-preparation.*install_profile_inputs_sha256|install_profile_inputs_sha256.*profile-preparation/);
      expect(() => runner.assertBenchmarkSubjectUnchanged!(authority!, 'provider execution'))
        .toThrow(/provider execution.*install_profile_inputs_sha256|install_profile_inputs_sha256.*provider execution/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('parses NUL-delimited porcelain entries, stripping the leading XY status columns', () => {
    expect(parsePorcelainPaths(' M src/range.ts\0?? deploy/sql/0001.sql\0')).toEqual([
      'src/range.ts',
      'deploy/sql/0001.sql',
    ]);
  });

  test('takes only the new path for a rename entry, consuming its paired source token', () => {
    // git status --porcelain=v1 -z renders a rename as two NUL-delimited
    // tokens: "R  <new path>" followed by "<old path>" alone (no XY prefix on
    // the second token). Only the new path should be counted -- treating
    // both as separate artifacts would double-count a single rename.
    expect(parsePorcelainPaths('R  plans/plan-b.md\0plans/plan-a.md\0?? tasks/todos.md\0')).toEqual([
      'plans/plan-b.md',
      'tasks/todos.md',
    ]);
  });

  test('preserves a path containing spaces and an embedded arrow-like substring, which -z leaves unquoted and unmangled', () => {
    expect(parsePorcelainPaths(' M docs/notes -> old name.md\0')).toEqual([
      'docs/notes -> old name.md',
    ]);
  });

  test('proves Claude No Harness isolation from its structured init event', () => {
    const init = JSON.stringify({
      type: 'system', subtype: 'init', skills: [], plugins: [], mcp_servers: [], slash_commands: [],
    });
    expect(noHarnessIsolation('claude', 'no-harness', init, 0)).toBe('passed');
    expect(noHarnessIsolation('claude', 'no-harness', JSON.stringify({
      type: 'system', subtype: 'init', skills: ['leak'], plugins: [], mcp_servers: [], slash_commands: [],
    }), 0)).toBe('failed');
    expect(noHarnessIsolation('claude', 'no-harness', init, 1)).toBe('failed');
  });

  test('authoritative completion rejects provider success when the grader failed', () => {
    const record = {
      profile: 'adaptive-lite', provider_exit_code: 0, usage_authority: 'structured-provider',
      baseline_revision: '0'.repeat(40),
      status: 'failed', grader_acceptance: 'failed', no_harness_isolation: 'not_applicable',
    } as unknown as Parameters<typeof isAuthoritativeCompletedRecord>[0];
    expect(isAuthoritativeCompletedRecord(record)).toBe(false);
    expect(isAuthoritativeCompletedRecord({ ...record, status: 'passed', grader_acceptance: 'passed' })).toBe(true);
  });

  test('dry-run emits all required metrics as null/unavailable rather than estimates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-matrix-test-'));
    try {
      const reportPath = join(dir, 'report.json');
      const report = await runHarnessProfileBenchmark({
        execute: false, scenario: [], manifest: join(ROOT, 'evals/harness/scenarios.json'), report: reportPath,
      });
      expect(report.records).toHaveLength(27);
      expect(report.protocol).toBe('repo-harness-profile-benchmark/report/v2');
      expect(report.authoritative).toBe(false);
      expect(report.provider_version).toBe('unavailable');
      expect(report.records.every((record) => record.input_tokens === null && record.grader_acceptance === 'unavailable')).toBe(true);
      expect(report.records.every((record) => record.baseline_revision === null)).toBe(true);
      expect(JSON.parse(readFileSync(reportPath, 'utf-8')).records).toHaveLength(27);
      expect(readFileSync(reportPath.replace(/\.json$/, '.md'), 'utf-8')).toContain('non-authoritative');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('benchmark runtime evidence reads only the event-level telemetry authority', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-event-telemetry-reader-'));
    try {
      const runs = join(dir, '.ai/harness/runs');
      mkdirSync(runs, { recursive: true });
      writeFileSync(join(runs, 'hook-invocations.jsonl'), '{"protocol":1,"duration_ms":999}\n');
      writeFileSync(join(runs, 'hook-events.jsonl'), `${JSON.stringify({
        protocol: 'loop-engine-hook-event/v1', kind: 'hook_event', event_id: 'event-1',
        started_at: '2026-07-21T00:00:00.000Z', completed_at: '2026-07-21T00:00:00.100Z',
        host: null, session_id: null, run_id: null, turn_id: null,
        event: 'PreToolUse', route_id: 'edit', exit_code: 0, blocked: false, result_reason: 'ok', runtime_entries: 1,
        steps: [{ name: 'handler', execution: 'in_process', started_at: '2026-07-21T00:00:00.000Z', elapsed_ms: 100, exit_code: 0, output_bytes: 0 }],
        metrics: { state_resolutions: 1, child_processes: 0, files_read: 1, files_written: 0, durable_writes: 0, write_transactions: 0, full_projection_writes: 0, event_writes: 0, elapsed_ms: 100 },
        measurement: { complete: true, complete_metrics: ['runtime_entries', 'state_resolutions', 'child_processes', 'files_read', 'files_written', 'durable_writes', 'write_transactions', 'full_projection_writes', 'event_writes', 'elapsed_ms'], incomplete_metrics: [], opaque_steps: [] },
        fingerprint: `sha256:${'0'.repeat(64)}`,
      })}\n`);
      expect(readHookMetrics(dir)).toHaveLength(1);
      expect(readHookMetrics(dir)[0]?.event_id).toBe('event-1');
      writeFileSync(join(runs, 'hook-events.jsonl'), 'not-json\n');
      expect(() => readHookMetrics(dir)).toThrow('invalid hook event telemetry');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('binds the report to benchmark subject components, provenance, and exact report bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-matrix-test-'));
    try {
      const reportPath = join(dir, 'report.json');
      const report = await runHarnessProfileBenchmark({
        execute: false, scenario: [], manifest: join(ROOT, 'evals/harness/scenarios.json'), report: reportPath,
      });
      const hashes = [
        report.benchmark_subject_sha256,
        report.runner_sha256,
        report.scenario_manifest_sha256,
        report.fixture_set_sha256,
        report.install_profile_inputs_sha256,
        report.provider_invocation_schema_sha256,
      ];
      expect(hashes.every((hash) => /^sha256:[a-f0-9]{64}$/.test(hash))).toBe(true);
      expect(report.source_commit).toMatch(/^[a-f0-9]{40}$/);
      expect(report.provenance.producer).toBe('repo-harness-profile-benchmark');
      expect(report.provenance.profile_base_count).toBe(3);
      expect(report.provenance.arm_count).toBe(27);
      expect(report.provenance.profile_bases.map((base) => base.profile)).toEqual([...BENCHMARK_PROFILES]);
      expect(report.provenance.profile_bases.every((base) => base.workspace_sha256 === null && base.home_sha256 === null)).toBe(true);
      expect(isCompleteBenchmarkMatrix(report.records, loadHarnessScenarioManifest(join(ROOT, 'evals/harness/scenarios.json')).scenarios)).toBe(true);
      expect(isCompleteBenchmarkMatrix([...report.records.slice(0, 26), report.records[0]], loadHarnessScenarioManifest(join(ROOT, 'evals/harness/scenarios.json')).scenarios)).toBe(false);
      expect(report.report_byte_binding).toBe('report.sha256.json');
      expect(validateHarnessBenchmarkReport(reportPath).benchmark_subject_sha256).toBe(report.benchmark_subject_sha256);
      expect(() => validateHarnessBenchmarkReport(reportPath, true)).toThrow('benchmark report is not authoritative');
      const binding = validateHarnessBenchmarkReportByteBinding(reportPath, report.benchmark_subject_sha256);
      expect(binding.files.json.path).toBe('report.json');
      expect(binding.files.markdown.path).toBe('report.md');
      expect(readFileSync(reportByteBindingPath(reportPath), 'utf-8')).toContain(report.benchmark_subject_sha256);

      writeFileSync(reportPath.replace(/\.json$/, '.md'), '# replaced\n');
      expect(() => validateHarnessBenchmarkReportByteBinding(reportPath, report.benchmark_subject_sha256))
        .toThrow('benchmark markdown report bytes changed');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('prepares one immutable base per profile and plans 27 isolated writable arm overlays', () => {
    const manifest = loadHarnessScenarioManifest(join(ROOT, 'evals/harness/scenarios.json'));
    const prepared: string[] = [];
    const bases = prepareBenchmarkProfiles(BENCHMARK_PROFILES, (profile) => {
      prepared.push(profile);
      return `${profile}-base`;
    });
    const layout = benchmarkRunLayout('/tmp/benchmark-run', BENCHMARK_PROFILES, manifest.scenarios, 'run-1');
    expect(prepared).toEqual([...BENCHMARK_PROFILES]);
    expect(bases.size).toBe(3);
    expect(layout).toHaveLength(27);
    expect(new Set(layout.map((arm) => arm.profile_base_id)).size).toBe(3);
    expect(new Set(layout.map((arm) => arm.workspace)).size).toBe(27);
    expect(new Set(layout.map((arm) => arm.home)).size).toBe(27);
    expect(layout.every((arm) => !arm.workspace.includes('/profile-base/') && !arm.home.includes('/profile-base/'))).toBe(true);
  });

  test('tree evidence hashes directory symlinks as link targets without following them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-tree-symlink-'));
    try {
      mkdirSync(join(dir, 'target-a'));
      mkdirSync(join(dir, 'target-b'));
      symlinkSync('target-a', join(dir, 'current'));
      const first = hashTree(dir);
      rmSync(join(dir, 'current'));
      symlinkSync('target-b', join(dir, 'current'));
      expect(hashTree(dir)).not.toBe(first);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('every record carries an artifact_files path list consistent with its artifact_files_created count', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-matrix-test-'));
    try {
      const reportPath = join(dir, 'report.json');
      const report = await runHarnessProfileBenchmark({
        execute: false, scenario: [], manifest: join(ROOT, 'evals/harness/scenarios.json'), report: reportPath,
      });
      expect(report.records.every((record) => Array.isArray(record.artifact_files))).toBe(true);
      expect(report.records.every((record) => record.artifact_files.length === record.artifact_files_created)).toBe(true);
      // Dry-run never touches a workspace, so the path list is empty, not estimated.
      expect(report.records.every((record) => record.artifact_files.length === 0)).toBe(true);
      const persisted = JSON.parse(readFileSync(reportPath, 'utf-8')) as { records: Array<{ artifact_files: unknown }> };
      expect(persisted.records.every((record) => Array.isArray(record.artifact_files))).toBe(true);
      const markdown = readFileSync(reportPath.replace(/\.json$/, '.md'), 'utf-8');
      expect(markdown).toContain('## Artifact Files');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('cleanupArmHostRoot removes only the disposable host install, never base/workspace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-matrix-cleanup-test-'));
    try {
      const base = join(dir, 'base');
      const workspace = join(dir, 'workspace');
      const host = join(dir, 'host');
      mkdirSync(join(base, '.git'), { recursive: true });
      mkdirSync(workspace, { recursive: true });
      mkdirSync(join(host, '.bun/bin'), { recursive: true });
      writeFileSync(join(host, '.bun/bin/bun'), 'stub-toolchain-binary');
      writeFileSync(join(workspace, 'evidence.txt'), 'kept for regrade');

      cleanupArmHostRoot(host);

      expect(existsSync(host)).toBe(false);
      // base and workspace share a git object store (workspace is a git
      // worktree of base); regradeHarnessBenchmarkReport re-grades against
      // the retained workspace, so cleanup must never touch either.
      expect(existsSync(base)).toBe(true);
      expect(existsSync(workspace)).toBe(true);
      expect(readFileSync(join(workspace, 'evidence.txt'), 'utf-8')).toBe('kept for regrade');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('cleanupArmHostRoot is a no-op when the host root was never created', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-matrix-cleanup-noop-test-'));
    try {
      const host = join(dir, 'host');
      expect(existsSync(host)).toBe(false);
      expect(() => cleanupArmHostRoot(host)).not.toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('executeRun calls cleanupArmHostRoot after extracting arm results, before returning the record', () => {
    const source = readFileSync(join(ROOT, 'scripts/run-harness-profile-benchmark.ts'), 'utf-8');
    const executeRunStart = source.indexOf('async function executeRun(');
    const executeRunEnd = source.indexOf('\nfunction dryRunRecord(');
    expect(executeRunStart).toBeGreaterThan(-1);
    expect(executeRunEnd).toBeGreaterThan(executeRunStart);
    const executeRunBody = source.slice(executeRunStart, executeRunEnd);
    expect(executeRunBody).toContain('cleanupArmHostRoot(hostRoot);');
    // Cleanup must run after every result-extraction read (grader, hooks,
    // context tokens, changed files, workspace hash) and before the return
    // statement, so it never races a read it would invalidate.
    const cleanupIndex = executeRunBody.indexOf('cleanupArmHostRoot(hostRoot);');
    const returnIndex = executeRunBody.indexOf('\n  return {');
    expect(executeRunBody.indexOf('workspaceEvidenceHash(workspace, baselineRevision)')).toBeLessThan(cleanupIndex);
    expect(cleanupIndex).toBeLessThan(returnIndex);
  });
});
