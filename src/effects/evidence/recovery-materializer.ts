/**
 * Recovery-view materialization (Sprint C backlog row 11 / D9 recovery-view
 * minimization / D8 provenance). Single materializer for the two surviving
 * repo-local recovery views -- handoff (`handoff/current.md`) and the merged
 * resume (`handoff/resume.md`) -- plus the task-handoff payload (the
 * Codex-global packet's per-repo section).
 *
 * Single-hop discipline: every EVIDENCE claim in a rendered view traces to
 * `resolveLastPublishedCheckpoint`'s already-validated projection (EPC-06,
 * read-only import) -- this module never reads `.ai/harness/checks/*` or the
 * event ledger directly. Workflow CONTEXT (goal, next step, changed files,
 * branch, HEAD, issue) is a different kind
 * of fact -- "where work stands," not "what was proven" -- and is read fresh
 * from the live repo on every call, exactly as the retired writers did.
 *
 * Determinism: `renderRecoveryHandoff`/`renderRecoveryResume` are pure
 * functions of (context, evidence, now) -- the same inputs
 * (including the same injected clock) always render the same bytes.
 * `content_hash` inside each view's own Provenance block is computed over
 * that view's body EXCLUDING the Provenance block itself (mirrors
 * `checkpoint.ts`'s `bodyAsJson` exclusion), so the volatile `generated_at`
 * line never perturbs the hash.
 */
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { escapeDecisionMarkdown, type CheckpointDecision } from '../../core/evidence/checkpoint';
import { resolveHarnessPaths } from '../state/resolve-effective-state';
import {
  CheckpointResolutionError,
  resolveLastPublishedCheckpoint,
} from './checkpoint-store';
import { gitExecFileSync } from '../git/runner';

export const RECOVERY_SCHEMA_VERSION = 1;
export const RECOVERY_MATERIALIZER_VERSION = '1';

/**
 * Preserved verbatim as the merged resume view's identity marker. This is
 * NOT a compatibility shim for a retired dual-writer path -- there is
 * exactly one writer of `resume.md` going forward. It is a stable,
 * documented external-observable-contract string that
 * `src/cli/hook/session-context.ts`'s `resumeAvailable()` (an EPC-08
 * SessionStart internal, out of this package's scope beyond a filename-level
 * reference) already greps for. The `## Provenance` block below is the real,
 * machine-checkable materializer identity; this legacy marker is a stable
 * display-compatible discriminator, exactly the same "internal swap,
 * external semantics frozen" principle already applied to the Stop
 * handler's own shape.
 */
export const LEGACY_RESUME_MARKER = '<!-- generated-by: repo-harness codex-handoff-resume v1 -->';

