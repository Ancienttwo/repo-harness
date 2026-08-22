# Implementation Notes: publication-recovery-reconcile

> **Status**: Active
> **Plan**: plans/plan-20260822-1915-publication-recovery-reconcile.md
> **Contract**: tasks/contracts/20260822-1915-publication-recovery-reconcile.contract.md
> **Review**: tasks/reviews/20260822-1915-publication-recovery-reconcile.review.md
> **Last Updated**: 2026-08-22 20:08
> **Lifecycle**: notes

## Design Decisions

- `current_publication` remains the sole current-publication authority. `PublicationIntegrationObservationV1` is immutable audit evidence; `integration_state` is a read-time provider + fetched-OID projection and is not stored in the lease.
- Reconcile observes the PR once for immutable identity, fetches the provider target into an isolated observation namespace, pins a deterministic ref by fetched OID, and re-observes provider identity/base under the task lock before evidence-first exact lease removal.
- Post-merge identity validation deliberately compares the receipt/marker/provider immutable fields but not the receipt's historical `base_sha`, current merge seal, or current checks file; `rebuildPublicationReceipt` remains unchanged for publication creation/rebuild semantics.
- Merge classification executes `scripts/worktree-merge-lib.sh` as the existing single authority. No TypeScript ancestry/absorption classifier was added.
- Recovery CLI is a typed JSON adapter over the existing `ship-worktrees.sh --recover` state machine. Abort additionally requires `--confirm-abort`; reconcile requires the exact transaction `--key`.

## Deviations From Plan Or Spec

- The plan allowed a separate recovery module, but the implementation stays in the existing publication lifecycle core/effect boundary because recovery and reconcile reuse its pointer, journal, lock, and receipt invariants. No new production file or dependency was needed.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Persist `integration_state` in the lease | Rejected | It would create a second mutable authority beside `current_publication`. |
| Reuse `sprint reconcile` | Rejected | It does not fetch provider truth and its released path bypasses canonical proof. |
| Reuse `rebuildPublicationReceipt` after merge | Rejected | Its creation-time base/check evidence correctly fails after a normal target advance. |
| Reimplement merge classification in TypeScript | Rejected | `worktree_merge_mode` is already the cross-consumer authority. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused suite: 302 pass, 0 fail across recovery/reconcile, receipt/lifecycle, lease/concurrency, board, mutation guard, closeout journal, and helper tests.
- Full suite: 2854 pass, 2 platform skips, 2 ambient `CODEX_SESSION_ID`/host-attribution failures in `tests/trace-observer.test.ts`; the same file passed 9/9 with those ambient host variables unset. No WP0-C path was implicated.
- Root checks passed: deploy SQL order, architecture sync, task sync, strict workflow, project-state inspect, and init dry-run.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
