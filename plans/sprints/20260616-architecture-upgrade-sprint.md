下面是一份可以直接放进 `plans/sprints/` 的详细 sprint 方案。默认按 **2 周 / 10 个工作日** 设计，核心目标是先做 **Transactional Adoption Planner Foundation**，也就是把当前 `adopt` 的 shell migration 路径逐步转成可审计、可 dry-run、可测试的 TypeScript operation plan。

---

# Sprint：Transactional Adoption Planner Foundation

> **Status**: Done
> **Duration**: 2 weeks / 10 working days
> **Primary Goal**: 为 `repo-harness adopt` 建立 TypeScript 事务型 adoption planner 骨架，不一次性替换全部 shell migration，但先把 dry-run、operation model、JSON plan、测试夹具和后续迁移路径打牢。
> **Primary Owner**: repo-harness maintainer / Codex execution agent
> **Review Mode**: 每个阶段必须有 unit tests + integration smoke + checklist evidence。

## Execution Progress

- 2026-06-16: Phase 1 landed the TypeScript adoption operation model, planner, renderer, `adopt --dry-run --json` CLI branch, safe applicator subset, fixture snapshots, and CLI smoke coverage. Evidence: `bun test tests/cli/adoption-plan.test.ts` passed.
- 2026-06-16: Sprint closeout added architecture/changelog documentation, updated compatibility tests, preserved HOME-target validation on the new JSON dry-run path, and passed `bun test`, `bash scripts/check-ci.sh`, and source-entrypoint `bun src/cli/index.ts adopt --repo . --dry-run --json`.

## 1. 背景与问题

当前代码库已经有清晰的 `init/update/adopt` 边界：`update` 会拒绝 repo-level 参数并提示使用 `adopt`，`adopt` 也拒绝写 user-level 状态的参数。

但 `adopt` 的核心迁移逻辑仍主要由 `scripts/migrate-project-template.sh` 承担。该脚本负责 repo workflow surface、hook、docs、helpers、gitignore、handoff、version stamp、verify 等大量行为。  它还内嵌 Node 片段做 JSON hook merge。

这导致三个长期问题：

1. `--dry-run` 主要是 shell echo，难以作为机器可审计 plan。
2. 写入、备份、回滚、锁、权限等副作用策略分散。
3. migration 行为难以用单元测试覆盖，只能依赖端到端脚本验证。

本 sprint 不试图一次性重写所有 adoption 行为，而是先建立 **operation plan + planner + dry-run JSON + 部分 TS operation applicator** 的基础设施。

---

# 2. Sprint 目标

## 2.1 必须完成

本 sprint 必须交付：

```text
1. 新增 TypeScript adoption operation model
2. 新增 planAdoption(repo, mode) planner 骨架
3. 新增 adopt --dry-run --json 输出 operation plan
4. 新增 operation renderer，human-readable 和 JSON 都可用
5. 新增至少 3 类 operation 的 TS applicator：
   - mkdir
   - writeFile ifMissing
   - appendManagedBlock / ensureGitignoreEntry
6. 把 .gitignore repo-harness managed block 的规划逻辑从 shell 中抽出或双写验证
7. 增加 unit tests + fixture tests + one smoke integration
8. 保持现有 adopt 行为兼容：默认 apply 路径仍可调用旧 shell migration
```

## 2.2 不在本 sprint 内完成

明确不做：

```text
1. 不完全删除 scripts/migrate-project-template.sh
2. 不把所有 hooks/helper/docs migration 一次性迁到 TS
3. 不改变用户默认 adoption 文件集合
4. 不改变 route registry 和 host adapter 行为
5. 不引入 monorepo 或多 package 发布
6. 不重写 prompt guard
```

---

# 3. 成功标准

Sprint 完成后，应满足：

```bash
bun test
bash scripts/check-ci.sh
npx -y repo-harness adopt --dry-run --json
```

其中 `adopt --dry-run --json` 应输出结构化 plan，例如：

```json
{
  "protocol": 1,
  "command": "adopt",
  "repoRoot": "/path/to/repo",
  "mode": "standard",
  "apply": false,
  "operations": [
    {
      "id": "mkdir:.ai/harness/checks",
      "kind": "mkdir",
      "path": ".ai/harness/checks",
      "reason": "Ensure repo-harness check evidence directory exists",
      "risk": "low",
      "status": "planned"
    }
  ],
  "summary": {
    "total": 12,
    "byKind": {
      "mkdir": 6,
      "writeFile": 3,
      "appendManagedBlock": 3
    },
    "userOwnedFilesTouched": 1,
    "generatedFiles": 8
  }
}
```

