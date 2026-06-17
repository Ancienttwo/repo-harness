下面是一份可直接放进 `plans/sprints/20260616-harness-engineering-optimization.sprint.md` 的 Sprint 方案。它把外部 harness engineering 设计点转成 repo-harness 可执行 backlog，并且每个 backlog row 都带 Agent 可追踪 checklist。

---

# Sprint: Harness Engineering Optimization — State, Review, Eval, Delegation

> **Status**: Complete
> **Slug**: harness-engineering-optimization
> **Created**: 2026-06-16
> **Source Spec**: `docs/spec.md`
> **Source Research**: `docs/researches/20260616-harness-engineering-frameworks.md`
> **Goal Mode**: incremental
> **Primary Objective**: 把 repo-harness 从“可运行的 file-backed workflow”优化成“更少歧义、更强 review UX、更可评测、更适合多 Agent/多 host 的 harness control plane”。

## Research Basis

本 Sprint 基于一个核心判断：领先 coding-agent harness 的共同方向不是“更多聊天提示词”，而是**项目级持久指令、hook/guard、sandbox/worktree、review/eval、trace/state、human approval** 的组合控制面。

Anthropic Claude Code 把 `CLAUDE.md` / auto memory 作为每次 session 的上下文入口，但也明确说明这类 memory 是 context 而不是强制配置；真正阻断动作应使用 PreToolUse hook，这和 repo-harness 当前 “instructions advisory, hooks enforce” 的方向一致。([Claude API Docs][1]) Claude Code 的 subagent 设计强调把探索、日志、搜索等高噪声工作放在单独 context 中，并通过 tool restrictions、独立 permissions、较低成本模型来控制成本和风险。([Claude API Docs][2])

OpenAI Codex 的 `AGENTS.md` 采用 global → project → nested directory 的 instruction chain，并有默认 32KiB instruction cap；这说明 repo-harness 需要继续保持 root `AGENTS.md` 短小，把详细规则下沉到 reference docs / capability contexts。([OpenAI Developers][3]) Codex 的 sandbox 文档把 autonomy 分成 read-only、workspace-write、danger-full-access，并用 approval policies 控制越界操作；这对应 repo-harness 的 allowed_paths、worktree guard、external acceptance gate 需要更结构化。([OpenAI Developers][4]) Codex worktree 文档也强调一个 thread 对应稳定 worktree、可 hand off 到 local、以及分支不能被多个 worktree 同时 checkout 的 Git 约束；这支持 repo-harness 保持 contract worktree-first。([OpenAI Developers][5])

OpenAI Agents SDK 文档把 trace、grader、datasets、eval runs 作为 agent workflow 质量改进路径，并指出 trace 能记录 model calls、tool calls、guardrails、handoffs，用于发现 routing、tool choice、handoff 和 safety regressions。([OpenAI Developers][6]) 这直接对应 repo-harness 应把 `.ai/harness/runs/*.json` 从“命令结果快照”升级为“可评分的 harness trace”。OpenAI guardrails 文档也明确区分 automatic checks 和 human-in-the-loop approvals：guardrails 自动验证，human review 在敏感 side effect 前暂停。([OpenAI Developers][7])

SWE-agent 的论文核心结论是 agent-computer interface 会显著影响软件工程 Agent 表现；OpenHands 则强调 sandboxed execution、multi-agent coordination、benchmarks 和 human-facing interfaces。([arXiv][8]) ([arXiv][9]) 2026 年的 Harness-Bench 也把 harness 本身定义为管理 context、tools、state、constraints、permissions、tracing、recovery 的系统层，并认为 agent 能力应按 model+harness configuration 评估，而不是只看 base model。([arXiv][10])

repo-harness 已经具备很好的底座：README 的 Task Workflow 从 Program/Sprint 到 Plan、Contract、Hooks、Verify、Review、Closeout、Archive/Cleanup 是完整闭环。 当前根级 `AGENTS.md` 也已经明确 canonical workflow files、operating rules、required checks、worktree-first contract execution 和 Waza/gstack routing。 本 Sprint 的目标不是推翻，而是**压缩歧义、补齐人类 review 面、把 evidence 升级成可评测 trace、把 task profile 化**。

---

## Sprint Outcome

完成后，repo-harness 应达到以下状态：

