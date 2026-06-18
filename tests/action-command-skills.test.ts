import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const COMMAND_ROOT = join(ROOT, "assets", "skill-commands");
const COMMANDS = [
  "repo-harness-plan",
  "repo-harness-review",
  "repo-harness-autoplan",
  "repo-harness-ship",
  "repo-harness-init",
  "repo-harness-scaffold",
  "repo-harness-migrate",
  "repo-harness-upgrade",
  "repo-harness-capability",
  "repo-harness-architecture",
  "repo-harness-handoff",
  "repo-harness-deploy",
  "repo-harness-repair",
  "repo-harness-check",
  "repo-harness-prd",
  "repo-harness-sprint",
  "repo-harness-goal",
  "repo-harness-gptpro-setup",
  "repo-harness-gptpro",
];

function readCommand(name: string): string {
  return readFileSync(join(COMMAND_ROOT, name, "SKILL.md"), "utf-8");
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
  test("manifest exposes exactly the public action command surface", () => {
    const manifest = JSON.parse(readFileSync(join(COMMAND_ROOT, "manifest.json"), "utf-8"));
    expect(manifest.surface).toBe("repo-harness-cli-hooks-command-facades");
    expect(manifest.router).toBe("repo-harness");
    expect(manifest.commands.map((entry: { name: string }) => entry.name)).toEqual(COMMANDS);
    expect(manifest.nonPublicInternalSteps).toEqual([
      "hooks-init",
      "docs-init",
      "create-project-dirs",
    ]);
  });

  test("each command is a thin standalone skill facade", () => {
    for (const command of COMMANDS) {
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

  test("each command satisfies Darwin static quality gates", () => {
    const checkpointCommands = new Set([
      "repo-harness-autoplan",
      "repo-harness-ship",
      "repo-harness-migrate",
      "repo-harness-upgrade",
    ]);

    for (const command of COMMANDS) {
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

      if (checkpointCommands.has(command)) {
        expect(body).toContain("CHECKPOINT");
      }
    }
  });

  test("plan and review are non-mutating by default", () => {
    for (const command of ["repo-harness-plan", "repo-harness-review"]) {
      expect(readCommand(command)).toContain("Does not edit");
    }
    expect(readCommand("repo-harness-plan")).toContain("capture-plan.sh");
  });

  test("autoplan runs full workflow with bounded self-review and delegates ship", () => {
    const autoplan = readCommand("repo-harness-autoplan");

    expect(autoplan).toContain("self-review 1");
    expect(autoplan).toContain("self-review 2");
    expect(autoplan).toContain("Execute the approved plan");
    expect(autoplan).toContain("Call `repo-harness-ship`");
    expect(autoplan).toContain("Runs exactly two plan self-review passes");
  });

  test("autoplan packages repeated workflows only through an evidence-first approval gate", () => {
    const autoplan = readCommand("repo-harness-autoplan");

    expect(autoplan).toContain("Reusable Workflow Packaging Rubric");
    expect(autoplan).toContain("Memories and rollout summaries");
    expect(autoplan).toContain("Chronicle for discovery");
    expect(autoplan).toContain("only, then existing skills");
    expect(autoplan).toContain("frequency/confidence");
    expect(autoplan).toContain("Prefer extending an existing skill");
    expect(autoplan).toContain("Does not create skills, subagents, automations");
    expect(autoplan).toContain("user approves the plan");
  });

  test("ship defaults to PR closeout and keeps local merge explicit", () => {
    const ship = readCommand("repo-harness-ship");

    expect(ship).toContain("scripts/ship-worktrees.sh");
    expect(ship).toContain("finish --no-merge");
    expect(ship).toContain("gh pr create --base main --head codex/<slug>");
    expect(ship).toContain("--local-merge");
    expect(ship).toContain("--cleanup-merged");
    expect(ship).toContain("Default mode creates PRs");
    expect(ship).toContain("Does not run `git reset --hard`, `git clean`, or automatic stash");
  });

  test("init and scaffold keep existing-repo adoption separate from app scaffolding", () => {
    const init = readCommand("repo-harness-init");
    const scaffold = readCommand("repo-harness-scaffold");

    expect(init).toContain("existing repository");
    expect(init).toContain("Does not create a new application stack");
    expect(init).toContain("repo-harness adopt");
    expect(init).toContain("migrate-project-template.sh --repo <repo> --apply");
    expect(scaffold).toContain("new project");
    expect(scaffold).toContain("plan catalog A-K");
    expect(scaffold).toContain("If the user says \"initialize existing repo\", route to `repo-harness-init`");
  });

  test("migration and upgrade commands preserve user-owned surfaces", () => {
    const migrate = readCommand("repo-harness-migrate");
    const upgrade = readCommand("repo-harness-upgrade");

    expect(migrate).toContain("Preserve or archive user-authored content");
    expect(migrate).toContain("ownership=known_generated");
    expect(upgrade).toContain("known_generated");
    expect(upgrade).toContain("Preserve `_ref/`, `_ops/`, secrets, local env, custom hooks");
  });

  test("capability command is a targeted registry update instead of full init", () => {
    const capability = readCommand("repo-harness-capability");

    expect(capability).toContain("capability-config.ts add");
    expect(capability).toContain("Does not run `scripts/migrate-project-template.sh --apply`");
    expect(capability).toContain("Does not install or refresh the full harness");
    expect(capability).toContain("explicit prefixes");
  });

  test("architecture, handoff, and deploy commands stay focused", () => {
    const architecture = readCommand("repo-harness-architecture");
    const handoff = readCommand("repo-harness-handoff");
    const deploy = readCommand("repo-harness-deploy");

    expect(architecture).toContain("archive-architecture-request.sh");
    expect(architecture).toContain("mermaid");
    expect(architecture).toContain("Does not run `scripts/migrate-project-template.sh --apply`");
    expect(architecture).toContain("hooks only record drift requests");

    expect(handoff).toContain("prepare-codex-handoff.sh");
    expect(handoff).toContain("codex-handoff-resume.sh");
    expect(handoff).toContain("Does not run `/check`");
    expect(handoff).toContain("handoff packet files");

    expect(deploy).toContain("Read-only by default");
    expect(deploy).toContain("check-deploy-sql-order.sh");
    expect(deploy).toContain("Does not publish or deploy");
    expect(deploy).toContain("_ops/");
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

  test("public docs name the command surface and keep internal steps private", () => {
    const skill = readFileSync(join(ROOT, "SKILL.md"), "utf-8");
    const readme = readFileSync(join(ROOT, "README.md"), "utf-8");
    const flow = readFileSync(join(ROOT, "docs", "reference-configs", "agentic-development-flow.md"), "utf-8");
    const docs = [skill, readme, flow].join("\n");

    for (const command of COMMANDS) {
      expect(docs).toContain(command);
    }
    expect(docs).toContain("hooks-init");
    expect(docs).toContain("docs-init");
    expect(docs).toContain("create-project-dirs");
    expect(docs).toContain("not public");
  });

  test("prd command creates only upper-layer PRDs", () => {
    const prd = readCommand("repo-harness-prd");

    expect(prd).toContain("plans/prds/");
    expect(prd).toContain("Activate `$geju`");
    expect(prd).toContain("compact geju framing");
    expect(prd).toContain("claude -p --model opus");
    expect(prd).toContain("Prefer Claude");
    expect(prd).toContain("Use Codex fallback only");
    expect(prd).toContain("[UNKNOWN]");
    expect(prd).toContain("[UNVERIFIED]");
    expect(prd).toContain("Does not create or approve a Sprint backlog");
    expect(prd).toContain("Does not skip the `$geju` direction pass");
    expect(prd).toContain("Does not make Codex the primary PRD author");
    expect(prd).toContain("bash scripts/check-task-workflow.sh --strict");
  });

  test("sprint command consumes PRDs without re-deciding product intent", () => {
    const sprint = readCommand("repo-harness-sprint");

    expect(sprint).toContain("from-prd");
    expect(sprint).toContain("plans/sprints/");
    expect(sprint).toContain("> **Source PRD**");
    expect(sprint).toContain("must be machine-checkable");
    expect(sprint).toContain("must still run `$think` before code edits");
  });

  test("goal command requires detailed PRD or Sprint context before native goal continuation", () => {
    const goal = readCommand("repo-harness-goal");

    expect(goal).toContain("repo-harness:goal");
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

  test("gptpro setup command separates browser/session from MCP connector setup", () => {
    const gptpro = readCommand("repo-harness-gptpro-setup");

    expect(gptpro).toContain("repo-harness:gptpro_setup");
    expect(gptpro).toContain("gptpro_browser");
    expect(gptpro).toContain("gptpro_broswser");
    expect(gptpro).toContain("gptpro_mcp");
    expect(gptpro).toContain("repo-harness chatgpt browser-setup");
    expect(gptpro).toContain("repo-harness chatgpt browser-doctor");
    expect(gptpro).toContain("--provider oracle --json");
    expect(gptpro).toContain("node >=24");
    expect(gptpro).toContain("REPO_HARNESS_ORACLE_BIN");
    expect(gptpro).toContain("agent_actions");
    expect(gptpro).toContain("chatgpt-oracle-install-pinned");
    expect(gptpro).toContain("chatgpt-oracle-upgrade-pinned");
    expect(gptpro).toContain("chatgpt-oracle-fix-configured-source");
    expect(gptpro).toContain("Does not install or upgrade Oracle from default repo-harness install");
    expect(gptpro).toContain("Does not raise repo-harness' package/runtime floor");
    expect(gptpro).toContain("repo-harness mcp setup chatgpt");
    expect(gptpro).toContain("--server-name <name>");
    expect(gptpro).toContain("--enable-chatgpt-browser");
    expect(gptpro).toContain("HTTPS tunnel");
    expect(gptpro).toContain("ChatGPT Pro subscription as an OpenAI API key");
    expect(gptpro).toContain("Does not create OpenAI API keys");
    expect(gptpro).not.toContain("--provider bridge --manual-login");
  });

  test("gptpro command uses GPT Pro language over browser session engine commands", () => {
    const gptpro = readCommand("repo-harness-gptpro");

    expect(gptpro).toContain("repo-harness:gptpro");
    expect(gptpro).toContain("gptpro consult");
    expect(gptpro).toContain("gptpro continue");
    expect(gptpro).toContain("gptpro read");
    expect(gptpro).toContain("gptpro open");
    expect(gptpro).toContain("repo-harness chatgpt browser-consult");
    expect(gptpro).toContain("repo-harness chatgpt browser-session");
    expect(gptpro).toContain("repo-harness chatgpt browser-followup");
    expect(gptpro).toContain("repo-harness chatgpt browser-open");
    expect(gptpro).toContain("date -u +%Y%m%dT%H%M%SZ");
    expect(gptpro).toContain("mkdir -p .ai/harness/handoff/gptpro");
    expect(gptpro).toContain(".ai/harness/handoff/gptpro/gptpro-${stamp}-${slug}.md");
    expect(gptpro).toContain("--model gpt-5.5-pro");
    expect(gptpro).toContain("docs/researches/YYYYMMDD-<topic>.md");
    expect(gptpro).toContain("raw artifact path");
    expect(gptpro).toContain("MCP Read-Back Acceptance");
    expect(gptpro).toContain("chatgpt.serverName");
    expect(gptpro).toContain(".repo-harness/mcp.local.json");
    expect(gptpro).toContain("MCP Read Evidence");
    expect(gptpro).toContain("blocked or partial");
    expect(gptpro).toContain("route to `repo-harness:gptpro_setup`");
    expect(gptpro).toContain("Does not rename or replace the underlying");
    expect(gptpro).not.toContain("kito-mcp");
  });
});
