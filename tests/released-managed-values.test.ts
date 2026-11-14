import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import {
  buildReleasedManagedValues,
  diffReleasedManagedValues,
  RELEASED_MANAGED_VALUES_PATH,
  renderReleasedManagedValues,
} from "../scripts/check-released-managed-values";
import { readReleasedManagedValues } from "../src/effects/upgrade/released-values";
import { MANAGED_PACKAGE_SCRIPTS } from "../src/core/adoption/package-scripts";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

const REPO_ROOT = resolve(import.meta.dir, "..");

describe("released managed values", () => {
  test("the committed list equals the list rebuilt from the release tags", async () => {
    const built = await buildReleasedManagedValues(REPO_ROOT);
    expect(built.releases[0]).toBe("v0.1.2");
    expect(built.packageScripts["check:context-files"]).toContain("bash .ai/harness/scripts/check-context-files.sh");
    expect(built.packageScripts["check:brain-manifest"]).toContain("repo-harness run check-brain-manifest");
    expect(renderReleasedManagedValues(built)).toBe(readFileSync(join(REPO_ROOT, RELEASED_MANAGED_VALUES_PATH), "utf8"));
  }, 180_000);

  test("the extractor reads the writers of the current tree as a release", async () => {
    const head = await buildReleasedManagedValues(REPO_ROOT, ["HEAD"]);
    for (const [key, value] of Object.entries(MANAGED_PACKAGE_SCRIPTS)) expect(head.packageScripts[key]).toEqual([value]);
  }, 60_000);

  test("a missing or malformed released values file fails closed", () => {
    const dir = tmpWorkspace("released-values-file");
    try {
      const valid = JSON.parse(readFileSync(join(REPO_ROOT, RELEASED_MANAGED_VALUES_PATH), "utf8"));
      const { legacySections: _, ...rulesWithoutSections } = valid.globalRulesBlock;
      const file = join(dir, "values.json");
      const rows: Array<readonly [string | null, string]> = [
        [null, "ENOENT"],
        ["{", "invalid JSON"],
        [JSON.stringify({ ...valid, packageScripts: { ...valid.packageScripts, "check:brain": "repo-harness brain check" } }), "$.packageScripts.check:brain must be an array of strings"],
        [JSON.stringify({ ...valid, globalRulesBlock: rulesWithoutSections }), "$.globalRulesBlock.legacySections must be an object"],
      ];
      for (const [text, error] of rows) {
        rmSync(file, { force: true });
        if (text !== null) writeFileSync(file, text);
        expect(() => readReleasedManagedValues(file)).toThrow(error);
      }
      writeFileSync(file, JSON.stringify(valid));
      expect(readReleasedManagedValues(file).packageScripts["check:brain"]).toEqual(valid.packageScripts["check:brain"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("drift names each missing and unexpected entry", () => {
    const expected = { packageScripts: { "sync:brain": ["repo-harness brain sync"] }, userExcludesBlock: { blocks: ["sha256:a"] } };
    const actual = { packageScripts: { "sync:brain": ["repo-harness brain sync", "custom"] }, userExcludesBlock: { blocks: [] } };
    expect(diffReleasedManagedValues(expected, actual)).toEqual([
      '$.packageScripts.sync:brain: unexpected "custom"',
      '$.userExcludesBlock.blocks: missing "sha256:a"',
    ]);
  });

  test("a renderer with an unknown source shape fails closed", async () => {
    const repoRoot = tmpWorkspace("released-managed-values");
    try {
      initGitRepo(repoRoot);
      mkdirSync(join(repoRoot, "scripts/lib"), { recursive: true });
      mkdirSync(join(repoRoot, "src/cli/commands"), { recursive: true });
      writeFileSync(join(repoRoot, "scripts/lib/project-init-lib.sh"), [
        "pi_factor_factory_gitignore_entries() { printf '%s\\n' .claude/.factor-cache/; }",
        "pi_default_runtime_block() { printf '%s\\n%s\\n%s\\n' '# BEGIN: x' \"$1\" '# END: x'; }",
        "pi_ensure_task_sync() {",
        'pkg.scripts["check:brain"] = "repo-harness brain check";',
        "}",
        "",
      ].join("\n"));
      writeFileSync(join(repoRoot, "src/cli/commands/init.ts"), [
        'const GLOBAL_RULES_BEGIN = "<!-- BEGIN: repo-harness global-working-rules -->";',
        "function renderGlobalRules(sourceRoot: string): string {",
        "  return sourceRoot;",
        "}",
        "",
      ].join("\n"));
      commitAll(repoRoot, "release");
      expect(run("git", ["tag", "v0.1.2"], repoRoot).status).toBe(0);
      await expect(buildReleasedManagedValues(repoRoot)).rejects.toThrow("v0.1.2: unknown global rules renderer");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
