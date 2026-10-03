# Handoff：Oracle 升級、herdr pin、architecture projection 超時（2026-09-09）

給外部分析者（GPT）的獨立上下文。所有事實都來自本輪實際命令輸出；標「未驗證」的是推論。

## 1. 背景

repo-harness（`/Users/ancienttwo/Projects/repo-harness`，GitHub `Ancienttwo/repo-harness`）用 `@steipete/oracle` 驅動 ChatGPT Web 瀏覽器 consult（GPT Pro 路徑）。`src/cli/chatgpt-browser/oracle-provider.ts` 以 `REQUIRED_ORACLE_VERSION` 做 exact-match pin，`chatgpt browser-doctor` 負責就緒檢查。

起點問題：「oracle 版本與最新版本差多少，是否需要更新依賴」。

## 2. 本輪落地（全部已合入 main）

| PR | 內容 | main sha |
|---|---|---|
| #368 | `REQUIRED_ORACLE_VERSION` 0.18.0 → 0.20.0，測試字面值同步，全域 `bun add -g @steipete/oracle@0.20.0` | b4712412 |
| #370 | browser-doctor 新增 dry-run flag 接受探針；缺 fork flag 時 doctor 給 `chatgpt-oracle-select-fork-build` 動作，真實 consult 在 spawn 前拒絕（`ORACLE_RUNTIME_FLAGS_UNSUPPORTED`） | cf5145b2 |
| #376 | herdr 運行時 pin 單一真相來源：`.ai/harness/policy.json#external_tooling.herdr`，CI/tooling 腳本/文件/下游 seed 全是投影，`tests/herdr-runtime-pin.test.ts` 做漂移檢查 | 3a30bd89 |

Oracle fork：
- 上游 `steipete/oracle` 任何版本都沒有 `--write-session`、`--write-network-evidence`、`--write-conversation-evidence`、`--browser-app`。這四個 flag 只在使用者本地 fork（`_ref/oracle` 為 common git dir，worktree `~/Projects/oracle-wt-*`，14 個 commit 線性堆疊在 v0.18.0 上）。
- 已把整條堆疊 rebase 到 upstream v0.20.0：分支 `codex/fork-0.20.0`（tip 9db96a10），push 到 `Ancienttwo/oracle`，本地 clone 在 `~/Projects/oracle`。fork 自己的 Pro power-slider 兩個 commit（749cab6a、26e12021）被上游 `selectDirectEffortSlider` 取代，`thinkingTime.ts` 與 v0.20.0 逐字節相同。
- 真實 Pro consult 驗證通過：`thinkingSelection.verified=true, resolvedLabel=Pro`，模型標籤 `6Pro`（Astra Latest）。
- 穩定路徑：`REPO_HARNESS_ORACLE_BIN=/Users/ancienttwo/Projects/oracle/dist/bin/oracle-cli.js`。`pnpm build` 不設 exec bit，重建後必須 `chmod +x dist/bin/oracle-cli.js`；node 24 的 PATH 要在前。

## 3. 本輪發現的結構性問題

### 3.1 exact pin 釘的是 fork 版本字串，不是上游版本
#368 合入後 main 曾兩頭不通：pin 0.20.0 拒絕 fork（報 0.18.0），上游 0.20.0 又在參數解析就死（`unknown option '--write-session'`）。doctor 只探 `--browser-thinking-time`，fixture 測試與 CI 全綠，都是假陽性。#370 補了探針，但 pin 語義本身（版本字串代表 fork 契約）仍是隱含的。

### 3.2 main 直推的紅燈遮住後續失敗
main 上多個 commit 因 task-sync digest 未綁在 `check:ci` 第一步就停，後面的測試根本沒跑。d8c082b1（tmux → herdr）讓 `tests/claude-review.test.ts` 等在 CI runner 上找不到 `herdr` 二進位，這個回歸直到 #370 分支合進 main 才第一次暴露。平行 Codex 會話後來用 #371 在 CI 裝了釘住的 herdr 0.9.0。

### 3.3 architecture projection 在負載下超時（目前未解，進行中）
- 機制：`.ai/harness/policy.json#architecture.projection_timeout_ms` = 120000；`src/core/architecture/projection.ts:194` 驗證器硬上限 1000..120000；`src/effects/architecture/projection-jobs.ts:13` `RUNNING_STALE_MS = 150_000`（running job 超過此值未更新就視為 abandoned，MAX_ATTEMPTS=3 後進 dead-letter）；Stop hook 帶 host budget，`projection-orchestrator.ts:79` 取 `min(hostDeadline, policy.timeoutMs)`。
- 觀察：archctx 0.5.8 `projection run` 對 9 個路徑的 job 光 check 模式空載就 51 秒；apply 模式在負載 8 到 15（Docker VM 97% CPU、多個 agent 會話）下連續四次 `process timed out after 118xxxms`。目前 pending 的 job 是 68 個路徑（pull 進 #374/#376 後的 main 漂移）。
- 後果：Stop hook 每輪都被 `Strict projection failure gate` 擋住，需要手動 `repo-harness architecture-projection drain --json`。
- 進行中：使用者批准把此 repo 的 timeout 調到 300000。fast-worker 正在做 PR（分支 `codex/projection-timeout`）：驗證器上限升到 600000、`RUNNING_STALE_MS` 改成從 policy timeout 推導加固定餘量、下游 seed 維持 120000。尚未合入。

