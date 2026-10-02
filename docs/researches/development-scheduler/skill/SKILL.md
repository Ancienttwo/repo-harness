---
name: development-scheduler
description: 在 repo-harness session 或 Bot 中通过 Herdr 调度开发任务，管理身份、权限、预算、监督、独立审查与恢复。
---

# 开发调度

Bot 是用户对话入口和调度责任人。把需求转为有界目标与验收，组织实现、建议和独立审查，收集所有派发结果，向用户报告实质进展、阻碍与决定。Codex、Grok 或 Hermes Bot 可使用同一流程；入口可移植不代表它们的 runner、MCP 或 Herdr integration 已接通。

本文件是唯一调度 SOP，两个模式共用下述步骤与一组小而稳定的能力检查，不各建流程：

- **repo-harness session 模式**：在项目 session 内引用既有 plan/contract、身份、owner/锁、恢复和 subject-bound 验收证据，执行本次获授权的协调工作。
- **Bot 模式**：Bot 负责自然语言对话、拆解、Herdr 调度、监督和汇报；复用 Host 既有云端 infra、remote executor 与自动化，不重造控制平面。底层权威工具维护候选身份、锁/owner、恢复与验收证据，Bot 只引用其 ID/结果。

小稳检查面是身份/能力发现、任务与 owner、去重/预算、候选与证据、恢复/释放：检查现有工具是否能提供可核验的 ID、状态和返回证据，而不是新增框架。工具缺失时明确未验证/阻塞相应动作；用户授权的最小持久记录只保存本次证据和交接事实，不能伪装确定性登记、数据库或锁服务。

两模式的运行状态 task/owner/session/request/phase/locks/recovery 应由目标 worker 仓库 Git common dir 的共用持久 store 机器原子维护，跨 worktree/cleanup 保留；CLI/MCP 是访问接口，不是存储。plan/contract/code/test 随分支版本化，按授权合入 main；审计在 worktree 外，文档仅索引。Bot 云摘要和 Kanban 只读投影不能成为可写多副本 authority。这是目标架构；未实现的 shared store、原子 mutation 与跨入口 fence 必须标为前置，现用 Herdr 有界协调不证明这些能力已具备。退役设计/迁移步骤引用目标项目同一 branch-versioned Plan/contract，不把专有 campaign schema 和实施流程复制进 SOP。

Kanban 仅观看进度/阻碍/候选/证据。反馈、澄清、改需求、催办及审批跟进由 Bot 调用受控工具，保留批准凭据和安全检查；session CLI 仍可直接开发。现有产品可写入口未移除前，不能宣称已实现只读 Kanban，Bot 不使用其 browser write 绕过受控流程。

Herdr 安装版本负责 CLI 语法与进程操作；项目自身合同负责代码、验证和发布。目标使用 repo-harness 时按需读 [references/repo-harness.md](references/repo-harness.md)；核对 Host 加载/导入、远控或跨设备接手时按需读 [references/hosts.md](references/hosts.md)。两页仅作薄适配，不复制 SOP。

## 1. 冻结任务与权限

读取用户当前要求、项目规则及直接相关计划。记录目标、输入权威、允许读写路径、禁止动作、验收标准、交付物、依赖和停止条件；必要资料不可读时记录具体失败，阻塞依赖它的结论，不捏造引用或成功。把可独立交付的目标拆为子任务，避免微任务各建 worktree。

权限逐项记录：创建/复用进程、文件修改、本地 commit、push、merge、deploy、安装/发布、资源清理。Skill、advisor 建议、PASS 和上传成功都不授予任何权限。当前任务的临时 provider/配额限制只进任务记录，不能升格为长期规则。明确授权内直接推进；超范围决策交用户。

## 2. 发现环境，建立真实身份

控制 Herdr 前读取本机 `herdr --skill`、`herdr --help` 与有关命令组帮助，遵守官方规范；具体参数以安装版本为准，不复制另一份命令手册。不运行裸 `herdr` 做发现，不通过缺参数的 mutating 子命令探路。

