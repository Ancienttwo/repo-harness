# Shared Coordination Plane

> **状态**:WP1 lease 协议 + WP2 board 投影已落地(2026-08-19)
> **协议**:`repo-harness-lease-owner` v1、`repo-harness-board` v1
> **权威**:`src/core/state/coordination-identity.ts`、`src/effects/state/coordination-lease-store.ts`、`src/core/state/project-board.ts`
> **CLI**:`repo-harness sprint <identify|claim|bind|begin-completion|release|steal|reconcile>`、`repo-harness state board --json`
> **设计来源**:`docs/researches/20260819-GPT-kanban.md` §3-§12

本文是人工撰写的跨模块契约文档,不是 ArchContext capability 投影,所以它住在
`docs/architecture/` 根目录、与 `effective-state-authority.md`、
`global-hook-runtime.md`、`transactional-adoption-planner.md` 同列,而不在
`docs/architecture/modules/` 下。后者是 capability 派生的封闭集合:路径由
capability 的 domain 与 name 算出(`scripts/capability-config.ts`),不属于任何
capability 的 `.md` 会被 `scripts/capability-resolver.ts` 判为 orphan,数量与
生成形状还被 `tests/architecture-projection-e2e.test.ts` 钉死。共享协调面横跨
`src/core/state/`、`src/effects/state/`、`src/effects/git/`、`src/cli/commands/`
四个顶层区域,不是单一 longest-prefix 边界,因此也不该为它 mint 一个 capability
node。

> **事实优先级**:源码 > 本文。冲突时以源码为准,并提一次 architecture drift request。

共享协调面(shared coordination plane)是一个 clone 的所有 linked worktree 共用的
所有权与可见性契约。它回答两个问题:谁在做哪一行(WP1 的 lease 协议),以及
外部观察者如何在不加锁的前提下看到全局(WP2 的 board 投影)。

## 1. 权威边界

| 数据 | 唯一权威 | 位置 |
| --- | --- | --- |
| 任务定义与完成状态 | canonical ref 上的 sprint 文件 | `git show <target_ref>:<sprint_path>` |
| 执行所有权 | lease owner record | `<git-common-dir>/repo-harness/coordination/v1/leases/<task-id>/owner.json` |
| 互斥 | 目录锁 | `<git-common-dir>/repo-harness/coordination/v1/locks/` |
| worktree 拓扑 | `git worktree list --porcelain` | git 自身 |
| 进度证据 | owner worktree 的 attempt ledger | `<owner-worktree>/.ai/harness/runs/continuation/attempts.jsonl` |

board 只读上述五者,不读 worktree metadata,不取 task lock。

## 2. 身份公式

两条推导都在 `src/core/state/coordination-identity.ts`,digest 为 `sha256` hex,
preimage 是 `JSON.stringify(<string[]>)` —— 数组的 JSON 编码即 domain separation,
每个字段都被引号包裹并转义,任何字段值都无法把分隔符伪造进另一个字段位置。

```text
task_id       = sha256(["repo-harness-task-id", protocol, repo_identity, sprint_path, task_cell])
task_revision = sha256(["repo-harness-task-revision", protocol, task_id, mode_cell, acceptance_cell])
```

`task_id` 排除行号:删除或重排第 1 行会改写它下面每一行的身份,把在用 lease
孤儿化成不可达目录,同时让同一批任务以新 id 重新可领。
`task_revision` 排除 Status 单元格:兄弟行完成会重写 sprint 文件,若 revision
随之移动,每一个并发 claim 都会被判定漂移,并行执行就不可能了。

`repo_identity` 是解析后的 git common directory —— 一个 clone 的所有 linked
worktree 共享它,这正是协调面的作用域;跨 clone / 跨机器协调在 v1 之外。

## 3. 四态机与 fencing

持久化状态(`PERSISTED_LEASE_STATES`)只有四个,`available` 是「没有 lease」这一
事实由 store 分类得出,不写盘:

```text
available --claim--> reserving --bind--> bound --begin-completion--> completing
                          |                 |
                          +----release------+--> released --(目录移除)--> available
                          |                 |
                          +-----steal-------+--> reserving(generation + 1, stolen_from 有值)
```

- `completing` 拒绝 steal:publication 可能已经落地,steal 会抹掉那个窗口标记。
- `release` 只接受 `reserving` / `bound`:从 `completing` 释放无法判断 publication
  是否成功,那是 canonical row 的权威,由 `reconcile` 读。
- `released` 先durably 写盘再删目录,所以 release 中途崩溃留下的是一个具名可
  reconcile 的状态,而不是一个歧义状态。

fencing 是 `claim_id` + `generation`。`claim_id` 说现在谁拥有;`generation` 说
之前有过几个拥有者 —— 这是抢占链需要的,也是陈旧读者无法靠重新 mint 一个 uuid
伪造的。每一次所有权变更都在该任务的锁内完成读-比较-写,因为裸的
compare-and-mutate 仍然是 TOCTOU。

### 已知 caveat:`begin-completion` 的 `?? null`

`beginCompletionSprintCommand` 把 `options.finishTransactionKey ?? null` 写入记录:
不带 `--finish-transaction-key` 重跑一次 `begin-completion`,会把已经盖上的 key
清成 `null`。目前无害(该字段还没有消费者,closeout key 可确定性重新推导),
必须与「让 reconcile 读该字段」的那个 work package 一起修。已在
`tasks/todos.md` 的 WP1 residual 行登记。

## 4. Board 输入集合与 revision 语义

