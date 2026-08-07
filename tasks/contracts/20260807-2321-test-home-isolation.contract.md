# Task Contract: test-home-isolation

> **Status**: Fulfilled
> **Plan**: plans/plan-20260807-2321-test-home-isolation.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-08 00:14
> **Review File**: `tasks/reviews/20260807-2321-test-home-isolation.review.md`
> **Notes File**: `tasks/notes/20260807-2321-test-home-isolation.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Tests spawning CLI subprocesses without isolated `REPO_HARNESS_HOME` write into the operator's real `~/.repo-harness`: ~800 leaked temp-path registry entries (still growing per run), a rewritten gates acceptance receipt, and this week an overwritten real `chatgpt.serverName`. Per-site env-passing discipline has failed repeatedly; skipped, every future missed passthrough mutates real operator state again.

## Goal

A bun test preload sets `REPO_HARNESS_HOME` to a fresh per-run temp directory when the environment has not set it, before any test module loads; child processes inherit it, closing the class structurally. Explicit env settings keep precedence. Full `bun test` green under the preload. Primary acceptance evidence: a before/after snapshot of the real `~/.repo-harness` across a full suite run shows zero writes (registry entry count stable, gates receipts untouched, mcp files byte-identical).

## Scope

- In scope: bun test preload config (`bunfig.toml` `[test].preload` or existing preload file), the preload implementation, and any test whose assertions hardcode the real home path.
- Out of scope: production code (`src/**`, `scripts/**` runtime behavior), cleaning already-leaked registry entries (operator operation outside the slice), any new product CLI command, `repo-registry.ts`.
  - cleaning the ~800 already-leaked registry entries (operator-state operation, handled outside the slice by the orchestrator with a backup); adding any product CLI command; changing `repo-registry.ts` or any production code; the `gates/` receipt path when invoked by real operator flows (only test invocations must be isolated).
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the preload breaks tests that verify real-home *resolution logic* in a way that cannot be expressed under an override, the blanket default is wrong for those cases — report before widening. A test that "needs" the real user home for fixtures is itself a leak bug, not a counterexample. Cheapest proof point: run the previously leaking files (`tests/cli/init*.test.ts` family) under the preload and diff the real registry entry count.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260807-2321-test-home-isolation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260807-2321-test-home-isolation.review.md`
- Notes file: `tasks/notes/20260807-2321-test-home-isolation.notes.md`
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
  - tasks/contracts/20260807-2321-test-home-isolation.contract.md
  - tasks/reviews/20260807-2321-test-home-isolation.review.md
  - tasks/notes/20260807-2321-test-home-isolation.notes.md
  - .ai/context/capabilities.json
  - bunfig.toml
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
    - tasks/notes/20260807-2321-test-home-isolation.notes.md
  tests_pass:
    - path: tests/cli/mcp-setup.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
