# 架构 Research Report:docs/architecture 真相来源闭环(queue engine + freshness gate)

> **Date**: 2026-06-12
> **Repo baseline**: repo-harness 0.3.0,commit `9e32602`
> **Status**: 格局判断,方向已批准;执行经 `tasks/sprints/20260612-0256-architecture-doc-loop.sprint.md`
> **Companion plan**: `plans/archive/plan-20260612-0255-architecture-doc-truth-loop.md`(规划记录;sprint 为执行权威)
> **External review**: Codex(waza-think,2026-06-12)两轮,背书终态并收紧执行,delta 已并入 §4

## 0. 问题与来源

原始问题:`docs/architecture/*` 按 capability 记录架构文档,但没有生成指令或触发来做归档与索引;有改动时文档应及时更新,作为真相来源。

| 来源 | 形态 | 用途 |
|------|------|------|
| 本仓库架构文档子系统实地探查(2 轮 Explore + 人工验证) | `scripts/architecture-*.sh`、`docs/architecture/*`、`.ai/hooks/*`、policy/contract | 现状与根因 |
| Codex 外部评审(waza-think,本日两轮) | 评审意见全文(已并入 §4) | 终态背书 + 执行收紧 |
| `.ai/context/capabilities.json` v1(7 capabilities) | capability 注册表 | 粒度模型依据 |

## 1. 现状解剖(P1/P2)

### 1.1 P1:子系统地图

写入端**完整存在**:

```text
Edit/Write
  -> repo-harness-hook PostToolUse(host 薄入口)
  -> .ai/hooks/post-edit-guard.sh
  -> scripts/architecture-drift.sh record --file <path>
       ├─ classify_change(high/medium/low/none)
       ├─ capability-resolver.ts match(longest-prefix)
       ├─ 写 docs/architecture/requests/<ts>-<block>-<path>.md(per-file request)
       ├─ append 行到 docs/architecture/index.md
       └─ append 事件到 .ai/harness/architecture/events.jsonl
  -> context-contract-sync.sh sync-latest(局部 AGENTS.md/CLAUDE.md 受控块)
```

关账端**部分存在**:`archive-architecture-request.sh`(终态 Resolved/Superseded/Rejected/No architecture change,移入 `requests/archive/YYYY/`、删 index 行、清契约 marker);agent 侧 resolve 协议在 `assets/skill-commands/repo-harness-architecture/SKILL.md`。

**消费端不存在**:没有任何触发器、门禁或检查消费 pending 队列。policy.json 铁律写明 "hooks record drift…; agents author semantic snapshots and diagrams",但没有任何机制启动 agent 的 author 动作。

### 1.2 P2:损坏实况(2026-06-12 实测)

- 27 个 pending request 文件全部来自 2026-05-28/29,堆积两周无人处理;收敛后只对应 4 个 capability(runtime-harness-hook-adapters 23 个、workflow-engine-contract-assets 2、verification-evals-checks 1、root 1)。
- `docs/architecture/index.md` 受控段已损坏:`## Pending Requests` 显示 "(none)",29 条含重复条目(如 `20260528-222416` 同秒两行)落在 `## Review Backlog` 段下。
- `.ai/harness/architecture/events.jsonl` 为空(session-start 轮转后)。

### 1.3 根因(已逐条验证)

1. **无锚点 append**:`architecture-drift.sh:456` 用 `printf >> index` 追加到文件末尾,不锚定章节;index 尾部后来加了 `## Review Backlog`,条目从此全部落错段。
2. **prune 晚于 backlog**:`prune_superseded_pending_lines`(L191)是 2026-06-10(`a4ad852`)才引入的,整个 backlog 形成于 05-28/29;且它只删 index 行、不归档 request 文件,违反 "requests/ pending-only" 不变量。
3. **并发竞态**:同秒重复行来自并发 PostToolUse hook 在 grep-dedup(L455)与 append(L456)之间的 race。

