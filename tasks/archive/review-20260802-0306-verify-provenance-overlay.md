> **Archived**: 2026-08-02 03:06
> **Related Plan**: plans/archive/plan-20260801-2124-verify-provenance-overlay.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260802-0306

# Task Review: verify-provenance-overlay

> **Status**: Pending
> **Plan**: plans/plan-20260801-2124-verify-provenance-overlay.md
> **Contract**: tasks/contracts/20260801-2124-verify-provenance-overlay.contract.md
> **Notes File**: tasks/notes/20260801-2124-verify-provenance-overlay.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-02 00:20
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 5e89f6c857cf5ce6c4eed5e2da3ef5bc057d0e5b

## Human Review Card

- Verdict: pass
- Change type: bugfix
- Intended files changed: `scripts/verify-sprint.sh` and its packaged mirror `assets/templates/helpers/verify-sprint.sh`, `tests/evidence-projection-drift.test.ts`, `tasks/todos.md`, plus the plan/contract/notes/pre-fix artifacts named in the contract's Allowed Paths.
- Actual files changed: 16 paths in `git show --stat 5e89f6c8`. The fix surface is exactly the four declared paths (`scripts/verify-sprint.sh` +14/-14, the byte-identical mirror, `tests/evidence-projection-drift.test.ts` +169, `tasks/todos.md` -1 row); the remaining paths are this package's own plan/contract/notes/pre-fix artifacts plus the sibling `helper-runner-env-scrub` closeout that shipped in the same PR. Nothing outside Allowed Paths, and none of the out-of-scope files named in the contract.
- Commands passed: `bun test` full suite (2127 pass / 1 skip / 0 fail); `bun test tests/evidence-projection-drift.test.ts` (9 pass / 0 fail on `5e89f6c8`); `bun scripts/sync-helper-sources.ts --check`; `cmp scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh` (identical).
- Residual risks: the behavioral half of the regression test returns early when `jq` is absent, so on a jq-less machine only the unconditional source-binding assertion (`del(.provenance)` must appear in the shipped overlay program) guards the fix. The overlay itself already refuses to run without `jq`, so a jq-less machine cannot reach the defect.
- Reviewer action required: none; merged as PR #153 into `main` at `5e89f6c8`.
- Rollback: revert `5e89f6c8`; the finalize overlay returns to re-emitting the whole projection, restoring the content_hash inconsistency and no other behaviour change.

## Mode Evidence

- Selected route: bugfix (contract Task Profile `bugfix`, Root Cause Evidence gate satisfied with all four fields populated).
- P1/P2/P3 evidence: `plans/plan-20260801-2124-verify-provenance-overlay.md` plus `tasks/notes/20260801-2124-verify-provenance-overlay.notes.md`, which records why the fix landed at the re-ingestion boundary in `finalize_prepared_acceptance()` rather than defensively inside `buildChecksLatestProjection`.
- Root cause or plan evidence: the finalize jq overlay at `scripts/verify-sprint.sh:547-563` read the already-materialized `checks/latest.json` — run trace plus materializer-owned `provenance` — and re-emitted it whole as the next event's `run_trace`, so `contentHashOf` hashed an object strictly larger than the published consumer-facing content. Measured on `62daea2e` / `evt-01KYYJ74Z379ASFNG69S9TCY2A`: recorded `sha256:2840da08…` vs. published content hashing to `sha256:4447362b…`.

## Verification Evidence

- Waza `/check` run: gatekeeper acceptance pass on `5e89f6c8` during this closeout session.
- Commands run: `bun test` (full suite, 2127/1/0), `bun test tests/evidence-projection-drift.test.ts`, `bun scripts/sync-helper-sources.ts --check`, `cmp` of script against packaged mirror, plus the archive-round gate chain (`verify-sprint.sh --prepare-acceptance`, `acceptance-receipt.ts record`, `verify-sprint.sh`).
- Manual checks: red-before-green causality confirmed by direct re-run, not by trusting the captured log. The shipped test file was run against baseline `62daea2e` (the parent commit, unfixed overlay) and failed 2 of its script-bound assertions; the same file on `5e89f6c8` is 9 pass / 0 fail. The committed pre-fix artifact independently records 6 pass / 3 fail with `PRE_FIX_EXIT=1` — the third failure there is the live-worktree drift assertion, which is environment-dependent and returns early on a clean base, which is exactly why the direct baseline re-run reports 2 rather than 3.
- Supporting artifacts: `tasks/notes/20260801-verify-provenance-overlay.pre-fix.log`. Dogfood proof of the fix's actual claim: after a full prepare -> record -> finalize cycle on the fixed script, the published `.ai/harness/checks/latest.json` carries `provenance.content_hash` equal to the hash recomputed from its own consumer-facing bytes (`sha256:4f7057d4…`), so the projection is now verifiable against itself. The contract's Falsifier is also satisfied: the newest `verify_sprint.result` event's `run_trace` has no `provenance` key.
- Implementation notes reviewed: yes — `tasks/notes/20260801-2124-verify-provenance-overlay.notes.md`.
- Run snapshot: `.ai/harness/runs/` (gitignored runtime evidence for this closeout run).

