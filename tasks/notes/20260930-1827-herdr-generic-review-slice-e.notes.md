# Slice E design notes

- 基线是 PR464 的独立 E worktree；PR 发布和 CI 修复不在这里实施。当前只写 Draft plan/contract 与 ignored probes，没有修改 src/tests，也没有调用模型。
- 用户已定：reviewer 沿用现有 fleet deep-reasoner。owner 只由已有 binding/parent_pane 证明，默认选择对侧，explicit harness 覆盖且不 fallback；缺 owner 时要求显式选择，不从 host env/model label/cwd 猜。
- 唯一允许的 fallback 必须显式记录 requested/actual/reason，且独立 reviewer pane。现有 post-intent 错误统一 ambiguous_launch，不能证明没启动；因此可安全自动执行的子集只有 preflight executable missing。其他 startup/readiness 错误 explicit cancel/对账，不重发、不洗掉三轮账本。
- library 已允许 string[] args，CLI/MCP 仍 args:[]。ignored probe 从 fleet source/现有 target overrides 推导 pin，使用生产 lifecycle API；不用旧 fixed-Fable/headless/disableAllHooks host，也不新建 host/adapter/registry。
- 生产 Codex high 与 Claude xhigh 保持；medium 仅 canary_override。effective pin 从唯一 cwd/start-time 关联的原生日志读取，argv 不当实证，缺失/歧义 partial/unverified。
- 最新 Claude pin 为 Read/Grep/Glob/Bash，allowedTools 仅 git 只读/result，dontAsk；用 status/diff hash before/after 和 deliberate write-negative。它不是 sandbox 强制，必须与 Codex sandbox 分开；Claude campaign 强 worker 隔离尚未证，不能用 reviewer allowlist 替代。
- Readonly request 如无真正 Result 就 pending，只能 cancel；独立 case-key 不冒充同 provider 多轮/domain 三轮预算。default8/hard10，候选可选 C1b9需要额外 GO，只有真实第一 Result 才第二 send，不补偿 Result；MCP 自动 idle cleanup 决策仍未执行/未证。
- A 使用 owner 预置 canary input 测试现有 result CLI 输送，不是模型 authored review 内容；B sentinel 仅历史观察，从不作为 Receipt 来源。大包只有 hash/3 markers 不算完整输入，原生日志不能证全量就 unverified；full/truncated均为预期，最后两轮记录，不作为意外失败。
- Campaign 已选 A：未来普通 task-agent+专用 linked worktree，owner journal 在 writable checkout 外；保留 budget/lease/claim。primary/external journal 实测隔离不成立则 unsupported/fail closed，不保留容器、不把 checkout claim 当 journal。代码仍暂停。
- 预算已批准8/hard10 low/medium，但脚本/预期/预算必须先审并收到明确 GO。N8 预声明0模型负向例不是重试/额外模型轮；非预期签名偏离即停。私有 session、endpoint 不传 home，不改全局配置，正常认证/新 provider 日志存在实际 HOME；不碰 default/mini/main dirty。
- 曾查看官方 Claude sandbox 文档以核对参数：https://code.claude.com/docs/en/sandboxing 。最新用户选择本轮不用 Claude sandbox，配置未应用，文档不算实测证明。

## Prepared artifact hashes (unrun)

- canary.ts: sha256:e40fd7dd367445d7abd5ae37e9222846967c4c0a55e52ea053e119c56cfd5ffa
- canary-budget.json: sha256:aa614b4627f067ed5448984a2474d9c882ec48f21f8696f844ab780cc48deb36
- expected-results.md: sha256:f823da1ca564443d0652d731ba308996a42cbaca387261398d10d5a73f6bd634

- 收尾等final B sentinel，不能A文件刚出现就杀provider而漏B/写probe。Current--verify仍0模型；真实能力unverified。

## CHECKPOINT-6 A–D corrections

- 当前审查为暂不GO，PR464 535c9821保持冻结；仅ignored脚本与E设计证据更新。A按call id对写命令和拒绝output配对，排除instruction原文；B先mtime再record cwd/time，Codex本地日期；C大包最后、full/truncated都预期；D S0字节argv+真实start/ready/cancel不发prompt，正常start45000ms。N8 intentional negative保留4000ms。
- S0 fake和真实startup都尚未执行，放在同一reviewed GO围栏内；本次只运行pure --verify与canonical，真实model_call_count仍0。重复一致sentinel接受，冲突拒绝。private fixture最终列路径、保留不递归删除。
