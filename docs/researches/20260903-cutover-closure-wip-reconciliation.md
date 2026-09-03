RECOMMENDATION: 選 (b)，只救 A 已驗證的 deterministic scan／projection mechanics 與 schema authority 邊界，在新 Module 1 work-package 中按 B/C 重寫公開 protocol，丟棄其餘過期 wiring 與無關 migration — confidence: HIGH

# Cutover Closure WIP reconciliation

本文是唯讀審計。A 的 worktree 在取證前後均存在，branch/HEAD 固定為 `codex/cutover-closure-gate` / `9cd8290102f90c05ece3044b874e45c59624e50a`；`git rev-list --count 9cd82901..codex/cutover-closure-gate` 為 `0`，所以 A 沒有可 rebase 的 commit。對照 authority 是 B 的新 PRD Module 1 與 C 的 upstream contract；A 只作 implementation evidence，不作新語義 authority。

## 1. A 的 concern 分解

### 1.1 現場基線與系統邊界（P1）

唯讀命令 `git diff --stat` 顯示 A 有 58 個 tracked files、`+792/-864`；`git ls-files --others --exclude-standard` 另有 8 個 untracked files，不只是題述列出的 7 個，還包括 `docs/researches/20260901-archcontext-acceptance-candidate-reconciliation-handoff.md`。plan 是 `Executing`，Task Breakdown 7/8 已勾，最後的驗證與 acceptance preparation 尚未勾（A `plans/plan-20260901-1547-cutover-closure-gate.md:138-147`）。

以下拆成 9 個 concern。數字是整檔 diff footprint；同一檔案可承載多個 concern，因此 cross-cutting 組不可相加。

1. **Cutover Closure 引擎本體：3 個 untracked、1,379 LOC。**
   - `scripts/cutover-closure.ts`（575 LOC）、`assets/templates/helpers/cutover-closure.ts`（575 LOC）、`tests/unit/cutover-closure-gate.test.ts`（229 LOC）；`cmp -s` 為 0，兩份 helper byte-identical。
   - protocol/type 在 A `scripts/cutover-closure.ts:13-57`，parser/validation 在 `:121-211`，candidate/base scan 在 `:242-360`，verification 在 `:478-516`，report emission 在 `:537-570`。

2. **workflow-contract schema/registry：5 tracked、`+102/-0`。**
   - `.ai/harness/workflow-contract.json` `+28`；`assets/workflow-contract.v1.json` `+28`；`scripts/workflow-contract.ts`、`assets/templates/helpers/workflow-contract.ts` 各 `+21`；`tests/workflow-contract.test.ts` `+4`。
   - registry vocabulary/authority 在 A `assets/workflow-contract.v1.json:84-108`，helper registration 在 `:118`；validator 在 A `scripts/workflow-contract.ts:65-73,219-229`。

3. **模板與 plan-to-todo projection：15 tracked、`+194/-217`。**
   - `.claude/templates/{contract,plan}.template.md`、`assets/templates/{contract,plan}.template.md`；`scripts/{capture-plan,ensure-task-workflow,plan-to-todo}.sh` 與三個 `assets/templates/helpers/` mirrors；`scripts/lib/project-init-lib.sh`；`docs/reference-configs/{sprint-contracts.md,contract-brief-example-bugfix.md}`、`assets/reference-configs/sprint-contracts.md`；`docs/spec.md`。
   - `plan-to-todo` 讀 profile、fail-closed 並投影 closure 的路徑在 A `scripts/plan-to-todo.sh:245-257,400-419,607-633,1039-1043`。

