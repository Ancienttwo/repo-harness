# repo-harness 门禁盘点与分类

> 状态：#483 源码实施完成、Draft待用户审阅；历史盘点基线保持不变，下面的实施摘要区分已改代码与运行限制。任务依据：Aimpact 05:14 批准的文档盘点；观察日期 2026-10-03（Asia/Singapore）。源码基线 `cc1fc8ee8eaec3f52c0eb0636b53133f7162b105`，分支 `codex/gate-audit`。实施见 [PLAN.md](PLAN.md)。

## 结论与统计口径

只保留四个操作边界：main 合并、删除、凭据/权限/跳过权限确认设置、发布/生产。其余步骤阻断改为记录或删除重复机制；typecheck、受影响测试、权限隔离、原子写与并发 fencing 的真实不变量继续有效。分类针对“独立常驻门禁要求”，删除不等于删掉测试断言、事实解析或数据安全校验；降级不等于失败测试也能合 main。

本清单 **89项：保留4、降级为只记录67、删除18**。

每行计一个控制族；同一脚本的 alias、投影、副本与不同入口不重复计数。H01–H04 是目标硬门禁，其他行是当前实现组成/步骤/检查/锁的独立迁移项，不能把四个边界与内部运行不变量相加称作更多硬门禁。表中“拆除中”是并行 p4/旧 cross-review/旧 evals-checks 的归属，不宣称已落地主线，也不扩大该 PR 的文件集合。

“真问题次数”只计能证明某次实际工作被阻止且发现真实风险的独立事件；修复commit、red测试、负面fixture、缺工件等待与拒绝次数均不自动算收益。`无证据` 表示无法给出可信次数，不是零次，也不是从未有用。同一个事件影响几个控制时只给一处主归属，其他指向它，不能加总成多次。

“平均卡多久”需要同一次阻断到解除的配对时间戳；command duration、hook elapsed、锁timeout上限与 CI job wall-time分别报告，不能冒称用户等待均值。缓存不是全量日志；没有完整样本时不推算终身总数。

## 实施摘要（#483）

- 已先同步main中p4/#484的退休结果；本PR不重做其旧cross-review三文件删除，不修改其Grok OAR或旧eval实现，skill仅在`/tmp/483-skill-inventory.md`只读盘点。
- 原生edit/Stop/Done与closeout取消plan→contract→review→notes许可链、promotion/Evidence Contract与promote/archive前置；scope/lease/复杂度诊断只记录。旧eval仍使用的pure历史分类数据保留，不进入native prompt许可。
- 风险仅`routine/high`；path/private-area、实际sandbox和共享token/generation/CAS约束保留。Main consumer读可信GitHub Required/CI与head/base，不能靠policy关闭；branch push保留秘密扫描。
- PR只跑typecheck+受影响测试；daily固定main快照做全量，失败/取消/超时/未启动产生去重修复任务与日报。合并后的真实annotated before/after tags与revert命令由reporter发布；尚未在远端启用/执行这份Draft的工作流。
- Packaged helpers唯一执行权威改为现有`package:scripts`；两个workflow manifests一致。`assets/templates`和`assets/partials*`原样保留为下游scaffold输入，既不同步修改也不做runtime fallback。
- archctx模型和架构文档保留；每次edit的drift队列、workstream sync与自动写agent capability块取消。历史工件260项逐字节归档，证据链接指向保留原件，不伪称历史状态完成。
- POSIX昂贵锁在target start barrier前记录host/token/PGID；只有原owner死亡且整组进程确实drained才自动回收。已retired/expired、final与runtime证据充分并带真实parent的Lease走原恢复事务；重复调用幂等、不重发provider。
- 限制：Windows、未注册PGID的旧benchmark orphan、缺完整producer事实的generic Lease保持unknown；未取得proof不能强制解锁。尚不声称本机已跑native Windows、远端daily或registry/生产验证。

4/67/18是89个控制族的迁移分类，不是“89个现场实验全通过”；历史真问题次数与等待均值仍沿用下面有边界的证据口径。

## P1：权威与架构边界

- Host adapters 调用 `repo-harness-hook` → [route registry](../../../src/cli/hook/route-registry.ts) 的12个 event/route tuples →单一 in-process handler。SessionStart/context、post-edit/post-bash/trace/inbox多数只观察；mutation、prompt Done、Subagent 与 Stop 各有当前阻断语义。
- CLI/helper入口 `src/cli/index.ts`、`src/cli/commands/`、`scripts/`；pure policy在 `src/core/workflow/`、`src/core/state/`；真实持久化、执行、锁在 `src/effects/`。`assets/hooks/`、`assets/templates/helpers/`、`docs/reference-configs/` 为受控投影，不是第二门禁权威。
- Check入口 [package.json](../../../package.json)、root [AGENTS.md](../../../AGENTS.md)、[check-ci.sh](../../../scripts/check-ci.sh)、[CI workflow](../../../.github/workflows/ci.yml)。Contract Verification Plan 执行一次，evidence/receipt与 protected merge seal消费其结果。GitHub 实际 protection 与host安装配置是外部控制，仓库定义不证明远端已设置。
- Architecture authority为 `.archcontext/model/nodes/`；model/provider投影、drift queue、workstream/context projection各有owner。Task artifacts不是锁源。共享锁/Lease/publication/budget存 Git common-dir；本worktree `.ai/harness/runs`与checks只是局部证据缓存。
- [architecture index](../../architecture/index.md)、[evals-checks模块](../../architecture/modules/verification/evals-checks.md)、capability-resolver list与9个fixture `package.json` 已比对：它们是 eval runner 的可复制输入，不是9个独立发布产品，保留祖先 evals umbrella 合理；现有 semantic entrypoint偏旧cross-review，应由拆除owner更新。本任务不author nodes、不运行archctx apply，不因为package layout新增能力。
- 不覆盖 `_ops`/凭据内容、不可访问远端session、私有host config全文；不改其他worktree、不执行reclaim/cleanup/生产动作。对于live host审批是否真的装上、每一个JSON validator的全部拒绝分支，不声称独立审计完毕。

