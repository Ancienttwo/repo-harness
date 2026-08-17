# Anthropic 如何使用 Claude Code：規模化的 Agentic 軟體工程

- 來源：NDC Conferences,《How Anthropic uses Claude Code: Agentic Software Engineering at Scale》
- 講者：Daisy Hollman（Anthropic，Claude Code 團隊，負責 plugins / agent teams 設計與實作；曾任 C++ 標準委員會成員近十年）
- 影片：https://www.youtube.com/watch?v=shZgedW15vg
- 上傳日期：2026-08-11，時長約 1:00:25
- 本文為講者原話的結構化摘要與改寫，非逐字稿

## 一、核心論點

講者的主線論點：**如果 Claude 做不到你能做的所有事，它就無法真正和你一起完成工作。**

工具呼叫（tool call）出來後，agent 之所以成立，是因為模型被賦予了程式設計師能做的操作——shell 指令、檔案編輯、CI 相關工具、執行/編譯程式碼。但「programmer」與「software engineer」是兩件事：真正的軟體工程決策很少發生在原始碼裡，而是發生在團隊聊天、CI 結果、production dashboard、內部文件裡。如果一個人做不到「一整天只待在終端機裡完成所有工作」，那 Claude 也做不到替他完成所有工作。

## 二、從 chatbot 到 agent 的演化

早期 LLM 互動是純粹的人機輪流對話。2024 年出現 tool calling，模型可以請求電腦執行動作、取得結果、再做決策。工具呼叫數量從 0 到 1 到多次疊加，累積到一定的自主程度後，業界開始稱之為「agent」。講者認為與其糾結「什麼才算 agent」的定義之爭，不如把它理解成一個連續的量變過程。

Coding agent（Claude Code、Codex、Cursor 等）的本質，是把「程式設計師能做的操作」封裝成工具給模型用。

工具呼叫的機制本身極其原始：模型輸出一段 JSON，harness 執行對應動作，再把結果塞回 context window。編輯工具（edit tool）是其中最關鍵的一環，本質上是逐位元組比對的 find-and-replace，沒有游標、沒有選取、沒有模糊比對。講者提到，模型在生成這類精確字串操作時已經很少出錯，上一次見到 string-replace 失敗大約是 2025 年 2-4 月，此後模型能力已顯著跨過這個門檻。

講者引用 METR（一個 AI 研究機構）的圖表：模型能以 50% 成功率完成的任務時間跨度，大約每四個月翻倍（俗稱 agentic 領域的摩爾定律），2022 到 2026 年間趨勢相對穩定，雖然近期因為誤差範圍過大已難以繼續量化。另一個實證案例是 Mozilla 基金會四月份用最新模型修復的安全性漏洞數量，超過此前 15 個月的總和。

## 三、為什麼必須客製化（customization）

如果朝向所謂 AGI 發展，理論上不需要額外指示模型。但講者提出三個現實限制：

1. **存取權（access）**：模型預設只看得到一個 repo 加一個 shell，出於安全理由不能跨出啟動資料夾。這對 zero-to-one 的原型專案影響不大，但對大規模軟體工程是明顯瓶頸，因為多數工程決策不活在原始碼裡。
2. **知識（knowledge）**：codebase 慣例、團隊的 institutional memory、上週才發生的變更、內部 API 與詞彙，這些東西即使有「完美訓練」的模型也無法內建，因為不同公司做法各異，且部分資訊本質上是私有、即時的。
3. **工具（tooling）**：目前 agentic 工具還停留在很原始的階段。講者用 Unix 的 `ed`（比 `vi` 更原始的行編輯器）類比目前的工具能力，並指出「給 agent 的 IDE」還沒有人做出來。他提出的做法是用 post-tool-use hook，在工具呼叫結果裡即時附加型別檢查、lint 等回饋，相當於給模型「即時的紅色波浪底線」，讓錯誤在發生當下被糾正，而不是等到後面才重新推理。

講者強調，讓 agent 變聰明的關鵽往往不是換更強的模型，而是收緊回饋迴圈（tighter feedback loop）。他也區分了兩類工具：一類彌補智能不足（限制能做的事），一類隨智能提升而擴展（給予提示但保留判斷空間）；長期應該投資後者。

「Customization」在 in-context learning 的角度上其實就是「寫文字檔」：模型權重在發布後就凍結，幾乎所有客製化都發生在文字空間（text space），這對工程師來說是天然優勢——不需要懂權重或數學，只需要懂得如何組織文字。

## 四、Context window 是一個「箱子」

過去一年模型能力躍進，但 context window 大小成長有限：第一批百萬 token context window 出現在 2024 年底，2025 年初 frontier 模型就已是百萬 token 等級，目前仍大致停留在這個量級。這意味著任務越複雜，越需要精細地決定「什麼該放進這個箱子」。

講者用「在 Arduino 上跑 npm」比喻這個限制：一般套件管理器遇到依賴衝突可以同時引入兩個版本來解決，但 context 客製化沒有這種空間，必須智慧地取捨、只放真正相關的資訊——也就是「不用的東西不用付費」（zero overhead principle）。

另一個常被忽略的限制是 **KV cache**：只要前面的 token 序列與上一次相同，下一個 token 的預測成本就會低得多；一旦序列被打斷（例如像早期 Cursor rules 那樣動態換入換出規則），預測成本可能暴增十倍。因此 context 客製化不只是 LRU cache 式的「換入換出最相關資訊」這麼簡單，還要考慮快取穩定性。

