# Sprint: Architecture Doc Truth Loop: queue engine, freshness gate, productization

> **Status**: Done
> **Slug**: architecture-doc-loop
> **Created**: 2026-06-12 02:56
> **Updated**: 2026-06-12 06:17
> **Source Spec**: `docs/spec.md`
> **Source Research**: `docs/researches/20260612-architecture-doc-truth-loop.md`
> **Source Plan**: `plans/archive/plan-20260612-0255-architecture-doc-truth-loop.md`(程序级规划记录;并发会话的 verification-blocker 清理将其连带 todo 投影归档——active-plan 槽位只属于带 contract 的执行 plan。本 sprint 即执行权威,每行任务经 start-task 捕获自己的 slice plan)
> **Goal Mode**: incremental

Program-level sprint container. The PRD and ordered backlog decompose product
intent into task-contract slices; each backlog task executes through the
existing plan -> contract -> worktree -> verify flow. `tasks/todos.md` stays the
deferred-goal ledger and never carries this backlog.

执行序位(2026-06-12 03:32 现实修正):`loop-engine-01` 已先行提交为
`ff13087 Add loop engine state snapshot`,因此本 sprint 不再声明"先于
loop-engine-01"这个历史意图。当前执行入口是 dedicated linked worktree
`/Users/chris/Projects/agentic-dev-wt-arch-doc-loop-01-queue-engine-triage`
上的 slice 1;active-sprint 标记仍可指向 loop-engine(one-active-sprint
不变量),本 sprint 经 `scripts/sprint-backlog.sh start-task --sprint plans/sprints/20260612-0256-architecture-doc-loop.sprint.md`
显式覆盖操作。不得从 primary dirty tree 启动或完成本 sprint。

## PRD

### Problem

- `docs/architecture/*` 写入端完整(post-edit hook → drift record → request/index/events),但**消费端不存在**:27 个 pending request 自 2026-05-28/29 堆积两周;`docs/architecture/index.md` 受控段已损坏(`## Pending Requests` 显示 "(none)",29 条含重复条目落在 `## Review Backlog` 段下)。
- 根因(已验证):无锚点 append-to-EOF(`architecture-drift.sh:456`);`prune_superseded_pending_lines` 于 2026-06-10(`a4ad852`)引入、晚于 backlog 形成且只删行不归档;并发 PostToolUse 竞态产生同秒重复行。
- 方向(已批准,经 Codex 两轮外部评审收紧):per-capability dirty card + 全派生 index + 切片关账门禁(advisory→strict);**单一 queue CLI(`architecture-queue.sh record|status|reindex|triage|check`)拥有 request/card/index 完整契约,`architecture-drift.sh` 被吸收删除**。"真相来源"靠门禁强制;"及时" = merge 时文档与代码同变更集落账,不做 per-edit 写文档。

### Users

- 本仓库维护者(self-host dogfooding):日常经 plan→contract→worktree→verify 流程执行的人与 agent。
- 下游 generated repos 维护者:slice 3 经 `assets/` 镜像下发同一闭环,下游默认 `freshness_gate:"advisory"`。

### Success Criteria

- 真实 backlog 清零:`triage --before 2026-06-01` 后 27 legacy → 4 capability 卡;agent resolve pass 后 `docs/architecture/requests/` 根目录清零、根契约 pending marker 清除。
- `architecture-queue.sh reindex --check` 进根 Required Checks 后持续通过;index 受控块与 requests/ 目录扫描恒一致(测试锁定)。
- advisory 跑满一个 slice 后,门禁警告信噪比支持 config-only 翻 strict(否则触发 falsifier,改道而非硬上)。
- 下游新 scaffold 自带闭环:标记 index、advisory policy、两个新 helper 脚本(scaffold-parity 锁定);`architecture-drift.sh` 进下游 retired-removal 清单。
- 研究面迁移完成(用户补充的架构决策):`docs/researches/*` 成为研究报告唯一权威面,`tasks/research.md` 变 tombstone 指针,ResearchGate 按新面判新鲜,全仓无活跃旧引用。

### Acceptance Scenarios

- 维护者编辑 `.ai/hooks/*.sh`:post-edit 链路在 `requests/runtime-harness-hook-adapters.md` upsert 同一张卡(不新增文件),index 受控块单行更新;并发编辑收敛为幂等重写,无重复行。
- 维护者 finish 一个触碰 workflow-surface 的 worktree:advisory 模式打印 pending 卡警告并指向 `repo-harness-architecture` resolve 协议后继续;strict 模式阻断直至卡片归档;strict 下 queue/resolver 缺失同样阻断(fail-closed)。
- 维护者跑 `triage --before 2026-06-01`:legacy per-file requests 收敛为 per-capability 卡,被并成员以 Superseded 入 `requests/archive/2026/`,index 自愈;cutoff 之后的新近 pending 列出但不动。
- session-start 输出一行 "N capabilities have pending architecture drift (oldest Xd)"。

