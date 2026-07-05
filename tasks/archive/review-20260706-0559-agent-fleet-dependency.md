> **Archived**: 2026-07-06 05:59
> **Related Plan**: plans/archive/plan-20260706-0232-agent-fleet-dependency.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260706-0559

# Task Review: agent-fleet-dependency

> **Status**: Completed
> **Plan**: plans/plan-20260706-0232-agent-fleet-dependency.md
> **Contract**: tasks/contracts/20260706-0232-agent-fleet-dependency.contract.md
> **Notes File**: tasks/notes/20260706-0232-agent-fleet-dependency.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-06 03:40
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: pending
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: 计划 P1-P5 六切片面（policy + 双种子、installer + 三处清单登记、check-agent-tooling 检测器、init/migrate 装配线、external-tooling 文档 + 镜像、测试）
- Actual files changed: 24 files (+2245 −6)，六提交 1a6c2bf / 9b8d7bb / 3976137 / 62b03e2 / 90f0bef / 461ccf5，逐文件映射到切片，全部在 contract allowed_paths 内（gatekeeper diff 审）
- Commands passed: PF 电池全绿——bun test 1067 pass/0 fail/1 skip(既有)、check:type、check:hooks(projection OK: 25)、check-deploy-sql-order、check-architecture-sync(blocking=0)、check-task-sync、repo 自身 check-task-workflow --strict([workflow] OK)、migrate --dry-run、三 helper 镜像 diff、workflow-contract 双 json diff、external-tooling 镜像 diff、九个 shell 面 bash -n
- External acceptance: manual override（见 External Acceptance Advice）
- Residual risks: 全局冻结版 CLI(0.8.5) 缺新 helper 致 `repo-harness run check-task-workflow --strict` 报 Missing packaged helper runtime——分发层滞后非分支缺陷，合并后重装/重链全局 CLI 或下次发版即消（gatekeeper [MEDIUM] manual/release action）
- Reviewer action required: inspect diff and card
- Rollback: revert branch codex/agent-fleet-dependency；全局目录写入幂等 never-clobber，卸载=删两目录各三文件

## Mode Evidence

- Selected route: planning（repo-harness-plan 捕获，Approved + merge_boundary，plan-to-todo 投影 + contract worktree）
- P1/P2/P3 evidence: 计划侦察基线（HEAD 43ad4de 实测锚点）+ Explore 侦察报告折入；三项使用者拍板（policy 分级 / TOML 从 .md 生成 / never-clobber）记录于计划头部
- Root cause or plan evidence: 非 bugfix；计划 Falsifier 节记录方向性证伪面（codex-cli TOML 识别、golden 复现）

## Verification Evidence

- Waza `/check` run: gatekeeper（Opus max）验收派单替代，判定 PASS；零副作用实证（HEAD/status/diff 前后不变）
- Commands run: 见 Human Review Card "Commands passed"；gatekeeper 密闭冒烟（假 HOME + REPO_HARNESS_FLEET_SOURCE_DIR fixture 源）：全新装 6 文件 → 幂等二跑 up-to-date → 本地改动报 drift 不覆盖 → --force 恢复 → 生成三份 codex TOML 与 repo golden **byte 一致** → check-agent-tooling --host both 报 fleet present 3/3+3/3 → 空 HOME --strict-readiness 退出 2 → 真实 HOME 前后零变化
- Manual checks: dry-run 红线（migrate --dry-run 在自托管 auto-install-on-init 策略下对假 HOME 零写入，输出含 advisory 行）已由 P4 测试 + gatekeeper 冒烟双重实证
- Supporting artifacts: tasks/notes/20260706-0232-agent-fleet-dependency.notes.md（六切片 Design Decisions、两次 orchestrator 裁定：strict 门 partial 平权 461ccf5、BrainSync 环境性抖动处理、侦察勘误 helper-scripts:467 守护对象）
- Implementation notes reviewed: yes——偏差均有记录未被静默吸收
- Run snapshot: .ai/harness/checks/latest.json、.ai/harness/runs/

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- Manual Override: recorded 2026-07-06 by orchestrator — 本工作包由 gatekeeper（Opus max effort）验收派单 PASS（PF 电池 + 密闭冒烟 + diff 对照全绿）；跨厂商 Codex re-acceptance 已在 tasks/todos.md 排队，将对 authority-closure 与 agent-fleet-dependency 两个已合并 diff 一并做 fingerprint 绑定复验并取代本 override（沿 contract-intent-boundary 2affc9f 先例）。
- P1 blockers: none
- P2 advisories: 全局 CLI 重装/发版后重跑 `repo-harness run check-task-workflow --strict` 确认 packaged helper 检查转绿。
- Acceptance checklist: 内部 gatekeeper 验收为记录判定；跨厂商复验见 Manual Override 取代计划。

