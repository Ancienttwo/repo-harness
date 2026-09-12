import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  fingerprintVerificationCheck,
  hashVerificationPlan,
  parseVerificationPlanFromContractText,
  validateVerificationPlan,
  VerificationPlanValidationError,
} from "../../src/core/evidence/verification-plan";

const currentCheck = {
  id: "focused",
  kind: "package_test",
  path: "tests/focused.test.ts",
  cwd: ".",
  phase: "verification",
  cost: "normal",
  evidence_policy: "current_exact",
  necessity: "covers the changed execution decision",
  inputs: { env: [] },
} as const;

describe("Verification Plan schema", () => {
  test("canonical source and installed templates emit a valid Verification Plan", () => {
    const root = resolve(import.meta.dir, "../..");
    const source = readFileSync(resolve(root, "assets/templates/contract.template.md"), "utf8");
    const installed = readFileSync(resolve(root, ".claude/templates/contract.template.md"), "utf8");
    expect(installed).toBe(source);
    const plan = parseVerificationPlanFromContractText(source.replaceAll("{{TASK_SLUG}}", "example"));
    expect(plan.checks).toEqual([]);
  });

  test("accepts an explicit empty plan without treating a missing plan as equivalent", () => {
    expect(validateVerificationPlan({ protocol: 1, checks: [] })).toEqual({ protocol: 1, checks: [] });
    const empty = `## Verification Plan\n\n\`\`\`json\n{"protocol":1,"checks":[]}\n\`\`\`\n`;
    expect(parseVerificationPlanFromContractText(empty).checks).toEqual([]);
    expect(() => parseVerificationPlanFromContractText("# no Verification Plan\n")).toThrow("exactly one");
  });

  test("validates current exact and explicit baseline plus delta descriptors", () => {
    const plan = validateVerificationPlan({
      protocol: 1,
      checks: [
        currentCheck,
        {
          id: "historical-full",
          kind: "command",
          command: "bun test",
          cwd: ".",
          phase: "verification",
          cost: "expensive",
          evidence_policy: "baseline_with_delta",
          necessity: "retain the frozen full-suite fact and cover this delta",
          inputs: { env: ["CI"] },
          baseline: { run_file: ".ai/harness/runs/full.json", execution_id: "evt-full" },
          delta_checks: ["focused"],
        },
      ],
    });
    expect(plan.checks).toHaveLength(2);
    expect(hashVerificationPlan(plan)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fingerprintVerificationCheck(plan.checks[0]!)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("rejects unknown fields, kind ambiguity, and baseline without explicit current delta", () => {
    expect(() => validateVerificationPlan({ protocol: 1, checks: [{ ...currentCheck, surprise: true }] }))
      .toThrow(VerificationPlanValidationError);
    expect(() => validateVerificationPlan({ protocol: 1, checks: [{ ...currentCheck, command: "true" }] }))
      .toThrow("command is forbidden");
    expect(() => validateVerificationPlan({
      protocol: 1,
      checks: [{
        ...currentCheck,
        id: "full",
        evidence_policy: "baseline_with_delta",
        baseline: { run_file: ".ai/harness/runs/full.json", execution_id: "evt-full" },
        delta_checks: [],
      }],
    })).toThrow("non-empty");
    expect(() => validateVerificationPlan({
      protocol: 1,
      checks: [{ ...currentCheck, kind: "command", path: undefined, command: "bun run benchmark:harness" }],
    })).toThrow("forbidden evidence producer");
    expect(() => validateVerificationPlan({
      protocol: 1,
      checks: [
        { ...currentCheck, id: "later", phase: "verification" },
        {
          ...currentCheck,
          id: "preflight-baseline",
          phase: "preflight",
          evidence_policy: "baseline_with_delta",
          baseline: { run_file: ".ai/harness/runs/verification-vx-old.json", execution_id: "vx-old" },
          delta_checks: ["later"],
        },
      ],
    })).toThrow("may not depend on verification-phase delta check later");
  });

  test("extracts exactly one JSON block and rejects mixed legacy executable authority", () => {
    const json = JSON.stringify({ protocol: 1, checks: [currentCheck] }, null, 2);
    expect(parseVerificationPlanFromContractText(`## Verification Plan\n\n\`\`\`json\n${json}\n\`\`\`\n`).checks[0]!.id)
      .toBe("focused");
    expect(() => parseVerificationPlanFromContractText(
      `## Verification Plan\n\n\`\`\`json\n${json}\n\`\`\`\n\n\`\`\`yaml\nexit_criteria:\n  tests_pass:\n    - path: tests/old.test.ts\ncriterion_reuse:\n  tests_pass: []\n\`\`\`\n`,
    )).toThrow("mixes Verification Plan");
    expect(() => parseVerificationPlanFromContractText(
      `## Verification Plan\n\n\`\`\`json\n${json}\n\`\`\`\n\n\`\`\`yaml\nexit_criteria:\n  tests_pass: [tests/old.test.ts]\n\`\`\`\n`,
    )).toThrow("mixes Verification Plan");
    expect(() => parseVerificationPlanFromContractText(
      `## Verification Plan\n\n\`\`\`json\n${json}\n\`\`\`\n\ncriterion_reuse: { tests_pass: [focused] }\n`,
    )).toThrow("mixes Verification Plan");
    expect(() => parseVerificationPlanFromContractText("# no plan\n")).toThrow("exactly one");
  });
});
