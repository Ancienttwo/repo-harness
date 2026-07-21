/**
 * Session context builder -- HRD-04 in-process section emitters for
 * `SessionStart.default`, replacing `session-start-context.sh` (641 lines),
 * `minimal-change-context.sh` (16 lines), and `security-sentinel.sh` (115
 * lines). Each retired script becomes one pure(-ish) section emitter over
 * collector facts / already-exported TS authorities, composed by
 * `buildSessionStartSections()` in the scripts' own former order and fed to
 * the EXISTING `budgetSessionContext` exactly once (see `runtime.ts`).
 *
 * See `tasks/notes/20260720-0829-hrd-04-session-start-consolidation.notes.md`
 * for the falsifier result, section port table, and golden delta.
 */

import { execFileSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import { fileURLToPath } from 'url';
import { basename, dirname, join } from 'path';
import type { SessionContextSection } from './session-context-budget';
import { loadMinimalChangePolicy } from './minimal-change-policy';
import { renderMinimalChangeSessionContext } from './minimal-change-context';
import { runSecurityScan, type SecurityScanReport } from '../commands/security';
import { fileExists, readText } from '../../effects/state/collect-state-inputs';
import type { WorktreeOwnership } from '../../effects/loop/state-input-collector';

// ---------------------------------------------------------------------------
// minimal-change-context.sh port (16 lines)
// ---------------------------------------------------------------------------

/**
 * `minimal-change-context.sh` reduces to one subprocess indirection:
 * `minimal_change_hook_entry context --phase session` ->
 * `repo_harness_hook_cli minimal-change context --phase session` -> spawns
 * `bun $CLI minimal-change context --phase session`, whose own handler
 * (`runMinimalChangeCli`, `src/cli/hook/minimal-change-cli.ts`) is exactly:
 * `renderMinimalChangeSessionContext(loadMinimalChangePolicy(repoRoot))`.
 * Calling that pair directly in-process (mirroring HRD-03's
 * `resolveEffectiveState` reuse) is what collapses this section's `bun_cli`
 * cost to 0 -- same function, same policy file read, no wrapping subprocess.
 */
export function minimalChangeSessionContent(repoRoot: string): string {
  const policy = loadMinimalChangePolicy(repoRoot);
  return renderMinimalChangeSessionContext(policy);
}

/** `reference`/`priority`/`mandatory`/`actionable` mirror the retired script's assignment in runtime.ts's old script-loop branch verbatim (`taskState` false for this id -> the `setup check` reference, not `state resolve`). */
export function minimalChangeSessionSection(repoRoot: string): SessionContextSection | null {
  const content = minimalChangeSessionContent(repoRoot);
  if (!content) return null;
  return {
    id: 'minimal-change-context.sh',
    priority: 6,
    content,
    mandatory: false,
    actionable: false,
    reference: 'repo-harness setup check --json',
  };
}

// ---------------------------------------------------------------------------
// security-sentinel.sh port (115 lines)
// ---------------------------------------------------------------------------

const SECURITY_DIR = '.ai/harness/security';
const SECURITY_STATE_FILE = `${SECURITY_DIR}/state.sha256`;
const SECURITY_LATEST_FILE = `${SECURITY_DIR}/latest.json`;

/** Raw lowercase hex sha256, matching `shasum -a 256 file | awk '{print $1}'` / `sha256sum` (not the `sha256:`-prefixed helper in collect-state-inputs.ts, which is a different, unrelated format). */
function rawSha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * `fingerprint_files()` port. Bash gates the two HOME-rooted paths on
 * `${HOME:-}` being non-empty (an unset HOME drops both entries from the
 * list entirely, not just marks them missing); the three repo-rooted paths
 * are unconditional. Order matters -- it is hashed as one joined string.
 */
function securityFingerprintPaths(repoRoot: string, env: NodeJS.ProcessEnv): readonly string[] {
  const home = env.HOME ?? '';
  const paths: string[] = [];
  if (home) {
    paths.push(join(home, '.claude', 'settings.json'));
    paths.push(join(home, '.codex', 'hooks.json'));
  }
  paths.push(join(repoRoot, '.vscode', 'tasks.json'));
  paths.push(join(repoRoot, '.claude', 'settings.json'));
  paths.push(join(repoRoot, '.codex', 'hooks.json'));
  return paths;
}

function fingerprintLine(filePath: string): string {
  if (!existsSync(filePath)) return `missing ${filePath}`;
  try {
    return `${rawSha256(readFileSync(filePath))} ${filePath}`;
  } catch {
    return `missing ${filePath}`;
  }
}

/** `current_fingerprint="$(fingerprint_files)"` -- command substitution strips only the trailing newline(s); `join('\n')` over per-file lines reproduces that exactly. */
function computeSecurityFingerprint(repoRoot: string, env: NodeJS.ProcessEnv): string {
  return securityFingerprintPaths(repoRoot, env).map(fingerprintLine).join('\n');
}

function readPreviousFingerprint(repoRoot: string): string {
  try {
    // `cat "$STATE_FILE"` via command substitution strips trailing newlines identically.
    return readFileSync(join(repoRoot, SECURITY_STATE_FILE), 'utf-8').replace(/\n+$/, '');
  } catch {
    return '';
  }
}

/**
 * `render_context()` port. `report.status === 'ok'` or an empty findings
 * array both suppress the section (mirrors the bash JS's
 * `report.status === "ok" || !Array.isArray(report.findings) ||
 * report.findings.length === 0` early exit).
 */
function renderSecurityContext(report: SecurityScanReport): string | null {
  if (report.status === 'ok' || report.findings.length === 0) return null;
  const high = report.findings.filter((finding) => finding.severity === 'high').length;
  const fail = report.findings.filter((finding) => finding.severity === 'fail').length;
  const warn = report.findings.filter((finding) => finding.severity === 'warn').length;
  const first = report.findings[0];
  const bits = [`${report.findings.length} finding(s)`, `${high} high`, `${warn} warn`, `${fail} fail`];
  return `[SecurityConfig] ${bits.join(', ')}. First: ${first.ruleId} at ${first.filePath}. Run repo-harness security scan --json.`;
}

/**
 * Ports the fingerprint-gated (changed-only) scan-and-cache flow verbatim.
 * `security_scan()`'s subprocess chain (`bun $CLI security scan --json` /
 * `repo-harness security scan --json` / `agentic-dev security scan --json`)
 * collapses to a direct in-process call to `runSecurityScan()` -- the exact
 * function `doctor.ts` already calls in-process, and the same object
 * `formatSecurityScan(report, true)` would JSON.stringify unchanged (no
 * transform between the two), so this is not a "second" scan authority.
 * This is the section's `bun_cli` cost dropping to 0. On any unexpected
 * throw, mirrors bash's `security_scan` failure path: skip the cache write,
 * emit nothing, never fail the session.
 */
export function securitySentinelSessionContent(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): string | null {
  mkdirSync(join(repoRoot, SECURITY_DIR), { recursive: true });

  const currentFingerprint = computeSecurityFingerprint(repoRoot, env);
  const previousFingerprint = readPreviousFingerprint(repoRoot);
  if (currentFingerprint === previousFingerprint) return null;

  let report: SecurityScanReport;
  try {
    // Explicit `home` (rather than leaving runSecurityScan to default to
    // its own homeDir(), which reads process.env.HOME directly) keeps this
    // call honoring the SAME injected `env` the fingerprint above just used
    // -- they must agree on which HOME they are looking at.
    report = runSecurityScan({ cwd: repoRoot, home: env.HOME });
  } catch {
    return null;
  }

  writeFileSync(join(repoRoot, SECURITY_LATEST_FILE), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(repoRoot, SECURITY_STATE_FILE), `${currentFingerprint}\n`);

  return renderSecurityContext(report);
}

/** `mandatory`/`actionable` stay `true` unconditionally (`securityBoundary` short-circuits both in the retired runtime.ts branch), `reference` is the same `setup check` string the old branch assigned (`taskState` is false for this id too). */
export function securitySentinelSessionSection(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): SessionContextSection | null {
  const content = securitySentinelSessionContent(repoRoot, env);
  if (!content) return null;
  return {
    id: 'security-sentinel.sh',
    priority: 2,
    content,
    mandatory: true,
    actionable: true,
    reference: 'repo-harness setup check --json',
  };
}

// ---------------------------------------------------------------------------
// session-start-context.sh port (641 lines) -- shared small helpers
// ---------------------------------------------------------------------------

/** Structural subset of `StateInputCollector` this builder consumes -- no Effective State getter: none of these sections need it (the single resolution stays `effectiveStateSessionSection` in runtime.ts). */
export interface SessionContextCollector {
  getRepoRoot(): string;
  getWorktreeOwnership(): WorktreeOwnership;
  getActivePlanMarker(): string | null;
}

/** `xargs` with no command: word-splits on whitespace and rejoins with single spaces, in addition to trimming edges (not just `.trim()`). Several bash extractors this script uses (`get_plan_status`, sprint status, `current_status_field`) pipe through it. */
function xargsTrim(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).join(' ');
}

