# Campaign 退役只读盘点与新准入冻结设计

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

结论：本次只观察并设计，**未冻结产品准入，也未授权执行删除**。当前 clone 没有可观察的 campaign definition/queue/Lease/锁账本，当前 Docker daemon 没有 campaign 容器；这不是全机器/远端 drain 证明。账号容器 journal 有306目录/908 JSON，其中296 terminal 声称 inactive，10缺 terminal。全部 created.daemon_id 为 `modeled-fixture`，与真实 daemon 不同；这是 fixture 来源证据，不是清理授权。新准入建议在 release 的中心 create effect 硬冻结全新 definition，保留已有精确 replay/recovery；禁止只改候选 checkout policy 或只关 CLI。

## 绑定、权限和方法

- 工作目录 `/Users/chris/Projects/repo-harness-sched-c`；分支 `codex/campaign-inventory`；源码/基准 `1d3c2f017fa867cfbaf3cd61873395b4945e6f04`，package0.20.0。主 checkout 和 retire-cross-review 批次只读、无改动。
- 参考：`git show origin/codex/development-scheduler-skill:docs/researches/development-scheduler/PLAN.md`，该 ref=`bad25106182afe07d3ab844976c872b3c6dbdbba`。根目录没有 PLAN.md，实际路径由 git ls-tree 定位。重点为『删除、保留、共享耦合』『单次退役顺序与回滚』：先盘点、有限 drain、冻结、cutover，之后才按 owner 授权删除。通用新 runtime store 在参考中是设计，不冒称已实现。
- 本 worktree 无 `.codegraph/`，按规则使用 rg + 当前源码；专用模块表以直接/动态相对 import、显式脚本引用建立调用方，不能覆盖无法定位的反射/远端旧二进制。专用候选还必须过逐消费者/运行态 drain 的后续删除门，不能仅凭文件名决定。
- 只读观察窗口 UTC `2026-10-02T20:21:03.064433+00:00`（HKT/SGT +08:00）。各查询不是原子快照；worktree 拓扑在并行工作中可变化。命令 stdout/exit 原始材料留本地 `/tmp/retire-campaign-runtime.json`，不发布 prompt、credential、完整 ps argv 或 unrelated Docker labels。
- 唯一版本化交付为本文件，归档于 `docs/researches/development-scheduler/`。下述运行态与验证结果均为上述观察窗口的历史快照；实施冻结或删除前必须重新观察。未改 ignore/manifest/workflow rules，未新增 plan/contract/notes；盘点时 state resolve 为 idle/lite、无 active plan/contract。

## P1：真实权威与系统边界

| 状态 | 权威 / 代码证据 | 盘点覆盖 |
|---|---|---|
| definition/current/events/transition/group/planning/dispatch/heartbeat | Git common dir 的 `repo-harness/development-campaigns/v1`；`src/effects/automation/development-campaign-store.ts:28,63-78`，`issue-batch-store.ts:33-42`，`campaign-planning-store.ts:48-53` | 本 clone，共享全部 linked worktree；直接 filesystem 读取，不调用持 writer 锁的 status helper |
| grant | `REPO_HARNESS_HOME/gates/<common-dir repo key>/program-authorizations`；`src/effects/automation/grant-store.ts:51-76` | 默认账号 home，所有 program-authorizations 目录；不读取其他 gates 内容来猜 grant |
| budget/reservation/usage/reconcile/stop receipt | common dir `repo-harness/automation-budget/v1`；`src/effects/automation/budget-store.ts:126` | 本 clone；不 mint/reserve/settle |
| Task Lease/owner/liveness/Task锁 | common dir `repo-harness/coordination/v1`；`src/effects/state/coordination-lease-store.ts:51-53` | 本 clone；不 acquire/reclaim/remove Lease，不以 PID 消失作清理证据 |
| inner acquisition/observation 与 task inbox | common dir `repo-harness/engineer-scheduling/v1`、`repo-harness/task-inbox`；`src/effects/engineers/scheduling-acquire-next.ts:110,406`、`src/effects/fleet/task-inbox-layout.ts:13` | 本 clone；不 reconcile，observation freshness 不作 retention TTL |
| attempt state | common dir `repo-harness/engineer-attempts/v1`；`src/effects/engineers/automation-attempt-store.ts:10` | 本 clone；不 reset retry 或 budget |
| container 受保护 journal | `~/.repo-harness/campaign-containers`；`src/effects/automation/campaign-container.ts:20-30` | 直接读取现有目录。没有调用 campaignContainerJournalRoot，因为其 mkdir 会写；不调用可能持久 rejected-readback 的 helper inspect/recovery |
| worktree | `git worktree list --porcelain`，Lease refs/真实 manifest 才证明 ownership | 全部 linked worktree 的指定 campaign/contract-run marker 存在性；不因 branch 名猜 owner，不收集 worker prompt |
| timer / process / Docker | user crontab、launchd inventory、ps metadata、Docker contexts/ps/info/image ls | 本机可读面；其他用户、远端 Host/cloud automation、alternate REPO_HARNESS_HOME 无凭证/未验证 |

## 当前运行态（只读）

