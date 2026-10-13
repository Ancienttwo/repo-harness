import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import {
  SESSION_CONTEXT_PROVIDERS,
  buildSessionStartSections,
  owedCapabilitiesSessionBody,
  type SessionContextProvider,
} from "../src/cli/hook/session-context";
import { budgetSessionContext } from "../src/cli/hook/session-context-budget";
import type { EffectiveState } from "../src/core/state/types";
import type { EffectiveStateResolution } from "../src/effects/loop/state-input-collector";
import { fixtureTaskId } from "./helpers/sprint-fixture";

const HOOK_ENTRY = join(import.meta.dir, "../src/cli/hook-entry.ts");
const RESUME = ".ai/harness/handoff/resume.md";
const SPRINT = "plans/sprints/fixture.sprint.md";

interface Fixture {
  readonly root: string;
  readonly home: string;
  readonly write: (relativePath: string, content: string) => void;
  readonly cleanup: () => void;
}

/** An opted-in, committed repository with an isolated HOME. */
function fixture(prefix: string, policy: Record<string, unknown> = {}): Fixture {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  const root = join(parent, "repo");
  const home = join(parent, "home");
  mkdirSync(root);
  mkdirSync(home);
  const write = (relativePath: string, content: string): void => {
    mkdirSync(dirname(join(root, relativePath)), { recursive: true });
    writeFileSync(join(root, relativePath), content);
  };
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  git("init", "-q", "-b", "main");
  write(".ai/harness/workflow-contract.json", "{}\n");
  write(".ai/harness/policy.json", `${JSON.stringify(policy)}\n`);
  write(".gitignore", ".ai/harness/state/\n.ai/harness/runs/\n.ai/harness/handoff/\n");
  git("add", "-A");
  git("commit", "-q", "-m", "fixture");
  return { root, home, write, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}

function writeActiveSprint(f: Fixture): void {
  f.write(SPRINT, [
    "# Sprint: Fixture",
    "",
    "> **Status**: Approved",
    "> **Backlog Schema**: 2",
    "",
    "## Backlog",
    "",
    "| # | ID | Status | Task |",
    "|---|----|--------|------|",
    `| 1 | ${fixtureTaskId("task-a")} | [x] | task-a |`,
    `| 2 | ${fixtureTaskId("task-b")} | [ ] | task-b |`,
    "",
  ].join("\n"));
  f.write(".ai/harness/sprint/active-sprint", `${SPRINT}\n`);
}

/** The additionalContext a host reads from one real `repo-harness-hook SessionStart` run. */
function sessionStartContext(f: Fixture, host: "claude" | "codex" = "claude"): string {
  const result = spawnSync(process.execPath, [HOOK_ENTRY, "SessionStart", "--route", "default"], {
    cwd: f.root,
    encoding: "utf8",
    input: JSON.stringify({ session_id: `session-context-${host}` }),
    env: { ...process.env, HOME: f.home, HOOK_REPO_ROOT: f.root, HOOK_HOST: host },
  });
  expect(result.status, result.stderr).toBe(0);
  const envelope = JSON.parse(result.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  expect(envelope.hookSpecificOutput.hookEventName).toBe("SessionStart");
  return envelope.hookSpecificOutput.additionalContext;
}

describe("SessionStart host envelope", () => {
  test("a repository with only a resume puts the resume after the state section", () => {
    const f = fixture("session-resume-only");
    try {
      f.write(RESUME, "# Codex Resume Packet\n\nContinue the widget work.\n");
      for (const host of ["claude", "codex"] as const) {
        const context = sessionStartContext(f, host);
        expect(context).toStartWith("[HarnessState] ");
        expect(context).toContain(`# Resume (\`${RESUME}\`, `);
        expect(context).toContain("Continue the widget work.");
        expect(context.indexOf("[HarnessState] ")).toBeLessThan(context.indexOf("# Resume"));
      }
    } finally { f.cleanup(); }
  }, 30_000);

  test("an idle repository still gets the state section and nothing else, with no side files", () => {
    const f = fixture("session-idle");
    try {
      const context = sessionStartContext(f);
      expect(context).toStartWith("[HarnessState] ");
      expect(context.split("\n")).toHaveLength(1);
      expect(existsSync(join(f.root, ".ai/harness/state/session-context-budget.json"))).toBe(false);
      expect(existsSync(join(f.root, ".ai/harness/state/session-run-identity.json"))).toBe(false);
      expect(existsSync(join(f.root, ".ai/harness/security"))).toBe(false);
    } finally { f.cleanup(); }
  }, 30_000);

  test("a large resume becomes a pointer to its path while the active sprint stays", () => {
    const f = fixture("session-large-resume");
    try {
      writeActiveSprint(f);
      const body = Array.from({ length: 400 }, (_, index) => `- resume line ${index} with recovery detail`).join("\n");
      f.write(RESUME, `# Codex Resume Packet\n\n${body}\n`);
      const context = sessionStartContext(f);
      expect(context).toStartWith("[HarnessState] ");
      expect(context).toContain(`[ContextRef:resume] ${RESUME}`);
      expect(context).not.toContain("resume line 0 with recovery detail");
      expect(context).toContain("# Active Sprint");
      expect(context).toContain(`- Sprint: \`${SPRINT}\``);
      expect(context).toContain("start-task --task 'task-b'");
    } finally { f.cleanup(); }
  }, 30_000);

  test("a provider that throws becomes one failure line beside the state section and its siblings", () => {
    const f = fixture("session-provider-throws");
    try {
      writeActiveSprint(f);
      f.write(RESUME, "# Codex Resume Packet\n\nContinue the widget work.\n");
      // The sprint provider reads the attempt ledger; a directory there makes it throw.
      mkdirSync(join(f.root, ".ai/harness/runs/continuation/attempts.jsonl"), { recursive: true });
      const context = sessionStartContext(f);
      expect(context).toStartWith("[HarnessState] ");
      expect(context.split("\n")).toContain("[SessionContextProviderFailed] active-sprint");
      expect(context).not.toContain("# Active Sprint");
      expect(context).toContain("Continue the widget work.");
    } finally { f.cleanup(); }
  }, 30_000);

  test("a fresh pending plan capture with no active plan names the capture command", () => {
    const f = fixture("session-pending-plan");
    try {
      f.write(".ai/harness/planning/pending.json", JSON.stringify({ kind: "host-plan", host: "codex", prompt_slug: "fixture-plan" }));
      const context = sessionStartContext(f);
      expect(context).toContain("# Pending Plan Capture");
      expect(context).toContain("`.ai/harness/planning/pending.json`");
      expect(context).toContain("repo-harness run capture-plan --slug <slug> --title <title>");
      expect(context).toContain("do not edit implementation files");
    } finally { f.cleanup(); }
  }, 30_000);

  test("SessionStart writes no architecture state", () => {
    const f = fixture("session-architecture-on-demand", { context: { capability_source: "archcontext" } });
    try {
      mkdirSync(join(f.root, ".archcontext/model/nodes"), { recursive: true });
      const context = sessionStartContext(f);
      expect(context).not.toContain("[ArchitectureOwed]");
      expect(readdirSync(join(f.root, ".archcontext/model/nodes"))).toEqual([]);
      expect(existsSync(join(f.root, "docs/architecture/requests"))).toBe(false);
    } finally { f.cleanup(); }
  }, 30_000);
});

describe("buildSessionStartSections", () => {
  const state = {
    task_id: null,
    phase: "idle",
    state_version: 1,
    state_revision: `sha256:${"a".repeat(64)}`,
    workflow_profile: null,
    next_action: null,
    guidance: null,
    blockers: [],
    allowed_paths: [],
    checks: { path: null, freshness: "missing", status: null },
    authoritative_plan: null,
    contract: null,
    capability_ownership: null,
    active_sprint: { path: null, freshness: "not_applicable" },
    handoff: { path: ".ai/harness/handoff/current.md", freshness: "missing" },
    resume: { path: RESUME, freshness: "missing" },
  } as unknown as EffectiveState;

  test("an unavailable state yields only the fail-closed section and runs no provider", () => {
    let called = false;
    const resolution: EffectiveStateResolution = {
      ok: false, reason_code: "state_resolution_failed", error_hash: `sha256:${"b".repeat(64)}`, message: "/private/secret",
    };
    const sections = buildSessionStartSections("/unused", resolution, 0, [
      { id: "probe", priority: 2, render: () => { called = true; return null; } },
    ]);
    expect(called).toBe(false);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: "effective-state", mandatory: true });
    expect(sections[0].content).toStartWith("[HarnessStateUnavailable] ");
    expect(sections[0].content).not.toContain("/private/secret");
  });

  test("a throwing provider is replaced by a mandatory marker and later providers still run", () => {
    const later: SessionContextProvider = { id: "later", priority: 4, render: () => ({ content: "later body", source: "later.md" }) };
    const sections = buildSessionStartSections("/unused", { ok: true, state }, 0, [
      { id: "boom", priority: 2, render: () => { throw new Error("provider bug /private/path"); } },
      later,
    ]);
    expect(sections.map(({ id }) => id)).toEqual(["effective-state", "boom", "later"]);
    expect(sections[1]).toMatchObject({ content: "[SessionContextProviderFailed] boom", mandatory: true });
    const context = budgetSessionContext(sections);
    expect(context).toStartWith("[HarnessState] ");
    expect(context).toContain("[SessionContextProviderFailed] boom");
    expect(context).toContain("later body");
    expect(context).not.toContain("/private/path");
  });

  test("the provider ids are stable and name no retired script", () => {
    expect(SESSION_CONTEXT_PROVIDERS.map(({ id }) => id)).toEqual(["architecture-owed", "pending-plan-capture", "active-sprint", "resume"]);
  });
});

