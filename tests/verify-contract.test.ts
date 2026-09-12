import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";
import { ROOT_CAUSE_FIXTURE_CASES } from "./fixtures/root-cause/expected-results";

import { commitVerificationFixture, copyHelpers, installHooks, ROOT, verificationCheck, verificationPlan } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("verify-contract helper integration", () => {
  test("verify-contract should pass strict mode and set status to Fulfilled", () => {
    const cwd = tmpWorkspace("helper-verify-contract-pass");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "tests/unit"), { recursive: true });
      mkdirSync(join(cwd, "src"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({ name: "helper-verify-contract-pass", private: true, scripts: { test: "bun test" } }, null, 2) + "\n"
      );
      writeFileSync(join(cwd, "src/index.ts"), "export const value = 1;\n");
      writeFileSync(
        join(cwd, "tests/unit/contract-pass.test.ts"),
        'import { test, expect } from "bun:test";\n' +
          'test("contract pass", () => { expect(1).toBe(1); });\n'
      );

      const contractPath = join(cwd, "task.contract.md");
      writeFileSync(
        contractPath,
        [
          "# Task Contract: pass",
          "",
          "> **Status**: Pending",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/index.ts",
          "  files_contain:",
          "    - path: src/index.ts",
          "      pattern: \"export const value\"",
          "```",
          "",
          verificationPlan([
            {
              id: "contract-pass-test",
              kind: "package_test",
              path: "tests/unit/contract-pass.test.ts",
              cwd: ".",
              phase: "verification",
              cost: "normal",
              evidence_policy: "current_exact",
              necessity: "The package test covers the contract pass fixture.",
              inputs: { env: [] },
            },
            verificationCheck("contract-source-present", "test -f src/index.ts", "verification", "normal"),
          ]),
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
        ].join("\n")
      );
      initGitRepo(cwd);
      writeFileSync(join(cwd, ".git/info/exclude"), ".ai/harness/checks/\n.ai/harness/runs/\n.ai/harness/evidence/\n");
      commitAll(cwd, "verification fixture");

      const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"], cwd);
      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      const updated = readFileSync(contractPath, "utf-8");
      expect(updated).toContain("> **Status**: Fulfilled");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract should pass an exact checked manual criterion with concrete review evidence", () => {
    const cwd = tmpWorkspace("helper-verify-contract-manual-evidence-pass");
    const requirement = "Architecture queue reports pending=0 and blocking=0";
    try {
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: manual evidence",
          "",
          "> **Status**: Pending",
          "> **Review File**: `tasks/reviews/manual.review.md`",
          "",
          "```yaml",
          "exit_criteria:",
          "  manual_checks:",
          `    - "${requirement}"`,
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
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "tasks/reviews/manual.review.md"),
        [
          "# Task Review: manual evidence",
          "",
          "> **Recommendation**: pass",
          "",
          "## Manual Check Evidence",
          "",
          `- [x] ${requirement}`,
          "  - Evidence: repo-harness run architecture-queue status returned pending=0 blocking=0",
          "",
        ].join("\n")
      );

      commitVerificationFixture(cwd);

      const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"], cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain(`exact checked evidence recorded for ${requirement}`);
      expect(readFileSync(join(cwd, "task.contract.md"), "utf-8")).toContain("> **Status**: Fulfilled");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract should enforce snake_case QA dimensions against human-readable Scorecard labels", () => {
    const cwd = tmpWorkspace("helper-verify-contract-qa-dimension");
    try {
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: QA dimension normalization",
          "",
          "> **Status**: Pending",
          "> **Review File**: `tasks/reviews/qa-dimension.review.md`",
          "",
          "```yaml",
          "exit_criteria:",
          "  qa_scores:",
          "    - dimension: code_quality",
          "      min: 8",
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
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "tasks/reviews/qa-dimension.review.md"),
        [
          "# Task Review: QA dimension normalization",
          "",
          "> **Recommendation**: pass",
          "",
          "## Scorecard",
          "",
          "| Dimension | Score | Notes |",
          "|-----------|-------|-------|",
          "| Code quality | 9/10 | Focused fixture |",
          "",
        ].join("\n")
      );

      commitVerificationFixture(cwd);

      const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"], cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("qa_scores: code_quality 9/8");
      expect(readFileSync(join(cwd, "task.contract.md"), "utf-8")).toContain("> **Status**: Fulfilled");

      writeFileSync(
        join(cwd, "tasks/reviews/qa-dimension.review.md"),
        [
          "# Task Review: QA dimension normalization",
          "",
          "> **Recommendation**: fail",
          "",
          "## Scorecard",
          "",
          "| Dimension | Score | Notes |",
          "|-----------|-------|-------|",
          "| Code quality | 7/10 | Below threshold fixture |",
          "",
        ].join("\n")
      );

      const belowThreshold = run(
        "bash",
        ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"],
        cwd
      );
      expect(belowThreshold.status).toBe(1);
      expect(belowThreshold.stdout).toContain("qa_scores: code_quality score 7 < 8");
      expect(readFileSync(join(cwd, "task.contract.md"), "utf-8")).toContain("> **Status**: Partial");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  for (const fixture of [
    {
      name: "unchecked",
      evidenceLines: (requirement: string) => [
        `- [ ] ${requirement}`,
        "  - Evidence: command was observed",
      ],
      expected: "manual_checks evidence is unchecked",
    },
    {
      name: "missing evidence",
      evidenceLines: (requirement: string) => [`- [x] ${requirement}`],
      expected: "manual_checks checked item has no evidence",
    },
    {
      name: "mismatched requirement",
      evidenceLines: () => [
        "- [x] Architecture queue is probably clear",
        "  - Evidence: command was observed",
      ],
      expected: "manual_checks exact evidence item is missing",
    },
    {
      name: "placeholder evidence",
      evidenceLines: (requirement: string) => [`- [x] ${requirement}`, "  - Evidence: pending"],
      expected: "manual_checks evidence is placeholder-only",
    },
    {
      name: "unavailable evidence",
      evidenceLines: (requirement: string) => [
        `- [x] ${requirement}`,
        "  - Evidence: unavailable: browser connection was not established",
      ],
      expected: "manual_checks evidence is placeholder-only",
    },
  ]) {
    test(`verify-contract should fail closed for ${fixture.name} manual evidence`, () => {
      const cwd = tmpWorkspace("helper-verify-contract-manual-evidence-fail");
      const requirement = "Architecture queue reports pending=0 and blocking=0";
      try {
        mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
        copyHelpers(cwd);
        writeFileSync(
          join(cwd, "task.contract.md"),
          [
            "# Task Contract: manual evidence",
            "",
            "> **Status**: Pending",
            "> **Review File**: `tasks/reviews/manual.review.md`",
            "",
            "```yaml",
            "exit_criteria:",
            "  manual_checks:",
            `    - "${requirement}"`,
            "```",
            "",
          ].join("\n")
        );
        writeFileSync(
          join(cwd, "tasks/reviews/manual.review.md"),
          [
            "# Task Review: manual evidence",
            "",
            "> **Recommendation**: pass",
            "",
            "## Manual Check Evidence",
            "",
            ...fixture.evidenceLines(requirement),
            "",
          ].join("\n")
        );

        const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"], cwd);
        expect(res.status).toBe(1);
        expect(res.stdout).toContain(fixture.expected);
        expect(readFileSync(join(cwd, "task.contract.md"), "utf-8")).toContain("> **Status**: Partial");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }, 30_000);
  }

  test("verify-contract should fail strict mode and set status to Partial", () => {
    const cwd = tmpWorkspace("helper-verify-contract-fail");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      copyHelpers(cwd);

      const contractPath = join(cwd, "task.contract.md");
      writeFileSync(
        contractPath,
        [
          "# Task Contract: fail",
          "",
          "> **Status**: Pending",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/does-not-exist.ts",
          "```",
          "",
          verificationPlan([verificationCheck("intentional-failure", "false", "verification", "normal")]),
        ].join("\n")
      );

      const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"], cwd);
      expect(res.status).toBe(1);
      const updated = readFileSync(contractPath, "utf-8");
      expect(updated).toContain("> **Status**: Partial");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract --read-only should not rewrite contract Status on failure", () => {
    const cwd = tmpWorkspace("helper-verify-contract-read-only");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      copyHelpers(cwd);

      const contractPath = join(cwd, "task.contract.md");
      writeFileSync(
        contractPath,
        [
          "# Task Contract: read-only",
          "",
          "> **Status**: Pending",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/does-not-exist.ts",
          "```",
          "",
          verificationPlan([verificationCheck("read-only-failure", "false", "verification", "normal")]),
        ].join("\n")
      );
      const originalContent = readFileSync(contractPath, "utf-8");

      const res = run(
        "bash",
        ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict", "--read-only"],
        cwd
      );

      expect(res.status).toBe(1);
      expect(readFileSync(contractPath, "utf-8")).toBe(originalContent);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract --read-only should not rewrite contract Status on pass", () => {
    const cwd = tmpWorkspace("helper-verify-contract-read-only-pass");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "src"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      writeFileSync(join(cwd, "src/index.ts"), "export const value = 1;\n");
      const contractPath = join(cwd, "task.contract.md");
      writeFileSync(
        contractPath,
        [
          "# Task Contract: read-only pass",
          "",
          "> **Status**: Pending",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/index.ts",
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
        ].join("\n")
      );
      commitVerificationFixture(cwd);
      const originalContent = readFileSync(contractPath, "utf-8");

      const res = run(
        "bash",
        ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict", "--read-only"],
        cwd
      );

      expect(res.status).toBe(0);
      expect(readFileSync(contractPath, "utf-8")).toBe(originalContent);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract --read-only still executes command criteria and reports the boundary", () => {
    const cwd = tmpWorkspace("helper-verify-contract-read-only-exec");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      const contractPath = join(cwd, "task.contract.md");
      writeFileSync(
        contractPath,
        [
          "# Task Contract: read-only exec",
          "",
          "> **Status**: Pending",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist: []",
          "```",
          "",
          verificationPlan([verificationCheck("read-only-command", "mkdir -p .ai/harness/runs && printf executed > .ai/harness/runs/command-ran.txt", "verification", "normal")]),
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
        ].join("\n")
      );
      commitVerificationFixture(cwd);
      const originalContent = readFileSync(contractPath, "utf-8");

      const res = run(
        "bash",
        [
          "scripts/verify-contract.sh",
          "--contract",
          "task.contract.md",
          "--strict",
          "--read-only",
          "--report-file",
          "report.json",
        ],
        cwd
      );

      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      expect(readFileSync(contractPath, "utf-8")).toBe(originalContent);
      expect(readFileSync(join(cwd, ".ai/harness/runs/command-ran.txt"), "utf-8")).toBe("executed");
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.read_only).toBe(true);
      expect(report.executes_contract_commands).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract rejects retired criterion_reuse executable YAML", () => {
    const cwd = tmpWorkspace("helper-verify-contract-retired-reuse");
    try {
      copyHelpers(cwd);
      writeFileSync(join(cwd, "task.contract.md"), [
        "# Task Contract: retired-reuse",
        "",
        "```yaml",
        "exit_criteria:",
        "  commands_succeed:",
        "    - printf legacy",
        "criterion_reuse:",
        "  commands_succeed:",
        "    - printf legacy",
        "```",
        "",
      ].join("\n"));
      const result = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict", "--read-only", "--report-file", "report.json"], cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("commands_succeed");
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.results.some((entry: any) => entry.kind === "exit_criteria_parse")).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract rejects retired criterion_reuse YAML after a non-pass", () => {
    const cwd = tmpWorkspace("helper-verify-contract-retired-nonpass");
    try {
      copyHelpers(cwd);
      writeFileSync(join(cwd, "task.contract.md"), [
        "# Task Contract: retired-nonpass",
        "",
        "```yaml",
        "exit_criteria:",
        "  commands_succeed:",
        "    - printf legacy",
        "criterion_reuse:",
        "  commands_succeed:",
        "    - printf legacy",
        "```",
        "",
      ].join("\n"));
      const result = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict", "--read-only", "--report-file", "report.json"], cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("commands_succeed");
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.results.some((entry: any) => entry.kind === "exit_criteria_parse")).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract rejects retired criterion_reuse YAML with an unlisted command", () => {
    const cwd = tmpWorkspace("helper-verify-contract-retired-unlisted");
    try {
      copyHelpers(cwd);
      writeFileSync(join(cwd, "task.contract.md"), [
        "# Task Contract: retired-unlisted",
        "",
        "```yaml",
        "exit_criteria:",
        "  commands_succeed:",
        "    - printf legacy",
        "criterion_reuse:",
        "  commands_succeed:",
        "    - printf legacy",
        "```",
        "",
      ].join("\n"));
      const result = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict", "--read-only", "--report-file", "report.json"], cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("commands_succeed");
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.results.some((entry: any) => entry.kind === "exit_criteria_parse")).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract rejects retired criterion_reuse YAML instead of a cache record", () => {
    const cwd = tmpWorkspace("helper-verify-contract-retired-cache");
    try {
      copyHelpers(cwd);
      writeFileSync(join(cwd, "task.contract.md"), [
        "# Task Contract: retired-cache",
        "",
        "```yaml",
        "exit_criteria:",
        "  commands_succeed:",
        "    - printf legacy",
        "criterion_reuse:",
        "  commands_succeed:",
        "    - printf legacy",
        "```",
        "",
      ].join("\n"));
      const result = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict", "--read-only", "--report-file", "report.json"], cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("commands_succeed");
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.results.some((entry: any) => entry.kind === "exit_criteria_parse")).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract quiet mode should emit only summary and report file", () => {
    const cwd = tmpWorkspace("helper-verify-contract-quiet");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "src"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      writeFileSync(join(cwd, "src/index.ts"), "export const quiet = true;\n");
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: quiet",
          "",
          "> **Status**: Pending",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/index.ts",
          "  files_not_contain:",
          "    - path: src/index.ts",
          "      pattern: \"forbidden\"",
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
        ].join("\n")
      );
      commitVerificationFixture(cwd);

      const res = run(
        "bash",
        [
          "scripts/verify-contract.sh",
          "--contract",
          "task.contract.md",
          "--strict",
          "--quiet",
          "--report-file",
          "report.json",
        ],
        cwd
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ContractVerify]");
      expect(res.stdout).not.toContain("[PASS]");
      expect(readFileSync(join(cwd, "report.json"), "utf-8")).toContain('"failed": 0');
      expect(JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8")).results.some((entry: any) => entry.kind === "files_not_contain")).toBe(true);
      expect(readFileSync(join(cwd, "report.json"), "utf-8")).toContain('"run_id": "run-');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract should ignore allowed_paths metadata before exit criteria", () => {
    const cwd = tmpWorkspace("helper-verify-contract-allowed-paths");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "src"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      writeFileSync(join(cwd, "src/index.ts"), "export const value = 1;\n");
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: allowed-paths",
          "",
          "> **Status**: Pending",
          "> **Review File**: `tasks/reviews/allowed-paths.review.md`",
          "",
          "## Allowed Paths",
          "",
          "```yaml",
          "allowed_paths:",
          "  - src/",
          "  - tests/",
          "```",
          "",
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
          "## Exit Criteria",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/index.ts",
          "```",
          "",
          verificationPlan([verificationCheck("allowed-path-source", "test -f src/index.ts", "verification", "normal")]),
        ].join("\n")
      );
      commitVerificationFixture(cwd);

      const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"], cwd);
      expect(res.status).toBe(0);
      expect(readFileSync(join(cwd, "task.contract.md"), "utf-8")).toContain("> **Status**: Fulfilled");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract should ignore delegation metadata before exit criteria", () => {
    const cwd = tmpWorkspace("helper-verify-contract-delegation");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "src"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      writeFileSync(join(cwd, "src/index.ts"), "export const value = 1;\n");
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: delegation",
          "",
          "> **Status**: Pending",
          "",
          "## Allowed Paths",
          "",
          "```yaml",
          "allowed_paths:",
          "  - src/",
          "```",
          "",
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
          "## Delegation Contract",
          "",
          "```yaml",
          "delegation:",
          "  budget:",
          "    tokens: 10000",
          "    tool_calls: 20",
          "    wall_time_minutes: 30",
          "  permission_scope:",
          "    mode: inherit_allowed_paths",
          "    writable_paths: []",
          "    network: inherited",
          "  roles:",
          "    parent: narrate_and_gatekeep",
          "    worker: implement_contract",
          "    verifier: review_exit_criteria",
          "```",
          "",
          "## Exit Criteria",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/index.ts",
          "```",
          "",
          verificationPlan([]),
        ].join("\n")
      );
      commitVerificationFixture(cwd);

      const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"], cwd);
      expect(res.status).toBe(0);
      expect(readFileSync(join(cwd, "task.contract.md"), "utf-8")).toContain("> **Status**: Fulfilled");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract rejects retired criterion_reuse headers regardless of indentation", () => {
    const cwd = tmpWorkspace("helper-verify-contract-retired-reuse-indent");
    try {
      copyHelpers(cwd);
      writeFileSync(join(cwd, "task.contract.md"), [
        "# Task Contract: retired-reuse-indent", "", "```yaml", "exit_criteria:",
        "  commands_succeed:", "    - printf legacy", "criterion_reuse: # legacy metadata",
        "  commands_succeed:", "    - printf legacy", "```", "",
      ].join("\n"));
      const result = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict", "--read-only", "--report-file", "report.json"], cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("commands_succeed");
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.results.some((entry: any) => entry.kind === "exit_criteria_parse")).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract fails closed on an unknown exit_criteria section key", () => {
    const cwd = tmpWorkspace("helper-verify-contract-unknown-section");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "src"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      writeFileSync(join(cwd, "src/index.ts"), "export const value = 1;\n");
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: unknown-section",
          "",
          "> **Status**: Active",
          "> **Task Profile**: code-change",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/index.ts",
          "  comands_succeed:",
          "    - test -f src/index.ts",
          "```",
          "",
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
        ].join("\n"),
      );

      const res = run(
        "bash",
        [
          "scripts/verify-contract.sh",
          "--contract",
          "task.contract.md",
          "--strict",
          "--read-only",
          "--report-file",
          "report.json",
        ],
        cwd,
      );
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("comands_succeed");
      expect(res.stderr).toContain("unknown exit_criteria section key");
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.failure_class).toBe("missing_artifact");
      expect(report.results.some((entry: any) => entry.kind === "exit_criteria_parse")).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract reports a null total_duration_ms when now_ms output is polluted", () => {
    const cwd = tmpWorkspace("helper-verify-contract-polluted-now-ms");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      mkdirSync(join(cwd, "shim"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      // now_ms prefers `node`. This shim answers normally until the contract's
      // own criterion drops the marker, so the run's opening timestamp is real
      // and only the closing one inside write_report is polluted -- the
      // transient stdout pollution the guard exists for.
      writeFileSync(
        join(cwd, "shim/node"),
        [
          "#!/bin/bash",
          `if [[ -f ${JSON.stringify(join(cwd, ".ai/harness/pollute-now"))} ]]; then`,
          "  printf 'not-a-timestamp'",
          "  exit 0",
          "fi",
          "printf '%s000' \"$(date +%s)\"",
          "",
        ].join("\n"),
      );
      chmodSync(join(cwd, "shim/node"), 0o755);

      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: polluted-now-ms",
          "",
          "> **Status**: Active",
          "> **Task Profile**: code-change",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist: []",
          "```",
          "",
          verificationPlan([verificationCheck("pollute-close-timestamp", "mkdir -p .ai/harness && touch .ai/harness/pollute-now", "verification", "normal")]),
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
        ].join("\n"),
      );
      commitVerificationFixture(cwd);
      writeFileSync(join(cwd, ".git/info/exclude"), ".ai/harness/checks/\n.ai/harness/runs/\n.ai/harness/evidence/\n.ai/harness/pollute-now\n");

      const res = run(
        "bash",
        [
          "scripts/verify-contract.sh",
          "--contract",
          "task.contract.md",
          "--strict",
          "--read-only",
          "--report-file",
          "report.json",
        ],
        cwd,
        { PATH: `${join(cwd, "shim")}:${process.env.PATH ?? ""}` },
      );
      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/pollute-now"))).toBe(true);
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.total_duration_ms).toBeNull();
      expect(report.failed).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract rejects retired criterion_reuse headers carrying comments", () => {
    const cwd = tmpWorkspace("helper-verify-contract-retired-reuse-comment");
    try {
      copyHelpers(cwd);
      writeFileSync(join(cwd, "task.contract.md"), [
        "# Task Contract: retired-reuse-comment", "", "```yaml", "exit_criteria:",
        "  commands_succeed:", "    - printf legacy", "criterion_reuse: # legacy metadata",
        "  commands_succeed:", "    - printf legacy", "```", "",
      ].join("\n"));
      const result = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict", "--read-only", "--report-file", "report.json"], cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("commands_succeed");
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.results.some((entry: any) => entry.kind === "exit_criteria_parse")).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract fails closed on an unknown exit_criteria section key carrying a trailing comment", () => {
    const cwd = tmpWorkspace("helper-verify-contract-unknown-section-comment");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "src"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      writeFileSync(join(cwd, "src/index.ts"), "export const value = 1;\n");
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: unknown-section-comment",
          "",
          "> **Status**: Active",
          "> **Task Profile**: code-change",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/index.ts",
          "  comands_succeed: # typo",
          "    - test -f src/index.ts",
          "```",
          "",
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
        ].join("\n"),
      );

      const res = run(
        "bash",
        [
          "scripts/verify-contract.sh",
          "--contract",
          "task.contract.md",
          "--strict",
          "--read-only",
          "--report-file",
          "report.json",
        ],
        cwd,
      );
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("comands_succeed");
      expect(res.stderr).toContain("unknown exit_criteria section key");
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.failure_class).toBe("missing_artifact");
      expect(report.results.some((entry: any) => entry.kind === "exit_criteria_parse")).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract dispatches a commented section header without mangling quoted item text", () => {
    const cwd = tmpWorkspace("helper-verify-contract-section-comment");
    const countPath = join(cwd, ".ai/harness/expensive-count");
    const quotedCommand = `bash -c 'echo "a # b"'`;
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      writeFileSync(
        join(cwd, "scripts/expensive-fixture.sh"),
        "#!/bin/bash\nmkdir -p .ai/harness/runs\nprintf 'run\\n' >> .ai/harness/runs/expensive-count\n",
      );
      chmodSync(join(cwd, "scripts/expensive-fixture.sh"), 0o755);

      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: section-comment",
          "",
          "> **Status**: Active",
          "> **Task Profile**: code-change",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist: []",
          "```",
          "",
          verificationPlan([
            verificationCheck("expensive-command", "bash scripts/expensive-fixture.sh", "verification", "expensive"),
            verificationCheck("quoted-command", quotedCommand, "verification", "normal"),
          ]),
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
        ].join("\n"),
      );

      commitVerificationFixture(cwd);
      const res = run(
        "bash",
        [
          "scripts/verify-contract.sh",
          "--contract",
          "task.contract.md",
          "--strict",
          "--read-only",
          "--report-file",
          "report.json",
        ],
        cwd,
      );
      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      expect(readFileSync(join(cwd, ".ai/harness/runs/expensive-count"), "utf-8").trim().split("\n")).toHaveLength(1);
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.failed).toBe(0);
      // A `#` inside a quoted scalar is content, not a comment: a truncated
      // command would leave an unterminated quote and exit non-zero.
      const quoted = report.verification_evaluation.results.find((entry: any) => entry.id === "quoted-command");
      expect(quoted, JSON.stringify(report.verification_evaluation.results)).toBeDefined();
      expect(quoted.passed).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract fails closed when the opening now_ms sample is polluted", () => {
    const cwd = tmpWorkspace("helper-verify-contract-polluted-start-now-ms");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      mkdirSync(join(cwd, "shim"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      // Pollutes the very first `now_ms` call, so the verification budget
      // deadline can never be computed.
      writeFileSync(join(cwd, "shim/node"), ["#!/bin/bash", "printf 'not-a-timestamp'", ""].join("\n"));
      chmodSync(join(cwd, "shim/node"), 0o755);

      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: polluted-start-now-ms",
          "",
          "> **Status**: Active",
          "> **Task Profile**: code-change",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist: []",
          "```",
          "",
          verificationPlan([verificationCheck("opening-timestamp-guard", "touch .ai/harness/should-not-run", "verification", "normal")]),
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
        ].join("\n"),
      );

      const res = run(
        "bash",
        [
          "scripts/verify-contract.sh",
          "--contract",
          "task.contract.md",
          "--strict",
          "--read-only",
          "--report-file",
          "report.json",
        ],
        cwd,
        { PATH: `${join(cwd, "shim")}:${process.env.PATH ?? ""}` },
      );
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("non-numeric start timestamp");
      expect(res.stderr).toContain("not-a-timestamp");
      expect(existsSync(join(cwd, ".ai/harness/should-not-run"))).toBe(false);
      const report = JSON.parse(readFileSync(join(cwd, "report.json"), "utf-8"));
      expect(report.failure_class).toBe("verification_budget");
      expect(report.next_status).toBe("Pending");
      expect(report.total_duration_ms).toBeNull();
      expect(report.failed).toBe(1);
      expect(report.results.some((entry: any) => entry.kind === "verification_budget")).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract should fail unsupported task profile", () => {
    const cwd = tmpWorkspace("helper-verify-contract-profile-invalid");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: invalid-profile",
          "",
          "> **Status**: Pending",
          "> **Task Profile**: unsafe-all",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - docs/spec.md",
          "```",
          "",
        ].join("\n")
      );

      const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"], cwd);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("unsupported task_profile: unsafe-all");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  // Deliberately does not assert on overall exit code / --strict: this contract carries
  // no ## Root Cause Evidence section, and once the bugfix root-cause gate (H2/H3) is
  // wired in, a bugfix contract without that section will legitimately fail elsewhere.
  // This test only proves the task_profile enum itself accepts "bugfix".

  test("verify-contract should accept bugfix as a legal task_profile enum value", () => {
    const cwd = tmpWorkspace("helper-verify-contract-profile-bugfix");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: bugfix-profile",
          "",
          "> **Status**: Pending",
          "> **Task Profile**: bugfix",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - docs/spec.md",
          "```",
          "",
        ].join("\n")
      );

      const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md"], cwd);
      expect(res.stdout).toContain("[PASS] task_profile: bugfix");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  describe("verify-contract bugfix root-cause evidence gate", () => {
    // Shared with tests/contract-run.test.ts's TypeScript-side root-cause gate tests via
    // tests/fixtures/root-cause/expected-results.ts: both independent gate
    // implementations (verify-contract.sh here, contract-run.ts there) are run against
    // the exact same fixture files and asserted against the exact same expected
    // outcomes, so neither side can silently drift from the other.
    for (const fixtureCase of ROOT_CAUSE_FIXTURE_CASES) {
      test(`verify-contract: ${fixtureCase.name}`, () => {
        const workDir = tmpWorkspace("helper-verify-contract-root-cause");
        try {
          const reportFile = join(workDir, "report.json");
          const res = run(
            "bash",
            [
              "scripts/verify-contract.sh",
              "--contract",
              `tests/fixtures/root-cause/${fixtureCase.contractFile}`,
              "--read-only",
              "--quiet",
              "--strict",
              "--report-file",
              reportFile,
            ],
            ROOT,
          );
          expect(res.status).toBe(fixtureCase.expectOk ? 0 : 1);
          const report = JSON.parse(readFileSync(reportFile, "utf-8"));
          const rootCauseResults = (
            report.results as Array<{ kind: string; passed: boolean; message: string }>
          ).filter((entry) => entry.kind === "root_cause_evidence");
          if (fixtureCase.expectOk) {
            expect(rootCauseResults.every((entry) => entry.passed)).toBe(true);
          } else if (fixtureCase.expectIssueSubstring) {
            const joinedMessages = rootCauseResults.map((entry) => entry.message).join(" | ");
            expect(joinedMessages).toContain(fixtureCase.expectIssueSubstring);
          }
        } finally {
          rmSync(workDir, { recursive: true, force: true });
        }
      }, 30_000);
    }
  });

  test("verify-contract should reject ledger-closeout runtime allowed paths by default", () => {
    const cwd = tmpWorkspace("helper-verify-contract-profile-ledger-paths");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: ledger-closeout",
          "",
          "> **Status**: Pending",
          "> **Task Profile**: ledger-closeout",
          "",
          "## Allowed Paths",
          "",
          "```yaml",
          "allowed_paths:",
          "  - plans/",
          "  - src/",
          "```",
          "",
          "## Exit Criteria",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - docs/spec.md",
          "```",
          "",
        ].join("\n")
      );

      const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"], cwd);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("ledger-closeout profile cannot allow runtime code or hook paths");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract should pass frontend profile when files_exist includes a design brief", () => {
    const cwd = tmpWorkspace("helper-verify-contract-profile-frontend-pass");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "docs/design"), { recursive: true });
      copyHelpers(cwd);
      installHooks(cwd);

      writeFileSync(join(cwd, "docs/design/DESIGN-fixture.md"), "# Design Brief: fixture\n");
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: frontend-with-brief",
          "",
          "> **Status**: Pending",
          "> **Task Profile**: frontend",
          "",
          "## Exit Criteria",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - docs/design/DESIGN-fixture.md",
          "```",
          "",
          verificationPlan([]),
          "## Evidence Requirements",
          "",
          "```yaml",
          "evidence_requirements:",
          "  benchmark: not_applicable",
          "```",
          "",
        ].join("\n")
      );

      commitVerificationFixture(cwd);

      const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"], cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("task_profile: frontend");
      expect(res.stdout).not.toContain("frontend profile requires a design brief artifact");
      expect(readFileSync(join(cwd, "task.contract.md"), "utf-8")).toContain("> **Status**: Fulfilled");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("verify-contract should fail frontend profile when files_exist has no design brief", () => {
    const cwd = tmpWorkspace("helper-verify-contract-profile-frontend-fail");
    try {
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "task.contract.md"),
        [
          "# Task Contract: frontend-without-brief",
          "",
          "> **Status**: Pending",
          "> **Task Profile**: frontend",
          "",
          "## Exit Criteria",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - docs/spec.md",
          "```",
          "",
        ].join("\n")
      );

      const res = run("bash", ["scripts/verify-contract.sh", "--contract", "task.contract.md", "--strict"], cwd);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("frontend profile requires a design brief artifact in files_exist");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
