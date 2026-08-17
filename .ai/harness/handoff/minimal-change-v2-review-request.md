# Review Request: 验收期复杂度检查 → 强制简化审计

> 状态：已裁决（2026-08-17）——enforce v2 缓议，先通电 advice 信号回路；见文末《裁决》
> 请求：审这个方向该不该走、落点对不对、三个待决点怎么定
> 上游触发：用户装了 `reclaim-code-entropy` skill（全局），追问它在 repo-harness 里的形态

## 用户意图（原话）

> 「应该是验收时候的复杂度检查，如果触发了，就强制进行一次简化审计」

不是要一个简化 agent，是要一道**验收期的复杂度门**，触发后强制跑一次简化审计。

## 已验证事实

### 1. `minimal_change` 已存在，且已跑在 Stop（验收）事件上

`.ai/harness/policy.json` 的 `minimal_change` 块：

```json
"mode": "advice", "stop_review": true,
"new_dependency": "warn", "new_file": "observe", "new_abstraction": "warn",
"protected_concerns": ["security","validation","data_loss","error_handling",
                       "accessibility","explicit_requirement","tests"],
"report_path": ".ai/harness/checks/minimal-change.latest.json",
"max_findings": 5, "event_dedupe": true
```

信号采集是确定性的，不依赖 LLM 判断（`src/cli/hook/minimal-change-signals.ts:66-78`）：

```
files_changed / files_added / files_deleted / loc_added / loc_deleted
binary_files / dependency_manifests_changed
new_dependencies / removed_dependencies / new_file_paths
abstraction_candidates
```

外加 `protected_changes`（`:39-44`），标记碰了保护面且 `needs_human_review: true` 的改动。

### 2. verdict 已有「触发了」这个状态

`src/cli/hook/minimal-change-signals.ts:25`：

```typescript
export type MinimalChangeVerdict = 'disabled' | 'lean' | 'review' | 'unknown';
```

`review` 就是触发态。`src/cli/hook/stop-handler.ts:447` 的 `minimalChangeReview` 已在消费。

### 3. `enforce` 是原作者留的槽位，被显式挡住

`src/cli/hook/minimal-change-policy.ts:16-17`：

```typescript
export type MinimalChangeMode = 'off' | 'advice';
export type MinimalChangeRawMode = MinimalChangeMode | 'enforce';
```

`normalizeMode`（`:101-107`）把 `enforce` 降级并 warn：

```typescript
if (value === 'enforce') {
  return { mode: 'advice', requestedMode: 'enforce',
    warning: 'minimal_change.mode=enforce is not supported in v1; normalized to advice' };
}
```

`blocking: false` 是**字面类型锁死**的（`:26` 声明 `readonly blocking: false`，`:154` 赋值），policy.json 改不动。`src/cli/hook/minimal-change-cli.ts:74` 注释："Stop integration must stay non-blocking"。

这是有意的 v1 边界，不是遗漏。

### 4. fleet 现状（不需要新增 agent 的依据）

`agents/fleet/` 七个：`explorer` / `deep-reasoner` / `fast-worker` / `deep-worker` / `gatekeeper` / `root-cause-prover` / `harness-evaluator`。

切分维度是**能力类型 × effort**，不是任务领域——没有 test agent、docs agent、migration agent。`fast-worker` 的 description 里 "refactoring" 已在职责内。

`agents/fleet/gatekeeper.md` 的 description 第一个词是 **Read-only**（比装到 HOME 的那份措辞更硬）。

安装链：`scripts/install-agent-fleet.sh` → `agents/fleet/` 为源 → `.codex/agents/*.toml` 是 byte-identity golden，`tests/install-agent-fleet.test.ts:135` 断言。改 fleet 必须经 installer 重新生成 golden，不能手改（见 `tasks/archive/notes-20260801-1944-fleet-authority-cleanup.md`）。

### 5. 测试覆盖缺口

codegraph 报告：`MinimalChangePolicy`（`minimal-change-policy.ts:22`）12 个 caller，**无覆盖测试**。`MinimalChangeReport` 有 `tests/minimal-change-signals.test.ts`。

## 提案

不加 agent，不动 gatekeeper。把 v1 预留的 `enforce` 实现成 v2：

```
Stop 事件
  → collectMinimalChangeSignals（已有，确定性）
  → verdict === 'review' 且 mode === 'enforce'
  → 强制一次 reclaim-code-entropy 审计（audit 模式，只出候选不自动删）
  → 结论落到 .ai/harness/checks/ 或 tasks/reviews/
  → 未完成审计则 Stop 不放行
```

`reclaim-code-entropy` 作为触发后的**执行方法论**，由 orchestrator 派 `deep-reasoner` 加载执行。

### 为什么不融进 gatekeeper

1. 它是 Read-only，简化必须落成 diff，融进去推翻角色前提。
2. 它是二值 ship 判断。复杂度超标表达成 `VERDICT: FAIL`，会让「代码正确、验证全绿、只是有点肥」和「测试挂了」走同一通道，闸门信噪比毁掉。
3. 复杂度属于 Stop gate，ship gate 只管 ship。

### 为什么不加第八个 fleet agent