| 面 | 真实查询及结果 | 判定 / 未知边界 |
|---|---|---|
| 本 clone active/queued campaign | `git rev-parse --path-format=absolute --git-common-dir` exit0 → `/Users/chris/Projects/repo-harness/.git`；其 development-campaigns/v1 根不存在 | 没有当前该根下的 definition/current/group/dispatch/reservations 文件；不能说其他 clone、临时 fixture clone、旧安装均无 campaign |
| grants | 默认 home 的 gates 存在，61 JSON；program-authorizations 目录0 | 没有当前 schema authority 地址的 stored program grant；其他 gates 未当成授权。未扫描任意 env 指向的 alternate home |
| budget / Task Lease / acquisition / attempts / inbox | 上表五个 common-dir store 根均不存在；coordination 根也不存在 | 本 clone 可观察 Lease、claim/inbox、planning/mutation/Task locks 为0；未知 metadata 不得删除 |
| 本机 campaign processes | `ps -axo pid,ppid,etime,command` exit0，campaign-step/runtime/run-campaign/contract-run/cleanup-campaign/development-campaign markers 命中0（排除查询自身） | 无显式匹配进程；generic Bun/Codex/Herdr worker 未绑定到 campaign 的仍未知，未读取 env/kill/reassign |
| Docker contexts | context ls/show exit0：default、desktop-linux，current=desktop-linux；两端 ps -a exit0，均3容器 | 当前 daemon ID=`c566ad79-fe8b-4100-bad8-60d9c171adbb`；3为 sub2api 系列，2running/1exited，无已识别 campaign；未把 unknown namespace 当删除候选 |
| images | `docker image ls --no-trunc --format '{{json .}}'` exit0；query shell BRC_CAMPAIGN_IMAGE 未设置 | 镜像无 registry/immutable-id到 campaign 的权威绑定，不能仅依 tag判归属；不 build/prune/rm。相关 image 列表见下表 |
| protected container journal |306目录，request306/created306/terminal296；所有 created daemon modeled-fixture，296 terminal.inactive=true | fixture 写入链可复核 `tests/helpers/historical-campaign-lifecycle.ts:247-264`；10缺终态仍记录 unknown，不能伪造 receipt/证明真实 inactivity 或据此删。无 cleanup receipt |
| worktree | 观察到15个 registered linked worktrees；检查 tasks/campaigns、.ai/harness/campaigns、runs/campaigns、contract-runs marker 均无 | 无已识别 campaign-owned worktree；不等同全部 worktree可删。真实 Task owner未被证明，不动任何 worktree |
| user cron / launchd | crontab -l exit1 `no crontab for chris`；launchctl list exit0，无 campaign label；可读3个 LaunchAgents/Daemons 目录无 campaign marker plist | root/其他用户cron、远端/cloud/Host timers 未验证；通用标签隐式执行不排除 |
| repo scheduled CI | 当前 tracked .github/workflows 仅 ci.yml；on=PR、workflow_dispatch、push main（ci.yml:3-9），无 schedule | 仓库未定义 campaign定时CI；Host自动化不是由这个结论覆盖 |
| tracked policy | .ai/harness/policy.json:66-73 external_sources.mode=off / development_campaign.mode=off | 是源码配置，不是目标 revision grant读回或 freeze fence，更不是运行态“0”的替代证据 |

### 10 个缺 terminal 的 journal（未知 writer，仅记录）

- `2121fb69-65e0-4d42-8c3c-a78bb44c4310`；created daemon=`modeled-fixture`；没有 terminal；不清理。
- `4a524875-e5eb-4959-84da-ce508a6ee94d`；created daemon=`modeled-fixture`；没有 terminal；不清理。
- `4fe49c99-bd25-4ff4-bc1a-8b6b365c391b`；created daemon=`modeled-fixture`；没有 terminal；不清理。
- `5d60847b-3e22-48db-b0cb-f7251b70370a`；created daemon=`modeled-fixture`；没有 terminal；不清理。
- `80481f82-8064-44cf-9207-f26dc23ce9fb`；created daemon=`modeled-fixture`；没有 terminal；不清理。
- `955a6efb-c7df-44cd-ae07-030b7cb1e7e4`；created daemon=`modeled-fixture`；没有 terminal；不清理。
- `9d46dc37-2673-4d17-aaa1-0a512c0263d1`；created daemon=`modeled-fixture`；没有 terminal；不清理。
- `b89c22c5-6d8b-4c85-80e2-6e75f85226a9`；created daemon=`modeled-fixture`；没有 terminal；不清理。
- `c80f936b-ebef-49c5-ae18-fe4d1a9b79e3`；created daemon=`modeled-fixture`；没有 terminal；不清理。
- `e1a161c3-433e-44ee-bd0c-169e7dfeeac8`；created daemon=`modeled-fixture`；没有 terminal；不清理。

### 当前 Docker image 清单（只读，不判可删）

