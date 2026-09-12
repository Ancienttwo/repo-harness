import { expect } from "bun:test";
import { spawnSync } from "child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { commitAll, initGitRepo, run, sandboxEnv } from "./repo-fixture";

export const ROOT = join(import.meta.dir, "../..");
export const HELPER_DIR = join(ROOT, "assets/templates/helpers");
export const TEMPLATE_DIR = join(ROOT, "assets/templates");
export const ASSETS_HOOKS_DIR = join(ROOT, "assets/hooks");

// The repository resolver imports the canonical core. Its packaged projection
// is intentionally standalone and is source-hash/drift checked separately.
export const INTENTIONALLY_DIVERGENT = ["capability-resolver.ts", "recovery-view-cli.ts"];

export function copyHelpers(cwd: string) {
  // Source CLI imports this package-owned template during readiness checks.
  mkdirSync(join(cwd, "assets/templates"), { recursive: true });
  copyFileSync(join(TEMPLATE_DIR, "runtime.gitignore"), join(cwd, "assets/templates/runtime.gitignore"));
  if (!existsSync(join(cwd, "node_modules"))) {
    symlinkSync(join(ROOT, "node_modules"), join(cwd, "node_modules"), "dir");
  }
  const scriptsDir = join(cwd, "scripts");
  const harnessScriptsDir = join(cwd, ".ai", "harness", "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(harnessScriptsDir, { recursive: true });
  mkdirSync(join(cwd, ".ai", "harness"), { recursive: true });
  mkdirSync(join(cwd, ".ai", "harness", "triage"), { recursive: true });
  mkdirSync(join(cwd, "docs", "architecture"), { recursive: true });
  mkdirSync(join(cwd, "src"), { recursive: true });
  if (!existsSync(join(cwd, "src", "effects"))) {
    symlinkSync(join(ROOT, "src", "effects"), join(cwd, "src", "effects"), "dir");
  }
  if (!existsSync(join(cwd, "src", "core"))) {
    symlinkSync(join(ROOT, "src", "core"), join(cwd, "src", "core"), "dir");
  }

  for (const file of readdirSync(HELPER_DIR).filter((name) => name.endsWith(".sh") || name.endsWith(".ts"))) {
    copyFileSync(join(HELPER_DIR, file), join(scriptsDir, file));
    copyFileSync(join(HELPER_DIR, file), join(harnessScriptsDir, file));
  }
  copyFileSync(join(ROOT, "assets/workflow-contract.v1.json"), join(cwd, ".ai/harness/workflow-contract.json"));
  writeFileSync(join(cwd, ".ai", "harness", "triage", ".gitkeep"), "");
  if (!existsSync(join(cwd, "docs/architecture/index.md"))) {
    writeFileSync(
      join(cwd, "docs/architecture/index.md"),
      [
        "# Architecture Index",
        "",
        "## Pending Requests",
        "",
        "<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->",
        "- (none)",
        "<!-- END ARCHITECTURE PENDING REQUESTS -->",
        "",
      ].join("\n")
    );
  }

  expect(run("bash", ["-lc", "chmod +x scripts/*.sh"], cwd).status).toBe(0);
  expect(run("bash", ["-lc", "chmod +x .ai/harness/scripts/*.sh"], cwd).status).toBe(0);
}

export function createTrustedMergeGateRuntime(path: string, authorityHome: string): string {
  cpSync(HELPER_DIR, path, { recursive: true });
  writeFileSync(
    join(path, "merge-gate.ts"),
    [
      `import { runMergeGateCli } from ${JSON.stringify(join(ROOT, "scripts/merge-gate.ts"))};`,
      `runMergeGateCli(process.argv.slice(2), ${JSON.stringify(authorityHome)});`,
      "",
    ].join("\n"),
  );
  return path;
}

export function installHooks(cwd: string) {
  const aiHooksDir = join(cwd, ".ai", "hooks");
  mkdirSync(aiHooksDir, { recursive: true });
  for (const f of readdirSync(ASSETS_HOOKS_DIR, { withFileTypes: true })) {
    const src = join(ASSETS_HOOKS_DIR, f.name);
    if (f.isDirectory()) {
      cpSync(src, join(aiHooksDir, f.name), { recursive: true });
    } else {
      copyFileSync(src, join(aiHooksDir, f.name));
    }
  }
  expect(run("bash", ["-lc", "find .ai/hooks -type f -name '*.sh' -exec chmod +x {} +"], cwd).status).toBe(0);
}

export function runHook(script: string, cwd: string, stdin: string, env?: NodeJS.ProcessEnv) {
  return spawnSync("bash", [join(cwd, ".ai", "hooks", script)], {
    cwd,
    input: stdin,
    encoding: "utf-8",
    env: sandboxEnv({
      REPO_HARNESS_CLI: join(ROOT, "src/cli/index.ts"),
      REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
      ...env,
    }),
  });
}

export function writeValidSprintChecks(cwd: string) {
  mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
  writeFileSync(
    join(cwd, ".ai/harness/checks/latest.json"),
    JSON.stringify(
      {
        status: "pass",
        source: "verify-sprint",
        command: "repo-harness run verify-sprint",
        exit_code: 0,
        generated_at: "2026-03-04T14:10:00+0000",
        contract: { file: "tasks/contracts/demo.contract.md", status: "pass", exit_code: 0 },
        review: { file: "tasks/reviews/demo.review.md", status: "pass" },
        benchmark_evidence: { status: "not_applicable", report_sha256: "", benchmark_subject_sha256: "" },
      },
      null,
      2
    ) + "\n"
  );
}

// EPC-05: checks/latest.json is now materialized from the evidence ledger
// (src/effects/evidence/checks-materializer.ts) rather than cp'd directly by
// verify-sprint.sh. These deployed-helper fixtures never reach that ledger
// (no git repo, no REPO_HARNESS_SOURCE_ROOT, and the ledger/materializer
// tooling is source-repo-only -- never copied into
// assets/templates/helpers/), so emission always cannot-binds (exit 3) and
// checks/latest.json is genuinely absent after these runs. The exact same
// rich content it used to receive via the deleted direct `cp` still lands,
// byte-for-byte, in the run snapshot file (`.ai/harness/runs/*.json`,
// unchanged by this package's cutover) -- these helpers read from there.
export function latestRunSnapshot(cwd: string): { path: string; content: any } {
  const runsDir = join(cwd, ".ai/harness/runs");
  const names = readdirSync(runsDir).filter((name) => name.endsWith(".json"));
  let best: { path: string; content: any; generatedAt: string } | null = null;
  for (const name of names) {
    const candidatePath = join(runsDir, name);
    const parsed = JSON.parse(readFileSync(candidatePath, "utf-8"));
    const generatedAt = String(parsed.generated_at ?? "");
    if (!best || generatedAt > best.generatedAt) {
      best = { path: candidatePath, content: parsed, generatedAt };
    }
  }
  if (!best) throw new Error(`no run snapshot found in ${runsDir}`);
  return { path: best.path, content: best.content };
}

export function runSnapshotById(cwd: string, runId: string, contractSlug: string): { path: string; content: any } {
  const path = join(cwd, ".ai/harness/runs", `${runId}-${contractSlug}.json`);
  return { path, content: JSON.parse(readFileSync(path, "utf-8")) };
}

export function expectChecksLatestAbsent(cwd: string): void {
  expect(existsSync(join(cwd, ".ai/harness/checks/latest.json"))).toBe(false);
}

export function writeFixtureCapabilityRegistry(cwd: string): void {
  mkdirSync(join(cwd, ".ai/context"), { recursive: true });
  writeFileSync(join(cwd, ".ai/context/capabilities.json"), JSON.stringify({
    version: 1,
    capabilities: [
      {
        id: "fixture-package",
        domain: "fixture",
        name: "package",
        prefixes: ["package.json"],
        contract_files: { agents: "AGENTS.md", claude: "CLAUDE.md" },
        architecture_module: "docs/architecture/modules/fixture/package.md",
        workstream_dir: "tasks/workstreams/fixture/package",
        lsp_profile: "typescript-lsp",
        verification_hints: ["fixture checks"],
      },
    ],
  }, null, 2) + "\n");
}

export function writeActivePlan(cwd: string, planPath: string) {
  mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
  writeFileSync(join(cwd, ".ai/harness/active-plan"), planPath);
  writeFileSync(join(cwd, ".ai/harness/active-worktree"), `${realpathSync(cwd)}\n`);
}

export function writeWorkflowRequiredSurface(cwd: string) {
  for (const dir of [
    ".ai/harness/triage",
    "deploy",
    "deploy/env",
    "deploy/scripts",
    "deploy/submissions",
    "deploy/runbooks",
    "deploy/release-checklists",
    "deploy/sql",
    "docs/reference-configs",
  ]) {
    mkdirSync(join(cwd, dir), { recursive: true });
  }
  writeFileSync(join(cwd, ".ai/context/capability-source-map.json"), "{}\n");
  for (const file of [
    "docs/reference-configs/harness-overview.md",
    "docs/reference-configs/agentic-development-flow.md",
    "docs/reference-configs/external-tooling.md",
    "docs/reference-configs/sprint-contracts.md",
    "docs/reference-configs/heartbeat-triage.md",
    "docs/reference-configs/handoff-protocol.md",
    "docs/reference-configs/document-generation.md",
    "docs/reference-configs/global-working-rules.md",
    "docs/reference-configs/minimal-change-hooks.md",
    "deploy/README.md",
  ]) {
    writeFileSync(join(cwd, file), "# Fixture\n");
  }
}

export function evidenceContract(): string {
  return [
    "## Evidence Contract",
    "",
    "- **State/progress path**: tasks/todos.md and tasks/notes/demo.notes.md",
    "- **Verification evidence**: .ai/harness/checks/latest.json and bun test",
    "- **Evaluator rubric**: Waza /check must recommend pass",
    "- **Stop condition**: stop on failing contract verification",
    "- **Rollback surface**: revert the plan branch and generated task files",
  ].join("\n");
}

export function promotionGate(): string {
  return [
    "> **Artifact Level**: work-package",
    "> **Promotion Reason**: worktree_boundary",
    "> **Verification Boundary**: bun test and contract verification",
    "> **Rollback Surface**: revert the demo branch and generated task files",
    "",
    "## Promotion Gate",
    "",
    "- **Merge/PR unit**: demo branch is the reviewed merge unit",
    "- **Rollback surface**: revert the demo branch and generated task files",
    "- **Verification boundary**: bun test and contract verification",
    "- **Review/acceptance boundary**: task review must recommend pass",
    "- **High-risk surface**: generated workflow artifacts and helper scripts",
    "- **Why not checklist row**: fixture exercises contract projection",
  ].join("\n");
}

export function currentReviewBinding(cwd: string): { subject: string; targetRevision: string } {
  if (run("git", ["rev-parse", "--is-inside-work-tree"], cwd).status !== 0) {
    initGitRepo(cwd);
    commitAll(cwd, "fixture review baseline");
  }
  const result = run("bun", [join(ROOT, "src/cli/hook-entry.ts"), "review-subject", "--target", "main", "--format", "json"], cwd);
  expect(result.status).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.status).toBe("ok");
  return { subject: parsed.review_subject_sha256, targetRevision: parsed.target_rev };
}