1. **Filing 一致**：`tasks/todos.md`、`plans/sprints/`、Task Contract / Task Review 命名在 templates、scripts、docs、checks 中一致。
2. **Human review 友好**：每个 review 顶部都有 `Human Review Card`，人类一屏能看到 verdict、change type、files changed、commands、risk、rollback、action required。
3. **Agent tracking 更清楚**：Sprint backlog row 是 long-task waypoint；Plan 的 task breakdown 是执行 checklist；Contract 的 exit criteria 是 done gate；Current snapshot 只是 read model。
4. **Contract profile 化**：`code-change`、`docs-only`、`ledger-closeout`、`migration`、`eval-only`、`delegated-run` 有不同 allowed_paths 和 evidence expectations。
5. **Trace/eval 化**：`.ai/harness/runs/*.json` 记录足够的 run metadata，可以对 workflow regressions 做 lightweight grading。
6. **Delegation 安全**：subagent / child agent 有 read-only explorer、bounded worker、read-only verifier 三类权限模型，parent 只 narrate and gatekeep。
7. **Spec 补强**：`docs/spec.md` 不再是空壳，成为 product/harness invariants 的稳定入口。

---

## Non-goals

本 Sprint 不做以下事情：

* 不重写 Claude/Codex host adapters。
* 不引入云端服务、数据库、MCP server 或新 agent runtime。
* 不删除现有 Plan → Contract → Worktree → Verify → Review → Closeout 主流程。
* 不把 `tasks/current.md` 变成手写 kanban。
* 不自动 approve、auto-merge 或绕过 human review。
* 不默认开启 `danger-full-access` 或等价的全权限执行模式。

---

## Success Criteria

Sprint 完成时必须满足：

```bash
bun test
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bash scripts/check-architecture-sync.sh
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
```

新增或修改的 workflow fixtures 必须覆盖：

* legacy `tasks/todo.md` drift
* legacy `tasks/sprints/` drift
* review file missing `Human Review Card`
* closeout-only contract accidentally allowing runtime source edits
* trace/run snapshot missing required metadata
* contract profile with invalid allowed_paths
* delegated worker trying to edit outside allowed_paths

---

## Backlog

|  # | Status | Task                                              | Mode     | Acceptance                                                                                                                                                                                  | Plan                                                            |
| -: | :----: | ------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
|  1 |   [x]  | HE-01 Research Baseline & Harness Principles      | contract | `docs/researches/20260616-harness-engineering-frameworks.md` exists, cites external harness patterns, maps each finding to repo-harness surfaces, and produces a 10-rule principle card     | `plans/plan-20260616-HE-01-harness-research-baseline.md`        |
|  2 |   [x]  | HE-02 Filing & Terminology Normalization Gate     | contract | no templates/scripts/docs emit `tasks/todo.md` or `tasks/sprints/`; strict check detects legacy surfaces with actionable fix text; Task Contract terminology is documented                  | `plans/plan-20260616-HE-02-filing-terminology-normalization.md` |
|  3 |   [x]  | HE-03 Human Review Card                           | contract | every generated review template starts with a review card; `verify-sprint` / ship path surfaces card status; fixtures fail when card is missing or stale                                    | `plans/plan-20260616-HE-03-human-review-card.md`                |
|  4 |   [x]  | HE-04 Contract Profiles & Allowed Paths Narrowing | contract | contract template supports explicit `task_profile`; closeout-only profile cannot allow runtime code paths by default; verify-contract validates profile shape and unsupported profile fails | `plans/plan-20260616-HE-04-contract-profiles.md`                |
|  5 |   [x]  | HE-05 Trace/Eval Evidence Schema v1               | contract | `.ai/harness/runs/*.json` has required harness trace fields; `check-task-workflow --strict` validates schema; at least 5 workflow traces can be graded by a local eval script               | `plans/plan-20260616-HE-05-trace-eval-schema.md`                |
|  6 |   [x]  | HE-06 Handoff & Current Snapshot UX               | contract | `tasks/current.md` remains generated/read-only orientation; handoff current/resume include exact next step, active artifacts, and freshness; stale resume failure remains covered           | `plans/plan-20260616-HE-06-handoff-current-ux.md`               |
|  7 |   [x]  | HE-07 Delegation Contract κ v2                    | contract | delegation fields express explorer/worker/verifier roles, budgets, permission scope, and review rubric; one dogfood contract-run uses bounded worker + read-only verifier                   | `plans/plan-20260616-HE-07-delegation-kappa-v2.md`              |
|  8 |   [x]  | HE-08 Spec & Onboarding Compression               | contract | `docs/spec.md` becomes non-empty stable intent; README adds human-review path; reference docs include “what Agent reads first vs what human reviews first”                                  | `plans/plan-20260616-HE-08-spec-onboarding-compression.md`      |
|  9 |   [x]  | HE-09 Dogfood Closeout & Migration                | contract | this Sprint is closed through repo-harness itself: row completion, review pass, checks snapshot, archive-ready plans, and no unrelated dirty files absorbed                                | `plans/plan-20260616-HE-09-dogfood-closeout.md`                 |

