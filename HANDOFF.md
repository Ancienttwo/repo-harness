# HANDOFF — Hook Runtime Diet 链式推进（HRD-06..09，写给零上下文的新会话）

> 生成于 2026-07-20，上一会话的 orchestrator。读完本文件 + 引用的仓库工件即可续跑。
> 本文件未跟踪（git 脏项），恢复上下文后删除。

## 一、任务是什么

执行 Harness Loop Program（源：`plans/sprints/20260715-harness-loop-audit-and-optimization.md`）
的 Sprint B：`plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`（HRD-01..09，
9 行 backlog，每行独立 work-package/worktree/PR）。Sprint A (LSC) 已 Done。
用户已下达整链推进指令（合并、豁免、逐行连续执行），本会话内已对 HRD-05..09
两次明确重申（外审豁免延续 + 合并授权延续）——但见「锁三行」，**新会话仍需重新确认**，
这是用户established的纪律，不因本会话已确认而自动继承到下一个零上下文会话。

## 二、已完成（全部已合并，main @ `e0e57acd`）

| 项 | PR | 交付 |
|---|---|---|
| HRD-01 协议+runtime 基线冻结 | #94 | LoopEvent 协议、11 route characterization golden |
| HRD-02 StateInputCollector | #95 | lazy 记忆化 collector，SessionStart 单 resolution |
| P0 修复包（行间插入） | #96 | fail-closed 状态权威 + runner 约束真实化 + `runner_invocations` fail-closed 改名 |
| HRD-03 PreEdit cutover | #97 | `mutation-guard.ts` 替换 2 脚本，子进程 30→21，九项差分字节恒等 |
| HRD-04 SessionStart 合并 | #98 | `session-context.ts` 替换 3 脚本，26→22，含轮转移植与 detached populate |
| HRD-05 PostEdit 事件日志 | #99 | `mutation-observed.ts` 替换 2 脚本，per-edit 多次投影写→单 journal 事件，消费即删 |

Sprint 进度 **5/9**（sprint 文件 backlog 已回填，含 plan 链接列）。
`tasks/current.md` 已刷新为 Idle/干净快照。HRD-05 worktree 已按纪律核实无独有内容后
移除，本地分支已删；远程分支随 squash 一并删除。

### 本会话对 HRD-05 的额外处理（下一行会重复遇到，记录经验）

- HRD-05 worktree fork 时 main 在 `163488bb`；收尾 push 时 origin/main 已推进到
  `a1d17f22`（中间插了两条纯 docs commit：`eb48d698` lessons、`a1d17f22` todos）。
  GitHub 报 `mergeable: CONFLICTING`。用 `git merge-tree --write-tree` 非破坏性预判，
  确认唯一冲突在 `tasks/todos.md` 头部 `Updated` 时间戳行（HRD-05 分支自己对该文件
  只碰了这一行，无实质内容），`tasks/lessons.md`/两份 `sprint-contracts.md` 自动合并干净。
  用 `git merge origin/main --no-edit`（不用 rebase，避免动已过双轮 gate 的 commit SHA）
  解决，取 main 侧全文（严格超集）。合并后重跑受影响套件确认无回归，再 push。
- `sprint-backlog complete-task` 有幂等保护，重跑会报「already complete」拒绝——
  **必须在第一次调用就带 `--plan <path>`**，否则 Plan 链接列会卡在 `(pending)`，
  之后只能手工编辑那一格（本会话踩过一次，手工订正了 backlog 表格行和历史记录行两处）。
- `refresh-current-status` 默认只预览（打印到 stdout），**必须加 `--write`** 才真正落盘，
  容易把预览输出误认为已完成写入。
- merge-gate skill 文本自称 "Tool-free"，但 `merge-gatekeeper` agent 实际带完整工具权限；
  实操模式是把 base/head SHA、diff 指纹（sha256）、完整 diff（内联或指定文件路径让它 Read）、
  goal artifact（合同全文）、已编译的验证证据都显式喂给它，指示它不要重跑变更性命令，
  而不是指望它真的没有工具能力。

