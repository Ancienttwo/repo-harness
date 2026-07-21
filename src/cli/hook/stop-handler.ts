/**
 * HRD-06 in-process Stop handler.
 *
 * Ordering is deliberate: pending PostEdit events are flushed, then the
 * recovery projection is committed, and only then is canonical Effective
 * State resolved once. The recovery pair must exist before readiness checks
 * `durable_recovery_state` on a repository's first Stop.
 */
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { randomBytes } from 'crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { execFileSync } from 'child_process';
import type { EffectiveState } from '../../core/state/types';
import {
  delegationScope,
  type DelegationScope,
  withDelegationStateTransaction,
} from './delegation-state';
import { consumePendingPostEditEvents } from './mutation-observed';
import { runMinimalChangeCli } from './minimal-change-cli';

export interface StopCollector {
  getRepoRoot(): string;
  getWorktreeOwnership(): { readonly owner: string | null; readonly ownedByCurrent: boolean };
  getActivePlanMarker(): string | null;
  getStopEffectiveState(): EffectiveState | null;
}

export interface StopProjectionTarget {
  readonly kind: 'handoff' | 'resume' | 'event' | 'run-summary';
  readonly path: string;
}

export interface StopHandlerDependencies {
  readonly now?: () => Date;
  readonly observeProjectionWrite?: (target: StopProjectionTarget) => void;
  /** Invoked once after the complete Stop projection batch commits. */
  readonly observeProjectionTransaction?: () => void;
  readonly beforeDelegationLock?: () => void;
}

export interface StopHandlerInput {
  readonly collector: StopCollector;
  readonly input?: string | Buffer;
  readonly env?: NodeJS.ProcessEnv;
  readonly dependencies?: StopHandlerDependencies;
}

export interface StopHandlerResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface StopPayload {
  readonly stop_hook_active?: unknown;
  readonly last_assistant_message?: unknown;
  readonly turn_id?: unknown;
  readonly run_id?: unknown;
  readonly session_id?: unknown;
  readonly transcript_path?: unknown;
}

interface MinimalChangeReview {
  readonly suffix: string;
  readonly summary: string;
}

interface ProjectionPaths {
  readonly handoff: string;
  readonly resume: string;
  readonly events: string;
  readonly runSummary: string;
}

interface NextAction {
  readonly stage: string;
  readonly command: string;
  readonly message: string;
}

function parsePayload(input: string | Buffer | undefined): StopPayload {
  if (input === undefined) return {};
  const text = input.toString().trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed as StopPayload : {};
  } catch {
    return {};
  }
}

