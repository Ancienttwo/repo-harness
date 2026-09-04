# 最终方案：Shared Coordination Plane + Deterministic Kanban v1

下面这份方案可直接替换现有的 `shared-coordination-plane-kanban` Draft。原 Draft 已正确识别两个 linked worktree 可以重复领取同一 Sprint row，也正确提出“**Sprint 是任务权威、Lease 是执行权威、Board 是投影、Hook 不是数据库**”这一总体方向。

最终版保留这个方向，但修正以下问题：

* 不再用整份 Sprint 的 revision 判断单项任务是否 drift；
* 不把 row index 放入稳定 `task_id`；
* Claim 增加 `reserved → bound → completing` 生命周期；
* Contract task 的完成权归 `contract-worktree finish`，不另设含糊的通用 `complete`；
* 所有 Lease mutation 加 per-task lock 与 fencing token；
* 不在第一阶段搬迁现有 worktree metadata；
* 不宣称“无迁移”，而是设计一次性 runtime-state cutover；
* Board 必须对全部输入检测 torn snapshot；
* Hook 只做提前反馈，真正的安全边界落在 claim、inline completion 和 finish；
* 四个阶段改成四个独立 work-package，而不是一个 work-package 内四个 public commits。

本方案以当前 `main` `1dbe446c` 为基线。现有 `main` 已受 `Required / CI` 保护；之前讨论过的 finish CAS 重写不属于本项目，因为 stale-base publication guard 已经落地，再改写成显式 `update-ref` 没有净收益。 

---

# 一、目标与适用边界

## 目标

在**同一机器、同一 Git clone、多个 linked worktree**之间建立共享协调平面，使多个 Agent 能够：

1. 原子领取不同 Sprint 任务；
2. 不会重复领取同一任务；
3. 看见其他 Agent 正在执行什么；
4. 判断工作是正常、停滞、漂移还是 orphaned；
5. 在 Agent 被替换或任务被 steal 后，旧 Agent 无法释放或完成新 Agent 的 Lease；
6. 即使 Hook 被绕过，也无法把无有效 Lease 的 Sprint task 发布或标记完成；
7. 长任务重启后可从 repo 与 git-common-dir 恢复，而不依赖聊天上下文。

## 明确不做

v1 不包括：

* 跨机器或跨 clone 协调；
* tracked `board.md`；
* Web/TUI 看板；
* heartbeat daemon；
* TTL 或自动超时回收；
* 自动抢占活跃 Agent；
* 自动 `claim next` 并行调度；
* Sprint dependency、parallel group 等新列；
* Gemini host；
* 新 Hook route；
* 每次 ToolUse 都写进度；
* 搬迁 AttemptReceiptV1；
* 搬迁现有 contract-worktree metadata；
* 根据宽泛 `allowed_paths` 自动阻止两个任务并行。

一旦未来需要跨机器可见性，应新增 GitHub branch/PR 作为额外**投影输入**，而不是把本地 Lease store 抽象成可切换的网络后端。

---

# 二、不可破坏的权威边界

| Datum                       | 唯一权威                                           |
| --------------------------- | ---------------------------------------------- |
| 有哪些任务                       | canonical target ref 上的 Sprint `## Backlog`    |
| Task、Mode、Acceptance        | 对应 Sprint row                                  |
| 任务是否完成                      | Sprint row 的 `[ ]` / `[x]`                     |
| 当前谁拥有执行权                    | git-common-dir 中的 Lease owner record           |
| 当前 worktree 是否存在            | `git worktree list --porcelain`                |
| Worktree 的 plan、base、branch | 现有 worktree-local metadata，经当前唯一 selector 验证   |
| Agent 是否有进展                 | owner worktree 中的现有 Attempt ledger，仅属 evidence |
| Kanban 全貌                   | `repo-harness state board --json` 确定性投影        |
| Hook 注入内容                   | Board 的事件相关切片，不是权威                             |

当前 Sprint lock 与 in-flight marker 仍从 worktree-local `.ai/harness/sprint/` 推导，因此不同 worktree 无法互见；这是本项目要修复的真实缺口。

现有 closeout 已经使用 git-common-dir、atomic `mkdir` 和 owner record 实现跨 worktree claim；新 Lease store应复用这个模式及现有 exclusive-directory-lock，而不是发明 daemon。

---

# 三、Canonical Sprint 与任务身份

## 3.1 Canonical Sprint

每个共享 Claim 必须绑定：

```text
target_ref
sprint_path
task_name
task_revision
```

`target_ref` 默认取：

```text
refs/heads/<policy.worktree_strategy.merge_back.target>
```

通常是：

```text
refs/heads/main
```

