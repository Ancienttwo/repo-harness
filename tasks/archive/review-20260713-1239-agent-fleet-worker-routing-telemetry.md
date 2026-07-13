> **Archived**: 2026-07-13 12:39
> **Related Plan**: plans/archive/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260713-1239

# Task Review: agent-fleet-worker-routing-telemetry

> **Status**: Pass
> **Plan**: plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md
> **Contract**: tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md
> **Notes File**: tasks/notes/20260712-2103-agent-fleet-worker-routing-telemetry.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-13 12:37
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:b18694325f138a581f67bf6cabd3fc83c232b508126d131ce6006de79b13bb95
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: PASS (recommend ship)
- Change type: code-change (additive telemetry) + docs closeout + capability-registry extension
- Intended files changed: `scripts/contract-run.ts`, `tests/contract-run.test.ts`, `assets/templates/helpers/contract-run.ts`, `.ai/context/capabilities.json`, `docs/architecture/modules/workflow-engine/contract-assets.md` (per contract `allowed_paths`), plus plan/contract/review/notes/todos workflow artifacts.
- Actual files changed: matches intended exactly — no out-of-scope path touched (confirmed by gatekeeper's independent `git status` pass and the fix-round's scope check).
- Commands passed: `bun test` (1118 pass / 1 skip / 0 fail), `bun run check:type` (exit 0), `bash scripts/check-architecture-sync.sh` (exit 0, advisory WARN), `bun scripts/sync-helper-sources.ts --check` (exit 0, 46 helpers), `bash scripts/check-task-sync.sh` (exit 0).
- External acceptance: pass (see below — one P1 was found and fixed within this review cycle).
- Residual risks: none blocking. `tasks/notes/*.notes.md` is still scaffold-only (optional to fill before archive).
- Reviewer action required: none.
- Rollback: `git checkout -- <file>` per path (all changes additive; no field renamed/removed); `RunnerContract`, `parseRunner`, `runChild`, and run-mode control flow untouched throughout.

## Mode Evidence

- Selected route: Waza /check-style local gate (gatekeeper) run in parallel with external cross-model review (codex-review), per this repo's dual-track review convention.
- P1/P2/P3 evidence: see External Acceptance Advice below — one P1 raised and resolved; gatekeeper separately raised two LOW findings (one mooted by the P1 fix, one a minor test-symmetry gap, also resolved in the same fix round).
- Root cause or plan evidence: plan `## Confirmed Role Mapping` / `## Design` sections; contract `## Why` / `## Goal`.

## Verification Evidence

- Waza `/check` run: not separately invoked; equivalent verification performed directly by gatekeeper + orchestrator (see commands below).
- Commands run:
  ```
  bun test                                   → 1118 pass, 1 skip, 0 fail (100 files), exit 0
  bun run check:type                         → exit 0 (tsc --noEmit clean)
  bash scripts/check-architecture-sync.sh    → exit 0 (advisory; WARN pending arch requests, all pre-existing/unrelated)
  bun scripts/sync-helper-sources.ts --check → exit 0 (projection OK: 46 helpers)
  bash scripts/check-task-sync.sh            → exit 0 (synchronized tasks/ updates)
  diff scripts/contract-run.ts assets/templates/helpers/contract-run.ts → identical
  ```
- Manual checks: orchestrator independently traced the `workerProfile` derivation logic across 6 concrete scenarios before dispatching the fix, then re-read the fixed source directly (`grep -n "workerProfile|onWorkerFallback" scripts/contract-run.ts assets/templates/helpers/contract-run.ts`) to confirm the applied fix matches byte-for-byte in both source and mirror.
- Supporting artifacts: `.ai/harness/runs/` (contract-run dry-run manifests from test fixtures).
- Implementation notes reviewed: populated design decisions, deviations, tradeoffs, and promotion filter are consistent with the accepted implementation.
- Run snapshot: n/a (no `run`-mode dispatch against a live contract for this task itself; verification was via `dry-run` fixtures in the test suite).

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-13T12:31:40+0800
> **External Completed**: 2026-07-13T12:36:25+0800
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:b18694325f138a581f67bf6cabd3fc83c232b508126d131ce6006de79b13bb95
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none
- P2 advisories: Claude identified stale closeout evidence and a non-terminal plan. The evidence issue is resolved by this Claude-bound acceptance record; `archive-workflow --outcome Completed` is the authority that terminalizes and archives the plan after the fresh gate passes.
- Acceptance checklist: pass after binding the current closeout diff to Claude review; focused contract tests, type check, architecture sync, task sync, and helper projection are green in the isolated worktree.