### Non-goals

- 不让 hook 自动重写 module prose、snapshot 或 diagram(铁律:hooks record drift; agents author)。
- 不做 per-edit agent 文档生成;不在 PostToolUse 硬拦(block 只在 finish/check)。
- 不新增 service 或后台 daemon;不抽 `scripts/lib/architecture-lib.sh` 共享库。
- 不改 `loop-engine` sprint 内容;不动 `domains/` 文档结构;不做架构文档自动进 gbrain。

## Architecture Notes

### Capabilities Touched

- `workflow-engine/contract-assets`(`.ai/harness/policy.json`、两份 workflow-contract、`package.json` script)
- `runtime-harness/hook-adapters`(`.ai/hooks/` 与 `assets/hooks/` 的 post-edit-guard、session-start-context;`[ArchitectureDrift] Request:` stdout 契约)
- `verification/evals-checks`(`tests/`、`check-task-workflow.sh`、新 `check-architecture-sync.sh`)
- `workflow-engine/inspection-migration`(`scripts/lib/project-init-lib.sh`、`assets/templates/helpers/`、retired-removal 清单)
- `public-surface/root-router`(slice 2 的 Required Checks 增项、slice 4 的 Canonical Workflow Files 改写触碰根 `CLAUDE.md`/`AGENTS.md`)
- 注:`scripts/architecture-*.{sh,ts}` 目前不在任何 capability prefix 内(落 root);slice 3 可顺带把它们纳入 `contract-assets` prefixes(可选,不阻塞)。

### Dependency Order

- 串行:01(queue engine + triage 清账)→ 02(门禁 + 表面)→ 03(产品化 assets)→ 04(研究面迁移;依赖 03 的 retired-removal 与契约同步机制,避免双线改 assets)。
- 硬约束:slice 3 之前不得对本仓库跑 `migrate-project-template.sh --apply`(旧 `assets/templates/helpers/` 会覆盖新 `scripts/`);hooks 字节 parity 测试把 post-edit-guard 镜像锁进 slice 1、session-start 镜像锁进 slice 2。
- 相对 loop-engine:`loop-engine-01` 已先提交;本 sprint 从 slice 1 开始补齐
  architecture queue 闭环,后续 loop-engine hook/runtime 改动应等本 sprint
  至少完成 01/02 后再继续,避免继续制造未消费的 architecture drift。

### Risks

- **advisory 误报高频** → 先调 `gate_min_severity`;仍高则触发 falsifier①(分类模型),改道而非强行翻 strict。
- **单卡聚合互不相关改动** → falsifier②:per-capability 过粗,后续引入 plan/slice 维度切卡,v1 不预先复杂化。
- **`archive-architecture-request.sh` 零改动假设** → 已审计仅解析 `> **Status**:` 行;测试 5(archive 往返)锁定;若实测不兼容,允许小改但保持 CLI 不变。
- **下游无常驻 agent,卡只积不清** → 下游默认 advisory;若仍噪音,产品化默认改 off(文档化 opt-in)。
- **bun 缺失环境** → record 降级 WARN 跳过卡片更新(events.jsonl 仍写入),不做 bash 双实现;strict/check 场景 fail-closed。

## Backlog

Ordered execution queue; keep rows in dependency order. Mode `contract` runs
the full plan -> contract -> worktree flow; `inline` allows primary-tree
execution for small tasks. Every row needs a concrete acceptance line.

