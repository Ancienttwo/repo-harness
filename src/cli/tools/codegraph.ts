import { configurationPaths, hostConfigurationRoot, withConfigurationMutation } from '../installer/configuration-ownership';
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { runProcess as runBoundedProcess } from "../../effects/process-runner";
import { ARCHITECTURE_CONTRACT_VERSION, type ArchitectureDoctorCheck, type CodegraphHostTarget, type CodegraphPort, type CodegraphSetupStep } from "../../core/architecture/contracts";

const CLAUDE_CODEGRAPH_ALLOWED_TOOLS_PATTERN = "mcp__codegraph__*";
const CLAUDE_CODEGRAPH_SERVER_NAME = "codegraph";
const CODEGRAPH_SCOPED_MCP_ARGS = ["serve", "--mcp", "--path", "."] as const;
const CODEGRAPH_SCOPED_MCP_TOML_ARGS = `[${CODEGRAPH_SCOPED_MCP_ARGS.map((arg) => JSON.stringify(arg)).join(", ")}]`;

export type CodegraphSource = "local" | "global" | "missing";
export type CodegraphStatus = "present" | "warning" | "partial" | "missing";
export type CodegraphProjectIndexStatus = "not-initialized" | "up-to-date" | "stale" | "unknown" | "unavailable";
export type CodegraphActionStatus = "changed" | "unchanged" | "failed" | "skipped";
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
  projectIndexStatus: CodegraphProjectIndexStatus;
  reason: string;
  remediation: {
    installCommand: string;
    projectIndexCommand: string;
    initCommand: string;
    syncCommand: string;
  };
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
  const result = runBoundedProcess(command, args, { cwd: repoRoot, env });

  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || String(result.error));
  }

  return JSON.parse(result.stdout);
}