## 2. 格局判断

### Thesis

缺的不是"一条生成指令",而是闭环:把架构文档体系从「per-file 追加队列 + 盼望有人处理」重构为「**per-capability dirty card + 全派生 index + 切片关账门禁**」。"真相来源"的属性来自门禁强制而非自觉;"及时更新"的正确定义是**每次 merge 到 main 时文档与代码同一变更集落账**,而不是 per-edit 实时改写文档。

### Confidence

medium-high。不确定处:strict 门禁误报率/疲劳度未实测(故 advisory 分阶段);per-capability 粒度是否过粗要跑一个 sprint 才知道。

### The Trap

- **Inherited constraint**:现有 per-file request 格式 + 增量改写 index 的实现("已有 27 个 request 和 index 结构,顺着补个处理脚本就行")。
- **Is it real?**:No。request 文件格式不是对外契约——唯一消费者 `archive-architecture-request.sh` 只解析 `> **Status**:` 行;index 增量状态机已被实践证明损坏。保留它只是惯性。

### Frame-Opening Move

Kill the wrong concept + Ten-times question。队列单元粒度错配:生产者粒度是 file edit,消费者(module doc 刷新)粒度是 capability,错配产生 27:4 的堆积比。10x 之下(70 capability、10x 编辑量)per-file 队列变 270 条死账;dirty-card 模型上限 = capability 数,派生 index 天然自愈、竞态变幂等。

### Bold Takes(kill list)

- **删除** `prune_superseded_pending_lines` 和 append-to-EOF 逻辑,不修复;append+prune 状态机换成"扫目录、重写受控块"。
- **删除** `architecture-drift.sh` 整个脚本:detect/classify/event 逻辑吸收进 `architecture-queue.sh record`,一个 CLI 拥有 request/card/index 完整契约(§4 Codex delta)。
- request 文件名从时间戳改为确定性 `requests/<capability_id>.md`——一 capability 一卡由文件系统结构保证,不靠逻辑保证。
- index.md 的 Pending 段降级为派生产物(BEGIN/END 注释标记,对齐 `tasks/current.md` "derived snapshot" 与 ARCHITECTURE CONTRACT block 先例);人类只拥有 prose 段。
- hooks 永不写 prose(铁律保留),agent 在关账时被门禁逼着写。
- 27 条存量不逐条处理:triage 收敛 4 张卡,3 次 module 刷新 + 1 次 no-change,清零。

### Options

| Option | 优化什么 | 成本 | 结论 |
|---|---|---|---|
| Conservative:补一个"处理队列"脚本 + session 提醒,保留 per-file 队列与增量 index | 最小 diff | 损坏的状态机和堆积模型原样保留,仍靠自觉 | reject |
| Clean target:dirty card + 派生 index + 直接 strict 门禁 | 纪律最快建立 | 误报率未知即上硬门禁,可能立刻门禁疲劳 | 不直接采用 |
| **Staged clean path**:同 clean target,`freshness_gate: advisory` 出厂,跑一个 slice 后 config-only 翻 strict | 同样的终态 + 可控落地 | 多一个 policy 开关 | **adopted** |

### What Not To Do

- 不修 prune 的正则/锚点——整条 append/prune 路径删除。
- 不让 hook/script 自动改写 module prose(违反铁律,产出 AI slop 文档);不做 per-edit agent 文档生成。
- 不在 PostToolUse 做硬拦(hook 高频、并发、30s timeout;block 只属于 finish/check)。
- 不抽 `scripts/lib/architecture-lib.sh` 共享库(`pi_install_helpers` 只装平铺文件)。
- 不让 hook 冷启动 full commander CLI(host 适配层走既有 `repo-harness-hook` 薄入口)。
- 不新增 service 或后台 daemon。
- slice 3 落地前不对本仓库跑 `migrate-project-template.sh --apply`(旧 `assets/templates/helpers/` 会覆盖新 `scripts/`)。

### Falsifier