Claim 不读取调用者 worktree 中可能过时的 Sprint copy，而是读取：

```bash
git show <target_ref>:<sprint_path>
```

Claim 前置条件：

1. Sprint 必须已存在于 target ref；
2. Sprint 状态必须为 `Approved` 或 `Executing`；
3. canonical target worktree 对该 Sprint path 不得有未提交变化；
4. Task cell 在该 Sprint 内必须唯一；
5. Row 当前必须为 `[ ]`。

这意味着并行 Sprint 任务必须先把 Sprint 定义提交到 target。未提交的 Draft Sprint 仍可编辑，但不能进入共享领取。

## 3.2 `task_id`

不使用 `normalize_slug()`，也不使用 row index。

```text
task_id = sha256(
  "repo-harness-task-id/v1\0"
  + sprint_path
  + "\0"
  + exact_trimmed_task_cell
)
```

理由：

* `Fix auth bug` 与 `Fix auth-bug` 不会碰撞；
* 不同 Sprint 中同名任务因 `sprint_path` 不同而隔离；
* 调整 row 顺序不会改变任务身份；
* row index 不再是生命周期身份；
* Task cell 必须在一个 Sprint 内唯一。

规则：

> Task 被领取后，Task cell 不可重命名。重命名视为删除旧任务并建立新任务。

## 3.3 `task_revision`

```text
task_revision = sha256(
  "repo-harness-task-definition/v1\0"
  + task_id
  + "\0"
  + mode
  + "\0"
  + acceptance
)
```

不把以下内容加入 `task_revision`：

* row index；
* 其他任务；
* 整份 Sprint SHA；
* target branch OID；
  -本任务的 `[ ]` / `[x]`。

因此：

* 另一个任务完成不会令本任务 drift；
* Sprint 中其他行变化不会令本任务 drift；
* 本任务 Acceptance 或 Mode 改变会 drift；
* Task cell 改名会令旧 task 消失；
* row reorder 本身不令 active claim 失效。

这修复了原 Draft 中“一个 Agent 完成任务后，整份 Sprint revision 改变，所有其他 Agent 一起 drift”的问题。

---

# 四、共享协调目录

```text
$GIT_COMMON_DIR/repo-harness/coordination/v1/
├── protocol.json
├── leases/
│   └── <task-id>/
│       └── owner.json
├── locks/
│   ├── tasks/
│   │   └── <task-id>.lock/
│   ├── backlog.lock/
│   └── migration.lock/
└── events/
    └── <task-id>.jsonl
```

v1 **不设置**：

```text
coordination/v1/worktrees/
```

Worktree topology 已由 Git 提供。Plan/base metadata 继续保留在当前：

```text
<worktree>/.ai/harness/worktrees/*.json
```

Board 从 `git worktree list` 找到 worktree，再读取该 worktree 的 metadata，并使用现有 `contract_worktree_metadata_select()` 的唯一选择规则。当前 selector 已区分 exact-worktree、branch-only、duplicate、invalid JSON 和 parser unavailable；不应在本项目重新引入第二 selector。

---

# 五、Lease 数据模型

```json
{
  "protocol": 1,
  "kind": "repo-harness-task-lease",

  "task_id": "sha256:...",
  "task_revision": "sha256:...",

  "sprint": {
    "target_ref": "refs/heads/main",
    "path": "plans/sprints/20260818-example.sprint.md",
    "task": "implement-auth-flow"
  },

  "claim_id": "uuid",
  "generation": 3,
  "state": "bound",

  "claimant": {
    "session_id": "optional",
    "pid": 12345,
    "source_worktree": "/path/to/primary"
  },

  "execution": {
    "worktree": "/path/to/repo-wt-implement-auth-flow",
    "branch": "codex/implement-auth-flow",
    "plan": "plans/plan-....md",
    "unit_ref": "plans/plan-....md"
  },

  "finish_transaction_key": null,

  "created_at": "diagnostic-only",
  "updated_at": "diagnostic-only"
}
```

时间戳只用于显示与审计，**不能**用于 Lease expiry 或 reclaim。

每个执行 worktree另有 ignored projection：

```text
.ai/harness/sprint/active-claim.json
```

内容：

```json
{
  "protocol": 1,
  "task_id": "...",
  "claim_id": "...",
  "task_revision": "...",
  "sprint_path": "...",
  "unit_ref": "..."
}
```

该文件不是权威，只保存这个 worktree 原始取得的 fencing token。即使任务后来被 steal，旧 worktree 仍保留旧 token，因而无法读取新 token 后冒充新 owner。

---

# 六、Lease 状态机

存储状态只包括：

