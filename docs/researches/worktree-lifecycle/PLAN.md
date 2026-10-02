# repo-harness worktree 生命周期调研与方案

> 2026-10-03；Aimpact 04:28 需求。研究基线：`origin/main 3e953f0b810f2c4612e2ebd606dbfdd8f4bcfe5f`。
> 本 PR 只交付研究与设计，未实现 GC、修改配置、删除/迁移任何 worktree 或分支。`worktree gc` 等下文标为“拟议”的命令现在不存在。

建议将**以后由 repo-harness 创建的任务 worktree**集中到 `~/.repo-harness/worktrees/<repo-key>/<task-slug>`，在既有任务收尾入口补上有界 GC。系统 tmp 只放可重建 scratch/fixture。Git topology、现有 task/claim/publication 与 Herdr binding 继续拥有各自事实，不新建 daemon、全局任务库或另一套 cleanup controller。

盘点见 [inventory.md](inventory.md)：首轮16个注册 checkout 中只有 `repo-harness-wt-baseline-1d3c2f01` 是安全候选；04:45复查时它已由并行操作移除，当前Projects的17个checkout没有安全候选。其余因使用中、明确活跃、开放 PR、脏树、未推送提交或未保全 evidence 而保留。下面是未来实施方案，不是这次删除授权。

## P1：真实边界与当前能力

| Authority / 入口 | 真实职责与证据 | GC 的复用边界 |
| --- | --- | --- |
| Git common directory、`git worktree list --porcelain` | Git 决定 checkout path、HEAD、branch、lock/prunable。`src/effects/git/worktree-topology.ts` 读取 topology；`src/effects/terminal/task-worktree.ts#taskRepository` 用 canonical common-dir 查 primary root | 拓扑是唯一 inventory authority；目录扫描只找残留，不取得删除资格 |
| `scripts/contract-worktree.sh` | `start_worktree` 创建/复用 checkout，`write_start_metadata` 在执行树 `.ai/harness/worktrees/<slug>.json` 写 branch、path、base_commit、started_at；`finish_worktree` 消费 acceptance、合入并调用 cleanup；`cleanup_worktree` 拒绝脏树/lock/错误 cwd，调用 runtime cleanup 后移除 checkout 和 branch | 扩展这一 actuator 的 exact-path、保留分支模式；不另外复制 destructive shell |
| `scripts/worktree-merge-lib.sh#worktree_merge_mode` | 共享 `ancestor / absorbed / unmerged` 判定；`absorbed` 是 conflict-free merge-tree 与 target tree 相同，用于 squash，**不等于 ancestry** | 展示现有合入事实；拟议 GC 只接受 `ancestor` 或实时远端可达证明，不把 `absorbed` 偷换成祖先 |
| `scripts/ship-worktrees.sh#cleanup_merged` | 已有 `--cleanup-merged --dry-run`，仅枚举配置 branch prefix 的合同树，接受 ancestor/absorbed；可选 `--discard-scaffold-only` 会丢弃内容 | 统一收尾触发与 GC 判断；GC 不使用 discard、force 或自动 branch deletion |
| `src/effects/terminal/task-session.ts`、`scripts/contract-worktree-runtime.ts` | `closeTaskAgent / cancelTaskAgent / cleanupTaskWorktree` 以精确 binding、PID identity、created/attached ownership 关闭资源；unknown/attached/extra panes 返回 cleanup_pending；workspace close 本身不删除 checkout | runtime 与 Git 回收分层，保留审计定位。没有 binding 不等于没有人在用 |
| `src/cli/mcp/coding-workspaces.ts` | MCP 已把 worktree 放 `REPO_HARNESS_MCP_WORKTREE_ROOT` 或 `REPO_HARNESS_HOME/mcp-worktrees`，登记 `mcp-workspaces.json`；cleanup 检查 dirty、merge、runtime，并在 async shutdown 后复查 identity | 复用已有 MCP 记录，不把两个 manifest 合并成新全局 registry；以后路径对齐新 root，旧路径由 Git/现有 metadata 识别 |
| task/claim/publication | `src/cli/commands/task-agent.ts` 的 close/cancel；`src/effects/state/coordination-lease-store.ts` 的执行 ownership；`src/cli/commands/campaign.ts` 的 exact cleanup receipt；ship/finish closeout journal | 只消费权威 terminal / owner 事实，不从 PR closed、目录 age 或 pane done 推导任务完成 |

