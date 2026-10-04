import { existsSync, readFileSync } from "fs";
import { dirname, extname, isAbsolute, join } from "path";
import { fileURLToPath } from "url";

export type WorkflowContract = {
  version: string;
  contractId: string;
  compatibility: {
    agents: string[];
    repoLocalFirst: boolean;
  };
  externalTooling?: {
    waza?: {
      sourceRepo: string;
      managedSkills: string[];
      primaryHost: string;
      codexPrimaryPath: string;
      stagingCachePath: string;
      syncMode: string;
      hostDriftPolicy: string;
    };
    codexAutomationProfile?: {
      requiredSkills: string[];
      optionalSkills: string[];
      mode: string;
      source: string;
      routes: {
        workflowHealth: string;
        reviewGate: string;
        architectureDiagram: string;
      };
      vendoringPolicy: string;
    };
    diagramDesign?: {
      skillName: string;
      primaryHost: string;
      codexPrimaryPath: string;
      syncMode: string;
      vendoringPolicy: string;
    };
  };
  agenticDevelopment?: {
    routing: {
      productDiscovery: string;
      complexEngineeringPlan: string;
      designPlan: string;
      smallOrMediumPlan: string;
      bugOrRegression: string;
      postImplementationReview: string;
    };
    dueDiligence: {
      levels: string[];
      explicitReportRequiredFor: string[];
    };
  };
  documentation?: {
    referenceConfigs?: {
      source: string;
      repoStubDirectory: string;
      packageDirectory: string;
      resolverCommand: string;
      stubMarker: string;
    };
  };
  helpers: {
    runtimeDirectory: string;
    runtimeSource: string;
    scripts: string[];
  };
  artifacts: {
    runtimeManifest: string;
    requiredDirectories: string[];
    requiredFiles: string[];
    runtimeFiles?: string[];
  };
  documents: {
    spec: string;
    currentStatus?: string;
    planDirectory: string;
    taskChecklist?: string;
    deferredGoalLedger?: string;
    researchReportsDirectory: string;
    lessonsLog: string;
  };
  adoptionTemplates?: {
    files?: Record<
      string,
      {
        document: string;
        reason: string;
        lines: string[];
      }
    >;
  };
  migrations: {
    legacyVersions: string[];
    legacyPaths: string[];
    upgrade?: {
      strategyVersion: number;
      supportedLegacyVersions: string[];
      actionClasses: string[];
      safety: {
        removeOnlyOwnership: string;
        unknownFiles: string;
        customHooks: string;
        ignoredReferenceMaterial: string;
        localSecrets: string;
      };
      actions: Array<{
        id: string;
        signal: string;
        action: "preserve" | "archive" | "reconfigure" | "remove";
        risk: "low" | "medium" | "high";
        ownership: "known_generated" | "managed_config" | "user_authored" | "user_local";
        paths: string[];
        targetPaths?: string[];
        cleanupMode?: "always" | "generated_helper";
        summary: string;
      }>;
    };
  };
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = SCRIPT_DIR.endsWith("/assets/templates/helpers")
  ? join(SCRIPT_DIR, "../../..")
  : join(SCRIPT_DIR, "..");
const LOCAL_ASSET_PATH = join(REPO_ROOT, "assets", "workflow-contract.v1.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string, contractPath: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`invalid workflow contract at ${contractPath}: ${field} must be an object`);
  }
  return value;
}

