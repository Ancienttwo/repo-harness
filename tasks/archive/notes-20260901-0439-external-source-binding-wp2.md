> **Archived**: 2026-09-01 04:39
> **Related Plan**: plans/archive/plan-20260901-0205-external-source-binding-wp2.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260901-0439
> **Archive Projection V1**: `plans/plan-20260901-0205-external-source-binding-wp2.md` => `plans/archive/plan-20260901-0205-external-source-binding-wp2.md`
> **Archive Projection V1**: `tasks/notes/20260901-0205-external-source-binding-wp2.notes.md` => `tasks/archive/notes-20260901-0439-external-source-binding-wp2.md`
> **Archive Projection V1**: `tasks/contracts/20260901-0205-external-source-binding-wp2.contract.md` => `tasks/archive/contract-20260901-0439-external-source-binding-wp2.md`
> **Archive Projection V1**: `tasks/reviews/20260901-0205-external-source-binding-wp2.review.md` => `tasks/archive/review-20260901-0439-external-source-binding-wp2.md`

# Implementation Notes: external-source-binding-wp2

> **Status**: Active
> **Plan**: plans/archive/plan-20260901-0205-external-source-binding-wp2.md
> **Contract**: tasks/archive/contract-20260901-0439-external-source-binding-wp2.md
> **Review**: tasks/archive/review-20260901-0439-external-source-binding-wp2.md
> **Last Updated**: 2026-09-01 02:05
> **Lifecycle**: notes

## Design Decisions

- `ExternalSourceBindingReceiptV1` is one immutable edge from an exact observation revision to an exact canonical task revision. N:M provenance is represented by multiple receipts, not by a mutable mapping index.
- Binding requires the repository registry to remain `read_write`, the observation to remain eligible and byte-identical, and the named target ref to prove the pending task plus its approved plan/contract before and immediately before persistence.
- Provider content has one explicit renderer and remains inside `[ExternalSourceUntrusted]` markers. Fleet never consumes provider title, body, labels, or assignees.
- Drift is a read-time projection (`source_drift`, `canonical_drift`, `authorization_stale`, `authority_unavailable`); it does not rewrite, cancel, or revive canonical work.

## Deviations From Plan Or Spec

- The planning prose called the binding listing surface `external-source list`; implementation uses the dedicated `external-source bindings` command so the existing observation `list` contract remains stable and each JSON schema stays closed.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Mutable source-to-task index | Rejected | It creates recovery and authority ambiguity; the current scale does not justify it. |
| Append-only edge receipts | Selected | Deterministic, idempotent, reconstructable, and naturally supports one-to-many and many-to-one provenance. |
| Automatic prompt injection from Issue text | Rejected | Provider text is untrusted evidence and must require an explicit context read. |
| Reclassify Fleet offers from Issue metadata | Rejected | Canonical sprint/task identity remains the only scheduling authority. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Protocol: `src/core/external-sources/binding.ts`
- Effect: `src/effects/external-sources/binding.ts`
- CLI end-to-end proof: `tests/cli/external-source-binding.test.ts`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- None. The durable boundary is already owned by the architecture module and external-tooling reference config.
