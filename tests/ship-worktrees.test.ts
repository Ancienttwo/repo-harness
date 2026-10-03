import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers, HELPER_DIR, ROOT } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("ship-worktrees helper integration", () => {
  test("ordinary branch opens a Draft PR without workflow artifacts", () => withPlainShipFixture((fixture) => {
    expect(run("git", ["switch", "-c", "feature/plain"], fixture.cwd).status).toBe(0);
    writeFileSync(join(fixture.cwd,"change.txt"),"ordinary change\n");
    const result=fixture.ship([]);
    expect(result.status,`${result.stdout}\n${result.stderr}`).toBe(0);
    expect(run("git",["ls-remote","origin","refs/heads/feature/plain"],fixture.cwd).stdout).toContain("refs/heads/feature/plain");
    expect(readFileSync(fixture.log,"utf8")).toContain("pr create");
    expect(existsSync(join(fixture.cwd,"tasks/contracts"))).toBe(false);
    expect(existsSync(join(fixture.cwd,".ai/harness/checks/latest.json"))).toBe(false);
  }));
  test("dirty main opens its named PR branch without a workflow plan", () => withPlainShipFixture((fixture) => {
    writeFileSync(join(fixture.cwd,"main-change.txt"),"main change\n");
    const result=fixture.ship(["--slug","plain"]);
    expect(result.status,`${result.stdout}\n${result.stderr}`).toBe(0);
    expect(run("git",["branch","--show-current"],fixture.cwd).stdout.trim()).toBe("codex/plain-main-closeout");
    expect(run("git",["show","main:main-change.txt"],fixture.cwd).status).not.toBe(0);
  }));
  test("unknown PR readback preserves the push and recovery never creates twice", () => withPlainShipFixture((fixture) => {
    expect(run("git",["switch","-c","feature/recover"],fixture.cwd).status).toBe(0);
    writeFileSync(join(fixture.cwd,"change.txt"),"recover change\n");
    expect(fixture.ship([],{PR_READBACK_FAIL:"1"}).status).not.toBe(0);
    const before=run("git",["ls-remote","origin","refs/heads/feature/recover"],fixture.cwd).stdout;
    expect(before).not.toBe("");
    const recovery=fixture.ship(["--recover","reconcile"]);
    expect(recovery.status,`${recovery.stdout}\n${recovery.stderr}`).toBe(0);
    expect(run("git",["ls-remote","origin","refs/heads/feature/recover"],fixture.cwd).stdout).toBe(before);
    expect(readFileSync(fixture.log,"utf8").split("\n").filter(line=>line.startsWith("pr create "))).toHaveLength(1);
  }));
  test("credential scan refuses push before PR creation", () => withPlainShipFixture((fixture) => {
    expect(run("git",["switch","-c","feature/private"],fixture.cwd).status).toBe(0);
    writeFileSync(join(fixture.cwd,"credential.txt"),["_auth", "Token", "=fixture-value\n"].join(""));
    expect(fixture.ship([]).status).not.toBe(0);
    expect(run("git",["ls-remote","origin","refs/heads/feature/private"],fixture.cwd).stdout).toBe("");
  }));

  test("ship-worktrees cleanup-merged should refuse dirty merged source worktree", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-dirty-merged");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, "src"), { recursive: true });
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init dirty merged cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      mkdirSync(join(worktreePath, "src"), { recursive: true });
      writeFileSync(join(worktreePath, "src/demo.ts"), "export const demo = 1;\n");
      commitAll(worktreePath, "add demo source");
      expect(run("git", ["merge", "--ff-only", "codex/demo"], cwd).status).toBe(0);

      writeFileSync(join(worktreePath, "src/demo.ts"), "export const demo = 2;\n");

      const cleanup = run("bash", ["scripts/ship-worktrees.sh", "--cleanup-merged", "--target", "main"], cwd);
      expect(cleanup.status).toBe(1);
      expect(cleanup.stderr).toContain("dirty merged linked worktree");
      expect(cleanup.stderr).toContain("pick/apply/commit");
      expect(cleanup.stderr).toContain("tgz");
      expect(cleanup.stderr).toContain("src/demo.ts");
      expect(existsSync(worktreePath)).toBe(true);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).toBe(0);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("ship-worktrees cleanup-merged should honor slug filter and repair stale gitdir", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-slug-repair");
    const demoPath = `${cwd}-wt-demo`;
    const keepPath = `${cwd}-wt-keep`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init slug cleanup");

      expect(run("git", ["worktree", "add", demoPath, "-b", "codex/demo"], cwd).status).toBe(0);
      expect(run("git", ["worktree", "add", keepPath, "-b", "codex/keep"], cwd).status).toBe(0);
      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/demo.json"), '{"slug":"demo"}\n');
      writeFileSync(join(cwd, ".ai/harness/worktrees/keep.json"), '{"slug":"keep"}\n');
      writeFileSync(join(demoPath, ".git"), "gitdir: /tmp/moved-repo/.git/worktrees/wt-demo\n");

      const cleanup = run(
        "bash",
        ["scripts/ship-worktrees.sh", "--cleanup-merged", "--slug", "demo", "--target", "main"],
        cwd
      );

      expect(cleanup.status).toBe(0);
      expect(cleanup.stderr).toContain("Repaired stale worktree gitdir");
      expect(cleanup.stdout).toContain("Removed worktree");
      expect(existsSync(demoPath)).toBe(false);
      expect(existsSync(keepPath)).toBe(true);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).not.toBe(0);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/keep"], cwd).status).toBe(0);
    } finally {
      for (const path of [demoPath, keepPath]) {
        run("git", ["worktree", "remove", "--force", path], cwd);
        rmSync(path, { recursive: true, force: true });
      }
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("scaffold-only dirt is preserved despite the retired discard flag", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-scaffold-discard");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Deferred Goal Ledger\n");
      commitAll(cwd, "init scaffold cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/demo.json"), '{"slug":"demo"}\n');

      mkdirSync(join(worktreePath, "plans"), { recursive: true });
      mkdirSync(join(worktreePath, "tasks/contracts"), { recursive: true });
      mkdirSync(join(worktreePath, "tasks/reviews"), { recursive: true });
      mkdirSync(join(worktreePath, "tasks/notes"), { recursive: true });
      writeFileSync(join(worktreePath, "tasks/todos.md"), "# Deferred Goal Ledger\n- generated scaffold\n");
      writeFileSync(join(worktreePath, "plans/plan-20260304-1410-demo.md"), "# Plan: demo\n");
      writeFileSync(join(worktreePath, "tasks/contracts/demo.contract.md"), "# Contract\n");
      writeFileSync(join(worktreePath, "tasks/reviews/demo.review.md"), "# Review\n");
      writeFileSync(join(worktreePath, "tasks/notes/demo.notes.md"), "# Notes\n");

      const cleanup = run(
        "bash",
        ["scripts/ship-worktrees.sh", "--cleanup-merged", "--discard-scaffold-only", "--target", "main"],
        cwd
      );
      expect(cleanup.status).not.toBe(0);
      expect(cleanup.stderr).toContain("dirty work requires a user decision");
      expect(existsSync(worktreePath)).toBe(true);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("scaffold-only tracked dirt is preserved despite the retired discard flag", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-scaffold-tracked-only");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/notes"), { recursive: true });
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Deferred Goal Ledger\n");
      writeFileSync(join(cwd, "plans/plan-20260304-1410-demo.md"), "# Plan: demo\n");
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), "# Contract\n");
      writeFileSync(join(cwd, "tasks/notes/demo.notes.md"), "# Notes\n");
      commitAll(cwd, "init tracked scaffold cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/demo.json"), '{"slug":"demo"}\n');

      // Every dirty scaffold path is tracked; the untracked set is empty.
      writeFileSync(join(worktreePath, "tasks/todos.md"), "# Deferred Goal Ledger\n- generated scaffold\n");
      writeFileSync(join(worktreePath, "plans/plan-20260304-1410-demo.md"), "# Plan: demo\n\n- generated\n");
      writeFileSync(join(worktreePath, "tasks/contracts/demo.contract.md"), "# Contract\n\n- generated\n");
      writeFileSync(join(worktreePath, "tasks/notes/demo.notes.md"), "# Notes\n\n- generated\n");
      expect(run("git", ["status", "--porcelain=v1", "--untracked-files=all"], worktreePath).stdout).not.toContain("??");

      const cleanup = run(
        "bash",
        ["scripts/ship-worktrees.sh", "--cleanup-merged", "--discard-scaffold-only", "--target", "main"],
        cwd
      );
      expect(cleanup.stderr).not.toContain("unbound variable");
      expect(cleanup.status).not.toBe(0);
      expect(cleanup.stderr).toContain("dirty work requires a user decision");
      expect(existsSync(worktreePath)).toBe(true);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("dirty cleanup requires a user decision and preserves all files", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-scaffold-no-flag");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Deferred Goal Ledger\n");
      commitAll(cwd, "init scaffold no flag cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      mkdirSync(join(worktreePath, "plans"), { recursive: true });
      mkdirSync(join(worktreePath, "tasks/contracts"), { recursive: true });
      writeFileSync(join(worktreePath, "tasks/todos.md"), "# Deferred Goal Ledger\n- generated scaffold\n");
      writeFileSync(join(worktreePath, "plans/plan-20260304-1410-demo.md"), "# Plan: demo\n");
      writeFileSync(join(worktreePath, "tasks/contracts/demo.contract.md"), "# Contract\n");

      const cleanup = run("bash", ["scripts/ship-worktrees.sh", "--cleanup-merged", "--target", "main"], cwd);
      expect(cleanup.status).toBe(1);
      expect(cleanup.stderr).toContain("dirty merged linked worktree");
      expect(cleanup.stderr).toContain("user decision");
      expect(existsSync(join(worktreePath, "tasks/todos.md"))).toBe(true);
      expect(readFileSync(join(worktreePath, "tasks/todos.md"), "utf8")).toContain("generated scaffold");
      expect(existsSync(worktreePath)).toBe(true);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).toBe(0);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);
});

