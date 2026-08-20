> **Archived**: 2026-08-20 19:05
> **Related Plan**: plans/archive/plan-20260820-1605-projection-publication-ownership.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1905

# Implementation Notes: projection-publication-ownership

> **Status**: Active
> **Plan**: plans/plan-20260820-1605-projection-publication-ownership.md
> **Contract**: tasks/contracts/20260820-1605-projection-publication-ownership.contract.md
> **Review**: tasks/reviews/20260820-1605-projection-publication-ownership.review.md
> **Last Updated**: 2026-08-20 17:13
> **Lifecycle**: notes

## Design Decisions

- `verify-sprint --prepare-acceptance` owns automatic projection materialization and invokes the configured CLI before review-subject fingerprinting. Disabled/manual modes remain unchanged; automatic readiness or apply failures stop preparation.
- `docs/architecture/.projection-manifest.json` is the only implicit workflow-owned projection path. Semantic architecture docs and generated context remain contract-owned and fail scope unless explicitly listed.
- `contract-worktree` no longer restores a dirty target manifest. Target dirt is evidence of an unowned write and blocks publication instead of being discarded.
- Real ArchContext output proved `verifiedAgainst.commit` restamps when the source checkpoint HEAD moves even if rendered module bytes do not. After the synthesized manifest-bearing publication lands, closeout must therefore acknowledge that exact SHA in the target worktree drift cursor; the next Stop then observes an empty range instead of replaying the contract source paths.
- The user explicitly authorized co-publishing all pre-existing primary-worktree WIP. The two deleted v0.5 plan drafts and the new model-infra boundary research note are copied into the candidate exactly. The primary worktree's generated manifest is deliberately not copied because it describes a different checkpoint; acceptance-time projection in the candidate remains the authority.

## Deviations From Plan Or Spec

- This self-hosting contract explicitly lists `docs/architecture/.projection-manifest.json` because the currently installed closeout helper predates the new workflow-owned exception. The shipped behavior is still proved without that declaration by the disposable verify-sprint and single-publication fixtures.
- The initial plan assumed a pre-acceptance projection would be byte-idempotent after publication. Real-provider verification falsified that assumption, so scope expanded to the drift cursor acknowledgement that makes publication the delivery boundary.
- After the first frozen subject, the user widened this publication to include all primary-worktree WIP. That invalidates the earlier subject digest and requires a fresh prepare/review/receipt cycle; the contract Allowed Paths and plan annotation record the human decision.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep Stop-time projection plus target restore | Rejected | It creates an unreviewed WIP and then silently discards it during the next closeout. |
| Treat all `docs/architecture/` as workflow-owned | Rejected | Mixed-ownership module docs contain human-authored regions and cannot be safely exempted. |
| Materialize before acceptance and exempt only the manifest | Selected | It preserves one reviewed publication authority and keeps all semantic outputs fail-closed. |
| Depend on provider byte-idempotency across HEAD changes | Rejected after real-provider test | `verifiedAgainst.commit` changed from `aebebae1` to `935f97bb` with unchanged rendered module digests. |
| Acknowledge the exact manifest-bearing publication | Selected | It preserves provider provenance semantics while preventing Stop from re-delivering a delta already reviewed and published. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix falsifier: `.ai/harness/runs/projection-publication-ownership-pre-fix.log` (`PRE_FIX_EXIT=1`).
- Targeted regression: 177 tests passed across architecture drift, closeout recovery, helper, publication, and projection-ownership suites; `bun run check:type` passed.
- Repository checks passed: deploy SQL ordering, architecture sync, task sync, strict task workflow, project-state inspection, and source `init --dry-run`.
- Full-suite observation: the first unsanitized run reached 2718 pass / 1 skip with only two ambient `CODEX_SESSION_ID` trace-observer failures; that file passed 9/9 after removing the host-injected session variable. A second isolated run was not acceptance evidence because the sandbox denied loopback listeners and exposed unrelated timing/global-state fixture failures. The contract's six directly affected suites remained green.
- Final acceptance preparation is intentionally run from oracle-bound checkpoint `3b72672e` with this task-note update left in the subject, so the real provider restamp and task-sync evidence are frozen together.
- The first final prepare correctly blocked on Change Assessment `pattern_novelty`: the contract had not declared its already-implemented deterministic and runtime-readback oracles. The contract now names both explicitly; no product behavior changed for this gate correction.
- After local `main` advanced through `f0f0345f` to `c5ab577d`, the user explicitly approved synchronizing that pre-existing history to `origin/main`. The candidate then rebased onto exact commit `c5ab577daed92d6337e876a3488a21ffa035e094` and refreshed its worktree metadata before freezing a replacement subject.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