### 3.4 projection manifest 被過期 job 反向蓋章
卡住的 job 期望 headSha bc2328db（04:36Z 建立時的 main），重試時把本地 `docs/architecture/.projection-manifest.json` 的 `baseHeadSha` 從 tracked 的 e2d876ce 蓋回 bc2328db，擋住 `git pull`。已用 `git checkout --` 還原。這是否算 harness bug（job 的 expected 應在重試時重新解析）未驗證。

## 4. 環境事實

- 機器負載來源：Docker 裡使用者的 Supabase 堆疊（跑 4 天）、Virtualization VM、多個 Claude/Codex 會話（herdr workspace w2/w3 各 4 到 5 個 pane）。
- 本地 oracle fork 舊 worktree（`oracle-wt-brc15a-pro-slider` 等三個，報 0.18.0）仍在，另一個 Codex 會話的 canary 用它；main 新 pin 會拒絕它，已通知。
- `.ai/harness/handoff/brc1415-transfer-20260909.md` 是另一會話的未追蹤檔。

## 5. 想請 GPT 分析的問題

1. **pin 語義**：exact-match 版本字串代表「fork 契約」是否該顯式化？例如 fork 自報 `0.20.0+repo-harness.N` 或 doctor 探 capability 而不探版本。目前 #370 的探針是折衷，值不值得再往前走。
2. **projection 超時**：把 timeout 從 120s 放到 300s 是治標。archctx apply 對 68 路徑要多久才合理？是否應該讓 Stop hook 只入隊不執行、由獨立 drainer 跑；或按路徑數分批；或在負載高時降級成 advisory。哪個改法對「strict gate」語義破壞最小。
3. **main 直推的 digest 紅燈**：每次直推 main 都要人綁 digest，CI 第一步就停，遮住真失敗。是否該讓 main 的 CI 跳過 task-sync digest gate（只在 PR 上跑），或改成 warning。風險是什麼。
4. **fork 維護成本**：三個 fork 分支已合成一條在 v0.20.0 上；下次上游發版還要再 rebase。有沒有把這四個 flag 上游化的路徑，或把 evidence 匯出改成 repo-harness 側從 oracle session 目錄讀取，不依賴 fork。

## 6. 可直接執行的驗證入口

```bash
# oracle
REPO_HARNESS_ORACLE_BIN=/Users/ancienttwo/Projects/oracle/dist/bin/oracle-cli.js \
  bun src/cli/index.ts chatgpt browser-doctor --repo . --provider oracle --json
bun src/cli/index.ts chatgpt browser-doctor --repo . --provider oracle --json   # PATH 上游 0.20.0 → action_required

# herdr pin
bash scripts/check-agent-tooling.sh --host both --json | jq .runtime_capabilities.herdr
bun test tests/herdr-runtime-pin.test.ts

# projection
repo-harness architecture-projection status --json
repo-harness architecture-projection drain --json
ls .ai/harness/architecture-projection/{pending,running,dead-letter}
```

## 7. 補記（#377 合入後）

- #377 已合入 main（d48d2eee）：validator cap 600000、attempt deadline 持久化、receipt 前 ownership 重驗。`policy.json` 仍是 120000，因為全域安裝的 repo-harness 0.18.0 validator 上限仍是 120000（用其模組直接餵 300000 會 throw）。300000 bump 等新 runtime 裝到全域後一行改。
- provider apply 仍未被 ownership 守衛：被回收的 attempt 可能已寫 worktree，只有 receipt 被拒。
- manifest「反向蓋章」第二筆觀察：11:08Z 本地 drain 的 receipt（job-ba2bec8a）status noop、inputSnapshot headSha = baseHeadSha = 3a30bd89，當時 main 就是 3a30bd89；之後 main 移到 cad8c94d 並帶了新 manifest，本地檔看起來就「舊」。這一筆不是過期 job 回寫，是正常 drain 後 main 前進。第一筆（bc2328db）仍未解釋：dead-letter 錯誤訊息裡 request.expected.headSha 是 bc2328db，而該時刻本 checkout 的 HEAD 已遠新於它；GPT 指出 orchestrator 每次 claim 都重新 capture，所以需要查 capture 用的 root 是哪個 checkout、以及該 drain 是哪個進程發起。
