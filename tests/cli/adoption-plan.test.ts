import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { basename, join } from "path";
import { planAdoption } from "../../src/core/adoption/plan";
import { adoptionTemplateFile } from "../../src/core/adoption/manifest-templates";
import { helperWrapperContent, helperWrapperGitignoreContent } from "../../src/core/adoption/helper-wrapper-plan";
import { renderAdoptionPlanJson, renderAdoptionPlanObject } from "../../src/core/adoption/render";
import { makeOperationId, type AdoptionOperation, type AdoptionPlan } from "../../src/core/adoption/operations";
import { summarizeOperations } from "../../src/core/adoption/summary";
import { gitignoreManagedBlockOperation } from "../../src/core/adoption/gitignore-plan";
import { renderManagedBlock, upsertManagedBlock } from "../../src/effects/managed-block";
import { ensureRepoRelativePath, resolveInsideRepo } from "../../src/effects/path-safety";
import { applyAdoptionPlan, applyAppendManagedBlockOperation } from "../../src/effects/fs-transaction";
import { readWorkflowContractAsset } from "../../src/core/adoption/workflow-contract-asset";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");
const FIXTURES = join(import.meta.dir, "..", "fixtures", "adoption");

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), "repo-harness-adoption-plan-"));
}

function readJson<T = Record<string, unknown>>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function snapshotOperation(operation: AdoptionOperation): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: operation.id,
    kind: operation.kind,
    status: operation.status,
  };
  if (operation.path) result.path = operation.path;
  if (operation.kind === "writeFile" && operation.ifMissing !== undefined) result.ifMissing = operation.ifMissing;
  if (operation.kind === "appendManagedBlock") result.marker = operation.marker;
  if (operation.kind === "runCheck") result.command = operation.command;
  return result;
}

function snapshotPlan(plan: AdoptionPlan): Record<string, unknown> {
  return {
    mode: plan.mode,
    apply: plan.apply,
    operations: plan.operations.map(snapshotOperation),
    summary: plan.summary,
    warnings: plan.warnings,
  };
}

describe("adoption operation model", () => {
  test("operation ids are stable and summarizeOperations counts by kind", () => {
    const operations: AdoptionOperation[] = [
      {
        id: makeOperationId("mkdir", "plans"),
        kind: "mkdir",
        path: "plans",
        reason: "test",
        risk: "low",
        status: "planned",
      },
      {
        id: makeOperationId("writeFile", "docs/spec.md", "ifMissing"),
        kind: "writeFile",
        path: "docs/spec.md",
        content: "# Spec\n",
        ifMissing: true,
        reason: "test",
        risk: "low",
        status: "planned",
      },
    ];

    expect(operations[0].id).toBe("mkdir:plans");
    expect(operations[1].id).toBe("writeFile:docs/spec.md:ifMissing");
    const summary = summarizeOperations(operations);
    expect(summary.byKind).toEqual({ mkdir: 1, writeFile: 1 });
    expect(summary.byStatus).toEqual({ planned: 2 });
    expect(summary.plannedTotal).toBe(2);
    expect(summary.skippedTotal).toBe(0);
  });
});

