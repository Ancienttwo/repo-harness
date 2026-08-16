import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { join, relative } from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_FIXTURE_ROOT,
  DEFAULT_GROUND_TRUTH_PATH,
  DEFAULT_SCENARIOS_PATH,
  debugEvalExitCode,
  runDebugGroundTruthEval,
  stubDebugEvalProvider,
} from "../scripts/run-debug-ground-truth-eval";

const TEMP_ROOTS: string[] = [];
const FIXED_NOW = new Date("2026-08-16T10:00:00.000Z");

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  TEMP_ROOTS.push(root);
  return root;
}

function reportPath(root: string, label: string): string {
  return join(root, `${label}.json`);
}

function walkWorkspace(root: string): string[] {
  const entries: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry);
      const rel = relative(root, path).replaceAll("\\", "/");
      entries.push(rel);
      if (lstatSync(path).isDirectory()) {
        walk(path);
      } else {
        entries.push(readFileSync(path, "utf-8"));
      }
    }
  };
  walk(root);
  return entries;
}

function oneCaseProfile(params: {
  fixture: string;
  expectedExitCode?: number;
  reproductionCommand?: string;
}): { scenarioPath: string; truthPath: string; fixtureRoot: string } {
  const root = temporaryRoot("debug-ground-truth-profile");
  const fixtureRoot = join(root, "fixtures");
  mkdirSync(fixtureRoot, { recursive: true });
  const fixtureName = params.fixture;
  if (fixtureName === "logic") {
    cpSync(join(DEFAULT_FIXTURE_ROOT, "logic-off-by-one"), join(fixtureRoot, fixtureName), { recursive: true });
  }
  const scenarioPath = join(root, "scenarios.json");
  const truthPath = join(root, "truth.json");
  writeFileSync(scenarioPath, JSON.stringify({
    schema_version: 1,
    profile: "debug-ground-truth-eval-v1",
    scenarios: [{ id: "logic", fixture: fixtureName, symptom: "A range endpoint is missing." }],
  }));
  writeFileSync(truthPath, JSON.stringify({
    schema_version: 1,
    profile: "debug-ground-truth-eval-v1",
    cases: [{
      id: "logic",
      fixture: fixtureName,
      expectation: "diagnosis",
      root_cause: { file: "src/range.ts", condition: "The loop stops before including the requested end value." },
      reproduction: {
        command: params.reproductionCommand ?? "bun test tests/range.test.ts",
        expected_exit_code: params.expectedExitCode ?? 1,
      },
    }],
  }));
  return { scenarioPath, truthPath, fixtureRoot };
}

function logicSubmission(): string {
  return JSON.stringify({
    schema_version: 1,
    case_id: "logic",
    outcome: "diagnosis",
    root_cause: { file: "src/range.ts", condition: "The loop stops before including the requested end value." },
    reproduction_command: "bun test tests/range.test.ts",
  });
}

afterEach(() => {
  while (TEMP_ROOTS.length > 0) rmSync(TEMP_ROOTS.pop()!, { recursive: true, force: true });
});

