#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const output = "tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.flow-repair-proposal.json";
const operations = [
  "action-commands", "adoption", "codegraph-readiness", "contract-assets", "evals-checks",
  "general-repo-access", "hook-adapters", "inspection-migration", "mcp-sidecar", "root-router"
].map((key) => {
  const path = `.archcontext/model/flows/flow.${key}.primary.yaml`;
  const current = readFileSync(resolve(root, path), "utf8");
  const outcome = current.match(/\n  - id: success\n[\s\S]*?\n        evidence:\n([\s\S]*?)\n    terminal:/);
  if (!outcome) throw new Error(`cannot recover reviewed selector from ${path}`);
  const evidence = outcome[1].split("\n").map((line) => line.replace(/^          /, "      ")).join("\n");
  const componentName = current.match(/\n        label: "Invoke ([^"]+)"/)?.[1];
  if (!componentName) throw new Error(`cannot recover reviewed component label from ${path}`);
  const body = current.replace("steps: []", [
    "steps:",
    "  - id: dispatch",
    "    from: capability",
    "    to: component",
    `    label: "Dispatch ${componentName}"`,
    "    evidence:",
    evidence
  ].join("\n"));
  if (body === current) throw new Error(`${path} no longer needs the bounded flow repair`);
  return {
    op: "update_entity_fields",
    path,
    entityId: `flow.${key}.primary`,
    expectedHash: `sha256:${createHash("sha256").update(JSON.stringify({ body: current }), "utf8").digest("hex")}`,
    body
  };
});

writeFileSync(resolve(root, output), `${JSON.stringify({
  schemaVersion: "archcontext.model-proposal/v1",
  changeSetId: "changeset.axr7.repo-harness-flow-schema-repair",
  taskSessionId: "task_axr7_repo_harness_flow_schema_repair",
  operations
}, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ output, operationCount: operations.length }, null, 2)}\n`);