| repository:tag | immutable ID | container引用数 |
|---|---|---|
| `codex-clarification-linux:latest` | `sha256:590701feed16275be59656944875888d43fa474e26f3899de392ae17fe367f37` | 0 |
| `ghcr.io/ranxi2001/sub2api:2.8.11` | `sha256:e09d3867a224126171f0a3604536a007e41b9cc6fc99dab2de2f5f1da67cc1be` | 1 |
| `redis:8-alpine` | `sha256:3811787313eba226a2ef38658c6ccb91cd5e110edc89c37767de373120a0e5a0` | 1 |
| `node:24-bookworm-slim` | `sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6` | 0 |
| `postgres:18-alpine` | `sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` | 1 |
| `node:22.22` | `sha256:2d178f2785b96dfbf62a416ca2e40f50e30150b4ff3320d706f0d96e90600eb3` | 0 |

## P2：一条真实执行链及共享边界

`campaign step` → `runCampaignHeartbeatStep`（`src/cli/commands/campaign.ts:216-241`）→ post-adoption `runCampaignAcquisition`（`src/effects/automation/campaign-acquisition.ts:164-200`）→ `requireCampaignActiveAdmission` + campaign manifest membership/R2 callback/budget +共享 acquire-next（同文件:172-200）→成功 handoff → `contract-run run --campaign-handoff`（campaign-acquisition.ts:253-258）→ `bindCampaignWorker`（`scripts/contract-run.ts:897-900`）→ worker准备容器（`src/effects/automation/campaign-worker.ts:112-142,204`）→ `prepareCampaignCodexInvocation` → `runCampaignContainer`（`src/effects/automation/campaign-runtime.ts:28-91`）。外层绑定、inner key replay、claim/lease、reservation/settlement、own-claim compensation/未知 pending，以及容器 journal receipt 是不同 owner，删编排不等于可丢这些安全/证据边界。

独立创建链：CLI `campaign start`（campaign.ts:79-99,295-300）读取 stored grant → definition → `createDevelopmentCampaign`（development-campaign-store.ts:321-364）读 grant.target_revision 上的 start policy → mutation policy → campaign lock → definition/authorize event/current。因此当前 working policy off、删 CLI、收紧 Skill 都不是闭合 freeze。直接 store consumer/旧目标 revision必须受中心 effect控制。源码 MCP tools/types 未命中 campaign 命令注册，不能从此推断共享 MCP engineer/contract入口无 campaign间接耦合。

## campaign 专用代码及每项调用方

下表为逐文件直接 module/动态 import 和显式脚本消费者，tests列为直接引用测试文件数。入口证据是本文件首次 exported declaration（无导出则第1行）；0调用项仅表示未找到直接调用，反射或已安装旧包未知。**“campaign 专用可删候选”全部以 owner批准、drain、消费者迁移完成为前置，不是本次删除决定**。deploy与3个脚本的完整源码消费者见后表；不生成新的adapter。