## P2：一条真实交付调用链

[mutation guard](../../../src/cli/hook/mutation-guard.ts) 读取待写路径 → canonical path/private surface/parent-dispatch/Lease →一次 EffectiveState →scope/profile/Approved plan/Strict worktree →编辑；observer记录drift与测试。Contract runner → `verify-sprint --prepare-acceptance` → Verification Plan executor（deadline/精确 subject/toolchain/evidence）→ generic OAR或既有外审 → AcceptanceReceipt → final verify → protected merge-gate seal → contract-worktree finish（freeze target、archive、commit-tree、CAS publication、journal）→ publication/readiness读 GitHub PR/head/base/checks → main合并。Stop另读readiness、projection、minimal-change receipt、plan completeness，形成编辑/结束/合并的多次串行等待。错误路径分别为缺artifact、provider不可用、stale subject、锁冲突与外部结果不明，不能全部路由为用户审批。

## P3：迁移判断

当前形状保护自托管source/templates/installed copies一致性、并发ownership与事实不可伪造；最小一致改动是把阻断集中到四个真实副作用边界，保留一份 check证据供所有消费者读，删除阶段齐套审批与强制外审。10倍改动量先失效的是每改动全量/跨模型/反复hash重绑与等待的串行成本；删除互斥会先破坏数据，不能用来提速。能力/权限仍由权威值决定，未知数据不能靠本地猜测“补齐”。

## 门禁、检查、审阅与锁清单

列“证据”引用下面的事件目录；实现链接定位基线中的控制，不等于历史拦截证明。

