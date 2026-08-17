# Task Contract: minimal-change-v2-enforce

> **Status**: Fulfilled
> **Plan**: plans/plan-20260817-2101-minimal-change-v2-enforce.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-17 21:38
> **Review File**: `tasks/reviews/20260817-2101-minimal-change-v2-enforce.review.md`
> **Notes File**: `tasks/notes/20260817-2101-minimal-change-v2-enforce.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

minimal_change v1 只在 Stop 打印一段建议，findings 从来不改变任何人的行为——`mode: 'enforce'` 早就写在 policy 里，却在 `normalizeMode` 被静默降级成 advice，`blocking` 被钉死成字面 `false`。观察层不变成约束层，代码熵就只能靠人记得去看。这一刀把 enforce 做成真闸门；做错的后果是 Stop 被永久卡死，所以 receipt 与熔断两条释放路径必须同时成立。

## Goal

按 plan 的九条 frozen decisions 落地 minimal_change v2 enforce：`MinimalChangeMode` 接受 `'enforce'`、`blocking` 改为由 `mode` 计算；Stop 在 `verdict === 'review'` 且无匹配 audit receipt 时返回 `block(reason)`，reason 自带 findings 与 receipt 契约；receipt 走 `.ai/harness/checks/minimal-change-audit.latest.json` 的 fingerprint 严格比对（缺失／畸形／不匹配一律不放行）；复用既有 circuit-breaker 模块，同一 fingerprint 最多阻断两次后带警告放行；shipped defaults 不动，仅本 repo policy 翻成 enforce。

## Scope

- In scope: `src/cli/hook/minimal-change-policy.ts`、`src/cli/hook/stop-handler.ts`、`src/cli/hook/circuit-breaker.ts` 的 enforce 路径；对应测试；本 repo `.ai/harness/policy.json#minimal_change.mode`；`assets/reference-configs/minimal-change-hooks.md` 与其 `docs/` 投影；`docs/CHANGELOG.md`。
- Out of scope: `minimal-change-policy.ts` 的 defaults（`advice` / `post_edit_observer: false`）与 `scripts/lib/project-init-lib.sh` 脚手架 policy；`assets/skills/`（reclaim-code-entropy 保持全域 skill，闸门只依赖 receipt 文件）；gatekeeper / fleet；新的 policy 开关；两份 workflow-contract manifest（实测只编码未变的 doc 路径与已退役的 `.ai/hooks/lib/minimal-change.sh` 清理指纹）；版本号；commit/push。EXECUTION_BOUNDARY：未列项是禁区。
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

若 enforce 闸门存在任何「阻断后无法在有限步内放行」的状态，方向即错——观察层升级成约束层的前提是它必须可收敛。最便宜证点：同一 report fingerprint 连跑三次 Stop，第三次必须带警告放行；再对每条阻断路径检查 receipt 与熔断是否都还活着。（验收轮据此发现并已修复一例：报告缺 `fingerprint` 字段时两条释放路径同时死锁，见 Acceptance Notes。）

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260817-2101-minimal-change-v2-enforce.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260817-2101-minimal-change-v2-enforce.review.md`
- Notes file: `tasks/notes/20260817-2101-minimal-change-v2-enforce.notes.md`
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
  - plans/plan-20260817-2101-minimal-change-v2-enforce.md
  - tasks/contracts/20260817-2101-minimal-change-v2-enforce.contract.md
  - tasks/reviews/20260817-2101-minimal-change-v2-enforce.review.md
  - tasks/notes/20260817-2101-minimal-change-v2-enforce.notes.md
  - .ai/harness/policy.json
  - src/cli/hook/minimal-change-policy.ts
  - src/cli/hook/stop-handler.ts
  - src/cli/hook/circuit-breaker.ts
  - tests/minimal-change-policy.test.ts
  - tests/stop-handler.test.ts
  - tests/state/loop-semantics-characterization.test.ts
  - assets/reference-configs/minimal-change-hooks.md
  - docs/reference-configs/minimal-change-hooks.md
  - docs/CHANGELOG.md
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
    - tasks/notes/20260817-2101-minimal-change-v2-enforce.notes.md
  tests_pass:
    - path: tests/minimal-change-policy.test.ts
    - path: tests/stop-handler.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior: with `mode: 'enforce'` and latest report verdict `review`, Stop returns `decision: block` with a self-contained reason (findings + receipt template + live fingerprint); a receipt whose `fingerprint` matches the report releases; after 2 blocks on the same fingerprint the circuit breaker releases with a warning.
- Edge cases: missing/malformed/mismatched receipt never releases (fail closed); `mode: 'advice'` end-to-end behavior is byte-identical to v1 (regression-tested); report absent → verdict `unknown` → gate inert.
- Regression risks: `tests/state/loop-semantics-characterization.test.ts:703` pins a literal source marker in `stop-handler.ts` — signature changes there break it first; the enforce gate was deliberately not added to that ordering golden (owned by another work-package).

## Rollback Point

- Commit / checkpoint: parent `b456121a` (main after unrelated #197 worktree-merge-authority landed; zero path intersection with this slice); v2 lands as a single commit on top.
- Revert strategy: revert the v2 commit, or per-repo disable by setting `.ai/harness/policy.json#minimal_change.mode` back to `'advice'` (one value, restores v1 behavior exactly).
