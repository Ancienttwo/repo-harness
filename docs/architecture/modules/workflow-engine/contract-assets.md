# workflow-engine/contract-assets 架构文档

<!-- BEGIN archctx:intro -->

> 状态：基于 `main` 工作树的架构复核稿。
> Verified against: main@13686d8d（2026-08-08）
> **Capability ID**: `workflow-engine-contract-assets`
> **Matched Prefixes**（取自 `.ai/context/capabilities.json`，共 19 条）: `assets/workflow-contract.v1.json`, `.ai/harness/workflow-contract.json`, `.ai/harness/policy.json`, `.ai/context/context-map.json`, `.ai/context/capabilities.json`, `scripts/capability-resolver.ts`, `scripts/capability-config.ts`, `scripts/contract-run.ts`, `scripts/contract-worktree.sh`, `scripts/archive-workflow.sh`, `scripts/merge-gate.ts`, `scripts/ship-worktrees.sh`, `src/cli/commands/init.ts`, `src/cli/commands/global-runtime.ts`, `src/cli/commands/capability-context.ts`, `src/cli/runtime/helper-runner.ts`, `assets/templates`, `assets/reference-configs`, `docs/reference-configs`
> **Local Contracts**: `assets/AGENTS.md`, `assets/CLAUDE.md`
> **Architecture Module**: 本文件
> **Workstream Dir**: `tasks/workstreams/workflow-engine/contract-assets`
> 事实优先级：**实际源码 > 本文 > 历史 closeout 段落**。第 1–3 节只描述当前 HEAD 已实现且已接线的现状；任何尚未落地的形态必须显式标注为「目标设计」。第 4 节是 append-only 的历史记录，其中的数值与命名可能已被后续 slice 取代——冲突时以第 1–3 节和源码为准。

<!-- END archctx:intro -->

本文刻意区分四种状态，避免把规划画成现状：

| 标记 | 含义 |
| --- | --- |
| **已实现、已接线** | 当前源码存在，并位于真实 runtime path |
| **已实现、隔离** | 当前源码存在，但没有进入主 runtime path |
| **已实现、保留字段** | 契约字段已存在，但当前没有生产消费者 |
| **目标设计** | 只存在于计划或历史 closeout 的意图，尚未在 HEAD 落地 |

---

<!-- BEGIN archctx:p1 -->

## 1. P1：能力架构地图

### 1.1 能力内部边界

```mermaid
flowchart LR
  classDef authority fill:#1e40af,stroke:#bfdbfe,stroke-width:2px,color:#fff
  classDef projection fill:#5b21b6,stroke:#ddd6fe,stroke-width:2px,color:#fff
  classDef runtime fill:#0f766e,stroke:#99f6e4,stroke-width:2px,color:#fff
  classDef gate fill:#9a3412,stroke:#fed7aa,stroke-width:2px,color:#fff
  classDef external fill:#374151,stroke:#d1d5db,stroke-width:2px,color:#fff

  Operator(("操作者 / Agent")):::external

  subgraph Authored["受权威文件（tracked，人写）"]
    direction TB
    Contract["assets/workflow-contract.v1.json<br/>安装契约唯一权威"]:::authority
    Registry["'.ai/context/capabilities.json'<br/>capability 注册表唯一权威"]:::authority
    CoreReg["src/core/capabilities/registry.ts<br/>注册表解析核心"]:::authority
    RefCfg["assets/reference-configs/<br/>可安装参考配置语料"]:::authority
    Templates["assets/templates/<br/>文档模板 + helpers 投影"]:::authority
  end

  subgraph Projected["确定性投影（生成，不可手改）"]
    direction TB
    RuntimeManifest["'.ai/harness/workflow-contract.json'<br/>自宿主 runtime 副本"]:::projection
    Policy["'.ai/harness/policy.json'<br/>29 个顶层策略域"]:::projection
    CtxMap["'.ai/context/context-map.json'<br/>渐进式 context 加载契约"]:::projection
    HelperCopies["assets/templates/helpers/*<br/>52 个打包 helper"]:::projection
    DocsRef["docs/reference-configs/<br/>repo-local 参考文档"]:::projection
    CapCtx["各 capability 的<br/>AGENTS.md / CLAUDE.md 受控块"]:::projection
  end

  subgraph Runtime["CLI 运行时"]
    direction TB
    Init(["src/cli/commands/init.ts<br/>runInit"]):::runtime
    Plan(["src/core/adoption/standard-plan.ts<br/>planStandardAdoption"]):::runtime
    HelperRunner(["src/cli/runtime/helper-runner.ts<br/>唯一 helper dispatch"]):::runtime
    GlobalRuntime(["src/cli/commands/global-runtime.ts<br/>install/update"]):::runtime
    CapCtxCmd(["src/cli/commands/capability-context.ts<br/>受控块单向投影"]):::runtime
  end

  subgraph Gates["契约生命周期闸门（helpers）"]
    direction TB
    Resolver(["scripts/capability-resolver.ts<br/>list / match / validate / export"]):::gate
    Config(["scripts/capability-config.ts<br/>唯一注册表创建/新增入口"]):::gate
    ContractRun(["scripts/contract-run.ts<br/>任务委派 runner"]):::gate
    Worktree(["scripts/contract-worktree.sh<br/>commit / local-merge 咽喉"]):::gate
    MergeGate(["scripts/merge-gate.ts<br/>run / verify / fingerprint 本地封印"]):::gate
    Ship(["scripts/ship-worktrees.sh<br/>PR push 咽喉"]):::gate
    Archive(["scripts/archive-workflow.sh<br/>完成归档权威"]):::gate
  end

  Operator --> Init
  Operator --> GlobalRuntime
  Init --> Plan
  Plan --> RuntimeManifest
  Plan --> Policy
  Plan --> CtxMap
  Plan --> Registry
  Contract --> Plan
  Contract --> HelperRunner
  Contract -->|"byte copy"| RuntimeManifest
  CoreReg --> Resolver
  CoreReg -->|"scripts/sync-helper-sources.ts 生成"| HelperCopies
  Templates --> HelperCopies
  RefCfg --> DocsRef
  Registry --> Resolver
  Registry --> CapCtxCmd
  Config --> Registry
  CapCtxCmd --> CapCtx
  HelperRunner --> Resolver
  HelperRunner --> ContractRun
  HelperRunner --> Worktree
  HelperRunner --> Ship
  HelperRunner --> Archive
  Worktree --> MergeGate
  Ship --> MergeGate

  style Authored fill:none,stroke:#60a5fa,stroke-width:2px,color:#60a5fa
  style Projected fill:none,stroke:#a78bfa,stroke-width:2px,color:#a78bfa
  style Runtime fill:none,stroke:#2dd4bf,stroke-width:2px,color:#2dd4bf
  style Gates fill:none,stroke:#fb923c,stroke-width:2px,color:#fb923c
```

