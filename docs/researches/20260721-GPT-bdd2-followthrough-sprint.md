# Sprint：BDD² Follow-through（最终裁决版）

> **状态**：Draft，待人类批准后进入执行  
> **Slug**：`bdd2-followthrough`  
> **建议分支 / worktree**：`codex/bdd2-followthrough`  
> **交付单位**：一个 work-package、一个仓库 PR、一个独立的 Claude 用户级 skill 安装物  
> **产品裁决**：BDD²/BDD3 保持冻结；不新增 preview harness 模块、生命周期状态机、adapter、ledger、classifier、通用 rendered-surface helper 或新 eval suite。

---

## 1. Sprint Goal

在不复活已被实验否决的重型 enforcement machinery 的前提下，完成三个闭环：

1. **减少无关提示噪声**：通用 `[BDD]` 建议继续覆盖所有 feature intent；`[UXFeatureGuard]` 只在真实前端/UI 请求中出现。
2. **建立安全的 design-proposal 流程**：peer research → 轻量产品边界冻结 → 2–3 个 STIMULUS 变体 → 人类选择 → taste 精修 → 最终 PRD/design brief；外部 skill 只提供证据、刺激和视觉精修，不获得产品语义权威。
3. **让 developer-view leakage 可被显式声明**：在 design brief 中按 audience/role 写明合法可见 concept、后台 concept 和角色例外，同时保护错误恢复、状态可见性与 accessibility，避免“防加料”变成“删必要体验”。

---

## 2. Success Outcomes

Sprint 完成后应满足：

- 后端、CLI、脚本等 feature prompt 仍收到 `[BDD]`，但不再收到 `[UXFeatureGuard]`。
- 前端/UI feature prompt 同时收到 `[BDD]` 和 `[UXFeatureGuard]`。
- imagegen 不得在 draft product boundary 冻结前运行。
- synthetic preview 一律标记为 `STIMULUS`，不得作为 feature authority 或用户偏好证据。
- 多方向选择只能由人类关闭；agent 不推荐、不默认、不因用户沉默自动选择。
- taste skill 只能精修已授权方向；语义变化只能返回 proposal，不能直接写入 PRD、brief 或实现。
- design brief 明确记录当前 audience/role 的可见 concept 边界，且 negative scenario 可据此手写落地。
- 防止 developer-view extras 的同时，仍保留必要的 failure state、recovery、retry、status visibility 和 accessibility。
- rendered-surface 自动验证暂不建设；以带明确触发条件的 deferred goal 记录。
- `evals/bdd2/**`、`evals/bdd3/**`、workflow contract、路由表均不发生改动。

---

## 3. Non-goals / Forbidden Scope

本 Sprint 明确不做：

- 不创建 `repo-harness-preview` 或类似 harness 模块。
- 不建立六状态或其他 preview 生命周期状态机。
- 不新增 external-skill catalog、provider registry、adapter、sidecar、evidence packet schema 或 scoring system。
- 不增加全局 developer-view 词表或语义分类器。
- 不实现 `assertUxSurface` 通用 helper。
- 不创建 `evals/ux-preview-v1`。
- 不重构封存的 `run-bdd2-evals.ts`，不改封存 manifest 路径。
- 不把 `design_options` / `design-proposal` 路由正式写入 workflow contract。
- 不在 Codex 安装 `design-proposal`；本轮只面向已有相关子 skill 的 Claude 用户级环境。
- 不允许 prompt advisory 变成 blocking gate；不得增加与本功能有关的 `exit 2` 路径。

任何出现上述内容的 diff 都视为 Sprint scope failure，而不是“顺手优化”。

---

## 4. Delivery Model

### 4.1 仓库内交付（进入同一 PR）

包括 prompt advisory 收窄、design-options 权限边界、design-brief role-aware 字段、PRD/brief 指针、测试、ledger closeout 和旧计划归档。

### 4.2 仓库外交付（不进入 PR）

创建：

```text
~/.claude/skills/design-proposal/SKILL.md
```

该文件是 host-level artifact，不由 repo-harness vendoring、安装器、workflow contract 或 policy 管理。仓库任务 notes 只记录：

- 安装路径存在；
- skill 名称可发现；
- 依赖 skill 的存在/缺失报告；
- smoke 结果。

