import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { ROOT_CAUSE_FIXTURE_CASES } from "./fixtures/root-cause/expected-results";

const ROOT = join(import.meta.dir, "..");

function makeRepo(prefix = "contract-run-"): string {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(repo, "plans"), { recursive: true });
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "tasks/contracts"), { recursive: true });
  mkdirSync(join(repo, "tasks/reviews"), { recursive: true });
  mkdirSync(join(repo, "tasks/notes"), { recursive: true });
  mkdirSync(join(repo, ".ai/harness/runs"), { recursive: true });
  writeFileSync(join(repo, "plans/plan.md"), "# Plan\n");
  writeFileSync(join(repo, "tasks/notes/pilot.notes.md"), "# Notes\n");
  return repo;
}

function writePilotContract(
  repo: string,
  runnerInvocations: string | number | null = 2,
  why: string = "This pilot proves the worker→verifier file-coupled loop; without it the runner ships unverified.",
  options: { exemplar?: boolean; stopConditions?: string[]; runnerFallback?: string | null } = {},
): string {
  const contractPath = join(repo, "tasks/contracts/pilot.contract.md");
  const budgetValue = runnerInvocations === null ? "null" : String(runnerInvocations);
  const fallbackValue = options.runnerFallback === undefined ? "main-thread" : options.runnerFallback === null ? "null" : options.runnerFallback;
  writeFileSync(
    contractPath,
    [
      "# Task Contract: pilot",
      "",
      "> **Status**: Active",
      "> **Plan**: plans/plan.md",
      "> **Owner**: test",
      "> **Review File**: `tasks/reviews/pilot.review.md`",
      "> **Notes File**: `tasks/notes/pilot.notes.md`",
      ...(options.exemplar ? ["> **Exemplar**: `docs/reference-configs/contract-brief-example.md`"] : []),
      "",
      "## Why",
      "",
      why,
      "",
      "## Goal",
      "",
      "Create src/pilot.txt containing worker-output so the verifier can confirm the exit criteria.",
      "",
      "## Scope",
      "",
      "- In scope: create src/pilot.txt with worker-output",
      "- Out of scope: anything outside src/",
      "",
      ...(options.stopConditions && options.stopConditions.length > 0
        ? ["## Stop Conditions", "", ...options.stopConditions, ""]
        : []),
      "## Allowed Paths",
      "",
      "```yaml",
      "allowed_paths:",
      "  - src/",
      "  - tasks/reviews/",
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
      "    tokens: null",
      `    runner_invocations: ${budgetValue}`,
      "    wall_time_minutes: 5",
      "  permission_scope:",
      "    mode: inherit_allowed_paths",
      "    writable_paths: []",
      "    network: inherited",
      "  roles:",
      "    parent:",
      "      mode: narrate_and_gatekeep",
      "      purpose: approval_checkpoint_owner",
      "    explorer:",
      "      mode: read_only",
      "      purpose: codebase_research",
      "    worker:",
      "      mode: edit_within_allowed_paths",
      "      purpose: implementation",
      "    verifier:",
      "      mode: read_only",
      "      purpose: exit_criteria_review",
      "  runner:",
      "    preferred:",
      "      - subagent",
      "      - codex-subagent",
      "      - codex-exec",
      "      - main-thread",
      `    fallback: ${fallbackValue}`,
      "    brief_is_authoritative: true",
      "```",
      "",
      "## Exit Criteria (Machine Verifiable)",
      "",
      "```yaml",
      "exit_criteria:",
      "  files_exist:",
      "    - src/pilot.txt",
      "  commands_succeed:",
      "    - test -f src/pilot.txt",
      "  files_contain:",
      "    - path: src/pilot.txt",
      "      pattern: worker-output",
      "  qa_scores:",
      "    - dimension: functionality",
      "      min: 7",
      "  manual_checks:",
      '    - "Evaluator review file recommends pass"',
      "```",
      "",
    ].join("\n"),
  );
  return contractPath;
}

// Same shape as writePilotContract, except "Out of scope:" is left as a bare label with
// no bullet content, while "In scope:" stays populated. Exercises the split preflight:
// each side of Scope must be independently concrete.
function writeContractWithBlankOutOfScope(repo: string): string {
  const contractPath = join(repo, "tasks/contracts/pilot.contract.md");
  writeFileSync(
    contractPath,
    [
      "# Task Contract: pilot",
      "",
      "> **Status**: Active",
      "> **Plan**: plans/plan.md",
      "> **Owner**: test",
      "> **Review File**: `tasks/reviews/pilot.review.md`",
      "> **Notes File**: `tasks/notes/pilot.notes.md`",
      "",
      "## Goal",
      "",
      "Create src/pilot.txt containing worker-output so the verifier can confirm the exit criteria.",
      "",
      "## Scope",
      "",
      "- In scope: create src/pilot.txt with worker-output",
      "- Out of scope:",
      "",
      "## Allowed Paths",
      "",
      "```yaml",
      "allowed_paths:",
      "  - src/",
      "  - tasks/reviews/",
      "```",
      "",
      "## Delegation Contract",
      "",
      "```yaml",
      "delegation:",
      "  budget:",
      "    tokens: null",
      "    runner_invocations: 2",
      "    wall_time_minutes: 5",
      "  permission_scope:",
      "    mode: inherit_allowed_paths",
      "    writable_paths: []",
      "    network: inherited",
      "  roles:",
      "    worker:",
      "      mode: edit_within_allowed_paths",
      "      purpose: implementation",
      "```",
      "",
      "## Exit Criteria (Machine Verifiable)",
      "",
      "```yaml",
      "exit_criteria:",
      "  files_exist:",
      "    - src/pilot.txt",
      "```",
      "",
    ].join("\n"),
  );
  return contractPath;
}

