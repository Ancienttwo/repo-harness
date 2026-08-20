> **Archived**: 2026-08-21 04:26
> **Related Plan**: plans/archive/plan-20260821-0303-bun-14-upgrade-take2.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260821-0426

# Task Contract: bun-14-upgrade-take2

> **Status**: Fulfilled
> **Plan**: plans/plan-20260821-0303-bun-14-upgrade-take2.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-21 03:03
> **Review File**: `tasks/reviews/20260821-0303-bun-14-upgrade-take2.review.md`
> **Notes File**: `tasks/notes/20260821-0303-bun-14-upgrade-take2.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

First Bun-1.4 landing (`b6dee923`) was reverted (`ead6b216`) after Linux CI exposed an unhandled EPIPE in the hook executor's stdin write — macOS full suite was blind to it. If skipped, the toolchain stays on 1.3.14 and the machine-local bun (already 1.4.0) diverges from CI. If the EPIPE fix ships wrong (over-broad swallowing), genuine hook stream failures go silent; the fix is therefore scoped to `code === 'EPIPE'` on the child-stdin path only.

## Goal

Execute the plan's `## Task Breakdown` (5 slices) exactly; frozen decisions 1-6 in `plans/plan-20260821-0303-bun-14-upgrade-take2.md` are authoritative. Outcome: hook executor tolerates exactly EPIPE on the optional stdin context offer (other errors still propagate; exit code stays authoritative), benchmark drift test injects drift explicitly, CI pins move to 1.4.0, deps refreshed within ranges, closure pins unmoved, and Linux verification passes BEFORE any main merge.

## Scope

- In scope: the hook executor module under test in `tests/skill-hooks.test.ts` — resolved to `scripts/run-skill-hook.ts` (`executeHookScript`; allowed_paths widened 2026-08-21 after the executor's location was found outside `src/`), EPIPE scope only, `tests/skill-hooks.test.ts` (new regression test), `tests/harness-benchmark-matrix.test.ts` (drift carrier), `.github/workflows/ci.yml` (bun-version x2), `package.json`/`bun.lock` (bun update within ranges), `tasks/lessons.md` (two entries).
- Out of scope: any other hook semantics, `src/cli/hook/stop-handler.ts` (parallel work-package owns it), dependency majors, engines floor, branch protection, `scripts/check-ci.sh`, shell scripts, policy keys, downstream templates.
- Taste constraints: EPIPE handling is a narrow error-code filter at the write site, not a try/catch blanket; comment states the hook-contract rationale (stdin offer is optional).

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260821-0303-bun-14-upgrade-take2.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260821-0303-bun-14-upgrade-take2.review.md`
- Notes file: `tasks/notes/20260821-0303-bun-14-upgrade-take2.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"skill-hooks-suite","kind":"deterministic_test","paths":["*"]},{"id":"full-suite-macos","kind":"deterministic_test","paths":["*"]},{"id":"linux-run","kind":"runtime_readback","paths":["*"]},{"id":"gatekeeper-acceptance","kind":"manual_acceptance","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/lessons.md
  - scripts/run-skill-hook.ts
  - tasks/contracts/20260821-0303-bun-14-upgrade-take2.contract.md
  - tasks/reviews/20260821-0303-bun-14-upgrade-take2.review.md
  - tasks/notes/20260821-0303-bun-14-upgrade-take2.notes.md
  - src/
  - tests/
  - .github/workflows/ci.yml
  - package.json
  - bun.lock
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - .github/workflows/ci.yml
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260821-0303-bun-14-upgrade-take2.notes.md
  tests_pass:
    - path: tests/skill-hooks.test.ts
    - path: tests/harness-benchmark-matrix.test.ts
  commands_succeed:
    - bun run check:type
    - bash -c 'grep -c "bun-version: 1.4" .github/workflows/ci.yml | grep -q 2'
```

## Acceptance Notes (Human Review)

- Functional behavior: hook success with stdin-ignoring scripts; EPIPE swallowed only on stdin path; upgrade re-landed.
- Edge cases: script closes stdin immediately; non-EPIPE stream error still fails; Linux-only behavior divergence.
- Regression risks: over-broad error swallowing hiding real hook failures; closure pins moving; macOS-green/Linux-red blind spot (hard Linux gate).

## Rollback Point

- Commit / checkpoint: worktree base (fork from main at ead6b216 or later)
- Revert strategy: single revert restores strict EPIPE propagation and 1.3.14 pins; ead6b216 is the working template.