---

# 4. 建议分支与提交策略

```text
branch: codex/sprint-transactional-adoption-planner
```

建议提交拆分：

```text
1. core adoption operation model
2. adoption planner skeleton and fixtures
3. dry-run JSON renderer
4. TS applicator for safe operation subset
5. integrate adopt command JSON path
6. tests and docs
```

每个提交保持可测试，不把大重构堆在一个 commit。

---

# 5. 文件结构设计

建议新增：

```text
src/core/adoption/
  operations.ts
  plan.ts
  summary.ts
  render.ts
  modes.ts

src/effects/
  fs-transaction.ts
  path-safety.ts
  managed-block.ts

src/cli/commands/adopt-plan.ts

tests/cli/adoption-plan.test.ts
tests/fixtures/adoption/
  empty-repo.expected.json
  existing-gitignore.expected.json
  self-host.expected.json
```

后续 sprint 可继续扩展：

```text
src/core/adoption/
  workflow-contract-plan.ts
  hooks-plan.ts
  docs-plan.ts
  helpers-plan.ts
  legacy-migration-plan.ts
```

---

# 6. 核心类型设计

## 6.1 Operation model

```ts
export type AdoptionRisk = "low" | "medium" | "high";

export type AdoptionOperation =
  | MkdirOperation
  | WriteFileOperation
  | AppendManagedBlockOperation
  | MergeJsonOperation
  | MoveOperation
  | RemoveOperation
  | GitUntrackOperation
  | RunCheckOperation;

export interface BaseOperation {
  readonly id: string;
  readonly kind: string;
  readonly path?: string;
  readonly reason: string;
  readonly risk: AdoptionRisk;
  readonly status: "planned" | "skipped" | "applied" | "failed";
}

export interface MkdirOperation extends BaseOperation {
  readonly kind: "mkdir";
  readonly path: string;
}

export interface WriteFileOperation extends BaseOperation {
  readonly kind: "writeFile";
  readonly path: string;
  readonly content: string;
  readonly ifMissing?: boolean;
  readonly mode?: number;
}

export interface AppendManagedBlockOperation extends BaseOperation {
  readonly kind: "appendManagedBlock";
  readonly path: string;
  readonly marker: string;
  readonly content: string;
}
```

## 6.2 Adoption plan

```ts
export interface AdoptionPlan {
  readonly protocol: 1;
  readonly command: "adopt";
  readonly repoRoot: string;
  readonly mode: "minimal" | "standard" | "self-host";
  readonly apply: boolean;
  readonly operations: AdoptionOperation[];
  readonly summary: AdoptionPlanSummary;
  readonly warnings: AdoptionWarning[];
}
```

## 6.3 Summary

```ts
export interface AdoptionPlanSummary {
  readonly total: number;
  readonly byKind: Record<string, number>;
  readonly userOwnedFilesTouched: number;
  readonly generatedFiles: number;
  readonly repoHarnessOwnedFiles: number;
  readonly requiresVerification: boolean;
}
```

---

# 7. Sprint backlog

## Epic A：Adoption operation model

### Task A1：定义 operation 类型

**目标**：建立 adoption planner 的数据模型，不接入 CLI。

**文件**：

```text
src/core/adoption/operations.ts
src/core/adoption/modes.ts
src/core/adoption/summary.ts
```

**Checklist**：

```text
[ ] 定义 AdoptionOperation union
[ ] 定义 BaseOperation
[ ] 定义 MkdirOperation
[ ] 定义 WriteFileOperation
[ ] 定义 AppendManagedBlockOperation
[ ] 预留 MergeJsonOperation / MoveOperation / RemoveOperation / GitUntrackOperation / RunCheckOperation
[ ] 定义 AdoptionMode = minimal | standard | self-host
[ ] 定义 AdoptionPlanSummary
[ ] 添加 operation id 生成 helper
[ ] 添加 summarizeOperations()
[ ] 添加 unit tests
```

**验收标准**：