```text
reserved
bound
completing
```

状态流：

```text
无 Lease
   │ claim
   ▼
reserved
   │ bind worktree
   ▼
bound
   │ contract-worktree finish starts
   ▼
completing
   │ publication + Sprint back-fill succeed
   ▼
canonical row = [x]
   │ release/reconcile
   ▼
无 Lease
```

Steal：

```text
reserved / bound
   │ explicit steal(old claim_id, reason)
   ▼
new generation + new claim_id
```

禁止：

```text
completing → steal
```

一旦进入 `completing`，必须先检查或恢复 finish journal，不能假定 publication 尚未发生。

---

# 七、原子操作协议

所有 Lease mutation 必须进入同一个 per-task lock：

```text
locks/tasks/<task-id>.lock/
```

不得实现成：

```text
read owner
→ unlock
→ compare
→ delete/write
```

正确模式：

```text
acquire task lock
→ read current owner
→ validate schema
→ compare claim_id
→ atomic write or delete
→ append audit event
→ release lock
```

`owner.json` 使用：

```text
temporary file
→ fsync
→ atomic rename
```

所有目录与文件必须：

* 位于 canonical git-common-dir 下；
* 拒绝 symlink ancestor；
* 拒绝 malformed owner；
* owner file 建议 mode `0600`；
* reason 必须是 bounded single-line text。

---

# 八、命令面

## 8.1 Claim

```bash
repo-harness sprint claim \
  --sprint <path> \
  --task <exact-task-name> \
  --expected-task-revision <sha256> \
  --json
```

流程：

1. 读取 canonical target Sprint；
2. 验证 Sprint 状态；
3. 唯一定位 Task；
4. 验证 `[ ]`；
5. 验证 `expected-task-revision`；
6. 获取 task lock；
7. 验证当前没有 Lease；
8. mint `claim_id`；
9. 写入 `reserved` owner；
10. 重新读取 canonical Task；
11. 若 Task 期间变化，只删除本次 `claim_id` 创建的 Lease并失败；
12. 返回 Lease document。

## 8.2 Bind

```bash
repo-harness sprint bind \
  --task-id <id> \
  --claim-id <id> \
  --worktree <path> \
  --branch <branch> \
  --plan <path> \
  --unit-ref <ref> \
  --json
```

前置条件：

* Owner 仍是相同 `claim_id`；
* 状态为 `reserved`；
* Worktree 出现在 `git worktree list`；
* Branch/worktree 对应关系一致；
* Task definition 未 drift。

成功后：

* 状态改成 `bound`；
* 写 worktree-local `active-claim.json`；
* 向该 worktree 的现有 Attempt ledger 追加一次 `resumed` receipt，重置同一个 `unit_ref` 的旧 stall 序列。

现有 Attempt ledger 是 per-worktree 路径，因此 v1 不搬迁它；Board 只读取当前 owner worktree 的 ledger。

## 8.3 Release

```bash
repo-harness sprint release \
  --task-id <id> \
  --claim-id <id> \
  --reason <reason> \
  --json
```

只允许：

```text
reserved
bound
```

必须比较原始 `claim_id`。不得从当前 owner record自动读取 token代替调用者的 token。

## 8.4 Steal

```bash
repo-harness sprint steal \
  --task-id <id> \
  --expected-claim-id <old-id> \
  --reason <reason> \
  --json
```

规则：

* 必须显式提供旧 claim ID；
* 必须写 audit event；
* mint 新 claim ID并增加 generation；
* 不接受通用 `--force`；
* `completing` 状态拒绝 steal；
* Task drift 时拒绝 steal，先 reconcile。

## 8.5 Reconcile

```bash
repo-harness sprint reconcile \
  --task-id <id> \
  --expected-claim-id <id> \
  --json
```

可处理：

* canonical row 已 `[x]`，但 Lease 残留；
* `reserved` / `bound` 的 worktree 已从 Git topology 消失；
* bind 失败后留下 reservation；
* migration 中断后的已验证半状态。

不得自动处理：

* `completing`；
* malformed owner；
* task drift；
* worktree 仍存在但 Agent 无进展。

---

# 九、与现有 Sprint 生命周期整合

## 9.1 Contract task：领取与创建 worktree

```text
sprint-backlog start-task --task <task> --execute
```

新流程：

```text
acquire shared backlog lock
→ resolve explicit task
→ claim → reserved
→ release backlog lock
→ capture plan
→ contract-worktree start
→ bind claim to new worktree
```

任何失败：

```text
capture-plan failure
worktree creation failure
bind failure
```

都必须使用原始 `claim_id` 执行 release。

### `start-task` 不带 `--task`

