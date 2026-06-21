# Sprint: Minimal-Change Hooks（Ponytail 高价值机制融入 repo-harness）

> **Status**: Done
> **Source PRD**: `plans/prds/Cherry-pick Analysis of Ponytail into Repo-harness Hooks.md`

```yaml
sprint_id: 20260621-minimal-change-hooks
status: Done
target_branch: codex/minimal-change-hooks
duration: 10 engineering days
risk: medium-high
owners:
  engineering: TBD
  reviewer: TBD
source_research:
  - DietrichGebert/ponytail
  - Ancienttwo/repo-harness
target_release: next-minor
```

## PRD

This sprint implements the high-value minimal-change principles from the Ponytail analysis as native repo-harness hook/runtime/policy behavior. The execution must preserve public hook tuples, single host decision ownership, advisory-only semantics, packaged/repo-pinned parity, and protected correctness/security/testing concerns.

## Backlog

| # | Status | Task | Mode | Acceptance | Plan |
|---|---|---|---|---|---|
| 1 | [x] | PR 1 - add minimal-change policy and SessionStart context | inline | Policy parser, fixed context renderer, hook-only CLI, SessionStart hook, repo/assets parity, and protocol tests pass without changing public route tuples. | Section 14 PR 1 |
| 2 | [x] | PR 2 - collect minimal-change edit signals | contract | PostToolUse/edit writes deterministic objective signals silently, with package.json dependency detection, protected fixtures, atomic write, dedupe, and performance evidence. | Section 14 PR 2 |
| 3 | [x] | PR 3 - add prompt and stop minimal-change review | contract | Execution prompt advice and Stop review are integrated through existing single decision owners, with mode-off byte regressions and no double JSON. | Section 14 PR 3 |
| 4 | [x] | PR 4 - package, migrate, document minimal-change hooks | contract | Canonical policy defaults, init/migrate/adoption paths, docs/changelog, package tarball, and release checks are complete. | Section 14 PR 4 |

## 1. Sprint Goal

把 Ponytail 最有价值的“最小实现阶梯”与“反过度工程审查”能力，以 **repo-harness 原生 hook/runtime/policy 形态**接入现有工作流：

1. 在执行开始时注入短小、稳定的最小实现原则。
2. 仅对 execution intent 提供最小改动建议，不干扰 planning/review/passive prompts。
3. 在编辑后收集客观 diff/dependency/file-count 信号。
4. 在 Stop 阶段生成一次非阻断的 minimal-change review 证据。
5. 保持 Claude Code 与 Codex hook 协议、公开 route tuple、信任哈希顺序不变。
6. 同时支持 packaged central-first hooks 和 repo-pinned self-host hooks。
7. 缺失或损坏配置默认 off；显式 opt-in 后保持 `advice`，本 Sprint 不引入强制阻断。

## 2. 背景与关键架构结论

### 2.1 Cherry-pick 的是原则，不是 Ponytail runtime

引入：

- “能不写就不写 → 标准库 → 平台原生能力 → 已有依赖 → 一行实现 → 最少新增代码”的决策阶梯。
- 不创建未被需求驱动的抽象、扩展点、wrapper、future-proof scaffolding。
- 优先删除/收缩已有代码，而非叠加新层。
- 审查标签：`delete`、`stdlib`、`native`、`dependency`、`yagni`、`shrink`。
- 安全边界：不得以精简为由移除验证、数据安全、错误处理、安全控制、可访问性、明确需求或必要测试。

不引入：

- `.ponytail-active` 独立状态文件。
- Ponytail 自己的 Claude/Codex JSON 适配。
- `/ponytail` 命令解析器。
- 另起一套 plugin lifecycle。
- 每次 hook 都读取整份 SKILL.md。
- Sprint 1 中的 blocking/enforce 模式。
- 以 LOC 减少量作为唯一成功指标。

### 2.2 必须遵守的 repo-harness 约束

- `src/cli/hook/route-registry.ts` 中 `(event, routeId, matcher)` 是公开 host adapter contract。
- route 顺序不能变化；Codex 会对 adapter entry 做信任哈希。
- script 名称及同一路由内 script 数组属于内部实现，可扩展，但不得改 route tuple/order。
- `src/cli/hook-entry.ts` 是高频、并发调用的轻量入口，不得 cold-load 完整 CLI。
- SessionStart 可聚合多个脚本的 context。
- UserPromptSubmit 应只有一个 decision 所有者：现有 `prompt-guard.sh`。
- Stop 应只有一个 decision 所有者：现有 `stop-orchestrator.sh`。
- PostToolUse/edit 可增加静默 observer；observer 只写证据，不输出 host decision。
- `.ai/harness/policy.json` 当前 self-host 固定 `"hook_source": "repo"`；实现必须同时维护 `.ai/hooks/` 与 `assets/hooks/`。
- downstream 默认仍应走 packaged central-first resolution，不能要求用户复制 Ponytail runtime。

## 3. Non-goals

- [ ] 不增加新的公开 HookEvent。
- [ ] 不增加新的 RouteId。
- [ ] 不修改任何 route 的 matcher。
- [ ] 不重新排序 `ROUTES`。
- [ ] 不修改用户级 `~/.codex/hooks.json` 或 `~/.claude/settings.json` 的 adapter tuple。
- [ ] 不在 PreToolUse 阶段推断“是否过度工程”并阻止编辑。
- [ ] 不执行网络请求、包搜索、模型调用或安装命令。
- [ ] 不在每次编辑后执行完整测试、全仓 AST 扫描或完整 `git status` 深分析。
- [ ] 不自动删除代码或依赖。
- [ ] 不把安全、验证、数据完整性、可访问性、测试视作可精简项。
- [ ] 不实现 `strict`/`enforce` 阻断；只保留未来 schema 扩展位。
- [ ] 不新增面向用户的 `repo-harness minimize` CLI 命令。
- [ ] 不直接 vendor Ponytail SKILL/plugin 文件。

## 4. Definition of Done

### Functional

- [ ] `.ai/harness/policy.json` 支持 `minimal_change` 配置，缺省为 `advice`。
- [ ] `mode=off` 时所有新增行为完全静默，且不生成新证据。
- [ ] SessionStart 注入不超过 180 English words 或等价长度的固定规则块。
- [ ] 最小实现提示只附加到 `embedded_approved_plan`、`bug_fix_execution`、`plan_execution_projection`、`general_execution`。
- [ ] planning、review、passive status、done 等 intent 不收到执行型 minimal-change 提示。
- [ ] PostToolUse/edit 写出版本化 objective signals，且不输出 decision JSON。
- [ ] Stop 生成/刷新最终 review 证据，但仍由 `stop-orchestrator.sh` 单独拥有 host response。
- [ ] protected concern 命中时只记录保护原因，不给删除/收缩建议。
- [ ] 同一 diff fingerprint 不重复追加相同事件。
- [ ] 报告 findings 最多 5 条，稳定排序，可重现。
- [ ] 任何解析失败都 fail-open，不阻断当前会话。

### Compatibility

- [ ] `ROUTES` 中 event/routeId/matcher tuple 和数组顺序与基线完全相同。
- [ ] Claude Code 协议 smoke test 通过。
- [ ] Codex 协议 smoke test 通过。
- [ ] `hook_source=repo` 自托管路径通过。
- [ ] packaged `assets/hooks` 路径通过。
- [ ] repo-local hook 缺失时仍遵守 runtime 现有 soft-missing 行为。
- [ ] 安装、迁移、recursive copy、sync tests 覆盖新增文件。
- [ ] 不新增 runtime npm dependency。

