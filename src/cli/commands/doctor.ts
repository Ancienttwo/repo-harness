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
import { isOptIn, resolveHooksDir, resolveRepoRoot } from '../hook/runtime';
import { ROUTES } from '../hook/route-registry';

const TRUST_STATE_LINE = /^\[hooks\.state\."[^"]+\/\.codex\/hooks\.json:/;
const PACKAGE_NAME = 'repo-harness';
const UPDATE_CHECK_ENV = 'REPO_HARNESS_CHECK_UPDATES';
const LATEST_VERSION_ENV = 'REPO_HARNESS_LATEST_VERSION';

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
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

function findCommandOnPath(command: string): string | null {
  const pathValue = process.env.PATH ?? '';
  const pathExt = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of pathExt) {
      const candidate = path.join(dir, `${command}${ext}`);
      try {
        if (!fs.statSync(candidate).isFile()) continue;
        if (process.platform !== 'win32') {
          fs.accessSync(candidate, fs.constants.X_OK);
        }
        return candidate;
      } catch {
        // Keep scanning PATH.
      }
    }
  }
  return null;
}

function checkPath(): DoctorCheckResult {
  const id = 'cli-on-path';
  const describe = 'repo-harness resolvable via PATH';
  const resolved = findCommandOnPath('repo-harness');
  if (resolved) {
    return { id, describe, status: 'ok', detail: resolved };
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

function parseVersion(value: string): number[] | null {
  const match = value.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function readLatestPackageVersion(): { version?: string; error?: string } {
  if (process.env[LATEST_VERSION_ENV]) {
    return { version: process.env[LATEST_VERSION_ENV] };
  }

  const result = spawnSync('npm', ['view', PACKAGE_NAME, 'version', '--json'], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  if (result.status !== 0 || result.error) {
    return { error: result.stderr || result.stdout || String(result.error?.message ?? result.error ?? 'npm view failed') };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return { version: typeof parsed === 'string' ? parsed : String(parsed) };
  } catch {
    return { version: result.stdout.trim().replace(/^"|"$/g, '') };
  }
}

function checkCliUpdate(): DoctorCheckResult {
  const id = 'cli-update';
  const describe = 'repo-harness latest version advisory';
  if (process.env[UPDATE_CHECK_ENV] !== '1') {
    return {
      id,
      describe,
      status: 'na',
      detail: `disabled; Agent can run ${UPDATE_CHECK_ENV}=1 repo-harness doctor --json before updating`,
    };
  }

  const latest = readLatestPackageVersion();
  if (!latest.version) {
    return { id, describe, status: 'na', detail: `latest unavailable; ${latest.error ?? 'unknown error'}` };
  }

  const comparison = compareVersions(CLI_VERSION, latest.version);
  if (comparison === null) {
    return { id, describe, status: 'warn', detail: `current=${CLI_VERSION}; latest=${latest.version}; unable to compare versions` };
  }
  if (comparison < 0) {
    return {
      id,
      describe,
      status: 'warn',
      detail: `current=${CLI_VERSION}; latest=${latest.version}; agent_action=bun add -g ${PACKAGE_NAME}@latest && repo-harness init`,
    };
  }
  return { id, describe, status: 'ok', detail: `current=${CLI_VERSION}; latest=${latest.version}` };
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
  const reviewed = report.reviewedFindings.length;
  if (report.status === 'ok') {
    return {
      id,
      describe,
      status: 'ok',
      detail: `scanned ${report.scannedFiles.length} files; no active findings${reviewed > 0 ? `; ${reviewed} reviewed exception(s)` : ''}`,
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
    detail: `${report.findings.length} finding(s): ${high} high, ${warn} warn, ${fail} fail${reviewed > 0 ? `; ${reviewed} reviewed exception(s)` : ''}; first=${first.ruleId} at ${first.filePath}`,
  };
}

function checkHookScriptDrift(cwd: string): DoctorCheckResult {
  const id = 'repo-hook-scripts';
  const describe = 'Active hook runtime scripts match the route registry';
  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) {
    return { id, describe, status: 'na', detail: 'not in a git repository' };
  }
  if (!isOptIn(repoRoot)) {
    return {
      id,
      describe,
      status: 'na',
      detail: 'repo is not opted in (.ai/harness/workflow-contract.json missing)',
    };
  }

  const resolved = resolveHooksDir(repoRoot);
  const expected = new Set<string>();
  const missing: string[] = [];
  for (const route of ROUTES) {
    for (const script of route.scripts) {
      expected.add(script);
      if (!fs.existsSync(path.join(resolved.dir, script)) && !missing.includes(script)) {
        missing.push(script);
      }
    }
  }

  if (missing.length === 0) {
    return {
      id,
      describe,
      status: 'ok',
      detail: `all ${expected.size} route scripts present (source=${resolved.source}, dir=${resolved.dir})`,
    };
  }

  const remediation =
    resolved.source === 'packaged'
      ? 'bun add -g repo-harness@latest'
      : `repo-harness adopt --repo ${repoRoot}`;
  return {
    id,
    describe,
    status: 'warn',
    detail: `missing from ${resolved.dir} (source=${resolved.source}): ${missing.join(', ')}; remediation=${remediation}`,
  };
}

export function runDoctor(cwd: string = process.cwd()): DoctorReport {
  const checks: DoctorCheckResult[] = [];
  const codegraphProbe = probeCodegraph(cwd);
  const securityReport = runSecurityScan({ cwd });
  checks.push(checkPath());
  checks.push(checkVersion());
  checks.push(checkCliUpdate());
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
  checks.push(checkHookScriptDrift(cwd));
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
