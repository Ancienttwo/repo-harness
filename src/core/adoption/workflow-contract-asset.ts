import { readFileSync } from "fs";
import { join } from "path";

export const WORKFLOW_CONTRACT_ASSET_PATH = join(import.meta.dir, "..", "..", "..", "assets", "workflow-contract.v1.json");

export function readWorkflowContractAsset(): string {
  return readFileSync(WORKFLOW_CONTRACT_ASSET_PATH, "utf-8");
}

export function loadWorkflowContractAsset<T>(): T {
  return JSON.parse(readWorkflowContractAsset()) as T;
}

export function renderWorkflowContractMarker(): string {
  return JSON.stringify({ kind: "repo-harness.workflow-contract-marker", protocol: 1 }, null, 2) + "\n";
}
