# BRC14/BRC15 Canary 3 收口记录（Owner scope amendment）

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## 结论

**Canary 3（`active/manual`）没有跑通，BRC14 的 fresh audit 从未执行。** 2026-09-09 至 09-10 在 byok-sdk 的 `codex/brc1415-canary` 分支上连续启动了 9 个 campaign，链路走到 worker preparation 之后就停住：前一个 campaign 的容器 worker 实际改出了正确修复，却在 canonical verify 阶段因只读挂载与共享锁的写权限失败，落成 immutable `permanent_failure / verifier_rejected`；最后一个 campaign 的 worker 在拿到 PATH 之后直接 `Executable not found in $PATH: "docker"` 退出。

Owner 于 2026-09-10 决定禁止容器执行基底。campaign 的执行证据契约整条绑死在容器 receipt 上，纯宿主机 BRC 路径既未设计也未实作，因此 BRC14 与 BRC15 无法在现有代码上继续验收。两行以 Owner scope amendment 收口，未达成项在下方逐条留档，不记为通过。

产品侧的两档修复已由 Owner 人工 squash 合进 canary 分支（byok-sdk#182），但这是人工动作，不构成 campaign 验收。

## Canary 3 实际跑到哪

真实尝试全部发生在 byok-sdk 的 `codex/brc1415-canary` 分支，时间 2026-09-09 至 2026-09-10，共 9 个 campaign：`transport`、`text-connector`、`delivery`、`replacement-delivery`、`settled-delivery`、`verifier-delivery`、`oracle-fixed-delivery-3`、`completion`、`host-verification`。每个 campaign 的 group 1 各带两个 slot（#177 `bugfix`、#178 `test_gap`），canary sprint 累积 18 行，全部停在 pending。

已经证明可运作的环节：

- GPT Pro authoring 与 followup 补缺；
- adoption 与原子 Sprint/WorkGraph materialization；
- local planning 交接；
- acquire 链（Offer → Claim → fresh worktree → Lease bind）；
- worker preparation 与其不可变持久化记录。

没有走到的环节：canonical verify 通过、attempt reservation 成型、自动 Issue closure 与 cleanup、fresh GPT Pro main audit、group 2/3 sequencing。

## 失败根因

**(a) `byok-brc1415-20260910-completion`：容器 worker 修复正确，verify 在 criteria 之前失败。**
容器 worker 套用了两档修复（README 记录 3/3）。canonical verify 需要写 temporary index，`git add` 要写只读挂载的 common Git 目录；shared verification lock 同样需要写权限。两处都被挂载模式拒绝，verify 在跑到任何 acceptance criterion 之前就退出，immutable final 结果记为 `permanent_failure / verifier_rejected`。修复内容是对的，验收路径判它失败。

**(b) `byok-brc1415-20260910-host-verification`：launcher 把测试用固定 PATH 误套到 controller。**
测试用的固定 PATH 漏掉 `/usr/local/bin`，被套到 controller 之后传递给 worker。worker 在 preparation 已经持久化之后才碰到 `Executable not found in $PATH: "docker"`，exit 1，时间 `2026-09-10T14:49:15.869Z`。没有模型启动，没有 attempt reservation，预算未被消费，但 preparation 记录已经不可变落盘。

## 容器 vs 宿主机的方向冲突

Owner 2026-09-10 决定禁止容器执行。现有 campaign 执行证据契约在四个位置绑死容器（行号相对 `9cc12bac`）：

- `scripts/contract-run.ts:181-183,234-239` —— campaign provider 只允许 `codex-exec`；
- `src/effects/automation/campaign-worker.ts:140` —— 新 launch 要求 supervised `codex-exec`；
- `src/core/automation/campaign-runtime.ts:20-21,51-73` —— invocation schema 要求 container 与 probe 字段；
- `src/effects/automation/campaign-runtime.ts:28-91,110-131` —— terminal proof 消费容器 receipt。

