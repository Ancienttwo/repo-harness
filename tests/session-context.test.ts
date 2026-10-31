import { agentNoticeFixture, NOTICE_CAPABILITY } from './helpers/agent-notice';
import { fixtureWrite, fixtureGit, fixtureCommit } from './helpers/module-repository';
import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { buildSessionStartSections } from "../src/cli/hook/session-context";
import { budgetSessionContext } from "../src/cli/hook/session-context-budget";
import type { EffectiveState } from "../src/core/state/types";
import type { EffectiveStateResolution } from "../src/effects/loop/state-input-collector";
import { fixtureTaskId } from "./helpers/sprint-fixture";
import { getHandlerForRoute } from '../src/cli/hook/handler-registry';
import { getRoute } from '../src/cli/hook/route-registry';
import { createStateInputCollector } from '../src/effects/loop/state-input-collector';
import { resolveEffectiveState } from '../src/effects/state/resolve-effective-state';
import { hookIdentity } from './helpers/hook-identity';

const HOOK_ENTRY = join(import.meta.dir, "../src/cli/hook-entry.ts");
const RESUME = ".ai/harness/handoff/resume.md";
const SPRINT = "plans/sprints/fixture.sprint.md";
const EDIT_GUARD_SCOPE = "[EditGuardScope] The edit guard checks Edit, Write and apply_patch. Claude and Pi Bash have a literal-write tripwire only; other shell writes skip it. Use the edit tools to change repository files. Use Bash to run commands.";

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

/** The `references` object of the `[HarnessState]` line. */
function statePayload(context: string): Record<string, unknown> {
  const line = context.split("\n")[0]!;
  expect(line).toStartWith("[HarnessState] ");
  return JSON.parse(line.slice("[HarnessState] ".length)) as Record<string, unknown>;
}

describe("SessionStart host envelope", () => {
  test("both hosts state the edit guard scope right after the state section", () => {
    const f = fixture("session-edit-guard-scope");
    try {
      for (const host of ["claude", "codex"] as const) {
        expect(sessionStartContext(f, host).split("\n")[1]).toBe(EDIT_GUARD_SCOPE);
      }
    } finally { f.cleanup(); }
  }, 30_000);

  test("an unavailable state still states the edit guard scope as a mandatory section", () => {
    const f = fixture("session-edit-guard-scope-unavailable");
    try {
      const collector = createStateInputCollector({ repoRoot: f.root, resolveEffectiveState: () => ({
        ok: false, reason_code: "state_resolution_failed", error_hash: `sha256:${"c".repeat(64)}`, message: "boom",
      }) });
      const result = getHandlerForRoute(getRoute("SessionStart", "default")!).run({
        event: "SessionStart", repoRoot: f.root, payload: {}, identity: hookIdentity(),
        env: { ...process.env, HOME: f.home }, now: new Date(), collector,
      });
      expect(result.sessionContexts!.find(({ id }) => id === "edit-guard-scope")).toMatchObject({ mandatory: true, content: EDIT_GUARD_SCOPE });
    } finally { f.cleanup(); }
  });

  test("a resume file adds no resume text and no resume pointer", () => {
    const f = fixture("session-resume-only");
    try {
      f.write(RESUME, "# Codex Resume Packet\n\nContinue the widget work.\n");
      for (const host of ["claude", "codex"] as const) {
        const context = sessionStartContext(f, host);
        expect(context.split("\n").slice(1)).toEqual([EDIT_GUARD_SCOPE]);
        expect(statePayload(context)).not.toHaveProperty("references");
        expect(context).not.toContain(RESUME);
        expect(context).not.toContain("# Resume");
        expect(context).not.toContain("Recovery context only");
        expect(context).not.toContain("Continue the widget work.");
      }
    } finally { f.cleanup(); }
  }, 30_000);

  test("an idle repository still gets the state and edit guard scope sections and nothing else, with no plan or todo references and no side files", () => {
    const f = fixture("session-idle");
    try {
      const context = sessionStartContext(f);
      expect(context).toStartWith("[HarnessState] ");
      expect(context.split("\n").slice(1)).toEqual([EDIT_GUARD_SCOPE]);
      expect(context).not.toContain("plans/");
      expect(context).not.toContain("capture-plan");
      expect(context).not.toContain("references.plan");
      expect(statePayload(context)).not.toHaveProperty("references");
      expect(existsSync(join(f.root, ".ai/harness/state/session-context-budget.json"))).toBe(false);
      expect(existsSync(join(f.root, ".ai/harness/state/session-run-identity.json"))).toBe(false);
      expect(existsSync(join(f.root, ".ai/harness/security"))).toBe(false);
    } finally { f.cleanup(); }
  }, 30_000);

  test("a retired sprint is absent and a large resume has no pointer", () => {
    const f = fixture("session-large-resume");
    try {
      writeActiveSprint(f);
      const body = Array.from({ length: 400 }, (_, index) => `- resume line ${index} with recovery detail`).join("\n");
      f.write(RESUME, `# Codex Resume Packet\n\n${body}\n`);
      const context = sessionStartContext(f);
      expect(context.split("\n").slice(1)).toEqual([EDIT_GUARD_SCOPE]);
      const payload = statePayload(context);
      expect(payload).not.toHaveProperty("references");
      expect(context).not.toContain(RESUME);
      expect(context).not.toContain("[ContextRef:resume]");
      expect(context).not.toContain("resume line 0 with recovery detail");
      expect(context).not.toContain("# Active Sprint");
      expect(context).not.toContain("plan -> contract -> worktree");
    } finally { f.cleanup(); }
  }, 30_000);

  test("a pending plan record no longer renders any capture guidance", () => {
    const f = fixture("session-pending-plan");
    try {
      f.write(".ai/harness/planning/pending.json", JSON.stringify({ kind: "host-plan", host: "codex", prompt_slug: "fixture-plan" }));
      const context = sessionStartContext(f);
      expect(context).not.toContain("# Pending Plan Capture");
      expect(context).not.toContain(".ai/harness/planning/pending.json");
      expect(context).not.toContain("capture-plan");
      expect(context.split("\n").slice(1)).toEqual([EDIT_GUARD_SCOPE]);
    } finally { f.cleanup(); }
  }, 30_000);

  test("SessionStart writes no architecture state", () => {
    const f = fixture("session-architecture-on-demand", { context: { capability_source: "archcontext" } });
    try {
      mkdirSync(join(f.root, ".archcontext/model/nodes"), { recursive: true });
      const context = sessionStartContext(f);
      expect(context).not.toContain("[ArchitectureDebt]");
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
    capability_ownership: null,
  } as unknown as EffectiveState;

  test("an unavailable state yields only the fail-closed section", () => {
    const resolution: EffectiveStateResolution = {
      ok: false, reason_code: "state_resolution_failed", error_hash: `sha256:${"b".repeat(64)}`, message: "/private/secret",
    };
    const sections = buildSessionStartSections(resolution);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: "effective-state", mandatory: true });
    expect(sections[0].content).toStartWith("[HarnessStateUnavailable] ");
    expect(sections[0].content).not.toContain("/private/secret");
  });

  test("an available state yields only the state section", () => {
    const sections = buildSessionStartSections({ ok: true, state });
    expect(sections.map(({ id }) => id)).toEqual(["effective-state"]);
    const context = budgetSessionContext(sections);
    expect(context).toStartWith("[HarnessState] ");
    expect(context).not.toContain("[SessionContextProviderFailed]");
  });
});

