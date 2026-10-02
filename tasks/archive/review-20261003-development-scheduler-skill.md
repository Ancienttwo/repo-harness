# 开发调度 Skill：归档验收与发布来源

本次将已完成外部文档任务归档到 repo-harness：正式设计见[PLAN](../../docs/researches/development-scheduler/PLAN.md)，唯一流程见[Skill](../../docs/researches/development-scheduler/skill/SKILL.md)。不新增运行入口或安装清单，不改产品代码。发布分支基于 origin/main `1d3c2f017fa867cfbaf3cd61873395b4945e6f04`，保留原主 checkout 的提交与 WIP。

## 原候选独立验收

原文档候选的独立 Codex auditor `VERDICT: PASS`，无新增 finding。作者与 auditor 均经 Herdr、不同真实 session；未启动或续派 Claude/Grok/Hermes。原候选计划路径与任务协调记录在归档时公开化；原 PASS 绑定原候选，不宣称此公开路径调整取得新的独立审查。

三个 Skill 文件逐字复用，SHA-256：

| 文件 | SHA-256 |
|---|---|
| skill/SKILL.md | abd1f75bc5648e7f8d42aa54e4720ac38f639fe62a8dfc3126213a18566d108a |
| skill/references/hosts.md | bbe5d2fcd4f78617ce25bf52d2d7b92278bbe1458e0666e9bd521b4c4d587bfb |
| skill/references/repo-harness.md | 477f23b789f30d4499328291f102b55bc9b84807c181b33b8ca46968d697cc7d |

19 场景由 18 项纸面前向判断和 1 项真实隔离 Git worktree 保存/正常移除/恢复组成，不是 19 项产品 E2E。覆盖同 Tab 双角色、候选漂移、额度耗尽、进程失联、review 返工、共享文件冲突、资料读取失败、清理前未保存、清理后审计恢复，以及 store/接口权威、只读 Kanban、未知 writer、进程退出与 pane/Tab 分离、共享 Tab 保留等边界。v3 的既有证据只复用于 v4 逐字不变清理部分，新增 Host/Docker 文档另作增量审查。

格式/frontmatter、链接、文件 hash、实际 branch-ref bundle 恢复通过；格式不证明运行行为。双方 session 对话、候选、测试及恢复材料在 worktree 外保存并核验后，两 owned Codex 进程正常 EOF 退出；process、pane、Tab 与 worktree 分别读回，保留分支和历史，不触碰他人任务。清理后从 ZIP 隔离恢复交付和审计并核对。provider session 未实际付费 resume。

## 证据保管与缺口

完整原始验证材料由用户另行保管，不提交私人 Library 标识、文件定位、会话身份或审计恢复信息到公开仓库。本摘要仅公开验证结论、文件内容 hash 与能力边界，不是 repo-harness 原生 AcceptanceReceipt。

generic Git common-dir runtime store/CAS/handoff fence、campaign 退役及 Docker 依赖卸载、Kanban 零写均未实施。Grok Bot 官方导入/保存方式仅文档核验；任意 ZIP 导入、实际材料保存/回读、多设备以及 Hermes/native Host 集成未实测。draft PR 与源码接口存在不等于已安装或现场能力。只声明实际验证过的层级。

## 公开归档验证

公开归档仅调整 Plan 路径与私有证据引用、补来源摘要；未重写三个 Skill。本次链接/hash 和 diff whitespace 检查通过。九项仓库完整性检查中八项通过；check-architecture-sync 在本分支和移走新增文件后的原始 origin/main 基线均失败，原因均为 ArchitectureProjection provider=archctx、state=mismatch、blocking=1。该既有投影未修复，不能声称全部检查通过。公开文档归档不修改其策略或生成投影；产品测试未新增；没有运行付费故障、生产删除或 Host 安装测试。

## 任务 A：批准后精简（2026-10-03）

以上 PASS、hash 和验证结论保留为 `bad25106` 原文候选历史，不能用于此次修改后的 Skill。Aimpact 04:17 批准任务 A：在 `codex/dev-scheduler-a-slim` 精简 Skill、Plan 和两份 references，直接引用现有 task-agent/Herdr/Git/PR 事实；撤销先建通用 runtime store 的前置。后续顺序为 A 文档、B Kanban 只读、C campaign 盘点与冻结准入、D 专用代码/Docker 删除；D 等 #476/#474 合并且 Aimpact 看过盘点，删除文件或改依赖前先报告停下。

保留权限、独立审查、未知 writer 不 reset/重派、先保存证据再清理；改为按需/事件驱动检查。对齐后端 Codex gpt-6.1-sol high、前端 Claude 正常权限、Claude 只读审查另案、所有 CLI worker 复用 Pi 1.0/OAR、Herdr 0.9.3。本次未改运行代码、依赖或安装入口，未执行退役或 Host 集成。检查证据与提交状态随本次 Draft PR 说明交付；不把历史 PASS 写成新候选独立审查通过。
