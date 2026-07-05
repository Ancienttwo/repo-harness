# Plan: Agent Fleet 依赖面：舰队升格为 external_tooling 一等依赖

> **Status**: Executing
> **Created**: 20260706-0232
> **Slug**: agent-fleet-dependency
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: 新增 tests/install-agent-fleet.test.ts + check-agent-tooling/migration/create-project-dirs 扩展 + PF 收官电池
> **Rollback Surface**: revert branch codex/agent-fleet-dependency；全局目录写入幂等且 never-clobber，卸载=删 6 文件
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260706-0232-agent-fleet-dependency.contract.md`
> **Task Review**: `tasks/reviews/20260706-0232-agent-fleet-dependency.review.md`
> **Implementation Notes**: `tasks/notes/20260706-0232-agent-fleet-dependency.notes.md`

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

- Active plan: `plans/plan-20260706-0232-agent-fleet-dependency.md`
- Sprint contract: `tasks/contracts/20260706-0232-agent-fleet-dependency.contract.md`
- Sprint review: `tasks/reviews/20260706-0232-agent-fleet-dependency.review.md`
- Implementation notes: `tasks/notes/20260706-0232-agent-fleet-dependency.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260706-0232-agent-fleet-dependency.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260706-0232-agent-fleet-dependency.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260706-0232-agent-fleet-dependency.md`.

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
- Contract file: `tasks/contracts/20260706-0232-agent-fleet-dependency.contract.md`
- Review file: `tasks/reviews/20260706-0232-agent-fleet-dependency.review.md`
- Implementation notes file: `tasks/notes/20260706-0232-agent-fleet-dependency.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260706-0232-agent-fleet-dependency.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260706-0232-agent-fleet-dependency.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: revert branch codex/agent-fleet-dependency；全局目录写入幂等且 never-clobber，卸载=删 6 文件
- **Verification boundary**: 新增 tests/install-agent-fleet.test.ts + check-agent-tooling/migration/create-project-dirs 扩展 + PF 收官电池
- **Review/acceptance boundary**: `tasks/reviews/20260706-0232-agent-fleet-dependency.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260706-0232-agent-fleet-dependency.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260706-0232-agent-fleet-dependency.contract.md`, `tasks/reviews/20260706-0232-agent-fleet-dependency.review.md`, and `tasks/notes/20260706-0232-agent-fleet-dependency.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260706-0232-agent-fleet-dependency.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: revert branch codex/agent-fleet-dependency；全局目录写入幂等且 never-clobber，卸载=删 6 文件

## Captured Planning Output

# Agent Fleet 依赖面：舰队定义升格为 external_tooling 一等依赖（policy 分级安装 + TOML 生成 + 永不静默覆盖）

> 承接 `authority-closure`（已合并）。使用者三项拍板（2026-07-06）：**(1) policy 开关分级**——自托管 auto-install，下游默认 advisory + 显式命令；**(2) Codex TOML 从上游 .md 确定性生成**——单一上游 `github.com/Ancienttwo/Fable-agents`，零第三副本；**(3) 永不静默覆盖**——逐文件 drift 报告，仅 `--force` 覆盖。上游与本仓库同属使用者，.md frontmatter 形状是可控契约：生成器 fail-closed 断言，不猜。
> 执行者注意：每片有 STOP，命中即停回报。EXECUTION_BOUNDARY 反-extras 条款照常适用。

## Context（为什么做）

harness loop 的委派环路（orchestrator→deep-reasoner/fast-worker→gatekeeper）依赖用户全局的舰队定义（`~/.claude/agents/*.md`、`~/.codex/agents/*.toml`），但 repo-harness 今天对它零感知：不声明、不检测、不安装（实证：init/npm 包/种子面对 `.claude/agents|.codex/agents` 全零引用）。装完 repo-harness 跑 init，环路依赖是断的。本计划把舰队做成与 waza/hai_stack/codegraph 同级的 external_tooling 依赖面：policy 声明 + init/migrate 检测 + readiness 门 + 全局安装器。

## 侦察基线（HEAD 43ad4de，全部实测锚点）

- **check-agent-tooling.sh**（1547 行，bash 外壳 + `exec $RUNTIME_BIN - "$@" <<'NODE_EOF'` 内嵌 JS；镜像 byte 一致）：参数解析 :22-68（`--json`:34、`--check-updates`:38、`--strict-readiness`:42、`--host`:46-55）；`HOSTS` 注册表 :96-111（claude/codex 各 5 字段，**无 agentsDir**）；每类检查 = 顶层 `detectXxx()` + 写进 `tools:{}` 字面量 :1396-1402 + 可选 strict 判断 :1405-1408（**现仅 codegraph 接了 strict gate**）+ `printText()` :1410-1533 输出块。最近似先例：`detectCodexAutomationProfile()`/`inspectCodexAutomationSkill()` :905-947（固定清单文件存在性+version/hash）。上游拉取先例：`fetchWazaUpstreamSkills()` :513-571（仅 `--check-updates` 时 `curl -fsSL --max-time 5 raw.githubusercontent.com/...`）。hash/目录 diff 工具函数 :217-368 可复用。
- **init/migrate 检测链路**：policy 的 `"detection"/"readiness_gate"` 字段是说明性字符串，无代码消费。真实执行链：`init-project.sh:490` 与 `migrate-project-template.sh:1084` → `pi_print_external_tooling_report()`（project-init-lib.sh:1256-1290，:1278 实际 exec，`--host both`:1272，env `REPO_HARNESS_CHECK_TOOLING_UPDATES=1` 追加 `--check-updates`:1273-1276）；detector 路径解析 `pi_resolve_external_tooling_detector()`:1244-1254。migrate 的 `$MODE`（apply/dry-run）会传进该函数——**auto-install 必须只在 apply 模式发生**。
- **policy external_tooling** :309-390：`waza`:322-336 / `hai_stack`:337-348（8 键形）；`codegraph`:375-389（13 键）——**自托管/下游双值先例**：policy.json 的 `install_mode="self-host-dev-dependency-with-global-mcp-opt-in"`:378 vs 种子默认 `"target-aware-mcp"`（project-init-lib.sh:2068、ensure-task-workflow.sh:1117）。种子面：ensure-task-workflow.sh:1059-1128（静态字面量，+镜像 byte 一致）、project-init-lib.sh:2013-2079（`pi_write_harness_policy()` heredoc 内，**无镜像**，helper-scripts.test.ts:467-468 是唯一结构守护）。policy 合并语义 `pi_merge_json_defaults()`:2490+（当前值优先——已有用户 policy 不会被新种子覆盖，新键会补进）。
- **helper 分发三处一致性约束**：新脚本要进 `assets/workflow-contract.v1.json` `helpers.scripts`（:87-133，现 47 项）+ `assets/templates/helpers/` 镜像 + `pi_install_helpers()` 默认清单（project-init-lib.sh:1108）；`.ai/harness/workflow-contract.json` 与 v1 json **byte 成对**（CLAUDE.md 规则 + 实测一致）；`repo-harness run <helper>` 分发器读同一清单（src/cli/runtime/helper-runner.ts:45-59）。唯一有意分叉先例：migrate-project-template.sh（shim 镜像，INTENTIONALLY_DIVERGENT 排除清单 helper-scripts.test.ts:30）。
- **舰队现状与映射表**（.claude/agents ↔ .codex/agents 三对实测）：`opus`+`max`→`gpt-5.5`+`xhigh`；`sonnet`+`max`→`gpt-5.5`+`medium`；frontmatter 有 `tools:[...]`（仅 gatekeeper）→ TOML `sandbox_mode="read-only"`，无则无该键；name/description 原样；.md 正文 + **EXECUTION_BOUNDARY 四段**（contract-run.ts:67-75 常量，:63-66 注释声明 canonical parity 义务）→ `developer_instructions`。boundary 文本无单引号（bash 3.2 heredoc 教训不触发，仍须 `bash -n`）。
- **capture/测试基建**：capture-plan 走 `--body-file`（capture-plan.sh:248-252，`--execute` 需 Approved+work-package+合法 promotion-reason :296-314）。假 HOME 先例 tests/check-agent-tooling.test.ts:25-45（mkdtemp home+fakebin，10 处 spawnSync env 覆盖）；假 curl :226-230；本地裸仓库当 remote 先例 helper-scripts.test.ts:1671-1673。
- npm `files` 船运 `assets/`+`scripts/`（package.json:11-25）；`.claude/agents`、`.codex/agents` 不在包内（本计划也不放进去——上游是 Fable-agents，不造第三副本）。

## 全局执行规则（执行者必读）

1. **镜像/清单义务**：改 `check-agent-tooling.sh`、新增 `install-agent-fleet.sh` 必同步 `assets/templates/helpers/` 镜像（byte 一致）；新 helper 必进 `assets/workflow-contract.v1.json` `helpers.scripts` + `.ai/harness/workflow-contract.json`（成对 byte 一致）+ `pi_install_helpers()` 默认清单三处同步。改 policy 默认值必同步 policy.json + ensure-task-workflow 种子(+镜像) + project-init-lib 种子（无镜像）。改 `docs/reference-configs/external-tooling.md` 必同步 `assets/reference-configs/` 镜像。
2. 每次动种子/清单后必跑 `bash scripts/migrate-project-template.sh --repo . --dry-run` 与 `bun test tests/create-project-dirs.runtime.test.ts tests/workflow-contract.test.ts`。
3. **fail-closed 边界**：生成器对上游 frontmatter 形状断言（name/description/model/effort 必在；model∉{opus,sonnet} 或 effort≠max → 报错停，不猜映射）；**安装动作对目标文件 never-clobber**（内容不同 → 报 drift + 跳过，仅 `--force` 覆盖）；init 的 auto-install 失败**不阻断 init**（warn + 继续，readiness 缺口由 check-agent-tooling 呈现——安装是便利，门是检查）。
4. 不得削弱既有硬闸；strict-readiness 新增 fleet 判断只能**新增**失败类，不改 codegraph 判断。
5. 测试零真实网络：上游源必须可用 `REPO_HARNESS_FLEET_SOURCE_DIR`（本地目录）覆盖；fake HOME 全程。
6. STOP 协议与逐片 Verify 贴原始输出，同 authority-closure。
7. bash 3.2 教训：动任何含模板/长文本的 .sh 后逐个 `bash -n`（含镜像）。

## 执行顺序

```
P1 → P2 → ( P3 ‖ P4 ) → P5 → PF
```
P1 policy 地基；P2 安装器（P3/P4 都依赖它）；P3（检测器）与 P4（init 装配线）文件不相交可并行、但同 worktree 建议串行；P5 文档；PF 收官。

## 切片详表

### P1 — policy `fable_agents` 条目 + 双种子面

**Why**：依赖面第一步是声明。仿 waza 8 键形 + codegraph 的自托管/下游双值先例。

- 文件：`.ai/harness/policy.json`（external_tooling，`hai_stack` 之后）；种子面 project-init-lib.sh:2013-2079 heredoc、ensure-task-workflow.sh:1059-1128（+镜像）；tests/create-project-dirs.runtime.test.ts、tests/migration-script.test.ts 结构断言。
- 条目（三面逐字一致，除 install_mode 双值）：
  ```json
  "fable_agents": {
    "source_repo": "Ancienttwo/Fable-agents",
    "source_url": "https://github.com/Ancienttwo/Fable-agents.git",
    "raw_base": "https://raw.githubusercontent.com/Ancienttwo/Fable-agents/main/assets",
    "managed_agents": ["deep-reasoner", "fast-worker", "gatekeeper"],
    "claude_target": "~/.claude/agents",
    "codex_target": "~/.codex/agents",
    "codex_generation": "derive-toml-from-md",
    "install_mode": "<双值>",
    "conflict_policy": "never-clobber-without-force",
    "install_command": "repo-harness run install-agent-fleet",
    "vendoring_policy": "do-not-vendor-agent-bodies"
  }
  ```
  `install_mode`：自托管 policy.json = `"auto-install-on-init"`；两个种子默认 = `"advisory"`（codegraph :378 vs :2068 同款分裂，属声明的刻意双值，测试各自断言各自值）。
- Verify：`bun -e 'JSON.parse(...)'`；`diff -q` ensure 镜像；`bun test tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts`；migrate dry-run。
- **STOP**：pi_merge_json_defaults 合并后现有 repo 的 policy 丢键或值被覆盖（当前值优先语义破坏）→ 停。

### P2 — 安装器 `scripts/install-agent-fleet.sh`（+镜像 + 三处清单登记）

**Why**：安装通道本体。上游 .md 直装 Claude 侧；Codex 侧按映射表生成 TOML；never-clobber。

- 文件：`scripts/install-agent-fleet.sh`（新）+ `assets/templates/helpers/install-agent-fleet.sh` 镜像；`assets/workflow-contract.v1.json` helpers.scripts（47→48）+ `.ai/harness/workflow-contract.json` 成对；`pi_install_helpers()` 默认清单（project-init-lib.sh:1108）；`tests/install-agent-fleet.test.ts`（新）。
- 行为契约：
  1. 源解析：`REPO_HARNESS_FLEET_SOURCE_DIR`（本地目录，测试/离线用）优先；否则对每个 managed agent `curl -fsSL --max-time 10 <raw_base>/<agent>.md`（仿 fetchWazaUpstreamSkills）。任一文件拉不到 → 该文件记 `fetch-failed`，继续其余，最终 exit 非零仅当**全部**失败且目标也全缺（部分成功=部分安装+汇总报告）。
  2. frontmatter 断言（fail-closed）：name/description/model/effort 必在且可解析；`tools` 选填；model/effort 组合必须命中映射表，否则该文件报错跳过（exit 记账）。
  3. Claude 侧：目标 `~/.claude/agents/<agent>.md`（`claude_target` 展开 `~`）。缺失→装；byte 相同→`up-to-date`；不同→`drift`（打印统一 diff 摘要行，**不覆盖**），`--force` 才覆盖。
  4. Codex 侧：从**刚解析的 .md**生成 `<agent>.toml`：映射表 `opus/max→gpt-5.5,xhigh`；`sonnet/max→gpt-5.5,medium`；有 `tools`→`sandbox_mode = "read-only"`；`developer_instructions` = .md 正文 + 空行 + EXECUTION_BOUNDARY 四段（**安装器内嵌该文本**，与 contract-run.ts 常量的 parity 由测试锁——运行时不解析 TS 源）。写入语义同 3（生成结果与现存 byte 比较，never-clobber）。
  5. 输出：逐文件一行 `[fleet] <host>/<file>: installed|up-to-date|drift|fetch-failed|invalid`；`--json` 可选不做（YAGNI）。`--force` 唯一 flag。
- 测试（fake HOME + `REPO_HARNESS_FLEET_SOURCE_DIR` 指向 fixture 目录，仿 check-agent-tooling.test.ts:25-45）：全新安装两侧 6 文件 / 幂等二跑全 up-to-date / 本地改动不被覆盖且报 drift / `--force` 覆盖 / 坏 frontmatter fail-closed / 生成 TOML 与仓库委员的 `.codex/agents/*.toml` **黄金对比 byte 一致**（用 repo 现存三份当 golden fixture——它们就是 C2 手工产物，生成器必须复现之）/ boundary 文本与 contract-run.ts:67-75 常量 parity。
- Verify：`bash -n` ×2；`diff -q` 镜像；`diff -q` workflow-contract 双 json；`bun test tests/install-agent-fleet.test.ts tests/workflow-contract.test.ts tests/helper-scripts.test.ts`；`repo-harness run install-agent-fleet --help 或空跑`（fixture 源冒烟）。
- **STOP**：生成 TOML 无法 byte 复现现存三份 golden（说明映射表推导有误）→ 停贴 diff，不改 golden 迁就生成器。helpers 清单登记引发既有计数断言红 → 按断言语义同步，若断言写死 47 无法自然扩展 → 停回报。

### P3 — check-agent-tooling 加 `detectAgentFleet()`（+镜像）

**Why**：readiness 门。装是便利，门是权威。

- 文件：`scripts/check-agent-tooling.sh`（+镜像）；tests/check-agent-tooling.test.ts。
- 改动：`HOSTS` 加 `agentsDir`（claude: `~/.claude/agents`，codex: `~/.codex/agents`）:96-111；新 `detectAgentFleet()`（仿 :905-947 存在性+hash 形）：per selected host × per managed agent（清单读 policy，读不到用内置默认三名）报 `present|missing`；`--check-updates` 时对 claude 侧 curl 上游 raw 比 hash 报 `drift|synced`（codex 侧为生成物，不做上游比对，只报存在性）；wire 进 `tools:{}` :1396-1402、`printText()`、strict gate :1405-1408 **新增** fleet missing → strictFailure（不动 codegraph 判断）。
- 测试：fake HOME 空目录 → missing + strict 退出码 2；装满 → ok；`--check-updates` + 假 curl → 断言拉取 URL 与 drift 分类。
- Verify：`bash -n`；`diff -q` 镜像；`bun test tests/check-agent-tooling.test.ts`。
- **STOP**：strict gate 改动使既有 codegraph strict 测试变红 → 停。

### P4 — init/migrate 装配线（policy 分级）

**Why**：把「装完 init 就能用」闭环。auto 只对 policy 开启的 repo（自托管）生效；下游默认 advisory。

- 文件：`scripts/lib/project-init-lib.sh`（新 `pi_maybe_install_agent_fleet()`，在 `pi_print_external_tooling_report` 前调用）；调用点 `init-project.sh:490` 一带、`migrate-project-template.sh:1084` 一带；对应测试。
- 行为：读目标 repo `.ai/harness/policy.json` 的 `external_tooling.fable_agents.install_mode`（JSON 读取仿 `pi_workflow_contract_query_lines` :872 的 node/bun 单行）；`auto-install-on-init` 且 mode==apply（migrate 的 dry-run 绝不装）→ 调 `install-agent-fleet.sh`（路径解析仿 :1244-1254），失败 `|| true` + warn；`advisory`/缺键 → 打一行提示含 `repo-harness run install-agent-fleet`。
- 测试：migration-script.test.ts / create-project-dirs.runtime.test.ts：默认 advisory（断言提示行、断言假 HOME 未被写入）；policy 改 auto + fixture 源 → 装入假 HOME；dry-run 模式断言不装。
- Verify：`bash -n` project-init-lib + 两调用方；`bun test tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts`；migrate dry-run（本 repo，断言无副作用）。
- **STOP**：dry-run 路径任何写 HOME 行为 → 停（这是硬红线）。

### P5 — 文档面

- 文件：`docs/reference-configs/external-tooling.md` + `assets/reference-configs/` 镜像：新增 Agent Fleet 节（来源、双 target、生成映射表、install_mode 双值语义、never-clobber/--force、`repo-harness run install-agent-fleet`）。若该文档在 brain-manifest 注册，编辑后按先例跑 `scripts/sync-brain-docs.sh --changed <file>`（每文件一次）。
- Verify：`diff -q` 镜像；`repo-harness run check-task-workflow --strict`。
- **STOP**：无。

### PF — 收官电池

```bash
bun test
bun run check:type
bun run check:hooks
bash scripts/check-deploy-sql-order.sh && bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bash scripts/migrate-project-template.sh --repo . --dry-run >/dev/null
for f in check-agent-tooling.sh install-agent-fleet.sh ensure-task-workflow.sh; do diff -q scripts/$f assets/templates/helpers/$f || echo "DRIFT $f"; done
diff -q assets/workflow-contract.v1.json .ai/harness/workflow-contract.json
diff -q docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md
# 冒烟：fixture 源 + 临时 HOME 全流程装一遍，二跑幂等，改一文件后报 drift 不覆盖
# 冒烟：check-agent-tooling --host both 对临时 HOME 报 fleet 状态；--strict-readiness 空 HOME 退出 2
```

## YAGNI 杀单

1. 舰队版本锁/lockfile——latest main + `--check-updates` 报落后即可。
2. 卸载器、逐 agent 选装 flag、`--json` 输出。
3. TOML→md 反向同步、上游写回。
4. 把舰队文件塞进 npm 包或 repo 种子（上游唯一：Fable-agents）。
5. init 失败阻断——安装是便利，readiness 门才是权威。

## 风险与回滚

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| init 时网络不可达 | 中 | 低 | fail-open warn + advisory 命令 + strict 门另行把关 |
| 上游 frontmatter 形状变化 | 低（上游是使用者自己的仓库） | 中 | 生成器 fail-closed + golden parity 测试即刻红 |
| 生成 TOML 与 C2 手工版不一致 | 中 | 中 | P2 黄金对比 byte 断言，不一致 STOP |
| helpers 清单三处不同步 | 中 | 高 | workflow-contract 双 json diff + helper-scripts 镜像测试 + PF 电池 |
| dry-run 误装全局 | 低 | 高 | P4 硬红线测试（dry-run 断言 HOME 无写入） |
| 覆盖用户本地领先版本 | 低 | 高 | never-clobber 默认 + drift 报告 + 仅 --force |

回滚：全切片可独立 revert；全局目录写入是幂等新增文件，`--force` 之外不会改用户既有内容；卸载 = 手动删 6 文件（文档写明清单）。

## 最脆弱假设

（1）raw.githubusercontent 对 Fable-agents 公开可达（私有化则 curl 401——安装器报 fetch-failed 并提示 `REPO_HARNESS_FLEET_SOURCE_DIR` 本地源替代，不猜 token）。（2）三份 golden TOML 可由映射表纯函数复现（P2 STOP 兜底；若 C2 手工版有非规则性差异，停下来由使用者裁决以哪边为准）。

## Task Breakdown
- [x] P1 policy fable_agents 条目 + 双种子面
- [x] P2 安装器 install-agent-fleet.sh + 三处清单登记
- [x] P3 check-agent-tooling detectAgentFleet
- [x] P4 init/migrate 装配线（policy 分级 + dry-run 红线）
- [x] P5 文档面
- [ ] PF 收官电池

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] P1 policy fable_agents 条目 + 双种子面
- [x] P2 安装器 install-agent-fleet.sh + 三处清单登记
- [x] P3 check-agent-tooling detectAgentFleet
- [x] P4 init/migrate 装配线（policy 分级 + dry-run 红线）
- [x] P5 文档面
- [ ] PF 收官电池
