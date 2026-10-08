import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  chmodSync,
  symlinkSync,
  mkdirSync,
  readdirSync,
  utimesSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { sweepManagedWorktrees } from '../src/effects/state/coordination-worktree-topology';
import { copyHelpers, ROOT } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("contract-worktree helper integration", () => {
  test("finish has no architecture/verification/archive stage prerequisite", () => {
    const script = readFileSync(join(ROOT, "scripts/contract-worktree.sh"), "utf-8");
    expect(script).not.toContain('check_architecture_freshness "$target_branch"');
    expect(script).not.toContain('bash "$helper_dir/verify-sprint.sh"');
    expect(script).not.toContain('archive_finished_workflow "$active_plan"');
  });

  test("contract-worktree cleanup should dry-run then remove merged worktree, branch, and metadata", () => {
    const cwd = tmpWorkspace("helper-contract-cleanup");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/demo.json"), '{"slug":"demo"}\n');

      const dryRun = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "demo", "--dry-run"], cwd);
      expect(dryRun.status).toBe(0);
      expect(dryRun.stdout).toContain("dry-run cleanup");
      expect(existsSync(worktreePath)).toBe(true);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/worktrees/demo.json"))).toBe(true);

      const cleanup = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "demo"], cwd);
      expect(cleanup.status).toBe(0);
      expect(cleanup.stdout).toContain("Removed worktree");
      expect(cleanup.stdout).toContain("Deleted branch: codex/demo");
      expect(cleanup.stdout).toContain("Removed metadata");
      expect(existsSync(worktreePath)).toBe(false);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).not.toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/worktrees/demo.json"))).toBe(false);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("contract-worktree start emits one structured result and --fresh rejects residual branch state", () => {
    const cwd = tmpWorkspace("helper-contract-start-json");
    const worktreePath = `${cwd}-wt-acquire`;
    const planPath = "plans/plan-20260823-0202-acquire-fixture.md";
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, planPath), "# Acquire fixture\n");
      commitAll(cwd, "seed structured start");

      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/acquire-fixture.json"), "{}\n");
      const metadataResidual = run("bash", [
        "scripts/contract-worktree.sh", "start",
        "--plan", planPath,
        "--path", worktreePath,
        "--branch", "codex/acquire-fixture",
        "--fresh",
        "--json",
        "--no-plan-to-todo",
      ], cwd);
      expect(metadataResidual.status).toBe(1);
      expect(metadataResidual.stderr).toContain("--fresh refuses residual worktree metadata");
      rmSync(join(cwd, ".ai/harness/worktrees/acquire-fixture.json"));

      const started = run("bash", [
        "scripts/contract-worktree.sh", "start",
        "--plan", planPath,
        "--path", worktreePath,
        "--branch", "codex/acquire-fixture",
        "--fresh",
        "--json",
        "--no-plan-to-todo",
      ], cwd);
      expect(started.status, `${started.stdout}\n${started.stderr}`).toBe(0);
      const result = JSON.parse(started.stdout);
      expect(result).toEqual({
        protocol: 1,
        kind: "repo-harness-contract-worktree-start",
        worktree_path: realpathSync(worktreePath),
        branch: "codex/acquire-fixture",
        plan_path: `${realpathSync(worktreePath)}/${planPath}`,
        disposition: "created",
      });
      expect(started.stdout.trim().split("\n")).toHaveLength(1);

      const residual = run("bash", [
        "scripts/contract-worktree.sh", "start",
        "--plan", planPath,
        "--path", worktreePath,
        "--branch", "codex/acquire-fixture",
        "--fresh",
        "--json",
        "--no-plan-to-todo",
      ], cwd);
      expect(residual.status).toBe(1);
      expect(residual.stderr).toContain("--fresh refuses residual worktree path");
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("contract-worktree cleanup should repair stale gitdir before removing a merged worktree", () => {
    const cwd = tmpWorkspace("helper-contract-cleanup-repair");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init cleanup repair");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/demo.json"), '{"slug":"demo"}\n');
      writeFileSync(join(worktreePath, ".git"), "gitdir: /tmp/moved-repo/.git/worktrees/wt-demo\n");

      const dryRun = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "demo", "--dry-run"], cwd);
      expect(dryRun.status).toBe(0);
      expect(dryRun.stderr).not.toContain("fatal:");
      expect(dryRun.stdout).toContain("would repair stale worktree gitdir before dirty check");
      expect(existsSync(worktreePath)).toBe(true);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).toBe(0);

      const cleanup = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "demo"], cwd);
      expect(cleanup.status).toBe(0);
      expect(cleanup.stderr).toContain("Repaired stale worktree gitdir");
      expect(cleanup.stdout).toContain("Removed worktree");
      expect(cleanup.stdout).toContain("Deleted branch: codex/demo");
      expect(existsSync(worktreePath)).toBe(false);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).not.toBe(0);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("contract-worktree cleanup should refuse unmerged, dirty, and linked-cwd cleanup", () => {
    const cwd = tmpWorkspace("helper-contract-cleanup-refuse");
    const unmergedPath = `${cwd}-wt-unmerged`;
    const dirtyPath = `${cwd}-wt-dirty`;
    const linkedPath = `${cwd}-wt-linked`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init cleanup refuse");

      expect(run("git", ["worktree", "add", unmergedPath, "-b", "codex/unmerged"], cwd).status).toBe(0);
      writeFileSync(join(unmergedPath, "feature.txt"), "unmerged\n");
      commitAll(unmergedPath, "unmerged branch change");
      const unmerged = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "unmerged"], cwd);
      expect(unmerged.status).toBe(1);
      expect(unmerged.stderr).toContain("not fully merged");

      expect(run("git", ["worktree", "add", dirtyPath, "-b", "codex/dirty"], cwd).status).toBe(0);
      writeFileSync(join(dirtyPath, "dirty.txt"), "dirty\n");
      const dirty = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "dirty"], cwd);
      expect(dirty.status).toBe(1);
      expect(dirty.stderr).toContain("linked worktree is dirty");

      expect(run("git", ["worktree", "add", linkedPath, "-b", "codex/linked"], cwd).status).toBe(0);
      const linked = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "linked"], linkedPath);
      expect(linked.status).toBe(1);
      expect(linked.stderr).toContain("cleanup must run from the target primary worktree");
    } finally {
      for (const path of [unmergedPath, dirtyPath, linkedPath]) {
        run("git", ["worktree", "remove", "--force", path], cwd);
        rmSync(path, { recursive: true, force: true });
      }
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);
});