| 文件 / 入口证据 | 直接 production调用方 | 直接 tests数 | 分类 |
|---|---|---:|---|
| `deploy/campaign-container/Dockerfile:1` | `scripts/build-campaign-image.sh:12` | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `deploy/campaign-container/campaign-init.c:1` | `scripts/build-campaign-image.sh:12` | 0 | campaign 专用可删候选；drain/调用方迁移后 |
| `scripts/build-campaign-image.sh:1` | 未找到直接 production引用；显式operator脚本/潜在旧调用未知 | 0 | campaign 专用可删候选；drain/调用方迁移后 |
| `scripts/cleanup-campaign-container.ts:1` | 未找到直接 production引用；显式operator脚本/潜在旧调用未知 | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `scripts/run-campaign-preflight.ts:1` | 未找到直接 production引用；显式operator脚本/潜在旧调用未知 | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/cli/commands/campaign.ts:79` | `src/cli/index.ts:44` | 5 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/campaign-authoring-budget.ts:8` | `src/cli/commands/campaign.ts:22`；`src/core/automation/issue-batch-adoption.ts:3`；`src/effects/automation/budget-store.ts:118`；`src/effects/automation/campaign-authoring-resume.ts:5`；`src/effects/automation/campaign-worker.ts:1`；`src/effects/automation/gpt-pro-issue-authoring.ts:3` | 4 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/campaign-browser-session.ts:5` | `src/core/automation/campaign-revision-observation.ts:3`；`src/core/automation/connector-challenge.ts:1`；`src/core/automation/issue-batch-adoption.ts:1`；`src/core/automation/issue-batch.ts:1`；`src/effects/automation/campaign-fresh-audit.ts:2`；`src/effects/automation/campaign-revision-observation.ts:10`；`src/effects/automation/gpt-pro-issue-authoring.ts:4`；`src/effects/automation/issue-batch-adoption.ts:2` | 2 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/campaign-closeout.ts:6` | `src/effects/automation/campaign-closeout-provider.ts:5`；`src/effects/automation/campaign-closeout.ts:7`；`src/effects/automation/campaign-fresh-audit.ts:6`；`src/effects/automation/campaign-not-planned.ts:5`；`src/effects/automation/campaign-planning-proof.ts:3` | 2 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/campaign-containment.ts:3` | `src/core/automation/campaign-runtime.ts:1`；`src/effects/automation/campaign-container.ts:11`；`src/effects/automation/campaign-container.ts:12`；`src/effects/automation/campaign-container.ts:8` | 2 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/campaign-fresh-audit.ts:5` | `src/cli/commands/campaign.ts:2`；`src/effects/automation/campaign-fresh-audit.ts:20`；`src/effects/automation/campaign-revision-observation.ts:9` | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/campaign-planning.ts:3` | `src/cli/commands/campaign.ts:18`；`src/cli/commands/engineer.ts:45`；`src/effects/automation/campaign-acquisition.ts:4`；`src/effects/automation/campaign-not-planned.ts:8`；`src/effects/automation/campaign-planning-proof.ts:9`；`src/effects/automation/campaign-planning-store.ts:5`；`src/effects/automation/campaign-planning.ts:3`；`src/effects/automation/campaign-protection.ts:4`；`src/effects/automation/campaign-revision-admission.ts:2` | 3 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/campaign-revision-evidence.ts:4` | `src/core/automation/campaign-browser-session.ts:1`；`src/core/automation/campaign-browser-session.ts:4`；`src/core/automation/campaign-fresh-audit.ts:1`；`src/core/automation/campaign-revision-observation.ts:4`；`src/effects/automation/campaign-fresh-audit.ts:1`；`src/effects/automation/campaign-revision-observation.ts:2` | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/campaign-revision-observation.ts:7` | `src/effects/automation/campaign-revision-admission.ts:4`；`src/effects/automation/campaign-revision-observation.ts:3` | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/campaign-runtime.ts:5` | `src/effects/automation/campaign-closeout.ts:5`；`src/effects/automation/campaign-recovery.ts:3`；`src/effects/automation/campaign-runtime.ts:6`；`src/effects/automation/campaign-worker.ts:23`；`src/effects/automation/campaign-worker.ts:24` | 6 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/development-campaign.ts:11` | `src/cli/commands/campaign.ts:24`；`src/core/automation/campaign-fresh-audit.ts:3`；`src/effects/automation/campaign-fresh-audit.ts:22`；`src/effects/automation/development-campaign-store.ts:22` | 11 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/issue-batch-adoption.ts:8` | `src/cli/commands/campaign.ts:10`；`src/core/automation/campaign-closeout.ts:1`；`src/effects/automation/campaign-authoring-resume.ts:3`；`src/effects/automation/campaign-planning-proof.ts:10`；`src/effects/automation/campaign-planning.ts:4`；`src/effects/automation/issue-batch-adoption.ts:10`；`src/effects/automation/issue-batch-publication.ts:9`；`src/effects/automation/issue-batch-shadow-adoption.ts:2` | 5 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/issue-batch-reconcile.ts:21` | `src/cli/commands/campaign.ts:39`；`src/core/automation/issue-batch-adoption.ts:4`；`src/effects/automation/campaign-step.ts:10`；`src/effects/automation/gpt-pro-issue-authoring.ts:7`；`src/effects/automation/issue-batch-adoption.ts:12`；`src/effects/automation/issue-batch-shadow-adoption.ts:4` | 2 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/core/automation/issue-batch.ts:12` | `src/cli/commands/campaign.ts:36`；`src/core/automation/campaign-revision-observation.ts:5`；`src/core/automation/issue-batch-adoption.ts:5`；`src/core/automation/issue-batch-reconcile.ts:13`；`src/effects/automation/campaign-acquisition.ts:15`；`src/effects/automation/campaign-authoring-resume.ts:4`；`src/effects/automation/campaign-closeout-provider.ts:6`；`src/effects/automation/campaign-fresh-audit.ts:21`；`src/effects/automation/campaign-planning-proof.ts:11`；`src/effects/automation/campaign-planning-store.ts:6`；`src/effects/automation/campaign-revision-admission.ts:5`；`src/effects/automation/campaign-step.ts:11`；`src/effects/automation/campaign-worker.ts:18`；`src/effects/automation/gpt-pro-issue-authoring.ts:22`；`src/effects/automation/issue-batch-adoption.ts:13`；`src/effects/automation/issue-batch-observer.ts:9`；`src/effects/automation/issue-batch-publication.ts:8`；`src/effects/automation/issue-batch-shadow-adoption.ts:3`；`src/effects/automation/issue-batch-store.ts:12` | 7 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-acquisition.ts:22` | `src/cli/commands/campaign.ts:16`；`src/cli/commands/engineer.ts:47`；`src/effects/automation/campaign-worker.ts:19` | 2 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-authoring-resume.ts:13` | `src/cli/commands/campaign.ts:20`；`src/effects/automation/gpt-pro-issue-authoring.ts:1`；`src/effects/automation/issue-batch-adoption.ts:1` | 3 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-capability-registry.ts:6` | `src/effects/automation/campaign-protection.ts:5`；`src/effects/automation/gpt-pro-issue-authoring.ts:6`；`src/effects/automation/issue-batch-adoption.ts:8` | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-capacity.ts:12` | `src/effects/fleet/acquire.ts:75` | 2 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-closeout-provider.ts:14` | `src/effects/automation/campaign-closeout.ts:18`；`src/effects/automation/campaign-not-planned.ts:17` | 2 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-closeout.ts:31` | `src/cli/commands/campaign.ts:5` | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-container.ts:12` | `scripts/cleanup-campaign-container.ts:1`；`scripts/run-campaign-preflight.ts:7`；`src/effects/automation/campaign-runtime.ts:8` | 6 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-fresh-audit.ts:44` | `src/cli/commands/campaign.ts:3`；`src/effects/automation/campaign-planning-proof.ts:2`；`src/effects/automation/campaign-revision-admission.ts:8`；`src/effects/automation/development-campaign-store.ts:2`；`src/effects/automation/gpt-pro-issue-authoring.ts:5`；`src/effects/automation/issue-batch-observer.ts:1` | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-not-planned.ts:19` | `src/cli/commands/campaign.ts:4` | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-planning-proof.ts:25` | `src/effects/automation/campaign-acquisition.ts:13`；`src/effects/automation/campaign-capacity.ts:8`；`src/effects/automation/campaign-closeout-provider.ts:10`；`src/effects/automation/campaign-closeout.ts:14`；`src/effects/automation/campaign-fresh-audit.ts:24`；`src/effects/automation/campaign-not-planned.ts:13`；`src/effects/automation/campaign-planning.ts:15`；`src/effects/automation/campaign-recovery.ts:17`；`src/effects/automation/campaign-worker.ts:14`；`src/effects/automation/development-campaign-store.ts:3`；`src/effects/fleet/acquire.ts:74` | 5 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-planning-store.ts:24` | `src/effects/automation/campaign-acquisition.ts:12`；`src/effects/automation/campaign-authoring-resume.ts:9`；`src/effects/automation/campaign-capacity.ts:9`；`src/effects/automation/campaign-closeout-provider.ts:9`；`src/effects/automation/campaign-closeout.ts:15`；`src/effects/automation/campaign-fresh-audit.ts:25`；`src/effects/automation/campaign-not-planned.ts:14`；`src/effects/automation/campaign-planning-proof.ts:18`；`src/effects/automation/campaign-planning.ts:14`；`src/effects/automation/campaign-recovery.ts:18`；`src/effects/automation/campaign-worker.ts:15`；`src/effects/automation/issue-batch-adoption.ts:28`；`src/effects/operator/automation-summary.ts:14` | 7 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-planning.ts:17` | `src/cli/commands/campaign.ts:17`；`src/effects/automation/campaign-acquisition.ts:14` | 2 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-protection.ts:7` | `src/effects/automation/campaign-planning-proof.ts:1`；`src/effects/automation/campaign-revision-observation.ts:1`；`src/effects/automation/gpt-pro-issue-authoring.ts:2` | 0 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-provider-execution.ts:14` | `src/effects/automation/campaign-closeout.ts:17`；`src/effects/automation/campaign-not-planned.ts:16`；`src/effects/automation/campaign-step.ts:28`；`src/effects/automation/issue-batch-adoption.ts:27`；`src/effects/automation/issue-batch-shadow-adoption.ts:9` | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-recovery.ts:33` | 未找到直接 production引用；显式operator脚本/潜在旧调用未知 | 4 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-revision-admission.ts:14` | `src/effects/automation/campaign-acquisition.ts:1`；`src/effects/automation/campaign-capacity.ts:1`；`src/effects/automation/campaign-planning.ts:1`；`src/effects/automation/campaign-worker.ts:2`；`src/effects/automation/issue-batch-adoption.ts:3`；`src/effects/fleet/acquire.ts:1` | 4 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-revision-observation.ts:26` | `src/cli/commands/campaign.ts:1` | 3 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-runtime.ts:29` | `src/effects/automation/campaign-recovery.ts:16`；`src/effects/automation/campaign-worker.ts:25` | 6 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-step.ts:35` | `src/cli/commands/campaign.ts:37`；`src/effects/automation/issue-batch-adoption.ts:23`；`src/effects/operator/automation-summary.ts:15` | 1 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/campaign-worker.ts:28` | `scripts/contract-run.ts:900`；`src/effects/automation/campaign-acquisition.ts:2`；`src/effects/automation/campaign-authoring-resume.ts:10`；`src/effects/automation/campaign-closeout.ts:13`；`src/effects/automation/campaign-recovery.ts:15` | 7 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/development-campaign-policy.ts:7` | `src/cli/commands/campaign.ts:33`；`src/effects/automation/campaign-capability-registry.ts:3`；`src/effects/automation/campaign-planning-proof.ts:15`；`src/effects/automation/campaign-planning.ts:12`；`src/effects/automation/campaign-protection.ts:1`；`src/effects/automation/campaign-revision-admission.ts:9`；`src/effects/automation/campaign-revision-observation.ts:12`；`src/effects/automation/campaign-step.ts:16`；`src/effects/automation/development-campaign-store.ts:24`；`src/effects/automation/gpt-pro-issue-authoring.ts:24`；`src/effects/automation/issue-batch-adoption.ts:18`；`src/effects/automation/issue-batch-observer.ts:10`；`src/effects/operator/automation-summary.ts:9` | 2 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/development-campaign-store.ts:31` | `src/cli/commands/campaign.ts:32`；`src/effects/automation/campaign-acquisition.ts:18`；`src/effects/automation/campaign-authoring-resume.ts:8`；`src/effects/automation/campaign-fresh-audit.ts:23`；`src/effects/automation/campaign-planning-proof.ts:17`；`src/effects/automation/campaign-planning-store.ts:7`；`src/effects/automation/campaign-revision-admission.ts:6`；`src/effects/automation/campaign-revision-observation.ts:11`；`src/effects/automation/campaign-step.ts:25`；`src/effects/automation/gpt-pro-issue-authoring.ts:23`；`src/effects/automation/issue-batch-adoption.ts:17`；`src/effects/automation/issue-batch-observer.ts:21`；`src/effects/automation/issue-batch-store.ts:14`；`src/effects/operator/automation-summary.ts:13` | 13 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/issue-batch-adoption.ts:31` | `src/cli/commands/campaign.ts:9` | 6 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/issue-batch-observer.ts:24` | `src/cli/commands/campaign.ts:38`；`src/effects/automation/campaign-step.ts:24`；`src/effects/automation/issue-batch-adoption.ts:19`；`src/effects/automation/issue-batch-shadow-adoption.ts:10` | 4 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/issue-batch-publication.ts:16` | `src/effects/automation/campaign-authoring-resume.ts:11`；`src/effects/automation/campaign-capacity.ts:4`；`src/effects/automation/campaign-planning-proof.ts:14`；`src/effects/automation/issue-batch-adoption.ts:24` | 3 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/issue-batch-shadow-adoption.ts:22` | `src/effects/automation/issue-batch-adoption.ts:4` | 0 | campaign 专用可删候选；drain/调用方迁移后 |
| `src/effects/automation/issue-batch-store.ts:17` | `src/cli/commands/campaign.ts:19`；`src/cli/commands/campaign.ts:35`；`src/cli/commands/engineer.ts:46`；`src/effects/automation/campaign-acquisition.ts:11`；`src/effects/automation/campaign-authoring-resume.ts:6`；`src/effects/automation/campaign-capacity.ts:10`；`src/effects/automation/campaign-fresh-audit.ts:26`；`src/effects/automation/campaign-not-planned.ts:12`；`src/effects/automation/campaign-planning-proof.ts:13`；`src/effects/automation/campaign-planning-store.ts:8`；`src/effects/automation/campaign-planning.ts:13`；`src/effects/automation/campaign-revision-admission.ts:7`；`src/effects/automation/campaign-step.ts:23`；`src/effects/automation/campaign-worker.ts:13`；`src/effects/automation/gpt-pro-issue-authoring.ts:26`；`src/effects/automation/issue-batch-adoption.ts:20`；`src/effects/automation/issue-batch-publication.ts:14`；`src/effects/automation/issue-batch-shadow-adoption.ts:11` | 12 | campaign 专用可删候选；drain/调用方迁移后 |

