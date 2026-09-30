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

- canary.ts: sha256:5a47abe721279b3c2c4067fa39af0975a3efc23bf07aa9f7d311fa8dec8907e5
- canary-budget.json: sha256:722872c4803afe364c06b2a71fbe55d7d9b3c02a5f4ca6c83786ea020d316040
- expected-results.md: sha256:46c6e0a6b098af58a4ce300ba7232c57bd70852e1acac19b5e11a58d99fd98cc

- 收尾等final B sentinel，不能A文件刚出现就杀provider而漏B/写probe。Current--verify仍0模型；真实能力unverified。

## CHECKPOINT-6 A–D corrections

- 当前审查为暂不GO，PR464 535c9821保持冻结；仅ignored脚本与E设计证据更新。A按call id对写命令和拒绝output配对，排除instruction原文；B先mtime再record cwd/time，Codex本地日期；C大包最后、full/truncated都预期；D S0字节argv+真实start/ready/cancel不发prompt，正常start45000ms。N8 intentional negative保留4000ms。
- S0 fake和真实startup都尚未执行，放在同一reviewed GO围栏内；本次只运行pure --verify与canonical，真实model_call_count仍0。重复一致sentinel接受，冲突拒绝。private fixture最终列路径、保留不递归删除。

## CHECKPOINT-6 followup corrections（仍不GO）

- C1b首轮Result为null时只记skipped:no_actual_first_result，不send/计轮/抛错；fence只在哨兵改动时硬停，拒绝未分类或未配对分别记attempt_paired_unclassified/no_paired_attempt并保留原始输出，能力仍unverified。补shell.command数组与拒绝文案，Claude is_error仅辅助信号。
- fake S0按测试working seq1→idle seq2；真实trust提示即S0失败、0模型停止报告，不自动应答、不改全局信任配置或加bypass，是否预信任由用户决定。C2 Codex指纹/write-negative仅记录、未断言。PR464不动；所有live包括S0仍未运行。

## GO run stopped at S0 / bounded path fix (new GO required)

- 用户GO绑定700ad5d6/722872c4/d0844c61；实际S0 fake server socket超过macOS容量（API138/client145 bytes），rounds=0、model calls=0，未到真实harness startup、N8或模型send。首败停止，不沿用旧GO重跑。证据live-b6deb759-e8d0-4de8-afd7-1cd0db59912b与GO-execution.log保留。
- 仅S0 fake改/tmp/as-*→realpath /private/tmp/as-*/h；复用validateHerdrEndpoint检查API/client并加API<100断言（--verify计划路径+live实际路径），API86/client93。N8与两个真实session未传home，当前HOME下API74/client81；长configPath本身不改变socket位置。
- cleanup-pending-task-proof-60fb6d5fb1ee4860与62d2f06143434cbf均为stop返回空stdout后JSON.parse Unexpected EOF：两server已通过workspace list ready，属于已启动server，非“未起server的stop”。effect只在status0才返回供JSON.parse；之后原run等待两server进程退出。精确session进程与socket均未见残留。第三fake session f8b7f86e79e24eaa从未ready，亦无进程残留。未修stop解析（本次范围仅路径）。
- ~/.rhc-jTHSNm、/private/var/folders/nz/1kt960ns5kq331c5qw2sh6sc0000gn/T/ep-2G0wZJ、live-b6deb759证据完整保留；PR464未动。预算/expected字节保持原值，canary新hash待advisor审与用户重新GO。

## S0 stop stdout correction（新GO仍待批）

- 三处stop统一小函数stopServer，调用raw effect只看退出状态、不解析stdout，之后仍等待对应server子进程退出；失败才记录cleanup-pending。S0新fakeRoot立即加入retained_paths，成功/失败最终输出都可供用户清理。预算/expected保持722872c4/d0844c61，未执行live或S0。
- 扫描全部0模型JSON.parse/cli：workspace list/create、agent get、pane list为JSON（既有真实私有fixture测试及research证明）；report-agent与server stop可能空stdout，前者本就raw status，后者本次修正。production lifecycle内部getter（workspace/pane/process-info/agent/worktree open/split）仍用JSON读取，run/start/close/report等mutation走herdrMutation允许空stdout。预算、pane-created与fake-ready是自有JSON文件，不是Herdr命令stdout。实际安装herdr0.9.1；本次格式审计依据已有证据/调用路径，没有新启server或模型。

## 20261001 main rebase / prompt-file zero-model proof

- E五个docs commits已无冲突rebase到origin/main1c2c9233（PR464已合入）；对main只差plan/contract/notes三份文档，src/tests无改动。旧fixture已清，不再引用旧as/ep/.rhc路径。新advisor在w8:p7，所有送审转此pane。
- 独立新私有fixture做真实start/ready/cancel、无prompt：Claude --append-system-prompt-file被Herdr接受，server log检测到真实Claude pgid57149，但TUI trust阻塞、未ready；文件sha与fleet.body均c548be9f767746b6c281e4edf7c9ea9509dbf4e2326013f07b9c7488ba3b132b。Codex返回Herdr ready且PID56970活着，但实际TUI停在更新菜单；未选择更新/skip，未见native developer字段，正文原样解析仍unverified。两边cancel closed/server exit0，模型0。
- 修正版ignored canary仅把Claude正文落私有role-prompt.txt、argv传文件路径，四处start共用现有小准备函数；不归一化正文，CodexJSON参数不变。--verify检查argv无LF/CR与fileflag/path。budget未变，expected追加上述实证边界；没有新GO，没有执行修正版或选择E设计。
- herdrMutation stderr损失只建议：保留有界stderr与exit/signal供诊断、遵循现有脱敏规则，同时保留ambiguous_launch和不重放语义；本轮不改src。下个GO前应向用户呈现Claude trust与Codex更新菜单阻塞，不自动处理全局信任或工具升级。
