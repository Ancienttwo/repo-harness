import { describe, expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { planAdoption } from "../../src/effects/adoption/plan";
import { planLegacyLeftovers, RETIRED_RUNTIME_IGNORE_RULES } from "../../src/effects/upgrade/legacy-inventory";
import { GITIGNORE_MANAGED_BLOCK_CONTENT } from "../../src/effects/adoption/gitignore-plan";
import { isRepoHarnessSourceCheckout } from "../../src/effects/source-checkout";
import { applyAdoptionPlan, rollbackAdoptionTransaction } from "../../src/effects/fs-transaction";
import type { AdoptionOperation, AdoptionPlan } from "../../src/core/adoption/operations";
import { planRepoAdoption, renderApplyReport, runAdoptionApply } from "../../src/cli/commands/adoption-plan";

const ROOT = join(import.meta.dir, "..", "..");
const FS_TRANSACTION = join(ROOT, "src/effects/fs-transaction.ts");
const CLI = join(ROOT, "src/cli/index.ts");
const HRD09_LEGACY_FIXTURE = join(ROOT, "tests/fixtures/hrd09-legacy-hook-runtime");

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "repo-harness-adoption-plan-"));
}

function tempRepo(): string {
  const repo = tempDir();
  expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
  return repo;
}

