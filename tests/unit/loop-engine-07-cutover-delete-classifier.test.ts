import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(import.meta.dir, '..', '..');

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf-8');
}

function lineCount(value: string): number {
  return value.split('\n').length;
}

describe('loop-engine row7 classifier cutover', () => {
  test('removes the prompt-intents semantic-classifier surface', () => {
    expect(existsSync(path.join(ROOT, 'src/cli/hook/prompt-intents.ts'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'src/cli/hook/prompt-triggers.ts'))).toBe(true);

    const command = read('src/cli/commands/prompt-guard-decision.ts');
    expect(command).toContain("../hook/prompt-triggers");
    expect(command).not.toContain("../hook/prompt-intents");
  });

  test('uses deterministic action routing instead of the intent by plan-state table', () => {
    const decision = read('src/cli/hook/prompt-guard-decision.ts');
    expect(decision).not.toContain('PROMPT_GUARD_EXECUTION_TABLE');
    expect(decision).toContain("case 'approved':");
    expect(decision).toContain("case 'executing':");
    expect(decision).toContain('decideApprovedPlanAction(intent, state)');
  });

  test('keeps prompt-guard entrypoints thin and mirrors generated assets', () => {
    const selfHost = read('.ai/hooks/prompt-guard.sh');
    const generated = read('assets/hooks/prompt-guard.sh');
    const selfHostRuntime = read('.ai/hooks/lib/prompt-guard-runtime.sh');
    const generatedRuntime = read('assets/hooks/lib/prompt-guard-runtime.sh');

    expect(lineCount(selfHost)).toBeLessThanOrEqual(300);
    expect(lineCount(generated)).toBeLessThanOrEqual(300);
    expect(selfHost).toBe(generated);
    expect(selfHostRuntime).toBe(generatedRuntime);
    expect(selfHost).toContain('lib/prompt-guard-runtime.sh');
  });

  test('documents G2 as owner override, not a passed shadow gate', () => {
    const contract = read('tasks/contracts/20260612-0539-loop-engine-07-cutover-delete-classifier.contract.md');
    expect(contract).toContain('owner override');
    expect(contract).toContain('prompt_count=1');
    expect(contract).toContain('timebox.complete=false');
    expect(contract).not.toContain('G2 is satisfied');
  });
});