---

## Sprint Execution Log

| Task | Status | Execution evidence |
|---|---|---|
| HE-01 | Complete | Research artifact, task contract, notes, review, and workflow check recorded. |
| HE-02 | Complete | Terminology/path gate implemented, helper tests passed, review recorded. |
| HE-03 | Complete | Human Review Card template/gate implemented, helper/hook tests passed, review recorded. |
| HE-04 | Complete | Task profiles and allowed-path validation implemented, contract verification passed. |
| HE-05 | Complete | Trace schema, local trace fixtures, and grader implemented; latest trace shape verified. |
| HE-06 | Complete | Handoff/current UX updated; handoff status and workflow checks passed. |
| HE-07 | Complete | Delegation role contract and contract-run tests passed. |
| HE-08 | Complete | Spec/README/reference onboarding compressed and README DX tests passed. |
| HE-09 | Complete | Full required checks, local closeout review, trace grading, and staged diff boundary. |

---

# Task Details and Agent Checklists

## HE-01 Research Baseline & Harness Principles

**Goal**
建立一个 repo-local research artifact，把 Anthropic / OpenAI / OpenHands / SWE-agent / Harness-Bench 的公开设计原则映射到 repo-harness 当前 surfaces，避免优化只凭直觉。

**Files likely touched**

* `docs/researches/20260616-harness-engineering-frameworks.md`
* `docs/reference-configs/harness-overview.md`
* `docs/reference-configs/agentic-development-flow.md`
* `tasks/notes/<plan-stem>.notes.md`

**Agent checklist**

* [x] 创建 research doc，分为 `External Patterns`、`Repo-Harness Current State`、`Gap Analysis`、`Principles`、`Sprint Implications`。
* [x] 记录 Claude Code 模式：`CLAUDE.md`/auto memory 是 context，hook 是 enforcement；subagents 用于 context isolation 和 permission restriction。
* [x] 记录 Codex 模式：`AGENTS.md` layered instructions、sandbox modes、approval policies、worktree handoff、review pane。
* [x] 记录 OpenAI Agents 模式：trace、grader、datasets、eval runs、guardrails、human approvals、resumable state。
* [x] 记录 OpenHands / SWE-agent 模式：agent-computer interface、sandbox execution、multi-agent coordination、benchmark-first。
* [x] 把每条外部模式映射到 repo-harness 文件：`AGENTS.md`、policy、plan、contract、review、runs、handoff、current、worktree。
* [x] 输出 “Harness Engineering 10 Rules”：

  * [x] repo files are authority, chat is transient
  * [x] instructions advise, hooks enforce
  * [x] worktree/sandbox is the execution boundary
  * [x] contract defines permissions and done
  * [x] review is for humans first
  * [x] runs are traces, not just check logs
  * [x] current status is derived, never handwritten
  * [x] delegation must be role/budget/permission scoped
  * [x] eval before cutover
  * [x] migration must preserve user-authored files

**Verification**

```bash
grep -n "Harness Engineering 10 Rules" docs/researches/20260616-harness-engineering-frameworks.md
bash scripts/check-task-workflow.sh --strict
```

**Done gate**

* [x] Research file exists.
* [x] At least 8 external facts are cited.
* [x] At least 8 repo-harness surfaces are mapped.
* [x] No code changes in this task unless required by docs tests.

---

## HE-02 Filing & Terminology Normalization Gate

**Goal**
修复当前最影响 Agent 信任的 drift：`tasks/todo.md` vs `tasks/todos.md`、`tasks/sprints/` vs `plans/sprints/`、Sprint Contract vs Task Contract 术语混用。此前 closeout artifact 已暴露这类路径 drift：plan 中仍出现 `tasks/todo.md` 和 `tasks/sprints/...` 旧路径，而当前 policy 指向 `tasks/todos.md` 与 `plans/sprints`。

**Files likely touched**

* `scripts/check-task-workflow.sh`
* `scripts/ensure-task-workflow.sh`
* `scripts/plan-to-todo.sh`
* `.claude/templates/*.template.md`
* `docs/reference-configs/sprint-contracts.md`
* `tests/helper-scripts.test.ts`
* `tests/readme-dx.test.ts`

**Agent checklist**

* [x] Inventory current path constants from `.ai/harness/policy.json`.
* [x] Search repo for stale path strings:

  * [x] `tasks/todo.md`
  * [x] `tasks/sprints/`
  * [x] `Sprint Contract:` in user-facing docs/templates where meaning is execution slice
  * [x] `Sprint Review:` where meaning is task review
