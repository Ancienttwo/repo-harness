# GPT Pro Connector 讀回探針（Repair Campaign sprint 第 4 行）

> **Date**: 2026-09-02
> **Sprint**: `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md` 第 4 行
> **Baseline**: `main@a2830db43f7fffbe0535f5b98674f6c4e5aa4f84`
> **Question**: `oracle_browser` 傳輸能否為 campaign 的 issue authoring 與 main audit 產出可驗證的 GitHub Connector 讀回證據（`connector_evidence: verified`）？

## 結論

1. **`verified`（觀察到 Connector 調用）在 oracle_browser 下拿不到。** oracle 受管讀回只有答案檔、stdout/stderr 日誌與 session meta；`--browser-archive never` 時連 conversation URL 都不輸出。Connector 調用痕跡只存在 ChatGPT 頁面上，CLI 讀回裡沒有。
2. **可以用確定性挑戰驗證取代。** 本地在 exact SHA 上挑選檔案清單與檔案內容片段，要求模型逐字回報；本地比對。這次探針三段全部逐字元命中，證明模型讀到的是 exact commit，且不依賴模型自述。campaign 的 adoption 與 audit 門檻應改為 `challenge_verified`，`verified` 這個 UI 觀察等級從 v1 移除。
3. **Cookie DB 複製這條傳輸不可靠，`--copy-profile` 可靠。** `--browser-cookie-path`（wrapper 現行做法）三跑一中；`--copy-profile` 加 `--browser-chrome-profile` 兩跑兩中。
4. **attach-running 在 Chrome 136+ 上是死路。** Chrome 152 對預設 user-data 目錄忽略 `--remote-debugging-port`，`DevToolsActivePort` 不生成。
5. **oracle session 是 detached worker。** 殺前台不會殺 worker 與拋棄式 Chrome；同 prompt 重派會被 `A session with the same prompt is already running` 擋下（exit 1），需要 `--force` 或先收乾淨。campaign 的取消與重試路徑必須處理。
6. **模型驗證在 `strategy=current` 下是 `verified=no`。** authoring lane 若要保證 Pro 模型，得帶 `--model` 走 `select` 策略。

## 實驗記錄

| # | 傳輸 | Profile | 結果 |
|--:|---|---|---|
| 1 | wrapper `--browser-cookie-path` | 11 (Jennie) | `No ChatGPT cookies were applied`，登入頁 |
| 2 | 同上 | 11 | cookie 套上，拋棄式 Chrome 視窗在建立對話前被關 |
| 3 | 同上 | 11 | 同 1 |
| 4 | 直呼 oracle `--copy-profile` | 11 (last_used) | 過登入、開始串流；手動中止（該帳號無 Connector） |
| 5 | `--copy-profile --browser-chrome-profile "Profile 13"` | 13 (aimpactagent) | 被 run 4 殘留的 detached worker 擋下，exit 1 |
| 6 | 同 5 加 `--force` | 13 | **成功**，2m03s，↑221 ↓103 tokens |

Profile 11 的 `__Secure-next-auth.session-token` 有效到 2026-11-18，所以 run 1/3 不是登入問題，是 cookie DB 在 Chrome 執行中被讀到鎖住或半截狀態。

### Run 6 探針 prompt

要求模型透過 Connector 讀 `Ancienttwo/repo-harness@a2830db4`，回三段：`connector_calls`、`src/core/external-sources/` 目錄清單、`issue-observation.ts` 第一行原文；Connector 不可用則回 `connector_unavailable`。

### Run 6 回答與本地比對

```text
connector_calls
tool=fetch      repo=Ancienttwo/repo-harness ref_or_sha=a2830db4… path=src/core/external-sources/
tool=fetch_file repo=Ancienttwo/repo-harness ref_or_sha=a2830db4… path=src/core/external-sources/issue-observation.ts
directory_listing
binding.ts / issue-observation.ts / projection.ts        ← 與 git ls-tree 完全一致
first_line
import { createHash, randomUUID } from 'crypto';         ← 與 git show 第一行逐字元一致
```

`connector_calls` 是模型自述，依 `orchestrate.md` 不構成證據；`directory_listing` 與 `first_line` 是本地可獨立驗證的事實，這才是證據。

## 對設計的影響

- **PRD Module 10 / sprint 第 13 行**：audit 門檻從 `connector_evidence == verified` 改為 `challenge_verified`：本地在 `final_main_sha` 上生成 N 個挑戰（隨機檔案的目錄清單、指定行原文、指定檔案 sha256 前綴），模型全部答對才算讀到 exact main。adoption 階段同樣用挑戰而不是 `bundle_only`。
- **sprint 新增一行（transport）**：`browser-consult` 透傳 `--copy-profile` 與 `--browser-chrome-profile`，取代 `--browser-cookie-path` 作為有 profile 綁定時的唯一傳輸；`browser-doctor` 探測 `copyProfile`、`browserChromeProfile` 能力；`BrowserSessionMeta.browser` 記 `transport`。不保留 cookie-path 作為靜默回退。
- **campaign 取消路徑**：取消一次 GPT Pro 派單必須連 detached worker 與拋棄式 Chrome 一起收，並清 ORACLE_HOME_DIR 內的 running session，否則重派同 prompt 會被擋。
- **帳號綁定**：Connector 授權綁在 ChatGPT 帳號上，不是機器上。campaign 授權要記 `chrome_profile_directory`（本機為 `Profile 13`），doctor 的 ready 判定要包含該 profile 的 chatgpt.com session cookie 未過期。
