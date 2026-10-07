import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  symlinkSync,
  mkdirSync,
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
      expect(sweepManagedWorktrees(cwd, cwd, { ...process.env, REPO_HARNESS_WORKTREE_ROOT: managed })).toContain('marker reference');
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
