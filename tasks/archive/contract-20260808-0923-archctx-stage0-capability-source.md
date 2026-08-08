> **Archived**: 2026-08-08 09:23
> **Related Plan**: plans/archive/plan-20260808-0216-archctx-stage0-capability-source.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260808-0923

# Task Contract: archctx-stage0-capability-source

> **Status**: Fulfilled
> **Plan**: plans/plan-20260808-0216-archctx-stage0-capability-source.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-08 02:16
> **Review File**: `tasks/reviews/20260808-0216-archctx-stage0-capability-source.review.md`
> **Notes File**: `tasks/notes/20260808-0216-archctx-stage0-capability-source.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

archctx 側正交付 docs/architecture 機器投影(handoff §3)。repo-harness 側若無 capability_source 抽象,Stage 2 authority cutover 時 7 個 resolver 消費面必須一次性大改,風險不可控。本 WP 先讓讀取面具備 registry|archcontext 雙 source 能力(開關選一、fail-closed),cutover 縮小為翻一個 policy 鍵。跳過或做錯的下游後果:cutover 被迫大爆炸式遷移,或出現 registry/nodes 雙權威並存的靜默分歧。

## Goal

按 `plans/plan-20260808-0216-archctx-stage0-capability-source.md` 落地 R1-R4 四個 slice:

- R1:`archctx-contracts` devDependency pin 0.2.2 → 0.3.0(留 devDependencies,runtime 零 import)。
- R2:`policy.json#context.capability_source`(`registry`|`archcontext`,預設 `registry`)+ capability-resolver archcontext file-source。純映射器(`capabilityRegistryFromArchcontextNodes`、`archcontextIncludeToPrefix`、模板法則函數)寫進 `src/core/capabilities/registry.ts`(fs-free);所有 fs+YAML I/O 只在 `scripts/capability-resolver.ts`(`Bun.YAML` structural accessor,零 npm import);`capability-config` archcontext mode 拒寫;三處 policy 播種同步;fail-closed 條件 S1-S6/N1-N13 全實現(plan 的映射表與清單為準);`sync:helpers` 重生投影。
- R3:`external_tooling.archctx` advisory 條目(播種點全覆蓋)+ `check-agent-tooling.sh` `detectArchctx()` 探測,不進 strictFailures。R2 執行中發現 policy `context` 塊存在第四個播種點 `scripts/ensure-task-workflow.sh:1059`(policy 缺失時兜底寫入,且既有漂移:缺 `capability_config`):R3 一併把該兜底塊與另外三處拉齊(`capability_config` + `capability_source` + `capability_source_rule`),並把跨播種器一致性斷言擴到四處。
- R4:handoff 文檔 §3 回寫四項上游缺口/新約定(placement 可配置化、extensions 慣例、D2 文法、contracts files 配方不一致)。

EXECUTION_BOUNDARY:缺席的需求是禁區,不是改進空間。未列入 plan 的行為、選項、抽象、重構、格式化一律不做;發現 plan 與現實衝突時停下回報,不自行擴權。

## Scope

- In scope: plan R1-R4 列名的檔案改動、投影重生(`bun run sync:helpers --write`)、plan 測試計劃中列名的新增/擴充測試、contract 自身的 notes/review 記錄。
- Out of scope: 10 份基線架構文檔的 marker 分區;entity-summary/verifiedAgainst/pathTemplate 任何消費;capabilities.json 退役或內容變更;hook 熱路徑變更;`export --format archcontext-boundaries-v1` 輸出變更(D9 只加 pinning 測試記錄,不修);authority cutover(預設值翻轉);workflow-contract requiredFiles 變更;版本號 bump 或發佈。
- Taste constraints: 沿既有 registry.ts 診斷碼/resolution 模式與 capability-resolver 錯誤訊息風格;新代碼不引入新抽象層。

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if D2 include 文法無法表達本 repo 10 個已提交 capability 的任一 prefix(見 Falsifier)。

## Falsifier

方向錯誤的證據:本 repo 10 個已提交 capability 的 prefixes 存在無法用 D2 受限文法(`D/**` 目錄 / 無通配符字面檔案)表達的條目,或 registry/archcontext 孿生 fixture 的 resolver 輸出無法達成 byte-equality。最便宜的驗證點:先寫 parity fixture 測試(測試計劃第 1 條),再實現映射器——fixture 蓋不住就是文法設計錯,立即停手回報。

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260808-0216-archctx-stage0-capability-source.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260808-0216-archctx-stage0-capability-source.review.md`
- Notes file: `tasks/notes/20260808-0216-archctx-stage0-capability-source.notes.md`
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
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260808-0216-archctx-stage0-capability-source.contract.md
  - tasks/reviews/20260808-0216-archctx-stage0-capability-source.review.md
  - tasks/notes/20260808-0216-archctx-stage0-capability-source.notes.md
  - package.json
  - bun.lock
  - src/core/capabilities/registry.ts
  - src/core/adoption/standard-plan.ts
  - scripts/capability-resolver.ts
  - scripts/capability-config.ts
  - scripts/check-state-boundaries.ts
  - scripts/check-agent-tooling.sh
  - scripts/lib/project-init-lib.sh
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/capability-resolver.ts
  - assets/templates/helpers/capability-config.ts
  - assets/templates/helpers/check-agent-tooling.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - assets/reference-configs/external-tooling.md
  - docs/reference-configs/external-tooling.md
  - .ai/harness/policy.json
  - docs/researches/20260808-archctx-projection-handoff.md
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
    - tests/capability-archcontext-source.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260808-0216-archctx-stage0-capability-source.notes.md
  tests_pass:
    - path: tests/capability-archcontext-source.test.ts
    - path: tests/capability-resolver.test.ts
    - path: tests/capabilities/registry.test.ts
    - path: tests/capability-archcontext-export.test.ts
    - path: tests/capability-config.test.ts
    - path: tests/check-agent-tooling.test.ts
    - path: tests/create-project-dirs.runtime.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:helpers
    - bun run check:state-boundaries
    - bun scripts/capability-resolver.ts validate --format text
    - bash scripts/check-tarball-install-smoke.sh
```

## Acceptance Notes (Human Review)

- Functional behavior: 預設 `capability_source=registry` 下所有既有行為 byte-identical;archcontext mode 僅在孿生 fixture 測試中行使。
- Edge cases: S1-S6/N1-N13 fail-closed 矩陣;Bun<1.3 升級指引;目錄形字面 include 的 N9 指引訊息。
- Regression risks: 投影重生後 tarball smoke;三處 policy 播種一致性;export bridge 測試在 0.3.0 下不變綠。

## Rollback Point

- Commit / checkpoint: worktree base `d2a5af7d`(branch `codex/archctx-stage0-capability-source`)。
- Revert strategy: 整分支丟棄即回滾;預設 registry 意味主線零行為變更,無資料遷移、無持久狀態。
