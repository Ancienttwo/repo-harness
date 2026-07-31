# Plan: Converge reference-configs projection and simplify low-risk tests

> **Status**: Executing
> **Created**: 20260730-2149
> **Slug**: reference-configs-projection
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260730-2149-reference-configs-projection.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260730-2149-reference-configs-projection.md`; after execution revert branch `codex/reference-configs-projection` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260730-2149-reference-configs-projection.contract.md`
> **Task Review**: `tasks/reviews/20260730-2149-reference-configs-projection.review.md`
> **Implementation Notes**: `tasks/notes/20260730-2149-reference-configs-projection.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260730-2149-reference-configs-projection.md`
- Sprint contract: `tasks/contracts/20260730-2149-reference-configs-projection.contract.md`
- Sprint review: `tasks/reviews/20260730-2149-reference-configs-projection.review.md`
- Implementation notes: `tasks/notes/20260730-2149-reference-configs-projection.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260730-2149-reference-configs-projection.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260730-2149-reference-configs-projection.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260730-2149-reference-configs-projection.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260730-2149-reference-configs-projection.contract.md`
- Review file: `tasks/reviews/20260730-2149-reference-configs-projection.review.md`
- Implementation notes file: `tasks/notes/20260730-2149-reference-configs-projection.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260730-2149-reference-configs-projection.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260730-2149-reference-configs-projection.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260730-2149-reference-configs-projection.md`; after execution revert branch `codex/reference-configs-projection` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260730-2149-reference-configs-projection.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260730-2149-reference-configs-projection.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260730-2149-reference-configs-projection.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260730-2149-reference-configs-projection.contract.md`, `tasks/reviews/20260730-2149-reference-configs-projection.review.md`, and `tasks/notes/20260730-2149-reference-configs-projection.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260730-2149-reference-configs-projection.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260730-2149-reference-configs-projection.md`; after execution revert branch `codex/reference-configs-projection` or the explicitly reviewed diff.

## Captured Planning Output

# 收斂 reference-configs 投影 + LOW 風險測試簡化

## Context

測試套件審計(2026-07-30,基於 main@095dcb06)證實:文檔逐字斷言層是純同步稅(readme-dx.test.ts 全歷史 20/20 commit 零攔截記錄),而鏡像等式守衛有真實攔截實證(commit 88a7b6a8 漂移 26 分鐘後被守衛逼回)。根因是投影面裸奔:docs/reference-configs 與 assets/reference-configs 23 對鏡像只有 6 對有散裝等式守衛,harness-overview.md 已分岔 shipped(docs 224 行 vs assets 194 行)。用戶批准:軸 A 投影收斂 + S1–S5 LOW 風險測試簡化,S6/S7(MEDIUM)明確不做。

## 凍結決策

1. **投影方向:assets/reference-configs/ = source,docs/reference-configs/ = byte-identical 生成投影。** 依據:近期實證(88a7b6a8)編輯入口在 assets 側;assets 是隨 `repo-harness init` 裝進下游 repo 的 shipped surface,真相跟著 shipped artifact 走保證下游與 self-host 讀到同一份。docs 側另有 7 個 docs-only 檔(chatgpt-coding-mcp.md、contract-brief-example.md、contract-brief-example-bugfix.md、general-repo-mcp.md、install-profiles.md、loop-engine-cutover-gate.md、loop-engine-nl-decision-table.md)——不屬投影範圍,sync 工具忽略、不刪。
2. **harness-overview.md 裁決:時間性漂移,非刻意分歧。** 證據:docs 側含 canonical FsTransaction / SHA-256 精確匹配 / hook-events.jsonl 遙測 authority / route-registry 11-tuple 等新架構描述;assets 側停在舊語義且含 "compatibility fallbacks" 措辭(與 repo 現行禁令衝突)。處置:**內容取 docs 側現狀,住址歸 assets**——先把 docs 側整檔覆蓋到 assets 側,再由 sync 生成回 docs,兩側歸一。注意:stacked base 上兩側都已被 rename 任務改過 adopt→init 字串,以 base 上的 docs 側為準。
3. **本包 stacked 在 `codex/cli-init-rename` 上**(檔案重疊:readme-dx.test.ts、check-ci.sh、5 對鏡像兩側)。merge 順序必須在 cli-init-rename 之後;merge 前 rebase 到該分支最新 tip。
4. **審計中的行號全部基於 main@095dcb06,在 stacked base 上會漂移——一律以內容定位,行號僅供參考。**
5. **散裝等式測試刪 6 條、補一條統一迴圈**:單一測試遍歷 assets/reference-configs/*.md 對 docs 對應檔做等式(同 tests/helper-scripts.test.ts 的 helper parity 迴圈同型)。理由:bun test 是第一必跑檢查,不能只靠 check-ci 的腳本層守衛;迴圈自動涵蓋 23 對與未來新增,散裝斷言才是稅。

## Phase 1 — sync-reference-configs 工具與 harness-overview 歸一

1. 先讀 `scripts/sync-helper-sources.ts`,新檔 `scripts/sync-reference-configs.ts` 照同一 idiom(--check / --write 兩模式、非零 exit、逐檔列差異)。規則:assets/reference-configs/ 每個 .md 必須在 docs/reference-configs/ 有 byte-identical 副本;--write 由 assets 覆寫 docs;--check 只報不寫;docs-only 檔忽略。
2. `package.json` scripts 加 `check:reference-configs` / `sync:reference-configs`(對齊現有 check:helpers / sync:helpers 命名)。
3. 掛進 `scripts/check-ci.sh` 現有 --check 段(sync-helper-sources --check 旁)。
4. harness-overview 歸一:`cp docs/reference-configs/harness-overview.md assets/reference-configs/harness-overview.md`(決策 2),然後 `bun run check:reference-configs` 必須 23 對全綠。

## Phase 2 — 等式守衛收斂(刪 6 補 1)

新增統一迴圈測試(獨立小檔 `tests/reference-configs-projection.test.ts`),然後刪被取代的散裝等式(以內容定位):

- `tests/readme-dx.test.ts` 兩條 `.toBe()` 鏡像等式(release-deploy.md、external-tooling.md)
- `tests/ux-feature-guardrail.test.ts` 兩條鏡像等式
- `tests/global-working-rules-distribution.test.ts` 的 global-working-rules.md 等式(只刪等式斷言,該檔其餘斷言保留)
- `tests/sprint-backlog.test.ts` 的 sprint-contracts.md 等式(**注意**:同檔的 sprint/prd template 等式不屬 reference-configs,保留)

## Phase 3 — README prose 斷言收斂(S1/S2)

- `tests/readme-dx.test.ts` First-5-Minutes 區:砍 prose 逐字斷言——死斷言(被鄰行完全包含的)、精確出現次數鎖、行銷語逐字釘、以 README 反鎖 CLI stdout 字面值的那組、`not.toContain` 反向陷阱組。**保留**:章節順序結構斷言、localized README 版本號迴圈(從 package.json 推導,自維護)、red-flag scan 段。stacked base 上這些字串已是 init 動詞,以 base 內容決定具體刪哪些行。
- `tests/install-scripts.test.ts`:刪與 readme-dx 字面重複的 README 斷言段;保留 install.sh / install.ps1 本體斷言與 `bash -n` 語法檢查。

## Phase 4 — 機械簡化(S3/S4/S5)

- **S3** `tests/bootstrap-files.test.ts` 去重:同 test 內連寫兩遍的 `operations.deploy_sql`;`create_contract_directories` ×4;`cat > tasks/todos.md`/`tasks/lessons.md`/`not.toContain("docs/TODO.md")` 整組 ×2;`pi_install_reference_configs` ×3;`policy.json`/`context-map.json` ×2。每組留一處。SKILL.md 2048 bytes 上限**保留**,只補一行 rationale 註解(router 常駐載入需精簡)。
- **S4** `tests/skill-surface/retired-names-scan.test.ts`:decode 前跳過二進位(副檔名白名單或 NUL byte 探測,~5 行,砍掉 6 個 PNG 共 3.8s);`RETIRED_NAMES` 硬編清單改由 `assets/skill-commands/manifest.json` 的 `retiredPackages[]` 推導(減去檔內已文件化的例外),連帶刪硬編 `toBe(19)`;**保留** allowlist 防腐段(每條 allowlist 必須仍有命中)。
- **S5** byte-parity 冗餘:先確認 `tests/helper-scripts.test.ts` 的 helper parity 迴圈確實涵蓋以下各條,再刪——`tests/evidence-residue-scan.test.ts`、`tests/evidence-checks-materializer.test.ts`、`tests/evidence-recovery-materializer.test.ts` 各自的單檔等式,以及 `tests/sprint-backlog.test.ts` 裡 sprint-backlog.sh / check-task-workflow.sh / refresh-current-status.sh 的等式。涵蓋不到的一律不刪。

## 明確不做(EXECUTION_BOUNDARY)

- S6(helper-scripts workspace 重構)、S7(CI per-file 隔離模式)——MEDIUM 風險,單獨包。
- 不動 `tests/cli/adoption-plan.test.ts` 的 at-rest 協議鎖、`--help` 斷言、falsifier 測試等 load-bearing 項。
- 不動 5 份 README 正文與任何 reference-configs 內容(harness-overview 歸一除外)。
- 不做方案未列的任何「順手」改動;絕不新增 compatibility 路徑。

## 驗證

```bash
bun run check:reference-configs            # 23 對全綠
bun run check:helpers                      # 沒弄壞既有 sync
bun run check:type
bun test                                   # 全綠(用 > log 2>&1 形式跑,避免管道靜默)
bun test tests/reference-configs-projection.test.ts
bun test tests/skill-surface/retired-names-scan.test.ts   # 計時對比,預期 ~8.3s → ~4.5s
bash scripts/check-ci.sh 的 --check 段(或全量)
```

負向驗證:臨時改壞一對鏡像(不 commit),`check:reference-configs` 與新迴圈測試都必須紅,改回後綠——證明守衛 fail-closed,結果記入 notes。

## 交付

- 分 Phase commit,conventional commits,**不加任何 AI attribution**;每 Phase 完成即 push(early-push 硬要求)。
- notes 檔記 non-obvious 決策(harness-overview 裁決依據、S5 涵蓋關係核對結果、負向驗證輸出)。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Converge reference-configs projection and simplify low-risk tests
