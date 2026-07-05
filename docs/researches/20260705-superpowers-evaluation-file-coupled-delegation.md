# obra/superpowers 評估與 file-coupled delegation 決策

> Date: 2026-07-05
> Trigger: 使用者問「要不要把 obra/superpowers 整合進 repo-harness」,聚焦 subagent 分派(Claude 好、Codex 差)。
> Method: WebFetch superpowers 原始碼 + 本地架構 map + deep-reasoner ×2 對立雙軌 + Codex peer review + 實測 `scripts/contract-run.ts` / `scripts/verify-contract.sh` / 真實 contract 檔。
> Status: 決策已定;Phase 1 已實作(見末節)。

## 決策(Verdict)

不整合 superpowers 的 skills / plugin。Keep repo-harness 自有引擎,方法論交給 Waza `/think`/`/hunt`/`/check` 與 gstack。只採一個協定改動:把既有 `scripts/contract-run.ts`(file-coupled runner)補齊,讓 contract 檔成為權威執行 brief,`codex exec --json` 以 worker/verifier command 進場,原生 `spawn_agent` 降成可選加速器。目標宿主維持 Claude+Codex(不採 superpowers 的 per-harness reference-file 可移植層)。

## 根因:耦合介質,不是 config 或成熟度

使用者 Codex 已 `multi_agent = true`、`max_depth = 2`,仍「較差」。實測:repo-harness 的 parent↔child 兩個方向都騎在 Codex 原生 message-passing 上——下行 `.ai/hooks/codex-delegation-advisor.sh` 注入「先 call `spawn_agent`」,上行 `.ai/hooks/subagent-return-channel-guard.sh` 管原生 return。於是繼承 Codex 原生編排的弱。Claude 同一條 seam 騎在 Task 工具上,所以好。

superpowers 的真正招數是**用檔案當耦合介質**(task-brief → child → review-package → ledger),原生 spawn 只負責「啟動 process」,對弱編排 by construction 免疫。誠實刻度:換成檔案耦合約 90% 是讓結果與派發品質脫鉤,約 10% 是 worker 指著 contract 當 brief 的實質改善;不會讓 Codex 原生 subagent 本身變好。

## 為何不進口:檔全都在,只缺協定行為

| superpowers | repo-harness 既有物 | 位置 |
|---|---|---|
| `scripts/task-brief` 輸出+消費 | `contract-run.ts` 讀 contract 產 worker-prompt(內嵌整份 contract) | `scripts/contract-run.ts:296` `buildRun` |
| worker/reviewer 執行 | `runChild` spawnSync `workerCommand`/`verifierCommand` | `scripts/contract-run.ts:262` |
| `scripts/review-package` | verifier-prompt(只嵌 exit_criteria)+ `tasks/reviews/*.review.md` + Waza `/check` | — |
| progress ledger | `manifest.json` + Evidence Contract State/progress + workstream `current_slice` | `plan-to-todo.sh:130` |

進口 superpowers 會製造兩套 plan/review/ledger 引擎搶擁有權 + `.superpowers/sdd/progress.md` 與 contract/workstream 雙份狀態,違反本倉 No-Fallback / 單一工作流原則。它也給不了 capability registry / architecture-drift / workstream 這層差異化。

## Codex peer 的關鍵修正(已驗證併入)

初版方向誤把 `codex exec` 塞進 policy 欄位 + hook。Codex peer 指出落點錯:`scripts/contract-run.ts` 已是 file-coupled runner,`codex exec --json` 天然是外部傳入的 `--worker-command`,不需新 engine、不進 hook(`docs/reference-configs/hook-operations.md` 明言 hooks 不啟動長任務)。實測 `scripts/verify-contract.sh:331-353` 只驗 `exit_criteria`、模板 Goal 是佔位——所以「brief 完整性檢查」是硬門檻、不是可選,且不能動 verify-contract 的 exit_criteria-only 相容承諾。

## Phase 1 已實作(本次)

落在 `scripts/contract-run.ts`(+ 產品源鏡像 `assets/templates/helpers/contract-run.ts`,byte 一致):

- 新增 `preflight` 模式 + `runBriefPreflight`:斷言 Goal / Scope / Allowed Paths / Exit Criteria 非佔位、非空、自足;佔位偵測認 `{{...}}` token 與模板佔位句。
- `run` 模式在派發 worker **之前** fail-closed:brief 不完整 → status `fail` / `failure_class: incomplete_brief`,不 dispatch(children 空),不靜默降級。
- `dry-run` 只把 `brief_preflight` 記進 manifest(advisory,不擋),供 WIP 檢視。
- Delegation Contract YAML 新增 `runner: { preferred, fallback, brief_is_authoritative }`,由 `parseDelegation` 消費、流進 manifest。舊無 `runner:` 的 contract 預設 `["subagent"]`,不改語義。
- `codex exec --json` 走文檔化 command path(worker-prompt 由 env `CONTRACT_RUN_PROMPT` 提供),usage 附範例。
- 模板 `assets/templates/contract.template.md` 與 `.claude/templates/contract.template.md` 同步加 runner 區塊。
- `tests/contract-run.test.ts`:fixture 補真實 Goal/Scope + runner;新增 preflight 正/負、run fail-closed 不派 worker、runner metadata 進 manifest 共 4 測試。

驗證:`bun test tests/contract-run.test.ts` 8/8 綠;`tsc --noEmit` 乾淨;preflight 對真實 fulfilled contract exit 0、對佔位模板 exit 1。

## Phase 2(已入 todos,延後)

policy `delegation.preferred_runners` / `fallback_runner`(語義=同一 contract 的 runner 可用性降級、必寫 manifest、不得靜默)+ `codex-delegation-advisor.sh` 瘦身為指向 active contract 的 nudge + 全面同步(policy 由 `ensure-task-workflow.sh` / `project-init-lib.sh` / `assets/templates/helpers/*` / 遷移測試共維護)。`subagent-stop-quality` host-agnostic 化為獨立品質閘,不綁本次。

Slice 3(preflight 接進 `plan-to-todo`)執行時修正了原定的 fail-closed 硬閘設計:`plan-to-todo.sh` 產生的 contract 天生佔位(`render_contract_file` heredoc 預設 Goal = "Describe the exact outcome this task must deliver.",Scope 空 bullets),投影後 `maybe_start_contract_worktree` 又可能立即交給新 worktree,若在投影時 fail-closed 會擋死每次正常投影。改為投影時只印 `[BriefPreflight]` advisory、不擋 exit code;fail-closed 閘維持在 Phase 1 的 `contract-run.ts run`(`failure_class: incomplete_brief`)不變。

## 最脆弱假設

contract 必須是「乾淨-context runner 可完成 slice」的自足 brief。Phase 1 的 preflight 硬門檻承接了它;`codex exec` fallback 可能與原生 spawn 共享 sandbox 失敗(detached HEAD、不能 branch/push),需在 manifest 記錄失敗而非靜默。