function policy(repoRoot: string): Record<string, unknown> {
  try {
    const value = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/policy.json'), 'utf8'));
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function nestedString(root: Record<string, unknown>, keys: readonly string[]): string {
  let value: unknown = root;
  for (const key of keys) {
    if (!value || typeof value !== 'object') return '';
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'string' ? value : '';
}

function safeHarnessPath(value: string, fallback: string): string {
  if (!value || isAbsolute(value) || value.includes('\\') || value.includes('\n') || value.includes('\r')) return fallback;
  if (value === '..' || value.startsWith('../') || value.includes('/../')) return fallback;
  if (!value.startsWith('.ai/harness/')) return fallback;
  return value;
}

function runId(env: NodeJS.ProcessEnv, now: Date): string {
  return env.HOOK_RUN_ID
    ?? env.CLAUDE_RUN_ID
    ?? env.CODEX_RUN_ID
    ?? `run-${formatCompact(now)}-${process.pid}`;
}

function formatCompact(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function formatDisplay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatOffset(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(absolute / 60))}${pad(absolute % 60)}`;
}

function declaredPath(repoRoot: string, plan: string, label: string): string {
  if (!plan || !existsSync(join(repoRoot, plan))) return '';
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = readFileSync(join(repoRoot, plan), 'utf8').match(new RegExp(`^> \\*\\*${escaped}\\*\\*:\\s*(.+)$`, 'm'));
  return match?.[1]?.replace(/`/g, '').trim() ?? '';
}

function activeArtifacts(repoRoot: string, activePlan: string | null): {
  plan: string;
  contract: string;
  review: string;
  notes: string;
} {
  const plan = activePlan && existsSync(join(repoRoot, activePlan)) ? activePlan : '';
  const stem = plan ? basename(plan).replace(/^plan-/, '').replace(/\.md$/, '') : '';
  const derived = (directory: string, suffix: string): string => {
    if (!stem) return '';
    const candidate = `${directory}/${stem}${suffix}`;
    return existsSync(join(repoRoot, candidate)) ? candidate : '';
  };
  return {
    plan,
    contract: declaredPath(repoRoot, plan, 'Task Contract') || declaredPath(repoRoot, plan, 'Sprint Contract') || derived('tasks/contracts', '.contract.md'),
    review: declaredPath(repoRoot, plan, 'Task Review') || declaredPath(repoRoot, plan, 'Sprint Review') || derived('tasks/reviews', '.review.md'),
    notes: declaredPath(repoRoot, plan, 'Implementation Notes') || declaredPath(repoRoot, plan, 'Notes File') || derived('tasks/notes', '.notes.md'),
  };
}

function metadataValue(path: string, label: string): string {
  try {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = readFileSync(path, 'utf8').match(new RegExp(`^> \\*\\*${escaped}\\*\\*:\\s*(.+)$`, 'm'));
    return match?.[1]?.replace(/`/g, '').trim() ?? '';
  } catch {
    return '';
  }
}

function todoSourcePlan(repoRoot: string): string {
  const value = metadataValue(join(repoRoot, 'tasks/todos.md'), 'Source Plan');
  return value === '(none)' ? '' : value;
}

function activeSprintRow(repoRoot: string, activePlan: string): string {
  let sprint = '';
  try {
    sprint = readFileSync(join(repoRoot, '.ai/harness/sprint/active-sprint'), 'utf8').trim();
  } catch {
    return '(none)';
  }
  if (!sprint || sprint.startsWith('/') || sprint === '..' || sprint.startsWith('../') || sprint.includes('/../')) return '(none)';
  try {
    const row = readFileSync(join(repoRoot, sprint), 'utf8')
      .split('\n')
      .find((line) => /^\|\s*\d+\s*\|/.test(line) && activePlan && line.includes(activePlan));
    return row || `Active sprint: ${sprint}`;
  } catch {
    return '(none)';
  }
}

function firstTaskBreakdown(planText: string): { total: number; done: number; next: string } {
  const lines = planText.split('\n');
  let inSection = false;
  let total = 0;
  let done = 0;
  let next = '';
  for (const line of lines) {
    if (!inSection && /^## Task Breakdown\s*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) break;
    const match = inSection ? line.match(/^\s*-\s*\[([ xX])\]\s+(.+)$/) : null;
    if (!match) continue;
    total += 1;
    if (match[1].toLowerCase() === 'x') done += 1;
    else if (!next) next = match[2].replace(/\r/g, '');
  }
  return { total, done, next };
}

function nextAction(repoRoot: string, artifacts: ReturnType<typeof activeArtifacts>): NextAction {
  if (!artifacts.plan) return { stage: 'none', command: '', message: '(none)' };
  let taskState = { total: 0, done: 0, next: '' };
  try {
    taskState = firstTaskBreakdown(readFileSync(join(repoRoot, artifacts.plan), 'utf8'));
  } catch {
    // Missing/unreadable plan is treated as no active execution checklist.
  }
  if (taskState.total > taskState.done) {
    const pending = taskState.next || 'continue active plan Task Breakdown';
    return {
      stage: 'task',
      command: '',
      message: `If a major module was just completed, stage its coherent diff first; then continue the next Task Breakdown item: ${pending}`,
    };
  }
  return {
    stage: 'check',
    command: '/check',
    message: 'Stage the completed module diff first; then run /check and let canonical workflow gates determine whether review, external acceptance, verification, or worktree finish is next.',
  };
}

function recentCommands(repoRoot: string): string {
  try {
    const lines = readFileSync(join(repoRoot, '.claude/.trace.jsonl'), 'utf8').trimEnd().split('\n').slice(-5);
    return lines.length > 0 && lines.some(Boolean) ? lines.map((line) => `- ${line}`).join('\n') : '- (none captured)';
  } catch {
    return '- (none captured)';
  }
}

function latestTrace(repoRoot: string, checksRel: string): string {
  const checks = readJson(join(repoRoot, checksRel));
  return typeof checks?.run_file === 'string' && checks.run_file ? checks.run_file : checksRel;
}

function supersededPlan(repoRoot: string): string {
  const state = readJson(join(repoRoot, '.claude/.task-state.json'));
  return typeof state?.source_plan === 'string' && state.source_plan ? state.source_plan : '(none)';
}

function changedFiles(repoRoot: string): { files: string; summary: string } {
  try {
    const tracked = execFileSync('git', ['-C', repoRoot, 'diff', '--name-only', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const untracked = execFileSync('git', ['-C', repoRoot, 'ls-files', '--others', '--exclude-standard'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const files = [...new Set(`${tracked}\n${untracked}`.split('\n').map((line) => line.trim()).filter(Boolean))].sort();
    const visible = files.length > 80 ? [...files.slice(0, 80), `... (${files.length} total changed/untracked paths; inspect git status --short)`] : files;
    return {
      files: visible.length > 0 ? visible.join('\n') : '(none)',
      summary: files.length > 0 ? `${files.length} changed/untracked paths` : 'no uncommitted diff against HEAD',
    };
  } catch {
    return { files: '(none)', summary: 'git repository not detected' };
  }
}

function assertSafeRepoWritePath(repoRoot: string, path: string): void {
  const root = resolve(repoRoot);
  const target = resolve(path);
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`stop-handler: write path escapes repository: ${path}`);
  }
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    if (!existsSync(current)) continue;
    const entry = lstatSync(current);
    if (entry.isSymbolicLink()) throw new Error(`stop-handler: symlinked write path is forbidden: ${current}`);
    if (current !== target && !entry.isDirectory()) {
      throw new Error(`stop-handler: non-directory write ancestor: ${current}`);
    }
  }
}

function atomicWrite(repoRoot: string, path: string, content: string): void {
  assertSafeRepoWritePath(repoRoot, path);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    assertSafeRepoWritePath(repoRoot, temporary);
    writeFileSync(temporary, content, { mode: 0o600 });
    assertSafeRepoWritePath(repoRoot, path);
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // No temporary file was committed, or another fault already removed it.
    }
    throw error;
  }
}

function sleepMs(milliseconds: number): void {
  if (milliseconds <= 0) return;
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, milliseconds);
}

/** Cross-process parity with workflow-state.sh/session-context.ts event locks. */
function withEventsLock(repoRoot: string, eventsPath: string, fn: () => void): void {
  const lockRoot = join(dirname(eventsPath), '.locks');
  const lockDir = join(lockRoot, `evt-${basename(eventsPath)}.lock`);
  assertSafeRepoWritePath(repoRoot, lockRoot);
  assertSafeRepoWritePath(repoRoot, lockDir);
  try {
    mkdirSync(lockRoot, { recursive: true });
  } catch {
    fn();
    return;
  }
  let waited = 0;
  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch {
      if (waited >= 40) {
        let mtime = 0;
        try {
          mtime = Math.floor(statSync(lockDir).mtimeMs / 1000);
        } catch {
          mtime = 0;
        }
        if (mtime > 0 && Math.floor(Date.now() / 1000) - mtime >= 60) {
          try {
            rmdirSync(lockDir);
          } catch {
            // A competing process already changed the stale lock.
          }
          waited = 0;
          continue;
        }
        fn();
        return;
      }
      sleepMs(50);
      waited += 1;
    }
  }
  try {
    fn();
  } finally {
    try {
      rmdirSync(lockDir);
    } catch {
      // Matches the surviving bash writer's best-effort lock release.
    }
  }
}

class StopProjectionBatch {
  private readonly targets: readonly StopProjectionTarget[];

  constructor(
    private readonly repoRoot: string,
    private readonly paths: ProjectionPaths,
    private readonly content: { handoff: string; resume: string; event: string; runSummary: string },
    private readonly observer?: (target: StopProjectionTarget) => void,
  ) {
    this.targets = [
      { kind: 'handoff', path: paths.handoff },
      { kind: 'resume', path: paths.resume },
      { kind: 'event', path: paths.events },
      { kind: 'run-summary', path: paths.runSummary },
    ];
  }

  commit(): void {
    const [handoff, resume, event, runSummary] = this.targets;
    atomicWrite(this.repoRoot, join(this.repoRoot, handoff.path), this.content.handoff);
    this.observer?.(handoff);
    atomicWrite(this.repoRoot, join(this.repoRoot, resume.path), this.content.resume);
    this.observer?.(resume);
    const eventPath = join(this.repoRoot, event.path);
    assertSafeRepoWritePath(this.repoRoot, eventPath);
    mkdirSync(dirname(eventPath), { recursive: true });
    withEventsLock(this.repoRoot, eventPath, () => {
      assertSafeRepoWritePath(this.repoRoot, eventPath);
      appendFileSync(eventPath, this.content.event, { mode: 0o600 });
    });
    this.observer?.(event);
    atomicWrite(this.repoRoot, join(this.repoRoot, runSummary.path), this.content.runSummary);
    this.observer?.(runSummary);
  }
}

function claimDelegationFallback(
  repoRoot: string,
  payload: StopPayload,
  env: NodeJS.ProcessEnv,
  now: Date,
  beforeLock?: () => void,
): boolean {
  const scope = delegationScope(
    payload as unknown as Record<string, unknown>,
    env,
  );
  const scopes: readonly DelegationScope[] = scope ? [scope] : [];
  // Keep the rendezvous seam immediately before lock acquisition. The
  // transaction itself rereads latest and scoped state after acquisition.
  beforeLock?.();
  try {
    return withDelegationStateTransaction(repoRoot, scopes, (transaction) => {
      const state = transaction.snapshot.state;
      if (!state) return false;
      const created = Number(state.created_at_epoch);
      const age = Number.isFinite(created) ? Math.floor(now.getTime() / 1000) - created : 0;
      const eligible = state.eligible === true
        && state.explicit === true
        && state.spawned !== true
        && state.fallback_used !== true
        && state.stop_fallback !== false
        && age >= 0
        && age <= 24 * 60 * 60;
      if (!eligible) return false;
      const timestamp = now.toISOString();
      const committed = transaction.commit({
        ...state,
        fallback_used: true,
        fallback_used_at: timestamp,
        updated_at: timestamp,
      });
      return committed !== null;
    });
  } catch {
    // Hook availability is intentionally fail-open when the shared lock is
    // unavailable or a state projection is malformed.
    return false;
  }
}

function projection(repoRoot: string, activePlan: string | null, env: NodeJS.ProcessEnv, now: Date): {
  paths: ProjectionPaths;
  content: { handoff: string; resume: string; event: string; runSummary: string };
} {
  const config = policy(repoRoot);
  const checks = safeHarnessPath(nestedString(config, ['harness', 'checks_file']), '.ai/harness/checks/latest.json');
  const handoff = safeHarnessPath(nestedString(config, ['harness', 'handoff_file']), '.ai/harness/handoff/current.md');
  const resume = safeHarnessPath(nestedString(config, ['handoff_resume', 'resume_packet_file']), '.ai/harness/handoff/resume.md');
  const events = safeHarnessPath(nestedString(config, ['harness', 'events_file']), '.ai/harness/events.jsonl');
  const runsDir = safeHarnessPath(nestedString(config, ['harness', 'runs_dir']), '.ai/harness/runs');
  const policyFile = '.ai/harness/policy.json';
  const contextMap = safeHarnessPath(nestedString(config, ['context', 'map_file']), '.ai/context/context-map.json');
  const researchDir = nestedString(config, ['tasks', 'research_dir']) || 'docs/researches';
  const id = runId(env, now);
  const runSummary = `${runsDir}/${id}.json`;
  const artifacts = activeArtifacts(repoRoot, activePlan);
  const changed = changedFiles(repoRoot);
  const sourcePlan = todoSourcePlan(repoRoot);
  const action = nextAction(repoRoot, artifacts);
  const nextTask = action.command ? `${action.message} Command: ${action.command}` : action.message;
  const goal = sourcePlan
    ? `Continue task checklist sourced from ${sourcePlan}.`
    : artifacts.plan
      ? `Continue active plan ${artifacts.plan}.`
      : nextTask !== '(none)'
        ? nextTask
        : 'No active plan. Continue from the latest user request and filesystem state.';
  const commands = recentCommands(repoRoot);
  const trace = latestTrace(repoRoot, checks);
  const sprintRow = activeSprintRow(repoRoot, artifacts.plan);
  const supersedes = supersededPlan(repoRoot);
  const displayed = formatDisplay(now);
  const handoffContent = `# Harness Handoff\n\n> **Generated**: ${displayed}\n> **Reason**: session-stop\n\n## Goal\n\n${goal}\n\n## Decisions\n\n- Use filesystem artifacts as source of truth; treat SQLite/thread state as a rebuildable read model only.\n\n## Files Touched\n\n\`\`\`\n${changed.files}\n\`\`\`\n\n## Commands Run\n\n${commands}\n\n## Checks\n\n- Checks file: ${checks}\n- Latest trace: ${trace}\n\n## Blockers\n\n- (none recorded)\n\n## Active Artifacts\n\n- Active plan: ${artifacts.plan || '(none)'}\n- Active contract: ${artifacts.contract || '(none)'}\n- Active sprint row: ${sprintRow}\n- Review file: ${artifacts.review || '(none)'}\n- Latest trace/checks file: ${trace}\n- Resume packet: ${resume}\n\n## Exact Next Step\n\n- ${nextTask}\n\n## Resume Prompt\n\n- Resume packet: ${resume}\n- Start a fresh Codex session and read source artifacts first, then this handoff, before continuing; do not rely on auto-compact.\n\n## Source Artifacts\n\n- Spec: docs/spec.md\n- Plan: ${artifacts.plan || '(none)'}\n- Todo Source Plan: ${sourcePlan || '(none)'}\n- Contract: ${artifacts.contract || '(none)'}\n- Review: ${artifacts.review || '(none)'}\n- Notes: ${artifacts.notes || '(none)'}\n- Checks: ${checks}\n- Resume Packet: ${resume}\n- Policy: ${policyFile}\n- Context Map: ${contextMap}\n\n## Current Status\n\n- Next action stage: ${action.stage}\n- Next recommended action: ${nextTask}\n- Working tree: ${changed.summary}\n- Parent Run ID: ${id}\n- Supersedes: ${supersedes}\n\n## Changed Files\n\n\`\`\`\n${changed.files}\n\`\`\`\n`;
  const resumeContent = `# Codex Resume Packet\n<!-- generated-by: workflow_write_handoff v1 -->\n\n> **Generated**: ${displayed}\n> **Reason**: session-stop\n\n## Resume Prompt\n\nStart a fresh session for this task; do not rely on auto-compact or prior chat history. Read the source artifacts below, then the handoff, before continuing from Exact Next Step.\n\n- ${nextTask}\n\n## Source Artifacts\n\n- Handoff: ${handoff}\n- Spec: docs/spec.md\n- Active plan: ${artifacts.plan || '(none)'}\n- Active contract: ${artifacts.contract || '(none)'}\n- Review: ${artifacts.review || '(none)'}\n- Notes: ${artifacts.notes || '(none)'}\n- Research: ${researchDir}/\n- Checks: ${checks}\n`;
  const eventContent = `${JSON.stringify({
    ts: formatOffset(now),
    event_type: 'handoff_refresh',
    reason: 'session-stop',
    run_id: id,
    extra: { source_plan: sourcePlan, parent_run_id: id },
  })}\n`;
  const runSummaryContent = `${JSON.stringify({
    generated_at: formatOffset(now),
    run_id: id,
    reason: 'session-stop',
    active_plan: artifacts.plan,
    active_contract: artifacts.contract,
    active_review: artifacts.review,
    active_notes: artifacts.notes,
    checks_file: checks,
    handoff_file: handoff,
    policy_file: policyFile,
    context_map_file: contextMap,
  }, null, 2)}\n`;
  return {
    paths: { handoff, resume, events, runSummary },
    content: { handoff: handoffContent, resume: resumeContent, event: eventContent, runSummary: runSummaryContent },
  };
}

function minimalChangeReview(repoRoot: string): MinimalChangeReview {
  try {
    const result = runMinimalChangeCli(['review', '--phase', 'stop'], { cwd: repoRoot });
    const report = JSON.parse(result.stdout) as {
      verdict?: unknown;
      report_path?: unknown;
      findings?: unknown;
    };
    const findings = Array.isArray(report.findings) ? report.findings : [];
    if (report.verdict === 'disabled' || findings.length === 0) return { suffix: '', summary: '' };
    const reportPath = typeof report.report_path === 'string'
      ? report.report_path
      : '.ai/harness/checks/minimal-change.latest.json';
    const lines = findings.slice(0, 5).map((finding) => {
      const value = finding && typeof finding === 'object' ? finding as Record<string, unknown> : {};
      const tag = typeof value.tag === 'string' ? value.tag : 'review';
      const path = typeof value.path === 'string' ? value.path : '.';
      const question = typeof value.question === 'string'
        ? value.question
        : typeof value.evidence === 'string' ? value.evidence : 'review required';
      return `- [${tag}] ${path}: ${question}`;
    });
    const summary = `[MinimalChange] Non-blocking review (${reportPath}):\n${lines.join('\n')}`;
    return { suffix: `\n\n${summary}`, summary };
  } catch {
    return { suffix: '', summary: '' };
  }
}

function block(reason: string): StopHandlerResult {
  return { exitCode: 0, stdout: `${JSON.stringify({ decision: 'block', reason })}\n`, stderr: '' };
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function assistantMessageLooksLikePlan(message: string): boolean {
  return Buffer.byteLength(message, 'utf8') >= 240
    && /(Approved design summary|Building|Not building|Approach|Key decisions|Unknowns|Task Breakdown|Evidence Contract|P1|P2|P3|plan|design|方案|计划|设计)/i.test(message);
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function planCompletenessBlock(
  repoRoot: string,
  activePlan: string | null,
  message: string,
  minimalSuffix: string,
  now: Date,
): StopHandlerResult | null {
  if (activePlan && existsSync(join(repoRoot, activePlan))) return null;
  const config = policy(repoRoot);
  const pendingRel = safeHarnessPath(nestedString(config, ['planning', 'pending_orchestration_file']), '.ai/harness/planning/pending.json');
  const pendingPath = join(repoRoot, pendingRel);
  const pending = readJson(pendingPath);
  if (!pending || !assistantMessageLooksLikePlan(message)) return null;
  try {
    if (Date.now() - statSync(pendingPath).mtimeMs > 259_200_000) return null;
  } catch {
    return null;
  }
  const text = (key: string, fallback: string) => typeof pending[key] === 'string' && pending[key] ? String(pending[key]) : fallback;
  const kind = text('kind', 'host-plan');
  const slug = text('prompt_slug', 'planning');
  const signature = [kind, slug, text('draft_plan_path', 'none'), text('source_ref', 'none'), text('created_at', 'unknown')].join('|');
  const stateRel = safeHarnessPath(nestedString(config, ['planning', 'completeness_state_file']), '.ai/harness/planning/plan-completeness.json');
  const statePath = join(repoRoot, stateRel);
  if (readJson(statePath)?.last_signature === signature) return null;
  atomicWrite(repoRoot, statePath, `${JSON.stringify({ version: 1, last_signature: signature, updated_at: formatOffset(now) })}\n`);
  const host = text('host', 'unknown');
  const expected = text('expected_artifact', 'plan');
  const draft = text('draft_plan_path', '');
  const sourceRef = text('source_ref', '');
  const cwd = text('cwd', '');
  let summary = `kind=${kind} host=${host} expected=${expected} slug=${slug}`;
  if (draft) summary += ` draft=${draft}`;
  if (sourceRef) summary += ' source_ref=<source-ref>';
  if (cwd) summary += ` cwd=${cwd}`;
  summary += '\n';
  const title = kind === 'waza-think' ? 'Waza think planning output'
    : kind === 'dynamic-workflow' ? 'Dynamic workflow planning output'
      : kind === 'codex-plan' ? 'Codex planning output'
        : kind === 'repo-harness-plan' ? 'repo-harness planning output' : 'Planning output';
  const sourceArg = sourceRef ? ' --source-ref "<source-ref>"' : '';
  const guidance = `If the planning answer is decision-complete, capture the final plan body before stopping:\n  printf '%s\\n' '<decision-complete plan body>' | repo-harness run capture-plan --slug ${shellQuote(slug)} --title "${title}" --status Draft --source ${shellQuote(kind)} --orchestration-kind ${shellQuote(kind)} --route planning${sourceArg}\n\nIf the user already approved implementation, use:\n  printf '%s\\n' '<approved plan body>' | repo-harness run capture-plan --slug ${shellQuote(slug)} --title "${title}" --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --source ${shellQuote(kind)} --orchestration-kind ${shellQuote(kind)} --route planning --execute${sourceArg}\n\nUse a short English title/source-ref alias in these runtime instructions; do not paste non-ASCII prompt text into command arguments.\n\nIf the plan is not decision-complete, revise once for: goal/success criteria, scope/non-scope, constraints, P1/P2/P3, fragile assumption, rejected alternative, public API/config/file-interface changes, external dependency/API key requirements, tests, rollback/failure handling, phase independence, and no placeholders. Do not implement until capture succeeds.`;
  return block(`[PlanCompletenessGate] A first planning answer was produced while pending orchestration is still open: ${summary}\n${guidance}${minimalSuffix}`);
}

export function runStopHandler(opts: StopHandlerInput): StopHandlerResult {
  const repoRoot = opts.collector.getRepoRoot();
  const env = opts.env ?? process.env;
  const dependencies = opts.dependencies ?? {};
  const now = dependencies.now?.() ?? new Date();
  const payload = parsePayload(opts.input);
  if (payload.stop_hook_active === true || payload.stop_hook_active === 'true') {
    return { exitCode: 0, stdout: '', stderr: '' };
  }
  const ownership = opts.collector.getWorktreeOwnership();
  const activePlanMarker = opts.collector.getActivePlanMarker();
  const activePlan = ownership.owner === null || ownership.ownedByCurrent ? activePlanMarker : null;

  try {
    consumePendingPostEditEvents(repoRoot, env);
  } catch {
    // Deferred journal housekeeping never blocks Stop.
  }

  const projected = projection(repoRoot, activePlan, env, now);
  new StopProjectionBatch(
    repoRoot,
    projected.paths,
    projected.content,
    dependencies.observeProjectionWrite,
  ).commit();
  dependencies.observeProjectionTransaction?.();

  const stderr: string[] = [`[FinalizeHandoff] Refreshed ${projected.paths.handoff}.\n`];
  let state: EffectiveState | null = null;
  try {
    state = opts.collector.getStopEffectiveState();
  } catch {
    state = null;
  }
  if (!state) {
    stderr.push('[StopReadiness] Unable to resolve canonical state; skipping readiness-driven behavior (orthogonal gates still run).\n');
  }

  const readiness = state?.readiness?.ok === true ? state.readiness : null;
  const allowedToStop = readiness?.allowedToStop;
  if (allowedToStop?.decision === 'block') {
    return {
      ...block(`[ReadinessGate] Stop is blocked by shared readiness (missing: ${allowedToStop.reasons.join(',') || 'unspecified'}).`),
      stderr: stderr.join(''),
    };
  }
  if (state?.workflow_profile === 'lite') {
    return { exitCode: 0, stdout: '', stderr: stderr.join('') };
  }
  if (readiness?.readyToShip.decision === 'block') {
    stderr.push(`[ReadinessGate] readyToShip=false (missing: ${readiness.readyToShip.reasons.join(',') || 'unspecified'}); Stop is not blocked -- resolve before shipping.\n`);
  }

  const minimal = minimalChangeReview(repoRoot);
  if (minimal.summary) stderr.push(`${minimal.summary}\n`);
  if (state?.review.path && ['stale', 'missing', 'unavailable'].includes(state.review.freshness)) {
    stderr.push(`[ReviewFreshness] ${state.review.detail || 'Review is stale for current review subject'}\n`);
  }

  const lastMessage = typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : '';
  const planGate = planCompletenessBlock(
    repoRoot,
    activePlan,
    lastMessage,
    minimal.suffix,
    now,
  );
  if (planGate) return { ...planGate, stderr: stderr.join('') };

  if (claimDelegationFallback(repoRoot, payload, env, now, dependencies.beforeDelegationLock)) {
    const result = block(`[DelegationFallback] This turn explicitly requested bounded delegation, but no SubagentStart event was observed. Continue the task now by spawning the independent explorer/reviewer or isolated worker workstreams first when at least two independent workstreams exist, wait for them, reconcile their findings in the parent, then complete the response. Do not spawn for a trivial or strictly sequential task.${minimal.suffix}`);
    return { ...result, stderr: stderr.join('') };
  }

  return { exitCode: 0, stdout: '', stderr: stderr.join('') };
}
