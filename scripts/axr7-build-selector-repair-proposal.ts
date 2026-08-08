#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const output = "tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.selector-repair-proposal.json";
const repairs = [
  ["action-commands", "capability.public-surface.action-commands", "src/cli/commands/init.ts", "runInit", "src/cli/commands/init.ts", "installExternalSkills", "src/cli/commands/init.ts", "installExternalSkills", "src/cli/commands/init.ts", "loadSkillSurfaceCatalog"],
  ["root-router", "capability.public-surface.root-router", "src/cli/commands/init.ts", "runInit", "src/cli/commands/adoption-plan.ts", "runAdoptionPlan", "src/cli/commands/adoption-plan.ts", "runAdoptionPlan", "src/cli/commands/adoption-plan.ts", "createPlan"],
  ["hook-adapters", "capability.runtime-harness.hook-adapters", "src/cli/hook/mutation-observed.ts", "consumePendingPostEditEvents", "src/cli/hook/mutation-observed.ts", "processArchitectureCascade", "src/cli/hook/mutation-observed.ts", "processArchitectureCascade", "src/cli/hook/mutation-observed.ts", "runRepoHarnessHelper"],
  ["general-repo-access", "capability.runtime-mcp.general-repo-access", "src/cli/mcp/general-repo-access.ts", "callGeneralRepoTool", "src/cli/mcp/general-repo-access.ts", "readFileTool", "src/cli/mcp/reader-tools.ts", "callReaderTool", "src/cli/mcp/general-repo-access.ts", "callGeneralRepoTool"],
  ["evals-checks", "capability.verification.evals-checks", "src/effects/review/cross-review-runner.ts", "runCrossReview", "src/core/review/cross-review.ts", "classifyCrossReviewOutcome", "src/cli/commands/cross-review.ts", "runCrossReviewCommand", "src/effects/review/cross-review-runner.ts", "runCrossReview"],
  ["contract-assets", "capability.workflow-engine.contract-assets", "src/core/adoption/standard-plan.ts", "planStandardAdoption", "src/core/adoption/workflow-contract-asset.ts", "readWorkflowContractAsset", "src/core/adoption/workflow-contract-asset.ts", "loadWorkflowContractAsset", "src/core/adoption/workflow-contract-asset.ts", "readWorkflowContractAsset"],
  ["inspection-migration", "capability.workflow-engine.inspection-migration", "src/cli/commands/init.ts", "runInit", "src/cli/commands/init.ts", "runProcess", "src/cli/commands/init.ts", "runProcess", "src/effects/process-runner.ts", "runProcess"]
] as const;

const operations: Array<Record<string, string>> = [];
for (const [key, capabilityId, oldEntryPath, oldSource, oldSinkPath, oldSink, entryPath, source, sinkPath, sink] of repairs) {
  const nodePath = `.archcontext/model/nodes/${capabilityId}.yaml`;
  const node = readFileSync(resolve(root, nodePath), "utf8");
  const nextNode = node
    .replace(`path: ${JSON.stringify(oldEntryPath)}\n      symbols:\n        - name: ${JSON.stringify(oldSource)}`, `path: ${JSON.stringify(entryPath)}\n      symbols:\n        - name: ${JSON.stringify(source)}`)
    .replace(`path: ${JSON.stringify(oldSinkPath)}\n              symbol: ${JSON.stringify(oldSink)}`, `path: ${JSON.stringify(sinkPath)}\n              symbol: ${JSON.stringify(sink)}`);
  if (nextNode === node) throw new Error(`selector node repair did not match ${nodePath}`);
  operations.push(update(nodePath, capabilityId, node, nextNode));
  const flowPath = `.archcontext/model/flows/flow.${key}.primary.yaml`;
  const flow = readFileSync(resolve(root, flowPath), "utf8");
  const nextFlow = flow.replaceAll(`sourceSymbol: ${JSON.stringify(oldSource)}`, `sourceSymbol: ${JSON.stringify(source)}`);
  if (nextFlow === flow) throw new Error(`selector flow repair did not match ${flowPath}`);
  operations.push(update(flowPath, `flow.${key}.primary`, flow, nextFlow));
}

writeFileSync(resolve(root, output), `${JSON.stringify({
  schemaVersion: "archcontext.model-proposal/v1",
  changeSetId: "changeset.axr7.repo-harness-selector-repair",
  taskSessionId: "task_axr7_repo_harness_selector_repair",
  operations
}, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ output, operationCount: operations.length }, null, 2)}\n`);

function update(path: string, entityId: string, current: string, body: string) {
  return {
    op: "update_entity_fields",
    path,
    entityId,
    expectedHash: `sha256:${createHash("sha256").update(JSON.stringify({ body: current }), "utf8").digest("hex")}`,
    body
  };
}
