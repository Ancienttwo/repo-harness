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
  toolCalls: string | number | null = 2,
  why: string = "This pilot proves the worker→verifier file-coupled loop; without it the runner ships unverified.",
): string {
  const contractPath = join(repo, "tasks/contracts/pilot.contract.md");
  const budgetValue = toolCalls === null ? "null" : String(toolCalls);
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
      `    tool_calls: ${budgetValue}`,
      "    wall_time_minutes: 5",
      "  permission_scope:",
      "    mode: inherit_allowed_paths",
      "    writable_paths: []",
      "    network: off",
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
      "      - codex-exec",
      "      - main-thread",
      "    fallback: main-thread",
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
      const verifierPromptContent = readFileSync(join(repo, ".ai/harness/runs/dry-run/verifier-prompt.md"), "utf-8");
      expect(verifierPromptContent).toContain("## Intent (context only)");
      expect(verifierPromptContent).toContain("Score PASS or FAIL strictly against the Exit Criteria");
      expect(existsSync(join(repo, "src/pilot.txt"))).toBe(false);
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
      expect((manifest.budget_usage as { tool_calls: number }).tool_calls).toBe(2);
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
        { cwd: repo, encoding: "utf-8" },
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
      expect((manifest.budget_usage as { tool_calls: number; tool_call_limit: number }).tool_calls).toBe(1);
      expect((manifest.budget_usage as { tool_calls: number; tool_call_limit: number }).tool_call_limit).toBe(1);
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
          "    tool_calls: null",
          "    wall_time_minutes: 5",
          "  permission_scope:",
          "    mode: inherit_allowed_paths",
          "    writable_paths: []",
          "    network: off",
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
      expect(runner.preferred).toEqual(["subagent", "codex-exec", "main-thread"]);
      expect(runner.fallback).toBe("main-thread");
      expect(runner.brief_is_authoritative).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
