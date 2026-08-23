> **Archived**: 2026-08-23 19:49
> **Related Plan**: plans/archive/plan-20260823-1652-fleet-prd-closeout.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260823-1949

# Implementation Notes: fleet-prd-closeout

> **Status**: Active
> **Plan**: plans/plan-20260823-1652-fleet-prd-closeout.md
> **Contract**: tasks/contracts/20260823-1652-fleet-prd-closeout.contract.md
> **Review**: tasks/reviews/20260823-1652-fleet-prd-closeout.review.md
> **Last Updated**: 2026-08-23 16:52
> **Lifecycle**: notes

## Design Decisions

- Keep the PRD `Approved`: repository policy defines PRD lifecycle as `Draft -> Approved -> Superseded`, with no `Complete` state.
- Reverify WP0-A/B/C and GPT Pro separately because AcceptanceReceipt is a single exact contract/target authority and later workflows replaced the current receipt.
- Use `archive-workflow --outcome Completed` as the sole owner of status promotion, artifact moves, and current-status projection.
- GPT Pro orchestration product bytes already landed on `main` as `63cebdbe`; its stale worktree is a closeout carrier, not unpublished implementation.

## Deviations From Plan Or Spec

- The frozen reviewer for WP0-B, WP0-C, and GPT Pro was Claude, but the external CLI disclosure gate rejected sending repository contents without a new destination-specific authorization. The already-approved contract owner waiver was recorded through typed `UserWaiverGrant` and `AcceptanceReceipt` authorities instead; no external disclosure or reviewer substitution occurred.
- GPT Pro's obsolete branch was removed only after `git diff main...codex/gpt-pro-orchestrate-mode` proved its remaining tree delta was the architecture projection manifest and commit `63cebdbe` was an ancestor of `main`.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Mark four plans complete by hand | Reject | Bypasses typed evidence and archive transaction gates. |
| Reuse historical review Markdown | Reject | Review Markdown is projection only and old receipts target stale revisions. |
| Reverify each contract then canonical archive | Use | Preserves exact authority and fails closed without touching product code. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- WP0-A: 18/18 current-target criteria passed; archive commit `d75133f7`.
- GPT Pro: 20/20 current-target criteria passed; archive commit `cd442e7e`, published by merge `d54c6087`.
- WP0-B: 29/29 current-target criteria passed; archive commit `a3f30e09`.
- WP0-C: 24/24 current-target criteria passed; archive commit `b775b673`.
- Full-suite timing falsifiers were rerun without concurrent verifier load: HRD-09 passed in 94.7 seconds and the fleet provider limiter passed in 6.51 seconds; the final formal WP0-C run then passed unchanged.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