// ---------------------------------------------------------------------------
// Small generic helpers. Duplicated deliberately rather than imported across
// module boundaries, matching this repo's established convention for tiny
// generic helpers (see the retired verify producer/`attested-import.ts`'s duplicated
// `sha256Hex`/`gitOutput`, each documented "necessarily
// duplicated, not imported").
// ---------------------------------------------------------------------------

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDisplay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function yymmdd(date: Date): string {
  return `${String(date.getFullYear()).slice(-2)}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

// ---------------------------------------------------------------------------
// Workflow context (ported verbatim from `stop-handler.ts`'s prior private
// `projection()` helpers -- single source of truth going forward; the Stop
// handler now imports these instead of keeping its own copies).
// ---------------------------------------------------------------------------

export interface RecoveryRepositoryIdentity {
  readonly branch: string;
  readonly head: string;
  /** The GitHub issue in `<type>/<number>-<slug>`; null when the branch has none. */
  readonly issue: number | null;
}

function gitValue(repoRoot: string, args: readonly string[]): string {
  try {
    return gitExecFileSync(['-C', repoRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** Parse only `<type>/<number>-<slug>`; never infer an issue from anything else. */
function issueFromBranch(branch: string): number | null {
  const match = /^[^/]+\/(\d+)(?:-|$)/.exec(branch);
  if (!match) return null;
  const issue = Number(match[1]);
  return Number.isSafeInteger(issue) && issue > 0 ? issue : null;
}

/** Current branch, HEAD and branch-derived issue; unknown when Git cannot answer. */
export function resolveRecoveryRepository(repoRoot: string): RecoveryRepositoryIdentity {
  const declaredBranch = gitValue(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = declaredBranch === 'HEAD' ? '(detached)' : declaredBranch || '(unknown)';
  return {
    branch,
    head: gitValue(repoRoot, ['rev-parse', 'HEAD']) || '(unknown)',
    issue: issueFromBranch(branch),
  };
}

export interface RecoveryStatus extends RecoveryRepositoryIdentity {
  readonly handoff: string;
  readonly resume: string;
}

/** The repository identity and view paths, without rendering a view. */
export function recoveryStatus(repoRoot: string): RecoveryStatus {
  const paths = resolveHarnessPaths(repoRoot);
  return { ...resolveRecoveryRepository(repoRoot), handoff: paths.handoff, resume: paths.resume };
}

function changedFiles(repoRoot: string): { files: string; summary: string } {
  try {
    const tracked = gitExecFileSync(['-C', repoRoot, 'diff', '--name-only', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const untrackedRaw = gitExecFileSync(['-C', repoRoot, 'ls-files', '--others', '--exclude-standard'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const files = [...new Set(`${tracked}\n${untrackedRaw}`.split('\n').map((line) => line.trim()).filter(Boolean))].sort();
    const visible = files.length > 80 ? [...files.slice(0, 80), `... (${files.length} total changed/untracked paths; inspect git status --short)`] : files;

    // A human-readable tracked-diff shortstat plus an explicit untracked
    // count, not a flat "N changed/untracked paths" total.
    let diffStat = '';
    try {
      diffStat = gitExecFileSync(['-C', repoRoot, 'diff', '--shortstat', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).replace(/\n/g, '');
    } catch {
      diffStat = '';
    }
    const untrackedCount = untrackedRaw.split('\n').map((line) => line.trim()).filter(Boolean).length;
    const summary = untrackedCount > 0
      ? `${diffStat || 'no tracked diff'}; ${untrackedCount} untracked files`
      : (diffStat || 'no uncommitted diff against HEAD');

    return {
      files: visible.length > 0 ? visible.join('\n') : '(none)',
      summary,
    };
  } catch {
    return { files: '(none)', summary: 'git repository not detected' };
  }
}

function latestGlobalHandoff(codexHome: string): string {
  try {
    const dir = join(codexHome, 'handoffs');
    if (!existsSync(dir)) return '';
    const entries = execFileSync('find', [dir, '-maxdepth', '1', '-type', 'f', '-name', 'handoff-*.md'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n').map((line) => line.trim()).filter(Boolean).sort();
    return entries.length > 0 ? entries[entries.length - 1]! : '';
  } catch {
    return '';
  }
}

export interface RecoveryWorkflowContext {
  readonly repoRoot: string;
  readonly reason: string;
  /** The hook identity's run; null when the host sent none. */
  readonly runId: string | null;
  readonly generatedAtDisplay: string;
  readonly generatedAtIso: string;
  readonly workingDirectory: string;
  readonly repository: RecoveryRepositoryIdentity;
  readonly nextTask: string;
  readonly goal: string;
  readonly changed: { readonly files: string; readonly summary: string };
  readonly paths: {
    readonly handoff: string;
    readonly resume: string;
    readonly policyFile: string;
    readonly contextMap: string;
    readonly researchDir: string;
  };
  readonly globalHandoffPath: string;
}

export interface BuildRecoveryContextOptions {
  readonly reason?: string;
  readonly now?: () => Date;
  readonly codexHome?: string;
  /** The hook identity's run. Nothing mints one; a missing run renders as `(unresolved)`. */
  readonly runId?: string | null;
}

/** The "minimal live workflow context" a recovery view legitimately needs
 * (recovery is about where work stands, not only what was proven). Reads
 * fresh from the live repo on every call -- never cached, never itself an
 * evidence claim. */
export function buildRecoveryContext(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  options: BuildRecoveryContextOptions = {},
): RecoveryWorkflowContext {
  const now = (options.now ?? (() => new Date()))();
  const reason = options.reason ?? 'session-stop';
  const harnessPaths = resolveHarnessPaths(repoRoot);
  const runId = options.runId ?? null;
  const repository = resolveRecoveryRepository(repoRoot);
  const changed = changedFiles(repoRoot);
  const goal = repository.issue !== null
    ? `Continue GitHub issue #${repository.issue} on branch ${repository.branch}.`
    : repository.branch !== '(unknown)' && repository.branch !== '(detached)'
      ? `Continue work on branch ${repository.branch}.`
      : 'Continue from the latest user request and filesystem state.';
  const nextTask = repository.issue !== null
    ? `Continue GitHub issue #${repository.issue}; read the issue and filesystem state.`
    : 'Continue from the latest user request and filesystem state.';
  const codexHome = options.codexHome ?? env.CODEX_HOME ?? join(env.HOME ?? '', '.codex');

  return {
    repoRoot,
    reason,
    runId,
    generatedAtDisplay: formatDisplay(now),
    generatedAtIso: now.toISOString(),
    workingDirectory: repoRoot,
    repository,
    nextTask,
    goal,
    changed,
    paths: {
      handoff: harnessPaths.handoff,
      resume: harnessPaths.resume,
      policyFile: '.ai/harness/policy.json',
      contextMap: harnessPaths.contextMap,
      researchDir: harnessPaths.researchDir,
    },
    globalHandoffPath: latestGlobalHandoff(codexHome),
  };
}

