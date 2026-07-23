import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { assertChatGptMcpContract } from "./helpers/chatgpt-mcp-contract";

// SSD-06 migration: the pre-cutover 19-facade public action command surface
// (all living flat under assets/skill-commands/) collapses into the plan's
// 10 target canonical packages spread across assets/skill-commands/ (the 3
// survivors evolving in place) and assets/skills/ (the 5 newly-activated
// canonical packages plus the pre-existing cross-review provider-skill),
// root SKILL.md (the router itself), and the classification-only
// merge-gate manifest entry (no SKILL.md file at all). This file's oracle
// migrates: every semantic content assertion that still applies is relocated
// to the new file/reference that now owns that rule paragraph; assertions
// that pinned a fully-retired facade's own specific automation (autoplan's
// self-review passes) are deleted outright since no successor implements
// that behavior.

const ROOT = join(import.meta.dir, "..");
const COMMAND_ROOT = join(ROOT, "assets", "skill-commands");
const SKILLS_ROOT = join(ROOT, "assets", "skills");

const TARGET_CANONICAL_PACKAGES = [
  "repo-harness",
  "repo-harness-setup",
  "repo-harness-plan",
  "repo-harness-product",
  "repo-harness-check",
  "repo-harness-ship",
  "repo-harness-architecture",
  "repo-harness-cross-review",
  "merge-gate",
  "repo-harness-chatgpt",
];

const TARGET_FACADE_KIND_PACKAGES = [
  "repo-harness-setup",
  "repo-harness-plan",
  "repo-harness-check",
  "repo-harness-product",
  "repo-harness-ship",
  "repo-harness-architecture",
];

function readCommand(name: string): string {
  return readFileSync(join(COMMAND_ROOT, name, "SKILL.md"), "utf-8");
}

function readSkillPackage(name: string): string {
  return readFileSync(join(SKILLS_ROOT, name, "SKILL.md"), "utf-8");
}

function readReference(pkg: string, reference: string): string {
  return readFileSync(join(SKILLS_ROOT, pkg, "references", reference), "utf-8");
}

