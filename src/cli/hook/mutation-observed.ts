/**
 * Mutation observed — HRD-05 in-process journal handler for `PostToolUse.edit`.
 *
 * A qualifying edit writes at most one durable journal event carrying dirty
 * bits. Deferred consumers update projections and observe architecture changes.
 * The queue and capability-context calls share one deadline. Removing the
 * no-op middle step leaves its time available to capability context. No delay
 * or reserved budget is added. The deferred
 * consumers (`consumePendingPostEditEvents`, invoked at Stop by
 * `runtime.ts`, and `pendingPostEditJournalSection`, surfaced at
 * SessionStart) consume deferred changes; contract verification reads execution
 * evidence without starting contract commands. See
 * `tasks/notes/20260720-1146-hrd-05-post-edit-event-journal.notes.md` for
 * the condition-by-condition dirty-bit derivation table and the falsifier
 * record.
 *
 * The architecture cascade is no longer one of those dirty bits: a journal
 * event only exists for a Claude Edit/Write tool call, which made the cascade
 * blind to shell and apply_patch writes. `architecture-drift.ts` owns that
 * changed set now; this journal owns edit-time trigger payloads only.
 *
 * Host-visible advisory stdout (DocDrift/DeployAsset echoes, and the
 * former first-principles advisory) is ported in-process — those never wrote
 * anything durable, so they stay on the hot path without a second route
 * runtime.
 */

import { execFileSync, spawnSync } from 'child_process';
import { parseVerificationPlanFromContractText } from '../../core/evidence/verification-plan';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { createHash, randomUUID } from 'crypto';
import { basename, dirname, join } from 'path';
import type { SessionContextSection } from './session-context-budget';
import { loadMinimalChangePolicy } from './minimal-change-policy';
import { collectMinimalChangeSignals } from './minimal-change-signals';
import { canonicalRepoRelativePath, fileExists, readText } from '../../effects/state/collect-state-inputs';
import { withExclusiveDirectoryLock } from '../../effects/locking/exclusive-directory-lock';
import { runProcess } from '../../effects/process-runner';
import type { WorktreeOwnership } from '../../effects/loop/state-input-collector';
import {
  artifactStemFromPlan,
  markdownHeader,
  planSlugFromPath,
} from '../../core/state/artifact-parsers';

// ---------------------------------------------------------------------------
// Public entry surface
// ---------------------------------------------------------------------------

/** Structural subset of `StateInputCollector` this handler consumes. No
 * Effective State getter: the contract requires NOT adding one to this route
 * (`post-edit-guard.sh` historically never ran `state resolve`). */
export interface MutationObservedCollector {
  getRepoRoot(): string;
  getWorktreeOwnership(): WorktreeOwnership;
  getActivePlanMarker(): string | null;
}

export interface MutationObservedInput {
  readonly collector: MutationObservedCollector;
  /** Raw host event payload (the same bytes `runHook()` would replay to a script's stdin). */
  readonly input?: string | Buffer;
  readonly env?: NodeJS.ProcessEnv;
  /** HRD-08 event telemetry observer, invoked only after one journal transaction commits. */
  readonly observeJournalWrite?: (path: string) => void;
  /** Narrow post-commit fault/observation seam; never driven by an env flag. */
  readonly afterJournalWrite?: (path: string) => void;
}

export interface MutationObservedResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function runMutationObserved(opts: MutationObservedInput): MutationObservedResult {
  const repoRoot = opts.collector.getRepoRoot();
  const env = opts.env ?? process.env;
  const payload = parsePayload(opts.input);

