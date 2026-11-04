import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { seatPaneName } from "../../src/core/operator/seat-launch";
import { DEFAULT_SEATS_CONFIG } from "../../src/core/operator/seats-settings";
import { repoHarnessRepoIdFor } from "../../src/effects/repo-registry";

const CLI = join(import.meta.dir, "..", "..", "src/cli/index.ts");

/**
 * A HOME with an optional seats section, a nested user agent `nested-auditor`, and one enabled plugin
 * `demo` with a nameless agent (`demo:helper`) and a nested agent (`demo:review:security`).
 */
function withHome(seats: unknown, fn: (home: string) => void) {
  const home = mkdtempSync(join(tmpdir(), "seats-argv-"));
  try {
    if (seats !== undefined) {
      mkdirSync(join(home, ".repo-harness"));
      writeFileSync(join(home, ".repo-harness", "config.json"), JSON.stringify({ seats }));
    }
    const plugin = join(home, "plugin");
    mkdirSync(join(plugin, "agents", "review"), { recursive: true });
    mkdirSync(join(plugin, ".claude-plugin"));
    writeFileSync(join(plugin, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "demo" }));
    writeFileSync(join(plugin, "agents", "helper.md"), "Body without frontmatter\n");
    writeFileSync(join(plugin, "agents", "review", "security.md"), "---\nname: security\ndescription: Demo\n---\nBody\n");
    mkdirSync(join(home, ".claude", "agents", "review"), { recursive: true });
    writeFileSync(join(home, ".claude", "agents", "review", "audit.md"), "---\nname: nested-auditor\ndescription: Demo\n---\nBody\n");
    mkdirSync(join(home, ".claude", "plugins"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "demo@market": true } }));
    writeFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "demo@market": [{ scope: "user", installPath: plugin }] } }));
    fn(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function run(env: Record<string, string>, args: string[], cwd?: string) {
  const { CLAUDE_CONFIG_DIR: _inherited, ...base } = process.env;
  const result = spawnSync("bun", [CLI, "seats", "argv", ...args], { env: { ...base, ...env }, encoding: "utf8", cwd });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const argv = (home: string, ...args: string[]) => run({ HOME: home }, args);

const launch = (home: string, seat: string) => JSON.parse(argv(home, seat, "--json").stdout);
/** The values of `flag`, up to the next flag; empty when `flag` is absent. */
function values(args: string[], flag: string): string[] {
  const start = args.indexOf(flag);
  if (start === -1) return [];
  const end = args.findIndex((arg, index) => index > start && arg.startsWith("--"));
  return args.slice(start + 1, end);
}
const tools = (args: string[]) => values(args, "--tools");

const git = (cwd: string, ...args: string[]) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
};

/** The test preload sets REPO_HARNESS_HOME, so the registry of `home` is named explicitly. */
const registryEnv = (home: string) => ({ HOME: home, REPO_HARNESS_HOME: join(home, ".repo-harness") });

/** A primary checkout with one commit, a linked worktree of it, and its registry entry with `panePrefix` when given. */
function withRepository(home: string, panePrefix: string | undefined, fn: (repo: string, worktree: string) => void) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "seats-argv-repo-")));
  const worktree = `${repo}-wt`;
  try {
    git(repo, "init", "-q");
    git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "init");
    git(repo, "worktree", "add", "-q", worktree);
    const at = "2026-11-03T00:00:00.000Z";
    const entry = { id: repoHarnessRepoIdFor(repo), path: repo, accessMode: "read_only", source: "manual", registeredAt: at, lastSeenAt: at };
    mkdirSync(join(home, ".repo-harness"), { recursive: true });
    writeFileSync(join(home, ".repo-harness", "registered-repos.json"),
      JSON.stringify({ version: 1, authorizationRevision: 0, repos: [panePrefix === undefined ? entry : { ...entry, panePrefix }] }));
    fn(repo, worktree);
  } finally {
    rmSync(worktree, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
}
const denied = (args: string[]) => values(args, "--disallowedTools");
/** With --repository-id the argv is `/bin/sh -c <script> <bun> <cli>` and then the agent argv. */
const agent = (launch: { argv: string[] }) => launch.argv.slice(5);

describe("repo-harness seats argv", () => {
  test("without a seats section the advisor launch comes from the defaults and briefs the default fleet", () => {
    withHome(undefined, (home) => {
      const advisor = launch(home, "advisor");
      expect(advisor.source).toBe("defaults");
      expect(advisor.brief).toContain("Collect evidence through your sub-agents: `deep-reasoner`, `explorer`.");
      expect(advisor.argv.slice(0, 5)).toEqual(["claude", "--model", "opus", "--effort", "max"]);
      expect(advisor.argv.at(-1)).toBe(advisor.brief);
      // The allow list holds only the tools of the enabled groups; every other built-in tool, such as Workflow, is off.
      expect(tools(advisor.argv)).toEqual(["ToolSearch", "ListMcpResourcesTool", "ReadMcpResourceTool", "WebFetch", "WebSearch", "Read", "Glob", "Grep",
        "Bash", "Monitor", "TaskStop", "Agent"]);
      expect(advisor.argv).not.toContain("--strict-mcp-config");
      // `--tools` cannot name agent types, so every agent type outside the fleet is refused by name: managed roles,
      // built-in types, fork, nested user types and plugin types by the host identity rule.
      expect(denied(advisor.argv)).toEqual(expect.arrayContaining(["Agent(fast-worker)", "Agent(general-purpose)", "Agent(fork)",
        "Agent(nested-auditor)", "Agent(demo:helper)", "Agent(demo:review:security)", "Bash(gh pr create *)"]));
      expect(denied(advisor.argv)).not.toContain("Agent(explorer)");
      expect(advisor.limits).toContainEqual({ subject: "fleet", level: "named_types_only" });
      // With a shell on, Bash can still write files, so the edit limit is partial.
      expect(advisor.limits).toContainEqual({ subject: "edit", level: "common_commands" });
      expect(advisor.brief).toContain("The host refuses only common commands for these limits. Keep them yourself. Do not edit files. Do not write to GitHub.");
    });
  });

  test("an empty advisor fleet refuses every agent type, and a Pi seat says it has no sub-agents", () => {
    const seats = { ...DEFAULT_SEATS_CONFIG, advisor: { ...DEFAULT_SEATS_CONFIG.advisor, fleet: [] }, worker: { runtime: "pi", model: null, effort: null, tools: ["edit", "read", "shell"], fleet: [] } };
    withHome(seats, (home) => {
      const advisor = launch(home, "advisor");
      expect(advisor.source).toBe("seats");
      expect(advisor.brief).toContain("You have no sub-agents. Collect evidence yourself.");
      expect(tools(advisor.argv)).not.toContain("Agent");
      expect(denied(advisor.argv).some((rule: string) => rule.startsWith("Agent("))).toBe(false);
      const worker = launch(home, "worker");
      expect(worker.argv).toEqual(["pi", "--append-system-prompt", worker.brief]);
      expect(worker.brief).toContain("You have no sub-agents.");
      expect(worker.limits).toContainEqual({ subject: "gh", level: "instructions_only" });
      expect(worker.brief).toContain("These limits are instructions only; the host does not enforce them. Keep them yourself. Do not use the network. Do not use the task list tools. Do not use MCP tools. Do not write to GitHub.");
    });
  });

  test("the orchestrator seat names its triage queue and allows exactly its groups' tools, without the Agent tool", () => {
    withHome(undefined, (home) => {
      const orchestrator = launch(home, "orchestrator").argv;
      expect(orchestrator.slice(0, 3)).toEqual(["env", "CLAUDE_CODE_TASK_LIST_ID=repo-harness-orchestrator", "claude"]);
      expect(tools(orchestrator)).toEqual(["ToolSearch", "ListMcpResourcesTool", "ReadMcpResourceTool", "WebFetch", "WebSearch", "Read", "Glob", "Grep",
        "Bash", "Monitor", "TaskStop", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"]);
      expect(orchestrator).not.toContain("--disallowedTools");
      expect(orchestrator).not.toContain("--strict-mcp-config");
    });
  });

  test("the orchestrator brief names its fleet and its review path; a fleet keeps the Agent tool and refuses every other agent type", () => {
    const seatReview = "You do not review a PR that you dispatched; route that review to another seat.";
    const gatekeeperReview = "You do not review a PR yourself. An independent `gatekeeper` sub-agent may review a PR that you dispatched; route every other review of that PR to another seat.";
    const seatsOnly = (roles: string) => `You may call these read-only sub-agents: ${roles}. Call no other agent type. Writers and the Codex review run only in Herdr seats: dispatch them to seats through Herdr.`;
    for (const [fleet, review, dispatch] of [
      [[], seatReview, "You do not dispatch sub-agents (the Agent tool) for execution. Dispatch work only to seats through Herdr."],
      [["explorer"], seatReview, seatsOnly("`explorer`")],
      [["deep-reasoner", "explorer", "gatekeeper"], gatekeeperReview, seatsOnly("`deep-reasoner`, `explorer`, `gatekeeper`")],
    ] as const) {
      withHome({ ...DEFAULT_SEATS_CONFIG, orchestrator: { ...DEFAULT_SEATS_CONFIG.orchestrator, fleet } }, (home) => {
        const orchestrator = launch(home, "orchestrator");
        expect(orchestrator.brief).toContain("You push only the branch of a Codex worker seat handoff: commit its worktree diff with its message and explicit paths only, push the branch, open the PR, and push each fix round. You do not tag, release, delete, or change credentials or permissions.");
        expect(orchestrator.brief).not.toContain("You do not push, tag, release, delete, or change credentials or permissions.");
        // Each row also refuses the conflicting sentences: the other review path, and the Herdr-only rule with a fleet.
        const other = review === seatReview ? gatekeeperReview : seatReview;
        expect([fleet, orchestrator.brief.includes(review), orchestrator.brief.includes(dispatch), orchestrator.brief.includes(other)]).toEqual([fleet, true, true, false]);
        if (fleet.length === 0) return;
        expect(orchestrator.brief).not.toContain("Dispatch work only to seats through Herdr.");
        expect(tools(orchestrator.argv)).toContain("Agent");
        expect(denied(orchestrator.argv)).toEqual(expect.arrayContaining(["Agent(fast-worker)", "Agent(deep-worker)", "Agent(general-purpose)", "Agent(fork)"]));
        expect(denied(orchestrator.argv).filter((rule: string) => fleet.some(role => rule === `Agent(${role})`))).toEqual([]);
        expect(orchestrator.limits).toContainEqual({ subject: "fleet", level: "named_types_only" });
      });
    }
  });

  test("the Codex argv holds only flags that Codex applies; the fleet goes into the launch instructions only", () => {
    const seats = { ...DEFAULT_SEATS_CONFIG, worker: { ...DEFAULT_SEATS_CONFIG.worker, tools: ["edit", "net", "read", "shell"] } };
    const handoff = "As a Codex worker seat in a linked contract worktree, edit files and run checks only. Do not run `git fetch`, `git commit` or `git push`. In your last message, give the commit subject and body, the PR title and body, and the check results. The orchestrator commits your worktree diff with that message and explicit paths only, pushes the branch and opens the PR. It is the head owner of record and pushes each fix round; no other agent pushes to that PR. You remain the content author and answer review threads through the orchestrator.";
    withHome(seats, (home) => {
      const result = argv(home, "worker");
      expect(result.status).toBe(0);
      const args: string[] = JSON.parse(result.stdout);
      const instructions = args.at(-1)!;
      expect(args.slice(0, -1)).toEqual(["codex", "-m", "gpt-6.1-sol", "-c", 'model_reasoning_effort="high"', "-s", "workspace-write", "-c", "sandbox_workspace_write.network_access=true", "-c"]);
      expect(instructions).toStartWith('developer_instructions="You are a worker seat.');
      expect(JSON.parse(instructions.slice("developer_instructions=".length))).toContain(handoff);
      expect(JSON.parse(instructions.slice("developer_instructions=".length))).toContain("These limits are instructions only; the host does not enforce them. Keep them yourself. Do not use the task list tools. Do not use MCP tools. Do not write to GitHub.");
      expect(result.stderr).toContain("limit fleet: instructions_only (written into the launch instructions only)");
      expect(result.stderr).toContain("limit mcp: instructions_only (written into the launch instructions only)");
    });
    withHome({ ...seats, worker: { ...seats.worker, runtime: "claude" } }, (home) => {
      expect(launch(home, "worker").brief).not.toContain(handoff);
    });
  });

  test("without net, Codex disables web search; an MCP path keeps edit and net partial, and the fleet is always instructions only", () => {
    const seats = {
      ...DEFAULT_SEATS_CONFIG,
      advisor: { runtime: "codex", model: null, effort: null, tools: ["mcp", "read", "shell"], fleet: [] },
      worker: { ...DEFAULT_SEATS_CONFIG.worker, tools: ["edit", "read", "shell"] },
    };
    withHome(seats, (home) => {
      const worker = launch(home, "worker");
      expect(worker.argv).toEqual(expect.arrayContaining(["sandbox_workspace_write.network_access=false", 'web_search="disabled"']));
      // No argv flag disables every inherited MCP server, so net stays partial even when the mcp group is off.
      expect(worker.limits).toContainEqual({ subject: "net", level: "common_commands" });
      expect(worker.brief).toContain("The host refuses only common commands for these limits. Keep them yourself. Do not use the network.");
      const advisor = launch(home, "advisor");
      expect(advisor.argv.slice(0, 5)).toEqual(["codex", "-s", "read-only", "-c", 'web_search="disabled"']);
      expect(advisor.limits).toContainEqual({ subject: "net", level: "common_commands" });
      expect(advisor.limits).toContainEqual({ subject: "edit", level: "common_commands" });
      expect(advisor.limits).toContainEqual({ subject: "fleet", level: "instructions_only" });
    });
  });

  test("on Claude, an mcp-off seat loads no MCP server, and edit is enforced only when the shell and MCP groups are both off", () => {
    const seats = {
      ...DEFAULT_SEATS_CONFIG,
      advisor: { runtime: "claude", model: null, effort: null, tools: ["read"], fleet: [] },
      worker: { runtime: "claude", model: null, effort: null, tools: ["mcp", "read"], fleet: [] },
    };
    withHome(seats, (home) => {
      const worker = launch(home, "worker");
      expect(tools(worker.argv)).toEqual(["ToolSearch", "ListMcpResourcesTool", "ReadMcpResourceTool", "Read", "Glob", "Grep"]);
      expect(worker.argv).not.toContain("--strict-mcp-config");
      expect(worker.limits).toContainEqual({ subject: "edit", level: "common_commands" });
      expect(worker.brief).toContain("Keep them yourself. Do not edit files.");
      const advisor = launch(home, "advisor");
      expect(tools(advisor.argv)).toEqual(["Read", "Glob", "Grep"]);
      expect(advisor.argv).toContain("--strict-mcp-config");
      expect(advisor.argv).not.toContain("--mcp-config");
      expect(advisor.argv).not.toContain("--disallowedTools");
      expect(advisor.limits).toContainEqual({ subject: "edit", level: "enforced" });
      expect(advisor.limits).toContainEqual({ subject: "net", level: "enforced" });
    });
  });

  test("the agent types come from CLAUDE_CONFIG_DIR when it is set", () => {
    withHome(undefined, (home) => {
      const root = join(home, "alternate");
      mkdirSync(join(root, "agents"), { recursive: true });
      writeFileSync(join(root, "agents", "other.md"), "---\nname: alternate-auditor\ndescription: Demo\n---\nBody\n");
      const advisor = JSON.parse(run({ HOME: home, CLAUDE_CONFIG_DIR: root }, ["advisor", "--json"]).stdout);
      expect(denied(advisor.argv)).toContain("Agent(alternate-auditor)");
      expect(denied(advisor.argv)).not.toContain("Agent(nested-auditor)");
    });
  });

  test("an agent file with list and nested frontmatter fields is read by its name", () => {
    withHome(undefined, (home) => {
      writeFileSync(join(home, ".claude", "agents", "api.md"),
        "---\nname: api-developer\ndescription: Builds APIs: REST and RPC\nskills:\n  - api-design\n  - testing\nhooks:\n  PreToolUse:\n    - matcher: Bash\n---\nBody\n");
      expect(denied(launch(home, "advisor").argv)).toContain("Agent(api-developer)");
    });
  });

  test("an empty CLAUDE_CONFIG_DIR fails closed", () => {
    withHome(undefined, (home) => {
      const result = run({ HOME: home, CLAUDE_CONFIG_DIR: "" }, ["advisor", "--json"]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr).error).toBe("claude_agent_types_unreadable");
    });
  });

  test("an agent name that does not parse fails closed", () => {
    withHome(undefined, (home) => {
      writeFileSync(join(home, "plugin", "agents", "bad.md"), "---\nname: [oops\ndescription: Demo\n---\nBody\n");
      const result = argv(home, "advisor", "--json");
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr).error).toBe("claude_agent_types_unreadable");
    });
  });

  test("the seat labels hold the GitHub repository id and the dispatch numbers, and need --repository-id", () => {
    withHome(undefined, (home) => {
      // With --repository-id the command also names the pane, so it runs in a registered checkout with a prefix.
      withRepository(home, "rh", (repo) => {
        const worker = JSON.parse(run(registryEnv(home), ["worker", "--repository-id", "1186405141", "--issue", "1473", "--pr", "1521", "--parent", "1000", "--json"], repo).stdout);
        expect(worker.labels).toEqual(["repo-harness.seat=worker", "repo-harness.repository=1186405141", "repo-harness.issue=1473", "repo-harness.pr=1521", "repo-harness.parent=1000"]);
      });
      const missing = argv(home, "worker", "--issue", "1473");
      expect(missing.status).toBe(1);
      expect(missing.stdout).toBe("");
      expect(JSON.parse(missing.stderr).error).toBe("repository_id_required");
    });
  });

  test("with --repository-id the argv labels its own terminal before the agent starts; a label failure starts no agent", () => {
    withHome(undefined, (home) => {
      withRepository(home, "rh", (repo) => {
        const worker = JSON.parse(run(registryEnv(home), ["worker", "--repository-id", "1186405141", "--parent", "1000", "--issue", "1473", "--json"], repo).stdout);
        expect(worker.argv.slice(0, 2)).toEqual(["/bin/sh", "-c"]);
        // A fake hc and a fake agent on an explicit PATH: no real terminal is labelled or started.
        const bin = join(home, "bin"), log = join(home, "calls.log");
        mkdirSync(bin);
        writeFileSync(join(bin, "hc"), `#!/bin/sh\nprintf 'hc %s\\n' "$*" >> "${log}"\nif [ -n "$FAKE_HC_FAIL" ]; then printf '%s' '{"error":{"kind":"not_found","message":"no terminal"}}' >&2; exit 3; fi\n`
          + `printf '%s' '{"address":"t5","state":"live","labels":{"repo-harness.seat":"worker"},"turn":0}'\n`);
        writeFileSync(join(bin, "codex"), `#!/bin/sh\nprintf 'codex %s %s %s\\n' "$#" "$1" "$2" >> "${log}"\n`);
        for (const name of ["hc", "codex"]) chmodSync(join(bin, name), 0o755);
        const label = "hc label --json -- t5 repo-harness.seat=worker repo-harness.repository=1186405141 repo-harness.issue=1473 repo-harness.parent=1000";
        for (const [env, error, calls] of [
          [{ HC_TERMINAL_ID: "t5" }, null, [label, `codex ${agent(worker).length - 1} -m gpt-6.1-sol`]],
          [{ HC_TERMINAL_ID: "t5", FAKE_HC_FAIL: "1" }, "label_failed", [label]],
          [{}, "terminal_unknown", []],
        ] as const) {
          writeFileSync(log, "");
          const result = spawnSync(worker.argv[0], worker.argv.slice(1), { env: { ...registryEnv(home), PATH: `${bin}:/bin:/usr/bin`, ...env }, encoding: "utf8", cwd: repo });
          const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
          const failure = error === null ? null : JSON.parse(result.stderr);
          expect([result.status === 0, failure?.error ?? null, failure?.message.startsWith("The seat did not start: ") ?? null, lines])
            .toEqual([error === null, error, error === null ? null : true, [...calls]]);
        }
      });
    });
  });

  test("the pane name and the tab name come from the registry prefix of the primary checkout, one per role", () => {
    withHome(undefined, (home) => {
      withRepository(home, "rh", (repo, worktree) => {
        const named = (cwd: string, ...args: string[]) => JSON.parse(run(registryEnv(home), [...args, "--repository-id", "1186405141", "--json"], cwd).stdout);
        const orchestrator = named(repo, "orchestrator");
        expect([orchestrator.name, orchestrator.tab]).toEqual(["rh-orch", "orch"]);
        // A Claude seat carries the same name as its session name.
        expect(agent(orchestrator).slice(2, 5)).toEqual(["claude", "-n", "rh-orch"]);
        const advisor = named(repo, "advisor", "--parent", "1000");
        expect([advisor.name, advisor.tab]).toEqual(["rh-adv", "orch"]);
        expect(agent(advisor).slice(0, 3)).toEqual(["claude", "-n", "rh-adv"]);
        // A linked worktree resolves to its primary checkout; the default worker runs Codex, which has no session name flag.
        const worker = named(worktree, "worker", "--parent", "1000", "--issue", "1508", "--pr", "1521", "--qualifier", "device");
        expect([worker.name, worker.tab]).toEqual(["rh-w-1508-device", "#1000"]);
        expect(worker.argv).not.toContain("rh-w-1508-device");
        const release = named(repo, "worker", "--release", "0252");
        expect([release.name, release.tab]).toEqual(["rh-w-rel0252", "other"]);
        expect(seatPaneName({ prefix: "rh", seat: "reviewer", pr: "1536", qualifier: "codex" })).toBe("rh-rv-1536-codex");
        expect(() => seatPaneName({ prefix: "a", seat: "reviewer", pr: "1536" })).toThrow(expect.objectContaining({ code: "pane_name_invalid" }));
        // Without --repository-id the argv has no name, as before.
        expect(launch(home, "orchestrator").argv).not.toContain("-n");
      });
    });
  });

  test("a name over 32 characters and an entry without a prefix fail closed", () => {
    withHome(undefined, (home) => {
      withRepository(home, "rhlong", (repo) => {
        const result = run(registryEnv(home), ["worker", "--repository-id", "1", "--issue", "1508", "--qualifier", "averyveryverylongslice", "--json"], repo);
        expect(result.status).toBe(1);
        expect(result.stdout).toBe("");
        expect(JSON.parse(result.stderr).error).toBe("pane_name_invalid");
      });
      withRepository(home, undefined, (repo) => {
        const result = run(registryEnv(home), ["orchestrator", "--repository-id", "1", "--json"], repo);
        expect(result.status).toBe(1);
        expect(JSON.parse(result.stderr).error).toBe("pane_name_invalid");
      });
    });
  });

  test("an invalid seats section fails closed", () => {
    withHome({ advisor: {} }, (home) => {
      const result = argv(home, "advisor", "--json");
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr).error).toBe("config_invalid");
    });
  });
});
