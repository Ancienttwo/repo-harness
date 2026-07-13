import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { buildImplementationDiffFingerprint } from './diff-fingerprint';
import {
  resolveWorkflowProfile,
  type WorkflowOperationKind,
  type WorkflowProfile,
  type WorkflowProfileSignals,
} from './workflow-profile';

export type SnapshotPlanState =
  | 'none'
  | 'stale_marker'
  | 'foreign_worktree'
  | 'draft'
  | 'annotating'
  | 'approved'
  | 'executing'
  | 'unknown';

export interface StateSnapshot {
  readonly protocol: 1;
  readonly kind: 'repo-harness-state-snapshot';
  readonly states: {
    readonly spec: 'present' | 'missing';
    readonly plan: SnapshotPlanState;
    readonly pending: 'none' | 'fresh' | 'stale';
    readonly worktree: 'current' | 'linked_target' | 'foreign_marker';
    readonly contract: 'present' | 'missing';
    readonly contract_path: 'present' | 'missing';
    readonly evidence: 'unchecked' | 'complete' | 'incomplete';
  };
  readonly paths: {
    readonly active_plan: string | null;
    readonly contract: string | null;
  };
  readonly marker: {
    readonly problem: 'none' | 'deleted' | 'foreign_worktree';
  };
}

export type FreshnessState = 'fresh' | 'stale' | 'missing' | 'unavailable' | 'not_applicable';

export interface EffectiveStateSource {
  readonly path: string | null;
  readonly freshness: FreshnessState;
  readonly detail?: string;
}

export interface EffectiveState {
  readonly protocol: 1;
  readonly kind: 'repo-harness-effective-state';
  readonly task_id: string | null;
  readonly phase: string;
  readonly state_version: number;
  readonly state_revision: string;
  readonly authoritative_plan: {
    readonly path: string;
    readonly status: SnapshotPlanState;
  } | null;
  readonly contract: {
    readonly path: string;
    readonly status: string | null;
    readonly plan: string | null;
  } | null;
  readonly task_profile: string | null;
  readonly workflow_profile: WorkflowProfile | null;
  readonly requested_workflow_profile: string | null;
  readonly risk_floor: WorkflowProfile;
  readonly profile_reasons: readonly string[];
  readonly profile_signals: WorkflowProfileSignals | null;
  readonly allowed_paths: readonly string[];
  readonly next_action: string | null;
  readonly guidance: string | null;
  readonly blockers: readonly string[];
  readonly stale_sources: readonly string[];
  readonly conflicting_sources: readonly string[];
  readonly source_hashes: Readonly<Record<string, string>>;
  readonly review: EffectiveStateSource & {
    readonly recommendation: string | null;
    readonly recorded_fingerprint: string | null;
  };
  readonly external_acceptance: EffectiveStateSource & {
    readonly status: string | null;
  };
  readonly checks: EffectiveStateSource & {
    readonly status: string | null;
  };
  readonly active_sprint: EffectiveStateSource;
  readonly worktree: EffectiveStateSource & {
    readonly current: string;
    readonly owner: string | null;
  };
  readonly handoff: EffectiveStateSource;
  readonly resume: EffectiveStateSource;
  readonly current_snapshot: EffectiveStateSource;
}

export interface EffectiveStateRiskInput {
  readonly targetPaths?: readonly string[];
  readonly capabilityIds?: readonly string[];
  readonly capabilityCount?: number;
  readonly operationKind?: WorkflowOperationKind;
  readonly explicitOverride?: WorkflowProfile;
}

const ACTIVE_PLAN_MARKER = '.ai/harness/active-plan';
const LEGACY_ACTIVE_PLAN_MARKER = '.claude/.active-plan';
const ACTIVE_WORKTREE_MARKER = '.ai/harness/active-worktree';
const EVIDENCE_LABELS = [
  'State/progress path',
  'Verification evidence',
  'Evaluator rubric',
  'Stop condition',
  'Rollback surface',
] as const;

// Ceremony bound per resolved workflow profile. Lite gets zero ceremony
// (brief -> edit -> targeted test; no plan/contract/notes/todos/checks
// authorship); Standard caps at the single active-plan artifact; Strict's
// envelope is unchanged. This is a text layer surfaced to the agent via
// `guidance` -- it does not alter resolveWorkflowProfile's risk floor or any
// guard's blocking logic.
const CEREMONY_GUIDANCE: Readonly<Record<WorkflowProfile, string>> = {
  lite: 'brief -> edit -> targeted test; do not author plan, contract, notes, todos, or checks files (zero ceremony)',
  standard: 'at most one active plan artifact; no contract, notes, or todos scaffolding beyond it',
  strict: 'full envelope: plan, contract, notes, and checks as required',
};

function repoPath(cwd: string, relPath: string): string {
  return join(cwd, relPath);
}

