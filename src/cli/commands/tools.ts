import { globalRuntimeScope, withRuntimeTransactionLock } from '../../effects/locking/runtime-transaction-lock';
/**
 * `repo-harness tools` — explicit tool lifecycle commands.
 *
 * Host adapter installation remains under `install --target`; tool readiness
 * mutation lives here so detector, installer, and MCP lifecycles stay separate.
 */

import { Command } from 'commander';
import {
  checkCodegraph,
  configureCodegraph,
  ensureCodegraph,
  type CodegraphCheckResult,
  type CodegraphConfigureLocation,
  type CodegraphConfigureResult,
  type CodegraphHostTarget,
  type CodegraphEnsureResult,
} from '../tools/codegraph';
import type { CheckStatus, DoctorCheckResult } from './doctor';
import { ARCHITECTURE_CONTRACT_VERSION, type CodegraphDoctorPort } from '../../core/architecture/contracts';
import type { GlobalRuntimeStep } from './global-runtime';
import type { InitPorts, InitStep } from './init';
import type { InstallTargetSpec } from './install';

interface CodegraphEnsureCliOptions {
  json?: boolean;
  check?: boolean;
  init?: boolean;
  sync?: boolean;
  installDeps?: boolean;
  repo?: string;
}

interface CodegraphConfigureCliOptions {
  json?: boolean;
  target: string;
  location: string;
  repo?: string;
}