/** `workflow_repo_relative_path()` port -- verbatim duplicate of mutation-guard.ts's private `repoRelativePath` (that file is outside this package's Allowed Paths, so the ~10-line helper is re-ported here rather than shared). */
function repoRelativePath(value: string, defaultValue: string, allowedPrefix: string): string {
  if (!value || value.startsWith('/') || value.includes('\n') || value.includes('\r')) return defaultValue;
  if (value === '..' || value.startsWith('../') || value.endsWith('/..') || value.includes('/../')) {
    return defaultValue;
  }
  if (allowedPrefix && !value.startsWith(allowedPrefix)) return defaultValue;
  return value;
}

/** `workflow_policy_get()` port -- verbatim duplicate of mutation-guard.ts's private `policyGet` (nested-path variant), same "outside Allowed Paths" reasoning as `repoRelativePath` above. */
function policyGet(repoRoot: string, path: readonly string[], fallback: string): string {
  const raw = readText(repoRoot, '.ai/harness/policy.json');
  if (!raw) return fallback;
  try {
    let current: unknown = JSON.parse(raw);
    for (const segment of path) {
      if (current === null || typeof current !== 'object') return fallback;
      current = (current as Record<string, unknown>)[segment];
    }
    return typeof current === 'string' && current.length > 0 ? current : fallback;
  } catch {
    return fallback;
  }
}

function workflowResumePacketFile(repoRoot: string): string {
  const value = policyGet(repoRoot, ['handoff_resume', 'resume_packet_file'], '.ai/harness/handoff/resume.md');
  return repoRelativePath(value, '.ai/harness/handoff/resume.md', '.ai/harness/');
}

function workflowHandoffFile(repoRoot: string): string {
  const value = policyGet(repoRoot, ['harness', 'handoff_file'], '.ai/harness/handoff/current.md');
  return repoRelativePath(value, '.ai/harness/handoff/current.md', '.ai/harness/');
}

function workflowPendingOrchestrationFile(repoRoot: string): string {
  const value = policyGet(repoRoot, ['planning', 'pending_orchestration_file'], '.ai/harness/planning/pending.json');
  return repoRelativePath(value, '.ai/harness/planning/pending.json', '.ai/harness/');
}

function workflowEventsFile(repoRoot: string): string {
  const value = policyGet(repoRoot, ['harness', 'events_file'], '.ai/harness/events.jsonl');
  return repoRelativePath(value, '.ai/harness/events.jsonl', '.ai/harness/');
}

function workflowTargetBranch(repoRoot: string): string {
  let target = policyGet(repoRoot, ['worktree_strategy', 'merge_back', 'target'], '');
  if (!target) target = policyGet(repoRoot, ['worktree_strategy', 'base_branch'], 'main');
  return target || 'main';
}

/** `find LABEL line, strip through the LAST marker occurrence, xargs` -- shared shape behind `get_plan_status` and the sprint-status awk (both search any line containing `**Status**:`, not just lines anchored at `> `). */
function findMarkerLine(text: string, marker: string): string | null {
  for (const rawLine of text.split('\n')) {
    if (!rawLine.includes(marker)) continue;
    const idx = rawLine.lastIndexOf(marker);
    return rawLine.slice(idx + marker.length).replace(/\r/g, '');
  }
  return null;
}

function planStatusField(text: string): string {
  const raw = findMarkerLine(text, '**Status**:');
  return raw === null ? '' : xargsTrim(raw);
}

function fileMtimeSec(repoRoot: string, relPath: string): number | null {
  try {
    return Math.floor(statSync(join(repoRoot, relPath)).mtimeMs / 1000);
  } catch {
    return null;
  }
}

