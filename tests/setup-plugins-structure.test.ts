import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const SCRIPT_PATH = join(ROOT, "scripts/setup-plugins.sh");

function readSetup(): string {
  return readFileSync(SCRIPT_PATH, "utf-8");
}

describe("setup-plugins compatibility shim", () => {
  test("passes shell syntax check", () => {
    const res = spawnSync("bash", ["-n", SCRIPT_PATH], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stderr).toBe("");
  });

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
