# Implementation Notes: epc-00-program-canonicalization

> **Status**: Active
> **Plan**: plans/plan-20260722-1107-epc-00-program-canonicalization.md
> **Contract**: tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md
> **Review**: tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md
> **Last Updated**: 2026-07-22 11:07
> **Lifecycle**: notes

## Design Decisions

- Frozen decisions live in the sprint Program document itself, not a
  separate research file or this notes file — a second design surface
  would be a dual authority under R6; EPC-01..09 contracts cite the sprint
  document directly.
- `ledger_epoch_start_sha` (D2) is deliberately specified as a rule, not a
  literal value: EPC-01's own genesis record captures its own R1-pinned
  base SHA at EPC-01's fresh fetch; EPC-00 cannot know that SHA in advance.
- Backlog rows 12 and 13's acceptance-line edits are clarifications of
  already-approved scope, not scope changes: row 12 makes the token/p95
  gate machine-checkable; row 13 defines the residue-scan target and
  formalizes the cannot-execute fallback as a checked assertion.
- D9's keep/merge/retire verdicts over the four recovery-view writers are
  explicitly preliminary; EPC-07 completes the consumer inventory and may
  revise the merge/retire map in its own contract if an undeclared fifth
  consumer turns up.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add a separate EPC-00 design-freeze research doc | Rejected | The sprint document already carries normative rules R1–R6 and row protocols; a second doc would be a dual design authority |

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
