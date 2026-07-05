#!/usr/bin/env bun

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getPlanTier, resolvePlanType } from "./assemble-template";

export interface DecisionPoint {
  id: string;
  title: string;
  batch: number;
  questions: string[];
  required: boolean;
}

export interface RuntimeProfile {
  label: string;
  claudePolicy: string;
  codexPolicy: string;
}

export interface ProfileChoice {
  label: string;
  description: string;
}

export interface AiNativeProfileChoice extends ProfileChoice {
  frontend: string;
  runtimeProtocol: string;
  backend: string;
  stateDefault: string;
  sidecarPolicy: string;
  uiSchema: string;
  projectStructureFile?: string;
  techStackRows?: string[];
}

export interface WebappRenderingModelChoice extends ProfileChoice {
  frontend: string;
  deployment: string;
  publicRoute: string;
  appRoute: string;
  fallback: string;
  projectStructureFile?: string;
  techStackRows?: string[];
}

interface InitializerQuestionPackBase {
  version: "initializer-question-pack.v2" | "initializer-question-pack.v3" | "initializer-question-pack.v4";
  goal: string;
  decisionPoints: DecisionPoint[];
  planTiers: {
    core: string[];
    presets: string[];
  };
  inferredDefaults: {
    packageManagerPriority: string[];
    runtimeProfile: string;
    orchestrationProfile: string;
    evaluationProfile: string;
    handoffProfile: string;
    recoveryProfile?: string;
    stateProfile?: string;
    contextProfile?: string;
    documentationProfile?: string;
    aiNativeProfile?: string;
    webappRenderingModel?: string;
  };
  runtimeProfiles: Record<string, RuntimeProfile>;
  orchestrationProfiles: Record<string, ProfileChoice>;
  evaluationProfiles: Record<string, ProfileChoice>;
  handoffProfiles: Record<string, ProfileChoice>;
}

export interface InitializerQuestionPackV2 extends InitializerQuestionPackBase {
  version: "initializer-question-pack.v2";
}

export interface InitializerQuestionPackV3 extends InitializerQuestionPackBase {
  version: "initializer-question-pack.v3";
  recoveryProfiles: Record<string, ProfileChoice>;
  stateProfiles: Record<string, ProfileChoice>;
}

export interface InitializerQuestionPackV4 extends InitializerQuestionPackBase {
  version: "initializer-question-pack.v4";
  recoveryProfiles: Record<string, ProfileChoice>;
  stateProfiles: Record<string, ProfileChoice>;
  contextProfiles: Record<string, ProfileChoice>;
  aiNativeProfiles: Record<string, AiNativeProfileChoice>;
  webappRenderingModels: Record<string, WebappRenderingModelChoice>;
}

export type InitializerQuestionPack = InitializerQuestionPackV2 | InitializerQuestionPackV3 | InitializerQuestionPackV4;

const PACK_PATH = join(import.meta.dir, "..", "assets", "initializer-question-pack.v4.json");

export function loadQuestionPack(path: string = PACK_PATH): InitializerQuestionPack {
  if (!existsSync(path)) {
    throw new Error(`initializer-question-pack not found: ${path}`);
  }

  const parsed = JSON.parse(readFileSync(path, "utf-8")) as InitializerQuestionPack;
  const version = parsed.version;
  if (
    version !== "initializer-question-pack.v2" &&
    version !== "initializer-question-pack.v3" &&
    version !== "initializer-question-pack.v4"
  ) {
    throw new Error(`Unsupported question pack version: ${version}`);
  }

  return parsed;
}

export function inferPreferredPackageManager(
  planType: string,
  pack: InitializerQuestionPack = loadQuestionPack()
): string {
  const resolved = resolvePlanType(planType);
  const tier = getPlanTier(resolved);
  const [firstChoice, secondChoice] = pack.inferredDefaults.packageManagerPriority;

  // Python-centric plans (G=AI Quant, H=FIX/RFQ) use uv for Python deps.
  // JS tooling in these plans still uses bun/pnpm, but the primary PM is uv.
  if (resolved === "G" || resolved === "H") {
    return "uv";
  }

  // Enterprise preset can still use bun tooling but keeps npm-compatible fallback.
  if ((resolved === "B" || tier === "custom") && secondChoice) {
    return secondChoice;
  }

  return firstChoice;
}

export function getDecisionPointsByBatch(
  pack: InitializerQuestionPack = loadQuestionPack()
): Record<number, DecisionPoint[]> {
  return pack.decisionPoints.reduce<Record<number, DecisionPoint[]>>((acc, decision) => {
    if (!acc[decision.batch]) acc[decision.batch] = [];
    acc[decision.batch].push(decision);
    return acc;
  }, {});
}

export function getAiNativeProfileIds(
  pack: InitializerQuestionPack = loadQuestionPack()
): string[] {
  if (pack.version !== "initializer-question-pack.v4") {
    return ["none"];
  }

  return Object.keys(pack.aiNativeProfiles).sort();
}

export function getWebappRenderingModelIds(
  pack: InitializerQuestionPack = loadQuestionPack()
): string[] {
  if (pack.version !== "initializer-question-pack.v4") {
    return ["none"];
  }

  return Object.keys(pack.webappRenderingModels).sort();
}

export function getQuestionFlowSummary(planType: string): {
  planType: string;
  planTier: "core" | "preset" | "custom";
  preferredPackageManager: string;
  decisionCount: number;
  requiredDecisionCount: number;
  aiNativeProfileDefault: string;
  aiNativeProfileCount: number;
  webappRenderingModelDefault: string;
  webappRenderingModelCount: number;
} {
  const pack = loadQuestionPack();
  const resolvedPlan = resolvePlanType(planType);
  const planTier = getPlanTier(resolvedPlan);

  return {
    planType: resolvedPlan,
    planTier,
    preferredPackageManager: inferPreferredPackageManager(resolvedPlan, pack),
    decisionCount: pack.decisionPoints.length,
    requiredDecisionCount: pack.decisionPoints.filter((point) => point.required).length,
    aiNativeProfileDefault: pack.inferredDefaults.aiNativeProfile ?? "none",
    aiNativeProfileCount: getAiNativeProfileIds(pack).length,
    webappRenderingModelDefault: pack.inferredDefaults.webappRenderingModel ?? "none",
    webappRenderingModelCount: getWebappRenderingModelIds(pack).length,
  };
}

if (import.meta.main) {
  const requestedPlan = process.argv[2] ?? "C";
  const summary = getQuestionFlowSummary(requestedPlan);
  console.log(JSON.stringify(summary, null, 2));
}
