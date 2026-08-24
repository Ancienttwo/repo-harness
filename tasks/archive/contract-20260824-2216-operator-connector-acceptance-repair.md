> **Archived**: 2026-08-24 22:16
> **Related Plan**: plans/archive/plan-20260824-1757-operator-connector-acceptance-repair.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260824-2216

# Task Contract: operator-connector-acceptance-repair

> **Status**: Fulfilled
> **Plan**: plans/plan-20260824-1757-operator-connector-acceptance-repair.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-24 21:31
> **Review File**: `tasks/reviews/20260824-1757-operator-connector-acceptance-repair.review.md`
> **Notes File**: `tasks/notes/20260824-1757-operator-connector-acceptance-repair.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

GitHub Connector 对 PR #218 的独立验收发现 2 个 P1、2 个 P2 和 4 个 P3：浏览器 DTO 仍可能泄露路径形态的 registry identity，IPv6 loopback 服务无法解析请求 URL，前端错误/选中态/深层 payload 边界不闭合，桌面 drawer、tracked status 与安装包 smoke 也未满足已批准设计和运行时验收。若不修复，当前 Draft PR 不能进入 Ready 或合并状态。

首次修复通过 exact-head CI 与 Connector 复验后，Connector 追加了 3 个非阻断 P3：decoder 仍返回原始对象、宽屏 drawer 仍声明 modal、Windows/UNC marker path 仍可能进入 tracked status。本 work-package 继续闭合这三个同一信任边界内的 follow-up，不扩展产品能力。

## Goal

关闭 Connector 报告中的全部 8 项 finding及复验追加的 3 个 P3，并用负向安全测试、IPv6 真服务测试、前端交互/解码测试、tracked projection 测试和 clean-installed tarball runtime smoke 证明修复；完成新的 Codex acceptance 后才允许恢复 PR Ready。

## Scope

- In scope:
  - registry identity 的严格派生校验与 Operator browser DTO 显式 allowlist projection。
  - IPv4/IPv6 loopback authority 的单一权威表达与真实 `::1` server 验证。
  - typed API error、深层 snapshot runtime decode、选中任务刷新一致性。
  - desktop 三栏 drawer 与窄屏 overlay 的响应式行为。
  - `tasks/current.md` 生成器的本机路径/owner 脱敏，以及安装包真实服务 smoke。
  - 与修复直接相关的 source、tests、workflow evidence 和 review artifacts。
- Out of scope:
  - remote serving, auth/RBAC, mutation routes, provider merge, background polling, and compatibility acceptance of malformed registry identities.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

若严格 registry reader 已拒绝非派生 ID，或 Operator projection 已逐字段构造且负向测试证明额外/路径形态字段不能穿透，则 P1-1 的根因判断错误；最便宜的证明点是先运行 `tests/unit/operator-fleet-snapshot.test.ts` 的恶意 registry fixture。

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/effects/repo-registry.ts#strictRegistryEntry` accepts any non-empty ID while `src/core/operator/fleet-snapshot.ts#projectOperatorFleetSnapshot` spreads Fleet objects across the browser boundary, so a path-shaped registry ID or future extra field can reach the browser payload.
- repro: construct a strict registry entry whose `id` is an absolute Unix/Windows path, collect/project the Fleet snapshot, and observe that the browser-safe DTO contains that value.
- regression_guard: tests/unit/operator-fleet-snapshot.test.ts
- pre_fix_failure_artifact: .ai/harness/failures/operator-connector-acceptance-repair-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260824-1757-operator-connector-acceptance-repair.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260824-1757-operator-connector-acceptance-repair.review.md`
- Notes file: `tasks/notes/20260824-1757-operator-connector-acceptance-repair.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"repository-suite","kind":"deterministic_test","paths":["*"]},{"id":"packaged-runtime-smoke","kind":"runtime_readback","paths":["scripts/check-tarball-install-smoke.sh"]},{"id":"operator-visual-layout","kind":"manual_acceptance","paths":["src/operator-web/App.tsx","src/operator-web/styles.css"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - .ai/harness/failures/operator-authority-pre-fix.log
  - .ai/harness/failures/operator-connector-acceptance-repair-pre-fix.log
  - README.md
  - assets/templates/helpers/refresh-current-status.sh
  - bun.lock
  - docs/architecture/.projection-manifest.json
  - docs/design/DESIGN-local-human-control-board-v1.md
  - package.json
  - plans/
  - scripts/check-tarball-install-smoke.sh
  - scripts/refresh-current-status.sh
  - src/cli/commands/operator.ts
  - src/cli/index.ts
  - src/core/operator/fleet-snapshot.ts
  - src/effects/operator/server.ts
  - src/effects/repo-registry.ts
  - src/operator-web/
  - tasks/archive/
  - tasks/current.md
  - tasks/lessons.md
  - tasks/todos.md
  - tasks/contracts/20260824-1757-operator-connector-acceptance-repair.contract.md
  - tasks/reviews/20260824-1757-operator-connector-acceptance-repair.review.md
  - tasks/notes/20260824-1757-operator-connector-acceptance-repair.notes.md
  - tests/cli/operator-serve.test.ts
  - tests/cli/registry.test.ts
  - tests/effects/fleet-board.test.ts
  - tests/helper-scripts.test.ts
  - tests/operator-web/
  - tests/unit/hook-entry-single-file-bundle.test.ts
  - tests/unit/operator-fleet-snapshot.test.ts
  - tsconfig.json
  - vite.operator.config.ts
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
    - src/core/operator/fleet-snapshot.ts
    - src/effects/operator/server.ts
    - src/operator-web/App.tsx
    - scripts/check-tarball-install-smoke.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/failures/operator-connector-acceptance-repair-pre-fix.log
    - tasks/notes/20260824-1757-operator-connector-acceptance-repair.notes.md
  tests_pass:
    - path: tests/unit/operator-fleet-snapshot.test.ts
    - path: tests/cli/operator-serve.test.ts
    - path: tests/cli/registry.test.ts
    - path: tests/operator-web/operator-ui.test.tsx
    - path: tests/operator-web/operator-interactions.test.tsx
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-tarball-install-smoke.sh
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: PR #218 的 operator control board 保持 read-only，关闭 Connector 验收报告的全部 P1/P2/P3 后重新接受审查。
- Edge cases: Unix/Windows/control-character/token-like identity，IPv6 loopback，direct typed API error，nested malformed payload，task deletion/revision，desktop/narrow drawer，clean-install lifecycle。
- Regression risks: registry 严格校验会 fail-closed 拒绝历史非派生 ID；这是本任务明确要求的安全收紧，不提供 product compatibility fallback。

## Rollback Point

- Commit / checkpoint: repair commit on `codex/local-human-control-board-v1` after fresh acceptance.
- Revert strategy: revert the single repair commit; do not retain partial DTO or registry compatibility paths.