* [x] Update templates to use:

  * [x] `tasks/todos.md`
  * [x] `plans/sprints/`
  * [x] `Task Contract`
  * [x] `Task Review`
* [x] Keep script filenames `verify-sprint.sh` / `sprint-backlog.sh` for backward compatibility, but document them as legacy names.
* [x] Add `check-task-workflow.sh --strict` detection for stale path references in active plans/contracts/reviews/templates.
* [x] Add fix text: “migrate `tasks/todo.md` to `tasks/todos.md`” and “migrate `tasks/sprints/*.sprint.md` to `plans/sprints/`”.
* [x] Add tests for:

  * [x] stale todo path
  * [x] stale sprint directory
  * [x] accepted legacy script names
  * [x] disallowed legacy artifact path in new templates

**Verification**

```bash
grep -R "tasks/todo.md\|tasks/sprints/" .claude/templates scripts docs/reference-configs README.md README.zh-CN.md
bash scripts/check-task-workflow.sh --strict
bun test tests/helper-scripts.test.ts tests/readme-dx.test.ts
```

**Done gate**

* [x] No new generated artifact uses stale paths.
* [x] Existing historical archive can remain, but active artifacts/templates cannot.
* [x] Strict workflow check reports actionable issues for stale active paths.

---

## HE-03 Human Review Card

**Goal**
让人类 reviewer 一屏判断：这是什么变更、改了什么、什么检查过了、有什么风险、需要 reviewer 做什么、如何回滚。当前 review 内容很完整，但分散在 Verification Evidence、External Acceptance、Behavior Diff、Residual Risks、Retest Steps 中。

**Files likely touched**

* `.claude/templates/review.template.md`
* `scripts/plan-to-todo.sh`
* `scripts/verify-sprint.sh`
* `scripts/ship-worktrees.sh`
* `assets/templates/helpers/*`
* `tests/helper-scripts.test.ts`
* `tests/readme-dx.test.ts`

**Review Card target format**

```md
## Human Review Card

- Verdict: pending | pass | fail
- Change type: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run
- Intended files changed:
- Actual files changed:
- Commands passed:
- External acceptance:
- Residual risks:
- Reviewer action required:
- Rollback:
```

**Agent checklist**

* [x] Add `## Human Review Card` to review template above `## Mode Evidence`.
* [x] Add template placeholders that fail safe:

  * [x] `Verdict: pending`
  * [x] `External acceptance: unavailable`
  * [x] `Reviewer action required: inspect diff and card`
* [x] Update `plan-to-todo.sh` review rendering so generated reviews include the card.
* [x] Update `verify-sprint.sh` to parse:

  * [x] top-level recommendation
  * [x] card verdict
  * [x] external acceptance status
* [x] Decide gate behavior:

  * [x] Recommendation pass + card verdict pass required
  * [x] External acceptance either pass/manual_override or explicitly “not required” for local-only docs tasks
* [x] Add tests for missing/stale card.
* [x] Add docs explaining card is for humans; contract exit criteria remains machine gate.

**Verification**

```bash
grep -n "## Human Review Card" .claude/templates/review.template.md
bun test tests/helper-scripts.test.ts
bash scripts/check-task-workflow.sh --strict
bash scripts/check-task-sync.sh
```

**Done gate**

* [x] New review files start with Human Review Card.
* [x] `verify-sprint` fails when review recommends pass but card verdict is missing or fail.
* [x] `repo-harness-ship` / closeout summary can surface the card without reading the whole review.

---

## HE-04 Contract Profiles & Allowed Paths Narrowing

**Goal**
避免 “ledger-only closeout” contract 误把 runtime files 加入 allowed_paths。之前 `loop-engine-01-workflow-closeout` 是 ledger-only，但 allowed_paths 包含 runtime source/test files；review 又明确这些 runtime files 没有被编辑。

**Files likely touched**

* `.claude/templates/contract.template.md`
* `.claude/templates/plan.template.md`
* `scripts/plan-to-todo.sh`
* `scripts/verify-contract.sh`
* `scripts/check-task-workflow.sh`
* `docs/reference-configs/sprint-contracts.md`
* `tests/helper-scripts.test.ts`

**Profiles**

