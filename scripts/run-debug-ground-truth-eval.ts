#!/usr/bin/env bun

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "path";

export const DEBUG_EVAL_PROFILE = "debug-ground-truth-eval-v1";
export const ROOT = resolve(import.meta.dir, "..");
export const DEFAULT_SCENARIOS_PATH = join(ROOT, "evals", "debug-hunt", "scenarios.json");
export const DEFAULT_GROUND_TRUTH_PATH = join(ROOT, "evals", "debug-hunt", "ground-truth.json");
export const DEFAULT_FIXTURE_ROOT = join(ROOT, "evals", "fixtures", "debug-hunt");
export const DEFAULT_REPORT_PATH = join(ROOT, ".ai", "harness", "runs", DEBUG_EVAL_PROFILE, "latest.json");

const CANONICAL_PROFILE_REPORTS = [
  join(ROOT, "evals", "harness", "reports", "profile-comparison.json"),
  join(ROOT, "evals", "harness", "reports", "profile-comparison.md"),
  join(ROOT, "evals", "harness", "reports", "profile-comparison.sha256.json"),
] as const;

export type DiagnosticOutcome = "diagnosis" | "abstain";
export type ProviderStatus = "submitted" | "no_submission" | "error";
export type GradingStatus = "pass" | "fail" | "ungraded" | "error" | "no_submission";

export interface PublicScenario {
  id: string;
  fixture: string;
  symptom: string;
}

interface ScenarioManifest {
  schema_version: number;
  profile: string;
  scenarios: PublicScenario[];
}

export interface HiddenTruth {
  id: string;
  fixture: string;
  expectation: DiagnosticOutcome;
  root_cause?: {
    file: string;
    condition: string;
  };
  reproduction: {
    command: string;
    expected_exit_code: number;
  };
}

interface TruthManifest {
  schema_version: number;
  profile: string;
  cases: HiddenTruth[];
}

export interface DebugDiagnosticSubmission {
  schema_version: 1;
  case_id: string;
  outcome: DiagnosticOutcome;
  root_cause?: {
    file: string;
    condition: string;
  };
  reproduction_command?: string;
}

export interface DebugEvalProviderContext {
  scenario: Readonly<PublicScenario>;
  prompt: string;
  workspace: string;
}

/** Trusted in-process test seam. It is not a sandbox for untrusted provider code. */
export type DebugEvalProvider = (context: DebugEvalProviderContext) => string | null | Promise<string | null>;

export interface DebugEvalOptions {
  scenarioPath?: string;
  groundTruthPath?: string;
  fixtureRoot?: string;
  reportPath?: string;
  scenarioIds?: string[];
  provider?: DebugEvalProvider;
  providerName?: "stub";
  now?: Date;
}

export interface FreshReplayRecord {
  command: string;
  expected_exit_code: number;
  actual_exit_code: number | null;
  passed: boolean;
  stdout_sha256: string;
  stderr_sha256: string;
}

export interface DebugEvalCaseRecord {
  case_id: string;
  fixture: string;
  provider_status: ProviderStatus;
  grading_status: GradingStatus;
  submission_sha256: string | null;
  grader_inputs_sha256: string | null;
  replay: FreshReplayRecord | null;
  error: string | null;
}

export interface DebugEvalReport {
  schema_version: 1;
  profile: typeof DEBUG_EVAL_PROFILE;
  generated_at: string;
  provider: "injected" | "stub";
  provenance: {
    runner_sha256: string;
    scenario_manifest_sha256: string;
    hidden_truth_sha256: string;
    fixture_set_sha256: string;
    canonical_profile_reports_before: Record<string, string>;
    canonical_profile_reports_after: Record<string, string>;
  };
  records: DebugEvalCaseRecord[];
}

export function debugEvalExitCode(report: Pick<DebugEvalReport, "records">): 0 | 1 {
  return report.records.every((record) => record.grading_status === "pass") ? 0 : 1;
}

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashFile(path: string): string {
  return sha256(readFileSync(path));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function assertNoSymlinks(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`symlink escape is forbidden: ${path}`);
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(path)) assertNoSymlinks(join(path, entry));
}

