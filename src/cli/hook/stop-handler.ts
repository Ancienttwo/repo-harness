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
import { consumePendingPostEditEvents, processArchitectureCascade } from './mutation-observed';
import {
  advanceArchitectureDriftCursor,
  architectureDriftSourceEvent,
  computeArchitectureDriftChangedSet,
} from './architecture-drift';
import { isImplementationSurfacePath } from '../../effects/review/diff-fingerprint';
import { drainArchitectureProjectionJobs, type ArchitectureProjectionDrainResultV1 } from '../../effects/architecture/projection-orchestrator';
import { loadArchitectureProjectionPolicy } from '../../effects/architecture/archctx-provider';
import { publishArchitectureProjectionRestampForDrain } from '../../effects/architecture/restamp-publication';
import { runMinimalChangeCli } from './minimal-change-cli';
import {
  MINIMAL_CHANGE_AUDIT_RECEIPT_PATH,
  loadMinimalChangePolicy,
  type MinimalChangePolicy,
} from './minimal-change-policy';
import { recordCircuitAttempt } from './circuit-breaker';
import type { WorkflowProfile } from '../../core/workflow/profile';
import { publishCheckpointFromLedger } from '../../effects/evidence/checkpoint-store';
import {
  buildRecoveryContext,
  renderRecoveryHandoff,
  renderRecoveryResume,
  resolveRecoveryEvidence,
} from '../../effects/evidence/recovery-materializer';
import { HookEffectReconciliationRequired } from './handler-contract';

// Ignored runtime evidence, same tree as hook-events.jsonl. Deliberately not a
// telemetry metric and not a typed journal: this exists to measure a hit rate
// before deciding whether the advisory should ever block, and adding a metric
// would repeat the `child_processes` completeness problem already on the ledger.
const UNPLANNED_IMPLEMENTATION_EVIDENCE = '.ai/harness/runs/unplanned-implementation.jsonl';
const STOP_DEFERRED_WORK_BUDGET_MS = 20_000;

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
  /** Wall clock shared by architecture and journal deferred work. */
  readonly wallClockMs?: () => number;
  readonly observeProjectionWrite?: (target: StopProjectionTarget) => void;
  /** Invoked once after the complete Stop projection batch commits. */
  readonly observeProjectionTransaction?: () => void;
  /** Narrow post-commit fault/observation seam; never driven by an env flag. */
  readonly afterProjectionWrite?: (target: StopProjectionTarget) => void;
  readonly drainArchitectureProjection?: (repoRoot: string, env: NodeJS.ProcessEnv) => ArchitectureProjectionDrainResultV1;
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
// needs. `latestTrace` (checks/latest.json's `run_file` field folded
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
    checks_file: context.paths.checks,
    handoff_file: context.paths.handoff,
    policy_file: context.paths.policyFile,
    context_map_file: context.paths.contextMap,
  }, null, 2)}\n`;
  return {
    paths: { handoff: context.paths.handoff, resume: context.paths.resume, events: context.paths.events, runSummary },
    content: { handoff: handoffContent, resume: resumeContent, event: eventContent, runSummary: runSummaryContent },
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
    const label = policy.blocking ? 'Enforced review' : 'Non-blocking review';
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

/**
 * Audit receipt contract for the enforce gate:
 * `.ai/harness/checks/minimal-change-audit.latest.json` must be a JSON object
 * with `version: 1`, a `fingerprint` equal to the audited report fingerprint,
 * a non-empty `decisions` array of non-empty strings, and a parseable
 * `generated_at` timestamp. Missing, malformed, or mismatched receipts release
 * nothing: the gate stays closed.
 */
function minimalChangeReceiptReleases(repoRoot: string, fingerprint: string): boolean {
  if (!fingerprint) return false;
  const receipt = readJson(join(repoRoot, MINIMAL_CHANGE_AUDIT_RECEIPT_PATH));
  if (!receipt) return false;
  if (receipt.version !== 1) return false;
  if (typeof receipt.fingerprint !== 'string' || receipt.fingerprint !== fingerprint) return false;
  if (!Array.isArray(receipt.decisions) || receipt.decisions.length === 0) return false;
  if (!receipt.decisions.every((entry) => typeof entry === 'string' && entry.trim() !== '')) return false;
  if (typeof receipt.generated_at !== 'string' || Number.isNaN(Date.parse(receipt.generated_at))) return false;
  return true;
}

function minimalChangeBlockReason(review: MinimalChangeReview): string {
  return [
    `[MinimalChange] Enforce gate blocked Stop: the latest report verdict is \`review\` and no matching audit receipt exists (${review.reportPath}).`,
    'Findings:',
    ...review.findingLines,
    'Resolve each finding by removing the growth it names, or record an explicit audit receipt at',
    `  ${MINIMAL_CHANGE_AUDIT_RECEIPT_PATH}`,
    `  {"version":1,"fingerprint":"${review.fingerprint}","decisions":["<one non-empty decision per finding>"],"generated_at":"<ISO-8601 timestamp>"}`,
    '`fingerprint` must equal the audited report fingerprint exactly; a missing, malformed, or mismatched receipt keeps this gate closed.',
    'Methodology: the reclaim-code-entropy skill covers this review when it is installed; this gate reads only the receipt file.',
  ].join('\n');
}