不把用户级 skill 正文复制进 repo 形成第二权威。

---

## 5. Target Workflow

```text
User asks for a frontend design proposal
                 │
                 ▼
1. Peer Research
   - cited real cases
   - pattern / structure / candidate-fit only
                 │
                 ▼
2. Draft Product Boundary Freeze
   - audience / role
   - requested user-visible outcome
   - product rules
   - non-goals
   - allowed visible concepts
   - backstage-only concepts
   - required recovery/accessibility
                 │
                 ▼
3. ImageGen Variants
   - only when 2–3 genuine directions exist
   - at most 3
   - every preview labelled STIMULUS
                 │
                 ▼
4. Neutral Presentation
   - evidence + trade-off per option
   - no recommendation
   - explicit “what is not concluded”
                 │
                 ▼
5. Human Choice
   - human closes the decision
   - recorded as user_evidence
                 │
                 ▼
6. Taste Refinement
   - presentation-level refinement only
   - semantic changes returned as proposals
                 │
                 ▼
7. Final PRD + Confirmed Design Brief
   - chosen direction
   - observable/copy contract
   - role-aware concept boundary
   - P1 / N1 / F1 scenarios
                 │
                 ▼
8. Contract → Implementation → Existing Review Path
```

### Authority chain

```text
User request / approved product authority
                ↓
Draft product boundary
                ↓
Peer evidence + synthetic previews (non-authoritative inputs)
                ↓
Human choice (user_evidence)
                ↓
Taste refinement within fixed ceiling
                ↓
Confirmed PRD / design brief
                ↓
Task contract / BDD tests / implementation evidence
```

---

## 6. Track A — Frontend-scope the UX advisory

### Objective

拆分当前共用的 `bdd_feature_advice`：

- `[BDD]`：保持通用 feature advisory，不改变现有语义。
- `[UXFeatureGuard]`：新增 `ux_feature_guard_advice` fact，必须同时满足 feature intent 与前端/UI noun。

### Implementation constraints

1. 新判断必须复用 `shouldEmitBddFeatureAdvice(ctx)`，以共享 diagnostic/review/passive exclusions。
2. UI noun 应检查剥离 host-injected blocks 后的 `ctx.text`，不检查 `ctx.raw`。
3. 英文 `ui` / `ux` 等短 token 必须有词边界；不得让 `build`、`suite` 等单词因包含 `ui` 而误触发。
4. 中英文模式建议分开表达；初始词集保持高精度，不因“提高召回”加入过宽泛词。
5. 对初始 noun set 的任何扩展都必须先有一个真实 missed-case fixture。
6. 新 fact 只用于 echo，不参与 `PromptGuardIntentFacts` 的路由决策或阻断逻辑。

### Suggested shape

```ts
const UX_FEATURE_NOUN_ZH = re(
  '(页面|界面|前端|网页|落地页|组件|按钮|弹窗|表单|布局|排版|样式|交互|仪表盘)',
);

const UX_FEATURE_NOUN_EN = re(
  String.raw`(^|[^A-Za-z0-9_])(ui|ux|user interface|frontend|front-end|web page|landing page|screen|button|modal|dialog|form|layout|dashboard|css)([^A-Za-z0-9_]|$)`,
);

export function shouldEmitUxFeatureGuardAdvice(ctx: PromptIntentContext): boolean {
  if (!shouldEmitBddFeatureAdvice(ctx)) return false;
  return UX_FEATURE_NOUN_ZH.test(ctx.text) || UX_FEATURE_NOUN_EN.test(ctx.text);
}
```

> 上述词集是实现起点而非产品 API。执行者可按现有 repo 风格微调，但必须保留 `ctx.text`、英文边界和 fixture-first 扩展三项不变量。

### Files

- `src/cli/hook/prompt-intents.ts`
- `src/cli/commands/prompt-guard-decision.ts`
- `assets/hooks/prompt-guard.sh`
- `.ai/hooks/prompt-guard.sh`（generated projection）
- `tests/cli/prompt-intents.test.ts`
- `tests/ux-feature-guardrail.test.ts`
- `tests/hook-runtime.test.ts`（仅在现有 fixture 适合端到端 echo 断言时修改）
- `tests/hook-contracts.test.ts`（通常只运行，不预设必须修改）

### Acceptance scenarios