检查真实 `HERDR_ENV` 和 caller context；未在 Herdr 内时按官方 Skill 停止。若用户明确授权本次外部 Herdr 入口，只在该授权的 server/范围行动，记录授权原文与例外边界；不得伪造环境或改长期规则。检查 client/server 版本与协议，发现 agent、pane、workspace、Tab。采用返回的 opaque ID 和唯一 live 名称，绑定 server/machine/socket，不依赖 UI 焦点或继承的过期 ID；路由不匹配时记录差异并核验 live 目标，不猜测。

向目标读取近期上下文；不足时索取任务、已做/未做事项和相关文件，必要时按准确 session 定位 transcript。终端历史不等于模型内部上下文。候选复用进程须身份可查、无未收集任务、无与独立审查相关的设计污染、owner 明确、cwd 合适且用户允许；idle 不证明空闲。尊重明确排除的项目和他人 WIP。看不到身份/历史就登记 UNKNOWN，暂停依赖该身份的派工、复用或清理。

真实 provider sessionID 来自 provider metadata、进程环境或经核验的 session 记录，必须与实际目标对应；pane、Tab、agent 名称、PID 不能充当 sessionID。获取 session 文件位置和 provider 支持的恢复命令，未核验的字段标 UNKNOWN；不要编造缺失值或泄露凭据。

先向既有权威工具取得任务/进程登记 ID 和结果引用，再在 worktree 外的授权持久目录保存本次证据；所需事实如下。已有字段引用权威结果，不另行生成竞争身份或锁：

| 字段组 | 最少记录 |
|---|---|
| 任务 | task_id、parent_task_id、目标/验收、依赖、派工版本、去重键、状态 |
| 边界 | 读写路径、唯一文件 owner、workspace/worktree/branch、server/machine/Tab/pane |
| 身份 | role、provider/model/effort、真实 sessionID、session 文件、恢复方式、所属进程/PID、创建者与资源 owner、核验来源 |
| 监督 | candidate_id、evidence 引用、预算占用、最近活动、下次检查、截止/诊断上限 |

记录是任务协调证据；若底层权威工具缺失或事实不可核验，标 UNKNOWN/未验证，阻塞依赖该身份、owner/锁或验收能力的动作。手写登记不能代替锁、确定性去重或真实验收工具。

## 3. 安排 owner、依赖和总预算

逻辑结构为 Workspace → 分支目标 Worktree → Task Tab → worker + advisor/auditor 的两个实际进程、两个真实 session。同目标可同 Tab 分 pane、共享 worktree；Tab/pane 不隔离文件。不同分支目标或写边界才另建 worktree，拓扑变化须符合用户授权和官方 Herdr 约束。

默认 Codex worker + Claude advisor/auditor，优先跨 provider；只有单 provider 时使用独立 session。worker 实现，advisor 给建议/交叉检查；参与设计或实现建议的 advisor 不能冒充独立 gatekeeper。严格验收时另排未参与实现设计的 auditor，即使需要替换 advisor 槽位也先保存/收集其工作；不能隐式增加第三进程。provider 差异本身不保证独立。

第一次派工前冻结预算：总同时活动上限、每 provider/model 的槽位与额度/成本或调用上限、所有 descendant 的最大深度/扇出/任务数、超时和 reviewer 预留槽位。计入全部子任务及复用进程的占用，不以“后台/子 agent”规避。每次派发/恢复前复查全局活动、登记和可用额度；读不到额度记 UNKNOWN，不声称充裕，按用户允许的有界预算排队或阻塞。worker 不得未登记继续扇出。容量不足就排队，不终止别人的任务或私换被禁止 provider。

并行 write-worker 的文件 ownership 必须互不重叠，引用既有 owner/锁工具结果或用户明确授权的文件交接事实，不另建锁/租约服务；read-only 角色可共享读取。发现共有文件冲突，先暂停冲突写入，保存 WIP，确定唯一 owner、依赖与顺序，或在获准边界隔离。文件转交须前任停止写入后显式交接；不能靠同 Tab 两进程抢写、stash 他人工作或覆盖来收敛。

## 4. 去重派工与持续监督

