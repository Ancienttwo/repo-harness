# Plan: Align CLI install/init semantics with codegraph: rename adopt to init

> **Status**: Archived
> **Created**: 20260730-1855
> **Slug**: cli-init-rename
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260730-1855-cli-init-rename.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260730-1855-cli-init-rename.md`; after execution revert branch `codex/cli-init-rename` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260730-1855-cli-init-rename.contract.md`
> **Task Review**: `tasks/reviews/20260730-1855-cli-init-rename.review.md`
> **Implementation Notes**: `tasks/notes/20260730-1855-cli-init-rename.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260730-1855-cli-init-rename.md`
- Sprint contract: `tasks/contracts/20260730-1855-cli-init-rename.contract.md`
- Sprint review: `tasks/reviews/20260730-1855-cli-init-rename.review.md`
- Implementation notes: `tasks/notes/20260730-1855-cli-init-rename.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260730-1855-cli-init-rename.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260730-1855-cli-init-rename.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260730-1855-cli-init-rename.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260730-1855-cli-init-rename.contract.md`
- Review file: `tasks/reviews/20260730-1855-cli-init-rename.review.md`
- Implementation notes file: `tasks/notes/20260730-1855-cli-init-rename.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260730-1855-cli-init-rename.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260730-1855-cli-init-rename.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260730-1855-cli-init-rename.md`; after execution revert branch `codex/cli-init-rename` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260730-1855-cli-init-rename.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260730-1855-cli-init-rename.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260730-1855-cli-init-rename.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260730-1855-cli-init-rename.contract.md`, `tasks/reviews/20260730-1855-cli-init-rename.review.md`, and `tasks/notes/20260730-1855-cli-init-rename.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260730-1855-cli-init-rename.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260730-1855-cli-init-rename.md`; after execution revert branch `codex/cli-init-rename` or the explicitly reviewed diff.

## Captured Planning Output

# CLI 指令面對齊 codegraph 語義:adopt→init 改名 + 移除重複 init

## Context

用戶想確認「adopt 已重構為 init」——調查證實**沒發生過**:實際發生的是 skill 層重構(SSD-06, commit `9a50c194`,`repo-harness-init` skill 併入 `repo-harness-setup` 的 adopt-init mode),CLI 子指令層 `adopt` 仍在,而 `init` 是 `install` 的全域 bootstrap 重複入口(`src/cli/index.ts:344-359`,同走 `runGlobalRuntimeBootstrap`),語義與 codegraph 正好相反(codegraph:`install`=host-level 接 MCP,`init`=repo-local 建索引)。

用戶已選定方向:**對齊 codegraph 語義**——
- `repo-harness install` = 全域/host-level bootstrap(唯一全域入口,不變)
- `repo-harness init` = repo-local adoption(接手 `adopt` 的完整實作與旗標)
- `adopt` 與舊全域 `init` 同一 work-package 內移除,fail-closed,不留 alias

## 關鍵決策(已驗證取捨)

1. **adopt 移除後不留 stub**:直接刪 command,`repo-harness adopt` → commander `unknown command 'adopt'` exit 1。repo 內既有先例:退役旗標就是裸 unknown-option 報錯並有測試鎖定(`tests/cli/adoption-plan.test.ts:500-533`)。redirect stub 會是需要移除觸發器的穩態影子路徑,違反 CLAUDE.md 禁令。
2. **at-rest 與 live 分界**(最重要的坑):下游 repo 磁碟上已存在 `"command": "adopt"` 的 transaction manifest,`src/effects/fs-transaction.ts:820` 硬性拒絕 `command !== "adopt"`(已抽查屬實)。**at-rest 協議字面值凍結保留 `"adopt"`**(`fs-transaction.ts:69,463,820`,加註「protocol-1 凍結,非 CLI 指令名」);**live 輸出跟新動詞走**:`AdoptionPlan.command`→`"init"`、rollback 結果 `command`→`"init rollback"`、新 manifest 內嵌 rollback 指引→`repo-harness init rollback --transaction <path>`。`tests/cli/adoption-plan.test.ts:87` 保留原樣作為 at-rest 凍結的回歸鎖。
3. **registry source**:新寫入用 `"init"`(union 已有此值、零寫入者);`"adopt"` 留在 union 與 `normalizeSource` 作 legacy-read-only(單一 enum 單一路徑、無分支,不算相容層);舊條目在下次 `init` apply 時自癒改寫(`repo-registry.ts:362` 的 `changed` 邏輯)。
4. **`--refresh` 一併刪除**:`index.ts:355` 自述 "Compatibility no-op",隨舊 `init` block 整塊刪,不遷移到 `install`。
5. **`runGlobalRuntimeBootstrap` 去參數化**:刪 `commandName: 'init' | 'install'` 參數,硬編 `'install'`,caller 只剩 `install`(`index.ts:605`)。
6. **檔案改名**:`git mv src/cli/commands/adopt-plan.ts src/cli/commands/adoption-plan.ts`(對齊 `src/core/adoption/` 域名詞);skill 模式 `assets/skills/repo-harness-setup/references/adopt-init.md` → `init.md` 並改路由文字。
7. **`repo.adopt-refresh` check id → `repo.init-refresh`**(`init-hook.ts:264,319`,未持久化)。
8. **輸出前綴改名**:`[adopt-plan]`→`[init-plan]`(`src/core/adoption/render.ts`)、`[adopt]`→`[init]`。

## 實作步驟

### Phase 0 — workflow 立案
先 `repo-harness run capture-plan --artifact-level work-package`(promotion reason: `merge_boundary`),讓 `check-task-workflow --strict` 有 artifact 可綁。

### Phase 1 — CLI 重佈線(`src/cli/index.ts`)
- 刪 `:344-359` 全域 `init` block(含 `--refresh`);`SUBCOMMANDS`(`:72-93`)刪 `'adopt'`、`'init'` 名稱保留重用。
- `:444-545` `.command('adopt')`→`.command('init')`,旗標與 rollback positional 逐字不動;`assertX(...,'adopt')` 與錯誤訊息中的指令名→`'init'`;log 前綴 `[adopt]`→`[init]`。
- `update` 的 deprecated 旗標 help(`:378-380`)與報錯導向(`:409`)→ `repo-harness init ...`。
- `runGlobalRuntimeBootstrap` 簽名清理(決策 5);import `./commands/adoption-plan`(`:60`)。
- 註冊順序調整為 `install`(host)→`init`(repo)→`update`。

### Phase 2 — 支援模組
- `adoption-plan.ts`(改名後):live `command:"adopt"`→`"init"`、`[adopt]`→`[init]`、`:151` source→`"init"`。
- `src/core/adoption/{render,plan,operations}.ts`:前綴與 live command 字面值/型別→init。
- `src/effects/fs-transaction.ts`:照決策 2 的 at-rest/live 分表改,`:69` 上方加凍結註解。
- `src/effects/repo-registry.ts:6,88`:`"adopt"` 註記 legacy-read-only。
- `src/cli/commands/init.ts`:檔頭與 docstring、handoff reason `repo-harness-adopt-verify`→`repo-harness-init-verify`(`:775,783`);`runInit` 函式名不動(改完後名實相符)。
- `src/cli/commands/init-hook.ts`(check id、emitted command `:317`)、`migrate.ts:11`、`src/cli/mcp/setup.ts:239`、`src/core/skill-surface/catalog.ts:696,709`。

### Phase 3 — 測試(與 1-2 同 commit)
- 11 個測試檔機械替換:`tests/cli/{init,adoption-plan,init-hook,global-runtime-init,mcp-tools}.test.ts`、`tests/{readme-dx,action-command-skills,harness-benchmark-matrix,run-skill-evals}.test.ts`、`tests/skill-surface/{catalog,canonical-packages}.test.ts`。
- **`tests/readme-dx.test.ts:74` 反向斷言要刻意翻正**(`not.toContain("repo-harness init --dry-run")` 改成正向),`:68` 計數斷言與 `:70,72` 一併核對(已抽查屬實)。
- `global-runtime-init.test.ts:716-730` 改指向 `install --help`、刪 `--refresh` 期望。
- `adoption-plan.test.ts:87` **保留**,加註 at-rest 協議鎖。
- 新增:`adopt` → exit 1 + `unknown command` 測試;registry 讀入 `source:"adopt"` fixture 不報錯不丟失的測試。

### Phase 4 — scripts 與 helper mirror
- `scripts/check-ci.sh:76`、`check-tarball-install-smoke.sh:169-179`(live JSON 斷言翻成 `"init"`)、`run-harness-profile-benchmark.ts:730`、`run-skill-evals.ts:81,591-606`、`scripts/{CLAUDE,AGENTS}.md:28`。
- **`scripts/verify-contract.sh:517` 不可裸換詞**:裸 `init` 會誤傷 `git init`/`npm init`/`codegraph init`,要用錨定 CLI 的 pattern(如 `(^|[[:space:]])(repo-harness|index\.ts)[[:space:]]+init([[:space:]]|$)`)並沿用 `--dry-run` 豁免;改完跑 `bun run sync:helpers` 重生 `assets/templates/helpers/verify-contract.sh`。

### Phase 5 — 文件、contract、assets
- 根 `CLAUDE.md`+`AGENTS.md`、`scripts/CLAUDE.md`+`scripts/AGENTS.md` 成對同改(Required Checks 的 `adopt --repo . --dry-run` → `init ...`),改完 `diff` 驗證。
- 5 個 README:所有 `repo-harness adopt`→`repo-harness init`;`README.md:473` 收斂成單一 `init`(順帶修掉文件漂移);`:369/:725` adopt vs scaffold 改寫。
- `install.sh:97`、`install.ps1:70`(bun test 覆蓋不到,別漏)。
- `.ai/context/capabilities.json:24,51,89`。
- `docs/architecture/**`(root-router、action-commands、adoption、3 個 domain、4 個 module 檔);`docs/reference-configs/` 與 `assets/reference-configs/` 鏡像對成對改(`harness-overview.md` 刻意分歧,各改各的)。
- skill assets + `adopt-init.md`→`init.md` 改名連動(`repo-harness-setup/SKILL.md:20`、plan/product references、`skill-commands/manifest.json:351`)。
- `agents/fleet/harness-evaluator.md:12` 改後重新投影 `.claude/agents/` 與 `.codex/agents/` 兩份 committed 副本。
- `evals/evals.json` grader pattern(`:318,547,699,740`)與 prose。
- `docs/CHANGELOG.md` `[Unreleased]` 加 BREAKING 條目(adopt 移除、init 語義、`--refresh` 移除、舊 manifest 仍可用 `init rollback` 回滾)。
- `git mv tasks/notes/init-update-cli-semantics.notes.md tasks/archive/notes/`(內容已過時,歸檔不改寫)。
- `assets/workflow-contract.v1.json` 與 `.ai/harness/workflow-contract.json` **零 adopt 指令引用,不動**;結束時 diff 確認仍 byte-identical。

## 驗證

```bash
bun run check:type                                   # 改名/型別字面值全解析
bun test                                             # 全回歸;:87 證 at-rest 凍結;readme-dx 證 5 README 同步
bun src/cli/index.ts init --repo . --dry-run         # 新指令通真 planner(也是新 Required Check)
bun src/cli/index.ts adopt --repo . --dry-run; echo $?  # fail-closed:exit 1 unknown command
bun src/cli/index.ts --help && bun src/cli/index.ts install --help  # 語義描述正確、--refresh 消失
bun run check:helpers && bun run check:hooks
bun scripts/inspect-project-state.ts --repo . --format text
repo-harness run check-task-workflow --strict
bash scripts/check-architecture-sync.sh
bash scripts/check-ci.sh                             # 含 tarball smoke:打包後 CLI 露出 init
diff CLAUDE.md AGENTS.md && diff scripts/CLAUDE.md scripts/AGENTS.md
diff assets/workflow-contract.v1.json .ai/harness/workflow-contract.json  # 應仍相同且未被觸碰
rg -w 'adopt' -g '!plans/**' -g '!tasks/**' -g '!docs/researches/**' -g '!deploy/**' -g '!evals/bdd*/**' -g '!evals/skill-routing/**' -g '!docs/CHANGELOG.md'
# ↑ 預期僅剩:fs-transaction.ts(at-rest ×3)、repo-registry.ts(legacy enum ×2)、adoption-plan.test.ts:87;其餘皆漏改
bun run benchmark:skills --eval route-workflow-check # evals.json pattern 改後路由評測仍過
```

## 高風險坑(實作時逐項核對)

1. `tests/readme-dx.test.ts:74` 反向斷言——裸替換會產生自相矛盾的測試。
2. `scripts/verify-contract.sh:517` 裸換詞會 fail-open 或誤傷 `git init` 等;還有投影 mirror 要 sync。
3. `fs-transaction.ts:820` at-rest 字面值改了會弄斷所有既存 repo 的 rollback。
4. `capabilities.json` verification_hints 是 agent 讀的自由文本,漏改等於發給未來 agent 一條已移除指令。
5. `install.sh`/`install.ps1` 在測試覆蓋之外。
6. reference-configs 鏡像只有 2 對有等式測試,其餘 3 對會靜默漂移;`harness-overview.md` 刻意分歧勿「修正」。
7. `harness-evaluator` 三份副本(source + 2 投影)都在 git 裡。
8. `evals/evals.json` 的 `repo-harness adopt.*--apply`(`:699,740`)是既存過時 pattern,順手修正。
9. `SKILL.md` 2044/2048 bytes 逼近上限(`tests/bootstrap-files.test.ts:48`),只做縮短性替換、不加字。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Align CLI install/init semantics with codegraph: rename adopt to init
