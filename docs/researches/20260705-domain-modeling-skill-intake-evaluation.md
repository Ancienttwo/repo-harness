# Domain-modeling skill 對 intake 硬化(WP4)的評估

> **Date**: 2026-07-05
> **Source**: `mattpocock/skills` @ `main`, `skills/engineering/domain-modeling/SKILL.md`(fetched 2026-07-05 via raw.githubusercontent.com)
> **Trigger**: 意圖失真分析(2026-07-05 三路研究)後、`plans/plan-20260705-1455-contract-intent-boundary.md` 開工前的參考檢查
> **Status**: evaluated — 落點在未來 WP4(intake 觸發規則),對 contract-intent-boundary plan 零改動

## Skill 內容摘要

型別層 domain modeling 不在其中;它是 ubiquitous-language 會話紀律:

1. **Challenge against the glossary**:用語與 `CONTEXT.md` 已定義衝突時當場對質(「glossary 說 X 是 A,你現在的意思是 B——哪個對?」)。
2. **Sharpen fuzzy language**:模糊/過載詞當場提議 canonical term(例:account 是 Customer 還是 User)。
3. **Discuss concrete scenarios**:發明邊界場景壓力測試概念關係,逼出精確度。
4. **Cross-reference with code**:陳述的領域行為拿代碼對質(「代碼做 X,你描述 Y——哪個是現實?」)。
5. **Update CONTEXT.md inline**:術語定案即寫,glossary-only,不放實作細節。

檔案慣例:單 context 用根 `CONTEXT.md` + `docs/adr/`;多 context 用 `CONTEXT-MAP.md` 指向各 context 目錄。lazily 建檔。

ADR 三條件(全中才寫):難逆轉 × 無上下文會令人意外 × 真實 trade-off。

## 對 repo-harness 的裁決

### 吸收(進 WP4 planning)
- **五條紀律折進 `discover` / `repo-harness-prd` 協議步驟**:PRD 產出前的挑戰協議是「用戶描述不清」的正面解法,與既有 `[UNKNOWN]` 標記、`Known Unknowns` 段互補(它們記錄「沒想清楚」,challenge 紀律負責把它們磨清楚)。
- **Glossary 落點:`docs/spec.md` 加「Canonical Terms」段**。documentation profile 是 minimal-agentic,不引進新檔案類型;spec.md 已是 stable product truth 的家。
- **ADR 三條件用作 promotion 過濾器**:套在 notes → `tasks/lessons.md` / `docs/architecture/` 的既有 promotion 判斷上,收緊「什麼值得升格為 durable」。

### 不採納
- **不建 `docs/adr/`**:plans(trade-off 表)+ tasks/notes + architecture requests/modules 已覆蓋 decision-record 職能,新目錄是第二副本。
- **不引進 `CONTEXT-MAP.md`**:`.ai/context/capabilities.json` + capability contract 已是 context map。
- **不整份安裝為 repo 管理面 skill**:repo 側以 WP4 折入為準;個人自由 skill 層可選裝,避免兩套競爭協議。

### 順帶發現:harness 自身術語漂移
同一「負向邊界」概念:PRD `Non-goals` / sprint `Non-goals` / plan `Non-scope` / contract `Out of scope`。contract-intent-boundary plan 以 whitelist 解析緩解(只認列舉標籤形態,解析不到維持占位);是否統一命名是 WP4 的 canonical-term 決策,不值得為此做跨模板 rename 的 parser churn(該 plan Trade-offs 已拒絕)。

## 與 contract-intent-boundary plan 的關係

零 scope/設計改動。skill 反向驗證其方向:contract 即任務級 glossary,advisor 的「Do not re-derive scope from this conversation」同構於「challenge against the glossary」。