现有 `.ai/harness/policy.json#worktree_strategy.worktree_dir_template` 写的是 `../{{repo}}-wt-{{slug}}`，但当前 `default_worktree_path()`（`scripts/contract-worktree.sh:360`）**直接计算 primary parent + repo name + slug，没有读取这个 template**。因此只改 policy 不会移动创建位置。已有 `start --path` 可以在后续实现前显式指定新位置，不需要先造 wrapper。

Capability 实查：`capability-resolver match --path scripts/contract-worktree.sh` 命中 `workflow-engine-contract-assets`，对应 [contract-assets architecture](../../architecture/modules/workflow-engine/contract-assets.md)；`src/effects/terminal/task-session.ts` 当前落 root，不能把提供的 automation-budget block 当成这项工作的边界。本次不改模型；eval fixture package 共用 evals capability 的提示与任务无关，留作单独语义审计。

**范围**：repo-harness 创建/明确管理的本机 linked checkout，以及显式点名的旧树。primary/main、其他 clone、Claude/Codex 自有 worktree、远端机器、未知目录、branch 删除、外部 transcript retention 均不由本 GC 接管。MCP、普通 contract、campaign 只共享安全判定与既有执行原语，不共享另一套任务状态机。

## P2：一个实际源码路径与堆积压力点

走读基线源码的默认任务路径（没有执行 start/finish/cleanup）：

1. approved plan 经 `plan-to-todo` 进入 `contract-worktree start`；输入 authority 是 plan、policy、Git HEAD。branch 取 prefix+slug；默认 path 取 `default_worktree_path()`，所以 primary 位于 `~/Projects/repo-harness` 时，任务树就放在 `~/Projects/repo-harness-wt-<slug>`。
2. `start_worktree`（约560–647行）检查 existing branch/tree；创建 `git worktree add ... -b ... HEAD`，canonicalize path，写 immutable base_commit/started_at。提供 Herdr endpoint 才调用 `registerTaskWorktree`；registration/bootstrap 失败保留 checkout，而非销毁不确定状态。
3. task-agent 在执行树启动；primary 的 `.ai/harness/runs/task-workspaces/<hash>` binding 哈希包含 common-dir 与**绝对 execution_root**（`task-session.ts:241`）。pane shell/foreground cwd 指向旧 path。路径是 runtime identity，不只是目录摆放。
4. acceptance/verification → `finish_worktree` → synthesized publication；合入后从 target primary 调用 `cleanup --slug`（`contract-worktree.sh:2225`）。cleanup 失败只报告 `merged; cleanup incomplete`，不重新 merge。
5. `cleanup_worktree`（2286–2482行）检查 target/cwd、branch merge mode、status、lock；先 runtime cleanup，再 `git worktree remove`，随后删 branch/metadata。某些 caller 能提供 exact head/target/merge identity；普通路径没有这种完整 fence。

所以“完全没有清理机制”不符合当前源码：**已有机制，覆盖和收尾调用不完整**。手工命名的 scheduler/Grok/review 树、`feat/*` 树、detached baseline 不一定经过 contract finish；PR/Draft 发布后的等待期不是 terminal；provider 退出不替 repo-harness 回收手工树。现有 batch 按 prefix 枚举也覆盖不了全部历史树。移到 home 只能解决 `~/Projects` 杂乱，不能解决生命周期漏口。

另一个重要边界：`cleanupTaskWorktree(..., true)` 虽不会 close workspace，但仍进入 `locked()`，可能创建短期 caller.lock；因此拟议 GC 的严格 read-only dry-run **不能直接拿这个函数当纯探针**。应读现有 binding/status/snapshot，把 lock/close 留在 apply actuator；不因此新增 provider控制面。

