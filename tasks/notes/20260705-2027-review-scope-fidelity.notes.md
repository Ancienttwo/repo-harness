# Implementation Notes: review-scope-fidelity

> **Status**: Active
> **Plan**: plans/plan-20260705-2027-review-scope-fidelity.md
> **Contract**: tasks/contracts/20260705-2027-review-scope-fidelity.contract.md
> **Review**: tasks/reviews/20260705-2027-review-scope-fidelity.review.md
> **Last Updated**: 2026-07-05 20:27
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Session Findings (orchestrator, pre-dispatch)

- **前次嘗試(plan-20260705-2000)事故**:worker 完成全部八處編輯與大半驗證後,worktree 與 branch 於 20:23 被平行 session 的 session-stop cleanup 一次性清除(events.jsonl 20:23:11 handoff_refresh/session-stop 與死亡窗口吻合;`bun test hook-runtime` 103 筆 ENOENT assets/hooks 為目錄消失現場)。未 commit 編輯全損,但事故報告保存了逐行編輯清單,本次據以重建。緩解:worker 改為「編輯完成即 commit + push 備份 ref,驗證後 amend + force-with-lease」。
- **Helper runtime 版本偏差(dogfood 缺口)**:投影經全域 CLI(repo-harness 0.8.4,`helper_source: "package"`)執行,不含已合併的 carry-forward;模板檔來自 worktree(新),故 Why/Stop Conditions 存在而 Out of scope 未投影。對 plan 直跑合併後 parser 可正確抽出四條 Non-scope——特性健康,偏差在 runtime 來源;`hook_source: repo` 與 `helper_source: package` 的不對稱使 helper 特性需 republish 才自家 dogfood,是否切 `helper_source: repo` 屬 policy 決策,另開。
- 本 contract 的 Out of scope 由 orchestrator 依 plan Non-scope 手動補投影,並吸收前次 worker 的 scope-boundary 決策(scaffold v1 預設 emitter、reference-configs 鏡像、歷史記錄均列 Out of scope)。