describe("architecture owed section", () => {
  test("a branch that owes architecture updates gets one short section until the manifest changes", () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "architecture-owed-")));
    const repo = join(parent, "repo");
    mkdirSync(repo);
    try {
      const git = (...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: repo, encoding: "utf8" }).trim();
      git("init", "-q", "-b", "main");
      git("commit", "-q", "--allow-empty", "-m", "init");
      writeFileSync(join(repo, ".gitignore"), ".ai/\n");
      mkdirSync(join(repo, "docs/architecture"), { recursive: true });
      mkdirSync(join(repo, "src/owned"), { recursive: true });
      writeFileSync(join(repo, "docs/architecture/.projection-manifest.json"), "{}\n");
      writeFileSync(join(repo, "src/owned/a.ts"), "export const a = 1;\n");
      git("add", "-A"); git("commit", "-q", "-m", "projected");
      const base = git("rev-parse", "HEAD");
      git("checkout", "-q", "-b", "feature");
      writeFileSync(join(repo, "src/owned/a.ts"), "export const a = 2;\n");
      git("commit", "-q", "-am", "change owned code");
      const state = {
        capability_ownership: {
          review_base: base,
          capability_ids: ["core-owned"],
          capabilities: [{ id: "core-owned", module_document: "docs/architecture/modules/core/owned.md", paths: ["src/owned/a.ts"] }],
          unowned_paths: [],
        },
      } as unknown as EffectiveState;

      const body = owedCapabilitiesSessionBody(repo, state);
      expect(body?.source).toBe("repo-harness state owed --json");
      expect(body!.content).toContain("[ArchitectureOwed]");
      expect(body!.content).toContain("core-owned (docs/architecture/modules/core/owned.md)");
      expect(body!.content.split("\n").length).toBeLessThanOrEqual(3);

      writeFileSync(join(repo, "docs/architecture/.projection-manifest.json"), '{"refreshed":true}\n');
      git("commit", "-q", "-am", "refresh the projection");
      expect(owedCapabilitiesSessionBody(repo, state)).toBeNull();
      expect(git("status", "--porcelain")).toBe("");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
