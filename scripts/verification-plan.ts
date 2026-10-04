#!/usr/bin/env bun
import { basename, dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

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
    "usage: verification-plan.ts validate --repo <path> --contract <repo-relative-path>",
    "       verification-plan.ts evaluate --repo <path> --contract <repo-relative-path> [--report-file <path>]",
    "       verification-plan.ts execute --repo <path> --contract <repo-relative-path> [--report-file <path>] [--force-reason <text>] [--timeout-ms <ms>]",
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

async function main(argv: readonly string[]): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(argv);
    const repoRoot = required(parsed.values, "repo");
    const contractPath = required(parsed.values, "contract");
    const reportFile = parsed.values["report-file"];
    const execution = await loadExecutionModule();
    if (parsed.action === "validate") {
      const unexpected = Object.keys(parsed.values).filter((key) => !["repo", "contract"].includes(key));
      if (unexpected.length > 0) throw new Error(`validate does not accept: ${unexpected.map((key) => `--${key}`).join(", ")}`);
      writeJson(execution.validateVerificationContract({ repoRoot, contractPath }));
      return 0;
    }
    if (parsed.action === "evaluate") {
      const unexpected = Object.keys(parsed.values).filter((key) => !["repo", "contract", "report-file"].includes(key));
      if (unexpected.length > 0) throw new Error(`evaluate does not accept: ${unexpected.map((key) => `--${key}`).join(", ")}`);
      const report = execution.evaluateVerificationContract({ repoRoot, contractPath });
      if (reportFile && report.kind === "verification_execution_report") execution.writeVerificationExecutionReport(repoRoot, reportFile, report);
      writeJson(report);
      return report.passed ? 0 : 1;
    }
    if (parsed.action === "execute") {
      const unexpected = Object.keys(parsed.values).filter((key) =>
        !["repo", "contract", "report-file", "force-reason", "timeout-ms"].includes(key));
      if (unexpected.length > 0) throw new Error(`execute does not accept: ${unexpected.map((key) => `--${key}`).join(", ")}`);
      const timeoutRaw = parsed.values["timeout-ms"];
      const timeoutMs = timeoutRaw === undefined ? undefined : Number(timeoutRaw);
      if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)) {
        throw new Error("--timeout-ms must be a positive integer");
      }
      const report = execution.executeVerificationContract({
        repoRoot,
        contractPath,
        reportFile,
        forceReason: parsed.values["force-reason"],
        timeoutMs,
      });
      writeJson(report);
      return report.passed ? 0 : 1;
    }
    throw new Error(`action must be validate, evaluate, or execute`);
  } catch (error) {
    process.stderr.write(`verification-plan: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
    return 2;
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
