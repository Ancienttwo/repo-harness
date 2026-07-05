# Plan: Authority Closure: distill think/hunt/check/geju below the delegation boundary + symmetric Codex fleet

> **Status**: Executing
> **Created**: 20260705-1938
> **Slug**: authority-closure
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260705-1938-authority-closure.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260705-1938-authority-closure.md`; after execution revert branch `codex/authority-closure` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260705-1938-authority-closure.contract.md`
> **Task Review**: `tasks/reviews/20260705-1938-authority-closure.review.md`
> **Implementation Notes**: `tasks/notes/20260705-1938-authority-closure.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260705-1938-authority-closure.md`
- Sprint contract: `tasks/contracts/20260705-1938-authority-closure.contract.md`
- Sprint review: `tasks/reviews/20260705-1938-authority-closure.review.md`
- Implementation notes: `tasks/notes/20260705-1938-authority-closure.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260705-1938-authority-closure.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260705-1938-authority-closure.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260705-1938-authority-closure.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260705-1938-authority-closure.contract.md`
- Review file: `tasks/reviews/20260705-1938-authority-closure.review.md`
- Implementation notes file: `tasks/notes/20260705-1938-authority-closure.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260705-1938-authority-closure.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260705-1938-authority-closure.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260705-1938-authority-closure.md`; after execution revert branch `codex/authority-closure` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260705-1938-authority-closure.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260705-1938-authority-closure.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: 跨十余个分发/gate 面（模板五副本、policy 三种子、双解析器 gate、reference-configs 文档镜像、fleet 文件）的一揽子权威闭合改造，含 verify-contract 对外承诺的显式修订，构成独立分支 `codex/authority-closure` 的合并单元，无法压成单行 checklist。

## Evidence Contract

- **State/progress path**: `plans/plan-20260705-1938-authority-closure.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260705-1938-authority-closure.contract.md`, `tasks/reviews/20260705-1938-authority-closure.review.md`, and `tasks/notes/20260705-1938-authority-closure.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260705-1938-authority-closure.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260705-1938-authority-closure.md`; after execution revert branch `codex/authority-closure` or the explicitly reviewed diff.

## Captured Planning Output

# Authority Closure：把 think/hunt/check/geju 萃取到委派边界以下 + 对称 Codex 舰队

> 本档承接 `dev-loop-distillation`（已合并归档）。核心原则来自 Opus + Codex 双轨独立收敛的结论：
> **Authority Closure（权威闭合）——凡是影响 pass/fail、改文件、安全边界、发布判断、root-cause 标准、review 证据、worker handoff 的规则，必须闭合在 repo artifact（contract/gate）里；live skill 只做 contract 生成前的非权威探索。live skill 的输出可进 contract，进了就以 contract 为准。**
> 关键姿势：**萃取产物与行为证据，不萃取推理过程。** 判断留在 live、留在 orchestrator 层（Opus / gpt-5.5·xhigh）；contract 只冻结「决策 + 可证伪证据要求」。gate 校验**行为证据**（bugfix 的 pre-fix 失败 artifact + 回归测试），不校验散文段落——防 gate-gaming。
> 执行者注意：每个切片都有 STOP 条件，命中就停下回报，不即兴发挥。

## Context（为什么做）

四个外部方法论技能 think/hunt/check（Waza）/geju（hai-stack）目前是 live 依赖：提示词加载在编排者 context 里驱动行为。问题是这套 context **到不了跨 host/跨进程/跨厂商的 worker**（同 `dev-loop` 研究里「native hooks 到不了 file-coupled 路径」的结论）。同一份 contract 交给不同宿主、不同安装版本的 worker，只要行为依赖 live prompt，就会产出不同执行路径，而 verifier 只看 contract、证明不了 worker 有没有按隐藏方法论走——live skill 于是成了第二套没版本化、会漂移的 authority。

结论（双轨一致）：**生产链路（orchestrator→worker→verifier→CI gate）按 B——萃取；contract 生成前的探索（开局、出 thesis、比 options）留 live 依赖。** 前提「上游更新可再度萃取」已消掉萃取唯一缺点（stale），残留风险靠黄金范例守护测试（防萃取质量下滑）+ 行为证据 gate（防 gate-gaming）双重兜底。

think→contract、check→exit_criteria 在 `dev-loop` 已基本落地。本计划补：**hunt 的 root-cause 行为证据契约、geju 的产物冻结、对称 Codex 舰队**。（EXECUTION_BOUNDARY 反-extras 条款原列本计划 E1，`contract-intent-boundary` 已先行落到全部 runner 面，本版删除 E1，F1 保留到面断言。）

## 侦察基线（2026-07-05 Fable 复审重校：HEAD a409656 = origin/main，tree 干净，仅本计划与复审 handoff 未跟踪）

> 初版基线取自 95077e1；其后 `contract-intent-boundary`（plan-20260705-1455）合入 main，改动了本计划锚定的大部分文件。以下为 a409656 实测锚点，执行者以此为准。

