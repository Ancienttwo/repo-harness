# Task Contract: frontend-task-profile

> **Status**: Fulfilled
> **Plan**: plans/plan-20260706-0140-frontend-task-profile.md
> **Task Profile**: code-change
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-06 01:40
> **Review File**: `tasks/reviews/20260706-0140-frontend-task-profile.review.md`
> **Notes File**: `tasks/notes/20260706-0140-frontend-task-profile.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

frontend 工作是意圖失真重災區(視覺/品味無文字錨點)。缺這個 profile,「先 DESIGN.md 後寫碼」只是口頭慣例,沒有任何機器錨點;做錯的下游後果:enum 硬編點漏改會讓 frontend contract 被判 unsupported、條件 case 寫太寬會讓任意檔名冒充 design brief、新模板漏進 scaffold 清單會讓 downstream repo 拿不到模板。

## Goal

按 plan `## Captured Planning Output` 落地:`verify-contract.sh`(兩份)task_profile enum 加 `frontend` + 條件 case(`exit_criteria.files_exist` 須含 design-brief 路徑,缺 → fail 指名);`harness-trace-grade.sh`(兩份)及 rg 掃出的其他 enum 硬編點同步;新增 `design-brief.template.md`(兩份 + scaffold 註冊);`repo-harness-prd/SKILL.md` frontend 路由短註(先產 DESIGN.md、五條標準人工確認、imagegen 可選);測試與快照。

## Scope

- In scope:
  - `scripts/verify-contract.sh` + `assets/templates/helpers/verify-contract.sh`:enum + frontend 條件 case
  - `scripts/harness-trace-grade.sh` + `assets/templates/helpers/harness-trace-grade.sh`:合法值同步;rg 掃描其他 profile enum 硬編清單一致更新
  - `assets/templates/design-brief.template.md` + `.claude/templates/design-brief.template.md`(新檔,parity):目的/受眾、參考(學/避)、色彩、字型排印、佈局、動效、anti-patterns、五條確認標準 checklist、可選 preview 附件位
  - Scaffold 註冊:`scripts/ensure-task-workflow.sh`(+helper)、`scripts/lib/project-init-lib.sh`、`assets/workflow-contract.v1.json` + `.ai/harness/workflow-contract.json`(僅在模板檔於其中列名時,兩份同步)
  - `assets/skill-commands/repo-harness-prd/SKILL.md`:frontend 路由短註(基於本分支已含 WP4 版本追加,不改 WP4 內容)
  - 測試:frontend pass/fail 兩型、unknown profile 仍 fail、enum 同步、bootstrap/scaffold 快照
- Out of scope:
  - `contract-run.ts` brief preflight 的 per-profile 擴展
  - imagegen 任何自動化(skill 引用文字即止)
  - frontend 的 allowed_paths 限制條件(不發明)
  - `verify-sprint.sh` 變更
  - WP4 已落內容的任何改寫

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop immediately and report if this worktree or branch disappears mid-task.

## Workflow Inventory

- Source plan: `plans/plan-20260706-0140-frontend-task-profile.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260706-0140-frontend-task-profile.review.md`
- Notes file: `tasks/notes/20260706-0140-frontend-task-profile.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/contracts/20260706-0140-frontend-task-profile.contract.md
  - tasks/reviews/20260706-0140-frontend-task-profile.review.md
  - tasks/notes/20260706-0140-frontend-task-profile.notes.md
  - tasks/todos.md
  - scripts/verify-contract.sh
  - assets/templates/helpers/verify-contract.sh
  - scripts/harness-trace-grade.sh
  - assets/templates/helpers/harness-trace-grade.sh
  - assets/templates/
  - .claude/templates/
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - assets/workflow-contract.v1.json
  - .ai/harness/workflow-contract.json
  - assets/skill-commands/repo-harness-prd/
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
    - assets/templates/design-brief.template.md
    - .claude/templates/design-brief.template.md
  artifacts_exist:
    - tasks/notes/20260706-0140-frontend-task-profile.notes.md
  files_contain:
    - path: scripts/verify-contract.sh
      pattern: "frontend"
    - path: scripts/harness-trace-grade.sh
      pattern: "frontend"
  tests_pass:
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - diff -q scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh
    - diff -q scripts/harness-trace-grade.sh assets/templates/helpers/harness-trace-grade.sh
    - diff -q assets/templates/design-brief.template.md .claude/templates/design-brief.template.md
    - bash scripts/check-task-workflow.sh --strict
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: frontend profile + `files_exist` 含 `docs/design/DESIGN-x.md` → verify-contract 該項 pass;移除該條目 → fail 且訊息指名補 design brief;非 frontend profile 行為零變化;unknown profile 仍 fail。
- Edge cases: design-brief 匹配規則(`docs/design/` 前綴或 basename 含 `DESIGN`/`design-brief`,大小寫不敏感)不得寬到任意檔名;legacy 空 profile 仍走 legacy accepted。
- Regression risks: enum 硬編點多處(rg 掃全);scaffold/bootstrap 快照;workflow-contract 兩份同步。

## Rollback Point

- Commit / checkpoint: base `18e42a3`(`codex/intake-trigger-rules` tip;stack 於 PR #48 之上)
- Revert strategy: 刪除 branch `codex/frontend-task-profile` 與 worktree;無資料遷移。
