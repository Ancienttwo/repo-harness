import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const REFACTOR_PROVIDER_VERSION = "0.5.2" as const;
export const REFACTOR_SCAN_FEATURES = Object.freeze(["module-statistics-v1", "refactor-assessment-v1", "recommendation-v3"] as const);
export const REFACTOR_VERIFY_FEATURES = Object.freeze(["refactor-resolution-v1"] as const);

export type RefactorProviderStage = {
  provider_version: typeof REFACTOR_PROVIDER_VERSION;
  required_features: string[];
};
export type RefactorPolicy = {
  mode: "off" | "shadow" | "active";
  provider: "archctx";
  stages: { scan: RefactorProviderStage; verify: RefactorProviderStage };
  require_cutover_closure: boolean;
  require_post_merge_measurement: boolean;
};
const DEFAULT: RefactorPolicy = {
  mode: "off",
  provider: "archctx",
  stages: {
    scan: { provider_version: REFACTOR_PROVIDER_VERSION, required_features: [...REFACTOR_SCAN_FEATURES] },
    verify: { provider_version: REFACTOR_PROVIDER_VERSION, required_features: [...REFACTOR_VERIFY_FEATURES] },
  },
  require_cutover_closure: false,
  require_post_merge_measurement: false,
};

function defaultPolicy(): RefactorPolicy {
  return {
    ...DEFAULT,
    stages: {
      scan: { ...DEFAULT.stages.scan, required_features: [...DEFAULT.stages.scan.required_features] },
      verify: { ...DEFAULT.stages.verify, required_features: [...DEFAULT.stages.verify.required_features] },
    },
  };
}

function stage(value: unknown, name: "scan" | "verify", expectedFeatures: readonly string[]): RefactorProviderStage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`policy.refactor.stages.${name} must be an object`);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["provider_version", "required_features"].includes(key))) throw new Error(`policy.refactor.stages.${name} contains an unknown field`);
  if (input.provider_version !== REFACTOR_PROVIDER_VERSION) throw new Error(`policy.refactor.stages.${name}.provider_version must be ${REFACTOR_PROVIDER_VERSION}`);
  if (!Array.isArray(input.required_features) || input.required_features.some((feature) => typeof feature !== "string")) throw new Error(`policy.refactor.stages.${name}.required_features must be a string array`);
  const features = input.required_features as string[];
  if (features.length !== expectedFeatures.length || expectedFeatures.some((feature) => !features.includes(feature))) throw new Error(`policy.refactor.stages.${name}.required_features must match the ${name} feature set`);
  return { provider_version: REFACTOR_PROVIDER_VERSION, required_features: [...expectedFeatures] };
}

export function readRefactorPolicy(value: unknown): RefactorPolicy {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("policy root must be an object");
  const refactor = (value as Record<string, unknown>).refactor;
  if (refactor === undefined) return defaultPolicy();
  if (typeof refactor !== "object" || refactor === null || Array.isArray(refactor)) throw new Error("policy.refactor must be an object");
  const section = refactor as Record<string, unknown>;
  if (Object.keys(section).some((key) => !["mode", "provider", "stages", "require_cutover_closure", "require_post_merge_measurement"].includes(key))) throw new Error("policy.refactor contains an unknown field");
  const mode = section.mode ?? "off";
  const provider = section.provider ?? "archctx";
  const stages = section.stages ?? DEFAULT.stages;
  const required = section.require_cutover_closure ?? false;
  const requirePostMerge = section.require_post_merge_measurement ?? false;
  if (!["off", "shadow", "active"].includes(String(mode))) throw new Error("policy.refactor.mode is invalid");
  if (provider !== "archctx") throw new Error("policy.refactor.provider must be archctx");
  if (typeof stages !== "object" || stages === null || Array.isArray(stages)) throw new Error("policy.refactor.stages must be an object");
  const stageRecord = stages as Record<string, unknown>;
  if (Object.keys(stageRecord).some((key) => !["scan", "verify"].includes(key)) || stageRecord.scan === undefined || stageRecord.verify === undefined) throw new Error("policy.refactor.stages must contain only scan and verify");
  if (typeof required !== "boolean") throw new Error("policy.refactor.require_cutover_closure must be boolean");
  if (typeof requirePostMerge !== "boolean") throw new Error("policy.refactor.require_post_merge_measurement must be boolean");
  return {
    mode: mode as RefactorPolicy["mode"], provider: "archctx",
    stages: { scan: stage(stageRecord.scan, "scan", REFACTOR_SCAN_FEATURES), verify: stage(stageRecord.verify, "verify", REFACTOR_VERIFY_FEATURES) },
    require_cutover_closure: required, require_post_merge_measurement: requirePostMerge,
  };
}

export function loadRefactorPolicy(repoRoot: string): RefactorPolicy {
  const path = join(repoRoot, ".ai", "harness", "policy.json");
  if (!existsSync(path)) return { ...DEFAULT };
  return readRefactorPolicy(JSON.parse(readFileSync(path, "utf8")));
}
