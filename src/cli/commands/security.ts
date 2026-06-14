/**
 * `repo-harness security scan` -- read-only checks for high-value local
 * config injection surfaces. It reports findings only; it never mutates host
 * or repo config.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { MANAGED_TAG, type HookEntry } from '../installer/managed-entries';

export type SecurityStatus = 'ok' | 'warn' | 'fail';
export type SecuritySeverity = 'warn' | 'high' | 'fail';
export type ScannedFileKind = 'claude-hooks' | 'codex-hooks' | 'vscode-tasks';

export interface SecurityFinding {
  filePath: string;
  ruleId: string;
  severity: SecuritySeverity;
  summary: string;
  recommendation: string;
  command?: string;
}

export type SecurityReviewedExceptionSource = 'repo-policy' | 'user-config';

export interface SecurityReviewedFinding extends SecurityFinding {
  reviewed: {
    reason: string;
    source: SecurityReviewedExceptionSource;
    reviewedAt?: string;
    reviewedBy?: string;
  };
}

export interface SecurityScannedFile {
  filePath: string;
  kind: ScannedFileKind;
  exists: boolean;
}

export interface SecurityScanReport {
  status: SecurityStatus;
  findings: SecurityFinding[];
  reviewedFindings: SecurityReviewedFinding[];
  scannedFiles: SecurityScannedFile[];
}

export interface SecurityScanOptions {
  cwd?: string;
  home?: string;
}

interface HookCommand {
  type?: string;
  command?: unknown;
}

interface HookConfig {
  hooks?: Record<string, HookEntry[]>;
}

interface VscodeTask {
  label?: unknown;
  taskName?: unknown;
  command?: unknown;
  args?: unknown;
  runOptions?: { runOn?: unknown };
  windows?: { command?: unknown; args?: unknown };
  osx?: { command?: unknown; args?: unknown };
  linux?: { command?: unknown; args?: unknown };
}

interface VscodeTasksFile {
  tasks?: VscodeTask[];
}

interface SecurityReviewedException {
  filePath: string;
  ruleId: string;
  reason: string;
  command?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

interface LoadedSecurityReviewedException extends SecurityReviewedException {
  normalizedFilePath: string;
  source: SecurityReviewedExceptionSource;
}

const SUSPICIOUS_COMMAND_PATTERNS: Array<{ ruleId: string; regex: RegExp; summary: string }> = [
  {
    ruleId: 'remote-shell-pipe',
    regex: /\b(curl|wget)\b[\s\S]{0,240}\|\s*(bash|sh|zsh)\b/i,
    summary: 'Command downloads remote content and pipes it into a shell',
  },
  {
    ruleId: 'base64-exec',
    regex: /\bbase64\b[\s\S]{0,240}(-d|--decode|decode)[\s\S]{0,240}(\||`|\$\(|bash|sh|zsh|python|node)/i,
    summary: 'Command decodes base64 content near an execution sink',
  },
  {
    ruleId: 'apple-script-exec',
    regex: /\bosascript\b/i,
    summary: 'Command invokes osascript',
  },
  {
    ruleId: 'persistence-launch-agent',
    regex: /\blaunchctl\b|\bcrontab\b/i,
    summary: 'Command touches persistence mechanisms',
  },
  {
    ruleId: 'network-shell',
    regex: /(^|[;&|()\s])(nc|ncat)\s/i,
    summary: 'Command invokes netcat/ncat',
  },
  {
    ruleId: 'inline-shell-exec',
    regex: /\b(bash|sh|zsh|python|node)\s+-[ce]\b/i,
    summary: 'Command uses inline interpreter execution',
  },
];

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

function resolveRepoRoot(cwd: string): string {
  try {
    const out = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() || cwd;
  } catch {
    return cwd;
  }
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pushJsonFailure(findings: SecurityFinding[], filePath: string, err: unknown): void {
  findings.push({
    filePath,
    ruleId: 'invalid-json',
    severity: 'fail',
    summary: `Could not parse JSON: ${(err as Error).message}`,
    recommendation: 'Inspect the file manually before trusting any configured hooks or tasks.',
  });
}

function suspiciousMatch(command: string): { ruleId: string; summary: string } | null {
  for (const pattern of SUSPICIOUS_COMMAND_PATTERNS) {
    if (pattern.regex.test(command)) {
      return { ruleId: pattern.ruleId, summary: pattern.summary };
    }
  }
  return null;
}

function commandSnippet(command: string): string {
  const compact = command.replace(/\s+/g, ' ').trim();
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function normalizeConfigPath(value: string, repoRoot: string, home: string): string {
  if (value === '~') return path.resolve(home);
  if (value.startsWith('~/')) return path.resolve(home, value.slice(2));
  if (path.isAbsolute(value)) return path.resolve(value);
  return path.resolve(repoRoot, value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function reviewedExceptionEntries(raw: unknown): unknown[] {
  if (!isRecord(raw)) return [];
  const security = isRecord(raw.security) ? raw.security : undefined;
  if (!security) return [];
  const entries = security.reviewed_findings ?? security.reviewedFindings;
  return Array.isArray(entries) ? entries : [];
}

function loadReviewedExceptions(repoRoot: string, home: string): LoadedSecurityReviewedException[] {
  const sources: Array<{ filePath: string; source: SecurityReviewedExceptionSource }> = [
    { filePath: path.join(repoRoot, '.ai', 'harness', 'policy.json'), source: 'repo-policy' },
    { filePath: path.join(home, '.repo-harness', 'config.json'), source: 'user-config' },
  ];
  const exceptions: LoadedSecurityReviewedException[] = [];
  for (const source of sources) {
    if (!fs.existsSync(source.filePath)) continue;
    let parsed: unknown;
    try {
      parsed = readJson(source.filePath);
    } catch {
      continue;
    }
    for (const entry of reviewedExceptionEntries(parsed)) {
      if (!isRecord(entry)) continue;
      const filePath = asString(entry.filePath);
      const ruleId = asString(entry.ruleId);
      const reason = asString(entry.reason);
      if (!filePath || !ruleId || !reason) continue;
      const command = asString(entry.command);
      const reviewedAt = asString(entry.reviewedAt);
      const reviewedBy = asString(entry.reviewedBy);
      exceptions.push({
        filePath,
        ruleId,
        reason,
        ...(command ? { command } : {}),
        ...(reviewedAt ? { reviewedAt } : {}),
        ...(reviewedBy ? { reviewedBy } : {}),
        normalizedFilePath: normalizeConfigPath(filePath, repoRoot, home),
        source: source.source,
      });
    }
  }
  return exceptions;
}

function hookBlocks(config: HookConfig): Array<{ event: string; hook: HookCommand }> {
  const out: Array<{ event: string; hook: HookCommand }> = [];
  for (const [event, blocks] of Object.entries(config.hooks ?? {})) {
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      const commands = Array.isArray(block?.hooks) ? block.hooks : [];
      for (const hook of commands) out.push({ event, hook });
    }
  }
  return out;
}

function scanHookConfig(
  findings: SecurityFinding[],
  filePath: string,
  hostLabel: string,
  legacyProjectAdapter: boolean,
): void {
  if (!fs.existsSync(filePath)) return;

  let parsed: unknown;
  try {
    parsed = readJson(filePath);
  } catch (err) {
    pushJsonFailure(findings, filePath, err);
    return;
  }

  const config = parsed as HookConfig;
  const commands = hookBlocks(config);
  if (legacyProjectAdapter && commands.length > 0) {
    findings.push({
      filePath,
      ruleId: 'legacy-project-hook-adapter',
      severity: 'warn',
      summary: `${hostLabel} project-level hook config still contains ${commands.length} hook command(s)`,
      recommendation: 'Prefer user-level repo-harness adapters and keep repo-local hooks under .ai/hooks.',
    });
  }

  for (const { event, hook } of commands) {
    const command = typeof hook.command === 'string' ? hook.command : '';
    if (!command) continue;
    const suspicious = suspiciousMatch(command);
    if (command.includes(MANAGED_TAG) && suspicious === null) continue;
    findings.push({
      filePath,
      ruleId: suspicious?.ruleId ?? 'unmanaged-hook-command',
      severity: suspicious ? 'high' : 'warn',
      summary: suspicious
        ? `${hostLabel} ${event} hook looks risky: ${suspicious.summary}`
        : `${hostLabel} ${event} hook is not managed by repo-harness`,
      recommendation: `Review this command before trusting it: ${commandSnippet(command)}`,
      command,
    });
  }
}

function taskLabel(task: VscodeTask): string {
  const label = typeof task.label === 'string'
    ? task.label
    : typeof task.taskName === 'string'
      ? task.taskName
      : '(unnamed task)';
  return label;
}

function commandParts(task: VscodeTask): string {
  const parts: string[] = [];
  for (const source of [task, task.osx, task.linux, task.windows]) {
    if (!source) continue;
    if (typeof source.command === 'string') parts.push(source.command);
    if (Array.isArray(source.args)) {
      parts.push(source.args.filter((arg) => typeof arg === 'string').join(' '));
    }
  }
  return parts.join(' ');
}

function scanVscodeTasks(findings: SecurityFinding[], filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  let parsed: unknown;
  try {
    parsed = readJson(filePath);
  } catch (err) {
    pushJsonFailure(findings, filePath, err);
    return;
  }

  const config = parsed as VscodeTasksFile;
  for (const task of config.tasks ?? []) {
    if (task?.runOptions?.runOn !== 'folderOpen') continue;
    const command = commandParts(task);
    const suspicious = suspiciousMatch(command);
    findings.push({
      filePath,
      ruleId: suspicious ? 'vscode-folder-open-suspicious' : 'vscode-folder-open-task',
      severity: suspicious ? 'high' : 'warn',
      summary: suspicious
        ? `VS Code folderOpen task "${taskLabel(task)}" looks risky: ${suspicious.summary}`
        : `VS Code task "${taskLabel(task)}" runs automatically on folder open`,
      recommendation: command
        ? `Review or disable this automatic task: ${commandSnippet(command)}`
        : 'Review or disable this automatic task before opening the folder in VS Code.',
      ...(command ? { command } : {}),
    });
  }
}

function matchingReviewedException(
  finding: SecurityFinding,
  exceptions: LoadedSecurityReviewedException[],
): LoadedSecurityReviewedException | undefined {
  if (finding.severity !== 'warn') return undefined;
  const findingFilePath = path.resolve(finding.filePath);
  return exceptions.find((entry) => {
    if (entry.normalizedFilePath !== findingFilePath) return false;
    if (entry.ruleId !== finding.ruleId) return false;
    if (finding.command) return entry.command === finding.command;
    return entry.command === undefined;
  });
}

function applyReviewedExceptions(
  findings: SecurityFinding[],
  exceptions: LoadedSecurityReviewedException[],
): { findings: SecurityFinding[]; reviewedFindings: SecurityReviewedFinding[] } {
  const activeFindings: SecurityFinding[] = [];
  const reviewedFindings: SecurityReviewedFinding[] = [];
  for (const finding of findings) {
    const reviewed = matchingReviewedException(finding, exceptions);
    if (!reviewed) {
      activeFindings.push(finding);
      continue;
    }
    reviewedFindings.push({
      ...finding,
      reviewed: {
        reason: reviewed.reason,
        source: reviewed.source,
        ...(reviewed.reviewedAt ? { reviewedAt: reviewed.reviewedAt } : {}),
        ...(reviewed.reviewedBy ? { reviewedBy: reviewed.reviewedBy } : {}),
      },
    });
  }
  return { findings: activeFindings, reviewedFindings };
}

function reportStatus(findings: SecurityFinding[]): SecurityStatus {
  if (findings.some((finding) => finding.severity === 'fail' || finding.severity === 'high')) return 'fail';
  if (findings.length > 0) return 'warn';
  return 'ok';
}

export function runSecurityScan(opts: SecurityScanOptions = {}): SecurityScanReport {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? homeDir();
  const repoRoot = resolveRepoRoot(cwd);
  const scannedFiles: SecurityScannedFile[] = [
    { filePath: path.join(home, '.claude', 'settings.json'), kind: 'claude-hooks', exists: false },
    { filePath: path.join(home, '.codex', 'hooks.json'), kind: 'codex-hooks', exists: false },
    { filePath: path.join(repoRoot, '.vscode', 'tasks.json'), kind: 'vscode-tasks', exists: false },
    { filePath: path.join(repoRoot, '.claude', 'settings.json'), kind: 'claude-hooks', exists: false },
    { filePath: path.join(repoRoot, '.codex', 'hooks.json'), kind: 'codex-hooks', exists: false },
  ].map((entry) => ({ ...entry, exists: fs.existsSync(entry.filePath) }));

  const findings: SecurityFinding[] = [];
  scanHookConfig(findings, scannedFiles[0].filePath, 'Claude user-level', false);
  scanHookConfig(findings, scannedFiles[1].filePath, 'Codex user-level', false);
  scanVscodeTasks(findings, scannedFiles[2].filePath);
  scanHookConfig(findings, scannedFiles[3].filePath, 'Claude', true);
  scanHookConfig(findings, scannedFiles[4].filePath, 'Codex', true);

  const reviewedExceptions = loadReviewedExceptions(repoRoot, home);
  const applied = applyReviewedExceptions(findings, reviewedExceptions);
  return {
    status: reportStatus(applied.findings),
    findings: applied.findings,
    reviewedFindings: applied.reviewedFindings,
    scannedFiles,
  };
}

export function formatSecurityScan(report: SecurityScanReport, asJson = false): string {
  if (asJson) return JSON.stringify(report, null, 2);
  const lines: string[] = [];
  lines.push(`Security config: ${report.status}`);
  lines.push(`Scanned files: ${report.scannedFiles.length}`);
  if (report.findings.length === 0) {
    lines.push(report.reviewedFindings.length > 0 ? 'No active findings.' : 'No findings.');
  }
  for (const finding of report.findings) {
    lines.push(`- [${finding.severity}] ${finding.ruleId}: ${finding.summary}`);
    lines.push(`  ${finding.filePath}`);
    lines.push(`  ${finding.recommendation}`);
  }
  if (report.reviewedFindings.length > 0) {
    lines.push('Reviewed exceptions:');
  }
  for (const finding of report.reviewedFindings) {
    lines.push(`- [reviewed] ${finding.ruleId}: ${finding.summary}`);
    lines.push(`  ${finding.filePath}`);
    lines.push(`  reason: ${finding.reviewed.reason}`);
  }
  return lines.join('\n');
}
