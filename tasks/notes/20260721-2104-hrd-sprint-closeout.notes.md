# Implementation Notes: hrd-sprint-closeout

> **Status**: Active
> **Plan**: plans/plan-20260721-2104-hrd-sprint-closeout.md
> **Contract**: tasks/contracts/20260721-2104-hrd-sprint-closeout.contract.md
> **Review**: tasks/reviews/20260721-2104-hrd-sprint-closeout.review.md
> **Last Updated**: 2026-07-21 21:04
> **Lifecycle**: notes

## Design Decisions

- Close the sprint through a separate `ledger-closeout` package because the
  lifecycle projection is an independent verification and rollback boundary.
- Preserve both archived review files byte-for-byte. Their pre-merge pending
  language is historical evidence, not text to normalize after the fact.
- Name PR #106's implementation merge `HRD_RUNTIME_SHA`. Do not predict or
  backfill this package's own merge SHA; the VGBR successor fresh-fetches
  `origin/main` and pins the actual HRD-CLOSEOUT merge as `POST_HRD_SHA`.
- Freeze `main` after the closeout merge until VGBR benchmark acceptance.
- BDD2 may continue in its independent worktree during that window, but no
  BDD2 or other merge may change the frozen VGBR subject.

## Historical Closeout Annotation

- annotation_kind: historical_review_supersession
- target_artifacts:
  - `tasks/archive/review-20260721-1746-hrd-08-event-telemetry-and-benchmark.md`
  - `tasks/archive/review-20260721-2035-hrd-09-legacy-retirement-and-adopted-migration.md`
- frozen_artifact_sha256:
  - `5b4a91d186fd02b38dac4618a48a38fc016840a961e1a057918e8e8dcf8c25f9`
  - `54e2d4ddf9c4c3b2b1538d0d7b5259f02c6d60322975a3de533d4feb0b0917ed`
- historical_text_mutation: none
- superseding_fact: PR #106 merged to `origin/main`
- superseding_merge_sha: `b5a98c903d3728002d2f663ba7a1b421913e368f`
- effective_base: `origin/main@b5a98c903d3728002d2f663ba7a1b421913e368f`
- hrd_runtime_sha: `b5a98c903d3728002d2f663ba7a1b421913e368f`
- successor_pinned_sha_rule: package records consumed base and never predicts its own merge SHA
- post_hrd_sha_owner: VGBR successor after fresh fetch of merged `origin/main`
- serial_successor: `POST_HRD_SHA pin and main freeze -> VGBR-R -> EPC-00 -> EPC-01`
- supersession_statement: The archived review lifecycle and pending wording remain historical; current HRD implementation delivery is superseded by the PR #106 merge fact, while Program closeout becomes authoritative only when the HRD-CLOSEOUT PR merges.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Rewrite archived review status/receipt prose | Rejected | It would overwrite the historical lifecycle view and make the archive narrate facts unavailable at review time. |
| Append annotation inside each archived review | Rejected | It would still mutate frozen historical evidence. |
| Add one closeout-owned annotation and point to it from the sprint | Selected | It preserves archive bytes and gives the current Program an explicit superseding fact. |
| Predict or backfill this package's merge SHA | Rejected | A package cannot know its own merge commit; the first successor pins the exact merged base. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- HRD implementation merge: `b5a98c903d3728002d2f663ba7a1b421913e368f`
- Frozen review hashes: recorded under `## Historical Closeout Annotation`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
