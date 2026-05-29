import { spawnSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const CLAUDE_CODEGRAPH_ALLOWED_TOOLS_PATTERN = "mcp__codegraph__*";
const CLAUDE_CODEGRAPH_SERVER_NAME = "codegraph";
const CODEGRAPH_SCOPED_MCP_ARGS = ["serve", "--mcp", "--path", "."] as const;
const CODEGRAPH_SCOPED_MCP_TOML_ARGS = `[${CODEGRAPH_SCOPED_MCP_ARGS.map((arg) => JSON.stringify(arg)).join(", ")}]`;

export type CodegraphSource = "local" | "global" | "missing";
export type CodegraphStatus = "present" | "warning" | "partial" | "missing";
export type CodegraphActionStatus = "changed" | "unchanged" | "failed" | "skipped";
export type CodegraphHostTarget = "codex" | "claude" | "both";
export type CodegraphConfigureLocation = "global" | "local";

export interface CodegraphResolveOptions {
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
  host?: CodegraphHostTarget;
}

export interface CodegraphEnsureOptions extends CodegraphResolveOptions {
  checkOnly?: boolean;
  init?: boolean;
  sync?: boolean;
  installDeps?: boolean;
}

export interface CodegraphConfigureOptions extends CodegraphResolveOptions {
  target: CodegraphHostTarget;
  location: CodegraphConfigureLocation;
}

export interface CodegraphResolution {
  source: CodegraphSource;
  binPath: string | null;
  version: string | null;
  localBinPath: string | null;
  globalBinPath: string | null;
  globalFallbackUsed: boolean;
  drift: { local: string | null; global: string | null; using: string } | null;
}

export interface CodegraphCheckResult {
  status: CodegraphStatus;
  reason: string;
  resolution: CodegraphResolution;
  raw: Record<string, unknown>;
}

export interface CodegraphEnsureResult extends CodegraphCheckResult {
  changed: boolean;
  readOnly: boolean;
  actions: CodegraphAction[];
}

export interface CodegraphConfigureResult extends CodegraphCheckResult {
  target: CodegraphHostTarget;
  location: CodegraphConfigureLocation;
  changed: boolean;
  readOnly: false;
  actions: CodegraphAction[];
}

export interface CodegraphAction {
  action: string;
  status: CodegraphActionStatus;
  command: string[];
  stdout?: string;
  stderr?: string;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..", "..");

function runJson(command: string, args: string[], repoRoot: string, env?: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...(env ?? {}) },
  });

  if (result.status !== 0 || result.error) {
    throw new Error(result.stderr || result.stdout || String(result.error));
  }

  return JSON.parse(result.stdout);
}

function run(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...(env ?? {}) },
  });

  return {
    ok: result.status === 0 && !result.error,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error.message || result.error) : "",
  };
}

function trimOutput(value: string) {
  if (value.length <= 4096) return value;
  return `${value.slice(0, 4096)}\n[output truncated]`;
}

function readJson(path: string) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (_error) {
    return null;
  }
}

function readToolingReport(repoRoot: string, env?: NodeJS.ProcessEnv, host: CodegraphHostTarget = "codex") {
  const checker = join(REPO_ROOT, "scripts", "check-agent-tooling.sh");
  const report = runJson("bash", [checker, "--json", "--host", host], repoRoot, env);
  return report.tools.codegraph;
}

function hasCodegraphDependency(repoRoot: string) {
  const pkg = readJson(join(repoRoot, "package.json"));
  return Boolean(
    pkg?.devDependencies?.["@colbymchenry/codegraph"] ||
      pkg?.dependencies?.["@colbymchenry/codegraph"] ||
      pkg?.optionalDependencies?.["@colbymchenry/codegraph"]
  );
}

function appendAction(
  actions: CodegraphAction[],
  action: string,
  command: string[],
  result: ReturnType<typeof run>
): boolean {
  actions.push({
    action,
    status: result.ok ? "changed" : "failed",
    command,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr || result.error),
  });
  return result.ok;
}

function normalize(raw: Record<string, any>): CodegraphCheckResult {
  return {
    status: raw.status,
    reason: raw.reason,
    resolution: {
      source: raw.source,
      binPath: raw.bin_path,
      version: raw.version,
      localBinPath: raw.local_bin_path,
      globalBinPath: raw.global_bin_path,
      globalFallbackUsed: Boolean(raw.global_fallback_used),
      drift: raw.drift,
    },
    raw,
  };
}

export function checkCodegraph(opts: CodegraphResolveOptions): CodegraphCheckResult {
  return normalize(readToolingReport(opts.repoRoot, opts.env, opts.host));
}

export function resolveCodegraph(opts: CodegraphResolveOptions): CodegraphResolution {
  return checkCodegraph(opts).resolution;
}