function cleanup(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

function planWith(repo: string, operations: readonly AdoptionOperation[]): AdoptionPlan {
  return { ...planAdoption({ repoRoot: repo, mode: "minimal" }), apply: true, operations };
}

const COPIED_TEMPLATE_PATHS = [
  "docs/prds/prd.template.md",
  ".claude/templates/research.template.md",
  ".claude/templates/spec.template.md",
  ".claude/templates/design-brief.template.md",
  ".ai/hooks/README.md",
];

function writeOperation(path: string, content: string): AdoptionOperation {
  return { id: `writeFile:${path}`, kind: "writeFile", path, content, reason: "test", risk: "low", status: "planned" };
}

describe("canonical adoption plan", () => {
  test("init removes every policy key outside the schema, keeps schema values byte-equal and converges", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, ".ai/harness"), { recursive: true });
      const owner = `{
  "publication": { "acceptance_merge": "on", "generated_artifacts": {"x": 1} },
  "operations": { "agent_writable_private_dirs": ["_ops/notes"], "dir": "deploy" },
  "external_tooling": { "herdr": { "url": "u" }, "agent_fleet": { "managed_agents": ["explorer", "orchestrator"] } },
  "sidecar_research": { "default": true },
  "guards": { "edit_plan_gate": "off" },
  "enforcement": { "worktree_guard": "advisory" },
  "merge_gate": { "enabled": true },
  "agentic_development": { "routing": { "simple": "waza" } },
  "context": { "capability_source": "archcontext", "capability_match_rule": "old" },
  "worktree_strategy": { "base_branch": "trunk", "worktree_dir_template": "../{{repo}}-wt-{{slug}}" }
}
`;
      writeFileSync(join(repo, ".ai/harness/policy.json"), owner);
      const plan = planAdoption({ repoRoot: repo, mode: "standard", apply: true });
      expect(plan.warnings).toContainEqual({
        code: "unknown-policy-keys",
        message: "Removed policy keys that no reader uses: agentic_development.routing.simple, context.capability_match_rule, enforcement.worktree_guard, external_tooling.herdr.url, guards.edit_plan_gate, merge_gate.enabled, operations.dir, sidecar_research.default, worktree_strategy.worktree_dir_template",
        risk: "medium",
      });
      expect(applyAdoptionPlan(plan).ok).toBe(true);
      const text = readFileSync(join(repo, ".ai/harness/policy.json"), "utf8");
      expect(text).toContain(`"publication": { "acceptance_merge": "on", "generated_artifacts": {"x": 1} }`);
      expect(text).toContain(`"agent_writable_private_dirs": ["_ops/notes"]`);
      expect(JSON.parse(text)).toEqual({
        publication: { acceptance_merge: "on", generated_artifacts: { x: 1 } },
        operations: { agent_writable_private_dirs: ["_ops/notes"] },
        external_tooling: { agent_fleet: { managed_agents: ["explorer", "orchestrator"] } },
        context: { capability_source: "archcontext" },
        worktree_strategy: { base_branch: "trunk" },
        documentation: { language: "en" },
        internal_pr_authors: [],
      });
      const next = planAdoption({ repoRoot: repo, mode: "standard" });
      expect(next.summary.plannedTotal).toBe(0);
      expect(next.warnings.map(warning => warning.code)).not.toContain("unknown-policy-keys");
      // Minimal mode runs the same removal on an existing policy and creates none.
      writeFileSync(join(repo, ".ai/harness/policy.json"), JSON.stringify({ version: 1, internal_pr_authors: [] }));
      const minimal = planAdoption({ repoRoot: repo, mode: "minimal" });
      const minimalPolicy = minimal.operations.find(op => op.path === ".ai/harness/policy.json");
      if (!minimalPolicy || minimalPolicy.kind !== "writeFile") throw new Error("policy operation missing");
      expect(JSON.parse(minimalPolicy.content)).not.toHaveProperty("version");
      expect(minimal.warnings.map(warning => warning.message)).toContain("Removed policy keys that no reader uses: version");
      // A schema section stays when the removal empties it.
      writeFileSync(join(repo, ".ai/harness/policy.json"), JSON.stringify({ worktree_strategy: { merge_back: { requires_clean_check: true } }, publication: { obsolete: true } }));
      const emptied = planAdoption({ repoRoot: repo, mode: "minimal" });
      const emptiedPolicy = emptied.operations.find(op => op.path === ".ai/harness/policy.json");
      if (!emptiedPolicy || emptiedPolicy.kind !== "writeFile") throw new Error("policy operation missing");
      expect(JSON.parse(emptiedPolicy.content)).toMatchObject({ worktree_strategy: { merge_back: {} }, publication: {} });
      expect(JSON.parse(emptiedPolicy.content).publication).toEqual({});
      expect(emptied.warnings.map(warning => warning.message)).toContain("Removed policy keys that no reader uses: publication.obsolete, worktree_strategy.merge_back.requires_clean_check");
    } finally { cleanup(repo); }
  });

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
      expect(Object.keys(generatedPolicy)).toEqual(["context", "worktree_strategy", "documentation", "internal_pr_authors"]);
      expect(generatedPolicy.context).toEqual({ capability_source: "registry" });
      expect(Object.keys(generatedPolicy.worktree_strategy)).toEqual(["base_branch", "review_base", "merge_back"]);
      expect(plan.operations.some((operation) => operation.path === ".ai/context/capabilities.json")).toBe(true);
      expect(plan.operations.some((operation) => operation.path === "deploy/README.md")).toBe(true);
      for (const path of COPIED_TEMPLATE_PATHS) expect(plan.operations.some((operation) => operation.path === path)).toBe(false);
      expect(plan.operations.some((operation) => operation.path?.startsWith("scripts/"))).toBe(false);
      expect(plan.operations.every((operation) => operation.rollback)).toBe(true);
      expect(plan.summary.requiresVerification).toBe(true);
    } finally {
      cleanup(repo);
    }
  });

  test("init removes byte-equal copies of released templates and keeps an edited one", () => {
    const repo = tempRepo();
    try {
      const sources: Record<string, string> = {
        "docs/prds/prd.template.md": readFileSync(join(ROOT, "assets/templates/prd.template.md"), "utf8"),
        ".claude/templates/research.template.md": readFileSync(join(ROOT, "assets/templates/research.template.md"), "utf8"),
        ".claude/templates/spec.template.md": readFileSync(join(ROOT, "assets/templates/spec.template.md"), "utf8"),
        // The released bytes: before 0.33.0 the template named the `repo-harness` command.
        ".claude/templates/design-brief.template.md": readFileSync(join(ROOT, "assets/templates/design-brief.template.md"), "utf8").replace("`rh docs show", "`repo-harness docs show"),
        ".ai/hooks/README.md": "# Workflow Helpers\n\nHost events use the user-level `repo-harness-hook` typed runtime. Operator helpers run from the installed package: use `repo-harness run <helper>`. Init preserves legacy files under `.ai/hooks/lib/`. Run `repo-harness doctor` for migration guidance.\n",
      };
      for (const [path, content] of Object.entries(sources)) {
        mkdirSync(dirname(join(repo, path)), { recursive: true });
        writeFileSync(join(repo, path), content);
      }
      const removes = (plan: AdoptionPlan) => plan.operations.filter((op) => op.kind === "remove").map((op) => op.path);
      expect(removes(planAdoption({ repoRoot: repo, mode: "standard" })).sort()).toEqual([...COPIED_TEMPLATE_PATHS].sort());
      writeFileSync(join(repo, "docs/prds/prd.template.md"), `${sources["docs/prds/prd.template.md"]}\nTeam section\n`);
      const edited = planAdoption({ repoRoot: repo, mode: "standard" });
      expect(edited.operations.filter((op) => op.path === "docs/prds/prd.template.md")).toEqual([]);
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
        message: "The repo-harness source checkout owns its workflow surfaces; downstream init is not applicable.",
        risk: "low",
      },
    ]);
  });

  test("source checkout detection requires the complete canonical package shape", () => {
    const repo = tempRepo();
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "repo-harness" }));
      expect(isRepoHarnessSourceCheckout(repo)).toBe(false);
      // A checkout before the rh rename declares the same CLI entry under the repo-harness bin.
      for (const path of ["assets/workflow-contract.v1.json", "scripts/check-ci.sh", "src/cli/index.ts", "src/cli/hook-entry.ts", "src/effects/adoption/standard-plan.ts"]) {
        mkdirSync(dirname(join(repo, path)), { recursive: true });
        writeFileSync(join(repo, path), "");
      }
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "repo-harness", bin: { "repo-harness": "src/cli/index.ts", "repo-harness-hook": "dist/hook-entry.js" } }));
      expect(isRepoHarnessSourceCheckout(repo)).toBe(true);
    } finally {
      cleanup(repo);
    }
  });

  test("standard apply installs state, hooks, templates, package scripts, and a recoverable manifest", () => {
    const repo = tempRepo();
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fixture", scripts: {
        test: "bun test",
      } }, null, 2));
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));

      expect(apply.ok).toBe(true);
      expect(JSON.parse(readFileSync(join(repo, '.ai/harness/policy.json'), 'utf8')).agent_runtime).toBeUndefined();
      expect(apply.transactionManifestPath).toBeDefined();
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai", "harness", "policy.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai", "hooks", "lib", "workflow-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude", "templates", "contract.template.md"))).toBe(false);
      expect(existsSync(join(repo, "tasks", "contracts"))).toBe(false);
      expect(existsSync(join(repo, "docs", "reference-configs", "harness-overview.md"))).toBe(true);
      const scripts = JSON.parse(readFileSync(join(repo, "package.json"), "utf-8")).scripts;
      expect(scripts["check:task-workflow"]).toBeUndefined();
      expect(scripts.test).toBe("bun test");
      expect(scripts["check:task-sync"]).toBeUndefined();
      for (const name of ["AGENTS.md", "CLAUDE.md"]) {
        const context = readFileSync(join(repo, name), "utf-8");
        expect(context).toContain("repo-harness-issue-flow");
        expect(context).toContain("docs/architecture/archimap.html");
        expect(context).toContain("Keep four hard boundaries");
        expect(context).toContain("Review by risk");
        expect(context).toContain("rh run contract-worktree start --issue <number>");
        expect(context).not.toContain("--plan <plan-file>");
        expect(context).not.toContain("Write a plan before");
      }
      expect(existsSync(join(repo, "docs", "architecture", "snapshots"))).toBe(false);
      expect(existsSync(join(repo, "docs", "architecture", "domains"))).toBe(false);
      expect(readFileSync(join(repo, "docs", "architecture", "index.md"), "utf-8")).not.toContain("Latest snapshot");
      // The evidence rule lives in the user-level runtime-state block, not the tracked block.
      expect(readFileSync(join(ROOT, "assets/templates/runtime-state.gitignore"), "utf-8")).toContain(".ai/harness/evidence/");
      expect(readFileSync(join(repo, ".gitignore"), "utf-8")).not.toContain(".ai/harness/evidence/");
      expect(readFileSync(join(repo, apply.transactionManifestPath!), "utf-8")).toContain('"command": "adopt"');
    } finally {
      cleanup(repo);
    }
  });

  test("init refresh keeps a retired runtime ignore rule while its files exist and lists them as leftovers", () => {
    const repo = tempRepo();
    try {
      expect(spawnSync("git", ["init", "-q", repo]).status).toBe(0);
      // Rules that the 0.24 managed block held and 0.25.0 dropped (#1307).
      const oldRules = [".claude/.session-id", ".claude/.trace.jsonl", ".claude/.codegraph-state/", ".ai/harness/handoff/current.md",
        ".ai/harness/handoff/resume.md", ".ai/harness/active-plan", ".ai/harness/sprint/", ".claude/.active-plan", ".claude/.plan-state/", "tasks/current.md"];
      const codegraph = ".claude/.codegraph-state/index.used";
      const retired = [".claude/.session-id", ".claude/.trace.jsonl", ".ai/harness/handoff/current.md", ".ai/harness/handoff/resume.md",
        ".ai/harness/active-plan", ".ai/harness/sprint/s1.md", ".claude/.active-plan", ".claude/.plan-state/plan.json", "tasks/current.md"];
      for (const path of [codegraph, ...retired]) {
        mkdirSync(join(repo, dirname(path)), { recursive: true });
        writeFileSync(join(repo, path), "old runtime state\n");
      }
      // The block as a release rendered it: the base block and a retired-rule section.
      const releasedRetired = ["", "# Retired runtime state that still exists; repo-harness upgrade lists these files", ...RETIRED_RUNTIME_IGNORE_RULES.slice(0, -1)];
      writeFileSync(join(repo, ".gitignore"), ["# BEGIN: repo-harness generated-runtime", GITIGNORE_MANAGED_BLOCK_CONTENT, ...releasedRetired, "# END: repo-harness generated-runtime", ""].join("\n"));
      const untracked = () => spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", codegraph, ...retired], { cwd: repo, encoding: "utf8" }).stdout;
      const refresh = () => expect(applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true })).ok).toBe(true);

      refresh();
      expect(untracked()).toBe("");
      // A file that a retirement action already lists keeps that item; every other file gets a runtime-rule item.
      const leftovers = planLegacyLeftovers({ scope: "project", cwd: repo, home: join(repo, "no-home"), packageRoot: ROOT, installOwnership: () => [] }).items;
      for (const path of retired) {
        expect(leftovers.find((item) => item.path === join(repo, path))).toEqual(expect.objectContaining({ action: "report", ownership: "unowned" }));
      }
      expect(leftovers.filter((item) => item.retiredBy === "retired-runtime-ignore-rule")).toHaveLength(7);
      expect(leftovers.some((item) => item.path.includes(".codegraph-state"))).toBe(false);

      for (const path of retired) rmSync(join(repo, path));
      refresh();
      const rules = readFileSync(join(repo, ".gitignore"), "utf-8").split("\n");
      expect(rules).toContain(".claude/.codegraph-state/");
      for (const rule of oldRules.filter((rule) => rule !== ".claude/.codegraph-state/")) expect(rules).not.toContain(rule);
      expect(untracked()).toBe("");
    } finally {
      cleanup(repo);
    }
  });

  test("minimal and standard init preserve existing contract artifacts without generating them", () => {
    for (const mode of ["minimal", "standard"] as const) {
      const repo = tempRepo();
      try {
        expect(applyAdoptionPlan(planAdoption({ repoRoot: repo, mode, apply: true })).ok).toBe(true);
        expect(existsSync(join(repo, "tasks/contracts"))).toBe(false);
        expect(existsSync(join(repo, ".claude/templates/contract.template.md"))).toBe(false);
        mkdirSync(join(repo, "tasks/contracts"), { recursive: true });
        mkdirSync(join(repo, ".claude/templates"), { recursive: true });
        writeFileSync(join(repo, "tasks/contracts/history.contract.md"), "# Historical contract\n");
        writeFileSync(join(repo, ".claude/templates/contract.template.md"), "# Local contract template\n");
        expect(applyAdoptionPlan(planAdoption({ repoRoot: repo, mode, apply: true })).ok).toBe(true);
        expect(readFileSync(join(repo, "tasks/contracts/history.contract.md"), "utf8")).toBe("# Historical contract\n");
        expect(readFileSync(join(repo, ".claude/templates/contract.template.md"), "utf8")).toBe("# Local contract template\n");
      } finally { cleanup(repo); }
    }
  });

  test("standard plan rewrites only the changed package.json members and keeps the user's formatting", () => {
    const repo = tempRepo();
    const packageOperation = () => {
      const operation = planAdoption({ repoRoot: repo, mode: "standard" }).operations.find((op) => op.path === "package.json");
      if (!operation || operation.kind !== "writeFile") throw new Error("package.json operation missing");
      return operation;
    };
    try {
      writeFileSync(join(repo, "package.json"), [
        "{", '\t"name": "fixture",', '    "scripts": {', '\t\t"test": "bun test",',
        '        "check:task-workflow": "repo-harness run check-task-workflow --strict",',
        '\t\t"check:context-files": "bash scripts/check-context-files.sh"', "\t}", "}", "",
      ].join("\n"));
      const mixed = packageOperation();
      expect(mixed.content).toBe([
        "{", '\t"name": "fixture",', '    "scripts": {', '\t\t"test": "bun test",',
        '\t\t"check:context-files": "rh run check-context-files",',
        '\t\t"check:brain": "rh brain check",',
        '\t\t"check:deploy-sql": "rh run check-deploy-sql-order",',
        '\t\t"sync:brain": "rh brain sync"', "\t},", '    "private": true', "}", "",
      ].join("\n"));
      writeFileSync(join(repo, "package.json"), mixed.content);
      expect(packageOperation().status).toBe("skipped");

      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fixture" }));
      expect(packageOperation().content).toBe(JSON.stringify({ name: "fixture", private: true, scripts: {
        "check:brain": "rh brain check",
        "check:context-files": "rh run check-context-files",
        "check:deploy-sql": "rh run check-deploy-sql-order",
        "sync:brain": "rh brain sync",
      } }));
    } finally {
      cleanup(repo);
    }
  });

  test("standard apply preserves a custom task workflow script", () => {
    const repo = tempRepo();
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({
        name: "fixture", scripts: { "check:task-workflow": "bun run custom-workflow.ts" },
      }));
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      expect(JSON.parse(readFileSync(join(repo, "package.json"), "utf-8")).scripts["check:task-workflow"])
        .toBe("bun run custom-workflow.ts");
    } finally {
      cleanup(repo);
    }
  });

  test("standard apply renames the generated brain package scripts and keeps customized ones", () => {
    const generated = tempRepo();
    const customized = tempRepo();
    try {
      writeFileSync(join(generated, "package.json"), JSON.stringify({ name: "fixture", scripts: {
        "check:brain-manifest": "repo-harness run check-brain-manifest",
        "sync:brain-docs": "repo-harness run sync-brain-docs --all",
      } }, null, 2));
      expect(applyAdoptionPlan(planAdoption({ repoRoot: generated, mode: "standard", apply: true })).ok).toBe(true);
      const generatedScripts = JSON.parse(readFileSync(join(generated, "package.json"), "utf-8")).scripts;
      expect(generatedScripts["check:brain-manifest"]).toBeUndefined();
      expect(generatedScripts["sync:brain-docs"]).toBeUndefined();
      expect(generatedScripts["check:brain"]).toBe("rh brain check");
      expect(generatedScripts["sync:brain"]).toBe("rh brain sync");

      writeFileSync(join(customized, "package.json"), JSON.stringify({ name: "fixture", scripts: {
        "check:brain-manifest": "repo-harness run check-brain-manifest",
        "sync:brain-docs": "bun run custom-sync-brain.ts",
        "check:deploy-sql": "bash my-sql-check.sh",
      } }, null, 2));
      const customizedPlan = planAdoption({ repoRoot: customized, mode: "standard", apply: true });
      expect(customizedPlan.warnings.find((warning) => warning.code === "customized-managed-value")?.message)
        .toBe('Preserving package.json scripts that differ from every released value: sync:brain-docs: "bun run custom-sync-brain.ts"; '
          + 'check:deploy-sql: "bash my-sql-check.sh" (current value: "rh run check-deploy-sql-order")');
      expect(applyAdoptionPlan(customizedPlan).ok).toBe(true);
      const customizedScripts = JSON.parse(readFileSync(join(customized, "package.json"), "utf-8")).scripts;
      expect(customizedScripts["check:brain-manifest"]).toBeUndefined();
      expect(customizedScripts["sync:brain-docs"]).toBe("bun run custom-sync-brain.ts");
      expect(customizedScripts["check:deploy-sql"]).toBe("bash my-sql-check.sh");
      expect(customizedScripts["check:brain"]).toBe("rh brain check");
      expect(customizedScripts["sync:brain"]).toBe("rh brain sync");
    } finally {
      cleanup(generated);
      cleanup(customized);
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
              { type: "command", command: 'repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; HOOK_HOST=codex HOOK_REPO_ROOT="$repo" bash "$repo/.ai/hooks/run-hook.sh" post-bash.sh' },
              { type: "command", command: "bash scripts/custom-hook.sh" },
            ],
          }],
        },
        ownerField: true,
      };
      const claudeBefore = {
        hooks: {
          UserPromptSubmit: [{ hooks: [{ type: "command", command: 'repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; HOOK_REPO_ROOT="$repo" bash "$repo/.ai/hooks/run-hook.sh" prompt-guard.sh' }] }],
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
      expect(codexAfter).not.toContain("run-hook.sh");
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
  }, 30_000);

  test("planner leaves user-authored plans, legacy workflow documents and PRDs untouched", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "docs", "prds"), { recursive: true });
      mkdirSync(join(repo, "plans"), { recursive: true });
      mkdirSync(join(repo, "tasks", "sprints"), { recursive: true });
      mkdirSync(join(repo, "_ops", "scripts"), { recursive: true });
      mkdirSync(join(repo, "scripts"), { recursive: true });
      const userFiles: Record<string, string> = {
        "docs/plan.md": "# Old plan\n",
        "docs/TODO.md": "# Old todo\n",
        "docs/prds/example.prd.md": "# PRD: Example\n",
        "plans/plan-20260101-user.md": "# User plan\n",
        "tasks/sprints/release.sprint.md": "# Sprint: Release\n",
        "_ops/scripts/deploy.sh": "#!/bin/bash\n",
        "scripts/app-owned.sh": "#!/bin/bash\necho app\n",
      };
      for (const [path, bytes] of Object.entries(userFiles)) writeFileSync(join(repo, path), bytes);

      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      for (const [path, bytes] of Object.entries(userFiles)) expect(readFileSync(join(repo, path), "utf-8")).toBe(bytes);
      expect(existsSync(join(repo, "plans", "archive"))).toBe(false);
      expect(existsSync(join(repo, "tasks", "archive"))).toBe(false);
      expect(existsSync(join(repo, "docs", "plan.md.migrated.bak"))).toBe(false);
      expect(existsSync(join(repo, "deploy", "scripts", "deploy.sh"))).toBe(false);
    } finally {
      cleanup(repo);
    }
  });

  test("managed replacements keep user-authored reference docs intact", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "docs", "reference-configs"), { recursive: true });
      writeFileSync(join(repo, "docs", "reference-configs", "harness-overview.md"), "# Local Operations Guide\n");
      // A stub marker alone is no proof: an edited stub is kept.
      const editedStub = "<!-- repo-harness: reference-config-stub v1 -->\n# repo-harness Reference: external-tooling\n\nMy notes.\n";
      writeFileSync(join(repo, "docs", "reference-configs", "external-tooling.md"), editedStub);
      const plan = planAdoption({ repoRoot: repo, mode: "standard", apply: true });
      expect(plan.warnings.filter((warning) => warning.code === "customized-managed-value").map((warning) => warning.message)).toEqual([
        "Preserving docs/reference-configs/external-tooling.md: it is not a reference-config stub that a release wrote; delete it to get the current stub",
        "Preserving docs/reference-configs/harness-overview.md: it is not a reference-config stub that a release wrote; delete it to get the current stub",
      ]);
      const apply = applyAdoptionPlan(plan);
      expect(apply.ok).toBe(true);
      expect(readFileSync(join(repo, "docs", "reference-configs", "harness-overview.md"), "utf-8")).toBe("# Local Operations Guide\n");
      expect(readFileSync(join(repo, "docs", "reference-configs", "external-tooling.md"), "utf-8")).toBe(editedStub);
    } finally {
      cleanup(repo);
    }
  });

  test("planner leaves custom files in retired generated-helper paths untouched", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "scripts"), { recursive: true });
      mkdirSync(join(repo, ".codex"), { recursive: true });
      writeFileSync(join(repo, "scripts", "check-deploy-sql-order.sh"), "#!/bin/bash\necho repo-harness custom\n");
      writeFileSync(join(repo, ".codex", "hooks.json"), '{"hooks":{"PostToolUse":"bash scripts/custom-hook.sh"}}\n');
      const plan = planAdoption({ repoRoot: repo, mode: "standard" });
      expect(plan.operations.some((operation) => operation.path === "scripts/check-deploy-sql-order.sh")).toBe(false);
      expect(plan.operations.some((operation) => operation.path === ".codex/hooks.json")).toBe(false);
      expect(applyAdoptionPlan(plan).ok).toBe(true);
      expect(readFileSync(join(repo, ".codex", "hooks.json"), "utf-8")).toContain("custom-hook.sh");
    } finally {
      cleanup(repo);
    }
  });

  for (const mode of ["minimal", "standard"] as const) {
    test(`${mode} adoption keeps lessons without seeding retired task surfaces`, () => {
      const repo = tempRepo();
      try {
        const plan = planAdoption({ repoRoot: repo, mode, apply: true });
        expect(applyAdoptionPlan(plan).ok).toBe(true);
        expect(existsSync(join(repo, "tasks", "lessons.md"))).toBe(true);
        expect(existsSync(join(repo, "tasks", "contracts"))).toBe(false);
        expect(existsSync(join(repo, "plans"))).toBe(false);
        expect(existsSync(join(repo, "tasks", "workstreams"))).toBe(false);
        expect(existsSync(join(repo, "tasks", "current.md"))).toBe(false);
        for (const path of ["todos.md", "notes", "reviews", "examples"]) {
          expect(existsSync(join(repo, "tasks", path))).toBe(false);
        }
        if (mode === "standard") {
          const policy = JSON.parse(readFileSync(join(repo, ".ai", "harness", "policy.json"), "utf-8"));
          expect(policy.active_plan).toBeUndefined();
          expect(policy.tasks).toBeUndefined();
          const contextMap = JSON.parse(readFileSync(join(repo, ".ai", "context", "context-map.json"), "utf-8"));
          expect(contextMap.root_context_files).not.toContain("tasks/current.md");
        }
      } finally {
        cleanup(repo);
      }
    });

    test(`${mode} adoption leaves existing todo files and archives unchanged`, () => {
      const repo = tempRepo();
      try {
        mkdirSync(join(repo, "tasks", "archive"), { recursive: true });
        writeFileSync(join(repo, "tasks", "todos.md"), "# Old Todos\n");
        writeFileSync(join(repo, "tasks", "todo.md"), "# Old Todo\n");
        writeFileSync(join(repo, "tasks", "archive", "legacy-tasks-todo.md"), "# User archive\n");
        expect(applyAdoptionPlan(planAdoption({ repoRoot: repo, mode, apply: true })).ok).toBe(true);
        expect(readFileSync(join(repo, "tasks", "todos.md"), "utf-8")).toBe("# Old Todos\n");
        expect(readFileSync(join(repo, "tasks", "todo.md"), "utf-8")).toBe("# Old Todo\n");
        expect(readFileSync(join(repo, "tasks", "archive", "legacy-tasks-todo.md"), "utf-8")).toBe("# User archive\n");
      } finally {
        cleanup(repo);
      }
    });
  }

  test("legacy planning documents are no longer imported or rearchived", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "docs", "researches"), { recursive: true });
      mkdirSync(join(repo, "tasks"), { recursive: true });
      writeFileSync(join(repo, "docs", "TODO.md"), "# Legacy todo\n");
      writeFileSync(join(repo, "tasks", "research.md"), "# Legacy research\n");
      writeFileSync(join(repo, "docs", "researches", "legacy-research-notes.md"), "# User research\n");
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      expect(readFileSync(join(repo, "docs", "TODO.md"), "utf-8")).toBe("# Legacy todo\n");
      expect(readFileSync(join(repo, "tasks", "research.md"), "utf-8")).toBe("# Legacy research\n");
      expect(readFileSync(join(repo, "docs", "researches", "legacy-research-notes.md"), "utf-8")).toBe("# User research\n");
      expect(existsSync(join(repo, "tasks", "archive"))).toBe(false);
      expect(existsSync(join(repo, "plans"))).toBe(false);
    } finally {
      cleanup(repo);
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

  test("adoption replaces the v0.19.5 contract body and keeps its bytes in the backup", () => {
    const repo = tempRepo();
    try {
      // v0.19.5 commit 55bafc000ad0d4051bb443845ca9a51c4a2bf5dc, asset blob a7f59c40c2026c34920323f30ead61caca4bdc35.
      const legacy = readFileSync(join(ROOT, "tests/fixtures/adoption/workflow-contract-v0.19.5.json"), "utf8");
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      const target = join(repo, ".ai", "harness", "workflow-contract.json");
      writeFileSync(target, legacy);
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "minimal", apply: true }));
      expect(apply.ok).toBe(true);
      expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ kind: "repo-harness.workflow-contract-marker", protocol: 1 });
      const manifest = JSON.parse(readFileSync(join(repo, apply.transactionManifestPath!), "utf8")) as { operations: Array<{ path?: string; backupPath?: string }> };
      const backup = manifest.operations.find((operation) => operation.path === ".ai/harness/workflow-contract.json")?.backupPath;
      expect(backup).toBeDefined();
      expect(readFileSync(join(repo, backup!), "utf8")).toBe(legacy);
      const report = { protocol: 1, command: "init", repoRoot: repo, mode: "minimal", ok: true, plan: {} } as const;
      const restore = `cp '${join(repo, backup!)}' '${target}'`;
      expect(renderApplyReport({ ...report, apply }))
        .toContain(`[init] backup: .ai/harness/workflow-contract.json -> ${join(repo, backup!)} (restore: ${restore})\n`);
      const next = planAdoption({ repoRoot: repo, mode: "minimal", apply: true });
      expect(next.operations.find((operation) => operation.path === ".ai/harness/workflow-contract.json")?.status).toBe("skipped");
      expect(renderApplyReport({ ...report, apply: applyAdoptionPlan(next) })).not.toContain("[init] backup:");
      expect(spawnSync("sh", ["-c", restore]).status).toBe(0);
      expect(readFileSync(target, "utf8")).toBe(legacy);
    } finally {
      cleanup(repo);
    }
  });

  test("adoption keeps a declared minimum harness version and rejects an invalid one", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      const target = join(repo, ".ai", "harness", "workflow-contract.json");
      writeFileSync(target, `${JSON.stringify({ minimum_harness_version: "0.22.1", kind: "repo-harness.workflow-contract-marker", protocol: 1 })}\n`);
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "minimal", apply: true }));
      expect(apply.ok).toBe(true);
      expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ kind: "repo-harness.workflow-contract-marker", protocol: 1, minimum_harness_version: "0.22.1" });
      const next = planAdoption({ repoRoot: repo, mode: "minimal", apply: true });
      expect(next.operations.find((operation) => operation.path === ".ai/harness/workflow-contract.json")?.status).toBe("skipped");

      writeFileSync(target, `${JSON.stringify({ kind: "repo-harness.workflow-contract-marker", protocol: 1, minimum_harness_version: 22 })}\n`);
      expect(() => planAdoption({ repoRoot: repo, mode: "minimal", apply: true })).toThrow("minimum_harness_version must be a release version");
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

  test("apply stops at the first failed operation and rolls back the applied ones by manifest", () => {
    const repo = tempRepo();
    try {
      // Invalid UTF-8 bytes prove that backup and restore are byte-exact.
      const original = Buffer.concat([Buffer.from("original ✓ "), Buffer.from([0xff, 0xfe, 0x80, 0x00]), Buffer.from("\n")]);
      writeFileSync(join(repo, "existing.txt"), original);
      // The fourth write passes preflight, then fails because the third write turns its parent into a file.
      const plan = planWith(repo, [
        writeOperation("existing.txt", "replaced\n"),
        { id: "mkdir:created-dir", kind: "mkdir", path: "created-dir", reason: "test", risk: "low", status: "planned" },
        writeOperation("blocker", "file in the way\n"),
        writeOperation("blocker/nested.txt", "never written\n"),
        writeOperation("after.txt", "never written\n"),
      ]);
      const apply = applyAdoptionPlan(plan);

      expect(apply.ok).toBe(false);
      expect(apply.results.map((result) => result.status)).toEqual(["applied", "applied", "applied", "failed", "planned"]);
      expect(existsSync(join(repo, "after.txt"))).toBe(false);
      expect(apply.rollback?.ok).toBe(true);
      expect(readFileSync(join(repo, "existing.txt")).equals(original)).toBe(true);
      expect(existsSync(join(repo, "created-dir"))).toBe(false);
      expect(existsSync(join(repo, "blocker"))).toBe(false);
      const manifest = JSON.parse(readFileSync(join(repo, apply.transactionManifestPath!), "utf-8"));
      expect(manifest.operations.map((operation: { status: string }) => operation.status))
        .toEqual(["applied", "applied", "applied", "failed", "planned"]);

      const report = { protocol: 1, command: "init", repoRoot: repo, mode: "minimal", ok: false, plan: {} } as const;
      expect(renderApplyReport({ ...report, apply })).toContain("[init] rollback: complete - 3 rolled back, 0 failed\n");
      expect(renderApplyReport({ ...report, apply })).not.toContain("[init] backup:");
      const incomplete = renderApplyReport({
        ...report,
        apply: {
          ...apply,
          rollback: {
            ok: false,
            results: [{
              id: "writeFile:existing.txt", kind: "writeFile", path: "existing.txt", status: "failed", action: "restore_backup",
              error: "current file hash differs from transaction content hash",
            }],
          },
        },
      });
      expect(incomplete).toContain("[init] rollback: incomplete - 0 rolled back, 1 failed\n");
      expect(incomplete).toContain("[init] rollback failed: existing.txt (restore_backup) - current file hash differs from transaction content hash\n");
      expect(incomplete).toContain("[init] not restored: existing.txt\n");
    } finally {
      cleanup(repo);
    }
  });

  // Starts a process that takes the target lock, reports it, then runs whileHeld under the lock.
  async function holdTargetLock(target: string, whileHeld: string): Promise<ReturnType<typeof Bun.spawn>> {
    const holder = Bun.spawn([process.execPath, "-e", `
      const { writeFileSync, writeSync } = require("fs");
      const { withTargetLock } = require(${JSON.stringify(FS_TRANSACTION)});
      const target = ${JSON.stringify(target)};
      withTargetLock(target, () => {
        writeSync(1, "locked\\n");
        ${whileHeld}
      });
    `], { stdout: "pipe", stderr: "inherit" });
    const reader = (holder.stdout as ReadableStream<Uint8Array>).getReader();
    let output = "";
    while (!output.includes("locked")) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`lock holder exited before locking: ${output}`);
      output += new TextDecoder().decode(chunk.value);
    }
    reader.releaseLock();
    return holder;
  }

  test("apply reclaims a target lock left by a SIGKILLed writer", async () => {
    const repo = tempRepo();
    try {
      const target = join(repo, "locked.txt");
      writeFileSync(target, "before\n");
      const holder = await holdTargetLock(target, "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);");
      holder.kill("SIGKILL");
      await holder.exited;
      expect(existsSync(`${target}.repo-harness.lock`)).toBe(true);

      const apply = applyAdoptionPlan(planWith(repo, [writeOperation("locked.txt", "after\n")]));
      expect(apply.results).toEqual([expect.objectContaining({ status: "applied" })]);
      expect(apply.ok).toBe(true);
      expect(readFileSync(target, "utf-8")).toBe("after\n");
      expect(existsSync(`${target}.repo-harness.lock`)).toBe(false);
    } finally {
      cleanup(repo);
    }
  }, 30_000);

  test("apply reclaims a stale empty target lock directory", () => {
    const repo = tempRepo();
    try {
      const target = join(repo, "locked.txt");
      writeFileSync(target, "before\n");
      // A writer killed between creating the lock directory and publishing its owner leaves it empty.
      const lock = `${target}.repo-harness.lock`;
      mkdirSync(lock);
      const past = new Date(Date.now() - 60_000);
      utimesSync(lock, past, past);

      const apply = applyAdoptionPlan(planWith(repo, [writeOperation("locked.txt", "after\n")]));
      expect(apply.ok).toBe(true);
      expect(readFileSync(target, "utf-8")).toBe("after\n");
      expect(existsSync(lock)).toBe(false);
    } finally {
      cleanup(repo);
    }
  });

  test("a writer that waited for the target lock rechecks the planned content before it writes", async () => {
    const repo = tempRepo();
    try {
      const target = join(repo, "contested.txt");
      writeFileSync(target, "before\n");
      const plan = planWith(repo, [{
        ...writeOperation("contested.txt", "planned\n"),
        expectedContentHash: `sha256:${createHash("sha256").update("before\n").digest("hex")}`,
      }]);
      // Handshake: this process calls Atomics.wait first in the lock's wait loop, which it
      // reaches only after preflight and the unlocked checks passed. The holder edits the
      // target only after that call publishes the signal file, then releases the lock.
      const signal = join(repo, "applier-waits-for-lock");
      const holder = await holdTargetLock(target, `
        const { existsSync } = require("fs");
        const deadline = Date.now() + 20000;
        while (!existsSync(${JSON.stringify(signal)})) {
          if (Date.now() > deadline) process.exit(3);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
        writeFileSync(target, "holder edit\\n");
      `);
      const wait = Atomics.wait;
      Atomics.wait = function (...args: unknown[]) {
        if (!existsSync(signal)) writeFileSync(signal, "");
        return Reflect.apply(wait, Atomics, args);
      } as typeof Atomics.wait;
      let apply: ReturnType<typeof applyAdoptionPlan>;
      try {
        apply = applyAdoptionPlan(plan);
      } finally {
        Atomics.wait = wait;
      }
      expect(await holder.exited).toBe(0);

      expect(existsSync(signal)).toBe(true);
      expect(apply.ok).toBe(false);
      expect(apply.results[0]?.error).toContain("target content changed after planning");
      expect(readFileSync(target, "utf-8")).toBe("holder edit\n");
    } finally {
      cleanup(repo);
    }
  }, 30_000);

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
      const helper = "scripts/check-deploy-sql-order.sh";
      writeFileSync(join(repo, helper), readFileSync(join(ROOT, "scripts", "check-deploy-sql-order.sh"), "utf-8"));
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
  }, 30_000);

  test("rollback restores the exact staged helper entry instead of staging working-tree bytes", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "scripts"), { recursive: true });
      const helper = "scripts/check-deploy-sql-order.sh";
      const canonical = readFileSync(join(ROOT, "scripts", "check-deploy-sql-order.sh"), "utf-8");
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      writeFileSync(join(repo, helper), "#!/bin/sh\necho staged custom helper\n");
      expect(spawnSync("git", ["add", helper], { cwd: repo }).status).toBe(0);
      writeFileSync(join(repo, helper), canonical);
      const git = (...args: string[]) => spawnSync("git", args, { cwd: repo, encoding: "utf-8" }).stdout;
      const stagedEntry = git("ls-files", "--stage", "--", helper);
      const stagedBytes = git("show", `:${helper}`);
      expect(stagedBytes).toBe("#!/bin/sh\necho staged custom helper\n");

      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      expect(apply.results.find((result) => result.kind === "gitUntrack" && result.path === helper)?.status).toBe("applied");
      const rollback = rollbackAdoptionTransaction({ repoRoot: repo, transaction: apply.transactionManifestPath! });
      expect(rollback.ok).toBe(true);
      expect(git("ls-files", "--stage", "--", helper)).toBe(stagedEntry);
      expect(git("show", `:${helper}`)).toBe(stagedBytes);
      expect(readFileSync(join(repo, helper), "utf-8")).toBe(canonical);
    } finally {
      cleanup(repo);
    }
  }, 30_000);

  test("rollback never stages a file the user created at an untracked helper path after apply", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "scripts"), { recursive: true });
      const helper = "scripts/check-deploy-sql-order.sh";
      writeFileSync(join(repo, helper), readFileSync(join(ROOT, "scripts", "check-deploy-sql-order.sh"), "utf-8"));
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["add", helper], { cwd: repo }).status).toBe(0);
      const git = (...args: string[]) => spawnSync("git", args, { cwd: repo, encoding: "utf-8" }).stdout;
      const stagedEntry = git("ls-files", "--stage", "--", helper);

      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      writeFileSync(join(repo, helper), "user file created after apply\n");
      const rollback = rollbackAdoptionTransaction({ repoRoot: repo, transaction: apply.transactionManifestPath! });
      expect(rollback.ok).toBe(false);
      expect(rollback.results.find((result) => result.kind === "remove" && result.path === helper)?.error).toContain("occupied");
      expect(git("ls-files", "--stage", "--", helper)).toBe(stagedEntry);
      expect(readFileSync(join(repo, helper), "utf-8")).toBe("user file created after apply\n");
    } finally {
      cleanup(repo);
    }
  }, 30_000);

  describe("git untrack fail-closed boundaries", () => {
    const helper = "scripts/check-deploy-sql-order.sh";

    function helperRepo(): { repo: string; git: (...args: string[]) => ReturnType<typeof spawnSync> } {
      const repo = tempRepo();
      mkdirSync(join(repo, "scripts"), { recursive: true });
      writeFileSync(join(repo, helper), readFileSync(join(ROOT, "scripts", "check-deploy-sql-order.sh"), "utf-8"));
      const git = (...args: string[]) => spawnSync("git", args, { cwd: repo, encoding: "utf-8" });
      expect(git("init", "-q").status).toBe(0);
      return { repo, git };
    }

    function expectRefusedBeforeMutation(repo: string, git: (...args: string[]) => ReturnType<typeof spawnSync>, message: string): void {
      const indexBefore = git("ls-files", "--stage", "--", helper).stdout;
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(false);
      expect(apply.results.find((result) => result.kind === "gitUntrack" && result.path === helper)?.error).toContain(message);
      expect(existsSync(join(repo, helper))).toBe(true);
      expect(git("ls-files", "--stage", "--", helper).stdout).toBe(indexBefore);
    }

    function editManifest(repo: string, manifestPath: string, edit: (operation: Record<string, any>) => void): void {
      const path = join(repo, manifestPath);
      const manifest = JSON.parse(readFileSync(path, "utf-8"));
      edit(manifest.operations.find((operation: Record<string, any>) => operation.kind === "gitUntrack" && operation.path === helper));
      writeFileSync(path, JSON.stringify(manifest));
    }

    test("apply refuses an intent-to-add entry before any mutation", () => {
      const { repo, git } = helperRepo();
      try {
        expect(git("add", "-N", helper).status).toBe(0);
        expectRefusedBeforeMutation(repo, git, "intent-to-add");
        expect(git("status", "--porcelain=v2", "--", helper).stdout).toContain(" .A N... ");
      } finally {
        cleanup(repo);
      }
    }, 30_000);

    test("apply refuses an unmerged entry before any mutation", () => {
      const { repo, git } = helperRepo();
      try {
        const blob = String(git("hash-object", "-w", helper).stdout).trim();
        const info = [1, 2, 3].map((stage) => `100644 ${blob} ${stage}\t${helper}\n`).join("");
        expect(spawnSync("git", ["update-index", "--index-info"], { cwd: repo, input: info }).status).toBe(0);
        expectRefusedBeforeMutation(repo, git, "unmerged");
      } finally {
        cleanup(repo);
      }
    }, 30_000);

    test("apply refuses an index entry that is not a regular file mode", () => {
      const { repo, git } = helperRepo();
      try {
        const blob = String(spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo, input: "link-target", encoding: "utf-8" }).stdout).trim();
        expect(git("update-index", "--add", "--cacheinfo", `120000,${blob},${helper}`).status).toBe(0);
        expectRefusedBeforeMutation(repo, git, "120000");
      } finally {
        cleanup(repo);
      }
    }, 30_000);

    test("rollback of a manifest without an index entry fails with a manual re-add step", () => {
      const { repo, git } = helperRepo();
      try {
        expect(git("add", helper).status).toBe(0);
        const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
        expect(apply.ok).toBe(true);
        editManifest(repo, apply.transactionManifestPath!, (operation) => { delete operation.gitIndexEntry; });
        const rollback = rollbackAdoptionTransaction({ repoRoot: repo, transaction: apply.transactionManifestPath! });
        expect(rollback.ok).toBe(false);
        expect(rollback.results.find((result) => result.kind === "gitUntrack")?.error).toContain(`git add -- ${helper}`);
        expect(git("ls-files", "--stage", "--", helper).stdout).toBe("");
      } finally {
        cleanup(repo);
      }
    }, 30_000);

    test("rollback refuses to replace an index entry the user staged after apply", () => {
      const { repo, git } = helperRepo();
      try {
        expect(git("add", helper).status).toBe(0);
        const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
        expect(apply.ok).toBe(true);
        writeFileSync(join(repo, helper), "user staged after apply\n");
        expect(git("add", helper).status).toBe(0);
        const userEntry = git("ls-files", "--stage", "--", helper).stdout;
        const rollback = rollbackAdoptionTransaction({ repoRoot: repo, transaction: apply.transactionManifestPath! });
        expect(rollback.ok).toBe(false);
        expect(rollback.results.find((result) => result.kind === "gitUntrack")?.error).toContain("changed after apply");
        expect(git("ls-files", "--stage", "--", helper).stdout).toBe(userEntry);
      } finally {
        cleanup(repo);
      }
    }, 30_000);

    test("rollback fails closed when Git pruned the recorded blob", () => {
      const { repo, git } = helperRepo();
      try {
        const canonical = readFileSync(join(repo, helper), "utf-8");
        writeFileSync(join(repo, helper), "#!/bin/sh\necho staged only\n");
        expect(git("add", helper).status).toBe(0);
        writeFileSync(join(repo, helper), canonical);
        const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
        expect(apply.ok).toBe(true);
        expect(git("prune", "--expire=now").status).toBe(0);
        const rollback = rollbackAdoptionTransaction({ repoRoot: repo, transaction: apply.transactionManifestPath! });
        expect(rollback.ok).toBe(false);
        expect(rollback.results.find((result) => result.kind === "gitUntrack")?.error).toContain("recorded git object is missing");
        expect(git("ls-files", "--stage", "--", helper).stdout).toBe("");
      } finally {
        cleanup(repo);
      }
    }, 30_000);

    test("rollback rejects a manifest whose index entry is not a regular file entry", () => {
      const { repo, git } = helperRepo();
      try {
        expect(git("add", helper).status).toBe(0);
        const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
        expect(apply.ok).toBe(true);
        for (const gitIndexEntry of [{ mode: "120000", objectId: "a".repeat(40) }, { mode: "100644", objectId: "not-an-oid" }]) {
          editManifest(repo, apply.transactionManifestPath!, (operation) => { operation.gitIndexEntry = gitIndexEntry; });
          const rollback = rollbackAdoptionTransaction({ repoRoot: repo, transaction: apply.transactionManifestPath! });
          expect(rollback.ok).toBe(false);
          expect(rollback.results[0]?.error).toContain("invalid transaction manifest");
        }
        expect(git("ls-files", "--stage", "--", helper).stdout).toBe("");
      } finally {
        cleanup(repo);
      }
    }, 30_000);
  });

  test("apply refuses a dangling symlink at a planned target instead of replacing it", () => {
    const repo = tempRepo();
    const outside = tempDir();
    try {
      mkdirSync(join(repo, "docs"), { recursive: true });
      symlinkSync(join(outside, "spec.md"), join(repo, "docs", "spec.md"));
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "minimal", apply: true }));
      expect(apply.ok).toBe(false);
      expect(apply.results.some((result) => result.error?.includes("symlink is not allowed"))).toBe(true);
      expect(lstatSync(join(repo, "docs", "spec.md")).isSymbolicLink()).toBe(true);
      expect(readdirSync(outside)).toEqual([]);
    } finally {
      cleanup(repo);
      cleanup(outside);
    }
  });

  test.skipIf(process.getuid?.() === 0)("rollback reports a structured failure when a path folder cannot be searched", () => {
    const repo = tempRepo();
    try {
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "minimal", apply: true }));
      expect(apply.ok).toBe(true);
      chmodSync(join(repo, "docs"), 0o000);
      try {
        const rollback = rollbackAdoptionTransaction({ repoRoot: repo, transaction: apply.transactionManifestPath! });
        expect(rollback.ok).toBe(false);
        expect(rollback.results.find((result) => result.path === "docs/spec.md")?.error).toContain("cannot inspect adoption path: docs/spec.md (EACCES)");
      } finally {
        chmodSync(join(repo, "docs"), 0o755);
      }
      expect(existsSync(join(repo, "docs", "spec.md"))).toBe(true);
    } finally {
      cleanup(repo);
    }
  });
});

