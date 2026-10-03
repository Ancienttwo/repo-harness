# Implementation Notes: campaign-preparation-retry

> **Status**: Active
> **Plan**: plans/plan-20260910-2258-campaign-preparation-retry.md
> **Contract**: tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md
> **Review**: tasks/reviews/20260910-2258-campaign-preparation-retry.review.md
> **Last Updated**: 2026-09-11 03:30
> **Lifecycle**: notes

## Design Decisions

- The stored preparation record stays the single authority for the effect window. The retry path reads it and returns it; it never rewrites it. That is why `prepareChild` now returns the record out of `withCampaignPlanningLock` instead of discarding the lock's result — the caller downstream must use the stored deadline, not the one it was invoked with.
- The caller's bound may narrow but never widen. `prior.deadline_ms > candidate.deadline_ms` rejects, so a retry issued under a tighter bound is refused rather than silently clamped, and a retry issued under a looser bound cannot renew the window. `prior.deadline_ms <= Date.now()` rejects for the same reason: an expired window is a reconciliation boundary, not a retryable one.
- Container-journal existence is the effect signal, not provider return status. `assertCampaignPreparationRetryable` lives in `campaign-runtime.ts` beside `reconcileCampaignCodexPreparation`, which already owns the journal path derivation, so the fence and the reconciler cannot drift apart on where a journal lives.
- Both identities are checked, version probe first. The probe journal is created before the workload journal, so checking only the workload identity would let a retry through after the probe had already reached the runtime.
- Retry is worker-only. A verifier preparation implies the worker already terminated, which is later evidence by construction; allowing verifier retry would mean reasoning about which of the two children owns the window.
- Record shape is compared, not just identity. `exact(Object.keys(prior).sort(), ['deadline_ms', 'identity'])` rejects a record written by a different version of this code rather than retrying against a shape whose semantics are unknown.

## Deviations From Plan Or Spec

- The plan named `docs/researches/20260910-campaign-preparation-retry.md` as the durable boundary record. Not written: the boundary is one invariant about one admission window, and it is stated in this contract's Goal and in these notes. Promote to `docs/researches/` only if a second admission window needs the same rule.
- `Task Profile` was captured as `code-change` and is now `bugfix`. The pre-fix failure artifact and root-cause evidence the plan called for only gate under the `bugfix` profile, so the original value would have left them unverified.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Delete the preparation record on a pre-journal failure, so the next call takes the fresh path | Rejected | The record is the only durable trace that an attempt was made; deleting it would let a retry mint a new deadline and defeat the immutable effect window. |
| Treat provider error type (transport vs. runtime) as the retry signal | Rejected | Error text is provider-owned and unversioned. Journal existence is a fact this repository writes and can prove. |
| Allow the retry to extend the deadline when the caller's bound is later | Rejected | The stored deadline bounds an effect that may already be in flight from the operator's point of view; extending it converts a bounded attempt into an open-ended one. |
| Put the journal fence inside `prepareCampaignCodexInvocation` | Rejected | That function already creates the journal; a fence inside it could not distinguish "about to create" from "created by the prior attempt". |

## Open Questions

- The pre-fix log was captured against a controller whose Docker PATH was broken. Resuming the stranded dispatch through normal `contract-run` still needs that PATH repaired; the fix removes the wedge, not the environment fault that produced it.
- `check-architecture-sync.sh` failed in this worktree purely because its `node_modules` still held archctx 0.5.9 against the 0.5.10 pin the rebase brought in. Worth watching whether other long-lived worktrees hit the same stale-install gate after a pin bump.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

> **Substantive Change SHA256**: `sha256:ca856a49fc5a8d88bc1184086d46e26055617cbfaf95f756a43a524e9dbfd5f0`