// Writes a self-sufficient brief (so base preflight issues never mask the delegation-only
// case under test) with a caller-supplied Delegation Contract budget/permission_scope body,
// isolating each enforce-or-reject and rename assertion to exactly the lines under test.
function writeContractWithDelegation(repo: string, delegationBudgetAndScopeLines: string[]): string {
  const contractPath = join(repo, "tasks/contracts/pilot.contract.md");
  writeFileSync(
    contractPath,
    [
      "# Task Contract: pilot",
      "",
      "> **Status**: Active",
      "> **Plan**: plans/plan.md",
      "> **Owner**: test",
      "> **Review File**: `tasks/reviews/pilot.review.md`",
      "> **Notes File**: `tasks/notes/pilot.notes.md`",
      "",
      "## Why",
      "",
      "This pilot proves the worker→verifier file-coupled loop; without it the runner ships unverified.",
      "",
      "## Goal",
      "",
      "Create src/pilot.txt containing worker-output so the verifier can confirm the exit criteria.",
      "",
      "## Scope",
      "",
      "- In scope: create src/pilot.txt with worker-output",
      "- Out of scope: anything outside src/",
      "",
      "## Allowed Paths",
      "",
      "```yaml",
      "allowed_paths:",
      "  - src/",
      "  - tasks/reviews/",
      "```",
      "",
      "## Delegation Contract",
      "",
      "```yaml",
      "delegation:",
      ...delegationBudgetAndScopeLines,
      "  roles:",
      "    worker:",
      "      mode: edit_within_allowed_paths",
      "      purpose: implementation",
      "```",
      "",
      "## Exit Criteria (Machine Verifiable)",
      "",
      "```yaml",
      "exit_criteria:",
      "  files_exist:",
      "    - src/pilot.txt",
      "```",
      "",
    ].join("\n"),
  );
  return contractPath;
}

function writeExecutable(repo: string, name: string, body: string): string {
  const path = join(repo, name);
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  return `./${name}`;
}

function runContractRun(repo: string, args: string[]) {
  return spawnSync("bun", ["scripts/contract-run.ts", ...args], {
    cwd: ROOT,
    encoding: "utf-8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
    },
  });
}

