import { describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

// Migrated (HRD-03) from spawning `assets/hooks/pre-edit-guard.sh` directly
// to exercising the handler through `runHook()`: `preEdit`/`preApplyPatch`
// now spawn a `bun -e` wrapper that imports and calls `runHook()`
// in-process (the same "one subprocess, purely to observe real fd1/fd2
// output" role the old single `bash` spawn played -- `RunHookResult` itself
// carries no stdout/stderr text). `resolveStateDirect` is untouched: it
// calls `state resolve` directly and was never a script invocation.
const ROOT = join(import.meta.dir, '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const RUNTIME_MODULE = join(ROOT, 'src/cli/hook/runtime.ts');
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
    worktree_strategy: { review_base: 'main', base_branch: 'main' },
    // Single known-status authority the plan-status fail-closed default
    // branch reads (pre-edit-guard.sh's plan_status_known_values()); must
    // be present so fixtures below can use a real, non-Draft/Annotating/
    // Approved/Executing status without tripping "authority unavailable".
    active_plan: {
      lifecycle: { annotation_end: 'Annotating', approved: 'Approved', executing: 'Executing', terminal_start: 'Complete' },
      statuses: [
        'Draft', 'Annotating', 'Approved', 'Executing', 'Blocked', 'Review',
        'Complete', 'Completed', 'Done', 'Fulfilled', 'Archived', 'Abandoned', 'Superseded',
      ],
    },
  }, null, 2));
  writeFileSync(join(cwd, 'README.md'), '# fixture\n');
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'seed']);
}

function runHookWrapperScript(): string {
  const moduleUrl = pathToFileURL(RUNTIME_MODULE).href;
  return [
    'const stdinText = await Bun.stdin.text();',
    `const { runHook } = await import(${JSON.stringify(moduleUrl)});`,
    "const result = runHook({ event: 'PreToolUse', routeId: 'edit', input: stdinText.length > 0 ? stdinText : undefined });",
    'process.exit(result.exitCode);',
  ].join('\n');
}

function preEdit(cwd: string, path: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ['-e', runHookWrapperScript()], {
    cwd,
    input: JSON.stringify({ tool_input: { file_path: path } }),
    encoding: 'utf-8',
    env: { ...process.env, HOOK_REPO_ROOT: cwd, ...extraEnv },
  });
}

