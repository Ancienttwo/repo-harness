import { createHash } from "crypto";

import { canonicalize } from "./canonical-json";
import type { JsonValue } from "./types";

export const VERIFICATION_PLAN_PROTOCOL = 1 as const;

export type VerificationCheckKind = "command" | "package_test";
export type VerificationCheckPhase = "preflight" | "verification";
export type VerificationCheckCost = "normal" | "expensive";
export type VerificationEvidencePolicy = "current_exact" | "baseline_with_delta";

export interface VerificationCheckInputs {
  readonly env: readonly string[];
}

export interface VerificationBaselineReference {
  readonly run_file: string;
  readonly execution_id: string;
}

interface VerificationCheckBase {
  readonly id: string;
  readonly cwd: string;
  readonly phase: VerificationCheckPhase;
  readonly cost: VerificationCheckCost;
  readonly evidence_policy: VerificationEvidencePolicy;
  readonly necessity: string;
  readonly inputs: VerificationCheckInputs;
  readonly baseline?: VerificationBaselineReference;
  readonly delta_checks?: readonly string[];
}

export interface VerificationCommandCheck extends VerificationCheckBase {
  readonly kind: "command";
  readonly command: string;
}

export interface VerificationPackageTestCheck extends VerificationCheckBase {
  readonly kind: "package_test";
  readonly path: string;
}

export type VerificationCheck = VerificationCommandCheck | VerificationPackageTestCheck;

export interface VerificationPlan {
  readonly protocol: 1;
  readonly checks: readonly VerificationCheck[];
}

export class VerificationPlanValidationError extends Error {
  constructor(message: string, readonly reason: "missing_plan" | "invalid_plan" = "invalid_plan") {
    super(message);
    this.name = "VerificationPlanValidationError";
  }
}

