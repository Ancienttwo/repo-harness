# Task Contract: verification-evidence-decoupling

> **Status**: Fulfilled
> **Plan**: plans/plan-20260714-0430-verification-evidence-decoupling.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-14 04:43
> **Review File**: `tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md`
> **Notes File**: `tasks/notes/20260714-0430-verification-evidence-decoupling.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

kernel-reduction 合同一次执行耗时约 20 小时（双轨审计：`docs/researches/20260714-gpt-review.md` + Opus 独立审计）。三个病灶：全量 benchmark matrix 被当作每轮验证门禁活跑（单轮 25–40 分钟，触发 ≥6 次）；fingerprint 哈入 `base_rev` 导致无关 main 推进/rebase 反复失效验收（4 轮嵌套复验）；verify-sprint 的 Human Review Card fallback 构成 dual authority。不修，每个 benchmark 相关 work-package 都会重复付出小时级验证成本。

## Goal

按源计划的 4 个 slice 交付：① `src/cli/hook/diff-fingerprint.ts` 将 `base_ref`/`base_rev` 移出 hashed payload（保留为非哈希 metadata，与 `head_rev` 对称），同 commit 反转 `tests/review-freshness.test.ts` 语义（无关 target advance 不 stale；内容/路径/删除状态变化必 stale）；② `scripts/verify-sprint.sh` 删除 canonical external acceptance 不可用时回退 Human Review Card 的分支（canonical 缺失/损坏/helper 不可用一律 fail），`tests/workflow-state-lib.test.ts` 删 fallback 用例并新增「Card 写 pass 不能挽救 canonical 失败」；③ 合同模板（`assets/` 产品源与 `.claude/templates/` 投影）移除 `commands_succeed` 中活跑 matrix 示例、去除 tests_pass 与 commands_succeed 重复执行 authority、`docs/reference-configs/` 补一行 invariant（verifier 消费证据，不生产 runtime-heavy 证据；authoritative matrix = 作者合入前 clean checkout 手动跑一次）；④ `scripts/run-harness-profile-benchmark.ts` 每 arm 结束提取结果后删除该 arm 临时目录（不改计时窗口与语义），提交 `docs/researches/20260714-gpt-review.md`，`tasks/todos.md` 记两个推迟项（per-profile 安装重构；结构禁令检查仅当活跑命令实证复发再加）。

## Scope

- In scope: 上述 4 个 slice 涉及的文件；每 slice 独立 commit。
- Out of scope: 源计划「明确不做」全部 7 项（墙钟门禁、结构禁令脚本、fingerprint 重写、evidence 补强断言、陈旧根活性清扫、per-profile 重构、concurrency/producer/磁盘机器）；`workflow-state.sh` 任何改动；benchmark arm 语义与计时；根 `CLAUDE.md`/`AGENTS.md`。
- Taste constraints: EXECUTION_BOUNDARY——未写入本合同的需求是禁止的设计空间，不是改进许可；未被要求的额外改动 fail closed。删机制优先于加机制。

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

方向错误的可观察证据：存在合法场景依赖「base_rev 入哈希」或「Card fallback」——即某个现有测试/消费方因正当理由要求 target advance 必 stale，或有真实调用方在 canonical 缺失时依赖 Card 结论。最便宜的证明点：改 payload 前先 `rg -n 'base_rev|base_ref' src/ tests/` 与 `rg -n 'Human Review Card' scripts/ tests/ docs/` 枚举全部消费方；若发现无法反转的正当依赖，停下回报，不要绕过。

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260714-0430-verification-evidence-decoupling.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md`
- Notes file: `tasks/notes/20260714-0430-verification-evidence-decoupling.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260714-0430-verification-evidence-decoupling.contract.md
  - tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md
  - tasks/notes/20260714-0430-verification-evidence-decoupling.notes.md
  - .claude/templates/
  - assets/
  - scripts/verify-sprint.sh
  - scripts/run-harness-profile-benchmark.ts
  - docs/reference-configs/
  - docs/researches/20260714-gpt-review.md
  - src/
  - tests/
```

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
    - docs/researches/20260714-gpt-review.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260714-0430-verification-evidence-decoupling.notes.md
  tests_pass:
    - path: tests/review-freshness.test.ts
    - path: tests/workflow-state-lib.test.ts
    - path: tests/harness-benchmark-matrix.test.ts
  commands_succeed:
    - bun run check:type
    - repo-harness run check-task-workflow --strict
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: branch `codex/verification-evidence-decoupling` off `e3d35b75`
- Revert strategy: 每 slice 独立 commit，可逐个 revert；fingerprint 语义变更与测试反转同 commit，revert 即整体恢复旧语义；Card fallback 删除为独立 commit。
