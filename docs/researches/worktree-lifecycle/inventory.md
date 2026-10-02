# repo-harness worktree inventory

本次只读盘点，不授权删除或迁移。来源是 Git topology、目录扫描、远端 refs、GitHub PR 和本机 Herdr 实时状态；不是从名称猜测。

## 采样边界与结论

- 2026-10-03 04:31–04:35（Asia/Singapore）采样，记录时间：`2026-10-03T04:31:48.176817+08:00`。并行 agent 仍在工作，HEAD、PR 和 dirty 状态会继续变化，执行回收前必须重查。
- Git common directory：`/Users/chris/Projects/repo-harness/.git`。16 个 checkout = 1 个 main + 15 个 linked worktree；目录扫描发现相同的16个，没有同 clone 的未注册 `.git` checkout。
- 远端 main 与本地 `origin/main` 都是 `3e953f0b810f2c4612e2ebd606dbfdd8f4bcfe5f`。第一轮本地 main 是 `1d3c2f01`，第二轮已由其他会话推进至 `3e953f0b`；本研究没有更改 main。
- 用户指出 main 曾有未提交改动；本次两轮 `git status --porcelain=v1 --untracked-files=all` 为空。这个瞬时观察不撤销保护：main、所有明确指定的活跃树、开放 PR 一律不能回收。
- 1 个可安全回收候选、2 个只报告、13 个正在使用。另有1个非 worktree 历史目录，只报告。`git worktree prune --dry-run --verbose` 退出0且无输出，没有发现待 prune 元数据。
- “干净”指 tracked/index/untracked（不含 ignored）均为空。ignored 文件另行检查：`node_modules/` 可重建，其余 session、handoff、evidence、env 和未知内容必须先保留或审计，不能由 clean status 推断可丢弃。

## 复查命令与判定

```bash
GIT_OPTIONAL_LOCKS=0 git worktree list --porcelain
GIT_OPTIONAL_LOCKS=0 git -C <path> status --porcelain=v1 --untracked-files=all
GIT_OPTIONAL_LOCKS=0 git -C <path> ls-files --others --ignored --exclude-standard --directory
git merge-base --is-ancestor <head> <main-oid>
git ls-remote --heads origin
gh pr list --state open --limit 200 --json number,title,headRefName,headRefOid,url,isDraft
herdr session list
herdr api snapshot
/usr/sbin/lsof -a -d cwd -Fpn
git worktree prune --dry-run --verbose
```

目录扫描以 `~/Projects` 为根递归查 `.git` 文件/目录，不跟随 symlink，跳过 `.git` 内部、`node_modules`、build/cache、`_ref`、`_ops`；对命中目录运行 `git rev-parse --git-common-dir` 和 `git remote get-url origin` 核实身份，扫描没有权限错误。另列根层 `repo-harness*` 目录，以发现没有 `.git` 的残留。这里不宣称扫描了依赖缓存、秘密目录或 Projects 之外的 provider worktree。

“main 祖先”列以当时**远端 main 的精确 OID**为基准；本地 main 在采样中变化，故不混用。已推送检查用 `ls-remote` 当场返回的**同名分支 tip**，而非可能过期的 tracking ref；只有 HEAD 等于远端 tip 或可证明为其祖先才为“是”。远端新 tip 对象本地不存在时记“未知”，不猜。

Herdr 0.9.3：155个 session 条目中只有 `default` 为 running；对其 snapshot 的 pane `cwd` / `foreground_cwd` 做 canonical path containment 匹配。`idle` / `done` pane 仍占 cwd，不能删。“未见”只表示此次完整本机 snapshot 未命中；不是无会话、无使用者的绝对证明。`lsof` 退出0、无错误，对 baseline 未命中进程 cwd。明确活跃/开放 PR 的树，即使未命中 pane，也继续保护。

## 可安全回收

以下是**候选清单**，本次没有执行。baseline 无本地分支，无 PR、pane、进程 cwd、active-plan 或 Git lock；ignored 只有可重建的 `node_modules/`。没有 terminal task metadata 的旧树仅能在以后显式点名的 GC 中处理，不能被后台 sweep 自动认领。

