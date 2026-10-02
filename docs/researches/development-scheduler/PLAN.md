# 可移植开发调度 Skill：正式 Plan

计划 ID：development-scheduler-v1。[skill/SKILL.md](skill/SKILL.md)是调度原则与硬底线的唯一来源，[Host 接入](skill/references/hosts.md)与 [repo-harness 适配](skill/references/repo-harness.md)按需引用。

Aimpact 于 2026-10-03 04:17 批准本次精简方向。任务 A 在 `codex/dev-scheduler-a-slim`（基于 `bad25106`）只改文档，完成检查、commit、push 和 Draft PR；不 merge、ready、删分支、改运行代码或依赖，不触碰 main 检出、其他 worktree 或 #476/#474/#473/#477。B/C/D 是后续有界任务，各自取得实施授权；删除文件或改依赖前先报告停下。

## P1：边界与事实来源

Bot 负责对话、目标/验收、派工、跟进和结果收集；worker 实现，独立 reviewer 审查。repo-harness session 保留直接开发，Host 提供既有 executor、远控、凭据管理与自动化。Kanban 是只读投影。

第一阶段直接用现有 **task-agent + Herdr + Git 分支/PR 状态**：

| 事实 | 来源与使用边界 |
|---|---|
| 任务、请求、session、执行与结果 | 现有 task-agent 返回/journal 与 Herdr live 观察；状态未知时不猜测完成或未执行 |
| 代码、计划、候选与交付 | 分支、HEAD/范围、项目 plan/contract、verification/receipt 与实际 PR 状态；证据绑定同一 subject |
| 对话、独立审查与恢复 | worktree 外保存的原始证据和真实 session 恢复信息；摘要与 Kanban 只索引，不形成可写副本 |
| 用户意图与权限 | 当前用户对话和明确授权；工具、PASS 与自然语言均不能替代特定动作权限 |

删除“先建新的 Git common-dir runtime store（CAS/revision/fence/lease/单写者交接）再退役”的前置。不设计替代 store、mutation 接口或迁移 schema，也不移除现有 primitives 的约束。**若将来出现真实并发或交接故障，再按需补最小锁，届时另开计划。**

## P2：现有路径与压力点

源码观察基线为任务起点 `bad25106`，不是所有安装环境的能力声明。Bot/session → 当前 CLI/schema → `src/cli/commands/task-agent.ts` → `src/effects/terminal/task-session.ts` → Herdr worker。task-agent 提供 start/send/result/collect/status/history/read/close/cancel，journal 位于 primary root 的 `.ai/harness/runs/task-agents`；`HerdrEndpoint` 是目标机本地 session/configPath/home 和 Unix socket，远控通过已授权 Host executor 在目标机运行 harness。

启动提交与实际活动、result 与 collect、取消请求与确认退出是不同事实。timeout/失联时先查询同一任务与已有候选，**未知 writer 不 reset budget、不重复派工**。人工接手先暂停 Bot 新指令与自动发送、收集在途工作并确认 owner/同一真实 session，明确归还后才恢复；idle/断连不作为交接凭证。该路径不宣称已有完整原子 fence，也不把其建设设为第一阶段门槛。

所有 CLI worker 启动必须复用 **Pi 1.0 / OAR**，由现有 task-agent + Herdr 承载；不写手工 adapter/parser。现场版本尚未接通就暂停相应启动并报告缺口。Herdr 基准 **0.9.3**，实际参数按安装版本 Skill/help。后端默认 **Codex（gpt-6.1-sol high）**，前端 **Claude**；Claude 不使用跳过权限模式（未批准），Claude 只读审查接入另立方案，当前用已验证的 Codex 独立审查路径。

## P3：选择与不变量

用判断替代固定 SOP：只保留任务边界、权限、唯一文件 owner、预算/去重、独立审查、候选与证据、未知 writer 和清理底线。删除每任务四组字段表、process/pane/Tab 三层读回步骤、默认 60 秒巡查；改为按需/事件驱动的有界检查。进程退出不等于全部资源释放，共享资源不得关闭；清理前必须保存并核验可恢复证据。

独立 reviewer 未参与设计/实现，审查同一冻结候选；漂移使旧 PASS 失效，修复后复验 finding。审查同时挑战过度设计、兼容 fallback 和无消费者抽象；测试通过不等于独立审查或发布授权。新 Skill 不继承原文候选 PASS。

取舍是先用现有事实与显式交接获得有界 Bot 协调能力，避免为尚未观察到的并发故障建设运行控制层。10x 任务量首先压迫现有状态查询、结果收集和人工交接；只在实测故障出现后另切最小锁或相应瓶颈，不预建通用 store。Host 加载、Pi/OAR 与多设备能力仍需现场证据，本次文档不冒充产品验收。

## 阶段与准入

