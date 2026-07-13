import { describe, test, expect } from "bun:test";
import { assembleTemplate } from "../scripts/assemble-template";

function extractHeadings(content: string, levels: Array<"## " | "### ">): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => levels.some((level) => line.startsWith(level)));
}

function countLines(content: string): number {
  return content.split("\n").length;
}

function unresolvedPlaceholders(content: string): string[] {
  const matches = content.match(/\{\{[^{}]+\}\}/g) ?? [];
  return [...new Set(matches)].filter(
    (token) => !/^\{\{\s*secrets\.[^}]+\s*\}\}$/.test(token)
  );
}

describe("Quick Mode vs Full Mode Parity", () => {
  const quickModeOutput = assembleTemplate({
    planType: "C",
    quickMode: true,
    variables: {
      PROJECT_NAME: "TestProject",
    },
  });

  const fullModeOutput = assembleTemplate({
    planType: "C",
    variables: {
      PROJECT_NAME: "TestProject",
      USER_NAME: "Developer",
      SERVICE_TARGET: "B2B SaaS Internal Users",
      INTERACTION_STYLE: "Professional and thorough",
      PROJECT_STRUCTURE: "src/\n  modules/\ntests/",
      TECH_STACK_TABLE: "| Frontend | React |",
      PROHIBITIONS: "- No any types",
    },
  });

  test("should produce output in both modes", () => {
    expect(quickModeOutput.length).toBeGreaterThan(0);
    expect(fullModeOutput.length).toBeGreaterThan(0);
  });

  test("should include Iron Rules section in both modes", () => {
    expect(quickModeOutput).toContain("## Iron Rules");
    expect(fullModeOutput).toContain("## Iron Rules");
  });

  test("should include Development Protocol in both modes", () => {
    expect(quickModeOutput).toContain("Development Protocol");
    expect(fullModeOutput).toContain("Development Protocol");
  });

  test("should include Workflow Rules in both modes", () => {
    expect(quickModeOutput).toContain("Workflow Rules");
    expect(fullModeOutput).toContain("Workflow Rules");
  });

  test("should produce same sections in both modes", () => {
    const quickSections = extractHeadings(quickModeOutput, ["## "]);
    const fullSections = extractHeadings(fullModeOutput, ["## "]);
    expect(quickSections).toEqual(fullSections);
  });

  test("should have same structure regardless of mode", () => {
    const quickStructure = extractHeadings(quickModeOutput, ["## ", "### "]);
    const fullStructure = extractHeadings(fullModeOutput, ["## ", "### "]);
    expect(quickStructure).toEqual(fullStructure);
  });
});

describe("Core Philosophy Preservation", () => {
  const output = assembleTemplate({
    planType: "C",
    variables: {
      PROJECT_NAME: "TestProject",
    },
  });

  test("output should contain PRODUCT TRUTH", () => {
    expect(output).toContain("PRODUCT TRUTH");
  });

  test("output should contain MUTABLE LAYER", () => {
    expect(output).toContain("MUTABLE LAYER");
  });

  test("output should contain NEW_FEATURE_FLOW", () => {
    expect(output).toContain("NEW_FEATURE_FLOW");
  });

  test("output should contain BUG_FIX_FLOW", () => {
    expect(output).toContain("BUG_FIX_FLOW");
  });

  test("output should contain core philosophy", () => {
    expect(output).toContain("Code is toilet paper");
  });

  test("output should contain source-of-truth principle", () => {
    expect(output.toLowerCase()).toContain("product truth");
    expect(output.toLowerCase()).toContain("execution truth");
  });

  test("output should contain Good Taste principles", () => {
    expect(output).toContain("Good Taste");
  });

  test("output should contain Zero Compatibility Debt", () => {
    expect(output).toContain("Zero Compatibility Debt");
  });
});

