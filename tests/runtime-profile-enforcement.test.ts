import { describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const HOOK = join(ROOT, 'assets/hooks/pre-edit-guard.sh');
const FOUR_NORMAL_FILES = ['src/alpha.ts', 'src/beta.ts', 'src/gamma.ts', 'src/delta.ts'];

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

function preApplyPatch(cwd: string, patch: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync('bash', [HOOK], {
    cwd,
    input: JSON.stringify({ tool_name: 'apply_patch', tool_input: { command: patch } }),
    encoding: 'utf-8',
    env: { ...process.env, HOOK_REPO_ROOT: cwd, REPO_HARNESS_CLI: CLI, ...extraEnv },
  });
}

function patchFromFiles(files: readonly string[]): string {
  return [
    '*** Begin Patch',
    ...files.flatMap((file, index) => [`*** Add File: ${file}`, `+export const marker${index} = true;`]),
    '*** End Patch',
  ].join('\n');
}

function resolveStateDirect(cwd: string, targetPaths: readonly string[], extraArgs: readonly string[] = []): {
  status: number | null;
  json: { workflow_profile: string | null; blockers: string[]; profile_signals: { targetPathCount: number } | null };
} {
  const result = spawnSync(process.execPath, [
    CLI, 'state', 'resolve', '--json',
    ...targetPaths.flatMap((path) => ['--target-path', path]),
    '--operation', 'edit',
    ...extraArgs,
  ], { cwd, encoding: 'utf-8' });
  return { status: result.status, json: JSON.parse(result.stdout) };
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

      // _ops/secret.txt is listed first: OpsPrivateGuard is a pure path match
      // evaluated before workflow-profile resolution, so checking it first keeps
      // this assertion independent of the batch-scope strict-token leak that A1
      // deliberately introduces (a "secret" sibling now promotes src/safe.ts to
      // strict too, which would otherwise trip SpecGuard first depending on order).
      const multi = preApplyPatch(cwd, [
        '*** Begin Patch',
        '*** Add File: _ops/secret.txt',
        '+private',
        '*** Add File: src/safe.ts',
        '+export const safe = true;',
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

describe('apply_patch batch-scope resolves the full pending write scope (guard gap regression)', () => {
  test('a) a single apply_patch touching 3 normal implementation files resolves lite and passes without a Plan gate', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-batch-lite-')));
    try {
      initRepo(cwd);
      const result = preApplyPatch(cwd, patchFromFiles(['src/alpha.ts', 'src/beta.ts', 'src/gamma.ts']));
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('PlanStatusGuard');
      expect(result.stdout).not.toContain('SpecGuard');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test('b) a single apply_patch touching 4 normal implementation files resolves standard and trips the plan gate by default', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-batch-standard-')));
    try {
      initRepo(cwd);
      const result = preApplyPatch(cwd, patchFromFiles(FOUR_NORMAL_FILES));
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/SpecGuard|PlanStatusGuard/);
      expect(result.stderr).not.toContain('StrictContractGuard');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test('c) a patch spanning two capability prefixes resolves standard via the cross-capability signal', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-batch-capability-')));
    try {
      initRepo(cwd);
      mkdirSync(join(cwd, '.ai/context'), { recursive: true });
      writeFileSync(join(cwd, '.ai/context/capabilities.json'), JSON.stringify({
        version: 1,
        capabilities: [
          { id: 'module-a', prefixes: ['src/module-a'] },
          { id: 'module-b', prefixes: ['src/module-b'] },
        ],
      }));
      const result = preApplyPatch(cwd, patchFromFiles(['src/module-a/a.ts', 'src/module-b/b.ts']));
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/SpecGuard|PlanStatusGuard/);
      expect(result.stderr).not.toContain('StrictContractGuard');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test('d) duplicate and reordered patch paths produce a stable count matching the 4-file case', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-batch-reordered-')));
    try {
      initRepo(cwd);
      const reorderedWithDuplicate = [
        'src/delta.ts', 'src/alpha.ts', 'src/beta.ts', 'src/gamma.ts', 'src/alpha.ts',
      ];
      const result = preApplyPatch(cwd, patchFromFiles(reorderedWithDuplicate));
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/SpecGuard|PlanStatusGuard/);
      expect(result.stderr).not.toContain('StrictContractGuard');

      const direct = resolveStateDirect(cwd, reorderedWithDuplicate);
      expect(direct.json.profile_signals?.targetPathCount).toBe(4);
      expect(direct.json.workflow_profile).toBe('standard');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test('e) a batch containing one strict-category path promotes every implementation path in the batch to strict', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-batch-strict-leak-')));
    try {
      initRepo(cwd);
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      mkdirSync(join(cwd, 'plans'), { recursive: true });
      writeFileSync(join(cwd, 'docs/spec.md'), '# Spec\n');
      const plan = 'plans/plan-20260713-1300-batch-strict.md';
      writeFileSync(join(cwd, plan), [
        '# Batch Strict', '', '> **Status**: Executing', '',
        '## Evidence Contract', '- **State/progress path**: plan', '- **Verification evidence**: test',
        '- **Evaluator rubric**: review', '- **Stop condition**: pass', '- **Rollback surface**: revert', '',
      ].join('\n'));
      writeFileSync(join(cwd, '.ai/harness/active-plan'), `${plan}\n`);
      writeFileSync(join(cwd, '.ai/harness/active-worktree'), `${cwd}\n`);

      // The plain implementation file is listed BEFORE the strict-category path so the
      // recursive check on it runs first; it must fail closed on batch-wide scope alone.
      const result = preApplyPatch(cwd, [
        '*** Begin Patch',
        '*** Add File: src/plain1.ts',
        '+export const plain1 = true;',
        '*** Add File: deploy/sql/0002_migration.sql',
        '+select 1;',
        '*** End Patch',
      ].join('\n'));
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('StrictContractGuard');
      expect(result.stderr).toContain('Strict workflow edit to src/plain1.ts has no active contract.');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test('f) a 4-file batch requesting an explicit lite override is rejected below the deterministic risk floor', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-batch-below-floor-')));
    try {
      initRepo(cwd);
      const result = preApplyPatch(
        cwd,
        patchFromFiles(FOUR_NORMAL_FILES),
        { REPO_HARNESS_WORKFLOW_PROFILE: 'lite' },
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('WorkflowProfileGuard');

      const direct = resolveStateDirect(cwd, FOUR_NORMAL_FILES, ['--profile', 'lite']);
      expect(direct.json.workflow_profile).toBeNull();
      expect(direct.json.blockers).toContain('workflow_profile:profile_below_risk_floor');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