补查 primary 的 `.git/repo-harness/coordination/v1/leases` 没有 lease 条目；baseline 对应的 `task-workspaces/<hash>` binding 目录不存在，`task-agents` 没有匹配 baseline 的未关闭 role。候选资格不靠“没有 pane”这一项单独推导。

| 目录（位于 `/Users/chris/Projects/`） | 分支 / HEAD | Git 状态 | main 祖先 | 同名远端已推送 | 开放 PR | Herdr pane / 保护原因 |
| --- | --- | --- | --- | --- | --- | --- |
| `repo-harness-wt-baseline-1d3c2f01` | `detached` / `1d3c2f01` | 干净 | 是 | 不适用；无同 tip ref | 无 | 未见；无进程 cwd、lock；仅 node_modules |

## 只报告

| 目录（位于 `/Users/chris/Projects/`） | 分支 / HEAD | Git 状态 | main 祖先 | 同名远端已推送 | 开放 PR | Herdr pane / 保护原因 |
| --- | --- | --- | --- | --- | --- | --- |
| `repo-harness-wt-archctx-maintenance-reminder` | `detached` / `4e4898c2` | 干净 | 否 | 不适用；无同 tip ref | 无 | 未见；不在 main 历史且未证明推送；detached；session/evidence 未保留 |
| `repo-harness-wt-release-preflight` | `codex/release-preflight-current` / `dc880782` | 干净 | 否 | 否（无同名 ref） | 无 | 未见；不在 main 历史且未证明推送；ignored release evidence |

## 正在使用