function readTrimmed(cwd: string, relPath: string): string | null {
  try {
    const value = readFileSync(repoPath(cwd, relPath), 'utf-8').trim();
    return value.length > 0 ? stripWrappingQuotes(value) : null;
  } catch {
    return null;
  }
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function fileExists(cwd: string, relPath: string | null | undefined): boolean {
  return Boolean(relPath) && existsSync(repoPath(cwd, relPath as string));
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function getPlanStatus(cwd: string, planPath: string): SnapshotPlanState {
  let content = '';
  try {
    content = readFileSync(repoPath(cwd, planPath), 'utf-8');
  } catch {
    return 'unknown';
  }
  const statusLine = content
    .split(/\r?\n/)
    .find((line) => line.includes('**Status**:'));
  const status = statusLine?.replace(/^.*\*\*Status\*\*:\s*/, '').trim();
  switch (status) {
    case 'Draft':
      return 'draft';
    case 'Annotating':
      return 'annotating';
    case 'Approved':
      return 'approved';
    case 'Executing':
      return 'executing';
    default:
      return 'unknown';
  }
}

function slugFromPlanPath(planPath: string): string | null {
  const base = planPath.split('/').pop() ?? '';
  const match = /^plan-\d{8}-\d{4}-(.+)\.md$/.exec(base);
  return match?.[1] ?? null;
}

function originalArtifactStemFromPlanPath(planPath: string): string | null {
  const base = planPath.split('/').pop() ?? '';
  const match = /^plan-(.+)\.md$/.exec(base);
  return match?.[1] ?? null;
}

function isTransientPlanSlug(slug: string): boolean {
  return /^(think-plan-\d+|codex-plan-\d+|approved-plan-\d+)$/.test(slug);
}

function titleSlugFromPlanFile(cwd: string, planPath: string): string | null {
  let content = '';
  try {
    content = readFileSync(repoPath(cwd, planPath), 'utf-8');
  } catch {
    return null;
  }
  const titleLine = content
    .split(/\r?\n/)
    .find((line) => line.startsWith('# Plan: '));
  const title = titleLine?.replace(/^# Plan:\s*/, '').trim();
  if (!title) return null;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .replace(/-{2,}/g, '-');
  return slug || null;
}

function artifactStemFromPlanPath(cwd: string, planPath: string): string | null {
  const stem = originalArtifactStemFromPlanPath(planPath);
  const slug = slugFromPlanPath(planPath);
  if (!stem || !slug) return null;
  const stampMatch = /^(\d{8}-\d{4})-.+$/.exec(stem);
  if (!stampMatch) return slug;
  if (isTransientPlanSlug(slug)) {
    const titleSlug = titleSlugFromPlanFile(cwd, planPath);
    if (titleSlug && titleSlug !== slug) return `${stampMatch[1]}-${titleSlug}`;
  }
  return stem;
}

function preferredOrLegacyPath(
  cwd: string,
  preferred: string,
  legacy: string,
): string {
  if (fileExists(cwd, preferred) || !fileExists(cwd, legacy)) return preferred;
  return legacy;
}

function deriveContractPath(cwd: string, planPath: string): string | null {
  const stem = artifactStemFromPlanPath(cwd, planPath);
  const slug = slugFromPlanPath(planPath);
  if (!stem || !slug) return null;
  return preferredOrLegacyPath(
    cwd,
    `tasks/contracts/${stem}.contract.md`,
    `tasks/contracts/${slug}.contract.md`,
  );
}

function evidenceContractComplete(cwd: string, planPath: string): boolean {
  let content = '';
  try {
    content = readFileSync(repoPath(cwd, planPath), 'utf-8');
  } catch {
    return false;
  }
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## Evidence Contract\s*$/.test(line));
  if (start < 0) return false;
  const section: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) break;
    section.push(lines[i]);
  }
  if (section.join('').trim().length === 0) return false;
  for (const label of EVIDENCE_LABELS) {
    const line = section.find((candidate) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(
        `^\\s*-\\s*(\\*\\*)?${escaped}(\\*\\*)?\\s*:`,
        'i',
      ).test(candidate);
    });
    if (!line) return false;
    const value = line.slice(line.indexOf(':') + 1).trim();
    if (!value || /^(tbd|todo|n\/a|none|unknown|\.\.\.)$/i.test(value)) {
      return false;
    }
  }
  return true;
}

function policyPath(cwd: string, jqPath: string, fallback: string): string {
  let policy: unknown;
  try {
    policy = JSON.parse(readFileSync(repoPath(cwd, '.ai/harness/policy.json'), 'utf-8'));
  } catch {
    return fallback;
  }
  const value = jqPath
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, policy);
  if (typeof value !== 'string' || value.length === 0) return fallback;
  if (
    value.startsWith('/') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.split('/').includes('..') ||
    !value.startsWith('.ai/harness/')
  ) {
    return fallback;
  }
  return value;
}