### 1.2 模块职责表

| 文件 | 主要 exports / 职责 |
| --- | --- |
| `assets/workflow-contract.v1.json` | 唯一 authored 安装契约。`contractId = "tasks-first-harness-v1"`、`version = "1.0.0"`；8 个顶层域：`compatibility` / `externalTooling` / `agenticDevelopment` / `documentation` / `helpers` / `artifacts` / `documents` / `adoptionTemplates` / `migrations`。`helpers.scripts` 52 项与 `helpers.descriptions` 52 项 1:1；`artifacts.requiredFiles` 28 项、`requiredDirectories` 38 项、`runtimeFiles` 19 项 |
| `.ai/harness/workflow-contract.json` | 自宿主 runtime 副本，与上者 **byte-identical**（`cmp` 通过；`tests/workflow-contract.test.ts:40-45` 断言） |
| `.ai/harness/policy.json` | 自宿主工作流策略，29 个顶层域（`active_plan`、`tasks`、`context`、`harness`、`architecture`、`worktree_strategy`、`merge_gate`、`external_tooling`、`minimal_change`、`enforcement` 等）。由 `planStandardAdoption` 以 deep-merge 写入，显式 repo 值不被默认覆盖 |
| `.ai/context/context-map.json` | 渐进式 context 加载契约。`profile = "stable-root-progressive-subdir"`、8 个 `root_context_files`、18 个 `discoverable_contexts`、`budgets.root_total_chars = 12000`。`functional_block_selector` 自述为 compatibility selector，权威仍是 capability registry |
| `.ai/context/capabilities.json` | capability 注册表唯一 runtime 权威，`version = 1`，当前 10 个 capability |
| `src/core/capabilities/registry.ts` | 注册表解析/校验/最长前缀匹配的实现核心（非本 capability 前缀，但是 `capability-resolver` 的强依赖）。16 个 diagnostic code（`REGISTRY_MISSING` … `AMBIGUOUS_MATCH`），见投影副本 `assets/templates/helpers/capability-resolver.ts:28-44` |
| `scripts/capability-resolver.ts` | 唯一注册表读取器/校验器/最长前缀匹配 CLI。命令 `list` / `match` / `validate` / `export`；`export` 只接受 `archcontext-nodes-v2`，输出完整 node/v2 并可由同一 canonical reader round-trip；旧 `archcontext-boundaries-v1` fail-closed |
| `scripts/capability-config.ts` | 显式 authority-creation 与 capability 新增命令；正常读路径不再从 `agent-context-blocks.txt` 或目录扫描派生能力 |
| `scripts/contract-run.ts` | 任务委派 contract runner：读 `tasks/contracts/*.contract.md` 执行简报，预检、生成 worker/verifier prompt、可选派发、写 run manifest。与 `assets/workflow-contract.v1.json` 的「contract」是同名不同概念 |
| `scripts/contract-worktree.sh` | candidate commit 与 local-merge 咽喉。`run_merge_gate`（`:1226`）、`verify_merge_gate_seal`（`:1253`）；`finish` 路径在 `:1507` 封印、`:1560`/`:1582` 复验，`:1584` 拒绝 review 后 HEAD 移动 |
| `scripts/merge-gate.ts` | 确定性本地封印。命令 `run` / `verify` / `fingerprint`（`:209-217`）；seal 结构 `kind = "repo-harness-merge-seal"`，绑定 `repository_root` / `base_ref` / `base_sha` / `head_sha` / `diff_fingerprint` / `acceptance_receipt_sha256` / `acceptance_subject_sha256` / `acceptance_disposition` / `helper_fingerprint` / `sealed_at`（`:61-73`）。seal 落在 host-owned 目录 `merge-seal.latest.json`（`:354-364`）。**无 provider 调用** |
| `scripts/ship-worktrees.sh` | PR push 咽喉与最终 seal 复验：`merge_gate_required`（`:907`）读目标 base 的启用位，`seal_merge_gate_before_ship`（`:896`）+ `verify_merge_gate_before_ship`（`:885`）成对执行（`:1015-1016`、`:1064-1065`） |
| `scripts/archive-workflow.sh` | 完成归档权威；`Completed` 前置多重证据门，`Abandoned`/`Superseded` 为非完成出口 |
| `src/cli/commands/init.ts` | `runInit()`（`:567-800`）。11 个有序 step：sync skills → host adapters → global rules → inspect → **adoption plan/apply** → register → external skills → codegraph → brain → handoff → `check-task-workflow --strict` |
| `src/cli/commands/global-runtime.ts` | install/update 入口。install profile 单一权威：`readInstalledProfile(env)?.profile ?? "full"`（`:651`），`full` 之外的 profile 关闭 agent fleet / cross-review / brain 步骤（`:676`、`:691`、`:697`） |
| `src/cli/commands/capability-context.ts` | 注册表 → 各 capability 受控 `AGENTS.md`/`CLAUDE.md` 块的一次性单向投影；`CapabilityContextStatus`（`:44-61`）暴露 target/current contract files、normalized 标志与 pending request 计数 |
| `src/cli/runtime/helper-runner.ts` | 唯一 helper dispatch 策略。`listHelpers()`（`:306`）从契约惰性枚举；`readContractHelpers`（`:162`）+ `readContractHelperDescriptions`（`:220`）双向 fail-closed；`helperTimeoutMs`（`:129-141`）三档固定超时；`PROTECTED_HELPERS`（`:12`）= `acceptance-receipt` / `contract-worktree` / `ship-worktrees` / `merge-gate`；`helperRequiresExpensiveRunLock`（`:143-150`）划定昂贵运行独占车道 |
| `assets/templates/` | 17 个文档模板 + `helpers/`（52 个打包 helper）+ `guides/` + `factor-factory/` |
| `assets/reference-configs/` / `docs/reference-configs/` | 可安装参考配置语料与其 repo-local 呈现 |

### 1.3 规模信号

