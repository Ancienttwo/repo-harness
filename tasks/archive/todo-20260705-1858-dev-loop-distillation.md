> **Archived**: 2026-07-05 18:58
> **Related Plan**: plans/archive/plan-20260705-1419-dev-loop-distillation.md
> **Outcome**: Completed
> **Source Plan**: (none)
> **Parent Run ID**: run-20260705-1858

# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: 2026-07-05 14:19
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| file-coupled delegation Phase 2: policy `delegation.preferred_runners`/`fallback_runner`(語義=同一 contract 的 runner 可用性降級,必寫 manifest、不得靜默)+ `codex-delegation-advisor.sh` 瘦身為指向 active contract 的 nudge + 全面同步 — **[absorbed] rows 1-3 shipped (55d41fa policy fields + co-maintenance surfaces; ca76def advisor slim-down); rows 4-6 absorbed by dev-loop-distillation Phase 3 plan (plans/plan-20260705-1419-dev-loop-distillation.md, slices B5/D1/F1)** | Phase 1(`contract-run` preflight + per-contract runner metadata)已獨立可合併並驗證;policy/advisor 文案改動觸達面廣(>8 檔,policy 由 `ensure-task-workflow.sh`/`project-init-lib.sh`/`assets/templates/helpers/*`/遷移測試共維護),分階段降風險 | 目前只有 per-contract runner metadata,沒有全域 policy 預設 runner 降級;advisor 仍硬編 max_agents/max_depth | `contract-run` 的 `codex exec` file-coupled 路徑實際投用後,或要把 runner 降級提升為全域預設時 |
