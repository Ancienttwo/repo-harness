# Deferred Goal Ledger 对账

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## 范围与判定

本轮按用户授权核对 `tasks/todos.md` 在 `426f24c869a6fd1a72f74e4a08b4c7fa7ffbcdae` 的 51 条 deferred goals。只修正文档，不实现余下待办，不改 BRC Sprint、合同或生产代码。账本仍是剩余工作的唯一入口；此文保存删除与收窄的依据。

已完成项必须有当前实现及对应验证面；历史计划中的“已做”不能单独证明闭环。部分实现只收窄剩余范围；条件未证实或缺乏完成证据时保留。未对真实 Host 能力、生产规模或历史性能做新的外部实验，因此保留这类条件待办不代表触发条件已经发生。

## 已完成项

| 原条目 | 当前实现与回归 | 处理 |
| --- | --- | --- |
| CI isolate mode 遇首个失败退出 | `scripts/lib/ci-run-tests.sh` 在两种选文件路径中累积退出码，循环结束后统一报告并失败；`tests/check-ci-isolate-aggregation.test.ts` 验证失败文件不会阻止后续文件 | 删除；实现提交 `6d5302b1` |
| CI isolate mode 漏掉 `.test.tsx` | 同一脚本的 discovery 同时匹配 `.test.ts` 和 `.test.tsx`；同一测试文件验证两类均被执行 | 删除；实现提交 `f0c35e30` |
| strict worktree readiness 与 mutation guard 判定不一致 | `src/effects/state/resolve-effective-state.ts` 比较真实 Git directories；`src/cli/hook/mutation-guard.ts` 消费同一 `isolated_contract_worktree` requirement。`tests/mutation-guard.test.ts` 的四个真实 Git fixture 同时检查 resolver 与 guard | 删除；实现提交 `5a6a2121`，不把此前被中断的全套日志改称通过 |
| MCP workflow-artifact 跨进程写锁 | `src/cli/mcp/guarded-write.ts#guardedWriteFile` 以 `withExclusiveDirectoryLock` 包住 revision 检查及写入；`tests/cli/mcp-tools.test.ts` 的 cross-process race 验证一个成功、一个 REVISION_CONFLICT 及 create-only 竞争 | 删除；实现提交 `4b5672d5` |
| Controller operation/outcome 与实际副作用绑定 | `src/effects/automation/controller-run.ts` 从 acquire 结果及 dispatch observation 选择 usage outcome；未知结果进入 reconciliation；`src/effects/automation/campaign-worker.ts` 从 worker final / contract verification 结算。`tests/unit/issue-279-automation-controller-run.test.ts` 覆盖 acquisition、fenced dispatch 及未知边界 | 删除原“controller 尚未提供绑定”项；不宣称通用 budget store 已认证任意调用者标签或 provider token/cost |

## 部分完成及重复项

原第 27、44 条描述同一 Stop cascade，合并为一项。`src/cli/hook/stop-handler.ts` 的 `STOP_DEFERRED_WORK_BUDGET_MS=20_000` 已限制共享 deferred-work 时间，disabled-provider 路径将 deadline 传给 `src/cli/hook/mutation-observed.ts#processArchitectureCascade`，各 helper 使用剩余时间。`tests/stop-handler.test.ts` 的 slow cascade 测试验证超时后保留未确认 drift，故删除“仍完全没有时间上限”的描述。

余下逐路径调用、重复 dirty-path 工作和子进程计数未被该 deadline 自动解决，继续保留。manual drain 是另一个入口，实施时须单独追踪，不能把 Stop 的局部证据扩大到所有 drain 路径。

Collaboration capability 已有职责和部分入口，原 C2 条目收窄为仍延期的 C2/C5 direct entrypoints，依据 `.archcontext/model/nodes/capability.runtime-harness.collaboration.yaml` 与 `tasks/workstreams/runtime-harness/collaboration/collaboration-substrate-program.md`。

Signal-store 条目改成待验证的 cross-thread collision：`src/effects/collaboration/signal-store.ts` 已在 EEXIST 后重读并 reconcile，而现有并发测试使用同一个 thread key。删掉未经本轮复现的“必然 unavailable”结论及绝对 unreachable 断言；不据此新增或删除代码。

## 覆盖与保留边界

原 51 项全部完成有界源码/测试/历史证据核对：删除 5 项，合并 Stop 重复项 1 项，余 45 项继续由账本维护。第 4 项 row/task 空值区分未获完整闭环证据，保留；第 16 项历史审批记录未找到覆盖 C1/C3 的完整迁移证明，保留并不代表原历史叙述被重新认证。

- Fleet/automation 余项：现有 attention、inbox、lease、预算及 parser 入口仍存在所列边界；controller 绑定完成不等于 provider-attested token/cost 完成。
- Host、visual/anti-extras、Lite phase-3、Oracle、evals、规模基准等条件项：未取得触发条件或验收完成证据，保留；不把“未观察到”写成“绝不存在”。
- Workflow/runtime 余项：journal GC、PID liveness、projection discard、SessionStart provider 裁剪与错误可见性、trace rotation、claim-token GC、parallel/conflict projection、overlay 双读语义及重复 context builders 仍有对应代码边界。
- 验证维护余项：模型 inventory 仍使用固定数量断言；architecture queue 测试仍有 `Bun.sleep(2500)`。未借本次清理改写断言或改变模型。

## 本轮验证

- CI isolate aggregation/discovery：3 tests passed。
- strict isolated worktree agreement：4 tests passed。
- slow cascade deadline / retained drift：1 test passed。
- 独立 worktree 初次运行 Stop 测试缺少 `archctx-contracts`；执行 `bun install --frozen-lockfile` 后通过，lockfile 无变更。这是验证环境准备，不是产品修复。
- MCP cross-process guarded writes：1 test passed。
- Controller orchestration：12 tests passed。
- 六项仓库完整性检查通过；最终文档变更后重新执行同组检查。
- 未运行全套；本轮仅改账本与依据文档，已有定向测试用于确认删除或收窄的事实。