describe("review_base authority", () => {
  function git(repo: string, ...args: string[]): void {
    expect(spawnSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: repo }).status).toBe(0);
  }
  const onMaster = (repo: string) => git(repo, "symbolic-ref", "HEAD", "refs/heads/master");
  const committedOnMaster = (repo: string) => { onMaster(repo); git(repo, "commit", "-q", "--allow-empty", "-m", "base"); };
  const detached = (repo: string) => { committedOnMaster(repo); git(repo, "checkout", "-q", "--detach"); };
  const writePolicy = (repo: string, worktreeStrategy: object) => {
    mkdirSync(join(repo, ".ai/harness"), { recursive: true });
    writeFileSync(join(repo, ".ai/harness/policy.json"), JSON.stringify({ worktree_strategy: worktreeStrategy }));
  };
  const everyBranchKey = (branch: string) => ({ base_branch: branch, review_base: branch, merge_back: { target: branch } });

  test.each([
    ["remote HEAD wins over the current branch", (repo: string) => {
      committedOnMaster(repo);
      git(repo, "update-ref", "refs/remotes/origin/trunk", "HEAD");
      git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
    }, everyBranchKey("trunk")],
    ["no remote uses the current branch", committedOnMaster, everyBranchKey("master")],
    ["unborn HEAD uses its branch name", onMaster, everyBranchKey("master")],
    ["an existing key stays on a detached HEAD", (repo: string) => { detached(repo); writePolicy(repo, { review_base: "develop" }); }, { review_base: "develop" }],
    ["a missing key stays missing on a detached HEAD", (repo: string) => { detached(repo); writePolicy(repo, { base_branch: "main" }); }, { base_branch: "main" }],
    ["an existing policy reads no key from git on another branch", (repo: string) => { committedOnMaster(repo); writePolicy(repo, { review_base: "develop" }); }, { review_base: "develop" }],
    ["existing keys can differ from each other", (repo: string) => {
      committedOnMaster(repo);
      writePolicy(repo, { base_branch: "develop", review_base: "release", merge_back: { target: "main", requires_clean_check: true } });
    }, { base_branch: "develop", review_base: "release", merge_back: { target: "main" } }],
    ["merge_back keeps a missing target", (repo: string) => { committedOnMaster(repo); writePolicy(repo, { merge_back: {} }); }, { merge_back: {} }],
  ] as const)("%s", (_name, setup, branchKeys) => {
    const repo = tempRepo();
    try {
      setup(repo);
      const operation = planAdoption({ repoRoot: repo, mode: "standard" }).operations.find((entry) => entry.path === ".ai/harness/policy.json");
      if (!operation || operation.kind !== "writeFile") throw new Error("policy operation missing");
      const { base_branch, review_base, merge_back } = JSON.parse(operation.content).worktree_strategy;
      const written: object = { base_branch, review_base, merge_back };
      expect(written).toEqual(branchKeys);
    } finally {
      cleanup(repo);
    }
  });

  test.each([
    ["a detached HEAD", detached],
    ["a non-git target", (repo: string) => rmSync(join(repo, ".git"), { recursive: true, force: true })],
  ] as const)("standard init refuses %s before any write", (_name, setup) => {
    const repo = tempRepo();
    try {
      setup(repo);
      const options = { repo, mode: "standard", explicitRepo: true } as const;
      const planned = planRepoAdoption(options);
      expect(planned.error?.code).toBe("review_base_unresolved");
      expect(planned.error?.message).toContain("worktree_strategy.review_base");
      expect(planned.error?.message).toContain("git remote set-head origin --auto");
      expect(runAdoptionApply(options).report.errors?.[0]?.code).toBe("review_base_unresolved");
      expect(existsSync(join(repo, ".ai"))).toBe(false);
    } finally {
      cleanup(repo);
    }
  });

  test.each(["process.env", "opts.env"] as const)("GIT_DIR in %s cannot select another repository", (entry) => {
    const [foreign, repo, nonGit] = [tempRepo(), tempRepo(), tempDir()];
    const parentGitDir = process.env.GIT_DIR;
    const env = entry === "opts.env" ? { GIT_DIR: join(foreign, ".git") } : undefined;
    const plan = (target: string) => planRepoAdoption({ repo: target, mode: "standard", explicitRepo: true, env });
    try {
      git(foreign, "symbolic-ref", "HEAD", "refs/heads/foreign");
      onMaster(repo);
      if (entry === "process.env") process.env.GIT_DIR = join(foreign, ".git");
      const operation = plan(repo).plan?.operations.find((candidate) => candidate.path === ".ai/harness/policy.json");
      if (!operation || operation.kind !== "writeFile") throw new Error("policy operation missing");
      expect(JSON.parse(operation.content).worktree_strategy.review_base).toBe("master");
      expect(plan(nonGit).error?.code).toBe("review_base_unresolved");
    } finally {
      if (parentGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = parentGitDir;
      for (const path of [foreign, repo, nonGit]) cleanup(path);
    }
  });

  test("minimal mode writes no policy and reads no ref on a non-git target", () => {
    const repo = tempRepo();
    try {
      rmSync(join(repo, ".git"), { recursive: true, force: true });
      const plan = planAdoption({ repoRoot: repo, mode: "minimal" });
      expect(plan.operations.some((entry) => entry.path === ".ai/harness/policy.json")).toBe(false);
    } finally {
      cleanup(repo);
    }
  });
});