## 三、当前状态：HRD-06 预枚举已完成，合同待校准

**Worktree**：`/Users/kito/Projects/repo-harness-wt-hrd-06-stop-handler-slim`
分支 `codex/hrd-06-stop-handler-slim`，base `e0e57acd`（HRD-05 全链收口后的 main）。
已生成：`plans/plan-20260720-2256-hrd-06-stop-handler-slim.md`（thin 占位 plan，
未经 `$think` 展开）、`tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md`
（**BriefPreflight 已标记未自足**：Goal/Scope/Allowed Paths/Exit Criteria 待填）、
配套 notes/review 空壳。**尚无任何代码改动**——下一步是把本节的预枚举结论
（已由 explorer 跑完，FINDINGS: COMPLETE）转写成合同，然后走标准节奏第 3 步起。

Sprint 行 6 acceptance line：「port the Stop orchestrator to an in-process handler
that consumes the HRD-02 collected input and the LSC-07 shared readiness verbatim,
flushes the pending journal, and performs exactly one batched projection-write
transaction per Stop; minimal-change and delegation checks consume already-collected
facts with no second Effective State resolution and no readiness recomputation,
the stale pre-cutover docstring in `operation-readiness.ts` is corrected, and
`stop-orchestrator.sh` is deleted with the projection re-synced in the same package.」

### 预枚举结论（explorer 全量扫描，写合同时直接引用，不要重跑同样的 grep）

**脚本本体**：`assets/hooks/stop-orchestrator.sh`（812 行），`.ai/hooks/` 副本字节相同。
职责按执行顺序：
1. `refresh_handoff()`（597-600，768 处调用）——**无条件**运行，写 handoff。
2. `stop_resolve_state()`（633-716）——每次运行一次 memoized `state resolve --json
   --operation inspect`，解析 `.workflow_profile` 与 `.readiness.{allowedToStop,
   readyToShip,nextAction}`；**不**自己调用 `evaluateReadiness`，只读已投影好的字段
   （这就是 LSC-07 shared readiness，见下）。
3. Lite 早退（774-777）。
4. `stop_maybe_block_on_readiness`（730-734，line 779）——唯一能吐 `decision:"block"` 的路径。
5. `stop_report_not_ready_to_ship`（739-742，line 780）——仅 stderr，不阻塞。
6. minimal-change review 刷新 + handoff 追加（234-302，line 782-783）——**这里有第二次
   独立写**：279-296 还会 touch resume packet 以满足 `check_handoff_resume_pair`。
7. review-freshness stderr 提醒（785-794）——不阻塞。
8. plan-completeness gate（25-172，line 796-807）——可吐 block，写
   `.ai/harness/planning/plan-completeness.json`。
9. delegation fallback block（304-595，line 809-812）——可吐 block，读写
   `.ai/harness/delegation/{latest.json,turns/<scope>.json}` + 手搓非抢占锁文件
   （408-594 有整段注释记录过 5 轮锁竞态失败迭代，改造时务必先读）。

**关键结论：今天 Stop 已经是两段式**（`runtime.ts:422-448`）：
(1) TS 侧 `consumePendingPostEditEvents()`（HRD-05 交付，故意排除在
`scriptsRun`/遥测之外以保 golden 字节不动）无条件先跑；(2) 随后通用脚本循环
原样跑 bash 脚本。HRD-06 的「flushes the pending journal...one batched
projection-write transaction per Stop」就是要把这两段合成一个 in-process
handler，且把 bash 脚本今天至少两次独立落盘（handoff 追加 + resume touch，
外加 block 路径上的 delegation-state/plan-completeness 签名写）收成一次事务。

**Route 注册**：`route-registry.ts:140-144`，`Stop.default` 还是
`scripts: ['stop-orchestrator.sh']`，需按 HRD-03/04/05 先例改 `scripts: []` 并加注释。

**HRD-02 collector**：`state-input-collector.ts:61-93` 目前只有
`getSessionEffectiveState()`（SessionStart 形）和 `getPreEditEffectiveState()`
（PreEdit 形，HRD-03），**没有 Stop 形的 getter**——HRD-06 要么新增一个 memoized
`getStopEffectiveState()`，要么复用现有形状之一，写合同前需要做这个设计判断。