#### A-P1：前端 feature 同时获得两个 advisory

```gherkin
Given the prompt is "实现一个新功能页面"
When prompt intent facts are produced
Then bdd_feature_advice is 1
And ux_feature_guard_advice is 1
And the hook prints both [BDD] and [UXFeatureGuard]
```

#### A-N1：CLI feature 不收到 UX advisory

```gherkin
Given the prompt is "实现一个 CLI 子命令"
When prompt intent facts are produced
Then bdd_feature_advice is 1
And ux_feature_guard_advice is 0
And the hook prints [BDD]
And the hook does not print [UXFeatureGuard]
```

#### A-N2：英文 token 不得子串误触发

```gherkin
Given the prompt is "build a CLI command"
When prompt intent facts are produced
Then bdd_feature_advice is 1
And ux_feature_guard_advice is 0
```

并增加至少一个 `build a test suite` 或同类 fixture，证明 `ui` 子串不会命中。

#### A-N3：host 注入内容不得制造 UX intent

```gherkin
Given host context mentions frontend/UI
And the stripped user prompt only asks to build a CLI command
When UX advice is classified
Then ux_feature_guard_advice is 0
```

#### A-F1：既有 exclusions 保持不变

Diagnostic、review、consultation、passive status 等现有 suppressed cases 对 BDD/UX advisory 均不回归。

---

## 7. Track B — Design-proposal convention and user-level skill

### 7.1 Update `design-options.md`

在 `Step 1 Reference Evidence` 与 `Variant Generation` 之间增加 **Product Boundary Prerequisite**：

ImageGen 运行前至少必须冻结：

- Page/surface；
- Primary audience / role；
- Requested user-visible outcome；
- Frozen product rules；
- Forbidden extras / non-goals；
- Allowed visible concepts；
- Backstage-only concepts；
- Required failure/recovery/accessibility behavior。

边界不完整时：停止 variant generation，先补 draft PRD/brief；不得通过生成图“探索”缺失的 feature semantics。

同时在 choice capture 后增加 **Taste Refinement Authority Ceiling**。

#### Taste authority table

| Category | Taste may apply directly | Proposal only / forbidden to apply |
|---|---|---|
| Visual hierarchy | Yes | — |
| Spacing / density | Yes | — |
| Typography | Yes | — |
| Color/tokens within approved brand constraints | Yes | New brand/product policy |
| Existing component selection and composition | Yes | New product feature or new route |
| Presentation of already-approved states | Yes | Adding a new state |
| Copy polish | Only when semantics stay identical | New promise, policy, error meaning or CTA semantics |
| Interaction polish | Only when behavior stays identical | New interaction rule, persistence or retry behavior |
| Feature/state/role/route/setting/data field | No | Return a labelled proposal only |
| Product policy/default/threshold/retry/fallback | No | Return a labelled proposal only |
| Diagnostic/developer mode | No | Return a labelled proposal only |

Required rule：taste 的 proposal 不自动进入 PRD、brief 或实现；必须回到产品 authority，由人类明确接受后重新冻结边界。

### 7.2 Create user-level `design-proposal` skill

#### Frontmatter

```yaml
name: design-proposal
description: >-
  End-to-end frontend design-proposal workflow: cited peer research,
  draft product-boundary freeze, 2-3 STIMULUS previews, human choice,
  then bounded taste refinement and final PRD/design-brief handoff.
when_to_use:
  - design proposal
  - preview 方案
  - 出设计方案
  - 前端方案
  - 设计预览
  - mockup pipeline
```

#### Required sections

1. **Outcome Contract**
   - Cited reference cases；
   - Draft boundary/PRD；
   - 0 or 2–3 STIMULUS variants（single-direction 时为 0）；
   - Human choice evidence；
   - Taste refinement output；
   - Final PRD/design-brief location。

2. **Step 1 — Peer Research**
   - 浏览真实产品案例；
   - 每项记录 source/product、可学习点、应避免点；
   - 只可得出 pattern-exists、visual-structure、candidate-fit；
   - 不可得出 feature-need、product-policy、数值阈值、retry 规则或 accessibility 语义；
   - 无法验证的内容标记 `[UNVERIFIED]`，不得编造竞品事实。

