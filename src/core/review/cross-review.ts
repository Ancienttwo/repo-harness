// SSD-04: pure types and deterministic helpers for repo-harness-cross-review.
//
// House style matches src/core/capabilities/registry.ts: no fs, no process
// execution, no throw-on-data-problem. Git scope capture, provider process
// invocation, and transcript recovery are effects
// (src/effects/review/cross-review-runner.ts); this module only shapes their
// inputs/outputs and normalizes/classifies already-collected text and
// process-outcome facts.
//
// Scope capture itself is NOT re-derived here or in the effects layer: the
// plan requires reusing src/effects/review/diff-fingerprint.ts's
// buildReviewSubject rather than adding a third Git scope parser. This file
// only defines the shape that reused output is projected into.

export const CROSS_REVIEW_PROVIDER_MODES = ["claude", "codex"] as const;
export type CrossReviewProviderMode = (typeof CROSS_REVIEW_PROVIDER_MODES)[number];

// Closed error-code union (plan "Trace C" + SSD-04 acceptance): every
// provider/scope failure mode is one of these six, never a seventh code and
// never a fallback to another provider or a synthesized pass.
export const CROSS_REVIEW_ERROR_CODES = [
  "timeout",
  "empty_output",
  "malformed_transcript",
  "auth_failure",
  "provider_nonzero",
  "degraded_scope",
] as const;
export type CrossReviewErrorCode = (typeof CROSS_REVIEW_ERROR_CODES)[number];

export interface CrossReviewScope {
  readonly status: "ok";
  /** The ref/name the base was resolved from (e.g. "origin/main", or an explicit override). */
  readonly baseRef: string;
  /** The resolved SHA the review is pinned to -- stable even if baseRef later moves. */
  readonly baseRev: string;
  readonly headRev: string;
  /** Union of branch-diff-changed paths and staged/unstaged/untracked status paths, bound to baseRev. */
  readonly paths: readonly string[];
  readonly reviewSubjectSha256: string;
}

export interface CrossReviewDegradedScope {
  readonly status: "degraded";
  readonly reason: string;
}

export type CrossReviewScopeCapture = CrossReviewScope | CrossReviewDegradedScope;

export interface CrossReviewFinding {
  readonly severity: "P1" | "P2";
  readonly text: string;
}

export interface CrossReviewSuccess {
  readonly status: "ok";
  readonly provider: CrossReviewProviderMode;
  readonly scope: CrossReviewScope;
  readonly transcript: string;
  readonly usedTranscriptRecovery: boolean;
  readonly findings: readonly CrossReviewFinding[];
  readonly recommendation: string;
}

export interface CrossReviewFailure {
  readonly status: "failed";
  readonly provider: CrossReviewProviderMode;
  /** null only for degraded_scope: scope capture failed before a provider could be invoked. */
  readonly scope: CrossReviewScope | null;
  readonly code: CrossReviewErrorCode;
  readonly message: string;
  /**
   * Informational only. A timed-out or nonzero-exit run never becomes a
   * success just because some text was recoverable -- this field lets a
   * human inspect what was recovered without the result status changing.
   */
  readonly recoveredTranscript?: string;
}

export type CrossReviewResult = CrossReviewSuccess | CrossReviewFailure;

// --- Finding / recommendation parsing (pure text processing) ---------------

const FINDING_LINE_PATTERN = /^\s*[-*]?\s*\[(P1|P2)\]\s*(.+)$/;

export function parseFindings(transcript: string): readonly CrossReviewFinding[] {
  const findings: CrossReviewFinding[] = [];
  for (const rawLine of transcript.split(/\r?\n/)) {
    const match = FINDING_LINE_PATTERN.exec(rawLine);
    if (!match) continue;
    const severity = match[1] as "P1" | "P2";
    const text = match[2].trim();
    if (text) findings.push(Object.freeze({ severity, text }));
  }
  return Object.freeze(findings);
}

export function buildRecommendation(findings: readonly CrossReviewFinding[]): string {
  const p1 = findings.find((finding) => finding.severity === "P1");
  if (p1) return `Recommendation: FAIL because ${p1.text}`;
  const p2 = findings[0];
  if (p2) return `Recommendation: PASS (advisory) because ${p2.text}`;
  return "Recommendation: PASS because no findings were reported";
}

// --- Auth-failure signal detection ------------------------------------------

