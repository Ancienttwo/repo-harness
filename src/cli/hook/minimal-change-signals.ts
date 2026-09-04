import { execFileSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'path';
import type { MinimalChangePolicy } from './minimal-change-policy';
import { loadMinimalChangePolicy } from './minimal-change-policy';

export type MinimalChangeFindingTag =
  | 'delete'
  | 'stdlib'
  | 'native'
  | 'dependency'
  | 'yagni'
  | 'shrink';

export type MinimalChangeVerdict = 'disabled' | 'lean' | 'review' | 'unknown';

export interface MinimalChangeDependencySignal {
  readonly name: string;
  readonly type: string;
  readonly version?: string;
}

export interface MinimalChangeAbstractionCandidate {
  readonly path: string;
  readonly evidence: string;
  readonly confidence: 'low';
}

export interface MinimalChangeProtectedChange {
  readonly path: string;
  readonly concern: string;
  readonly evidence: string;
  readonly needs_human_review: true;
}

export interface MinimalChangeFinding {
  readonly tag: MinimalChangeFindingTag;
  readonly path: string;
  readonly severity: 'advice';
  readonly evidence: string;
  readonly question: string;
}

export interface MinimalChangeReport {
  readonly version: 1;
  readonly policy_version: 1;
  readonly mode: MinimalChangePolicy['mode'];
  readonly generated_at: string;
  readonly repo_root: '.';
  readonly base_ref: string;
  readonly fingerprint: string;
  readonly scope: {
    readonly paths: readonly string[];
    readonly manifest_paths: readonly string[];
  };
  readonly signals: {
    readonly files_changed: number;
    readonly files_added: number;
    readonly files_deleted: number;
    readonly loc_added: number;
    readonly loc_deleted: number;
    readonly binary_files: readonly string[];
    readonly dependency_manifests_changed: readonly string[];
    readonly new_dependencies: readonly MinimalChangeDependencySignal[];
    readonly removed_dependencies: readonly MinimalChangeDependencySignal[];
    readonly new_file_paths: readonly string[];
    readonly abstraction_candidates: readonly MinimalChangeAbstractionCandidate[];
  };
  readonly protected_changes: readonly MinimalChangeProtectedChange[];
  readonly findings: readonly MinimalChangeFinding[];
  readonly verdict: MinimalChangeVerdict;
  readonly report_path: string;
  readonly error?: string;
}

export interface CollectMinimalChangeSignalsOptions {
  readonly repoRoot: string;
  readonly path?: string;
  readonly policy?: MinimalChangePolicy;
  readonly baseRef?: string;
  readonly now?: Date;
  readonly writeReport?: boolean;
  /** Optional absolute deadline used by Stop-time journal consumption. */
  readonly deadlineMs?: number;
  readonly nowMs?: () => number;
}

const DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const);

const KNOWN_MANIFESTS = Object.freeze([
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'Gemfile',
  'pom.xml',
] as const);

function stableSort(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function git(
  repoRoot: string,
  args: readonly string[],
  deadlineMs?: number,
  nowMs: () => number = Date.now,
): string | null {
  try {
    const remainingMs = deadlineMs === undefined ? 1_500 : Math.floor(deadlineMs - nowMs());
    if (remainingMs <= 0) return null;
    return execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: Math.min(1_500, remainingMs),
    });
  } catch {
    return null;
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function normalizeRepoPath(repoRoot: string, pathValue: string | undefined): string | null {
  if (!pathValue) return null;
  const raw = pathValue.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!raw || raw.includes('\0') || raw.startsWith('/') || raw.split('/').includes('..')) return null;
  const abs = resolve(repoRoot, raw);
  if (!isInside(resolve(repoRoot), abs)) return null;

  if (existsSync(abs)) {
    try {
      const rootReal = realpathSync(repoRoot);
      const real = realpathSync(abs);
      if (!isInside(rootReal, real)) return null;
    } catch {
      return null;
    }
  }

  return raw;
}