| 分组 | files | LOC |
| --- | ---: | ---: |
| 契约与注册表 JSON（5 个 prefix 文件） | 5 | 2,497 |
| capability 所属 `scripts/`（7 个） | 7 | 6,292 |
| capability 所属 `src/cli/`（4 个） | 4 | 2,747 |
| `assets/templates/`（其中 `helpers/` 52 个 / 25,806 行） | 71 | 27,083 |
| `assets/reference-configs/` | 23 | 2,321 |
| `docs/reference-configs/` | 31 | 3,474 |
| **合计** | **141** | **44,414** |

设计压力集中在两处：`assets/templates/helpers/` 占了全能力 58% 的行数，但它是投影而非 authored 面；真正的手写权威只有约 2,500 行 JSON 加 9,000 行 TS/Shell。

复算命令（`wc -l` 口径，含空行；JSON 与 Markdown 按行计）：

```bash
wc -l assets/workflow-contract.v1.json .ai/harness/workflow-contract.json \
      .ai/harness/policy.json .ai/context/context-map.json .ai/context/capabilities.json
wc -l scripts/capability-resolver.ts scripts/capability-config.ts scripts/contract-run.ts \
      scripts/contract-worktree.sh scripts/archive-workflow.sh scripts/merge-gate.ts scripts/ship-worktrees.sh
wc -l src/cli/commands/init.ts src/cli/commands/global-runtime.ts \
      src/cli/commands/capability-context.ts src/cli/runtime/helper-runner.ts
for d in assets/templates assets/templates/helpers assets/reference-configs docs/reference-configs; do
  printf '%s files=%s ' "$d" "$(find "$d" -type f | wc -l)"
  find "$d" -type f -print0 | xargs -0 wc -l | tail -1
done
```

### 1.4 依赖边界

**允许的出边**

- `src/cli/**` → `assets/workflow-contract.v1.json`：只读，且路径固定为包内 `PACKAGE_CONTRACT`（`src/cli/runtime/helper-runner.ts:10`）。
- `src/core/adoption/**` → `assets/workflow-contract.v1.json`：只读，经 `readWorkflowContractAsset()`（`src/core/adoption/workflow-contract-asset.ts:4-8`）这一个入口。
- `scripts/capability-resolver.ts` → `src/core/capabilities/registry.ts`：**恰好一次** import，`scripts/sync-helper-sources.ts:60-66` 会在投影时断言这一点，多于或少于一次即失败。
- 闸门 helper → `merge-gate.ts`：`contract-worktree.sh` 与 `ship-worktrees.sh` 都只经 `run`/`verify`/`fingerprint` 三个子命令调用。

**禁止的出边**

- 任何 runtime 读路径 → `.ai/context/agent-context-blocks.txt` 或目录扫描来派生 capability。注册表缺失或畸形时 resolver fail-closed，不合成权威。
- `.ai/harness/workflow-contract.json` 被当作可编辑面。它只是 byte 投影。
- 受保护 helper 继承调用者环境。`protectedChildEnv()`（`src/cli/runtime/helper-runner.ts:69-88`）只放行 7 个白名单变量，`HOME`/`PATH`/`TMPDIR` 由 `userInfo()` 与固定系统路径重建；`resolveHelperRuntime(env, allowSourceOverride=false)`（`:277-295`、`:350`）让 `REPO_HARNESS_SOURCE_ROOT` 对受保护 helper 完全失效。
- Contract check 与 hook 读取外部 brain vault 状态。brain 导出是显式 operator 动作。

**同步不变量：`assets/workflow-contract.v1.json` ↔ `.ai/harness/workflow-contract.json`**

这是本能力最硬的一条不变量，由三层共同守：

1. **写入端唯一**：`.ai/harness/workflow-contract.json` 的唯一生产者是 `writeOperation(..., readWorkflowContractAsset(), ...)`（`src/core/adoption/standard-plan.ts:770`）与其等价的 `workflowContractInstallOperation()`（`src/core/adoption/workflow-contract-plan.ts:16-27`）。两者写的都是 asset 的原始字节，没有任何重新序列化。
2. **skip 判定按字节**：`workflowContractStatus()`（`workflow-contract-plan.ts:10-14`）以 `readFileSync(...) === content` 决定 `skipped` 还是 `planned`；格式化差异会被判为需要重写，而不是被容忍。
3. **测试断言**：`tests/workflow-contract.test.ts:40-45` 直接 `expect(runtime).toBe(asset)`。任何一侧被手改都会红。

配套的第二条投影不变量：`scripts/<name>` ↔ `assets/templates/helpers/<name>`。当前 52 个 helper 中 **51 个 byte-identical**；唯一例外是 `capability-resolver.ts`——它是 `src/core/capabilities/registry.ts` 与 `scripts/capability-resolver.ts` 的**合成投影**，头两行携带 `@generated-from ... sha256:<core hash>` 与「do not edit by hand」标记（`assets/templates/helpers/capability-resolver.ts:2-3`），由 `scripts/sync-helper-sources.ts:47-80` 生成。复算：

```bash
for f in $(python3 -c "import json;print(' '.join(json.load(open('assets/workflow-contract.v1.json'))['helpers']['scripts']))"); do
  cmp -s "scripts/$f" "assets/templates/helpers/$f" || echo "DIFF: $f"
done
```

---

<!-- END archctx:p1 -->

<!-- BEGIN archctx:p2 -->

## 2. P2：端到端数据流

### 2.1 主路径：`repo-harness init --repo <target>` 把契约资产落进目标仓库

输入源头是 tracked 的 `assets/workflow-contract.v1.json`；最终副作用是目标仓库里 4 个 JSON 文件加一次 strict workflow 校验。

