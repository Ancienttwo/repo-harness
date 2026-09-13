import { describe, expect, test } from "bun:test";
import { execFileSync, spawn, spawnSync } from "child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import type { JsonValue } from "../../src/core/evidence/types";
import { buildEvidenceEvent } from "../../src/effects/evidence/event-writer";
import {
  captureGitVirtualTreeSnapshot,
  evaluateVerificationContract,
  executeVerificationContract,
  validateMaterializedVerificationExecutionReport,
} from "../../src/effects/evidence/verification-execution";

const CLI = join(import.meta.dir, "..", "..", "scripts", "verification-plan.ts");
const PROJECTED_CLI = join(import.meta.dir, "..", "..", "assets", "templates", "helpers", "verification-plan.ts");
const LONG_CHECK_ID = "verification-execution-lifecycle-full-suite-check";

function git(repoRoot: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" }).trim();
}

function contract(plan: unknown, prose = "fixture"): string {
  return [
    "# Task Contract: fixture",
    "",
    `## Why\n\n${prose}`,
    "",
    "## Verification Plan",
    "",
    "```json",
    JSON.stringify(plan, null, 2),
    "```",
    "",
  ].join("\n");
}

function commandCheck(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "full",
    kind: "command",
    command: "printf 'x\\n' >> \"$COUNTER_PATH\"",
    cwd: ".",
    phase: "verification",
    cost: "expensive",
    evidence_policy: "current_exact",
    necessity: "fixture expensive command",
    inputs: { env: ["COUNTER_PATH"] },
    ...overrides,
  };
}

function setupRepo(name: string): { readonly root: string; readonly contractPath: string; readonly counterPath: string } {
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "verification@example.com");
  git(root, "config", "user.name", "verification");
  mkdirSync(join(root, "tasks", "contracts"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".ai/harness/evidence/\n.ai/harness/runs/\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "bun test" } }, null, 2));
  writeFileSync(join(root, "source.txt"), "source\n");
  const contractPath = "tasks/contracts/fixture.contract.md";
  writeFileSync(join(root, contractPath), contract({ protocol: 1, checks: [commandCheck()] }));
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "fixture");
  return { root, contractPath, counterPath: join(root, "..", `${name}-counter-${Date.now()}.txt`) };
}

function withRepo(name: string, fn: (repoRoot: string, contractPath: string, counterPath: string) => void): void {
  const fixture = setupRepo(name);
  try {
    fn(fixture.root, fixture.contractPath, fixture.counterPath);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(fixture.counterPath, { force: true });
  }
}

function projectReportThroughEvidenceWriter(
  repoRoot: string,
  report: ReturnType<typeof executeVerificationContract>,
): ReturnType<typeof executeVerificationContract> {
  const event = buildEvidenceEvent(repoRoot, {
    worktreeId: "verification-report-projection",
    eventType: "repository-integrity.result",
    trustClass: "authoritative_machine",
    producer: "verification-redaction-fixture",
    correlationRunId: "verification-redaction-fixture",
    subjectIdentity: {
      authority_commit: report.target.head_commit,
      base_commit: report.target.head_commit,
      target_commit: report.target.tree_hash,
      scope_hash: report.target.plan_hash,
      subject_hash: report.target.snapshot_hash,
      contract_hash: report.target.plan_hash,
      command_hash: report.target.plan_hash,
      env_provider_id: "verification-redaction-fixture",
    },
    payload: {
      kind: "json",
      value: { execution_evaluation: report } as unknown as JsonValue,
    },
  });
  if (event.payload === undefined) throw new Error("fixture report unexpectedly exceeded inline evidence capacity");
  return (event.payload as unknown as { execution_evaluation: ReturnType<typeof executeVerificationContract> })
    .execution_evaluation;
}

describe("Git virtual tree snapshot", () => {
  test("binds tracked edits, deletion, executable mode, and untracked content", () => {
    withRepo("verification-snapshot", (repoRoot) => {
      const initial = captureGitVirtualTreeSnapshot(repoRoot);
      writeFileSync(join(repoRoot, "source.txt"), "changed\n");
      const edited = captureGitVirtualTreeSnapshot(repoRoot);
      expect(edited.tree_hash).not.toBe(initial.tree_hash);
      writeFileSync(join(repoRoot, "new.sh"), "#!/bin/sh\n");
      chmodSync(join(repoRoot, "new.sh"), 0o755);
      const untracked = captureGitVirtualTreeSnapshot(repoRoot);
      expect(untracked.tree_hash).not.toBe(edited.tree_hash);
      rmSync(join(repoRoot, "source.txt"));
      expect(captureGitVirtualTreeSnapshot(repoRoot).tree_hash).not.toBe(untracked.tree_hash);
    });
  });
});