## 官方实现依据：Claude Code 与 Codex CLI

本机只执行 version/help/features/package metadata 检查，没有为测试创建 provider worktree。官方页面于2026-10-03读取，可能随版本更新；源码使用 commit permalink。

| 产品 | 放置及清理事实 | 出处 / 本机边界 |
| --- | --- | --- |
| Claude Code CLI 2.1.284 | `--worktree <name>` 默认 `<repo>/.claude/worktrees/<name>`，branch `worktree-<name>`。交互退出：干净匿名树自动回收，命名树先询问；有改动/新提交或不能检查时询问。`-p` 不作退出提示/清理 | [官方 Worktrees：创建与清理](https://code.claude.com/docs/en/worktrees#clean-up-worktrees)。本机 `claude --help` 有 `-w`；native npm 包 `@anthropic-ai/claude-code-darwin-arm64/package.json` 的版本为2.1.284，没有将私有 binary 当公开源码 |
| Claude subagent/background | 自建、带 ownership marker 的树按 `cleanupPeriodDays` sweep；脏、未推送、活动或 submodule 无法检查则保留。普通前台/manual Git 树不在 sweep 范围；活动树有 Git lock，进程已退出的 Claude自有旧lock可被其 sweep处理 | [官方后台 worktree retention](https://code.claude.com/docs/en/worktrees#clean-up-subagent-and-background-session-worktrees)。本机 help 另有 `claude rm <id>` 安全删除后台 session/worktree；本次未调用 |
| Claude scratch | macOS scratch 位于 `/private/tmp/claude-<uid>/...`，用于 session 临时内容；retention 与系统清理不等价于任意 Git checkout 保全 | [官方 .claude directory](https://code.claude.com/docs/en/claude-directory)。不要把 scratch 根当任务 worktree 根 |
| Codex CLI 0.160.0 | `--worktree` 创建 managed checkout；`WorktreeSettings::for_cli` 将 auto_cleanup_enabled 固定为 false；默认 root 为 `$CODEX_HOME/worktrees`，可读取已有 desktop worktree-root 设置。普通 `codex -C <repo-harness-path>` 使用已有树，不负责其 lifetime | [0.160.0 settings.rs](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/worktree/src/settings.rs#L28)、[exec 创建路径](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/exec/src/lib.rs#L463)。tag `rust-v0.160.0` peeled commit 是 `a956835d020762cb2b570053af06f643a11c0ecc`；本机 help确认 `--worktree`，`codex features list` 显示 `worktrees stable true` |
| Codex App，作为对照 | 默认同样 `$CODEX_HOME/worktrees`，通常 `~/.codex/worktrees`；managed树为 detached。默认保留最近15个，archive chat / 超数量触发清理；running、pinned、permanent不删；删除前有可恢复 snapshot | [官方 Codex App Worktrees](https://developers.openai.com/codex/app/worktrees)。这是 App 的 contract，不能归给 CLI，也不能假定 repo-harness 有同样 snapshot |

CLI 临时文件的局部 RAII/scratch 清理不证明 worktree 会回收；也没有查到 Codex CLI 对任意 OS temp 的统一 retention保证。本次只采用有源码/文档支持的 worktree contract，不猜临时目录清理时点。

## P3：位置选择、隔离与最小决策

可观察的是 Git/远端可达性、dirty、owner/lease、pane cwd、进程与终态；可控制的是新建位置、收尾触发、回收 actuator及过期阈值。核心不变量：**只有任务可失去的 checkout 被回收，任何未保存工作、活动 cwd 和不可验证对象都留下；age 不赋予删除权限**。

| 位置 | 持久性与 cwd | Sandbox / isolation | 结论 |
| --- | --- | --- | --- |
| macOS `$TMPDIR`、`/tmp` 类目录 | 系统可清理；丢 checkout后Git/pane/binding依旧可能指向消失路径；跨会话 resume无法保证 | 临时目录常可写，但配置可排除，不能以默认 write权限代替持久性 | 只给可重建 fixture/scratch，不给跨会话 task |
| `~/.repo-harness/worktrees/<repo-key>/<slug>` | 不受 OS temp retention 管理；仍需有界 GC。Git primary/common-dir继续留原位 | 启动于准确 execution root，并验证共享 `.git` 权限；跨根写入只授必要路径；不授整个 HOME | 选用；和provider自己的worktree分开 |
| 现有 `~/Projects/<repo>-wt-*` | 稳定但散落，容易漏收尾 | 现有会话可继续，不需立即搬家 | 旧活跃树留原位到终态；先改变新建再渐进迁移 |

Apple 明确 temporary directory 用于不需跨 launch保留的数据，清理时机不保证；本方案不假定“macOS固定几天清tmp”。[Apple File System guidance](https://developer.apple.com/documentation/foundation/using-the-file-system-effectively?changes=_8&language=objc)

Sandbox 的实际要求：

- Claude sandbox 默认允许 working directory、per-user temp及 `--add-dir`/additionalDirectories；额外根用 `sandbox.filesystem.allowWrite`。官方还明确 shared Git metadata 写入可支持 linked worktree。新任务应从准确树启动；已有会话切换/迁移要重建 launch配置。额外权限不会撤销 Claude worktree的main-checkout isolation。[Claude sandboxing](https://code.claude.com/docs/en/sandboxing)、[共享 Git metadata](https://code.claude.com/docs/en/worktrees#what-worktrees-share-with-the-main-checkout)
- Codex 用 `-C <exact-worktree>` 设置工作根；额外 writable path 用 `--add-dir` 或 `sandbox_workspace_write.writable_roots`。`exclude_tmpdir_env_var` / `exclude_slash_tmp` 可排除 tmp。必须验证 execution root与common `.git` 的实际权限，不靠路径名字或本会话的 danger-full-access推断别的 session。[Codex config reference](https://developers.openai.com/codex/config-reference)
- `CODEX_HOME` 隔离 Codex config/auth/session state及默认managed worktree位置，不改变Git topology，也不会自动隔离固定的 repo-harness root。隔离测试应显式设独立 `REPO_HARNESS_HOME` 和 exact worktree path；MCP还可设已有 `REPO_HARNESS_MCP_WORKTREE_ROOT`。这个隔离结论是路径关系推论，依据 [Codex home-dir源码](https://github.com/openai/codex/blob/44dd77b71e88c78295736bffd3dc3b684c13be6d/codex-rs/utils/home-dir/src/lib.rs) 与本repo `coding-workspaces.ts:110`。不复制真实 auth或配置到任务树。

创建位置只使用一个 repo-harness root authority：沿用现有 `REPO_HARNESS_HOME`，默认 `~/.repo-harness`，追加 `/worktrees`；`start --path` 保留显式override，MCP已有root override保留显式语义。`repo-key` 由 canonical Git common-dir身份的稳定hash决定，避免同名repo/不同clone碰撞；不同slug仍由已有task命名管理。新默认不使用 CODEX_HOME，不跟随每个provider改目录。废弃未被消费的 template配置时做一次性迁移并移除，不继续双authority；本次不动policy。

10x规模先失效的是逐树PR/network探测与依赖目录扫描，不是Git登记容量。一次读topology、一次`ls-remote`、一次所有开放PR和各运行Herdr session snapshot，再逐候选检查status；目录深扫仅inventory/迁移审计做。apply串行、单树失败不阻塞其他报告，不增daemon或新调度队列。

## 生命周期与回收条件

沿用 task终态与现有closeout，GC结果只是投影，不另起生命周期数据库：

| 现有事实 | 动作 |
| --- | --- |
| 已合入/显式放弃；owner与roles已关闭；符合全部安全条件 | 从primary执行有界GC；记录既有cleanup receipt/report |
| 任务完成但Draft/open PR待审；bound/completing claim、pane或进程仍使用 | 正在使用；保留 |
| abandoned但HEAD未在main且没有实时remote可达证明 | 只报告；不自动stash、commit、push或丢弃 |
| Git dirty、ignored有未保全数据、检查未知、metadata identity错 | 只报告；保持原物，不 repair/猜测后继续删除 |
| task证据缺失的旧树 | 默认只报告；以后显式 exact-path GC可表达operator处理意图，但仍不能绕过数据/使用保护 |

允许移除的必要条件：

```text
registered linked checkout of this exact Git common-dir
AND exact path is managed, or explicitly selected legacy path
AND terminal task / explicit legacy cleanup scope
AND not primary, current cwd (or its ancestor), locked or in-use
AND clean tracked/index/untracked + clean/inspectable submodules
AND ignored data is reproducible or its audit handoff is already preserved
AND (HEAD is ancestor of frozen main OID
     OR HEAD is reachable from freshly verified configured remote branch tip)
AND policy retention allows it
```

“未合分支只报告”的默认规则适用于活动任务、开放PR和未推送分支。**已显式放弃、干净、已推送且无使用者**是要求中OR条件的例外：可回收checkout，所有本地branch ref仍保留。开放PR即便已推送也不进入自动GC。

具体安全约束：

1. 远端证明不能只检查“有upstream”、`git branch -r`或PR状态。批量`ls-remote --heads <remote>`冻结OID；same-tip可直接证明，ahead tip需本地对象+ancestry证明，缺对象/权限/network失败记unknown。apply前重查远端没有删除/force-update、HEAD与main没移动。失败只报告；GC不为资格自动fetch/push。
2. squash合入后 branch通常不是main祖先。当前`absorbed`可供解释，但不能独自让新GC删除。满足同名远端推送证明时才可回收；远端branch已删且不满足ancestry的树继续报告。未来发布顺序应先本地回收再删除远端branch；本GC本身不删远端。
3. 一律保留本地branch ref，使“已推送但未合”不依赖远端永久保存；GC不变成branch清理器。detached树仅接受main ancestry，或显式管理的远端ref证明；不以commit-message/patch相似度判断。
4. dirty包括ignored以外的tracked/index/untracked及submodule变化。ignored env、`_ops`、session home、handoff、reports或未知文件也可能是唯一副本：先保全或报告；只允许既有policy明确的可重建产物（如node_modules）消失。只枚举路径不打印秘密内容，无`--force`、`--discard-scaffold-only`、`git clean`、`reset`或`rm -rf`fallback。
5. `done`/`idle`pane仍是使用者。遍历所有running本机Herdr endpoint的pane cwd/foreground cwd与workspace.checkout_path；同时查existing binding、claims和本机进程cwd。snapshot/进程检查不可用记unknown。用户明确活跃树继续保护，task完成不能撤销其他人的保留。
6. GC不关闭未知/attached pane。任务自己的close/cancel先沿用created ownership primitives，审计handoff包含task、HEAD、pane/session/endpoint及结果证据定位；workspace清理只能走既有`cleanupTaskWorktree`并读回。任何cleanup_pending阻断Git删除。
7. apply复用既有common-dir锁/closeout identity：runtime异步步骤后重新检查realpath/common-dir、topology、HEAD、target/remote、status和使用者；与task start/bind共享互斥边界，避免扫描后新任务占用。对不受repo-harness控制的手工pane，无法做原子全局占用锁；保守跳过不明使用，最终non-force Git remove保留Git dirty/lock保护，不宣称可阻止任意外部程序竞态。

最坏情况下（远端不可达、并行agent改HEAD、出现新pane、脏文件、丢失binding），任何必要条件未知或变化都使candidate变为report/cleanup_pending；年龄不绕过它。动作只作用于复查后的exact path，branch ref保留。因此这组条件在既有协调范围内足以避免把年龄或结束提示误当可丢弃工作；外部无协作写入的竞态仍是明确限制。

## 拟议命令、触发与过期策略

```bash
# 以下为拟议接口，不是当前可运行命令
repo-harness worktree gc --repo <primary> --dry-run --json
repo-harness worktree gc --repo <primary> --path <exact-linked-path> --dry-run
repo-harness worktree gc --repo <primary> --older-than 7d --apply
```

- 无`--apply`等同dry-run；JSON给`path, branch, head, target_oid, remote_ref/tip, terminal, age, usage, disposition, reasons, planned_action`。unknown显式列原因；读完inventory退出0，探针失败退出1但仍输出其余行；apply遇阻退出非0并给逐树结果。
- 默认scope只读本repo Git topology中的管理树。`--path`支持显式旧树，但不接受primary、symlink、foreign common-dir或unregistered目录；不提供`--all-projects`、模糊前缀删除、`--force`。
- dry-run严格不写：不fetch、不repair、不prune、不建cleanup lock/receipt、不关闭pane。`prune --dry-run`只预览另列。apply只使用`git worktree remove <exact path>`，保存branch；缺目录由prune处理，不递归“顺手删残留”。
- 终态记录来自已有task/closeout metadata。需要retention时在原有worktree metadata加唯一`terminal_at`字段，由终态owner写；没有可信timestamp不拿目录mtime/commit date代替。新建metadata不是第二个task状态authority；terminal类型仍读已有task记录。
- closeout即时收尾可在owned runtime已退出、审计保全后回收本任务；从primary运行，不能删除仍被当前shell/pane占用的自身目录。若当前shell未离开，报告pending，后续primary收尾调用重试。
- catch-up GC默认终态满7天，阈值拟议可配置；30天以上仍blocked只提高报告可见性，永远不强制删除。7天是便利性取舍，不是安全证明。放弃与合入都走同一predicate，time alone不将任务判成abandoned。
- 自动动作复用finish/cancel的primary收尾调用；Start/Stop只投影候选和pending，不在通用hook中做无界破坏性扫描。远端merge由下一次已有primary任务收尾/显式GC重新读取权威PR/task终态，不新建polling daemon；没有本机调用时不承诺准时清理。
- 保留Git标准`worktree prune`：apply末尾仅清理**缺失且满足Git expiry、未lock**的登记；沿用Git已有`gc.worktreePruneExpire`，不默认`--expire now`。prune不删除存在的checkout，也不删除branch；不把它当disk GC。[Git worktree手册](https://git-scm.com/docs/git-worktree)

实现接缝是小的：新增CLI facade调用现有cleanup actuator；将actuator的runtime/Git移除部分用于exact-path/keep-branch模式，并共享上述资格判定。当前`cleanup --slug`会删branch、允许absorbed，exact模式要求真实merge；MCP cleanup也会删branch且有后续rmSync。因此**不能原样调用并声称符合新设计**，需在这些现有入口提供同一安全模式，旧manual merge semantics不作为GC资格fallback。新GC模式同时支持feat分支和detached，campaign原有receipt contract不能被悄悄改形。

## 现有树迁移步骤（未来操作，本次未执行）

1. 先重新采样[清单](inventory.md)，固定保护main、用户所列活跃树、474/476/477及其他open PR。记录exact HEAD、branch、dirty、ignored evidence和pane/session定位。首轮baseline候选已在04:45复查中消失；不能复用历史候选清单执行删除。
2. 先部署新建位置：验证`start --path <new-root>/<repo-key>/<slug>`及MCP已有root override的真实入口；等默认创建逻辑和policy单authority落地再推广。现有活跃树继续使用原位置直至终态，避免在线迁移与compatibility symlink。
3. 终态安全树直接GC，不为即将删除的树搬家。脏/未推送/活动树只报告。还有长期保留需求且干净、未使用的树，才做一次性migration；open PR须在其owner关闭本机使用后再单独安排。
4. 迁移前在既有owner/closeout互斥范围冻结该树；保存审计材料到primary既有handoff/evidence位置，保留schema中历史execution_root。不修改签名receipt或旧binding来伪装历史路径。
5. 使用`git worktree move <old-exact-path> <new-exact-path>`，不用filesystem mv/copy或symlink；main/带submodule/locked树按Git限制只报告，禁止force。move更新Git登记，但不会更新Herdr cwd、工具绝对路径或session history。[Git move/repair文档](https://git-scm.com/docs/git-worktree)
6. 在同一暂停窗口更新现有worktree metadata里的live path、MCP state中exact record，并通过原task bind/register入口生成新incarnation；旧Herdr binding的hash包含execution_root，必须先按created ownership关闭旧incarnation，attached workspace未解除则不搬。重新启动pane cwd和sandbox授权；重新验证真实shell/foreground cwd、新common-dir、HEAD、branch、status及resume。失败禁止启动任务，保持pending；Git move未完成之外的失败不能自动宣布“迁移完成”。
7. rollback只在树仍无使用者且destination状态未变时用Git move返回，重新绑定旧path。保留migration审计，修复配置引用后再释放owner暂停；不要写稳态old→new双路径fallback。
8. 最后单独preview `git worktree prune --dry-run --verbose`；执行沿Git expiry，仅收缺目录元数据。`repo-harness-workspace`这种无Git登记的旧实验目录单独报告，不进入本流程。

## 后续实现的有界验收面

这份研究不创建execution plan/contract，不在本次把方案变成代码。实现单元只覆盖“统一新建root + exact、安全、保留branch的GC + terminal触发”，迁移实际资产单独运行。新增依赖为0；本PR仅2个请求的Markdown文件；未来CLI facade服务用户命令，shared predicate服务contract/MCP实际两个consumer，不引入新package/控制面。

应扩展现有`tests/contract-worktree.test.ts`、`tests/contract-worktree-squash-cleanup.test.ts`、`tests/ship-worktrees.test.ts`与MCP/task runtime测试，不新造benchmark。覆盖：clean ancestor、terminal pushed-unmerged但保留branch、dirty/untracked/ignored-secret/submodule、open PR、pane done/unknown/attached、lock、foreign path、detached、远端deleted/force-push/network失败、async后HEAD变化、自身cwd、missing目录prune、严格dry-run无写、kill后pending重试及CODEX_HOME/REPO_HARNESS_HOME独立。所有测试使用 `--timeout 60000 --max-concurrency 1`。

本次文档验证按[仓库Testing Policy](../../reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards)选择projection/完整性检查和已有architecture-sync测试；不运行会创建/移除linked worktree的fixture，以遵守本次边界，不把已有测试通过当成未来GC实现验收。具体执行结果在下文登记。

## 本次实际验证结果

2026-10-03在本设计worktree执行；9项仓库required checks全部退出0，focused测试9 pass / 0 fail / 56 assertions。依赖仅用 `bun install --frozen-lockfile --ignore-scripts` 补齐当前树被忽略的node_modules，package.json/bun.lock未改；没有运行任何创建/移除worktree的测试。

| 命令 | exit / 结果 |
| --- | --- |
| `bun run check:hooks` | 0 |
| `bun run check:helpers` | 0 |
| `bun run check:reference-configs` | 0 |
| `bash scripts/check-deploy-sql-order.sh` | 0 |
| `bash scripts/check-architecture-sync.sh` | 0 |
| `bash scripts/check-task-sync.sh` | 0 |
| `bash scripts/check-task-workflow.sh --strict` | 0 |
| `bun scripts/inspect-project-state.ts --repo . --format text` | 0 |
| `bun src/cli/index.ts init --repo . --dry-run` | 0 |
| `bun test tests/architecture-sync.test.ts --timeout 60000 --max-concurrency 1` | 0；9 pass，0 fail |
| `git diff --check` | 0 |

`init --dry-run` 给出 source checkout owns its surfaces 的 low warning、0 operations；inspector为audit，drift_signals/required_decisions均none。task-sync判本次没有需同步的substantive repo changes；本PR保持只含请求的研究文档，不额外创建tasks/plan/contract。检查证明文档分支完整性，不证明未来GC已实现。
