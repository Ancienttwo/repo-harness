# Task Contract: codex-native-agent-authority

> **Status**: Fulfilled
> **Plan**: plans/plan-20260811-1344-codex-native-agent-authority.md
> **Task Profile**: code-change
> **Workflow Profile**: strict
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-11 13:44
> **Review File**: `tasks/reviews/20260811-1344-codex-native-agent-authority.review.md`
> **Notes File**: `tasks/notes/20260811-1344-codex-native-agent-authority.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

repo-harness currently projects fleet personas into Codex TOML but still tells Codex
to prefer App threads and degrade through native spawn, `codex-exec`, and the main
thread. Codex 0.147 now exposes native `agent_type`; retaining the old ladder leaves
thread metadata, prompt persona, and native runtime identity as competing authorities.
Runtime role/model evidence is also lost when no advisor state was created before
`SubagentStart`, so a valid native selection cannot currently prove readiness.

## Goal

Make native `agent_type` the only Codex fleet identity/lifecycle authority, make
official `SubagentStart` fields sufficient to persist role/model evidence, and
remove automatic semantic authorization plus thread/fallback runner authority from
the runtime, installer, policy projections, tests, and reference documentation.

## Scope

- In scope:
  - Native `agent_type` guidance that fails closed when the named role is unavailable.
  - Event-scoped role/model evidence initialized directly from official `SubagentStart` fields.
  - Removal of Codex `delegation.mode=auto`, natural-language trigger inference, App-thread preference, and runner fallbacks.
  - Synchronized policy seeds/mirrors, focused tests, architecture/reference docs, changelog, and task artifacts.
- Out of scope:
  - Claude Task/Agent transport, fleet persona content/model mapping, Codex plugin packaging, MCP goal transport, contract-run execution semantics outside delegation policy projection.
- Taste constraints: one runtime authority; no compatibility aliases, alternate runners, semantic inference, or claim that reasoning effort was observed.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Stop before the policy cutover if the live Codex 0.147 spawn schema lacks
`agent_type`; `SubagentStart` reports `agent_type=default` or a configured-model
mismatch; either explorer or fast-worker misses its installed output protocol; or
the hook cannot persist role/model evidence without advisor pre-seeding. Missing
reasoning-effort readback is not a falsifier and must remain
`configured_unverified`. The cheapest proof is one read-only explorer canary and
one disposable-write fast-worker canary with official hook evidence.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260811-1344-codex-native-agent-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260811-1344-codex-native-agent-authority.review.md`
- Notes file: `tasks/notes/20260811-1344-codex-native-agent-authority.notes.md`
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
  - .ai/harness/policy.json
  - .claude/templates/contract.template.md
  - README.md
  - README.fr.md
  - README.ja.md
  - README.zh-CN.md
  - assets/reference-configs/external-tooling.md
  - assets/templates/contract.template.md
  - assets/templates/helpers/check-agent-tooling.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - assets/templates/helpers/plan-to-todo.sh
  - docs/CHANGELOG.md
  - docs/architecture/modules/runtime-harness/hook-adapters.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/architecture/modules/workflow-engine/inspection-migration.md
  - docs/reference-configs/contract-brief-example.md
  - docs/reference-configs/contract-brief-example-bugfix.md
  - docs/reference-configs/external-tooling.md
  - docs/reference-configs/install-profiles.md
  - docs/spec.md
  - plans/
  - scripts/axr6-stop-host-cycle.ts
  - scripts/check-agent-tooling.sh
  - scripts/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - scripts/plan-to-todo.sh
  - src/cli/commands/delegation-mode.ts
  - src/cli/commands/install.ts
  - src/cli/commands/validators.ts
  - src/cli/hook/session-context.ts
  - src/cli/hook/delegation-state.ts
  - src/cli/hook/stop-handler.ts
  - src/cli/hook/subagent-handler.ts
  - src/cli/index.ts
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260811-1344-codex-native-agent-authority.contract.md
  - tasks/reviews/20260811-1344-codex-native-agent-authority.review.md
  - tasks/notes/20260811-1344-codex-native-agent-authority.notes.md
  - tests/cli/install.test.ts
  - tests/check-agent-tooling.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/delegation-state-concurrency.test.ts
  - tests/hook-contracts.test.ts
  - tests/helper-scripts.test.ts
  - tests/readme-dx.test.ts
  - tests/session-context.test.ts
  - tests/state/loop-semantics-characterization.test.ts
  - tests/state/fixtures/loop-semantics/characterization.json
  - tests/scaffold-parity.test.ts
  - tests/stop-handler.test.ts
  - tests/subagent-handler.test.ts
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
    - tasks/notes/20260811-1344-codex-native-agent-authority.notes.md
  tests_pass:
    - path: tests/subagent-handler.test.ts
    - path: tests/session-context.test.ts
    - path: tests/cli/install.test.ts
    - path: tests/create-project-dirs.runtime.test.ts
    - path: tests/check-agent-tooling.test.ts
    - path: tests/hook-contracts.test.ts
    - path: tests/helper-scripts.test.ts
    - path: tests/readme-dx.test.ts
    - path: tests/state/loop-semantics-characterization.test.ts
    - path: tests/scaffold-parity.test.ts
    - path: tests/stop-handler.test.ts
    - path: tests/unit/helper-projection-drift.test.ts
  commands_succeed:
    - bun test tests/subagent-handler.test.ts tests/session-context.test.ts tests/cli/install.test.ts tests/create-project-dirs.runtime.test.ts tests/check-agent-tooling.test.ts tests/hook-contracts.test.ts tests/stop-handler.test.ts
    - cmp scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh
    - cmp docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md
    - bun run check:type
    - bun run check:helpers
    - bun run check:reference-configs
```

## Acceptance Notes (Human Review)

- Functional behavior: Codex native agent_type is the only fleet runner authority; Claude remains unchanged.
- Edge cases: missing/default/malformed agent_type or model evidence fails closed; reasoning effort remains configured_unverified.
- Regression risks: user-level install no longer writes delegation.mode; generated policy projections must remain byte/semantic mirrors.

## Rollback Point

- Commit / checkpoint: pre-change branch base
- Revert strategy: revert this work-package branch to restore the thread-first delegation contract.
