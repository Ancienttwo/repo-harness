import { readFileSync } from "fs";
import { join } from "path";
import { MINIMUM_HARNESS_VERSION_FIELD } from "./minimum-harness-version";

export const WORKFLOW_CONTRACT_ASSET_PATH = join(import.meta.dir, "..", "..", "..", "assets", "workflow-contract.v1.json");

export function readWorkflowContractAsset(): string {
  return readFileSync(WORKFLOW_CONTRACT_ASSET_PATH, "utf-8");
}

export function loadWorkflowContractAsset<T>(): T {
  return JSON.parse(readWorkflowContractAsset()) as T;
}

/** A declared minimum harness version is repository data; adoption keeps it. */
export function renderWorkflowContractMarker(minimumHarnessVersion?: string): string {
  return JSON.stringify({
    kind: "repo-harness.workflow-contract-marker",
    protocol: 1,
    ...(minimumHarnessVersion === undefined ? {} : { [MINIMUM_HARNESS_VERSION_FIELD]: minimumHarnessVersion }),
  }, null, 2) + "\n";
}
