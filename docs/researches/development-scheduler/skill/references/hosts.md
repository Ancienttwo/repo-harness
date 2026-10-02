# Host 接入与远控

按需用于 Bot 加载、worker 机远控或跨设备接手，调度判断以 [共用 Skill](../SKILL.md)为准。复用 Host 既有 skills、executor、凭据管理和自动化；不新增控制平面。安装、登录、配置或 server 更新按用户授权执行。

## 加载与能力边界

先读具体 Host 当前暴露的工具/schema，确认能读取同一版本的 Skill 与两份 references、取得真实 session/任务身份、执行并收集结果、外部保存证据及暂停自动发送。只用已发现的接口；缺失能力标未验证并阻塞依赖动作，不猜配置键或兼容性。

- Grok Bot 对话保存与 Grok Build 本地目录是不同入口；任意 SKILL.md ZIP native import 未建立。用获授权材料入口提供原文件与 canonical 版本，回读实际内容和 references；“已保存”或标题不证明完整加载。用户多设备使用反馈是 user-reported，不能当本 Skill 实测。
- Codex、Claude、Hermes 按各自实际 Host 的加载机制引用同一 canonical 内容，不从 CLI 目录推断 Bot/云端账户可用。此仓库 Codex runtime source 为 `~/.codex/skills`，`~/.agents/skills` 是 staging/cache；本任务不全局安装。
- Hermes external dirs 不是写保护，project/profile 同名 Skill 可 shadow 外部版本。核对加载来源与内容，不用 `/learn` 重写共用 Skill；改变权限或 profile 另按授权。

后端 Codex（gpt-6.1-sol high）、前端 Claude；Claude 不跳过权限，Claude 只读审查接入另立方案。所有 CLI worker 必须经既有 **Pi 1.0 / OAR + task-agent + Herdr** 路径启动，不手写 adapter/parser。加载 Skill 不证明 runner、remote executor 或 MCP 已接通。

## 远控与交接判断

Herdr 基准 **0.9.3**，具体参数以目标安装版本 `herdr --skill`、help 为准。新增 machine/profile 可能安装、启动或替换远端 server 并影响进程，不能当只读发现。只操作获授权机器，凭据留在既有管理面。

采用返回的 profile 和该 server 的 live workspace/pane/agent ID，远控操作始终绑定同一目标；不能复用本机 ID。连接失败不切回 Local，也不盲目重发。通过已授权 remote executor 在目标机执行 harness，使 cwd、fs/ps/kill 与 socket 留在目标机边界。

另一设备接入同一任务/真实 session 前，停止 Bot 新指令和自动发送，核对在途工作与 owner；明确归还后才恢复。未知 writer 保持暂停，不 reset 或重复派工。仅有连接能力不证明安全交接或完整验收。记录本次实测与未验证项；现场接入未完成时不宣称多设备通过。Kanban 只读，反馈和审批跟进回 Bot。
