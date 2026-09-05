# Refactor 自动发现 0.5.7 审计修复

审计基线：repo-harness `1a9a5ae19167fd50ab0f0c650105ca8a9a2498eb`。
整合基线：已交付的 review-boundary-repairs `49c56b25f0c0871b85e6b2a53a4abb2e05913610`。该 main 已带完整 recommendation authority、Program identity 与持久化 candidate receipt 校验，整合时保留其实现与回归。
实现边界：发现、提案、materialization、执行绑定、post-merge resolution 与 board；同时统一 `archctx` / `archctx-contracts` 的依赖、policy 和 init 模板到 npm `0.5.7`。

## P1：权威与模块边界

| 数据/操作 | 权威入口 | 消费方责任 |
|---|---|---|
| 结构、scale、affected nodes、recommendation lifecycle | `archctx` scan / book / verify / resolve | 验证返回身份与契约，不重算语义 |
| 文件名 | scan HEAD 对应的 Git tree | 提供完整 regular-file inventory，超预算停下 |
| Proposal 内容 | bounded local author | 限定字段、作者、文件范围；交回 provider assessment |
| 执行授权与目标基线 | ProgramAuthorization + append-only Program events | 绑定 exact materialization，拒绝无关 ref 移动 |
| PR 结果是否已进入目标提交 | `scripts/worktree-merge-lib.sh` | 复用 ancestry / absorbed-squash 判定 |
| 完成状态 | final-main measurement + provider resolved readback | 保存原始证据、恢复中断写入、投影 board |

## P2：已证实的故障与修复

| 故障 | 修复与回归入口 |
|---|---|
| caller 可将 architecture recommendation 降级成自洽 module Program 绕过审批 | materialization 读取完整 accepted recommendation，将 assessment、baseline、proposal、scale、节点与 major-change reasons 逐项绑定；此修复已由 main 交付，本分支保留 `refactor-materialization-effect.test.ts` 的降级回归 |
| materialization 更新 target 后，begin_execute / begin_verify 被旧 grant HEAD 拒绝 | 仅接受 begin_plan durable event 中记录的 materialization commit；同父提交的无关 target 仍拒绝 |
| resolution recommendationDigest 被误当作 fingerprint 比较，真实 provider evidence 无法闭环 | Program binding 保留 fingerprint；provider 的私有语义 digest 保持 opaque，以唯一 recommendation ID 关联，同时核对实时 ID/fingerprint、HEAD、worktree 与 execution refs |
| squash 后 PR head 不是 merge commit 的 ancestor，被误拒绝 | 候选验证 HEAD 必须等于 PR head；调用既有 merge predicate，同时拒绝内容不一致的 squash |
| author 被禁止读文件，却未收到具体文件名 | evidence 包含 scan HEAD 的完整 regular-file inventory；scopePaths 必须来自该清单，staged-only 文件不可冒充 scan 证据；Git 机器协议读取关闭文本脱敏，保留 token=、空格和换行文件名 |
| 候选 C01/C02 会因 lifecycle 变化重排，跨调用选错 recommendation | public request 使用 `selection.recommendationId` + `recommendationFingerprint`；alias 只作当前调用展示，旧 public 字段拒绝 |
| failed author 和 duplicate failed receipt 均返回 CLI 0 | 保留结构化 failure receipt，同时返回非零退出码 |
| board 路径的 symlink ancestor 可将输出写出 repo | 逐层检查目录和目标文件，拒绝 symlink / 非常规文件，测试断言外部文件字节不变 |
| 先落 measurement 再 resolve 中断后，重试跳过 provider 写入并本地宣告完成 | 复用已验证 measurement，但重试未完成的 lifecycle write；写入后必须读回 resolved，否则停在 measuring |
| board 将每个 PR merge SHA 当成全 Program 的 final HEAD，多个 Work Packages 无法一起完成 | 所有 merge 必须是 final main 的 ancestor；每份 measurement 绑定同一个 final main；保留 main 已交付的 measuredHeadSha 与较早 merge / 较新 final-main 回归 |

旧实现的定向回归已观察到审批降级、状态推进、squash、文件证据、退出码、digest seam 和 board 越界失败。恢复问题和多 merge 问题原先被 digest seam 故障遮挡；修复后以独立恢复/较早 merge 测试验证，不能把它们误报为旧实现已走到的成功路径。

## P3：约束与取舍

没有新增依赖，没有本地复制 provider 的私有 `refactorRecommendationDigest`，没有长期兼容 parser。整合后复用 main 的唯一共享函数 `assertRefactorProgramRecommendationAuthority`，同时服务 materialization 与 architecture intervention；删除本分支重叠 helper，保护同一跨入口审批不变量；squash 判定复用现有发布包内 helper。本文是新增的持久审计记录，运行日志仍留在临时证据目录。

文件清单与 author evidence 都受现有 64 KiB 上限约束。10 倍规模最先触发 evidence budget / upstream partial coverage，返回 budget_exhausted / proof_required；不采样、不猜文件、不绕过结构权威。精确选择取代尚未激活功能的 alias 输入，没有并行旧协议。Activation 保持 off。

0.5.7 的契约还禁止同一 relation 同时属于 target requiredRelations 和 migration temporaryRelations；consumer authoring 使用 upstream invariant validator，回归覆盖这条升级约束。历史 Canary 7 的 record envelope live identity 缺陷已在上游 `ab5ccb8` 修复，发布源码为 `517cc5efe4f09e48e5dfb9ab6b2fad44fa547022`，不再将其当作当前阻塞。

## 验收记录