3. **Step 2 — Draft Boundary Freeze**
   - 在 repo-harness repo 内调用/遵循 `repo-harness-prd` 与 UX Feature Guard；
   - 先写 draft PRD/product boundary，再允许 imagegen；
   - 缺少 audience、outcome、non-goals、concept boundary 或 recovery 时停止。

4. **Step 3 — ImageGen STIMULUS Variants**
   - Web 使用 `imagegen-frontend-web`；mobile 使用 `imagegen-frontend-mobile`；
   - 只有存在真实 2–3 个方向时运行；最多 3 个；
   - 每张图标记 `STIMULUS`，附一行 trade-off；
   - 图中偶然出现的 control、setting、route、copy 不得反写入 PRD。

5. **Step 4 — Neutral Presentation and Human Choice**
   - 每个方向展示 evidence、preview、trade-off；
   - 明确写出 “what I am NOT concluding”；
   - 不推荐、不排序为默认、不自行选择；
   - 用户缺席时展示后停止；
   - 用户选择记录为 `user_evidence`，synthetic image 不作为选择权威。

6. **Step 5 — Taste Refinement**
   - 默认交给 `design-taste-frontend`；用户明确指定时才使用 `gpt-taste`；
   - 遵循 design-options 的 taste authority ceiling；
   - 任何语义变化仅输出 `PROPOSED_PRODUCT_CHANGE`，不得直接应用。

7. **Step 6 — Finalize PRD and Design Brief**
   - 把人类选择和合法的 taste refinement 写入最终 PRD/brief；
   - 填写 role-aware concept boundary；
   - 保留 P1/N1/F1 scenario IDs；
   - 进入正常 contract/implementation 路径。

8. **EXECUTION_BOUNDARY**
   - 未写明的 requirement 是 forbidden design space；
   - developer views、debug panels、provider/model selectors、内部 queue/fallback 等未授权内容 fail closed；
   - 但不得删除必要 error state、recovery、retry、status visibility、security message 或 accessibility semantics；
   - “少做”不能成为吞错、隐藏失败或破坏恢复路径的理由。

9. **Degradation**
   - 缺失某个 sub-skill 时，明确输出 `SKIPPED: <step> — <reason>`；
   - 不伪造浏览、图片或 taste 结果；
   - 不静默替代为其他 skill；
   - multi-direction choice 未被人类关闭时不得进入实现。

10. **Boundaries**
    - 不替代 design-brief checklist；
    - repo conventions 优先；
    - 不注册 harness route/policy；
    - 不创建新 ledger/artifact type。

### 7.3 Add minimal harness pointers

仅在现有 optional-enhancer 语境中加入少量指针：

- `assets/skill-commands/repo-harness-prd/SKILL.md`：在 frontend route/step 15 附近说明，安装了 `design-proposal` 时可用它编排 research → draft boundary → STIMULUS → choice → taste，但 PRD skill 和 design brief 仍是 repo authority。
- `assets/templates/design-brief.template.md` 的 Preview Attachment 附近：说明 `design-proposal` 是可选 host enhancer，不替代确认 checklist。

Repo 内不得加入 skill 正文、安装器逻辑、policy key、route row 或 capability registry。

---

## 8. Track C — Role-aware concept boundary in design brief

### New canonical section

在 UX Feature Guard 区域加入：

```markdown
### Role-aware User-visible Concept Boundary（按角色的可见概念边界）

- Surface audience / role（当前界面面向谁）:
- Allowed visible concepts for this role（该角色合法可见）:
- Required outcome / recovery concepts（为结果与恢复必须可见）:
- Backstage-only concepts for this role（必须留在后台）:
- Role-gated exceptions（其他角色可见的例外；没有则写 `none`）:
- Authority for each exception（例外依据；没有则写 `N/A`）:
```

### Rules

- 不提供全局技术词黑名单；同一 concept 是否合法取决于 surface audience/role 和产品 authority。
- 对 end-user surface，model/provider/prompt/queue/raw trace 等常见内部 concept 可被列为 backstage-only。
- 对 developer/admin product，只有在 PRD 明确授权并写出角色例外时才可见。
- `UX-{{SLUG}}-N1` 应从 backstage-only/non-goal 字段推导，断言这些 concept/controls/routes 不可见。
- `UX-{{SLUG}}-F1` 仍需证明错误被转换为可理解的失败与下一步行动，而不是暴露 raw provider response。
- Confirmation Checklist 增加：角色字段已填写、例外有 authority、N1 覆盖后台 concept、recovery/accessibility 未被删减。