4. **verifier/evidence integration：14 tracked、`+396/-15`。**
   - `scripts/{contract-run.ts,check-task-workflow.sh,verify-contract.sh,verify-sprint.sh,acceptance-receipt.ts}` 與五個 packaged mirrors；`src/cli/commands/run.ts`；`tests/{contract-run.test.ts,helper-scripts.test.ts,acceptance-receipt-evidence-fingerprint.test.ts}`。
   - concrete path（P2）是 plan closure → `plan-to-todo` projection → `contract-run` preflight（A `scripts/contract-run.ts:596-610`）→ `verify-contract` 執行 helper、保存 report hash（A `scripts/verify-contract.sh:1488-1511`）→ `verify-sprint` 讀 verdict 並 gate acceptance（A `scripts/verify-sprint.sh:1089-1105,1264,1277-1279`）→ AcceptanceReceipt fingerprint（A `scripts/acceptance-receipt.ts:524-534`）。同步/外部邊界是 Bun child process 與 git read；closure fail 會阻斷後續 gate。

5. **Task Profile loophole：23 tracked、整檔 footprint `+506/-231`。**
   - templates/generators：上述四份 plan/contract templates，`capture-plan`、`ensure-task-workflow`、`plan-to-todo` 及 mirrors，`scripts/lib/project-init-lib.sh`。
   - gates/docs/tests：`contract-run`、`check-task-workflow`、`verify-contract` 及 mirrors；兩份 `sprint-contracts.md`；`tests/contract-run.test.ts`、`tests/helper-scripts.test.ts`、`tests/cli/fleet-offer-acquire.test.ts`、`tests/fleet-acquire-concurrency.test.ts` 與六個 `tests/fixtures/root-cause/*.contract.md`。
   - A 移除 `${profile:-code-change}` fallback 並在缺值時拒絕 projection（A `scripts/plan-to-todo.sh:414-418`）；active contract preflight 也 fail closed（A `scripts/contract-run.ts:567-571`）。這是合理但獨立於 B Module 1 的安全修補。

6. **skill-hooks retirement 與兩個 dogfood deletion：7 tracked、整檔 footprint `+90/-793`。**
   - 刪除 `assets/skill-hooks.json`（`-41`）、`scripts/run-skill-hook.ts`（`-259`）；縮減 `tests/skill-hooks.test.ts`（`+9/-243`）；修改 `scripts/{assemble-template.ts,init-project.sh,plan-to-todo.sh}` 與 `assets/templates/helpers/plan-to-todo.sh`。
   - A plan 明示 dogfood 同時刪 `plan-to-todo` fallback 與 retire skill-hooks（A `plans/plan-20260901-1547-cutover-closure-gate.md:140-147`）。這使 closure work-package 混入 ownership migration，正是其 review blocker 的來源。

7. **ArchContext ownership source 與 generated projections：9 tracked、`+36/-38`。**
   - `.archcontext/model/nodes/capability.runtime-harness.hook-adapters.yaml`；`docs/architecture/.projection-manifest.json`、`changelog.md`、`decisions/index.md`、`index.md`、`modules/runtime-harness/hook-adapters.md`、三份 `diagrams/architecture.*`。
   - 唯一 source-level 變更是移除 `scripts/run-skill-hook.ts` prefix，其餘主要是 generated digest/provenance churn；不得手工搬運。

8. **fixture migration / integration proof：14 tracked、整檔 footprint `+218/-247`。**
   - `tests/acceptance-receipt-evidence-fingerprint.test.ts`、`tests/cli/fleet-offer-acquire.test.ts`、`tests/continuation-conformance.test.ts`、`tests/contract-run.test.ts`、六個 `tests/fixtures/root-cause/*.contract.md`、`tests/fleet-acquire-concurrency.test.ts`、`tests/helper-scripts.test.ts`、`tests/skill-hooks.test.ts`、`tests/workflow-contract.test.ts`。
   - 其中 fleet 兩檔各 `+8/-1` 的診斷訊息改善也不是 closure 核心語義；focused engine tests 才是可救 seed（A `tests/unit/cutover-closure-gate.test.ts:55-229`）。

