> **Archived**: 2026-08-21 03:29
> **Related Plan**: plans/archive/plan-20260821-0222-restamp-auto-publication.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260821-0329

# Implementation Notes: restamp-auto-publication

> **Status**: Active
> **Plan**: plans/plan-20260821-0222-restamp-auto-publication.md
> **Contract**: tasks/contracts/20260821-0222-restamp-auto-publication.contract.md
> **Review**: tasks/reviews/20260821-0222-restamp-auto-publication.review.md
> **Last Updated**: 2026-08-21 04:10
> **Lifecycle**: notes

## Design Decisions

- Classifier authority is read back from the durable receipt, not from the drain result. `ArchitectureProjectionDrainResultV1` deliberately does not carry `ProjectionResultV1` (frozen decision 11 keeps `drain --json` byte-stable), so the Stop lane loads `.ai/harness/architecture-projection/receipts/<jobId>.json` and revalidates it through `assertProjectionResult`. Two readers were added to the receipt store owner (`src/effects/architecture/projection-jobs.ts`) rather than duplicating store path knowledge in the new module.
- Outcome taxonomy splits `not-applicable` from `skipped`. A noop/semantic projection, an unapplied drain, or a missing receipt means the lane never applied, so it prints nothing; a refused gate, a refused CAS, or a fault prints exactly one advisory line. Without that split, ordinary Stops would grow a permanent advisory for a lane that had nothing to do.
- The manual entry classifies against the newest durable receipt and exits non-zero unless it published. An operator asking for a publication must not read a refused gate as success; the JSON carries the exact reason.

## Deviations From Plan Or Spec

- Frozen decision 3 says any pre-CAS abort runs `git reset -q -- <manifest>`. The implementation also restores the index when the `update-ref` CAS itself is refused: a refused CAS commits nothing durable but leaves the manifest staged, and leaving it staged would violate the same no-half-state invariant the reset exists for.
- CAS refusal is proven with a `reference-transaction` hook in the fixture repository plus a direct stale-old-value `update-ref` assertion, instead of a live race. With an attached HEAD, `git rev-parse HEAD` and the branch ref can never diverge inside one process, so the only alternatives were a live race (nondeterministic) or an injectable git-runner seam in production code (unrequested surface). The hook path exercises the real abort/restore branch.
- Test fixtures pin `commit.gpgsign=false` in the fixture repository. A machine-global signing configuration would otherwise decide the gate and make the synthesis tests skip locally while passing in CI.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Carry `ProjectionResultV1` on the drain result | Rejected | Changes the `drain --json` operator shape, which frozen decision 11 locks and a new test now guards |
| Inject a git runner into the publication effect for race tests | Rejected | Adds production surface for test reach only; the `reference-transaction` hook proves the same abort path against real git |
| Advisory on every Stop, including the inert lane | Rejected | Permanent noise for a lane that did not run; `not-applicable` stays silent |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Falsifier probe over the 121 real receipts in `.ai/harness/architecture-projection/receipts/`: 59 noop/empty, 25 restamp-only, 37 semantic, zero receipts with a non-manifest single entry and zero semantic results without rendered documents.
- Full suite `bun test --timeout 60000`: 2784 pass, 1 skip, 1 fail. The single failure is `tests/harness-benchmark-matrix.test.ts` asserting `bun add -g` chmods declared bin files to `0o777` while this Bun build produces `0o755`; it reproduces unchanged at the pre-work base commit `63a32ff9`, so it is an environment/Bun-version failure, not a regression from this work-package.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
