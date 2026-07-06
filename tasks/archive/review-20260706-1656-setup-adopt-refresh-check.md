> **Archived**: 2026-07-06 16:56
> **Related Plan**: plans/archive/plan-20260706-1646-setup-adopt-refresh-check.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260706-1656

# Task Review: setup-adopt-refresh-check

> **Status**: Pending
> **Plan**: plans/plan-20260706-1646-setup-adopt-refresh-check.md
> **Contract**: tasks/contracts/20260706-1646-setup-adopt-refresh-check.contract.md
> **Notes File**: tasks/notes/20260706-1646-setup-adopt-refresh-check.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-06 16:46
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: b738df780c8fbc5dbc56a1cfc59b6e68ca4050325e5719e0e41aad768ea409ec
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `src/cli/commands/init-hook.ts`, `tests/cli/init-hook.test.ts`, setup-check docs, plan/contract/notes/review artifacts
- Actual files changed: intended files plus `assets/reference-configs/external-tooling.md` mirror and `tasks/todos.md` timestamp from plan projection
- Commands passed: `bun test tests/cli/init-hook.test.ts tests/cli/adoption-plan.test.ts tests/readme-dx.test.ts`; `bun run check:type`; `cmp -s docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md`
- External acceptance: manual_override
- Residual risks: real setup-check command exits 1 in this isolated worktree because CodeGraph is not indexed; `repo.adopt-refresh` itself is present and correct in the JSON readback
- Reviewer action required: none
- Rollback: revert this branch or remove the `adoptionRefreshCheck()` integration and tests

## Mode Evidence

- Selected route: implementation
- P1/P2/P3 evidence: setup check aggregates `status`, `doctor`, and tooling report checks; adoption refresh uses status repo opt-in plus adoption planner summary; decision preserves read-only setup check and keeps execution on `repo-harness adopt`
- Root cause or plan evidence: captured plan `plans/plan-20260706-1646-setup-adopt-refresh-check.md`

## Verification Evidence

- Waza `/check` run: parent review recorded here
- Commands run:
  - `bun test tests/cli/init-hook.test.ts tests/cli/adoption-plan.test.ts tests/readme-dx.test.ts`
  - `bun run check:type`
  - `cmp -s docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md`
  - `bun src/cli/index.ts setup check --target codex --check-updates --json`
- Manual checks: inspected JSON readback for `repo.adopt-refresh` check and Agent action
- Supporting artifacts: `/tmp/repo-harness-setup-check-adopt.json`
- Implementation notes reviewed: `tasks/notes/20260706-1646-setup-adopt-refresh-check.notes.md`
- Run snapshot: not created

## External Acceptance Advice

> **External Acceptance**: manual_override
> **External Reviewer**: parent
> **External Source**: local focused tests plus real CLI JSON readback
> **External Started**: 2026-07-06 16:46
> **External Completed**: 2026-07-06 17:05

- P1 blockers: none
- P2 advisories: isolated worktree lacks CodeGraph index; this affects overall setup-check exit code but not the new check's JSON surface
- Acceptance checklist: focused tests pass, typecheck passes, mirror parity passes, CLI readback shows `repo.adopt-refresh`
- Manual Override: peer reviewer was not run for this narrow setup-check slice; the acceptance surface is covered by focused tests, typecheck, docs parity, and direct JSON readback.

## Behavior Diff Notes

- `setup check --check-updates` now emits `repo.adopt-refresh`.
- Non-adopted repos produce `na`, not an Agent action.
- Adopted repos with no planned adoption operations produce `ok`.
- Adopted repos with planned operations produce `needs_agent` and a quoted
  `repo-harness adopt --repo '<path>'` command.

## Residual Risks / Follow-ups

- The worktree itself needs CodeGraph index initialization if full setup-check
  green status is required there; that is unrelated to this change and was not
  performed.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Covers disabled, needed, no-op, and non-adopted states. |
| Product depth | 8/10 | Uses existing setup-check and adoption planner surfaces without new commands. |
| Design quality | 8/10 | Keeps status/action output consistent with existing CLI update advisory. |
| Code quality | 9/10 | Small direct helper, typed planner integration, focused tests. |

## Failing Items

- None for this slice.

## Retest Steps

- Re-run: `bun test tests/cli/init-hook.test.ts tests/cli/adoption-plan.test.ts tests/readme-dx.test.ts`
- Re-check: `bun run check:type`

## Summary

- Pass. The feature is implemented as a read-only setup-check advisory and does
  not execute adoption changes.
