# Task Review: obsidian-companion-dependencies

> **Status**: Complete
> **Plan**: plans/plan-20260821-0021-obsidian-companion-dependencies.md
> **Contract**: tasks/contracts/20260821-0021-obsidian-companion-dependencies.contract.md
> **Notes File**: tasks/notes/20260821-0021-obsidian-companion-dependencies.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-21 02:40
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:6d714814716d4cc034d70aa99cd79b5fe25a7e1038378626a8a08472cc47f2f2
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7ce86fddbd628bbbd3948002b1c84b187624fb56

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: manifest/catalog, global install/update transaction, tooling projection, install-profile docs, focused tests, and workflow artifacts
- Actual files changed: 22 product/doc/test paths in the normalized review subject plus plan, contract, review, notes, and `tasks/todos.md`
- Commands passed: all focused Obsidian/catalog/install/tooling tests; 35 focused verifier/projection/runner tests; six non-test required checks; helper mirror and whitespace checks
- Residual risks: upstream companion revisions remain deliberately pinned; updating them requires new subtree digests and the same integrity tests
- Reviewer action required: none for implementation correctness
- Rollback: revert the branch checkpoint; no user runtime or vault was mutated by verification

## Mode Evidence

- Selected route: file-backed work-package execution in an isolated contract worktree
- P1/P2/P3 evidence: captured verbatim in the source plan from `/Users/kito/.codex/handoffs/2026-08-21-repo-harness-obsidian-dependency.md`
- Root cause or plan evidence: catalog lacked the companion dependency edges while the facade required both Skills

## Verification Evidence

- Waza `/check` run: repo-harness-check protocol applied; all required checks pass
- Commands run: focused tests, `bun test --timeout 60000`, all remaining root required checks, tooling advisory, `git diff --check`, and helper `cmp`
- Manual checks: target advance overlap was limited to `tests/cli/global-runtime-init.test.ts`; the upstream Node-authority fixture fix was preserved, the combined file passes 42/42, and Change Assessment is ready with no required oracle
- Supporting artifacts: terminal evidence summarized below; `.ai/harness/checks/latest.json` remains the canonical workflow projection surface
- Implementation notes reviewed: yes
- Run snapshot: hermetic full suite reported 2747 pass, 1 skip, 0 fail across 201 files in 1769.69 seconds

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

- Ordinary install/update keeps the third-party provider path disabled unless `--with-obsidian-skills` is supplied.
- Explicit install resolves exactly the catalog dependency closure and records both staging roots and host projections in the existing ownership manifest.
- Explicit update refreshes only receipt-owned, non-drifted staging roots and restores the prior trees on failure.
- Tooling readiness derives both companion names from `obsidian-memory.requires`; there is no independent runtime list.
- No `obsidian` executable, desktop App, npm runtime dependency, vault discovery, hook vault access, or CI vault access was added.

## Residual Risks / Follow-ups

- The user-approved closeout test-only repair inherits the existing file-level 120-second timeout; production closeout code and semantics are unchanged.
- The first canonical evidence attempt was blocked by `verification_budget`:
  the 1,200,000ms contract budget expired during the full suite. The approved
  correction keeps one fixed, non-overridable inner authority at 3,600,000ms,
  keeps the outer helper 60 seconds higher, and removes four duplicate focused
  commands already covered by `tests_pass`.
- Evidence binding correctly refused the earlier dirty/untracked contract. The
  current closeout slice authorizes a local commit before the one final retry.
- Advisory: the tooling probe reports Waza staging drift and a timed-out optional Skills CLI probe; these are environment readiness findings, not Obsidian implementation failures.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Focused acceptance behavior and the complete repository suite pass. |
| Product depth | 9/10 | Catalog, installer, update, receipt, tooling, docs, and rollback are covered. |
| Design quality | 9/10 | One dependency authority and existing transaction model are preserved. |
| Code quality | 10/10 | Red/green regression evidence, full suite, mirror check, and diff check pass. |

## Failing Items

- Canonical `verify-sprint --prepare-acceptance` run
  `run-20260821T021225-96548` is superseded as failed evidence by the approved
  fixed-budget correction; the final committed-authority retry is pending.

## Retest Steps

- Re-run: the focused catalog, install/update, tooling, and closeout-journal tests after any related manifest or transaction change.
- Re-check: after separately approving the authority/budget closeout, commit the
  contract authority and run a verifier whose total budget can contain the
  measured full-suite duration.

## Summary

- The requested Obsidian companion dependency implementation and its approved closeout test-gate repair are complete; all repository-required checks pass.
