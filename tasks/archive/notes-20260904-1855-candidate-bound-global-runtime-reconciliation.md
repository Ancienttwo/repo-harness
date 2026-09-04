> **Archived**: 2026-09-04 18:55
> **Related Plan**: plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260904-1855
> **Archive Projection V1**: `plans/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md` => `plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md`
> **Archive Projection V1**: `tasks/notes/20260904-0226-candidate-bound-global-runtime-reconciliation.notes.md` => `tasks/archive/notes-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
> **Archive Projection V1**: `tasks/contracts/20260904-0226-candidate-bound-global-runtime-reconciliation.contract.md` => `tasks/archive/contract-20260904-1855-candidate-bound-global-runtime-reconciliation.md`
> **Archive Projection V1**: `tasks/reviews/20260904-0226-candidate-bound-global-runtime-reconciliation.review.md` => `tasks/archive/review-20260904-1855-candidate-bound-global-runtime-reconciliation.md`

# Implementation Notes: candidate-bound-global-runtime-reconciliation

> **Status**: Active
> **Plan**: plans/archive/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md
> **Contract**: tasks/archive/contract-20260904-1855-candidate-bound-global-runtime-reconciliation.md
> **Review**: tasks/archive/review-20260904-1855-candidate-bound-global-runtime-reconciliation.md
> **Last Updated**: 2026-09-04 02:26
> **Lifecycle**: notes

## Design Decisions

- Candidate authority begins at the first updater release that contains the
  candidate-handoff protocol. A parent from that release may still project a
  30-second `Stop.default` builder in memory, but it delegates the write to
  the newly installed candidate and commits only its receipt.

## Bounded Legacy Migration Contract

- A frozen predecessor without the candidate-handoff branch cannot be made
  semantically atomic by the package it installs: its already-loaded process
  has no protocol path to start the candidate reconciler.
- The bounded migration is therefore `legacy updater -> candidate bootstrap`,
  followed by an explicit second invocation:

  ```text
  repo-harness update --target <target>
  ```

  The target must be the host scope needing reconciliation (`codex`, `claude`,
  or `both`). The second invocation begins in candidate code and is the first
  invocation covered by candidate-bound transaction/receipt guarantees.
- The bootstrap invocation must not be described as a completed atomic repair;
  it can leave `candidate package + predecessor adapter`. No compatibility
  fallback or recursive re-entry is added to an already-running legacy binary.
- `tests/unit/candidate-bound-global-runtime-reconciliation.test.ts` freezes
  this boundary with distinct B-parent/C-candidate roots: candidate-aware B
  produces C's 150-second projection in one update, while frozen legacy B
  leaves 30 until the explicit second C update.

## Deviations From Plan Or Spec

- Legacy binaries predating the candidate-handoff protocol are an explicit
  migration boundary, not a one-release atomic-upgrade guarantee.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

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
> **Substantive Change SHA256**: `sha256:cb461da73413abc4cd2717e99f7671d1e216a1f3d6ef8c53c2157a595a25542e`