function policyString(cwd: string, jqPath: string, fallback: string): string {
  try {
    const policy = JSON.parse(readFileSync(repoPath(cwd, '.ai/harness/policy.json'), 'utf-8')) as unknown;
    const value = jqPath.split('.').filter(Boolean).reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, policy);
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  } catch {
    return fallback;
  }
}

function planStatusForPendingDraft(cwd: string, planPath: string): string {
  if (!fileExists(cwd, planPath)) return '';
  const state = getPlanStatus(cwd, planPath);
  return state === 'draft' || state === 'annotating' ? state : '';
}

function pendingState(cwd: string, nowMs: number): 'none' | 'fresh' | 'stale' {
  const pendingPath = policyPath(
    cwd,
    '.planning.pending_orchestration_file',
    '.ai/harness/planning/pending.json',
  );
  if (!fileExists(cwd, pendingPath)) return 'none';
  let stat;
  try {
    stat = statSync(repoPath(cwd, pendingPath));
    if (stat.size <= 0) return 'none';
  } catch {
    return 'none';
  }
  const ageSeconds = Math.max(0, Math.floor((nowMs - stat.mtimeMs) / 1000));
  if (ageSeconds <= 259200) return 'fresh';
  let parsed: { draft_plan_path?: unknown } = {};
  try {
    parsed = JSON.parse(readFileSync(repoPath(cwd, pendingPath), 'utf-8'));
  } catch {
    return 'stale';
  }
  const draftPath =
    typeof parsed.draft_plan_path === 'string' ? parsed.draft_plan_path : '';
  if (
    draftPath &&
    planStatusForPendingDraft(cwd, draftPath) &&
    ageSeconds <= 604800
  ) {
    return 'fresh';
  }
  return 'stale';
}

const EFFECTIVE_STATE_CACHE = '.ai/harness/state/effective.json';
const ACTIVE_SPRINT_MARKER = '.ai/harness/sprint/active-sprint';
const HANDOFF_PATH = '.ai/harness/handoff/current.md';
const RESUME_PATH = '.ai/harness/handoff/resume.md';
const CURRENT_SNAPSHOT_PATH = 'tasks/current.md';
const CHECKS_PATH = '.ai/harness/checks/latest.json';
const EFFECTIVE_STATE_LOCK = '.ai/harness/state/effective.lock';

function markdownHeader(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^> \\*\\*${escaped}\\*\\*:\\s*(.+?)\\s*$`, 'mi'));
  return match ? stripWrappingQuotes(match[1].replace(/^`|`$/g, '').trim()) : null;
}

function markdownBullet(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^- ${escaped}:\\s*(.+?)\\s*$`, 'mi'));
  return match ? match[1].replace(/^`|`$/g, '').trim() : null;
}

function markdownSection(content: string, heading: string): string | null {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return null;
  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^## /.test(lines[index])) break;
    section.push(lines[index]);
  }
  return section.join('\n');
}

function markdownSectionHeader(content: string, heading: string, label: string): string | null {
  const section = markdownSection(content, heading);
  return section ? markdownHeader(section, label) : null;
}

function readText(cwd: string, relPath: string | null): string | null {
  if (!relPath) return null;
  try {
    return readFileSync(repoPath(cwd, relPath), 'utf-8');
  } catch {
    return null;
  }
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function sourceHash(cwd: string, relPath: string): string {
  const content = readText(cwd, relPath);
  return content === null ? sha256(`missing:${relPath}`) : sha256(content);
}

function capabilityIdsForPaths(cwd: string, paths: readonly string[]): string[] {
  const text = readText(cwd, '.ai/context/capabilities.json');
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { capabilities?: unknown };
    if (!Array.isArray(parsed.capabilities)) return [];
    const matches = new Set<string>();
    for (const path of paths) {
      let bestLength = -1;
      let best: string[] = [];
      for (const raw of parsed.capabilities) {
        if (!raw || typeof raw !== 'object') continue;
        const candidate = raw as { id?: unknown; prefixes?: unknown };
        if (typeof candidate.id !== 'string' || !Array.isArray(candidate.prefixes)) continue;
        for (const prefix of candidate.prefixes) {
          if (typeof prefix !== 'string') continue;
          const normalized = prefix.replace(/\/$/, '');
          if (path !== normalized && !path.startsWith(`${normalized}/`)) continue;
          if (normalized.length > bestLength) {
            bestLength = normalized.length;
            best = [candidate.id];
          } else if (normalized.length === bestLength) {
            best.push(candidate.id);
          }
        }
      }
      for (const id of best) matches.add(id);
    }
    return [...matches].sort();
  } catch {
    return [];
  }
}

function deriveReviewPath(cwd: string, planPath: string, contractText: string | null): string | null {
  const explicit = contractText ? markdownHeader(contractText, 'Review File') : null;
  if (explicit) return explicit;
  const stem = artifactStemFromPlanPath(cwd, planPath);
  return stem ? `tasks/reviews/${stem}.review.md` : null;
}

