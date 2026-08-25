// SSD-04: pure types and deterministic helpers for repo-harness-cross-review.
//
// House style matches src/core/capabilities/registry.ts: no fs, no process
// execution, no throw-on-data-problem. Git scope capture, provider process
// invocation and external structured-output validation are effects
// (src/effects/review/cross-review-runner.ts); this module only shapes their
// inputs/outputs and normalizes/classifies already-collected text and
// process-outcome facts.
//
// Scope capture itself is NOT re-derived here or in the effects layer: the
// plan requires reusing src/effects/review/diff-fingerprint.ts's
// buildReviewSubject rather than adding a third Git scope parser. This file
// only defines the shape that reused output is projected into.

export const CROSS_REVIEW_PROVIDER_MODES = ["codex", "codex-plugin"] as const;
export type CrossReviewProviderMode = (typeof CROSS_REVIEW_PROVIDER_MODES)[number];

// Closed error-code union (plan "Trace C" + SSD-04 acceptance): every
// provider/scope/admission failure mode is one of these codes and
// never a fallback to another provider or a synthesized pass.
export const CROSS_REVIEW_ERROR_CODES = [
  "timeout",
  "empty_output",
  "malformed_transcript",
  "auth_failure",
  "provider_nonzero",
  "degraded_scope",
  "stale_scope",
  "review_budget_exhausted",
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
}

/**
 * Provider-side unavailability after the bounded attempt budget is spent.
 *
 * The external opinion is advisory: when the provider itself could not be
 * made to produce a usable transcript within its fixed attempt budget, the
 * run resolves here (non-blocking) instead of failing the caller. This is
 * NOT a pass and NOT a synthesized review -- it carries the last attempt's
 * closed error code so the reason stays explicit. `degraded_scope` never
 * lands here: an unobservable review scope is the harness's own failure and
 * stays a blocking CrossReviewFailure.
 */
export interface CrossReviewSkipped {
  readonly status: "skipped";
  readonly provider: CrossReviewProviderMode;
  readonly scope: CrossReviewScope;
  /** Provider attempts actually spent before skipping (always the full budget). */
  readonly attempts: number;
  readonly code: CrossReviewErrorCode;
  readonly message: string;
}

export type CrossReviewResult = CrossReviewSuccess | CrossReviewFailure | CrossReviewSkipped;

// --- Finding / recommendation parsing (pure text processing) ---------------

const FINDING_PREFIX_PATTERN = /^(?:-\s*|\*\s+|#{1,6}\s+)?/;
const FINDING_LINE_PATTERN = /^(?:\*\*|__)?\[(P1|P2)\](?:\*\*|__)?\s*(.+)$/;

export function parseFindings(transcript: string): readonly CrossReviewFinding[] {
  const findings: CrossReviewFinding[] = [];
  for (const rawLine of transcript.split(/\r?\n/)) {
    let line = rawLine.trim();
    if ((line.startsWith("**") && line.endsWith("**"))
      || (line.startsWith("__") && line.endsWith("__"))) {
      line = line.slice(2, -2).trim();
    }
    line = line.replace(FINDING_PREFIX_PATTERN, "");
    const match = FINDING_LINE_PATTERN.exec(line);
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
  /not\s+logged\s+in/i,
  /unauthorized/i,
  /\b401\b/,
  /please\s+(?:log|sign)\s+in/i,
  /run\s+[`'"]?claude\s+login/i,
  /run\s+[`'"]?codex\s+login/i,
  /run\s+\/login/i,
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

export type CrossReviewClassification =
  | { readonly kind: "success"; readonly transcript: string; readonly usedRecovery: boolean }
  | {
      readonly kind: "failed";
      readonly code: CrossReviewErrorCode;
      readonly message: string;
    };

/**
 * Maps already-completed process facts to a closed process-level result.
 * Provider-specific structured output is validated at its external boundary;
 * a timeout or nonzero exit can never become a synthesized pass.
 */
export function classifyCrossReviewOutcome(
  invocation: ProviderInvocationOutcome,
): CrossReviewClassification {
  if (invocation.timedOut) {
    return {
      kind: "failed",
      code: "timeout",
      message: "provider process timed out",
    };
  }

  if (!invocation.ok) {
    const signalText = `${invocation.stderr}\n${invocation.error}`;
    const stdoutAuth = invocation.stdout.split(/\r?\n/).some((line) => /^\s*Not logged in\s*[·-]\s*Please run \/login\s*$/i.test(line));
    const code: CrossReviewErrorCode = matchesAuthFailureSignal(signalText) || stdoutAuth
      ? "auth_failure"
      : "provider_nonzero";
    return {
      kind: "failed",
      code,
      message: invocation.error || invocation.stderr || invocation.stdout || `provider exited with status ${invocation.status}`,
    };
  }

  if (invocation.stdout.trim() !== "") {
    return { kind: "success", transcript: invocation.stdout, usedRecovery: false };
  }

  return { kind: "failed", code: "empty_output", message: "provider produced no stdout" };
}
