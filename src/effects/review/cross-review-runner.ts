import { execFileSync } from "child_process";
import { buildReviewSubject } from "./diff-fingerprint";
import { runProcess, type ProcessRunResult } from "../process-runner";
import {
  buildOfficialPluginFocus,
  discoverOfficialCodexPlugin,
  parseOfficialCodexPluginReview,
} from "./codex-plugin-provider";
import {
  buildRecommendation,
  classifyCrossReviewOutcome,
  parseFindings,
  type CrossReviewClassification,
  type CrossReviewFinding,
  type CrossReviewProviderMode,
  type CrossReviewResult,
  type CrossReviewScope,
  type CrossReviewScopeCapture,
  type CrossReviewSkipped,
} from "../../core/review/cross-review";

/** Every provider gets exactly two attempts. No attempt changes provider. */
export const MAX_ATTEMPTS = 2;

const DEFAULT_TIMEOUT_MS: Record<CrossReviewProviderMode, number> = {
  codex: 1_800_000,
  "codex-plugin": 1_800_000,
};

const REVIEW_FINDING_INSTRUCTIONS =
  "Report findings, each marked [P1] (critical -- must fix before merge) or [P2] (advisory). " +
  "Focus on: spec/behavior drift, swallowed errors, missing edge cases and failure paths, weak or " +
  "tautological tests, concurrency/race issues, and broken public interfaces. No compliments -- just the problems.";

