import { resolve } from "path";
import type { AdoptionMode } from "./modes";
import type { AdoptionPlan } from "./operations";
import { summarizeOperations } from "./summary";
import { withRollbackMetadata } from "./rollback";
import { planStandardAdoption } from "./standard-plan";
import { isRepoHarnessSourceCheckout } from "./source-checkout";

export interface PlanAdoptionOptions {
  readonly repoRoot: string;
  readonly mode?: AdoptionMode;
  readonly apply?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Produce the complete repo-local adoption transaction before the executor
 * writes anything. The plan contains source-derived bytes, ownership-gated
 * cleanup, and all filesystem mutations; callers may only add explicit
 * post-apply effects such as registry or CodeGraph readiness.
 */
export function planAdoption(opts: PlanAdoptionOptions): AdoptionPlan {
  const repoRoot = resolve(opts.repoRoot);
  const mode = opts.mode ?? "standard";
  if (mode === "standard" && isRepoHarnessSourceCheckout(repoRoot)) {
    const operations: AdoptionPlan["operations"] = [];
    return {
      protocol: 1,
      command: "adopt",
      repoRoot,
      mode,
      apply: opts.apply === true,
      operations,
      summary: summarizeOperations(operations),
      warnings: [{
        code: "self-host-source-noop",
        message: "The repo-harness source checkout owns its workflow surfaces; downstream adopt is not applicable.",
        risk: "low",
      }],
    };
  }
  const planned = planStandardAdoption({ repoRoot, mode, env: opts.env });
  const operations = planned.operations.map(withRollbackMetadata);

  return {
    protocol: 1,
    command: "adopt",
    repoRoot,
    mode,
    apply: opts.apply === true,
    operations,
    summary: summarizeOperations(operations),
    warnings: planned.warnings,
  };
}