去重键至少为目标 + role + candidate/派工版本。结合登记、live 清单、历史和已有产物检查未完成的同键任务；重试、恢复或重派仍须此检查。所有新 CLI agent 经 Herdr 创建/启动，不裸启 provider。按官方规范选择可用 shell pane、保持 cwd 和用户焦点；启动、提交成功并不证明执行。目标回复真实身份、任务理解和边界，且出现执行活动证据后才登记 RUNNING。

派工包包含 task/parent ID、目标与冻结验收、输入来源、依赖、owner/读写范围、禁止动作、模型预算/扇出限制、交付路径、恢复登记要求、检查与停止条件。给 reviewer 的包只含必要计划、冻结候选和原始材料，不含作者自评、预期 verdict 或测试答案。

所有 Bot/worker/advisor/auditor Herdr 对话绑定 `task_id`、`candidate_id`、`finding_id` 与 `evidence`；尚无候选可用 pending，不适用 finding 用 none。归档发送内容、目标 live 路由、时间、提交/活动观察、回复及结果位置，保留失败。对话是证据，不自动改授权或验收标准。

Bot 负责持续监督，不派完即失联。默认每 60 秒检查状态、近期输出与产物，按任务耗时记录调整；每次等待设置 timeout。实质进展、阻碍、权限/设计决定立即报告用户，普通无变化观察只入记录。规定任务截止或停滞阈值，超过阈值进入有界诊断；默认最多两次只读诊断，每次最多 30 秒，仍不明则 BLOCKED、持久保存并报告原因和下一步。长工作可在有活动证据与预算内延长检查窗口，必须记录理由，不能无限轮询。

| 事件 | 调度动作 |
|---|---|
| quota 耗尽 | 停止新派和重试，保存成果/session，排队或报告；不切换禁止的 provider |
| timeout、失联、unknown | 不认定未执行或完成；先查身份、活动、已有候选/session；未知 writer 留 reconciliation，不 reset budget 或重派，确认状态与去重/预算后才恢复 |
| blocked approval/question | 读取实际 UI/输出，沿用用户权限边界，不能代用户批准对方审批 |
| 资料/能力不可用 | 记录具体缺失；阻塞依赖项，独立部分可继续，不虚构适配成功 |

进度报告可用 PLANNED/QUEUED/RUNNING/BLOCKED/CANDIDATE_READY/REVIEWING/REWORK/ACCEPTED/ARCHIVED/CLOSED；它们引用底层结果或表示本次观察，不构成第二套状态数据库。Herdr idle/done/waiting/unknown 是进程观察；只有匹配候选的成果、验证、独立审查和已解决 finding 才能 ACCEPTED。每个派发任务必须收集结果，或明确取消并记录取消确认/未确认状态；取消未确认的进程仍占预算、不能当已退出。未收集/未确认事项存在时不能结束监督或宣称 CLOSED。

双入口指向同一任务：Bot 经已授权远控向 worker 机发送自然语言任务；用户从另一设备接入该机 Herdr 远程 terminal，接手同一任务/真实 provider session，不重开任务。明确 handoff 后立即停止 Bot 新指令及本任务自动化发送，只读监工并收集在途 request；确认 owner/session 后交接。恢复须当前 owner 显式归还并由底层原子 revision/fence 校验单写者，再核验预算/去重才续派；pane idle 或断连不是交接凭证。现有连接/手写记录不等于原子 fence；工具未实现时阻塞依赖它的自动续派/并发写，不新增 Bot 自有租约服务。

## 5. 冻结候选，独立审查与修复复验

作者完成后通过既有工具保存可恢复候选；本地 commit 需有对应授权。底层自动捕获 candidate handle 并绑定/校验分支、HEAD/tree、文件 digest、dirty/untracked、冻结范围/验收和证据，Bot 只引用稳定 handle 与返回结果，不能删校验或凭自评合成候选。无该能力时只能保存获授权快照/本地 Git 证据并标明缺口，不冒称机器验收保证。检查候选是否与有效旧证据同一 subject；不要重复昂贵证据。代码/范围冻结后才产最终验证。

独立 auditor 使用不同真实 session，未参与设计/实现，read-only 候选，只写指定 review 记录。按项目权威 gatekeeper 契约运行；未实际加载角色须声明只是语义参考。审查开始及结束核对 HEAD、范围和 hash，发生漂移就阻塞旧结论；旧 PASS 不能用于新候选。