describe("init command cutover", () => {
  test("dry-run is structured and leaves the target untouched", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "init", "--repo", repo, "--dry-run", "--json"], { cwd: ROOT, encoding: "utf-8" });
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout) as { apply: boolean; operations: unknown[] };
      expect(payload.apply).toBe(false);
      expect(payload.operations.length).toBeGreaterThan(50);
      expect(existsSync(join(repo, ".ai"))).toBe(false);
    } finally {
      cleanup(repo);
    }
  }, 30_000);

  test("ordinary minimal apply uses the TypeScript transaction and retired experimental flag is absent", () => {
    const repo = tempRepo();
    const home = tempRepo();
    try {
      const apply = spawnSync("bun", [CLI, "init", "--repo", repo, "--mode", "minimal", "--no-verify", "--no-codegraph", "--json"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: { ...process.env, HOME: home, REPO_HARNESS_HOME: join(home, ".repo-harness") },
      });
      expect(apply.status).toBe(0);
      // Init leaves account configuration to `rh update` and names it.
      expect(existsSync(join(home, ".repo-harness", "config.json"))).toBe(false);
      expect(JSON.parse(apply.stdout).steps).toContainEqual(expect.objectContaining({
        step: "required Herdr skill",
        status: "skipped",
        detail: expect.stringContaining("run: rh update"),
      }));
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(true);
      const retired = spawnSync("bun", [CLI, "init", "--experimental-ts-apply"], { cwd: ROOT, encoding: "utf-8" });
      expect(retired.status).toBe(1);
      expect(retired.stderr).toContain("unknown option");
    } finally {
      cleanup(repo);
      cleanup(home);
    }
  }, 30_000);

  test("retired reclaim and compact flags have no compatibility CLI surface", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "init", "--repo", repo, "--reclaim-runtime"], { cwd: ROOT, encoding: "utf-8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unknown option '--reclaim-runtime'");
      const compact = spawnSync("bun", [CLI, "init", "--repo", repo, "--compact"], { cwd: ROOT, encoding: "utf-8" });
      expect(compact.status).toBe(1);
      expect(compact.stderr).toContain("unknown option '--compact'");
      expect(existsSync(join(repo, ".ai"))).toBe(false);
    } finally {
      cleanup(repo);
    }
  }, 30_000);

  test("retired adopt command is fail-closed with no alias or stub", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "adopt", "--repo", repo, "--dry-run"], { cwd: ROOT, encoding: "utf-8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unknown command 'adopt'");
      expect(existsSync(join(repo, ".ai"))).toBe(false);
    } finally {
      cleanup(repo);
    }
  }, 30_000);

  test("interactive init is rejected before it can configure user-level runtime state", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "init", "--repo", repo, "--interactive"], { cwd: ROOT, encoding: "utf-8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unknown option");
      expect(existsSync(join(repo, ".ai"))).toBe(false);
    } finally {
      cleanup(repo);
    }
  }, 30_000);
});

