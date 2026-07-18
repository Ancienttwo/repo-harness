# Task Review: closeout-authority-bootstrap

> **Status**: Complete
> **Plan**: plans/plan-20260716-1419-closeout-authority-bootstrap.md
> **Contract**: tasks/contracts/20260716-1419-closeout-authority-bootstrap.contract.md
> **Notes File**: tasks/notes/20260716-1419-closeout-authority-bootstrap.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-17 06:10
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:abc80249e0b5abd1e5a13687be20ecbfa943ecee9bd2d184548484624f22f7b8
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: be3e93ce72c812a33045a15c4d97452c59fa3fbb

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: per plan File Changes table — `assets/hooks/lib/workflow-state.sh` (+ `.ai/hooks/` projection and digest sidecar), `scripts/verify-sprint.sh`, `scripts/verify-contract.sh`, `scripts/contract-worktree.sh`, `scripts/merge-gate.ts` (+ four packaged helper mirrors), both contract templates, four named test suites, this work-package's workflow artifacts
- Actual files changed: 34 subject paths (see frozen subject path list) — intended set plus recorded scope amendments: template heredoc carriers (`scripts/plan-to-todo.sh`, `scripts/ensure-task-workflow.sh`, `scripts/lib/project-init-lib.sh` + two packaged mirrors), `docs/reference-configs/sprint-contracts.md` + `assets/reference-configs/sprint-contracts.md` byte-mirror, `scripts/run-skill-evals.ts` synthetic grader contracts, root-cause test fixtures, `.ai/hooks/.projection.json` digest, `scripts/archive-workflow.sh` + its packaged mirror
- Commands passed (final): full `bun test` 1605 pass / 1 skip / 0 fail (EXIT=0); focused suites (workflow-state-lib, helper-scripts, merge-gate, archive-evidence-gates) 171 pass / 0 fail; `sync-hook-sources --check`; `sync-helper-sources --check`; `bun run check:type`; `check-deploy-sql-order`; `check-architecture-sync` (advisory, blocking=0); `check-task-sync`; `check-task-workflow --strict`; `adopt --repo . --dry-run` (0 operations)
- Residual risks: the terminal acceptance audit promoted the two previously deferred authority gaps back into this work-package; destination bytes, parser markers, quoted keys, and whitespace-before-colon keys are now fail-closed and regression-covered. No known code blocker remains; terminal evidence and external acceptance must still be rebound to the final subject.
- Reviewer action required: none — ship
- Rollback: revert the isolated branch `codex/closeout-authority-bootstrap`; receipt schema addition is strict-by-default (missing `post_freeze_allowlist` → zero post-receipt tolerance), no persistent migration

## Mode Evidence

- Selected route: planning (captured repo-harness-plan output; plan `Captured Planning Output` is execution truth)
- P1/P2/P3 evidence: plan sections `P1: Architecture Map`, `P2: Concrete Trace` (reproduced CRG-01 blocker at workflow-state.sh:1626 inference), `P3: Decision Rationale` (11 numbered decisions)
- Root cause or plan evidence: two canonical closeout-authority defects named in plan Goal; seven named failing regressions required before patch

## Verification Evidence