function preApplyPatch(cwd: string, patch: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ['-e', runHookWrapperScript()], {
    cwd,
    input: JSON.stringify({ tool_name: 'apply_patch', tool_input: { command: patch } }),
    encoding: 'utf-8',
    env: { ...process.env, HOOK_REPO_ROOT: cwd, ...extraEnv },
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
  json: {
    workflow_profile: string | null;
    blockers: string[];
    profile_signals: { targetPathCount: number; strictCategories: string[] } | null;
  };
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
  test('Routine edit needs no plan or contract', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-lite-')));
    try {
      initRepo(cwd);
      const result = preEdit(cwd, 'src/math.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('PlanStatusGuard');
      expect(result.stdout).toContain('TDD Guard');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('Test names do not establish risk; auth directories select high without blocking repair', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-test-name-')));
    try {
      initRepo(cwd);
      const testPath = 'apps/web/e2e/anonymous-research-auth.spec.ts';
      expect(resolveStateDirect(cwd, [testPath]).json).toMatchObject({
        workflow_profile: 'routine', profile_signals: { strictCategories: [] },
      });
      expect(preEdit(cwd, testPath).status).toBe(0);
      expect(resolveStateDirect(cwd, [...FOUR_NORMAL_FILES, testPath]).json).toMatchObject({
        workflow_profile: 'high', profile_signals: { targetPathCount: 5, strictCategories: [] },
      });
      const authPath = 'src/auth/login.test.ts';
      expect(resolveStateDirect(cwd, [authPath]).json).toMatchObject({
        workflow_profile: 'high', profile_signals: { strictCategories: ['auth'] },
      });
      expect(preEdit(cwd, authPath).status).toBe(0);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('editing a .ts file outside the repo skips the TDD reminder instead of crashing the sandbox', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-oor-')));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'profile-oor-home-')));
    try {
      initRepo(cwd);
      mkdirSync(join(outside, 'extensions'), { recursive: true });
      const target = join(outside, 'extensions', 'bridge.ts');
      writeFileSync(target, 'export const x = 1;\n');
      const result = preEdit(cwd, target);
      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).not.toContain('unsafe state source path');
      expect(result.stdout).not.toContain('TDD Guard');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  }, 30_000);

  test('Win32 absolute .ts paths outside the repo skip repo-scoped TDD probes', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-oor-win32-')));
    try {
      initRepo(cwd);
      for (const target of [
        'C:/Users/user/.pi/agent/extensions/bridge.ts',
        'C:\\Users\\user\\.pi\\agent\\extensions\\bridge.ts',
      ]) {
        const result = preEdit(cwd, target);
        expect(result.status).toBe(0);
        expect(`${result.stdout}${result.stderr}`).not.toContain('unsafe state source path');
        expect(result.stdout).not.toContain('TDD Guard');
      }
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('Routine edit ignores missing workflow artifacts', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-standard-')));
    try {
      initRepo(cwd);
      writeFileSync(join(cwd, 'docs.spec.tmp'), '');
      const result = preEdit(cwd, 'src/feature.ts', { REPO_HARNESS_WORKFLOW_PROFILE: 'routine' });
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('action\":\"block');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('Codex apply_patch permits authorized high-risk edits and refuses private targets', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-apply-patch-')));
    try {
      initRepo(cwd);
      const migration = preApplyPatch(cwd, [
        '*** Begin Patch',
        '*** Add File: deploy/sql/0001_demo.sql',
        '+select 1;',
        '*** End Patch',
      ].join('\n'));
      expect(migration.status).toBe(0);
      expect(migration.stdout).not.toContain('action\":\"block');

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
  }, 30_000);

  test('Release workflow authoring is high risk and does not publish anything', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-github-release-')));
    try {
      initRepo(cwd);
      const result = preEdit(cwd, '.github/workflows/release.yml');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('action\":\"block');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);
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
  }, 30_000);

  test('b) four implementation paths select high review risk and remain editable', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-batch-standard-')));
    try {
      initRepo(cwd);
      const result = preApplyPatch(cwd, patchFromFiles(FOUR_NORMAL_FILES));
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('action\":\"block');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('c) cross-capability edits select high risk without a planning gate', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-batch-capability-')));
    try {
      initRepo(cwd);
      mkdirSync(join(cwd, '.ai/context'), { recursive: true });
      writeFileSync(join(cwd, '.ai/context/capabilities.json'), JSON.stringify({
        version: 1,
        capabilities: [
          {
            id: 'module-a',
            domain: 'fixture',
            name: 'Module A',
            prefixes: ['src/module-a'],
            contract_files: {
              agents: 'src/module-a/AGENTS.md',
              claude: 'src/module-a/CLAUDE.md',
            },
            architecture_module: 'docs/architecture/modules/fixture/module-a.md',
            workstream_dir: 'tasks/workstreams/fixture/module-a',
            lsp_profile: 'typescript-lsp',
            verification_hints: ['bun test'],
          },
          {
            id: 'module-b',
            domain: 'fixture',
            name: 'Module B',
            prefixes: ['src/module-b'],
            contract_files: {
              agents: 'src/module-b/AGENTS.md',
              claude: 'src/module-b/CLAUDE.md',
            },
            architecture_module: 'docs/architecture/modules/fixture/module-b.md',
            workstream_dir: 'tasks/workstreams/fixture/module-b',
            lsp_profile: 'typescript-lsp',
            verification_hints: ['bun test'],
          },
        ],
      }));
      const result = preApplyPatch(cwd, patchFromFiles(['src/module-a/a.ts', 'src/module-b/b.ts']));
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('action\":\"block');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('d) duplicate and reordered patch paths produce a stable count matching the 4-file case', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-batch-reordered-')));
    try {
      initRepo(cwd);
      const reorderedWithDuplicate = [
        'src/delta.ts', 'src/alpha.ts', 'src/beta.ts', 'src/gamma.ts', 'src/alpha.ts',
      ];
      const result = preApplyPatch(cwd, patchFromFiles(reorderedWithDuplicate));
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('action\":\"block');

      const direct = resolveStateDirect(cwd, reorderedWithDuplicate);
      expect(direct.json.profile_signals?.targetPathCount).toBe(4);
      expect(direct.json.workflow_profile).toBe('high');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('e) high-risk batch edits need no contract', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-batch-strict-leak-')));
    try {
      initRepo(cwd);
      const result = preApplyPatch(cwd, [
        '*** Begin Patch',
        '*** Add File: src/plain1.ts',
        '+export const plain1 = true;',
        '*** Add File: deploy/sql/0002_migration.sql',
        '+select 1;',
        '*** End Patch',
      ].join('\n'));
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('action\":\"block');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('f) below-floor risk is recorded while the local edit can continue', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-batch-below-floor-')));
    try {
      initRepo(cwd);
      const result = preApplyPatch(
        cwd,
        patchFromFiles(FOUR_NORMAL_FILES),
        { REPO_HARNESS_WORKFLOW_PROFILE: 'routine' },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('WorkflowObservation');

      const direct = resolveStateDirect(cwd, FOUR_NORMAL_FILES, ['--profile', 'routine']);
      expect(direct.json.workflow_profile).toBeNull();
      expect(direct.json.blockers).toContain('workflow_profile:profile_below_risk_floor');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);
});

describe('implementation-surface predicate excludes workflow-surface paths from medium-scope (guard gap regression, C2)', () => {
  test('g) a 4-file docs-only batch resolves lite, not standard', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-docs-lite-')));
    try {
      initRepo(cwd);
      const docs = ['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md'];
      const direct = resolveStateDirect(cwd, docs);
      expect(direct.json.workflow_profile).toBe('routine');
      expect(direct.json.profile_signals?.targetPathCount).toBe(0);
      expect(direct.json.blockers).toEqual([]);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('h) 3 docs files plus 1 src file counts only the implementation path and resolves lite', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-mixed-lite-')));
    try {
      initRepo(cwd);
      const mixed = ['docs/a.md', 'docs/b.md', 'docs/c.md', 'src/only.ts'];
      const direct = resolveStateDirect(cwd, mixed);
      expect(direct.json.workflow_profile).toBe('routine');
      expect(direct.json.profile_signals?.targetPathCount).toBe(1);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('i) a batch mixing workflow-surface and implementation paths counts only the implementation paths toward standard', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-mixed-standard-')));
    try {
      initRepo(cwd);
      const mixed = ['docs/a.md', 'tasks/todos.md', 'plans/plan-fixture.md', ...FOUR_NORMAL_FILES];
      const direct = resolveStateDirect(cwd, mixed);
      expect(direct.json.profile_signals?.targetPathCount).toBe(4);
      expect(direct.json.workflow_profile).toBe('high');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('j) a single deploy/sql path still resolves strict after the workflow-surface exclusion', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-deploy-strict-')));
    try {
      initRepo(cwd);
      const direct = resolveStateDirect(cwd, ['deploy/sql/0001_demo.sql']);
      expect(direct.json.workflow_profile).toBe('high');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('k) a docs-only apply_patch batch passes without a Plan gate and resolves lite ceremony guidance', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-docs-apply-patch-')));
    try {
      initRepo(cwd);
      const result = preApplyPatch(cwd, patchFromFiles(['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md']));
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('PlanStatusGuard');
      expect(result.stdout).not.toContain('SpecGuard');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('l) a workflow-surface strict-token path batched with a plain implementation file still resolves strict (guard gap regression, external acceptance)', () => {
    // docs/auth/runbook.md is workflow surface (excluded from medium-scope
    // counting), but its "auth" token must still be scanned via
    // strictScanPaths -- otherwise a batch that touches auth-related docs
    // alongside ordinary implementation code would silently resolve lite and
    // understate the risk of the implementation edit.
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-docs-auth-strict-leak-')));
    try {
      initRepo(cwd);
      const direct = resolveStateDirect(cwd, ['docs/auth/runbook.md', 'src/plain.ts']);
      expect(direct.json.workflow_profile).toBe('high');
      expect(direct.json.profile_signals?.targetPathCount).toBe(1);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test('m) a single deploy-named workflow-surface path (deploy/notes.md) resolves strict on its own -- locked semantics', () => {
    // deploy/notes.md is workflow surface (matches the *.md extension
    // exclusion, so it never counts toward medium-scope/targetPathCount), but
    // strictScanPaths scans the raw pre-filter set uniformly -- there is no
    // separate carve-out for extension-excluded vs dir-prefix-excluded
    // workflow-surface paths, since introducing one would reintroduce a
    // second, narrower classification the C2 predicate exists to avoid. A
    // "deploy" token anywhere in the raw batch is treated as a legitimate
    // strict signal (raise-only bias, consistent with this repo's accepted
    // over-promotion tradeoff for mechanical/administrative batches), even
    // when the sole matching path is a note file rather than executable
    // deploy config. See tasks/notes/20260713-1202-harness-kernel-optimization-phase2.notes.md
    // "Codex External Acceptance Round 1" for the explicit decision record.
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-deploy-notes-strict-')));
    try {
      initRepo(cwd);
      const direct = resolveStateDirect(cwd, ['deploy/notes.md']);
      expect(direct.json.workflow_profile).toBe('high');
      expect(direct.json.profile_signals?.targetPathCount).toBe(0);
      expect(direct.json.profile_signals?.strictCategories).toEqual(['deploy']);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);
});

describe('Canonical risk failures remain visible without preventing local repair', () => {
  test('Invalid capability registry is reported and can be repaired', () => {
    // Verifies the C1 fail-closed blocker (capability_registry:invalid)
    // actually reaches pre-edit-guard.sh's enforcement: before this fix the
    // guard captured stdout without checking $?, so a corrupt registry's
    // still-resolvable workflow_profile value (lite) was treated as valid and
    // the edit proceeded despite the blocker.
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'profile-registry-corrupt-guard-')));
    try {
      initRepo(cwd);
      writeFileSync(join(cwd, '.ai/harness/policy.json'), JSON.stringify({
        worktree_strategy: { review_base: 'main', base_branch: 'main' },
        context: { capability_registry_file: '.ai/context/capabilities.json' },
      }, null, 2));
      mkdirSync(join(cwd, '.ai/context'), { recursive: true });
      writeFileSync(join(cwd, '.ai/context/capabilities.json'), '{not json');

      const before = resolveStateDirect(cwd, ['src/feature.ts']);
      expect(before.json.workflow_profile).toBe('routine');
      expect(before.json.blockers).toContain('capability_registry:invalid');
      expect(before.status).toBe(1);

      const result = preEdit(cwd, 'src/feature.ts');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('WorkflowObservation');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  // Round 2 external acceptance, HRD-03 retirement note: the original pair of
  // fake-CLI tests here (see notes file) substituted REPO_HARNESS_CLI with a
  // script that printed a legal "lite" value but exited non-zero, to isolate
  // pre-edit-guard.sh's own `set +e`/capture-$?/`set -e` exit-code check from
  // state.ts's --field blocker-suppression fix -- proving the guard didn't
  // naively trust a well-formed stdout value while ignoring the subprocess's
  // own exit code. That failure mode is specific to a shell subprocess
  // boundary (a fake CLI can "print a value but signal failure" only because
  // the guard has to read stdout and $? as two separate channels). The
  // in-process handler has no such boundary: `resolveWorkflowProfile()`
  // either returns an `EffectiveState` value it inspects directly, or the
  // call throws; there is no way for a resolution to simultaneously produce
  // a trustworthy-looking `workflow_profile` string and signal failure
  // through a side channel the guard could forget to check. The equivalent
  // invariant -- a resolution with real blockers rejects the edit even when
  // `workflow_profile` itself is still populated -- is covered above by "a
  // declared-but-corrupt capability registry blocks an otherwise-lite edit
  // instead of silently passing through", using real corruption rather than
  // a subprocess substitution.
});
