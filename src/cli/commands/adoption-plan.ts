import { join, resolve } from "path";
import type { AdoptionMode } from "../../core/adoption/modes";
import type { AdoptionPlan } from "../../core/adoption/operations";
import { planAdoption } from "../../effects/adoption/plan";
import { renderAdoptionPlanJson, renderAdoptionPlanObject, renderAdoptionPlanText } from "../../core/adoption/render";
import { applyAdoptionPlan, type ApplyAdoptionPlanResult } from "../../effects/fs-transaction";
import { registerRepoHarnessRepo, type RepoHarnessRegisterResult } from "../../effects/repo-registry";
import { validateRepoAdoptionTarget } from "../repo-adoption/target";

export interface RunAdoptionPlanOptions {
  readonly repo?: string;
  readonly mode: AdoptionMode;
  readonly json?: boolean;
  readonly explicitRepo?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export interface RunAdoptionPlanResult {
  readonly exitCode: number;
  readonly output: string;
}

export interface AdoptionApplyReport {
  readonly protocol: 1;
  readonly command: "init";
  readonly repoRoot: string;
  readonly mode: AdoptionMode;
  readonly ok: boolean;
  readonly plan: Record<string, unknown>;
  readonly apply?: ApplyAdoptionPlanResult;
  readonly registration?: RepoHarnessRegisterResult;
  readonly errors?: readonly { readonly code: string; readonly message: string }[];
}

export interface RunAdoptionApplyResult extends RunAdoptionPlanResult {
  readonly report: AdoptionApplyReport;
}

function targetErrorMessage(targetError: NonNullable<ReturnType<typeof validateRepoAdoptionTarget>>): string {
  return `${targetError.step}${targetError.detail ? ` - ${targetError.detail}` : ""}`;
}

function errorOutput(
  repoRoot: string,
  mode: AdoptionMode,
  code: string,
  message: string,
  json = false,
): RunAdoptionPlanResult {
  if (json) {
    return {
      exitCode: 2,
      output: `${JSON.stringify({
        protocol: 1,
        command: "init",
        ok: false,
        repoRoot,
        mode,
        errors: [{ code, message }],
        operations: [],
        summary: { total: 0, byKind: {}, byStatus: {}, plannedTotal: 0, skippedTotal: 0, failedTotal: 0 },
      }, null, 2)}\n`,
    };
  }
  return { exitCode: 2, output: `[init] failed: ${message}\n` };
}

export type RepoAdoptionPlanOutcome =
  | { readonly repoRoot: string; readonly plan: AdoptionPlan; readonly error?: undefined }
  | { readonly repoRoot: string; readonly plan?: undefined; readonly error: { readonly code: string; readonly message: string } };

/** The structured plan behind `init --dry-run`; it writes nothing. */
export function planRepoAdoption(opts: RunAdoptionPlanOptions): RepoAdoptionPlanOutcome {
  const repoRoot = resolve(opts.repo ?? process.cwd());
  const targetError = validateRepoAdoptionTarget(repoRoot, opts.explicitRepo === true, opts.env);
  if (targetError) return { repoRoot, error: { code: "invalid_repo_target", message: targetErrorMessage(targetError) } };
  try {
    return { repoRoot, plan: planAdoption({ repoRoot, mode: opts.mode, apply: false, env: opts.env }) };
  } catch (error) {
    return { repoRoot, error: { code: "invalid_adoption_plan", message: error instanceof Error ? error.message : String(error) } };
  }
}

function createPlan(opts: RunAdoptionPlanOptions) {
  const planned = planRepoAdoption(opts);
  if (planned.error) {
    return { repoRoot: planned.repoRoot, error: errorOutput(planned.repoRoot, opts.mode, planned.error.code, planned.error.message, opts.json === true) };
  }
  return { repoRoot: planned.repoRoot, plan: planned.plan };
}

export function runAdoptionPlan(opts: RunAdoptionPlanOptions): RunAdoptionPlanResult {
  const created = createPlan(opts);
  if (created.error) return created.error;
  const plan = created.plan!;
  return {
    exitCode: 0,
    output: opts.json === true ? renderAdoptionPlanJson(plan) : renderAdoptionPlanText(plan),
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function renderApplyReport(report: AdoptionApplyReport, json = false): string {
  if (json) return `${JSON.stringify(report, null, 2)}\n`;
  const lines = [
    `[init] repo: ${report.repoRoot}`,
    `[init] mode: ${report.mode}`,
    `[init] ok: ${report.ok ? "yes" : "no"}`,
  ];
  for (const error of report.errors ?? []) lines.push(`[init] failed: ${error.code} - ${error.message}`);
  if (report.apply) {
    const counts = report.apply.results.reduce<Record<string, number>>((acc, result) => {
      acc[result.status] = (acc[result.status] ?? 0) + 1;
      return acc;
    }, {});
    for (const [status, count] of Object.entries(counts).sort()) lines.push(`[init] ${status}: ${count}`);
    if (report.apply.transactionManifestPath) lines.push(`[init] transaction: ${report.apply.transactionManifestPath}`);
    // A failed transaction rolls back by itself; a committed one keeps each replaced file's copy for a manual restore.
    if (!report.apply.rollback) {
      for (const result of report.apply.results) {
        if (result.status !== "applied" || !result.backupPath || !result.path) continue;
        const backup = join(report.repoRoot, result.backupPath);
        const target = join(report.repoRoot, result.path);
        lines.push(`[init] backup: ${result.path} -> ${backup} (restore: cp ${shellQuote(backup)} ${shellQuote(target)})`);
      }
    }
    for (const result of report.apply.results.filter((entry) => entry.status === "failed")) {
      lines.push(`[init] failed operation: ${result.id}${result.error ? ` - ${result.error}` : ""}`);
    }
    const rollback = report.apply.rollback;
    if (rollback) {
      // The status counts above describe the attempt; this states what is on disk now.
      const rolledBack = rollback.results.filter((result) => result.status === "rolled_back").length;
      const failed = rollback.results.filter((result) => result.status === "failed");
      lines.push(`[init] rollback: ${rollback.ok ? "complete" : "incomplete"} - ${rolledBack} rolled back, ${failed.length} failed`);
      for (const result of failed) {
        lines.push(`[init] rollback failed: ${result.path ?? result.id} (${result.action})${result.error ? ` - ${result.error}` : ""}`);
      }
      if (!rollback.ok) {
        lines.push(`[init] not restored: ${failed.map((result) => result.path ?? result.id).join(", ")}`);
      }
    }
  }
  if (report.registration) {
    lines.push(`[init] registry: ${report.registration.registered ? "registered" : "skipped"}${report.registration.reason ? ` - ${report.registration.reason}` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Applies the one canonical repo-local transaction. Global setup and checks stay explicit callers' concerns. */
export function runAdoptionApply(opts: RunAdoptionPlanOptions): RunAdoptionApplyResult {
  const created = createPlan(opts);
  if (created.error) {
    const report: AdoptionApplyReport = {
      protocol: 1,
      command: "init",
      repoRoot: created.repoRoot,
      mode: opts.mode,
      ok: false,
      plan: {},
      errors: [{ code: "invalid_adoption_plan", message: created.error.output.trim() }],
    };
    return { ...created.error, report };
  }
  const plan = created.plan!;
  if (opts.mode === "self-host") {
    const report: AdoptionApplyReport = {
      protocol: 1,
      command: "init",
      repoRoot: created.repoRoot,
      mode: opts.mode,
      ok: false,
      plan: renderAdoptionPlanObject(plan),
      errors: [{ code: "self_host_review_required", message: "self-host apply is blocked until its hook/runtime review is deterministic" }],
    };
    return { exitCode: 2, output: renderApplyReport(report, opts.json === true), report };
  }
  const apply = applyAdoptionPlan({ ...plan, apply: true });
  const registration = apply.ok ? registerRepoHarnessRepo(created.repoRoot, "init", { env: opts.env }) : undefined;
  const ok = apply.ok && (registration === undefined || registration.registered || registration.reason === "already registered");
  const report: AdoptionApplyReport = {
    protocol: 1,
    command: "init",
    repoRoot: created.repoRoot,
    mode: opts.mode,
    ok,
    plan: renderAdoptionPlanObject(plan),
    apply,
    registration,
  };
  return { exitCode: ok ? 0 : 1, output: renderApplyReport(report, opts.json === true), report };
}