### Docker /配置/产品 surfaces 的退役边界

| 项 | 调用方/证据 | 处理归属 |
|---|---|---|
| deploy/campaign-container/Dockerfile、campaign-init.c | scripts/build-campaign-image.sh:8-12 拷贝并docker build；Dockerfile:1、campaign-init.c:18-20,47-69 的固定 runtime/PID1/权限 | campaign专用候选；暂无非campaign生产consumer证明，不保留空壳。禁止删镜像/journal替代drain |
| scripts/build-campaign-image.sh | 当前tracked package.json/ci.yml无显式build脚本调用；operator脚本，研究runbook引用 | 无证据不虚构Docker build CI job；未来连文档/专用tests一起迁移 |
| scripts/run-campaign-preflight.ts | :7,24 用prepare/run；tests/effects/campaign-environment.test.ts:32-43及execution-environment研究引用 | campaign专用operator入口；本次未执行，因为会create/start/journal |
| scripts/cleanup-campaign-container.ts | :1调用cleanupCampaignContainer；tests/effects/campaign-container-live.test.ts:208-239 | 旧journal/daemon/identity/inactive/非force rm/cleanup receipt收口前保留，不调用 |
| src/effects/automation/campaign-container.ts | campaign-runtime.ts:8、preflight:7、cleanup:1为生产consumer；专用live/containment/runtime tests | implementation专用候选；安全语义不能先丢。不要泛化成新通用Docker层 |
| BRC_CAMPAIGN_IMAGE | src/effects/automation/campaign-runtime.ts:34-35唯一生产value reader，要求sha256 local image ID；env/runbook及tests配置引用 | 随专用runtime迁移；当前shell未设置不证明进程/remote无此env |
| auto-campaign Skill/grant helper | assets/skill-commands/manifest.json:182-197显式目录；assets/skills/auto-campaign/{SKILL.md,references/execution.md,references/standard.json,scripts/prepare-grant.ts}；tests/auto-campaign-skill.test.ts | campaign专用入口候选；不能只撤Skill以冒充中心freeze；通用grant store保留 |
| campaign capability model | .archcontext/model/nodes/capability.runtime-harness.development-campaign.yaml、component.development-campaign.journal.yaml、flow.development-campaign.lifecycle.yaml及6relation文件 | 活跃模型/projection需后续同owner ChangeSet迁移；本次不改、不accept任何其他模块candidate，历史audit不清字符串 |
| campaign tests/fixtures | tests/effects/campaign-*.test.ts、brc6a-admission/brc10-lifecycle、tests/helpers/historical-campaign-lifecycle.ts、tests/cli/campaign-planning.test.ts、repair-campaign fixture/characterization | 专用cases可随专属实现另批准退役；shared safety regression需保留，fixture残留不是realcanary |
| campaign文档/模板默认activation | docs/researches/20260909-campaign-execution-environment.md；scripts/ensure-task-workflow.sh:950、scripts/lib/project-init-lib.sh:1510，镜像assets/templates/helpers；adoption/manifest | 后续调用方投影整体迁移；当前off default仍保留普通workflow，不能用批量文本替换删历史审计 |

