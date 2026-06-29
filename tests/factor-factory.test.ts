import { describe, test, expect } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { assembleTemplate } from "../scripts/assemble-template";

const ROOT = join(import.meta.dir, "..");
const FACTOR_FACTORY_SMOKE_TIMEOUT_MS = 15000;

function bootstrapRepo(prefix: string, env: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), `${prefix}-repo-`));
  const res = spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
  expect(res.status).toBe(0);
  return cwd;
}

describe("Factor Factory", () => {
  test("Plan G scaffolding installs factor artifacts and Plan C does not", () => {
    const planGCwd = bootstrapRepo("factor-plan-g", { REPO_HARNESS_PLAN_TYPE: "G" });
    const planCCwd = bootstrapRepo("factor-plan-c");

    try {
      expect(existsSync(join(planGCwd, "tasks/factors/registry.json"))).toBe(true);
      expect(existsSync(join(planGCwd, "tasks/factors/promoted"))).toBe(true);
      expect(existsSync(join(planGCwd, ".claude/.factor-cache/candidates"))).toBe(true);
      expect(existsSync(join(planGCwd, ".ai/harness/scripts/factor-lab-new.sh"))).toBe(false);
      expect(existsSync(join(planGCwd, ".claude/factor-factory/hypothesis.template.md"))).toBe(true);

      expect(existsSync(join(planCCwd, "tasks/factors"))).toBe(false);
      expect(existsSync(join(planCCwd, ".ai/harness/scripts/factor-lab-new.sh"))).toBe(false);
    } finally {
      rmSync(planGCwd, { recursive: true, force: true });
      rmSync(planCCwd, { recursive: true, force: true });
    }
  }, FACTOR_FACTORY_SMOKE_TIMEOUT_MS);

  test("factor lifecycle commands create, promote, reject, and check registry state", () => {
    const cwd = bootstrapRepo("factor-flow", { REPO_HARNESS_PLAN_TYPE: "G" });

    try {
      const newRes = spawnSync("bun", [join(ROOT, "src/cli/index.ts"), "run", "factor-lab-new", "--name", "Mean Reversion"], {
        cwd,
        encoding: "utf-8",
      });
      expect(newRes.status).toBe(0);
      expect(existsSync(join(cwd, ".claude/.factor-cache/candidates/mean-reversion/hypothesis.md"))).toBe(true);

      let registry = JSON.parse(readFileSync(join(cwd, "tasks/factors/registry.json"), "utf-8"));
      expect(registry.candidates.some((entry: { slug: string }) => entry.slug === "mean-reversion")).toBe(true);

      writeFileSync(
        join(cwd, ".claude/.factor-cache/candidates/mean-reversion/backtest-summary.md"),
        "# Factor Backtest Summary\n\n## Transaction Cost Review\n\n- Assumption: 10bps\n"
      );
      mkdirSync(join(cwd, ".claude/.factor-cache/candidates/mean-reversion/raw-backtest"), { recursive: true });
      writeFileSync(
        join(cwd, ".claude/.factor-cache/candidates/mean-reversion/raw-backtest/train-results.json"),
        JSON.stringify({ sharpe: 1.2 }, null, 2)
      );

      const promoteRes = spawnSync("bun", [join(ROOT, "src/cli/index.ts"), "run", "factor-lab-promote", "--name", "Mean Reversion"], {
        cwd,
        encoding: "utf-8",
      });
      expect(promoteRes.status).toBe(0);
      expect(existsSync(join(cwd, "tasks/factors/promoted/mean-reversion/hypothesis.md"))).toBe(true);
      expect(existsSync(join(cwd, "tasks/factors/promoted/mean-reversion/backtest-data/train-results.json"))).toBe(true);

      registry = JSON.parse(readFileSync(join(cwd, "tasks/factors/registry.json"), "utf-8"));
      expect(registry.candidates.some((entry: { slug: string }) => entry.slug === "mean-reversion")).toBe(false);
      expect(registry.promoted.some((entry: { slug: string }) => entry.slug === "mean-reversion")).toBe(true);

      const secondNewRes = spawnSync("bun", [join(ROOT, "src/cli/index.ts"), "run", "factor-lab-new", "--name", "Volume Spike"], {
        cwd,
        encoding: "utf-8",
      });
      expect(secondNewRes.status).toBe(0);

      const rejectRes = spawnSync(
        "bun",
        [join(ROOT, "src/cli/index.ts"), "run", "factor-lab-reject", "--name", "Volume Spike", "--reason", "Too correlated"],
        {
          cwd,
          encoding: "utf-8",
        }
      );
      expect(rejectRes.status).toBe(0);

      registry = JSON.parse(readFileSync(join(cwd, "tasks/factors/registry.json"), "utf-8"));
      expect(registry.rejected.some((entry: { slug: string; reason: string }) => entry.slug === "volume-spike" && entry.reason === "Too correlated")).toBe(true);

      const checkRes = spawnSync("bun", [join(ROOT, "src/cli/index.ts"), "run", "factor-lab-check"], {
        cwd,
        encoding: "utf-8",
      });
      expect(checkRes.status).toBe(0);
      expect(checkRes.stdout).toContain("Candidates: 0");
      expect(checkRes.stdout).toContain("Promoted: 1");
      expect(checkRes.stdout).toContain("Rejected: 1");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, FACTOR_FACTORY_SMOKE_TIMEOUT_MS);

  test("factor templates and template assembly expose Plan G workflow", () => {
    const registryTemplate = JSON.parse(
      readFileSync(join(ROOT, "assets/templates/factor-factory/factor-registry.template.json"), "utf-8")
    );
    expect(Array.isArray(registryTemplate.candidates)).toBe(true);
    expect(Array.isArray(registryTemplate.promoted)).toBe(true);
    expect(Array.isArray(registryTemplate.rejected)).toBe(true);

    const hypothesisTemplate = readFileSync(
      join(ROOT, "assets/templates/factor-factory/factor-hypothesis.template.md"),
      "utf-8"
    );
    expect(hypothesisTemplate).toContain("---");
    expect(hypothesisTemplate).toContain("data_deps:");

    const planGOutput = assembleTemplate({
      planType: "G",
      variables: { PROJECT_NAME: "QuantLab" },
    });
    const planCOutput = assembleTemplate({
      planType: "C",
      variables: { PROJECT_NAME: "B2BApp" },
    });

    expect(planGOutput).toContain("tasks/factors/registry.json");
    expect(planGOutput).toContain("repo-harness run factor-lab-new");
    expect(planCOutput).not.toContain("tasks/factors/registry.json");
  });
});