describe("Cloudflare Conditional Inclusion", () => {
  test("Plan C should include Cloudflare section", () => {
    const output = assembleTemplate({
      planType: "C",
      variables: { PROJECT_NAME: "Test" },
    });
    expect(output).toContain("Cloudflare Deployment");
  });

  test("Plan B (Vite client app shell) should include Cloudflare section", () => {
    const output = assembleTemplate({
      planType: "B",
      variables: { PROJECT_NAME: "Test" },
    });
    expect(output).toContain("Cloudflare Deployment");
  });

  test("Plan F (Mobile) should exclude Cloudflare section", () => {
    const output = assembleTemplate({
      planType: "F",
      variables: { PROJECT_NAME: "Test" },
    });
    expect(output).not.toContain("Cloudflare Deployment");
  });

  test("Plan J (TUI) should exclude Cloudflare section", () => {
    const output = assembleTemplate({
      planType: "J",
      variables: { PROJECT_NAME: "Test" },
    });
    expect(output).not.toContain("Cloudflare Deployment");
  });

  test("Explicit --no-cloudflare should exclude section", () => {
    const output = assembleTemplate({
      planType: "C",
      variables: { PROJECT_NAME: "Test" },
      cloudflareNative: false,
    });
    expect(output).not.toContain("Cloudflare Deployment");
  });
});

