> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260610-2053-sprint-program-layer-slice2.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: orphan-family-sweep

# Sprint Review: sprint-program-layer-slice2

> **Status**: Reviewed
> **Plan**: plans/plan-20260610-2053-sprint-program-layer-slice2.md
> **Contract**: tasks/contracts/20260610-2053-sprint-program-layer-slice2.contract.md
> **Notes File**: tasks/notes/20260610-2053-sprint-program-layer-slice2.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-11 00:52
> **Recommendation**: pass

## Mode Evidence

- Selected route: Waza `/check` default review, depth Deep (26 changed paths, +1542/-151 before this review-file refresh; touches the finish merge chain and the init-lib distribution surface).
- P1/P2/P3 evidence: P1 — slice wires the Slice 1 schema into capture (start-task -> capture-plan --source repo-harness-sprint), finish (warn-only back-fill via Source Ref), the public command surface (repo-harness-sprint facade + manifest/docs/evals/tests), and downstream distribution (workflow-contract, init-lib helpers/templates/policy/runtime entries). P2 — traced start-task -> plan with Source Ref -> plan-to-todo/worktree -> finish -> backfill complete-task --sprint -> row flip merged atomically. P3 — primary-tree purity invariant: contract-mode rows never write the primary sprint file pre-merge (review fix D1); inline rows fill immediately because they execute in the primary tree.
- Root cause or plan evidence: plan `## Task Breakdown` 9/9 complete; one recorded deviation (no PI_TEMPLATE_SPRINT heredoc; copy-when-present + helper self-heal instead).

## Verification Evidence

- Waza `/check` run: this session (2026-06-11), Deep review with security/shell, workflow-finish, distribution-parity, and adversarial checks grounded in the current worktree diff.
- Commands run: `bash -n scripts/sprint-backlog.sh` -> OK; `bash -n assets/templates/helpers/sprint-backlog.sh` -> OK; `bun test tests/sprint-backlog.test.ts` -> 20 pass / 0 fail / 143 expect; `bun test` -> 632 pass / 0 fail / 6107 expect (59 files); `bash scripts/check-task-workflow.sh --strict` -> OK; `bash scripts/check-task-sync.sh` -> OK; `bash scripts/check-deploy-sql-order.sh` -> OK; `bash scripts/migrate-project-template.sh --repo . --dry-run` -> OK; `bun scripts/inspect-project-state.ts --repo . --format text` -> no drift signals; `HOOK_HOST=claude bash scripts/verify-sprint.sh` -> pass, `.ai/harness/checks/latest.json` external_acceptance=pass.
- Manual checks: start-task end-to-end smoke (plan capture with correct Source Ref/Planning Source, Draft gate, inline vs contract cell behavior); duplicate start-task guard with runtime in-flight markers; complete-task --sprint override without marker; `--sprint` symlink escape rejection; stale-lock reclaim and non-empty-lock timeout.
- Supporting artifacts: specialist findings fixed in-session — D1 HIGH (contract-mode primary-tree write breaking ff merge; e2e-reproduced), B1 MEDIUM (stale-lock hot loop), B2 MEDIUM (lock held across capture-plan), C1 (Source Ref '#' split direction), C2 (archive -vN rename silently skipping back-fill), A4 (silent no-op row rewrites now fail loudly). Each fix has a regression test or explicit smoke evidence; see notes "Review-Driven Fixes".
- Implementation notes reviewed: yes — decisions, two plan deviations, and review fixes recorded.
- Run snapshot: written by `verify-sprint.sh` at finish (`.ai/harness/runs/`).

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Codex
> **External Source**: codex-review
> **External Started**: 2026-06-10 23:00
> **External Completed**: 2026-06-11 00:52

- P1 blockers: none
- P2 advisories: none
- Acceptance checklist: start-task captures Approved sprint-task plans with Source Ref; contract rows leave the primary tree untouched; finish back-fill is warn-only and atomic with the merge; lock serializes mutations without deadlock; downstream distribution lists complete (contract/init-lib/templates/runtime entries); facade matches the real CLI.

## Behavior Diff Notes

- New public command `repo-harness-sprint` (manifest class sprint-orchestration, mutating); registered across root SKILL.md, README, flow docs (+ brain mirror), evals, and both test inventories.
- `pi_install_helpers` fallback list realigned with the contract list (five pre-existing omissions fixed) while adding sprint-backlog.sh; scaffold snapshot updated accordingly.
- `contract-worktree.sh finish` gains one warn-only step between archive and commit; non-sprint plans are unaffected (Source Ref absent -> immediate return).
- Repos without sprints see zero behavior change.

## Residual Risks / Follow-ups

- B3 double-reclaim race remains theoretical (rmdir-success-gated now); acceptable for the one-task-at-a-time queue contract stated in the facade.
- Goal mode (Slice 3) remains the recorded ledger entry.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | start-task/back-fill/lock verified by 20 focused tests + e2e smokes |
| Product depth | 8/10 | Full plan->run->track loop; goal mode intentionally deferred |
| Design quality | 9/10 | Primary-tree purity invariant; warn-only fail-safety; single-fallback templates |
| Code quality | 9/10 | Specialist HIGH/MEDIUM findings fixed with loud-failure semantics |

## Failing Items

- (none)

## Retest Steps

- Re-run: `bun test tests/sprint-backlog.test.ts && bash scripts/check-task-workflow.sh --strict`
- Re-check: start-task smoke in a fixture sprint (contract row leaves Plan cell pending; inline row fills it).

## Summary

- Slice 2 wires the Sprint program layer into plan capture, finish back-fill, the public command surface, and downstream distribution, with review-driven hardening of merge-purity, in-flight duplication, path containment, and locking semantics; 632/632 tests and all required checks green.