9. **其他：施工期 workflow artifacts / bookkeeping。**
   - 5 個 untracked artifacts：plan 218 LOC、contract 229 LOC、notes 70 LOC、review 134 LOC、reconciliation handoff 110 LOC，共 761 LOC；另 `tasks/todos.md` 僅 `+1/-1` timestamp。
   - 這些是過期施工狀態與阻塞證據，不是新 plan 可繼承的 product implementation。

## 2. A engine 對 B/C 的語義 reconciliation

B 要求只由 contract kill list 與 candidate file state 作 deterministic judgment，不做 semantic inference、CodeGraph 或 archctx 呼叫（B `plans/prds/20260903-0435-archctx-backed-refactor-mode.prd.md:295-311`）；C 凍結 selector kinds 與 evidence ref（C `/Users/ancienttwo/Projects/arch-context/packages/contracts/src/refactor.ts:64-70,122-126,303-307`）。

| 規格項 | 判定 | Reconciliation 與證據 |
|---|---|---|
| `old_implementation` | 可映射 | A 的 exact anchors、immutable-base `baseOccurrences`、candidate `occurrences` 可作 mechanic（A `scripts/cutover-closure.ts:288-359,478-499`），但 public entry 無 `category`。 |
| `callers` | 可映射 | A 掃 scope 內 literal/symbol occurrences，migration 有 `allowed_callers`（A `:41-48,288-308,500-504`）；caller 並非獨立 inventory/disposition，`allowed_remaining` 還能繞過 reason/expiry。 |
| `fallback` | 缺失 | A types/validator 無 fallback category 或 completeness rule（A `:13-57,148-211`）。 |
| `tests` | 可映射但衝突 | A 用 `tests/` path heuristic 產 `test_disposition_missing`（A `:493-497`），不是 contract 顯式 `tests` entry；B 禁止以本地推斷代替 authority。 |
| `docs_and_projections` | 可映射但衝突 | A 有三個 `projection_groups` 與 drift checks（A `:28,382-411`），但 docs/Markdown 分類仍是 path heuristic（A `:496-497`），且無顯式 category disposition。 |
| `compatibility_expiry` | 可映射但不完整 | A `compatibility_refs` 有 owner/callers/deadline/removal_trigger/tests 並拒絕 expired/unbounded（A `:41-48,181-197,458-475`）；`deadline` 可映 `expiry`，但無必填 `reason`，也不是六類之一。 |
| 六類完整性 | 衝突 | A 只要求 required closure 有 trigger 和至少一個 item（A `:209`）；B 六類缺一即 `refactor_closure_incomplete`（B `:300,307-310`）。 |
| disposition | 衝突 | A=`remove|replace|retain_live|retain_migration`（A `:22,31-40`）；B=`removed|migrated|retained_with_reason|not_applicable`，且 retained 必有 reason+expiry（B `:301,527-536`）。只有 `remove→removed` 可直映；`replace→migrated` 仍缺 replacement existence proof；兩種 retain 均不滿足 B。 |
| selector kinds | 衝突 | A=`literal|symbol|path`（A `:27,167-173`）；B/C=`path|relation|symbol`（B `:302,533-534`；C `refactor.ts:64,122-126`）。A 多 forbidden `literal`、缺 `relation`，也沒讀 C 的 `{kind,selectorId,required}` kill-list shape。 |
| contract kill list | 缺失 | B normal path 首步讀 kill list，無 kill list 走 Scenario 3（B `:165-170,307`）；A 只讀同一 Markdown closure block 的 `items[].anchors`（A `:121-211,537-560`），沒有 `RefactorKillListEntryV1` integration。 |
| 三個閉集錯誤碼 | 衝突 | B 只准 `refactor_closure_residue|refactor_closure_incomplete|refactor_closure_missing`（B `:304,308-310`）。A 暴露至少 17 個 codes，residue 還按 path/dynamic heuristic 分成 5 種（A `:123-210,366-475,483-511`）；應在新 authority 邊界聚合，不保留 dual codes。 |
| Scenario 1 | 可映射但輸出衝突 | A positive fixture 能證明 old anchor 消失並 exit 0（A test `:55-67`）；只回 `status:"pass"`。B 要 `CutoverClosureV1.status:"closed"`、canonical sha256 與直接可用的 evidence ref（B `:151-156`）。 |
| Scenario 2 | 可映射但錯誤衝突 | A residue fixture exit 1（A test `:70-80`），但回 `live_reference_remaining` + `issues[]`；B 要 `refactor_closure_residue` + 非空 `residues[]`（B `:158-163`）。 |
| Scenario 3 / no kill list | 衝突 | A 缺 closure block 一律 `closure_missing`（A `:121-125`），且 `requiresClosure` 不認 `refactor` profile，只認 bugfix/migration 或 closure 自報 trigger（A `:223-239`）。B 要 non-refactor `not_applicable`、refactor profile `refactor_closure_missing`，且不得猜 selector（B `:165-170`）。 |
| versioned JSON | 可映射但 shape 衝突 | A 有 report schema string 與 protocol 1（A `:49-74,537-560`），但 B `CutoverClosureV1` 還要求 `kind/contractPath/contractSha256/headSha/entries/residues/status/closureSha256`（B `:520-549`）。 |
| canonical sha256 | 衝突 | A 算 base/contract/registry/`JSON.stringify(occurrences)`，沒有對 canonical closure payload digest（A `:85-87,549-560`）；`verify-contract` 又 hash pretty report bytes（A `scripts/verify-contract.sh:1496-1505`）。C evidence ref 要 bare 64-hex（C `refactor.ts:592-595`），A `sha256:` prefix 不能直接餵。 |
| `RefactorExecutionEvidenceRefV1` | 缺失 | C 已有 `cutover_closure` kind 與 `{kind,locator,sha256}`（C `refactor.ts:65-70,303-307`）；A 不 import/construct 它，沒有 locator 或 compliant bare digest。 |
| `CUTOVER_CLOSURE_PROTOCOL = 1` | 相同／可 rename | A 值同為 1，但名稱是 `CUTOVER_PROTOCOL`（A `scripts/cutover-closure.ts:13`）；B 名稱與 shape 在 `:305,520-549`。 |
| `policy.refactor.require_cutover_closure` | 缺失且 enforcement 衝突 | A 無 `policy.refactor` reader/knob，直接依 profile/trigger 強制（A `:223-239`）。B 要 Module 1 + policy reader skeleton，落地前保持 `false`（B `:620-632,691-695`）。 |
| 不讀 CodeGraph、不呼叫 archctx | 相同 | A child processes 只有 git `rev-parse/cat-file/grep`（A `:325-359`），candidate scan 只有 fs/path/regex（A `:242-308`）；符合 B `:299,311,695-697`。但 dynamic/docs/tests heuristic 不應繼續作 category authority。 |

