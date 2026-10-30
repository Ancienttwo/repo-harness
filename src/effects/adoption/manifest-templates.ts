import { basename, resolve } from "path";
import { loadWorkflowContractAsset } from "../../core/adoption/workflow-contract-asset";

export type AdoptionTemplateKey = "spec" | "lessonsLog";

export interface AdoptionTemplateFile {
  readonly path: string;
  readonly content: string;
  readonly reason: string;
}

interface WorkflowContractAdoptionTemplate {
  readonly document: string;
  readonly reason: string;
  readonly lines: readonly string[];
}

interface WorkflowContractForAdoptionTemplates {
  readonly documents: Record<string, string>;
  readonly adoptionTemplates?: {
    readonly files?: Record<string, WorkflowContractAdoptionTemplate>;
  };
}

function repoName(repoRoot: string): string {
  return basename(resolve(repoRoot)) || "repo";
}

function renderTemplate(lines: readonly string[], repoRoot: string): string {
  const variables = {
    repoName: repoName(repoRoot),
  };
  return `${lines
    .map((line) => line.replaceAll("{{repoName}}", variables.repoName))
    .join("\n")
    .trimEnd()}\n`;
}

function loadWorkflowContract(): WorkflowContractForAdoptionTemplates {
  return loadWorkflowContractAsset<WorkflowContractForAdoptionTemplates>();
}

export function adoptionTemplateFile(repoRoot: string, key: AdoptionTemplateKey): AdoptionTemplateFile {
  const contract = loadWorkflowContract();
  const template = contract.adoptionTemplates?.files?.[key];
  if (!template) {
    throw new Error(`workflow contract adoption template missing: ${key}`);
  }

  const path = contract.documents[template.document];
  if (!path) {
    throw new Error(`workflow contract document path missing: ${template.document}`);
  }

  return {
    path,
    content: renderTemplate(template.lines, repoRoot),
    reason: template.reason,
  };
}
