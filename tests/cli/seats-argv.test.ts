import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { delimiter, join } from "path";
import { seatPaneName } from "../../src/core/board/seat-launch";
import { DEFAULT_SEATS_CONFIG, WORKER_SEAT_IDS } from "../../src/core/board/seats-settings";
import { repoHarnessRepoIdFor } from "../../src/effects/repo-registry";
import { classifyQuotaReading } from "../../src/core/board/quota";
import { formatSeatRoutes, seatAccountQuotas } from "../../src/core/board/seat-routing";
import { readClaudeQuota } from "../../src/effects/board/quota";

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
    mkdirSync(join(home, '.quota-bin'));
    writeFileSync(join(home, 'codex-used'), '51');
    writeFileSync(join(home, '.quota-bin', 'codex'), `#!${process.execPath}
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + '\\n');
  if (message.method === 'account/rateLimits/read') process.stdout.write(JSON.stringify({ id: message.id, result: { rateLimits: {
    primary: { usedPercent: Number(require('node:fs').readFileSync(require('node:path').join(process.env.HOME, 'codex-used'), 'utf8')),
      windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 84 * 3600 }
  } } }) + '\\n');
});
`);
    chmodSync(join(home, '.quota-bin', 'codex'), 0o755);
    fn(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function run(env: Record<string, string>, args: string[], cwd?: string) {
  const { CLAUDE_CONFIG_DIR: _inherited, ...base } = process.env;
  const result = spawnSync(process.execPath, [CLI, "seats", "argv", ...args], { env: { ...base, ...env, PATH: `${join(env.HOME!, '.quota-bin')}${delimiter}${env.PATH ?? base.PATH ?? ''}` }, encoding: "utf8", cwd });
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
  test("an old seats section fails closed with the update action", () => {
    const seats = { orchestrator: DEFAULT_SEATS_CONFIG.orchestrator, advisor: DEFAULT_SEATS_CONFIG.advisor, worker: DEFAULT_SEATS_CONFIG.worker };
    withHome(seats, home => {
      const result = argv(home, "worker", "--json");
      expect([result.status, result.stdout]).toEqual([1, ""]);
      expect(JSON.parse(result.stderr)).toMatchObject({ error: "seats_config_migration_required", next_action: "repo-harness update" });
    });
  });

  test("an unconfigured worker-light fails with seat_not_configured", () => {
    withHome({ ...DEFAULT_SEATS_CONFIG, 'worker-light': null }, home => {
      const result = argv(home, "worker-light", "--json");
      expect([result.status, result.stdout]).toEqual([1, ""]);
      expect(JSON.parse(result.stderr).error).toBe("seat_not_configured");
    });
  });

  test("saving routes and direct launches reject a non-Pi worker-light", () => {
    for (const configured of [DEFAULT_SEATS_CONFIG.worker, DEFAULT_SEATS_CONFIG['worker-important-fast']]) {
      const seats = { ...DEFAULT_SEATS_CONFIG, 'worker-light': configured };
      withHome(seats, home => {
        expect(argv(home, 'worker-light', '--json').status).toBe(0);
        mkdirSync(join(home, '.repo-harness', 'quota'));
        for (const used of [81, 95]) {
          writeFileSync(join(home, '.repo-harness', 'quota', 'claude.json'), JSON.stringify({ observed_at: new Date().toISOString(), rate_limits: {
            seven_day: { used_percentage: used, resets_at: Math.floor(Date.now() / 1000) + 3600 },
          } }));
          const quota = seatAccountQuotas([classifyQuotaReading(readClaudeQuota({ HOME: home }), Date.now())], seats.routing);
          const result = argv(home, 'worker-light', '--json');
          expect({
            routes: formatSeatRoutes(seats, quota).split('\n').filter(line => /^route important_/u.test(line)),
            launch: [result.status, result.stdout, result.stderr ? JSON.parse(result.stderr).error : null],
          }).toEqual({
            routes: ['route important_deep: none (worker-light is not a Pi seat)', 'route important_fast: none (worker-light is not a Pi seat)'],
            launch: [1, '', 'seat_quota_reserved'],
          });
        }
      });
    }
  });

  test("every configured worker seat keeps its brief, labels and issue pane naming", () => {
    const seats = { ...DEFAULT_SEATS_CONFIG, 'worker-light': { runtime: 'pi', model: null, effort: null, tools: DEFAULT_SEATS_CONFIG.worker.tools, fleet: [] } };
    withHome(seats, home => withRepository(home, "rh", repo => {
      for (const seat of WORKER_SEAT_IDS) {
        const result = run(registryEnv(home), [seat, "--repository-id", "1", "--issue", "1925", "--parent", "1924", "--json"], repo);
        expect(result.status, result.stderr).toBe(0);
        const value = JSON.parse(result.stdout);
        expect(value.runtime).toBe(seats[seat].runtime);
        expect(value.brief).toContain("You are a worker seat.");
        expect(value.labels).toContain(`repo-harness.seat=${seat}`);
        expect([value.name, value.tab]).toEqual(["rh-w-1925", "#1924"]);
      }
    }));
  });

  test("gatekeeper and reviewer require a PR and launch read-only reviews", () => {
    withHome(undefined, home => withRepository(home, "rh", repo => {
      for (const [seat, role] of [["gatekeeper", "gk"], ["reviewer", "rv"]]) {
        const missing = argv(home, seat!, "--json");
        expect([missing.status, JSON.parse(missing.stderr).error]).toEqual([1, "pane_name_invalid"]);
        const bare = argv(home, seat!, "--pr", "1925", "--json");
        expect(bare.status, bare.stderr).toBe(0);
        const result = run(registryEnv(home), [seat!, "--repository-id", "1", "--pr", "1925", "--json"], repo);
        expect(result.status, result.stderr).toBe(0);
        const value = JSON.parse(result.stdout);
        expect([value.name, value.tab]).toEqual([`rh-${role}-1925`, "review"]);
        expect(value.brief).toContain("Do not edit files, commit, push, or write to GitHub. Report the verdict first");
        expect(value.brief).not.toContain("You are a worker seat");
        if (seat === "gatekeeper") {
          expect(agent(value)).toContain("read-only");
          expect(agent(value)).not.toContain('web_search="disabled"');
        } else expect(tools(agent(value))).toEqual(["WebFetch", "WebSearch", "Read", "Glob", "Grep", "Bash", "Monitor", "TaskStop"]);
        expect(value.brief).not.toContain("Do not use the network.");
      }
    }));
  });

  test("Pi review seats exclude edit and write tools and report the shell path as common_commands", () => {
    for (const seat of ["gatekeeper", "reviewer"] as const) {
      withHome({ ...DEFAULT_SEATS_CONFIG, [seat]: { ...DEFAULT_SEATS_CONFIG[seat], runtime: "pi", model: null, effort: null } }, home => {
        const result = argv(home, seat, "--pr", "1928", "--json");
        expect(result.status, result.stderr).toBe(0);
        const value = JSON.parse(result.stdout);
        expect(value.argv.slice(0, 8)).toEqual(["pi", "--exclude-tools", "edit,write",
          "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-mcp"]);
        expect(value.limits).toContainEqual({ subject: "edit", level: "common_commands" });
      });
    }
  });

  test("Pi worker and review seats pass the configured provider and model", () => {
    for (const seat of ["worker", "reviewer"] as const) {
      const config = { ...DEFAULT_SEATS_CONFIG[seat], runtime: "pi", model: "magpie/cursor/deepseek-v41-flash-1017", effort: null, fleet: [] };
      withHome({ ...DEFAULT_SEATS_CONFIG, [seat]: config }, home => {
        const result = argv(home, seat, ...(seat === "reviewer" ? ["--pr", "1950"] : []), "--json");
        expect(result.status, result.stderr).toBe(0);
        const value = JSON.parse(result.stdout);
        expect(value.argv.slice(0, 5)).toEqual(["pi", "--provider", "magpie", "--model", "cursor/deepseek-v41-flash-1017"]);
        if (seat === "reviewer") expect(value.argv.slice(5, 12)).toEqual(["--exclude-tools", "edit,write", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-mcp"]);
      });
    }
  });

  test("a Pi GPT worker passes thinking, draws on the ChatGPT account and takes the hyper model", () => {
    const worker = { ...DEFAULT_SEATS_CONFIG.worker, runtime: "pi" as const, model: "magpie/codex/gpt-6.1-terra", fleet: [] };
    withHome({ ...DEFAULT_SEATS_CONFIG, worker }, home => {
      writeFileSync(join(home, 'codex-used'), '51');
      expect(launch(home, "worker").argv.slice(0, 7)).toEqual(["pi", "--provider", "magpie", "--model", "codex/gpt-6.1-terra", "--thinking", "high"]);
      writeFileSync(join(home, 'codex-used'), '50');
      expect(launch(home, "worker").argv.slice(0, 7)).toEqual(["pi", "--provider", "magpie", "--model", "codex/gpt-6-astra", "--thinking", "high"]);
    });
    const quota = seatAccountQuotas([], DEFAULT_SEATS_CONFIG.routing);
    expect(formatSeatRoutes({ ...DEFAULT_SEATS_CONFIG, worker }, quota)).toContain("route simple_fast: worker (pi magpie/codex/gpt-6.1-terra high; chatgpt unknown)");
  });

  test("quota changes Codex models and Claude control-seat effort, preserves Pi, and stops exhaustion", () => {
    withHome(DEFAULT_SEATS_CONFIG, home => {
      writeFileSync(join(home, 'codex-used'), '50');
      expect(launch(home, "worker").argv.slice(0, 5)).toEqual(["codex", "-m", "gpt-6-astra", "-c", 'model_reasoning_effort="high"']);
      writeFileSync(join(home, 'codex-used'), '51');
      expect(launch(home, "worker").argv.slice(0, 3)).toEqual(["codex", "-m", DEFAULT_SEATS_CONFIG.worker.model]);
      expect(launch(home, "worker-important-fast").argv.slice(0, 5)).toEqual(["claude", "--model", "sonnet", "--effort", "medium"]);
      expect(launch(home, "advisor").argv.slice(0, 5)).toEqual(["claude", "--model", "opus", "--effort", "max"]);
      expect(launch(home, "worker-light").argv.slice(0, 5)).toEqual(["pi", "--provider", "magpie", "--model", "cursor/deepseek-v41-flash-1017"]);
      mkdirSync(join(home, ".repo-harness", "quota"));
      for (const used of [81, 95]) {
        writeFileSync(join(home, ".repo-harness", "quota", "claude.json"), JSON.stringify({ observed_at: new Date().toISOString(), rate_limits: {
          seven_day: { used_percentage: used, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        } }));
        for (const id of ['advisor', 'orchestrator', 'worker-important-fast']) {
          const result = argv(home, id, '--json');
          if (used === 95 || id === 'worker-important-fast') {
            expect([result.status, result.stdout, JSON.parse(result.stderr).error]).toEqual([1, '', used === 95 ? 'seat_quota_exhausted' : 'seat_quota_reserved']);
          } else {
            const value = JSON.parse(result.stdout);
            const start = value.argv.indexOf('claude');
            expect(value.argv.slice(start, start + 5)).toEqual(['claude', '--model', 'opus', '--effort', 'high']);
          }
        }
      }
      writeFileSync(join(home, 'codex-used'), '95');
      const exhausted = argv(home, 'worker', '--json');
      expect([exhausted.status, JSON.parse(exhausted.stderr).error]).toEqual([1, 'seat_quota_exhausted']);
    });
  });

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
    const seats = { ...DEFAULT_SEATS_CONFIG, worker: { ...DEFAULT_SEATS_CONFIG.worker, tools: ["edit", "read", "shell"] } };
    const handoff = "As a Codex worker seat in a linked contract worktree, edit files and run checks only. Do not run `git fetch`, `git commit` or `git push`. In your last message, give the commit subject and body, the PR title and body, and the check results. The orchestrator commits your worktree diff with that message and explicit paths only, pushes the branch and opens the PR. It is the head owner of record and pushes each fix round; no other agent pushes to that PR. You remain the content author and answer review threads through the orchestrator.";
    withHome(seats, (home) => {
      const result = argv(home, "worker");
      expect(result.status).toBe(0);
      const args: string[] = JSON.parse(result.stdout);
      const instructions = args.at(-1)!;
      expect(args.slice(0, -1)).toEqual(["codex", "-m", "gpt-6.1-terra", "-c", 'model_reasoning_effort="high"', "-s", "workspace-write", "-c", "sandbox_workspace_write.network_access=false", "-c", 'web_search="disabled"', "-c"]);
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

  test("a writable Codex seat enables sandbox network with net, and other seats keep net", () => {
    withHome(undefined, (home) => {
      const worker = launch(home, "worker");
      expect(worker.argv).toEqual(expect.arrayContaining(["workspace-write", "sandbox_workspace_write.network_access=true"]));
      expect(worker.argv).not.toContain('web_search="disabled"');
      expect(worker.brief).not.toContain("Do not use the network.");
    });
    const editNet = ["edit", "net", "read", "shell"];
    withHome({ ...DEFAULT_SEATS_CONFIG, worker: { ...DEFAULT_SEATS_CONFIG.worker, tools: editNet } }, (home) => {
      expect(launch(home, "worker").argv).toEqual(expect.arrayContaining(["workspace-write", "sandbox_workspace_write.network_access=true"]));
    });
    const seats = {
      ...DEFAULT_SEATS_CONFIG,
      advisor: { runtime: "codex", model: null, effort: null, tools: ["net", "read"], fleet: [] },
      worker: { runtime: "claude", model: null, effort: null, tools: editNet, fleet: [] },
    };
    withHome(seats, (home) => {
      const advisor = launch(home, "advisor").argv;
      expect(advisor.slice(0, 3)).toEqual(["codex", "-s", "read-only"]);
      expect(advisor.join(" ")).not.toContain("network_access");
      expect(advisor).not.toContain('web_search="disabled"');
      expect(tools(launch(home, "worker").argv)).toEqual(expect.arrayContaining(["Edit", "WebFetch"]));
    });
    withHome({ ...seats, worker: { ...seats.worker, runtime: "pi" } }, (home) => {
      expect(launch(home, "worker").argv[0]).toBe("pi");
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

  test("an enabled plugin without a manifest uses its entry name even when marked orphaned", () => {
    withHome(undefined, (home) => {
      rmSync(join(home, "plugin", ".claude-plugin"), { recursive: true });
      writeFileSync(join(home, "plugin", ".orphaned_at"), "1793467681012");
      const result = argv(home, "advisor", "--json");
      expect(result.status).toBe(0);
      expect(denied(JSON.parse(result.stdout).argv)).toEqual(expect.arrayContaining(["Agent(demo:helper)", "Agent(demo:review:security)"]));
    });
  });

  test("a scoped npm plugin without a manifest fails closed with the missing name cause and repair", () => {
    const key = "@scope/pkg@npm";
    withHome(undefined, (home) => {
      rmSync(join(home, "plugin", ".claude-plugin"), { recursive: true });
      writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { [key]: true } }));
      writeFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ plugins: { [key]: [{ installPath: join(home, "plugin") }] } }));
      const result = argv(home, "advisor", "--json");
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      const error = JSON.parse(result.stderr);
      expect(error.error).toBe("claude_agent_types_unreadable");
      expect(error.message).toContain(`entry ${key} has no manifest and its key gives no plugin name. Add a .claude-plugin/plugin.json with a name, or reinstall the plugin from a marketplace.`);
    });
  });

  test("a present plugin manifest without a name fails closed with a repair", () => {
    withHome(undefined, (home) => {
      const manifestPath = join(home, "plugin", ".claude-plugin", "plugin.json");
      writeFileSync(manifestPath, "{}");
      const result = argv(home, "advisor", "--json");
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr)).toEqual({ ok: false, error: "claude_agent_types_unreadable", message: `${manifestPath} has no plugin name. Reinstall or disable demo@market.` });
    });
  });

  test("a present plugin manifest name takes precedence over its entry name", () => {
    withHome(undefined, (home) => {
      writeFileSync(join(home, "plugin", ".claude-plugin", "plugin.json"), JSON.stringify({ name: "manifest-name" }));
      const rules = denied(launch(home, "advisor").argv);
      expect(rules).toContain("Agent(manifest-name:helper)");
      expect(rules).not.toContain("Agent(demo:helper)");
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
          [{ HC_TERMINAL_ID: "t5" }, null, [label, `codex ${agent(worker).length - 1} -m gpt-6.1-terra`]],
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