function run(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  const result = runBoundedProcess(command, args, { cwd, env });

  return {
    ok: result.ok,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
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
  // This module runs only in a process that holds the architecture plugin.
  const report = runJson("bash", [checker, "--json", "--architecture-selected", "--host", host], repoRoot, env);
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

function projectIndexStatus(raw: Record<string, any>): CodegraphProjectIndexStatus {
  const value = raw.project_index?.status;
  if (
    value !== "not-initialized" &&
    value !== "up-to-date" &&
    value !== "stale" &&
    value !== "unknown" &&
    value !== "unavailable"
  ) {
    throw new Error(`Unsupported CodeGraph project index status: ${String(value)}`);
  }
  return value;
}

function requiredCommand(path: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing CodeGraph remediation command: ${path}`);
  }
  return value;
}

function normalize(raw: Record<string, any>): CodegraphCheckResult {
  return {
    status: raw.status,
    projectIndexStatus: projectIndexStatus(raw),
    reason: raw.reason,
    remediation: {
      installCommand: requiredCommand("install_command", raw.install_command),
      projectIndexCommand: requiredCommand("project_index.command", raw.project_index?.command),
      initCommand: requiredCommand("init_command", raw.init_command),
      syncCommand: requiredCommand("sync_command", raw.sync_command),
    },
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

function configureCodegraphRuntime(opts: CodegraphConfigureOptions): CodegraphConfigureResult {
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

/** Keep restoration provenance for both standalone tools setup and runtime bootstrap. */
export function configureCodegraph(opts: CodegraphConfigureOptions): CodegraphConfigureResult {
  if (opts.location !== 'global') return configureCodegraphRuntime(opts);
  const root = hostConfigurationRoot({ ...process.env, ...opts.env });
  const paths = configurationPaths(root).filter((path) => opts.target === 'both' || (opts.target === 'codex' ? path.endsWith('.toml') : !path.endsWith('.toml')));
  return withConfigurationMutation(paths, root, () => configureCodegraphRuntime(opts));
}

// The doctor rows, the init index step and the MCP configuration step of the CodeGraph port.

function doctorStatusForCodegraph(status: CodegraphCheckResult['status']): ArchitectureDoctorCheck['status'] {
  if (status === 'present') return 'ok';
  if (status === 'missing') return 'fail';
  return 'warn';
}

function formatCodegraphDetail(result: CodegraphCheckResult): string {
  const raw = result.raw as Record<string, any>;
  const indexStatus = raw.project_index?.status ?? 'unknown';
  const codexMcpStatus = raw.mcp_hosts?.codex?.status ?? 'unknown';
  const claudeMcpStatus = raw.mcp_hosts?.claude?.status ?? 'unknown';
  const bits = [
    result.reason,
    `source=${result.resolution.source}`,
    `version=${result.resolution.version ?? 'unknown'}`,
    `codex-mcp=${codexMcpStatus}`,
    `claude-mcp=${claudeMcpStatus}`,
    `index=${indexStatus}`,
  ];
  if (result.resolution.globalFallbackUsed) bits.push('global-fallback=true');
  const remediation = codegraphRemediation(result);
  if (remediation) bits.push(`remediation=${remediation}`);
  return bits.join('; ');
}

function codegraphRemediation(result: CodegraphCheckResult): string | null {
  if (result.status === 'present') return null;

  const raw = result.raw as Record<string, any>;
  if (result.resolution.source === 'missing') {
    return String(raw.install_command ?? 'bash scripts/ensure-codegraph.sh');
  }
  if (result.resolution.globalFallbackUsed) {
    return String(raw.install_command ?? 'bun install');
  }
  if (raw.mcp_hosts?.codex?.status !== 'configured' || raw.mcp_hosts?.claude?.status !== 'configured') {
    return String(raw.mcp_install_command ?? 'repo-harness tools configure codegraph --target both --location global');
  }
  if (raw.project_index?.status === 'not-initialized') {
    return String(raw.init_command ?? 'bash scripts/ensure-codegraph.sh --init');
  }
  if (raw.project_index?.status === 'stale') {
    return String(raw.sync_command ?? 'bash scripts/ensure-codegraph.sh --sync');
  }
  return String(raw.ensure_command ?? raw.sync_command ?? 'bash scripts/ensure-codegraph.sh --check');
}

interface CodegraphProbe {
  result?: CodegraphCheckResult;
  error?: Error;
}

function probeCodegraph(cwd: string): CodegraphProbe {
  try {
    return { result: checkCodegraph({ repoRoot: cwd, host: 'both' }) };
  } catch (err) {
    return { error: err as Error };
  }
}

function checkCodegraphReadiness(probe: CodegraphProbe): ArchitectureDoctorCheck {
  const id = 'codegraph-readiness';
  const describe = 'CodeGraph CLI, MCP, and project index readiness';
  if (probe.result) {
    return {
      id,
      describe,
      status: doctorStatusForCodegraph(probe.result.status),
      detail: formatCodegraphDetail(probe.result),
    };
  }
  return {
    id,
    describe,
    status: 'fail',
    detail: `error checking CodeGraph readiness: ${probe.error?.message ?? 'unknown error'}`,
  };
}

function checkCodegraphMcpHost(probe: CodegraphProbe, host: 'codex' | 'claude'): ArchitectureDoctorCheck {
  const id = `${host}-codegraph-mcp`;
  const describe = `${host === 'codex' ? 'Codex' : 'Claude Code'} CodeGraph MCP config`;
  if (!probe.result) {
    return {
      id,
      describe,
      status: 'fail',
      detail: `error checking CodeGraph MCP config: ${probe.error?.message ?? 'unknown error'}`,
    };
  }

  const raw = probe.result.raw as Record<string, any>;
  const entry = raw.mcp_hosts?.[host];
  if (entry?.status === 'configured') {
    return { id, describe, status: 'ok', detail: entry.reason ?? 'configured' };
  }
  return {
    id,
    describe,
    status: 'warn',
    detail: `${entry?.reason ?? 'missing'}; remediation=repo-harness tools configure codegraph --target ${host} --location global`,
  };
}

function checkCodegraphIndex(probe: CodegraphProbe): ArchitectureDoctorCheck {
  const id = 'codegraph-index';
  const describe = 'CodeGraph project index';
  if (!probe.result) {
    return {
      id,
      describe,
      status: 'fail',
      detail: `error checking CodeGraph index: ${probe.error?.message ?? 'unknown error'}`,
    };
  }

  const raw = probe.result.raw as Record<string, any>;
  const indexStatus = raw.project_index?.status ?? 'unknown';
  const status: ArchitectureDoctorCheck['status'] = indexStatus === 'up-to-date'
    ? 'ok'
    : indexStatus === 'stale' || indexStatus === 'unknown'
      ? 'warn'
      : 'fail';
  const remediation = indexStatus === 'not-initialized'
    ? raw.init_command
    : indexStatus === 'stale'
      ? raw.sync_command
      : raw.ensure_command;
  return {
    id,
    describe,
    status,
    detail: `index=${indexStatus}${raw.project_index?.detail ? `; ${raw.project_index.detail}` : ''}${remediation ? `; remediation=${remediation}` : ''}`,
  };
}

function codegraphChecksFor(probe: CodegraphProbe): ArchitectureDoctorCheck[] {
  return [
    checkCodegraphReadiness(probe),
    checkCodegraphMcpHost(probe, 'codex'),
    checkCodegraphMcpHost(probe, 'claude'),
    checkCodegraphIndex(probe),
  ];
}

/** The `init` CodeGraph index step. */
function codegraphIndexSteps({ repoRoot, sync, env, target }: Parameters<CodegraphPort["indexSteps"]>[0]): CodegraphSetupStep[] {
  const steps: CodegraphSetupStep[] = [];
  try {
    const cg = ensureCodegraph({ repoRoot, init: true, sync, env, host: target });
    const failedActions = cg.actions.filter((entry) => entry.status === "failed");
    const indexReady = cg.projectIndexStatus === "up-to-date";
    const cgFailed = failedActions.length > 0 || !indexReady;
    const actionDetail = cg.actions.map((entry) => `${entry.action}:${entry.status}`).join(", ");
    const indexDetail = `index ${cg.projectIndexStatus}`;
    const indexRemediation = cg.projectIndexStatus === "unavailable" && cg.resolution.source === "missing"
      ? `install with: ${cg.remediation.installCommand}; then run: ${cg.remediation.initCommand} && ${cg.remediation.syncCommand}`
      : cg.projectIndexStatus === "unavailable" || cg.projectIndexStatus === "unknown"
        ? `inspect with: ${cg.remediation.projectIndexCommand}`
        : cg.projectIndexStatus === "stale"
          ? `run: ${cg.remediation.syncCommand}`
          : `run: ${cg.remediation.initCommand} && ${cg.remediation.syncCommand}`;
    const failureDetail = [
      ...failedActions.map((entry) => entry.stderr || `${entry.action} failed`),
      ...(!indexReady
        ? [`CodeGraph is enabled, but the project index is ${cg.projectIndexStatus}; ${indexRemediation}`]
        : []),
    ].filter(Boolean).join("\n");
    steps.push({
      step: "ensure codegraph index",
      status: cgFailed ? "failed" : cg.actions.length === 0 ? "skipped" : "ok",
      detail: actionDetail ? `${actionDetail}; ${indexDetail}` : indexDetail,
      stderr: failureDetail || undefined,
    });

    const mcpHosts =
      (cg.raw as { mcp_hosts?: Record<string, { status?: string }> }).mcp_hosts ?? {};
    const mcpConfigured =
      cg.resolution.source !== "missing" &&
      ["codex", "claude"].every((host) => mcpHosts[host]?.status === "configured");

    if (cg.resolution.source !== "missing" && !mcpConfigured) {
      steps.push({
        step: "codegraph mcp",
        status: "skipped",
        detail:
          "not registered; run: repo-harness tools configure codegraph --target both --location global",
      });
    }
  } catch (error) {
    steps.push({
      step: "ensure codegraph index",
      status: "failed",
      detail: "CodeGraph readiness check failed",
      stderr: error instanceof Error ? error.message : String(error),
    });
  }
  return steps;
}

/** The global runtime `configure CodeGraph MCP` step. */
function configureCodegraphMcpStep(cwd: string, target: CodegraphHostTarget, env: NodeJS.ProcessEnv): CodegraphSetupStep {
  try {
    const result = configureCodegraph({ repoRoot: cwd, target, location: "global", env });
    return {
      step: "configure CodeGraph MCP",
      status: result.actions.some((entry) => entry.status === "failed") ? "failed" : "ok",
      detail: result.actions.map((entry) => `${entry.action}:${entry.status}`).join(", "),
    };
  } catch (error) {
    return {
      step: "configure CodeGraph MCP",
      status: "failed",
      stderr: String((error as Error).message ?? error),
    };
  }
}

/**
 * The CodeGraph part of the architecture plugin. The CLI root registers it
 * only when the recorded selection includes the plugin.
 */
export const CODEGRAPH_PROVIDER: CodegraphPort = {
  contractVersion: ARCHITECTURE_CONTRACT_VERSION,
  checks: (cwd) => codegraphChecksFor(probeCodegraph(cwd)),
  indexSteps: codegraphIndexSteps,
  configureMcp: configureCodegraphMcpStep,
};
