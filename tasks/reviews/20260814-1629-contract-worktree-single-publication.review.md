# Task Review: contract-worktree-single-publication

> **Status**: Passed
> **Plan**: plans/plan-20260814-1629-contract-worktree-single-publication.md
> **Contract**: tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md
> **Notes File**: tasks/notes/20260814-1629-contract-worktree-single-publication.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-14 18:06
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:014f17ecb9c4f8ea4784b716b32b761bee32b822b0a98fabf0805a473b4d4d0b
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 6d62d3b2d0a635911037b66a3e3e8095fac74b28

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: contract-worktree merge publication, journal recovery, helper projections, focused tests, reference and architecture projections, workflow artifacts
- Actual files changed: within the contract `allowed_paths`; `git diff --check` passes
- Commands passed: focused 142-test closeout suite; `bun run check:type`; deploy SQL, architecture sync, task sync, strict workflow, state inspection, init dry-run; strict contract verification (20/20)
- Residual risks: full suite remains red on six environment-sensitive ArchContext/global-runtime bootstrap tests outside the changed paths; Claude recorded four non-blocking P3 advisories
- Reviewer action required: none; typed external acceptance is recorded against the frozen subject
- Rollback: revert the single work-package publication commit; receipt schemas and no-merge behavior are unchanged

## Mode Evidence

- Selected route: hunt / bugfix
- P1/P2/P3 evidence: helper publication boundary mapped; finish path traced from verified lifecycle HEAD through merge seal, synthesized commit, target update, and crash recovery; decision preserves source recovery authority while reducing public history to one work-package commit
- Root cause or plan evidence: contract Root Cause Evidence plus pre-fix red artifact

## Verification Evidence

- Waza `/check` run: equivalent focused and strict contract checks passed; final AcceptanceReceipt recorded as `external_pass`
- Commands run: see Human Review Card and contract verifier output
- Manual checks: target parent equals frozen base; target tree equals verified lifecycle tree; source HEAD is not target ancestor; target movement and wrong-tree injection fail closed
- Supporting artifacts: `.ai/harness/runs/contract-worktree-single-publication-pre-fix.txt`
- Implementation notes reviewed: yes
- Run snapshot: `.ai/harness/checks/latest.json`; final verification consumed the bound receipt without rerunning tests

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:014f17ecb9c4f8ea4784b716b32b761bee32b822b0a98fabf0805a473b4d4d0b
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 6d62d3b2d0a635911037b66a3e3e8095fac74b28
> **Verification Evidence SHA256**: sha256:4609ed4ad83bdc27db18c2bb2b87c9f2e5725f0e82b400d4842a6f81ab2d21da
> **Issued At**: 2026-08-14T10:11:12.787Z

- Summary: Claude final read-only review: no P0/P1; four concrete P3 advisories; VERDICT PASS. Subject hash unchanged after goal-state closeout update.
- Findings: P3: scripts/contract-worktree.sh has an unused commit_gpgsign_raw variable used only to capture config exit status.; P3: With extensions.worktreeConfig, reading commit.gpgsign from the source worktree may differ from a target-worktree-local signing policy.; P3: The empty-publication documentation names an explicit no-op or cleanup path without mapping it to concrete commands.; P3: Source-Worktree-Head audit value depends on retaining the source branch or object reachability after publication.

## Behavior Diff Notes

- `finish --merge` now publishes one synthesized target commit instead of fast-forwarding checkpoint and lifecycle topology.
- `finish --no-merge`, AcceptanceReceipt semantics, merge-seal source authority, and source branch history remain unchanged.

## Residual Risks / Follow-ups

- Claude's final read-only review returned `VERDICT: PASS`, no P0/P1, and four P3 advisories recorded in the receipt projection above.
- Six unrelated environment-sensitive full-suite cases remain red; all tests on the changed publication path pass.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Positive and negative publication paths are covered; external acceptance passed. |
| Product depth | 9/10 | Public-history rule is semantic, not line-count heuristic. |
| Design quality | 9/10 | One publication authority; source recovery topology remains intact. |
| Code quality | 9/10 | Focused suites, crash windows, projections, and strict contract checks pass. |

## Failing Items

- Full `bun test`: six ArchContext/global-runtime bootstrap cases fail outside the changed paths; no changed-path test remains failing.

## Retest Steps

- Re-run: `bun test tests/contract-worktree-single-publication.test.ts tests/contract-worktree-closeout-journal.test.ts tests/helper-scripts.test.ts`
- Re-check: `repo-harness run verify-contract --contract tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md --strict`

## Summary

- Implementation is locally verified and independently accepted against the frozen subject. The isolated branch is ready for safe publication; the dirty target checkout remains intentionally untouched.