产品源码冻结在 `e8c98458793f3f2952ee7fbab9e1df24729810d6`；之后仅更新文档、清理测试 EOF 空白，以及修复新增测试的退出码清理。最终验证覆盖 `bunfig.toml` 的完整 tests root：**350/350 文件，去重 4,234 pass、4 skip、0 断言失败**。这是分段覆盖，不是一次单进程 full suite exit 0：

- 旧基线全量在整合 main 前主动终止（2,597 pass，旧 AXR5 readback 失败），不作为最终通过证据。
- 新基线 `bun test --timeout 60000` 在 2,061 pass 时收到 SIGTERM（exit 143，信号来源未明确）。其中 138 个完整文件贡献 2,036 pass；中断文件的部分结果不计入去重总数。
- 对剩余 212 个明确路径运行 `bun test --timeout 60000 <paths>`，得到 2,198 pass、4 skip、0 fail。覆盖清单 `/tmp/refactor-full-coverage.json` 验证无缺失文件。中断文件整体通过；其锁竞争用例另有独立 1 pass / 0 fail。
- 补跑断言全过但 exit 1，定位到新增 shadow CLI 测试：Bun 将 `process.exitCode` 设回 `undefined` 不会清除已有 1。独立原测试 14 pass 仍 exit 1；改为显式恢复 `oldCode ?? 0` 后，同文件 14 pass / 0 fail、exit 0。仅测试清理改变，保留其他已通过文件的证据；不重复全量。
- `bun run check:type`、`bun scripts/check-state-boundaries.ts`（281 文件）、`bun scripts/sync-helper-sources.ts --check`、`bun scripts/sync-reference-configs.ts --check` 均通过。
- 根六项完整性检查通过；task-sync 使用 `REPO_HARNESS_DIFF_BASE=49c56b25f0c0871b85e6b2a53a4abb2e05913610` 核对完整增量，workstream marker 绑定最终 substantive diff。
- `bash scripts/check-tarball-install-smoke.sh` 在整合后的源码上通过：真实打包、临时安装、Operator 启动、CLI 与 init fixture apply。AXR5 的 0.5.7 readback 已由现有 clean-room 脚本生成，对应 provider 文件 21 项测试通过。

分段日志为 `/tmp/refactor-integrated-full.log`、`/tmp/refactor-integrated-remaining.log`；测试清理的前后证据为 `/tmp/refactor-shadow-exit-probe.log`、`/tmp/refactor-shadow-exit-fixed.log`。4 个 skip 均为 Windows 专属用例，当前环境为 macOS。


独立安全/架构、composition 与 assumption 复核已完成；assumption 复核发现 Git stdout 脱敏破坏合法文件名，先红后绿回归已闭环（shadow 14/14）。专用 reviewer 因额度不可用，使用通用 runner 承接相同审查契约。后续新 child 遇到 native-role-routing 拒绝，未产出意见的范围由主线程直接审查，未将失败的代理调用计作 PASS。整合 main 后另由 native gatekeeper 完成限定增量复核并给出 PASS，覆盖 Program/candidate 持久化、squash、opaque digest、lifecycle 恢复和 board 路径边界；只发现并清理测试 EOF 空白，未扩大复审范围。同一 gatekeeper 随后核对 350 文件分段覆盖清单、Bun exit-code 复现及 cleanup 修复复验，确认可按分段完整测试集覆盖收口，仍保留 SIGTERM 与 4 skip 的实际记录。

官方 smoke 由 `Ancienttwo/arch-context` 的 `scripts/packaged-cli-smoke.mjs`（checkout `c0291c20ae7fd9e12adeed2aeed3c64fe75e4ee1`）驱动 registry-installed 0.5.7 binary。它验证真实 scan → record → verify → resolve，consumer tests 单独验证 Program / Git / recovery seam。这两层证据不等同于完整 activation 十个 canary 的 live E2E；进入 shadow 仍应按现有 activation workstream 完成固定 canary 集。

## 激活前仍需解决的契约缺口

独立 cascade 审查提出跨模块单 proposal 拆多个 Work Packages 的阻断。主线程对照基线后判定：单 recommendation 的一对多映射限制已经存在，不能归类为此次 authority 校验引入的新回归。

- 基线 `src/core/refactor/program.ts` 已要求 recommendationId 唯一；`src/core/refactor/materialization.ts` 已要求每个 unit 一个 binding、unit recommendationId 唯一。
- npm 0.5.7 的 `proposalDrafts` 对一个 proposal 只生成一条 refactor_proposal。
- PRD 的 Program 只有一份 assessment/proposal，不能通过拼入另一份不同 proposal 的 recommendation 来声称同一 authority。新校验拒绝这类不一致输入是审批修复的必要条件。
- 本轮 final-main 回归只证明较早 merge 的测量/完成边界；测试使用真实持久化 candidate receipt，不通过改写已物化 Program 伪造多 Work Package 的成功。跨模块 materialization 的 live E2E 尚未闭环。

下一切片应修订 recommendation → Work Package 的一对多执行映射，并贯通 materialization、execution-binding、final-main resolution 后再跑现有 activation canary 集。保持 activation off，避免把已修复的 module/shadow 边界等同于整个跨模块功能已激活。

## Node deadline 测试的空 PATH 边界

Node runtime probe 会继承测试指定的空 `PATH`。其 fake Node 脚本若使用相对命令 `sleep`，Linux 上会跳过预期延迟并立即输出有效版本，令 deadline 回归失真。该 fixture 使用 `/bin/sleep` 后，原有真实子进程超时断言和 provider 文件的 23 项测试通过；运行时代码未变。
