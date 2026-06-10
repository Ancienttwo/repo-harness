import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const SHIM = join(ROOT, "scripts/hook-shim.sh");
const CLI = join(ROOT, "scripts/repo-harness.sh");

let sandbox: string;
let harnessHome: string;
let repo: string;

function git(args: string[], cwd: string) {
  return spawnSync("git", args, { cwd, encoding: "utf-8" });
}

function runShim(hook: string, cwd: string) {
  return spawnSync("bash", [SHIM, hook], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, REPO_HARNESS_HOME: harnessHome },
  });
}

function runCli(args: string[], cwd: string) {
  return spawnSync("bash", [CLI, ...args], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, REPO_HARNESS_HOME: harnessHome },
  });
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "hook-shim-trust-"));
  harnessHome = join(sandbox, "rh-home");
  repo = join(sandbox, "fake-repo");
  mkdirSync(join(repo, ".ai/harness"), { recursive: true });
  mkdirSync(join(repo, ".ai/hooks"), { recursive: true });
  writeFileSync(join(repo, ".ai/harness/workflow-contract.json"), "{}\n");
  writeFileSync(join(repo, ".ai/hooks/run-hook.sh"), '#!/bin/bash\necho "RAN-HOOK $1"\n');
  git(["init", "-q"], repo);
  git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"], repo);
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("hook-shim trust gate", () => {
  test("untrusted opt-in repo is skipped silently (exit 0, hook not executed)", () => {
    const res = runShim("post-bash.sh", repo);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("RAN-HOOK");
  });

  test("untrusted repo gets a one-line hint on session start only", () => {
    const sessionStart = runShim("session-start-context.sh", repo);
    expect(sessionStart.status).toBe(0);
    expect(sessionStart.stderr).toContain("repo not trusted");

    const other = runShim("post-bash.sh", repo);
    expect(other.stderr).not.toContain("repo not trusted");
  });

  test("trust enables hook execution; untrust disables it again", () => {
    const trust = runCli(["trust"], repo);
    expect(trust.status).toBe(0);
    expect(trust.stdout).toContain("trusted:");

    const trusted = runShim("post-bash.sh", repo);
    expect(trusted.status).toBe(0);
    expect(trusted.stdout).toContain("RAN-HOOK post-bash.sh");

    const untrust = runCli(["untrust"], repo);
    expect(untrust.status).toBe(0);

    const after = runShim("post-bash.sh", repo);
    expect(after.status).toBe(0);
    expect(after.stdout).not.toContain("RAN-HOOK");
  });

  test("trust is idempotent and listed by trust-list", () => {
    runCli(["trust"], repo);
    const second = runCli(["trust"], repo);
    expect(second.stdout).toContain("already trusted");

    const list = runCli(["trust-list"], repo);
    const entries = list.stdout.trim().split("\n");
    expect(entries.filter((line) => line.endsWith("fake-repo")).length).toBe(1);

    const trustFile = readFileSync(join(harnessHome, "trusted-repos"), "utf-8");
    expect(trustFile.trim().split("\n").length).toBe(1);
    runCli(["untrust"], repo);
  });

  test("linked worktrees inherit trust from the primary repo root", () => {
    const wt = join(sandbox, "fake-wt");
    const add = git(["worktree", "add", "-q", wt, "-b", "trust-test"], repo);
    expect(add.status).toBe(0);
    mkdirSync(join(wt, ".ai/harness"), { recursive: true });
    mkdirSync(join(wt, ".ai/hooks"), { recursive: true });
    writeFileSync(join(wt, ".ai/harness/workflow-contract.json"), "{}\n");
    writeFileSync(join(wt, ".ai/hooks/run-hook.sh"), '#!/bin/bash\necho "RAN-HOOK $1"\n');

    const before = runShim("post-bash.sh", wt);
    expect(before.stdout).not.toContain("RAN-HOOK");

    runCli(["trust"], repo);
    const after = runShim("post-bash.sh", wt);
    expect(after.status).toBe(0);
    expect(after.stdout).toContain("RAN-HOOK post-bash.sh");
    runCli(["untrust"], repo);
  });

  test("non-git directory and non-opt-in repo remain silent no-ops", () => {
    const plain = join(sandbox, "plain-dir");
    mkdirSync(plain, { recursive: true });
    const res = runShim("post-bash.sh", plain);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
  });
});
