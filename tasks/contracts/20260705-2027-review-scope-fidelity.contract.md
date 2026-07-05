# Task Contract: review-scope-fidelity

> **Status**: Active
> **Plan**: plans/plan-20260705-2027-review-scope-fidelity.md
> **Task Profile**: code-change
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-05 20:27
> **Review File**: `tasks/reviews/20260705-2027-review-scope-fidelity.review.md`
> **Notes File**: `tasks/notes/20260705-2027-review-scope-fidelity.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Reviewer 目前結構上無法 block overreach:rubric 第 8 維(YAGNI)被封頂「never P0/P1 by itself」。WP1+WP2 已讓負向邊界到達 runner;缺這一環,scope 違規在本地 /check 與 Codex external acceptance 兩邊仍然最高只能記非阻斷 P2。做錯的下游後果:豁免句寫鬆會讓 YAGNI 假 blocker 淹沒 review,寫漏版本消費點會讓凍結檢查/測試紅;classify 函數漏放 v2 會讓所有新 review 被判 malformed、整條 review 管線 fail-closed。

## Goal

`src/cli/hook/review-rubric.ts` 加第 9 維「Scope fidelity」(contract In-scope 之外的變更、觸及聲明的 Out-of-scope/Non-Goals、或無授權的 features/options/commentary),並在規則行追加**限定型**升級豁免(此類 violation 可升 P1;一般 minimal-change/YAGNI 封頂不變);rubric 版本 1→2,全倉一致化所有版本/文字消費點(含 `workflow_review_rubric_class` 同時接受 1 與 2、歷史 v1 記錄不改寫);測試斷言注入輸出含第 9 維、版本 2、封頂句與豁免句並存。實作以 plan `## Detailed Design` 與前次 worker 事故報告的八處編輯清單為準。

## Scope

- In scope:
  - `src/cli/hook/review-rubric.ts`:第 9 維 + 豁免補句 + `REVIEW_RUBRIC_VERSION` 2 + 標題 v2
  - `assets/hooks/lib/workflow-state.sh`:`workflow_review_rubric_class` 接受 1 與 2;`workflow_review_freshness_status` 一般化;相鄰註釋
  - `assets/hooks/prompt-guard.sh`:fingerprint 與 external-acceptance 兩個 emitter 的版本字串
  - `bun run sync:hooks` + `bun run check:hooks` 投影 `.ai/hooks/`
  - 測試:`tests/review-rubric.test.ts`(v2 + 第 9 維 + 兩句並存)、`tests/hook-runtime.test.ts`(僅 live-emission 斷言改 v2;fixture 構造的歷史 v1 字面量保留)、`tests/workflow-state-lib.test.ts`(新增 classify 1/2/3/absent 測試)
- Out of scope:
  - `verify-contract.sh`/`verify-sprint.sh` 的 changed-files vs allowed_paths 機器報告餵入 Human Review Card「Intended vs Actual」(獨立後續小刀)
  - Scorecard 維度調整(Product depth 保留)
  - 任何 hook 觸發/路由邏輯變更(只改 rubric 文字與版本)
  - WP4(intake)、WP5(frontend profile)
  - `assets/reference-configs/hook-operations.md` 與 scaffold 預設 `Review Rubric Version: 1` 的 emitter(`ensure-task-workflow.sh:491`、`plan-to-todo.sh:937`、review 模板、helpers)——不在 allowed_paths,classify 已兼容,獨立 follow-up
  - 歷史 `tasks/reviews/*.md`、dated audits、CHANGELOG 的 v1 記錄(歷史事實,不改寫)

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop immediately and report if this worktree or branch disappears mid-task (prior attempt was swept by a parallel session cleanup).

## Workflow Inventory

- Source plan: `plans/plan-20260705-2027-review-scope-fidelity.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260705-2027-review-scope-fidelity.review.md`
- Notes file: `tasks/notes/20260705-2027-review-scope-fidelity.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/contracts/20260705-2027-review-scope-fidelity.contract.md
  - tasks/reviews/20260705-2027-review-scope-fidelity.review.md
  - tasks/notes/20260705-2027-review-scope-fidelity.notes.md
  - src/cli/hook/
  - assets/hooks/
  - .ai/hooks/
  - docs/reference-configs/
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
    - tasks/notes/20260705-2027-review-scope-fidelity.notes.md
  files_contain:
    - path: src/cli/hook/review-rubric.ts
      pattern: "Scope fidelity"
  tests_pass:
    - path: tests/review-rubric.test.ts
    - path: tests/workflow-state-lib.test.ts
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
    - bun run check:hooks
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: hook 注入的 rubric 文字含第 9 維 Scope fidelity;規則行同時保留原封頂句與新豁免句;版本標記 2;`workflow_review_rubric_class` 對 1/2 均分類通過、3 拒絕;歷史 v1 review 記錄照常過 freshness/acceptance 閘。
- Edge cases: fixture 構造的 v1 字面量(hook-runtime 測試 ~145/252/4029 行)保留不動;`rg -uu` 審計覆蓋被 .rgignore 隱藏的面。
- Regression risks: freshness/external-acceptance 閘對 rubric_class 的判斷路徑;快照式 hook 測試。

## Rollback Point

- Commit / checkpoint: base `a409656`(origin/main)
- Revert strategy: 刪除 branch `codex/review-scope-fidelity` 與 worktree;無資料遷移。
