import { afterAll, expect } from "bun:test";
import { spawnSync } from "child_process";
import { appendFileSync, cpSync, mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

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
  return tmpWorkspaceIn(tmpdir(), prefix);
}

export function tmpWorkspaceIn(parent: string, prefix: string): string {
  return realpathSync(mkdtempSync(join(parent, `${prefix}-`)));
}

export interface FixtureWorkspace {
  readonly root: string;
  readonly home: string;
}

/**
 * Build an expensive repository fixture once per distinct argument list and give
 * every later caller a pristine materialization of it.
 *
 * The snapshot is restored into the original `root` and `home`, never copied to a
 * fresh path: `repoHarnessRepoIdFor` hashes the repository root verbatim, so the
 * sealed authorization, registry entry, campaign intent and publication recorded
 * inside a fixture are all bound to that exact path. Restoring in place therefore
 * keeps the returned value valid while giving each caller unshared bytes, which is
 * the same isolation a rebuild provides.
 */
export function fixtureTemplate<A extends readonly unknown[], T extends FixtureWorkspace>(build: (...args: A) => Promise<T>) {
  const templates = new Map<string, { readonly value: T; readonly store: string }>();
  return {
    async materialize(...args: A): Promise<T> {
      const key = JSON.stringify(args);
      const cached = templates.get(key);
      if (cached) {
        for (const [name, path] of [["root", cached.value.root], ["home", cached.value.home]] as const) {
          rmSync(path, { recursive: true, force: true });
          cpSync(join(cached.store, name), path, { recursive: true, verbatimSymlinks: true });
        }
        return cached.value;
      }
      const value = await build(...args);
      const store = tmpWorkspaceIn(dirname(value.root), "fixture-template");
      cpSync(value.root, join(store, "root"), { recursive: true, verbatimSymlinks: true });
      cpSync(value.home, join(store, "home"), { recursive: true, verbatimSymlinks: true });
      templates.set(key, { value, store });
      return value;
    },
    dispose(): void {
      for (const { store } of templates.values()) rmSync(store, { recursive: true, force: true });
      templates.clear();
    },
  };
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
  expect(run("git", ["init", "-b", "main"], cwd).status).toBe(0);
  // Append the fixture identity directly: two `git config` processes per repository were pure fixture cost.
  appendFileSync(join(cwd, ".git/config"), '\n[user]\n\tname = Helper Test\n\temail = helper@test.local\n');
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
