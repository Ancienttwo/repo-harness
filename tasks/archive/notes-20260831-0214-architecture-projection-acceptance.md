> **Archived**: 2026-08-31 02:14
> **Related Plan**: plans/archive/plan-20260830-2139-architecture-projection-acceptance.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260831-0214

# Implementation Notes: architecture-projection-acceptance

> **Status**: Active
> **Plan**: plans/plan-20260830-2139-architecture-projection-acceptance.md
> **Contract**: tasks/contracts/20260830-2139-architecture-projection-acceptance.contract.md
> **Review**: tasks/reviews/20260830-2139-architecture-projection-acceptance.review.md
> **Last Updated**: 2026-08-31 00:00
> **Lifecycle**: notes

## Design Decisions

- The provider refresh signal is the only semantic delta authority. The CLI
  accepts only `signal-id + approval-reference`; reason codes, affected nodes,
  and `changeset.docs-projection-<digest16>` come from the validated signal.
- Candidate and acceptance receipt files are content-bound under the existing
  ignored architecture-projection runtime root. An identical retry reads the
  same receipt bytes; a different approval identity conflicts.
- Automatic-drain candidates retain the originating job id. After accepted
  apply and refresh delivery, the dead letter is atomically projected into the
  existing terminal job receipt so the strict gate and next source-journal
  acknowledgement share the same durable authority.
- Proof-only retirement has a different receipt schema and command from human
  acceptance. `reconcile` admits only an exact
  `verified-flow-proof-changed` reason set, runs a provider `check` request with
  no accepted change, and requires byte-identical CodeGraph-ready input/output
  snapshots plus an empty `noop` before writing evidence.
- Acceptance and reconciliation receipts are mutually exclusive for one
  candidate. A duplicate or orphan resolution artifact is invalid and remains
  gate-blocking instead of selecting a winner.
- The acceptance-store lock covers the full resolution effect, not only receipt
  persistence. This prevents concurrent approval identities or an accept/reconcile
  race from both reaching provider execution.
- A reconciled automatic-drain candidate is projected through the job store as
  a terminal receipt without `acceptedChange`; otherwise the independent
  dead-letter count would keep the strict gate blocked.

## Deviations From Plan Or Spec

- `verify-sprint --prepare-acceptance` reached the new manual boundary and
  produced unresolved signal
  `sha256:a143f60c4aa4bdaba37fee604195d694660442c95704f83b540b33bc348a6013`.
  It cannot proceed without an external approval reference. The signal was not
  accepted because this slice explicitly forbids automatic architecture
  decision-making.
- Root-cause tracing later proved that signal was not a semantic delta suitable
  for approval. This contract worktree had no `.codegraph/` index, so ArchContext
  produced no selector evidence and marked P2 unprovable for all 22 capabilities.
  The policy-owned `codegraph init -i .` plus `archctx sync` path restored every
  P1/P2 proof to `proven`; deterministic re-projection then returned `noop` with
  no human action or refresh signal.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Caller supplies reasons/nodes | Reject | Creates a second semantic authority and allows accepting a different delta. |
| Infer approval event prefix | Reject | Misattributes the approver; preserve the external reference exactly. |
| Delete candidate after acceptance | Reject | Keeping content-bound input plus receipt makes the acceptance reproducible and auditable. |
| Reuse acceptance receipt for recovered proof | Reject | That would falsely represent verification evidence as a human semantic decision. |
| Retire candidate after a current check-mode noop | Use | Binds the historical candidate to the recovered deterministic proof without provider apply. |

## Open Questions

- None for this slice. Reconciliation of a candidate with any semantic reason
  remains deliberately forbidden.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Full suite after reconciliation implementation: `bun test --timeout 60000`
  (`3514 pass`, `2 skip`, `0 fail`).
- Final acceptance preflight: local-source `verify-sprint --prepare-acceptance`
  stopped at the unresolved-major signal before freezing acceptance evidence.
- Flow-proof recovery: `codegraph init -i .`, `archctx sync`, and a local-source
  architecture projection returned `noop`, `humanActions: []`, and
  `refreshSignals: []` with CodeGraph ready and 22/22 P1/P2 proven.
- Focused reconciliation surface: 67 tests passed across acceptance, provider,
  orchestration, and strict-gate suites; `bun run check:type` passed.
- Final correction review expanded the focused surface to 71 passing tests. It
  proved serialized resolution, automatic-drain terminal receipt projection,
  residual dead-letter crash recovery, and re-digested request-surface tamper
  refusal. Final read-only review returned `PASS`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
