# Task Contract: archcontext-boundary-bridge

> **Status**: Fulfilled
> **Plan**: plans/plan-20260706-0211-archcontext-boundary-bridge.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-06 02:12
> **Review File**: `tasks/reviews/20260706-0211-archcontext-boundary-bridge.review.md`
> **Notes File**: `tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`Capability` type + registry read + longest-prefix match logic were triplicated across `scripts/capability-resolver.ts`, `scripts/capability-config.ts`, and `src/cli/commands/capability-context.ts`, with no import between them. That risked silent drift of the `longest-prefix; same-length ambiguity fails` contract (`.ai/harness/policy.json` `capability_match_rule`) across the three sites. Separately, `docs/researches/20260705-archcontext-capability-filing-handover.md` names a read-only `archcontext.node/v1`-shaped export as the first, reversible step toward eventual arch-context interop, without taking on any archctx runtime dependency yet.

## Goal

Slice 1: make `scripts/capability-resolver.ts` the single export point for the `Capability`/`ContractFiles`/`CapabilityRegistry` types and the `readRegistry`/`findMatch` functions; `capability-config.ts` and `capability-context.ts` import from it instead of duplicating, with byte-identical `match` CLI output before/after. Slice 2: add a read-only `capability-resolver.ts export --format archcontext-boundaries-v1` subcommand that maps the capability registry to a vendored, narrowed subset of the upstream `archcontext.node/v1` schema, plus parity/schema/schemaVersion-pin tests.

## Scope

- In scope: `scripts/capability-resolver.ts`, `scripts/capability-config.ts`, `src/cli/commands/capability-context.ts`, their `assets/templates/helpers/` mirrors, a vendored JSON Schema subset fixture, and new/updated tests under `tests/`.
- Out of scope: everything under the plan's `## EXECUTION_BOUNDARY (Non-Goals)` — no `capability_source` policy switch, no archctx runtime/CLI/daemon/MCP dependency anywhere, no change to `capabilities.json` itself or to workflow-contract `requiredFiles`, no hook-behavior change, no `external-tooling.md` archctx readiness entry, no edits under `/Users/kito/Projects/arch-context` (read-only reference).
- Taste constraints: preserve each converged call site's exact pre-existing observable behavior (including capability-context.ts's file-shaped/root-capability fallback), even where resolver's stricter same-length-ambiguity check newly applies to a site that previously picked silently.

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

- Source plan: `plans/plan-20260706-0211-archcontext-boundary-bridge.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260706-0211-archcontext-boundary-bridge.review.md`
- Notes file: `tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260706-0211-archcontext-boundary-bridge.contract.md
  - tasks/reviews/20260706-0211-archcontext-boundary-bridge.review.md
  - tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/cli/commands/capability-context.ts
  - tests/capability-archcontext-export.test.ts
  - tests/fixtures/archcontext/
  - scripts/capability-resolver.ts
  - scripts/capability-config.ts
  - assets/templates/helpers/capability-resolver.ts
  - assets/templates/helpers/capability-config.ts
```

`scripts/*` and `assets/templates/helpers/*` were widened from the generic contract-template default to the two specific files the approved plan's Slice 1/Slice 2 name (see `plans/plan-20260706-0211-archcontext-boundary-bridge.md` captured scope and `tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md`); no other path under either directory is in scope.

`src/` and `tests/` were narrowed post-review (2026-07-06 gate finding) from the generic contract-template blanket defaults to the exact paths this task actually touched: `src/cli/commands/capability-context.ts` (Slice 1 convergence call site) and `tests/capability-archcontext-export.test.ts` plus `tests/fixtures/archcontext/` (Slice 2 export test and its vendored schema fixture). No other path under either directory is in scope.

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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md
  tests_pass:
    - path: tests/capability-resolver.test.ts
    - path: tests/capability-config.test.ts
    - path: tests/cli/capability-context.test.ts
    - path: tests/capability-archcontext-export.test.ts
    - path: tests/scaffold-parity.test.ts
    - path: tests/workflow-contract.test.ts
  commands_succeed:
    - bun run check:type
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
