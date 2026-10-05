import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers, TEMPLATE_DIR } from "./helpers/helper-script-fixture";
import { run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("new-plan helper integration", () => {
  test("new-plan should create timestamped plan without compatibility pointer", () => {
    const cwd = tmpWorkspace("helper-new-plan");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, ".claude/templates"), { recursive: true });
      copyHelpers(cwd);

      copyFileSync(
        join(TEMPLATE_DIR, "plan.template.md"),
        join(cwd, ".claude/templates/plan.template.md")
      );

      const res = run("bash", ["scripts/new-plan.sh", "--slug", "my-feature", "--title", "My Feature"], cwd);
      expect(res.status).toBe(0);

      const plans = readdirSync(join(cwd, "plans")).filter((name) => /^plan-\d{8}-\d{4}-my-feature\.md$/.test(name));
      expect(plans.length).toBe(1);
      const plan = readFileSync(join(cwd, "plans", plans[0]), "utf-8");
      for (const field of ["P1 map:", "P2 trace:", "P3 decision rationale:"]) {
        expect(plan).not.toContain(field);
      }
      expect(plan).toContain("## Workflow Inventory");
      expect(plan).toContain("## Promotion Gate");
      expect(plan).toContain("> **Artifact Level**: work-package");
      expect(plan).toContain("> **Task Contract**:");
      expect(plan).toContain("> **Task Review**:");
      expect(plan).not.toContain("> **Sprint Contract**:");
      expect(plan).not.toContain("> **Sprint Review**:");
      expect(plan).toContain("repo-harness run plan-to-todo --plan");
      expect(plan).toContain(".ai/harness/active-worktree");
      expect(existsSync(join(cwd, "docs/plan.md"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("new-plan creates the same template without 3P fields when no local template exists", () => {
    const cwd = tmpWorkspace("helper-new-plan-template");
    try {
      copyHelpers(cwd);
      const res = run("bash", ["scripts/new-plan.sh", "--slug", "fallback"], cwd);
      expect(res.status).toBe(0);
      const canonical = readFileSync(join(TEMPLATE_DIR, "plan.template.md"), "utf-8");
      expect(readFileSync(join(cwd, ".claude/templates/plan.template.md"), "utf-8")).toBe(canonical);
      const plans = readdirSync(join(cwd, "plans")).filter((name) => /^plan-\d{8}-\d{4}-fallback\.md$/.test(name));
      expect(plans.length).toBe(1);
      const plan = readFileSync(join(cwd, "plans", plans[0]), "utf-8");
      for (const field of ["P1 map:", "P2 trace:", "P3 decision rationale:"]) {
        expect(plan).not.toContain(field);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("generated plans advertise the supported verification-plan command from both template paths", () => {
    const inventory = readFileSync(join(TEMPLATE_DIR, "..", "workflow-contract.v1.json"), "utf-8");
    expect(inventory).toContain('"verification-plan"');
    for (const withLocalTemplate of [true, false]) {
      const cwd = tmpWorkspace(`helper-new-plan-verification-${withLocalTemplate ? "local" : "fallback"}`);
      try {
        copyHelpers(cwd);
        if (withLocalTemplate) {
          mkdirSync(join(cwd, ".claude/templates"), { recursive: true });
          copyFileSync(join(TEMPLATE_DIR, "plan.template.md"), join(cwd, ".claude/templates/plan.template.md"));
        }
        const res = run("bash", ["scripts/new-plan.sh", "--slug", "my-feature", "--title", "My Feature"], cwd);
        expect(res.status).toBe(0);
        const plans = readdirSync(join(cwd, "plans")).filter((name) => /^plan-\d{8}-\d{4}-my-feature\.md$/.test(name));
        expect(plans.length).toBe(1);
        const plan = readFileSync(join(cwd, "plans", plans[0]), "utf-8");
        expect(plan).not.toContain("run verify-contract --contract");
        const artifactStem = plans[0].replace(/^plan-/, "").replace(/\.md$/, "");
        expect(plan).toContain(`repo-harness run verification-plan execute --repo . --contract tasks/contracts/${artifactStem}.contract.md --report-file .ai/harness/runs/${artifactStem}.report.json`);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  }, 30_000);

  test("new-plan should suffix filename with -v2 when same slug/timestamp already exists", () => {
    const cwd = tmpWorkspace("helper-plan-collision");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, ".claude/templates"), { recursive: true });
      copyHelpers(cwd);

      copyFileSync(
        join(TEMPLATE_DIR, "plan.template.md"),
        join(cwd, ".claude/templates/plan.template.md")
      );

      const fakeBin = join(cwd, "fakebin");
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(
        join(fakeBin, "date"),
        [
          "#!/bin/bash",
          "if [[ \"${1:-}\" == \"+%Y%m%d-%H%M\" ]]; then",
          "  echo \"20260304-1430\"",
          "else",
          "  /bin/date \"$@\"",
          "fi",
          "",
        ].join("\n")
      );
      expect(run("chmod", ["+x", "fakebin/date"], cwd).status).toBe(0);
      const env = { PATH: `${fakeBin}:${process.env.PATH ?? ""}` };

      const first = run("bash", ["scripts/new-plan.sh", "--slug", "collision"], cwd, env);
      expect(first.status).toBe(0);
      const second = run("bash", ["scripts/new-plan.sh", "--slug", "collision"], cwd, env);
      expect(second.status).toBe(0);

      const plans = readdirSync(join(cwd, "plans"));
      expect(plans).toContain("plan-20260304-1430-collision.md");
      expect(plans).toContain("plan-20260304-1430-collision-v2.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
