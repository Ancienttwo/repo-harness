import { describe, test, expect } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
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

// Minimal git fixture so workflow_current_review_subject_json (via the real
// review-subject CLI) can resolve a genuine "ok" subject/target pair. Only the
// contract-scoped benchmark-evidence regressions need a real subject binding;
// every other test in this file exercises fail-fast paths that never reach it.
function initEvidenceGitRepo(cwd: string): void {
  expect(spawnSync("git", ["init", "-q"], { cwd, encoding: "utf-8" }).status).toBe(0);
  expect(spawnSync("git", ["config", "user.name", "Workflow Test"], { cwd, encoding: "utf-8" }).status).toBe(0);
  expect(spawnSync("git", ["config", "user.email", "workflow-test@example.com"], { cwd, encoding: "utf-8" }).status).toBe(0);
  writeFileSync(join(cwd, "tracked.txt"), "base\n");
  expect(spawnSync("git", ["add", "tracked.txt"], { cwd, encoding: "utf-8" }).status).toBe(0);
  expect(spawnSync("git", ["commit", "-q", "-m", "init"], { cwd, encoding: "utf-8" }).status).toBe(0);
  expect(spawnSync("git", ["branch", "-M", "main"], { cwd, encoding: "utf-8" }).status).toBe(0);
}

