# Task Contract: subagent-long-command-guardrail

> **Status**: Active
> **Plan**: plans/plan-20260819-0049-subagent-long-command-guardrail.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-19 00:49
> **Review File**: `tasks/reviews/20260819-0049-subagent-long-command-guardrail.review.md`
> **Notes File**: `tasks/notes/20260819-0049-subagent-long-command-guardrail.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Delegated workers foreground-waiting long gate commands (verify-sprint, full bun test) die to the host 600s stream watchdog — proven three times on 2026-08-18 even with polling instructions. The host watchdog is unfixable repo-side; the mitigation is workers refusing long waits and handing control back.

## Goal

SubagentStart context injects one standing advisory line (constant + marker `[repo-harness:long-command-guardrail]`, patterned on `RETURN_CONTRACT_MARKER`/`RETURN_CONTRACT_TEXT` at `src/cli/hook/subagent-handler.ts:86-87`): commands expected to exceed 5 minutes must be handed back to the orchestrator as BLOCKED (or run backgrounded with log polling) instead of foreground-waited. The convention is recorded in `docs/reference-configs/sprint-contracts.md` near the existing 600-second verify budget note. Tests pin single injection and no duplication.

## Scope

- In scope: `src/cli/hook/subagent-handler.ts` (one constant + injection alongside RETURN_CONTRACT_TEXT with marker-dedupe), `tests/subagent-handler.test.ts` (marker present once; hand-back-as-BLOCKED wording; no duplicate injection), `docs/reference-configs/sprint-contracts.md` (one short convention subsection).
- Out of scope: any watchdog/retry machinery; RETURN_CONTRACT_TEXT semantics; delegation state or role routing; App Thread or reasoning-effort work; version bump; release.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If SubagentStart context assembly has a size budget or dedupe mechanism that drops appended advisory text, the line never reaches workers. Cheapest proof: rg RETURN_CONTRACT_MARKER usage sites in subagent-handler.ts and the existing test asserting its presence — the new line rides the identical path.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260819-0049-subagent-long-command-guardrail.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260819-0049-subagent-long-command-guardrail.review.md`
- Notes file: `tasks/notes/20260819-0049-subagent-long-command-guardrail.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - assets/reference-configs/sprint-contracts.md
  - docs/reference-configs/sprint-contracts.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260819-0049-subagent-long-command-guardrail.contract.md
  - tasks/reviews/20260819-0049-subagent-long-command-guardrail.review.md
  - tasks/notes/20260819-0049-subagent-long-command-guardrail.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
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
    - tasks/notes/20260819-0049-subagent-long-command-guardrail.notes.md
  tests_pass:
    - path: tests/subagent-handler.test.ts
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