### Parity sites

保持以下投影 byte parity：

- `assets/templates/design-brief.template.md`
- `.claude/templates/design-brief.template.md`
- `scripts/ensure-task-workflow.sh` 中的模板 heredoc
- `assets/templates/helpers/ensure-task-workflow.sh` 中的模板 heredoc

必要时使用现有 sync helper，不手工维护第二语义版本。

---

## 9. Track D — Ledger closeout and deferred trigger

### Close stale goals

- 关闭 `tasks/todos.md` 中 BDD² revival 与 BDD3-PS1 对应的 stale rows，引用已有 sealed outcome。
- VH1 条目保持开放。
- 记录 routing-defaults residue 已在当前 main 修复，不创建重复任务。

### Add deferred rendered-surface goal

在 `tasks/todos.md` 增加一条 deferred goal：

```markdown
Goal: Evaluate a rendered-surface anti-extras proof only after an observed brief-to-UI leak.
State: deferred / monitor
Revisit trigger: The first real frontend task where a confirmed design brief contains
role-aware backstage-only concepts and an N1 scenario, but the delivered UI still exposes
an unauthorized developer-view concept/control/route.
Required evidence: task/brief/scenario ID, screenshot or DOM/a11y evidence, exact leaked
concept, and why the existing hand-written scenario/test did not catch it.
Next smallest experiment: add a feature-specific assertion in the affected product repo;
consider a generic repo-harness helper only after the evidence shows repeatable cross-repo reuse.
Forbidden premature response: no global vocabulary, classifier, lifecycle, or new eval suite.
```

触发条件只启动 bounded review，不自动批准建设 helper。

### Archive residue

使用标准 helper 归档：

```bash
repo-harness run archive-workflow \
  --plan plans/plan-20260714-1353-design-options-proactive-choice.md \
  --outcome Completed
```

归档后检查 `git status`，只接受该 plan family 和 helper 明确生成的状态投影变化。

---

## 10. File-change Matrix

| File / Surface | Action | Acceptance focus |
|---|---|---|
| `src/cli/hook/prompt-intents.ts` | Edit | New frontend-scoped advisory, `ctx.text`, EN token boundaries |
| `src/cli/commands/prompt-guard-decision.ts` | Edit | Emit `ux_feature_guard_advice` only; no route impact |
| `assets/hooks/prompt-guard.sh` | Edit | Split BDD and UX echoes; advisory only |
| `.ai/hooks/prompt-guard.sh` | Generate | Byte parity with asset hook |
| `tests/cli/prompt-intents.test.ts` | Edit | Positive/negative/boundary/injected-context fixtures |
| `tests/ux-feature-guardrail.test.ts` | Edit | New fact block, template/convention/pointer assertions |
| `tests/hook-runtime.test.ts` | Conditional edit | End-to-end stdout assertion if existing harness makes it cheap |
| `tests/hook-contracts.test.ts` | Verify | No contract regression |
| `assets/reference-configs/design-options.md` | Edit | Boundary-before-imagegen + taste ceiling |
| `docs/reference-configs/design-options.md` | Mirror | Byte/canonical parity |
| `assets/templates/design-brief.template.md` | Edit | Role-aware concept fields + checklist + pointer |
| `.claude/templates/design-brief.template.md` | Mirror | Parity |
| `scripts/ensure-task-workflow.sh` | Projection edit/sync | Parity |
| `assets/templates/helpers/ensure-task-workflow.sh` | Projection edit/sync | Parity |
| `assets/skill-commands/repo-harness-prd/SKILL.md` | Edit | Minimal optional pointer and corrected sequence |
| `tasks/todos.md` | Edit | Close stale rows + add observed-leak revisit trigger |
| Old design-options plan family | Archive | Standard helper only |
| `~/.claude/skills/design-proposal/SKILL.md` | Create outside repo | Content contract + dependency/degradation smoke |

### Explicitly forbidden changed paths

- `evals/bdd2/**`
- `evals/bdd3/**`
- `assets/workflow-contract.v1.json`
- `.ai/harness/workflow-contract.json`
- workflow route registries/policy keys for preview/design-proposal
- any new `src/**/preview*` module

---