const RUNTIME_RED_FLAGS = [
  /在 Claude Code/,
  /Claude Code skill/,
  /Claude Code 用户/,
  /Cursor only/,
  /Codex 中/,
  /^\[!\[Claude Code/,
  /~\/\.claude\/skills\/[a-z]/,
  /\/plugin install\b/,
];

describe("repo-harness action command skills", () => {
  test("manifest exposes exactly the target facade-kind surface", () => {
    const manifest = JSON.parse(readFileSync(join(COMMAND_ROOT, "manifest.json"), "utf-8"));
    expect(manifest.surface).toBe("repo-harness-cli-hooks-command-facades");
    expect(manifest.router).toBe("repo-harness");
    const facadeNames = manifest.packages
      .filter((entry: { kind: string }) => entry.kind === "facade")
      .map((entry: { name: string }) => entry.name)
      .sort();
    expect(facadeNames).toEqual([...TARGET_FACADE_KIND_PACKAGES].sort());
    expect(manifest.nonPublicInternalSteps).toEqual([
      "hooks-init",
      "docs-init",
      "create-project-dirs",
    ]);
  });

  test("manifest declares all 10 target canonical packages from the plan's target package table", () => {
    const manifest = JSON.parse(readFileSync(join(COMMAND_ROOT, "manifest.json"), "utf-8"));
    const names = manifest.packages.map((entry: { name: string }) => entry.name);
    for (const pkg of TARGET_CANONICAL_PACKAGES) {
      expect(names).toContain(pkg);
    }
    const mergeGate = manifest.packages.find((entry: { name: string }) => entry.name === "merge-gate");
    expect(mergeGate.kind).toBe("judge");
    expect(mergeGate.hosts).toEqual([]);
    expect(mergeGate.profiles).toEqual([]);
  });

  test("each surviving skill-commands facade is a thin standalone skill facade", () => {
    for (const command of ["repo-harness-check", "repo-harness-ship", "repo-harness-architecture"]) {
      const path = join(COMMAND_ROOT, command, "SKILL.md");
      expect(existsSync(path)).toBe(true);
      const body = readCommand(command);
      const frontmatter = body.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
      expect(frontmatter).toContain(`name: ${command}`);
      expect(frontmatter).toContain("description:");
      expect(frontmatter).toContain("when_to_use:");
      expect(body).toContain("## Protocol");
      expect(body).toContain("## Boundaries");
    }
  });

  test("each surviving skill-commands facade satisfies Darwin static quality gates", () => {
    for (const command of ["repo-harness-check", "repo-harness-ship", "repo-harness-architecture"]) {
      const body = readCommand(command);
      const frontmatter = body.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
      const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1] ?? "";
      const whenToUse = frontmatter.match(/^when_to_use:\s*(.+)$/m)?.[1] ?? "";
      const flagged = body
        .split("\n")
        .filter((line) => RUNTIME_RED_FLAGS.some((pattern) => pattern.test(line)));

      expect(description.length).toBeGreaterThan(40);
      expect(description.length).toBeLessThanOrEqual(1024);
      expect(whenToUse.split(",").length).toBeGreaterThanOrEqual(3);
      expect(body).toContain("## Failure Modes");
      expect(body).toMatch(/If .+(route|report|stop|verify|regenerate|archive|preserve)/);
      expect(body).toMatch(/## Boundaries[\s\S]*(Does not|Do not|Never|Preserve|Delete only)/);
      expect(flagged).toEqual([]);
    }
    expect(readCommand("repo-harness-ship")).toContain("CHECKPOINT");
  });

  test("plan and its review mode are non-mutating by default", () => {
    const plan = readSkillPackage("repo-harness-plan");
    expect(plan).toContain("Neither mode edits implementation files by default");
    expect(readReference("repo-harness-plan", "review.md")).toContain("Does not edit files or implement the plan by default");
    expect(readReference("repo-harness-plan", "create.md")).toContain("repo-harness run capture-plan");
    expect(readReference("repo-harness-plan", "create.md")).toContain("invoke `geju` before a contract exists");
    expect(readReference("repo-harness-plan", "create.md")).toContain("parent agent then completes P1/P2/P3");
    expect(readReference("repo-harness-plan", "create.md").toLowerCase()).not.toContain("gstack");
    expect(readReference("repo-harness-plan", "review.md").toLowerCase()).not.toContain("gstack");
  });

  test("plan's review mode covers product, engineering, design, and DevEx dimensions", () => {
    const review = readReference("repo-harness-plan", "review.md");
    expect(review).toContain("product");
    expect(review).toContain("eng");
    expect(review).toContain("design");
    expect(review).toContain("devex");
    expect(review).toContain("Report blocking issues first");
  });

  test("the reusable-workflow packaging rubric survives as one root reference (autoplan's only surviving content)", () => {
    // autoplan itself retires with no successor facade; only its "Reusable
    // Workflow Packaging Rubric" section moves to one root reference (plan
    // P3 decision 4). No automated self-review-pass engine exists post-cutover.
    const rubric = readFileSync(join(ROOT, "references", "workflow-packaging-rubric.md"), "utf-8");
    expect(rubric).toContain("Reusable Workflow Packaging Rubric");
    expect(rubric).toContain("Memories and rollout summaries");
    expect(rubric).toContain("Chronicle for discovery");
    expect(rubric).toContain("frequency/confidence");
    expect(rubric).toContain("Prefer extending an existing skill");
  });

  test("ship defaults to PR closeout and keeps local merge explicit", () => {
    const ship = readCommand("repo-harness-ship");

    expect(ship).toContain("repo-harness run ship-worktrees");
    expect(ship).toContain("finish --no-merge");
    expect(ship).toContain("gh pr create --base main --head codex/<slug>");
    expect(ship).toContain("--local-merge");
    expect(ship).toContain("--cleanup-merged");
    expect(ship).toContain("Default mode creates PRs");
    expect(ship).toContain("Does not run `git reset --hard`, `git clean`, or automatic stash");
  });

  test("setup's adopt-init and scaffold modes keep existing-repo adoption separate from app scaffolding", () => {
    const setup = readSkillPackage("repo-harness-setup");
    const adoptInit = readReference("repo-harness-setup", "adopt-init.md");
    const scaffold = readReference("repo-harness-setup", "scaffold.md");

    expect(adoptInit).toContain("existing repository");
    expect(setup).toContain("Does not create an application stack from any mode except `scaffold`");
    expect(adoptInit).toContain("repo-harness adopt");
    expect(adoptInit).toContain("repo-harness adopt --repo <repo>");
    expect(scaffold).toContain("new project");
    expect(scaffold).toContain("plan catalog A-K");
    expect(setup).toContain("New project/app/module skeleton, no existing repo workflow -> `references/scaffold.md`");
  });

  test("setup's migrate and upgrade modes preserve user-owned surfaces", () => {
    const migrate = readReference("repo-harness-setup", "migrate.md");
    const upgrade = readReference("repo-harness-setup", "upgrade.md");

    expect(migrate).toContain("Preserve or archive user-authored content");
    expect(migrate).toContain("ownership=known_generated");
    expect(upgrade).toContain("known_generated");
    expect(upgrade).toContain("Preserve `_ref/`, `_ops/`, secrets, local env, custom hooks");
  });

  test("setup's capability mode is a targeted registry update instead of full init", () => {
    const capability = readReference("repo-harness-setup", "capability.md");

    expect(capability).toContain("capability-config.ts add");
    expect(capability).toContain("Does not run `repo-harness adopt`");
    expect(capability).toContain("Does not install or refresh the full harness");
    expect(capability.toLowerCase()).toContain("explicit");
    expect(capability.toLowerCase()).toContain("prefix");
  });

  test("architecture stays focused and root handoff reference stays scoped to handoff packet files", () => {
    const architecture = readCommand("repo-harness-architecture");
    const handoff = readFileSync(join(ROOT, "references", "handoff.md"), "utf-8");

    expect(architecture).toContain("repo-harness run archive-architecture-request");
    expect(architecture).toContain("mermaid");
    expect(architecture).toContain("Does not run `repo-harness adopt`");
    expect(architecture).toContain("hooks only record drift requests");

    expect(handoff).toContain("repo-harness run prepare-codex-handoff");
    expect(handoff).toContain("repo-harness run codex-handoff-resume");
    expect(handoff).toContain("handoff packet");
  });

  test("check's deploy-readiness reference stays read-only and scoped to deploy/operations checks", () => {
    const deploy = readFileSync(
      join(COMMAND_ROOT, "repo-harness-check", "references", "deploy-readiness.md"),
      "utf-8",
    );

    expect(deploy).toContain("Read-only by default");
    expect(deploy).toContain("check-deploy-sql-order.sh");
    expect(deploy).toContain("Does not publish or deploy");
    expect(deploy).toContain("_ops/");
    expect(deploy).toContain("operations.deploy_sql");
    expect(deploy).toContain("deploy/sql/");
  });

  test("check command reports skill eval authority instead of accepting dry-run evidence", () => {
    const check = readCommand("repo-harness-check");

    expect(check).toContain("full_test_count > 0");
    expect(check).toContain("dry_run_ratio <= 30%");
    expect(check).toContain("graders reported");
    expect(check).toContain("non-authoritative: dry-run-heavy or all-dry-run evidence");
    expect(check).toContain("unavailable: no current eval evidence");
    expect(check).toContain("Does not claim skill-effectiveness authority from dry-run benchmark output");
  });

  test("public docs name the target canonical packages and keep internal steps private", () => {
    const skill = readFileSync(join(ROOT, "SKILL.md"), "utf-8");
    const readme = readFileSync(join(ROOT, "README.md"), "utf-8");
    const flow = readFileSync(join(ROOT, "docs", "reference-configs", "agentic-development-flow.md"), "utf-8");
    const docs = [skill, readme, flow].join("\n");

    for (const pkg of TARGET_CANONICAL_PACKAGES) {
      expect(docs).toContain(pkg);
    }
    expect(docs).toContain("hooks-init");
    expect(docs).toContain("docs-init");
    expect(docs).toContain("create-project-dirs");
    expect(docs).toContain("not public");
  });

  test("product's PRD mode creates only upper-layer PRDs", () => {
    const prd = readReference("repo-harness-product", "prd.md");

    expect(prd).toContain("plans/prds/");
    expect(prd).toContain("Activate `$geju`");
    expect(prd).toContain("compact geju framing");
    expect(prd).toContain("claude -p --model opus");
    expect(prd).toContain("Prefer Claude");
    expect(prd).toContain("Use Codex fallback only");
    expect(prd).toContain("[UNKNOWN]");
    expect(prd).toContain("[UNVERIFIED]");
    expect(prd).toContain("Does not skip the `$geju` direction pass");
    expect(prd).toContain("Does not make Codex the primary PRD author");
    expect(prd).toContain("repo-harness run check-task-workflow --strict");
  });

  test("product's Sprint mode consumes PRDs without re-deciding product intent", () => {
    const sprint = readReference("repo-harness-product", "sprint.md");

    expect(sprint).toContain("from-prd");
    expect(sprint).toContain("> **Source PRD**");
    expect(sprint).toContain("must be machine-checkable");
    expect(sprint).toContain("For `contract` rows, invoke `$think`");
    expect(sprint).toContain("For `inline` rows, do not create a new `plans/plan-*.md` or task contract");
  });

  test("product's Goal mode requires detailed PRD or Sprint context before native goal continuation", () => {
    const goal = readReference("repo-harness-product", "goal.md");

    expect(goal).toContain("/goal");
    expect(goal).toContain("Codex or Claude");
    expect(goal).toContain("plans/prds/*.prd.md");
    expect(goal).toContain("plans/sprints/*.sprint.md");
    expect(goal).toContain("If no detailed PRD/Sprint artifact is attached or named");
    expect(goal).toContain("Does not create, approve, or execute a Goal session without detailed PRD/Sprint context");
    expect(goal).toContain("Preserve host-native `/goal` ownership");
    expect(goal).toContain("use the user's language unless repo-local instructions require otherwise");
    expect(goal).not.toContain("concise Chinese status");
  });

  test("chatgpt's setup mode separates browser/session from MCP connector setup", () => {
    const setup = readReference("repo-harness-chatgpt", "setup.md");

    expect(setup).toContain("gptpro_browser");
    expect(setup).toContain("gptpro_mcp");
    expect(setup).toContain("repo-harness chatgpt browser-setup");
    expect(setup).toContain("repo-harness chatgpt browser-doctor");
    expect(setup).toContain("--provider oracle --json");
    expect(setup).toContain("node >=24");
    expect(setup).toContain("REPO_HARNESS_ORACLE_BIN");
    expect(setup).toContain("agent_actions");
    expect(setup).toContain("chatgpt-oracle-install-pinned");
    expect(setup).toContain("chatgpt-oracle-upgrade-pinned");
    expect(setup).toContain("chatgpt-oracle-fix-configured-source");
    expect(setup).toContain("Does not install/upgrade Oracle from a default repo-harness install");
    expect(setup).toContain("repo-harness mcp setup chatgpt");
    expect(setup).toContain("--server-name <name>");
    expect(setup).toContain("--enable-chatgpt-browser");
    expect(setup).toContain("HTTPS tunnel");
    expect(setup).toContain("Does not create OpenAI API keys");
  });

  test("chatgpt's consult/continue modes use GPT Pro language over the browser session engine commands", () => {
    const consult = readReference("repo-harness-chatgpt", "consult.md");
    const continueMode = readReference("repo-harness-chatgpt", "continue.md");

    expect(consult).toContain("gptpro consult");
    expect(consult).toContain("repo-harness chatgpt browser-consult");
    expect(consult).toContain("repo-harness chatgpt browser-followup");
    expect(continueMode).toContain("repo-harness chatgpt browser-session");
    expect(continueMode).toContain("repo-harness chatgpt browser-open");
    expect(consult).toContain("date -u +%Y%m%dT%H%M%SZ");
    expect(consult).toContain(".ai/harness/handoff/gptpro/gptpro-${stamp}-<slug>.md");
    expect(consult).toContain("--model gpt-5.5-pro");
    expect(continueMode).toContain("docs/researches/YYYYMMDD-<topic>.md");
    expect(continueMode).toContain("raw artifact path");
    expect(consult).toContain("15");
    expect(consult).toContain("Do not treat elapsed time as failure");
    expect(consult).toContain("no thinking status detected yet");
    expect(consult).toContain("Does not rename or replace the underlying");
  });

  test("chatgpt's read-back mode binds the MCP Connector invocation evidence contract", () => {
    const readBack = readReference("repo-harness-chatgpt", "read-back.md");
    expect(readBack).toContain("chatgpt.serverName");
    expect(readBack).toContain("MCP Read Evidence".replace("MCP Read Evidence", "Called tool"));
    assertChatGptMcpContract(readBack);
  });
});