### Performance

- [ ] 新 observer 只检查当前事件对应 path、受影响 manifest 与一次 bounded git diff。
- [ ] 不使用全仓 `find`/递归 AST scan。
- [ ] fixture repo 中 PostToolUse/edit 新增中位开销目标 `<100ms`。
- [ ] fixture repo 中新增 p95 开销目标 `<200ms`。
- [ ] `repo-harness-hook` 其他 route 的冷启动无显著回归；允许阈值 `<=10%`。
- [ ] 连续并发调用不产生损坏 JSON 或部分写入文件。

### Quality

- [ ] 新增核心模块 unit coverage 达到项目现有 coverage gate。
- [ ] protected fixtures 的误报数为 0。
- [ ] opportunity fixtures 中至少 4/5 能产出正确 objective signal。
- [ ] 所有新增 shell 文件通过仓库现有 shell/static checks。
- [ ] `bun run check:type` 通过。
- [ ] `bun run check:ci` 通过。
- [ ] release/package checks 通过。
- [ ] README、中文 README、reference config、changelog 更新完成。

## 5. Proposed Policy Contract

在 `.ai/harness/policy.json` 增加：

```json
{
  "minimal_change": {
    "version": 1,
    "mode": "advice",
    "session_context": true,
    "prompt_advice": true,
    "post_edit_observer": false,
    "stop_review": true,
    "max_findings": 5,
    "max_context_words": 180,
    "new_dependency": "warn",
    "new_file": "observe",
    "new_abstraction": "warn",
    "protected_concerns": [
      "security",
      "validation",
      "data_loss",
      "error_handling",
      "accessibility",
      "explicit_requirement",
      "tests"
    ],
    "report_path": ".ai/harness/checks/minimal-change.latest.json",
    "event_dedupe": true
  }
}
```

### Policy semantics

| Field | Semantics |
|---|---|
| `mode=off` | 不注入 context、不分析、不写报告 |
| `mode=advice` | 注入指导、输出非阻断审查；编辑后信号收集仍需 `post_edit_observer=true` |
| `mode=enforce` | v1 解析为 `advice` 并记录 unsupported warning；不得阻断 |
| `new_dependency=warn` | 仅当 manifest diff 可证明新增依赖时产生信号 |
| `new_file=observe` | 记录新增文件，不单独判定为问题 |
| `new_abstraction=warn` | 仅对可解释的轻量启发式产生 candidate，不自动定罪 |
| `protected_concerns` | 任何命中均优先于 shrink/delete 建议 |
| `max_findings` | 对稳定排序后的候选做上限裁剪 |
| `report_path` | 必须位于 `.ai/harness/` operational state 下 |

### Precedence

```text
correctness
> explicit requirement
> security / validation / data integrity / accessibility
> workflow contract / approved plan
> verification evidence
> minimal-change advice
```

## 6. Target Architecture

```text
Host adapter
  └─ repo-harness-hook <event> --route <route>
      └─ src/cli/hook/runtime.ts
          ├─ SessionStart/default
          │   ├─ session-start-context.sh
          │   ├─ minimal-change-context.sh       [NEW]
          │   └─ security-sentinel.sh
          │
          ├─ UserPromptSubmit/default
          │   └─ prompt-guard.sh
          │       └─ prompt-guard-decide
          │           └─ minimal-change prompt advice [NEW, single decision owner]
          │
          ├─ PostToolUse/edit
          │   ├─ post-edit-guard.sh
          │   └─ minimal-change-observer.sh      [NEW, stdout silent]
          │       └─ minimal-change-signals
          │           └─ .ai/harness/checks/minimal-change.latest.json
          │
          └─ Stop/default
              └─ stop-orchestrator.sh
                  └─ minimal-change final review [NEW, single decision owner]
```

## 7. File-level Change Map

### New TypeScript files

- [ ] `src/cli/hook/minimal-change-policy.ts`
  - schema type、default、normalization、fail-open parsing。
- [ ] `src/cli/hook/minimal-change-context.ts`
  - SessionStart 固定规则块。
  - execution intent 的短 advice。
  - protected concern 说明。
- [ ] `src/cli/hook/minimal-change-signals.ts`
  - bounded diff facts。
  - manifest adapter。
  - deterministic fingerprint。
  - report serialization。
- [ ] `src/cli/hook/minimal-change-cli.ts`
  - hook-only 子命令分发。
  - 禁止 import commander/full CLI。
  - 支持 `context`、`signals`、`review` 三个 action。

### New repo-pinned hook files

- [ ] `.ai/hooks/minimal-change-context.sh`
- [ ] `.ai/hooks/minimal-change-observer.sh`
- [ ] `.ai/hooks/lib/minimal-change.sh`

### New packaged hook files

- [ ] `assets/hooks/minimal-change-context.sh`
- [ ] `assets/hooks/minimal-change-observer.sh`
- [ ] `assets/hooks/lib/minimal-change.sh`

### New tests

- [ ] `tests/minimal-change-policy.test.ts`
- [ ] `tests/minimal-change-context.test.ts`
- [ ] `tests/minimal-change-signals.test.ts`
- [ ] `tests/minimal-change-protocol.test.ts`
- [ ] `tests/minimal-change-performance.test.ts`
- [ ] `tests/fixtures/minimal-change/` fixture tree

### New docs

- [ ] `docs/reference-configs/minimal-change-hooks.md`
- [ ] `plans/sprints/20260621-minimal-change-hooks.sprint.md`（本文件）
- [ ] 可选：`plans/prds/20260621-minimal-change-hooks.prd.md`
- [ ] 可选：`docs/researches/ponytail-hook-cherry-pick.md`

### Existing files to modify

- [ ] `src/cli/hook-entry.ts`
  - 添加 hook-only 子命令。
  - 使用 bounded/dynamic import，避免给所有 route 增加冷启动成本。
- [ ] `src/cli/hook/route-registry.ts`
  - 仅修改 SessionStart/default 与 PostToolUse/edit 的 `scripts` 数组。
  - 不改 tuple、matcher、route 顺序。
- [ ] `src/cli/hook/prompt-guard-decision.ts`
  - 仅 execution intents 附加 minimal-change advice。
- [ ] `src/cli/commands/prompt-guard-decision.ts`
  - 如最终 host payload 在该层渲染，则在这里注入 advice；先通过 call graph 确认唯一输出点。
- [ ] `.ai/hooks/prompt-guard.sh`
  - 保持 adapter 角色，不新增第二份 decision。
- [ ] `.ai/hooks/stop-orchestrator.sh`
  - 调用 final review helper，写证据并把摘要合并到现有 Stop guidance。
- [ ] `assets/hooks/prompt-guard.sh`
- [ ] `assets/hooks/stop-orchestrator.sh`
- [ ] `.ai/harness/policy.json`
- [ ] policy 的 canonical managed source：
  - `src/core/adoption/manifest-templates.ts`
  - `src/core/adoption/workflow-contract-asset.ts`
  - `assets/workflow-contract.v1.json`
  - 具体落点由 Story 0 的 `rg` 结果确定；不得只改生成物。
- [ ] `tests/hook-contracts.test.ts`
- [ ] `tests/hook-runtime.test.ts`
- [ ] `tests/hook-protocol.test.ts`
- [ ] `tests/hook-shim-trust.test.ts`
- [ ] `tests/hook-recursive-copy.test.ts`
- [ ] `tests/installed-copy-sync.test.ts`
- [ ] `README.md`
- [ ] `README.zh-CN.md`
- [ ] `docs/CHANGELOG.md`