审查报告为 `VERDICT: PASS|FAIL|BLOCKED`。每个 finding 保留唯一编号 F001…、严重度、candidate_id、文件位置/依据、可重现观察、违反的冻结标准、建议及必要复验。编号不能因返工重用或抹去历史。worker 绑定 finding 修复、说明根因和影响并生成新候选；同一独立 reviewer 复查修复及受影响面，将 finding 标 fixed/reopened/unresolved，保存每版 verdict/evidence。只说“已修”不能关闭 finding。

优先从真实输入到副作用追根因，做最小 coherent 重构、删除旧路径，避免兼容补丁堆叠；保留必要安全、验证和幂等约束。新增 fallback/兼容/抽象需具体需求与证据。真实外部兼容契约或迁移约束的例外，记录来源、批准者/责任人、适用范围、测试证据、移除条件和时间，届时可验证地移除；无依据不增双重 authority 或合成缺失语义。不因偏好删除安全机制或无界扩大当前验收。

每个问题最多三轮 fail→fix→reverify；仍未收敛或无新证据争议，由 Bot 汇总双方证据交用户决定，保留 unresolved，不能换 reviewer 刷 PASS、循环辩论或追加无界标准。新验收需求走范围变更。

## 6. 验证、外部保存与释放

格式检查与行为审查分开。Skill 交付运行本机 skill-creator quick_validate；它只证明格式。需要行为信心时让独立 evaluator 在隔离 fixtures 中前向执行现实请求，只给原始状态/事件、Skill 和必要任务材料，不给预期动作/verdict。验证同 Tab 双 session、候选漂移、quota、失联、返工、共享文件冲突、资料缺失、清理前未保存和清理后恢复；记录实际决策/产物及适用范围。只在 fixtures 注入故障，不付费耗尽额度、不删除生产资源。模拟、真实 Herdr 能力、静态角色映射、未验证集成分别报告，关键词匹配或理想动作不能冒充行为实测。

释放任何 owned process/pane/Tab/worktree 前，先把可恢复代码/分支或快照、有用 untracked、候选与 hash、测试、finding/验收、双方 sessionID/位置/恢复命令、Herdr 对话关联保存到 worktree 外。脱敏并排除无关他人会话。核验外部记录能读取，且能在隔离目录恢复候选、测试和对话证据；未保存或恢复失败就禁止清理，不因进程 idle 放行。

process stopped 不等于 pane closed 或 Tab closed。先完成上述 worktree 外 session 审计/恢复信息持久保存并核验，再经安装版本正常退出路径停止本任务 owned process，做独立 process-readback；然后关闭 owned pane，做独立 pane-readback；仅当该 owned 任务 Tab 无其他任务共享时才关闭 Tab，并做独立 Tab-readback。分别记录三类资源的实际处置与读回证据，任何一项意外残留都不能笼统声明 cleanup complete。

共享 Tab 有其他任务时保留 Tab，明确其 owner、共享者与保留原因，并报告处置，不能声称已关闭。资源 ownership 不明、权限不足或关闭失败时保留未释放状态并报告，不升级为 kill 主 Herdr/server stop，不关闭他人资源或以 group close 绕过限制。隔离验证包含原始负例：process 已退出，但 owned pane/Tab 仍存在且无人共享；另给共享 Tab 中存在他人任务的原始状态。审查输入不提供预期 verdict。

只有验收完成、候选/分支可恢复、有用 untracked 全处理、无未保存工作且有清理权限，才清理 owned worktree，记录前后状态；默认保留分支与历史，分支删除另行授权。ARCHIVED 表示外部保存已核验；CLOSED 还须所有已派发工作及 owned 资源处置有确认，保留资源的交接须说明 owner/原因。

按任务要求把审阅包保存到可用 Library，报告真实 artifact ID；失败报告具体原因并保留本地包，不把上传等同验收。最终交付列出候选、文件、验证层级、审查/finding 状态、限制、恢复位置、资源处置和权限内实际动作。仅当已验证的缺口影响目标时给一项有界下一步。