为了保留单 Agent convenience：

* 只有当前没有其他 active Lease 时，才允许自动选择第一项 pending task；
* 一旦已有 active Lease，必须显式指定 `--task`；
* v1 不把 backlog 顺序解释为 parallel-safe。

旧 `--force` 完全退役，由 `steal` 替代。

## 9.2 Contract task：执行期间

Worktree 内的：

```text
active-claim.json
```

绑定原始 token。

Agent rebase 后：

* Task cell、Mode、Acceptance 未变化，则 Lease 继续有效；
* 其他任务完成不会令它 drift；
* finish 的现有 stale-base 和 rebase metadata guard继续独立生效。

## 9.3 Contract task：finish

Contract task **不提供**通用：

```text
repo-harness sprint complete
```

完成权归现有：

```text
repo-harness run contract-worktree finish
```

当前 finish 已负责根据 Plan `Source Ref` 调用 `sprint-backlog complete-task`，将 Sprint row 与整个 verified lifecycle tree一起发布。

新 finish 前置：

1. Plan `Source Ref` 必须解析为 Sprint task；
2. worktree-local claim projection存在；
3. 其中 `claim_id` 与 common-dir owner一致；
4. owner state 为 `bound`；
5. owner worktree/branch 与当前一致；
6. canonical Task 仍为 pending；
7. `task_revision` 未变化。

随后在 task lock 内：

```text
bound
→ completing
finish_transaction_key = closeout journal key
```

之后运行现有：

```text
verification
acceptance
merge seal
archive
Sprint back-fill
publication
```

### Publication 前失败

现有 finish abort 成功后：

```text
completing
→ bound
```

使用同一个 claim ID恢复。

### Publication 后失败

不能回滚 target。

Lease 保持：

```text
completing
```

`recover reconcile`：

1. 证明 publication 已落地；
2. 证明 canonical Sprint row 已 `[x]`；
3. 将 finish journal完成；
4. 以原 claim ID删除 Lease；
5. 删除 local active-claim projection。

### Publication 成功、Lease 删除前 crash

Board 显示：

```text
task = done
lease_cleanup_required = true
```

由 reconcile 安全清理。

## 9.4 Inline task

Inline task 可绑定 primary worktree。

```text
complete-task --claim-id <id>
```

在 shared backlog lock 与 task lock 内：

1. 验证 claim token；
2. 验证 Task definition；
3. 将 row 改为 `[x]`；
4. atomic replace Sprint file；
5. 删除 Lease；
6. 写 audit event。

若 row update成功、Lease 删除前 crash，reconcile 根据 `[x]` 清理残留。

---

# 十、Kanban Board 投影

## 10.1 命令

```bash
repo-harness state board --json
repo-harness state board --sprint <path> --json
```

当前 `state` 命令只有 `resolve`、`next`、`attempt` 等 read model／receipt surface，尚无 Board；新增 Board应沿用相同 projector/effect/CLI 分层。

## 10.2 输出结构

```json
{
  "protocol": 1,
  "kind": "repo-harness-board",

  "canonical_target": {
    "ref": "refs/heads/main",
    "oid": "..."
  },

  "sprint_path": "plans/sprints/example.sprint.md",

  "revisions": {
    "task_authority": "sha256:...",
    "coordination": "sha256:...",
    "topology": "sha256:...",
    "evidence": "sha256:...",
    "board": "sha256:..."
  },

  "snapshot_consistency": "stable",

  "cards": []
}
```

## 10.3 Card 结构

```json
{
  "task_id": "...",
  "task_revision": "...",
  "row_index": 2,
  "task": "implement-auth-flow",
  "mode": "contract",
  "acceptance": "...",

  "column": "doing",

  "task_state": "pending",
  "lease_state": "bound",
  "progress_state": "active",

  "claim": {
    "claim_id": "...",
    "generation": 2,
    "worktree": "...",
    "branch": "...",
    "plan": "...",
    "unit_ref": "..."
  },

  "diagnostics": {
    "definition_drift": false,
    "worktree_missing": false,
    "lease_cleanup_required": false,
    "actual_path_overlap": [],
    "scope_overlap": []
  },

  "actions": {
    "release": "...",
    "steal": "...",
    "reconcile": null
  }
}
```

## 10.4 Kanban 列

### Todo

```text
Task pending
Lease absent
```

### Doing

```text
reserved
bound
completing
```

且没有阻断性异常。

### Blocked

以下任一成立：

```text
stalled
orphaned
drifted
unknown
completing_recovery_required
```

### Done

```text
canonical row = [x]
```

即使存在残留 Lease，仍显示 Done，但加：

```text
lease_cleanup_required: true
```

