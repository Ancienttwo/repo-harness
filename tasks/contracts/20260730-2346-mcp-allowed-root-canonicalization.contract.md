# Task Contract: mcp-allowed-root-canonicalization

> **Status**: Partial
> **Plan**: plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-30 23:46
> **Review File**: `tasks/reviews/20260730-2346-mcp-allowed-root-canonicalization.review.md`
> **Notes File**: `tasks/notes/20260730-2346-mcp-allowed-root-canonicalization.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`sensitiveAllowedRootReason` applies the repo-relative deny glob `private/**` to absolute-path segments, and its canonicalization carve-out only recognizes `/private/var`. On macOS, `realpathSync` resolves `/tmp` to `/private/tmp`, so any legitimately configured MCP allowed root under `/tmp` is silently marked `readable: false` with no reason recorded — real users are denied, 11 MCP tests fail under shared TMPDIR, and the verify-sprint completion gate (whose helper runner pins `TMPDIR=/tmp`) blocks every work-package ship on green code.

## Goal

Platform canonicalization prefixes (`/private/var`, `/private/tmp`) are stripped once before deny-glob matching in `src/cli/mcp/policy.ts`, replacing the hardcoded `index===0 && parts[1]==='var'` special case; the new regression guard passes, the 11 shared-TMPDIR MCP failures drop to zero, genuinely sensitive user-owned paths (`private/`, `secrets/`, `node_modules/`) remain denied, and the full suite is green both in default and `TMPDIR=/tmp` environments.

## Scope

- In scope: `src/cli/mcp/policy.ts` (`partsContainDeniedRoot` + `sensitiveAllowedRootReason`); new `tests/cli/mcp-allowed-root-canonicalization.test.ts` (guard text frozen in the source plan appendix, RED-first with pre-fix artifact); one deferred-goal row in `tasks/todos.md` for the separate `helper-runner.ts:76` TMPDIR pinning decision; notes file.
- In scope (co-packaged): `scripts/ensure-task-workflow.sh` plus its `assets/templates/helpers/` mirror — bootstrap writes the resume packet after `tasks/current.md` so the `check-task-workflow.sh` freshness invariant (`resume >= current`) holds by construction instead of by whole-second mtime luck. Co-packaged because of a circular gate dependency: this contract's exit criteria bind full `bun test`, which the ordering defect fails under load; a standalone package for the ordering fix would pin `TMPDIR=/tmp` in its own gate and be blocked by the un-merged `policy.ts` fix here. The two are each other's verification precondition, so they share one verification boundary. Retires the helper-scripts full-suite flake row in `tasks/todos.md`.
- Out of scope: `src/cli/runtime/helper-runner.ts` (not the root cause; separate decision); `workspaces.ts` / `reader-tools.ts` (fix surface is policy.ts only); ROOT_DENIED reason-exposure improvement; both pending ship packages (`codex/cli-init-rename`, `codex/reference-configs-projection`).
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If stripping the canonicalization prefix lets `/private/tmp/work/private/repo`-shaped paths (a real `private` segment after the platform prefix) or user-owned `private/`/`secrets/`/`node_modules/` directories through, the fix has widened the security boundary instead of correcting a category error, and the direction is wrong. Cheapest proof point: guard test 2 (invariant, passes pre-fix) must still pass post-fix, and the 7-case table in the source plan must be all-correct.

## Root Cause Evidence

- root_cause: `src/cli/mcp/policy.ts:36` — the canonicalization carve-out only accepts `parts[0]==='private' && parts[1]==='var'`, so when `src/cli/mcp/workspaces.ts:215` `realpathSync` resolves `/tmp/...` to `/private/tmp/...`, `policy.ts:39` matches the repo-relative deny glob `private/**` against the realpath-injected segment and `workspaces.ts:224` marks the legitimate root `readable:false`, zeroing `reader-tools.ts:222` `configured_root_count`.
- repro: `TMPDIR=/tmp bun test tests/cli/mcp-reader-tools.test.ts` (3 fail; first at `tests/cli/mcp-reader-tools.test.ts:165`, Expected 1 / Received 0)
- regression_guard: tests/cli/mcp-allowed-root-canonicalization.test.ts
- pre_fix_failure_artifact: tasks/notes/20260730-mcp-allowed-root-canonicalization.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260730-2346-mcp-allowed-root-canonicalization.review.md`
- Notes file: `tasks/notes/20260730-2346-mcp-allowed-root-canonicalization.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260730-2346-mcp-allowed-root-canonicalization.contract.md
  - tasks/reviews/20260730-2346-mcp-allowed-root-canonicalization.review.md
  - tasks/notes/20260730-2346-mcp-allowed-root-canonicalization.notes.md
  - tasks/notes/20260730-mcp-allowed-root-canonicalization.pre-fix.log
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/cli/mcp/policy.ts
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - tests/
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260730-2346-mcp-allowed-root-canonicalization.notes.md
  tests_pass:
    - path: tests/cli/mcp-allowed-root-canonicalization.test.ts
    - path: tests/cli/mcp-reader-tools.test.ts
    - path: tests/cli/mcp-tools.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: `095dcb06` (main at worktree creation, branch `codex/mcp-allowed-root-canonicalization`)
- Revert strategy: single-file production change; revert the merge commit to restore the `/private/var`-only carve-out. The regression guard would then fail again by design, flagging the regression.
