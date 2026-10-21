# Plan: Bash 写入绕过 edit guard 的限制说明和 Stop 事后检查（#851）

> **Status**: DRAFT。等 owner 批准。批准前不写代码。
> **Created**: 20261021-2117
> **Slug**: bash-write-limit-851
> **Baseline**: `origin/main@a6826bc7a`（0.24.0）
> **Branch**: `fix/851-bash-write-limit`
> **Refs**: #851（方向 A 和 C）。不做 B（Bash 预过滤）和 D（git 层拦截）。#850 不在范围内。相关：#678、#692、#764、#766、#737/#837。
> **Rollback Surface**: `git revert <squash-commit>`。新增的状态文件在被忽略的 `.ai/harness/state/` 下，删掉即可。

## 0. P1 / P2 / P3

**P1 现状**
- `src/cli/hook/route-registry.ts:75-82`：`PreToolUse.edit` 只匹配 `Edit|Write`，handler 是 `mutation-guard`。没有 Bash 路由。
- `src/cli/hook/mutation-guard.ts:54-66`：目标路径来自 `tool_input.file_path` 或 apply_patch 文本。`firstDenial`（`:68-100`）对 `_ref/`、`_ops/` 下的路径**无条件拒绝**。
- guard 只在拒绝时写记录：`appendFailureRecord` → `.ai/harness/failures/latest.jsonl`。放行不写任何记录。
- evidence checkpoint（`src/effects/evidence/checkpoint-store.ts:478`）只投影事件账本的元数据和 decision。它没有工作区文件状态。没有账本时直接 `skipped`。
- edit journal 已被 #692 删除。
- `_ops/` 和 `_ref/` 在 repo-harness 和 AstroZi 里都被 git 忽略（`git check-ignore` 已确认）。`git status` 看不到它们的改动。
- `src/cli/hook/stop-handler.ts:73-91`：Stop 发布 checkpoint，写 handoff/resume。Claude 时调用 `collectAgentNotice` 送架构债务，走 stdout（→ `additionalContext`）加 `systemMessage`。
- `src/cli/hook/hook-protocol.ts:54-57`：Codex 的 Stop 不写 stdout。Codex Desktop 把 Stop JSON 显示成 "Unsupported content type"。
- 托管上下文的来源：
  - SessionStart 段（`src/cli/hook/session-context.ts`）：每个装了 hook 的会话都收到，Claude 和 Codex 都有。
  - 全局规则块（`assets/reference-configs/global-working-rules.md` → `~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md`）：需要用户主动开启（`global-context.ts:480-484` 对 `no-rules` 状态跳过）。本机两个文件都没有 `BEGIN: repo-harness global-working-rules` 标记，所以这条通道在本机不生效。
  - 仓库根 `CLAUDE.md`/`AGENTS.md`（`src/core/adoption/standard-plan.ts:844`）：只在文件不存在时写（`ifMissing`）。已有仓库（例如 AstroZi）永远拿不到更新。
  - 结论：SessionStart 是唯一能到达现有安装的托管通道。
- `docs/reference-configs/hook-operations.md` 和 `assets/reference-configs/hook-operations.md` 内容相同，两份都要改。

**P2 追踪**（AstroZi 里的真实路径）
1. agent 执行 Bash：`python3 - <<EOF ... open('_ops/env/.env.api.global','w') ... EOF`。
2. Claude 没有 Bash 的 PreToolUse 路由。guard 不运行。文件被改写。
3. 回合结束，Stop 运行：发布 checkpoint，写 handoff/resume，查架构债务。没有任何一步看 `_ops/`。
4. agent 和人都不知道发生了一次受保护路径的写入。
5. 压力点：第 3 步没有 `_ops/`、`_ref/` 的基线，也没有比较。

**P3 决定**
- guard 的放行集合在 `_ops/`、`_ref/` 下**按构造为空**。所以"没有被任何 Edit|Write 决策放行过的改动"就等于"`_ops/`、`_ref/` 下的任何改动"。不需要放行记录，也不应为它新增 guard 写入。
- 需要的是一个文件状态基线。因为两个目录被忽略，git 给不了，只能自己记录。
- Stop 当前耗时：AstroZi 最近 20 次 380–568 ms（`.ai/harness/runs/hook-events.jsonl` 的 `elapsed_ms`）。遍历 AstroZi 的 `_ops/`+`_ref/`（63 项，lstat）实测 2.65 ms。对每次 Bash 调用没有任何开销。
- 现状为什么是这个形状：#764/#766 删掉 `PostToolUse.bash`，因为每次 Bash 多约 5 s，而且当时没有消费者。这个代价判断保留。
- 10 倍规模时先坏的：`_ref/` 里放了克隆的上游仓库时的遍历项数。所以遍历要有上限。

