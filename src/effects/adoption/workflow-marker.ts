import { readFileSync } from "fs";
import { join } from "path";
import { version as PACKAGE_VERSION } from "../../../package.json";
import { WORKFLOW_CONTRACT_MARKER_PATH, workflowMarkerGate, type WorkflowMarkerGate } from "../../core/adoption/minimum-harness-version";

/** The package version from the static package.json import: build-resolved in a bundle, module-resolved in source. */
export function runningHarnessVersion(): string {
  return PACKAGE_VERSION;
}

/** Checks the opt-in marker of an opted-in repository against the running harness. */
export function inspectWorkflowMarker(
  repoRoot: string,
  runningVersion: () => string = runningHarnessVersion,
): WorkflowMarkerGate | null {
  return workflowMarkerGate(() => readFileSync(join(repoRoot, WORKFLOW_CONTRACT_MARKER_PATH), "utf-8"), runningVersion);
}
