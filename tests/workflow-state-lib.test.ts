import { describe, test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs";
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

  test("external acceptance parser enforces reviewer, source, blockers, manual override, and a supported rubric", () => {
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
      // pass.review.md has a correct reviewer/source/blockers but no rubric line.
      // A rubric-less review can no longer pass external acceptance (it cannot be
      // proven legacy); the happy pass path is covered end-to-end in
      // hook-runtime.test.ts where a real fingerprint binding is available.
      expect(res.stdout).toContain("fail\tClaude\tclaude-review\tReview Rubric Version is missing; rerun peer acceptance under a supported rubric or record a Manual Override.");
      // P1 blockers are checked before the rubric, so this still reports blockers.
      expect(res.stdout).toContain("fail\tClaude\tclaude-review\tExternal acceptance has P1 blockers: release regression");
      // Manual Override is honoured before the rubric check, so override still wins.
      expect(res.stdout).toContain("manual_override\t-\tclaude-review\tManual override recorded for external acceptance");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("workflow_review_rubric_class accepts both the legacy (1) and current (2) rubric versions and still rejects unsupported ones", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-rubric-class-")));
    try {
      writeFileSync(
        join(cwd, "v1.review.md"),
        ["# Task Review: demo", "", "> **Review Rubric Version**: 1", ""].join("\n")
      );
      writeFileSync(
        join(cwd, "v2.review.md"),
        ["# Task Review: demo", "", "> **Review Rubric Version**: 2", ""].join("\n")
      );
      writeFileSync(
        join(cwd, "v3.review.md"),
        ["# Task Review: demo", "", "> **Review Rubric Version**: 3", ""].join("\n")
      );
      writeFileSync(
        join(cwd, "absent.review.md"),
        ["# Task Review: demo", "", "> **Recommendation**: pass", ""].join("\n")
      );

      const res = spawnSync(
        "bash",
        [
          "-lc",
          [
            'source "$WORKFLOW_STATE"',
            'workflow_review_rubric_class "$PWD/v1.review.md"; printf "\\n"',
            'workflow_review_rubric_class "$PWD/v2.review.md"; printf "\\n"',
            'workflow_review_rubric_class "$PWD/v3.review.md"; printf "\\n"',
            'workflow_review_rubric_class "$PWD/absent.review.md"; printf "\\n"',
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
      const lines = res.stdout.split("\n").filter((line) => line.length > 0);
      expect(lines).toEqual(["1", "2", "malformed", "absent"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("workflow_checks_pass binds regenerated harness report bytes independently of implementation freshness", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-benchmark-evidence-")));
    try {
      mkdirSync(join(cwd, "evals/harness/reports"), { recursive: true });
      writeFileSync(join(cwd, "evals/harness/reports/profile-comparison.json"), '{"authoritative":true}\n');
      writeFileSync(join(cwd, "evals/harness/reports/profile-comparison.md"), '# Authoritative\n');
      const fingerprint = spawnSync(
        "bash",
        ["-lc", 'source "$WORKFLOW_STATE"; workflow_benchmark_evidence_fingerprint'],
        { cwd, encoding: "utf-8", env: { ...process.env, WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh") } },
      );
      expect(fingerprint.status).toBe(0);
      expect(fingerprint.stdout).toMatch(/^sha256:[0-9a-f]{64}$/);
      writeFileSync(join(cwd, "checks.json"), JSON.stringify({
        status: "pass",
        source: "verify-sprint",
        exit_code: 0,
        contract: { file: "tasks/contracts/demo.contract.md" },
        review: { file: "tasks/reviews/demo.review.md" },
        benchmark_evidence: { status: "present", fingerprint: fingerprint.stdout },
      }));
      const check = () => spawnSync(
        "bash",
        ["-c", 'source "$WORKFLOW_STATE"; workflow_checks_pass checks.json tasks/contracts/demo.contract.md tasks/reviews/demo.review.md'],
        { cwd, encoding: "utf-8", env: { ...process.env, WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh") } },
      );
      expect(check().status).toBe(0);

      const noJqBin = join(cwd, "no-jq-bin");
      mkdirSync(noJqBin);
      symlinkSync(process.execPath, join(noJqBin, "bun"));
      symlinkSync("/usr/bin/grep", join(noJqBin, "grep"));
      const noJqCheck = () => spawnSync(
        "/bin/bash",
        ["-c", 'source "$WORKFLOW_STATE"; workflow_checks_pass checks.json tasks/contracts/demo.contract.md tasks/reviews/demo.review.md'],
        {
          cwd,
          encoding: "utf-8",
          env: {
            ...process.env,
            PATH: noJqBin,
            WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh"),
          },
        },
      );
      expect(noJqCheck().status).toBe(0);

      writeFileSync(join(cwd, "evals/harness/reports/profile-comparison.json"), '{"authoritative":false}\n');
      const stale = check();
      expect(stale.status).toBe(1);
      expect(stale.stdout).toContain("Structured checks are stale for benchmark evidence");
      const staleWithoutJq = noJqCheck();
      expect(staleWithoutJq.status).toBe(1);
      expect(staleWithoutJq.stdout).toContain("Structured checks are stale for benchmark evidence");

      writeFileSync(join(cwd, "checks.json"), JSON.stringify({
        status: "pass",
        source: "verify-sprint",
        exit_code: 0,
        contract: { file: "tasks/contracts/demo.contract.md" },
        review: { file: "tasks/reviews/demo.review.md" },
      }));
      const legacy = check();
      expect(legacy.status).toBe(1);
      expect(legacy.stdout).toContain("invalid or legacy benchmark evidence status");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