## 8. Hook-specific Design

### 8.1 SessionStart/default

目标 route 内部 scripts：

```ts
scripts: Object.freeze([
  'session-start-context.sh',
  'minimal-change-context.sh',
  'security-sentinel.sh',
])
```

Checklist：

- [ ] 保持 route 位置不变。
- [ ] 保持 `event='SessionStart'`。
- [ ] 保持 `routeId='default'`。
- [ ] 不增加 matcher。
- [ ] context script 从 stdin 消费统一 hook input。
- [ ] 使用 `HOOK_REPO_ROOT`，不自行猜 repo root。
- [ ] 读取 policy 失败时 exit 0。
- [ ] `mode=off` 时 stdout 为空。
- [ ] 输出为纯 context，由 runtime 现有 SessionStart aggregation 统一封装。
- [ ] 不写独立 activation flag。
- [ ] 不读取整份 Ponytail SKILL。
- [ ] 固定文案可快照测试。

建议 context：

```text
Minimal-change policy:
1. Confirm new code is necessary.
2. Prefer platform/stdlib, then an already-installed dependency.
3. Prefer the smallest direct implementation over new wrappers or extension points.
4. Delete or shrink obsolete code before adding layers.
5. Preserve explicit requirements, security, validation, data safety,
   error handling, accessibility, and runnable tests.
Before completion, justify each new dependency, file, and abstraction.
```

### 8.2 UserPromptSubmit/default

不增加第二个 route script。扩展现有 prompt guard decision/rendering：

```ts
type PromptGuardResult = {
  action: PromptGuardAction
  // existing fields...
  advisoryContext?: string[]
}
```

Checklist：

- [ ] 先定位 `classifyPromptGuardIntent` → decision → host JSON 的完整 call graph。
- [ ] 仅 `PROMPT_GUARD_EXECUTION_INTENTS` 命中时调用 minimal-change renderer。
- [ ] blocked action 原因保持原样；minimal-change 不覆盖 plan/spec/evidence gate。
- [ ] 如果 action 已 block，可不追加 minimal-change advice，减少噪声。
- [ ] `mode=off` 时 result byte-for-byte 与基线一致。
- [ ] planning/review/passive/done intent byte-for-byte 与基线一致。
- [ ] Claude 与 Codex 的 decision envelope 不新增未知顶层协议字段。
- [ ] advice 放进现有允许的 message/reason/additionalContext 字段。
- [ ] 不在 shell 中二次拼接 JSON。
- [ ] prompt 中已明确要求架构/抽象时，不做“禁止抽象”的误导；只要求证明必要性。

### 8.3 PostToolUse/edit

目标 route 内部 scripts：

```ts
scripts: Object.freeze([
  'post-edit-guard.sh',
  'minimal-change-observer.sh',
])
```

Observer 行为：

- 读取本次 Edit/Write 的 path。
- 只对受影响 path 和识别出的 dependency manifest 做 bounded diff。
- 生成 objective signals。
- 原子写入 report。
- stdout 永远为空。
- error 仅写简短 stderr，并 exit 0。

Checklist：

- [ ] 不改变 PostToolUse/edit tuple。
- [ ] observer 放在 `post-edit-guard.sh` 后。
- [ ] shell 只做 hook input/CLI adapter，不实现复杂 JSON parser。
- [ ] 使用临时文件 + rename 原子写。
- [ ] 并发写使用 lock 或 compare-and-swap/fingerprint。
- [ ] 无 git repo、detached state、untracked file、binary file 均 fail-open。
- [ ] 文件超大时只取 `git diff --numstat` 和 bounded header。
- [ ] binary change 记录 `binary=true`，不读取内容。
- [ ] manifest 只解析被修改的已知文件。
- [ ] 未知 ecosystem 不猜测新依赖。
- [ ] 不从变量名/类名直接判定“过度抽象”；只产生 candidate。
- [ ] protected path/keyword 不能直接等同安全，必须由 report 标为 `needs_human_review`。
- [ ] 不调用测试。
- [ ] 不输出 host decision JSON。
- [ ] dedupe fingerprint 覆盖 `HEAD/base + path + staged/unstaged diff hash + policy version`。

### 8.4 Stop/default

不增加第二个 Stop route script。扩展 `stop-orchestrator.sh`：

1. 在现有 stop review 前/中调用 `minimal-change review`。
2. 刷新 report。
3. 将最多 5 条摘要合并到现有 capture guidance。
4. 仍由 stop-orchestrator 生成唯一 host response。
5. v1 不阻断 Stop。

Checklist：

- [ ] Stop route tuple/order 不变。
- [ ] 不新增第二份 JSON envelope。
- [ ] `mode=off` 时现有 output byte-for-byte 不变。
- [ ] report 缺失时可现算一次 bounded summary。
- [ ] report stale 时刷新。
- [ ] 最终摘要包含：
  - 新依赖及理由。
  - 新文件数量及必要性。
  - 新 abstraction candidates。
  - 可删除/收缩项。
  - protected changes。
- [ ] findings 只作为 review prompts，不自动改代码。
- [ ] Stop 不因为 minimal-change finding 非零退出。
- [ ] handoff 中只记录 report path + verdict，不粘贴大段 diff。
- [ ] 与现有 plan self-review、evidence contract 的优先级一致。

## 9. Report Schema

目标文件：

```text
.ai/harness/checks/minimal-change.latest.json
```

Schema v1：

```json
{
  "version": 1,
  "policy_version": 1,
  "mode": "advice",
  "generated_at": "RFC3339",
  "repo_root": ".",
  "base_ref": "HEAD",
  "fingerprint": "sha256:...",
  "scope": {
    "paths": [],
    "manifest_paths": []
  },
  "signals": {
    "files_changed": 0,
    "files_added": 0,
    "files_deleted": 0,
    "loc_added": 0,
    "loc_deleted": 0,
    "binary_files": [],
    "dependency_manifests_changed": [],
    "new_dependencies": [],
    "new_file_paths": [],
    "abstraction_candidates": []
  },
  "protected_changes": [],
  "findings": [
    {
      "tag": "dependency",
      "path": "package.json",
      "severity": "advice",
      "evidence": "dependency X was added",
      "question": "Can the platform, stdlib, or an existing dependency cover this?"
    }
  ],
  "verdict": "lean"
}
```

### Allowed tags

- `delete`
- `stdlib`
- `native`
- `dependency`
- `yagni`
- `shrink`

### Verdict

- `disabled`
- `lean`
- `review`
- `unknown`

### Determinism

- [ ] paths 按 locale-independent byte order。
- [ ] findings 按 severity/tag/path/evidence 稳定排序。
- [ ] 时间字段不得参与 fingerprint。
- [ ] 同输入产生相同 signals/findings/verdict。
- [ ] error state 不输出半成品 JSON。
- [ ] schema version 不支持时 fail-open 并记录 `unknown`。

## 10. Dependency Manifest Adapters

Sprint 1 最小范围：

| Ecosystem | Manifest | Signal |
|---|---|---|
| Node/Bun | `package.json` | dependencies/devDependencies/optionalDependencies/peerDependencies 新 key |
| Python | `pyproject.toml` | 只在已有 parser/可靠 bounded parser 可用时支持，否则 Sprint 2 |
| Rust | `Cargo.toml` | 同上 |
| Go | `go.mod` | 新 require 行 |
| Ruby | `Gemfile` | 不做语义 parser，只记录 manifest changed |
| JVM | `build.gradle*`, `pom.xml` | 只记录 manifest changed |

