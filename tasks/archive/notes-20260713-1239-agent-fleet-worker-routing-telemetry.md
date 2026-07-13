> **Archived**: 2026-07-13 12:39
> **Related Plan**: plans/archive/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260713-1239

# Implementation Notes: agent-fleet-worker-routing-telemetry

> **Status**: Closed
> **Plan**: plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md
> **Contract**: tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md
> **Review**: tasks/reviews/20260712-2103-agent-fleet-worker-routing-telemetry.review.md
> **Last Updated**: 2026-07-13 12:37
> **Lifecycle**: notes

## Design Decisions

- `role_profiles.worker` identity must key on the resolved dispatch label's literal value (`usedRunner === "main-thread"` -> `sol-high`; Codex labels pass through; else -> `fast-worker`), NOT on whether `usedRunner` matches the contract's declared `runner.fallback`. Those are two independent questions: "what does this dispatch label mean" vs. "did we land on the contract's declared fallback." The first implementation conflated them (kept `workerProfile` behind `onWorkerFallback`), which is correct only by coincidence for contracts that happen to declare `fallback: main-thread` (true of every template-generated contract today, but not a structural guarantee — `fallback: null` is the parser's own default when no `runner:` block is declared). Caught by external Codex review as P1, independently re-traced and confirmed by the orchestrator, fixed by decoupling the two checks. `onWorkerFallback` still correctly drives only `runner_usage.path`/`effort`.
- Did not rename or repurpose `RunnerContract.preferred`/`fallback`'s existing dispatch-mechanism vocabulary (`subagent`/`codex-subagent`/`codex-exec`/`main-thread`) to carry model-tier meaning, even though that would have been a simpler single-field design — user confirmed `main-thread` dispatch specifically represents "no subagent spawned, orchestrator executes directly," which is a fixed, derivable signal for the Sol-High identity rather than a field worth renaming.
- Extended the existing `workflow-engine-contract-assets` capability rather than minting a new one for `scripts/contract-run.ts`; that capability already narrates other contract-lifecycle tooling outside its formal prefix list (e.g. `scripts/contract-worktree.sh`), so this is precedent-consistent, not scope creep.

## Deviations From Plan Or Spec

- None recorded — the P1 fix stayed within the original plan's stated design (worker resolves to `fast-worker` or `sol-high`, derived from dispatch), it corrected an implementation bug against that design, not a design change itself.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Repurpose `runner.preferred`/`fallback` values to mean model identity directly | Rejected | Would silently redefine already-tested dispatch-mechanism semantics (`subagent`/`codex-exec`/`main-thread`) with no confirmed need to touch that vocabulary; user confirmed deriving from the existing values instead. |
| Add a second, parallel `runner.worker_tier` field | Rejected | User confirmed the single-derivation approach (`main-thread` -> `sol-high`) is sufficient; a second field would be unused speculative surface. |
| Let contract-run.ts itself auto-degrade/retry the worker at a higher tier on failure | Rejected | Contradicts the script's established "never selects, spawns, or degrades a runner" record-only philosophy (existing code comment); escalation stays orchestrator-driven via explicit `--runner main-thread`. |

## Open Questions

- None outstanding. Two of deep-reasoner's original five flagged open questions were trivial defaults accepted as-is (parent marker value, `--effort` record-only-on-preferred-path); the one genuine fork (repurpose vs. derive) was resolved by the user before implementation.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
