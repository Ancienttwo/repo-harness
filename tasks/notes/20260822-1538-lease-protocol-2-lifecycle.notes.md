# Implementation Notes: lease-protocol-2-lifecycle

## Frozen decisions

- `COORDINATION_PROTOCOL` remains `1`; lease record schema versioning is an independent strict V1/V2 union.
- Raw `contract-worktree finish --no-merge` cannot enter `reviewing`: it runs before PR, receipt, marker, and ship journal facts exist. The only normal entry hook is `ship_linked_pr` after durable `pr_observed` and before ship journal `complete`.
- `finish_transaction_key` identifies the contract-worktree finish journal. `current_publication.ship_transaction_key` identifies the independent ship journal. They must never be substituted.
- Existing `sprint reconcile` must refuse `reviewing`; WP0-C owns fetch-backed provider reconciliation.
- Legacy migration is allowed only for a fully revalidatable marker-backed receipt plus matching provider/journal/lease facts. Missing identity evidence is `legacy_unattributable`, never synthesized or adopted.
- Publication lineage is immutable audit beside the publication store. `current_publication` in the lease is the sole currentness authority.

> **Status**: Active
> **Plan**: plans/plan-20260822-1538-lease-protocol-2-lifecycle.md
> **Contract**: tasks/contracts/20260822-1538-lease-protocol-2-lifecycle.contract.md
> **Review**: tasks/reviews/20260822-1538-lease-protocol-2-lifecycle.review.md
> **Last Updated**: 2026-08-22 15:38
> **Lifecycle**: notes

## Design Decisions

- Lease schema uses a strict runtime V1/V2 union while retaining
  `COORDINATION_PROTOCOL = 1`. V2 is introduced at `completing -> reviewing`;
  its `current_publication` pointer is non-null only in `reviewing` and carries
  the distinct ship journal key, never `finish_transaction_key`. Schema 1
  retains its existing field-level combinations but rejects schema-2 carriers
  and unknown outer keys; schema 2 closes the state/execution/pointer tuple.
- `ship_linked_pr` writes `pr_observed`, then calls `publication mark-reviewing`,
  then records ship `complete`. Recovery repeats the same proof idempotently.
- Reopen retains bind-declared execution fields only after topology/branch/head
  proof. Takeover ends at `reserving` and therefore reaches bound exclusively
  through the pre-existing `sprint bind` resumed-receipt path.
- Abandon creates an immutable, byte-idempotent lineage event before publishing
  `released` and removing the lease directory.
- Reopen, takeover, and abandon re-build the marker-backed receipt under the
  task lock before mutation and require explicit expected generation plus head
  fences. Abandon additionally requires a canonical pending row and a live
  provider observation of `CLOSED` with no merge timestamp.
- A supplied ship-journal path is an untrusted carrier. Lifecycle proof derives
  the sole accepted common-directory journal from the ship key, verifies the
  key derivation and metadata/phase heads, and splits in-progress review entry
  from completed legacy proof. Board claims project the pointer and only offer
  lifecycle commands for reviewing leases.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Let `sprint reconcile` clear reviewing | Rejected | Its local, non-fetching proof cannot close provider publication ownership. |
| Reuse `finish_transaction_key` for ship identity | Rejected | Contract finish and ship journals are different transaction domains. |
| Direct takeover to bound | Rejected | It would bypass bind's sole execution-field writer and resumed receipt. |

## Open Questions

- Legacy CLI migration is intentionally limited to marker-backed receipt,
  provider, journal, and lease agreement. Provider-driven recovery/reconcile
  remains WP0-C.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Independent gate: PASS after crash-recovery re-review.
- Full repository suite: 2844 pass, 2 platform skips, 0 fail (754.31s, outside sandbox).
- Automatic architecture projection restamped its manifest against the final WP0-B subject; semantic architecture output was unchanged.
- Final Change Assessment routes the complete publication abstraction surface through the deterministic transition/receipt suite; no selected novelty path is left without an executable oracle.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