export function formatCodegraphEnsure(result: CodegraphEnsureResult, asJson = false, repoRoot?: string): string {
  if (asJson) {
    return JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        repo_root: repoRoot,
        changed: result.changed,
        read_only: result.readOnly,
        codegraph: result.raw,
        actions: result.actions,
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(`CodeGraph: ${result.status} (${result.reason})`);
  lines.push(`Source: ${result.resolution.source}`);
  if (result.resolution.version) lines.push(`Version: ${result.resolution.version}`);
  if (result.resolution.globalFallbackUsed) lines.push('Fallback: global binary used');
  if (result.actions.length > 0) {
    lines.push('');
    lines.push('Actions:');
    for (const action of result.actions) {
      lines.push(`  ${action.action}: ${action.status}`);
    }
  }
  return lines.join('\n');
}

export function formatCodegraphConfigure(result: CodegraphConfigureResult, asJson = false, repoRoot?: string): string {
  if (asJson) {
    return JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        repo_root: repoRoot,
        target: result.target,
        location: result.location,
        changed: result.changed,
        read_only: result.readOnly,
        codegraph: result.raw,
        actions: result.actions,
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(`CodeGraph configure: target=${result.target} location=${result.location}`);
  lines.push(`Source: ${result.resolution.source}`);
  if (result.resolution.version) lines.push(`Version: ${result.resolution.version}`);
  if (result.actions.length > 0) {
    lines.push('');
    lines.push('Actions:');
    for (const action of result.actions) {
      lines.push(`  ${action.action}: ${action.status}`);
    }
  }
  return lines.join('\n');
}

function parseTarget(value: string): CodegraphHostTarget {
  if (value === 'codex' || value === 'claude' || value === 'both') return value;
  throw new Error(`invalid --target "${value}" (expected: codex, claude, both)`);
}

function parseLocation(value: string): CodegraphConfigureLocation {
  if (value === 'global' || value === 'local') return value;
  throw new Error(`invalid --location "${value}" (expected: global, local)`);
}

export function buildToolsCommand(): Command {
  const tools = new Command('tools').description('Manage explicit external tool readiness');
  const ensure = new Command('ensure').description('Ensure a named tool is ready');
  const configure = new Command('configure').description('Configure a named tool for a host agent');

  ensure
    .command('codegraph')
    .description('Check or ensure CodeGraph readiness for the current repo')
    .option('--json', 'Output JSON instead of human-readable text')
    .option('--check', 'Read-only readiness check; do not install, init, or sync')
    .option('--init', 'Initialize the repo index when missing')
    .option('--sync', 'Sync the repo index')
    .option('--no-install-deps', 'Do not run bun install when the local binary is missing')
    .option('--repo <path>', 'Repository root to check or ensure')
    .action((rawOpts: CodegraphEnsureCliOptions) => {
      const repoRoot = rawOpts.repo ?? process.cwd();
      const result = ensureCodegraph({
        repoRoot,
        checkOnly: rawOpts.check === true,
        init: rawOpts.init === true,
        sync: rawOpts.sync === true,
        installDeps: rawOpts.installDeps !== false,
      });
      console.log(formatCodegraphEnsure(result, rawOpts.json === true, repoRoot));
      const failed = result.actions.some((entry) => entry.status === 'failed');
      process.exit(failed ? 1 : 0);
    });

  configure
    .command('codegraph')
    .description('Configure CodeGraph MCP for Codex and/or Claude')
    .requiredOption('--target <target>', 'Target host: codex|claude|both')
    .requiredOption('--location <location>', 'Install location: global|local')
    .option('--json', 'Output JSON instead of human-readable text')
    .option('--repo <path>', 'Repository root used for local installs and readiness probes')
    .action((rawOpts: CodegraphConfigureCliOptions) => {
      let target: CodegraphHostTarget;
      let location: CodegraphConfigureLocation;
      try {
        target = parseTarget(rawOpts.target);
        location = parseLocation(rawOpts.location);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(2);
      }

      const repoRoot = rawOpts.repo ?? process.cwd();
      const configureHost = () => configureCodegraph({ repoRoot, target, location });
      const result = location === 'global'
        ? withRuntimeTransactionLock(globalRuntimeScope(process.env), configureHost)
        : configureHost();
      console.log(formatCodegraphConfigure(result, rawOpts.json === true, repoRoot));
      const failed = result.actions.some((entry) => entry.status === 'failed');
      process.exit(failed ? 1 : 0);
    });

  tools.addCommand(ensure);
  tools.addCommand(configure);
  return tools;
}

// CodeGraph checks and setup steps that src/cli/index.ts passes to doctor, init and the global runtime.

function doctorStatusForCodegraph(status: CodegraphCheckResult['status']): CheckStatus {
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

function checkCodegraphReadiness(probe: CodegraphProbe): DoctorCheckResult {
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

function checkCodegraphMcpHost(probe: CodegraphProbe, host: 'codex' | 'claude'): DoctorCheckResult {
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

function checkCodegraphIndex(probe: CodegraphProbe): DoctorCheckResult {
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
  const status: CheckStatus = indexStatus === 'up-to-date'
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

/**
 * The `doctor` CodeGraph checks: readiness, the Codex and Claude MCP hosts,
 * and the project index. The CLI root registers this provider only when the
 * architecture plugin is selected.
 */
function codegraphDoctorChecks(cwd: string): DoctorCheckResult[] {
  return codegraphChecksFor(probeCodegraph(cwd));
}

export const CODEGRAPH_DOCTOR_PROVIDER: CodegraphDoctorPort = { contractVersion: ARCHITECTURE_CONTRACT_VERSION, checks: codegraphDoctorChecks };

function codegraphChecksFor(probe: CodegraphProbe): DoctorCheckResult[] {
  return [
    checkCodegraphReadiness(probe),
    checkCodegraphMcpHost(probe, 'codex'),
    checkCodegraphMcpHost(probe, 'claude'),
    checkCodegraphIndex(probe),
  ];
}

/** The `init` CodeGraph index step. */
export const CODEGRAPH_INIT_STEP: InitPorts['codegraphStep'] = {
  step: "ensure codegraph index",
  run({ repoRoot, sync, env, target }) {
    const steps: InitStep[] = [];
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
  },
};

/** The global runtime `configure CodeGraph MCP` step. */
export function configureCodegraphMcpStep(cwd: string, target: InstallTargetSpec, env: NodeJS.ProcessEnv): GlobalRuntimeStep {
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
