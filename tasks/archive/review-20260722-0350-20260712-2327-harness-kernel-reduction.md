# Task Review: harness-kernel-reduction

> **Status**: Done
> **Plan**: plans/plan-20260712-2327-harness-kernel-reduction.md
> **Contract**: tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md
> **Notes File**: tasks/notes/20260712-2327-harness-kernel-reduction.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-14 03:12
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:3a851b3a846dfa756e943cc086a4f9248f57d94d99ea4517a51938d556c70000
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: existing state/routing/context/circuit/install/Skill/benchmark owners, their deterministic projections, focused tests, durable docs, and this workflow package.
- Actual files changed: the accepted implementation is present in `main`; this closeout branch adds only the six-case aggregate test timeout and its notes entry on top of current Phase 2 `main` `e3d35b75`. This task issued no push, merge, deploy, secret, or shared-main mutation; earlier integration and original worktree removal occurred externally while final verification was running.
- Commands passed: authoritative Claude 3x9 matrix 27/27; full suite 1269 pass / 1 skip / 0 fail; focused contract suites; typecheck; deploy, architecture, task-sync, inspector, adopt dry-run, state, and profile dry-runs.
- External acceptance: pass — independent native Codex review covered the full implementation and authoritative matrix. Claude's final full-scope review and exact post-rebase follow-up found no P1/P2, including for the benchmark brain-authority isolation that retains Claude authentication while pinning repo-harness mutable state to the disposable host.
- Residual risks: Adaptive Lite used fewer tokens than Strict but more elapsed provider time and hooks in this one-provider sample; benchmark workspace retention also needs deliberate cleanup after the report no longer needs regrading. Neither weakens a safety or completion gate.
- Reviewer action required: none.
- Rollback: revert the ordered work-package commits; install rollback uses owned-surface compensation and never deletes unowned host content.

## Mode Evidence

- Selected route: approved goal work-package in isolated `codex/harness-cost-baseline-slo` worktree with three bounded implementation/review roles and parent integration.
- P1/P2/P3 evidence: P1 maps the existing hook/state/install/benchmark authorities; P2 traces prompt, SessionStart, effective state, benchmark, and install paths end to end; P3 replaces duplicate/broad authority in place and preserves deterministic safety floors.
- Root cause or plan evidence: `plans/plan-20260712-2327-harness-kernel-reduction.md`, contract, notes, and `docs/researches/20260712-harness-kernel-reduction.md`.

## Verification Evidence