function requireString(value: unknown, field: string, contractPath: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`invalid workflow contract at ${contractPath}: ${field} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string, contractPath: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`invalid workflow contract at ${contractPath}: ${field} must be an array of non-empty strings`);
  }
  return value;
}

function validateHelperInventory(entries: string[], contractPath: string): void {
  const fileNames = new Set<string>();
  const helperIds = new Set<string>();

  for (const entry of entries) {
    if (
      entry.includes("/") ||
      entry.includes("\\") ||
      entry === "." ||
      entry === ".." ||
      ![".sh", ".ts"].includes(extname(entry))
    ) {
      throw new Error(
        `invalid workflow contract at ${contractPath}: helpers.scripts contains unsafe helper name ${JSON.stringify(entry)}`,
      );
    }
    if (fileNames.has(entry)) {
      throw new Error(`invalid workflow contract at ${contractPath}: duplicate helper file ${JSON.stringify(entry)}`);
    }
    fileNames.add(entry);

    const id = entry.slice(0, -extname(entry).length);
    if (!id) {
      throw new Error(
        `invalid workflow contract at ${contractPath}: helpers.scripts contains empty helper id ${JSON.stringify(entry)}`,
      );
    }
    if (helperIds.has(id)) {
      throw new Error(`invalid workflow contract at ${contractPath}: duplicate helper id ${JSON.stringify(id)}`);
    }
    helperIds.add(id);
  }
}

function validateWorkflowContract(value: unknown, contractPath: string): WorkflowContract {
  const contract = requireRecord(value, "root", contractPath);
  requireString(contract.version, "version", contractPath);
  requireString(contract.contractId, "contractId", contractPath);
  requireRecord(contract.compatibility, "compatibility", contractPath);

  const helpers = requireRecord(contract.helpers, "helpers", contractPath);
  const helperScripts = requireStringArray(helpers.scripts, "helpers.scripts", contractPath);
  validateHelperInventory(helperScripts, contractPath);
  requireString(helpers.runtimeDirectory, "helpers.runtimeDirectory", contractPath);
  requireString(helpers.runtimeSource, "helpers.runtimeSource", contractPath);

  const artifacts = requireRecord(contract.artifacts, "artifacts", contractPath);
  requireString(artifacts.runtimeManifest, "artifacts.runtimeManifest", contractPath);
  requireStringArray(artifacts.requiredDirectories, "artifacts.requiredDirectories", contractPath);
  requireStringArray(artifacts.requiredFiles, "artifacts.requiredFiles", contractPath);
  if (artifacts.runtimeFiles !== undefined) {
    requireStringArray(artifacts.runtimeFiles, "artifacts.runtimeFiles", contractPath);
  }

  requireRecord(contract.documents, "documents", contractPath);
  const migrations = requireRecord(contract.migrations, "migrations", contractPath);
  requireStringArray(migrations.legacyVersions, "migrations.legacyVersions", contractPath);
  requireStringArray(migrations.legacyPaths, "migrations.legacyPaths", contractPath);

  return value as WorkflowContract;
}

export function resolveAgenticDevRoot(_repoRoot = REPO_ROOT): string {
  const configuredRoot = process.env.REPO_HARNESS_SOURCE_ROOT?.trim();
  if (configuredRoot) {
    if (!isAbsolute(configuredRoot)) {
      throw new Error("REPO_HARNESS_SOURCE_ROOT must be an absolute path");
    }
    const configuredContract = join(configuredRoot, "assets", "workflow-contract.v1.json");
    if (!existsSync(configuredContract)) {
      throw new Error(`REPO_HARNESS_SOURCE_ROOT has no workflow contract: ${configuredContract}`);
    }
    return configuredRoot;
  }

  if (existsSync(LOCAL_ASSET_PATH)) return REPO_ROOT;

  throw new Error(
    `repo-harness package workflow contract is missing: ${LOCAL_ASSET_PATH}; ` +
    "set REPO_HARNESS_SOURCE_ROOT to an explicit source checkout",
  );
}

export function resolveUpstreamWorkflowContract(repoRoot = REPO_ROOT): string {
  return join(resolveAgenticDevRoot(repoRoot), "assets", "workflow-contract.v1.json");
}

export function loadWorkflowContract(
  contractPath = resolveUpstreamWorkflowContract()
): WorkflowContract {
  let source: string;
  try {
    source = readFileSync(contractPath, "utf-8");
  } catch {
    throw new Error(`workflow contract not found: ${contractPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid workflow contract JSON at ${contractPath}: ${message}`);
  }

  return validateWorkflowContract(parsed, contractPath);
}

export function resolveInstalledWorkflowContract(repoRoot: string): string {
  return join(repoRoot, ".ai", "harness", "workflow-contract.json");
}

export function resolveWorkflowContractForRepo(repoRoot: string): string {
  const installedPath = resolveInstalledWorkflowContract(repoRoot);
  return existsSync(installedPath) ? installedPath : resolveUpstreamWorkflowContract(repoRoot);
}

export function getHelperScripts(contract: WorkflowContract): string[] {
  return [...contract.helpers.scripts];
}

export function getRequiredDirectories(contract: WorkflowContract): string[] {
  return [...contract.artifacts.requiredDirectories];
}

export function getRequiredFiles(contract: WorkflowContract): string[] {
  return [...contract.artifacts.requiredFiles];
}

if (import.meta.main) {
  const contract = loadWorkflowContract(process.argv[2] || resolveUpstreamWorkflowContract());
  console.log(JSON.stringify(contract, null, 2));
}