function gitText(repoRoot: string, args: readonly string[]): string {
  try {
    return execFileSync("git", ["-C", repoRoot, "--literal-pathspecs", ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

function refExists(repoRoot: string, ref: string): boolean {
  try {
    execFileSync("git", ["-C", repoRoot, "rev-parse", "--verify", "-q", ref], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function resolveDefaultReviewBase(repoRoot: string): string {
  const symbolic = gitText(repoRoot, ["symbolic-ref", "refs/remotes/origin/HEAD"]).trim();
  if (symbolic) return symbolic.replace(/^refs\/remotes\//, "");
  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    if (refExists(repoRoot, candidate)) return candidate;
  }
  return "HEAD";
}

export function captureCrossReviewScope(
  repoRoot: string,
  opts: { readonly baseRevision?: string } = {},
): CrossReviewScopeCapture {
  const targetRef = opts.baseRevision ?? resolveDefaultReviewBase(repoRoot);
  const subject = buildReviewSubject(repoRoot, { targetRef });
  if (subject.status === "unknown") {
    return { status: "degraded", reason: subject.reason ?? "review subject could not be fully observed" };
  }
  return Object.freeze({
    status: "ok" as const,
    baseRef: subject.target_ref,
    baseRev: subject.target_rev,
    headRev: subject.head_rev,
    paths: subject.paths,
    reviewSubjectSha256: subject.review_subject_sha256,
  });
}

function buildCodexPrompt(scope: CrossReviewScope): string {
  return [
    "IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/, .claude/skills/, or agents/. " +
      "Those are Claude Code skill definitions for a different AI system and will only waste your time. Stay on repository code only.",
    "",
    buildOfficialPluginFocus(scope),
    "",
    REVIEW_FINDING_INSTRUCTIONS,
  ].join("\n");
}

export interface RunCrossReviewInput {
  readonly repoRoot: string;
  readonly provider: CrossReviewProviderMode;
  readonly baseRevision?: string;
  readonly timeoutMs?: number;
  /** Test/config seam: direct Codex executable, or Node executable for codex-plugin. */
  readonly providerCommand?: string;
  /** Test/config seam for Claude Code's public plugin inventory command. */
  readonly claudeCommand?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly admitProviderInvocation?: (scope: CrossReviewScope) =>
    | { readonly allowed: true }
    | { readonly allowed: false; readonly code: "degraded_scope" | "review_budget_exhausted"; readonly message: string };
}

interface AttemptResult {
  readonly invocation: ProcessRunResult;
  readonly classification: CrossReviewClassification;
  readonly findings?: readonly CrossReviewFinding[];
  readonly transcript?: string;
}

function syntheticDiscoveryFailure(invocation: ProcessRunResult, message: string): ProcessRunResult {
  return {
    ...invocation,
    ok: false,
    status: invocation.status === 0 ? 1 : invocation.status,
    error: message,
  };
}

function invokeProvider(input: RunCrossReviewInput, scope: CrossReviewScope, timeoutMs: number): AttemptResult {
  if (input.provider === "codex") {
    const invocation = runProcess(input.providerCommand ?? "codex", [
      "exec",
      "-s", "read-only",
      buildCodexPrompt(scope),
      "-c", 'model_reasoning_effort="high"',
    ], {
      cwd: input.repoRoot,
      timeoutMs,
      maxOutputBytes: 2 * 1024 * 1024,
      stdio: "pipe",
      env: input.env,
    });
    const classification = classifyCrossReviewOutcome(invocation);
    if (classification.kind === "failed") return { invocation, classification };
    return {
      invocation,
      classification,
      transcript: classification.transcript,
      findings: parseFindings(classification.transcript),
    };
  }

  const discovery = discoverOfficialCodexPlugin(input.repoRoot, scope, {
    env: input.env,
    claudeCommand: input.claudeCommand,
    nodeCommand: input.providerCommand,
  });
  if (discovery.status === "failed") {
    const invocation = syntheticDiscoveryFailure(discovery.invocation, discovery.message);
    return { invocation, classification: classifyCrossReviewOutcome(invocation) };
  }
  const invocation = runProcess(discovery.invocation.command, discovery.invocation.args, {
    cwd: input.repoRoot,
    timeoutMs,
    maxOutputBytes: 2 * 1024 * 1024,
    stdio: "pipe",
    env: discovery.invocation.env,
  });
  const processClassification = classifyCrossReviewOutcome(invocation);
  if (processClassification.kind === "failed") return { invocation, classification: processClassification };
  const parsed = parseOfficialCodexPluginReview(processClassification.transcript);
  if (parsed.status === "failed") {
    return {
      invocation,
      classification: { kind: "failed", code: "malformed_transcript", message: parsed.message },
    };
  }
  return {
    invocation,
    classification: processClassification,
    transcript: parsed.transcript,
    findings: parsed.findings,
  };
}

export function runCrossReview(input: RunCrossReviewInput): CrossReviewResult {
  const scopeCapture = captureCrossReviewScope(input.repoRoot, { baseRevision: input.baseRevision });
  if (scopeCapture.status === "degraded") {
    return {
      status: "failed",
      provider: input.provider,
      scope: null,
      code: "degraded_scope",
      message: scopeCapture.reason,
    };
  }
  const scope = scopeCapture;
  const admission = input.admitProviderInvocation?.(scope);
  if (admission && !admission.allowed) {
    return {
      status: "failed",
      provider: input.provider,
      scope,
      code: admission.code,
      message: admission.message,
    };
  }
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS[input.provider];

  let lastClassification: Extract<CrossReviewClassification, { kind: "failed" }> | null = null;
  for (let attempts = 1; attempts <= MAX_ATTEMPTS; attempts += 1) {
    const attempt = invokeProvider(input, scope, timeoutMs);
    if (attempt.classification.kind === "success" && attempt.transcript && attempt.findings) {
      return {
        status: "ok",
        provider: input.provider,
        scope,
        transcript: attempt.transcript,
        usedTranscriptRecovery: false,
        findings: attempt.findings,
        recommendation: buildRecommendation(attempt.findings),
      };
    }
    lastClassification = attempt.classification as Extract<CrossReviewClassification, { kind: "failed" }>;
    if (attempts < MAX_ATTEMPTS) continue;
    const skipped: CrossReviewSkipped = {
      status: "skipped",
      provider: input.provider,
      scope,
      attempts,
      code: lastClassification.code,
      message: lastClassification.message,
    };
    return skipped;
  }
  throw new Error("unreachable cross-review attempt state");
}