纯宿主机 BRC 路径未设计、未实作。BRC14 的 audit 准入与 BRC15 的 activation ladder 都建立在这条执行证据链上，执行基底一旦换掉，两行的 acceptance 就没有可运行的对应物。

## Owner 决定与不可变状态

campaign `byok-brc1415-20260910-host-verification` 已 `stop`：

- revision 4；
- event `sha256:4a402198a483fccd58f37c7a5f4d10b1489a53fee4e477ec04934398bfe78452`；
- current `sha256:a2330f4ee4855f025938cefce1e214cd8c0b730d67eb438af58eb57e7c3c0181`；
- observed_at `2026-09-10T15:26:03.277Z`。

#177 的 lease（claim `0aa1f52a-4bf6-4994-aa33-d2bb8c92c9e9`，generation 1）已 released。grant `cf6d772a…` 在 `2026-09-10T17:23:10.982Z` 自然到期。immutable preparation 记录保留，不做追溯修改。dispatch 未 retire —— retirement 只是 resume 的 admission fence，本 campaign 不再 resume。

产品侧动作与 campaign 验收分开记：PR byok-sdk#182 带两档修复，CI run `34478545552` 与 `34478640026` 各 23/23 pass，由 Owner 人工 squash 合进 canary 分支；#177 人工关闭；#178 以 `not planned` 关闭，理由是 `scripts/release/pack-and-smoke.mjs` 已覆盖该缺口。这些都是人工动作，不是自动 closure，不构成 BRC13/BRC15 的 cleanup 证据。

## 未达成项

BRC14：

- fresh GPT Pro main audit 从未执行（没有新会话 audit，没有 `observed_main_sha == expected_main_sha` 的本地校验）；
- exact-SHA 版本准入消费未接线；
- group 2/3 sequencing 未验证（没有任何 group 达到 `accepted`）。

BRC15：

- Canary 1（model-free 故障集：10 slot、第 7 项断线、duplicate slot、malformed metadata、issue edit drift、controller crash、cleanup crash、audit wrong SHA）未做；
- Canary 3 只做到「PR 自动生成 + 人工 merge」，自动 Issue closure、自动 cleanup、fresh audit 收口均未跑通；
- activation ladder 停在 `off`，`active/manual` 未被真实 canary 证明。

## 残留物与清理入口

- byok canary 的 9 个 worktree：`/Users/ancienttwo/Projects/byok-brc1415-canary-wt-*`。其中 `brc177-completion` 含两档 WIP，删除前需确认已被 #182 覆盖。
- repo-harness 的 `codex/campaign-preparation-retry` worktree：容器 preparation retry 修复 WIP，未提交、未验收，与宿主机方向无关；若容器基底不再启用，该分支可整体丢弃。
- `/tmp/campaign-reconciliation-recovery/`：pinned runtime `9cc12bac` 与操作脚本，属临时目录，重启即失。
- 暂停时的 handoff：`.ai/harness/handoff/brc1415-paused-20260910-2310.md`（主 checkout 的未追踪文件）。

## 若日后要做宿主机 BRC 路径的最小边界

这里只列边界，不设计实现：

1. 执行基底的证据契约要有一个非容器的对应物 —— 上面四处消费容器 receipt 的位置各需要一个等价的宿主机证据来源，且不能是 caller 自述。
2. canonical verify 的写权限边界要在宿主机上明确：temporary index 与 shared verification lock 各自写到哪里、由谁拥有、并发时如何互斥。
3. worker 与 controller 的执行环境（PATH、工具可用性）要在 preparation 持久化之前被探测并 fail closed，不能等到持久化之后才发现缺工具。
4. 宿主机执行没有容器的隔离边界，protected path 与 feature guard 的拦截要重新论证是否仍然足够。
5. activation ladder 的每一级要绑定新基底的证据形状，旧容器 canary 的观测不能跨基底复用。
