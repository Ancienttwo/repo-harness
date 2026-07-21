import { describe, test, expect, setDefaultTimeout } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { runMutationGuard, type MutationGuardCollector } from "../src/cli/hook/mutation-guard";
import { runPromptHandler } from "../src/cli/hook/prompt-handler";
import { createStateInputCollector } from "../src/effects/loop/state-input-collector";
import { resolveEffectiveState } from "../src/effects/state/resolve-effective-state";
import type { EffectiveState } from "../src/core/state/types";
import type { WorkflowProfile } from "../src/core/workflow/profile";

// Some fixtures resolve full effective state and can exceed the default under
// parallel session load.
setDefaultTimeout(20000);

// HRD-03: worktree-guard.sh + pre-edit-guard.sh are retired; the tests below
// that used to spawn them directly (via the local `runHook` bash-script
// helper) are retargeted to call the in-process mutation-guard handler
// directly -- the same "no subprocess, real resolveEffectiveState authority"
// pattern tests/mutation-guard.test.ts uses. Prompt protocol checks likewise
// call the typed prompt handler directly.
function mutationGuardCollector(repoRoot: string, explicitOverride?: WorkflowProfile): MutationGuardCollector {
  return createStateInputCollector({
    event: "PreToolUse",
    repoRoot,
    resolveSessionEffectiveState: () => null,
    resolvePreEditEffectiveState: (targetPaths: readonly string[]): EffectiveState | null => {
      try {
        return resolveEffectiveState(repoRoot, Date.now(), {
          targetPaths,
          operationKind: "edit",
          explicitOverride,
        });
      } catch {
        return null;
      }
    },
  });
}