Rules：

- [ ] Sprint 1 必须完整支持 `package.json`。
- [ ] 不为 TOML/XML 引入新 runtime dependency。
- [ ] 没有可靠 parser 时只输出 `manifest_changed`，不声称 `new_dependency`。
- [ ] workspace lockfile 变化本身不视为新增依赖。
- [ ] devDependency 仍记录，但 severity 不高于 advice。
- [ ] 删除依赖属于 positive shrink signal，不自动建议更多删除。
- [ ] 已有 dependency 从 dev 移到 prod 需单独标记，不算“新增 key”。

## 11. Protected Concerns Rules

以下变化不得生成 delete/shrink 建议：

- [ ] authn/authz、permissions、secrets、crypto、安全 header。
- [ ] input validation、schema validation、sanitization。
- [ ] transaction、backup、rollback、atomic write、data migration safeguards。
- [ ] retry/timeout/cancellation/error propagation。
- [ ] accessibility attributes、keyboard navigation、screen-reader behavior。
- [ ] 明确验收条件要求的代码。
- [ ] smoke/unit/integration/regression tests。
- [ ] 用于证明 non-trivial logic 的最小 runnable check。
- [ ] license/compliance/audit logging。
- [ ] concurrency/locking/idempotency correctness。

实现原则：

- Hook 不做最终语义判断。
- 信号只能将候选提升为 `protected_changes` 或 `needs_human_review`。
- 不确定时不报 finding。
- correctness/safety 优先于 net-negative LOC。

## 12. Epic Backlog

---

## Epic 0 — Baseline、Call Graph 与 Contract Freeze

### Story MC-000: Pin baseline and create evidence packet

**Likely files**

- `.ai/harness/policy.json`
- `src/cli/hook/route-registry.ts`
- `src/cli/hook-entry.ts`
- `src/cli/hook/runtime.ts`
- `src/cli/hook/prompt-guard-decision.ts`
- `src/cli/commands/prompt-guard-decision.ts`
- `.ai/hooks/prompt-guard.sh`
- `.ai/hooks/stop-orchestrator.sh`

**Checklist**

- [ ] 记录实现开始时的 `git rev-parse HEAD`。
- [ ] 记录 `git status --short`，确保不覆盖无关改动。
- [ ] 运行 `bun install` 或仓库规定的依赖准备流程。
- [ ] 运行基线 `bun test`。
- [ ] 运行基线 `bun run check:type`。
- [ ] 运行基线 hook protocol/trust/copy tests。
- [ ] 保存基线耗时。
- [ ] 导出当前 `ROUTES` 的 tuple snapshot。
- [ ] 导出当前 Claude/Codex adapter snapshot。
- [ ] 定位 policy canonical source：
  ```bash
  rg -n '"hook_source"|edit_plan_gate|workflow-contract' \
    .ai/harness assets src tests
  ```
- [ ] 定位 prompt guard 唯一 JSON renderer：
  ```bash
  rg -n 'runPromptGuardDecideCli|additionalContext|hookSpecificOutput|decision' \
    src/cli .ai/hooks assets/hooks tests
  ```
- [ ] 定位 Stop host output 唯一所有者。
- [ ] 记录 `.ai/hooks` 与 `assets/hooks` drift 基线。
- [ ] 创建 Sprint active marker，遵守仓库现有 sprint workflow。
- [ ] 将本 Story 展开为 decision-complete plan/contract/worktree。

**Acceptance**

- [ ] baseline commit、测试结果、route tuple、adapter snapshot 均已保存。
- [ ] canonical policy source 已明确，不再用“可能”路径。
- [ ] UserPromptSubmit/Stop 各自的唯一 host output owner 已确认。
- [ ] 基线失败有记录且未被新代码掩盖。

### Story MC-001: Architecture decision record

**Checklist**

- [ ] 记录“不 vendor Ponytail runtime”。
- [ ] 记录“advisory-only”。
- [ ] 记录“no new public route tuple”。
- [ ] 记录“single decision owner for Prompt/Stop”。
- [ ] 记录“objective signals in hot path; semantic review at Stop”。
- [ ] 记录“both repo-pinned and packaged copies”。
- [ ] 记录“不引入 runtime dependency”。
- [ ] 记录 fail-open/error policy。
- [ ] Reviewer 批准 ADR。

**Acceptance**

- [ ] 每个关键约束都有 rationale 和 rejected alternatives。
- [ ] ADR 与本 Sprint 没有冲突。

---

## Epic 1 — Policy 与 Context Core

### Story MC-100: Implement minimal-change policy parser

**New file**

- `src/cli/hook/minimal-change-policy.ts`

**Checklist**

- [ ] 定义 `MinimalChangeMode = 'off' | 'advice' | 'enforce'`。
- [ ] 定义 versioned interface。
- [ ] 提供 immutable defaults。
- [ ] unknown field 忽略。
- [ ] unknown mode → `off` fail-open default，并有测试。
- [ ] `enforce` 在 v1 normalize 为 `advice`，且 `blocking=false`。
- [ ] path 必须限制在 repo `.ai/harness/` 下。
- [ ] `max_findings` bounded，例如 1–20。
- [ ] `max_context_words` bounded。
- [ ] malformed JSON 不抛到 hook runtime。
- [ ] 不 import commander。
- [ ] 不 import adoption/full CLI。
- [ ] 只使用 Bun/Node 内置模块和现有依赖。
- [ ] 单元测试覆盖 missing/partial/malformed/unknown/future version。

**Acceptance**

- [ ] parser 在所有错误输入下返回安全、非阻断配置。
- [ ] `mode=off` 可确定性禁用全部 feature。
- [ ] no new dependency。

### Story MC-101: Implement fixed context renderer

**New file**

- `src/cli/hook/minimal-change-context.ts`

**Checklist**

- [ ] renderer 输入为 normalized policy + phase/intent。
- [ ] SessionStart 文案稳定且短。
- [ ] execution prompt advice 不超过 100 words。
- [ ] protected concern 文案不可省略。
- [ ] 不复制整份 Ponytail SKILL。
- [ ] 不引用 benchmark 百分比。
- [ ] 不鼓励 code golf。
- [ ] explicit requirement 优先级写清楚。
- [ ] snapshot tests。
- [ ] 中英文仓库内容不影响固定英文 hook context；文档可双语。

**Acceptance**

- [ ] 固定输入得到 byte-stable 输出。
- [ ] off mode 输出空字符串。
- [ ] context word budget 通过测试。

### Story MC-102: Implement hook-only minimal-change CLI

**New file**

- `src/cli/hook/minimal-change-cli.ts`

**Modify**

- `src/cli/hook-entry.ts`

**Proposed commands**

```text
repo-harness-hook minimal-change context --phase session
repo-harness-hook minimal-change signals --phase post-edit
repo-harness-hook minimal-change review --phase stop
```

**Checklist**

- [ ] 在 `hook-entry.ts` 的 event parser 之前识别命令。
- [ ] 优先 dynamic import 或证明静态 import 足够轻。
- [ ] 不加载 commander。
- [ ] context stdout 只输出 text/context。
- [ ] signals stdout 为空，错误走 stderr。
- [ ] review stdout 只输出给 stop-orchestrator 消费的内部 JSON，不直接作为 host envelope。
- [ ] 每个 action 有明确 exit code。
- [ ] stdin 只读一次。
- [ ] 支持并发调用。
- [ ] malformed stdin exit 0/fail-open。
- [ ] cold-start benchmark 加入测试。

