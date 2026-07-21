# Graph Engineering 萃取裁决

- 日期：2026-07-21
- 结论状态：已裁决（拒绝清单永久有效；萃取项各有独立落点）
- 关联 plan：`plans/plan-20260721-1743-sprint-strict-queue-enforcement.md`（Draft，HRD-09 合并后启动）

## 背景与来源

2026-07-18 前后，"Loop Engineering 已死、Graph Engineering 当立"的说法在 X 上成为一轮讨论热点。本次裁决的直接输入是 AI超元域的中文长文（<https://x.com/AISuperDomain/status/2079427508622205205>）及其上游 Tony Bai 原文（<https://tonybai.com/2026/07/21/from-loop-engineering-to-graph-engineering/>）。文章主体是对 Anthropic agent 工作流模式（<https://www.anthropic.com/engineering/building-effective-agents>）与 Claude Code Dynamic Workflows（<https://code.claude.com/docs/en/workflows>）的科普化重述。讨论中也有明确的反方：7 月 18 日没有任何新能力发布，变化只是给既有设计问题起了名字。

裁决走了双轨：Codex 独立产出架构映射与方案，Fable 主循环对照仓库实况逐条核验后综合。所有 file:line 引用在裁决当日经过实读验证。

## 裁决

值得萃取原则，不值得引入框架。文章的大部分主张 repo-harness 已经以更严格的形式落地；唯一实证成立的缺口是 sprint 调度器与 sprint 契约的矛盾，已立项修复。

## 概念映射（裁决当日核验）

| 文章概念 | repo-harness 现状 | 判断 |
|---|---|---|
| 单一职责节点 | Sprint row → plan → contract → worktree | 已有 |
| 独立验证节点 | worker → verifier → AcceptanceReceipt | 已有 |
| Reality anchors（测试、编译器、人工批准） | tests、SHA、provenance、人工 acceptance | 已有且更严 |
| 停止条件与预算 | Stop Conditions、wall-time、circuit breaker、re-gate 两三轮封顶 | 已有 |
| 有界并行 | agent 上限、depth 1、`allow_parallel_writers: false` | 已有 |
| Typed handoff | AcceptanceReceipt 已有；节点级 typed result 归属 EPC | 部分具备 |
| 显式依赖边 | 行序即全序编码，但调度器不尊重它 | 真实缺口，已立项 |

缺口证据：`scripts/sprint-backlog.sh:695-705` 的 auto-select 主动绕过 in-flight 行启动后继；`tests/sprint-backlog.test.ts:367` 把该行为当正确语义祝福；而 HRD sprint 契约声明后继必须钉在前驱产出的 `origin/main` 上（`plans/sprints/20260719-1531-hook-runtime-diet.sprint.md:26`，风险清单 `:238` 点名 stale-base）。

## 已萃取（三项，各有落点）

1. **Strict-queue enforcement**：调度器改为 head-only，`--force` 只能重启同一 head、不能越序。落点即关联 plan，时序在 HRD-09 之后、EPC 之前。
2. **Typed node result 并入 EPC**：字段大半已被 EPC-01/02/04 与 AcceptanceReceipt 覆盖（`plans/sprints/20260715-harness-loop-audit-and-optimization.md:1633-1639`），真正增量等 EPC 详案时逐行对，不另起系统。
3. **Dynamic Workflows 受控实验边界**：仅限 read-only audit、多文件独立审查、research fan-out、verifier aggregation；不做 task authority，不进 hook hot path，不开放并行 writer。

## 已拒绝（附理由，后续无需重新裁）

- **引入 "Graph Engineering" 品牌或通用图框架**：现有 plan/contract/sprint 面已覆盖同等语义，新框架是第二权威。
- **给 sprint 表加 `depends_on` 列**：行序已是机器可读的依赖编码（模板明文 "Ordered execution queue"，`scripts/sprint-backlog.sh:280`）；显式边与行序并存即双权威，可漂移。partial-order 表达力今天没有消费者——`allow_parallel_writers: false` 禁掉了主要用例。
- **多 Agent 投票替代真实验证**：同模型同资料共享盲区，一致同意只证明结论被重复支持。硬关卡（测试、编译、原始来源、人工批准）不可被语言说服，投票可以。
- **自动生成的 graph 当权威计划**：生成的编排是提案，权威计划走 plan capture 与人工批准。
- **cache、备用来源、best-effort 节点改变产品语义**：降级路径即语义分叉，撞 fail-closed 原则。
- **集中式反例库/best-practice 库**：反例面已有四个在职（全局 anti-patterns 规则、`tasks/lessons.md`、plan 的 Rejected Alternatives 段、agent memory），第五个库让每条教训有多个合法去处。可执行的反例进回归 fixture，文章级裁决进本目录，实证后加行、不预填。

## 触发器

- **DAG 一次性 cutover**：某个 Approved 且机器操作的 sprint 证明存在两行必须可并发启动、且各自 read-only 或写域不相交时，同一 work-package 内完成权威切换——显式边成唯一依赖权威，行序降级为展示，禁止双权威过渡窗口。细节见关联 plan 的 Deferred Partial-Order Cutover 节；`tasks/todos.md` 的 deferred 行随 strict-queue 包落地。
- 历史 ESA partial-order 叙述与旧版 task-card `depends_on` 草案只证明用例可能存在，不满足该触发器。
