# Task Contract: gpt-pro-orchestrate-mode

> **Status**: Fulfilled
> **Plan**: plans/plan-20260822-1240-gpt-pro-orchestrate-mode.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-22 12:40
> **Review File**: `tasks/reviews/20260822-1240-gpt-pro-orchestrate-mode.review.md`
> **Notes File**: `tasks/notes/20260822-1240-gpt-pro-orchestrate-mode.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

GPT Pro Browser already has consult, continuation, bridge, read-back, and delegate protocols, but no canonical mode owns the multi-turn loop where GPT Pro plans against an exact GitHub revision, local Codex implements against a possibly dirty worktree, and the same conversation reviews the result. Without that owner, each session can invent its own authority boundary, confuse remote GitHub state with local changes, or treat external advice as task/lease/acceptance authority.

## Goal

Add one `orchestrate` mode under the existing canonical `repo-harness-chatgpt` Skill, provide an explicit opt-in configuration guide through its existing setup mode, and prove it through a real Codex built-in-browser canary. GPT Pro remains an advisory external chief planner/reviewer; repo-harness and local Codex retain task, lease, execution, verification, and acceptance authority.

## Scope

- In scope: canonical Skill routing; one `references/orchestrate.md`; an orchestration setup lane in the existing `references/setup.md`; focused reference-closure and protocol assertions; operator documentation; one real Codex IAB planning-to-review canary; workflow evidence.
- Out of scope: managed fleet roles, parallel Skills, EffectiveState/lease/acceptance changes, Browser MCP or engine changes, typed orchestration schemas/receipts, runtime adapters, automatic agent spawning, commit/push/PR/merge/deploy/publication.
- Taste constraints: one ChatGPT protocol authority; external advice is evidence only; exact remote SHA and secret-scanned local delta stay distinct; stale or unverifiable inputs fail closed.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if Codex IAB cannot expose enough observable state to record the visible Pro model, conversation URL, completion state, attachment outcome, and GitHub MCP invocation classification without inspecting authentication storage. The cheapest proof is the real canary before any typed binding or runtime-adapter work is authorized.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260822-1240-gpt-pro-orchestrate-mode.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260822-1240-gpt-pro-orchestrate-mode.review.md`
- Notes file: `tasks/notes/20260822-1240-gpt-pro-orchestrate-mode.notes.md`
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
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260822-1240-gpt-pro-orchestrate-mode.contract.md
  - tasks/reviews/20260822-1240-gpt-pro-orchestrate-mode.review.md
  - tasks/notes/20260822-1240-gpt-pro-orchestrate-mode.notes.md
  - assets/skills/repo-harness-chatgpt/SKILL.md
  - assets/skills/repo-harness-chatgpt/references/setup.md
  - assets/skills/repo-harness-chatgpt/references/orchestrate.md
  - src/cli/chatgpt-skill/source.ts
  - tests/skill-surface/chatgpt-package.test.ts
  - tests/trace-observer.test.ts
  - docs/repo-harness-chatgpt-browser-engine.md
  - .ai/harness/handoff/gptpro/
  - .ai/harness/runs/
  - .ai/harness/checks/
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
    - assets/skills/repo-harness-chatgpt/SKILL.md
    - assets/skills/repo-harness-chatgpt/references/setup.md
    - assets/skills/repo-harness-chatgpt/references/orchestrate.md
    - src/cli/chatgpt-skill/source.ts
    - tests/skill-surface/chatgpt-package.test.ts
    - tests/trace-observer.test.ts
    - docs/repo-harness-chatgpt-browser-engine.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260822-1240-gpt-pro-orchestrate-mode.notes.md
  tests_pass:
    - path: tests/skill-surface/chatgpt-package.test.ts
    - path: tests/trace-observer.test.ts
  commands_succeed:
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: explicit enablement first produces a bounded setup guide through the canonical setup reference; canonical routing then reaches one orchestration protocol; remote/local truth and advisory/control authority remain explicit; same-conversation review is required.
- Edge cases: missing sign-in, unavailable Pro model, absent GitHub MCP evidence, stale remote SHA or local delta, blocked attachment, incomplete generation, and continuation failure all stop without transport switching or inferred success.
- Regression risks: expanding the closed reference set can drift installed projections or router size; focused package tests and full required checks cover those surfaces.

## Rollback Point

- Commit / checkpoint: `a7598ec0bced4fedce28ef73c4ab68d87474ffe1` on branch `codex/gpt-pro-orchestrate-mode` before implementation.
- Revert strategy: revert the router, new reference, focused tests, operator documentation, and workflow artifacts together; no schema or runtime migration requires data recovery.
