# archctx 信号链路与架构文档覆盖探针

日期：2026-10-11。基线：main `476282ef`（archctx 0.7.0，CodeGraph 1.6.1）。
这次只读源码、运行只读命令，并调研了开源同类产品。本文是后续并行补文档和能力反推的共同简报。

## 目标

archctx 要真正推动架构工作。代码只提供工具和轻量信号。Bot 收到信号后，派 coding agent 用工具写入。PR 是架构更新的单位。后台不跑重活。工具指引随 `repo-harness update` 分发给 Bot。

`docs/architecture/` 应该有一份产品总架构，每个 capability 应该有一份详细架构文档。

## P1 地图

- 模型：`.archcontext/model/`，5 个 domain，27 个 capability，每个 capability 只有一个 `component.*.primary` 节点。
- 文档：`docs/architecture/index.md`（手写，部分过期）、4 个 domain 文档、27 个模块文档。模块文档的 P1/P2 由 archctx 生成，P3、历史决策和 Optimization Backlog 由人写。
- 工具：`repo-harness architecture-projection status|check|plan|apply`、`repo-harness refactor recommendations|decide`、`archctx resolve --path`、`scripts/capability-resolver.ts match`。
- Bot 指引：`assets/skill-commands/repo-harness-check/references/architecture-evidence.md`。worker 指引：`assets/skill-commands/repo-harness-architecture/references/worker.md`。
- 推送通道：Herdr webhook（`assets/herdr/webhook-notify/notify.mjs`），只发 `done` 和 `blocked`。

## P2 链路追踪

信号链路在每一段都断开：

1. 编辑 hook 每次写 post-edit journal。dirty bit 里只有 `minimal-change` 有读者。`context`、`capability`、`checkpoint` 没有读者（`src/cli/hook/mutation-observed.ts:101`）。
2. 测试禁止 journal 出现 `architecture` 键（`tests/mutation-observed.test.ts:198`）。SessionStart 测试禁止架构段落（`tests/session-context.test.ts:1469`）。
3. `state resolve --json` 不暴露 journal。Herdr payload 没有 repo、分支和 capability。Dot PM 工具、Pi 扩展和 operator 控制台都不读架构信号。
4. router `SKILL.md` 的 verify 步骤不指向 `architecture-evidence.md`。Bot 不知道什么时候读证据。
5. 本机安装的 0.21.2 没有 `architecture-evidence.md`。`~/.repo-harness/config.json` 还有已退役的 `projection_apply: automatic` 和 `projection_failure_gate`。

工具本身也被卡住：

