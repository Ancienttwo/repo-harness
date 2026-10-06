# Plan: 自动关闭已完成的 herdr pane（pane reap）

> **Status**: Design only，rev 4。§9 的 D-1、D-2 和 Q1-Q9 已按 PR #563 body 的 2026-10-06 决定锁定。第四轮 Codex review：APPROVE WITH CHANGES，处理记录见 §10.5。§10 不是独立验收。合并本 plan 不授权实现。Phase 1-3 写代码前仍需 Aimpact 明确 GO。
> **Created**: 20261005-1811；**Revised**: 20261006（rev 4，同步已锁定决定，修正无 upstream 的 `--no-pr` 范围）
> **Slug**: pane-auto-close
> **Planning Source**: claude-plan
> **Orchestration Kind**: host-plan
> **Artifact Level**: work-package
> **Promotion Reason**: safety_boundary（关闭 pane 会结束 agent 进程和 pane 中的全部进程）
> **Verification Boundary**: 每个 phase 一个 PR，每个 phase 有自己的测试集合（§7.0）；`bun run check:type`；`bun run test:files tests/herdr-pane-reap.test.ts --timeout 60000 --max-concurrency 1`；真实一次性 herdr session 和真实临时 Git remote
> **Rollback Surface**: 每个 phase 单独 `git revert <squash-commit>`；ledger 只增不改；dry-run 是 CLI 默认值；Phase 1 不包含任何关闭代码
> **Baseline**: `main@a7442c78`
> **Spec**: `docs/spec.md`

文件名说明：简报指定 `plans/plan-20261005-pane-auto-close.md`。仓库惯例是 `plan-YYYYMMDD-HHMM-<slug>.md`。本文件按简报命名。

事实标记：
- 文件路径和行号在 `a7442c78` 上核对。
- **observed**：在本机 herdr 0.9.3 上用只读命令观察（`pane list/get/layout/process-info`、`agent list/get`、`tab list/get`、`api schema --json`、`-h`、`herdr --skill`）。
- **V-result**：在一次性 herdr 0.9.3 server 上实测（session `task-proof-64869b696fb8aa8b`，`XDG_CONFIG_HOME` 和 `HERDR_CONFIG_PATH` 在 `/tmp/reap-probe` 下，2026-10-05 18:53-18:59 HKT）。默认 server 和 workspace `wA` 没有被这些实验改变。
- **inferred**：从数据推断，没有证明。**unverified**：没有核对。
- 本文件的作者没有运行任何改变 herdr 状态的命令。

---

## 0. P1 / P2 / P3

**P1 地图（真实边界）**
- CLI → `src/effects/terminal/herdr.ts` → 本机 herdr server。`herdrCommand` 用 `spawnSync`，不经过 shell，默认外层超时 10 秒（:5、:32-34），去掉 `HERDR_*` 环境变量（:15）。`validateHerdrEndpoint`（:45-62）计算并校验 socket 路径。它不调用 `realpath`。
- 现有的关闭路径都在 `src/effects/terminal/task-session.ts`，都属于 task-agent：
  - bound 路径：`cleanupTaskAgent` 的 `pane close`（:747）。
  - unbound 启动清理：`closeUnboundTaskStart` 的 `pane close`（:699）。
  - task worktree 的 `workspace close`（:856）。
- notify 插件：`assets/herdr/webhook-notify/notify.mjs`，安装命令在 `src/cli/commands/herdr.ts`。插件只通知。
- 主机级状态根目录：`REPO_HARNESS_HOME`，默认 `~/.repo-harness`（`src/cli/mcp/coding-workspaces.ts:110-112`）。
- Bot 的简报 pane：仓库里没有创建它们的代码。用 `grep` 在 `src/` 中查 `tab create` 和 `send-text`，结果为 0。Bot 直接调用 `herdr tab create`、`herdr pane split` 和 `send-text`。

**P2 一条真实路径（task-agent 关闭）**
`closeTaskAgent`（:757）→ `cleanupTaskAgent`（:715）→ 加锁（:718）→ `readTaskAgent` 校验 binding、intent 和 pane-created（:492-514）→ `assertCreated` 拒绝 attached 对象（:721，定义在 :102-106）→ 有未完成 request 时拒绝（:723-728）→ 写 `close-intent.json`（:733）→ `stopCreatedProcess` 发 SIGTERM，再发 SIGKILL（:626-636）→ 前台进程只剩 shell 时 `pane close`（:742-747）→ 写 `closed.json`（:749）。

这条路径证明进程和 pane 的身份。它不证明「接受」、PR 状态或用户输入的安全。在 `stopCreatedProcess` 中，guard 在发信号前运行，之后最多等 5 秒，两次信号最多 10 秒（:626-635）。task-agent 的设计假设它的 pane 只由 harness 使用。这是工作流假设。代码中没有阻止用户在 task-agent pane 中输入。简报 pane 是交互式的，用户会在里面输入。

**P3 为什么现状是这样**
- task-agent 只关闭它自己 `created` 的对象。所有权证据是 intent → split → pane-created → binding 这条链（:443-465）。
- `cleanupTaskWorktree` 写明 Git 的 dirty、publish 和 merge 检查属于调用方（:796）。它从不删除 worktree（:855）。
- 0.20.0 把自动清理列为延后项（`docs/CHANGELOG.md:52-55`、`:182-183`）。

本设计保留这些不变量：只关闭有创建证据的对象；关闭前重新证明身份；先写持久 intent，再做变更；从不删除 Git 数据。本设计增加两条：**关闭授权绑定一个明确的结果版本**；**关闭不能连带删除用户的 tab 或任何 workspace**。

---

## 1. 问题

1. **只有通知，没有关闭。** notify 插件只处理 `pane.agent_status_changed` 的 `done` 和 `blocked`（`notify.mjs:30-32`）。`done` 只发给 `<CHANNEL>_NOTIFY_DONE=1` 的渠道（`notify.mjs:64`；安装选项在 `herdr.ts:187-190`；默认值在 `herdr.ts:106-109`；安装提示在 `herdr.ts:172`）。Max 上的本地 fork 总是发送 `done`。两者都不关闭 pane。
2. **现有关闭路径不覆盖简报 pane。** 三条路径（§0）都只处理 task-agent 的 binding 和 workspace。task-agent 按 `(repository, task, role)` 存在 `<primary_root>/.ai/harness/runs/task-agents/<sha>/`（:356-360），并且依赖 request/result 轮次（:585-625）。
3. **Bot 的简报 pane 没有所有权记录。** 在 workspace `wA` 中，Bot 用 `herdr tab create` 或 `herdr pane split` 创建 pane，然后用 `send-text` 启动 `claude` 或 `codex`。没有 binding，所以没有代码能证明这些 pane 属于 Bot。没有东西关闭它们，所以它们越积越多。观察：约 18:00，`herdr agent list` 显示 `wA` 有 9 个 agent pane。约 18:15，`herdr pane list --workspace wA` 显示 6 个 agent pane，分布在 4 个 tab 中，其中 4 个是 `idle` 或 `done`。
4. **文档写明自动清理被延后。** `docs/CHANGELOG.md:52-55` 和 `:182-183`。
5. **布局规则只写在文档里。** `docs/reference-configs/external-tooling.md:244` 要求一个 tab 最多 3 个并排 pane，不能纵向叠放。没有代码执行这个规则。

### 1.1 herdr 0.9.3 的相关事实

| # | 事实 | 来源 | 状态 |
|---|------|------|------|
| H1 | `pane.close` 的参数 `PaneTarget` 只有 `pane_id`。`tab.close` 的参数 `TabTarget` 只有 `tab_id`。没有条件字段。 | `api schema --json` | 文档 |
| H2 | 没有输入锁。`pane input` 只设置右键路由（`PaneInputSetParams{pane_id,right_click}`）。 | `pane input -h`、schema | 文档 |
| H3 | 已关闭的 tab 和 pane ID 不会被复用。pane 移到另一个 workspace 后得到新的 pane ID。 | `herdr --skill` | 文档 |
| H4 | agent name 跟随当前 occupant；agent 退出、被释放或被替换时 name 被清除。 | `herdr --skill` | 文档 |
| H5 | prompt 提交成功不证明 agent 开始了一个 turn。 | `herdr --skill` | 文档 |
| H6 | `agent get` 返回 `completion_seq`、`state_change_seq`、`agent_session{kind,value}`。它们是 lifecycle 证据，不是输入证据。 | `agent get` | observed |
| H7 | 关闭 tab 中最后一个 pane 时，herdr 自动关闭这个 tab；之后 `tab get` 和 `tab close` 返回 `tab_not_found`。 | V1 | V-result |
| H8 | 关闭 workspace 中最后一个 tab 的最后一个 pane 时，herdr 关闭这个 **workspace**。 | V1 | V-result |
| H9 | server 重启后，每个 pane 的 `terminal_id` 都变化。 | V2 | V-result |
| H10 | server 重启后，`pane_id`、`tab_id`、tab label 和 `agent_session.value` 保持不变。 | V3 | V-result |
| H11 | `resume_agents_on_restore` 默认是 true。Max 的 `~/.config/herdr/config.toml` 没有 `[session]` 部分，所以使用默认值。重启后 herdr 自动运行 `claude --resume <session>`：原来的 agent 参数（例如 `--model opus`）丢失；provider PID 和 `terminal_id` 变化；agent name 保留；`state_change_seq` 从 3 变为 2；`completion_seq` 变为 null。所以重启后的 seq 可以小于或等于重启前的快照。 | V4 | V-result |
| H12 | `resume_agents_on_restore=false` 时（repo-harness 测试 fixture 的设置），重启后 agent 不存在，pane 停在 shell。新的 `agent start` 让 `state_change_seq` 从 1 开始。 | V4 | V-result |
| H13 | `agent start --kind claude -- --model opus` 和 `--kind codex -- -m … -c …` 都成功，参数原样传递，约 3-4 秒到 ready。Claude 立即返回 `agent_session`，`state_change_seq` 是 1。Codex 的 `agent_session` 是 null，`agent_status` 是 `unknown`，直到第一次 prompt 之后才有 session id。 | V5 | V-result |
| H14 | Claude：`foreground_process_group_id` 等于 claude PID；5 个前台进程（claude 和 MCP 子进程，都在同一个 PGID）。Codex：`foreground_process_group_id` 等于 codex PID；1 个前台进程。两者的父进程都是 shell。 | V6、observed（`w9:pG`、`wA:p21`） | V-result |
| H15 | 没有任何信号能看到未提交的输入。在 shell pane 和 Claude pane 中输入草稿，`revision`、`state_change_seq` 和 `completion_seq` 都不变。命令输出也不改变 `revision`。`events.wait` 拒绝 `pane_output_changed`，`events.subscribe` 也没有这个订阅。`pane.scroll_changed` 只在 scrollback 增长时触发。只有屏幕内容（`pane read`）显示草稿。 | V7 | V-result |
| H16 | focus 一个 `done` 的 agent，`agent_status` 从 `done` 变为 `idle`，seq 不变。 | V7 | V-result |
| H17 | `pane close` 结束整个终端会话：provider、shell、前台任务，以及 shell 的后台任务（另一个 PGID 中的 `sleep 6001 &`）。 | V8 | V-result |
| H18 | Codex 的 rollout 文件和 Claude 的会话 jsonl 在关闭或 server 停止后保持完整。`claude --resume <id>` 能继续会话。`codex resume` 没有测试。 | V8 | V-result；codex 部分 **unverified** |

---

## 2. 目标与非目标

