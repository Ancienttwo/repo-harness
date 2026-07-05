import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { join } from 'path';
import {
  REVIEW_RUBRIC_VERSION,
  renderReviewRubric,
  runReviewRubricCli,
} from '../src/cli/hook/review-rubric';

const ROOT = join(import.meta.dir, '..');

describe('review rubric renderer', () => {
  test('renders a stable v2 deep diff review prompt', () => {
    const first = renderReviewRubric('prompt');
    const second = renderReviewRubric('prompt');

    expect(REVIEW_RUBRIC_VERSION).toBe(2);
    expect(first).toBe(second);
    expect(first).toContain('[ReviewRubric] Deep Diff Review Rubric v2');
    expect(first).toContain('branch diff against target, staged diff, unstaged diff, and untracked files');
    expect(first).toContain('review-only');
    expect(first).toContain('Do not edit files');
    expect(first.indexOf('- P0:')).toBeLessThan(first.indexOf('- P1:'));
    expect(first.indexOf('- P1:')).toBeLessThan(first.indexOf('- P2:'));
    expect(first.indexOf('- P2:')).toBeLessThan(first.indexOf('- P3:'));
    expect(first).toContain('Correctness and hidden side effects');
    expect(first).toContain('Compatibility and public contracts');
    expect(first).toContain('Security, privacy, and data safety');
    expect(first).toContain('Test coverage and regression evidence');
    expect(first).toContain('[P0|P1|P2|P3] Title');
    expect(first).toContain('file:line');
    expect(first).toContain('Smallest safe fix');
    expect(first).toContain('Regression test');
    expect(first).toContain('No findings');
    expect(first).toContain('Ignore style-only nits');
    expect(first).toContain(
      'Scope fidelity: changes outside the contract In-scope, touching declared Out-of-scope/Non-Goals, or unrequested features/options/commentary',
    );
    expect(first).toContain('never upgrade it to P0/P1 by itself.');
    expect(first).toContain(
      'Exception: a Scope fidelity violation — changes touching declared Out-of-scope/Non-Goals items or adding unrequested features, options, or commentary — may be rated up to P1.',
    );
  });

  test('CLI is fail-open for malformed arguments', () => {
    const result = runReviewRubricCli(['--format', 'json']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('repo-harness-hook review-rubric');
  });

  test('hook-entry exposes review-rubric without full commander CLI', () => {
    const res = spawnSync('bun', ['src/cli/hook-entry.ts', 'review-rubric', '--format', 'prompt'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('[ReviewRubric] Deep Diff Review Rubric v2');
    expect(res.stderr).toBe('');
  });
});