```mermaid
sequenceDiagram
  autonumber
  actor Op as 操作者
  participant CLI as "src/cli/commands/init.ts<br/>runInit()"
  participant Adopt as "runAdoptionApply()"
  participant Plan as "standard-plan.ts<br/>planStandardAdoption()"
  participant Asset as "assets/workflow-contract.v1.json"
  participant Tx as "adoption transaction<br/>(operations.ts)"
  participant Repo as "目标仓库工作树"
  participant Check as "run check-task-workflow --strict"

  Op->>CLI: repo-harness init --repo <target>
  CLI->>CLI: validateRepoAdoptionTarget(repoRoot, ...)
  Note over CLI: 目标非法即 exitCode=2 提前返回<br/>(init.ts:591-600)
  CLI->>CLI: sync skills / host adapters / global rules
  CLI->>CLI: inspect-project-state.ts --format text
  CLI->>Adopt: {repo, mode, explicitRepo, env}
  Adopt->>Plan: planStandardAdoption(opts)
  Plan->>Repo: jsonFile(".ai/harness/policy.json") 读现值
  Plan->>Plan: deepMergeDefaults(defaultPolicy(profile), current)
  Note over Plan: 显式 repo 值优先；<br/>retired key（hook_source、<br/>external_tooling.gbrain、routing.complex）<br/>在合并后删除 (standard-plan.ts:725-760)
  Plan->>Asset: readWorkflowContractAsset()
  Asset-->>Plan: 原始 UTF-8 字节
  Plan->>Plan: writeOperation(".ai/harness/workflow-contract.json", 字节)
  Note over Plan: replace 语义：<br/>存在且不等 → planned<br/>存在且相等 → skipped
  Plan->>Plan: writeOperation(".ai/harness/policy.json", merged, risk=medium)
  Plan->>Plan: writeOperation(".ai/context/capabilities.json", ifMissing)
  Plan->>Plan: writeOperation(".ai/context/context-map.json", ifMissing)
  Plan-->>Adopt: {operations[], warnings[]}
  Adopt->>Tx: apply(operations)
  Tx->>Repo: 按 expectedContentHash / expectedAbsent 校验后写盘
  Note over Tx,Repo: 预期哈希不符即中止，<br/>不覆盖用户改动
  Tx-->>CLI: report（含 registration 结果）
  CLI->>Check: bun src/cli/index.ts run check-task-workflow --strict
  Check-->>CLI: exitCode
  CLI-->>Op: steps[] + exitCode（任一 step failed → 1）
```

关键的类型与所有权变换：

| 阶段 | 输入 | 输出 | 所有权变化 |
| --- | --- | --- | --- |
| `readWorkflowContractAsset()` | 包内 asset 路径 | `string`（原始字节） | 不解析、不重排 → 保住 byte parity |
| `deepMergeDefaults(defaultPolicy, current)` | `JsonObject` × 2 | `JsonObject` | 目标 repo 的显式值胜过默认值 |
| `writeOperation(..., { ifMissing })` | 现有内容 or `undefined` | `WriteFileOperation` | `capabilities.json`/`context-map.json` 只在缺失时写，已有注册表永不被清空 |
| `contentHash(existing)` | 现有内容 | `sha256:<hex>` | 变成事务的乐观锁 |

### 2.2 次路径：`repo-harness run <helper>` 的契约驱动 dispatch

`helper-runner.ts` 每次调用都重读契约，不缓存：`resolveHelper()` → `readContractHelpers(contractPath)` → 名称校验 → `resolveFromDir()`。名称必须无 `/`、无 `\`、扩展名是 `.sh` 或 `.ts`，文件名与 id 都不得重复（`:192-215`）。解析到的路径必须是**常规文件且非 symlink**（`:340-343`）。

### 2.3 第三路径：契约闸门链（commit → seal → push）

`contract-worktree.sh finish` 在提交 candidate 之后调用 `merge-gate.ts run` 生成封印（`:1507`），随后 `verify` 复验（`:1560`、`:1582`），并断言 `verified_sha == current_head`（`:1584`）。`ship-worktrees.sh` 在 push 前先 `merge_gate_required` 读目标 base 的启用位（`:907-911`），再 seal + verify 成对执行（`:1015-1016`）。启用位来自**目标 base commit** 上的 `.ai/harness/policy.json#merge_gate.enabled`，因此 candidate 无法关掉自己的闸门。

### 2.4 错误路径要点

- **契约不可读/畸形**：`readContractHelpers` 抛 `helper contract not found` 或 `invalid helper contract at <path>: malformed JSON`（`helper-runner.ts:162-188`）。没有降级到目录扫描。
- **description 漂移**：`readContractHelperDescriptions` 双向校验——出现未知 helper id、空/非字符串描述、或某个 script 缺描述，都是契约错误（`:254-268`）。这道门保证 `run --help` 的枚举不会与 `helpers.scripts` 分叉。
- **未知 helper**：`runHelper` 返回 `exitCode=2, reason='missing-helper'`，不尝试模糊匹配（`:361-368`）。
- **helper 缺失或是 symlink**：`resolveFromDir` 抛 `contract helper is missing from <source> runtime` / `is not a regular file`（`:337-343`）。
- **超时**：三档固定，仓库策略与调用者环境都改不了——`verify-contract`/`verify-sprint` 1,260,000 ms；`contract-worktree`/`merge-gate`/`ship-worktrees` 900,000 ms；其余 120,000 ms（`:13-15`、`:129-141`）。
- **契约/runtime 副本漂移**：`tests/workflow-contract.test.ts:40-45` 红。
- **capability 注册表异常**：resolver 以 16 个 diagnostic code fail-closed（`REGISTRY_MISSING`、`UNSUPPORTED_VERSION`、`DUPLICATE_PREFIX`、`AMBIGUOUS_MATCH` 等）；注册了却不存在的 prefix 同样失败。
- **adoption 事务预期不符**：`expectedContentHash` / `expectedAbsent` 不匹配即中止，用户改动不被覆盖；`moveOperation` 遇到目标已存在直接抛 `refusing to overwrite user-owned path`（`standard-plan.ts:215`）；`archiveLegacyContent` 遇到内容冲突抛 `legacy archive collision`（`:451`）。
- **merge seal 陈旧**：`base_sha is stale`、`diff_fingerprint is stale`、`branch moved after merge-gate review` 都在 push/merge 之前 fail（`merge-gate.ts:430-441`、`contract-worktree.sh:1584`）。
- **install profile 非法**：`global-runtime` 先读 installed-profile 权威并校验 profile→components 投影，再触发 runtime projection；非法状态在 package/adapter/skill/hook 变更之前停住。

---

<!-- END archctx:p2 -->

## 3. P3：设计决策与不变量

### 3.1 为什么契约资产与 runtime 状态分离

生成仓库必须能在**没有任何服务**的情况下自证。因此 tracked 契约文件是持久真相，而 `.ai/harness/checks/*`、handoff packet、failure log、architecture events、worktrees、run snapshots 全是 ignored runtime 状态。删掉或损坏 ignored 缓存不能让版本回退：`state_version` 是 Git worktree metadata 下的单调计数器，`state_revision` 是确定性内容哈希。