function parseAllowedPaths(contractText: string | null): string[] {
  if (!contractText) return [];
  const lines = contractText.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## Allowed Paths\s*$/.test(line));
  if (start < 0) return [];
  const sectionLines: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^## /.test(lines[index])) break;
    sectionLines.push(lines[index]);
  }
  const section = sectionLines.join('\n');
  const fenced = section.match(/```ya?ml\s*([\s\S]*?)```/i)?.[1] ?? section;
  const paths: string[] = [];
  let inAllowedPaths = false;
  for (const line of fenced.split(/\r?\n/)) {
    if (/^allowed_paths:\s*$/.test(line.trim())) {
      inAllowedPaths = true;
      continue;
    }
    if (!inAllowedPaths) continue;
    const item = /^\s+-\s+(.+?)\s*$/.exec(line);
    if (item) paths.push(stripWrappingQuotes(item[1]));
    else if (line.trim() && !/^\s/.test(line)) break;
  }
  return paths;
}

function taskIdFromPlanPath(cwd: string, planPath: string): string | null {
  return artifactStemFromPlanPath(cwd, planPath);
}

function firstOpenTask(planText: string | null): string | null {
  if (!planText) return null;
  const match = planText.match(/^\s*- \[ \]\s+(.+?)\s*$/m);
  return match?.[1] ?? null;
}

function parseIsoOrLocalTimestamp(value: string | null): number | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T')
    : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function contentRevision(sourceHashes: Readonly<Record<string, string>>): string {
  return sha256(JSON.stringify(Object.fromEntries(Object.entries(sourceHashes).sort(([a], [b]) => a.localeCompare(b)))));
}

