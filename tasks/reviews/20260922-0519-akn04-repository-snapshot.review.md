# Task Review: akn04-repository-snapshot

> **Status**: Pending
> **Plan**: plans/plan-20260922-0519-akn04-repository-snapshot.md
> **Contract**: tasks/contracts/20260922-0519-akn04-repository-snapshot.contract.md
> **Notes File**: tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md
> **Substantive Change SHA256**: `sha256:0058b2181d40d3fcec22493b1d769155a0c1419d1c2186d6375c439c1808bb13`

## Development Verification

Existing server, IPC, browser and write-inventory suites: 155 pass, 2 Windows-only skip, 0 fail, 812 assertions. Scope collector cases: 3 pass, 0 fail; full collector execution had 18 pass and one existing 1s timing fixture failure under simultaneous test processes, then its owning 3-case group passed unchanged in isolation. Pre-fix overlap guard failed; post-fix guard passed. Source logs live in `.ai/harness/runs/akn04-repository-snapshot/`.

Typecheck, browser bundle (3 modules, 21.85 KB), all nine required integrity checks and git diff --check passed. These are development checks; canonical acceptance has not run.

## Acceptance Boundary

Initial acceptance was pending local CodeGraph permission. The later sections record the approved index, canonical runs and consumed P1 review. No AcceptanceReceipt exists for the corrected candidate, and no runtime installation or main merge occurred. Automation summary remains AKN-04d2; this slice alone does not complete AKN-04 or the overall product goal.

## Authorized index and deterministic projection

The owner approved this worktree local index on 2026-09-22. CodeGraph initialization succeeded at source `e6c41fdc8b2f1f3478c575a7243dd0d70df1021a`. Deterministic plan/apply updated only `docs/architecture/.projection-manifest.json`, with no human actions or refresh signals. Receipts are `.ai/harness/runs/approved-index-proof/{plan,apply}.json`. Canonical verification and semantic acceptance remain pending; this proof does not establish Host admission.

## Canonical verification after index approval

Canonical prepare-acceptance passed 20/20 criteria with zero failures, covering 16 execution checks at `d48fc95181e3e00a2e521a9ae494ccd8f8eba23f`. Subject: `sha256:96b9a2ea2dae1e5f0a7e7c356cd6fbfec2ac121a229d0ca7419ba64ad43873f5`. Evidence: `.ai/harness/runs/run-20260922T142213-88740-20260922-0519-akn04-repository-snapshot.json` and `.ai/harness/checks/latest.json`. The current deterministic architecture check passed. This is local machine verification; semantic acceptance, hosted CI and installed/native journey claims remain separate.

## Accepted upstream integration

Contexte7eb8073 and activity26778190 are accepted and integrated with upstream protected communication source and workflow archives. Source merged without textual conflicts; only generated architecture provenance and the deferred-ledger timestamp conflicted. The provider regenerated proof with no human actions or refresh signals. Canonical verification now includes the existing context/activity real-worker suites because shared server shutdown is an integration boundary. Freeze before the single policy-origin/main review.

## PR base verification binding

Repository-snapshot-only diff against accepted contexte7eb8073.

> **Substantive Change SHA256**: `sha256:12bb16359c328c8e70f607c2fc6179f56548c02b4bda25fbd28e345a4be86fa1`

## Independent review: P1, not accepted

The single Codex plugin review against policy origin/main matched canonical subject0f65ce92bc188e9459c346d4c434257a2b92bd2efa66153a88642fbc6472189c and returned needs-attention. Activity/context Node workers execute synchronous Git helpers; worker.terminate cannot interrupt a blocked execFileSync. HTTP timeout therefore leaves shared admission occupied and close waiting for the worker indefinitely. The reviewer demonstrated a two-second synchronous child delaying termination by about1.9s. No AcceptanceReceipt is recorded. Parent repair requires real blocked-Git timeout/admission/shutdown proof, then fresh canonical verification and owner acceptance; the one semantic review is consumed.

## P1 correction prepared for owner acceptance

The existing context suite now reproduces both activity/context failures with a real Git subprocess blocked on a POSIX FIFO at .git/HEAD. Before:2 failures, later reads remained503/busy and close missed its bound (before.log, PRE_FIX_EXIT=1). After:2 passes in2.52s (after.log, POST_FIX_EXIT=0). The shared private supervisor retains detached POSIX groups and Windows Job exact-handle ownership; task readers keep a separate admission pool and typed DTOs. The two thread entrypoints are removed.

Focused context/activity/server/collector verification passed68 tests and465 assertions;3 Windows-only tests were skipped locally. Existing Windows native coverage now includes an execFileSync-blocked collector, and the existing three-platform CI matrix runs actual context/activity HTTP suites. Typecheck passed. Final canonical evidence and exact hosted CI are pending; the consumed P1 review is not relabeled as pass and no second review or AcceptanceReceipt has been created.

## Corrected candidate canonical evidence

Source1283e883fa7f06a76c17e2247287812976f94051 passed25/25 criteria with zero failures in run-20260922T171741-68474. Frozen review subject: `sha256:638fbb6249adb21f69b9dc3be39ea9b4bd085dca7915081579854a7467688042`. All declared execution checks and required repository checks passed. The generated manifest restamp records that source commit. Hosted CI and exact owner acceptance remain pending; no second semantic review is permitted for this work-package.
