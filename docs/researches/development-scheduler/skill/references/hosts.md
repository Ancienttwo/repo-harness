# Host 薄接入与远控

按需用于 Host 接入、worker 机远控或另一设备人工接手。始终引用 [共用 Skill](../SKILL.md)，不复制调度 SOP。以下描述能力接口，不是全后端兼容声明；安装、新增配置、登录与 server 更新分别授权，本页不自动实施。

## Host 接入与小稳自检

优先设计验证 Grok Bot 多设备流程：用户报告其现有流程“用顺手”，并同意优先用它做设计验证。这是 **user-reported** 使用反馈，不是本 Skill 的兼容性、远控或跨设备实测证据；本次仅授权方案/Skill 验证设计，未授权向 Grok 派外部任务、实际多机登录、凭据或 profile 配置。

设计验证复用用户现有 Grok Bot 与设备路径：列出 Bot 入口→已授权 remote executor→worker 机→同一 Herdr/provider session→另一设备人工接手的能力与交接检查，先用原始隔离场景评估 Skill 的决定。真实连通、执行读回、暂停自动化及交还控制需另行授权后的现场证据，不能把设计通过写成多设备通过。dot 先按当前获授权的单机流程验证实际能力，不自动扩展到远控；Hermes 与其他 Bot 逐项自检后再决定可用步骤。

先读 Host 当前官方 skills/tool/executor 文档和实际暴露 schema。利用既有 Skill 发现/加载机制引用本包，让 Bot 调用已授权的工具；只配置官方明确存在的入口，不猜 Host 配置键、Hermes 命令或 GPTdot 的本机控制权限。安装另议。复用 Host 的云端 infra、远控、凭据管理和自动化，不新增调度数据库、锁服务或控制平面。

| 入口 | 接入方式与须核验项 |
|---|---|
| Codex Bot | 通过该 Host 已有 skills 加载机制引用本包；核验真实 session metadata、执行/读回工具、权限与持久证据目录 |
| GrokBot | 优先上述多设备设计验证；查当前 Skill/工具加载和 remote executor 接口，内部 worker runner enum 不决定 Bot 入口是否可用，分别验收 |
| GPTdot | 先确认用户所指具体 Host/客户端，沿用当前单机授权；查实际工具及电脑权限，不能用名称推断 shell、Skill 安装、Herdr socket 或远控能力 |
| Hermes | 查当前官方 Skill/工具配置入口及实际返回；不编造命令、配置键或现成 Herdr/MCP integration |
| 其他 Host | 按相同能力接口核验；不要求复制本包或改主 SOP |

自检只用获准的只读或无害操作：能否加载同一 Skill；能否取得真实 session/任务身份；能否在目标机有界执行并读回原始结果；能否引用权威 candidate、owner/锁、恢复与验收 ID；能否外部保存证据；能否停止自动发送并处理明确控制交接。每项记录 schema/版本、命令/结果、目标机与权限、已验证/未验证/阻塞。缺一项不合成替代能力；独立不受影响的工作可继续。Host 加载成功不等于 remote executor、worker runner 或 MCP 接通。

任务证据分列 **user-reported**（用户原话/来源与适用范围）、**实测**（本次命令、目标、返回及 evidence）和 **未验证**（缺什么与所需授权）；隔离模拟另标模拟，不与真实设备实测混写。仅设计授权时保存能力清单、原始场景和待现场检查项，不执行外部派工或设备配置。

## 加载同一版本：Bot 与 native local 入口

以下入口已核对官方文档，属于**文档核验**，不是本轮安装、上传、加载或 Herdr integration 实测。Grok Bot 与 Grok Build 是不同入口；Codex CLI、Claude Code 本地目录也不自动适用于相应 Bot、Desktop、Work 或云端账户。本轮未向任何 Bot 上传、启动 routine、安装技能或配置远控。

### Grok Bot：保存与引用