## 10.5 状态维度分离

不要把所有概念塞入一个 `status`。

### Task state

```text
pending
done
missing
drifted
```

### Lease state

```text
none
reserved
bound
completing
orphaned
unknown
```

### Progress state

```text
not_observed
active
stalled
unreadable
```

`stalled` 只是 evidence overlay，永远不转移所有权。

## 10.6 Torn snapshot

Board 的一致性不能只比较 Sprint revision。

第一次收集：

```text
canonical Sprint bytes
sorted owner.json digests
git worktree porcelain digest
selected worktree metadata digests
relevant Attempt ledger digests
```

计算：

```text
board_input_revision_A
```

完成 projection 后再收集：

```text
board_input_revision_B
```

规则：

```text
A == B → stable
A != B → 全量重试一次
第二次仍不同 → changed_during_read
```

Board 在 `changed_during_read` 时仍可用于诊断，但 claim、steal、release、finish 均不得信任 Board snapshot，必须在各自 task lock 内重新读取权威。

---

# 十一、停滞与 orphan 判定

## Stalled

只读取**当前 owner worktree**的 Attempt ledger，并按 owner 的 `unit_ref` 调用现有 `evaluateAttemptStall`。

新 generation bind 时追加 `resumed` receipt，避免旧 claim 的连续 no-progress receipts污染新 owner。

Stalled：

```text
不自动 release
不自动 steal
不自动 reclaim
```

## Orphaned

### 自动可清理

只有：

```text
state = reserved 或 bound
AND 记录的 worktree 已不在 git worktree list
AND 无 active finish transaction
AND expected claim_id 仍匹配
```

### 不自动清理

* Worktree 仍存在；
* Agent 进程不在；
* Branch 消失但 worktree 仍存在；
* detached HEAD；
* state = completing；
* owner malformed；
* metadata unreadable。

---

# 十二、并行资格与冲突

## v1 调度规则

* 多 Agent 场景下，orchestrator 必须显式传 `--task`；
* 不新增 `depends_on` 或 `parallel_safe`；
* 不自动认定“下一行”可以并行；
* Lease 只防止重复领取，不证明两个任务可以安全并行。

## Conflict 投影

Board 可报告两类冲突：

### `actual_path_overlap`

两个 active worktree 的当前 changed path 集合存在 exact overlap。

这是高可信警告。

### `scope_overlap`

两个 contract 的 `allowed_paths` 可能重叠。

这是 advisory，因为 `src/`、`tests/`、`tasks/` 等宽 prefix 不代表实际文件冲突。

v1 不根据 `scope_overlap` 直接阻止 PreEdit。真正的 merge/rebase/finish gate继续处理最终集成冲突。

---

# 十三、Hook 集成

现有 route tuple 是稳定 public contract，Codex 会对顺序进行 trust hash；最终方案不新增、不重排 route。当前 host 类型只有 Claude 与 Codex；`SubagentStart` / `SubagentStop` 为 Codex-only。

## Codex

```text
SubagentStart.context
```

注入当前 Board slice。

## Claude

复用：

```text
PreToolUse.subagent
```

但 handler 只在：

```text
tool_name = Task 或 Agent
```

时加入 Board slice；`SendUserMessage` 不加入。

## `PreToolUse.edit`

只在当前 plan 的 Source Ref 为 Sprint task 时启用：

1. 读取 worktree-local claim projection；
2. 比较 common-dir owner；
3. 验证 state = bound；
4. 验证 claim ID、worktree、branch；
5. 验证 task revision。

失败则阻止 structured Edit/Write。

这只是**提前反馈门**。Bash write 可能绕过 structured edit，因此真正权威仍是：

* `start-task` claim；
* inline `complete-task`；
* `contract-worktree finish`。

不增加通用 Bash mutation parser。

## 不做的 Hook 行为

v1 不做：

* 每次 PostToolUse 写 progress；
* Stop 自动 release；
* Stop 自动 steal；
* SessionStart 注入完整 Board；
* Hook failure 后 fail-open publication。

Attempt receipt 继续保持 continuation-attempt 语义，不改成 tool-call telemetry。

## 注入内容

只注入：

```text
当前 Agent 的 task / claim / worktree
本任务是否 drifted
相关 active worktree
actual path overlap
stalled / orphaned / recovery warning
正确的 release / steal / reconcile 命令
```

不注入整张 Board。

---

# 十四、一次性迁移（2026-08-19 修订：按落地实现改为 quiescent fail-closed cutover）

