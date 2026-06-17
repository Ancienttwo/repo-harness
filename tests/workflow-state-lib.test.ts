import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

describe("workflow-state shared library", () => {
  test("exports the shared workflow helper functions", () => {
    const content = readFileSync(
      join(ROOT, "assets/hooks/lib/workflow-state.sh"),
      "utf-8"
    );

    expect(content).toContain("is_git_repo()");
    expect(content).toContain("load_changed_paths()");
    expect(content).toContain("has_changes()");
    expect(content).toContain("has_changes_glob()");
    expect(content).toContain("get_active_plan()");
    expect(content).toContain("derive_contract_path()");
    expect(content).toContain("workflow_todo_total()");
    expect(content).toContain("workflow_todo_done()");
    expect(content).toContain("workflow_plan_task_state()");
    expect(content).toContain("workflow_next_action()");
    expect(content).toContain("stage its coherent diff first");
    expect(content).toContain("workflow_cleanup_candidate()");
    expect(content).toContain("workflow_sync_task_state_from_todo()");
    expect(content).toContain("has_research_for_new_plan()");
    expect(content).toContain("validate_plan_transition()");
    expect(content).toContain("contract_references_path()");
    expect(content).toContain("next_action=\"$(workflow_next_action)\"");
    expect(content).toContain("## Task Breakdown");
  });

  test("verify-sprint helper should use the same review pass pattern as workflow-state", () => {
    const helper = readFileSync(
      join(ROOT, "assets", "templates", "helpers", "verify-sprint.sh"),
      "utf-8"
    );

    expect(helper).toContain("^> \\*\\*Recommendation\\*\\*:[[:space:]]*pass");
    expect(helper).not.toContain("^\\> \\*\\*Recommendation\\*\\*:[[:space:]]*pass");
  });

  test("external acceptance parser enforces reviewer, source, blockers, and manual override", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-external-acceptance-")));
    try {
      writeFileSync(
        join(cwd, "pass.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          "## External Acceptance Advice",
          "",
          "> **External Acceptance**: pass",
          "> **External Reviewer**: Claude",
          "> **External Source**: claude-review",
          "> **External Started**: 2026-03-04T14:05:00+0800",
          "> **External Completed**: 2026-03-04T14:06:00+0800",
          "",
          "- P1 blockers: none",
          "- P2 advisories: none",
          "- Acceptance checklist: pass",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "blocker.review.md"),
        readFileSync(join(cwd, "pass.review.md"), "utf-8").replace("- P1 blockers: none", "- P1 blockers: release regression")
      );
      writeFileSync(
        join(cwd, "override.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          "## External Acceptance Advice",
          "",
          "> **External Acceptance**: unavailable",
          "> **External Reviewer**:",
          "> **External Source**: claude-review",
          "",
          "- P1 blockers: unavailable",
          "Manual Override: peer CLI auth is down; local reproduction and checks cover the acceptance surface",
          "",
        ].join("\n")
      );

      const res = spawnSync(
        "bash",
        [
          "-lc",
          [
            'source "$WORKFLOW_STATE"',
            'HOOK_HOST=codex workflow_external_acceptance_status "$PWD/pass.review.md"',
            'HOOK_HOST=codex workflow_external_acceptance_status "$PWD/blocker.review.md"',
            'HOOK_HOST=codex workflow_external_acceptance_status "$PWD/override.review.md"',
          ].join("\n"),
        ],
        {
          cwd,
          encoding: "utf-8",
          env: {
            ...process.env,
            WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh"),
          },
        }
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("pass\tClaude\tclaude-review\tExternal acceptance passed.");
      expect(res.stdout).toContain("fail\tClaude\tclaude-review\tExternal acceptance has P1 blockers: release regression");
      expect(res.stdout).toContain("manual_override\t-\tclaude-review\tManual override recorded for external acceptance");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