### 3.2 必须守住的不变量

| # | 不变量 | 执行者 |
| --- | --- | --- |
| I1 | asset 契约与自宿主 runtime 副本 byte-identical | `tests/workflow-contract.test.ts:40-45`；写入端只搬字节 |
| I2 | `helpers.scripts` 与 `helpers.descriptions` 1:1，且描述非空 | `helper-runner.ts:254-268` + `tests/workflow-contract.test.ts:199-213` |
| I3 | `helpers.scripts` 是「有哪些 helper」的唯一 id 列表；descriptions 只挂显示数据 | 契约结构 + 上述双向校验 |
| I4 | `.ai/context/capabilities.json` 是 capability 的唯一 runtime 权威 | `capability-resolver.ts` fail-closed；`capability-config add` 是唯一创建路径 |
| I5 | capability context 块、ArchContext node/v2 导出都是单向投影，不是第二作者面 | `capability-context.ts`；`export` 仅接受 `archcontext-nodes-v2`，并由 canonical reader round-trip 验证 |
| I6 | 受保护 helper 的 source/helper/HOME/PATH/解释器解析不受调用者影响 | `protectedChildEnv()`、`resolveHelperRuntime(env, false)` |
| I7 | merge gate 启用位来自**目标 base commit**，candidate 不能自我豁免 | `ship-worktrees.sh:907-911`；`contract-worktree.sh` gate base ref |
| I8 | 51/52 helper 与 `scripts/` byte-identical；唯一例外携带 `@generated-from` 哈希头 | `scripts/sync-helper-sources.ts` `--check` |
| I9 | adoption 事务永不无声覆盖用户内容 | `expectedContentHash` / `expectedAbsent` / move-collision 抛错 |
| I10 | install profile 单一 authored 权威是 `profile`，`components` 是漂移检查过的投影 | `global-runtime.ts:651` + `PROFILE_COMPONENTS` |

### 3.3 已接受的约束与取舍

- **契约是 JSON 而非可执行配置**。代价是表达力弱，收益是 byte-parity 可判定、diff 可读、任何语言都能校验。这是 I1 能成立的前提。
- **超时按类别硬编码而非策略可配**。放弃了「快机器跑快点」的灵活性，换来的是策略文件不能变成拒绝服务或无限挂起的攻击面。
- **闸门在 commit 之后跑**。pre-commit 的 HEAD 无法标识 merge candidate，所以只能先落 commit 再封印；FAIL/BLOCKED 靠恢复 pre-finish commit 与实时工作流工件来回滚。
- **`functional_block_selector` 保留在 context-map 里但自述为 compatibility selector**（`.ai/context/context-map.json`，`rule` 字段原文：`compatibility selector; capability registry is the source of truth`）。这是**已实现、保留字段**：结构在，权威已经移交给注册表。它是有边界的遗留物，不是双权威。
- **`merge-gate` 无 provider 调用**。它是确定性封印，不是语义评审；语义验收由独立的 AcceptanceReceipt 承担。这条边界让闸门可离线、可重放。

### 3.4 10x 规模下先垮的点

按「先垮」排序：

1. **helper 数量增长（当前 52）**。每加一个 helper 要同时改 4 处：`helpers.scripts`、`helpers.descriptions`、`scripts/<name>`、`assets/templates/helpers/<name>`。fail-closed 校验保证漏改会红，但这是**线性增长的手工同步成本**——它已经在真实 ship 中触发过（见第 4 节 2026-07-14 段落记录的 rebase 事件）。第一个撑不住的不是正确性，是改动摩擦。
2. **policy 顶层域数量（当前 29）**。`deepMergeDefaults` 是无 schema 的结构性合并。域数继续涨，「默认值改了但已装仓库不会自动拿到」这类静默偏差会越来越难发现，因为没有 policy schema 版本化与迁移断言。
3. **capability 数量（当前 10）与最长前缀匹配**。`DUPLICATE_PREFIX` 与 `AMBIGUOUS_MATCH` 已经在守，但注册表本身是单文件、人工排序；到几十个 capability 时，「哪个 prefix 该归谁」的判断会先于工具失效。
4. **`assets/templates/` 27k 行**。它是投影，正确性由 `--check` 保证，但每次 helper 改动都在 diff 里翻倍出现，review 信噪比下降。

最小连贯的护栏仍是现有那套：parity 测试 + `sync-helper-sources.ts --check` + `capability-resolver validate` + 自迁移 dry-run。要更进一步，第一刀应是给 `.ai/harness/policy.json` 引入 schema 版本与迁移断言，而不是加抽象。

### 3.5 与历史记录的已知冲突

第 4 节逐字保留，其中三处与 HEAD 源码不符，以本节为准：

| 历史段落 | 历史说法 | HEAD 实际 | 位置 |
| --- | --- | --- | --- |
| 2026-07-16 Closeout Runner Guardrails | `verify-contract`/`verify-sprint` 720 秒 | **1,260 秒**（`VERIFIER_HELPER_TIMEOUT_MS = 1_260_000`） | `src/cli/runtime/helper-runner.ts:13` |
| 2026-07-16 Closeout Runner Guardrails | 900 秒档只含 `contract-worktree`/`ship-worktrees` | 还包含 **`merge-gate`**；`PROTECTED_HELPERS` 另含 `acceptance-receipt` | `helper-runner.ts:12`、`:134-137` |
| 2026-07-14 Helper Descriptions | 46 → 48 条描述 | **52 条**（scripts 与 descriptions 均为 52） | `assets/workflow-contract.v1.json#helpers` |

另有两处已由后续 slice 取代，历史段落本身未改写：

- 旧文档头部与 P1 曾把 `assets/skills/merge-gate/` 列为 matched prefix 与权威文件。该目录在 HEAD **不存在**（`assets/skills/` 下只有 `claude-plan`、`repo-harness-chatgpt`、`repo-harness-cross-review`、`repo-harness-plan`、`repo-harness-product`、`repo-harness-setup`），`.ai/context/capabilities.json` 的 prefix 列表也已移除它。这与 2026-07-21 段落「former host-only merge-gate skill/agent ... are removed」一致。
- 旧 P2 只描述了 shell 路线（`pi_install_workflow_contract` → `pi_write_harness_policy` → …）。这些函数在 `scripts/lib/project-init-lib.sh:917,1675` 仍然存在，但调用者只有 `scripts/create-project-dirs.sh:43` 与 `scripts/init-project.sh:69`，且这两个脚本**不在** `helpers.scripts` 契约清单里。`repo-harness init` 的实际 runtime path 是 §2.1 的 TS 事务模型。

