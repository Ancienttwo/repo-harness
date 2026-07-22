# Task Review: epc-09-drift-eval-release

> **Status**: Reviewed
> **Plan**: plans/plan-20260723-0144-epc-09-drift-eval-release.md
> **Contract**: tasks/contracts/20260723-0144-epc-09-drift-eval-release.contract.md
> **Notes File**: tasks/notes/20260723-0144-epc-09-drift-eval-release.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-23 03:25
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: new drift + residue suites, checked-in retired-surfaces list, changelog entry, Program closeout research doc, sprint closeout edits (header Done + EPC-09 annotation), package plan/contract/review/notes, `tasks/todos.md` projection; the matched-run attempt record as untracked immutable runtime evidence
- Actual files changed: exactly that set — 11 tracked paths, single amended commit `9f993afd` on base `196e787a`; every EPC-01..08 module, runner/validator/manifest/fixtures, `package.json`, SSD plan, `tasks/current.md`, and the pre-EPC triplet all untouched (triplet byte-binding machine-verified)
- Commands passed: drift + residue + closeout-assertion suites 21 pass / 0 fail / 106 expects (worker + both gate rounds), full `bun test` 1848 pass / 1 skip / 0 fail (round-1 gatekeeper run; amendment diff touched docs/contract/notes only), `check:type` clean, `check-task-workflow --strict` OK, `contract-run preflight` preflight_pass, deploy-sql/task-sync/architecture-sync (advisory blocking=0) green, `inspect-project-state` no drift, `adopt --dry-run` 0 operations
- Residual risks: matched post-EPC comparison not obtained — the one protocol-clean attempt self-classified `failed_during_run` (13 passed / 2 failed / 15 terminal / 12 never ran; provider tool-exec fault + guard-blocked sandbox arm); the ruled frozen fallback branch is executed and machine-checked; a future approved benchmark package may re-attempt, contingent on the deferred `cross-capability-feature` scenario fix; contract narrative outside the amended blocks retains pre-amendment success-branch prose (amendment note governs; gatekeeper non-blocking)
- Reviewer action required: none further — round-1 gatekeeper FAIL (three MEDIUM doc/contract consistency findings) remediated per orchestrator rulings; round-2 focused re-gate verdict PASS
- Rollback: revert the single PR — removes drift/residue suites, the residue list, changelog entry, closeout doc, and sprint closeout edits; pre-EPC triplet and all EPC-01..08 runtime surfaces unaffected either way

## Mode Evidence

- Selected route: planning (captured work-package plan; Program closeout profile)
- P1/P2/P3 evidence: plan Captured Planning Output; EPC-00-amended row-13 acceptance line; VGBR-R protocol reused verbatim for the matched attempt; frozen fallback branch executed under explicit orchestrator ruling
- Root cause or plan evidence: attempt failure modes documented from the retained `run-invocation.log` (ground truth); subject immutability held (porcelain empty, HEAD unchanged, recomputed subject hash identical before and after)

## Verification Evidence

- Waza `/check` run: two gatekeeper reviews (fresh context, read-only) — round-1 FAIL on doc/contract consistency, round-2 focused re-gate PASS with attempt-record immutability double-proof (mtime + sha256)
- Commands run: see Human Review Card; executed in the contract worktree at `9f993afd`
- Manual checks: see Manual Check Evidence below
- Supporting artifacts: `.ai/harness/checks/latest.json`; `.ai/harness/runs/epc-09-post-eval/attempt-post-epc-196e787a-20260723-a01.json`; `/private/tmp/repo-harness-epc09-stage/run-invocation.log`; detached subject checkout `/private/tmp/repo-harness-epc09-subject`
- Implementation notes reviewed: yes — attempt timeline, fallback rulings, count reconciliation, exit-criteria amendment
- Run snapshot: `.ai/harness/runs/`

## Manual Check Evidence

- [x] Attempt record shows exactly one invocation, outcome failed_during_run, no forbidden flags; frozen fallback branch executed with machine-checked closeout assertions
  - Evidence: attempt record `attempt-post-epc-196e787a-20260723-a01.json` — one invocation (17:52:23Z–18:00:35Z), `outcome: failed_during_run`, `rerun_performed: false`, recomputed `command_sha256` matches the recorded command with no `--profile`/`--scenario`/`--regrade-existing`; record byte-untouched since creation (round-2 gate: mtime predates all amendments; sha256 recorded); the three closeout-assertion tests pass (relabel phrase in changelog + closeout doc + sprint; negation-window check on improvement claims; triplet byte-binding).
- [x] Pre-EPC triplet bytes untouched with byte-binding verified; no post-EPC triplet produced (ruled fallback branch)
  - Evidence: `evals/harness/reports/profile-comparison.{json,md,sha256.json}` absent from the diff; both gate rounds independently recomputed sha256 of json/md against the sidecar — exact match; no `profile-comparison-post-epc.*` file exists in the tree.
- [x] Drift + residue suites green; residue list covers the EPC-05/07/08 deletion union
  - Evidence: `bun test tests/evidence-projection-drift.test.ts tests/evidence-residue-scan.test.ts` → 21 pass / 0 fail / 106 expects (worker + both gates); `evals/harness/epc-retired-surfaces.json` enumerates all 8 retired surfaces (verify-sprint cp, workflow-state {} checks bootstrap, mutation-observed checks-file target, workflow_write_handoff assembly, codex-handoff-resume assembly, prepare-codex-handoff splice, workflow_ensure_harness_surface bootstrap, resumeAvailable string-scan) with zero unexcepted hits; residue red-first proven via injected synthetic violation.
- [x] tasks/current.md untouched
  - Evidence: `git diff 196e787a..HEAD -- tasks/current.md` is empty; `git status --porcelain` shows no entry for `tasks/current.md`.

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
- Findings: none

## Behavior Diff Notes

- Closeout package: adds the cross-package projection-drift and residue-scan suites (no runtime behavior change), the checked-in retired-surfaces list, release notes, and the Program closeout docs; designates the VGBR report "descriptive pre-EPC baseline only" with a machine-checked no-improvement-claim assertion; sprint header Done. No EPC runtime surface modified.

## Residual Risks / Follow-ups

- Future matched post-EPC re-attempt: contingent on the deferred `cross-capability-feature` scenario fix (todos lite-ceremony row); requires a new approved benchmark package.
- Release execution (version bump, downstream helper deployment, npm publish) remains a separate user decision; changelog entry sits in the unreleased section.
- Contract narrative pre-amendment prose (gatekeeper non-blocking) — for a future contract-archive pass.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Row-13 acceptance satisfied via the frozen fallback branch; drift + residue proven |
| Product depth | 9/10 | Attempt discipline held under failure; ground-truth reconciliation recorded |
| Design quality | 9/10 | Immutable evidence never rewritten; relabel lives in authority docs |
| Code quality | 9/10 | 1848 green; machine-checked closeout assertions |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/evidence-projection-drift.test.ts tests/evidence-residue-scan.test.ts`
- Re-check: triplet sha256 vs sidecar; attempt-record sha256 `a7a01132...180d`

## Summary

- EPC-09 closes the Program: cross-package projection-drift green, residue scan zero hits against the checked-in 8-surface retired list, the one matched post-EPC attempt executed protocol-clean and self-classified failed_during_run (13/2/15/12 per the retained log; subject immutable; no rerun), the frozen fallback branch executed with machine-checked assertions (pre-EPC report designated "descriptive pre-EPC baseline only"; no benchmark-improvement claim), and release notes + Program closeout merged. Round-2 gatekeeper verdict: PASS. Ready to ship as the Sprint C final PR.
