> **Archived**: 2026-08-25 23:25
> **Related Plan**: plans/archive/plan-20260825-2120-me3a-provider-thread-effect.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260825-2325

# Task Contract: me3a-provider-thread-effect

> **Status**: Fulfilled
> **Plan**: plans/plan-20260825-2120-me3a-provider-thread-effect.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-provider-thread-effects
> **Last Updated**: 2026-08-25 21:23
> **Review File**: `tasks/reviews/20260825-2120-me3a-provider-thread-effect.review.md`
> **Notes File**: `tasks/notes/20260825-2120-me3a-provider-thread-effect.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ME-1C 已能在 Provider effect 之前持久化 exact ModuleMessage，但 Provider Thread 仍是 host-owned runtime。若缺少一个 persist-first、at-most-once、可重启 reconcile 的薄适配边界，丢失 acknowledgement 会诱发重复 Codex turn；若 repo-harness 自行补 query loop，则会建立第二套 Agent Runtime 权威。

## Goal

交付 Codex-first Provider Thread effect bridge：从一个已持久化 ME-1C event 和当前 Binding fence 构造 immutable intent，持久化 `effect_started` 后至多返回一次 host action，并用 canary 冻结的 exact Thread/turn correlation 记录 success/failure/unknown；lost ACK 只能 reconcile，不能重发。Runtime-only effect 不得改变 Task、Lease、Fleet 或 Acceptance bytes。

## Scope

- In scope: ME-3A production schemas；git-common-dir intent/observation journal；ME-1C idempotent external delivery projection；operator `engineer thread-effect` CLI；restricted Engineer MCP read-only effect/capability projection；Codex lost-ack fault matrix；ArchContext capability and Human-approved architecture projection。
- Out of scope: daemon、Agent query loop、tool parser、history/compaction、generic Worker Host、Provider fallback、automatic Thread create/archive、ME-3B、ME-2B、Task/Lease/Fleet/Acceptance mutation。
- Taste constraints: host owns the actual Codex operation and exact Provider evidence；repo-harness only admits one closed action and journals observations。Missing or ambiguous Provider facts fail closed，不做 heuristic correlation 或 token estimates。

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

若在 `intent_persisted -> effect_started` 持久化之后仍无法阻止同一 effect 第二次产生 host action，或 exact canary tuple 无法在重启后唯一关联同一 Codex turn，则该薄 bridge 不足。最便宜证明点是 duplicate-start + lost-ack/restart fixture；任一产生第二 action 即停止。

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260825-2120-me3a-provider-thread-effect.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260825-2120-me3a-provider-thread-effect.review.md`
- Notes file: `tasks/notes/20260825-2120-me3a-provider-thread-effect.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"me3a-full-repository-verification","kind":"deterministic_test","paths":["*"]},{"id":"me3a-provider-effect-runtime-readback","kind":"runtime_readback","paths":["src/core/engineers/provider-thread-effect.ts","src/effects/engineers/module-inbox.ts","src/effects/engineers/provider-thread-effect-store.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260825-2120-me3a-provider-thread-effect.md
  - plans/prds/20260825-1551-provider-thread-effect-adapter.prd.md
  - docs/researches/20260824-persistent-module-engineer-organization.md
  - docs/architecture/
  - AGENTS.md
  - CLAUDE.md
  - .archcontext/model/nodes/
  - .archcontext/model/relations/
  - .archcontext/model/flows/
  - .ai/context/capabilities.json
  - tasks/current.md
  - tasks/todos.md
  - tasks/workstreams/runtime-harness/provider-thread-effects/
  - tasks/contracts/20260825-2120-me3a-provider-thread-effect.contract.md
  - tasks/reviews/20260825-2120-me3a-provider-thread-effect.review.md
  - tasks/notes/20260825-2120-me3a-provider-thread-effect.notes.md
  - src/core/engineers/provider-thread-effect.ts
  - src/effects/engineers/provider-thread-effect-store.ts
  - src/effects/engineers/module-inbox.ts
  - src/cli/commands/engineer.ts
  - src/cli/mcp/engineer-tools.ts
  - tests/unit/me3a-provider-thread-effect.test.ts
  - tests/unit/me1c-module-inbox.test.ts
  - tests/cli/engineer.test.ts
  - tests/cli/mcp-engineer-tools.test.ts
  - tests/cli/mcp-http.test.ts
  - tests/architecture-projection-e2e.test.ts
  - tests/capability-archcontext-export.test.ts
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
    - src/core/engineers/provider-thread-effect.ts
    - src/effects/engineers/provider-thread-effect-store.ts
    - docs/architecture/modules/runtime-harness/provider-thread-effects.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260825-2120-me3a-provider-thread-effect.notes.md
  tests_pass:
    - tests/unit/me3a-provider-thread-effect.test.ts
    - tests/unit/me1c-module-inbox.test.ts
    - tests/cli/engineer.test.ts
    - tests/cli/mcp-engineer-tools.test.ts
    - tests/cli/mcp-http.test.ts
    - tests/architecture-projection-e2e.test.ts
    - tests/capability-archcontext-export.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: exact persisted event -> immutable intent -> one host action -> exact observation/reconciliation；success idempotently projects one ME-1C delivery observation。
- Edge cases: persistence-before-action、duplicate start、crash/restart、lost ACK、Binding rotation、unsupported capability、unknown evidence、null Provider usage、conflicting replay。
- Regression risks: ME-1C canonical bytes and receipt transition semantics；restricted Engineer MCP authority；architecture projection freshness。

## Rollback Point

- Commit / checkpoint: ME-3A branch exact acceptance commit。
- Revert strategy: revert the ME-3A merge commit；git-common-dir runtime journals are versioned under a new ME-3A namespace and do not alter tracked authorities。