---

## 4. 历史决策记录（append-only）

> 本节逐字保留既有文档中所有带日期的段落，英文不翻译，顺序与原文件一致。仅将标题层级由 `##` 降为 `###` 以嵌入本节；正文一字未改。历史数值与 HEAD 的差异见 §3.5。

### 2026-07-14 Local Merge Gate Enforcement

- P1: installed `contract-worktree` remains the commit/merge authority and
  installed `ship-worktrees` remains the PR push authority. The target base
  policy owns enablement, the OS account home
  `~/.repo-harness/config.json#merge_gate` owns local
  runner identity, the host-only `merge-gatekeeper` agent owns only tool-free model isolation,
  `assets/skills/merge-gate` owns review semantics, and `scripts/merge-gate.ts`
  is the only receipt writer/verifier.
- P2: finish snapshots live workflow state, verifies and archives it, commits
  the exact candidate, and invokes Claude with no tools from an empty temporary
  directory. The stdin request supplies the complete diff,
  goal, changed files, and current deterministic check evidence. A successful
  verdict is stored under `~/.repo-harness/gates/<repo-id>/` and bound to
  repository root, exact base ref/SHA, head SHA, binary diff fingerprint, host
  runtime fingerprint (config, binary identity, agent, and skill), and installed
  helper fingerprint. FAIL/BLOCKED restores
  the pre-finish commit and live workflow artifacts. PR mode fetches the remote
  target and pushes the verified SHA explicitly; local merge also names the
  verified SHA instead of the mutable branch name.
- P3: target-base policy prevents the candidate from disabling its own gate;
  host config and host-state receipts keep runner and receipt authority outside
  the candidate workspace. The gate runs after commit because pre-commit HEAD
  cannot identify the merge candidate. Only Claude is configured in this
  slice; protected helper resolution ignores process-level source/helper/HOME
  overrides and pins its Bash/Git/Bun/gh toolchain outside caller `PATH`.
  There is no provider fallback, GitHub check-run, alternate receipt
  shape, candidate-code execution, or agent-owned write.
- At 10x concurrency the first failure is the remote target advancing after
  fetch. Receipt revalidation rejects any locally observed base or head drift,
  and the explicit SHA refspec prevents a moved local branch from changing what
  is pushed. Remote merge-time freshness remains GitHub branch-protection/CI
  authority rather than a claim made by this local pre-push gate.

### 2026-05-29 Cleanup Script Policy Closeout

- `worktree_strategy.cleanup_script` is part of the policy contract surface. It advertises the terminal cleanup command generated repos can call after `finish` has already archived and merged a contract worktree.
- The runtime owner remains `scripts/contract-worktree.sh`; `.ai/harness/policy.json`, `scripts/ensure-task-workflow.sh`, and `scripts/lib/project-init-lib.sh` only publish the command shape for self-host and generated repos.
- File-prefix capability requests such as `.ai/harness/policy.json` still belong to `workflow-engine-contract-assets`; local capability context is projected to `assets/AGENTS.md` and `assets/CLAUDE.md`.
- No new architecture snapshot or human diagram is required because the module boundary, entrypoints, and dependency direction are unchanged.

### 2026-06-12 Architecture Queue Contract Closeout

- The self-host workflow contract helper inventory now names
  `architecture-queue.sh` as the architecture request helper; the retired
  `architecture-drift.sh` is removed from the source and installable helper
  templates.
- `.ai/harness/policy.json` and generated policy templates expose
  `architecture.freshness_gate`, `gate_min_severity`, pending block markers, and
  `queue_script` so slice 2 can promote the gate from advisory to strict without
  changing the queue data model.
- The contract invariant remains byte parity between
  `assets/workflow-contract.v1.json` and `.ai/harness/workflow-contract.json`;
  helper installation stays flat under `scripts/`.

### 2026-07-06 Delegation Policy Auto Mode Closeout

- `.ai/harness/policy.json` now documents that `delegation.mode=auto` is
  install-time standing user authorization for bounded Codex delegation on
  prompts without explicit trigger words.
- Global `~/.repo-harness/config.json` remains the user-level authority for the
  mode choice and takes precedence over repo policy when the value is exactly
  `auto` or `explicit`; repo policy is still the generated/self-host fallback.
- This is a policy text contract change only. It does not change contract asset
  ownership, helper inventory shape, byte-parity requirements, or generated repo
  storage boundaries.

### 2026-07-11 Capability Authority Closeout

- `.ai/context/capabilities.json` is the only runtime capability authority. Resolver commands fail when it is missing or malformed and reject registered prefixes that do not exist.
- `capability-config add` remains the explicit creation path for a new registry; normal reads no longer derive capabilities from `agent-context-blocks.txt`, environment variables, or nested agent files.
- Capability context files and the ArchContext boundary export remain deterministic, one-way projections of the registry. They do not become alternate authoring surfaces.

### 2026-07-11 Archive Evidence Gate Closeout

- `archive-workflow.sh` is the completion archive authority. `Completed` now
  requires a verified `Active` or `Fulfilled` linked contract, the review to
  recommend `pass`, current `verify-sprint` structured evidence, canonical
  external acceptance `pass`, and the architecture freshness helper to succeed
  before any workflow artifact moves. After all gates pass, archive owns the
  `Active -> Fulfilled` transition so verifier/reviewer content cannot be made
  stale by a pre-archive status mutation.
- `Abandoned` and `Superseded` remain non-completion outcomes and preserve the
  complete plan and lifecycle artifact bodies. They do not synthesize passing
  evidence.
- `archive-architecture-request.sh` accepts only a live `Pending` request.
  `Resolved` additionally requires the request's declared architecture module
  to exist and be passed as an existing, repository-contained durable artifact.
  Queue/index projection is rebuilt and checked before and after the move.
- Current-status refresh, architecture reindex, and Sprint backlog back-fill
  failures now propagate to the caller and restore the pre-archive live
  workflow/architecture snapshot. A failed projection can neither be reported
  as a successful finish nor strand the plan/request only in archive storage;
  the same command can be retried after repairing the failed dependency.
