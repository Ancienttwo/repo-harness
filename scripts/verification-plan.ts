#!/usr/bin/env bun
import { basename, dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { readReviewAdmissionSource } from "../src/effects/review/admission-source";

type VerificationExecutionModule = typeof import("../src/effects/evidence/verification-execution");

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = basename(SCRIPT_DIR) === "helpers"
  && basename(dirname(SCRIPT_DIR)) === "templates"
  && basename(dirname(dirname(SCRIPT_DIR))) === "assets"
  ? resolve(SCRIPT_DIR, "../../..")
  : resolve(SCRIPT_DIR, "..");

async function loadExecutionModule(): Promise<VerificationExecutionModule> {
  const modulePath = join(PACKAGE_ROOT, "src", "effects", "evidence", "verification-execution.ts");
  return await import(pathToFileURL(modulePath).href) as VerificationExecutionModule;
}

function usage(): string {
  return [
    "usage: verification-plan.ts execute-eval --repo <path> --catalog <path> --catalog-sha256 <hash> --eval-id <id> --eval-sha256 <hash> [--report-file <path>]",
    "       verification-plan.ts validate --repo <path> --repository-id <id> --issue-id <id> --campaign-id <id> --grant-sha256 <hash> --policy-sha256 <hash> --actor <id>",
    "       verification-plan.ts evaluate --repo <path> --repository-id <id> --issue-id <id> --campaign-id <id> --grant-sha256 <hash> --policy-sha256 <hash> --actor <id> [--report-file <path>]",
    "       verification-plan.ts execute --repo <path> --repository-id <id> --issue-id <id> --campaign-id <id> --grant-sha256 <hash> --policy-sha256 <hash> --actor <id> [--report-file <path>] [--force-reason <text>] [--timeout-ms <ms>]",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): { readonly action: string; readonly values: Readonly<Record<string, string>> } {
  const action = argv[0] ?? "";
  const values: Record<string, string> = {};
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) throw new Error(`unexpected argument: ${arg ?? ""}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    values[arg.slice(2)] = value;
    index++;
  }
  return { action, values };
}

function required(values: Readonly<Record<string, string>>, key: string): string {
  const value = values[key];
  if (!value) throw new Error(`--${key} is required`);
  return value;
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function main(
  argv: readonly string[],
  admissionSource: typeof readReviewAdmissionSource = readReviewAdmissionSource,
): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(argv);
    const repoRoot = required(parsed.values, "repo");
    if (parsed.action === "execute-eval") {
      const flags = ["repo", "catalog", "catalog-sha256", "eval-id", "eval-sha256", "report-file"];
      const unexpected = Object.keys(parsed.values).filter(key => !flags.includes(key));
      if (unexpected.length) throw new Error(`execute-eval does not accept: ${unexpected.map(key => `--${key}`).join(", ")}`);
      const execution = await loadExecutionModule();
      const report = execution.executeCatalogEval({ repoRoot, catalog: {
        catalog_path: required(parsed.values, "catalog"), catalog_sha256: required(parsed.values, "catalog-sha256"),
        eval_id: required(parsed.values, "eval-id"), eval_sha256: required(parsed.values, "eval-sha256"),
      }, reportFile: parsed.values["report-file"] });
      writeJson(report);
      return report.passed ? 0 : 1;
    }
    const authority = admissionSource(repoRoot, parsed.values);
    const authorityFlags = ["repo", "repository-id", "issue-id", "campaign-id", "grant-sha256", "policy-sha256", "actor"];
    const reportFile = parsed.values["report-file"];
    const execution = await loadExecutionModule();
    if (parsed.action === "validate") {
      const unexpected = Object.keys(parsed.values).filter((key) => !authorityFlags.includes(key));
      if (unexpected.length > 0) throw new Error(`validate does not accept: ${unexpected.map((key) => `--${key}`).join(", ")}`);
      writeJson(execution.validateAdmittedVerification({ repoRoot, authority }));
      return 0;
    }
    if (parsed.action === "evaluate") {
      const unexpected = Object.keys(parsed.values).filter((key) => ![...authorityFlags, "report-file"].includes(key));
      if (unexpected.length > 0) throw new Error(`evaluate does not accept: ${unexpected.map((key) => `--${key}`).join(", ")}`);
      const report = execution.evaluateAdmittedVerification({ repoRoot, authority });
      if (reportFile && report.kind === "verification_execution_report") execution.writeVerificationExecutionReport(repoRoot, reportFile, report);
      writeJson(report);
      return report.passed ? 0 : 1;
    }
    if (parsed.action === "execute") {
      const unexpected = Object.keys(parsed.values).filter((key) =>
        ![...authorityFlags, "report-file", "force-reason", "timeout-ms"].includes(key));
      if (unexpected.length > 0) throw new Error(`execute does not accept: ${unexpected.map((key) => `--${key}`).join(", ")}`);
      const timeoutRaw = parsed.values["timeout-ms"];
      const timeoutMs = timeoutRaw === undefined ? undefined : Number(timeoutRaw);
      if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)) {
        throw new Error("--timeout-ms must be a positive integer");
      }
      const report = execution.executeAdmittedVerification({
        repoRoot,
        authority,
        reportFile,
        forceReason: parsed.values["force-reason"],
        timeoutMs,
      });
      writeJson(report);
      return report.passed ? 0 : 1;
    }
    throw new Error(`action must be validate, evaluate, execute, or execute-eval`);
  } catch (error) {
    process.stderr.write(`verification-plan: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
    return 2;
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
