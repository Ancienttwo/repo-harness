# Task Contract: intake-trigger-rules

> **Status**: Partial
> **Plan**: plans/plan-20260706-0024-intake-trigger-rules.md
> **Task Profile**: code-change
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-06 00:24
> **Review File**: `tasks/reviews/20260706-0024-intake-trigger-rules.review.md`
> **Notes File**: `tasks/notes/20260706-0024-intake-trigger-rules.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

原始問題 1(用戶描述不清/沒想清楚)的上游半邊:PRD 產出前沒有 prior-art 觸發規則、沒有負向 scenario 要求、沒有把模糊語言磨利的協議。做錯的下游後果:advisory 文字寫得含糊會被 agent 忽略等於沒做;模板雙份漂移會讓 scaffold 測試紅;把 advisory 誤做成硬閘會擋真正新穎的工作(research note 已明確拒絕)。

## Goal

按 plan `## Captured Planning Output` 落地四塊 advisory 慣例:(1) `repo-harness-prd/SKILL.md` 加 prior-art 觸發表(含豁免與 sidecar_research 路由)、P0 負向 scenario 規則、domain-modeling 五紀律(challenge 對象指向 `docs/spec.md` `## Canonical Terms`);(2) PRD 模板(真源 + 材化副本,parity)加負向 scenario 腳手架槽位與 Adjacent Patterns 觸發註記;(3) `docs/spec.md` 新增 `## Canonical Terms` 段與 3–5 條種子術語;(4) notes 模板源加 ADR 三條件 promotion 過濾行。零新腳本、零新 gate、零 schema。

## Scope

- In scope:
  - `assets/skill-commands/repo-harness-prd/SKILL.md`:三個協議步驟
  - PRD 模板:先定位真源(assets 側或 scaffold 生成源),與 `.claude/templates/prd.template.md` 兩份同改保 parity
  - `docs/spec.md`:`## Canonical Terms` 段(純增段,glossary-only,一行一條)
  - Notes 模板源(`plan-to-todo.sh` heredoc 或 assets 模板,兩份 parity):Promotion Candidates 加 ADR 三條件過濾行
  - 受影響測試/快照更新(bootstrap-files、scaffold-parity、helper-scripts 等,以 rg 掃描為準)
- Out of scope:
  - `discover` skill 整合(user-level skill 家,獨立 follow-up)
  - `prd_ready_error` 對負向 scenario / prior-art 的機器硬閘(慣例先行,另開)
  - 新檔案類型(CONTEXT.md、docs/adr/)
  - Canonical Terms 的 hook 級 enforcement
  - WP5(frontend profile)、`verify-contract.sh` 任何變更

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop immediately and report if this worktree or branch disappears mid-task.

## Workflow Inventory

- Source plan: `plans/plan-20260706-0024-intake-trigger-rules.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260706-0024-intake-trigger-rules.review.md`
- Notes file: `tasks/notes/20260706-0024-intake-trigger-rules.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/contracts/20260706-0024-intake-trigger-rules.contract.md
  - tasks/reviews/20260706-0024-intake-trigger-rules.review.md
  - tasks/notes/20260706-0024-intake-trigger-rules.notes.md
  - assets/skill-commands/repo-harness-prd/
  - assets/templates/
  - .claude/templates/
  - scripts/plan-to-todo.sh
  - assets/templates/helpers/plan-to-todo.sh
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - docs/spec.md
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
  artifacts_exist:
    - tasks/notes/20260706-0024-intake-trigger-rules.notes.md
  files_contain:
    - path: docs/spec.md
      pattern: "Canonical Terms"
    - path: assets/skill-commands/repo-harness-prd/SKILL.md
      pattern: "prior-art"
    - path: .claude/templates/prd.template.md
      pattern: "negative"
  tests_pass:
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: SKILL 協議含觸發表(五類觸發 + 豁免 + sidecar_research 路由)、P0 負向 scenario 規則、五紀律;PRD 模板兩份含負向 scenario 槽位;spec 有 Canonical Terms 種子;notes 模板有 ADR 三條件行。
- Edge cases: 模板真源與材化副本 parity;觸發表措辭必須 advisory(「必填 Adjacent Patterns 或引用 researches」是對 agent 的協議要求,不是機器閘)。
- Regression risks: scaffold/bootstrap 快照測試;`prd_ready_error` 行為不得改變。

## Rollback Point

- Commit / checkpoint: base = origin/main(worktree 建立時 tip)
- Revert strategy: 刪除 branch `codex/intake-trigger-rules` 與 worktree;無資料遷移。
