#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const OUTPUT = "tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.model-proposal.json";

interface Declaration {
  key: string;
  capabilityId: string;
  entrypointPath: string;
  sourceSymbol: string;
  sinkPath: string;
  sinkSymbol: string;
  componentName: string;
  flowName: string;
}

const DECLARATIONS: Declaration[] = [
  { key: "action-commands", capabilityId: "capability.public-surface.action-commands", entrypointPath: "src/cli/commands/init.ts", sourceSymbol: "installExternalSkills", sinkPath: "src/cli/commands/init.ts", sinkSymbol: "loadSkillSurfaceCatalog", componentName: "Action Command Installer", flowName: "Install action command skills" },
  { key: "adoption", capabilityId: "capability.public-surface.adoption", entrypointPath: "src/cli/commands/adoption-plan.ts", sourceSymbol: "runAdoptionApply", sinkPath: "src/effects/fs-transaction.ts", sinkSymbol: "applyAdoptionPlan", componentName: "Adoption Transaction", flowName: "Apply repository adoption" },
  { key: "root-router", capabilityId: "capability.public-surface.root-router", entrypointPath: "src/cli/commands/adoption-plan.ts", sourceSymbol: "runAdoptionPlan", sinkPath: "src/cli/commands/adoption-plan.ts", sinkSymbol: "createPlan", componentName: "Root Adoption Router", flowName: "Route root initialization" },
  { key: "hook-adapters", capabilityId: "capability.runtime-harness.hook-adapters", entrypointPath: "src/cli/hook/mutation-observed.ts", sourceSymbol: "processArchitectureCascade", sinkPath: "src/cli/hook/mutation-observed.ts", sinkSymbol: "runRepoHarnessHelper", componentName: "Architecture Cascade", flowName: "Drain Stop architecture work" },
  { key: "mcp-sidecar", capabilityId: "capability.runtime-harness.mcp-sidecar", entrypointPath: "src/cli/mcp/server.ts", sourceSymbol: "createRepoHarnessMcpServer", sinkPath: "src/cli/mcp/tools.ts", sinkSymbol: "callMcpTool", componentName: "MCP Tool Dispatcher", flowName: "Dispatch an MCP tool call" },
  { key: "general-repo-access", capabilityId: "capability.runtime-mcp.general-repo-access", entrypointPath: "src/cli/mcp/reader-tools.ts", sourceSymbol: "callReaderTool", sinkPath: "src/cli/mcp/general-repo-access.ts", sinkSymbol: "callGeneralRepoTool", componentName: "Stable File Reader", flowName: "Read a repository file" },
  { key: "codegraph-readiness", capabilityId: "capability.verification.codegraph-readiness", entrypointPath: "src/cli/tools/codegraph.ts", sourceSymbol: "ensureCodegraph", sinkPath: "src/cli/tools/codegraph.ts", sinkSymbol: "checkCodegraph", componentName: "CodeGraph Readiness Check", flowName: "Verify CodeGraph readiness" },
  { key: "evals-checks", capabilityId: "capability.verification.evals-checks", entrypointPath: "src/cli/commands/cross-review.ts", sourceSymbol: "runCrossReviewCommand", sinkPath: "src/effects/review/cross-review-runner.ts", sinkSymbol: "runCrossReview", componentName: "Review Outcome Classifier", flowName: "Evaluate a cross-model review" },
  { key: "contract-assets", capabilityId: "capability.workflow-engine.contract-assets", entrypointPath: "src/core/adoption/workflow-contract-asset.ts", sourceSymbol: "loadWorkflowContractAsset", sinkPath: "src/core/adoption/workflow-contract-asset.ts", sinkSymbol: "readWorkflowContractAsset", componentName: "Workflow Contract Asset", flowName: "Project the workflow contract" },
  { key: "inspection-migration", capabilityId: "capability.workflow-engine.inspection-migration", entrypointPath: "src/cli/commands/init.ts", sourceSymbol: "runProcess", sinkPath: "src/effects/process-runner.ts", sinkSymbol: "runProcess", componentName: "Repository Inspector Process", flowName: "Inspect before migration" }
];