### 目标
- G1. 只关闭 Bot 或 harness 通过 repo-harness 创建的 pane，并且要有持久的创建证据。
- G2. 只在一个明确的结果版本被明确接受后关闭。接受有三种：Bot 对这个结果版本写 `accepted`；Bot 写 `obsolete`；这个结果版本声明了至少一个 PR，并且全部 PR 已按声明的 head merged。
- G3. 结果版本声明之后出现可观察的新活动，就不能用这个声明关闭。
- G4. worktree 有未提交或未推送的工作时，不关闭。结果版本中有 PR 还是 open 时，不关闭。
- G5. 从不触碰用户自己的 pane、tab 或 workspace。关闭 pane 不能连带删除用户的 tab 或任何 workspace。
- G6. Bot 创建的 tab 在最后一个 Bot pane 关闭时由 herdr 自动关闭（H7）。
- G7. 在创建 pane 时执行「每个 tab 最多 3 个并排 pane」的规则。
- G8. CLI 默认 dry-run。每个决定都输出结构化日志。

**时间边界（Review r2 P2-2）：** 所有检查只证明观察时的状态。herdr 0.9.3 不能原子地执行「条件成立才关闭」（H1、H2），也看不到未提交的输入（H15）。ledger 锁只约束 repo-harness 自己的命令。它不能阻止用户、其他进程或 GitHub 在观察后改变 pane、tab、文件或 PR。所以在 0.9.3 上，G3、G4 和 G5 都只在检查时成立。Aimpact 已选择 v1 dry-run 加逐个 token 确认后 apply（§4.0、§9 D-1 B）。人的确认不会消除这个缺口。

### 非目标
- 删除 worktree、分支、tab 或 workspace。代码中不出现 `worktree remove`、`branch -d/-D`、`tab close` 或 `workspace close`。
- 关闭 task-agent pane。它们有自己的生命周期。
- 关闭 provider 已经退出的 pane（S5）。v1 总是保留它们。
- 认领现有的无记录 pane（没有 `adopt`）。
- 自动处理创建不完整的 spawn。v1 只报告，由人处理（§6.4）。
- herdr 重启后重新绑定（没有 `rebind`）。
- 修改 notify 插件或 herdr 配置、常驻进程或定时器、跨机器控制（`herdr --machine`）。
- 把 pipeline ledger 作为所有权来源。它的写入方只在 kitos 上（`plans/plan-20261005-0405-operator-ui-revamp.md` §3.3）。`Run.pane`（`src/core/pipeline/types.ts:29-31`）以后可以引用 spawn_id，但只是投影。
- 屏幕内容哈希。它不能作为授权，v1 也不把它作为额外的否决条件。
- 通用 lifecycle 框架。只复用 task-session 的文件和进程原语，不复用 request/result 协议。

### 对简报策略的修正

| 简报策略 | 修正 | 原因 |
|----------|------|------|
| PR merged 就算接受 | Bot 用 `result` 声明一个结果版本：PR 集合、每个 PR 的 head SHA、本地 HEAD、upstream 和活动快照。只有 PR 集合非空、当前活动仍等于快照、merge head 等于声明的 head 时，merged 才算接受。没有 PR 的结果只能通过 `accepted` 或 `obsolete` mark 接受。spawn 声明过的 PR 一直留在 PR 义务集合中，直到 GitHub 显示它 MERGED 或 CLOSED。 | 旧 PR 的 merge 可以接受后来的另一个任务（r1 P0-2）。空 PR 集合会让「声明」变成「接受」（r2 P0-1）。新声明中省略一个 PR，不能证明这个 PR 的 loop 已结束（r3 P0-1）。 |
| settle 延迟用来处理 done/idle 抖动 | settle 以接受依据的时间为起点。条件是窗口已过，并且活动快照没有变化。 | 关键问题是「声明后有没有新活动」。 |
| worktree 有未提交工作时不关闭 | 检查 spawn 的 cwd 和当前 `foreground_cwd`。「已推送」用新鲜的远端证据精确定义（S10）。 | 本地 remote-tracking ref 可能过期（r1 P0-4）。 |
| 每个 tab 最多 3 个 pane | 创建时用 `pane layout` 检查整个 tab 的布局。 | 只看 pane 数和新分割方向，不能证明 tab 中没有纵向分割（r1 P1-4）。 |
| 不触碰用户的 pane 和 tab | `spawn` 不分割用户的 tab。reap 不调用 `tab close`。tab 和 workspace 的检查都在 `pane close` 之前。非 Bot tab 中的最后一个 pane 和 workspace 中的最后一个 pane 都不关闭。 | 关闭最后一个 pane 会连带关闭 tab，最后一个 tab 的最后一个 pane 会连带关闭 workspace（H7、H8）。 |
| 增加 | 关闭前，shell 的所有后代进程都必须属于 provider 的进程组。 | `pane close` 也结束 shell 的后台任务（H17）。 |
| 增加 | 已选择 dry-run 加逐个 token 确认后 apply（§9 D-1 B）。实现仍需明确 GO。 | H1、H2、H15。 |

---

## 3. 方案比较

| 方案 | 放在哪里 | 优点 | 缺点 | 风险 |
|------|----------|------|------|------|
| (a) herdr 插件 hook | `pane.agent_status_changed` 事件处理程序 | 事件驱动，延迟低 | 插件不知道结果版本和接受；需要 `gh` 凭据和 Git 检查；很难 dry-run；违反「Bot → CLI → herdr 是唯一命令路径」 | 高 |
| (b) CLI `repo-harness herdr reap`，由 Bot 调用 | `src/cli/commands/herdr.ts` + effects 模块 | 符合 Bot → CLI → herdr；默认 dry-run；JSON 报告 | 单独使用时只能猜所有权 | 单独使用：高；和 (c) 一起：见 §4.0 |
| (c) 创建时绑定所有权（`repo-harness herdr spawn`） | 同上 | 唯一可靠的「Bot 创建了这个 pane」证据；执行布局规则 | Bot 要从原始 herdr 命令改为调用 `spawn` | 低：只新增 |
| (d) 扩展 task-session / `cleanupTaskAgent` | `task-session.ts` | 已有身份证明、锁和关闭顺序 | 模型不同（每个 `(task, role)` 一个 pane、request/result 轮次、分割 worktree workspace 的 root pane :446）；ledger 位于 repo 下；task-agent 的 provider 规则要求只有一个前台进程（:378-383），交互式 Claude 不满足（H14） | 中 |

**推荐：(c) + (b)，复用 (d) 的文件和进程原语，不复用 (d) 的协议、provider 选择规则和「先停 provider 再关闭」的顺序。**
- 复用已导出的原语：`writeSessionArtifact`、`readSessionArtifact`、`ensureSessionDirectory`、`processIdentity`、`assertProcessProof`、`processProofAlive`、`assertCreated`。另外导出 `locked`（:361），不改变它的行为。
- 不复用 `stopCreatedProcess` 的顺序。它在检查和关闭之间留出最多 10 秒。`pane close` 本身会结束全部进程（H17）。
- (a) 不做执行者。Bot 收到 `done` webhook 后可以调用 `reap`。

---

## 4. 推荐设计

### 4.0 关闭的执行边界（r1 P0-1、r2 P0-1 状态）

**事实：** `pane.close` 和 `tab.close` 是无条件的（H1）。没有输入锁（H2）。没有输入版本（H15）。ledger 锁只约束 repo-harness 自己的命令。

**结论：** 在 0.9.3 上，最后一次检查通过之后、`pane close` 到达 server 之前有一个窗口。这个窗口中的用户输入、focus、`pane move` 和新建 pane 都不能被检测或阻止。另外，任何时候的未提交输入都看不到（H15）。重新读一次只能缩短窗口，不能关闭它。

**v1 能做的事：**

| 模式 | 0.9.3 上可用 | 保证 |
|------|--------------|------|
| dry-run（默认） | 是 | 完整：没有 herdr 变更，没有 ledger 写入 |
| 确认后 apply：`reap --apply --spawn <id> --confirm <token>` | D-1 已选择 B；实现和 T1/T2 验收后可用（Phase 2） | G1、G2 有证据。G3、G4、G5 在检查时成立。检查和关闭之间的窗口没有技术保护。未提交的输入看不到。每次确认都列出这两个缺口 |
| 无人参与的自动 apply | 否 | 需要 §4.0.2 的上游能力（Phase 3） |

#### 4.0.1 确认 token 和 digest（r2 P1-1）

- dry-run 对每个 `would_close` 输出一个 token：`<issued_at>.<sha256>`。sha256 的输入是 §6.2 的 `ConfirmDigestInputV1` 规范化 JSON（`canonicalize`，`src/core/evidence/canonical-json`）。
- digest 绑定：spawn 和 pane 身份、tab 和 workspace 的状态、结果版本号、接受依据（mark 号、kind、时间或 merge 时间）、settle anchor、活动快照、PR 证据、Git 证据、进程树事实和未能证明的项目列表。
- **有效期：** 从 `issued_at` 起 900 秒。apply 先检查时间，超时返回 `confirmation_expired`。
- **失效：** apply 在锁内用 token 中的 `issued_at` 重新观察并重新计算 digest。任何输入变化（新的 result、新的 mark、新的 PR、活动、tab 中的 pane 集合、Git 状态等）都会改变 digest，返回 `confirmation_stale`。
- **只用一次：** apply 写 `close-intent-<c>.json` 时记录 token。一个 token 只能开始一次关闭。它以后只能用于恢复这一个 close-intent。
- **恢复：** pane 仍存在时，恢复需要同一个 token 仍在有效期内，并且 digest 仍然相同；否则 keep，需要新的 dry-run 和新的确认。pane 已不存在时，只做已证明进程的清理和 `closed.json`，不需要确认。
- Bot 把列表交给 Aimpact。Aimpact 在当前消息中逐个确认。一次确认只授权一个 token。

**缩短窗口的顺序：** 锁内最后一次检查之后，下一个 herdr 调用就是 `pane close`。中间不停止 provider，也不等待。V8 证明 `pane close` 会结束全部进程（H17）。

#### 4.0.2 自动 apply 需要的上游 herdr 能力（r2 P0-2、P0-3、P1-3）

自动 apply 需要 herdr 在 server 端原子地检查下面的条件，然后关闭。任何条件不成立就返回 `precondition_failed`，什么也不关闭：

```text
pane.close {
  pane_id,
  if: {
    workspace_id, tab_id, terminal_id,
    foreground_process_group_id,
    input_seq,            // 值来自 result 声明，从不刷新
    state_change_seq,     // 值来自 result 声明
    focused: false,
    tab_close: "forbid" | { allow_if_label: "<label>" },
    workspace_close: "forbid"     // 固定值，没有 allow 选项
  }
}
```

- `input_seq`：每个 pane 一个单调计数器。server 的**每一个**输入接收路径都让它加一：TUI 按键（包括没有回显的按键和被应用吞掉的按键）、粘贴、`send-text`、`send-keys`、`agent prompt` 和 API `send_input`。herdr 0.9.3 没有这个字段（H15）。输出变化不能代替它：输出变化不等于输入，输入也不一定产生输出（r2 P1-3）。
- 期望值来源：`input_seq` 和 `state_change_seq` 的期望值都来自 `result` 声明时持久化的快照（§6.2 `ActivitySnapshot`）。digest 和条件关闭使用同一个声明版本的值。禁止用关闭前的新观察值刷新期望值（r2 P0-2）。
- 声明时没有 `input_seq` 的记录（包括 Phase 3 之前声明的全部记录）在自动 apply 中 keep（`input_seq_missing`），需要重新声明。没有兼容授权路径。
- `tab_close`：如果关闭这个 pane 会删除它的 tab，`forbid` 让请求失败；`allow_if_label` 只在 tab 的当前 label 等于给定值时允许。只有 ledger 中有 `tab-created.json` 的 tab 才可以使用 `allow_if_label`。这个条件同时覆盖 `pane move`、重命名和 tab 中 pane 集合的变化（r2 P0-3）。
- `workspace_close` 固定为 `forbid`：如果关闭会删除 workspace，请求总是失败（H8）。
- 不需要 `tab.close` 的条件版本，因为 reap 从不调用 `tab close`（H7）。

