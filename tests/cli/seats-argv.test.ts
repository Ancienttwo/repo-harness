import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DEFAULT_SEATS_CONFIG } from "../../src/core/operator/seats-settings";

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

function run(env: Record<string, string>, args: string[]) {
  const { CLAUDE_CONFIG_DIR: _inherited, ...base } = process.env;
  const result = spawnSync("bun", [CLI, "seats", "argv", ...args], { env: { ...base, ...env }, encoding: "utf8" });
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
const denied = (args: string[]) => values(args, "--disallowedTools");

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
      expect(denied(advisor.argv)).toEqual(expect.arrayContaining(["Agent(fast-worker)", "Agent(orchestrator)", "Agent(general-purpose)", "Agent(fork)",
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

  test("the Codex argv holds only flags that Codex applies; the fleet goes into the launch instructions only", () => {
    const seats = { ...DEFAULT_SEATS_CONFIG, worker: { ...DEFAULT_SEATS_CONFIG.worker, tools: ["edit", "net", "read", "shell"] } };
    withHome(seats, (home) => {
      const result = argv(home, "worker");
      expect(result.status).toBe(0);
      const args: string[] = JSON.parse(result.stdout);
      const instructions = args.at(-1)!;
      expect(args.slice(0, -1)).toEqual(["codex", "-m", "gpt-6.1-sol", "-c", 'model_reasoning_effort="high"', "-s", "workspace-write", "-c", "sandbox_workspace_write.network_access=true", "-c"]);
      expect(instructions).toStartWith('developer_instructions="You are a worker seat.');
      expect(JSON.parse(instructions.slice("developer_instructions=".length))).toContain("These limits are instructions only; the host does not enforce them. Keep them yourself. Do not use the task list tools. Do not use MCP tools. Do not write to GitHub.");
      expect(result.stderr).toContain("limit fleet: instructions_only (written into the launch instructions only)");
      expect(result.stderr).toContain("limit mcp: instructions_only (written into the launch instructions only)");
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
      const worker = JSON.parse(argv(home, "worker", "--repository-id", "1186405141", "--issue", "1473", "--pr", "1521", "--parent", "1000", "--json").stdout);
      expect(worker.labels).toEqual(["repo-harness.seat=worker", "repo-harness.repository=1186405141", "repo-harness.issue=1473", "repo-harness.pr=1521", "repo-harness.parent=1000"]);
      const missing = argv(home, "worker", "--issue", "1473");
      expect(missing.status).toBe(1);
      expect(missing.stdout).toBe("");
      expect(JSON.parse(missing.stderr).error).toBe("repository_id_required");
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
