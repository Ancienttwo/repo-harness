# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: 2026-07-05
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| Broaden `tsconfig.json` include to `src/**/*.ts` + `tests/**/*.ts` and fix the type errors it surfaces | PR #36 broadens the include without fixing the exposed errors; merging as-is turns the `check:type` CI gate red. Errors sit in actively developed surfaces (`src/cli/mcp`, `src/cli/hook`, `src/cli/chatgpt-browser`), so the fix belongs in a dedicated slice, not a drive-by. | Narrow include keeps `check:type` green today but lets type errors accumulate silently outside the covered set (22 exposed errors on 2026-06-27 grew to 62 by 2026-07-05). | PR #36 split lands the validators dedup, or the next slice touching `src/cli/mcp` / `src/cli/hook` / `src/cli/chatgpt-browser`. |