// ---------------------------------------------------------------------------
// Evidence (single hop: checkpoint -> view; never checks/* or the ledger
// directly).
// ---------------------------------------------------------------------------

export interface RecoveryEvidenceLatestByType {
  readonly event_type: string;
  readonly event_id: string;
  readonly trust_class: string;
  readonly created_at: string;
}

export type RecoveryEvidence =
  | {
      readonly available: true;
      readonly checkpointId: string;
      readonly worktreeId: string;
      readonly generatedAt: string;
      readonly coveredEventCount: number;
      readonly sourceEventIds: readonly string[];
      readonly latestByEventType: readonly RecoveryEvidenceLatestByType[];
      readonly decisions?: readonly CheckpointDecision[];
    }
  | {
      readonly available: false;
      readonly reason: 'no-checkpoint' | 'checkpoint-invalid';
      readonly detail?: string;
    };

/**
 * Resolves the last-published checkpoint for use as this materializer's
 * sole evidence source. `resolveLastPublishedCheckpoint` itself stays
 * fail-closed/unmodified (throws `CheckpointResolutionError` on a dangling
 * marker) -- this is a consumer-side catch: a recovery view must never crash
 * Stop over a stale/invalid marker, so both "no checkpoint published yet"
 * and "marker present but invalid" degrade to the same typed
 * `available: false` shape a renderer can safely show as a minimal state,
 * never fabricating an evidence claim.
 */
export function resolveRecoveryEvidence(repoRoot: string): RecoveryEvidence {
  try {
    const result = resolveLastPublishedCheckpoint(repoRoot);
    if (!result.found) return { available: false, reason: 'no-checkpoint' };
    const { projection } = result.resolved;
    return {
      available: true,
      checkpointId: projection.checkpoint_id,
      worktreeId: projection.worktree_id,
      generatedAt: projection.provenance.generated_at,
      coveredEventCount: projection.covered_event_count,
      sourceEventIds: projection.provenance.source_event_ids,
      decisions: projection.decisions ?? [],
      latestByEventType: projection.latest_by_event_type.map((entry) => ({
        event_type: entry.event_type,
        event_id: entry.event_id,
        trust_class: entry.trust_class,
        created_at: entry.created_at,
      })),
    };
  } catch (error) {
    if (error instanceof CheckpointResolutionError) {
      return { available: false, reason: 'checkpoint-invalid', detail: error.message };
    }
    throw error;
  }
}