const operations: Array<Record<string, string>> = [];
for (const item of DECLARATIONS) {
  const nodePath = `.archcontext/model/nodes/${item.capabilityId}.yaml`;
  const current = readFileSync(resolve(ROOT, nodePath), "utf8");
  if (current.includes("\n  entrypoints:\n")) throw new Error(`${nodePath} already declares entrypoints`);
  const entrypointId = `entrypoint.${item.key}.primary`;
  const sinkId = `sink.${item.key}.primary`;
  const entrypoint = [
    "  entrypoints:",
    `    - id: ${entrypointId}`,
    `      path: ${JSON.stringify(item.entrypointPath)}`,
    "      symbols:",
    `        - name: ${JSON.stringify(item.sourceSymbol)}`,
    "          sinks:",
    `            - id: ${sinkId}`,
    `              path: ${JSON.stringify(item.sinkPath)}`,
    `              symbol: ${JSON.stringify(item.sinkSymbol)}`,
    ""
  ].join("\n");
  const body = current.replace("\nextensions:\n", `\n${entrypoint}extensions:\n`);
  if (body === current) throw new Error(`${nodePath} has no extensions insertion boundary`);
  operations.push(operation("update_entity_fields", nodePath, item.capabilityId, body, expectedHash(current)));

  const componentId = `component.${item.key}.primary`;
  const componentPath = `.archcontext/model/nodes/${componentId}.yaml`;
  operations.push(operation("create_entity", componentPath, componentId, [
    "schemaVersion: archcontext.node/v2",
    `id: ${componentId}`,
    "kind: component",
    `name: ${JSON.stringify(item.componentName)}`,
    "status: active",
    `parent: ${item.capabilityId}`,
    `summary: ${JSON.stringify(`Executes the reviewed ${item.flowName.toLowerCase()} boundary.`)}`,
    ""
  ].join("\n"), "missing"));

  const relationId = `relation.${item.key}.primary`;
  operations.push(operation("create_entity", `.archcontext/model/relations/${relationId}.yaml`, relationId, [
    "schemaVersion: archcontext.relation/v1",
    `id: ${relationId}`,
    "kind: calls",
    `source: ${item.capabilityId}`,
    `target: ${componentId}`,
    `intent: ${JSON.stringify(item.flowName)}`,
    ""
  ].join("\n"), "missing"));

  const flowId = `flow.${item.key}.primary`;
  const evidence = [
    `          entrypointId: ${entrypointId}`,
    `          sourceSymbol: ${JSON.stringify(item.sourceSymbol)}`,
    `          sinkId: ${sinkId}`
  ];
  operations.push(operation("create_entity", `.archcontext/model/flows/${flowId}.yaml`, flowId, [
    "schemaVersion: archcontext.flow/v1",
    `id: ${flowId}`,
    `capabilityId: ${item.capabilityId}`,
    `name: ${JSON.stringify(item.flowName)}`,
    "applicability: required",
    "participants:",
    "  - id: capability",
    `    nodeId: ${item.capabilityId}`,
    "  - id: component",
    `    nodeId: ${componentId}`,
    "steps:",
    "  - id: dispatch",
    "    from: capability",
    "    to: component",
    `    label: ${JSON.stringify(`Dispatch ${item.componentName}`)}`,
    "    evidence:",
    ...evidence.map((line) => line.slice(4)),
    "outcomes:",
    "  - id: success",
    "    kind: success",
    `    label: ${JSON.stringify(`${item.flowName} completes`)}`,
    "    steps:",
    "      - id: invoke-success",
    "        from: capability",
    "        to: component",
    `        label: ${JSON.stringify(`Invoke ${item.componentName}`)}`,
    "        evidence:",
    ...evidence,
    "    terminal:",
    "      participant: capability",
    "      label: Return success receipt",
    "  - id: error",
    "    kind: error",
    `    label: ${JSON.stringify(`${item.flowName} is rejected or fails`)}`,
    "    steps:",
    "      - id: invoke-error",
    "        from: capability",
    "        to: component",
    `        label: ${JSON.stringify(`Propagate ${item.componentName} failure`)}`,
    "        evidence:",
    ...evidence,
    "    terminal:",
    "      participant: capability",
    "      label: Return typed failure",
    ""
  ].join("\n"), "missing"));
}

const proposal = {
  schemaVersion: "archcontext.model-proposal/v1",
  changeSetId: "changeset.axr7.repo-harness-semantic-model",
  taskSessionId: "task_axr7_repo_harness_semantic_model",
  operations
};
writeFileSync(resolve(ROOT, OUTPUT), `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ output: OUTPUT, operationCount: operations.length }, null, 2)}\n`);

function expectedHash(body: string): string {
  return `sha256:${createHash("sha256").update(JSON.stringify({ body }), "utf8").digest("hex")}`;
}

function operation(op: string, path: string, entityId: string, body: string, expectedHashValue: string) {
  return { op, path, entityId, expectedHash: expectedHashValue, body };
}
