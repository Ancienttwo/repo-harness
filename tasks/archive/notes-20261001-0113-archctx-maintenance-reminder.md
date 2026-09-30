> **Archived**: 2026-10-01 01:13
> **Related Plan**: plans/archive/plan-20261001-0018-archctx-maintenance-reminder.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20261001-0113
> **Archive Projection V1**: `plans/plan-20261001-0018-archctx-maintenance-reminder.md` => `plans/archive/plan-20261001-0018-archctx-maintenance-reminder.md`
> **Archive Projection V1**: `tasks/notes/20261001-0018-archctx-maintenance-reminder.notes.md` => `tasks/archive/notes-20261001-0113-archctx-maintenance-reminder.md`
> **Archive Projection V1**: `tasks/contracts/20261001-0018-archctx-maintenance-reminder.contract.md` => `tasks/archive/contract-20261001-0113-archctx-maintenance-reminder.md`
> **Archive Projection V1**: `tasks/reviews/20261001-0018-archctx-maintenance-reminder.review.md` => `tasks/archive/review-20261001-0113-archctx-maintenance-reminder.md`

# Maintenance reminder slice decisions

Static CLI capabilities and daemon lifecycle status have distinct authority.
Index freshness is checked after authorized daemon replacement; package upgrade
alone does not justify rebuilding. Upstream daemon status may recover stale
control files, as disclosed in the runbook.

The user approved architecture closure and landing. Only this worktree's missing
CodeGraph index was created. A deterministic projection manifest update allowed
proof-only reconciliation; no semantic capability/model decision was required.

Main advanced to dc77b3c6 before publication. The implementation was rebased
onto that frozen base without conflicts. Its current acceptance schema rejects
the retired codex-plugin source, so the contract uses codex-review. The old
plugin invocation was returned P1/P2 findings and is not a pass. They were reproduced
and fixed; final acceptance consumes the regression evidence.

Root cause: combining daemon readiness with package transaction success caused rollback of only the harness package, while hoisted dependencies remained newer. Distinct package and daemon steps preserve the dependency closure; strict verification remains fail-closed.
Pre-fix proof: /tmp/archctx-maintenance-pre-fix-review.log exited 1 with both new regressions failing. Focused delta: /tmp/archctx-maintenance-review-delta.log exited 0 (3 passed).
The latest main's canonical projection also refreshes a size bucket in agent-runtime-effects after the upstream adapter removal; no boundary or human prose changes were authored.