function evidenceLines(evidence: RecoveryEvidence): string[] {
  const lines: string[] = [];
  if (evidence.available) {
    lines.push(`- Checkpoint: ${evidence.checkpointId} (generated ${evidence.generatedAt})`);
    lines.push(`- Covered events: ${evidence.coveredEventCount}`);
    lines.push('- Latest by type:');
    if (evidence.latestByEventType.length === 0) {
      lines.push('  (none)');
    } else {
      for (const entry of evidence.latestByEventType) {
        lines.push(`  - ${entry.event_type}: ${entry.event_id} (${entry.trust_class}, accepted ${entry.created_at})`);
      }
    }
  } else if (evidence.reason === 'no-checkpoint') {
    lines.push('- Checkpoint: (none published yet -- no ledger evidence recorded in this worktree)');
    lines.push('- Covered events: 0');
    lines.push('- Latest by type:');
    lines.push('  (none)');
  } else {
    lines.push(`- Checkpoint: (unavailable -- last-published checkpoint failed validation: ${evidence.detail ?? evidence.reason})`);
    lines.push('- Covered events: 0');
    lines.push('- Latest by type:');
    lines.push('  (none)');
  }
  return lines;
}

// ---------------------------------------------------------------------------
// D8 provenance.
// ---------------------------------------------------------------------------

export interface RecoveryProvenance {
  readonly schema_version: number;
  readonly generated_at: string;
  readonly materializer_version: string;
  readonly source_event_ids: readonly string[];
  readonly source_checkpoint_id: string | null;
  readonly subject_hash: null;
  readonly content_hash: string;
  readonly worktree_id: string;
  readonly contract_id: null;
}

function buildProvenance(
  context: RecoveryWorkflowContext,
  evidence: RecoveryEvidence,
  body: string,
): RecoveryProvenance {
  return {
    schema_version: RECOVERY_SCHEMA_VERSION,
    generated_at: context.generatedAtIso,
    materializer_version: RECOVERY_MATERIALIZER_VERSION,
    source_event_ids: evidence.available ? evidence.sourceEventIds : [],
    source_checkpoint_id: evidence.available ? evidence.checkpointId : null,
    subject_hash: null,
    content_hash: `sha256:${sha256Hex(body)}`,
    worktree_id: evidence.available ? evidence.worktreeId : 'unbound',
    contract_id: null,
  };
}

function renderProvenanceSection(provenance: RecoveryProvenance): string[] {
  return [
    '## Provenance',
    '',
    `- Schema version: ${provenance.schema_version}`,
    `- Generated at: ${provenance.generated_at}`,
    `- Materializer version: ${provenance.materializer_version}`,
    `- Source checkpoint id: ${provenance.source_checkpoint_id ?? '(none -- no checkpoint published yet)'}`,
    `- Source event ids: ${provenance.source_event_ids.length > 0 ? `${provenance.source_event_ids.length} covered` : '(none)'}`,
    '- Subject hash: (none -- recovery view is not subject-bound)',
    `- Worktree: ${provenance.worktree_id}`,
    '- Contract: (none -- recovery view is not contract-bound)',
    `- Content hash: ${provenance.content_hash}`,
  ];
}

// ---------------------------------------------------------------------------
// Renderers (pure: no fs, no process -- everything comes from the context +
// evidence already resolved by the caller).
// ---------------------------------------------------------------------------

function decisionLines(evidence: RecoveryEvidence): string[] {
  if (!evidence.available || !evidence.decisions?.length) return ['- (none recorded)'];
  return evidence.decisions.map(row => {
    const cells = [
      `${row.created_at} [${escapeDecisionMarkdown(row.phase)}] ${escapeDecisionMarkdown(row.decision)}`,
      `Why: ${escapeDecisionMarkdown(row.why)}`,
      `Evidence: ${row.evidence.map(escapeDecisionMarkdown).join('; ')}`,
      `Result: ${escapeDecisionMarkdown(row.result)}`,
      `Event: ${row.event_id}`,
      ...(row.supersedes.length ? [`Supersedes: ${row.supersedes.join(', ')}`] : []),
    ];
    return `- ${cells.join('; ')}`;
  });
}