export function reviewSubjectMetadata(cwd: string): string {
  const binding = currentReviewBinding(cwd);
  return [
    "> **Review Rubric Version**: 2",
    `> **Reviewed Subject SHA256**: ${binding.subject}`,
    "> **Reviewed Subject Scope**: normalized-final-content",
    `> **Reviewed Target Revision**: ${binding.targetRevision}`,
  ].join("\n");
}

export function externalAcceptanceAdvice(reviewer = "Codex", source = "codex-review", cwd?: string): string {
  const binding = cwd ? currentReviewBinding(cwd) : null;
  return [
    "## External Acceptance Advice",
    "",
    "> **External Acceptance**: pass",
    `> **External Reviewer**: ${reviewer}`,
    `> **External Source**: ${source}`,
    "> **External Started**: 2026-03-04T14:05:00+0800",
    "> **External Completed**: 2026-03-04T14:06:00+0800",
    ...(binding ? [
      "> **Review Rubric Version**: 2",
      `> **Reviewed Subject SHA256**: ${binding.subject}`,
      "> **Reviewed Subject Scope**: normalized-final-content",
      `> **Reviewed Target Revision**: ${binding.targetRevision}`,
      "> **Benchmark Evidence SHA256**: not-applicable",
    ] : []),
    "",
    "- P1 blockers: none",
    "- P2 advisories: none",
    "- Acceptance checklist: pass",
  ].join("\n");
}