function readFileHash(repoRoot: string, relPath: string): string {
  const abs = resolve(repoRoot, relPath);
  if (!existsSync(abs)) return 'missing';
  try {
    const stat = statSync(abs);
    if (!stat.isFile()) return `non-file:${stat.size}:${stat.mtimeMs}`;
    const raw = readFileSync(abs);
    const sample = raw.subarray(0, 512 * 1024);
    return createHash('sha256')
      .update(String(raw.length))
      .update('\0')
      .update(sample)
      .digest('hex');
  } catch {
    return 'unreadable';
  }
}

function readTextFileBounded(repoRoot: string, relPath: string): string {
  const abs = resolve(repoRoot, relPath);
  if (!existsSync(abs)) return '';
  try {
    const stat = statSync(abs);
    if (!stat.isFile() || stat.size > 256 * 1024) return '';
    const raw = readFileSync(abs);
    if (raw.includes(0)) return '';
    return raw.toString('utf8');
  } catch {
    return '';
  }
}

function isTracked(repoRoot: string, relPath: string, deadlineMs?: number, nowMs?: () => number): boolean {
  return git(repoRoot, ['ls-files', '--error-unmatch', '--', relPath], deadlineMs, nowMs) !== null;
}

function parseNumstat(numstat: string): {
  locAdded: number;
  locDeleted: number;
  binaryFiles: readonly string[];
} {
  let locAdded = 0;
  let locDeleted = 0;
  const binaryFiles: string[] = [];
  for (const line of numstat.trim().split('\n')) {
    if (!line.trim()) continue;
    const [added, deleted, path] = line.split('\t');
    if (added === '-' || deleted === '-') {
      if (path) binaryFiles.push(path);
      continue;
    }
    locAdded += Number.parseInt(added, 10) || 0;
    locDeleted += Number.parseInt(deleted, 10) || 0;
  }
  return { locAdded, locDeleted, binaryFiles: stableSort(binaryFiles) };
}

function parseNameStatus(status: string): {
  added: boolean;
  deleted: boolean;
  changed: boolean;
} {
  let added = false;
  let deleted = false;
  let changed = false;
  for (const line of status.trim().split('\n')) {
    if (!line.trim()) continue;
    changed = true;
    const code = line.split('\t')[0] ?? '';
    if (code.startsWith('A')) added = true;
    if (code.startsWith('D')) deleted = true;
    if (code.startsWith('R')) changed = true;
  }
  return { added, deleted, changed };
}

function countNewFileLines(repoRoot: string, relPath: string): number {
  const text = readTextFileBounded(repoRoot, relPath);
  if (!text) return 0;
  return text.split('\n').filter((line) => line.length > 0).length;
}

function manifestKind(relPath: string): string | null {
  const name = basename(relPath);
  if (KNOWN_MANIFESTS.includes(name as (typeof KNOWN_MANIFESTS)[number])) return name;
  if (name.startsWith('build.gradle')) return name;
  return null;
}

function packageDeps(value: unknown): Map<string, MinimalChangeDependencySignal> {
  const out = new Map<string, MinimalChangeDependencySignal>();
  if (!isRecord(value)) return out;
  for (const field of DEPENDENCY_FIELDS) {
    const deps = value[field];
    if (!isRecord(deps)) continue;
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version !== 'string') continue;
      out.set(name, { name, type: field, version });
    }
  }
  return out;
}

