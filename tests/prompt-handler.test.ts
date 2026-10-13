import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPromptHandler } from '../src/cli/hook/prompt-handler';
function fixture(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'prompt-observation-'));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
describe('prompt observation', () => {
  test('completion without plan, checks or receipt never blocks or dispatches a helper', () => fixture(root => {
    const result = runPromptHandler({ payload: { prompt: '/check done' } });
    expect(result.exitCode).toBe(0);
    expect(result.additionalContext).toContain('Completion is observed');
    expect(result.additionalContext).not.toContain('decision: block');
    expect(result.permission).toBeUndefined();
    expect(readdirSync(root)).toEqual([]);
  }));
  test('old incomplete plan/check artifacts remain observations, never an approval or archive operation', () => fixture(root => {
    mkdirSync(join(root, '.ai/harness'), { recursive: true });
    mkdirSync(join(root, 'plans'));
    writeFileSync(join(root, '.ai/harness/active-plan'), 'plans/old.md');
    writeFileSync(join(root, 'plans/old.md'), '> **Status**: Draft\n- [ ] unfinished\n');
    const before = readFileSync(join(root, 'plans/old.md'));
    const result = runPromptHandler({ payload: { prompt: '/check done' } });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(root, 'plans/old.md'))).toEqual(before);
    expect(readFileSync(join(root, '.ai/harness/active-plan'), 'utf8')).toBe('plans/old.md');
    expect(readdirSync(join(root, '.ai/harness'))).toEqual(['active-plan']);
  }));
  test('ordinary questions and quoted reports bypass workflow routing', () => fixture(root => {
    for (const prompt of ['What is this repository?', '日志写着“done”，请解释']) {
      const result = runPromptHandler({ payload: { prompt } });
      expect(result).toEqual({ exitCode: 0 });
    }
  }));
  test('explicit planning advice does not create four execution artifacts or grant permission', () => fixture(root => {
    const result = runPromptHandler({ payload: { prompt: '/plan improve the module' } });
    expect(result.exitCode).toBe(0);
    expect(result.additionalContext).toContain('OperationBoundaries');
    expect(result.permission).toBeUndefined();
    expect(readdirSync(root)).toEqual([]);
  }));
});
