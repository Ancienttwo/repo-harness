import { readFileSync } from "fs";
import { join } from "path";
import { WORKFLOW_CONTRACT_MARKER_PATH, workflowMarkerGate, type WorkflowMarkerGate } from "../../core/adoption/minimum-harness-version";

const PACKAGE_JSON_URL = new URL("../../../package.json", import.meta.url);

/**
 * Build-time version literal of the single-file hook bundle, where the
 * package.json path relative to this module no longer holds. Undeclared in
 * unbundled runs, which read package.json.
 */
declare const REPO_HARNESS_BUNDLED_CLI_VERSION: string | undefined;

export function runningHarnessVersion(): string {
  if (typeof REPO_HARNESS_BUNDLED_CLI_VERSION === "string" && REPO_HARNESS_BUNDLED_CLI_VERSION.length > 0) {
    return REPO_HARNESS_BUNDLED_CLI_VERSION;
  }
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON_URL, "utf-8")) as { version?: unknown };
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("the repo-harness package.json has no version");
  }
  return manifest.version;
}

/** Checks the opt-in marker of an opted-in repository against the running harness. */
export function inspectWorkflowMarker(
  repoRoot: string,
  runningVersion: () => string = runningHarnessVersion,
): WorkflowMarkerGate | null {
  return workflowMarkerGate(() => readFileSync(join(repoRoot, WORKFLOW_CONTRACT_MARKER_PATH), "utf-8"), runningVersion);
}
