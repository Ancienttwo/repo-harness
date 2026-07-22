/**
 * `repo-harness cross-review` -- deterministic opposite-provider code review
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

import { runCrossReview } from "../../effects/review/cross-review-runner";
import type { CrossReviewProviderMode, CrossReviewResult } from "../../core/review/cross-review";

export interface CrossReviewCommandOptions {
  readonly repoRoot?: string;
  readonly provider: CrossReviewProviderMode;
  readonly baseRevision?: string;
  readonly timeoutMs?: number;
  readonly json?: boolean;
  /** Test seam: overrides the executable invoked in place of the real `claude`/`codex` binary. */
  readonly providerCommand?: string;
  /** Test seam: overrides the directory transcript recovery reads instead of the real `~/.claude`. */
  readonly claudeConfigDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => number;
}

export interface CrossReviewCommandResult {
  readonly exitCode: number;
  readonly result: CrossReviewResult;
  readonly output: string;
}

export function runCrossReviewCommand(opts: CrossReviewCommandOptions): CrossReviewCommandResult {
  const result = runCrossReview({
    repoRoot: opts.repoRoot ?? process.cwd(),
    provider: opts.provider,
    baseRevision: opts.baseRevision,
    timeoutMs: opts.timeoutMs,
    providerCommand: opts.providerCommand,
    claudeConfigDir: opts.claudeConfigDir,
    env: opts.env,
    now: opts.now,
  });
  const exitCode = result.status === "ok"
    ? (result.findings.some((finding) => finding.severity === "P1") ? 1 : 0)
    : 1;
  return { exitCode, result, output: formatCrossReviewResult(result, opts.json === true) };
}

export function formatCrossReviewResult(result: CrossReviewResult, asJson = false): string {
  if (asJson) return JSON.stringify(result, null, 2);

  if (result.status === "failed") {
    const lines = [`[cross-review:${result.provider}] FAILED (${result.code}): ${result.message}`];
    if (result.recoveredTranscript) {
      lines.push(
        "",
        "--- recovered session transcript (informational only; result remains failed) ---",
        result.recoveredTranscript,
      );
    }
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
