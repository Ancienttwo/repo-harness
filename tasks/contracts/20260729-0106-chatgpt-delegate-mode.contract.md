# Task Contract: chatgpt-delegate-mode

> **Status**: Active
> **Plan**: plans/plan-20260729-0106-chatgpt-delegate-mode.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-29 01:06
> **Review File**: `tasks/reviews/20260729-0106-chatgpt-delegate-mode.review.md`
> **Notes File**: `tasks/notes/20260729-0106-chatgpt-delegate-mode.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

使用者要把「本地 agent 當總負責人、ChatGPT 網頁 GPT-5 Pro 當外部高級工程師」的雙代理協作制度化。現狀是每次手貼大 prompt，沒有倉庫權威協議：打包/密鑰邊界、長跑等待紀律、交付取回保真、獨立驗收鏈都靠臨場發揮。若不落成 repo-owned 協議，會出現平行的全域 shadow skill（雙重權威），且 GPT Pro 交付物（patch 文本）會繞過基線校驗與驗收門禁直接落地。

## Goal

在 `assets/skills/repo-harness-chatgpt/` 新增 `delegate` mode：`SKILL.md` Mode Selection 增加 delegate 路由行與邊界註記，新增 `references/delegate.md` 承載 15 條傳輸無關協議（任務書模板含 EXECUTION_BOUNDARY、sentinel 信封規格含 baseline/bundle SHA-256 + attempt + changed-files + 累積 patch、基線快照規格含 tracked WIP diff 與 untracked 雜湊、隔離 worktree 驗收鏈、2 輪外部修正=升級閾值語義、終局報告格式、delegation 證據目錄規格）加兩條顯式宿主 transport 段（Claude=組合既有 consult/continue mode；Codex=內建瀏覽器 IAB），`.gitignore` 增加 `.ai/harness/chatgpt/delegations/`。零 engine/src 變更。

## Scope

- In scope: `assets/skills/repo-harness-chatgpt/SKILL.md`（router 行 + 邊界註記）、新檔 `assets/skills/repo-harness-chatgpt/references/delegate.md`、`.gitignore` 一行、`repo-harness-gptpro` facade 存在性檢查（存在才加 wording 映射）、本 contract 的 workflow artifacts。
- Out of scope: `src/`、`tests/` 下任何 engine/schema 變更；`BrowserSessionMeta`；MCP 工具面；oracle-mcp 註冊；claude-in-chrome / chrome-devtools / browser-bind；gitleaks 或任何第二套掃描權威；`~/.agents`、`~/.gpt-pro`、`~/.codex/prompts` 等宿主 home 目錄；remote CDP。
- Taste constraints: delegate.md 風格對齊既有 references/*.md（Identity/Protocol/Rules/Failure Modes/Boundaries 節式、命令表、fail-closed 措辭）；router-only 慣例，SKILL.md 只加路由不塞協議。

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if scaffold-parity 或 workflow-contract 測試要求 assets/skills 變更必須伴隨 src/ 側同步（代表「零 engine 變更」前提錯誤，需回 parent 重切）。

## Falsifier

若 Canary A 的附檔 `--dry-run` 顯示 engine 並無密鑰/越界路徑/超大 bundle 的 fail-closed gate（或 gate 不產生可留存證據），則協議第 3 條「engine dry-run gate 為單一掃描權威」前提錯誤，需要 engine slice 而非純 skill 層——最便宜證明點：`repo-harness chatgpt browser-consult --dry-run` 附一個含假密鑰樣式字串的檔案，觀察是否拒絕並留證。

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260729-0106-chatgpt-delegate-mode.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260729-0106-chatgpt-delegate-mode.review.md`
- Notes file: `tasks/notes/20260729-0106-chatgpt-delegate-mode.notes.md`
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
  - assets/skills/repo-harness-chatgpt/
  - tests/skill-surface/chatgpt-package.test.ts
  - .gitignore
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260729-0106-chatgpt-delegate-mode.contract.md
  - tasks/reviews/20260729-0106-chatgpt-delegate-mode.review.md
  - tasks/notes/20260729-0106-chatgpt-delegate-mode.notes.md
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
    - assets/skills/repo-harness-chatgpt/references/delegate.md
    - assets/skills/repo-harness-chatgpt/SKILL.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260729-0106-chatgpt-delegate-mode.notes.md
  tests_pass:
    - path: tests/workflow-contract.test.ts
    - path: tests/scaffold-parity.test.ts
    - path: tests/skill-surface/chatgpt-package.test.ts
  commands_succeed:
    - rg -q "delegate" assets/skills/repo-harness-chatgpt/SKILL.md
    - rg -q "chatgpt/delegations" .gitignore
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior: delegate mode 可被 SKILL.md 路由發現；delegate.md 自足（不讀 Codex 段也能跑 Claude 段，反之亦然）；consult mode 的 planning-only 邊界未被放寬。
- Edge cases: 信封缺終止 sentinel、基線快照不符、2 輪閾值後的三選一、登入/驗證碼交回、Codex IAB bundle 超限=BLOCKED。
- Regression risks: scaffold-parity 對 assets/skills 的投影一致性；SKILL.md 觸發詞改動影響既有 consult/bridge 路由。

## Rollback Point

- Commit / checkpoint: base `142d4ccb`（worktree 起點）
- Revert strategy: 單一 commit revert（僅 SKILL.md router 行 + references/delegate.md 新檔 + .gitignore 一行，無狀態/schema 遷移）
