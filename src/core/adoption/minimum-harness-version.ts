/**
 * A repository can declare the oldest repo-harness release that reads its
 * model in the opt-in marker. An older hook then reports an upgrade
 * instruction and does not resolve state with a reader that cannot parse the
 * model.
 */
export const WORKFLOW_CONTRACT_MARKER_PATH = ".ai/harness/workflow-contract.json";
export const MINIMUM_HARNESS_VERSION_FIELD = "minimum_harness_version";

const RELEASE_VERSION = /^\d+\.\d+\.\d+$/;

export type WorkflowMarkerGateCode = "harness-upgrade-required" | "workflow-marker-invalid";

/**
 * Session and turn events report the gate. Tool events skip it, so the edit
 * guards still decide every PreToolUse.
 */
export const WORKFLOW_MARKER_GATE_EVENTS: ReadonlySet<string> = new Set(["SessionStart", "UserPromptSubmit", "Stop"]);

export interface WorkflowMarkerGate {
  readonly code: WorkflowMarkerGateCode;
  readonly message: string;
}

/** Returns the declared minimum, or null when the marker declares none. Throws on an invalid marker or value. */
export function minimumHarnessVersionOf(marker: unknown): string | null {
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    throw new Error(`${WORKFLOW_CONTRACT_MARKER_PATH} must be a JSON object`);
  }
  const value = (marker as Record<string, unknown>)[MINIMUM_HARNESS_VERSION_FIELD];
  if (value === undefined) return null;
  if (typeof value !== "string" || !RELEASE_VERSION.test(value)) {
    throw new Error(`${WORKFLOW_CONTRACT_MARKER_PATH}#${MINIMUM_HARNESS_VERSION_FIELD} must be a release version such as 1.2.3`);
  }
  return value;
}

/**
 * Checks the opt-in marker text that `readMarker` returns. Returns null when
 * the running harness can serve the repository; otherwise the gate names why
 * not. A read failure is an invalid marker, like a parse failure.
 */
export function workflowMarkerGate(
  readMarker: () => string,
  runningVersion: () => string,
): WorkflowMarkerGate | null {
  let minimum: string | null;
  try {
    minimum = minimumHarnessVersionOf(JSON.parse(readMarker()));
  } catch (error) {
    const detail = error instanceof SyntaxError ? `${WORKFLOW_CONTRACT_MARKER_PATH} is not valid JSON` : (error as Error).message;
    return { code: "workflow-marker-invalid", message: `${detail}. Repair the marker; the hook does not run until it is valid.` };
  }
  if (minimum === null) return null;
  let running: string;
  try {
    running = runningVersion();
  } catch (error) {
    return {
      code: "harness-upgrade-required",
      message: `This repository needs repo-harness >= ${minimum}, and the running version is unreadable (${(error as Error).message}). Run \`repo-harness update\`.`,
    };
  }
  if (Bun.semver.order(running, minimum) >= 0) return null;
  return {
    code: "harness-upgrade-required",
    message: `This repository needs repo-harness >= ${minimum}; the running repo-harness is ${running}. Run \`repo-harness update\`, then start a new session.`,
  };
}
