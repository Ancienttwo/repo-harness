import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { classifyHistoricalPlans, hasRecordedAcceptanceReceipt } from '../scripts/classify-historical-plans';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function acceptanceContract(source: 'codex-review' | 'codex-plugin' = 'codex-plugin', waiver: 'allowed' | 'forbidden' = 'allowed'): string {
  return [
    '# Contract',
    '',
    '> **Status**: Fulfilled',
    '',
    '## Acceptance Policy',
    '',
    '```json',
    JSON.stringify({ protocol: 2, reviewer: 'Codex', source, user_waiver: waiver }),
    '```',
    '',
  ].join('\n');
}

function receiptReview(recommendation = 'pass', source = 'codex-plugin', reviewer = 'Codex', disposition = 'external_pass'): string {
  return [
    '# Review',
    '',
    `> **Recommendation**: ${recommendation}`,
    '',
    '## Acceptance Receipt Projection',
    '',
    `> **Disposition**: ${disposition}`,
    `> **Reviewer**: ${reviewer}`,
    `> **Source**: ${source}`,
    '> **Actor**: not-applicable',
    `> **Reviewed Subject SHA256**: sha256:${'a'.repeat(64)}`,
    '> **Reviewed Subject Scope**: normalized-final-content',
    `> **Reviewed Target Revision**: ${'b'.repeat(40)}`,
    `> **Verification Evidence SHA256**: sha256:${'c'.repeat(64)}`,
    '> **Issued At**: 2026-07-24T00:00:00.000Z',
    '',
    '- Summary: accepted',
    '- Findings: none',
    '',
  ].join('\n');
}

function writeFamily(root: string, stem: string, contractStatus: string, reviewText: string, source: 'codex-review' | 'codex-plugin' = 'codex-plugin'): void {
  const plan = `plans/plan-${stem}.md`;
  const contract = `tasks/contracts/${stem}.contract.md`;
  const review = `tasks/reviews/${stem}.review.md`;
  writeFileSync(join(root, plan), [
    `# Plan: ${stem}`,
    '',
    '> **Status**: Executing',
    `> **Task Contract**: \`${contract}\``,
    '',
  ].join('\n'));
  writeFileSync(join(root, contract), acceptanceContract(source).replace('> **Status**: Fulfilled', [
    `> **Status**: ${contractStatus}`,
    `> **Review File**: \`${review}\``,
  ].join('\n')));
  writeFileSync(join(root, review), reviewText);
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'historical-plan-classifier-'));
  roots.push(root);
  for (const path of ['plans', 'tasks/contracts', 'tasks/reviews', '.ai/harness']) {
    mkdirSync(join(root, path), { recursive: true });
  }
  writeFamily(root, '20260701-0000-auto', 'Fulfilled', receiptReview());
  writeFamily(root, '20260701-0001-active-contract', 'Active', receiptReview());
  writeFamily(root, '20260701-0002-no-receipt', 'Fulfilled', '# Review\n\n> **Recommendation**: pass\n');
  writeFamily(root, '20260701-0003-current', 'Fulfilled', receiptReview());
  writeFileSync(join(root, '.ai/harness/active-plan'), 'plans/plan-20260701-0003-current.md\n');
  return root;
}

describe('historical plan sealed-terminal classifier', () => {
  test('requires the exact Fulfilled + pass + typed receipt triple and excludes the active plan', () => {
    const report = classifyHistoricalPlans(fixture());
    expect(report.root_plan_count).toBe(4);
    expect(report.historical_plan_count).toBe(3);
    expect(report.counts).toEqual({ AUTO: 1, HOLD: 2, EXCLUDE: 1 });
    expect(report.rows.map((row) => [row.plan.split('/').at(-1), row.decision, row.reason])).toEqual([
      ['plan-20260701-0000-auto.md', 'AUTO', 'sealed terminal triple verified'],
      ['plan-20260701-0001-active-contract.md', 'HOLD', 'contract status is Active, not Fulfilled'],
      ['plan-20260701-0002-no-receipt.md', 'HOLD', 'typed Acceptance Receipt Projection missing or incomplete'],
      ['plan-20260701-0003-current.md', 'EXCLUDE', 'current active plan'],
    ]);
  });

  test('binds external receipt identity to the frozen host policy', () => {
    expect(hasRecordedAcceptanceReceipt(acceptanceContract('codex-plugin'), receiptReview())).toBe(true);
    expect(hasRecordedAcceptanceReceipt(acceptanceContract('codex-review'), receiptReview('pass', 'codex-review'))).toBe(true);
    expect(hasRecordedAcceptanceReceipt(acceptanceContract('codex-plugin'), receiptReview('pass', 'codex-review'))).toBe(false);
    expect(hasRecordedAcceptanceReceipt(acceptanceContract('codex-review'), receiptReview())).toBe(false);
    expect(hasRecordedAcceptanceReceipt(acceptanceContract('codex-plugin'), receiptReview('pass', 'claude-review'))).toBe(false);
  });

  test('rejects placeholder, forbidden waiver, invalid policy, and legacy receipt prose', () => {
    const contract = acceptanceContract();
    expect(hasRecordedAcceptanceReceipt(contract, receiptReview().replace(/sha256:[a-f0-9]{64}/, 'pending'))).toBe(false);
    expect(hasRecordedAcceptanceReceipt(contract, receiptReview().replace('- Summary: accepted', '- Summary: pending'))).toBe(false);
    expect(hasRecordedAcceptanceReceipt(acceptanceContract('codex-plugin', 'allowed'), receiptReview('pass', 'user-waiver', 'User', 'user_waiver'))).toBe(true);
    expect(hasRecordedAcceptanceReceipt(acceptanceContract('codex-plugin', 'forbidden'), receiptReview('pass', 'user-waiver', 'User', 'user_waiver'))).toBe(false);
    expect(hasRecordedAcceptanceReceipt('# Contract\n', receiptReview())).toBe(false);
    expect(hasRecordedAcceptanceReceipt(contract, '# Review\n\n> **Recommendation**: pass\n\n## External Acceptance Advice\n\n> **External Acceptance**: pass\n')).toBe(false);
  });
});
