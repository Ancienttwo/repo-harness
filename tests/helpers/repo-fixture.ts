import { afterAll, expect } from "bun:test";
import { spawnSync } from "child_process";
import { appendFileSync, chmodSync, cpSync, mkdtempSync, realpathSync, rmSync, linkSync, writeFileSync } from "fs";
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

export interface FixtureTemplate<A extends readonly unknown[], R> {
  materialize(...args: A): R;
  dispose(): void;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === "function";
}

/**
 * Build an expensive repository fixture once per distinct argument list and give
 * every later caller a pristine materialization of it.
 *
 * The snapshot is restored into the workspace directories the fixture already
 * owns, never copied to a fresh path: `repoHarnessRepoIdFor` hashes the
 * repository root verbatim, so the sealed authorization, registry entry,
 * campaign intent and publication recorded inside a fixture are all bound to
 * that exact path. Restoring in place therefore keeps the returned value valid
 * while giving each caller unshared bytes, which is the same isolation a rebuild
 * provides.
 *
 * `materialize` mirrors the builder: a synchronous builder keeps a synchronous
 * call site, because a fixture whose consumers are synchronous must not force
 * every test body to become async just to reach the cache. `workspacePaths`
 * names the directories to snapshot when the fixture does not use the
 * `{ root, home }` shape.
 */
export function fixtureTemplate<A extends readonly unknown[], T extends FixtureWorkspace>(
  build: (...args: A) => Promise<T>,
): FixtureTemplate<A, Promise<T>>;
export function fixtureTemplate<A extends readonly unknown[], T extends object>(
  build: (...args: A) => T,
  workspacePaths: (value: T) => readonly string[],
): FixtureTemplate<A, T>;
export function fixtureTemplate(
  build: (...args: never[]) => unknown,
  workspacePaths?: (value: never) => readonly string[],
): FixtureTemplate<never[], unknown> {
  const select = (workspacePaths ?? ((value: FixtureWorkspace) => [value.root, value.home])) as (value: unknown) => readonly string[];
  const templates = new Map<string, { readonly value: unknown; readonly store: string; readonly asynchronous: boolean }>();
  const capture = (value: unknown): string => {
    const paths = select(value);
    const store = tmpWorkspaceIn(dirname(paths[0]!), "fixture-template");
    paths.forEach((path, index) => cpSync(path, join(store, `${index}`), { recursive: true, verbatimSymlinks: true }));
    return store;
  };
  const restore = (entry: { readonly value: unknown; readonly store: string }): void => {
    select(entry.value).forEach((path, index) => {
      rmSync(path, { recursive: true, force: true });
      cpSync(join(entry.store, `${index}`), path, { recursive: true, verbatimSymlinks: true });
    });
  };
  return {
    materialize(...args: never[]): unknown {
      const key = JSON.stringify(args);
      const cached = templates.get(key);
      if (cached) {
        restore(cached);
        return cached.asynchronous ? Promise.resolve(cached.value) : cached.value;
      }
      const built = build(...args);
      if (isThenable(built)) {
        return Promise.resolve(built).then((value) => {
          templates.set(key, { value, store: capture(value), asynchronous: true });
          return value;
        });
      }
      templates.set(key, { value: built, store: capture(built), asynchronous: false });
      return built;
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

let shellFixtureRoot: string | undefined;
afterAll(() => {
  if (shellFixtureRoot) rmSync(shellFixtureRoot, { recursive: true, force: true });
  shellFixtureRoot = undefined;
});

/**
 * Share the executable inode while keeping each shell fixture's body beside its
 * original command path. Fresh executable cold starts can exceed probe budgets;
 * interpreting a private body avoids paying that cost for every generated stub.
 * These fixtures use /bin/sh or /bin/bash and do not inspect their script path.
 */
export function writeShellExecutableFixture(filePath: string, content: string): void {
  const shebang = content.split("\n", 1)[0];
  if (shebang !== "#!/bin/sh" && shebang !== "#!/bin/bash") {
    throw new Error(`unsupported shell fixture interpreter: ${shebang}`);
  }
  if (!shellFixtureRoot) {
    const root = tmpWorkspace("shell-fixture-launcher");
    const launcher = join(root, "launcher");
    writeFileSync(launcher, [
      "#!/bin/sh",
      'if [ "${1:-}" = "__fixture-ready" ]; then exit 0; fi',
      'IFS= read -r interpreter < "$0.fixture-body"',
      'case "$interpreter" in',
      '  "#!/bin/sh") exec /bin/sh "$0.fixture-body" "$@" ;;',
      '  "#!/bin/bash") exec /bin/bash "$0.fixture-body" "$@" ;;',
      '  *) exit 64 ;;',
      'esac',
      "",
    ].join("\n"));
    chmodSync(launcher, 0o755);
    const ready = spawnSync(launcher, ["__fixture-ready"], { encoding: "utf-8", timeout: 30_000 });
    if (ready.status !== 0) {
      rmSync(root, { recursive: true, force: true });
      throw new Error(`fixture launcher failed: ${ready.stderr || ready.stdout || String(ready.error)}`);
    }
    shellFixtureRoot = root;
  }
  writeFileSync(`${filePath}.fixture-body`, content, { mode: 0o600 });
  rmSync(filePath, { force: true });
  // A hard link retains the command path even when a runtime canonicalizes it.
  linkSync(join(shellFixtureRoot, "launcher"), filePath);
}