- contract-run.ts（scripts/ 与 assets/templates/helpers/ byte 一致）：`parseList`:230（**只吃简单 `- value`**，:241 的 break 规则吃不了嵌套 `tests_pass.path`——H2 需新增最小嵌套解析）、`parseDelegation`:282、`parseRunner`:306、`sectionBody`:317、`isConcreteBrief`:333、`runBriefPreflight`:376-398（**行为已变**：In scope / Out of scope 各自独立查具体性）、`writePrompt`:430、`buildRun`:434-654；`EXECUTION_BOUNDARY` 常量 :66-74，已注入 worker prompt :516-518；manifest 已有 `runner_usage{used,off_policy}`。
- **EXECUTION_BOUNDARY 反-extras 条款已全面落地**（intent-boundary 完成，原 E1 删除）："forbidden design space" 现于 `scripts/contract-run.ts:67`(+镜像)、`assets/hooks/codex-delegation-advisor.sh:175`、`assets/hooks/subagent-start-context.sh:117`（两 hook 为 Codex 运行时，`.ai/hooks/` 投影同行号）、`src/cli/mcp/tools.ts:613`（`renderCodexGoalFromSprint`）、`CLAUDE.md:39`/`AGENTS.md:39`，且有 canonical 句 parity 测试（`tests/workflow-contract.test.ts:65` 一带）。**任何切片不得注入第二段字面不同的条款。**
- policy.json：`.delegation`:194-206（`preferred_runners`:201、`fallback_runner`:202、`runner_rule`:204）；`.external_tooling`:309-378（`waza` 条目 :322-336 为 G1 hai-stack 条目的结构范本、`codex_automation_profile.required_skills`:338-342）；grep `geju` 0 命中。policy 默认值种子：`scripts/ensure-task-workflow.sh:932`(+镜像同行号)、`scripts/lib/project-init-lib.sh:1884`（**无 helper 镜像**，见下）。
- **project-init-lib.sh 无 helper 镜像**：`package.json:19` 直接船运 `scripts/`；`assets/templates/helpers/` 只镜像会被拷进脚手架项目的顶层脚本。`PI_TEMPLATE_CONTRACT`(:237-336) 与 ensure-task-workflow 内嵌模板(:378-477) 目前逐字节一致但**无测试锁**（`tests/helper-scripts.test.ts:411-422` 只测顶层 helpers）——T1 补测试。
- 模板 surface 现状（五副本）：`assets/templates/contract.template.md`(123行) 与 `.claude/templates/contract.template.md`(122行) **已漂移**——intent-boundary 只给 assets 侧加了 `Taste constraints`(:25)；`scripts/plan-to-todo.sh render_contract_file`:408 heredoc:423-537(+镜像)；ensure-task-workflow:378-477 与 project-init-lib:238-335 两份种子**缺整节** `> **Exemplar**:`、`## Why`、`## Stop Conditions`（缺 Why = 下游种子模板生成的 contract 天然过不了 contract-run brief preflight）。五副本 exit_criteria 均含死命令 `bun run typecheck`（实名 `check:type`，package.json:38）。模板现有 `##` 节无 Falsifier、无 Root Cause Evidence。
- verify-contract.sh(705行，镜像 byte 一致)：独立 bash YAML 解析（tests_pass 段 :416-417、`- path:` 收集 :477-480；tests_pass 只在**当前代码**上跑 :574-591），与 contract-run.ts TS 解析是两套实现、无共享库。`read_contract_task_profile`:90-93 读 `> **Task Profile**:` header；枚举校验 :526-536（**缺失=legacy 放行 :527-529，即 task_profile 非必填**）；profile-path 限制 :538-552。`docs/reference-configs/sprint-contracts.md:67` 明文承诺 exit_criteria-only（**该文档有 `assets/reference-configs/` 镜像**）。
- **task_profile 枚举有两个所有者**：`verify-contract.sh:530` 与 `harness-trace-grade.sh:94`(+镜像)；后者 :108-111 还要求 review card `change_type` 与 profile 相等；trace fixtures 按 profile 命名（`tests/fixtures/harness-traces/<profile>-pass.json` 现有五个）。root-cause 目前只有 `agentic-development-flow.md:14` 一句 prose。
- geju 落点：`assets/skill-commands/repo-harness-prd/SKILL.md`:9-42、`assets/skill-commands/manifest.json:109-110`、`docs/reference-configs/agentic-development-flow.md:39`（**+ assets/reference-configs/ 镜像同行**）；关联面 `tests/action-command-skills.test.ts:228-236` 断言 geju 字符串；README×5 亦提及（G3 不改）。`docs/reference-configs/external-tooling.md`(+镜像) 对 hai-stack/geju **0 命中**——G1 是新增条目而非复核既有条目。无 `repo-harness-geju` 技能；`render_contract_file` 是唯一把 Why/Goal/Scope 写死进 .contract.md 的地方；渲染后 advisory 现有两个范式：`maybe_advise_contract_brief_preflight`:625（调用点 :1014）与 Non-scope carry-forward :559-609。
- agents：`.claude/agents/` **目录已不存在**（初版基线的三份未跟踪文件已移至 `~/.claude/agents/`，实测三文件在；`.claude/agents` 不被 gitignore）；`.gitignore:69` `.codex/*` 无任何 negation 例外；`~/.codex/agents/` 不存在；本机 codex-cli 0.141.0；`~/.codex/config.toml` 进程级默认 `model="gpt-5.5"`、`model_reasoning_effort="xhigh"`。
- **Codex custom-agent TOML schema 已核实**（官方 `developers.openai.com/codex/subagents`，2026-07-05 取回）：项目级 `.codex/agents/` + 用户级 `~/.codex/agents/`，每文件一 agent；必填 `name`/`description`/`developer_instructions`；选填 `model`/`model_reasoning_effort`/`sandbox_mode`/`mcp_servers`/`skills.config`/`nickname_candidates`（**无工具限制字段**，最接近的是 `sandbox_mode`）；内建 `default`/`worker`/`explorer` 同名自定义优先（本计划三名不冲突）；`/agent` 切换；未标最低 CLI 版本——0.141.0 是否加载项目级仍需 C2 冒烟。
- `docs/reference-configs/contract-brief-example.md` 存在（仅 code-change 例、无 bugfix；docs-only 无 assets 镜像），被 `tests/contract-run.test.ts` 消费，三处模板副本以 `> **Exemplar**:` 指针引用。verify-contract 的 bash 侧测试在 `tests/helper-scripts.test.ts:2532`/`2580` 一带。hook 同步脚本实名 `sync:hooks`/`check:hooks`（package.json:39-40）。