| Profile           | Default writable surface                                                             | Human expectation                            |
| ----------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| `code-change`     | plan, contract, review, notes, source, tests, docs touched by code                   | normal implementation                        |
| `docs-only`       | docs, plans, notes, reviews                                                          | no runtime code                              |
| `ledger-closeout` | plans, sprint file, contract, review, notes, checks/handoff if runtime state allowed | no behavior change                           |
| `migration`       | scripts/templates/assets/docs/tests                                                  | must preserve user-authored files            |
| `eval-only`       | tests/evals/runs/docs/reviews                                                        | no product behavior cutover                  |
| `delegated-run`   | contract-defined worker paths only                                                   | parent gates, worker edits, verifier reviews |

**Agent checklist**

* [x] Add `> **Task Profile**:` field to contract template.
* [x] Add profile schema to `verify-contract.sh`.
* [x] Add profile-specific warnings:

  * [x] `ledger-closeout` cannot include `src/` by default.
  * [x] `docs-only` cannot include `src/` or `tests/` unless explicitly justified.
  * [x] `eval-only` cannot change runtime behavior files unless marked as fixture-only.
* [x] Add `allowed_paths` explanation per profile in docs.
* [x] Modify plan capture / plan-to-todo projection to infer profile if provided in plan metadata.
* [x] Add tests for valid/invalid profiles.
* [x] Update existing examples to use `Task Profile`.

**Verification**

```bash
bash scripts/verify-contract.sh --contract tasks/contracts/<fixture>.contract.md --strict
bun test tests/helper-scripts.test.ts
bash scripts/check-task-workflow.sh --strict
```

**Done gate**

* [x] `ledger-closeout` profile narrows writable paths.
* [x] Invalid profile fails with clear message.
* [x] Existing old contracts without profile remain valid but get advisory migration hint.

---

## HE-05 Trace/Eval Evidence Schema v1

**Goal**
把 `.ai/harness/runs/*.json` 从 “verify-sprint 结果” 升级为 “harness trace”。OpenAI 的 trace/eval 文档说明 trace 应覆盖 model calls、tool calls、guardrails、handoffs、custom spans，并可用 graders 评估 routing、handoff、policy violations 和 prompt changes。([OpenAI Developers][11]) ([OpenAI Developers][6]) repo-harness 现有 verify-sprint 已会写 latest checks 和 run snapshot，这是很好的落点。

**Files likely touched**

* `scripts/verify-sprint.sh`
* `scripts/verify-contract.sh`
* `scripts/check-task-workflow.sh`
* `scripts/inspect-project-state.ts`
* `.ai/harness/workflow-contract.json`
* `assets/workflow-contract.v1.json`
* `tests/helper-scripts.test.ts`
* `tests/cli/*.test.ts`

**Required trace schema v1**

```jsonc
{
  "schema": "repo-harness-run-trace.v1",
  "run_id": "...",
  "task_profile": "...",
  "active_plan": "...",
  "contract": "...",
  "review": "...",
  "worktree": "...",
  "branch": "...",
  "commands": [],
  "guards": [],
  "handoffs": [],
  "external_acceptance": {},
  "files_changed": [],
  "allowed_paths_check": {},
  "status": "pass|fail",
  "failure_class": "...",
  "next_step": "..."
}
```

**Agent checklist**

* [x] Define schema doc in `docs/reference-configs/harness-overview.md` or new `trace-evidence.md`.
* [x] Update `verify-sprint.sh` output with schema field and task profile.
* [ ] Include:

  * [x] command list
  * [x] contract verification result
  * [x] review/card status
  * [x] external acceptance status
  * [x] allowed_paths result
  * [x] dirty file summary
  * [x] active plan / worktree markers
* [x] Add `scripts/harness-trace-grade.sh` or TypeScript equivalent with 5 local graders:

  * [x] active plan resolves
  * [x] contract profile valid
  * [x] review card pass
  * [x] commands evidence present
  * [x] no changed file outside allowed_paths
* [x] Add fixtures under `tests/fixtures/harness-traces/`.
* [x] Make strict workflow check validate latest trace minimally.

**Verification**

```bash
bash scripts/verify-sprint.sh
jq '.schema' .ai/harness/checks/latest.json
bash scripts/harness-trace-grade.sh --run .ai/harness/checks/latest.json --strict
bun test tests/helper-scripts.test.ts
```

**Done gate**

* [x] Latest checks is a valid `repo-harness-run-trace.v1`.
* [x] At least 5 trace fixtures are graded.
* [x] Trace schema does not require external cloud services.

---

## HE-06 Handoff & Current Snapshot UX

**Goal**
保持 `tasks/current.md` 是 generated read model，不让它变成任务源；同时让 handoff 对 Agent 恢复更直接。当前 `tasks/current.md` 已明确自己不是 live lock、不是 kanban、不是 implementation gate。 Handoff protocol 也要求记录 goal、decisions、files touched、commands、checks、blockers、exact next step、resume prompt、source artifacts。

