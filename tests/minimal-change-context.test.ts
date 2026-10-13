import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadMinimalChangePolicy, normalizeMinimalChangePolicy } from '../src/cli/hook/minimal-change-policy';
import {
  minimalChangeContextWordCount,
  renderMinimalChangePromptAdvice,
  renderMinimalChangeSessionContext,
} from '../src/cli/hook/minimal-change-context';

describe('minimal-change context', () => {
  test('renders stable session context within policy budget', () => {
    const policy = normalizeMinimalChangePolicy({ mode: 'advice', max_context_words: 180 });
    const context = renderMinimalChangeSessionContext(policy);
    expect(context).toContain('Minimal-change policy');
    expect(context).toContain('Reason from first principles');
    expect(context).toContain('Preserve explicit requirements');
    expect(context).toContain('security, validation, data safety');
    expect(context).toContain('No compatibility fallbacks');
    expect(context).toContain('one source of truth per datum');
    expect(context).toContain('at least two real consumers');
    expect(minimalChangeContextWordCount(context)).toBeLessThanOrEqual(180);
  });

  test('off mode disables context and prompt advice', () => {
    const policy = normalizeMinimalChangePolicy({ mode: 'off' });
    expect(renderMinimalChangeSessionContext(policy)).toBe('');
    expect(renderMinimalChangePromptAdvice(policy, 'general_execution')).toBe('');
  });

  test('prompt advice is scoped to execution intents', () => {
    const policy = normalizeMinimalChangePolicy({ mode: 'advice' });
    expect(renderMinimalChangePromptAdvice(policy, 'general_execution')).toContain(
      'Minimal-change execution advice',
    );
    expect(renderMinimalChangePromptAdvice(policy, 'planning_discussion')).toBe('');
  });

  test('session text respects repo policy', () => {
    const repo = mkdtempSync(join(tmpdir(), 'minimal-change-context-'));
    mkdirSync(join(repo, '.ai/harness'), { recursive: true });

    expect(renderMinimalChangeSessionContext(loadMinimalChangePolicy(repo))).toBe('');

    writeFileSync(
      join(repo, '.ai/harness/policy.json'),
      JSON.stringify({ minimal_change: { mode: 'advice' } }, null, 2),
    );
    expect(renderMinimalChangeSessionContext(loadMinimalChangePolicy(repo))).toContain('Minimal-change policy');

    writeFileSync(
      join(repo, '.ai/harness/policy.json'),
      JSON.stringify({ minimal_change: { mode: 'off' } }, null, 2),
    );
    expect(renderMinimalChangeSessionContext(loadMinimalChangePolicy(repo))).toBe('');
  });
});
