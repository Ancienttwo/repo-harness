import { resolve } from "path";
import type { AdoptionMode } from "../../core/adoption/modes";
import { planAdoption } from "../../core/adoption/plan";
import type { AdoptionOperation, AdoptionPlan } from "../../core/adoption/operations";
import { renderAdoptionPlanJson, renderAdoptionPlanObject, renderAdoptionPlanText } from "../../core/adoption/render";
import { applyAdoptionPlan, isSupportedAdoptionOperation, type ApplyAdoptionPlanResult } from "../../effects/fs-transaction";
import { registerRepoHarnessRepo, type RepoHarnessRegisterResult } from "../../effects/repo-registry";
import { validateRepoAdoptionTarget } from "./init";

export interface RunAdoptionPlanOptions {
  readonly repo?: string;
  readonly mode: AdoptionMode;
  readonly json?: boolean;
  readonly explicitRepo?: boolean;
  readonly reclaimRuntime?: boolean;
  readonly compact?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export interface RunAdoptionPlanResult {
  readonly exitCode: number;
  readonly output: string;
}

interface RunExperimentalTsApplyResult {
  readonly exitCode: number;
  readonly output: string;
}

interface ExperimentalTsApplyReport {
  readonly protocol: 1;
  readonly command: "adopt";
  readonly experimentalTsApply: true;
  readonly repoRoot: string;
  readonly mode: AdoptionMode;
  readonly ok: boolean;
  readonly plan: Record<string, unknown>;
  readonly apply?: ApplyAdoptionPlanResult;
  readonly registration?: RepoHarnessRegisterResult;
  readonly unsupportedOperations?: readonly Record<string, unknown>[];
}

function targetErrorMessage(targetError: NonNullable<ReturnType<typeof validateRepoAdoptionTarget>>): string {
  return `${targetError.step}${targetError.detail ? ` - ${targetError.detail}` : ""}`;
}

function renderTargetError(
  repoRoot: string,
  targetError: NonNullable<ReturnType<typeof validateRepoAdoptionTarget>>,
  json = false,
): RunAdoptionPlanResult {
  const message = targetErrorMessage(targetError);
  if (json) {
    return {
      exitCode: 2,
      output: `${JSON.stringify(
        {
          protocol: 1,
          command: "adopt",
          ok: false,
          repoRoot,
          errors: [
            {
              code: "invalid_repo_target",
              message,
            },
          ],
          operations: [],
          summary: {
            total: 0,
            byKind: {},
            byStatus: {},
            plannedTotal: 0,
            skippedTotal: 0,
            failedTotal: 0,
          },
        },
        null,
        2,
      )}\n`,
    };
  }
  return {
    exitCode: 2,
    output: `[init] failed: ${message}\n`,
  };
}

export function runAdoptionPlan(opts: RunAdoptionPlanOptions): RunAdoptionPlanResult {
  const repoRoot = resolve(opts.repo ?? process.cwd());
  const targetError = validateRepoAdoptionTarget(repoRoot, opts.explicitRepo === true, opts.env);
  if (targetError) {
    return renderTargetError(repoRoot, targetError, opts.json === true);
  }

  const plan = planAdoption({
    repoRoot,
    mode: opts.mode,
    apply: false,
  });

  return {
    exitCode: 0,
    output: opts.json === true ? renderAdoptionPlanJson(plan) : renderAdoptionPlanText(plan),
  };
}

function unsupportedSafeApplicatorOperations(plan: AdoptionPlan): readonly AdoptionOperation[] {
  return plan.operations.filter((operation) => !isSupportedAdoptionOperation(operation));
}

function renderExperimentalTsApplyText(report: ExperimentalTsApplyReport): string {
  const lines = [
    `[adopt-ts-apply] repo: ${report.repoRoot}`,
    `[adopt-ts-apply] mode: ${report.mode}`,
    `[adopt-ts-apply] ok: ${report.ok ? "yes" : "no"}`,
  ];
  if (report.unsupportedOperations?.length) {
    lines.push(`[adopt-ts-apply] unsupported: ${report.unsupportedOperations.length}`);
    for (const operation of report.unsupportedOperations) {
      lines.push(`[adopt-ts-apply] unsupported operation: ${operation.id}`);
    }
  }
  if (report.apply) {
    const counts = report.apply.results.reduce<Record<string, number>>((acc, result) => {
      acc[result.status] = (acc[result.status] ?? 0) + 1;
      return acc;
    }, {});
    for (const [status, count] of Object.entries(counts).sort()) {
      lines.push(`[adopt-ts-apply] ${status}: ${count}`);
    }
    for (const result of report.apply.results.filter((entry) => entry.status === "failed")) {
      lines.push(`[adopt-ts-apply] failed operation: ${result.id}${result.error ? ` - ${result.error}` : ""}`);
    }
  }
  if (report.registration) {
    lines.push(`[adopt-ts-apply] registry: ${report.registration.registered ? "registered" : "skipped"}${report.registration.reason ? ` - ${report.registration.reason}` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderExperimentalTsApply(report: ExperimentalTsApplyReport, json = false): string {
  return json ? `${JSON.stringify(report, null, 2)}\n` : renderExperimentalTsApplyText(report);
}

export function runExperimentalTsApply(opts: RunAdoptionPlanOptions): RunExperimentalTsApplyResult {
  const repoRoot = resolve(opts.repo ?? process.cwd());
  const targetError = validateRepoAdoptionTarget(repoRoot, opts.explicitRepo === true, opts.env);
  if (targetError) {
    return renderTargetError(repoRoot, targetError, opts.json === true);
  }

  const plan = planAdoption({
    repoRoot,
    mode: opts.mode,
    apply: true,
  });
  const unsupportedOperations = unsupportedSafeApplicatorOperations(plan);
  if (unsupportedOperations.length > 0) {
    const report: ExperimentalTsApplyReport = {
      protocol: 1,
      command: "adopt",
      experimentalTsApply: true,
      repoRoot,
      mode: opts.mode,
      ok: false,
      plan: renderAdoptionPlanObject(plan),
      unsupportedOperations: unsupportedOperations.map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        path: operation.path,
        reason: operation.reason,
      })),
    };
    return { exitCode: 1, output: renderExperimentalTsApply(report, opts.json === true) };
  }

  const apply = applyAdoptionPlan(plan);
  const registration = apply.ok ? registerRepoHarnessRepo(repoRoot, "adopt", { env: opts.env }) : undefined;
  const report: ExperimentalTsApplyReport = {
    protocol: 1,
    command: "adopt",
    experimentalTsApply: true,
    repoRoot,
    mode: opts.mode,
    ok: apply.ok,
    plan: renderAdoptionPlanObject(plan),
    apply,
    registration,
  };
  return {
    exitCode: apply.ok ? 0 : 1,
    output: renderExperimentalTsApply(report, opts.json === true),
  };
}