可救的最小 mechanics 是 safe relative path、bounded filesystem walk、exact `path|symbol` candidate/base scan、projection parity 與 compatibility deadline validation；relation 的 deterministic check、六類 completeness、public schema、profile/policy routing、三碼閉集、canonical digest 和 evidence-ref output 必須按 B/C 新寫。A 自己已指出 10x 時 registry ownership 與 repeated exact scans先失效（A plan `:129-136`）；新 plan 可保留 v1 的單 evaluator，但不應把 cache/新 abstraction 提前帶入 First Proof Point。

## 3. A review 為何 `Request Changes / fail`

結論：當時 review 明說 implementation coherent，沒有 local closure implementation finding；唯一拒絕原因是 skill-hooks ownership change 觸發的 upstream ArchContext acceptance/reconciliation defect。

- review status/recommendation 是 `Request Changes` / `fail`（A `tasks/reviews/20260901-1547-cutover-closure-gate.review.md:3-10`），同時說 strict architecture sync 尚有兩個 unresolved approved ownership candidates（`:15-18`）。
- closure focused/full evidence 當時全綠：`3660 pass, 2 skip, 0 fail`，helper parity、typecheck、task sync、init dry-run 等也過（`:27-30,47-61`）。這不是 engine test failure。
- 未收斂 finding 是 `d913…`、`c320…` 在 provider post-write `worktreeDigest` reconciliation 後 stale/unresolved，令 `bash scripts/check-architecture-sync.sh` fail（`:96-103,114-121`）。
- notes 的 error path 是 ownership change → `human-action-required` → approved provider write 回 `post-apply-reconciliation-required` → converged re-apply 令 approval signal stale，而且沒有 supported receipt recovery（A `tasks/notes/20260901-1547-cutover-closure-gate.notes.md:26-42`）。唯一 open question 是 provider/acceptance-store 的 signal-bound recovery（`:51-55`）。
- 因此兩個 candidates 未解、acceptance/reconciliation receipts 為零、AcceptanceReceipt fields 仍 pending，不能 merge（review `:68-82`）；review summary 明言 fail `solely` 因 upstream defect（`:131-134`）。plan 第 8 項也仍未完成（A plan `:140-147`）。

