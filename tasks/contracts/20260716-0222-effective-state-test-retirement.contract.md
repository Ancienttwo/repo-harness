# Task Contract: effective-state-test-retirement

> **Status**: Active
> **Plan**: plans/plan-20260716-0222-effective-state-test-retirement.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-16 02:54
> **Review File**: `tasks/reviews/20260716-0222-effective-state-test-retirement.review.md`
> **Notes File**: `tasks/notes/20260716-0222-effective-state-test-retirement.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ESA removed the monolithic Effective State authority but intentionally retained
all pre-cutover assertions while adding Core, Effects, golden, and adapter
suites. Without a retirement pass, duplicate assertions and old-path test APIs
raise maintenance cost and let obsolete surfaces survive future refactors.

## Goal

Retire redundant pre-ESA test coverage and old-path test imports while
preserving every approved Effective State invariant, all twelve golden fixtures,
the complete adapter parity matrix, the public state-snapshot hook, and the
explicit one-shot legacy migration contract. Retain existing package exports.

## Scope

- In scope: consolidate the duplicated twelve-scenario setup; remove old
  integration assertions with equal or stronger focused owners; remove the
  completed unreferenced ESA micro-benchmark harness; stop ordinary fixtures
  from manufacturing the retired legacy marker; route test type imports to the
  canonical Core owner without deleting existing package exports.
- Out of scope: production behavior, public protocol shape, lock/cache/version
  semantics, MCP compatibility fields, the public state-snapshot command, the
  explicit migration command, adoption migration semantics, Harness Loop files,
  Skill Surface files, benchmark reports, package/release surfaces, and 3x9
  benchmark execution.
- Taste constraints: the test diff must be net negative; do not add a new
  abstraction unless it replaces duplicated setup for at least two real suites.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If any deleted assertion lacks an equal or stronger surviving owner, a golden
fixture changes, parity no longer covers all twelve fixtures, or production
runtime output changes, stop and restore that coverage. The cheapest proof is
the focused state suite plus a byte diff of `tests/state/fixtures/`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260716-0222-effective-state-test-retirement.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260716-0222-effective-state-test-retirement.review.md`
- Notes file: `tasks/notes/20260716-0222-effective-state-test-retirement.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and canonical `## External Acceptance Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260716-0222-effective-state-test-retirement.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260716-0222-effective-state-test-retirement.contract.md
  - tasks/reviews/20260716-0222-effective-state-test-retirement.review.md
  - tasks/notes/20260716-0222-effective-state-test-retirement.notes.md
  - tests/effective-state.test.ts
  - tests/cli/state-snapshot.test.ts
  - tests/state/adapter-parity.test.ts
  - tests/state/cli-state-golden.test.ts
  - tests/state/effective-state-fixture.ts
  - tests/state/project-effective-state.test.ts
  - tests/state/benchmark-effective-state.ts
  - tests/capability-resolver.test.ts
  - tests/capability-archcontext-export.test.ts
  - tests/cli/capability-context.test.ts
  - src/cli/hook/state-snapshot.ts
  - src/effects/state/resolve-effective-state.ts
  - scripts/capability-resolver.ts
  - scripts/capability-config.ts
  - src/cli/commands/capability-context.ts
```

## Evidence Requirements

```yaml
evidence_requirements:
  # This is a test-retirement/consolidation slice with no runtime/package
  # input change (see Scope: benchmark reports and 3x9 execution are out of
  # scope), so it does not consume the harness profile benchmark matrix.
  benchmark: not_applicable
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
  files_exist:
    - tests/state/fixtures/idle-inspect.json
    - tests/state/fixtures/executing-fresh-evidence.json
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260716-0222-effective-state-test-retirement.notes.md
  tests_pass:
    - path: tests/effective-state.test.ts
    - path: tests/cli/state-snapshot.test.ts
    - path: tests/state/cli-state-golden.test.ts
    - path: tests/state/adapter-parity.test.ts
    - path: tests/state/state-effects.test.ts
    - path: tests/state/state-concurrency.test.ts
    - path: tests/state/project-effective-state.test.ts
    - path: tests/capabilities/registry.test.ts
    - path: tests/capability-resolver.test.ts
    - path: tests/capability-archcontext-export.test.ts
    - path: tests/cli/capability-context.test.ts
  commands_succeed:
    - bun run check:type
    - bun scripts/check-state-boundaries.ts
    - bun scripts/sync-helper-sources.ts --check
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "All twelve golden JSON files are byte-identical to origin/main"
    - "Adapter parity still enumerates every golden scenario"
    - "Test and fixture line count is net negative"
    - "No Harness Loop, Skill Surface, benchmark report, package, or release file changed"
    - "Full repository test suite passes on the frozen implementation subject"
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: public output and migration behavior remain unchanged.
- Edge cases: security/fault/concurrency cases retain focused Core/Effects
  owners; all twelve characterization fixtures remain frozen.
- Regression risks: accidental loss of a public adapter branch or a stale
  compatibility import; focused public-path tests and boundary checks cover both.

## Rollback Point

- Commit / checkpoint: branch `codex/effective-state-test-retirement` from
  `main@be3e93ce`.
- Revert strategy: revert this test-only PR; no product runtime or data
  migration exists.