  const filePath = getFilePath(repoRoot, payload, env);
  if (!filePath || canonicalRepoRelativePath(repoRoot, filePath) === null) {
    // Mirrors `[[ -z "$FILE_PATH" ]] && exit 0` -- the non-qualifying case --
    // extended fail-closed to targets that do not canonicalize inside this
    // repository (host-side plan/memory files under ~/.claude, traversal or
    // symlink escapes): no event, no advisories, no journal write. An
    // out-of-repo event would otherwise become a projection job that archctx
    // rejects with non-retryable AC_SCHEMA_INVALID and block the Stop gate.
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  const out: string[] = [];
  const errOut: string[] = [];

  emitAdvisories(out, filePath, basename(filePath), dirname(filePath));

  const advisory = renderFirstPrinciplesAdvisory(repoRoot, filePath);
  if (advisory) out.push(advisory);

  const policy = loadMinimalChangePolicy(repoRoot);
  const minimalChangeEnabled = policy.mode !== 'off' && policy.post_edit_observer;

  const dirty: PostEditJournalDirtyBits = {
    'contract-verification': false,
    context: true,
    capability: false,
    'minimal-change': minimalChangeEnabled,
    checkpoint: isCheckpointPath(filePath),
  };

  const journalPath = writeOrCoalesceJournalEvent(repoRoot, {
    sessionId: sessionIdFor(payload, env),
    filePath,
    subjectRevision: currentGitRevision(repoRoot),
    dirty,
    minimalChangeInfo: minimalChangeEnabled ? { path: filePath, baseRef: 'HEAD' } : null,
  });
  if (journalPath) opts.observeJournalWrite?.(journalPath);
  if (journalPath) opts.afterJournalWrite?.(journalPath);

  return { exitCode: 0, stdout: out.join(''), stderr: errOut.join('') };
}

// ---------------------------------------------------------------------------
// hook_get_file_path / hook_normalize_file_path port (post-edit-guard.sh's
// single-path extraction -- unlike mutation-guard.ts's PreToolUse.edit port,
// post-edit-guard.sh never grew apply_patch multi-path expansion, so this
// stays the simple single-path shape mutation-guard.ts's own non-apply_patch
// branch already uses).
// ---------------------------------------------------------------------------

function parsePayload(input: string | Buffer | undefined): unknown {
  if (input === undefined) return {};
  const text = input.toString().trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function stringAt(payload: unknown, path: readonly string[]): string {
  let current: unknown = payload;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : '';
}

function firstNonEmpty(values: readonly string[]): string {
  return values.find((value) => value.length > 0) ?? '';
}

function getFilePath(repoRoot: string, payload: unknown, env: NodeJS.ProcessEnv): string {
  const raw = firstNonEmpty([
    stringAt(payload, ['file_path']),
    stringAt(payload, ['tool_input', 'file_path']),
    stringAt(payload, ['trigger_file_path']),
    stringAt(payload, ['parent_file_path']),
    env.CLAUDE_FILE_PATH ?? '',
  ]);
  return normalizeFilePath(repoRoot, raw);
}

/**
 * `hook_normalize_file_path()` port (verbatim re-port of the SAME shared
 * `assets/hooks/hook-input.sh` function `mutation-guard.ts` already ported
 * for PreToolUse.edit -- re-ported here rather than imported because
 * mutation-guard.ts is outside this package's Allowed Paths, same reasoning
 * `session-context.ts` already documents for its own duplicated helpers).
 */
function normalizeFilePath(repoRoot: string, raw: string): string {
  if (!raw || !raw.startsWith('/')) return raw;
  if (raw === repoRoot || raw.startsWith(`${repoRoot}/`)) return raw.slice(repoRoot.length + 1);

  const repoReal = tryRealpath(repoRoot);
  if (repoReal && (raw === repoReal || raw.startsWith(`${repoReal}/`))) {
    return raw.slice(repoReal.length + 1);
  }

  const rawParentReal = tryRealpath(dirname(raw));
  if (rawParentReal) {
    const rawReal = `${rawParentReal}/${basename(raw)}`;
    if (repoReal && (rawReal === repoReal || rawReal.startsWith(`${repoReal}/`))) {
      return rawReal.slice(repoReal.length + 1);
    }
    if (rawReal === repoRoot || rawReal.startsWith(`${repoRoot}/`)) {
      return rawReal.slice(repoRoot.length + 1);
    }
  }

  return raw;
}

function tryRealpath(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// DocDrift / DeployAsset advisories (post-edit-guard.sh:104-148, ported
// verbatim -- pure stdout, no durable write, host-visible parity surface).
// ---------------------------------------------------------------------------

function emitAdvisories(out: string[], filePath: string, base: string, dir: string): void {
  if (filePath.startsWith('deploy/')) {
    out.push(`[DeployAsset] Deployment operations asset changed: ${filePath}\n`);
    out.push('  Confirm secrets, real env files, provider state, artifacts, logs, and scratch files remain in ignored _ops/ before committing.\n');
    out.push('  Follow operations.deploy_sql in .ai/harness/policy.json when configured; otherwise keep SQL directly under deploy/sql/ with 4-digit ascending prefixes.\n');
  }

  if (base === 'package.json') {
    const match = /(^|\/)packages\/([^/]+)/.exec(dir);
    if (match) {
      const pkgName = `packages/${match[2]}`;
      out.push(`[DocDrift] ${pkgName}/package.json changed\n`);
      out.push('  Check: docs/packages.md exports table may need updating\n');
    }
  }

  const moduleMatch = /(^|\/)packages\/([^/]+)\/src\/([^/]+)\/index\.ts$/.exec(filePath);
  if (moduleMatch) {
    out.push(`[DocDrift] New module '${moduleMatch[3]}' in ${moduleMatch[2]}\n`);
    out.push('  Check: docs/packages.md and docs/architecture.md may need updating\n');
  }

  if (/(^|\/)apps\/[^/]+\/src\/.+/.test(filePath)) {
    out.push(`[DocDrift] App source changed: ${filePath}\n`);
    out.push('  Check: docs/architecture.md source tree may need updating\n');
  }

  if (base === 'tsconfig.json' && /(^|\/)(packages|apps)\//.test(dir)) {
    out.push(`[DocDrift] TypeScript config changed in ${basename(dir)}\n`);
    out.push('  Check: docs/packages.md may need updating\n');
  }

  if (base === 'turbo.json') {
    out.push('[DocDrift] Turborepo config changed\n');
    out.push('  Check: docs/architecture.md pipeline section may need updating\n');
  }

  if (/^wrangler.*\.toml$/.test(base)) {
    out.push(`[DocDrift] Wrangler config changed: ${base}\n`);
    out.push('  Check: docs/guides/cf-deployment.md bindings/routes may need updating\n');
  }
}

// ---------------------------------------------------------------------------
// First-principles advisory. This is the typed port of the route-only shell
// state machine; anti-simplification.sh was only an alias to the same logic.
// ---------------------------------------------------------------------------

function renderFirstPrinciplesAdvisory(repoRoot: string, filePath: string): string {
  let diff = '';
  try {
    diff = execFileSync('git', ['diff', '--', filePath], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
  const added = diff.split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('++'))
    .map((line) => line.slice(1));
  if (added.length === 0) return '';

  const count = (pattern: RegExp): number => added.filter((line) => pattern.test(line)).length;
  const warnings: Array<{ category: string; detail: string }> = [];
  const compatibility = count(/(?:^|[^\p{L}\p{N}_])(?:legacy|compat|backward|polyfill|shim)(?:[^\p{L}\p{N}_]|$)/iu);
  if (compatibility > 0) warnings.push({ category: 'Compatibility debt additions detected', detail: `${compatibility} compatibility-like line(s)` });
  const branches = count(/(?:^|[^\p{L}\p{N}_])(?:if|else\s+if|switch|case)(?:[^\p{L}\p{N}_]|$)/iu);
  if (branches >= 4) warnings.push({ category: 'Branch-heavy additions detected', detail: `${branches} new branch/control-flow line(s)` });
  const abstractions = count(/(?:^|[^\p{L}\p{N}_])(?:interface|abstract\s+class|factory|adapter|provider|strategy|manager|orchestrator|dispatcher|registry)(?:[^\p{L}\p{N}_]|$)/iu);
  if (abstractions > 0) warnings.push({ category: 'Abstraction-heavy additions detected', detail: `${abstractions} abstraction-like line(s)` });
  const dependencies = count(/(?:^|\s)(?:import\s+.*from\s*["'][^./]|import\s*["'][^./]|require\(["'][^./]|"(?:dependencies|devDependencies|peerDependencies|optionalDependencies)"\s*:|"[@A-Za-z0-9._/-]+"\s*:\s*"[~^0-9])/iu);
  if (dependencies > 0) warnings.push({ category: 'Dependency-surface additions detected', detail: `${dependencies} dependency/import line(s)` });
  const configs = count(/(?:^|[^\p{L}\p{N}_])(?:process\.env|import\.meta\.env|feature[-_ ]?flag|FEATURE_|Config|config|Settings|settings)(?:[^\p{L}\p{N}_]|$)/iu);
  if (configs > 1) warnings.push({ category: 'Config-surface additions detected', detail: `${configs} config/env/flag line(s)` });
  const orchestration = count(/(?:^|[^\p{L}\p{N}_])(?:state[\s_-]?machine|lifecycle|workflow|route|routing|registry|orchestrator)(?:[^\p{L}\p{N}_]|$)/iu);
  if (orchestration > 1) warnings.push({ category: 'Local orchestration additions detected', detail: `${orchestration} orchestration-like line(s)` });
  if (warnings.length === 0) return '';

  const lines: string[] = [];
  for (const warning of warnings) {
    lines.push(`[FirstPrinciples] ${warning.category} in ${filePath}`);
    lines.push('  Re-check: must this exist, does platform/stdlib/current dependency already cover it, can the diff collapse?');
    lines.push(`  Trigger: ${warning.detail}`);
  }
  lines.push('  Boundary: keep trust-boundary validation, data-loss prevention, security, accessibility, and explicit user-requested behavior.');
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// checkpoint dirty bit: post-edit-guard.sh:162-168's `case "$FILE_PATH"`
// gate for the (retired) task-handoff regeneration.
// ---------------------------------------------------------------------------

/** Only task and review edits request checkpoint work. */
function isCheckpointPath(filePath: string): boolean {
  if (filePath === 'tasks/todos.md') return true;
  if (/^plans\/.*\.md$/.test(filePath)) return true;
  if (/^tasks\/reviews\/.*\.review\.md$/.test(filePath)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// session id (mirrors mutation-guard.ts's getSessionId priority, simplified:
// this handler only needs a coalesce bucket, not a full run-id derivation).
// ---------------------------------------------------------------------------

function sessionIdFor(payload: unknown, env: NodeJS.ProcessEnv): string {
  if (env.HOOK_SESSION_ID) return env.HOOK_SESSION_ID;
  const payloadValue = stringAt(payload, ['session_id']);
  if (payloadValue) return payloadValue;
  return env.CLAUDE_SESSION_ID || env.CODEX_SESSION_ID || 'no-session';
}

/** Plain git read (NOT an Effective State resolution -- the contract
 * explicitly forbids adding one to this route), mirrors mutation-guard.ts's
 * own `resolveGitDir` pattern. */
function currentGitRevision(repoRoot: string): string | null {
  try {
    const rev = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return rev || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Journal schema + storage (append-only, one file per event under
// .ai/harness/ -- per the contract's evidence-store crash-safety guidance).
// ---------------------------------------------------------------------------

export interface PostEditJournalDirtyBits {
  readonly 'contract-verification': boolean;
  readonly context: boolean;
  readonly capability: boolean;
  readonly 'minimal-change': boolean;
  readonly checkpoint: boolean;
}

export interface PostEditJournalEvent {
  readonly schema: 'change_observed';
  readonly schema_version: 2;
  /** Stable identity of this pending journal slot. Delivery event ids rotate
   * on every coalesced edit, but this key survives until the slot is acked. */
  readonly source_key: string;
  readonly event_id: string;
  readonly session_id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly changed_paths: readonly string[];
  readonly subject_revision: string | null;
  readonly dirty: PostEditJournalDirtyBits;
  readonly payload: {
    readonly minimal_change?: { readonly path: string; readonly base_ref: string };
  };
}

const JOURNAL_ROOT = '.ai/harness/journal/post-edit';
const JOURNAL_PENDING_DIR = `${JOURNAL_ROOT}/pending`;
const POST_EDIT_CONSUME_BUDGET_MS = 15_000;
const POST_EDIT_HELPER_TIMEOUT_MS = 10_000;

/** Session-scoped coalesce key: a same-session edit to the same path set
 * overwrites the same pending file instead of appending unboundedly. */
function journalEventKey(sessionId: string, changedPaths: readonly string[]): string {
  const sorted = [...changedPaths].sort();
  return createHash('sha256').update(`${sessionId}\0${sorted.join('\0')}`).digest('hex').slice(0, 20);
}

function readJournalEventFile(absPath: string): PostEditJournalEvent | null {
  try {
    const raw = readFileSync(absPath, 'utf-8');
    const parsed = JSON.parse(raw) as PostEditJournalEvent;
    return parsed
      && parsed.schema === 'change_observed'
      && parsed.schema_version === 2
      && /^[a-f0-9]{20}$/.test(parsed.source_key)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function writeJournalEventAtomic(absPath: string, event: PostEditJournalEvent): void {
  mkdirSync(dirname(absPath), { recursive: true });
  const tmp = `${absPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(event, null, 2)}\n`, 'utf-8');
  renameSync(tmp, absPath);
}

interface WriteJournalEventInput {
  readonly sessionId: string;
  readonly filePath: string;
  readonly subjectRevision: string | null;
  readonly dirty: PostEditJournalDirtyBits;
  readonly minimalChangeInfo: { readonly path: string; readonly baseRef: string } | null;
}

function writeOrCoalesceJournalEvent(repoRoot: string, input: WriteJournalEventInput): string | null {
  const key = journalEventKey(input.sessionId, [input.filePath]);
  try {
    const root = realpathSync(repoRoot);
    return withExclusiveDirectoryLock(root, `${JOURNAL_ROOT}/locks/${key}`, () => writeOrCoalesceJournalEventLocked(root, input, key));
  } catch {
    // Best-effort: a journal write/lock failure must never fail the hot path.
    return null;
  }
}

function writeOrCoalesceJournalEventLocked(repoRoot: string, input: WriteJournalEventInput, key: string): string | null {
  const relativePath = `${JOURNAL_PENDING_DIR}/${key}.json`;
  const absPath = join(repoRoot, relativePath);
  const nowIso = new Date().toISOString();
  const current = readJournalEventFile(absPath);
  if (!current && readLegacyJournalEventFile(absPath)) {
    warnStderr('[PostEditJournal] WARN: v1 event blocks this journal write; run repo-harness state migrate-post-edit-journal-v1 --json');
    throw new Error('post-edit journal v1 requires explicit migration');
  }
  const existing = current;

  const dirty: PostEditJournalDirtyBits = existing
    ? {
        'contract-verification': existing.dirty['contract-verification'] || input.dirty['contract-verification'],
        context: existing.dirty.context || input.dirty.context,
        capability: existing.dirty.capability || input.dirty.capability,
        'minimal-change': existing.dirty['minimal-change'] || input.dirty['minimal-change'],
        checkpoint: existing.dirty.checkpoint || input.dirty.checkpoint,
      }
    : input.dirty;

  const changedPaths = existing
    ? [...new Set([...existing.changed_paths, input.filePath])].sort()
    : [input.filePath];

  const event: PostEditJournalEvent = {
    schema: 'change_observed',
    schema_version: 2,
    source_key: key,
    event_id: `change-${randomUUID()}`,
    session_id: input.sessionId,
    created_at: existing?.created_at ?? nowIso,
    updated_at: nowIso,
    changed_paths: changedPaths,
    subject_revision: input.subjectRevision ?? existing?.subject_revision ?? null,
    dirty,
    payload: {
      minimal_change: input.minimalChangeInfo
        ? { path: input.minimalChangeInfo.path, base_ref: input.minimalChangeInfo.baseRef }
        : existing?.payload.minimal_change,
    },
  };

  writeJournalEventAtomic(absPath, event);
  return relativePath;
}

interface PendingScanResult {
  /** Well-formed `change_observed` events, parsed and ready to process. */
  readonly valid: ReadonlyArray<{ readonly name: string; readonly event: PostEditJournalEvent }>;
  /** File names under pending/ that failed to parse as a `change_observed`
   * event (missing/unreadable/malformed JSON) -- garbage the Stop-time
   * consumer cleans up, never a state the SessionStart display needs to
   * know about. */
  readonly corruptNames: readonly string[];
  readonly legacyNames: readonly string[];
}

function scanPendingPostEditEventFiles(repoRoot: string): PendingScanResult {
  const dir = join(repoRoot, JOURNAL_PENDING_DIR);
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.json'));
  } catch {
    return { valid: [], corruptNames: [], legacyNames: [] };
  }
  const valid: Array<{ name: string; event: PostEditJournalEvent }> = [];
  const corruptNames: string[] = [];
  const legacyNames: string[] = [];
  for (const name of names.sort()) {
    const event = readJournalEventFile(join(dir, name));
    if (event) valid.push({ name, event });
    else if (readLegacyJournalEventFile(join(dir, name))) legacyNames.push(name);
    else corruptNames.push(name);
  }
  return { valid, corruptNames, legacyNames };
}

type LegacyPostEditJournalEventV1 = Omit<PostEditJournalEvent, 'schema_version' | 'source_key'> & { readonly schema_version: 1 };

function readLegacyJournalEventFile(path: string): LegacyPostEditJournalEventV1 | null {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as LegacyPostEditJournalEventV1;
    return value?.schema === 'change_observed' && value.schema_version === 1 ? value : null;
  } catch { return null; }
}

/** Explicit one-way queue migration. The runtime consumer remains v2-only. */
export function migratePendingPostEditJournalV1(repoRoot: string, limit = 100): { migrated: number; remaining: number } {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('post-edit journal migration limit must be 1..1000');
  const root = realpathSync(repoRoot);
  const dir = join(root, JOURNAL_PENDING_DIR);
  let names: string[];
  try { names = readdirSync(dir).filter((name) => name.endsWith('.json')).sort(); }
  catch { return { migrated: 0, remaining: 0 }; }
  let migrated = 0;
  let remaining = 0;
  for (const name of names) {
    const key = name.replace(/\.json$/, '');
    if (!/^[a-f0-9]{20}$/.test(key)) continue;
    const path = join(dir, name);
    if (!readLegacyJournalEventFile(path)) continue;
    if (migrated >= limit) { remaining += 1; continue; }
    withExclusiveDirectoryLock(root, `${JOURNAL_ROOT}/locks/${key}`, () => {
      const legacy = readLegacyJournalEventFile(path);
      if (!legacy) return;
      writeJournalEventAtomic(path, { ...legacy, schema_version: 2, source_key: key });
      migrated += 1;
    });
  }
  return { migrated, remaining };
}

/** Pending (unconsumed) events, oldest-key-first. Used both by the
 * SessionStart orientation section and Stop-time consumption. Corrupt files
 * are silently omitted here (they are not a "pending event" in any
 * meaningful sense) -- `consumePendingPostEditEvents` is the one that
 * cleans them up. */
export function readPendingPostEditEvents(repoRoot: string): readonly PostEditJournalEvent[] {
  return scanPendingPostEditEventFiles(repoRoot).valid.map(({ event }) => event);
}

/**
 * The journal is a transit queue, not an evidence ledger. Consumption deletes
 * the pending file outright; there is no `consumed/` retention directory.
 * An effect that returns failure or reaches its deadline is reported and
 * acknowledged so it cannot permanently pin the queue head. Storage and lock
 * failures still leave the pending file for a later Stop.
 */
function deletePendingPostEditEventFile(repoRoot: string, name: string): void {
  unlinkSync(join(repoRoot, JOURNAL_PENDING_DIR, name));
}

// ---------------------------------------------------------------------------
// SessionStart orientation (crash-replay visibility). Defined here (not
// session-context.ts, outside this package's Allowed Paths) and imported
// directly by runtime.ts, mirroring runtime.ts's own local
// `effectiveStateSessionSection` precedent.
// ---------------------------------------------------------------------------

export function pendingPostEditJournalSection(repoRoot: string): SessionContextSection | null {
  const events = readPendingPostEditEvents(repoRoot);
  if (events.length === 0) return null;
  const oldest = events.reduce((a, b) => (a.created_at < b.created_at ? a : b));
  return {
    id: 'post-edit-journal',
    priority: 4,
    content: `[PostEditJournal] ${events.length} pending post-edit journal event(s) awaiting Stop consumption (oldest: ${oldest.event_id} at ${oldest.created_at}).`,
    mandatory: false,
    // Gate round-1 blocking fix: `budgetSessionContext` drops the ENTIRE
    // SessionStart payload to empty stdout when NO section is actionable
    // (session-context-budget.ts's `no-actionable-state` branch checks
    // `normalized.some((section) => section.actionable)` across ALL
    // sections, not just this one) -- a quiet repo with only a pending
    // journal event and no other actionable state was rendering empty
    // stdout, silently losing crash-replay visibility. `true` here is what
    // keeps this section (and the whole budgeted payload) from being
    // dropped.
    actionable: true,
    reference: 'repo-harness run verification-plan evaluate',
  };
}

// ---------------------------------------------------------------------------
// Stop-time (deferred) consumption: replays the SAME external commands the
// retired scripts used, per unique dirty path, then marks each event
// consumed atomically. Invoked by runtime.ts's Stop.default dispatch.
// ---------------------------------------------------------------------------

function commandAvailable(cmd: string, env: NodeJS.ProcessEnv): boolean {
  try {
    return spawnSync('sh', ['-c', `command -v ${cmd}`], { env, stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

/** `repo_harness_runner_available()` port (assets/hooks/post-edit-guard.sh:14-19). */
function repoHarnessRunnerAvailable(env: NodeJS.ProcessEnv): boolean {
  const cli = env.REPO_HARNESS_CLI;
  if (cli && existsSync(cli) && commandAvailable('bun', env)) return true;
  return commandAvailable('repo-harness', env);
}

/** `run_repo_harness_helper()` port (assets/hooks/post-edit-guard.sh:21-29). */
function runRepoHarnessHelper(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  helper: string,
  args: readonly string[],
  timeoutMs: number,
): { status: number; stdout: string; stderr: string; timedOut: boolean } {
  const cli = env.REPO_HARNESS_CLI;
  let command: string;
  let commandArgs: readonly string[];
  if (cli && existsSync(cli) && commandAvailable('bun', env)) {
    command = 'bun';
    commandArgs = [cli, 'run', helper, ...args];
  } else {
    command = 'repo-harness';
    commandArgs = ['run', helper, ...args];
  }
  const result = runProcess(command, commandArgs, { cwd: repoRoot, env, inheritEnv: false, processGroup: true, timeoutMs });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
  };
}

/** capability-context's own 3-tier fallback (post-edit-guard.sh:73-93) --
 * NOT `run <helper>` shaped, ported as its own function. */
function runCapabilityContextRequest(repoRoot: string, env: NodeJS.ProcessEnv, timeoutMs: number): { status: number } {
  const args = ['capability-context', 'request', '--from-latest-architecture-event'];
  const cli = env.REPO_HARNESS_CLI;
  if (cli && existsSync(cli) && commandAvailable('bun', env)) {
    const result = runProcess('bun', [cli, ...args], { cwd: repoRoot, env, inheritEnv: false, processGroup: true, timeoutMs });
    return { status: result.status ?? 1 };
  }
  if (commandAvailable('repo-harness', env)) {
    const result = runProcess('repo-harness', args, { cwd: repoRoot, env, inheritEnv: false, processGroup: true, timeoutMs });
    return { status: result.status ?? 1 };
  }
  const localCli = join(repoRoot, 'src/cli/index.ts');
  if (commandAvailable('bun', env) && existsSync(localCli)) {
    const result = runProcess('bun', [localCli, ...args], { cwd: repoRoot, env, inheritEnv: false, processGroup: true, timeoutMs });
    return { status: result.status ?? 1 };
  }
  return { status: 1 };
}

/**
 * `run_architecture_queue_sync()` port (post-edit-guard.sh:49-96), now
 * invoked per path of the Stop-time drift changed set (see
 * `architecture-drift.ts`) instead of per journal event. The
 * capability-context follow-up is gated on
 * architecture-queue's OWN real-time output matching
 * `/^\[ArchitectureDrift\] Request:/m` -- replicated here exactly, against
 * the (still same, unmodified) `architecture-queue.sh record` command's real
 * output, not a second capability-resolver implementation.
 */
export type ArchitectureCascadeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export function processArchitectureCascade(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  filePath: string,
  budget: { readonly deadlineMs: number; readonly nowMs: () => number },
): ArchitectureCascadeResult {
  const remaining = () => Math.max(0, budget.deadlineMs - budget.nowMs());
  const expired = (): ArchitectureCascadeResult => ({ ok: false, error: `legacy architecture cascade deadline exhausted before ${filePath}; drift retained for retry` });
  if (remaining() <= 0) return expired();
  if (!repoHarnessRunnerAvailable(env)) {
    return { ok: false, error: `legacy architecture cascade runner is unavailable for ${filePath}` };
  }
  const queueBudget = remaining();
  if (queueBudget <= 0) return expired();
  const result = runRepoHarnessHelper(repoRoot, env, 'architecture-queue', ['record', '--file', filePath], queueBudget);
  if (result.status !== 0) {
    return { ok: false, error: `legacy architecture cascade failed for ${filePath}: architecture-queue exited ${result.status}` };
  }
  if (/^\[ArchitectureDrift\] Request:/m.test(result.stdout)) {
    const capabilityBudget = remaining();
    if (capabilityBudget <= 0) return expired();
    const capabilityContext = runCapabilityContextRequest(repoRoot, env, capabilityBudget);
    if (capabilityContext.status !== 0) {
      return { ok: false, error: `legacy architecture cascade failed for ${filePath}: capability-context exited ${capabilityContext.status}` };
    }
  }
  return { ok: true };
}

/** Evaluate the current plan without starting missing verification commands. */
/** `minimal_change_hook_entry signals --phase post-edit` port -- calls the
 * SAME `collectMinimalChangeSignals()` function `minimal-change-observer.sh`
 * called (via minimal-change-cli.ts), just deferred to Stop time using the
 * path+baseRef captured in the journal event's payload. */
function processMinimalChangeDeferred(
  repoRoot: string,
  path: string,
  baseRef: string,
  deadlineMs: number,
  nowMs: () => number,
): { timedOut: boolean } {
  try {
    const policy = loadMinimalChangePolicy(repoRoot);
    collectMinimalChangeSignals({ repoRoot, path, policy, baseRef, deadlineMs, nowMs });
  } catch {
    // Matches minimal-change-cli.ts's own non-fatal "signals skipped" stance.
  }
  return { timedOut: nowMs() >= deadlineMs };
}

export interface PostEditConsumeSummary {
  readonly consumed: number;
  readonly pending: number;
  readonly errors: number;
  /** One line per corrupt pending file removed this pass -- also written to
   * stderr (see below), returned too so tests/callers can observe it
   * without capturing the process stream. */
  readonly warnings: readonly string[];
}

export interface PostEditConsumeOptions {
  /** Absolute wall-clock deadline for this queue pass. */
  readonly deadlineMs?: number;
  /** Per helper ceiling, always clamped to the remaining queue budget. */
  readonly helperTimeoutMs?: number;
  /** Test seam for deterministic budget exhaustion. */
  readonly nowMs?: () => number;
}

/** Writes one warning line to the real process stderr -- host-visible and
 * independent of the typed handler result because Stop-time deferred
 * consumption runs before the final host output is shaped. Never throws. */
function warnStderr(line: string): void {
  try {
    process.stderr.write(`${line}\n`);
  } catch {
    /* stderr unavailable is not this function's problem to solve */
  }
}

/**
 * Processes pending v2 journal events within one bounded Stop-time pass.
 * V1 files stay pending until the explicit migration runs. External
 * helpers are process-group supervised and clamped to the pass deadline.
 * Completed, failed, and timed-out effects are all acknowledged; the latter
 * two emit warnings so one slow event cannot pin the queue head forever.
 * Events not reached before the total budget remain pending for the next Stop,
 * as do storage/lock failures. Corrupt files are removed with a warning because
 * they can never be retried into validity.
 */
export function consumePendingPostEditEvents(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  options: PostEditConsumeOptions = {},
): PostEditConsumeSummary {
  const nowMs = options.nowMs ?? Date.now;
  const deadlineMs = options.deadlineMs ?? nowMs() + POST_EDIT_CONSUME_BUDGET_MS;
  const helperTimeoutMs = options.helperTimeoutMs ?? POST_EDIT_HELPER_TIMEOUT_MS;
  if (!Number.isFinite(deadlineMs)) throw new Error('post-edit journal deadline must be finite');
  if (!Number.isSafeInteger(helperTimeoutMs) || helperTimeoutMs < 1) {
    throw new Error('post-edit journal helper timeout must be a positive integer');
  }
  const { valid, corruptNames, legacyNames } = scanPendingPostEditEventFiles(repoRoot);
  let consumed = 0;
  let errors = 0;
  const warnings: string[] = [];
  if (legacyNames.length > 0) {
    const warning = `[PostEditJournal] WARN: retained ${legacyNames.length} v1 event(s); run repo-harness state migrate-post-edit-journal-v1 --json`;
    warnings.push(warning);
    warnStderr(warning);
  }

  for (const name of corruptNames) {
    const warning = `[PostEditJournal] WARN: removed corrupt pending event file ${name}`;
    try {
      deletePendingPostEditEventFile(repoRoot, name);
      warnings.push(warning);
      warnStderr(warning);
    } catch {
      errors += 1;
    }
  }

  for (const { name, event } of valid) {
    const remainingMs = Math.floor(deadlineMs - nowMs());
    try {
      const eventFailures: string[] = [];
      const deadlineElapsed = remainingMs <= 0;
      const hasDeferredEffect = Boolean(
        event.dirty['minimal-change'] && event.payload.minimal_change,
      );
      if (deadlineElapsed && hasDeferredEffect) {
        // No effect was attempted; preserve its durable trigger for the next pass.
        break;
      }
      if (!deadlineElapsed && event.dirty['minimal-change'] && event.payload.minimal_change) {
        const minimalChange = processMinimalChangeDeferred(
          repoRoot,
          event.payload.minimal_change.path,
          event.payload.minimal_change.base_ref,
          deadlineMs,
          nowMs,
        );
        if (minimalChange.timedOut) eventFailures.push('minimal-change signals reached the journal deadline');
      }
      const root = realpathSync(repoRoot);
      const key = name.replace(/\.json$/, '');
      let deleted = false;
      withExclusiveDirectoryLock(root, `${JOURNAL_ROOT}/locks/${key}`, () => {
        const current = readJournalEventFile(join(root, JOURNAL_PENDING_DIR, name));
        if (!current || current.updated_at !== event.updated_at) return;
        deletePendingPostEditEventFile(root, name);
        deleted = true;
      });
      if (deleted) {
        consumed += 1;
        if (eventFailures.length > 0) {
          errors += eventFailures.length;
          const warning = `[PostEditJournal] WARN: removed pending event ${event.event_id} after ${eventFailures.join('; ')}`;
          warnings.push(warning);
          warnStderr(warning);
        }
      }
      if (nowMs() >= deadlineMs) break;
    } catch {
      errors += 1;
    }
  }
  return { consumed, pending: valid.length - consumed + legacyNames.length, errors, warnings };
}