**Acceptance**

- [ ] 其他 hook command 基线输出无变化。
- [ ] event route usage error 保持原样。
- [ ] CLI hot path 没有 full CLI import。

---

## Epic 2 — SessionStart Integration

### Story MC-200: Add minimal-change context hook

**New files**

- `.ai/hooks/minimal-change-context.sh`
- `.ai/hooks/lib/minimal-change.sh`
- `assets/hooks/minimal-change-context.sh`
- `assets/hooks/lib/minimal-change.sh`

**Modify**

- `src/cli/hook/route-registry.ts`

**Checklist**

- [ ] shell 使用 `set -euo pipefail`，但所有 feature failure 转为 exit 0。
- [ ] source 现有 `hook-input.sh`/shared helper pattern。
- [ ] 复用 `HOOK_REPO_ROOT`。
- [ ] 定位 `repo-harness-hook` 的方式与 `prompt-guard.sh` 一致。
- [ ] 不使用 `.ponytail-active`。
- [ ] 读取 policy 后调用 hook-only CLI。
- [ ] stdout 只含 context。
- [ ] `mode=off` stdout 为空。
- [ ] route scripts 改为：
  ```ts
  ['session-start-context.sh', 'minimal-change-context.sh', 'security-sentinel.sh']
  ```
- [ ] 不改 route tuple/order。
- [ ] repo 和 assets copy 内容一致。
- [ ] executable bit 一致。
- [ ] missing script behavior 有测试。
- [ ] SessionStart multi-context aggregation 有测试。
- [ ] Claude/Codex smoke test。

**Acceptance**

- [ ] 新 context 在 SessionStart 可见。
- [ ] security sentinel 仍执行。
- [ ] route public snapshot 不变。
- [ ] packaged/repo-pinned 都通过。

---

## Epic 3 — Prompt Guard Integration

### Story MC-300: Attach advice to execution intents

**Modify**

- `src/cli/hook/prompt-guard-decision.ts`
- `src/cli/commands/prompt-guard-decision.ts`
- `.ai/hooks/prompt-guard.sh`
- `assets/hooks/prompt-guard.sh`

**Checklist**

- [ ] 不新增 UserPromptSubmit script。
- [ ] 复用 `PROMPT_GUARD_EXECUTION_INTENTS`。
- [ ] `isExecutionIntent` 如需复用则导出，或在同模块内组合。
- [ ] decision matrix action 不变。
- [ ] block/advice/allow action 名称不变。
- [ ] 现有 evidence/contract gate 优先。
- [ ] 只有最终允许执行的路径附加 minimal advice。
- [ ] 用户明确要求新抽象/依赖时 advice 改为“justify”，而不是“remove”。
- [ ] prompt 中含安全、验证、可访问性、测试时保护优先。
- [ ] shell 不负责 JSON 拼接。
- [ ] Claude payload schema 不变。
- [ ] Codex payload schema 不变。
- [ ] mode off byte-for-byte regression test。
- [ ] planning intent regression test。
- [ ] passive status regression test。
- [ ] execution intent positive tests。
- [ ] plan block tests 保持原期望。

**Acceptance**

- [ ] 仅 execution intent 出现 minimal-change advice。
- [ ] 无双 JSON、无多余 stdout。
- [ ] 现有 prompt guard contract 全部通过。

---

## Epic 4 — Post-edit Objective Signals

### Story MC-400: Implement signal collector

**New file**

- `src/cli/hook/minimal-change-signals.ts`

**Checklist**

- [ ] 输入包含 repo root、edited path、policy、optional base ref。
- [ ] 使用 `git diff --numstat` 或等价 bounded command。
- [ ] 单次只处理本次 path + changed manifest。
- [ ] untracked file 能记录 `new_file_paths`。
- [ ] deleted file 能记录 positive deletion signal。
- [ ] rename 不双计 added/deleted。
- [ ] binary 不读取内容。
- [ ] `package.json` 解析新增/删除/移动 dependency。
- [ ] lockfile 不单独判新增依赖。
- [ ] 其他 manifest 仅记录 changed，除非有可靠 parser。
- [ ] abstraction candidates 规则公开、可测试、低置信度。
- [ ] 无法证明时不产生 finding。
- [ ] protected candidates 优先移入 `protected_changes`。
- [ ] max findings 裁剪。
- [ ] deterministic order。
- [ ] fingerprint 不含时间。
- [ ] report 原子写。
- [ ] concurrent write 测试。
- [ ] report parent dir 不存在时安全创建。
- [ ] path traversal 拒绝。
- [ ] symlink escape 拒绝或安全 normalize。
- [ ] error fail-open。

**Acceptance**

- [ ] objective signals schema v1 通过。
- [ ] package.json 新依赖、已有依赖、删除依赖测试通过。
- [ ] binary/rename/untracked/concurrent cases 通过。

### Story MC-401: Add post-edit observer hook

**New files**

- `.ai/hooks/minimal-change-observer.sh`
- `assets/hooks/minimal-change-observer.sh`

**Modify**

- `src/cli/hook/route-registry.ts`

**Checklist**

- [ ] scripts 改为：
  ```ts
  ['post-edit-guard.sh', 'minimal-change-observer.sh']
  ```
- [ ] route tuple/order 不变。
- [ ] observer 读取标准 hook input。
- [ ] 只在 Edit/Write 事件触发，由 route matcher 保证。
- [ ] stdout 永远为空。
- [ ] stderr 只输出短错误。
- [ ] exit 0。
- [ ] mode off 立即返回。
- [ ] dedupe 命中立即返回。
- [ ] repo/assets copies 一致。
- [ ] executable bit 一致。
- [ ] report path 写入成功。
- [ ] runtime 遇 observer soft failure 仍继续。
- [ ] no host decision output test。

**Acceptance**

- [ ] 编辑后 report 更新。
- [ ] 重复相同输入不重复工作。
- [ ] PostToolUse protocol 不受影响。

---

## Epic 5 — Stop Review 与 Handoff Evidence

### Story MC-500: Implement final review renderer

**Modify/new**

- `src/cli/hook/minimal-change-cli.ts`
- `src/cli/hook/minimal-change-context.ts`
- `src/cli/hook/minimal-change-signals.ts`

**Checklist**

- [ ] review 读取 latest report。
- [ ] fingerprint stale 时进行 bounded refresh。
- [ ] 最多 5 条 findings。
- [ ] 每条 finding 一行。
- [ ] tag 使用允许集合。
- [ ] 提问式建议，不直接命令删除。
- [ ] protected changes 单独分组。
- [ ] 无 finding 输出 `lean`。
- [ ] 不把 LOC 作为唯一 verdict。
- [ ] report missing/error → `unknown`，不阻断。
- [ ] internal JSON 与 host JSON 明确区分。
- [ ] stable snapshots。

**Acceptance**

- [ ] lean/review/unknown/disabled 四种结果有测试。
- [ ] 不泄露大 diff 或绝对用户路径。

### Story MC-501: Integrate into stop-orchestrator

**Modify**

- `.ai/hooks/stop-orchestrator.sh`
- `assets/hooks/stop-orchestrator.sh`

**Checklist**