describe("planAdoption", () => {
  test("bootstrap templates come from the workflow contract", () => {
    const repo = tempRepo();
    try {
      const spec = adoptionTemplateFile(repo, "spec");
      const deferredGoalLedger = adoptionTemplateFile(repo, "deferredGoalLedger");
      const currentStatus = adoptionTemplateFile(repo, "currentStatus");
      const lessonsLog = adoptionTemplateFile(repo, "lessonsLog");

      expect(spec.path).toBe("docs/spec.md");
      expect(spec.content).toContain(`# Product Spec: ${basename(repo)}`);
      expect(deferredGoalLedger.path).toBe("tasks/todos.md");
      expect(deferredGoalLedger.content).toContain("# Deferred Goal Ledger");
      expect(currentStatus.path).toBe("tasks/current.md");
      expect(currentStatus.content).toContain("<!-- generated-by: repo-harness refresh-current-status v1 -->");
      expect(lessonsLog.path).toBe("tasks/lessons.md");
      expect(lessonsLog.content).toContain("Correction-derived rules");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("standard mode plans helper compatibility wrappers from the workflow contract", () => {
    const repo = tempRepo();
    try {
      const contract = readJson(join(ROOT, "assets", "workflow-contract.v1.json")) as {
        helpers: { scripts: string[] };
      };
      const plan = planAdoption({ repoRoot: repo, mode: "standard" });
      const wrappers = plan.operations.filter((operation) => operation.id.endsWith(":helper-wrapper"));
      const newPlanWrapper = plan.operations.find(
        (operation) => operation.id === "writeFile:scripts/new-plan.sh:helper-wrapper",
      );

      expect(wrappers).toHaveLength(contract.helpers.scripts.length);
      expect(newPlanWrapper?.kind).toBe("writeFile");
      if (newPlanWrapper?.kind === "writeFile") {
        expect(newPlanWrapper.ifMissing).toBe(true);
        expect(newPlanWrapper.mode).toBe(0o755);
        expect(newPlanWrapper.content).toContain("repo-harness run new-plan");
      }
      expect(helperWrapperContent("contract-run.ts")).toContain('["repo-harness", "run", "contract-run"]');
      expect(helperWrapperContent("contract-run.ts")).toContain("timeout: timeoutMs");
      expect(helperWrapperContent("contract-run.ts")).toContain("timed out after ${timeoutMs}ms");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("renders stable standard fixture for an empty repo", () => {
    const repo = tempRepo();
    try {
      const plan = planAdoption({ repoRoot: repo, mode: "standard", apply: false });
      expect(snapshotPlan(plan)).toEqual(readJson(join(FIXTURES, "empty-repo.expected.json")));
      expect(plan.operations.every((operation) => !operation.path?.startsWith(repo))).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("minimal and self-host modes have distinct operation counts", () => {
    const minimalRepo = tempRepo();
    const selfHostRepo = tempRepo();
    try {
      expect(snapshotPlan(planAdoption({ repoRoot: minimalRepo, mode: "minimal" }))).toEqual(
        readJson(join(FIXTURES, "minimal-repo.expected.json")),
      );
      expect(snapshotPlan(planAdoption({ repoRoot: selfHostRepo, mode: "self-host" }))).toEqual(
        readJson(join(FIXTURES, "self-host-repo.expected.json")),
      );
    } finally {
      rmSync(minimalRepo, { recursive: true, force: true });
      rmSync(selfHostRepo, { recursive: true, force: true });
    }
  });

  test("minimal mode still plans the workflow-contract opt-in marker", () => {
    const repo = tempRepo();
    try {
      const plan = planAdoption({ repoRoot: repo, mode: "minimal" });
      expect(plan.operations.find((operation) => operation.id === "writeFile:.ai/harness/workflow-contract.json:workflow-contract"))
        ?.toEqual(expect.objectContaining({ kind: "writeFile", path: ".ai/harness/workflow-contract.json" }));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("existing files are planned as skipped instead of overwritten", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, "docs"), { recursive: true });
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      mkdirSync(join(repo, "scripts"), { recursive: true });
      writeFileSync(join(repo, "docs", "spec.md"), "# User spec\n");
      writeFileSync(join(repo, "scripts", "new-plan.sh"), "#!/bin/bash\necho user-owned\n");
      writeFileSync(
        join(repo, ".ai", "harness", "workflow-contract.json"),
        readFileSync(join(ROOT, "assets", "workflow-contract.v1.json"), "utf-8"),
      );
      writeFileSync(
        join(repo, ".gitignore"),
        renderManagedBlock(gitignoreManagedBlockOperation("planned", helperWrapperGitignoreContent(repo, "standard"))) + "\n",
      );

      const plan = planAdoption({ repoRoot: repo, mode: "standard" });
      expect(plan.operations.find((operation) => operation.id === "writeFile:docs/spec.md:ifMissing")?.status).toBe(
        "skipped",
      );
      expect(
        plan.operations.find((operation) => operation.id === "writeFile:.ai/harness/workflow-contract.json:workflow-contract")
          ?.status,
      ).toBe("skipped");
      expect(plan.operations.find((operation) => operation.id === "writeFile:scripts/new-plan.sh:helper-wrapper")?.status).toBe(
        "skipped",
      );
      expect(
        plan.operations.find((operation) => operation.id === "appendManagedBlock:.gitignore:repo-harness-generated-runtime")
          ?.status,
      ).toBe("skipped");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("adds rollback metadata to every planned operation", () => {
    const repo = tempRepo();
    try {
      const plan = planAdoption({ repoRoot: repo, mode: "standard" });
      const mkdir = plan.operations.find((operation) => operation.id === "mkdir:plans");
      const spec = plan.operations.find((operation) => operation.id === "writeFile:docs/spec.md:ifMissing");
      const workflowContract = plan.operations.find(
        (operation) => operation.id === "writeFile:.ai/harness/workflow-contract.json:workflow-contract",
      );
      const gitignore = plan.operations.find(
        (operation) => operation.id === "appendManagedBlock:.gitignore:repo-harness-generated-runtime",
      );

      expect(plan.operations.every((operation) => operation.rollback)).toBe(true);
      expect(mkdir?.rollback).toEqual(
        expect.objectContaining({ strategy: "remove-empty-directory", paths: ["plans"], backup: "not-needed" }),
      );
      expect(spec?.rollback).toEqual(
        expect.objectContaining({ strategy: "delete-created-file", paths: ["docs/spec.md"], backup: "not-needed" }),
      );
      expect(workflowContract?.rollback).toEqual(
        expect.objectContaining({
          strategy: "restore-or-delete-file",
          paths: [".ai/harness/workflow-contract.json"],
          backup: "runtime-fs-transaction",
        }),
      );
      expect(gitignore?.rollback).toEqual(
        expect.objectContaining({
          strategy: "restore-or-delete-file",
          paths: [".gitignore"],
          backup: "runtime-fs-transaction",
        }),
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("adoption renderers", () => {
  test("JSON renderer redacts file content with hash and preview", () => {
    const repo = tempRepo();
    try {
      const plan = planAdoption({ repoRoot: repo, mode: "minimal" });
      const rendered = renderAdoptionPlanObject(plan);
      const writeFile = (rendered.operations as Record<string, unknown>[]).find(
        (operation) => operation.kind === "writeFile",
      );

      expect(writeFile?.content).toBeUndefined();
      expect(String(writeFile?.contentHash).startsWith("sha256:")).toBe(true);
      expect(String(writeFile?.contentPreview)).toContain("# Product Spec:");
      expect(writeFile?.rollback).toEqual(
        expect.objectContaining({ strategy: "delete-created-file", paths: ["docs/spec.md"] }),
      );
      expect(JSON.parse(renderAdoptionPlanJson(plan)).protocol).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("safe adoption applicator subset", () => {
  test("path safety rejects absolute paths and traversal", () => {
    expect(ensureRepoRelativePath("../evil").ok).toBe(false);
    expect(ensureRepoRelativePath("/tmp/evil").ok).toBe(false);
    expect(resolveInsideRepo("/tmp/repo", "../evil").ok).toBe(false);
    expect(resolveInsideRepo("/tmp/repo", "docs/spec.md").ok).toBe(true);
  });

  test("managed block insertion, replacement, and idempotency preserve user content", () => {
    const operation = gitignoreManagedBlockOperation("planned");
    const userContent = "# User rules\ncustom.log\n";
    const inserted = upsertManagedBlock(userContent, operation);
    expect(inserted.ok).toBe(true);
    expect(inserted.changed).toBe(true);
    expect(inserted.content).toContain("custom.log");
    expect(inserted.content).toContain("# BEGIN: repo-harness generated-runtime");

    const repeated = upsertManagedBlock(inserted.content ?? "", operation);
    expect(repeated.ok).toBe(true);
    expect(repeated.changed).toBe(false);

    const oldBlock = [
      "# User rules",
      "# BEGIN: repo-harness generated-runtime",
      "old-entry/",
      "# END: repo-harness generated-runtime",
      "",
    ].join("\n");
    const replaced = upsertManagedBlock(oldBlock, operation);
    expect(replaced.ok).toBe(true);
    expect(replaced.content).not.toContain("old-entry/");
    expect(replaced.content).toContain("_ops/");
  });

  test("managed block replacement recognizes CRLF markers without duplicating the block", () => {
    const operation = gitignoreManagedBlockOperation("planned");
    const staleBlock = [
      "# User rules",
      "# BEGIN: repo-harness generated-runtime",
      "old-entry/",
      "# END: repo-harness generated-runtime",
      "",
    ].join("\r\n");

    const replaced = upsertManagedBlock(staleBlock, operation);

    expect(replaced.ok).toBe(true);
    expect(replaced.changed).toBe(true);
    expect(replaced.content?.match(/# BEGIN: repo-harness generated-runtime/g)).toHaveLength(1);
    expect(replaced.content).not.toContain("old-entry/");
    expect(replaced.content).toContain("\r\n");
  });

  test("applicator writes safe subset and remains idempotent", () => {
    const repo = tempRepo();
    try {
      const plan = planAdoption({ repoRoot: repo, mode: "minimal" });
      const result = applyAdoptionPlan(plan);
      expect(result.ok).toBe(true);
      expect(existsSync(join(repo, "docs", "spec.md"))).toBe(true);
      expect(readFileSync(join(repo, ".ai", "harness", "workflow-contract.json"), "utf-8")).toBe(
        readWorkflowContractAsset(),
      );
      expect(readFileSync(join(repo, ".gitignore"), "utf-8")).toContain("# BEGIN: repo-harness generated-runtime");

      writeFileSync(join(repo, "docs", "spec.md"), "# User spec\n");
      const secondPlan = planAdoption({ repoRoot: repo, mode: "minimal" });
      const second = applyAdoptionPlan(secondPlan);
      expect(second.ok).toBe(true);
      expect(readFileSync(join(repo, "docs", "spec.md"), "utf-8")).toBe("# User spec\n");
      expect(second.results.find((entry) => entry.id === "writeFile:docs/spec.md:ifMissing")?.status).toBe("skipped");
      expect(second.results.find((entry) => entry.kind === "appendManagedBlock")?.status).toBe("skipped");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("atomic writer backs up managed block updates and cleans transient locks", () => {
    const repo = tempRepo();
    try {
      writeFileSync(join(repo, ".gitignore"), "# User rules\ncustom.log\n");
      const result = applyAppendManagedBlockOperation(repo, gitignoreManagedBlockOperation("planned"));

      expect(result.status).toBe("applied");
      expect(result.backupPath?.startsWith(".ai/harness/backups/fs-transaction/.gitignore.")).toBe(true);
      expect(existsSync(join(repo, result.backupPath ?? ""))).toBe(true);
      expect(readFileSync(join(repo, result.backupPath ?? ""), "utf-8")).toBe("# User rules\ncustom.log\n");
      expect(readFileSync(join(repo, ".gitignore"), "utf-8")).toContain("# BEGIN: repo-harness generated-runtime");
      expect(readFileSync(join(repo, ".gitignore"), "utf-8")).toContain(".ai/harness/backups/");
      expect(existsSync(join(repo, ".gitignore.repo-harness.lock"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("atomic writer reports a structured failure when the target is locked", () => {
    const repo = tempRepo();
    try {
      writeFileSync(join(repo, ".gitignore"), "# User rules\n");
      writeFileSync(join(repo, ".gitignore.repo-harness.lock"), "external writer\n");

      const result = applyAppendManagedBlockOperation(repo, gitignoreManagedBlockOperation("planned"));

      expect(result.status).toBe("failed");
      expect(result.error).toContain("target is locked");
      expect(readFileSync(join(repo, ".gitignore"), "utf-8")).toBe("# User rules\n");
      expect(readFileSync(join(repo, ".gitignore.repo-harness.lock"), "utf-8")).toBe("external writer\n");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("workflow-contract install writes stale manifests through the atomic writer", () => {
    const repo = tempRepo();
    try {
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      writeFileSync(join(repo, ".ai", "harness", "workflow-contract.json"), "{\"version\":\"old\"}\n");

      const result = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      const workflowContract = result.results.find(
        (entry) => entry.id === "writeFile:.ai/harness/workflow-contract.json:workflow-contract",
      );

      expect(result.ok).toBe(true);
      expect(workflowContract?.status).toBe("applied");
      expect(workflowContract?.backupPath?.startsWith(".ai/harness/backups/fs-transaction/.ai__harness__workflow-contract.json.")).toBe(
        true,
      );
      expect(readFileSync(join(repo, workflowContract?.backupPath ?? ""), "utf-8")).toBe("{\"version\":\"old\"}\n");
      expect(readFileSync(join(repo, ".ai", "harness", "workflow-contract.json"), "utf-8")).toBe(
        readWorkflowContractAsset(),
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("applicator preflights unsupported operations before partial writes", () => {
    const repo = tempRepo();
    try {
      const result = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "self-host", apply: true }));

      expect(result.ok).toBe(false);
      expect(result.results).toEqual([
        expect.objectContaining({
          id: "runCheck:self-host-adoption-boundary-review",
          kind: "runCheck",
          status: "failed",
        }),
      ]);
      expect(existsSync(join(repo, "docs", "spec.md"))).toBe(false);
      expect(existsSync(join(repo, ".gitignore"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("repo-harness adopt dry-run planner output", () => {
  test("prints text from the TypeScript planner without writing repo files", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "adopt", "--repo", repo, "--dry-run"], {
        cwd: ROOT,
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("[adopt-plan] repo:");
      expect(result.stdout).toContain("[adopt-plan] operations: 66 total, 66 planned, 0 skipped");
      expect(result.stdout).toContain("[adopt-plan] writeFile: 48");
      expect(result.stdout).not.toContain("plan repo harness");
      expect(existsSync(join(repo, "docs", "spec.md"))).toBe(false);
      expect(existsSync(join(repo, ".gitignore"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("prints protocol v1 JSON without writing repo files or shell migration output", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "adopt", "--repo", repo, "--dry-run", "--json"], {
        cwd: ROOT,
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const output = JSON.parse(result.stdout);
      expect(output.protocol).toBe(1);
      expect(output.command).toBe("adopt");
      expect(output.apply).toBe(false);
      expect(output.operations.some((operation: { kind: string }) => operation.kind === "appendManagedBlock")).toBe(true);
      expect(result.stdout).not.toContain("plan repo harness");
      expect(existsSync(join(repo, "docs", "spec.md"))).toBe(false);
      expect(existsSync(join(repo, ".gitignore"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("refuses non-standard default apply while shell migrator mode parity is incomplete", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "adopt", "--repo", repo, "--mode", "minimal", "--no-verify", "--no-codegraph"], {
        cwd: ROOT,
        encoding: "utf-8",
      });

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("--mode minimal is only supported with ordinary --dry-run or --experimental-ts-apply");
      expect(existsSync(join(repo, "docs", "spec.md"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("repo-harness adopt --experimental-ts-apply", () => {
  test("applies the safe minimal TypeScript plan", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync(
        "bun",
        [CLI, "adopt", "--repo", repo, "--mode", "minimal", "--experimental-ts-apply", "--json"],
        {
          cwd: ROOT,
          encoding: "utf-8",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const output = JSON.parse(result.stdout);
      expect(output.protocol).toBe(1);
      expect(output.experimentalTsApply).toBe(true);
      expect(output.ok).toBe(true);
      expect(output.apply.ok).toBe(true);
      expect(output.plan.apply).toBe(true);
      expect(existsSync(join(repo, "docs", "spec.md"))).toBe(true);
      expect(readFileSync(join(repo, ".ai", "harness", "workflow-contract.json"), "utf-8")).toBe(
        readWorkflowContractAsset(),
      );
      expect(readFileSync(join(repo, ".gitignore"), "utf-8")).toContain("# BEGIN: repo-harness generated-runtime");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("applies the standard TypeScript plan including workflow-contract install", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "adopt", "--repo", repo, "--experimental-ts-apply", "--json"], {
        cwd: ROOT,
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(true);
      expect(output.unsupportedOperations).toBeUndefined();
      expect(readFileSync(join(repo, ".ai", "harness", "workflow-contract.json"), "utf-8")).toBe(
        readWorkflowContractAsset(),
      );
      expect(readFileSync(join(repo, ".gitignore"), "utf-8")).toContain("# BEGIN: repo-harness generated-runtime");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails before writes when the plan contains unsupported applicator operations", () => {
    const repo = tempRepo();
    try {
      const result = spawnSync("bun", [CLI, "adopt", "--repo", repo, "--mode", "self-host", "--experimental-ts-apply", "--json"], {
        cwd: ROOT,
        encoding: "utf-8",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(false);
      expect(output.unsupportedOperations).toEqual([
        expect.objectContaining({
          id: "runCheck:self-host-adoption-boundary-review",
          kind: "runCheck",
        }),
      ]);
      expect(existsSync(join(repo, "docs", "spec.md"))).toBe(false);
      expect(existsSync(join(repo, ".gitignore"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
