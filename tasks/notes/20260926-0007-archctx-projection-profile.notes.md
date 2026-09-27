# Projection profile alignment notes

P1/P2/P3 and authorized boundaries are in the plan. ArchContext policy selects registry ownership; projection discovery is a separate consumer of explicit output targets. The existing source-exclusion branch remains unchanged because its restricted grammar does not resolve this contract mismatch.

Pre-fix regressions: producer initializer ID mismatch (0 pass/1 fail) and provider profile discovery (0 pass/3 fail). Provider failures expose required responsibilities, omitted deprecated capability targets and accepted backslash target. Immutable command transcript is in the parent session; logs are in the ArchContext task worktree `_ops/remaining-issues/issue225/pre-fix-*.log`.

Current focused checks: ArchContext model-store initializer/validation 29 pass, 120 assertions; provider/orchestration 72 pass, 389 assertions. Paired initialized-model proof, both typechecks and all required integrity checks subsequently passed. Installed-runtime/formal acceptance remains pending. No ownership registry semantics or dependencies changed.

> **Substantive Change SHA256**: `sha256:a33120c876253fa6b3ba371ceaf15e2a7e623c897813a71f1a7bbe112d883a34`

## 2026-09-26 takeover verification

The consumer source remains `d0972eced8dd426dd20c2591c168f718b7895ef9`, based on current remote main `fd6bec20a1db705e60cf8e61f129c121c6c19b0b`. With Bun 1.4.2 and `TMPDIR=$PWD/node_modules/.cache/issue225-temp`, the two existing provider/orchestration files pass 79 tests and 433 assertions. The canonical `bun src/cli/index.ts run verify-contract --contract tasks/contracts/20260926-0007-archctx-projection-profile.contract.md --strict` passes all 13 criteria (11 executable checks plus task-profile/evidence declarations). No product or test source changed during this verification.

Formal `verify-sprint --prepare-acceptance` remains blocked before acceptance freeze: the local worktree has no CodeGraph index, and the provider reports `codeGraphStatus: unavailable`, `human-action-required`, and `verified-flow-proof-changed`. Model digest is unchanged; no architecture acceptance or receipt was fabricated. Index creation is awaiting the Owner decision required by the repository instructions. The historical ArchContext ADR/root writer obstruction is now resolved in its separate candidate; consumer publication/adoption and both repositories' formal acceptance remain open.

Draft PR #454's first Governance run exposed a stale pre-rebase substantive-change digest. Refresh the binding against the actual PR base `fd6bec20`, rather than weakening task-sync. The initial local contract pass used its default diff boundary, so it did not establish this PR-base binding. Draft mode intentionally defers the full hosted test matrix and keeps Required / CI non-passing until the PR is ready.

The Owner subsequently approved the worktree-local CodeGraph index. The real index completed; the package-local runtime was aligned from the discovered 0.5.10 daemon to required 0.5.11 through `archctx daemon upgrade`. Normal automatic projection then applied only its manifest, preserving model and flow-proof digests. The next strict run passed all checks except architecture-sync, which reported the old proof-unavailable candidate and the generated manifest awaiting commit. The manifest is admitted as daemon-generated scope; proof-only reconciliation uses the candidate's exact signal, without editing operational state or accepting a semantic change.

Out-of-scope CLI observation: installed `archctx@0.5.11 daemon upgrade --help` executes the upgrade rather than displaying help. This was the supported runtime upgrade above, but the help-side-effect defect is report-only in this consumer slice.

## Approved campaign CI fixture repair

P1: campaign-closeout uses fixtureTemplate(historicalPlanningFixture); the shared adoption builder initializes the disposable Git repository, and fixtureTemplate snapshots complete repository/home bytes in place to preserve path-bound identity.
P2: hosted run 36218488592 failed two closeout cases during cpSync with ENOENT for `.git/objects/maintenance.lock`. The unmodified initialization permits each commit to start `git maintenance run --auto --quiet --detach`, confirmed by Git trace on the actual fixture. This writer can remove the lock after directory enumeration and before cpSync lstat. No closeout assertion was reached in the hosted failures.
P3: configure `maintenance.auto=false` locally immediately after Git initialization, before any commits/merges. This removes the background writer at its owner without weakening complete snapshots, ignoring filesystem errors, or changing product behavior. Disposable fixture repositories do not need automatic housekeeping. At higher concurrency the old writer/copy race becomes more likely.

Root Cause Evidence:
- root_cause: createAdoptionRepository omitted maintenance.auto=false before Git mutations; fixtureTemplate.capture copies the live .git directory while detached automatic maintenance may remove objects/maintenance.lock.
- repro: pinned Bun 1.4.0 runs `bun test tests/effects/campaign-closeout.test.ts --test-name-pattern 'campaign fixture commits stay quiescent'` on the unfixed builder.
- regression_guard: tests/effects/campaign-closeout.test.ts, real Git trace positive control explicitly enables maintenance and the default fixture commit must not launch it.
- pre_fix_failure_artifact: /tmp/campaign-maintenance-red.log (0 pass, 1 fail; trace contains detached maintenance; PRE_FIX_EXIT=1). This deterministically proves the unwanted writer, not the scheduler timing of the hosted ENOENT.

Sibling sweep: all three campaign fixtureTemplate sites (closeout, worker, authoring-resume) reach createAdoptionRepository and receive the same fix. Within the traced helpers only fixtureTemplate.capture copies live .git; restore reads its private immutable template. The other two cpSync calls copy static helper/template assets. Broader unrelated fixture builders are outside this approved slice. Historical acceptance remains evidence for its old subject; it does not certify the new test/helper diff.

Verification: pinned Bun 1.4.0, full existing campaign-closeout file passes 24 tests / 146 assertions, including both original hosted failures. The positive control was then made foreground-only with maintenance.autoDetach=false; the final guard was rerun red (temporarily removing only the two-line fixture fix: 1 fail) then green (restored fix: 1 pass). All nine root-required integrity commands pass. Logs: /tmp/campaign-maintenance-green.log, /tmp/campaign-maintenance-final-guard.log, /tmp/campaign-integrity.log. No local full-suite rerun; hosted PR CI remains the full-suite authority. New-subject formal acceptance remains pending.