export function ensureCodegraph(opts: CodegraphEnsureOptions): CodegraphEnsureResult {
  const actions: CodegraphAction[] = [];

  if (opts.checkOnly) {
    return {
      ...checkCodegraph(opts),
      changed: false,
      readOnly: true,
      actions,
    };
  }

  let codegraph = readToolingReport(opts.repoRoot, opts.env, opts.host);
  if (opts.installDeps !== false && hasCodegraphDependency(opts.repoRoot) && !codegraph.local_bin_path) {
    appendAction(actions, "install-deps", ["bun", "install"], run("bun", ["install"], opts.repoRoot, opts.env));
    codegraph = readToolingReport(opts.repoRoot, opts.env, opts.host);
  }

  const binPath = codegraph.bin_path;
  if (binPath && opts.init && codegraph.project_index?.status === "not-initialized") {
    appendAction(actions, "init-index", [binPath, "init", "-i", "."], run(binPath, ["init", "-i", "."], opts.repoRoot, opts.env));
    codegraph = readToolingReport(opts.repoRoot, opts.env, opts.host);
  }

  if (binPath && opts.sync) {
    mkdirSync(join(opts.repoRoot, ".codegraph"), { recursive: true });
    appendAction(actions, "sync-index", [binPath, "sync", "."], run(binPath, ["sync", "."], opts.repoRoot, opts.env));
    codegraph = readToolingReport(opts.repoRoot, opts.env, opts.host);
  }

  const normalized = normalize(codegraph);
  return {
    ...normalized,
    changed: actions.some((entry) => entry.status === "changed"),
    readOnly: false,
    actions,
  };
}

function configureTargets(target: CodegraphHostTarget): Array<"codex" | "claude"> {
  return target === "both" ? ["codex", "claude"] : [target];
}

function isMcpHostConfigured(raw: Record<string, unknown>, target: "codex" | "claude"): boolean {
  const hosts = (raw as { mcp_hosts?: Record<string, { status?: string }> }).mcp_hosts ?? {};
  return hosts[target]?.status === "configured";
}

function appendSkippedAction(actions: CodegraphAction[], action: string, command: string[], reason: string): void {
  actions.push({
    action,
    status: "skipped",
    command,
    stderr: reason,
  });
}

function claudeSettingsPath(env?: NodeJS.ProcessEnv): string | null {
  const home = env?.HOME ?? process.env.HOME ?? process.env.USERPROFILE;
  return home ? join(home, ".claude", "settings.json") : null;
}

function claudeRootConfigPath(env?: NodeJS.ProcessEnv): string | null {
  const home = env?.HOME ?? process.env.HOME ?? process.env.USERPROFILE;
  return home ? join(home, ".claude.json") : null;
}

function codexConfigPath(env?: NodeJS.ProcessEnv): string | null {
  const home = env?.HOME ?? process.env.HOME ?? process.env.USERPROFILE;
  return home ? join(home, ".codex", "config.toml") : null;
}

function codegraphArgsAreScoped(args: unknown): boolean {
  return Array.isArray(args) &&
    args.length === CODEGRAPH_SCOPED_MCP_ARGS.length &&
    args.every((arg, index) => arg === CODEGRAPH_SCOPED_MCP_ARGS[index]);
}