## Codex 评审已并入（2026-07-05）

对本计划 Draft 跑了 Codex（gpt-5.5·xhigh）对抗式评审，判定 **BLOCK**（方向认可，执行漏洞真实）。已 accept 的修正全部并入上面「侦察基线」与下面切片：分发漂移漏数（模板/policy 多副本）、`.codex/*` 被 gitignore、H 的双解析器不 decision-complete、gate-gaming 缓解机制不成立、geju 位置漏项、C1 措辞、测试路径。两个设计岔口经使用者拍板：
- **root-cause gate = 正式扩展 gate contract**（显式修订 `sprint-contracts.md` + 测试 + 兼容承诺，当一等新维度；不塞进 exit_criteria 偷偷做）。
- **行为证明 = 两阶段 pre-fix 失败 artifact**（bugfix 必须先在旧码上记录失败证据，gate 校验该 artifact 存在、显示失败、指向同一 guard test）。

## Fable 复审已并入（2026-07-05）

Fable 对改版后计划跑了第二轮对抗式复审（handoff：`.ai/harness/handoff/authority-closure-rereview.md`），判定 **REVISE**，findings 已全部折进本版：侦察基线重校至 a409656；**E1 删除**（intent-boundary 已把条款机械送达全部 runner 面，F1 保留断言）；H0 拍板缺省语义并纳入第二枚举所有者 harness-trace-grade(+trace fixture)；全局规则补 reference-configs 文档镜像义务、删去不存在的 project-init-lib 镜像；G1 定死 hai-stack 条目形态与 external-tooling.md 落点；H2/H3 的 pre-fix artifact 换成钉死捕获配方 + 共享 fixture 实体文件（实证：bun **通过**输出含 " 0 fail"，substring 匹配假阳性；管道捕获吞退出码）；C1 改为从 `~/.claude/agents/` 复制入库；C2 schema 官方核实并钉入。

## 全局执行规则（执行者必读）

1. **镜像/分发 surface 义务**：改任一 contract 模板必同步**全 surface**：`assets/templates/contract.template.md`、`.claude/templates/contract.template.md`、`scripts/plan-to-todo.sh` heredoc + 镜像、`scripts/ensure-task-workflow.sh` 内嵌模板 + 镜像、`scripts/lib/project-init-lib.sh PI_TEMPLATE_CONTRACT`（**无镜像文件**——其与 ensure-task-workflow 内嵌副本的 parity 由 T1 新增测试锁定）。改任一 policy 默认值必同步 `.ai/harness/policy.json` + `ensure-task-workflow.sh` 种子(+镜像) + `project-init-lib.sh` 种子（无镜像）。改 `scripts/<f>` 必 `diff -q` 其 `assets/templates/helpers/<f>` 镜像（存在者）。改 hooks 只改 `assets/hooks/` 再 `bun run sync:hooks`。**改 `docs/reference-configs/<f>.md` 时若存在 `assets/reference-configs/<f>.md` 镜像必同步**（H1 的 sprint-contracts.md、G1 的 external-tooling.md、G3 的 agentic-development-flow.md 均有镜像；contract-brief-example.md 无镜像）。
2. **每次动模板/policy surface 后必跑** `bash scripts/migrate-project-template.sh --repo . --dry-run` 与 `bun test tests/create-project-dirs.runtime.test.ts`（self-migration 不炸才算改全）。
3. **fail-closed，不加相容 fallback**；权威值缺失就报错停。选填字段缺席=功能不渲染，不合成默认值。
4. **不得削弱既有硬闸**：external acceptance、verify-sprint、scope 检查、run 模式 Why preflight fail-closed。破坏 exit_criteria-only 承诺**只能显式**（H1 改 sprint-contracts.md 公开声明），不得偷偷扩读。
5. **不 fork Waza/hai-stack 技能本体**；只萃取产物契约与行为证据 gate。
6. **STOP 协议**：命中即停，把实际观察写进回报与 notes 的 Open Questions，继续不依赖它的切片或整体暂停等指示。禁止绕过、猜测合并、放宽测试断言弄绿。
7. 每片完成即跑该片 Verify 并贴原始输出；没跑过不得声称通过。

## 执行顺序

```
T1 → T2 → ( H0 → H1 → H2 → H3  ‖  G1 → G2  ‖  C1 → C2 → C3 )  → G3 → F1
```
T 是模板地基（先做全 surface diff inventory 再对齐、再加字段）。H 串行（profile→模板+文档→TS gate→bash gate，共享 fixtures）。G/C 与 H 文件基本不相交可并行。G3 教学最后。F1 全量收官。（原 E1 已由 contract-intent-boundary 落地，删除；F1 保留到面断言。）

