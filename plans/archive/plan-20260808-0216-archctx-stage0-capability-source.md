# Plan: archctx Stage 0: capability_source 开关与 archcontext file-source

> **Status**: Archived
> **Created**: 20260808-0216
> **Slug**: archctx-stage0-capability-source
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: bun test 全量 + sync:helpers/check:helpers + check-state-boundaries + check-tarball-install-smoke + init --dry-run parity + check-task-workflow --strict
> **Rollback Surface**: R1-R4 各自自包含可整體 revert;預設 capability_source=registry,零下游行為變更
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260808-0216-archctx-stage0-capability-source.contract.md`
> **Task Review**: `tasks/reviews/20260808-0216-archctx-stage0-capability-source.review.md`
> **Implementation Notes**: `tasks/notes/20260808-0216-archctx-stage0-capability-source.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260808-0216-archctx-stage0-capability-source.md`
- Sprint contract: `tasks/contracts/20260808-0216-archctx-stage0-capability-source.contract.md`
- Sprint review: `tasks/reviews/20260808-0216-archctx-stage0-capability-source.review.md`
- Implementation notes: `tasks/notes/20260808-0216-archctx-stage0-capability-source.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260808-0216-archctx-stage0-capability-source.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260808-0216-archctx-stage0-capability-source.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260808-0216-archctx-stage0-capability-source.md`.

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
- Contract file: `tasks/contracts/20260808-0216-archctx-stage0-capability-source.contract.md`
- Review file: `tasks/reviews/20260808-0216-archctx-stage0-capability-source.review.md`
- Implementation notes file: `tasks/notes/20260808-0216-archctx-stage0-capability-source.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260808-0216-archctx-stage0-capability-source.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260808-0216-archctx-stage0-capability-source.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: R1-R4 各自自包含可整體 revert;預設 capability_source=registry,零下游行為變更
- **Verification boundary**: bun test 全量 + sync:helpers/check:helpers + check-state-boundaries + check-tarball-install-smoke + init --dry-run parity + check-task-workflow --strict
- **Review/acceptance boundary**: `tasks/reviews/20260808-0216-archctx-stage0-capability-source.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260808-0216-archctx-stage0-capability-source.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260808-0216-archctx-stage0-capability-source.contract.md`, `tasks/reviews/20260808-0216-archctx-stage0-capability-source.review.md`, and `tasks/notes/20260808-0216-archctx-stage0-capability-source.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260808-0216-archctx-stage0-capability-source.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: R1-R4 各自自包含可整體 revert;預設 capability_source=registry,零下游行為變更

## Captured Planning Output

# repo-harness Stage 0:archctx 依賴接入(capability_source 開關 + archcontext file-source)

## Context

archctx 側(平行會話)正交付 handoff §3 的投影能力。repo-harness 側對接前置是 20260705 已批准階梯的 Stage 0:capability 語義讀取面具備 `registry | archcontext` 雙 source 能力(開關選一、fail-closed),為 Stage 2 authority cutover 鋪路。本 WP 只消費上游三個穩定面:`archcontext.node/v1` schema(dev-time)、`.archcontext/model/nodes/*.yaml` 磁盤佈局(上游 7 處硬編碼)、ADR-0043 glob 語義的 2-case 子集。**不消費** verifiedAgainst、entity-summary 輸出、marker、pathTemplate——那些還在你 archctx 側未推送的 worktree 裡。

## 已凍結事實與設計裁決(均有源碼證據,設計代理 D1-D10)

- `archctx-contracts@0.3.0`/`archctx@0.3.0` npm latest;0.3.0 與 0.2.2 在本 repo 消費面 schema **byte-identical** ⇒ R1 純 pin bump 零風險。
- **硬約束**:tarball smoke(`check-tarball-install-smoke.sh:219-253`)把 helper 投影複製進零 node_modules 裸 repo 執行;`sync-helper-sources.ts` 只內聯 `src/core/capabilities/registry.ts` 這一個模組 ⇒ **純映射器必須寫在 registry.ts 內**(fs-free,`check-state-boundaries` 禁 I/O),所有 fs+YAML I/O 留在 `scripts/capability-resolver.ts`。standalone helper 自動獲得完整 archcontext 支持(投影是全文函數,fail-closed-unsupported 反而要新增分歧機器)。
- tsc smoke 用 `--types bun` 從 repo root 跑(D1)⇒ Bun typings 無礙;YAML 用 `Bun.YAML.parse`(Bun 1.3 原生),經 structural accessor `bunYamlParser(host)` 取得,兼作舊 Bun runtime fail-closed 守衛,零 npm import。
- **include 文法(D2,防雙權威分歧)**:上游 glob 是全串 `^…$` 匹配,無通配符字面量=單檔 entrypoint。只接受兩形:`D/**` → prefix `D`;無通配符字面量(且非既存目錄)→ 字面 prefix。其他一律 fail-closed。字面量是既存目錄 → `ARCHCONTEXT_INCLUDE_SHAPE_AMBIGUOUS`(提示寫 `<path>/**`)。
- **`contract_files` 不可推導(D3)**:10 個已提交 capability 有 6 個與 `targetContractFiles` 推導矛盾(root 指向是人為權威決定)⇒ 必須由 `extensions.contractFiles: {agents, claude}` 顯式聲明,缺失 fail-closed。可推導的三條法則(10/10 驗證):`id=${domain}-${name}`、`architecture_module=docs/architecture/modules/${domain}/${name}.md`、`workstream_dir=tasks/workstreams/${domain}/${name}`。
- node id 須恰好 3 段 `capability.<domain>.<name>`,無 `::` 前綴(D8);nodes 目錄硬編碼 `.archcontext/model/nodes`,平面讀取,子目錄/非 YAML 條目 fail-closed(D7)。
- **D9 既有不對稱(記錄不修)**:`export --format archcontext-boundaries-v1` 逐字輸出 prefixes 為 `source.include`,按上游語義是單檔而非目錄——本 WP 加 pinning 測試記錄該決定,export 側修正(目錄前綴補 `/**`)另立 slice。
- 錯誤碼機制(D10):`CapabilitySourceError` 帶 `exitCode=2`;catch 塊改 `process.exit(error.exitCode ?? 1)`;4 個 shell 消費者均有 `|| true` 守護。
- policy.json 無 strict key 校驗,加鍵安全;`archctx-contracts` **留 devDependencies**(runtime 零 import);archctx CLI 永不進 package.json。

## Slices

### R1 — pin bump `archctx-contracts` 0.2.2 → 0.3.0(~30 min,獨立可 revert)

- `package.json` devDependencies 一行 + `bun install` 重生 `bun.lock`。
- 測試零改動:`tests/capability-archcontext-export.test.ts:220-231` 的 4 條 pin 斷言在 0.3.0 下自動成立(已驗證)。

### R2 — `capability_source` 開關 + archcontext file-source(~1-1.5 d)

**`src/core/capabilities/registry.ts`(純函數,不 import fs/path;追加不改動既有符號):**
- `CAPABILITY_SOURCE_MODES = ["registry","archcontext"]` + type
- `archcontextIncludeToPrefix(include)`(D2 表)
- `architectureModulePathFor/workstreamDirFor(domain,name)`(模板法則)
- `capabilityRegistryFromArchcontextNodes(files, {repoRoot?, isExistingDirectory?})`:結構解析 node → 映射 Capability → 餵入既有 `validateCapabilityRegistryValue`(DUPLICATE_ID/DUPLICATE_PREFIX/INVALID_PATH/FIELD_REQUIRED 零新代碼複用);`isExistingDirectory` 注入謂詞保持 fs-free;輸出按 id byte-compare 排序確保確定性
- 擴充 `CapabilityRegistryDiagnosticCode` 加 `ARCHCONTEXT_*` 碼

**`scripts/capability-resolver.ts`(唯一得到 I/O 的檔案):**
- `class CapabilitySourceError { exitCode = 2 }`;`bunYamlParser(host)` structural accessor(可單測 `{}`/`{Bun:{}}` 拋升級指引)
- `capabilitySourceMode(repo)`:policy 缺 → `registry`;JSON 壞/值非法 → `CapabilitySourceError`
- `readArchcontextNodeFiles(repo)`:目錄缺 → 錯(指名目錄與 policy 鍵);readdir 排序;子目錄/非 `.ya?ml` → 錯;YAML 解析失敗 → 錯(帶檔名)
- `loadRegistry(:125)` 按 mode 分派,**雙向零 fallback**;`validate` 的 `structuralCodes(:278)` 納入全部 `ARCHCONTEXT_*`;catch 塊 exit code 修正;**不加 `--source` CLI 旗標**(policy 是唯一權威)
- `export` 零改動——registry/archcontext 兩 mode 對等 fixture 輸出 byte-identical,即 parity oracle

**`scripts/capability-config.ts`**:`main(:339)` 前置守衛——archcontext mode 下拒絕寫 registry(exit 2,指引改寫 node YAML)。

**`scripts/check-state-boundaries.ts`**:`CANONICAL_SYMBOL_OWNERS` 增列 registry.ts 新符號(僅列實際聲明的名字)。

**Policy 三處同步播種**(`.ai/harness/policy.json#context` + `scripts/lib/project-init-lib.sh:1745` + `src/core/adoption/standard-plan.ts:300`):`"capability_source": "registry"` + `"capability_source_rule": "single authority; …no dual-read and no fallback"`。下游預設不變。

**文檔**:`assets/reference-configs/external-tooling.md` 加 ArchContext 節(D2 文法、必填 extensions 鍵、fail-closed 表、D9 已知不對稱)→ `bun run sync:reference-configs --write` 投影。

### R3 — `external_tooling.archctx` advisory 探測(~0.5 d)

- policy 三處播種 `external_tooling.archctx` 條目(`install_mode: "external-optional-cli-never-a-runtime-dependency"`、`readiness: "advisory"`、`hook_policy: "do-not-block-hooks"` 等)
- `scripts/check-agent-tooling.sh` 加 `detectArchctx()`(仿 codegraph 探測;`archctx --version` 1500ms 超時;status:registry mode 或 nodes 齊 → present,archcontext mode 缺 nodes → partial);**不進 `strictFailures`**

### R4 — handoff 回寫(~15 min)

`docs/researches/20260808-archctx-projection-handoff.md` §3 增補本輪探明的上游缺口與新約定:(a) entity-summary placement/pathTemplate 可配置化 = archctx 側新交付項(現硬編碼扁平 `capability-<domain>-<name>.md`,渲染不讀 targets.json);(b) `extensions.contractFiles/lspProfile/verification` 為 repo-harness↔archctx node 慣例;(c) include 受限文法 D2;(d) checkout 內 `@archcontext/contracts` files 配方與發佈物不一致,建議上游校正。

## node → Capability 映射(fail-closed 全清單見設計稿 S1-S6/N1-N13)

| Capability 欄位 | 來源 | 規則 |
|---|---|---|
| domain / name | `node.id` 第 2/3 段 | 恰 3 段、首段 `capability`,否則 N3 |
| id / architecture_module / workstream_dir | 推導 | 三條模板法則(10/10 驗證) |
| prefixes | `source.include` | D2 文法,序保留;空/缺 N6;exclude 非空 N7;非法 glob N8;目錄形字面量 N9 |
| contract_files | `extensions.contractFiles` | 必填不推導(N13) |
| lsp_profile / verification_hints | `extensions.lspProfile` / `.verification` | 必填(N11/N12;顯式 `[]` 可) |

Source 層(exit 2):S1 未知 mode、S2 policy JSON 壞、S3 model 目錄缺(即使 registry 存在——無 fallback)、S4 意外條目、S5 YAML 壞、S6 Bun.YAML 缺。node 層 N1-N13 進 `validate` 硬失敗。非 capability kind / 非 active status 且不佔路徑 → 跳過不報錯(N4b/N5b)。顯式不消費欄位(summary/responsibilities/entrypoints 等)在文檔記錄。

## 測試計劃

- 新 `tests/capability-archcontext-source.test.ts`:雙 source 孿生 fixture(mkdtemp 建,不提交 `.archcontext/` 進本 repo;沿 `capability-resolver.test.ts:9-45` 慣例)——(1) list/match/validate/export 五命令 raw stdout **byte-equality** parity;(2) 同套過 `runStandaloneResolver` 投影 helper 再 parity;(3) 雙向 No-Fallback(archcontext+model 缺+registry 在 → exit 2 且不輸出 registry 內容);(4) S1-S6/N1-N13 逐碼矩陣;(5) `bunYamlParser` 單元;(6) node 檔名亂序 → 輸出不變
- `tests/capabilities/registry.test.ts` 擴充:include 翻譯表、派生 registry 過 `validateCapabilityRegistryValue`、派生 id 碰撞 DUPLICATE_ID
- `tests/capability-archcontext-export.test.ts`:加 D9 pinning 測試(註記後續 slice)
- `tests/capability-config.test.ts`:archcontext mode 拒寫(registry 檔 bytes 不變)
- `tests/check-agent-tooling.test.ts`(R3):兩 mode status + `--strict-readiness` 均 exit 0
- `tests/create-project-dirs.runtime.test.ts` + adoption plan 測試:兩個播種器 `capability_source="registry"` 斷言(防漂移)

**必須保綠的 gate**:`sync:helpers --write` 後 `check:helpers`(改 registry.ts/resolver 後**強制**重生投影,sha256 marker 會叫)、`check:state-boundaries`、`check-tarball-install-smoke.sh`(最硬)、`check:type`、workflow-contract byte-sync、scaffold-parity、`init --dry-run` parity、`check:reference-configs`、`check:architecture-sync`/`check:task-sync`。

## 定序與上游關係

R1→R2→R3→R4 全部**現在可落**,零上游未合併依賴。基線文檔 marker 分區、entity-summary 消費、verifiedAgainst、placement 全部 OUT(等你 archctx 側 T6 合併凍結介面後另立)。已探明加分項:10/10 已提交基線文檔路徑與本 WP 推導模板完全一致 ⇒ 上游扁平 pathTemplate 缺口只擋 archctx 渲染方向,不擋本 repo 未來翻開關。

## 風險與回滾(摘要)

- 最大風險:投影漂移打爆 tarball smoke ⇒ 提交前本地跑 `sync:helpers`+`check:helpers`+smoke;slice 自包含可整體 revert。
- Bun<1.3 下游:S6 fail-closed 帶升級指引,僅 archcontext mode 可達,預設 registry 零波及。
- D2 文法過嚴:刻意;放寬是 additive。
- 三處播種漂移:專用斷言守。
- exit 1→2:4 個 shell 消費者均 `|| true` 守護,獨立可 revert。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: archctx Stage 0: capability_source 开关与 archcontext file-source
