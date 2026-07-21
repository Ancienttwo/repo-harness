import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { planAdoption } from "../../src/core/adoption/plan";
import { isRepoHarnessSourceCheckout } from "../../src/core/adoption/source-checkout";
import { applyAdoptionPlan, rollbackAdoptionTransaction } from "../../src/effects/fs-transaction";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");
const HRD09_LEGACY_FIXTURE = join(ROOT, "tests/fixtures/hrd09-legacy-hook-runtime");

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), "repo-harness-adoption-plan-"));
}

function cleanup(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

describe("canonical adoption plan", () => {
  test("standard plan is a complete repo-local projection and does not install root helpers", () => {
    const repo = tempRepo();
    try {
      const plan = planAdoption({ repoRoot: repo, mode: "standard" });
      expect(plan.operations.some((operation) => operation.path === ".ai/harness/policy.json")).toBe(true);
      const policyOperation = plan.operations.find((operation) => operation.path === ".ai/harness/policy.json");
      if (!policyOperation || policyOperation.kind !== "writeFile") {
        throw new Error("expected a writeFile operation for .ai/harness/policy.json");
      }
      const generatedPolicy = JSON.parse(policyOperation.content);
      expect(generatedPolicy.agentic_development.routing.design_options_choice).toBe("convention:design-options");
      expect(plan.operations.some((operation) => operation.path === ".ai/context/capabilities.json")).toBe(true);
      expect(plan.operations.some((operation) => operation.path === "deploy/README.md")).toBe(true);
      expect(plan.operations.some((operation) => operation.path === ".ai/hooks/README.md")).toBe(true);
      expect(plan.operations.some((operation) => operation.path?.startsWith("scripts/"))).toBe(false);
      expect(plan.operations.every((operation) => operation.rollback)).toBe(true);
      expect(plan.summary.requiresVerification).toBe(true);
    } finally {
      cleanup(repo);
    }
  });

  test("self-host source planning never schedules its canonical scripts for generated-runtime cleanup", () => {
    expect(isRepoHarnessSourceCheckout(ROOT)).toBe(true);
    const plan = planAdoption({ repoRoot: ROOT, mode: "standard" });
    expect(plan.summary.plannedTotal).toBe(0);
    expect(plan.operations).toEqual([]);
    expect(plan.warnings).toEqual([
      {
        code: "self-host-source-noop",
        message: "The repo-harness source checkout owns its workflow surfaces; downstream adopt is not applicable.",
        risk: "low",
      },
    ]);
  });

  test("source checkout detection requires the complete canonical package shape", () => {
    const repo = tempRepo();
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "repo-harness" }));
      expect(isRepoHarnessSourceCheckout(repo)).toBe(false);
    } finally {
      cleanup(repo);
    }
  });

  test("standard apply installs state, hooks, templates, package scripts, and a recoverable manifest", () => {
    const repo = tempRepo();
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "bun test" } }, null, 2));
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));

      expect(apply.ok).toBe(true);
      expect(apply.transactionManifestPath).toBeDefined();
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai", "harness", "policy.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai", "hooks", "lib", "workflow-state.sh"))).toBe(true);
      expect(existsSync(join(repo, ".claude", "templates", "contract.template.md"))).toBe(true);
      expect(existsSync(join(repo, "docs", "reference-configs", "harness-overview.md"))).toBe(true);
      expect(JSON.parse(readFileSync(join(repo, "package.json"), "utf-8")).scripts["check:task-workflow"]).toBe(
        "repo-harness run check-task-workflow --strict",
      );
      expect(readFileSync(join(repo, apply.transactionManifestPath!), "utf-8")).toContain('"command": "adopt"');
    } finally {
      cleanup(repo);
    }
  });

  test("one transaction retires exact legacy runtime and managed adapters, preserves mismatches, and rolls back", () => {
    const repo = tempRepo();
    try {
      cpSync(join(HRD09_LEGACY_FIXTURE, ".ai"), join(repo, ".ai"), { recursive: true });
      cpSync(join(HRD09_LEGACY_FIXTURE, "scripts"), join(repo, "scripts"), { recursive: true });
      const modifiedPath = ".ai/hooks/prompt-guard.sh";
      writeFileSync(join(repo, modifiedPath), `${readFileSync(join(repo, modifiedPath), "utf8")}# owner modification\n`);
      mkdirSync(join(repo, ".codex"), { recursive: true });
      mkdirSync(join(repo, ".claude"), { recursive: true });
      const codexBefore = {
        hooks: {
          PostToolUse: [{
            matcher: "Bash",
            hooks: [
              { type: "command", command: "repo-harness hook post-bash" },
              { type: "command", command: "bash scripts/custom-hook.sh" },
            ],
          }],
        },
        ownerField: true,
      };
      const claudeBefore = {
        hooks: {
          UserPromptSubmit: [{ hooks: [{ type: "command", command: ".ai/hooks/run-hook.sh prompt-guard.sh" }] }],
        },
        permissions: { allow: ["Bash(git status:*)"] },
      };
      writeFileSync(join(repo, ".codex/hooks.json"), `${JSON.stringify(codexBefore, null, 2)}\n`);
      writeFileSync(join(repo, ".claude/settings.json"), `${JSON.stringify(claudeBefore, null, 2)}\n`);

      const contract = JSON.parse(readFileSync(join(ROOT, "assets/workflow-contract.v1.json"), "utf8")) as {
        migrations: { upgrade: { actions: Array<{ id: string; paths: string[]; fingerprints: Record<string, string> }> } };
      };
      const retirement = contract.migrations.upgrade.actions.find((action) => action.id === "legacy-hook-runtime-retirement");
      if (!retirement) throw new Error("missing HRD-09 retirement action");
      for (const path of retirement.paths) {
        const fixtureBytes = readFileSync(join(HRD09_LEGACY_FIXTURE, path), "utf8");
        const digest = `sha256:${createHash("sha256").update(fixtureBytes).digest("hex")}`;
        expect(retirement.fingerprints[path]).toBe(digest);
      }

      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["add", ".ai/hooks", "scripts", ".codex", ".claude"], { cwd: repo }).status).toBe(0);
      const plan = planAdoption({ repoRoot: repo, mode: "standard", apply: true });
      const scheduledRetirements = plan.operations
        .filter((operation) => operation.kind === "remove" && retirement.paths.includes(operation.path))
        .map((operation) => operation.path);
      expect(scheduledRetirements).toHaveLength(retirement.paths.length - 1);
      expect(scheduledRetirements).not.toContain(modifiedPath);
      expect(plan.warnings.some((warning) => warning.code === "known-generated-fingerprint-mismatch" && warning.message.includes(modifiedPath))).toBe(true);

      const apply = applyAdoptionPlan(plan);
      expect(apply.ok).toBe(true);
      expect(apply.transactionManifestPath).toBeDefined();
      for (const path of retirement.paths) {
        expect(existsSync(join(repo, path))).toBe(path === modifiedPath);
      }
      const codexAfter = readFileSync(join(repo, ".codex/hooks.json"), "utf8");
      expect(codexAfter).not.toContain("repo-harness hook");
      expect(codexAfter).toContain("custom-hook.sh");
      expect(codexAfter).toContain("ownerField");
      const claudeAfter = readFileSync(join(repo, ".claude/settings.json"), "utf8");
      expect(claudeAfter).not.toContain("run-hook.sh");
      expect(claudeAfter).toContain("permissions");

      const rollback = rollbackAdoptionTransaction({ repoRoot: repo, transaction: apply.transactionManifestPath! });
      expect(rollback.ok).toBe(true);
      for (const path of retirement.paths) expect(existsSync(join(repo, path))).toBe(true);
      expect(JSON.parse(readFileSync(join(repo, ".codex/hooks.json"), "utf8"))).toEqual(codexBefore);
      expect(JSON.parse(readFileSync(join(repo, ".claude/settings.json"), "utf8"))).toEqual(claudeBefore);
    } finally {
      cleanup(repo);
    }
  });

  test("standard adoption directly replaces managed planning routes", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      writeFileSync(
        join(repo, ".ai", "harness", "policy.json"),
        JSON.stringify(
          {
            external_tooling: {
              gbrain: { mcp: "candidate-disabled" },
              routing: {
                complex: "gstack",
                simple: "waza",
                knowledge: "gbrain",
              },
            },
            agentic_development: {
              routing: {
                product_discovery: "gstack:office-hours",
                complex_engineering_plan: "gstack:plan-eng-review",
                design_plan: "gstack:plan-design-review",
              },
              due_diligence: {
                explicit_report_required_for: ["plan-eng-review", "shared_contract"],
              },
            },
          },
          null,
          2,
        ),
      );

      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      const policy = JSON.parse(readFileSync(join(repo, ".ai", "harness", "policy.json"), "utf-8"));
      expect(policy.external_tooling.routing).toEqual({ simple: "waza" });
      expect(policy.external_tooling).not.toHaveProperty("gbrain");
      expect(policy.agentic_development.routing).toMatchObject({
        product_discovery: "parent-agent:geju",
        complex_engineering_plan: "parent-agent:geju",
        design_plan: "parent-agent:geju",
      });
      expect(policy.agentic_development.due_diligence.explicit_report_required_for).toEqual([
        "complex_engineering_plan",
        "shared_contract",
      ]);
    } finally {
      cleanup(repo);
    }
  });

  test("standard adoption preserves mixed custom routes while cutting the declared legacy provider", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      writeFileSync(
        join(repo, ".ai", "harness", "policy.json"),
        JSON.stringify(
          {
            external_tooling: {
              routing: { complex: "retired-provider", simple: "waza", knowledge: "gbrain" },
            },
            agentic_development: {
              routing: {
                product_discovery: "custom:product-discovery",
                complex_engineering_plan: "retired-provider:architecture-review",
                design_plan: "custom:design-review",
              },
              due_diligence: {
                explicit_report_required_for: ["architecture-review", "shared_contract", "database_migration"],
              },
            },
          },
          null,
          2,
        ),
      );

      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      const policy = JSON.parse(readFileSync(join(repo, ".ai", "harness", "policy.json"), "utf-8"));
      expect(policy.external_tooling.routing).toEqual({ simple: "waza" });
      expect(policy.agentic_development.routing).toMatchObject({
        product_discovery: "custom:product-discovery",
        complex_engineering_plan: "parent-agent:geju",
        design_plan: "custom:design-review",
      });
      expect(policy.agentic_development.due_diligence.explicit_report_required_for).toEqual([
        "complex_engineering_plan",
        "shared_contract",
        "database_migration",
      ]);
    } finally {
      cleanup(repo);
    }
  });

  test("planner archives legacy workflow artifacts while preserving private _ops material and custom files", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "docs"), { recursive: true });
      mkdirSync(join(repo, "tasks", "sprints"), { recursive: true });
      mkdirSync(join(repo, "_ops", "scripts"), { recursive: true });
      mkdirSync(join(repo, "scripts"), { recursive: true });
      writeFileSync(join(repo, "docs", "plan.md"), "# Old plan\n");
      writeFileSync(join(repo, "tasks", "sprints", "release.sprint.md"), "# Sprint: Release\n");
      writeFileSync(join(repo, "_ops", "scripts", "deploy.sh"), "#!/bin/bash\n");
      writeFileSync(join(repo, "scripts", "app-owned.sh"), "#!/bin/bash\necho app\n");

      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      expect(readFileSync(join(repo, "plans", "archive", "legacy-docs-plan.md"), "utf-8")).toContain("# Old plan");
      expect(existsSync(join(repo, "docs", "plan.md.migrated.bak"))).toBe(true);
      expect(existsSync(join(repo, "plans", "sprints", "release.sprint.md"))).toBe(true);
      expect(existsSync(join(repo, "_ops", "scripts", "deploy.sh"))).toBe(true);
      expect(existsSync(join(repo, "deploy", "scripts", "deploy.sh"))).toBe(false);
      expect(readFileSync(join(repo, "scripts", "app-owned.sh"), "utf-8")).toContain("echo app");
    } finally {
      cleanup(repo);
    }
  });

  test("managed replacements keep user-authored reference docs intact", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "docs", "reference-configs"), { recursive: true });
      writeFileSync(join(repo, "docs", "reference-configs", "harness-overview.md"), "# Local Operations Guide\n");
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      expect(readFileSync(join(repo, "docs", "reference-configs", "harness-overview.md"), "utf-8")).toBe("# Local Operations Guide\n");
    } finally {
      cleanup(repo);
    }
  });

  test("planner leaves custom files in retired generated-helper paths untouched", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "scripts"), { recursive: true });
      mkdirSync(join(repo, ".codex"), { recursive: true });
      writeFileSync(join(repo, "scripts", "check-task-workflow.sh"), "#!/bin/bash\necho repo-harness custom\n");
      writeFileSync(join(repo, ".codex", "hooks.json"), '{"hooks":{"PostToolUse":"bash scripts/custom-hook.sh"}}\n');
      const plan = planAdoption({ repoRoot: repo, mode: "standard" });
      expect(plan.operations.some((operation) => operation.path === "scripts/check-task-workflow.sh")).toBe(false);
      expect(plan.operations.some((operation) => operation.path === ".codex/hooks.json")).toBe(false);
      expect(applyAdoptionPlan(plan).ok).toBe(true);
      expect(readFileSync(join(repo, ".codex", "hooks.json"), "utf-8")).toContain("custom-hook.sh");
    } finally {
      cleanup(repo);
    }
  });

  test("legacy todo archive collisions fail closed before normalization", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "tasks", "archive"), { recursive: true });
      writeFileSync(join(repo, "tasks", "todos.md"), "# Old Todo\n");
      writeFileSync(join(repo, "tasks", "archive", "legacy-tasks-todo.md"), "# User archive\n");
      expect(() => planAdoption({ repoRoot: repo, mode: "standard" })).toThrow("legacy archive collision");
      expect(readFileSync(join(repo, "tasks", "todos.md"), "utf-8")).toBe("# Old Todo\n");
    } finally {
      cleanup(repo);
    }
  });

  test("legacy document and research archive collisions fail closed before retirement", () => {
    const documentRepo = tempRepo();
    const researchRepo = tempRepo();
    try {
      mkdirSync(join(documentRepo, "docs"), { recursive: true });
      mkdirSync(join(documentRepo, "tasks", "archive"), { recursive: true });
      writeFileSync(join(documentRepo, "docs", "TODO.md"), "# Legacy todo\n");
      writeFileSync(join(documentRepo, "tasks", "archive", "legacy-docs-TODO.md"), "# Different user archive\n");
      expect(() => planAdoption({ repoRoot: documentRepo, mode: "standard" })).toThrow("legacy archive collision");
      expect(readFileSync(join(documentRepo, "docs", "TODO.md"), "utf-8")).toBe("# Legacy todo\n");

      mkdirSync(join(researchRepo, "tasks"), { recursive: true });
      mkdirSync(join(researchRepo, "docs", "researches"), { recursive: true });
      writeFileSync(join(researchRepo, "tasks", "research.md"), "# Legacy research\n");
      writeFileSync(join(researchRepo, "docs", "researches", "legacy-research-notes.md"), "# Different user archive\n");
      expect(() => planAdoption({ repoRoot: researchRepo, mode: "standard" })).toThrow("legacy archive collision");
      expect(readFileSync(join(researchRepo, "tasks", "research.md"), "utf-8")).toBe("# Legacy research\n");
    } finally {
      cleanup(documentRepo);
      cleanup(researchRepo);
    }
  });

  test("atomic replacements preserve an existing private file mode", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      const target = join(repo, ".ai", "harness", "workflow-contract.json");
      writeFileSync(target, "{}\n", { mode: 0o600 });
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "minimal", apply: true }));
      expect(apply.ok).toBe(true);
      expect(statSync(target).mode & 0o777).toBe(0o600);
      const manifest = JSON.parse(readFileSync(join(repo, apply.transactionManifestPath!), "utf-8")) as { operations: Array<{ path?: string; backupPath?: string }> };
      const backup = manifest.operations.find((operation) => operation.path === ".ai/harness/workflow-contract.json")?.backupPath;
      expect(backup).toBeDefined();
      expect(statSync(join(repo, backup!)).mode & 0o777).toBe(0o600);
    } finally {
      cleanup(repo);
    }
  });

  test("self-host is rejected before the standard scaffold is created", () => {
    const repo = tempRepo();
    try {
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "self-host", apply: true }));
      expect(apply.ok).toBe(false);
      expect(apply.results.some((result) => result.id.includes("self-host-adoption-boundary-review") && result.status === "failed")).toBe(true);
      expect(existsSync(join(repo, "docs", "spec.md"))).toBe(false);
      expect(apply.transactionManifestPath).toBeDefined();
    } finally {
      cleanup(repo);
    }
  });

  test("apply refuses a target created after planning instead of overwriting it", () => {
    const repo = tempRepo();
    try {
      const plan = planAdoption({ repoRoot: repo, mode: "standard", apply: true });
      mkdirSync(join(repo, "docs"), { recursive: true });
      writeFileSync(join(repo, "docs", "spec.md"), "# User-authored after planning\n");
      const apply = applyAdoptionPlan(plan);
      expect(apply.ok).toBe(false);
      expect(apply.results.find((result) => result.path === "docs/spec.md")?.error).toContain("created after planning");
      expect(readFileSync(join(repo, "docs", "spec.md"), "utf-8")).toBe("# User-authored after planning\n");
    } finally {
      cleanup(repo);
    }
  });

  test("preflight symlink failures never write a transaction manifest outside the repo", () => {
    const repo = tempRepo();
    const outside = tempRepo();
    try {
      const plan = planAdoption({ repoRoot: repo, mode: "minimal", apply: true });
      symlinkSync(outside, join(repo, ".ai"));
      const apply = applyAdoptionPlan(plan);
      expect(apply.ok).toBe(false);
      expect(apply.transactionManifestPath).toBeUndefined();
      expect(existsSync(join(outside, "harness", "backups", "fs-transaction"))).toBe(false);
    } finally {
      cleanup(repo);
      cleanup(outside);
    }
  });

  test("manifest path failures stop before repo mutations and report the missing recovery evidence", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      writeFileSync(join(repo, ".ai", "harness", "backups"), "not a directory\n");
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "minimal", apply: true }));
      expect(apply.ok).toBe(false);
      expect(apply.results.find((result) => result.id === "transaction-manifest")?.error).toContain("parent is not a directory");
      expect(existsSync(join(repo, "docs", "spec.md"))).toBe(false);
      expect(apply.transactionManifestPath).toBeUndefined();
    } finally {
      cleanup(repo);
    }
  });

  test("rollback restores a legacy move only when its destination has not changed", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "docs"), { recursive: true });
      writeFileSync(join(repo, "docs", "plan.md"), "# Old plan\n");
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      const rollback = rollbackAdoptionTransaction({ repoRoot: repo, transaction: apply.transactionManifestPath! });
      expect(rollback.ok).toBe(true);
      expect(readFileSync(join(repo, "docs", "plan.md"), "utf-8")).toBe("# Old plan\n");
    } finally {
      cleanup(repo);
    }
  });

  test("rollback refuses symlinked destinations without writing outside the repo", () => {
    const repo = tempRepo();
    const outside = tempRepo();
    try {
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "minimal", apply: true }));
      expect(apply.ok).toBe(true);
      rmSync(join(repo, "docs"), { recursive: true, force: true });
      symlinkSync(outside, join(repo, "docs"));
      const rollback = rollbackAdoptionTransaction({ repoRoot: repo, transaction: apply.transactionManifestPath! });
      expect(rollback.ok).toBe(false);
      expect(rollback.results.some((result) => result.error?.includes("symlink is not allowed"))).toBe(true);
      expect(existsSync(join(outside, "spec.md"))).toBe(false);
    } finally {
      cleanup(repo);
      cleanup(outside);
    }
  });

  test("rollback restores the git index after a generated helper is untracked", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "scripts"), { recursive: true });
      const helper = "scripts/check-task-workflow.sh";
      writeFileSync(join(repo, helper), readFileSync(join(ROOT, "assets", "templates", "helpers", "check-task-workflow.sh"), "utf-8"));
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["add", helper], { cwd: repo }).status).toBe(0);
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      expect(existsSync(join(repo, helper))).toBe(false);
      const rollback = rollbackAdoptionTransaction({ repoRoot: repo, transaction: apply.transactionManifestPath! });
      expect(rollback.ok).toBe(true);
      expect(spawnSync("git", ["ls-files", "--error-unmatch", "--", helper], { cwd: repo }).status).toBe(0);
    } finally {
      cleanup(repo);
    }
  });
});

