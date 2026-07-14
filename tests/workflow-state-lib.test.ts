import { describe, test, expect } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const HELPER_DIR = join(ROOT, "assets", "templates", "helpers");

// Fixture subprocesses must never see the host repo's REPO_HARNESS_*/HOOK_REPO_ROOT
// env: verify-sprint.sh cds into REPO_HARNESS_TARGET_REPO_ROOT when set, which lets
// a fixture gate escape into the real repo and recursively execute the real
// contract's exit criteria (which run this very test file).
function fixtureEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("REPO_HARNESS_") || key === "HOOK_REPO_ROOT") continue;
    env[key] = value;
  }
  return env;
}

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

  test("verify-sprint scopes source-authority hook resolution to review subjects", () => {
    for (const path of [
      join(ROOT, "scripts", "verify-sprint.sh"),
      join(ROOT, "assets", "templates", "helpers", "verify-sprint.sh"),
    ]) {
      const helper = readFileSync(path, "utf-8");
      expect(helper).toContain('HOOK_REPO_ROOT="$REPO_HARNESS_SOURCE_ROOT" "$callback" "$@"');
      expect(helper).toContain('workflow_source_authority_call workflow_current_review_subject_value');
      expect(helper).toContain('workflow_source_authority_call workflow_external_acceptance_status "$review_file"');
      expect(helper).not.toContain('export HOOK_REPO_ROOT="$REPO_HARNESS_SOURCE_ROOT"');
    }
  });

  test("external acceptance parser enforces reviewer, source, blockers, and rubric v2 without override fallback", () => {
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
            ...fixtureEnv(),
            WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh"),
          },
        }
      );

      expect(res.status).toBe(0);
      // pass.review.md has a correct reviewer/source/blockers but no rubric line.
      // A rubric-less review can no longer pass external acceptance (it cannot be
      // proven legacy); the happy pass path is covered end-to-end in
      // hook-runtime.test.ts where a real fingerprint binding is available.
      expect(res.stdout).toContain("fail\tClaude\tclaude-review\tReview Rubric Version is missing; rerun peer acceptance under rubric v2.");
      // P1 blockers are checked before the rubric, so this still reports blockers.
      expect(res.stdout).toContain("fail\tClaude\tclaude-review\tExternal acceptance has P1 blockers: release regression");
      expect(res.stdout).toContain("fail\t-\tclaude-review\tExternal acceptance is unavailable");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("workflow_review_rubric_class accepts only current rubric v2", () => {
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
            ...fixtureEnv(),
            WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh"),
          },
        }
      );

      expect(res.status).toBe(0);
      const lines = res.stdout.split("\n").filter((line) => line.length > 0);
      expect(lines).toEqual(["malformed", "2", "malformed", "absent"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("workflow checks reject legacy byte-only benchmark evidence", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-benchmark-evidence-")));
    try {
      mkdirSync(join(cwd, "evals/harness/reports"), { recursive: true });
      writeFileSync(join(cwd, "evals/harness/reports/profile-comparison.json"), '{"authoritative":true}\n');
      writeFileSync(join(cwd, "evals/harness/reports/profile-comparison.md"), '# Authoritative\n');
      const fingerprint = spawnSync(
        "bash",
        ["-lc", 'source "$WORKFLOW_STATE"; workflow_benchmark_evidence_fingerprint'],
        { cwd, encoding: "utf-8", env: { ...fixtureEnv(), WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh") } },
      );
      expect(fingerprint.status).toBe(1);
      expect(fingerprint.stdout).toBe("");
      writeFileSync(join(cwd, "checks.json"), JSON.stringify({
        status: "pass",
        source: "verify-sprint",
        exit_code: 0,
        contract: { file: "tasks/contracts/demo.contract.md" },
        review: { file: "tasks/reviews/demo.review.md" },
        benchmark_evidence: { status: "present", report_sha256: "sha256:" + "0".repeat(64), benchmark_subject_sha256: "sha256:" + "1".repeat(64) },
      }));
      const check = () => spawnSync(
        "bash",
        ["-c", 'source "$WORKFLOW_STATE"; workflow_checks_pass checks.json tasks/contracts/demo.contract.md tasks/reviews/demo.review.md'],
        { cwd, encoding: "utf-8", env: { ...fixtureEnv(), WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh") } },
      );
      const stale = check();
      expect(stale.status).toBe(1);
      expect(stale.stdout).toContain("Structured checks are stale for benchmark evidence");

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

  test("a Human Review Card pass cannot rescue a canonical external-acceptance failure when the canonical helper is unavailable", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-external-acceptance-no-fallback-")));
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      for (const file of readdirSync(HELPER_DIR).filter((name) => name.endsWith(".sh") || name.endsWith(".ts"))) {
        copyFileSync(join(HELPER_DIR, file), join(cwd, "scripts", file));
      }
      for (const file of readdirSync(join(cwd, "scripts"))) {
        if (file.endsWith(".sh")) chmodSync(join(cwd, "scripts", file), 0o755);
      }
      // Deliberately no ".ai/hooks/lib/workflow-state.sh" in this fixture, so
      // `declare -F workflow_external_acceptance_status` is false inside
      // verify-sprint.sh and external_status never leaves its hardcoded
      // fail-closed default ("missing"); canonical is never actually consulted.
      // This covers the "helper absent" leg of fail-closed. The two tests below
      // install the real helper and drive canonical to actively compute "fail".

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "tasks/contracts/demo.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "> **Status**: Active",
          "> **Task Profile**: code-change",
          "",
          "```yaml",
          "allowed_paths:",
          "  - docs",
          "  - tasks",
          "exit_criteria:",
          "  files_exist:",
          "    - docs/spec.md",
          "```",
          "",
        ].join("\n"),
      );
      // Canonical "## External Acceptance Advice" reports unavailable (no
      // manual override), while the "## Human Review Card"'s own "External
      // acceptance" field independently claims pass. Only the canonical
      // section is authoritative; the Card field is a display projection.
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          "## Human Review Card",
          "",
          "- Verdict: pass",
          "- Change type: code-change",
          "- Intended files changed: fixture",
          "- Actual files changed: fixture",
          "- Commands passed: fixture",
          "- External acceptance: pass",
          "- Residual risks: (none)",
          "- Reviewer action required: approve fixture closeout",
          "- Rollback: revert fixture branch",
          "",
          "## External Acceptance Advice",
          "",
          "> **External Acceptance**: unavailable",
          "> **External Reviewer**:",
          "> **External Source**:",
          "> **External Started**:",
          "> **External Completed**:",
          "",
          "- P1 blockers: unavailable",
          "- P2 advisories: unavailable",
          "- Acceptance checklist: unavailable",
          "",
        ].join("\n"),
      );

      const res = spawnSync("bash", ["scripts/verify-sprint.sh"], {
        cwd,
        encoding: "utf-8",
        env: { ...fixtureEnv(), HOOK_HOST: "claude" },
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Sprint verification failed");

      const checks = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/latest.json"), "utf-8"));
      expect(checks.status).toBe("fail");
      expect(checks.failure_class).toBe("external_acceptance");
      expect(checks.contract.status).toBe("pass");
      expect(checks.review.status).toBe("pass");
      // The retired Card field is not projected into the canonical trace and
      // therefore cannot rescue the canonical gate.
      expect(checks.review.card.external_acceptance).toBeUndefined();
      expect(checks.external_acceptance.status).toBe("missing");
      expect(checks.external_acceptance.status).not.toBe("pass");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a Human Review Card pass cannot rescue a canonical external-acceptance failure when canonical reports P1 blockers", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-external-acceptance-p1-blockers-")));
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      for (const file of readdirSync(HELPER_DIR).filter((name) => name.endsWith(".sh") || name.endsWith(".ts"))) {
        copyFileSync(join(HELPER_DIR, file), join(cwd, "scripts", file));
      }
      for (const file of readdirSync(join(cwd, "scripts"))) {
        if (file.endsWith(".sh")) chmodSync(join(cwd, "scripts", file), 0o755);
      }
      // Install the real canonical helper so workflow_external_acceptance_status
      // is declared and actively evaluates the review file below, instead of
      // leaving external_status at its hardcoded default.
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh"),
      );
      // Once the canonical helper is installed, verify-sprint resolves
      // contract/review paths through workflow_active_contract/_review, which
      // require an active-plan marker rather than the directory-scan fallback
      // used when the helper is absent.
      writeFileSync(
        join(cwd, "plans/plan-20260304-1605-demo.md"),
        [
          "# Plan: demo",
          "",
          "> **Status**: Executing",
          "> **Task Contract**: tasks/contracts/demo.contract.md",
          "> **Task Review**: tasks/reviews/demo.review.md",
          "",
        ].join("\n"),
      );
      writeFileSync(join(cwd, ".ai/harness/active-plan"), "plans/plan-20260304-1605-demo.md\n");

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "tasks/contracts/demo.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "> **Status**: Active",
          "> **Task Profile**: code-change",
          "",
          "```yaml",
          "allowed_paths:",
          "  - docs",
          "  - tasks",
          "exit_criteria:",
          "  files_exist:",
          "    - docs/spec.md",
          "```",
          "",
        ].join("\n"),
      );
      // Reviewer/source match HOOK_HOST=claude's expected Codex/codex-review,
      // and the acceptance field itself is "pass" -- but the Advice section
      // carries a live P1 blocker. workflow_external_acceptance_status checks
      // P1 blockers before the rubric/fingerprint binding, so this must return
      // "fail", not any status the gate's case statement treats as passing.
      // The Human Review Card still claims pass to prove it cannot rescue this.
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          "## Human Review Card",
          "",
          "- Verdict: pass",
          "- Change type: code-change",
          "- Intended files changed: fixture",
          "- Actual files changed: fixture",
          "- Commands passed: fixture",
          "- External acceptance: pass",
          "- Residual risks: (none)",
          "- Reviewer action required: approve fixture closeout",
          "- Rollback: revert fixture branch",
          "",
          "## External Acceptance Advice",
          "",
          "> **External Acceptance**: pass",
          "> **External Reviewer**: Codex",
          "> **External Source**: codex-review",
          "> **External Started**: 2026-03-04T14:05:00+0800",
          "> **External Completed**: 2026-03-04T14:06:00+0800",
          "",
          "- P1 blockers: release regression",
          "- P2 advisories: none",
          "- Acceptance checklist: pass",
          "",
        ].join("\n"),
      );

      const res = spawnSync("bash", ["scripts/verify-sprint.sh"], {
        cwd,
        encoding: "utf-8",
        env: { ...fixtureEnv(), HOOK_HOST: "claude" },
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Sprint verification failed");

      const checks = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/latest.json"), "utf-8"));
      expect(checks.status).toBe("fail");
      expect(checks.failure_class).toBe("external_acceptance");
      expect(checks.contract.status).toBe("pass");
      expect(checks.review.status).toBe("pass");
      expect(checks.review.card.external_acceptance).toBeUndefined();
      expect(checks.external_acceptance.status).toBe("fail");
      expect(checks.external_acceptance.message).toContain("External acceptance has P1 blockers: release regression");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a Human Review Card pass cannot rescue a canonical external-acceptance failure when the review rubric is malformed", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-external-acceptance-malformed-rubric-")));
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      for (const file of readdirSync(HELPER_DIR).filter((name) => name.endsWith(".sh") || name.endsWith(".ts"))) {
        copyFileSync(join(HELPER_DIR, file), join(cwd, "scripts", file));
      }
      for (const file of readdirSync(join(cwd, "scripts"))) {
        if (file.endsWith(".sh")) chmodSync(join(cwd, "scripts", file), 0o755);
      }
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh"),
      );
      writeFileSync(
        join(cwd, "plans/plan-20260304-1605-demo.md"),
        [
          "# Plan: demo",
          "",
          "> **Status**: Executing",
          "> **Task Contract**: tasks/contracts/demo.contract.md",
          "> **Task Review**: tasks/reviews/demo.review.md",
          "",
        ].join("\n"),
      );
      writeFileSync(join(cwd, ".ai/harness/active-plan"), "plans/plan-20260304-1605-demo.md\n");

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "tasks/contracts/demo.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "> **Status**: Active",
          "> **Task Profile**: code-change",
          "",
          "```yaml",
          "allowed_paths:",
          "  - docs",
          "  - tasks",
          "exit_criteria:",
          "  files_exist:",
          "    - docs/spec.md",
          "```",
          "",
        ].join("\n"),
      );
      // The top-of-file "Review Rubric Version" is present but unsupported
      // ("invalid" is neither 1 nor 2), so workflow_review_rubric_class returns
      // "malformed" and workflow_external_acceptance_status fails closed rather
      // than falling through to the lenient legacy (absent-rubric) path.
      // Reviewer, source, and P1 blockers all check out clean, isolating the
      // malformed rubric as the sole cause of the failure.
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          "> **Review Rubric Version**: invalid",
          "",
          "## Human Review Card",
          "",
          "- Verdict: pass",
          "- Change type: code-change",
          "- Intended files changed: fixture",
          "- Actual files changed: fixture",
          "- Commands passed: fixture",
          "- External acceptance: pass",
          "- Residual risks: (none)",
          "- Reviewer action required: approve fixture closeout",
          "- Rollback: revert fixture branch",
          "",
          "## External Acceptance Advice",
          "",
          "> **External Acceptance**: pass",
          "> **External Reviewer**: Codex",
          "> **External Source**: codex-review",
          "> **External Started**: 2026-03-04T14:05:00+0800",
          "> **External Completed**: 2026-03-04T14:06:00+0800",
          "",
          "- P1 blockers: none",
          "- P2 advisories: none",
          "- Acceptance checklist: pass",
          "",
        ].join("\n"),
      );

      const res = spawnSync("bash", ["scripts/verify-sprint.sh"], {
        cwd,
        encoding: "utf-8",
        env: { ...fixtureEnv(), HOOK_HOST: "claude" },
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Sprint verification failed");

      const checks = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/latest.json"), "utf-8"));
      expect(checks.status).toBe("fail");
      expect(checks.failure_class).toBe("external_acceptance");
      expect(checks.contract.status).toBe("pass");
      expect(checks.review.status).toBe("pass");
      expect(checks.review.card.external_acceptance).toBeUndefined();
      expect(checks.external_acceptance.status).toBe("fail");
      expect(checks.external_acceptance.message).toContain("Review Rubric Version is malformed or unsupported");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("verify-sprint external acceptance gate only accepts statuses canonical can actually produce", () => {
    // The cutover admits exactly one passing status. Neither a manual override
    // nor a profile-based bypass can satisfy the canonical acceptance gate.
    for (const path of [
      join(ROOT, "scripts", "verify-sprint.sh"),
      join(ROOT, "assets", "templates", "helpers", "verify-sprint.sh"),
    ]) {
      const helper = readFileSync(path, "utf-8");
      expect(helper).toContain('  pass)\n    external_gate="pass"');
      expect(helper).not.toContain("manual_override");
      expect(helper).not.toContain("not_required");
    }
  });
});