function versionOwnerPath(cwd: string): string {
  const raw = execFileSync('git', ['rev-parse', '--git-path', 'repo-harness/effective-state-version.json'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return raw.startsWith('/') ? raw : repoPath(cwd, raw);
}

function monotonicStateVersion(cwd: string, revision: string, allocate: boolean): number {
  let target: string;
  try {
    target = versionOwnerPath(cwd);
  } catch (error) {
    if (!allocate) return 0;
    throw error;
  }
  let previous: { version: number; revision: string } | null = null;
  try {
    const parsed = JSON.parse(readFileSync(target, 'utf-8')) as { version?: unknown; revision?: unknown };
    if (!Number.isInteger(parsed.version) || (parsed.version as number) < 1 || typeof parsed.revision !== 'string') {
      throw new Error(`invalid effective-state version owner: ${target}`);
    }
    previous = { version: parsed.version as number, revision: parsed.revision };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!allocate) return previous?.version ?? 0;
  if (previous?.revision === revision) return previous.version;
  const next = { version: (previous?.version ?? 0) + 1, revision };
  mkdirSync(join(target, '..'), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, target);
  return next.version;
}

function writeEffectiveStateCache(cwd: string, state: EffectiveState): void {
  const cachePath = repoPath(cwd, EFFECTIVE_STATE_CACHE);
  const cacheDir = repoPath(cwd, '.ai/harness/state');
  mkdirSync(cacheDir, { recursive: true });
  const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(tempPath, cachePath);
}

function withStateLock<T>(cwd: string, run: () => T): T {
  const lockPath = repoPath(cwd, EFFECTIVE_STATE_LOCK);
  mkdirSync(repoPath(cwd, '.ai/harness/state'), { recursive: true });
  const deadline = Date.now() + 5_000;
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  let fd: number | null = null;
  while (fd === null) {
    try {
      fd = openSync(lockPath, 'wx', 0o600);
      writeFileSync(fd, `${JSON.stringify({ pid: process.pid, created_at: Date.now(), token })}\n`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let reclaim = false;
      try {
        const raw = readFileSync(lockPath, 'utf-8');
        const lock = JSON.parse(raw) as { pid?: unknown; created_at?: unknown };
        const pid = typeof lock.pid === 'number' ? lock.pid : null;
        const createdAt = typeof lock.created_at === 'number' ? lock.created_at : 0;
        let alive = false;
        if (pid !== null && pid > 0) {
          try { process.kill(pid, 0); alive = true; } catch { alive = false; }
        }
        reclaim = Date.now() - createdAt > 30_000 && !alive;
      } catch {
        try { reclaim = Date.now() - statSync(lockPath).mtimeMs > 30_000; } catch { reclaim = false; }
      }
      if (reclaim) {
        try { unlinkSync(lockPath); } catch { /* another resolver reclaimed it */ }
        continue;
      }
      if (Date.now() >= deadline) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try {
    return run();
  } finally {
    closeSync(fd);
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as { token?: unknown };
      if (lock.token === token) unlinkSync(lockPath);
    } catch { /* a reclaimed lock is owned by another resolver */ }
  }
}

function projectSnapshot(state: EffectiveState, cwd: string, nowMs: number): StateSnapshot {
  const planPath = state.authoritative_plan?.path ?? null;
  const markerProblem = state.worktree.freshness === 'stale' && state.worktree.owner
      ? 'foreign_worktree'
      : state.stale_sources.includes('active_plan_marker')
        ? 'deleted'
        : 'none';
  const plan = markerProblem === 'foreign_worktree'
    ? 'foreign_worktree'
    : markerProblem === 'deleted'
      ? 'stale_marker'
      : state.authoritative_plan?.status ?? 'none';
  return {
    protocol: 1,
    kind: 'repo-harness-state-snapshot',
    states: {
      spec: fileExists(cwd, 'docs/spec.md') ? 'present' : 'missing',
      plan,
      pending: pendingState(cwd, nowMs),
      worktree: markerProblem === 'foreign_worktree' ? 'foreign_marker' : 'current',
      contract: state.contract ? 'present' : 'missing',
      contract_path: planPath && deriveContractPath(cwd, planPath) ? 'present' : 'missing',
      evidence: planPath
        ? evidenceContractComplete(cwd, planPath) ? 'complete' : 'incomplete'
        : 'unchecked',
    },
    paths: {
      active_plan: planPath ?? readTrimmed(cwd, ACTIVE_PLAN_MARKER),
      contract: planPath ? deriveContractPath(cwd, planPath) : null,
    },
    marker: { problem: markerProblem },
  };
}

/**
 * Resolve all workflow projections into one fail-closed, versioned state model.
 * Markdown remains the human-editable authority; the JSON cache is only an
 * ignored, atomically replaced read model and never feeds authority back in.
 */
function resolveEffectiveStateUnlocked(
  cwd = process.cwd(),
  nowMs = Date.now(),
  options: { persist: boolean; allocateVersion: boolean; risk?: EffectiveStateRiskInput },
): EffectiveState {
  const currentWorktree = safeRealpath(cwd);
  const preferredMarker = readTrimmed(cwd, ACTIVE_PLAN_MARKER);
  const owner = readTrimmed(cwd, ACTIVE_WORKTREE_MARKER);
  const conflictingSources: string[] = [];
  const staleSources: string[] = [];
  let planPath = preferredMarker;

  if (planPath && !fileExists(cwd, planPath)) {
    staleSources.push('active_plan_marker');
    planPath = null;
  }
  if (owner && safeRealpath(owner) !== currentWorktree) {
    conflictingSources.push('worktree_owner');
    planPath = null;
  }

  const planText = readText(cwd, planPath);
  const planStatus = planPath ? getPlanStatus(cwd, planPath) : 'none';
  const contractPath = planPath ? deriveContractPath(cwd, planPath) : null;
  const contractText = readText(cwd, contractPath);
  const contractStatus = contractText ? markdownHeader(contractText, 'Status') : null;
  const contractPlan = contractText ? markdownHeader(contractText, 'Plan') : null;
  const planContract = planText ? markdownHeader(planText, 'Task Contract') : null;
  if (planPath && contractText && contractPlan && contractPlan !== planPath) {
    conflictingSources.push('contract_plan_relationship');
  }
  if (contractPath && planContract && planContract !== contractPath) {
    conflictingSources.push('plan_contract_relationship');
  }

  const targetBranch = policyString(
    cwd,
    '.worktree_strategy.review_base',
    policyString(
      cwd,
      '.worktree_strategy.merge_back.target',
      policyString(cwd, '.worktree_strategy.base_branch', 'main'),
    ),
  );
  const implementation = buildImplementationDiffFingerprint(cwd, { baseRef: targetBranch });
  const explicitTargetPaths = options.risk?.targetPaths ?? [];
  const implementationPaths = implementation.status === 'ok' ? implementation.paths : [];
  const combinedTargetPaths = Array.from(new Set([...explicitTargetPaths, ...implementationPaths])).sort();
  const observedTargetPaths = combinedTargetPaths.length > 0 ? combinedTargetPaths : undefined;
  const observedCapabilityIds = options.risk?.capabilityIds ?? (
    observedTargetPaths ? capabilityIdsForPaths(cwd, observedTargetPaths) : undefined
  );
  const contractOverride = contractText ? markdownHeader(contractText, 'Workflow Profile') : null;
  const riskResolution = resolveWorkflowProfile({
    targetPaths: observedTargetPaths,
    capabilityIds: observedCapabilityIds,
    capabilityCount: options.risk?.capabilityCount,
    operationKind: options.risk?.operationKind ?? (
      observedTargetPaths && observedTargetPaths.length > 0 ? 'edit' : planPath ? undefined : 'inspect'
    ),
    explicitOverride: options.risk?.explicitOverride ?? (contractOverride as WorkflowProfile | null) ?? undefined,
  });

  const reviewPath = planPath ? deriveReviewPath(cwd, planPath, contractText) : null;
  const reviewText = readText(cwd, reviewPath);
  const recommendation = reviewText ? markdownHeader(reviewText, 'Recommendation') : null;
  const recordedFingerprint = reviewText ? markdownHeader(reviewText, 'Reviewed Diff Fingerprint') : null;
  const externalStatus = reviewText ? markdownHeader(reviewText, 'External Acceptance') : null;
  const externalFingerprint = reviewText
    ? markdownSectionHeader(reviewText, 'External Acceptance Advice', 'Reviewed Diff Fingerprint')
    : null;
  let reviewFreshness: FreshnessState = reviewPath ? 'missing' : 'not_applicable';
  const implementationFingerprint = implementation.status === 'ok' ? implementation.fingerprint : null;
  if (reviewText) {
    if (!recordedFingerprint || recordedFingerprint === 'pending' || !/^sha256:[0-9a-f]{64}$/.test(recordedFingerprint)) {
      reviewFreshness = 'stale';
    } else {
      reviewFreshness = implementation.status === 'ok'
        ? implementation.fingerprint === recordedFingerprint ? 'fresh' : 'stale'
        : 'unavailable';
    }
  }
  if (reviewFreshness === 'stale') staleSources.push('review');
  if (reviewText && externalStatus !== 'pass' && externalStatus !== 'manual_override') {
    staleSources.push('external_acceptance');
  }
  const externalFreshness: FreshnessState = !reviewText
    ? reviewFreshness
    : externalStatus === 'manual_override'
      ? reviewFreshness
      : externalStatus === 'pass' && implementation.status === 'ok' &&
          externalFingerprint === implementation.fingerprint
        ? 'fresh'
        : 'stale';
  if (externalFreshness === 'stale' && !staleSources.includes('external_acceptance')) {
    staleSources.push('external_acceptance');
  }

  const checksText = readText(cwd, CHECKS_PATH);
  let checksStatus: string | null = null;
  let checksPlan: string | null = null;
  let checksFingerprint: string | null = null;
  let checksBaseRef: string | null = null;
  if (checksText) {
    try {
      const checks = JSON.parse(checksText) as {
        status?: unknown;
        active_plan?: unknown;
        diff_base?: { ref?: unknown };
        implementation_fingerprint?: unknown;
      };
      checksStatus = typeof checks.status === 'string' ? checks.status : null;
      checksPlan = typeof checks.active_plan === 'string' ? checks.active_plan : null;
      checksBaseRef = typeof checks.diff_base?.ref === 'string'
        ? checks.diff_base.ref
        : null;
      checksFingerprint = typeof checks.implementation_fingerprint === 'string'
        ? checks.implementation_fingerprint
        : null;
    } catch {
      staleSources.push('checks');
    }
  }
  const checksFreshness: FreshnessState = !checksText
    ? 'missing'
    : checksPlan && planPath && checksPlan === planPath && implementation.status === 'ok' &&
        checksBaseRef === targetBranch && checksFingerprint === implementation.fingerprint
      ? 'fresh'
      : 'stale';
  if (checksFreshness === 'stale' && !staleSources.includes('checks')) staleSources.push('checks');

  const sprintPath = readTrimmed(cwd, ACTIVE_SPRINT_MARKER);
  const sprintFreshness: FreshnessState = !sprintPath
    ? 'not_applicable'
    : fileExists(cwd, sprintPath) ? 'fresh' : 'stale';
  if (sprintFreshness === 'stale') staleSources.push('active_sprint');

  const taskId = planPath ? taskIdFromPlanPath(cwd, planPath) : null;
  const authorityRevision = contentRevision({
    active_plan: sourceHash(cwd, ACTIVE_PLAN_MARKER),
    active_worktree: sourceHash(cwd, ACTIVE_WORKTREE_MARKER),
    plan: planPath ? sourceHash(cwd, planPath) : sha256('missing:plan'),
    contract: contractPath ? sourceHash(cwd, contractPath) : sha256('missing:contract'),
    implementation_diff: implementationFingerprint ?? sha256('unavailable:implementation-diff'),
  });

  const handoffText = readText(cwd, HANDOFF_PATH);
  const handoffTaskId = handoffText
    ? markdownHeader(handoffText, 'Task ID') ?? markdownBullet(handoffText, 'Task ID')
    : null;
  const handoffRevision = handoffText
    ? markdownHeader(handoffText, 'Source State Revision') ?? markdownBullet(handoffText, 'Source State Revision')
    : null;
  const handoffFreshness: FreshnessState = !handoffText
    ? 'missing'
    : taskId && handoffTaskId === taskId && handoffRevision === authorityRevision ? 'fresh' : 'stale';
  if (handoffFreshness === 'stale') staleSources.push('handoff');

  const resumeText = readText(cwd, RESUME_PATH);
  const resumeTaskId = resumeText
    ? markdownHeader(resumeText, 'Task ID') ?? markdownBullet(resumeText, 'Task ID')
    : null;
  const resumeRevision = resumeText
    ? markdownHeader(resumeText, 'Source State Revision') ?? markdownBullet(resumeText, 'Source State Revision')
    : null;
  const resumeHandoffHash = resumeText
    ? markdownHeader(resumeText, 'Handoff Hash') ?? markdownBullet(resumeText, 'Handoff Hash')
    : null;
  const resumeFreshness: FreshnessState = !resumeText
    ? 'missing'
    : taskId && resumeTaskId === taskId && resumeRevision === authorityRevision &&
        resumeHandoffHash === sourceHash(cwd, HANDOFF_PATH)
      ? 'fresh'
      : 'stale';
  if (resumeFreshness === 'stale') staleSources.push('resume');

  const currentText = readText(cwd, CURRENT_SNAPSHOT_PATH);
  const currentPlan = currentText ? markdownBullet(currentText, 'Active Plan') : null;
  const currentUpdated = currentText
    ? parseIsoOrLocalTimestamp(markdownHeader(currentText, 'Updated At'))
    : null;
  const currentFreshness: FreshnessState = !currentText
    ? 'missing'
    : currentUpdated !== null && nowMs - currentUpdated <= 24 * 60 * 60 * 1000 &&
        ((!planPath && (!currentPlan || currentPlan === '(none)')) || currentPlan === planPath)
      ? 'fresh'
      : 'stale';
  if (currentFreshness === 'stale') staleSources.push('current_snapshot');

  const blockers = [...conflictingSources.map((source) => `conflict:${source}`)];
  if (planPath && (planStatus === 'approved' || planStatus === 'executing') && !contractText) {
    blockers.push('missing_contract');
  }
  if (checksFreshness === 'fresh' && checksStatus && checksStatus !== 'pass') blockers.push('checks_failed');
  if (!riskResolution.ok) {
    blockers.push(`workflow_profile:${riskResolution.code.toLowerCase()}`);
  }

  const sourcePaths = [
    ACTIVE_PLAN_MARKER,
    ACTIVE_WORKTREE_MARKER,
    ...(planPath ? [planPath] : []),
    ...(contractPath ? [contractPath] : []),
    ...(reviewPath ? [reviewPath] : []),
    CHECKS_PATH,
    ACTIVE_SPRINT_MARKER,
    ...(sprintPath ? [sprintPath] : []),
    HANDOFF_PATH,
    RESUME_PATH,
    CURRENT_SNAPSHOT_PATH,
  ];
  const sourceHashes = Object.fromEntries(
    Array.from(new Set(sourcePaths)).sort().map((path) => [path, sourceHash(cwd, path)]),
  );
  if (implementationFingerprint) sourceHashes['implementation_diff'] = implementationFingerprint;
  sourceHashes['authority_revision'] = authorityRevision;
  const stateRevision = contentRevision(sourceHashes);
  const stateVersion = monotonicStateVersion(cwd, stateRevision, options.allocateVersion);
  const nextAction = blockers.length > 0
    ? 'resolve blockers'
    : firstOpenTask(planText)
      ?? (handoffFreshness === 'fresh' && handoffText ? markdownBullet(handoffText, 'Exact Next Step') : null);
  const phase = blockers.length > 0
    ? 'blocked'
    : planPath ? planStatus : 'idle';
  const guidance = riskResolution.ok ? CEREMONY_GUIDANCE[riskResolution.profile] : null;

  const state: EffectiveState = {
    protocol: 1,
    kind: 'repo-harness-effective-state',
    task_id: taskId,
    phase,
    state_version: stateVersion,
    state_revision: stateRevision,
    authoritative_plan: planPath ? { path: planPath, status: planStatus } : null,
    contract: contractPath && contractText
      ? { path: contractPath, status: contractStatus, plan: contractPlan }
      : null,
    task_profile: contractText ? markdownHeader(contractText, 'Task Profile') : null,
    workflow_profile: riskResolution.ok ? riskResolution.profile : null,
    requested_workflow_profile: contractOverride,
    risk_floor: riskResolution.riskFloor,
    profile_reasons: riskResolution.reasons,
    profile_signals: riskResolution.ok ? riskResolution.signals : null,
    allowed_paths: parseAllowedPaths(contractText),
    next_action: nextAction,
    guidance,
    blockers,
    stale_sources: Array.from(new Set(staleSources)).sort(),
    conflicting_sources: Array.from(new Set(conflictingSources)).sort(),
    source_hashes: sourceHashes,
    review: {
      path: reviewPath,
      freshness: reviewFreshness,
      recommendation,
      recorded_fingerprint: recordedFingerprint,
    },
    external_acceptance: {
      path: reviewPath,
      freshness: externalFreshness,
      status: externalStatus,
    },
    checks: { path: CHECKS_PATH, freshness: checksFreshness, status: checksStatus },
    active_sprint: { path: sprintPath, freshness: sprintFreshness },
    worktree: {
      path: ACTIVE_WORKTREE_MARKER,
      freshness: owner && safeRealpath(owner) !== currentWorktree ? 'stale' : owner ? 'fresh' : 'missing',
      current: currentWorktree,
      owner,
    },
    handoff: { path: HANDOFF_PATH, freshness: handoffFreshness },
    resume: { path: RESUME_PATH, freshness: resumeFreshness },
    current_snapshot: { path: CURRENT_SNAPSHOT_PATH, freshness: currentFreshness },
  };
  if (options.persist) writeEffectiveStateCache(cwd, state);
  return state;
}


export function resolveEffectiveState(
  cwd = process.cwd(),
  nowMs = Date.now(),
  risk?: EffectiveStateRiskInput,
): EffectiveState {
  return withStateLock(cwd, () => {
    let state = resolveEffectiveStateUnlocked(cwd, nowMs, {
      persist: false,
      allocateVersion: true,
      risk,
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const confirmed = resolveEffectiveStateUnlocked(cwd, nowMs, {
        persist: false,
        allocateVersion: true,
        risk,
      });
      if (JSON.stringify(state.source_hashes) === JSON.stringify(confirmed.source_hashes)) {
        writeEffectiveStateCache(cwd, confirmed);
        return confirmed;
      }
      state = confirmed;
    }
    throw new Error('workflow authority changed repeatedly while resolving effective state');
  });
}

export function buildStateSnapshot(
  cwd = process.cwd(),
  nowMs = Date.now(),
): StateSnapshot {
  return projectSnapshot(resolveEffectiveStateUnlocked(cwd, nowMs, {
    persist: false,
    allocateVersion: false,
    risk: { targetPaths: [], operationKind: 'inspect' },
  }), cwd, nowMs);
}

export interface LegacyActivePlanMigrationResult {
  readonly protocol: 1;
  readonly migrated: boolean;
  readonly legacy_path: typeof LEGACY_ACTIVE_PLAN_MARKER;
  readonly canonical_path: typeof ACTIVE_PLAN_MARKER;
  readonly plan: string | null;
}

/** Explicit one-shot migration; steady-state state resolution never reads legacy authority. */
export function migrateLegacyActivePlan(cwd = process.cwd()): LegacyActivePlanMigrationResult {
  return withStateLock(cwd, () => {
    const legacy = readTrimmed(cwd, LEGACY_ACTIVE_PLAN_MARKER);
    const canonical = readTrimmed(cwd, ACTIVE_PLAN_MARKER);
    if (!legacy) {
      return { protocol: 1, migrated: false, legacy_path: LEGACY_ACTIVE_PLAN_MARKER, canonical_path: ACTIVE_PLAN_MARKER, plan: canonical };
    }
    const currentWorktree = safeRealpath(cwd);
    const owner = readTrimmed(cwd, ACTIVE_WORKTREE_MARKER);
    if (owner && safeRealpath(owner) !== currentWorktree) {
      throw new Error(`legacy active-plan migration blocked by foreign worktree owner: ${owner}`);
    }
    if (canonical && canonical !== legacy) {
      throw new Error(`legacy active-plan conflicts with canonical active-plan: ${legacy} != ${canonical}`);
    }
    if (!fileExists(cwd, legacy)) throw new Error(`legacy active-plan points to missing plan: ${legacy}`);
    mkdirSync(repoPath(cwd, '.ai/harness'), { recursive: true });
    if (!canonical) {
      const target = repoPath(cwd, ACTIVE_PLAN_MARKER);
      const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(temp, `${legacy}\n`);
      renameSync(temp, target);
    }
    if (!owner) writeFileSync(repoPath(cwd, ACTIVE_WORKTREE_MARKER), `${currentWorktree}\n`);
    unlinkSync(repoPath(cwd, LEGACY_ACTIVE_PLAN_MARKER));
    return { protocol: 1, migrated: true, legacy_path: LEGACY_ACTIVE_PLAN_MARKER, canonical_path: ACTIVE_PLAN_MARKER, plan: legacy };
  });
}

export interface StateSnapshotCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function runStateSnapshotCli(
  argv = process.argv.slice(2),
  cwd = process.cwd(),
): StateSnapshotCliResult {
  if (argv.length !== 1 || argv[0] !== '--json') {
    return {
      exitCode: 2,
      stdout: '',
      stderr: 'repo-harness-hook state-snapshot: usage: repo-harness-hook state-snapshot --json\n',
    };
  }
  return {
    exitCode: 0,
    stdout: `${JSON.stringify(buildStateSnapshot(cwd))}\n`,
    stderr: '',
  };
}