describe("adopt command cutover", () => {
  test("dry-run is structured and leaves the target untouched", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "adopt", "--repo", repo, "--dry-run", "--json"], { cwd: ROOT, encoding: "utf-8" });
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout) as { apply: boolean; operations: unknown[] };
      expect(payload.apply).toBe(false);
      expect(payload.operations.length).toBeGreaterThan(50);
      expect(existsSync(join(repo, ".ai"))).toBe(false);
    } finally {
      cleanup(repo);
    }
  });

  test("ordinary minimal apply uses the TypeScript transaction and retired experimental flag is absent", () => {
    const repo = tempRepo();
    const home = tempRepo();
    try {
      const apply = spawnSync("bun", [CLI, "adopt", "--repo", repo, "--mode", "minimal", "--no-verify", "--no-codegraph", "--json"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: { ...process.env, REPO_HARNESS_HOME: home },
      });
      expect(apply.status).toBe(0);
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(true);
      const retired = spawnSync("bun", [CLI, "adopt", "--experimental-ts-apply"], { cwd: ROOT, encoding: "utf-8" });
      expect(retired.status).toBe(1);
      expect(retired.stderr).toContain("unknown option");
    } finally {
      cleanup(repo);
      cleanup(home);
    }
  });

  test("retired reclaim and compact flags have no compatibility CLI surface", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "adopt", "--repo", repo, "--reclaim-runtime"], { cwd: ROOT, encoding: "utf-8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unknown option '--reclaim-runtime'");
      const compact = spawnSync("bun", [CLI, "adopt", "--repo", repo, "--compact"], { cwd: ROOT, encoding: "utf-8" });
      expect(compact.status).toBe(1);
      expect(compact.stderr).toContain("unknown option '--compact'");
      expect(existsSync(join(repo, ".ai"))).toBe(false);
    } finally {
      cleanup(repo);
    }
  });

  test("interactive adopt is rejected before it can configure user-level runtime state", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "adopt", "--repo", repo, "--interactive"], { cwd: ROOT, encoding: "utf-8" });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("user-level runtime state");
      expect(existsSync(join(repo, ".ai"))).toBe(false);
    } finally {
      cleanup(repo);
    }
  });
});
