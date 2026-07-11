> **Archived**: 2026-07-12 05:46
> **Related Plan**: plans/archive/plan-20260711-2105-adoption-apply-cutover-v1.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260712-0546

# Task Review: adoption-apply-cutover-v1

> **Status**: Completed
> **Plan**: plans/plan-20260711-2105-adoption-apply-cutover-v1.md
> **Contract**: tasks/contracts/20260711-2105-adoption-apply-cutover-v1.contract.md
> **Notes File**: tasks/notes/20260711-2105-adoption-apply-cutover-v1.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-12 03:54
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:b30f4326617455e99a13298148cb4792fe1dac10f3eccd399efd564c32fa6ddb
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: TypeScript adoption planner/executor/CLI cutover, deletion of shell migration helpers, contract/assets/docs/tests, and workflow closeout artifacts.
- Actual files changed: 69 files, approximately +958 / -5001 before commit; all changes are within the approved contract paths.
- Commands passed: `bun test --max-concurrency 4` (1100 pass / 1 skipped / 0 fail); `bun run check:type`; hook/helper projections; deploy, architecture, task-sync, strict workflow, inspection, adoption dry-run, tarball install smoke, and `git diff --check`.
- External acceptance: manual_override — two independent deep reviewer passes (security and architecture) found no remaining blockers after regression fixes; no Claude reviewer runtime is configured in this execution.
- Residual risks: self-host apply, reclaim/compact, and interactive user-level bootstrap intentionally fail closed until each has a deterministic, transaction-backed ownership model.
- Reviewer action required: none
- Rollback: revert the cutover commit; downstream transactions use `repo-harness adopt rollback --transaction <manifest>`.

## Mode Evidence

- Selected route: `$think` work-package execution followed by `$check` deep review.
- P1/P2/P3 evidence: public `adopt`/`runInit` entrypoints, canonical assets, transaction executor, package contents, and downstream fixture paths were traced; the decision preserves one repo-local mutation authority and rejects ambiguous ownership before writes.
- Root cause or plan evidence: `plans/plan-20260711-2105-adoption-apply-cutover-v1.md` identifies the prior split between the shell migrator and opt-in TypeScript executor.

## Verification Evidence

- Waza `/check` run: Deep review with security and architecture specialists; initial destructive-sink and ownership findings were fixed and both re-reviews returned 0 blockers.
- Commands run: Full suite; typecheck; `check:hooks`; `check:helpers`; deploy SQL; architecture/task/workflow checks; project inspection; adoption dry-run; tarball smoke; review fingerprint; and diff whitespace check.
- Manual checks: standard/minimal transaction behavior, self-host fail-closed, stale plan preconditions, symlink safety, archive collision safety, private-file mode preservation, Git-index rollback, and public CLI rejection boundaries are covered by regression tests.
- Supporting artifacts: transaction manifests from adoption tests; `/tmp/repo-harness-b2-bun-test-bounded.log` for the CI-equivalent full-suite output.
- Implementation notes reviewed: yes
- Run snapshot: `.ai/harness/checks/latest.json` is refreshed by sprint verification.

## External Acceptance Advice

> **External Acceptance**: manual_override
> **External Reviewer**: Codex security and architecture reviewers
> **External Source**: local deep-review subagents
> **External Started**: 2026-07-12T03:10:00+0800
> **External Completed**: 2026-07-12T03:54:00+0800
> **Reviewed Diff Fingerprint**: sha256:b30f4326617455e99a13298148cb4792fe1dac10f3eccd399efd564c32fa6ddb
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none
- P2 advisories: none
- Acceptance checklist: canonical TS apply is the only public mutation route; shell and experimental surfaces are absent; ambiguous user-owned inputs fail closed; package tarball starts and dry-runs the CLI.
- Manual Override: User explicitly requested acceptance, commit, push, and PR merge; no independent Claude reviewer runtime is available, while two scoped deep reviews and the full suite provide recorded evidence.

## Behavior Diff Notes

- Standard and minimal use `planAdoption()` plus `applyAdoptionPlan()`; `runInit()` consumes the same repo-local apply report and keeps registry, CodeGraph, handoff, and strict workflow work explicit.
- `_ops/`, custom hooks, and repo-local adapter configuration are preserved; byte-identical assets are the only generated-cleanup authority.
- Transaction manifests and rollback guard file content, paths, symlinks, private modes, and Git index recovery. Reclaim, compact, interactive, and self-host branches fail before writes where their authority is not deterministic.

## Residual Risks / Follow-ups

- No active merge blocker. The known residual is intentionally rejected functionality rather than a hidden fallback: self-host and reclaim/compact require a future transaction-backed plan.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Standard/minimal transaction and rollback paths are covered end to end; unsupported branches fail closed. |
| Product depth | 8/10 | Public docs, assets, package, CLI, and workflow projections converge on one route. |
| Design quality | 9/10 | One planner/executor authority with explicit post-apply effects and ownership boundaries. |
| Code quality | 9/10 | Deep safety review findings have targeted regressions and full-suite evidence. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test --max-concurrency 4` and `bash scripts/check-tarball-install-smoke.sh`.
- Re-check: `repo-harness run verify-contract --contract tasks/contracts/20260711-2105-adoption-apply-cutover-v1.contract.md --strict` followed by `repo-harness run verify-sprint`.

## Summary

- Pass. The reviewed diff removes the shell/experimental adoption split, preserves user-owned surfaces, and provides deterministic transaction evidence for supported mutations.