function gitCurrentBranch(repoRoot: string): string {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function gitRefExists(repoRoot: string, ref: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function gitShowFileAtRef(repoRoot: string, ref: string, relPath: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${relPath}`], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/** `get_active_plan()` port -- verbatim duplicate of mutation-guard.ts's private `getActivePlan(ctx)` over this module's own (smaller) collector shape. */
function getActivePlan(collector: SessionContextCollector): string | null {
  const ownership = collector.getWorktreeOwnership();
  const matchesCwd = ownership.owner === null || ownership.ownedByCurrent;
  if (!matchesCwd) return null;
  const marker = collector.getActivePlanMarker();
  if (!marker) return null;
  return fileExists(collector.getRepoRoot(), marker) ? marker : null;
}

// ---------------------------------------------------------------------------
// session-start-context.sh port -- cold-path event-log rotation
// ---------------------------------------------------------------------------
//
// Gatekeeper blocking finding (PORT decision): the base script's own
// top-of-file housekeeping --
//   workflow_rotate_events_file "$(workflow_events_file)" 2>/dev/null || true
//   workflow_rotate_events_file ".ai/harness/architecture/events.jsonl" 2>/dev/null || true
// -- was dropped in the first pass. Operator helpers still append lifecycle
// events, while typed host handlers may write trace/runtime evidence; without
// rotation those durable files grow unbounded. Ported
// verbatim from `assets/hooks/lib/workflow-state.sh`'s
// `workflow_rotate_events_file` / `_locked` / `workflow_with_lock`
// (thresholds: 2000 lines / 524288 bytes / keep 500), including the mkdir-based
// mutual-exclusion lock (protects against a concurrent operator helper or
// typed host process appending mid-rotation; this is a genuine cross-process
// race the architecture still needs to guard
// against, not merely an old bash implementation detail). Produces no
// session content -- pure housekeeping, called before any of the 8
// sub-blocks below, matching the base script's own call order.

/** `wc -l`/`wc -c` port: `wc -l` counts NEWLINE BYTES, not "lines" in the text sense (a file lacking a trailing newline is undercounted by one relative to its visual line count) -- this must stay a raw byte count to match bash exactly. */
function fileLineAndByteCount(absPath: string): { lines: number; bytes: number } | null {
  let content: Buffer;
  try {
    content = readFileSync(absPath);
  } catch {
    return null;
  }
  let lines = 0;
  for (let i = 0; i < content.length; i += 1) if (content[i] === 0x0a) lines += 1;
  return { lines, bytes: content.length };
}

/**
 * `head -n N "$file"` / `tail -n N "$file"` port, splitting on `\n` the same
 * way both POSIX tools do: a trailing partial (non-newline-terminated)
 * final segment still counts as one more "line" for head/tail purposes even
 * though `wc -l` (byte-newline-count) does not count it -- so
 * `lines.length` can be one more than `wcLineCount` for a file missing its
 * final newline. `cut`/`keep` are always computed from the `wc -l`-based
 * count (matching bash's own `cut=$((lines - keep))`), so this mirrors
 * bash's own behavior byte-for-byte for the well-formed (trailing-newline)
 * case this system's own writer (`workflow_locked_append_line`) always
 * produces, and reproduces the same (bash-inherent, not TS-introduced)
 * "one line unaccounted for" quirk on a malformed/truncated file missing
 * its final newline, rather than engineering something bash itself doesn't do.
 */
function readEventsFileForRotation(absPath: string): { lines: readonly string[]; wcLineCount: number } | null {
  let content: string;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
  if (content === '') return { lines: [], wcLineCount: 0 };
  const endsWithNewline = content.endsWith('\n');
  let lines = content.split('\n');
  if (endsWithNewline) lines = lines.slice(0, -1);
  const wcLineCount = endsWithNewline ? lines.length : lines.length - 1;
  return { lines, wcLineCount };
}

/** Synchronous blocking sleep (bash's own `sleep 0.05` blocks its single-threaded script too) -- `Atomics.wait` on a value that never changes is the standard synchronous-sleep primitive in Node/Bun. */
function sleepSyncMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * `workflow_with_lock()` port: mkdir-based mutual exclusion. Spins up to 40
 * times at 50ms (~2s), breaks a lock older than 60s (crashed holder), and as
 * a last resort runs the callback unlocked rather than wedging SessionStart
 * -- verbatim thresholds from the bash source. `lockRoot` is always
 * `dirname(workflowEventsFile()) + "/.locks"`, computed ONCE by the caller
 * and reused for both rotation targets, matching bash's own
 * `workflow_with_lock`'s unconditional `lock_root="$(dirname "$(workflow_events_file)")/.locks"`
 * regardless of which file is actually being locked (so both rotation calls
 * share one lock namespace root, differentiated only by `name`).
 */
function withEventsLock(lockRoot: string, name: string, fn: () => void): void {
  const lockDir = join(lockRoot, `${name}.lock`);
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
        let mtimeSec: number | null = null;
        try {
          mtimeSec = Math.floor(statSync(lockDir).mtimeMs / 1000);
        } catch {
          mtimeSec = null;
        }
        const nowSec = Math.floor(Date.now() / 1000);
        if (mtimeSec !== null && mtimeSec > 0 && nowSec - mtimeSec >= 60) {
          try {
            rmdirSync(lockDir);
          } catch {
            // matches bash's `rmdir ... || true`
          }
          waited = 0;
          continue;
        }
        fn();
        return;
      }
      sleepSyncMs(50);
      waited += 1;
    }
  }

  try {
    fn();
  } finally {
    try {
      rmdirSync(lockDir);
    } catch {
      // matches bash's `rmdir ... || true`
    }
  }
}

/** `workflow_rotate_events_file_locked()` port. */
function workflowRotateEventsFileLocked(repoRoot: string, relPath: string, wcLineCount: number, keep: number): void {
  const absPath = join(repoRoot, relPath);
  const parsed = readEventsFileForRotation(absPath);
  if (parsed === null) return;

  const cut = wcLineCount - keep;
  const archiveDir = join(dirname(absPath), 'archive');
  const stamp = (() => {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();
  const base = basename(relPath).replace(/\.jsonl$/, '');
  const archiveFile = join(archiveDir, `${base}-${stamp}.jsonl`);

  try {
    mkdirSync(archiveDir, { recursive: true });
  } catch {
    return;
  }

  const headLines = parsed.lines.slice(0, cut);
  const tailLines = parsed.lines.slice(cut);
  const archiveChunk = headLines.map((line) => `${line}\n`).join('');
  const keptContent = tailLines.map((line) => `${line}\n`).join('');

  try {
    appendFileSync(archiveFile, archiveChunk);
    const tmpPath = `${absPath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmpPath, keptContent);
    renameSync(tmpPath, absPath);
  } catch {
    // matches bash's `else rm -f "$tmp"` fallback -- best-effort, never
    // throws out of a cold-path housekeeping step.
  }
}

/** `workflow_rotate_events_file()` port. */
function workflowRotateEventsFile(
  repoRoot: string,
  relPath: string,
  lockRoot: string,
  maxLines = 2000,
  maxBytes = 524288,
  keep = 500,
): void {
  const absPath = join(repoRoot, relPath);
  if (!existsSync(absPath)) return;
  const counts = fileLineAndByteCount(absPath);
  if (counts === null) return;
  if (counts.lines <= maxLines && counts.bytes <= maxBytes) return;
  if (!(counts.lines > keep)) return;

  withEventsLock(lockRoot, `evt-${basename(relPath)}`, () => {
    workflowRotateEventsFileLocked(repoRoot, relPath, counts.lines, keep);
  });
}

/** Both cold-path rotation targets, in the base script's own call order. Never throws (mirrors `2>/dev/null || true` on each call). */
function rotateSessionStartEventLogs(repoRoot: string): void {
  const lockRoot = join(dirname(join(repoRoot, workflowEventsFile(repoRoot))), '.locks');
  try {
    workflowRotateEventsFile(repoRoot, workflowEventsFile(repoRoot), lockRoot);
  } catch {
    /* cold-path housekeeping must never fail the session */
  }
  try {
    workflowRotateEventsFile(repoRoot, '.ai/harness/architecture/events.jsonl', lockRoot);
  } catch {
    /* cold-path housekeeping must never fail the session */
  }
}

// ---------------------------------------------------------------------------
// session-start-context.sh port -- the 8 composed sub-blocks, in file order
// ---------------------------------------------------------------------------

const ACTIVE_PLAN_STATUSES = new Set([
  'approved', 'executing', 'review', 'reviewing', 'active', 'in-progress', 'in progress',
]);

function activePlanExists(collector: SessionContextCollector): boolean {
  const planFile = getActivePlan(collector);
  if (!planFile) return false;
  const text = readText(collector.getRepoRoot(), planFile) ?? '';
  return ACTIVE_PLAN_STATUSES.has(planStatusField(text).toLowerCase());
}

function activeTodoExists(repoRoot: string): boolean {
  const text = readText(repoRoot, 'tasks/todos.md');
  if (text === null) return false;
  if (/^> \*\*Status\*\*:[ \t]*(Executing|Active|Review|Reviewing|In Progress)[ \t]*$/m.test(text)) return true;
  const hasUnchecked = /^[ \t]*-[ \t]\[[ \t]\][ \t]+/m.test(text);
  return hasUnchecked && !text.includes('No active execution checklist');
}

function handoffSectionHasSignal(repoRoot: string, handoffFile: string, header: string): boolean {
  const text = readText(repoRoot, handoffFile);
  if (text === null) return false;
  let inSection = false;
  let found = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line === header) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) break;
    if (!inSection) continue;
    const stripped = line.replace(/^[\s-]+/, '').replace(/\s+$/, '');
    if (stripped === '' || stripped === '```' || stripped === '(none)' || stripped === '(none recorded)') continue;
    found = true;
  }
  return found;
}