export function renderRecoveryHandoff(
  context: RecoveryWorkflowContext,
  evidence: RecoveryEvidence,
): string {
  const bodyLines = [
    '# Harness Handoff',
    '',
    `> **Generated**: ${context.generatedAtDisplay}`,
    `> **Reason**: ${context.reason}`,
    '',
    '## Goal',
    '',
    context.goal,
    '',
    '## Decisions',
    '',
    ...decisionLines(evidence),
    '',
    '## Files Touched',
    '',
    '```',
    context.changed.files,
    '```',
    '',
    '## Evidence',
    '',
    ...evidenceLines(evidence),
    '',
    '## Blockers',
    '',
    '- (none recorded)',
    '',
    '## Repository',
    '',
    `- Branch: ${context.repository.branch}`,
    `- HEAD: ${context.repository.head}`,
    `- Issue: ${context.repository.issue ?? 'none'}`,
    `- Resume packet: ${context.paths.resume}`,
    '',
    '## Exact Next Step',
    '',
    `- ${context.nextTask}`,
    '',
    '## Resume Prompt',
    '',
    `- Resume packet: ${context.paths.resume}`,
    '- Start a fresh Codex session and read source artifacts first, then this handoff, before continuing; do not rely on auto-compact.',
    '',
    '## Source Artifacts',
    '',
    '- Spec: docs/spec.md',
    `- Resume Packet: ${context.paths.resume}`,
    `- Policy: ${context.paths.policyFile}`,
    `- Context Map: ${context.paths.contextMap}`,
    '',
    '## Current Status',
    '',
    `- Working tree: ${context.changed.summary}`,
    `- Parent Run ID: ${context.runId ?? '(unresolved)'}`,
    '',
    '## Changed Files',
    '',
    '```',
    context.changed.files,
    '```',
    '',
  ];
  const body = `${bodyLines.join('\n')}`;
  const provenance = buildProvenance(context, evidence, body);
  return `${body}\n${renderProvenanceSection(provenance).join('\n')}\n`;
}

export function renderRecoveryResume(
  context: RecoveryWorkflowContext,
  evidence: RecoveryEvidence,
): string {
  const bodyLines = [
    '# Codex Resume Packet',
    LEGACY_RESUME_MARKER,
    '',
    `> **Generated**: ${context.generatedAtDisplay}`,
    `> **Reason**: ${context.reason}`,
    `> **Working Directory**: ${context.workingDirectory}`,
    '',
    '## Repository',
    '',
    `- Branch: ${context.repository.branch}`,
    `- HEAD: ${context.repository.head}`,
    `- Issue: ${context.repository.issue ?? 'none'}`,
    '',
    '## Resume Prompt',
    '',
    'You are starting a fresh Codex session for an existing long-running task. Do not rely on prior chat history or Codex auto-compact. First read the source artifacts listed below, then continue from the exact next step in the repo handoff.',
    '',
    'Current prompt files first:',
    '- If the current user message lists files under `# Files mentioned by the user`, references `pasted-text.txt`, or includes an explicit attachment/file path, read those current-input files before the repo recovery artifacts below.',
    '- Use handoff, resume, and `tasks/current.md` as recovery context only; they do not outrank the current user message.',
    '',
    'Required first reads:',
    '- AGENTS.md',
    `- ${context.paths.handoff}`,
    `- ${context.paths.researchDir}/`,
    '',
    'Conditional first reads:',
    `- Global handoff: ${context.globalHandoffPath || '(none)'}`,
    '',
    'Execution rules:',
    '- Treat filesystem artifacts as the source of truth.',
    '- For delegated research, use the herdr skill to direct an agent in an explicitly addressed Herdr pane. Otherwise perform a bounded read-only main-thread trace; missing Herdr never selects native children or direct harness exec. Keep history as observation and close only the panes you created at task completion.',
    `- Keep deep research conclusions in \`${context.paths.researchDir}/\`, not only in chat.`,
    '- Do not run `/compact` as the primary recovery path.',
    '- Preserve the current dirty worktree and do not touch unrelated untracked files.',
    '',
    '## Source Artifacts',
    '',
    `- Repo handoff: ${context.paths.handoff}`,
    `- Resume packet: ${context.paths.resume}`,
    `- Research: ${context.paths.researchDir}/`,
    `- Global handoff: ${context.globalHandoffPath || '(none)'}`,
    '',
  ];
  const body = `${bodyLines.join('\n')}`;
  const provenance = buildProvenance(context, evidence, body);
  return `${body}\n${renderProvenanceSection(provenance).join('\n')}\n`;
}

/** Extracts just the "## Resume Prompt" section body, matching
 * `codex-handoff-resume.sh --print-prompt`'s existing awk/sed behavior. */
