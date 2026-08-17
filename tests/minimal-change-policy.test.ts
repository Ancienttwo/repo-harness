import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  DEFAULT_MINIMAL_CHANGE_POLICY,
  loadMinimalChangePolicy,
  normalizeMinimalChangePolicy,
} from '../src/cli/hook/minimal-change-policy';

describe('minimal-change policy', () => {
  test('defaults to off and non-blocking', () => {
    const policy = normalizeMinimalChangePolicy(undefined);
    expect(policy.mode).toBe('off');
    expect(policy.blocking).toBe(false);
    expect(policy.session_context).toBe(false);
    expect(policy.prompt_advice).toBe(false);
    expect(policy.post_edit_observer).toBe(false);
    expect(policy.stop_review).toBe(false);
    expect(policy.report_path).toBe('.ai/harness/checks/minimal-change.latest.json');
  });

  test('explicit advice enables advisory context while post-edit remains opt-in', () => {
    const policy = normalizeMinimalChangePolicy({ mode: 'advice' });
    expect(policy.mode).toBe('advice');
    expect(policy.blocking).toBe(false);
    expect(policy.session_context).toBe(true);
    expect(policy.prompt_advice).toBe(true);
    expect(policy.post_edit_observer).toBe(false);
    expect(policy.stop_review).toBe(true);
  });

  test('post_edit_observer is an explicit per-repo opt-in, never inferred from mode', () => {
    // The advice-mode fallback for this one field is false (unlike
    // session_context/prompt_advice/stop_review), so the post-edit signal
    // chain only runs when a repo writes the boolean itself.
    expect(normalizeMinimalChangePolicy({ mode: 'advice', post_edit_observer: true }).post_edit_observer).toBe(true);
    expect(normalizeMinimalChangePolicy({ mode: 'advice', post_edit_observer: false }).post_edit_observer).toBe(false);
    expect(normalizeMinimalChangePolicy({ mode: 'advice' }).post_edit_observer).toBe(false);

    // A non-boolean value is not a truthy opt-in either; it falls back.
    expect(normalizeMinimalChangePolicy({ mode: 'advice', post_edit_observer: 'true' }).post_edit_observer).toBe(false);

    // off mode keeps the same fallback, and an explicit true here is still
    // carried through the policy object -- mutation-observed.ts is what
    // combines it with `mode !== 'off'`.
    expect(normalizeMinimalChangePolicy({ mode: 'off' }).post_edit_observer).toBe(false);
    expect(normalizeMinimalChangePolicy({ mode: 'off', post_edit_observer: true }).post_edit_observer).toBe(true);
  });

  test('supports explicit off mode', () => {
    const policy = normalizeMinimalChangePolicy({ mode: 'off', session_context: false });
    expect(policy.mode).toBe('off');
    expect(policy.session_context).toBe(false);
  });

  test('enforce is accepted and is the only blocking mode', () => {
    const policy = normalizeMinimalChangePolicy({ mode: 'enforce' });
    expect(policy.mode).toBe('enforce');
    expect(policy.requestedMode).toBe('enforce');
    expect(policy.blocking).toBe(true);
    expect(policy.warnings).toEqual([]);
    // enforce inherits the advice-mode field fallbacks; post_edit_observer
    // stays the explicit per-repo opt-in it is in advice mode.
    expect(policy.session_context).toBe(true);
    expect(policy.prompt_advice).toBe(true);
    expect(policy.stop_review).toBe(true);
    expect(policy.post_edit_observer).toBe(false);

    expect(normalizeMinimalChangePolicy({ mode: 'advice' }).blocking).toBe(false);
    expect(normalizeMinimalChangePolicy({ mode: 'off' }).blocking).toBe(false);
  });

  test('unknown modes still fail closed to off without blocking', () => {
    const policy = normalizeMinimalChangePolicy({ mode: 'ENFORCE' });
    expect(policy.mode).toBe('off');
    expect(policy.requestedMode).toBe('off');
    expect(policy.blocking).toBe(false);
    expect(policy.warnings.join('\n')).toContain('unknown minimal_change.mode=ENFORCE');
  });

  test('bounds numeric fields and keeps report path under .ai/harness', () => {
    const policy = normalizeMinimalChangePolicy({
      max_findings: 100,
      max_context_words: 10,
      report_path: '../outside.json',
    });
    expect(policy.max_findings).toBe(20);
    expect(policy.max_context_words).toBe(60);
    expect(policy.report_path).toBe(DEFAULT_MINIMAL_CHANGE_POLICY.report_path);
    expect(policy.warnings.join('\n')).toContain('report_path');
  });

  test('loads repo policy and disables on missing or malformed policy', () => {
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
    expect(loadMinimalChangePolicy(repo).mode).toBe('enforce');
    expect(loadMinimalChangePolicy(repo).blocking).toBe(true);

    writeFileSync(join(repo, '.ai/harness/policy.json'), '{not-json');
    expect(loadMinimalChangePolicy(repo).mode).toBe('off');
  });
});
