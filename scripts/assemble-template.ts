#!/usr/bin/env bun
/**
 * Template Assembly Script
 *
 * Concatenates partial files and performs variable substitution
 * to generate CLAUDE.md or AGENTS.md outputs.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ============================================================================
// Types
// ============================================================================

export type TemplateTarget = "claude" | "agents";

export interface AssemblyOptions {
  planType: string; // A..J + K (custom)
  variables: Record<string, string>;
  cloudflareNative?: boolean;
  target?: TemplateTarget;
  quickMode?: boolean;
}

export interface PartialInfo {
  name: string;
  path: string;
  order: number;
  conditional?: string; // e.g., "CLOUDFLARE_NATIVE"
}

export interface PlanConfig {
  name: string;
  stack: string;
  cloudflareNative: boolean;
  factorFactory?: boolean;
  tier?: "core" | "preset" | "custom";
  defaultLsp?: string;
  aiNativeOverlayDefaults?: {
    defaultProfile: string;
    recommendedProfiles: string[];
  };
  webappRenderingDefaults?: {
    defaultModel: string;
    recommendedModels: string[];
  };
  defaultHarnessProfiles?: {
    orchestration: string;
    evaluation: string;
    handoff: string;
    recovery: string;
    state: string;
  };
  defaultTemplateVariables?: Record<string, string>;
}

export interface PlanMap {
  aliases?: Record<string, string>;
  quickDefaults?: Record<string, string>;
  planTiers?: Record<string, string[]>;
  plans: Record<string, PlanConfig>;
}

export interface SkillVersionManifest {
  version: string;
  templateVersion: string;
  compatibility: {
    minClaudeCodeVersion: string;
    minBunVersion: string;
  };
  breakingChanges: Array<{
    version: string;
    description: string;
  }>;
  generatedProjectStamp: {
    format: string;
    location: string;
  };
}

interface RuntimeProfileConfig {
  label: string;
  claudePolicy: string;
  codexPolicy: string;
}

interface AiNativeProfileConfig {
  label: string;
  description: string;
  frontend: string;
  runtimeProtocol: string;
  backend: string;
  stateDefault: string;
  sidecarPolicy: string;
  uiSchema: string;
  projectStructureFile?: string;
  techStackRows?: string[];
}

interface WebappRenderingModelConfig {
  label: string;
  description: string;
  frontend: string;
  deployment: string;
  publicRoute: string;
  appRoute: string;
  fallback: string;
  projectStructureFile?: string;
  techStackRows?: string[];
}

interface QuestionPackRuntimeConfig {
  inferredDefaults?: {
    runtimeProfile?: string;
    aiNativeProfile?: string;
    webappRenderingModel?: string;
  };
  runtimeProfiles?: Record<string, RuntimeProfileConfig>;
  aiNativeProfiles?: Record<string, AiNativeProfileConfig>;
  webappRenderingModels?: Record<string, WebappRenderingModelConfig>;
}

// ============================================================================
// Constants
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const ASSETS_DIR = join(REPO_ROOT, "assets");
const PARTIALS_DIR = join(ASSETS_DIR, "partials");
const PARTIALS_AGENTS_DIR = join(ASSETS_DIR, "partials-agents");
const VERSIONS_FILE = join(ASSETS_DIR, "versions.json");
const SKILL_VERSION_FILE = join(ASSETS_DIR, "skill-version.json");
const PLAN_MAP_FILE = join(ASSETS_DIR, "plan-map.json");
const QUESTION_PACK_FILE = join(ASSETS_DIR, "initializer-question-pack.v4.json");

const TARGET_DIRS: Record<TemplateTarget, string> = {
  claude: PARTIALS_DIR,
  agents: PARTIALS_AGENTS_DIR,
};

const FALLBACK_TEMPLATE_VARIABLES: Record<string, string> = {
  USER_NAME: "Developer",
  SERVICE_TARGET: "User",
  INTERACTION_STYLE: "Technical, concise",
  RUNTIME_MODE: "Plan-only",
  RUNTIME_PROFILE: "Plan-only (recommended)",
  ORCHESTRATION_PROFILE: "shared-long-running-harness",
  EVALUATION_PROFILE: "browser-qa",
  HANDOFF_PROFILE: "artifact-aware",
  RECOVERY_PROFILE: "hybrid",
  STATE_PROFILE: "file-backed",
  CONTEXT_PROFILE: "stable-root-progressive-subdir",
  AI_NATIVE_PROFILE: "none",
  AI_NATIVE_PROFILE_LABEL: "None",
  AI_NATIVE_PROFILE_SUMMARY: "",
  AI_NATIVE_TECH_STACK_TABLE: "",
  AI_NATIVE_TECH_STACK_SECTION: "",
  WEBAPP_RENDERING_MODEL: "none",
  WEBAPP_RENDERING_MODEL_LABEL: "None",
  WEBAPP_RENDERING_MODEL_SUMMARY: "",
  WEBAPP_RENDERING_TECH_STACK_TABLE: "",
  WEBAPP_RENDERING_TECH_STACK_SECTION: "",
  PROHIBITIONS:
    "- No `any` in production code\n" +
    "- No `console.log` in production code\n" +
    "- Always present 2-3 options with trade-offs at ambiguous decision points\n" +
    "- Always push back on requests that violate project rules",
  PROJECT_STRUCTURE:
    "{{PROJECT_NAME}}/\n" +
    "├── docs/spec.md\n" +
    "├── plans/\n" +
    "├── tasks/contracts/\n" +
    "├── tasks/reviews/\n" +
    "├── tests/\n" +
    "├── src/\n" +
    "├── tasks/\n" +
    "├── .ai/harness/\n" +
    "├── deploy/\n" +
    "│   └── sql/ (ordered deployment SQL)\n" +
    "├── _ops/ (ignored local state)\n" +
    "└── artifacts/",
  TECH_STACK_TABLE:
    "| Stack | Select based on chosen plan |\n" +
    "| Runtime | Bun + TypeScript |",
};

const ALLOWED_UNRESOLVED_PATTERNS: RegExp[] = [
  /^\{\{\s*secrets\.[^}]+\s*\}\}$/,
];

let cachedPlanMap: PlanMap | null = null;
let cachedQuestionPackRuntimeConfig: QuestionPackRuntimeConfig | null = null;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Validate supported version syntax in versions.json.
 */
