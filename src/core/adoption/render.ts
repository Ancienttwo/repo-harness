import { createHash } from "crypto";
import type { AdoptionOperation, AdoptionPlan } from "./operations";
import { rollbackMetadataForOperation } from "./rollback";

function contentHash(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function contentPreview(content: string): string {
  const firstLines = content.split("\n").slice(0, 3).join("\n").trimEnd();
  return firstLines.length > 160 ? `${firstLines.slice(0, 157)}...` : firstLines;
}

function renderOperation(operation: AdoptionOperation): Record<string, unknown> {
  const rollback = operation.rollback ?? rollbackMetadataForOperation(operation);
  if (operation.kind === "writeFile") {
    const { content: _content, ...rest } = operation;
    return {
      ...rest,
      rollback,
      contentHash: contentHash(operation.content),
      contentPreview: contentPreview(operation.content),
    };
  }
  if (operation.kind === "appendManagedBlock") {
    const { content: _content, ...rest } = operation;
    return {
      ...rest,
      rollback,
      contentHash: contentHash(operation.content),
      contentPreview: contentPreview(operation.content),
    };
  }
  return { ...operation, rollback };
}

export function renderAdoptionPlanObject(plan: AdoptionPlan): Record<string, unknown> {
  return {
    protocol: plan.protocol,
    command: plan.command,
    repoRoot: plan.repoRoot,
    mode: plan.mode,
    apply: plan.apply,
    operations: plan.operations.map(renderOperation),
    summary: plan.summary,
    warnings: plan.warnings,
  };
}

export function renderAdoptionPlanJson(plan: AdoptionPlan): string {
  return `${JSON.stringify(renderAdoptionPlanObject(plan), null, 2)}\n`;
}

export function renderAdoptionPlanText(plan: AdoptionPlan): string {
  const lines = [
    `[adopt-plan] repo: ${plan.repoRoot}`,
    `[adopt-plan] mode: ${plan.mode}`,
    `[adopt-plan] apply: ${plan.apply ? "yes" : "no"}`,
    `[adopt-plan] operations: ${plan.summary.total}`,
  ];
  for (const [kind, count] of Object.entries(plan.summary.byKind).sort()) {
    lines.push(`[adopt-plan] ${kind}: ${count}`);
  }
  for (const warning of plan.warnings) {
    lines.push(`[adopt-plan] warning(${warning.risk}): ${warning.message}`);
  }
  return `${lines.join("\n")}\n`;
}