---

## 切片详表

### T1 — contract 模板全 surface diff inventory + 对齐 drift（先做再加字段）

**Why**：模板不止四处（Codex 发现初始化/迁移种子副本）。加新字段前所有副本必须先对齐到独立模板，否则新字段落进不一致基线，下游 repo 拿到漂移模板。

- 文件（全 surface，见全局规则1）。
- 改动：先对每对副本 `diff` 出**完整** hunk 清单（不假设「三处」）；把 heredoc / 种子副本对齐 `assets/templates/contract.template.md`。已知必含（Fable 复审实测）：`.claude/templates` 缺 `Taste constraints`(assets:25)；两份种子缺整节 `> **Exemplar**:`、`## Why`、`## Stop Conditions`；plan-to-todo heredoc 缺 runner: 子块、Exit Criteria 字段、`docs/spec.md` allowed path、files_exist 内容、Status=Pending vs Active。**一并拍板**：五副本 exit_criteria 的死命令 `bun run typecheck` 统一改实名 `bun run check:type`。刻意分裂处（若有）保留并注释。
- 测试：`tests/helper-scripts.test.ts` 扩展/新增「所有模板副本的 `##` 节集合 ⊇ 独立模板」一致性断言，**显式覆盖 project-init-lib 内嵌副本**，并锁 `PI_TEMPLATE_CONTRACT` ⇄ ensure-task-workflow 内嵌副本 parity。
- Verify：全 surface 两两 `diff -q` 逻辑一致；`bun test tests/helper-scripts.test.ts`；`bash scripts/migrate-project-template.sh --repo . --dry-run`。
- **STOP**：任一副本 diff 出**逻辑**（非占位/非序言）差异未在 inventory 预期内 → 停，贴 hunk，不盲目覆盖。

### T2 — contract 模板新增 `## Falsifier` 选填字段（全 surface 同改）

**Why**：geju 的 falsifier/proof-point 需字段承载才能冻进 contract（G2 依赖）。选填，不进 preflight 必检（延续 dev-loop「仅 Why 必检」教训）。

- 文件：全模板 surface。
- 改动：`## Stop Conditions` 之后插占位节（占位句逐字，G2 冻结/剔除依赖此原文）：
  ```markdown
  ## Falsifier

  What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.
  ```
- 测试：plan-to-todo/init 渲染断言加 `toContain("## Falsifier")`；`tests/scaffold-parity.test.ts`、`tests/create-project-dirs.runtime.test.ts` 若读模板则同步。
- Verify：全 surface `diff -q`；`bun test tests/helper-scripts.test.ts tests/scaffold-parity.test.ts tests/create-project-dirs.runtime.test.ts`；migrate dry-run。
- **STOP**：T1 未完成（surface 仍 drift）→ 停，先做 T1。

### H0 — bugfix 分类的 schema owner（扩 `task_profile` 枚举）

**Why**：root-cause gate 必须条件触发，触发键必须是**已存在、已校验**的字段，否则「不填就绕过」（Codex MEDIUM）。复用现有 `task_profile`（verify-contract:526-536 已校验）而非发明裸 `contract_class`。

- 文件：`docs/reference-configs/sprint-contracts.md`（task_profile 枚举定义处，**+ assets/reference-configs/ 镜像**）、`scripts/verify-contract.sh`(+镜像，:530 枚举)、**`scripts/harness-trace-grade.sh`(+镜像，:94 第二枚举所有者)**、contract 模板全 surface（header `> **Task Profile**` 注释列出合法值含 `bugfix`）、`tests/helper-scripts.test.ts`、**`tests/fixtures/harness-traces/bugfix-pass.json`（新增，仿 code-change-pass.json）**。
- 改动：**两处枚举**同步加 `bugfix`；文档说明 `bugfix` profile 触发 Root Cause Evidence gate（H1-H3）；bugfix 在 verify-contract :538-552 的 profile-path 分支**不加路径限制**（同 code-change）；bugfix trace 的 review card `change_type` 用 `bugfix`（harness-trace-grade:108 相等校验自动成立）。
- **缺省语义（已拍板）**：`task_profile` 缺失 = legacy 放行（:527-529 现状不变）= 非 bugfix，gate 不触发。省略与误标是同一个诚实边界，都由 Waza `/check` 人工核（G3 写进 review 清单），不假装机器能强制「这是不是 bug」。
- 测试：verify-contract 与 harness-trace-grade 的枚举测试均加 `bugfix` 合法；误值仍 fail；bugfix trace fixture 过 grade。
- Verify：`diff -q` 两镜像；`bun test tests/helper-scripts.test.ts`。
- **STOP**：枚举校验本身不存在或行为与上述实测不符 → 停回报（缺失=legacy 放行是已确认现状，不触发 STOP）。

### H1 — root-cause 一等 gate 维度：模板 + 显式修订 sprint-contracts.md

**Why**：使用者拍板走「正式扩展 gate contract」。root-cause 作为一等维度进模板，且**公开修订** verify-contract 的 exit_criteria-only 承诺（不偷偷扩读）。