1. advisory 期间警告高频且多数是"无需文档更新"的误报(`gate_min_severity` 调不动)→ 分类/粒度模型错了;
2. 单卡 Touched Files 混入多个不相关改动,resolve 变大杂烩 → per-capability 过粗,需按 plan/slice 切卡(v1 不预先复杂化);
3. 下游仓库(无常驻 agent)卡只积不清 → 产品化默认值改 off 或另设消费机制。

### Payoff Ledger(收益账单)

| Move | 现在付的价 | 买到什么 | 何时可见 |
|---|---|---|---|
| 删 append/prune,Pending 段全派生 | 重写 record 的 index 路径 + 新 reindex | 错段/重复行/竞态这类已发生的 index 损坏结构性消失;`reindex --check` 进必查项后损坏无法潜伏 | slice 1 当天,reindex 修复现网损坏 |
| per-file → per-capability dirty card | 改 record + 新 upsert + 一次 triage | 队列上限从 O(edits) 变 O(capabilities)(27→4);resolve 工作量与编辑量解耦 | triage 运行即时 |
| drift.sh 吸收进 queue CLI | 迁移 detect/classify + 更新两份 post-edit-guard | request/card/index 单一所有者;hook 只编排,逻辑可测试 | slice 1 合入后首次 record |
| finish/check 门禁(advisory→strict) | contract-worktree 插桩 + 新 required check + policy 开关 | "文档是真相来源"从口号变成可执行 SLA:strict 后 workflow-surface 改动无法带着文档欠账 merge | 第一个被警告的 slice;翻 strict 后第一次 block |
| 同步产品化进 assets/ | helpers/contract/parity 测试三处同步 | 下游 init/migrate 的仓库天生带闭环,不再继承"只记录不消费"的半成品 | slice 3 后第一个新 scaffold |
| 27 条 backlog 清零 | 3 次 module 刷新 + 4 次归档 | 根契约 pending marker 清除;session-start 不再背两周陈账 | slice 1 结束 |

## 3. 目标模型设计

### 3.1 调用链(分层)

```text
Codex/Claude host hook
  -> repo-harness-hook PostToolUse --route edit     (既有薄入口,hot path,不冷启动 full CLI)
  -> route registry
  -> .ai/hooks/post-edit-guard.sh                   (只编排)
  -> scripts/architecture-queue.sh record --file <path>   (queue CLI 拥有完整契约)
       ├─ detect/classify/capability 解析(吸收自 architecture-drift.sh)
       ├─ upsert docs/architecture/requests/<capability_id>.md(经 architecture-event.ts)
       ├─ 写 events.jsonl(完整 per-edit 审计流)
       └─ reindex(重写 index 受控块)
```

实现分工:shell 只做 orchestration;card merge、JSON parsing、deterministic rendering 进 `scripts/architecture-event.ts`(bun 缺失时 record 降级 WARN 跳过卡片更新,不做 bash 双实现)。

### 3.2 Dirty card

- 路径:`docs/architecture/requests/<safe_token(capability_id)>.md`;文件存在 == 卡片打开。
- 合并语义(新 edit 进入 Pending 卡):`Last Updated`=新事件时间、`Severity`=max、`Open Edits`+=1、`Contract Sync Required`/`Spawn Recommended`=逻辑或、`## Touched Files` 按路径 upsert(first/last/次数/每路径 severity)、`## Latest Event` JSON 替换。不变:`Status` 首行(archive 脚本解析点)、`Detected`、capability/module/workstream 行。
- 兼容审计:`archive-architecture-request.sh` **零改动**(Status 行 awk 重写、归档重名加时间戳前缀、index 行清除、契约 marker 清除全部按原逻辑工作);events.jsonl schema 不变,仅 `request_file` 指向卡片;`context-contract-sync.sh`、`capability-context --from-latest-architecture-event`、`workstream-sync.sh --request` 不受影响。

### 3.3 派生 index