function safeFixturePath(fixtureRoot: string, fixtureRef: string): string {
  const canonicalRoot = realpathSync(fixtureRoot);
  if (isAbsolute(fixtureRef)) throw new Error(`fixture reference must be relative: ${fixtureRef}`);
  const requested = resolve(canonicalRoot, fixtureRef);
  if (!isInside(canonicalRoot, requested)) throw new Error(`fixture reference escapes fixture root: ${fixtureRef}`);
  if (!existsSync(requested)) throw new Error(`fixture does not exist: ${fixtureRef}`);
  assertNoSymlinks(requested);
  const canonicalFixture = realpathSync(requested);
  if (!isInside(canonicalRoot, canonicalFixture)) throw new Error(`fixture symlink escapes fixture root: ${fixtureRef}`);
  if (!lstatSync(canonicalFixture).isDirectory()) throw new Error(`fixture must be a directory: ${fixtureRef}`);
  return canonicalFixture;
}

function parseScenarioManifest(path: string): ScenarioManifest {
  const raw: unknown = JSON.parse(readFileSync(path, "utf-8"));
  if (!isRecord(raw) || raw.schema_version !== 1 || raw.profile !== DEBUG_EVAL_PROFILE || !Array.isArray(raw.scenarios)) {
    throw new Error(`invalid debug public scenario manifest: ${path}`);
  }
  const ids = new Set<string>();
  const scenarios = raw.scenarios.map((value, index): PublicScenario => {
    if (!isRecord(value)) throw new Error(`scenario ${index} must be an object`);
    const id = requireString(value.id, `scenario ${index}.id`);
    if (ids.has(id)) throw new Error(`duplicate scenario id: ${id}`);
    ids.add(id);
    return {
      id,
      fixture: requireString(value.fixture, `scenario ${id}.fixture`),
      symptom: requireString(value.symptom, `scenario ${id}.symptom`),
    };
  });
  if (scenarios.length === 0) throw new Error("debug public scenario manifest cannot be empty");
  return { schema_version: 1, profile: DEBUG_EVAL_PROFILE, scenarios };
}

function parseTruthManifest(path: string): TruthManifest {
  const raw: unknown = JSON.parse(readFileSync(path, "utf-8"));
  if (!isRecord(raw) || raw.schema_version !== 1 || raw.profile !== DEBUG_EVAL_PROFILE || !Array.isArray(raw.cases)) {
    throw new Error(`invalid debug hidden truth manifest: ${path}`);
  }
  const ids = new Set<string>();
  const cases = raw.cases.map((value, index): HiddenTruth => {
    if (!isRecord(value)) throw new Error(`hidden truth case ${index} must be an object`);
    const id = requireString(value.id, `hidden truth case ${index}.id`);
    if (ids.has(id)) throw new Error(`duplicate hidden truth id: ${id}`);
    ids.add(id);
    const expectation = requireString(value.expectation, `hidden truth ${id}.expectation`);
    if (expectation !== "diagnosis" && expectation !== "abstain") throw new Error(`invalid hidden truth expectation: ${id}`);
    if (!isRecord(value.reproduction)) throw new Error(`hidden truth ${id}.reproduction must be an object`);
    const truth: HiddenTruth = {
      id,
      fixture: requireString(value.fixture, `hidden truth ${id}.fixture`),
      expectation,
      reproduction: {
        command: requireString(value.reproduction.command, `hidden truth ${id}.reproduction.command`),
        expected_exit_code: requireNonNegativeInteger(value.reproduction.expected_exit_code, `hidden truth ${id}.reproduction.expected_exit_code`),
      },
    };
    if (expectation === "diagnosis") {
      if (!isRecord(value.root_cause)) throw new Error(`hidden truth ${id}.root_cause is required for diagnosis`);
      truth.root_cause = {
        file: requireString(value.root_cause.file, `hidden truth ${id}.root_cause.file`),
        condition: requireString(value.root_cause.condition, `hidden truth ${id}.root_cause.condition`),
      };
    } else if (value.root_cause !== undefined) {
      throw new Error(`hidden truth ${id} must not contain a root cause when abstention is expected`);
    }
    reproductionArgs(truth.reproduction.command);
    return truth;
  });
  if (cases.length === 0) throw new Error("debug hidden truth manifest cannot be empty");
  return { schema_version: 1, profile: DEBUG_EVAL_PROFILE, cases };
}

