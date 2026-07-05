# Task Contract: fix-empty-label-treated-as-non-empty

> **Status**: Verified
> **Plan**: (none — golden reference example, not an active plan)
> **Task Profile**: bugfix
> **Owner**: example-owner
> **Capability ID**: root
> **Last Updated**: 2026-07-05 21:00
> **Review File**: `tasks/reviews/example-fix-empty-label.review.md`
> **Notes File**: `tasks/notes/example-fix-empty-label.notes.md`

## Why

`isNonEmptyLabel` decides whether a UI label should render a placeholder or the caller's
own text. Before this fix it unconditionally returned `true`, so an explicitly empty
string (`""`) was treated as a non-empty label: callers that skip placeholder rendering
whenever `isNonEmptyLabel` returns `true` silently show a blank field today, with no
error or crash to surface the bug.

## Goal

Fix `isNonEmptyLabel` so it returns `false` for a zero-length string, backed by a
regression guard that fails on the current (unfixed) implementation and passes once the
fix ships.

## Scope

- In scope: the `isNonEmptyLabel` implementation and its regression guard test.
- Out of scope: any other caller of label rendering; input validation beyond empty-string handling (for example whitespace-only labels).

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `tests/fixtures/root-cause/regression-guard.test.ts:11` `isNonEmptyLabel` unconditionally returned `true`, never inspecting `label.length`, so an explicitly empty string was treated as non-empty.
- repro: `bun test tests/fixtures/root-cause/regression-guard.test.ts` fails on the unfixed code because `expect(isNonEmptyLabel("")).toBe(false)` receives `true`.
- regression_guard: tests/fixtures/root-cause/regression-guard.test.ts
- pre_fix_failure_artifact: tests/fixtures/root-cause/pre-fix-failure.log

## Workflow Inventory

- Source plan: (none — golden reference example)
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/example-fix-empty-label.review.md`
- Notes file: `tasks/notes/example-fix-empty-label.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - tests/fixtures/root-cause/
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
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
  tests_pass:
    - path: tests/fixtures/root-cause/regression-guard.test.ts
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: `isNonEmptyLabel("")` returns `false`; existing non-empty-label callers are unaffected.
- Edge cases: whitespace-only labels are unchanged by this fix (out of scope; only the zero-length case is addressed).
- Regression risks: none outside `tests/fixtures/root-cause/regression-guard.test.ts`'s own scope.

## Rollback Point

- Commit / checkpoint: (pre-change HEAD)
- Revert strategy: revert the single commit that fixes `isNonEmptyLabel`; no data migration involved.

---

> **What good looks like**: this is the `bugfix` counterpart to `contract-brief-example.md`. Every field under `## Root Cause Evidence` is concrete rather than the template's placeholder prose: `root_cause` names an exact file:line and condition, `repro` is a command that fails today, `regression_guard` is a real test file also listed under `exit_criteria.tests_pass`, and `pre_fix_failure_artifact` is a real captured run of that test against the unfixed code — produced with `bun test tests/fixtures/root-cause/regression-guard.test.ts > tests/fixtures/root-cause/pre-fix-failure.log 2>&1; echo "PRE_FIX_EXIT=$?" >> tests/fixtures/root-cause/pre-fix-failure.log` before the fix landed, showing a non-zero `PRE_FIX_EXIT=1` line. That is what the bugfix root-cause gate (`contract-run.ts` preflight and `verify-contract.sh`) checks for, and what a worker should be able to point to as pre-fix failure evidence before reporting a bugfix contract done.