`src/effects/state/collect-board-inputs.ts` 是唯一做 IO 的层,收集四个维度并各
出一个 digest,再合成一个 composite:

| 维度 | 输入字节 |
| --- | --- |
| `task_authority` | target ref、canonical commit、sprint path、`git show` 出的 sprint 全文 |
| `coordination` | 本 sprint 每个 `task_id` 的 owner record **原始字节**、分类、`unknown_reason` |
| `topology` | `git worktree list --porcelain` 的原始输出 |
| `evidence` | 每个 owner worktree 的 attempt ledger 原始字节、`progress_token`、不可读原因 |
| `board` | 上面四个的 domain-separated 合成 |

digest 哈希的是字节,不是解析后的对象:解析会丢掉「同一语义、不同字节」这一
区别,而那正是并发写入的可观察信号。

只读本 sprint 的 lease(不扫描 leases 目录),因为 board 的作用域是单个 sprint,
目录扫描会把别的 sprint 的残留拉进来并报成本 sprint 的异常。

`resolveEffectiveStateReadOnly(ownerWorktree, nowMs, {targetPaths: [], operationKind: 'inspect'})`
是 `progress_token` 的唯一来源 —— 它是 `evaluateAttemptStall` 唯一接受的输入形状,
不存在第二套 stall 规则。`StateResolutionUnstableError` 不被吞掉:记
`progress_unreadable_reason: 'owner_state_unresolvable'`,进度维度降级为
`unreadable`,所有权字段一个不动。

## 5. `changed_during_read` 信任边界

```text
收集 A -> 投影 -> 收集 B
A.revisions.board == B.revisions.board  -> stable
不等                                     -> 整轮丢弃,重跑一次
第二轮仍不等                             -> 用第二轮 A 侧的 revisions,标 changed_during_read
```

只比较 sprint revision 是不够的:sprint revision 恒为 R、而 owner 从 A 翻到 B 的
撕裂读会被报成 `stable`。composite 覆盖协调、拓扑与证据三个维度,正是为了让这种
撕裂可见。

**信任边界**:`changed_during_read` 的 board 仅供诊断。`claim`、`steal`、`release`、
`begin-completion` 一律不得信任 board snapshot,必须在各自的 task lock 内重新读
权威。board 从不加锁,这是它可以在任意时刻被任意数量的观察者调用的代价与前提。

## 6. 三维状态分离与列优先级

```text
task_state     pending | done | missing | drifted        权威 = canonical row
lease_state    available | reserving | bound | completing | released | unknown
                                                          权威 = owner record
progress_state not_observed | active | stalled | unreadable
                                                          权威 = attempt ledger(仅证据)
```

列优先级固定为 `done > blocked > doing > todo`:

1. `task_state = done` 无条件进 `done`。残留 lease 不改变列,只加
   `lease_cleanup_required: true` 与一条可执行的 `actions.reconcile`。
2. `blocked`:lease `unknown` 或 `released`(它确实阻断 claim,`claim` 只接受
   `available`)、`task_state` 为 `drifted` / `missing`、`progress_state = stalled`、
   worktree 已离开拓扑、或 owner record 的 `target_ref` 与本次 board 的 canonical
   ref 不符。
3. `doing`:lease 为 `reserving` / `bound` / `completing` 且无上述阻断。
4. `todo`:其余(pending 行 + 无 lease)。

`orphaned` 不是一个 lease 状态,而是拓扑推导:`reserving`/`bound` + 记录的 worktree
已不在 `git worktree list` + 无 finish transaction,才是 `orphan_reclaimable`。
board 只报告,不自动 release、不自动 steal、不自动 reclaim。

`stalled` 只是 evidence overlay,永不转移所有权。证据不可读时(ledger 坏、owner
state 不可解析)`claim` / `lease_state` / `column` 与可读时逐字段相同。

## 7. bind 时的 `resumed` receipt

`bindSprintCommand` 在写入 bound owner record **之前**,先向执行 worktree 的
attempt ledger 追加一条 `outcome: 'resumed'` 的 receipt。

理由:`evaluateAttemptStall` 反向遍历本 unit 的 receipt,遇到非 `completed` 即中断。
没有这条 receipt,steal 后重新 bind 的新 owner 会继承上一个 claim 的连续
no-progress receipt,board 第一次读就报一个假的 `stalled`。

顺序是铁律:append 失败则 bind fail-closed —— lease 停在 `reserving`,调用方既有的
`rollback_claim` 路径负责收拾。反过来(先写 owner record 再 append)会留下一个
已经 bound、却带着旧 claim 停滞计数的 lease。一次失败 bind 留下的孤儿 `resumed`
receipt 是无害的:它只会清掉一次停滞计数。

## 8. 相关文件

| 关注点 | 文件 |
| --- | --- |
| 身份与 owner record schema(纯) | `src/core/state/coordination-identity.ts` |
| lease 文件系统原语 | `src/effects/state/coordination-lease-store.ts` |
| canonical sprint 读取 | `src/effects/state/coordination-canonical-source.ts` |
| 所有权动词 | `src/cli/commands/sprint.ts` |
| board 文档类型 | `src/core/state/types.ts` |
| board 投影(纯) | `src/core/state/project-board.ts` |
| board 输入收集(IO) | `src/effects/state/collect-board-inputs.ts` |
| board 一致性解析 | `src/effects/state/resolve-board.ts` |
| worktree 拓扑读取 | `src/effects/git/worktree-topology.ts` |
| CLI 动词 | `src/cli/commands/state.ts`(`state board --json`) |
| 设计来源 | `docs/researches/20260819-GPT-kanban.md` §3-§12 |