function parseJson(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("contract-run helper", () => {
  test("dry-run writes prompts and manifest without spawning children", () => {
    const repo = makeRepo();
    try {
      writePilotContract(repo, 2);
      const res = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/dry-run",
        "--json",
      ]);

      expect(res.status).toBe(0);
      const manifest = parseJson(res.stdout);
      expect(manifest.kind).toBe("repo-harness-contract-run");
      expect(manifest.status).toBe("dry_run");
      expect(manifest.contract).toBe("tasks/contracts/pilot.contract.md");
      expect((manifest.children as unknown[])).toEqual([]);
      expect((manifest.delegation_plan as { verifier_rubric: string }).verifier_rubric).toBe("contract exit_criteria");
      expect((manifest.delegation_plan as { allowed_paths: string[] }).allowed_paths).toEqual(["src/", "tasks/reviews/"]);
      expect(((manifest.delegation_plan as { verifier: { mode: string } }).verifier).mode).toBe("read_only");
      expect(existsSync(join(repo, ".ai/harness/runs/dry-run/worker-prompt.md"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/runs/dry-run/verifier-prompt.md"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/runs/dry-run/manifest.json"))).toBe(true);
      const workerPromptContent = readFileSync(join(repo, ".ai/harness/runs/dry-run/worker-prompt.md"), "utf-8");
      expect(workerPromptContent).toContain("Permission scope: inherit_allowed_paths");
      expect(workerPromptContent).toContain("## Why this task matters");
      expect(workerPromptContent).toContain("## Before you finish (mandatory self-verification)");
      expect(workerPromptContent).toContain("## Record what you learned");
      expect(workerPromptContent).toContain("## Stop / escalate");
      expect(workerPromptContent).not.toContain("Exemplar:");
      const verifierPromptContent = readFileSync(join(repo, ".ai/harness/runs/dry-run/verifier-prompt.md"), "utf-8");
      expect(verifierPromptContent).toContain("## Intent (context only)");
      expect(verifierPromptContent).toContain("Score PASS or FAIL strictly against the Exit Criteria");
      expect(existsSync(join(repo, "src/pilot.txt"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("dry-run propagates contract Why/Goal/Scope/Exemplar/Stop Conditions content into prompts", () => {
    const repo = makeRepo("contract-run-propagation-");
    try {
      const distinctWhy = "Distinct-why-marker: prove propagation into worker prompt.";
      writePilotContract(repo, 2, distinctWhy, {
        exemplar: true,
        stopConditions: ["- Stop if the propagation marker is missing."],
      });
      const res = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/propagation",
        "--json",
      ]);

      expect(res.status).toBe(0);
      const workerPromptContent = readFileSync(
        join(repo, ".ai/harness/runs/propagation/worker-prompt.md"),
        "utf-8",
      );
      const workerPreContract = workerPromptContent.split("\n## Contract\n")[0];
      expect(workerPreContract).toContain(distinctWhy);
      expect(workerPreContract).toContain("Exemplar: docs/reference-configs/contract-brief-example.md");
      expect(workerPreContract).toContain("  - Stop if the propagation marker is missing.");

      const verifierPromptContent = readFileSync(
        join(repo, ".ai/harness/runs/propagation/verifier-prompt.md"),
        "utf-8",
      );
      expect(verifierPromptContent).toContain(
        "Goal: Create src/pilot.txt containing worker-output so the verifier can confirm the exit criteria.",
      );
      expect(verifierPromptContent).toContain("Scope: - In scope: create src/pilot.txt with worker-output");
      expect(verifierPromptContent).toContain(`Why: ${distinctWhy}`);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("run executes worker then verifier and leaves a contract-verifiable review", () => {
    const repo = makeRepo();
    try {
      writePilotContract(repo, 2);
      const workerCommand = writeExecutable(
        repo,
        "worker.sh",
        [
          "#!/bin/bash",
          "set -euo pipefail",
          'test "$CONTRACT_RUN_ROLE" = "worker"',
          'test -f "$CONTRACT_RUN_PROMPT"',
          'test "$CONTRACT_RUN_CONTRACT" = "tasks/contracts/pilot.contract.md"',
          'printf "%s" "$CONTRACT_RUN_ALLOWED_PATHS" | grep -q "src/"',
          "mkdir -p src",
          "printf 'worker-output\\n' > src/pilot.txt",
          "",
        ].join("\n"),
      );
      const verifierCommand = writeExecutable(
        repo,
        "verifier.sh",
        [
          "#!/bin/bash",
          "set -euo pipefail",
          'test "$CONTRACT_RUN_ROLE" = "verifier"',
          'test -f "$CONTRACT_RUN_PROMPT"',
          'printf "%s" "$CONTRACT_RUN_VERIFIER_RUBRIC" | grep -q "files_exist"',
          "mkdir -p \"$(dirname \"$CONTRACT_RUN_REVIEW\")\"",
          "cat > \"$CONTRACT_RUN_REVIEW\" <<'REVIEW_EOF'",
          "# Contract Review: pilot",
          "",
          "> **Recommendation**: pass",
          "",
          "## Scorecard",
          "",
          "| Dimension | Score | Notes |",
          "| --- | --- | --- |",
          "| Functionality | 8/10 | Worker artifact and verifier review satisfy exit criteria. |",
          "",
          "## External Acceptance Advice",
          "",
          "- pass: pilot contract is verifiable",
          "REVIEW_EOF",
          "",
        ].join("\n"),
      );

      const res = runContractRun(repo, [
        "run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--worker-command",
        workerCommand,
        "--verifier-command",
        verifierCommand,
        "--out",
        ".ai/harness/runs/pilot",
        "--json",
      ]);

      expect(res.status).toBe(0);
      const manifest = parseJson(res.stdout);
      expect(manifest.status).toBe("pass");
      expect((manifest.budget_usage as { runner_invocations: number }).runner_invocations).toBe(2);
      expect((manifest.children as unknown[])).toHaveLength(2);
      expect(readFileSync(join(repo, "src/pilot.txt"), "utf-8")).toContain("worker-output");
      expect(existsSync(join(repo, "tasks/reviews/pilot.review.md"))).toBe(true);

      const verifyReport = ".ai/harness/runs/pilot/verify-report.json";
      const verify = spawnSync(
        "bash",
        [
          join(ROOT, "scripts/verify-contract.sh"),
          "--contract",
          "tasks/contracts/pilot.contract.md",
          "--strict",
          "--read-only",
          "--report-file",
          verifyReport,
        ],
        {
          cwd: repo,
          encoding: "utf-8",
          // This synthetic repo has no .ai/hooks/ scaffold, so point verify-contract.sh
          // at the real repo's shared lib (its documented override) instead of letting
          // it silently fail the evidence_requirements check closed for a missing lib.
          env: { ...process.env, REPO_HARNESS_WORKFLOW_STATE_LIB: join(ROOT, "assets/hooks/lib/workflow-state.sh") },
        },
      );
      if (verify.status !== 0) {
        console.error(
          [
            "verify-contract failed in contract-run test",
            `status=${verify.status}`,
            `signal=${verify.signal ?? ""}`,
            "stdout:",
            verify.stdout,
            "stderr:",
            verify.stderr,
            "report:",
            existsSync(join(repo, verifyReport)) ? readFileSync(join(repo, verifyReport), "utf-8") : "(missing)",
            "review:",
            existsSync(join(repo, "tasks/reviews/pilot.review.md"))
              ? readFileSync(join(repo, "tasks/reviews/pilot.review.md"), "utf-8")
              : "(missing)",
            "artifact:",
            existsSync(join(repo, "src/pilot.txt")) ? readFileSync(join(repo, "src/pilot.txt"), "utf-8") : "(missing)",
          ].join("\n"),
        );
      }
      expect(verify.status).toBe(0);
      expect(verify.stdout).toContain("[ContractVerify] total=");
      expect(verify.stdout).toContain("failed=0");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("budget overrun stops before the next child command", () => {
    const repo = makeRepo("contract-run-budget-");
    try {
      writePilotContract(repo, 1);
      const workerCommand = writeExecutable(
        repo,
        "worker.sh",
        [
          "#!/bin/bash",
          "set -euo pipefail",
          "mkdir -p src",
          "printf 'worker-output\\n' > src/pilot.txt",
          "",
        ].join("\n"),
      );
      const verifierCommand = writeExecutable(
        repo,
        "verifier.sh",
        [
          "#!/bin/bash",
          "set -euo pipefail",
          "printf 'verifier-ran\\n' > verifier-ran.txt",
          "",
        ].join("\n"),
      );

      const res = runContractRun(repo, [
        "run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--worker-command",
        workerCommand,
        "--verifier-command",
        verifierCommand,
        "--out",
        ".ai/harness/runs/budget",
        "--json",
      ]);

      expect(res.status).toBe(1);
      const manifest = parseJson(res.stdout);
      expect(manifest.status).toBe("fail");
      expect(manifest.failure_class).toBe("budget_exceeded");
      expect(
        (manifest.budget_usage as { runner_invocations: number; runner_invocation_limit: number }).runner_invocations,
      ).toBe(1);
      expect(
        (manifest.budget_usage as { runner_invocations: number; runner_invocation_limit: number })
          .runner_invocation_limit,
      ).toBe(1);
      const children = manifest.children as Array<{ role: string; skipped?: boolean }>;
      expect(children).toEqual([
        expect.objectContaining({ role: "worker" }),
        expect.objectContaining({ role: "verifier", skipped: true }),
      ]);
      expect(existsSync(join(repo, "src/pilot.txt"))).toBe(true);
      expect(existsSync(join(repo, "verifier-ran.txt"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("unknown flags exit with usage error", () => {
    const res = runContractRun(ROOT, ["dry-run", "--bogus"]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("unknown argument --bogus");
  });

  test("preflight passes for a self-sufficient brief", () => {
    const repo = makeRepo("contract-run-preflight-ok-");
    try {
      writePilotContract(repo, 2);
      const res = runContractRun(repo, [
        "preflight",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--json",
      ]);
      expect(res.status).toBe(0);
      const manifest = parseJson(res.stdout);
      expect(manifest.status).toBe("preflight_pass");
      expect((manifest.brief_preflight as { ok: boolean }).ok).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("golden example contract brief passes its own preflight gate", () => {
    const repo = makeRepo("contract-run-golden-example-");
    try {
      const exampleContract = readFileSync(
        join(ROOT, "docs/reference-configs/contract-brief-example.md"),
        "utf-8",
      );
      writeFileSync(join(repo, "tasks/contracts/golden-example.contract.md"), exampleContract);
      const res = runContractRun(repo, [
        "preflight",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/golden-example.contract.md",
        "--json",
      ]);
      expect(res.status).toBe(0);
      const manifest = parseJson(res.stdout);
      expect(manifest.status).toBe("preflight_pass");
      expect((manifest.brief_preflight as { ok: boolean }).ok).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  describe("bugfix root-cause evidence gate", () => {
    // Runs contract-run.ts directly against the real repo (not a synthetic temp repo):
    // these fixtures' regression_guard and pre_fix_failure_artifact paths point at real
    // files under tests/fixtures/root-cause/, so --repo ROOT resolves them without
    // needing to copy that directory into a throwaway workspace.
    function runFixturePreflight(contractRelativePath: string) {
      return spawnSync(
        "bun",
        ["scripts/contract-run.ts", "preflight", "--repo", ROOT, "--contract", contractRelativePath, "--json"],
        { cwd: ROOT, encoding: "utf-8", env: { ...process.env, FORCE_COLOR: "0" } },
      );
    }

    // Shared with tests/helper-scripts.test.ts's bash-side root-cause gate tests via
    // tests/fixtures/root-cause/expected-results.ts, so both independent gate
    // implementations (contract-run.ts here, verify-contract.sh there) are proven
    // against the exact same fixture files and the exact same expected outcomes.
    for (const fixtureCase of ROOT_CAUSE_FIXTURE_CASES) {
      test(fixtureCase.name, () => {
        const res = runFixturePreflight(`tests/fixtures/root-cause/${fixtureCase.contractFile}`);
        expect(res.status).toBe(fixtureCase.expectOk ? 0 : 1);
        const manifest = parseJson(res.stdout);
        const briefPreflight = manifest.brief_preflight as { ok: boolean; issues: string[] };
        expect(briefPreflight.ok).toBe(fixtureCase.expectOk);
        if (!fixtureCase.expectOk && fixtureCase.expectIssueSubstring) {
          expect(briefPreflight.issues.join(" | ")).toContain(fixtureCase.expectIssueSubstring);
        }
      });
    }

    test("bugfix golden example contract passes its own preflight gate against real fixtures", () => {
      const res = runFixturePreflight("docs/reference-configs/contract-brief-example-bugfix.md");
      expect(res.status).toBe(0);
      const manifest = parseJson(res.stdout);
      expect(manifest.status).toBe("preflight_pass");
      const briefPreflight = manifest.brief_preflight as { ok: boolean; issues: string[] };
      expect(briefPreflight.ok).toBe(true);
      expect(briefPreflight.issues).toEqual([]);
    });
  });

  test("preflight fails closed when Why is a placeholder", () => {
    const repo = makeRepo("contract-run-why-placeholder-");
    try {
      writePilotContract(
        repo,
        2,
        "Why this task matters and what breaks downstream if it ships wrong or is skipped.",
      );
      const res = runContractRun(repo, [
        "preflight",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--json",
      ]);
      expect(res.status).toBe(1);
      const manifest = parseJson(res.stdout);
      expect(manifest.status).toBe("fail");
      expect(manifest.failure_class).toBe("incomplete_brief");
      expect((manifest.brief_preflight as { issues: string[] }).issues).toContain(
        "Why section is empty or still a template placeholder",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("preflight fails closed on a placeholder brief", () => {
    const repo = makeRepo("contract-run-preflight-fail-");
    try {
      writeFileSync(
        join(repo, "tasks/contracts/pilot.contract.md"),
        [
          "# Task Contract: pilot",
          "",
          "## Goal",
          "",
          "Describe the exact outcome this task must deliver.",
          "",
          "## Scope",
          "",
          "- In scope:",
          "- Out of scope:",
          "",
          "## Allowed Paths",
          "",
          "```yaml",
          "allowed_paths:",
          "  - src/",
          "```",
          "",
          "## Exit Criteria (Machine Verifiable)",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/pilot.txt",
          "```",
          "",
        ].join("\n"),
      );
      const res = runContractRun(repo, [
        "preflight",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--json",
      ]);
      expect(res.status).toBe(1);
      const manifest = parseJson(res.stdout);
      expect(manifest.status).toBe("fail");
      expect(manifest.failure_class).toBe("incomplete_brief");
      expect((manifest.brief_preflight as { issues: string[] }).issues.length).toBeGreaterThanOrEqual(2);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("run refuses an incomplete brief before dispatching the worker", () => {
    const repo = makeRepo("contract-run-incomplete-");
    try {
      writeFileSync(
        join(repo, "tasks/contracts/pilot.contract.md"),
        [
          "# Task Contract: pilot",
          "",
          "> **Review File**: `tasks/reviews/pilot.review.md`",
          "",
          "## Goal",
          "",
          "Describe the exact outcome this task must deliver.",
          "",
          "## Scope",
          "",
          "- In scope:",
          "- Out of scope:",
          "",
          "## Allowed Paths",
          "",
          "```yaml",
          "allowed_paths:",
          "  - src/",
          "```",
          "",
          "## Delegation Contract",
          "",
          "```yaml",
          "delegation:",
          "  budget:",
          "    tokens: null",
          "    runner_invocations: null",
          "    wall_time_minutes: 5",
          "  permission_scope:",
          "    mode: inherit_allowed_paths",
          "    writable_paths: []",
          "    network: inherited",
          "  roles:",
          "    worker:",
          "      mode: edit_within_allowed_paths",
          "      purpose: implementation",
          "```",
          "",
          "## Exit Criteria (Machine Verifiable)",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/pilot.txt",
          "```",
          "",
        ].join("\n"),
      );
      const workerCommand = writeExecutable(
        repo,
        "worker.sh",
        ["#!/bin/bash", "set -euo pipefail", "mkdir -p src", "printf 'worker-output\\n' > src/pilot.txt", ""].join("\n"),
      );
      const verifierCommand = writeExecutable(
        repo,
        "verifier.sh",
        ["#!/bin/bash", "set -euo pipefail", "printf 'ran\\n' > verifier-ran.txt", ""].join("\n"),
      );
      const res = runContractRun(repo, [
        "run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--worker-command",
        workerCommand,
        "--verifier-command",
        verifierCommand,
        "--out",
        ".ai/harness/runs/incomplete",
        "--json",
      ]);
      expect(res.status).toBe(1);
      const manifest = parseJson(res.stdout);
      expect(manifest.status).toBe("fail");
      expect(manifest.failure_class).toBe("incomplete_brief");
      expect(manifest.children as unknown[]).toEqual([]);
      expect(existsSync(join(repo, "src/pilot.txt"))).toBe(false);
      expect(existsSync(join(repo, "verifier-ran.txt"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("runner metadata from the contract flows into the manifest", () => {
    const repo = makeRepo("contract-run-runner-");
    try {
      writePilotContract(repo, 2);
      const res = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/runner",
        "--json",
      ]);
      expect(res.status).toBe(0);
      const manifest = parseJson(res.stdout);
      const runner = (
        manifest.delegation as {
          runner: { preferred: string[]; fallback: string | null; brief_is_authoritative: boolean };
        }
      ).runner;
      expect(runner.preferred).toEqual(["subagent", "codex-subagent", "codex-exec", "main-thread"]);
      expect(runner.fallback).toBe("main-thread");
      expect(runner.brief_is_authoritative).toBe(true);
      const runnerUsage = manifest.runner_usage as { used: string; off_policy: boolean };
      expect(runnerUsage.used).toBe("subagent");
      expect(runnerUsage.off_policy).toBe(false);
      const runnerUsagePath = manifest.runner_usage as { path: string; effort: string | null };
      expect(runnerUsagePath.path).toBe("worker_preferred");
      expect(runnerUsagePath.effort).toBe(null);
      const roleProfiles = (
        manifest.delegation_plan as {
          role_profiles: { parent: string; explorer: string; worker: string; verifier: string };
        }
      ).role_profiles;
      expect(roleProfiles).toEqual({
        parent: "orchestrator",
        explorer: "explorer",
        worker: "fast-worker",
        verifier: "gatekeeper",
      });

      const codexSubagentRes = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/runner-codex-subagent",
        "--runner",
        "codex-subagent",
        "--json",
      ]);
      expect(codexSubagentRes.status).toBe(0);
      const codexSubagentManifest = parseJson(codexSubagentRes.stdout);
      const codexSubagentUsage = codexSubagentManifest.runner_usage as { used: string; off_policy: boolean };
      expect(codexSubagentUsage.used).toBe("codex-subagent");
      expect(codexSubagentUsage.off_policy).toBe(false);
      // Plain preferred-list dispatch (this fixture's fallback is main-thread, not
      // codex-subagent): the Codex label must still pass through unchanged, symmetric to
      // the codex-exec assertion below.
      const codexSubagentRoleProfiles = (
        codexSubagentManifest.delegation_plan as { role_profiles: { worker: string } }
      ).role_profiles;
      expect(codexSubagentRoleProfiles.worker).toBe("codex-subagent");

      const offPolicyRes = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/runner-off-policy",
        "--runner",
        "gpt-5-cli",
        "--json",
      ]);
      expect(offPolicyRes.status).toBe(0);
      const offPolicyManifest = parseJson(offPolicyRes.stdout);
      const offPolicyUsage = offPolicyManifest.runner_usage as { used: string; off_policy: boolean };
      expect(offPolicyUsage.used).toBe("gpt-5-cli");
      expect(offPolicyUsage.off_policy).toBe(true);

      // --runner main-thread matches the fixture's declared worker fallback, so the
      // worker model identity derives to sol-high and effort defaults to "high".
      const workerFallbackRes = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/runner-worker-fallback",
        "--runner",
        "main-thread",
        "--json",
      ]);
      expect(workerFallbackRes.status).toBe(0);
      const workerFallbackManifest = parseJson(workerFallbackRes.stdout);
      const workerFallbackUsage = workerFallbackManifest.runner_usage as {
        used: string;
        path: string;
        effort: string | null;
      };
      expect(workerFallbackUsage.path).toBe("worker_fallback");
      expect(workerFallbackUsage.effort).toBe("high");
      const workerFallbackRoleProfiles = (
        workerFallbackManifest.delegation_plan as { role_profiles: { worker: string } }
      ).role_profiles;
      expect(workerFallbackRoleProfiles.worker).toBe("sol-high");

      // --runner codex-exec is a Codex dispatch value: pass through unchanged rather than
      // coercing to fast-worker or sol-high, since Codex is an independent peer engineer.
      const codexExecRes = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/runner-codex-exec",
        "--runner",
        "codex-exec",
        "--json",
      ]);
      expect(codexExecRes.status).toBe(0);
      const codexExecManifest = parseJson(codexExecRes.stdout);
      const codexExecRoleProfiles = (
        codexExecManifest.delegation_plan as { role_profiles: { worker: string } }
      ).role_profiles;
      expect(codexExecRoleProfiles.worker).toBe("codex-exec");

      // An explicit --effort beats the "high" default that worker_fallback would otherwise apply.
      const workerFallbackXhighRes = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/runner-worker-fallback-xhigh",
        "--runner",
        "main-thread",
        "--effort",
        "xhigh",
        "--json",
      ]);
      expect(workerFallbackXhighRes.status).toBe(0);
      const workerFallbackXhighManifest = parseJson(workerFallbackXhighRes.stdout);
      const workerFallbackXhighUsage = workerFallbackXhighManifest.runner_usage as { effort: string | null };
      expect(workerFallbackXhighUsage.effort).toBe("xhigh");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // Worker identity must key off the literal --runner value alone, never off whether it
  // happens to match the contract's declared worker fallback. That "did we land on the
  // contract's fallback" question stays legitimate for runner_usage.path/effort only.
  test("--runner main-thread resolves worker identity to sol-high even when the contract declares no fallback", () => {
    const repo = makeRepo("contract-run-runner-nofallback-");
    try {
      writePilotContract(repo, 2, undefined, { runnerFallback: null });
      const res = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/runner-no-fallback",
        "--runner",
        "main-thread",
        "--json",
      ]);
      expect(res.status).toBe(0);
      const manifest = parseJson(res.stdout);
      const runner = (manifest.delegation as { runner: { fallback: string | null } }).runner;
      expect(runner.fallback).toBe(null);
      // main-thread does not match the (nonexistent) fallback, so this is worker_preferred
      // with no effort default -- yet role_profiles.worker must still be sol-high.
      const runnerUsage = manifest.runner_usage as { path: string; effort: string | null };
      expect(runnerUsage.path).toBe("worker_preferred");
      expect(runnerUsage.effort).toBe(null);
      const roleProfiles = (
        manifest.delegation_plan as { role_profiles: { worker: string } }
      ).role_profiles;
      expect(roleProfiles.worker).toBe("sol-high");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("a Codex runner label passes through unchanged even when it is the contract's declared fallback", () => {
    const repo = makeRepo("contract-run-runner-codexfallback-");
    try {
      writePilotContract(repo, 2, undefined, { runnerFallback: "codex-subagent" });
      const res = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/runner-codex-fallback",
        "--runner",
        "codex-subagent",
        "--json",
      ]);
      expect(res.status).toBe(0);
      const manifest = parseJson(res.stdout);
      const runner = (manifest.delegation as { runner: { fallback: string | null } }).runner;
      expect(runner.fallback).toBe("codex-subagent");
      // codex-subagent DOES match the declared fallback here, so worker_fallback is the
      // correct path -- that half of the derivation is orthogonal and untouched by the fix.
      const runnerUsage = manifest.runner_usage as { path: string };
      expect(runnerUsage.path).toBe("worker_fallback");
      const roleProfiles = (
        manifest.delegation_plan as { role_profiles: { worker: string } }
      ).role_profiles;
      // Codex is an independent peer provider: matching the contract's fallback must never
      // coerce it into sol-high (or fast-worker).
      expect(roleProfiles.worker).toBe("codex-subagent");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("invalid --effort value exits with usage error", () => {
    const res = runContractRun(ROOT, ["dry-run", "--effort", "nonsense"]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("contract-run: --effort must be one of low, medium, high, xhigh, max");
  });

  test("run fails closed on a blank Out of scope even though In scope is populated", () => {
    const repo = makeRepo("contract-run-outscope-run-");
    try {
      writeContractWithBlankOutOfScope(repo);
      const workerCommand = writeExecutable(
        repo,
        "worker.sh",
        ["#!/bin/bash", "set -euo pipefail", "mkdir -p src", "printf 'worker-output\\n' > src/pilot.txt", ""].join("\n"),
      );
      const verifierCommand = writeExecutable(
        repo,
        "verifier.sh",
        ["#!/bin/bash", "set -euo pipefail", "printf 'ran\\n' > verifier-ran.txt", ""].join("\n"),
      );

      const res = runContractRun(repo, [
        "run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--worker-command",
        workerCommand,
        "--verifier-command",
        verifierCommand,
        "--out",
        ".ai/harness/runs/outscope",
        "--json",
      ]);

      expect(res.status).toBe(1);
      const manifest = parseJson(res.stdout);
      expect(manifest.status).toBe("fail");
      expect(manifest.failure_class).toBe("incomplete_brief");
      const issues = (manifest.brief_preflight as { issues: string[] }).issues;
      expect(issues.some((issue) => /Out of scope/.test(issue))).toBe(true);
      expect(issues.some((issue) => /In scope/.test(issue))).toBe(false);
      expect(issues.some((issue) => /^Goal/.test(issue))).toBe(false);
      expect(manifest.children as unknown[]).toEqual([]);
      expect(existsSync(join(repo, "src/pilot.txt"))).toBe(false);
      expect(existsSync(join(repo, "verifier-ran.txt"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("dry-run stays advisory on a blank Out of scope", () => {
    const repo = makeRepo("contract-run-outscope-dryrun-");
    try {
      writeContractWithBlankOutOfScope(repo);
      const res = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/outscope-dry",
        "--json",
      ]);
      expect(res.status).toBe(0);
      const manifest = parseJson(res.stdout);
      expect(manifest.status).toBe("dry_run");
      const briefPreflight = manifest.brief_preflight as { ok: boolean; issues: string[] };
      expect(briefPreflight.ok).toBe(false);
      expect(briefPreflight.issues.some((issue) => /Out of scope/.test(issue))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/runs/outscope-dry/worker-prompt.md"))).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("worker prompt carries the execution boundary clause", () => {
    const repo = makeRepo("contract-run-boundary-");
    try {
      writePilotContract(repo, 2);
      const res = runContractRun(repo, [
        "dry-run",
        "--repo",
        repo,
        "--contract",
        "tasks/contracts/pilot.contract.md",
        "--out",
        ".ai/harness/runs/boundary",
        "--json",
      ]);
      expect(res.status).toBe(0);
      const workerPrompt = readFileSync(join(repo, ".ai/harness/runs/boundary/worker-prompt.md"), "utf-8");
      expect(workerPrompt).toContain(
        "Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief.",
      );
      expect(workerPrompt).toContain("Do not add optional features");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  describe("delegation budget enforce-or-reject", () => {
    test("preflight rejects a non-null tokens budget with a named-constraint message", () => {
      const repo = makeRepo("contract-run-tokens-reject-");
      try {
        writeContractWithDelegation(repo, [
          "  budget:",
          "    tokens: 5000",
          "    runner_invocations: null",
          "    wall_time_minutes: null",
          "  permission_scope:",
          "    mode: inherit_allowed_paths",
          "    writable_paths: []",
          "    network: inherited",
        ]);
        const res = runContractRun(repo, [
          "preflight",
          "--repo",
          repo,
          "--contract",
          "tasks/contracts/pilot.contract.md",
          "--json",
        ]);
        expect(res.status).toBe(1);
        const manifest = parseJson(res.stdout);
        expect(manifest.status).toBe("fail");
        expect(manifest.failure_class).toBe("unenforceable_delegation_constraint");
        const issues = (manifest.brief_preflight as { issues: string[] }).issues;
        expect(issues.some((issue) => issue.includes("budget.tokens") && issue.includes("5000"))).toBe(true);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    test("preflight rejects a non-inherited network value with a named-constraint message", () => {
      const repo = makeRepo("contract-run-network-reject-");
      try {
        writeContractWithDelegation(repo, [
          "  budget:",
          "    tokens: null",
          "    runner_invocations: null",
          "    wall_time_minutes: null",
          "  permission_scope:",
          "    mode: inherit_allowed_paths",
          "    writable_paths: []",
          "    network: none",
        ]);
        const res = runContractRun(repo, [
          "preflight",
          "--repo",
          repo,
          "--contract",
          "tasks/contracts/pilot.contract.md",
          "--json",
        ]);
        expect(res.status).toBe(1);
        const manifest = parseJson(res.stdout);
        expect(manifest.status).toBe("fail");
        expect(manifest.failure_class).toBe("unenforceable_delegation_constraint");
        const issues = (manifest.brief_preflight as { issues: string[] }).issues;
        expect(
          issues.some((issue) => issue.includes("permission_scope.network") && issue.includes("'none'")),
        ).toBe(true);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    test("preflight rejects a non-empty writable_paths narrowing with a named-constraint message", () => {
      const repo = makeRepo("contract-run-writable-paths-reject-");
      try {
        writeContractWithDelegation(repo, [
          "  budget:",
          "    tokens: null",
          "    runner_invocations: null",
          "    wall_time_minutes: null",
          "  permission_scope:",
          "    mode: inherit_allowed_paths",
          "    writable_paths:",
          "      - src/narrow.ts",
          "    network: inherited",
        ]);
        const res = runContractRun(repo, [
          "preflight",
          "--repo",
          repo,
          "--contract",
          "tasks/contracts/pilot.contract.md",
          "--json",
        ]);
        expect(res.status).toBe(1);
        const manifest = parseJson(res.stdout);
        expect(manifest.status).toBe("fail");
        expect(manifest.failure_class).toBe("unenforceable_delegation_constraint");
        const issues = (manifest.brief_preflight as { issues: string[] }).issues;
        expect(
          issues.some(
            (issue) => issue.includes("permission_scope.writable_paths") && issue.includes("src/narrow.ts"),
          ),
        ).toBe(true);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    test("preflight reports every unenforceable constraint together, not just the first", () => {
      const repo = makeRepo("contract-run-multi-reject-");
      try {
        writeContractWithDelegation(repo, [
          "  budget:",
          "    tokens: 1000",
          "    runner_invocations: null",
          "    wall_time_minutes: null",
          "  permission_scope:",
          "    mode: inherit_allowed_paths",
          "    writable_paths: []",
          "    network: sandboxed",
        ]);
        const res = runContractRun(repo, [
          "preflight",
          "--repo",
          repo,
          "--contract",
          "tasks/contracts/pilot.contract.md",
          "--json",
        ]);
        expect(res.status).toBe(1);
        const manifest = parseJson(res.stdout);
        const issues = (manifest.brief_preflight as { issues: string[] }).issues;
        expect(issues.some((issue) => issue.includes("budget.tokens"))).toBe(true);
        expect(issues.some((issue) => issue.includes("permission_scope.network"))).toBe(true);
        expect(issues.length).toBe(2);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    test("preflight passes when tokens is null, network is inherited, and writable_paths is empty", () => {
      const repo = makeRepo("contract-run-enforceable-ok-");
      try {
        writeContractWithDelegation(repo, [
          "  budget:",
          "    tokens: null",
          "    runner_invocations: 3",
          "    wall_time_minutes: 5",
          "  permission_scope:",
          "    mode: inherit_allowed_paths",
          "    writable_paths: []",
          "    network: inherited",
        ]);
        const res = runContractRun(repo, [
          "preflight",
          "--repo",
          repo,
          "--contract",
          "tasks/contracts/pilot.contract.md",
          "--json",
        ]);
        expect(res.status).toBe(0);
        const manifest = parseJson(res.stdout);
        expect(manifest.status).toBe("preflight_pass");
        expect((manifest.brief_preflight as { ok: boolean; issues: string[] }).issues).toEqual([]);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    test("preflight fails closed on the retired tool_calls field name instead of silently dropping the budget", () => {
      const repo = makeRepo("contract-run-legacy-field-");
      try {
        writeContractWithDelegation(repo, [
          "  budget:",
          "    tokens: null",
          "    tool_calls: 3",
          "    wall_time_minutes: null",
          "  permission_scope:",
          "    mode: inherit_allowed_paths",
          "    writable_paths: []",
          "    network: inherited",
        ]);
        const res = runContractRun(repo, [
          "preflight",
          "--repo",
          repo,
          "--contract",
          "tasks/contracts/pilot.contract.md",
          "--json",
        ]);
        expect(res.status).toBe(1);
        const manifest = parseJson(res.stdout);
        expect(manifest.status).toBe("fail");
        expect(manifest.failure_class).toBe("legacy_delegation_field");
        const issues = (manifest.brief_preflight as { issues: string[] }).issues;
        expect(
          issues.some((issue) => issue.includes("tool_calls") && issue.includes("runner_invocations")),
        ).toBe(true);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    test("run enforces wall_time_minutes via the bounded process runner deadline and kills an overrunning worker", () => {
      const repo = makeRepo("contract-run-walltime-");
      try {
        writeContractWithDelegation(repo, [
          "  budget:",
          "    tokens: null",
          "    runner_invocations: null",
          "    wall_time_minutes: 0.03",
          "  permission_scope:",
          "    mode: inherit_allowed_paths",
          "    writable_paths: []",
          "    network: inherited",
        ]);
        const workerCommand = writeExecutable(
          repo,
          "worker-slow.sh",
          ["#!/bin/bash", "sleep 10", "mkdir -p src", "printf 'worker-output\\n' > src/pilot.txt", ""].join("\n"),
        );
        const verifierCommand = writeExecutable(
          repo,
          "verifier.sh",
          ["#!/bin/bash", "printf 'ran\\n' > verifier-ran.txt", ""].join("\n"),
        );

        const res = runContractRun(repo, [
          "run",
          "--repo",
          repo,
          "--contract",
          "tasks/contracts/pilot.contract.md",
          "--worker-command",
          workerCommand,
          "--verifier-command",
          verifierCommand,
          "--out",
          ".ai/harness/runs/walltime",
          "--json",
        ]);

        expect(res.status).toBe(1);
        const manifest = parseJson(res.stdout);
        expect(manifest.status).toBe("fail");
        expect(manifest.failure_class).toBe("wall_time_exceeded");
        const children = manifest.children as Array<{ role: string; exit_code: number | null; timed_out?: boolean }>;
        expect(children[0].role).toBe("worker");
        expect(children[0].exit_code).toBe(124);
        expect(children[0].timed_out).toBe(true);
        // The worker never reached its own file write: the process was actually
        // terminated at the deadline, not merely reported as failed after completing.
        expect(existsSync(join(repo, "src/pilot.txt"))).toBe(false);
        expect(existsSync(join(repo, "verifier-ran.txt"))).toBe(false);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });
  });
});