```text
[ ] bun test tests/cli/adoption-plan.test.ts 通过
[ ] summarizeOperations 能正确统计 byKind
[ ] operation id 稳定，不依赖 Date.now()
```

---

## Epic B：Planner skeleton

### Task B1：实现 planAdoption 基础骨架

**目标**：根据 repoRoot 和 mode 生成基础 operation list。

**文件**：

```text
src/core/adoption/plan.ts
```

**第一阶段 operation 范围**：

```text
mkdir:
  plans/
  plans/archive/
  plans/prds/
  plans/sprints/
  tasks/
  tasks/contracts/
  tasks/reviews/
  tasks/notes/
  tasks/workstreams/
  docs/
  docs/reference-configs/
  .ai/context/
  .ai/harness/checks/
  .ai/harness/handoff/
  .ai/harness/failures/
  .ai/harness/architecture/
  .ai/harness/runs/

writeFile ifMissing:
  docs/spec.md
  tasks/todos.md
  tasks/current.md
  tasks/lessons.md

appendManagedBlock:
  .gitignore repo-harness runtime/generated block
```

这些目录和文件对应当前 shell migration 已经在创建的 repo workflow surface。

**Checklist**：

```text
[ ] 实现 planAdoption({ repoRoot, mode, apply })
[ ] minimal 模式只生成 core surface
[ ] standard 模式生成 architecture/workstream/context surface
[ ] self-host 模式预留 hook/helper pin warning，不实际迁移 hooks
[ ] docs/spec.md 使用 deterministic template
[ ] tasks/todos.md 使用 deterministic template
[ ] tasks/current.md 使用 deterministic template
[ ] tasks/lessons.md 使用 deterministic template
[ ] .gitignore block operation 使用 managed marker
[ ] 所有 paths 必须是 repo-relative path
[ ] 禁止生成 absolute path operation，repoRoot 只存在 plan header
```

**验收标准**：

```text
[ ] empty repo fixture 输出稳定
[ ] existing files 不会被 writeFile ifMissing 覆盖
[ ] minimal/standard/self-host 三种 mode 的 operation 数不同且符合预期
```

---

## Epic C：Renderer 与 dry-run JSON

### Task C1：实现 JSON renderer

**目标**：支持 `adopt --dry-run --json` 输出 operation plan。

**文件**：

```text
src/core/adoption/render.ts
src/cli/commands/adopt-plan.ts
src/cli/index.ts
```

当前 `adopt` 命令已经支持 `--dry-run` 和 `--json`。 本任务是在 `rawOpts.dryRun === true && rawOpts.json === true` 时优先输出 TS planner 的 plan；apply 路径仍保持旧行为。

**Checklist**：

```text
[ ] renderAdoptionPlanJson(plan)
[ ] renderAdoptionPlanText(plan)
[ ] index.ts adopt command 接入 dry-run JSON path
[ ] 保持 adopt apply 仍走 runInit/common + shell migration
[ ] dry-run text 暂时可以继续旧行为，避免用户体验突变
[ ] JSON 输出不包含大段 file content，默认 content 可 redacted 或 contentHash
[ ] 增加 --json snapshot test
```

**建议 JSON content 策略**：

默认不要把完整模板内容全部塞进 stdout，避免输出过大：

```json
{
  "kind": "writeFile",
  "path": "docs/spec.md",
  "contentHash": "sha256:...",
  "contentPreview": "# Product Spec: repo-name\n\n> **Status**: Draft"
}
```

**验收标准**：

```text
[ ] repo-harness adopt --dry-run --json 输出合法 JSON
[ ] JSON schema 稳定，有 protocol: 1
[ ] 不执行 shell migration
[ ] 不写 repo 文件
```

---

## Epic D：Safe applicator subset

### Task D1：实现只支持安全 operation 的 applicator

**目标**：为后续替换 shell migration 铺路。本 sprint 不默认启用完整 TS apply，但要有可测试 applicator。

**文件**：

```text
src/effects/fs-transaction.ts
src/effects/path-safety.ts
src/effects/managed-block.ts
```

支持：

```text
mkdir
writeFile ifMissing
appendManagedBlock
```

**Checklist**：