describe("architecture debt section", () => {
  test('review round 1: a large mandatory state cannot replace a consumed notice with a pointer', () => {
    const root = realpathSync(agentNoticeFixture());
    try {
      const state = { ...resolveEffectiveState(root), guidance: 'x'.repeat(7_000) };
      const collector = createStateInputCollector({ repoRoot: root, resolveEffectiveState: () => ({ ok: true, state }) });
      const result = getHandlerForRoute(getRoute('SessionStart', 'default')!).run({
        event: 'SessionStart', repoRoot: root, payload: {}, identity: hookIdentity({ host: 'codex' }),
        env: { ...process.env, HOME: join(root, 'home') }, now: new Date(), collector,
      });
      const notice = result.sessionContexts!.find(section => section.id === 'architecture-debt')!;
      expect(notice.content).toContain('[ArchitectureDebt]');
      const budgeted = budgetSessionContext(result.sessionContexts!);
      expect(budgeted).toContain(notice.content);
      expect(budgeted).not.toContain('[ContextRef:architecture-debt]');
      expect(existsSync(join(root, '.ai/harness/state/agent-notice'))).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  function nativeFixture(): Fixture {
    const root = agentNoticeFixture();
    return { root, home: join(root, 'home'), write: (path, text) => fixtureWrite(root, path, text), cleanup: () => rmSync(root, { recursive: true, force: true }) };
  }

  test("main skips historical debt and a dirty owned path reaches each supported host", () => {
    for (const host of ['claude', 'codex'] as const) {
      const f = nativeFixture();
      try {
        fixtureCommit(f.root);
        fixtureGit(f.root, ['branch', '-f', 'main', 'HEAD']);
        expect(sessionStartContext(f, host)).not.toContain('[ArchitectureDebt]');
        f.write('src/module/read.ts', 'export const read = () => 3;\n');
        expect(sessionStartContext(f, host)).toContain(`[ArchitectureDebt] 1 new in ${NOTICE_CAPABILITY}`);
      } finally { f.cleanup(); }
    }
  });

  test("worker sessions receive notice text and a repeat session shares the id marker", () => {
    for (const host of ['claude', 'codex'] as const) {
      const f = nativeFixture();
      try {
        const result = spawnSync(process.execPath, [HOOK_ENTRY, 'SessionStart', '--route', 'default'], {
          cwd: f.root, encoding: 'utf8', input: JSON.stringify({ session_id: 'worker-session', agent_type: 'worker' }),
          env: { ...process.env, HOME: f.home, HOOK_REPO_ROOT: f.root, HOOK_HOST: host },
        });
        expect(result.status, result.stderr).toBe(0);
        const envelope = JSON.parse(result.stdout);
        expect(envelope.hookSpecificOutput.additionalContext).toContain('[ArchitectureDebt]');
        expect(envelope.hookSpecificOutput.additionalContext).toContain(NOTICE_CAPABILITY);
        expect(envelope.systemMessage).toBe(host === 'claude' ? `Architecture: 1 debt item in ${NOTICE_CAPABILITY}; run repo-harness architecture-debt --json.` : undefined);
        expect(sessionStartContext(f, host)).not.toContain('[ArchitectureDebt]');
        f.write('docs/architecture/.projection-manifest.json', '{"profile":"repo-harness/v1","refreshed":true}\n');
        expect(sessionStartContext(f, host)).not.toContain('[ArchitectureDebt]');
      } finally { f.cleanup(); }
    }
  });
});