這個 finding 對舊 work-package 是真 blocker，但對 B Module 1 不是必然 dependency；只要不攜帶 skill-hooks retirement/architecture projection concern，新 work-package 不需要等待這條 ownership recovery。

## 4. 對 `main@b35fd0a7` 的重放風險

`git diff --name-only 9cd82901..b35fd0a7` 顯示 main range 改過 105 paths；A 的 58 tracked + 8 untracked 共 66 paths，其中 11 paths 相交。8 個 untracked paths 在 `b35fd0a7` 均不存在。核對命令是逐 path 的 `git log --oneline 9cd82901..b35fd0a7 -- <path>`。

| A/main 交集 path | main commits | 風險 |
|---|---|---|
| `scripts/check-task-workflow.sh`、`assets/templates/helpers/check-task-workflow.sh`、`tests/helper-scripts.test.ts` | `a2830db4 fix: close PR 265 post-merge review gaps (#277)` | textual hunk 可套，但語義風險中；新設計必須保留 #277 的 waiver/task-sync gate，再選新的 closure seam。 |
| `docs/architecture/.projection-manifest.json` | `a2830db4`, `b62e6a07`, `9e922e47`, `1022e100`, `b35fd0a7` | A 的 digest/receipt/verifiedAgainst 已過期；patch 不適用，只能由 current authority 重生。 |
| `docs/architecture/changelog.md`、`docs/architecture/decisions/index.md`、`docs/architecture/diagrams/{architecture.likec4,architecture.mmd,architecture.structurizr.json}` | `a2830db4`, `b62e6a07` | generated projections patch 不適用；不得手工三方合併。 |
| `docs/architecture/index.md` | `a2830db4`, `b62e6a07`, `b35fd0a7` | patch 不適用；需從 main 最新模型投影。 |
| `tasks/todos.md` | `a2830db4`, `b62e6a07`, `9e922e47`, `1022e100`, `b35fd0a7` | A 只改舊 timestamp；直接丟棄，由 current workflow state 投影。 |

`git diff --stat 9cd82901..b35fd0a7 -- <11 paths>` 為 `11 files changed, 180 insertions(+), 62 deletions(-)`。額外的 read-only `git -C A diff --binary HEAD | git -C main apply --check --cached -` 只報 8 個 textual failures：7 個 architecture projections 加 `tasks/todos.md`；這不能證明 (c) 安全，因為 B/A public protocol 的衝突是 semantic rewrite，不是 merge conflict。

