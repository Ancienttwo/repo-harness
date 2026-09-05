# 跨会话工作流维护：真实任务证据与规则裁剪

本轮把重复流程归入一个 host-local `agent-workflow-audit` Skill，自动化只读取证，修正已漂移的指令与记忆。没有增加 runtime、依赖、调度器或第二套 benchmark。项目内改动均为文档；宿主新增 Python stdlib collector 及其测试。

## 证据范围

2026-09-05 从 Codex App `list_threads(limit=50)` 返回值中取当前仓库的 32 个任务，排除本轮审计和三个 greeting/check-in，逐个 `read_thread`，得到 28 个独立任务样本。它是有界近期样本，不是全历史统计。AGENTS、HarnessState、Resume、ambient wrapper 与 subagent dispatch 不作为用户 Prompt。三类可以重叠；恢复和原任务仍是不同任务，不能据此推断独立故障次数。

| 重复意图 | 有直接用户请求支撑的下界 | 处理方式 |
| --- | ---: | --- |
| 项目状态、遗漏与收口审计 | 8/28 | collector 固定取证，调用已有 state/ledger 与 `check` 工作流 |
| 接手、handoff、恢复 | 5/28 | 核对当前输入、任务状态、worktree、handoff 与 writer；按 host 能力恢复 |
| GitHub Issues 批处理及 ship | 4/28 | 复用 `check` triage、`contract-worktree finish`、`ship-worktrees` |
| 至少一个 interrupted turn | 8/28 | 只表示 turn 中断，不等于任务最终失败 |

统计依据为人工核对的直接用户请求；exact-text hash 只能提供重复候选，不能代替语义归类。新 helper 的 CLI history 样本和上述 App 样本是两个不同覆盖面，不合并分母。

## P1：维护源与执行边界

- 全局规则维护源为 `assets/reference-configs/global-working-rules.md`，`scripts/sync-reference-configs.ts` 生成 docs 投影，`writeGlobalContextFiles()` 更新两个宿主的受管 block。个人内容保持在 markers 外。
- 根 `AGENTS.md` / `CLAUDE.md` 是两个宿主的入口，二者相同不是可删除的冗余。外部工具清单由 policy、workflow contract 和 `docs/reference-configs/external-tooling.md` 共同约束。
- 项目经验由 `tasks/lessons.md` 和 `docs/researches/` 维护；跨项目偏好由 `~/.claude/memory/GLOBAL.md` 维护；Vault 通过 `obsidian-memory` 保存指向 repo 的引用。
- 新 Skill 位于 `~/.codex/skills/agent-workflow-audit/`，属于本地自由 Skill 层，不纳入产品 catalog。现有 Waza Skills 保持上游管理。
- `scripts/run-skill-evals.ts --run-adoption-profile` 复用既有 inspector 与 init dry-run；当前 profile 要求 target 自带 repo-harness CLI。外部项目使用 candidate CLI 的既有 `--repo` 入口，不扩展 evaluator 语义。

## P2：反复中断的具体路径

| 类别 | 已观察的路径与症状 | 本轮判断 |
| --- | --- | --- |
| 测试成本 | 用户要求状态/文档收口 → 旧 lesson 对每个 worker 强制 full suite → 20–30 分钟等待；期间 target/candidate 还可能改变 | 当前根 Required Checks 已按风险分级，旧 lesson 必须指回这个权威 |
| Host writer | 恢复任务 → host 返回 `active writer` / `-32600` → 现场有持有 writer 的进程 | 属于 host 恢复问题。一次人工 TERM 成功不构成可自动 kill 的通用步骤 |
| 文件/环境 | linked worktree 缺 handoff；某次测试遇到 Python 进程挂住并报告 environment failure | 缺文件和环境故障单独报告，不归为产品失败，也不从旧记忆重建事实 |
| 指令冲突 | lite profile → 全局“所有规划落文件”与旧“所有 worker 全量”同时注入 | 修正过宽文案，不改变 profile 或测试 gate |
| Worktree 权限判定 | `state resolve` 在 primary worktree 给 edit allow → StrictWorktreeGuard 要求 linked worktree而拒绝 | `tasks/todos.md` 已有真实复现；本轮定位并保留，修复需跨 Effective State/guard 的独立行为切片 |
| 上下文缺口 | SessionStart 的多个 provider 聚成整体 section 后进入预算裁剪 | 已记录于 `tasks/todos.md`。现场预算证据为 1487/1500 tokens，`worktree-backlog-notice` 被丢弃；不能把这一次观测说成全部上下文丢失 |
| Stop/安装漂移 | 历史 Stop adapter、candidate handoff 与 archive fingerprint 失效 | 当前源码/提交已修复这些具体问题；不再为它们叠加提醒规则 |