function resumeAvailable(repoRoot: string, resumeFile: string): boolean {
  const text = readText(repoRoot, resumeFile);
  if (text === null) return false;
  return (
    text.includes('<!-- generated-by: repo-harness codex-handoff-resume v1 -->') &&
    text.includes('## Resume Prompt')
  );
}

function resumeCurrentForHandoff(repoRoot: string, resumeFile: string, handoffFile: string): boolean {
  if (!resumeAvailable(repoRoot, resumeFile)) return false;
  if (!fileExists(repoRoot, handoffFile)) return true;
  const resumeMtime = fileMtimeSec(repoRoot, resumeFile);
  const handoffMtime = fileMtimeSec(repoRoot, handoffFile);
  if (resumeMtime === null || handoffMtime === null) return true;
  return resumeMtime >= handoffMtime;
}

/**
 * `awk 'length(total) < 12000 { total = total $0 "\n" } END { printf "%s", total }'`
 * -- keeps whole lines while the running total is under the cap (checked
 * BEFORE appending), so the result can overshoot by up to one line's length
 * but never truncates mid-line.
 *
 * Gatekeeper S5 fix: the awk `total` variable (and `printf "%s", total`)
 * itself ends with `\n` after the last appended line, but bash captures
 * this via `context="$(awk ...)"` -- command substitution strips ALL
 * trailing newlines from the captured value. Without stripping here too,
 * `resumeBlock`'s caller (`appendBlock`) would join a later section with an
 * extra blank line (this value's own trailing `\n` plus appendBlock's own
 * `\n` separator).
 */
function capResumeContent(text: string, capChars = 12000): string {
  let lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
  let total = '';
  for (const line of lines) {
    if (total.length >= capChars) break;
    total += `${line}\n`;
  }
  return total.replace(/\n+$/, '');
}

/** 1. `resume_current_for_handoff` gate + the capped resume.md blob. */
function resumeBlock(repoRoot: string, collector: SessionContextCollector): string {
  const resumeFile = workflowResumePacketFile(repoRoot);
  const handoffFile = workflowHandoffFile(repoRoot);
  if (!resumeCurrentForHandoff(repoRoot, resumeFile, handoffFile)) return '';
  const signal =
    activePlanExists(collector) ||
    activeTodoExists(repoRoot) ||
    handoffSectionHasSignal(repoRoot, handoffFile, '## Blockers') ||
    handoffSectionHasSignal(repoRoot, handoffFile, '## Changed Files');
  if (!signal) return '';
  return capResumeContent(readText(repoRoot, resumeFile) ?? '');
}

/** 2. `capability_context_pending` -- ".request_id" existing-but-non-string rows still count toward pending_count in jq (`// empty` only drops null/absent); the display list silently skips rows missing capability_id/path (jq would error per-row and jq's own multi-input error recovery is not worth replicating for a queue format this repo always writes complete). */
function capabilityContextPendingContext(repoRoot: string): string | null {
  const raw = readText(repoRoot, '.ai/harness/capability-context/requests.jsonl');
  if (!raw || raw.trim() === '') return null;
  let pendingCount = 0;
  const lineSet = new Set<string>();
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== 'object' || (obj as Record<string, unknown>).status !== 'pending') continue;
    pendingCount += 1;
    const capabilityId = (obj as Record<string, unknown>).capability_id;
    const path = (obj as Record<string, unknown>).path;
    if (typeof capabilityId === 'string' && typeof path === 'string') {
      lineSet.add(`- ${capabilityId} <- \`${path}\``);
    }
  }
  const pendingLines = [...lineSet].sort().slice(0, 10).join('\n');
  if (pendingCount === 0 || !pendingLines) return null;
  return [
    '# Capability Context Queue',
    '',
    `Pending capability context requests detected (${pendingCount}). Run:`,
    '',
    '```bash',
    'repo-harness capability-context sync --pending --apply',
    '```',
    '',
    'Queued capabilities:',
    pendingLines,
  ].join('\n');
}

/** 3. `architecture_queue_pending` -- `date -j -f '%Y-%m-%d'` parses in LOCAL time, matched here with the local-time `Date(y,m,d)` constructor rather than a UTC `Date.parse`. */
function architectureQueuePendingContext(repoRoot: string, nowMs: number): string | null {
  const requestsDir = 'docs/architecture/requests';
  const absDir = join(repoRoot, requestsDir);
  let entries: string[];
  try {
    entries = readdirSync(absDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return null;
  }

  let pendingCount = 0;
  let oldestEpochSec: number | null = null;
  for (const name of entries) {
    const relPath = `${requestsDir}/${name}`;
    const text = readText(repoRoot, relPath);
    if (text === null) continue;
    if (!/^> \*\*Status\*\*:[ \t]*Pending[ \t]*$/m.test(text)) continue;
    pendingCount += 1;
    const match = /^> \*\*Detected\*\*:[ \t]*(.*)$/m.exec(text);
    const detectedDate = (match ? match[1].trim() : '').split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(detectedDate)) {
      const [y, m, d] = detectedDate.split('-').map(Number);
      const epochSec = Math.floor(new Date(y, m - 1, d).getTime() / 1000);
      if (oldestEpochSec === null || epochSec < oldestEpochSec) oldestEpochSec = epochSec;
    }
  }
  if (pendingCount === 0) return null;

  const nowEpochSec = Math.floor(nowMs / 1000);
  const oldestDays =
    oldestEpochSec !== null && nowEpochSec >= oldestEpochSec
      ? `${Math.floor((nowEpochSec - oldestEpochSec) / 86400)}d`
      : 'unknown';

  return [
    '# Architecture Queue',
    '',
    `${pendingCount} capabilities have pending architecture drift (oldest ${oldestDays}). Run:`,
    '',
    '```bash',
    'repo-harness run architecture-queue status',
    '```',
  ].join('\n');
}

interface PendingOrchestration {
  readonly [field: string]: unknown;
}

function readPendingOrchestration(repoRoot: string): PendingOrchestration | null {
  const raw = readText(repoRoot, workflowPendingOrchestrationFile(repoRoot));
  if (!raw || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as PendingOrchestration) : null;
  } catch {
    return null;
  }
}

function pendingOrchestrationField(pending: PendingOrchestration | null, field: string): string {
  const value = pending?.[field];
  return typeof value === 'string' && value !== '' && value !== 'null' ? value : '';
}

