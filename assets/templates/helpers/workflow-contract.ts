import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
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
    runtimeDirectory?: string;
    runtimeSource?: string;
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

export function resolveAgenticDevRoot(_repoRoot = REPO_ROOT): string {
  const configuredRoot =
    process.env.AGENTIC_DEV_ROOT ||
    process.env.AGENTIC_DEV_SKILL_ROOT;
  if (configuredRoot && configuredRoot.length > 0) return configuredRoot;

  if (existsSync(LOCAL_ASSET_PATH)) return REPO_ROOT;

  const home = process.env.HOME;
  if (home && home.length > 0) {
    const candidates = [
      join(home, "Projects", "repo-harness"),
      join(home, ".codex", "skills", "repo-harness"),
      join(home, ".claude", "skills", "repo-harness"),
      join(home, ".agents", "skills", "repo-harness"),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }

    return candidates[0];
  }

  return "/Users/ancienttwo/.agents/skills/repo-harness";
}

export function resolveAgenticDevSkillRoot(repoRoot = REPO_ROOT): string {
  return resolveAgenticDevRoot(repoRoot);
}

export function resolveUpstreamWorkflowContract(repoRoot = REPO_ROOT): string {
  if (existsSync(LOCAL_ASSET_PATH)) return LOCAL_ASSET_PATH;
  return join(resolveAgenticDevRoot(repoRoot), "assets", "workflow-contract.v1.json");
}

export function loadWorkflowContract(
  contractPath = resolveUpstreamWorkflowContract()
): WorkflowContract {
  return JSON.parse(readFileSync(contractPath, "utf-8")) as WorkflowContract;
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

export function getHelperRuntimeDir(contract: WorkflowContract): string {
  return contract.helpers.runtimeDirectory ?? "package:assets/templates/helpers";
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
