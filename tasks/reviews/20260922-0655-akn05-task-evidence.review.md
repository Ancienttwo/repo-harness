# Task Review: AKN-05b task evidence

> **Status**: Pending
> **Plan**: plans/plan-20260922-0655-akn05-task-evidence.md
> **Contract**: tasks/contracts/20260922-0655-akn05-task-evidence.contract.md
> **Notes File**: tasks/notes/20260922-0655-akn05-task-evidence.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Recommendation**: pending
> **Substantive Change SHA256**: `sha256:d5c75b72a8a3daeae8bfd6d7b49e8c2b1fb003eaeb841846ac4c3bf91b0b7486`

## Local evidence

131 tests passed,0 failures,746 assertions across the four existing UI suites. Focused additions cover original receipts/provenance, exact parent/reply lookup, empty/XSS-shaped text, wrong-context identity, both source cancellations, revision replacement/late response, historical refresh failures, bounded page replacement and actual App selection/refresh/repository cancellation with zero writes. Typecheck and production Vite build pass. Built production-bundle GET-only fixture inspected at1280x900 EN and390x844 ZH. Exact reply lookup displayed only its requested message; expanded actor records remained legible, page width equalled viewport width, body14px and all6 visible evidence controls44px. This is fixture UI evidence, not native Host evidence. All nine required repository integrity checks passed, along with final typecheck. Logs are under `.ai/harness/runs/akn05-task-evidence/`. The first task-sync refusal was the expected unbound substantive digest; the review now records its exact binding. CodeGraph proof, canonical acceptance and PR remain pending.

No independent semantic acceptance has run for this slice. Native admission and the rest of AKN-05 are not claimed. The predecessor AKN-05a remains separately pending owner acceptance.

## Overlay continuation

132 UI tests pass,0 failures,753 assertions after adding wide overlay focus, original overview retention and IME/resize draft guards. The first overlay run caught missing collaboration surface after the old overview pane was removed; the original surface is restored in the main-content disclosure and all12 regressions now pass. Final built-bundle browser inspection confirms a720px pane at1280x900 and390px full-screen pane at390x844. The initial narrow Composer grid overflow (422px input) is fixed with a bounded grid track, input width and wrapping fence; final input/fence bounds are350px with right edge370px. Chinese refresh remains a single line. A typed draft and focused textarea survive live resize; clearing through keyboard input leaves zero bytes. Close removes the dialog, restores body scrolling and focuses the original Task row. Final132-test run passes in1.57s; final typecheck and all nine required integrity checks pass (overlay-final-checks.json). Production Vite build passed. Both temporary preview drafts were cleared and the GET-only preview server/tab closed. Earlier131-test evidence belongs to9a26b5d7; no acceptance is claimed for the changed subject.

## Authorized index and deterministic projection

The owner approved this worktree local index on 2026-09-22. CodeGraph initialization succeeded at source `65cefd7d1d91a50f1c427413d60793a0dd1eef92`. Deterministic plan/apply updated only `docs/architecture/.projection-manifest.json`, with no human actions or refresh signals. Receipts are `.ai/harness/runs/approved-index-proof/{plan,apply}.json`. Canonical verification and semantic acceptance remain pending; this proof does not establish Host admission.
