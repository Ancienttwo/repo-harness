# Task Review: review-convergence-source-sync

> **Status**: Done
> **Plan**: plans/plan-20260719-0432-review-convergence-source-sync.md
> **Contract**: tasks/contracts/20260719-0432-review-convergence-source-sync.contract.md
> **Notes File**: tasks/notes/20260719-0432-review-convergence-source-sync.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-19 05:10
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:71a4bb3e7f49488a8e6ca0dc01b0325dd5b4f8ee2a412b6389f733c0310bf33b
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 351139fd91717a83d38d5da8a39b3ed28df93257

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: assets/skills/{claude-review,codex-review,claude-plan}/SKILL.md, src/cli/commands/init.ts, tests/cli/init.test.ts, docs/reference-configs/external-tooling.md, assets/reference-configs/{external-tooling,global-working-rules}.md
- Actual files changed: matches intended, plus workflow artifacts (plan/contract/notes/review) and tool-managed tasks/todos.md
- Commands passed: bun run check:type; bun test tests/cli/init.test.ts tests/bootstrap-files.test.ts (40/40); bun src/cli/index.ts adopt --repo . --dry-run (0 operations); cmp asset↔installed byte parity for all three skills
- Residual risks: none in the diff itself; repo-wide benchmark-evidence staleness and the broken packaged validate-harness-profile-benchmark helper are pre-existing and tracked in the notes file
- Reviewer action required: none
- Rollback: revert the merge commit range; installed host copies are independent and unaffected

## Mode Evidence

- Selected route: capture-plan → contract worktree (PlanStatusGuard enforced)
- P1/P2/P3 evidence: user-directed correction (product→source sync); plan approved 2026-07-19
- Root cause or plan evidence: plans/plan-20260719-0432-review-convergence-source-sync.md

## Verification Evidence

- Waza `/check` run: not run; orchestrator review in-session, external acceptance waived (see below)
- Commands run: bun run check:type; bun test tests/cli/init.test.ts tests/bootstrap-files.test.ts; bun src/cli/index.ts adopt --repo . --dry-run; cmp parity checks
- Manual checks: assets/skills SKILL.md files are byte-identical to the installed host copies they were synced from (cmp, all three OK)
- Supporting artifacts: tasks/notes/20260719-0432-review-convergence-source-sync.notes.md
- Implementation notes reviewed: yes
- Run snapshot: n/a

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**: 2026-07-19 04:44
> **External Completed**:
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Benchmark Evidence SHA256**: pending

- P1 blockers:
- P2 advisories:
- Acceptance checklist:
- Waiver: external acceptance gate waived by user decision on 2026-07-19 ("先跳过Codex"). codex-review was attempted and failed on an environmental precondition: Codex usage limit exhausted (reset ~Aug 16), no API-key fallback auth. Additionally the benchmark evidence binding is stale repo-wide on clean main (`benchmark subject changed at benchmark_subject_sha256`), independent of this diff. Merge performed manually with the finish sequence minus external acceptance and merge-gate receipt; all local verification green.

## Manual Check Evidence

- [x] assets/skills SKILL.md files are byte-identical to the installed host copies they were synced from
  - Evidence: cmp against ~/.codex/skills/claude-plan, ~/.codex/skills/claude-review, ~/.claude/skills/codex-review all exited 0 on 2026-07-19

## Behavior Diff Notes

- `repo-harness init` now installs `claude-plan` into `~/.codex/skills` alongside `claude-review` (host-aware, same refuse-to-overwrite semantics).
- Freshly installed `claude-review` gains the fable pin + single opus retry; `codex-review` gains the 1800s `CODEX_REVIEW_TIMEOUT_SECS` budget — both previously only present on this machine's installed copies.

## Residual Risks / Follow-ups

- Repo-wide: benchmark evidence stale on main blocks every gated finish; regenerate on the merge target (`bun run benchmark:harness`) as a separate task.
- Packaged CLI: `validate-harness-profile-benchmark` missing `./run-harness-profile-benchmark` module in the global install; repo-local script works.
- Template drift: installed `~/.codex/AGENTS.md` carries a Sufficiency and Stop Boundaries section absent from `assets/reference-configs/global-working-rules.md`; left as user-owned divergence.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Source chain restored; init installs verified by tests |
| Product depth | 8/10 | Covers skills, installer, tests, and both reference-config surfaces |
| Design quality | 8/10 | Reuses existing CROSS_REVIEW_SKILLS mechanism; no new machinery |
| Code quality | 9/10 | tsc clean; 40/40 targeted tests; byte-parity verified |

## Failing Items

- none

## Retest Steps

- Re-run: bun test tests/cli/init.test.ts tests/bootstrap-files.test.ts
- Re-check: cmp assets/skills/<skill>/SKILL.md against installed copies

## Summary

- Synced assets/skills sources up to the newer installed copies (claude-review fable pin + opus retry; codex-review 1800s budget), added the claude-plan external-brain skill as a bundled Codex-host install, wired it through init with test coverage, and updated both reference-config surfaces. External acceptance waived by user due to Codex quota outage; local verification fully green.
