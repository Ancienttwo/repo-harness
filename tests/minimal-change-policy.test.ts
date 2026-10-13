import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadMinimalChangePolicy,
  normalizeMinimalChangePolicy,
} from '../src/cli/hook/minimal-change-policy';

describe('minimal-change policy', () => {
  test('defaults to off', () => {
    const policy = normalizeMinimalChangePolicy(undefined);
    expect(policy.mode).toBe('off');
    expect(policy.session_context).toBe(false);
    expect(policy.prompt_advice).toBe(false);
  });

  test('explicit advice enables advisory context', () => {
    const policy = normalizeMinimalChangePolicy({ mode: 'advice' });
    expect(policy.mode).toBe('advice');
    expect(policy.session_context).toBe(true);
    expect(policy.prompt_advice).toBe(true);
    expect(policy.warnings).toEqual([]);
  });

  test('supports explicit off mode', () => {
    const policy = normalizeMinimalChangePolicy({ mode: 'off', session_context: false });
    expect(policy.mode).toBe('off');
    expect(policy.session_context).toBe(false);
  });

  test('enforce and other unknown modes fail validation and turn the policy off', () => {
    for (const mode of ['enforce', 'ENFORCE']) {
      const policy = normalizeMinimalChangePolicy({ mode });
      expect(policy.mode).toBe('off');
      expect(policy.session_context).toBe(false);
      expect(policy.prompt_advice).toBe(false);
      expect(policy.warnings.join('\n')).toContain(`unknown minimal_change.mode=${mode}`);
    }
  });

  test('bounds the context word budget', () => {
    expect(normalizeMinimalChangePolicy({ max_context_words: 10 }).max_context_words).toBe(60);
    expect(normalizeMinimalChangePolicy({ max_context_words: 1000 }).max_context_words).toBe(240);
  });

  test('loads repo policy and disables on missing, retired or malformed policy', () => {
    const repo = mkdtempSync(join(tmpdir(), 'minimal-change-policy-'));
    mkdirSync(join(repo, '.ai/harness'), { recursive: true });

    expect(loadMinimalChangePolicy(repo).mode).toBe('off');

    writeFileSync(
      join(repo, '.ai/harness/policy.json'),
      JSON.stringify({ minimal_change: { mode: 'advice' } }, null, 2),
    );
    expect(loadMinimalChangePolicy(repo).mode).toBe('advice');

    writeFileSync(
      join(repo, '.ai/harness/policy.json'),
      JSON.stringify({ minimal_change: { mode: 'enforce' } }, null, 2),
    );
    expect(loadMinimalChangePolicy(repo).mode).toBe('off');
    expect(loadMinimalChangePolicy(repo).warnings.join('\n')).toContain('unknown minimal_change.mode=enforce');

    writeFileSync(join(repo, '.ai/harness/policy.json'), '{not-json');
    expect(loadMinimalChangePolicy(repo).mode).toBe('off');
  });
});
