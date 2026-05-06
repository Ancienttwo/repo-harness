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
  };
  helpers: {
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
    planDirectory: string;
    progressLedger: string;
    taskChecklist: string;
    researchNotes: string;
    lessonsLog: string;
  };
  migrations: {
    legacyVersions: string[];
    legacyPaths: string[];
  };
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ASSET_PATH = join(SCRIPT_DIR, "..", "assets", "workflow-contract.v1.json");

export function loadWorkflowContract(contractPath = DEFAULT_ASSET_PATH): WorkflowContract {
  return JSON.parse(readFileSync(contractPath, "utf-8")) as WorkflowContract;
}

export function resolveInstalledWorkflowContract(repoRoot: string): string {
  return join(repoRoot, ".ai", "harness", "workflow-contract.json");
}

export function resolveWorkflowContractForRepo(repoRoot: string): string {
  const installedPath = resolveInstalledWorkflowContract(repoRoot);
  return existsSync(installedPath) ? installedPath : DEFAULT_ASSET_PATH;
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
  const contract = loadWorkflowContract(process.argv[2] || DEFAULT_ASSET_PATH);
  console.log(JSON.stringify(contract, null, 2));
}
