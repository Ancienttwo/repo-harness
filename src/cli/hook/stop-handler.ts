import { observeRefactorRecommendations } from '../../effects/refactor/recommendations';
/** Stop refreshes bounded recovery observations without workflow permission gates. */
import {
  appendFileSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { createHash, randomBytes } from 'crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { execFileSync } from 'child_process';
import type { EffectiveState } from '../../core/state/types';
import { consumePendingPostEditEvents } from './mutation-observed';
import { computeArchitectureDriftChangedSet } from './architecture-drift';
import { isImplementationSurfacePath } from '../../effects/review/diff-fingerprint';
import { runMinimalChangeCli } from './minimal-change-cli';
import { sweepRunSummaries } from '../../effects/run-summary-retention';
import { loadMinimalChangePolicy, type MinimalChangePolicy } from './minimal-change-policy';
import { publishCheckpointFromLedger } from '../../effects/evidence/checkpoint-store';
import {
  buildRecoveryContext,
  renderRecoveryHandoff,
  renderRecoveryResume,
  resolveRecoveryEvidence,
} from '../../effects/evidence/recovery-materializer';
import { STOP_WORK_BUDGET_MS } from '../../core/hook-work-budget';
import { HookEffectReconciliationRequired } from './handler-contract';

// Ignored runtime evidence, same tree as hook-events.jsonl. Deliberately not a
// telemetry metric and not a typed journal: this exists to measure a hit rate
// before deciding whether the advisory should ever block, and adding a metric
// would repeat the `child_processes` completeness problem already on the ledger.
const UNPLANNED_IMPLEMENTATION_EVIDENCE = '.ai/harness/runs/unplanned-implementation.jsonl';

function recordUnplannedImplementation(repoRoot: string, now: Date, paths: readonly string[]): void {
  try {
    const target = join(repoRoot, UNPLANNED_IMPLEMENTATION_EVIDENCE);
    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(target, `${JSON.stringify({
      observed_at: now.toISOString(),
      path_count: paths.length,
      paths,
    })}\n`, 'utf-8');
  } catch {
    // Evidence collection must never change the Stop result; the sibling side
    // effects above are wrapped the same way.
  }
}

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
  /** Wall clock shared by all bounded Stop work. */
  readonly wallClockMs?: () => number;
  readonly observeProjectionWrite?: (target: StopProjectionTarget) => void;
  /** Invoked once after the complete Stop projection batch commits. */
  readonly observeProjectionTransaction?: () => void;
  /** Narrow post-commit fault/observation seam; never driven by an env flag. */
  readonly afterProjectionWrite?: (target: StopProjectionTarget) => void;
  readonly observeRefactorRecommendations?: typeof observeRefactorRecommendations;
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
  /** Verdict of the latest report; '' when the review could not be read. */
  readonly verdict: string;
  readonly fingerprint: string;
  readonly reportPath: string;
  readonly findingLines: readonly string[];
}