- These gates reuse the existing workflow-state, verify-sprint, architecture
  queue, and freshness authorities. No new dependency or compatibility parser
  was added.

### 2026-07-14 Verification Asset Cutover

- The installable helper inventory now includes the bounded-command runner and
  benchmark evidence validator alongside `verify-contract.sh` and
  `verify-sprint.sh`; self-host and product copies remain byte projections.
- Generated contract/review templates emit only canonical completion and Rubric
  v2 subject fields. The retired manual-override, Human Review Card fallback,
  ancestry fingerprint, and report-v1 reader are removed in the same package.
- Report/check projections use one benchmark evidence shape:
  `status`, `report_sha256`, and `benchmark_subject_sha256`.

### 2026-07-13 Deploy SQL Policy Authority

- Optional `.ai/harness/policy.json#operations.deploy_sql` is the sole authority for established alternate SQL roots, naming modes, and invariant files. Its absence keeps the generated `deploy/sql/` plus `ordered4` default.
- Policy generators deliberately do not seed the optional object. Their existing default merge preserves an explicit repo override while avoiding a second steady-state authority.
- Root guidance, generated partials, deploy scaffolds, the deploy skill, and installed hooks are projections of that precedence. Existing parity and scaffold tests guard against self-host/generated drift; the module boundary and dependency direction are unchanged.

### 2026-07-12 Agent Fleet Worker Routing Telemetry Closeout

- `scripts/contract-run.ts` (mirrored byte-for-byte to `assets/templates/helpers/contract-run.ts` through the existing helper projection route) is now a matched prefix of this capability. It is the task-delegation contract runner: it reads a `tasks/contracts/*.contract.md` execution brief, preflights it, generates worker/verifier prompts, optionally dispatches them, and writes a run manifest. This is a distinct "contract" concept from `assets/workflow-contract.v1.json` (the install/workflow contract this capability already owned) — the two share the word by coincidence, not by schema or lifecycle, but both are contract-lifecycle tooling this capability already narrates (compare the pre-existing `scripts/contract-worktree.sh` mention in the 2026-05-29 closeout above).
- Contract roles (`parent`/`explorer`/`worker`/`verifier`; existing generic mode/purpose defaults at `scripts/contract-run.ts:340-346`, unchanged) now also map to the four fixed, model-pinned fleet profiles (`explorer`, `fast-worker`, `deep-reasoner`, `gatekeeper`) through a new `delegation_plan.role_profiles` manifest field (`scripts/contract-run.ts:792-797`):
  - `parent` -> `"orchestrator"`: never model-assigned; not one of the 4 profiles.
  - `explorer` -> `"explorer"` (fixed).
  - `worker` -> derived in `buildRun()` (`scripts/contract-run.ts:754-758`) from the resolved runner dispatch value, without renaming `RunnerContract.preferred`/`fallback`'s pre-existing dispatch-mechanism vocabulary (`subagent` / `codex-subagent` / `codex-exec` / `main-thread`): dispatch `main-thread` -> `"sol-high"`; dispatch `codex-subagent` or `codex-exec` -> the raw dispatch label passed through unchanged (Codex is an independent peer provider, not one of the 4 profiles); any other dispatch (e.g. `subagent`) -> `"fast-worker"`.
  - `verifier` -> `"gatekeeper"` (fixed).
  - `deep-reasoner` sits outside this role table entirely, as an independent escalation path not bound to any single contract role.
- New `--effort <tier>` CLI flag (parsed at `scripts/contract-run.ts:148-151`; validated by the local `EFFORT_TIERS`/`parseEffort()` pair at `scripts/contract-run.ts:190-201` against the closed vocabulary `low`/`medium`/`high`/`xhigh`/`max`, the same tiers `buildFamilyEffortMap()` in `scripts/install-agent-fleet.sh` already uses — kept as a local literal list rather than a shared import because that copy lives inside an embedded Node.js heredoc, not an importable module). Record-only, matching the pre-existing `--runner` philosophy: `contract-run.ts` never itself selects, spawns, or degrades a runner or effort tier. Defaults to `"high"` only when the resolved dispatch is the contract's worker fallback and no explicit `--effort` is passed (`scripts/contract-run.ts:758`).
- New manifest telemetry fields are additive only; `RunnerContract`, `parseRunner()`, `runChild()`, and the run-mode control flow are unchanged:
  - `runner_usage.path`: `"worker_preferred"` | `"worker_fallback"` (`scripts/contract-run.ts:780`).
  - `runner_usage.effort`: resolved effort tier string or `null` (`scripts/contract-run.ts:781`).
  - `delegation_plan.role_profiles`: `{ parent, explorer, worker, verifier }` as derived above (`scripts/contract-run.ts:792-797`).
- Regression coverage lives in `tests/contract-run.test.ts`: the preferred path, the `codex-subagent`/off-policy runner passthrough, the `main-thread` worker-fallback path (`sol-high` plus default effort `"high"`), the `codex-exec` passthrough, and an explicit `--effort xhigh` override sharing one scenario, `"runner metadata from the contract flows into the manifest"` (`tests/contract-run.test.ts:742-891`); invalid `--effort` rejection is `"invalid --effort value exits with usage error"` (`tests/contract-run.test.ts:893-897`).

### 2026-07-12 Repo-owned Agent Fleet Authority Closeout

- `agents/fleet/*.md` is the only authored fleet source and is shipped through
  the existing npm `agents/` package surface. `.claude/agents/*.md` and
  `.codex/agents/*.toml` are deterministic repo-local projections and goldens.
- `.ai/harness/policy.json` declares `external_tooling.agent_fleet` with
  `source: package:agents/fleet`. The retired `fable_agents` key, remote URLs,
  network fetch, source override, and compatibility reader are absent.
- Installer source validation completes for all managed roles before any target
  mutation. Helper-path resolution supports only the declared source-checkout
  and packaged-helper layouts; target-repo cwd never becomes an authority.
- The four managed roles are explorer, deep-reasoner, fast-worker, and
  gatekeeper. Claude receives source bytes; Codex receives the Sol/Luna family
  projection with unchanged effort strings. Gatekeeper remains read-only in
  both sandbox and prompt semantics.
- The first 10x failure would be publishing helpers without their fleet source.
  Tarball-content checks, temporary-HOME package smoke, helper parity, and
  source/projection golden tests guard that distribution boundary.