## Manual Check Evidence

- [x] The published projection is content_hash self-consistent after a real finalize
  - Evidence: post-finalize `checks/latest.json` recorded hash equals the recomputed hash of its consumer-facing content, `sha256:4f7057d4…`; the same cycle on `62daea2e` produced the `2840da08` / `4447362b` mismatch.
- [x] Packaged helper mirror is byte-identical to its source
  - Evidence: `cmp scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh` reports no difference, and `bun scripts/sync-helper-sources.ts --check` reports the projection OK.
- [x] The materializer family is untouched
  - Evidence: `git show --stat 5e89f6c8` contains no entry for `src/effects/evidence/checks-materializer.ts`, `scripts/emit-verify-evidence.ts`, or `scripts/acceptance-receipt.ts` — the three files the contract put out of scope. The input contract was restored at the producer, not patched at the consumer.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:8a48a87d4183098e73ae4f89c74fed8f1767410bd1f5272e245d4ec977b74183
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 5e89f6c857cf5ce6c4eed5e2da3ef5bc057d0e5b
> **Verification Evidence SHA256**: sha256:fbfc974f3d81cb4a86f4492ca26c7631e745ad952c25a7b65926102bcbf572af
> **Issued At**: 2026-08-01T19:05:29.377Z

- Summary: PR #153 merged at 5e89f6c8: the verify-sprint finalize overlay strips the materializer-owned provenance block before re-emission, so checks/latest.json is provenance.content_hash self-consistent by construction. Red-before-green re-proven by direct execution -- the shipped test file fails 2 script-bound assertions on baseline 62daea2e and is 9/0 on 5e89f6c8. The dogfood finalize produced a recorded content_hash equal to the hash recomputed from the published consumer-facing bytes. Packaged mirror byte-identical by cmp, the three out-of-scope materializer-family files carry zero changes, full suite 2127/1/0. This closeout run: contract exit criteria 16/0 Fulfilled, allowed_paths clean at 2 files.
- Findings: none

## Behavior Diff Notes

- The finalize overlay deletes `.provenance` before layering the acceptance fields on, so the run trace it hands back is a run trace, not a projection.
- The materializer's own behaviour is unchanged: it still owns `provenance` and still hashes the run trace it is given. What changed is that it is no longer handed its own output as input.
- The emitted event payload also shrank by roughly 600 bytes, which is what had pushed it past the 8192-byte inline cap.

## Residual Risks / Follow-ups

- Already-emitted ledger events keep their stale hashes; the contract declared this out of scope and the next verify run rematerializes the published file. This closeout's own finalize is that rematerialization.
- The regression test binds to the shipped jq program by source offsets. If the overlay is restructured, the extraction has to be updated with it — that is the intended coupling, since a restated copy of the filter would drift and stop guarding anything.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Root cause fixed at the re-ingestion boundary; self-consistency proven on a real prepare -> record -> finalize cycle, not only in a fixture. |
| Product depth | 9/10 | Restores the projection's core promise — `checks/latest.json` can be recomputed from its own published bytes. |
| Design quality | 9/10 | One `del(.provenance)` at the boundary that violated the input contract; no second hash authority, no defensive strip inside the materializer. |
| Code quality | 8/10 | Test runs the shipped filter verbatim and ends with a causality lock that re-attaches provenance and asserts inconsistency returns; the jq-absent early return is covered by an unconditional source-binding assertion. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/evidence-projection-drift.test.ts`
- Re-check: `bun scripts/sync-helper-sources.ts --check`

## Summary

- Merged as PR #153 (`5e89f6c8`). `finalize_prepared_acceptance()` no longer feeds the materializer its own output: the overlay strips the materializer-owned `provenance` block before re-emission, so the next `checks/latest.json` is `provenance.content_hash` self-consistent by construction. Red-before-green was re-proven by direct execution against baseline `62daea2e` (2 fail) versus `5e89f6c8` (9/0), the dogfood finalize produced a recorded hash equal to the recomputed one (`sha256:4f7057d4…`), the packaged mirror is byte-identical, and the three out-of-scope materializer-family files carry zero changes. Full suite 2127 pass / 1 skip / 0 fail. Recommendation: pass, archive as Completed.
