import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
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
import { tmpdir } from "os";
import { DEFAULT_WORKTREE_TEMPLATE, defaultWorktreeTemplate } from "../src/core/worktree-location.mjs";

import { runUpgrade } from '../src/cli/commands/upgrade';
import { sweepManagedWorktrees } from '../src/effects/state/coordination-worktree-topology';
import { copyHelpers, ROOT } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

interface IssueStub {
  number: number;
  title: string;
  state: string;
  url: string;
}

const ISSUE: IssueStub = {
  number: 123,
  title: "Location",
  state: "OPEN",
  url: "https://github.com/example/repo/issues/123",
};

const GH_DIR = tmpWorkspace("contract-worktree-gh");
const NO_GH_DIR = join(GH_DIR, "no-gh");
mkdirSync(NO_GH_DIR);
symlinkSync("/usr/bin/dirname", join(NO_GH_DIR, "dirname"));
afterAll(() => rmSync(GH_DIR, { recursive: true, force: true }));
writeFileSync(
  join(GH_DIR, "gh"),
  [
    "#!/bin/sh",
    'if [ -n "${GH_STUB_ERROR:-}" ]; then printf "%s\\n" "$GH_STUB_ERROR" >&2; exit 1; fi',
    'printf "%s\\n" "$GH_STUB_JSON"',
    "",
  ].join("\n"),
  { mode: 0o755 },
);

function issueEnv(
  env: NodeJS.ProcessEnv = {},
  issue: Partial<IssueStub> = {},
): NodeJS.ProcessEnv {
  return {
    PATH: `${GH_DIR}:${process.env.PATH ?? ""}`,
    GH_STUB_JSON: JSON.stringify({ ...ISSUE, ...issue }),
    ...env,
  };
}

function start(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
  issue: Partial<IssueStub> = {},
) {
  return run("bash", ["scripts/contract-worktree.sh", "start", ...args], cwd, issueEnv(env, issue));
}

function writeStartMetadata(cwd: string, slug: string, branch: string): void {
  mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
  writeFileSync(join(cwd, ".ai/harness/worktrees", `${slug}.json`), `${JSON.stringify({ slug, branch })}\n`);
}