/**
 * Stop's minimal_change enforce gate. Blocks a `review` verdict that carries no
 * matching audit receipt, and releases with a warning once the shared circuit
 * breaker trips for the same report fingerprint.
 */
function minimalChangeEnforceBlock(
  repoRoot: string,
  policy: MinimalChangePolicy,
  review: MinimalChangeReview,
  profile: WorkflowProfile,
  stderr: string[],
): StopHandlerResult | null {
  if (!policy.blocking || review.verdict !== 'review') return null;
  // A report without a usable fingerprint has no releasable state: no receipt
  // can name it and the breaker cannot key on it, so blocking here would be
  // terminal. The sole writer always emits a fingerprint, which makes this a
  // corrupt report -- the same lazy treatment a truncated report already gets
  // through its parse failure.
  if (!review.fingerprint) {
    stderr.push(`[MinimalChange] Enforce gate skipped: ${review.reportPath} carries no fingerprint and cannot be audited or bounded; treat the report as corrupt and regenerate it.\n`);
    return null;
  }
  if (minimalChangeReceiptReleases(repoRoot, review.fingerprint)) {
    stderr.push(`[MinimalChange] Audit receipt accepted for ${review.fingerprint}; Stop released.\n`);
    return null;
  }
  try {
    const decision = recordCircuitAttempt(repoRoot, {
      kind: 'minimal-change',
      guard: 'MinimalChangeEnforce',
      reason: 'minimal-change review verdict without a matching audit receipt',
      pathOrAction: review.reportPath,
      // Keyed per report fingerprint: a new report is real progress and resets
      // the counter, a repeated one advances toward the limit.
      progressToken: review.fingerprint,
      fingerprint: review.fingerprint,
      profile,
    });
    if (decision.tripped) {
      stderr.push(`[MinimalChange] Circuit breaker tripped after ${decision.limit} enforce blocks for ${review.fingerprint}; releasing Stop with the review unresolved.\n`);
      return null;
    }
  } catch (error) {
    // The breaker can only release; a recording failure keeps the gate closed.
    stderr.push(`[MinimalChange] Circuit breaker unavailable: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  return block(minimalChangeBlockReason(review));
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
  const wallClockMs = dependencies.wallClockMs ?? Date.now;
  const deferredDeadlineMs = wallClockMs() + STOP_DEFERRED_WORK_BUDGET_MS;
  const now = dependencies.now?.() ?? new Date();
  const payload = parsePayload(opts.input);
  if (payload.stop_hook_active === true || payload.stop_hook_active === 'true') {
    return { exitCode: 0, stdout: '', stderr: '' };
  }
  const ownership = opts.collector.getWorktreeOwnership();
  const activePlanMarker = opts.collector.getActivePlanMarker();
  const activePlan = ownership.owner === null || ownership.ownedByCurrent ? activePlanMarker : null;

  let architectureDrain: ArchitectureProjectionDrainResultV1 | null = null;
  let architectureDrainError = '';
  let journalSideEffectError = '';
  let driftWarnings: readonly string[] = [];
  let unplannedImplementationPaths: readonly string[] = [];
  try {
    const changedSet = computeArchitectureDriftChangedSet(repoRoot);
    driftWarnings = changedSet.warnings;
    // PlanStatusGuard only sees `Edit|Write` tool calls, so a shell write to an
    // implementation path never reaches it. This changed set is git-derived
    // (`git status --porcelain -z`), so it is indifferent to how the bytes were
    // written -- which is exactly the blind spot to cover. Advisory only: no
    // data exists yet on how often this fires on real work.
    if (!activePlan) {
      unplannedImplementationPaths = changedSet.paths.filter(isImplementationSurfacePath);
    }
    const driftEvent = architectureDriftSourceEvent(changedSet);
    architectureDrain = dependencies.drainArchitectureProjection?.(repoRoot, env)
      ?? drainArchitectureProjectionJobs(repoRoot, { env, sourceEvents: driftEvent ? [driftEvent] : [], deadlineMs: deferredDeadlineMs, nowMs: wallClockMs });
    if (architectureDrain.status === 'disabled') {
      for (const changedPath of changedSet.paths) {
        const cascade = processArchitectureCascade(repoRoot, env, changedPath, { deadlineMs: deferredDeadlineMs, nowMs: wallClockMs });
        if (!cascade.ok) throw new Error(cascade.error);
      }
    }
    // The cursor is the retry boundary: it only moves past a range the
    // consumer acknowledged, so a retry-pending, dead-lettered, or throwing
    // drain replays the same range on the next Stop.
    if (architectureDrain.acknowledgeSourceEvents && changedSet.headSha !== null) {
      advanceArchitectureDriftCursor(repoRoot, changedSet.headSha, now);
    }
  } catch (error) {
    architectureDrainError = error instanceof Error ? error.message : String(error);
  }
  // Auto-publication of a digest-only manifest restamp, deliberately outside
  // the drain's try/catch above: a publication fault must never reach
  // `architectureDrainError` and therefore can never arm the strict projection
  // gate below. Every path -- published, skipped, faulted -- exits 0 with at
  // most one advisory line, and the effect's only durable mutation is a single
  // `update-ref` CAS on the current branch.
  let restampAdvisory = '';
  if (architectureDrain) {
    try {
      restampAdvisory = publishArchitectureProjectionRestampForDrain(repoRoot, architectureDrain).advisory ?? '';
    } catch (error) {
      restampAdvisory = `[ArchitectureProjection] restamp publication failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  try {
    consumePendingPostEditEvents(repoRoot, env, { deadlineMs: deferredDeadlineMs, nowMs: wallClockMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    journalSideEffectError = message;
  }

  // EPC-07 (reordered from EPC-06's additive placement, documented in
  // tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md):
  // publish the checkpoint BEFORE building the projection batch below, so
  // the recovery materializer's evidence read reflects the freshest
  // possible checkpoint for this Stop (including any ledger events the
  // PostEdit flush above just accepted), not the previous Stop's stale
  // snapshot. Still a quiet, expected skip inside
  // `publishCheckpointFromLedger` itself when a worktree has no ledger yet
  // (no exception), and any unexpected storage fault here is caught and
  // discarded the same way, so this best-effort publish still can never
  // block, reorder, or change Stop's existing
  // handoff/resume/event/run-summary projection outputs below -- only their
  // relative ordering to this publish call changed, not their own shape,
  // count, or the single downstream state resolution.
  try {
    publishCheckpointFromLedger(repoRoot, () => now);
  } catch {
    // Checkpoint publication never blocks Stop.
  }

  const projected = projection(repoRoot, activePlan, env, now);
  new StopProjectionBatch(
    repoRoot,
    projected.paths,
    projected.content,
    dependencies.observeProjectionWrite,
    dependencies.afterProjectionWrite,
  ).commit();
  dependencies.observeProjectionTransaction?.();

  const stderr: string[] = [`[FinalizeHandoff] Refreshed ${projected.paths.handoff}.\n`];
  for (const warning of driftWarnings) stderr.push(`${warning}\n`);
  if (architectureDrain?.status === 'retry-pending' || architectureDrain?.status === 'dead-letter') {
    stderr.push(`[ArchitectureProjection] ${architectureDrain.status}: ${architectureDrain.error ?? 'unknown failure'}\n`);
  } else if (architectureDrainError) {
    stderr.push(`[ArchitectureProjection] orchestration failed: ${architectureDrainError}\n`);
  }
  if (restampAdvisory) stderr.push(`${restampAdvisory}\n`);
  if (journalSideEffectError) stderr.push(`[PostEditJournal] side effects failed: ${journalSideEffectError}\n`);
  let architectureGate: 'advisory' | 'strict' = 'advisory';
  try {
    architectureGate = loadArchitectureProjectionPolicy(repoRoot).failureGate;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    architectureDrainError = architectureDrainError ? `${architectureDrainError}; projection policy invalid: ${message}` : `projection policy invalid: ${message}`;
    // An unreadable policy cannot prove that strict projection delivery was
    // enabled. Preserve the default advisory posture unless a durable job is
    // already active and therefore proves this lane owns pending work.
    const activeQueue = architectureDrain?.queue;
    architectureGate = activeQueue && (activeQueue.pending > 0 || activeQueue.running > 0 || activeQueue.deadLetters > 0)
      ? 'strict'
      : 'advisory';
  }
  if (architectureGate === 'strict' && (architectureDrainError || architectureDrain?.status === 'retry-pending' || architectureDrain?.status === 'dead-letter')) {
    const recovery = architectureDrain?.status === 'dead-letter' && architectureDrain.jobId
      ? ` Recover with: repo-harness architecture-projection retry-dead-letter --job-id ${architectureDrain.jobId} --json.`
      : ' Re-run repo-harness architecture-projection drain --json after correcting the reported failure.';
    return {
      ...block(`[ArchitectureProjection] Strict projection failure gate blocked Stop: ${architectureDrainError || architectureDrain?.error || architectureDrain?.status}.${recovery}`),
      stderr: stderr.join(''),
    };
  }
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
  // The minimal_change enforce gate runs BEFORE the lite early return because
  // it is orthogonal to ceremony: its `review` verdict is a property of the
  // change (a new dependency or a new abstraction), not of the workflow
  // profile, and lite is precisely where such a change hides. The deterministic
  // risk floor stays lite for a single-manifest or single-source edit with one
  // capability and no strict path token (src/core/workflow/profile.ts:256-273),
  // while the Stop report itself is the per-path artifact the PostEdit observer
  // last wrote (src/cli/hook/minimal-change-cli.ts:56-85) -- the two file sets
  // are independent, so a `review` verdict under a lite profile is reachable
  // and was previously swallowed here. The gate carries its own lazy
  // conditions (non-enforce mode, non-`review` verdict, missing report or
  // fingerprint all return null), so a lite session with nothing to audit
  // keeps its zero-ceremony silence.
  const minimalPolicy = loadMinimalChangePolicy(repoRoot);
  const minimal = minimalChangeReview(repoRoot, minimalPolicy);
  if (minimal.summary) stderr.push(`${minimal.summary}\n`);
  const profile = state?.workflow_profile === 'lite'
    || state?.workflow_profile === 'standard'
    || state?.workflow_profile === 'strict'
    ? state.workflow_profile
    : 'strict';
  const minimalGate = minimalChangeEnforceBlock(repoRoot, minimalPolicy, minimal, profile, stderr);
  if (minimalGate) return { ...minimalGate, stderr: stderr.join('') };

  if (state?.workflow_profile === 'lite') {
    return { exitCode: 0, stdout: '', stderr: stderr.join('') };
  }
  if (unplannedImplementationPaths.length > 0) {
    const shown = unplannedImplementationPaths.slice(0, 3).join(', ');
    const more = unplannedImplementationPaths.length > 3 ? `, +${unplannedImplementationPaths.length - 3} more` : '';
    stderr.push(`[PlanStatusGuard] ${unplannedImplementationPaths.length} implementation path(s) changed with no active plan: ${shown}${more}\n`);
    stderr.push('[PlanStatusGuard] Advisory: capture the approved plan with repo-harness run capture-plan --slug <slug> --title <title> --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --execute\n');
    recordUnplannedImplementation(repoRoot, now, unplannedImplementationPaths);
  }

  if (readiness?.readyToShip.decision === 'block') {
    stderr.push(`[ReadinessGate] readyToShip=false (missing: ${readiness.readyToShip.reasons.join(',') || 'unspecified'}); Stop is not blocked -- resolve before shipping.\n`);
  }

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

  return { exitCode: 0, stdout: '', stderr: stderr.join('') };
}