**Files likely touched**

* `scripts/refresh-current-status.sh`
* `scripts/prepare-handoff.sh`
* `.ai/hooks/session-start-context.sh`
* `.ai/hooks/stop-orchestrator.sh`
* `docs/reference-configs/handoff-protocol.md`
* `tests/helper-scripts.test.ts`

**Agent checklist**

* [x] Update handoff template to always include:

  * [x] Active plan
  * [x] Active contract
  * [x] Active sprint row
  * [x] Review file
  * [x] Latest trace/checks file
  * [x] Exact next step
  * [x] Blockers
  * [x] Resume prompt
* [x] Ensure `resume.md` is regenerated whenever `current.md` is newer.
* [x] Keep freshness check from `check-task-workflow.sh`.
* [x] Add “source artifacts first” rule to handoff docs.
* [x] Add a small `repo-harness-handoff status` output mode if not already present.
* [x] Add tests:

  * [x] stale resume
  * [x] current says idle but active marker exists
  * [x] resume references archived plan
  * [x] non-target worktree reads target snapshot but verifies source artifacts

**Verification**

```bash
bash scripts/prepare-handoff.sh --reason "HE-06 verification"
bash scripts/check-task-workflow.sh --strict
bun test tests/helper-scripts.test.ts
```

**Done gate**

* [x] Handoff restore path is deterministic.
* [x] Agent can resume from handoff without reading previous chat.
* [x] `tasks/current.md` remains generated and checklist-free.

---

## HE-07 Delegation Contract κ v2

**Goal**
把 delegation 从 metadata 升级为可执行但保守的 contract surface。Anthropic subagent 文档强调 subagents 用于 context isolation、tool restrictions、independent permissions 和成本控制；OpenAI human-review docs 则强调 side effect 前 pause/approval。([Claude API Docs][2]) ([OpenAI Developers][7]) repo-harness 已有 delegation contract fields 的雏形，当前 docs 说 budget、permission_scope、roles 是 forward-compatible metadata，旧 contract 仍有效。

**Files likely touched**

* `.claude/templates/contract.template.md`
* `scripts/contract-run.ts`
* `scripts/verify-contract.sh`
* `scripts/contract-worktree.sh`
* `docs/reference-configs/sprint-contracts.md`
* `tests/cli/contract-run*.test.ts`
* `tests/helper-scripts.test.ts`

