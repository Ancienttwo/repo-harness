import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const SCRIPT_PATH = join(ROOT, "scripts/setup-plugins.sh");

function readSetup(): string {
  return readFileSync(SCRIPT_PATH, "utf-8");
}

let stubDir = "";

/**
 * Run setup-plugins.sh with a stub `repo-harness` resolved first on PATH.
 * The stub prints one received argument per line and exits 0, so the real
 * `repo-harness install` and the real bun entrypoint are never reached and
 * nothing is installed on the host.
 */
function runSetup(argv: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
  forwarded: string[];
} {
  const res = spawnSync("bash", [SCRIPT_PATH, ...argv], {
    cwd: ROOT,
    encoding: "utf-8",
    env: {
      ...process.env,
      PATH: `${stubDir}:${process.env.PATH ?? ""}`,
    },
  });
  const stdout = res.stdout ?? "";
  const marker = "STUB_ARG:";
  const forwarded = stdout
    .split("\n")
    .filter((line) => line.startsWith(marker))
    .map((line) => line.slice(marker.length));
  return { status: res.status, stdout, stderr: res.stderr ?? "", forwarded };
}

describe("setup-plugins compatibility shim", () => {
  test("passes shell syntax check", () => {
    const res = spawnSync("bash", ["-n", SCRIPT_PATH], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stderr).toBe("");
  }, 30_000);

  test("delegates to the modern repo-harness install path", () => {
    const setup = readSetup();
    expect(setup).toContain("repo-harness install");
    expect(setup).toContain('bun "$ROOT_DIR/src/cli/index.ts" install');
  });

  test("does not retain old Claude plugin installer content", () => {
    const setup = readSetup();
    expect(setup).not.toContain("ESSENTIAL_PLUGINS");
    expect(setup).not.toContain("feature-dev");
    expect(setup).not.toContain("frontend-design");
    expect(setup).not.toContain("claude plugin marketplace");
    expect(setup).not.toContain("install_runtime_policy_hooks()");
  });

  test("maps the retired none hook profile to the modern --no-hooks flag", () => {
    const setup = readSetup();
    expect(setup).toContain('profile="${2:-}"');
    expect(setup).toContain("args+=(--no-hooks)");
  });
});

describe("setup-plugins argument forwarding", () => {
  beforeAll(() => {
    stubDir = mkdtempSync(join(tmpdir(), "setup-plugins-stub-"));
    const stub = join(stubDir, "repo-harness");
    writeFileSync(
      stub,
      ['#!/bin/bash', 'for arg in "$@"; do', '  echo "STUB_ARG:$arg"', 'done', ""].join("\n"),
      "utf-8",
    );
    chmodSync(stub, 0o755);
  });

  afterAll(() => {
    if (stubDir) rmSync(stubDir, { recursive: true, force: true });
  });

  test("forwards with no arguments instead of failing on an empty array", () => {
    const res = runSetup([]);
    expect(res.stderr).not.toContain("unbound variable");
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual(["install"]);
  }, 30_000);

  test("forwards when every argument is consumed by a retired option", () => {
    const res = runSetup(["--lsp", "ts"]);
    expect(res.stderr).toContain("retired option ignored: --lsp ts");
    expect(res.stderr).not.toContain("unbound variable");
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual(["install"]);
  }, 30_000);

  test("forwards non-empty arguments unchanged", () => {
    const res = runSetup(["--repo", "."]);
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual(["install", "--repo", "."]);
  }, 30_000);

  test("keeps an argument containing a space as a single argument", () => {
    const res = runSetup(["--repo", "/tmp/a b"]);
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual(["install", "--repo", "/tmp/a b"]);
  }, 30_000);

  test("forwards when --hooks is the final argument", () => {
    const res = runSetup(["--hooks"]);
    expect(res.stderr).toContain("retired hook profile ignored: <missing>");
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual(["install"]);
  }, 30_000);

  test("forwards a preceding real argument when --lsp is the final argument", () => {
    const res = runSetup(["--repo", ".", "--lsp"]);
    expect(res.stderr).toContain("retired option ignored: --lsp");
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual(["install", "--repo", "."]);
  }, 30_000);

  test("forwards a preceding real argument when --project-type is the final argument", () => {
    const res = runSetup(["--repo", ".", "--project-type"]);
    expect(res.stderr).toContain("retired option ignored: --project-type");
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual(["install", "--repo", "."]);
  }, 30_000);

  test("still consumes both tokens of the valued --hooks form", () => {
    const res = runSetup(["--hooks", "none", "--repo", "."]);
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual(["install", "--no-hooks", "--repo", "."]);
  }, 30_000);

  // Contract falsifier: the guard must not change consumption when the value is
  // present. `ts` must be swallowed by the --lsp branch, never forwarded. Both
  // the correct and the shift-1 version exit 0, so the forwarded argument list
  // is the only signal.
  test("still consumes both tokens of the valued --lsp form", () => {
    const res = runSetup(["--lsp", "ts", "--repo", "."]);
    expect(res.stderr).toContain("retired option ignored: --lsp ts");
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual(["install", "--repo", "."]);
    expect(res.forwarded).not.toContain("ts");
  }, 30_000);
});

