> **Archived**: 2026-09-12 14:22
> **Related Plan**: plans/archive/plan-20260911-0238-proactive-refactor-recommendations.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260912-1422
> **Archive Projection V1**: `plans/plan-20260911-0238-proactive-refactor-recommendations.md` => `plans/archive/plan-20260911-0238-proactive-refactor-recommendations.md`
> **Archive Projection V1**: `tasks/notes/20260911-0238-proactive-refactor-recommendations.notes.md` => `tasks/archive/notes-20260912-1422-proactive-refactor-recommendations.md`
> **Archive Projection V1**: `tasks/contracts/20260911-0238-proactive-refactor-recommendations.contract.md` => `tasks/archive/contract-20260912-1422-proactive-refactor-recommendations.md`
> **Archive Projection V1**: `tasks/reviews/20260911-0238-proactive-refactor-recommendations.review.md` => `tasks/archive/review-20260912-1422-proactive-refactor-recommendations.md`

# Implementation Notes: proactive-refactor-recommendations

> **Status**: Active
> **Plan**: plans/archive/plan-20260911-0238-proactive-refactor-recommendations.md
> **Contract**: tasks/archive/contract-20260912-1422-proactive-refactor-recommendations.md
> **Review**: tasks/archive/review-20260912-1422-proactive-refactor-recommendations.md
> **Last Updated**: 2026-09-11 02:38
> **Lifecycle**: notes

## Design Decisions

- P1: Global installation owns preferences; ArchContext owns measured candidates; approved plans own execution.
- P2: Stop after required gates -> bounded scan/lifecycle readback -> upstream identity projection -> Agent asks user. No author/accept/materialize/activation call.
- P3: Reuse the existing provider contract, with a ten-second scan inside Stop budget. The five-minute cooldown bounds repeated scan cost.

## Deviations From Plan Or Spec

- Use upstream candidate identity/fingerprint directly for delivery, without re-deriving semantic identity from repository snapshots.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Evict old identities | Rejected | A stable 65-candidate set would repeat the first prompt after wraparound. |
| Bounded non-evicting ledger | Selected | 4096 identities and a 3 MB read bound; capacity pauses delivery explicitly instead of repeating prompts. Explicit CLI remains available. |

## Open Questions

- None.

## Evidence Links

- Real Archctx 0.5.10 CLI and Stop fixture: three measured opportunities delivered with execution off; immediate repeat had no decision block. Fixture isolated from user repositories.
- Architecture review found a stale contract test path, corrected here. Security review found the 64-item eviction defect, corrected with 65-candidate and capacity regressions. No second external review is represented.
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

> **Substantive Change SHA256**: `sha256:4ab9e6caa040b348869df71df436641b397043a4484539eb2042f8310820602c`

## Verification and delivery boundary

Frozen implementation at b251dbca passed all 12 declared commands (63 focused tests plus the global bootstrap test, typecheck and required integrity checks). The enclosing prepare gate identified an empty Change Assessment oracle list; this contract metadata is now bound to focused-regression. No product code or timing thresholds changed. PR #408 is stacked on #401; formal external acceptance remains pending.

After synchronizing base fixture-only correction 42193bb3, the stacked PR compare range has the following binding. Feature implementation is unchanged from the 17/17 prepare baseline at a484e8d7; base fixture delta passed its four focused cases.

> **Substantive Change SHA256**: `sha256:3e3c74da463e29cc5a120b6bd5dea2b59c3accd298727782072f9f3a514d3374`

Current stacked compare binding after protected-runtime base correction:

> **Substantive Change SHA256**: `sha256:c409fb9c3b278f7d2d931b7bf34fbed30919149b9066797583d45a1a1273e32f`

Final stacked base synchronized to 76b05000 (main e238a73a incorporated).

> **Substantive Change SHA256**: `sha256:a7e80326504ed33b13690fb43d9d3beab47ced7e81c31953e8a11bdefa9215c9`

Official codex-plugin review approved beacd220 against base 76b05000 with zero findings. Review subject: sha256:4940895c75a757cbe9be3fb59232054611bb819e34eddd2ea233220f89fc8c2b. The subsequent base synchronization retained upstream run-summary retention and both test blocks; that merge delta is locally verified separately. The earlier approval is not an exact-current-subject AcceptanceReceipt.

> **Substantive Change SHA256**: `sha256:d5aeb5683c3436efb293787c5c47b3116345763bda840a7f20a16e4c7a3a6fa5`

Owner-accepted base compare binding:

> **Substantive Change SHA256**: `sha256:fa594bc54244c2e29ffede088c8d3e5d1b68777869df428ce8ad700fe243587e`

## Main publication boundary

PR #401 was squash-merged as 9563083c. Merging that published baseline into this branch resolved only repeated-history conflicts: the resulting complete tree is identical to the passing CI subject 4b68c9be. The PR now targets main. Refresh acceptance for the new target using the existing owner grant; CI remains required.

> **Substantive Change SHA256**: `sha256:fc6e1ac0ece02c467bdf41dbc7dd844edf770bb9eb943fa138313cf377f28f6a`

## Workflow closeout

Delivered via PR #408, merged at 3ea6e453. No typed AcceptanceReceipt was sealed
for that exact subject (the codex-plugin approval named an earlier subject and the
review card records external acceptance as pending), so `completed_archive_gate`
cannot admit a `Completed` archive without a user-issued waiver. Archived
`Superseded` instead: the merged main tree is the surviving authority for this
scope and the plan family no longer represents active work.