export function isValidVersionString(value: string): boolean {
  if (value === "latest") return true;
  if (/^\d+$/.test(value)) return true; // 19
  if (/^\d+\.x(?:-[0-9A-Za-z.-]+)?$/.test(value)) return true; // 6.x, 3.x-beta
  if (/^\d+(?:\.\d+){1,2}(?:-[0-9A-Za-z.-]+)?$/.test(value)) return true; // 2.0, 1.0.0-beta
  if (/^\d+(?:\.\d+)+\+$/.test(value)) return true; // 0.110+, 0.84+
  return false;
}

/**
 * Parse CLI target argument safely.
 */
export function parseTarget(value: string): TemplateTarget {
  if (value === "claude" || value === "agents") {
    return value;
  }

  throw new Error(
    `Invalid target: ${value}. Expected one of: claude, agents.`
  );
}

/**
 * Load versions from versions.json.
 */
export function loadVersions(versionsFilePath: string = VERSIONS_FILE): Record<string, string> {
  if (!existsSync(versionsFilePath)) {
    throw new Error(`versions.json not found at ${versionsFilePath}`);
  }

  let parsed: unknown;
  try {
    const raw = readFileSync(versionsFilePath, "utf-8");
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse versions.json at ${versionsFilePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Invalid versions.json format at ${versionsFilePath}: root must be an object`);
  }

  // Flatten nested structure to flat key-value
  const versions: Record<string, string> = {};

  for (const [category, items] of Object.entries(parsed as Record<string, unknown>)) {
    if (category.startsWith("$")) continue; // Skip $schema, $comment
    if (typeof items !== "object" || items === null) continue;

    for (const [key, value] of Object.entries(items as Record<string, unknown>)) {
      if (typeof value !== "string") {
        throw new Error(
          `Invalid version value for ${category}.${key}: expected string, got ${typeof value}`
        );
      }

      if (!isValidVersionString(value)) {
        throw new Error(
          `Invalid version format for ${category}.${key}: "${value}"`
        );
      }

      // Convert to VERSION_XXX format (uppercase, hyphens to underscores)
      const varName = `VERSION_${key.toUpperCase().replace(/-/g, "_")}`;
      versions[varName] = value;
    }
  }

  return versions;
}

/**
 * Load skill version manifest from skill-version.json.
 */
export function loadSkillVersion(
  skillVersionFilePath: string = SKILL_VERSION_FILE
): SkillVersionManifest {
  if (!existsSync(skillVersionFilePath)) {
    throw new Error(`skill-version.json not found at ${skillVersionFilePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(skillVersionFilePath, "utf-8"));
  } catch (error) {
    throw new Error(
      `Failed to parse skill-version.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const manifest = parsed as SkillVersionManifest;
  if (!manifest.version || !manifest.templateVersion) {
    throw new Error("skill-version.json missing required version or templateVersion field");
  }

  return manifest;
}

/**
 * Load and validate plan mapping file.
 */
export function loadPlanMap(planMapFilePath: string = PLAN_MAP_FILE): PlanMap {
  if (planMapFilePath === PLAN_MAP_FILE && cachedPlanMap) {
    return cachedPlanMap;
  }

  if (!existsSync(planMapFilePath)) {
    throw new Error(`plan-map.json not found at ${planMapFilePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(planMapFilePath, "utf-8"));
  } catch (error) {
    throw new Error(
      `Failed to parse plan-map.json at ${planMapFilePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Invalid plan-map.json format at ${planMapFilePath}: root must be an object`);
  }

  const candidate = parsed as Partial<PlanMap>;
  if (!candidate.plans || typeof candidate.plans !== "object") {
    throw new Error(`Invalid plan-map.json format: missing \"plans\" object`);
  }

  const map: PlanMap = {
    aliases: candidate.aliases ?? {},
    quickDefaults: candidate.quickDefaults ?? {},
    planTiers: candidate.planTiers ?? {},
    plans: candidate.plans as Record<string, PlanConfig>,
  };

  const supportedCodes = Object.keys(map.plans).sort();
  for (const code of supportedCodes) {
    if (!/^[A-K]$/.test(code)) {
      throw new Error(`Invalid plan code in plan-map.json: ${code}. Expected A..K`);
    }

    const plan = map.plans[code];
    if (!plan || typeof plan !== "object") {
      throw new Error(`Invalid plan-map.json entry for ${code}`);
    }

    if (typeof plan.name !== "string" || typeof plan.stack !== "string") {
      throw new Error(`Invalid plan-map.json entry for ${code}: missing name/stack`);
    }

    if (typeof plan.cloudflareNative !== "boolean") {
      throw new Error(`Invalid plan-map.json entry for ${code}: cloudflareNative must be boolean`);
    }

    if (plan.tier && !["core", "preset", "custom"].includes(plan.tier)) {
      throw new Error(`Invalid plan-map.json entry for ${code}: unsupported tier "${plan.tier}"`);
    }
  }

  if (planMapFilePath === PLAN_MAP_FILE) {
    cachedPlanMap = map;
  }

  return map;
}

function normalizeRuntimeProfileToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeAiNativeProfileId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeWebappRenderingModelId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadQuestionPackRuntimeConfig(
  questionPackFilePath: string = QUESTION_PACK_FILE
): QuestionPackRuntimeConfig {
  if (questionPackFilePath === QUESTION_PACK_FILE && cachedQuestionPackRuntimeConfig) {
    return cachedQuestionPackRuntimeConfig;
  }

  if (!existsSync(questionPackFilePath)) {
    throw new Error(`initializer-question-pack not found at ${questionPackFilePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(questionPackFilePath, "utf-8"));
  } catch (error) {
    throw new Error(
      `Failed to parse initializer-question-pack at ${questionPackFilePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Invalid initializer-question-pack format at ${questionPackFilePath}`);
  }

  const config = parsed as QuestionPackRuntimeConfig;
  if (!config.runtimeProfiles || typeof config.runtimeProfiles !== "object") {
    throw new Error(`initializer-question-pack missing runtimeProfiles at ${questionPackFilePath}`);
  }

  if (questionPackFilePath === QUESTION_PACK_FILE) {
    cachedQuestionPackRuntimeConfig = config;
  }

  return config;
}

function resolveRuntimeProfileConfig(
  runtimeProfileLabel: string,
  runtimeMode: string
): RuntimeProfileConfig {
  const config = loadQuestionPackRuntimeConfig();
  const profiles = Object.entries(config.runtimeProfiles ?? {});
  const candidates = [runtimeProfileLabel, runtimeMode]
    .filter((value): value is string => Boolean(value))
    .map(normalizeRuntimeProfileToken);

  for (const [key, profile] of profiles) {
    const keyToken = normalizeRuntimeProfileToken(key);
    const labelToken = normalizeRuntimeProfileToken(profile.label);

    if (
      candidates.includes(keyToken) ||
      candidates.includes(labelToken) ||
      candidates.some((candidate) => candidate.length > 0 && labelToken.startsWith(candidate))
    ) {
      return profile;
    }
  }

  const defaultKey = config.inferredDefaults?.runtimeProfile ?? "plan-only";
  return (
    config.runtimeProfiles?.[defaultKey] ?? {
      label: "Plan-only (recommended)",
      claudePolicy: "(default permissions)",
      codexPolicy: "sandbox_mode=platform-default, approval_policy=on-failure",
    }
  );
}

function renderAiNativeProfileSummary(profileId: string, profile: AiNativeProfileConfig): string {
  return [
    `- Profile: ${profileId} (${profile.label})`,
    `- Purpose: ${profile.description}`,
    `- Frontend: ${profile.frontend}`,
    `- Runtime protocol: ${profile.runtimeProtocol}`,
    `- Backend boundary: ${profile.backend}`,
    `- State default: ${profile.stateDefault}`,
    `- Sidecar policy: ${profile.sidecarPolicy}`,
    `- UI schema: ${profile.uiSchema}`,
  ].join("\n");
}

function renderAiNativeTechStackRows(profile: AiNativeProfileConfig): string {
  if (profile.techStackRows && profile.techStackRows.length > 0) {
    return profile.techStackRows.join("\n");
  }

  return [
    `| AI frontend | ${profile.frontend} |`,
    `| Agent protocol | ${profile.runtimeProtocol} |`,
    `| Agent backend | ${profile.backend} |`,
    `| Agent state | ${profile.stateDefault} |`,
    `| Sidecars | ${profile.sidecarPolicy} |`,
    `| UI schema | ${profile.uiSchema} |`,
  ].join("\n");
}

function renderAiNativeTechStackSection(profileId: string, profile: AiNativeProfileConfig): string {
  return [
    `### AI-native profile: ${profileId} (${profile.label})`,
    "",
    renderAiNativeProfileSummary(profileId, profile),
    "",
    "| Layer | Technology |",
    "|-------|------------|",
    renderAiNativeTechStackRows(profile),
  ].join("\n");
}

function renderWebappRenderingModelSummary(
  modelId: string,
  model: WebappRenderingModelConfig
): string {
  return [
    `- Model: ${modelId} (${model.label})`,
    `- Purpose: ${model.description}`,
    `- Frontend: ${model.frontend}`,
    `- Deployment: ${model.deployment}`,
    `- Public route: ${model.publicRoute}`,
    `- App route: ${model.appRoute}`,
    `- Fallback: ${model.fallback}`,
  ].join("\n");
}

function renderWebappRenderingTechStackRows(model: WebappRenderingModelConfig): string {
  if (model.techStackRows && model.techStackRows.length > 0) {
    return model.techStackRows.join("\n");
  }

  return [
    `| Web frontend | ${model.frontend} |`,
    `| Deploy | ${model.deployment} |`,
    `| Public route | ${model.publicRoute} |`,
    `| App route | ${model.appRoute} |`,
    `| Fallback | ${model.fallback} |`,
  ].join("\n");
}

function renderWebappRenderingTechStackSection(
  modelId: string,
  model: WebappRenderingModelConfig
): string {
  return [
    `### Webapp rendering model: ${modelId} (${model.label})`,
    "",
    renderWebappRenderingModelSummary(modelId, model),
    "",
    "| Boundary | Default |",
    "|----------|---------|",
    renderWebappRenderingTechStackRows(model),
  ].join("\n");
}

export function getWebappRenderingTemplateVariables(
  planType: string,
  variables: Record<string, string> = {},
  planMap: PlanMap = loadPlanMap()
): { enabled: boolean; modelId: string; variables: Record<string, string> } {
  const resolvedPlan = resolvePlanType(planType, planMap);
  const planConfig = planMap.plans[resolvedPlan];
  const questionPack = loadQuestionPackRuntimeConfig();
  const defaultModel =
    planConfig.webappRenderingDefaults?.defaultModel ??
    questionPack.inferredDefaults?.webappRenderingModel ??
    "none";
  const requestedModel = variables.WEBAPP_RENDERING_MODEL ?? defaultModel;
  const modelId = normalizeWebappRenderingModelId(requestedModel || "none") || "none";
  const models = questionPack.webappRenderingModels ?? {};
  const model = models[modelId];

  if (!model) {
    const supported = Object.keys(models).sort().join(", ");
    throw new Error(`Unsupported webapp rendering model: ${requestedModel}. Supported models: ${supported}`);
  }

  if (modelId === "none") {
    return {
      enabled: false,
      modelId,
      variables: {
        WEBAPP_RENDERING_MODEL: "none",
        WEBAPP_RENDERING_MODEL_LABEL: model.label,
        WEBAPP_RENDERING_MODEL_SUMMARY: "",
        WEBAPP_RENDERING_TECH_STACK_TABLE: "",
        WEBAPP_RENDERING_TECH_STACK_SECTION: "",
      },
    };
  }

  const overlayStructure = model.projectStructureFile
    ? readRelativeTextFile(model.projectStructureFile)
    : "";
  const baseStructure = variables.PROJECT_STRUCTURE ?? "";
  const projectStructure = overlayStructure && baseStructure.trim() !== overlayStructure.trim()
    ? `${baseStructure}\n\n# Webapp rendering model: ${modelId}\n${overlayStructure}`.trim()
    : baseStructure;
  const techStackRows = renderWebappRenderingTechStackRows(model);

  return {
    enabled: true,
    modelId,
    variables: {
      PROJECT_STRUCTURE: projectStructure,
      WEBAPP_RENDERING_MODEL: modelId,
      WEBAPP_RENDERING_MODEL_LABEL: model.label,
      WEBAPP_RENDERING_MODEL_SUMMARY: renderWebappRenderingModelSummary(modelId, model),
      WEBAPP_RENDERING_TECH_STACK_TABLE: techStackRows,
      WEBAPP_RENDERING_TECH_STACK_SECTION: renderWebappRenderingTechStackSection(modelId, model),
    },
  };
}

export function getAiNativeTemplateVariables(
  planType: string,
  variables: Record<string, string> = {},
  planMap: PlanMap = loadPlanMap()
): { enabled: boolean; profileId: string; variables: Record<string, string> } {
  const resolvedPlan = resolvePlanType(planType, planMap);
  const planConfig = planMap.plans[resolvedPlan];
  const questionPack = loadQuestionPackRuntimeConfig();
  const defaultProfile =
    planConfig.aiNativeOverlayDefaults?.defaultProfile ??
    questionPack.inferredDefaults?.aiNativeProfile ??
    "none";
  const requestedProfile = variables.AI_NATIVE_PROFILE ?? defaultProfile;
  const profileId = normalizeAiNativeProfileId(requestedProfile || "none") || "none";
  const profiles = questionPack.aiNativeProfiles ?? {};
  const profile = profiles[profileId];

  if (!profile) {
    const supported = Object.keys(profiles).sort().join(", ");
    throw new Error(`Unsupported AI-native profile: ${requestedProfile}. Supported profiles: ${supported}`);
  }

  if (profileId === "none") {
    return {
      enabled: false,
      profileId,
      variables: {
        AI_NATIVE_PROFILE: "none",
        AI_NATIVE_PROFILE_LABEL: profile.label,
        AI_NATIVE_PROFILE_SUMMARY: "",
        AI_NATIVE_TECH_STACK_TABLE: "",
        AI_NATIVE_TECH_STACK_SECTION: "",
      },
    };
  }

  const overlayStructure = profile.projectStructureFile
    ? readRelativeTextFile(profile.projectStructureFile)
    : "";
  const baseStructure = variables.PROJECT_STRUCTURE ?? "";
  const projectStructure = overlayStructure
    ? `${baseStructure}\n\n# AI-native profile overlay: ${profileId}\n${overlayStructure}`.trim()
    : baseStructure;
  const techStackRows = renderAiNativeTechStackRows(profile);

  return {
    enabled: true,
    profileId,
    variables: {
      PROJECT_STRUCTURE: projectStructure,
      AI_NATIVE_PROFILE: profileId,
      AI_NATIVE_PROFILE_LABEL: profile.label,
      AI_NATIVE_PROFILE_SUMMARY: renderAiNativeProfileSummary(profileId, profile),
      AI_NATIVE_TECH_STACK_TABLE: techStackRows,
      AI_NATIVE_TECH_STACK_SECTION: renderAiNativeTechStackSection(profileId, profile),
    },
  };
}

/**
 * Normalize a plan type and resolve aliases.
 */
export function resolvePlanType(rawPlanType: string, planMap: PlanMap = loadPlanMap()): string {
  const normalized = rawPlanType.trim().toUpperCase();
  const aliasResolved = (planMap.aliases?.[normalized] ?? normalized).toUpperCase();

  if (!planMap.plans[aliasResolved]) {
    const supported = Object.keys(planMap.plans).sort().join(", ");
    throw new Error(`Unsupported plan type: ${rawPlanType}. Supported plans: ${supported}`);
  }

  return aliasResolved;
}

/**
 * Get plan tier (core/preset/custom) for UI and Q&A routing.
 */
export function getPlanTier(
  planType: string,
  planMap: PlanMap = loadPlanMap()
): "core" | "preset" | "custom" {
  const resolved = resolvePlanType(planType, planMap);
  return planMap.plans[resolved].tier ?? "core";
}

/**
 * Convenience check for core plans.
 */
export function isCorePlan(planType: string, planMap: PlanMap = loadPlanMap()): boolean {
  return getPlanTier(planType, planMap) === "core";
}

function readRelativeTextFile(relativePath: string): string {
  const absolutePath = join(REPO_ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Referenced file not found: ${relativePath}`);
  }
  return readFileSync(absolutePath, "utf-8").trim();
}

export function isFactorFactoryEnabled(
  planType: string,
  planMap: PlanMap = loadPlanMap()
): boolean {
  const resolvedPlan = resolvePlanType(planType, planMap);
  return planMap.plans[resolvedPlan].factorFactory === true;
}

/**
 * Build default template variables for a plan.
 */
export function getDefaultTemplateVariables(
  planType: string,
  planMap: PlanMap = loadPlanMap(),
  _quickMode = false
): Record<string, string> {
  const resolvedPlan = resolvePlanType(planType, planMap);
  const planConfig = planMap.plans[resolvedPlan];

  const quickDefaults = planMap.quickDefaults ?? {};
  const planDefaults = { ...(planConfig.defaultTemplateVariables ?? {}) };

  if (planDefaults.PROJECT_STRUCTURE_FILE) {
    planDefaults.PROJECT_STRUCTURE = readRelativeTextFile(planDefaults.PROJECT_STRUCTURE_FILE);
    delete planDefaults.PROJECT_STRUCTURE_FILE;
  }

  if (!planDefaults.TECH_STACK_TABLE) {
    planDefaults.TECH_STACK_TABLE = `| Stack | ${planConfig.stack} |`;
  }

  return {
    ...FALLBACK_TEMPLATE_VARIABLES,
    ...quickDefaults,
    PLAN_NAME: planConfig.name,
    PLAN_STACK: planConfig.stack,
    PLAN_TIER: planConfig.tier ?? "core",
    FACTOR_FACTORY_ENABLED: planConfig.factorFactory ? "true" : "false",
    AI_NATIVE_PROFILE: planConfig.aiNativeOverlayDefaults?.defaultProfile ?? FALLBACK_TEMPLATE_VARIABLES.AI_NATIVE_PROFILE,
    WEBAPP_RENDERING_MODEL:
      planConfig.webappRenderingDefaults?.defaultModel ?? FALLBACK_TEMPLATE_VARIABLES.WEBAPP_RENDERING_MODEL,
    ORCHESTRATION_PROFILE:
      planConfig.defaultHarnessProfiles?.orchestration ?? FALLBACK_TEMPLATE_VARIABLES.ORCHESTRATION_PROFILE,
    EVALUATION_PROFILE:
      planConfig.defaultHarnessProfiles?.evaluation ?? FALLBACK_TEMPLATE_VARIABLES.EVALUATION_PROFILE,
    HANDOFF_PROFILE:
      planConfig.defaultHarnessProfiles?.handoff ?? FALLBACK_TEMPLATE_VARIABLES.HANDOFF_PROFILE,
    RECOVERY_PROFILE:
      planConfig.defaultHarnessProfiles?.recovery ?? FALLBACK_TEMPLATE_VARIABLES.RECOVERY_PROFILE,
    STATE_PROFILE:
      planConfig.defaultHarnessProfiles?.state ?? FALLBACK_TEMPLATE_VARIABLES.STATE_PROFILE,
    ...planDefaults,
  };
}

/**
 * Get ordered list of partial files.
 */
export function getPartials(target: TemplateTarget = "claude"): PartialInfo[] {
  const partialDir = TARGET_DIRS[target];

  if (!existsSync(partialDir)) {
    throw new Error(`Partials directory not found for target "${target}": ${partialDir}`);
  }

  const files = readdirSync(partialDir).filter(
    (f) => f.endsWith(".partial.md") && /^\d{2}-/.test(f)
  );

  if (files.length === 0) {
    throw new Error(`No partial files found for target "${target}" in ${partialDir}`);
  }

  return files
    .map((f) => {
      const order = parseInt(f.substring(0, 2), 10);
      const name = f.replace(".partial.md", "");
      const conditional = name.includes("cloudflare")
        ? "CLOUDFLARE_NATIVE"
        : name.includes("factor-factory")
          ? "FACTOR_FACTORY_ENABLED"
          : undefined;

      return {
        name,
        path: join(partialDir, f),
        order,
        conditional,
      };
    })
    .sort((a, b) => a.order - b.order);
}

/**
 * Read a partial file content.
 */
export function readPartial(partialPath: string): string {
  if (!existsSync(partialPath)) {
    throw new Error(`Partial not found: ${partialPath}`);
  }
  return readFileSync(partialPath, "utf-8");
}

/**
 * Determine if Cloudflare section should be included.
 */
export function shouldIncludeCloudflare(planType: string, explicitFlag?: boolean): boolean {
  if (explicitFlag !== undefined) {
    return explicitFlag;
  }

  const planMap = loadPlanMap();
  const resolvedPlan = resolvePlanType(planType, planMap);
  return planMap.plans[resolvedPlan].cloudflareNative;
}

/**
 * Replace variables in template content.
 * Format: {{VARIABLE_NAME}} -> value
 */
export function replaceVariables(
  content: string,
  variables: Record<string, string>
): string {
  let result = content;
  let iterations = 0;
  const maxIterations = 3; // Allow nested placeholders inside substituted content

  while (iterations < maxIterations) {
    let changed = false;

    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      const newResult = result.replace(pattern, value);
      if (newResult !== result) {
        changed = true;
        result = newResult;
      }
    }

    if (!changed) break;
    iterations++;
  }

  return result;
}

/**
 * Process conditional blocks with nested support.
 * Format: {{#IF CONDITION}}...content...{{/IF}}
 */
export function processConditionals(
  content: string,
  conditions: Record<string, boolean>
): string {
  const closeTag = "{{/IF}}";
  let result = content;
  let iterations = 0;

  while (true) {
    const closeIndex = result.indexOf(closeTag);
    const hasOpenTag = result.includes("{{#IF");

    if (closeIndex === -1) {
      if (hasOpenTag) {
        throw new Error("Malformed conditional block: missing {{/IF}}");
      }
      break;
    }

    const head = result.slice(0, closeIndex);
    const matches = [...head.matchAll(/\{\{#IF\s+(\w+)\}\}/g)];

    if (matches.length === 0) {
      throw new Error("Malformed conditional block: unexpected {{/IF}}");
    }

    const openMatch = matches[matches.length - 1];
    const openTag = openMatch[0];
    const condition = openMatch[1];
    const openStart = openMatch.index as number;
    const openEnd = openStart + openTag.length;

    const innerContent = result.slice(openEnd, closeIndex);
    const shouldInclude = conditions[condition] ?? false;
    const replacement = shouldInclude ? innerContent : "";

    result =
      result.slice(0, openStart) +
      replacement +
      result.slice(closeIndex + closeTag.length);

    iterations++;
    if (iterations > 10000) {
      throw new Error("Conditional processing exceeded safe iteration limit");
    }
  }

  if (result.includes("{{/IF}}")) {
    throw new Error("Malformed conditional block: unexpected {{/IF}}");
  }

  return result;
}

/**
 * Validate unresolved placeholders after substitution.
 */
export function assertNoUnresolvedVariables(content: string): void {
  const matches = content.match(/\{\{[^{}]+\}\}/g) ?? [];
  const unresolved = [...new Set(matches)]
    .filter(
      (token) => !ALLOWED_UNRESOLVED_PATTERNS.some((pattern) => pattern.test(token))
    )
    .sort();

  if (unresolved.length > 0) {
    throw new Error(`Unresolved template variables: ${unresolved.join(", ")}`);
  }
}

/**
 * Main assembly function.
 */
export function assembleTemplate(options: AssemblyOptions): string {
  const { planType, variables, cloudflareNative, target = "claude", quickMode = false } = options;

  const planMap = loadPlanMap();
  const resolvedPlanType = resolvePlanType(planType, planMap);

  // Load version variables
  const versions = loadVersions();
  const skillVersion = loadSkillVersion();

  // Merge all variables (user variables take precedence)
  const mergedVariables: Record<string, string> = {
    ...versions,
    ...getDefaultTemplateVariables(resolvedPlanType, planMap, quickMode),
    ...variables,
    PLAN_TYPE: resolvedPlanType,
    SKILL_VERSION: skillVersion.version,
    TEMPLATE_VERSION: skillVersion.templateVersion,
  };

  const webappRenderingModel = getWebappRenderingTemplateVariables(
    resolvedPlanType,
    mergedVariables,
    planMap
  );
  const variablesWithWebappRendering: Record<string, string> = {
    ...mergedVariables,
    ...webappRenderingModel.variables,
  };

  const aiNativeProfile = getAiNativeTemplateVariables(
    resolvedPlanType,
    variablesWithWebappRendering,
    planMap
  );

  const runtimeProfileConfig = resolveRuntimeProfileConfig(
    variablesWithWebappRendering.RUNTIME_PROFILE ?? "",
    variablesWithWebappRendering.RUNTIME_MODE ?? ""
  );

  const allVariables: Record<string, string> = {
    ...variablesWithWebappRendering,
    ...aiNativeProfile.variables,
    CLAUDE_POLICY:
      variablesWithWebappRendering.CLAUDE_POLICY ?? runtimeProfileConfig.claudePolicy,
    CODEX_POLICY:
      variablesWithWebappRendering.CODEX_POLICY ?? runtimeProfileConfig.codexPolicy,
  };

  // Get partials
  const partials = getPartials(target);

  // Determine conditions
  const includeCloudflare = shouldIncludeCloudflare(resolvedPlanType, cloudflareNative);
  const includeFactorFactory = isFactorFactoryEnabled(resolvedPlanType, planMap);
  const conditions: Record<string, boolean> = {
    CLOUDFLARE_NATIVE: includeCloudflare,
    FACTOR_FACTORY_ENABLED: includeFactorFactory,
    WEBAPP_RENDERING_MODEL_ENABLED: webappRenderingModel.enabled,
    AI_NATIVE_PROFILE_ENABLED: aiNativeProfile.enabled,
  };

  // Concatenate partials
  const parts: string[] = [];

  for (const partial of partials) {
    // Skip conditional partials if condition is false
    if (partial.conditional && !conditions[partial.conditional]) {
      continue;
    }

    const content = readPartial(partial.path);
    parts.push(content);
  }

  let assembled = parts.join("\n\n");

  // Process conditionals first
  assembled = processConditionals(assembled, conditions);

  // Then replace variables
  assembled = replaceVariables(assembled, allVariables);

  // Fail fast on unresolved placeholders (except explicit whitelist)
  assertNoUnresolvedVariables(assembled);

  return assembled;
}

// ============================================================================
// CLI
// ============================================================================

function supportedPlansText(): string {
  try {
    return Object.keys(loadPlanMap().plans).sort().join(", ");
  } catch {
    return "A, B, C, D, E, F, G, H, I, J, K";
  }
}

function printHelp() {
  console.log(`
Template Assembly Script

Usage:
  bun scripts/assemble-template.ts [options]

Options:
  --help              Show this help message
  --target <name>     Output target: claude (default) | agents
  --plan <type>       Plan type (${supportedPlansText()})
  --name <name>       Project name
  --quick             Quick mode (inject defaults for minimal Q&A)
  --no-cloudflare     Exclude Cloudflare section
  --cloudflare        Include Cloudflare section
  --var KEY=VALUE     Set a template variable

Examples:
  bun scripts/assemble-template.ts --plan C --name MyProject
  bun scripts/assemble-template.ts --target agents --plan C --name MyProject
  bun scripts/assemble-template.ts --plan B --name CRM --no-cloudflare
  bun scripts/assemble-template.ts --plan C --quick --var USER_NAME=John
`);
}

function parseArgs(args: string[]): {
  help: boolean;
  target: TemplateTarget;
  plan: string;
  name: string;
  quick: boolean;
  cloudflare: boolean | undefined;
  variables: Record<string, string>;
} {
  const result = {
    help: false,
    target: "claude" as TemplateTarget,
    plan: "C",
    name: "MyProject",
    quick: false,
    cloudflare: undefined as boolean | undefined,
    variables: {} as Record<string, string>,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--help":
      case "-h":
        result.help = true;
        break;
      case "--target": {
        const targetValue = args[++i] || "claude";
        result.target = parseTarget(targetValue);
        break;
      }
      case "--plan":
        result.plan = args[++i] || "C";
        break;
      case "--name":
        result.name = args[++i] || "MyProject";
        break;
      case "--quick":
        result.quick = true;
        break;
      case "--no-cloudflare":
        result.cloudflare = false;
        break;
      case "--cloudflare":
        result.cloudflare = true;
        break;
      case "--var": {
        const varArg = args[++i];
        if (varArg && varArg.includes("=")) {
          const [key, ...valueParts] = varArg.split("=");
          result.variables[key] = valueParts.join("=");
        }
        break;
      }
    }
  }

  return result;
}

// Main entry point (only runs when executed directly)
if (import.meta.main) {
  const args = process.argv.slice(2);

  try {
    const parsed = parseArgs(args);

    if (parsed.help) {
      printHelp();
      process.exit(0);
    }

    const options: AssemblyOptions = {
      planType: parsed.plan,
      target: parsed.target,
      quickMode: parsed.quick,
      variables: {
        PROJECT_NAME: parsed.name,
        ...parsed.variables,
      },
      cloudflareNative: parsed.cloudflare,
    };

    const output = assembleTemplate(options);
    console.log(output);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