function reproductionArgs(command: string): string[] {
  const match = /^bun test ([A-Za-z0-9_./-]+\.test\.ts)$/.exec(command);
  if (!match) throw new Error(`unsupported reproduction command: ${command}`);
  const testPath = match[1];
  if (testPath.split("/").includes("..") || isAbsolute(testPath)) {
    throw new Error(`reproduction command path escapes fixture: ${command}`);
  }
  return ["test", testPath];
}

function assertFixtureMemberPath(fixture: string, member: string, label: string): void {
  if (isAbsolute(member) || member.split("/").includes("..")) {
    throw new Error(`${label} escapes fixture: ${member}`);
  }
  const requested = resolve(fixture, member);
  if (!isInside(fixture, requested) || !existsSync(requested)) {
    throw new Error(`${label} is outside or missing from fixture: ${member}`);
  }
  assertNoSymlinks(requested);
  const canonical = realpathSync(requested);
  if (!isInside(fixture, canonical) || lstatSync(canonical).isDirectory()) {
    throw new Error(`${label} is not a fixture file: ${member}`);
  }
}

function assertTruthReferencesInsideFixture(fixture: string, truth: HiddenTruth): void {
  if (truth.root_cause) assertFixtureMemberPath(fixture, truth.root_cause.file, `hidden truth ${truth.id}.root_cause.file`);
  const [, testPath] = reproductionArgs(truth.reproduction.command);
  assertFixtureMemberPath(fixture, testPath, `hidden truth ${truth.id}.reproduction.command`);
}

function scenarioPrompt(scenario: PublicScenario): string {
  return [
    scenario.symptom,
    "",
    "Return one JSON object and no surrounding prose:",
    '{"schema_version":1,"case_id":"' + scenario.id + '","outcome":"diagnosis|abstain","root_cause":{"file":"...","condition":"..."},"reproduction_command":"..."}',
    "For abstention, omit root_cause and reproduction_command.",
  ].join("\n");
}

function parseSubmission(raw: string, scenario: PublicScenario): DebugDiagnosticSubmission {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("submission is not valid JSON");
  }
  if (!isRecord(value) || value.schema_version !== 1) throw new Error("submission must use schema_version 1");
  if (requireString(value.case_id, "submission.case_id") !== scenario.id) throw new Error("submission case_id does not match scenario");
  const outcome = requireString(value.outcome, "submission.outcome");
  if (outcome !== "diagnosis" && outcome !== "abstain") throw new Error("submission outcome is invalid");
  if (outcome === "abstain") {
    if (value.root_cause !== undefined || value.reproduction_command !== undefined) {
      throw new Error("abstention submission must not claim a root cause or reproduction command");
    }
    return { schema_version: 1, case_id: scenario.id, outcome };
  }
  if (!isRecord(value.root_cause)) throw new Error("diagnosis submission requires root_cause");
  return {
    schema_version: 1,
    case_id: scenario.id,
    outcome,
    root_cause: {
      file: requireString(value.root_cause.file, "submission.root_cause.file"),
      condition: requireString(value.root_cause.condition, "submission.root_cause.condition"),
    },
    reproduction_command: requireString(value.reproduction_command, "submission.reproduction_command"),
  };
}

function copyFixture(fixture: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  cpSync(fixture, destination, { recursive: true, dereference: false });
}

