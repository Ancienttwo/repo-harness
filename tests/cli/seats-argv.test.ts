import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { delimiter, dirname, join } from "path";
import { seatPaneName } from "../../src/core/board/seat-launch";
import { HANDOFF_SECTIONS, seatResetReason, seatResetSteps } from "../../src/core/board/seat-reset";
import { SeatResetError, runSeatReset, type SeatResetNotify } from "../../src/effects/board/seat-reset";
import { DEFAULT_SEATS_CONFIG, WORKER_SEAT_IDS } from "../../src/core/board/seats-settings";
import { repoHarnessRepoIdFor } from "../../src/effects/repo-registry";
import { classifyQuotaReading, decodeCodexRateLimitsResult } from "../../src/core/board/quota";
import { formatSeatRoutes, seatAccountQuotas } from "../../src/core/board/seat-routing";
import { assertPiShell } from "../../src/effects/board/pi-shell";
import { readClaudeQuota } from "../../src/effects/board/quota";

const CLI = join(import.meta.dir, "..", "..", "src/cli/index.ts");

/** A Pi seat launch probes its shell (#2370); a stub shell prints what the probe script prints on a good or a bash 3.2 shell. */
const GOOD_PROBE_OUTPUT = "RESULT[a smile :)\nthen a span `echo INJECTED-BY-BACKTICK`]";
const BAD_PROBE_OUTPUT = "RESULT[a smile :)\nthen a span INJECTED-BY-BACKTICK]";
function stubShell(home: string, name: string, output: string): string {
  const path = join(home, name);
  writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' '${output}'\n`);
  chmodSync(path, 0o755);
  return path;
}

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
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    writeFileSync(join(home, ".pi", "agent", "settings.json"), JSON.stringify({ shellPath: stubShell(home, "good-shell", GOOD_PROBE_OUTPUT) }));
    mkdirSync(join(home, '.quota-bin'));
    writeFileSync(join(home, 'codex-used'), '51');
    writeFileSync(join(home, 'codex-credits'), 'false');
    writeFileSync(join(home, '.quota-bin', 'codex'), `#!${process.execPath}
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + '\\n');
  if (message.method === 'account/rateLimits/read') process.stdout.write(JSON.stringify({ id: message.id, result: { rateLimits: {
    primary: { usedPercent: Number(require('node:fs').readFileSync(require('node:path').join(process.env.HOME, 'codex-used'), 'utf8')),
      windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 84 * 3600 },
    credits: { hasCredits: require('node:fs').readFileSync(require('node:path').join(process.env.HOME, 'codex-credits'), 'utf8').trim() === 'true',
      unlimited: false, balance: require('node:fs').readFileSync(require('node:path').join(process.env.HOME, 'codex-credits'), 'utf8').trim() === 'true' ? '34410.83' : '0' }
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
  const { CLAUDE_CONFIG_DIR: _inherited, PI_CODING_AGENT_DIR: _piDirectory, ...base } = process.env;
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
/** Every seat argv first unsets the seat identity that it inherits and the Pi role directory (#1975, #1977); `bare` checks that prefix and drops it. */
const UNSET_SEAT = ["env", "-u", "REPO_HARNESS_SEAT", "-u", "REPO_HARNESS_SEAT_REPOSITORY", "-u", "PI_SUBAGENT_EXTRA_AGENT_DIRS"];
function bare(args: string[]): unknown[] {
  expect(args.slice(0, UNSET_SEAT.length)).toEqual(UNSET_SEAT);
  return args.slice(UNSET_SEAT.length);
}

describe("repo-harness seats argv", () => {
  test("a Pi seat launch refuses a shell that fails the heredoc probe, passes a good one and reports a shell that cannot start", () => {
    const seats = { ...DEFAULT_SEATS_CONFIG, "worker-light": { runtime: "pi", model: null, effort: null, tools: DEFAULT_SEATS_CONFIG.worker.tools, fleet: [] } };
    withHome(seats, home => {
      const settings = join(home, ".pi", "agent", "settings.json");
      writeFileSync(settings, JSON.stringify({ shellPath: stubShell(home, "bad-shell", BAD_PROBE_OUTPUT) }));
      const refused = argv(home, "worker-light", "--json");
      expect([refused.status, refused.stdout, JSON.parse(refused.stderr).error]).toEqual([1, "", "pi_shell_refused"]);
      expect(JSON.parse(refused.stderr).message).toContain("shellPath");
      writeFileSync(settings, JSON.stringify({ shellPath: join(home, "missing-shell") }));
      expect(JSON.parse(argv(home, "worker-light", "--json").stderr).error).toBe("pi_shell_probe_failed");
      // The project settings file overrides the global one for shellPath, as Pi merges them.
      mkdirSync(join(home, ".pi"), { recursive: true });
      writeFileSync(join(home, ".pi", "settings.json"), JSON.stringify({ shellPath: stubShell(home, "project-shell", GOOD_PROBE_OUTPUT) }));
      expect(run({ HOME: home }, ["worker-light", "--json"], home).status).toBe(0);
      // A shell that does not finish is its own error.
      const slow = join(home, "slow-shell");
      writeFileSync(slow, "#!/bin/sh\nexec sleep 30\n");
      chmodSync(slow, 0o755);
      writeFileSync(join(home, ".pi", "settings.json"), JSON.stringify({ shellPath: slow }));
      expect(JSON.parse(run({ HOME: home }, ["worker-light", "--json"], home).stderr).error).toBe("pi_shell_probe_failed");
      rmSync(join(home, ".pi", "settings.json"));
      // A Claude seat does not probe: the same refusing settings leave it unchanged.
      writeFileSync(settings, JSON.stringify({ shellPath: stubShell(home, "bad-shell", BAD_PROBE_OUTPUT) }));
      expect(argv(home, "orchestrator", "--json").status).toBe(0);
    });
  });

  test("an empty project shellPath selects the default shell, and a path that is not absolute is refused", async () => {
    const home = mkdtempSync(join(tmpdir(), "pi-shell-"));
    try {
      mkdirSync(join(home, ".pi", "agent"), { recursive: true });
      writeFileSync(join(home, ".pi", "agent", "settings.json"), JSON.stringify({ shellPath: stubShell(home, "global-shell", BAD_PROBE_OUTPUT) }));
      writeFileSync(join(home, ".pi", "settings.json"), JSON.stringify({ shellPath: "" }));
      const env = { HOME: home };
      await expect(assertPiShell(env, home, stubShell(home, "default-shell", GOOD_PROBE_OUTPUT))).resolves.toBeUndefined();
      for (const bad of ["~/bin/bash", "bin/bash"]) {
        writeFileSync(join(home, ".pi", "settings.json"), JSON.stringify({ shellPath: bad }));
        await expect(assertPiShell(env, home)).rejects.toMatchObject({ code: "pi_shell_refused", message: expect.stringContaining(`"${bad}"`) });
      }
      await expect(assertPiShell({ ...env, PI_CODING_AGENT_DIR: "~/agent" }, home)).rejects.toMatchObject({ code: "pi_shell_refused" });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

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
        expect(value.brief).toContain("Do not edit files, commit or push. Do not write to GitHub, with one exception: publish your own round with `repo-harness review publish --pr <number> --receipt <path>`. Run no other GitHub write. Report the verdict first");
        expect(value.brief).not.toContain("Do not write to GitHub.");
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
        expect(bare(value.argv).slice(0, 8)).toEqual(["pi", "--exclude-tools", "edit,write",
          "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-mcp"]);
        expect(value.limits).toContainEqual({ subject: "edit", level: "common_commands" });
      });
    }
  });

  test("an exhausted gatekeeper account launches the fallback seat as the gatekeeper; gatekeeper-fallback is no launch target", () => {
    const fallback = { ...DEFAULT_SEATS_CONFIG.gatekeeper, runtime: "pi" as const, model: "magpie/cursor/deepseek-v41-flash-1017", effort: null };
    withHome({ ...DEFAULT_SEATS_CONFIG, "gatekeeper-fallback": fallback }, home => {
      const gatekeeper = () => JSON.parse(argv(home, "gatekeeper", "--pr", "2253", "--json").stdout);
      writeFileSync(join(home, "codex-used"), "60");
      expect(bare(gatekeeper().argv).slice(0, 3)).toEqual(["codex", "-m", DEFAULT_SEATS_CONFIG.gatekeeper.model]);
      writeFileSync(join(home, "codex-used"), "97");
      const value = gatekeeper();
      expect([value.seat, value.runtime, bare(value.argv).slice(0, 5)]).toEqual(["gatekeeper", "pi", ["pi", "--provider", "magpie", "--model", "cursor/deepseek-v41-flash-1017"]]);
      expect(value.brief).toContain("You are the gatekeeper seat.");
      const refused = argv(home, "gatekeeper-fallback", "--pr", "2253", "--json");
      expect([refused.status, JSON.parse(refused.stderr).error]).toEqual([1, "seat_unknown"]);
    });
  });

  test("Pi worker and review seats pass the configured provider and model", () => {
    for (const seat of ["worker", "reviewer"] as const) {
      const config = { ...DEFAULT_SEATS_CONFIG[seat], runtime: "pi", model: "magpie/cursor/deepseek-v41-flash-1017", effort: null, fleet: [] };
      withHome({ ...DEFAULT_SEATS_CONFIG, [seat]: config }, home => {
        const result = argv(home, seat, ...(seat === "reviewer" ? ["--pr", "1950"] : []), "--json");
        expect(result.status, result.stderr).toBe(0);
        const value = JSON.parse(result.stdout);
        expect(bare(value.argv).slice(0, 5)).toEqual(["pi", "--provider", "magpie", "--model", "cursor/deepseek-v41-flash-1017"]);
        if (seat === "reviewer") expect(bare(value.argv).slice(5, 12)).toEqual(["--exclude-tools", "edit,write", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-mcp"]);
      });
    }
  });

  test("a Pi GPT worker passes thinking, draws on the ChatGPT account and takes the hyper model", () => {
    const worker = { ...DEFAULT_SEATS_CONFIG.worker, runtime: "pi" as const, model: "magpie/codex/gpt-6.1-terra", fleet: [] };
    withHome({ ...DEFAULT_SEATS_CONFIG, worker }, home => {
      writeFileSync(join(home, 'codex-used'), '51');
      expect(bare(launch(home, "worker").argv).slice(0, 7)).toEqual(["pi", "--provider", "magpie", "--model", "codex/gpt-6.1-terra", "--thinking", "high"]);
      writeFileSync(join(home, 'codex-used'), '50');
      expect(bare(launch(home, "worker").argv).slice(0, 7)).toEqual(["pi", "--provider", "magpie", "--model", "codex/gpt-6-astra", "--thinking", "high"]);
      writeFileSync(join(home, 'codex-used'), '95');
      const exhausted = argv(home, "worker", "--json");
      expect([exhausted.status, JSON.parse(exhausted.stderr).error]).toEqual([1, "seat_quota_exhausted"]);
    });
    const seats = { ...DEFAULT_SEATS_CONFIG, worker };
    expect(formatSeatRoutes(seats, seatAccountQuotas([], seats.routing))).toContain("route simple_fast: worker (pi magpie/codex/gpt-6.1-terra high; chatgpt unknown)");
    const reading = decodeCodexRateLimitsResult({ rateLimits: { primary: { usedPercent: 95, windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 84 * 3600 } } }, new Date().toISOString());
    expect(formatSeatRoutes(seats, seatAccountQuotas([classifyQuotaReading(reading, Date.now())], seats.routing))).toContain("route simple_fast: none (chatgpt exhausted)");
  });

  test("a Pi GPT seat gets its own fleet roles in a generated directory; a DeepSeek seat gets none", () => {
    const worker = { ...DEFAULT_SEATS_CONFIG.worker, runtime: "pi" as const, model: "magpie/codex/gpt-6.1-terra", fleet: ["explorer", "fast-worker"] };
    withHome({ ...DEFAULT_SEATS_CONFIG, worker }, home => {
      writeFileSync(join(home, 'codex-used'), '51');
      const gpt = launch(home, "worker");
      const [assignment, command] = bare(gpt.argv) as string[];
      const directory = assignment!.replace("PI_SUBAGENT_EXTRA_AGENT_DIRS=", "");
      expect([command, directory.startsWith(join(realpathSync(home), ".repo-harness", "seats", "pi-fleet"))]).toEqual(["pi", true]);
      expect(readdirSync(directory).sort()).toEqual(["rh-explorer.md", "rh-fast-worker.md"]);
      const explorer = readFileSync(join(directory, "rh-explorer.md"), "utf8");
      expect(explorer).toContain("name: rh-explorer\n");
      expect(explorer).toContain("model: magpie/codex/gpt-6-luna\nthinking: high\ntools: read, grep, find, ls, bash\n");
      expect(readFileSync(join(directory, "rh-fast-worker.md"), "utf8")).toContain("tools: read, grep, find, ls, bash, edit, write\n");
      expect(gpt.brief).toContain("You may call these sub-agents: `rh-explorer`, `rh-fast-worker`.");
      expect(gpt.limits).toContainEqual({ subject: "fleet", level: "instructions_only" });
      const light = launch(home, "worker-light");
      expect(bare(light.argv)[0]).toBe("pi");
      expect(light.brief).toContain("You have no sub-agents.");
    });
  });

  test("every role name in a Pi advisor brief is the generated rh- name", () => {
    const advisor = { ...DEFAULT_SEATS_CONFIG.advisor, runtime: "pi" as const, model: "magpie/codex/gpt-6-astra", effort: null, fleet: ["deep-reasoner", "explorer"] };
    withHome({ ...DEFAULT_SEATS_CONFIG, advisor }, home => {
      writeFileSync(join(home, 'codex-used'), '51');
      const { brief } = launch(home, "advisor");
      expect(brief).toContain("`rh-deep-reasoner`, `rh-explorer`");
      expect(brief).toContain("Use rh-deep-reasoner only for an independent second judgment.");
      expect(brief).not.toMatch(/(?<!rh-)deep-reasoner/u);
    });
  });

  test("quota changes Codex models and Claude control-seat effort, preserves Pi, and stops exhaustion", () => {
    withHome(DEFAULT_SEATS_CONFIG, home => {
      writeFileSync(join(home, 'codex-used'), '50');
      expect(bare(launch(home, "worker").argv).slice(0, 5)).toEqual(["codex", "-m", "gpt-6-astra", "-c", 'model_reasoning_effort="high"']);
      writeFileSync(join(home, 'codex-used'), '51');
      expect(bare(launch(home, "worker").argv).slice(0, 3)).toEqual(["codex", "-m", DEFAULT_SEATS_CONFIG.worker.model]);
      expect(bare(launch(home, "worker-important-fast").argv).slice(0, 5)).toEqual(["claude", "--model", "sonnet", "--effort", "medium"]);
      expect(bare(launch(home, "advisor").argv).slice(0, 5)).toEqual(["claude", "--model", "fable", "--effort", "high"]);
      expect(bare(launch(home, "worker-light").argv).slice(0, 5)).toEqual(["pi", "--provider", "magpie", "--model", "cursor/deepseek-v41-flash-1017"]);
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
      writeFileSync(join(home, 'codex-credits'), 'false');
      const exhausted = argv(home, 'worker', '--json');
      expect([exhausted.status, JSON.parse(exhausted.stderr).error]).toEqual([1, 'seat_quota_exhausted']);
      // #2251: the flag admits the seat only when the account still has credits. Without the flag nothing changes.
      for (const credits of ['false', 'true']) {
        writeFileSync(join(home, 'codex-credits'), credits);
        const granted = argv(home, 'worker', '--json', '--spend-credits');
        expect([credits, granted.status, granted.stderr ? JSON.parse(granted.stderr).error : null])
          .toEqual([credits, credits === 'true' ? 0 : 1, credits === 'true' ? null : 'seat_quota_exhausted']);
        expect(argv(home, 'worker', '--json').status).toBe(1);
      }
      expect(bare(JSON.parse(argv(home, 'worker', '--json', '--spend-credits').stdout).argv).slice(0, 3))
        .toEqual(['codex', '-m', DEFAULT_SEATS_CONFIG.worker.model]);
    });
  });

  test("without a seats section the advisor launch comes from the defaults and briefs the default fleet", () => {
    withHome(undefined, (home) => {
      const advisor = launch(home, "advisor");
      expect(advisor.source).toBe("defaults");
      expect(advisor.brief).toContain("Collect evidence through your sub-agents: `deep-reasoner`, `explorer`.");
      expect(bare(advisor.argv).slice(0, 5)).toEqual(["claude", "--model", "fable", "--effort", "high"]);
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
      expect(bare(worker.argv)).toEqual(["pi", "--append-system-prompt", worker.brief]);
      expect(worker.brief).toContain("You have no sub-agents.");
      expect(worker.limits).toContainEqual({ subject: "gh", level: "instructions_only" });
      expect(worker.brief).toContain("These limits are instructions only; the host does not enforce them. Keep them yourself. Do not use the network. Do not use the task list tools. Do not use MCP tools. Do not write to GitHub.");
    });
  });

  test("the orchestrator seat names its triage queue and allows exactly its groups' tools, without the Agent tool", () => {
    withHome(undefined, (home) => {
      const orchestrator = launch(home, "orchestrator").argv;
      expect(bare(orchestrator).slice(0, 2)).toEqual(["CLAUDE_CODE_TASK_LIST_ID=repo-harness-orchestrator", "claude"]);
      expect(tools(orchestrator)).toEqual(["ToolSearch", "ListMcpResourcesTool", "ReadMcpResourceTool", "WebFetch", "WebSearch", "Read", "Glob", "Grep",
        "Bash", "Monitor", "TaskStop", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"]);
      expect(orchestrator).not.toContain("--disallowedTools");
      expect(orchestrator).not.toContain("--strict-mcp-config");
    });
  });

  test("the schedule group adds the Cron tools to --tools and is off by default", () => {
    const advisor = { ...DEFAULT_SEATS_CONFIG.advisor, tools: [...DEFAULT_SEATS_CONFIG.advisor.tools, "schedule"].sort() };
    withHome({ ...DEFAULT_SEATS_CONFIG, advisor }, home => {
      expect(tools(launch(home, "advisor").argv)).toEqual(expect.arrayContaining(["CronCreate", "CronList", "CronDelete"]));
      const off = tools(launch(home, "orchestrator").argv);
      for (const tool of ["CronCreate", "CronList", "CronDelete"]) expect(off).not.toContain(tool);
      expect(launch(home, "advisor").limits).toContainEqual({ subject: "gh", level: "common_commands" });
      expect(launch(home, "orchestrator").limits).toContainEqual({ subject: "schedule", level: "instructions_only" });
      expect(launch(home, "orchestrator").brief).toContain("Do not schedule recurring jobs.");
      // Shell off, MCP on: the MCP path alone keeps the limit instructions_only.
      const mcpOnly = { ...DEFAULT_SEATS_CONFIG.advisor, tools: ["mcp", "read"] };
      withHome({ ...DEFAULT_SEATS_CONFIG, advisor: mcpOnly }, home2 => expect(launch(home2, "advisor").limits).toContainEqual({ subject: "schedule", level: "instructions_only" }));
    });
  });

  test("the schedule group changes no Codex or Pi argv, and a stored config without it decodes unchanged", () => {
    for (const runtime of ["codex", "pi"] as const) {
      const base = { ...DEFAULT_SEATS_CONFIG.advisor, runtime, model: runtime === "pi" ? "magpie/codex/gpt-6-astra" : "gpt-6.1-terra", effort: null, fleet: [] };
      const argvWith = (seatTools: string[]) => withHome({ ...DEFAULT_SEATS_CONFIG, advisor: { ...base, tools: seatTools } }, home => { out.push(launch(home, "advisor").argv); });
      const out: string[][] = [];
      argvWith(["mcp", "net", "read", "shell"]);
      argvWith(["mcp", "net", "read", "schedule", "shell"]);
      expect(out[1]).toEqual(out[0]);
    }
    // A config stored before the group existed lists no schedule and still launches.
    const stored = { ...DEFAULT_SEATS_CONFIG, advisor: { ...DEFAULT_SEATS_CONFIG.advisor, tools: ["mcp", "net", "read", "shell"] } };
    withHome(stored, home => expect(launch(home, "advisor").source).toBe("seats"));
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
        expect(orchestrator.brief).toContain("You push only the branch of a Codex worker seat handoff: commit its worktree diff with its message and explicit paths only, push the branch, open the PR, and push each fix round. You may start the release of a merged release commit with `gh workflow run release.yml -f sha=<merged release commit>`; the owner approves that run in the `release` environment. You do not tag, publish, delete, or change credentials or permissions yourself.");
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
      expect(bare(args).slice(0, -1)).toEqual(["codex", "-m", "gpt-6.1-terra", "-c", 'model_reasoning_effort="high"', "-s", "workspace-write", "-c", "sandbox_workspace_write.network_access=false", "-c", 'web_search="disabled"', "-c"]);
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
      expect(bare(advisor.argv).slice(0, 5)).toEqual(["codex", "-s", "read-only", "-c", 'web_search="disabled"']);
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
      expect(bare(advisor).slice(0, 3)).toEqual(["codex", "-s", "read-only"]);
      expect(advisor.join(" ")).not.toContain("network_access");
      expect(advisor).not.toContain('web_search="disabled"');
      expect(tools(launch(home, "worker").argv)).toEqual(expect.arrayContaining(["Edit", "WebFetch"]));
    });
    withHome({ ...seats, worker: { ...seats.worker, runtime: "pi" } }, (home) => {
      expect(bare(launch(home, "worker").argv)[0]).toBe("pi");
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
        writeFileSync(join(bin, "codex"), `#!/bin/sh\nprintf 'codex %s %s %s %s %s %s\\n' "$#" "$1" "$2" "\${REPO_HARNESS_SEAT-unset}" "\${REPO_HARNESS_SEAT_REPOSITORY-unset}" "\${PI_SUBAGENT_EXTRA_AGENT_DIRS-unset}" >> "${log}"\n`);
        for (const name of ["hc", "codex"]) chmodSync(join(bin, name), 0o755);
        const label = "hc label --json -- t5 repo-harness.seat=worker repo-harness.repository=1186405141 repo-harness.issue=1473 repo-harness.parent=1000";
        for (const [env, error, calls] of [
          // A worker started from a reset seat's env does not inherit the seat identity or a parent's Pi role directory (#1975, #1977).
          [{ HC_TERMINAL_ID: "t5", REPO_HARNESS_SEAT: "orchestrator", REPO_HARNESS_SEAT_REPOSITORY: "1186405141", PI_SUBAGENT_EXTRA_AGENT_DIRS: "/parent/pi-fleet" }, null,
            [label, `codex ${agent(worker).length - agent(worker).indexOf("codex") - 1} -m gpt-6.1-terra unset unset unset`]],
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
        // A Claude seat carries the same name as its session name; the reset seats name their seat and repository in the env (#1972).
        expect(agent(orchestrator).slice(0, 13)).toEqual(["env", "-u", "REPO_HARNESS_SEAT", "-u", "REPO_HARNESS_SEAT_REPOSITORY", "-u", "PI_SUBAGENT_EXTRA_AGENT_DIRS", "CLAUDE_CODE_TASK_LIST_ID=repo-harness-orchestrator",
          "REPO_HARNESS_SEAT=orchestrator", "REPO_HARNESS_SEAT_REPOSITORY=1186405141", "claude", "-n", "rh-orch"]);
        const advisor = named(repo, "advisor", "--parent", "1000");
        expect([advisor.name, advisor.tab]).toEqual(["rh-adv", "orch"]);
        expect(agent(advisor).slice(0, 12)).toEqual(["env", "-u", "REPO_HARNESS_SEAT", "-u", "REPO_HARNESS_SEAT_REPOSITORY", "-u", "PI_SUBAGENT_EXTRA_AGENT_DIRS", "REPO_HARNESS_SEAT=advisor", "REPO_HARNESS_SEAT_REPOSITORY=1186405141", "claude", "-n", "rh-adv"]);
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
        expect(JSON.parse(result.stderr).message).toContain("seats prefix");

        const prefix = (value: string) => spawnSync(process.execPath, [CLI, "seats", "prefix", "--repo", repo, "--pane-prefix", value], { env: { ...process.env, ...registryEnv(home) }, encoding: "utf8" });
        expect(prefix("Bad").status).toBe(1);
        const set = prefix("rhx");
        expect(set.status).toBe(0);
        expect(JSON.parse(set.stdout)).toEqual(expect.objectContaining({ ok: true, registered: true, changed: true, panePrefix: "rhx" }));
        const registry = JSON.parse(readFileSync(join(home, ".repo-harness", "registered-repos.json"), "utf8"));
        expect([registry.authorizationRevision, registry.repos[0].accessMode, registry.repos[0].panePrefix]).toEqual([0, "read_only", "rhx"]);
        expect(JSON.parse(run(registryEnv(home), ["orchestrator", "--repository-id", "1", "--json"], repo).stdout).name).toContain("rhx");
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

describe("repo-harness seats handoff (#2175)", () => {
  test("it fails closed without a seat identity, a session record or a context, else records the request and prints the hook steps", () => {
    const home = mkdtempSync(join(tmpdir(), "seats-handoff-"));
    // The seat directory is fixed under /tmp; a repository id per run keeps the runs apart.
    const repository = String(8_000_000_000 + process.pid);
    const dir = join("/tmp/repo-harness-seats", repository, "orchestrator");
    const transcript = join(home, "transcript.jsonl");
    const handoff = (seat: Record<string, string>) => {
      const { REPO_HARNESS_SEAT: _seat, REPO_HARNESS_SEAT_REPOSITORY: _repository, ...base } = process.env;
      const result = spawnSync(process.execPath, [CLI, "seats", "handoff"], { env: { ...base, HOME: home, ...seat }, encoding: "utf8" });
      return { status: result.status, stdout: result.stdout, error: result.stderr === "" ? null : JSON.parse(result.stderr).error };
    };
    const seat = { REPO_HARNESS_SEAT: "orchestrator", REPO_HARNESS_SEAT_REPOSITORY: repository };
    try {
      const failures = [handoff({}), handoff({ REPO_HARNESS_SEAT: "worker", REPO_HARNESS_SEAT_REPOSITORY: repository }), handoff(seat)];
      mkdirSync(dir, { recursive: true });
      // A record with a readable transcript but any field unlike recordSeatSession writes it is not the SessionStart record.
      writeFileSync(transcript, `${JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 10 } } })}\n`);
      const record = { session_id: "s", transcript_path: transcript, source: "startup", started_at: new Date().toISOString() };
      const { session_id: _missing, ...noSessionId } = record;
      const malformed = [{ transcript_path: transcript }, noSessionId, { ...record, source: "bogus" }, { ...record, started_at: "2024" }];
      for (const bad of malformed) {
        writeFileSync(join(dir, "session.json"), JSON.stringify(bad));
        failures.push(handoff(seat));
      }
      writeFileSync(join(dir, "session.json"), JSON.stringify(record));
      writeFileSync(transcript, `${JSON.stringify({ type: "user", message: { role: "user", content: "hi" } })}\n`);
      failures.push(handoff(seat));
      expect(failures).toEqual([
        { status: 1, stdout: "", error: "seat_identity_missing" }, { status: 1, stdout: "", error: "seat_identity_missing" },
        { status: 1, stdout: "", error: "seat_session_unknown" },
        ...malformed.map(() => ({ status: 1, stdout: "", error: "seat_session_unknown" })),
        { status: 1, stdout: "", error: "seat_context_unknown" },
      ]);
      expect(existsSync(join(dir, "request.json"))).toBe(false);

      writeFileSync(transcript, `${JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 10, cache_read_input_tokens: 200_000, cache_creation_input_tokens: 5 } } })}\n`, { flag: "a" });
      const identity = { seat: "orchestrator", repository } as const;
      expect(handoff(seat)).toEqual({ status: 0, stdout: `${seatResetSteps(identity, "compact")}\n`, error: null });
      // The Stop hook prints the same steps after its token line.
      expect(seatResetReason(identity, 1, 1, "compact").split("\n").slice(1).join("\n")).toBe(seatResetSteps(identity, "compact"));
      const request = JSON.parse(readFileSync(join(dir, "request.json"), "utf8"));
      expect([request.context_tokens, request.transcript_path, Number.isFinite(Date.parse(request.requested_at)), request.action, request.transcript_bytes])
        .toEqual([200_015, transcript, true, "compact", statSync(transcript).size]);
    } finally {
      rmSync(join("/tmp/repo-harness-seats", repository), { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("repo-harness seats reset (#1972)", () => {
  let runs = 0;
  const ended = { ended: true, reason: "status", turn: 3, status: "idle" };
  const timeouts = { signalMs: 300, compactSignalMs: 300, evidenceMs: 300, exitMs: 300, pollMs: 20 };
  /**
   * A fake hc at the hc boundary: no real terminal is read or written. `/clear` writes the new-session signal of a new
   * transcript and `/compact` a compact record of the request transcript when `signal` is on, a relaunch line always writes it, `/exit` ends claude when `exit` is on, and every resume prompt
   * lands in the new transcript. The model answers earlier prompts with text only, and prompt number `evidenceFrom` and
   * later with the Bash tool call that sends RESUMED and its tool result, an error result before prompt `errorUntil`.
   * `answers[n]` replaces the command and the result (ok, error or none) of prompt n + 1.
   * `sendFail` refuses a send.
   */
  function withReset(fn: (f: { handoff: string; body: string; sha: (text: string) => string; state: (patch: Record<string, unknown>) => void;
    reset: (input?: { path?: string; text?: string; sha256?: string; caller?: string; request?: boolean; stale?: boolean; handoff?: boolean; relaunchArgv?: () => Promise<string[]>; before?: () => void; notify?: SeatResetNotify; action?: "compact" | "reset" | null }) => Promise<unknown>;
    home: string; sends: () => string[]; calls: () => string[]; log: () => { kind: string; detail: string; notice: string; requested_at: string }[] }) => Promise<void>, seat: "advisor" | "orchestrator" = "advisor") {
    return async () => {
      const home = mkdtempSync(join(tmpdir(), "seats-reset-"));
      // The handoff path is fixed under /tmp; a repository id per run keeps the runs apart.
      const repository = String(9_000_000_000 + process.pid * 10 + (runs += 1));
      const dir = join("/tmp/repo-harness-seats", repository, seat);
      const handoff = join(dir, "handoff.md");
      try {
        mkdirSync(join(home, "bin"));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(home, "bin", "hc"), `#!${process.execPath}
const fs = require("fs");
const [cmd, , ...rest] = process.argv.slice(2);
const st = JSON.parse(fs.readFileSync("${home}/state.json", "utf8"));
fs.appendFileSync("${home}/calls.log", [cmd, ...rest].join(" ") + "\\n");
const out = value => process.stdout.write(JSON.stringify(value));
const session = (transcript, source = "clear") => fs.writeFileSync("${dir}/session.json", JSON.stringify({ session_id: "s", transcript_path: transcript, source, started_at: new Date().toISOString() }));
if (cmd === "ls") out({ terminals: st.terminals });
if (cmd === "get") out({ address: rest.at(-1), state: "live", labels: rest.at(-1) === "t2" ? st.callerLabels : { "repo-harness.seat": "${seat}", "repo-harness.repository": "${repository}" }, turn: 3, foreground: { pid: 1, name: st.foreground, argv: [], cwd: "/" } });
// wait is one result, or a sequence: the last result answers every later call.
// Wait number waitDelayAt (from 1) answers after waitDelayMs, as a message that arrives late does.
if (cmd === "wait") {
  st.waits = (st.waits ?? 0) + 1;
  if (st.waitDelayAt === st.waits) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, st.waitDelayMs);
  out(Array.isArray(st.wait) ? (st.wait.length > 1 ? st.wait.shift() : st.wait[0]) : st.wait);
}
// As the real hc: keys arrive as typed input; send wraps its text in an envelope, so a sent slash command is chat text.
if (cmd === "keys") {
  const line = rest.slice(2).filter(key => key !== "enter").map(key => (key === "space" ? " " : key)).join("");
  if (line === "/clear" && st.signal) session("${home}/cleared.jsonl");
  if (line === "/compact" && st.signal) session("${home}/old.jsonl", "compact");
  if (line === "/exit" && st.exit) st.foreground = "zsh";
  if (line.startsWith("sh ")) session("${home}/relaunched.jsonl");
  out({ status: null, turn: 4 });
}
if (cmd === "send" && st.sendFail) { process.stderr.write(JSON.stringify({ error: { kind: "blocked", message: "blocked" } })); process.exit(9); }
if (cmd === "send") {
  const text = rest[rest.length - 1];
  if (text.startsWith("You are")) {
    const transcript = JSON.parse(fs.readFileSync("${dir}/session.json", "utf8")).transcript_path;
    fs.appendFileSync(transcript, JSON.stringify({ type: "user", message: { role: "user", content: \`<hc from="t2">\${text}</hc>\` } }) + "\\n");
    const step = st.answers[st.prompts] ?? { command: "hc send t2 RESUMED", result: st.prompts + 1 < st.errorUntil ? "error" : "ok" };
    const answer = (st.prompts += 1) >= st.evidenceFrom
      ? { type: "tool_use", id: "u1", name: "Bash", input: { command: step.command } } : { type: "text", text: "Reading the handoff." };
    fs.appendFileSync(transcript, JSON.stringify({ type: "assistant", message: { role: "assistant", content: [answer] } }) + "\\n");
    if (answer.type === "tool_use" && step.result !== "none") fs.appendFileSync(transcript, JSON.stringify({ type: "user", message: { role: "user",
      content: [{ type: "tool_result", tool_use_id: "u1", is_error: step.result === "error", content: "" }] } }) + "\\n");
  }
  out({ started: null, turn: 4 });
}
fs.writeFileSync("${home}/state.json", JSON.stringify(st));
`);
        chmodSync(join(home, "bin", "hc"), 0o755);
        const callerLabels = { "repo-harness.seat": seat === "advisor" ? "orchestrator" : "advisor", "repo-harness.repository": repository };
        let current: Record<string, unknown> = { callerLabels, terminals: [{ address: "t5", state: "live" }], wait: ended, signal: true, exit: true, foreground: "claude", prompts: 0, evidenceFrom: 1, errorUntil: 0, answers: [] };
        const state = (patch: Record<string, unknown>) => { current = { ...current, ...patch }; writeFileSync(join(home, "state.json"), JSON.stringify(current)); };
        state({});
        writeFileSync(join(home, "calls.log"), "");
        const body = HANDOFF_SECTIONS.map(section => `## ${section}\n\nstate\n`).join("\n");
        const sha = (text: string) => createHash("sha256").update(text).digest("hex");
        const requestedAt = new Date(Date.now() - 60_000).toISOString();
        const reset = async (input: { path?: string; text?: string; sha256?: string; caller?: string; request?: boolean; stale?: boolean; handoff?: boolean; relaunchArgv?: () => Promise<string[]>; before?: () => void; notify?: SeatResetNotify; action?: "compact" | "reset" | null } = {}) => {
          const text = input.text ?? body;
          writeFileSync(handoff, text);
          if (input.handoff === false) rmSync(handoff);
          if (input.stale === true) utimesSync(handoff, new Date(Date.now() - 120_000), new Date(Date.now() - 120_000));
          rmSync(join(dir, "request.json"), { force: true });
          if (input.request !== false) writeFileSync(join(dir, "request.json"), JSON.stringify({ requested_at: requestedAt, context_tokens: 400000, transcript_path: join(home, "old.jsonl"), transcript_bytes: 1,
            // null writes the request of the old code, which has no action.
            ...(input.action === null ? {} : { action: input.action ?? "reset" }) }));
          const { HERDR_ENV: _nested, ...base } = process.env;
          input.before?.();
          try {
            return await runSeatReset(input.path ?? handoff, input.sha256 ?? sha(text), {
              env: { ...base, HOME: home, REPO_HARNESS_HOME: join(home, ".repo-harness"), HC_TERMINAL_ID: input.caller ?? "t2", PATH: `${join(home, "bin")}:/bin:/usr/bin` },
              timeouts, notify: input.notify, relaunchArgv: input.relaunchArgv ?? (async () => ["/bin/sh", "-c", "exec claude", "x y"]),
            });
          } catch (error) {
            return { error: (error as SeatResetError).code, outcome: (error as SeatResetError).outcome };
          }
        };
        const calls = () => readFileSync(join(home, "calls.log"), "utf8").split("\n").filter(line => /^(wait|send|keys) /u.test(line));
        // What reached the requester, in order: a sent text, or a typed line.
        const sends = () => calls().filter(line => !line.startsWith("wait ")).map(line => (line.startsWith("send ") ? line.slice("send -- t5 ".length)
          : line.slice("keys -- t5 ".length).split(" ").filter(key => key !== "enter").map(key => (key === "space" ? " " : key)).join("")));
        const log = () => existsSync(join(dir, "reset-log.jsonl"))
          ? readFileSync(join(dir, "reset-log.jsonl"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
        await fn({ home, handoff, body, sha, state, reset, sends, calls, log });
      } finally {
        chmodSync(dir, 0o700);
        rmSync(join("/tmp/repo-harness-seats", repository), { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    };
  }
  const prompt = (handoff: string) => `You are advisor. Read ${handoff}, then run the Bash command \`hc send t2 RESUMED\` alone, then check the current state with git/gh and continue.`;

  test("a check that finds no request, no requester or a busy requester sends nothing and logs the failure", withReset(async ({ reset, state, sends, log }) => {
    const rows = [
      [{ path: "/tmp/repo-harness-seats/x/advisor/handoff.md" }, "handoff_path_invalid"],
      [{ request: false }, "request_missing"],
      [{ caller: "t5" }, "caller_unknown"],
      [{}, "requester_not_found", { terminals: [] }],
      [{}, "requester_busy", { wait: { ...ended, ended: false, reason: "timeout" } }],
      [{}, "requester_busy", { wait: [{ ...ended, ended: false, reason: "message" }, { ...ended, ended: false, reason: "timeout" }] }],
    ] as const;
    const results = [];
    for (const [input, , patch] of rows) {
      state({ terminals: [{ address: "t5", state: "live" }], wait: ended, ...patch });
      results.push(await reset(input));
    }
    expect([results, sends()]).toEqual([rows.map(([, error]) => ({ error, outcome: "nothing_sent" })), []]);
    // An invalid handoff path names no seat, so it has no log entry.
    expect(log().map(({ kind }) => kind)).toEqual(["request_missing", "caller_unknown", "requester_not_found", "requester_busy", "requester_busy"]);
    expect(log().at(-1)?.detail).toMatch(/in 600 s \(timeout\)\.$/u);
  }));

  test("a message to the caller ends hc wait, so the reset waits out the rest of the budget and resets (#2305)", withReset(async ({ handoff, reset, state, calls }) => {
    state({ wait: [{ ...ended, ended: false, reason: "message" }, ended] });
    expect(await reset()).toEqual({ requester: "t5", seat: "advisor", relaunched: false, logErrors: [] });
    expect(calls()).toEqual(["wait --timeout 600 -- t5", "wait --timeout 600 -- t5", "keys -- t5 / c l e a r enter", `send -- t5 ${prompt(handoff)}`]);
  }));

  test("a message to the caller during the relaunch wait gets the rest of the budget and the relaunch goes on (#2326)", withReset(async ({ handoff, reset, state, calls, sends }) => {
    state({ signal: false, waitDelayAt: 2, waitDelayMs: 1200, wait: [ended, { ...ended, ended: false, reason: "message" }, ended] });
    expect(await reset()).toEqual({ requester: "t5", seat: "advisor", relaunched: true, logErrors: [] });
    const waits = calls().filter(line => line.startsWith("wait "));
    // The first wait of the relaunch ends on a message to the caller; the second gets the rest of the 600 s budget.
    const rest = Number(waits[2]?.split(" ")[2]);
    expect([waits.length, waits[1], rest !== undefined && rest > 590 && rest < 600]).toEqual([3, "wait --timeout 600 -- t5", true]);
    const script = join(dirname(handoff), "relaunch.sh");
    expect(sends()).toEqual([...Array(4).fill("/clear"), "/exit", `sh ${script}`, prompt(handoff)]);
  }));

  test.each([
    ["advisor", "repository", "1"], ["advisor", "repository", undefined],
    ["advisor", "seat", "advisor"], ["advisor", "seat", "worker"], ["advisor", "seat", undefined],
    ["orchestrator", "seat", "orchestrator"], ["advisor", "labels", undefined],
  ] as const)("caller mismatch: target %s, %s=%s sends no message or key", (seat, field, value) => withReset(async ({ handoff, reset, state, calls, log }) => {
    const labels: Record<string, string> = { "repo-harness.repository": dirname(dirname(handoff)).split("/").at(-1)!, "repo-harness.seat": seat === "advisor" ? "orchestrator" : "advisor" };
    if (value === undefined) delete labels[`repo-harness.${field}`];
    else labels[`repo-harness.${field}`] = value;
    state({ callerLabels: field === "labels" ? {} : labels });
    // Refuse both /clear for a valid handoff and REWRITE for a missing handoff.
    expect(await reset()).toEqual({ error: "caller_unknown", outcome: "nothing_sent" });
    expect(await reset({ handoff: false })).toEqual({ error: "caller_unknown", outcome: "nothing_sent" });
    expect(calls()).toEqual([]);
    const required = field === "labels" ? Object.entries(labels).map(([key, value]) => `${key}=${value}`) : [`repo-harness.${field}`];
    for (const label of required) expect(log().map(({ detail }) => detail)).toEqual(Array(2).fill(expect.stringContaining(label)));
  }, seat)());

  test("an advisor peer can reset the orchestrator in the same repository", withReset(async ({ reset, sends }) => {
    expect(await reset()).toEqual({ requester: "t5", seat: "orchestrator", relaunched: false, logErrors: [] });
    expect(sends()).toEqual(["/clear", expect.stringContaining("You are orchestrator.")]);
  }, "orchestrator"));

  test("a failed handoff check asks for 3 rewrites of one request, then tells the requester to continue", withReset(async ({ reset, sha, body, state, sends, log }) => {
    state({ sendFail: true });
    expect(await reset({ handoff: false })).toEqual({ error: "message_not_sent", outcome: "uncertain" });
    state({ sendFail: false });
    const results = [
      await reset({ handoff: false }), await reset({ stale: true }), await reset({ sha256: sha("other") }),
      await reset({ text: body.replace("## Next actions\n", "") }),
    ];
    expect(results).toEqual([
      { error: "handoff_missing", outcome: "rewrite_requested" }, { error: "handoff_stale", outcome: "rewrite_requested" },
      { error: "handoff_sha256_mismatch", outcome: "rewrite_requested" }, { error: "handoff_sections_missing", outcome: "no_reset" },
    ]);
    // The refused send counts no rewrite, so the next run asks for rewrite 1/3 again.
    expect(sends().map(text => text.split(":")[0])).toEqual(["REWRITE 1/3", "REWRITE 1/3", "REWRITE 2/3", "REWRITE 3/3", "NO-RESET"]);
    expect(log().map(({ kind, detail, notice }) => [kind, detail, notice])).toEqual([
      ["message_not_sent", expect.stringContaining("The rewrite message to t5 failed"), "not_configured"], ["rewrite", "handoff_missing", "not_configured"], ["rewrite", "handoff_stale", "not_configured"],
      ["rewrite", "handoff_sha256_mismatch", "not_configured"], ["no_reset", "handoff_sections_missing", "not_configured"],
    ]);
  }));

  test("with a notify config, the plugin notice port gets one call per failure", withReset(async ({ home, reset, log }) => {
    mkdirSync(join(home, ".repo-harness", "herdr"), { recursive: true, mode: 0o700 });
    writeFileSync(join(home, ".repo-harness", "herdr", "notify.env"), "WEBHOOK_URL='https://bot.example/routine'\nWEBHOOK_KEY='k'\n", { mode: 0o600 });
    const events: unknown[] = [];
    const notify: SeatResetNotify = async (_env, event) => { events.push(event); return "sent"; };
    expect(await reset({ handoff: false, notify })).toEqual({ error: "handoff_missing", outcome: "rewrite_requested" });
    expect(await reset({ stale: true, notify })).toEqual({ error: "handoff_stale", outcome: "rewrite_requested" });
    expect(events).toEqual([
      expect.objectContaining({ kind: "seat.reset_failed", data: expect.objectContaining({ seat: "advisor", failure: "rewrite", detail: "handoff_missing" }) }),
      expect.objectContaining({ kind: "seat.reset_failed", data: expect.objectContaining({ failure: "rewrite", detail: "handoff_stale" }) }),
    ]);
    expect(log().map(({ notice }) => notice)).toEqual(["dispatched", "dispatched"]);
  }));

  test("a valid handoff waits, sends /clear and the prompt after the new-session signal, and is never reset again", withReset(async ({ handoff, reset, calls, log }) => {
    expect(await reset()).toEqual({ requester: "t5", seat: "advisor", relaunched: false, logErrors: [] });
    // A claimed request gets no message, not even REWRITE for a stale handoff.
    expect(await reset({ stale: true })).toEqual({ error: "already_claimed", outcome: "nothing_sent" });
    expect(calls()).toEqual(["wait --timeout 600 -- t5", "keys -- t5 / c l e a r enter", `send -- t5 ${prompt(handoff)}`]);
    expect(log().map(({ kind, detail }) => [kind, detail])).toEqual([["reset", "cleared"], ["already_claimed", "The reset request of " + log()[0]!.requested_at + " is already claimed by an earlier run."]]);
  }));

  const compactPrompt = (handoff: string) => `You are advisor. Read ${handoff}, then run the Bash command \`hc send t2 RESUMED\` alone, then continue.`;

  test("a compact request types /compact once and sends the compact prompt after the compact record of the same transcript (#2625)", withReset(async ({ handoff, reset, calls, log }) => {
    expect(await reset({ action: "compact" })).toEqual({ requester: "t5", seat: "advisor", relaunched: false, logErrors: [] });
    expect(calls()).toEqual(["wait --timeout 600 -- t5", "keys -- t5 / c o m p a c t enter", `send -- t5 ${compactPrompt(handoff)}`]);
    expect(log().map(({ kind, detail }) => [kind, detail])).toEqual([["reset", "compacted"]]);
  }));

  test("no compact record types no second /compact: one log entry and an uncertain result that names the prompt (#2625)", withReset(async ({ reset, state, sends, log }) => {
    state({ signal: false });
    expect(await reset({ action: "compact" })).toEqual({ error: "resume_not_sent", outcome: "uncertain" });
    expect([sends(), log().map(({ kind, detail }) => [kind, detail])]).toEqual([["/compact"], [["resume", "no_signal"]]]);
  }));

  test("a session segment newer than the request types no command and releases the requester with NO-RESET (#2625)", withReset(async ({ home, handoff, reset, calls, log }) => {
    const segment = () => writeFileSync(join(dirname(handoff), "session.json"), JSON.stringify({ session_id: "s", transcript_path: join(home, "old.jsonl"), source: "compact", started_at: new Date().toISOString() }));
    expect(await reset({ action: "compact", before: segment })).toEqual({ error: "request_closed", outcome: "no_reset" });
    expect(calls()).toEqual(["wait --timeout 600 -- t5", expect.stringMatching(/^send -- t5 NO-RESET: a session segment started after the reset request/u)]);
    expect(log().map(({ kind, detail }) => [kind, detail])).toEqual([["no_reset", "request_closed"]]);
  }));

  test("a request without an action types nothing and releases the requester with NO-RESET after the peer checks (#2625)", withReset(async ({ handoff, reset, calls, log }) => {
    expect(await reset({ action: null, caller: "t5" })).toEqual({ error: "caller_unknown", outcome: "nothing_sent" });
    expect(await reset({ action: null })).toEqual({ error: "request_invalid", outcome: "no_reset" });
    expect(calls()).toEqual([expect.stringMatching(/^send -- t5 NO-RESET: \/tmp\/repo-harness-seats\/.*\/request\.json has no valid time or action/u)]);
    expect(log().map(({ kind, detail }) => [kind, detail])).toEqual([["caller_unknown", expect.any(String)], ["no_reset", "request_invalid"]]);
    // A request.json that holds JSON null takes the same path: no hc_failed, the requester gets NO-RESET.
    expect(await reset({ before: () => writeFileSync(join(dirname(handoff), "request.json"), "null") })).toEqual({ error: "request_invalid", outcome: "no_reset" });
    expect(log().at(-1)).toMatchObject({ kind: "no_reset", detail: "request_invalid" });
  }));

  test("an unanswered compact prompt is sent 3 more times, then the relaunch sends the prompt with the state check (#2625)", withReset(async ({ handoff, reset, state, sends, log }) => {
    state({ evidenceFrom: 5 });
    expect(await reset({ action: "compact" })).toEqual({ requester: "t5", seat: "advisor", relaunched: true, logErrors: [] });
    expect(sends()).toEqual(["/compact", ...Array(4).fill(compactPrompt(handoff)), "/exit", `sh ${join(dirname(handoff), "relaunch.sh")}`, prompt(handoff)]);
    expect(log().map(({ kind, detail }) => [kind, detail])).toEqual([...Array(4).fill(["resume", "no_evidence"]), ["reset", "relaunched"]]);
  }));

  test("a claim that cannot be created types nothing", withReset(async ({ handoff, reset, calls }) => {
    expect(await reset({ before: () => chmodSync(dirname(handoff), 0o500) })).toEqual({ error: "claim_failed", outcome: "nothing_sent" });
    expect(calls()).toEqual(["wait --timeout 600 -- t5"]);
  }));

  test("a reset log that cannot be written still ends the retries after 3 in the run and is reported", withReset(async ({ handoff, reset, state, sends }) => {
    mkdirSync(join(dirname(handoff), "reset-log.jsonl"));
    state({ signal: false });
    expect(await reset()).toEqual({ requester: "t5", seat: "advisor", relaunched: true,
      logErrors: [...Array(4).fill(expect.stringMatching(/^resume: EISDIR/u)), expect.stringMatching(/^reset: EISDIR/u)] });
    expect(sends().filter(text => text === "/clear")).toHaveLength(4);
  }));

  test("a RESUMED send whose tool result is an error is no evidence, so the prompt is sent again", withReset(async ({ handoff, reset, state, sends, log }) => {
    state({ errorUntil: 2 });
    expect(await reset()).toEqual({ requester: "t5", seat: "advisor", relaunched: false, logErrors: [] });
    expect([sends(), log().map(({ kind, detail }) => [kind, detail])]).toEqual([["/clear", prompt(handoff), prompt(handoff)], [["resume", "no_evidence"], ["reset", "cleared"]]]);
  }));

  test("a prompt that is never answered with RESUMED is sent 3 more times, then the requester is relaunched", withReset(async ({ handoff, reset, state, sends, log }) => {
    state({ evidenceFrom: 5 });
    expect(await reset()).toEqual({ requester: "t5", seat: "advisor", relaunched: true, logErrors: [] });
    expect(sends()).toEqual(["/clear", ...Array(4).fill(prompt(handoff)), "/exit", `sh ${join(dirname(handoff), "relaunch.sh")}`, prompt(handoff)]);
    expect(log().map(({ kind, detail }) => [kind, detail])).toEqual([...Array(4).fill(["resume", "no_evidence"]), ["reset", "relaunched"]]);
  }));

  test("only a plain `hc send <peer> RESUMED` with a success result is evidence (#1975)", withReset(async ({ handoff, reset, state, sends, log }) => {
    state({ answers: [{ command: "hc send t20 RESUMED", result: "ok" }, { command: "printf '%s\\n' 'hc send t2 RESUMED'", result: "ok" },
      { command: "hc send t2 RESUMED", result: "none" }, { command: "hc send t2 RESUMED", result: "error" }] });
    expect(await reset()).toEqual({ requester: "t5", seat: "advisor", relaunched: true, logErrors: [] });
    expect(sends().filter(text => text === prompt(handoff))).toHaveLength(5);
    expect(log().map(({ kind, detail }) => [kind, detail])).toEqual([...Array(4).fill(["resume", "no_evidence"]), ["reset", "relaunched"]]);
  }));

  test("a prompt that the model answers without RESUMED is sent again and the failure is logged", withReset(async ({ handoff, reset, state, sends, log }) => {
    state({ evidenceFrom: 2 });
    expect(await reset()).toEqual({ requester: "t5", seat: "advisor", relaunched: false, logErrors: [] });
    expect([sends(), log().map(({ kind, detail }) => [kind, detail])]).toEqual([["/clear", prompt(handoff), prompt(handoff)], [["resume", "no_evidence"], ["reset", "cleared"]]]);
  }));

  test("no new-session signal types /clear again 3 times, then relaunches the requester from its seat argv in the same terminal", withReset(async ({ handoff, reset, state, sends, log }) => {
    state({ signal: false });
    expect(await reset()).toEqual({ requester: "t5", seat: "advisor", relaunched: true, logErrors: [] });
    const script = join(dirname(handoff), "relaunch.sh");
    expect(sends()).toEqual([...Array(4).fill("/clear"), "/exit", `sh ${script}`, prompt(handoff)]);
    expect(readFileSync(script, "utf8")).toBe("/bin/sh -c 'exec claude' 'x y'\n");
    expect(log().map(({ kind, detail }) => [kind, detail])).toEqual([...Array(4).fill(["resume", "no_signal"]), ["reset", "relaunched"]]);
  }));

  test("a relaunch argv that cannot be built types no /exit and leaves the session running", withReset(async ({ reset, state, sends, log }) => {
    state({ signal: false });
    const relaunchArgv = async (): Promise<string[]> => { throw new Error("The stored seats section needs a one-shot migration. Run repo-harness update."); };
    expect(await reset({ relaunchArgv })).toEqual({ error: "resume_not_sent", outcome: "uncertain" });
    expect([sends(), log().at(-1)?.kind, log().at(-1)?.detail]).toEqual([Array(4).fill("/clear"), "relaunch_failed",
      "relaunch_argv_failed: The stored seats section needs a one-shot migration. Run repo-harness update"]);
  }));

  test("a relaunch that cannot end claude logs the failure and reports an uncertain reset", withReset(async ({ reset, state, sends, log }) => {
    state({ signal: false, exit: false });
    expect(await reset()).toEqual({ error: "resume_not_sent", outcome: "uncertain" });
    expect([sends(), log().at(-1)?.kind, log().at(-1)?.detail]).toEqual([[...Array(4).fill("/clear"), "/exit"], "relaunch_failed", "claude_did_not_exit"]);
  }));
});
