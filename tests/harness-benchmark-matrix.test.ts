import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BENCHMARK_PROFILES,
  claudeBenchmarkCommand,
  cleanupArmHostRoot,
  codexBenchmarkCommand,
  isolatedHarnessEnvironment,
  isAuthoritativeCompletedRecord,
  loadHarnessScenarioManifest,
  noHarnessIsolation,
  parsePorcelainPaths,
  runHarnessProfileBenchmark,
} from '../scripts/run-harness-profile-benchmark';

const ROOT = join(import.meta.dir, '..');

describe('No Harness / Lite / Strict benchmark authority', () => {
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
      expect(report.authoritative).toBe(false);
      expect(report.provider_version).toBe('unavailable');
      expect(report.records.every((record) => record.input_tokens === null && record.grader_acceptance === 'unavailable')).toBe(true);
      expect(JSON.parse(readFileSync(reportPath, 'utf-8')).records).toHaveLength(27);
      expect(readFileSync(reportPath.replace(/\.json$/, '.md'), 'utf-8')).toContain('non-authoritative');
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
    expect(executeRunBody.indexOf('workspaceEvidenceHash(workspace)')).toBeLessThan(cleanupIndex);
    expect(cleanupIndex).toBeLessThan(returnIndex);
  });
});