function parseJsonObject(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function readHeadFile(repoRoot: string, baseRef: string, relPath: string, deadlineMs?: number, nowMs?: () => number): string | null {
  return git(repoRoot, ['show', `${baseRef}:${relPath}`], deadlineMs, nowMs);
}

function dependencySignals(repoRoot: string, baseRef: string, relPath: string, deadlineMs?: number, nowMs?: () => number): {
  changed: boolean;
  newDependencies: readonly MinimalChangeDependencySignal[];
  removedDependencies: readonly MinimalChangeDependencySignal[];
} {
  if (basename(relPath) !== 'package.json') {
    return { changed: true, newDependencies: [], removedDependencies: [] };
  }

  const oldRaw = readHeadFile(repoRoot, baseRef, relPath, deadlineMs, nowMs);
  const newRaw = existsSync(resolve(repoRoot, relPath)) ? readFileSync(resolve(repoRoot, relPath), 'utf8') : '';
  const oldDeps = packageDeps(parseJsonObject(oldRaw));
  const newDeps = packageDeps(parseJsonObject(newRaw));
  const newByName = [...newDeps.values()].filter((dep) => !oldDeps.has(dep.name));
  const removedByName = [...oldDeps.values()].filter((dep) => !newDeps.has(dep.name));

  return {
    changed: oldRaw !== newRaw,
    newDependencies: Object.freeze(newByName.sort((a, b) => a.name.localeCompare(b.name))),
    removedDependencies: Object.freeze(removedByName.sort((a, b) => a.name.localeCompare(b.name))),
  };
}

function detectProtectedChanges(repoRoot: string, relPath: string): readonly MinimalChangeProtectedChange[] {
  const text = readTextFileBounded(repoRoot, relPath);
  const haystack = `${relPath}\n${text}`;
  const checks: Array<{ concern: string; pattern: RegExp; evidence: string }> = [
    {
      concern: 'security',
      pattern: /\b(auth|permission|secret|token|crypto|csrf|xss|sanitize|security)\b/i,
      evidence: 'path or bounded content mentions security-sensitive behavior',
    },
    {
      concern: 'validation',
      pattern: /\b(validate|validation|schema|sanitize|parse|guard)\b/i,
      evidence: 'path or bounded content mentions validation or sanitization',
    },
    {
      concern: 'data_loss',
      pattern: /\b(transaction|rollback|backup|atomic|migration|idempotent)\b/i,
      evidence: 'path or bounded content mentions data-safety safeguards',
    },
    {
      concern: 'error_handling',
      pattern: /\b(timeout|retry|catch|finally|cancel|abort|error)\b/i,
      evidence: 'path or bounded content mentions error or cancellation handling',
    },
    {
      concern: 'accessibility',
      pattern: /\b(aria-|role=|screen reader|keyboard|accessibility|a11y)\b/i,
      evidence: 'path or bounded content mentions accessibility behavior',
    },
    {
      concern: 'tests',
      pattern: /(^|\/)(tests?|__tests__|fixtures?)\/|(\.test|\.spec)\./i,
      evidence: 'path is test or fixture coverage',
    },
  ];

  return Object.freeze(
    checks
      .filter((check) => check.pattern.test(haystack))
      .map((check) => ({
        path: relPath,
        concern: check.concern,
        evidence: check.evidence,
        needs_human_review: true as const,
      }))
      .sort((a, b) => a.concern.localeCompare(b.concern)),
  );
}

function abstractionCandidates(
  repoRoot: string,
  relPath: string,
  protectedChanges: readonly MinimalChangeProtectedChange[],
): readonly MinimalChangeAbstractionCandidate[] {
  if (protectedChanges.length > 0) return [];
  const text = readTextFileBounded(repoRoot, relPath);
  const base = basename(relPath).toLowerCase();
  const candidates: MinimalChangeAbstractionCandidate[] = [];

  if (/\b(adapter|factory|manager|wrapper)\b/.test(base.replace(/[-_.]/g, ' '))) {
    candidates.push({
      path: relPath,
      evidence: 'new or changed file name introduces a generic abstraction label',
      confidence: 'low',
    });
  }

  if (/\b(interface|abstract\s+class)\b/.test(text)) {
    candidates.push({
      path: relPath,
      evidence: 'bounded content introduces an interface or abstract class',
      confidence: 'low',
    });
  }

  if (/function\s+\w+\s*\([^)]*\)\s*\{[^{}]{0,160}return\s+\w+(?:\.\w+)?\(/s.test(text)) {
    candidates.push({
      path: relPath,
      evidence: 'bounded content contains a small forwarding wrapper candidate',
      confidence: 'low',
    });
  }

  const seen = new Set<string>();
  return Object.freeze(
    candidates.filter((candidate) => {
      const key = `${candidate.path}:${candidate.evidence}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

function buildFindings(
  policy: MinimalChangePolicy,
  relPath: string,
  newDependencies: readonly MinimalChangeDependencySignal[],
  candidates: readonly MinimalChangeAbstractionCandidate[],
): readonly MinimalChangeFinding[] {
  const findings: MinimalChangeFinding[] = [];

  if (policy.new_dependency === 'warn') {
    for (const dep of newDependencies) {
      findings.push({
        tag: 'dependency',
        path: relPath,
        severity: 'advice',
        evidence: `dependency ${dep.name} was added to ${dep.type}`,
        question: 'Can the platform, stdlib, or an already-installed dependency cover this?',
      });
    }
  }

  if (policy.new_abstraction === 'warn') {
    for (const candidate of candidates) {
      findings.push({
        tag: 'yagni',
        path: candidate.path,
        severity: 'advice',
        evidence: candidate.evidence,
        question: 'Is this abstraction required by the current request, or can the direct implementation stay smaller?',
      });
    }
  }

  return Object.freeze(
    findings
      .sort((a, b) =>
        [a.severity, a.tag, a.path, a.evidence].join('\0').localeCompare(
          [b.severity, b.tag, b.path, b.evidence].join('\0'),
        ),
      )
      .slice(0, policy.max_findings),
  );
}

function fingerprint(payload: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function readExistingReport(path: string): MinimalChangeReport | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as MinimalChangeReport;
  } catch {
    return null;
  }
}

function writeReportAtomically(path: string, report: MinimalChangeReport): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

function unknownReport(
  policy: MinimalChangePolicy,
  baseRef: string,
  error: string,
  now: Date,
): MinimalChangeReport {
  return {
    version: 1,
    policy_version: 1,
    mode: policy.mode,
    generated_at: now.toISOString(),
    repo_root: '.',
    base_ref: baseRef,
    fingerprint: fingerprint({ error, baseRef, policyVersion: policy.version }),
    scope: { paths: [], manifest_paths: [] },
    signals: {
      files_changed: 0,
      files_added: 0,
      files_deleted: 0,
      loc_added: 0,
      loc_deleted: 0,
      binary_files: [],
      dependency_manifests_changed: [],
      new_dependencies: [],
      removed_dependencies: [],
      new_file_paths: [],
      abstraction_candidates: [],
    },
    protected_changes: [],
    findings: [],
    verdict: 'unknown',
    report_path: policy.report_path,
    error,
  };
}

export function collectMinimalChangeSignals(
  options: CollectMinimalChangeSignalsOptions,
): MinimalChangeReport {
  const repoRoot = realpathSync(resolve(options.repoRoot));
  const policy = options.policy ?? loadMinimalChangePolicy(repoRoot);
  const baseRef = options.baseRef ?? 'HEAD';
  const now = options.now ?? new Date();
  const nowMs = options.nowMs ?? Date.now;
  const reportAbs = resolve(repoRoot, policy.report_path);

  if (policy.mode === 'off' || !policy.post_edit_observer) {
    return {
      ...unknownReport(policy, baseRef, 'minimal-change disabled', now),
      verdict: 'disabled',
      error: undefined,
    };
  }

  const top = git(repoRoot, ['rev-parse', '--show-toplevel'], options.deadlineMs, nowMs)?.trim();
  if (!top || realpathSync(resolve(top)) !== repoRoot) {
    return unknownReport(policy, baseRef, 'not a git repository root', now);
  }

  const relPath = normalizeRepoPath(repoRoot, options.path);
  if (!relPath) {
    return unknownReport(policy, baseRef, 'missing or unsafe path', now);
  }

  const abs = resolve(repoRoot, relPath);
  if (existsSync(abs)) {
    try {
      const stat = lstatSync(abs);
      if (stat.isSymbolicLink()) {
        return unknownReport(policy, baseRef, 'symlink path is not analyzed', now);
      }
    } catch {
      return unknownReport(policy, baseRef, 'path could not be inspected', now);
    }
  }

  const nameStatusRaw = git(repoRoot, ['diff', '--name-status', '--find-renames', baseRef, '--', relPath], options.deadlineMs, nowMs) ?? '';
  const numstatRaw = git(repoRoot, ['diff', '--numstat', baseRef, '--', relPath], options.deadlineMs, nowMs) ?? '';
  const status = parseNameStatus(nameStatusRaw);
  const numstat = parseNumstat(numstatRaw);
  const tracked = isTracked(repoRoot, relPath, options.deadlineMs, nowMs);
  const exists = existsSync(abs);
  const untrackedNewFile = exists && !tracked;
  const filesAdded = (status.added ? 1 : 0) + (untrackedNewFile ? 1 : 0);
  const filesDeleted = status.deleted ? 1 : 0;
  const filesChanged = status.changed || untrackedNewFile ? 1 : 0;
  const newFilePaths = filesAdded > 0 ? [relPath] : [];
  const locAdded = numstat.locAdded + (untrackedNewFile ? countNewFileLines(repoRoot, relPath) : 0);

  const manifest = manifestKind(relPath);
  const manifestPaths = manifest ? [relPath] : [];
  const dependency = manifest
    ? dependencySignals(repoRoot, baseRef, relPath, options.deadlineMs, nowMs)
    : { changed: false, newDependencies: [], removedDependencies: [] };
  const dependencyManifestPaths = manifest && dependency.changed ? [relPath] : [];
  const protectedChanges = exists ? detectProtectedChanges(repoRoot, relPath) : [];
  const abstraction = exists
    ? abstractionCandidates(repoRoot, relPath, protectedChanges)
    : [];
  const findings = buildFindings(policy, relPath, dependency.newDependencies, abstraction);
  const reportFingerprint = fingerprint({
    baseRef,
    relPath,
    policyVersion: policy.version,
    mode: policy.mode,
    nameStatusRaw,
    numstatRaw,
    fileHash: readFileHash(repoRoot, relPath),
    manifestHash: manifest ? readFileHash(repoRoot, relPath) : '',
  });

  const report: MinimalChangeReport = {
    version: 1,
    policy_version: 1,
    mode: policy.mode,
    generated_at: now.toISOString(),
    repo_root: '.',
    base_ref: baseRef,
    fingerprint: reportFingerprint,
    scope: {
      paths: [relPath],
      manifest_paths: manifestPaths,
    },
    signals: {
      files_changed: filesChanged,
      files_added: filesAdded,
      files_deleted: filesDeleted,
      loc_added: locAdded,
      loc_deleted: numstat.locDeleted,
      binary_files: numstat.binaryFiles,
      dependency_manifests_changed: dependencyManifestPaths,
      new_dependencies: dependency.newDependencies,
      removed_dependencies: dependency.removedDependencies,
      new_file_paths: stableSort(newFilePaths),
      abstraction_candidates: abstraction,
    },
    protected_changes: protectedChanges,
    findings,
    verdict: findings.length > 0 ? 'review' : 'lean',
    report_path: policy.report_path,
  };

  if (options.writeReport !== false) {
    const existing = policy.event_dedupe ? readExistingReport(reportAbs) : null;
    if (existing?.fingerprint !== report.fingerprint) {
      writeReportAtomically(reportAbs, report);
    }
  }

  return report;
}