- 文件：contract 模板全 surface + `docs/reference-configs/sprint-contracts.md`（:67 承诺处）**+ `assets/reference-configs/sprint-contracts.md` 镜像同步**。
- 改动 1（模板，指针非叙述）：
  ```markdown
  ## Root Cause Evidence

  Required when Task Profile is `bugfix`; leave as-is otherwise.

  - root_cause: one sentence naming file:line/condition (testable, not "a state issue").
  - repro: the command or UI path that reproduces the symptom.
  - regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
  - pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see H2/H3).
  ```
- 改动 2（sprint-contracts.md）：显式声明「自本版起，`verify-contract` 对 `task_profile: bugfix` 的 contract 额外评估 `## Root Cause Evidence` gate；非 bugfix contract 维持 exit_criteria-only」。这是承诺的**有意扩展**，记进文档与 CHANGELOG 式说明。
- 测试：随 H2/H3。
- Verify：全 surface `diff -q`（含 `diff -q docs/reference-configs/sprint-contracts.md assets/reference-configs/sprint-contracts.md`）；sprint-contracts.md 含新条款；migrate dry-run。
- **STOP**：无（纯模板+文档）。

### H2 — root-cause gate（contract-run.ts 侧）+ TS 嵌套解析 + 共享 fixtures

**Why**：contract-run 是消费点 fail-closed 闸（authority closure）。Codex 指出 TS `parseList` 吃不了嵌套 `tests_pass.path`，「复用既有解析」是假的——本片先补最小嵌套解析，再定 fixtures 表供 H3 复用同输入同结果。

- 文件：`scripts/contract-run.ts`(+镜像)；`tests/contract-run.test.ts`；`tests/fixtures/root-cause/`（新增共享 fixtures 实体文件）；`docs/reference-configs/contract-brief-example.md`（补一份 bugfix 黄金范例，守护测试；docs-only 无 assets 镜像）。
- 改动：
  1. 加最小 helper 解析 `tests_pass[].path`（不引第三方 YAML 库，anti-pattern 23；沿 `sectionBody`/`fencedYamlBlock` 风格）。
  2. `runBriefPreflight` 加条件检查：`task_profile==bugfix`（`readHeader` 读 `> **Task Profile**:`）时，Root Cause Evidence 四项非占位、`regression_guard` ∈ `tests_pass[].path`、`pre_fix_failure_artifact` 路径存在且内容**含非零 `PRE_FIX_EXIT=` 行**（钉死配方见 H1 字段文案；**禁用 FAIL/fail substring 启发式**——bun 通过输出也含 " 0 fail"）**且含 `regression_guard` 的 path 字符串**（不是测试标题）。不满足 → issues push，run 模式新 `failure_class: incomplete_root_cause`。
  3. fixtures 落成**实体共享文件**（`tests/fixtures/root-cause/` 下的 contract + artifact 文件）+ 一张共享期望表（TS module，H2/H3 两侧测试文件 import 同一份）：bugfix-pass / 缺 guard / guard 不在 tests_pass / artifact 缺失 / **artifact 为通过运行（含 " 0 fail" 与 `PRE_FIX_EXIT=0`，必须拒）** / PRE_FIX_EXIT 行缺失 / 非 bugfix 跳过。
- 测试：上述 fixtures 全覆盖；bugfix 黄金范例过 preflight（守护）。
- Verify：`diff -q scripts/contract-run.ts assets/templates/helpers/contract-run.ts`；`bun test tests/contract-run.test.ts`；`bun scripts/contract-run.ts preflight --contract docs/reference-configs/contract-brief-example.md --json`（bugfix 例 → pass）。
- **STOP**：嵌套解析需引第三方依赖才能做 → 停回报（评估手写 vs 依赖，不擅自加依赖）。fixtures 中任一在 TS 侧无法表达 → 停，H3 对齐前不推进。

### H3 — root-cause gate（verify-contract.sh 侧，复用 H2 fixtures）

**Why**：verify-contract 是终验硬闸，必须与 contract-run 同判定。两套解析器 → 两处实现、同 fixtures 验证一致。

- 文件：`scripts/verify-contract.sh`(+镜像)；对应 bash 侧测试（`tests/helper-scripts.test.ts:2399` 一带）。
- 改动：用其既有 bash YAML 解析（`- path:` :477 风格）加同一条判定：`task_profile==bugfix` 触发同 H2 的四项检查（含 pre_fix_failure_artifact 存在且显示失败）；失败走 verify-contract 现有失败通道。非 bugfix 维持 exit_criteria-only（呼应 H1 文档）。
- 测试：bash 侧测试 import H2 的同一张期望表、跑同一批 fixture 文件，断言同输入同 pass/fail（**不手抄复制表**——手抄即重新引入双实现漂移）。
- Verify：`diff -q scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh`；`bun test tests/helper-scripts.test.ts`；跑一份 bugfix 黄金范例 contract 过 `verify-contract --strict`，一份缺 artifact 的被挡。
- **STOP**：bash 侧解析不出 tests_pass 列表或 artifact 判定与 TS 不一致 → 停，回报差异，不在一侧放松求「都绿」。若为对齐被迫引入共享库 → 停，独立重构另计划。

### G1 — geju 落成 policy 可读依赖条目（含分发种子面）

**Why**：geju 现在只是约定文本（authority 未闭合）。进 policy 与 think/hunt/check 同级；且 policy 默认值有多副本，只改 policy.json 会分发漂移（Codex HIGH）。