describe("contract-worktree helper integration", () => {

  test("contract-worktree cleanup should dry-run then remove merged worktree, branch, and metadata", () => {
    const cwd = tmpWorkspace("helper-contract-cleanup");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      writeStartMetadata(cwd, "demo", "codex/demo");

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

  test("contract-worktree start reads an open issue and emits one protocol 2 result", () => {
    const cwd = tmpWorkspace("helper-contract-start-json");
    const worktreePath = `${cwd}-wt-acquire`;
    const issue = { title: "Acquire fixture one two three four ignored" };
    const slug = "123-acquire-fixture-one-two-three";
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      commitAll(cwd, "seed structured start");

      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      const metadataPath = join(cwd, ".ai/harness/worktrees", `${slug}.json`);
      writeFileSync(metadataPath, "{}\n");
      const metadataResidual = start([
        "--issue", "123",
        "--path", worktreePath,
        "--fresh",
        "--json",
      ], cwd, {}, issue);
      expect(metadataResidual.status).toBe(1);
      expect(metadataResidual.stderr).toContain("--fresh refuses residual worktree metadata");
      rmSync(metadataPath);

      const started = start([
        "--issue", "123",
        "--path", worktreePath,
        "--fresh",
        "--json",
      ], cwd, {}, issue);
      expect(started.status, `${started.stdout}\n${started.stderr}`).toBe(0);
      const result = JSON.parse(started.stdout);
      expect(result).toEqual({
        protocol: 2,
        kind: "repo-harness-contract-worktree-start",
        worktree_path: realpathSync(worktreePath),
        branch: `feat/${slug}`,
        issue: 123,
        issue_url: ISSUE.url,
        disposition: "created",
      });
      expect(started.stdout.trim().split("\n")).toHaveLength(1);
      const metadata = JSON.parse(readFileSync(join(cwd, ".ai/harness/worktrees", `${slug}.json`), "utf8"));
      expect(metadata).toMatchObject({
        slug,
        issue: 123,
        issue_url: ISSUE.url,
        branch: `feat/${slug}`,
      });
      expect(metadata).not.toHaveProperty("plan");
      expect(existsSync(join(worktreePath, ".ai/harness/worktrees", `${slug}.json`))).toBe(false);
      expect(run("git", ["branch", "--show-current"], worktreePath).stdout.trim()).toBe(`feat/${slug}`);

      // Start metadata now lives in the primary checkout. Remove it so this
      // retry still exercises the residual worktree path refusal.
      rmSync(join(cwd, ".ai/harness/worktrees", `${slug}.json`));
      const residual = start([
        "--issue", "123",
        "--path", worktreePath,
        "--fresh",
        "--json",
      ], cwd, {}, issue);
      expect(residual.status).toBe(1);
      expect(residual.stderr).toContain("--fresh refuses residual worktree path");
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("contract-worktree start uses --type for the branch prefix", () => {
    const cwd = tmpWorkspace("helper-contract-start-type");
    const worktreePath = `${cwd}-wt-type`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      commitAll(cwd, "seed typed start");

      const started = start(["--issue", "123", "--type", "fix", "--path", worktreePath, "--json"], cwd);
      expect(started.status, started.stderr).toBe(0);
      expect(JSON.parse(started.stdout)).toMatchObject({
        branch: "fix/123-location",
        issue: 123,
        disposition: "created",
      });
      const metadata = JSON.parse(readFileSync(join(cwd, ".ai/harness/worktrees/123-location.json"), "utf8"));
      expect(metadata.branch).toBe("fix/123-location");
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("contract-worktree start rejects plan, missing gh, gh failure and non-open issues", () => {
    const cwd = tmpWorkspace("helper-contract-start-reject");
    const target = join(cwd, "never-created");
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      commitAll(cwd, "seed rejected starts");

      const plan = run("/bin/bash", ["scripts/contract-worktree.sh", "start", "--plan", "plans/plan-old.md"], cwd, {
        PATH: NO_GH_DIR,
      });
      expect(plan.status).toBe(2);
      expect(plan.stderr.trim()).toBe("contract-worktree: unknown option --plan; use --issue <n>");

      const missingGh = run("/bin/bash", ["scripts/contract-worktree.sh", "start", "--issue", "123", "--path", target], cwd, {
        PATH: NO_GH_DIR,
      });
      expect(missingGh.status).toBe(2);
      expect(missingGh.stderr.trim()).toBe("contract-worktree: gh is required for --issue");

      const ghFailure = start(["--issue", "123", "--path", target], cwd, {
        GH_STUB_ERROR: "gh: authentication required",
      });
      expect(ghFailure.status).toBe(2);
      expect(ghFailure.stderr.trim()).toBe("contract-worktree: cannot read issue 123: gh: authentication required");

      const closed = start(["--issue", "123", "--path", target], cwd, {}, { state: "CLOSED" });
      expect(closed.status).toBe(2);
      expect(closed.stderr.trim()).toBe("contract-worktree: issue 123 is CLOSED");

      expect(existsSync(target)).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/worktrees"))).toBe(false);
    } finally {
      rmSync(target, { recursive: true, force: true });
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
      writeStartMetadata(cwd, "demo", "codex/demo");
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

  test("contract-worktree cleanup removes a feat worktree created by start", () => {
    const cwd = tmpWorkspace("helper-contract-cleanup-feat");
    const worktreePath = `${cwd}-wt-feat`;
    const slug = "123-feat-cleanup";
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      writeFileSync(join(cwd, ".gitignore"), ".ai/harness/worktrees/\n.ai/harness/active-worktree\n");
      commitAll(cwd, "init cleanup feat");
      const started = start(["--issue", "123", "--path", worktreePath, "--json"], cwd, {}, { title: "Feat cleanup" });
      expect(started.status, started.stderr).toBe(0);
      expect(JSON.parse(started.stdout).branch).toBe(`feat/${slug}`);

      const dryRun = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", slug, "--dry-run"], cwd);
      expect(dryRun.status, dryRun.stderr).toBe(0);
      expect(dryRun.stdout).toContain(`would delete branch: feat/${slug}`);
      expect(existsSync(worktreePath)).toBe(true);

      const cleanup = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", slug], cwd);
      expect(cleanup.status, cleanup.stderr).toBe(0);
      expect(cleanup.stdout).toContain(`Deleted branch: feat/${slug}`);
      expect(existsSync(worktreePath)).toBe(false);
      expect(run("git", ["show-ref", "--verify", "--quiet", `refs/heads/feat/${slug}`], cwd).status).not.toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/worktrees", `${slug}.json`))).toBe(false);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("contract-worktree cleanup removes the start branch after the worktree is pruned", () => {
    const cwd = tmpWorkspace("helper-contract-cleanup-pruned");
    const worktreePath = `${cwd}-wt-pruned`;
    const slug = "123-pruned";
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      writeFileSync(join(cwd, ".gitignore"), ".ai/harness/worktrees/\n");
      commitAll(cwd, "init cleanup pruned");
      const started = start(["--issue", "123", "--path", worktreePath, "--json"], cwd, {}, { title: "Pruned" });
      expect(started.status, started.stderr).toBe(0);
      expect(JSON.parse(started.stdout).branch).toBe(`feat/${slug}`);
      expect(existsSync(join(cwd, ".ai/harness/worktrees", `${slug}.json`))).toBe(true);

      expect(run("git", ["worktree", "remove", "--force", worktreePath], cwd).status).toBe(0);
      expect(run("git", ["worktree", "prune"], cwd).status).toBe(0);
      expect(existsSync(worktreePath)).toBe(false);
      expect(run("git", ["show-ref", "--verify", "--quiet", `refs/heads/feat/${slug}`], cwd).status).toBe(0);

      const cleanup = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", slug], cwd);
      expect(cleanup.status, cleanup.stderr).toBe(0);
      expect(cleanup.stdout).toContain(`Deleted branch: feat/${slug}`);
      expect(run("git", ["show-ref", "--verify", "--quiet", `refs/heads/feat/${slug}`], cwd).status).not.toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/worktrees", `${slug}.json`))).toBe(false);
      expect(run("git", ["branch", "--list", `codex/${slug}`], cwd).stdout.trim()).toBe("");
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("contract-worktree cleanup fails closed when start metadata is missing", () => {
    const cwd = tmpWorkspace("helper-contract-cleanup-no-metadata");
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      writeFileSync(join(cwd, ".ai/harness/policy.json"), `${JSON.stringify({ worktree_strategy: { branch_prefix: "codex/" } })}\n`);
      commitAll(cwd, "init missing metadata");
      expect(run("git", ["branch", "codex/no-metadata"], cwd).status).toBe(0);

      const cleanup = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "no-metadata"], cwd);
      expect(cleanup.status).toBe(2);
      expect(cleanup.stderr.trim()).toBe("contract-worktree: no start metadata for no-metadata");
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/no-metadata"], cwd).status).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("contract-worktree cleanup fails closed when the recorded branch is missing", () => {
    const cwd = tmpWorkspace("helper-contract-cleanup-missing-branch");
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init missing branch");
      writeStartMetadata(cwd, "missing-branch", "feat/missing-branch");

      const cleanup = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "missing-branch"], cwd);
      expect(cleanup.status).toBe(2);
      expect(cleanup.stderr.trim()).toBe("contract-worktree: branch feat/missing-branch not found");
      expect(existsSync(join(cwd, ".ai/harness/worktrees/missing-branch.json"))).toBe(true);
    } finally {
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
      writeStartMetadata(cwd, "unmerged", "codex/unmerged");
      writeFileSync(join(unmergedPath, "feature.txt"), "unmerged\n");
      commitAll(unmergedPath, "unmerged branch change");
      const unmerged = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "unmerged"], cwd);
      expect(unmerged.status).toBe(1);
      expect(unmerged.stderr).toContain("not fully merged");

      expect(run("git", ["worktree", "add", dirtyPath, "-b", "codex/dirty"], cwd).status).toBe(0);
      writeStartMetadata(cwd, "dirty", "codex/dirty");
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
    const expectedTemplate = defaultWorktreeTemplate(process.platform, tmpdir());
    const parent = tmpWorkspace('worktree-default');
    const cwd = join(parent, 'repo');
    const managed = join(parent, 'managed');
    mkdirSync(cwd); mkdirSync(managed);
    try {
      copyHelpers(cwd); initGitRepo(cwd);
      const policy = run('bash', ['-c', 'source "$1"; pi_write_harness_policy "$PWD" apply', 'policy', join(ROOT, 'scripts/lib/project-init-lib.sh')], cwd);
      expect(policy.status, policy.stderr).toBe(0);
      expect(JSON.parse(readFileSync(join(cwd, '.ai/harness/policy.json'), 'utf8')).worktree_strategy.worktree_dir_template).toBe(DEFAULT_WORKTREE_TEMPLATE);
      const helperTemplate = run(process.execPath, ['scripts/contract-worktree-runtime.ts', 'default-template'], cwd);
      expect(helperTemplate.status, helperTemplate.stderr).toBe(0); expect(helperTemplate.stdout.trim()).toBe(expectedTemplate);
      commitAll(cwd, 'location fixture');
      run('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd);
      const result = start(['--issue', '123', '--json'], cwd, { REPO_HARNESS_WORKTREE_ROOT: managed });
      expect(result.status).toBe(0);
      const path = join(managed, 'repo-wt-123-location');
      expect(JSON.parse(result.stdout).worktree_path).toBe(path);
      expect(readFileSync(join(path, '.ai/harness/active-worktree'), 'utf8').trim()).toBe(path);
      const retry = start(['--issue', '123', '--json'], cwd, { REPO_HARNESS_WORKTREE_ROOT: managed });
      expect(retry.status, retry.stderr).toBe(0);
      expect(JSON.parse(retry.stdout)).toMatchObject({ disposition: 'reused_existing_worktree', worktree_path: path });
      expect(sweepManagedWorktrees(cwd, cwd, { ...process.env, REPO_HARNESS_WORKTREE_ROOT: managed }, { deadlineMs: 60_000 })).toContain('marker reference');
      expect(existsSync(path)).toBe(true);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  }, 15000);

  test('start keeps a stored downstream location template', () => {
    const parent = tmpWorkspace('worktree-stored'); const cwd = join(parent, 'repo'); mkdirSync(cwd);
    try {
      copyHelpers(cwd); initGitRepo(cwd);
      writeFileSync(join(cwd, '.ai/harness/policy.json'), JSON.stringify({ worktree_strategy: { worktree_dir_template: '../stored-{{repo}}-{{slug}}' } }));
      commitAll(cwd, 'stored location fixture');
      const result = start(['--issue', '123', '--json'], cwd);
      expect(result.status).toBe(0); expect(JSON.parse(result.stdout).worktree_path).toBe(join(parent, 'stored-repo-123-location'));
      expect(JSON.parse(readFileSync(join(cwd, '.ai/harness/policy.json'), 'utf8')).worktree_strategy.worktree_dir_template).toBe('../stored-{{repo}}-{{slug}}');
    } finally { rmSync(parent, { recursive: true, force: true }); }
  }, 15000);

  test.each(['../{{repo}}-wt-{{slug}}', '/tmp/{{repo}}-wt-{{slug}}'])('after the upgrade migration of %s, start uses the managed root and the sweep keeps the worktree', legacy => {
    const parent = tmpWorkspace('worktree-migrated');
    const cwd = join(parent, 'repo'); const managed = join(parent, 'managed'); const home = join(parent, 'home');
    mkdirSync(cwd); mkdirSync(managed); mkdirSync(home);
    try {
      copyHelpers(cwd); initGitRepo(cwd);
      writeFileSync(join(cwd, '.ai/harness/policy.json'), `${JSON.stringify({ worktree_strategy: { worktree_dir_template: legacy } }, null, 2)}\n`);
      commitAll(cwd, 'legacy location fixture');
      const migrated = runUpgrade({ cwd, home, packageRoot: ROOT, scope: 'project', apply: true, migrateWorktreeTemplate: true });
      expect(migrated.exitCode, migrated.error).toBe(0);
      expect(JSON.parse(readFileSync(join(cwd, '.ai/harness/policy.json'), 'utf8')).worktree_strategy.worktree_dir_template).toBe(DEFAULT_WORKTREE_TEMPLATE);
      // Upgrade apply removes the owned helper copies; restore the fixture the start command runs from.
      copyHelpers(cwd);
      commitAll(cwd, 'migrated location');
      run('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd);
      const env = { REPO_HARNESS_WORKTREE_ROOT: managed };
      const result = start(['--issue', '123', '--json'], cwd, env);
      expect(result.status, result.stderr).toBe(0);
      const path = join(managed, 'repo-wt-123-location');
      expect(JSON.parse(result.stdout).worktree_path).toBe(path);
      expect(sweepManagedWorktrees(cwd, cwd, { ...process.env, ...env }, { deadlineMs: 60_000 })).toContain('marker reference');
      expect(existsSync(path)).toBe(true);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  }, 30000);

  test.each(['directory', 'file', 'symlink'])('start refuses an existing %s at the default target', kind => {
    const parent = tmpWorkspace('worktree-existing');
    const cwd = join(parent, 'repo'); const managed = join(parent, 'managed');
    mkdirSync(cwd); mkdirSync(managed);
    const target = join(managed, 'repo-wt-123-location');
    try {
      copyHelpers(cwd); initGitRepo(cwd); commitAll(cwd, 'location fixture');
      if (kind === 'directory') mkdirSync(target);
      else if (kind === 'file') writeFileSync(target, 'keep');
      else symlinkSync(join(parent, 'absent'), target);
      const result = start(['--issue', '123'], cwd, { REPO_HARNESS_WORKTREE_ROOT: managed });
      expect(result.status).toBe(1); expect(result.stderr).toContain('target worktree path already exists');
      expect(lstatSync(target)).toBeDefined();
      expect(run('git', ['show-ref', '--verify', 'refs/heads/feat/123-location'], cwd).status).not.toBe(0);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  }, 15000);
});

describe('W2/W3/W4 start and closeout ownership', () => {
  function fixture() {
    const parent = tmpWorkspace('start-closeout'); const cwd = join(parent, 'repo'); const target = join(parent, 'linked');
    mkdirSync(cwd); copyHelpers(cwd); initGitRepo(cwd);
    writeFileSync(join(cwd, '.gitignore'), '.ai/\nnode_modules\n'); commitAll(cwd, 'base');
    const args = ['--issue', '123', '--path', target, '--branch', 'codex/owned'];
    return {
      parent,
      cwd,
      target,
      start: (extra: string[] = [], env: NodeJS.ProcessEnv = {}) => start([...args, ...extra], cwd, env, { title: 'Owned' }),
      cleanup: () => rmSync(parent, { recursive: true, force: true }),
    };
  }
  test('real start, task commit, merge and cleanup releases only the self marker', () => {
    const f = fixture(); try {
      const started = f.start();
      expect(started.status, started.stderr).toBe(0);
      expect(readFileSync(join(f.target, '.ai/harness/active-worktree'), 'utf8').trim()).toBe(f.target);
      writeFileSync(join(f.target, 'change'), 'task change'); commitAll(f.target, 'task change');
      expect(run('git', ['merge', '--ff-only', 'codex/owned'], f.cwd).status).toBe(0);
      const result = run('bash', ['scripts/contract-worktree.sh', 'cleanup', '--slug', '123-owned', '--target', 'main'], f.cwd);
      expect(result.status, result.stderr).toBe(0); expect(existsSync(f.target)).toBe(false);
      expect(run('git', ['branch', '--list', 'codex/owned'], f.cwd).stdout.trim()).toBe('');
      // The fixture HOME has no global architecture configuration, so the provider is disabled.
      expect(result.stdout).toContain(JSON.stringify({ schemaVersion: 'repo-harness.architecture-daemon-stop/v1', worktree: f.target, provider: 'disabled', stopped: [], failures: [] }));
    } finally { f.cleanup(); }
  }, 15000);
  test('retry recovers the same registered branch and marker', () => {
    const f = fixture(); try {
      expect(f.start().status).toBe(0);
      const retry = f.start(['--json']);
      expect(retry.status, retry.stderr).toBe(0); expect(JSON.parse(retry.stdout).disposition).toBe('reused_existing_worktree');
      expect(readFileSync(join(f.target, '.ai/harness/active-worktree'), 'utf8').trim()).toBe(f.target);
    } finally { f.cleanup(); }
  }, 15000);
  test.each([false, true])('W6 start, recovery and closeout work under umask 002; shared=%s', shared => {
    const f = fixture(); try {
      if (shared) expect(run('git', ['config', 'core.sharedRepository', 'group'], f.cwd).status).toBe(0);
      const invoke = (extra: string[] = []) => run('bash', [
        '-c', 'umask 002; exec bash "$@"', 'w6',
        'scripts/contract-worktree.sh', 'start', '--issue', '123', '--path', f.target, '--branch', 'codex/owned', ...extra,
      ], f.cwd, issueEnv({}, { title: 'Owned' }));
      const started = invoke(); expect(started.status, started.stderr).toBe(0);
      expect(lstatSync(f.target).mode & 0o022).toBe(0);
      expect(lstatSync(join(f.target, '.git')).mode & 0o020).toBe(0o020);
      const retry = invoke(['--json']); expect(retry.status, retry.stderr).toBe(0);
      expect(JSON.parse(retry.stdout).disposition).toBe('reused_existing_worktree');
      const store = join(f.cwd, '.git/repo-harness/coordination/worktree-identities');
      const record = readdirSync(store).find(name => name.endsWith('.json'))!; expect(record).toBeTruthy();
      const stale = join(store, record + '.12345678-1234-4123-8123-123456789abc');
      writeFileSync(stale, 'unpublished', { mode: 0o600 }); utimesSync(stale, new Date(0), new Date(0));
      const unknown = join(store, 'keep.txt'); writeFileSync(unknown, 'keep');
      expect(invoke().status).toBe(0);
      expect(existsSync(stale)).toBe(false); expect(existsSync(unknown)).toBe(true);
      writeFileSync(join(f.target, 'change'), 'task'); commitAll(f.target, 'task');
      expect(run('git', ['merge', '--ff-only', 'codex/owned'], f.cwd).status).toBe(0);
      const cleanup = run('bash', ['scripts/contract-worktree.sh', 'cleanup', '--slug', '123-owned', '--target', 'main'], f.cwd);
      expect(cleanup.status, cleanup.stderr).toBe(0); expect(existsSync(f.target)).toBe(false);
      expect(readdirSync(store).filter(name => name.endsWith('.json'))).toEqual([]);
    } finally { f.cleanup(); }
  }, 20000);

  test('W6 an old registered checkout without a start identity has an action message', () => {
    const f = fixture(); try {
      expect(run('git', ['worktree', 'add', '-b', 'codex/owned', f.target], f.cwd).status).toBe(0);
      const retry = f.start();
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

  test('W6 identity write failure names the retained checkout and manual cleanup', () => {
    const f = fixture(); try {
      const binary = join(f.parent, 'git-block-identity');
      writeFileSync(binary, '#!/bin/sh\n/usr/bin/git "$@"\nstatus=$?\nif [ "$1" = worktree ] && [ "$2" = add ] && [ "$status" = 0 ]; then mkdir -p "$W6_STORE_PARENT"; printf blocked > "$W6_STORE_PARENT/worktree-identities"; fi\nexit "$status"\n', { mode: 0o755 });
      const started = f.start([], { REPO_HARNESS_GIT_BIN: binary, W6_STORE_PARENT: join(f.cwd, '.git/repo-harness/coordination') });
      expect(started.status).toBe(1); expect(started.stderr).toContain('Git created checkout ' + f.target);
      expect(started.stderr).toContain('Managed cleanup cannot prove ownership');
      expect(started.stderr).toContain('git branch -D codex/owned');
      expect(existsSync(join(f.target, '.git'))).toBe(true);
    } finally { f.cleanup(); }
  });

  test('W5 start and recovery accept the system tmp canonical alias', () => {
    const f = fixture(); try {
      const alias = f.target.replace(/^\/private\/tmp\//, '/tmp/');
      const args = ['--issue', '123', '--path', alias, '--branch', 'codex/owned'];
      expect(start(args, f.cwd, {}, { title: 'Owned' }).status).toBe(0);
      const retry = start([...args, '--json'], f.cwd, {}, { title: 'Owned' });
      expect(retry.status, retry.stderr).toBe(0);
      expect(JSON.parse(retry.stdout).disposition).toBe('reused_existing_worktree');
      expect(readFileSync(join(f.target, '.ai/harness/active-worktree'), 'utf8').trim()).toBe(f.target);
    } finally { f.cleanup(); }
  }, 15000);
  test.each(['replacement', 'deleted-replacement', 'writable', 'git-symlink'])('W5 recovery refuses %s', change => {
    const f = fixture(); try {
      expect(f.start().status).toBe(0);
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
      const retry = f.start();
      expect(retry.status).toBe(1); expect(existsSync(f.target)).toBe(true);
      if (change === 'replacement' || change === 'deleted-replacement') expect(readFileSync(join(f.target, 'planted'), 'utf8')).toBe('unsafe');
    } finally { f.cleanup(); }
  }, 15000);
  test('an existing target on another branch is refused', () => {
    const f = fixture(); try {
      expect(run('git', ['worktree', 'add', '-b', 'other', f.target], f.cwd).status).toBe(0);
      const result = f.start();
      expect(result.status).toBe(1); expect(existsSync(f.target)).toBe(true);
      expect(run('git', ['branch', '--show-current'], f.target).stdout.trim()).toBe('other');
    } finally { f.cleanup(); }
  });
  test('a failed Git add rolls back only its empty exclusive claim', () => {
    const f = fixture(); try {
      const binary = join(f.parent, 'git-fail-add');
      writeFileSync(binary, '#!/bin/sh\nif [ "$1" = worktree ] && [ "$2" = add ]; then exit 42; fi\nexec /usr/bin/git "$@"\n', { mode: 0o755 });
      const failed = f.start([], { REPO_HARNESS_GIT_BIN: binary });
      expect(failed.status).toBe(1); expect(existsSync(f.target)).toBe(false);
      expect(f.start().status).toBe(0);
    } finally { f.cleanup(); }
  }, 15000);
});
