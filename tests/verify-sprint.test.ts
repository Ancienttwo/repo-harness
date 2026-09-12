import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers, currentReviewBinding, expectChecksLatestAbsent, externalAcceptanceAdvice, HELPER_DIR, humanReviewCard, installAutomaticProjectionVerifyFixture, latestRunSnapshot, replaceVerificationPlan, reviewSubjectMetadata, ROOT, runSnapshotById, verificationCheck, verificationPlan, writeActivePlan } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("verify-sprint helper integration", () => {
  test("verify-sprint documents the expensive rerun audit contract", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-help");
    try {
      copyHelpers(cwd);
      const result = run("bash", ["scripts/verify-sprint.sh", "--help"], cwd);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("--force-expensive-rerun");
      expect(result.stdout).toContain("--reason <text>");
      expect(result.stdout).toContain("--prepare-acceptance");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("bundled verify-sprint binds the package-owned evidence emitter without a source-root override", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-pass");
    try {
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      copyHelpers(cwd);
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh")
      );
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        `${JSON.stringify({ worktree_strategy: { review_base: "main" } }, null, 2)}\n`,
      );

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "plans/plan-20260304-1600-demo.md"),
        "# Plan: demo\n\n> **Status**: Executing\n"
      );
      writeActivePlan(cwd, "plans/plan-20260304-1600-demo.md");
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
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
          verificationPlan([]),
          "## Change Assessment",
          "",
          "```json",
          '{"protocol":1,"oracles":[{"id":"fixture-deterministic","kind":"deterministic_test","paths":["*"]}]}',
          "```",
          "",
        ].join("\n")
      );
      initGitRepo(cwd);
      commitAll(cwd, "package helper baseline");
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n\nPackage helper change.\n");
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        ["# Task Review: demo", "", "> **Recommendation**: pass", reviewSubjectMetadata(cwd), "", humanReviewCard(), "", externalAcceptanceAdvice("Codex", "codex-review", cwd), ""].join("\n")
      );

      const res = run("bash", [join(HELPER_DIR, "verify-sprint.sh"), "--prepare-acceptance"], cwd, {
        REPO_HARNESS_TARGET_REPO_ROOT: cwd,
        REPO_HARNESS_CLI_BIN: join(ROOT, "src/cli/index.ts"),
        HOOK_HOST: "claude",
        REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
      });
      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      expect(res.stdout).toContain("Sprint verification passed");
      expect(res.stderr).not.toContain("evidence emission cannot bind");
      expect(existsSync(join(cwd, ".ai/harness/checks/latest.json"))).toBe(true);
      const { path: runFilePath, content: checks } = latestRunSnapshot(cwd);
      expect(checks.schema).toBe("repo-harness-run-trace.v1");
      expect(checks.status).toBe("pass");
      expect(checks.source).toBe("verify-sprint");
      expect(checks.command).toBe("repo-harness run verify-sprint");
      expect(checks.exit_code).toBe(0);
      expect(checks.task_profile).toBe("code-change");
      expect(checks.active_plan).toBe("plans/plan-20260304-1600-demo.md");
      expect(checks.commands.length).toBeGreaterThanOrEqual(2);
      expect(checks.contract.file).toBe("tasks/contracts/demo.contract.md");
      expect(checks.contract.status).toBe("pass");
      expect(checks.contract.task_profile).toBe("code-change");
      expect(checks.review.file).toBe("tasks/reviews/demo.review.md");
      expect(checks.review.status).toBe("pass");
      expect(checks.review.message).toContain("deterministic AcceptanceReceipt projection");
      expect(checks.review.card).toBeUndefined();
      expect(checks.acceptance_receipt.status).toBe("pending");
      expect(checks.acceptance_receipt.reviewer).toBe("");
      expect(checks.acceptance_receipt.source).toBe("");
      expect(checks.benchmark_evidence).toEqual({ status: "not_applicable", report_sha256: "", benchmark_subject_sha256: "" });
      expect(checks.allowed_paths_check.status).toBe("pass");
      expect(checks.run_file).toMatch(/^\.ai\/harness\/runs\/.+-demo\.json$/);
      expect(join(cwd, checks.run_file)).toBe(runFilePath);
      expect(checks.lifecycle.evidence_tier).toBe("harness-trace-v1");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint materializes an automatic projection before freezing the acceptance subject", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-projection-publication");
    try {
      const fakeCli = installAutomaticProjectionVerifyFixture(cwd);
      const res = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        REPO_HARNESS_CLI_BIN: fakeCli,
        HOOK_HOST: "claude",
        REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
      });

      const { content: checks } = latestRunSnapshot(cwd);
      expect(res.status, `${res.stdout}\n${res.stderr}\n${JSON.stringify(checks, null, 2)}`).toBe(0);
      expect(res.stderr).toContain("[ArchitectureProjection] acceptance materialization: applied");
      expect(readFileSync(join(cwd, "docs/architecture/.projection-manifest.json"), "utf8"))
        .toBe('{"projection":"acceptance-owned"}\n');
      expect(checks.files_changed).toContain("docs/architecture/.projection-manifest.json");
      expect(checks.allowed_paths_check.status).toBe("pass");
      expect(checks.contract.allowed_paths).not.toContain("docs/architecture/.projection-manifest.json");
      expect(checks.review_subject_sha256).toBe(currentReviewBinding(cwd).subject);
      expect(checks.contract.execution_evaluation).toMatchObject({ status: "passed", passed: true });
      expect(checks.contract.execution_evaluation.target.snapshot_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint blocks expensive criteria when a cheap acceptance preflight fails", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-cheap-preflight");
    try {
      const fakeCli = installAutomaticProjectionVerifyFixture(cwd, { gatedTaskSync: true });
      const fakeBin = join(cwd, "fake-bin");
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(
        join(fakeBin, "bun"),
        [
          "#!/bin/bash",
          "if [[ \"$*\" == \"test --timeout 60000\" ]]; then",
          "  printf 'run\\n' >> .ai/harness/runs/expensive-count",
          "  exit 0",
          "fi",
          `exec ${JSON.stringify(process.execPath)} "$@"`,
          "",
        ].join("\n"),
      );
      chmodSync(join(fakeBin, "bun"), 0o755);
      writeFileSync(join(cwd, ".git/info/exclude"), ".ai/harness/checks/\n.ai/harness/runs/\n.ai/harness/evidence/\n.ai/harness/task-sync-ready\nfake-bin/\n");
      const contractPath = join(cwd, "tasks/contracts/projection-fixture.contract.md");
      writeFileSync(
        contractPath,
        replaceVerificationPlan(readFileSync(contractPath, "utf-8"), [
          verificationCheck("task-sync", "bash scripts/check-task-sync.sh", "preflight", "normal"),
          verificationCheck("full-suite", "bun test --timeout 60000", "verification", "expensive"),
        ]),
      );
      const baseEnv = {
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        BUN_BIN: process.execPath,
        REPO_HARNESS_BUN_BIN: process.execPath,
        REPO_HARNESS_WORKFLOW_STATE_LIB: join(cwd, ".ai/hooks/lib/workflow-state.sh"),
        REPO_HARNESS_CLI_BIN: fakeCli,
        REPO_HARNESS_SOURCE_ROOT: ROOT,
        REPO_HARNESS_EXPENSIVE_CRITERION_MS: "0",
        HOOK_HOST: "claude",
        REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
      };

      const first = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        ...baseEnv,
        HOOK_RUN_ID: "fixture-preflight-first",
      });
      expect(first.status).toBe(1);
      expect(existsSync(join(cwd, ".ai/harness/runs/expensive-count"))).toBe(false);
      const firstChecks = runSnapshotById(cwd, "fixture-preflight-first", "projection-fixture").content;
      expect(firstChecks.contract.execution_evaluation.results.find((entry: any) => entry.id === "full-suite")?.execution).toBe("missing");
      expect(firstChecks.contract.execution_evaluation.results.find((entry: any) => entry.id === "task-sync")?.passed).toBe(false);

      writeFileSync(join(cwd, ".ai/harness/task-sync-ready"), "ready\n");
      const second = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        ...baseEnv,
        HOOK_RUN_ID: "fixture-preflight-second",
      });
      expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0);
      expect(readFileSync(join(cwd, ".ai/harness/runs/expensive-count"), "utf-8").trim().split("\n")).toHaveLength(1);
      const secondChecks = runSnapshotById(cwd, "fixture-preflight-second", "projection-fixture").content;
      expect(secondChecks.contract.execution_evaluation.results.find((entry: any) => entry.id === "full-suite")?.execution).toBe("executed");
      expect(secondChecks.review_subject_sha256).toBe(firstChecks.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint composes executed and reused criteria into frozen acceptance evidence", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-criterion-retry");
    try {
      const fakeCli = installAutomaticProjectionVerifyFixture(cwd);
      const fakeBin = join(cwd, "fake-bin");
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(
        join(fakeBin, "bun"),
        [
          "#!/bin/bash",
          "if [[ \"$*\" == \"test --timeout 60000\" ]]; then",
          "  printf 'run\\n' >> .ai/harness/runs/expensive-count",
          "  exit 0",
          "fi",
          `exec ${JSON.stringify(process.execPath)} \"$@\"`,
          "",
        ].join("\n"),
      );
      chmodSync(join(fakeBin, "bun"), 0o755);
      writeFileSync(
        join(cwd, ".git/info/exclude"),
        ".ai/harness/checks/\n.ai/harness/runs/\n.ai/harness/evidence/\nfake-bin/\n",
      );
      const contractPath = join(cwd, "tasks/contracts/projection-fixture.contract.md");
      writeFileSync(
        contractPath,
        replaceVerificationPlan(readFileSync(contractPath, "utf-8"), [
          verificationCheck("full-suite", "bun test --timeout 60000", "verification", "expensive"),
        ]),
      );
      expect(run("git", ["add", "tasks/contracts/projection-fixture.contract.md"], cwd).status).toBe(0);
      expect(run("git", ["commit", "-m", "freeze verification plan"], cwd).status).toBe(0);
      const baseEnv = {
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        BUN_BIN: process.execPath,
        REPO_HARNESS_BUN_BIN: process.execPath,
        REPO_HARNESS_WORKFLOW_STATE_LIB: join(cwd, ".ai/hooks/lib/workflow-state.sh"),
        REPO_HARNESS_CLI_BIN: fakeCli,
        REPO_HARNESS_SOURCE_ROOT: ROOT,
        REPO_HARNESS_EXPENSIVE_CRITERION_MS: "0",
        HOOK_HOST: "claude",
        REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
      };

      const first = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        ...baseEnv,
        HOOK_RUN_ID: "fixture-criterion-first",
      });
      const firstChecks = runSnapshotById(cwd, "fixture-criterion-first", "projection-fixture").content;
      expect(first.status, `${first.stdout}\n${first.stderr}\n${JSON.stringify(firstChecks, null, 2)}`).toBe(0);
      const firstCriterion = firstChecks.contract.execution_evaluation.results.find((entry: any) => entry.id === "full-suite");
      expect(firstCriterion.execution).toBe("executed");
      expect(firstChecks.contract.execution_evaluation.passed).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/checks/latest.json")), `${first.stdout}\n${first.stderr}`).toBe(true);
      const latest = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/latest.json"), "utf-8"));
      expect(latest.lifecycle.snapshot).toBe(firstChecks.run_file);
      expect(latest.contract.execution_evaluation.results[0].run_file).toBe(firstCriterion.run_file);

      const second = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        ...baseEnv,
        HOOK_RUN_ID: "fixture-criterion-second",
      });
      const secondChecks = runSnapshotById(cwd, "fixture-criterion-second", "projection-fixture").content;
      expect(second.status, `${second.stdout}\n${second.stderr}\n${JSON.stringify(secondChecks, null, 2)}`).toBe(0);
      expect(readFileSync(join(cwd, ".ai/harness/runs/expensive-count"), "utf-8").trim().split("\n")).toHaveLength(1);
      const secondCriterion = secondChecks.contract.execution_evaluation.results.find((entry: any) => entry.id === "full-suite");
      expect(secondCriterion.execution).toBe("reused");
      expect(secondCriterion.cache_key).toBe(firstCriterion.cache_key);

      const forced = run(
        "bash",
        [
          "scripts/verify-sprint.sh",
          "--prepare-acceptance",
          "--force-expensive-rerun",
          "--reason",
          "reproduce provider flake",
        ],
        cwd,
        { ...baseEnv, HOOK_RUN_ID: "fixture-criterion-forced" },
      );
      expect(forced.status, `${forced.stdout}\n${forced.stderr}`).toBe(0);
      expect(readFileSync(join(cwd, ".ai/harness/runs/expensive-count"), "utf-8").trim().split("\n")).toHaveLength(2);
      const forcedChecks = runSnapshotById(cwd, "fixture-criterion-forced", "projection-fixture").content;
      const forcedCriterion = forcedChecks.contract.execution_evaluation.results.find((entry: any) => entry.id === "full-suite");
      expect(forcedCriterion.execution).toBe("executed");
      expect(forcedCriterion.force_reason).toBe("reproduce provider flake");
      expect(forcedChecks.review_subject_sha256).toBe(secondChecks.review_subject_sha256);

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n\nSource byte changed.\n");
      const sourceChanged = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        ...baseEnv,
        HOOK_RUN_ID: "fixture-criterion-source",
      });
      expect(sourceChanged.status).toBe(1);
      expect(readFileSync(join(cwd, ".ai/harness/runs/expensive-count"), "utf-8").trim().split("\n")).toHaveLength(2);
      const sourceChecks = runSnapshotById(cwd, "fixture-criterion-source", "projection-fixture").content;
      const sourceCriterion = sourceChecks.contract.execution_evaluation.results.find((entry: any) => entry.id === "full-suite");
      expect(sourceCriterion.execution).toBe("missing");
      expect(sourceChecks.contract.execution_evaluation.status).toBe("needs_verification_plan");
      expect(sourceChecks.review_subject_sha256).not.toBe(secondChecks.review_subject_sha256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 45_000);

  test.each([
    {
      name: "source",
      mutation: "printf 'mutated during verification\\n' >> docs/spec.md",
      changedFields: ["subject_sha256"],
    },
    {
      name: "goal",
      mutation: "printf 'mutated during verification\\n' >> plans/plan-20260820-1605-projection-fixture.md",
      changedFields: ["goal_sha256"],
    },
    {
      name: "source and goal",
      mutation: "printf 'changed\\n' >> docs/spec.md && printf 'changed\\n' >> plans/plan-20260820-1605-projection-fixture.md",
      changedFields: ["goal_sha256", "subject_sha256"],
    },
  ])("verify-sprint rejects a descriptor that changes its immutable execution subject ($name)", ({ mutation }) => {
    const cwd = tmpWorkspace("helper-verify-sprint-criterion-context-drift");
    try {
      const fakeCli = installAutomaticProjectionVerifyFixture(cwd);
      const contractPath = join(cwd, "tasks/contracts/projection-fixture.contract.md");
      writeFileSync(
        contractPath,
        replaceVerificationPlan(readFileSync(contractPath, "utf-8"), [
          verificationCheck("context-mutation", mutation, "verification", "normal"),
        ]),
      );
      commitAll(cwd, "add context mutation verification");

      const result = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        REPO_HARNESS_CLI_BIN: fakeCli,
        HOOK_RUN_ID: "fixture-criterion-context-drift",
        HOOK_HOST: "claude",
        REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
        REPO_HARNESS_SOURCE_ROOT: ROOT,
      });
      const checks = runSnapshotById(cwd, "fixture-criterion-context-drift", "projection-fixture").content;

      expect(result.status).toBe(1);
      expect(checks.contract.execution_evaluation, JSON.stringify(checks, null, 2)).toMatchObject({ status: "needs_verification_plan", passed: false });
      expect(checks.contract.execution_evaluation.results).toHaveLength(1);
      expect(checks.contract.execution_evaluation.results[0]).toMatchObject({
        id: "context-mutation", passed: false, execution: "executed",
      });
      expect(checks.contract.execution_evaluation.results[0].execution_id).toMatch(/^vx-/);
      expect(checks.contract.execution_evaluation.results[0].run_file).toMatch(/^\.ai\/harness\/runs\//);
      expect(checks.contract.execution_evaluation.evaluation.snapshot_changed_during_execution).toBe(true);
      expect(checks.guards.find((entry: any) => entry.name === "verification_evaluation")?.status).toBe("fail");
      expect(checks.failure_class).toBe("contract_failure");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint rejects a descriptor that removes its immutable plan authority", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-criterion-context-unavailable");
    try {
      const fakeCli = installAutomaticProjectionVerifyFixture(cwd);
      const contractPath = join(cwd, "tasks/contracts/projection-fixture.contract.md");
      writeFileSync(contractPath, replaceVerificationPlan(readFileSync(contractPath, "utf-8"), [
        verificationCheck("remove-plan-authority", "rm plans/plan-20260820-1605-projection-fixture.md", "verification", "normal"),
      ]));
      commitAll(cwd, "add unavailable authority verification");
      const result = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        REPO_HARNESS_CLI_BIN: fakeCli,
        HOOK_RUN_ID: "fixture-criterion-context-unavailable",
        HOOK_HOST: "claude",
        REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
        REPO_HARNESS_SOURCE_ROOT: ROOT,
      });
      const checks = runSnapshotById(cwd, "fixture-criterion-context-unavailable", "projection-fixture").content;
      expect(result.status).toBe(1);
      expect(checks.contract.execution_evaluation.results).toHaveLength(1);
      expect(checks.contract.execution_evaluation.results[0]).toMatchObject({ id: "remove-plan-authority", passed: false, execution: "executed" });
      expect(checks.contract.execution_evaluation).toMatchObject({ status: "needs_verification_plan", passed: false });
      expect(checks.contract.execution_evaluation.evaluation.snapshot_changed_during_execution).toBe(true);
      expect(existsSync(join(cwd, "plans/plan-20260820-1605-projection-fixture.md"))).toBe(false);
      expect(checks.guards.find((entry: any) => entry.name === "verification_evaluation")?.status).toBe("fail");
      expect(checks.failure_class).toBe("contract_failure");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint does not exempt other automatic architecture projection outputs", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-projection-scope");
    try {
      const fakeCli = installAutomaticProjectionVerifyFixture(cwd);
      const res = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        REPO_HARNESS_CLI_BIN: fakeCli,
        PROJECTION_EXTRA_PATH: "1",
        HOOK_HOST: "claude",
        REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
      });

      expect(res.status).toBe(1);
      const { content: checks } = latestRunSnapshot(cwd);
      expect(checks.allowed_paths_check.status).toBe("fail");
      expect(checks.allowed_paths_check.outside).toContain("docs/architecture/modules/unexpected.md");
      expect(checks.allowed_paths_check.outside).not.toContain("docs/architecture/.projection-manifest.json");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint finalizes one AcceptanceReceipt without rerunning contract tests", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-finalize");
    const rerunMarker = join(cwd, "verify-contract-reran");
    const projectionMarker = join(cwd, "receipt-projected");
    const changeAssessment = {
      schema: "repo-harness-change-assessment-evidence.v1",
      status: "pass",
      assessment: { fixture: true },
      selection_packet: { fixture: true },
      evidence_sha256: "sha256:fixture",
    };
    try {
      mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/runs"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      copyHelpers(cwd);
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), "# Task Contract: demo\n");
      writeFileSync(join(cwd, "tasks/reviews/demo.review.md"), "# Task Review: demo\n");
      const preparedRunFile = ".ai/harness/runs/run-finalize-fixture.json";
      const preparedChecks = {
        schema: "repo-harness-run-trace.v1",
        status: "pass",
        source: "verify-sprint",
        exit_code: 0,
        run_file: preparedRunFile,
        lifecycle: { snapshot: preparedRunFile },
        commands: [],
        guards: [
          { name: "contract", status: "pass" },
          { name: "review", status: "pass" },
          { name: "acceptance_receipt", status: "pending" },
          { name: "allowed_paths", status: "pass" },
          { name: "change_assessment", status: "pass" },
        ],
        acceptance_receipt: { status: "pending" },
        change_assessment: changeAssessment,
      };
      writeFileSync(
        join(cwd, ".ai/harness/checks/latest.json"),
        `${JSON.stringify(preparedChecks, null, 2)}\n`,
      );
      writeFileSync(
        join(cwd, preparedRunFile),
        `${JSON.stringify(preparedChecks, null, 2)}\n`,
      );
      writeFileSync(
        join(cwd, ".ai/harness/checks/change-assessment.latest.json"),
        `${JSON.stringify(changeAssessment, null, 2)}\n`,
      );
      writeFileSync(
        join(cwd, "scripts/verify-contract.sh"),
        `#!/bin/bash\ntouch ${JSON.stringify(rerunMarker)}\nexit 97\n`,
      );
      chmodSync(join(cwd, "scripts/verify-contract.sh"), 0o755);
      writeFileSync(
        join(cwd, "scripts/acceptance-receipt.ts"),
        [
          `const mode = process.argv[2];`,
          `if (mode === "verify") console.log("pass\\tClaude\\tclaude-review\\texternal_pass\\taccepted once");`,
          `else if (mode === "project") await Bun.write(${JSON.stringify(projectionMarker)}, "projected\\n");`,
          `else process.exit(2);`,
          "",
        ].join("\n"),
      );

      const res = run("bash", ["scripts/verify-sprint.sh"], cwd);
      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      expect(res.stdout).toContain("without rerunning verification");
      expect(existsSync(rerunMarker)).toBe(false);
      expect(existsSync(projectionMarker)).toBe(true);
      // EPC-05: finalize's own evidence emission also cannot-binds in this
      // non-git, no-source-root fixture (no scripts/emit-verify-evidence.ts
      // is deployed here, mirroring every real downstream adopter), so the
      // pending -> pass patch that used to reach checks/latest.json via the
      // deleted direct `cp` is never applied to that file: it stays exactly
      // as this test pre-seeded it. This is the documented residual finding
      // for this row: the acceptance_receipt pending -> pass transition on
      // checks/latest.json only becomes observable where the ledger is
      // reachable (a real, git-backed, source-rooted worktree -- see
      // tests/evidence-checks-materializer.test.ts's own end-to-end
      // pass/fail producer+materializer tests for that path).
      const checks = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/latest.json"), "utf-8"));
      expect(checks.acceptance_receipt).toEqual({ status: "pending" });
      expect(checks.guards.find((guard: { name: string }) => guard.name === "acceptance_receipt")?.status).toBe("pending");

      // A reviewer overlay writes a new subject-bound packet. Finalization
      // must refuse this old prepared trace until prepare-acceptance has
      // emitted a replacement canonical checks record.
      writeFileSync(
        join(cwd, ".ai/harness/checks/change-assessment.latest.json"),
        `${JSON.stringify({ ...changeAssessment, evidence_sha256: "sha256:changed" }, null, 2)}\n`,
      );
      const stale = run("bash", ["scripts/verify-sprint.sh"], cwd);
      expect(stale.status).toBe(1);
      expect(`${stale.stdout}\n${stale.stderr}`).toContain("Change Assessment packet changed after prepared evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint prints a notes promotion-candidate advisory without changing exit code", () => {
    const baseline = tmpWorkspace("helper-verify-sprint-notes-baseline");
    const withCandidate = tmpWorkspace("helper-verify-sprint-notes-candidate");
    try {
      const setup = (cwd: string, notesBody: string) => {
        mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
        mkdirSync(join(cwd, "plans"), { recursive: true });
        mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
        mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
        mkdirSync(join(cwd, "tasks/notes"), { recursive: true });
        mkdirSync(join(cwd, "docs"), { recursive: true });
        copyHelpers(cwd);
        // The deployed helper resolves Change Assessment modules from its
        // package root. Mirror the package's published `src/` payload rather
        // than accidentally exercising an incomplete copied-helper fixture.

      rmSync(join(cwd, "src"), { recursive: true, force: true });
      cpSync(join(ROOT, "src"), join(cwd, "src"), { recursive: true });
      copyFileSync(join(ROOT, "package.json"), join(cwd, "package.json"));
        copyFileSync(
          join(ROOT, "assets/hooks/lib/workflow-state.sh"),
          join(cwd, ".ai/hooks/lib/workflow-state.sh")
        );
        writeFileSync(
          join(cwd, ".ai/harness/policy.json"),
          `${JSON.stringify({ worktree_strategy: { review_base: "main" } }, null, 2)}\n`,
        );

        writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
        writeFileSync(
          join(cwd, "plans/plan-20260304-1600-demo.md"),
          "# Plan: demo\n\n> **Status**: Executing\n"
        );
        writeActivePlan(cwd, "plans/plan-20260304-1600-demo.md");
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
            "evidence_requirements:",
            "  benchmark: not_applicable",
            "```",
            "",
            verificationPlan([]),
            "## Change Assessment",
            "",
            "```json",
            '{"protocol":1,"oracles":[{"id":"fixture-deterministic","kind":"deterministic_test","paths":["*"]}]}',
            "```",
            "",
          ].join("\n")
        );
        writeFileSync(join(cwd, "tasks/notes/demo.notes.md"), notesBody);
        writeFileSync(
          join(cwd, "tasks/reviews/demo.review.md"),
          ["# Task Review: demo", "", "> **Recommendation**: pass", reviewSubjectMetadata(cwd), "", humanReviewCard(), "", externalAcceptanceAdvice("Codex", "codex-review", cwd), ""].join("\n")
        );
      };

      const boilerplatePromotionCandidates = [
        "- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.",
        "- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.",
        "- Promote to harness asset files only after verification across more than one task or fixture.",
      ];

      const boilerplateNotes = [
        "# Implementation Notes: demo",
        "",
        "## Promotion Candidates",
        "",
        ...boilerplatePromotionCandidates,
        "",
      ].join("\n");

      const notesWithCandidate = [
        "# Implementation Notes: demo",
        "",
        "## Promotion Candidates",
        "",
        ...boilerplatePromotionCandidates,
        "- This retry-backoff helper showed up in two unrelated tasks; worth promoting to a shared script.",
        "",
      ].join("\n");

      setup(baseline, boilerplateNotes);
      setup(withCandidate, notesWithCandidate);

      const baselineRes = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], baseline, {
        HOOK_HOST: "claude",
        REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
      });
      const candidateRes = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], withCandidate, {
        HOOK_HOST: "claude",
        REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
      });

      expect(baselineRes.status, `${baselineRes.stdout}\n${baselineRes.stderr}`).toBe(0);
      expect(candidateRes.status, `${candidateRes.stdout}\n${candidateRes.stderr}`).toBe(0);
      expect(candidateRes.status).toBe(baselineRes.status);
      // EPC-05: emission cannot-binds in this non-git, no-source-root
      // fixture, so checks/latest.json is never (re)written -- see
      // latestRunSnapshot's doc comment.
      expectChecksLatestAbsent(baseline);
      expectChecksLatestAbsent(withCandidate);
      expect(baselineRes.stdout).toContain("Sprint verification passed");
      expect(candidateRes.stdout).toContain("Sprint verification passed");
      expect(baselineRes.stderr).not.toContain("[Maintenance] Notes list promotion candidates");
      expect(candidateRes.stderr).toContain(
        "[Maintenance] Notes list promotion candidates — review before archive: tasks/notes/demo.notes.md"
      );
    } finally {
      rmSync(baseline, { recursive: true, force: true });
      rmSync(withCandidate, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint should fail when committed branch diff exceeds allowed_paths", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-branch-scope");
    try {
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      copyHelpers(cwd);

      rmSync(join(cwd, "src"), { recursive: true, force: true });
      cpSync(join(ROOT, "src"), join(cwd, "src"), { recursive: true });
      copyFileSync(join(ROOT, "package.json"), join(cwd, "package.json"));
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh")
      );
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        `${JSON.stringify({ worktree_strategy: { review_base: "main" } }, null, 2)}\n`,
      );

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(join(cwd, "plans/plan-20260304-1602-demo.md"), "# Plan: demo\n\n> **Status**: Executing\n");
      writeActivePlan(cwd, "plans/plan-20260304-1602-demo.md");
      writeFileSync(
        join(cwd, "tasks/contracts/demo.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "> **Status**: Active",
          "> **Task Profile**: docs-only",
          "",
          "```yaml",
          "allowed_paths:",
          "  - docs",
          "  - tasks",
          "exit_criteria:",
          "  files_exist:",
          "    - docs/spec.md",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
          verificationPlan([]),
          "## Change Assessment",
          "",
          "```json",
          '{"protocol":1,"oracles":[{"id":"fixture-deterministic","kind":"deterministic_test","paths":["*"]}]}',
          "```",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        ["# Task Review: demo", "", "> **Recommendation**: pass", reviewSubjectMetadata(cwd), "", humanReviewCard("pass", "pass").replace("- Change type: code-change", "- Change type: docs-only"), "", externalAcceptanceAdvice("Codex", "codex-review", cwd), ""].join("\n")
      );

      initGitRepo(cwd);
      commitAll(cwd, "base workflow");
      expect(run("git", ["checkout", "-b", "feature/scope"], cwd).status).toBe(0);
      mkdirSync(join(cwd, "src"), { recursive: true });
      writeFileSync(join(cwd, "src/outside.ts"), "export const outside = true;\n");
      commitAll(cwd, "change outside allowed paths");
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        ["# Task Review: demo", "", "> **Recommendation**: pass", reviewSubjectMetadata(cwd), "", humanReviewCard("pass", "pass").replace("- Change type: code-change", "- Change type: docs-only"), "", externalAcceptanceAdvice("Codex", "codex-review", cwd), ""].join("\n")
      );

      const res = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        REPO_HARNESS_DIFF_BASE: "main",
        HOOK_HOST: "claude",
        REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
      });
      expect(res.status).toBe(1);
      // EPC-05: emission cannot-binds in this fixture (no
      // scripts/emit-verify-evidence.ts is deployed here, mirroring every
      // real downstream adopter), so checks/latest.json is never (re)written
      // -- see latestRunSnapshot's doc comment. The exact same content still
      // lands in the run snapshot, unaffected by this row's cutover.
      expectChecksLatestAbsent(cwd);
      const { content: checks } = latestRunSnapshot(cwd);
      expect(checks.status).toBe("fail");
      expect(checks.failure_class).toBe("allowed_paths");
      expect(checks.diff_base.ref).toBe("main");
      expect(checks.files_changed).toContain("src/outside.ts");
      expect(checks.allowed_paths_check.status).toBe("fail");
      expect(checks.allowed_paths_check.outside).toContain("src/outside.ts");
      expect(existsSync(join(cwd, ".expensive-ran"))).toBe(false);
      expect(checks.commands.some((entry: any) => entry.command.includes("expensive-ran"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint should scope the default branch diff from immutable contract-worktree metadata", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-task-baseline");
    try {
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      copyHelpers(cwd);

      rmSync(join(cwd, "src"), { recursive: true, force: true });
      cpSync(join(ROOT, "src"), join(cwd, "src"), { recursive: true });
      copyFileSync(join(ROOT, "package.json"), join(cwd, "package.json"));
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh")
      );
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        `${JSON.stringify({ worktree_strategy: { review_base: "main" } }, null, 2)}\n`,
      );
      writeFileSync(join(cwd, ".gitignore"), ".ai/harness/worktrees/\n.ai/harness/checks/*.latest.json\n.ai/harness/runs/\n");
      writeFileSync(join(cwd, "README.md"), "# baseline\n");
      initGitRepo(cwd);
      commitAll(cwd, "remote main baseline");
      const remoteMain = run("git", ["rev-parse", "HEAD"], cwd).stdout.trim();
      expect(run("git", ["update-ref", "refs/remotes/origin/main", remoteMain], cwd).status).toBe(0);

      writeFileSync(join(cwd, "plans/preexisting-on-local-main.md"), "# Pre-existing local plan\n");
      writeFileSync(join(cwd, "plans/plan-20260304-1603-demo.md"), "# Plan: demo\n\n> **Status**: Executing\n");
      writeActivePlan(cwd, "plans/plan-20260304-1603-demo.md");
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
          "    - docs/task-change.md",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
          verificationPlan([]),
          "## Change Assessment",
          "",
          "```json",
          '{"protocol":1,"oracles":[{"id":"fixture-deterministic","kind":"deterministic_test","paths":["*"]}]}',
          "```",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          reviewSubjectMetadata(cwd),
          "",
          humanReviewCard(),
          "",
          externalAcceptanceAdvice("Codex", "codex-review", cwd),
          "",
        ].join("\n")
      );
      commitAll(cwd, "local task baseline");
      const taskBase = run("git", ["rev-parse", "HEAD"], cwd).stdout.trim();
      expect(run("git", ["checkout", "-b", "feature/task-baseline"], cwd).status).toBe(0);

      writeFileSync(join(cwd, "docs/task-change.md"), "# Task change\n");
      expect(run("git", ["add", "."], cwd).status).toBe(0);
      expect(
        run("git", ["commit", "-m", "task change"], cwd, {
          GIT_AUTHOR_DATE: "2030-01-01T00:00:00+0000",
          GIT_COMMITTER_DATE: "2030-01-01T00:00:00+0000",
        }).status
      ).toBe(0);
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          reviewSubjectMetadata(cwd),
          "",
          humanReviewCard(),
          "",
          externalAcceptanceAdvice("Codex", "codex-review", cwd),
          "",
        ].join("\n")
      );
      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/worktrees/demo.json"),
        JSON.stringify(
          {
            slug: "demo",
            branch: "feature/task-baseline",
            worktree: realpathSync(cwd),
            base_branch: "main",
            base_commit: taskBase,
          },
          null,
          2
        ) + "\n"
      );

      // These two runs assert on the contract-worktree metadata fallback path, which sits
      // below REPO_HARNESS_DIFF_BASE/HARNESS_DIFF_BASE/GITHUB_BASE_REF in git_diff_base_ref()'s
      // priority order. Clear all three so an ambient CI value (e.g. GITHUB_BASE_REF=main on
      // GitHub Actions PR runs) can't short-circuit past metadata and break the assertions below.
      const metadataFallbackEnv = {
        HOOK_HOST: "claude",
        REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
        GITHUB_BASE_REF: undefined,
        REPO_HARNESS_DIFF_BASE: undefined,
        HARNESS_DIFF_BASE: undefined,
      };
      const baselineRunId = "fixture-task-baseline";
      const baselineRes = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        ...metadataFallbackEnv,
        HOOK_RUN_ID: baselineRunId,
      });
      expect(baselineRes.status, `${baselineRes.stdout}\n${baselineRes.stderr}`).toBe(0);
      // EPC-05: emission cannot-binds in this fixture (no
      // scripts/emit-verify-evidence.ts is deployed here), so
      // checks/latest.json is never (re)written across any of these three
      // runs -- the identical content still lands in each run's own
      // snapshot file, unaffected by this row's cutover.
      expectChecksLatestAbsent(cwd);
      const baselineChecks = runSnapshotById(cwd, baselineRunId, "demo").content;
      expect(baselineChecks.diff_base.ref).toBe(taskBase);
      expect(baselineChecks.diff_base.merge_base).toBe(taskBase);
      expect(baselineChecks.files_changed).toContain("docs/task-change.md");
      expect(baselineChecks.files_changed).not.toContain("plans/preexisting-on-local-main.md");
      expect(baselineChecks.allowed_paths_check.status).toBe("pass");

      writeFileSync(
        join(cwd, ".ai/harness/worktrees/demo.json"),
        JSON.stringify(
          {
            slug: "demo",
            branch: "feature/task-baseline",
            worktree: realpathSync(cwd),
            base_branch: "origin/main",
            started_at: new Date().toISOString(),
          },
          null,
          2
        ) + "\n"
      );
      const legacyMetadataRunId = "fixture-legacy-metadata";
      const legacyMetadataRes = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        ...metadataFallbackEnv,
        HOOK_RUN_ID: legacyMetadataRunId,
      });
      expect(legacyMetadataRes.status).toBe(0);
      const legacyMetadataChecks = runSnapshotById(cwd, legacyMetadataRunId, "demo").content;
      expect(legacyMetadataChecks.diff_base.ref).toBe(taskBase);
      expect(legacyMetadataChecks.allowed_paths_check.status).toBe("pass");

      const overrideRunId = "fixture-explicit-override";
      const overrideRes = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        HOOK_HOST: "claude",
        HOOK_RUN_ID: overrideRunId,
        REPO_HARNESS_DIFF_BASE: "origin/main",
      });
      expect(overrideRes.status).toBe(1);
      const overrideChecks = runSnapshotById(cwd, overrideRunId, "demo").content;
      expect(overrideChecks.diff_base.ref).toBe("origin/main");
      expect(overrideChecks.allowed_paths_check.outside).toContain("plans/preexisting-on-local-main.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint ignores Human Review Card semantics because Markdown is projection only", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-card-profile");
    try {
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      copyHelpers(cwd);

      rmSync(join(cwd, "src"), { recursive: true, force: true });
      cpSync(join(ROOT, "src"), join(cwd, "src"), { recursive: true });
      copyFileSync(join(ROOT, "package.json"), join(cwd, "package.json"));
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh")
      );
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        `${JSON.stringify({ worktree_strategy: { review_base: "main" } }, null, 2)}\n`,
      );

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(join(cwd, "plans/plan-20260304-1603-demo.md"), "# Plan: demo\n\n> **Status**: Executing\n");
      writeActivePlan(cwd, "plans/plan-20260304-1603-demo.md");
      writeFileSync(
        join(cwd, "tasks/contracts/demo.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "> **Status**: Active",
          "> **Task Profile**: docs-only",
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
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
          verificationPlan([]),
          "## Change Assessment",
          "",
          "```json",
          '{"protocol":1,"oracles":[{"id":"fixture-deterministic","kind":"deterministic_test","paths":["*"]}]}',
          "```",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        ["# Task Review: demo", "", "> **Recommendation**: pass", "", humanReviewCard(), "", externalAcceptanceAdvice(), ""].join("\n")
      );
      initGitRepo(cwd);
      commitAll(cwd, "card profile assessment baseline");

      const res = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        REPO_HARNESS_HOOK_CLI: join(cwd, "src/cli/hook-entry.ts"),
      });
      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      // EPC-05: emission cannot-binds in this fixture (no
      // scripts/emit-verify-evidence.ts is deployed here), so
      // checks/latest.json is never (re)written -- the identical content
      // still lands in the run snapshot.
      expectChecksLatestAbsent(cwd);
      const checks = latestRunSnapshot(cwd).content;
      expect(checks.review.status).toBe("pass");
      expect(checks.change_assessment.selection_packet.target_revision).toBe(
        run("git", ["rev-parse", "main"], cwd).stdout.trim(),
      );
      expect(checks.review.card).toBeUndefined();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint does not require a Human Review Card authoring path", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-missing-card");
    try {
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      copyHelpers(cwd);

      rmSync(join(cwd, "src"), { recursive: true, force: true });
      cpSync(join(ROOT, "src"), join(cwd, "src"), { recursive: true });
      copyFileSync(join(ROOT, "package.json"), join(cwd, "package.json"));
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh")
      );
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        `${JSON.stringify({ worktree_strategy: { review_base: "main" } }, null, 2)}\n`,
      );

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(join(cwd, "plans/plan-20260304-1605-demo.md"), "# Plan: demo\n\n> **Status**: Executing\n");
      writeActivePlan(cwd, "plans/plan-20260304-1605-demo.md");
      writeFileSync(
        join(cwd, "tasks/contracts/demo.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "> **Status**: Active",
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
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
          verificationPlan([]),
          "## Change Assessment",
          "",
          "```json",
          '{"protocol":1,"oracles":[{"id":"fixture-deterministic","kind":"deterministic_test","paths":["*"]}]}',
          "```",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        ["# Task Review: demo", "", "> **Recommendation**: pass", "", externalAcceptanceAdvice(), ""].join("\n")
      );
      initGitRepo(cwd);
      commitAll(cwd, "missing card assessment baseline");

      const res = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd, {
        REPO_HARNESS_HOOK_CLI: join(cwd, "src/cli/hook-entry.ts"),
      });
      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      // EPC-05: emission cannot-binds in this fixture (no
      // scripts/emit-verify-evidence.ts is deployed here), so
      // checks/latest.json is never (re)written -- the identical content
      // still lands in the run snapshot.
      expectChecksLatestAbsent(cwd);
      const checks = latestRunSnapshot(cwd).content;
      expect(checks.review.status).toBe("pass");
      expect(checks.change_assessment.selection_packet.target_revision).toBe(
        run("git", ["rev-parse", "main"], cwd).stdout.trim(),
      );
      expect(checks.review.card).toBeUndefined();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-sprint should write failing structured checks before exiting", () => {
    const cwd = tmpWorkspace("helper-verify-sprint-fail");
    try {
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      copyHelpers(cwd);
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh")
      );

      writeFileSync(
        join(cwd, "plans/plan-20260304-1610-demo.md"),
        "# Plan: demo\n\n> **Status**: Executing\n"
      );
      writeActivePlan(cwd, "plans/plan-20260304-1610-demo.md");
      writeFileSync(
        join(cwd, "tasks/contracts/demo.contract.md"),
        [
          "# Task Contract: demo",
          "",
          "> **Status**: Active",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - docs/missing.md",
          "```",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        ["# Task Review: demo", "", "> **Recommendation**: pass", "", humanReviewCard("pass", "unavailable"), ""].join("\n")
      );

      const res = run("bash", ["scripts/verify-sprint.sh", "--prepare-acceptance"], cwd);
      expect(res.status).toBe(1);
      // EPC-05: emission cannot-binds in this fixture (no
      // scripts/emit-verify-evidence.ts is deployed here), so
      // checks/latest.json is never (re)written -- the identical content
      // (including the "fail" status: this row extends emission to the
      // fail path too, in the real ledger-reachable case, but this fixture
      // never reaches the ledger regardless of that) still lands in the
      // run snapshot.
      expectChecksLatestAbsent(cwd);
      const { path: runFilePath, content: checks } = latestRunSnapshot(cwd);
      expect(checks.status).toBe("fail");
      expect(checks.source).toBe("verify-sprint");
      expect(checks.contract.file).toBe("tasks/contracts/demo.contract.md");
      expect(checks.contract.status).toBe("fail");
      expect(checks.acceptance_receipt.status).toBe("pending");
      expect(checks.run_file).toMatch(/^\.ai\/harness\/runs\/.+-demo\.json$/);
      expect(join(cwd, checks.run_file)).toBe(runFilePath);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