| 阶段 | 有界交付与验收 | 准入 |
|---|---|---|
| **A 精简文档** | Skill 约为原来的 1/3；Plan 与两份 references 对齐批准规则；格式、链接、仓库检查；commit/push/Draft PR | 本次已批准，只在当前 worktree 执行 |
| **B Kanban 只读** | 删除实际 browser 写入口，保留进度/阻碍/候选/证据 GET 与刷新；write inventory=0，GET 不写 authority | 后续实施授权；不依赖新 store |
| **C campaign 盘点与冻结准入** | 列出实际消费者、存量任务/资源/在途写入与恢复证据；停止新 campaign admission，已知 owned 工作有界收集/排空，未知 writer 留阻塞 | 后续实施授权；将盘点交 Aimpact 看过 |
| **D 删除 campaign 专用代码与 Docker** | 按盘点删专用面，保留共用 primitives；针对真实消费者验证，无新双读/双写或空壳 | **#476 与 #474 均合并，且 Aimpact 已看过 C 的盘点**；删除文件/改依赖前先报告停下 |

### B：只读 Kanban

基线 `src/effects/operator/server.ts` 的实际 browser write 为 task-message POST。实施盘点并移除该路由、handler/授权 payload/UI composer 及实查其他可变入口，保留 GET 投影。验证 browser write route=0，GET 不产生 mutation；反馈、澄清、改需求、催办和审批跟进回 Bot。不要虚构现有 dispatch 按钮或声称文档已让产品只读。

### C：盘点先于删除

在目标 worker 只读核验版本、live grant/lease/owner、containers、request/outbox、pending mutations 与旧 common-dir runs。policy off 或 tracked tasks/campaigns 缺失不证明无存量。列出每个拟删面的生产/测试/脚本/CI/docs/dependency 引用、非 campaign 消费者及调用链，确定保留/删除边界与恢复材料。

冻结新准入后保留已知 owned 工作的结果、session 和终态；未知 writer 不能拆锁、重置额度或重复派工。盘点和冻结不授权删除，Aimpact 看过盘点以及 #476/#474 合并是 D 的硬门槛；#473/#477 不在任务 A 操作范围。

### D：专用面与共用边界

以下是 C 的盘点入口，不是已经完成的零消费者证明：

| 面 | 删除候选与必须保留的边界 |
|---|---|
| campaign 编排 | 专用 group/slot、GPTPro author lane、successor/fresh-audit、专有 CLI/UI/Skill/schema；task-agent 与普通 contract 仍有真实消费者 |
| acquisition | `src/effects/fleet/acquire.ts`、`src/effects/engineers/scheduling-acquire-next.ts`、`src/cli/commands/engineer.ts` 中 campaign admission/R2/proof/capacity/cutover；保留 ordinary/selected acquisition、authority 与幂等 |
| automation/state/operator | 专用 budget/projection/store 与 campaign 卡片/控制动作；有真实其他消费者的 lease/budget/idempotence/receipt/cleanup 保留，不迁到新 store |
| helpers/adoption/policy | `scripts/contract-run.ts` 及镜像、`scripts/ensure-task-workflow.sh`、standard-plan、policy、Skill manifest 中专有 activation/handoff；保留共用执行、安全、结果收集与恢复 |
| 架构与历史 | 退役后的活跃专用模型/投影按当时授权更新；不可变历史 audit 保留索引，不为历史展示保留产品双读 |
| Docker | `deploy/campaign-container/`、`scripts/build-campaign-image.sh`、`scripts/run-campaign-preflight.ts`、`scripts/cleanup-campaign-container.ts`、`src/effects/automation/campaign-container.ts`、runtime 专用 container/image 与 `BRC_CAMPAIGN_IMAGE` 引用；同步处理专用依赖、测试、CI、文档 |

旧 campaign store 已使用 Git common dir，campaign runtime 直接 Docker 下 Codex exec，不能把它们描述为单纯 worktree 状态或现成 task-agent 薄 consumer。generic review/OAR 路径也不证明 campaign 已迁移；合并门槛满足后仍核验实际安装与消费者。没有真实其他消费者的 campaign-only 机制随专用实现删除，不以“保留安全”为名留 image/脚本空壳。

## 验证、回滚与证据边界

A 只做文档格式/链接、差异审阅和仓库必需检查，不新增执行测试或运行付费故障、Docker、Host 安装、多机配置。测试如确需运行，参数用 `--timeout 60000 --max-concurrency 1`；忽略 GitHub CI。本研究目录不在 npm package allowlist 中，本次不新增安装入口。

B/C/D 冻结各自最小 verification：B 零 browser write 与 GET 无副作用；C 盘点/冻结与未知 writer 保留；D 保留消费者真实路径、存量结果可恢复、旧入口退出。先保存证据再释放 owned 资源，不触碰他人资源；默认保留分支/历史。无需先建 runtime store、迁移全部事实或做两入口 store 验收。

A 文档可 revert 本次提交。C/D 涉及运行状态，回滚先暂停新指令、收集在途与保存原有 journal/预算/候选，再按盘点确认 owner 和恢复路径；单纯 git revert 不证明运行状态已回滚。未确认静止的 writer 保持阻塞，不能销毁未知资源。

原文候选的归档验收见 [历史摘要](../../../tasks/archive/review-20261003-development-scheduler-skill.md)，其 PASS/hash 只绑定原文。此次精简是新文档候选，未执行 Bot/worker 现场集成或独立模型行为验收；Claude 只读审查接入另立方案。
