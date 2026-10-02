# repo-harness 适配

目标采用 repo-harness 时按需读取；[共用 Skill](../SKILL.md)拥有调度规则，项目合同拥有验证和验收。第一阶段直接引用现有 task-agent、Herdr、Git 分支/PR 与项目证据，不新建 common-dir runtime store；真实并发/交接故障出现后才另开最小锁计划。

## 事实与执行路径

先核对当前 checkout、安装 CLI help 和实际工具 schema，区分 Herdr `agent` 与 harness `task-agent`。源码入口 `src/cli/commands/task-agent.ts` 提供 start/send/result/collect/status/history/read/close/cancel；它调用 `src/effects/terminal/task-session.ts`，任务 journal 位于 primary root 的 `.ai/harness/runs/task-agents`。引用其 request、session、结果和取消状态，分支/HEAD 与 PR 表示代码及交付状态；不把源码存在或进程 idle 当执行完成。

启动任何 CLI worker 必须复用 **Pi 1.0 / OAR**，由现有 task-agent + Herdr 承载，不另写 adapter/parser；缺失已验证路径就暂停该启动。默认后端 Codex（gpt-6.1-sol high）、前端 Claude。Claude 保留正常权限，只读审查接入另立方案。Herdr 基准 **0.9.3**，命令语法以现场 Skill/help 为准；本页不声称这些集成已在每个安装版本接通。

`src/effects/terminal/herdr.ts` 的 endpoint 是本地 session/configPath/home 与 Unix socket；远程场景由已授权 Host executor 在目标机调用 harness，不伪造远程 MCP endpoint，参见 [hosts.md](hosts.md)。Bot 入口与内部 runner enum 分别核验，后者不能排除外部 Grok/Hermes Bot。

## 独立审查与项目证据

需要 repo 角色时读取当前 `agents/fleet/deep-reasoner.md`、`agents/fleet/gatekeeper.md` 及对应 `.codex/agents/*.toml`：Markdown 说明角色，TOML 说明实际模型/effort/sandbox。缺失或未加载时只声明语义参考。deep-reasoner 给设计建议，不能审自己的设计；gatekeeper 独立只读，不修复或授权 ship。当前使用已验证的 Codex 审查路径，不以未落地的 Claude 接入替代。

引用项目 plan/contract、同一 subject 的 verification 和 acceptance receipt，不复制 authority。审查前后核对候选 HEAD/范围，漂移使旧结论失效；有效旧证据可复用，缺失/失败交执行 owner。PASS、receipt、push/merge/deploy 与用户授权分别成立，不能互相代替。

## Kanban 与 campaign 边界

Kanban 只读观看进度、阻碍、候选和证据，反馈/改需求/催办/审批跟进回 Bot；session CLI 保留直接开发。基线 operator browser write 为 task-message POST，阶段 B 实施删除实际写入口并验证 write inventory=0，此文档不声称已完成。

campaign 后续按 [正式 Plan](../../PLAN.md)先盘点并冻结准入，再删除专用代码和 Docker；阶段 D 等 **#476/#474 合并且 Aimpact 看过盘点**。保留有真实其他消费者的 task-agent、contract、ordinary/selected acquisition、lease/budget/idempotence/receipt/cleanup primitives。未知 writer 不 reset budget、不重复派工；任何删除文件或改依赖前先报告停下。此 Skill 不执行退役或扩大授权。
