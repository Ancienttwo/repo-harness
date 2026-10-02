---
name: development-scheduler
description: 在 repo-harness session 或 Bot 中通过 Herdr 调度开发任务、跟进阻碍、组织独立审查和安全交接；用于多角色开发协调，不用于单次代码修改或只读状态查询。
---

# 开发调度

Bot 负责用户对话、目标与验收、派工、监督和结果收集；worker 实现，独立 reviewer 审查。repo-harness session 可直接开发，Bot 模式复用 Host 既有 executor、远控和自动化。第一阶段以现有 task-agent、Herdr、Git 分支与 PR 状态为事实来源，引用原始返回和证据，不另建调度数据库或 Git common-dir runtime store。若将来出现真实并发或交接故障，再另开计划补最小锁。

Kanban 只读展示进度、阻碍、候选和证据；反馈、澄清、改需求、催办和审批跟进回 Bot，经受控工具执行。现有产品写入口尚未移除时，不能宣称 UI 已只读，也不能借 browser write 绕过边界。按需读 [Host 接入](references/hosts.md)与 [repo-harness 适配](references/repo-harness.md)。

## 判断任务是否可派

先读当前要求、项目规则和直接相关计划，确定目标、验收、读写范围、owner、依赖、预算与禁止动作。沿用已有授权直接推进；commit、push、merge、deploy、安装和清理分别受用户授权约束，Skill、建议、PASS 或上传成功都不授予权限。缺失资料或能力时阻塞依赖动作，能独立完成的部分继续，不能合成缺失身份或成功证据。

Herdr 基准版本为 **0.9.3**；控制前按安装版本读 `herdr --skill`、`herdr --help` 和相关命令组帮助，不裸启 Herdr 或用 mutating 命令探路。遵守真实 caller context；外部入口须有明确授权，不伪造 `HERDR_ENV`。核对目标 machine/server、cwd、live 身份和已有任务，采用返回 ID，不凭 UI 焦点、旧 pane ID 或 idle 判断可复用。真实 provider sessionID 与恢复位置来自可核验的 provider metadata/session 记录，pane、Tab、PID 不能代替它；未知身份阻塞相关派工和清理。

后端默认 **Codex（gpt-6.1-sol，high）**，前端默认 **Claude**，具体任务限制优先。Claude 保留正常权限审批，不使用跳过权限模式；Claude 只读审查接入另立方案，当前独立审查使用已验证的 Codex 路径。启动任何 CLI worker 都必须复用 **Pi 1.0 / OAR**，通过现有 task-agent + Herdr 承载；不裸启 provider，不写手工 adapter/parser。安装版本未接通该路径时报告缺口并暂停启动，不以新 adapter 绕过。

按分支目标或独立写边界选择 worktree，避免微任务各建一个；Tab/pane 只是组织视图，不隔离文件。并行 writer 的文件 ownership 不重叠，共有文件交给唯一 owner 或顺序执行。冲突先停写并保存 WIP，前任确认停写后再交接，不能 stash、覆盖或终止他人工作。派工前核对同目标/角色/候选的未完成任务、已有结果和总预算，包含复用进程、descendants 与 reviewer 槽位；容量不足就排队，未知额度不能声称充裕。

## 按事件跟进，按证据收敛

给 worker 目标、冻结验收、输入来源、owner/读写范围、禁止动作、预算、结果位置和停止条件；记录足够定位任务、真实 session、候选及原始证据的引用，不逐任务抄登记字段表。提交成功不等于执行，须有活动或结果证据。每个派发任务收集结果，或保存明确取消及其确认状态。

按需或在结果、阻碍、审批、停滞、交接等事件发生时检查；长任务使用与风险和耗时相称的有界检查窗口，不默认每 60 秒巡查。quota 耗尽就停新派并保存成果；timeout、失联或 unknown 不证明未执行：先查原任务、活动、候选与 session，**未知 writer 不 reset budget、不重复派工**。取消未确认仍占预算，不能宣称退出或关闭；诊断无新证据时保存阻塞事实并报告，不无限轮询或偷换 provider。

人工接手先暂停 Bot 新指令与本任务自动发送，收集在途工作，确认 owner 和同一真实 session 后显式交接；Bot 只读观察。当前 owner 明确归还、在途状态与预算/去重核对后才恢复。idle、断连或关窗不是交接凭证，状态不明就保持暂停；不把现有连接或手写记录称作原子 fence。

冻结分支、HEAD/范围与已有候选证据后再审查。独立 reviewer 用未参与设计/实现的 session，只读候选，只写指定 review；advisor 不能改名审自己的设计，跨 provider 也不自动独立。提供原始材料和验收，不附作者自评或预期 verdict。审查结论须绑定同一候选，漂移使旧 PASS 失效。保留 finding、修复依据及复验结果；不能换 reviewer 刷 PASS，也不能把测试通过当独立审查或发布授权。

优先从真实输入到副作用追根因，审查同时挑战过度设计、fallback、双重 authority 和无消费者抽象。必要安全与验证保留，新增需求走范围变更；返工或争议不收敛时交用户裁定，保留 unresolved。

## 先保存证据，再清理

释放 owned 资源前，在 worktree 外保存可恢复代码/分支、有用 untracked、候选、验证、review/finding、对话证据，以及真实 sessionID、位置和恢复方式；脱敏并核验可读取/恢复。未保存、恢复失败、owner 不明或权限不足就保留资源并报告。正常退出 owned 进程，按实际资源确认处置；进程退出不等于 pane/Tab 已关闭，共享 Tab 保留并说明 owner/原因，不升级为 kill 主 Herdr/server 或关闭他人资源。worktree 清理单独判断，默认保留分支和历史。

最终报告实际成果、候选/PR、检查与审查结果、未验证能力、证据恢复位置和资源处置。格式检查只证明格式，源码接口存在只证明源码；隔离模拟、现场能力、验收和发布分别陈述，不用旧候选 PASS 覆盖修改后的 Skill。
