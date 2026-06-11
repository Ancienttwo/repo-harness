> **Archived**: 2026-06-12 04:57
> **Related Plan**: plans/archive/plan-20260612-0435-loop-engine-03-shadow-injection.md
> **Outcome**: Completed
> **Source Plan**: (none)
> **Parent Run ID**: run-20260612-0457

# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: 2026-06-12 04:35
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| Stop vendoring `.ai/hooks` into downstream repos at init/migrate (central runtime made vendored copies inert defaults) | Central-first resolution just landed; let it soak before removing the fallback surface | Vendored copies keep working offline/pre-bundle but can confuse "I edited .ai/hooks and nothing changed" | After central runtime has run incident-free across the fleet for a few weeks, or when the next scaffold-surface change touches init/migrate |
| Sprint Slice 3: goal continuation — `run --goal` protocol (CHECKPOINT rules) + `stop-orchestrator.sh` goal-state branch (max-iterations 25, cancel, corrupt self-clear) + hook-runtime tests; falsifier: unreliable Stop injection downgrades goal to protocol-only | Stop route touches every session exit path; ships only after Slice 2 wiring exists | One-shot sprint runs stay manual until then | Slice 2 merged (central hook runtime already landed, so the goal branch ships through the central path) |
