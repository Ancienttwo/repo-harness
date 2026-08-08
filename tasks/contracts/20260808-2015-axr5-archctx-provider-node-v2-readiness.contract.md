# Task Contract: axr5-archctx-provider-node-v2-readiness

> **Status**: Active
> **Plan**: plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md
> **Task Profile**: code-change
> **Workflow Profile**: strict
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-08 20:15
> **Review File**: `tasks/reviews/20260808-2015-axr5-archctx-provider-node-v2-readiness.review.md`
> **Notes File**: `tasks/notes/20260808-2015-axr5-archctx-provider-node-v2-readiness.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ArchContext 的 producer contract 已闭合，但 repo-harness 没有固定版本 consumer
boundary。若直接把 PATH 上任意 `archctx` 接进 Stop runtime，会把版本、snapshot 与
write authority 变成不可证明的环境状态。

## Goal

在 provider 默认 disabled 的前提下，加入 package-local、feature-handshaken、
fail-closed 的 ArchContext projection provider 与手工 CLI lane；原子迁移 canonical
capability reader/exporter/self-host nodes 到 `archcontext.node/v2`，不加入 v1 dual reader。

## Scope

- In scope: pure protocol/policy/readiness；package-local subprocess adapter；manual
  check/plan/apply/status/drain；node/v2 reader/exporter/helper/self-host migration；
  disposable integrity-verified 0.4.0 tarball consumer readback。
- Out of scope:
  - Stop journal/drain/retry/dead-letter、自动 refresh consumer、10-doc adoption、npm publish、registry exact dependency 与 final authority cutover。
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

若 PATH 冲突能够改变 executed binary，或 provider disabled 仍 spawn subprocess，或
reader 同时接受 v1/v2，则设计被证伪。最便宜 proof 是 provider fake-package test 与
canonical v1 rejection test。

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260808-2015-axr5-archctx-provider-node-v2-readiness.review.md`
- Notes file: `tasks/notes/20260808-2015-axr5-archctx-provider-node-v2-readiness.notes.md`
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
  - tasks/contracts/20260808-2015-axr5-archctx-provider-node-v2-readiness.contract.md
  - tasks/reviews/20260808-2015-axr5-archctx-provider-node-v2-readiness.review.md
  - tasks/notes/20260808-2015-axr5-archctx-provider-node-v2-readiness.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/policy.json
  - .archcontext/model/nodes/
  - .claude/templates/
  - AGENTS.md
  - CLAUDE.md
  - assets/
  - docs/architecture/
  - docs/reference-configs/
  - docs/verification/
  - package.json
  - bun.lock
  - scripts/
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/core/architecture/projection.ts
    - src/effects/architecture/archctx-provider.ts
    - src/cli/commands/architecture-projection.ts
    - scripts/axr5-archctx-clean-room.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260808-2015-axr5-archctx-provider-node-v2-readiness.notes.md
  tests_pass:
    - path: tests/architecture-projection-provider.test.ts
    - path: tests/capabilities/registry.test.ts
    - path: tests/capability-archcontext-source.test.ts
    - path: tests/capability-archcontext-export.test.ts
    - path: tests/capability-resolver.test.ts
    - path: tests/unit/helper-projection-drift.test.ts
    - path: tests/cli/status.test.ts
    - path: tests/state/operation-readiness.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:helpers
    - bun src/cli/index.ts architecture-projection status --json
```

## Acceptance Notes (Human Review)

- Functional behavior: local provider handshake and manual result mapping pass；disabled is no-op。
- Edge cases: PATH conflict、missing binary、version/features mismatch、corrupt JSON、timeout、v1 rejection。
- Regression risks: existing self-host capability match and generated helper parity。

## Rollback Point

- Commit / checkpoint: AXR5 implementation commit on `codex/axr5-archctx-provider-node-v2-readiness`.
- Revert strategy: revert the AXR5 implementation commit as one unit; provider remains disabled by default, so no runtime queue or ledger migration is required.