- [ ] 不增加 Stop route script。
- [ ] 调用 helper 的位置不破坏现有 handoff refresh。
- [ ] plan self-review 先后次序有明确 rationale。
- [ ] minimal review 只追加 guidance/evidence。
- [ ] 唯一 host response 仍由 stop-orchestrator 输出。
- [ ] mode off byte-for-byte regression。
- [ ] finding 存在时仍 exit 0。
- [ ] existing stop block/allow semantics 不变。
- [ ] handoff 记录 report path、verdict、fingerprint。
- [ ] repo/assets copies 一致。
- [ ] Claude/Codex Stop protocol tests。
- [ ] no double JSON test。

**Acceptance**

- [ ] Stop 阶段用户/agent 能看到简短 review。
- [ ] 找到问题也不阻断。
- [ ] 现有 Stop orchestrator contract 不回归。

---

## Epic 6 — Adoption、Packaging 与 Migration

### Story MC-600: Update managed policy source

**Checklist**

- [ ] 根据 MC-000 结果修改 canonical source，不只改 `.ai/harness/policy.json`。
- [ ] downstream 新安装显式写入 `minimal_change.mode=advice`，但 `post_edit_observer=false`。
- [ ] migrate 对已有显式配置执行 preserve/merge。
- [ ] 用户显式 `off` 不被升级覆盖。
- [ ] unknown custom fields 保留。
- [ ] dry-run upgrade plan 显示新增 default。
- [ ] rollback 不删除用户自定义内容。
- [ ] workflow contract schema 如需更新则 versioned。
- [ ] adoption unit tests。
- [ ] migration fixture tests。
- [ ] inspect/doctor 输出能说明当前 mode（仅在已有输出模型允许时）。

**Acceptance**

- [ ] fresh init、migrate、upgrade、rollback 四条路径通过。
- [ ] explicit override 保留。
- [ ] 旧 repo 不因缺少字段失败。

### Story MC-601: Keep packaged and repo hook trees in sync

**Checklist**

- [ ] `.ai/hooks` 新文件完整。
- [ ] `assets/hooks` 新文件完整。
- [ ] shared lib 完整。
- [ ] mode bits 一致。
- [ ] recursive copy 覆盖 nested lib。
- [ ] npm package files 包含新增 assets。
- [ ] installed copy tests。
- [ ] self-host hook_source=repo tests。
- [ ] central-first packaged tests。
- [ ] sync drift test。
- [ ] 不覆盖 downstream custom hook。
- [ ] missing managed hook upgrade 行为符合 ownership contract。

**Acceptance**

- [ ] package tarball 中存在所有新增 hook。
- [ ] packaged 与 repo-pinned 行为等价。
- [ ] custom hooks preserved。

---

## Epic 7 — Tests、Evaluation 与 Performance

### Story MC-700: Contract and protocol regression

**Modify**

- `tests/hook-contracts.test.ts`
- `tests/hook-runtime.test.ts`
- `tests/hook-protocol.test.ts`
- `tests/hook-shim-trust.test.ts`

**Checklist**

- [ ] baseline tuple snapshot 与实现后完全相同。
- [ ] route 数量不变。
- [ ] route order 不变。
- [ ] matcher 不变。
- [ ] SessionStart internal scripts 扩展符合预期。
- [ ] PostEdit internal scripts 扩展符合预期。
- [ ] Prompt/Stop internal script 数量不变。
- [ ] Claude SessionStart aggregation。
- [ ] Codex SessionStart aggregation。
- [ ] Claude prompt decision。
- [ ] Codex prompt decision。
- [ ] Claude Stop decision。
- [ ] Codex Stop decision。
- [ ] no duplicate JSON。
- [ ] missing script soft behavior。
- [ ] nonzero observer fail-open。
- [ ] concurrent invocation。

**Acceptance**

- [ ] adapter trust snapshot 不变。
- [ ] 所有 host protocol tests 通过。

### Story MC-701: Safety evaluation fixtures

创建至少以下 fixtures：

1. **one-off dependency**
   - 为一个简单格式化任务新增包。
   - 期望：`dependency` finding。
2. **stdlib replacement**
   - 新依赖功能可由 stdlib 覆盖。
   - 期望：dependency + stdlib review question。
3. **existing dependency reuse**
   - package 已存在。
   - 期望：不报 new dependency。
4. **unnecessary wrapper**
   - 仅转发一个现有 API。
   - 期望：`shrink` 或 `yagni` candidate。
5. **duplicate helper**
   - 同一小逻辑第二份实现。
   - 期望：candidate。
6. **security validation**
   - 新增输入校验。
   - 期望：protected；不得 delete/shrink。
7. **data-loss safeguard**
   - 新增 atomic write/backup。
   - 期望：protected。
8. **accessibility**
   - 新增 aria/keyboard handling。
   - 期望：protected。
9. **regression test**
   - 新增最小测试。
   - 期望：protected。
10. **explicit requested abstraction**
    - approved plan 明确要求 public interface。
    - 期望：仅 justify，不要求删除。
11. **binary file**
    - 期望：不读取内容。
12. **unknown ecosystem manifest**
    - 期望：只报 changed，不猜 dependency。

**Checklist**

- [ ] 每个 fixture 有 expected report。
- [ ] protected false positive = 0。
- [ ] opportunity signal recall >= 4/5。
- [ ] output deterministic。
- [ ] findings <= configured max。
- [ ] no automatic code changes。
- [ ] reviewer 手工检查 wording。

### Story MC-702: Performance and concurrency

**Checklist**

- [ ] 记录基线 hook-entry cold start。
- [ ] 记录实现后 cold start。
- [ ] SessionStart 100 次采样。
- [ ] PostEdit observer 100 次采样。
- [ ] Stop review 50 次采样。
- [ ] 1k file fixture。
- [ ] 大 `package.json` fixture。
- [ ] binary diff fixture。
- [ ] 10 并发写 report。
- [ ] 50 并发 hook runtime 调用。
- [ ] 检查无 partial JSON。
- [ ] 检查无 deadlock。
- [ ] 检查无 orphan temp file。
- [ ] 检查 mode off 快路径。
- [ ] 生成 benchmark evidence。

**Acceptance**

- [ ] PostEdit median `<100ms` 目标达成，或给出有数据的 waiver。
- [ ] PostEdit p95 `<200ms` 目标达成，或给出有数据的 waiver。
- [ ] 其他 route 冷启动回归 `<=10%`。
- [ ] 并发测试稳定。

---

## Epic 8 — Documentation、Dogfood 与 Release

### Story MC-800: Documentation

**Checklist**

- [ ] `docs/reference-configs/minimal-change-hooks.md`：
  - architecture。
  - policy schema。
  - host behavior。
  - report schema。
  - fail-open。
  - protected concerns。
  - opt-out。
  - troubleshooting。
- [ ] `README.md` 添加 feature 与配置片段。
- [ ] `README.zh-CN.md` 同步。
- [ ] `docs/CHANGELOG.md` 记录。
- [ ] 明确该能力借鉴原则，不 vendor Ponytail。
- [ ] 不引用未经本仓验证的 benchmark。
- [ ] 说明 advice 不是 correctness/security review 替代品。
- [ ] 说明 `mode=enforce` v1 不阻断。
- [ ] 说明 report 是 operational evidence，不应提交或应遵循现有 ignore policy。
- [ ] 文档命令实际执行验证。

**Acceptance**

- [ ] 文档与当前实现/schema 一致。
- [ ] 中英文配置字段一致。
- [ ] 无过时 route 名称。

### Story MC-801: Dogfood on repo-harness

**Checklist**

