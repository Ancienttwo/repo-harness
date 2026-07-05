# Implementation Notes: intake-trigger-rules

> **Status**: Active
> **Plan**: plans/plan-20260706-0024-intake-trigger-rules.md
> **Contract**: tasks/contracts/20260706-0024-intake-trigger-rules.contract.md
> **Review**: tasks/reviews/20260706-0024-intake-trigger-rules.review.md
> **Last Updated**: 2026-07-06 01:03
> **Lifecycle**: notes

## Design Decisions

- 觸發表 + 負向 scenario 規則 + 五紀律三塊都以新增協議步驟的形式插入 `SKILL.md` 既有編號清單(步驟 5/6/12),不另開新章節;五紀律的 challenge 對象明確指向 `docs/spec.md` 的 `## Canonical Terms`,對齊 research note 的裁決(不引入 CONTEXT.md)。同步發現並修掉一處自相矛盾:舊版 Boundaries 寫「Does not edit `docs/spec.md` or reinterpret repo product truth」,與新增步驟 12「定案術語回寫 `docs/spec.md` `## Canonical Terms`」直接衝突,已收窄為「除了 Canonical Terms 追加行以外不編輯 `docs/spec.md`」。
- PRD 模板真源確認為獨立檔案 `assets/templates/prd.template.md`,`project-init-lib.sh:1058-1059` 只是「存在則複製」,沒有內嵌 fallback heredoc,不觸發契約裡「若真源僅活在 project-init-lib.sh 就 STOP」的條件。四份實際承載內容的檔案(`assets/templates/prd.template.md`、`.claude/templates/prd.template.md`、`scripts/ensure-task-workflow.sh` heredoc、`assets/templates/helpers/ensure-task-workflow.sh` 鏡像)用複製而非手動雙寫達成 byte-parity,已用 `diff -q` 逐對驗證。
- Notes 模板的 ADR 三條件過濾行**沒有**照字面塞進 `## Promotion Candidates` 清單第 4 條——`scripts/verify-sprint.sh` 的 `notes_has_promotion_candidates()` 用精確字串白名單逐行比對該 section,任何非白名單內容(包含新加的過濾說明本身)都會被判為「真候選」,導致往後每個任務的 notes.md 永遠觸發假的 `[Maintenance] Notes list promotion candidates` 提示,等同改變了 `verify-sprint.sh` 既有 check 行為。改為在 `## Promotion Candidates` 前新增獨立小節 `## Promotion Filter`,原本三行 bullet 逐字不動。已抽取該偵測函式邏輯做 runtime 實測:套用新模板渲染出的樣板 notes 在 `has_entry` 判斷下仍是 0,不會誤觸發(見 Open Questions 的裁決說明)。

## Deviations From Plan Or Spec

- Plan/contract 原文「Promotion Candidates 加 ADR 三條件過濾行」字面上是加進該 bullet list 內;實際落地改為在該 list 正上方新增 `## Promotion Filter` 小節。理由:dispatch brief 明確要求「zero new gate…do NOT alter…any check behavior」,而 `scripts/verify-sprint.sh` 不在本契約 `allowed_paths` 內,無法同動其白名單去容納字面加的第 4 行。

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| 字面塞入 `## Promotion Candidates` 第 4 條 bullet | 拒絕 | 會讓 `verify-sprint.sh` 的 `notes_has_promotion_candidates()` 對每個未來任務誤報「有真候選」,改變既有 check 行為 |
| 同時修改 `scripts/verify-sprint.sh` 白名單以容納新行 | 拒絕(本次) | 該檔不在 contract `allowed_paths`,擴大範圍需回頭跟 orchestrator 確認 |
| 新增獨立 `## Promotion Filter` 小節,置於 `## Promotion Candidates` 之前 | 採用 | 語意上仍緊鄰、仍是「promotion 過濾器」,且完全落在 detector 掃描 section 之外,零 check 行為改變(已 runtime 驗證) |

## Open Questions

- 需要 orchestrator 確認:若設計本意就是要求過濾行必須落在 `## Promotion Candidates` bullet list 內部,則同一個改動需要一併更新 `scripts/verify-sprint.sh` 的 `notes_has_promotion_candidates()` 白名單——該檔不在本契約 `allowed_paths`,故本次未動。目前選擇的替代方案(新增 `## Promotion Filter` 小節)功能等價,但檔案結構與 plan 原文字面描述不同。
- Adjacent finding(未實作,超出 allowed_paths):`scripts/lib/project-init-lib.sh` 有第三份 implementation-notes 樣板 heredoc(`PI_TEMPLATE_IMPLEMENTATION_NOTES`,約 L411-445),但它只在 `assets/templates/implementation-notes.template.md` 缺失時才會被當 fallback 寫出(見 L1046-1049:`if [[ -f ... ]]; then cp ...; else printf '%s\n' "$PI_TEMPLATE_IMPLEMENTATION_NOTES" ...; fi`)。正常情況走 `cp` 分支,會自動吃到本次修改;只有下游倉庫遺失 `assets/templates/` 目錄的邊緣情況才會退回舊 heredoc 內容(缺少新增的 `## Promotion Filter` 段)。是否同步這條 fallback heredoc 屬於超出本次 allowed_paths 的另一個決策,未處理。
- `bash scripts/check-task-workflow.sh --strict` 在本 worktree 從一開始(未做任何改動前)就因 `docs/reference-configs/{agentic-development-flow,external-tooling}.md` 與本機 gbrain vault 內容不一致而失敗(`[BrainSync] Entry ... differs from source`),與本次四塊改動的檔案完全無關,也不在 allowed_paths。改動前後此失敗訊號逐字相同,證明不是本次引入的迴歸,但契約 exit_criteria 列出的這條 command 目前無法在此環境乾淨通過,留給 orchestrator 判斷是否需要另外處理或視為已知環境差異記錄。
- 本 worktree 起始時 `node_modules/` 不存在(非本次改動造成);已執行 `bun install`(遵循既有 `bun.lock`,未變更該鎖檔)以便完整跑 `bun test`,記錄以便 orchestrator 知悉此環境步驟。

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