function runEditHandler(
  cwd: string,
  payload: unknown,
  options: { readonly env?: NodeJS.ProcessEnv; readonly profile?: WorkflowProfile } = {},
): { status: number; stdout: string; stderr: string } {
  const result = runMutationGuard({
    collector: mutationGuardCollector(cwd, options.profile),
    input: JSON.stringify(payload),
    env: options.env ?? {},
  });
  return { status: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

function tmpWorkspace(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
}

function initGitRepo(cwd: string) {
  spawnSync("git", ["init"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["config", "user.name", "Hook Test"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["config", "user.email", "hook@test.local"], { cwd, encoding: "utf-8" });
  writeFileSync(join(cwd, "tracked.txt"), "base\n");
  spawnSync("git", ["add", "tracked.txt"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["commit", "-m", "init"], { cwd, encoding: "utf-8" });
}

function writeActivePlan(cwd: string, planPath: string) {
  mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
  writeFileSync(join(cwd, ".ai/harness/active-plan"), planPath);
  writeFileSync(join(cwd, ".ai/harness/active-worktree"), `${realpathSync(cwd)}\n`);
}

describe("Claude Code hook protocol compliance", () => {
  // Background: Claude Code's PreToolUse / UserPromptSubmit hook protocol treats
  // exit code 2 as the "blocking" signal and feeds stderr to the model.
  // Non-zero non-2 exits are surfaced as "non-blocking status code: No stderr output"
  // (a confusing UX that also doesn't actually block).
  // Every guard that intends to BLOCK must:
  //   1. exit with code 2
  //   2. write a human-readable [Guard] reason + fix to stderr

  test("worktree-guard: block path uses exit 2 with reason on stderr", () => {
    const cwd = tmpWorkspace("hook-proto-worktree");
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      writeFileSync(join(cwd, ".claude/.require-worktree"), "1\n");

      const res = runEditHandler(cwd, {});
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("[WorktreeGuard]");
      expect(res.stderr).toContain("Primary working tree detected");
      expect(res.stderr).toContain("linked worktree");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("pre-edit-guard: ExternalReferenceGuard uses exit 2 with reason on stderr", () => {
    const cwd = tmpWorkspace("hook-proto-ref");
    try {
      initGitRepo(cwd);

      const res = runEditHandler(cwd, { tool_input: { file_path: "_ref/upstream/README.md" } });
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("[ExternalReferenceGuard]");
      expect(res.stderr).toContain("_ref/");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("pre-edit-guard: OpsPrivateGuard uses exit 2 with reason on stderr", () => {
    const cwd = tmpWorkspace("hook-proto-ops");
    try {
      initGitRepo(cwd);

      const res = runEditHandler(cwd, { tool_input: { file_path: "_ops/env/.env.production" } });
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("[OpsPrivateGuard]");
      expect(res.stderr).toContain("_ops/");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("pre-edit-guard: ContractScopeGuard uses exit 2 with reason on stderr", () => {
    // This is the exact regression that surfaced as
    // "PreToolUse:Edit hook error / Failed with non-blocking status code: No stderr output".
    const cwd = tmpWorkspace("hook-proto-contract-scope");
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });

      const planPath = "plans/plan-20260528-1906-scope.md";
      writeFileSync(join(cwd, planPath), "# Plan: scope\n\n> **Status**: Approved\n");
      writeActivePlan(cwd, planPath);
      writeFileSync(
        join(cwd, "tasks/contracts/scope.contract.md"),
        [
          "# Task Contract: scope",
          "",
          "> **Status**: Pending",
          `> **Plan**: ${planPath}`,
          "",
          "## Allowed Paths",
          "",
          "```yaml",
          "allowed_paths:",
          "  - src/",
          "```",
          "",
        ].join("\n")
      );

      const res = runEditHandler(cwd, { tool_input: { file_path: "README.md" } });
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("[ContractScopeGuard]");
      expect(res.stderr).toContain("outside");
      expect(res.stderr).toContain("allowed_paths");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("pre-edit-guard: PlanTransitionGuard uses exit 2 with reason on stderr", () => {
    const cwd = tmpWorkspace("hook-proto-plan-transition");
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(
        join(cwd, "plans/plan-20260528-1500-demo.md"),
        "# Plan: demo\n\n> **Status**: Draft\n\n## Annotations\n<!-- [NOTE]: add detail -->\n"
      );

      const res = runEditHandler(cwd, {
        tool_input: {
          file_path: "plans/plan-20260528-1500-demo.md",
          content:
            "# Plan: demo\n\n> **Status**: Approved\n\n## Annotations\n<!-- [NOTE]: add detail -->\n",
        },
      });
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("[PlanTransitionGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("pre-edit profile resolution fails closed with exit 2 and remediation", () => {
    const cwd = tmpWorkspace("hook-proto-plan-status");
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "plans/plan-20260528-1300-demo.md"),
        "# Plan: demo\n\n> **Status**: Draft\n"
      );
      writeActivePlan(cwd, "plans/plan-20260528-1300-demo.md");

      // Prompt layer is advisory for plan status; the edit-layer plan gate is
      // the blocking enforcement point.
      const promptRes = runPromptHandler({ repoRoot: cwd, input: JSON.stringify({ user_message: "/execute" }) });
      expect(promptRes.exitCode).toBe(0);
      expect(promptRes.stdout).toContain("[PlanStatusGuard]");

      // HRD-03: the old failing-resolver-subprocess-substitution mechanism
      // (REPO_HARNESS_CLI pointed at a script that exits 1) cannot occur
      // in-process -- there is no subprocess CLI lookup left to degrade
      // (see runtime-profile-enforcement.test.ts's retired fake-CLI tests
      // for the same reasoning). Retargeted to a real fail-closed
      // resolution instead (a declared-but-corrupt capability registry,
      // the same technique runtime-profile-enforcement.test.ts's
      // "a declared-but-corrupt capability registry blocks..." test uses):
      // the assertions below -- exit 2, "[WorkflowProfileGuard]" on stderr
      // -- are unchanged from the original test.
      mkdirSync(join(cwd, ".ai/context"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({ context: { capability_registry_file: ".ai/context/capabilities.json" } }, null, 2),
      );
      writeFileSync(join(cwd, ".ai/context/capabilities.json"), "{not json");

      const res = runEditHandler(cwd, { tool_input: { file_path: "src/app.ts" } }, { profile: "standard" });
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("[WorkflowProfileGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: ContractGuard uses exit 2 with reason on stderr", () => {
    const cwd = tmpWorkspace("hook-proto-contract-missing");
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260528-1400-demo.md"),
        [
          "# Plan: demo",
          "",
          "> **Status**: Approved",
          "",
          "## Evidence Contract",
          "- State/progress path: tasks/current.md",
          "- Verification evidence: verify-sprint",
          "- Evaluator rubric: prompt protocol",
          "- Stop condition: stop on missing contract",
          "- Rollback surface: revert fixture",
          "",
        ].join("\n")
      );
      writeActivePlan(cwd, "plans/plan-20260528-1400-demo.md");

      const res = runPromptHandler({ repoRoot: cwd, input: JSON.stringify({ user_message: "done" }) });
      expect(res.exitCode).toBe(2);
      expect(res.stderr).toContain("[ContractGuard]");
      expect(res.stderr).toContain("Missing task contract");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("hook_get_file_path: normalizes absolute paths inside the repo to repo-relative paths", () => {
    // Background: Edit/Write/post-edit hooks receive `tool_input.file_path` as an
    // absolute path. Guards that match against repo-relative patterns
    // (`_ref/*`, `_ops/*`, `.ai/hooks/`, `apps/*/src/...`) silently fail on
    // absolute paths. Standardising the path at the input boundary fixes
    // ContractScopeGuard, ExternalReferenceGuard, OpsPrivateGuard, and the
    // post-edit doc-drift / brain-sync matchers in one move.

    // Case 1: absolute path inside the repo → repo-relative match still triggers
    // the _ref guard (regression for repo-internal absolute inputs).
    const cwd = tmpWorkspace("hook-proto-abs-ref");
    try {
      initGitRepo(cwd);

      const refRes = runEditHandler(cwd, { tool_input: { file_path: `${cwd}/_ref/upstream/README.md` } });
      expect(refRes.status).toBe(2);
      expect(refRes.stderr).toContain("[ExternalReferenceGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("pre-edit-guard: ignores paths outside the repo contract boundary", () => {
    // Case 2: an absolute path outside the repo (e.g. a global plan file under
    // ~/.claude/plans/...) must not be governed by this repo's sprint contract.
    // The repo-local hook can normalize repo-internal absolute paths, but it
    // should not turn an active contract into a global filesystem lock.
    const cwd = tmpWorkspace("hook-proto-abs-outside");
    const outsideRoot = realpathSync(mkdtempSync(join(tmpdir(), "hook-proto-outside-")));
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });

      const planPath = "plans/plan-20260528-2300-outside.md";
      writeFileSync(join(cwd, planPath), "# Plan: outside\n\n> **Status**: Approved\n");
      writeActivePlan(cwd, planPath);
      writeFileSync(
        join(cwd, "tasks/contracts/outside.contract.md"),
        [
          "# Task Contract: outside",
          "",
          "> **Status**: Pending",
          `> **Plan**: ${planPath}`,
          "",
          "## Allowed Paths",
          "",
          "```yaml",
          "allowed_paths:",
          "  - src/",
          "```",
          "",
        ].join("\n")
      );

      const outsidePath = join(outsideRoot, "some-other-file.md");
      const res = runEditHandler(cwd, { tool_input: { file_path: outsidePath } });
      expect(res.status).toBe(0);
      expect(res.stderr).not.toContain("[ContractScopeGuard]");
      expect(res.stdout).not.toContain("[ContractScopeGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  test("ContractScopeGuard: absolute paths under allowed_paths directories are NOT blocked", () => {
    // The bug we are fixing: an absolute path like
    // /Users/.../repo/.ai/hooks/foo.sh used to be reported as outside the
    // contract because the allowed_paths pattern `.ai/hooks/` is repo-relative
    // and `==` shell glob match never matched the absolute form.
    const cwd = tmpWorkspace("hook-proto-abs-allowed");
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, ".ai/hooks"), { recursive: true });

      const planPath = "plans/plan-20260528-2310-allowed.md";
      writeFileSync(join(cwd, planPath), "# Plan: allowed\n\n> **Status**: Approved\n");
      writeActivePlan(cwd, planPath);
      writeFileSync(
        join(cwd, "tasks/contracts/allowed.contract.md"),
        [
          "# Task Contract: allowed",
          "",
          "> **Status**: Pending",
          `> **Plan**: ${planPath}`,
          "",
          "## Allowed Paths",
          "",
          "```yaml",
          "allowed_paths:",
          "  - .ai/hooks/",
          "  - src/",
          "```",
          "",
        ].join("\n")
      );
      writeFileSync(join(cwd, ".ai/hooks/sample.sh"), "#!/bin/bash\necho sample\n");

      const res = runEditHandler(cwd, { tool_input: { file_path: `${cwd}/.ai/hooks/sample.sh` } });
      // ContractScopeGuard must NOT trip — the path is inside an allowed
      // directory. Other guards may emit advisories on stdout (TDD/BDD
      // reminders) but the hook must exit 0.
      expect(res.status).toBe(0);
      expect(res.stderr).not.toContain("[ContractScopeGuard]");
      expect(res.stdout).not.toContain("[ContractScopeGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("hook_structured_error: writes the diagnostic to stderr while keeping stdout telemetry JSON", () => {
    // Spec: the structured error MUST be readable by both the human (stderr → Claude / user)
    // and by automated trace consumers (stdout JSON unchanged for backwards compatibility).
    const cwd = tmpWorkspace("hook-proto-emit-shape");
    try {
      initGitRepo(cwd);
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      writeFileSync(join(cwd, ".claude/.require-worktree"), "1\n");

      const res = runEditHandler(cwd, {});
      expect(res.status).toBe(2);
      // stderr keeps the human-readable diagnostic (this is what Claude / the user reads).
      expect(res.stderr).toContain("[WorktreeGuard]");
      // stdout still emits the structured telemetry JSON (existing trace/log consumers depend on it).
      expect(res.stdout).toContain('"failure_class":"state_violation"');
      expect(res.stdout).toContain('"guard":"WorktreeGuard"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