**LSC-07 shared readiness 是什么**：不是独立模块，是 `operation-readiness.ts:269-310`
的 `evaluateReadiness()` 产出的 `EvaluateReadinessResult`，被
`project-effective-state.ts:293-341` 投影进 `EffectiveStateV1.readiness`
（`types.ts:111-120`），今天 `stop_resolve_state()` 已经在通过
`state resolve --json` 的 `.readiness` 字段读它。

**陈旧 docstring**（acceptance line 点名要修）：`operation-readiness.ts:19-20`
写着 "No consumer imports this module yet: LSC-07 (Stop) and LSC-08 (adapter
parity) cut consumers over separately" —— 这是假的，`project-effective-state.ts:10,330`
已经在 import/调用它了（LSC-07 PR #89 早就接好）。同文件其它注释已经是新的，
只有这两行没跟上，直接改。

**调用点分类**（LIVE，需要合同 Allowed Paths 覆盖）：
- `route-registry.ts:143`；`runtime.ts:423,430`（描述两段式的注释）
- `tests/cli/route-registry.test.ts:79,119`
- `tests/cli/hook.test.ts` ~13 处/~8 个测试（含 2676-2700 一个**用字面锚点字符串拼接
  bash 源码注入竞态暂停**的测试，TS 化后没有直接对应手法，写合同/`$think`阶段要定策略）
- `tests/hook-contracts.test.ts:28,233`（断言 bash 源码字面串存在/不存在）
- `tests/hook-runtime.test.ts`：5 个专属测试（2011,2103,2136,2169,2897）+ 通用
  dispatcher（1775）+ 本地 `runHook()` 测试 helper（373，直接 spawn bash，
  和生产 `runtime.ts` 的 `runHook()` 只是同名）
- `tests/state/adapter-parity.test.ts:314-320`（LSC-08 四面 parity gate，直接 spawn 脚本）
- `tests/state/loop-semantics-characterization.test.ts`（`STOP` 常量 + `captureStop()`
  + `stopProfileSource()`，源码字面串做 ordering marker——同 HRD-03 `mutation-guard`
  已有的迁移先例可以照抄）
- golden fixtures：`tests/fixtures/loop-runtime/characterization.json:241`
  （HRD-01 golden 的 Stop 单元格）+ `tests/state/fixtures/loop-semantics/characterization.json:212,260,310`
- `tests/readme-dx.test.ts:90`
- 文档 ripple：README 五语言版全部命中（`README.md:34,572` +
  `README.{zh-CN,ja,fr,es}.md`）；`docs/reference-configs/hook-operations.md:31-32`
  + `assets/` 镜像；`docs/reference-configs/minimal-change-hooks.md:21` + `assets/` 镜像；
  `docs/architecture/index.md:39-48`（LSC-08 parity 段落点名）；
  `docs/architecture/modules/runtime-harness/hook-adapters.md:82-90,203`（含一条
  mermaid 边 `Stop --> StopOrchestrator["stop-orchestrator.sh"]`）。

**HISTORICAL（不用动）**：`tasks/archive/`、`plans/archive/` 下全部；已关闭的
LSC-01..08 系列 contract/notes/review（含 LSC-07 自己已关闭的合同）；旧 sprint 文件；
`docs/researches/*`；已关闭的 plan 文件。

**Projection manifest**：`assets/hooks/projection.json` / `.ai/hooks/.projection.json`
是整目录摘要（digest + file_count），不按脚本名逐条列——删文件后跑
`bun scripts/sync-hook-sources.ts --write`（即 `check:hooks` 背后的写入版）会自动
把 `file_count` 从 18 降到 17，同 HRD-05 退役机制。