官方 [overview](https://docs.x.ai/grok-bot/overview) 与 [Skills, routines and automations](https://docs.x.ai/grok-bot/skills-routines-and-automations) 描述通过对话保存命名 Skill、桌面 `/` 引用、Marketplace 支持的 packaged skills，以及 Private skills 管理入口 `Your plugins → Manage plugins and skills`。这些资料未建立任意本地 `SKILL.md` ZIP 的 native import 规范；不能把 Grok Build 的目录规则移给 Bot。

建议材料交接流程（**未验证 native import**，不是新增 SOP）：

1. 用户在该 Host 支持且获授权的文件/材料入口提供同一版本 `SKILL.md` 与两份 `references/`，附 canonical 来源、版本/候选 handle 和文件清单；正式项目设计另引用其 Plan。无法提供或读取 references 就报告缺失，不猜上传格式。
2. 要求 Bot 阅读原文件，并按原文保存/引用这份唯一 SOP，保留按需 references 和 canonical 指向；不总结改写成竞争 SOP。对话保存是官方入口，但这种完整原文材料交接仍需现场确认，不承诺 Bot 必然逐字保存。
3. 保存后让 Bot 展示实际保存内容、名称/可用 ID、版本及 references 引用；对照 canonical 核对内容和引用可访问性。只展示标题或回复“已保存”不证明完整加载。不能回读或内容被改写时标未验证/阻塞，不认定导入成功。
4. 引用时按 Host 实际界面选择已保存 Skill，重新核对 canonical 版本、内容漂移及 references；切换新 canonical 前检查同名旧副本与在途任务，明确版本交接，不能同时维护两份可写 SOP。每次任务仍沿用共用 Skill 的权限和身份检查。

Grok 多设备顺手是 user-reported；上述导入设计和远控设计未做 Grok 实测。GPTdot/Codex Bot 先识别具体客户端及其官方材料/skills 入口；未知入口标缺口，不套用 local CLI 目录。其他 Bot 同样先发现能力，再选择材料引用或已文档化加载路径。

### Native local：官方加载位置

目录仅是以后获授权安装时的定位说明，本页不执行复制或配置。每个入口都需现场核对当前版本、实际发现内容、来源与同名冲突，保留同一 canonical SOP，不根据目录存在宣称可用。

| Host | 文档化入口 | 边界与核对 |
|---|---|---|
| [Grok Build](https://docs.x.ai/build/features/skills-plugins-marketplaces) | 从 cwd 向 repo root 查 `.grok/skills/`；用户 `~/.grok/skills/`；启用 plugin 的 skills | 本地 Build 入口，可用技能显示为 slash；不等于 Grok Bot 导入。本轮未启动/安装 |
| [Codex local CLI](https://learn.chatgpt.com/docs/build-skills) | 从 cwd 至 repo root 的 `.agents/skills/`；用户 `~/.agents/skills/` | 同名 skills 不合并，需核对选择来源；跨 repo 分发另按官方 plugins。当前作者 session/quick_validate 可用，不证明本包已全局安装或 Bot/Work 已加载 |
| [Claude Code](https://code.claude.com/docs/en/skills) | 项目 `.claude/skills/<name>/SKILL.md`；用户 `~/.claude/skills/<name>/SKILL.md` | 可用 slash；同名优先级按当前文档核对。Cowork/cloud 的账户技能与条件同步是另一路径，本地目录不自动云可用。本轮未启动/续派 Claude |
| [Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/) | 默认 profile `~/.hermes/skills/`；项目 `.hermes/skills/` 或 `.agents/skills/` 需 trust；支持 external skill directories | `skills_list`/`skill_view` 与 slash 可发现/读取；实际 profile、trust、toolset 与版本另核对。本轮未安装/加载/连接 Herdr |

Hermes 的 external dirs **不是写保护边界**：进程有写权限时，skill 管理可原地修改/删除外部文件；同名优先级为 project → profile local → external，local/project 可 shadow 共用版本。保护唯一 SOP 应采用实际文件权限或已授权 profile/toolset 边界，并回读加载来源和内容；不能仅配置 external 路径就称只读。`/learn` 会归纳材料并创作/更新技能，不推荐用它重写此唯一 SOP。未授权改变权限、配置或文件时，只报告风险与未验证项。

## 渐进远控配置与验收

具体命令以目标环境 `herdr --skill`、`herdr --help`、`herdr machine` 及相关命令组帮助为准。官方 [Connecting machines](https://herdr.dev/docs/connecting-machines/) 与 [Persistence and remote access](https://herdr.dev/docs/persistence-remote/) 提供连接/接手路径；网页更新可能先于本机版本，help 未列的网页命令先核验支持，不声称本机可用。

1. 用户确认 worker 目标、SSH 可达性、凭据/host key 处理和新增 profile 权限后，由用户 Agent 在授权边界验证 SSH；凭据留在既有 OpenSSH/Host 管理面，不能写入任务记录。
2. 按当前官方 help 配置 machine。`machine add` 是变更操作，可能安装/启动远端 Herdr、替换不兼容 server 及影响其 pane 进程，必须取得对应用户确认，不能当只读验收或自动批准提示。
3. 从 machine list 的返回读取真实 profile ID/唯一 label；只读核验该 profile 指向的机器、remote session、workspace 与 server 兼容性，不凭 UI 焦点猜路由。
4. 后续全部远控发现、读取和操作使用同一 `herdr --machine <profile>` 前缀，profile 是已保存的 ID/唯一 label，不是任意 SSH hostname；不得与 `--session`/`--remote` 混用。读取该 server 返回的 opaque workspace/Tab/pane/agent ID，不复用本机 ID；连接失败不切回 Local，也不当操作未执行而盲重发。状态或无害读回只证明相应能力，不证明所有操作可用。
5. 留存原始返回与能力边界；未知项标未验证，缺失阻塞依赖动作。此文档修订没有实际配置设备、登录或更新远端 server，现场验收须另有证据。

## 双入口接手同一任务

Bot 自然语言入口由其已授权 remote executor 在目标 worker 执行 harness/Herdr。另一设备的用户可依官方远程 terminal 路径接入同一 server/session、任务和真实 provider session；官方 `--remote` 与 `session attach` 是文档路径，须按当前 help 确认其组合/路由，不因重新连接而新开任务。真实跨设备接手需要现场验收，文档或只读状态查询不能代替。

用户明确接手时，Bot 立即停止新指令和本任务自动化发送，保留只读监工与在途 request/结果收集。目标机共用 runtime store 的原子 handoff/resume 校验 owner、revision/fence、真实 session 与在途动作，确保单写者；CLI/MCP 是接口，Host 云摘要不是可写副本。显式交还后通过原子 fence 并重新核验路由/预算/去重才续派。现有远程 terminal 仅是连接能力，这一完整原子 fence 尚待产品实施/现场验收；手写事件不等于锁，缺能力时阻塞依赖它的自动续派，不建 Host 自有租约服务。pane idle、断线或用户关闭窗口都不是交还信号。

Kanban 只观看 runtime/audit 投影；需求反馈、澄清、催办和审批跟进由 Bot 调用同一受控工具，不绕凭据、安全检查或特定动作授权。产品只读变更未实施前不宣称现 UI 已只读。session CLI 保留直接开发；正式退役架构与实现缺口引用目标仓库同一 Plan/contract，不新增 Host 控制平面。
