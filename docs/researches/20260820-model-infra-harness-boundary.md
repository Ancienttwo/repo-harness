# Model Infra 邊界審視：repo-harness × 《不懂 Model Infra，写不好 Harness》

- 日期：2026-08-20
- 文章來源：Han Cheng（@ashfold）X Article《不懂 Model Infra，写不好 Harness》，2026-07-15，https://x.com/ashfold/status/2077294392059232269 。外層 tweet 只是跳轉連結，正文是內嵌 X Article（article id 2077289347616059392），全文經 syndication 鏡像取回，本文以忠實轉述為據，不逐字引用。
- 觸發物：一份外部評估（GPT 系模型產出，由用戶貼入會話），主張 repo-harness「冷路徑強、熱路徑弱」，並提出三個補層（prompt stack manifest、host capability matrix + cache telemetry、穩定前綴/generation 協議）。該評估自述未讀到文章正文，靠可檢索摘要加供應商文件重建。
- 核實方式：文章全文由瀏覽器/鏡像側代理取回；倉庫事實由 read-only explorer 逐條核到 file:line。

## 一、文章實際說了什麼

與外部評估的轉述有出入處，以下為準。

1. Agent 迴圈是一個反饋環路：拼上下文 → 發請求 → 解析響應 → 執行工具 → 結果拼回 → 下一輪。環路懸在四個硬約束下：cache 存活時間、cache 命中率、history 一致性、解析一致性。
2. KV cache 是三級實體儲存，對應三檔定價：GPU HBM（TTL 約 5 分鐘；H200 約 141GB，扣掉權重後只容得下十幾個活躍用戶的上下文）、CPU DDR（約 1 小時，命中要搬回 GPU）、NVMe/分散式（可達 6 小時以上，恢復延遲最高）。TTL 是承諾上限，實際由容量競爭決定——高峰期可能 2 分鐘就被逐出。跨機複用依賴排程層的 prefix affinity routing，沒有它快取池形同虛設。
3. 破壞前綴的操作清單：動態時間戳/用戶 ID/workspace 路徑寫進 system prompt、按意圖切換 system prompt、tool schema 欄位順序漂移（JSON 庫不保證 key 順序）、thinking 內容重排/轉義、模型升級後 chat template 變化、thinking_effort 這類參數以注入指令文字實作（改參數＝改 token 序列＝快取失效）。DeepSeek 的分層 prefix 只是緩解，且要求 message 邊界與角色穩定。
4. 本地執行時間直接消耗快取視窗：MCP Server 啟動要數秒到十幾秒、工具串行執行、環境掃描，都算在推理性能預算裡；工具跑 6 分鐘，回到引擎那端機器已冷。
5. Parser 是狀態機不是正則。thinking/tool call 標籤一處錯位，錯誤會在後續輪次滾雪球。輸出要分三層互不污染：給用戶看的、回傳模型的、進審計日誌的。
6. 上下文拼裝交給 Provider Adapter 按該模型版本的 chat template 生成請求視圖；不手工拼 model-specific 標籤，不用大寫/emoji 強調指令去疊加特殊 token——模型的困惑不報錯，只會照常生成且越來越偏。
7. 五條工程實踐：穩定前綴（動態內容做成追加式 addon 插在快取前綴之後）、tool call 異步派發（主迴圈不等最慢工具）、fork 不原地修改（compaction/sidechat 從主 transcript fork 出去，只合併決策結果）、歷史只追加（請求視圖從不可變事件鏈確定性生成）、compaction 在 checkpoint 邊界一次壓乾淨（頻繁小幅摘要不可控地損傷語義）。
8. 收尾的因果鏈：對推理引擎的理解深度 → 上下文編譯邏輯 → 前綴穩定性 → 快取命中率 → Harness 品質。
9. 觀測指標四組：快取（cached input 佔比、工具時長與失效的相關性）、一致性（transcript 回放成功率、請求 hash 穩定性、parser 線上/離線一致率）、體驗（TTFT、單輪耗時）、成本（每個成功任務的總 token 成本、compaction 自身成本 vs 節省）。

文章是從推理引擎與自建部署視角寫的（vLLM/SGLang、HBM/DDR/NVMe、affinity routing），論的是物理約束，供應商 API 的 caching 功能只是這些約束的表層投影。

## 二、外部評估的核對結果

事實引用逐條核實：

| 評估的引用 | 結果 | 證據 |
| --- | --- | --- |
| SessionStart 有 1,500-token budget（優先級、去重、強制段壓縮、溢出 fail-closed、content hash） | 屬實 | `src/cli/hook/session-context-budget.ts:5`（`SESSION_CONTEXT_TOKEN_BUDGET = 1_500`）、`:224-269`（fail-closed）、`:271-302`（compaction）、`:339-342`（去重）；證據檔寫入 `.ai/harness/state/session-context-budget.json` |
| GPT-5.6 audit：prompt stack 無單一 owner，child 帶約 8.7k static tokens，EXECUTION_BOUNDARY 重複注入 | 屬實 | `docs/researches/20260716-gpt-5-6-prompt-guidance-harness-audit.md:15,77,114-116`（精確估算 8,692–8,751 tokens；boundary 在受管 child 可出現兩至三次） |
| ~12KB root context + ~1KB capability contract 漸進載入 | 屬實 | `README.md:128-130,152`；`.ai/context/context-map.json`（`char_budget: 1000`/entry） |
| typed hook：event × routeId × matcher → 恰一個 in-process handler | 屬實 | `src/cli/hook/route-registry.ts:52-66` |
| 「cache telemetry 缺失，建議納入 eval」 | 部分失實 | `scripts/run-harness-profile-benchmark.ts:79-83,1034-1094` 已按 run 捕捉 `usage_authority`/`input_tokens`/`cached_input_tokens`/`output_tokens`；Claude 側同時取 `cache_creation_input_tokens` 與 `cache_read_input_tokens`（合併進兩個欄位）。實際缺口只有兩處：read/write 未拆成獨立欄位；捕捉面只在 evals 基準工具，常規 `.ai/harness/runs/` 證據沒有 |
| handoff 只是語義恢復，無計算狀態 | 低估 | `src/effects/evidence/recovery-materializer.ts:521-572` 已輸出 `source_checkpoint_id`、`source_event_ids`、`content_hash`、`materializer_version`——就是文章意義上的 generation identity，缺的只是顯式 retained/omitted authority 清單 |

