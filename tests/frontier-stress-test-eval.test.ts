import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { loadBenchmarkConfig, loadEvalManifest, runSkillEvals } from "../scripts/run-skill-evals";
import { validateFrontierOutput } from "../evals/frontier-stress-test/common/validate-frontier-output";

const ROOT = join(import.meta.dir, "..");
const EVAL_ROOT = join(ROOT, "evals", "frontier-stress-test");

describe("bounded frontier stress-test eval", () => {
  test("keeps the treatment outside the managed planning Skill", () => {
    const treatment = readFileSync(join(EVAL_ROOT, "treatment", "SKILL.md"), "utf8");
    const managed = readFileSync(join(ROOT, "assets/skills/repo-harness-plan/SKILL.md"), "utf8");

    expect(treatment).toContain("evaluation-only delta");
    expect(treatment).toContain("at most three frontier questions");
    expect(treatment).toContain("Stop after two rounds per invocation");
    expect(treatment).toContain("[UNKNOWN:BLOCKING]");
    expect(managed).not.toContain("stress-test");
  });

  test("defines four historical signals and one negative control", () => {
    const manifest = loadEvalManifest(join(EVAL_ROOT, "evals.json"));
    expect(manifest.evals).toHaveLength(5);
    expect(manifest.evals.filter((entry) => entry.slug.includes("negative-control"))).toHaveLength(1);

    for (const entry of manifest.evals) {
      expect(entry.files).toContain("evals/frontier-stress-test/common");
      expect(entry.files).toContain("assets/skills/repo-harness-plan/references/create.md");
      expect(entry.graders.files_exist).toContain("final-response.md");
      expect(entry.graders.commands_succeed).toContain("git diff --cached --quiet HEAD --");
      expect(entry.anti_graders?.files_not_exist).toContain(".eval-agent-head-changed");
      const forbidden = entry.anti_graders?.files_not_contain
        ?.map((check) => check.pattern).join(" ") ?? "";
      expect(forbidden).toContain("CONTEXT");
      expect(forbidden).toContain("docs/adr");
    }
  });

  test("mounts the treatment only in the treatment arm", () => {
    const config = loadBenchmarkConfig(join(EVAL_ROOT, "benchmark.config.json"));
    expect(config.profiles.with_skill.skillPath).toBe("evals/frontier-stress-test/treatment");
    expect(config.profiles.with_skill.skillMount).toBe("copy");
    expect(config.profiles.without_skill.skillPath).toBeUndefined();
    expect(config.requireDisposableBoundaryForLiveRuns).toBe(true);
    expect(config.summaryPath).toStartWith(".ai/harness/runs/");
  });

  test("rejects a live run in the source checkout before provider execution", () => {
    expect(() => runSkillEvals({
      evalsPath: "evals/frontier-stress-test/evals.json",
      configPath: "evals/frontier-stress-test/benchmark.config.json",
      agent: "codex",
      profile: "with_skill",
    })).toThrow("requires requireDisposableBoundary: true");
  });

  test("rejects loose status matches, downstream questions, and extra questions", () => {
    expect(() => validateFrontierOutput("architecture-event-identity", [
      "Mode: bypass — stress-test is not warranted",
      "Status: Ready — Draft is not needed",
      "Current frontier:",
      "- [UNKNOWN:BLOCKING] Which semantic event identity fields define equality?",
      "Deferred:",
      "- Lock choice?",
      "- Recovery is deferred.",
      "Persistence:",
      "- Record the boundary in Plan and Contract.",
    ].join("\n"))).toThrow();

    expect(() => validateFrontierOutput("architecture-event-identity", [
      "Mode: stress-test",
      "Status: Draft",
      "Current frontier:",
      "- [UNKNOWN:BLOCKING] Which semantic event identity fields define equality?",
      "- [UNKNOWN:BLOCKING] Which normalized fields are canonical?",
      "- [UNKNOWN:BLOCKING] Which idempotency key is stable?",
      "- [UNKNOWN:BLOCKING] Is a fourth question allowed?",
      "Deferred:",
      "- Lock and recovery remain deferred.",
      "Persistence:",
      "- Record the boundary in Plan and Contract.",
    ].join("\n"))).toThrow("question count 4");

    expect(() => validateFrontierOutput("architecture-event-identity", [
      "Mode: stress-test",
      "Status: Draft",
      "Current frontier:",
      "- [UNKNOWN:BLOCKING] Which normalized fields define semantic event identity?",
      "  Recommended default: normalize event type and subject identity.",
      "  Option A: use semantic fields so retries collapse.",
      "  Option B: use an explicit idempotency key so producers own identity.",
      "Deferred:",
      "- Lock and recovery remain deferred.",
      "Persistence:",
      "- Record the boundary in Plan and Contract?",
      "Extra: accepted",
    ].join("\n"))).toThrow();
  });

  test("accepts the bounded unresolved output contract", () => {
    expect(() => validateFrontierOutput("architecture-event-identity", [
      "Mode: stress-test",
      "Status: Draft",
      "Current frontier:",
      "- [UNKNOWN:BLOCKING] Which normalized fields define semantic event identity?",
      "  Recommended default: normalize event type and subject identity.",
      "  Option A: use semantic fields so retries collapse.",
      "  Option B: use an explicit idempotency key so producers own identity.",
      "Deferred:",
      "- Lock mechanics remain deferred.",
      "- Recovery behavior remains deferred.",
      "Persistence:",
      "- Record the chosen boundary in Plan and Contract.",
    ].join("\n"))).not.toThrow();
  });
});
