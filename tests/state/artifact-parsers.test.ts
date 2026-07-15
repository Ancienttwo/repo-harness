import { describe, expect, test } from 'bun:test';
import {
  artifactStemFromPlan,
  evidenceContractComplete,
  firstOpenTask,
  markdownBullet,
  markdownHeader,
  markdownSection,
  markdownSectionHeader,
  parseAllowedPaths,
  parseIsoOrLocalTimestamp,
  planContractRelationshipConflicts,
  planSlugFromPath,
  planStatusFromText,
  stripWrappingQuotes,
} from '../../src/core/state/artifact-parsers';

describe('Effective State artifact parsers', () => {
  const contract = [
    '# Contract',
    '> **Status**: Active',
    '> **Plan**: plans/plan-fixture.md',
    '',
    '## Allowed Paths',
    '',
    '```yaml',
    'allowed_paths:',
    '  - src/',
    '  - tests/state/',
    '```',
    '',
    '## Task Breakdown',
    '- [x] finished',
    '- [ ] next slice',
  ].join('\n');

  test('reads headers, bullets, section headers, and the first open task', () => {
    expect(markdownHeader(contract, 'Status')).toBe('Active');
    expect(markdownSection(contract, 'Task Breakdown')).toContain('- [ ] next slice');
    expect(markdownSectionHeader('## Metadata\n> **Status**: Active\n', 'Metadata', 'Status')).toBe('Active');
    expect(firstOpenTask(contract)).toBe('next slice');
    expect(markdownBullet('- Exact Next Step: run checks\n', 'Exact Next Step')).toBe('run checks');
  });

  test('parses only explicit allowed paths and strips wrapping quotes', () => {
    expect(parseAllowedPaths(contract)).toEqual(['src/', 'tests/state/']);
    expect(stripWrappingQuotes('"plans/plan-fixture.md"')).toBe('plans/plan-fixture.md');
  });

  test('parses valid timestamps and rejects missing or invalid values', () => {
    expect(parseIsoOrLocalTimestamp('2026-07-15T12:00:00Z')).toBe(Date.parse('2026-07-15T12:00:00Z'));
    expect(parseIsoOrLocalTimestamp('not-a-date')).toBeNull();
    expect(parseIsoOrLocalTimestamp(null)).toBeNull();
  });

  test('preserves plan status and artifact-stem derivation semantics', () => {
    expect(planStatusFromText('prefix **Status**: Draft\n')).toBe('draft');
    expect(planStatusFromText('> **Status**: Annotating\n')).toBe('annotating');
    expect(planStatusFromText('> **Status**: Approved\n')).toBe('approved');
    expect(planStatusFromText('> **Status**: Executing\n')).toBe('executing');
    expect(planStatusFromText('> **Status**: Complete\n')).toBe('unknown');
    expect(planStatusFromText(null)).toBe('unknown');

    const normal = 'plans/plan-20260715-1200-effective-state.md';
    expect(planSlugFromPath(normal)).toBe('effective-state');
    expect(artifactStemFromPlan(normal, '# Plan: Effective State')).toBe('20260715-1200-effective-state');
    expect(artifactStemFromPlan(
      'plans/plan-20260715-1200-think-plan-123.md',
      '# Plan: Canonical State Cutover',
    )).toBe('20260715-1200-canonical-state-cutover');
  });

  test('projects evidence completeness and plan-contract relationship conflicts', () => {
    const planPath = 'plans/plan-20260715-1200-fixture.md';
    const contractPath = 'tasks/contracts/20260715-1200-fixture.contract.md';
    const evidence = [
      '## Evidence Contract',
      '- **State/progress path**: plan',
      '- **Verification evidence**: tests',
      '- **Evaluator rubric**: review',
      '- **Stop condition**: pass',
      '- **Rollback surface**: revert',
    ].join('\n');
    expect(evidenceContractComplete(evidence)).toBe(true);
    expect(evidenceContractComplete(evidence.replace('tests', 'todo'))).toBe(false);
    expect(planContractRelationshipConflicts(
      planPath,
      contractPath,
      `> **Task Contract**: ${contractPath}`,
      `> **Plan**: ${planPath}`,
    )).toEqual([]);
    expect(planContractRelationshipConflicts(
      planPath,
      contractPath,
      '> **Task Contract**: tasks/contracts/other.contract.md',
      '> **Plan**: plans/plan-other.md',
    )).toEqual(['contract_plan_relationship', 'plan_contract_relationship']);
  });
});