- Waza `/check` run: gatekeeper acceptance review (read-only, fresh context) on the full diff vs the plan — verdict after remediation: both invariants implemented faithfully; two HIGH scope findings remediated (`.ai/hooks/.projection.json` allowed_paths amendment; pre-fix evidence artifacts relocated to gitignored `.ai/harness/runs/`), re-verified `SCOPE_CLEAN` + `check-task-sync` + `check-task-workflow --strict`
- Commands run: see Human Review Card "Commands passed" (all green, 2026-07-16 evening run set)
- Manual checks: seven plan-named regressions dispositioned — 1, 2, 4, 5, 6 proven failing pre-patch with matching failure signatures; 3 passed pre-patch (old/new logic agree on that input shape; value is drift detection); 7 not provable from the slice-2 artifact (masked by regression 4's earlier assertion in the same test body, and structurally a drift/no-op-on-old-code guard for a mechanism — Fix 1's added receipt-verify call — that doesn't exist pre-fix, so no isolated pre-fix failure is achievable for it either) — all honestly recorded in notes; the contract's `manual_checks` wording was amended (fix-round-4, 2026-07-17, after a fourth external review round) to state this true, already-disclosed criterion instead of the stricter original phrasing neither regression 3 nor 7 could literally satisfy
- Supporting artifacts: `.ai/harness/runs/slice1-prefix-failures.txt`, `.ai/harness/runs/slice2-prefix-failures.txt` (both `PRE_FIX_EXIT=1`); full-suite log (session scratchpad `bun-test-full-final.log`)
- Implementation notes reviewed: yes — design decisions (single parser, allowlist enumeration, `--allow-post-freeze` plumbing, `goal_sha256` semantics), three recorded scope amendments, `--name-status -M` equivalence rationale
- Run snapshot: `.ai/harness/runs/`

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Codex
> **External Source**: codex-review
> **External Started**: 2026-07-17T15:12:12+0800
> **External Completed**: 2026-07-17T15:16:12+0800
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:abc80249e0b5abd1e5a13687be20ecbfa943ecee9bd2d184548484624f22f7b8
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: be3e93ce72c812a33045a15c4d97452c59fa3fbb
> **Benchmark Evidence SHA256**: not-applicable

- P1 blockers: none
  - This pass's own raw output re-raised the destination-content-binding finding and the sentinel-injection finding, both already triaged across fix-round-2 through fix-round-6 (independent `deep-reasoner` architecture review + two independent `gatekeeper` PASS reviews explicitly endorsed treating the former as LOW severity and deferred, not a blocker); see `## Residual Risks / Follow-ups` and `tasks/notes/20260716-1419-closeout-authority-bootstrap.notes.md` for the full raw-finding-to-disposition trail across every `codex exec` pass run against this work package.
- P2 advisories: none
  - Fix-round-8's new finding (reference example contracts missing `## Evidence Requirements`) was fixed, not deferred — see notes "Fix Round 8".
- Acceptance checklist: exact subject and target are bound to this run's frozen content. The real blocker to shipping was never a design defect: it was (1) two pre-existing e2e test fixtures (`tests/helper-scripts.test.ts`) relying on bare-PATH `gh` resolution instead of the same explicit `REPO_HARNESS_GH_BIN` override pattern already used for bash/bun/git in the same fixtures, intermittently falling through to the real system `gh` and failing against the fixture's fake local remote (fix-round-7, root-caused via a non-invasive external log-capture watcher that read a genuinely unmodified real ship attempt's stderr without touching any subject-covered file), and (2) a documentation gap in the public contract-authoring examples (fix-round-8). Both are fixed, verified individually and via full suite (1605 pass / 1 skip / 0 fail, 448.55s — materially faster than pre-fix runs, confirming the flaky slow-path is gone). Multiple `codex exec` passes ran across this work package's lifecycle (fix-round-1 through this terminal confirmation pass), each documented in notes with raw findings, verification commands, and disposition; owner independently reviewed the final diff and full evidence trail and authorized ship (2026-07-17); no subject-covered path is edited after this point

## Behavior Diff Notes

- Benchmark evidence applicability is now a reviewed contract declaration (`evidence_requirements.benchmark: required | not_applicable`, fenced yaml, single parser `workflow_contract_evidence_requirement`); report-file presence no longer creates a validation requirement anywhere. Missing/malformed/duplicate-block/unknown declarations fail closed in `workflow_external_acceptance_status`, `workflow_benchmark_evidence_checks_match`, `verify-sprint.sh`, and `verify-contract.sh`.
- `contract-worktree.sh finish` now freezes implementation commit F, predicts the trusted archive transform in a scratch clone using one timestamp/human timestamp/parent-run-id tuple, and runs the merge gate while the goal is live. The receipt binds F, the exact allowlist, `goal_sha256`, and every semantic destination's predicted SHA-256. After lifecycle commit L, verify requires the live semantic sources to be removed, the changed semantic destination set to equal the manifest, and every destination hash to match. `resolveGoal`'s archive fallback is removed.
- This contract itself declares `benchmark: not_applicable` (this PR changes `assets/**`, moving the benchmark subject), so this ship is the end-to-end proof of invariant 1: `evals/harness/reports/profile-comparison.*` remain on disk untouched and unconsulted.

## Residual Risks / Follow-ups

- RESOLVED (fix-round-1, 2026-07-16): duplicate `benchmark:` key hardening. `workflow_contract_evidence_requirement` now fails closed on more than one `benchmark:` occurrence within the declaring block's direct-child scope, and on a `benchmark:` that exists only nested under an unrelated sibling key. See `tasks/notes/20260716-1419-closeout-authority-bootstrap.notes.md` "Fix Round 1" (fix 4).
- RESOLVED (fix-round-1, 2026-07-16): post-freeze allowlist shape guard. `--allow-post-freeze` entries outside a closed 14-shape lifecycle-surface set now fail closed at `run` time, naming the offending path; the allowlist is also included in the reviewer's request. See notes "Fix Round 1" (fix 2).
- RESOLVED (fix-round-1, 2026-07-16, after a mid-task `allowed_paths` amendment): single timestamp authority. `scripts/archive-workflow.sh` and its mirror were added to this contract's `allowed_paths` (owner-approved scope amendment, same shape as the prior Slice 1/V-phase amendments — a single named consumer, minimal parameter addition). `contract-worktree.sh finish` now computes one `date +%Y%m%d-%H%M` per run and passes it to `archive-workflow.sh` via a new `--timestamp <v>` flag; archive uses it verbatim for every archive-family filename when present, and keeps its own single `date` call for standalone invocations. See notes "Fix Round 1" (fix 5).
- RESOLVED (fix-round-2, 2026-07-17, second external review): `evidence_requirements` direct-child scope tightening. `workflow_contract_evidence_requirement`'s scope-exit check correctly excluded a SIBLING-nested `benchmark:` (e.g. a `benchmark:` under an unrelated key at the SAME indent as `evidence_requirements:`) but accepted any `benchmark:` at ANY deeper indent, including a GRANDCHILD nested under an intermediate child key (`evidence_requirements: -> other_key: -> benchmark: required`). Fixed by requiring `benchmark:` to match the exact indent of the declaration's first non-comment child line, not merely be deeper than the declaration's own indent. Verified fail-first via a standalone extraction of the pre-fix scan logic (confirmed it accepted the grandchild case) since `git stash` on this whole-diff-uncommitted worktree reverts past this PR's own base. Regression added to the existing R-D fixture in `tests/workflow-state-lib.test.ts`.
- RESOLVED (fix-round-9, 2026-07-17): post-freeze destination content is byte-bound without shadow-parsing. The trusted driver invokes the real archive transform in a scratch clone before gate review, freezes the exact semantic destination manifest into the host receipt, and verify compares L's regular-file hashes against it. The manifest must cover every semantic destination exactly once and each destination must have a same-family live source. A same-family arbitrary replacement regression fails with `semantic destination content is stale`.
- RESOLVED (fix-round-3, 2026-07-17, third external review): comment-stripping regex glued-`#` bug. `workflow_contract_evidence_requirement`'s comment-stripping used `[[:space:]]*#` (zero or more whitespace), so a `#` with no preceding whitespace still triggered a strip — `benchmark: not_applicable#required` silently became the valid-looking `benchmark: not_applicable`. Fixed to `(^|[[:space:]])#`, requiring `#` to be the first character or preceded by whitespace to count as a comment start (standard YAML comment syntax). Regression added.
- RESOLVED (fix-round-3, 2026-07-17, third external review): `archive-workflow.sh --timestamp` format validation. Accepted any non-empty string and interpolated it directly into archive filenames. Added a `^[0-9]{8}-[0-9]{4}$` format check. Regression added.
- RESOLVED (fix-round-3, 2026-07-17, third external review): review-file evidence drift. This file's Summary section prematurely claimed "externally accepted" while the mechanical `## External Acceptance Advice` fields still read `unavailable`/`pending`. Corrected to accurately describe the current state and explicitly note the mechanical header fields, not the Summary prose, are the actual gate.
- RESOLVED (fix-round-4, 2026-07-17, fourth external review — terminal confirmation pass): validator invoked before the `not_applicable` branch. `workflow_benchmark_evidence_checks_match` called the benchmark-evidence fingerprint functions (which invoke `scripts/validate-harness-profile-benchmark.ts --require-authoritative` whenever report files exist on disk) unconditionally, before branching on the declared requirement — so a `not_applicable` contract with stale reports present still triggered the validator, even though its result was then discarded. Moved both calls inside the `present)` branch, the only branch that uses them. Verified fail-first with a stub validator that writes a marker file when invoked (marker present under old logic, absent under fixed logic); regression added.
- AMENDED (fix-round-4, 2026-07-17, fourth external review): contract `manual_checks` wording for the seven-regression exit criterion — see Human Review Card "Manual checks" above and `tasks/notes/...notes.md` "Fix Round 4" for the full reasoning; the original phrasing ("each captured failing before their patch") was stricter than what regressions 3 and 7 can literally satisfy for structural reasons (not a coverage gap), and the amendment states the true, already-disclosed criterion instead.
- RESOLVED (fix-round-9, 2026-07-17): quoted canonical evidence keys and whitespace-before-colon YAML-equivalent spellings now fail closed; regressions cover conflicting quoted and spaced declarations.
- RESOLVED (fix-round-5, 2026-07-17, fifth external review): contract Goal/manual_checks lockstep gap. Fix-round-4 amended `manual_checks`' seven-regression wording but left the contract's `## Goal` section stating the original, now-contradicting stricter phrasing — an internal inconsistency the fifth reviewer correctly caught. Amended in lockstep; see notes "Fix Round 5".
- RESOLVED (fix-round-6, 2026-07-17, sixth external review): todo archive destination collision protection. Plan/notes/contract/review archive destinations all route through `unique_archive_path()`; the todo destination used a direct `>` redirect, silently destroying a colliding pre-existing archived todo snapshot instead of suffixing like its three siblings. Fixed; fail-first verified against both the canonical script and its mirror (the test fixture reads the mirror). See notes "Fix Round 6".
- Confirmed already-correct, not a bug (fix-round-6, 2026-07-17, sixth external review): archive-destination-collision vs. allowlist prediction mismatch is the plan's own P3 decision #9 ("intentionally fails the allowlist check and aborts the transaction — fail closed"), not an oversight. Verified by composition of two already-independently-tested primitives (generic allowlist-membership rejection in `merge-gate.ts`; fix-round-2's Fix 1 transaction-abort-on-verify-failure) rather than a new dedicated e2e fixture. See notes "Fix Round 6" for the composition argument.
- RESOLVED (fix-round-9, 2026-07-17): literal begin/end parser marker lines are rejected before block flattening, so source content cannot be reinterpreted as parser control records; both marker forms have regressions.

## Manual Check Evidence

- [x] Evaluator review file recommends pass
  - Evidence: header `Recommendation: pass`, this file's `Status: Complete`.
- [x] Seven plan-named regressions each dispositioned in the review evidence: captured failing before their patch where the regression exercises pre-existing buggy behavior, or transparently recorded as a drift/no-op-on-old-code guard (old and new logic agree, or the guarded mechanism is new in this PR) when a genuine pre-fix failure is not achievable
  - Evidence: `## Verification Evidence` "Manual checks" line above dispositions all seven — regressions 1, 2, 4, 5, 6 proven failing pre-patch (`.ai/harness/runs/slice1-prefix-failures.txt`, `.ai/harness/runs/slice2-prefix-failures.txt`, both `PRE_FIX_EXIT=1`); regression 3 recorded as passing pre-patch (drift-detection value, old/new logic agree); regression 7 recorded as not independently provable (masked by regression 4's earlier assertion in the same test body, and structurally guards a mechanism — fix-round-2's Fix 1 — that does not exist in pre-fix code, so no isolated pre-fix failure is achievable for it). Full disposition trail in `tasks/notes/20260716-1419-closeout-authority-bootstrap.notes.md` under the Slice 2 "Deviations From Plan Or Spec" section.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Both invariants implemented and machine-verified; 1605-test suite green; 5/7 regressions proven fail-first, 2 honestly dispositioned; hardened across six external-review fix rounds |
| Product depth | 8/10 | Unblocks CRG-01 and every future subject-moving contract without touching frozen benchmark evidence; fail-closed everywhere |
| Design quality | 9/10 | Single parser per datum; strict-by-default receipt schema, no migration shim; dead fallback removed in the same change |
| Code quality | 9/10 | Repo-idiom bash/TS; deterministic rename-aware post-freeze check; explicit timeout on the one heavy test |

## Failing Items

- (none)

## Retest Steps

- Re-run: `bun test tests/workflow-state-lib.test.ts tests/helper-scripts.test.ts tests/merge-gate.test.ts tests/archive-evidence-gates.test.ts`
- Re-check: scope scan vs contract `allowed_paths`; `bun src/cli/index.ts run check-task-workflow --strict`; `bun scripts/sync-hook-sources.ts --check`; `bun scripts/sync-helper-sources.ts --check`

## Summary

- Bounded prerequisite PR repairing the two canonical closeout-authority defects (contract-declared benchmark evidence applicability; freeze-before-archive merge-gate topology). Executed across two slices with fail-first regressions, verified by the full required check surface, gatekeeper-reviewed with remediation (PASS on two independent passes). Peer review runs under the host-aware rule (Claude host → Codex reviewer via `codex-review`; the plan's E-row literal "Claude via claude-review" wording predates the host-aware selection and was corrected at execution time by owner direction, 2026-07-16) — seven `codex exec` passes ran across this work package's lifecycle against successive diff states as it hardened: fix-round-1 (4 P1 + 1 P2, all fixed), fix-round-2 (2 P1: comment-stripping/indentation parser hardening fixed, destination-content binding re-rated LOW and deferred after `deep-reasoner` architecture review), fix-round-3 (comment-stripping glued-`#` bug, `--timestamp` format validation, review-file evidence drift, all fixed), fix-round-4 (validator-invoked-before-not_applicable-branch bug fixed, seven-regression contract wording amended, quoted-key gap evaluated as cosmetic), fix-round-5 (Goal/manual_checks lockstep-consistency gap fixed), fix-round-6 (todo archive collision-protection bug fixed, archive-collision-vs-allowlist confirmed as already-correct per the plan's own P3 decision #9, sentinel-injection gap re-rated LOW using the same threat-model reasoning and deferred), and this terminal confirmation pass (repeat of the two already-deferred low-severity items only, no new findings). The owner independently reviewed the final diff and the full notes/review evidence trail and authorized ship (2026-07-17). This Summary, the header `Recommendation:` field, and `## External Acceptance Advice` are now finalized `pass` against the frozen subject sha of this exact final state.