```text
[ ] ensureRepoRelativePath，拒绝 absolute path
[ ] resolveInsideRepo，拒绝 path traversal
[ ] applyMkdirOperation
[ ] applyWriteFileIfMissingOperation
[ ] applyAppendManagedBlockOperation
[ ] managed block begin/end marker
[ ] dry-run mode 不写文件
[ ] apply mode 写文件
[ ] 失败时返回结构化 error，不直接 process.exit
[ ] 写入使用现有 atomic writer 或新 writer wrapper
```

**验收标准**：

```text
[ ] path traversal 测试通过：../evil 被拒绝
[ ] absolute path 被拒绝
[ ] appendManagedBlock 幂等：重复 apply 不重复写
[ ] writeFile ifMissing 不覆盖用户已有文件
```

---

## Epic E：Gitignore managed block 迁移第一步

### Task E1：将 `.gitignore` 规划逻辑从 shell 抽出

当前 shell migration 会确保 `.gitignore` 存在，并添加 `_ref/`、`.codegraph/`、`_ops/`、`.env`、`.DS_Store` 等 entries，还会同步 runtime ignore block。

本 sprint 先做 TypeScript planner 版本：

```text
# BEGIN: repo-harness generated-runtime
...
# END: repo-harness generated-runtime
```

**Checklist**：

```text
[ ] 定义 repo-harness gitignore managed block marker
[ ] planner 输出 appendManagedBlock operation
[ ] applicator 能插入 block
[ ] 已存在 block 时替换 block
[ ] 没有 .gitignore 时创建
[ ] 不删除用户自定义内容
[ ] 增加 fixture：empty .gitignore
[ ] 增加 fixture：existing .gitignore with user content
[ ] 增加 fixture：existing managed block update
```

**验收标准**：

```text
[ ] 三个 fixture 都通过
[ ] 重复 apply 没有 diff
[ ] 用户内容保留
```

---

## Epic F：Testing 与 CI

### Task F1：增加 adoption planner 单测

**文件**：

```text
tests/cli/adoption-plan.test.ts
tests/fixtures/adoption/*.json
```

**Checklist**：

```text
[ ] planAdoption empty repo snapshot
[ ] planAdoption minimal mode snapshot
[ ] planAdoption standard mode snapshot
[ ] planAdoption self-host mode snapshot
[ ] summarizeOperations unit test
[ ] path-safety unit test
[ ] managed block idempotency test
[ ] adopt --dry-run --json spawn smoke test
```

### Task F2：将测试接入 CI

当前 `check-ci.sh` 已经运行 `bun test`、workflow checks、migration dry-run、`npm pack --dry-run`。 因此只要新测试进入 `bun test` 默认范围即可。

**Checklist**：

```text
[ ] 新测试默认被 bun test 收录
[ ] scripts/check-ci.sh 无需特殊 casing
[ ] package dry-run 仍通过
[ ] 没有产生未跟踪 fixture 之外的临时文件
```

---

## Epic G：Docs 与 handoff

### Task G1：新增开发文档

**建议文件**：

```text
docs/architecture/transactional-adoption-planner.md
```

**内容必须包括**：

```text
[ ] 为什么引入 operation plan
[ ] protocol: 1 JSON schema
[ ] supported operation kinds
[ ] 本 sprint 只支持 safe subset
[ ] 旧 shell migration 兼容策略
[ ] 后续迁移路线
```

### Task G2：更新 changelog / task notes

**建议文件**：

```text
docs/CHANGELOG.md
tasks/notes/transactional-adoption-planner.notes.md
```

**Checklist**：

```text
[ ] 记录 dry-run JSON 新能力
[ ] 记录 apply 路径仍兼容旧 shell
[ ] 记录 known limitations
[ ] 记录下一 sprint 推荐任务
```

---

# 8. Day-by-day 执行计划

## Day 1：建模

```text
[ ] 创建 src/core/adoption/*
[ ] 定义 AdoptionOperation / AdoptionPlan / Summary 类型
[ ] 写 summarizeOperations()
[ ] 写基础 unit tests
[ ] 跑 bun test
```

输出物：

```text
src/core/adoption/operations.ts
src/core/adoption/summary.ts
tests/cli/adoption-plan.test.ts
```

---

## Day 2：Planner skeleton