describe("debug hidden-ground-truth evaluation", () => {
  test("keeps hidden truth bytes, names, commands, and expected conditions outside the provider prompt and workspace", async () => {
    const root = temporaryRoot("debug-ground-truth-isolation");
    const observed: string[] = [];
    const truthBytes = readFileSync(DEFAULT_GROUND_TRUTH_PATH, "utf-8");
    await runDebugGroundTruthEval({
      reportPath: reportPath(root, "report"),
      scenarioIds: ["logic-off-by-one"],
      now: FIXED_NOW,
      provider: ({ scenario, prompt, workspace }) => {
        observed.push(JSON.stringify(scenario), prompt, ...walkWorkspace(workspace));
        return JSON.stringify({
          schema_version: 1,
          case_id: scenario.id,
          outcome: "diagnosis",
          root_cause: { file: "src/range.ts", condition: "The loop stops before including the requested end value." },
          reproduction_command: "bun test tests/range.test.ts",
        });
      },
    });
    const providerView = observed.join("\n");
    const truth = JSON.parse(truthBytes) as { cases: Array<{ root_cause?: { condition: string }; reproduction: { command: string } }> };
    expect(providerView).not.toContain(truthBytes);
    expect(providerView).not.toContain("ground-truth.json");
    expect(providerView).not.toContain(DEFAULT_GROUND_TRUTH_PATH);
    expect(providerView).not.toContain(truth.cases[0].root_cause!.condition);
    expect(providerView).not.toContain(truth.cases[0].reproduction.command);
  });

  test("rejects public fixture root escape and symlink escape before provider execution", async () => {
    const escaped = oneCaseProfile({ fixture: "../outside" });
    mkdirSync(join(escaped.fixtureRoot, "..", "outside"), { recursive: true });
    await expect(runDebugGroundTruthEval({
      scenarioPath: escaped.scenarioPath,
      groundTruthPath: escaped.truthPath,
      fixtureRoot: escaped.fixtureRoot,
      reportPath: reportPath(temporaryRoot("debug-ground-truth-escape-report"), "report"),
      provider: () => logicSubmission(),
    })).rejects.toThrow("escapes fixture root");

    const linked = oneCaseProfile({ fixture: "linked" });
    const outside = temporaryRoot("debug-ground-truth-outside");
    cpSync(join(DEFAULT_FIXTURE_ROOT, "logic-off-by-one"), outside, { recursive: true });
    symlinkSync(outside, join(linked.fixtureRoot, "linked"), "dir");
    await expect(runDebugGroundTruthEval({
      scenarioPath: linked.scenarioPath,
      groundTruthPath: linked.truthPath,
      fixtureRoot: linked.fixtureRoot,
      reportPath: reportPath(temporaryRoot("debug-ground-truth-symlink-report"), "report"),
      provider: () => logicSubmission(),
    })).rejects.toThrow("symlink escape");

    const truthEscape = oneCaseProfile({ fixture: "logic" });
    const truth = JSON.parse(readFileSync(truthEscape.truthPath, "utf-8")) as { cases: Array<{ root_cause: { file: string } }> };
    truth.cases[0].root_cause.file = "../outside.ts";
    writeFileSync(truthEscape.truthPath, JSON.stringify(truth));
    await expect(runDebugGroundTruthEval({
      scenarioPath: truthEscape.scenarioPath,
      groundTruthPath: truthEscape.truthPath,
      fixtureRoot: truthEscape.fixtureRoot,
      reportPath: reportPath(temporaryRoot("debug-ground-truth-truth-escape-report"), "report"),
      provider: () => logicSubmission(),
    })).rejects.toThrow("root_cause.file escapes fixture");
  });

  test("grades from a fresh fixture copy after provider-owned source and test mutations", async () => {
    const root = temporaryRoot("debug-ground-truth-fresh-replay");
    const report = await runDebugGroundTruthEval({
      reportPath: reportPath(root, "report"),
      scenarioIds: ["logic-off-by-one"],
      now: FIXED_NOW,
      provider: ({ workspace, scenario }) => {
        writeFileSync(join(workspace, "src", "range.ts"), "export function inclusiveRange(start: number, end: number): number[] { return [start, end]; }\n");
        writeFileSync(join(workspace, "tests", "range.test.ts"), "import { expect, test } from 'bun:test'; test('mutated', () => expect(true).toBe(true));\n");
        return JSON.stringify({
          schema_version: 1,
          case_id: scenario.id,
          outcome: "diagnosis",
          root_cause: { file: "src/range.ts", condition: "The loop stops before including the requested end value." },
          reproduction_command: "bun test tests/range.test.ts",
        });
      },
    });
    expect(report.records[0]).toMatchObject({ provider_status: "submitted", grading_status: "pass" });
    expect(report.records[0].replay).toMatchObject({ expected_exit_code: 1, actual_exit_code: 1, passed: true });
  });

  test("represents fail, ungraded, provider error, and no submission without collapsing state", async () => {
    const root = temporaryRoot("debug-ground-truth-states");
    const common = { scenarioIds: ["logic-off-by-one"], now: FIXED_NOW };
    const fail = await runDebugGroundTruthEval({
      ...common,
      reportPath: reportPath(root, "fail"),
      provider: ({ scenario }) => JSON.stringify({
        schema_version: 1,
        case_id: scenario.id,
        outcome: "diagnosis",
        root_cause: { file: "src/range.ts", condition: "The condition is wrong." },
        reproduction_command: "bun test tests/range.test.ts",
      }),
    });
    const ungraded = await runDebugGroundTruthEval({ ...common, reportPath: reportPath(root, "ungraded"), provider: () => "not-json" });
    const providerError = await runDebugGroundTruthEval({ ...common, reportPath: reportPath(root, "error"), provider: () => { throw new Error("provider unavailable"); } });
    const noSubmission = await runDebugGroundTruthEval({ ...common, reportPath: reportPath(root, "none"), provider: () => null });
    expect(fail.records[0]).toMatchObject({ provider_status: "submitted", grading_status: "fail" });
    expect(ungraded.records[0]).toMatchObject({ provider_status: "submitted", grading_status: "ungraded" });
    expect(providerError.records[0]).toMatchObject({ provider_status: "error", grading_status: "error" });
    expect(noSubmission.records[0]).toMatchObject({ provider_status: "no_submission", grading_status: "no_submission" });
    expect(debugEvalExitCode(fail)).toBe(1);
    expect(debugEvalExitCode(ungraded)).toBe(1);
    expect(debugEvalExitCode(providerError)).toBe(1);
    expect(debugEvalExitCode(noSubmission)).toBe(1);
  });

  test("fails false-positive diagnosis and passes abstention for the no-bug red herring", async () => {
    const root = temporaryRoot("debug-ground-truth-red-herring");
    const falsePositive = await runDebugGroundTruthEval({
      reportPath: reportPath(root, "false-positive"),
      scenarioIds: ["red-herring-no-bug"],
      now: FIXED_NOW,
      provider: ({ scenario }) => JSON.stringify({
        schema_version: 1,
        case_id: scenario.id,
        outcome: "diagnosis",
        root_cause: { file: "src/status.ts", condition: "The refresh is stale." },
        reproduction_command: "bun test tests/status.test.ts",
      }),
    });
    const abstention = await runDebugGroundTruthEval({
      reportPath: reportPath(root, "abstention"),
      scenarioIds: ["red-herring-no-bug"],
      now: FIXED_NOW,
      provider: stubDebugEvalProvider,
    });
    expect(falsePositive.records[0].grading_status).toBe("fail");
    expect(abstention.records[0].grading_status).toBe("pass");
  });

  test("marks a mismatched hidden replay oracle as grader error", async () => {
    const root = temporaryRoot("debug-ground-truth-grader-error");
    const profile = oneCaseProfile({ fixture: "logic", expectedExitCode: 0 });
    const report = await runDebugGroundTruthEval({
      scenarioPath: profile.scenarioPath,
      groundTruthPath: profile.truthPath,
      fixtureRoot: profile.fixtureRoot,
      reportPath: reportPath(root, "report"),
      now: FIXED_NOW,
      provider: () => logicSubmission(),
    });
    expect(report.records[0]).toMatchObject({ provider_status: "submitted", grading_status: "error" });
    expect(report.records[0].error).toContain("fresh replay");
  });

  test("binds deterministic provenance and leaves the canonical 3x9 report bytes unchanged", async () => {
    const root = temporaryRoot("debug-ground-truth-provenance");
    const profileBytesBefore = [
      readFileSync(join(import.meta.dir, "..", "evals", "harness", "reports", "profile-comparison.json")),
      readFileSync(join(import.meta.dir, "..", "evals", "harness", "reports", "profile-comparison.md")),
      readFileSync(join(import.meta.dir, "..", "evals", "harness", "reports", "profile-comparison.sha256.json")),
    ];
    const first = await runDebugGroundTruthEval({ reportPath: reportPath(root, "first"), now: FIXED_NOW });
    const second = await runDebugGroundTruthEval({ reportPath: reportPath(root, "second"), now: FIXED_NOW });
    const profileBytesAfter = [
      readFileSync(join(import.meta.dir, "..", "evals", "harness", "reports", "profile-comparison.json")),
      readFileSync(join(import.meta.dir, "..", "evals", "harness", "reports", "profile-comparison.md")),
      readFileSync(join(import.meta.dir, "..", "evals", "harness", "reports", "profile-comparison.sha256.json")),
    ];
    expect(first).toEqual(second);
    expect(first.provenance).toHaveProperty("runner_sha256");
    expect(first.records).toHaveLength(4);
    expect(debugEvalExitCode(first)).toBe(0);
    expect(first.records.every((record) => record.submission_sha256 && record.grader_inputs_sha256 && record.replay)).toBe(true);
    expect(profileBytesAfter).toEqual(profileBytesBefore);
  });
});