function pendingOrchestrationIsFresh(
  repoRoot: string,
  pending: PendingOrchestration | null,
  nowMs: number,
  maxAgeSec = 259200,
): boolean {
  if (!pending) return false;
  const mtimeSec = fileMtimeSec(repoRoot, workflowPendingOrchestrationFile(repoRoot));
  const nowSec = Math.floor(nowMs / 1000);
  if (mtimeSec !== null && nowSec - mtimeSec <= maxAgeSec) return true;

  const draftPath = pendingOrchestrationField(pending, 'draft_plan_path');
  if (draftPath && fileExists(repoRoot, draftPath)) {
    const status = planStatusField(readText(repoRoot, draftPath) ?? '').toLowerCase();
    if (status === 'draft' || status === 'annotating' || status === '') {
      if (mtimeSec !== null && nowSec - mtimeSec <= 604800) return true;
    }
  }
  return false;
}

function pendingOrchestrationSummary(pending: PendingOrchestration | null): string {
  const kind = pendingOrchestrationField(pending, 'kind');
  const host = pendingOrchestrationField(pending, 'host');
  const promptSlug = pendingOrchestrationField(pending, 'prompt_slug');
  const draftPath = pendingOrchestrationField(pending, 'draft_plan_path');
  const sourceRef = pendingOrchestrationField(pending, 'source_ref');
  const expectedArtifact = pendingOrchestrationField(pending, 'expected_artifact');
  const cwd = pendingOrchestrationField(pending, 'cwd');
  let out = `kind=${kind || 'unknown'} host=${host || 'unknown'} expected=${expectedArtifact || 'plan'} slug=${promptSlug || 'planning'}`;
  if (draftPath) out += ` draft=${draftPath}`;
  if (sourceRef) out += ` source_ref=${sourceRef}`;
  if (cwd) out += ` cwd=${cwd}`;
  return out;
}

/** 4. `pending_plan_capture_context`. */
function pendingPlanCaptureContext(repoRoot: string, collector: SessionContextCollector, nowMs: number): string | null {
  const pending = readPendingOrchestration(repoRoot);
  if (!pendingOrchestrationIsFresh(repoRoot, pending, nowMs)) return null;
  const activePlan = getActivePlan(collector);
  if (activePlan && fileExists(repoRoot, activePlan)) return null;

  const summary = pendingOrchestrationSummary(pending);
  const draftPath = pendingOrchestrationField(pending, 'draft_plan_path');
  const promptSlug = pendingOrchestrationField(pending, 'prompt_slug');
  const kind = pendingOrchestrationField(pending, 'kind');
  const sourceRef = pendingOrchestrationField(pending, 'source_ref');
  const captureSource = kind || 'host-plan';
  const sourceArg = sourceRef ? ' --source-ref <source-ref>' : '';
  const captureCmd = 'repo-harness run capture-plan';

  return [
    '# Pending Plan Capture',
    '',
    'A host/thread planning discussion is pending capture and no active repo plan is selected.',
    '',
    `- State: ${summary}`,
    `- Draft plan: ${draftPath || '(none captured yet)'}`,
    '- Rule: continue discussion freely, but do not edit implementation files until the final plan body is captured into `plans/`.',
    '',
    'Capture the decision-complete plan body:',
    '',
    '```bash',
    `printf '%s\\n' '<decision-complete plan body>' | ${captureCmd} --slug ${promptSlug || '<slug>'} --title <title> --status Draft --source ${captureSource} --orchestration-kind ${captureSource} --route planning${sourceArg}`,
    '```',
    '',
    'If the user has already approved implementation:',
    '',
    '```bash',
    `printf '%s\\n' '<approved plan body>' | ${captureCmd} --slug ${promptSlug || '<slug>'} --title <title> --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --source ${captureSource} --orchestration-kind ${captureSource} --route planning --execute${sourceArg}`,
    '```',
  ].join('\n');
}

function currentStatusField(text: string, label: string): string {
  const prefix = `> **${label}**:`;
  for (const rawLine of text.split('\n')) {
    if (!rawLine.startsWith(prefix)) continue;
    const rest = rawLine.slice(prefix.length).replace(/^ */, '').replace(/\r/g, '');
    return xargsTrim(rest);
  }
  return '';
}

/** 5. `current_status_snapshot_context` -- two sequential bash heredocs with nothing between them; the "Target snapshot metadata" line directly follows "- Rule: ..." with no blank line. */
function currentStatusSnapshotContext(repoRoot: string): string | null {
  const target = workflowTargetBranch(repoRoot);
  const branch = gitCurrentBranch(repoRoot);
  const currentText = readText(repoRoot, 'tasks/current.md') ?? '';
  const status = currentText ? currentStatusField(currentText, 'Status') : '';
  const updated = currentText ? currentStatusField(currentText, 'Updated At') : '';
  const sourceCommit = currentText ? currentStatusField(currentText, 'Source Commit') : '';

  if (!status) {
    const targetShowable =
      branch !== target && gitRefExists(repoRoot, target) && gitShowFileAtRef(repoRoot, target, 'tasks/current.md') !== null;
    if (!targetShowable) return null;
  }
  if (!status && branch === target) return null;
  if (status === 'Idle' && branch === target) return null;

  const lines = [
    '# Current Status Snapshot',
    '',
    `- Local snapshot: \`tasks/current.md\` status=${status || '(missing)'} updated=${updated || '(unknown)'} source_commit=${sourceCommit || '(unknown)'}`,
    `- Target branch snapshot: \`git show ${target}:tasks/current.md\``,
    '- Rule: this is a tracked read model only; verify stale or surprising state against plans, workstreams, handoff, and checks before acting.',
  ];

  if (branch !== target && gitRefExists(repoRoot, target)) {
    const targetText = gitShowFileAtRef(repoRoot, target, 'tasks/current.md');
    if (targetText !== null) {
      const targetStatus = currentStatusField(targetText, 'Status');
      const targetUpdated = currentStatusField(targetText, 'Updated At');
      if (targetStatus) {
        lines.push(`- Target snapshot metadata: status=${targetStatus} updated=${targetUpdated || '(unknown)'}`);
      }
    }
  }
  return lines.join('\n');
}

function activeSprintMarkerPath(repoRoot: string): string {
  const raw = readText(repoRoot, '.ai/harness/policy.json');
  if (raw) {
    try {
      const policy = JSON.parse(raw) as { sprints?: { active_marker_file?: unknown } };
      const marker = policy.sprints?.active_marker_file;
      if (typeof marker === 'string' && marker.trim()) return marker;
    } catch {
      /* fall through to default */
    }
  }
  return '.ai/harness/sprint/active-sprint';
}

/** `-F '|'` table-row scan for the `## Backlog` section: `cols[2]` is the Status checkbox cell, `cols[3]` the Task cell (awk's 1-indexed $3/$4 over the same split). Both the done/total tally and the first unchecked task are collected in one pass (two independent awk scripts in bash, merged here since neither observes the other's state). */
function sprintBacklogProgress(text: string): { progress: string; nextTask: string } {
  let inSection = false;
  let done = 0;
  let total = 0;
  let nextTask: string | null = null;
  const rowPattern = /^\|\s*\d+\s*\|/;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (/^## Backlog[ \t]*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) break;
    if (!inSection || !rowPattern.test(line)) continue;
    const cols = line.split('|');
    const statusCell = (cols[2] ?? '').trim();
    const taskCell = (cols[3] ?? '').trim();
    total += 1;
    if (/^\[[xX]\]$/.test(statusCell)) done += 1;
    if (nextTask === null && statusCell === '[ ]') nextTask = taskCell;
  }
  return { progress: `${done}/${total}`, nextTask: nextTask ?? '(none)' };
}

