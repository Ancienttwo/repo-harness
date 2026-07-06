> **Archived**: 2026-07-06 16:56
> **Related Plan**: plans/archive/plan-20260706-1646-setup-adopt-refresh-check.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260706-1656

# Implementation Notes: setup-adopt-refresh-check

> **Status**: Active
> **Plan**: plans/plan-20260706-1646-setup-adopt-refresh-check.md
> **Contract**: tasks/contracts/20260706-1646-setup-adopt-refresh-check.contract.md
> **Review**: tasks/reviews/20260706-1646-setup-adopt-refresh-check.review.md
> **Last Updated**: 2026-07-06 16:46
> **Lifecycle**: notes

## Design Decisions

- `repo.adopt-refresh` lives in `runInitHook()` beside existing status-derived
  setup checks so `repo-harness setup check --check-updates --json` remains the
  single Agent readiness surface.
- The check uses `runStatus()`'s repo opt-in marker before reading the adoption
  planner. Non-adopted repos stay `na` so ordinary git repos are not nudged into
  repo-harness adoption by a user-level setup audit.
- The source of truth is `planAdoption({ mode: "standard", apply: false })`.
  `summary.plannedTotal === 0` is treated as up-to-date; a positive count emits
  an Agent action but does not execute `adopt`.
- The emitted command shell-quotes the repo path because `agent_actions.command`
  is a copyable shell command.

## Deviations From Plan Or Spec

- Added `assets/reference-configs/external-tooling.md` to allowed paths because
  tests require it to remain byte-identical to
  `docs/reference-configs/external-tooling.md`.
- Did not update localized READMEs other than `README.zh-CN.md`; the other
  localized files do not currently carry the setup-check paragraph being
  changed.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Report adopt refresh for every git repo | Rejected | This would turn setup check into initial-adoption prompting for unrelated repos. |
| Report only for repos with `.ai/harness/workflow-contract.json` | Accepted | Matches the current `runStatus()` opt-in authority and the user's refresh wording. |
| Execute `repo-harness adopt --dry-run --json` as a subprocess | Rejected | Direct planner access is faster, typed, and avoids command recursion. |
| Reuse adoption planner directly | Accepted | Keeps dry-run summary as authority without changing planner semantics. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused tests: `bun test tests/cli/init-hook.test.ts tests/cli/adoption-plan.test.ts tests/readme-dx.test.ts`
- Typecheck: `bun run check:type`
- Real CLI readback:
  `bun src/cli/index.ts setup check --target codex --check-updates --json`
  emitted `repo.adopt-refresh` with `status=needs_agent` and command
  `repo-harness adopt --repo '/Users/kito/Projects/repo-harness-wt-setup-adopt-refresh-check'`.
  The command's overall exit was 1 because this isolated worktree has no
  CodeGraph index, producing unrelated `doctor.codegraph-index` failure.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
