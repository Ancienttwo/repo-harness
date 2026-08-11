# 结论

`earendil-works/pi` 的 `packages/agent/docs/harness-v2.md`（评估基线 `4181f66`，2026-08-08T18:44Z，4612 行）是一份高价值的 in-process agent runtime 设计参考：它规范了单次 agent run 内部 provider/tool effect 的持久化、重放和崩溃恢复语义，恰好补上我们 `20260808-repo-harness-in-opencode.md` §六「Pi 首版 RPC process、后续 same-process SDK」里"后续 SDK 应具备什么语义"的空位。

处置方式：**登记为上游设计参考，冻结三条未来 FleetRuntimeAdapter 契约；不引入其任何运行时权威，不依赖其 API。** Pi 接入首版维持 RPC process 方案不变。

# 一、架构定位

- Harness v2 是 in-process agent runtime：prompt 接受 → operation/step/attempt 记录 → provider effect → response 落盘 → classification → tool batch → operation finished，任意位置 crash 后从 durable prefix 做 pure reduction 再决定 resume/repair/replay/fail。
- repo-harness 是 Git 软件交付治理层：authority（PRD → Sprint → Plan → Contract → Checks/Review）、contract worktree 隔离、`state next` + AttemptReceiptV1 续跑、single-owner claim + CloseoutJournalV1 收尾、subject-bound AcceptanceReceipt 验收。
- 两者上下分层，不竞争。Pi 的 session tree、lane records、JSONL/SQLite 存储是**它那一层的运行权威**，绝不进入 repo-harness 的 workflow 权威面；`docs/reference-configs/handoff-protocol.md` 的 Source Of Truth（Markdown/JSON/JSONL 文件为准，session/线程状态只是 read model）不变。

# 二、为什么只能当参考、不能当依赖

以下均为上游文档自述，非推测：

- 文档开头 compatibility policy 明言：除 coding-agent v3 JSONL 读取外，"Other formats, APIs, and their tests … may break without migrations, schema versioning, or conversion paths"。
- §20 实现状态：work packages 几乎全部未完成（评估时仅 F0 checked），运行时合并主线 `H0 → … → O4` 整条未动；包认领走"docs commit 预约 + 单维护者裁决"流程，设计仍在活跃改写中。
- 上游自己的 coding-agent 明确不迁移到这套 harness（Non-goals："Coding-agent migration … is out of scope"）。

因此任何 repo-harness 侧工作都不得把 harness-v2 的 API 形状、record schema 或 storage 格式写进契约，只允许引用其**语义**。

# 三、冻结的三条 FleetRuntimeAdapter 契约

适用于未来 Pi same-process SDK 阶段的 adapter 设计（首版 RPC process 不受影响）：

1. **effect-intent-before-effect**：每个 provider/tool effect 之前，先持久化一条 intent 记录并预分配结果实体的稳定 ID（对应 harness-v2 §5 durability rule："Before an effect: write an intent record that names what will happen and every durable id settlement will use"）。crash 后凭 intent 判定 effect 是否未知，而不是靠 exit code 或进程状态猜测。
2. **default-never replay**：工具重放声明 `replay: "never" | "safe"`，缺省不重放；重执行要求**记录时声明与当前声明同时**为 `safe`（对应其 X4/X5 恢复规则），带 abort 标记时永不重放。外部 effect（git push、PR、merge）在 repo-harness 层继续走显式 `recover reconcile`，永不自动恢复。
3. **manual-drive crash matrix**：adapter 的 in-run effects 必须可在每个 effect 边界停车（对应 `drive: "manual"` 的 gated effects），使 crash/interleaving conformance tests 可从边界机械推导，而非手工挑选。**注意**：repo-harness closeout 层已有等价纪律——`tests/contract-worktree-closeout-journal.test.ts` 对 CloseoutJournalV1 每个 phase 做 SIGKILL 注入并用 fresh process 验证 `recover abort|reconcile`。本契约只覆盖未来 adapter 的 in-run provider/tool 层，不重复覆盖 closeout 层。

# 四、明确拒绝清单

| harness-v2 机制 | 处置 | 理由 |
|---|---|---|
| session tree / lane records / JSONL-SQLite 作为运行权威 | 拒绝进入 workflow 层 | repo-harness 以 repo artifacts 为唯一权威 |
| 自动恢复所有 operation | 拒绝照搬 | push/PR/merge 等外部 effect 必须显式 `recover reconcile`（`docs/reference-configs/long-run-continuation.md` Crash Recovery） |
| lane ≡ contract worktree | 只可类比 | 两者 authority 不同层，不能合并 |
| 用 Pi session 恢复替代文件 handoff | 拒绝 | handoff-protocol 的 Source Of Truth 不变 |
| events 观察 / hooks 拦截二分 | 可借鉴 | 但必须保留 repo-harness 现有 hook authority 限制 |
| single writer、lane-local FIFO | 已覆盖 | `.ai/harness/policy.json` `allow_parallel_writers: false` + worktree/closeout ownership |

# 五、来源

- 上游：`earendil-works/pi@4181f66` `packages/agent/docs/harness-v2.md`（§1 Goals、§5 Records、§6 replay 规则、§15 Drive modes、§19 Testing strategy、§20 Implementation status）
- 既有接入研究：`docs/researches/20260808-repo-harness-in-opencode.md` §六（首版 RPC、后续 same-process SDK 的既定结论）
- closeout 崩溃测试基线：`tests/contract-worktree-closeout-journal.test.ts`
- 续跑与恢复协议：`docs/reference-configs/long-run-continuation.md`、`docs/reference-configs/handoff-protocol.md`
