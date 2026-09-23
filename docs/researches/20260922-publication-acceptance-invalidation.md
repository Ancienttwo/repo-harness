# Publication acceptance invalidation

AKN-06f addresses the reproduced OB-06 contract-drift defect at the Publication readiness reader. It remains a candidate until architecture and semantic acceptance complete.

## Root cause and ownership

`collectLocal` previously trusted effective-state's acceptance projection. That projection checks the semantic implementation subject and active plan; workflow contract bytes are intentionally excluded from that subject. A contract allowed-path change altered source hashes but left review, checks and external acceptance fresh. The double-read token catches a change during one observation, but cannot invalidate an unchanged stale contract after the edit has already completed.

The existing AcceptanceVerificationObservation is the acceptance authority's record of a verified contract/goal-bound disposition. Publication now reads it by the current contract path and existing `authorityFingerprint`, checks the current goal binding, target ref/base and semantic subject, and matches its AcceptanceReceipt digest to both the current receipt bytes and the seal already bound by Publication. Missing, malformed or mismatched evidence returns missing acceptance and stale verification. Observation and receipt identity enter the existing double-read token. No GET invokes acceptance verification, records observations or reimplements reviewer/waiver policy.

The change is local to `src/effects/publication/merge-readiness.ts`; global effective-state semantics and the acceptance schema remain unchanged. Lifecycle-only Status and Last Updated normalization still belongs to `authorityFingerprint`. Contract/goal source paths must be in the worktree and cannot redirect through symlinks. The internal authority-home seam supports disposable effect fixtures and is not a browser selector. Existing incomplete evidence fails closed; there is no legacy green fallback.

## Evidence and limits

The pre-fix production-local regression seeded a disposable Git repository with canonical schema2 Task, reviewing Lease, Publication, seal and acceptance observation. Provider identity/facts are deterministic injected observations; local collection is the production reader. Each negative first asserts ready=true, then edits contract, edits goal, removes observation, corrupts observation, or replaces receipt. All five returned true before the fix and fail their expected-false assertion; the preserved pre-fix log records exit1. After the fix all five lose readiness and project into in_review. A lifecycle-only contract update remains valid. Git status before/after observation is unchanged.

Separate head/base guards prove that an otherwise green Publication becomes not-ready when either provider SHA moves. Ending execution without a reviewing Publication cannot establish readiness. The Operator DOM refresh guard consumes the existing Fleet classifier, removes the ready count, preserves the Done count and invokes no write. Done continues to require the canonical Task completion fact; the browser has no merge action. The implementation does not infer acceptance from Agent output.

The four selected suites cover158 tests; the review artifact records command/log provenance and required checks. This is local regression evidence, not a live GitHub or installed native canary. It closes the demonstrated stale acceptance projection; H0, real execution/feedback/steer and AKN-07 installed journey remain unproven. At10x load this adds bounded selected-authority reads per existing local readiness collection, not a full verifier run or provider fan-out.