## 五、Plugin 的四種抽象與它們的可擴展性（Does it scale?）

講者以「丟進一個上億行程式碼的 monorepo，或 5000 個各自需要客製化知識的 repo，會發生什麼事」作為評判標準，逐一檢視四種 plugin 原語：

### 1. MCP（Model Context Protocol）
JSON-based、transport-agnostic 的協定，把工具 schema 加進 system prompt。適合需要跨任何 client（含 chatbot）通用、且伺服器端要自行處理身分驗證的場景。但如果你已經有 CLI，通常寫成 skill 比 MCP 更合適，因為你其實只在自家開發環境裡工作，而非任意環境。

**可擴展性差**：每個工具的名稱、描述、schema 都要塞進 system prompt；20 個 MCP server、每個 15 個工具，context window 很快就被工具描述塞滿。團隊近期推出 tool search：先只載入工具名稱，讓模型再自行搜尋工具，但搜尋效果高度依賴工具命名/描述是否夠有辨識度，仍非免費午餐。結論：**不掛 tool search 完全不可擴展，掛了也只是好一點**。

### 2. Skills
本質是「資料夾 + Markdown」，帶有 front matter 的 description 欄位。可以理解成「惰性載入的 system prompt」：描述常駐 system prompt，內文（body）只有被判斷相關時才展開，形成 pay-per-use 的成本模型。

**可擴展性中等**：body 部分確實省了 token，但 description 是常駐成本——上萬個 skill 就會把 description 塞滿整個 context window。目前 skills 也還沒有階層（hierarchy）機制（講者提到團隊正在開發）。

### 3. Sub agents
給模型一段簡短描述放進 system prompt，但展開內容進到獨立的子 context window，只把摘要回傳給主 context。因此比起 skills，sub agents 對主 context 的長期佔用更少，但在超大規模 monorepo（成千上萬個 sub agent）情境下，描述字串本身還是會吃掉大量 context。**Skills 是 in-context，sub agents 是 out-of-context**，這是兩者的根本差異。

### 4. Hooks
講者認為這是四者中「真正可擴展」的抽象，因為它預設不佔用任何 context，除非被判定相關才注入內容。Hook 綁定在特定事件（工具呼叫、使用者送出 prompt、模型停止、context compact 等），觸發時執行腳本，依協定輸出決定是否要把內容塞進 context。即使你在 Rust 專案裡掛了 10 個 JavaScript 相關的 skill，hook 的做法是「跑一下腳本、發現不相關、立刻退出」，付出的只是可忽略的運算資源，而非 context 空間。

### 不推薦的抽象
- **CLAUDE.md 式的無條件全量注入**：任何 plugin 只要無條件在每個 session 開頭塞入大段文字，就違反「不用的東西不用付費」原則——同時活躍的 plugin 數量會被壓縮到 5-10 個左右。講者建議如果真的要做，寧可寫成 session-start hook，至少讓成本顯性化。
- **Memory（模型自行維護的記憶）**：本質也是文字檔，但因為是模型自主寫入/讀取，講者認為它不屬於「可持續、可複用的 context engineering 原語」，應與 plugin 分開看待，即使外觀上很像 skill。

## 六、Claude Code 團隊自己的用法與 2026 走向

- **並行 session / worktree**：把每個 session 放在獨立 git worktree，避免互踩。搭配 `/rename`、`/color` 為每個 session 命名、上色，利用人類對顏色比對文字更快的認知特性做快速上下文切換。講者自己的長駐 agent 已經從 A-F 擴展到 A-Z，每個 agent 有固定身分與長期記憶，各自維護自己的 scratch 檔案。
- **Agent teams**：讓多個 Claude session 互相傳訊（send message 工具），可以是 leader-teammate 模式，也可以是對等 peer 模式，並可控制資訊是否互相分享。團隊正朝「跨機器、跨 session 互通」方向推進。
- **/loop（俗稱 babysitting）**：讓模型排程自己定時檢查（例如每 10 分鐘一次），可自行判斷何時停止，用來解決「模型在任務還沒做完前就『睡著』」的問題。
- **Auto mode**：透過多層安全分類器判斷指令風險，在使用者未明確授權的高風險動作上自動攔阻，是支撐 `/loop`、agent teams、整夜跑批的基礎設施；成本比一般模式高約 10%-40%。
- **Claude Agents / Fleet View**：把多個 session 集中在一個介面，用輕量分類模型即時摘要各 session 狀態，可直接跳轉，取代同時開一堆分頁的做法。團隊有成員用它一週內合併約一千個 PR。
- **Remote control**：可在雲端持續跑長駐 agent，並透過手機、桌面版隨時介入互動。

講者的總結性判斷：**2025 年的重點是「如何把資訊餵進模型」，2026 年的重點會轉向「如何把模型產出的資訊快速交還給使用者」**——隨模型能力提升，使用者輸入品質對結果的影響會遞減，真正的瓶頸會變成人類能多快在多個並行 agent 之間切換注意力並吸收回饋。

## 七、講者收尾的三個建議

1. 給模型你自己擁有的存取權——它做不到你能做的所有事，就無法真正替你完成工作。
2. 把 context window 當成一個有限的箱子，仔細思考放進去的東西如何影響輸出品質。
3. 選擇能隨規模擴展的抽象（優先 hooks、其次謹慎使用 skills/sub agents），而不是圖方便的無條件全量注入。