- [ ] self-host `hook_source=repo` 开启 advice。
- [ ] 至少 20 个 SessionStart 样本。
- [ ] 至少 30 个 Edit/Write 样本。
- [ ] 至少 10 个 Stop 样本。
- [ ] 记录新增依赖发现。
- [ ] 记录新文件提示。
- [ ] 记录 protected cases。
- [ ] 标记每条 finding：useful / noise / unsafe。
- [ ] useful precision 目标 `>=80%`。
- [ ] unsafe finding 必须为 0。
- [ ] 修正 wording/heuristic 后重新跑 regression。
- [ ] mode off 回滚演练。
- [ ] packaged hook source smoke test。

**Acceptance**

- [ ] dogfood evidence 进入 `.ai/harness/checks/` 或现有 run evidence。
- [ ] unsafe finding = 0。
- [ ] reviewer 批准 default-off 和显式 advice opt-in。

### Story MC-802: Release readiness

**Checklist**

- [ ] `bun test`
- [ ] `bun run test:coverage`
- [ ] `bun run check:type`
- [ ] `bun run check:ci`
- [ ] `bun run check:release`
- [ ] package tarball inspect。
- [ ] installed-copy smoke test。
- [ ] fresh init smoke test。
- [ ] migrate smoke test。
- [ ] Claude Code host smoke test。
- [ ] Codex host smoke test。
- [ ] changelog。
- [ ] release note。
- [ ] rollback note。
- [ ] no new dependency verification。
- [ ] no route tuple/order diff verification。
- [ ] active Sprint 状态更新为 Done。
- [ ] handoff/current.md 刷新。
- [ ] archive/close contract/worktree。

**Acceptance**

- [ ] 所有 release gates 通过。
- [ ] next-minor release 可发布。
- [ ] rollback 只需 policy `mode=off` 或 revert feature PR，不需重装 host adapters。

## 13. 10-Day Execution Plan

### Day 1 — Baseline / contract freeze

- [ ] MC-000 完成。
- [ ] MC-001 ADR Draft。
- [ ] route/adapter snapshots。
- [ ] policy source 与 output ownership call graph 明确。
- [ ] 建立 benchmark baseline。
- [ ] Sprint active marker。
- [ ] Story 计划/contract/worktree 建立。

**Daily exit:** 不再存在架构级未知项。

### Day 2 — Policy / context / CLI core

- [ ] MC-100。
- [ ] MC-101。
- [ ] MC-102 基础实现。
- [ ] policy/context unit tests。
- [ ] hook-entry cold-start 初测。

**Daily exit:** 本地可运行 `minimal-change context`，off/advice 正常。

### Day 3 — SessionStart

- [ ] MC-200。
- [ ] repo/assets hook 文件。
- [ ] route internal script update。
- [ ] SessionStart aggregation/protocol tests。
- [ ] copy/sync 初测。

**Daily exit:** Claude/Codex SessionStart 都能收到短 context。

### Day 4 — Prompt guard

- [ ] MC-300。
- [ ] execution intent matrix tests。
- [ ] planning/passive/off byte regression。
- [ ] no duplicate JSON。
- [ ] prompt wording review。

**Daily exit:** 只有可执行 prompt 收到 advice，原 gate 无回归。

### Day 5 — Signals core

- [ ] MC-400。
- [ ] JSON report schema。
- [ ] package.json adapter。
- [ ] binary/rename/untracked。
- [ ] fingerprint/atomic write。
- [ ] initial fixtures。

**Daily exit:** 能从 bounded diff 生成 deterministic report。

### Day 6 — PostEdit observer / Stop review

- [ ] MC-401。
- [ ] MC-500。
- [ ] MC-501。
- [ ] concurrent report write。
- [ ] Stop single-owner tests。

**Daily exit:** 编辑后更新报告，Stop 给出非阻断 review。

### Day 7 — Adoption / packaging

- [ ] MC-600。
- [ ] MC-601。
- [ ] fresh init/migrate/upgrade/rollback。
- [ ] tarball/installed copy。
- [ ] self-host/packaged parity。

**Daily exit:** 新旧 repo 都可获得或关闭该能力。

### Day 8 — Full regression / safety fixtures

- [ ] MC-700。
- [ ] MC-701。
- [ ] protected concerns 误报修正。
- [ ] protocol/trust/copy tests。
- [ ] 全量 unit/integration。

**Daily exit:** public adapter contract 不变，protected false positive = 0。

### Day 9 — Performance / dogfood / docs

- [ ] MC-702。
- [ ] MC-800。
- [ ] MC-801 开始并完成最小样本。
- [ ] latency 与并发问题修复。
- [ ] 文档同步。

**Daily exit:** 具备可审查的 benchmark 与 dogfood evidence。

### Day 10 — Release gate / cleanup

- [ ] MC-801 reviewer sign-off。
- [ ] MC-802。
- [ ] final self-review。
- [ ] changelog/release note。
- [ ] rollback drill。
- [ ] Sprint/contract/worktree closeout。

**Daily exit:** 可合并、可发布、可一键关闭。

## 14. Suggested PR Slices

### PR 1 — `feat(hooks): add minimal-change policy and session context`

范围：

- policy parser。
- context renderer。
- hook-only CLI。
- SessionStart hook。
- route internal script update。
- unit/protocol tests。

Merge gate：

- [ ] tuple snapshot unchanged。
- [ ] mode off。
- [ ] SessionStart host smoke。

### PR 2 — `feat(hooks): collect minimal-change edit signals`

范围：

- signal collector。
- PostEdit observer。
- report schema。
- dependency adapter。
- atomic/dedupe/concurrency tests。

Merge gate：

- [ ] stdout silent。
- [ ] objective-only。
- [ ] performance target。
- [ ] protected fixtures。

### PR 3 — `feat(hooks): add prompt and stop minimal-change review`

范围：

- execution intent advice。
- Stop review。
- handoff evidence。
- prompt/stop protocol tests。

Merge gate：

- [ ] single decision owner。
- [ ] no double JSON。
- [ ] no blocking。
- [ ] byte regression for off/non-execution paths。

### PR 4 — `chore(adoption): package, migrate, document minimal-change hooks`

范围：

- canonical policy source。
- assets copy。
- migration/init/upgrade。
- docs/changelog。
- full release tests。

Merge gate：

- [ ] packaged/repo parity。
- [ ] custom hook preservation。
- [ ] package tarball。
- [ ] release checks。

## 15. Developer Tracking Checklist

### Start of every Story

- [ ] Sprint row selected through existing backlog helper.
- [ ] Decision-complete plan created/approved.
- [ ] Execution contract generated.
- [ ] Dedicated worktree started when required.
- [ ] Baseline tests scoped and recorded.
- [ ] Likely files confirmed by `rg`/call graph。
- [ ] Unrelated dirty files excluded。
- [ ] Acceptance criteria copied into plan。

### During implementation

- [ ] Keep route tuple/order unchanged。
- [ ] Keep host output ownership single。
- [ ] Keep feature advisory-only。
- [ ] Keep hot path bounded。
- [ ] Update repo and packaged hook copies together。
- [ ] Add test with every behavior change。
- [ ] Fail-open on parse/runtime error。
- [ ] Do not add dependencies。
- [ ] Do not weaken security/validation/tests。
- [ ] Update evidence after each validation run。

### Before review

- [ ] `git diff --stat` reviewed。
- [ ] New files justified。
- [ ] New abstractions justified。
- [ ] New dependencies count = 0。
- [ ] Public API/route snapshot reviewed。
- [ ] Shell stdout inspected。
- [ ] Claude payload inspected。
- [ ] Codex payload inspected。
- [ ] Mode off regression run。
- [ ] Protected fixtures run。
- [ ] Performance sample run。
- [ ] Repo/assets drift check run。
- [ ] Handoff updated。