## 11. Ordered Task Checklist

### Gate 0 — Readiness and isolation

- [ ] G0.1 Confirm active plan path and set status to `Approved` only after human approval.
- [ ] G0.2 Project the plan to its contract/review/notes files.
- [ ] G0.3 Confirm contract `allowed_paths` covers the matrix above and excludes sealed eval/workflow-contract paths.
- [ ] G0.4 Start or switch to isolated worktree `codex/bdd2-followthrough`.
- [ ] G0.5 Capture clean baseline outputs for focused tests and `check-task-workflow --strict`.
- [ ] G0.6 Record that the user-level skill is an external delivery surface, not part of the PR rollback unit.

### Track A — Advisory split

- [ ] A1 Add `UX_FEATURE_NOUN` matching with separate Chinese/English handling.
- [ ] A2 Use `ctx.text` for the UX noun test; retain BDD classifier behavior unchanged.
- [ ] A3 Add English token boundaries so `build`/`suite` cannot match `ui`.
- [ ] A4 Export `shouldEmitUxFeatureGuardAdvice` without changing existing exports’ behavior.
- [ ] A5 Import the new classifier in `prompt-guard-decision.ts`.
- [ ] A6 Emit `ux_feature_guard_advice` in the open `facts` record.
- [ ] A7 Confirm `pg_fact` dynamically maps the JSON key to `PG_FACT_UX_FEATURE_GUARD_ADVICE`; add no explicit mapping table unless current code requires it.
- [ ] A8 Split shell echo: `[BDD]` stays under `BDD_FEATURE_ADVICE`; `[UXFeatureGuard]` moves under `UX_FEATURE_GUARD_ADVICE`.
- [ ] A9 Verify no new `exit 2`, edit gate, policy mode or route decision was added.
- [ ] A10 Run hook sync and parity check.

### Track A tests

- [ ] AT1 `实现一个新功能页面` → BDD=1, UX=1.
- [ ] AT2 `实现一个 CLI 子命令` → BDD=1, UX=0.
- [ ] AT3 `build a dashboard` → BDD=1, UX=1.
- [ ] AT4 `build a CLI command` → BDD=1, UX=0.
- [ ] AT5 `build a test suite` → UX=0, proving no `ui` substring match.
- [ ] AT6 Host-injected frontend text + non-UI user request → UX=0.
- [ ] AT7 Diagnostic/review/passive exclusions remain suppressed.
- [ ] AT8 Hook stdout has no `[UXFeatureGuard]` for non-UI feature prompt.
- [ ] AT9 Hook stdout has both lines for UI feature prompt.

### Track B — Convention sequence and taste ceiling

- [ ] B1 Add product-boundary prerequisite before variant generation in canonical `design-options.md`.
- [ ] B2 State explicitly that imagegen cannot fill missing product semantics.
- [ ] B3 Preserve existing max-3 STIMULUS, neutral presentation and human-choice rules.
- [ ] B4 Add taste authority table with apply/proposal-only distinction.
- [ ] B5 State that semantic proposals require human acceptance and boundary re-freeze.
- [ ] B6 Sync/mirror `assets` and `docs` design-options copies.
- [ ] B7 Add tests asserting the corrected sequence and taste ceiling phrases.

### Track C — Role-aware design brief

- [ ] C1 Add audience/role, allowed concepts, required recovery concepts, backstage-only concepts, role exceptions and exception authority fields.
- [ ] C2 Explain that the boundary is role-relative, not a global denylist.
- [ ] C3 Update N1 guidance to derive absence assertions from backstage-only/non-goals.
- [ ] C4 Add protected-concerns wording for failure state, recovery, status visibility and accessibility.
- [ ] C5 Update confirmation checklist.
- [ ] C6 Propagate the canonical template through all four parity sites.
- [ ] C7 Add/adjust parity tests and content assertions.

### Track B external skill and pointers