function fail(message: string): never {
  throw new VerificationPlanValidationError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], context: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) fail(`${context} has unknown field(s): ${unexpected.join(", ")}`);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${field} must be a non-empty string`);
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function stringArray(value: unknown, field: string, allowEmpty: boolean): readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(`${field} must be ${allowEmpty ? "an" : "a non-empty"} array of strings`);
  }
  const result = value.map((item, index) => nonEmptyString(item, `${field}[${index}]`));
  if (new Set(result).size !== result.length) fail(`${field} must not contain duplicates`);
  return result;
}

function validateInputs(value: unknown, context: string): VerificationCheckInputs {
  if (!isObject(value)) fail(`${context}.inputs must be an object`);
  assertKeys(value, ["env"], `${context}.inputs`);
  const env = stringArray(value.env, `${context}.inputs.env`, true);
  for (const name of env) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) fail(`${context}.inputs.env contains an invalid environment name: ${name}`);
    if (name.startsWith("REPO_HARNESS_")) fail(`${context}.inputs.env may not declare harness-internal environment: ${name}`);
  }
  return { env };
}

function isForbiddenEvidenceProducerCommand(command: string): boolean {
  if (command.includes("benchmark:harness") || command.includes("run-harness-profile-benchmark")) return true;
  if (/(^|\s)codex\s+exec(?:\s|$)/.test(command) || /(^|\s)claude\s+-p(?:\s|$)/.test(command)) return true;
  if (!command.includes("--dry-run")
    && /(^|\s)(?:repo-harness|(?:\S*\/)?index\.ts)\s+init(?:\s|$)/.test(command)) return true;
  return !command.includes("--dry-run") && /(^|\s)install(?:\s|$)/.test(command);
}

function validateBaseline(value: unknown, context: string): VerificationBaselineReference {
  if (!isObject(value)) fail(`${context}.baseline must be an object`);
  assertKeys(value, ["run_file", "execution_id"], `${context}.baseline`);
  const runFile = nonEmptyString(value.run_file, `${context}.baseline.run_file`);
  if (!runFile.startsWith(".ai/harness/runs/") || runFile.split(/[\\/]+/).includes("..")) {
    fail(`${context}.baseline.run_file must be a repo-relative .ai/harness/runs/ path`);
  }
  return {
    run_file: runFile,
    execution_id: nonEmptyString(value.execution_id, `${context}.baseline.execution_id`),
  };
}

function validateCheck(value: unknown, index: number): VerificationCheck {
  const context = `checks[${index}]`;
  if (!isObject(value)) fail(`${context} must be an object`);
  assertKeys(value, [
    "id", "kind", "command", "path", "cwd", "phase", "cost", "evidence_policy", "necessity",
    "inputs", "baseline", "delta_checks",
  ], context);

  const id = nonEmptyString(value.id, `${context}.id`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) fail(`${context}.id contains unsupported characters`);
  const kind = enumValue(value.kind, ["command", "package_test"] as const, `${context}.kind`);
  const cwd = nonEmptyString(value.cwd, `${context}.cwd`);
  if (cwd.startsWith("/") || cwd.split(/[\\/]+/).includes("..")) fail(`${context}.cwd must be repo-relative and may not traverse parents`);
  const phase = enumValue(value.phase, ["preflight", "verification"] as const, `${context}.phase`);
  const cost = enumValue(value.cost, ["normal", "expensive"] as const, `${context}.cost`);
  const evidencePolicy = enumValue(
    value.evidence_policy,
    ["current_exact", "baseline_with_delta"] as const,
    `${context}.evidence_policy`,
  );
  const necessity = nonEmptyString(value.necessity, `${context}.necessity`);
  const inputs = validateInputs(value.inputs, context);

  const common = { id, cwd, phase, cost, evidence_policy: evidencePolicy, necessity, inputs };
  const executable = kind === "command"
    ? (() => {
        if (value.path !== undefined) fail(`${context}.path is forbidden for command checks`);
        const command = nonEmptyString(value.command, `${context}.command`);
        if (isForbiddenEvidenceProducerCommand(command)) fail(`${context}.command is a forbidden evidence producer`);
        return { ...common, kind, command } as const;
      })()
    : (() => {
        if (value.command !== undefined) fail(`${context}.command is forbidden for package_test checks`);
        const path = nonEmptyString(value.path, `${context}.path`);
        if (path.startsWith("/") || path.split(/[\\/]+/).includes("..")) fail(`${context}.path must be repo-relative and may not traverse parents`);
        return { ...common, kind, path } as const;
      })();

  if (evidencePolicy === "current_exact") {
    if (value.baseline !== undefined || value.delta_checks !== undefined) {
      fail(`${context} current_exact checks must not define baseline or delta_checks`);
    }
    return executable;
  }

  return {
    ...executable,
    baseline: validateBaseline(value.baseline, context),
    delta_checks: stringArray(value.delta_checks, `${context}.delta_checks`, false),
  };
}

export function validateVerificationPlan(value: unknown): VerificationPlan {
  if (!isObject(value)) fail("Verification Plan must be a JSON object");
  assertKeys(value, ["protocol", "checks"], "Verification Plan");
  if (value.protocol !== VERIFICATION_PLAN_PROTOCOL) fail(`Verification Plan protocol must be ${VERIFICATION_PLAN_PROTOCOL}`);
  if (!Array.isArray(value.checks)) fail("Verification Plan checks must be an array");
  const checks = value.checks.map(validateCheck);
  const byId = new Map<string, VerificationCheck>();
  for (const check of checks) {
    if (byId.has(check.id)) fail(`Verification Plan check id is duplicated: ${check.id}`);
    byId.set(check.id, check);
  }
  for (const check of checks) {
    if (check.evidence_policy !== "baseline_with_delta") continue;
    for (const deltaId of check.delta_checks ?? []) {
      if (deltaId === check.id) fail(`check ${check.id} may not reference itself as a delta check`);
      const delta = byId.get(deltaId);
      if (!delta) fail(`check ${check.id} references missing delta check ${deltaId}`);
      if (delta.evidence_policy !== "current_exact") {
        fail(`check ${check.id} delta check ${deltaId} must use current_exact evidence`);
      }
      if (check.phase === "preflight" && delta.phase === "verification") {
        fail(`preflight baseline check ${check.id} may not depend on verification-phase delta check ${deltaId}`);
      }
    }
  }
  return { protocol: VERIFICATION_PLAN_PROTOCOL, checks };
}

const PLAN_BLOCK = /^## Verification Plan\s*\r?\n\s*```json\s*\r?\n([\s\S]*?)\r?\n```\s*$/gm;

function hasNonEmptyLegacyExecutableLists(contractText: string): boolean {
  const legacyKeyCount = (key: string): number =>
    [...contractText.matchAll(new RegExp(`(?:^|\\n)\\s*${key}:`, "g"))].length;
  return legacyKeyCount("tests_pass") > 1
    || legacyKeyCount("commands_succeed") > 1
    || legacyKeyCount("criterion_reuse") > 1
    || /(?:^|\n)\s*(?:tests_pass|commands_succeed):\s*\r?\n\s*-\s+\S/m.test(contractText)
    || /(?:^|\n)\s*(?:tests_pass|commands_succeed):\s*\[[^\]\s][^\]]*\]/m.test(contractText)
    || /(?:^|\n)criterion_reuse:\s*\{\s*[^}\s][^}]*\}/m.test(contractText)
    || /(?:^|\n)criterion_reuse:\s*\r?\n(?:\s{2,}[^\n]*\r?\n)*?\s{2,}(?:tests_pass|commands_succeed):\s*(?:\r?\n\s{4,}-\s+\S|\[[^\]\s][^\]]*\])/m.test(contractText);
}

export function parseVerificationPlanFromContractText(contractText: string): VerificationPlan {
  const matches = [...contractText.matchAll(PLAN_BLOCK)];
  if (matches.length === 0 && !/^## Verification Plan\s*$/m.test(contractText) && !hasNonEmptyLegacyExecutableLists(contractText)) {
    throw new VerificationPlanValidationError("contract Verification Plan is missing; contract must contain exactly one ## Verification Plan fenced json block (found 0)", "missing_plan");
  }
  if (matches.length !== 1) {
    fail(`contract must contain exactly one ## Verification Plan fenced json block (found ${matches.length})`);
  }
  if (hasNonEmptyLegacyExecutableLists(contractText)) {
    fail("contract mixes Verification Plan with non-empty legacy tests_pass, commands_succeed, or criterion_reuse executable lists");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(matches[0]![1]!);
  } catch (error) {
    fail(`Verification Plan block is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateVerificationPlan(parsed);
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function hashVerificationPlan(plan: VerificationPlan): string {
  return sha256(canonicalize(plan as unknown as JsonValue));
}

export function fingerprintVerificationCheck(check: VerificationCheck): string {
  return sha256(canonicalize(check as unknown as JsonValue));
}

/** Identity of the executable itself, excluding evaluation policy and prose. */
export function fingerprintVerificationCheckExecution(check: VerificationCheck): string {
  const executable = check.kind === "command"
    ? { kind: check.kind, command: check.command, cwd: check.cwd, inputs: check.inputs }
    : { kind: check.kind, path: check.path, cwd: check.cwd, inputs: check.inputs };
  return sha256(canonicalize(executable as unknown as JsonValue));
}