**四个待写合同时裁决的不确定项（explorer 未擅自下结论，orchestrator 校准合同时定）**：
1. `scripts/repo-harness.sh` 的 bash-shim JSON 模板 + 注释头对 HRD-03/04/05 退役的脚本
   也早就没跟上（不只是这一行的 `stop-orchestrator.sh`）——不清楚这文件是不是前三个 PR
   遗留的既有缺口，还是 HRD-06 ripple 该顺手带上。倾向于：**判定为既有缺口，记入
   HRD-09 的 historical-residue sweep，不在 HRD-06 里顺手修**（除非它其实是 live 安装路径）。
2. `docs/architecture/modules/runtime-harness/hook-adapters.md` 同样有超出 Stop 相关行
   范围的既有 partial-ripple 陈旧——同上，倾向于判定为既有缺口而非本行范围。
3. `tests/cli/hook.test.ts:2676-2700` 的源码拼接竞态测试手法，TS 化后没有直接对应——
   需要在合同 Scope 或 notes 里明确写这一测试怎么迁移（新 seam？换测试策略？）。
4. Stop 形 `StateInputCollector` getter 的具体形状（新增 vs 复用）——写合同 Scope 时定。

## 四、每行的标准节奏（已验证 5 轮，HRD-06 起继续套用）

1. `repo-harness run sprint-backlog start-task --sprint <sprint> --task <row> --execute`
   （HRD-06 已执行）
2. 校准 contract（Why/Goal/Scope/Stop/Falsifier/exact allowlist/Exit Criteria；
   模板见已合并各行合同；**必含**：预枚举一轮制（HRD-06 已完成，见上）、
   falsifier-first、full-suite-before-reporting、golden per-field delta 政策——
   参考 `sprint-contracts.md` Cutover Package Discipline）
3. Start Gate：worktree 内 `bun src/cli/index.ts run contract-run preflight` +
   `check-task-workflow --strict`
4. 派 fast-worker（EXECUTION_BOUNDARY 条款、Allowed Paths only、no commit、
   **local CLI only**）
5. `/check` 直读关键 diff → 派 gatekeeper（fresh context，实跑验证）→
   FAIL 则修复轮 ≤3 → delta re-gate
6. Review 卡：subject 哈希用
   `bash -c 'export HOOK_REPO_ROOT="$PWD"; source .ai/hooks/lib/workflow-state.sh; workflow_current_review_subject_value'`；
   manual_checks 证据必须放 `## Manual Check Evidence` 小节
   （checkbox + `- Evidence:` 行，字面串精确匹配）
7. `bun src/cli/index.ts run verify-contract --strict` → Fulfilled → push → PR →
   `gh pr checks --watch` 后台盯 → **先查 `gh pr view <N> --json mergeable,mergeStateStatus`**，
   若 `CONFLICTING`（origin/main 在本行 fork 后又推进过）先用
   `git merge-tree --write-tree` 非破坏性预判冲突范围，`git merge origin/main --no-edit`
   解决（不用 rebase），重跑受影响套件后再 push → merge-gate JSON 裁决
   （见上「Tool-free 是自称非实际」的经验）→ squash merge（subject 带 `(#N)`，
   **务必带 `--delete-branch`**）→ ff main → `sprint-backlog complete-task --task <N>
   --plan <plan-file>`（**第一次调用就带 `--plan`，否则要手工订正**）→
   `refresh-current-status --write`（**不加 `--write` 只是预览，不会落盘**）→
   豁免记录进 review 卡外审段 → push → worktree 手工清理（squash 后 cleanup 的
   ancestor 判定必拒：先 `git diff origin/main..分支` 证明无独有内容再
   `worktree remove` + `branch -D`；注意这个 diff 在纯 docs 回填文件上天然会显示
   差异——要逐个确认差异方向是「main 更新/分支落后」而非「分支独有」）

## 五、踩过的坑（绝对别再踩，含本会话新增）

- **全局 `repo-harness` CLI 是旧打包代码**：worktree 内一律 `bun src/cli/index.ts`。
- **archive-workflow 被门卡死**：要 verify-sprint 通过证据 + 外审 pass，solo-operator
  缺口（todos 有行）使其暂不可满足——归档批到 sprint 收口，别在行间死磕。
