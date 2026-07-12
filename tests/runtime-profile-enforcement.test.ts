import { describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const HOOK = join(ROOT, 'assets/hooks/pre-edit-guard.sh');

function git(cwd: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function initRepo(cwd: string): void {
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'profile@example.com']);
  git(cwd, ['config', 'user.name', 'Profile Test']);
  mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(join(cwd, '.ai/harness/policy.json'), JSON.stringify({
    hook_source: 'repo', worktree_strategy: { review_base: 'main', base_branch: 'main' },
  }, null, 2));
  writeFileSync(join(cwd, 'README.md'), '# fixture\n');
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'seed']);
}

function preEdit(cwd: string, path: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync('bash', [HOOK], {
    cwd,
    input: JSON.stringify({ tool_input: { file_path: path } }),
    encoding: 'utf-8',
    env: { ...process.env, HOOK_REPO_ROOT: cwd, REPO_HARNESS_CLI: CLI, ...extraEnv },
  });
}

function preApplyPatch(cwd: string, patch: string) {
  return spawnSync('bash', [HOOK], {
    cwd,
    input: JSON.stringify({ tool_name: 'apply_patch', tool_input: { command: patch } }),
    encoding: 'utf-8',
    env: { ...process.env, HOOK_REPO_ROOT: cwd, REPO_HARNESS_CLI: CLI },
  });
}

describe('risk-based runtime profile enforcement', () => {
  test('Lite allows brief-edit-test flow without Plan or Contract', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-lite-')));
    try {
      initRepo(cwd);
      const result = preEdit(cwd, 'src/math.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('PlanStatusGuard');
      expect(result.stdout).toContain('TDD Guard');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test('Standard requires a plan but not the Strict contract/worktree chain', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-standard-')));
    try {
      initRepo(cwd);
      writeFileSync(join(cwd, 'docs.spec.tmp'), '');
      const result = preEdit(cwd, 'src/feature.ts', { REPO_HARNESS_WORKFLOW_PROFILE: 'standard' });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/SpecGuard|PlanStatusGuard/);
      expect(result.stderr).not.toContain('StrictContractGuard');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test('Strict high-risk paths fail closed without a contract and pass in an isolated contract worktree', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'profile-strict-')));
    const base = join(root, 'base');
    const worktree = join(root, 'worktree');
    try {
      mkdirSync(base, { recursive: true });
      initRepo(base);
      git(base, ['worktree', 'add', '-b', 'codex/strict-fixture', worktree]);
      mkdirSync(join(worktree, 'docs'), { recursive: true });
      mkdirSync(join(worktree, 'plans'), { recursive: true });
      mkdirSync(join(worktree, 'tasks/contracts'), { recursive: true });
      mkdirSync(join(worktree, '.ai/harness'), { recursive: true });
      writeFileSync(join(worktree, 'docs/spec.md'), '# Spec\n');
      const plan = 'plans/plan-20260712-0000-strict.md';
      const contract = 'tasks/contracts/20260712-0000-strict.contract.md';
      writeFileSync(join(worktree, plan), [
        '# Strict', '', '> **Status**: Executing', `> **Task Contract**: ${contract}`, '',
        '## Evidence Contract', '- **State/progress path**: plan', '- **Verification evidence**: test',
        '- **Evaluator rubric**: review', '- **Stop condition**: pass', '- **Rollback surface**: revert', '',
      ].join('\n'));
      writeFileSync(join(worktree, '.ai/harness/active-plan'), `${plan}\n`);
      writeFileSync(join(worktree, '.ai/harness/active-worktree'), `${realpathSync(worktree)}\n`);

      const missing = preEdit(worktree, 'src/auth/session.ts');
      expect(missing.status).toBe(2);
      expect(missing.stderr).toContain('StrictContractGuard');

      writeFileSync(join(worktree, contract), [
        '# Contract', '', '> **Status**: Active', `> **Plan**: ${plan}`, '> **Workflow Profile**: strict', '',
        '## Allowed Paths', '```yaml', 'allowed_paths:', '  - src/auth/', '```', '',
      ].join('\n'));
      const allowed = preEdit(worktree, 'src/auth/session.ts');
      expect(allowed.status).toBe(0);
      expect(allowed.stdout).toContain('TDD Guard');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('Codex apply_patch expands every target path and blocks high-risk or private writes', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-apply-patch-')));
    try {
      initRepo(cwd);
      const migration = preApplyPatch(cwd, [
        '*** Begin Patch',
        '*** Add File: deploy/sql/0001_demo.sql',
        '+select 1;',
        '*** End Patch',
      ].join('\n'));
      expect(migration.status).toBe(2);
      expect(migration.stderr).toMatch(/SpecGuard|PlanStatusGuard|StrictContractGuard/);

      const multi = preApplyPatch(cwd, [
        '*** Begin Patch',
        '*** Add File: src/safe.ts',
        '+export const safe = true;',
        '*** Add File: _ops/secret.txt',
        '+private',
        '*** End Patch',
      ].join('\n'));
      expect(multi.status).toBe(2);
      expect(multi.stderr).toContain('OpsPrivateGuard');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test('release workflows under .github remain Strict implementation surfaces', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-github-release-')));
    try {
      initRepo(cwd);
      const result = preEdit(cwd, '.github/workflows/release.yml');
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/SpecGuard|PlanStatusGuard|StrictContractGuard/);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