## 共用 primitives 必须保留（只移除已证明的campaign绑定）

| 共用面 | 真实非campaign consumer/用途 | campaign专用耦合 |
|---|---|---|
| task-agent / Herdr task session | src/cli/commands/task-agent.ts:6-58 → src/effects/terminal/task-session.ts:422；start/send/result/collect/status/history/read/close/cancel独立产品面 | campaign-runtime并不是这个工具的薄consumer，不自行写CLI adapter/stdout parser |
| contract执行/收集/recovery | scripts/contract-run.ts:897-909；assets/templates/helpers镜像及普通contract CLI；worker/verifier/outcome/主流程 | 同脚本campaignHandoff/provider/beforeChild/afterChild分支可单独退役，不能删整脚本 |
| ordinary/selected acquisition + assertion/claim | src/cli/commands/engineer.ts、src/cli/mcp/tools.ts → scheduling-acquire-next.ts（acquireSelectedEngineerTask:390）→ src/effects/fleet/acquire.ts | campaign-acquisition的R2 policy/callback/manifest guard，以及fleet的campaign binding单独拆；R1/key pending/completed/receipt不能改成普通新事务 |
| Task Lease + writer/scope/cleanup fencing | src/effects/state/coordination-lease-store.ts:51 → sprint-backlog/engineer/contract worktree；coordination-worktree-topology.ts:28拒未知Lease/dirty/changed绑定 | 只退专用campaign容量guard；不能删除/重置全局Lease、共享Task锁或拓扑锁 |
| budget/grant/reservation/settlement/reconciliation | src/effects/automation/budget-store.ts:126及src/cli/commands/automation.ts，engineer/codex-goal消费者；grant-store:75账号存储 | campaign author/group/step/outcome业务字段消费者单独盘点；所有pending reservation按原owner结算/unknown留reconcile，不能reset |
| 幂等/原子journal/lock/digest | src/effects/locking/exclusive-directory-lock.ts、src/effects/evidence/atomic-append.ts、src/core/messages/mechanics.ts 被state/evidence/git/automation共用 | campaign definition/groups schema属专用；不保留空壳campaignschema，也不删通用实现 |
| subject-bound acceptance/receipt | scripts/acceptance-receipt.ts、core/effects evidence/verification，普通contract/review使用 | 保留真实subject/provider/reviewer/identity绑定；本报告不是AcceptanceReceipt/验收PASS |
| account/container cleanup vs shared worktree cleanup | campaign-container.ts:330-360专用cleanup；coordination-worktree-topology.ts:28共享exact cleanup | 前者在drain/recovery完成后才可移除；后者必须保留，未知writer不得直接清理 |
| operator read models / schemas / UI | src/effects/operator/automation-summary.ts:9,13 + src/operator-web/AutomationSummary.tsx:85；server/fixture/i18n共用消费者 | 仅campaign rows/控制语义可迁移；普通automation/budget只读投影保留，不造第二权威 |
| architecture/adoption/capability/tooling | 通用model/projection与standard-plan workflow planner服务全部capabilities；AXR/CI选择/验证共用 | 专用campaign anchors/relations/template knobs要精确迁移，其他模块不触碰 |