interface ProjectionPaths {
  readonly handoff: string;
  readonly resume: string;
  readonly events: string;
  readonly runSummary: string;
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

// EPC-07: runId/formatCompact/formatDisplay moved to
// src/effects/evidence/recovery-materializer.ts's buildRecoveryContext (run
// id + display timestamp are now part of the shared recovery context every
// caller of this module reads from `context.runId`/`context.generatedAtDisplay`).
// formatOffset stays here -- it is only used by this file's own
// event/run-summary JSON content, which is not one of EPC-07's four named
// recovery views.
function formatOffset(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(absolute / 60))}${pad(absolute % 60)}`;
}

// EPC-07: activeArtifacts/changedFiles/nextAction/recentCommands/
// activeSprintRow/supersededPlan/todoSourcePlan/firstTaskBreakdown/
// metadataValue/declaredPath/latestTrace moved to
// src/effects/evidence/recovery-materializer.ts's buildRecoveryContext --
// single source of truth for the workflow context every recovery view
// needs. `latestTrace` (the retired checks report's `run_file` field folded
// directly into a handoff line) is retired outright: it was a single-hop
// violation (re-deriving an evidence claim from checks/* instead of the
// checkpoint); the materializer's Evidence/Provenance sections replace it.

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

/**
 * Stop's event append is the only non-overwriting projection target. A host
 * retry reuses the existing run identity, so suppress the same semantic event
 * while still reporting the phase as committed to the invocation-local
 * observer. This is intentionally local to Stop; it is not a generic journal.
 */
function eventAlreadyRecorded(eventsPath: string, content: string): boolean {
  const semanticKey = stopEventSemanticKey(content);
  if (!semanticKey) return false;
  try {
    const size = statSync(eventsPath).size;
    const start = Math.max(0, size - STOP_EVENT_RECONCILE_WINDOW_BYTES);
    const length = size - start;
    const buffer = Buffer.alloc(length);
    const fd = openSync(eventsPath, 'r');
    try {
      let offset = 0;
      while (offset < length) {
        const bytesRead = readSync(fd, buffer, offset, length - offset, start + offset);
        if (bytesRead === 0) throw new Error('stop-handler: event reconciliation read made no progress');
        offset += bytesRead;
      }
    } finally {
      closeSync(fd);
    }
    const tail = buffer.toString('utf8');
    const lines = tail.split('\n');
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]!;
      const prior = stopEventRecord(line);
      if (!prior) continue;
      return prior.projectionKey === semanticKey;
    }
    if (start > 0) {
      throw new HookEffectReconciliationRequired(
        `stop-handler: latest Stop event is outside the ${STOP_EVENT_RECONCILE_WINDOW_BYTES}-byte reconciliation window`,
      );
    }
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

const STOP_EVENT_RECONCILE_WINDOW_BYTES = 1024 * 1024;

/**
 * Stable Stop operation identity: the semantic event payload, excluding its
 * timestamp. This lets a retry at a later host time converge while a later
 * Stop in the same run with a changed source plan remains a new event.
 */
function stopEventSemanticKey(content: string): string | null {
  return stopEventRecord(content)?.projectionKey ?? null;
}

function stopEventRecord(content: string): { readonly projectionKey: string } | null {
  let candidate: Record<string, unknown>;
  try {
    const parsed = JSON.parse(content.trim());
    if (!parsed || typeof parsed !== 'object') return null;
    candidate = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const extra = candidate.extra && typeof candidate.extra === 'object' && !Array.isArray(candidate.extra)
    ? candidate.extra as Record<string, unknown>
    : null;
  return candidate.event_type === 'handoff_refresh'
    && candidate.reason === 'session-stop'
    && extra
    && typeof extra.projection_key === 'string'
    && /^[0-9a-f]{64}$/.test(extra.projection_key)
    ? { projectionKey: extra.projection_key }
    : null;
}

class StopProjectionBatch {
  private readonly targets: readonly StopProjectionTarget[];

  constructor(
    private readonly repoRoot: string,
    private readonly paths: ProjectionPaths,
    private readonly content: { handoff: string; resume: string; event: string; runSummary: string },
    private readonly observer?: (target: StopProjectionTarget) => void,
    private readonly afterProjectionWrite?: (target: StopProjectionTarget) => void,
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
    this.afterProjectionWrite?.(handoff);
    atomicWrite(this.repoRoot, join(this.repoRoot, resume.path), this.content.resume);
    this.observer?.(resume);
    this.afterProjectionWrite?.(resume);
    const eventPath = join(this.repoRoot, event.path);
    assertSafeRepoWritePath(this.repoRoot, eventPath);
    mkdirSync(dirname(eventPath), { recursive: true });
    withEventsLock(this.repoRoot, eventPath, () => {
      assertSafeRepoWritePath(this.repoRoot, eventPath);
      if (!eventAlreadyRecorded(eventPath, this.content.event)) {
        appendFileSync(eventPath, this.content.event, { mode: 0o600 });
      }
    });
    this.observer?.(event);
    this.afterProjectionWrite?.(event);
    atomicWrite(this.repoRoot, join(this.repoRoot, runSummary.path), this.content.runSummary);
    this.observer?.(runSummary);
    this.afterProjectionWrite?.(runSummary);
  }
}

function projection(repoRoot: string, activePlan: string | null, env: NodeJS.ProcessEnv, now: Date): {
  paths: ProjectionPaths;
  content: { handoff: string; resume: string; event: string; runSummary: string };
  retention: { runsDir: string };
} {
  // EPC-07: handoff/resume content now comes from the single recovery
  // materializer (src/effects/evidence/recovery-materializer.ts) instead of
  // this function's own independent Markdown assembly. External shape is
  // unchanged: same four projection targets, same paths resolution
  // (buildRecoveryContext resolves the identical policy-driven paths this
  // function used to resolve itself), same event/run-summary content this
  // function still owns directly (those two targets are not among EPC-07's
  // four named recovery views).
  const context = buildRecoveryContext(repoRoot, activePlan, env, { reason: 'session-stop', now: () => now });
  const evidence = resolveRecoveryEvidence(repoRoot);
  const contractPath = context.artifacts.contract;
  const handoffContent = renderRecoveryHandoff(context, evidence, contractPath);
  const resumeContent = renderRecoveryResume(context, evidence, contractPath);
  const runSummary = `${context.paths.runsDir}/${context.runId}.json`;
  const projectionKey = createHash('sha256').update(JSON.stringify({
    // This is the renderer's stable input projection. Deliberately omit the
    // generated timestamps and workingDirectory: a later same-route host
    // event gets a fresh timestamp, while the event log itself is already
    // scoped to the fixed repo root. Neither may split an otherwise identical
    // Stop retry.
    context: {
      reason: context.reason,
      run_id: context.runId,
      artifacts: context.artifacts,
      source_plan: context.sourcePlan,
      active_sprint_row: context.activeSprintRowText,
      action: context.action,
      next_task: context.nextTask,
      goal: context.goal,
      changed: context.changed,
      recent_commands: context.recentCommandsText,
      supersedes: context.supersedes,
      paths: context.paths,
      global_handoff_path: context.globalHandoffPath,
    },
    evidence,
  })).digest('hex');
  const eventContent = `${JSON.stringify({
    ts: formatOffset(now),
    event_type: 'handoff_refresh',
    reason: 'session-stop',
    run_id: context.runId,
    extra: { source_plan: context.sourcePlan, parent_run_id: context.runId, projection_key: projectionKey },
  })}\n`;
  const runSummaryContent = `${JSON.stringify({
    generated_at: formatOffset(now),
    run_id: context.runId,
    reason: 'session-stop',
    active_plan: context.artifacts.plan,
    active_contract: context.artifacts.contract,
    active_review: context.artifacts.review,
    active_notes: context.artifacts.notes,
    handoff_file: context.paths.handoff,
    policy_file: context.paths.policyFile,
    context_map_file: context.paths.contextMap,
  }, null, 2)}\n`;
  return {
    paths: { handoff: context.paths.handoff, resume: context.paths.resume, events: context.paths.events, runSummary },
    content: { handoff: handoffContent, resume: resumeContent, event: eventContent, runSummary: runSummaryContent },
    retention: { runsDir: context.paths.runsDir },
  };
}

const EMPTY_MINIMAL_CHANGE_REVIEW: MinimalChangeReview = {
  suffix: '',
  summary: '',
  verdict: '',
  fingerprint: '',
  reportPath: '',
  findingLines: [],
};

function minimalChangeReview(repoRoot: string, policy: MinimalChangePolicy): MinimalChangeReview {
  try {
    const result = runMinimalChangeCli(['review', '--phase', 'stop'], { cwd: repoRoot });
    const report = JSON.parse(result.stdout) as {
      verdict?: unknown;
      report_path?: unknown;
      findings?: unknown;
      fingerprint?: unknown;
    };
    const findings = Array.isArray(report.findings) ? report.findings : [];
    const verdict = typeof report.verdict === 'string' ? report.verdict : '';
    if (verdict === 'disabled' || findings.length === 0) return EMPTY_MINIMAL_CHANGE_REVIEW;
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
    const label = 'Non-blocking review';
    const summary = `[MinimalChange] ${label} (${reportPath}):\n${lines.join('\n')}`;
    return {
      suffix: `\n\n${summary}`,
      summary,
      verdict,
      fingerprint: typeof report.fingerprint === 'string' ? report.fingerprint : '',
      reportPath,
      findingLines: lines,
    };
  } catch {
    return EMPTY_MINIMAL_CHANGE_REVIEW;
  }
}

/** Stop records recovery and observed gaps; it never grants publication permission. */
export function runStopHandler(opts: StopHandlerInput): StopHandlerResult {
  const repoRoot = opts.collector.getRepoRoot();
  const env = opts.env ?? process.env;
  const dependencies = opts.dependencies ?? {};
  const wallClockMs = dependencies.wallClockMs ?? Date.now;
  const deadlineMs = wallClockMs() + STOP_WORK_BUDGET_MS;
  const now = dependencies.now?.() ?? new Date();
  const payload = parsePayload(opts.input);
  if (payload.stop_hook_active === true || payload.stop_hook_active === 'true') {
    return { exitCode: 0, stdout: '', stderr: '' };
  }
  const ownership = opts.collector.getWorktreeOwnership();
  const activePlan = ownership.owner === null || ownership.ownedByCurrent
    ? opts.collector.getActivePlanMarker() : null;
  const stderr: string[] = [];
  try {
    consumePendingPostEditEvents(repoRoot, env, { deadlineMs, nowMs: wallClockMs });
  } catch (error) {
    stderr.push(`[PostEditJournal] ${error instanceof Error ? error.message : String(error)}\n`);
  }
  try { publishCheckpointFromLedger(repoRoot, () => now); } catch {
    stderr.push('[RecoveryObservation] Checkpoint could not be refreshed.\n');
  }
  // Real path and projection transaction errors still refuse unsafe writes.
  // Recovery availability itself is best effort and cannot trap a Stop turn.
  let projected: ReturnType<typeof projection> | null = null;
  try { projected = projection(repoRoot, activePlan, env, now); } catch (error) {
    stderr.push(`[RecoveryObservation] ${error instanceof Error ? error.message : String(error)}\n`);
  }
  if (projected) {
    new StopProjectionBatch(repoRoot, projected.paths, projected.content,
      dependencies.observeProjectionWrite, dependencies.afterProjectionWrite).commit();
    dependencies.observeProjectionTransaction?.();
    stderr.push(`[FinalizeHandoff] Refreshed ${projected.paths.handoff}.\n`);
    try { sweepRunSummaries({ repoRoot, ...projected.retention }); } catch { /* retention is advisory */ }
  }
  let state: EffectiveState | null = null;
  try { state = opts.collector.getStopEffectiveState(); } catch { /* advisory */ }
  if (!state) stderr.push('[StopReadiness] State unavailable; Stop may continue.\n');
  if (state?.readiness?.ok && state.readiness.readyToShip.decision === 'block') {
    stderr.push(`[ReadinessGate] Publication not verified: ${state.readiness.readyToShip.reasons.join(',')}. Stop may continue.\n`);
  }
  const minimal = minimalChangeReview(repoRoot, loadMinimalChangePolicy(repoRoot));
  if (minimal.summary) stderr.push(`${minimal.summary}\n`);
  if (!activePlan) {
    const paths = computeArchitectureDriftChangedSet(repoRoot).paths.filter(isImplementationSurfacePath);
    if (paths.length) recordUnplannedImplementation(repoRoot, now, paths);
  }
  try {
    const recommendation = (dependencies.observeRefactorRecommendations ?? observeRefactorRecommendations)(
      repoRoot, { env, consume: false, deadlineMs, nowMs: wallClockMs });
    if (recommendation.status !== 'unavailable') {
      stderr.push(`[RefactorRecommendations] ${recommendation.status}: ${recommendation.message}\n`);
    }
  } catch (error) {
    stderr.push(`[RefactorRecommendations] ${error instanceof Error ? error.message : String(error)}\n`);
  }
  return { exitCode: 0, stdout: '', stderr: stderr.join('') };
}