// A nonzero exit alone is ambiguous (crash, bad args, auth, network...). This
// documented, mechanical substring set is what promotes a nonzero exit from
// the generic `provider_nonzero` code to the more specific `auth_failure`
// code; anything else with a nonzero exit stays `provider_nonzero`.
const AUTH_FAILURE_SIGNAL_PATTERNS: readonly RegExp[] = [
  /not\s+authenticated/i,
  /unauthorized/i,
  /\b401\b/,
  /please\s+(?:log|sign)\s+in/i,
  /run\s+[`'"]?claude\s+login/i,
  /run\s+[`'"]?codex\s+login/i,
  /invalid\s+api\s+key/i,
  /authentication\s+failed/i,
  /no\s+credentials\s+found/i,
];

export function matchesAuthFailureSignal(text: string): boolean {
  return AUTH_FAILURE_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

// --- Outcome classification (pure decision table) ---------------------------

/**
 * Structural subset of src/effects/process-runner.ts's ProcessRunResult --
 * defined locally so this module never imports an effects-layer type, but
 * shaped so a real ProcessRunResult satisfies it directly (no conversion).
 */
export interface ProviderInvocationOutcome {
  readonly ok: boolean;
  readonly status: number;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string;
}

export interface TranscriptRecoveryOutcome {
  readonly attempted: boolean;
  readonly text: string;
  /** true only when recovery was attempted, found candidate file(s), and extracted no usable text from any of them. */
  readonly malformed: boolean;
}

export type CrossReviewClassification =
  | { readonly kind: "success"; readonly transcript: string; readonly usedRecovery: boolean }
  | {
      readonly kind: "failed";
      readonly code: CrossReviewErrorCode;
      readonly message: string;
      readonly recoveredTranscript?: string;
    };

/**
 * The single place that decides which of the six closed error codes (or
 * success) an already-completed provider invocation maps to. Deliberately
 * stricter than the two source shell skills it replaces: a timeout or
 * nonzero exit is always reported as that explicit failure, even when a
 * transcript was separately recoverable -- recovered text is attached for
 * transparency but never promotes a failed run to a passing one. Never
 * throws; every input shape maps to exactly one output.
 */
export function classifyCrossReviewOutcome(
  invocation: ProviderInvocationOutcome,
  recovery: TranscriptRecoveryOutcome,
): CrossReviewClassification {
  const recoveredTranscript = recovery.text.trim() !== "" ? recovery.text : undefined;

  if (invocation.timedOut) {
    return {
      kind: "failed",
      code: "timeout",
      message: "provider process timed out",
      recoveredTranscript,
    };
  }

  if (!invocation.ok) {
    const signalText = `${invocation.stdout}\n${invocation.stderr}\n${invocation.error}`;
    const code: CrossReviewErrorCode = matchesAuthFailureSignal(signalText)
      ? "auth_failure"
      : "provider_nonzero";
    return {
      kind: "failed",
      code,
      message: invocation.error || invocation.stderr || `provider exited with status ${invocation.status}`,
      recoveredTranscript,
    };
  }

  if (invocation.stdout.trim() !== "") {
    return { kind: "success", transcript: invocation.stdout, usedRecovery: false };
  }

  // Clean exit, empty stdout: recovery (claude mode only) decides between
  // empty_output and malformed_transcript. Codex mode never attempts
  // recovery (matching its source skill, which has no transcript-recovery
  // step), so recovery.attempted is always false there.
  if (!recovery.attempted) {
    return { kind: "failed", code: "empty_output", message: "provider produced no stdout" };
  }
  if (recovery.malformed) {
    return {
      kind: "failed",
      code: "malformed_transcript",
      message: "provider produced no stdout; the recovered session transcript could not be parsed",
    };
  }
  if (recovery.text.trim() === "") {
    return {
      kind: "failed",
      code: "empty_output",
      message: "provider produced no stdout and no recoverable session transcript was found",
    };
  }
  return { kind: "success", transcript: recovery.text, usedRecovery: true };
}

// --- JSONL session-transcript recovery (pure parsing; fs reads are the effect) ---

function textFromContentBlocks(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object") {
      const typed = block as { type?: unknown; text?: unknown };
      if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
    }
  }
  return parts.join("\n");
}

/**
 * Parses one line of a Claude Code print-mode session `.jsonl` file. Returns
 * the assistant text if the line is a usable assistant-message entry scoped
 * to one of the given candidate cwd values, or null otherwise (including on
 * a JSON parse failure) -- a null here never throws, it just contributes no
 * text to the candidate's aggregate.
 */
export function parseJsonlAssistantLine(line: string, cwdCandidates: ReadonlySet<string>): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let entry: unknown;
  try {
    entry = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!entry || typeof entry !== "object") return null;
  const record = entry as { type?: unknown; cwd?: unknown; message?: unknown };
  if (record.type !== "assistant") return null;
  if (typeof record.cwd === "string" && !cwdCandidates.has(record.cwd)) return null;
  const message = record.message && typeof record.message === "object"
    ? (record.message as { content?: unknown })
    : undefined;
  const text = textFromContentBlocks(message?.content);
  return text.trim() ? text : null;
}

export interface RecoveryCandidateFile {
  readonly mtimeMs: number;
  readonly lines: readonly string[];
}

/**
 * Aggregates already-read candidate session files into one recovery outcome:
 * the last usable assistant text from the most recently modified candidate
 * that has any, or `malformed: true` when candidate files existed but none
 * yielded usable text (distinct from no candidates at all, which the caller
 * treats as empty_output rather than malformed_transcript).
 */
export function selectRecoveredTranscript(
  candidates: readonly RecoveryCandidateFile[],
  cwdCandidates: ReadonlySet<string>,
): { readonly text: string; readonly malformed: boolean } {
  let best: { readonly mtimeMs: number; readonly text: string } | null = null;
  for (const candidate of candidates) {
    let lastText = "";
    for (const line of candidate.lines) {
      const text = parseJsonlAssistantLine(line, cwdCandidates);
      if (text) lastText = text;
    }
    if (lastText && (!best || candidate.mtimeMs > best.mtimeMs)) {
      best = { mtimeMs: candidate.mtimeMs, text: lastText };
    }
  }
  if (best) return { text: best.text, malformed: false };
  return { text: "", malformed: candidates.length > 0 };
}

export function toClaudeProjectKey(cwdPath: string): string {
  return cwdPath.replace(/[\\/]/g, "-");
}
