> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260610-1746-sprint-program-layer-slice1.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: orphan-family-sweep

# Sprint Review: sprint-program-layer-slice1

> **Status**: Reviewed
> **Plan**: plans/plan-20260610-1746-sprint-program-layer-slice1.md
> **Contract**: tasks/contracts/20260610-1746-sprint-program-layer-slice1.contract.md
> **Notes File**: tasks/notes/20260610-1746-sprint-program-layer-slice1.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-10 19:05
> **Recommendation**: pass

## Mode Evidence

- Selected route: Waza `/check` default review, depth Deep (521 changed lines + 801 new LOC across 26 paths; touches the session-start hook surface).
- P1/P2/P3 evidence: P1 — additive Sprint program layer between `docs/spec.md` and `plans/`; only writer is `scripts/sprint-backlog.sh`, consumers are `check-task-workflow.sh`, `refresh-current-status.sh`, and the session-start hook. P2 — traced init -> marker -> next -> complete-task rewrite -> Execution Log append, and the check path sprint file -> extract_status -> sprint_ready_error -> report_issue. P3 — todo.md ledger semantics preserved; execution layer untouched; parity copies byte-identical (asserted by tests).
- Root cause or plan evidence: plan `## Task Breakdown` 10/10 complete; scope on target vs contract (two scope additions recorded in-contract: `assets/templates/sprint.template.md`, `.gitignore`).

## Verification Evidence

- Waza `/check` run: this session (2026-06-10), Deep review with Security + Architecture specialists and adversarial pass.
- Commands run: `bun test` -> 614 pass / 0 fail (58 files); `bash scripts/check-task-workflow.sh --strict` -> OK; `bash scripts/check-task-sync.sh` -> OK; `bash scripts/check-deploy-sql-order.sh` -> OK; `bun scripts/inspect-project-state.ts --repo . --format text` -> no drift signals; `bash scripts/migrate-project-template.sh --repo . --dry-run` -> OK.
- Manual checks: sprint-backlog lifecycle smoke (init/dup-init/status/next/complete/repeat-complete) in a temp fixture; check-task-workflow sprint branch smoke (bad Approved, Draft skeleton, unknown status, stale marker).
- Supporting artifacts: specialist findings fixed in-session — C1 sed-metachar title injection (awk index/substr render + temp-file write), C2 awk -v escape corruption of plan paths (ENVIRON), H1 xargs quote-crash of the whole check (sed trim in extract_status), M1 marker containment (sprints-dir prefix gate in helper + checker), M2 0-byte sprint poison (render-to-temp), L1 duplicate-index double-rewrite (first-match guard). Each has a regression test in `tests/sprint-backlog.test.ts`.
- Implementation notes reviewed: yes — `tasks/notes/20260610-1746-sprint-program-layer-slice1.notes.md` (decisions, deviations, tradeoffs current).
- Run snapshot: written by `verify-sprint.sh` at finish (`.ai/harness/runs/`).

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Codex
> **External Source**: codex-review
> **External Started**: 2026-06-10 19:05
> **External Completed**: 2026-06-10 19:40

- P1 blockers: none
- Resolved during acceptance (3 P1 findings raised by Codex, re-reviewed after fixes):
  1. Downstream install surface lacks the sprint helper (workflow-contract helpers/requiredFiles): resolved by scope, not code — Slice 1 is additive-by-design per the cross-model-reviewed plan; the full wiring list is the recorded Slice 2 ledger entry, and the glossary wording is version-aware ("where the sprint layer is installed").
  2. Template placeholder acceptance passed the strict gate: fixed — validator now rejects the exact placeholder sentence; regression test added.
  3. Duplicate-index backlog could flip the wrong row on slug-based completion: fixed — ambiguous refs now exit 1, the rewrite matches index AND task, and the validator rejects duplicate indices/tasks; regression tests added.
- P2 advisories: `complete-task` has no file lock, so concurrent completions can lose the earlier write — deferred to Slice 2 (serialization belongs with the finish back-fill wiring); recorded in notes and ledger context.
- External run metadata: `codex exec -s read-only`, reasoning_effort=high, run in the slice worktree.
- Acceptance checklist: backlog lifecycle round-trips; strict gate rejects non-ready Approved sprints (incl. placeholder acceptance and duplicate rows); hook stays inert without marker; parity copies identical; todo.md ledger semantics intact.

## Behavior Diff Notes

- New surfaces only: `tasks/sprints/` schema, sprint-backlog helper, sprint validation branch, Active Sprint projections. Repos without sprints see zero behavior change except one `- Sprint: (none)` line in regenerated `tasks/current.md`.
- `extract_status` in check-task-workflow now trims via sed instead of xargs: identical output for sane statuses, no longer aborts the whole check on quote characters (applies to plan statuses too — strictly more robust).
- Six stale `tasks/todo.md` execution-checklist lines in `assets/partials*/` now state deferred-ledger semantics; downstream regeneration picks them up.

## Residual Risks / Follow-ups

- Glossary ships to existing downstream repos via the wholesale reference-configs channel before the helper does; mitigated by availability wording ("where the sprint layer is installed"). Full downstream wiring is the recorded Slice 2 ledger entry (helpers allowlist, templates branch, policy heredoc, runtime entries, contract requiredFiles + snapshot tests).
- `.ai/harness/sprint/` registered in self-host `.gitignore` only; `PI_DEFAULT_RUNTIME_ENTRIES` + workflow-contract `runtimeFiles` registration belongs to Slice 2.
- Legacy "sprint = execution slice" wording remains in two partials and the contract template (locked by scaffold-parity tests); terminology partial sweep deferred to Slice 2 by design.
- `policy.sprints.statuses` has no consumer yet; status enum is duplicated in helper + checker (promotion candidate once stable).

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Lifecycle, validation, projections all verified by fixture tests + smoke |
| Product depth | 8/10 | PRD/backlog schema + two-layer glossary; facade and goal mode intentionally deferred |
| Design quality | 8/10 | Additive layering, single-active-sprint invariant, inert-by-default hook |
| Code quality | 9/10 | Injection-hardened after specialist pass; 14 focused tests incl. 6 regressions |

## Failing Items

- (none)

## Retest Steps

- Re-run: `bun test tests/sprint-backlog.test.ts && bash scripts/check-task-workflow.sh --strict`
- Re-check: `bash scripts/sprint-backlog.sh status` in a repo with an active sprint; regenerate `tasks/current.md` and confirm the Active Sprint section.

## Summary

- Slice 1 lands the Sprint program layer as a purely additive surface with hardened shell paths, strict-mode validation, projections, terminology disambiguation, and the partials drift sweep; all required checks green at 614/614 tests.
