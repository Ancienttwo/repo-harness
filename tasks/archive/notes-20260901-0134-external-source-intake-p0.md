> **Archived**: 2026-09-01 01:34
> **Related Plan**: plans/archive/plan-20260831-1512-external-source-intake-p0.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260901-0134

# Implementation Notes: external-source-intake-p0

> **Status**: Active
> **Plan**: plans/plan-20260831-1512-external-source-intake-p0.md
> **Contract**: tasks/contracts/20260831-1512-external-source-intake-p0.contract.md
> **Review**: tasks/reviews/20260831-1512-external-source-intake-p0.review.md
> **Last Updated**: 2026-08-31 15:12
> **Lifecycle**: notes

## Design Decisions

- Keep the provider observation plane inert: a GitHub Issue may be observed but never becomes TaskOffer, Claim, Lease, WorkEnvelope, collaboration, or runtime authority.
- Replace the pre-merge flat label rule with one closed selector union. `labels` owns repository scans; `issue_numbers` owns explicitly reviewed one-shot batches and fetches exact Issue endpoints only.
- Do not infer already-dispatched state from GitHub assignees, labels, comments, or open/closed state. Dispatch deduplication requires a later authenticated binding to canonical repo-harness task identity.
- Freeze the next-layer authority boundary from the user's 2026-08-31 direction: Issue publication, adoption, dispatch, execution, verification, and repair must not require per-unit `user_waiver` or human review. The sole human acceptance boundary is PR merge. P0 remains inert; WP2 must express this as tracked policy plus authenticated binding/receipts rather than silently widening P0 observations into execution authority.
- Define the only pre-merge human-stop class narrowly as `installation_blocker`: a missing credential/authorization, unavailable provider capability, or required host dependency that the Agent cannot install or authorize inside its granted scope. Ordinary ambiguity, review preference, test failure, implementation error, provider content, or a recoverable runtime failure is not an installation blocker and must stay inside the automated repair/verification loop.
- Adopt the new capability into ArchContext only after marking the generated P1/P2 region in the previously unowned module document. The projection then reached a fixed point; four obsolete ignored runtime acceptance candidates were moved to the recoverable `superseded-candidates` cache so the strict gate reflected the current accepted signal instead of stale attempts.
- Treat `deadline_ms` as one refresh-wide budget. Each `gh` subprocess receives only the remaining time, so exact Issue batches and paginated scans cannot multiply the configured deadline by their request count.
- Accept GitHub's authoritative renamed/transferred `full_name` while retaining the immutable repository ID as identity. A display-name change therefore produces a new observation revision instead of a false identity failure; a missing immutable ID still fails closed.

## Deviations From Plan Or Spec

- The original P0 plan required a positive label rule. The live `Ancienttwo/byok-sdk#102-#111` sample is intentionally unlabeled and unassigned but explicitly selected and already dispatched. User-directed optimization widened the clean pre-merge P0 schema to exact Issue-number batches instead of adding a compatibility shape or title/body heuristic.
- The first post-midnight full-suite run exposed an existing month-boundary test defect: Bun's test clock and the shell `date` used by `workflow_rotate_events_file` could resolve different months. The test now discovers the single stamped archive produced by the shell and verifies its contents, instead of re-deriving the shell's calendar in JavaScript.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Require provider labels for every intake | Rejected | The reviewed ten-Issue batch has no labels or assignees; retroactive GitHub mutation is unnecessary and would conflate discovery with intake authority. |
| Infer batch membership from title prefix, author, timestamp, or audit-baseline body text | Rejected | Those are mutable provider content and would create heuristic semantic authority. |
| Exact sorted Issue-number selector | Selected | It is explicit, auditable, bounded, avoids repository-wide pagination, and fails closed when one selected Issue is unavailable. |
| Require a human waiver before Issue publication or execution | Rejected for WP2 | It would move the acceptance boundary into every execution step and defeat unattended operation; the merge candidate is the reviewable, reversible human boundary. |
| Let external Issues directly create TaskOffer/Lease authority | Rejected | Removing human execution pauses does not remove canonical task, contract, lease, or verification fences. An authenticated binding receipt must bridge evidence to canonical work before dispatch. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Live read-only sample: `Ancienttwo/repo-harness#231-#240`, observed 2026-08-31 through one temporary exact-number policy; the refresh completed with ten eligible observations resolved by immutable provider Issue/repository IDs. The tracked policy was restored to `mode: off` after the smoke test.
- Focused verification: `bun test tests/unit/external-source-policy.test.ts tests/effects/external-source-github.test.ts tests/effects/external-source-store.test.ts tests/unit/external-source-intake-p0.test.ts tests/cli/external-source-intake.test.ts tests/unit/external-source-authority.test.ts --timeout 60000` and `bun run check:type`.
- Architecture verification: `bash scripts/check-architecture-sync.sh` reports zero blocking candidates and `bun test ./tests/architecture-projection-e2e.test.ts --timeout 60000` passes after advancing the exact projection target-count pin from 28 to 29.
- Month-boundary regression: `bun test ./tests/workflow-state-lock.test.ts --timeout 60000` verifies rotation against the actual unique archive file, independent of Bun/shell timezone disagreement.
- Change Assessment: `external-source-intake-tests` covers the selected new abstraction with deterministic focused/full tests; `github-exact-batch-live-readback` covers the same selected surface with the successful `Ancienttwo/repo-harness#231-#240` refresh.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