更根本的風險是 A branch 沒有 commit：所謂「整體 rebase」必須先固化再重放 58-file dirty patch，且會把已知 ownership receipt blocker一併帶上。這不符合 B 只先交付 Module 1 + policy reader skeleton 的 delivery boundary（B PRD `:627-650,691-711`）。

## 5. 決策：選 (b)

### (a) 廢棄 A，按 B 從零寫 Module 1 work-package plan

- **留下：** 只把 B/C 當 authority；A 僅作歷史研究。
- **丟掉：** 575-line engine、229-line focused tests、base/current exact scanner、projection parity、schema authority 邊界與所有 wiring/extras。
- **Phase B 影響：** semantic risk 最低，但重付已驗證 mechanics 成本；gate 與 First Proof Point 重建前，GPT Pro campaign Phase B 前置仍未解除。A review 已記錄相關 mechanics/full suite 曾通過（A review `:27-30,47-61`），全丟沒有相稱收益。

### (b) 只救 A 的 engine + schema concern，重新對齊 B 後納入新 plan（推薦）

- **留下：** `scripts/cutover-closure.ts` 的 safe-path/bounded-walk/base+candidate exact-scan、projection parity、deadline validation、CLI emission mechanics；canonical `assets/workflow-contract.v1.json` → installed projection 的 authority 邊界；`tests/unit/cutover-closure-gate.test.ts` 作 fixture seed。projected helper 必須由新 canonical source 重生，不把舊副本當 authority。
- **重寫且不兼容舊 shape：** 六個 mandatory category entries；B dispositions；`path|relation|symbol`；contract kill-list input；三個閉集 errors；`CutoverClosureV1` 的 `closed/residues/headSha/closureSha256`；bare-digest `{kind:'cutover_closure',locator,sha256}`；`policy.refactor` reader 且 `require_cutover_closure:false`。禁止 dual parser/alias/fallback。
- **丟掉：** A 的 plan-to-todo/templates/verifier wiring、Task Profile loophole、skill-hooks retirement、dogfood deletions、architecture projections、todos 與舊 plan/contract/review/notes。這些若仍有價值，應各自另案，不得成為 Module 1 的隱含需求。
- **Phase B 影響：** 最短解除真正前置。B 明定 Module 1 provider-independent、零 archctx dependency、可立即落地，且是 GPT Pro campaign Phase B 前置與 First Proof Point（B `:295-311,627-650,691-728`）。先完成 gate + policy reader `off` 與 real-history canary，就能解除 closure 前置，不把 campaign 綁在無關 ownership migration。

### (c) A 整體 rebase 後補齊

- **留下：** A 全部 58 tracked + 8 untracked concerns，包括 workflow integration、Task Profile tightening、skill-hooks retirement、dogfood 與 generated projections。
- **丟掉：** 表面沒有；實際仍須淘汰 A 的核心 vocabulary/report shape，形成「保留最大 patch、重寫核心」的最差組合。
- **Phase B 影響：** 最慢。除 8 個確定 textual patch failures外，還要保住 #277 新 gates、重生 architecture projections、清 stale task state、解目前沒有 safe recovery 的 ownership receipt blocker，再證明 B semantics。closure 前置會被無關 migration 綁死，且違反 B `只做 Module 1 + policy reader` 的 handoff（B `:691-711`）。

### P3：為何 (b) 是最小 coherent change

新 public authority 已明確：B 擁有 repo-harness closure semantics，C 擁有 selector/evidence consumer contract；A 只有已驗證 implementation mechanics 可繼承。核心 invariant 是「六類逐類顯式處置，removed selector 在 exact candidate head 真實不存在，產物可被 C 直接 digest-bind」，不是保存 A 的行數或舊 workflow wiring。選 (b) 同時避免 (a) 重做 scanner 的成本與 (c) 的 scope/receipt blocker；在 10x scale 前不引入 cache 或新 abstraction，因 First Proof Point 先驗證 deterministic inventory 是否成立（B `:671,676-678`）。