describe("Output Quality Gates", () => {
  test("should enforce runtime profile defaults in CLAUDE output", () => {
    const output = assembleTemplate({
      planType: "C",
      variables: { PROJECT_NAME: "RuntimeDefaults" },
    });

    const agentsOutput = assembleTemplate({
      target: "agents",
      planType: "C",
      variables: { PROJECT_NAME: "RuntimeDefaults" },
    });

    expect(output).toContain("Default Runtime Profile");
    expect(output).toContain("Plan-only (recommended)");
    expect(output).toContain("MODE: Plan-only (recommended)");
    expect(output).toContain(
      "EXECUTION_CONTEXT: contract-level work starts in a linked codex/<slug> worktree when policy enables it"
    );
    expect(output).toContain("COMMIT_POLICY: explicit commits after green checks; no automatic checkpoint hook");
    expect(output).toContain("Plan-only by default for file mutations");
    expect(output).toContain("Primary worktree warns by default; enforce via `.claude/.require-worktree`");
    expect(output).toContain("Treat contract-level execution as worktree-first");
    expect(agentsOutput).toContain("sandbox_mode=platform-default, approval_policy=on-failure");
  });

  test("should reference project-local reference configs", () => {
    const output = assembleTemplate({
      planType: "B",
      variables: { PROJECT_NAME: "Test" },
    });

    expect(output).toContain("docs/reference-configs/harness-overview.md");
    expect(output).toContain("docs/reference-configs/agentic-development-flow.md");
    expect(output).toContain("docs/reference-configs/external-tooling.md");
    expect(output).toContain("docs/reference-configs/sprint-contracts.md");
    expect(output).toContain("docs/reference-configs/evaluator-rubric.md");
    expect(output).toContain("docs/reference-configs/global-working-rules.md");
    expect(output).toContain("docs/reference-configs/handoff-protocol.md");
    expect(output).not.toContain("assets/reference-configs/");
  });

  test("should use tasks files as primary workflow contracts", () => {
    const claude = assembleTemplate({
      planType: "B",
      variables: { PROJECT_NAME: "Test" },
    });

    const agents = assembleTemplate({
      target: "agents",
      planType: "B",
      variables: { PROJECT_NAME: "Test" },
    });

    expect(claude).toContain("tasks/todos.md");
    expect(claude).toContain("tasks/lessons.md");
    expect(agents).toContain("tasks/todos.md");
    expect(agents).toContain("tasks/lessons.md");
    expect(claude).toContain("product truth");
    expect(agents).toContain("repo-local artifact files");
    expect(claude).toContain("tasks/contracts/");
    expect(claude).toContain("Waza");
    expect(claude).toContain("gbrain");
    expect(agents).toContain("tasks/reviews/");
    expect(claude).toContain("Self-Improvement Loop");
    expect(agents).toContain("Self-Improvement Loop");
    expect(agents).toContain("parent agent with `geju` pre-contract framing and parent-owned P1/P2/P3");
    expect(agents.toLowerCase()).not.toContain("gstack");
    expect(agents).toContain("repo-harness run check-agent-tooling --host both --check-updates");
    expect(agents).toContain("repo-harness run check-task-sync");
    expect(agents).toContain("repo-harness run check-task-workflow --strict");
    expect(agents).toContain("repo-harness run verify-contract --contract <active-plan-contract> --strict");
    expect(agents).toContain(".ai/harness/checks/latest.json");
    expect(agents).toContain("new plans/plan-{timestamp}-{slug}.md");
    expect(claude).toContain(".ai/harness/active-plan");
    expect(claude).toContain(".ai/harness/active-worktree");
    expect(claude).not.toContain(".claude/.active-plan");
    expect(claude).not.toContain("legacy fallback");
    expect(agents).toContain("workflow inventory before implementation");
    expect(claude).toContain("tasks/workstreams/");
    expect(claude).toContain("docs/CHANGELOG.md");
    expect(agents).toContain("tasks/workstreams/");
    expect(agents).not.toContain("docs/PROGRESS.md");
  });

  test("should stay within line-count budgets", () => {
    const claudeNoCloudflare = assembleTemplate({
      planType: "B",
      variables: { PROJECT_NAME: "Test" },
    });
    const claudeWithCloudflare = assembleTemplate({
      planType: "C",
      variables: { PROJECT_NAME: "Test" },
    });
    const agentsWithCloudflare = assembleTemplate({
      target: "agents",
      planType: "C",
      variables: { PROJECT_NAME: "Test" },
    });

    expect(countLines(claudeNoCloudflare)).toBeLessThanOrEqual(500);
    expect(countLines(claudeWithCloudflare)).toBeLessThanOrEqual(500);
    expect(countLines(agentsWithCloudflare)).toBeLessThanOrEqual(260);
  });

  test("should not leak unresolved template placeholders", () => {
    const claude = assembleTemplate({
      planType: "C",
      quickMode: true,
      variables: { PROJECT_NAME: "NoLeak" },
    });

    const agents = assembleTemplate({
      target: "agents",
      planType: "C",
      quickMode: true,
      variables: { PROJECT_NAME: "NoLeak" },
    });

    expect(unresolvedPlaceholders(claude)).toEqual([]);
    expect(unresolvedPlaceholders(agents)).toEqual([]);
  });

  test("should not include AI-native scaffold profile text by default", () => {
    const output = assembleTemplate({
      planType: "C",
      variables: { PROJECT_NAME: "PlainSaaS" },
    });

    expect(output).not.toContain("AI-Native Profile");
    expect(output).not.toContain("AG-UI required");
    expect(output).not.toContain("Bun/Hono `/api/agent/run`");
  });

  test("should render Plan C as a single Start Workers webapp by default", () => {
    const output = assembleTemplate({
      planType: "C",
      variables: { PROJECT_NAME: "StartSaaS" },
    });

    expect(output).toContain("Webapp Rendering Model");
    expect(output).toContain("TanStack Start + Cloudflare Workers Webapp Structure");
    expect(output).toContain("one `apps/web` Worker");
    expect(output).toContain("`/` SSR/prerender-capable landing");
    expect(output).toContain("`/app` client-only route boundary");
    expect(output).toContain("wrangler deploy");
    expect(output).not.toContain("default `apps/marketing` + `apps/web` split");
  });

  test("should keep Plan B client-only without Start SSR claims", () => {
    const output = assembleTemplate({
      planType: "B",
      variables: { PROJECT_NAME: "ClientTool" },
    });

    expect(output).toContain("Client-only Vite + TanStack Router/Query");
    expect(output).toContain("No SSR guarantee");
    expect(output).not.toContain("TanStack Start + Cloudflare Workers Webapp Structure");
    expect(output).not.toContain("route-level `ssr: false`");
  });

  test("should include AI-native runtime console overlay when selected", () => {
    const output = assembleTemplate({
      planType: "C",
      variables: {
        PROJECT_NAME: "AgentConsole",
        AI_NATIVE_PROFILE: "runtime-console",
      },
    });

    expect(output).toContain("AI-native Runtime Console Overlay");
    expect(output).toContain("AI-Native Profile");
    expect(output).toContain("Profile: runtime-console");
    expect(output).toContain("AG-UI required");
    expect(output).toContain("assistant-ui + custom run console");
    expect(output).toContain("Bun/Hono `/api/agent/run`");
    expect(output).toContain("A2UI optional experiment, not production default");
  });

  test("should include collaborative editor overlay when selected", () => {
    const output = assembleTemplate({
      planType: "C",
      variables: {
        PROJECT_NAME: "DocWorkspace",
        AI_NATIVE_PROFILE: "collaborative-editor",
      },
    });

    expect(output).toContain("AI-native Collaborative Editor Overlay");
    expect(output).toContain("Profile: collaborative-editor");
    expect(output).toContain("Plate");
    expect(output).toContain("Loro CRDT");
    expect(output).toContain("Bun/Hono sync");
  });
});