## P3：冻结新 campaign 准入的最小改动设计（未实现）

冻结口径建议明确为**不再创建全新 campaign definition/authorize事务**。这不是“阻止已有campaign产生任何新工作”的完整drain fence；既有author/group/dispatch路径仍会运行，应由后续drain slice按owner和pending状态管控。若owner要求后者，需要独立批准更宽新-effect边界，不能偷偷对所有requireCampaignActiveAdmission调用hard reject而断开in-flight恢复。

| 方案 | 受影响文件/真实压力点 | 取舍 |
|---|---|---|
| 推荐：release中心create effect硬冻结新建分支，保留精确existing replay | src/effects/automation/development-campaign-store.ts:createDevelopmentCampaign:321-364；src/cli/commands/campaign.ts:start:79-99仅精确错误呈现；tests/effects/development-campaign-store.test.ts与既有campaign CLI tests；docs runbook | 没有新配置权威、永久compat/adapter/抽象。安装该release的所有CLI/直接effectconsumer一致拒绝；旧二进制/远端仍未被 fence，必须先确认升级/停止新dispatch的owner授权 |
| 非推荐：只把 .ai/harness/policy.json mode=off /撤CLI/Skill | development-campaign-policy.ts:76-120读grant target_revision；campaign.ts:295注册；manifest入口 | 旧revision仍active、导出effect仍可调用，且误伤replay；不能当安全freeze |
| 更宽候选：明确操作分类后的common-dir operator freeze fence | campaign-revision-admission.ts:14现有共同guard；campaign acquisition/step/authoring/revision/create中key判定之后、预算/claim/provider前的新-effect边界 | 能覆盖existingcampaign新work，但需要跨旧二进制/进程/锁的operatorquiescence证明。全部guard调用覆盖worker/recovery/read path，不能 blanket拒绝；不是本次最小方案，不新建store设计/代码 |