describe('task worktree location', () => {
  test('the policy default and helper default agree, and start uses the managed test root', () => {
    const init = readFileSync(join(ROOT, 'scripts/lib/project-init-lib.sh'), 'utf8');
    const helper = readFileSync(join(ROOT, 'scripts/contract-worktree.sh'), 'utf8');
    expect(init).toContain('"worktree_dir_template": "/tmp/{{repo}}-wt-{{slug}}"');
    expect(helper).toContain("'/tmp/{{repo}}-wt-{{slug}}'");
    const parent = tmpWorkspace('worktree-default');
    const cwd = join(parent, 'repo');
    const managed = join(parent, 'managed');
    mkdirSync(cwd); mkdirSync(managed);
    try {
      copyHelpers(cwd); initGitRepo(cwd);
      mkdirSync(join(cwd, 'plans'));
      writeFileSync(join(cwd, 'plans/plan-20261008-0000-location.md'), '# Location\n');
      commitAll(cwd, 'location fixture');
      run('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd);
      const result = run('bash', ['scripts/contract-worktree.sh', 'start', '--plan', 'plans/plan-20261008-0000-location.md', '--json', '--no-plan-to-todo'], cwd, { REPO_HARNESS_WORKTREE_ROOT: managed });
      expect(result.status).toBe(0);
      const path = join(managed, 'repo-wt-location');
      expect(JSON.parse(result.stdout).worktree_path).toBe(path);
      expect(readFileSync(join(path, '.ai/harness/active-worktree'), 'utf8').trim()).toBe(path);
      expect(sweepManagedWorktrees(cwd, cwd, { ...process.env, REPO_HARNESS_WORKTREE_ROOT: managed }, { deadlineMs: 60_000 })).toContain('marker reference');
      expect(existsSync(path)).toBe(true);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  }, 15000);

  test('start keeps a stored downstream location template', () => {
    const parent = tmpWorkspace('worktree-stored'); const cwd = join(parent, 'repo'); mkdirSync(cwd);
    try {
      copyHelpers(cwd); initGitRepo(cwd); mkdirSync(join(cwd, 'plans'));
      writeFileSync(join(cwd, 'plans/plan-20261008-0000-location.md'), '# Location\n');
      writeFileSync(join(cwd, '.ai/harness/policy.json'), JSON.stringify({ worktree_strategy: { worktree_dir_template: '../stored-{{repo}}-{{slug}}' } }));
      commitAll(cwd, 'stored location fixture');
      const result = run('bash', ['scripts/contract-worktree.sh', 'start', '--plan', 'plans/plan-20261008-0000-location.md', '--json', '--no-plan-to-todo'], cwd);
      expect(result.status).toBe(0); expect(JSON.parse(result.stdout).worktree_path).toBe(join(parent, 'stored-repo-location'));
      expect(JSON.parse(readFileSync(join(cwd, '.ai/harness/policy.json'), 'utf8')).worktree_strategy.worktree_dir_template).toBe('../stored-{{repo}}-{{slug}}');
    } finally { rmSync(parent, { recursive: true, force: true }); }
  }, 15000);

  test.each(['directory', 'file', 'symlink'])('start refuses an existing %s at the default target', kind => {
    const parent = tmpWorkspace('worktree-existing');
    const cwd = join(parent, 'repo'); const managed = join(parent, 'managed');
    mkdirSync(cwd); mkdirSync(managed);
    const target = join(managed, 'repo-wt-location');
    try {
      copyHelpers(cwd); initGitRepo(cwd); mkdirSync(join(cwd, 'plans'));
      writeFileSync(join(cwd, 'plans/plan-20261008-0000-location.md'), '# Location\n'); commitAll(cwd, 'location fixture');
      if (kind === 'directory') mkdirSync(target);
      else if (kind === 'file') writeFileSync(target, 'keep');
      else symlinkSync(join(parent, 'absent'), target);
      const result = run('bash', ['scripts/contract-worktree.sh', 'start', '--plan', 'plans/plan-20261008-0000-location.md', '--no-plan-to-todo'], cwd, { REPO_HARNESS_WORKTREE_ROOT: managed });
      expect(result.status).toBe(1); expect(result.stderr).toContain('target worktree path already exists');
      expect(lstatSync(target)).toBeDefined();
      expect(run('git', ['show-ref', '--verify', 'refs/heads/codex/location'], cwd).status).not.toBe(0);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  }, 15000);
});

describe('W2/W3/W4 start and closeout ownership', () => {
  function fixture() {
    const parent = tmpWorkspace('start-closeout'); const cwd = join(parent, 'repo'); const target = join(parent, 'linked');
    mkdirSync(cwd); copyHelpers(cwd); initGitRepo(cwd); mkdirSync(join(cwd, 'plans'));
    const plan = 'plans/plan-20261008-0000-owned.md'; writeFileSync(join(cwd, plan), '# Owned task\n');
    writeFileSync(join(cwd, '.gitignore'), '.ai/\nnode_modules\n'); commitAll(cwd, 'base');
    return { parent, cwd, target, plan, args: ['scripts/contract-worktree.sh', 'start', '--plan', plan, '--path', target, '--branch', 'codex/owned'], cleanup: () => rmSync(parent, { recursive: true, force: true }) };
  }
  test.each([false, true])('real start, task commit, merge and cleanup releases only the self marker; planning=%s', planning => {
    const f = fixture(); try {
      const started = run('bash', [...f.args, ...(planning ? [] : ['--no-plan-to-todo'])], f.cwd);
      expect(started.status, started.stderr).toBe(0);
      if (planning) {
        const selected = run('bash', ['scripts/switch-plan.sh', '--plan', f.plan], f.target);
        expect(selected.status, selected.stderr).toBe(0);
      }
      expect(readFileSync(join(f.target, '.ai/harness/active-worktree'), 'utf8').trim()).toBe(f.target);
      writeFileSync(join(f.target, 'change'), 'task change'); commitAll(f.target, 'task change');
      expect(run('git', ['merge', '--ff-only', 'codex/owned'], f.cwd).status).toBe(0);
      const result = run('bash', ['scripts/contract-worktree.sh', 'cleanup', '--slug', 'owned', '--target', 'main'], f.cwd);
      expect(result.status, result.stderr).toBe(0); expect(existsSync(f.target)).toBe(false);
      expect(run('git', ['branch', '--list', 'codex/owned'], f.cwd).stdout.trim()).toBe('');
    } finally { f.cleanup(); }
  }, 15000);
  test('retry recovers the same registered branch and marker', () => {
    const f = fixture(); try {
      expect(run('bash', [...f.args, '--no-plan-to-todo'], f.cwd).status).toBe(0);
      const retry = run('bash', [...f.args, '--no-plan-to-todo', '--json'], f.cwd);
      expect(retry.status, retry.stderr).toBe(0); expect(JSON.parse(retry.stdout).disposition).toBe('reused_existing_worktree');
      expect(readFileSync(join(f.target, '.ai/harness/active-worktree'), 'utf8').trim()).toBe(f.target);
    } finally { f.cleanup(); }
  }, 15000);
  test.each([false, true])('W6 start, recovery and closeout work under umask 002; shared=%s', shared => {
    const f = fixture(); try {
      if (shared) expect(run('git', ['config', 'core.sharedRepository', 'group'], f.cwd).status).toBe(0);
      const invoke = (args: string[]) => run('bash', ['-c', 'umask 002; exec bash "$@"', 'w6', ...args], f.cwd);
      const started = invoke([...f.args, '--no-plan-to-todo']); expect(started.status, started.stderr).toBe(0);
      expect(lstatSync(f.target).mode & 0o022).toBe(0);
      expect(lstatSync(join(f.target, '.git')).mode & 0o020).toBe(0o020);
      const retry = invoke([...f.args, '--no-plan-to-todo', '--json']); expect(retry.status, retry.stderr).toBe(0);
      expect(JSON.parse(retry.stdout).disposition).toBe('reused_existing_worktree');
      const store = join(f.cwd, '.git/repo-harness/coordination/worktree-identities');
      const record = readdirSync(store).find(name => name.endsWith('.json'))!; expect(record).toBeTruthy();
      const stale = join(store, record + '.12345678-1234-4123-8123-123456789abc');
      writeFileSync(stale, 'unpublished', { mode: 0o600 }); utimesSync(stale, new Date(0), new Date(0));
      const unknown = join(store, 'keep.txt'); writeFileSync(unknown, 'keep');
      expect(invoke([...f.args, '--no-plan-to-todo']).status).toBe(0);
      expect(existsSync(stale)).toBe(false); expect(existsSync(unknown)).toBe(true);
      writeFileSync(join(f.target, 'change'), 'task'); commitAll(f.target, 'task');
      expect(run('git', ['merge', '--ff-only', 'codex/owned'], f.cwd).status).toBe(0);
      const cleanup = invoke(['scripts/contract-worktree.sh', 'cleanup', '--slug', 'owned', '--target', 'main']);
      expect(cleanup.status, cleanup.stderr).toBe(0); expect(existsSync(f.target)).toBe(false);
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toEqual([]);
    } finally { f.cleanup(); }
  }, 20000);

  test('W6 an old registered checkout without a start identity has an action message', () => {
    const f = fixture(); try {
      expect(run('git', ['worktree', 'add', '-b', 'codex/owned', f.target], f.cwd).status).toBe(0);
      const retry = run('bash', [...f.args, '--no-plan-to-todo'], f.cwd);
      expect(retry.status).toBe(1); expect(retry.stderr).toContain('no start identity record:');
      expect(retry.stderr).toContain('start with a new slug'); expect(retry.stderr).not.toContain('ENOENT');
      expect(existsSync(f.target)).toBe(true);
    } finally { f.cleanup(); }
  });

  test('W6 no-uid runtime creation succeeds and recovery refuses clearly', () => {
    const f = fixture(); try {
      const runtime = join(ROOT, 'scripts/contract-worktree-runtime.ts');
      const worker = join(f.parent, 'no-uid.ts');
      writeFileSync(worker, `process.getuid=undefined;process.argv=[process.execPath,${JSON.stringify(runtime)},...process.argv.slice(2)];await import(${JSON.stringify(runtime)});`);
      const added = run(process.execPath, [worker, 'add-worktree', '--repo', f.cwd, '--worktree', f.target, '--branch', 'codex/owned', '--base', 'HEAD', '--new-branch'], f.cwd);
      expect(added.status, added.stderr).toBe(0); expect(existsSync(join(f.target, '.git'))).toBe(true);
      expect(existsSync(join(f.target, '.ai/harness/active-worktree'))).toBe(true);
      expect(existsSync(join(f.cwd, '.git/repo-harness/coordination/worktree-identities'))).toBe(false);
      const retry = run(process.execPath, [worker, 'check-start-path', '--repo', f.cwd, '--worktree', f.target, '--branch', 'codex/owned'], f.cwd);
      expect(retry.status).toBe(1); expect(retry.stderr).toContain('recovery uid is unavailable:');
    } finally { f.cleanup(); }
  });

  test('W6 identity write failure names the retained checkout and a cleanup command', () => {
    const f = fixture(); try {
      const binary = join(f.parent, 'git-block-identity');
      writeFileSync(binary, '#!/bin/sh\n/usr/bin/git "$@"\nstatus=$?\nif [ "$1" = worktree ] && [ "$2" = add ] && [ "$status" = 0 ]; then mkdir -p "$W6_STORE_PARENT"; printf blocked > "$W6_STORE_PARENT/worktree-identities"; fi\nexit "$status"\n', { mode: 0o755 });
      const started = run('bash', [...f.args, '--no-plan-to-todo'], f.cwd, { REPO_HARNESS_GIT_BIN: binary, W6_STORE_PARENT: join(f.cwd, '.git/repo-harness/coordination') });
      expect(started.status).toBe(1); expect(started.stderr).toContain('Git created checkout ' + f.target);
      expect(started.stderr).toContain('cleanup --slug owned --target <integration-branch>');
      expect(existsSync(join(f.target, '.git'))).toBe(true);
    } finally { f.cleanup(); }
  });

  test('W5 start and recovery accept the system tmp canonical alias', () => {
    const f = fixture(); try {
      const alias = f.target.replace(/^\/private\/tmp\//, '/tmp/');
      const args = f.args.map(value => value === f.target ? alias : value);
      expect(run('bash', [...args, '--no-plan-to-todo'], f.cwd).status).toBe(0);
      const retry = run('bash', [...args, '--no-plan-to-todo', '--json'], f.cwd);
      expect(retry.status, retry.stderr).toBe(0);
      expect(JSON.parse(retry.stdout).disposition).toBe('reused_existing_worktree');
      expect(readFileSync(join(f.target, '.ai/harness/active-worktree'), 'utf8').trim()).toBe(f.target);
    } finally { f.cleanup(); }
  }, 15000);
  test.each(['replacement', 'deleted-replacement', 'writable', 'git-symlink'])('W5 recovery refuses %s', change => {
    const f = fixture(); try {
      expect(run('bash', [...f.args, '--no-plan-to-todo'], f.cwd).status).toBe(0);
      const pointer = readFileSync(join(f.target, '.git'), 'utf8');
      if (change === 'replacement' || change === 'deleted-replacement') {
        // Rename keeps the old inode allocated, as a cleaner or another process can.
        const old = join(f.parent, 'old-checkout');
        if (change === 'replacement') require('fs').renameSync(f.target, old);
        else rmSync(f.target, { recursive: true });
        mkdirSync(f.target, { mode: 0o700 });
        writeFileSync(join(f.target, '.git'), pointer); writeFileSync(join(f.target, 'planted'), 'unsafe');
      } else if (change === 'writable') chmodSync(f.target, 0o777);
      else {
        const copy = join(f.parent, 'copied-pointer'); writeFileSync(copy, pointer);
        rmSync(join(f.target, '.git')); symlinkSync(copy, join(f.target, '.git'));
      }
      const retry = run('bash', [...f.args, '--no-plan-to-todo'], f.cwd);
      expect(retry.status).toBe(1); expect(existsSync(f.target)).toBe(true);
      if (change === 'replacement' || change === 'deleted-replacement') expect(readFileSync(join(f.target, 'planted'), 'utf8')).toBe('unsafe');
    } finally { f.cleanup(); }
  }, 15000);
  test('an existing target on another branch is refused', () => {
    const f = fixture(); try {
      expect(run('git', ['worktree', 'add', '-b', 'other', f.target], f.cwd).status).toBe(0);
      const result = run('bash', [...f.args, '--no-plan-to-todo'], f.cwd);
      expect(result.status).toBe(1); expect(existsSync(f.target)).toBe(true);
      expect(run('git', ['branch', '--show-current'], f.target).stdout.trim()).toBe('other');
    } finally { f.cleanup(); }
  });
  test('a failed Git add rolls back only its empty exclusive claim', () => {
    const f = fixture(); try {
      const binary = join(f.parent, 'git-fail-add');
      writeFileSync(binary, '#!/bin/sh\nif [ "$1" = worktree ] && [ "$2" = add ]; then exit 42; fi\nexec /usr/bin/git "$@"\n', { mode: 0o755 });
      const failed = run('bash', [...f.args, '--no-plan-to-todo'], f.cwd, { REPO_HARNESS_GIT_BIN: binary });
      expect(failed.status).toBe(1); expect(existsSync(f.target)).toBe(false);
      expect(run('bash', [...f.args, '--no-plan-to-todo'], f.cwd).status).toBe(0);
    } finally { f.cleanup(); }
  }, 15000);
});
