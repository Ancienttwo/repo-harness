import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BENCHMARK_PROFILES,
  claudeBenchmarkCommand,
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

  test('preserves porcelain leading status columns when extracting paths', () => {
    expect(parsePorcelainPaths(' M src/range.ts\n?? deploy/sql/0001.sql\n')).toEqual([
      'src/range.ts',
      'deploy/sql/0001.sql',
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
});
