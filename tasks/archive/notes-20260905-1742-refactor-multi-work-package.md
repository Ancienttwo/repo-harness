> **Archived**: 2026-09-05 17:42
> **Related Plan**: plans/archive/plan-20260905-1617-refactor-multi-work-package.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260905-1742
> **Archive Projection V1**: `plans/plan-20260905-1617-refactor-multi-work-package.md` => `plans/archive/plan-20260905-1617-refactor-multi-work-package.md`
> **Archive Projection V1**: `tasks/notes/20260905-1617-refactor-multi-work-package.notes.md` => `tasks/archive/notes-20260905-1742-refactor-multi-work-package.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1617-refactor-multi-work-package.contract.md` => `tasks/archive/contract-20260905-1742-refactor-multi-work-package.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1617-refactor-multi-work-package.review.md` => `tasks/archive/review-20260905-1742-refactor-multi-work-package.md`

# Implementation Notes: refactor-multi-work-package

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-1617-refactor-multi-work-package.md
> **Contract**: tasks/archive/contract-20260905-1742-refactor-multi-work-package.md
> **Review**: tasks/archive/review-20260905-1742-refactor-multi-work-package.md
> **Last Updated**: 2026-09-05 16:17
> **Lifecycle**: notes

## Design Decisions

- Retain flat Program bindings: fan-out repeats one consistent provider identity; canonical taskRef selects the execution unit. Adding a second authored execution ID would duplicate existing Sprint/WorkGraph authority.
- Candidate success is task-scoped for fan-out; final-main resolution remains recommendation-scoped and requires all task evidence. This explicit staged contract preserves sequential execution without claiming early architectural completion.
- Board remains one card per binding and adds projected Work Package/task reference identity. Existing single-task Programs need no migration path.

## Verification boundary

- Pre-fix: `/tmp/refactor-multiwp-red.log` (2 failures at the observed uniqueness guard).
- Cross-layer consumer proof: `tests/unit/refactor-multi-work-package.test.ts`; provider and gate ports are injected, Git and persisted Program/candidate/execution/resolution stores are real.
- Baseline 78bb1716 partitioned full coverage is historical evidence only. All refactor consumers and canonical task tests cover this delta; no package/release behavior changes.

## Durable conclusion

Promoted to `docs/researches/20260905-refactor-multi-work-package.md` and the capability architecture contract. Activation ten-canary verification remains an explicit subsequent boundary.

## Review correction

Composition review identified a stale concurrent caller whose same idempotency key supplies reversed task items. Final provider refs were canonical, but begin_merge event refs were caller-ordered. The regression replays the stored transition from the pre-merge current and now fails before the fix with `idempotency key names another transition`; evidence `/tmp/refactor-multiwp-order-red.log`. Canonicalizing the event refs in Program order closes this boundary; the two affected integration files passed 12/12 (`/tmp/refactor-multiwp-order-green.log`). The initial attempt to capture the red signal hit the test runner's default 5-second timeout; the authoritative red capture uses the contract's 60-second timeout.

The first official plugin review was stopped with SIGTERM after the composition finding invalidated its frozen subject; no verdict is claimed from that run. Final peer acceptance must bind the corrected subject.

## Acceptance checkpoint

- Corrected implementation: `672de7d9aa91ebce78299e4c4ee490eaff0aa97c`; canonical prepare run `run-20260905T164221-95598-20260905-1617-refactor-multi-work-package` passed the two affected integration files, typecheck and state boundaries. Root integrity checks passed with the final substantive marker.
- Native review ledger: security, architecture, assumptions, composition (ordering finding fixed), cascade and abuse all PASS. Reviewers consumed parent test evidence; no duplicate full-suite runs.
- The final official plugin attempt returned `review_budget_exhausted`: this work-package's one semantic-review budget was consumed by the interrupted original call; the command explicitly requires owner acceptance after fixing findings. No official plugin PASS or typed AcceptanceReceipt is claimed. Do not reset the budget or relabel native review as plugin evidence.
- Merge remains pending: main at `78bb1716` has 27 unrelated verification-scope-profile-consistency changes. Its dirty `docs/architecture/.projection-manifest.json` overlaps this slice's generated provenance. Preserve all main WIP; its owner must close a safe commit boundary before canonical merge can proceed.
- Pre-existing risk reported by abuse review: digest-only execution-binding storage permits two distinct valid receipts for the same single task; the baseline Board already rejects them. This slice preserves that fail-closed behavior and does not add a storage ownership/replacement policy.

## Owner acceptance — 2026-09-05

> **Substantive Change SHA256**: `sha256:a296acd3dd0fce285f11f51fb3d21641be2470ee4b628bb97e0ddaa5a825d333`

The owner explicitly approved the requested task-bound waiver. UserWaiverGrant and AcceptanceReceipt were recorded through the canonical CLI and verified as `user_waiver`; no plugin PASS was synthesized. The receipt binds target `origin/main@ca0ede71ab4888cd0ecb2dd8c20da2dabbeef154` and normalized subject `sha256:2263aae339c339eec13ee723fa527e73d84046e5d2903d1f74dbf2ba0a7bfd6a`.

The worktree integrated the already-published Operator PRs from origin/main without changing main's unrelated dirty files. Canonical prepare run `run-20260905T170006-46232-20260905-1617-refactor-multi-work-package` passed focused tests, typecheck and state boundaries on the integrated base; all six root integrity checks pass. Local publication remains gated on the other owner's dirty main boundary, including the overlapping generated manifest.

## Final integration boundary

Canonical finish was attempted through `repo-harness run contract-worktree finish --no-merge --target main --gate-base origin/main` and stopped before execution on the shared `expensive-run.lock`. The observed live holder was PID 80311 in the BRC5 worktree, running its contract's full-suite prepare-acceptance. The lock was not removed and the holder was not interrupted.

The other owners committed their main changes. The published Operator updates and those local main commits were integrated as `main@0178db813e9e01e355449a24729267437a11a333`, then merged into this worktree. Generated manifest conflicts had identical semantic state and were regenerated by the provider; no source conflict or refactor behavior change was introduced.

Final closeout uses `REPO_HARNESS_DIFF_BASE=main` and `contract-worktree finish --merge --target main`. Refresh verification and the existing owner-waiver receipt against this frozen target; the approval is already granted. Keep the earlier origin-bound receipt as historical evidence, never as proof for the new target.

The final target was advanced to `732782059b5d419533f46420771f250669c53802` to incorporate the already-published CI repair in PR #319. The empty-PATH Node deadline fixture correction was independently reproduced and verified (23 provider tests, exit 0); integration retained the upstream fixture verbatim. This was the only directly blocking out-of-scope correction, documented in `tasks/archive/review-20260905-refactor-ci-deadline-fixture.md`. Refactor source is unchanged from the reviewed implementation.