> 修订记录：本节原文要求 `migrate-legacy-claims` 把旧 in-flight marker 逐个映射成新 Lease。落地实现（main `f5f4d8ce`，`src/effects/state/coordination-cutover.ts`）否决了该方向，修订后以实现为准：把 legacy marker 映射回 canonical task，需要在未验证的 legacy state 上运行本项目才引入的身份推导，这正是仓库禁止的对权威数据做本地语义再推导。原文的 fail-closed 收口条款保留且必须落地（见下）。

原 Draft 所称“无 schema migration”不成立这一判断维持：旧 runtime state 路径和 marker schema 确实要退役，但退役方式是静止切换，不是状态翻译。

## 采纳语义：quiescent cutover

不提供 marker→Lease 的转换命令。cutover 只在静止状态下一次性启用，在 `coordination/v1/locks/migration.lock` 下：

1. 检查三类 blocker：任何 worktree 存在旧 `.ai/harness/sprint/in-flight/*` marker、任何未完成的 closeout transaction、任何已存在的 v1 lease；
2. 存在任一 blocker 即拒绝启用，指向操作者先完成或释放旧流程；
3. 全部静止后写入 `protocol.json` 一次性标记，旧路径随即退役。

没有部分迁移，没有 steady-state fallback。

## fail-closed 收口（原文条款；落地缺口由 hardening work-package 关闭）

- `sprint claim` 等 v1 入口在发现旧 marker 但没有 v1 `protocol.json` 时必须 fail closed 并指向 init cutover。落地实现只在 `repo-harness init` 的 apply 路径检查（`src/cli/commands/init.ts`），绕过 init 直接 claim 不触发闸门；
- `protocol.json` 必须在 `adoptionApply` 成功之后写入。落地实现先写标记后 apply，中途失败会永久解除武装；
- `git` 二进制缺失必须是错误，不得静默跳过闸门。

三条缺口的关闭排入 `plans/plan-20260819-1519-coordination-lease-hardening.md`（T4/T5）。

## Rollback

WP-B 回滚前必须满足：

```text
无 active v1 lease
无 completing lease
无未完成 migration journal
```

否则回滚会令旧版本看不见 active Lease，再次允许重复领取。

---

# 十五、四个独立 Work Package

每个 WP 是独立 plan、contract、worktree、verification 和 target commit。

## WP-A：Coordination Protocol Contract

**目标：**冻结类型与不变量，不改变运行时。

主要内容：

* Task identity；
* Task revision；
* Lease schema；
* State machine；
* fencing；
* command contracts；
* board document schema；
* migration schema；
* crash/recovery语义。

建议文件：

```text
docs/architecture/modules/workflow-engine/shared-coordination-plane.md
src/core/coordination/task-lease.ts
src/core/coordination/board-types.ts
tests/task-lease-protocol.test.ts
```

通过条件：

* 纯函数测试；
* schema invalid cases；
* task reorder不改变 task ID；
* unrelated row completion不改变 task revision。

## WP-B：Shared Lease Atomic Cutover

**目标：**真正解决重复领取。

包括：

* common-dir Lease store；
* per-task lock；
* claim/bind/release/steal/reconcile；
* local claim projection；
* shared backlog lock；
* `start-task` 集成；
* inline completion；
* contract finish集成；
* finish journal coordination phase；
  -旧 marker一次性迁移；
  -退役 `--force`；
  -删除旧 in-flight steady-state路径；
* script/template mirror。

**不包括：**

* Board；
* Hook；
* metadata relocation；
* Attempt schema change；
  -性能 telemetry，除非已有标准 measurement surface可直接复用。

## WP-C：Deterministic Board Projection

依赖 WP-B。

包括：

```text
src/core/state/project-board.ts
src/effects/state/collect-board-inputs.ts
src/effects/state/resolve-board.ts
src/cli/commands/state.ts
```

以及：

```bash
repo-harness state board --json
```

只读，不产生 Lease mutation。

## WP-D：Hook Visibility and Early Guard

依赖 WP-B、WP-C。

包括：

* Codex SubagentStart slice；
* Claude Task/Agent spawn slice；
* conditional PreEdit Lease guard；
* Hook output budget；
* no SessionStart full board；
* no route tuple change。

## Deferred WP-E：Worktree Metadata Relocation

不排期。

只有当出现以下实测之一才重启：

* Board 跨 worktree读取 metadata 成为明确 p95 瓶颈；
* metadata local placement产生无法修复的一致性故障；
  -同一信息不得不在多个 worktree 重复写入。

当前 metadata selector 刚完成 authority hardening，不应和 Lease cutover绑在一起。

---

# 十六、必须通过的 Falsification Matrix

