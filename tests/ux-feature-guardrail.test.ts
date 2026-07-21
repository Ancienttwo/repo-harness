import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { planAdoption } from "../src/core/adoption/plan";

const ROOT = join(import.meta.dir, "..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf-8");
}

function designBriefProjection(script: string): string {
  const body = script.match(
    /<<'DESIGN_BRIEF_TEMPLATE_EOF'\n([\s\S]*?)\nDESIGN_BRIEF_TEMPLATE_EOF/,
  )?.[1];
  if (body === undefined) throw new Error("design brief projection heredoc missing");
  return `${body}\n`;
}

describe("UX feature pre-implementation guard", () => {
  test("ships one canonical runtime convention with a byte-identical self-host mirror", () => {
    const asset = read("assets/reference-configs/ux-feature-guard.md");
    const mirror = read("docs/reference-configs/ux-feature-guard.md");

    expect(mirror).toBe(asset);
    expect(asset).toContain("Instruction and payload are never interchangeable");
    expect(asset).toContain("design-brief template owns the exact Guard Card field schema");
    expect(asset).toContain("Do not change gameplay");
    expect(asset).toContain("does not synthesize a fallback value or report success");
    expect(asset).toContain("positive, negative/non-goal, and failure");
    expect(asset).toContain("FogMoe/agents/blob/main/skills/ux-writing/SKILL.md");
    expect(asset).toContain("validator, ledger, sidecar, catalog, scoring model");
    expect(asset).toContain("Review and test");
    expect(asset).toContain("never a competing authority");
  });

  test("routes UX feature creation through the guard before the existing brief and BDD flow", () => {
    const assetFlow = read("assets/reference-configs/agentic-development-flow.md");
    const repoFlow = read("docs/reference-configs/agentic-development-flow.md");

    expect(repoFlow).toBe(assetFlow);
    expect(assetFlow).toContain("repo-harness docs show ux-feature-guard");
    expect(assetFlow).toContain("then the existing design brief and BDD scenarios");

    const shown = spawnSync(
      "bun",
      [join(ROOT, "src/cli/index.ts"), "docs", "show", "ux-feature-guard"],
      { cwd: ROOT, encoding: "utf-8" },
    );
    expect(shown.status).toBe(0);
    expect(shown.stdout).toContain("# UX Feature Guard");
  });

  test("projects the same guard card through every design-brief template authority", () => {
    const template = read("assets/templates/design-brief.template.md");
    const copies = [
      read(".claude/templates/design-brief.template.md"),
      read("scripts/ensure-task-workflow.sh"),
      read("assets/templates/helpers/ensure-task-workflow.sh"),
    ];

    expect(copies[0]).toBe(template);
    expect(designBriefProjection(copies[1])).toBe(template);
    expect(designBriefProjection(copies[2])).toBe(template);
    for (const copy of copies) {
      expect(copy).toContain("## UX Feature Guard (行為前圍欄)");
      expect(copy).toContain("Exact payload acted on");
      expect(copy).toContain("### Authority & Reuse Map");
      expect(copy).toContain("### Observable & Copy Contract");
      expect(copy).toContain("Positive, negative, and authority-failure Given/When/Then scenarios");
      expect(copy).toContain("UX-{{SLUG}}-P1");
      expect(copy).toContain("Carry these IDs unchanged into the task contract");
    }
    expect(copies[2]).toBe(copies[1]);
  });

  test("keeps PRD and prompt guidance short and points both at the canonical guard", () => {
    const prd = read("assets/skill-commands/repo-harness-prd/SKILL.md");
    const promptHandler = read("src/cli/hook/prompt-handler.ts");

    expect(prd).toContain("first read `repo-harness docs show ux-feature-guard`");
    expect(prd).toContain("do not restate or replace that field schema in the PRD");
    expect(promptHandler).toContain("[UXFeatureGuard]");
    expect(promptHandler).toContain("separate instruction from payload");
    expect(promptHandler).toContain("no parallel authority or compatibility fallback");
    // Frontend-scoped gate (BDD² follow-through): [UXFeatureGuard] is pushed
    // under its own frontend/UI-noun classifier, not the generic BDD gate.
    expect(promptHandler).toContain("if (shouldEmitUxFeatureGuardAdvice(context))");
  });

  test("includes the convention in minimal-agentic adoption without a second product surface", () => {
    const repo = mkdtempSync(join(tmpdir(), "repo-harness-ux-guard-"));
    try {
      const plan = planAdoption({ repoRoot: repo, mode: "standard" });
      const operation = plan.operations.find(
        (entry) => entry.path === "docs/reference-configs/ux-feature-guard.md",
      );
      expect(operation?.kind).toBe("writeFile");
      if (!operation || operation.kind !== "writeFile") {
        throw new Error("expected UX feature guard adoption write");
      }
      expect(operation.content).toContain("repo-harness docs show ux-feature-guard");
      expect(plan.operations.some((entry) => entry.path?.includes("bdd") && entry.path?.includes("ledger"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