## 1. 需要 owner 决定的三件事

### 1.1 测试 2 的含义（必须决定）

任务要求的测试 2 是"Edit 放行过的路径不报"。按 P3，guard 从不放行 `_ops/`、`_ref/` 下的路径，所以这个场景按原文不会发生。候选解释：

| 选项 | 测试内容 | 说明 |
| --- | --- | --- |
| **2a（推荐）** | guard 放行的普通路径（例如 `src/x.ts`）被改，Stop 不报；guard 对 `_ops/x` 的 Edit 返回 exit 2，文件不变，Stop 不报 | 直接测"Edit 决策的结果不会触发报告"。第二部分同时锁住"放行集合为空"这个前提：如果以后有人让 guard 放行 `_ops/`，这个测试会提醒检查 C 的语义 |
| 2b | 基线建立前已经存在的 `_ops/` 文件，Stop 不报 | 测的是"首次静默建基线"，和 Edit 无关 |
| 2c | 2a 加 2b | 覆盖最全，多一个测试 |

### 1.2 基线来源（必须决定）

| 选项 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **A（推荐）Stop→Stop 清单** | 每次 Stop 有界遍历 `_ops/`、`_ref/`，记录 `{path → size, mtimeMs}`，和上一次 Stop 的清单比较，报告新增、修改、删除。首次 Stop 只建基线，不报 | 一个文件、一个写入点。能报删除（`rm _ops/env/*` 是 #851 的主要风险） | 两次 Stop 之间人自己改的文件也会被报出 |
| B SessionStart 建基线，Stop 比较 | SessionStart 也遍历一次 | 归因到本会话更准 | SessionStart 多一次遍历和一次写；多一个写入点 |
| C guard 放行时写状态文件 | 每次 Edit/Write 放行写一条 | — | **不推荐**。每次 Edit/Write 多一次写；对 `_ops/`、`_ref/` 永远记录不到任何东西 |

只比较 mtime（不存清单）被排除：它看不到删除。

### 1.3 噪声处理（建议默认，可改）

AstroZi 的 `_ops/` 下有 `logs/`、`artifacts/`、`scratch/`、`state/`。agent 正常运行的部署脚本会往这里写。每次产生新日志文件，路径集合就变，去重拦不住。建议：
- 报告只列前 5 条路径，再加 `(+N more)`。整段 additionalContext 不超过 800 字节（和架构债务通知同一上限）。
- 不按子目录排除（排除列表要额外配置，不在本次范围）。如果实际噪声太大，后续再开 issue。

## 2. 方向 A：写明限制

1. `docs/reference-configs/hook-operations.md` 和 `assets/reference-configs/hook-operations.md`：
   - 路由表 `PreToolUse.edit` 行写明只覆盖 `Edit|Write` 和 Codex `apply_patch`。
   - "Edit guards" 小节后加一段 "Coverage limit"：Bash 写入不经过 guard；`_ops/`、`_ref/`、仓库范围的拦截和 `[CapabilityOwner]` 行都不作用于 Bash；原因引用 #764/#766；事后检查见 Stop。
   - `Stop.default` 行加上受保护路径报告。
2. SessionStart：新增一个 mandatory 段 `edit-guard-scope`，内容一行：
   `[EditGuardScope] The edit guard checks Edit, Write and apply_patch only. Bash writes skip it. Use the edit tools to change repository files. Use Bash to run commands.`
   - 状态解析失败时也输出（guard 照常运行，限制照常存在）。
   - 约 35 token，在 1,500 token 预算内。
3. 不改全局规则模板和 `rootContextContent()`：前者需要用户开启，后者到不了已有仓库（见 P1）。

## 3. 方向 C：Stop 事后检查（按 1.2 选项 A 写）

新模块 `src/cli/hook/protected-path-notice.ts`，Stop handler 调用它。