| ID | 当前控制与实现 | 拦什么风险 | 真问题次数 / 证据 | 平均卡多久 | 建议 | 迁移边界 / 原因 |
|---|---|---|---|---|---|---|
| H01 | 合并进 main — [scripts/merge-gate.ts](../../../scripts/merge-gate.ts) | 失败或过期检查、错 HEAD/base、冲突、泄漏进入主线 | 无证据 | 无证据 | 保留 | 唯一代码交付硬门禁；精确候选的自动检查通过即可由模型合并，日报，无逐次用户审批 |
| H02 | 删除 worktree / 分支 / 数据 — [scripts/contract-worktree.sh](../../../scripts/contract-worktree.sh) | 丢失未合并提交、dirty/untracked 工作或活跃任务 | 无证据；E07证明曾有误拦清理 | 无证据 | 保留 | 仅自动删除已合并、干净且无活跃 owner 的 worktree/分支；其他删除问用户 |
| H03 | 凭据、权限、跳过权限确认类设置 — [src/cli/commands/security.ts](../../../src/cli/commands/security.ts) | 扩大 agent 能力、绕过 host 确认、私密数据外泄 | 无证据 | 无证据 | 保留 | 用户审批精确 diff/操作；MCP、Seatbelt、host hooks/permissions/sandbox 配置受此边界约束 |
| H04 | 发布与生产操作 — [docs/reference-configs/release-deploy.md](../../../docs/reference-configs/release-deploy.md) | 不可逆 npm 发布、生产变更、真实数据库写入 | 无证据 | 无证据 | 保留 | 准备/read-only preflight自动，外部发布及生产副作用需用户批准 |
| C01 | check:type — [package.json](../../../package.json) | 类型/接口不一致 | 无证据 | 无证据 | 降级为只记录 | 唯一验证执行中 typecheck，归 H01，不单独设审批 |
| C02 | check:state-boundaries — [scripts/check-state-boundaries.ts](../../../scripts/check-state-boundaries.ts) | CLI/Core/Effects 逆向依赖或重复权威 | 无证据 | 无证据 | 降级为只记录 | 相关边界改变时作为受影响检查，其他进入每日全量 |
| C03 | check:hooks — [scripts/sync-hook-sources.ts](../../../scripts/sync-hook-sources.ts) | hook authoring/projection 漂移 | 无证据 | 无证据 | 降级为只记录 | 生成 hook 变更时验证一次；普通变更只记录/每日检查 |
| C04 | check:helpers — [scripts/sync-helper-sources.ts](../../../scripts/sync-helper-sources.ts) | source helpers 与安装投影漂移 | 无证据 | 无证据 | 降级为只记录 | helper 变更时验证一次 |
| C05 | check:reference-configs — [scripts/sync-reference-configs.ts](../../../scripts/sync-reference-configs.ts) | 运行指南与 assets 模板不同步 | 无证据 | 无证据 | 降级为只记录 | 指南变更时验证一次 |
| C06 | check:route-eval — [scripts/route-nl-vs-ts-eval.ts](../../../scripts/route-nl-vs-ts-eval.ts) | TS/NL routing 判定差异 | 无证据 | 无证据 | 删除 | 旧 evals/checks p4：拆除中；删除旧闸，保留必要 routing 回归于受影响测试 |
| C07 | check:deploy-sql / SQL order — [scripts/check-deploy-sql-order.sh](../../../scripts/check-deploy-sql-order.sh) | SQL 序号、根路径、布局错误 | 无证据 | 无证据 | 降级为只记录 | deploy SQL 改动时并入 H01；真正执行属于 H04 |
| C08 | check:context-files — [scripts/check-context-files.sh](../../../scripts/check-context-files.sh) | agent context 尺寸与受控结构失真 | 无证据 | 无证据 | 降级为只记录 | 超长/结构变更写报告，不阻日常编辑 |
| C09 | check:architecture-sync — [scripts/check-architecture-sync.sh](../../../scripts/check-architecture-sync.sh) | pending drift 与索引失配 | ≥1次真实状态漂移拒绝（E04；非产品bug） | 无证据 | 降级为只记录 | drift 自动队列；相关模型消费者回归归 H01；不等人归档才能 Stop |
| C10 | check:context-map — [scripts/check-context-map.ts](../../../scripts/check-context-map.ts) | 上下文入口不可达或 map 漂移 | 无证据 | 无证据 | 降级为只记录 | 映射变更时验证一次 |
| C11 | check:task-sync — [scripts/check-task-sync.sh](../../../scripts/check-task-sync.sh) | 改动没有 exact-digest workflow 记录 | 无证据 | 无证据 | 降级为只记录 | 自动投影/记录，不为 notes/hash 重绑单独拦路 |
| C12 | check:task-workflow --strict — [scripts/check-task-workflow.sh](../../../scripts/check-task-workflow.sh) | 计划/契约/review/waiver 状态不一致 | 无证据 | 无证据 | 降级为只记录 | 保留审计输出，去除步骤/工件齐套作为操作许可 |
| C13 | repository inspector — [scripts/inspect-project-state.ts](../../../scripts/inspect-project-state.ts) | 缺失或旧安装工作流配置 | 无证据 | 无证据 | 降级为只记录 | 只读诊断，不另设完成门 |
| C14 | init --dry-run — [src/cli/commands/init.ts](../../../src/cli/commands/init.ts) | adoption plan 意外变化或漂移 | 无证据 | 无证据 | 降级为只记录 | adoption 改动时验证一次；不对每次文档变更施压 |
| C15 | check:ci / governance / functional — [scripts/check-ci.sh](../../../scripts/check-ci.sh) | 聚合检查漏跑 | 无证据 | 无证据 | 删除 | 删除重复执行入口的强制调用；命令仍可手动/每日使用 |
| C16 | 全量 bun test / test:coverage — [package.json](../../../package.json) | 未选择到的远处回归 | 无证据 | 无证据 | 降级为只记录 | 每天固定 subject 跑一次；红了自动开修复任务 |
| C17 | MCP 三平台 path matrix — [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) | 平台路径与 checkpoint 差异 | 无证据 | 无证据 | 降级为只记录 | 每日全量含 matrix；平台/权限改动进入受影响测试 |
| C18 | CI 文档消费者 assertions — [tests/ci-documentation-consumers.test.ts](../../../tests/ci-documentation-consumers.test.ts) | 文档读者/投影漏覆盖 | 无证据 | 无证据 | 降级为只记录 | 并入一次影响面选择，不复跑相同验收 |
| C19 | CI Draft deferral / Required aggregate — [scripts/select-ci-coverage.ts](../../../scripts/select-ci-coverage.ts) | Draft 未验证却得到 mergeable green | 无证据 | 无证据 | 降级为只记录 | Draft可以延迟昂贵测试；进入 H01 前必须有真实通过的检查；删除额外人工 Ready 等待 |
| C20 | check:release / prepublishOnly — [scripts/check-npm-release.sh](../../../scripts/check-npm-release.sh) | 版本已存在、registry不可证、发布打包不符 | 无证据 | 无证据 | 降级为只记录 | H04 内消费已有相关证据，删除重复 hooks/helpers/full-suite执行 |
| C21 | check:release-published — [scripts/check-release-published.sh](../../../scripts/check-release-published.sh) | registry/tag/tarball/安装 runtime 与声称不符 | 无证据 | 无证据 | 降级为只记录 | 发布后的自动 readback/报警，失败开修复；不得反称成功 |
| C22 | smoke:tarball-install / npm pack — [scripts/check-tarball-install-smoke.sh](../../../scripts/check-tarball-install-smoke.sh) | 缺 package 成员/真实安装不能运行 | 无证据 | 无证据 | 降级为只记录 | package/install变更测试一次；published artifact仍须 readback |
| C23 | check:archctx-integration — [scripts/axr5-archctx-clean-room.ts](../../../scripts/axr5-archctx-clean-room.ts) | 真实 archctx/provider 接线失效 | 无证据 | 无证据 | 降级为只记录 | 相关 provider/install变更才触发；余下每日/手动 |
| C24 | check:brain-manifest — [scripts/check-brain-manifest.sh](../../../scripts/check-brain-manifest.sh) | 显式 brain export引用失效 | 无证据 | 无证据 | 降级为只记录 | 已经是 operator-only；继续只记录，hooks/workflow不能读外部 vault |
| C25 | check-agent-tooling / strict-readiness — [scripts/check-agent-tooling.sh](../../../scripts/check-agent-tooling.sh) | host runtime/agent/tool版本配置不可用 | 无证据 | 无证据 | 降级为只记录 | 缺依赖只拒绝该能力，报告诊断，不封锁其他工作 |
| C26 | CodeGraph ensure/readiness — [scripts/ensure-codegraph.sh](../../../scripts/ensure-codegraph.sh) | 代码导航使用过期索引 | 无证据 | 无证据 | 降级为只记录 | 已有索引检查并提示更新；不为了导航卡所有工作 |
| C27 | check-managed-runtime / global reconcile — [scripts/check-managed-runtime.ts](../../../scripts/check-managed-runtime.ts) | source candidate与安装副本不一致 | 无证据 | 无证据 | 降级为只记录 | 自动只读检查，修复以显式 install/权限授权为界，不能泛化到编辑 |
| C28 | check-skill-version — [scripts/check-skill-version.ts](../../../scripts/check-skill-version.ts) | manifest/版本stamp错配 | 无证据 | 无证据 | 降级为只记录 | 版本改动归一次 H01；发布readback归 H04 |
| C29 | benchmark:skills / effectiveness authority — [scripts/run-skill-evals.ts](../../../scripts/run-skill-evals.ts) | dry-run冒充效果证据 | 无证据 | 无证据 | 删除 | 旧 evals/checks p4：拆除中；删除旧流程闸，保留按需效果评测而非日常阻断 |
| C30 | benchmark:harness / report validation — [scripts/validate-harness-profile-benchmark.ts](../../../scripts/validate-harness-profile-benchmark.ts) | 部分矩阵、伪造 subject或 stale benchmark | 无证据 | 无证据 | 删除 | 旧 evals/checks p4：拆除中；移除验收必跑矩阵，历史数据仍注明原证据限制 |
| C31 | benchmark:debug / truth / routing evals — [scripts/run-debug-ground-truth-eval.ts](../../../scripts/run-debug-ground-truth-eval.ts) | 无真实复现/ground-truth污染 | 无证据 | 无证据 | 删除 | 旧 evals/checks p4：拆除中；debug按需复现，不凭命名扩大删除范围 |
| C32 | loop-engine cutover gate — [scripts/loop-engine-cutover-gate.ts](../../../scripts/loop-engine-cutover-gate.ts) | cutover parity或样本不足 | 无证据 | 无证据 | 删除 | 一次性切换证据按风险选；完成后删除常驻gate要求 |
| C33 | factor-lab-check — [scripts/factor-lab-check.sh](../../../scripts/factor-lab-check.sh) | 候选因子资料/registry不一致 | 无证据 | 无证据 | 降级为只记录 | 仅该领域显式报告，不作为repo全局闸 |
| G01 | primary WorktreeGuard — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | 主checkout编辑与其他任务冲突 | 无证据 | 无证据 | 删除 | 删除 primary 一律禁写；冲突才自动隔离；H01保证主线 publication |
| G02 | MainLoopDispatchGuard — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | parent亲写代码绕过指定worker | 无证据 | 无证据 | 删除 | 按责任记录，无强制角色层级 |
| G03 | RepoScopeGuard / patch scope parsing — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | 路径穿越、symlink逃逸、未知写入面 | 无证据 | 无证据 | 降级为只记录 | 工作流闸改为记录；真实 filesystem/MCP sandbox 的越权拒绝归 H03，禁止fail-open |
| G04 | ExternalReferenceGuard (_ref) — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | 外部比较缓存误当产品提交 | 无证据 | 无证据 | 降级为只记录 | 只提示，commit allowlist/泄漏检查归H01 |
| G05 | OpsPrivateGuard (_ops) — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | 真实env/credential被agent编辑 | 无证据 | 无证据 | 降级为只记录 | 独立步骤闸合入H03权限边界；保持秘密隔离 |
| G06 | LeaseOwnershipGuard — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | 非owner/过期generation编辑共享任务 | 无证据 | 无证据 | 降级为只记录 | 移除每次本地编辑步骤闸，保留共享写入CAS/fencing；自动reconcile |
| G07 | WorkflowProfile / unstable resolution guards — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | 投影无法稳定导致错误工作流许可 | 无证据 | 无证据 | 降级为只记录 | 提示来源失效，不把profile解析作为所有编辑前提；共享写入仍拒绝坏数据 |
| G08 | ContractScopeGuard / allowed_paths — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | worker越出任务范围 | 无证据 | 无证据 | 降级为只记录 | 任务包保留scope约束；记录越界并在H01 diff检测，不新增scope审批轮次 |
| G09 | EditPlanGate / SpecGuard — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | 无Approved plan/spec就实现 | 无证据 | 无证据 | 删除 | 批准/annotation不是常驻编辑许可证；需求歧义才问用户 |
| G10 | 按 profile 强制 contract / linked worktree 的旧守卫 — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | 高profile缺contract或linked worktree | 无证据 | 无证据 | 删除 | 按实际并发风险选worktree；不按profile齐套 |
| G11 | PlanTransitionGuard / annotations — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | status跳步、有NOTE仍批准 | 无证据 | 无证据 | 删除 | 保留状态记录，不以阶段顺序拦本地工作 |
| G12 | Asset-layer / DeployAsset / TDD / BDD reminders — [src/cli/hook/mutation-guard.ts](../../../src/cli/hook/mutation-guard.ts) | 漏投影/测试/SQL规范 | 无证据 | 无证据 | 降级为只记录 | 当前已有advisory；继续按实际影响选验证 |
| G13 | Done / Evidence Contract / review freshness gates — [src/cli/hook/prompt-handler.ts](../../../src/cli/hook/prompt-handler.ts) | 模型声明done但契约或证据不全 | 无证据 | 无证据 | 删除 | 保留诚实完成报告；exact check freshness只在H01消费，不阻自然语言/Stop |
| G14 | Stop ReadinessGate / durable recovery requirement — [src/cli/hook/stop-handler.ts](../../../src/cli/hook/stop-handler.ts) | 未保存恢复材料或未完成workflow | 无证据 | 无证据 | 删除 | 恢复自动best-effort写；失败报警，不锁住回合结束 |
| G15 | Stop strict ArchitectureProjection failure — [src/cli/hook/stop-handler.ts](../../../src/cli/hook/stop-handler.ts) | provider不可用、pending投影无法publish | 无证据 | 无证据 | 降级为只记录 | 自动队列/恢复，真实模型/投影变更在H01验证一次 |
| G16 | Stop MinimalChange enforce + audit receipt — [src/cli/hook/stop-handler.ts](../../../src/cli/hook/stop-handler.ts) | 复杂度审阅未通过或无匹配审计receipt | 无证据 | 无证据 | 删除 | 复杂度报告按需；删除receipt解锁Stop仪式 |
| G17 | Stop PlanCompleteness / pending orchestration — [src/cli/hook/stop-handler.ts](../../../src/cli/hook/stop-handler.ts) | 首次规划答复不完整 | 无证据 | 无证据 | 删除 | 记录欠项，允许交付/暂停，不要求完成计划才能Stop |
| G18 | refactor recommendation / scale/proof-required gates — [src/effects/refactor/recommendations.ts](../../../src/effects/refactor/recommendations.ts) | 未处理结构性候选/大规模风险 | 无证据 | 无证据 | 降级为只记录 | 风险建议按需调度；不把重构建议变成每个改动前置 |
| G19 | SubagentStart route identity / native routing admission — [src/cli/hook/subagent-handler.ts](../../../src/cli/hook/subagent-handler.ts) | 错误persona/model、未验证身份 | 无证据 | 无证据 | 降级为只记录 | 记录实际身份；不得声称unverified为verified；真实权限不变 |
| G20 | SubagentLimit / delegation depth / return channel — [src/cli/hook/subagent-handler.ts](../../../src/cli/hook/subagent-handler.ts) | 并发资源超限、子agent不回报 | 无证据 | 无证据 | 降级为只记录 | 资源scheduler限流仍生效；丢失结果报告并恢复，无人工放行 |
| G21 | SubagentStop quality / EXECUTION_BOUNDARY — [src/cli/hook/subagent-handler.ts](../../../src/cli/hook/subagent-handler.ts) | unrequested extras、scope drift、输出缺失 | 无证据 | 无证据 | 降级为只记录 | 任务边界一次注入仍留；缺失证据归H01，按需审阅 |
| G22 | shared circuit breaker / semantic-review budget — [src/cli/hook/circuit-breaker.ts](../../../src/cli/hook/circuit-breaker.ts) | 重复失败重试/审阅烧token与卡死 | 无证据 | 无证据 | 降级为只记录 | 有界退避/资源预算保留；报警和修复任务代替新审批 |
| G23 | SessionStart / post-edit / post-bash / trace / inbox — [src/cli/hook/route-registry.ts](../../../src/cli/hook/route-registry.ts) | 缺context、drift、test观察、peer内容污染 | 无证据 | 无证据 | 降级为只记录 | 12 route tuples逐一覆盖；observational routes不误称hard gates |
| G24 | artifact matrix / operation readiness (edit,stop,ship) — [src/core/workflow/artifact-requirement-policy.ts](../../../src/core/workflow/artifact-requirement-policy.ts) | 不同profile漏required artifacts | 无证据 | 无证据 | 删除 | 删除步骤齐套矩阵的阻断语义，统一四个边界；避免hook/CLI/MCP各自判定 |
| R01 | gatekeeper 独立验收步骤 — [agents/fleet/gatekeeper.md](../../../agents/fleet/gatekeeper.md) | 漏回归、过度设计、技术债 | ≥3次已观察审阅修正轮次（E01–E03） | 无证据 | 降级为只记录 | 按需调用；消费同一证据，无强制每改动PASS及复跑 |
| R02 | 旧 cross-model / direct Codex cross-review — [src/effects/review/cross-review-runner.ts](https://github.com/Ancienttwo/repo-harness/blob/cc1fc8ee8eaec3f52c0eb0636b53133f7162b105/src/effects/review/cross-review-runner.ts) | 同模型盲点与跨模型意见漏收 | 无证据；E04有独立审阅finding，未证明来自此旧runner | 无证据 | 删除 | 拆除中：独立p4/retire PR持有；本次不修改或重做它的删除 |
| R03 | generic OAR review / Seatbelt round — [src/effects/review/generic-review.ts](../../../src/effects/review/generic-review.ts) | reviewer污染owner、runtime未准备、结果不属于subject | 无证据 | 无证据 | 降级为只记录 | 大改动/安全权限/模型没把握才触发；sandbox权限边界归H03 |
| R04 | AcceptanceReceipt / external acceptance / manual evidence — [scripts/acceptance-receipt.ts](../../../scripts/acceptance-receipt.ts) | 假验收、错subject、未观察manual criteria | 无证据 | 无证据 | 降级为只记录 | 有review则保留typed事实；无review低风险由check证据合并；去掉必填外审/waiver |
| R05 | verify-contract bounded command/evidence gates — [scripts/verify-contract.sh](../../../scripts/verify-contract.sh) | 超时、越界执行、bench生产冒充消费、缺criterion | 无证据 | 无证据 | 降级为只记录 | 保留deadline/隔离与可信check数据；唯一执行者验证一次，其余消费 |
| R06 | verify-sprint prepare / final / archive coupling — [scripts/verify-sprint.sh](../../../scripts/verify-sprint.sh) | 不同subject重复验收、缺耦合工件 | 无证据 | 无证据 | 删除 | 删prepare→review→final的重复步骤要求；保留一次执行与exact证据 |
| R07 | merge seal / protected helper / leak scan — [scripts/merge-gate.ts](../../../scripts/merge-gate.ts) | 绕helper、篡改seal、凭据/私密路径被提交 | 无证据 | 无证据 | 降级为只记录 | 安全检查归H01/H03执行一次；精确head/base CAS保留；不另要semantic receipt许可 |
| R08 | Publication merge-readiness / required reviews / threads — [src/core/publication/merge-readiness.ts](../../../src/core/publication/merge-readiness.ts) | wrong PR/head/base、checks failed、acceptance missing | 无证据 | 无证据 | 降级为只记录 | PR/check/head/base是H01组成；通用review/thread/lease必满足要求取消；现实branch protection须同步迁移 |
| R09 | contract-worktree finish / freeze / journal / recovery — [scripts/contract-worktree.sh](../../../scripts/contract-worktree.sh) | target dirty、closeout中断、发布后回滚抹掉已落地主线 | 无证据 | 无证据 | 降级为只记录 | 保留exact publication/CAS和自动reconcile；去除archive/promote/receipt作为每次前置 |
| R10 | archive-workflow / workstream / context-contract sync — [scripts/archive-workflow.sh](../../../scripts/archive-workflow.sh) | 工件未promote、arch/task投影脱节 | 无证据 | 无证据 | 降级为只记录 | 自动投影与归档，失败开修复任务，不需要另一次closeout许可 |
| L01 | effective state lock — [src/effects/state/state-lock.ts](../../../src/effects/state/state-lock.ts) | 并发投影损坏 | 无证据 | 无证据 | 降级为只记录 | 有界互斥保留；孤儿自动回收 |
| L02 | exclusive-directory lock / token / PID / inode — [src/effects/locking/exclusive-directory-lock.ts](../../../src/effects/locking/exclusive-directory-lock.ts) | 并发writer、误删活锁、path替换 | 无证据 | 无证据 | 降级为只记录 | 默认wait 5s、stale空目录30s是配置常量，不是平均卡时；保留fencing |
| L03 | expensive-run common-dir lock — [src/effects/expensive-run-lock.ts](../../../src/effects/expensive-run-lock.ts) | 多worktree昂贵run并发、孤儿PGID仍活 | 无证据 | 无证据 | 降级为只记录 | 当前reclaimStaleOwner=false；先证明owner与整个supervised进程组死亡，才自动回收 |
| L04 | Task Lease / liveness / generation / reclaim — [src/effects/state/coordination-lease-reclaim.ts](../../../src/effects/state/coordination-lease-reclaim.ts) | 双owner、stale heartbeat误偷、reviewing/completing被打断 | 无证据 | 无证据 | 降级为只记录 | 复用automaticReclaimLease；锁内重读claim/generation/renewal/evidence，禁止TTL单独释放 |
| L05 | campaign/group planning/dispatch/budget locks — [src/effects/automation/campaign-planning-store.ts](../../../src/effects/automation/campaign-planning-store.ts) | 重复规划/dispatch、超预算或重入死锁 | 无证据；E05证明1个锁缺陷，非防住事故 | 无证据；hold 6092ms（E05） | 降级为只记录 | 孤儿回收/锁内只做短事务；未drain的legacy state不删，campaign退役另有owner |
| L06 | automation grant / budget / reservations — [src/effects/automation/budget-store.ts](../../../src/effects/automation/budget-store.ts) | 未授权长期运行、资源双占/成本失控 | 无证据 | 无证据 | 降级为只记录 | 保留成本上限自动停/settle；只有权限扩大需H03用户批 |
| L07 | collaboration Principal/Binding/Decision/freeze admission — [src/effects/engineers/verified-context-store.ts](../../../src/effects/engineers/verified-context-store.ts) | 伪身份、旧授权、重复执行、越任务写 | 无证据 | 无证据 | 降级为只记录 | 权限授权归H03；任务决策、R2/freeze前置降为记录，shared writes保持CAS |
| L08 | publication / inbox / events / adoption / review store locks — [src/effects/locking/exclusive-directory-lock.ts](../../../src/effects/locking/exclusive-directory-lock.ts) | JSON/events写坏、重复提交/收件、锁被替换 | 无证据 | 无证据 | 降级为只记录 | 共享lock primitive的消费者族；保留atomic/fsync/idempotency，自动回收真实孤儿 |
| L09 | sprint / worktree / publication reconcile — [src/cli/commands/sprint.ts](../../../src/cli/commands/sprint.ts) | crash留下completing/reviewing/unknown effect | 无证据 | 无证据 | 降级为只记录 | 可证明既有副作用时自动收敛；不确定外部事实只暂停该effect，不问人批准普通恢复 |

| S01 | security scan / reviewed exceptions — [src/cli/commands/security.ts](../../../src/cli/commands/security.ts) | host hooks/tasks命令注入、可疑持久化 | 无证据 | 无证据 | 降级为只记录 | 当前read-only报告继续；例外/权限设置改变归H03用户批，不另成审批清单 |
| S02 | MCP policy / workspace root / path / tool grant / OAuth — [src/cli/mcp/policy.ts](../../../src/cli/mcp/policy.ts) | 未授权工具、私密root、path escape、跨session token | 无证据 | 无证据 | 降级为只记录 | 每次请求的认证/授权与atomic patch仍强制，是H03下既有权限执行，不因步骤降级fail-open |
| S03 | browser read/egress / exact bundle Gitleaks / Oracle readiness — [src/cli/chatgpt-browser/secret-scan.ts](../../../src/cli/chatgpt-browser/secret-scan.ts) | secret进入provider、未扫描实际prompt、伪兼容provider | 无证据 | 无证据 | 降级为只记录 | scan/path/staging真实安全检查仍执行，权限扩大归H03；缺能力只拒绝该provider操作，不卡整个repo |
| S04 | OAR review isolation / Seatbelt admission — [src/effects/review/review-isolation.ts](../../../src/effects/review/review-isolation.ts) | reviewer绕sandbox写owner或trusted result | 无证据 | 无证据 | 降级为只记录 | review按需，但沙箱admission/probe保持；扩写白名单/skip policy属于H03用户批 |
| S05 | adoption transaction hash / symlink / rollback preconditions — [src/effects/fs-transaction.ts](../../../src/effects/fs-transaction.ts) | 覆盖用户文件、rollback抹掉后来编辑、半安装状态 | 无证据 | 无证据 | 降级为只记录 | 保留atomic apply/rollback与owner digest自动拒绝冲突；权限安装H03；非破坏性准备不另审批 |
| S06 | refactor program activation / materialization / candidate verification — [src/effects/refactor/activation-store.ts](../../../src/effects/refactor/activation-store.ts) | 候选无proof被当真实变更、重复激活或未经授权跨界 | 无证据 | 无证据 | 降级为只记录 | recommendation只记录；实际权限H03/mainH01/删除H02；candidate facts不得伪造，程序无另一步用户批 |

| R11 | Integration Contract / envelope / acceptance matrix — [src/effects/integration/product-acceptance.ts](../../../src/effects/integration/product-acceptance.ts) | 把work-package绿态冒充产品功能组合已验收、matrix缺constraint | 无证据 | 无证据 | 降级为只记录 | 保留产品验收的真实fact/readback；缺matrix不能声称功能交付；去除作为所有编辑或独立用户许可的前置 |
| R12 | Architecture accepted-change / candidate / approval reference — [src/effects/architecture/projection-acceptance.ts](../../../src/effects/architecture/projection-acceptance.ts) | 错candidate自动投影、stale proof/cursor丢失真实drift | 无证据 | 无证据 | 降级为只记录 | ordinary semantic decision由agent及ChangeSet authoring，candidate匹配仍验证；删除独立步骤人工许可，H03/H04例外有效 |
| L10 | coordination quiescent cutover gate — [src/effects/state/coordination-cutover.ts](../../../src/effects/state/coordination-cutover.ts) | active marker/lease迁移时双ownership或遗失任务 | 无证据 | 无证据 | 降级为只记录 | 一次性迁移仍须证明quiescence/精确状态，活任务不强行清空；不作为稳态工作前置，完成后收缩旧切换实现 |

## canonical checks：用户“13 项”与当前权威的差异

基线 root Required Checks只有9个显式命令：C03/C04/C05/C07/C09/C11/C12/C13/C14。[repo-harness-check skill](../../../assets/skill-commands/repo-harness-check/SKILL.md)要求消费当前root清单。CI governance展开后有14个check叶子（C01–C14），还包含install、handoff/resume准备；functional另跑全量/pack/install smoke。

当前9条再加type、state-boundaries、context-files、context-map得到13条，但这只是一个可能的历史口径；CI还有route-eval，不能漏掉来凑数。没有找到名为“13项canonical checks”的单一当前权威，所以逐项列出14叶子和所有剩余check:*。现成记录中13/13、14/14通常是该任务Verification Plan的执行数，不能当全仓固定清单。本次不另造canonical清单。未来PR要统一唯一验证authority，其他入口消费同一结果。

## 历史证据与数据限制

证据是有边界的可观察样本，未找到统一记录“防住风险”与解除时刻的完整总账。下面事件不得相加称全仓ROI。

| 事件 | 来源与具体观察 | 主归属 / 计数 | 时间证据 |
|---|---|---|---|
| E01 | [release review](../../../tasks/archive/gate-audit-20261003/reviews/20260910-0127-release-0-19-0.review.md)，48–53行：gatekeeper FAIL抓到不存在CLI subgroup/verb、越界duration示例、两处版本错误；五项都修正后重核 | R01：1次审阅失败轮次，5个finding不是5次gate | 无证据 |
| E02 | [fixture-consolidation review](../../../tasks/archive/gate-audit-20261003/reviews/20260912-1647-test-fixture-consolidation.review.md)，11–19行：gatekeeper指出越scope改`tasks/todos.md`，已撤销 | R01：1次实际scope修正；不是hook G08的拦截证明 | 无证据 |
| E03 | [generic-review Slice E review](../../../tasks/archive/gate-audit-20261003/reviews/20260930-1827-herdr-generic-review-slice-e.review.md)，100–106行：记录Gatekeeper FAIL correction，包括旧caller未迁移的ship blocker、receipt消费者/tamper断言；当时仍Pending/fail | R01：1次失败修正轮次；不冒称当时已完成独立acceptance | 无证据 |
| E04 | [BRC342–351 review](../../../tasks/archive/gate-audit-20261003/reviews/20260908-0233-brc-issues-342-351.review.md)，15–24行：architecture/security初审发现immutable temporary-ref identity并修正；另一次architecture-state guard首轮fail，proof reconcile后通过；typed external-pass投影46行以后 | 独立审阅1条确证finding，不证明旧cross-review runner/跨供应商身份；C09主计1次状态漂移捕获，与产品defect分开 | receipt issued-at仅证明验收时刻，无阻断/解除配对 |
| E05 | [planning-lock notes](../../../tasks/archive/gate-audit-20261003/notes/20261002-1758-brc10-planning-lock-timeout.notes.md)，45–58行；修复[1d3c2f01](https://github.com/Ancienttwo/repo-harness/commit/1d3c2f017fa867cfbaf3cd61873395b4945e6f04)。两个OS caller执行真实production recovery，group锁含慢settlement令peer超5s；修后相同generation | L05：1个确证root-cause复现；来自测试，不算门禁防住用户风险次数。review100–107行未声称独立acceptance | observed lock hold6092ms，settlement1514ms；修后3970/3029ms，均非用户等待均值 |
| E06 | [campaign retry notes](../../../tasks/archive/gate-audit-20261003/notes/20260910-2258-campaign-preparation-retry.notes.md)，35–36行：node_modules archctx0.5.9，pin0.5.10；安装刷新后通过 | 环境stale导致一次假红，不能记C09拦住产品bug | 无证据 |
| E07 | [b456121a](https://github.com/Ancienttwo/repo-harness/commit/b456121ac2e950700c20c8744132c54a74a626fb)（issue196/PR197）：ship cleanup仅ancestry，拒识squash-absorbed，downstream积累100+目录；改用[共享merge predicate](../../../scripts/worktree-merge-lib.sh) | H02的假阴性历史缺陷，说明保留单一正确predicate；不当作安全删除guard防住真问题 | 无证据 |
| E08 | [execution-boundary research](../../researches/20260905-review-boundary-repairs.md)，末节：state-boundaries观察3个EFFECTS_REVERSE_IMPORT，修后0；新criterion消费此guard | C02的静态缺陷证据；未找到该gate实际阻止哪一次主线effect的记录，表中仍无可信拦截次数 | 无证据 |

本次日志快照固定在audit启动之前（UTC `2026-10-02T21:15:55.950Z`）。当前worktree hook-events在此cutoff之前0条，启动后记录属于本次盘点，不能当历史。primary `repo-harness/.ai/harness/runs/hook-events.jsonl` 的cutoff前样本6855条（UTC `2026-09-30T21:16:57.762Z`至`2026-10-02T21:15:36.312Z`），22条`blocked=true`、6条nonzero；不能仅据aggregate判断防住了22次真实问题。缓存持续增长，所以统计必须带cutoff。

primary `coordination/waits.jsonl`两次finish attempt为18291ms aborted与20569ms merged，平均attempt duration `(18291+20569)/2=19430ms`；没有拆出gate wait，不填进任一门禁的“平均卡多久”。当前primary `checks/latest.json`为`{}`；没有完整paired blocking/unblocking数据，全部等待均值无证据。tracked `.ai/harness/checks/*pre-fix.log`/failures多为回归fixture，不当生产拦截。

Git common-dir状态与account container/budget相关既有[退休盘点](../development-scheduler/campaign-retirement-inventory.md)还识别了modeled-fixture journal，不能作为真实并发事故或drain/cleanup授权。Lease waiver与archived todo只证明设计/恢复缺口；task-sync、孤儿锁自动回收、credential leak scanner防住真实泄漏的可确认次数均无证据。

远端只读核验：`gh api repos/Ancienttwo/repo-harness/branches/main/protection` 返回唯一required context=`Required / CI`、`strict=false`、未见required review count；`enforce_admins=false`。这是本次读取的branch protection，不证明host trust或rulesets其他控制。未来实施必须再读，不能因源码写着保护就推定远端已配齐。

并行拆除证据：`git log --all`可见未合并退休checkpoint `fbf73ff2`（direct Codex cross-review retirement，含明确“local draft checkpoint only”限制）；当前open PR查询尚无对应退休PR。根据任务提供的p4归属标“拆除中”，不推断它已完成、也不对`evals/**`整体发删除授权。C06/C29–C31列出旧评测gate依赖，真正删除文件集合归p4 owner；必要新routing/行为回归应留在受影响测试。


## 覆盖与复查入口

使用 `git log --all` 的gate/guard/lock/lease/review/check修复线索，再读对应diff、research、tasks/reviews/notes/archive；搜索既有ledger/receipts、common-dir store以及两处worktree的 `.ai/harness/runs`/checks。all-refs证据注明是否未合并，不能把未来并行分支当此基线行为。Hook缓存冻结观察样本避免本次audit自身生成事件污染历史统计；fixtures、producer benchmark与真实用户工作分开。

可重复入口（只读；不要用reconcile/apply/status中有持久化副作用的helper代替filesystem观察）：

```bash
git rev-parse HEAD
git log --all --oneline --grep='gate\|guard\|lock\|lease\|review'
git ls-files '**/package.json'
bun src/cli/index.ts run capability-resolver list --format json
rg -n 'Guard|Gate|block|lock|lease' src/cli/hook scripts src/core/workflow src/effects/locking
rg -n -i 'fail|block|receipt|duration|elapsed' tasks/reviews tasks/notes docs/researches
# 历史工件与ignored证据显式指定path或用rg -uu；不要输出credential/完整prompt
```

此次覆盖是可读源码控制族与有出处的事件，不是逐次生产事故总账；未取得全repo完整latency/拦截ledger，所以不提供虚构的全局平均或ROI。新文件仅这份inventory和实施PLAN，均为用户指定交付；无新依赖、抽象、test或runtime authority。