```text
[ ] 实现 planAdoption()
[ ] 生成 mkdir operations
[ ] 生成 writeFile ifMissing operations
[ ] 生成 .gitignore appendManagedBlock operation
[ ] 添加 minimal/standard/self-host mode 差异
[ ] 增加 snapshot fixtures
```

输出物：

```text
src/core/adoption/plan.ts
tests/fixtures/adoption/*.json
```

---

## Day 3：Renderer

```text
[ ] renderAdoptionPlanJson()
[ ] renderAdoptionPlanText()
[ ] contentHash / contentPreview 策略
[ ] protocol: 1 固定
[ ] JSON schema snapshot
```

输出物：

```text
src/core/adoption/render.ts
```

---

## Day 4：CLI 接入

```text
[ ] 在 adopt --dry-run --json 时调用 planAdoption()
[ ] 保持 apply 路径不变
[ ] 保持 dry-run text 路径暂时兼容旧输出
[ ] 增加 spawn smoke test
[ ] 验证 repo-harness adopt --dry-run --json 不写文件
```

输出物：

```text
src/cli/commands/adopt-plan.ts
src/cli/index.ts
```

---

## Day 5：Applicator safe subset

```text
[ ] 实现 path safety
[ ] 实现 applyMkdir
[ ] 实现 applyWriteFileIfMissing
[ ] 实现 applyAppendManagedBlock
[ ] 添加 idempotency tests
[ ] 添加 traversal tests
```

输出物：

```text
src/effects/path-safety.ts
src/effects/fs-transaction.ts
src/effects/managed-block.ts
```

---

## Day 6：Gitignore managed block

```text
[ ] 定义 gitignore block marker
[ ] planner 输出 stable gitignore block
[ ] applicator 写入 / 替换 block
[ ] fixture：empty
[ ] fixture：existing user content
[ ] fixture：existing old managed block
```

输出物：

```text
src/core/adoption/gitignore-plan.ts
tests/fixtures/adoption/gitignore-*.json
```

---

## Day 7：Compatibility verification

```text
[ ] 跑旧 adopt dry-run
[ ] 跑新 adopt --dry-run --json
[ ] 对比核心 surface 是否一致
[ ] 确认 apply 路径仍旧调用现有 migration
[ ] 确认 scripts/check-ci.sh 通过
```

输出物：

```text
comparison notes in tasks/notes/transactional-adoption-planner.notes.md
```

---

## Day 8：Docs

```text
[ ] 写 architecture doc
[ ] 写 JSON protocol 示例
[ ] 写 limitations
[ ] 写 next sprint migration candidates
[ ] 更新 changelog
```

输出物：

```text
docs/architecture/transactional-adoption-planner.md
docs/CHANGELOG.md
```

---

## Day 9：Hardening

```text
[ ] 清理命名
[ ] 检查 operation id 稳定性
[ ] 检查 JSON 输出不泄漏绝对 HOME
[ ] 检查 no Date.now in snapshots
[ ] 检查所有 tests 幂等
[ ] 跑 bun test
[ ] 跑 bash scripts/check-ci.sh
```

---

## Day 10：Review package

```text
[ ] 整理 PR 描述
[ ] 记录测试证据
[ ] 记录未完成项
[ ] 标记 next sprint backlog
[ ] 准备 review checklist
```

---

# 9. Definition of Done

本 sprint 完成必须满足：

```text
[ ] bun test 通过
[ ] bash scripts/check-ci.sh 通过
[ ] repo-harness adopt --dry-run --json 输出 protocol: 1 JSON
[ ] dry-run JSON 不写任何 repo/user 文件
[ ] apply 默认行为不破坏旧 shell migration
[ ] operation plan 有稳定 snapshot tests
[ ] .gitignore managed block applicator 幂等
[ ] path traversal / absolute path 被拒绝
[ ] docs/architecture/transactional-adoption-planner.md 已更新
[ ] docs/CHANGELOG.md 已记录
[ ] tasks/notes/* 记录执行证据和后续事项
```

---

# 10. Review checklist

## 10.1 架构 review

```text
[ ] Core adoption model 不依赖 fs/process/path 的副作用
[ ] Effects 层集中处理 path safety 和写入
[ ] CLI 层只负责参数解析和 renderer 选择
[ ] JSON protocol 明确版本号
[ ] 后续 operation kinds 可扩展
```

## 10.2 行为兼容 review