## Behavior Diff Notes

- policy external_tooling 新增 `fable_agents` 条目（waza 8 键形 + install_mode 双值：自托管 `auto-install-on-init`、种子默认 `advisory`——codegraph 先例同款刻意分裂）。
- 新 helper `install-agent-fleet.sh`：上游 Fable-agents `.md` 直装 `~/.claude/agents`；`~/.codex/agents` 的 TOML 按映射表从 .md 确定性生成（opus/max→gpt-5.5·xhigh、sonnet/max→gpt-5.5·medium、tools→sandbox_mode read-only、正文+EXECUTION_BOUNDARY→developer_instructions），生成结果 byte 复现三份 golden；never-clobber 默认 + `--force`；`REPO_HARNESS_FLEET_SOURCE_DIR` 本地源覆盖；helpers 四方清单登记（workflow-contract 双 json、pi_install_helpers、镜像目录）。
- check-agent-tooling 新增 `detectAgentFleet()`（HOSTS.agentsDir、per host×agent 存在性/hash、--check-updates 上游比对）并接 strict-readiness（missing|partial 均失败——orchestrator 裁定与 codegraph 平权；codegraph 判定逐字未动）。
- init/migrate 新增 `pi_maybe_install_agent_fleet()`：policy 分级（auto 且 apply 才装、失败 fail-open warn；advisory 打显式命令行）；dry-run 绝不写 HOME。
- external-tooling.md(+镜像) 新增 Agent Fleet 节（来源、双 target、映射表、双值语义、卸载清单）。

## Residual Risks / Follow-ups

- 全局冻结版 CLI 缺 packaged helper（分发滞后）：合并后 `bun add -g`/`bun link` 重装或下次 npm 发版；验证命令见 P2 advisories。
- codex-cli 对 `.codex/agents/*.toml` 的端到端识别仍为 manual verification pending（tasks/todos.md 在案，本计划 Falsifier 节列为最便宜证伪点）。
- Codex re-acceptance（两个工作包合并 diff 一并）在 tasks/todos.md 排队，取代本 review 的 Manual Override。

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 8/10 | PF 全绿 + 密闭冒烟九项全证；唯一红项为分发层滞后非代码缺陷 |
| Product depth | 8/10 | 依赖面声明/检测/安装/文档四层闭环，与 waza/codegraph 管理方式对称 |
| Design quality | 8/10 | 双值先例复用、golden byte 复现、never-clobber、dry-run 结构性红线 |
| Code quality | 8/10 | 34 个新测试零回归；镜像/清单四方一致由测试锁定 |

## Failing Items

- (none)——verify-contract 24/26 中两红（qa_scores、recommendation）由本 review 落档翻绿；packaged-helper 红属全局 CLI 分发滞后，见 Residual Risks。

## Retest Steps

- Re-run: `bun test`；`bash scripts/check-task-workflow.sh --strict`；`bash scripts/verify-contract.sh --contract tasks/contracts/20260706-0232-agent-fleet-dependency.contract.md --strict --read-only`
- Re-check: 全局 CLI 重装后 `repo-harness run check-task-workflow --strict`；交互式 codex `/agent` 三 agent 识别

## Summary

- agent fleet 升格为 external_tooling 一等依赖面：声明（policy 双值）、检测（detectAgentFleet + strict 门 partial 平权）、安装（installer golden byte 复现 + never-clobber）、装配（init/migrate policy 分级 + dry-run 红线）、文档（external-tooling + 镜像）五面齐落，PF 电池与密闭冒烟全绿，gatekeeper 验收 PASS。