| # | Status | Task | Mode | Acceptance | Plan |
|---|--------|------|------|------------|------|
| 1 | [x] | arch-doc-loop-01-queue-engine-triage | contract | 新 `scripts/architecture-queue.sh`(record/status/reindex/triage/check;record 吸收 architecture-drift.sh 后将其删除,输出保持 `[ArchitectureDrift] Request:` 前缀);`.ai/hooks` 与 `assets/hooks` 两份 post-edit-guard.sh 改调 queue record 且 hooks parity 测试绿;card merge/JSON/渲染在 architecture-event.ts(bun 缺失 record 降级 WARN);policy 新增 freshness_gate=advisory/gate_min_severity/pending_block_begin/end/queue_script;tests/architecture-queue.test.ts 五组(dedup-merge/reindex 幂等自愈/triage cutoff 幂等/门禁三模式含 strict fail-closed/archive 往返)全绿;真实 backlog:`triage --before 2026-06-01` 后 requests/ 仅 4 张卡、27 条 Superseded 入 archive/2026/、`reindex --check` exit 0;agent resolve pass 后 requests/ 清零且根 CLAUDE.md/AGENTS.md pending marker 清除;bun test 与根 Required Checks 全绿 | plans/plan-20260612-0318-arch-doc-loop-01-queue-engine-triage.md |
| 2 | [x] | arch-doc-loop-02-freshness-gate-surfaces | contract | contract-worktree.sh finish 在 verify-sprint 前调用 check_architecture_freshness(merge-base diff ∪ porcelain → capability-resolver `match --paths-from -` 批量 → 与 ≥gate_min_severity 开卡求交);off/advisory/strict 行为有测试(0/0+警告/exit 1),strict 缺 queue/resolver 阻断、advisory 缺依赖放行+WARN;新 scripts/check-architecture-sync.sh 进根 Required Checks 且 package.json 增 check:architecture-sync(完整性恒硬失败、新鲜度仅 strict 硬失败);两份 session-start-context.sh 同步输出 drift 摘要行(hooks parity 绿);repo-harness-architecture SKILL.md 与 docs/reference-configs/harness-overview.md 更新;脚本化 worktree 在 advisory 与 strict 各走一次 finish 验证 | `plans/archive/plan-20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.md` |
| 3 | [x] | arch-doc-loop-03-productize-assets | contract | assets/templates/helpers/ 镜像改动脚本、新增 architecture-queue.sh 与 check-architecture-sync.sh、移除 architecture-drift.sh 并将其加入下游 retired-removal 清单;两份 workflow-contract(assets v1 ↔ .ai/harness)helpers.scripts/artifacts.requiredFiles 同步且字节相等测试绿;project-init-lib.sh helper_names/chmod 表、下游 policy 模板(freshness_gate=advisory)、seed index 加 BEGIN/END 标记;scaffold-parity 快照更新;check-task-workflow.sh 增 check_required_file;`migrate-project-template.sh --repo . --dry-run` 通过;/tmp 全新 scaffold 验证下游骨架带标记 index、advisory policy、两个新脚本且无 architecture-drift.sh | `plans/archive/plan-20260612-0453-arch-doc-loop-03-productize-assets.md` |
| 4 | [x] | arch-doc-loop-04-research-surface-migration | contract | 研究面契约从 `tasks/research.md` 迁到 `docs/researches/*`:盘点并改写全部活跃引用(ResearchGate hook 改为按 `docs/researches/` 最新报告 mtime 判新鲜、capture-plan.sh 模板 Research 行、check-task-sync.sh 同步面、两份 workflow-contract requiredFiles、根 CLAUDE.md/AGENTS.md Canonical Workflow Files、docs/reference-configs、project-init-lib seed 与下游模板);`tasks/research.md` 存量条目迁入 `docs/researches/20260612-legacy-research-notes.md` 后原文件变 tombstone 指针;grep 全仓除归档/历史/迁移兼容面外无活跃 `tasks/research.md` canonical 引用;ResearchGate 在新面上行为有验证(新鲜/过期两态);根 Required Checks 全绿 | `plans/archive/plan-20260612-0538-arch-doc-loop-04-research-surface-migration.md` |

## Execution Log

Keep this section last; `scripts/sprint-backlog.sh complete-task` appends rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
| 2026-06-12 03:32 | arch-doc-loop status correction | `/Users/chris/Projects/agentic-dev-wt-arch-doc-loop-01-queue-engine-triage` | Reality check: research and sprint docs exist but were uncommitted; slice 1 plan/contract/review shell exists in the linked worktree, implementation is not started, review remains fail, and legacy requests remain 27 files. Sprint status moved to Approved so Goal-mode execution can proceed from the dedicated worktree. |
| 2026-06-12 04:20 | arch-doc-loop-01-queue-engine-triage | `plans/plan-20260612-0318-arch-doc-loop-01-queue-engine-triage.md` | Completed queue engine slice: `architecture-queue.sh` replaced `architecture-drift.sh`, post-edit hooks call queue record, legacy requests were archived, request root is empty, pending markers are clear, focused tests and required checks passed. |
| 2026-06-12 04:51 | arch-doc-loop-02-freshness-gate-surfaces | `plans/archive/plan-20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.md` | done |
| 2026-06-12 05:38 | arch-doc-loop-03-productize-assets | `plans/archive/plan-20260612-0453-arch-doc-loop-03-productize-assets.md` | done |
| 2026-06-12 06:17 | arch-doc-loop-04-research-surface-migration | `plans/archive/plan-20260612-0538-arch-doc-loop-04-research-surface-migration.md` | done |