```text
[ ] adopt apply 仍保持原行为
[ ] adopt --dry-run text 没有意外大改
[ ] adopt --dry-run --json 是新增能力
[ ] update/init/adopt 的 user-level/repo-level 边界不变
[ ] 不改变 hook runtime route registry
```

## 10.3 安全 review

```text
[ ] operation path 必须 repo-relative
[ ] absolute path operation 被拒绝
[ ] ../ traversal 被拒绝
[ ] writeFile ifMissing 不覆盖用户文件
[ ] appendManagedBlock 不删除用户内容
[ ] JSON 输出不包含敏感 HOME 配置内容
```

## 10.4 测试 review

```text
[ ] plan snapshots 稳定
[ ] tests 不依赖当前时间
[ ] tests 不依赖本机 HOME
[ ] smoke test 用 temp repo
[ ] failed applicator 返回 structured error
```

---

# 11. PR 描述模板

```md
## Summary

Introduces the first TypeScript adoption planner foundation for `repo-harness adopt`.

This PR adds:

- adoption operation model
- adoption plan summary
- `adopt --dry-run --json` protocol v1
- safe operation applicator subset
- managed `.gitignore` block planner/applicator
- fixture-based tests

Apply behavior remains compatible with the existing shell migration path.

## Motivation

`adopt` is still powered by a large shell migration script. This PR starts moving adoption toward a structured, testable, auditable operation plan without changing default apply behavior.

## Behavior

- `repo-harness adopt --dry-run --json` prints a structured operation plan.
- `repo-harness adopt` still uses the existing migration path.
- No user-level files are written by the new dry-run path.

## Tests

- [ ] bun test
- [ ] bash scripts/check-ci.sh
- [ ] manual smoke: repo-harness adopt --dry-run --json in temp repo

## Risk

Low-medium. New JSON dry-run path is additive. Existing apply path is preserved.
```

---

# 12. 下一 sprint 预留 backlog

本 sprint 结束后，下一 sprint 可以继续做：

```text
[ ] 把 workflow-contract install 从 shell 迁到 TS operation
[ ] 把 docs/spec.md / tasks/current.md templates 改成 manifest-driven
[ ] 把 helper wrapper install 迁到 TS operation
[ ] 引入 atomic writer with backup / lock / fsync
[ ] 让 adopt --dry-run text 也使用 TS planner renderer
[ ] 让 adopt apply 可选启用 TS applicator：--experimental-ts-apply
[ ] 给 operation plan 增加 rollback metadata
```

推荐下一 sprint 名称：

```text
Sprint：Transactional Adoption Applicator + Workflow Contract Migration
```

---

# 13. 最小可执行 checklist

可以把这段直接放到 `tasks/contracts/*.contract.md`：

```text
## Implementation Checklist

### Core model
- [ ] Add AdoptionOperation union
- [ ] Add AdoptionPlan
- [ ] Add AdoptionPlanSummary
- [ ] Add summarizeOperations()
- [ ] Add stable operation id helper

### Planner
- [ ] Add planAdoption()
- [ ] Add minimal mode plan
- [ ] Add standard mode plan
- [ ] Add self-host mode warnings
- [ ] Add writeFile ifMissing operations
- [ ] Add .gitignore managed block operation

### Renderer
- [ ] Add JSON renderer with protocol: 1
- [ ] Add text renderer
- [ ] Redact large content with hash/preview
- [ ] Add fixture snapshot tests

### CLI
- [ ] Wire adopt --dry-run --json to TS planner
- [ ] Keep adopt apply path unchanged
- [ ] Add smoke test for CLI JSON output

### Effects
- [ ] Add repo-relative path safety
- [ ] Add mkdir applicator
- [ ] Add writeFile ifMissing applicator
- [ ] Add appendManagedBlock applicator
- [ ] Add idempotency tests
- [ ] Add path traversal rejection tests

### Docs
- [ ] Add architecture doc
- [ ] Update changelog
- [ ] Add task notes with evidence

### Verification
- [ ] bun test
- [ ] bash scripts/check-ci.sh
- [ ] Manual temp repo dry-run JSON smoke
```

这份 sprint 的关键策略是：**先让 `adopt` 产生可信 operation plan，再逐步替换 shell apply。** 这样不会冒险大改现有用户路径，同时能快速建立后续架构重构的稳定地基。
