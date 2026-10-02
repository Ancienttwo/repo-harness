# repo-harness 薄适配

仅在目标采用 repo-harness 时读取。本页不另写 SOP、不授予权限，不复制整套角色定义。目标 checkout、安装版本、实际工具 schema 与项目合同共同决定可用能力；静态观察不证明运行时接通。

## session 与 Bot 共用能力

repo-harness session 模式直接引用当前项目的权威工具/合同结果；Bot 模式从已授权 Host executor 调用同一底层能力并引用返回 ID。候选身份、锁/owner、恢复和验收证据由既有工具维护，SOP 组织工作与汇报，不另建数据库、锁或控制平面。先核对身份/能力、任务/owner、预算/去重、候选/证据、恢复/释放这些小稳接口；缺失时明确未验证/阻塞，最小任务记录只是证据，不补造确定性能力。

正式目标是两模式共用目标 worker 仓库 Git common-dir 的持久 runtime store，原子维护 task/owner/session/request/phase/locks/lease/budget/idempotence/recovery；CLI/MCP 只访问它。branch-versioned Plan/contract/code/test 与外部 audit 各有生命周期，Bot 云摘要不作可写 authority。新 shared store/CAS/跨入口 fence 尚待实现验收，不能把既有 campaign 持久 store 或手写交接日志当其完整实现。退役与 drain/cutover/rollback 引用目标项目同一正式 Plan/contract，不在此复制业务 schema 或 SOP。

## 角色权威

在目标 repo root 定位 `agents/fleet/deep-reasoner.md`、`agents/fleet/gatekeeper.md` 和 `.codex/agents/deep-reasoner.toml`、`.codex/agents/gatekeeper.toml`，读取当前文件与 HEAD。fleet Markdown 是角色语义来源，Codex TOML 是该 harness 的实际模型/effort/sandbox 映射；不要把 Claude 的模型字段直接搬给 Codex。跨版本或缺失时明确阻塞相应角色声明，不创建竞争定义。

| 调度职责 | 权威角色及边界 |
|---|---|
| 设计 advisor | `deep-reasoner`：只读研究、建议；输出 RECOMMENDATION 与 confidence，由 orchestrator 决定，不实现或 ship |
| 独立 auditor | `gatekeeper`：只读冻结 HEAD/范围与证据，输出 VERDICT PASS/FAIL/BLOCKED；不修代码、commit/push/merge 或授权 ship |

参与设计建议的 deep-reasoner 不能以改名方式成为独立 gatekeeper。角色实际未加载时只能注明按其语义审查。如运行时使用 fleet dispatch，按目标 harness 支持的接口显式传 `agent_type` 与 `fork_turns: "none"`（或有界正整数），避免全历史 fork 继承父角色；仍受本任务派生授权、总预算和独立性约束。该接口提示不是启用全局 multi-agent 配置的理由。

具体 checkout HEAD、模型/effort、核对命令和结果存本次任务 records，不写成通用 Skill 默认值；使用时重核当前角色文件及实际映射。

## task-agent 能力发现与限制

先查当前暴露的工具清单/schema 和目标安装版本 CLI help，区分 Herdr `agent`、repo-harness 工具与其他 MCP 提供的 `task-agent`，不可互换。核对 start/send/result/collect/status/history/read/close/cancel 是否真实存在、参数/runner enum、身份/返回证据、取消与关闭语义；只用已发现的接口，不据名字构造命令。

| 能力组（不是承诺的命令名） | 适配必须确认的契约 |
|---|---|
| start / send | 支持 runner、真实 session/任务 ID、提交与实际活动区分、timeout 后可查询/去重 |
| status / history / read | 观察状态的范围、历史完整性、原始证据位置；状态不等于验收 |
| result / collect | 与 candidate/subject 绑定、收集是否持久化、如何取回完整输出 |
| close / cancel | owner、取消/退出确认与结果保存；不能把取消请求当已关闭 |

已核对的 main 源码 `src/cli/commands/task-agent.ts` 确有上述 start/send/result/collect/status/history/read/close/cancel；本次具体基线和源码/安装 CLI 版本存任务 records。旧 checkout/旧安装未定位到接口是版本边界，不是 main 缺接口。`src/cli/mcp/types.ts`/`tools.ts` 的 dev runner enum 仍为 codex|claude，不能据此排除外部 Bot。源码存在不等于安装 CLI/MCP 已暴露或现场可用，实际使用先核验当前 schema/help、权限、身份和结果；未验证则阻塞依赖能力。

dev runner 配置或内部 runner enum 只约束对应执行接口，不排除外部 Codex/Grok/Hermes 等 Bot 使用主 SOP；Bot 入口与 worker runner 分别验收。接入必须有当前 schema、启动/身份与结果读回证据。能力缺失时报告阻塞；仅在已授权且经核验的路径上执行同一任务合同，不换语义、不补造结果。

## 目标机执行边界

main 源码 `src/effects/terminal/herdr.ts` 的 `HerdrEndpoint` 只有 session/configPath/home，命令以本地 session 和 Unix socket 路径执行；task-session 的 fs/ps/kill 亦属于运行它的目标机。不能据此宣称 task-agent 有远程 endpoint；具体源码核对存任务 records，部署环境使用前仍核验当前接口与现场路径。

远程 worker 场景通过 Bot 已授权的 remote executor 在目标 worker 机执行 harness，让上述路径和本地进程操作保持在目标机边界；同时核验目标 cwd、server/session、用户权限与返回 ID，不能把远端路径传给本机接口或伪造远程 endpoint。按需读 [hosts.md](hosts.md)。复用 Host infra 与远控，不重造控制平面；campaign 已选定清晰退役设计，但产品实施另行授权，不由本 Skill 执行删除或承诺已完整替代。

## 只读投影与实现前置

Kanban 目标是 runtime/audit 的只读投影，反馈/澄清/改需求/催办/审批跟进回 Bot 的受控工具，session CLI 保留直接开发。现 main operator server route inventory 的实际 browser write 为 task-message POST；设计删除该路由/handler/composer 及实查其他可变入口，write inventory=0 尚待实施，不能宣称当前 UI 已只读或编造现有 dispatch 按钮。

退役 campaign 专有业务时保留真实其他消费者的 task-agent、contract、ordinary/selected acquisition、lease/budget/idempotence/receipt/cleanup，未知 writer 不 reset budget/重派。draft generic review 的 OAR/task-agent/deep-reasoner 路径不等于 campaign runtime 已迁移；独立性仍遵守主 SOP，不能把 generic role 名称当设计 advisor 可审自身的许可。Claude actual-model/Receipt、隔离与清理缺口依当前源码/合并/现场证据判定，Codex fixture/canary 不证明完整验收。

## 项目证据引用

使用项目既有 plan/contract、subject-bound verification 与 acceptance receipt 的 ID/路径，链接到调度候选记录，不复制第二套 authority。验证证据必须与冻结 HEAD/范围相符；有效已有证据可直接核验，缺失/失败/漂移交执行 owner。gatekeeper 的 PASS、项目 receipt 和实际 push/merge/deploy 状态分别记录，任何一项都不能代替其他项或用户权限。