破坏 fleet 的能力类型正交性；也撞 reclaim skill 自己列的第 4 类熵（extra route：通向同一行为的第二个前门）和 repo CLAUDE.md 的「Create shared components only for observed reuse or a cross-module invariant」。

### 为什么 skill 不进 `assets/skills/`

原判断是不进（那批 skill 全是 plan→contract→review→ship 契约链的环节，reclaim 是通用代码技能，放进去会把 repo-harness 从「工作流契约分发器」变成「通用 skill 商店」，且强加给每个下游生成的 repo）。

**但用户这个意图翻转了它**：一旦 reclaim 成为 enforce 触发后的固定执行体，它就是契约环节而非通用技能。**这一条需要 Fable 重新裁决**——进 `assets/skills/` 还是保持全局 skill 只作方法论引用。

## 三个待决点

### A. 阈值从哪来

现在三个信号是分类（`warn`/`observe`/`off`）不是阈值，没有 `loc_added > N` 这类线。verdict 怎么从 `lean` 翻成 `review` 需要一组具体的数。定死即成契约，改是 breaking change。

### B. 循环收敛

简化审计本身产生 diff → 再触发 Stop → 再触发检查。`policy.json` 已有 `circuit_breakers.review: {lite:1, standard:1, strict:2}` 和 `repair_loops: 2` 可复用，但要显式绑上去，否则 enforce 第一天就把人卡死。

### C. 强制的强度（只有用户能定，尚未定）

- **软**：往 Stop 输出注入「必须先跑审计」的指令。agent 可能绕过，但不打破任何不变量。
- **硬**：Stop 真的拦住不让结束。需要解锁 `blocking: false` 这个类型层不变量——这会让 `minimal_change` 从观察器变成阻断器，是 repo-harness 里**第一个非验证类的阻断门**。

## 请 Fable 具体审什么

1. **落点对不对**：Stop gate 的 `minimal_change` v2 是不是这个意图的正确宿主？有没有更好的插入点（contract-worktree finish？acceptance receipt？merge-gate？）
2. **`blocking: false` 该不该解锁**：v1 把它锁成字面类型是刻意的。翻转它的代价是什么？有没有不打破它就能实现「强制」的路径？
3. **reclaim skill 进不进 repo**：见上面那条被翻转的判断。
4. **阈值该由谁定**：写死在 policy 默认值，还是每个下游 repo 自己配？前者是契约，后者是逃生舱但会让 enforce 形同虚设。
5. **反证**：这整个方向是不是在给一个没被证实的问题造机器？现有 `advice` 模式跑了多久、产出的 `minimal-change.latest.json` 里 verdict=`review` 出现过几次、有没有证据表明 advice 被忽略了——**这个数据我没查，是提案最大的空洞**。如果 advice 从没被无视过，enforce 就是过度设计，正好命中 reclaim skill 自己列的第 3 类熵（speculative generality）。

## 边界

未写任何产品代码。工作树在此提案期间只新增了本文件。全局装了 `~/.claude/skills/reclaim-code-entropy/`（用户明确要求），与本 repo 无耦合。

## 裁决（2026-08-17）

enforce v2 缓议，一条也不实现。

第 5 条反证被查实了，而且比提案里担心的更糟：advice 模式的信号回路在本 repo 从来没有运行过。`.ai/harness/policy.json` 的 `minimal_change.post_edit_observer` 一直是 `false`，而 `src/cli/hook/mutation-observed.ts:113` 的采集开关是 `policy.mode !== 'off' && policy.post_edit_observer` 双重门——`mode: "advice"` 单独不够。两个月里 `collectMinimalChangeSignals` 一次没被 PostToolUse 链路调起，`.ai/harness/checks/minimal-change.latest.json` 没有历史，`verdict: 'review'` 出现次数为零。

没有运行数据就没有裁决依据。A（阈值从哪来）、B（循环收敛）、C（强制的强度）三个待决点，以及请审的第 1、2 点（落点、`blocking: false` 该不该解锁），全部缓议至信号跑出真实分布之后。给一个观测次数为零的现象定阈值、解锁类型层不变量，就是提案自己点名的第 3 类熵。

本次改动就是通电第一步：只把本 repo 的 `post_edit_observer` 置为 `true`，并补上开关语义的测试覆盖（`tests/minimal-change-policy.test.ts` 的 normalize 断言、`tests/mutation-observed.test.ts` 的 advice-only 不启用一条）。`src/cli/hook/minimal-change-policy.ts` 的 defaults 和 `assets/` 模板一律不动——default-off 是 e526a4d0 审查批准的契约，per-repo 显式 opt-in 是设计内路径，不是绕过。这也顺带补上了第 5 节记的 `MinimalChangePolicy` 无覆盖测试缺口。

第 3 点（reclaim skill 进不进 repo）维持原判断：留在全局 `~/.claude/skills/`，不进 `assets/skills/`。翻转它的前提是 reclaim 成为 enforce 触发后的固定执行体，而 enforce 本身已缓议，前提不成立。

重开这份提案的触发条件：`minimal-change.latest.json` 积累出一段真实的 verdict 分布，且能指出具体的 `review` 被忽略的案例。