function fixtureHash(fixture: string): string {
  const entries: string[] = [];
  const walk = (current: string): void => {
    const stat = lstatSync(current);
    const rel = relative(fixture, current).replaceAll(sep, "/") || ".";
    if (stat.isDirectory()) {
      entries.push(`${rel}:directory`);
      for (const entry of readdirSync(current).sort()) walk(join(current, entry));
      return;
    }
    entries.push(`${rel}:${stat.size}:${hashFile(current)}`);
  };
  walk(fixture);
  return sha256(entries.join("\0"));
}

function fixtureSetHash(fixtures: ReadonlyArray<{ scenario: PublicScenario; path: string }>): string {
  return sha256(fixtures.map(({ scenario, path }) => `${scenario.id}:${fixtureHash(path)}`).join("\0"));
}

function replayFreshFixture(fixture: string, truth: HiddenTruth): FreshReplayRecord {
  const graderRoot = mkdtempSync(join(tmpdir(), "repo-harness-debug-grader-"));
  try {
    const workspace = join(graderRoot, "fixture");
    copyFixture(fixture, workspace);
    const result = spawnSync("bun", reproductionArgs(truth.reproduction.command), { cwd: workspace, encoding: "utf-8" });
    const actualExitCode = result.status;
    const normalizeOutput = (value: string): string => value
      .split(workspace).join("<fresh-fixture>")
      .replaceAll(/\[\d+(?:\.\d+)?(?:ms|s)\]/g, "[<duration>]");
    return {
      command: truth.reproduction.command,
      expected_exit_code: truth.reproduction.expected_exit_code,
      actual_exit_code: actualExitCode,
      passed: actualExitCode === truth.reproduction.expected_exit_code,
      // Bun includes the ephemeral grader workspace in assertion stacks. Bind
      // deterministic evidence rather than that per-run path noise.
      stdout_sha256: sha256(normalizeOutput(result.stdout ?? "")),
      stderr_sha256: sha256(normalizeOutput(result.stderr ?? "")),
    };
  } finally {
    rmSync(graderRoot, { recursive: true, force: true });
  }
}

function graderInputsHash(scenario: PublicScenario, truth: HiddenTruth, submission: DebugDiagnosticSubmission): string {
  return sha256(JSON.stringify({
    scenario: { id: scenario.id, fixture: scenario.fixture },
    truth,
    submission,
  }));
}

function evaluateSubmission(submission: DebugDiagnosticSubmission, truth: HiddenTruth): boolean {
  if (truth.expectation === "abstain") return submission.outcome === "abstain";
  return submission.outcome === "diagnosis"
    && submission.root_cause?.file === truth.root_cause?.file
    && submission.root_cause?.condition === truth.root_cause?.condition
    && submission.reproduction_command === truth.reproduction.command;
}

const STUB_SUBMISSIONS: Record<string, DebugDiagnosticSubmission> = {
  "logic-off-by-one": {
    schema_version: 1,
    case_id: "logic-off-by-one",
    outcome: "diagnosis",
    root_cause: { file: "src/range.ts", condition: "The loop stops before including the requested end value." },
    reproduction_command: "bun test tests/range.test.ts",
  },
  "async-ordering": {
    schema_version: 1,
    case_id: "async-ordering",
    outcome: "diagnosis",
    root_cause: { file: "src/dashboard.ts", condition: "Older asynchronous work can overwrite the newer response because completion callbacks have no request-order guard." },
    reproduction_command: "bun test tests/dashboard.test.ts",
  },
  "stale-persisted-artifact": {
    schema_version: 1,
    case_id: "stale-persisted-artifact",
    outcome: "diagnosis",
    root_cause: { file: "state/active-release.json", condition: "The persisted release artifact is stale while the loader correctly reads that artifact." },
    reproduction_command: "bun test tests/catalog.test.ts",
  },
  "red-herring-no-bug": { schema_version: 1, case_id: "red-herring-no-bug", outcome: "abstain" },
};