推荐实现的逻辑顺序：保留既有validation/grant/target_revision检查；进入既有campaign mutation锁；**在prepare/immutable/event/reservation等新持久效果之前**安全读取definition与existing replay证据。全新definition明确返回现有 `campaign_mode_disabled` +retirement说明；现存record必须保留原授权/key/digest冲突检查和canonical rebuild。definition存在但current/event缺失、损坏、foreign/key不同不是豁免的existing replay，也不能当全新事务，返回原conflict/reconciliation。锁owner记录可有必需短时变化，但definition/events/budget/lease/provider不得变化。没有schemafallback、永久v1reader或隐式auto-picker。

不会改appendDevelopmentCampaignEvent/status/recovery/reconcile/retire/cleanup来顺手“停止全部”；不会撤销grant、reset预算、删除expired pending/completed、强制kill/重派未知writer。新mint的campaign grant若还允许存在也不能绕过中心create，撤grant helper属于之后接口清理，不是唯一freeze。

后续实现验证（本轮只列设计，未写代码/断言）：扩展tests/effects/development-campaign-store.test.ts，真实grant target_revision=active时新key仍拒绝且无definition/events/budget/lease/provider side effects；同key已存在精确replay仍返回原receipt，不同授权/key冲突；缺/坏记录仍reconcile而非新建；并发create均被同一锁/freeze拒绝。扩展已有CLI campaign测试证明错误不fallback、普通task-agent/contract/engineer/R1保持行为，保留brc10 recovery/own-claim补偿/pending/outerreplay测试。所有测试参数按批准 `--timeout 60000 --max-concurrency 1`，不得延长锁超时或改断言掩盖故障。

## 验证与交付边界

- 本报告无production/test/schema/manifest/依赖锁代码改动，无新抽象或依赖。新文件只因用户明确要求inventory交付；bun install --frozen-lockfile用于当前checkout CLI检查，lock未改。
- Existing isolated fixture test：`bun test tests/auto-campaign-skill.test.ts --timeout 60000 --max-concurrency 1` exit0，3pass/0fail/36expects，27.30s。覆盖保留Skill/默认install/grant边界，不当作freeze实现证明；fixture自身HOME/REPO_HARNESS_HOME均在临时目录，不写账号campaign store。
- 文档路径/行号/consumer表来自当前源码读取，静态引用只能支持设计/候选，不能冒称所有远端caller已迁移。完整suite不重复：本轮仅单文档、未改变运行行为，依适用integrity checks记录真实exit。
- 一次性盘点不是长期权威或定时监控；在实施drain/delete前重新只读观察known owner和所有未知项。没有现场修改policy，没有reset/kill/reassign/start/cleanup/build/prune；不处理cross-review四stale candidates，不merge/Ready/main改动。

### 本地 checks 实测结果

| 命令 | exit | 原始日志 |
|---|---:|---|
| `bun run check:hooks` | 0 | `/tmp/retire-campaign-check-01.log` |
| `bun run check:helpers` | 0 | `/tmp/retire-campaign-check-02.log` |
| `bun run check:reference-configs` | 0 | `/tmp/retire-campaign-check-03.log` |
| `bash scripts/check-deploy-sql-order.sh` | 0 | `/tmp/retire-campaign-check-04.log` |
| `bash scripts/check-architecture-sync.sh` | 0 | `/tmp/retire-campaign-check-05.log` |
| `bash scripts/check-task-sync.sh` | 0 | `/tmp/retire-campaign-check-06.log` |
| `bash scripts/check-task-workflow.sh --strict` | 0 | `/tmp/retire-campaign-check-07.log` |
| `bun scripts/inspect-project-state.ts --repo . --format text` | 0 | `/tmp/retire-campaign-check-08.log` |
| `bun src/cli/index.ts init --repo . --dry-run` | 0 | `/tmp/retire-campaign-check-09.log` |
| `bun run check:type` | 0 | `/tmp/retire-campaign-type.log` |
| `bun test tests/auto-campaign-skill.test.ts --timeout 60000 --max-concurrency 1` | 0（3pass/0fail） | `/tmp/retire-campaign-focused.log` |

账号campaign journal在只读盘点/fixture测试/本地checks前后byte inventory digest相同：`sha256:743368d0aea5c1d7c1c344ee20fc43530dff0e2c2672d0e063ef1fd7bace75fc`。这证明本轮未修改这批journal；不证明历史journal有效或其他未知authority无并发writer。