`tasks/todos.md` 另有 hook event 增长、Stop cascade、provider diagnostics 等明确边界。日志大小和某次 Stop 延迟同时存在不足以证明因果。本轮没有以“维护”为由启动这些 runtime 重构。

## P3：保留、收窄与移除

| 规则/流程 | 决定 | 失败案例与验证面 |
| --- | --- | --- |
| 每次规划都写文件 | 收窄到 active profile；lite 保持 brief → edit → targeted verification，work-package 使用 file-backed flow | 本轮注入的 lite zero-ceremony 与旧全局句直接冲突；全局规则 distribution/projection 回归 |
| 每个 worker 无条件 full suite | 收窄，指向根 Required Checks/contract exit criteria | 历史文档收口等待与旧 lesson；源码跨面漏测事故仍支持 runtime final full suite |
| Waza 八项 / automation diagram-design | 删除过时清单，改为当前 policy 的四项和 mermaid | `.ai/harness/policy.json#external_tooling`、workflow contract、bootstrap/catalog 回归 |
| 只复制 SKILL.md 完成更新 | 改为完整 Skill 目录与共享 rules 的既有同步方式 | Waza 的脚本/引用是执行依赖，单文件同步不能证明安装闭包一致 |
| AGENTS/CLAUDE 与 assets/docs 双文件 | 保留投影，合并其维护权威而非删除宿主入口 | projection/distribution checks；AIP 真实项目还存在根指令分歧 |
| 隔离 repo/HOME、固定 subject 与真实 provider wire | 保留 | 历史 routing eval 被 ambient Skill registry 污染；本轮新 collector 的自造 ISO 时间戳 fixture 被真实 Unix timestamp history 推翻 |
| Dry-run 不能证明模型有效性 | 保留 | `evals/skill-routing/phase-b-attempt-outcome.json` 与 frontier stress-test report 均明确结构/行为证据边界 |
| 每次维护定时触发 / 自动清 writer | 不新增 | 样本中存在 active session、合法主动中断及宿主占用；无定时需求和可安全自动归因的控制面 |

本轮选择脚本作为自动化形式：`collect.py` 用固定路径和 Git argv 收集 hash、HEAD/status、worktree 数量及 exact Prompt 重复候选，不输出原始 Prompt，不重建任务状态。`--history` 的时间窗口明确指定，坏输入和扫描中变化都必须给出不完整/失败结果。没有新依赖；一个 helper 消除反复手写取证命令，测试覆盖真实输入格式和无副作用边界。十倍数据量下首先受限的是历史扫描量与人工语义归类，不应靠新增常驻 Agent 或放宽证据条件解决。

长期记忆同步完成了三项有限修正：`GLOBAL.md` 的 Waza 安装清单改为指向项目权威；Vault 的 companion/verifier 两页移除重复正文并修复已归档 notes 路径；WikiSkill 页此前引用的 `docs/researches/20260831-wikiskill-persistent-knowledge-skill-evolution.md` 在当前 checkout、归档路径及本地 all-ref history 均未找到，因此标为 `needs-source`，撤下未经复核的论文/迁移结论。没有凭记忆重建研究文件，也没有写入 manifest-owned Vault 路径。

## 回归记录

- 规则 distribution 与 reference projection：9 tests passed。
- 既有 skill-eval/disposable boundary、package-owned runner、bootstrap、skill catalog：93 tests passed。
- 新 collector：11 tests passed。真实 CLI history 曾因 fixture 的 timestamp 类型错误而拒绝输入；已把 native Unix timestamp 作为唯一输入格式，保持对错误格式的拒绝。2026-09-01 起的独立 CLI 样本为 155 条记录、37 个 session、4 个跨 session 相同文本 hash 候选；读取前后 history fingerprint、两个真实 repo 的 HEAD/status 均未变。
- 真实项目 adoption：固定 baseline/candidate，使用完整 disposable clones 与独立 HOME。repo-harness 自宿主 inspector 无 drift，init dry-run 为 0 operations；arch-context inspector 无 drift，dry-run 有 16 planned operations；aip-main-open inspector 发现 `root-agent-context-divergent`，dry-run 有 26 planned operations。planned 不表示已 apply。
- AIP 的 root-agent-context decision 被保留，没有覆盖生产项目指令。外部项目直接运行 candidate inspector/init 的结果属于 adoption 证据，不属于 live model Skill effectiveness。
- 最终五文件 subject patch SHA-256：`4475e788b47a7996881d39a928d2e467d2c58f64b66434dd7000f3cd67a1ebaa`，baseline `ed6df3d5`。真实项目 revision：`arch-context@c0291c2`、`aip-main-open@311f356`；raw adoption evidence 位于本机 `/tmp/repo-harness-real-regression.c8y62X`。AIP inspector 的 required decision 不使 dry-run 自动失败，不能把 `failed=0` 解释为可以直接 apply。
- 六项 repository-integrity checks 全部 exit 0：deploy SQL order、architecture sync、task sync、strict workflow、project inspector、init dry-run。task sync 明确解析为 lite 且无需 workflow artifact。对应本机日志为 `/tmp/workflow-maintenance-integrity/`；没有手写 checks、plan、contract 或 todo。
- 一次独立 forward test 在 `default` native child 路由阶段返回 `native-role-routing unavailable`，没有读取 Skill、没有模型行为覆盖，计为环境阻塞。它不同于 Skill 内容失败，不据此修改角色权限或扩大任务。
- 同一只读请求随后由可用的 native `explorer` 执行：读取新 Skill，运行 collector，核对限定历史及项目指令，返回有来源的恢复/验证处置候选。结果仍为 155 records / 37 sessions，没有写入项目、配置、记忆，没有清理进程或启动完整测试。这是一次真实使用的有限 forward evidence，不构成跨模型有效性结论。

