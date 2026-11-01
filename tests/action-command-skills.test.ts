import { describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, posix } from "path";
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
  "repo-harness-check",
  "repo-harness-product",
  "repo-harness-issue-flow",
  "repo-harness-ship",
  "repo-harness-architecture",
  "repo-harness-archimap",
  // Post-cutover addition: a repo-owned facade sourced from
  // assets/skills/obsidian-memory, projected to both hosts by every profile.
  "obsidian-memory",
  "windows-python-first",
  // Post-cutover addition: the testing router, sourced from
  // assets/skills/repo-harness-test, projected to both hosts by full only.
  "repo-harness-test",
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

  test("manifest declares all kept target canonical packages from the plan's target package table", () => {
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
      expect(body).toContain("entrypoint");
      expect(body).toMatch(/(Boundaries|boundaries|scope)/);
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
      expect(whenToUse).toContain(command);
      expect(body).toMatch(/(Report|Return|Preserve|Do not)/);
      expect(flagged).toEqual([]);
    }
    expect(readCommand("repo-harness-ship")).toContain("An explicit no-merge instruction wins");
  });

  test("merged planning modes keep source evidence and read-only review", () => {
    const plan = readCommand("repo-harness-check");
    const create = readFileSync(join(COMMAND_ROOT, "repo-harness-check/references/create.md"), "utf-8");
    const review = readFileSync(join(COMMAND_ROOT, "repo-harness-check/references/review.md"), "utf-8");
    expect(plan).toContain("Ordinary tasks do not require an Approved plan");
    expect(create).toContain("Trace one real path");
    expect(create).toContain("repo-harness-issue-flow");
    expect(create).not.toContain("capture-plan");
    expect(create).toContain("A plan does not grant implementation approval");
    expect(create).toContain("Do not edit implementation files in planning mode");
    expect(create).toContain("existing task authorization");
    expect(review).toContain("Keep review read-only");
    expect(review).toContain("If no plan exists, report the missing input");
    expect(review).toContain("If scope, checks or rollback are");
    expect(review).toContain("Do not implement the plan");
    for (const dimension of ["product", "design", "DevEx", "data flow", "verification", "rollback"]) {
      expect(review).toContain(dimension);
    }
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

  test("ship keeps publication boundaries and worker Git steps", () => {
    const ship = readCommand("repo-harness-ship");
    const worker = readFileSync(join(COMMAND_ROOT, "repo-harness-ship/references/worker.md"), "utf-8");
    expect(ship).toContain("Main publication, deletion, credentials/permissions and release/production");
    expect(ship).toContain("An explicit no-merge instruction wins");
    expect(ship).toContain("GitHub has no change request or unresolved review thread");
    expect(worker).toContain("gh pr create");
    expect(worker).toContain("repo-harness run contract-worktree sweep");
    expect(worker).toContain("Never use reset, clean or stash");
    expect(worker).toContain("Do not commit to or fast-forward main");
    expect(worker).toContain("reuse it");
    expect(worker).toContain("Do not publish when required checks or required review evidence are missing");
  });

  test("setup's init and scaffold modes keep existing-repo adoption separate from app scaffolding", () => {
    const setup = readSkillPackage("repo-harness-setup");
    const initMode = readReference("repo-harness-setup", "init.md");
    const scaffold = readReference("repo-harness-setup", "scaffold.md");

    expect(initMode).toContain("existing repository");
    expect(setup).toContain("Does not create an application stack from any mode except `scaffold`");
    expect(setup).toContain("Use the Bot-assigned mode and target repo");
    expect(initMode).toContain("repo-harness init");
    expect(initMode).toContain("repo-harness init --repo <repo>");
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
    expect(capability).toContain("Does not run `repo-harness init`");
    expect(capability).toContain("Does not install or refresh the full harness");
    expect(capability.toLowerCase()).toContain("explicit");
    expect(capability.toLowerCase()).toContain("prefix");
  });

  test("setup's ci-scope mode keeps the complete matrix release-only and repository settings user-owned", () => {
    const setup = readSkillPackage("repo-harness-setup");
    const ciScope = readReference("repo-harness-setup", "ci-scope.md").replace(/\s+/g, " ");

    expect(setup).toContain("Impact-scoped PR CI with a release-only full matrix -> `references/ci-scope.md`");
    expect(ciScope).toContain("Package or workspace membership alone never selects a platform family");
    expect(ciScope).toContain("<family> runs <path> but does not own it");
    expect(ciScope).toContain("For a dispatch run only, the ref (`github.ref`) must be on an allowlist");
    expect(ciScope).toContain("Both the planner and the aggregate gate check the ref. Routine runs do not check it");
    expect(ciScope).toContain("It never tells the author to use release validation");
    expect(ciScope).toContain("Each unselected job must have `skipped`");
    expect(ciScope).toContain("A missing or empty plan, or a plan for another SHA, fails the gate");
    expect(ciScope).toContain("Never change repository settings, environments, rulesets");
    expect(ciScope).toContain("Never dispatch release validation");
    expect(ciScope).toContain("Hard enforcement needs user-owned settings");
    expect(ciScope).toContain("Justify each changed test assertion item by item");
    // Reusable guidance carries placeholders, not one project's names, issue numbers or SHAs.
    expect(ciScope).not.toMatch(/#\d{2,}|\b[0-9a-f]{7,40}\b|byok|familyOwners|select-impact/i);
  });

  test("architecture stays focused and root handoff reference uses the issue claim board", () => {
    const architecture = readFileSync(join(COMMAND_ROOT, "repo-harness-architecture/references/worker.md"), "utf-8");
    const handoff = readFileSync(join(ROOT, "references", "handoff.md"), "utf-8");

    expect(architecture).toContain("repo-harness architecture-projection check --json");
    expect(architecture).not.toContain("archive-architecture-request");
    expect(architecture).toContain("mermaid");
    expect(architecture).toContain("archctx-generated Markdown Mermaid");
    expect(architecture).toContain("does not hand-write diagrams or standalone HTML");
    expect(architecture).toContain("repo-harness-archimap");
    expect(architecture).toContain("docs/architecture/archimap.html");
    expect(architecture).not.toContain("optional human-readable HTML");
    expect(architecture).toContain("Does not run `repo-harness init`");
    expect(architecture).toContain("architecture updates are explicit");

    expect(handoff).toContain("issue claim status");
    expect(handoff).toContain("Does not write a local handoff, resume or Codex-global packet file.");
    expect(handoff).not.toContain("prepare-codex-handoff");
    expect(handoff).not.toContain("codex-handoff-resume");
  });

  test("architecture worker runs archctx through the status command and has an adoption flow", () => {
    const architecture = readFileSync(join(COMMAND_ROOT, "repo-harness-architecture/references/worker.md"), "utf-8");

    expect(architecture).toContain("`projectionProvider.command[0]`");
    expect(architecture).toContain("`projectionProvider.command[1]`");
    expect(architecture).toContain('`"$NODE" "$ARCHCTX" flows check --json`');
    expect(architecture).toContain("`repo-harness architecture-projection anchors --json`");
    expect(architecture).toContain("repo-harness architecture-projection publish once");
    // projection-apply derives the accepted request id; a per-apply id rule is obsolete.
    expect(architecture).toContain("Do not pass `--request-id`");
    expect(architecture.match(/--request-id/g)).toHaveLength(1);
    expect(architecture).toContain("## Adopt ArchContext in a repository");
    for (const step of [
      "repo-harness run capability-resolver export --format archcontext-nodes-v2",
      '"$NODE" "$ARCHCTX" init --name <product name>',
      '"$NODE" "$ARCHCTX" docs adopt --profile repo-harness/v1',
      "repo-harness architecture-projection adopt --json --adoption-plan-id <adoptionPlanId>",
    ]) expect(architecture).toContain(step);
  });

  test("shipped guidance runs archctx only through the managed command", () => {
    // A bare archctx resolves through PATH and can run an unrelated version.
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as { files: string[] };
    const shipped = execFileSync("git", ["ls-files", "-z", "--", ...pkg.files], { cwd: ROOT, encoding: "utf-8" })
      .split("\0")
      .filter((path) => path.endsWith(".md"));
    const bareInvocation = /(?:^|`)\s*archctx [a-z]/;
    const offenders = shipped.flatMap((path) => readFileSync(join(ROOT, path), "utf-8")
      .split("\n")
      .flatMap((line, index) => (bareInvocation.test(line) ? [`${path}:${index + 1}: ${line.trim()}`] : [])));
    expect(shipped).toContain("assets/skill-commands/repo-harness-architecture/references/worker.md");
    expect(offenders).toEqual([]);
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

    expect(prd).toContain("docs/prds/");
    expect(prd).toContain("Activate `$geju`");
    expect(prd).toContain("compact geju framing");
    expect(prd).toContain("claude -p --model opus");
    expect(prd).toContain("Prefer Claude");
    expect(prd).toContain("Use Codex fallback only");
    expect(prd).toContain("one batched round of at most 3 questions");
    expect(prd).toContain("accept-all-defaults path");
    expect(prd).toContain("In non-interactive runs ask nothing");
    expect(prd).toContain("[ASSUMED]");
    expect(prd).toContain("[UNKNOWN]");
    expect(prd).toContain("[UNVERIFIED]");
    expect(prd).toContain("Does not skip the `$geju` direction pass");
    expect(prd).toContain("Does not make Codex the primary PRD author");
    expect(prd).not.toContain("repo-harness run check-task-workflow");
  });

  test("product routes backlog ordering, issue splitting and dispatch to repo-harness-issue-flow", () => {
    const product = readSkillPackage("repo-harness-product");
    const goal = readReference("repo-harness-product", "goal.md");

    expect(existsSync(join(SKILLS_ROOT, "repo-harness-product", "references", "sprint.md"))).toBe(false);
    expect(product).not.toContain("references/sprint.md");
    expect(product).toContain("`repo-harness-issue-flow` skill");
    expect(goal).toContain("`repo-harness-issue-flow` skill");
    expect(goal).not.toContain("backlog mode");
  });

  test("issue-flow routes integrator merges through publication merge and handles each exit code", () => {
    const skill = readSkillPackage("repo-harness-issue-flow");
    const orchestrator = readReference("repo-harness-issue-flow", "orchestrator.md");
    const board = readReference("repo-harness-issue-flow", "board.md");
    const templates = readReference("repo-harness-issue-flow", "templates.md");

    for (const text of [skill, orchestrator, board]) expect(text).toContain("repo-harness publication merge");
    expect(skill).toContain("claude --agent orchestrator");
    expect(skill).toContain("publication.acceptance_merge");
    for (const code of ["acceptance_merge_off", "base_protection_insufficient", "merge_outcome_unknown", "provider_rejected"]) {
      expect(orchestrator).toContain(code);
    }
    expect(orchestrator).toMatch(/\| 0 \|[\s\S]*\| 3 \|[\s\S]*\| 4 \|[\s\S]*\| 5 \|[\s\S]*\| 6 \|/);
    expect(templates).toContain("Merge SHA:");
    for (const text of [skill, orchestrator, board, templates]) expect(text).not.toContain("gh pr merge");
  });

  test("issue-flow requires reading a repair issue and taking its patch before acting", () => {
    const skill = readSkillPackage("repo-harness-issue-flow");

    expect(skill).toContain("Before you claim or comment on a repair issue");
    expect(skill).toContain("search its test name");
    expect(skill).toContain("read every comment");
    expect(skill).toContain("take a posted patch first");
    expect(skill).toContain("report-ci");
  });

  test("product Goal mode binds native continuation to the current issue and claim", () => {
    const goal = readReference("repo-harness-product", "goal.md");

    expect(goal).toContain("/goal");
    expect(goal).toContain("Codex or Claude");
    expect(goal).toContain("docs/prds/*.prd.md");
    expect(goal).toContain("GitHub issues and PRs");
    expect(goal).not.toContain("plans/sprints/*.sprint.md");
    expect(goal).toContain("Read the current GitHub issue");
    expect(goal).toContain("assignees, all comments");
    expect(goal).toContain("linked PRs");
    expect(goal).toContain("Issue: <GitHub issue URL>");
    expect(goal).toContain("Claim: <current owner or explicit handoff");
    expect(goal).toContain("Re-read the issue and claim state before execution and on resume");
    expect(goal).toContain("If the issue is missing or cannot be read, stop before execution");
    expect(goal).toContain("If another owner has an active claim, coordinate with that owner");
    expect(goal).toContain("planning references");
    expect(goal).toContain("Do not mint task IDs, contracts, offers or leases");
    expect(goal).not.toMatch(/capture-plan|contract worktree|from-prd|row id/);
    expect(goal).toContain("Preserve host-native `/goal` ownership");
    expect(goal).toContain("use the user's language unless repo-local instructions require otherwise");
    expect(goal).not.toContain("concise Chinese status");
  });

  test("product routes preserve one task authority across planning and Goal preparation", () => {
    const router = readSkillPackage("repo-harness-product");
    expect(router).toContain("The GitHub issue and PR own task identity, claim, status and dependencies");
    expect(router).toContain("Deferred work stays in GitHub issues");
    expect(router).not.toContain("tasks/todos.md");

    for (const mode of ["prd", "goal"]) {
      const reference = readReference("repo-harness-product", `${mode}.md`);
      expect(reference).toContain("GitHub issue");
      expect(reference).not.toMatch(/capture-plan|contract worktree|through a task contract|the contract governs/);
    }
    expect(readReference("repo-harness-product", "prd.md"))
      .toContain("copy the approved direction into the GitHub issue brief");
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
  test("issue-flow child template carries an architecture slice of the capability document", () => {
    const templates = readReference("repo-harness-issue-flow", "templates.md");

    expect(templates).toContain("## Architecture slice");
    expect(templates).toContain("flowchart LR");
    expect(templates).toMatch(/classDef target [^\n]*/);
    expect(templates).toMatch(/class p1_component_[a-z0-9_]+ target/);
    expect(templates).toContain("entrypoint.action-commands.profile-projection");
    expect(templates).toMatch(/`[a-z0-9/.-]+\.ts#[A-Za-z][A-Za-z0-9]*`/);
    expect(templates).toMatch(/\/blob\/<sha>\/docs\/architecture\/modules\/<domain>\/<capability>\.md/);
    // The PR body rule: attach the changed slice, keep one line otherwise, and never commit a
    // generated region.
    expect(templates).toContain(".archcontext/model/**");
    expect(templates).toContain("Architecture slice unchanged, see #<issue>");
    expect(templates).toMatch(/[Nn]ever commit a generated region/);
  });

  test("issue-flow orchestrator gates splitting on architecture-projection status --json", () => {
    const orchestrator = readReference("repo-harness-issue-flow", "orchestrator.md");

    expect(orchestrator).toContain("repo-harness architecture-projection status --json");
    expect(orchestrator).toContain("modelAuthority.source");
    expect(orchestrator).toContain("modelAuthority.ready");
    expect(orchestrator).toContain("archcontext");
    expect(orchestrator).toContain("stop splitting");
    expect(orchestrator).toContain("follow `next`");
    // The gate needs modelAuthority and next, which check --json does not return.
    expect(orchestrator.replace(/\s+/g, " ")).toContain("does not carry `modelAuthority` or `next`");
  });

  test("issue-flow worker derives the PR slice from the projection plan preview", () => {
    const worker = readReference("repo-harness-issue-flow", "worker.md");

    expect(worker).toContain("### 6.1 Architecture slice");
    expect(worker).toContain("repo-harness architecture-projection plan --json --changed-path");
    expect(worker).toContain("preview.format");
    expect(worker).toContain("unified-diff");
    expect(worker).toContain("preview.content");
    expect(worker).toContain("§1.1");
    expect(worker).toContain("preview.truncated");
    expect(worker).toContain("Status: blocked; claim remains");
    expect(worker).toMatch(/[Nn]ever hand-draw/);
    expect(worker).toContain("scratch path");
    expect(worker).toContain("Never modify or restore the worktree document");
    expect(worker).not.toMatch(/Restore the worktree copy/);
    expect(worker).toMatch(/No second source/);
    expect(worker).toContain("codegraph index .");
  });

  test("archimap takes the model and the node links from ArchContext only", () => {
    const skill = readSkillPackage("repo-harness-archimap");
    const template = readFileSync(join(SKILLS_ROOT, "repo-harness-archimap", "assets", "template.html"), "utf-8");
    const visual = readReference("repo-harness-archimap", "visual-language.md");

    expect(skill).not.toContain("package and directory layout");
    expect(skill).not.toContain(".ai/context/capabilities.json");
    expect(skill).toContain("--model");
    expect(skill).toContain("docs/architecture/.projection-manifest.json");
    expect(skill).toContain("modules[].nodes");
    expect(skill).toContain("undocumentedNodes");
    expect(skill).toContain("relative to the map file's directory");
    expect(skill.replace(/\s+/g, " ")).toContain("Remove the `docs/architecture/` prefix");
    expect(template).toContain('<a class="node');
    expect(template).toContain("modules[].docs");
    expect(visual).toContain("modules[].docs");
    expect(visual).toContain("capability document");
    expect(visual).toContain("relative to `docs/architecture/archimap.html`");
    expect(visual).toContain("remove the\n`docs/architecture/` prefix");

    // measure.ts reports docs/architecture/modules/... from the repository root. The map links
    // them from docs/architecture/archimap.html, so each href must resolve back to that document
    // and must not repeat the prefix.
    const mapDir = "docs/architecture";
    const hrefs = [...template.matchAll(/<a class="node[^>]*href="([^"]+)"/g)].map((match) => match[1]!);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("docs/")).toBe(false);
      expect(posix.join(mapDir, href)).toMatch(/^docs\/architecture\/modules\/[a-z-]+\/[a-z-]+\.md$/);
    }
  });

  test("archimap measure refuses to run without --model", () => {
    const measure = join(SKILLS_ROOT, "repo-harness-archimap", "scripts", "measure.ts");
    let failure: { status?: number | null; stderr?: Buffer | string } | undefined;
    try {
      execFileSync("bun", [measure], { cwd: ROOT, encoding: "utf-8", stdio: "pipe" });
    } catch (error) {
      failure = error as { status?: number | null; stderr?: Buffer | string };
    }

    expect(failure).toBeDefined();
    expect(failure?.status).toBe(2);
    expect(String(failure?.stderr)).toContain("--model is required");
  });

  test("issue-flow board keeps a closed comment set with the plan kind", () => {
    const board = readReference("repo-harness-issue-flow", "board.md");

    expect(board).toContain("| `plan` | Parent issue | Coordinator |");
    expect(board).toContain("Seat-only comment kinds");
    for (const kind of ["plan", "decision", "scope change", "unblocked"]) {
      expect(board).toContain("`" + kind + "`");
    }
    expect(board).toContain("only when the coordinator confirms it");
    // `issue claim` is seat-only and the coordinator posts it for each
    // dispatched worker. The no-coordinator self-claim rule is deleted, so
    // the board must no longer offer `Coordinator: none`.
    expect(board).toContain("A claim from anyone else is a request");
    expect(board).toContain("`author_association` is `OWNER`, `MEMBER` or `COLLABORATOR`");
    expect(board).not.toContain("Coordinator: none");
    expect(board).not.toContain("No coordinator on the parent");
    expect(board).toContain("Status: released");
    expect(board).toContain("Prior claim");
    expect(board).toContain("read back");
    for (const status of ["unclaimed", "unclaimed · waits for #n", "writer <agent> · active", "writer <agent> · PR #p", "merged"]) {
      expect(board).toContain(status);
    }
  });

  test("issue-flow templates carry the plan, the claim fields and the parent status values", () => {
    const templates = readReference("repo-harness-issue-flow", "templates.md");

    for (const field of ["repo-harness plan", "Coordinator:", "Baseline: main@<sha>", "Waves:", "Merge order:", "Blocked:", "Supersedes:"]) {
      expect(templates).toContain(field);
    }
    for (const field of ["Status:", "Seat:", "Agent:", "Branch:", "Scope:", "Not in scope:", "Prior claim:"]) {
      expect(templates).toContain(field);
    }
    // The claim note now names the coordinator as the only poster and
    // repeats the write-access rule. `Coordinator:` is a required link to
    // the coordinator's own claim, so the template no longer offers "none".
    expect(templates).toContain("The coordinator posts it, including the");
    expect(templates).not.toContain("Coordinator: none");
    for (const status of ["unclaimed", "unclaimed · waits for #n", "writer <agent> · active", "writer <agent> · PR #p", "merged", "待认领", "待认领 · 等待 #n 合并"]) {
      expect(templates).toContain(status);
    }
  });

  test("issue-flow orchestrator runs on any host, plans large parents and caps review rounds", () => {
    const orchestrator = readReference("repo-harness-issue-flow", "orchestrator.md");
    const worker = readReference("repo-harness-issue-flow", "worker.md");
    const acceptor = readReference("repo-harness-issue-flow", "acceptor.md");

    expect(orchestrator).toContain("any host");
    expect(orchestrator).toContain("agents/fleet/orchestrator.md");
    expect(orchestrator).toContain("more than two children");
    expect(orchestrator).toContain("Supersedes:");
    expect(orchestrator).toContain("Limit each artifact to two review rounds");
    expect(orchestrator.toLowerCase()).toContain("default model preference");
    expect(orchestrator).toContain("responsibility, not by file list");
    expect(orchestrator).not.toContain("a Claude session");

    expect(worker).toContain("Read the parent too");
    // The worker reads the coordinator-posted claim and never posts its own.
    expect(worker).toContain("The coordinator claims the seat for you");
    expect(worker).toContain("Do not post a claim of your own");
    expect(worker).toContain("Without a claim that names you, do not start");
    expect(worker).not.toContain("Coordinator: none");
    expect(worker).toContain("Status: released");
    expect(worker).toContain("Read the claim back");

    expect(acceptor).toContain("repo-harness review publish --pr <n> --receipt <path>");
    expect(acceptor).toContain("repo-harness-review-publish-receipt");
    expect(acceptor).toContain("review_publish_unknown");
    expect(acceptor).toContain("model_relation");
  });

  test("issue-flow and fleet guidance requires no host or model", () => {
    const paths = ["SKILL.md", "references/board.md", "references/orchestrator.md", "references/worker.md", "references/templates.md", "references/acceptor.md"];
    const sources = paths.map((path) => readFileSync(join(SKILLS_ROOT, "repo-harness-issue-flow", path), "utf-8"));
    const fleet = readFileSync(join(ROOT, "agents", "fleet", "orchestrator.md"), "utf-8");
    const pattern = /claude (session|only)|must (use|run) (claude|codex)/i;
    const offenders = [...sources, fleet].flatMap((text) => text.split("\n").filter((line) => pattern.test(line)));

    expect(offenders).toEqual([]);
    expect(sources[0]).toContain("Suggested model");
    expect(sources[0]).toContain("Any host's long-lived top-level session");
    expect(fleet).toContain("Suggested model: Opus");
    expect(fleet).toContain("Any host may run this seat");
  });
});