`## Pending Requests` 下 `<!-- BEGIN/END ARCHITECTURE PENDING REQUESTS -->` 标记内由 `reindex` 全量重写(复用 `context-contract-sync.sh replace_contract_block` 的 marker 平衡 awk);空态 `- (none)`;额外清除标记外任何 `^- \[ \] .*\]\(requests/...\)$` 游离行(即治愈现网 Review Backlog 污染,人工 prose bullet 不匹配、保留);`reindex --check` 只比对不写,即 index 完整性检查。

### 3.4 子命令

| 子命令 | 职责 | 关键语义 |
|---|---|---|
| `record --file <path>` | detect/classify/upsert/reindex(hook 热路径) | 输出保持 `[ArchitectureDrift] Request: <path>` 前缀(post-edit-guard grep 契约) |
| `status [--format text\|json\|summary] [--paths-from -] [--gate]` | 列开卡、severity、age;`--paths-from` 批量过滤;`--gate` 应用 policy | exit 0 通过/advisory 警告,exit 3 strict 命中 |
| `reindex [--check] [--quiet]` | 派生重写受控块 / 只比对 | 幂等、自愈 |
| `triage --before <cutoff>` | legacy per-file 收敛为卡 + 成员 Superseded 归档 + reindex | 只动 cutoff 之前的 legacy;新近 pending 列出不动;幂等 |
| `check` | reindex --check + status --gate 全仓 | 完整性恒硬失败;新鲜度仅 strict 硬失败 |

### 3.5 门禁与 fail 语义

- `contract-worktree.sh finish_worktree` 在 `verify-sprint.sh` 前插 `check_architecture_freshness`:变更集 = merge-base diff ∪ working-tree porcelain,经 `capability-resolver.ts match --paths-from -`(批量,本次新增)解析,与开卡(≥`gate_min_severity`)求交;off 跳过、advisory 警告+指路 resolve 协议、strict exit 1。
- `scripts/check-architecture-sync.sh` 进根 Required Checks + `package.json` `check:architecture-sync`。
- **fail 语义**:advisory/off 缺依赖 fail-open + WARN;**strict 与 check 缺 queue/resolver 必须 fail-closed**。
- session-start 输出一行摘要:"N capabilities have pending architecture drift (oldest Xd)"。
- policy 新键:`architecture.freshness_gate`(advisory 出厂)、`gate_min_severity`(medium)、`pending_block_begin/end`、`queue_script`。

### 3.6 产品化(下游)

下游脚本经 `assets/templates/helpers/`(平铺)由 `pi_install_helpers` 安装,名单来自 workflow contract `helpers.scripts`:新增 `architecture-queue.sh`、`check-architecture-sync.sh`,**移除 `architecture-drift.sh` 并加入下游 retired-removal 清单**;两份 workflow-contract 字节级同步;seed index 加标记;下游 policy 模板默认 `freshness_gate:"advisory"`(off 为文档化 opt-out)。

## 4. 外部评审与采纳的 delta(Codex,waza-think)

| # | Codex 意见 | 采纳结果 |
|---|---|---|
| 1 | strict/check 缺 queue/resolver 必须 fail-closed;advisory/off 才可 fail-open | **采纳(修正原稿一律 fail-open 的缺陷)** |
| 2 | shell 只做 orchestration;merge/JSON/渲染进 architecture-event.ts | 采纳;放弃 bash 双实现 fallback,降级为 WARN 跳过 |
| 3 | triage 不得盲目 supersede 新近真实 pending;只清 05-28/29 legacy 债 | 采纳;`triage --before <cutoff>` 护栏 |
| 4 | 本工作先于 loop-engine-01 执行(loop-engine 持续改 hook 表面,先修队列避免新欠账);不动 loop-engine sprint 内容、不进 todo.md、isolated worktree | 采纳;见 §6 执行序位 |
| 5 | hook 触发 CLI 的正确分层:host adapter → repo-harness-hook 薄入口;repo-local hook 调 repo-local helper;post-edit-guard 改调 `architecture-queue.sh record`,queue CLI 拥有完整契约;不冷启动 full commander | 采纳;`architecture-drift.sh` 被吸收删除 |
| 6 | strict gate 不放 PostToolUse;block 只在 contract-worktree finish / check | 采纳(与原稿一致,显式化为原则) |
| 7 | `package.json` 加 `check:architecture-sync` script | 采纳(slice 2) |