本轮 repo changed paths：`AGENTS.md`、`CLAUDE.md`、两份 `global-working-rules.md`、`tasks/lessons.md` 和本报告。全部是文档/指令说明；没有改动 product/runtime source、测试基础设施或 machine-executed contract。沿用根风险分级，不跑整个 `bun test`；仍执行行为相关检查和六项 repository-integrity checks。

## 样本索引

S=状态/遗漏/收口；R=接手/恢复；I=Issue 批处理；X=含 interrupted turn。空白代表未归入这三类，不代表任务无价值。

| Task ID | 分类 |
| --- | --- |
| `019fff38-708f-7dd3-9b4c-c26cb53ddf35` | S |
| `01a03229-449f-77e3-a9ec-c0eb70738013` | X |
| `01a03710-b05d-7cb2-8fff-502331bc41d9` | |
| `01a03d09-68fb-7b31-8642-b2678a9173e0` | |
| `01a05678-a943-7b10-90b4-b2879333af0d` | S I |
| `01a0595d-c868-7f60-ae24-a4ecdff2ee3e` | I |
| `01a06fdb-dfd7-7c21-a743-db39f62006fc` | |
| `01a06fed-b7f6-79a1-8bd2-fb4014ba3d9` | S |
| `01a06fed-31b6-7093-b9f6-b7b4575b2373` | R X |
| `01a06fb2-5159-7483-9131-29af244c5c84` | R X |
| `01a06deb-15ff-7bc3-8872-c680bafa1467` | |
| `01a06de6-1575-7470-a1f6-2a54eff5b666` | X |
| `01a06e28-c8f8-70b1-9599-ecbdda4c6fe3` | |
| `01a06b4d-380e-7c81-9ca9-dbf7585d0bfa` | S X |
| `01a06d94-959d-7952-800b-e18dd1738643` | |
| `01a06c39-5bc5-74b3-830f-c6d6b09ae2d2` | S |
| `01a06c07-7291-7b60-877a-2656917cf3ae` | |
| `01a06a98-57f0-7940-a1f3-7dacd4d76c66` | S X |
| `01a06b47-2873-7342-b719-00a55c34f554` | |
| `01a068e4-f04c-71a1-ab4d-eb51a1613513` | S X |
| `01a068e2-cf3d-75a1-aeac-4780655012e6` | I X |
| `01a06a9a-64ec-7ac3-ad66-28c7a4828514` | |
| `01a06925-5a55-7b92-892e-63110d182c61` | S R |
| `01a0684f-0efe-7f70-8c84-e2a99edadd1b` | |
| `01a06877-b2f9-71f0-a597-224241fea53e` | R |
| `01a06869-a2a3-7d02-af6a-9ccc8af66e79` | I |
| `01a06847-cc09-7220-94ad-f4ff2673165a` | |
| `01a06836-0eee-79d2-9e0f-13f272d28f34` | R |

## 阅读入口

- 根 `AGENTS.md#Required Checks`：验证范围权威。
- `docs/reference-configs/external-tooling.md`：受管 Skills 与真实同步流程。
- `tasks/todos.md`：worktree 判定分歧、context section 预算与 Stop 已知切片。
- `docs/researches/20260830-c9-real-multi-agent-canary.md`：真实 provider wire 与效率结论。
- `docs/researches/20260904-bounded-frontier-stress-test-eval.md`：结构检查和 live effectiveness 的区分。
- `evals/skill-routing/phase-b-attempt-outcome.json`：污染实验不能据以验收的原始结论。

后续最小产品切片是统一 `isolated_contract_worktree` 判定：同一 primary/linked worktree fixture 同时调用 Effective State 与 guard，消除“state allow、实际拒绝”的明确矛盾。这一边界足以闭环已复现的三轮无效恢复，不需要同时重做权限系统、SessionStart 或 Stop。