function withPlainShipFixture(work:(fixture:{cwd:string;log:string;ship:(args:string[],extra?:NodeJS.ProcessEnv)=>ReturnType<typeof run>})=>void):void {
  const cwd=tmpWorkspace('plain-ship'); const remote=`${cwd}-remote.git`; const fakeBin=`${cwd}-provider`;
  const log=`${cwd}-provider.log`;const store=`${cwd}-pr.json`;
  try {
    copyHelpers(cwd);initGitRepo(cwd);
    writeFileSync(join(cwd,'README.md'),'# fixture\n');
    writeFileSync(join(cwd,'.gitignore'),'.ai/harness/\nnode_modules/\n');
    mkdirSync(join(cwd,'.ai/harness'),{recursive:true});
    writeFileSync(join(cwd,'.ai/harness/policy.json'),JSON.stringify({merge_gate:{enabled:true}}));
    commitAll(cwd,'seed');
    expect(run('git',['init','--bare',remote],cwd).status).toBe(0);
    expect(run('git',['remote','add','origin',remote],cwd).status).toBe(0);
    expect(run('git',['push','-u','origin','main'],cwd).status).toBe(0);
    mkdirSync(fakeBin,{recursive:true});const gh=join(fakeBin,'gh');
    writeFileSync(gh,[`#!${process.execPath}`,
      'const fs=require("fs"),{execFileSync}=require("child_process");const a=process.argv.slice(2);fs.appendFileSync(process.env.GH_LOG,a.join(" ")+"\\n");',
      'if(a[0]==="pr"&&a[1]==="list"){if(fs.existsSync(process.env.GH_STORE))console.log("https://example.test/pr/2");process.exit(0);}',
      'if(a[0]==="pr"&&a[1]==="create"){fs.writeFileSync(process.env.GH_STORE,"created");console.log("https://example.test/pr/2");process.exit(0);}',
      'if(a[0]==="pr"&&a[1]==="view"){if(process.env.PR_READBACK_FAIL==="1")process.exit(61);const git=(args)=>execFileSync("/usr/bin/git",args,{encoding:"utf8"}).trim();console.log(JSON.stringify({number:2,url:"https://example.test/pr/2",headRefName:git(["branch","--show-current"]),baseRefName:"main",headRefOid:git(["rev-parse","HEAD"]),baseRefOid:git(["rev-parse","origin/main"])}));process.exit(0);}',
      'process.exit(1);',''].join('\n'));
    expect(run('chmod',['+x',gh],cwd).status).toBe(0);
    const ship=(args:string[],extra:NodeJS.ProcessEnv={})=>run('bash',['scripts/ship-worktrees.sh',...args],cwd,{
      REPO_HARNESS_BASH_BIN:'/bin/bash',REPO_HARNESS_BUN_BIN:process.execPath,REPO_HARNESS_GIT_BIN:'/usr/bin/git',
      REPO_HARNESS_GH_BIN:gh,REPO_HARNESS_WORKFLOW_STATE_LIB:join(ROOT,'assets/hooks/lib/workflow-state.sh'),GH_LOG:log,GH_STORE:store,...extra,
    });
    work({cwd,log,ship});
  } finally {
    for(const path of [cwd,remote,fakeBin,log,store])rmSync(path,{recursive:true,force:true});
  }
}