/** 6. `active_sprint_context`. */
function activeSprintContext(repoRoot: string): string | null {
  const marker = activeSprintMarkerPath(repoRoot);
  if (!fileExists(repoRoot, marker)) return null;
  const sprintFile = xargsTrim(readText(repoRoot, marker) ?? '');
  if (!sprintFile || !fileExists(repoRoot, sprintFile)) return null;

  const sprintText = readText(repoRoot, sprintFile) ?? '';
  const status = planStatusField(sprintText);
  const { progress, nextTask } = sprintBacklogProgress(sprintText);

  return [
    '# Active Sprint',
    '',
    `- Sprint: \`${sprintFile}\` status=${status || 'unknown'} backlog=${progress}`,
    `- Next sprint task: ${nextTask}`,
    '- Rule: a Sprint is a long-task container. Use `$think` to expand the next sprint task into a detailed `plans/plan-*.md`, then run the existing plan -> contract -> worktree flow. `tasks/todos.md` stays the deferred-goal ledger.',
    `- Entrypoint: inspect with \`repo-harness run sprint-backlog next\`; after \`$think\` produces an approved plan, capture it with \`repo-harness run capture-plan --source waza-think --source-ref sprint:${sprintFile}#${nextTask}\`.`,
  ].join('\n');
}

const TOOLING_ADVISORY_STATE_DIR = '.ai/harness/security';

function toolingUpdateTarget(env: NodeJS.ProcessEnv): string {
  return env.HOOK_HOST === 'codex' || env.HOOK_HOST === 'claude' ? env.HOOK_HOST : 'both';
}

function toolingAdvisoryTtlSeconds(env: NodeJS.ProcessEnv): number {
  const raw = env.REPO_HARNESS_TOOLING_ADVISORY_TTL_SECONDS;
  if (raw === undefined) return 604800;
  if (!/^\d+$/.test(raw)) return 86400;
  return Number(raw);
}

function toolingUpdateCacheIsFresh(repoRoot: string, reportFile: string, env: NodeJS.ProcessEnv, nowMs: number): boolean {
  if (!fileExists(repoRoot, reportFile)) return false;
  const ttl = toolingAdvisoryTtlSeconds(env);
  if (!(ttl > 0)) return false;
  if (env.REPO_HARNESS_TOOLING_ADVISORY_FORCE === '1') return false;
  const mtimeSec = fileMtimeSec(repoRoot, reportFile);
  if (mtimeSec === null) return false;
  const nowSec = Math.floor(nowMs / 1000);
  if (nowSec < mtimeSec) return false;
  return nowSec - mtimeSec < ttl;
}

function renderToolingUpdateContext(repoRoot: string, reportFile: string): string | null {
  const raw = readText(repoRoot, reportFile);
  if (!raw) return null;
  let report: { agent_actions?: unknown };
  try {
    report = JSON.parse(raw) as { agent_actions?: unknown };
  } catch {
    return null;
  }
  const actions = Array.isArray(report.agent_actions) ? (report.agent_actions as Record<string, unknown>[]) : [];
  const updateActions = actions.filter((action) => {
    const id = typeof action?.id === 'string' ? action.id : '';
    return id === 'cli.update' || /^tooling\.[^.]+\.update$/.test(id);
  });
  if (updateActions.length === 0) return null;

  const lines: string[] = [
    '# Tooling Update Advisory',
    '',
    'repo-harness setup check found version updates. Agent should run the bounded update command(s), then verify.',
  ];
  for (const action of updateActions.slice(0, 5)) {
    const id = typeof action.id === 'string' ? action.id : 'unknown';
    const reason = typeof action.reason === 'string' ? action.reason : 'update available';
    lines.push(`- ${id}: ${reason}`);
    if (typeof action.command === 'string' && action.command) lines.push(`  command: \`${action.command}\``);
    if (typeof action.verification === 'string' && action.verification) lines.push(`  verify: \`${action.verification}\``);
  }
  if (updateActions.length > 5) {
    lines.push(`- ${updateActions.length - 5} more update action(s): run \`repo-harness setup check --check-updates --json\`.`);
  }
  return lines.join('\n');
}

function toolingUpdateReportWasRendered(repoRoot: string, reportFile: string, markerFile: string): boolean {
  if (!fileExists(repoRoot, reportFile) || !fileExists(repoRoot, markerFile)) return false;
  const reportMtime = fileMtimeSec(repoRoot, reportFile);
  const markerRaw = (readText(repoRoot, markerFile) ?? '').replace(/\s/g, '');
  return reportMtime !== null && String(reportMtime) === markerRaw;
}

function toolingUpdateMarkReportRendered(repoRoot: string, reportFile: string, markerFile: string): void {
  const reportMtime = fileMtimeSec(repoRoot, reportFile);
  if (reportMtime === null) return;
  writeFileSync(join(repoRoot, markerFile), `${reportMtime}\n`);
}

/**
 * `repo_harness_setup_check()` port. Kept as a real subprocess call (unlike
 * every other CLI indirection in this file) for two reasons: (1) it is the
 * one path a test (tests/hook-runtime.test.ts "emits tooling update agent
 * actions once per cached report") deliberately intercepts via a fake
 * PATH-injected `repo-harness` binary to keep the report content
 * controlled/deterministic -- calling `runInitHook()` in-process would
 * bypass that interception point entirely and make the section depend on
 * whatever this machine's real tooling state happens to be; (2) this branch
 * requires `REPO_HARNESS_TOOLING_ADVISORY_SYNC=1` (an opt-in escape hatch
 * that never fires in the golden characterization run), so it does not
 * touch the `bun_cli` cost story either way. Two-tier resolution mirrors
 * bash exactly: `bun $REPO_HARNESS_CLI` when that path is a real file, else
 * `repo-harness` on PATH; either tier's failure returns null with no
 * fallthrough, matching bash's own `return $?` inside the first `if`.
 */