D-2 已选择提出请求，并已提交 [herdrdev/herdr#4967](https://github.com/herdrdev/herdr/issues/4967)。issue 状态不证明能力已可用。Phase 3 仍须通过 §7.4 的验收。

### 4.1 组件

| 组件 | 文件 | 职责 | 引入的 phase |
|------|------|------|--------------|
| 策略（纯函数） | `src/core/terminal/pane-reap-policy.ts`（新） | `decide(record, observation, now) → { action, reasons[], unprovable[], digest_input }`。§5 的规则 S1-S14 都在这里。没有 I/O。 | 1 |
| ledger 和观察 | `src/effects/terminal/pane-spawn.ts`（新） | `spawnPane`、`declareResult`、`markSpawn`、`observeSpawns`。读写 ledger，调用 herdr、git、gh、ps，调用 `decide`。 | 1 |
| 关闭效果 | `src/effects/terminal/pane-reap-apply.ts`（新） | `applyReap`：token 校验、close-intent、`pane close`、读回、进程清理。 | 2 |
| CLI | `src/cli/commands/herdr.ts`（扩展） | 5 个子命令（§4.2）。 | 1 |
| 导出 | `src/effects/terminal/task-session.ts`（只增加 `export`） | 导出 `locked`。 | 1 |
| 测试 | `tests/herdr-pane-reap.test.ts`（新） | 每个 phase 的测试集合（§7.0）。现有 `tests/herdr-task-lifecycle.test.ts` 测试另一个生命周期，并且有已知不稳定项，所以不扩展它。 | 1、2 |

新文件的理由：策略文件让每条安全规则不依赖 herdr 就能测试。关闭效果放在单独的文件，是为了让 Phase 1 的发布物不包含任何关闭代码（r2 P1-2）。效果文件和 task-session 分开，因为所有权模型不同（§3 (d)）。没有新依赖。

### 4.2 CLI

所有子命令都需要 `--session <name>`。可选 `--config-path` 和 `--home`，组成现有的 `HerdrEndpoint`（`herdr.ts:6`）。所有输出都是一行 JSON。

```text
repo-harness herdr spawn    --session <s> --workspace <wid> --cwd <worktree> --task <id>
                            --kind claude|codex  (--new-tab --label <text> | --tab <tab_id>)
                            [-- <agent args>]
  → {"spawn_id","pane_id","tab_id","agent_name","repo":"owner/name"}

repo-harness herdr result   --session <s> --spawn <id> (--pr <n> [--pr <n> …] | --no-pr --reason <text>)
  → {"spawn_id","result":<k>,"head_sha","head_ref","inventory_scope","prs":[{"number","head_sha","state"}],
     "pr_obligations":[{"number","state","declared_in":[<k>…]}]}

repo-harness herdr accept   --session <s> --spawn <id> --result <k> --reason <text>
repo-harness herdr obsolete --session <s> --spawn <id> --result <k> --reason <text>

repo-harness herdr reap     --session <s>                                          # dry-run
repo-harness herdr reap     --session <s> --apply --spawn <id> --confirm <token>   # Phase 2 only
  → {"mode","at","results":[{"spawn_id","pane_id","tab_id","task","result",
      "decision":"keep|would_close|closed|cleanup_pending|lost|incomplete_spawn",
      "reasons":[…],"unprovable":[…],"token","prs":[…]}]}
```

- `spawn` 不发送简报。Bot 继续用 `herdr agent prompt <agent_name> "<text>"` 发送简报。
- `result` 和 `accept` 在 agent 是 `working`、`blocked` 或 `unknown`，或者 `agent_session` 为空时拒绝（`agent_busy`、`activity_unproven`）。Codex 在第一次 prompt 之前是 `unknown` 并且没有 session（H13），所以 Bot 必须在发送简报之后才能声明结果。
- `obsolete --result k` 只写一个绑定已有结果版本 k 的 `obsolete` mark。它不创建新的结果版本，也不改变 k 的 PR 集合和 inventory 身份（r3 P0-1）。spawn 还没有结果版本时，`obsolete` 失败（`no_result`）。Bot 必须先用 `result` 声明，并通过正常的 PR inventory 检查。所以没有隐式的「无 PR」授权路径。
- `accept --result k` 和 `obsolete --result k` 只在 k 是最新的结果版本时成功（`result_superseded`）。如果 k 之后有新活动，Bot 必须先声明新的结果版本（S8）。
- `result` 的输出包含 `pr_obligations`（§4.5），所以 Bot 能看到哪些旧 PR 仍会阻止关闭。
- `reap` 不带 `--apply` 时，不改变 herdr 状态，也不写 ledger。它只在日志中追加一行。
- Phase 1 中 `--apply` 返回 `reap_apply_disabled`（§8）。
- 退出码：0 表示正常完成（包括 keep）；1 表示有 `cleanup_pending` 或错误；2 表示锁被占用（`busy`）。

### 4.3 流程

```text
Bot ── spawn ──────────▶ repo-harness herdr spawn            (锁内)
                           ├─ resolve repo: gh repo view --json nameWithOwner,url (cwd = 已校验的 worktree)
                           ├─ write intent.json                                 (变更之前)
                           ├─ new tab:  herdr tab create --workspace --cwd --label --no-focus
                           │            → write tab-created.json + pane-created.json (同一个响应)
                           │  or --tab: tab owned + label 未变 + pane layout check (S14)
                           │            herdr pane split --pane <rect 最右的 pane> --direction right --cwd --no-focus
                           │            → write pane-created.json → 重新读 layout，违规时报告 layout_violated
                           ├─ write launch-intent.json
                           ├─ herdr agent start rh-<id> --kind <k> --pane <p> --timeout 60000 -- <args>
                           │     (外层 herdrCommand 超时 65000，模式同 task-session.ts:455-456；实测 3-4 s ready)
                           └─ bind provider (S4) → write binding.json    (codex: agent_session_id = null)
Bot ── herdr agent prompt rh-<id> "Read brief …"                     (传输方式不变)
agent done ── notify 插件 ── webhook ──▶ Bot                           (不变)
Bot ── result --pr N | --no-pr ─▶ result-k.json  (PR 集合、head SHA、HEAD、upstream、inventory、活动快照)
Bot ── accept --result k | obsolete --result k ─▶ mark-m.json
Bot routine ── reap   (dry-run，在 done webhook 后和每小时)
   for each spawn dir in ledger (从不枚举 herdr pane):
     intent 没有 binding → incomplete_spawn（只报告）
     observe: pane get, agent get, process-info, pane layout, tab/workspace pane list,
              ps 进程树, git status, git ls-remote, gh --repo
     decide(): identity → provider → result/acceptance → PR loop → activity → settle
               → git → tab/workspace → 进程树
     → report would_close + token + unprovable[]
Aimpact 确认 token ── Bot ── reap --apply --spawn <id> --confirm <token>      (Phase 2)
     锁内：检查有效期 → 重新观察 → decide() → digest 相同？
       → write close-intent-<c>.json  (token、digest、result、mark、PR 集合)
       → herdr pane close <pane_id>          (下一个 herdr 调用，中间没有等待)
       → readback: pane 不存在；tab 是否被自动关闭（只读，写入回执）
       → provider 仍活着？ 只向已证明的进程组发 SIGTERM/SIGKILL (S18；V8 表明正常情况下不需要)
       → write closed.json
```

### 4.4 锁和时间

- 每个 herdr server 一个 ledger 锁（`acquireExclusiveDirectoryLock`，经过 `locked`）。`spawn`、`result`、`accept`、`obsolete` 和 `reap --apply` 都要拿锁。dry-run 不拿锁。
- 这把锁只协调 repo-harness 的命令。它不能阻止用户或其他程序操作 herdr，也不能保证全局的 pane 上限（S14）。
- 超时：每个 herdr 读取 10 秒（现有默认值）；`agent start` 内层 60 秒，外层 65 秒；每个 `gh`、`git ls-remote` 和 `ps` 调用 20 秒。
- `spawn` 持有锁的时间估计最多约 120 秒。这是估计，不是保证。
- `reap --apply` 对每个 spawn 有一个总期限：90 秒。超过期限时，如果还没有写 close-intent，就 keep（`deadline_exceeded`）；如果已经写了，返回 `cleanup_pending`。
- 其他命令等锁最多 10 秒，然后返回 `busy`。锁的持有者崩溃时，`reclaimStaleOwner: true` 回收锁（同 `task-session.ts:365`）。

### 4.5 Bot 的登记义务和 PR inventory（r1 P1-2、r2 P1-2）

| 时间 | Bot 必须做 |
|------|------------|
| 任务开始 | 用 `spawn` 创建 pane。不再用原始 `tab create`、`pane split` 或 `send-text` 创建简报 pane。 |
| 发送简报之后、PR 创建后、每轮 review 或 fix 之后 | 用 `result` 声明当前结果版本。声明包含这个结果涉及的全部 PR：fix pane 是它推送的 PR；review pane 是它审查的 PR。 |
| 新的 review loop 开始 | 新 loop 的 pane 用自己的 spawn。旧 pane 中的新活动让旧声明不能再匹配（S8）。 |
| 结果没有 PR | 用 `result --no-pr --reason` 声明，然后必须用 `accept --result k` 明确接受。只有声明不会让 pane 可以关闭（S6）。如果这个 spawn 以前声明过仍 OPEN 的 PR，`--no-pr` 不解除它（见下面的 PR 义务集合）。 |
| 放弃一个 spawn | 用 `obsolete --result k` 绑定最新的结果版本。没有结果版本时，先用 `result` 声明。 |

**head ref 的来源：** `result` 读取 `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`，得到 `<remote>/<branch>`。branch 是 upstream 的分支名，不是本地分支名。head repository 是这个 remote 的 URL 对应的 `owner/name`（`gh repo view <url> --json nameWithOwner`）。

**inventory 查询：**

```text
gh pr list --repo <spawn repo> --head <upstream branch> --state open --limit 100
           --json number,headRefName,headRepository,headRepositoryOwner,baseRefName
```

- `gh pr list --head` 不支持 `owner:branch`，默认 `--limit` 是 30（`gh pr list --help`，observed）。所以 CLI 明确传 `--limit 100`，然后在本地按 head repository 过滤。
- 返回的行数等于 100 时，结果可能不完整：`result` 失败，reap keep（`pr_inventory_truncated`）。这个判断在按 head repository 过滤之前进行。
- 任何 `gh` 调用失败，或者两个查询中有一个失败：keep（`pr_state_unknown`）。
- 所有 `gh` 调用都带 `--repo <spawn repo>`。每个声明的 PR 的 base repository 必须等于 spawn repo（`pr_repo_mismatch`）。

**inventory 范围：**
- `inventory_scope: upstream_branch`：worktree 有 upstream。inventory 是这个 head ref 上的全部 open PR。`result` 时，声明必须包含全部 open PR（`pr_inventory_incomplete`）；reap 时重新查询，出现新的 open PR 就 keep（`pr_inventory_changed`）。
- `inventory_scope: declared_only`：worktree 没有 upstream，并用 `--pr` 声明至少一个 PR（例如 review pane 的 detached checkout）。inventory 只是本结果声明的 PR。报告中列出这个较弱的范围。这个范围依赖 Bot 完整登记，它不证明 repo 中没有其他相关 PR。
- `inventory_scope: none`：worktree 没有 upstream，并用 `--no-pr --reason` 声明本结果没有 PR。`head_ref: null`、`prs: []`、`open_pr_inventory: []`。有 upstream 时仍用 `upstream_branch`，`--no-pr` 不能跳过该分支的 inventory 检查。
- inventory scope 只说明本结果的查询范围。它不解除历史 PR 义务。无 upstream 的 `--no-pr` 可以成功声明；关闭仍独立检查 S6 的接受和 S7 的全部历史义务。

**PR 义务集合（r3 P0-1）：**
- 定义：这个 spawn 的全部 `result-*.json` 中声明过的 PR 的并集，加上这些结果版本中记录过的全部 `head_ref`。它从已有的结果文件推导，不是第二份权威 ledger。
- 一个 PR 只在 GitHub 的新鲜查询显示它是 `MERGED` 或 `CLOSED` 时离开义务集合。新的 `result`、`result --no-pr` 或 `obsolete` 都不能让它离开。从后来的声明中删除一个 PR，不是 loop 结束的证据。
- reap 对义务集合中的每个 PR 运行 `gh pr view <n> --repo <spawn repo>`，对每个记录过的 `upstream_branch` head ref 重新运行 inventory 查询。任何一个 PR 是 `OPEN`，或者任何一个 head ref 上出现 open PR，都 keep（S7）。
- 当前结果可以没有 PR，但 spawn 的历史义务仍单独检查。只有全部历史 PR 和 head ref 的检查都没有 OPEN PR 时，S7 才通过。接受当前无 PR 结果仍需要绑定该结果的 mark（S6）。

---

## 5. 安全规则

每条规则在 `decide()` 中执行，除非另有说明。任何检查失败或数据缺失，结果都是 `keep` 并给出原因。两个 `null` 相等不算证据。

| # | 规则 | 怎样执行 | 不满足时的原因码 |
|---|------|----------|------------------|
| S1 | 候选只来自 ledger。 | 只遍历 ledger 的 `spawns/*/`。有 `intent.json` 但没有 `binding.json` 的目录只报告为 `incomplete_spawn`，从不关闭（§6.4）。herdr 的 list 和 layout 只用于验证。 | `incomplete_spawn` |
| S2 | 记录必须有创建证据。 | `binding.ownership.disposition === 'created'`；`intent.json`、`pane-created.json` 和 `binding.json` 中的 intent_id、pane_id、terminal_id 一致（复用 `assertCreated`；模式同 `readTaskAgent` :502-512）。 | `ownership_unproven` |
| S3 | pane 身份不变。 | `pane get`：`pane_id` 存在；`workspace_id`、`tab_id`、`terminal_id` 等于记录值；shell 进程证明一致。`terminal_id` 变化是可靠的重启信号（H9），记录永久 keep。pane 不存在 → `lost`，不发出关闭命令。 | `pane_moved`、`identity_changed`、`pane_gone` |
| S4 | provider 身份和归属不变。 | provider 的定义：`pid === foreground_process_group_id`；父进程是记录的 shell；进程名等于 `--kind`（`claude` 或 `codex`）；进程证明一致（H14）。不按数组位置或「唯一元素」选 PID。`agent get rh-<id>` 的 pane、terminal 和 kind 等于记录值。agent name 在自动恢复后会保留（H11），所以 S4 只在 S3 通过之后才有意义。 | `occupant_changed`、`provider_not_foreground` |
| S5 | provider 已退出的 pane 总是保留。 | provider 不在了：keep，不生成 token，不接受确认。没有例外（r1 P1-6、r2 P1-6）。 | `provider_exited` |
| S6 | 有一个被明确接受的结果版本。 | 最新的 `result-k.json` 存在，并且满足一项：(1) 最新 mark 是 `accepted`，`result === k`；(2) 最新 mark 是 `obsolete`，`result === k`；(3) **`prs.length > 0`**，每个声明的 PR 都是 `MERGED`，`mergedAt` 不为空，`headRefOid` 等于声明的 head SHA。没有 PR 并且没有绑定 k 的 mark → `not_accepted`，不生成 token（r2 P0-1）。PR 是 `CLOSED` 但没有 merge → 需要 `obsolete --result k`。接受由 reap 推导，reap 不写 mark。接受只回答「结果是否被接受」。PR loop 是否结束由 S7 单独判断，任何接受依据都不能跳过 S7。 | `no_result`、`not_accepted`、`result_superseded`、`pr_head_mismatch`、`pr_closed_unmerged` |
| S7 | 没有 open 的 PR 循环。 | 检查 §4.5 的 PR 义务集合，不只检查最新的结果版本。义务集合中的任何 PR 是 `OPEN` → keep，即使有 `accepted` 或 `obsolete`，即使最新的结果版本是 `--no-pr` 或省略了这个 PR（r3 P0-1）。任何记录过的 head ref 上的 inventory 重新查询发现 open PR，或者结果被截断 → keep。 | `pr_open`、`pr_inventory_changed`、`pr_inventory_truncated`、`pr_repo_mismatch`、`pr_state_unknown` |
| S8 | 声明之后没有可观察的活动。 | 当前的 `state_change_seq`、`completion_seq`、`agent_session_id`、`terminal_id`、`tab_id` 和 provider PID 等于声明的快照，并且都不为空；Phase 3 另外要求 `input_seq` 不为空并且等于声明的值（r3 P2-1；0.9.3 上这个字段是 null，所以只用于 Phase 3 的自动 apply，见 §4.0.2）；`agent_status` 是 `idle` 或 `done`（focus 会把 `done` 变为 `idle`，H16）；`completion_seq === state_change_seq`。不比较快照中的 `agent_status`。 | `activity_after_result`、`agent_busy`、`activity_unproven` |
| S8a | 永久不匹配和临时否决（r2 P2-1）。 | seq 在一个 server 生命周期内单调。跨重启时 seq 可以重置并偶然相等（H11、H12），但 `terminal_id` 一定变化（H9），S3 让记录永久 keep。所以 S8 的不匹配是永久的：旧声明不会因为重新推导而恢复有效，需要新的 `result`。`focused === true` 是**临时**否决：pane 失去 focus 后，同一个声明可以再次有效。 | `pane_focused`（临时） |
| S9 | settle 窗口已过。 | `now − anchor ≥ 300 s`。anchor：S6 (1) 和 (2) 用 `max(result.at, mark.at)`；S6 (3) 用 `max(result.at, 所有 PR 的 mergedAt)`。三个时间都已持久化或来自 GitHub，所以 dry-run 也能计算。测试注入 `now`。 | `settle_pending` |
| S10 | 没有未提交或未推送的工作。 | (a) 对 spawn 的 cwd：`git status --porcelain=v1 --untracked-files=all` 为空（覆盖 tracked、staged 和 untracked）；(b) 当前 `foreground_cwd` 的 git 顶层目录等于 spawn cwd 的顶层目录，否则 keep；(c) 当前 HEAD 等于声明的 `head_sha`；(d) 新鲜的远端证据：`git ls-remote <remote> refs/heads/<upstream branch>` 返回的 SHA 等于 `head_sha`，或者 `git ls-remote <spawn repo url> refs/pull/<n>/head` 对某个声明的 PR 返回 `head_sha`。不使用本地 `refs/remotes`。路径不存在、git 出错或远端查询失败 → keep。 | `worktree_dirty`、`foreground_cwd_outside_worktree`、`head_moved`、`unpushed_or_unknown`、`git_state_unknown` |
| S11 | 不删除用户的 tab。 | 在 `pane close` **之前**：如果 pane 是它所在 tab 中唯一的 pane，tab 必须有 `tab-created.json`，并且 `tab_id` 和当前 label 等于记录值；否则 keep。reap 从不调用 `tab close`。herdr 在最后一个 pane 关闭时自动关闭 tab（H7）。 | `last_pane_in_unowned_tab`、`tab_relabelled` |
| S12 | 不删除任何 workspace。 | 在 `pane close` 之前：`pane list --workspace <wid>` 中这个 workspace 至少还有另一个 pane。否则 keep。这条规则对 Bot 创建的 tab 也适用，因为 `spawn` 从不创建 workspace，所以每个 workspace 都属于用户（H8）。 | `last_pane_in_workspace` |
| S13 | 没有 provider 以外的进程。 | 用 `ps -A -o pid=,ppid=,pgid=` 列出记录的 shell 的全部后代进程。除了 shell 本身，每个后代进程的 PGID 都必须等于 provider 的 PGID。否则 keep。原因：`pane close` 会结束 shell 的后台任务和 provider 的其他进程组（H17）。 | `extra_processes` |
| S14 | 布局规则（在 `spawn` 中）。 | `--tab` 必须是 ledger 中有创建证据的 tab，并且 label 没有变化。`pane layout`：pane 数小于 3；所有 `splits[].direction` 都是 `right`；`zoomed === false`。分割目标是 `rect.x + rect.width` 最大的 pane。分割后重新读 layout。并发操作违反规则时报告 `layout_violated`，不自动修复。 | `tab_not_owned`、`tab_full`、`layout_unsupported`、`layout_violated` |
| S15 | 默认 dry-run。 | 没有 `--apply` 时，代码路径不调用 herdr 变更命令，也不写 ledger，只追加日志。Phase 1 的发布物不包含关闭代码。 | `reap_apply_disabled`（Phase 1） |
| S16 | apply 需要有效的确认，并在锁内重新检查。 | `--apply` 需要 `--spawn` 和 `--confirm`。检查 token 的有效期；锁内重新运行 S1-S14，用 token 的 `issued_at` 重新计算 digest，必须相等；token 没有被其他 close-intent 使用（§4.0.1）。写 close-intent，然后立即 `pane close`。 | `confirmation_required`、`confirmation_expired`、`confirmation_stale`、`confirmation_used` |
| S17 | 恢复 close-intent 时不信任旧授权。 | pane 仍存在：同一个 token 必须仍有效，并且重新检查 S1-S14 后 digest 相同（包括新的 PR、result、mark 和活动）。pane 已不存在：只进入进程清理（S18）。 | `authorization_changed`、`confirmation_expired` |
| S18 | 只向已证明的进程发信号。 | pane 关闭后，如果记录的 provider 仍活着：进程证明一致，并且 PGID 等于 provider PID，才向这个进程组发 SIGTERM，5 秒后发 SIGKILL。V8 表明正常情况下不需要这一步。 | `process_identity_lost`、`foreign_process_group` |
| S19 | 不删除。 | 效果模块中没有 `worktree remove`、`branch -d/-D`、`workspace close` 或 `tab close`。静态源码测试检查。 | — |
| S20 | task-agent pane 不在范围内。 | ledger 位置不同。`spawn` 只创建新 pane，从不认领现有 pane。 | — |

### 5.1 竞态

| 情况 | 处理 |
|------|------|
| 旧 PR merged，然后 pane 被复用，然后第一次 reap | 复用改变活动快照 → S8 keep。旧声明不能再授权。 |
| 声明 PR，然后复用，然后 merge，然后第一次 reap | 同上。merge 不重新拍快照。 |
| 只声明 `--no-pr`，没有 accept | S6 `not_accepted`，没有 token。 |
| 声明 OPEN PR，然后 `obsolete`、`result --no-pr`，或者新结果省略这个 PR | PR 仍在义务集合中 → S7 `pr_open`，没有 token。 |
| 用户在 Bot pane 中提交输入 | 如果提交改变了 lifecycle 计数器，S8 keep。提交不一定开始 turn（H5）。没有改变计数器的提交属于 `input_unobservable`。 |
| 用户输入但没有提交，或在 shell 中输入 | 0.9.3 看不到（H15）。列为 `input_unobservable`。按 §9 D-1 B 逐个确认 token。 |
| 最后一次检查后用户 focus、输入、move pane、重命名 tab 或新建 pane | 0.9.3 不能阻止（H1、H2）。列为 `non_atomic_close`。按 §9 D-1 B 逐个确认 token。Phase 3 由 §4.0.2 的条件关闭处理。 |
| 用户在 Bot pane 的 shell 中启动后台任务 | S13 keep。 |
| pane 被移到另一个 tab 或 workspace | S3：`pane_moved` 或 `pane_gone`。 |
| herdr 重启，自动恢复 agent（Max 的默认设置） | `terminal_id` 变化（H9）→ S3 永久 keep。恢复的 agent 没有原来的参数（H11）。所有未关闭的记录都变为 `identity_changed`（§9 Q1）。 |
| 两个 repo-harness 命令同时运行 | ledger 锁。第二个返回 `busy`。 |
| `pane close` 的响应丢失 | 保留 close-intent，返回 `cleanup_pending`。下次读回：pane 不存在 → S18；pane 存在 → S17。 |

---

## 6. 数据模型和所有权绑定

### 6.1 存储位置

```text
$REPO_HARNESS_HOME/herdr/<sha256(realpath(socket))>/       # 默认 ~/.repo-harness，0700
  endpoint.json                 # { session, configPath?, home?, socket }
  caller.lock/                  # acquireExclusiveDirectoryLock
  reap-log.jsonl                # 只追加，0600
  spawns/<spawn_id>/            # 0700；每个文件 0600，写一次（link + fsync）
    intent.json
    tab-created.json            # 只在 --new-tab 时存在
    pane-created.json
    launch-intent.json
    launch-unknown.json         # agent start 结果不明确
    binding.json
    result-<k>.json
    mark-<m>.json
    close-intent-<c>.json
    closed.json | lost.json
```

- ledger key 是 herdr socket 路径的 realpath 的哈希。路径由现有的 `validateHerdrEndpoint`（`herdr.ts:45-62`）计算。`realpath` 由新的效果模块完成，现有函数不做这一步。所以同一个 server 的不同写法使用同一个 ledger 和同一把锁。
- 为什么放在主机级目录：pane、tab 和 terminal ID 的作用域是一个 herdr server（H3）；Bot 的 pane 会在没有采用 harness 的仓库中运行；先例是 MCP coding workspace 的状态（`coding-workspaces.ts:110-117`）。目录名用哈希的做法类似 `workspaceDirectory`（`task-session.ts:241-244`），但那里的哈希输入是 repository_id 和 execution_root，不涉及 endpoint。
- 所有文件只写一次。状态变化用新文件表示。

### 6.2 schema

```ts
interface SpawnIntent {
  protocol: 1; spawn_id: string; intent_id: string; endpoint: HerdrEndpoint; socket: string;
  task: string; kind: 'claude' | 'codex'; args: string[];
  cwd: string;                 // realpath of the worktree
  repository_id: string;       // git common dir, from taskRepository(cwd)
  repo: string; repo_url: string;   // owner/name and url, from gh repo view in cwd
  workspace_id: string;
  tab: { mode: 'new'; label: string } | { mode: 'existing'; tab_id: string; owner_spawn_id: string };
  agent_name: string;          // 'rh-' + 24 hex; matches [a-z][a-z0-9_-]{0,31}
  created_at: string;
}
interface TabCreated { intent_id: string; tab_id: string; workspace_id: string; label: string; root_pane_id: string }
interface PaneCreated { intent_id: string; pane_id: string; terminal_id: string; tab_id: string; workspace_id: string }
interface SpawnBinding {
  protocol: 1; spawn_id: string; intent_id: string; endpoint: HerdrEndpoint;
  task: string; kind: 'claude' | 'codex'; cwd: string; repository_id: string; repo: string;
  pane_id: string; terminal_id: string; tab_id: string; workspace_id: string;
  agent_name: string;
  agent_session_id: string | null;     // codex: null until first prompt (H13); result requires non-null
  shell: ProcessProof;                  // task-session.ts:11
  provider: OwnedProcess & { pgid: number };   // pid === pgid === foreground_process_group_id (H14)
  ownership: { disposition: 'created'; intent_id: string };
  tab_ownership: ObjectOwnership;       // created only with tab-created.json
  bound_at: string;
}
interface ActivitySnapshot {
  completion_seq: number; state_change_seq: number; agent_session_id: string;
  terminal_id: string; tab_id: string; provider_pid: number;
  input_seq: number | null;             // null on herdr 0.9.3; Phase 3 auto apply requires non-null
}
interface ResultVersion {
  k: number; at: string; reason: string | null;    // only the result command writes this file
  head_sha: string;
  head_ref: { remote: string; branch: string; repo: string } | null;   // null: no upstream
  inventory_scope: 'upstream_branch' | 'declared_only' | 'none';      // upstream wins; declared_only: no upstream, prs nonempty; none: no upstream, --no-pr
  prs: { number: number; head_sha: string; state: 'OPEN' | 'MERGED' | 'CLOSED' }[];
  open_pr_inventory: number[];
  snapshot: ActivitySnapshot;
}
interface Mark { m: number; kind: 'accepted' | 'obsolete'; result: number; reason: string; at: string }
interface ConfirmDigestInputV1 {
  schema: 'repo-harness.pane-reap.confirm.v1';
  issued_at: string;                    // valid for 900 s
  socket: string; spawn_id: string;
  pane: { pane_id: string; terminal_id: string; tab_id: string; workspace_id: string };
  tab: { label: string; pane_ids: string[]; owned: boolean };
  workspace_pane_count: number;
  provider: { pid: number; pgid: number; identity: string }; shell: ProcessProof;
  descendants_outside_provider_pgid: number;    // must be 0
  result: number;
  acceptance: { basis: 'accepted_mark' | 'obsolete_mark' | 'prs_merged'; mark: number | null;
                mark_at: string | null; merged_at: string[] };
  settle_anchor: string;
  activity: ActivitySnapshot;           // current observation; equals the declared snapshot
  prs: { number: number; state: string; head_ref_oid: string; merged_at: string | null }[];
  open_pr_inventory: number[]; inventory_scope: ResultVersion['inventory_scope'];
  pr_obligations: { number: number; state: 'MERGED' | 'CLOSED'; declared_in: number[] }[];  // all must be closed or merged
  obligation_head_refs: { remote: string; branch: string; repo: string; open_prs: number[] }[];  // open_prs must be []
  git: { head_sha: string; status_empty: true; published_ref: string; published_sha: string };
  unprovable: ('non_atomic_close' | 'input_unobservable')[];
}
interface CloseIntent { c: number; at: string; token: string; digest: string; result: number; mark: number | null; prs: ResultVersion['prs']; provider: SpawnBinding['provider'] }
interface Closed { at: string; pane: 'closed' | 'already_absent'; provider: 'ended_with_pane' | 'signalled'; tab: 'auto_closed' | 'kept' }
interface Lost { at: string; reason: 'pane_gone' }
```

### 6.3 生命周期状态

状态从文件推导，不单独存储（模式同 `taskAgentStatus`，`task-session.ts:773-794`）。

| 状态 | 条件 | 下一个状态 |
|------|------|------------|
| `incomplete_spawn` | 有 `intent.json`，没有 `binding.json` | 只报告；由人处理（§6.4） |
| `active` | 有 binding；没有结果版本，或者最新结果版本的快照不再匹配（S8，永久） | `declared` |
| `declared` | 最新 `result-k.json` 的快照等于当前活动；没有绑定 k 的 mark；不满足 S6 (3) | `accepted`；或者 `active` |
| `accepted` | S6 (1)、(2) 或 (3) 成立 | `closing`（只有 Phase 2 的确认后 apply）；或者 `active` |
| `closing` | 最新 close-intent 存在，没有 `closed.json`，pane 存在 | `closed`；或者 keep 并需要新确认（S17） |
| `closing_processes` | close-intent 存在，pane 不存在，provider 仍活着 | `closed`（S18） |
| `closed` | 有 `closed.json` | 终态 |
| `lost` | 有 `lost.json` | 终态。保留记录，不再操作 |

`provider_exited`（S5）和 `identity_changed`（S3）不是单独的状态。它们是 `active`、`declared` 或 `accepted` 记录上的永久 keep 原因。

### 6.4 创建过程的中断和恢复（r1 P1-5）

`spawn` 从不重放不明确的创建或启动。

| 中断位置 | 磁盘上的文件 | herdr 中可能的对象 | v1 处理 |
|----------|--------------|--------------------|---------|
| 写 intent 之后，`tab create` 或 `pane split` 之前或之中 | intent | 可能有一个新 tab 或 pane（响应丢失） | `incomplete_spawn` / `create_outcome_unknown`。只报告 cwd 和时间。由人查看 |
| 收到创建响应，写 `tab-created` 或 `pane-created` 之前 | intent | 有新对象 | 同上 |
| `pane-created` 之后，`agent start` 之前或之中 | intent、pane-created、launch-intent | 有 pane；可能有 agent | `incomplete_spawn` / `launch_unknown`。从不再次运行 `agent start` |
| `agent start` 成功，`binding.json` 之前 | 同上 | 有 pane 和 agent | `incomplete_spawn` / `bind_unknown`。不关闭 |
| binding 校验失败（例如 provider 不能证明） | 同上加 `launch-unknown.json` | 有 pane 和 agent | `incomplete_spawn` / `bind_failed`。返回错误给 Bot |

以后如果要自动清理这些状态，需要单独设计完整的所有权和 shell 证明路径。

### 6.5 herdr 重启（V2、V3、V4）

- 不变：`pane_id`、`tab_id`、tab label、`agent_session.value`（H10）。
- 变化：每个 pane 的 `terminal_id`（H9）。
- Max 使用默认的 `resume_agents_on_restore=true`（H11）：agent 被自动恢复，原来的参数丢失，provider PID 变化，agent name 保留，seq 可以重置到更小或相同的值。
- `resume_agents_on_restore=false`（测试 fixture）：agent 消失，pane 停在 shell（H12）。
- v1 行为：`terminal_id` 变化让 S3 永久 keep（`identity_changed`）。seq 相等从不单独证明「没有活动」。
- 后果：每次重启后，所有未关闭的记录都不能再被 reap 关闭。dry-run 报告列出它们，由人手动关闭（§9 Q1）。
- 测试必须覆盖两种 `resume_agents_on_restore` 设置。

### 6.6 日志和审计

- 每个决定在 `reap-log.jsonl` 中追加一行：`{at, mode, spawn_id, pane_id, tab_id, task, result, mark, decision, reasons, unprovable, token}`。不写屏幕内容、prompt、环境变量或 secret。
- ledger 记录每次接受和关闭的来源（mark 或 merged PR）、时间、结果版本、原因和确认用的 token。ledger 不证明是谁运行了命令。本机任何能运行 CLI 的进程都能写 mark。这和 herdr CLI 本身的信任边界相同。
- 日志轮换不是 apply 的前提。

---

## 7. 验收测试

### 7.0 测试环境和每个 phase 的测试集合（r2 P1-2）

测试环境：
- 策略测试：直接调用 `decide()`。每条规则用单独构造的观察数据测试，不依赖其他规则先失败。注入 `now`。
- 集成测试：真实的一次性 herdr session，名称为 `task-proof-<16 hex>`，临时 HOME 和临时 `REPO_HARNESS_HOME`（fixture 规则同 `tests/herdr-task-lifecycle.test.ts:11-14,47-60`）。重启相关测试同时运行 `resume_agents_on_restore=false` 和 `true`。
- Git：真实的临时 bare remote。`refs/pull/<n>/head` 在 bare remote 中直接创建。不用固定 JSON 代替 Git 发布证据。
- `gh`：PATH 中的 fixture 脚本返回固定的 `repo view`、`pr view` 和 `pr list` JSON，并记录 argv。它只用于 PR 状态。
- 时序：效果模块有一个内部 `boundary(phase)` seam（模式同 `TaskStartEffects.boundary`，`task-session.ts:417`）。它不是 CLI 输入。测试在 seam 处用同步屏障插入操作，不用固定 sleep。
- herdr argv 监控：一个包装 `herdr` 的脚本记录所有子命令。

| 集合 | 运行的 phase | 内容 |
|------|--------------|------|
| T1 | Phase 1 PR 和以后的每个 PR | 策略单元测试；`spawn`、`result`、`accept`、`obsolete` 的集成测试；dry-run 集成测试；静态扫描。例外：N52（`--apply` 返回 `reap_apply_disabled`）只在 Phase 1 的发布物上运行（r3 P2-2） |
| T2 | Phase 2 PR 和以后的每个 PR | 真实关闭、确认 token、close-intent 恢复和进程清理 |
| T3 | Phase 3 PR | §7.4 的上游能力测试。在 herdr 0.9.3 上不能通过，不在 v1 的 CI 中运行 |

Phase 1 的发布物不包含关闭代码，所以 T1 不需要任何确认绕过开关。

### 7.1 已完成的验证（Phase 0）

| # | 验证 | 结果 | 对设计的影响 |
|---|------|------|--------------|
| V1 | 关闭 tab 中最后一个 pane | tab 自动关闭；最后一个 tab 的最后一个 pane 关闭时 workspace 也被关闭（H7、H8） | S11 的检查都在关闭之前；reap 不调用 `tab close`；新增 S12 |
| V2 | 重启后 `terminal_id` | 全部变化（H9） | S3 把它作为重启信号 |
| V3 | 重启后 `pane_id`、`tab_id`、label、session | 不变（H10） | §6.5 |
| V4 | 重启后 seq | 重置；自动恢复丢失参数（H11、H12） | seq 相等不能单独证明没有活动；S8a；§9 Q1、Q8 |
| V5 | `agent start` 和 Bot 的参数 | 成功；Codex 在第一次 prompt 前没有 session（H13） | `spawn` 可以替代 `send-text`；binding 的 session 可以为空；`result` 在简报之后 |
| V6 | 带 MCP 的 Claude 和 Codex 的进程 | provider 是 PGID leader，父进程是 shell（H14） | S4 |
| V7 | 输入是否有信号 | 没有（H15）；只观察到输出侧信号，并且输出侧信号也不随输入变化 | V7 只是输出信号的观察，不能成为输入证据；`input_unobservable` 保留；Phase 3 需要上游 `input_seq`（§4.0.2） |
| V8 | `pane close` 的效果 | 结束全部进程，包括其他 PGID 的后台任务；Claude 会话可以恢复（H17、H18） | 关闭顺序（§4.0.1）；新增 S13；S18 只是后备 |

还需要验证（Phase 0 剩余）：

| # | 验证 | 影响 |
|---|------|------|
| V9 | Claude 的后台工具进程（例如后台 Bash）是否在 provider 的 PGID 中；`ps -A -o pid=,ppid=,pgid=` 在 macOS 和 Linux 上能否列出 shell 的全部后代 | S13。如果后台工具进程有自己的 PGID，S13 会 keep 这些 pane，方向安全 |
| V10 | `codex resume <id>` 能否继续被关闭的 Codex 会话 | 回滚说明（§8） |

### 7.2 T1：Phase 1 测试

**正向**

| # | 场景 | 期望 |
|---|------|------|
| A1 | `spawn --new-tab --kind claude` 和 `--kind codex` | tab-created、pane-created、binding 都写入；Claude binding 有 session；Codex binding 的 session 为 null |
| A2 | `spawn --tab <owned tab>`，tab 中已有 2 个并排 pane | 新 pane 在 rect 最右边；layout 读回通过 |
| A3 | 推送到临时 remote，`result --pr 7`，PR fixture 变为 `MERGED`（`headRefOid` 等于声明的 head），301 秒后 dry-run | `would_close`，有 token，没有 ledger 写入 |
| A4 | `result --no-pr`，`accept --result 1`，301 秒后 dry-run | `would_close`，有 token |
| A5 | 用户的 tab 有 2 个 pane，Bot tab 有 1 个 Bot pane，workspace 中还有其他 pane | `would_close`；报告中 tab 的预期是 `auto_closed` |

**负向**

| # | 规则 / 来源 | 场景 | 期望 |
|---|-------------|------|------|
| N1 | S1 | 同一 tab 中有用户的 idle claude pane，不在 ledger 中 | 从不出现在结果中 |
| N2 | S1 / r1 P1-5 | 在 §6.4 的每个边界中断；包括创建响应丢失 | `incomplete_spawn`；argv 中没有第二次 `tab create`、`pane split` 或 `agent start` |
| N3 | S2 | 手工写 `binding.json`，intent_id 不一致 | `ownership_unproven` |
| N4 | S3 | pane 移到同一 workspace 的另一个 tab | `pane_moved` |
| N5 | S3 / V2、V4 | 重启一次性 server，分别使用两种 `resume_agents_on_restore`；在 `true` 时构造重启后 seq 等于快照的情况 | `identity_changed`；seq 相等不改变结果 |
| N6 | S3 | 用户关闭 pane | `lost` |
| N7 | S4 / V6 | 真实 Claude 带 MCP（多个前台进程） | binding 成功；provider 是 PGID leader |
| N8 | S4 | provider 被放到后台（另一个进程组成为前台） | `provider_not_foreground` |
| N9 | S4 | `agent start` 超时；启动成功但 binding 失败 | `incomplete_spawn`；没有重试 |
| N10 | S5 / r2 P1-6 | provider 在声明前退出；在声明后退出 | `provider_exited`；没有 token |
| N11 | S6 | 没有声明 | `no_result` |
| N12 | S6 / r2 P0-1 | 干净并已发布的 worktree，`result --no-pr`，不写 mark，推进 301 秒以上 | `not_accepted`，没有 token；然后 `accept --result 1` 之后才进入 settle |
| N13 | S6 / r1 P0-2 | PR merged → pane 被复用 → 第一次 reap | `activity_after_result` |
| N14 | S6 / r1 P0-2 | 声明 PR → 复用 → merge → 第一次 reap | 同上 |
| N15 | S6 | merged PR 的 `headRefOid` 不等于声明的 head | `pr_head_mismatch` |
| N16 | S6 | 最新声明是 2，`accept --result 1`；mark 1 指向 result 1，之后有 result 2 | `accept` 失败（`result_superseded`）；mark 1 不接受 result 2 |
| N17 | S6 | PR `CLOSED`，`mergedAt` 为 null | `pr_closed_unmerged`；`obsolete --result k` 之后可以成为候选 |
| N18 | S7 | 有 accept，声明的 PR 是 `OPEN` | `pr_open` |
| N19 | S7 | 声明遗漏一个 open PR | `result` 失败：`pr_inventory_incomplete` |
| N20 | S7 | 声明后在同一 head ref 上开了新 PR | `pr_inventory_changed` |
| N21 | S7 | 另一个 repo 有同号 PR；base repo 不同 | `pr_repo_mismatch` |
| N22 | S7 | 重复 `--pr 7 --pr 7` | `result` 失败 |
| N23 | S7 | 两个 `gh` 查询中一个失败 | `pr_state_unknown` |
| N24 | S7 / r2 P1-2 | head ref 上有 31 个 open PR（超过 gh 默认的 30） | inventory 完整（31 个）；argv 中有 `--limit 100` |
| N25 | S7 / r2 P1-2 | fixture 返回 100 行 | `pr_inventory_truncated` |
| N26 | S7 / r2 P1-2 | 本地分支名和 upstream 分支名不同 | 查询使用 upstream 分支名 |
| N27 | S7 / r2 P1-2 | review pane：detached checkout，没有 upstream，声明它审查的 PR | `inventory_scope: declared_only`；报告列出这个范围 |
| N28 | S8 | 声明后提交一个 prompt | `activity_after_result` |
| N29 | S8 / r1 P1-6 | `agent_status` 是 `unknown`；session 为空；`completion_seq` 为空 | `result` 失败；reap keep（`activity_unproven`） |
| N30 | S8a / r2 P2-1 | 声明后 pane 获得 focus；然后失去 focus | 先 `pane_focused`，后 `would_close`（同一个声明） |
| N31 | S8 / V7 | focus 一个 `done` 的 agent（变为 `idle`） | 不影响 S8 |
| N32 | S8 / r2 P1-7 | 声明之后、最后一次观察之前，在 Claude pane 中输入草稿，不提交 | 0.9.3 看不到：`would_close` 的 `unprovable` 必须包含 `input_unobservable`，token 的 digest 也包含它。这个测试检查报告诚实，不把数据丢失当作通过条件 |
| N33 | S9 | 声明后 299 秒 | `settle_pending` |
| N34 | S9 | 声明后很久才 merge | anchor 等于 `mergedAt` |
| N35 | S10 | untracked 文件；tracked 修改；只 staged 的修改 | `worktree_dirty` |
| N36 | S10 | 有一个本地提交没有推送 | `head_moved` 或 `unpushed_or_unknown` |
| N37 | S10 | 远端分支已删除，本地 `refs/remotes` 没有更新，没有 `refs/pull` | `unpushed_or_unknown` |
| N38 | S10 | 远端分支被回退 | `unpushed_or_unknown` |
| N39 | S10 | squash merge 后远端分支被删除；`refs/pull/7/head` 等于 head | 通过 S10 |
| N40 | S10 | agent `cd` 到另一个 checkout | `foreground_cwd_outside_worktree` |
| N41 | S10 | cwd 不存在；`git ls-remote` 超时 | `git_state_unknown` |
| N42 | S11 | 策略测试：唯一的 pane，tab 没有 `tab-created.json`，tab_id 没有变化 | `last_pane_in_unowned_tab` |
| N43 | S11 | 用户重命名 Bot 的 tab，Bot pane 是最后一个 | `tab_relabelled` |
| N44 | S12 / V1 | Bot 的 tab 是 workspace 中唯一的 tab，Bot pane 是唯一的 pane | `last_pane_in_workspace`；没有 token |
| N45 | S13 / V8 | 用户在 Bot pane 的 shell 中运行 `sleep 600 &`，然后 agent 完成 | `extra_processes` |
| N46 | S13 / V9 | provider 的子进程有自己的 PGID | `extra_processes` |
| N47 | S14 | `--tab <用户 tab>` | `tab_not_owned`；没有 `pane split` |
| N48 | S14 | Bot tab 中已有纵向分割；已 zoom | `layout_unsupported` |
| N49 | S14 | `pane list` 顺序和 rect 顺序不同 | 分割目标仍是 rect 最右的 pane |
| N50 | S14 | 计数之后、分割之前，用户并发分割（屏障） | `layout_violated` |
| N51 | S15 | 所有条件满足，运行 dry-run | argv 只有只读子命令；ledger 没有变化；日志多一行 |
| N52 | S15 | **只在 Phase 1 的发布物上运行。** Phase 1 的 CLI 运行 `reap --apply --spawn <id> --confirm <token>` | `reap_apply_disabled`；argv 只有只读子命令。Phase 2 及以后不运行 N52；当前 CLI 的 apply 行为由 B1-B18 检查。不为通过 N52 增加任何生产确认绕过开关 |
| N53 | S19 | 静态扫描新的效果文件 | 没有 `worktree remove`、`branch -d`、`branch -D`、`workspace close`、`tab close` |
| N54 | S20 | 同一 session 中有真实的 task-agent sentinel pane | 不出现在结果中；仍在运行 |
| N55 | 锁 | 锁的持有者被 SIGKILL；另一个命令运行 | 回收锁，正常运行 |
| N56 | S7 / r3 P0-1 | review pane 在 main checkout 中（upstream 是 `origin/main`，工作区干净，HEAD 已发布，workspace 中还有其他 pane）。result 1 声明 feature 分支的 PR 7，PR 7 是 `OPEN`。然后 `obsolete --result 1`，推进 301 秒以上 | `pr_open`；没有 token；result 1 的 PR 集合没有变化；没有新的 `result-*.json` |
| N57 | S7 / r3 P0-1 | 与 N56 相同，但第二步改为 `result --no-pr` 再 `accept --result 2`；另一个变体是 result 2 声明 PR 8 并省略 PR 7 | `pr_open`（PR 7 仍在义务集合中）；`result` 的输出在 `pr_obligations` 中列出 PR 7 |
| N58 | S7 / r3 P0-1 | detached review checkout，没有 upstream。result 1 用 `--pr 7` 声明 OPEN PR，scope 是 `declared_only`。然后分别运行 `obsolete --result 1`、`result --no-pr --reason <text>` + `accept --result 2`、用 `--pr 8` 声明新结果并省略 PR 7 | `--no-pr` 声明成功，result 2 的 scope 是 `none`，`head_ref: null`、`prs: []`、`open_pr_inventory: []`。三种情况的 reap 都因历史 PR 7 返回 `pr_open`，没有 token；输出仍列出 PR 7 的义务 |
| N59 | S6、S7 / r3 P0-1 | N56 和 N58 的状态之后，PR 7 变为 `MERGED`，或者变为 `CLOSED`；Bot 对最新结果运行 `accept --result k`（或者 `obsolete --result k`）；推进 301 秒以上 | `would_close`，有 token；digest 的 `pr_obligations` 中 PR 7 的状态是 `MERGED` 或 `CLOSED` |
| N60 | §4.2 / r3 P0-1 | 没有任何结果版本时运行 `obsolete` | `obsolete` 失败（`no_result`）；没有 mark |

### 7.3 T2：Phase 2 测试

| # | 规则 / 来源 | 场景 | 期望 |
|---|-------------|------|------|
| B1 | 正向 | A4 之后，用 token `--apply` | pane 关闭；Bot tab 自动关闭（`closed.json` 的 `tab: auto_closed`）；provider 和 shell 不存在 |
| B2 | 正向 | 一个 tab 中有 2 个 Bot pane，关闭其中一个 | 只关闭这个 pane；`tab: kept` |
| B3 | S17 | 写 close-intent 后中断，在有效期内用同一个 token 恢复 | 完成关闭 |
| B4 | S17 / S18 | `pane close` 的响应丢失，pane 实际已关闭 | `cleanup_pending`；下次 apply 不需要确认，写 `closed.json` |
| B5 | S1 | N1 的用户 pane | argv 中没有针对它的命令 |
| B6 | S11 | 用户在 Bot 的 tab 中有自己的 pane；Bot pane 被关闭 | 用户 pane 和 tab 都在 |
| B7 | S11、S12 | 对 N43、N44 的状态运行 apply（使用它们变化之前的 token） | `confirmation_stale`；没有 `pane close`；tab 和 workspace 都在 |
| B8 | S13 | 对 N45 的状态运行 apply | 没有 `pane close`；后台任务仍在运行 |
| B9 | S5 | provider 退出后，用退出前的 token 运行 apply | keep；没有 `pane close` |
| B10 | S16 / r2 P1-1 | 没有 `--confirm` | `confirmation_required` |
| B11 | S16 / r2 P1-1 | dry-run 之后写新 mark、新 result，或开新 PR | `confirmation_stale` |
| B12 | S16 / r2 P1-1 | `issued_at` 早于 900 秒 | `confirmation_expired` |
| B13 | S16 / r2 P1-1 | 一个 token 已经开始一次关闭，再用它开始另一次关闭 | `confirmation_used` |
| B14 | S17 / r2 P1-1 | close-intent 之后中断，超过有效期，pane 仍存在 | keep；需要新的 dry-run 和确认 |
| B15 | S16 / r1 P0-1 | 屏障：最后一次观察之后、锁内重新检查之前，插入提交的 prompt、focus 或新 pane | 锁内重新检查 keep |
| B16 | S17 / r1 P0-3 | close-intent 之后中断；分别加入 open PR、新 result、新 mark、新 prompt；然后恢复 | 每种情况都 keep |
| B17 | S18 | 记录的 provider PID 被复用；PGID 不等于 provider PID | 不发信号 |
| B18 | 删除边界 | B1 之后 | worktree 目录和分支仍然存在 |

### 7.4 T3：上游能力的验收测试（Phase 3 的入口）

这些测试在 0.9.3 上不能通过。它们是 §4.0.2 能力的验收条件。

| # | 插入点 | 插入的操作 | 期望 |
|---|--------|------------|------|
| U1a | 最后一次观察之前：声明之后、settle 期间、dry-run 之前 | 原始按键、粘贴、shell 草稿、没有开始 turn 的 stalled prompt、没有回显的按键 | 策略在观察中发现 `input_seq` 不等于声明值，keep（`activity_after_result`）；不发出条件关闭；pane 和输入保留（r3 P2-1） |
| U1b | 最后一次观察之后、条件关闭到达 server 之前 | 同 U1a | herdr 返回 `precondition_failed`；pane 和输入保留 |
| U2 | 最后一次观察之后 | focus | 同上 |
| U3 | 最后一次观察之后 | provider 被替换 | 同上 |
| U4 | 最后一次观察之后 | 把 pane 移到同一 workspace 的用户 tab | 同上 |
| U5 | 最后一次观察之后 | 重命名最后一个 pane 所在的 Bot tab | 同上；tab 保留 |
| U6 | 最后一次观察之后 | 关闭同一 tab 中的另一个 pane（这个 pane 变成最后一个），请求用 `tab_close: forbid` | 同上 |
| U7 | 最后一次观察之后 | 关闭 workspace 中的其他 pane（这个 pane 变成 workspace 的最后一个） | 同上；workspace 保留 |
| U8 | — | Phase 3 之前声明的记录（`input_seq` 为 null） | 自动 apply keep（`input_seq_missing`） |

---

## 8. 推出计划

当前只有设计。D-1 B、D-2 和 Q1-Q9 已锁定（§9）。V9、V10 仍未验证。合并本 plan 不授权 Phase 1-3 实现。每个实现阶段开始前仍需 Aimpact 明确 GO。

| 阶段 | 内容 | 测试集合 | 进入下一阶段的条件 |
|------|------|----------|--------------------|
| Phase 0：验证 | V1-V8 已完成（§7.1）。运行 V9、V10。 | — | V9 有观察结果；D-1 B 和 D-2 已锁定；Aimpact 明确 GO 才能开始 Phase 1 |
| Phase 1：只有 dry-run | 合入策略、ledger、观察和 CLI。不包含 `pane-reap-apply.ts`。`--apply` 返回 `reap_apply_disabled`。Bot 改为用 `spawn` 创建简报 pane，并按 §4.5 声明结果。Bot 核对结果后用 `accept` 明确接受。merged PR 的接受由 dry-run 推导（S6 (3)、S9），不写 mark。 | T1 | T1 全部通过；Aimpact 抽查 dry-run 报告；D-1 B 已锁定；Aimpact 明确 GO 才能开始 Phase 2 |
| Phase 2：确认后 apply | 合入 `pane-reap-apply.ts`。每个关闭都需要 Aimpact 在当前消息中确认对应的 token。 | T1 + T2 | — |
| Phase 3：自动 apply | 只在 §4.0.2 的上游能力可用后。实现条件关闭调用和 `input_seq` 声明。Aimpact 明确启用。关闭次数不作为启用条件。 | T1 + T2 + T3 | — |

文档：在新版本的 `docs/CHANGELOG.md` 条目中记录新增能力。不修改 0.20.0 的历史条目。在 `docs/reference-configs/external-tooling.md` 的 Herdr Dispatch 部分加入 §4.5 的登记义务。

回滚：
- 任何阶段：Bot 停止调用 `--apply`。dry-run 没有副作用。
- 代码：`git revert <squash-commit>`。ledger 留在 `REPO_HARNESS_HOME` 中，不影响其他功能。
- 已关闭的 pane 不能恢复。Claude 会话可以用 `claude --resume <id>` 继续（H18）。Codex 会话文件保持完整，`codex resume` 是否能继续还没有测试（V10）。

---

## 9. 已锁定的决定

来源：[PR #563 body](https://github.com/Ancienttwo/repo-harness/pull/563)，2026-10-06 HKT。下列决定只锁定设计。合并本 plan 不授权实现，Phase 1-3 仍需 Aimpact 明确 GO。

**D-1：已选择 B。v1 在 herdr 0.9.3 上使用 dry-run 加逐个 token 确认后 apply。**

事实：最后一次检查和 `pane close` 之间有一个窗口（§4.0）。这个窗口中的用户输入、focus、move、重命名和新建 pane 都不能被检测或阻止。任何时候的未提交输入都看不到（H15）。人的确认不会消除这个窗口。

| 选项 | 内容 | 偏差 | 决定 |
|------|------|------|------|
| A | v1 只做 dry-run。等待 D-2 的上游能力。 | 没有偏差。pane 继续累积，由人手动关闭，dry-run 报告给出候选列表 | — |
| B | v1 做 dry-run 加确认后 apply（§4.0.1）。Aimpact 逐个确认 token，token 900 秒有效。 | G3/G4/G5 只在检查时成立。检查到关闭之间的窗口没有保护（估计是一次 herdr 调用的时间，inferred，没有测量）。未提交的输入看不到。这两项在每个 token 中列为 `non_atomic_close` 和 `input_unobservable`。provider 已退出的 pane 不能确认关闭（S5） | **已选择** |
| C | 在 0.9.3 上无人参与的自动 apply | 和 B 相同的偏差，但没有人确认 | 不推荐 |

**D-2：已选择提出请求，并已提交 [herdrdev/herdr#4967](https://github.com/herdrdev/herdr/issues/4967)。** 请求包括条件 `pane.close`（workspace、tab、terminal、PGID、focus、声明时的 seq）、server 端的 `input_seq` 计数契约（覆盖所有输入路径，包括没有回显的输入）、`tab_close` 条件和固定的 `workspace_close: forbid`。提交 issue 不证明能力已可用。Phase 3 仍须通过 §7.4 的验收。

**Q1-Q9：已锁定。**

1. **Q1，herdr 重启。** 永久 keep（`identity_changed`，§6.5）。v1 不做 `rebind`。dry-run 列出记录，由人手动关闭。
2. **Q2，worktree 已被删除。** 保持 keep，直到有可验证的删除记录。v1 返回 `git_state_unknown`。
3. **Q3，时间。** settle 窗口为 300 秒。确认 token 有效期为 900 秒。
4. **Q4，无记录 pane。** 由 Aimpact 一次性手动关闭。不做 `adopt`。
5. **Q5，运行主机。** Bot 在 Max 上运行 `repo-harness herdr …`。ledger、Git 和 herdr 在同一台主机。
6. **Q6，review pane。** 保留到它声明过的每个 PR 都 MERGED 或 CLOSED。`obsolete`、`result --no-pr` 或新结果都不能解除 OPEN PR 义务（S7、§4.5）。要更早释放，只能由人手动关闭。
7. **Q7，发布证据。** S10 要求远端分支 SHA 或声明 PR 的 `refs/pull/<n>/head` 等于声明的 head。远端分支前进时，Bot 必须重新声明。
8. **Q8，恢复配置。** 保持 `resume_agents_on_restore` 不变。Bot 在重启后检查恢复的 agent 参数。重启仍使记录永久 keep（Q1）。
9. **Q9，后台任务。** 接受 S13 保留有其他 PGID 后台任务的 pane。Claude 后台工具进程若有自己的 PGID（V9），pane 保留到后台任务结束。

---

## 10. Review log

§10 是作者的处理记录。它不是独立验收。每一行的「处理」只说明设计怎样改，不说明实现或测试已经通过。

### 10.1 第一轮（`/tmp/pane-reap-design-review-r1.md`，REJECT，对照 rev 0）

| ID | 发现 | rev 1 处理 | 第二轮状态 |
|----|------|------------|------------|
| P0-1 | ledger 锁不能防止关闭正在被使用的对象；0.9.3 没有条件关闭 | §4.0：dry-run 加逐个确认；上游条件关闭；关闭顺序改为检查后立即关闭；D-1、D-2 | partially → rev 2 见 10.2 |
| P0-2 | merged PR 可以接受已复用的 pane | 结果版本和活动快照；merge 不重新拍快照 | fixed |
| P0-3 | 恢复 close-intent 时跳过 open PR 检查 | close-intent 绑定授权；恢复时完整重新检查 | fixed |
| P0-4 | 本地 remote-tracking ref 不能证明已推送 | 新鲜的 `ls-remote` 证据 | fixed |
| P1-1 | 最后一个 pane 的关闭可能绕过 tab 保护 | tab 检查移到关闭前；不调用 `tab close` | fixed |
| P1-2 | PR inventory 和 repository 未定义 | `--repo`、base repo 检查、登记义务 | partially → rev 2 见 10.2 |
| P1-3 | provider 绑定和超时照抄 task-session | PGID leader；内外超时 | fixed |
| P1-4 | S12 没有检查现有布局 | `pane layout` | fixed |
| P1-5 | start_unknown 和候选规则冲突 | `incomplete_spawn` 只报告 | fixed |
| P1-6 | 已退出 agent 的规则不完整 | live / exited 分支 | partially → rev 2 见 10.2 |
| P1-7 | 测试和推出不覆盖安全保证 | 屏障、sentinel、真实 remote | partially → rev 2 见 10.2 |
| P2-1、P2-2、P2-3 | 引用、缩小 v1、审计 | 已修正 | fixed |

### 10.2 第二轮（`/tmp/pane-reap-design-review.md`，与 `-r2.md` 相同，REJECT，对照 rev 1）

| ID | 发现 | rev 2 处理 | 位置 |
|----|------|------------|------|
| r1 P0-1 | partially：人工确认不能写成竞态已被修复 | §2 增加时间边界，写明 G3/G4/G5 只在检查时成立，人的确认不消除窗口。Phase 2 只在 D-1 选 B 后开始 | §2、§4.0、§9 D-1 |
| r1 P1-2 | partially：`gh pr list` 默认 30 条；本地和 upstream 分支名不同；review 分支范围 | 明确 `--limit 100`，返回 100 行时 keep；head ref 来自 `@{upstream}`；本地按 head repository 过滤；定义 `upstream_branch` 和 `declared_only` 两种范围 | §4.5、S7、N24-N27 |
| r1 P1-6 | partially：已退出 provider 的确认分支不可执行 | 采用最简方案：删除确认例外，provider 已退出的 pane 总是 keep，没有 token | S5、§9 D-1、N10、B9 |
| r1 P1-7 | partially：缺无 PR 未接受的测试和原始输入测试；Phase 1 gate 包含被禁用的 apply 测试 | 增加 N12、N32；测试分为 T1/T2/T3 | §7 |
| 新 P0-1 | 空 PR 集合可以绕过 accept | S6 (3) 要求 `prs.length > 0`；无 PR 的结果只能通过绑定 k 的 mark 接受；`obsolete` 也写一个绑定 k 的结果版本（rev 3 撤回这一点，见 10.4）；anchor 分支按接受依据定义 | §4.2、§4.5、S6、S9、N12 |
| 新 P0-2 | Phase 3 的 `input_seq` 没有绑定结果声明 | `input_seq` 加入 `ActivitySnapshot`，在 `result` 时持久化；digest 和条件关闭使用声明的值，从不刷新；没有这个字段的记录在自动 apply 中 keep，需要重新声明，没有兼容路径 | §4.0.2、§6.2、U1、U8 |
| 新 P0-3 | Phase 3 的条件关闭不保护 tab 和 label | 条件关闭增加 `workspace_id`、`tab_id`、`tab_close`（`forbid` 或 `allow_if_label`）和固定的 `workspace_close: forbid` | §4.0.2、U4-U7 |
| 新 P1-1 | digest 的失效条件不完整 | 定义 `ConfirmDigestInputV1`；token 包含 `issued_at`，900 秒有效；任何输入变化让 digest 失效；token 只能开始一次关闭；恢复规则分 pane 存在和不存在两种 | §4.0.1、§6.2、S16、S17、B10-B14 |
| 新 P1-2 | Phase 1 的测试 gate 和 apply 禁用冲突 | Phase 1 不发布关闭代码（新文件 `pane-reap-apply.ts` 在 Phase 2 引入）；测试分为 T1/T2/T3；没有确认绕过开关 | §4.1、§7.0、§8 |
| 新 P1-3 | V7 不能把输出 revision 提升为输入证据 | V7 写为输出信号的观察；`input_unobservable` 保留；Phase 3 要求 server 输入接收路径的计数契约，覆盖没有回显的输入和所有入口 | §4.0.2、§7.1 V7 |
| 新 P2-1 | 区分临时否决和永久失效 | 新增 S8a：活动版本不匹配是永久的（跨重启由 `terminal_id` 保证）；focus 是临时否决 | S8a、N30 |
| 新 P2-2 | 引用和保证范围 | §0 把 task-agent 的独占写为工作流假设；§2 写明 G4 的时间边界；`validateHerdrEndpoint` 改为 `:45-62`，并写明 `realpath` 由新模块完成；§10 写明是作者记录 | §0、§2、§6.1、§10 |

### 10.3 V1-V8 结果（`/tmp/pane-reap-v-results.md`）

| V | 结果 | rev 2 的设计变化 |
|---|------|------------------|
| V1 | 最后一个 pane 关闭时 tab 自动关闭；最后一个 tab 的最后一个 pane 关闭时 workspace 也被关闭 | tab 检查全部在关闭前（S11）；不调用 `tab close`；新增 S12 和 N44、B7、U7 |
| V2 | 重启后 `terminal_id` 全部变化 | S3 把它作为可靠的重启信号 |
| V3 | `pane_id`、`tab_id`、label、session 不变 | §6.5 |
| V4 | 默认自动恢复，丢失原参数，seq 重置 | S8a；seq 相等不能单独证明没有活动；N5 覆盖两种设置；§9 Q1、Q8 |
| V5 | `agent start` 支持 Bot 的参数；Codex 第一次 prompt 前没有 session | binding 的 session 可以为空；`result` 在简报之后，要求非空 session |
| V6 | provider 是 PGID leader | S4 不变，加入实测证据 |
| V7 | 输入没有任何信号 | 删除「能否把 `input_unobservable` 改为证据」的说法；N32 检查报告诚实 |
| V8 | `pane close` 结束全部进程，包括后台任务；Claude 会话可以恢复 | 新增 S13 和 N45、N46、B8；S18 降为后备；新增 V9、V10 |

### 10.4 第三轮（`/tmp/pane-reap-design-review-r3.md`，REJECT，对照 rev 2）

第三轮把第二轮的全部发现和第一轮的剩余发现标为 fixed。它提出一个新 P0 和两个 P2，没有新 P1。

| ID | 发现 | rev 3 处理 | 位置 |
|----|------|------------|------|
| r3 P0-1 | `obsolete` 隐式写一个 `prs: []` 的新结果版本，让已声明的 OPEN PR 从 S7 消失。`result --no-pr` 或省略旧 PR 的新结果有同样的问题 | `obsolete` 改为 `obsolete --result k`，只写绑定已有结果版本的 mark，不创建结果版本，不改变 PR 集合。没有结果版本时 `obsolete` 失败。新增 PR 义务集合：spawn 全部结果版本中声明过的 PR 和 head ref 的并集，从已有文件推导。PR 只在 GitHub 显示 MERGED 或 CLOSED 时离开义务集合。S7 检查义务集合，不只检查最新结果。`ResultVersion` 去掉 `via` 字段。digest 加入 `pr_obligations` 和 `obligation_head_refs`。新增测试 N56-N60 | §2、§4.2、§4.5、S6、S7、§5.1、§6.2、§7.2、§9 Q6 |
| r3 P2-1 | S8 的字段表没有 `input_seq` | S8 写明 Phase 3 要求 `input_seq` 不为空并等于声明值。U1 分为 U1a（策略在最后一次观察之前发现变化，keep）和 U1b（最后一次观察之后的变化，server 返回 `precondition_failed`） | S8、§7.4 |
| r3 P2-2 | N52 的 Phase 1 断言不应用于以后的 PR | N52 只在 Phase 1 的发布物上运行。Phase 2 及以后由 B1-B18 检查 apply。不增加确认绕过开关 | §7.0 T1、N52 |
| 小修正 | 截断判断的顺序；`declared_only` 的范围 | 100 行截断在按 head repository 过滤之前判断；写明 `declared_only` 依赖 Bot 完整登记 | §4.5 |

历史状态（rev 3）：当时 D-1、D-2 和 §9 的问题待决定。这项等待已由 2026-10-06 的锁定决定取代（§9）。V9、V10 仍未验证。本轮没有运行任何测试或改变状态的命令。

### 10.5 第四轮（`/tmp/pane-reap-design-review-r4.md`，APPROVE WITH CHANGES，对照 rev 3）

| ID | 发现 | 处理 |
|----|------|------|
| r3 P0-1 | obsolete / --no-pr 可隐藏 OPEN PR | 已在 rev 3 修完；本轮确认 fixed |
| r3 P2-1 / P2-2 | S8 input_seq、N52 范围 | 已在 rev 3 修完；本轮确认 fixed |
| r4 P2-1 | §4.3 进程清理引用写成 S12 | 改为 S18（规则正文不变） |
| r4 P2-2 | T3 引用写成 §7.3 | 改为 §7.4（测试集合不变） |
| 剩余 P0/P1 | 无 | — |