**Delegation roles**

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent: narrate_and_gatekeep
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
```

**Agent checklist**

* [x] Update delegation YAML template with explorer/worker/verifier role separation.
* [x] Make verifier rubric equal to contract exit criteria, not a new invented rubric.
* [x] Add budget handling:

  * [x] null = session default
  * [x] explicit number = hard or advisory limit, documented
* [x] Add permission handling:

  * [x] explorer read-only
  * [x] worker allowed_paths only
  * [x] verifier read-only, review file only if explicitly allowed
* [x] Add contract-run dry-run mode that prints delegation plan without running child agent.
* [x] Add dogfood pilot on a safe docs-only or ledger-closeout task.
* [x] Record worker/verifier outputs in `.ai/harness/runs/*.json`.

**Verification**

```bash
bun test tests/cli/contract-run*.test.ts
bash scripts/verify-contract.sh --contract tasks/contracts/<delegation-fixture>.contract.md --strict
bash scripts/check-task-workflow.sh --strict
```

**Done gate**

* [x] Delegation cannot widen allowed_paths silently.
* [x] Parent remains the approval/checkpoint owner.
* [x] Verifier produces review against contract exit criteria only.
* [x] One real repo-harness task uses the v2 delegation shape.

---

## HE-08 Spec & Onboarding Compression

**Goal**
补齐 `docs/spec.md`，并压缩人类/Agent onboarding。当前 repo-harness 把 `docs/spec.md` 定义为 stable product intent，但当前文件几乎为空。

**Files likely touched**

* `docs/spec.md`
* `README.md`
* `README.zh-CN.md`
* `docs/reference-configs/harness-overview.md`
* `docs/reference-configs/agentic-development-flow.md`
* `docs/reference-configs/document-generation.md`
* `AGENTS.md`
* `CLAUDE.md`

**Agent checklist**

* [x] Expand `docs/spec.md` with:

  * [x] Product outcome
  * [x] Primary users
  * [x] Non-goals
  * [x] Core invariants
  * [x] Workflow surfaces
  * [x] Safety boundaries
  * [x] Human review expectations
  * [x] Acceptance scenarios
* [x] Add README section: “Human Review Path”.
* [x] Add README section: “Agent Tracking Path”.
* [x] Ensure `AGENTS.md` remains short.
* [x] Move detailed rules to reference docs.
* [x] Add a table: “Agent reads first” vs “Human reviews first”.
* [x] Update Chinese README equivalently.
* [x] Add tests for docs/readme consistency.

**Verification**

```bash
grep -n "Product Outcome\|Core Invariants\|Human Review" docs/spec.md
bun test tests/readme-dx.test.ts
bash scripts/check-task-workflow.sh --strict
```

**Done gate**

* [x] `docs/spec.md` is no longer placeholder-only.
* [x] Human reviewer can understand workflow from README + Review Card.
* [x] Agent can understand execution from AGENTS + active plan + contract.

---

## HE-09 Dogfood Closeout & Migration

**Goal**
用 repo-harness 自己关闭这个 Sprint，验证优化不是纸面设计。repo-harness 当前 `repo-harness-ship` 默认应验证 review/check evidence、finish worktree、push branch、create draft PR；它不自动 merge，不发布 release，不吸收 unrelated dirty changes。

**Files likely touched**

* `plans/sprints/20260616-harness-engineering-optimization.sprint.md`
* each task plan / contract / review / notes
* `.ai/harness/checks/latest.json`
* `.ai/harness/runs/*.json`
* `docs/CHANGELOG.md`

**Agent checklist**

* [x] Verify every Sprint row has:

  * [x] concrete acceptance line
  * [x] plan link
  * [x] status
  * [x] execution log entry
* [x] Ensure each task has:

  * [x] plan
  * [x] contract
  * [x] notes
  * [x] review
  * [x] trace/checks
* [x] Run full checks.
* [x] Write final Sprint Review.
* [x] Add changelog entry.
* [x] Run `repo-harness-ship` or equivalent local closeout path.
* [x] Confirm no unrelated dirty files are included.
* [x] Archive completed plans.
* [x] Clear active markers only after closeout.

Archive note: this staged-only request uses the repo-harness equivalent local
closeout path. Plans are archive-ready and should be moved by the later PR/local
finish operation, because running `archive-workflow.sh` now would split the
staged review unit before the user-requested staging boundary.

**Verification**

```bash
git status --short --branch
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun test
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
```

**Done gate**

* [x] Sprint review recommends pass.
* [x] Human Review Card verdict is pass.
* [x] Latest trace status is pass.
* [x] Sprint backlog rows all complete or explicitly deferred with tradeoff/revisit trigger.
* [x] No tracked active-plan marker points to completed work.

---

# Cross-Sprint Agent Tracking Rules

## Agent progress source of truth

Use this priority order:

1. Active plan `## Task Breakdown`
2. Active contract `exit_criteria`
3. Active review `Human Review Card`
4. `.ai/harness/checks/latest.json`
5. `.ai/harness/runs/*.json`
6. `tasks/current.md` only as orientation
7. Handoff files only for session resume

## Per-task checklist protocol

Every task plan should include this exact checklist block:

```md
## Agent Progress Checklist

### Discovery
- [ ] Read AGENTS.md / CLAUDE.md
- [ ] Read active sprint row
- [ ] Read relevant docs/reference-configs
- [ ] Identify allowed_paths
- [ ] Identify verification commands

### Implementation
- [ ] Confirm active plan is Approved/Executing
- [ ] Confirm active worktree marker matches current worktree
- [ ] Edit only allowed paths
- [ ] Update notes for non-obvious decisions
- [ ] Keep deferred goals in tasks/todos.md only if truly deferred

### Verification
- [ ] Run task-specific tests
- [ ] Run workflow checks
- [ ] Generate latest checks trace
- [ ] Fill review file
- [ ] Fill Human Review Card
- [ ] Record residual risks

### Closeout
- [ ] Contract fulfilled
- [ ] Review recommends pass
- [ ] External acceptance pass/manual override/not-required is recorded
- [ ] Sprint row completed
- [ ] Handoff refreshed
- [ ] Plan archived or ready for PR closeout
```

## Task profile selection rule

| Situation                                        | Profile           |
| ------------------------------------------------ | ----------------- |
| Runtime behavior changes                         | `code-change`     |
| Only docs/reference configs/readme               | `docs-only`       |
| Only closing already-landed workflow ledger      | `ledger-closeout` |
| Moving/renaming generated workflow files         | `migration`       |
| Adding benchmarks/evals without behavior cutover | `eval-only`       |
| Child agent edits or verifies work               | `delegated-run`   |

## Required review card states

| Field                      | Pass condition                                           |
| -------------------------- | -------------------------------------------------------- |
| `Verdict`                  | `pass`                                                   |
| `Change type`              | equals contract `task_profile`                           |
| `Intended files changed`   | matches allowed_paths intent                             |
| `Actual files changed`     | no unrelated files                                       |
| `Commands passed`          | names commands, not “all passed”                         |
| `External acceptance`      | `pass`, `manual_override`, or `not_required` with reason |
| `Residual risks`           | either concrete list or `(none)`                         |
| `Reviewer action required` | explicit                                                 |
| `Rollback`                 | concrete command or branch/revert surface                |

---

# Suggested Sprint Execution Order

1. **HE-01 first** because it anchors the research and decision basis.
2. **HE-02 before template changes** because path/terminology drift will otherwise pollute new artifacts.
3. **HE-03 + HE-04 together** because Human Review Card and Contract Profile should agree on change type.
4. **HE-05 after HE-03/04** because trace schema should include card/profile fields.
5. **HE-06 after HE-05** because handoff should point to the new trace fields.
6. **HE-07 after HE-04/05** because delegation needs profile and trace support.
7. **HE-08 after terminology stabilizes** so onboarding docs do not capture obsolete names.
8. **HE-09 last** to dogfood the optimized closeout path.

---

# Risks and Mitigations

| Risk                                             | Likelihood | Impact | Mitigation                                                                              |
| ------------------------------------------------ | ---------: | -----: | --------------------------------------------------------------------------------------- |
| Scope creep into full agent runtime              |     Medium |   High | Keep Sprint bounded to repo-local harness files, no cloud service or new DB             |
| Breaking legacy adopted repos                    |     Medium |   High | Preserve legacy script names; add advisory migration before hard failure                |
| Review Card becomes another stale artifact       |     Medium | Medium | Make `verify-sprint` parse and gate card status                                         |
| Trace schema becomes too heavy                   |     Medium | Medium | Start with v1 minimal fields; add optional spans later                                  |
| Contract profiles over-constrain legitimate work |     Medium | Medium | Allow explicit override with justification and review-card visibility                   |
| Delegation creates hidden child-agent behavior   |     Medium |   High | Require parent-owned trace, role permissions, and verifier rubric tied to exit criteria |
| Docs grow too large for Agent context            |     Medium | Medium | Keep root AGENTS/CLAUDE short; put deep docs in reference-configs and capability docs   |

---

# Final Sprint Definition of Done

This Sprint is done only when:

* [x] All backlog rows are `[x]` or explicitly deferred with tradeoff and revisit trigger.
* [x] `docs/spec.md` is meaningful and no longer placeholder-only.
* [x] All new review files include Human Review Card.
* [x] New contracts include or tolerate `Task Profile`.
* [x] `check-task-workflow --strict` catches legacy path drift.
* [x] `.ai/harness/checks/latest.json` conforms to trace schema v1.
* [x] At least one real repo-harness task dogfoods the new review/profile/trace closeout.
* [x] Full required checks pass.
* [x] Final Sprint Review recommends pass.
* [x] Closeout does not absorb unrelated dirty files.

[1]: https://docs.anthropic.com/en/docs/claude-code/memory "How Claude remembers your project - Claude Code Docs"
[2]: https://docs.anthropic.com/en/docs/claude-code/sub-agents "Create custom subagents - Claude Code Docs"
[3]: https://developers.openai.com/codex/guides/agents-md "Custom instructions with AGENTS.md – Codex | OpenAI Developers"
[4]: https://developers.openai.com/codex/concepts/sandboxing "Sandbox – Codex | OpenAI Developers"
[5]: https://developers.openai.com/codex/app/worktrees "Worktrees – Codex app | OpenAI Developers"
[6]: https://developers.openai.com/api/docs/guides/agent-evals "Evaluate agent workflows | OpenAI API"
[7]: https://developers.openai.com/api/docs/guides/agents/guardrails-approvals "Guardrails and human review | OpenAI API"
[8]: https://arxiv.org/abs/2405.15793?utm_source=chatgpt.com "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering"
[9]: https://arxiv.org/abs/2407.16741?utm_source=chatgpt.com "OpenHands: An Open Platform for AI Software Developers as Generalist Agents"
[10]: https://arxiv.org/abs/2605.27922?utm_source=chatgpt.com "Harness-Bench: Measuring Harness Effects across Models in Realistic Agent Workflows"
[11]: https://developers.openai.com/api/docs/guides/agents/integrations-observability "Integrations and observability | OpenAI API"