/**
 * `documentation.language` is the only datum deciding human-facing document
 * language. These cases pin its default, its env authoring path, its
 * fail-closed rejection, and the fact that an adopted repo's stored choice
 * survives re-planning.
 */
describe("documentation language policy datum", () => {
  function plannedPolicy(repo: string, env?: NodeJS.ProcessEnv): Record<string, any> {
    const plan = planAdoption({ repoRoot: repo, mode: "standard", env });
    const operation = plan.operations.find((entry) => entry.path === ".ai/harness/policy.json");
    if (!operation || operation.kind !== "writeFile") {
      throw new Error("expected a writeFile operation for .ai/harness/policy.json");
    }
    return JSON.parse(operation.content);
  }

  test("defaults to en", () => {
    const repo = tempRepo();
    try {
      expect(plannedPolicy(repo).documentation.language).toBe("en");
    } finally {
      cleanup(repo);
    }
  });

  test("REPO_HARNESS_DOCUMENTATION_LANGUAGE authors the planned value", () => {
    const repo = tempRepo();
    try {
      expect(plannedPolicy(repo, { REPO_HARNESS_DOCUMENTATION_LANGUAGE: "zh-CN" }).documentation.language).toBe("zh-CN");
      expect(plannedPolicy(repo, { REPO_HARNESS_DOCUMENTATION_LANGUAGE: "follow-user" }).documentation.language).toBe(
        "follow-user",
      );
    } finally {
      cleanup(repo);
    }
  });

  test("rejects a value outside the enum instead of falling back to the default", () => {
    const repo = tempRepo();
    try {
      expect(() => plannedPolicy(repo, { REPO_HARNESS_DOCUMENTATION_LANGUAGE: "zh-TW" })).toThrow(
        /REPO_HARNESS_DOCUMENTATION_LANGUAGE/,
      );
      expect(() => plannedPolicy(repo, { REPO_HARNESS_DOCUMENTATION_LANGUAGE: "zh-TW" })).toThrow(
        /en \| zh-CN \| follow-user/,
      );
    } finally {
      cleanup(repo);
    }
  });

  test("rejects an invalid stored value and preserves a valid one across re-planning", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      writeFileSync(
        join(repo, ".ai/harness/policy.json"),
        JSON.stringify({ version: 1, documentation: { language: "zh-CN" } }, null, 2),
      );
      expect(plannedPolicy(repo).documentation.language).toBe("zh-CN");

      writeFileSync(
        join(repo, ".ai/harness/policy.json"),
        JSON.stringify({ version: 1, documentation: { language: "klingon" } }, null, 2),
      );
      expect(() => plannedPolicy(repo)).toThrow(/documentation\.language/);
    } finally {
      cleanup(repo);
    }
  });

  test("public init reads documentation settings from the process environment", () => {
    const repo = tempRepo();
    const home = tempRepo();
    try {
      const env = {
        ...process.env,
        HOME: home,
        REPO_HARNESS_HOME: join(home, ".repo-harness"),
        REPO_HARNESS_DOCUMENTATION_LANGUAGE: "zh-CN",
        REPO_HARNESS_DOCUMENTATION_PROFILE: "full",
      };
      const referenceCount = readdirSync(join(ROOT, "assets", "reference-configs")).filter((name) => name.endsWith(".md")).length;
      const dryRun = spawnSync("bun", [CLI, "init", "--repo", repo, "--dry-run", "--json"], { cwd: ROOT, encoding: "utf-8", env });
      expect(dryRun.status).toBe(0);
      const planned = (JSON.parse(dryRun.stdout) as { operations: { path?: string }[] }).operations
        .filter((operation) => operation.path?.startsWith("docs/reference-configs/"));
      expect(planned.length).toBe(referenceCount);

      const apply = spawnSync("bun", [CLI, "init", "--repo", repo, "--no-verify", "--no-codegraph", "--json"], { cwd: ROOT, encoding: "utf-8", env });
      expect(apply.status).toBe(0);
      const policy = JSON.parse(readFileSync(join(repo, ".ai/harness/policy.json"), "utf-8"));
      expect(policy.documentation.language).toBe("zh-CN");
      expect(readdirSync(join(repo, "docs", "reference-configs")).filter((name) => name.endsWith(".md")).length).toBe(referenceCount);
    } finally {
      cleanup(repo);
      cleanup(home);
    }
  }, 60_000);

  test("public init rejects an invalid exported documentation language before writes", () => {
    const repo = tempDir();
    const home = tempRepo();
    try {
      const env = { ...process.env, HOME: home, REPO_HARNESS_HOME: join(home, ".repo-harness"), REPO_HARNESS_DOCUMENTATION_LANGUAGE: "zh-TW" };
      for (const args of [["--dry-run", "--json"], ["--no-verify", "--no-codegraph", "--json"]]) {
        const result = spawnSync("bun", [CLI, "init", "--repo", repo, ...args], { cwd: ROOT, encoding: "utf-8", env });
        expect(result.status).not.toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain("REPO_HARNESS_DOCUMENTATION_LANGUAGE");
        expect(readdirSync(repo)).toEqual([]);
      }
    } finally {
      cleanup(repo);
      cleanup(home);
    }
  }, 60_000);

  test("generated root context points at the policy field instead of copying its value", () => {
    const repo = tempRepo();
    try {
      const plan = planAdoption({ repoRoot: repo, mode: "standard" });
      for (const path of ["CLAUDE.md", "AGENTS.md"]) {
        const operation = plan.operations.find((entry) => entry.path === path);
        if (!operation || operation.kind !== "writeFile") throw new Error(`expected a writeFile operation for ${path}`);
        expect(operation.content).toContain(
          "- Write human-facing documents in the language set by `.ai/harness/policy.json#documentation.language`; keep section headers, field keys and technical terms in English.",
        );
        expect(operation.content).not.toContain("documentation.language: ");
      }
    } finally {
      cleanup(repo);
    }
  });
});
