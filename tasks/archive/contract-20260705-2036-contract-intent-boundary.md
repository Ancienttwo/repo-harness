> **Archived**: 2026-07-05 20:36
> **Related Plan**: plans/archive/plan-20260705-1455-contract-intent-boundary.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260705-2036

# Task Contract: contract-intent-boundary

> **Status**: Active
> **Plan**: plans/plan-20260705-1455-contract-intent-boundary.md
> **Task Profile**: code-change
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-05 15:12
> **Review File**: `tasks/reviews/20260705-1455-contract-intent-boundary.review.md`
> **Notes File**: `tasks/notes/20260705-1455-contract-intent-boundary.notes.md`

## Goal

讓負向邊界成為委派執行的必達輸入:plan 的 Non-scope 在投影時搬進 contract `Out of scope:`;`contract-run` run 模式對 In/Out scope 各自獨立 fail-closed;EXECUTION_BOUNDARY 反加戲條款機械到達五個 runner 面(worker prompt、delegation advisor、subagent start context、MCP codex-goal、root 契約)。全部沿 Phase 2 已定案閘拓撲(投影 advisory、run fail-closed),實作以 plan `## Detailed Design` 為準。

## Scope

- In scope:
  - `assets/templates/contract.template.md`:`## Scope` 加 `Taste constraints:` 清單(advisory)
  - `scripts/plan-to-todo.sh` + `assets/templates/helpers/plan-to-todo.sh`:plan Non-scope/Out-of-scope bullets 投影進 contract `Out of scope:`;無來源維持占位 + advisory
  - `scripts/contract-run.ts` + `assets/templates/helpers/contract-run.ts`:In/Out scope 獨立 preflight;run 模式 fail-closed `incomplete_brief`;EXECUTION_BOUNDARY 常量注入 worker prompt
  - `assets/hooks/codex-delegation-advisor.sh`、`assets/hooks/subagent-start-context.sh`:context 附加條款;`bun run sync:hooks` 投影 `.ai/hooks/`
  - `src/cli/mcp/tools.ts`:`renderCodexGoalFromSprint` 注入 `## Execution boundary` 段;`validateGoal` 列為 required section
  - root `AGENTS.md` / `CLAUDE.md`:Operating Rules 一行 boundary 摘要
  - 測試:preflight 拆分、carry-forward 兩型、五面到達斷言、canonical 句 parity
- Out of scope:
  - review rubric 第 9 維 / YAGNI 封頂豁免(WP3,另開)
  - `frontend` Task Profile(WP5,另開)
  - PRD prior-art 觸發與負向 scenario(WP4,另開)
  - handoff/`prepare-handoff.sh` fallback 增強(獨立小刀)
  - `verify-contract.sh` exit_criteria-only 相容承諾的任何變更
  - 重命名跨模板的 Non-goals/Non-scope/Out-of-scope 術語(WP4 canonical-term 決策)
  - 刪除或改寫 advisor/subagent hook 既有行(只允許附加)

## Workflow Inventory

- Source plan: `plans/plan-20260705-1455-contract-intent-boundary.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260705-1455-contract-intent-boundary.review.md`
- Notes file: `tasks/notes/20260705-1455-contract-intent-boundary.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/contracts/20260705-1455-contract-intent-boundary.contract.md
  - tasks/reviews/20260705-1455-contract-intent-boundary.review.md
  - tasks/notes/20260705-1455-contract-intent-boundary.notes.md
  - assets/templates/contract.template.md
  - assets/templates/helpers/plan-to-todo.sh
  - assets/templates/helpers/contract-run.ts
  - scripts/plan-to-todo.sh
  - scripts/contract-run.ts
  - assets/hooks/codex-delegation-advisor.sh
  - assets/hooks/subagent-start-context.sh
  - .ai/hooks/
  - src/cli/mcp/tools.ts
  - AGENTS.md
  - CLAUDE.md
  - tests/
  - docs/researches/20260705-domain-modeling-skill-intake-evaluation.md
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
    - docs/researches/20260705-domain-modeling-skill-intake-evaluation.md
  artifacts_exist:
    - tasks/notes/20260705-1455-contract-intent-boundary.notes.md
  files_contain:
    - path: scripts/contract-run.ts
      pattern: "Execution boundary: implement exactly"
    - path: assets/hooks/codex-delegation-advisor.sh
      pattern: "Execution boundary: implement exactly"
    - path: src/cli/mcp/tools.ts
      pattern: "Execution boundary: implement exactly"
  tests_pass:
    - path: tests/contract-run.test.ts
    - path: tests/helper-scripts.test.ts
    - path: tests/cli/hook.test.ts
  commands_succeed:
    - diff -q scripts/contract-run.ts assets/templates/helpers/contract-run.ts
    - diff -q scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh
    - bash scripts/check-task-workflow.sh --strict
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: 占位 contract 的 file-coupled run 必須 fail-closed 且訊息指名缺 In scope 或 Out of scope;帶 Non-scope 的 plan 投影後 contract `Out of scope:` 非空;advisor 觸發輸出含 execution boundary 條款。
- Edge cases: plan 無 Non-scope 段(維持占位 + advisory,不合成);plan 用 `Out of scope:` 標籤形態;`dry-run`/`preflight` 模式不 fail-closed。
- Regression risks: advisor/subagent hook 文案變動影響 Codex 委派行為(附加不刪行 + hook 測試);plan-to-todo 投影對既有 plan 的兼容(僅新增投影邏輯,不改既有替換)。

## Rollback Point

- Commit / checkpoint: base `95077e1`(`origin/main`)
- Revert strategy: 刪除 branch `codex/contract-intent-boundary` 與 worktree;無資料遷移。