轉述誤差（評估自己補的內容，非文章觀點）：

- 把文章的 HBM/DDR/NVMe 實體三層讀成了供應商 API 功能層。prompt_cache_key、cache breakpoint、30 分鐘 TTL 這些是評估者從 OpenAI/Anthropic 文件外插的；文章講的是容量競爭下 TTL 不可信、affinity routing 缺席時快取全丟，比 API 文件的承諾更悲觀也更接近實情。
- 漏掉文章第四圈「本地執行時間偷快取視窗」。這一圈恰好是 repo-harness 真正擁有、可直接行動的層（hook 時延），本倉庫已有專門研究（`docs/researches/repo-harness 钩子时延与 LLM 提供商限流归因研究报告.md`）。
- 「SessionStart 注入 timestamp/checkpoint id 破壞快取」在熱路徑上基本不成立：這些欄位 session 內靜態，逐 turn 的前綴快取不受影響；跨 session 本來就是冷啟動（TTL 過期＋host system prompt 變化）。真正逐 turn 的注入（PostToolUse journal 通知等）是 append-only，恰好符合文章的「歷史只追加」。

## 三、判斷

1. 冷/熱路徑框架成立，保留。repo-harness 的定位是 host（Claude Code / Codex）之上的 repo/workflow harness，rendered prompt、cache routing、stream parser 歸宿主所有；這條線由產品定位劃出，把它算成缺陷等於要求換賽道。文章的「Harness」指的是 host 那一層本身——文章作者在寫 Claude Code 的同行，repo-harness 在寫 Claude Code 的用戶側控制面。
2. 評估的三個補層需要重排與裁剪：
   - **Prompt Envelope Manifest 按原樣做會違反本倉庫自己的原則**（one source of truth、projection 必須帶 drift check、不合成權威值）。對不可觀察的 host-rendered prefix 計算 `stable_prefix_hash`，得到的是一個沒有 drift check 的影子表示——評估自己都寫了「不可觀察就明確寫 unobservable」，卻又提議 hash 一個觀察不到的東西。裁剪為：只 hash repo-harness 自己注入的內容（SessionStart payload、SubagentStart context、worker prompt）加 host/model 版本，其餘標 unobservable。
   - **Cache telemetry 屬於擴縫，非新增**：evals 基準已捕捉，補 read/write 拆分與常規 runs 證據面即可。
   - **Host capability matrix** 便宜、誠實、fail-closed，可做，價值是防止未來把「不知道」寫成「已保證」。
3. 評估漏掉的兩個真正對齊文章、且完全 owned 的改進：
   - **子代理 prompt stack 去重（8.7k static tokens）**。20260716 audit 已定位到行級。這是文章「穩定前綴」與 uncached prefill 成本的交點：每次 spawn child 都全額冷付這 8.7k，重複的 boundary 文字既費錢又稀釋指令權威。優先級最高，證據和入口都是現成的。
   - **Per-turn hook 時延預算**。文章第四圈說本地執行時間算在推理性能預算裡；repo-harness 的 PostEdit 輕量 journal + Stop 重活後置，方向本來就對，但「per-turn hook 必須輕」目前是設計慣例，可升級為與 1,500-token budget 同級的顯式預算＋證據。
4. 評分（8.5/7/3、六成）不採用：分數沒有 contract。可驗證的表述是——評估引用的倉庫事實全部屬實或被低估，其對熱路徑歸屬的判斷正確，其改進方案一個現成可做（capability matrix）、一個已存在半成品（telemetry）、一個需要裁剪到 owned 範圍（manifest），另有兩個更高價值的 owned 改進被漏掉（stack 去重、hook 時延預算）。

## 四、候選切片（非承諾，未排程）

1. 子代理 prompt stack 單一 owner + boundary 去重。入口：`docs/researches/20260716-gpt-5-6-prompt-guidance-harness-audit.md` 的 P1 findings；驗證面：child 靜態 token 估算前後對比。
2. 基準 usage 欄位拆出 cache_read / cache_write，保留 `usage_authority` fail-closed 語義。入口：`scripts/run-harness-profile-benchmark.ts:1058-1094`。
3. Host capability matrix 文件化（enforced / observed / unobservable 三態；unobservable 不填猜測值）。
4. handoff Provenance 增加 retained / omitted authority 兩欄。入口：`src/effects/evidence/recovery-materializer.ts:521-572`。

不做清單：完整 Prompt Envelope Manifest（對不可觀察層合成 hash）；把供應商 TTL/定價數字寫死進 policy（文章本身證明這些數字是容量競爭下的軟承諾）；在 hook 層偽造 stream parser 事件（宿主未暴露的層不偽造）。
