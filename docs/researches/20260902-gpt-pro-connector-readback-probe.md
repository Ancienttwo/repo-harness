# GPT Pro Connector 讀回探針（Repair Campaign sprint 第 4 行）

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

> **Date**: 2026-09-02
> **Sprint**: `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md` 第 4 行
> **Baseline**: `main@a2830db43f7fffbe0535f5b98674f6c4e5aa4f84`
> **Question**: `oracle_browser` 傳輸能否為 campaign 的 issue authoring 與 main audit 產出可驗證的 GitHub Connector 讀回證據（`connector_evidence: verified`）？

## 結論

1. **`verified`（觀察到 Connector 調用）在 oracle_browser 下拿不到。** oracle 受管讀回只有答案檔、stdout/stderr 日誌與 session meta；`--browser-archive never` 時連 conversation URL 都不輸出。Connector 調用痕跡只存在 ChatGPT 頁面上，CLI 讀回裡沒有。
2. **確定性挑戰只證明抽樣內容一致。** 本地在 exact SHA 上挑選檔案清單與內容片段並比對回答；此次觀察到的命中保留，但「因此讀到了 exact commit」的推論已由 2026-09-07 反例否定。現有 `challenge_verified` 不能單獨滿足 adoption 與 audit 的版本讀取要求；該要求仍未完成，見下方修正。
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

- **PRD Module 5/10、BRC6a/BRC14**：現有 challenge 的樣本匹配結果保留；原 exact-SHA 要求不降標。BRC6a 須補足可驗證版本讀取證據和消費邊界，未補足時不能宣稱 active adoption/fresh audit 通過。Shadow 可以記錄明確未驗證的觀測。
- **sprint 新增一行（transport）**：`browser-consult` 透傳 `--copy-profile` 與 `--browser-chrome-profile`，取代 `--browser-cookie-path` 作為有 profile 綁定時的唯一傳輸；`browser-doctor` 探測 `copyProfile`、`browserChromeProfile` 能力；`BrowserSessionMeta.browser` 記 `transport`。不保留 cookie-path 作為靜默回退。
- **campaign 取消路徑**：取消一次 GPT Pro 派單必須連 detached worker 與拋棄式 Chrome 一起收，並清 ORACLE_HOME_DIR 內的 running session，否則重派同 prompt 會被擋。
- **帳號綁定**：Connector 授權綁在 ChatGPT 帳號上，不是機器上。campaign 授權要記 `chrome_profile_directory`（本機為 `Profile 13`），doctor 的 ready 判定要包含該 profile 的 chatgpt.com session cookie 未過期。

## 2026-09-07 證據邊界修正

只讀反例的 subject 是 `80d7659207d2d7dbb3083fa0a30969651aacb9f3`，對照舊 revision
`0155acb01a6a79c0bf34376c974d6214e27fae38`。按
`src/effects/automation/issue-batch-adoption.ts#challengeAt` 的選取算法，兩者都選到
`agents/engineers/profiles/verification-evals-checks.json`；目錄清單、首行和完整文件 SHA-256
三個答案完全相同。以舊 revision 的三個答案、prompt 提供的新 `base_main_sha` 和
`model_verified: true` 呼叫 `src/core/automation/connector-challenge.ts#verifyConnectorChallenge`，
結果仍是 `connector_evidence: challenge_verified`。此反例未發起真實 provider 呼叫。

重現方法：對兩個固定 SHA 各用 `git ls-tree -rz --full-tree`，按上述函數的 mode/path/extension
條件及 `localeCompare` 排序選檔；用 `git show`、目錄 `git ls-tree` 和文件 SHA-256 生成答案。
以新 SHA 生成 challenge，再把舊 SHA 答案送入 verifier。不要用會移動的 HEAD 作反例身份。

這不需要惡意模型：stale Connector/index 讀舊版本即可產生相同答案；adoption challenge 還
复用 authoring session。Fresh session 不排除 stale index，改抽 diff 檔案也只能提高檢出率：
metadata-only commit、revert 或其他相同內容的 revision 仍不能僅從文件 bytes 區分。

原實驗記錄保留為當時的 transport/內容觀測，不再當作 exact revision 讀取證明。BRC6a
負責凍結威脅模型、可驗證證據來源與 fail-closed 消費邊界；無法提供證據就保留原驗收未滿足。
本次文檔修正沒有修復 runtime，沒有引入新 receipt 名稱，也不以弱化驗收將缺口關閉。

## 2026-09-08 Owner closeout

Owner 明确指示“BRC6a可以关了，已证实可用”。Sprint 因此将 BRC6a 关闭，采用显式 GitHub app 激活后的实际内容读取作为本行完成依据，不再追加能力探针。纠正探针 conversation `6a9f0045-c728-83ea-a489-27796265282a` 的 README 首 8 行、末 4 行及回答中的 blob SHA 与本地固定 canary revision 校验一致；旧未激活调用不能据以判断 Connector 不可用。

完整观察记录保留在 research commit `6cfac409`；本次决定与证据范围见 `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md` 的 BRC6a Owner closeout。关闭任务不是生成 provider-origin resolved-commit receipt；运行时 gate 未改，fresh audit 与版本准入消费由 BRC14 的实现验收继续负责。
