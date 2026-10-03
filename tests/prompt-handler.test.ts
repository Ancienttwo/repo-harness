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
    const commands: string[][] = [];
    const result = runPromptHandler({ repoRoot: root, prompt: '/check done', dependencies: {
      runCommand: args => { commands.push([...args]); throw new Error('prompt must not execute'); },
    } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Completion is observed');
    expect(result.stdout).not.toContain('decision: block');
    expect(commands).toEqual([]);
    expect(readdirSync(root)).toEqual([]);
  }));
  test('old incomplete plan/check artifacts remain observations, never an approval or archive operation', () => fixture(root => {
    mkdirSync(join(root, '.ai/harness'), { recursive: true });
    mkdirSync(join(root, 'plans'));
    writeFileSync(join(root, '.ai/harness/active-plan'), 'plans/old.md');
    writeFileSync(join(root, 'plans/old.md'), '> **Status**: Draft\n- [ ] unfinished\n');
    const before = readFileSync(join(root, 'plans/old.md'));
    const result = runPromptHandler({ repoRoot: root, input: JSON.stringify({ prompt: '/check done' }), dependencies: {
      runCommand: () => { throw new Error('no side effects'); },
    } });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(root, 'plans/old.md'))).toEqual(before);
    expect(readFileSync(join(root, '.ai/harness/active-plan'), 'utf8')).toBe('plans/old.md');
    expect(readdirSync(join(root, '.ai/harness'))).toEqual(['active-plan']);
  }));
  test('ordinary questions and quoted reports bypass workflow routing', () => fixture(root => {
    for (const prompt of ['What is this repository?', '日志写着“done”，请解释']) {
      const result = runPromptHandler({ repoRoot: root, prompt });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
    }
  }));
  test('explicit planning advice does not create four execution artifacts or grant permission', () => fixture(root => {
    const result = runPromptHandler({ repoRoot: root, prompt: '/plan improve the module', dependencies: {
      runCommand: () => { throw new Error('no automatic capture'); },
    } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('OperationBoundaries');
    expect(readdirSync(root)).toEqual([]);
  }));
});
