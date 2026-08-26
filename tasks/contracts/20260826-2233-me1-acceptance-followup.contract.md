# Task Contract: me1-acceptance-followup

> **Status**: Active
> **Plan**: plans/plan-20260826-2233-me1-acceptance-followup.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-26 22:33
> **Review File**: `tasks/reviews/20260826-2233-me1-acceptance-followup.review.md`
> **Notes File**: `tasks/notes/20260826-2233-me1-acceptance-followup.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The ME-1 acceptance round returned FAIL on all three slices: two runtime defects ship wrong behavior today (ME-1B first-read failure throws instead of degrading; ME-1C `delivered` receipts strand permanently after binding rotation), two error-code whitelist gaps mislead machine consumers, contract-promised tests were marked delivered but never written, and ME-1C is the only slice whose closeout never ran.

## Goal

Land the user-approved ME-1 follow-up: fix the four runtime/error-code defects with regression tests, deliver the missing ME-1A/ME-1B contract-promised tests, complete the ME-1C typed AcceptanceReceipt and archive, and make the archive tooling sync review headers and rewrite internal pointers.

## Scope

- In scope:
  - `src/effects/engineers/engineering-overlay.ts` first-read degraded convergence + regression test.
  - `src/effects/engineers/module-inbox.ts` rotation supersede for `delivered` assignment receipts + receive-then-rotate regression test.
  - `src/cli/commands/sprint.ts` layered error codes per the engineer.ts whitelist pattern + error-field assertions.
  - `src/cli/mcp/engineer-tools.ts` `ModuleMessageError` whitelist entry + `module_message_invalid` test.
  - ME-1A test debt: N-way concurrency election, `engineer_offers`/`engineer_acquire` MCP protocol tests, three blocker-branch fixtures, generic-v1 effects exclusion.
  - ME-1B test debt: real Fleet isolation bytes test, single-fixture three-view semantic independence, route-inventory assertion.
  - ME-1C closeout: allowed_paths amendment, typed AcceptanceReceipt, archive of its plan/contract/review/notes.
  - Archive tooling: review header/receipt sync and internal-pointer rewrite (smallest coherent change per the todos ledger entry).
- Out of scope:
  - ME-1B binding observation producer (needs ME-3A wiring decision), ME-1A cross-repo topology narrowing, listModuleInbox removal beyond a mechanical delete, PRD text fixes beyond the two safe_auto items, any push.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

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

- Source plan: `plans/plan-20260826-2233-me1-acceptance-followup.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260826-2233-me1-acceptance-followup.review.md`
- Notes file: `tasks/notes/20260826-2233-me1-acceptance-followup.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"me1-defect-suite","kind":"deterministic_test","paths":["src/effects/engineers/engineering-overlay.ts","src/effects/engineers/module-inbox.ts","src/cli/commands/sprint.ts","src/cli/mcp/engineer-tools.ts","tests/unit/me1b-engineering-overlay.test.ts","tests/unit/me1c-module-inbox.test.ts","tests/cli/sprint.test.ts","tests/cli/mcp-engineer-tools.test.ts"]},{"id":"me1a-test-debt","kind":"deterministic_test","paths":["tests/unit/me1a-engineer-scheduling-schema.test.ts","tests/unit/me1a-engineer-scheduling.test.ts","tests/unit/me1a-engineer-scheduling-acquire.test.ts"]},{"id":"typecheck","kind":"deterministic_test","paths":["*"]},{"id":"task-sync","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260826-2233-me1-acceptance-followup.contract.md
  - tasks/reviews/20260826-2233-me1-acceptance-followup.review.md
  - tasks/notes/20260826-2233-me1-acceptance-followup.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - scripts/
  - tasks/contracts/20260825-1443-me1c-engineer-coordination-messages.contract.md
  - tasks/reviews/20260825-1443-me1c-engineer-coordination-messages.review.md
  - tasks/notes/20260825-1443-me1c-engineer-coordination-messages.notes.md
  - tasks/archive/
  - tasks/current.md
  - tasks/workstreams/
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260826-2233-me1-acceptance-followup.notes.md
  tests_pass:
    - path: tests/unit/me1b-engineering-overlay.test.ts
    - path: tests/unit/me1c-module-inbox.test.ts
    - path: tests/cli/sprint.test.ts
    - path: tests/cli/mcp-engineer-tools.test.ts
    - path: tests/unit/me1a-engineer-scheduling-acquire.test.ts
    - path: tests/unit/me1a-engineer-scheduling-schema.test.ts
    - path: tests/unit/me1a-engineer-scheduling.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-sync.sh
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