- [ ] B8 Create `~/.claude/skills/design-proposal/SKILL.md` with every required section in §7.2.
- [ ] B9 Ensure the skill sequence is research → draft boundary → STIMULUS → human choice → taste → final PRD/brief.
- [ ] B10 Ensure missing sub-skills produce explicit `SKIPPED` lines rather than fabricated results or silent substitution.
- [ ] B11 Ensure the skill protects recovery/accessibility while forbidding unrequested developer views.
- [ ] B12 Add a minimal optional pointer in `repo-harness-prd/SKILL.md`.
- [ ] B13 Add a minimal optional pointer near design brief Preview Attachment.
- [ ] B14 Confirm no repo installer, route, policy key, vendored skill body or Codex copy was added.
- [ ] B15 Smoke-check `design-proposal` and report the resolution status of `design-taste-frontend`, `gpt-taste`, `imagegen-frontend-web`, `imagegen-frontend-mobile`.
- [ ] B16 Record external smoke evidence in task notes without copying the skill body into repo.

### Track D — Closeout and deferred evidence

- [ ] D1 Close stale BDD² revival todo with sealed outcome reference.
- [ ] D2 Close stale BDD3-PS1 todo with sealed outcome reference.
- [ ] D3 Leave VH1 open and unchanged except formatting required by the same edit.
- [ ] D4 Add the rendered-surface deferred goal with first-observed-leak trigger and required evidence.
- [ ] D5 State that the trigger opens a review, not automatic generic-helper implementation.
- [ ] D6 Record routing residue as already fixed; do not create duplicate code changes.
- [ ] D7 Archive the completed design-options plan through `archive-workflow`.
- [ ] D8 Inspect archive diff and reject unrelated moves.

### Verification and review

- [ ] V1 Run focused classifier/guardrail/hook suites.
- [ ] V2 Run TypeScript check.
- [ ] V3 Run hook/helper parity checks.
- [ ] V4 Run all root required checks.
- [ ] V5 Inspect `git diff --name-only` against allowed/forbidden path lists.
- [ ] V6 Search the diff for new blocking exits, preview modules, workflow-contract routes or sealed eval changes.
- [ ] V7 Generate/update structured checks evidence.
- [ ] V8 Complete gatekeeper/Waza `/check`-style review against the acceptance matrix.
- [ ] V9 Record human review result in the linked review artifact.
- [ ] V10 Only after pass: complete current workflow closeout and merge the isolated branch.

---

## 12. Verification Commands

### Focused tests

```bash
bun test \
  tests/cli/prompt-intents.test.ts \
  tests/ux-feature-guardrail.test.ts \
  tests/hook-runtime.test.ts \
  tests/hook-contracts.test.ts
```

### Type and projection parity

```bash
bun run check:type
bun run sync:hooks
bun run check:hooks
bun run sync:helpers
bun run check:helpers
```

### Canonical docs smoke

```bash
repo-harness docs show design-options
repo-harness docs show ux-feature-guard
```

### External skill smoke

```bash
test -f "$HOME/.claude/skills/design-proposal/SKILL.md"
for skill in \
  design-taste-frontend \
  gpt-taste \
  imagegen-frontend-web \
  imagegen-frontend-mobile
do
  if test -e "$HOME/.claude/skills/$skill/SKILL.md"; then
    printf 'FOUND %s\n' "$skill"
  else
    printf 'MISSING %s\n' "$skill"
  fi
done
```

依赖缺失必须进入 smoke 报告；不得伪造为成功。是否允许带缺失依赖完成 host artifact，由 human review 按 degradation contract 判断；仓库 PR 的正确性不由本机第三方 skill 是否安装决定。