export const stubDebugEvalProvider: DebugEvalProvider = ({ scenario }) => {
  const submission = STUB_SUBMISSIONS[scenario.id];
  if (!submission) throw new Error(`stub provider has no submission for ${scenario.id}`);
  return JSON.stringify(submission);
};

function canonicalProfileReportHashes(): Record<string, string> {
  return Object.fromEntries(CANONICAL_PROFILE_REPORTS.map((path) => [basename(path), hashFile(path)]));
}

function selectedScenarios(manifest: ScenarioManifest, selectedIds?: string[]): PublicScenario[] {
  if (!selectedIds || selectedIds.length === 0) return manifest.scenarios;
  const wanted = new Set(selectedIds);
  const selected = manifest.scenarios.filter((scenario) => wanted.has(scenario.id));
  if (selected.length !== wanted.size) throw new Error("requested debug evaluation scenario does not exist");
  return selected;
}

export async function runDebugGroundTruthEval(options: DebugEvalOptions = {}): Promise<DebugEvalReport> {
  const scenarioPath = resolve(options.scenarioPath ?? DEFAULT_SCENARIOS_PATH);
  const truthPath = resolve(options.groundTruthPath ?? DEFAULT_GROUND_TRUTH_PATH);
  const fixtureRoot = resolve(options.fixtureRoot ?? DEFAULT_FIXTURE_ROOT);
  const reportPath = resolve(options.reportPath ?? DEFAULT_REPORT_PATH);
  const scenarioManifest = parseScenarioManifest(scenarioPath);
  const truthManifest = parseTruthManifest(truthPath);
  const selected = selectedScenarios(scenarioManifest, options.scenarioIds);
  const truthById = new Map(truthManifest.cases.map((entry) => [entry.id, entry]));
  if (truthById.size !== truthManifest.cases.length || truthById.size !== scenarioManifest.scenarios.length) {
    throw new Error("public scenarios and hidden truth must have a one-to-one cardinality");
  }
  const resolvedFixtures = selected.map((scenario) => {
    const truth = truthById.get(scenario.id);
    if (!truth || truth.fixture !== scenario.fixture) throw new Error(`scenario/truth fixture mismatch: ${scenario.id}`);
    const path = safeFixturePath(fixtureRoot, scenario.fixture);
    assertTruthReferencesInsideFixture(path, truth);
    return { scenario, truth, path };
  });
  const canonicalBefore = canonicalProfileReportHashes();
  const provider = options.provider ?? stubDebugEvalProvider;
  const providerName = options.provider ? "injected" : "stub" as const;
  const records: DebugEvalCaseRecord[] = [];

  for (const entry of resolvedFixtures) {
    const providerRoot = mkdtempSync(join(tmpdir(), "repo-harness-debug-provider-"));
    const workspace = join(providerRoot, "fixture");
    try {
      copyFixture(entry.path, workspace);
      let providerOutput: string | null;
      try {
        providerOutput = await provider({
          scenario: Object.freeze({ ...entry.scenario }),
          prompt: scenarioPrompt(entry.scenario),
          workspace,
        });
      } catch (error) {
        records.push({
          case_id: entry.scenario.id,
          fixture: entry.scenario.fixture,
          provider_status: "error",
          grading_status: "error",
          submission_sha256: null,
          grader_inputs_sha256: null,
          replay: null,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (providerOutput === null || providerOutput.trim() === "") {
        records.push({
          case_id: entry.scenario.id,
          fixture: entry.scenario.fixture,
          provider_status: "no_submission",
          grading_status: "no_submission",
          submission_sha256: null,
          grader_inputs_sha256: null,
          replay: null,
          error: null,
        });
        continue;
      }
      const submissionHash = sha256(providerOutput);
      let submission: DebugDiagnosticSubmission;
      try {
        submission = parseSubmission(providerOutput, entry.scenario);
      } catch (error) {
        records.push({
          case_id: entry.scenario.id,
          fixture: entry.scenario.fixture,
          provider_status: "submitted",
          grading_status: "ungraded",
          submission_sha256: submissionHash,
          grader_inputs_sha256: null,
          replay: null,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      const inputsHash = graderInputsHash(entry.scenario, entry.truth, submission);
      let replay: FreshReplayRecord;
      try {
        replay = replayFreshFixture(entry.path, entry.truth);
      } catch (error) {
        records.push({
          case_id: entry.scenario.id,
          fixture: entry.scenario.fixture,
          provider_status: "submitted",
          grading_status: "error",
          submission_sha256: submissionHash,
          grader_inputs_sha256: inputsHash,
          replay: null,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (!replay.passed) {
        records.push({
          case_id: entry.scenario.id,
          fixture: entry.scenario.fixture,
          provider_status: "submitted",
          grading_status: "error",
          submission_sha256: submissionHash,
          grader_inputs_sha256: inputsHash,
          replay,
          error: "fresh replay did not match the hidden oracle exit code",
        });
        continue;
      }
      records.push({
        case_id: entry.scenario.id,
        fixture: entry.scenario.fixture,
        provider_status: "submitted",
        grading_status: evaluateSubmission(submission, entry.truth) ? "pass" : "fail",
        submission_sha256: submissionHash,
        grader_inputs_sha256: inputsHash,
        replay,
        error: null,
      });
    } finally {
      rmSync(providerRoot, { recursive: true, force: true });
    }
  }

  const canonicalAfter = canonicalProfileReportHashes();
  if (JSON.stringify(canonicalBefore) !== JSON.stringify(canonicalAfter)) {
    throw new Error("canonical 3x9 profile benchmark evidence changed during debug evaluation");
  }
  const report: DebugEvalReport = {
    schema_version: 1,
    profile: DEBUG_EVAL_PROFILE,
    generated_at: (options.now ?? new Date()).toISOString(),
    provider: providerName,
    provenance: {
      runner_sha256: hashFile(resolve(import.meta.path)),
      scenario_manifest_sha256: hashFile(scenarioPath),
      hidden_truth_sha256: hashFile(truthPath),
      fixture_set_sha256: fixtureSetHash(resolvedFixtures),
      canonical_profile_reports_before: canonicalBefore,
      canonical_profile_reports_after: canonicalAfter,
    },
    records,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function usage(): string {
  return [
    "Usage: bun run benchmark:debug -- [--provider stub] [--scenario <id>] [--report <path>]",
    "",
    "Runs the hidden-ground-truth debug evaluation against trusted TypeScript/Bun fixtures.",
  ].join("\n");
}

function parseCli(argv: string[]): { provider: "stub"; scenarioIds: string[]; reportPath?: string; help: boolean } {
  const result: { provider: "stub"; scenarioIds: string[]; reportPath?: string; help: boolean } = {
    provider: "stub",
    scenarioIds: [],
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--provider") {
      const value = argv[++index];
      if (value !== "stub") throw new Error(`unsupported debug evaluation provider: ${value}`);
      result.provider = value;
    } else if (arg === "--scenario") {
      result.scenarioIds.push(requireString(argv[++index], "--scenario"));
    } else if (arg === "--report") {
      result.reportPath = requireString(argv[++index], "--report");
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return result;
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = await runDebugGroundTruthEval({
    providerName: options.provider,
    scenarioIds: options.scenarioIds,
    reportPath: options.reportPath,
  });
  const summary = report.records.reduce<Record<GradingStatus, number>>((counts, record) => {
    counts[record.grading_status] += 1;
    return counts;
  }, { pass: 0, fail: 0, ungraded: 0, error: 0, no_submission: 0 });
  console.log(`debug ground-truth eval: ${report.records.length} case(s); pass=${summary.pass}; fail=${summary.fail}; ungraded=${summary.ungraded}; error=${summary.error}; no_submission=${summary.no_submission}`);
  process.exitCode = debugEvalExitCode(report);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
