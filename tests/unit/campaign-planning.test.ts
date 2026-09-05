import { expect, test } from 'bun:test';
import { planningPath, rejectPlannedFeatures, validatePlanningResult } from '../../src/core/automation/campaign-planning';
const surfaces = { paths: ['src/example.ts'], cli_commands: [], mcp_tools: [], public_exports: [], protocol_kinds: [], capability_nodes: [] };
const result = { job_sha256: `sha256:${'a'.repeat(64)}`, outcome: 'plan_ready', explanation: 'A concrete local diagnosis.', surfaces, characterization: null };
test('plan-ready requires a complete explicit surface declaration', () => {
  expect(validatePlanningResult(result).outcome).toBe('plan_ready');
  expect(() => validatePlanningResult({ ...result, surfaces: null })).toThrow();
  expect(() => validatePlanningResult({ ...result, surfaces: { paths: ['src/example.ts'] } })).toThrow();
  expect(() => validatePlanningResult({ ...result, outcome: 'done' })).toThrow();
});
test.each(['cli_commands', 'mcp_tools', 'public_exports', 'protocol_kinds', 'capability_nodes'] as const)('%s additions hard-stop', key => {
  expect(() => rejectPlannedFeatures({ ...surfaces, [key]: ['new surface'] })).toThrow('repair planning adds');
});
test.each(['../src/a.ts', '/tmp/a', 'src/**', 'src/', './src/a', 'src/../a', 'src\\a', '.git/config', 'nested/.GIT/config'])('rejects unbounded or escaping scope %s', path => expect(() => planningPath(path)).toThrow());
test('test-gap evidence must demonstrate old tests passed and falsifier failed', () => {
  const characterization = { current_behavior: 'Empty input returns null', regression_guard: 'tests/guard.ts', old_tests_command: 'bun test tests/old.ts', falsifier_command: 'bun test tests/guard.ts', old_tests_exit: 0 as const, falsifier_exit: 1, artifact: { path: 'tasks/evidence/gap.txt', sha256: `sha256:${'b'.repeat(64)}` } };
  expect(validatePlanningResult({ ...result, characterization }).characterization).toEqual(characterization);
  expect(() => validatePlanningResult({ ...result, characterization: { ...characterization, falsifier_exit: 0 } })).toThrow();
  expect(() => validatePlanningResult({ ...result, characterization: { ...characterization, old_tests_exit: 1 } })).toThrow();
});
