import { expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runCampaignPlanningPreflight } from '../../src/cli/commands/campaign';
import { runHelper } from '../../src/effects/runtime/helper-runner';

const evidence = '## Evidence Requirements\n```yaml\nevidence_requirements:\n  benchmark: not_applicable\n```';
function fixture(metadata = evidence, invalidPlan = false) {
  const repo = mkdtempSync(join(tmpdir(), 'campaign-acceptance-preflight-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  const text = [
    '# Contract', '> **Status**: Active', '> **Task Profile**: code-change', '> **Review File**: task.review.md',
    '## Goal', 'Reject incomplete verification metadata before dispatch.',
    '## Why', 'Dispatch must not spend a worker on metadata canonical acceptance rejects.',
    '## Scope', '- In scope: src validation.', '- Out of scope: unrelated files.',
    '## Allowed Paths', '```yaml', 'allowed_paths:', '  - src/', '```',
    metadata,
    '## Exit Criteria', '```yaml', 'exit_criteria:', '  files_exist:', '    - future-output.txt', '```',
    '## Verification Plan', '```json', invalidPlan ? '{"protocol":1,"checks":"invalid"}' : JSON.stringify({ protocol: 1, checks: [{
      id: 'sentinel', kind: 'command', command: 'touch command-ran', cwd: '.', phase: 'verification', cost: 'normal',
      evidence_policy: 'current_exact', necessity: 'Prove preflight never runs contract commands.', inputs: { env: [] },
    }] }), '```', '',
  ].join('\n\n');
  writeFileSync(join(repo, 'task.contract.md'), text);
  writeFileSync(join(repo, 'task.review.md'), '# Authored review\n');
  return { repo, text, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
function helper(repo: string, args: string[] = []) {
  return runHelper({ helper: 'verify-contract', args: ['--contract', 'task.contract.md', '--preflight', ...args], cwd: repo, trustedPackage: true, stdio: 'pipe' });
}

test('canonical metadata preflight accepts future outputs without execution, status mutation or acceptance evidence', () => {
  const f = fixture();
  try {
    const result = helper(f.repo);
    expect(result.exitCode, (result.stdout ?? "") + (result.stderr ?? "")).toBe(0);
    expect(result.stdout).toContain('[ContractPreflight]');
    expect(runCampaignPlanningPreflight(f.repo, 'task.contract.md').ok).toBe(true);
    expect(existsSync(join(f.repo, 'future-output.txt'))).toBe(false);
    expect(existsSync(join(f.repo, 'command-ran'))).toBe(false);
    expect(existsSync(join(f.repo, '.ai/harness/checks/latest.json'))).toBe(false);
    expect(readFileSync(join(f.repo, 'task.contract.md'), 'utf8')).toBe(f.text);
  } finally { f.cleanup(); }
});

for (const [name, metadata] of [
  ['missing', ''], ['malformed', evidence.replace('not_applicable', 'optional')],
  ['duplicate', evidence.replace('  benchmark: not_applicable', '  benchmark: not_applicable\n  benchmark: not_applicable')],
]) test(`campaign admission does not require retired ${name} benchmark declaration`, () => {
  const f = fixture(metadata);
  try {
    expect(runCampaignPlanningPreflight(f.repo, 'task.contract.md').ok).toBe(true);
    expect(existsSync(join(f.repo, 'command-ran'))).toBe(false);
    expect(readFileSync(join(f.repo, 'task.contract.md'), 'utf8')).toBe(f.text);
  } finally { f.cleanup(); }
});

test('campaign admission rejects malformed Verification Plan before dispatch', () => {
  const f = fixture(evidence, true);
  try {
    expect(() => runCampaignPlanningPreflight(f.repo, 'task.contract.md')).toThrow(/Verification Plan|verification_plan|checks/);
    expect(existsSync(join(f.repo, 'command-ran'))).toBe(false);
  } finally { f.cleanup(); }
});

for (const args of [['--report-file', 'acceptance.json'], ['--force-expensive-rerun', '--reason', 'invalid preflight']])
  test(`metadata preflight rejects acceptance options ${args[0]}`, () => {
    const f = fixture();
    try {
      const result = helper(f.repo, args);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('unsupported argument');
      expect(existsSync(join(f.repo, 'acceptance.json'))).toBe(false);
      expect(existsSync(join(f.repo, 'command-ran'))).toBe(false);
    } finally { f.cleanup(); }
  });

for (const missing of ['file', 'declaration']) test(`campaign admission rejects a missing review ${missing}`, () => {
  const f = fixture();
  try {
    if (missing === 'file') rmSync(join(f.repo, 'task.review.md'));
    else writeFileSync(join(f.repo, 'task.contract.md'), f.text.replace('> **Review File**: task.review.md', ''));
    expect(() => runCampaignPlanningPreflight(f.repo, 'task.contract.md')).toThrow(/Review File input is missing|ENOENT|input must be a regular file/);
    expect(existsSync(join(f.repo, 'command-ran'))).toBe(false);
  } finally { f.cleanup(); }
});

test('metadata preflight rejects a symlinked review artifact outside the repository', () => {
  const f = fixture(), other = fixture();
  try {
    rmSync(join(f.repo, 'task.review.md'));
    symlinkSync(join(other.repo, 'task.review.md'), join(f.repo, 'task.review.md'));
    expect(() => runCampaignPlanningPreflight(f.repo, 'task.contract.md')).toThrow(/Review File input is missing|ENOENT|input must be a regular file/);
    expect(existsSync(join(f.repo, 'command-ran'))).toBe(false);
  } finally { f.cleanup(); other.cleanup(); }
});