| 目录（位于 `/Users/chris/Projects/`） | 分支 / HEAD | Git 状态 | main 祖先 | 同名远端已推送 | 开放 PR | Herdr pane / 保护原因 |
| --- | --- | --- | --- | --- | --- | --- |
| `repo-harness` | `main` / `1d3c2f01` | 干净 | 是 | 是（HEAD 为 tip 祖先） | 无 | `w8:p3` (idle), `w8:pG` (idle), `w8:p7` (done), `w8:p4` (done), `w8:pC` (done)；main 永久保护 |
| `repo-harness-e1-selected-entrypoints` | `feat/e1-selected-entrypoints` / `3d66db7e` | 脏（2条） | 否 | 否（HEAD 不在远端 tip 历史） | [474](https://github.com/Ancienttwo/repo-harness/pull/474) | 未见；用户明确活跃；开放 Draft PR |
| `repo-harness-grok-oar` | `codex/grok-oar-phase2` / `92bb8d9a` | 脏（3条） | 否 | 否（无同名 ref） | 无 | 未见；用户明确活跃 |
| `repo-harness-grok-oar-d` | `codex/grok-oar-d` / `9eed9c72` | 干净 | 否 | 否（无同名 ref） | 无 | 未见；用户明确活跃 |
| `repo-harness-grok-worker` | `feat/grok-herdr-worker` / `92bb8d9a` | 干净 | 否 | 是（tip 相同） | [473](https://github.com/Ancienttwo/repo-harness/pull/473) | `w8:pD` (done)；用户明确活跃；开放 Draft PR |
| `repo-harness-retire-cross-review` | `codex/retire-cross-review-prep` / `fbf73ff2` | 脏（9条） | 否 | 否（无同名 ref） | 无 | 未见；用户明确活跃 |
| `repo-harness-sched-a` | `codex/dev-scheduler-a-slim` / `8d221242` | 干净 | 否 | 是（tip 相同） | [478](https://github.com/Ancienttwo/repo-harness/pull/478) | `w8:pH` (done)；用户明确活跃；开放 Draft PR |
| `repo-harness-sched-b` | `codex/kanban-read-only` / `3e953f0b` | 干净 | 是 | 否（无同名 ref） | 无 | `w8:pJ` (done)；用户明确活跃 |
| `repo-harness-sched-c` | `codex/campaign-inventory` / `8d304116` | 干净 | 否 | 是（tip 相同） | [479](https://github.com/Ancienttwo/repo-harness/pull/479) | 未见；用户明确活跃；开放 Draft PR |
| `repo-harness-sched-review` | `detached` / `bad25106` | 干净 | 否 | 不适用；有同 tip 远端 ref | 无 | `w8:pK` (done)；用户明确活跃 |
| `repo-harness-wt-gc-design` | `codex/worktree-lifecycle-design` / `3e953f0b` | 干净 | 是 | 否（无同名 ref） | 无 | `w8:pM` (working)；用户明确活跃 |
| `repo-harness-wt-herdr-generic-review-design` | `codex/herdr-generic-review-design` / `209b00d8` | 干净 | 否 | 是（tip 相同） | [476](https://github.com/Ancienttwo/repo-harness/pull/476) | 未见；用户明确活跃；开放 Draft PR |
| `repo-harness-wt-local-update-closeout` | `codex/local-update-closeout` / `3cea3d61` | 干净 | 否 | 是（tip 相同） | [477](https://github.com/Ancienttwo/repo-harness/pull/477) | 未见；用户明确活跃；开放 Draft PR |

## 需要保留的具体内容

- `repo-harness-e1-selected-entrypoints`（PR 474）：HEAD `3d66db7e`，远端/PR tip `7c5caec5`，本地不能证明它已在远端历史；2个 untracked 为 `.ai/harness/handoff/s4-coordinator-handoff-20261002.md` 与 `tasks/notes/20261002-1756-s4-architecture-job-and-brc10-investigation.notes.md`。还有 active-plan，保留。
- `repo-harness-grok-oar`：修改 `bun.lock`、`package.json`，新增 `tasks/workstreams/runtime-harness/mcp-sidecar/grok-oar-phase2.md`。其 HEAD 虽与 `feat/grok-herdr-worker` 的远端 tip 相同，不能把另一个分支的推送当成同名分支闭环；仍脏且被用户保护。
- `repo-harness-retire-cross-review`：8个 architecture projection/doc 文件及 `tasks/contracts/20261003-0117-retire-cross-review-r1.contract.md` 被修改，共9条；有 active-plan。
- `repo-harness-wt-herdr-generic-review-design`（PR 476）：Git clean / 已推送，但有 active-plan、handoff、review-design、verification evidence 等 ignored 内容，且用户明确活跃，保留。此树在调研中由 `cb91ab9d` 更新到 `209b00d8`，说明快照必须有时点。
- PR 477 对应 `repo-harness-wt-local-update-closeout`；PR 474 对应上述 S4 树；PR 476 对应上述 review-design 树，均已按 branch 精确关联。
- `repo-harness-sched-review` 是 detached `bad25106`，远端 `codex/development-scheduler-skill` tip 相同；它仍有 pane `w8:pK`，不能因 agent 已 done 而回收。
- `repo-harness-wt-archctx-maintenance-reminder`：detached `4e4898c2` 无当前远端同 tip；Git clean 不能代替提交和 ignored evidence 的保全。
- `repo-harness-wt-release-preflight`：`codex/release-preflight-current` 没有当前同名远端 ref；ignored `.ai/harness/runs/independent-release-preflight/` 不能丢弃。

16个 checkout 的 Git lock 检查均未发现 `locked` 文件；这不代替用户活跃声明、pane/lease/进程保护。

## 目录扫描补充：非 worktree

`~/Projects/repo-harness-workspace` 不在 `git worktree list` 中，本身没有 `.git`，包含6个 `iteration-20260612-*` 历史实验目录，递归扫描未发现关联 Git checkout。归“只报告 / 非 worktree”，不交给 Git GC，不按目录名前缀执行删除。

## 安全解释

可安全回收只表示采样时满足数据和使用条件，不代表已执行。现有 `contract-worktree cleanup --slug` 不覆盖 detached baseline，且会删除分支；不能为了处理 baseline 随便套 slug。后续统一 GC 应提供显式 exact-path scope，调用 Git 的非 force worktree remove，保留 branch ref，复查状态和使用者；详见 [PLAN.md](PLAN.md)。
