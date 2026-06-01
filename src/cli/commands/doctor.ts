/**
 * `repo-harness doctor` — read-only readiness diagnostics.
 *
 * Built-in checks: PATH resolution, CLI version, per-host install detection,
 * Codex user-level trust state count, and target-aware CodeGraph readiness.
 * Never mutates.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { ALL_TARGETS } from '../installer/targets/registry';
import { checkCodegraph, type CodegraphCheckResult } from '../tools/codegraph';
import { CLI_VERSION } from './status';
import { runSecurityScan, type SecurityScanReport } from './security';

const TRUST_STATE_LINE = /^\[hooks\.state\."[^"]+\/\.codex\/hooks\.json:/;

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'na';

export interface DoctorCheckResult {
  id: string;
  describe: string;
  status: CheckStatus;
  detail: string;
}

export interface DoctorCheck {
  id: string;
  describe: string;
  run(): Omit<DoctorCheckResult, 'id' | 'describe'>;
}

export interface DoctorReport {
  checks: DoctorCheckResult[];
  summary: { ok: number; warn: number; fail: number; na: number };
}

const REGISTERED_CHECKS: DoctorCheck[] = [];

export function registerCheck(check: DoctorCheck): void {
  REGISTERED_CHECKS.push(check);
}

/** Test seam — Phase 1C tests reset after each. */
export function clearRegisteredChecks(): void {
  REGISTERED_CHECKS.length = 0;
}

function homeDir(): string {
  return process.env.HOME ?? os.homedir();
}

function checkPath(): DoctorCheckResult {
  const id = 'cli-on-path';
  const describe = 'repo-harness resolvable via PATH';
  const result = spawnSync('which', ['repo-harness'], { encoding: 'utf-8' });
  if (result.status === 0 && (result.stdout ?? '').trim()) {
    return { id, describe, status: 'ok', detail: (result.stdout as string).trim() };
  }
  return {
    id,
    describe,
    status: 'warn',
    detail: 'repo-harness not on PATH (host adapter shim exits 0 silently when CLI is missing)',
  };
}

function checkVersion(): DoctorCheckResult {
  return { id: 'cli-version', describe: 'repo-harness CLI version', status: 'ok', detail: CLI_VERSION };
}

function checkTargetInstall(target: (typeof ALL_TARGETS)[number]): DoctorCheckResult {
  const det = target.detect('global');
  const id = `${target.id}-adapter`;
  const describe = `${target.displayName} global adapter`;
  if (!det.installed) {
    return {
      id,
      describe,
      status: 'warn',
      detail: `${target.displayName} host not detected; install when host is set up`,
    };
  }
  if (!det.alreadyConfigured) {
    return {
      id,
      describe,
      status: 'warn',
      detail: `host detected but repo-harness not installed (run: repo-harness install --target ${target.id} --location global)`,
    };
  }
  return { id, describe, status: 'ok', detail: `installed at ${det.configPath}` };
}

function checkCodexTrustState(): DoctorCheckResult {
  const id = 'codex-trust-state';
  const describe = 'Codex user-level trust hash registration (~/.codex/config.toml)';
  const configPath = path.join(homeDir(), '.codex', 'config.toml');
  if (!fs.existsSync(configPath)) {
    return { id, describe, status: 'na', detail: 'Codex config.toml not found' };
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    let count = 0;
    for (const line of raw.split('\n')) {
      if (TRUST_STATE_LINE.test(line)) count++;
    }
    if (count === 0) {
      return {
        id,
        describe,
        status: 'warn',
        detail: 'no user-level trust hashes registered (restart Codex and accept the trust prompt)',
      };
    }
    return {
      id,
      describe,
      status: 'ok',
      detail: `${count} user-level trust hash entries`,
    };
  } catch (err) {
    return { id, describe, status: 'fail', detail: `error reading config.toml: ${(err as Error).message}` };
  }
}

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
    detail: `index=${indexStatus}${remediation ? `; remediation=${remediation}` : ''}`,
  };
}

function checkSecurityConfig(report: SecurityScanReport): DoctorCheckResult {
  const id = 'security-config';
  const describe = 'Local hook and VS Code automatic task security scan';
  if (report.status === 'ok') {
    return {
      id,
      describe,
      status: 'ok',
      detail: `scanned ${report.scannedFiles.length} files; no findings`,
    };
  }

  const high = report.findings.filter((finding) => finding.severity === 'high').length;
  const fail = report.findings.filter((finding) => finding.severity === 'fail').length;
  const warn = report.findings.filter((finding) => finding.severity === 'warn').length;
  const first = report.findings[0];
  return {
    id,
    describe,
    status: report.status === 'fail' ? 'fail' : 'warn',
    detail: `${report.findings.length} finding(s): ${high} high, ${warn} warn, ${fail} fail; first=${first.ruleId} at ${first.filePath}`,
  };
}

export function runDoctor(cwd: string = process.cwd()): DoctorReport {
  const checks: DoctorCheckResult[] = [];
  const codegraphProbe = probeCodegraph(cwd);
  const securityReport = runSecurityScan({ cwd });
  checks.push(checkPath());
  checks.push(checkVersion());
  for (const target of ALL_TARGETS) {
    if (target.supportsLocation('global')) {
      checks.push(checkTargetInstall(target));
    }
  }
  checks.push(checkCodexTrustState());
  checks.push(checkCodegraphReadiness(codegraphProbe));
  checks.push(checkCodegraphMcpHost(codegraphProbe, 'codex'));
  checks.push(checkCodegraphMcpHost(codegraphProbe, 'claude'));
  checks.push(checkCodegraphIndex(codegraphProbe));
  checks.push(checkSecurityConfig(securityReport));
  for (const plugin of REGISTERED_CHECKS) {
    const r = plugin.run();
    checks.push({ id: plugin.id, describe: plugin.describe, ...r });
  }
  const summary = { ok: 0, warn: 0, fail: 0, na: 0 };
  for (const c of checks) summary[c.status]++;
  return { checks, summary };
}

export function formatDoctor(report: DoctorReport, asJson = false): string {
  if (asJson) return JSON.stringify(report, null, 2);
  const lines: string[] = [];
  for (const c of report.checks) {
    const icon = c.status === 'ok' ? '✓' : c.status === 'warn' ? '!' : c.status === 'fail' ? '✗' : '-';
    lines.push(`${icon} ${c.id}: ${c.detail}`);
  }
  lines.push('');
  lines.push(
    `Summary: ${report.summary.ok} ok, ${report.summary.warn} warn, ${report.summary.fail} fail, ${report.summary.na} n/a`,
  );
  return lines.join('\n');
}