describe("setup-plugins bun fallback path", () => {
  let bunStubDir = "";

  beforeAll(() => {
    bunStubDir = mkdtempSync(join(tmpdir(), "setup-plugins-bun-stub-"));
    const stub = join(bunStubDir, "bun");
    writeFileSync(
      stub,
      ["#!/bin/bash", 'for arg in "$@"; do', '  echo "STUB_ARG:$arg"', "done", ""].join("\n"),
      "utf-8",
    );
    chmodSync(stub, 0o755);
  });

  afterAll(() => {
    if (bunStubDir) rmSync(bunStubDir, { recursive: true, force: true });
  });

  /**
   * Run setup-plugins.sh with `repo-harness` unresolvable and a stub `bun`
   * first on PATH, so the `:34` branch is skipped and the `:38` bun fallback
   * executes. PATH is rebuilt from scratch (stub dir plus the system bin dirs
   * `dirname` needs) so neither the real `repo-harness` nor the real `bun` in
   * ~/.bun/bin can be resolved.
   */
  function runSetupViaBun(argv: string[]): {
    status: number | null;
    stdout: string;
    stderr: string;
    forwarded: string[];
  } {
    const res = spawnSync("/bin/bash", [SCRIPT_PATH, ...argv], {
      cwd: ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        PATH: `${bunStubDir}:/usr/bin:/bin`,
      },
    });
    const stdout = res.stdout ?? "";
    const marker = "STUB_ARG:";
    const forwarded = stdout
      .split("\n")
      .filter((line) => line.startsWith(marker))
      .map((line) => line.slice(marker.length));
    return { status: res.status, stdout, stderr: res.stderr ?? "", forwarded };
  }

  test("falls back to the bun entrypoint when repo-harness is unresolvable", () => {
    const res = runSetupViaBun(["--repo", "."]);
    expect(res.stderr).not.toContain("unbound variable");
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual([
      join(ROOT, "src/cli/index.ts"),
      "install",
      "--repo",
      ".",
    ]);
  }, 30_000);

  test("falls back to the bun entrypoint with no arguments", () => {
    const res = runSetupViaBun([]);
    expect(res.stderr).not.toContain("unbound variable");
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual([join(ROOT, "src/cli/index.ts"), "install"]);
  }, 30_000);

  test("falls back to the bun entrypoint when --hooks is the final argument", () => {
    const res = runSetupViaBun(["--repo", ".", "--hooks"]);
    expect(res.stderr).toContain("retired hook profile ignored: <missing>");
    expect(res.status).toBe(0);
    expect(res.forwarded).toEqual([
      join(ROOT, "src/cli/index.ts"),
      "install",
      "--repo",
      ".",
    ]);
  }, 30_000);
});
