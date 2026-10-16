import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { planAdoption } from "../src/core/adoption/plan";

const ROOT = join(import.meta.dir, "..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf-8");
}

describe("UX feature pre-implementation guard", () => {
  test("keeps the convention available on explicit request without a workflow stage gate", () => {
    const assetFlow = read("assets/reference-configs/agentic-development-flow.md");

    expect(assetFlow).toContain("Ordinary tasks live in the PR description");
    expect(assetFlow).toContain("Ordinary work has no plan/contract/review/notes");

    const shown = spawnSync(
      "bun",
      [join(ROOT, "src/cli/index.ts"), "docs", "show", "ux-feature-guard"],
      { cwd: ROOT, encoding: "utf-8" },
    );
    expect(shown.status).toBe(0);
    expect(shown.stdout).toContain("# UX Feature Guard");
  }, 30_000);

  test('retains the guard schema in optional self-host and downstream design briefs without automatic projection', () => {
    for (const copy of [read('assets/templates/design-brief.template.md'), read('.claude/templates/design-brief.template.md')]) {
      for (const field of ['## UX Feature Guard', 'Exact payload acted on', '### Authority & Reuse Map',
        '### Observable & Copy Contract', 'Positive, negative, and authority-failure Given/When/Then scenarios',
        'UX-{{SLUG}}-P1', 'Carry these IDs unchanged into the task contract']) expect(copy).toContain(field);
    }
    expect(read('.claude/templates/design-brief.template.md')).toContain('Optional document');
    for (const helper of ['scripts/ensure-task-workflow.sh', 'assets/templates/helpers/ensure-task-workflow.sh']) {
      expect(read(helper)).not.toContain('DESIGN_BRIEF_TEMPLATE_EOF');
      expect(read(helper)).toContain('no plan/contract/review/notes');
    }
  });

  test("keeps explicit PRD guidance while retiring automatic prompt guard advice", () => {
    const prd = read("assets/skills/repo-harness-product/references/prd.md");


    expect(prd).toContain("first read `repo-harness docs show ux-feature-guard`");
    expect(prd).toContain("do not restate or replace that field schema in the PRD");
    expect(existsSync(join(ROOT, "src/cli/hook/prompt-handler.ts"))).toBe(false);
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
