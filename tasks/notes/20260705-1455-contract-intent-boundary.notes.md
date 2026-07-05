# Implementation Notes: contract-intent-boundary

> **Status**: Active
> **Plan**: plans/plan-20260705-1455-contract-intent-boundary.md
> **Contract**: tasks/contracts/20260705-1455-contract-intent-boundary.contract.md
> **Review**: tasks/reviews/20260705-1455-contract-intent-boundary.review.md
> **Last Updated**: 2026-07-05 15:12
> **Lifecycle**: notes

## Design Decisions

- Base 選 `967ba01`(`codex/projection-brief-advisory`,Phase 2 slice 3 tip)而非 main:PR #39–#42 全部未合併,本 plan 依賴 slice 3 的 plan-to-todo advisory preflight 與 Phase 1 的 contract-run 閘;疊上 stack 讓依賴以代碼形式存在於 base。
- Contract brief 由 orchestrator 在派工前填實(dogfood Phase 1 brief 完整性閘),worker 以 contract 為權威 brief、plan Detailed Design 為實作依據。
- exit_criteria 用 `files_contain` 錨定 canonical 句 `"Execution boundary: implement exactly"` 於三個常量源,兼作 parity 的機器檢查。
- `plan_negative_scope_bullets`(plan-to-todo.sh)只認嚴格形態 `Non-scope:` / `Out of scope:`(冒號緊接標籤字,可選前導 `- ` bullet marker),不容忍括號註記(如 `Non-scope(...):`）。理由:risk table 明列「只認列舉的標籤形態,解析不到維持占位,不猜」,括號註記與 `### Non-goals` 同屬未列舉變體,寬容匹配等於局部猜測。副作用:本 plan 自身第 126 行的 `Non-scope(各自獨立成刀,不在本合併單元):` 標籤不會被此 parser 識別(已用手測驗證:嚴格 `Non-scope:`/`Out of scope:` 兩型皆可正確投影,見 tests/helper-scripts.test.ts 新增三案例)。

## Deviations From Plan Or Spec

- Plan 執行前置寫「等 Phase 2 slice 3 合併 main 後開工並 rebase」;實際 slice 3 未合併(stack 排隊中),改為 base 直接疊在 `codex/projection-brief-advisory` 上。依賴實質滿足,合併順序交給 PR 隊列。
- 不執行 `contract-worktree finish`(其 merge_back 目標是 main 的 ff-only,會繞過 stack 的 #39–#42 review 隊列);完成改為 push + PR 目標 `codex/projection-brief-advisory`。
- base moved from `967ba01`(stack tip)to `origin/main` `95077e1` after PRs #39–#42 merged on 2026-07-05——plan 原始前置條件(slice 3 合併 main、rebase)已字面滿足;PR 改為直接指向 main。

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| 等 #39–#42 全部合併 main 再開工 | 拒絕 | 用戶明示開工;stack 疊加即滿足代碼依賴 |
| 我方代為合併 PR 隊列 | 拒絕 | 另一 session/用戶擁有該 review 隊列,非本 contract 授權範圍 |
| 疊 stack + PR 指向 stack parent | 採用 | 依賴滿足、隊列秩序保留、回退面乾淨 |

## Open Questions

- PR #42 若在 review 中被修改,本分支需要 rebase;canonical 句 parity 測試可提早暴露衝突面。
- Adjacent finding(未實作,超出本契約 allowed_paths/scope):`scripts/plan-to-todo.sh` 的 `render_contract_file()` 內嵌 heredoc(`.claude/templates/contract.template.md` 不存在時的 bootstrap fallback)與 `assets/templates/contract.template.md` 已存在既有drift(Completion gate 一行措辭不同,Delegation/Exit Criteria 區塊also有落差),且此 heredoc 未帶本次新增的 `Taste constraints:` 欄位——因為契約的 In-scope 只點名 `assets/templates/contract.template.md` 一個檔案。結果:透過 heredoc bootstrap 新建的 repo 不會有 Taste constraints 欄位,透過既有 `.claude/templates/` 或正常 scaffold 流程建的 repo 才有。是否該讓兩者同步屬於另一個決策,未在本任務範圍內處理。
- Adjacent finding(未實作):本 repo 自身 `.claude/templates/contract.template.md`(已材化的樣板)與 `assets/templates/contract.template.md`(product source)本來就有一行 pre-existing drift(`scripts/verify-sprint.sh` vs `repo-harness run verify-sprint`),與本次改動無關,回退前已存在。

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