- 遍历：`_ops/`、`_ref/`。lstat，不跟随符号链接，只记录非目录项。上限 5,000 项。超过上限：不比较、不写清单、stderr 一行诊断。
- 状态文件：`.ai/harness/state/protected-paths.json`，内容 `{ entries: {path: [size, mtimeMs]}, notified: <key> }`。写前用 `git check-ignore` 确认被忽略（同 agent-notice）。用 `writeHookStateFile` 原子替换。
- 比较：新增 / 删除 / size 或 mtimeMs 变化 → 改动路径集合。
- 去重：key = `sha256(JSON.stringify([branch, sortedChangedPaths]))`。branch 来自 `git symbolic-ref --short -q HEAD`，detached 时用 `HEAD`。key 等于上次的 `notified` 就不报。每次 Stop 都更新清单。
- 首次（无状态文件）：只写清单，不报。
- 失败：任何 I/O 或 git 失败 → 不报、不写、stderr 一行诊断，exit 0。Stop 绝不 exit 2。
- `stop_hook_active` 为 true 时跳过（沿用现有逻辑）。
- 输出（Claude）：
  - additionalContext：
    ```
    [ProtectedPathChange] 2 paths under _ops/ or _ref/ changed since the last Stop. The edit guard denies every Edit or Write there, so Bash, a script or the person changed them.
    - modified _ops/env/.env.api.global
    - deleted _ops/env/old.env
    Do not change _ops/ or _ref/ through Bash. Tell the user if a change was not intended.
    ```
  - systemMessage：`Protected paths: 2 changes under _ops/ or _ref/ since the last Stop (_ops/env/.env.api.global, ...).`
  - 和架构债务通知合并：content 用空行连接，systemMessage 换行连接，diagnostics 拼接。任何一方失败不影响另一方。
- Codex：Stop 不写 stdout（渲染器的既有设计），模型看不到报告。建议 **Codex 也运行检查，报告写到 stderr 一行**（运维文本），清单和去重照常更新。备选：
  - Codex Stop 完全跳过（和架构债务通知一致）。缺点：Codex 会话里的改动要等下一次 Claude Stop 才报。
  - 经 `UserPromptSubmit.inbox` 在下一次提示时送给 Codex 模型。范围扩大，本次不做。
- 归因限制：检查分不出 Bash、脚本还是人自己的编辑器。报告措辞只陈述事实，不指认 agent。

## 4. 测试（严格 TDD，先 RED）

扩展 `tests/stop-handler.test.ts`，新增 `describe('Stop protected path report (#851)')`：

1. Bash 改了 `_ops/` 下的文件会被报出：首次 Stop 建基线 → 直接 `writeFileSync('_ops/env/a.env')`（模拟 Bash）→ 第二次 Stop 的 stdout 含 `[ProtectedPathChange]` 和路径，`systemMessage` 有值。再加删除场景。
2. 按 1.1 的选择（推荐 2a）：guard 放行的 `src/x.ts` 被改 → Stop 不报；`runMutationGuard` 对 `_ops/x` 返回 exit 2，文件未写 → Stop 不报。
3. 同一组路径重复 Stop 不再报：第 2 次 Stop 报出后，再次改写同一文件（新 mtime）→ 第 3 次 Stop 不报。
4. 回归：Codex Stop 只写 stderr、stdout 为空；`stop_hook_active` 跳过；`.ai/harness/state/` 未被忽略时不写、一行诊断。

SessionStart：扩展 `tests/session-context.test.ts`，断言 `edit-guard-scope` 段存在且 mandatory，状态不可用时也存在。

需要改的既有断言（逐条在 PR 里说明）：
- `tests/session-context.test.ts:150`、`:215` 断言了完整段列表，加入新段后要更新期望值。
- `tests/fixtures/session-start/state-authority-baseline.json` 若包含完整 SessionStart 输出，要更新。
- 现有 Stop 测试在全新 fixture 上断言 `{exitCode:0, stdout:'', stderr:''}`。首次 Stop 静默建基线，这些断言不需要改。

## 5. 验证

```bash
bun run check:type
bun run test:files tests/stop-handler.test.ts tests/session-context.test.ts tests/session-state-authority.test.ts tests/harness-context-budget.test.ts --timeout 60000 --max-concurrency 1
```

另外用 `docs/reference-configs/hook-operations.md` 的链接检查（若有对应脚本）确认文档。

## 6. 风险

- 噪声：`_ops/logs` 等目录的正常写入会被报出（见 1.3）。
- 归因：报告不能证明是 agent 写的。
- Codex 模型看不到报告（见第 3 节）。
- 基线外的改动：清单只在 Stop 时更新。会话之间人自己做的改动会在下一次 Stop 报出。