### Root required checks

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts adopt --repo . --dry-run
```

### Diff guard review

人工确认：

```text
- no evals/bdd2 or evals/bdd3 changes
- no workflow-contract/policy/route additions for preview
- no new preview runtime module
- no new blocking path for the advisory facts
- no vendored copy of the user-level design-proposal skill
```

---

## 13. Human Acceptance Matrix

| Case | Expected result | Severity if failed |
|---|---|---|
| UI feature prompt | BDD + UX advice | P1 |
| CLI/backend feature prompt | BDD only | P1 |
| `build` / `suite` contains `ui` substring | No UX match | P1 |
| Host context says frontend, user asks CLI | No UX match | P1 |
| ImageGen before draft boundary | Workflow stops | P0 |
| Single direction | No synthetic variants | P1 |
| Multiple directions | At most 3 STIMULUS variants | P1 |
| Agent tries to recommend option | Rejected by convention | P0 |
| User absent | Present and stop | P0 |
| Taste adds route/setting/state | Proposal only, not applied | P0 |
| End-user brief leaks backstage concept | N1 fails/review rejects | P0 |
| Developer role explicitly authorizes trace concept | Allowed only with authority field | P1 |
| Anti-extras removes error/retry/a11y | Rejected as protected-concern regression | P0 |
| Missing sub-skill | Explicit skip/report, no fabrication | P1 |
| Sealed eval/workflow-contract touched | Sprint rejected | P0 |

### Review questions

- [ ] 每个新增规则是否有且只有一个 canonical home？
- [ ] 其他位置是否只是 deterministic projection 或短指针？
- [ ] 外部 skill 是否仍在 harness trust boundary 之外？
- [ ] 是否把 imagegen/taste 从 authority 降为 evidence/stimulus/refinement？
- [ ] role-aware boundary 是否避免了全局技术词黑名单？
- [ ] 是否保护了错误恢复、状态和 accessibility？
- [ ] 是否仍没有机器化 developer-view detector？
- [ ] deferred trigger 是否基于真实泄漏证据，而非预想风险？

---

## 14. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| UI noun false positive continues | Medium | Medium | `ctx.text` + English token boundaries + CLI/build/suite fixtures |
| UI noun misses uncommon phrasing | Medium | Low | Advisory only；fixture-first 扩展，不先扩大词表 |
| Draft boundary becomes形式主义 | Medium | Medium | 必填 audience/outcome/non-goal/concept/recovery；缺项禁止 imagegen |
| ImageGen visual content反写 PRD | Medium | High | STIMULUS label + explicit no-authority rule + final human choice authority |
| Taste 偷渡产品语义 | Medium | High | Apply/proposal-only table；语义变化重回 human authority |
| Role concept fields演变为全局 blacklist | Medium | High | Role-relative wording + explicit exception authority |
| 防加料误删 recovery/a11y | Medium | High | Protected-concern clause + F1/checklist/manual review |
| Four template sites drift | Medium | Low | sync helper + parity test + check:helpers |
| External skill无法在 PR 中审计 | Medium | Medium | 独立交付面；notes 记录路径与 smoke，不制造 repo 第二权威 |
| Archive helper moves extra files | Low | Medium | Explicit plan argument + immediate `git status` review |
| Sprint复活已杀 machinery | Low | High | Forbidden paths/scope + P0 review gate |

---

## 15. Definition of Done

只有全部满足才可标记 Sprint 完成：

- [ ] 所有 P0/P1 acceptance cases 通过。
- [ ] Track A–D checklist 全部完成或有经人类批准的明确删项；不得静默跳过。
- [ ] Focused tests、type check、hook/helper parity、root required checks 全绿。
- [ ] `check-task-workflow --strict` 仍输出成功。
- [ ] Review artifact 给出 PASS，并记录验证命令与结果。
- [ ] 仓库 diff 不含 sealed eval、workflow contract、preview runtime module 或新 blocking gate。
- [ ] `design-proposal` 用户级 skill 已安装并有真实 smoke 记录；依赖缺失如实记录。
- [ ] Stale todos 已关闭，rendered-surface goal 已按观察触发条件进入 deferred ledger。
- [ ] 旧 design-options plan 已由标准 helper 归档。
- [ ] 当前 work-package 完成 closeout，tasks/current/handoff 等投影一致。

---

## 16. Rollback

### Repo rollback

- Revert `codex/bdd2-followthrough` PR/merge commit。
- 运行现有 hook/helper sync，使 generated mirrors 回到 source 状态。
- 无数据库、schema、workflow-contract 或数据迁移回滚。

### Host artifact rollback

```bash
rm -rf "$HOME/.claude/skills/design-proposal"
```

删除该目录不应影响 repo-harness runtime；repo 内 pointer 使用 optional/when-installed 语义。

### Rollback invariant

回滚前后均不得修改 sealed `evals/bdd2` / `evals/bdd3` 证据。

---

## 17. Approval Decision

批准本 Sprint 等价于批准：

- 一个仓库 PR，实施 Tracks A、B 的 repo 半边、C、D；
- 一个仓库外的 Claude user-level `design-proposal` skill；
- 不批准任何 preview harness 模块、状态机、通用 rendered-surface helper、classifier 或新 eval program。

批准后应把 plan 状态从 `Draft` 改为 `Approved`，再按 contract-worktree 流程执行。
