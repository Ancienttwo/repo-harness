# Implementation Notes: publication-receipt

> **Status**: Active
> **Plan**: plans/plan-20260822-1222-publication-receipt.md
> **Contract**: tasks/contracts/20260822-1222-publication-receipt.contract.md
> **Review**: tasks/reviews/20260822-1222-publication-receipt.review.md
> **Last Updated**: 2026-08-22 13:00
> **Lifecycle**: notes

## Design Decisions

- **P1 — boundary:** `src/core/publication/` owns the strict immutable receipt and marker bytes; `src/effects/publication/` owns provider observation, git-common-dir cache, and evidence revalidation; `scripts/ship-worktrees.sh` only locates a task/claim token and orchestrates the CLI. The source helper and packaged helper remain byte-identical.
- **P2 — trace:** linked ship seals and pushes the exact head, uses the token only to locate a re-read lease, then persists a canonical `publication_create_intent` before invoking PR creation. A same-invocation or recovery markerless PR can receive its first marker only when that intent matches current task/claim/generation/head. The effect re-reads the common-dir lease owner, checks `completing`, real execution worktree and branch, observes provider target/base/head refs plus local tree/evidence, writes the cache, takes the task lock for the adjacent owner re-read and marker update, and only then returns structured `pr_observed` evidence. Reconcile reuses the intent/ensure path.
- **P3 — invariant:** the receipt ID is exactly `sha256([protocol, provider_repo_id, task_id, claim_id, generation, head_sha])`; `COORDINATION_PROTOCOL` is untouched. `created_at` is provider-sourced and excluded from that identity so rebuild can restore byte-equivalent receipt data. `repo_id` is a digest of the real common directory rather than the directory itself, so the marker cannot disclose a local path.
- **Cache publication:** the cache writes a fsynced temporary inode and publishes it with `link(2)`. Existing IDs are accepted only when their canonical bytes match; a race or divergent payload fails closed rather than overwriting the prior receipt.
- **Authority boundary:** receipt publication applies to task-backed linked-worktree shipping, where the claim token can locate a checked lease owner. This follows directly from mandatory receipt `task_id`/`claim_id`/generation fields: the primary dirty-worktree maintenance closeout has no such authority and therefore remains outside WP0-A rather than fabricating a receipt.

## Deviations From Plan Or Spec

- None. The helper exposes `publication receipt rebuild --pr <number>` as the contract's minimal rebuild surface; it does not add later lifecycle commands.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Store full common-dir path in the marker | Rejected | A path is local-only and leaks through the PR marker; `repo_id` is its deterministic digest while cache placement continues to use the actual common directory. |
| Trust token data for generation or revision | Rejected | The token is only a locator; the effect re-reads and checks the lease owner record before receipt construction. |
| Add another recovery log | Rejected | The existing ship journal remains the only recovery authority; it now carries structured receipt evidence. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