export function humanReviewCard(verdict = "pass", externalAcceptance = "pass"): string {
  return [
    "## Human Review Card",
    "",
    `- Verdict: ${verdict}`,
    "- Change type: code-change",
    "- Intended files changed: fixture",
    "- Actual files changed: fixture",
    "- Commands passed: fixture",
    "- Residual risks: (none)",
    "- Reviewer action required: approve fixture closeout",
    "- Rollback: revert fixture branch",
  ].join("\n");
}

export function installAutomaticProjectionVerifyFixture(
  cwd: string,
  options: { gatedTaskSync?: boolean } = {},
): string {
  for (const dir of [
    ".ai/hooks/lib",
    "bin",
    "plans",
    "tasks/contracts",
    "tasks/notes",
    "tasks/reviews",
    "docs/architecture/modules",
  ]) mkdirSync(join(cwd, dir), { recursive: true });
  copyHelpers(cwd);
  rmSync(join(cwd, "src"), { recursive: true, force: true });
  cpSync(join(ROOT, "src"), join(cwd, "src"), { recursive: true });
  copyFileSync(join(ROOT, "package.json"), join(cwd, "package.json"));
  copyFileSync(
    join(ROOT, "assets/hooks/lib/workflow-state.sh"),
    join(cwd, ".ai/hooks/lib/workflow-state.sh"),
  );
  if (options.gatedTaskSync) {
    writeFileSync(
      join(cwd, "scripts/check-task-sync.sh"),
      "#!/bin/bash\ntest -f .ai/harness/task-sync-ready\n",
    );
    chmodSync(join(cwd, "scripts/check-task-sync.sh"), 0o755);
  }
  writeFileSync(
    join(cwd, ".ai/harness/policy.json"),
    `${JSON.stringify({
      worktree_strategy: { review_base: "main" },
      architecture: { projection_provider: "archctx", projection_apply: "automatic" },
    }, null, 2)}\n`,
  );
  writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
  writeFileSync(
    join(cwd, "plans/plan-20260820-1605-projection-fixture.md"),
    [
      "# Plan: projection fixture",
      "",
      "> **Status**: Executing",
      "> **Task Contract**: `tasks/contracts/projection-fixture.contract.md`",
      "> **Task Review**: `tasks/reviews/projection-fixture.review.md`",
      "> **Implementation Notes**: `tasks/notes/projection-fixture.notes.md`",
      "",
    ].join("\n"),
  );
  writeActivePlan(cwd, "plans/plan-20260820-1605-projection-fixture.md");
  writeFileSync(
    join(cwd, "tasks/contracts/projection-fixture.contract.md"),
    [
      "# Task Contract: projection-fixture",
      "",
      "> **Status**: Active",
      "> **Task Profile**: code-change",
      "> **Review File**: `tasks/reviews/projection-fixture.review.md`",
      "> **Notes File**: `tasks/notes/projection-fixture.notes.md`",
      "",
      "```yaml",
      "allowed_paths:",
      "  - docs/spec.md",
      "  - plans/",
      "  - tasks/",
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
    ].join("\n"),
  );
  writeFileSync(join(cwd, "tasks/notes/projection-fixture.notes.md"), "# Implementation Notes\n");

  const fakeCli = join(cwd, "bin/repo-harness-fixture");
  writeFileSync(
    fakeCli,
    [
      "#!/bin/bash",
      "set -euo pipefail",
      '[[ "${1:-}" == "architecture-projection" ]] || exit 91',
      'case "${2:-}" in',
      "  status)",
      "    printf '%s\\n' '{\"apply\":{\"mode\":\"automatic\",\"enabled\":true}}'",
      "    ;;",
      "  apply)",
      "    mkdir -p docs/architecture/modules",
      "    printf '%s\\n' '{\"projection\":\"acceptance-owned\"}' > docs/architecture/.projection-manifest.json",
      '    if [[ "${PROJECTION_EXTRA_PATH:-0}" == "1" ]]; then',
      "      printf '%s\\n' '# unexpected generated module' > docs/architecture/modules/unexpected.md",
      "    fi",
      "    printf '%s\\n' '{\"status\":\"applied\"}'",
      "    ;;",
      "  *) exit 92 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(fakeCli, 0o755);

  initGitRepo(cwd);
  commitAll(cwd, "automatic projection fixture baseline");
  writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n\nChanged.\n");
  writeFileSync(
    join(cwd, "docs/architecture/.projection-manifest.json"),
    '{"projection":"acceptance-owned"}\n',
  );
  writeFileSync(
    join(cwd, "tasks/reviews/projection-fixture.review.md"),
    [
      "# Task Review: projection-fixture",
      "",
      "> **Recommendation**: pass",
      reviewSubjectMetadata(cwd),
      "",
      humanReviewCard(),
      "",
      externalAcceptanceAdvice("Codex", "codex-review", cwd),
      "",
    ].join("\n"),
  );
  rmSync(join(cwd, "docs/architecture/.projection-manifest.json"));
  return fakeCli;
}

export function verificationPlan(checks: unknown[]): string {
  return [
    "## Verification Plan",
    "",
    "```json",
    JSON.stringify({ protocol: 1, checks }, null, 2),
    "```",
    "",
  ].join("\n");
}

export function verificationCheck(
  id: string,
  command: string,
  phase: "preflight" | "verification",
  cost: "normal" | "expensive",
): Record<string, unknown> {
  return {
    id,
    kind: "command",
    command,
    cwd: ".",
    phase,
    cost,
    evidence_policy: "current_exact",
    necessity: `${id} is required by this fixture.`,
    inputs: { env: [] },
  };
}

export function replaceVerificationPlan(contract: string, checks: unknown[]): string {
  return contract.replace(verificationPlan([]), verificationPlan(checks));
}

export function commitVerificationFixture(cwd: string): void {
  initGitRepo(cwd);
  writeFileSync(
    join(cwd, ".git/info/exclude"),
    ".ai/harness/checks/\n.ai/harness/runs/\n.ai/harness/evidence/\n",
  );
  commitAll(cwd, "verification fixture");
}

export function installCanonicalContractTemplate(cwd: string): void {
  mkdirSync(join(cwd, ".claude/templates"), { recursive: true });
  copyFileSync(join(ROOT, ".claude/templates/contract.template.md"), join(cwd, ".claude/templates/contract.template.md"));
}

