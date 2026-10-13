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
  test('an explicit command gets the operation boundaries and never blocks or grants permission', () => {
    const result = runPromptHandler({ payload: { prompt: '/check done' } });
    expect(result.exitCode).toBe(0);
    expect(result.additionalContext).toContain('[OperationBoundaries]');
    expect(result.additionalContext).not.toContain('decision: block');
    expect(result.permission).toBeUndefined();
  });
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
  test('ordinary questions and quoted reports bypass workflow routing', () => {
    for (const prompt of ['What is this repository?', '日志写着“done”，请解释']) {
      const result = runPromptHandler({ payload: { prompt } });
      expect(result).toEqual({ exitCode: 0 });
    }
  });
  test('only the documented prompt field is read', () => {
    expect(runPromptHandler({ payload: { user_message: '/plan improve the module' } })).toEqual({ exitCode: 0 });
  });
});
