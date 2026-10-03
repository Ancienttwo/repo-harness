# Task Contract: herdr-optional-peer-harness

> **Status**: Active
> **Plan**: plans/plan-20260908-1926-herdr-optional-peer-harness.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-08 19:26
> **Review File**: `tasks/reviews/20260908-1926-herdr-optional-peer-harness.review.md`
> **Notes File**: `tasks/notes/20260908-1926-herdr-optional-peer-harness.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Multi-harness collaboration guidance (read peer context, converse, assign tasks) is hand-written per machine today and drifts. herdr is a machine property: baking its guidance into the committed repo CLAUDE.md/AGENTS.md would be wrong on machines and CI without herdr. If shipped wrong, generated repos carry machine state or strict readiness starts failing on hosts without herdr.

## Goal

`repo-harness init` renders the user-level managed global-working-rules block with a `## Peer Harness Collaboration` section whose variant (herdr present / tmux only) is selected by a PATH probe for `herdr`; `check-agent-tooling.sh` reports `herdr` as an optional platform-runtime capability; both root orchestration partials carry one transport-agnostic bullet pointing at that user-level section; external-tooling docs list herdr as optional. tmux stays required and strict readiness is unchanged.

## Scope

- In scope: `src/cli/commands/init.ts` render-time probe (injectable for tests), `assets/reference-configs/global-working-rules.md` new section with two variants, `scripts/check-agent-tooling.sh` + `assets/templates/helpers/check-agent-tooling.sh` optional herdr capability, both orchestration partials, `docs/reference-configs/external-tooling.md` + `assets/reference-configs/external-tooling.md` herdr row, tests.
- Out of scope: any herdr adapter under `agent_runtime`, `src/effects/review/*`, strict readiness gating, listing herdr/tmux CLI parameters in guidance, editing the user's real `~/.claude` or `~/.codex` files.
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
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260908-1926-herdr-optional-peer-harness.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260908-1926-herdr-optional-peer-harness.review.md`
- Notes file: `tasks/notes/20260908-1926-herdr-optional-peer-harness.notes.md`
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
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260908-1926-herdr-optional-peer-harness.contract.md
  - tasks/reviews/20260908-1926-herdr-optional-peer-harness.review.md
  - tasks/notes/20260908-1926-herdr-optional-peer-harness.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/cli/commands/init.ts
  - assets/reference-configs/
  - assets/partials/
  - assets/partials-agents/
  - assets/templates/helpers/check-agent-tooling.sh
  - scripts/check-agent-tooling.sh
  - docs/reference-configs/external-tooling.md
  - docs/reference-configs/global-working-rules.md
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

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed.

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260908-1926-herdr-optional-peer-harness.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "focused-regression",
      "kind": "package_test",
      "path": "tests/unit/herdr-optional-peer-harness.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the changed behavior named by this contract.",
      "inputs": { "env": [] }
    },
    {
      "id": "assembly-and-docs",
      "kind": "command",
      "command": "bun test --timeout 60000 tests/assembly.test.ts tests/readme-dx.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Both orchestration partials and reference docs are asserted literally by these suites.",
      "inputs": { "env": [] }
    },
    {
      "id": "init-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Proves the adoption planner still renders with the changed partials and global rules template.",
      "inputs": { "env": [] }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Checks TypeScript contracts before behavioral verification.",
      "inputs": { "env": [] }
    }
  ]
}
```

This is the sole executable verification authority. Use `baseline_with_delta`
only when a referenced immutable baseline plus named current delta checks prove
the intended coverage; do not infer that choice from paths or command text.

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: branch base ba09b548
- Revert strategy: revert the single squash commit; user-level files only change on the next `repo-harness init`.
