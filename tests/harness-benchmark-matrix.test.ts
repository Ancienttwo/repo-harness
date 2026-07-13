import { describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BENCHMARK_MAX_CONCURRENCY,
  BENCHMARK_PROFILES,
  BENCHMARK_WALL_TIME_BUDGET_MS,
  benchmarkChangedFiles,
  benchmarkRunLayout,
  claudeBenchmarkCommand,
  cloneImmutableWorkspaceBase,
  codexBenchmarkCommand,
  hashTree,
  isolatedHarnessEnvironment,
  isAuthoritativeCompletedRecord,
  isCompleteBenchmarkMatrix,
  loadHarnessScenarioManifest,
  mapWithConcurrency,
  noHarnessIsolation,
  parsePorcelainPaths,
  prepareBenchmarkProfiles,
  rebaseAbsoluteSymlinks,
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
    expect(() => process.kill(childPid, 0)).toThrow();
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
      expect(git(source, 'init', '-q').exitCode).toBe(0);
      expect(git(source, 'config', 'user.name', 'Benchmark Test').exitCode).toBe(0);
      expect(git(source, 'config', 'user.email', 'benchmark@example.com').exitCode).toBe(0);
      writeFileSync(join(source, 'seed.txt'), 'seed\n');
      expect(git(source, 'add', '.').exitCode).toBe(0);
      expect(git(source, 'commit', '-qm', 'seed').exitCode).toBe(0);
      const sourceHead = git(source, 'rev-parse', 'HEAD').stdout.toString().trim();
      cloneImmutableWorkspaceBase(source, target);
      const armOrigin = join(dir, 'origin.git');
      expect(git(target, 'remote', 'get-url', 'origin').stdout.toString().trim()).toBe(armOrigin);
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
});