### Before merge

- [ ] Story acceptance complete。
- [ ] Reviewer checklist complete。
- [ ] Contract evidence complete。
- [ ] `bun run check:ci`。
- [ ] Targeted protocol/trust/copy tests。
- [ ] No partial/temp artifacts。
- [ ] No report file accidentally committed unless repo policy expects it。
- [ ] Worktree clean。
- [ ] PR scope matches Story。
- [ ] Sprint row status updated。

## 16. Test Command Matrix

先以仓库实际 scripts 为准；以下命令在 Story MC-000 中校准。

```bash
# Core
bun test
bun run test:coverage
bun run check:type
bun run check:ci

# Targeted existing contracts
bun test tests/hook-contracts.test.ts
bun test tests/hook-runtime.test.ts
bun test tests/hook-protocol.test.ts
bun test tests/hook-shim-trust.test.ts
bun test tests/hook-recursive-copy.test.ts
bun test tests/installed-copy-sync.test.ts

# New
bun test tests/minimal-change-policy.test.ts
bun test tests/minimal-change-context.test.ts
bun test tests/minimal-change-signals.test.ts
bun test tests/minimal-change-protocol.test.ts
bun test tests/minimal-change-performance.test.ts

# Release
bun run check:release
```

Manual smoke template：

```bash
# Verify tuple/order is unchanged
git diff -- src/cli/hook/route-registry.ts

# Verify no new runtime dependency
git diff -- package.json bun.lock

# Verify repo/assets copies
diff -u .ai/hooks/minimal-change-context.sh \
        assets/hooks/minimal-change-context.sh
diff -u .ai/hooks/minimal-change-observer.sh \
        assets/hooks/minimal-change-observer.sh
diff -u .ai/hooks/lib/minimal-change.sh \
        assets/hooks/lib/minimal-change.sh

# Verify report validity
jq . .ai/harness/checks/minimal-change.latest.json

# Verify observer is stdout-silent
# Use the repository's existing hook test fixture/input generator rather than
# inventing a host payload by hand.
```

## 17. Risk Register

| Risk | Impact | Mitigation | Gate |
|---|---|---|---|
| 鼓励 code golf，损害可维护性 | High | protected precedence；advice-only；不以 LOC 单指标 | safety fixtures |
| 安全/验证代码被误判 | Critical | protected concerns；不确定不报；unsafe finding=0 | MC-701 |
| Hook latency | High | bounded path/diff；dynamic import；dedupe；benchmark | MC-702 |
| Prompt/Stop 双 JSON | Critical | 单一 output owner；不增加对应 route script | protocol tests |
| Codex trust 重提示 | High | tuple/order/matcher snapshot 不变 | trust tests |
| `.ai/hooks` 与 `assets/hooks` 漂移 | High | installed-copy/sync tests | MC-601 |
| 并发 report 损坏 | High | atomic rename + lock/fingerprint | concurrency tests |
| 多生态依赖误判 | Medium | Sprint 1 完整支持 package.json；其余保守 | fixture matrix |
| 与 anti-simplification/first-principles 冲突 | High | precedence：correctness/contract > minimal advice | context tests |
| 用户无法关闭 | Medium | policy `mode=off` 快路径 | off regression |
| Migration 覆盖自定义 config/hooks | Critical | preserve/merge；ownership contract | adoption tests |
| report 造成 repo noise | Medium | operational path；遵守现有 ignore policy | docs/packaging |
| 通过路径关键词判断安全不可靠 | High | 关键词只标 `needs_human_review`，不最终分类 | safety review |

## 18. Rollout Plan

### Phase A — Internal dogfood

- [ ] repo-harness self-host 开启 `advice`。
- [ ] 收集 20 sessions / 30 edits / 10 stops。
- [ ] precision `>=80%`。
- [ ] unsafe finding = 0。
- [ ] 关闭 feature 不需改 host adapters。

### Phase B — Packaged default

- [ ] fresh init 显式 opt-in `advice`，post-edit observer 默认关闭。
- [ ] existing explicit config preserved。
- [ ] release notes 提供 `mode=off`。
- [ ] 监控 latency/issue feedback。

### Phase C — Future consideration, not this Sprint

只有以下条件全部满足，才讨论 enforce：

- [ ] 至少两个版本 dogfood。
- [ ] useful precision `>=90%`。
- [ ] unsafe finding 持续为 0。
- [ ] hook overhead 达标。
- [ ] 有明确可逆、可解释 blocking contract。
- [ ] 单独 PRD/Sprint。
- [ ] 默认仍不是 enforce。

## 19. Rejected Alternatives

### A. 直接复制 Ponytail plugin hooks

拒绝原因：

- 重复 host protocol 适配。
- 产生第二份状态文件。
- 破坏 repo-harness central-first/runtime abstraction。
- packaging/migration 复杂度上升。

### B. 新增 `/ponytail` 命令

拒绝原因：

- repo-harness 已有 policy、planning、hook state。
- 命令模式与持久配置容易漂移。
- Sprint 1 只需 repo policy 控制。

### C. 在 PreToolUse/edit 阻断

拒绝原因：

- 编辑前没有 diff 证据。
- 高误报。
- 与现有 plan/worktree gate 叠加噪声。
- 可能阻止安全修复/验证代码。

### D. UserPromptSubmit 增加第二个 script

拒绝原因：

- 两个 script 可能各自输出 host decision。
- 执行顺序与 block short-circuit 复杂。
- 应由现有 prompt guard 统一决策和渲染。

### E. Stop 增加第二个 script

拒绝原因：

- Stop 协议通常只应有一个最终响应。
- 与 stop-orchestrator 的 handoff/plan self-review 冲突。
- 应作为现有 orchestrator 的内部证据步骤。

### F. 每次编辑后运行 AI review

拒绝原因：

- latency、成本、非确定性、并发问题。
- hook 应只收集 objective signals。
- 语义审查由 agent 在 Stop/显式 review 阶段完成。

### G. 以 net-negative LOC 作为 release gate

拒绝原因：

- 小代码不等于正确代码。
- 新功能、安全、测试常需要净新增。
- LOC 只能做观察指标。

## 20. Final Sprint Acceptance Sign-off

### Engineering

- [ ] Scope complete。
- [ ] No public route contract change。
- [ ] No new runtime dependency。
- [ ] No blocking mode。
- [ ] Packaged/repo parity。
- [ ] Tests and performance evidence complete。

### Safety/Correctness Review

- [ ] Validation protected。
- [ ] Security protected。
- [ ] Data integrity protected。
- [ ] Error handling protected。
- [ ] Accessibility protected。
- [ ] Explicit requirements protected。
- [ ] Tests protected。
- [ ] Unsafe finding = 0。

### Release Owner

- [ ] Init/migrate/upgrade/rollback complete。
- [ ] Claude/Codex smoke complete。
- [ ] Docs/changelog complete。
- [ ] Rollback via `mode=off` verified。
- [ ] Release gate complete。

### Sprint Close

- [ ] Sprint status → Done。
- [ ] Active marker cleared/advanced。
- [ ] Contract archived/closed。
- [ ] Worktree finished/cleaned。
- [ ] Handoff refreshed。
- [ ] Follow-up issues filed separately：
  - multi-ecosystem semantic manifest adapters。
  - explicit manual review command/Skill。
  - longitudinal precision telemetry。
  - enforce-mode research。