## 5. 验证路径

### 5.1 测试(`tests/architecture-queue.test.ts`,复用 tmp-git-repo 工装)

1. dedup-merge:同 capability 两路径 record → 恰一张卡、Severity=max、Open Edits=2、标记内恰一行;
2. reindex 幂等 + 自愈:两次字节一致;注入游离/重复行与伪 `## Review Backlog` → 清除且 prose 保留;`--check` 治愈前 1/后 0;
3. triage:legacy fixtures → 每 capability 一卡 + 成员 Superseded 入 archive + index 干净;cutoff 之后的 pending 不动;二次运行 no-op;
4. 门禁:off/advisory/strict × 命中/未命中 → 0 / 0+警告 / 阻断;strict 缺 resolver 阻断(fail-closed),advisory 缺 resolver 放行+WARN;
5. archive 往返:归档唯一卡 → `- (none)` → 下次 record 重建。

另:hooks parity(post-edit-guard 镜像锁 slice 1、session-start 镜像锁 slice 2)、workflow-contract 字节相等、scaffold-parity 快照、migrate dry-run。

### 5.2 Proof point(真实 backlog,slice 1 出口)

```bash
bash scripts/architecture-queue.sh status                     # 27 legacy → 4 capability 分组
bash scripts/architecture-queue.sh triage --before 2026-06-01 # 4 卡;27 条 Superseded;index 自愈
bash scripts/architecture-queue.sh reindex --check            # exit 0
# agent resolve pass(repo-harness-architecture 协议):刷 3 个 module 文档 + 归档 4 卡
ls docs/architecture/requests/*.md                            # 清零
bash scripts/check-task-workflow.sh --strict && bun test
```

### 5.3 成功标准与回滚

成功标准:① 真实 backlog 清零且 `reindex --check` 进 Required Checks 后持续通过;② index 受控块与 requests/ 目录扫描恒一致;③ advisory 跑满一个 slice 后信噪比支持翻 strict;④ 下游新 scaffold 自带闭环。

回滚:`freshness_gate:"off"` config-only;triage/归档产物 git 跟踪、各 slice worktree 原子合入可 revert;运行时降级见 §3.5 fail 语义。

## 6. 执行

- Program sprint:`tasks/sprints/20260612-0256-architecture-doc-loop.sprint.md`(4 个 contract slice,串行)。
- 序位:**先于 `loop-engine-01`**;active-sprint 标记仍指向 loop-engine(one-active-sprint 不变量),本 sprint 经 `sprint-backlog.sh start-task --sprint tasks/sprints/20260612-0256-architecture-doc-loop.sprint.md` 显式覆盖操作,或在 loop-engine 完结/归档后正式激活。
- Approved plan(规划记录):`plans/archive/plan-20260612-0255-architecture-doc-truth-loop.md`(Task Breakdown = 4 slices;capture 后被并发会话的 verification-blocker 清理归档——harness 不变量:active-plan 槽位只属于带 contract 的执行 plan。sprint 为执行权威,每个 slice 经 start-task 捕获自己的 slice plan,isolated contract worktree 执行)。
- 研究面迁移(用户补充的架构决策,slice 4):`docs/researches/*` 成为研究报告唯一权威面——本报告即新契约的实例;`tasks/research.md` 退役为 tombstone 指针,ResearchGate、capture-plan 模板、check 脚本、workflow-contract、根契约、下游 seed 全部随 slice 4 改写,旧文件进下游 retired-removal 清单。
