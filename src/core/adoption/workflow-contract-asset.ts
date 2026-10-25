import workflowContractAsset from "../../../assets/workflow-contract.v1.json";
import { MINIMUM_HARNESS_VERSION_FIELD } from "./minimum-harness-version";

/** Each caller gets its own copy, so a caller's edit cannot reach another. */
export function loadWorkflowContractAsset<T>(): T {
  return structuredClone(workflowContractAsset) as T;
}

/** A declared minimum harness version is repository data; adoption keeps it. */
export function renderWorkflowContractMarker(minimumHarnessVersion?: string): string {
  return JSON.stringify({
    kind: "repo-harness.workflow-contract-marker",
    protocol: 1,
    ...(minimumHarnessVersion === undefined ? {} : { [MINIMUM_HARNESS_VERSION_FIELD]: minimumHarnessVersion }),
  }, null, 2) + "\n";
}