## Behavior Diff Notes

- `delegation_plan.role_profiles` added: `parent -> "orchestrator"` (never model-assigned), `explorer -> "explorer"` (fixed), `worker -> <derived>`, `verifier -> "gatekeeper"` (fixed).
- `worker` derivation (post-fix, final): `usedRunner === "main-thread"` -> `"sol-high"`; else `usedRunner` is `"codex-subagent"`/`"codex-exec"` -> passed through unchanged; else -> `"fast-worker"`. This is now independent of whether `usedRunner` matches the contract's declared `runner.fallback` — that comparison (`onWorkerFallback`) drives only `runner_usage.path`/`effort`, a deliberately separate "did we land on the contract's declared fallback" question.
- `runner_usage.path` (`"worker_preferred"` | `"worker_fallback"`) and `runner_usage.effort` (tier string or `null`, defaults to `"high"` only on the fallback path) added.
- `--effort` flag: closed vocabulary low/medium/high/xhigh/max, invalid value exits 2 with a clear `CliError`; record-only, matching `--runner`'s established non-enforcing philosophy.
- No existing manifest field renamed or repurposed; `RunnerContract`, `parseRunner`, `parseDelegation`, `runChild`, and run-mode control flow all unchanged.

## Residual Risks / Follow-ups

1. No implementation blocker remains. The non-obvious fallback-equality-vs-literal-dispatch decision is recorded in the populated implementation notes.
2. The primary worktree still contains pending architecture requests owned by separate harness-kernel WIP. This closeout runs in an isolated clean worktree so those requests are neither indexed nor absorbed.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | All four telemetry pieces work correctly after the fix; 8 test scenarios across preferred/fallback/pass-through/effort-override/invalid-effort/null-fallback/codex-as-fallback/codex-plain-dispatch all pass. |
| Product depth | 9/10 | Escalation/telemetry semantics are clean, record-only, and now correctly decoupled between "which model identity" vs "did we hit the declared fallback." |
| Design quality | 9/10 | Minimal additive change, reuses `RunnerContract` as-is, no renames; the post-fix `workerProfile` derivation is a clear, independent 3-way branch matching the documented spec exactly. |
| Code quality | 9/10 | Clear names, closed-vocabulary validation with exit 2, byte-identical mirror, well-commented rationale for the local `EFFORT_TIERS` literal, regression tests trace explicit before/after failure reasoning. |

## Failing Items

- None (the one P1 found mid-review was fixed and re-verified within this same cycle).

## Retest Steps

- Re-run: `bun test tests/contract-run.test.ts`
- Re-check: `bun run check:type`, `bun scripts/sync-helper-sources.ts --check`

## Summary

Additive worker-routing telemetry on `scripts/contract-run.ts`: `delegation_plan.role_profiles` resolves the four contract roles to fleet profiles, a record-only `sol-high` worker-fallback classification plus `runner_usage.path`/`effort` fields, and a validated `--effort` flag — all preserving the existing "never selects/spawns/degrades" philosophy with no `RunnerContract` field renames. Dual-track review (local gatekeeper + external Codex) caught a real P1 in the initial implementation — `workerProfile` was keyed on fallback-match status instead of the literal dispatch label, silently mislabeling any contract with `fallback: null` or a Codex label as its declared fallback. Fixed with a one-line decoupling, independently re-traced by the orchestrator, and covered by three new regression tests. Full suite 1118/1/0, type check, helper-sync, and arch-sync all clean; mirror byte-identical. PASS — recommend committing the goal-manifest paths only, in a single PR, leaving the unrelated fleet-refactor WIP from an earlier session slice untouched.
