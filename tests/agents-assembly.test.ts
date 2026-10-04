import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assembleTemplate,
  getPartials,
  parseTarget,
} from "../scripts/assemble-template";

describe("AGENTS Target Assembly", () => {
  test('both generated targets keep the root task flow and optional planning boundary', () => {
    const root = join(import.meta.dir, '..');
    const flow = 'Read the current request and repo-local agent context, work on a branch, make bounded commits, verify once, then report the PR outcome.';
    const ordinary = 'Ordinary tasks use the PR description: goal, scope, changes, verification, risk and rollback. No mandatory plan/contract/review/notes chain; notes are only for non-obvious decisions.';
    for (const target of ['claude', 'agents'] as const) {
      const source = readFileSync(join(root, target === 'claude' ? 'CLAUDE.md' : 'AGENTS.md'), 'utf8');
      const output = assembleTemplate({ target, planType: 'C', variables: { PROJECT_NAME: 'TestProject' } });
      for (const rule of [flow, ordinary]) {
        expect(source).toContain(rule);
        expect(output).toContain(rule);
      }
      expect(output).not.toContain('PHASES: for explicit plans, research -> spec -> plan -> contract');
      expect(output).not.toContain('Enter plan mode for non-trivial tasks');
      expect(output).not.toContain('Do not implement until the user explicitly asks to implement');
      expect(output).not.toMatch(/capture-plan[^\n]*(?:--artifact-level|--promotion-reason|--source-ref|--status|--execute)/);
    }
  });

  test("should read agents partials in correct order", () => {
    const partials = getPartials("agents");
    expect(partials.length).toBeGreaterThanOrEqual(8);

    for (let i = 1; i < partials.length; i++) {
      expect(partials[i].order).toBeGreaterThan(partials[i - 1].order);
    }
  });

  test("should include required AGENTS sections", () => {
    const output = assembleTemplate({
      target: "agents",
      planType: "C",
      variables: { PROJECT_NAME: "TestProject" },
    });

    expect(output).toContain("## Operating Mode");
    expect(output).toContain("## Workflow Orchestration");
    expect(output).toContain("## Task Management Protocol");
    expect(output).toContain("## Coding Constraints");
    expect(output).toContain("## Quality & Safety");
    expect(output).toContain("do not run the full suite for every small change");
    expect(output).toContain("## Deep Docs Index");
    expect(output).toContain("### First Principles");
    expect(output).toContain("### Single Source of Truth");
    expect(output).toContain("Self-Improvement Loop");
    expect(output).toContain("tasks/todos.md");
    expect(output).toContain("tasks/lessons.md");
    expect(output).toContain("sync tasks/");
    expect(output).toContain("Default to **Plan-only**.");
    expect(output).toContain("Runtime profile: Plan-only (recommended).");
    expect(output).toContain("Recovery profile: `hybrid`.");
    expect(output).toContain("State profile: `file-backed`.");
    expect(output).toContain("Context profile: `stable-root-progressive-subdir`.");
    expect(output).toContain("Codex runtime expectation: `sandbox_mode=platform-default, approval_policy=on-failure`.");
    expect(output).toContain(".claude/.require-worktree");
    expect(output).toContain(".ai/harness/policy.json");
    expect(output).toContain(".ai/context/context-map.json");
    expect(output).toContain("Agentic skill routing");
    expect(output).toContain("parent agent with `geju` pre-contract framing and parent-owned P1/P2/P3");
    expect(output.toLowerCase()).not.toContain("gstack");
    expect(output).toContain("Waza `/think`, `/hunt`, `/check`");
    expect(output).toContain(".ai/harness/active-plan as authoritative only for this worktree");
    expect(output).toContain("repo-harness run new-spec");
    expect(output).toContain("repo-harness run new-plan");
    expect(output).toContain("The main agent decides whether to spawn based on task breadth");
    expect(output).toContain("Do not ask the user for spawn confirmation");
    expect(output).toContain("repo-harness run check-task-sync");
    expect(output).not.toContain("repo-harness run check-task-workflow --strict");
    expect(output).toContain("Write a plan before cross-module changes, architecture changes, and dependency upgrades. Small changes do not need a plan.");
    expect(output).toContain("Run the declared Verification Plan checks once and record their actual results");
    expect(output).not.toContain("verify-sprint --prepare-acceptance");
    expect(output).toContain("bounded follow-up edits");
    expect(output).not.toContain("before any done/completed response");
    expect(output).toContain("Which workflow artifacts were updated");
  });

  test("should preserve core governance semantics between CLAUDE and AGENTS", () => {
    const claude = assembleTemplate({
      target: "claude",
      planType: "C",
      variables: { PROJECT_NAME: "TestProject" },
    });

    const agents = assembleTemplate({
      target: "agents",
      planType: "C",
      variables: { PROJECT_NAME: "TestProject" },
    });

    expect(claude.toLowerCase()).toContain("verification");
    expect(agents.toLowerCase()).toContain("verification");
    for (const output of [claude, agents]) {
      expect(output).toContain("Docs-only or ledger-closeout");
      expect(output).toContain("High-risk, cross-module");
      expect(output).toContain("preserve stronger contract and CI requirements");
    }
    expect(claude.toLowerCase()).toContain("plan");
    expect(agents.toLowerCase()).toContain("plan");
    expect(claude.toLowerCase()).toContain("product truth");
    expect(agents.toLowerCase()).toContain("product truth");
    expect(claude.toLowerCase()).toContain("execution truth");
    expect(agents.toLowerCase()).toContain("single source of truth");
    expect(claude).toContain("RECOVERY: hybrid");
    expect(agents).toContain("Recovery profile: `hybrid`.");
    expect(claude).toContain("use `geju` for pre-contract framing");
    expect(agents).toContain("parent agent with `geju` pre-contract framing and parent-owned P1/P2/P3");
    expect(claude.toLowerCase()).not.toContain("gstack");
    expect(agents.toLowerCase()).not.toContain("gstack");
  });

  test("should render cloudflare section for both targets when enabled by plan", () => {
    const claude = assembleTemplate({
      target: "claude",
      planType: "C",
      variables: { PROJECT_NAME: "TestProject" },
    });

    const agents = assembleTemplate({
      target: "agents",
      planType: "C",
      variables: { PROJECT_NAME: "TestProject" },
    });

    expect(claude).toContain("Cloudflare Deployment");
    expect(agents).toContain("Cloudflare Deployment Notes");
  });

  test("should omit cloudflare section for both targets when excluded by plan", () => {
    const claude = assembleTemplate({
      target: "claude",
      planType: "F",
      variables: { PROJECT_NAME: "TestProject" },
    });

    const agents = assembleTemplate({
      target: "agents",
      planType: "F",
      variables: { PROJECT_NAME: "TestProject" },
    });

    expect(claude).not.toContain("Cloudflare Deployment");
    expect(agents).not.toContain("Cloudflare Deployment Notes");
  });

  test("should reject invalid target values", () => {
    expect(() => parseTarget("invalid-target")).toThrow("Invalid target");
  });
});