describe("verification execution lifecycle", () => {
  test("an admitted long check id reuses one exact expensive execution", () => {
    withRepo("verification-long-id-reuse", (repoRoot, contractPath, counterPath) => {
      writeFileSync(join(repoRoot, contractPath), contract({
        protocol: 1,
        checks: [commandCheck({ id: LONG_CHECK_ID })],
      }));
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const first = executeVerificationContract({ repoRoot, contractPath, env });
      const second = executeVerificationContract({ repoRoot, contractPath, env });
      const evaluated = evaluateVerificationContract({ repoRoot, contractPath, env });

      expect(first.results[0]!.execution).toBe("executed");
      expect(second.results[0]!.execution).toBe("reused");
      expect(second.results[0]!.execution_id).toBe(first.results[0]!.execution_id);
      expect(evaluated.status).toBe("passed");
      expect(evaluated.results[0]!.execution_id).toBe(first.results[0]!.execution_id);
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);
    });
  }, 30_000);

  test("renaming a check id does not authorize another expensive execution", () => {
    withRepo("verification-renamed-id", (repoRoot, contractPath, counterPath) => {
      writeFileSync(join(repoRoot, contractPath), contract({
        protocol: 1,
        checks: [commandCheck({ id: LONG_CHECK_ID })],
      }));
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const first = executeVerificationContract({ repoRoot, contractPath, env });
      expect(first.status).toBe("passed");

      writeFileSync(join(repoRoot, contractPath), contract({
        protocol: 1,
        checks: [commandCheck({ id: `${LONG_CHECK_ID}-renamed` })],
      }, "renamed display id"));
      const renamed = executeVerificationContract({ repoRoot, contractPath, env });
      expect(renamed.status).toBe("needs_verification_plan");
      expect(renamed.results[0]!.execution).toBe("missing");
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);
    });
  }, 30_000);

  test("a newer execution under a different display id cannot revive an older pass", () => {
    withRepo("verification-latest-different-id", (repoRoot, contractPath, counterPath) => {
      const renamedId = `${LONG_CHECK_ID}-renamed`;
      writeFileSync(join(repoRoot, contractPath), contract({
        protocol: 1,
        checks: [
          commandCheck({ id: LONG_CHECK_ID }),
          commandCheck({ id: renamedId }),
        ],
      }));
      const env = { ...process.env, COUNTER_PATH: counterPath };
      expect(executeVerificationContract({
        repoRoot,
        contractPath,
        env,
        forceReason: "record two explicitly authorized same-input identities",
      }).status).toBe("passed");

      const evaluated = evaluateVerificationContract({ repoRoot, contractPath, env });
      expect(evaluated.status).toBe("missing");
      expect(evaluated.results.find((result) => result.id === LONG_CHECK_ID)?.execution).toBe("missing");
      expect(evaluated.results.find((result) => result.id === renamedId)?.execution).toBe("reused");
      const originalAgain = executeVerificationContract({ repoRoot, contractPath, env });
      expect(originalAgain.status).toBe("needs_verification_plan");
      expect(originalAgain.results.find((result) => result.id === LONG_CHECK_ID)?.execution).toBe("missing");
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(2);
    });
  }, 30_000);

  test("an explicit empty executable plan evaluates as a bound vacuous pass", () => {
    withRepo("verification-empty", (repoRoot, contractPath) => {
      writeFileSync(join(repoRoot, contractPath), contract({ protocol: 1, checks: [] }, "artifact-only contract"));
      const report = evaluateVerificationContract({ repoRoot, contractPath });
      expect(report.status).toBe("passed");
      expect(report.results).toEqual([]);
      expect(validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report }).valid).toBe(true);
    });
  });

  test("CLI validate exposes the canonical plan and evaluate is read-only with nonzero missing status", () => {
    withRepo("verification-cli", (repoRoot, contractPath, counterPath) => {
      const validate = spawnSync("bun", [CLI, "validate", "--repo", repoRoot, "--contract", contractPath], {
        encoding: "utf8",
        env: { ...process.env, COUNTER_PATH: counterPath },
      });
      expect(validate.status).toBe(0);
      const validation = JSON.parse(validate.stdout);
      expect(validation.kind).toBe("verification_plan_validation");
      expect(validation.plan.checks[0].path).toBeUndefined();
      expect(validation.plan.checks[0].command).toContain("COUNTER_PATH");

      const evaluate = spawnSync("bun", [CLI, "evaluate", "--repo", repoRoot, "--contract", contractPath], {
        encoding: "utf8",
        env: { ...process.env, COUNTER_PATH: counterPath },
      });
      expect(evaluate.status).toBe(1);
      expect(JSON.parse(evaluate.stdout).status).toBe("missing");
      expect(() => readFileSync(counterPath, "utf8")).toThrow();

      const projected = spawnSync("bun", [PROJECTED_CLI, "evaluate", "--repo", repoRoot, "--contract", contractPath], {
        encoding: "utf8",
        env: { ...process.env, COUNTER_PATH: counterPath },
      });
      expect(projected.status).toBe(1);
      expect(JSON.parse(projected.stdout).results[0].cache_key).toBe(JSON.parse(evaluate.stdout).results[0].cache_key);
    });
  }, 30_000);

  test("executes package_test through the canonical package runner", () => {
    withRepo("verification-package-test", (repoRoot, contractPath, counterPath) => {
      mkdirSync(join(repoRoot, "tests"), { recursive: true });
      writeFileSync(
        join(repoRoot, "package.json"),
        JSON.stringify({ scripts: { test: "printf 'owner\\n' >> \"$PACKAGE_COUNTER\"; bun test" } }, null, 2),
      );
      writeFileSync(
        join(repoRoot, "tests", "pass.test.ts"),
        'import { expect, test } from "bun:test"; test("pass", () => expect(2 + 2).toBe(4));\n',
      );
      const packagePlan = {
        protocol: 1,
        checks: [{
          id: "package-test",
          kind: "package_test",
          path: "tests/pass.test.ts",
          cwd: ".",
          phase: "verification",
          cost: "normal",
          evidence_policy: "current_exact",
          necessity: "exercise the canonical package-owned test runner",
          inputs: { env: ["PACKAGE_COUNTER"] },
        }],
      };
      writeFileSync(join(repoRoot, contractPath), contract(packagePlan));
      const report = executeVerificationContract({
        repoRoot,
        contractPath,
        env: { ...process.env, PACKAGE_COUNTER: counterPath },
      });
      expect(report.status).toBe("passed");
      expect(report.results[0]!.kind).toBe("package_test");
      expect(report.results[0]!.command).toContain("run --cwd . test -- tests/pass.test.ts");
      expect(readFileSync(counterPath, "utf8")).toBe("owner\n");
    });
  }, 30_000);

  test("command execution ignores shell profiles and strips harness-internal environment", () => {
    withRepo("verification-clean-command-env", (repoRoot, contractPath) => {
      const cleanPlan = {
        protocol: 1,
        checks: [commandCheck({
          command: "test -z \"${BASH_ENV:-}\" && test -z \"${REPO_HARNESS_SENTINEL:-}\"",
          cost: "normal",
          inputs: { env: [] },
        })],
      };
      writeFileSync(join(repoRoot, contractPath), contract(cleanPlan));
      const report = executeVerificationContract({
        repoRoot,
        contractPath,
        env: { ...process.env, BASH_ENV: "/does/not/exist", REPO_HARNESS_SENTINEL: "polluted" },
      });
      expect(report.status).toBe("passed");
      expect(report.results[0]!.command).toContain("--noprofile --norc -c");
    });
  }, 30_000);

  test("executes an expensive check once, reuses exact success, and evaluate never spawns", () => {
    withRepo("verification-reuse", (repoRoot, contractPath, counterPath) => {
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const first = executeVerificationContract({ repoRoot, contractPath, env });
      expect(first.status).toBe("passed");
      expect(first.results[0]!.execution).toBe("executed");
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);

      const second = executeVerificationContract({ repoRoot, contractPath, env });
      expect(second.status).toBe("passed");
      expect(second.results[0]!.execution).toBe("reused");
      const evaluated = evaluateVerificationContract({ repoRoot, contractPath, env });
      expect(evaluated.status).toBe("passed");
      expect(evaluated.results[0]!.execution).toBe("reused");
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);

      git(repoRoot, "commit", "--allow-empty", "-q", "-m", "moving head with identical tree");
      const afterEmptyCommit = executeVerificationContract({ repoRoot, contractPath, env });
      expect(afterEmptyCommit.status).toBe("passed");
      expect(afterEmptyCommit.results[0]!.execution).toBe("reused");
      expect(afterEmptyCommit.target.head_commit).not.toBe(first.target.head_commit);
      expect(afterEmptyCommit.target.snapshot_hash).toBe(first.target.snapshot_hash);
      expect(validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report: afterEmptyCommit, env }).valid).toBe(true);
    });
  }, 30_000);

  test("a successful command that changes the verified tree never becomes reusable exact evidence", () => {
    withRepo("verification-mutating-success", (repoRoot, contractPath) => {
      const mutatingPlan = {
        protocol: 1,
        checks: [commandCheck({
          command: "printf 'mutated\\n' > source.txt",
          cost: "normal",
          inputs: { env: [] },
        })],
      };
      writeFileSync(join(repoRoot, contractPath), contract(mutatingPlan));
      git(repoRoot, "add", contractPath);
      git(repoRoot, "commit", "-q", "-m", "use mutating verification command");

      const execution = executeVerificationContract({ repoRoot, contractPath });
      expect(execution.status).toBe("needs_verification_plan");
      expect(execution.passed).toBe(false);
      expect(execution.results[0]!.exit_code).toBe(0);
      expect(execution.results[0]!.passed).toBe(false);
      expect(execution.results[0]!.message).toContain("repository snapshot changed during execution");

      writeFileSync(join(repoRoot, "source.txt"), "source\n");
      const restored = evaluateVerificationContract({ repoRoot, contractPath });
      expect(restored.status).toBe("missing");
      expect(restored.results[0]!.execution).toBe("missing");
    });
  }, 30_000);

  test("a successful command may move HEAD when the verified tree is unchanged", () => {
    withRepo("verification-head-move", (repoRoot, contractPath) => {
      const headMovingPlan = {
        protocol: 1,
        checks: [commandCheck({
          command: "git commit --allow-empty -q -m verification-head-move",
          cost: "normal",
          inputs: { env: [] },
        })],
      };
      writeFileSync(join(repoRoot, contractPath), contract(headMovingPlan));
      git(repoRoot, "add", contractPath);
      git(repoRoot, "commit", "-q", "-m", "use head-moving verification command");
      const before = git(repoRoot, "rev-parse", "HEAD");

      const execution = executeVerificationContract({ repoRoot, contractPath });
      expect(execution.status).toBe("passed");
      expect(execution.results[0]!.passed).toBe(true);
      expect(git(repoRoot, "rev-parse", "HEAD")).not.toBe(before);
    });
  }, 30_000);

  test("an explicit force reason reruns an otherwise exact reusable execution and remains auditable", () => {
    withRepo("verification-force-exact", (repoRoot, contractPath, counterPath) => {
      const env = { ...process.env, COUNTER_PATH: counterPath };
      expect(executeVerificationContract({ repoRoot, contractPath, env }).status).toBe("passed");
      const forced = executeVerificationContract({
        repoRoot,
        contractPath,
        env,
        forceReason: "operator requested independent rerun",
      });
      expect(forced.status).toBe("passed");
      expect(forced.results[0]!.execution).toBe("executed");
      expect(forced.results[0]!.force_reason).toBe("operator requested independent rerun");
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(2);
      expect(validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report: forced, env }).valid).toBe(true);
    });
  }, 30_000);

  test("the latest same-key failure supersedes an older pass and a normal check reruns", () => {
    withRepo("verification-latest-failure", (repoRoot, contractPath, counterPath) => {
      const failureMarker = `${counterPath}.fail`;
      try {
        writeFileSync(join(repoRoot, contractPath), contract({
          protocol: 1,
          checks: [commandCheck({
            id: LONG_CHECK_ID,
            command: "if [[ -e \"$COUNTER_PATH.fail\" ]]; then exit 7; fi; printf 'x\\n' >> \"$COUNTER_PATH\"",
            cost: "normal",
          })],
        }));
        const env = { ...process.env, COUNTER_PATH: counterPath };
        expect(executeVerificationContract({ repoRoot, contractPath, env }).status).toBe("passed");
        writeFileSync(failureMarker, "fail\n");
        const forcedFailure = executeVerificationContract({
          repoRoot,
          contractPath,
          env,
          forceReason: "prove latest failure supersedes the pass",
        });
        expect(forcedFailure.status).toBe("failed");
        expect(forcedFailure.results[0]!.exit_code).toBe(7);
        expect(evaluateVerificationContract({ repoRoot, contractPath, env }).status).toBe("missing");

        const ordinary = executeVerificationContract({ repoRoot, contractPath, env });
        expect(ordinary.status).toBe("failed");
        expect(ordinary.results[0]!.execution).toBe("executed");
        expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);
      } finally {
        rmSync(failureMarker, { force: true });
      }
    });
  }, 30_000);

  test("the latest same-key timeout blocks old-pass reuse and explicit baseline masking", () => {
    withRepo("verification-latest-timeout", (repoRoot, contractPath, counterPath) => {
      const slowMarker = `${counterPath}.slow`;
      try {
        const conditional = commandCheck({
          command: "if [[ -e \"$COUNTER_PATH.slow\" ]]; then sleep 2; fi; printf 'x\\n' >> \"$COUNTER_PATH\"",
        });
        writeFileSync(join(repoRoot, contractPath), contract({ protocol: 1, checks: [conditional] }));
        const env = { ...process.env, COUNTER_PATH: counterPath };
        const first = executeVerificationContract({ repoRoot, contractPath, env });
        expect(first.status).toBe("passed");
        writeFileSync(slowMarker, "slow\n");
        const forcedTimeout = executeVerificationContract({
          repoRoot,
          contractPath,
          env,
          forceReason: "prove latest timeout supersedes the pass",
          timeoutMs: 20,
        });
        expect(forcedTimeout.status).toBe("failed");
        expect(forcedTimeout.results[0]!.timed_out).toBe(true);
        expect(evaluateVerificationContract({ repoRoot, contractPath, env }).status).toBe("missing");

        const ordinary = executeVerificationContract({ repoRoot, contractPath, env });
        expect(ordinary.status).toBe("needs_verification_plan");
        expect(ordinary.results[0]!.execution).toBe("missing");
        expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);

        const firstResult = first.results[0]!;
        const delta = commandCheck({ id: "delta", command: "true", cost: "normal", inputs: { env: [] } });
        const baseline = {
          ...conditional,
          evidence_policy: "baseline_with_delta",
          baseline: { run_file: firstResult.run_file, execution_id: firstResult.execution_id },
          delta_checks: ["delta"],
        };
        writeFileSync(join(repoRoot, contractPath), contract({ protocol: 1, checks: [delta, baseline] }, "baseline after timeout"));
        const baselineReport = executeVerificationContract({ repoRoot, contractPath, env });
        expect(baselineReport.status).toBe("missing");
        expect(baselineReport.results.find((result) => result.id === "full")?.passed).toBe(false);
        expect(baselineReport.results.find((result) => result.id === "full")?.message).toContain("newer execution failed");
      } finally {
        rmSync(slowMarker, { force: true });
      }
    });
  }, 30_000);

  test("a missing latest same-key run record cannot revive an older pass", () => {
    withRepo("verification-latest-record-missing", (repoRoot, contractPath, counterPath) => {
      writeFileSync(join(repoRoot, contractPath), contract({
        protocol: 1,
        checks: [commandCheck({ id: LONG_CHECK_ID })],
      }));
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const first = executeVerificationContract({ repoRoot, contractPath, env });
      const latest = executeVerificationContract({
        repoRoot,
        contractPath,
        env,
        forceReason: "create a newer same-key execution",
      });
      expect(first.status).toBe("passed");
      expect(latest.status).toBe("passed");
      rmSync(join(repoRoot, latest.results[0]!.run_file!), { force: true });
      expect(evaluateVerificationContract({ repoRoot, contractPath, env }).status).toBe("missing");

      const firstResult = first.results[0]!;
      const delta = commandCheck({ id: "delta", command: "true", cost: "normal", inputs: { env: [] } });
      const baseline = commandCheck({
        id: LONG_CHECK_ID,
        evidence_policy: "baseline_with_delta",
        baseline: { run_file: firstResult.run_file, execution_id: firstResult.execution_id },
        delta_checks: ["delta"],
      });
      writeFileSync(join(repoRoot, contractPath), contract({ protocol: 1, checks: [delta, baseline] }, "baseline after missing record"));
      const baselineReport = executeVerificationContract({ repoRoot, contractPath, env });
      expect(baselineReport.status).toBe("missing");
      expect(baselineReport.results.find((result) => result.id === LONG_CHECK_ID)?.message).toContain("newer execution failed or is invalid");
    });
  }, 30_000);

  test("validates immutable report evidence after the workspace moves and rejects a forged pass", () => {
    withRepo("verification-report-validation", (repoRoot, contractPath, counterPath) => {
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const report = executeVerificationContract({ repoRoot, contractPath, env });
      expect(validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report, env }).valid).toBe(true);
      writeFileSync(join(repoRoot, "source.txt"), "workspace moved after execution\n");
      expect(validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report, env }).valid).toBe(true);

      const forged = {
        ...report,
        results: report.results.map((result) => ({ ...result, duration_ms: result.duration_ms + 1 })),
      };
      expect(() => validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report: forged, env }))
        .toThrow("not backed by immutable evidence");
      const invented = {
        ...report,
        results: report.results.map((result) => ({ ...result, execution_id: "vx-invented" })),
      };
      expect(() => validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report: invented, env }))
        .toThrow("not backed by immutable evidence");
    });
  }, 30_000);

  test("validates the writer-projected report when ledger redaction replaces an embedded git SHA", () => {
    withRepo("verification-redacted-command", (repoRoot, contractPath) => {
      const revision = "6a502de647c6ec3aac33b2afc6bb59970e0c67a1";
      writeFileSync(join(repoRoot, contractPath), contract({
        protocol: 1,
        checks: [commandCheck({
          command: `REPO_HARNESS_DIFF_BASE=${revision} true`,
          cost: "normal",
          inputs: { env: [] },
        })],
      }));
      const report = executeVerificationContract({ repoRoot, contractPath });
      expect(() => validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report }))
        .toThrow("not backed by immutable evidence");
      const projected = projectReportThroughEvidenceWriter(repoRoot, report);
      expect(report.results[0]!.command).toContain(revision);
      expect(projected.results[0]!.command).not.toContain(revision);
      expect(projected.results[0]!.command).toContain("sha256:");
      expect(validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report: projected }).valid).toBe(true);
      const tampered = {
        ...projected,
        results: projected.results.map((result) => ({ ...result, command: `${result.command} --tampered` })),
      };
      expect(() => validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report: tampered }))
        .toThrow("not backed by immutable evidence");
    });
  }, 30_000);

  test("binds a writer-projected long result id to the declared check", () => {
    withRepo("verification-redacted-id", (repoRoot, contractPath, counterPath) => {
      writeFileSync(join(repoRoot, contractPath), contract({
        protocol: 1,
        checks: [commandCheck({ id: LONG_CHECK_ID, cost: "normal" })],
      }));
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const report = executeVerificationContract({ repoRoot, contractPath, env });
      const projected = projectReportThroughEvidenceWriter(repoRoot, report);

      expect(projected.results[0]!.id).not.toBe(LONG_CHECK_ID);
      expect(validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report: projected, env }).valid).toBe(true);
      const tampered = {
        ...projected,
        results: projected.results.map((result) => ({ ...result, id: `${result.id}-tampered` })),
      };
      expect(() => validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report: tampered, env }))
        .toThrow("result id is unknown");
    });
  }, 30_000);

  test("validates a writer-projected baseline result and rejects a tampered projected target", () => {
    withRepo("verification-redacted-baseline", (repoRoot, contractPath, counterPath) => {
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const first = executeVerificationContract({ repoRoot, contractPath, env });
      const full = first.results[0]!;
      const revision = "6a502de647c6ec3aac33b2afc6bb59970e0c67a1";
      const delta = commandCheck({
        id: "delta",
        command: `REPO_HARNESS_DIFF_BASE=${revision} true`,
        cost: "normal",
        necessity: "covers the current delta",
        inputs: { env: [] },
      });
      const baseline = commandCheck({
        evidence_policy: "baseline_with_delta",
        baseline: { run_file: full.run_file, execution_id: full.execution_id },
        delta_checks: ["delta"],
      });
      writeFileSync(join(repoRoot, contractPath), contract({ protocol: 1, checks: [delta, baseline] }, "writer baseline"));

      const report = executeVerificationContract({ repoRoot, contractPath, env });
      expect(report.status).toBe("passed");
      const projected = projectReportThroughEvidenceWriter(repoRoot, report);
      const projectedBaseline = projected.results.find((result) => result.id === "full")!;
      const projectedDelta = projected.results.find((result) => result.id === "delta")!;
      expect(projectedBaseline.target).not.toBe("historical_baseline_with_current_delta");
      expect(projectedDelta.command).not.toContain(revision);
      expect(validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report: projected, env }).valid).toBe(true);

      const tampered = {
        ...projected,
        results: projected.results.map((result) => result.id === "full"
          ? { ...result, target: `${result.target}-tampered` }
          : result),
      };
      expect(() => validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, report: tampered, env }))
        .toThrow("baseline result was altered");
    });
  }, 30_000);

  test("validates an archived report from caller-verified contract content after the declared path retires", () => {
    withRepo("verification-archived-report", (repoRoot, contractPath, counterPath) => {
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const contractText = readFileSync(join(repoRoot, contractPath), "utf8");
      const report = executeVerificationContract({ repoRoot, contractPath, env });
      rmSync(join(repoRoot, contractPath));
      expect(validateMaterializedVerificationExecutionReport({ repoRoot, contractPath, contractText, report, env }).valid).toBe(true);
      const archivedHeader = contractText.replace("# Task Contract: fixture", "# Task Contract: archived-fixture");
      expect(validateMaterializedVerificationExecutionReport({
        repoRoot,
        contractPath,
        contractText: archivedHeader,
        report,
        env: { ...env, COUNTER_PATH: `${counterPath}-changed-after-run` },
      }).valid).toBe(true);
      expect(() => validateMaterializedVerificationExecutionReport({
        repoRoot,
        contractPath,
        contractText: contractText.replace("fixture expensive command", "forged rationale"),
        report,
        env,
      })).toThrow("plan hash");
    });
  }, 30_000);

  test("prose or source drift does not automatically rerun a previously executed expensive check", () => {
    withRepo("verification-drift", (repoRoot, contractPath, counterPath) => {
      const env = { ...process.env, COUNTER_PATH: counterPath };
      expect(executeVerificationContract({ repoRoot, contractPath, env }).status).toBe("passed");
      const plan = { protocol: 1, checks: [commandCheck()] };
      writeFileSync(join(repoRoot, contractPath), contract(plan, "changed prose"));
      const drifted = executeVerificationContract({ repoRoot, contractPath, env });
      expect(drifted.status).toBe("needs_verification_plan");
      expect(drifted.results[0]!.execution).toBe("missing");
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);

      writeFileSync(join(repoRoot, contractPath), contract({
        protocol: 1,
        checks: [commandCheck({ necessity: "reworded plan rationale only" })],
      }, "changed prose"));
      const planProseDrift = executeVerificationContract({ repoRoot, contractPath, env });
      expect(planProseDrift.status).toBe("needs_verification_plan");
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);

      const forced = executeVerificationContract({
        repoRoot,
        contractPath,
        env,
        forceReason: "operator approved rerun after scope review",
      });
      expect(forced.status).toBe("passed");
      expect(forced.results[0]!.force_reason).toBe("operator approved rerun after scope review");
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(2);
    });
  }, 30_000);

  test("tool binary identity changes the cache key even when its reported version is unchanged", () => {
    withRepo("verification-toolchain-path", (repoRoot, contractPath, counterPath) => {
      const firstBash = `${counterPath}-bash-one`;
      const secondBash = `${counterPath}-bash-two`;
      const brokenBash = `${counterPath}-bash-broken`;
      try {
        for (const path of [firstBash, secondBash]) {
          writeFileSync(path, '#!/bin/sh\nexec /bin/bash "$@"\n');
          chmodSync(path, 0o755);
        }
        writeFileSync(brokenBash, "#!/bin/sh\nexit 9\n");
        chmodSync(brokenBash, 0o755);
        const firstEnv = { ...process.env, COUNTER_PATH: counterPath, REPO_HARNESS_BASH_BIN: firstBash };
        const first = executeVerificationContract({ repoRoot, contractPath, env: firstEnv });
        expect(first.status).toBe("passed");
        const drifted = executeVerificationContract({
          repoRoot,
          contractPath,
          env: { ...firstEnv, REPO_HARNESS_BASH_BIN: secondBash },
        });
        expect(drifted.status).toBe("needs_verification_plan");
        expect(drifted.results[0]!.execution).toBe("missing");
        expect(drifted.results[0]!.cache_key).not.toBe(first.results[0]!.cache_key);
        expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);
        expect(() => evaluateVerificationContract({
          repoRoot,
          contractPath,
          env: { ...firstEnv, REPO_HARNESS_BASH_BIN: brokenBash },
        })).toThrow("toolchain version probe failed");
      } finally {
        rmSync(firstBash, { force: true });
        rmSync(secondBash, { force: true });
        rmSync(brokenBash, { force: true });
      }
    });
  }, 30_000);

  test("baseline evidence is historical and only passes with explicit current exact delta", () => {
    withRepo("verification-baseline", (repoRoot, contractPath, counterPath) => {
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const first = executeVerificationContract({ repoRoot, contractPath, env });
      const full = first.results[0]!;
      expect(full.run_file).toBeString();
      expect(full.execution_id).toBeString();

      const delta = commandCheck({
        id: "delta",
        command: "true",
        cost: "normal",
        necessity: "covers the current delta",
        inputs: { env: [] },
      });
      const baseline = commandCheck({
        evidence_policy: "baseline_with_delta",
        baseline: { run_file: full.run_file, execution_id: full.execution_id },
        delta_checks: ["delta"],
      });
      writeFileSync(join(repoRoot, contractPath), contract({ protocol: 1, checks: [delta, baseline] }, "new scope"));

      const report = executeVerificationContract({ repoRoot, contractPath, env });
      expect(report.status).toBe("passed");
      expect(report.results.find((result) => result.id === "full")?.execution).toBe("baseline");
      expect(report.results.find((result) => result.id === "full")?.target).toBe("historical_baseline_with_current_delta");
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);

      const unrelatedBaseline = commandCheck({
        command: "echo unrelated",
        evidence_policy: "baseline_with_delta",
        baseline: { run_file: full.run_file, execution_id: full.execution_id },
        delta_checks: ["delta"],
      });
      writeFileSync(join(repoRoot, contractPath), contract({ protocol: 1, checks: [delta, unrelatedBaseline] }, "unrelated baseline"));
      const rejected = executeVerificationContract({ repoRoot, contractPath, env });
      expect(rejected.status).toBe("missing");
      expect(rejected.results.find((result) => result.id === "full")?.message).toContain("missing, failed, forged, or stale");
    });
  }, 30_000);

  test("evaluates a historical baseline with a reusable long-id delta", () => {
    withRepo("verification-baseline-long-delta", (repoRoot, contractPath, counterPath) => {
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const first = executeVerificationContract({ repoRoot, contractPath, env });
      const full = first.results[0]!;
      const delta = commandCheck({
        id: LONG_CHECK_ID,
        command: "true",
        cost: "normal",
        inputs: { env: [] },
      });
      const baseline = commandCheck({
        evidence_policy: "baseline_with_delta",
        baseline: { run_file: full.run_file, execution_id: full.execution_id },
        delta_checks: [LONG_CHECK_ID],
      });
      writeFileSync(join(repoRoot, contractPath), contract({ protocol: 1, checks: [delta, baseline] }, "long id delta"));

      expect(executeVerificationContract({ repoRoot, contractPath, env }).status).toBe("passed");
      const evaluated = evaluateVerificationContract({ repoRoot, contractPath, env });
      expect(evaluated.status).toBe("passed");
      expect(evaluated.results.find((result) => result.id === LONG_CHECK_ID)?.execution).toBe("reused");
      expect(evaluated.results.find((result) => result.id === "full")?.execution).toBe("baseline");
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);
    });
  }, 30_000);

  test("a successful execution from another contract cannot satisfy a baseline reference", () => {
    withRepo("verification-cross-contract", (repoRoot, contractPath, counterPath) => {
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const otherPath = "tasks/contracts/other.contract.md";
      writeFileSync(join(repoRoot, otherPath), contract({ protocol: 1, checks: [commandCheck()] }, "other"));
      const other = executeVerificationContract({ repoRoot, contractPath: otherPath, env });
      expect(other.status).toBe("passed");
      const execution = other.results[0]!;
      const delta = commandCheck({ id: "delta", command: "true", cost: "normal", inputs: { env: [] } });
      const baseline = commandCheck({
        evidence_policy: "baseline_with_delta",
        baseline: { run_file: execution.run_file, execution_id: execution.execution_id },
        delta_checks: ["delta"],
      });
      writeFileSync(join(repoRoot, contractPath), contract({ protocol: 1, checks: [delta, baseline] }));
      const report = executeVerificationContract({ repoRoot, contractPath, env });
      expect(report.status).toBe("missing");
      expect(report.results.find((result) => result.id === "full")?.passed).toBe(false);
    });
  }, 30_000);

  test("failed and timed-out executions never become reusable passes", () => {
    withRepo("verification-failure", (repoRoot, contractPath, counterPath) => {
      const failing = { protocol: 1, checks: [commandCheck({ command: "exit 7", cost: "normal", inputs: { env: [] } })] };
      writeFileSync(join(repoRoot, contractPath), contract(failing));
      const failed = executeVerificationContract({ repoRoot, contractPath });
      expect(failed.status).toBe("failed");
      expect(failed.results[0]!.exit_code).toBe(7);
      expect(failed.results[0]!.failure_log_file).toBeString();
      expect(existsSync(join(repoRoot, failed.results[0]!.failure_log_file!))).toBe(true);
      expect(evaluateVerificationContract({ repoRoot, contractPath }).status).toBe("missing");

      const timed = { protocol: 1, checks: [commandCheck({ command: "sleep 2", cost: "normal", inputs: { env: [] } })] };
      writeFileSync(join(repoRoot, contractPath), contract(timed));
      const timeout = executeVerificationContract({ repoRoot, contractPath, timeoutMs: 20 });
      expect(timeout.status).toBe("failed");
      expect(timeout.results[0]!.timed_out).toBe(true);
      expect(timeout.results[0]!.failure_log_file).toBeString();
      expect(evaluateVerificationContract({ repoRoot, contractPath }).status).toBe("missing");
      expect(counterPath).toBeString();
    });
  }, 30_000);

  test("retains redacted stdout and stderr only for failed executions", () => {
    withRepo("verification-failure-log", (repoRoot, contractPath) => {
      const plan = {
        protocol: 1,
        checks: [commandCheck({
          command: "printf 'stdout-marker:%s\\n' \"$OPENAI_API_KEY\"; i=0; while (( i < 70000 )); do printf x; ((i += 1)); done; printf '\\ntail-marker\\n'; printf 'stderr-marker\\n' >&2; exit 4",
          cost: "normal",
          inputs: { env: ["OPENAI_API_KEY"] },
        })],
      };
      writeFileSync(join(repoRoot, contractPath), contract(plan));
      const report = executeVerificationContract({
        repoRoot,
        contractPath,
        env: { ...process.env, OPENAI_API_KEY: "super-secret-test-value" },
      });
      const result = report.results[0]!;
      expect(result.failure_log_file).toBeString();
      const diagnostics = readFileSync(join(repoRoot, result.failure_log_file!), "utf8");
      expect(diagnostics).toContain("stdout-marker");
      expect(diagnostics).toContain("tail-marker");
      expect(diagnostics).toContain("stderr-marker");
      expect(diagnostics).not.toContain("super-secret-test-value");
      expect(result.message).toContain("check exited 4; diagnostics:");
      expect(result.message).not.toContain("tail-marker");

      writeFileSync(join(repoRoot, contractPath), contract({
        protocol: 1,
        checks: [commandCheck({ command: "true", cost: "normal", inputs: { env: [] } })],
      }));
      const success = executeVerificationContract({ repoRoot, contractPath });
      expect(success.results[0]!.failure_log_file).toBeNull();
    });
  }, 30_000);

  test("a failed preflight prevents every later expensive command from starting", () => {
    withRepo("verification-preflight", (repoRoot, contractPath, counterPath) => {
      const plan = {
        protocol: 1,
        checks: [
          commandCheck({
            id: "preflight",
            command: "exit 9",
            phase: "preflight",
            cost: "normal",
            inputs: { env: [] },
          }),
          commandCheck(),
        ],
      };
      writeFileSync(join(repoRoot, contractPath), contract(plan));
      const report = executeVerificationContract({
        repoRoot,
        contractPath,
        env: { ...process.env, COUNTER_PATH: counterPath },
      });
      expect(report.status).toBe("failed");
      expect(report.results.find((result) => result.id === "full")?.execution).toBe("missing");
      expect(existsSync(counterPath)).toBe(false);
    });
  }, 30_000);

  test("a missing baseline preflight prevents later expensive verification from starting", () => {
    withRepo("verification-baseline-preflight", (repoRoot, contractPath, counterPath) => {
      const plan = {
        protocol: 1,
        checks: [
          commandCheck({
            id: "preflight-delta",
            command: "true",
            phase: "preflight",
            cost: "normal",
            inputs: { env: [] },
          }),
          commandCheck({
            id: "historical-preflight",
            command: "true",
            phase: "preflight",
            cost: "normal",
            evidence_policy: "baseline_with_delta",
            baseline: {
              run_file: ".ai/harness/runs/verification-vx-missing.json",
              execution_id: "vx-missing",
            },
            delta_checks: ["preflight-delta"],
            inputs: { env: [] },
          }),
          commandCheck(),
        ],
      };
      writeFileSync(join(repoRoot, contractPath), contract(plan));
      const report = executeVerificationContract({
        repoRoot,
        contractPath,
        env: { ...process.env, COUNTER_PATH: counterPath },
      });
      expect(report.results.find((result) => result.id === "historical-preflight")?.passed).toBe(false);
      expect(report.results.find((result) => result.id === "full")?.execution).toBe("missing");
      expect(existsSync(counterPath)).toBe(false);
    });
  }, 30_000);

  test("two identical concurrent requests start the expensive command once", async () => {
    const fixture = setupRepo("verification-concurrent");
    try {
      const { root: repoRoot, contractPath, counterPath } = fixture;
      const slowPlan = {
        protocol: 1,
        checks: [commandCheck({
          command: "printf 'x\\n' >> \"$COUNTER_PATH\"; attempts=0; while [ ! -f \"$COUNTER_PATH.release\" ]; do attempts=$((attempts + 1)); [ \"$attempts\" -lt 1000 ] || exit 1; sleep 0.01; done",
        })],
      };
      writeFileSync(join(repoRoot, contractPath), contract(slowPlan));
      const env = { ...process.env, COUNTER_PATH: counterPath };
      const first = spawn("bun", [CLI, "execute", "--repo", repoRoot, "--contract", contractPath], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const completed = new Promise<number | null>((resolvePromise, rejectPromise) => {
        first.once("error", rejectPromise);
        first.once("close", resolvePromise);
      });
      try {
        const started = Date.now();
        while (!existsSync(counterPath) && Date.now() - started < 5_000) await Bun.sleep(10);
        expect(existsSync(counterPath)).toBe(true);
        // Keep the first request admitted until the second has observed its lock.
        const second = spawnSync("bun", [CLI, "execute", "--repo", repoRoot, "--contract", contractPath], {
          encoding: "utf8",
          env,
        });
        expect(second.status).toBe(1);
        expect(JSON.parse(second.stdout).status).toBe("waiting");
      } finally {
        writeFileSync(`${counterPath}.release`, "release\n");
        expect(await completed).toBe(0);
      }
      expect(readFileSync(counterPath, "utf8").trim().split("\n")).toHaveLength(1);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
      rmSync(fixture.counterPath, { force: true });
      rmSync(`${fixture.counterPath}.release`, { force: true });
    }
  }, 30_000);
});
