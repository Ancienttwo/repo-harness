# Implementation Notes: verify-provenance-overlay

> **Status**: Active
> **Plan**: plans/plan-20260801-2124-verify-provenance-overlay.md
> **Contract**: tasks/contracts/20260801-2124-verify-provenance-overlay.contract.md
> **Review**: tasks/reviews/20260801-2124-verify-provenance-overlay.review.md
> **Last Updated**: 2026-08-01 21:50
> **Lifecycle**: notes

## Design Decisions

- The defect is a layer violation at a re-ingestion boundary, not a competing writer. `finalize_prepared_acceptance()` never wrote `checks/latest.json` itself -- it always went through `emit-verify-evidence.ts` -> `writeChecksLatest`. What it did wrong was read a *projection* back and feed it in as a *source run trace*, dragging the materializer-owned `provenance` block into the payload. The fix is therefore one `del(.provenance)` at that boundary, not new logic anywhere else.
- `contentHashOf` deliberately hashes the run trace and excludes the provenance block it is stored in, so the published file can be re-verified from its own bytes. Once the run trace itself contained a `provenance` key, the spread in `buildChecksLatestProjection` overwrote it in the output while the hash still covered it -- a hash over a strictly larger object than what was published. Nothing in the materializer was wrong; its input contract was violated.
- The regression test extracts the jq program out of `scripts/verify-sprint.sh` by source offsets and runs it verbatim with real `jq`, rather than restating the filter in TypeScript. A restated copy would drift away from the shipped filter and stop guarding it. Precedent for reading the shipped script inside a test: `tests/evidence-checks-materializer.test.ts`'s no-independent-authoring test.
- The behavioral half of that test returns early when `jq` is absent, because the README lists `jq` as an optional prerequisite and the overlay itself refuses to run without it. The unconditional source-binding test (the overlay program must contain `del(.provenance)` before the acceptance fields) keeps the fix guarded on a jq-less machine, so the early return is not a hole.
- The test ends with a causality lock: it re-seeds the same overlay output with the previous materialization's provenance re-attached and asserts the resulting projection is *not* self-consistent. Without that, a green run would not prove the strip is what makes it green.

## Deviations From Plan Or Spec

- None.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Strip `.provenance` in the finalize overlay before re-emission | Chosen | Smallest change that restores the materializer's input contract; provenance stays derived-only, and the hash is self-consistent by construction with no second hash implementation. Also drops ~600 bytes of payload, which is what pushed the event past the 8192-byte inline cap. |
| Recompute and write back `content_hash` after the overlay | Rejected | Duplicates canonical serialization outside the materializer (a second hash authority) and still leaves the stale block embedded in the ledger payload. |
| Strip `provenance` inside `buildChecksLatestProjection` before flattening | Rejected | Defensive compatibility code against a producer this repo controls; it would also silently accept future producers that leak projection metadata instead of failing the contract. |
| Relax the drift assertion | Forbidden | The assertion is the only thing that makes `checks/latest.json` re-verifiable from its own bytes. |

## Open Questions

- None.

## Evidence Links

- Pre-fix failure artifact: `tasks/notes/20260801-verify-provenance-overlay.pre-fix.log` (3 failures on the unfixed overlay)
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