// Computes the real review subject/target for the fixture's CURRENT working
// tree by invoking the same CLI workflow_current_review_subject_json shells
// out to. Must be called only after every file that affects the subject
// (contracts, source, anything outside tasks/reviews/*.review.md) is already
// in its final byte-for-byte state.
function currentReviewFingerprint(cwd: string): { subject: string; target: string } {
  const res = spawnSync(
    "bun",
    [join(ROOT, "src/cli/hook-entry.ts"), "review-subject", "--target", "main", "--format", "json"],
    { cwd, encoding: "utf-8" }
  );
  expect(res.status).toBe(0);
  const parsed = JSON.parse(res.stdout);
  expect(parsed.status).toBe("ok");
  expect(parsed.review_subject_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(parsed.target_rev).toMatch(/^[0-9a-f]{40,64}$/);
  return { subject: parsed.review_subject_sha256, target: parsed.target_rev };
}

function evidenceAcceptanceEnv(): NodeJS.ProcessEnv {
  return {
    ...fixtureEnv(),
    WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh"),
    REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
  };
}

function writeEvidenceReview(cwd: string, fp: { subject: string; target: string }, benchmarkValue: string): void {
  writeFileSync(
    join(cwd, "tasks/reviews/demo.review.md"),
    [
      "# Task Review: demo",
      "",
      "> **Recommendation**: pass",
      "",
      // workflow_review_rubric_class reads Review Rubric Version as top-of-file
      // metadata only (it stops at the first "## " heading), so it must sit
      // here, not inside the External Acceptance Advice section below.
      "> **Review Rubric Version**: 2",
      "",
      "## External Acceptance Advice",
      "",
      "> **External Acceptance**: pass",
      "> **External Reviewer**: Claude",
      "> **External Source**: claude-review",
      "> **External Started**: 2026-03-04T14:05:00+0800",
      "> **External Completed**: 2026-03-04T14:06:00+0800",
      `> **Reviewed Subject SHA256**: ${fp.subject}`,
      "> **Reviewed Subject Scope**: normalized-final-content",
      `> **Reviewed Target Revision**: ${fp.target}`,
      `> **Benchmark Evidence SHA256**: ${benchmarkValue}`,
      "",
      "- P1 blockers: none",
      "- P2 advisories: none",
      "- Acceptance checklist: pass",
      "",
    ].join("\n")
  );
}

function runEvidenceAcceptance(cwd: string) {
  return spawnSync(
    "bash",
    ["-lc", 'source "$WORKFLOW_STATE"; HOOK_HOST=codex workflow_external_acceptance_status "$PWD/tasks/reviews/demo.review.md"'],
    { cwd, encoding: "utf-8", env: evidenceAcceptanceEnv() }
  );
}

function runEvidenceChecksMatch(cwd: string) {
  return spawnSync(
    "bash",
    ["-lc", 'source "$WORKFLOW_STATE"; workflow_benchmark_evidence_checks_match checks.json'],
    { cwd, encoding: "utf-8", env: { ...fixtureEnv(), WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh") } }
  );
}

function runEvidenceRequirement(cwd: string, contractRelPath: string) {
  return spawnSync(
    "bash",
    ["-lc", `source "$WORKFLOW_STATE"; workflow_contract_evidence_requirement "$PWD/${contractRelPath}"`],
    { cwd, encoding: "utf-8", env: { ...fixtureEnv(), WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh") } }
  );
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

  test("reads only the verified AcceptanceReceipt projection from structured checks", () => {
    const cwd = mkdtempSync(join(tmpdir(), "workflow-acceptance-receipt-"));
    try {
      writeFileSync(join(cwd, "checks.json"), JSON.stringify({
        acceptance_receipt: {
          status: "pass",
          reviewer: "User",
          source: "user-waiver",
          message: "AcceptanceReceipt user_waiver is valid.",
        },
      }));
      const result = spawnSync("bash", ["-lc", 'source "$WORKFLOW_STATE"; workflow_acceptance_receipt_status "$PWD/checks.json"'], {
        cwd,
        encoding: "utf-8",
        env: { ...fixtureEnv(), WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh") },
      });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("pass\tUser\tuser-waiver\tAcceptanceReceipt user_waiver is valid.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("verify-sprint treats review Markdown as an AcceptanceReceipt projection only", () => {
    const helper = readFileSync(
      join(ROOT, "assets", "templates", "helpers", "verify-sprint.sh"),
      "utf-8"
    );

    expect(helper).not.toContain("Recommendation\\*\\*:[[:space:]]*pass");
    expect(helper).toContain("Review artifact is available for deterministic AcceptanceReceipt projection.");
    expect(helper).toContain('acceptance-receipt.ts" project');
  });

  test("verify-sprint scopes source-authority hook resolution to review subjects", () => {
    for (const path of [
      join(ROOT, "scripts", "verify-sprint.sh"),
      join(ROOT, "assets", "templates", "helpers", "verify-sprint.sh"),
    ]) {
      const helper = readFileSync(path, "utf-8");
      expect(helper).toContain('HOOK_REPO_ROOT="$REPO_HARNESS_SOURCE_ROOT" "$callback" "$@"');
      expect(helper).toContain('workflow_source_authority_call workflow_current_review_subject_value');
      expect(helper).toContain('acceptance-receipt.ts" verify --contract "$contract_file"');
      expect(helper).not.toContain('export HOOK_REPO_ROOT="$REPO_HARNESS_SOURCE_ROOT"');
    }
  });

  test("retired review-rubric prose parsers are absent from workflow authority", () => {
    const source = readFileSync(join(ROOT, "assets/hooks/lib/workflow-state.sh"), "utf-8");
    expect(source).not.toContain("workflow_review_rubric_class()");
    expect(source).not.toContain("workflow_review_freshness_status()");
    expect(source).not.toContain("workflow_review_recommends_pass()");
  });

  test("workflow checks reject legacy byte-only benchmark evidence", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-benchmark-evidence-")));
    try {
      mkdirSync(join(cwd, "evals/harness/reports"), { recursive: true });
      writeFileSync(join(cwd, "evals/harness/reports/profile-comparison.json"), '{"authoritative":true}\n');
      writeFileSync(join(cwd, "evals/harness/reports/profile-comparison.md"), '# Authoritative\n');
      // workflow_benchmark_evidence_checks_match now resolves this contract's
      // evidence_requirements declaration before looking at recorded status;
      // this fixture is about a "present but stale/legacy" evidence status, so
      // the contract must declare `required` for that framing to still apply.
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      writeFileSync(
        join(cwd, "tasks/contracts/demo.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: required",
          "```",
          "",
        ].join("\n")
      );
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

  // R-D (fix 4, hardened in fix-round-2 after external review): benchmark:
  // must be an unambiguous DIRECT child of the single declaring
  // evidence_requirements: line -- fail closed (print nothing, nonzero) on
  // a duplicate benchmark: key within the declaration scope, on a
  // benchmark: that only exists nested under an unrelated sibling key, and
  // on a benchmark: nested one level deeper than the declaration's actual
  // direct child (a grandchild, e.g. evidence_requirements: -> other_key:
  // -> benchmark:) -- the last case is what fix-round-1's original
  // "indent > er_indent" scope check missed, since it accepted any deeper
  // indent rather than requiring the exact direct-child indent.
  test("workflow_contract_evidence_requirement fails closed on a duplicate benchmark: key, a sibling-nested benchmark:, and a grandchild-nested benchmark:", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-evidence-requirement-hardening-")));
    try {
      writeFileSync(
        join(cwd, "duplicate-benchmark.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: required",
          "  benchmark: not_applicable",
          "```",
          "",
        ].join("\n")
      );
      const duplicate = runEvidenceRequirement(cwd, "duplicate-benchmark.contract.md");
      expect(duplicate.status).not.toBe(0);
      expect(duplicate.stdout).toBe("");

      writeFileSync(
        join(cwd, "nested-sibling-benchmark.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  something: value",
          "other_key:",
          "  nested:",
          "    benchmark: required",
          "```",
          "",
        ].join("\n")
      );
      const nestedSibling = runEvidenceRequirement(cwd, "nested-sibling-benchmark.contract.md");
      expect(nestedSibling.status).not.toBe(0);
      expect(nestedSibling.stdout).toBe("");

      writeFileSync(
        join(cwd, "nested-grandchild-benchmark.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  other_key:",
          "    benchmark: required",
          "```",
          "",
        ].join("\n")
      );
      const nestedGrandchild = runEvidenceRequirement(cwd, "nested-grandchild-benchmark.contract.md");
      expect(nestedGrandchild.status).not.toBe(0);
      expect(nestedGrandchild.stdout).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  // R-D (fix 4, second hardening after a third external review round): a `#`
  // only starts a YAML comment when it is the first character on the line or
  // is preceded by whitespace. The prior comment-stripping regex used
  // `[[:space:]]*#` (zero or more whitespace), so an inline `#` glued
  // directly onto a scalar with no separating space -- e.g.
  // "not_applicable#required" -- was stripped as if it were a trailing
  // comment, silently truncating the malformed value into a valid-looking
  // "not_applicable" instead of failing closed on the garbage suffix.
  test("workflow_contract_evidence_requirement fails closed on a value with no whitespace before a trailing #, and still strips a real whitespace-separated comment", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-evidence-requirement-comment-")));
    try {
      writeFileSync(
        join(cwd, "glued-hash-benchmark.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable#required",
          "```",
          "",
        ].join("\n")
      );
      const glued = runEvidenceRequirement(cwd, "glued-hash-benchmark.contract.md");
      expect(glued.status).not.toBe(0);
      expect(glued.stdout).toBe("");

      writeFileSync(
        join(cwd, "real-comment-benchmark.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable  # trailing note, whitespace-separated",
          "```",
          "",
        ].join("\n")
      );
      const realComment = runEvidenceRequirement(cwd, "real-comment-benchmark.contract.md");
      expect(realComment.status).toBe(0);
      expect(realComment.stdout).toBe("not_applicable");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("workflow_contract_evidence_requirement fails closed when parser sentinels appear as yaml content", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-evidence-requirement-sentinel-")));
    try {
      for (const [name, marker] of [
        ["begin", "@@workflow_contract_evidence_requirement:begin@@"],
        ["end", "@@workflow_contract_evidence_requirement:end@@"],
      ] as const) {
        writeFileSync(
          join(cwd, `${name}-marker.contract.md`),
          [
            "# Task Contract: demo",
            "",
            "```yaml",
            "evidence_requirements:",
            "  benchmark: not_applicable",
            marker,
            "evidence_requirements:",
            "  benchmark: required",
            "```",
            "",
          ].join("\n")
        );
        const result = runEvidenceRequirement(cwd, `${name}-marker.contract.md`);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe("");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("workflow_contract_evidence_requirement fails closed on quoted spellings of canonical evidence keys", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-evidence-requirement-quoted-key-")));
    try {
      for (const [name, quotedLine] of [
        ["duplicate-declaration", '"evidence_requirements":'],
        ["duplicate-benchmark", "  'benchmark': required"],
      ] as const) {
        writeFileSync(
          join(cwd, `${name}.contract.md`),
          [
            "# Task Contract: demo",
            "",
            "```yaml",
            "evidence_requirements:",
            "  benchmark: not_applicable",
            quotedLine,
            "```",
            "",
          ].join("\n")
        );
        const result = runEvidenceRequirement(cwd, `${name}.contract.md`);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe("");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("workflow_contract_evidence_requirement fails closed on whitespace-before-colon spellings of canonical evidence keys", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-evidence-requirement-spaced-key-")));
    try {
      writeFileSync(
        join(cwd, "spaced-key.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "  benchmark : required",
          "```",
          "",
        ].join("\n")
      );
      const result = runEvidenceRequirement(cwd, "spaced-key.contract.md");
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("workflow_benchmark_evidence_checks_match never invokes the validator when the contract declares not_applicable", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-evidence-requirement-na-no-invoke-")));
    try {
      initEvidenceGitRepo(cwd);

      mkdirSync(join(cwd, "evals/harness/reports"), { recursive: true });
      writeFileSync(join(cwd, "evals/harness/reports/profile-comparison.json"), '{"authoritative":true}\n');
      writeFileSync(join(cwd, "evals/harness/reports/profile-comparison.md"), '# Authoritative\n');

      const invokedMarker = join(cwd, "validator-was-invoked.marker");
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      writeFileSync(
        join(cwd, "scripts/validate-harness-profile-benchmark.ts"),
        [
          "#!/usr/bin/env bun",
          `require("fs").writeFileSync(${JSON.stringify(invokedMarker)}, "invoked");`,
          `process.stdout.write(JSON.stringify({ report_evidence_sha256: "sha256:${"a".repeat(64)}", benchmark_subject_sha256: "sha256:${"b".repeat(64)}" }));`,
          "",
        ].join("\n")
      );

      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      writeFileSync(
        join(cwd, "tasks/contracts/demo.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
        ].join("\n")
      );

      writeFileSync(join(cwd, "checks.json"), JSON.stringify({
        status: "pass",
        source: "verify-sprint",
        exit_code: 0,
        contract: { file: "tasks/contracts/demo.contract.md" },
        review: { file: "tasks/reviews/demo.review.md" },
        benchmark_evidence: { status: "not_applicable", report_sha256: "", benchmark_subject_sha256: "" },
      }));
      const checksMatch = runEvidenceChecksMatch(cwd);
      expect(checksMatch.status).toBe(0);
      expect(existsSync(invokedMarker)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

});
