# Pi codemode 与按需工具暴露

评估日期：2026-09-30。上游发布基线：`earendil-works/pi@v0.99.1` (`d86654a`)，功能引入于 `v0.99.0` (`4b060d3`)。本次是源码与文档比较，没有运行 Pi 集成、性能基准或改动运行行为。

## 结论

repo-harness 应先借鉴按需发现和有限输出，再评估批量组合；JavaScript sandbox 与工具暴露属于 host runtime，repo-harness 保留工具权限、workflow authority 和验收责任。无需为 Codex 已有的 code execution 表面再建解释器。

## 上游机制与限制

- codemode 在 QuickJS sandbox 中调用工具，可以并行读取并过滤返回结果；脚本输出才进入模型上下文。`on` 与 `only` 控制直接工具声明是否保留。
- inline declarations 默认共享 3000 estimated-token budget；namespace/count 仍可发现，完整工具通过 `searchTools`、`describeTool` 或 `ALL_TOOLS` 查询。
- MCP 默认 `codemode`，另有 `codemode-deferred`、`deferred`、`direct`、`hidden`。`tool_search` 加载直接声明后，在该 session branch 持续保留。
- 这里的 lazy 是模型声明按需加载。MCP 在 session startup 连接；不是 server 首次调用才启动，也不是声明加载后自动卸载。
- MCP 脚本拿到完整 `CallToolResult`；`isError` 结果仍 resolve。因此 Promise fulfilled 不等于工具成功。
- 扩展嵌套调用支持 `parentToolCallId` 和 bounded `nestedCalls`；组合不能抹去内部 effect 的证据。

## P1：本项目边界

- `src/cli/mcp/tools.ts#buildMcpToolDefinitions` 按 profile 与 capabilities 生成工具列表；engineer profile 有封闭 inventory。
- `callMcpTool` 保留分组 dispatch，fleet mutation 的授权检查位于 `src/cli/mcp/fleet-tools.ts#assertMutationAuthorization`，包含 adopted repo、read_write 和 authorization revision。
- `src/cli/hook/session-context.ts` 汇聚 SessionStart providers；`session-context-budget.ts` 负责预算、hash、引用及 mandatory overflow。
- `.ai/context/context-map.json` 已声明 progressive context 与预算。声明配置不等于所有 runtime 内容都按需加载。

## P2：具体压力点

SessionStart providers → `sessionStartMainContent` 串接 resume、队列、状态、sprint 等内容 → `sessionStartMainSection` 将其作为一个 priority-5 section → `budgetSessionContext` 在 section 粒度保留或丢弃。当前源码仍将这些内容绑定为一个预算单位；详情增长会连带影响其他摘要可见性。`tasks/todos.md` 已记录此项，旧记录的行号/provider 数不能代替当前源码。

MCP definitions → host discovery/declaration → `callMcpTool` → owner handler → structured result。可以在 host 侧改变何时声明和如何过滤展示，但不能以工具可见性代替服务器授权，不能从过滤后的摘要生成验收结论。

## P3：取舍与优先级

1. 首先完成已有 SessionStart provider 粒度预算项：保留必要状态，独立输出可发现的摘要/引用，让详情按需读取。无需新搜索服务或新的 authority。
2. 再用现有 MCP profile 评估 Pi 的 exposure 配置；复用定义与 dispatch，验证常见任务能发现工具、未授权操作仍被拒绝。
3. codemode 适合相互独立的只读集合与结果筛选。claim、write、publication 等 mutation 保持既有顺序、fence 和幂等语义；脚本失败不代表此前 effect 回滚。
4. 工具数量/详情增长十倍时，最先需要测量的是声明预算、发现准确率、完整结果进入 sandbox 的内存成本和实际 provider usage。静态字节减少不能证明成本或缓存命中改善。

## 后续验证边界

SessionStart 首刀入口是 `session-context.ts` 与 `session-context-budget.ts`；验证长 resume 下其他摘要是否独立可见、mandatory state 是否保留、hash/dedup 与 included/dropped evidence 是否正确。MCP/code-mode 集成应另开边界，验证 nested error、授权撤销、部分 effect 与输出截断。

## 来源

- [Pi v0.99.0 release](https://github.com/earendil-works/pi/releases/tag/v0.99.0)
- [Pi v0.99.1 release](https://github.com/earendil-works/pi/releases/tag/v0.99.1)
- [CLI / codemode](https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/docs/cli.md#how-codemode-works)
- [MCP / exposure](https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/docs/mcp.md#exposure)
- [Extension tool execution](https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/docs/extensions.md)
- 本项目既有边界研究：`docs/researches/20260811-pi-harness-v2-reference-assessment.md`。

本次仅新增这一研究文件，用于保存跨 session 可复用的比较结论；没有新增依赖、抽象或运行配置。
