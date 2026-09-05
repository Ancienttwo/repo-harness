import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

export const REFACTOR_PROVIDER_VERSION = "0.5.7" as const;
export const REFACTOR_SCAN_FEATURES = Object.freeze(["module-statistics-v1", "refactor-assessment-v1", "recommendation-v3"] as const);
export const REFACTOR_VERIFY_FEATURES = Object.freeze(["refactor-resolution-v1"] as const);

export type RefactorProviderStage = {
  provider_version: typeof REFACTOR_PROVIDER_VERSION;
  required_features: string[];
};
export type RefactorPolicy = {
  mode: "off" | "shadow" | "active";
  provider: "archctx";
  proposal_author: "local" | "gpt_pro" | "ask";
  stages: { scan: RefactorProviderStage; verify: RefactorProviderStage };
  workflow_routing: {
    module_refactor: "work_package";
    cross_module_refactor: "refactor_sprint";
    architecture_intervention: "human_architecture_approval";
    proof_required: "investigation_only";
    no_action: "record_and_stop";
  };
  maximum_modules_per_program: number;
  maximum_parallel_modules: number;
  require_cutover_closure: boolean;
  require_post_merge_measurement: boolean;
};
const DEFAULT: RefactorPolicy = {
  mode: "off",
  provider: "archctx",
  proposal_author: "local",
  stages: {
    scan: { provider_version: REFACTOR_PROVIDER_VERSION, required_features: [...REFACTOR_SCAN_FEATURES] },
    verify: { provider_version: REFACTOR_PROVIDER_VERSION, required_features: [...REFACTOR_VERIFY_FEATURES] },
  },
  workflow_routing: {
    module_refactor: "work_package", cross_module_refactor: "refactor_sprint",
    architecture_intervention: "human_architecture_approval", proof_required: "investigation_only", no_action: "record_and_stop",
  },
  maximum_modules_per_program: 10,
  maximum_parallel_modules: 3,
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
    workflow_routing: { ...DEFAULT.workflow_routing },
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
  if (Object.keys(section).some((key) => !["mode", "provider", "proposal_author", "stages", "workflow_routing", "maximum_modules_per_program", "maximum_parallel_modules", "require_cutover_closure", "require_post_merge_measurement"].includes(key))) throw new Error("policy.refactor contains an unknown field");
  const mode = section.mode ?? "off";
  const provider = section.provider ?? "archctx";
  const proposalAuthor = section.proposal_author ?? "local";
  const stages = section.stages ?? DEFAULT.stages;
  const routing = section.workflow_routing ?? DEFAULT.workflow_routing;
  const maximumModules = section.maximum_modules_per_program ?? 10;
  const maximumParallel = section.maximum_parallel_modules ?? 3;
  const required = section.require_cutover_closure ?? false;
  const requirePostMerge = section.require_post_merge_measurement ?? false;
  if (!["off", "shadow", "active"].includes(String(mode))) throw new Error("policy.refactor.mode is invalid");
  if (provider !== "archctx") throw new Error("policy.refactor.provider must be archctx");
  if (!["local", "gpt_pro", "ask"].includes(String(proposalAuthor))) throw new Error("policy.refactor.proposal_author is invalid");
  if (typeof stages !== "object" || stages === null || Array.isArray(stages)) throw new Error("policy.refactor.stages must be an object");
  const stageRecord = stages as Record<string, unknown>;
  if (Object.keys(stageRecord).some((key) => !["scan", "verify"].includes(key)) || stageRecord.scan === undefined || stageRecord.verify === undefined) throw new Error("policy.refactor.stages must contain only scan and verify");
  if (typeof required !== "boolean") throw new Error("policy.refactor.require_cutover_closure must be boolean");
  if (typeof requirePostMerge !== "boolean") throw new Error("policy.refactor.require_post_merge_measurement must be boolean");
  if (typeof routing !== "object" || routing === null || Array.isArray(routing)) throw new Error("policy.refactor.workflow_routing must be an object");
  const routingRecord = routing as Record<string, unknown>;
  const expectedRouting = DEFAULT.workflow_routing;
  if (Object.keys(routingRecord).length !== Object.keys(expectedRouting).length
    || Object.entries(expectedRouting).some(([key, expected]) => routingRecord[key] !== expected)) throw new Error("policy.refactor.workflow_routing must match the closed route map");
  if (!Number.isSafeInteger(maximumModules) || (maximumModules as number) < 1) throw new Error("policy.refactor.maximum_modules_per_program must be a positive integer");
  if (!Number.isSafeInteger(maximumParallel) || (maximumParallel as number) < 1 || (maximumParallel as number) > (maximumModules as number)) throw new Error("policy.refactor.maximum_parallel_modules must be a positive integer no greater than maximum_modules_per_program");
  return {
    mode: mode as RefactorPolicy["mode"], provider: "archctx", proposal_author: proposalAuthor as RefactorPolicy["proposal_author"],
    stages: { scan: stage(stageRecord.scan, "scan", REFACTOR_SCAN_FEATURES), verify: stage(stageRecord.verify, "verify", REFACTOR_VERIFY_FEATURES) },
    workflow_routing: { ...expectedRouting }, maximum_modules_per_program: maximumModules as number, maximum_parallel_modules: maximumParallel as number,
    require_cutover_closure: required, require_post_merge_measurement: requirePostMerge,
  };
}

export function loadRefactorPolicy(repoRoot: string): RefactorPolicy {
  const path = join(repoRoot, ".ai", "harness", "policy.json");
  if (!existsSync(path)) return { ...DEFAULT };
  return readRefactorPolicy(JSON.parse(readFileSync(path, "utf8")));
}

export function loadRefactorPolicyAtRevision(repoRoot: string, revisionDigest: string): RefactorPolicy {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(revisionDigest)) throw new Error('refactor policy revision digest is invalid');
  const revision = revisionDigest;
  let raw: string;
  try {
    raw = execFileSync('git', ['show', `${revision}:.ai/harness/policy.json`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new Error(`refactor policy is unavailable at authorized revision ${revision}`, { cause: error });
  }
  return readRefactorPolicy(JSON.parse(raw));
}