function repoHarnessSetupCheckSubprocess(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  target: string,
): string | null {
  const args = ['setup', 'check', '--target', target, '--check-updates', '--json'];
  const cliPath = env.REPO_HARNESS_CLI;
  if (cliPath && existsSync(cliPath)) {
    try {
      return execFileSync('bun', [cliPath, ...args], {
        cwd: repoRoot,
        encoding: 'utf-8',
        env,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return null;
    }
  }
  try {
    return execFileSync('repo-harness', args, {
      cwd: repoRoot,
      encoding: 'utf-8',
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/** `REPO_HARNESS_TOOLING_ADVISORY_SYNC=1` branch: populate the cache synchronously, then render+mark exactly like the fresh-cache path. On any subprocess failure, mirrors bash: no cache write, no render. */
function toolingUpdateSyncPopulateAndRender(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  target: string,
  reportFile: string,
  markerFile: string,
): string | null {
  const stdout = repoHarnessSetupCheckSubprocess(repoRoot, env, target);
  if (stdout === null) return null;
  writeFileSync(join(repoRoot, reportFile), stdout);
  if (toolingUpdateReportWasRendered(repoRoot, reportFile, markerFile)) return null;
  const content = renderToolingUpdateContext(repoRoot, reportFile);
  toolingUpdateMarkReportRendered(repoRoot, reportFile, markerFile);
  return content;
}

/** `evt-` lock's own crashed-holder threshold (`workflow_with_lock`'s 60s) reused for the tooling-advisory lock -- see `acquireToolingAdvisoryLock`'s doc comment for why this exists even though bash's own async branch had no such handling. */
const TOOLING_ADVISORY_LOCK_STALE_SECONDS = 60;

/** Marks a `bun session-context.ts <flag> <repoRoot> <target> <reportFile> <lockDir>` standalone invocation -- see the `import.meta.main` bootstrap at the bottom of this file. */
const DETACHED_TOOLING_POPULATE_FLAG = '--detached-tooling-populate';

/**
 * Gatekeeper MEDIUM (adjudicated fix): restores the cross-session TTL
 * refresh cycle bash's detached background subshell provided. Runs in its
 * OWN separate, `unref()`'d process (spawned by `triggerDetachedToolingPopulate`
 * below) so it outlives the triggering SessionStart hook, which exits
 * immediately after spawning -- that is the entire point of "detached".
 * Mirrors bash's backgrounded subshell exactly: populate the report cache
 * on success, and ALWAYS remove the lock dir when done (success OR
 * failure), so a later session's trigger can acquire it again. Never
 * renders/marks-rendered here -- exactly like bash, only a LATER session
 * that finds the cache fresh does that.
 */
export function runDetachedToolingPopulate(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  target: string,
  reportFile: string,
  lockDir: string,
): void {
  try {
    const stdout = repoHarnessSetupCheckSubprocess(repoRoot, env, target);
    if (stdout !== null) {
      writeFileSync(join(repoRoot, reportFile), stdout);
    }
  } finally {
    try {
      rmdirSync(join(repoRoot, lockDir));
    } catch {
      // Already removed / never fully created -- matches bash's own
      // `rmdir "$lock_dir" 2>/dev/null || true`.
    }
  }
}

/**
 * `if mkdir "$lock_dir" 2>/dev/null; then ... fi` port, PLUS a deliberate
 * improvement bash's own async branch never had: bash's backgrounded
 * subshell is the ONLY thing that ever removes this lock dir, so if it dies
 * mid-flight (OOM, forced kill, host sleep) before reaching its own
 * `rmdir`, the lock is left behind FOREVER and every future session's
 * `mkdir` attempt fails forever, permanently suppressing the refresh cycle
 * -- a latent bash bug, not a behavior worth preserving. Reuses
 * `workflow_with_lock`'s own 60s crashed-holder threshold (the only "sane
 * age" precedent this codebase already establishes) to break a stale lock
 * and retry once; a lock younger than that is left alone (a populate is
 * plausibly still genuinely in progress).
 */
function acquireToolingAdvisoryLock(repoRoot: string, lockDir: string): boolean {
  const absLockDir = join(repoRoot, lockDir);
  try {
    mkdirSync(absLockDir);
    return true;
  } catch {
    let mtimeSec: number | null;
    try {
      mtimeSec = Math.floor(statSync(absLockDir).mtimeMs / 1000);
    } catch {
      return false; // vanished between the failed mkdir and this stat; next session tries again
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - mtimeSec < TOOLING_ADVISORY_LOCK_STALE_SECONDS) return false;
    try {
      rmdirSync(absLockDir);
      mkdirSync(absLockDir);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Spawns the detached populate as a standalone `bun session-context.ts
 * --detached-tooling-populate ...` process (not a plain callback in this
 * process: a `spawn(...).unref()`'d NODE-SIDE callback would never run --
 * this process's own event loop stops the moment SessionStart returns and
 * the host hook process exits, which is the whole reason bash used a
 * backgrounded, independent subshell instead of "do it later in the same
 * script"). `detached: true` + `unref()` means the parent never waits, and
 * the child is reparented (survives the parent exiting), matching bash's
 * own orphaned-background-job semantics.
 */
function triggerDetachedToolingPopulate(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  target: string,
  reportFile: string,
  lockDir: string,
): void {
  if (!acquireToolingAdvisoryLock(repoRoot, lockDir)) return;
  try {
    const child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), DETACHED_TOOLING_POPULATE_FLAG, repoRoot, target, reportFile, lockDir],
      { cwd: repoRoot, env, detached: true, stdio: 'ignore' },
    );
    child.unref();
  } catch {
    // Spawn itself failed; release the lock we just acquired instead of
    // leaking it, so a later session can try again.
    try {
      rmdirSync(join(repoRoot, lockDir));
    } catch {
      /* ignore */
    }
  }
}

/**
 * 7. `tooling_update_advisory_context`. The fresh-cache render path (the
 * steady-state case) and the `REPO_HARNESS_TOOLING_ADVISORY_SYNC=1` path are
 * both ported with full fidelity. The DEFAULT stale-cache path now also
 * triggers a detached background populate (see `triggerDetachedToolingPopulate`)
 * restoring bash's own cross-session TTL refresh cycle; either way it
 * contributes ZERO content to the *triggering* session's own stdout, exactly
 * like bash's backgrounded subshell.
 */
function toolingUpdateAdvisoryContext(repoRoot: string, env: NodeJS.ProcessEnv, nowMs: number): string | null {
  if (!fileExists(repoRoot, '.ai/harness/workflow-contract.json')) return null;
  if (env.REPO_HARNESS_TOOLING_ADVISORY === '0') return null;

  const target = toolingUpdateTarget(env);
  const reportFile = `${TOOLING_ADVISORY_STATE_DIR}/tooling-update-advisory-${target}.json`;
  const markerFile = `${TOOLING_ADVISORY_STATE_DIR}/tooling-update-advisory-${target}.rendered`;
  const lockDir = `${TOOLING_ADVISORY_STATE_DIR}/tooling-update-advisory-${target}.lock`;

  if (toolingUpdateCacheIsFresh(repoRoot, reportFile, env, nowMs)) {
    if (toolingUpdateReportWasRendered(repoRoot, reportFile, markerFile)) return null;
    const content = renderToolingUpdateContext(repoRoot, reportFile);
    toolingUpdateMarkReportRendered(repoRoot, reportFile, markerFile);
    return content;
  }

  mkdirSync(join(repoRoot, TOOLING_ADVISORY_STATE_DIR), { recursive: true });

  if (env.REPO_HARNESS_TOOLING_ADVISORY_SYNC === '1') {
    return toolingUpdateSyncPopulateAndRender(repoRoot, env, target, reportFile, markerFile);
  }

  triggerDetachedToolingPopulate(repoRoot, env, target, reportFile, lockDir);
  return null;
}

function delegationModeFromRepoPolicy(repoRoot: string): 'auto' | 'explicit' | null {
  const raw = readText(repoRoot, '.ai/harness/policy.json');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { delegation?: { mode?: unknown } };
    const mode = parsed.delegation?.mode;
    return mode === 'auto' || mode === 'explicit' ? mode : null;
  } catch {
    return null;
  }
}

function delegationModeFromGlobalConfig(home: string): 'auto' | 'explicit' | null {
  if (!home) return null;
  const path = join(home, '.repo-harness', 'config.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { delegation?: { mode?: unknown } };
    const mode = parsed.delegation?.mode;
    return mode === 'auto' || mode === 'explicit' ? mode : null;
  } catch {
    return null;
  }
}

function effectiveDelegationMode(repoRoot: string, env: NodeJS.ProcessEnv): 'auto' | 'explicit' {
  const globalMode = delegationModeFromGlobalConfig(env.HOME ?? '');
  if (globalMode) return globalMode;
  return delegationModeFromRepoPolicy(repoRoot) === 'auto' ? 'auto' : 'explicit';
}

function delegationMaxAgentsValue(repoRoot: string): string {
  const raw = readText(repoRoot, '.ai/harness/policy.json');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { delegation?: { max_agents?: unknown } };
      const value = parsed.delegation?.max_agents;
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return String(value);
      if (typeof value === 'string' && /^\d+$/.test(value)) return value;
    } catch {
      /* fall through to default */
    }
  }
  return '2';
}

/** 8. `codex_delegation_auto_context`. */
function codexDelegationAutoContext(repoRoot: string, env: NodeJS.ProcessEnv): string | null {
  if (env.HOOK_HOST !== 'codex') return null;
  if (effectiveDelegationMode(repoRoot, env) !== 'auto') return null;
  const maxAgents = delegationMaxAgentsValue(repoRoot);
  return [
    '# Delegation Standing Authorization',
    '',
    'delegation.mode=auto is standing user authorization for bounded native',
    'subagent delegation for this session. Spawn only when at least two',
    `independent, bounded workstreams exist; spawn no more than ${maxAgents}`,
    'agents; never give concurrent writers overlapping write ownership; pass',
    'fork_turns="none" on spawn_agent calls that select an agent_type; close',
    'finished agent threads; do not spawn for a trivial or strictly sequential',
    'task.',
  ].join('\n');
}

/** Exported so parity fixtures (tests/session-context.test.ts) can assert exact joined output without duplicating this literal. */
export const INPUT_PRIORITY_CONTEXT = [
  '# Input Priority',
  '',
  'If the current user message mentions `# Files mentioned by the user`, `pasted-text.txt`, or an explicit attachment/file path, read those current-input files first. Treat handoff, resume, and `tasks/current.md` as recovery context only.',
].join('\n');

function appendBlock(context: string, block: string | null): string {
  if (!block) return context;
  return context ? `${context}\n${block}` : block;
}

/**
 * Runs one sub-block emitter and swallows any unexpected throw (mirrors
 * bash's pervasive `|| true` fail-open style: one section's bug must never
 * take down the rest of SessionStart).
 */
function safely(fn: () => string | null): string | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * The full `session-start-context.sh` composition, verbatim order: resume
 * blob (gated), capability queue, architecture queue, pending plan capture,
 * current status snapshot, active sprint, tooling update advisory, codex
 * delegation auto-authorization -- each appended with a single `\n`
 * separator, then the whole thing prefixed with the input-priority block IFF
 * non-empty.
 */
export function sessionStartMainContent(
  collector: SessionContextCollector,
  env: NodeJS.ProcessEnv,
  nowMs: number,
): string | null {
  const repoRoot = collector.getRepoRoot();

  // Cold-path housekeeping, matching the base script's own call order
  // (before resume_file is even resolved): both event logs grow unbounded
  // otherwise. Produces no session content.
  rotateSessionStartEventLogs(repoRoot);

  let context = safely(() => resumeBlock(repoRoot, collector) || null) ?? '';
  context = appendBlock(context, safely(() => capabilityContextPendingContext(repoRoot)));
  context = appendBlock(context, safely(() => architectureQueuePendingContext(repoRoot, nowMs)));
  context = appendBlock(context, safely(() => pendingPlanCaptureContext(repoRoot, collector, nowMs)));
  context = appendBlock(context, safely(() => currentStatusSnapshotContext(repoRoot)));
  context = appendBlock(context, safely(() => activeSprintContext(repoRoot)));
  context = appendBlock(context, safely(() => toolingUpdateAdvisoryContext(repoRoot, env, nowMs)));
  context = appendBlock(context, safely(() => codexDelegationAutoContext(repoRoot, env)));

  if (!context) return null;
  return `${INPUT_PRIORITY_CONTEXT}\n${context}`;
}

/** Headers that flip the old script-loop branch's `actionable` bit for this id (mirrors runtime.ts's retired `scriptActionable` regex verbatim). */
const SESSION_START_ACTIONABLE_HEADERS =
  /^# (Pending Plan Capture|Capability Context Queue|Architecture Queue|Active Sprint|Delegation Standing Authorization)/m;

export function sessionStartMainSection(
  collector: SessionContextCollector,
  env: NodeJS.ProcessEnv,
  nowMs: number,
): SessionContextSection | null {
  const content = sessionStartMainContent(collector, env, nowMs);
  if (!content) return null;
  return {
    id: 'session-start-context.sh',
    priority: 5,
    content,
    mandatory: false,
    actionable: SESSION_START_ACTIONABLE_HEADERS.test(content),
    reference: 'repo-harness state resolve --json',
  };
}

// ---------------------------------------------------------------------------
// Top-level composition -- feeds runtime.ts's single budgetSessionContext call
// ---------------------------------------------------------------------------

/**
 * All three retired scripts' sections, in their former script-loop order
 * (`session-start-context.sh`, `minimal-change-context.sh`,
 * `security-sentinel.sh`). `runtime.ts` prepends the unchanged
 * `effective-state` section (still the single Effective State resolution,
 * still added before any of these) and feeds the combined array to the
 * existing `budgetSessionContext` exactly once.
 */
export function buildSessionStartSections(
  collector: SessionContextCollector,
  env: NodeJS.ProcessEnv,
  nowMs: number,
): SessionContextSection[] {
  const sections: SessionContextSection[] = [];
  const main = sessionStartMainSection(collector, env, nowMs);
  if (main) sections.push(main);
  const minimalChange = minimalChangeSessionSection(collector.getRepoRoot());
  if (minimalChange) sections.push(minimalChange);
  const security = securitySentinelSessionSection(collector.getRepoRoot(), env);
  if (security) sections.push(security);
  return sections;
}

// ---------------------------------------------------------------------------
// Standalone detached-populate entry point (see triggerDetachedToolingPopulate)
// ---------------------------------------------------------------------------
//
// Only activates when THIS file is the directly-invoked entry point (a
// `bun session-context.ts --detached-tooling-populate ...` process spawned
// detached+unref'd) -- false whenever the module is merely imported (the
// normal case: runtime.ts imports buildSessionStartSections), so this never
// runs as a side effect of importing the module.
if (import.meta.main && process.argv[2] === DETACHED_TOOLING_POPULATE_FLAG) {
  const [, , , repoRootArg, targetArg, reportFileArg, lockDirArg] = process.argv;
  runDetachedToolingPopulate(repoRootArg, process.env, targetArg, reportFileArg, lockDirArg);
}