| 场景                                 | 必须成立                                          |
| ---------------------------------- | --------------------------------------------- |
| 两个 worktree 同时 claim 同一 Task       | 恰好一个成功                                        |
| Claim directory 建成、owner 写入前 crash | 显示 unknown/orphan preparation；不能被普通 claim静默覆盖 |
| Release 与 steal 同时发生               | 只有一个 token transition成功                       |
| Finish 与 steal 同时发生                | completing transition成功后 steal失败              |
| 旧 Agent 在 steal 后 release          | 不能删除新 Lease                                   |
| 旧 Agent 在 steal 后 finish           | fencing token拒绝                               |
| Task A 完成                          | Task B/C 的 revision不变                         |
| 其他 row 被修改                         | 当前 Task不 drift                                |
| 当前 Task Acceptance变化               | drift，finish失败                                |
| Row reorder                        | Task ID与 Lease保持                              |
| Task cell 改名                       | 旧 Lease drifted                               |
| Agent 死亡但 worktree仍注册              | 不自动 reclaim                                   |
| Worktree正式移除                       | reserved/bound 可 reconcile                    |
| Branch rename或 detached HEAD       | 不因 branch absence判死                           |
| completing worktree消失              | 要求 finish recovery，不自动清 Lease                 |
| Contract finish发布前 crash           | Lease恢复 bound                                 |
| 发布后、Lease release前 crash           | row done + residual Lease，可 reconcile         |
| Inline row更新后 release前 crash       | done + residual Lease，可 reconcile             |
| 同名任务出现在不同 Sprint                   | Lease隔离                                       |
| Task 名 slug-normalize碰撞            | Task ID不碰撞                                    |
| Legacy marker迁移中任一项失败              | 旧状态完整保留                                       |
| Board读取期间 Lease变化                  | retry 或 `changed_during_read`                 |
| Attempt ledger unreadable          | progress unreadable，不转移 ownership             |
| 新 generation使用同一 worktree          | `resumed` receipt重置旧 stall                    |
| 非 Sprint plan执行                    | 不受 Lease gate影响                               |
| Bash 绕过 PreEdit                    | 无有效 Lease仍无法 finish/publish                   |
| Claude 与 Codex spawn               | 获得语义等价 slice                                  |
| `SendUserMessage`                  | 不注入 Board slice                               |
| Script与 template mirror            | byte-identical                                |

---

# 十七、整体验证

每个 WP 除 scoped tests 外都执行：

```bash
bun test
bun run check:type
bash scripts/check-task-sync.sh
bash scripts/check-architecture-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

WP-B 额外：

```bash
cmp scripts/sprint-backlog.sh \
    assets/templates/helpers/sprint-backlog.sh

cmp scripts/contract-worktree.sh \
    assets/templates/helpers/contract-worktree.sh
```

以及真实 linked worktree race harness，不接受只在 mock filesystem 上验证 claim。

---

# 最终批准摘要

## Building

建立一个单机、单 clone、多 linked worktree 的共享 Agent 协调平面：

```text
Canonical Sprint
    ↓
task_id + task_revision
    ↓
fenced common-dir Lease
    ↓
worktree-bound execution
    ↓
contract finish / inline completion
    ↓
deterministic Board
    ↓