export function extractResumePrompt(resumeText: string): string {
  const lines = resumeText.split('\n');
  const out: string[] = [];
  let printing = false;
  for (const line of lines) {
    if (line === '## Resume Prompt') {
      printing = true;
      continue;
    }
    if (line === '## Source Artifacts') break;
    if (printing) out.push(line);
  }
  while (out.length > 0 && out[0] === '') out.shift();
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Task-handoff payload (Codex-global packet). MERGE-payload verdict: this
// becomes an additional output target of the same single materializer
// rather than `prepare-codex-handoff.sh`'s own independent Node/Python
// heredoc.
// ---------------------------------------------------------------------------

export function repoKeyFor(repoPath: string): string {
  return createHash('sha1').update(repoPath, 'utf-8').digest('hex').slice(0, 12);
}

function capText(text: string, limit = 8000): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}...`;
}

export function renderGlobalHandoffSection(params: {
  readonly repoPath: string;
  readonly repoKey: string;
  readonly reason: string;
  readonly repoHandoffRelative: string;
  readonly resumeFileRelative: string;
  readonly handoffText: string;
  readonly resumeText: string;
  readonly now: Date;
}): string {
  const start = `<!-- repo:${params.repoKey} start -->`;
  const end = `<!-- repo:${params.repoKey} end -->`;
  const lines = [
    start,
    `## ${formatDisplay(params.now)} ${basename(params.repoPath)}`,
    '',
    `- cwd: \`${params.repoPath}\``,
    `- reason: \`${params.reason}\``,
    `- repo_handoff: \`${params.repoHandoffRelative}\``,
    `- resume_packet: \`${params.resumeFileRelative}\``,
    '',
    '### Repo Handoff',
    '',
    capText(params.handoffText).trim(),
    '',
    '### Resume Packet',
    '',
    capText(params.resumeText).trim(),
    '',
    end,
    '',
  ];
  return lines.join('\n');
}

/** Splices `section` into the rolling per-day global handoff file, replacing
 * this repo's own prior section (by `repoKey`) or appending a new one --
 * exact port of `prepare-codex-handoff.sh`'s Node/Python heredoc logic. */
export function updateGlobalHandoffFile(codexHome: string, repoKey: string, section: string, now: () => Date = () => new Date()): string {
  const globalDir = join(codexHome, 'handoffs');
  mkdirSync(globalDir, { recursive: true });
  const globalFile = join(globalDir, `handoff-${yymmdd(now())}.md`);
  const start = `<!-- repo:${repoKey} start -->`;
  const end = `<!-- repo:${repoKey} end -->`;
  const header = `# Codex Handoff ${yymmdd(now())}\n\nFilesystem-first fallback handoffs for compact-independent Codex sessions.\n\n`;

  let content = existsSync(globalFile) ? readFileSync(globalFile, 'utf-8') : header;
  const startIdx = content.indexOf(start);
  if (startIdx >= 0 && content.includes(end)) {
    const afterStart = content.slice(startIdx + start.length);
    const endIdx = afterStart.indexOf(end);
    const prefix = content.slice(0, startIdx);
    const suffix = afterStart.slice(endIdx + end.length).replace(/^\n+/, '');
    content = prefix + section + suffix;
  } else {
    if (!content.endsWith('\n')) content += '\n';
    content += section;
  }
  writeFileSync(globalFile, content, 'utf-8');
  return globalFile;
}

// ---------------------------------------------------------------------------
// Orchestrator: content only, no disk write for handoff/resume themselves --
// callers keep their own write path (the Stop handler's `atomicWrite`, or the
// recovery-view-cli adapter's writer).
// ---------------------------------------------------------------------------

export interface MaterializeRecoveryViewsResult {
  readonly handoff: string;
  readonly resume: string;
  readonly context: RecoveryWorkflowContext;
  readonly evidence: RecoveryEvidence;
}

export function materializeRecoveryViews(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  options: BuildRecoveryContextOptions = {},
): MaterializeRecoveryViewsResult {
  const context = buildRecoveryContext(repoRoot, env, options);
  const evidence = resolveRecoveryEvidence(repoRoot);
  return {
    handoff: renderRecoveryHandoff(context, evidence),
    resume: renderRecoveryResume(context, evidence),
    context,
    evidence,
  };
}