- 文件：`.ai/harness/policy.json`（`.external_tooling`）+ **分发种子面** `scripts/ensure-task-workflow.sh:1020-1079` 一带(+镜像)、`scripts/lib/project-init-lib.sh:1972-2028` 一带（无镜像）+ **`docs/reference-configs/external-tooling.md` 新增 hai-stack 条目 + `assets/reference-configs/external-tooling.md` 镜像**。
- 改动（**条目形态已拍板**，仿 `waza` 条目 policy.json:322-336 结构）：`external_tooling` 新增 `hai_stack` 条目——`source_repo: "hylarucoder/hai-stack"`、`source_url: "https://github.com/hylarucoder/hai-stack.git"`、`managed_skills: ["geju"]`、`primary_host: "codex"`、`codex_primary_path: "~/.codex/skills"`、`staging_cache_path: "~/.agents/skills"`、`sync_mode: "stage-upstream-then-copy-to-codex"`、`host_drift_policy` 同 waza。`codex_automation_profile.required_skills` **不加** geju。external-tooling.md（现对 hai-stack/geju 0 命中）新增对应安装/更新说明段。
- 测试：external_tooling 结构断言含 hai_stack/geju；`tests/create-project-dirs.runtime.test.ts` 断言种子面同步；migration dry-run。
- Verify：`bun test <policy/external-tooling 测试> tests/create-project-dirs.runtime.test.ts`；`repo-harness run check-task-workflow --strict`；migrate dry-run；`diff -q docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md`。
- **STOP**：`skills add hylarucoder/hai-stack -s geju` 实测来源串与上述键值冲突 → 停回报再定键名（条目结构已拍板，仅来源不符才停）。

### G2 — geju 产物冻结进 contract + 渲染后 advisory

**Why**：geju 判断留 live，产物（thesis/direction/falsifier）不能留 ambient context——冻进 contract（Why 承载 thesis+direction，Falsifier 承载 falsifier+proof-point），进了以 contract 为准。

- 文件：`scripts/plan-to-todo.sh`（`render_contract_file` 之后，仿既有两个渲染后范式：`maybe_advise_contract_brief_preflight`:625 / Non-scope carry-forward :559-609）+ 镜像。
- 改动：渲染后向 stderr 印 advisory（`|| true`，不改 exit code）：
  ```
  [Geju] If this task came from a 格局/geju pass, freeze its output into the contract before delegating:
  [Geju]   thesis + high-level direction -> ## Why ; falsifier + cheapest proof point -> ## Falsifier
  [Geju] Live geju is pre-contract exploration only; once frozen, the contract is authoritative.
  ```
- YAGNI：不在脚本里调用 geju、不自动解析 geju 输出——geju 是 live lens，冻结是作者动作。
- 测试：plan-to-todo 用例断言 stderr 含 `[Geju]` + exit code 不变。
- Verify：`diff -q` 镜像；`bun test tests/helper-scripts.test.ts`。
- **STOP**：advisory 改了任何既有 plan-to-todo 测试 exit code → 停。

### G3 — SKILL.md + 文档教学面（geju 边界 + 冻结义务 + bugfix 误标核对）

**Why**：操作者走流程却不知 geju 产物必须冻进 contract、bugfix 必须填 Root Cause Evidence。把 authority-closure 边界写进人类入口。geju 位置不止 PRD skill（Codex MEDIUM）。范围收缩时本片第一个延后。

- 文件：`assets/skill-commands/repo-harness-prd/SKILL.md`、`repo-harness-plan/SKILL.md`、`repo-harness-check/SKILL.md`（加「review 时核对 bugfix contract 的 Root Cause Evidence 与 pre-fix artifact，并核 task_profile 是否被误标**或整体省略**」）、`assets/skill-commands/manifest.json:109-110`、`docs/reference-configs/agentic-development-flow.md:39` **+ `assets/reference-configs/agentic-development-flow.md` 镜像**（同步 geju 描述，或说明为何不改）。
- 改动：各加 ≤6 行贴合角色的段落。
- 测试：`tests/action-command-skills.test.ts:228-236` 断言 geju 字符串——改措辞必同步该测试；其余 manifest/lint 测试照跑。
- Verify：`grep -rln geju` 覆盖预期文件（README×5、evals.json 命中属预期外文件，不改）；`bun test` 整体绿。
- **STOP**：任一 SKILL.md 带「generated / do not edit」→ 停，改源头。

### C1 — .claude/agents/ 舰队定义入库（从用户级复制）

**Why**：三个 subagent 定义是 Claude 舰队的具体落地。初版基线时它们是 repo 内未跟踪文件，现已移至 `~/.claude/agents/`（Fable 复审实测三文件在；`.claude/agents` 不被 gitignore）。建对称 Codex 舰队前先把 Claude 侧基线固化进 repo。

- 文件：`cp ~/.claude/agents/{deep-reasoner,fast-worker,gatekeeper}.md .claude/agents/` 后 `git add`（内容不改）。**来源已核（2026-07-05 orchestrator 实测）**：上游 canonical = `github.com/Ancienttwo/Fable-agents` `assets/`，本机三文件与其 `d9a627b`（feat: add machine-readable report contracts）**逐字节一致**——入库即上游最新版；notes 记 provenance（repo+commit）。**复核 frontmatter 自洽**（name/description/model/effort 齐全、可解析；`tools` 仅 gatekeeper 限定 [Read,Grep,Glob,Bash]，deep-reasoner/fast-worker 缺省=全工具属预期，不算缺字段）——不声称「与全局 CLAUDE.md 一致」（当前 repo 内无该证据，Codex LOW）。
- 测试：无。
- Verify：`git status --short .claude/agents`（三文件出现且可 staged）。
- **STOP**：任一文件用户级缺失或 frontmatter 不自洽（字段缺失/不可解析）→ 停回报。