event-scoped Hook visibility
```

## Not building

不做网络服务、tracked Board、heartbeat、TTL、自动 preemption、自动并行调度、metadata relocation、Attempt schema重写或新 Hook route。

## 最关键决策

1. **Task revision 是单任务语义 revision，不是整份 Sprint revision。**
2. **Lease 只有执行所有权，没有完成权。**
3. **Contract task 只能由 `contract-worktree finish` 完成。**
4. **每次 steal mint 新 fencing token；旧 Agent 永远只持有旧 token。**
5. **所有 mutation 经过 per-task lock。**
6. **Worktree metadata v1 不搬。**
7. **Attempt ledger v1 不搬，Board只读 owner worktree 对应 ledger。**
8. **Hook 是 early guard；finish/complete 才是硬权威。**
9. **无 blind parallel `claim next`。**
10. **四个 Phase 改成四个独立 work-package。**

这份方案可以从 Draft 升格为最终架构；执行顺序固定为：

```text
WP-A Protocol
→ WP-B Shared Lease Cutover
→ WP-C Board Projection
→ WP-D Hook Integration
```

只有 **WP-B 完整覆盖 claim、bind、finish、inline completion、fencing 和迁移** 后，才算真正解决跨 worktree 重复领取。

---

# 落地状态与符合度修订（2026-08-19）

本方案在 main `f5f4d8ce`（plan `plans/archive/plan-20260818-1156-shared-lease-protocol.md`，其定稿早于本文一天）落地了 WP-A 全部与 WP-B 约 85%。对照本文逐条审查后的处置如下。

## 实现优于本文、以实现为准

- task_id / task_revision 用 JSON-array domain separation 代替 `\0` 拼接，抗分隔符伪造更强（`src/core/state/coordination-identity.ts`）；domain tag 为 `repo-harness-task-id` / `repo-harness-task-revision`，字段集与 §3.2/§3.3 一致；
- 状态机为 `reserving / bound / completing / released` 四态，`released` 显式命名 release 的 crash window；
- §14 迁移按修订后的 quiescent fail-closed cutover 执行；
- `unknown_reason` 八态列举与真 linked-worktree 竞态 harness（`tests/sprint-claim-concurrency.test.ts`）严于本文要求。

## HIGH 偏离，由 `plans/plan-20260819-1519-coordination-lease-hardening.md` 关闭

1. inline `complete-task` 在改写 row 前无 lease 闸门（违反目标 6 与 §9.4）；
2. `completing → steal` 未禁止（违反 §6 硬规则，现有测试曾把该分支 pin 为合法行为）；
3. owner record 缺 `generation` / `sprint.target_ref` / `finish_transaction_key`（§5/§10.3/§9.3 的输入；必须在首个 live lease 出现前补齐，否则升级为带迁移的 protocol bump）；
4. §14 fail-closed 收口三条（见修订后 §14）。

## MEDIUM/LOW 偏离，推迟到后续 WP（`tasks/todos.md` 有对应行）

- `events/<task-id>.jsonl` audit log（§4/§7/§8.4/§9.4）；
- reconcile 的 git-topology orphan 清理（§8.5）；
- `completing → bound` finish-abort 恢复与 reconcile 完成 finish journal（§9.3）；
- claim 前置条件 3：canonical worktree 对 sprint path 无未提交变化（§3.1）；
- bind 时 `resumed` receipt（§8.2，随 WP2 board 的 stall overlay 落地）。

## 单 clone 身份约束（v1 接受）

task_id preimage 含 `repoIdentity`（git common dir 绝对路径，`src/effects/state/coordination-canonical-source.ts`）：移动仓库目录会改变全部 task_id。v1 边界是单机单 clone，接受该约束；跨机演进按第一节的“额外投影输入”路线走，不改身份公式。

## WP 对照

| 本文 | 仓库编号与位置 | 状态 |
|---|---|---|
| WP-A + WP-B | WP1（`f5f4d8ce` 已落地）+ `plans/plan-20260819-1519-coordination-lease-hardening.md` | hardening 待执行；WP-A 冻结产物中 architecture module doc 与 board-types 随 WP2 补 |
| WP-C Board | WP2（`tasks/todos.md` read-only board projection 行） | 未动 |
| WP-D Hook | WP3（`tasks/todos.md` host-aware hook visibility 行） | 未动 |
| Deferred WP-E | WP4（conditional metadata relocation 行） | 不排期 |

## Addendum (2026-08-20): cross-machine coordination stays a projection-source seam

Ledger closure note: the deferred "cloud / cross-machine coordination" row was retired from `tasks/todos.md` as a design-decision record rather than deferrable work. The decision it recorded stays binding: WP1's correctness comes from git-derived, clock-free reclaim (worktree absence from `git worktree list` is the only reclaim evidence), and a pluggable lease store spanning machines would force that down to a TTL-lease consistency model. If a real multi-machine need ever appears, the forward seam is an additional projection input source (for example `gh pr list`) on top of the versioned `protocol: 1, kind: 'repo-harness-board'` envelope — never a swappable lease store.

## Delivery closure (2026-09-04)

The status table above is the 2026-08-19 point-in-time audit, not the current
delivery state. WP-A/WP-B hardening, WP-C Board projection, and WP-D Hook
visibility subsequently completed with passing archived reviews:

- `plans/archive/plan-20260819-1519-coordination-lease-hardening.md`;
- `plans/archive/plan-20260819-2109-wp2-board-projection.md`;
- `plans/archive/plan-20260820-0159-wp3-hook-visibility.md`.

WP-E remains deliberately unscheduled behind its measured-bottleneck trigger.
The remaining coordination residuals are owned by `tasks/todos.md`; they do not
make the A-D delivery incomplete.

The quick-read cards in the 2026-08-28 collaboration umbrella PRD and the
2026-08-30 R1 runtime PRD are also point-in-time planning snapshots. Their
current delivery authorities are the 11/11 `Done` rows and Execution Log in
`plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`,
the completed collaboration workstream, and R1 PR #230 (`4f7cb37e`). Phase 2
independent review and Phase 3 guarded merge remain explicitly deferred.
