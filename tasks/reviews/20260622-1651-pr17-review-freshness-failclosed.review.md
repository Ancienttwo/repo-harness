# Task Review: pr17-review-freshness-failclosed

> **Status**: Done
> **Plan**: plans/plan-20260622-1651-pr17-review-freshness-failclosed.md
> **Contract**: tasks/contracts/20260622-1651-pr17-review-freshness-failclosed.contract.md
> **Notes File**: tasks/notes/20260622-1651-pr17-review-freshness-failclosed.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-22
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:2afefa9f74a257c88bbf252911c6037c3b5f66c464ef99f8f752fee20058c026
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: assets/hooks/lib/workflow-state.sh, assets/hooks/prompt-guard.sh, assets/hooks/stop-orchestrator.sh, .ai/hooks/* (projection mirror), src/cli/hook/diff-fingerprint.ts, tests/*
- Actual files changed: as above (PR #17, merged as 8b65ab3)
- Commands passed: bun test (962 pass / 1 skip / 0 fail at --max-concurrency 4); bun run check:release; hosted CI (Test + MCP matrix, all green on 8fb13f5)
- External acceptance: pass (Codex via codex-review)
- Residual risks: see Residual Risks / Follow-ups
- Reviewer action required: none (merged and released 0.8.0)
- Rollback: revert merge 8b65ab3; npm deprecate repo-harness@0.8.0 if a defect is found

## Mode Evidence

- Selected route: review/release (re-review of f7b45ca NEEDS CHANGES verdict)
- P1/P2/P3 evidence: closed two reported residual P1s (rubric fail-open; fingerprint collisions) plus a third P1 (non-utf-8 symlink target) caught by Codex acceptance round 1 and fixed in 8fb13f5
- Root cause or plan evidence: tasks/notes/20260622-1651-pr17-review-freshness-failclosed.notes.md

## Verification Evidence

- Waza `/check` run: local `bun run check:release` passed (full CI gate, 962 tests / 0 fail)
- Commands run: bun test; bun run check:type; bun run check:hooks; check-deploy-sql-order / check-architecture-sync / check-task-sync / check-task-workflow --strict; npm pack; check-tarball-install-smoke
- Manual checks: CLI probes confirmed each fingerprint collision class (pathspec-magic, symlink retarget, exec-bit, non-utf-8 symlink target) flips the fingerprint after the fix
- Supporting artifacts: hosted CI run on 8fb13f5 — all checks green
- Implementation notes reviewed: yes
- Run snapshot: .ai/harness/runs/

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Codex
> **External Source**: codex-review
> **External Started**: 2026-06-22T17:20:00+0000
> **External Completed**: 2026-06-22T17:30:00+0000
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:2afefa9f74a257c88bbf252911c6037c3b5f66c464ef99f8f752fee20058c026
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none (round 1 found one P1 — non-utf-8 symlink-target fingerprint collision in src/cli/hook/diff-fingerprint.ts — fixed in 8fb13f5 and confirmed closed in round 2)
- P2 advisories: (1) verify-sprint/helper-scripts integration fixtures use Manual Override rather than a real rubric+fingerprint external pass; (2) non-utf-8 final-status coverage is via the splitNul unit test. Both non-blocking; see notes.
- Acceptance checklist: pass

## Behavior Diff Notes

- A malformed/unsupported `Review Rubric Version` now fails closed (freshness `malformed_schema`, external acceptance fail) instead of falling through the lenient legacy path.
- An absent rubric fails closed at the external-acceptance gate (enforced by every Done/finish/verify path); freshness keeps absent advisory (`legacy_missing`) and external backstops it. Manual Override or re-running /check is the escape for a genuine pre-rubric artifact.
- The implementation diff fingerprint now uses `--literal-pathspecs`, `lstat` symlink-target(hex)/exec-bit/file-type modelling with fail-closed special nodes, and `splitNul` degradation on a non-utf-8 pathname.

## Residual Risks / Follow-ups

- P2: integration fixtures use Manual Override; the real rubric+fingerprint external-pass path is covered in tests/hook-runtime.test.ts.
- P2: non-utf-8 pathname final-status is covered by the splitNul unit test (macOS/APFS cannot create non-utf-8 filenames for an integration test).
- Upgrade repos with pre-0.8.0 rubric-less `tasks/reviews/*.review.md` need a one-time /check or Manual Override.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 8/10 | 962 tests pass, full release gate + hosted CI green, three P1 fail-open classes closed and verified |
| Product depth | 7/10 | bug-fix slice hardening an existing gate; no new feature surface |
| Design quality | 8/10 | fail-closed model with external acceptance as the rubric authority; tradeoffs documented |
| Code quality | 8/10 | minimal, commented changes; projection mirror synced; no new dependency |

## Failing Items

- (none)

## Retest Steps

- Re-run: bun test; bun run check:release
- Re-check: gate behavior via tests/review-freshness.test.ts and the Done-gate cases in tests/hook-runtime.test.ts

## Summary

- Re-review of f7b45ca (PR #17) closed the two reported residual P1s and a third P1 (non-utf-8 symlink-target collision) surfaced by an independent Codex acceptance review. Merged as 8b65ab3; released repo-harness@0.8.0 (npm + tag v0.8.0 + GitHub Release).