### C2 — 对称 .codex/agents/*.toml + .gitignore 例外（gpt-5.5，effort 分档）

**Why**：Codex 侧同套角色按 effort 分档做 model 分层的等价物。**但 `.gitignore:69` 忽略 `.codex/*`，不加例外新文件不进 git**（Codex CRITICAL）。

- **schema 已核实**（官方 `developers.openai.com/codex/subagents`，Fable 复审 2026-07-05 取回，不再是前置未知）：必填 `name`/`description`/`developer_instructions`；选填 `model`/`model_reasoning_effort`/`sandbox_mode`/`mcp_servers`/`skills.config`/`nickname_candidates`；**无工具限制字段**；内建 `default`/`worker`/`explorer` 同名自定义优先（本计划三名不冲突）。执行时可 WebFetch 再复核一次，取不到不阻塞（schema 已钉入本计划）。
- 文件：先在 `.gitignore` 加例外（`!.codex/`、`!.codex/agents/`、`!.codex/agents/*.toml`，紧跟 :69 的 `.codex/*` 之后）；再新建 `.codex/agents/deep-reasoner.toml`(gpt-5.5,xhigh) / `fast-worker.toml`(gpt-5.5,medium) / `gatekeeper.toml`(gpt-5.5,xhigh + `sandbox_mode` 取只读档，档名实测不符则留默认并记 notes)。developer_instructions 复用 `.claude/agents/*.md` 正文语义（上游 Fable-agents `d9a627b` 版，含 machine-readable report contract 段——RECOMMENDATION/RESULT/PASS-FAIL-BLOCKED 格式一并带入），**并逐字包含 canonical EXECUTION_BOUNDARY 条款**（contract-run.ts:66-74 原文——Codex 原生 subagent 不走 contract-run worker prompt 时的兜底；不纳入 parity 测试，但必须同句原文）。
- 冒烟：`git check-ignore .codex/agents/deep-reasoner.toml`（应无输出=不再被忽略）+ `git status --short .codex/agents`（应见文件）；`codex` 侧 `/agent` 能识别三 agent（不能自动化就手动，notes 记录输出）。
- 测试：断言三 toml 存在且含必填键（`ls` + grep 关键键，不引 TOML 解析依赖）。
- Verify：`git check-ignore` 无输出；`git status` 见三文件；冒烟输出贴回报。
- **STOP**：冒烟中 codex 0.141.0 报 TOML 解析错/不识别项目级 agents → 停，标「本机版本不支持项目级 .codex/agents」，挂起本片（不阻塞 T/H/G）。

### C3 — policy 补 codex-subagent runner（含分发种子面）+ contract-run 记录

**Why**：`preferred_runners` 已含 `codex-exec`；Codex 现有原生 subagent，应作独立 runner 标签。policy 默认值多副本，须同步种子面（Codex HIGH）。纯记录，无行为变化。

- 文件：`.ai/harness/policy.json`(`.delegation`) + 种子面 `ensure-task-workflow.sh:932`(+镜像)、`project-init-lib.sh:1884`（无镜像）；`scripts/contract-run.ts`(+镜像)。
- 改动：`preferred_runners` 补 `"codex-subagent"`（与 codex-exec 并列）；`runner_rule` 文字更新（Codex 优先原生 subagent，降级 codex-exec→main-thread，降级必记 manifest 不静默）。contract-run `--runner` 合法标签集 + off_policy 判定基准加 `codex-subagent`。
- 测试：`tests/contract-run.test.ts` runner_usage 加 `codex-subagent`（off_policy=false）；policy/种子面结构测试同步；migration dry-run。
- Verify：`diff -q` 各镜像；`bun test tests/contract-run.test.ts tests/create-project-dirs.runtime.test.ts`；`repo-harness run check-task-workflow --strict`；migrate dry-run。
- **STOP**：off_policy 基准改动致既有 runner_usage 测试非预期变红 → 停回报。

### F1 — 全量验证（收官）

无文件改动。依序全绿才收官；任一红停在该项回报，不补计划外修复。

```bash
bun test
bun run check:type
bun run check:hooks
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text >/dev/null
bash scripts/migrate-project-template.sh --repo . --dry-run >/dev/null
# 全模板/policy/helper 镜像成对一致（project-init-lib 无镜像文件，parity 由 T1 测试锁）
for f in contract-run.ts plan-to-todo.sh verify-contract.sh ensure-task-workflow.sh harness-trace-grade.sh; do diff -q scripts/$f assets/templates/helpers/$f || echo "DRIFT $f"; done
diff -q .claude/templates/contract.template.md assets/templates/contract.template.md
# reference-configs 文档镜像成对一致（H1/G1/G3 触到的三份）
for f in sprint-contracts.md agentic-development-flow.md external-tooling.md; do diff -q docs/reference-configs/$f assets/reference-configs/$f || echo "DRIFT $f"; done
# 冒烟：bugfix 黄金范例过 preflight + verify-contract；缺 pre-fix artifact 的 bugfix contract 被挡；非 bugfix contract 不受影响
bun scripts/contract-run.ts preflight --contract docs/reference-configs/contract-brief-example-bugfix.md --json
# 冒烟：.codex/agents/*.toml 不再被 gitignore（git check-ignore 无输出）+ 被 Codex 识别
git check-ignore .codex/agents/deep-reasoner.toml || echo "OK not ignored"
# 断言：反-extras 条款仍覆盖全部 runner 面（intent-boundary 已落地，勿重复注入）
grep -rl "forbidden design space" scripts/contract-run.ts assets/hooks/ src/cli/mcp/tools.ts
```