function configureCodexProjectPath(actions: CodegraphAction[], env?: NodeJS.ProcessEnv): void {
  const path = codexConfigPath(env);
  const command = ["codex-config", "scope-codegraph-mcp", path ?? "<HOME>/.codex/config.toml"];

  if (!path) {
    actions.push({
      action: "codex-project-path",
      status: "skipped",
      command,
      stderr: "HOME environment variable not set; cannot locate ~/.codex/config.toml.",
    });
    return;
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (_error) {
    actions.push({
      action: "codex-project-path",
      status: "skipped",
      command,
      stderr: `${path} not found; CodeGraph did not create a Codex MCP config.`,
    });
    return;
  }

  const sectionMatch = raw.match(/(^\[mcp_servers\.codegraph\]\n)([\s\S]*?)(?=^\[|(?![\s\S]))/m);
  if (!sectionMatch) {
    actions.push({
      action: "codex-project-path",
      status: "skipped",
      command,
      stderr: "Codex CodeGraph MCP server entry was not found; run codegraph install first.",
    });
    return;
  }

  const [section, header, body] = sectionMatch;
  const desiredArgsLine = `args = ${CODEGRAPH_SCOPED_MCP_TOML_ARGS}`;
  const argsLine = body.match(/^args\s*=\s*(.+)$/m)?.[1]?.trim();
  if (argsLine === CODEGRAPH_SCOPED_MCP_TOML_ARGS) {
    actions.push({
      action: "codex-project-path",
      status: "unchanged",
      command,
    });
    return;
  }

  let nextBody: string;
  if (/^args\s*=/m.test(body)) {
    nextBody = body.replace(/^args\s*=.*$/m, desiredArgsLine);
  } else if (/^command\s*=/m.test(body)) {
    nextBody = body.replace(/^(command\s*=.*)$/m, `$1\n${desiredArgsLine}`);
  } else {
    nextBody = `${desiredArgsLine}\n${body}`;
  }

  const next = raw.replace(section, `${header}${nextBody}`);
  try {
    writeFileSync(path, next);
  } catch (error) {
    actions.push({
      action: "codex-project-path",
      status: "failed",
      command,
      stderr: `Failed to write ${path}: ${String((error as Error).message ?? error)}`,
    });
    return;
  }

  actions.push({
    action: "codex-project-path",
    status: "changed",
    command,
  });
}

function configureClaudeProjectPath(
  actions: CodegraphAction[],
  repoRoot: string,
  location: CodegraphConfigureLocation,
  env?: NodeJS.ProcessEnv,
): void {
  const path = claudeRootConfigPath(env);
  const command = ["claude-root-config", "scope-codegraph-mcp", path ?? "<HOME>/.claude.json"];

  if (!path) {
    actions.push({
      action: "claude-project-path",
      status: "skipped",
      command,
      stderr: "HOME environment variable not set; cannot locate ~/.claude.json.",
    });
    return;
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (_error) {
    actions.push({
      action: "claude-project-path",
      status: "skipped",
      command,
      stderr: `${path} not found; CodeGraph did not create a Claude root MCP config.`,
    });
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    actions.push({
      action: "claude-project-path",
      status: "failed",
      command,
      stderr: `Failed to parse ${path} as JSON: ${String((error as Error).message ?? error)}`,
    });
    return;
  }

  const mcpServers =
    location === "global"
      ? parsed?.mcpServers
      : parsed?.projects?.[repoRoot]?.mcpServers;
  const server = mcpServers?.[CLAUDE_CODEGRAPH_SERVER_NAME];
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    actions.push({
      action: "claude-project-path",
      status: "skipped",
      command,
      stderr: `Claude ${location} CodeGraph MCP server entry was not found; run codegraph install first.`,
    });
    return;
  }

  if (codegraphArgsAreScoped(server.args)) {
    actions.push({
      action: "claude-project-path",
      status: "unchanged",
      command,
    });
    return;
  }

  server.args = [...CODEGRAPH_SCOPED_MCP_ARGS];
  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  const serialized = `${JSON.stringify(parsed, null, 2)}${trailingNewline}`;
  try {
    writeFileSync(path, serialized);
  } catch (error) {
    actions.push({
      action: "claude-project-path",
      status: "failed",
      command,
      stderr: `Failed to write ${path}: ${String((error as Error).message ?? error)}`,
    });
    return;
  }

  actions.push({
    action: "claude-project-path",
    status: "changed",
    command,
  });
}

function configureClaudeAlwaysLoad(
  actions: CodegraphAction[],
  repoRoot: string,
  location: CodegraphConfigureLocation,
  env?: NodeJS.ProcessEnv,
): void {
  const path = claudeRootConfigPath(env);
  const command = ["claude-root-config", "set-codegraph-always-load", path ?? "<HOME>/.claude.json"];

  if (!path) {
    actions.push({
      action: "claude-always-load",
      status: "skipped",
      command,
      stderr: "HOME environment variable not set; cannot locate ~/.claude.json.",
    });
    return;
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (_error) {
    actions.push({
      action: "claude-always-load",
      status: "skipped",
      command,
      stderr: `${path} not found; CodeGraph did not create a Claude root MCP config.`,
    });
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    actions.push({
      action: "claude-always-load",
      status: "failed",
      command,
      stderr: `Failed to parse ${path} as JSON: ${String((error as Error).message ?? error)}`,
    });
    return;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    actions.push({
      action: "claude-always-load",
      status: "failed",
      command,
      stderr: `${path} is not a JSON object; refusing to mutate.`,
    });
    return;
  }

  const mcpServers =
    location === "global"
      ? parsed.mcpServers
      : parsed.projects?.[repoRoot]?.mcpServers;
  const server = mcpServers?.[CLAUDE_CODEGRAPH_SERVER_NAME];
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    actions.push({
      action: "claude-always-load",
      status: "skipped",
      command,
      stderr: `Claude ${location} CodeGraph MCP server entry was not found; run codegraph install first.`,
    });
    return;
  }

  if (server.alwaysLoad === true) {
    actions.push({
      action: "claude-always-load",
      status: "unchanged",
      command,
    });
    return;
  }

  server.alwaysLoad = true;
  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  const serialized = `${JSON.stringify(parsed, null, 2)}${trailingNewline}`;

  try {
    writeFileSync(path, serialized);
  } catch (error) {
    actions.push({
      action: "claude-always-load",
      status: "failed",
      command,
      stderr: `Failed to write ${path}: ${String((error as Error).message ?? error)}`,
    });
    return;
  }

  actions.push({
    action: "claude-always-load",
    status: "changed",
    command,
  });
}

function configureClaudeAllowedTools(actions: CodegraphAction[], env?: NodeJS.ProcessEnv): void {
  // Hosts claude_settings_path is shown only as a path token; the pattern itself
  // travels via writeFile, not via the command echo. This keeps host-agnostic
  // invariants intact for consumers that grep CLI stdout for concrete tool
  // call syntax such as codegraph_context(...).
  const path = claudeSettingsPath(env);
  const command = ["claude-settings", "register-allowed-tools", path ?? "<HOME>/.claude/settings.json"];

  if (!path) {
    actions.push({
      action: "claude-allowed-tools",
      status: "skipped",
      command,
      stderr: "HOME environment variable not set; cannot locate ~/.claude/settings.json.",
    });
    return;
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (_error) {
    actions.push({
      action: "claude-allowed-tools",
      status: "skipped",
      command,
      stderr: `${path} not found; Claude Code is not installed for this user. Skipping eager-load registration.`,
    });
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    actions.push({
      action: "claude-allowed-tools",
      status: "failed",
      command,
      stderr: `Failed to parse ${path} as JSON: ${String((error as Error).message ?? error)}`,
    });
    return;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    actions.push({
      action: "claude-allowed-tools",
      status: "failed",
      command,
      stderr: `${path} is not a JSON object; refusing to mutate.`,
    });
    return;
  }

  const existing = Array.isArray(parsed.allowedTools) ? (parsed.allowedTools as unknown[]) : [];
  if (existing.includes(CLAUDE_CODEGRAPH_ALLOWED_TOOLS_PATTERN)) {
    actions.push({
      action: "claude-allowed-tools",
      status: "unchanged",
      command,
    });
    return;
  }

  parsed.allowedTools = [...existing, CLAUDE_CODEGRAPH_ALLOWED_TOOLS_PATTERN];
  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  const serialized = `${JSON.stringify(parsed, null, 2)}${trailingNewline}`;

  try {
    writeFileSync(path, serialized);
  } catch (error) {
    actions.push({
      action: "claude-allowed-tools",
      status: "failed",
      command,
      stderr: `Failed to write ${path}: ${String((error as Error).message ?? error)}`,
    });
    return;
  }

  actions.push({
    action: "claude-allowed-tools",
    status: "changed",
    command,
  });
}

export function configureCodegraph(opts: CodegraphConfigureOptions): CodegraphConfigureResult {
  const actions: CodegraphAction[] = [];
  const initial = checkCodegraph({ repoRoot: opts.repoRoot, env: opts.env, host: opts.target });
  const binPath = initial.resolution.binPath;

  for (const target of configureTargets(opts.target)) {
    const command = [binPath ?? "codegraph", "install", "--target", target, "--location", opts.location, "--yes"];
    const actionName = `configure-${target}`;

    if (target === "codex" && opts.location === "local") {
      const reason = "Codex has no project-local MCP configuration; use --location global.";
      if (opts.target === "codex") {
        actions.push({
          action: actionName,
          status: "failed",
          command,
          stderr: reason,
        });
      } else {
        appendSkippedAction(actions, actionName, command, reason);
      }
      continue;
    }

    if (!binPath) {
      actions.push({
        action: actionName,
        status: "failed",
        command,
        stderr: "CodeGraph CLI is missing; run repo-harness tools ensure codegraph first.",
      });
      if (target === "claude") {
        configureClaudeAllowedTools(actions, opts.env);
      }
      continue;
    }

    if (target === "claude" && opts.location === "global" && isMcpHostConfigured(initial.raw, target)) {
      appendSkippedAction(actions, actionName, command, "Claude CodeGraph MCP is already configured.");
    } else {
      appendAction(actions, actionName, command, run(binPath, command.slice(1), opts.repoRoot, opts.env));
    }

    if (target === "codex") {
      configureCodexProjectPath(actions, opts.env);
    }

    if (target === "claude") {
      configureClaudeProjectPath(actions, opts.repoRoot, opts.location, opts.env);
      configureClaudeAlwaysLoad(actions, opts.repoRoot, opts.location, opts.env);
      configureClaudeAllowedTools(actions, opts.env);
    }
  }

  let refreshed = initial;
  if (actions.some((entry) => entry.status === "changed")) {
    try {
      refreshed = checkCodegraph({ repoRoot: opts.repoRoot, env: opts.env, host: opts.target });
    } catch (_error) {
      refreshed = initial;
    }
  }

  return {
    ...refreshed,
    target: opts.target,
    location: opts.location,
    changed: actions.some((entry) => entry.status === "changed"),
    readOnly: false,
    actions,
  };
}
