import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");
const SCRIPT = join(ROOT, "scripts/ensure-codegraph.sh");

function runJson(command: string, args: string[]) {
  const res = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf-8",
  });
  expect(res.status).toBe(0);
  return JSON.parse(res.stdout);
}

describe("CodeGraph tooling integration", () => {
  test("repository CodeGraph dependency is an exact pin and matches the local binary", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
      devDependencies: Record<string, string>;
    };
    const pinnedVersion = manifest.devDependencies["@colbymchenry/codegraph"];
    expect(pinnedVersion).toMatch(/^\d+\.\d+\.\d+$/);

    const local = spawnSync(join(ROOT, "node_modules/.bin/codegraph"), ["--version"], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    expect(local.status).toBe(0);
    expect(local.stdout).toContain(pinnedVersion);
  });

  test("shell adapter and CLI tools command share the same readiness model", () => {
    const viaScript = runJson("bash", [SCRIPT, "--check", "--json"]);
    const viaCli = runJson("bun", [CLI, "tools", "ensure", "codegraph", "--check", "--json"]);

    expect(viaScript.read_only).toBe(true);
    expect(viaCli.read_only).toBe(true);
    expect(viaScript.changed).toBe(false);
    expect(viaCli.changed).toBe(false);
    expect(viaCli.codegraph.name).toBe(viaScript.codegraph.name);
    expect(viaCli.codegraph.source).toBe(viaScript.codegraph.source);
    expect(viaCli.codegraph.project_index.command).toBe(viaScript.codegraph.project_index.command);
    expect(viaCli.actions).toEqual([]);
  }, 30000);
});