---

## YAGNI 杀单（明确不做）

1. **fork/vendor Waza 或 hai-stack 技能本体**——违反 authority-closure 的「live 做前置探索」定位与单一工作流原则。
2. **把 geju/think 的推理过程压成 checklist**——只冻产物（Why/Falsifier）+ 行为证据。
3. **造通用行为验证引擎**——pre-fix 失败证据只针对 `task_profile==bugfix`，复用 regression_guard 测试本体，不新建测试运行框架。
4. **在一个 Codex 进程里复刻跨厂商 Opus/Sonnet**——用 effort 分档（medium/xhigh）。
5. **root-cause / Falsifier 升为全局 preflight 必检**——误伤 feature/归档 contract；root-cause 只对 bugfix profile 条件必检，Falsifier 纯选填。
6. **为对齐两套解析器引入共享库**——独立重构，本计划双侧各加判定 + 共享 fixtures 保证一致。
7. **偷偷扩读 exit_criteria 承诺**——H1 显式修订 sprint-contracts.md 公开声明扩展（呼应使用者决策）。
8. **bugfix 误标/省略的机器启发式 advisory**——不做；/check 人工核覆盖（诚实边界，见 H0 缺省语义），机器不猜「这是不是 bug」。
9. **重复注入 EXECUTION_BOUNDARY 条款**——intent-boundary 已落全部 runner 面并有 parity 测试；本计划只断言存在（F1），不再写第二段。

## 风险与回滚

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| 分发漂移（模板/policy 多副本未全改） | 中 | 高 | 全 surface 清单（规则1）+ 每次 migrate dry-run + create-project-dirs 测试（规则2） |
| reference-configs 文档镜像漏同步 | 低（规则1已列） | 中 | F1 新增三份成对 diff |
| `.codex/agents` 被 .gitignore 吃掉 | 高（默认） | 中 | C2 先加 negation 例外 + `git check-ignore` 冒烟 |
| 两套解析器 gate 语义不一致 | 中 | 高 | H2 fixtures 实体文件 + 共享期望表，H3 import 同一份，不一致即 STOP |
| pre-fix artifact 可被伪造（贴假失败） | 低 | 中 | 钉死捕获配方（非零 `PRE_FIX_EXIT=` 行 + guard path）；/check 人工抽验（G3） |
| bugfix 误标/省略绕过 gate | 中 | 中 | task_profile 触发键（H0，缺省=legacy 已拍板）+ /check 人工核（G3）；不假装机器能判「是不是 bug」 |
| codex 0.141.0 不支持项目级 .codex/agents | 中 | 中 | schema 已官方核实；C2 冒烟 + STOP 挂起本片，不阻塞 T/H/G |
| 显式改 sprint-contracts.md 破坏下游依赖 | 低 | 中 | 非 bugfix contract 维持 exit_criteria-only；改动仅加 bugfix 分支 |
| advisory 改了 exit code | 低 | 中 | G2 `|| true` + 测试断言 exit code 不变 |

回滚：全部切片无数据迁移，可独立 `git revert`；镜像/种子对必须成对 revert 保持一致；C1 revert=删除复制入库的三文件；C2 revert=删 `.codex/agents/` + 撤 .gitignore 例外。

## 最脆弱假设

（1）本机 codex-cli 0.141.0 能加载项目级 `.codex/agents/`（TOML schema 本身已官方核实，不再是假设）——C2 冒烟承接，不过即挂起本片。（2）bugfix 分类靠作者诚实声明 `task_profile`（**省略=legacy 放行=非 bugfix，与误标同一诚实边界，已拍板**），机器只能校验「已声明 bugfix 的证据完整」——由 /check 人工兜（明确承认，不假装闭合）。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] T1 contract 模板全 surface diff inventory + 对齐 drift
- [x] T2 模板新增 `## Falsifier` 选填字段（全 surface）
- [x] H0 bugfix 分类 schema owner（扩 task_profile 枚举）
- [x] H1 root-cause 一等 gate 维度：模板 + 显式修订 sprint-contracts.md
- [x] H2 root-cause gate（contract-run.ts）+ TS 嵌套解析 + 共享 fixtures
- [x] H3 root-cause gate（verify-contract.sh，复用 fixtures）
- [ ] G1 geju 落成 policy 依赖条目（含分发种子面）
- [ ] G2 geju 产物冻结 advisory
- [ ] C1 .claude/agents/ 舰队定义入库（从用户级复制）
- [ ] C2 对称 .codex/agents/*.toml + .gitignore 例外
- [ ] C3 policy 补 codex-subagent runner（含种子面）+ contract-run 记录
- [ ] G3 SKILL.md + 文档教学面
- [ ] F1 全量验证 battery