- 主 checkout 的 CodeGraph 索引由 1.5.0 构建，extraction 24。archctx 要求 1.6.1 和 27。`check` 返回 `AC_PRECONDITION_FAILED`。索引已重建，问题已解除。
- `refactor scan` 的 import 查询上限是 5000 个节点。本仓库有 6124 个。code facts 永远被截断，`refactor recommendations` 永远返回 `proof_required`。已提交 [arch-context#295](https://github.com/Ancienttwo/arch-context/issues/295)。

0.7.0 下的实测：

| 命令 | 结果 | 耗时 |
| --- | --- | --- |
| `architecture-projection status --json` | provider `ready`，apply `manual` | 3 秒 |
| `architecture-projection check --json` | `planned`，只有 manifest；`freshness.staleNodes` 列出 2 个节点 | 20 秒 |
| `refactor recommendations --json` | `proof_required`（code facts 截断） | 31 秒 |
| `capability-resolver match`（单个路径） | 命中 capability | 0.05 秒 |

## 覆盖现状

archctx 0.7.0 扫描的权威数字：

- 无归属文件 652 个，多归属文件 45 个。
- 跨模块循环 108 个。全部模块在一个强连通分量里。
- 27 个 component 没有声明 footprint。
- 2698 个 import 无法解析。

模块文档的深度：

- 27 份里有 20 份只有 2 个节点、1 条关系，与代码规模无关。`evals-checks` 有 10 万到 20 万行，`operator` 有 1 万到 2 万行。
- 10 份的 P3 为空：bound-task-freezes、delegated-runs、engineer-messages、engineering-overlay、global-runtime-reconciliation、integration-acceptance、interface-change、operator、verified-context、work-demand（只有 1 行）。
- 无归属源码的主要目录：`scripts/`、`src/cli/commands`、`src/*/state`、`src/*/evidence`、`src/*/pipeline`、`src/*/fleet`、`src/*/publication`、`src/*/review`、`src/cli/chatgpt-browser`。`effective-state-authority.md` 和 `shared-coordination-plane.md` 描述的区域没有 capability 节点。

## 开源参照

可以移植的做法，按与"工具加信号、agent 写入、PR 为单位"的契合度排序：

1. Ratchet baseline（ArchUnit `FreezingArchRule`、dependency-cruiser `--baseline shrink-only`、import-linter 对过期 ignore 报错）。只对新增违规发信号，基线只能缩小。
2. 模型关系即一致性规则（ArchUnit `adhereToPlantUmlDiagram`、Nx tag constraints）。跨节点的 import 没有对应的模型关系，就是漂移信号。
3. 显式 Unassigned 伪节点（CAST），按目录报告。Bot 每个目录簇派一个 PR。
4. 深度上限是天花板（CodeBoarding `--depth-cap`）。超过阈值的节点标为 expandable，再单独派工拆分。
5. 聚类只给拆分证据（Emerge 的 Louvain 聚类）。命名和边界由 agent 决定。
6. 人写的 rationale 用代码锚点绑定（Swimm）。锚点失效时发"需要复核"信号，不做硬门禁。
7. rationale 放在人写的 ADR 文件里，生成文档只做投影（Structurizr `!adrs`、log4brains）。
8. 批量更新 PR 加一个 dashboard issue（Mintlify 定时批处理、Renovate Dependency Dashboard）。

要避免的反模式：一次性对遗留代码执行严格规则；ignore 条目永不过期；用 catch-all 归属掩盖缺口；把深度当目标；在 commit hook 里跑 LLM。

## 执行顺序

1. Phase A：归属地图提议。决定无归属代码的归属、新 capability、多归属的唯一 owner，以及大 capability 的 component 拆分。这一步先经用户确认。
2. Phase B：按组并行。每组在自己的 worktree 里用 ChangeSet 细化模型，补写 P3，并维护摩擦日志。
3. Phase C：集成。串行合并，执行一次 `apply`，补写产品总架构，`check` 结果为 `noop`。
4. Phase D：从摩擦日志反推能力缺口。archctx 的缺口对照 0.7.0 源码核实后提交 upstream issue。repo-harness 的缺口作为信号与 Bot 指引方案的输入。

## 执行结果

6 个组并行细化模型，之后集成一次。结果：

- 模型：37 个 capability，6 个 domain，65 个 component，302 条 relation，52 个 flow。37 个模块页面都是 `Proof: proven`。`check` 结果是 `noop`。
- 新 capability 共 10 个。新 domain 是 `organization`。协调平面成为 `workflow-state` 的 component。
- 多归属文件保持 45 个。收窄 include 要等 arch-context#296 和 resolver 改造。
- 每个模块页面都有 P3。旧 P3 里与源码冲突的内容移到历史记录，并注明冲突。
- 产品总架构写在 `docs/architecture/index.md`：domain 地图、主运行路径、权威与状态对照、capability 索引。

## 反推的能力缺口

7 份摩擦日志共 86 条。去重后按归属分组。

| 缺口 | 现象 | 归属 | 跟踪 |
| --- | --- | --- | --- |
| 人写段落的引用漂移 | 4 个组靠手工 grep 才发现过时的 `file:line`、已删除的符号和过时的节点描述 | archctx | [arch-context#298](https://github.com/Ancienttwo/arch-context/issues/298) |
| 批量归属判断 | 单路径 `resolve` 每次 0.28 秒；拆出 component 后 `resolve` 和 `refactor scan` 的结论不一致 | archctx | [arch-context#296](https://github.com/Ancienttwo/arch-context/issues/296) |
| 多操作 ChangeSet | 0.7.0 bundle 的 `plan --operations-file` 必然失败；`--help` 无输出 | archctx | [arch-context#297](https://github.com/Ancienttwo/arch-context/issues/297) |
| 重构扫描截断 | import 节点上限 5000，本仓库有 6124 个 | archctx | [arch-context#295](https://github.com/Ancienttwo/arch-context/issues/295) |
| selector 证明预检 | 依赖注入导致的不可证 selector 要等 60 到 100 秒的 apply 才暴露 | archctx | [arch-context#300](https://github.com/Ancienttwo/arch-context/issues/300) |
| 归属变化预览和依赖矩阵 | 3 个组自己写了扫描脚本，其中一个把字符串当成 import | archctx | [arch-context#301](https://github.com/Ancienttwo/arch-context/issues/301) |
| component 在页面上可见 | component 入口、对外 relation 和规模都不渲染；CLI 根的扇出看不到 | archctx | [arch-context#299](https://github.com/Ancienttwo/arch-context/issues/299) |
| 渲染文本 | 骨架标题固定繁体；逗号被换成全角 | archctx | [arch-context#302](https://github.com/Ancienttwo/arch-context/issues/302) |
| 假调用边 | Node 内置函数被解析到同名的项目函数 | CodeGraph | [codegraph#2491](https://github.com/colbymchenry/codegraph/issues/2491) |
| apply 的 request id | 同一 workspace 第二次 major change apply 失败 | repo-harness | [#630](https://github.com/Ancienttwo/repo-harness/issues/630) |
| 归属权威 | 我们的 prefix 解析器不支持 exclude 和中间通配符，与 ArchContext 不一致 | repo-harness | [#631](https://github.com/Ancienttwo/repo-harness/issues/631) |

工作得好的部分（摩擦日志里标为 `works`）：MCP 规划加 CLI apply 的 ChangeSet 路径（几十个操作约 2 秒）、`capability-resolver match --paths-from` 批量匹配、`refactor scan` 基线（约 11 秒）。

## 对信号设计的输入

- 生成区的漂移已有信号：`check --json` 的 `freshness.staleNodes`（约 20 秒）。
- 人写区的漂移没有信号。#298 落地后，它和 `staleNodes` 一起构成 Bot 的文档派工依据。
- 归属缺口按目录报告。新文件落在显式列表目录外会成为无归属，这本身就是一个信号。
- 重构建议在 #295 之前不可用。
- 并行写模型的冲突点只有共享的投影输出。派工规则应当是：每个 worker 只写自己的节点，集成时串行执行一次 apply。

## 摩擦日志格式

每个 worker 记录每一次摩擦，一行一条：

`<时间> | <capability> | <步骤> | <命令或缺失的工具> | <现象> | <临时做法> | <归属：archctx / repo-harness / 文档>`