### 2026-07-12 Agent Fleet Specialist Roles Closeout

- The packaged fleet has six managed identities. `root-cause-prover` produces
  the existing bugfix gate's four evidence fields without changing gate
  semantics; `harness-evaluator` invokes existing skill/adoption evaluation
  surfaces and treats migration audit as a profile rather than another agent.
- The Codex writable-role set is closed and explicit: `fast-worker`,
  `root-cause-prover`, and `harness-evaluator`. Every other projection is
  read-only. Harness-evaluator's workspace-write is valid only inside a
  complete disposable repo/HOME; skills uses the runner's enforcing mode and adoption uses one
  guarded invocation that injects the validated roots into both existing commands. Both reject source or real
  HOME in either argument position. The task contract's
  allowed paths and isolated worktree remain the authority that prevents the
  diagnosis role from turning evidence work into a production fix.
- Native Explore remains host-owned informal capability. Formal explorer work
  resolves to the complete repo-owned persona; no alias, wrapper, inherited
  prompt, incremental merge, or second authored authority participates.
- BDD2 remains an independent sealed evaluation authority. The harness
  evaluator must fail closed on `evals/bdd2/**` or
  `scripts/run-bdd2-evals.ts`, and this work-package does not modify either.
- The first 10x failure would be adding persona names without updating package,
  policy seeds, projections, readiness, and HOME installation together. Exact
  six-role lists, all-source preflight, tarball assertions, and temporary-HOME
  smokes protect that boundary.

### 2026-07-14 Helper Descriptions Contract Surface Closeout

- `assets/workflow-contract.v1.json#helpers.descriptions` is the sole authority for the one-line description of every bundled helper (helper id, filename minus extension, mapped to description text). `helpers.scripts` keeps sole authority over which helpers exist; descriptions attach display data to those ids without introducing a second id list.
- The contract parser fails closed in `src/cli/runtime/helper-runner.ts` (`readContractHelperDescriptions`): a missing `descriptions` object, a scripts entry without a description, an empty or non-string value, or a description key with no matching script is a contract error, so the description map cannot drift from the script list.
- `repo-harness run --help` now renders the full helper enumeration lazily through `listHelpers()` (`src/cli/commands/run.ts`), closing the discovery gap where the 46-helper surface was previously printed only on an unknown-helper failure. `.ai/harness/workflow-contract.json` remains the byte-identical installed mirror of the assets contract; no module boundary, dependency direction, or verification command changed.
- Regression coverage: `tests/workflow-contract.test.ts` (descriptions cover `helpers.scripts` 1:1 with non-empty text) and `tests/cli/run.test.ts` (fail-closed validation plus `run --help` enumeration output).
- The invariant was exercised live at ship time: rebasing onto origin/main added two upstream helpers (`run-bounded-verifier-command.ts`, `validate-harness-profile-benchmark.ts`) and the fail-closed check blocked shipping until their descriptions landed, bringing the map to 48 entries.

### 2026-07-16 Closeout Runner Guardrails

- P1: `src/cli/runtime/helper-runner.ts` remains the canonical helper dispatch
  policy. Ordinary helpers receive a fixed 120-second envelope,
  `verify-contract`/`verify-sprint` receive 720 seconds, and
  `contract-worktree`/`ship-worktrees` receive 900 seconds. Repository policy
  and caller environment cannot redefine these classes.
- P2: every helper runs through a private launcher/supervisor pair. The launcher
  cannot start the target until the supervisor has published its PGID; normal
  cleanup and the parent's hard-timeout backstop both perform TERM, a fixed
  grace period, then KILL against that group. Lock wait consumes the same outer
  deadline, and completion is published only after group absence.
  `ship-worktrees` checks review/acceptance readiness and delegates to
  `contract-worktree finish`; only finish invokes `verify-sprint`, so one ship
  has exactly one sprint-verification producer.
- P3: canonical release helper modes resolve the Git common directory and use
  the same fail-closed expensive-run lane as authoritative benchmark
  production. Nested raw helper calls stay inside the already-held outer lane;
  invoking packaged Bash files directly is an internal/test surface and does
  not create a second lock or verification authority.

### 2026-07-21 Single Acceptance Authority

- The contract's strict `## Acceptance Policy` block freezes reviewer identity
  and whether the named owner may issue `user_waiver`. One host-owned
  UserWaiverGrant records that owner decision against stable contract/goal
  authority. The host-owned AcceptanceReceipt is the exact closeout authority;
  its closed dispositions are `external_pass`, `user_waiver`, and `reject`.
- `verify-sprint --prepare-acceptance` freezes canonical verification evidence.
  Receipt verification binds that evidence, normalized implementation content,
  goal, contract, benchmark evidence, reviewed paths, and target revision.
  Semantic changes invalidate the receipt and require fresh evidence, while an
  unchanged valid waiver grant may rematerialize the new exact receipt without
  repeating the owner's decision. Contract/goal authority changes or explicit
  revocation invalidate the grant. Review Markdown is a generated projection
  and cannot authorize closeout.
- `merge-gate.ts` is now a deterministic local seal. The former host-only
  merge-gate skill/agent and internal Claude call are removed. Lifecycle-only
  head movement is checked against the declared archive manifest; a later
  non-overlapping target advance only reseals the exact base/head/full diff,
  while overlap invalidates semantic acceptance.
- PR CI is the sole candidate-branch lane. `codex/**` push CI is removed and
  workflow concurrency cancels superseded runs for the same PR/ref.

---

## Workstream Ledger

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`
- `tasks/workstreams/workflow-engine/contract-assets/20260712-contract-assets.md`
- `tasks/workstreams/workflow-engine/contract-assets/agent-fleet-specialists.md`
- `tasks/workstreams/workflow-engine/contract-assets/20260714-merge-gate-enforcement.md`
- `tasks/workstreams/workflow-engine/contract-assets/github-issues-158-159.md`

## Optimization Backlog

- Promote `bun scripts/capability-resolver.ts validate --format text` into the strict workflow gate after one more real architecture slice.
- Keep durable knowledge in repo-authored research and lessons. Optional external brain exports require an operator-invoked manifest sync and never participate in workflow correctness.

## 验证命令

来自 `.ai/context/capabilities.json#verification_hints`：

```bash
bun test tests/workflow-contract.test.ts tests/scaffold-parity.test.ts
bun scripts/capability-resolver.ts validate --format text
```