- zsh 不做词拆分：`${TO:+$TO 1800}` 会当单命令；直接写 `gtimeout` 全路径。
- Write 工具内容里的 ` ` 字面量会变成真 NUL 字节（review 卡踩过）。
- README 有**五个**语言版（含易漏的 `README.fr.md`）。
- gatekeeper 的 advisory 是待验证的主张不是事实（3b 案：worker 用 base-SHA 函数级
  证据推翻"死代码"判断，re-gate 确认）。
- Codex 配额耗尽至 2026-08-16：外审门（finish/ship 路径 expected reviewer=Codex）
  过不了，见锁三行。
- **origin/main 会在 worktree fork 之后、行收尾之前继续推进**（本会话 HRD-05 实例：
  两条纯 docs commit 插入导致 GitHub 报 `CONFLICTING`）——push 前务必
  `gh pr view --json mergeable` 复查，别假设「CI 绿 = 能直接 squash」。
- `sprint-backlog complete-task` 幂等保护 + `--plan` 必须首次带上，见二节。
- `refresh-current-status` 默认预览、需要 `--write` 才落盘，见二节。
- worktree 清理前的 ancestor 校验 diff，在纯 docs 回填文件上天然非空——要看差异方向
  （main 新/分支旧），不是看「diff 是否为空」。

## 六、锁三行（用户明确要求的裁决边界）

- **当前唯一负责人**：orchestrator 会话（每 worktree 单写者；HRD-06 worktree 归其
  合同 allowlist；main 当前无人持锁）。
- **改结论所需的新证据**：gate 裁决必须带实跑命令输出；golden 决策语义字段永不移动，
  runtime 形态字段仅按合同 per-field 政策一次性再生成；"死代码/可删"类主张必须有
  base-SHA 归属函数证明 + 真实 exerciser grep。
- **必须人工确认的下一关**：①外审豁免——本会话已对 HRD-05..09 两次明确重申整链豁免，
  但这是**对话内确认**，不是 CLAUDE.md 级别的持久指令；新会话首次撞外审门时**仍必须
  重新问用户**（可引用本会话的先例加速确认，但不能替代询问），豁免记录格式见
  HRD-02/03/04/05 review 卡外审段，actor/reason/scope 如实记录，禁止伪造
  reviewer=Codex；②每个 PR 的合并令同理，先向用户确认整链授权是否延续
  （本会话内若原会话未中断，此确认已经有效，可直接续跑不必重问）；③HRD-09
  校准时的残留清单裁决（todos 有行 + 本次 explorer 标记的两个「既有缺口 vs 本行
  范围」不确定项，建议判给 HRD-09）。

## 七、HRD-06 之后的队列

HRD-06 Stop 精简（本行，见三节）→ HRD-07 circuit 震荡/churn 检测 + 锁统一
（progress-token key 已由 LSC-04 交付，勿重做）→ HRD-08 事件级遥测 + diet report
实测证据（LOOP-12 目标表）→ HRD-09 退役收官（run-hook.sh、adopted-fixture 一次性迁移、
遥测证零 legacy 调用、**todos 里的 historical-residue sweep 行 + 本次 explorer 标记的
`scripts/repo-harness.sh`/`hook-adapters.md` 既有缺口，均并入其 Scope**）→
EPC sprint 促建（post-HRD fresh SHA 起）→ SSD。
另有 todos 挂账：verify-contract qa_scores 归一化、solo-operator 外审政策决策。

## 八、工件地图

- Sprint/回填：`plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`
- HRD-06 工件：`plans/plan-20260720-2256-hrd-06-stop-handler-slim.md`（占位，未 $think）、
  `tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md`（未自足）、
  配套 `tasks/notes/`、`tasks/reviews/` 空壳
- 各行合同/notes/review：`tasks/{contracts,notes,reviews}/20260720-*`
- 纪律参考：`docs/reference-configs/sprint-contracts.md`（Cutover Package Discipline）
- 教训：`tasks/lessons.md`
- 挂账：`tasks/todos.md`
- 用户全局规则（新会话自动加载）：禁兼容代码（memory 已存）、模型分工
  （Fable 编排/sonnet 执行/gatekeeper 验收）、review 触发纪律
