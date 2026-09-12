import { afterAll, expect } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const homes = new Map<string, string>();
function fixtureHome(cwd: string): string {
  let home = homes.get(cwd);
  if (!home) {
    home = mkdtempSync(join(tmpdir(), "repo-fixture-home-"));
    homes.set(cwd, home);
  }
  return home;
}

afterAll(() => {
  for (const home of homes.values()) rmSync(home, { recursive: true, force: true });
  homes.clear();
});

// cwd is explicit; env overrides are explicit, output/status are returned unmodified.
// No process timeout is added: existing test-level deadlines remain authoritative.
const SANDBOX_ENV_BLOCKLIST = [
  "REPO_HARNESS_TARGET_REPO_ROOT",
  "REPO_HARNESS_HELPER_SOURCE_PATH",
  "REPO_HARNESS_SOURCE_ROOT",
  "REPO_HARNESS_BUN_BIN",
  "REPO_HARNESS_WORKFLOW_STATE_LIB",
];

export function tmpWorkspace(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
}

export function sandboxEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const base = { ...process.env };
  for (const key of SANDBOX_ENV_BLOCKLIST) delete base[key];
  return { ...base, ...env };
}

export function run(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return spawnSync(cmd, args, { cwd, encoding: "utf-8", env: { ...sandboxEnv(env), HOME: env?.HOME ?? fixtureHome(cwd) } });
}

export function initGitRepo(cwd: string) {
  expect(run("git", ["init"], cwd).status).toBe(0);
  const branch = run("git", ["branch", "--show-current"], cwd).stdout.trim();
  if (branch !== "main") {
    expect(run("git", ["checkout", "-b", "main"], cwd).status).toBe(0);
  }
  expect(run("git", ["config", "user.name", "Helper Test"], cwd).status).toBe(0);
  expect(run("git", ["config", "user.email", "helper@test.local"], cwd).status).toBe(0);
}

export function commitAll(cwd: string, message: string) {
  expect(run("git", ["add", "."], cwd).status).toBe(0);
  expect(run("git", ["commit", "-m", message], cwd).status).toBe(0);
}

// Synchronous callback ownership: cleanup runs on success and on thrown assertions.
export function withTempRepo(prefix: string, fn: (repoRoot: string) => void): void {
  const repoRoot = tmpWorkspace(prefix);
  try {
    fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}
