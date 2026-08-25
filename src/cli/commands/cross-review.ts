/**
 * `repo-harness cross-review` -- deterministic independent-provider code review
 * (SSD-04).
 *
 * NOT YET REGISTERED in src/cli/index.ts: per the plan's "File ownership by
 * slice" table, SSD-06 performs the atomic public cutover registration. This
 * module is exported for direct import; tests exercise it without a live
 * provider by pointing providerCommand at a fixture script (see
 * tests/cli/cross-review.test.ts) -- no real provider or network call.
 *
 * Mirrors src/cli/commands/migrate.ts's shape: a pure run<X>(opts) function
 * that accepts already-resolved options plus a format<X>Result(result, json)
 * formatter. Raw argv parsing is index.ts/commander's job once this is
 * registered, same as every other command module here.
 */

import { readFileSync, realpathSync, statSync } from "fs";
import { isAbsolute, join, relative, resolve, sep } from "path";
import { MAX_ATTEMPTS, runCrossReview } from "../../effects/review/cross-review-runner";
import type { CrossReviewProviderMode, CrossReviewResult } from "../../core/review/cross-review";
import { markdownHeader } from "../../core/state/artifact-parsers";
import { recordCircuitAttempt } from "../hook/circuit-breaker";

export interface CrossReviewCommandOptions {
  readonly repoRoot?: string;
  readonly provider: CrossReviewProviderMode;
  readonly baseRevision?: string;
  readonly timeoutMs?: number;
  readonly json?: boolean;
  /** Test/config seam: direct Codex executable, or Node executable for codex-plugin. */
  readonly providerCommand?: string;
  /** Test/config seam for Claude Code's public plugin inventory command. */
  readonly claudeCommand?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface CrossReviewCommandResult {
  readonly exitCode: number;
  readonly result: CrossReviewResult;
  readonly output: string;
}

type ReviewAuthority =
  | { readonly status: "standalone" }
  | { readonly status: "active"; readonly contractPath: string }
  | { readonly status: "invalid"; readonly message: string };

function readOptionalText(repoRoot: string, path: string): string | null {
  try {
    return readFileSync(join(repoRoot, path), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function resolveRepoFile(repoRoot: string, path: string, prefix: string): string | null {
  if (!path.startsWith(prefix) || path.includes("\\") || path.includes("\0") || isAbsolute(path)
    || path.split("/").includes("..")) return null;
  const root = realpathSync(repoRoot);
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) return null;
  try {
    if (!statSync(target).isFile()) return null;
    const canonical = realpathSync(target);
    const canonicalRel = relative(root, canonical);
    if (!canonicalRel || canonicalRel === ".." || canonicalRel.startsWith(`..${sep}`)) return null;
  } catch {
    return null;
  }
  return target;
}

function activeReviewAuthority(repoRoot: string): ReviewAuthority {
  const marker = readOptionalText(repoRoot, ".ai/harness/active-plan")?.trim() ?? "";
  if (!marker) return { status: "standalone" };
  if (/\s/u.test(marker)) return { status: "invalid", message: "active plan marker is malformed" };

  const owner = readOptionalText(repoRoot, ".ai/harness/active-worktree")?.split("\n")[0]?.trim() ?? "";
  let canonicalRoot: string;
  try { canonicalRoot = realpathSync(repoRoot); } catch { return { status: "invalid", message: "repository root is unavailable" }; }
  if (!owner) return { status: "invalid", message: "active worktree marker is missing" };
  try {
    if (realpathSync(owner) !== canonicalRoot) {
      return { status: "invalid", message: "active plan belongs to a different worktree" };
    }
  } catch {
    return { status: "invalid", message: "active worktree marker is stale" };
  }

  const planFile = resolveRepoFile(canonicalRoot, marker, "plans/plan-");
  if (!planFile) return { status: "invalid", message: "active plan marker does not name a valid plan" };
  const contractPath = markdownHeader(readFileSync(planFile, "utf-8"), "Task Contract");
  if (!contractPath || !resolveRepoFile(canonicalRoot, contractPath, "tasks/contracts/")) {
    return { status: "invalid", message: "active plan does not name a valid task contract" };
  }

  let configuredLimit: unknown;
  try {
    const policy = JSON.parse(readFileSync(join(canonicalRoot, ".ai/harness/policy.json"), "utf-8")) as {
      circuit_breakers?: { semantic_reviews_per_work_package?: unknown };
    };
    configuredLimit = policy.circuit_breakers?.semantic_reviews_per_work_package;
  } catch {
    return { status: "invalid", message: "workflow policy is missing or invalid" };
  }
  if (configuredLimit !== 1) {
    return { status: "invalid", message: "workflow policy must set semantic_reviews_per_work_package to 1" };
  }
  return { status: "active", contractPath };
}

export function runCrossReviewCommand(opts: CrossReviewCommandOptions): CrossReviewCommandResult {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const authority = activeReviewAuthority(repoRoot);
  const result = runCrossReview({
    repoRoot,
    provider: opts.provider,
    baseRevision: opts.baseRevision,
    timeoutMs: opts.timeoutMs,
    providerCommand: opts.providerCommand,
    claudeCommand: opts.claudeCommand,
    env: opts.env,
    admitProviderInvocation: () => {
      if (authority.status === "standalone") return { allowed: true };
      if (authority.status === "invalid") {
        return { allowed: false, code: "degraded_scope", message: authority.message };
      }
      const decision = recordCircuitAttempt(repoRoot, {
        kind: "semantic-review",
        guard: "one-semantic-review-per-work-package",
        reason: "direct cross-review provider admission",
        pathOrAction: `cross-review:${opts.provider}`,
        progressToken: authority.contractPath,
        fingerprint: authority.contractPath,
        profile: "standard",
        strongBoundary: true,
      });
      return decision.allowed
        ? { allowed: true }
        : {
          allowed: false,
          code: "review_budget_exhausted",
          message: "This work-package already used its one semantic review. Fix the findings, then close with owner acceptance; do not re-run external review.",
        };
    },
  });
  // "skipped" is provider-side unavailability after the bounded attempt
  // budget: the external opinion is advisory, so it exits 0 and never blocks
  // the caller. Only a real P1 finding or a blocking failure (degraded scope)
  // exits nonzero.
  const exitCode = result.status === "ok"
    ? (result.findings.some((finding) => finding.severity === "P1") ? 1 : 0)
    : result.status === "skipped"
      ? 0
      : 1;
  return { exitCode, result, output: formatCrossReviewResult(result, opts.json === true) };
}

export function formatCrossReviewResult(result: CrossReviewResult, asJson = false): string {
  if (asJson) return JSON.stringify(result, null, 2);

  if (result.status === "skipped") {
    const lines = [
      `[cross-review:${result.provider}] SKIPPED after ${result.attempts}/${MAX_ATTEMPTS} attempts (${result.code}): ${result.message}`,
      "The external opinion is advisory and unavailable; proceed on your own review. Do not re-run this review or narrow the diff to retry it.",
    ];
    return lines.join("\n");
  }

  if (result.status === "failed") {
    const lines = [`[cross-review:${result.provider}] FAILED (${result.code}): ${result.message}`];
    return lines.join("\n");
  }

  const lines = [
    `[cross-review:${result.provider}] base=${result.scope.baseRev} head=${result.scope.headRev} paths=${result.scope.paths.length}`,
    "",
    result.transcript,
    "",
    result.recommendation,
  ];
  return lines.join("\n");
}