- Waza `/check` run: represented by independent P1/P2 review, contract-focused suites, full repository gates, and final sprint verification.
- Commands run: every contract `commands_succeed` entry; independently reviewed authoritative benchmark run ID `02b23ab9-5546-402f-8d08-73477c1b8e95`; final verifier revalidates the tracked matrix and exact report bytes.
- Manual checks: the independently reviewed report was authoritative and source-bound to clean execution commit `242e1f50` with exactly 27 passing records. The latest tracked report's `authoritative=true` provenance, provider/grader/isolation results, runner/manifest/fixture hashes, and exact JSON/Markdown bytes are bound independently of this review by sprint checks.
- Supporting artifacts: `evals/harness/reports/profile-comparison.{json,md}`, research report, checks/runs cache, and implementation notes.
- Implementation notes reviewed: yes.
- Run snapshot: the final passing `repo-harness run verify-sprint` writes the closeout snapshot and exact report-byte fingerprint.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-13T06:30:00+0800
> **External Completed**: 2026-07-14T03:12:00+0800
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:3a851b3a846dfa756e943cc086a4f9248f57d94d99ea4517a51938d556c70000
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none
- Earlier P1 findings covering unsafe lock reclaim, mandatory-context loss, incomplete transaction compensation, and stale report provenance were fixed and re-reviewed.
- P2 advisories: one accepted residual. The product helper excludes only the exact self-host report pair from task-sync; a downstream repo would have to create those repo-harness-specific paths before the narrow exclusion could apply. A general policy/second authority is not justified for that hypothetical single consumer. Earlier ownership/profile-exclusion and test-fixture findings were fixed and re-reviewed.
- Latest timeout-delta review: pass. The 30-second bound is test-only and now applies per-test only to the four process/lock cases; the five pure unit tests retain Bun's 5-second default. Production lock timeout and every guard/review/subagent/repair/consult cap remain unchanged.
- Latest task-sync delta review: pass. The exclusion names only the two generated report files, exact byte/provenance binding remains fail-closed, and regressions prove neither source changes nor sibling report files can hide behind it. Both P2 advisories were closed before this fingerprint was recorded.
- Latest main integration review: pass. Git proves native-role commit `f248e76f` is an ancestor; its SubagentStart routing files and scoped return-channel assertions are unchanged by this branch. Exact report-byte mismatch remains fail-closed in both jq and no-jq checks paths. No P1/P2.
- Latest origin integration review: pass. PR67 `4e3e76a2` is an ancestor and has no changed-file overlap with this branch; its configurable deploy-SQL policy, helpers, Skill, and tests remain byte-identical. No P1/P2.
- Latest runtime-isolation review: pass. Package-default fixtures explicitly clear the ambient self-host source override at both direct and spawned helper boundaries, while explicit source-authority and fail-closed tests remain intact. The branch rebased cleanly onto `319f80e0`; the bounded follow-up reported no P1/P2.
- Latest benchmark-prompt review: pass. The cross-capability task now conditionally follows a profile only when the environment defines one, so the bare arm implements directly while Adaptive/Strict keep their selected workflow. All arms receive identical task text and unchanged expected paths/grader; workspace and stop bounds remove only unrelated host/package archaeology. Claude's first review P2 was fixed and the exact follow-up reported no P1/P2.
- Latest final-evidence review: pass. Claude independently recomputed all profile aggregates from run `02b23ab9-5546-402f-8d08-73477c1b8e95`, matched the Markdown projection, verified 27 structured provider/grader records and all nine No Harness isolation results, and confirmed the post-review commit changes only reports and notes. No P1/P2.
- Latest scoped-source-fingerprint review: pass. The source checkout's hook CLI is selected inside both freshness command substitutions (initial evidence and external acceptance), so contract commands and hook-runtime fixtures do not inherit `HOOK_REPO_ROOT`. Downstream/package behavior is unchanged when source authority is absent; self-host/template copies match; focused tests pass. No P1/P2 after rebinding this reviewed fingerprint.
- Latest origin integration review: pass. The branch rebased cleanly onto `origin/main` `1fb93863`; the `319f80e0..origin/main` gstack-removal range has zero path intersection and no semantic dependency with the remaining branch diff. Claude verified the current wrapper, report binding, external-acceptance shape, and post-rebase focused suites; its only P1 was the stale fingerprint corrected by this binding.
- Latest benchmark authority review: pass. Claude verified that the provider keeps the real `HOME` only for authentication while the pre-existing first-precedence `REPO_HARNESS_BRAIN_ROOT` pins brain mirror writes to the disposable host. A live Adaptive Lite scenario preserved all three real brain mirror hashes, and the exact post-rebase follow-up on local `main` `4f7a675c` found no P1/P2.
- Latest aggregate-timeout review: pass. Claude verified the only current-main implementation delta is the 30-second allowance on the six serialized role-routing cases, measured the focused case at 17.85 seconds, confirmed every production bound and neighboring single-probe timeout is unchanged, and found no P1/P2 against Phase 2 `main`.
- Acceptance checklist: pass — final report `authoritative=true`, source commit matches the clean execution HEAD, 3 profiles x 9 scenarios are present, all structured provider/grader/isolation evidence and all 27 acceptance commands pass, and focused Strict/product-planning exclusions pass. The reviewer verified that explicit benchmark authorization changes only the scenario input and leaves the product Plan gate unchanged. Final re-review also verified separate report-byte binding in structured checks across jq and no-jq paths, with missing, legacy, invalid, and mismatched evidence failing closed. The original full-scope Claude command timed out; a later targeted Claude review independently passed the fixture-only checks-schema delta and confirmed `not_applicable` cannot mask reports that exist.

## Behavior Diff Notes

- Ordinary prompts bypass implicit workflow classification; explicit/active-task routing remains bounded.
- SessionStart has one global 1,500-token budget with metadata-aware dedupe, deterministic critical-field compaction, and structured fail-closed overflow.
- Install profiles transact host paths plus install/skill-lock state, probe exact host projections, and remove only transaction-owned surfaces.
- Strict installs bundled cross-review independently of optional marketplace Skills; lower profiles do not claim or install that component.
- Regenerated profile-comparison reports are operational evidence excluded from review freshness; their own provenance, hashes, graders, provider authority, and external review remain mandatory.

## Residual Risks / Follow-ups

- In the final authoritative sample, Adaptive Lite used 101,386 input+output tokens versus Strict's 113,416, but took 555,466 ms versus 474,371 ms and invoked 199 hooks versus 151. The next optimization target is hook cold path and repeated isolated-install overhead, without weakening gates.
- Authoritative reports retain disposable workspaces so hashes can be regraded. Interrupted matrices can therefore consume substantial temp space until their benchmark-owned roots are removed; the final evidence root must remain until closeout regrading is complete.
- Codex provider quota prevented a complete same-provider Codex matrix; the final report uses one live Claude provider consistently across all 27 records.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | All required outcomes and 27/27 authoritative matrix records pass. |
| Product depth | 10/10 | Productized state, routing, context, circuits, Skill discovery, install profiles, and evidence authority. |
| Design quality | 9/10 | Single owners and fail-closed boundaries; measured Lite overhead remains visible. |
| Code quality | 10/10 | Concurrency, compensation, ownership, and regression tests cover the discovered pressure points. |

## Failing Items

- None.

## Retest Steps

- Re-run: contract-focused suites, `bun test`, required root checks, and authoritative 3x9 matrix.
- Re-check: report provenance, No Harness isolation, context maximum, profile ownership/status, and review fingerprint freshness.
- Re-check: `git range-diff 941555e..178be3 0cf69cf..HEAD` and the combined Strict review/cross-model assertions after rebasing.

## Summary

- PASS. Full P0/P1/P2 kernel reduction is implemented and verified in the isolated branch; no push, merge, or deploy was performed by this closeout.
